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
  tier?: string | null;
  created_at?: string | null;
};

function isUndefinedColumn(err: any): boolean {
  const code = String(err?.code || '');
  const msg = String(err?.message || err?.details || '');
  // Postgres undefined_column is 42703
  if (code === '42703') return true;
  // PostgREST schema cache missing column
  if (code === 'PGRST204') return true;
  return /column\s+.+\s+does not exist/i.test(msg);
}

function isMissingSelectColumn(err: any): boolean {
  const code = String(err?.code || '');
  const msg = String(err?.message || err?.details || '');
  if (code === 'PGRST204') return true;
  return /could not find.*column/i.test(msg) || /schema cache/i.test(msg);
}

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

    // Some deployments differ:
    // - plan column: `membership` vs `tier`
    // - created timestamp: `created_at` may not exist on users table
    // We progressively fall back to a compatible select set.
    const selectMembership = (withCreatedAt: boolean) =>
      admin
        .from('users')
        .select(withCreatedAt ? 'id,email,membership,created_at' : 'id,email,membership', { count: 'exact' });
    const selectTier = (withCreatedAt: boolean) =>
      admin.from('users').select(withCreatedAt ? 'id,email,tier,created_at' : 'id,email,tier', { count: 'exact' });

    let usingTier = false;
    let withCreatedAt = true;

    const run = async (q: any) => {
      // Only order by created_at if it exists in the select
      const base = withCreatedAt ? q.order('created_at', { ascending: false }) : q;
      return userIds.length > 0 ? await base.limit(userIds.length) : await base.range(offset, offset + limit - 1);
    };

    const applyFilters = (q0: any, planCol: 'membership' | 'tier') => {
      let qq: any = q0;
      if (userIds.length > 0) qq = qq.in('id', userIds);

      if (userIds.length === 0 && plan && plan !== 'all') {
        if (plan === 'pro' || plan === 'professional') {
          qq = qq.in(planCol, ['professional', 'pro']);
        } else {
          qq = qq.eq(planCol, plan);
        }
      }

      if (userIds.length === 0 && q) {
        qq = qq.ilike('email', `%${q.replace(/%/g, '')}%`);
      }
      return qq;
    };

    let users: any[] | null = null;
    let count: number | null = null;
    let uErr: any = null;

    const attempt = async () => {
      const base = usingTier ? selectTier(withCreatedAt) : selectMembership(withCreatedAt);
      const planCol = usingTier ? ('tier' as const) : ('membership' as const);
      const q1 = applyFilters(base, planCol);
      const r = await run(q1);
      users = (r as any).data ?? null;
      count = (r as any).count ?? null;
      uErr = (r as any).error ?? null;
    };

    // Attempt 1: membership + created_at
    await attempt();

    // If created_at missing, retry without it (same plan column)
    if (uErr && isMissingSelectColumn(uErr) && withCreatedAt) {
      withCreatedAt = false;
      await attempt();
    }

    // If plan column missing, switch to tier (keeping created_at preference)
    if (uErr && isUndefinedColumn(uErr)) {
      usingTier = true;
      await attempt();
      if (uErr && isMissingSelectColumn(uErr) && withCreatedAt) {
        withCreatedAt = false;
        await attempt();
      }
    }

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
      membership: (u.membership ?? u.tier ?? null) as any,
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
