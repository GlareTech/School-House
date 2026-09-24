import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { api, getCsrf } from './api';
import { StudentAcademics } from './StudentAcademic';
import { Modal } from './StaffSettings';
import { Library } from './Library';
import {BrandImage} from './BrandImage';
function uuid() {
  const bytes = crypto.getRandomValues(new Uint8Array(16)); bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const h = [...bytes].map(b => b.toString(16).padStart(2,'0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
export function Student({ user, settings, logout }) {
  const [exams, setExams] = useState([]), [attempt, setAttempt] = useState(null), [error, setError] = useState(''), [busy,setBusy] = useState(false), [learning,setLearning]=useState(false);
  const features=settings.features||{},enabled=key=>features[key]!==false;
  const refresh = () => api('/exams').then(setExams).catch(e => setError(e.message));
  useEffect(() => { if(enabled('cbt'))refresh(); }, []);
  async function enter(exam) {
    setBusy(true); setError('');
    try {
      if (exam.attempts[0]?.status !== 'SUBMITTED') await document.documentElement.requestFullscreen?.().catch(() => {});
      const a = exam.attempts[0] ? await api(`/exams/attempts/${exam.attempts[0].id}`) : await api(`/exams/${exam.id}/start`, { method: 'POST' });
      setAttempt(a);
    } catch (err) { setError(err.message); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); }
    finally { setBusy(false); }
  }
  if (attempt) return <ExamSession key={attempt.id} initial={attempt} studentId={user.id} settings={settings} leave={() => { setAttempt(null); refresh(); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); }}/ >;
  if(learning==='library')return <div className="student-home"><header><div className="brand"><BrandImage src={settings.logoUrl} name={settings.schoolName}/>{settings.schoolName}</div><button className="text-button" onClick={()=>setLearning(false)}>← Back to examinations</button></header><main><span className="eyebrow">STUDENT LIBRARY</span><h1>Library materials</h1><Library user={user} run={()=>{}}/></main></div>;
  if(learning)return <StudentAcademics user={user} features={features} back={()=>setLearning(false)}/>;
  return <div className="student-home"><header><div className="brand"><BrandImage src={settings.logoUrl} name={settings.schoolName}/>{settings.schoolName}</div><div>{(enabled('assignments')||enabled('reports')||enabled('library'))&&<button className="text-button" onClick={()=>setLearning(true)}>Assignments & reports</button>}{enabled('library')&&<button className="text-button" onClick={()=>setLearning('library')}>Library</button>} {user.name} <button className="text-button" onClick={logout}>Sign out</button></div></header><main><span className="eyebrow">STUDENT WORKSPACE</span><h1>Ready when you are.</h1><p className="muted">Your assigned examinations appear here. Keep this device connected to the school network.</p>{error && <div className="error" role="alert">{error}</div>}{enabled('attendance')&&<StudentAttendance/>}{enabled('cbt')&&<button className="secondary" onClick={refresh}>Refresh examinations</button>}<div className="cards">{exams.map(e => <section className="panel" key={e.id}><span className="badge">{e.attempts[0]?.status || e.status}</span><h2>{e.title}</h2><p>{e.instructions}</p><small>{e.durationMinutes} minutes<br/>{new Date(e.startsAt).toLocaleString()} – {new Date(e.endsAt).toLocaleString()}</small><div className="actions"><button disabled={busy || (!e.attempts.length && e.status !== 'PUBLISHED')} onClick={() => enter(e)}>{e.attempts[0]?.status === 'SUBMITTED' ? 'View submission' : e.attempts.length ? 'Resume exam' : 'Enter exam →'}</button></div></section>)}</div>{enabled('cbt')&&!exams.length&&<div className="empty">No examinations have been published for your class.</div>}{!enabled('cbt')&&<div className="empty">Computer-based testing is currently disabled.</div>}</main></div>;
}
function StudentAttendance(){const date=new Date().toISOString().slice(0,10),[data,setData]=useState(null),[error,setError]=useState('');const load=()=>api('/academics/attendance/self?date='+date).then(setData).catch(e=>setError(e.message));useEffect(()=>{load()},[]);const mark=status=>api('/academics/attendance/self',{method:'POST',body:{date,status}}).then(load).catch(e=>setError(e.message));if(!data?.window&&!error)return null;return <section className="student-attendance panel"><div><span className="eyebrow">TODAY’S ATTENDANCE</span><h2>{data?.window?.class?.name||'My class'}</h2><p>{data?.window?.accepting?`Mark yourself before ${new Date(data.window.closesAt).toLocaleTimeString()}`:'Self-marking is closed.'}</p>{data?.record&&<span className="badge">{data.record.status} · {data.record.reviewStatus}</span>}{error&&<small className="error">{error}</small>}</div>{data?.window?.accepting&&<div className="actions"><button onClick={()=>mark('PRESENT')}>I am present</button><button className="secondary" onClick={()=>mark('LATE')}>I arrived late</button></div>}</section>}
function ExamSession({ initial, studentId, settings, leave }) {
  const key = `schoolhouse:${studentId}:${initial.id}`;
  const saved = useRef(null);
  if (saved.current === null) {
    let draft; try { draft = JSON.parse(sessionStorage.getItem(key)); } catch { /* Storage can be unavailable in managed browsers. */ }
    const valid = initial.status === 'ACTIVE' && draft && (draft.revision === initial.revision || draft.pending?.body.requestId === initial.lastSaveId);
    saved.current = { answers: valid ? draft.answers : initial.answers, pending: valid && draft.pending?.body.requestId !== initial.lastSaveId ? draft.pending : null,
      submit: !!(valid && draft.submit), conflict: !!(draft && !valid && initial.status === 'ACTIVE') };
  }
  const [attempt, setAttempt] = useState(initial), [answers, setAnswers] = useState(saved.current.answers), [index, setIndex] = useState(0);
  const [status, setStatus] = useState('Connected. Autosave runs every 5 seconds.'), [error, setError] = useState(saved.current.conflict ? 'An older local draft could not be reconciled. The server’s saved answers have been loaded.' : '');
  const [remaining, setRemaining] = useState(0), [fullscreen, setFullscreen] = useState(!!document.fullscreenElement), [locked, setLocked] = useState(saved.current.submit),[confirmSubmit,setConfirmSubmit]=useState(false);
  const state = useRef({ answers: saved.current.answers, revision: initial.revision, pending: saved.current.pending, submit: saved.current.submit,
    status: initial.status, busy: false, conflict: false, serverTime: +new Date(initial.serverNow), measuredAt: performance.now() });
  const persist = () => {
    try { sessionStorage.setItem(key, JSON.stringify({ answers: state.current.answers, revision: state.current.revision, pending: state.current.pending, submit: state.current.submit })); }
    catch { setError('Browser draft storage is unavailable. Keep this tab open and check the saved indicator.'); }
  };
  function change(qid, oid) {
    if (state.current.submit || state.current.conflict || state.current.status !== 'ACTIVE') return;
    const updated = { ...state.current.answers }; if (oid) updated[qid] = oid; else delete updated[qid];
    state.current.answers = updated; setAnswers(updated); persist(); setStatus('Unsaved changes · next autosave within 5 seconds');
  }
  async function save(submit = false) {
    const s = state.current;
    if (submit) { s.submit = true; setLocked(true); persist(); }
    if (s.busy || s.conflict || s.status !== 'ACTIVE') return;
    s.busy = true;
    try {
      // A timed-out batch is retried with the SAME ID and body before a later batch.
      do {
        if (!s.pending) s.pending = { path: s.submit ? 'submit' : 'answers', body: { expectedRevision: s.revision, requestId: uuid(), answers: { ...s.answers } } };
        persist(); setStatus(s.submit ? 'Submitting to the school server…' : 'Saving answers…');
        const result = await api(`/exams/attempts/${initial.id}/${s.pending.path}`, { method: 'POST', body: s.pending.body });
        const wasSubmit = s.pending.path === 'submit';
        const savedAnswers = s.pending.body.answers;
        s.pending = null; s.revision = result.revision; s.status = result.status;
        s.serverTime = +new Date(result.serverNow); s.measuredAt = performance.now();
        setAttempt(a => ({ ...a, ...result }));
        if (result.status === 'SUBMITTED') { sessionStorage.removeItem(key); setStatus('Submission confirmed by the server'); break; }
        persist(); setStatus(JSON.stringify(savedAnswers) === JSON.stringify(s.answers)
          ? `Saved on the school server at ${new Date().toLocaleTimeString()}`
          : 'Recent changes pending · next autosave within 5 seconds');
        if (!s.submit || wasSubmit) break;
      } while (s.status === 'ACTIVE');
      setError('');
    } catch (err) {
      if (err.status === 409) { s.conflict = true; setLocked(true); setError(err.message); setStatus('Save conflict — reload required'); }
      else { setError(err.status === 401 ? 'Your session expired. Reload and sign in again to resume.' : 'Cannot confirm this save. Keep the tab open; retrying automatically.'); setStatus('Connection interrupted · local draft retained'); }
    } finally { s.busy = false; }
  }
  useEffect(() => {
    if (initial.status !== 'ACTIVE') return;
    const socket = io({ auth: { csrf: getCsrf() } });
    const heartbeat = () => socket.emit('heartbeat', { attemptId: initial.id });
    socket.on('connect', heartbeat);
    const beatTimer = setInterval(heartbeat, 10000), saveTimer = setInterval(() => save(), (settings.autosaveSeconds || 5) * 1000);
    const tick = () => {
      const s = state.current, now = s.serverTime + performance.now() - s.measuredAt;
      const seconds = Math.max(0, Math.ceil((+new Date(initial.deadline) - now) / 1000)); setRemaining(seconds);
      if (!seconds && s.status === 'ACTIVE') {if(initial.autoSubmit)save(true);else {setLocked(true);setStatus('Time ended · submit your saved answers');}}
    };
    tick(); const timer = setInterval(tick, 1000);
    const incident = kind => { if (state.current.status === 'ACTIVE') api(`/exams/attempts/${initial.id}/incidents`, { method: 'POST', body: { kind } }).catch(() => {}); };
    const blur = () => incident('WINDOW_BLUR'), hidden = () => { if (document.hidden) incident('PAGE_HIDDEN'); };
    const full = () => { setFullscreen(!!document.fullscreenElement); if (!document.fullscreenElement) incident('FULLSCREEN_EXIT'); };
    const unload = e => { if (state.current.status === 'ACTIVE') { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('blur', blur); document.addEventListener('visibilitychange', hidden); document.addEventListener('fullscreenchange', full); window.addEventListener('beforeunload', unload);
    return () => { socket.disconnect(); clearInterval(beatTimer); clearInterval(saveTimer); clearInterval(timer); window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', hidden); document.removeEventListener('fullscreenchange', full); window.removeEventListener('beforeunload', unload); };
  }, []);
  if (attempt.status === 'SUBMITTED') return <main className="submission"><div className="completion-icon">✓</div><span className="eyebrow">SUBMISSION RECEIVED</span><h1>You’re all done.</h1><p>Your answers for <strong>{attempt.title}</strong> have been submitted.</p>{attempt.score !== null ? <div className="score">{attempt.score}<span> / {attempt.maxScore}</span></div> : <p className="muted">Your administrator will release the score when it is ready.</p>}<button onClick={leave}>Back to examinations</button></main>;
  const q = attempt.questions[index], count = Object.keys(answers).length;
  return <div className="exam-shell"><header><div><span className="eyebrow">EXAMINATION IN PROGRESS</span><h2>{attempt.title}</h2></div><div className={'timer ' + (remaining < 60 ? 'urgent' : '')}><small>TIME REMAINING</small>{Math.floor(remaining / 60).toString().padStart(2,'0')}:{(remaining % 60).toString().padStart(2,'0')}</div></header>{settings.kioskFullscreen && !fullscreen && <div className="fullscreen-notice">Stay in fullscreen during your examination. Exits are recorded. <button className="secondary" onClick={() => document.documentElement.requestFullscreen?.().catch(() => setError('Fullscreen is unavailable. Ask your invigilator for assistance.'))}>Enter fullscreen</button></div>}<div className="save-status" role="status"><span className="dot"/>{status}</div>{error && <div role="alert" className="error">{error}{state.current.conflict && <button className="secondary" onClick={() => location.reload()}>Reload saved answers</button>}</div>}<main className="exam-layout"><section className="panel question"><span className="eyebrow">QUESTION {index+1} OF {attempt.questions.length} · {q.points} POINT{q.points !== 1 ? 'S' : ''}</span><h1>{q.prompt}</h1><div className="answer-options">{['SHORT_TEXT','ESSAY'].includes(q.type)?<textarea value={answers[q.id]||''} onChange={e=>change(q.id,e.target.value)} disabled={locked} placeholder={q.type==='ESSAY'?'Write your answer here':'Enter your answer'}/>:q.options.map((o,i) => <label className={'answer-option ' + (answers[q.id] === o.id ? 'selected' : '')} key={o.id}><input type="radio" name={q.id} checked={answers[q.id] === o.id} onChange={() => change(q.id, o.id)} disabled={locked}/><span className="option-letter">{String.fromCharCode(65+i)}</span><span>{o.text}</span></label>)}</div><button className="text-button" disabled={locked} onClick={() => change(q.id, null)}>Clear answer</button><div className="question-footer"><button className="secondary" disabled={index === 0} onClick={() => setIndex(index-1)}>← Previous</button><button disabled={index === attempt.questions.length-1} onClick={() => setIndex(index+1)}>Next question →</button></div></section><aside className="panel navigator"><h3>Your progress</h3><p className="muted">{count} of {attempt.questions.length} answered</p><progress value={count} max={attempt.questions.length}/><div className="question-grid">{attempt.questions.map((q,i) => <button key={q.id} className={(answers[q.id] ? 'answered ' : '') + (i === index ? 'current' : '')} onClick={() => setIndex(i)} aria-label={`Question ${i+1}${answers[q.id] ? ', answered' : ''}`}>{i+1}</button>)}</div><small>Answers save every {settings.autosaveSeconds || 5} seconds. The server submits at the deadline, even if this browser disconnects.</small><button className="submit" disabled={state.current.submit} onClick={()=>setConfirmSubmit(true)}>Submit examination</button>{attempt.instructions && <details><summary>Exam instructions</summary><p>{attempt.instructions}</p></details>}</aside></main><Modal title="Submit examination" open={confirmSubmit} onClose={()=>setConfirmSubmit(false)}><p>{attempt.questions.length-count} question(s) are unanswered. Answers cannot be changed after submission.</p><div className="modal-actions"><button className="secondary" onClick={()=>setConfirmSubmit(false)}>Continue exam</button><button onClick={()=>{setConfirmSubmit(false);save(true)}}>Submit now</button></div></Modal></div>;
}
