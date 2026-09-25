import { Router } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from './db.js';
import { config } from './config.js';
import { HttpError } from './domain.js';

const hash=value=>createHash('sha256').update(value).digest('hex');
const cookieOptions={httpOnly:true,sameSite:config.COOKIE_SAME_SITE,secure:config.COOKIE_SECURE,path:'/',priority:'high'};

async function authenticatePlatform(req,_res,next){
  const token=req.cookies.school_platform_session;
  if(!token||!/^[a-f0-9]{64}$/.test(token))throw new HttpError(401,'Platform administrator sign-in required');
  const session=await db.platformSession.findUnique({where:{id:hash(token)},include:{admin:true}});
  if(!session||session.expiresAt<=new Date()||!session.admin.active)throw new HttpError(401,'Platform administrator sign-in required');
  if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.headers['x-csrf-token']!==session.csrf)throw new HttpError(403,'Invalid CSRF token');
  req.platformAdmin=session.admin;req.platformSession=session;next();
}

export async function ensurePlatformAdmin(){
  if(!config.PLATFORM_ADMIN_PASSWORD)return;
  const email=config.PLATFORM_ADMIN_EMAIL.toLowerCase();
  const passwordHash=await bcrypt.hash(config.PLATFORM_ADMIN_PASSWORD,12);
  await db.platformAdmin.upsert({where:{email},create:{email,name:'Platform Administrator',passwordHash},update:{active:true,passwordHash}});
}

export function platformRouter(){
  const r=Router();
  r.post('/login',async(req,res)=>{
    const input=z.object({email:z.string().email().transform(x=>x.toLowerCase()),password:z.string().max(128)}).parse(req.body);
    const admin=await db.platformAdmin.findUnique({where:{email:input.email}}),valid=await bcrypt.compare(input.password,admin?.passwordHash||'$2b$12$C6UzMDM.H6dfI/f/IKcEe.6JdB5vCkDmrxRerAY.VnwkAebwkNQpe');
    if(!admin?.active||!valid)throw new HttpError(401,'Invalid platform administrator credentials');
    const token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex'),expiresAt=new Date(Date.now()+config.SESSION_HOURS*3600000);
    await db.$transaction([db.platformSession.deleteMany({where:{adminId:admin.id}}),db.platformSession.create({data:{id:hash(token),adminId:admin.id,csrf,expiresAt}}),db.platformAdmin.update({where:{id:admin.id},data:{lastLoginAt:new Date()}})]);
    res.cookie('school_platform_session',token,{...cookieOptions,expires:expiresAt}).json({admin:{name:admin.name,email:admin.email},csrf});
  });
  r.get('/me',authenticatePlatform,(req,res)=>res.json({admin:{name:req.platformAdmin.name,email:req.platformAdmin.email},csrf:req.platformSession.csrf}));
  r.post('/logout',authenticatePlatform,async(req,res)=>{await db.platformSession.delete({where:{id:req.platformSession.id}});res.clearCookie('school_platform_session',cookieOptions).json({ok:true});});
  r.get('/dashboard',authenticatePlatform,async(_req,res)=>{
    const [organizations,activeTrials,activeSubscriptions,totalUsers]=await Promise.all([
      db.organization.findMany({include:{subscriptions:{include:{plan:true},orderBy:{createdAt:'desc'},take:1},_count:{select:{users:true}}},orderBy:{createdAt:'desc'},take:250}),
      db.subscription.count({where:{status:'TRIALING'}}),db.subscription.count({where:{status:'ACTIVE'}}),db.user.count()
    ]);
    const monthlyRevenueMinor=organizations.reduce((sum,o)=>sum+(o.subscriptions[0]?.status==='ACTIVE'?o.subscriptions[0].plan.amountMinor:0),0);
    res.json({metrics:{organizations:organizations.length,activeTrials,activeSubscriptions,totalUsers,monthlyRevenueMinor},organizations:organizations.map(o=>({id:o.id,name:o.name,slug:o.slug,active:o.active,trialEndsAt:o.trialEndsAt,createdAt:o.createdAt,userCount:o._count.users,subscription:o.subscriptions[0]||null}))});
  });
  return r;
}
