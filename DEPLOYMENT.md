# Deploying CampusConnect on AWS Lightsail

This guide takes the application from this repository to a public HTTPS site on
**one** Lightsail server with **Neo4j AuraDB Free** as the database. It assumes
no prior AWS experience.

Nothing in this repository creates cloud resources or spends money. Every step
below is something you run yourself in the AWS console and on the server.

> **What was verified locally vs. what needs the cloud**
> The build, tests and local end-to-end flow were executed on the development
> machine. The Lightsail/Nginx/Certbot/AuraDB steps below were **not** executed
> here because no AWS or AuraDB credentials were available. Treat them as a
> checklist to follow, not as a report of a completed deployment.

---

## 0. What you will end up with

```
Browser ──HTTPS──> Nginx :443
                    ├── /            -> /var/www/campusconnect (built React app)
                    └── /api/...     -> 127.0.0.1:4000 (Express, systemd)
                                              └── Bolt (neo4j+s://) -> Neo4j AuraDB Free
```

- One server, one Node process, one database.
- No load balancer, no container orchestration, no paid frontend hosting.
- Approximate monthly cost: the $7 Lightsail plan + a free AuraDB instance +
  a free DuckDNS subdomain + free Let's Encrypt certificates.

---

## 1. Create the Neo4j AuraDB Free instance

1. Sign in at <https://console.neo4j.io> and choose **New instance → AuraDB Free**.
2. Pick a region close to your Lightsail region (e.g. both in `us-east-1` or
   both in `eu-west-1`). Cross-region latency is the most common cause of a
   "slow" demo.
3. When the credentials are shown, copy **three** things immediately — the
   password is shown only once:
   - Connection URI, which looks like `neo4j+s://xxxxxxxx.databases.neo4j.io`
   - Username (usually `neo4j`)
   - Password
4. Save the `.txt` credentials file Aura offers to download.
5. Leave the instance running. The first connection may take ~30 seconds while
   it resumes.

**AuraDB Free limitations to know before a demo:**

- It **pauses after inactivity** (roughly three days idle). The first request
  after a pause can take 30–60 seconds while it resumes, and a request that
  arrives during resume may fail with a connection error.
- No automated backups and no uptime guarantee.
- One database per instance; you cannot create a separate test database. That
  means `npm run db:test-setup` and the DB-backed integration tests are meant
  for a local Neo4j, not for AuraDB Free.

Wake the instance up before a demo by opening Neo4j Browser (or running
`npm run db:check` from the server) a few minutes beforehand.

---

## 2. Create the Lightsail server

1. In the AWS console go to **Lightsail → Instances → Create instance**.
2. Region: the same region as your AuraDB instance.
3. Platform: **Linux/Unix**, blueprint: **OS only → Ubuntu 24.04 LTS**.
4. Instance plan: the **$7/month** Linux plan (1 GB RAM, 2 vCPU, 40 GB SSD).
   The $5 plan with 512 MB is tight once Node, Nginx and the build run on the
   same machine.
5. Name it `campusconnect` and create it.
6. **Networking → Create static IP**, then attach it to the instance. Without a
   static IP the public address changes whenever the instance reboots.
7. **Networking → IPv4 Firewall** should allow exactly:
   - SSH 22 (restrict to your own IP if possible)
   - HTTP 80
   - HTTPS 443
8. Download the SSH key from **Account → SSH keys** if you have not already.

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
3. Check it resolves before continuing:

```bash
nslookup campusconnect.duckdns.org
```

Certbot needs this to work — it verifies domain ownership over HTTP.

---

## 4. Install the runtime on the server

Run on the server as `ubuntu`:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx git curl

# Node.js 20 LTS from NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

node --version   # v20.x
npm --version
```

Create a service account and the application directory:

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin campusconnect
sudo mkdir -p /opt/campusconnect /var/www/campusconnect
sudo chown -R ubuntu:ubuntu /opt/campusconnect
```

---

## 5. Get the code and build it

```bash
cd /opt/campusconnect
git clone <YOUR_REPOSITORY_URL> .

# `npm ci` installs exactly what package-lock.json pins, including the correct
# platform-specific esbuild/rollup binaries for Linux.
npm ci

# Frontend -> apps/web/dist, backend -> apps/api/dist
npm run build
npm run build:api
```

Copy the built frontend where Nginx serves it:

```bash
sudo rm -rf /var/www/campusconnect/*
sudo cp -r apps/web/dist/* /var/www/campusconnect/
sudo chown -R www-data:www-data /var/www/campusconnect
```

---

## 6. Configure the environment

```bash
cd /opt/campusconnect
cp .env.example .env
nano .env
```

Fill in **production** values. The API validates these at startup and refuses
to boot with development defaults:

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

Generate the session secret on the server:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Lock the file down — it holds the database password:

```bash
chmod 600 /opt/campusconnect/.env
sudo chown campusconnect:campusconnect /opt/campusconnect/.env
```

`NODE_ENV=production` requires **all** of the following, and the process exits
with a clear message if any is missing:

- `WEB_ORIGIN` starts with `https://`
- `COOKIE_SECURE=true`
- `TRUST_PROXY=true`
- `NEO4J_URI` starts with `neo4j+s://`
- `SESSION_SECRET` is at least 48 characters

---

## 7. Initialise the schema and create the first college

Run these as a user that can read `.env` (e.g. `ubuntu` after
`sudo chown ubuntu /opt/campusconnect/.env`, or via `sudo -u campusconnect`):

```bash
cd /opt/campusconnect
npm run db:init          # constraints and indexes only; no business data
npm run admin:bootstrap  # one college + its first administrator
```

The onboarding command prompts for the college name, a unique college slug,
the administrator's email, name and password. Run it again, with different
details, for **each additional college**. There is no public endpoint for this
on purpose — a tenant can only be created by someone with shell access.

Verify:

```bash
npm run db:check
```

You should see one college, one administrator and zero students.

---

## 8. Run the API as a service

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

The unit restarts only on genuine process failure (`Restart=on-failure`). A
paused AuraDB instance does **not** kill the API: it keeps running and reports
`503` on the readiness endpoint until the database answers again.

Check readiness from the server:

```bash
curl -s localhost:4000/api/health/live    # {"status":"ok",...}
curl -s localhost:4000/api/health/ready   # {"status":"ok","database":"up",...}
```

---

## 9. Configure Nginx

```bash
sudo cp deploy/nginx/campusconnect.conf /etc/nginx/sites-available/campusconnect
sudo sed -i 's/campusconnect.duckdns.org/YOUR-SUBDOMAIN.duckdns.org/g' /etc/nginx/sites-available/campusconnect
sudo ln -sf /etc/nginx/sites-available/campusconnect /etc/nginx/sites-enabled/campusconnect
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
```

At this point the `ssl_certificate` files do not exist yet, so `nginx -t` will
fail. That is expected — issue the certificate first (next step), then reload.

---

## 10. Issue the HTTPS certificate

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo mkdir -p /var/www/certbot
sudo certbot --nginx -d YOUR-SUBDOMAIN.duckdns.org
```

Choose **redirect HTTP to HTTPS** when prompted. Certbot rewrites the
`listen 80` block and fills in the certificate paths.

Reload and confirm:

```bash
sudo nginx -t && sudo systemctl reload nginx
curl -I https://YOUR-SUBDOMAIN.duckdns.org
```

Renewal is handled by the `certbot.timer` systemd timer. Confirm it is active:

```bash
systemctl list-timers | grep certbot
sudo certbot renew --dry-run
```

---

## 11. Verification checklist

Work through this on the public URL:

- [ ] `https://<domain>/` loads the landing page over a valid certificate.
- [ ] `https://<domain>/api/health/ready` returns `{"status":"ok","database":"up"}`.
- [ ] Sign in as the college administrator created in step 7.
- [ ] Add two or three skills in **Skill catalogue**.
- [ ] Register a student in a private browser window; the college appears in the
      registration dropdown.
- [ ] Register a recruiter; the dashboard shows "waiting for college approval"
      and the hiring-request buttons are disabled.
- [ ] Approve the recruiter, submit a hiring request, approve it, evaluate
      students, dispatch, and confirm the student receives the notification.
- [ ] Reload the page while signed in — the session survives (cookie-based).
- [ ] Sign out, then confirm `/admin` redirects to the sign-in page.
- [ ] Create a second college with `npm run admin:bootstrap` and confirm the
      first college's administrator cannot see any of its students.

---

## 12. Updating the application

```bash
cd /opt/campusconnect
git pull
npm ci
npm run build && npm run build:api

sudo rm -rf /var/www/campusconnect/*
sudo cp -r apps/web/dist/* /var/www/campusconnect/
sudo chown -R www-data:www-data /var/www/campusconnect

sudo systemctl restart campusconnect-api
curl -s localhost:4000/api/health/ready
```

Schema changes are applied with `npm run db:init`, which only creates missing
constraints and indexes — it never deletes data. Run it after pulling a release
that changes the graph model.

### Rollback

```bash
cd /opt/campusconnect
git log --oneline -5
git checkout <previous-commit>
npm ci
npm run build && npm run build:api
sudo rm -rf /var/www/campusconnect/*
sudo cp -r apps/web/dist/* /var/www/campusconnect/
sudo systemctl restart campusconnect-api
```

If a release changed the schema in a way you need to undo, restore the AuraDB
instance from a snapshot you exported beforehand — AuraDB Free does not keep
backups for you.

### Restart / stop

```bash
sudo systemctl restart campusconnect-api
sudo systemctl stop campusconnect-api
sudo systemctl start campusconnect-api
```

---

## 13. Operating notes

| Concern | Behaviour |
| --- | --- |
| Database down | `/api/health/live` still returns 200; `/api/health/ready` returns 503. The process does not crash-loop. |
| AuraDB pause | First request after a pause can take 30–60 s. Wake it before a demo. |
| Sessions | Stored in Neo4j, so they survive an API restart. They are lost if the database is wiped. |
| Logs | `journalctl -u campusconnect-api` (API), `/var/log/nginx/` (web). |
| Secrets | Only in `/opt/campusconnect/.env`, mode `600`, owned by the service user. Never in the repository or the frontend bundle. |
| Email / SMS | Not implemented. Notifications are in-app only. |
| Backups | Not automated. Export the graph manually before risky changes: `CALL apoc.export.cypher.all(...)` requires APOC, otherwise use `neo4j-admin database dump` against a local instance. |

---

## 14. Troubleshooting

**`502 Bad Gateway` on `/api`**
The API is not listening. Check `systemctl status campusconnect-api` and
`journalctl -u campusconnect-api -n 50`. The usual cause is an invalid `.env`
(production validation) or an unreachable AuraDB instance.

**`/api/health/ready` returns 503**
Neo4j is unreachable. Confirm the URI is `neo4j+s://…`, the password is current,
and the Aura instance is running. Test from the server with `npm run db:check`.

**Signed in, then immediately signed out**
`WEB_ORIGIN` does not match the browser origin exactly, or `COOKIE_SECURE=true`
while browsing over plain HTTP. Both must agree with how you actually reach the
site.

**CSRF errors on every form submit**
`TRUST_PROXY` is not enabled, so the API cannot tell it is behind HTTPS and the
cookie policy misbehaves. Set `TRUST_PROXY=true` and restart.

**"No college is accepting registrations yet" on the registration page**
No college exists yet. Run `npm run admin:bootstrap` on the server.

**Certbot fails validation**
DuckDNS is not pointing at the static IP yet, or port 80 is closed in the
Lightsail firewall. Both must be correct before `certbot --nginx` runs.
