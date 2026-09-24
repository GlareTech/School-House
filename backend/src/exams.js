import { Router } from 'express';
import { z } from 'zod';
import { db, redis, enqueue, logger } from './db.js';
import { HttpError, shuffle, grade, validateAnswers, examDeadline } from './domain.js';
import { lockRow, dbNow } from './provider.js';
const includeExam = { questions: { include: { options: true } } };
const saveSchema = z.object({
  expectedRevision: z.number().int().min(0), requestId: z.string().uuid(),
  answers: z.record(z.string().min(1).max(100), z.string().min(1).max(10000)).refine(a => Object.keys(a).length <= 300)
}).strict();
const now = dbNow;
async function cache(attempt) {
  const key = `attempt:${attempt.id}`;
  // Compare revisions so a delayed Redis write can never replace a newer snapshot.
  const script = `local v=redis.call('HGET',KEYS[1],'revision'); if not v or tonumber(v)<=tonumber(ARGV[1]) then redis.call('HSET',KEYS[1],'revision',ARGV[1],'snapshot',ARGV[2]); redis.call('EXPIRE',KEYS[1],86400); end; return 1`;
  try { await redis.eval(script, 1, key, attempt.revision, JSON.stringify({
    status: attempt.status, answers: Object.fromEntries(attempt.responses.map(r => [r.questionId, r.optionId || r.responseText]))
  })); } catch { logger.warn({ attemptId: attempt.id }, 'Answer committed; cache unavailable'); }
}
export async function finalize(tx, attempt, timestamp) {
  if (attempt.status === 'SUBMITTED') return attempt;
  const answers = Object.fromEntries(attempt.responses.map(r => [r.questionId, r.optionId || r.responseText]));
  const result = grade(attempt.exam.questions, answers);
  const updated = await tx.attempt.update({ where: { id: attempt.id }, data: {
    status: 'SUBMITTED', submittedAt: timestamp, revision: { increment: 1 }, ...result
  }, include: { responses: true, exam: { include: includeExam } } });
  if (updated.exam.termId && updated.exam.subjectId) {
    const course = await tx.classSubject.findUnique({
      where: { classId_subjectId: { classId: updated.exam.classId, subjectId: updated.exam.subjectId } }
    });
    if (course?.teacherId) await tx.gradeEntry.upsert({
      where: { studentId_classSubjectId_termId_componentKey_title: {
        studentId: updated.studentId, classSubjectId: course.id, termId: updated.exam.termId,
        componentKey: updated.exam.assessmentLabel, title: updated.exam.title
      } },
      create: { studentId: updated.studentId, classSubjectId: course.id, termId: updated.exam.termId,
        componentKey: updated.exam.assessmentLabel, title: updated.exam.title, score: updated.score,
        maxScore: updated.maxScore, teacherId: course.teacherId, comment: 'Automatically recorded from CBT' },
      update: { score: updated.score, maxScore: updated.maxScore, teacherId: course.teacherId,
        comment: 'Automatically recorded from CBT' }
    });
  }
  await enqueue(tx, 'exam.result', updated.id, {
    attemptId: updated.id, studentId: updated.studentId, examId: updated.examId,
    score: updated.score, maxScore: updated.maxScore, submittedAt: updated.submittedAt
  });
  return updated;
}
export async function saveAttempt(id, studentId, input, submit = false) {
  if (input) input = saveSchema.parse(input);
  const result = await db.$transaction(async tx => {
    await lockRow(tx, 'Attempt', id);
    let attempt = await tx.attempt.findUnique({ where: { id }, include: { responses: true, exam: { include: includeExam } } });
    if (!attempt || (studentId && attempt.studentId !== studentId)) throw new HttpError(404, 'Attempt not found');
    if (attempt.status === 'SUBMITTED') return attempt;
    const timestamp = await now(tx);
    if (timestamp >= attempt.deadline) {
      if(submit||attempt.exam.autoSubmit)return finalize(tx,attempt,timestamp);
      throw new HttpError(409,'The timer has ended. Submit the saved answers to finish this exam.');
    }
    if (input && input.requestId !== attempt.lastSaveId) {
      if (input.expectedRevision !== attempt.revision) throw new HttpError(409, 'Answers changed in another session. Reload this exam before continuing.');
      validateAnswers(attempt.exam.questions, input.answers);
      // Full snapshot replacement permits clearing an answer. Row lock serializes save/submit.
      await tx.studentResponse.deleteMany({ where: { attemptId: id } });
      if (Object.keys(input.answers).length) await tx.studentResponse.createMany({ data:
        Object.entries(input.answers).map(([questionId, value]) => { const q=attempt.exam.questions.find(x=>x.id===questionId);return ['MCQ','TRUE_FALSE'].includes(q.type)?{attemptId:id,questionId,optionId:value}:{attemptId:id,questionId,responseText:value}; })
      });
      attempt = await tx.attempt.update({ where: { id }, data: {
        revision: { increment: 1 }, lastSaveId: input.requestId, lastSeenAt: timestamp
      }, include: { responses: true, exam: { include: includeExam } } });
    }
    return submit ? finalize(tx, attempt, timestamp) : attempt;
  }, { timeout: 10000 });
  await cache(result);
  return result;
}
function safeAttempt(a) {
  const questionMap = new Map(a.exam.questions.map(q => [q.id, q]));
  return {
    id: a.id, examId: a.examId, status: a.status, deadline: a.deadline, serverNow: new Date(), timed:a.exam.timed,autoSubmit:a.exam.autoSubmit,
    revision: a.revision, lastSaveId: a.lastSaveId, title: a.exam.title, instructions: a.exam.instructions,
    answers: Object.fromEntries(a.responses.map(r => [r.questionId, r.optionId || r.responseText])),
    score: a.exam.releaseResults ? a.score : null, maxScore: a.exam.releaseResults ? a.maxScore : null,
    questions: a.questionOrder.map(qid => {
      const q = questionMap.get(qid);
      return { id: q.id, prompt: q.prompt, points: q.points, type:q.type, options: a.optionOrder[q.id].map(oid => {
        const o = q.options.find(o => o.id === oid); return { id: o.id, text: o.text };
      }) };
    })
  };
}
export function examRouter(io) {
  const router = Router();
  router.use((req, res, next) => { if (req.user.role !== 'STUDENT') throw new HttpError(403, 'Student account required'); next(); });
  router.get('/', async (req, res) => res.json(await db.exam.findMany({
    where: { classId: req.user.classId || '__none__', status: { not: 'DRAFT' } },
    select: { id: true, title: true, instructions: true, durationMinutes: true, timed:true,autoSubmit:true,startsAt: true, endsAt: true, status: true,
      attempts: { where: { studentId: req.user.id }, select: { id: true, status: true } } }, orderBy: { startsAt: 'desc' }
  })));
  router.post('/:id/start', async (req, res) => {
    const attempt = await db.$transaction(async tx => {
      await lockRow(tx, 'User', req.user.id);
      const student = await tx.user.findUnique({ where: { id: req.user.id } });
      await lockRow(tx, 'Exam', req.params.id);
      const exam = await tx.exam.findUnique({ where: { id: req.params.id }, include: includeExam });
      if (!student?.active || !exam || exam.classId !== student.classId) throw new HttpError(404, 'Exam not found');
      const existing = await tx.attempt.findUnique({ where: { examId_studentId: { examId: exam.id, studentId: req.user.id } },
        include: { responses: true, exam: { include: includeExam } } });
      if (existing) return existing;
      const timestamp = await now(tx);
      if (exam.status !== 'PUBLISHED' || timestamp < exam.startsAt || timestamp >= exam.endsAt) throw new HttpError(409, 'Exam is not open');
      return tx.attempt.create({ data: {
        examId: exam.id, studentId: req.user.id, startedAt: timestamp, deadline: examDeadline(exam, timestamp),
        questionOrder: shuffle(exam.questions.map(q => q.id)),
        optionOrder: Object.fromEntries(exam.questions.map(q => [q.id, shuffle(q.options.map(o => o.id))]))
      }, include: { responses: true, exam: { include: includeExam } } });
    });
    io.to('admins').emit('monitor:update', { attemptId: attempt.id });
    res.json(safeAttempt(attempt));
  });
  router.get('/attempts/:id', async (req, res) => {
    const a = await saveAttempt(req.params.id, req.user.id, null);
    res.json(safeAttempt(a));
  });
  for (const [path, submit] of [['answers', false], ['submit', true]]) {
    router.post(`/attempts/:id/${path}`, async (req, res) => {
      const a = await saveAttempt(req.params.id, req.user.id, req.body, submit);
      io.to('admins').emit('monitor:update', { attemptId: a.id });
      res.json({ id: a.id, revision: a.revision, status: a.status, serverNow: new Date(),
        score: a.exam.releaseResults ? a.score : null, maxScore: a.exam.releaseResults ? a.maxScore : null });
    });
  }
  router.post('/attempts/:id/incidents', async (req, res) => {
    const { kind } = z.object({ kind: z.enum(['WINDOW_BLUR','FULLSCREEN_EXIT','PAGE_HIDDEN']) }).parse(req.body);
    const a = await db.attempt.findFirst({ where: { id: req.params.id, studentId: req.user.id, status: 'ACTIVE' } });
    if (!a) throw new HttpError(404, 'Active attempt not found');
    // Bound incident storage and prevent an accidental event storm.
    const recent = await db.incident.count({ where: { attemptId: a.id, createdAt: { gt: new Date(Date.now() - 60000) } } });
    if (recent < 30) await db.incident.create({ data: { attemptId: a.id, kind } });
    io.to('admins').emit('monitor:update', { attemptId: a.id });
    res.json({ ok: true });
  });
  return router;
}
export async function expireAttempts(io) {
  const expired = await db.attempt.findMany({ where: { status: 'ACTIVE', deadline: { lte: new Date() },exam:{autoSubmit:true} }, select: { id: true }, take: 100 });
  for (const a of expired) {
    try { await saveAttempt(a.id, null, null); }
    catch (err) { logger.error({ err, attemptId: a.id }, 'Deadline finalization failed; will retry'); }
  }
  if (expired.length) io?.to('admins').emit('monitor:update', {});
}
