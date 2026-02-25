export const ADMIN_WINDOWS = [
  { days: 1, label: 'Today' },
  { days: 7, label: '7d' },
  { days: 30, label: '30d' },
  { days: 90, label: '90d' },
] as const;

export type AdminWindowDays = (typeof ADMIN_WINDOWS)[number]['days'];

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
