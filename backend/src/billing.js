import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';
import { HttpError } from './domain.js';
import { db } from './db.js';

const endpoint = 'https://api.paystack.co';

export async function paystack(path, options = {}) {
  if (!config.PAYSTACK_SECRET_KEY) throw new HttpError(503, 'Payment setup is temporarily unavailable');
  const response = await fetch(endpoint + path, {
    ...options,
    headers: { Authorization: `Bearer ${config.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.status) throw new HttpError(502, result.message || 'Payment provider request failed');
  return result.data;
}

export async function sendWelcomeEmail({ email, name, schoolName, trialEndsAt, planName }) {
  if (!config.RESEND_API_KEY) return false;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: config.RESEND_FROM,
      to: [email],
      subject: `Welcome to Schoolhouse — ${schoolName} is ready`,
      html: `<div style="font-family:Inter,Arial,sans-serif;max-width:620px;margin:auto;color:#173b35"><h1>Welcome, ${escapeHtml(name)}.</h1><p>Your <strong>${escapeHtml(schoolName)}</strong> workspace is ready on the ${escapeHtml(planName)} plan.</p><p>Your seven-day trial runs until <strong>${trialEndsAt.toLocaleDateString('en-NG',{dateStyle:'long'})}</strong>. Your saved card will be billed automatically when the trial ends.</p><p><a href="${config.APP_ORIGINS[0]}" style="display:inline-block;background:#103d36;color:white;padding:12px 20px;border-radius:999px;text-decoration:none">Open Schoolhouse</a></p></div>`
    })
  });
  if (!response.ok) throw new Error(`Resend returned ${response.status}`);
  return true;
}

const escapeHtml = value => String(value).replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));

export async function paystackWebhook(req,res){
  const signature=String(req.headers['x-paystack-signature']||''),expected=createHmac('sha512',config.PAYSTACK_SECRET_KEY).update(req.body).digest('hex');
  if(signature.length!==expected.length||!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))return res.sendStatus(401);
  const event=JSON.parse(req.body.toString('utf8')),code=event.data?.subscription_code||event.data?.subscription?.subscription_code;
  if(code){
    const status=event.event==='invoice.payment_failed'?'PAST_DUE':event.event==='subscription.disable'?'CANCELLED':['charge.success','subscription.create'].includes(event.event)?'ACTIVE':null;
    if(status)await db.subscription.updateMany({where:{paystackSubscriptionCode:code},data:{status,...(status==='CANCELLED'?{cancelledAt:new Date()}:{}),...(event.data?.next_payment_date?{nextChargeAt:new Date(event.data.next_payment_date)}:{})}});
  }
  res.sendStatus(200);
}
