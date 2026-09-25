import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { ZodError } from 'zod';
import { config } from './config.js';
import { db, logger } from './db.js';
import { checkOrigin, corsForAllowedOrigins, authRoutes, authenticate } from './auth.js';
import { examRouter } from './exams.js';
import { adminRouter } from './admin.js';
import { getSettings, publicSettings } from './settings.js';
import { academicRouter, fileRoutes, publicAsset } from './academics.js';
import { hostelRouter } from './hostels.js';
import { communicationRouter } from './communications.js';
import { adminFeatureGate, academicFeatureGate, requireFeature } from './features.js';
import { platformRouter } from './platform.js';
import { paystackWebhook } from './billing.js';
export function createApp(io) {
  const app = express();
  app.disable('x-powered-by'); app.set('trust proxy', config.TRUST_PROXY);
  app.use(helmet());
  app.use((req, res, next) => {
    req.requestId = randomUUID(); res.setHeader('X-Request-Id', req.requestId);
    res.setHeader('Cache-Control', 'no-store'); next();
  });
  app.get('/api/health/live', (req, res) => res.json({ status: 'alive' }));
  app.get('/api/health/ready', async (req, res) => {
    try { await db.$queryRaw`SELECT 1`; res.json({ status: 'ready' }); }
    catch { res.status(503).json({ status: 'degraded' }); }
  });
  app.use(corsForAllowedOrigins);
  app.post('/api/paystack/webhook', express.raw({type:'application/json',limit:'256kb'}), paystackWebhook);
  app.use(cookieParser(), checkOrigin);
  app.use('/api/files', authenticate, express.raw({type:['application/pdf','image/png','image/jpeg','text/plain'],limit:'10mb'}));
  app.use(express.json({ limit: '2mb' }));
  authRoutes(app);
  app.use('/api/platform', platformRouter());
  app.get('/api/config/public', async (req,res) => res.json(publicSettings(await getSettings())));
  app.get('/api/assets/:id', publicAsset);
  app.use('/api/admin', authenticate, adminFeatureGate, adminRouter());
  app.use('/api/academics', authenticate, academicFeatureGate, academicRouter());
  app.use('/api/hostels', authenticate, requireFeature('hostel'), hostelRouter());
  app.use('/api/communications', authenticate, requireFeature('communications'), communicationRouter());
  fileRoutes(app);
  app.use('/api/exams', authenticate, requireFeature('cbt'), examRouter(io));
  const webRoot=fileURLToPath(new URL('../../frontend/dist',import.meta.url));
  if(existsSync(webRoot)){
    app.use(express.static(webRoot,{index:false,maxAge:'1y',immutable:true}));
    app.get(/^(?!\/api\/|\/socket\.io\/).*/,(_req,res)=>res.sendFile(join(webRoot,'index.html')));
  }
  app.use((req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    let status = err.status || 500, error = status < 500 ? err.message : 'Server error';
    if (err instanceof ZodError) { status = 400; error = err.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '); }
    if (err.code === 'P2002') { status = 409; error = 'A record with this unique value already exists'; }
    if (err.code === 'P2025') { status = 404; error = 'Record not found'; }
    if (err.code === 'P2003') { status = 400; error = 'Referenced record is invalid or still in use'; }
    if (status >= 500) logger.error({ err, requestId: req.requestId }, 'Request failed');
    res.status(status).json({ error, requestId: req.requestId });
  });
  return app;
}
