import { requireSupabaseAuth } from './_auth.js';
import { ADMIN_WINDOW_OPTIONS_DAYS, adminWindowLabel, isoDaysAgo, parseAdminWindowDays, ymdDaysAgo } from './_adminWindow.js';

export default async function handler(req: any, res: any) {
  try {
    const auth = await requireSupabaseAuth(req);
    if (!auth.ok) {
      return res.status(auth.status).json({ ok: false, error: auth.error });
    }

    const { admin, userId } = auth as any;

    const { data: me } = await admin.from('users').select('id,is_admin').eq('id', userId).maybeSingle();
    if (!me?.is_admin) return res.status(403).json({ ok: false, error: 'Forbidden' });

    const days = parseAdminWindowDays(req?.query?.days, 7);
    const since = isoDaysAgo(days);
    const sinceDay = ymdDaysAgo(days);

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


    const { data: rollups, error: rErr } = await admin
      .from('ai_usage_rollups_daily')
      .select('day,tool,membership,total_events,total_success,total_429,total_charged_units,total_estimated_cost_usd')
      .gte('day', sinceDay)
      .order('day', { ascending: false })
      .limit(2000);

    // Prefer rollups for totals if available
    if (!rErr && rollups && rollups.length > 0) {
      const totals2 = {
        totalEvents: rollups.reduce((a: number, r: any) => a + (Number(r.total_events) || 0), 0),
        totalChargedUnits: rollups.reduce((a: number, r: any) => a + (Number(r.total_charged_units) || 0), 0),
        totalEstimatedCostUSD: rollups.reduce((a: number, r: any) => a + (Number(r.total_estimated_cost_usd) || 0), 0),
        byStatus: {} as Record<string, number>,
        byTool: {} as Record<string, number>,
        byMembership: {} as Record<string, number>,
      };

      // rollups don't have full status histogram; approximate key ones
      const success = rollups.reduce((a: number, r: any) => a + (Number(r.total_success) || 0), 0);
      const s429 = rollups.reduce((a: number, r: any) => a + (Number(r.total_429) || 0), 0);
      totals2.byStatus['200'] = success;
      totals2.byStatus['429'] = s429;

      for (const r of rollups) {
        const t = String(r.tool || 'unknown');
        totals2.byTool[t] = (totals2.byTool[t] || 0) + (Number(r.total_events) || 0);
        const m = String(r.membership || 'unknown');
        totals2.byMembership[m] = (totals2.byMembership[m] || 0) + (Number(r.total_events) || 0);
      }

      return res.status(200).json({ ok: true, window: { days, label: adminWindowLabel(days), sinceIso: since, sinceDay, optionsDays: ADMIN_WINDOW_OPTIONS_DAYS }, totals: totals2, rollups, events, flags });
    }

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

    return res.status(200).json({ ok: true, window: { days, label: adminWindowLabel(days), sinceIso: since, sinceDay, optionsDays: ADMIN_WINDOW_OPTIONS_DAYS }, totals, events, flags });
  } catch (err: any) {
    console.error('adminUsageDashboard error', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}
