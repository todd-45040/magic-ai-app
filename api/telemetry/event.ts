// api/telemetry/event.ts
// Client-side engagement telemetry -> ai_usage_events (no schema changes).
// Logs events with endpoint = `client:<action>`.

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { getIpFromReq, hashIp, logUsageEvent } from '../../server/telemetry.js';

function parseBearer(req: any): string | null {
  const h = req?.headers?.authorization || req?.headers?.Authorization;
  if (!h || typeof h !== 'string') return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function getEnv(name: string): string | null {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : null;
}

function makeRequestId(): string {
  // crypto.randomUUID available in modern Node, fallback to random bytes
  try {
    // @ts-ignore
    return crypto.randomUUID();
  } catch {
    return crypto.randomBytes(16).toString('hex');
  }
}

async function resolveUserId(token: string | null): Promise<string | null> {
  if (!token || token === 'guest') return null;

  const url = getEnv('SUPABASE_URL') || getEnv('VITE_SUPABASE_URL');
  const key = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;

  try {
    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user?.id) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error_code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' });
  }

  const request_id = makeRequestId();

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

    const tool = String(body.tool || 'unknown');
    const action = String(body.action || 'unknown');

    // Encode small context into endpoint string to avoid schema changes.
    // Examples:
    //  - client:identify_refine_click:visual
    //  - client:identify_upload_selected
    const endpoint = body?.metadata?.intent
      ? `client:${action}:${String(body.metadata.intent)}`
      : `client:${action}`;

    const token = parseBearer(req);
    const user_id = await resolveUserId(token);

    const ip = getIpFromReq(req);
    const ip_hash = hashIp(ip);

    const actor_type = user_id ? 'user' : 'guest';
    const identity_key = user_id ? `user:${user_id}` : `ip:${ip_hash}`;

    const outcome = String(body.outcome || 'SUCCESS_NOT_CHARGED');

    await logUsageEvent({
      request_id,
      actor_type: actor_type as any,
      user_id: user_id,
      identity_key,
      ip_hash,
      tool,
      endpoint,
      outcome: outcome as any,
      http_status: Number.isFinite(Number(body.http_status)) ? Number(body.http_status) : null,
      error_code: body.error_code ? String(body.error_code) : null,
      retryable: body.retryable != null ? Boolean(body.retryable) : null,
      units: Number.isFinite(Number(body.units)) ? Number(body.units) : null,
      charged_units: null,
      membership: null,
      provider: null,
      model: null,
      latency_ms: null,
      user_agent: (req?.headers?.['user-agent'] || req?.headers?.['User-Agent'] || '') as any,
      estimated_cost_usd: null,
    });

    return res.status(200).json({ ok: true, requestId: request_id });
  } catch (e: any) {
    // Never fail the client flow for telemetry
    return res.status(200).json({ ok: true, requestId: request_id });
  }
}
