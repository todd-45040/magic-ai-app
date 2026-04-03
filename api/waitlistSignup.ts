import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { rateLimit, rateLimitHeaders } from './ai/_lib/rateLimit.js';
import { isPreviewEnv } from './ai/_lib/hardening.js';


function normalizeAttributionSource(raw: any): 'admc' | 'reddit' | 'organic' | 'other' {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return 'organic';
  if (s.includes('admc') || s.includes('another-darn-magic') || s.includes('convention') || s.includes('booth') || s.includes('table')) return 'admc';
  if (s.includes('reddit')) return 'reddit';
  if (s.includes('organic') || s.includes('direct') || s.includes('site') || s.includes('web')) return 'organic';
  return 'other';
}

function pickAttributionRaw(req: any, body: any): string {
  const q = (req as any)?.query || {};
  const candidates = [
    body?.source,
    body?.founding_source,
    body?.meta?.utm_source,
    q?.src,
    q?.source,
    q?.utm_source,
  ];
  for (const c of candidates) {
    const v = typeof c === 'string' ? c.trim() : '';
    if (v) return v.slice(0, 120);
  }
  return '';
}
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
  // Pragmatic validation (server-side). We only need to block obviously invalid input.
  // Intentionally not a strict RFC validator.
  const e = String(email || '').trim();
  if (e.length < 6 || e.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}

function isValidFoundingBucket(v: any): v is 'admc_2026' | 'reserve_2026' {
  return v === 'admc_2026' || v === 'reserve_2026';
}

function inferFoundingBucket(isFounding: boolean, sourceBucket: string, foundingSource: string): 'admc_2026' | 'reserve_2026' | null {
  if (!isFounding) return null;
  const s = String(foundingSource || sourceBucket || '').toLowerCase();
  if (s.includes('admc') || s.includes('convention') || s.includes('booth') || s.includes('table')) return 'admc_2026';
  // Default to reserve only if explicitly requested; otherwise prefer ADMC for Founders Circle.
  return 'admc_2026';
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
    return json(res, 400, {
      ok: false,
      error_code: 'INVALID_EMAIL',
      message: 'Please enter a valid email address.',
      retryable: false,
    });
  }


  const isFounding = Boolean(body?.founding_circle || body?.meta?.founding_circle);

  // Attribution (Phase 8 segmentation)
  const attributionRaw = pickAttributionRaw(req, body);
  const source = normalizeAttributionSource(attributionRaw || (typeof body?.source === 'string' ? body.source : ''));

  const foundingSource =
    typeof body?.founding_source === 'string'
      ? body.founding_source.trim().slice(0, 80)
      : (source ? String(source) : 'organic');

  const pricingLock =
    typeof body?.pricing_lock === 'string'
      ? body.pricing_lock.trim().slice(0, 80)
      : (isFounding ? 'founding_pro_admc_2026' : null);

  const foundingBucketInput = typeof body?.founding_bucket === 'string' ? body.founding_bucket.trim() : null;
  const foundingBucket = isValidFoundingBucket(foundingBucketInput)
    ? foundingBucketInput
    : inferFoundingBucket(isFounding, source, foundingSource);

  const meta = body?.meta ?? null;
  if (meta && typeof meta === 'object') {
    (meta as any).attribution_raw = attributionRaw || (meta as any).attribution_raw || null;
    (meta as any).source_bucket = source;
  }

  const ua = String(req?.headers?.['user-agent'] || '').slice(0, 500);

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
    let alreadySubscribed = false;

    const captureMeta = meta && typeof meta === 'object' ? { ...(meta as any) } : {};
    if (isFounding) {
      (captureMeta as any).founding_circle = true;
      (captureMeta as any).founding_source = foundingSource;
      (captureMeta as any).founding_bucket = foundingBucket;
      (captureMeta as any).pricing_lock = pricingLock;
      (captureMeta as any).capture_mode = 'admc_safe_waitlist';
    }

    const safePayload = {
      ...payload,
      meta: captureMeta,
    };

    const { error } = await admin.from('maw_waitlist_signups').insert(safePayload);
    if (error) {
      if ((error as any).code === '23505') {
        alreadySubscribed = true;
      } else {
        console.error('waitlist insert error:', error);
        return json(res, 500, {
          ok: false,
          error_code: 'INSERT_FAILED',
          message: 'Could not save your email. Please try again.',
          retryable: true,
          ...(isPreviewEnv() ? { details: error } : null),
        });
      }
    }

    return json(res, 200, {
      ok: true,
      already_subscribed: alreadySubscribed,
      founding_circle: isFounding,
      capture_mode: 'admc_safe_waitlist',
      message: isFounding
        ? 'Thanks — your Founder request has been received. We will follow up by email with your Founder details.'
        : 'Thanks — your email has been received.',
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