import nodemailer from 'nodemailer';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { db, logger } from './db.js';

let mailer;
export const communicationCapabilities=()=>({
  email:{enabled:config.FEATURE_COMMUNICATIONS&&config.FEATURE_EMAIL,configured:config.MAIL_TRANSPORT!=='disabled'},
  sms:{enabled:config.FEATURE_COMMUNICATIONS&&config.FEATURE_SMS,configured:config.SMS_TRANSPORT!=='disabled'}
});

const cleanError=(error,sensitive='')=>{
  let message=String(error?.message||'Delivery failed').replace(/[\r\n]+/g,' ');
  if(sensitive)message=message.split(sensitive).join('[destination]');
  return message.slice(0,500);
};
const retryDelay=attempts=>Math.min(3600,Math.max(30,30*2**Math.max(0,attempts-1)))*1000;

async function sendEmail(recipient,campaign){
  if(config.MAIL_TRANSPORT==='console'){
    logger.info({campaignId:campaign.id,recipientId:recipient.id,channel:'EMAIL'},'Development communication delivered');
    return `console-${recipient.id}`;
  }
  if(config.MAIL_TRANSPORT!=='smtp')throw new Error('Email provider is not configured');
  mailer??=nodemailer.createTransport({host:config.SMTP_HOST,port:config.SMTP_PORT,secure:config.SMTP_SECURE,
    auth:config.SMTP_USER?{user:config.SMTP_USER,pass:config.SMTP_PASS}:undefined,
    requireTLS:config.NODE_ENV==='production'&&!config.SMTP_SECURE,
    connectionTimeout:10000,greetingTimeout:10000,socketTimeout:20000});
  const result=await mailer.sendMail({from:config.SMTP_FROM,to:recipient.destination,subject:campaign.subject,
    text:campaign.body,disableFileAccess:true,disableUrlAccess:true,headers:{'X-School-Campaign-ID':campaign.id}});
  return String(result.messageId||'').slice(0,500)||null;
}

async function sendSms(recipient,campaign){
  if(config.SMS_TRANSPORT==='console'){
    logger.info({campaignId:campaign.id,recipientId:recipient.id,channel:'SMS'},'Development communication delivered');
    return `console-${recipient.id}`;
  }
  let response;
  if(config.SMS_TRANSPORT==='generic'){
    response=await fetch(config.SMS_API_URL,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{
      'Content-Type':'application/json','Authorization':`Bearer ${config.SMS_API_TOKEN}`,'Idempotency-Key':recipient.id
    },body:JSON.stringify({to:recipient.destination,message:campaign.body,sender:config.SMS_SENDER_ID,reference:recipient.id})});
  }else if(config.SMS_TRANSPORT==='twilio'){
    const url=`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.TWILIO_ACCOUNT_SID)}/Messages.json`;
    const body=new URLSearchParams({To:recipient.destination,From:config.TWILIO_FROM,Body:campaign.body});
    response=await fetch(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{
      'Content-Type':'application/x-www-form-urlencoded','Authorization':`Basic ${Buffer.from(`${config.TWILIO_ACCOUNT_SID}:${config.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
      'Idempotency-Key':recipient.id
    },body});
  }else throw new Error('SMS provider is not configured');
  const text=(await response.text()).slice(0,2000);
  if(!response.ok)throw new Error(`SMS provider returned ${response.status}`);
  try{const parsed=JSON.parse(text);return String(parsed.sid||parsed.id||'').slice(0,500)||null}catch{return null}
}

async function refreshCampaign(campaignId){
  const campaign=await db.communicationCampaign.findUnique({where:{id:campaignId},select:{status:true}});if(!campaign||campaign.status==='CANCELLED')return;
  const groups=await db.communicationRecipient.groupBy({by:['status'],where:{campaignId},_count:{_all:true}});
  const counts=Object.fromEntries(groups.map(row=>[row.status,row._count._all]));
  if((counts.QUEUED||0)+(counts.SENDING||0)>0)return;
  const status=(counts.FAILED||0)>0?((counts.SENT||0)>0?'PARTIAL':'FAILED'):'COMPLETED';
  await db.communicationCampaign.update({where:{id:campaignId},data:{status,completedAt:new Date()}});
}

export async function deliverCommunicationBatch(){
  if(!config.FEATURE_COMMUNICATIONS)return {claimed:0,sent:0,failed:0};
  const now=new Date(),token=randomUUID(),leaseUntil=new Date(now.getTime()+120000);
  await db.communicationRecipient.updateMany({where:{status:'SENDING',leaseUntil:{lt:now}},data:{status:'QUEUED',leaseToken:null,leaseUntil:null}});
  const candidates=await db.communicationRecipient.findMany({where:{status:'QUEUED',availableAt:{lte:now}},orderBy:{createdAt:'asc'},take:config.COMMUNICATION_BATCH_SIZE,select:{id:true}});
  if(!candidates.length)return {claimed:0,sent:0,failed:0};
  await db.communicationRecipient.updateMany({where:{id:{in:candidates.map(x=>x.id)},status:'QUEUED'},data:{status:'SENDING',leaseToken:token,leaseUntil,attempts:{increment:1}}});
  const claimed=await db.communicationRecipient.findMany({where:{leaseToken:token,status:'SENDING'},include:{campaign:true}});
  let sent=0,failed=0;
  const touchedCampaigns=new Set();
  for(const recipient of claimed){
    touchedCampaigns.add(recipient.campaignId);
    try{
      const capabilities=communicationCapabilities(),capability=recipient.channel==='EMAIL'?capabilities.email:capabilities.sms;
      if(!capability.enabled||!capability.configured)throw new Error(`${recipient.channel} delivery is disabled or unconfigured`);
      const providerMessageId=recipient.channel==='EMAIL'?await sendEmail(recipient,recipient.campaign):await sendSms(recipient,recipient.campaign);
      await db.communicationRecipient.updateMany({where:{id:recipient.id,leaseToken:token},data:{status:'SENT',sentAt:new Date(),providerMessageId,leaseToken:null,leaseUntil:null,lastError:null}});sent++;
    }catch(error){
      const terminal=recipient.attempts>=config.COMMUNICATION_MAX_ATTEMPTS;
      const safeError=cleanError(error,recipient.destination);
      await db.communicationRecipient.updateMany({where:{id:recipient.id,leaseToken:token},data:{status:terminal?'FAILED':'QUEUED',availableAt:new Date(Date.now()+retryDelay(recipient.attempts)),leaseToken:null,leaseUntil:null,lastError:safeError}});failed++;
      logger.warn({campaignId:recipient.campaignId,recipientId:recipient.id,channel:recipient.channel,error:safeError},'Communication delivery failed');
    }
  }
  await Promise.all([...touchedCampaigns].map(refreshCampaign));
  return {claimed:claimed.length,sent,failed};
}
