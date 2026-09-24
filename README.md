# Schoolhouse — School Management SaaS + CBT

**Local Windows SQL Express setup:** see `docs/LOCAL-SQL-SERVER.md`. The original PostgreSQL deployment below is also retained. Select the correct database provider and regenerate the Prisma client before starting.

A centrally hosted school operations platform with an Express 5 API, React/Vite interface, Prisma/PostgreSQL persistence, Redis answer snapshots, Socket.IO monitoring, and durable background jobs. Each deployment serves one school workspace from a canonical HTTPS origin.

## What is included

- Administrator login; student registration with webcam capture or image upload, class assignment, password reset and account disabling.
- Staff accounts with administrator-defined roles and least-privilege permissions for classes, students, exams, monitoring, results, attendance, payments, synchronization and settings. Students remain restricted to their own assigned exams and attempts.
- School branding colors/name/tagline, academic configuration, autosave interval and fullscreen policy.
- Logo, watermark, contact details, grading boundaries, active term/session, currency, passing mark, principal identity and persistent attachment storage.
- Staff profiles with employee numbers, qualifications, class/subject assignments, salary and payroll state, credential reset and a dedicated searchable, paginated access log.
- A protected library for PDF, image and text materials. Teachers see their own uploads plus resources for their class-wide assignments and exact class/subject teaching courses. Students see global and enrolled-class materials.
- Optional hostel management with configuration-level on/off control, hostel blocks, rooms, generated bed spaces, occupancy summaries, student check-in/check-out and a dedicated staff permission.
- A permission-scoped communications centre for individual, class, or school-wide email and SMS to students and guardians, backed by a durable outbox with retries, delivery history, consent preferences, and masked destinations.
- Server-enforced staff data scope across administrative class, student, CBT, result, attendance and payment operations.
- CBT creation uses the teacher's course assignments directly, allowing subject teachers to select the matching class without requiring class-management permission.
- Searchable staff, class, student, exam, result, attendance, payment and academic views, with focused popup forms for create and edit actions.
- CSV import centre for students, staff, attendance and rubric-linked results, with downloadable templates, per-row validation and correction feedback.
- A separate role-aware staff dashboard showing only authorized tools, assigned classes, assigned courses and permitted records.
- Tabbed student profiles with demographics, emergency contacts, last login, subject performance charts, medical notes and cumulative affective, psychomotor and extra-curricular ratings.
- Teacher-led attendance sessions let students self-mark present or late during a timed window; teachers can review, amend and approve the final register.
- Individual and whole-class report-card generation, including printable page-separated class batches and developmental/activity ratings.
- Teacher assignment to classes and named course teaching assignments, plus an in-app glossary for sessions, terms, classes, subjects, courses and rubrics.
- Timed or untimed tests with MCQ, true/false, short-text and essay prompts; assignments, protected attachments, submissions, feedback and study materials.
- Rubrics whose components must total 100%, ranked report cards with attendance/comments, print-to-PDF output, promotion previews and one-time batch application.
- Six administrator-selectable report-card templates inspired by the supplied nursery, term, mid-term, grid and college samples. Each report stores learner metadata, affective-domain ratings (including honesty and neatness), psychomotor ratings, attendance, grade analysis, comments, promotion status, signatures and next-term information per learner and term.
- Mid-term and end-of-term progress reports based on the supplied school layouts, with curriculum narratives, learning and conduct ratings, teacher/administrator comments, signatures, draft publishing and a branded printable view.
- Isolated report printing that embeds permitted images before opening the browser print dialog, preventing blank print-to-PDF output on LAN clients. Missing branding files fall back visibly and can be replaced from Personalization.
- Classes, exam drafts, question/option editor, exactly one correct option per MCQ, weighted marking, publishing and score release.
- One randomized attempt per student per exam, with stable question/option order across reloads.
- Five-second autosave, request IDs for retries, optimistic revisions for multi-tab conflicts, PostgreSQL row locks for save/submit races, and Redis answer caching.
- Authoritative server deadlines, browser timer submission and server-side deadline sweeps even when clients disconnect.
- Fullscreen requests, focus/visibility incident recording, answer navigation and submission confirmation.
- Administrator activity monitoring over authenticated Socket.IO, with ten-second HTTP polling fallback.
- Result tables and CSV export, attendance records, append-only payment receipts (integer minor units), audit logs.
- Transactional synchronization outbox, leased batches, exponential retry with jitter, and idempotent reference cloud receiver.
- Docker Compose, initial SQL migration, startup/backup scripts, tests, CI workflow and operational documentation.

This is a deployable source implementation, not a claim of independently certified production readiness. Read `docs/VALIDATION.md` for checks actually run and outstanding deployment checks. Test with your intended number of devices and have an invigilator supervise the first sessions.

## Quick start — hosted deployment

Requirements: a Linux host with Docker Engine and Compose v2, a DNS name, TLS termination, and persistent storage for the database, Redis, uploads, and backups.

1. Clone the repository and open a terminal in `schoolhouse-saas`.
2. Copy `.env.example` to `.env`.
3. Set `POSTGRES_PASSWORD` to a random password and set the matching password in `DATABASE_URL`. Use URL-safe characters or percent-encode the connection URL password. Set a unique `ADMIN_PASSWORD` of at least 16 characters; placeholder passwords are rejected. Do not commit `.env`.
4. Set `APP_ORIGINS` to the exact HTTPS application URL, for example `https://school.example.com`. Do not use paths or wildcards.
5. Run `docker compose up -d --build`, or `powershell -File scripts/start.ps1` on Windows / `sh scripts/start.sh` on Linux.
6. Point the TLS reverse proxy at the web service, open the HTTPS application URL, and sign in with `ADMIN_EMAIL` and `ADMIN_PASSWORD`.
7. Create a class, register students, create an exam draft with questions and an opening window, then publish. Sign in as a student on a second device and complete a trial exam.

Compose starts PostgreSQL and Redis, applies committed migrations, creates the first administrator, then starts the API, worker, and Nginx services. Publish only the web gateway through an HTTPS reverse proxy. A repeated seed leaves an existing administrator password unchanged.

Useful commands:

```sh
docker compose ps
docker compose logs --tail=100 api worker migrate seed
docker compose restart api worker
docker compose down
```

`docker compose down` preserves named database volumes. Do not add `-v` unless intentionally erasing all school data. Changing the PostgreSQL password in `.env` does not rotate the password inside an existing database volume; perform a database password change and update configuration together.

## Running without application containers (development)

Use Node.js 22.12+ and npm. PostgreSQL 16 and Redis 7.4 are required. Run these dependencies with Docker or your own local installation:

```sh
docker compose -f compose.yaml -f compose.dev.yaml up -d db redis
npm ci
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

The root `.env` is loaded by the application and seed. Prisma CLI commands need `DATABASE_URL` in the shell or `backend/.env`; see the convenience environment wrapper in `scripts/env-run.mjs`. Root database commands use that wrapper. Keep `http://localhost:5173` in `APP_ORIGINS` for Vite. The frontend proxies API and Socket.IO to port 3000. Run `npm run worker -w backend` in another terminal for background sync. Development dependency ports bind to loopback only.

## Firebase App Hosting

The repository can also deploy as a single Firebase App Hosting backend. The
App Hosting build produces the React bundle and Express serves it together with
the API and Socket.IO endpoint. Firebase SQL Connect provisions the managed
Cloud SQL for PostgreSQL database, while Prisma connects to that database for
the existing transactional server data layer. Firebase Storage replaces local
upload persistence when `FIREBASE_STORAGE_BUCKET` is configured.

See [Firebase deployment](docs/FIREBASE-DEPLOYMENT.md) for resource provisioning,
required secrets, SQL Connect deployment, migrations, and production scaling.

## Examination behavior

An exam's close time is a hard upper bound on every attempt. A student starting late receives `min(duration, remaining window)`. Server time controls admission, saving and marking. Published questions/keys cannot change; create another exam to correct published material. Closing entry prevents new attempts but allows existing attempts to continue to their original deadline. Score release can be toggled independently.

Each successful autosave commits a complete answer snapshot in PostgreSQL before acknowledging it, then writes a revisioned cache snapshot into Redis. Redis failure does not lose acknowledged answers. Redis is not used as the only source of grading truth. New logins fail closed while Redis abuse controls are unavailable; existing sessions can keep saving through PostgreSQL.

The browser retains an unacknowledged draft in per-tab `sessionStorage` and retries the same request ID after a timeout. Reload and resume in the same tab to recover that draft. A revision conflict requires reloading the authoritative server state; do not intentionally open one attempt on multiple devices. Signing out or closing the tab is not an offline backup. A browser cannot deliver new answers during a LAN outage, and late answers are rejected. The server submits the last acknowledged snapshot at the deadline. A total server outage delays finalization until the API restarts.

Database dumps do not contain uploaded file bytes. Always keep the matching uploads archive produced by `scripts/backup.ps1` or `scripts/backup.sh`; it contains school branding, signatures, photos, attachments, and library files.

The UI requests fullscreen and logs exits/blur/hidden events. Browser JavaScript cannot prevent OS shortcuts, screenshots, another device or all tab switching. Use managed Chrome/Edge kiosk policies or a dedicated lockdown browser for high-stakes exams. Focus events are evidence for review, not automatic cheating verdicts. There is no webcam recording or biometric proctoring.

## Cloud synchronization

Leave `CLOUD_SYNC_URL` empty for purely local operation. To enable sync, use a trusted HTTPS URL ending in `/v1/sync`, a secret `CLOUD_SYNC_TOKEN` of at least 32 characters, and a stable `SITE_ID`. Restart the worker after changes. The worker sends only result, attendance and payment events; it does not replicate credentials, exam question banks or the entire database.

`backend/src/cloud.js` is a working reference receiver intended for **a separate cloud deployment and database**. Deploy the server image with `npm run cloud -w backend`, a separate `DATABASE_URL`, matching `SITE_ID` and token, and a TLS reverse proxy. Apply the same migration first. It stores a deduplicated immutable event ledger in `CloudReceipt`; it does not perform two-way reconciliation or provide a cloud school UI. See `docs/CLOUD-SYNC.md` for the contract, restore and replay semantics.

## Security and operations

Use a trusted LAN HTTPS reverse proxy or install a local-CA certificate on managed clients, set `COOKIE_SECURE=true`, and update `APP_ORIGINS` to the HTTPS origin. Keep database and Redis ports private. The Nginx `web` service may sit behind your TLS terminator; bind its published port to loopback when both are on the same host. Do not expose the default HTTP port directly to the public internet. See `docs/OPERATIONS.md` for backup/restore, capacity planning, clock synchronization and launch checks.

Passwords use bcrypt; session cookies are HTTP-only, SameSite Strict, opaque and backed by PostgreSQL. Writes require a trusted Origin and per-session CSRF token. Admin permissions are checked server-side. API errors omit internal details and carry request IDs. Login rate limits are shared in Redis. Administrator mutation audits contain actor/action/entity IDs, not passwords.

## Validation

```sh
npm run check
npm test
```

Integration tests require a **disposable PostgreSQL database whose name contains `test`**, Redis, and explicit environment variables. They insert test fixtures and leave them for inspection; drop/recreate the test database between full runs. Never point tests at school data.

```sh
# Example POSIX shell, after creating school_test:
export NODE_ENV=test
export DATABASE_URL='postgresql://school:testpass@localhost:5432/school_test'
export REDIS_URL='redis://localhost:6379'
export APP_ORIGINS='http://localhost:5173'
export SITE_ID='integration-school'
npm run db:migrate
npm run test:integration
```

PowerShell uses `$env:NAME='value'` for each variable. `.github/workflows/ci.yml` provisions real PostgreSQL/Redis, applies migrations, runs tests and builds both Docker targets. Domain tests cover weighted marking, option isolation, deadline bounds, permutation integrity and retry backoff. Integration tests cover authorization, CSRF, concurrent starts, idempotent saves, stale revisions, score privacy, atomic grading/outbox creation, deadline sweeps, attendance/payments and sync retry/acknowledgement.

## Repository map

See `docs/FILE-TREE.txt` for the generated complete source inventory. Main locations:

```text
config/features.json
backend/
  prisma/schema.prisma, migrations/, seed.js
  src/app.js, server.js, auth.js, admin.js, academics.js, hostels.js, exams.js
  src/domain.js, config.js, db.js, sync.js, worker.js, cloud.js
  src/communications.js, communication-service.js, communication-domain.js
  test/domain.test.js, communication-domain.test.js, integration.test.js
frontend/
  src/main.jsx, Admin.jsx, Academic.jsx, Communications.jsx, ReportCard.jsx, StudentAcademic.jsx, ProgressReports.jsx, HostelManagement.jsx, progress-report.css, StaffSettings.jsx, StudentPhoto.jsx, Library.jsx, Student.jsx, api.js, style.css
deploy/nginx.conf
scripts/start.ps1, start.sh, backup.ps1, backup.sh, env-run.mjs
docs/API.md, CLOUD-SYNC.md, COMMUNICATIONS.md, OPERATIONS.md, SECURITY-REVIEW.md, VALIDATION.md
.github/workflows/ci.yml
compose.yaml, compose.dev.yaml, Dockerfile, .env.example
package.json, package-lock.json
```

Design references: [Prisma production migrations](https://www.prisma.io/docs/orm/v6/prisma-client/deployment/deploy-database-changes-with-prisma-migrate), [Socket.IO authentication middleware](https://socket.io/docs/v4/middlewares/), [PostgreSQL row locking](https://www.postgresql.org/docs/16/explicit-locking.html).

## Feature switches

Edit `config/features.json` to enable or disable CBT, assignments, library, attendance, reports, hostel, payments, cloud sync, communications, email, or SMS. Restart the API and worker after a change. A matching `FEATURE_*` environment value overrides the file for deployments that need locked settings. Disabled modules disappear from navigation and their API routes return 404. The Configuration page shows the effective state; its hostel setting provides an additional day-to-day on/off control.

Navigation is grouped by Home, People, Teaching, Assessment, Reports, Operations, and System. Groups and shortcuts are filtered by role permissions and enabled modules.

Browser access is served from the canonical application URL. Configure its exact origin in `APP_ORIGINS`; origin policy is deployment-owned and cannot be changed from the school administration UI. See [Security review](docs/SECURITY-REVIEW.md).

Library PDFs open inside the authenticated application viewer without a download action. This discourages ordinary downloading but cannot prevent screenshots or advanced copying after a document has been displayed.

Email and SMS providers are disabled until configured in `.env`. See [Mailing and SMS setup](docs/COMMUNICATIONS.md) for SMTP, generic SMS, Twilio, recipient preferences, worker behavior, and test-mode delivery.
