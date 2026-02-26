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
  const [mauMode, setMauMode] = useState<'daily' | 'weekly'>('daily');
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [topSpenders, setTopSpenders] = useState<TopSpenderRow[]>([]);
  const [topErr, setTopErr] = useState<string | null>(null);
  const [topLoading, setTopLoading] = useState(false);
  const [selectedFailure, setSelectedFailure] = useState<any | null>(null);

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
  const reliability = data?.reliability || {};
  const relByTool = (reliability?.by_tool || []) as any[];
  const providerBreakdown = (reliability?.provider_breakdown || []) as any[];
  const recentFailures = (reliability?.recent_failures || []) as any[];

  const growth = data?.growth || {};
  const funnel = growth?.funnel || {};
  const ttfv = growth?.ttfv || {};
  const signupTrend = (growth?.signup_trend_30d || []) as any[];

  const engagement = data?.engagement || {};
  const adoption = (engagement?.tool_adoption_top || []) as any[];
  const returningTrend = (engagement?.returning_trend_30d || []) as any[];
  const mauDaily = (engagement?.mau_trend_30d_daily || []) as any[];
  const mauWeekly = (engagement?.wau_trend_12w_weekly || []) as any[];
  const mauWeeklyRolling = (engagement?.mau_trend_12w_weekly || []) as any[];
  const adoptionTrend = engagement?.tool_adoption_trend_30d as any;
  const maxReturning = useMemo(() => Math.max(0, ...returningTrend.map((d: any) => Number(d?.returning_users || 0))), [returningTrend]);
  const maxMauDaily = useMemo(() => Math.max(0, ...mauDaily.map((d: any) => Number(d?.mau_rolling_30d || 0))), [mauDaily]);
  const maxMauWeekly = useMemo(() => Math.max(0, ...mauWeekly.map((d: any) => Number(d?.wau_7d || 0))), [mauWeekly]);
  const maxMauWeeklyRolling = useMemo(() => Math.max(0, ...mauWeeklyRolling.map((d: any) => Number(d?.mau_rolling_30d || 0))), [mauWeeklyRolling]);

  const topByUsage = useMemo(() => (tools?.top_by_usage || []).slice(0, 8), [tools]);
  const topByCost = useMemo(() => (tools?.top_by_cost || []).slice(0, 8), [tools]);
  const maxSignup = useMemo(() => Math.max(0, ...signupTrend.map((d: any) => Number(d?.new_users || 0))), [signupTrend]);

  return (
    <div className="p-4 space-y-4">

{selectedFailure && (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
    <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0b0f1a] shadow-xl">
      <div className="flex items-start justify-between gap-3 p-4 border-b border-white/10">
        <div>
          <div className="text-sm font-semibold">Failure details</div>
          <div className="text-xs opacity-70 mt-0.5">Request + user + tool + provider snapshot</div>
        </div>
        <button
          className="px-3 py-1 rounded bg-white/10 hover:bg-white/15 text-sm"
          onClick={() => setSelectedFailure(null)}
        >
          Close
        </button>
      </div>

      <div className="p-4 text-sm space-y-2">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div className="p-2 rounded bg-white/5 border border-white/10">
            <div className="text-xs opacity-70">Occurred</div>
            <div className="font-medium">{String(selectedFailure.occurred_at || '—')}</div>
          </div>
          <div className="p-2 rounded bg-white/5 border border-white/10">
            <div className="text-xs opacity-70">Request ID</div>
            <div className="font-mono text-xs break-all">{String(selectedFailure.request_id || '—')}</div>
          </div>
          <div className="p-2 rounded bg-white/5 border border-white/10">
            <div className="text-xs opacity-70">User</div>
            <div className="font-mono text-xs break-all">{String(selectedFailure.user_id || '—')}</div>
          </div>
          <div className="p-2 rounded bg-white/5 border border-white/10">
            <div className="text-xs opacity-70">Tool</div>
            <div className="font-medium">{String(selectedFailure.tool || '—')}</div>
          </div>
          <div className="p-2 rounded bg-white/5 border border-white/10">
            <div className="text-xs opacity-70">Provider / Model</div>
            <div className="font-medium">{String(selectedFailure.provider || '—')} / {String(selectedFailure.model || '—')}</div>
          </div>
          <div className="p-2 rounded bg-white/5 border border-white/10">
            <div className="text-xs opacity-70">Outcome</div>
            <div className="font-medium">{String(selectedFailure.outcome || '—')}</div>
          </div>
          <div className="p-2 rounded bg-white/5 border border-white/10">
            <div className="text-xs opacity-70">HTTP / Code</div>
            <div className="font-medium">{String(selectedFailure.http_status || '—')} / {String(selectedFailure.error_code || '—')}</div>
          </div>
          <div className="p-2 rounded bg-white/5 border border-white/10">
            <div className="text-xs opacity-70">Latency</div>
            <div className="font-medium">{ms(selectedFailure.latency_ms)}</div>
          </div>
        </div>

        <div className="p-3 rounded bg-white/5 border border-white/10">
          <div className="text-xs opacity-70">Endpoint</div>
          <div className="font-mono text-xs break-all">{String(selectedFailure.endpoint || '—')}</div>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <button
            className="px-3 py-1 rounded bg-white/10 hover:bg-white/15 text-sm"
            onClick={() => {
              const txt = String(selectedFailure.request_id || '');
              if (txt) navigator.clipboard?.writeText(txt);
            }}
          >
            Copy request id
          </button>
          <button
            className="px-3 py-1 rounded bg-white/10 hover:bg-white/15 text-sm"
            onClick={() => {
              const txt = String(selectedFailure.user_id || '');
              if (txt) navigator.clipboard?.writeText(txt);
            }}
          >
            Copy user id
          </button>
        </div>
      </div>
    </div>
  </div>
)}

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


      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="text-sm font-medium">Engagement</div>
          <div className="text-xs opacity-70 mt-0.5">DAU / WAU / MAU + stickiness</div>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between"><span className="opacity-80">DAU</span><span className="font-semibold">{Number(engagement?.dau || 0).toLocaleString()}</span></div>
            <div className="flex items-center justify-between"><span className="opacity-80">WAU</span><span className="font-semibold">{Number(engagement?.wau || 0).toLocaleString()}</span></div>
            <div className="flex items-center justify-between"><span className="opacity-80">MAU</span><span className="font-semibold">{Number(engagement?.mau || 0).toLocaleString()}</span></div>
            <div className="flex items-center justify-between"><span className="opacity-80">Stickiness (DAU/MAU)</span><span className="font-semibold">{pct(engagement?.stickiness_dau_mau, 0)}</span></div>
          </div>
          <div className="text-xs opacity-60 mt-2">DAU/WAU/MAU use fixed 1/7/30-day windows</div>
        </div>

        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="text-sm font-medium">Returning Trend</div>
          <div className="text-xs opacity-70 mt-0.5">Last 30 days (daily returning users)</div>
          <div className="mt-3 flex items-end gap-[2px] h-16">
            {returningTrend.length === 0 && <div className="text-sm opacity-70">No data.</div>}
            {returningTrend.length > 0 &&
              returningTrend.map((d: any) => {
                const v = Number(d?.returning_users || 0);
                const h = maxReturning > 0 ? Math.max(2, Math.round((v / maxReturning) * 64)) : 2;
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
          <div className="text-xs opacity-60 mt-2">Returning = created before that day + active on that day</div>
        </div>

        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="text-sm font-medium">Tool Adoption</div>
          <div className="text-xs opacity-70 mt-0.5">% of active users using each tool (window)</div>
          <div className="mt-3 space-y-2">
            {adoption.length === 0 && <div className="text-sm opacity-70">No adoption data.</div>}
            {adoption.slice(0, 8).map((r: any) => (
              <div key={r.tool} className="flex items-center justify-between text-sm">
                <div className="truncate max-w-[60%]">{r.tool}</div>
                <div className="opacity-80">{pct(r.adoption_rate, 0)}</div>
              </div>
            ))}
          </div>

          <div className="mt-3 pt-2 border-t border-white/10 text-xs opacity-70">
            Week-1 retention: <span className="font-medium">{pct(engagement?.week1_retention?.retention_rate, 0)}</span>{' '}
            <span className="opacity-70">
              ({Number(engagement?.week1_retention?.retained || 0)} / {Number(engagement?.week1_retention?.cohort_size || 0)})
            </span>
          </div>
        

      {/* Phase 3.1 — True MAU Trend + Adoption Over Time */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">MAU Trend</div>
              <div className="text-xs opacity-70">Daily MAU (rolling 30d) • Weekly WAU (7d)</div>
            </div>
            <div className="flex items-center gap-1 text-xs">
              <button
                className={`px-2 py-1 rounded border border-white/10 ${mauMode === 'daily' ? 'bg-white/15' : 'bg-black/20 hover:bg-white/10'}`}
                onClick={() => setMauMode('daily')}
              >
                Daily
              </button>
              <button
                className={`px-2 py-1 rounded border border-white/10 ${mauMode === 'weekly' ? 'bg-white/15' : 'bg-black/20 hover:bg-white/10'}`}
                onClick={() => setMauMode('weekly')}
              >
                Weekly
              </button>
            </div>
          </div>

          <div className="mt-3 flex items-end gap-[2px] h-16">
            {mauMode === 'daily' && mauDaily.length === 0 && <div className="text-sm opacity-70">No data.</div>}
            {mauMode === 'weekly' && mauWeekly.length === 0 && <div className="text-sm opacity-70">No data.</div>}

            {mauMode === 'daily' &&
              mauDaily.map((d: any) => {
                const v = Number(d?.mau_rolling_30d || 0);
                const h = maxMauDaily > 0 ? Math.max(2, Math.round((v / maxMauDaily) * 64)) : 2;
                return (
                  <div
                    key={String(d?.date)}
                    title={`${String(d?.date)}: ${v}`}
                    className="w-[6px] rounded bg-white/15"
                    style={{ height: `${h}px` }}
                  />
                );
              })}

            {mauMode === 'weekly' &&
              mauWeekly.map((d: any) => {
                const v = Number(d?.wau_7d || 0);
                const h = maxMauWeekly > 0 ? Math.max(2, Math.round((v / maxMauWeekly) * 64)) : 2;
                return (
                  <div
                    key={String(d?.week_end)}
                    title={`${String(d?.week_end)}: ${v}`}
                    className="w-[10px] rounded bg-white/15"
                    style={{ height: `${h}px` }}
                  />
                );
              })}
          </div>

          <div className="text-xs opacity-60 mt-2">
            {mauMode === 'daily' ? 'Last 30 days' : 'Last 12 weeks'} • Daily = rolling 30-day MAU • Weekly = WAU (7-day active users)
          </div>
        </div>

        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="text-sm font-medium">Adoption Over Time</div>
          <div className="text-xs opacity-70 mt-0.5">Daily % of active users using each tool (last 30d)</div>

          {!adoptionTrend?.tools?.length && <div className="mt-3 text-sm opacity-70">No trend data.</div>}

          {adoptionTrend?.tools?.length > 0 && (
            <div className="mt-3 space-y-3">
              {adoptionTrend.tools.slice(0, 5).map((t: any) => (
                <div key={t.tool} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="truncate max-w-[65%] opacity-90">{t.tool}</div>
                    <div className="opacity-70">
                      Avg: {pct((t.adoption_rates || []).reduce((a: number, b: number) => a + b, 0) / Math.max(1, (t.adoption_rates || []).length), 0)}
                    </div>
                  </div>
                  <div className="flex items-end gap-[2px] h-10">
                    {(t.adoption_rates || []).map((r: any, i: number) => {
                      const v = Number(r || 0);
                      const h = Math.max(2, Math.round(v * 40)); // since v is 0..1
                      const day = adoptionTrend?.days?.[i] || '';
                      return (
                        <div
                          key={`${t.tool}-${i}`}
                          title={`${day}: ${pct(v, 0)} (${Number(t.unique_users?.[i] || 0)} users)`}
                          className="w-[5px] rounded bg-white/15"
                          style={{ height: `${h}px` }}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="text-xs opacity-60 mt-2">Denominator = daily active users (any tool).</div>
        </div>
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

<div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
  <div className="p-3 rounded-xl bg-white/5 border border-white/10 lg:col-span-2">
    <div className="text-sm font-medium">Reliability by tool</div>
    <div className="text-xs opacity-70 mt-0.5">Success / error / timeout / rate-limit + P95 latency</div>

    <div className="mt-3 overflow-auto">
      <table className="w-full text-sm">
        <thead className="text-xs opacity-70">
          <tr className="border-b border-white/10">
            <th className="text-left py-2 pr-2">Tool</th>
            <th className="text-right py-2 px-2">Events</th>
            <th className="text-right py-2 px-2">Success</th>
            <th className="text-right py-2 px-2">Error</th>
            <th className="text-right py-2 px-2">Timeout</th>
            <th className="text-right py-2 px-2">Rate‑limit</th>
            <th className="text-right py-2 pl-2">P95</th>
          </tr>
        </thead>
        <tbody>
          {(relByTool || []).slice(0, 12).map((r, i) => (
            <tr key={r.tool || i} className="border-b border-white/5">
              <td className="py-2 pr-2 whitespace-nowrap">{String(r.tool || '—')}</td>
              <td className="py-2 px-2 text-right">{Number(r.total || 0).toLocaleString()}</td>
              <td className="py-2 px-2 text-right">{pct(r.success_rate, 1)}</td>
              <td className="py-2 px-2 text-right">{pct(r.error_rate, 1)}</td>
              <td className="py-2 px-2 text-right">{pct(r.timeout_rate, 2)}</td>
              <td className="py-2 px-2 text-right">{pct(r.rate_limit_rate, 2)}</td>
              <td className="py-2 pl-2 text-right">{ms(r.p95_latency_ms)}</td>
            </tr>
          ))}
          {(!relByTool || relByTool.length === 0) && (
            <tr>
              <td className="py-3 opacity-70" colSpan={7}>
                No telemetry in window.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </div>

  <div className="p-3 rounded-xl bg-white/5 border border-white/10">
    <div className="text-sm font-medium">Provider breakdown</div>
    <div className="text-xs opacity-70 mt-0.5">How each provider is behaving</div>

    <div className="mt-3 space-y-2 text-sm">
      {(providerBreakdown || []).slice(0, 6).map((p, i) => (
        <div key={p.provider || i} className="p-2 rounded bg-white/5 border border-white/10">
          <div className="flex items-center justify-between">
            <div className="font-medium">{String(p.provider || 'unknown')}</div>
            <div className="text-xs opacity-70">{Number(p.total || 0).toLocaleString()} ev</div>
          </div>
          <div className="mt-1 grid grid-cols-2 gap-1 text-xs opacity-90">
            <div className="flex items-center justify-between"><span className="opacity-70">Success</span><span>{pct(p.success_rate, 1)}</span></div>
            <div className="flex items-center justify-between"><span className="opacity-70">Error</span><span>{pct(p.error_rate, 1)}</span></div>
            <div className="flex items-center justify-between"><span className="opacity-70">Timeout</span><span>{pct(p.timeout_rate, 2)}</span></div>
            <div className="flex items-center justify-between"><span className="opacity-70">P95</span><span>{ms(p.p95_latency_ms)}</span></div>
          </div>
        </div>
      ))}
      {(!providerBreakdown || providerBreakdown.length === 0) && (
        <div className="text-sm opacity-70">No provider data yet.</div>
      )}
    </div>
  </div>
</div>

<div className="p-3 rounded-xl bg-white/5 border border-white/10">
  <div className="flex items-start justify-between gap-3">
    <div>
      <div className="text-sm font-medium">Recent failures</div>
      <div className="text-xs opacity-70 mt-0.5">Click a row to inspect request + user + tool</div>
    </div>
    <div className="text-xs opacity-60">
      Showing {Math.min(25, (recentFailures || []).length)} newest
    </div>
  </div>

  <div className="mt-3 overflow-auto">
    <table className="w-full text-sm">
      <thead className="text-xs opacity-70">
        <tr className="border-b border-white/10">
          <th className="text-left py-2 pr-2">When</th>
          <th className="text-left py-2 px-2">Tool</th>
          <th className="text-left py-2 px-2">Provider</th>
          <th className="text-left py-2 px-2">Outcome</th>
          <th className="text-right py-2 pl-2">Latency</th>
        </tr>
      </thead>
      <tbody>
        {(recentFailures || []).map((f, i) => (
          <tr
            key={f.request_id || i}
            className="border-b border-white/5 hover:bg-white/5 cursor-pointer"
            onClick={() => setSelectedFailure(f)}
            title="Click to view details"
          >
            <td className="py-2 pr-2 whitespace-nowrap text-xs opacity-80">{String(f.occurred_at || '').slice(0, 19).replace('T',' ')}</td>
            <td className="py-2 px-2">{String(f.tool || '—')}</td>
            <td className="py-2 px-2">{String(f.provider || '—')}</td>
            <td className="py-2 px-2">{String(f.outcome || '—')}</td>
            <td className="py-2 pl-2 text-right">{ms(f.latency_ms)}</td>
          </tr>
        ))}
        {(!recentFailures || recentFailures.length === 0) && (
          <tr>
            <td className="py-3 opacity-70" colSpan={5}>
              No recent failures in this window.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  </div>
</div>

    </div>
  );
}