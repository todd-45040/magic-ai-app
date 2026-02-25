import React, { useEffect, useMemo, useState } from 'react';
import AdminWindowSelector from './AdminWindowSelector';
import { fetchAdminUsageDashboard, resolveAnomalyFlag } from '../services/adminUsageDashboardService';

export default function AdminUsageDashboard() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const d = await fetchAdminUsageDashboard(days);
      setData(d);
    } catch (e: any) {
      setErr(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [days]);

  const totals = data?.totals;
  const topStatuses = useMemo(() => Object.entries(totals?.byStatus || {}).sort((a:any,b:any)=>b[1]-a[1]).slice(0,8), [totals]);
  const topTools = useMemo(() => Object.entries(totals?.byTool || {}).sort((a:any,b:any)=>b[1]-a[1]).slice(0,8), [totals]);
  const topMembership = useMemo(() => Object.entries(totals?.byMembership || {}).sort((a:any,b:any)=>b[1]-a[1]).slice(0,8), [totals]);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Admin – Usage & Telemetry</h2>
        <div className="flex items-center gap-2">
          <AdminWindowSelector value={days} onChange={(d) => setDays(d)} />
          <button className="px-3 py-1 rounded bg-white/10 hover:bg-white/15" onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {err && <div className="p-3 rounded bg-red-500/10 border border-red-500/20 text-red-200">{err}</div>}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="text-sm opacity-80">Events</div>
          <div className="text-2xl font-bold">{totals?.totalEvents ?? '—'}</div>
          <div className="text-xs opacity-70 mt-1">Last {days} day(s)</div>
        </div>
        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="text-sm opacity-80">Charged Units</div>
          <div className="text-2xl font-bold">{totals?.totalChargedUnits ?? '—'}</div>
          <div className="text-xs opacity-70 mt-1">Best-effort telemetry</div>
        </div>
        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="text-sm opacity-80">Estimated Cost</div>
          <div className="text-2xl font-bold">{totals?.totalEstimatedCostUSD != null ? `$${Number(totals.totalEstimatedCostUSD).toFixed(4)}` : '—'}</div>
          <div className="text-xs opacity-70 mt-1">Approx. (guardrail)</div>
        </div>
        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="text-sm opacity-80">Anomaly Flags</div>
          <div className="text-2xl font-bold">{(data?.flags || []).filter((f:any)=>!f.resolved).length}</div>
          <div className="text-xs opacity-70 mt-1">Unresolved</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="font-semibold mb-2">HTTP Status</div>
          <ul className="text-sm space-y-1">
            {topStatuses.map(([k,v]: any) => <li key={k} className="flex justify-between"><span className="opacity-80">{k}</span><span className="font-mono">{v}</span></li>)}
          </ul>
        </div>
        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="font-semibold mb-2">Tools</div>
          <ul className="text-sm space-y-1">
            {topTools.map(([k,v]: any) => <li key={k} className="flex justify-between"><span className="opacity-80">{k}</span><span className="font-mono">{v}</span></li>)}
          </ul>
        </div>
        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="font-semibold mb-2">Membership</div>
          <ul className="text-sm space-y-1">
            {topMembership.map(([k,v]: any) => <li key={k} className="flex justify-between"><span className="opacity-80">{k}</span><span className="font-mono">{v}</span></li>)}
          </ul>
        </div>
      </div>

      <div className="p-3 rounded-xl bg-white/5 border border-white/10">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold">Recent Anomaly Flags</div>
          <div className="text-xs opacity-70">Showing up to 200</div>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left opacity-80">
              <tr>
                <th className="py-2 pr-4">Time</th>
                <th className="py-2 pr-4">Severity</th>
                <th className="py-2 pr-4">Reason</th>
                <th className="py-2 pr-4">User</th>
                <th className="py-2 pr-4">Resolved</th>
              </tr>
            </thead>
            <tbody>
              {(data?.flags || []).slice(0, 50).map((f: any, idx: number) => (
                <tr key={idx} className="border-t border-white/10">
                  <td className="py-2 pr-4 font-mono text-xs">{String(f.created_at).replace('T',' ').slice(0,19)}</td>
                  <td className="py-2 pr-4">{f.severity}</td>
                  <td className="py-2 pr-4">{f.reason}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{f.user_id || '—'}</td>
                  <td className="py-2 pr-4">{f.resolved ? 'yes' : 'no'}</td>
                </tr>
              ))}
              {(!data?.flags || data.flags.length === 0) && (
                <tr><td className="py-3 opacity-70" colSpan={5}>No flags in this window.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      
      <div className="p-3 rounded-xl bg-white/5 border border-white/10">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold">Daily Rollups</div>
          <div className="text-xs opacity-70">Fast aggregates (up to 2000 rows)</div>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left opacity-80">
              <tr>
                <th className="py-2 pr-4">Day</th>
                <th className="py-2 pr-4">Tool</th>
                <th className="py-2 pr-4">Plan</th>
                <th className="py-2 pr-4">Events</th>
                <th className="py-2 pr-4">200</th>
                <th className="py-2 pr-4">429</th>
                <th className="py-2 pr-4">Charged</th>
                <th className="py-2 pr-4">Est. Cost</th>
              </tr>
            </thead>
            <tbody>
              {(data?.rollups || []).slice(0, 60).map((r: any, idx: number) => (
                <tr key={idx} className="border-t border-white/10">
                  <td className="py-2 pr-4 font-mono text-xs">{String(r.day)}</td>
                  <td className="py-2 pr-4">{r.tool}</td>
                  <td className="py-2 pr-4">{r.membership}</td>
                  <td className="py-2 pr-4">{r.total_events}</td>
                  <td className="py-2 pr-4">{r.total_success}</td>
                  <td className="py-2 pr-4">{r.total_429}</td>
                  <td className="py-2 pr-4">{r.total_charged_units}</td>
                  <td className="py-2 pr-4">{r.total_estimated_cost_usd != null ? `$${Number(r.total_estimated_cost_usd).toFixed(4)}` : '—'}</td>
                </tr>
              ))}
              {(!data?.rollups || data.rollups.length === 0) && (
                <tr><td className="py-3 opacity-70" colSpan={8}>No rollups yet. Run recompute_ai_usage_rollups(7) or enable trigger.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="p-3 rounded-xl bg-white/5 border border-white/10">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold">Recent Events</div>
          <div className="text-xs opacity-70">Showing up to 2000 (latest)</div>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left opacity-80">
              <tr>
                <th className="py-2 pr-4">Time</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Outcome</th>
                <th className="py-2 pr-4">Tool</th>
                <th className="py-2 pr-4">Units</th>
                <th className="py-2 pr-4">Charged</th>
                <th className="py-2 pr-4">Membership</th>
              </tr>
            </thead>
            <tbody>
              {(data?.events || []).slice(0, 100).map((e: any, idx: number) => (
                <tr key={idx} className="border-t border-white/10">
                  <td className="py-2 pr-4 font-mono text-xs">{String(e.occurred_at).replace('T',' ').slice(0,19)}</td>
                  <td className="py-2 pr-4">{e.http_status ?? '—'}</td>
                  <td className="py-2 pr-4">{e.outcome}</td>
                  <td className="py-2 pr-4">{e.tool || '—'}</td>
                  <td className="py-2 pr-4">{e.units ?? '—'}</td>
                  <td className="py-2 pr-4">{e.charged_units ?? '—'}</td>
                  <td className="py-2 pr-4">{e.membership || '—'}</td>
                </tr>
              ))}
              {(!data?.events || data.events.length === 0) && (
                <tr><td className="py-3 opacity-70" colSpan={7}>No events in this window.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
