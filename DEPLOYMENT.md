# Deploying CampusConnect on AWS Lightsail

This guide takes the application from this repository to a public HTTPS site on
**one** Lightsail server, with **Neo4j AuraDB Free** as the database. It assumes
no prior AWS experience.

Nothing in this repository creates cloud resources or spends money. Every step
below is something you run yourself in the AWS console and on the server.

> **What was verified locally vs. what needs the cloud**
> Installation, type-checking, the full test suite and both production builds
> were executed on the development machine. The Lightsail / Nginx / Certbot /
> AuraDB steps below were **not** executed here, because no AWS or AuraDB
> credentials were available. They are written to match the files in `deploy/`
> and to be run in this order.

---

## 0. What you will end up with

```
Browser ──HTTPS──> Nginx :443
                    ├── /            -> /var/www/campusconnect (built React app)
                    └── /api/...     -> 127.0.0.1:4000 (Express, systemd)
                                              └── Bolt (neo4j+s://) -> Neo4j AuraDB Free
```

- One server, one Node process, one database.
- The API binds to `127.0.0.1` in production, so port 4000 is never reachable
  from the internet even if the firewall is wrong.
- Neo4j is remote (AuraDB); no database port is opened on the server.
- Approximate cost: the $7 Lightsail plan + free AuraDB + free DuckDNS + free
  Let's Encrypt.

---

## 1. Create the Neo4j AuraDB Free instance

1. Sign in at <https://console.neo4j.io> and choose **New instance → AuraDB Free**.
2. Pick the region closest to your Lightsail region.
3. Copy the credentials immediately — the password is shown once:
   - URI, shaped like `neo4j+s://xxxxxxxx.databases.neo4j.io`
   - Username (usually `neo4j`)
   - Password
4. Leave the instance running.

**AuraDB Free limitations to know before a demo:**

- It **pauses after inactivity** (roughly three days idle). The first request
  after a pause can take 30–60 seconds while it resumes.
- No automated backups, no uptime guarantee.
- One database per instance, so the integration tests (which create and wipe
  their own database) are meant for a local Neo4j, not for AuraDB Free.

Wake the instance before a demo by opening Neo4j Browser, or by running
`npm run db:check` on the server a few minutes beforehand.

---

## 2. Create the Lightsail server

1. AWS console → **Lightsail → Instances → Create instance**.
2. Same region as AuraDB.
3. Platform **Linux/Unix**, blueprint **OS only → Ubuntu 24.04 LTS**.
4. Plan: the **$7/month** Linux plan (1 GB RAM). The $5 / 512 MB plan is too
   small to build and run on the same machine.
5. Name it `campusconnect`.
6. **Networking → Create static IP**, attach it to the instance. Without this
   the public IP changes on every reboot.
7. **Networking → IPv4 Firewall** should allow exactly: SSH 22 (ideally limited
   to your own IP), HTTP 80, HTTPS 443. Nothing else.

Connect:

```bash
chmod 600 ~/Downloads/LightsailDefaultKey-*.pem
ssh -i ~/Downloads/LightsailDefaultKey-*.pem ubuntu@<STATIC_IP>
```

---

## 3. Point a free subdomain at the server

1. Create an account at <https://www.duckdns.org> and add a subdomain, e.g.
   `campusconnect`.
2. Set its **current ip** to the Lightsail static IP and save.
3. Confirm it resolves **before** continuing — Certbot will fail otherwise:

```bash
nslookup campusconnect.duckdns.org
```

---

## 4. Install the server software

Run on the server as `ubuntu`:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx git curl certbot

# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

node --version   # v20.x
nginx -v         # nginx/1.24.x on Ubuntu 24.04
```

The Nginx configuration in `deploy/` is written for the packaged Nginx 1.18
(Ubuntu 22.04) and 1.24 (Ubuntu 24.04). It deliberately uses
`listen 443 ssl http2;` rather than the newer `http2 on;` directive, which only
exists in Nginx 1.25.1 and later.

Create the service account and directories:

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin campusconnect
sudo mkdir -p /opt/campusconnect /var/www/campusconnect /var/www/certbot
sudo chown -R ubuntu:ubuntu /opt/campusconnect
```

---

## 5. Get the code and build it

Still as `ubuntu`:

```bash
cd /opt/campusconnect
git clone <YOUR_REPOSITORY_URL> .

# Installs exactly what package-lock.json pins, including the Linux binaries for
# esbuild and Rollup that Vite needs.
npm ci

# Builds the frontend into apps/web/dist and the API into apps/api/dist.
npm run build
```

Copy the built frontend where Nginx serves it:

```bash
sudo rm -rf /var/www/campusconnect
sudo mkdir -p /var/www/campusconnect
sudo cp -r apps/web/dist/. /var/www/campusconnect/
sudo chown -R www-data:www-data /var/www/campusconnect
```

Sanity check that both builds produced output:

```bash
ls apps/web/dist/index.html apps/api/dist/index.js
```

---

## 6. Configure the environment

```bash
cd /opt/campusconnect
cp .env.example .env
nano .env
```

Set these **production** values — the API validates them at startup and exits
with a clear message if any is missing or unsafe:

```ini
NODE_ENV=production
PORT=4000
WEB_ORIGIN=https://campusconnect.duckdns.org

NEO4J_URI=neo4j+s://xxxxxxxx.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=<the AuraDB password>
NEO4J_DATABASE=neo4j

SESSION_SECRET=<48+ random characters>
SESSION_COOKIE_NAME=cc.sid
SESSION_TTL_HOURS=168

COOKIE_SECURE=true
TRUST_PROXY=true
```

Generate the session secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Notes:

- `WEB_ORIGIN` must be `https://` and must **not** have a trailing slash (the
  API strips one if present, but keep it clean).
- Leave `HOST` unset. In production the API binds to `127.0.0.1` automatically,
  so only Nginx can reach it.
- `.env` must contain `NODE_ENV=production`. The systemd unit also sets it, but
  values in `.env` take precedence.

---

## 7. Hand ownership to the service account

Everything from here on runs as `campusconnect`, so the service and the CLI
share one owner and there are no permission surprises:

```bash
sudo chown -R campusconnect:campusconnect /opt/campusconnect
sudo chmod 600 /opt/campusconnect/.env
```

---

## 8. Create the schema and the first college

```bash
sudo -u campusconnect -H bash -c 'cd /opt/campusconnect && npm run db:init'
```

That creates constraints and indexes only — no business data.

```bash
sudo -u campusconnect -H bash -c 'cd /opt/campusconnect && npm run admin:bootstrap'
```

Prompts for a college name, a unique college slug, and the administrator's
email, name and password. Run it again, with different details, for **each
additional college**. There is no public endpoint for this on purpose.

Verify:

```bash
sudo -u campusconnect -H bash -c 'cd /opt/campusconnect && npm run db:check'
```

You should see one college, one administrator, zero students.

---

## 9. Start the API as a service

```bash
sudo cp deploy/systemd/campusconnect-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now campusconnect-api
sudo systemctl status campusconnect-api --no-pager
```

Logs:

```bash
journalctl -u campusconnect-api -f
```

Confirm the process is listening on loopback only:

```bash
ss -lntp | grep 4000     # expect 127.0.0.1:4000, not 0.0.0.0
curl -s localhost:4000/api/health/live     # {"status":"ok",...}
curl -s localhost:4000/api/health/ready    # {"status":"ok","database":"up",...}
```

If `/api/health/ready` returns `503`, the API is up but Neo4j is unreachable —
check the Aura URI, the password, and whether the instance is awake.

---

## 10. Nginx stage 1 — plain HTTP

This stage has no certificate paths, so `nginx -t` passes before any
certificate exists. It also serves the site over HTTP, which is what Certbot
needs to verify the domain.

```bash
sudo cp deploy/nginx/campusconnect-http.conf /etc/nginx/sites-available/campusconnect
sudo sed -i 's/campusconnect\.duckdns\.org/YOUR-SUBDOMAIN.duckdns.org/g' /etc/nginx/sites-available/campusconnect
sudo ln -sf /etc/nginx/sites-available/campusconnect /etc/nginx/sites-enabled/campusconnect
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

Test over plain HTTP:

```bash
curl -I http://YOUR-SUBDOMAIN.duckdns.org
curl -s http://YOUR-SUBDOMAIN.duckdns.org/api/health/ready
```

The page should load (no certificate warning yet, because it is HTTP).

---

## 11. Obtain the certificate

Use the webroot method. It writes the challenge file into `/var/www/certbot`,
which stage 1 already serves at `/.well-known/acme-challenge/`.

```bash
sudo certbot certonly --webroot \
  -w /var/www/certbot \
  -d YOUR-SUBDOMAIN.duckdns.org \
  --agree-tos -m you@example.com --no-eff-email
```

Success looks like:

```
Successfully received certificate.
Certificate is saved at: /etc/letsencrypt/live/YOUR-SUBDOMAIN/fullchain.pem
```

Check that the files exist **before** touching the Nginx config:

```bash
sudo ls /etc/letsencrypt/live/YOUR-SUBDOMAIN.duckdns.org/
```

---

## 12. Nginx stage 2 — HTTPS

Now that the certificate exists, replace the configuration with the TLS one:

```bash
sudo cp deploy/nginx/campusconnect.conf /etc/nginx/sites-available/campusconnect
sudo sed -i 's/campusconnect\.duckdns\.org/YOUR-SUBDOMAIN.duckdns.org/g' /etc/nginx/sites-available/campusconnect
sudo nginx -t
sudo systemctl reload nginx
```

Verify:

```bash
curl -I https://YOUR-SUBDOMAIN.duckdns.org          # 200, valid certificate
curl -I http://YOUR-SUBDOMAIN.duckdns.org           # 301 -> https
curl -s https://YOUR-SUBDOMAIN.duckdns.org/api/health/ready
```

The stage-2 file keeps the `/.well-known/acme-challenge/` location in the port
80 block on purpose. Removing it would break `certbot renew` in 90 days.

Confirm renewal is wired up:

```bash
systemctl list-timers | grep certbot
sudo certbot renew --dry-run
```

---

## 13. Verification checklist

Work through this on the public URL:

- [ ] `https://<domain>/` loads the landing page with a valid certificate.
- [ ] `http://<domain>/` redirects to `https://`.
- [ ] `https://<domain>/api/health/ready` returns `{"status":"ok","database":"up"}`.
- [ ] A deep link such as `https://<domain>/login` loads the app (not a 404).
- [ ] Sign in as the administrator created in step 8.
- [ ] Add two or three skills in **Skill catalogue**.
- [ ] Register a student in a private window; the college appears in the dropdown.
- [ ] Register a recruiter; the dashboard shows "waiting for college approval"
      and hiring-request buttons are disabled.
- [ ] Approve the recruiter, submit a request, approve it, evaluate students,
      dispatch, and confirm the student receives the notification.
- [ ] Reload while signed in — the session survives (cookie-based).
- [ ] Sign out; `/admin` redirects to the sign-in page.
- [ ] `ss -lntp | grep 4000` shows `127.0.0.1:4000`, not `0.0.0.0`.
- [ ] `npm run admin:bootstrap` for a second college works, and the first
      college's administrator cannot see any of its students.

---

## 14. Updating the application

```bash
sudo -u campusconnect -H bash -c 'cd /opt/campusconnect && git pull'
sudo -u campusconnect -H bash -c 'cd /opt/campusconnect && npm ci && npm run build'

sudo rm -rf /var/www/campusconnect
sudo mkdir -p /var/www/campusconnect
sudo cp -r /opt/campusconnect/apps/web/dist/. /var/www/campusconnect/
sudo chown -R www-data:www-data /var/www/campusconnect

sudo systemctl restart campusconnect-api
curl -s localhost:4000/api/health/ready
```

Schema changes are applied with `npm run db:init`, which only creates missing
constraints and indexes — it never deletes data.

### Rollback

```bash
sudo -u campusconnect -H bash -c 'cd /opt/campusconnect && git log --oneline -5'
sudo -u campusconnect -H bash -c 'cd /opt/campusconnect && git checkout <previous-commit>'
sudo -u campusconnect -H bash -c 'cd /opt/campusconnect && npm ci && npm run build'
sudo rm -rf /var/www/campusconnect
sudo mkdir -p /var/www/campusconnect
sudo cp -r /opt/campusconnect/apps/web/dist/. /var/www/campusconnect/
sudo chown -R www-data:www-data /var/www/campusconnect
sudo systemctl restart campusconnect-api
```

AuraDB Free keeps no backups. Export anything you care about before a risky
change.

### Restart / stop

```bash
sudo systemctl restart campusconnect-api
sudo systemctl stop campusconnect-api
sudo systemctl start campusconnect-api
```

---

## 15. Operating notes

| Concern | Behaviour |
| --- | --- |
| Database down | `/api/health/live` still returns 200; `/api/health/ready` returns 503. The process does not crash-loop. |
| AuraDB pause | First request after a pause can take 30–60 s. Wake it before a demo. |
| Sessions | Stored in Neo4j, so they survive an API restart. They are lost if the database is wiped. |
| Logs | `journalctl -u campusconnect-api` (API), `/var/log/nginx/` (web). |
| Secrets | Only in `/opt/campusconnect/.env`, mode 600, owned by `campusconnect`. Never in git, never in the frontend bundle. |
| Email / SMS | Not implemented. Notifications are in-app only. |

---

## 16. Troubleshooting

**`502 Bad Gateway` on `/api`**
The API is not listening on `127.0.0.1:4000`. Check
`systemctl status campusconnect-api` and
`journalctl -u campusconnect-api -n 50`. The usual cause is an invalid `.env`
(production validation) or an unreachable AuraDB instance.

**The API exits immediately after `systemctl start`**
Run it in the foreground to see the validation message:

```bash
sudo -u campusconnect -H bash -c 'cd /opt/campusconnect && NODE_ENV=production node apps/api/dist/index.js'
```

It prints exactly which variable is missing or unsafe.

**`/api/health/ready` returns 503**
Neo4j is unreachable. Confirm the URI starts with `neo4j+s://`, the password is
current, and the Aura instance is running. Test with `npm run db:check`.

**`npm ci` fails, or `npm run build` reports `Cannot find module @rollup/rollup-linux-x64-gnu`**
The lockfile is missing the Linux Rollup binary (this happens when a lockfile is
generated only on Windows). The committed lockfile includes Linux, macOS and
Windows entries, so a fresh clone works. If you regenerated the lockfile on
Windows and broke it, restore it from git:

```bash
git checkout -- package-lock.json
```

or install the missing binary once:

```bash
npm install
```

**Signed in, then immediately signed out**
`WEB_ORIGIN` does not match the browser origin exactly, or `COOKIE_SECURE=true`
while browsing over plain HTTP. Both must agree with how you actually reach the
site.

**CSRF errors on every form submit**
`TRUST_PROXY` is not enabled, so the API cannot tell it is behind HTTPS. Set
`TRUST_PROXY=true` and restart.

**`nginx -t` fails with `unknown directive "http2"`**
You are running Nginx older than 1.25.1 with the `http2 on;` syntax. The
committed configuration uses `listen 443 ssl http2;`, which works on 1.18–1.24.
Make sure you copied the file from `deploy/nginx/` rather than an older copy.

**`nginx -t` fails with `cannot load certificate`**
You are installing stage 2 before Certbot has issued the certificate. Do
step 10, then 11, then 12.

**Certbot fails validation**
DuckDNS is not pointing at the static IP yet, or port 80 is closed in the
Lightsail firewall. Both must be correct before `certbot certonly` runs.

**"No college is accepting registrations yet" on the registration page**
No college exists. Run `npm run admin:bootstrap` (step 8).
