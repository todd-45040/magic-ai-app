import { requireSupabaseAuth } from './_auth.js';

type PlanKey = 'trial' | 'amateur' | 'professional' | 'admin' | 'free' | 'expired' | 'unknown';

function clampDays(n: any, min = 1, max = 365) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 30;
  return Math.min(max, Math.max(min, v));
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function ymdDaysAgo(days: number): string {
  return isoDaysAgo(days).slice(0, 10);
}

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

    const days = clampDays(req?.query?.days ?? 30, 1, 365);
    const sinceIso = isoDaysAgo(days);
    const sinceDay = ymdDaysAgo(days);

    // Plan pricing (pre-Stripe estimates)
    const pricesUSD: Record<string, number> = {
      amateur: 9.95,
      pro: 29.95,
    };

    // --- Users by plan (cheap counts; avoids large scans)
    const plans: PlanKey[] = ['trial', 'amateur', 'professional', 'admin', 'free', 'expired'];
    const byPlan: Record<string, number> = {};

    const { count: totalUsers, error: totalErr } = await admin
      .from('users')
      .select('id', { count: 'exact', head: true });
    if (totalErr) return res.status(500).json({ ok: false, error: 'User count failed', details: totalErr });

    for (const p of plans) {
      const { count, error } = await admin
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('membership', p);
      if (error) return res.status(500).json({ ok: false, error: `User count failed for ${p}`, details: error });
      byPlan[p] = Number(count || 0);
    }

    // Catch-all for any unexpected membership values
    const known = Object.values(byPlan).reduce((a, n) => a + (Number(n) || 0), 0);
    byPlan.unknown = Math.max(0, Number(totalUsers || 0) - known);

    // --- Active users (last N days) based on telemetry
    let activeUsers = 0;
    try {
      const { data: rows, error } = await admin
        .from('ai_usage_events')
        .select('user_id')
        .gte('occurred_at', sinceIso)
        .not('user_id', 'is', null)
        .limit(50000);
      if (!error && rows) {
        const s = new Set<string>();
        for (const r of rows as any[]) {
          if (r?.user_id) s.add(String(r.user_id));
        }
        activeUsers = s.size;
      }
    } catch {
      // optional
    }

    // --- Cost (prefer rollups if available)
    let aiCostUSD = 0;
    const costByTool: Record<string, number> = {};

    // Rollups table fields: day, tool, total_estimated_cost_usd
    const { data: rollups, error: rErr } = await admin
      .from('ai_usage_rollups_daily')
      .select('day,tool,total_estimated_cost_usd')
      .gte('day', sinceDay)
      .limit(5000);

    if (!rErr && Array.isArray(rollups) && rollups.length > 0) {
      for (const r of rollups as any[]) {
        const c = Number(r?.total_estimated_cost_usd || 0);
        aiCostUSD += c;
        const t = String(r?.tool || 'unknown');
        costByTool[t] = (costByTool[t] || 0) + c;
      }
    } else {
      // Fallback to raw events
      const { data: evs } = await admin
        .from('ai_usage_events')
        .select('tool,estimated_cost_usd')
        .gte('occurred_at', sinceIso)
        .limit(50000);
      for (const e of (evs || []) as any[]) {
        const c = Number(e?.estimated_cost_usd || 0);
        aiCostUSD += c;
        const t = String(e?.tool || 'unknown');
        costByTool[t] = (costByTool[t] || 0) + c;
      }
    }

    // --- Revenue estimates (until Stripe is live)
    const pro = (byPlan.professional || 0) + (byPlan.pro || 0);
    const amateur = byPlan.amateur || 0;
    const mrrEst = pro * pricesUSD.pro + amateur * pricesUSD.amateur;
    const arrEst = mrrEst * 12;

    // --- Margin (rough founder view)
    const infraEstimateUSD = 125; // Vercel/Supabase baseline placeholder; adjust later
    const grossMarginEst30d = mrrEst - aiCostUSD - infraEstimateUSD;

    return res.status(200).json({
      ok: true,
      window: { days, sinceIso, sinceDay },
      users: {
        total: Number(totalUsers || 0),
        active: activeUsers,
        byPlan,
      },
      revenue: {
        pricesUSD,
        mrr_est: Number(mrrEst.toFixed(2)),
        arr_est: Number(arrEst.toFixed(2)),
      },
      cost: {
        ai_cost_usd_window: Number(aiCostUSD.toFixed(4)),
        cost_by_tool_usd_window: Object.fromEntries(
          Object.entries(costByTool)
            .sort((a, b) => (b[1] as number) - (a[1] as number))
            .map(([k, v]) => [k, Number((v as number).toFixed(4))])
        ),
      },
      margin: {
        infra_est_usd_month: infraEstimateUSD,
        gross_margin_est_window: Number(grossMarginEst30d.toFixed(2)),
      },
      notes: {
        revenue_is_estimated: true,
        costs_are_estimated: true,
        stripe_not_live: true,
      },
    });
  } catch (err: any) {
    console.error('adminSummary error', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}
