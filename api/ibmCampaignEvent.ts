import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { rateLimit, rateLimitHeaders } from './ai/_lib/rateLimit.js';

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
  const supabaseUrl = getEnv('SUPABASE_URL') || getEnv('VITE_SUPABASE_URL');
  const serviceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
}

function normalizeEmail(email: string): string | null {
  const value = String(email || '').trim().toLowerCase();
  if (!value) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) return null;
  return value.slice(0, 254);
}

function cleanText(value: any, max = 120): string | null {
  const s = typeof value === 'string' ? value.trim() : '';
  return s ? s.slice(0, max) : null;
}

const ALLOWED_EVENTS = new Set(['partner_page_view', 'partner_cta_click', 'partner_form_submit', 'partner_signup_redirect']);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const admin = getAdminClient();
  if (!admin) {
    return json(res, 200, { ok: true, skipped: 'missing_admin_env' });
  }

  const ip = getIpFromReq(req);
  const ipHash = hashIp(ip);
  const rl = rateLimit(`ibm-campaign:${ipHash}`, { windowMs: 15 * 60 * 1000, max: 40 });
  if (!rl.ok) {
    return json(res, 429, { ok: false, error: 'RATE_LIMITED' }, rateLimitHeaders(rl));
  }

  let body: any = req.body;
  try {
    if (typeof body === 'string') body = JSON.parse(body);
  } catch {
    body = {};
  }

  const eventType = cleanText(body?.event_type, 80) || 'partner_form_submit';
  if (!ALLOWED_EVENTS.has(eventType)) {
    return json(res, 400, { ok: false, error: 'INVALID_EVENT_TYPE' });
  }

  const campaign = cleanText(body?.campaign, 80) || 'ibm-30day';
  const source = cleanText(body?.source, 40) || 'ibm';
  const email = normalizeEmail(body?.email || '') || null;
  const ibmRing = cleanText(body?.ibm_ring, 80);
  const promoCode = cleanText(body?.promo_code, 40);
  const pagePath = cleanText(body?.page_path, 240) || '/ibm';
  const userAgent = String(req?.headers?.['user-agent'] || '').slice(0, 500);

  const meta = body?.meta && typeof body.meta === 'object' ? { ...body.meta } : {};
  if (promoCode) meta.promo_code = promoCode;
  if (!meta.campaign) meta.campaign = campaign;
  if (!meta.source) meta.source = source;

  const payload: any = {
    event_type: eventType,
    campaign,
    source,
    email,
    email_lower: email,
    ibm_ring: ibmRing,
    page_path: pagePath,
    ip_hash: ipHash,
    user_agent: userAgent,
    meta,
  };

  const { error } = await admin.from('maw_campaign_events').insert(payload);
  if (error) {
    console.error('ibmCampaignEvent insert failed', error);
    return json(res, 200, { ok: true, skipped: 'insert_failed' });
  }

  return json(res, 200, { ok: true });
}
