import React, { useEffect, useMemo, useState } from 'react';
import { fetchAdminSummary } from '../services/adminSummaryService';
import { fetchAdminTopSpenders, type TopSpenderRow } from '../services/adminTopSpendersService';

function money(n: any, digits = 2) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return `$${v.toFixed(digits)}`;
}

export default function AdminOverviewDashboard({ onGoUsers }: { onGoUsers?: () => void }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [topSpenders, setTopSpenders] = useState<TopSpenderRow[]>([]);
  const [topErr, setTopErr] = useState<string | null>(null);
  const [topLoading, setTopLoading] = useState(false);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const d = await fetchAdminSummary(days);
      setData(d);
      // load top spenders for anomaly detection
      setTopLoading(true);
      setTopErr(null);
      try {
        const t = await fetchAdminTopSpenders(days, 15);
        setTopSpenders(t.top_spenders || []);
      } catch (e: any) {
        setTopErr(e?.message || 'Failed to load top spenders');
        setTopSpenders([]);
      } finally {
        setTopLoading(false);
      }
    } catch (e: any) {
      setErr(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const byPlan = data?.users?.byPlan || {};
  const total = Number(data?.users?.total || 0);
  const active = Number(data?.users?.active || 0);
  const paid = Number(byPlan.pro || 0) + Number(byPlan.amateur || 0);

  const costByTool = useMemo(() => {
    const obj = data?.cost?.cost_by_tool_usd_window || {};
    return Object.entries(obj).slice(0, 8);
  }, [data]);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Admin – Overview</h2>
          <div className="text-sm opacity-75">User base health + revenue & cost estimates (pre-Stripe).</div>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm opacity-80">Window</label>
          <select
            className="px-2 py-1 rounded border border-white/10 bg-black/20"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
            <option value={90}>90 days</option>
          </select>
          <button className="px-3 py-1 rounded bg-white/10 hover:bg-white/15" onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {err && <div className="p-3 rounded bg-red-500/10 border border-red-500/20 text-red-200">{err}</div>}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="text-sm opacity-80">Total Users</div>
          <div className="text-2xl font-bold">{total || '—'}</div>
          <div className="text-xs opacity-70 mt-1">From users table</div>
        </div>
        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="text-sm opacity-80">Active Users</div>
          <div className="text-2xl font-bold">{active || '—'}</div>
          <div className="text-xs opacity-70 mt-1">Any AI usage in window</div>
        </div>
        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="text-sm opacity-80">Paid Users</div>
          <div className="text-2xl font-bold">{paid || '—'}</div>
          <div className="text-xs opacity-70 mt-1">Pro + Amateur</div>
        </div>
        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="text-sm opacity-80">Estimated MRR</div>
          <div className="text-2xl font-bold">{money(data?.revenue?.mrr_est, 2)}</div>
          <div className="text-xs opacity-70 mt-1">Pre-Stripe estimate</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="text-sm opacity-80">Trial</div>
          <div className="text-2xl font-bold">{Number(byPlan.trial || 0)}</div>
          <div className="text-xs opacity-70 mt-1">users.membership = trial</div>
        </div>
        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="text-sm opacity-80">Amateur</div>
          <div className="text-2xl font-bold">{Number(byPlan.amateur || 0)}</div>
          <div className="text-xs opacity-70 mt-1">${Number(data?.revenue?.pricesUSD?.amateur || 9.95).toFixed(2)}/mo</div>
        </div>
        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="text-sm opacity-80">Pro</div>
          <div className="text-2xl font-bold">{Number(byPlan.pro || 0)}</div>
          <div className="text-xs opacity-70 mt-1">${Number(data?.revenue?.pricesUSD?.pro || 29.95).toFixed(2)}/mo</div>
        </div>
        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="text-sm opacity-80">Est. Margin</div>
          <div className="text-2xl font-bold">{money(data?.margin?.gross_margin_est_window, 2)}</div>
          <div className="text-xs opacity-70 mt-1">MRR − AI cost − infra est.</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold">Costs</div>
            <div className="text-xs opacity-70">Window</div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 rounded-lg bg-black/20 border border-white/10">
              <div className="text-xs opacity-70">AI Cost</div>
              <div className="text-lg font-bold">{money(data?.cost?.ai_cost_usd_window, 4)}</div>
            </div>
            <div className="p-3 rounded-lg bg-black/20 border border-white/10">
              <div className="text-xs opacity-70">Infra (est.)</div>
              <div className="text-lg font-bold">{money(data?.margin?.infra_est_usd_month, 2)}</div>
            </div>
          </div>

          <div className="mt-3">
            <div className="text-sm font-semibold mb-2">Top cost by tool</div>
            {costByTool.length === 0 ? (
              <div className="text-sm opacity-70">No cost data found in this window.</div>
            ) : (
              <ul className="text-sm space-y-1">
                {costByTool.map(([k, v]: any) => (
                  <li key={k} className="flex justify-between">
                    <span className="opacity-80">{k}</span>
                    <span className="font-mono">{money(v, 4)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="font-semibold mb-2">Raw JSON (Debug)</div>
          <div className="text-xs opacity-70 mb-2">Useful during early rollout</div>
          <pre className="text-xs overflow-auto rounded-lg bg-black/30 border border-white/10 p-3 max-h-[320px]">
            {data ? JSON.stringify(data, null, 2) : '{ }'}
          </pre>
        </div>
      </div>
    </div>
  );
}
