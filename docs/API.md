# API reference

Base path: `/api`. JSON only. Successful creates use 201, other successes 200. Errors use `{ "error": "message", "requestId": "uuid" }`. Standard statuses: 400 validation, 401 authentication, 403 authorization/origin/CSRF, 404 missing or foreign resource, 409 duplicate/stale/invalid transition, 429 login rate limit, 503 sign-in dependency failure. The API returns 404 for another student's attempt.

All writes require an `Origin` matching `APP_ORIGINS`. Except login, writes also require the opaque session cookie and `X-CSRF-Token`. Login returns `{user, csrf}` and sets `school_session`. Curl/API clients must explicitly provide the Origin header, cookie jar and CSRF token. There is no public administrator registration.

## Authentication and health

| Method | Path | Behavior |
|---|---|---|
| POST | /auth/login | `{email,password}` → user, CSRF, cookie |
| GET | /auth/me | Current user and CSRF token |
| POST | /auth/logout | Revoke current session and clear cookie |
| GET | /health/live | Process liveness |
| GET | /health/ready | PostgreSQL + Redis readiness; 503 when degraded |

## Administrator

All `/admin/*` endpoints require an administrator or a staff account with the corresponding permission.

Staff accounts may use only endpoints granted by their `StaffRoleGrant` records. Staff and role assignment itself is administrator-only to prevent privilege escalation. Students cannot access any `/admin/*` endpoint and may access only their own examination attempts.

| Method | Path | Body / response |
|---|---|---|
| GET, POST | /admin/classes | List; create `{name}` |
| PATCH | /admin/classes/:id | Rename `{name}` |
| GET | /admin/students?classId= | Up to 5,000 student records, no password hashes |
| POST | /admin/students | `{name,email,password,classId}`; password ≥12 characters |
| PATCH | /admin/students/:id | Optional `name,classId,active,password`; password/disable revoke sessions |
| GET, POST | /admin/exams | Up to 500 exams; create exam below |
| PUT | /admin/exams/:id | Replace draft and question bank; forbidden after publishing |
| PATCH | /admin/exams/:id/status | `{status?: "PUBLISHED"|"CLOSED",releaseResults?: boolean}` |
| GET | /admin/monitor?examId= | Up to 1,000 active/recent attempts (all statuses when examId supplied); counts + recent incidents |
| GET | /admin/results?examId= | Up to 10,000 submitted results |
| GET | /admin/attendance?date=YYYY-MM-DD | Recorded attendance on that date |
| POST | /admin/attendance | `{date,records:[{studentId,status}]}`; 1–500 records |
| GET, POST | /admin/payments | Recent 1,000; create `{reference,studentId,amountMinor,currency,description}` |
| GET | /admin/sync | Pending count and most recent 50 delivery states |
| GET | /admin/audit | Most recent 200 administrator mutations |
| GET, POST | /admin/staff | Administrator-only staff account management |
| PATCH | /admin/staff/:id | Administrator-only role, status and password changes; revokes sessions |
| GET, POST | /admin/staff-roles | List roles; administrator-only role creation |
| PUT | /admin/staff-roles/:id | Administrator-only permission replacement; revokes affected sessions |
| GET, PUT | /admin/settings | Remote access, personalization and school configuration; GET includes QR connection defaults and detected LAN URLs |

## Hostel management

Hostel routes require an administrator or a staff role with **HOSTEL_MANAGE**. They return 409 while **Enable hostel management module** is off in Configuration.

| Method | Path | Purpose |
|---|---|---|
| GET | /hostels/dashboard | Hostels, rooms, bed occupancy, active allocations and eligible students |
| POST | /hostels | Create name, gender policy and address |
| PATCH | /hostels/:hostelId | Update identity or enabled state |
| POST | /hostels/:hostelId/rooms | Create a room and its numbered beds |
| PATCH | /hostels/rooms/:roomId | Update room identity or enabled state |
| POST | /hostels/allocations | Check a student into an available bed |
| PATCH | /hostels/allocations/:allocationId | Check out or cancel an allocation |

A student and a bed can each have only one active allocation. Allocation writes use a serializable database transaction and are recorded in the access audit.
Exam creation/update body:

```json
{
  "title": "Mathematics, term one",
  "instructions": "Select one answer per question.",
  "classId": "class-id",
  "durationMinutes": 30,
  "startsAt": "2026-10-01T08:00:00.000Z",
  "endsAt": "2026-10-01T09:00:00.000Z",
  "questions": [
    {"prompt":"2 + 2 = ?", "points": 2, "options":[
      {"text":"4","correct":true}, {"text":"5","correct":false}
    ]}
  ]
}
```

Limit: 1–300 questions; 2–8 options each; exactly one correct option; 1–100 integer points; 1–360 minutes. The body limit is 2 MB. All datetimes use ISO UTC; the frontend converts local form times. Student email is the unique login identifier. Payment references are globally unique within a school, positive amounts use integer minor units, and the UI offers currencies with two minor decimal places. This is a receipt ledger, not a full accounting package. There is no payment processing or automatic refunds.

## Student examinations

| Method | Path | Behavior |
|---|---|---|
| GET | /exams | Non-draft exams assigned to current class; existing attempt IDs |
| POST | /exams/:id/start | Admit or return existing attempt; random order fixed on first start |
| GET | /exams/attempts/:id | Resume; expired attempts finalize before response |
| POST | /exams/attempts/:id/answers | Atomic full answer snapshot |
| POST | /exams/attempts/:id/submit | Save valid on-time snapshot and finalize atomically |
| POST | /exams/attempts/:id/incidents | `{kind:"WINDOW_BLUR"|"FULLSCREEN_EXIT"|"PAGE_HIDDEN"}` |

Answers and submit use the same format:

```json
{"expectedRevision":0,"requestId":"12345678-1234-4123-8123-123456789abc","answers":{"question-id":"option-id"}}
```

The answer map is a complete snapshot. Omitted answers are cleared. A client has at most one request in flight, retains its request ID/body until acknowledged, then advances its revision. A duplicate of the last save returns the current revision. A different request with an old revision returns 409. After submission, further saves are idempotent status reads and never alter marks. After the deadline, late payloads are ignored and the last committed answers are graded. The response includes `serverNow`, `revision`, `status` and scores only when released. Question payloads never include the `correct` flag.

## Academic management

All routes below require a session. Staff writes also require the named permission and are limited to courses/classes assigned to that staff member.

| Method | Path | Purpose |
|---|---|---|
| GET | /academics/catalog | Sessions, terms, subjects, permitted courses and students |
| POST | /academics/sessions, /subjects, /courses | Build the academic catalogue |
| PUT | /academics/courses/:id/rubric | Replace a 100% course rubric |
| GET, POST | /academics/assignments | List or post class assignments |
| POST | /academics/assignments/:id/submit | Create or replace the current student submission before its deadline |
| PATCH | /academics/submissions/:id/grade | Score a submission and add feedback |
| GET, POST | /academics/materials | List or publish protected study files |
| POST | /academics/grades | Upsert a rubric-linked score |
| GET | /academics/reports/:studentId/:termId | Calculated report, component scores, rank, class average, grade analysis, attendance and saved presentation settings |
| PUT | /academics/reports/:studentId/:termId/comments | Partial update of comments, template key, learner metadata, publish state and 1–5 affective/psychomotor ratings |
| PUT | /academics/promotion-rules | Promotion thresholds and destination class |
| POST | /academics/promotions/preview | Persist a reviewable promotion batch |
| POST | /academics/promotions/:id/apply | Apply a preview exactly once |
| POST, GET | /files, /files/:id | Validated 10 MB upload and authorized download |
| GET | /assets/:id | Public image only when selected as current branding |

Allowed uploads are PDF, PNG, JPEG and plain text. File identifiers can only be attached by the account that uploaded them. Student downloads are limited to their class assignments/materials and their own submissions.

## Socket.IO

Same origin `/socket.io`, cookie credentials plus handshake `auth: {csrf}`. Untrusted origins and invalid sessions are rejected. Only administrators join the `admins` room. `monitor:update` carries an attempt ID (or empty refresh hint); clients reload authorized monitoring data over HTTP. Students emit `heartbeat` with `{attemptId}` every ten seconds; ownership is rechecked before updating presence. Sessions are revalidated every 30 seconds and on heartbeat. Presence is advisory; a stale timestamp does not stop an exam.

The single central API is the supported deployment topology. Horizontal Socket.IO scaling requires a shared adapter and coordinated capacity planning, neither enabled by this Compose file.

## Extended administration, ratings and attendance

| Method | Path | Purpose |
|---|---|---|
| POST | /admin/students/import | Import up to 2,000 student rows from the client-validated CSV structure |
| POST | /admin/staff/import | Administrator-only staff account and class-scope import |
| POST | /admin/results/import | Import rubric-linked component results; course scope is enforced per row |
| POST | /admin/attendance/import | Import dated attendance; class-management scope is enforced per row |
| GET | /admin/students/:id/profile | Authorized tabbed profile data, grade history, ratings and attendance |
| GET, POST | /admin/attendance/windows | List or activate a timed self-marking window for an assigned class |
| POST | /admin/attendance/windows/:id/approve | Approve pending student marks for the class and date |
| PATCH | /academics/subjects/:id | Edit a registered subject (administrator only) |
| GET, PUT | /academics/ratings, /academics/ratings/:studentId/:termId | Read or save affective, psychomotor and extra-curricular ratings |
| GET, POST | /academics/reports/class/:classId/:termId | Preview or generate report cards for every active student in a class |
| GET, POST | /academics/attendance/self | Student reads an attendance window or submits PRESENT/LATE for review |

Class-wide operations require an explicit class assignment or class-teacher appointment. A subject teacher may grade and import results only for the exact assigned class/subject course. Course assignment does not grant access to full student profiles, medical data, attendance approval, payments or whole-class reports.

The academic catalogue returns only the staff member's class-wide courses and direct class/subject teaching assignments. CBT creation therefore does not depend on `CLASSES_MANAGE`. Staff library listing and file delivery use the same paired scope: the teacher's own uploads, resources targeted to a class-wide assignment, and resources whose class/subject combination matches a visible teaching course. A subject match does not expose material targeted to a different class.

## Mailing and SMS

All communication routes require `COMMUNICATIONS_MANAGE`. Staff results are restricted to classes they manage or lead; administrators can use the whole-school audience. Provider credentials are never returned by the API.

| Method | Path | Purpose |
|---|---|---|
| GET | /communications/overview | Provider readiness, authorized classes and delivery counts |
| GET | /communications/recipients | Paginated authorized recipient picker with destination availability only |
| GET | /communications/campaigns | Paginated campaign history and grouped delivery states |
| GET | /communications/campaigns/:id/recipients | Masked paginated delivery details |
| POST | /communications/campaigns | Queue email/SMS for `INDIVIDUAL`, `CLASS`, or administrator-only `ALL` audience |
| POST | /communications/campaigns/:id/cancel | Sender or administrator cancels queued deliveries |
| POST | /communications/campaigns/:id/retry | Sender or administrator retries terminal failures |

Campaign creation accepts `audienceType`, optional `classId`, `studentIds`, `recipientType` (`STUDENT`, `GUARDIAN`, or `BOTH`), `channels`, `subject`, and `body`. Contacts with invalid destinations or disabled preferences are excluded. The service rejects an empty eligible audience.
