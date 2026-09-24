# Cloud delivery contract

Local PostgreSQL is the source of truth. Each result finalization, attendance write or payment creation inserts a `SyncLog` event in the same database transaction. If the mutation rolls back, its event rolls back. Internet connectivity is established by trying the actual cloud endpoint, with a 15-second request timeout; no separate public connectivity probe is needed.

The worker leases up to 50 due rows for 60 seconds using `FOR UPDATE SKIP LOCKED`. A unique lease token guards subsequent acknowledgement updates. Crashed workers leave rows reclaimable after the lease. Delivery is **at least once**, so a receiver must deduplicate by event ID. Individual event acknowledgements permit partial success. Unacknowledged events back off exponentially up to approximately one hour with jitter. Events are never silently dropped after a maximum retry count.

## Request and response

```http
POST /v1/sync
Authorization: Bearer <32+ character secret>
Content-Type: application/json
```

```json
{
  "siteId": "school-001",
  "events": [
    {
      "id": "globally-unique-event-id",
      "kind": "exam.result",
      "entityId": "attempt-id",
      "occurredAt": "2026-10-01T09:00:00.000Z",
      "payload": {"attemptId":"attempt-id","studentId":"student-id","examId":"exam-id","score":8,"maxScore":10,"submittedAt":"2026-10-01T09:00:00.000Z"}
    }
  ]
}
```

Return 200 only after a durable commit:

```json
{"acceptedIds":["globally-unique-event-id"]}
```

`attendance.upsert` payloads contain `id,studentId,date,status,updatedAt`. `payment.recorded` contains `id,reference,studentId,amountMinor,currency,description,createdAt`. All identifiers remain stable across retries. The receiver validates the configured site, secret and supported event kinds. It stores immutable JSON payloads, not executable instructions. Provision a separate receiver/database/token per school for this reference implementation; multi-tenant key management is outside its scope.

## Reference receiver deployment

1. Provision an independent PostgreSQL database in your cloud environment.
2. Deploy a separate trusted receiver service and apply `npm run db:migrate` with that database URL.
3. Run `npm run cloud -w backend` with `DATABASE_URL`, `APP_ORIGINS`, `SITE_ID`, `CLOUD_SYNC_TOKEN` and optional `CLOUD_PORT=4000`. The receiver needs only PostgreSQL.
4. Terminate HTTPS in front of port 4000; restrict request rates and network access at that proxy. Do not use the LAN Compose database as the cloud database.
5. Configure the LAN worker's `CLOUD_SYNC_URL=https://your-cloud-host/v1/sync` and matching secret/site, then restart `worker`.

The receiver's `CloudReceipt.id` unique key makes repeated delivery a no-op. It stores the received history and acknowledges duplicate IDs. A reporting projection can read that ledger. For attendance state, apply only updates newer than the stored `updatedAt` and define an explicit tie-break policy if importing from other systems. Events may arrive out of order because failed batches retry later; do not assume arrival order is business order. Results and payments are immutable in this implementation.

A successful HTTP request with missing/invalid acknowledgement JSON is retried. A response acknowledging only some IDs marks only those IDs synced. Redirects are rejected so the bearer token is not forwarded to another host. Cloud errors shown locally omit response bodies and credentials.

## Restore and reconciliation

Sync is not a database backup: it omits users, sessions, question banks and other configuration. Back up PostgreSQL separately. After restoring the local database, replayed event IDs are safe; data created after the restored snapshot may be missing locally even if present in the cloud ledger. Reconcile that gap with the cloud audit history before resuming school operations. Never reset event IDs to force an overwrite. Keep `SITE_ID` stable for a restored school and choose a new ID for an independent installation.

No inbound synchronization, conflict resolution between independent school servers, automatic deletion or credential synchronization is implemented. Keep the single central administrator server as the writer.
