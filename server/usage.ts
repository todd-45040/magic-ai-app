import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import type { GoTrueClient } from '@supabase/auth-js';
import { getIpFromReq, hashIp, logUsageEvent, } from './telemetry.js';

// Canonical membership tiers used for usage enforcement.
// Legacy tiers are accepted and normalized server-side.
type Membership = 'free' | 'trial' | 'amateur' | 'professional' | 'admin' | 'expired' | 'performer' | 'semi-pro';


export type UsageErrorCode =
  | 'RATE_LIMITED'
  | 'USAGE_LIMIT_REACHED'
  | 'NOT_CONFIGURED'
  | 'UNAUTHORIZED'
  | 'INVALID_REQUEST'
  | 'SERVER_ERROR';

export type UsageErrorShape = {
  ok: false;
  status: number;
  error: string;
  error_code: UsageErrorCode;
  retryable: boolean;
  // Optional: for clients that want to show “resets at …”
  resetAt?: string;
};

function makeRequestId(): string {
  try {
    // Node 18+
    // @ts-ignore
    return crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  } catch {
    return `${Date.now()}-${Math.random()}`;
  }
}

// NOTE: For ADMC soft launch, "free" behaves like "trial".
// We keep the legacy string accepted, but normalize it to "trial".
function normalizeTier(m?: string | null): 'trial' | 'performer' | 'professional' | 'admin' | 'expired' {
  switch (m) {
    case 'admin':
      return 'admin';
    case 'professional':
      return 'professional';
    case 'performer':
      return 'performer';
    case 'amateur':
    case 'semi-pro':
      return 'performer';
    case 'expired':
      return 'expired';
    case 'trial':
      return 'trial';
    default:
      // free/unknown -> trial
      return 'trial';
  }
}

const TIER_LIMITS: Record<string, number> = {
  // free behaves like trial
  trial: 20,
  performer: 100,
  professional: 10000,
  admin: 10000,
  expired: 0,
  // legacy
  amateur: 100,
  'semi-pro': 100,
};

// Per-minute burst limits (requests per minute), even if daily remaining is high.
const BURST_LIMITS: Record<string, number> = {
  // free behaves like trial
  trial: 20,
  performer: 30,
  professional: 120,
  admin: 120,
  expired: 0,
  // legacy
  amateur: 30,
  'semi-pro': 30,
};


// Phase 2C-B: Tool tier + quota enforcement (monthly buckets).
// Quota columns in public.users are treated as "remaining" balances for the current month.
type ToolKey = 'live_rehearsal_audio' | 'image_generation' | 'identify_trick' | 'video_rehearsal';

type ToolPolicy = {
  key: ToolKey;
  // Minimum membership required to access the tool at all.
  minTier: 'trial' | 'amateur' | 'professional' | 'admin';
  // Which users column stores the remaining quota balance for this tool.
  quotaColumn: 'quota_live_audio_minutes' | 'quota_image_gen' | 'quota_identify' | 'quota_video_uploads';
};

const TOOL_POLICIES: Record<ToolKey, ToolPolicy> = {
  live_rehearsal_audio: { key: 'live_rehearsal_audio', minTier: 'trial', quotaColumn: 'quota_live_audio_minutes' },
  image_generation: { key: 'image_generation', minTier: 'trial', quotaColumn: 'quota_image_gen' },
  identify_trick: { key: 'identify_trick', minTier: 'trial', quotaColumn: 'quota_identify' },
  video_rehearsal: { key: 'video_rehearsal', minTier: 'professional', quotaColumn: 'quota_video_uploads' },
};

function tierRank(tier: string): number {
  switch (tier) {
    case 'admin':
      return 4;
    case 'professional':
      return 3;
    case 'amateur':
    case 'performer':
    case 'semi-pro':
      return 2;
    case 'trial':
      return 1;
    default:
      return 0;
  }
}

function defaultMonthlyQuotas(tier: string): {
  quota_live_audio_minutes: number;
  quota_image_gen: number;
  quota_identify: number;
  quota_video_uploads: number;
} {
  if (tierRank(tier) >= tierRank('admin')) {
    return { quota_live_audio_minutes: 9999, quota_image_gen: 9999, quota_identify: 9999, quota_video_uploads: 9999 };
  }
  const t = normalizeTier(tier as any);
  switch (t) {
    case 'professional':
      return { quota_live_audio_minutes: 120, quota_image_gen: 25, quota_identify: 25, quota_video_uploads: 10 };
    case 'performer':
      // "amateur" normalizes to performer
      return { quota_live_audio_minutes: 30, quota_image_gen: 10, quota_identify: 10, quota_video_uploads: 0 };
    case 'trial':
      return { quota_live_audio_minutes: 5, quota_image_gen: 3, quota_identify: 3, quota_video_uploads: 0 };
    case 'expired':
    default:
      return { quota_live_audio_minutes: 0, quota_image_gen: 0, quota_identify: 0, quota_video_uploads: 0 };
  }
}

function needsMonthlyReset(resetDateISO?: string | null, now = new Date()): boolean {
  if (!resetDateISO) return true;
  const d = new Date(resetDateISO);
  return d.getUTCFullYear() !== now.getUTCFullYear() || d.getUTCMonth() !== now.getUTCMonth();
}

async function ensureMonthlyQuotas(admin: any, userId: string, membership: string, profile: any): Promise<any> {
  const now = new Date();
  const resetDateISO = profile?.quota_reset_date ? new Date(profile.quota_reset_date).toISOString() : null;
  if (!needsMonthlyReset(resetDateISO, now)) return profile;

  const defaults = defaultMonthlyQuotas(membership);
  const next = {
    quota_live_audio_minutes: defaults.quota_live_audio_minutes,
    quota_image_gen: defaults.quota_image_gen,
    quota_identify: defaults.quota_identify,
    quota_video_uploads: defaults.quota_video_uploads,
    quota_reset_date: now.toISOString(),
  };

  const { data, error } = await admin
    .from('users')
    .update(next)
    .eq('id', userId)
    .select('id, email, membership, is_admin, generation_count, last_reset_date, trial_end_date, quota_live_audio_minutes, quota_image_gen, quota_identify, quota_video_uploads, quota_reset_date')
    .maybeSingle();


  if (error) {
    console.error('Monthly quota reset error:', error);
    return profile;
  }
  return data || profile;
}

function getTodayKeyUTC(d = new Date()): string {
  // YYYY-MM-DD in UTC
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Optional: move the daily reset boundary away from UTC midnight.
// Defaults preserve the current behavior.
//
// Example for "Resets at 3:00 AM" in America/New_York:
//   USAGE_RESET_TZ=America/New_York
//   USAGE_RESET_HOUR_LOCAL=3
const RESET_TZ = process.env.USAGE_RESET_TZ || 'UTC';
const RESET_HOUR_LOCAL = Number.isFinite(Number(process.env.USAGE_RESET_HOUR_LOCAL))
  ? Math.min(23, Math.max(0, Number(process.env.USAGE_RESET_HOUR_LOCAL)))
  : 0;

function tzParts(d: Date, timeZone: string): Record<string, string> {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'shortOffset',
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(d)) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  return parts;
}

function tzOffsetMinutes(d: Date, timeZone: string): number {
  const parts = tzParts(d, timeZone);
  const tzName = parts.timeZoneName || 'GMT+00:00';
  // Node/Intl may emit offsets in several shapes depending on runtime:
  //   "GMT-05:00", "GMT+01:00", "GMT-5", "UTC-05:00", "UTC+1"
  const m = tzName.match(/^(?:GMT|UTC)([+-])(\d{1,2})(?::(\d{2}))?$/);
  if (!m) return 0;
  const sign = m[1] === '-' ? -1 : 1;
  const hh = Number(m[2] || 0);
  const mm = Number(m[3] || 0);
  return sign * (hh * 60 + mm);
}

function usageDayKey(d = new Date()): string {
  // If configured for UTC midnight, keep existing behavior.
  if (RESET_TZ === 'UTC' && RESET_HOUR_LOCAL === 0) return getTodayKeyUTC(d);

  const p = tzParts(d, RESET_TZ);
  const y = p.year;
  const m = p.month;
  const day = p.day;
  const hour = Number(p.hour || 0);

  // If local time is before the reset boundary, treat as "yesterday" for the usage key.
  const baseUtc = Date.UTC(Number(y), Number(m) - 1, Number(day), 12, 0, 0); // noon UTC (safe from DST edge)
  const baseDate = new Date(baseUtc);
  if (hour < RESET_HOUR_LOCAL) {
    baseDate.setUTCDate(baseDate.getUTCDate() - 1);
    const p2 = tzParts(baseDate, RESET_TZ);
    return `${p2.year}-${p2.month}-${p2.day}`;
  }
  return `${y}-${m}-${day}`;
}

function nextResetAtISO(now = new Date()): string {
  // UTC midnight default
  if (RESET_TZ === 'UTC' && RESET_HOUR_LOCAL === 0) {
    const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
    return t.toISOString();
  }

  const p = tzParts(now, RESET_TZ);
  const y = Number(p.year);
  const m = Number(p.month);
  const d = Number(p.day);
  const hourNow = Number(p.hour || 0);

  // Determine target local date
  const targetDay = hourNow >= RESET_HOUR_LOCAL ? d + 1 : d;

  // Convert local target (y-m-targetDay RESET_HOUR_LOCAL:00) -> UTC.
  // We do a small two-step refinement to account for DST shifts.
  const localAsUTC = Date.UTC(y, m - 1, targetDay, RESET_HOUR_LOCAL, 0, 0);
  let guess = new Date(localAsUTC);
  let off = tzOffsetMinutes(guess, RESET_TZ);
  let utcMillis = localAsUTC - off * 60_000;
  guess = new Date(utcMillis);
  off = tzOffsetMinutes(guess, RESET_TZ);
  utcMillis = localAsUTC - off * 60_000;
  return new Date(utcMillis).toISOString();
}

function usageWindowStartISO(now = new Date()): string {
  // UTC midnight default
  if (RESET_TZ === 'UTC' && RESET_HOUR_LOCAL === 0) {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0)).toISOString();
  }

  const p = tzParts(now, RESET_TZ);
  const y = Number(p.year);
  const m = Number(p.month);
  const d = Number(p.day);
  const hourNow = Number(p.hour || 0);

  // If before reset boundary, window started yesterday at reset hour (local)
  const startDay = hourNow < RESET_HOUR_LOCAL ? d - 1 : d;

  // Convert local target (y-m-startDay RESET_HOUR_LOCAL:00) -> UTC.
  // Two-step refinement to account for DST shifts.
  const localAsUTC = Date.UTC(y, m - 1, startDay, RESET_HOUR_LOCAL, 0, 0);
  let guess = new Date(localAsUTC);
  let off = tzOffsetMinutes(guess, RESET_TZ);
  let utcMillis = localAsUTC - off * 60_000;
  guess = new Date(utcMillis);
  off = tzOffsetMinutes(guess, RESET_TZ);
  utcMillis = localAsUTC - off * 60_000;
  return new Date(utcMillis).toISOString();
}

async function getEngagementSignals(admin: any, userId: string): Promise<{
  sessionsToday: number;
  toolsUsedToday: string[];
  distinctToolsToday: number;
}> {
  try {
    const startISO = usageWindowStartISO();

    // Sessions = rows recorded at login (tool_used is null)
    const { count: sessionsCount } = await admin
      .from('user_activity')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('tool_used', null)
      .gte('session_start_at', startISO);

    // Tool uses = distinct tools used today
    const { data: toolRows } = await admin
      .from('user_activity')
      .select('tool_used')
      .eq('user_id', userId)
      .not('tool_used', 'is', null)
      .gte('session_start_at', startISO)
      .limit(5000);

    const tools = Array.isArray(toolRows)
      ? Array.from(
          new Set(
            toolRows
              .map((r: any) => (typeof r?.tool_used === 'string' ? r.tool_used.trim() : ''))
              .filter(Boolean)
          )
        ).sort()
      : [];

    return {
      sessionsToday: Number.isFinite(Number(sessionsCount)) ? Number(sessionsCount) : 0,
      toolsUsedToday: tools,
      distinctToolsToday: tools.length,
    };
  } catch {
    return { sessionsToday: 0, toolsUsedToday: [], distinctToolsToday: 0 };
  }
}

export async function recordUserActivity(
  req: any,
  toolUsed: string | null
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token = parseBearer(req);

  if (!supabaseUrl || !serviceKey) {
    return { ok: false, status: 503, error: 'Server activity tracking is not configured.' };
  }
  if (!token || token === 'guest') {
    return { ok: false, status: 401, error: 'Unauthorized.' };
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const auth = admin.auth as unknown as GoTrueClient;
  const { data, error } = await auth.getUser(token);
  if (error || !data?.user?.id) {
    return { ok: false, status: 401, error: 'Unauthorized.' };
  }

  const userId = data.user.id;
  const { error: insErr } = await admin.from('user_activity').insert({
    user_id: userId,
    session_start_at: new Date().toISOString(),
    tool_used: toolUsed,
  });

  if (insErr) {
    console.error('user_activity insert error:', insErr);
    return { ok: false, status: 503, error: 'Activity tracking unavailable.' };
  }

  return { ok: true };
}

function getMinuteKeyUTC(d = new Date()): string {
  // YYYY-MM-DDTHH:MM in UTC
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${y}-${m}-${day}T${hh}:${mm}`;
}

function parseBearer(req: any): string | null {
  const h = req?.headers?.authorization || req?.headers?.Authorization;
  if (!h || typeof h !== 'string') return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function ipKey(req: any): string {
  const xff = req?.headers?.['x-forwarded-for'] || req?.headers?.['X-Forwarded-For'];
  const ip = (typeof xff === 'string' && xff.split(',')[0].trim()) || req?.socket?.remoteAddress || 'unknown';
  return `ip:${ip}`;
}

// Best-effort in-memory rate limiter (per serverless instance).
// For strict global limits across all instances, you'd use Upstash/Redis or a Supabase table with RPC.
function getRateMap(): Map<string, number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g: any = globalThis as any;
  g.__aiRate = g.__aiRate || new Map();
  return g.__aiRate as Map<string, number>;
}

function enforceBurst(identity: string, burstLimit: number): { ok: boolean; remaining: number; limit: number } {
  const minuteKey = getMinuteKeyUTC();
  const key = `AI_BURST:${minuteKey}:${identity}`;
  const map = getRateMap();
  const used = map.get(key) || 0;
  const remaining = Math.max(0, burstLimit - used);

  if (remaining <= 0) {
    return { ok: false, remaining: 0, limit: burstLimit };
  }

  map.set(key, used + 1);
  return { ok: true, remaining: Math.max(0, burstLimit - (used + 1)), limit: burstLimit };
}

export async function getAiUsageStatus(req: any): Promise<{
  ok: boolean;
  status?: number;
  error?: string;
  error_code?: UsageErrorCode;
  retryable?: boolean;
  membership?: Membership;
  used?: number;
  limit?: number;
  remaining?: number;
  resetAt?: string;
  resetTz?: string;
  resetHourLocal?: number;
  // Phase 2A: engagement telemetry (best-effort)
  sessionsToday?: number;
  toolsUsedToday?: string[];
  distinctToolsToday?: number;
  quota?: {
    live_audio_minutes: { remaining: number | null };
    image_gen: { remaining: number | null };
    identify: { remaining: number | null };
    video_uploads: { remaining: number | null };
    resetAt: string | null;
  };
  // Back-compat aliases for older endpoints/UI
  liveUsed?: number;
  liveLimit?: number;
  liveRemaining?: number;
  burstLimit?: number;
  burstRemaining?: number;
}> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token = parseBearer(req);
  const requestId = makeRequestId();
  const ip = getIpFromReq(req);
  const ip_hash = hashIp(ip);

  void requestId;
  void ip_hash;

  if (!supabaseUrl || !serviceKey) {
    return { ok: false, status: 503, error: 'Server usage tracking is not configured.', error_code: 'NOT_CONFIGURED', retryable: true };
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const auth = admin.auth as unknown as GoTrueClient;

  let userId: string | null = null;
  if (token && token !== 'guest') {
    const { data, error } = await auth.getUser(token);
    if (!error && data?.user?.id) userId = data.user.id;
  }

  const identity = userId || ipKey(req);

  // For anonymous users, show strict caps (best-effort)
  if (!userId) {
    // Anonymous users behave like trial.
    const membership: Membership = 'trial';
    const limit = TIER_LIMITS.trial;
    const used = 0;
    const remaining = limit;
    const burstLimit = 8;
    // Compute burst remaining from current in-memory counter (best-effort)
    const minuteKey = getMinuteKeyUTC();
    const key = `AI_BURST:${minuteKey}:${identity}`;
    const map = getRateMap();
    const usedBurst = map.get(key) || 0;
    const burstRemaining = Math.max(0, burstLimit - usedBurst);
    return {
      ok: true,
      membership,
      used,
      limit,
      remaining,
      resetAt: nextResetAtISO(),
    resetTz: RESET_TZ,
      resetHourLocal: RESET_HOUR_LOCAL,
      sessionsToday: 0,
      toolsUsedToday: [],
      distinctToolsToday: 0,
      liveUsed: used,
      liveLimit: limit,
      liveRemaining: remaining,
      burstLimit,
      burstRemaining,
    };
  }
  const { data: profileData, error: profileErr } = await admin
    .from('users')
    .select('id, email, membership, is_admin, generation_count, last_reset_date, trial_end_date, quota_live_audio_minutes, quota_image_gen, quota_identify, quota_video_uploads, quota_reset_date')
    .eq('id', userId)
    .maybeSingle();

  let profile = profileData;



  if (profileErr) console.error('Usage lookup error:', profileErr);

  let membership: Membership = 'trial';
  let generationCount = 0;
  let lastResetDateISO = new Date().toISOString();

  if (profile) {
    membership = (profile.is_admin ? 'admin' : (profile.membership as Membership)) || 'trial';
    generationCount = profile.generation_count ?? 0;
    lastResetDateISO = profile.last_reset_date ? new Date(profile.last_reset_date).toISOString() : lastResetDateISO;
  } else {
    // If no profile exists yet, treat as trial until created
    membership = 'trial';
    generationCount = 0;
    lastResetDateISO = new Date().toISOString();
  }
// Phase 2C-B: ensure monthly tool quotas are initialized/reset (best-effort)
if (profile) {
  const refreshed = await ensureMonthlyQuotas(admin, userId, membership, profile);
  if (refreshed) {
    // @ts-ignore
    profile.trial_end_date = refreshed.trial_end_date;
    // @ts-ignore
    profile.quota_live_audio_minutes = refreshed.quota_live_audio_minutes;
    // @ts-ignore
    profile.quota_image_gen = refreshed.quota_image_gen;
    // @ts-ignore
    profile.quota_identify = refreshed.quota_identify;
    // @ts-ignore
    profile.quota_video_uploads = refreshed.quota_video_uploads;
    // @ts-ignore
    profile.quota_reset_date = refreshed.quota_reset_date;
  }
}

  // Daily reset (UTC midnight by default; configurable via USAGE_RESET_TZ + USAGE_RESET_HOUR_LOCAL)
  const today = usageDayKey();
  const lastKey = usageDayKey(new Date(lastResetDateISO));
  if (lastKey !== today) {
    generationCount = 0;
  }

  const tier = normalizeTier(membership as any);
  const limit = TIER_LIMITS[tier] ?? TIER_LIMITS.trial;
  const remaining = Math.max(0, limit - generationCount);

  const burstLimit = BURST_LIMITS[tier] ?? BURST_LIMITS.trial;
  const minuteKey = getMinuteKeyUTC();
  const key = `AI_BURST:${minuteKey}:${userId}`;
  const map = getRateMap();
  const usedBurst = map.get(key) || 0;
  const burstRemaining = Math.max(0, burstLimit - usedBurst);

  const engagement = await getEngagementSignals(admin, userId);

  return {
    ok: true,
    membership: tier as any,
    used: generationCount,
    limit,
    remaining,
    resetAt: nextResetAtISO(),
    resetTz: RESET_TZ,
    resetHourLocal: RESET_HOUR_LOCAL,
    sessionsToday: engagement.sessionsToday,
    toolsUsedToday: engagement.toolsUsedToday,
    distinctToolsToday: engagement.distinctToolsToday,
    liveUsed: generationCount,
    liveLimit: limit,
    liveRemaining: remaining,
    quota: {
      live_audio_minutes: { remaining: profile?.quota_live_audio_minutes ?? null },
      image_gen: { remaining: profile?.quota_image_gen ?? null },
      identify: { remaining: profile?.quota_identify ?? null },
      video_uploads: { remaining: profile?.quota_video_uploads ?? null },
      resetAt: profile?.quota_reset_date ? new Date(profile.quota_reset_date).toISOString() : null,
    },
burstLimit,
    burstRemaining,
  };
}

export async function enforceAiUsage(
  req: any,
  costUnits: number,
  opts?: { tool?: string }
): Promise<{
  ok: boolean;
  status?: number;
  error?: string;
  error_code?: UsageErrorCode;
  retryable?: boolean;
  remaining?: number;
  limit?: number;
  membership?: Membership;
  burstRemaining?: number;
  burstLimit?: number;
  resetAt?: string;
  resetTz?: string;
  resetHourLocal?: number;
}> {
  try {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const token = parseBearer(req);
  const requestId = makeRequestId();
  const ip = getIpFromReq(req);
  const ip_hash = hashIp(ip);

  void requestId;
  void ip_hash;

  // If server isn't configured for Supabase admin, fall back to a very small per-IP cap (fails safe).
  if (!supabaseUrl || !serviceKey) {
    const anonIdentity = ipKey(req);

    // Burst (per-minute) safety cap even when misconfigured
    const burst = enforceBurst(anonIdentity, 10);
    if (!burst.ok) {
      // Telemetry (best-effort)
      await logUsageEvent({
        request_id: requestId,
        actor_type: 'guest',
        user_id: null,
        identity_key: anonIdentity,
        ip_hash,
        tool: opts?.tool ?? null,
        endpoint: req?.url ?? null,
        outcome: 'BLOCKED_RATE_LIMIT',
        http_status: 429,
        error_code: 'RATE_LIMITED',
        retryable: true,
        units: costUnits,
        charged_units: 0,
        membership: 'free',
        user_agent: req?.headers?.['user-agent'] || req?.headers?.['User-Agent'] || null,
        estimated_cost_usd: 0,
      });
      return { ok: false, status: 429, error: 'Rate limit: too many requests per minute.',
      error_code: 'RATE_LIMITED',
      retryable: true, burstRemaining: 0, burstLimit: burst.limit };
    }

    const today = getTodayKeyUTC();
    const memKey = `AI_CAP:${today}:${anonIdentity}`;

    // Super-lightweight in-memory store (per lambda instance). This is best-effort only.
    // If you want a hard cap, configure SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
    const map = getRateMap();

    const used = map.get(memKey) || 0;
    const limit = 25; // emergency safety cap for misconfigured deployments
    const remaining = Math.max(0, limit - used);

    if (remaining < costUnits) {
// Telemetry (best-effort)
try {
  await logUsageEvent({
    request_id: requestId,
    actor_type: 'user',
    user_id: userId,
    identity_key: userId,
    ip_hash,
    tool: opts?.tool ?? null,
    endpoint: req?.url ?? null,
    provider: 'gemini',
    model: null,
    outcome: 'BLOCKED_QUOTA',
    http_status: 429,
    error_code: 'USAGE_LIMIT_REACHED',
    retryable: true,
    units: costUnits,
    charged_units: 0,
    membership: tier as any,
    user_agent: req?.headers?.['user-agent'] || req?.headers?.['User-Agent'] || null,
    estimated_cost_usd: 0,
  });
} catch {}

      return { ok: false, status: 429, error: 'AI usage limit reached for today (server not configured).', error_code: 'USAGE_LIMIT_REACHED', retryable: true, resetAt: nextResetAtISO(), remaining, limit, burstRemaining: burst.remaining, burstLimit: burst.limit };
    }

    map.set(memKey, used + costUnits);
    return { ok: true, remaining: limit - (used + costUnits), limit, burstRemaining: burst.remaining, burstLimit: burst.limit };
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const auth = admin.auth as unknown as GoTrueClient;

  // Determine user id (preferred) or fall back to IP-based identity
  let userId: string | null = null;
  if (token && token !== 'guest') {
    const { data, error } = await auth.getUser(token);
    if (!error && data?.user?.id) userId = data.user.id;
  }

  const identity_key = userId || ipKey(req);
  const today = usageDayKey();

  // Anonymous / IP-based enforcement: strict caps + burst
  if (!userId) {
    const burst = enforceBurst(identity_key, 8);
    if (!burst.ok) {
      // Telemetry (best-effort)
      await logUsageEvent({
        request_id: requestId,
        actor_type: 'guest',
        user_id: null,
        identity_key: identity_key,
        ip_hash,
        tool: opts?.tool ?? null,
        endpoint: req?.url ?? null,
        outcome: 'BLOCKED_RATE_LIMIT',
        http_status: 429,
        error_code: 'RATE_LIMITED',
        retryable: true,
        units: costUnits,
        charged_units: 0,
        membership: 'free',
        user_agent: req?.headers?.['user-agent'] || req?.headers?.['User-Agent'] || null,
        estimated_cost_usd: 0,
      });
      return { ok: false, status: 429, error: 'Rate limit: too many requests per minute.',
      error_code: 'RATE_LIMITED',
      retryable: true, burstRemaining: 0, burstLimit: burst.limit };
    }

    const key = `anon:${today}:${identity_key}`;
    const map = getRateMap();

    const used = map.get(key) || 0;
    const limit = 15;
    const remaining = Math.max(0, limit - used);

    if (remaining < costUnits) {
      return { ok: false, status: 429, error: 'AI usage limit reached for today.', error_code: 'USAGE_LIMIT_REACHED', retryable: true, resetAt: nextResetAtISO(), remaining, limit, burstRemaining: burst.remaining, burstLimit: burst.limit };
    }
    map.set(key, used + costUnits);
    return {
      ok: true,
      remaining: limit - (used + costUnits),
      limit,
      burstRemaining: burst.remaining,
      burstLimit: burst.limit,
      resetAt: nextResetAtISO(),
    resetTz: RESET_TZ,
      resetHourLocal: RESET_HOUR_LOCAL,
    };
  }

  // Authed user: enforce against public.users table
  const { data: profileData, error: profileErr } = await admin
    .from('users')
    .select('id, email, membership, is_admin, generation_count, last_reset_date, trial_end_date, quota_live_audio_minutes, quota_image_gen, quota_identify, quota_video_uploads, quota_reset_date')
    .eq('id', userId)
    .maybeSingle();

  let profile = profileData;


  // If no profile exists yet, create one (trial by default)
  let membership: Membership = 'trial';
  let generationCount = 0;
  let lastResetDateISO = new Date().toISOString();

  if (profileErr) {
    console.error('Usage lookup error:', profileErr);
  }

  if (profile) {
    membership = (profile.is_admin ? 'admin' : (profile.membership as Membership)) || 'trial';
    generationCount = profile.generation_count ?? 0;
    lastResetDateISO = profile.last_reset_date ? new Date(profile.last_reset_date).toISOString() : lastResetDateISO;
  } else {
    const { error: upsertErr } = await admin.from('users').upsert({
      id: userId,
      membership: 'trial',
      generation_count: 0,
      last_reset_date: new Date().toISOString(),
    });
    if (upsertErr) console.error('Usage profile upsert error:', upsertErr);
  }

  // Daily reset (UTC midnight by default; configurable)
  const lastKey = usageDayKey(new Date(lastResetDateISO));
  if (lastKey !== today) {
    generationCount = 0;
    lastResetDateISO = new Date().toISOString();
    const { error: resetErr } = await admin
      .from('users')
      .update({ generation_count: 0, last_reset_date: lastResetDateISO })
      .eq('id', userId);
    if (resetErr) console.error('Usage reset error:', resetErr);
  }
// Phase 2C-B: tool-level tier + monthly quota enforcement (for high-cost tools)
const toolKey = (typeof opts?.tool === 'string' ? opts.tool.trim() : '') as ToolKey | '';
if (toolKey && (TOOL_POLICIES as any)[toolKey]) {
  const policy = (TOOL_POLICIES as any)[toolKey] as ToolPolicy;

  // Normalize membership tier for comparisons
  const norm = normalizeTier(membership as any);

  // Hard gate by tier (ex: video_rehearsal is pro-only)
  if (tierRank(norm) < tierRank(policy.minTier)) {
    return {
      ok: false,
      status: 402,
      error: 'Upgrade required to use this tool.',
      error_code: 'USAGE_LIMIT_REACHED',
      retryable: false,
      membership: norm as any,
    };
  }

  // Ensure monthly quotas are initialized/reset (best-effort)
  if (profile) {
    profile = await ensureMonthlyQuotas(admin, userId, membership, profile);
  }

  const col = policy.quotaColumn;
  const currentRemaining = Number((profile as any)?.[col] ?? 0);
  const units = Number.isFinite(costUnits) ? Math.max(0, Math.ceil(costUnits)) : 0;

  if (currentRemaining < units) {
    return {
      ok: false,
      status: 402,
      error: 'Monthly quota exceeded for your plan.',
      error_code: 'USAGE_LIMIT_REACHED',
      retryable: false,
      membership: norm as any,
    };
  }

  // Best-effort decrement (Supabase-js does not support atomic arithmetic without RPC).
  // This is sufficient for convention-scale traffic; we can harden with RPC later.
  const nextRemaining = currentRemaining - units;
  const { error: qErr } = await admin
    .from('users')
    .update({ [col]: nextRemaining })
    .eq('id', userId);

  if (qErr) {
    console.error('Quota decrement error:', qErr);
    return { ok: false, status: 503, error: 'Usage tracking unavailable. Try again shortly.', error_code: 'SERVER_ERROR', retryable: true };
  }

  // Reflect new remaining quota in the response (for headers/UI)
  // @ts-ignore
  profile[col] = nextRemaining;
}

  // Burst limit (per minute) — enforce BEFORE reserving daily units
  const tier = normalizeTier(membership as any);
  const burstLimit = BURST_LIMITS[tier] ?? BURST_LIMITS.trial;
  const burst = enforceBurst(userId, burstLimit);
  if (!burst.ok) {
// Telemetry (best-effort)
try {
  await logUsageEvent({
    request_id: requestId,
    actor_type: 'user',
    user_id: userId,
    identity_key: userId,
    ip_hash,
    tool: opts?.tool ?? null,
    endpoint: req?.url ?? null,
    provider: 'gemini',
    model: null,
    outcome: 'BLOCKED_RATE_LIMIT',
    http_status: 429,
    error_code: 'RATE_LIMITED',
    retryable: true,
    units: costUnits,
    charged_units: 0,
    membership: tier as any,
    user_agent: req?.headers?.['user-agent'] || req?.headers?.['User-Agent'] || null,
    estimated_cost_usd: 0,
  });
} catch {}

    return {
      ok: false,
      status: 429,
      error: 'Rate limit: too many requests per minute.',
      error_code: 'RATE_LIMITED',
      retryable: true,
      membership,
      burstRemaining: 0,
      burstLimit,
    resetTz: RESET_TZ,
      resetHourLocal: RESET_HOUR_LOCAL,
    };
  }

  const limit = TIER_LIMITS[tier] ?? TIER_LIMITS.trial;
  const remaining = Math.max(0, limit - generationCount);

  if (remaining < costUnits) {
    return {
      ok: false,
      status: 429,
      error: `Daily AI limit reached for your plan (${tier}).`,
      error_code: 'USAGE_LIMIT_REACHED',
      retryable: true,
      resetAt: nextResetAtISO(),
      remaining,
      limit,
      membership: tier as any,
      burstRemaining: burst.remaining,
      burstLimit,
    resetTz: RESET_TZ,
      resetHourLocal: RESET_HOUR_LOCAL,
    };
  }

  // Reserve units immediately (prevents racing on repeated clicks)
  const newCount = generationCount + costUnits;
  const { error: incErr } = await admin
    .from('users')
    .update({ generation_count: newCount })
    .eq('id', userId);

  if (incErr) {
    console.error('Usage increment error:', incErr);
    // Fail safe: if we can't record usage, block to protect costs.
    // Telemetry (best-effort)
try {
  await logUsageEvent({
    request_id: requestId,
    actor_type: 'user',
    user_id: userId,
    identity_key: userId,
    ip_hash,
    tool: opts?.tool ?? null,
    endpoint: req?.url ?? null,
    provider: 'gemini',
    model: null,
    outcome: 'ERROR_UPSTREAM',
    http_status: 503,
    error_code: 'SERVER_ERROR',
    retryable: true,
    units: costUnits,
    charged_units: 0,
    membership: tier as any,
    user_agent: req?.headers?.['user-agent'] || req?.headers?.['User-Agent'] || null,
    estimated_cost_usd: 0,
  });
} catch {}
return { ok: false, status: 503, error: 'Usage tracking unavailable. Try again shortly.', error_code: 'SERVER_ERROR', retryable: true };

  }

  // Phase 2B: best-effort usage telemetry (never blocks success)
try {
  const actor_type = token ? 'user' : 'guest';
  const identity_key = token ? userId : ipKey(req);
  const outcome = token ? 'SUCCESS_CHARGED' : 'SUCCESS_NOT_CHARGED';

  await logUsageEvent({
    request_id: requestId,
    actor_type,
    user_id: token ? userId : null,
    identity_key,
    ip_hash,
    tool: opts?.tool ?? null,
    endpoint: req?.url ?? null,
    provider: 'gemini',
    model: null,
    outcome,
    http_status: 200,
    error_code: null,
    retryable: false,
    units: costUnits,
    charged_units: token ? costUnits : 0,
    membership: (tier as any) ?? (membership as any) ?? 'free',
    user_agent: req?.headers?.['user-agent'] || req?.headers?.['User-Agent'] || null,
    estimated_cost_usd: 0,
  });
} catch {
  // ignore
}

return {
    ok: true,
    remaining: Math.max(0, limit - newCount),
    limit,
    membership: tier as any,
    burstRemaining: burst.remaining,
    burstLimit,
    resetTz: RESET_TZ,
    resetHourLocal: RESET_HOUR_LOCAL,
  };
  } catch (e: any) {
    // Never allow unexpected errors to crash a serverless function.
    console.error('enforceAiUsage fatal:', e);
    return {
      ok: false,
      status: 500,
      error: 'A server error has occurred',
      error_code: 'SERVER_ERROR',
      retryable: false,
    };
  }
}

// Back-compat alias used by some hardened endpoints.
// enforceAiUsage already performs: quota check + atomic usage increment.
export const incrementAiUsage = enforceAiUsage;

// Back-compat: "live minutes" enforcement used by /api/liveMinutes.
// Currently treated as additional usage units in the same usage bucket.
export async function enforceLiveMinutes(
  req: any,
  minutes: number
): Promise<{
  ok: boolean;
  status?: number;
  error?: string;
  membership?: Membership;
  liveUsed?: number;
  liveLimit?: number;
  liveRemaining?: number;
}> {
  const units = Number.isFinite(minutes) ? Math.max(0, Math.ceil(minutes)) : 0;

  // Enforce + increment in one step (enforceAiUsage already increments on success)
  const enforced = await enforceAiUsage(req, units);

  // Best-effort: report current status (aliases used->liveUsed, etc.)
  const status = await getAiUsageStatus(req).catch(() => null);

  if (!enforced.ok) {
    return {
      ok: false,
      status: enforced.status,
      error: enforced.error,
      membership: enforced.membership,
      liveUsed: status?.used ?? status?.liveUsed,
      liveLimit: status?.limit ?? status?.liveLimit,
      liveRemaining: status?.remaining ?? status?.liveRemaining,
    };
  }

  return {
    ok: true,
    membership: status?.membership ?? enforced.membership,
    liveUsed: status?.used ?? status?.liveUsed,
    liveLimit: status?.limit ?? status?.liveLimit,
    liveRemaining: status?.remaining ?? status?.liveRemaining,
  };
}