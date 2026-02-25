import { requireSupabaseAuth } from './_auth.js';
import { ADMIN_WINDOW_OPTIONS_DAYS, adminWindowLabel, isoDaysAgo, parseAdminWindowDays } from './_adminWindow.js';

function clampInt(n: any, def = 20, min = 1, max = 200) {
  const v = Number(n);
  if (!Number.isFinite(v)) return def;
  return Math.min(max, Math.max(min, Math.floor(v)));
}


export default async function handler(req: any, res: any) {
  try {
    const auth = await requireSupabaseAuth(req);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

    const { admin, userId } = auth as any;

    const { data: me, error: meErr } = await admin.from('users').select('id,is_admin').eq('id', userId).maybeSingle();
    if (meErr) return res.status(500).json({ ok: false, error: 'Admin check failed', details: meErr });
    if (!me?.is_admin) return res.status(403).json({ ok: false, error: 'Forbidden' });

    const days = parseAdminWindowDays(req?.query?.days, 30);
    const sinceIso = isoDaysAgo(days);
    const limit = clampInt(req?.query?.limit ?? 20, 20, 1, 100);

    // Pull a bounded set of events and aggregate server-side
    const { data: evs, error: eErr } = await admin
      .from('ai_usage_events')
      .select('user_id,estimated_cost_usd')
      .gte('occurred_at', sinceIso)
      .not('user_id', 'is', null)
      .limit(50000);

    if (eErr) return res.status(500).json({ ok: false, error: 'Failed to load usage events', details: eErr });

    const costByUser = new Map<string, number>();
    for (const e of (evs || []) as any[]) {
      const uid = String(e?.user_id || '');
      if (!uid) continue;
      const c = Number(e?.estimated_cost_usd || 0);
      costByUser.set(uid, (costByUser.get(uid) || 0) + (Number.isFinite(c) ? c : 0));
    }

    const top = Array.from(costByUser.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    const ids = top.map(([id]) => id);
    const { data: users, error: uErr } = await admin.from('users').select('id,email,membership').in('id', ids).limit(200);
    if (uErr) return res.status(500).json({ ok: false, error: 'Failed to load user info', details: uErr });

    const info = new Map<string, any>();
    for (const u of (users || []) as any[]) info.set(String(u.id), u);

    const rows = top.map(([id, cost]) => ({
      user_id: id,
      email: info.get(id)?.email ?? null,
      membership: info.get(id)?.membership ?? null,
      cost_usd_window: Number(cost.toFixed(4)),
    }));

    return res.status(200).json({
      ok: true,
      window: { days, label: adminWindowLabel(days), sinceIso, optionsDays: ADMIN_WINDOW_OPTIONS_DAYS },
      top_spenders: rows,
    });
  } catch (err: any) {
    console.error('adminTopSpenders error', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}
