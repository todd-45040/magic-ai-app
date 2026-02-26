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
    let medianTtfvMs: number | null = null;
    let ttfvSampleSize = 0;
    let returningUsersWau7 = 0;
    let signupTrend30d: { date: string; new_users: number }[] = [];
    if (newUserCreatedAt.size > 0) {
      const ids = Array.from(newUserCreatedAt.keys());
      const batchSize = 500; // Supabase "in" works best with modest sizes
      const activatedSet = new Set<string>();
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

    let week1CohortSize = 0;
    let week1Retained = 0;
    let week1RetentionRate: number | null = null;

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
    const uniqueUsersSince = async (d: number) => {
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
      return s.size;
    };

    try {
      const [d1, d7, d30] = await Promise.all([uniqueUsersSince(1), uniqueUsersSince(7), uniqueUsersSince(30)]);
      dau = Number(d1 || 0);
      wau = Number(d7 || 0);
      mau = Number(d30 || 0);
      stickinessDauMau = mau > 0 ? dau / mau : null;
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
          const { data: ur, error: urErr } = await admin.from('users').select('id,created_at').in('id', batch).limit(50000);
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
        for (const u of cohort) {
          if (u?.id && u?.created_at) cohortMap.set(String(u.id), String(u.created_at));
        }

        if (cohortMap.size > 0) {
          // Pull events from last 14 days for cohort users, then test occurred_at <= created_at + 7d
          const ids = Array.from(cohortMap.keys());
          const batchSize = 500;
          const retainedSet = new Set<string>();

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
              }
            }
          }

          week1Retained = retainedSet.size;
          week1RetentionRate = week1CohortSize > 0 ? week1Retained / week1CohortSize : null;
        }
      }
    } catch (e) {
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
      tools: {
        top_by_usage: topToolsByUsage,
        top_by_cost: topToolsByCost,
      },
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || 'Server error' });
  }
}