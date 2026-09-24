import {createHash,randomBytes} from 'node:crypto';
import {db,redis} from '../backend/src/db.js';
import {libraryWhereForStaff} from '../backend/src/scope-domain.js';

const base=process.env.SMOKE_BASE_URL||'http://127.0.0.1:4173',origin=new URL(base).origin;
const token=randomBytes(32).toString('hex'),sessionId=createHash('sha256').update(token).digest('hex');
let created=false;
try{
  const candidates=await db.user.findMany({where:{role:'STAFF',active:true},include:{staffRole:{include:{grants:true}},staffClasses:{select:{classId:true}},classTeacherFor:{select:{id:true}},teachingAssignments:{select:{id:true,classId:true,subjectId:true,teacherId:true}}}});
  const teacher=candidates.find(row=>row.staffRole?.grants.some(grant=>grant.permission==='EXAMS_MANAGE')&&(row.staffClasses.length||row.classTeacherFor.length||row.teachingAssignments.length));
  if(!teacher)throw new Error('No active staff member with CBT permission and a teaching assignment is available for the live scope check');
  const classWideIds=[...new Set([...teacher.staffClasses.map(row=>row.classId),...teacher.classTeacherFor.map(row=>row.id)])];
  const courses=await db.classSubject.findMany({where:{OR:[{teacherId:teacher.id},...(classWideIds.length?[{classId:{in:classWideIds}}]:[])]},select:{id:true,classId:true,subjectId:true,teacherId:true}}),scope={classWideIds,courses};
  await db.session.create({data:{id:sessionId,userId:teacher.id,csrf:randomBytes(32).toString('hex'),expiresAt:new Date(Date.now()+300000)}});created=true;
  const headers={Cookie:`school_session=${token}`,Origin:origin};
  const [catalogResponse,libraryResponse]=await Promise.all([fetch(`${base}/api/academics/catalog`,{headers}),fetch(`${base}/api/academics/library`,{headers})]);
  if(!catalogResponse.ok)throw new Error(`Catalog request failed with ${catalogResponse.status}`);
  if(!libraryResponse.ok)throw new Error(`Library request failed with ${libraryResponse.status}`);
  const catalog=await catalogResponse.json(),library=await libraryResponse.json(),expectedCourseIds=courses.map(row=>row.id).sort(),actualCourseIds=catalog.courses.map(row=>row.id).sort();
  if(JSON.stringify(expectedCourseIds)!==JSON.stringify(actualCourseIds))throw new Error('CBT course catalogue exceeded or omitted the teacher scope');
  const expectedLibraryIds=(await db.libraryMaterial.findMany({where:libraryWhereForStaff(teacher.id,scope),select:{id:true}})).map(row=>row.id).sort(),actualLibraryIds=library.map(row=>row.id).sort();
  if(JSON.stringify(expectedLibraryIds)!==JSON.stringify(actualLibraryIds))throw new Error('Library response exceeded or omitted the teacher scope');
  console.log(`Staff scope verified: ${actualCourseIds.length} course(s), ${actualLibraryIds.length} library item(s)`);
}finally{
  if(created)await db.session.deleteMany({where:{id:sessionId}});
  await db.$disconnect();
  if(typeof redis.quit==='function')await redis.quit();
}
