// Optional reference receiver. Deploy separately with its OWN database and HTTPS proxy.
import express from 'express';
import helmet from 'helmet';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import pino from 'pino';
import { config } from './config.js';
import { configureClient, isSqlServer } from './provider.js';
const db = configureClient(new PrismaClient());
const logger = pino({ level: config.LOG_LEVEL });
if (config.CLOUD_SYNC_TOKEN.length < 32) throw new Error('Set a strong CLOUD_SYNC_TOKEN');
const app = express(); app.disable('x-powered-by'); app.use(helmet());
app.use((req, res, next) => {
  const actual = Buffer.from(req.headers.authorization || ''), expected = Buffer.from(`Bearer ${config.CLOUD_SYNC_TOKEN}`);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return res.status(401).json({ error: 'Unauthorized' }); next();
});
app.use(express.json({ limit: '2mb' }));
app.post('/v1/sync', async (req, res) => {
  const { siteId, events } = z.object({ siteId: z.literal(config.SITE_ID), events: z.array(z.object({
    id: z.string().min(1).max(100), kind: z.enum(['exam.result','attendance.upsert','payment.recorded','assignment.graded','promotion.applied']),
    entityId: z.string().min(1).max(100), payload: z.record(z.unknown()), occurredAt: z.string().datetime()
  })).min(1).max(50) }).parse(req.body);
  const data = events.map(e => ({ ...e, siteId, occurredAt: new Date(e.occurredAt) }));
  // Unique IDs make a lost HTTP acknowledgement safe to retry after commit.
  if (isSqlServer) {
    await db.$transaction(async tx => { for (const event of data) await tx.cloudReceipt.upsert({ where: { id: event.id }, create: event, update: {} }); });
  } else await db.cloudReceipt.createMany({ data, skipDuplicates: true });
  res.json({ acceptedIds: events.map(e => e.id) });
});
app.use((err, req, res, next) => { logger.warn({ type: err.name }, 'Cloud request rejected'); res.status(err instanceof z.ZodError ? 400 : 500).json({ error: 'Request rejected' }); });
const server = app.listen(Number(process.env.CLOUD_PORT || 4000), '0.0.0.0');
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => server.close(async () => { await db.$disconnect(); process.exit(0); }));
