import { requireSupabaseAuth } from './_auth.js';
import { isoDaysAgo, parseAdminWindowDays } from './_adminWindow.js';

function clampInt(n: any, def = 50, min = 1, max = 500) {
  const v = Number(n);
  if (!Number.isFinite(v)) return def;
  return Math.min(max, Math.max(min, Math.floor(v)));
}

type AuthUser = {
  id: string;
  email: string | null;
  created_at: string | null;
};

async function listAuthUsers(admin: any, page: number, perPage: number): Promise<AuthUser[]> {
  try {
    const r = await admin.auth.admin.listUsers({ page, perPage });
    const users = r?.data?.users || [];
    return users.map((u: any) => ({ id: u.id, email: u.email ?? null, created_at: u.created_at ?? null }));
  } catch (e) {
    // Fallback: some client versions accept no params
    const r = await admin.auth.admin.listUsers();
    const users = r?.data?.users || [];
    return users.map((u: any) => ({ id: u.id, email: u.email ?? null, created_at: u.created_at ?? null }));
  }
}

export default async function handler(req: any, res: any) {
  try {
    const auth = await requireSupabaseAuth(req);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

    const { admin, userId } = auth as any;

    // Admin-only gate (public.users has is_admin)
    const { data: me, error: meErr } = await admin.from('users').select('id,is_admin').eq('id', userId).maybeSingle();
    if (meErr) return res.status(500).json({ ok: false, error: 'Admin check failed', details: meErr });
    if (!me?.is_admin) return res.status(403).json({ ok: false, error: 'Forbidden' });

    const limit = clampInt(req?.query?.limit ?? 50, 50, 1, 200);
    const offset = clampInt(req?.query?.offset ?? 0, 0, 0, 500000);
    const days = parseAdminWindowDays(req?.query?.days, 30);
    const sinceIso = isoDaysAgo(days);

    const plan = String(req?.query?.plan ?? 'all');
    const q = String(req?.query?.q ?? '').trim().toLowerCase();
    const userIdsRaw = String(req?.query?.user_ids ?? '').trim();
    const userIds = userIdsRaw
      ? userIdsRaw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 200)
      : [];

    // Step 1: pull a page of auth users (canonical source for email + created_at)
    let authUsers: AuthUser[] = [];
    let totalAuth: number | null = null;

    if (userIds.length > 0) {
      // Direct lookup for specified IDs
      const out: AuthUser[] = [];
      for (const id of userIds) {
        try {
          const r = await admin.auth.admin.getUserById(id);
          const u = r?.data?.user;
          if (u) out.push({ id: u.id, email: u.email ?? null, created_at: u.created_at ?? null });
        } catch {
          // ignore missing
        }
      }
      authUsers = out;
      totalAuth = out.length;
    } else {
      const perPage = limit; // keep same paging feel as UI
      const page = Math.floor(offset / perPage) + 1;
      authUsers = await listAuthUsers(admin, page, perPage);

      // best-effort total (some versions include total)
      try {
        const meta = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
        totalAuth = meta?.data?.total ?? null;
      } catch {
        totalAuth = null;
      }
    }

    // Local filters on auth users
    if (q) authUsers = authUsers.filter((u) => (u.email || '').toLowerCase().includes(q));

    const ids = authUsers.map((u) => u.id);

    // Step 2: pull public.users for plan + admin flags (membership/tier lives here)
    const { data: pubRows, error: pubErr } = ids.length
      ? await admin.from('users').select('id,email,membership,tier,is_admin').in('id', ids).limit(50000)
      : ({ data: [], error: null } as any);

    if (pubErr) return res.status(500).json({ ok: false, error: 'Failed to load users', details: pubErr });

    const pubMap = new Map<string, any>();
    for (const r of pubRows || []) pubMap.set(r.id, r);

    // Merge
    let rows = authUsers.map((u) => {
      const pr = pubMap.get(u.id) || {};
      const membership = pr.membership ?? pr.tier ?? null;
      return {
        id: u.id,
        email: u.email ?? pr.email ?? null,
        membership,
        created_at: u.created_at ?? null,
        is_admin: !!pr.is_admin,
      };
    });

    // Plan filter (applied after merge)
    if (plan && plan !== 'all') {
      const norm = (s: string) => s.toLowerCase();
      if (plan === 'pro' || plan === 'professional') {
        rows = rows.filter((r) => ['pro', 'professional'].includes(norm(String(r.membership || ''))));
      } else {
        rows = rows.filter((r) => norm(String(r.membership || '')) === norm(plan));
      }
    }

    // Window filter: only include users that had activity in window OR created in window?
    // Keep it simple: pass through; activity/cost is computed from events below.

    // Step 3: aggregate window activity + cost from ai_usage_events
    const { data: eventsAgg, error: evErr } = ids.length
      ? await admin
          .from('ai_usage_events')
          .select('user_id,estimated_cost_usd,occurred_at', { count: 'exact' })
          .in('user_id', ids)
          .gte('occurred_at', sinceIso)
          .limit(50000)
      : ({ data: [], error: null } as any);

    if (evErr) return res.status(500).json({ ok: false, error: 'Failed to load usage events', details: evErr });

    const byUser = new Map<string, { events: number; cost: number; lastActive: string | null }>();
    for (const e of eventsAgg || []) {
      const uid = e.user_id;
      if (!uid) continue;
      const cur = byUser.get(uid) || { events: 0, cost: 0, lastActive: null };
      cur.events += 1;
      const c = Number(e.estimated_cost_usd || 0);
      cur.cost += Number.isFinite(c) ? c : 0;
      const ts = e.occurred_at ? String(e.occurred_at) : null;
      if (ts && (!cur.lastActive || ts > cur.lastActive)) cur.lastActive = ts;
      byUser.set(uid, cur);
    }

    const usersOut = rows.map((r) => {
      const agg = byUser.get(r.id) || { events: 0, cost: 0, lastActive: null };
      return {
        id: r.id,
        email: r.email,
        plan: r.membership,
        created_at: r.created_at,
        last_active: agg.lastActive,
        events: agg.events,
        cost_usd: Math.round(agg.cost * 10000) / 10000,
        is_admin: r.is_admin,
      };
    });

    // stable sort by last_active then cost
    usersOut.sort((a, b) => (String(b.last_active || '')).localeCompare(String(a.last_active || '')));

    return res.status(200).json({
      ok: true,
      windowDays: days,
      count: totalAuth ?? usersOut.length,
      users: usersOut,
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: 'Unhandled error', details: String(e?.message || e) });
  }
}
