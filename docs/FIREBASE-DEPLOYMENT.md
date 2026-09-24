# Firebase App Hosting deployment

Schoolhouse runs as one Node.js process on Firebase App Hosting. Express serves
the built React application, the API, and Socket.IO from the same origin. Firebase
SQL Connect provisions the Cloud SQL for PostgreSQL database and exposes a locked
administrative connector. Prisma remains the server-side ORM for the existing
domain model and connects to that same PostgreSQL database through `DATABASE_URL`.

## Provision Firebase resources

1. Create or select a Firebase project on the Blaze plan.
2. Run `firebase init dataconnect` or edit `dataconnect/dataconnect.yaml` so its
   location, Cloud SQL instance ID, and database match the resources in your project.
3. Deploy SQL Connect with `firebase deploy --only dataconnect`. The connector
   operations use `NO_ACCESS`, so browser clients cannot call them.
4. Apply the application schema to the same database with `npm run db:migrate`,
   then seed the first administrator with `npm run db:seed` from a trusted shell.
5. Enable Firebase Storage and use the project bucket name for
   `schoolhouseStorageBucket`. Uploaded files are private and are streamed only
   after the existing application authorization checks.

## Configure App Hosting

Create these secrets before the first rollout:

```sh
firebase apphosting:secrets:set schoolhouseDatabaseUrl
firebase apphosting:secrets:set schoolhouseAppOrigins
firebase apphosting:secrets:set schoolhouseSiteId
firebase apphosting:secrets:set schoolhouseStorageBucket
```

`schoolhouseDatabaseUrl` is the PostgreSQL connection string for the SQL Connect
Cloud SQL database. Use a least-privilege application database user and require
TLS. Give the Cloud SQL instance a private address, copy
`apphosting.production.example.yaml` to `apphosting.production.yaml`, replace its
VPC identifiers, and set the backend environment name to `production`.
`schoolhouseAppOrigins` must be the exact App Hosting custom-domain origin,
for example `https://school.example.com`.

Create an App Hosting backend from the repository root and connect its production
branch. `apphosting.yaml` supplies the build/run commands and safe runtime defaults.
The build generates the Prisma client and the Vite application; the runtime starts
the combined Express service on the platform-provided `PORT`.

The default App Hosting profile uses an in-process cache, so login throttles are
per instance. For a scaled production deployment, provision Memorystore, attach
App Hosting to its VPC, set `CACHE_BACKEND=redis`, and supply `REDIS_URL` in the
backend environment.
