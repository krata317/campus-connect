# CampusConnect

A college placement management portal built on a graph database. Three separate portals
(Student, College Administrator, Employer) sit on one Neo4j database, with the placement
cell acting as the only intermediary between employers and students.

- **Frontend:** React 18 + Vite + TypeScript + React Router + Tailwind CSS + Lucide icons + React Hook Form + Zod + TanStack Query
- **Backend:** Node.js + Express + TypeScript + Zod + the official Neo4j JavaScript driver
- **Database:** Neo4j is the only authoritative store — accounts, sessions, profiles, criteria, shortlists and notifications all live in the graph
- **Tests:** Vitest, React Testing Library, Supertest

---

## 1. What the app does

| Portal | Capabilities |
| --- | --- |
| **Student** | Register, sign in/out, maintain a fixed profile schema (personal details, Class 10, Class 12, undergraduate, optional postgraduate, catalogue-only skills, any number of experience records, external links), see a real profile-completion percentage, read placement notifications and mark them read |
| **College Administrator** | Bootstrap the first admin from the CLI, search and inspect students, manage the skill catalogue, approve or reject employers, review hiring requests, review per-criterion eligibility, shortlist manually and dispatch notifications |
| **Employer** | Register a company (starts `PENDING`), maintain the company profile, build multi-role hiring requests with structured eligibility criteria, save drafts, submit, and respond to change requests |

An employer **never** selects or contacts a student directly. Every notification is created by
an administrator and dispatched through the college.

### The rule the project is built around

The database starts **completely empty**. There are no seeded students, companies, skills,
requests or notifications, no hardcoded logins, no fake statistics and no static arrays standing
in for API responses. Every number in the UI is a count returned by the API. The only way to get
an administrator account is to run the one-time bootstrap command.

---

## 2. Repository layout

```
campusconnect/
├─ apps/
│  ├─ api/                     Express + TypeScript API
│  │  ├─ src/
│  │  │  ├─ config/env.ts      Zod-validated environment loader
│  │  │  ├─ db/                driver, schema (constraints/indexes), session store
│  │  │  ├─ lib/               errors, ids, password hashing, dates, validation, logger
│  │  │  ├─ middleware/        auth, RBAC, CSRF, rate limiting, error handling
│  │  │  ├─ repositories/      all Cypher lives here (parameterised)
│  │  │  ├─ services/          business rules, eligibility engine, workflow transitions
│  │  │  ├─ routes/            HTTP layer
│  │  │  └─ scripts/           db-check, init-db, create-test-db, bootstrap-admin
│  │  └─ tests/                unit + integration suites
│  └─ web/                     React + Vite SPA
│     ├─ src/
│     │  ├─ components/        ui primitives, layout, student/employer/admin widgets
│     │  ├─ hooks/             TanStack Query wrappers, auth helpers
│     │  ├─ lib/               api client, formatting, form helpers
│     │  └─ pages/             one folder per portal
│     └─ tests/                component and utility tests
├─ packages/
│  └─ shared/                  Zod schemas + TypeScript types shared by both apps
├─ .env.example
└─ package.json                npm workspaces root
```

---

## 3. Getting started

### Prerequisites

- Node.js 20 or newer
- A running Neo4j 5.x or newer instance (Neo4j Desktop, Docker, or Aura)

### Step 1 — Install dependencies

```bash
npm install
```

> **Windows note.** If `npm install` fails while running the `esbuild` postinstall script, the
> optional native packages were skipped. Recover with:
> ```bash
> npm install --ignore-scripts --include=optional
> npm install --save-dev @esbuild/win32-x64 @rollup/rollup-win32-x64-msvc
> ```

### Step 2 — Start Neo4j

**Neo4j Desktop**

1. Open Neo4j Desktop and select your local DBMS (this project was verified against a DBMS named `CampusConnect`).
2. Press **Start**. Wait for the status to read *Running*.
3. The Bolt endpoint is `neo4j://127.0.0.1:7687`; the browser console is at <http://localhost:7474>.
4. Make sure the password matches `NEO4J_PASSWORD` in `.env`.

**Docker**

```bash
docker run -d --name campusconnect-neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/your-password-here \
  neo4j:5
```

### Step 3 — Configure the environment

```bash
cp .env.example .env
```

Then edit `.env`:

| Variable | Meaning |
| --- | --- |
| `NEO4J_URI` | Bolt URI, e.g. `neo4j://127.0.0.1:7687` |
| `NEO4J_USERNAME` / `NEO4J_PASSWORD` | Neo4j credentials |
| `NEO4J_DATABASE` | Database name, normally `neo4j` |
| `SESSION_SECRET` | **Required.** 32+ random characters. Generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `WEB_ORIGIN` | Origin of the Vite dev server, `http://localhost:5173` |
| `COOKIE_SECURE` | Set to `true` only when serving over HTTPS |
| `TEST_NEO4J_*` | Optional isolated database for the integration tests (see §7) |

`.env` is git-ignored. `.env.example` contains placeholders only.

### Step 4 — Create the schema

```bash
npm run db:check     # confirms connectivity and prints current row counts
npm run db:init      # creates the uniqueness constraints and indexes
```

`db:init` creates structure only — no students, companies, skills or administrators.

### Step 5 — Create the first administrator (once)

```bash
npm run admin:bootstrap
```

The command:

- refuses to run if an administrator already exists,
- validates the email, display name and password against the shared schemas,
- hides the password while you type,
- hashes it with bcrypt (12 rounds) before storing,
- takes a database-level lock so two concurrent runs cannot both create an admin,
- never prints the password back.

For non-interactive provisioning the answers can be piped, or `ADMIN_EMAIL`, `ADMIN_NAME` and
`ADMIN_PASSWORD` can be supplied as environment variables:

```bash
printf 'your-password\nyour-password\n' | npm run admin:bootstrap
```

There is deliberately **no** public administrator registration form.

### Step 6 — Run the app

```bash
npm run dev
```

| Service | URL |
| --- | --- |
| Web app | <http://localhost:5173> |
| API | <http://localhost:4000> |
| Health check | <http://localhost:4000/api/health> |
| Neo4j browser | <http://localhost:7474> |

Vite proxies `/api` to the API on port 4000, so the browser only ever talks to port 5173.

### All commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start API and web together |
| `npm run dev:api` / `npm run dev:web` | Start one side only |
| `npm run db:check` | Verify connectivity, print row counts |
| `npm run db:init` | Create constraints and indexes |
| `npm run db:test-setup` | Create the isolated integration-test database |
| `npm run admin:bootstrap` | Create the one-time administrator |
| `npm test` | Run every test suite |
| `npm run test:api` / `npm run test:web` | Run one suite |
| `npm run typecheck` | TypeScript across all three workspaces |
| `npm run build` | Production build of the web app |
| `npm run build:api` / `npm run start:api` | Build and run the API from `dist/` |

---

## 4. Graph model

### Nodes

| Label | Key properties |
| --- | --- |
| `Student` | `id`, `fullName`, `email`, `passwordHash`, `activeBacklogs`, `dateOfBirth`, `gender`, `phone`, `city`, `state`, `linkedin`, `github`, `portfolio`, timestamps |
| `Education` | `id`, `level` (`CLASS_10` \| `CLASS_12` \| `UNDERGRAD` \| `POSTGRAD`), `board`, `stream`, `degree`, `branch`, `institution`, `passingYear`, `scoreType`, `scoreValue`, `scoreScale` |
| `Experience` | `id`, `organization`, `jobTitle`, `startDate`, `endDate`, `isCurrent`, `description` |
| `Skill` | `id`, `name`, `nameKey`, `active`, timestamps |
| `Company` | `id`, `name`, `website`, `contactPersonName`, `contactPhone`, `contactEmail`, `description` |
| `EmployerAccount` | `id`, `email`, `passwordHash`, `approvalStatus`, `reviewNote`, `reviewedAt` |
| `Admin` | `id`, `email`, `passwordHash`, `name`, `active` |
| `HiringRequest` | `id`, `title`, `assessmentInstructions`, `status`, `submittedAt`, `reviewedAt`, `reviewNote` |
| `JobRole` | `id`, `title`, `description`, `location`, `employmentType`, `registrationUrl`, serialised criteria, `shortlistStatus`, `dispatchedAt` |
| `Notification` | `id`, `type`, `title`, `message`, `companyName`, `roleTitle`, `registrationUrl`, `createdAt`, `readAt` |
| `ReviewEvent` | `id`, `action`, `fromStatus`, `toStatus`, `note`, `actorRole`, `actorId`, `at` |
| `Session` | `sid`, `data`, `expiresAt` |
| `BootstrapLock` | `id`, `owner`, `claimedAt` |

### Relationships

```
(Company)-[:HAS_ACCOUNT]->(EmployerAccount)
(Company)-[:SUBMITTED]->(HiringRequest)
(HiringRequest)-[:CONTAINS_ROLE]->(JobRole)
(JobRole)-[:REQUIRES_SKILL]->(Skill)          required skills
(JobRole)-[:PREFERS_SKILL]->(Skill)           optional skills
(Student)-[:HAS_EDUCATION]->(Education)
(Student)-[:HAS_EXPERIENCE]->(Experience)
(Student)-[:HAS_SKILL]->(Skill)
(Student)-[:SHORTLISTED_FOR {shortlistedAt, adminId, status, dispatchedAt}]->(JobRole)
(Student)-[:RECEIVED]->(Notification)
(Notification)-[:ABOUT_ROLE]->(JobRole)
(HiringRequest)-[:HAS_REVIEW_EVENT]->(ReviewEvent)
(EmployerAccount)-[:HAS_REVIEW_EVENT]->(ReviewEvent)
```

### Constraints and indexes

17 uniqueness constraints (`Student.id`, `Student.email`, `Admin.email`, `Skill.nameKey`,
`Notification.id`, `Session.sid`, …) and 8 indexes (`student_fullname`, `student_created`,
`request_status`, `role_status`, `notification_created`, `employer_status`, `session_expiry`,
`skill_active`) are created by `npm run db:init`.

### Why a graph

The eligibility check is a traversal, not a join: from one `JobRole` you walk to its required
skills, then to every student holding those skills, then to their education and experience, and
back out with a per-student verdict. Shortlisting is a relationship with metadata on it
(`SHORTLISTED_FOR`), and a notification is reachable from both the student and the role, which
makes per-recipient isolation and duplicate detection a single pattern match instead of a
multi-table reconciliation.

### Guarantees enforced in the database

- **No duplicate skills.** `skill_namekey_unique` plus a normalised `nameKey`.
- **No duplicate shortlists.** `MERGE (s)-[r:SHORTLISTED_FOR]->(j)`.
- **No duplicate notifications.** Notification ids are deterministic —
  `ntf_<roleId>_<studentId>` — created with `MERGE` inside the dispatch transaction, so a
  retried dispatch cannot create a second copy.
- **Atomic dispatch.** The status check, notification creation, relationship creation and
  `shortlistStatus = 'DISPATCHED'` write all happen in one transaction.
- **Server-side sessions.** `Neo4jSessionStore` implements the `express-session` store contract,
  so a restart does not sign anyone out and no session data lives in `localStorage`.

---

## 5. Eligibility engine

`apps/api/src/services/eligibility.service.ts` is a pure function:

```ts
evaluateCandidate(student, criteria, skillNames): CandidateEvaluation
```

It returns one `EligibilityCheck` per criterion, each with a status of
**`PASS`**, **`FAIL`**, **`MISSING`** or **`SKIPPED`**, plus `matchedSkills`, `missingSkills`,
`reasons` and the overall `eligible` flag.

| Criterion | Behaviour |
| --- | --- |
| Class 10 / Class 12 percentage | `PASS` at or above the threshold, `FAIL` below, `MISSING` when the record or score is absent |
| Undergraduate score | Compares like with like only — see below |
| Degree / branch | Case-insensitive membership of the allowed list |
| Graduation year | Membership of the allowed years |
| Active backlogs | `MISSING` when the count is unknown, `PASS` for a genuine `0`, `FAIL` above the limit |
| Experience | Sum of distinct covered months, so overlapping roles are not double counted |
| Skills | `ALL` requires every required skill; `ANY` accepts one; optional skills are reported separately |

### Two rules worth calling out

**Missing data never auto-qualifies.** An absent value produces `MISSING`, which is *not*
`PASS`. `eligible` is true only when every check is `PASS` or `SKIPPED`, so an incomplete
profile can never slip through as eligible. The admin UI shows `MISSING` separately from `FAIL`
so a student can be told "add your Class 12 result" rather than "you do not qualify".

**Scores are never converted between units.** If the employer asks for a CGPA and the student
recorded a percentage, the check is `MISSING` with an explanation — the portal does not guess a
conversion. The same applies when the CGPA scales differ (a 3.9 on a 4-point scale is not
compared against a 7.0 on a 10-point scale).

### Dispatch safety

Before creating any notification, dispatch re-runs the engine against the *current* profile. If a
selected student no longer qualifies, the whole dispatch is rejected with a `409` listing each
ineligible student and the reasons — nothing is written. The UI surfaces this rejection.

---

## 6. Security baseline

| Control | Implementation |
| --- | --- |
| Password storage | bcrypt, 12 rounds; plaintext is never stored or logged |
| Timing attacks | Login runs a dummy bcrypt comparison when no account matches, so a wrong password and an unknown email take the same time and return the same message |
| Sessions | Server-side sessions in Neo4j, HTTP-only `cc.sid` cookie, `SameSite=Lax`, regenerated on sign-in |
| CSRF | Double-submit token: readable `cc.csrf` cookie plus an `X-CSRF-Token` header, compared with `timingSafeEqual`, enforced on every `POST`/`PUT`/`PATCH`/`DELETE` |
| RBAC | `requireAuth` reloads the user from the database on every request and destroys stale sessions; `requireRole` guards each portal; `requireApprovedEmployer` blocks unapproved employers at the route level |
| IDOR | Ownership is re-checked per request (`belongsToEmployer`, recipient checks on notification reads) |
| Input validation | Zod schemas shared by client and server; unknown fields rejected where it matters; `http`/`https` only for registration URLs |
| Injection | Every Cypher query is parameterised; no string interpolation of user input |
| Rate limiting | Sign-in limited to 10 attempts per 15 minutes, registration to 30 per hour |
| Error handling | A single error middleware returns stable codes and messages; stack traces, driver errors and credentials never reach the client |
| Secrets | Everything comes from environment variables; `.env` is git-ignored and `.env.example` holds placeholders |

---

## 7. Testing

```bash
npm test
```

### Unit tests (no database required)

| File | Covers |
| --- | --- |
| `apps/api/tests/unit/eligibility.test.ts` | Thresholds, missing-data handling, score-unit safety, ALL/ANY skills, overlapping experience, explainability |
| `apps/api/tests/unit/requestWorkflow.test.ts` | Every legal and illegal request status transition |
| `apps/api/tests/unit/schemas.test.ts` | Password rules, URL protocol rules, score sanity, criteria consistency |
| `apps/api/tests/unit/rateLimit.test.ts` | The limiter returns `429` after its budget and can be skipped |
| `apps/web/tests/utils.test.ts` | Score formatting, month formatting, status labels, date helpers, cookies |
| `apps/web/tests/api.test.ts` | CSRF header, 204 handling, field-error mapping, network failure, conflict messages |
| `apps/web/tests/guards.test.tsx` | Redirects for anonymous, wrong-role and signed-in visitors |
| `apps/web/tests/NotificationItem.test.tsx` | Notification rendering, safe external link, mark-as-read flow |

### Integration tests (real Neo4j)

The DB-backed suites live in `apps/api/tests/integration/` and drive the real Express app through
Supertest, including the CSRF handshake and cookie jar.

They **wipe their target database**, so they only run against an isolated one:

```bash
# 1. Point the tests at a separate database in .env
#    TEST_NEO4J_URI=neo4j://127.0.0.1:7687
#    TEST_NEO4J_USERNAME=neo4j
#    TEST_NEO4J_PASSWORD=your-password
#    TEST_NEO4J_DATABASE=campusconnecttest

# 2. Create it (needs Neo4j Enterprise, Aura, or a second instance)
npm run db:test-setup

# 3. Run
npm run test:api
```

Safety rules in `tests/helpers/db.ts`:

- If `TEST_NEO4J_*` is incomplete, the integration suites **skip** (and say why) instead of
  silently passing.
- If `TEST_NEO4J_DATABASE` points at the application database, the suite refuses to run unless
  `TEST_NEO4J_ALLOW_SHARED_DB=true` is set explicitly.

---

## 8. API reference

All routes are prefixed with `/api`. Authentication is cookie-based; mutating requests also need
the `X-CSRF-Token` header.

### Auth

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/auth/csrf` | public | Issue/return the CSRF token |
| `POST` | `/auth/register/student` | public | Create a student account and sign in |
| `POST` | `/auth/register/employer` | public | Create a company + employer account (`PENDING`) |
| `POST` | `/auth/login` | public | Sign in (optional `role` disambiguates) |
| `POST` | `/auth/logout` | signed in | Destroy the session |
| `GET` | `/auth/me` | signed in | Current user |

### Student — `/students`

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` / `PUT` | `/me/profile` | Read / update personal details |
| `PUT` / `DELETE` | `/me/education/:level` | Upsert / delete an education record |
| `POST` | `/me/experiences` | Add an experience |
| `PUT` / `DELETE` | `/me/experiences/:id` | Update / delete an experience |
| `PUT` | `/me/skills` | Replace the selected catalogue skills |
| `GET` | `/me/dashboard` | Profile, completion, unread count, recent notifications |
| `GET` | `/me/notifications` | Paginated notifications |
| `POST` | `/me/notifications/:id/read` | Mark one notification read |
| `GET` | `/me/shortlists` | Shortlist history |

### Employer — `/employer`

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` / `PUT` | `/me/company` | Read / update the company profile |
| `GET` | `/me/requests` | Own hiring requests |
| `POST` | `/me/requests` | Create a draft (requires `APPROVED`) |
| `GET` / `PUT` / `DELETE` | `/me/requests/:id` | Read / edit / delete (draft or changes-requested only) |
| `POST` | `/me/requests/:id/submit` | Submit for review |

### Admin — `/admin`

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/stats` | Live counts |
| `GET` | `/students`, `/students/:id` | Search students / inspect one |
| `GET` | `/students/:id/notifications` | A student's notifications |
| `GET` | `/employers`, `/employers/:id` | Employer list / detail |
| `POST` | `/employers/:id/review` | Approve or reject an employer |
| `GET` | `/requests`, `/requests/:id` | Hiring requests |
| `POST` | `/requests/:id/review` | Approve / request changes / reject |
| `GET` | `/roles/:roleId/candidates` | Per-criterion eligibility (`?eligibleOnly=true\|false`) |
| `GET` / `PUT` | `/roles/:roleId/shortlist` | Read / replace the shortlist |
| `POST` | `/roles/:roleId/dispatch` | Create notifications for selected students |
| `GET` | `/dispatches` | Dispatch history with read counts |
| `GET` / `POST` / `PATCH` | `/skills`, `/skills/:id` | Skill catalogue CRUD and activation |

### Shared

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/skills` | Skill catalogue for profile and criteria pickers |
| `GET` | `/health` | Liveness and database status |

Errors always look like `{ "error": { "code": "...", "message": "...", "details"?: ... } }`.

---

## 9. Workflow reference

**Hiring request**

```
DRAFT ──submit──▶ SUBMITTED ──approve──▶ APPROVED ──dispatch──▶ (role marked DISPATCHED)
                     │  ▲
          request    │  │ resubmit
          changes    ▼  │
                CHANGES_REQUESTED
                     │
                  reject
                     ▼
                 REJECTED
```

Only `DRAFT` and `CHANGES_REQUESTED` requests are editable or submittable. Rejections and change
requests require a note. Once approved, the employer's fields are locked.

**Employer account:** `PENDING → APPROVED` or `PENDING → REJECTED`. Requests are blocked until
`APPROVED`, enforced on the server, not just in the UI.

---

## 10. Known limitations

- **In-app notifications only.** No email or SMS is sent; the notification is a record in the graph
  that the student reads in the portal.
- **Skill catalogue is admin-managed.** Students and employers can only choose existing skills;
  there is no "suggest a skill" flow.
- **Single placement cell.** There is no per-department or per-campus scoping.
- **No password reset or change-password flow.** An administrator account must be re-created with
  `npm run admin:bootstrap` after clearing the `Admin` node; a self-service reset is not
  implemented.
- **Candidate review loads all students** into memory and evaluates them per request. This is
  appropriate for a college-sized dataset, not for tens of thousands of students.
- **The web bundle is a single chunk** (~524 kB) and Vite warns about it. Route-level code
  splitting is the obvious next optimisation.
- **Integration tests need a second database.** On Neo4j Community edition, use a separate
  instance (for example a Docker container) or accept the shared-database flag described in §7.
- **No automated browser tests.** UI behaviour was verified manually against the running app;
  component logic is covered by React Testing Library.
