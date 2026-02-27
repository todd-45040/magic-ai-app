import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

function getEnv(name: string): string | null {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : null;
}

function getAdminClient() {
  const supabaseUrl = getEnv('SUPABASE_URL');
  const serviceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
}

function getIp(req: any): string {
  const xf = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return xf || String(req?.socket?.remoteAddress || '');
}

function hashIp(ip: string): string | null {
  const s = String(ip || '').trim();
  if (!s) return null;
  try {
    return crypto.createHash('sha256').update(s).digest('hex');
  } catch {
    return null;
  }
}

function safeRedirect(target: string): string {
  const t = String(target || '').trim();
  if (!t) return '/';
  try {
    const u = new URL(t);
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.toString();
    return '/';
  } catch {
    return '/';
  }
}

export default async function handler(req: any, res: any) {
  const tid = String(req?.query?.tid || '').trim();
  const raw = String(req?.query?.u || '');
  const decoded = (() => {
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  })();

  const target = safeRedirect(decoded);

  try {
    const admin = getAdminClient();
    if (admin && tid) {
      const ua = String(req?.headers?.['user-agent'] || '').slice(0, 512) || null;
      const ipHash = hashIp(getIp(req));

      await admin.from('maw_email_events').insert({
        tracking_id: tid,
        event_type: 'click',
        template_key: String(req?.query?.k || '').trim() || null,
        template_version: Number(req?.query?.v || 1) || 1,
        url: target,
        user_agent: ua,
        ip_hash: ipHash,
      } as any);
    }
  } catch {
    // ignore logging errors
  }

  res.statusCode = 302;
  res.setHeader('Location', target);
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  return res.end();
}
