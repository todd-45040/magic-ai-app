export const ADMIN_WINDOWS = [
  { days: 1, label: 'Today' },
  { days: 7, label: '7d' },
  { days: 30, label: '30d' },
  { days: 90, label: '90d' },
] as const;

export type AdminWindowDays = (typeof ADMIN_WINDOWS)[number]['days'];

export const ADMIN_WINDOW_OPTIONS_DAYS = ADMIN_WINDOWS.map((w) => w.days) as readonly AdminWindowDays[];

/**
 * Snap any provided window to our supported Admin windows.
 * This mirrors the backend parseAdminWindowDays helper so UI and API stay in lockstep.
 */
export function snapAdminWindowDays(input: any, fallback: AdminWindowDays = 30): AdminWindowDays {
  const n = Number(input);
  if (!Number.isFinite(n)) return fallback;

  for (const d of ADMIN_WINDOW_OPTIONS_DAYS) {
    if (n === d) return d;
  }

  const clamped = Math.max(1, Math.min(365, Math.floor(n)));
  let best: AdminWindowDays = fallback;
  let bestDist = Infinity;
  for (const d of ADMIN_WINDOW_OPTIONS_DAYS) {
    const dist = Math.abs(clamped - d);
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  return best;
}


export const CORE_ACTIVATION_TOOLS = [
  'effect_engine',
  'patter_engine',
  'identify_trick',
  'image_generation',
  'live_rehearsal_audio',
] as const;

export const ADMIN_METRIC_DICTIONARY = {
  active_user: {
    name: 'Active user',
    definition: 'A user with ≥ 1 ai_usage_event in the selected time window.',
    source: 'ai_usage_events (distinct user_id)'
  },
  activated_user: {
    name: 'Activated user',
    definition:
      'A user who uses any core tool within 24 hours of signup (activation).',
    core_tools: CORE_ACTIVATION_TOOLS,
    source: 'users.created_at + first ai_usage_event'
  },
  outcomes: {
    name: 'Outcome categories',
    definition:
      'We treat outcomes consistently across Admin views: success, error, timeout, and rate-limit/quota blocks.',
    mapping: {
      success: ['SUCCESS_CHARGED', 'SUCCESS_NOT_CHARGED'],
      rate_limit: ['BLOCKED_RATE_LIMIT'],
      quota: ['BLOCKED_QUOTA'],
      unauthorized: ['UNAUTHORIZED'],
      upstream_error: ['ERROR_UPSTREAM'],
      allowed: ['ALLOWED'],
    },
  },
  telemetry_fields: {
    name: 'Standard telemetry fields',
    fields: ['tool', 'provider', 'outcome', 'http_status', 'latency_ms', 'estimated_cost_usd', 'user_id', 'occurred_at'],
    note: 'Admin UI refers to estimated_cost_usd as “cost_usd” (best-effort guardrail).',
  },
} as const;
