import { Router } from 'express';
import { z } from 'zod';
import { db, audit } from './db.js';
import { permit } from './auth.js';
import { config } from './config.js';
import { communicationCapabilities } from './communication-service.js';
import { HttpError } from './domain.js';
import { buildRecipients, maskDestination, validDestination } from './communication-domain.js';

const id=z.string().min(1).max(100),pageSchema=z.object({page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().int().min(10).max(100).default(25)});

async function staffClassIds(req){
  if(req.user.role==='ADMIN')return null;
  const [assigned,led]=await Promise.all([
    db.staffClass.findMany({where:{staffId:req.user.id},select:{classId:true}}),
    db.class.findMany({where:{classTeacherId:req.user.id},select:{id:true}})
  ]);
  return [...new Set([...assigned.map(x=>x.classId),...led.map(x=>x.id)])];
}
const accessWhere=(req,classIds)=>req.user.role==='ADMIN'?{}:{OR:[{senderId:req.user.id},{classId:{in:classIds}}]};
const mutationWhere=(req,campaignId)=>req.user.role==='ADMIN'?{id:campaignId}:{id:campaignId,senderId:req.user.id};

export function communicationRouter(){
  const r=Router();r.use(permit('COMMUNICATIONS_MANAGE'));
  r.get('/overview',async(req,res)=>{
    const classIds=await staffClassIds(req),scope=accessWhere(req,classIds);
    const [classes,total,queued,failed]=await Promise.all([
      db.class.findMany({where:classIds?{id:{in:classIds}}:{},select:{id:true,name:true,_count:{select:{students:true}}},orderBy:{name:'asc'}}),
      db.communicationCampaign.count({where:scope}),
      db.communicationRecipient.count({where:{campaign:scope,status:{in:['QUEUED','SENDING']}}}),
      db.communicationRecipient.count({where:{campaign:scope,status:'FAILED'}})
    ]);
    res.json({capabilities:communicationCapabilities(),classes,counts:{campaigns:total,queued,failed}});
  });
  r.get('/recipients',async(req,res)=>{
    const query=pageSchema.extend({search:z.string().trim().max(100).default(''),classId:id.optional()}).parse(req.query),classIds=await staffClassIds(req);
    if(query.classId&&classIds&&!classIds.includes(query.classId))throw new HttpError(403,'This class is not assigned to you');
    const where={role:'STUDENT',active:true,...(query.classId?{classId:query.classId}:classIds?{classId:{in:classIds}}:{}),...(query.search?{OR:[{name:{contains:query.search}},{email:{contains:query.search}},{emergencyContactName:{contains:query.search}},{guardianEmail:{contains:query.search}}]}:{})};
    const [items,total]=await Promise.all([db.user.findMany({where,select:{id:true,name:true,email:true,phone:true,classId:true,class:{select:{name:true}},emergencyContactName:true,emergencyContactPhone:true,guardianEmail:true,studentAllowEmail:true,studentAllowSms:true,guardianAllowEmail:true,guardianAllowSms:true},orderBy:{name:'asc'},skip:(query.page-1)*query.pageSize,take:query.pageSize}),db.user.count({where})]);
    res.json({items:items.map(student=>({
      id:student.id,name:student.name,classId:student.classId,class:student.class,emergencyContactName:student.emergencyContactName,
      studentEmailAvailable:student.studentAllowEmail&&validDestination(student.email,'EMAIL'),
      studentSmsAvailable:student.studentAllowSms&&validDestination(student.phone,'SMS'),
      guardianEmailAvailable:student.guardianAllowEmail&&validDestination(student.guardianEmail,'EMAIL'),
      guardianSmsAvailable:student.guardianAllowSms&&validDestination(student.emergencyContactPhone,'SMS')
    })),page:query.page,pageSize:query.pageSize,total,pages:Math.ceil(total/query.pageSize)});
  });
  r.get('/campaigns',async(req,res)=>{
    const query=pageSchema.parse(req.query),classIds=await staffClassIds(req),where=accessWhere(req,classIds);
    const [items,total]=await Promise.all([db.communicationCampaign.findMany({where,select:{id:true,subject:true,body:true,audienceType:true,recipientType:true,status:true,recipientCount:true,createdAt:true,completedAt:true,class:{select:{name:true}},sender:{select:{name:true}},_count:{select:{recipients:true}}},orderBy:{createdAt:'desc'},skip:(query.page-1)*query.pageSize,take:query.pageSize}),db.communicationCampaign.count({where})]);
    const ids=items.map(x=>x.id),groups=ids.length?await db.communicationRecipient.groupBy({by:['campaignId','status'],where:{campaignId:{in:ids}},_count:{_all:true}}):[];
    res.json({items:items.map(item=>({...item,delivery:Object.fromEntries(groups.filter(x=>x.campaignId===item.id).map(x=>[x.status,x._count._all]))})),page:query.page,pageSize:query.pageSize,total,pages:Math.ceil(total/query.pageSize)});
  });
  r.get('/campaigns/:id/recipients',async(req,res)=>{
    const query=pageSchema.parse(req.query),classIds=await staffClassIds(req),campaign=await db.communicationCampaign.findFirst({where:{id:req.params.id,...accessWhere(req,classIds)},select:{id:true}});if(!campaign)throw new HttpError(404,'Campaign not found');
    const [items,total]=await Promise.all([db.communicationRecipient.findMany({where:{campaignId:campaign.id},select:{id:true,recipientName:true,recipientKind:true,channel:true,destination:true,status:true,attempts:true,sentAt:true,lastError:true,student:{select:{id:true,name:true,class:{select:{name:true}}}}},orderBy:{createdAt:'asc'},skip:(query.page-1)*query.pageSize,take:query.pageSize}),db.communicationRecipient.count({where:{campaignId:campaign.id}})]);
    res.json({items:items.map(x=>({...x,destination:maskDestination(x.destination)})),page:query.page,pageSize:query.pageSize,total,pages:Math.ceil(total/query.pageSize)});
  });
  r.post('/campaigns',async(req,res)=>{
    const schema=z.object({audienceType:z.enum(['ALL','CLASS','INDIVIDUAL']),classId:id.nullable().default(null),studentIds:z.array(id).max(500).default([]),recipientType:z.enum(['STUDENT','GUARDIAN','BOTH']),channels:z.array(z.enum(['EMAIL','SMS'])).min(1).max(2),subject:z.string().trim().max(200).refine(value=>!/[\r\n]/.test(value),'Subject must be one line').default(''),body:z.string().trim().min(1).max(20000)}).strict().superRefine((value,ctx)=>{if(value.channels.includes('EMAIL')&&!value.subject)ctx.addIssue({code:'custom',path:['subject'],message:'Email subject is required'});if(value.channels.includes('SMS')&&value.body.length>1000)ctx.addIssue({code:'custom',path:['body'],message:'SMS messages are limited to 1,000 characters'});if(value.audienceType==='CLASS'&&!value.classId)ctx.addIssue({code:'custom',path:['classId'],message:'Choose a class'});if(value.audienceType==='INDIVIDUAL'&&!value.studentIds.length)ctx.addIssue({code:'custom',path:['studentIds'],message:'Choose at least one student'});}).parse(req.body);
    const capabilities=communicationCapabilities();for(const channel of schema.channels){const capability=channel==='EMAIL'?capabilities.email:capabilities.sms;if(!capability.enabled)throw new HttpError(404,`${channel} is disabled`);if(!capability.configured)throw new HttpError(409,`${channel} provider is not configured`);}
    const recent=await db.communicationCampaign.count({where:{senderId:req.user.id,createdAt:{gte:new Date(Date.now()-15*60000)}}});if(recent>=10)throw new HttpError(429,'Too many campaigns; wait before sending another');
    const classIds=await staffClassIds(req);if(schema.audienceType==='ALL'&&req.user.role!=='ADMIN')throw new HttpError(403,'Only administrators can message the whole school');if(schema.classId&&classIds&&!classIds.includes(schema.classId))throw new HttpError(403,'This class is not assigned to you');
    const where={role:'STUDENT',active:true,...(schema.audienceType==='CLASS'?{classId:schema.classId}:schema.audienceType==='INDIVIDUAL'?{id:{in:[...new Set(schema.studentIds)]}}:{})};
    const students=await db.user.findMany({where,select:{id:true,name:true,email:true,phone:true,classId:true,emergencyContactName:true,emergencyContactPhone:true,guardianEmail:true,studentAllowEmail:true,studentAllowSms:true,guardianAllowEmail:true,guardianAllowSms:true},take:2001});
    const requestedIds=[...new Set(schema.studentIds)];if(schema.audienceType==='INDIVIDUAL'&&students.length!==requestedIds.length)throw new HttpError(400,'One or more selected students are unavailable');if(classIds&&students.some(s=>!s.classId||!classIds.includes(s.classId)))throw new HttpError(403,'One or more students are outside your assigned classes');if(students.length>2000)throw new HttpError(413,'A campaign may contain at most 2,000 students');
    const recipients=buildRecipients(students,schema);
    if(!recipients.length)throw new HttpError(400,'No eligible recipients have a valid destination and enabled delivery preference');
    const campaign=await db.$transaction(async tx=>{const row=await tx.communicationCampaign.create({data:{subject:schema.subject,body:schema.body,audienceType:schema.audienceType,recipientType:schema.recipientType,classId:schema.audienceType==='CLASS'?schema.classId:null,senderId:req.user.id,status:'QUEUED',recipientCount:recipients.length}});await tx.communicationRecipient.createMany({data:recipients.map(x=>({...x,campaignId:row.id}))});await audit(tx,req.user.id,'communication.queue',row.id);return row;});
    res.status(201).json({...campaign,recipientCount:recipients.length});
  });
  r.post('/campaigns/:id/cancel',async(req,res)=>{const campaign=await db.communicationCampaign.findFirst({where:mutationWhere(req,req.params.id)});if(!campaign)throw new HttpError(404,'Campaign not found');await db.$transaction(async tx=>{await tx.communicationRecipient.updateMany({where:{campaignId:campaign.id,status:'QUEUED'},data:{status:'CANCELLED'}});await tx.communicationCampaign.update({where:{id:campaign.id},data:{status:'CANCELLED',completedAt:new Date()}});await audit(tx,req.user.id,'communication.cancel',campaign.id);});res.json({ok:true});});
  r.post('/campaigns/:id/retry',async(req,res)=>{const campaign=await db.communicationCampaign.findFirst({where:mutationWhere(req,req.params.id)});if(!campaign)throw new HttpError(404,'Campaign not found');const count=await db.communicationRecipient.updateMany({where:{campaignId:campaign.id,status:'FAILED'},data:{status:'QUEUED',attempts:0,availableAt:new Date(),lastError:null}});if(count.count)await db.communicationCampaign.update({where:{id:campaign.id},data:{status:'QUEUED',completedAt:null}});await audit(db,req.user.id,'communication.retry',campaign.id);res.json({queued:count.count});});
  return r;
}
