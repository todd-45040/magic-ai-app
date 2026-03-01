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
  founding_circle_member?: boolean | null;
};

function isUndefinedColumn(err: any): boolean {
  const code = String(err?.code || '');
  const msg = String(err?.message || err?.details || '');

  // Postgres undefined_column is 42703
  if (code === '42703') return true;

  // PostgREST schema cache / missing column often returns PGRST204 with wording like:
  // "Could not find the 'membership' column of 'users' in the schema cache"
  if (code === 'PGRST204') return true;

  if (/schema\s+cache/i.test(msg) && /could\s+not\s+find/i.test(msg)) return true;
  if (/could\s+not\s+find\s+the\s+'?.+?'?\s+column/i.test(msg)) return true;
  if (/column\s+.+\s+does not exist/i.test(msg)) return true;

  return false;
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

    const includeLifetime = String(req?.query?.lifetime ?? '') === '1';
    const foundersOnly = String(req?.query?.founders ?? '') === '1';

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

    // PRODUCTION REALITY:
    // - Some deployments use `tier` instead of `membership`
    // - Some deployments do NOT have `created_at` on public.users
    // We therefore try up to 4 variants:
    //   1) membership + created_at
    //   2) membership (no created_at)
    //   3) tier + created_at
    //   4) tier (no created_at)

    const buildQuery = (planCol: 'membership' | 'tier', includeCreatedAt: boolean, includeFounderCol: boolean) => {
      const baseCols = includeCreatedAt
        ? planCol === 'membership'
          ? 'id,email,membership,created_at'
          : 'id,email,tier,created_at'
        : planCol === 'membership'
          ? 'id,email,membership'
          : 'id,email,tier';

      const selectCols = includeFounderCol ? `${baseCols},founding_circle_member,is_founder` : baseCols;

      let query: any = admin.from('users').select(selectCols, { count: 'exact' });

      if (foundersOnly) {
        // Requires the founding_circle_member column to exist.
        query = query.or('is_founder.eq.true,founding_circle_member.eq.true');
      }

      if (userIds.length > 0) query = query.in('id', userIds);

      if (userIds.length === 0 && plan && plan !== 'all') {
        if (plan === 'pro' || plan === 'professional') {
          query = query.in(planCol, ['professional', 'pro']);
        } else {
          query = query.eq(planCol, plan);
        }
      }

      if (userIds.length === 0 && q) {
        query = query.ilike('email', `%${q.replace(/%/g, '')}%`);
      }

      return { query, includeCreatedAt };
    };

    const run = async (variant: { query: any; includeCreatedAt: boolean }) => {
      // If created_at exists, sort newest first. Otherwise fall back to email.
      const base = variant.includeCreatedAt
        ? variant.query.order('created_at', { ascending: false })
        : variant.query.order('email', { ascending: true, nullsFirst: true });
      return userIds.length > 0 ? await base.limit(userIds.length) : await base.range(offset, offset + limit - 1);
    };

    const variants = [
      buildQuery('membership', true, true),
      buildQuery('membership', false, true),
      buildQuery('tier', true, true),
      buildQuery('tier', false, true),
      // Fallback (no founder column) – only valid when not filtering founders
      ...(foundersOnly ? [] : [
        buildQuery('membership', true, false),
        buildQuery('membership', false, false),
        buildQuery('tier', true, false),
        buildQuery('tier', false, false),
      ]),
    ];

    let users: any[] | null = null;
    let count: number | null = null;
    let uErr: any = null;

    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];
      const r = await run(v);
      users = (r as any).data ?? null;
      count = (r as any).count ?? null;
      uErr = (r as any).error ?? null;

      if (!uErr) break;
      // Only fall through to the next variant if this looks like a missing-column/schema-cache issue.
      if (!isUndefinedColumn(uErr)) break;
    }

    if (uErr) {
      // If the user requested Founders-only and the column doesn't exist, return a clear error.
      if (foundersOnly && isUndefinedColumn(uErr)) {
        return res.status(400).json({ ok: false, error: 'Founding Circle columns are not installed yet.' });
      }
      return res.status(500).json({ ok: false, error: 'Failed to load users', details: uErr });
    }

    const rows = (users || []) as UserRow[];
    const ids = rows.map((r) => r.id).filter(Boolean);


    // Pull signup created_at from Supabase Auth (canonical), so UI can show "Created" even when public.users has no created_at
    const authCreatedAt: Record<string, string> = {};
    try {
      const need = new Set(ids);
      if (need.size > 0 && admin?.auth?.admin?.listUsers) {
        let pageNum = 1;
        const perPage = 1000;
        while (need.size > 0 && pageNum <= 20) {
          const { data, error } = await admin.auth.admin.listUsers({ page: pageNum, perPage });
          if (error) break;
          const list = (data?.users || []) as any[];
          if (!list.length) break;
          for (const u of list) {
            const uid = String(u?.id || '');
            if (uid && need.has(uid)) {
              authCreatedAt[uid] = String(u?.created_at || '');
              need.delete(uid);
            }
          }
          if (list.length < perPage) break;
          pageNum += 1;
        }
      }
    } catch {
      // ignore (created_at will remain null)
    }


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


    // Optional: total lifetime events per user (used for the "Lifetime events" toggle)
    const lifetimeEvents: Record<string, number> = {};
    if (includeLifetime && ids.length > 0) {
      for (const id of ids) lifetimeEvents[id] = 0;
      try {
        const { data: allEvs, error: allErr } = await admin
          .from('ai_usage_events')
          .select('user_id')
          .in('user_id', ids)
          .limit(50000);
        if (!allErr && Array.isArray(allEvs)) {
          for (const e of allEvs as any[]) {
            const uid = String(e?.user_id || '');
            if (uid && lifetimeEvents[uid] != null) lifetimeEvents[uid] += 1;
          }
        }
      } catch {
        // ignore
      }
    }

    const out = rows.map((u) => ({
      id: u.id,
      email: u.email,
      membership: (u.membership ?? u.tier ?? null) as any,
      created_at: u.created_at ?? authCreatedAt[u.id] ?? null,
      founding_circle_member: (u as any).founding_circle_member ?? null,
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
