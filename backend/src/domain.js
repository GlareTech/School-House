import { randomInt } from 'node:crypto';
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1); [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function grade(questions, answers) {
  return questions.reduce((r, q) => ({
    score: r.score + (q.type === 'SHORT_TEXT'
      ? (String(answers[q.id]||'').trim().toLocaleLowerCase() === String(q.correctText||'').trim().toLocaleLowerCase() ? q.points : 0)
      : q.type === 'ESSAY' ? 0
      : (q.options.some(o => o.correct && o.id === answers[q.id]) ? q.points : 0)),
    maxScore: r.maxScore + q.points
  }), { score: 0, maxScore: 0 });
}
export function validateAnswers(questions, answers) {
  for (const [qid, value] of Object.entries(answers)) {
    const question = questions.find(q => q.id === qid);
    const type=question?.type||'MCQ';
    if (!question || (['MCQ','TRUE_FALSE'].includes(type) && !question.options.some(o => o.id === value)) || (!['MCQ','TRUE_FALSE'].includes(type) && String(value).length > 10000)) throw new HttpError(400, 'Invalid question or answer');
  }
}
export function examDeadline(exam, now) {
  return exam.timed !== false ? new Date(Math.min(+new Date(exam.endsAt), +now + exam.durationMinutes * 60000)) : new Date(exam.endsAt);
}
export function retryDelay(attempts, random = Math.random) {
  return Math.min(3600000, 1000 * 2 ** Math.min(attempts, 12)) + Math.floor(random() * 1000);
}
