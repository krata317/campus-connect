# CampusConnect

A multi-college placement management portal built on a graph database. Each
college has its own administrator, students, recruiters, skill catalogue,
hiring requests and notifications. Data never crosses a college boundary.

- **Frontend:** React 18, Vite, TypeScript, React Router, Tailwind CSS, TanStack Query, React Hook Form + Zod, Lucide icons
- **Backend:** Node.js, Express, TypeScript, Zod, official Neo4j JavaScript driver, bcrypt, server-side sessions
- **Database:** Neo4j (graph, Cypher) — the only source of truth
- **Tests:** Vitest, React Testing Library, Supertest

> The application starts with an **empty database**. There are no seeded
> students, companies, skills, requests or notifications, no hardcoded logins
> and no fake statistics. Creating a college and its first administrator is
> onboarding, not sample data.

---

## 1. What the app does

Three portals, one workflow, per college:

| Portal | Who | What they can do |
| --- | --- | --- |
| Student | Students of one college | Register against a college, maintain a fixed academic/profile record, choose skills from their college catalogue, receive and read shortlist notifications |
| Recruiter | Recruiters hiring from one college | Register (starts `PENDING`), maintain company details, submit multi-role hiring requests with structured eligibility criteria, track review status |
| College administrator | Placement cell of one college | Approve recruiters, review hiring requests, evaluate students against criteria, save shortlists, dispatch notifications, review dispatch history |

The administrator is the only intermediary. Recruiters never see student
records, eligibility results or shortlists, and never contact students
directly. A student receives a notification only when an administrator
confirms a dispatch.

---

## 2. Multi-college tenancy

`College` is the tenant root. It is a real node in the graph, and every
business record belongs to exactly one college.

```
(Admin)-[:ADMINISTERS]->(College)
(Student)-[:BELONGS_TO]->(College)
(EmployerAccount)-[:BELONGS_TO]->(College)     # the recruiter's login
(Company)-[:BELONGS_TO]->(College)
(Skill)-[:BELONGS_TO]->(College)
(HiringRequest)-[:BELONGS_TO]->(College)
(JobRole)-[:BELONGS_TO]->(College)
```

Every one of those nodes **also** carries a `collegeId` property. The
relationship makes ownership explicit in the graph; the property makes scoping
queries cheap (`MATCH (s:Student {collegeId: $collegeId})` instead of a
variable-length traversal). Both are written in the same transaction that
creates the record.

Notifications inherit their tenant through `RECEIVED` / `ABOUT_ROLE`, and the
dispatch transaction only ever matches students and roles with the same
`collegeId`, so a notification cannot cross a boundary.

### How the tenant is resolved

The tenant is **never** read from a request body, header or query parameter.

1. The session stores only `userId` and `role`.
2. `requireAuth` reloads the account from Neo4j on every request.
3. The account's college comes from `ADMINISTERS` (admin) or `BELONGS_TO`
   (student, recruiter).
4. `currentCollegeId(req)` exposes that id to the route, which passes it to the
   service, which passes it to the repository.

An account without a college is rejected at sign-in rather than being treated
as a global account.

### What isolation looks like in practice

| Attempt | Result |
| --- | --- |
| College A admin opens `/api/admin/students/<College B id>` | `404` |
| College A admin opens `/api/admin/requests/<College B id>` | `404` |
| College A admin shortlists a College B student | `400` |
| College A admin patches a College B skill | `404` |
| Recruiter calls `/api/admin/students` or `/api/students/me/profile` | `403` |
| Student sends `collegeSlug` in a profile update | ignored; the college is unchanged |
| Student registers with an unknown college slug | `400` |
| Two colleges each catalogue "Python" | allowed; duplicates inside one college are `409` |

These are enforced in repositories and services, not in React.

---

## 3. Repository layout

```
apps/
  api/                       Express API
    src/
      config/env.ts          Zod-validated environment (production refuses dev defaults)
      db/                    driver, schema/constraints, Neo4j session store
      middleware/            auth + tenant, CSRF, errors, rate limiting
      repositories/          all Cypher lives here
      routes/                HTTP layer (validation + tenant wiring)
      services/              business rules, eligibility, workflow transitions
      scripts/               init-db, bootstrap-admin, migrate-tenants, db-check, create-test-db
    tests/                   unit + integration (opt-in database)
  web/                       React SPA
    src/
      components/            ui primitives, layout, student/recruiter widgets
      hooks/                 auth, student, colleges
      pages/                 public, student, admin, recruiter
      lib/                   api client, formatting, form helpers
packages/
  shared/                    types + Zod schemas shared by both apps
deploy/
  nginx/campusconnect.conf   reverse proxy + SPA fallback + TLS
  systemd/campusconnect-api.service
DEPLOYMENT.md                Lightsail + AuraDB + Nginx + Certbot guide
```

---

## 4. Getting started

### 4.1 Prerequisites

- Node.js 20+
- A Neo4j database. Either:
  - **Local:** Neo4j Desktop 5.x/2025+ with a DBMS created, or
  - **Cloud:** a free Neo4j AuraDB instance (use the `neo4j+s://` URI)

### 4.2 Install

```bash
npm install
```

### 4.3 Configure

```bash
cp .env.example .env
```

Set at minimum:

```ini
NEO4J_URI=neo4j://127.0.0.1:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=<your password>
NEO4J_DATABASE=neo4j
SESSION_SECRET=<32+ random characters>
```

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 4.4 Create the schema

```bash
npm run db:init
```

Creates the constraints and indexes. It is idempotent and never inserts
business data.

### 4.5 Create the first college and its administrator

```bash
npm run admin:bootstrap
```

Prompts for:

- College name
- College identifier (slug), e.g. `northfield-institute`
- Administrator email, display name and password

It creates the `College` and the `Admin` **in one transaction**, so a failure
leaves neither behind. It refuses a duplicate slug or an email that already
exists.

**Run it again for every additional college.** This is the only way to create a
tenant; there is deliberately no public endpoint and no admin registration
form.

### 4.6 Run

```bash
npm run dev
```

- Web: <http://localhost:5173>
- API: <http://localhost:4000>

The Vite dev server proxies `/api` to the API, so the browser only ever talks
to one origin.

---

## 5. Graph model

### Nodes

| Label | Key properties |
| --- | --- |
| `College` | `id`, `name`, `slug` (unique), `website`, `contactEmail`, `contactPhone`, `active`, timestamps |
| `Admin` | `id`, `email` (unique), `passwordHash`, `name`, `collegeId`, `active` |
| `Student` | `id`, `email` (unique), `passwordHash`, `fullName`, contact fields, `activeBacklogs`, `collegeId`, timestamps |
| `Education` | `id`, `level` (`CLASS_10`/`CLASS_12`/`UNDERGRAD`/`POSTGRAD`), board/stream or degree/branch/institution, `passingYear`, `scoreType`, `scoreValue`, `scoreScale` |
| `Experience` | `id`, `organization`, `jobTitle`, `startDate`, `endDate`, `isCurrent`, `description` |
| `Skill` | `id`, `name`, `nameKey`, `active`, `collegeId` |
| `Company` | `id`, `name`, contact details, `collegeId` |
| `EmployerAccount` | `id`, `email` (unique), `passwordHash`, `approvalStatus`, `collegeId` |
| `HiringRequest` | `id`, `title`, `assessmentInstructions`, `status`, review fields, `collegeId` |
| `JobRole` | `id`, `title`, `description`, `location`, `employmentType`, `registrationUrl`, `criteriaJson`, `status`, `shortlistStatus`, `dispatchedAt`, `collegeId` |
| `Notification` | `id`, `type`, `title`, `message`, `companyName`, `roleTitle`, `registrationUrl`, `createdAt`, `readAt`, `collegeId` |
| `ReviewEvent` | `id`, `action`, `fromStatus`, `toStatus`, `note`, `actorRole`, `actorId`, `at` |
| `Session` | `sid`, `data`, `expiresAt` |

### Relationships

```
(Admin)-[:ADMINISTERS]->(College)
(Student)-[:BELONGS_TO]->(College)
(EmployerAccount)-[:BELONGS_TO]->(College)
(Company)-[:BELONGS_TO]->(College)
(Skill)-[:BELONGS_TO]->(College)
(HiringRequest)-[:BELONGS_TO]->(College)
(JobRole)-[:BELONGS_TO]->(College)
(Company)-[:HAS_ACCOUNT]->(EmployerAccount)
(Company)-[:SUBMITTED]->(HiringRequest)
(HiringRequest)-[:CONTAINS_ROLE]->(JobRole)
(JobRole)-[:REQUIRES_SKILL]->(Skill)
(JobRole)-[:PREFERS_SKILL]->(Skill)
(Student)-[:HAS_EDUCATION]->(Education)
(Student)-[:HAS_EXPERIENCE]->(Experience)
(Student)-[:HAS_SKILL]->(Skill)
(Student)-[:SHORTLISTED_FOR {status, shortlistedAt, dispatchedAt, adminId}]->(JobRole)
(Student)-[:RECEIVED]->(Notification)
(Notification)-[:ABOUT_ROLE]->(JobRole)
(HiringRequest)-[:HAS_REVIEW_EVENT]->(ReviewEvent)
(EmployerAccount)-[:HAS_REVIEW_EVENT]->(ReviewEvent)
```

### Constraints that matter

- `college_slug_unique` — one tenant per slug.
- `skill_college_namekey_unique` on `(collegeId, nameKey)` — "Python" may exist
  in two colleges, but not twice in one.
- Email uniqueness on `Student`, `Admin` and `EmployerAccount` is global, which
  keeps sign-in unambiguous (one email, one account). A person who needs
  accounts at two colleges uses two email addresses.
- `notification_id_unique` plus deterministic ids `ntf_<roleId>_<studentId>`
  make dispatch idempotent: a retry merges into the same node.

---

## 6. Eligibility engine

`apps/api/src/services/eligibility.service.ts` is a pure function: no database,
no clock, no randomness. Given a student projection, the role criteria and a
skill-id → name map, it returns a per-criterion list.

Every check reports one of four states:

| State | Meaning |
| --- | --- |
| `PASS` | The recorded value satisfies the requirement. |
| `FAIL` | The recorded value exists and does not satisfy the requirement. |
| `MISSING` | The data needed to decide is absent, or cannot be compared safely. |
| `SKIPPED` | The role does not ask for this criterion. |

A student is eligible only when **every** check is `PASS` or `SKIPPED`.
`MISSING` never auto-qualifies — the portal shows "unverified" rather than
silently passing someone.

Deliberate safety rules:

- **No unit conversion.** A CGPA requirement is only compared against a CGPA
  record, and only on the same scale. CGPA 8.4/10 against a "≥ 7.0 CGPA (4-point
  scale)" requirement is `MISSING`, not a pass.
- **No inferred values.** A missing Class 12 record is `MISSING`, not `0`.
- **Backlogs:** "not reported" is `MISSING`; `0` is a real value that passes a
  `max 0` requirement.
- **Experience** is computed from a set of covered calendar months, so
  overlapping roles are not double counted.

The same engine runs twice: once when the administrator filters students, and
again inside `dispatch` immediately before notifications are written. If a
profile changed in between, the dispatch is rejected with the list of students
who no longer qualify.

---

## 7. Security baseline

- **Passwords:** bcrypt, 12 rounds. Sign-in runs a dummy hash comparison when
  no account matches, so response time does not reveal whether an email exists.
- **Sessions:** server-side, stored in Neo4j, `httpOnly` cookie, `sameSite=lax`,
  `secure` when `COOKIE_SECURE=true`. The session id is regenerated on login.
  Nothing sensitive is kept in `localStorage`.
- **CSRF:** double-submit cookie. `cc.csrf` is readable by JavaScript; the client
  echoes it in `X-CSRF-Token`, and the server compares with `timingSafeEqual` on
  every mutating request.
- **Authorization:** `requireAuth` + `requireRole` on every portal router, plus
  tenant scoping in every query. The recruiter "approved" gate is enforced by
  middleware, not by hiding a button.
- **Validation:** every request body, query and route param goes through a Zod
  schema from `packages/shared`. Registration URLs and external links must be
  `http`/`https`.
- **Cypher:** all queries are parameterised. Labels are only ever chosen from a
  closed union in code.
- **Errors:** a single handler maps `AppError`/`ZodError` to safe messages; stack
  traces and driver internals never reach the client.
- **Rate limiting:** 10 sign-in attempts per 15 minutes and 30 registrations per
  hour per IP.
- **CORS:** one allowed origin (`WEB_ORIGIN`), credentials enabled.
- **Production guards:** the API refuses to start when `NODE_ENV=production`
  and `WEB_ORIGIN` is not HTTPS, `COOKIE_SECURE`/`TRUST_PROXY` are false,
  `NEO4J_URI` is not `neo4j+s://`, or `SESSION_SECRET` is shorter than 48
  characters.
- **Logging:** passwords, hashes, session ids and the database password are never
  logged.

---

## 8. Testing

```bash
npm run typecheck    # shared + api + web
npm test             # API then web
npm run test:api
npm run test:web
```

### Unit tests (no database)

`apps/api/tests/unit`

- `eligibility.test.ts` — every check state, missing data, CGPA scale mismatch,
  ALL vs ANY skills, experience months, overlapping roles
- `schemas.test.ts` — score validation, month format, criteria refinements
- `requestWorkflow.test.ts` — legal and illegal review transitions
- `rateLimit.test.ts` — limiter factories
- `collegeSlug.test.ts` — tenant identifier normalisation

`apps/web/tests`

- `utils.test.ts` — formatting, score display, status labels
- `api.test.ts` — CSRF header behaviour, error mapping
- `NotificationItem.test.tsx` — notification rendering
- `guards.test.tsx` — role guards and redirects

### Integration tests (real Neo4j, opt-in)

`apps/api/tests/integration` drive the real Express app with Supertest against
a real database. They skip themselves unless `TEST_NEO4J_*` is configured:

```ini
TEST_NEO4J_URI=neo4j://127.0.0.1:7687
TEST_NEO4J_USERNAME=neo4j
TEST_NEO4J_PASSWORD=your-password
TEST_NEO4J_DATABASE=campusconnecttest
```

Create that database (Neo4j Enterprise/Desktop, or a second local instance):

```bash
npm run db:test-setup
```

The suite wipes its target database between tests. It refuses to run if the
target is the development database unless `TEST_NEO4J_ALLOW_SHARED_DB=true` is
set explicitly.

- `auth.test.ts` — registration, session survival, hashing, CSRF, RBAC
- `workflow.test.ts` — full pipeline: skills → request → review → eligibility →
  shortlist → dispatch → notification → read
- `tenancy.test.ts` — two colleges, isolation of students, recruiters, skills,
  requests, eligibility, shortlists and notifications

AuraDB Free allows only one database per instance, so the integration suite is
meant for a local Neo4j. Run `npm run test:api` on a machine without a test
database and the DB-backed files report as skipped rather than failing.

---

## 9. API reference

All routes are under `/api`. Authenticated routes use the session cookie;
mutating requests also need `X-CSRF-Token`.

### Public

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Readiness: `200` when Neo4j answers, `503` otherwise |
| `GET` | `/health/live` | Liveness: `200` while the process is up (no DB call) |
| `GET` | `/health/ready` | Same as `/health` |
| `GET` | `/colleges` | Active colleges for the registration form (`id`, `name`, `slug`) |
| `GET` | `/auth/csrf` | Issues the CSRF cookie and returns the token |
| `POST` | `/auth/register/student` | `fullName`, `email`, `password`, `dateOfBirth?`, `collegeSlug` |
| `POST` | `/auth/register/employer` | Company + contact + `collegeSlug`; account starts `PENDING` |
| `POST` | `/auth/login` | `email`, `password`, `role?` |
| `POST` | `/auth/logout` | Destroys the session |
| `GET` | `/auth/me` | Current user including `college` |

### Student (`STUDENT`)

| Method | Path |
| --- | --- |
| `GET`/`PUT` | `/students/me/profile` |
| `PUT`/`DELETE` | `/students/me/education/:level` (delete only `POSTGRAD`) |
| `POST` | `/students/me/experiences` |
| `PUT`/`DELETE` | `/students/me/experiences/:id` |
| `PUT` | `/students/me/skills` |
| `GET` | `/students/me/dashboard` |
| `GET` | `/students/me/notifications` |
| `POST` | `/students/me/notifications/:id/read` |
| `GET` | `/students/me/shortlists` |

### Recruiter (`EMPLOYER`)

| Method | Path |
| --- | --- |
| `GET`/`PUT` | `/employer/me/company` |
| `GET` | `/employer/me/requests` |
| `POST` | `/employer/me/requests` (requires approval) |
| `GET` | `/employer/me/requests/:id` |
| `PUT` | `/employer/me/requests/:id` (draft or changes-requested only) |
| `POST` | `/employer/me/requests/:id/submit` |
| `DELETE` | `/employer/me/requests/:id` (drafts only) |

### College administrator (`ADMIN`)

| Method | Path |
| --- | --- |
| `GET` | `/admin/stats` |
| `GET` | `/admin/students` (`q`, `page`, `pageSize`) |
| `GET` | `/admin/students/:id` |
| `GET` | `/admin/students/:id/notifications` |
| `GET` | `/admin/employers` (`status`, `q`) |
| `GET` | `/admin/employers/:id` |
| `POST` | `/admin/employers/:id/review` (`APPROVE` \| `REJECT`) |
| `GET` | `/admin/requests` (`status`, `q`) |
| `GET` | `/admin/requests/:id` |
| `POST` | `/admin/requests/:id/review` (`APPROVE` \| `REJECT` \| `REQUEST_CHANGES`) |
| `GET` | `/admin/roles/:roleId/candidates` (`eligibleOnly`, default `true`) |
| `GET`/`PUT` | `/admin/roles/:roleId/shortlist` |
| `POST` | `/admin/roles/:roleId/dispatch` |
| `GET` | `/admin/dispatches` |
| `GET`/`POST` | `/admin/skills` |
| `PATCH` | `/admin/skills/:id` |

### Shared

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/skills` | The signed-in user's college catalogue (includes inactive skills) |

---

## 10. Workflow reference

```
Recruiter registers ──> PENDING
        │
        ├── admin rejects ──> REJECTED (cannot submit requests)
        └── admin approves ──> APPROVED
                                 │
                                 ▼
                     create request ──> DRAFT
                                 │
                              submit ──> SUBMITTED
                                 │
             ┌───────────────────┼────────────────────┐
             ▼                   ▼                    ▼
         APPROVED        CHANGES_REQUESTED        REJECTED
             │                   │
             │              recruiter edits and resubmits
             ▼
   admin opens a role ──> eligibility evaluated per student
             │
      save shortlist (no notifications)
             │
   confirm dispatch ──> re-check eligibility inside the transaction
             │
             ▼
   Notification created for each selected student
             │
   student reads it ──> readAt set
```

Only legal transitions are allowed, and a request that is already approved
cannot be approved again. A dispatched role is locked: the shortlist cannot be
changed and dispatching twice is refused (`409`).

---

## 11. Useful commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | API + web in watch mode |
| `npm run typecheck` | Type-check all three workspaces |
| `npm test` | Unit + integration (integration skips without `TEST_NEO4J_*`) |
| `npm run build` | Production build of **both** apps (`build:web` + `build:api`) |
| `npm run build:web` | Production frontend build only |
| `npm run build:api` | Production API build only (`apps/api/dist`) |
| `npm run start:api` | Run the compiled API |
| `npm run db:check` | Connection check plus per-college counts and orphan detection |
| `npm run db:init` | Create missing constraints and indexes |
| `npm run admin:bootstrap` | Create one college and its first administrator |
| `npm run db:migrate-tenants -- --slug=<slug>` | Dry run: attach pre-multi-college records to a college |
| `npm run db:migrate-tenants -- --slug=<slug> --yes` | Apply that migration |
| `npm run db:test-setup` | Create the isolated integration-test database |

---

## 12. Migrating a pre-multi-college database

If the database was created before colleges existed, its records have no
`collegeId`. `npm run db:check` reports them as orphans. To attach them to a
specific college:

```bash
npm run db:migrate-tenants -- --slug=northfield-institute        # dry run
npm run db:migrate-tenants -- --slug=northfield-institute --yes  # apply
```

The script never guesses: the college must already exist and be named
explicitly, and nothing is written without `--yes`. It is idempotent.

---

## 13. Deployment

`DEPLOYMENT.md` walks through a single Lightsail server, Neo4j AuraDB Free,
systemd, HTTPS via Certbot, updates and rollback.

Configuration templates:

- `deploy/nginx/campusconnect-http.conf` — stage 1, plain HTTP, no certificate
  needed. Install this first so Certbot can validate the domain.
- `deploy/nginx/campusconnect.conf` — stage 2, HTTPS. Install it only after the
  certificate exists.
- `deploy/systemd/campusconnect-api.service` — runs the compiled API as an
  unprivileged user.

In production the API binds to `127.0.0.1` (see `HOST` in `.env.example`), so
port 4000 is never publicly reachable. The readiness endpoint returns `503`
when Neo4j is unreachable, while the liveness endpoint keeps returning `200`.

---

## 14. Known limitations

- **One college per account.** A recruiter hiring from two colleges needs two
  accounts. Cross-tenant organisation membership is deliberately not modelled.
- **Global email uniqueness.** The same email cannot hold accounts at two
  colleges, which keeps sign-in unambiguous.
- **One administrator per college via the CLI.** The graph and the repository
  support several, but there is no UI for inviting another administrator.
- **No email or SMS.** Notifications are in-app only; nothing pretends to send
  mail.
- **No file uploads.** Resumes and documents are out of scope.
- **No automated backups.** AuraDB Free does not provide them.
- **AuraDB Free pauses after inactivity.** The first request after a pause can
  take 30–60 seconds.
- **Dependency advisories.** `npm audit --omit=dev` reports two advisories that
  need a major upgrade: `react-router` (moderate, fixed in v7) and `zod` (high,
  fixed in v4). Both are breaking upgrades that would require migrating every
  route and schema, so they are documented rather than force-applied.
- **No automated browser tests.** Component behaviour is covered by React
  Testing Library, and the UI contract by the API integration tests, but no
  Playwright/Cypress suite runs against a real browser.
- **Cloud deployment not executed here.** The Lightsail/AuraDB/Nginx/Certbot
  steps in `DEPLOYMENT.md` are written and reviewable but were not run in this
  environment, because no AWS or AuraDB credentials were available.
