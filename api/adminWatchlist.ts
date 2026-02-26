import { requireSupabaseAuth } from './_auth.js';
import { isoDaysAgo, parseAdminWindowDays } from './_adminWindow.js';

export default async function handler(req: any, res: any) {
  try {
    const auth = await requireSupabaseAuth(req);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

    const { admin, userId } = auth as any;

    // Admin-only gate
    const { data: me, error: meErr } = await admin.from('users').select('id,is_admin').eq('id', userId).maybeSingle();
    if (meErr) return res.status(500).json({ ok: false, error: 'Admin check failed', details: meErr });
    if (!me?.is_admin) return res.status(403).json({ ok: false, error: 'Forbidden' });

    const days = parseAdminWindowDays(req?.query?.days, 7);
    const sinceIso = isoDaysAgo(days);

    // Big spenders (top 10)
    const { data: spendRows, error: sErr } = await admin
      .from('ai_usage_events')
      .select('user_id, estimated_cost_usd')
      .gte('occurred_at', sinceIso)
      .limit(50000);

    if (sErr) return res.status(500).json({ ok: false, error: 'Failed to load usage events for spenders', details: sErr });

    const spendMap: Record<string, { total_cost: number; sessions: number }> = {};
    for (const r of spendRows || []) {
      const uid = r.user_id;
      if (!uid) continue;
      if (!spendMap[uid]) spendMap[uid] = { total_cost: 0, sessions: 0 };
      spendMap[uid].total_cost += Number(r.estimated_cost_usd ?? 0);
      spendMap[uid].sessions += 1;
    }
    const spenderList = Object.entries(spendMap)
      .map(([user_id, v]) => ({ user_id, total_cost_usd: v.total_cost, sessions: v.sessions }))
      .sort((a, b) => b.total_cost_usd - a.total_cost_usd)
      .slice(0, 10);

    const spenderIds = spenderList.map((s) => s.user_id);

    // Repeated errors: count outcomes in {error, timeout, rate-limit} by user (top 20)
    const { data: failRows, error: fErr } = await admin
      .from('ai_usage_events')
      .select('user_id, outcome, occurred_at')
      .gte('occurred_at', sinceIso)
      .in('outcome', ['error', 'timeout', 'rate-limit', 'rate_limit', 'ratelimit'])
      .limit(50000);

    if (fErr) return res.status(500).json({ ok: false, error: 'Failed to load usage events for failures', details: fErr });

    const failMap: Record<string, { failures: number; last_failure_at: string | null }> = {};
    for (const r of failRows || []) {
      const uid = r.user_id;
      if (!uid) continue;
      if (!failMap[uid]) failMap[uid] = { failures: 0, last_failure_at: null };
      failMap[uid].failures += 1;
      const at = r.occurred_at ? String(r.occurred_at) : null;
      if (at && (!failMap[uid].last_failure_at || at > failMap[uid].last_failure_at)) failMap[uid].last_failure_at = at;
    }

    const repeated = Object.entries(failMap)
      .map(([user_id, v]) => ({ user_id, ...v }))
      .filter((r) => r.failures >= 5)
      .sort((a, b) => b.failures - a.failures)
      .slice(0, 20);

    const repeatedIds = repeated.map((r) => r.user_id);

    // Near quota: best-effort (only if quota fields exist)
    let nearQuota: { user_id: string; email: string | null; membership: string | null; remaining: number; limit: number }[] = [];
    try {
      const { data: u, error: qErr } = await admin.from('users').select('id,email,membership,quota_limit,quota_used').limit(1);
      if (!qErr && u) {
        // If these columns exist, pull all users with remaining <= 20% of limit.
        const { data: qs, error: q2Err } = await admin
          .from('users')
          .select('id,email,membership,quota_limit,quota_used')
          .not('quota_limit', 'is', null)
          .limit(5000);
        if (!q2Err) {
          nearQuota = (qs || [])
            .map((r: any): { user_id: string; email: string | null; membership: string | null; remaining: number; limit: number } => {
              const limit = Number(r.quota_limit ?? 0);
              const used = Number(r.quota_used ?? 0);
              const remaining = Math.max(0, limit - used);
              return { user_id: r.id, email: r.email ?? null, membership: r.membership ?? null, remaining, limit };
            })
            .filter((r: { remaining: number; limit: number }) => r.limit > 0 && r.remaining / r.limit <= 0.2)
            .sort((a: { remaining: number }, b: { remaining: number }) => a.remaining - b.remaining)
            .slice(0, 20);
        }
      }
    } catch {
      // ignore
    }

    // Join user emails for spenders + repeated errors
    const joinIds = Array.from(new Set([...spenderIds, ...repeatedIds, ...nearQuota.map((n) => n.user_id)])).slice(0, 200);
    const userMap: Record<string, { email: string | null; membership: string | null }> = {};
    if (joinIds.length > 0) {
      const { data: users, error: uErr } = await admin.from('users').select('id,email,membership').in('id', joinIds);
      if (uErr) return res.status(500).json({ ok: false, error: 'Failed to load users', details: uErr });
      for (const u of users || []) userMap[u.id] = { email: u.email ?? null, membership: u.membership ?? null };
    }

    const big_spenders = spenderList.map((s) => ({ ...s, email: userMap[s.user_id]?.email ?? null, membership: userMap[s.user_id]?.membership ?? null }));
    const repeated_errors = repeated.map((r) => ({ ...r, email: userMap[r.user_id]?.email ?? null, membership: userMap[r.user_id]?.membership ?? null }));

    // nearQuota already includes email/membership if quota fields exist; fill if missing
    nearQuota = nearQuota.map((n) => ({
      ...n,
      email: n.email ?? userMap[n.user_id]?.email ?? null,
      membership: n.membership ?? userMap[n.user_id]?.membership ?? null,
    }));

    return res.status(200).json({
      ok: true,
      window: { days, since: sinceIso },
      near_quota: nearQuota,
      repeated_errors,
      big_spenders,
    });
  } catch (err: any) {
    console.error('adminWatchlist error:', err);
    return res.status(500).json({ ok: false, error: err?.message || 'adminWatchlist failed' });
  }
}