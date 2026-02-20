import { requireSupabaseAuth } from './_auth.js';

export default async function handler(req: any, res: any) {
  try {
    const auth = await requireSupabaseAuth(req);
    if (!auth.ok) {
      return res.status(auth.status).json({ ok: false, error: auth.error });
    }

    const { admin, userId } = auth as any;

    const { data: me } = await admin.from('users').select('id,is_admin').eq('id', userId).maybeSingle();
    if (!me?.is_admin) return res.status(403).json({ ok: false, error: 'Forbidden' });

    const days = Math.min(30, Math.max(1, Number(req?.query?.days || 7)));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data: events, error: evErr } = await admin
      .from('ai_usage_events')
      .select('occurred_at,outcome,http_status,charged_units,membership,tool,user_id')
      .gte('occurred_at', since)
      .order('occurred_at', { ascending: false })
      .limit(2000);

    if (evErr) return res.status(500).json({ ok: false, error: 'Telemetry read failed', details: evErr });

    const { data: flags } = await admin
      .from('ai_anomaly_flags')
      .select('created_at,reason,severity,resolved,metadata,user_id,identity_key')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(200);

    // Compute simple aggregates server-side
    const totals = {
      totalEvents: events?.length || 0,
      totalChargedUnits: (events || []).reduce((a: number, e: any) => a + (Number(e.charged_units) || 0), 0),
      byStatus: {} as Record<string, number>,
      byTool: {} as Record<string, number>,
      byMembership: {} as Record<string, number>,
    };

    for (const e of events || []) {
      const s = String(e.http_status ?? 'NA');
      totals.byStatus[s] = (totals.byStatus[s] || 0) + 1;
      const t = String(e.tool || 'unknown');
      totals.byTool[t] = (totals.byTool[t] || 0) + 1;
      const m = String(e.membership || 'unknown');
      totals.byMembership[m] = (totals.byMembership[m] || 0) + 1;
    }

    return res.status(200).json({ ok: true, since, days, totals, events, flags });
  } catch (err: any) {
    console.error('adminUsageDashboard error', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}
