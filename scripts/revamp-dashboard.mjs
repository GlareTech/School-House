import {readFileSync,writeFileSync} from 'node:fs';
const path='frontend/src/Admin.jsx';
let source=readFileSync(path,'utf8');
source=source.replaceAll("'Exams'","'CBT Tests'").replaceAll("'Gradebook'","'Overall grading'");
source=source.replace(
  "['Assignments','✎','ASSIGNMENTS_MANAGE'],['Overall grading','▦','GRADES_MANAGE']",
  "['Assignments','✎','ASSIGNMENTS_MANAGE'],['Assignment grading','✓','GRADES_MANAGE'],['Overall grading','▦','GRADES_MANAGE']"
);
source=source.replace(
  "const can=permission=>!permission||user.role==='ADMIN'||(permission!=='STAFF_MANAGE'&&user.permissions?.includes(permission));",
  "const isAdmin=['ADMIN','SUPER_ADMIN'].includes(String(user.role).toUpperCase()); const can=permission=>isAdmin||!permission||user.permissions?.includes(permission);"
);
const overviewStart=source.indexOf("{page === 'Overview' && <>");
const classesStart=source.indexOf("      {page === 'Classes'",overviewStart);
if(overviewStart<0||classesStart<0)throw new Error('Overview block not found');
source=source.slice(0,overviewStart)+"{page === 'Overview' && <Dashboard user={user} students={students} classes={classes} staff={staff} exams={exams} monitor={monitor} results={results} sync={sync} setPage={setPage}/>}\n"+source.slice(classesStart);
source=source.replace(
  "{['Academic setup','Assignments','Overall grading','Report cards','Promotions'].includes(page)&&<AcademicModule",
  "{['Academic setup','Assignments','Assignment grading','Overall grading','Report cards','Promotions'].includes(page)&&<AcademicModule"
);
source=source.replace('function ExamEditor({ exam, classes, save, cancel, busy }) {',`function Dashboard({user,students,classes,staff,exams,monitor,results,sync,setPage}) {
  const published=exams.filter(e=>e.status==='PUBLISHED').length,drafts=exams.filter(e=>e.status==='DRAFT').length,active=monitor.filter(a=>a.status==='ACTIVE').length;
  const firstName=user.name?.split(' ')[0]||'Administrator';
  return <div className="dashboard-v2"><section className="dashboard-hero"><div><span className="eyebrow">ADMINISTRATOR DASHBOARD</span><h2>Welcome back, {firstName}.</h2><p>Students, assessments and school operations are ready from one place.</p><div className="hero-actions"><button onClick={()=>setPage('CBT Tests')}>+ Create CBT test</button><button className="light" onClick={()=>setPage('Assignments')}>Post assignment</button></div></div><div className="hero-mark"><span>{new Date().toLocaleDateString(undefined,{weekday:'short'})}</span><strong>{new Date().getDate()}</strong><small>{new Date().toLocaleDateString(undefined,{month:'long',year:'numeric'})}</small></div></section>
    <div className="dashboard-stats">{[['Students',students.length,'Enrolled learners','Students'],['Staff',staff.length,'Active team accounts','Staff & roles'],['Live CBT',active,'Tests in progress','Live monitor'],['CBT results',results.length,'Submitted attempts','Results']].map(([label,value,note,target])=><button className="dashboard-stat" key={label} onClick={()=>setPage(target)}><span>{label}</span><strong>{value}</strong><small>{note}</small><b>Open →</b></button>)}</div>
    <div className="dashboard-grid"><section className="panel dashboard-assessments"><div className="panel-title"><div><span className="eyebrow">ASSESSMENTS</span><h2>CBT test centre</h2></div><button className="text-button" onClick={()=>setPage('CBT Tests')}>Manage tests →</button></div><div className="mini-metrics"><span><strong>{published}</strong> Published</span><span><strong>{drafts}</strong> Drafts</span><span><strong>{active}</strong> Live now</span></div>{exams.slice(0,4).map(e=><div className="list-row" key={e.id}><div><strong>{e.title}</strong><small>{e.class.name} · {e.durationMinutes} minutes</small></div><span className={'badge '+e.status.toLowerCase()}>{e.status}</span></div>)}{!exams.length&&<Empty>Create your first CBT test to begin.</Empty>}</section>
      <section className="panel dashboard-work"><span className="eyebrow">QUICK WORK</span><h2>What would you like to do?</h2>{[['✎','Post an assignment','Assignments'],['✓','Grade submissions','Assignment grading'],['▦','Review overall grades','Overall grading'],['♙','Register a student','Students'],['⚙','School configuration','Configuration']].map(([icon,label,target])=><button className="quick-link" key={label} onClick={()=>setPage(target)}><span>{icon}</span>{label}<b>›</b></button>)}</section>
      <section className="panel dashboard-classes"><div className="panel-title"><div><span className="eyebrow">ENROLMENT</span><h2>Classes</h2></div><button className="text-button" onClick={()=>setPage('Classes')}>View all →</button></div>{classes.slice(0,5).map(c=><div className="class-progress" key={c.id}><div><strong>{c.name}</strong><small>{c._count.students} students</small></div><span>{c._count.exams} CBT tests</span></div>)}{!classes.length&&<Empty>No classes created.</Empty>}</section>
      <section className="dashboard-health"><span className="eyebrow">LOCAL SERVER</span><h2>School data is available on your LAN.</h2><p>{sync.pending} record{sync.pending===1?'':'s'} waiting for cloud sync. Local teaching and CBT continue during internet interruptions.</p><button className="light" onClick={()=>setPage('Cloud sync')}>View sync status →</button></section></div></div>;
}
function ExamEditor({ exam, classes, save, cancel, busy }) {`);
writeFileSync(path,source);
