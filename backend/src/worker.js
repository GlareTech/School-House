import { config } from './config.js';
import { db, redis, logger } from './db.js';
import { syncBatch } from './sync.js';
import { deliverCommunicationBatch } from './communication-service.js';
let stopped = false, timer;
async function run() {
  try {
    const [result,communications] = await Promise.all([syncBatch(),deliverCommunicationBatch()]);
    if (result.sent) logger.info(result, 'Cloud sync batch');
    if (communications.claimed) logger.info(communications, 'Communication delivery batch');
    await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  } catch (err) { logger.error({ err }, 'Worker iteration failed; will retry'); }
  if (!stopped) timer = setTimeout(run, config.SYNC_INTERVAL_MS);
  else { await db.$disconnect(); redis.disconnect(); }
}
logger.info({ cloudSync: config.FEATURE_CLOUD_SYNC && !!config.CLOUD_SYNC_URL, communications: config.FEATURE_COMMUNICATIONS }, 'Background worker started');
run();
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, async () => {
  stopped = true; clearTimeout(timer);
  await db.$disconnect(); redis.disconnect(); process.exit(0);
});
