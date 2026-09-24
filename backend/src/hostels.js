import { Router } from 'express';
import { z } from 'zod';
import { db, audit } from './db.js';
import { permit } from './auth.js';
import { getSettings } from './settings.js';
import { HttpError } from './domain.js';
import { config } from './config.js';

const id = z.string().min(1).max(100);
const hostelInput = z.object({
  name: z.string().trim().min(2).max(150),
  genderPolicy: z.enum(['MALE','FEMALE','MIXED']).default('MIXED'),
  address: z.string().trim().max(500).default('')
}).strict();
const roomInput = z.object({
  name: z.string().trim().min(1).max(100),
  floor: z.string().trim().max(50).default(''),
  capacity: z.number().int().min(1).max(100),
  bedPrefix: z.string().trim().max(12).default('B')
}).strict();

async function requireEnabled(req, res, next) {
  if (!config.FEATURE_HOSTEL || !(await getSettings()).hostelEnabled) throw new HttpError(409, 'Hostel management is disabled in Configuration');
  next();
}

export function hostelRouter() {
  const r = Router();
  r.use(permit('HOSTEL_MANAGE'), requireEnabled);

  r.get('/dashboard', async (req, res) => {
    const [hostels, allocations, students] = await Promise.all([
      db.hostel.findMany({
        include: { rooms: { orderBy: { name:'asc' }, include: { beds: {
          orderBy: { label:'asc' },
          include: { allocations: { where:{ status:'ACTIVE' }, select:{ id:true, studentId:true } } }
        } } } },
        orderBy: { name:'asc' }
      }),
      db.hostelAllocation.findMany({
        where:{ status:'ACTIVE' },
        include:{
          student:{ select:{ id:true,name:true,email:true,class:{select:{name:true}},profilePictureId:true } },
          bed:{ include:{ room:{ include:{ hostel:{select:{id:true,name:true}}} } } }
        },
        orderBy:{ startsAt:'desc' }
      }),
      db.user.findMany({
        where:{ role:'STUDENT',active:true },
        select:{ id:true,name:true,email:true,gender:true,class:{select:{name:true}} },
        orderBy:{ name:'asc' },
        take:5000
      })
    ]);
    const rooms=hostels.reduce((n,h)=>n+h.rooms.length,0);
    const beds=hostels.reduce((n,h)=>n+h.rooms.reduce((m,room)=>m+room.beds.filter(b=>b.active).length,0),0);
    res.json({hostels,allocations,students,summary:{hostels:hostels.filter(h=>h.active).length,rooms,beds,occupied:allocations.length,available:Math.max(0,beds-allocations.length)}});
  });

  r.post('/', async (req,res) => {
    const data=hostelInput.parse(req.body);
    const saved=await db.$transaction(async tx=>{const row=await tx.hostel.create({data});await audit(tx,req.user.id,'hostel.create',row.id);return row;});
    res.status(201).json(saved);
  });

  r.patch('/:hostelId', async (req,res) => {
    const hostelId=id.parse(req.params.hostelId);
    const data=hostelInput.partial().extend({active:z.boolean().optional()}).strict().parse(req.body);
    const saved=await db.$transaction(async tx=>{const row=await tx.hostel.update({where:{id:hostelId},data});await audit(tx,req.user.id,'hostel.update',row.id);return row;});
    res.json(saved);
  });

  r.post('/:hostelId/rooms', async (req,res) => {
    const hostelId=id.parse(req.params.hostelId), input=roomInput.parse(req.body);
    const hostel=await db.hostel.findUnique({where:{id:hostelId}});
    if(!hostel?.active)throw new HttpError(400,'Choose an active hostel');
    const labels=Array.from({length:input.capacity},(_,i)=>({label:`${input.bedPrefix}${String(i+1).padStart(2,'0')}`}));
    const saved=await db.$transaction(async tx=>{const row=await tx.hostelRoom.create({data:{hostelId,name:input.name,floor:input.floor,capacity:input.capacity,beds:{create:labels}},include:{beds:true}});await audit(tx,req.user.id,'hostel.room.create',row.id);return row;});
    res.status(201).json(saved);
  });

  r.patch('/rooms/:roomId', async (req,res) => {
    const roomId=id.parse(req.params.roomId);
    const data=z.object({name:z.string().trim().min(1).max(100).optional(),floor:z.string().trim().max(50).optional(),active:z.boolean().optional()}).strict().parse(req.body);
    const saved=await db.$transaction(async tx=>{const row=await tx.hostelRoom.update({where:{id:roomId},data});await audit(tx,req.user.id,'hostel.room.update',row.id);return row;});
    res.json(saved);
  });

  r.post('/allocations', async (req,res) => {
    const input=z.object({studentId:id,bedId:id,startsAt:z.string().datetime().optional(),notes:z.string().trim().max(1000).default('')}).strict().parse(req.body);
    const saved=await db.$transaction(async tx=>{
      const [student,bed,studentAllocation,bedAllocation]=await Promise.all([
        tx.user.findFirst({where:{id:input.studentId,role:'STUDENT',active:true},select:{id:true,gender:true}}),
        tx.hostelBed.findFirst({where:{id:input.bedId,active:true,room:{active:true,hostel:{active:true}}},select:{id:true,room:{select:{hostel:{select:{genderPolicy:true}}}}}}),
        tx.hostelAllocation.findFirst({where:{studentId:input.studentId,status:'ACTIVE'},select:{id:true}}),
        tx.hostelAllocation.findFirst({where:{bedId:input.bedId,status:'ACTIVE'},select:{id:true}})
      ]);
      if(!student)throw new HttpError(400,'Choose an active student');
      if(!bed)throw new HttpError(400,'Choose an available bed in an active room');
      const recordedGender=String(student.gender||'').trim().toUpperCase(), policy=bed.room.hostel.genderPolicy;
      const matchesGender=policy==='MIXED'||!recordedGender||(policy==='MALE'&&['M','MALE','BOY'].includes(recordedGender))||(policy==='FEMALE'&&['F','FEMALE','GIRL'].includes(recordedGender));
      if(!matchesGender)throw new HttpError(400,'This student does not match the hostel gender policy');
      if(studentAllocation)throw new HttpError(409,'This student already has an active hostel allocation');
      if(bedAllocation)throw new HttpError(409,'This bed is already occupied');
      const row=await tx.hostelAllocation.create({data:{studentId:input.studentId,bedId:input.bedId,startsAt:input.startsAt?new Date(input.startsAt):new Date(),notes:input.notes,allocatedById:req.user.id}});
      await audit(tx,req.user.id,'hostel.allocate',row.id);return row;
    },{isolationLevel:'Serializable'});
    res.status(201).json(saved);
  });

  r.patch('/allocations/:allocationId', async (req,res) => {
    const allocationId=id.parse(req.params.allocationId);
    const input=z.object({status:z.enum(['CHECKED_OUT','CANCELLED']),endsAt:z.string().datetime().optional()}).strict().parse(req.body);
    const current=await db.hostelAllocation.findUnique({where:{id:allocationId}});
    if(!current)throw new HttpError(404,'Allocation not found');
    if(current.status!=='ACTIVE')throw new HttpError(409,'This allocation is already closed');
    const saved=await db.$transaction(async tx=>{const row=await tx.hostelAllocation.update({where:{id:allocationId},data:{status:input.status,endsAt:input.endsAt?new Date(input.endsAt):new Date()}});await audit(tx,req.user.id,'hostel.allocation.close',row.id);return row;});
    res.json(saved);
  });
  return r;
}