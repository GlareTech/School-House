import { randomUUID } from 'node:crypto';
import { z } from 'zod';

export const normalizePhone=value=>String(value||'').trim().replace(/[\s().-]/g,'');
export const validPhone=value=>/^\+?[0-9]{7,20}$/.test(value);
export const validDestination=(value,channel)=>{
  const destination=channel==='EMAIL'?String(value||'').trim().toLowerCase():normalizePhone(value);
  return channel==='EMAIL'?z.string().email().safeParse(destination).success:validPhone(destination);
};
export const maskDestination=value=>{const text=String(value||'');if(text.includes('@')){const [local,domain]=text.split('@');return `${local.slice(0,2)}***@${domain}`;}return text.length>5?`${text.slice(0,3)}***${text.slice(-3)}`:'***';};

export function buildRecipients(students,{channels,recipientType},idFactory=randomUUID){
  const recipients=[],seen=new Set();
  const add=(student,recipientKind,channel,name,destination,allowed)=>{
    destination=channel==='EMAIL'?String(destination||'').trim().toLowerCase():normalizePhone(destination);
    const valid=validDestination(destination,channel);
    if(!allowed||!destination||!valid)return;
    const key=`${channel}:${destination}`;if(seen.has(key))return;seen.add(key);
    recipients.push({id:idFactory(),studentId:student.id,recipientKind,channel,recipientName:name||student.name,destination});
  };
  for(const student of students)for(const channel of channels){
    if(recipientType!=='GUARDIAN')add(student,'STUDENT',channel,student.name,channel==='EMAIL'?student.email:student.phone,channel==='EMAIL'?student.studentAllowEmail:student.studentAllowSms);
    if(recipientType!=='STUDENT')add(student,'GUARDIAN',channel,student.emergencyContactName||`Guardian of ${student.name}`,channel==='EMAIL'?student.guardianEmail:student.emergencyContactPhone,channel==='EMAIL'?student.guardianAllowEmail:student.guardianAllowSms);
  }
  return recipients;
}
