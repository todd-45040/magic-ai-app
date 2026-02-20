import { requireSupabaseAuth } from './_auth.js';
// Canonical membership tiers used for usage enforcement.
// Legacy tiers are accepted and normalized server-side.
type Membership = 'free' | 'trial' | 'performer' | 'professional' | 'expired' | 'amateur' | 'semi-pro';

function normalizeTier(m?: string | null): 'free' | 'trial' | 'performer' | 'professional' | 'expired' {
  switch (m) {
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
      return 'free';
  }
}

const TIER_LIMITS: Record<string, number> = {
  free: 10,
  trial: 20,
  performer: 100,
  professional: 10000,
  expired: 0,
  // legacy
  amateur: 100,
  'semi-pro': 100,
};

// Per-minute burst limits (requests per minute), even if daily remaining is high.
const BURST_LIMITS: Record<string, number> = {
  free: 10,
  trial: 20,
  performer: 30,
  professional: 120,
  expired: 0,
  // legacy
  amateur: 30,
  'semi-pro': 30,
};

function getTodayKeyUTC(d = new Date()): string {
  // YYYY-MM-DD in UTC
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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
  membership?: Membership;
  used?: number;
  limit?: number;
  remaining?: number;
  burstLimit?: number;
  burstRemaining?: number;
}> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return { ok: false, status: 503, error: 'Server usage tracking is not configured.' };
  }

  const auth = await requireSupabaseAuth(req);
  if (!auth.ok) {
    // Preserve previous wording for clients.
    const msg = auth.status === 503 ? 'Server usage tracking is not configured.' : auth.error;
    return { ok: false, status: auth.status, error: msg };
  }

  const userId = (auth as any).userId as string;
  const admin = (auth as any).admin as any;
  const { data: profile, error: profileErr } = await admin
    .from('users')
    .select('id, membership, generation_count, last_reset_date')
    .eq('id', userId)
    .maybeSingle();

  if (profileErr) console.error('Usage lookup error:', profileErr);

  let membership: Membership = 'trial';
  let generationCount = 0;
  let lastResetDateISO = new Date().toISOString();

  if (profile) {
    membership = (profile.membership as Membership) || 'trial';
    generationCount = profile.generation_count ?? 0;
    lastResetDateISO = profile.last_reset_date ? new Date(profile.last_reset_date).toISOString() : lastResetDateISO;
  } else {
    // If no profile exists yet, treat as trial until created
    membership = 'trial';
    generationCount = 0;
    lastResetDateISO = new Date().toISOString();
  }

  // Daily reset (UTC)
  const today = getTodayKeyUTC();
  const lastKey = getTodayKeyUTC(new Date(lastResetDateISO));
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

  return { ok: true, membership: tier as any, used: generationCount, limit, remaining, burstLimit, burstRemaining };
}

export async function enforceAiUsage(req: any, costUnits: number): Promise<{
  ok: boolean;
  status?: number;
  error?: string;
  remaining?: number;
  limit?: number;
  membership?: Membership;
  burstRemaining?: number;
  burstLimit?: number;
}> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // If server isn't configured for Supabase admin, fall back to a very small per-IP cap (fails safe).
  if (!supabaseUrl || !serviceKey) {
    const identity = ipKey(req);

    // Burst (per-minute) safety cap even when misconfigured
    const burst = enforceBurst(identity, 10);
    if (!burst.ok) {
      return { ok: false, status: 429, error: 'Rate limit: too many requests per minute.', burstRemaining: 0, burstLimit: burst.limit };
    }

    const today = getTodayKeyUTC();
    const memKey = `AI_CAP:${today}:${identity}`;

    // Super-lightweight in-memory store (per lambda instance). This is best-effort only.
    // If you want a hard cap, configure SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
    const map = getRateMap();

    const used = map.get(memKey) || 0;
    const limit = 25; // emergency safety cap for misconfigured deployments
    const remaining = Math.max(0, limit - used);

    if (remaining < costUnits) {
      return { ok: false, status: 429, error: 'AI usage limit reached for today (server not configured).', remaining, limit, burstRemaining: burst.remaining, burstLimit: burst.limit };
    }

    map.set(memKey, used + costUnits);
    return { ok: true, remaining: limit - (used + costUnits), limit, burstRemaining: burst.remaining, burstLimit: burst.limit };
  }

  const auth = await requireSupabaseAuth(req);
  if (!auth.ok) {
    return { ok: false, status: auth.status, error: auth.error };
  }

  const userId = (auth as any).userId as string;
  const admin = (auth as any).admin as any;
  const today = getTodayKeyUTC();


  // Authed user: enforce against public.users table
  const { data: profile, error: profileErr } = await admin
    .from('users')
    .select('id, membership, generation_count, last_reset_date')
    .eq('id', userId)
    .maybeSingle();

  // If no profile exists yet, create one (trial by default)
  let membership: Membership = 'trial';
  let generationCount = 0;
  let lastResetDateISO = new Date().toISOString();

  if (profileErr) {
    console.error('Usage lookup error:', profileErr);
  }

  if (profile) {
    membership = (profile.membership as Membership) || 'trial';
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

  // Daily reset (UTC)
  const lastKey = getTodayKeyUTC(new Date(lastResetDateISO));
  if (lastKey !== today) {
    generationCount = 0;
    lastResetDateISO = new Date().toISOString();
    const { error: resetErr } = await admin
      .from('users')
      .update({ generation_count: 0, last_reset_date: lastResetDateISO })
      .eq('id', userId);
    if (resetErr) console.error('Usage reset error:', resetErr);
  }

  // Burst limit (per minute) — enforce BEFORE reserving daily units
  const tier = normalizeTier(membership as any);
  const burstLimit = BURST_LIMITS[tier] ?? BURST_LIMITS.trial;
  const burst = enforceBurst(userId, burstLimit);
  if (!burst.ok) {
    return {
      ok: false,
      status: 429,
      error: 'Rate limit: too many requests per minute.',
      membership,
      burstRemaining: 0,
      burstLimit,
    };
  }

  const limit = TIER_LIMITS[tier] ?? TIER_LIMITS.trial;
  const remaining = Math.max(0, limit - generationCount);

  if (remaining < costUnits) {
    return {
      ok: false,
      status: 429,
      error: `Daily AI limit reached for your plan (${tier}).`,
      remaining,
      limit,
      membership: tier as any,
      burstRemaining: burst.remaining,
      burstLimit,
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
    return { ok: false, status: 503, error: 'Usage tracking unavailable. Try again shortly.' };
  }

  return {
    ok: true,
    remaining: Math.max(0, limit - newCount),
    limit,
    membership: tier as any,
    burstRemaining: burst.remaining,
    burstLimit,
  };
}
