import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db, cache } from './db.js';
import { config } from './config.js';
import { HttpError } from './domain.js';
import { originAllowed } from './settings.js';
export const PERMISSIONS = ['CLASSES_MANAGE','STUDENTS_MANAGE','STAFF_MANAGE','EXAMS_MANAGE','EXAMS_MONITOR','ASSIGNMENTS_MANAGE','MATERIALS_MANAGE','LIBRARY_MANAGE','HOSTEL_MANAGE','GRADES_MANAGE','RATINGS_MANAGE','REPORTS_VIEW','PROMOTIONS_MANAGE','RESULTS_VIEW','ATTENDANCE_MANAGE','PAYMENTS_MANAGE','COMMUNICATIONS_MANAGE','SYNC_VIEW','AUDIT_VIEW','SETTINGS_MANAGE'];
const hash = value => createHash('sha256').update(value).digest('hex');
const cookieOptions = { httpOnly: true, sameSite: config.COOKIE_SAME_SITE, secure: config.COOKIE_SECURE, path: '/', priority: 'high' };
export async function corsForAllowedOrigins(req,res,next) {
  const origin=req.headers.origin;
  if(!origin)return req.method==='OPTIONS'?res.sendStatus(400):next();
  const allowed=await originAllowed(origin);
  if(allowed){
    res.setHeader('Access-Control-Allow-Origin',new URL(origin).origin);
    res.setHeader('Access-Control-Allow-Credentials','true');
    res.setHeader('Access-Control-Allow-Headers','Content-Type, X-CSRF-Token, X-File-Name, X-File-Purpose');
    res.setHeader('Access-Control-Allow-Methods','GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS');
    res.append('Vary','Origin');
  }
  if(req.method==='OPTIONS')return allowed?res.sendStatus(204):res.sendStatus(403);
  next();
}
export async function checkOrigin(req, res, next) {
  if (['GET','HEAD','OPTIONS'].includes(req.method)) return next();
  if (!await originAllowed(req.headers.origin)) throw new HttpError(403, 'Untrusted origin');
  next();
}
export async function sessionFromCookie(cookie) {
  if (!cookie || !/^[a-f0-9]{64}$/.test(cookie)) return null;
  const session = await db.session.findUnique({ where: { id: hash(cookie) }, include: { user: { include: { staffRole: { include: { grants:true } } } } } });
  return session && session.expiresAt > new Date() && session.user.active ? session : null;
}
export async function authenticate(req, res, next) {
  const session = await sessionFromCookie(req.cookies.school_session);
  if (!session) throw new HttpError(401, 'Please sign in');
  req.user = session.user; req.session = session;
  if (!['GET','HEAD','OPTIONS'].includes(req.method) && req.headers['x-csrf-token'] !== session.csrf) throw new HttpError(403, 'Invalid CSRF token');
  next();
}
export function admin(req, res, next) {
  if (req.user.role !== 'ADMIN') throw new HttpError(403, 'Administrator access required');
  next();
}
export function permit(permission) { return (req,res,next) => {
  if (req.user.role === 'ADMIN' || (req.user.role === 'STAFF' && req.user.staffRole?.grants.some(grant => grant.permission === permission))) return next();
  throw new HttpError(403, 'Your staff role does not permit this action');
}; }
export const publicUser = u => ({ id:u.id, name:u.name, email:u.email, role:u.role, classId:u.classId, profilePictureId:u.profilePictureId||null, staffRole:u.staffRole ? { id:u.staffRole.id, name:u.staffRole.name } : null, permissions:u.role === 'ADMIN' ? PERMISSIONS : (u.staffRole?.grants || []).map(g => g.permission) });
export function authRoutes(app) {
  app.post('/api/auth/login', async (req, res) => {
    const input = z.object({ email: z.string().email().max(254).transform(s => s.toLowerCase()), password: z.string().max(128) }).parse(req.body);
    // Fail closed for new logins if the shared abuse-control store is unavailable.
    const key = `login:${hash(req.ip + ':' + input.email)}`;
    const ipKey = `login-ip:${hash(req.ip)}`;
    let count, ipCount;
    try { [count, ipCount] = await Promise.all([cache.increment(key, 900000), cache.increment(ipKey, 900000)]); }
    catch { throw new HttpError(503, 'Sign-in temporarily unavailable'); }
    if (count > 12 || ipCount > 150) throw new HttpError(429, 'Too many sign-in attempts; wait 15 minutes');
    const user = await db.user.findUnique({ where: { email: input.email }, include: { staffRole: { include:{grants:true} } } });
    const valid = await bcrypt.compare(input.password, user?.passwordHash || '$2b$12$C6UzMDM.H6dfI/f/IKcEe.6JdB5vCkDmrxRerAY.VnwkAebwkNQpe');
    if (!user?.active || !valid) throw new HttpError(401, 'Invalid email or password');
    const token = randomBytes(32).toString('hex'), csrf = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + config.SESSION_HOURS * 3600000);
    await db.$transaction(async tx => {
      if (req.cookies.school_session) await tx.session.deleteMany({ where: { id: hash(req.cookies.school_session) } });
      await tx.session.create({ data: { id: hash(token), userId: user.id, csrf, expiresAt } });
      await tx.user.update({where:{id:user.id},data:{lastLoginAt:new Date()}});
      await tx.auditLog.create({data:{actorId:user.id,action:'auth.login',entityId:user.id}});
    });
    await cache.del(key);
    res.cookie('school_session', token, { ...cookieOptions, expires: expiresAt }).json({ user: publicUser(user), csrf });
  });
  app.get('/api/auth/me', authenticate, (req, res) => res.json({ user: publicUser(req.user), csrf: req.session.csrf }));
  app.post('/api/auth/logout', authenticate, async (req, res) => {
    await db.$transaction([db.session.delete({ where: { id: req.session.id } }),db.auditLog.create({data:{actorId:req.user.id,action:'auth.logout',entityId:req.user.id}})]);
    res.clearCookie('school_session', cookieOptions).json({ ok: true });
  });
}
