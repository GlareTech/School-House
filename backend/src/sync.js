import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db } from './db.js';
import { config } from './config.js';
import { retryDelay } from './domain.js';
import { isSqlServer } from './provider.js';
export async function syncBatch() {
  if (!config.FEATURE_CLOUD_SYNC || !config.CLOUD_SYNC_URL) return { disabled: true };
  const settings=await db.appSetting.findFirst({select:{syncEnabled:true}});
  if(settings&&!settings.syncEnabled)return {disabled:true};
  const token = randomUUID();
  const events = await db.$transaction(async tx => {
    const rows = isSqlServer ? await tx.$queryRaw`SELECT TOP (50) * FROM [SyncLog] WITH (UPDLOCK, READPAST, ROWLOCK)
      WHERE [syncedAt] IS NULL AND [nextAttemptAt] <= SYSUTCDATETIME()
      AND ([leaseUntil] IS NULL OR [leaseUntil] < SYSUTCDATETIME()) ORDER BY [createdAt]`
      : await tx.$queryRaw`SELECT * FROM "SyncLog" WHERE "syncedAt" IS NULL
      AND "nextAttemptAt" <= now() AND ("leaseUntil" IS NULL OR "leaseUntil" < now())
      ORDER BY "createdAt" LIMIT 50 FOR UPDATE SKIP LOCKED`;
    if (rows.length) await tx.syncLog.updateMany({ where: { id: { in: rows.map(r => r.id) } },
      data: { leaseToken: token, leaseUntil: new Date(Date.now() + 60000), attempts: { increment: 1 } } });
    return rows.map(row => ({ ...row, payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload }));
  });
  if (!events.length) return { sent: 0 };
  let accepted = new Set(), error = null;
  try {
    const response = await fetch(config.CLOUD_SYNC_URL, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.CLOUD_SYNC_TOKEN}` },
      body: JSON.stringify({ siteId: config.SITE_ID, events: events.map(e => ({ id: e.id, kind: e.kind, entityId: e.entityId, payload: e.payload, occurredAt: e.createdAt })) })
    });
    if (!response.ok) throw new Error(`Cloud returned HTTP ${response.status}`);
    const body = z.object({ acceptedIds: z.array(z.string()).max(50) }).parse(await response.json());
    accepted = new Set(body.acceptedIds);
  } catch (err) { error = err.name === 'TimeoutError' ? 'Cloud request timed out' : 'Cloud unavailable or invalid response'; }
  for (const event of events) {
    const ok = accepted.has(event.id);
    await db.syncLog.updateMany({ where: { id: event.id, leaseToken: token, syncedAt: null }, data: {
      leaseToken: null, leaseUntil: null,
      ...(ok ? { syncedAt: new Date(), lastError: null } : {
        nextAttemptAt: new Date(Date.now() + retryDelay(event.attempts + 1)), lastError: error || 'Cloud did not acknowledge event'
      })
    } });
  }
  return { sent: events.length, accepted: events.filter(e => accepted.has(e.id)).length };
}
