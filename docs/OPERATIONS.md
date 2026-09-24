# Operations runbook

## Before the first real examination

- Reserve the central server's LAN address and configure exact allowed origins. Permit the web port through the host firewall only on the intended school subnet.
- Deploy HTTPS with a certificate trusted by every client and set `COOKIE_SECURE=true`. Test login and Socket.IO using the actual student URL. The default HTTP profile is a setup profile.
- Set strong database/admin/cloud credentials. Store `.env` in an access-controlled location. The Docker database/Redis services have no public port mapping by default.
- Synchronize the server clock with your trusted time source. Never adjust the clock during an exam. The API owns admission/deadlines; client display time is advisory.
- Put the central server and switch/access point on a UPS. Do a backup and a trial restore, then test a sample exam from representative devices.
- Use supported Chrome/Edge/Firefox versions. Browser fullscreen support varies on tablets; test the actual managed kiosk policy. Instruct students to use one tab/device per attempt.
- Run CI/integration tests and a representative load exercise. Check database disk space and pending sync records. Provision exam windows and session duration so the session remains valid through the full exam (default 12h).

## Capacity

The default connection pool is 20 per process. Autosave is deliberately write-through to PostgreSQL: up to 300 response rows per snapshot, one transaction per student every five seconds. This prioritizes durability over maximum throughput. Redis holds revisioned answer snapshots with a one-day TTL, but is not a durable-only queue. Benchmark actual question counts and hardware; no unmeasured concurrency guarantee is made.

Admission serializes starts briefly on the exam row to protect uniqueness/publication transitions. Deadline processing finalizes batches of 100 every two seconds and catches up after restarts. On very large cohorts, expiry completion may lag the deadline; no post-deadline answers are accepted during that lag. Stagger start times if many devices arrive simultaneously. Watch p95 save latency and database connection use. Leave substantial headroom below the five-second save interval.

Dashboard lists have explicit bounds: 5,000 students, 500 exams, 1,000 monitor rows, 10,000 results. Add paginated server/client views before exceeding those sizes. The admin overview fetches several lists; it is designed for a single school, not a district warehouse. The UI can filter result exports by exam title; API clients can filter by exact exam ID. Use unique exam titles for clarity.

## Backup and restore

Run `sh scripts/backup.sh` or `powershell -File scripts/backup.ps1`. Each run creates a PostgreSQL custom-format dump and a matching archive of `data/uploads` under `backups/`. Keep both files together in encrypted, access-controlled off-server storage. The database contains file metadata only; logos, signatures, student photos, assignment attachments, and library files cannot be restored from the database dump alone. Backup completion is not enough: validate a restore periodically. Redis can be rebuilt from PostgreSQL and is not needed for answer recovery. The answer cache will refill as attempts are read/saved.

Safe validation restore into a **new database** (POSIX example):

```sh
docker compose cp backups/school-YOUR_TIMESTAMP.dump db:/tmp/restore.dump
docker compose exec db sh -c 'createdb -U "$POSTGRES_USER" school_restore_check'
docker compose exec db sh -c 'pg_restore -U "$POSTGRES_USER" -d school_restore_check --no-owner --exit-on-error /tmp/restore.dump'
docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d school_restore_check -c "SELECT count(*) FROM \"Attempt\";"'
```

Inspect key student/result counts and verify application access against the restored database before planning a cutover. Do not restore over a live school database. Stop admissions and writes, take a final backup, then deliberately change the application to the verified database during a maintenance window. Review any cloud/local gap as described in `CLOUD-SYNC.md`.

Restore the matching upload archive into the project `data/uploads` directory before starting the API. Preserve the generated storage filenames exactly. The API resolves a relative `UPLOAD_DIR` from the project root so local workspace commands and Docker-style deployments refer to one stable location.

## Outage behavior

| Failure | Effect / response |
|---|---|
| Internet unavailable | LAN application continues. Cloud events remain queued and retry. |
| Student loses LAN | Unsent tab draft is retained when browser storage permits; server grades previously acknowledged answers at deadline. |
| Redis unavailable | Existing authenticated answer saves still commit in PostgreSQL. New logins return 503 because shared login rate limiting is unavailable. Readiness reports degraded. |
| PostgreSQL unavailable | Saves fail visibly and clients retry. Do not treat a local draft as acknowledged. Restore database service and assess impact before continuing. |
| API restarts | Sessions and attempts persist. Socket.IO reconnects. Expired attempts finalize on the next sweep. |
| Whole server power failure | UPS recommended. PostgreSQL recovery and restart are required; backups protect against disk loss, not just process failure. |

Never promise students that disconnected, unacknowledged answers were received. Use the server's durable response revision and result records when investigating.

## Updates and migrations

Back up before updating. Pull/build images and dependencies while internet is available, then run `docker compose up -d --build` during a maintenance window. The one-shot migrate service uses committed Prisma migrations (`migrate deploy`), not `db push`. Do not regenerate the initial migration after deployment; create a new migration for future schema changes. `scripts/generate-migration.mjs` is only a bootstrap maintainer utility.

Prisma 6.12 is deliberately pinned for the traditional schema datasource/client API and to avoid the affected configuration dependency chain found in the initial Prisma 6.19 security scan. Dependencies are reproducible through `package-lock.json`. Review and update security patches regularly, and run schema generation and integration tests when upgrading Prisma. Docker base image tags should be pinned to your organization's approved image digests for a controlled release.

## Logs, privacy and retention

Use `docker compose logs --tail=100 api worker`. Internal errors are logged server-side; clients receive a request ID. Never paste `.env`, cookies, password hashes or cloud bearer tokens into support chats. Admin mutations are stored in `AuditLog`; exam focus events in `Incident`; sync delivery state in `SyncLog`.

Agree retention with the school before purging results, attendance, payment records, focus events and audit logs. No automatic deletion of school records is enabled. Cloud sync logs retain payloads after delivery for replay/audit. Session expiration cleanup runs in the worker even when cloud delivery is disabled. Add a scheduled authenticated backup mechanism appropriate to your host.

## Deliberate scope boundaries

This implementation supports administrators and students, one attempt per exam, MCQ marking, class rosters, attendance and payment receipt records. It does not include teacher/parent portals, timetable generation, essay/manual grading, fee invoicing, refunds, file uploads, MFA, self-service password recovery, two-way cloud merge, or OS-level lockdown. Extend those only with explicit workflows and tests.
