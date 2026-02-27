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

function safeObj(v: any): Record<string, any> {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function parseReferrer(req: any): { page?: string; params?: Record<string, string> } {
  const ref = String(req?.headers?.referer || req?.headers?.referrer || '').trim();
  if (!ref) return {};
  try {
    const u = new URL(ref);
    const params: Record<string, string> = {};
    for (const [k, v] of u.searchParams.entries()) params[k] = v;
    return { page: u.pathname || undefined, params };
  } catch {
    return {};
  }
}

function pickUtm(params: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of ['utm_source','utm_medium','utm_campaign','utm_term','utm_content']) {
    if (params[k]) out[k] = params[k];
  }
  return out;
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

  const refInfo = parseReferrer(req);

  // Source (force 'admc' when request came from the ADMC landing page)
  let source = typeof body?.source === 'string' ? body.source.trim().slice(0, 80) : 'unknown';
  const pageFromBody = typeof body?.page === 'string' ? body.page.trim().slice(0, 120) : null;
  const page = pageFromBody || refInfo.page || null;

  if (source === 'unknown' && page && page.toLowerCase().includes('admc')) source = 'admc';
  if (typeof source === 'string' && source.toLowerCase().includes('admc')) source = 'admc';

  // Meta: merge payload meta + performer type + page + ref + UTMs (from body or referrer)
  const metaBody = safeObj(body?.meta);
  const performerType = typeof body?.type === 'string' ? body.type.trim().slice(0, 80) : null;
  const ref = typeof body?.ref === 'string' ? body.ref.trim().slice(0, 200) : (refInfo.params?.ref ? String(refInfo.params.ref).slice(0, 200) : null);

  const utmFromBody = safeObj(body?.utm);
  const utmFromRef = pickUtm(refInfo.params || {});
  const utm = { ...utmFromRef, ...utmFromBody };

  const meta = {
    ...metaBody,
    ...(performerType ? { performer_type: performerType } : null),
    ...(page ? { page } : null),
    ...(ref ? { ref } : null),
    ...(Object.keys(utm).length ? { utm } : null),
  };

  const ua = String(req?.headers?.['user-agent'] || '').slice(0, 500);

  const payload = {
    name,
    email,
    email_lower: email,
    source,
    meta: Object.keys(meta).length ? meta : null,
    ip_hash: ipHash,
    user_agent: ua,
  };

  try {
    const { error } = await admin.from('maw_waitlist_signups').insert(payload);
    if (error) {
      // Duplicate email
      if ((error as any).code === '23505') {
        return json(res, 200, { ok: true, already_subscribed: true });
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

    return json(res, 200, { ok: true, already_subscribed: false });
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
