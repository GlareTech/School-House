import bcrypt from 'bcryptjs';
import { db, redis } from '../src/db.js';
import { z } from 'zod';
const input = z.object({ ADMIN_EMAIL: z.string().email(), ADMIN_PASSWORD: z.string().min(16).max(72).refine(v => Buffer.byteLength(v, 'utf8') <= 72, 'Password exceeds 72 UTF-8 bytes'), ADMIN_NAME: z.string().min(1) }).parse(process.env);
if (/replace_with|change.?me/i.test(input.ADMIN_PASSWORD)) throw new Error('Replace the placeholder administrator password');
try {
  const email = input.ADMIN_EMAIL.toLowerCase();
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.role !== 'ADMIN') throw new Error('Email already belongs to a student');
    console.log('Administrator already exists; password unchanged.');
  } else {
    await db.user.create({ data: { email, name: input.ADMIN_NAME, role: 'ADMIN', passwordHash: await bcrypt.hash(input.ADMIN_PASSWORD, 12) } });
    console.log('Administrator created.');
  }
  const roles = [
    { name:'Teacher', description:'Assigned class teaching and assessment', permissions:['ASSIGNMENTS_MANAGE','MATERIALS_MANAGE','LIBRARY_MANAGE','GRADES_MANAGE','REPORTS_VIEW','ATTENDANCE_MANAGE','COMMUNICATIONS_MANAGE'] },
    { name:'Examinations Officer', description:'Create exams and monitor sittings', permissions:['CLASSES_MANAGE','STUDENTS_MANAGE','EXAMS_MANAGE','EXAMS_MONITOR','GRADES_MANAGE','REPORTS_VIEW','RESULTS_VIEW'] },
    { name:'Bursar', description:'Student and payment records', permissions:['STUDENTS_MANAGE','PAYMENTS_MANAGE','SYNC_VIEW'] }
  ];
  for (const role of roles) await db.staffRole.upsert({ where:{name:role.name}, update:{}, create:{name:role.name,description:role.description,grants:{create:role.permissions.map(permission=>({permission}))}} });
  await db.appSetting.upsert({where:{id:'global'},update:{},create:{id:'global'}});
} finally { await db.$disconnect(); redis.disconnect(); }
