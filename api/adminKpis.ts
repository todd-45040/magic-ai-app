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

    // --- New users (created in window)
    const { count: newUsersCount, error: newUsersErr } = await admin
      .from('users')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', sinceIso);

    if (newUsersErr) return res.status(500).json({ ok: false, error: 'New user count failed', details: newUsersErr });

    // Pull ids + created_at for activation check (bounded)
    const { data: newUsersRows, error: newUsersRowsErr } = await admin
      .from('users')
      .select('id,created_at')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(50000);

    if (newUsersRowsErr) {
      return res.status(500).json({ ok: false, error: 'New users scan failed', details: newUsersRowsErr });
    }

    const newUsers = (newUsersRows || []) as any[];
    const newUserCreatedAt = new Map<string, string>();
    for (const u of newUsers) {
      if (u?.id && u?.created_at) newUserCreatedAt.set(String(u.id), String(u.created_at));
    }

    // --- Raw events in window (for active users, cost, success/error, latency, tool aggregation)
    const { data: events, error: evErr } = await admin
      .from('ai_usage_events')
      .select('user_id,tool,outcome,http_status,error_code,latency_ms,estimated_cost_usd,occurred_at')
      .gte('occurred_at', sinceIso)
      .order('occurred_at', { ascending: false })
      .limit(200000);

    if (evErr) return res.status(500).json({ ok: false, error: 'Telemetry scan failed', details: evErr });

    const evs = (events || []) as any[];

    const activeUserSet = new Set<string>();
    const toolAgg: Record<string, { events: number; cost: number; users: Set<string> }> = {};
    const latency: number[] = [];

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

    const isSuccessOutcome = (o: any) => {
      const s = String(o || '');
      return s === 'SUCCESS_CHARGED' || s === 'SUCCESS_NOT_CHARGED' || s === 'ALLOWED';
    };

    for (const e of evs) {
      totalEvents += 1;

      const uid = e?.user_id ? String(e.user_id) : null;
      if (uid) activeUserSet.add(uid);

      const tool = String(e?.tool || 'unknown');
      if (!toolAgg[tool]) toolAgg[tool] = { events: 0, cost: 0, users: new Set<string>() };
      toolAgg[tool].events += 1;
      if (uid) toolAgg[tool].users.add(uid);

      const c = Number(e?.estimated_cost_usd || 0);
      if (Number.isFinite(c)) {
        aiCostUSD += c;
        toolAgg[tool].cost += c;
      }

      const l = Number(e?.latency_ms);
      if (Number.isFinite(l) && l >= 0) latency.push(l);

      const outcome = String(e?.outcome || '');
      const http = Number(e?.http_status || 0);
      const code = String(e?.error_code || '');

      const isRateLimit = outcome === 'BLOCKED_RATE_LIMIT' || http === 429 || code === 'RATE_LIMITED';
      const isQuota = outcome === 'BLOCKED_QUOTA' || code === 'QUOTA_EXCEEDED';
      const isUnauthorized = outcome === 'UNAUTHORIZED' || http === 401 || http === 403 || code === 'UNAUTHORIZED';
      const isTimeout = code === 'TIMEOUT' || http === 504 || http === 408;

      if (isRateLimit) rateLimitEvents += 1;
      if (isQuota) quotaEvents += 1;
      if (isUnauthorized) unauthorizedEvents += 1;
      if (isTimeout) timeoutEvents += 1;

      if (isSuccessOutcome(outcome)) {
        successEvents += 1;
      } else {
        errorEvents += 1;
        if (outcome === 'ERROR_UPSTREAM') upstreamErrorEvents += 1;
      }
    }

    // --- Activated users: first core-tool use within 24h of signup (among new users)
    let activatedUsers = 0;
    if (newUserCreatedAt.size > 0) {
      const ids = Array.from(newUserCreatedAt.keys());
      const batchSize = 500; // Supabase "in" works best with modest sizes
      const activatedSet = new Set<string>();

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
          if (activatedSet.has(uid)) continue;

          const createdAt = newUserCreatedAt.get(uid);
          if (!createdAt) continue;

          const createdMs = Date.parse(createdAt);
          const occMs = Date.parse(occ);
          if (!Number.isFinite(createdMs) || !Number.isFinite(occMs)) continue;

          if (occMs <= createdMs + 24 * 60 * 60 * 1000) {
            activatedSet.add(uid);
          }
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

    const toolRows = Object.entries(toolAgg).map(([tool, v]) => ({
      tool,
      events: v.events,
      unique_users: v.users.size,
      cost_usd: v.cost,
    }));

    const topToolsByUsage = toolRows.slice().sort((a, b) => b.events - a.events).slice(0, 10);
    const topToolsByCost = toolRows.slice().sort((a, b) => b.cost_usd - a.cost_usd).slice(0, 10);

    return res.status(200).json({
      ok: true,
      window: {
        days,
        sinceIso,
        optionsDays: ALLOWED_WINDOWS,
      },
      definitions: {
        active_user: `Unique users with ≥1 ai_usage_event in the selected window`,
        activated_user: `New users with first core-tool use within 24h of signup`,
        core_tools: CORE_TOOLS,
      },
      users: {
        new: newUsersN,
        active: activeUsers,
        activated: activatedUsers,
        activation_rate: activationRate,
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
      tools: {
        top_by_usage: topToolsByUsage,
        top_by_cost: topToolsByCost,
      },
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || 'Server error' });
  }
}
