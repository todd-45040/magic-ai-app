import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { rateLimit, rateLimitHeaders } from './ai/_lib/rateLimit.js';
import { isPreviewEnv } from './ai/_lib/hardening.js';

function json(res: any, status: number, body: any, headers?: Record<string, string>) {
  if (headers) {
    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  }
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function getEnv(name: string): string | null {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : null;
}

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function getIpFromReq(req: any): string {
  const xff = req?.headers?.['x-forwarded-for'] || req?.headers?.['X-Forwarded-For'];
  const ip = (typeof xff === 'string' && xff.split(',')[0].trim()) || req?.socket?.remoteAddress || 'unknown';
  return String(ip);
}

function hashIp(ip: string): string {
  const salt = getEnv('TELEMETRY_SALT') || 'magic_ai_wizard_default_salt';
  return sha256Hex(`${salt}:${ip}`);
}

function getAdminClient() {
  const supabaseUrl = getEnv('SUPABASE_URL');
  const serviceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
}

function normalizeEmail(email: string): string {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  // Good-enough sanity check; Supabase constraint is the real guard.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function safeObject(v: any): Record<string, any> {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function extractUtm(params: URLSearchParams): Record<string, string> {
  const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  const out: Record<string, string> = {};
  for (const k of keys) {
    const val = params.get(k);
    if (val) out[k] = val;
  }
  return out;
}

async function sendConfirmationEmail(opts: {
  to: string;
  name: string | null;
  isAdmc: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey = getEnv('RESEND_API_KEY');
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY_MISSING' };

  const from = getEnv('RESEND_FROM') || 'Magicians\' AI Wizard <hello@magicaiwizard.com>';
  const appUrl = getEnv('APP_URL') || 'https://www.magicaiwizard.com/app/';
  const demoUrl = `${appUrl.replace(/\/$/, '')}/?demo=1`;

  const first = opts.name ? String(opts.name).split(' ')[0] : 'Magician';
  const subject = opts.isAdmc
    ? "You're in — ADMC Founding Access (ends Sunday night)"
    : "You're in — Founding Access";

  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.5;color:#0f172a;">
    <h2 style="margin:0 0 10px 0;">You’re in, ${first}.</h2>
    <p style="margin:0 0 12px 0;">
      Thanks for joining the <strong>Magicians' AI Wizard</strong> list.
      ${opts.isAdmc ? "Your <strong>ADMC founding rate</strong> ends <strong>Sunday night</strong>." : ""}
    </p>
    <p style="margin:0 0 12px 0;">
      Here’s what happens next:
      <ul style="margin:8px 0 0 18px;">
        <li>We’ll email you early-access updates and new tool drops.</li>
        <li>You’ll get the first invite when new features ship.</li>
      </ul>
    </p>
    <p style="margin:14px 0 6px 0;">
      <a href="${appUrl}" style="display:inline-block;padding:10px 14px;border-radius:10px;background:#7c3aed;color:#fff;text-decoration:none;font-weight:700;">Open the App</a>
      <span style="display:inline-block;width:10px;"></span>
      <a href="${demoUrl}" style="display:inline-block;padding:10px 14px;border-radius:10px;background:#0f172a;color:#fff;text-decoration:none;font-weight:700;">Try Demo Mode</a>
    </p>
    <p style="margin:14px 0 0 0;color:#475569;font-size:12px;">
      If you didn’t request this, you can ignore this email.
    </p>
  </div>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: opts.to,
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return { ok: false, error: `RESEND_${res.status}:${txt?.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'RESEND_SEND_FAILED' };
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { ok: false, error_code: 'METHOD_NOT_ALLOWED', retryable: false });
  }

  const admin = getAdminClient();
  if (!admin) {
    return json(res, 503, {
      ok: false,
      error_code: 'SERVICE_UNAVAILABLE',
      message: 'Email capture is temporarily unavailable.',
      retryable: true,
    });
  }

  // Best-effort rate limit: 5 per hour per IP (serverless-local memory)
  const ip = getIpFromReq(req);
  const ipHash = hashIp(ip);
  const rl = rateLimit(`waitlist:${ipHash}`, { windowMs: 60 * 60 * 1000, max: 5 });
  if (!rl.ok) {
    return json(
      res,
      429,
      { ok: false, error_code: 'RATE_LIMITED', message: 'Too many signups. Please try again later.', retryable: true },
      rateLimitHeaders(rl),
    );
  }

  // Parse body
  let body: any = req.body;
  try {
    if (typeof body === 'string') body = JSON.parse(body);
  } catch {
    // ignore
  }

  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 120) : null;
  const emailRaw = typeof body?.email === 'string' ? body.email : '';
  const email = normalizeEmail(emailRaw);

  if (!email || !isValidEmail(email)) {
    return json(res, 400, { ok: false, error_code: 'INVALID_EMAIL', message: 'Please provide a valid email.' });
  }

  const ua = String(req?.headers?.['user-agent'] || '').slice(0, 500);

  // Request URL + referrer parsing (for UTMs + page)
  const base = getEnv('APP_URL') || 'https://www.magicaiwizard.com';
  let url: URL | null = null;
  try {
    url = new URL(req?.url || '/', base);
  } catch {
    url = null;
  }

  const refHeader = String(req?.headers?.referer || req?.headers?.referrer || '');
  let refUrl: URL | null = null;
  try {
    if (refHeader) refUrl = new URL(refHeader);
  } catch {
    refUrl = null;
  }

  const utmFromUrl = url ? extractUtm(url.searchParams) : {};
  const utmFromBody = safeObject(body?.utm);
  const utm = { ...utmFromUrl, ...utmFromBody };

  const page = typeof body?.page === 'string'
    ? body.page.slice(0, 200)
    : (refUrl?.pathname ? refUrl.pathname.slice(0, 200) : null);

  const ref = typeof body?.ref === 'string'
    ? body.ref.slice(0, 120)
    : (url?.searchParams.get('ref') || refUrl?.searchParams.get('ref') || null);

  const performerType = typeof body?.type === 'string' ? body.type.slice(0, 80) : null;

  // Source enforcement for ADMC
  const sourceRaw = typeof body?.source === 'string' ? body.source.trim().slice(0, 80) : 'unknown';
  const isAdmc = sourceRaw.toLowerCase().includes('admc') || (page ? page.toLowerCase().includes('/admc') : false);
  const source = isAdmc ? 'admc' : sourceRaw;

  // Meta merge (existing meta + our normalized fields)
  const metaIn = safeObject(body?.meta);
  const meta: any = {
    ...metaIn,
    ...(performerType ? { performer_type: performerType } : {}),
    ...(page ? { page } : {}),
    ...(ref ? { ref } : {}),
    ...(Object.keys(utm).length ? { utm } : {}),
  };

  const payload = {
    name,
    email,
    email_lower: email,
    source,
    meta,
    ip_hash: ipHash,
    user_agent: ua,
  };

  try {
    // Insert + return id so we can update meta flags after email send
    const { data, error } = await admin.from('maw_waitlist_signups').insert(payload).select('id').single();

    if (error) {
      // Duplicate email
      if ((error as any).code === '23505') {
        return json(res, 200, { ok: true, already_subscribed: true, email_sent: false });
      }

      console.error('waitlist insert error:', error);
      return json(res, 500, {
        ok: false,
        error_code: 'INSERT_FAILED',
        message: 'Could not save your email. Please try again.',
        retryable: true,
        ...(isPreviewEnv() ? { details: error } : null),
      });
    }

    // Try to send confirmation email (optional)
    const emailResult = await sendConfirmationEmail({ to: email, name, isAdmc });

    if (emailResult.ok) {
      await admin
        .from('maw_waitlist_signups')
        .update({ meta: { ...meta, confirmation_sent_at: new Date().toISOString(), needs_followup: false } })
        .eq('id', data.id);
    } else {
      // Queue fallback via meta flag (export later)
      await admin
        .from('maw_waitlist_signups')
        .update({ meta: { ...meta, needs_followup: true, followup_reason: emailResult.error || 'NO_EMAIL_PROVIDER' } })
        .eq('id', data.id);
    }

    return json(res, 200, {
      ok: true,
      already_subscribed: false,
      email_sent: emailResult.ok,
      ...(emailResult.ok ? null : { followup_queued: true }),
    });
  } catch (err: any) {
    return json(res, 500, {
      ok: false,
      error_code: 'INTERNAL_ERROR',
      message: 'Could not save your email. Please try again.',
      retryable: true,
      ...(isPreviewEnv() ? { details: { name: err?.name, message: err?.message, stack: err?.stack } } : null),
    });
  }
}
