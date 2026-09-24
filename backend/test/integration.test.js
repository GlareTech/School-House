import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import bcrypt from 'bcryptjs';
// This suite must only target a disposable database whose name contains "test".
const testDatabase = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).pathname : '';
if (!testDatabase?.includes('test')) throw new Error('Integration tests require an explicit disposable test database');
const { db, redis } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');
const { config } = await import('../src/config.js');
const { expireAttempts } = await import('../src/exams.js');
const { syncBatch } = await import('../src/sync.js');
const io = { to: () => ({ emit() {} }) };
let server, base, student, adminUser, other, classroom, exam, sAuth, aAuth, oAuth;
const origin = config.APP_ORIGINS[0];
async function request(path, auth, method = 'GET', body) {
  const r = await fetch(base + '/api' + path, { method, headers: {
    Origin: origin, 'Content-Type': 'application/json', ...(auth ? { Cookie: auth.cookie, 'X-CSRF-Token': auth.csrf } : {})
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: r.status, body: await r.json(), headers: r.headers };
}
async function login(email) {
  const r = await request('/auth/login', null, 'POST', { email, password: 'integration-password-123' });
  assert.equal(r.status, 200); return { cookie: r.headers.get('set-cookie').split(';')[0], csrf: r.body.csrf };
}
const payload = (revision, answers) => ({ expectedRevision: revision, requestId: randomUUID(), answers });
before(async () => {
  await db.$connect(); if (redis.status !== 'ready') await new Promise(resolve => redis.once('ready', resolve));
  classroom = await db.class.create({ data: { name: `Test ${randomUUID()}` } });
  const hash = await bcrypt.hash('integration-password-123', 4);
  const make = role => db.user.create({ data: { email: `${randomUUID()}@test.local`, name: role, role, passwordHash: hash, classId: classroom.id } });
  student = await make('STUDENT'); other = await make('STUDENT'); adminUser = await make('ADMIN');
  server = createServer(createApp(io)); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  sAuth = await login(student.email); aAuth = await login(adminUser.email); oAuth = await login(other.email);
  const created = await request('/admin/exams', aAuth, 'POST', { title: 'Integration exam', classId: classroom.id, durationMinutes: 10,
    startsAt: new Date(Date.now()-60000).toISOString(), endsAt: new Date(Date.now()+600000).toISOString(),
    questions: [{ prompt: '2 + 2?', points: 2, options: [{ text: '4', correct: true }, { text: '5', correct: false }] }]
  }); assert.equal(created.status, 201); exam = await db.exam.findUnique({ where: { id: created.body.id }, include: { questions: { include: { options: true } } } });
  assert.equal((await request(`/admin/exams/${exam.id}/status`, aAuth, 'PATCH', { status: 'PUBLISHED' })).status, 200);
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await db.$disconnect(); redis.disconnect();
});
test('RBAC and CSRF block unauthorized writes', async () => {
  assert.equal((await request('/admin/classes', sAuth)).status, 403);
  assert.equal((await request('/admin/classes', { ...aAuth, csrf: 'wrong' }, 'POST', { name: 'Forbidden' })).status, 403);
  const noOrigin = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(noOrigin.status, 403);
});
test('staff RBAC grants only assigned capabilities and students remain exam-only', async () => {
  const role=await db.staffRole.create({data:{name:`Results ${randomUUID()}`,grants:{create:[{permission:'RESULTS_VIEW'}]}}});
  const staffUser=await db.user.create({data:{email:`${randomUUID()}@test.local`,name:'Restricted staff',role:'STAFF',passwordHash:await bcrypt.hash('integration-password-123',4),staffRoleId:role.id}});
  const auth=await login(staffUser.email);
  assert.equal((await request('/admin/results',auth)).status,200);
  assert.equal((await request('/admin/payments',auth)).status,403);
  assert.equal((await request('/admin/settings',auth)).status,403);
  assert.equal((await request('/exams',auth)).status,403);
});
test('concurrent start, answer privacy, idempotent saves, conflict, atomic grading and outbox', async () => {
  const starts = await Promise.all([request(`/exams/${exam.id}/start`, sAuth, 'POST'), request(`/exams/${exam.id}/start`, sAuth, 'POST')]);
  assert.equal(starts[0].status, 200); assert.equal(starts[0].body.id, starts[1].body.id);
  const a = starts[0].body, q = exam.questions[0], correct = q.options.find(o => o.correct).id;
  assert.equal(JSON.stringify(a).includes('correct'), false);
  assert.equal((await request(`/exams/attempts/${a.id}`, oAuth)).status, 404);
  const body = payload(0, { [q.id]: correct });
  assert.equal((await request(`/exams/attempts/${a.id}/answers`, sAuth, 'POST', body)).body.revision, 1);
  assert.equal((await request(`/exams/attempts/${a.id}/answers`, sAuth, 'POST', body)).body.revision, 1);
  assert.equal((await request(`/exams/attempts/${a.id}/answers`, sAuth, 'POST', payload(0, {}))).status, 409);
  const cached = JSON.parse(await redis.hget(`attempt:${a.id}`, 'snapshot')); assert.equal(cached.answers[q.id], correct);
  const submit = payload(1, { [q.id]: correct });
  const results = await Promise.all([request(`/exams/attempts/${a.id}/submit`, sAuth, 'POST', submit), request(`/exams/attempts/${a.id}/submit`, sAuth, 'POST', submit)]);
  assert.equal(results[0].body.status, 'SUBMITTED'); assert.equal(results[0].body.score, null);
  const graded = await db.attempt.findUnique({ where: { id: a.id } }); assert.equal(graded.score, 2);
  assert.equal(await db.syncLog.count({ where: { entityId: a.id, kind: 'exam.result' } }), 1);
});
test('expired attempts reject late answer changes and submit without a browser', async () => {
  const a = (await request(`/exams/${exam.id}/start`, oAuth, 'POST')).body;
  await db.attempt.update({ where: { id: a.id }, data: { deadline: new Date(Date.now()-1000) } });
  await expireAttempts(io);
  const late = await request(`/exams/attempts/${a.id}/answers`, oAuth, 'POST', payload(0, { [exam.questions[0].id]: exam.questions[0].options.find(o => o.correct).id }));
  assert.equal(late.body.status, 'SUBMITTED');
  assert.equal((await db.attempt.findUnique({ where: { id: a.id } })).score, 0);
});
test('attendance and payment mutations enqueue durable cloud events', async () => {
  const attendance = await request('/admin/attendance', aAuth, 'POST', { date: '2026-01-01', records: [{ studentId: student.id, status: 'PRESENT' }] });
  assert.equal(attendance.status, 200);
  const data = { reference: randomUUID(), studentId: student.id, amountMinor: 10000, currency: 'NGN', description: 'Test tuition' };
  const p = await request('/admin/payments', aAuth, 'POST', data); assert.equal(p.status, 201);
  assert.equal((await request('/admin/payments', aAuth, 'POST', data)).status, 409);
  assert.equal(await db.syncLog.count({ where: { entityId: p.body.id } }), 1);
});
test('sync failure retries; acknowledgement marks only accepted events', async () => {
  const oldUrl = config.CLOUD_SYNC_URL, oldToken = config.CLOUD_SYNC_TOKEN;
  let fail = true;
  const receiver = createServer((req, res) => {
    let body = ''; req.on('data', c => body += c); req.on('end', () => {
      if (fail) { res.writeHead(503); res.end(); return; }
      const data = JSON.parse(body); res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ acceptedIds: data.events.map(e => e.id) }));
    });
  });
  await new Promise(resolve => receiver.listen(0, '127.0.0.1', resolve));
  try {
    config.CLOUD_SYNC_URL = `http://127.0.0.1:${receiver.address().port}/v1/sync`; config.CLOUD_SYNC_TOKEN = 'test-token-'.repeat(4);
    const result = await syncBatch(); assert.ok(result.sent > 0); assert.equal(result.accepted, 0);
    const pending = await db.syncLog.findMany({ where: { syncedAt: null } }); assert.ok(pending.every(e => e.attempts > 0 && e.lastError));
    await db.syncLog.updateMany({ where: { syncedAt: null }, data: { nextAttemptAt: new Date(0) } }); fail = false;
    const success = await syncBatch(); assert.equal(success.accepted, pending.length);
  } finally { config.CLOUD_SYNC_URL = oldUrl; config.CLOUD_SYNC_TOKEN = oldToken; await new Promise(resolve => receiver.close(resolve)); }
});
