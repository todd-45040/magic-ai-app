// api/telemetry/event.ts
// Client-side engagement telemetry -> ai_usage_events (no schema changes).
// Logs events with endpoint = `client:<action>`.

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { getIpFromReq, hashIp, logUsageEvent } from '../../server/telemetry.js';
import { getUserIbmContext, normalizeIbmMetadata, insertUserActivity } from '../_lib/ibmTelemetry.js';

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

async function resolveUser(token: string | null): Promise<{ user_id: string | null; email: string | null }> {
  if (!token || token === 'guest') return { user_id: null, email: null };

  const url = getEnv('SUPABASE_URL') || getEnv('VITE_SUPABASE_URL');
  const key = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return { user_id: null, email: null };

  try {
    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user?.id) return { user_id: null, email: null };
    return { user_id: data.user.id, email: data.user.email ?? null };
  } catch {
    return { user_id: null, email: null };
  }
}

function classifyActivityEvent(tool: string, action: string, outcome: string, errorCode?: string | null, metadata?: any): null | { event_type: 'tool_used' | 'error'; success: boolean; tool_name: string; metadata: any } {
  const normalizedTool = String(tool || '').trim().toLowerCase();
  const selectedTools = new Set([
    'effect_generator',
    'patter_engine',
    'director_mode',
    'contract_generator',
    'live_rehearsal',
    'visual_brainstorm',
    'video_rehearsal',
    'persona_simulator',
    'show_planner',
    'client_management',
    'assistant_studio',
    'angle_risk',
    'illusion_blueprint',
    'prop_generator',
    'mentalism_assistant',
  ]);
  if (!selectedTools.has(normalizedTool)) return null;

  const message = String(metadata?.message || '').toLowerCase();
  const ec = String(errorCode || '').toLowerCase();
  const act = String(action || '').toLowerCase();

  const exactSuccessActions = new Set([
    'effect_generate_success',
    'effect_alternative_success',
    'effect_save_success',
    'patter_generate_success',
    'patter_save_success',
    'director_request_success',
    'director_save_blueprint',
    'director_create_show',
    'director_send_to_show_planner',
    'contract_generated',
    'live_rehearsal_session_start',
    'live_rehearsal_take_complete',
    'assistant_generate_success',
    'assistant_save_plan',
    'assistant_save_blueprint',
    'angle_risk_analysis_success',
    'angle_risk_analysis_saved',
    'illusion_blueprint_success',
    'illusion_blueprint_save_success',
    'save_transcript',
    'save_feedback',
    'show_planner_handoff',
    'followup_send',
    'analyze_success',
    'demo_analyze_success',
    'visual_request_success',
  ]);

  const isSuccess = exactSuccessActions.has(act)
    || act.startsWith('effect_refine_') && act.endsWith('_success')
    || act.startsWith('prop_') && act.endsWith('_success')
    || act.startsWith('client_ai_') && act.endsWith('_generated');

  if (isSuccess) return { event_type: 'tool_used', success: true, tool_name: normalizedTool, metadata: metadata || {} };

  const isError = act.endsWith('_error') || act.includes('blocked') || outcome === 'ERROR_UPSTREAM';
  if (!isError) return null;

  let error_kind = 'ai_failure';
  if (ec.includes('usage') || ec.includes('quota') || message.includes('limit reached') || message.includes('quota')) error_kind = 'usage_limit_hit';
  else if (ec.includes('timeout') || message.includes('timed out') || message.includes('timeout')) error_kind = 'timeout';

  return { event_type: 'error', success: false, tool_name: normalizedTool, metadata: { ...(metadata || {}), error_kind } };
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
    const user = await resolveUser(token);
    const user_id = user.user_id;

    const ip = getIpFromReq(req);
    const ip_hash = hashIp(ip);

    const actor_type = user_id ? 'user' : 'guest';
    const identity_key = user_id ? `user:${user_id}` : `ip:${ip_hash}`;

    const outcome = String(body.outcome || 'SUCCESS_NOT_CHARGED');
    let ibmContext: Record<string, any> = {};
    try {
      const url = getEnv('SUPABASE_URL') || getEnv('VITE_SUPABASE_URL');
      const key = getEnv('SUPABASE_SERVICE_ROLE_KEY');
      if (url && key && user_id) {
        const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
        ibmContext = await getUserIbmContext(admin, user_id);
      }
    } catch {}

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


    const activity = classifyActivityEvent(tool, action, outcome, body.error_code ? String(body.error_code) : null, body.metadata || {});
    if (activity && user_id) {
      try {
        const url = getEnv('SUPABASE_URL') || getEnv('VITE_SUPABASE_URL');
        const key = getEnv('SUPABASE_SERVICE_ROLE_KEY');
        if (url && key) {
          const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
          const mergedMetadata = normalizeIbmMetadata(activity.metadata, ibmContext);
          await insertUserActivity(admin, {
            user_id,
            email: user.email,
            tool_name: activity.tool_name,
            event_type: activity.event_type,
            success: activity.success,
            duration_ms: Number.isFinite(Number(body?.metadata?.duration_ms)) ? Number(body.metadata.duration_ms) : null,
            metadata: mergedMetadata,
          });
          if (activity.event_type === 'tool_used') {
            const { count } = await admin.from('user_activity_log').select('id', { count: 'exact', head: true }).eq('user_id', user_id).eq('event_type', 'first_tool_used');
            if (!count) {
              await insertUserActivity(admin, {
                user_id,
                email: user.email,
                tool_name: activity.tool_name,
                event_type: 'first_tool_used',
                success: true,
                duration_ms: null,
                metadata: mergedMetadata,
              });
            }
          }
        }
      } catch {
        // Never fail telemetry requests because of activity logging.
      }
    }
    return res.status(200).json({ ok: true, requestId: request_id });
  } catch (e: any) {
    // Never fail the client flow for telemetry
    return res.status(200).json({ ok: true, requestId: request_id });
  }
}
