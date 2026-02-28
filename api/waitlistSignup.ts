import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { rateLimit, rateLimitHeaders } from './ai/_lib/rateLimit.js';
import { isPreviewEnv } from './ai/_lib/hardening.js';
import { sendMail, isMailerConfigured } from './_lib/mailer.js';
import { renderFoundingEmail } from './_lib/foundingCircleEmailTemplates.js';


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
  // Good-enough sanity check; Supabase constraint is the real guard.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

  const isFounding = Boolean(body?.founding_circle || body?.meta?.founding_circle);
  const foundingSource = typeof body?.founding_source === 'string' ? body.founding_source.trim().slice(0, 80) : (source ? String(source) : 'organic');
  const pricingLock = typeof body?.pricing_lock === 'string' ? body.pricing_lock.trim().slice(0, 80) : (isFounding ? 'founding_pro_admc_2026' : null);

  if (!email || !isValidEmail(email)) {
    return json(res, 400, { ok: false, error_code: 'INVALID_EMAIL', message: 'Please provide a valid email.' });
  }

  const attributionRaw = pickAttributionRaw(req, body);
  const source = normalizeAttributionSource(attributionRaw || (typeof body?.source === 'string' ? body.source : ''));
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
    const { error } = await admin.from('maw_waitlist_signups').insert(payload);
    if (error) {
      // Duplicate email
      if ((error as any).code === '23505') {
        alreadySubscribed = true;
        // Not a founding join? We're done.
        if (!isFounding) return json(res, 200, { ok: true, already_subscribed: true });
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

    // Founding Circle upgrade path:
    // - If Authorization Bearer token is provided, mark the signed-in user as a founder.
    // - Always upsert into a lead table so Stripe/coupons can be reconciled later.
    // - Queue a 4-email sequence (send first immediately if SMTP is configured).

    let authedUserId: string | null = null;
    if (isFounding) {
      try {
        const authHeader = String(req?.headers?.authorization || '').trim();
        const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
        if (token && admin?.auth?.getUser) {
          const { data } = await admin.auth.getUser(token);
          authedUserId = (data as any)?.user?.id ? String((data as any).user.id) : null;
        }
      } catch {
        authedUserId = null;
      }

      // 1) Upsert lead row
      try {
        await admin.from('maw_founding_circle_leads').upsert(
          {
            email,
            email_lower: email,
            name,
            source: foundingSource,
            converted_to_user: Boolean(authedUserId),
            converted_user_id: authedUserId,
            meta,
            ip_hash: ipHash,
            user_agent: ua,
          },
          { onConflict: 'email_lower' }
        );
      } catch (e) {
        // Don't block signup on secondary tracking table.
        console.warn('founding lead upsert failed', e);
      }

      // 2) Mark user as founder (if authenticated)
      if (authedUserId) {
        try {
          await admin
            .from('users')
            .update({
              founding_circle_member: true,
              founding_joined_at: new Date().toISOString(),
              founding_source: foundingSource,
              ...(pricingLock ? { pricing_lock: pricingLock } : {}),
            })
            .eq('id', authedUserId);
        } catch (e) {
          console.warn('founding user update failed', e);
        }
      }

      // 3) Queue email sequence
      try {
        const now = Date.now();
        const mk = (hoursFromNow: number) => new Date(now + hoursFromNow * 60 * 60 * 1000).toISOString();
        const basePayload = { name, email, founding_source: foundingSource, pricing_lock: pricingLock };

        const queueRows = [
          { to_email: email, template_key: 'founding_welcome', send_at: mk(0), payload: basePayload },
          { to_email: email, template_key: 'founding_early_access', send_at: mk(24), payload: basePayload },
          { to_email: email, template_key: 'founding_pricing_lock', send_at: mk(72), payload: basePayload },
          { to_email: email, template_key: 'founding_next_tools', send_at: mk(144), payload: basePayload },
        ];

        await admin.from('maw_email_queue').insert(queueRows);

        // Best-effort immediate send of the first message (so it works even without cron).
        if (isMailerConfigured()) {
          const rendered = renderFoundingEmail('founding_welcome' as any, { name, email });
          const r = await sendMail({ to: email, subject: rendered.subject, html: rendered.html, text: rendered.text });
          if (r.ok) {
            // Mark the first queued email as sent to avoid duplicates.
            await admin
              .from('maw_email_queue')
              .update({ status: 'sent', sent_at: new Date().toISOString(), last_error: null })
              .eq('to_email', email)
              .eq('template_key', 'founding_welcome')
              .eq('status', 'queued');
          }
        }
      } catch (e) {
        console.warn('email queue failed', e);
      }
    }

    return json(res, 200, { ok: true, already_subscribed: alreadySubscribed, founding_circle: isFounding });
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
