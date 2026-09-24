import test from 'node:test';
import assert from 'node:assert/strict';
import { grade, validateAnswers, examDeadline, shuffle, retryDelay } from '../src/domain.js';
const questions = [
  { id: 'q1', points: 3, options: [{ id: 'a', correct: true }, { id: 'b', correct: false }] },
  { id: 'q2', points: 2, options: [{ id: 'c', correct: true }, { id: 'd', correct: false }] }
];
test('weighted MCQ grading gives zero for wrong, missing, or foreign answers', () => {
  assert.deepEqual(grade(questions, { q1: 'a', q2: 'd' }), { score: 3, maxScore: 5 });
  assert.deepEqual(grade(questions, {}), { score: 0, maxScore: 5 });
  assert.deepEqual(grade(questions, { q1: 'c', q2: 'c' }), { score: 2, maxScore: 5 });
});
test('answers cannot borrow another question’s option or inject questions', () => {
  assert.throws(() => validateAnswers(questions, { q1: 'c' }), /Invalid/);
  assert.throws(() => validateAnswers(questions, { q3: 'a' }), /Invalid/);
  assert.doesNotThrow(() => validateAnswers(questions, { q2: 'd' }));
});
test('deadline respects both individual duration and hard closing time', () => {
  const now = new Date('2026-01-01T10:00:00Z');
  assert.equal(examDeadline({ durationMinutes: 30, endsAt: '2026-01-01T10:10:00Z' }, now).toISOString(), '2026-01-01T10:10:00.000Z');
  assert.equal(examDeadline({ durationMinutes: 30, endsAt: '2026-01-01T11:00:00Z' }, now).toISOString(), '2026-01-01T10:30:00.000Z');
});
test('randomization preserves every item without mutating source', () => {
  const source = Array.from({ length: 100 }, (_,i) => i), copy = [...source];
  for (let i = 0; i < 50; i++) assert.deepEqual(shuffle(source).sort((a,b) => a-b), source);
  assert.deepEqual(source, copy);
});
test('cloud retry backoff is bounded and includes jitter', () => {
  assert.equal(retryDelay(1, () => 0), 2000);
  assert.equal(retryDelay(100, () => 0), 3600000);
  assert.equal(retryDelay(1, () => .5), 2500);
});
