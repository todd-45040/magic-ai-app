import { requireSupabaseAuth } from './_auth.js';
import { isoDaysAgo, parseAdminWindowDays } from './_adminWindow.js';

function clampInt(n: any, def = 50, min = 0, max = 5000) {
  const v = Number(n);
  if (!Number.isFinite(v)) return def;
  return Math.min(max, Math.max(min, Math.floor(v)));
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

    const source = String(req?.query?.source ?? 'admc').trim() || 'admc';
    const days = parseAdminWindowDays(req?.query?.days, 30);
    const sinceIso = isoDaysAgo(days);

    const limit = clampInt(req?.query?.limit ?? 250, 250, 0, 5000);
    const offset = clampInt(req?.query?.offset ?? 0, 0, 0, 500000);

    // Query waitlist signups
    let q: any = admin
      .from('maw_waitlist_signups')
      .select('id,name,email,created_at,source,meta', { count: 'exact' })
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false });

    if (source && source !== 'all') q = q.eq('source', source);

    // Range only if limit > 0; otherwise just return count
    const r = limit > 0 ? await q.range(offset, offset + limit - 1) : await q.limit(1);

    if (r?.error) {
      return res.status(500).json({ ok: false, error: 'Failed to load leads', details: r.error });
    }

    const rows = (r?.data || []) as any[];
    const count = typeof r?.count === 'number' ? r.count : null;

    return res.status(200).json({ ok: true, source, days, since: sinceIso, count, rows });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || 'Server error' });
  }
}
