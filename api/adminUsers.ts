import { requireSupabaseAuth } from './_auth.js';
import { ADMIN_WINDOW_OPTIONS_DAYS, adminWindowLabel, isoDaysAgo, parseAdminWindowDays } from './_adminWindow.js';

function clampInt(n: any, def = 50, min = 1, max = 500) {
  const v = Number(n);
  if (!Number.isFinite(v)) return def;
  return Math.min(max, Math.max(min, Math.floor(v)));
}


type UserRow = {
  id: string;
  email: string | null;
  membership: string | null;
  created_at?: string | null;
};

export default async function handler(req: any, res: any) {
  try {
    const auth = await requireSupabaseAuth(req);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

    const { admin, userId } = auth as any;

    // Admin-only gate
    const { data: me, error: meErr } = await admin.from('users').select('id,is_admin').eq('id', userId).maybeSingle();
    if (meErr) return res.status(500).json({ ok: false, error: 'Admin check failed', details: meErr });
    if (!me?.is_admin) return res.status(403).json({ ok: false, error: 'Forbidden' });

    const limit = clampInt(req?.query?.limit ?? 50, 50, 1, 200);
    const offset = clampInt(req?.query?.offset ?? 0, 0, 0, 500000);
    const days = parseAdminWindowDays(req?.query?.days, 30);
    const sinceIso = isoDaysAgo(days);

    const plan = (req?.query?.plan ?? 'all') as string;
    const q = String(req?.query?.q ?? '').trim();
    const userIdsRaw = String(req?.query?.user_ids ?? '').trim();
    const userIds = userIdsRaw
      ? userIdsRaw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 200)
      : [];

    let query = admin.from('users').select('id,email,membership,created_at', { count: 'exact' });

    if (userIds.length > 0) {
      query = query.in('id', userIds);
    }

    if (userIds.length === 0 && plan && plan !== 'all') {
      // support "pro" alias
      if (plan === 'pro' || plan === 'professional') {
        query = query.in('membership', ['professional', 'pro']);
      } else {
        query = query.eq('membership', plan);
      }
    }

    if (userIds.length === 0 && q) {
      // basic email search
      query = query.ilike('email', `%${q.replace(/%/g, '')}%`);
    }

    const base = query.order('created_at', { ascending: false });
    const { data: users, error: uErr, count } = userIds.length > 0 ? await base.limit(userIds.length) : await base.range(offset, offset + limit - 1);

    if (uErr) return res.status(500).json({ ok: false, error: 'Failed to load users', details: uErr });

    const rows = (users || []) as UserRow[];
    const ids = rows.map((r) => r.id).filter(Boolean);

    // Compute last_active_at and cost in window for returned users
    const perUser: Record<string, { last_active_at: string | null; cost_usd: number; events: number }> = {};
    for (const id of ids) perUser[id] = { last_active_at: null, cost_usd: 0, events: 0 };

    if (ids.length > 0) {
      // Pull events for this page only (bounded)
      const { data: evs, error: eErr } = await admin
        .from('ai_usage_events')
        .select('user_id,occurred_at,estimated_cost_usd')
        .in('user_id', ids)
        .gte('occurred_at', sinceIso)
        .limit(50000);

      if (!eErr && Array.isArray(evs)) {
        for (const e of evs as any[]) {
          const uid = String(e?.user_id || '');
          if (!uid || !perUser[uid]) continue;
          const ts = e?.occurred_at ? String(e.occurred_at) : null;
          const c = Number(e?.estimated_cost_usd || 0);
          perUser[uid].cost_usd += Number.isFinite(c) ? c : 0;
          perUser[uid].events += 1;
          if (ts) {
            if (!perUser[uid].last_active_at || ts > perUser[uid].last_active_at) perUser[uid].last_active_at = ts;
          }
        }
      }
    }

    const out = rows.map((u) => ({
      id: u.id,
      email: u.email,
      membership: u.membership,
      created_at: u.created_at ?? null,
      last_active_at: perUser[u.id]?.last_active_at ?? null,
      cost_usd_window: Number((perUser[u.id]?.cost_usd ?? 0).toFixed(4)),
      events_window: perUser[u.id]?.events ?? 0,
    }));

    return res.status(200).json({
      ok: true,
      window: { days, label: adminWindowLabel(days), sinceIso, optionsDays: ADMIN_WINDOW_OPTIONS_DAYS },
      paging: { limit, offset, total: Number(count || 0) },
      users: out,
    });
  } catch (err: any) {
    console.error('adminUsers error', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}
