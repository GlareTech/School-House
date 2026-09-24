import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { createApp } from './app.js';
import { config } from './config.js';
import { db, redis, logger } from './db.js';
import { sessionFromCookie } from './auth.js';
import { expireAttempts } from './exams.js';
import { originAllowed } from './settings.js';
const io = new Server();
const http = createServer(createApp(io));
io.attach(http, { maxHttpBufferSize: 10000, cors: { origin: (origin,cb) => originAllowed(origin).then(ok => cb(ok ? null : new Error('Origin rejected'), ok)).catch(() => cb(new Error('Origin rejected'),false)), credentials: true },
  allowRequest: (req, cb) => originAllowed(req.headers.origin).then(ok => cb(null,ok)).catch(() => cb(null,false)) });
io.use(async (socket, next) => {
  try {
    const token = socket.request.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith('school_session='))?.split('=')[1];
    const session = await sessionFromCookie(token);
    if (!session || socket.handshake.auth.csrf !== session.csrf) return next(new Error('Unauthorized'));
    socket.data.session = session; socket.data.token = token; next();
  } catch { next(new Error('Authentication unavailable')); }
});
io.on('connection', socket => {
  if (socket.data.session.user.role === 'ADMIN' || socket.data.session.user.staffRole?.grants.some(g => g.permission === 'EXAMS_MONITOR')) socket.join('admins');
  let lastHeartbeat = 0;
  socket.on('heartbeat', async payload => {
    if (Date.now() - lastHeartbeat < 5000 || typeof payload?.attemptId !== 'string') return;
    lastHeartbeat = Date.now();
    try {
      const s = await sessionFromCookie(socket.data.token);
      if (!s) return socket.disconnect(true);
      if (s.user.role !== 'STUDENT') return;
      await db.attempt.updateMany({ where: { id: payload.attemptId, studentId: s.user.id, status: 'ACTIVE' }, data: { lastSeenAt: new Date() } });
    } catch (err) { logger.warn({ err }, 'Heartbeat failed'); }
  });
  const revalidate = setInterval(async () => {
    try { if (!await sessionFromCookie(socket.data.token)) socket.disconnect(true); }
    catch { socket.disconnect(true); }
  }, 30000);
  socket.on('disconnect', () => clearInterval(revalidate));
});
let sweepBusy = false;
const sweep = setInterval(async () => {
  if (sweepBusy) return; sweepBusy = true;
  try { await expireAttempts(io); } catch (err) { logger.error({ err }, 'Deadline sweep failed'); }
  finally { sweepBusy = false; }
}, 2000);
await db.$connect();
http.listen(config.PORT, '0.0.0.0', () => logger.info({ port: config.PORT }, 'LAN school server ready'));
let stopping = false;
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, async () => {
  if (stopping) return; stopping = true; clearInterval(sweep);
  const force = setTimeout(() => process.exit(1), 15000); force.unref();
  io.close(); http.close(async () => { await db.$disconnect(); redis.disconnect(); process.exit(0); });
});
