import React, { useEffect, useMemo, useState } from 'react';
import { fetchAdminKpis } from '../services/adminKpisService';
import { fetchAdminTopSpenders, type TopSpenderRow } from '../services/adminTopSpendersService';

function money(n: any, digits = 2) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return `$${v.toFixed(digits)}`;
}

function pct(n: any, digits = 0) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return `${(v * 100).toFixed(digits)}%`;
}

function ms(n: any) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  if (v >= 1000) return `${(v / 1000).toFixed(1)}s`;
  return `${Math.round(v)}ms`;
}

function durationFromMinutes(mins: any) {
  const v = Number(mins);
  if (!Number.isFinite(v)) return '—';
  if (v < 1) return `${Math.round(v * 60)}s`;
  if (v < 60) return `${Math.round(v)}m`;
  const h = v / 60;
  if (h < 24) return `${h.toFixed(1)}h`;
  const d = h / 24;
  return `${d.toFixed(1)}d`;
}

const WINDOW_OPTIONS = [
  { days: 1, label: 'Today' },
  { days: 7, label: '7d' },
  { days: 30, label: '30d' },
  { days: 90, label: '90d' },
];

export default function AdminOverviewDashboard({ onGoUsers }: { onGoUsers?: () => void }) {
  const [days, setDays] = useState<number>(7);
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
      const d = await fetchAdminKpis(days);
      setData(d);

      // Top spenders (ops / anomaly watchlist)
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
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const kUsers = data?.users || {};
  const kAi = data?.ai || {};
  const tools = data?.tools || {};
  const growth = data?.growth || {};
  const funnel = growth?.funnel || {};
  const ttfv = growth?.ttfv || {};
  const signupTrend = (growth?.signup_trend_30d || []) as any[];

  const topByUsage = useMemo(() => (tools?.top_by_usage || []).slice(0, 8), [tools]);
  const topByCost = useMemo(() => (tools?.top_by_cost || []).slice(0, 8), [tools]);
  const maxSignup = useMemo(() => Math.max(0, ...signupTrend.map((d: any) => Number(d?.new_users || 0))), [signupTrend]);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Admin – Overview</h2>
          <div className="text-sm opacity-75">Single-source KPIs (growth, activation, cost, reliability).</div>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm opacity-80">Window</label>
          <select
            className="px-2 py-1 rounded border border-white/10 bg-black/20"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {WINDOW_OPTIONS.map((o) => (
              <option key={o.days} value={o.days}>
                {o.label}
              </option>
            ))}
          </select>

          <button className="px-3 py-1 rounded bg-white/10 hover:bg-white/15" onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>

          {onGoUsers && (
            <button className="px-3 py-1 rounded bg-white/10 hover:bg-white/15" onClick={onGoUsers}>
              Users →
            </button>
          )}
        </div>
      </div>

      {err && <div className="p-3 rounded bg-red-500/10 border border-red-500/20 text-red-200">{err}</div>}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="text-sm opacity-80">New Users</div>
          <div className="text-2xl font-bold">{Number(kUsers.new || 0) || '—'}</div>
          <div className="text-xs opacity-70 mt-1">users.created_at in window</div>
        </div>

        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="text-sm opacity-80">Active Users</div>
          <div className="text-2xl font-bold">{Number(kUsers.active || 0) || '—'}</div>
          <div className="text-xs opacity-70 mt-1">≥1 ai_usage_event</div>
        </div>

        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="text-sm opacity-80">Activated Users</div>
          <div className="text-2xl font-bold">{Number(kUsers.activated || 0) || '—'}</div>
          <div className="text-xs opacity-70 mt-1">Activation rate: {pct(kUsers.activation_rate, 0)}</div>
        </div>

        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="text-sm opacity-80">AI Cost</div>
          <div className="text-2xl font-bold">{money(kAi.cost_usd)}</div>
          <div className="text-xs opacity-70 mt-1">Estimated cost in window</div>
        </div>
      </div>

      {/* Phase 2 — Growth + Activation Funnel */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="text-sm font-medium">Funnel</div>
          <div className="text-xs opacity-70 mt-0.5">New → Activated → Returning (WAU)</div>
          <div className="mt-3 space-y-1 text-sm">
            <div className="flex items-center justify-between"><span className="opacity-80">New</span><span className="font-semibold">{Number(funnel.new_users || 0) || '—'}</span></div>
            <div className="flex items-center justify-between"><span className="opacity-80">Activated</span><span className="font-semibold">{Number(funnel.activated_users || 0) || '—'}</span></div>
            <div className="flex items-center justify-between"><span className="opacity-80">Returning (WAU 7d)</span><span className="font-semibold">{Number(funnel.returning_wau_7d || 0) || '—'}</span></div>
          </div>
          <div className="text-xs opacity-60 mt-2">Returning = ≥1 event in last 7 days</div>
        </div>

        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="text-sm font-medium">Median TTFV</div>
          <div className="text-xs opacity-70 mt-0.5">Time to first core-tool value</div>
          <div className="mt-2 text-2xl font-bold">{durationFromMinutes(ttfv.median_minutes)}</div>
          <div className="text-xs opacity-60 mt-1">Sample size: {Number(ttfv.sample_size || 0).toLocaleString()}</div>
        </div>

        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="text-sm font-medium">Signup Trend</div>
          <div className="text-xs opacity-70 mt-0.5">Last 30 days (daily new users)</div>
          <div className="mt-3 flex items-end gap-[2px] h-16">
            {signupTrend.length === 0 && <div className="text-sm opacity-70">No data.</div>}
            {signupTrend.length > 0 &&
              signupTrend.map((d: any) => {
                const v = Number(d?.new_users || 0);
                const h = maxSignup > 0 ? Math.max(2, Math.round((v / maxSignup) * 64)) : 2;
                return (
                  <div
                    key={String(d?.date)}
                    title={`${String(d?.date)}: ${v}`}
                    className="w-[6px] rounded bg-white/15"
                    style={{ height: `${h}px` }}
                  />
                );
              })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="text-sm opacity-80">Success Rate</div>
          <div className="text-2xl font-bold">{pct(kAi.success_rate, 0)}</div>
          <div className="text-xs opacity-70 mt-1">{Number(kAi?.outcomes?.success || 0)} of {Number(kAi?.total_events || 0)} events</div>
        </div>

        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="text-sm opacity-80">Error Rate</div>
          <div className="text-2xl font-bold">{pct(kAi.error_rate, 0)}</div>
          <div className="text-xs opacity-70 mt-1">
            RL {Number(kAi?.outcomes?.rate_limit || 0)} · Quota {Number(kAi?.outcomes?.quota || 0)} · Timeout {Number(kAi?.outcomes?.timeout || 0)}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="text-sm opacity-80">P95 Latency</div>
          <div className="text-2xl font-bold">{ms(kAi.p95_latency_ms)}</div>
          <div className="text-xs opacity-70 mt-1">Overall (latency_ms)</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Top Tools (Usage)</div>
              <div className="text-xs opacity-70">Most events in window</div>
            </div>
          </div>

          <div className="mt-3 space-y-2">
            {topByUsage.length === 0 && <div className="text-sm opacity-70">No tool data.</div>}
            {topByUsage.map((r: any) => (
              <div key={r.tool} className="flex items-center justify-between text-sm">
                <div className="truncate max-w-[60%]">{r.tool}</div>
                <div className="opacity-80">{Number(r.events || 0).toLocaleString()} ev</div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Top Tools (Cost)</div>
              <div className="text-xs opacity-70">Highest estimated cost</div>
            </div>
          </div>

          <div className="mt-3 space-y-2">
            {topByCost.length === 0 && <div className="text-sm opacity-70">No tool data.</div>}
            {topByCost.map((r: any) => (
              <div key={r.tool} className="flex items-center justify-between text-sm">
                <div className="truncate max-w-[60%]">{r.tool}</div>
                <div className="opacity-80">{money(r.cost_usd)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="p-3 rounded-xl bg-white/5 border border-white/10">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">Cost Anomaly Watchlist</div>
            <div className="text-xs opacity-70">Top spenders (estimated) in selected window</div>
          </div>
          {topLoading && <div className="text-xs opacity-70">Loading…</div>}
        </div>

        {topErr && <div className="mt-2 text-sm text-red-200">{topErr}</div>}

        <div className="mt-3 space-y-2">
          {!topLoading && topSpenders.length === 0 && <div className="text-sm opacity-70">No spenders found.</div>}

          {topSpenders.map((u) => (
            <div key={u.user_id} className="flex items-center justify-between text-sm">
              <div className="truncate max-w-[60%]">{u.email || u.user_id}</div>
              <div className="opacity-80">{money(u.total_estimated_cost_usd)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="text-xs opacity-60">
        Definitions: Active = ≥1 event; Activated = new user with core-tool use within 24h. Core tools:{' '}
        {(data?.definitions?.core_tools || []).join(', ') || '—'}
      </div>
    </div>
  );
}