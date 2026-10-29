# Campus Connect

Campus Connect is a campus placement platform that connects three groups in one
place: **students**, **recruiters**, and **institutes** (colleges and
universities).

Recruiters send structured hiring requests to any registered institute. The
institute checks who is actually eligible, shortlists candidates, and dispatches
them. Students keep one verified academic profile and are told when they are
shortlisted — in the app and by email.

---

## Who it is for

| Role | Signs up with | What they do |
| --- | --- | --- |
| **Student** | Their institute + the institute's shared student code | Keep one academic profile up to date, pick skills from the institute's catalogue, read shortlist notifications |
| **Recruiter** | Company name + verified company email | One account for every institute: create hiring requests, send them to as many institutes as they like, follow their review |
| **Institute administrator** | AISHE code + verified contact email | Review incoming requests, evaluate students, dispatch shortlists, manage the skill catalogue and the student code |

A student belongs to exactly one institute. A recruiter belongs to none — they
are independent, and one recruiter account can approach many institutes. Each
institute has its own administrator account, created only through the verified
registration flow.

---

## How registration works

### Institute

1. The administrator enters their **AISHE code** and a **contact email**.
2. The code is checked against the official AISHE directory bundled with the
   app (about 70,000 institutions). The institute's name, state and district come
   from that directory — never from what the browser sends.
3. A 6-digit code arrives by email. It expires in 10 minutes and allows five
   attempts.
4. After the code is confirmed, a **single-use registration link** is emailed. It
   expires after 60 minutes and works once.
5. The administrator chooses a username and password. The institute, its
   administrator and a 32-character student code are created together.

An institute only exists after step 5. A second person cannot take over a
registration that is already in progress, and an AISHE code that is already
registered is sent to sign-in or password recovery instead of creating a
duplicate.

### Recruiter

The same sequence, keyed on the company name instead of an AISHE code. Company
names are compared after trimming, collapsing repeated spaces and ignoring case,
so "Acme  Solutions" and "acme solutions" are the same company. No institute is
chosen and no AISHE code is collected.

> Different real businesses can occasionally share a name. Campus Connect treats
> the normalised name as the identity of the company; it does not verify legal
> ownership.

### Student

The student picks their institute from the public list and enters the shared
student code for that institute. Both are checked together on the server, so a
code from another institute is rejected. Registration is immediate — no email
step is needed.

### What verification proves

- An AISHE code proves the institution exists in the official directory.
- An email code proves access to that mailbox.
- Neither one proves that the person has authority to act for the institute, or
  that they own the company. The interface says so plainly rather than implying
  more.

---

## Student verification codes

Each institute has one **32-character student code**. It is shown only to that
institute's administrator, on the institute dashboard. The code is stored as a
hash, so it cannot be read out of the database, and it is never included in the
public institute list.

An administrator can rotate the code at any time. Rotation affects **future
registrations only** — students who have already signed up keep their accounts
and their institute.

---

## Hiring requests

```
Recruiter drafts a request  →  DRAFT
        │ submit
        ▼
   SUBMITTED  ──►  APPROVED  ──►  shortlist  ──►  dispatch  ──►  students notified
        │              ▲
        ├──►  CHANGES REQUESTED  (recruiter edits and resubmits)
        └──►  REJECTED
```

A request contains one or more roles, each with its own eligibility criteria:
CGPA and backlogs, graduation year, branches, minimum experience, and required
skills. The recruiter chooses the recipient institute when submitting, and can
submit the same or different requests to other institutes from the same account.

Only the receiving institute can see a request. Only the recruiter who sent it
can see it on the recruiter side. Once a role is dispatched the shortlist is
locked and a second dispatch is refused.

### Eligibility

Eligibility is recalculated twice — when the institute filters its students, and
again inside the dispatch step. Every criterion returns *pass*, *fail*,
*missing* or *not applicable*, and a student is eligible only when nothing fails
or is missing. Missing data never counts as a pass, and values are never
converted between scales (a CGPA requirement is only compared against a CGPA on
the same scale).

---

## Email and notifications

Email is used for account verification, registration links, password resets,
and — if the recipient wants them — product notifications:

| Always sent (account and security) | Optional (can be switched off) |
| --- | --- |
| Verification codes | New hiring request received (institute) |
| Registration links | Hiring request submitted (recruiter) |
| Password reset links | Request approved, rejected, or changes requested |
| Registration confirmations | Shortlist and dispatch updates |

Every account has an **Email notifications** switch on its settings page. The
preference is stored on the account and enforced by the server, so switching it
off really stops the optional emails. Account and security emails are always
delivered, because registration and password recovery cannot work without them.

---

## Signing in

- One sign-in page, with a tab for **Student**, **Recruiter** or **Institute**.
- Students sign in with their email. Recruiters and institute administrators can
  use either their email or their username.
- **Sessions last 10 minutes** by default. Tick **Remember me for 7 days** to stay
  signed in on a personal device. The limit is enforced by the server, not only
  by the browser.
- **Forgot password** sends a single-use link that expires in 30 minutes. Choose
  your account type first, so a reset can never change a different account that
  happens to use the same address. A successful reset signs out every other
  device using that account.

---

## Deleting your account

Every account has a **Delete account** section on its settings page. It lists
what will be removed for that account type, and asks for your password plus a
typed `DELETE` before anything happens. There is no waiting period and no
recovery.

- **Student** — the account, profile, education, experience and notifications are
  deleted immediately and you disappear from your institute's student list. Any
  shortlist you were part of stays in the institute's history, marked
  “This student no longer exists on the platform.”, with no personal details.
- **Recruiter** — the account and company profile are deleted. Hiring requests you
  already sent stay with the institutes you sent them to, but they become
  read-only and show “This recruiter no longer exists on the platform.”
- **Institute administrator** — the institute, its administrator login and every
  student account belonging to it are deleted. Recruiters keep the requests they
  sent as read-only history, shown as “This institute no longer exists on the
  platform.”

A confirmation email is sent before anything is removed: if it cannot be
delivered, the deletion is cancelled and your account is left exactly as it was.
Every session for the account is invalidated, so no browser or tab stays signed
in.

---

## Using the app

**Students** — *Overview* summarises your profile completeness and recent
activity; *My profile* holds personal details, education, experience and skills;
*Notifications* lists shortlist and dispatch updates; *Settings* holds your email
preference and the delete-account option.

**Recruiters** — *Overview* shows request counts by status; *Company profile*
holds company details; *Hiring requests* lists every request you have sent, with
a detail page for each role and its review history; *Settings* holds your email
preference and the delete-account option.

**Institute administrators** — *Overview* shows pending requests and the student
verification code; *Students* lists your students with eligibility detail;
*Skills* manages the catalogue students choose from; *Hiring requests* is the
review queue; *Dispatches* shows what has been sent; *Settings* holds your email
preference and the delete-account option.

The interface has a light and a dark theme. Light is the default; the toggle in
the header remembers your choice and applies it before the page paints, so there
is no flash of the wrong theme.

---

## What is new in this version

- Redesigned interface with a full dark theme across every page and component.
- Consistent **Student / Recruiter / Institute** terminology throughout.
- Institute registration verified against the official AISHE directory, with
  email verification and single-use registration links.
- Independent recruiter accounts with normalised company-name uniqueness.
- One shared 32-character student code per institute, rotatable by the
  administrator, with no per-student codes.
- Hiring requests that let one recruiter approach many institutes, with
  institute-level isolation and recruiter ownership enforced on every request.
- Email notifications with a saved preference for each account type.
- Forgot-password flow for all three account types.
- 10-minute sessions by default, 7 days with **Remember me**.
- Self-service account deletion for all three account types, with password
  confirmation, immediate removal, and read-only historical records that show
  “This student / recruiter / institute no longer exists on the platform.”

---

## Coming features

These are planned for future releases. **None of them are available yet** — they
are listed here so you know what is being worked on, not as a description of
current behaviour.

### Enhanced frontend experience
A more refined interface across the product: smoother page transitions, tasteful
motion on lists and dialogs, and a closer pass on spacing and typography at
smaller screen sizes.

### Campus Connect branding
A dedicated logo, a documented colour and type scale, and a consistent visual
identity across the app, emails and browser icons, replacing the current
text-only wordmark.

### Account deletion and recovery
Deletion is immediate today, with no way back. A future release will add a short
recovery window: the account is deactivated straight away and removed
permanently after a set period, giving people a chance to change their mind
before their data is gone for good.

### Data export
The ability to download your own data — profile and education for students,
company profile and requests for recruiters, students and hiring history for
institutes — in a readable format, before or instead of deleting the account.

### Institute-led student verification
Today a student joins an institute by entering the institute's shared 32-character
code. A future release will replace that with institute-controlled verification:
the student registers, the institute reviews and approves the request, and the
shared code is retired. Until then the existing student code keeps working
exactly as described above.

---

## For developers

Setup, environment variables, database initialisation, deployment and
troubleshooting live in [DEPLOYMENT.md](DEPLOYMENT.md).

```bash
npm install          # install dependencies
npm run dev          # API on :4000 and web on :5173
npm run typecheck    # type-check all workspaces
npm test             # API + web test suites
npm run build        # production build of both apps
```

Stack: React 18 + Vite + TypeScript + Tailwind on the front end; Node.js +
Express + TypeScript + Neo4j on the back end; Vitest, React Testing Library and
Supertest for tests.
