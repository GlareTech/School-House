# Offline device synchronization API

Administrators register each offline installation from **Cloud sync**. The generated bearer token is displayed once and identifies both the school tenant and device.

## Authentication

Send `Authorization: Bearer <device-token>` on every request. Tokens are stored as SHA-256 hashes and can be disabled from the admin workspace.

## Checkpoint

`GET /api/device-sync/checkpoint` returns the device's latest accepted sequence, last receipt time, and current server time.

## Push local changes

`POST /api/device-sync/push`

```json
{
  "events": [{
    "sequence": 1,
    "kind": "attendance.upsert",
    "entityId": "local-record-id",
    "entityVersion": 1,
    "payload": {},
    "occurredAt": "2026-09-26T08:00:00.000Z"
  }]
}
```

Sequences make retries idempotent. `entityVersion` detects an older write for the same entity. The response contains `acceptedSequences`, `conflicts`, and `nextSequence`. A device should retain a local event until its sequence is accepted.

Supported event kinds are `attendance.upsert`, `payment.recorded`, `assignment.graded`, `student.updated`, and `staffAttendance.mark`.

## Pull cloud changes

`GET /api/device-sync/pull?cursor=<ISO timestamp>&limit=100` returns tenant-scoped synchronization events and a new cursor. Persist that cursor locally only after applying the full response transactionally.

Offline clients should call checkpoint at startup, push queued local events in sequence order, resolve any reported conflicts, then pull from their last durable cursor.
