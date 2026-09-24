import { config } from './config.js';
import { HttpError } from './domain.js';

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

