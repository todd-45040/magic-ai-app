import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

export type UsageEventOutcome =
  | 'ALLOWED'
  | 'BLOCKED_RATE_LIMIT'
  | 'BLOCKED_QUOTA'
  | 'UNAUTHORIZED'
  | 'ERROR_UPSTREAM'
  | 'SUCCESS_CHARGED'
  | 'SUCCESS_NOT_CHARGED';

export type UsageEvent = {
  request_id: string;
  occurred_at?: string; // server default if omitted
  actor_type: 'user' | 'guest';
  user_id?: string | null;
  identity_key: string; // hashed ip / user id
  ip_hash?: string | null;
  tool?: string | null;
  endpoint?: string | null;
  provider?: string | null;
  model?: string | null;
  outcome: UsageEventOutcome;
  http_status?: number | null;
  error_code?: string | null;
  retryable?: boolean | null;
  units?: number | null;
  charged_units?: number | null;
  membership?: string | null;
  latency_ms?: number | null;
  user_agent?: string | null;
  estimated_cost_usd?: number | null;
};

export type AuditEvent = {
  actor_user_id?: string | null;
  action: string;
  target_user_id?: string | null;
  metadata?: any;
  request_id?: string | null;
};

function getEnv(name: string): string | null {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : null;
}

// Cache env reads at module load (per cold start) and emit a clear warning if telemetry is disabled.
const __telemetrySupabaseUrl = getEnv('SUPABASE_URL');
const __telemetryServiceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
if (!__telemetrySupabaseUrl || !__telemetryServiceRoleKey) {
  console.warn('[telemetry] DISABLED: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY', {
    hasUrl: !!__telemetrySupabaseUrl,
    hasServiceRole: !!__telemetryServiceRoleKey,
  });
}

export function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function hashIp(ip: string): string {
  const salt = getEnv('TELEMETRY_SALT') || 'magic_ai_wizard_default_salt';
  return sha256Hex(`${salt}:${ip}`);
}

export function getIpFromReq(req: any): string {
  const xff = req?.headers?.['x-forwarded-for'] || req?.headers?.['X-Forwarded-For'];
  const ip = (typeof xff === 'string' && xff.split(',')[0].trim()) || req?.socket?.remoteAddress || 'unknown';
  return String(ip);
}

export function createAdminClient() {
  const supabaseUrl = __telemetrySupabaseUrl;
  const serviceKey = __telemetryServiceRoleKey;
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
}

export async function logUsageEvent(event: UsageEvent): Promise<void> {
  const admin = createAdminClient();
  if (!admin) return;

  try {
    const payload = { ...event };
    // avoid huge UA strings
    if (payload.user_agent && payload.user_agent.length > 500) {
      payload.user_agent = payload.user_agent.slice(0, 500);
    }
    const { error } = await admin.from('ai_usage_events').insert(payload);
    if (error) console.error('telemetry insert error:', error);
  } catch (e) {
    // Never break production calls for telemetry
    console.error('telemetry insert failed', e);
  }
}

export async function logAuditEvent(evt: AuditEvent): Promise<void> {
  const admin = createAdminClient();
  if (!admin) return;

  try {
    await admin.from('ai_audit_log').insert({
      actor_user_id: evt.actor_user_id ?? null,
      action: evt.action,
      target_user_id: evt.target_user_id ?? null,
      metadata: evt.metadata ?? null,
      request_id: evt.request_id ?? null,
    });
  } catch (e) {
    console.error('audit insert failed', e);
  }
}

/**
 * Lightweight inline anomaly flagging (fast, cheap).
 * Deeper detection should be done by a scheduled DB job (see SQL in supabase/phase2b.sql).
 */
export async function maybeFlagAnomaly(input: {
  request_id: string;
  user_id?: string | null;
  identity_key: string;
  ip_hash?: string | null;
  reason: string;
  severity?: 'low' | 'medium' | 'high';
  metadata?: any;
}): Promise<void> {
  const admin = createAdminClient();
  if (!admin) return;

  try {
    await admin.from('ai_anomaly_flags').insert({
      request_id: input.request_id,
      user_id: input.user_id ?? null,
      identity_key: input.identity_key,
      ip_hash: input.ip_hash ?? null,
      reason: input.reason,
      severity: input.severity ?? 'medium',
      metadata: input.metadata ?? null,
    });
  } catch (e) {
    console.error('anomaly insert failed', e);
  }
}


/**
 * Cost estimation (best-effort).
 * Set COST_TABLE_JSON env var to override defaults.
 * Example:
 * {"gemini":{"gemini-2.5-flash":0.00035,"gemini-2.5-pro":0.002},"imagen":{"imagen-4.0-generate-001":0.01}}
 *
 * Interpretation: cost per "unit" as your internal metering unit.
 * This is NOT provider billing-accurate; it is for margin guardrails and anomaly detection.
 */
export function estimateCostUSD(input: {
  provider?: string | null;
  model?: string | null;
  charged_units?: number | null;
  tool?: string | null;
}): number | null {
  const units = Number(input.charged_units ?? 0);
  if (!Number.isFinite(units) || units <= 0) return 0;

  // Defaults tuned conservatively; adjust later.
  const defaults: any = {
    gemini: {
      'gemini-2.5-flash': 0.00025,
      'gemini-2.5-flash-lite': 0.00015,
      'gemini-2.5-pro': 0.00150,
      'gemini-2.5-flash-native-audio-preview': 0.00100,
    },
    imagen: {
      'imagen-4.0-generate-001': 0.01000,
      'imagen-3': 0.00800,
    },
    anthropic: {
      'claude-3-5-sonnet': 0.00180,
    },
    openai: {
      'gpt-4o-mini': 0.00020,
      'gpt-4o': 0.00100,
    },
  };

  let table = defaults;
  try {
    const raw = process.env.COST_TABLE_JSON;
    if (raw && raw.trim()) table = JSON.parse(raw);
  } catch {
    // ignore
  }

  const provider = String(input.provider || 'gemini').toLowerCase();
  const model = String(input.model || 'unknown');
  const perUnit = Number(table?.[provider]?.[model] ?? table?.[provider]?.['default'] ?? 0);
  if (!Number.isFinite(perUnit) || perUnit < 0) return null;

  const est = perUnit * units;
  // clamp to sane range
  if (!Number.isFinite(est)) return null;
  return Math.round(est * 1000000) / 1000000;
}
