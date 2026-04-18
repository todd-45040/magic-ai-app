import React, { useEffect, useMemo, useState } from 'react';
import { fetchAdminIbmFunnel } from '../services/adminIbmFunnelService';

const WINDOW_OPTIONS = [
  { days: 1, label: 'Today' },
  { days: 7, label: '7d' },
  { days: 30, label: '30d' },
  { days: 90, label: '90d' },
];

function pct(n: any, digits = 1) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return `${(v * 100).toFixed(digits)}%`;
}

function fmtDate(ts: any) {
  if (!ts) return '—';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? String(ts) : d.toLocaleString();
}

function num(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString() : '—';
}

function KpiCard({ label, value, sub }: { label: string; value: any; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="text-xs uppercase tracking-[0.18em] text-white/55">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      {sub ? <div className="mt-1 text-xs text-white/60">{sub}</div> : null}
    </div>
  );
}

export default function AdminIbmDashboard() {
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchAdminIbmFunnel(days);
        if (alive) setData(res);
      } catch (e: any) {
        if (alive) {
          setData(null);
          setError(e?.message || 'Failed to load IBM dashboard');
        }
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, [days]);

  const summary = data?.summary || {};
  const events = data?.events || {};
  const rates = data?.rates || {};
  const tools = Array.isArray(data?.most_used_tools) ? data.most_used_tools : [];
  const promptStageBreakdown = data?.prompt_stage_breakdown || {};
  const promptViewedByStage = promptStageBreakdown?.viewed || {};
  const promptClickedByStage = promptStageBreakdown?.clicked || {};
  const recentConverted = Array.isArray(data?.recent_converted) ? data.recent_converted : [];
  const topErrors = Array.isArray(data?.top_error_kinds) ? data.top_error_kinds : [];

  const headline = useMemo(() => ({
    signupsWindow: num(summary.signups_window),
    activatedWindow: num(summary.activated_users_window),
    checkoutStarted: num(events.checkout_started),
    checkoutCompleted: num(events.checkout_completed),
    firstIdeaSaved: num(events.first_idea_saved),
    promptViewed: num(events.upgrade_prompt_viewed),
    promptClicked: num(events.upgrade_clicked),
    conversionsTotal: num(summary.conversions_total),
    activeTrials: num(summary.active_trial_current),
    expired: num(summary.expired_users_current),
  }), [summary, events]);

  return (
    <div className="p-4 md:p-5 space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-amber-200">IBM Campaign Dashboard</div>
          <div className="text-sm text-white/70">Dedicated view of IBM signups, activation, checkout behavior, and paid conversions.</div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-full bg-black/20 border border-white/10 p-1">
            {WINDOW_OPTIONS.map((opt) => (
              <button
                key={opt.days}
                type="button"
                onClick={() => setDays(opt.days)}
                className={`px-3 py-1.5 rounded-full text-sm transition ${days === opt.days ? 'bg-white/10 text-white' : 'text-white/70 hover:text-white'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setDays(days)}
            className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white/90 hover:bg-white/15 transition"
          >
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-red-100">{error}</div>
      ) : null}

      {loading && !data ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-white/70">Loading IBM dashboard…</div>
      ) : null}

      {!loading && data ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <KpiCard label={`Signups (${days}d)`} value={headline.signupsWindow} sub={`Total IBM signups: ${num(summary.signups_total)}`} />
            <KpiCard label={`Activated (${days}d)`} value={headline.activatedWindow} sub={`All-time activated: ${num(summary.activated_users_total)}`} />
            <KpiCard label={`Checkout Started (${days}d)`} value={headline.checkoutStarted} sub={`Completed: ${headline.checkoutCompleted}`} />
            <KpiCard label="Paid Conversions" value={headline.conversionsTotal} sub={`Conversion rate: ${pct(summary.conversion_rate_total)}`} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="xl:col-span-2 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm uppercase tracking-[0.18em] text-white/55">Funnel snapshot</div>
                  <div className="mt-1 text-white/80 text-sm">Windowed activity for the selected IBM campaign timeframe.</div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard label="First Tool Used" value={num(events.first_tool_used)} sub={`Window signup→activation: ${pct(rates.window_signup_to_activation)}`} />
                <KpiCard label="First Idea Saved" value={headline.firstIdeaSaved} sub={`Activation→save: ${pct(rates.activation_to_first_idea_saved)}`} />
                <KpiCard label="Prompt Views" value={headline.promptViewed} sub={`Prompt→click: ${pct(rates.prompt_to_click)}`} />
                <KpiCard label="Prompt Clicks" value={headline.promptClicked} sub={`Click→checkout: ${pct(rates.click_to_checkout)}`} />
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm uppercase tracking-[0.18em] text-white/55">Recent conversions</div>
              <div className="mt-1 text-sm text-white/70">Most recent IBM users currently on a paid plan.</div>
              <div className="mt-4 space-y-3">
                {recentConverted.length === 0 ? (
                  <div className="text-sm text-white/55">No converted IBM users yet.</div>
                ) : recentConverted.map((row: any, idx: number) => (
                  <div key={`${row.email || 'user'}-${idx}`} className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-sm font-medium text-white truncate">{row.email || '—'}</div>
                    <div className="mt-1 text-xs text-white/60">{String(row.membership || '—')}</div>
                    <div className="mt-1 text-xs text-white/50">Signed up {fmtDate(row.created_at)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>


          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm uppercase tracking-[0.18em] text-white/55">Trial prompt views by stage</div>
              <div className="mt-1 text-sm text-white/70">How often IBM trial prompts are seen at 7-day, 3-day, 1-day, and expired stages.</div>
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                {['7d','3d','1d','expired'].map((stage) => (
                  <KpiCard key={`view-${stage}`} label={stage.toUpperCase()} value={num(promptViewedByStage?.[stage] || 0)} />
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm uppercase tracking-[0.18em] text-white/55">Trial prompt clicks by stage</div>
              <div className="mt-1 text-sm text-white/70">Which urgency window is actually moving IBM trial users toward upgrade.</div>
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                {['7d','3d','1d','expired'].map((stage) => (
                  <KpiCard key={`click-${stage}`} label={stage.toUpperCase()} value={num(promptClickedByStage?.[stage] || 0)} />
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm uppercase tracking-[0.18em] text-white/55">Most used tools</div>
              <div className="mt-1 text-sm text-white/70">IBM users' most active tools in the selected window.</div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-white/55">
                    <tr className="border-b border-white/10">
                      <th className="text-left font-medium py-2 pr-3">Tool</th>
                      <th className="text-right font-medium py-2 pr-3">Events</th>
                      <th className="text-right font-medium py-2">Users</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tools.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="py-4 text-white/55">No tool data in this window.</td>
                      </tr>
                    ) : tools.map((row: any) => (
                      <tr key={row.tool} className="border-b border-white/5 last:border-b-0">
                        <td className="py-2 pr-3 text-white/85">{row.tool}</td>
                        <td className="py-2 pr-3 text-right text-white/75">{num(row.events)}</td>
                        <td className="py-2 text-right text-white/75">{num(row.users)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm uppercase tracking-[0.18em] text-white/55">Top error kinds</div>
              <div className="mt-1 text-sm text-white/70">Error telemetry tied to IBM users in the selected window.</div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-white/55">
                    <tr className="border-b border-white/10">
                      <th className="text-left font-medium py-2 pr-3">Error kind</th>
                      <th className="text-right font-medium py-2">Events</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topErrors.length === 0 ? (
                      <tr>
                        <td colSpan={2} className="py-4 text-white/55">No IBM error events in this window.</td>
                      </tr>
                    ) : topErrors.map((row: any) => (
                      <tr key={row.error_kind} className="border-b border-white/5 last:border-b-0">
                        <td className="py-2 pr-3 text-white/85">{row.error_kind}</td>
                        <td className="py-2 text-right text-white/75">{num(row.events)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
