import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db, audit, enqueue } from './db.js';
import { admin, permit, publicUser, PERMISSIONS } from './auth.js';
import { HttpError } from './domain.js';
import { lockRow } from './provider.js';
import { clearSettingsCache, defaults } from './settings.js';
const id = z.string().min(1).max(100);
const passwordSchema = z.string().min(12).max(72).refine(v => Buffer.byteLength(v, 'utf8') <= 72, 'Password must be at most 72 UTF-8 bytes');
const questionSchema = z.object({ prompt: z.string().trim().min(1).max(10000), points: z.number().int().min(1).max(100),
  type: z.enum(['MCQ','TRUE_FALSE','SHORT_TEXT','ESSAY']).default('MCQ'), correctText: z.string().trim().max(3000).nullable().optional(),
  options: z.array(z.object({ text: z.string().trim().min(1).max(3000), correct: z.boolean() })).max(8).default([])
}).superRefine((q,ctx)=>{if(['MCQ','TRUE_FALSE'].includes(q.type)&&(q.options.length<2||q.options.filter(o=>o.correct).length!==1))ctx.addIssue({code:'custom',path:['options'],message:'Exactly one correct option is required'});if(q.type==='SHORT_TEXT'&&!q.correctText)ctx.addIssue({code:'custom',path:['correctText'],message:'A model answer is required'});});
const examSchema = z.object({ title: z.string().trim().min(1).max(200), instructions: z.string().max(10000).default(''),
  classId: id, durationMinutes: z.number().int().min(1).max(360), startsAt: z.string().datetime(), endsAt: z.string().datetime(),
  subjectId:id,termId:id,timed:z.boolean().default(true),autoSubmit:z.boolean().default(true),assessmentLabel:z.enum(['ASSESSMENT_1','ASSESSMENT_2','FINAL_EXAM']).default('FINAL_EXAM'),
  questions: z.array(questionSchema).min(1).max(300)
}).refine(e => new Date(e.endsAt) > new Date(e.startsAt), 'End time must follow start time');
async function scopeFor(req, client=db) {
  if(req.user.role==='ADMIN') return null;
  const [classRows,ledClasses,courses]=await Promise.all([
    client.staffClass.findMany({where:{staffId:req.user.id},select:{classId:true}}),
    client.class.findMany({where:{classTeacherId:req.user.id},select:{id:true}}),
    client.classSubject.findMany({where:{teacherId:req.user.id},select:{classId:true,subjectId:true}})
  ]);
  const classWideIds=[...new Set([...classRows.map(x=>x.classId),...ledClasses.map(x=>x.id)])],classIds=[...new Set([...classWideIds,...courses.map(x=>x.classId)])];
  return {classIds,classWideIds,courses};
}
async function assertClassScope(req,classId,subjectId,client=db){
  const scope=await scopeFor(req,client);if(!scope)return;
  const allowed=scope.classWideIds.includes(classId)||scope.courses.some(x=>x.classId===classId&&(!subjectId||x.subjectId===subjectId));
  if(!allowed)throw new HttpError(403,'This class or subject is not assigned to you');
}
async function assertClassWideScope(req,classId,client=db){
  const scope=await scopeFor(req,client);if(!scope)return;
  if(!scope.classWideIds.includes(classId))throw new HttpError(403,'Class management requires an assigned class');
}
async function scopedExamWhere(req,client=db){
  const scope=await scopeFor(req,client);if(!scope)return {};
  return {OR:[...scope.classWideIds.map(classId=>({classId})),...scope.courses.map(({classId,subjectId})=>({classId,subjectId}))]};
}
export function adminRouter() {
  const r = Router();
  const permissionFor = path => path.startsWith('/classes') ? 'CLASSES_MANAGE' : path.startsWith('/students') ? 'STUDENTS_MANAGE' :
    path.startsWith('/staff') ? 'STAFF_MANAGE' : path.startsWith('/exams') ? 'EXAMS_MANAGE' : path.startsWith('/monitor') ? 'EXAMS_MONITOR' :
    path.startsWith('/results') ? 'RESULTS_VIEW' : path.startsWith('/attendance') ? 'ATTENDANCE_MANAGE' : path.startsWith('/payments') ? 'PAYMENTS_MANAGE' :
    path.startsWith('/sync') ? 'SYNC_VIEW' : path.startsWith('/audit') ? 'AUDIT_VIEW' : 'SETTINGS_MANAGE';
  r.use((req,res,next) => permit(permissionFor(req.path))(req,res,next));
  r.get('/classes', async (req, res) => {const scope=await scopeFor(req);res.json(await db.class.findMany({where:scope?{id:{in:scope.classIds}}:{}, include: { classTeacher:{select:{id:true,name:true,email:true}},staff:{select:{staff:{select:{id:true,name:true,email:true}}}},_count: { select: { students: true, exams: true } } }, orderBy: { name: 'asc' } }));});
  r.post('/classes', async (req, res) => {
    if(req.user.role!=='ADMIN')throw new HttpError(403,'Only administrators can create classes');
    const input = z.object({ name: z.string().trim().min(1).max(100).optional(),levelName:z.string().trim().min(1).max(80).optional(),groupName:z.string().trim().max(30).optional(),classTeacherId:id.nullable().optional() }).strict().parse(req.body);
    const levelName=input.levelName||input.name,groupName=input.groupName||'',data={...input,levelName,groupName,name:groupName?`${levelName} ${groupName}`:levelName};
    if('classTeacherId' in data&&req.user.role!=='ADMIN')throw new HttpError(403,'Only administrators can assign class teachers');
    if(data.classTeacherId&&!await db.user.findFirst({where:{id:data.classTeacherId,role:'STAFF',active:true}}))throw new HttpError(400,'Choose an active staff member');
    res.status(201).json(await db.$transaction(async tx => { const c = await tx.class.create({ data }); if(data.classTeacherId)await tx.staffClass.upsert({where:{staffId_classId:{staffId:data.classTeacherId,classId:c.id}},create:{staffId:data.classTeacherId,classId:c.id},update:{}}); await audit(tx, req.user.id, 'class.create', c.id); return c; }));
  });
  r.patch('/classes/:id', async (req, res) => {
    await assertClassWideScope(req,req.params.id);
    const data = z.object({name:z.string().trim().min(1).max(100).optional(),classTeacherId:id.nullable().optional()}).strict().refine(x=>Object.keys(x).length>0,'Provide a class change').parse(req.body);
    if('classTeacherId' in data&&req.user.role!=='ADMIN')throw new HttpError(403,'Only administrators can assign class teachers');
    if(data.classTeacherId&&!await db.user.findFirst({where:{id:data.classTeacherId,role:'STAFF',active:true}}))throw new HttpError(400,'Choose an active staff member');
    res.json(await db.$transaction(async tx => { const previous=await tx.class.findUnique({where:{id:req.params.id}});if(!previous)throw new HttpError(404,'Class not found');const c = await tx.class.update({ where: { id: req.params.id }, data }); if('classTeacherId' in data){if(previous.classTeacherId&&previous.classTeacherId!==data.classTeacherId)await tx.staffClass.deleteMany({where:{staffId:previous.classTeacherId,classId:c.id}});if(data.classTeacherId)await tx.staffClass.upsert({where:{staffId_classId:{staffId:data.classTeacherId,classId:c.id}},create:{staffId:data.classTeacherId,classId:c.id},update:{}});} await audit(tx, req.user.id, 'class.update', c.id); return c; }));
  });
  r.get('/students', async (req, res) => {const scope=await scopeFor(req),classId=req.query.classId?id.parse(req.query.classId):null;if(classId)await assertClassWideScope(req,classId);res.json(await db.user.findMany({ where: { role: 'STUDENT', ...(classId ? { classId } : scope?{classId:{in:scope.classWideIds}}:{}) },
    select: { id:true,name:true,email:true,classId:true,profilePictureId:true,active:true,phone:true,address:true,dateOfBirth:true,gender:true,emergencyContactName:true,emergencyContactPhone:true,emergencyRelationship:true,guardianEmail:true,studentAllowEmail:true,studentAllowSms:true,guardianAllowEmail:true,guardianAllowSms:true,medicalInformation:true,lastLoginAt:true,class:{select:{name:true}} }, orderBy: { name: 'asc' }, take: 500 }));});
  r.get('/students/:id/profile',async(req,res)=>{
    const student=await db.user.findFirst({where:{id:req.params.id,role:'STUDENT'},select:{id:true,name:true,email:true,classId:true,profilePictureId:true,active:true,phone:true,address:true,dateOfBirth:true,gender:true,emergencyContactName:true,emergencyContactPhone:true,emergencyRelationship:true,guardianEmail:true,studentAllowEmail:true,studentAllowSms:true,guardianAllowEmail:true,guardianAllowSms:true,medicalInformation:true,lastLoginAt:true,createdAt:true,class:{select:{id:true,name:true,classTeacher:{select:{name:true}}}},gradeEntries:{select:{score:true,maxScore:true,componentKey:true,updatedAt:true,term:{select:{id:true,name:true,session:{select:{name:true}}}},classSubject:{select:{subject:{select:{name:true}}}}},orderBy:{updatedAt:'asc'}},studentRatings:{include:{term:{include:{session:true}},ratedBy:{select:{name:true}}},orderBy:{updatedAt:'desc'}},attendance:{orderBy:{date:'desc'},take:180}}});
    if(!student)throw new HttpError(404,'Student not found');await assertClassWideScope(req,student.classId);
    res.json(student);
  });
  r.post('/students', async (req, res) => {
    const input = z.object({ name: z.string().trim().min(1).max(150), email: z.string().email().max(254).transform(s => s.toLowerCase()),
      password: passwordSchema, classId: id, profilePictureId:id.nullable().optional(),phone:z.string().max(50).default(''),address:z.string().max(1000).default(''),dateOfBirth:z.string().date().nullable().optional(),gender:z.string().max(30).default(''),emergencyContactName:z.string().max(150).default(''),emergencyContactPhone:z.string().max(50).default(''),emergencyRelationship:z.string().max(80).default(''),guardianEmail:z.union([z.literal(''),z.string().email().max(254)]).default(''),studentAllowEmail:z.boolean().default(true),studentAllowSms:z.boolean().default(true),guardianAllowEmail:z.boolean().default(true),guardianAllowSms:z.boolean().default(true),medicalInformation:z.string().max(5000).default('') }).strict().parse(req.body);
    await assertClassWideScope(req,input.classId);
    if(input.profilePictureId&&!await db.storedFile.findFirst({where:{id:input.profilePictureId,createdById:req.user.id,purpose:'profile',mimeType:{startsWith:'image/'}}}))throw new HttpError(400,'Invalid profile picture');
    const { password, ...data } = input;if(data.dateOfBirth)data.dateOfBirth=new Date(data.dateOfBirth);
    const passwordHash = await bcrypt.hash(password, 12);
    const u = await db.$transaction(async tx => { const u = await tx.user.create({ data: { ...data, passwordHash } }); await audit(tx, req.user.id, 'student.create', u.id); return u; });
    res.status(201).json(publicUser(u));
  });
  r.patch('/students/:id', async (req, res) => {
    const data = z.object({ name:z.string().trim().min(1).max(150).optional(),email:z.string().email().max(254).transform(s=>s.toLowerCase()).optional(),classId:id.optional(),profilePictureId:id.nullable().optional(),active:z.boolean().optional(),password:passwordSchema.optional(),phone:z.string().max(50).optional(),address:z.string().max(1000).optional(),dateOfBirth:z.string().date().nullable().optional(),gender:z.string().max(30).optional(),emergencyContactName:z.string().max(150).optional(),emergencyContactPhone:z.string().max(50).optional(),emergencyRelationship:z.string().max(80).optional(),guardianEmail:z.union([z.literal(''),z.string().email().max(254)]).optional(),studentAllowEmail:z.boolean().optional(),studentAllowSms:z.boolean().optional(),guardianAllowEmail:z.boolean().optional(),guardianAllowSms:z.boolean().optional(),medicalInformation:z.string().max(5000).optional() }).strict().parse(req.body);
    if(data.dateOfBirth)data.dateOfBirth=new Date(data.dateOfBirth);
    if (data.password) { data.passwordHash = await bcrypt.hash(data.password, 12); delete data.password; }
    res.json(await db.$transaction(async tx => {
      await lockRow(tx, 'User', req.params.id);
      const u = await tx.user.findUnique({ where: { id: req.params.id } });
      if (u?.role !== 'STUDENT') throw new HttpError(404, 'Student not found');
      await assertClassWideScope(req,u.classId,tx);if(data.classId)await assertClassWideScope(req,data.classId,tx);
      if(data.profilePictureId&&!await tx.storedFile.findFirst({where:{id:data.profilePictureId,createdById:req.user.id,purpose:'profile',mimeType:{startsWith:'image/'}}}))throw new HttpError(400,'Invalid profile picture');
      if (data.classId && await tx.attempt.count({ where: { studentId: u.id, status: 'ACTIVE' } })) throw new HttpError(409, 'Cannot transfer a student during an active exam');
      const updated = await tx.user.update({ where: { id: u.id }, data });
      if (data.passwordHash || data.active === false) await tx.session.deleteMany({ where: { userId: u.id } });
      await audit(tx, req.user.id, 'student.update', u.id); return publicUser(updated);
    }));
  });
  const importRows=z.object({rows:z.array(z.record(z.union([z.string(),z.number(),z.boolean(),z.null()]))).min(1).max(2000)});
  const importResult=(total,imported,errors)=>({total,imported,failed:errors.length,errors:errors.slice(0,100)});
  r.post('/students/import',async(req,res)=>{
    const {rows}=importRows.parse(req.body),errors=[];let imported=0;
    for(let i=0;i<rows.length;i++)try{const row=rows[i],classroom=await db.class.findFirst({where:{name:String(row.className||'').trim()}});if(!classroom)throw new Error('Unknown class');await assertClassWideScope(req,classroom.id);const password=passwordSchema.parse(String(row.password||''));await db.user.create({data:{name:String(row.name||'').trim(),email:z.string().email().parse(String(row.email||'').toLowerCase()),passwordHash:await bcrypt.hash(password,12),role:'STUDENT',classId:classroom.id,phone:String(row.phone||''),address:String(row.address||''),gender:String(row.gender||''),dateOfBirth:row.dateOfBirth?new Date(String(row.dateOfBirth)):null,emergencyContactName:String(row.emergencyContactName||''),emergencyContactPhone:String(row.emergencyContactPhone||''),emergencyRelationship:String(row.emergencyRelationship||''),guardianEmail:row.guardianEmail?z.string().email().parse(String(row.guardianEmail).toLowerCase()):'',studentAllowEmail:String(row.studentAllowEmail||'true').toLowerCase()!=='false',studentAllowSms:String(row.studentAllowSms||'true').toLowerCase()!=='false',guardianAllowEmail:String(row.guardianAllowEmail||'true').toLowerCase()!=='false',guardianAllowSms:String(row.guardianAllowSms||'true').toLowerCase()!=='false',medicalInformation:String(row.medicalInformation||'')}});imported++;}catch(e){errors.push({row:i+2,error:e.message})}
    await audit(db,req.user.id,'student.import',String(imported));res.json(importResult(rows.length,imported,errors));
  });
  r.post('/staff/import',admin,async(req,res)=>{
    const {rows}=importRows.parse(req.body),errors=[];let imported=0;
    for(let i=0;i<rows.length;i++)try{const row=rows[i],role=await db.staffRole.findFirst({where:{name:String(row.roleName||'').trim()}});if(!role)throw new Error('Unknown role');const classNames=String(row.classNames||'').split('|').map(x=>x.trim()).filter(Boolean),classes=classNames.length?await db.class.findMany({where:{name:{in:classNames}}}):[];if(classes.length!==classNames.length)throw new Error('Unknown class');const password=passwordSchema.parse(String(row.password||''));await db.user.create({data:{name:String(row.name||'').trim(),email:z.string().email().parse(String(row.email||'').toLowerCase()),passwordHash:await bcrypt.hash(password,12),role:'STAFF',staffRoleId:role.id,staffProfile:{create:{employeeNumber:String(row.employeeNumber||'').trim(),phone:String(row.phone||''),address:String(row.address||''),qualifications:String(row.qualifications||'').split('|').filter(Boolean)}},staffClasses:{create:classes.map(c=>({classId:c.id}))}}});imported++;}catch(e){errors.push({row:i+2,error:e.message})}
    await audit(db,req.user.id,'staff.import',String(imported));res.json(importResult(rows.length,imported,errors));
  });
  r.get('/staff-roles', admin, async (req,res) => res.json(await db.staffRole.findMany({ include:{grants:true,_count:{select:{users:true}}}, orderBy:{name:'asc'} })));
  r.post('/staff-roles', admin, async (req,res) => {
    const input=z.object({name:z.string().trim().min(1).max(100),description:z.string().trim().max(500).default(''),permissions:z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length)}).parse(req.body);
    res.status(201).json(await db.$transaction(async tx => { const role=await tx.staffRole.create({data:{name:input.name,description:input.description,grants:{create:[...new Set(input.permissions)].map(permission=>({permission}))}},include:{grants:true}}); await audit(tx,req.user.id,'staffRole.create',role.id); return role; }));
  });
  r.put('/staff-roles/:id', admin, async (req,res) => {
    const input=z.object({name:z.string().trim().min(1).max(100),description:z.string().trim().max(500),permissions:z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length)}).parse(req.body);
    res.json(await db.$transaction(async tx => { await tx.staffRoleGrant.deleteMany({where:{staffRoleId:req.params.id}}); const role=await tx.staffRole.update({where:{id:req.params.id},data:{name:input.name,description:input.description,grants:{create:[...new Set(input.permissions)].map(permission=>({permission}))}},include:{grants:true}}); await tx.session.deleteMany({where:{user:{staffRoleId:role.id}}}); await audit(tx,req.user.id,'staffRole.update',role.id); return role; }));
  });
  r.get('/staff', admin, async (req,res) => res.json(await db.user.findMany({where:{role:'STAFF'},select:{id:true,name:true,email:true,active:true,staffRoleId:true,staffRole:{select:{id:true,name:true}},staffProfile:true,staffClasses:true,teachingAssignments:{select:{id:true}}},orderBy:{name:'asc'},take:1000})));
  r.post('/staff', admin, async (req,res) => {
    const input=z.object({name:z.string().trim().min(1).max(150),email:z.string().email().max(254).transform(s=>s.toLowerCase()),password:passwordSchema,staffRoleId:id,employeeNumber:z.string().trim().min(1).max(50),phone:z.string().max(50).default(''),address:z.string().max(500).default(''),qualifications:z.array(z.string().trim().min(1).max(200)).max(30).default([]),salaryMinor:z.number().int().nonnegative().nullable().default(null),payrollStatus:z.enum(['NOT_CONFIGURED','ACTIVE','SUSPENDED']).default('NOT_CONFIGURED'),classIds:z.array(id).max(100).default([])}).parse(req.body);
    const {password,employeeNumber,phone,address,qualifications,salaryMinor,payrollStatus,classIds,...data}=input; const passwordHash=await bcrypt.hash(password,12);
    const user=await db.$transaction(async tx=>{const u=await tx.user.create({data:{...data,passwordHash,role:'STAFF',staffProfile:{create:{employeeNumber,phone,address,qualifications,salaryMinor,payrollStatus}},staffClasses:{create:[...new Set(classIds)].map(classId=>({classId}))}},include:{staffRole:{include:{grants:true}}}});if(classIds.length)await tx.class.updateMany({where:{id:{in:[...new Set(classIds)]}},data:{classTeacherId:u.id}});await audit(tx,req.user.id,'staff.create',u.id);return u;}); res.status(201).json(publicUser(user));
  });
  r.patch('/staff/:id', admin, async (req,res) => {
    const data=z.object({name:z.string().trim().min(1).max(150).optional(),staffRoleId:id.optional(),active:z.boolean().optional(),password:passwordSchema.optional(),phone:z.string().max(50).optional(),address:z.string().max(500).optional(),qualifications:z.array(z.string().trim().min(1).max(200)).max(30).optional(),salaryMinor:z.number().int().nonnegative().nullable().optional(),payrollStatus:z.enum(['NOT_CONFIGURED','ACTIVE','SUSPENDED']).optional(),classIds:z.array(id).max(100).optional()}).strict().parse(req.body);
    if(data.password){data.passwordHash=await bcrypt.hash(data.password,12);delete data.password;}
    res.json(await db.$transaction(async tx=>{await lockRow(tx,'User',req.params.id);const u=await tx.user.findUnique({where:{id:req.params.id}});if(u?.role!=='STAFF')throw new HttpError(404,'Staff member not found');const profile={};for(const k of ['phone','address','qualifications','salaryMinor','payrollStatus'])if(k in data){profile[k]=data[k];delete data[k]}const classIds=data.classIds;delete data.classIds;const updated=await tx.user.update({where:{id:u.id},data,include:{staffRole:{include:{grants:true}}}});if(Object.keys(profile).length)await tx.staffProfile.upsert({where:{userId:u.id},create:{userId:u.id,employeeNumber:`LEGACY-${u.id}`,qualifications:[],...profile},update:profile});if(classIds){const unique=[...new Set(classIds)];await tx.staffClass.deleteMany({where:{staffId:u.id}});if(unique.length)await tx.staffClass.createMany({data:unique.map(classId=>({staffId:u.id,classId}))});await tx.class.updateMany({where:{classTeacherId:u.id,...(unique.length?{id:{notIn:unique}}:{})},data:{classTeacherId:null}});if(unique.length)await tx.class.updateMany({where:{id:{in:unique}},data:{classTeacherId:u.id}});}await tx.session.deleteMany({where:{userId:u.id}});await audit(tx,req.user.id,'staff.update',u.id);return publicUser(updated);}));
  });
  r.get('/exams', async (req, res) => res.json(await db.exam.findMany({where:await scopedExamWhere(req), include: { class: true, subject: true, term: { include: { session: true } }, questions: { include: { options: true } }, _count: { select: { attempts: true } } }, orderBy: { createdAt: 'desc' }, take: 200 })));
  r.post('/exams', async (req, res) => {
    const { questions, ...input } = examSchema.parse(req.body);
    await assertClassScope(req,input.classId,input.subjectId);
    if(!await db.classSubject.findFirst({where:{classId:input.classId,subjectId:input.subjectId,teacherId:{not:null}}}))throw new HttpError(400,'Assign a teacher to this class course before creating its CBT');
    res.status(201).json(await db.$transaction(async tx => {
      const exam = await tx.exam.create({ data: { ...input, questions: { create: questions.map(({ options, ...q }) => ({ ...q, options: { create: options } })) } } });
      await audit(tx, req.user.id, 'exam.create', exam.id); return exam;
    }));
  });
  r.put('/exams/:id', async (req, res) => {
    const { questions, ...input } = examSchema.parse(req.body);
    await assertClassScope(req,input.classId,input.subjectId);
    if(!await db.classSubject.findFirst({where:{classId:input.classId,subjectId:input.subjectId,teacherId:{not:null}}}))throw new HttpError(400,'Assign a teacher to this class course before creating its CBT');
    res.json(await db.$transaction(async tx => {
      await lockRow(tx, 'Exam', req.params.id);
      const e = await tx.exam.findUnique({ where: { id: req.params.id } });
      if (!e) throw new HttpError(404, 'Exam not found');
      await assertClassScope(req,e.classId,e.subjectId,tx);
      if (e.status !== 'DRAFT') throw new HttpError(409, 'Published exams are immutable. Create a new exam for corrections.');
      await tx.option.deleteMany({ where: { question: { examId: e.id } } });
      await tx.question.deleteMany({ where: { examId: e.id } });
      const updated = await tx.exam.update({ where: { id: e.id }, data: { ...input, questions: { create: questions.map(({ options, ...q }) => ({ ...q, options: { create: options } })) } } });
      await audit(tx, req.user.id, 'exam.edit', e.id); return updated;
    }));
  });
  r.patch('/exams/:id/status', async (req, res) => {
    const input = z.object({ status: z.enum(['PUBLISHED','CLOSED']).optional(), releaseResults: z.boolean().optional() }).strict().parse(req.body);
    res.json(await db.$transaction(async tx => {
      await lockRow(tx, 'Exam', req.params.id);
      const e = await tx.exam.findUnique({ where: { id: req.params.id }, include: { questions: true } });
      if (!e) throw new HttpError(404, 'Exam not found');
      await assertClassScope(req,e.classId,e.subjectId,tx);
      if (input.status === 'PUBLISHED' && (e.status !== 'DRAFT' || !e.questions.length || e.endsAt <= new Date())) throw new HttpError(409, 'Only a valid future draft may be published');
      if (input.status === 'CLOSED' && e.status !== 'PUBLISHED') throw new HttpError(409, 'Only a published exam may be closed');
      const updated = await tx.exam.update({ where: { id: e.id }, data: input });
      await audit(tx, req.user.id, 'exam.status', e.id); return updated;
    }));
  });
  r.get('/monitor', async (req, res) => {const examScope=await scopedExamWhere(req);res.json(await db.attempt.findMany({
    where: {AND:[req.query.examId ? { examId: id.parse(req.query.examId) } : { OR: [{ status: 'ACTIVE' }, { submittedAt: { gt: new Date(Date.now() - 86400000) } }] },{exam:examScope}]},
    select: { id: true, status: true, deadline: true, startedAt: true, lastSeenAt: true, revision: true,
      student: { select: { name: true, email: true } }, exam: { select: { title: true } },
      _count: { select: { responses: true, incidents: true } }, incidents: { orderBy: { createdAt: 'desc' }, take: 5 } },
    orderBy: { startedAt: 'desc' }, take: 1000
  }));});
  r.get('/results', async (req, res) => {const examScope=await scopedExamWhere(req);res.json(await db.attempt.findMany({
    where: { status: 'SUBMITTED', exam:examScope, ...(req.query.examId ? { examId: id.parse(req.query.examId) } : {}) },
    select: { id: true, score: true, maxScore: true, submittedAt: true, student: { select: { name: true, email: true } }, exam: { select: { title: true, class: { select: { name: true } } } } },
    orderBy: { submittedAt: 'desc' }, take: 10000
  }));});
  r.post('/results/import',permit('GRADES_MANAGE'),async(req,res)=>{
    const {rows}=importRows.parse(req.body),errors=[];let imported=0;
    for(let i=0;i<rows.length;i++)try{const row=rows[i],student=await db.user.findUnique({where:{email:String(row.studentEmail||'').toLowerCase()}});if(!student||student.role!=='STUDENT')throw new Error('Unknown student');const term=await db.term.findUnique({where:{id:String(row.termId||'')}});if(!term)throw new Error('Unknown term ID');const course=await db.classSubject.findFirst({where:{classId:student.classId,subject:{code:String(row.subjectCode||'').toUpperCase()}}});if(!course)throw new Error('Subject is not assigned to the student class');await assertClassScope(req,student.classId,course.subjectId);const score=Number(row.score),maxScore=Number(row.maxScore);if(!Number.isFinite(score)||!Number.isFinite(maxScore)||score<0||maxScore<=0||score>maxScore)throw new Error('Invalid score');await db.gradeEntry.upsert({where:{studentId_classSubjectId_termId_componentKey_title:{studentId:student.id,classSubjectId:course.id,termId:term.id,componentKey:String(row.componentKey||'FINAL_EXAM').toUpperCase(),title:String(row.title||'Imported result')}},create:{studentId:student.id,classSubjectId:course.id,termId:term.id,componentKey:String(row.componentKey||'FINAL_EXAM').toUpperCase(),title:String(row.title||'Imported result'),score:Math.round(score),maxScore:Math.round(maxScore),teacherId:req.user.id,comment:String(row.comment||'')},update:{score:Math.round(score),maxScore:Math.round(maxScore),teacherId:req.user.id,comment:String(row.comment||'')}});imported++;}catch(e){errors.push({row:i+2,error:e.message})}
    await audit(db,req.user.id,'result.import',String(imported));res.json(importResult(rows.length,imported,errors));
  });
  r.get('/attendance/windows',async(req,res)=>{const query=z.object({date:z.string().date().optional()}).parse(req.query),scope=await scopeFor(req);res.json(await db.attendanceWindow.findMany({where:{...(query.date?{date:new Date(query.date)}:{}),...(scope?{classId:{in:scope.classWideIds}}:{})},include:{class:{select:{id:true,name:true}},openedBy:{select:{name:true}},approvedBy:{select:{name:true}}},orderBy:{date:'desc'},take:100}));});
  r.post('/attendance/windows',async(req,res)=>{const data=z.object({classId:id,date:z.string().date(),closesAt:z.string().datetime()}).parse(req.body),scope=await scopeFor(req);if(scope&&!scope.classWideIds.includes(data.classId))throw new HttpError(403,'Class attendance requires an assigned class');const row=await db.attendanceWindow.upsert({where:{classId_date:{classId:data.classId,date:new Date(data.date)}},create:{classId:data.classId,date:new Date(data.date),closesAt:new Date(data.closesAt),openedById:req.user.id,status:'OPEN'},update:{closesAt:new Date(data.closesAt),openedById:req.user.id,status:'OPEN',approvedAt:null,approvedById:null}});await audit(db,req.user.id,'attendance.open',row.id);res.json(row);});
  r.post('/attendance/windows/:id/approve',async(req,res)=>{const window=await db.attendanceWindow.findUnique({where:{id:req.params.id}});if(!window)throw new HttpError(404,'Attendance session not found');const scope=await scopeFor(req);if(scope&&!scope.classWideIds.includes(window.classId))throw new HttpError(403,'Class attendance requires an assigned class');const row=await db.$transaction(async tx=>{await tx.attendance.updateMany({where:{date:window.date,student:{classId:window.classId}},data:{reviewStatus:'APPROVED'}});return tx.attendanceWindow.update({where:{id:window.id},data:{status:'APPROVED',approvedAt:new Date(),approvedById:req.user.id}})});await audit(db,req.user.id,'attendance.approve',row.id);res.json(row);});
  r.get('/attendance', async (req, res) => {
    const date = z.string().date().parse(req.query.date);
    const scope=await scopeFor(req);res.json(await db.attendance.findMany({ where: { date: new Date(date),...(scope?{student:{classId:{in:scope.classWideIds}}}:{}) }, include: { student: { select: { name: true, classId: true } } } }));
  });
  r.post('/attendance', async (req, res) => {
    const input = z.object({ date: z.string().date(), records: z.array(z.object({ studentId: id, status: z.enum(['PRESENT','ABSENT','LATE','EXCUSED']) })).min(1).max(500) }).parse(req.body);
    res.json(await db.$transaction(async tx => {
      const records = [];
      for (const record of input.records) {
        const student=await tx.user.findFirst({ where: { id: record.studentId, role: 'STUDENT' } });if(!student)throw new HttpError(400,'Invalid student');await assertClassWideScope(req,student.classId,tx);
        const a = await tx.attendance.upsert({ where: { studentId_date: { studentId: record.studentId, date: new Date(input.date) } },
          create: { ...record, date: new Date(input.date),source:'STAFF',reviewStatus:'APPROVED' }, update: { status: record.status,source:'STAFF',reviewStatus:'APPROVED' } });
        await enqueue(tx, 'attendance.upsert', a.id, a); records.push(a);
      }
      await audit(tx, req.user.id, 'attendance.record', input.date); return records;
    }, { timeout: 30000 }));
  });
  r.post('/attendance/import',async(req,res)=>{const {rows}=importRows.parse(req.body),errors=[];let imported=0;for(let i=0;i<rows.length;i++)try{const row=rows[i],student=await db.user.findUnique({where:{email:String(row.studentEmail||'').toLowerCase()}});if(!student||student.role!=='STUDENT')throw new Error('Unknown student');await assertClassWideScope(req,student.classId);const date=z.string().date().parse(String(row.date||'')),status=z.enum(['PRESENT','ABSENT','LATE','EXCUSED']).parse(String(row.status||'').toUpperCase());await db.attendance.upsert({where:{studentId_date:{studentId:student.id,date:new Date(date)}},create:{studentId:student.id,date:new Date(date),status,source:'IMPORT',reviewStatus:'APPROVED'},update:{status,source:'IMPORT',reviewStatus:'APPROVED'}});imported++;}catch(e){errors.push({row:i+2,error:e.message})}await audit(db,req.user.id,'attendance.import',String(imported));res.json(importResult(rows.length,imported,errors));});
  r.get('/payments', async (req, res) => {const scope=await scopeFor(req);res.json(await db.payment.findMany({where:scope?{student:{classId:{in:scope.classWideIds}}}:{}, include: { student: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 500 }));});
  r.post('/payments', async (req, res) => {
    const data = z.object({ reference: z.string().trim().min(1).max(100), studentId: id, amountMinor: z.number().int().positive().max(2000000000),
      currency: z.string().regex(/^[A-Z]{3}$/), description: z.string().trim().min(1).max(500) }).parse(req.body);
    res.status(201).json(await db.$transaction(async tx => {
      const student=await tx.user.findFirst({ where: { id: data.studentId, role: 'STUDENT' } });if(!student)throw new HttpError(400,'Invalid student');await assertClassWideScope(req,student.classId,tx);
      const p = await tx.payment.create({ data }); await enqueue(tx, 'payment.recorded', p.id, p);
      await audit(tx, req.user.id, 'payment.create', p.id); return p;
    }));
  });
  r.get('/sync', async (req, res) => res.json({
    pending: await db.syncLog.count({ where: { syncedAt: null } }),
    recent: await db.syncLog.findMany({ select: { id: true, kind: true, createdAt: true, syncedAt: true, attempts: true, lastError: true, nextAttemptAt: true }, orderBy: { createdAt: 'desc' }, take: 50 })
  }));
  r.get('/audit', async (req, res) => {
    const query=z.object({page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().int().min(10).max(100).default(50),search:z.string().trim().max(100).default('')}).parse(req.query);
    const where=query.search?{OR:[{action:{contains:query.search}},{actorId:{contains:query.search}},{entityId:{contains:query.search}}]}:{};
    const [items,total]=await Promise.all([db.auditLog.findMany({where,orderBy:{createdAt:'desc'},skip:(query.page-1)*query.pageSize,take:query.pageSize}),db.auditLog.count({where})]);
    const actors=await db.user.findMany({where:{id:{in:[...new Set(items.map(x=>x.actorId))]}},select:{id:true,name:true,email:true}}),byId=new Map(actors.map(x=>[x.id,x]));
    res.json({items:items.map(x=>({...x,actor:byId.get(x.actorId)||null})),page:query.page,pageSize:query.pageSize,total,pages:Math.ceil(total/query.pageSize)});
  });
  r.get('/settings', async (req,res) => res.json(await db.appSetting.findFirst() || await db.appSetting.create({data:{...defaults,organizationId:req.user.organizationId}})));
  r.put('/settings', async (req,res) => {
    const scale=z.array(z.object({grade:z.string().trim().min(1).max(5),min:z.number().int().min(0).max(100),remark:z.string().trim().max(100)})).min(2).max(20);
    const data=z.object({schoolName:z.string().trim().min(1).max(150),shortName:z.string().trim().min(1).max(12),tagline:z.string().trim().max(200),primaryColor:z.string().regex(/^#[0-9a-fA-F]{6}$/),accentColor:z.string().regex(/^#[0-9a-fA-F]{6}$/),academicYear:z.string().trim().max(50),currentTerm:z.string().trim().max(50),defaultCurrency:z.string().regex(/^[A-Z]{3}$/),locale:z.string().trim().min(2).max(20),timeZone:z.string().trim().min(1).max(100),autosaveSeconds:z.number().int().min(3).max(30),kioskFullscreen:z.boolean(),logoPath:z.string().max(100),watermarkPath:z.string().max(100),address:z.string().max(500),contactEmail:z.union([z.literal(''),z.string().email().max(254)]),contactPhone:z.string().max(50),gradingScale:scale,passingMark:z.number().int().min(0).max(100),syncEnabled:z.boolean(),hostelEnabled:z.boolean(),activeSessionId:id.nullable(),activeTermId:id.nullable(),principalName:z.string().max(150),principalSignaturePath:z.string().max(100)}).strict().parse(req.body);
    const settings=await db.$transaction(async tx=>{const saved=await tx.appSetting.update({where:{organizationId:req.user.organizationId},data});await audit(tx,req.user.id,'settings.update',req.user.organizationId);return saved;});clearSettingsCache();res.json(settings);
  });
  return r;
}
