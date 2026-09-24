import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import dotenv from 'dotenv';
import { io } from 'socket.io-client';
const env = dotenv.parse(readFileSync('.env'));
const origin = 'http://127.0.0.1:4173';
assert.equal((await fetch(`${origin}/api/health/ready`)).status, 200);
const login = await fetch(`${origin}/api/auth/login`, { method: 'POST', headers: { Origin: origin, 'Content-Type':'application/json' }, body: JSON.stringify({email:env.ADMIN_EMAIL,password:env.ADMIN_PASSWORD}) });
assert.equal(login.status, 200);
const cookie = login.headers.get('set-cookie').split(';')[0], data = await login.json();
assert.equal(data.user.role,'ADMIN');
const headers = { Cookie:cookie, Origin:origin, 'X-CSRF-Token':data.csrf };
for (const path of ['classes','students','staff','staff-roles','exams','monitor','results','payments','sync','settings','attendance/windows']) {
  assert.equal((await fetch(`${origin}/api/admin/${path}`, { headers })).status, 200, path);
}
const publicConfig = await (await fetch(origin + '/api/config/public')).json();
if (publicConfig.hostelEnabled) assert.equal((await fetch(origin + '/api/hostels/dashboard', { headers })).status, 200, 'hostel dashboard');
for (const path of ['catalog','assignments','materials','library','progress-reports']) {
  assert.equal((await fetch(`${origin}/api/academics/${path}`, { headers })).status, 200, path);
}
assert.equal(publicConfig.features.library,true);
const preflight=await fetch('http://127.0.0.1:3000/api/auth/login',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'}});
assert.equal(preflight.status,204,'remote-access preflight');
assert.equal(preflight.headers.get('access-control-allow-origin'),origin);
const invalidPdf=await fetch(origin+'/api/files',{method:'POST',headers:{...headers,'Content-Type':'application/pdf','X-File-Name':'fake.pdf','X-File-Purpose':'library'},body:'not a pdf'});
assert.equal(invalidPdf.status,415,'upload signature validation');
const library=await (await fetch(origin+'/api/academics/library',{headers})).json();
const libraryPdf=library.find(x=>x.file.mimeType==='application/pdf');
if(libraryPdf){const viewed=await fetch(origin+'/api/files/'+libraryPdf.fileId,{headers});assert.equal(viewed.status,200,'library PDF view');assert.match(viewed.headers.get('content-disposition')||'',/^inline/i,'library PDF inline');assert.equal(viewed.headers.get('accept-ranges'),'none','library PDF range download disabled');}

const students = await (await fetch(`${origin}/api/admin/students`, { headers })).json();
if (students[0]) assert.equal((await fetch(`${origin}/api/admin/students/${students[0].id}/profile`, { headers })).status, 200, 'student profile');const socket = io(origin, { auth:{csrf:data.csrf}, extraHeaders:{Cookie:cookie,Origin:origin}, reconnection:false });
await new Promise((resolve,reject) => { const timer=setTimeout(() => reject(new Error('Socket.IO connection timeout')),10000); socket.once('connect',()=>{clearTimeout(timer);resolve();}); socket.once('connect_error',err=>{clearTimeout(timer);reject(err);}); });
socket.disconnect();
assert.equal((await fetch(`${origin}/api/auth/logout`, {method:'POST',headers})).status,200);
console.log('PASS: preview proxy, SQL readiness, feature configuration, CORS preflight, administrator access, upload validation, inline library PDF viewing, authenticated Socket.IO, and logout.');
