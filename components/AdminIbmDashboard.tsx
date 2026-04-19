import React, { useEffect, useMemo, useState } from 'react';
import { fetchAdminIbmFunnel } from '../services/adminIbmFunnelService';

const WINDOW_OPTIONS = [
  { days: 1, label: 'Today' },
  { days: 7, label: '7d' },
  { days: 30, label: '30d' },
  { days: 90, label: '90d' },
];

const CAMPAIGN_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'ibm', label: 'IBM' },
  { value: 'sam', label: 'SAM' },
] as const;

type CampaignSource = (typeof CAMPAIGN_OPTIONS)[number]['value'];

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
  const [source, setSource] = useState<CampaignSource>('all');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchAdminIbmFunnel(days, source);
        if (alive) setData(res);
      } catch (e: any) {
        if (alive) {
          setData(null);
          setError(e?.message || 'Failed to load partner dashboard');
        }
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, [days, source]);

  const campaignLabel = String(data?.campaign?.label || (source === 'sam' ? 'SAM' : source === 'all' ? 'All Partners' : 'IBM'));
  const summary = data?.summary || {};
  const events = data?.events || {};
  const rates = data?.rates || {};
  const tools = Array.isArray(data?.most_used_tools) ? data.most_used_tools : [];
  const recentConverted = Array.isArray(data?.recent_converted) ? data.recent_converted : [];
  const topErrors = Array.isArray(data?.top_error_kinds) ? data.top_error_kinds : [];

  const headline = useMemo(() => ({
    signupsWindow: num(summary.signups_window),
    activatedWindow: num(summary.activated_users_window),
    checkoutStarted: num(events.checkout_started),
    checkoutCompleted: num(events.checkout_completed),
    firstIdeaSaved: num(events.first_idea_saved),
    conversionsTotal: num(summary.conversions_total),
    activeTrials: num(summary.active_trial_current),
    expired: num(summary.expired_users_current),
  }), [summary, events]);

  return (
    <div className="p-4 md:p-5 space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-amber-200">Partner Campaign Dashboard</div>
          <div className="text-sm text-white/70">Compare IBM, SAM, or all partner campaigns across signups, activation, checkout behavior, and paid conversions.</div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-full bg-black/20 border border-white/10 p-1">
            {CAMPAIGN_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSource(opt.value)}
                className={`px-3 py-1.5 rounded-full text-sm transition ${source === opt.value ? 'bg-amber-400/15 text-amber-100 border border-amber-300/20' : 'text-white/70 hover:text-white'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>

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
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-white/70">Loading partner dashboard…</div>
      ) : null}

      {!loading && data ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <KpiCard label={`${campaignLabel} Signups (${days}d)`} value={headline.signupsWindow} sub={`Total ${campaignLabel} signups: ${num(summary.signups_total)}`} />
            <KpiCard label={`${campaignLabel} Activated (${days}d)`} value={headline.activatedWindow} sub={`All-time activated: ${num(summary.activated_users_total)}`} />
            <KpiCard label={`${campaignLabel} Checkout Started (${days}d)`} value={headline.checkoutStarted} sub={`Completed: ${headline.checkoutCompleted}`} />
            <KpiCard label={`${campaignLabel} Paid Conversions`} value={headline.conversionsTotal} sub={`Conversion rate: ${pct(summary.conversion_rate_total)}`} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="xl:col-span-2 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm uppercase tracking-[0.18em] text-white/55">Funnel snapshot</div>
                  <div className="mt-1 text-white/80 text-sm">Windowed activity for the selected partner campaign timeframe.</div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard label="First Tool Used" value={num(events.first_tool_use ?? events.first_tool_used)} sub={`Window signup→activation: ${pct(rates.window_signup_to_activation)}`} />
                <KpiCard label="First Idea Saved" value={headline.firstIdeaSaved} sub={`Activation→save: ${pct(rates.activation_to_first_idea_saved)}`} />
                <KpiCard label="Checkout Completed" value={headline.checkoutCompleted} sub={`Checkout→paid: ${pct(rates.checkout_to_paid)}`} />
                <KpiCard label="Activation Rate" value={pct(rates.signup_to_activation)} sub={`Click→checkout: ${pct(rates.click_to_checkout)}`} />
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm uppercase tracking-[0.18em] text-white/55">Recent conversions</div>
              <div className="mt-1 text-sm text-white/70">Most recent selected-campaign users currently on a paid plan.</div>
              <div className="mt-4 space-y-3">
                {recentConverted.length === 0 ? (
                  <div className="text-sm text-white/55">No converted users yet for this campaign.</div>
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
              <div className="text-sm uppercase tracking-[0.18em] text-white/55">Most used tools</div>
              <div className="mt-1 text-sm text-white/70">Selected campaign users' most active tools in the current window.</div>
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
              <div className="mt-1 text-sm text-white/70">Error telemetry tied to the selected campaign in the current window.</div>
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
                        <td colSpan={2} className="py-4 text-white/55">No partner error events in this window.</td>
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
