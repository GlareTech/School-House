# Schoolhouse SaaS

Schoolhouse is a Firebase-hosted school operations and CBT platform. The React
frontend, Express API, and Socket.IO server run together on Firebase App Hosting.
Firebase SQL Connect provisions the Cloud SQL for PostgreSQL database, Prisma
provides the transactional server data layer, and Firebase Storage holds uploads.

## Requirements

- Node.js 22.12 or newer
- A Firebase project on the Blaze plan
- Firebase App Hosting, SQL Connect, Cloud SQL, and Storage
- Firebase CLI access to the target project

## Local development

Copy `.env.example` to `.env`, configure a development PostgreSQL database, then:

```sh
npm ci
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

The Vite frontend runs on port 5173 and proxies application traffic to the API on
port 3000. Keep `FIREBASE_DATA_CONNECT_ENABLED=false` unless the SQL Connect
emulator or a Firebase project is configured.

## Firebase deployment

1. Confirm `.firebaserc` points to the intended Firebase project.
2. Update `dataconnect/dataconnect.yaml` with the project's SQL Connect location,
   Cloud SQL instance ID, and database name.
3. Create the secrets referenced by `apphosting.yaml`.
4. Deploy SQL Connect: `firebase deploy --only dataconnect`.
5. Apply Prisma migrations and seed the administrator from a trusted environment.
6. Create an App Hosting backend with the repository root as its root directory.

See [Firebase deployment](docs/FIREBASE-DEPLOYMENT.md) for secret names, VPC
configuration, database access, storage, and scaling guidance.

## Validation

```sh
npm test
npm run check
```

The committed PostgreSQL migrations are the application schema history. SQL
Connect uses `COMPATIBLE` schema validation so its deployment metadata can coexist
with the Prisma-managed application tables without deleting them.

## Project structure

```text
apphosting.yaml                 Firebase App Hosting runtime configuration
firebase.json                  Firebase CLI and emulator configuration
dataconnect/                   SQL Connect schema and secured operations
dataconnect-generated/         Generated server-side SQL Connect SDK
backend/prisma/                PostgreSQL schema, migrations, and seed
backend/src/                   Express, Socket.IO, workers, and domain services
frontend/src/                  React application
config/features.json           Server feature controls
scripts/env-run.mjs            Database command environment loader
docs/FIREBASE-DEPLOYMENT.md    Firebase provisioning and deployment guide
```
