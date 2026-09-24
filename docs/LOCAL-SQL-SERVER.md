# Windows SQL Express setup

The project supports the original PostgreSQL deployment and a native Windows SQL Server profile. The current local profile targets `SQLEXPRESS` on `127.0.0.1,14333`, database `Schoolhouse`, using the signed-in Windows account. Existing `MYDB` data is not migrated or modified.

SQL Server's schema is in `backend/prisma-sqlserver`, with its own committed migration history. SQL Server uses NVARCHAR JSON documents and check constraints in place of PostgreSQL JSON and enum types. Provider helpers implement SQL Server row locks, UTC clock queries and sync batch leasing. Do not apply PostgreSQL migrations to the SQL Server database.

The private root `.env` sets `DATABASE_PROVIDER=sqlserver`. Root `npm run db:generate` and `npm run db:migrate` select the corresponding schema automatically. After changing the provider, regenerate the Prisma client. Direct backend workspace commands default to PostgreSQL unless `--schema prisma-sqlserver/schema.prisma` is supplied.

## Local services

- API: `node backend/src/server.js` (port 3000).
- Worker: `node backend/src/worker.js`.
- Frontend: `npm run preview -w frontend -- --port 4173 --host 127.0.0.1` after `npm run build`.
- Root `.env`: local settings, excluded from source archives.
- `scripts/start-local.ps1`: starts API and worker in hidden processes with logs under `local/`.
- Private access details are delivered separately in `outputs/LOCAL-ACCESS.txt`; do not distribute that file.

Redis was not installed on this computer, so this profile explicitly uses a bounded single-process memory cache. Answers, results, users, sessions and synchronization records still persist in SQL Server. Local cache/rate-limit counters reset when the API restarts. For production, install/configure Redis and change `CACHE_BACKEND=redis`; no silent fallback occurs on Redis failure.

SQL networking is restricted to the IPv4 loopback interface. The app connects with Windows integrated authentication, without creating a SQL password/login or changing authentication mode. `trustServerCertificate=true` permits SQL Express's local certificate; this setting is limited to the loopback connection. Configure trusted certificates and a dedicated least-privilege service identity for operational deployment. The present development process inherits the user's SQL permissions.

The networking setup script requires Windows administrator approval, refuses to restart while another user session has an open transaction, and saves the previous TCP registry settings under `local/sql-tcp-before.reg`. Enabling TCP requires a brief service restart, disconnecting idle SQL clients. It creates only the separate `Schoolhouse` database if missing.

The Docker Compose files remain the PostgreSQL/Redis deployment. Use native Windows startup for this integrated-authentication SQL Express profile. Cloud delivery may use either supported provider independently. Back up this SQL Server database with SQL Server tools; PostgreSQL `pg_dump` scripts do not apply to it.
