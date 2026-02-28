import { requireSupabaseAuth } from './_auth.js';

const ALLOWED_WINDOWS = [1, 7, 30, 90] as const;
type AllowedWindowDays = typeof ALLOWED_WINDOWS[number];

function asDays(raw: any, fallback: AllowedWindowDays = 7): AllowedWindowDays {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  const v = Math.round(n);
  return (ALLOWED_WINDOWS as readonly number[]).includes(v) ? (v as AllowedWindowDays) : fallback;
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function percentile(values: number[], p: number): number | null {

  if (!values || values.length === 0) return null;
  const arr = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (arr.length === 0) return null;
  const idx = (arr.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return arr[lo];
  const w = idx - lo;
  return arr[lo] * (1 - w) + arr[hi] * w;
}

function median(values: number[]): number | null {
  return percentile(values, 0.5);
}

// Define "core tools" for activation (first value). Keep this list small + meaningful.
const CORE_TOOLS = [
  'effect_engine',
  'director_mode',
  'live_rehearsal',
  'live_minutes',
  'generate_patter',
  'magic_wire',
  'visual_brainstorm',
  'assistant_studio',
];

export default async function handler(req: any, res: any) {
  try {
    const auth = await requireSupabaseAuth(req);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

    const { admin, userId } = auth as any;

    // Admin-only gate
    const { data: me, error: meErr } = await admin
      .from('users')
      .select('id,is_admin')
      .eq('id', userId)
      .maybeSingle();

    if (meErr) return res.status(500).json({ ok: false, error: 'Admin check failed', details: meErr });
    if (!me?.is_admin) return res.status(403).json({ ok: false, error: 'Forbidden' });

    const days = asDays(req?.query?.days ?? 7, 7);
    const sinceIso = isoDaysAgo(days);
    const warnings: string[] = [];

    // --- New users (created in window)
    // Prefer an exact count() for new-user total, but fall back to scan length if count fails
    // (some deployments may restrict count/head behavior or return errors for large tables).
    // --- New users (use Auth as canonical source for created_at + email)
// NOTE: public.users may not include created_at in some deployments.
let newUsersCount: number | null = null;
const newUserCreatedAt = new Map<string, string>();

try {
  const perPage = 1000;
  let page = 1;
  let fetched = 0;
  const maxScan = 20000; // safety cap
  while (fetched < maxScan) {
    let r: any;
    try {
      r = await admin.auth.admin.listUsers({ page, perPage });
    } catch {
      r = await admin.auth.admin.listUsers();
    }
    const users = (r?.data?.users || []) as any[];
    if (!users || users.length === 0) break;

    for (const u of users) {
      const id = u?.id ? String(u.id) : null;
      const created = u?.created_at ? String(u.created_at) : null;
      if (!id || !created) continue;
      if (created >= sinceIso) newUserCreatedAt.set(id, created);
    }

    fetched += users.length;
    page += 1;

    // If the API provides total, we can stop early
    const total = r?.data?.total;
    if (Number.isFinite(total) && fetched >= Number(total)) break;
    if (users.length < perPage) break;
  }

  newUsersCount = newUserCreatedAt.size;
} catch (e) {
  // Do not fail the dashboard if auth listing is unavailable.
  newUsersCount = 0;
}

// --- Raw events in window (for active users, cost, success/error, latency, tool aggregation)
    const { data: events, error: evErr } = await admin
      .from('ai_usage_events')
      .select('request_id,user_id,tool,endpoint,provider,model,outcome,http_status,error_code,latency_ms,estimated_cost_usd,occurred_at')
      .gte('occurred_at', sinceIso)
      .order('occurred_at', { ascending: false })
      .limit(200000);

    if (evErr) return res.status(500).json({ ok: false, error: 'Telemetry scan failed', details: evErr });

    const evs = (events || []) as any[];

    const activeUserSet = new Set<string>();
    const toolAgg: Record<string, { events: number; cost: number; users: Set<string> }> = {};
    const latency: number[] = [];

    // Unit economics aggregations
    const userAgg: Record<string, { cost: number; events: number; success_sessions: number; latencies: number[] }> = {};
    const successRequestIds = new Set<string>();

// Reliability aggregations (per-tool / per-provider)
const toolReliability: Record<
  string,
  {
    total: number;
    success: number;
    error: number;
    timeout: number;
    rate_limit: number;
    quota: number;
    unauthorized: number;
    latencies: number[];
  }
> = {};

const providerReliability: Record<
  string,
  {
    total: number;
    success: number;
    error: number;
    timeout: number;
    rate_limit: number;
    quota: number;
    unauthorized: number;
    latencies: number[];
  }
> = {};

const recentFailures: any[] = [];

function ensureRel(map: any, key: string) {
  if (!map[key]) {
    map[key] = {
      total: 0,
      success: 0,
      error: 0,
      timeout: 0,
      rate_limit: 0,
      quota: 0,
      unauthorized: 0,
      latencies: [],
    };
  }
  return map[key];
}

function classifyEvent(e: any): {
  isSuccess: boolean;
  isRateLimit: boolean;
  isQuota: boolean;
  isUnauthorized: boolean;
  isTimeout: boolean;
  isError: boolean;
} {
  const outcome = String(e?.outcome || '');
  const http = Number(e?.http_status || 0);
  const code = String(e?.error_code || '');

  const isRateLimit = outcome === 'BLOCKED_RATE_LIMIT' || http === 429 || code === 'RATE_LIMITED';
  const isQuota = outcome === 'BLOCKED_QUOTA' || code === 'USAGE_LIMIT_REACHED' || code === 'QUOTA_EXCEEDED';
  const isUnauthorized = outcome === 'UNAUTHORIZED' || http === 401 || http === 403 || code === 'UNAUTHORIZED';
  const isTimeout = code === 'TIMEOUT' || http === 504 || http === 408;

  const isSuccess = outcome === 'SUCCESS_CHARGED' || outcome === 'SUCCESS_NOT_CHARGED' || outcome === 'ALLOWED';
  const isError = !isSuccess;

  return { isSuccess, isRateLimit, isQuota, isUnauthorized, isTimeout, isError };
}

    // Outcome buckets
    let totalEvents = 0;
    let successEvents = 0;
    let errorEvents = 0;

    let rateLimitEvents = 0;
    let quotaEvents = 0;
    let unauthorizedEvents = 0;
    let timeoutEvents = 0;
    let upstreamErrorEvents = 0;

    let aiCostUSD = 0;

    
    for (const e of evs) {
      totalEvents += 1;

      const uid = e?.user_id ? String(e.user_id) : null;
      if (uid) activeUserSet.add(uid);
      if (uid && !userAgg[uid]) userAgg[uid] = { cost: 0, events: 0, success_sessions: 0, latencies: [] };
      if (uid) userAgg[uid].events += 1;

      const tool = String(e?.tool || 'unknown');
      if (!toolAgg[tool]) toolAgg[tool] = { events: 0, cost: 0, users: new Set<string>() };
      toolAgg[tool].events += 1;
      if (uid) toolAgg[tool].users.add(uid);

      const c = Number(e?.estimated_cost_usd || 0);
      if (Number.isFinite(c)) {
        aiCostUSD += c;
        toolAgg[tool].cost += c;
        if (uid) userAgg[uid].cost += c;
      }

      const l = Number(e?.latency_ms);
      if (Number.isFinite(l) && l >= 0) {
        latency.push(l);
        if (uid) userAgg[uid].latencies.push(l);
      }

      const cls = classifyEvent(e);

if (cls.isRateLimit) rateLimitEvents += 1;
if (cls.isQuota) quotaEvents += 1;
if (cls.isUnauthorized) unauthorizedEvents += 1;
if (cls.isTimeout) timeoutEvents += 1;

if (cls.isSuccess) {
  successEvents += 1;
  if (uid) userAgg[uid].success_sessions += 1;
  const rid = e?.request_id ? String(e.request_id) : null;
  if (rid) successRequestIds.add(rid);
} else {
  errorEvents += 1;
  if (String(e?.outcome || '') === 'ERROR_UPSTREAM') upstreamErrorEvents += 1;
}

// Per-tool / per-provider reliability stats
const relTool = ensureRel(toolReliability, tool);
relTool.total += 1;
if (cls.isSuccess) relTool.success += 1;
if (cls.isError) relTool.error += 1;
if (cls.isTimeout) relTool.timeout += 1;
if (cls.isRateLimit) relTool.rate_limit += 1;
if (cls.isQuota) relTool.quota += 1;
if (cls.isUnauthorized) relTool.unauthorized += 1;
if (Number.isFinite(l) && l >= 0) relTool.latencies.push(l);

const provider = String(e?.provider || 'unknown');
const relProv = ensureRel(providerReliability, provider);
relProv.total += 1;
if (cls.isSuccess) relProv.success += 1;
if (cls.isError) relProv.error += 1;
if (cls.isTimeout) relProv.timeout += 1;
if (cls.isRateLimit) relProv.rate_limit += 1;
if (cls.isQuota) relProv.quota += 1;
if (cls.isUnauthorized) relProv.unauthorized += 1;
if (Number.isFinite(l) && l >= 0) relProv.latencies.push(l);

// Recent failures feed (bounded)
if (!cls.isSuccess && recentFailures.length < 25) {
  recentFailures.push({
    occurred_at: e?.occurred_at ?? null,
    request_id: e?.request_id ?? null,
    user_id: e?.user_id ?? null,
    tool,
    endpoint: e?.endpoint ?? null,
    provider: e?.provider ?? null,
    model: e?.model ?? null,
    outcome: e?.outcome ?? null,
    error_code: e?.error_code ?? null,
    http_status: e?.http_status ?? null,
    latency_ms: e?.latency_ms ?? null,
  });
}
    }

    // --- Activated users: first core-tool use within 24h of signup (among new users)
    let activatedUsers = 0;
    let medianTtfvMs: number | null = null;
    let ttfvSampleSize = 0;
    let returningUsersWau7 = 0;
    let signupTrend30d: { date: string; new_users: number }[] = [];
    const activatedSetGlobal = new Set<string>();
    if (newUserCreatedAt.size > 0) {
      const ids = Array.from(newUserCreatedAt.keys());
      const batchSize = 500; // Supabase "in" works best with modest sizes
      const activatedSet = activatedSetGlobal;
      const firstCoreEventAt = new Map<string, string>();

      for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize);

        const { data: coreEvents, error: coreErr } = await admin
          .from('ai_usage_events')
          .select('user_id,occurred_at,tool')
          .in('user_id', batch)
          .in('tool', CORE_TOOLS)
          .gte('occurred_at', sinceIso)
          .order('occurred_at', { ascending: true })
          .limit(200000);

        if (coreErr) {
          // Activation is useful but should not break admin dashboard
          continue;
        }

        for (const ev of (coreEvents || []) as any[]) {
          const uid = ev?.user_id ? String(ev.user_id) : null;
          const occ = ev?.occurred_at ? String(ev.occurred_at) : null;
          if (!uid || !occ) continue;
          if (!firstCoreEventAt.has(uid)) firstCoreEventAt.set(uid, occ);
          if (activatedSet.has(uid)) continue;

          const createdAt = newUserCreatedAt.get(uid);
          if (!createdAt) continue;

          const createdMs = Date.parse(createdAt);
          const occMs = Date.parse(occ);
          if (!Number.isFinite(createdMs) || !Number.isFinite(occMs)) continue;

          if (occMs <= createdMs + 24 * 60 * 60 * 1000) {
            activatedSet.add(uid);
          }
      // TTFV: created_at -> first CORE_TOOL event (for new users in window)
      const ttfvArr: number[] = [];
      for (const [uid, occ] of firstCoreEventAt.entries()) {
        const createdAt = newUserCreatedAt.get(uid);
        if (!createdAt) continue;
        const createdMs = Date.parse(createdAt);
        const occMs = Date.parse(occ);
        if (!Number.isFinite(createdMs) || !Number.isFinite(occMs)) continue;
        const delta = occMs - createdMs;
        if (Number.isFinite(delta) && delta >= 0) ttfvArr.push(delta);
      }
      ttfvSampleSize = ttfvArr.length;
      medianTtfvMs = median(ttfvArr);
        }
      }

      activatedUsers = activatedSet.size;
    }

    const newUsersN = Number(newUsersCount || 0);
    const activeUsers = activeUserSet.size;

    const activationRate = newUsersN > 0 ? activatedUsers / newUsersN : 0;
    const successRate = totalEvents > 0 ? successEvents / totalEvents : 0;
    const errorRate = totalEvents > 0 ? errorEvents / totalEvents : 0;

    const p95LatencyMs = percentile(latency, 0.95);

    // --- Phase 5: Unit economics + cost controls
    const successfulSessions = successRequestIds.size > 0 ? successRequestIds.size : successEvents;
    const costPerActiveUser = activeUsers > 0 ? aiCostUSD / activeUsers : null;
    const costPerActivatedUser = activatedUsers > 0 ? aiCostUSD / activatedUsers : null;
    const costPerToolSession = successfulSessions > 0 ? aiCostUSD / successfulSessions : null;

    // Top spenders (in selected window)
    let topSpenders: any[] = [];
    try {
      const rows = Object.entries(userAgg)
        .map(([user_id, v]) => ({
          user_id,
          total_cost_usd: v.cost,
          events: v.events,
          success_sessions: v.success_sessions,
          avg_latency_ms: v.latencies.length ? (v.latencies.reduce((a, b) => a + b, 0) / v.latencies.length) : null,
        }))
        .sort((a, b) => (b.total_cost_usd || 0) - (a.total_cost_usd || 0))
        .slice(0, 10);

      const ids = rows.map((r) => r.user_id);
      const emailMap = new Map<string, string>();
      if (ids.length) {
        const batchSize = 500;
        for (let i = 0; i < ids.length; i += batchSize) {
          const batch = ids.slice(i, i + batchSize);
          const { data: urows, error: uerr } = await admin.from('users').select('id,email').in('id', batch).limit(50000);
          if (uerr) continue;
          for (const u of (urows || []) as any[]) {
            if (u?.id && u?.email) emailMap.set(String(u.id), String(u.email));
          }
        }
      }

      topSpenders = rows.map((r) => ({ ...r, email: emailMap.get(r.user_id) || null }));
    } catch (e) {
      topSpenders = [];
    }

    // Spend trend (last 30d, total cost per day)
    let spendTrend30d: { date: string; total_cost_usd: number }[] = [];
    // Top spenders trend (last 30d, top 3 users by cost)
    let topSpendersTrend30d:
      | { user_id: string; email: string | null; total_cost_usd_30d: number; series: { date: string; cost_usd: number }[] }[]
      | [] = [];

    try {
      const since30Iso = isoDaysAgo(30);
      const { data: ev30c, error: ev30cErr } = await admin
        .from('ai_usage_events')
        .select('user_id,estimated_cost_usd,occurred_at')
        .gte('occurred_at', since30Iso)
        .order('occurred_at', { ascending: false })
        .limit(200000);

      if (!ev30cErr) {
        const totalsByDay: Record<string, number> = {};
        const userDayCost: Record<string, Record<string, number>> = {};
        const userTotal30: Record<string, number> = {};

        for (const e of (ev30c || []) as any[]) {
          const day = e?.occurred_at ? String(e.occurred_at).slice(0, 10) : null;
          const uid = e?.user_id ? String(e.user_id) : null;
          if (!day) continue;
          const c = Number(e?.estimated_cost_usd || 0);
          const cv = Number.isFinite(c) ? c : 0;

          totalsByDay[day] = (totalsByDay[day] || 0) + cv;

          if (uid) {
            if (!userDayCost[uid]) userDayCost[uid] = {};
            userDayCost[uid][day] = (userDayCost[uid][day] || 0) + cv;
            userTotal30[uid] = (userTotal30[uid] || 0) + cv;
          }
        }

        const today = new Date();
        const daysBack = 30;
        const series: { date: string; total_cost_usd: number }[] = [];
        for (let i = daysBack - 1; i >= 0; i -= 1) {
          const dt = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
          dt.setUTCDate(dt.getUTCDate() - i);
          const key = dt.toISOString().slice(0, 10);
          series.push({ date: key, total_cost_usd: totalsByDay[key] || 0 });
        }
        spendTrend30d = series;

        const topIds = Object.entries(userTotal30)
          .sort((a, b) => (b[1] || 0) - (a[1] || 0))
          .slice(0, 3)
          .map(([uid]) => uid);

        const emailMap = new Map<string, string>();
        if (topIds.length) {
          const { data: ur, error: urErr } = await admin.from('users').select('id,email').in('id', topIds).limit(50000);
          if (!urErr) {
            for (const u of (ur || []) as any[]) {
              if (u?.id && u?.email) emailMap.set(String(u.id), String(u.email));
            }
          }
        }

        topSpendersTrend30d = topIds.map((uid) => {
          const s: { date: string; cost_usd: number }[] = [];
          for (const d of series.map((x) => x.date)) {
            const v = userDayCost?.[uid]?.[d] || 0;
            s.push({ date: d, cost_usd: v });
          }
          return {
            user_id: uid,
            email: emailMap.get(uid) || null,
            total_cost_usd_30d: userTotal30[uid] || 0,
            series: s,
          };
        });
      }
    } catch (e) {
      spendTrend30d = [];
      topSpendersTrend30d = [];
    }

    // Cost anomalies (richer rules)
    let costAnomalies: any[] = [];
    try {
      const since8Iso = isoDaysAgo(8);
      const { data: ev8, error: ev8Err } = await admin
        .from('ai_usage_events')
        .select('user_id,tool,estimated_cost_usd,occurred_at')
        .gte('occurred_at', since8Iso)
        .order('occurred_at', { ascending: false })
        .limit(200000);

      if (!ev8Err) {
        const todayKey = new Date().toISOString().slice(0, 10);

        const dailyTotals: Record<string, number> = {};
        const toolDaily: Record<string, Record<string, number>> = {};

        for (const e of (ev8 || []) as any[]) {
          const day = e?.occurred_at ? String(e.occurred_at).slice(0, 10) : null;
          const tool = String(e?.tool || 'unknown');
          if (!day) continue;
          const c = Number(e?.estimated_cost_usd || 0);
          const cv = Number.isFinite(c) ? c : 0;

          dailyTotals[day] = (dailyTotals[day] || 0) + cv;

          if (!toolDaily[tool]) toolDaily[tool] = {};
          toolDaily[tool][day] = (toolDaily[tool][day] || 0) + cv;
        }

        const todayCost = dailyTotals[todayKey] || 0;

        const baselineDays = Object.keys(dailyTotals)
          .filter((d) => d !== todayKey)
          .sort()
          .slice(-7);

        const baselineAvg =
          baselineDays.length > 0
            ? baselineDays.reduce((sum, d) => sum + (dailyTotals[d] || 0), 0) / baselineDays.length
            : 0;

        if (baselineAvg > 0 && todayCost > baselineAvg * 2.5) {
          costAnomalies.push({
            type: 'daily_spike',
            entity: 'all',
            current_value: todayCost,
            baseline: baselineAvg,
            multiplier: todayCost / baselineAvg,
          });
        }

        // Tool spikes
        for (const [tool, byDay] of Object.entries(toolDaily)) {
          const tToday = byDay[todayKey] || 0;
          if (tToday <= 0) continue;

          const tBaselineAvg =
            baselineDays.length > 0
              ? baselineDays.reduce((sum, d) => sum + (byDay[d] || 0), 0) / baselineDays.length
              : 0;

          if (tBaselineAvg > 0 && tToday > tBaselineAvg * 3) {
            costAnomalies.push({
              type: 'tool_spike',
              entity: tool,
              current_value: tToday,
              baseline: tBaselineAvg,
              multiplier: tToday / tBaselineAvg,
            });
          }
        }
      }

      // User outliers in selected window (p95)
      const userCosts = Object.values(userAgg).map((v) => Number(v?.cost || 0));
      const p95User = percentile(userCosts, 0.95);
      if (p95User != null && p95User > 0) {
        const outliers = Object.entries(userAgg)
          .map(([user_id, v]) => ({ user_id, total_cost_usd: Number(v?.cost || 0) }))
          .filter((r) => r.total_cost_usd > p95User)
          .sort((a, b) => b.total_cost_usd - a.total_cost_usd)
          .slice(0, 5);

        if (outliers.length > 0) {
          const ids = outliers.map((o) => o.user_id);
          const emailMap = new Map<string, string>();
          const { data: ur, error: urErr } = await admin.from('users').select('id,email').in('id', ids).limit(50000);
          if (!urErr) {
            for (const u of (ur || []) as any[]) {
              if (u?.id && u?.email) emailMap.set(String(u.id), String(u.email));
            }
          }

          for (const o of outliers) {
            costAnomalies.push({
              type: 'user_outlier',
              entity: emailMap.get(o.user_id) || o.user_id,
              current_value: o.total_cost_usd,
              baseline: p95User,
              multiplier: o.total_cost_usd / p95User,
            });
          }
        }
      }

      // Sort anomalies by multiplier desc and keep top 10
      costAnomalies = costAnomalies
        .filter((a) => Number.isFinite(Number(a?.multiplier)))
        .sort((a, b) => Number(b.multiplier) - Number(a.multiplier))
        .slice(0, 10);
    } catch (e) {
      costAnomalies = [];
    }

    // --- Returning users (WAU = unique users with ≥1 event in last 7d)
    try {
      const since7Iso = isoDaysAgo(7);
      const { data: ev7, error: ev7Err } = await admin
        .from('ai_usage_events')
        .select('user_id,occurred_at')
        .gte('occurred_at', since7Iso)
        .order('occurred_at', { ascending: false })
        .limit(200000);
      if (!ev7Err) {
        const s = new Set<string>();
        for (const e of (ev7 || []) as any[]) {
          const uid = e?.user_id ? String(e.user_id) : null;
          if (uid) s.add(uid);
        }
        returningUsersWau7 = s.size;
      }
    } catch (e) {
      // non-fatal
    }

    // --- Signup trend (last 30d, by day)
    try {
      const since30Iso = isoDaysAgo(30);
      const { data: u30, error: u30Err } = await admin
        .from('users')
        .select('created_at')
        .gte('created_at', since30Iso)
        .order('created_at', { ascending: true })
        .limit(200000);
      if (!u30Err) {
        const counts: Record<string, number> = {};
        for (const r of (u30 || []) as any[]) {
          const d = r?.created_at ? String(r.created_at).slice(0, 10) : null;
          if (!d) continue;
          counts[d] = (counts[d] || 0) + 1;
        }
        const today = new Date();
        const daysBack = 30;
        const series: { date: string; new_users: number }[] = [];
        for (let i = daysBack - 1; i >= 0; i -= 1) {
          const dt = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
          dt.setUTCDate(dt.getUTCDate() - i);
          const key = dt.toISOString().slice(0, 10);
          series.push({ date: key, new_users: counts[key] || 0 });
        }
        signupTrend30d = series;
      }
    } catch (e) {
      // non-fatal
    }

    
    // --- Engagement metrics (DAU / WAU / MAU + stickiness, tool adoption, returning trend, week-1 retention)
    let dau = 0;
    let wau = 0;
    let mau = 0;
    let stickinessDauMau: number | null = null;

    let toolAdoption: { tool: string; adoption_rate: number; unique_users: number; events: number; cost_usd: number }[] = [];
    let returningTrend30d: { date: string; returning_users: number }[] = [];

    let mauTrendDaily30: { date: string; mau_rolling_30d: number }[] = [];
    let mauTrendWeekly12: { week_end: string; mau_rolling_30d: number }[] = [];
    let wauTrendWeekly12: { week_end: string; wau_7d: number }[] = [];

    let toolAdoptionTrend30d: {
      days: string[];
      daily_active_users: number[];
      tools: { tool: string; adoption_rates: number[]; unique_users: number[] }[];
    } | null = null;

    let week1CohortSize = 0;
    let week1Retained = 0;
    let week1RetentionRate: number | null = null;

    // Phase 4.5 — Founder vs non-founder Week-1 retention split (7–14d cohort)
    let week1FoundersCohortSize = 0;
    let week1FoundersRetained = 0;
    let week1FoundersRetentionRate: number | null = null;

    let week1NonFoundersCohortSize = 0;
    let week1NonFoundersRetained = 0;
    let week1NonFoundersRetentionRate: number | null = null;

    // Phase 4.5 — WAU/MAU stickiness split (Founders vs non-founders)
    let foundersWau7 = 0;
    let foundersMau30 = 0;
    let nonFoundersWau7 = 0;
    let nonFoundersMau30 = 0;
    let foundersStickinessWauMau: number | null = null;
    let nonFoundersStickinessWauMau: number | null = null;
    let stickinessDeltaFoundersMinusNon: number | null = null;

    const toDayKeyUTC = (iso: string) => String(iso || '').slice(0, 10);
    const dayStartUTCms = (dayKey: string) => Date.parse(`${dayKey}T00:00:00.000Z`);

    // Tool adoption (% of active users in selected window using each tool)
    try {
      const activeN = activeUserSet.size;
      if (activeN > 0) {
        toolAdoption = Object.entries(toolAgg)
          .map(([tool, v]) => ({
            tool,
            adoption_rate: v.users.size / activeN,
            unique_users: v.users.size,
            events: v.events,
            cost_usd: v.cost,
          }))
          .sort((a, b) => b.adoption_rate - a.adoption_rate)
          .slice(0, 20);
      }
    } catch (e) {
      // non-fatal
    }

    // DAU / WAU / MAU (fixed windows: 1d, 7d, 30d)
    const uniqueUserSetSince = async (d: number) => {
      const since = isoDaysAgo(d);
      const { data, error } = await admin
        .from('ai_usage_events')
        .select('user_id,occurred_at')
        .gte('occurred_at', since)
        .order('occurred_at', { ascending: false })
        .limit(200000);
      if (error) return null;
      const s = new Set<string>();
      for (const r of (data || []) as any[]) {
        const uid = r?.user_id ? String(r.user_id) : null;
        if (uid) s.add(uid);
      }
      return s;
    };

    const uniqueUsersSince = async (d: number) => {
      const s = await uniqueUserSetSince(d);
      return s ? s.size : null;
    };

    try {
      const [s1, s7, s30] = await Promise.all([uniqueUserSetSince(1), uniqueUserSetSince(7), uniqueUserSetSince(30)]);
      const d1 = s1 ? s1.size : 0;
      const d7 = s7 ? s7.size : 0;
      const d30 = s30 ? s30.size : 0;

      dau = Number(d1 || 0);
      wau = Number(d7 || 0);
      mau = Number(d30 || 0);
      stickinessDauMau = mau > 0 ? dau / mau : null;

      // Phase 4.5 — WAU/MAU stickiness delta (Founders vs Non-founders)
      const unionIds = new Set<string>();
      for (const uid of (s7 ? Array.from(s7) : [])) unionIds.add(String(uid));
      for (const uid of (s30 ? Array.from(s30) : [])) unionIds.add(String(uid));

      if (unionIds.size > 0) {
        const ids = Array.from(unionIds);
        const founderFlags = new Map<string, boolean>();
        const batchSize = 500;
        for (let i = 0; i < ids.length; i += batchSize) {
          const batch = ids.slice(i, i + batchSize);
          const { data: urows, error: uerr } = await admin.from('users').select('id,founding_circle_member').in('id', batch).limit(50000);
          if (uerr) continue;
          for (const u of (urows || []) as any[]) {
            const id = u?.id ? String(u.id) : null;
            if (!id) continue;
            founderFlags.set(id, !!u?.founding_circle_member);
          }
        }

        for (const uid of (s7 ? Array.from(s7) : [])) {
          const isFounder = founderFlags.get(String(uid)) === true;
          if (isFounder) foundersWau7 += 1;
          else nonFoundersWau7 += 1;
        }

        for (const uid of (s30 ? Array.from(s30) : [])) {
          const isFounder = founderFlags.get(String(uid)) === true;
          if (isFounder) foundersMau30 += 1;
          else nonFoundersMau30 += 1;
        }

        foundersStickinessWauMau = foundersMau30 > 0 ? foundersWau7 / foundersMau30 : null;
        nonFoundersStickinessWauMau = nonFoundersMau30 > 0 ? nonFoundersWau7 / nonFoundersMau30 : null;
        stickinessDeltaFoundersMinusNon =
          foundersStickinessWauMau != null && nonFoundersStickinessWauMau != null ? foundersStickinessWauMau - nonFoundersStickinessWauMau : null;
      }
    } catch (e) {
      // non-fatal
    }

    // Returning users trend (last 30d): users with events on day D AND created_at < day start of D
    try {
      const since30Iso = isoDaysAgo(30);
      const { data: ev30, error: ev30Err } = await admin
        .from('ai_usage_events')
        .select('user_id,occurred_at')
        .gte('occurred_at', since30Iso)
        .order('occurred_at', { ascending: false })
        .limit(200000);

      if (!ev30Err) {
        const events30 = (ev30 || []) as any[];

        const idsSet = new Set<string>();
        for (const e of events30) {
          const uid = e?.user_id ? String(e.user_id) : null;
          if (uid) idsSet.add(uid);
        }
        const ids = Array.from(idsSet);
        const createdMap = new Map<string, string>();

        // Fetch created_at for users seen in last 30d events (batch)
        const batchSize = 500;
        for (let i = 0; i < ids.length; i += batchSize) {
          const batch = ids.slice(i, i + batchSize);
          const { data: ur, error: urErr } = await admin.from('users').select('id,created_at,founding_circle_member').in('id', batch).limit(50000);
          if (urErr) continue;
          for (const u of (ur || []) as any[]) {
            if (u?.id && u?.created_at) createdMap.set(String(u.id), String(u.created_at));
          }
        }

        // Build daily sets
        const daily: Record<string, Set<string>> = {};
        for (const e of events30) {
          const uid = e?.user_id ? String(e.user_id) : null;
          const occ = e?.occurred_at ? String(e.occurred_at) : null;
          if (!uid || !occ) continue;
          const dayKey = toDayKeyUTC(occ);
          if (!daily[dayKey]) daily[dayKey] = new Set<string>();
          daily[dayKey].add(uid);
        }

        // Turn into series (fill missing)
        const today = new Date();
        const series: { date: string; returning_users: number }[] = [];
        for (let i = 29; i >= 0; i -= 1) {
          const dt = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
          dt.setUTCDate(dt.getUTCDate() - i);
          const key = dt.toISOString().slice(0, 10);
          const dayStart = dayStartUTCms(key);

          let count = 0;
          const set = daily[key] || new Set<string>();
          for (const uid of set) {
            const createdAt = createdMap.get(uid);
            if (!createdAt) continue;
            const createdMs = Date.parse(createdAt);
            if (!Number.isFinite(createdMs) || !Number.isFinite(dayStart)) continue;
            if (createdMs < dayStart) count += 1;
          }

          series.push({ date: key, returning_users: count });
        }
        returningTrend30d = series;
      }
    } catch (e) {
      // non-fatal
    }

    // Week-1 retention (lightweight):

    // True MAU trend: rolling 30-day active users (daily last 30d, weekly last 12w).
    // Tool adoption over time: daily % of active users using each tool (last 30d) for top tools.
    try {
      const lookbackDays = 120; // enough for 12 weekly points + rolling 30d
      const sinceIsoLong = isoDaysAgo(lookbackDays);

      const { data: evLong, error: evLongErr } = await admin
        .from('ai_usage_events')
        .select('user_id,tool,occurred_at')
        .gte('occurred_at', sinceIsoLong)
        .order('occurred_at', { ascending: false })
        .limit(200000);

      if (!evLongErr) {
        const today = new Date();
        const dayKeys: string[] = [];
        // Build ordered day keys oldest->newest
        for (let i = lookbackDays - 1; i >= 0; i -= 1) {
          const dt = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
          dt.setUTCDate(dt.getUTCDate() - i);
          dayKeys.push(dt.toISOString().slice(0, 10));
        }

        const dailyUsers: Record<string, Set<string>> = {};
        const dailyToolUsers: Record<string, Record<string, Set<string>>> = {}; // tool -> dayKey -> Set(user)

        for (const e of (evLong || []) as any[]) {
          const uid = e?.user_id ? String(e.user_id) : null;
          const occ = e?.occurred_at ? String(e.occurred_at) : null;
          if (!uid || !occ) continue;
          const dayKey = toDayKeyUTC(occ);
          if (!dailyUsers[dayKey]) dailyUsers[dayKey] = new Set<string>();
          dailyUsers[dayKey].add(uid);

          const tool = String(e?.tool || 'unknown');
          if (!dailyToolUsers[tool]) dailyToolUsers[tool] = {};
          if (!dailyToolUsers[tool][dayKey]) dailyToolUsers[tool][dayKey] = new Set<string>();
          dailyToolUsers[tool][dayKey].add(uid);
        }

        // Rolling MAU (30d) for each day in the lookback range (sliding window)
        const roll: number[] = [];
        const counts = new Map<string, number>();

        const addDay = (day: string) => {
          const set = dailyUsers[day];
          if (!set) return;
          for (const uid of set) counts.set(uid, (counts.get(uid) || 0) + 1);
        };
        const removeDay = (day: string) => {
          const set = dailyUsers[day];
          if (!set) return;
          for (const uid of set) {
            const next = (counts.get(uid) || 0) - 1;
            if (next <= 0) counts.delete(uid);
            else counts.set(uid, next);
          }
        };

        const windowSize = 30;
        for (let i = 0; i < dayKeys.length; i += 1) {
          addDay(dayKeys[i]);
          if (i >= windowSize) {
            removeDay(dayKeys[i - windowSize]);
          }
          roll[i] = counts.size;
        }

        // Daily MAU curve: last 30 days, use rolling value ending each day
        const dailyStart = Math.max(0, dayKeys.length - 30);
        mauTrendDaily30 = dayKeys.slice(dailyStart).map((d, idx) => ({
          date: d,
          mau_rolling_30d: Number(roll[dailyStart + idx] || 0),
        }));

        // Weekly curves (last 12 weeks, sample at week ends every 7 days, including today)
// 1) Rolling 30d MAU snapshots (for reference)
const weeklyRollingMau: { week_end: string; mau_rolling_30d: number }[] = [];
// 2) WAU trend (weekly active users): unique users in the 7-day window ending on week_end
const weeklyWau: { week_end: string; wau_7d: number }[] = [];

for (let w = 0; w < 12; w += 1) {
  const offset = w * 7;
  const idx = dayKeys.length - 1 - offset;
  if (idx < 0) break;

  const wkEnd = dayKeys[idx];

  // Rolling MAU snapshot at week end (uses precomputed 30-day rolling union size)
  weeklyRollingMau.unshift({ week_end: wkEnd, mau_rolling_30d: Number(roll[idx] || 0) });

  // WAU: union of daily active users for the 7 days ending on wkEnd
  const startIdx = Math.max(0, idx - 6);
  const union = new Set<string>();
  for (let j = startIdx; j <= idx; j += 1) {
    const dk = dayKeys[j];
    const set = dailyUsers[dk];
    if (!set) continue;
    for (const uid of set) union.add(uid);
  }
  weeklyWau.unshift({ week_end: wkEnd, wau_7d: union.size });
}

// Phase 3.1 legacy: keep rolling MAU snapshots as a separate series
// (UI uses WAU for weekly by default; rolling MAU weekly snapshots are still available for debugging/analysis)
(globalThis as any).__maw_debug = (globalThis as any).__maw_debug || {};
mauTrendWeekly12 = weeklyRollingMau;

// New: weekly active users trend (WAU)
wauTrendWeekly12 = weeklyWau;

        // Tool adoption over time (last 30d): daily tool users / daily active users
        const last30Keys = dayKeys.slice(-30);
        const dailyActiveArr = last30Keys.map((d) => (dailyUsers[d] ? dailyUsers[d].size : 0));

        // Choose top tools by unique users in last 30d
        const toolTotals: { tool: string; unique: number }[] = [];
        for (const [tool, perDay] of Object.entries(dailyToolUsers)) {
          let s = new Set<string>();
          for (const d of last30Keys) {
            const set = (perDay as any)[d] as Set<string> | undefined;
            if (!set) continue;
            for (const uid of set) s.add(uid);
          }
          const n = s.size;
          if (n > 0) toolTotals.push({ tool, unique: n });
        }
        toolTotals.sort((a, b) => b.unique - a.unique);
        const topTools = toolTotals.slice(0, 5).map((t) => t.tool);

        const toolSeries = topTools.map((tool) => {
          const perDay = dailyToolUsers[tool] || {};
          const users = last30Keys.map((d) => ((perDay as any)[d] ? (perDay as any)[d].size : 0));
          const rates = users.map((n, i) => {
            const denom = dailyActiveArr[i] || 0;
            return denom > 0 ? n / denom : 0;
          });
          return { tool, adoption_rates: rates, unique_users: users };
        });

        toolAdoptionTrend30d = {
          days: last30Keys,
          daily_active_users: dailyActiveArr,
          tools: toolSeries,
        };
      }
    } catch (e) {
      // non-fatal
    }


    // Cohort: users created 7–14 days ago.
    // Retained: had ≥1 event within first 7 days after signup.
    try {
      const since14Iso = isoDaysAgo(14);
      const since7Iso = isoDaysAgo(7);

      const { data: cohortUsers, error: cohortErr } = await admin
        .from('users')
        .select('id,created_at')
        .gte('created_at', since14Iso)
        .lt('created_at', since7Iso)
        .order('created_at', { ascending: false })
        .limit(50000);

      if (!cohortErr) {
        const cohort = (cohortUsers || []) as any[];
        week1CohortSize = cohort.length;

        const cohortMap = new Map<string, string>();
        const cohortIsFounder = new Map<string, boolean>();
        for (const u of cohort) {
          if (u?.id && u?.created_at) {
            const id = String(u.id);
            cohortMap.set(id, String(u.created_at));
            cohortIsFounder.set(id, !!u?.founding_circle_member);
          }
        }

        if (cohortMap.size > 0) {
          // Pull events from last 14 days for cohort users, then test occurred_at <= created_at + 7d
          const ids = Array.from(cohortMap.keys());
          const batchSize = 500;
          const retainedSet = new Set<string>();
          const retainedFounders = new Set<string>();
          const retainedNonFounders = new Set<string>();

          for (let i = 0; i < ids.length; i += batchSize) {
            const batch = ids.slice(i, i + batchSize);
            const { data: evC, error: evCErr } = await admin
              .from('ai_usage_events')
              .select('user_id,occurred_at')
              .in('user_id', batch)
              .gte('occurred_at', since14Iso)
              .order('occurred_at', { ascending: true })
              .limit(200000);

            if (evCErr) continue;

            for (const e of (evC || []) as any[]) {
              const uid = e?.user_id ? String(e.user_id) : null;
              const occ = e?.occurred_at ? String(e.occurred_at) : null;
              if (!uid || !occ) continue;
              if (retainedSet.has(uid)) continue;

              const createdAt = cohortMap.get(uid);
              if (!createdAt) continue;

              const createdMs = Date.parse(createdAt);
              const occMs = Date.parse(occ);
              if (!Number.isFinite(createdMs) || !Number.isFinite(occMs)) continue;

              if (occMs <= createdMs + 7 * 24 * 60 * 60 * 1000) {
                retainedSet.add(uid);
                const isFounder = cohortIsFounder.get(uid) === true;
                if (isFounder) retainedFounders.add(uid);
                else retainedNonFounders.add(uid);
              }
            }
          }

          week1Retained = retainedSet.size;
          week1RetentionRate = week1CohortSize > 0 ? week1Retained / week1CohortSize : null;
          // Phase 4.5 split
          week1FoundersCohortSize = cohort.filter((u: any) => !!u?.founding_circle_member).length;
          week1NonFoundersCohortSize = Math.max(0, week1CohortSize - week1FoundersCohortSize);

          week1FoundersRetained = retainedFounders.size;
          week1NonFoundersRetained = retainedNonFounders.size;

          week1FoundersRetentionRate = week1FoundersCohortSize > 0 ? week1FoundersRetained / week1FoundersCohortSize : null;
          week1NonFoundersRetentionRate = week1NonFoundersCohortSize > 0 ? week1NonFoundersRetained / week1NonFoundersCohortSize : null;

        }
      }
    } catch (e) {
      // non-fatal
    }

    // --- Phase 4: Founding Circle intelligence (segmentation + conversion + intensity)
    const foundingWindows = [7, 30, 90] as const;

    const founding: any = {
      members_by_window: {} as Record<string, number>,
      conversion_rate_by_window: {} as Record<string, number | null>,
      activation: {
        founders_new_users: 0,
        non_founders_new_users: 0,
        founders_activated_users: 0,
        non_founders_activated_users: 0,
        founders_activation_rate: null as number | null,
        non_founders_activation_rate: null as number | null,
      },
      usage_intensity: {
        active_founders: 0,
        active_non_founders: 0,
        founders: {
          total_cost_usd: 0,
          total_events: 0,
          cost_per_active_user: null as number | null,
          events_per_active_user: null as number | null,
        },
        non_founders: {
          total_cost_usd: 0,
          total_events: 0,
          cost_per_active_user: null as number | null,
          events_per_active_user: null as number | null,
        },
        cost_per_user_ratio: null as number | null,
        events_per_user_ratio: null as number | null,
      },
      // Phase 4.5 — Retention + stickiness + adoption split (added later in handler)
      retention_week1_split: {
        cohort_window: '7-14d ago',
        founders: { cohort_size: 0, retained: 0, retention_rate: null as number | null },
        non_founders: { cohort_size: 0, retained: 0, retention_rate: null as number | null },
        delta_founders_minus_non: null as number | null,
      },
      stickiness_wau_mau_split: {
        founders: { wau_7d: 0, mau_30d: 0, wau_mau: null as number | null },
        non_founders: { wau_7d: 0, mau_30d: 0, wau_mau: null as number | null },
        delta_founders_minus_non: null as number | null,
      },
      tool_adoption_split: {
        window_days: days,
        founders_active_users: 0,
        non_founders_active_users: 0,
        top_tools_founders: [] as any[],
        top_tools_non_founders: [] as any[],
        top_delta: [] as any[],
      },
    };

    // Founding members (7/30/90) based on founding_joined_at
    for (const w of foundingWindows) {
      try {
        const { count, error } = await admin
          .from('users')
          .select('id', { count: 'exact', head: true })
          .eq('founding_circle_member', true)
          .gte('founding_joined_at', isoDaysAgo(Number(w)));
        if (!error) founding.members_by_window[String(w)] = Number(count || 0);
        else {
          founding.members_by_window[String(w)] = 0;
          warnings.push(`Founding members count failed (${w}d)`);
        }
      } catch {
        founding.members_by_window[String(w)] = 0;
        warnings.push(`Founding members count failed (${w}d)`);
      }
    }

    // Founding conversion rate: leads converted to users (by lead created_at window)
    for (const w of foundingWindows) {
      try {
        const since = isoDaysAgo(Number(w));
        const { count: totalLeads, error: totalErr } = await admin
          .from('maw_founding_circle_leads')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', since);
        if (totalErr) {
          founding.conversion_rate_by_window[String(w)] = null;
          warnings.push(`Founding leads count failed (${w}d)`);
          continue;
        }
        const { count: convertedLeads, error: convErr } = await admin
          .from('maw_founding_circle_leads')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', since)
          .eq('converted_to_user', true);
        if (convErr) {
          founding.conversion_rate_by_window[String(w)] = null;
          warnings.push(`Founding conversion count failed (${w}d)`);
          continue;
        }
        const tot = Number(totalLeads || 0);
        const conv = Number(convertedLeads || 0);
        founding.conversion_rate_by_window[String(w)] = tot > 0 ? conv / tot : null;
      } catch {
        founding.conversion_rate_by_window[String(w)] = null;
      }
    }

    // Founding vs Non-founding activation (among new users in selected window)
    try {
      const newUserIds = Array.from(newUserCreatedAt.keys());
      if (newUserIds.length) {
        const founderSetNew = new Set<string>();
        const batchSize = 500;
        for (let i = 0; i < newUserIds.length; i += batchSize) {
          const batch = newUserIds.slice(i, i + batchSize);
          const { data: urows, error: uerr } = await admin.from('users').select('id,founding_circle_member').in('id', batch).limit(50000);
          if (uerr) continue;
          for (const u of (urows || []) as any[]) {
            const id = u?.id ? String(u.id) : null;
            if (!id) continue;
            if (u?.founding_circle_member) founderSetNew.add(id);
          }
        }

        for (const id of newUserIds) {
          const isFounder = founderSetNew.has(id);
          if (isFounder) founding.activation.founders_new_users += 1;
          else founding.activation.non_founders_new_users += 1;

          const isActivated = activatedSetGlobal.has(id);
          if (isActivated && isFounder) founding.activation.founders_activated_users += 1;
          if (isActivated && !isFounder) founding.activation.non_founders_activated_users += 1;
        }

        founding.activation.founders_activation_rate =
          founding.activation.founders_new_users > 0
            ? founding.activation.founders_activated_users / founding.activation.founders_new_users
            : null;
        founding.activation.non_founders_activation_rate =
          founding.activation.non_founders_new_users > 0
            ? founding.activation.non_founders_activated_users / founding.activation.non_founders_new_users
            : null;
      }
    } catch {
      // non-fatal
    }

    // Founding usage intensity (among active users in selected window)
    let founderSetActiveGlobal = new Set<string>();
    try {
      const activeIds = Array.from(activeUserSet.values());
      if (activeIds.length) {
        const founderSetActive = new Set<string>();
        const batchSize = 500;
        for (let i = 0; i < activeIds.length; i += batchSize) {
          const batch = activeIds.slice(i, i + batchSize);
          const { data: urows, error: uerr } = await admin.from('users').select('id,founding_circle_member').in('id', batch).limit(50000);
          if (uerr) continue;
          for (const u of (urows || []) as any[]) {
            const id = u?.id ? String(u.id) : null;
            if (!id) continue;
            if (u?.founding_circle_member) founderSetActive.add(id);
          }
        }

        founderSetActiveGlobal = founderSetActive;
        founding.usage_intensity.active_founders = founderSetActive.size;
        founding.usage_intensity.active_non_founders = Math.max(0, activeIds.length - founderSetActive.size);

        for (const [uid, v] of Object.entries(userAgg)) {
          const isFounder = founderSetActive.has(String(uid));
          if (isFounder) {
            founding.usage_intensity.founders.total_cost_usd += Number(v.cost || 0);
            founding.usage_intensity.founders.total_events += Number(v.events || 0);
          } else {
            founding.usage_intensity.non_founders.total_cost_usd += Number(v.cost || 0);
            founding.usage_intensity.non_founders.total_events += Number(v.events || 0);
          }
        }

        const fN = Number(founding.usage_intensity.active_founders || 0);
        const nfN = Number(founding.usage_intensity.active_non_founders || 0);

        founding.usage_intensity.founders.cost_per_active_user = fN > 0 ? founding.usage_intensity.founders.total_cost_usd / fN : null;
        founding.usage_intensity.founders.events_per_active_user = fN > 0 ? founding.usage_intensity.founders.total_events / fN : null;

        founding.usage_intensity.non_founders.cost_per_active_user = nfN > 0 ? founding.usage_intensity.non_founders.total_cost_usd / nfN : null;
        founding.usage_intensity.non_founders.events_per_active_user = nfN > 0 ? founding.usage_intensity.non_founders.total_events / nfN : null;

        const fCost = founding.usage_intensity.founders.cost_per_active_user;
        const nfCost = founding.usage_intensity.non_founders.cost_per_active_user;
        founding.usage_intensity.cost_per_user_ratio = Number.isFinite(fCost) && Number.isFinite(nfCost) && nfCost > 0 ? fCost / nfCost : null;

        const fEv = founding.usage_intensity.founders.events_per_active_user;
        const nfEv = founding.usage_intensity.non_founders.events_per_active_user;
        founding.usage_intensity.events_per_user_ratio = Number.isFinite(fEv) && Number.isFinite(nfEv) && nfEv > 0 ? fEv / nfEv : null;
      }
    } catch {
      // non-fatal
    }

    // --- Phase 4.5: Founders vs Non-founders retention (week-1) + stickiness + tool adoption split
    try {
      // Week-1 retention split (computed earlier from 7–14d cohort)
      founding.retention_week1_split.founders.cohort_size = week1FoundersCohortSize;
      founding.retention_week1_split.founders.retained = week1FoundersRetained;
      founding.retention_week1_split.founders.retention_rate = week1FoundersRetentionRate;

      founding.retention_week1_split.non_founders.cohort_size = week1NonFoundersCohortSize;
      founding.retention_week1_split.non_founders.retained = week1NonFoundersRetained;
      founding.retention_week1_split.non_founders.retention_rate = week1NonFoundersRetentionRate;

      founding.retention_week1_split.delta_founders_minus_non =
        week1FoundersRetentionRate != null && week1NonFoundersRetentionRate != null ? week1FoundersRetentionRate - week1NonFoundersRetentionRate : null;

      // WAU/MAU stickiness split (computed earlier)
      founding.stickiness_wau_mau_split.founders.wau_7d = foundersWau7;
      founding.stickiness_wau_mau_split.founders.mau_30d = foundersMau30;
      founding.stickiness_wau_mau_split.founders.wau_mau = foundersStickinessWauMau;

      founding.stickiness_wau_mau_split.non_founders.wau_7d = nonFoundersWau7;
      founding.stickiness_wau_mau_split.non_founders.mau_30d = nonFoundersMau30;
      founding.stickiness_wau_mau_split.non_founders.wau_mau = nonFoundersStickinessWauMau;

      founding.stickiness_wau_mau_split.delta_founders_minus_non = stickinessDeltaFoundersMinusNon;

      // Tool adoption breakdown (top tools) — Founders vs Non-founders in selected window
      founding.tool_adoption_split.window_days = days;
      founding.tool_adoption_split.founders_active_users = Number(founding.usage_intensity.active_founders || 0);
      founding.tool_adoption_split.non_founders_active_users = Number(founding.usage_intensity.active_non_founders || 0);

      const fDen = founding.tool_adoption_split.founders_active_users || 0;
      const nfDen = founding.tool_adoption_split.non_founders_active_users || 0;

      const splitAgg: Record<
        string,
        { founders_users: Set<string>; non_users: Set<string>; founders_events: number; non_events: number }
      > = {};

      const ensure = (tool: string) => {
        if (!splitAgg[tool]) splitAgg[tool] = { founders_users: new Set<string>(), non_users: new Set<string>(), founders_events: 0, non_events: 0 };
        return splitAgg[tool];
      };

      for (const e of evs) {
        const uid = e?.user_id ? String(e.user_id) : null;
        if (!uid) continue;
        const tool = String(e?.tool || 'unknown');
        const row = ensure(tool);
        const isFounder = founderSetActiveGlobal.has(uid);
        if (isFounder) {
          row.founders_events += 1;
          row.founders_users.add(uid);
        } else {
          row.non_events += 1;
          row.non_users.add(uid);
        }
      }

      const rows = Object.entries(splitAgg).map(([tool, v]) => {
        const fUsers = v.founders_users.size;
        const nfUsers = v.non_users.size;
        const fRate = fDen > 0 ? fUsers / fDen : null;
        const nfRate = nfDen > 0 ? nfUsers / nfDen : null;
        const delta = fRate != null && nfRate != null ? fRate - nfRate : null;
        return {
          tool,
          founders: { unique_users: fUsers, events: v.founders_events, adoption_rate: fRate },
          non_founders: { unique_users: nfUsers, events: v.non_events, adoption_rate: nfRate },
          delta_adoption_rate: delta,
        };
      });

      const topFounders = rows
        .slice()
        .sort((a, b) => (Number(b?.founders?.adoption_rate || 0) - Number(a?.founders?.adoption_rate || 0)))
        .slice(0, 6);

      const topNon = rows
        .slice()
        .sort((a, b) => (Number(b?.non_founders?.adoption_rate || 0) - Number(a?.non_founders?.adoption_rate || 0)))
        .slice(0, 6);

      const topDelta = rows
        .slice()
        .filter((r) => r.delta_adoption_rate != null)
        .sort((a, b) => Math.abs(Number(b.delta_adoption_rate)) - Math.abs(Number(a.delta_adoption_rate)))
        .slice(0, 8);

      founding.tool_adoption_split.top_tools_founders = topFounders;
      founding.tool_adoption_split.top_tools_non_founders = topNon;
      founding.tool_adoption_split.top_delta = topDelta;
    } catch {
      // non-fatal
    }


const toolRows = Object.entries(toolAgg).map(([tool, v]) => ({
      tool,
      events: v.events,
      unique_users: v.users.size,
      cost_usd: v.cost,
    }));

    const topToolsByUsage = toolRows.slice().sort((a, b) => b.events - a.events).slice(0, 10);
    const topToolsByCost = toolRows.slice().sort((a, b) => b.cost_usd - a.cost_usd).slice(0, 10);

const reliability_by_tool = Object.entries(toolReliability)
  .map(([tool, r]) => {
    const total = r.total || 0;
    const p95 = percentile(r.latencies, 0.95);
    return {
      tool,
      total,
      success_rate: total ? r.success / total : null,
      error_rate: total ? r.error / total : null,
      timeout_rate: total ? r.timeout / total : null,
      rate_limit_rate: total ? r.rate_limit / total : null,
      quota_rate: total ? r.quota / total : null,
      unauthorized_rate: total ? r.unauthorized / total : null,
      p95_latency_ms: p95,
    };
  })
  .sort((a, b) => (b.total || 0) - (a.total || 0))
  .slice(0, 25);

const provider_breakdown = Object.entries(providerReliability)
  .map(([provider, r]) => {
    const total = r.total || 0;
    const p95 = percentile(r.latencies, 0.95);
    return {
      provider,
      total,
      success_rate: total ? r.success / total : null,
      error_rate: total ? r.error / total : null,
      timeout_rate: total ? r.timeout / total : null,
      rate_limit_rate: total ? r.rate_limit / total : null,
      quota_rate: total ? r.quota / total : null,
      unauthorized_rate: total ? r.unauthorized / total : null,
      p95_latency_ms: p95,
    };
  })
  .sort((a, b) => (b.total || 0) - (a.total || 0));


    return res.status(200).json({
      ok: true,
      window: {
        days,
        sinceIso,
        optionsDays: ALLOWED_WINDOWS,
      },
      warnings,
      definitions: {
        active_user: `Unique users with ≥1 ai_usage_event in the selected window`,
        activated_user: `New users with first core-tool use within 24h of signup`,
        returning_wau_7d: `Unique users with ≥1 ai_usage_event in the last 7 days`,
        ttfv_median: `Median time from users.created_at to first core-tool ai_usage_event (for new users in window)`,
        dau_wau_mau: `DAU/WAU/MAU = unique users with ≥1 ai_usage_event in last 1/7/30 days`,
        stickiness: `Stickiness = DAU / MAU`,
        tool_adoption: `For each tool: (unique users using tool in window) / (active users in window)`,
        returning_trend_30d: `Daily returning users (last 30d): events on day D where users.created_at < start of day D`,
        week1_retention: `Users who signed up 7–14 days ago and used the product at least once within their first 7 days`,
        core_tools: CORE_TOOLS,
      },
      users: {
        new: newUsersN,
        active: activeUsers,
        activated: activatedUsers,
        activation_rate: activationRate,
      },
      founding,
      growth: {
        funnel: {
          new_users: newUsersN,
          activated_users: activatedUsers,
          returning_wau_7d: returningUsersWau7,
        },
        ttfv: {
          median_ms: medianTtfvMs,
          median_minutes: medianTtfvMs != null ? medianTtfvMs / 60000 : null,
          sample_size: ttfvSampleSize,
        },
        signup_trend_30d: signupTrend30d,
      },
      engagement: {
        dau,
        wau,
        mau,
        stickiness_dau_mau: stickinessDauMau,
        tool_adoption_top: toolAdoption,
        returning_trend_30d: returningTrend30d,
        mau_trend_30d_daily: mauTrendDaily30,
        mau_trend_12w_weekly: mauTrendWeekly12,
        wau_trend_12w_weekly: wauTrendWeekly12,
        tool_adoption_trend_30d: toolAdoptionTrend30d,
        week1_retention: {
          cohort_size: week1CohortSize,
          retained: week1Retained,
          retention_rate: week1RetentionRate,
        },
      },
      ai: {
        total_events: totalEvents,
        cost_usd: aiCostUSD,
        success_rate: successRate,
        error_rate: errorRate,
        p95_latency_ms: p95LatencyMs,
        outcomes: {
          success: successEvents,
          error: errorEvents,
          rate_limit: rateLimitEvents,
          quota: quotaEvents,
          unauthorized: unauthorizedEvents,
          timeout: timeoutEvents,
          upstream_error: upstreamErrorEvents,
        },
      },
      unit_economics: {
        total_cost_usd: aiCostUSD,
        successful_sessions: successfulSessions,
        cost_per_active_user: costPerActiveUser,
        cost_per_activated_user: costPerActivatedUser,
        cost_per_tool_session: costPerToolSession,
        top_spenders: topSpenders,
        spend_trend_30d: spendTrend30d,
        top_spenders_trend_30d: topSpendersTrend30d,
        cost_anomalies: costAnomalies,
      },
      reliability: {
        by_tool: reliability_by_tool,
        p95_latency_by_tool: reliability_by_tool.map((t:any)=>({ tool: t.tool, p95_latency_ms: t.p95_latency_ms })),
        recent_failures: recentFailures,
        provider_breakdown,
      },
      tools: {
        top_by_usage: topToolsByUsage,
        top_by_cost: topToolsByCost,
      },
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || 'Server error' });
  }
}