import React, { useEffect, useMemo, useState } from 'react';
import { fetchAdminKpis } from '../services/adminKpisService';
import { fetchAdminWatchlist, fetchAdminOpsNotes, addAdminOpsNote } from '../services/adminOpsService';
import { fetchAdminWaitlistLeads } from '../services/adminLeadsService';
import { fetchAdminAiHealth, type AdminAiHealth } from '../services/adminAiHealthService';
import { fetchAdminEnvSanity, type AdminEnvSanity } from '../services/adminSettingsService';
import { downloadCsv } from './adminCsv';

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


function humanizeMs(msLeft: number) {
  const sec = Math.max(0, Math.floor(msLeft / 1000));
  const days = Math.floor(sec / 86400);
  const hrs = Math.floor((sec % 86400) / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hrs > 0 || days > 0) parts.push(`${hrs}h`);
  parts.push(`${mins}m`);
  return parts.join(' ');
}

const WINDOW_OPTIONS = [
  { days: 1, label: 'Today' },
  { days: 7, label: '7d' },
  { days: 30, label: '30d' },
  { days: 90, label: '90d' },
];

export default function AdminOverviewDashboard({ onGoUsers, onGoLeads }: { onGoUsers?: () => void; onGoLeads?: () => void }) {
  const [days, setDays] = useState<number>(7);
  const [mauMode, setMauMode] = useState<'daily' | 'weekly'>('daily');
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiHealth, setAiHealth] = useState<AdminAiHealth | null>(null);
  const [aiHealthErr, setAiHealthErr] = useState<string | null>(null);
  const [envSanity, setEnvSanity] = useState<AdminEnvSanity | null>(null);
  const [envSanityErr, setEnvSanityErr] = useState<string | null>(null);
  const [envCopyState, setEnvCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [admcLeads, setAdmcLeads] = useState<number | null>(null);
  const [founderCounts, setFounderCounts] = useState<any>(null);
  const [founderCountsErr, setFounderCountsErr] = useState<string | null>(null);

  const [selectedFailure, setSelectedFailure] = useState<any | null>(null);

  // Phase 6 — Ops polish
  const [watchlist, setWatchlist] = useState<any>(null);
  const [watchErr, setWatchErr] = useState<string | null>(null);
  const [notesEntity, setNotesEntity] = useState<{ entity_type: string; entity_id: string; title: string } | null>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const [notesMissingTable, setNotesMissingTable] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [notesBusy, setNotesBusy] = useState(false);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const d = await fetchAdminKpis(days);
      setData(d);

      try {
        setAiHealthErr(null);
        const h = await fetchAdminAiHealth(days);
        setAiHealth(h);
      } catch (e: any) {
        setAiHealth(null);
        setAiHealthErr(e?.message || 'Failed to load AI health');
      }
      try {
        const l = await fetchAdminWaitlistLeads({ source: 'admc', days, limit: 0, offset: 0 });
        setAdmcLeads(typeof l?.count === 'number' ? l.count : null);
      } catch {
        setAdmcLeads(null);
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


  // Phase 9 — Founders allocation widget (ADMC / Reserve / Total)
  useEffect(() => {
    let alive = true;

    async function loadCounts() {
      try {
        setFounderCountsErr(null);
        const r = await fetch('/api/admin/founder-count', { headers: { 'Accept': 'application/json' } });
        const j = await r.json().catch(() => ({}));
        if (!alive) return;
        if (j && j.ok) {
          setFounderCounts(j);
        } else {
          setFounderCounts(null);
          setFounderCountsErr('Failed to load founder counts');
        }
      } catch (e: any) {
        if (!alive) return;
        setFounderCounts(null);
        setFounderCountsErr(e?.message || 'Failed to load founder counts');
      }
    }

    loadCounts();
    const t = setInterval(loadCounts, 30000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setWatchErr(null);
        const w = await fetchAdminWatchlist(days);
        if (alive) setWatchlist(w);
      } catch (e: any) {
        if (alive) setWatchErr(e?.message || 'Failed to load watchlist');
      }
    })();
    return () => {
      alive = false;
    };




  }, [days]);

// Env sanity (server) — booth-week debugging helper
useEffect(() => {
  let alive = true;

  async function loadEnv() {
    try {
      setEnvSanityErr(null);
      const s = await fetchAdminEnvSanity();
      if (alive) setEnvSanity(s);
    } catch (e: any) {
      if (alive) setEnvSanityErr(e?.message || 'Failed to load env sanity');
    }
  }

  void loadEnv();
  const t = setInterval(loadEnv, 60000);
  return () => {
    alive = false;
    clearInterval(t);
  };
}, []);


  async function openNotes(entity_type: string, entity_id: string, title: string) {
    setNotesEntity({ entity_type, entity_id, title });
    setNotes([]);
    setNotesMissingTable(false);
    setNoteDraft('');
    setNotesBusy(true);
    try {
      const r = await fetchAdminOpsNotes({ entity_type, entity_id, limit: 100 });
      setNotes(r?.notes || []);
      setNotesMissingTable(!!r?.missingTable);
    } catch {
      // ignore
    } finally {
      setNotesBusy(false);
    }
  }

  async function addNote(resolved?: boolean) {
    if (!notesEntity) return;
    setNotesBusy(true);
    try {
      const r = await addAdminOpsNote({
        entity_type: notesEntity.entity_type,
        entity_id: notesEntity.entity_id,
        note: noteDraft,
        resolved: resolved === true,
      });
      if (r?.missingTable) {
        setNotesMissingTable(true);
      } else {
        setNoteDraft('');
        const rr = await fetchAdminOpsNotes({
          entity_type: notesEntity.entity_type,
          entity_id: notesEntity.entity_id,
          limit: 100,
        });
        setNotes(rr?.notes || []);
        setNotesMissingTable(!!rr?.missingTable);
      }
    } catch {
      // ignore
    } finally {
      setNotesBusy(false);
    }
  }

  

function buildEnvHealthSnapshot(s: AdminEnvSanity | null, e: string | null) {
  const lines: string[] = [];
  lines.push('Magic AI Wizard — System Health Snapshot');
  lines.push(`Time: ${new Date().toISOString()}`);
  lines.push(`Env sanity: ${s?.ok ? 'OK' : e ? 'CHECK' : 'UNKNOWN'}`);

  if (s) {
    const providerSource = s.provider.envOverrideActive ? 'ENV override' : 'DB default';
    lines.push(`Provider: ${s.provider.runtimeProvider} (${providerSource})`);
    lines.push(`Stripe readiness: ${s.readiness.stripeReady ? 'READY' : 'NOT READY'}`);
    lines.push(`Webhook verification: ${s.readiness.webhookVerificationActive ? 'ACTIVE' : 'INACTIVE'}`);

    lines.push('Key presence:');
    lines.push(`- GOOGLE_AI_API_KEY: ${s.keys.ai.GOOGLE_AI_API_KEY ? 'YES' : 'NO'}`);
    lines.push(`- SUPABASE_SERVICE_ROLE_KEY: ${s.keys.supabase.SUPABASE_SERVICE_ROLE_KEY ? 'YES' : 'NO'}`);
    lines.push(`- STRIPE_SECRET_KEY: ${s.keys.stripe.STRIPE_SECRET_KEY ? 'YES' : 'NO'}`);
    lines.push(`- STRIPE_WEBHOOK_SECRET: ${s.keys.stripe.STRIPE_WEBHOOK_SECRET ? 'YES' : 'NO'}`);

    lines.push(`Warnings: VITE-* secret-like vars present: ${s.warnings.vitePrefixedSecretsPresent ? 'YES' : 'NO'}`);
  } else if (e) {
    lines.push(`Error: ${e}`);
  }

  return lines.join('\n');
}

async function copyEnvHealthSnapshot() {
  try {
    const snapshot = buildEnvHealthSnapshot(envSanity, envSanityErr);
    await navigator.clipboard.writeText(snapshot);
    setEnvCopyState('copied');
    window.setTimeout(() => setEnvCopyState('idle'), 2000);
  } catch {
    setEnvCopyState('error');
    window.setTimeout(() => setEnvCopyState('idle'), 2500);
  }
}
const kUsers = data?.users || {};
  const founding = data?.founding || {};
  const kAi = data?.ai || {};
  const unit = data?.unit_economics || {};
  const tools = data?.tools || {};
  const reliability = data?.reliability || {};
  const relByTool = (reliability?.by_tool || []) as any[];
  const recentFailures = (reliability?.recent_failures || []) as any[];

  const aiHealthStatus = useMemo(() => {
    const er = Number(aiHealth?.last_60m?.error_rate);
    if (!aiHealth || !Number.isFinite(er)) return { label: '—', tone: 'muted' as const };
    if (er >= 0.15) return { label: 'Down', tone: 'bad' as const };
    if (er >= 0.05) return { label: 'Degraded', tone: 'warn' as const };
    return { label: 'OK', tone: 'good' as const };
  }, [aiHealth]);

  function providerLabel(p: any) {
    const s = String(p || '').toLowerCase();
    if (s === 'openai') return 'OpenAI';
    if (s === 'anthropic') return 'Anthropic';
    if (s === 'gemini') return 'Google Gemini';
    return String(p || '—');
  }

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

  const spendTrend = (unit?.spend_trend_30d || []) as any[];
  const costAnomalies = (unit?.cost_anomalies || []) as any[];
  const topSpendersUE = (unit?.top_spenders || []) as any[];
  const topSpendersTrend = (unit?.top_spenders_trend_30d || []) as any[];

  const maxSpend = useMemo(() => Math.max(0, ...spendTrend.map((d: any) => Number(d?.total_cost_usd || 0))), [spendTrend]);
  const maxTopSpenderSpend = useMemo(() => {
    const s = topSpendersTrend?.[0]?.series || [];
    return Math.max(0, ...s.map((d: any) => Number(d?.cost_usd || 0)));
  }, [topSpendersTrend]);

  // Founder window status (Admin-only sanity check)
  const founderWindow = useMemo(() => {
    // Defaults for ADMC 2026 (America/New_York). Can be overridden by VITE_ env vars if desired.
    const startStr = (import.meta as any).env?.VITE_FOUNDER_WINDOW_START || '2026-04-02T18:00:00-04:00';
    const endStr = (import.meta as any).env?.VITE_FOUNDER_WINDOW_END || '2026-04-05T00:00:00-04:00';
    const graceHours = Number((import.meta as any).env?.VITE_FOUNDER_WINDOW_GRACE_HOURS || 72);

    const now = Date.now();
    const startMs = new Date(startStr).getTime();
    const endMs = new Date(endStr).getTime();
    const graceEndMs = endMs + graceHours * 3600 * 1000;

    const totalRemaining =
      founderCounts && founderCounts.ok ? Math.max(0, Number(founderCounts.total_limit) - Number(founderCounts.total_count)) : null;
    const admcRemaining =
      founderCounts && founderCounts.ok ? Math.max(0, Number(founderCounts.admc_limit) - Number(founderCounts.admc_count)) : null;

    const spotsRemaining =
      totalRemaining == null || admcRemaining == null ? null : Math.max(0, Math.min(totalRemaining, admcRemaining));

    const inWindow = Number.isFinite(startMs) && Number.isFinite(graceEndMs) && now >= startMs && now < graceEndMs;
    const openByTime = inWindow;
    const openByCapacity = spotsRemaining == null ? true : spotsRemaining > 0;
    const isOpen = openByTime && openByCapacity;

    let label = 'Closed';
    let detail = 'Founder enrollment is closed.';
    if (Number.isFinite(startMs) && now < startMs) {
      label = 'Not Open Yet';
      detail = `Opens in ${humanizeMs(startMs - now)}`;
    } else if (Number.isFinite(graceEndMs) && now >= graceEndMs) {
      label = 'Closed';
      detail = 'Closed (window ended).';
    } else if (openByTime) {
      label = isOpen ? 'Open' : 'Full';
      detail = isOpen ? `Closes in ${humanizeMs(graceEndMs - now)}` : 'Window open, but founder spots are full.';
    }

    return {
      label,
      detail,
      spotsRemaining,
      admcRemaining,
      totalRemaining,
    };
  }, [founderCounts]);

  return (
    <div className="p-4 space-y-4">
      {/* Founder Window Status (Admin-only) */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div className="flex items-center gap-2">
          <div
            className={`h-2.5 w-2.5 rounded-full ${
              founderWindow.label === 'Open'
                ? 'bg-emerald-400'
                : founderWindow.label === 'Full'
                  ? 'bg-amber-400'
                  : founderWindow.label === 'Not Open Yet'
                    ? 'bg-sky-400'
                    : 'bg-rose-400'
            }`}
          />
          <div className="font-semibold">Founder Window: {founderWindow.label}</div>
          <div className="text-sm opacity-70">{founderWindow.detail}</div>
        </div>

        <div className="text-sm flex flex-wrap gap-x-4 gap-y-1">
          <span className="opacity-70">
            Spots remaining: <span className="font-semibold opacity-100">{founderWindow.spotsRemaining ?? '—'}</span>
          </span>
          <span className="opacity-70">
            ADMC remaining: <span className="font-semibold opacity-100">{founderWindow.admcRemaining ?? '—'}</span>
          </span>
          <span className="opacity-70">
            Total remaining: <span className="font-semibold opacity-100">{founderWindow.totalRemaining ?? '—'}</span>
          </span>
        </div>
      </div>


      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm opacity-80">ADMC leads captured</div>
            <div className="mt-1 text-3xl font-extrabold text-white">{admcLeads === null ? '—' : admcLeads}</div>
            <div className="text-xs text-white/60 mt-1">Window: {WINDOW_OPTIONS.find((w) => w.days === days)?.label || `${days}d`}</div>
          </div>
          <div className="flex items-center gap-2">
            {onGoLeads && (
              <button
                type="button"
                onClick={onGoLeads}
                className="px-3 py-2 rounded-lg bg-purple-500/15 border border-purple-400/25 text-purple-100 hover:bg-purple-500/20 hover:border-purple-300/40 transition"
              >
                View Leads
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm opacity-80">Founder allocation</div>

            <div className="mt-2 space-y-1 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-white/70">ADMC Founders</span>
                <span className="text-white font-semibold">
                  {founderCounts ? `${founderCounts.admc_count ?? 0} / ${founderCounts.admc_limit ?? 75}` : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/70">Reserve</span>
                <span className="text-white font-semibold">
                  {founderCounts ? `${founderCounts.reserve_count ?? 0} / ${founderCounts.reserve_limit ?? 25}` : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/70">Total</span>
                <span className="text-white font-semibold">
                  {founderCounts ? `${founderCounts.total_count ?? 0} / ${founderCounts.total_limit ?? 100}` : '—'}
                </span>
              </div>
            </div>

            <div className="mt-2 text-[11px] text-white/50">
              {founderCountsErr ? `Note: ${founderCountsErr}` : 'Auto-refreshes every 30 seconds.'}
            </div>
          </div>

          <div className="shrink-0">
            {(() => {
              const admcCount = Number(founderCounts?.admc_count ?? 0);
              const admcLimit = Number(founderCounts?.admc_limit ?? 75);
              const ok = Number.isFinite(admcCount) && Number.isFinite(admcLimit) && admcCount < admcLimit;
              return (
                <div className={`px-3 py-2 rounded-xl border text-xs ${ok ? 'bg-emerald-500/10 border-emerald-400/20 text-emerald-100' : 'bg-red-500/10 border-red-400/20 text-red-100'}`}>
                  {founderCounts ? (ok ? 'ADMC spots available' : 'ADMC full') : 'Loading…'}
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      </div>

      {/* Phase 6.5 — Safety alert: top daily spenders (last 24h) */}
      {Array.isArray(data?.alerts?.top_daily_spenders_24h) && data.alerts.top_daily_spenders_24h.length > 0 ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm text-red-100 font-semibold">Top daily spenders (last 24h)</div>
              <div className="text-xs text-white/60 mt-1">Quick safety check so heavy usage can’t surprise you.</div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {data.alerts.top_daily_spenders_24h.slice(0, 3).map((r: any) => (
              <div key={r.user_id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <div className="text-xs text-white/70 truncate">{r.email || r.user_id}</div>
                <div className="mt-1 flex items-center justify-between">
                  <div className="text-sm font-extrabold text-white">{money(r.total_cost_usd_24h, 2)}</div>
                  <div className="text-xs text-white/60">{Number(r.events || 0)} events</div>
                </div>
                {Array.isArray(r.tools) && r.tools.length ? (
                  <div className="mt-1 text-[11px] text-white/60 truncate">Tools: {r.tools.slice(0, 4).join(', ')}{r.tools.length > 4 ? '…' : ''}</div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}


      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">

<div className="rounded-2xl border border-white/10 bg-white/5 p-4">
  <div className="flex items-center justify-between">
    <div>
      <div className="text-sm opacity-80">System Health</div>
      <div className="mt-1 text-[11px] text-white/60">Server env + provider + Stripe readiness</div>
    </div>

<div className="flex items-center gap-2">
  <button
    type="button"
    onClick={copyEnvHealthSnapshot}
    className={`px-2.5 py-1 rounded-lg border text-[11px] transition ${
      envCopyState === 'copied'
        ? 'bg-emerald-500/10 border-emerald-400/20 text-emerald-100'
        : envCopyState === 'error'
          ? 'bg-red-500/10 border-red-400/20 text-red-100'
          : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
    }`}
    title="Copy a safe status snapshot (no secrets)"
  >
    {envCopyState === 'copied' ? 'Copied' : envCopyState === 'error' ? 'Failed' : 'Copy'}
  </button>
  <div
    className={`px-2.5 py-1 rounded-lg border text-[11px] ${
      envSanity?.ok
        ? 'bg-emerald-500/10 border-emerald-400/20 text-emerald-100'
        : envSanityErr
          ? 'bg-red-500/10 border-red-400/20 text-red-100'
          : 'bg-white/5 border-white/10 text-white/70'
    }`}
    title={envSanityErr || ''}
  >
    {envSanity?.ok ? 'OK' : envSanityErr ? 'Check' : '…'}
  </div>
</div>
  </div>

  <div className="mt-3 space-y-2 text-xs">
    <div className="flex items-center justify-between gap-2">
      <span className="text-white/70">Provider source</span>
      <span className="font-semibold text-white">
        {envSanity
          ? envSanity.provider.envOverrideActive
            ? `ENV (${envSanity.provider.runtimeProvider})`
            : `DB (${envSanity.provider.runtimeProvider})`
          : '—'}
      </span>
    </div>

    <div className="flex items-center justify-between gap-2">
      <span className="text-white/70">Stripe readiness</span>
      <span className={`font-semibold ${envSanity?.readiness?.stripeReady ? 'text-emerald-200' : 'text-white/60'}`}>
        {envSanity ? (envSanity.readiness.stripeReady ? 'Ready' : 'Not ready') : '—'}
      </span>
    </div>

    <div className="flex items-center justify-between gap-2">
      <span className="text-white/70">Webhook verify</span>
      <span className={`font-semibold ${envSanity?.readiness?.webhookVerificationActive ? 'text-emerald-200' : 'text-white/60'}`}>
        {envSanity ? (envSanity.readiness.webhookVerificationActive ? 'Active' : 'Inactive') : '—'}
      </span>
    </div>

    <div className="pt-2 border-t border-white/10">
      <div className="flex items-center justify-between gap-2">
        <span className="text-white/70">GOOGLE_AI_API_KEY</span>
        <span className={`font-semibold ${envSanity?.keys?.ai?.GOOGLE_AI_API_KEY ? 'text-emerald-200' : 'text-red-200'}`}>
          {envSanity ? (envSanity.keys.ai.GOOGLE_AI_API_KEY ? 'Yes' : 'No') : '—'}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 mt-1">
        <span className="text-white/70">SERVICE_ROLE</span>
        <span className={`font-semibold ${envSanity?.keys?.supabase?.SUPABASE_SERVICE_ROLE_KEY ? 'text-emerald-200' : 'text-red-200'}`}>
          {envSanity ? (envSanity.keys.supabase.SUPABASE_SERVICE_ROLE_KEY ? 'Yes' : 'No') : '—'}
        </span>
      </div>
    </div>

    {envSanity?.warnings?.vitePrefixedSecretsPresent ? (
      <div className="mt-2 rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
        VITE-* secret-like env vars present. Check Admin Settings for names.
      </div>
    ) : null}

    <div className="text-[11px] text-white/50">
      Full matrix in <span className="text-white/70">Admin → Settings</span>
    </div>
  </div>
</div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm opacity-80">Founding Members</div>
          <div className="mt-2 flex items-end justify-between">
            <div className="text-2xl font-extrabold text-white">{founding?.members_by_window?.[String(days)] ?? '—'}</div>
            <div className="text-xs text-white/60">Window: {days}d</div>
          </div>
          <div className="mt-2 text-xs text-white/70 flex gap-3">
            <span>7d: <span className="text-white">{founding?.members_by_window?.['7'] ?? '—'}</span></span>
            <span>30d: <span className="text-white">{founding?.members_by_window?.['30'] ?? '—'}</span></span>
            <span>90d: <span className="text-white">{founding?.members_by_window?.['90'] ?? '—'}</span></span>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm opacity-80">Founding Conversion (Lead→User)</div>
          <div className="mt-2 flex items-end justify-between">
            <div className="text-2xl font-extrabold text-white">{pct(founding?.conversion_rate_by_window?.[String(days)], 0)}</div>
            <div className="text-xs text-white/60">Window: {days}d</div>
          </div>
          <div className="mt-2 text-xs text-white/70 flex gap-3">
            <span>7d: <span className="text-white">{pct(founding?.conversion_rate_by_window?.['7'], 0)}</span></span>
            <span>30d: <span className="text-white">{pct(founding?.conversion_rate_by_window?.['30'], 0)}</span></span>
            <span>90d: <span className="text-white">{pct(founding?.conversion_rate_by_window?.['90'], 0)}</span></span>
          </div>
          <div className="mt-2 text-[11px] text-white/50">Based on founding leads table (signed-out joins).</div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm opacity-80">Activation Rate (Founders vs Non)</div>
          <div className="mt-2 space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/70">Founders</span>
              <span className="text-white font-semibold">{pct(founding?.activation?.founders_activation_rate, 0)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/70">Non-founders</span>
              <span className="text-white font-semibold">{pct(founding?.activation?.non_founders_activation_rate, 0)}</span>
            </div>
          </div>
          <div className="mt-2 text-[11px] text-white/50">Among new users in selected window.</div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm opacity-80">Usage Intensity</div>
          <div className="mt-2 space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/70">Cost / active founder</span>
              <span className="text-white font-semibold">{money(founding?.usage_intensity?.founders?.cost_per_active_user)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/70">Cost / active non-founder</span>
              <span className="text-white font-semibold">{money(founding?.usage_intensity?.non_founders?.cost_per_active_user)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/70">Cost ratio (F / NF)</span>
              <span className="text-white font-semibold">{founding?.usage_intensity?.cost_per_user_ratio ? `${founding.usage_intensity.cost_per_user_ratio.toFixed(2)}x` : '—'}</span>
            </div>
          </div>
          <div className="mt-2 text-[11px] text-white/50">Computed from ai_usage_events in selected window.</div>
        </div>
      </div>
      {/* Phase 4.5 — Founding Intelligence (Retention / Stickiness / Adoption) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm opacity-80">Week-1 Retention (Founders vs Non)</div>
          <div className="mt-2 space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/70">Founders</span>
              <span className="text-white font-semibold">{pct(founding?.retention_week1_split?.founders?.retention_rate, 0)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/70">Non-founders</span>
              <span className="text-white font-semibold">{pct(founding?.retention_week1_split?.non_founders?.retention_rate, 0)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/70">Delta (F − NF)</span>
              <span className="text-white font-semibold">{pct(founding?.retention_week1_split?.delta_founders_minus_non, 0)}</span>
            </div>
          </div>
          <div className="mt-2 text-[11px] text-white/50">Cohort: users created 7–14 days ago.</div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm opacity-80">Stickiness (WAU / MAU)</div>
          <div className="mt-2 space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/70">Founders</span>
              <span className="text-white font-semibold">{pct(founding?.stickiness_wau_mau_split?.founders?.wau_mau, 0)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/70">Non-founders</span>
              <span className="text-white font-semibold">{pct(founding?.stickiness_wau_mau_split?.non_founders?.wau_mau, 0)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/70">Delta (F − NF)</span>
              <span className="text-white font-semibold">{pct(founding?.stickiness_wau_mau_split?.delta_founders_minus_non, 0)}</span>
            </div>
          </div>
          <div className="mt-2 text-[11px] text-white/50">WAU=7d active, MAU=30d active.</div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm opacity-80">Founder Tool Adoption (Delta)</div>
          <div className="mt-3 space-y-2">
            {((founding?.tool_adoption_split?.top_delta || []) as any[]).slice(0, 5).map((r: any) => (
              <div key={String(r?.tool)} className="flex items-center justify-between text-sm">
                <span className="text-white/70 truncate">{String(r?.tool || '—')}</span>
                <span className="text-white font-semibold">{pct(r?.delta_adoption_rate, 0)}</span>
              </div>
            ))}
            {(!founding?.tool_adoption_split?.top_delta || (founding.tool_adoption_split.top_delta as any[]).length === 0) && (
              <div className="text-sm text-white/60">—</div>
            )}
          </div>
          <div className="mt-2 text-[11px] text-white/50">Delta = Founder adoption − Non-founder adoption (selected window).</div>
        </div>
      </div>





      {/* Phase 8 — Segmentation Intelligence (ADMC vs Organic vs Reddit) */}
      <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm opacity-80">Founder Sources (Segmentation)</div>
          <div className="text-[11px] text-white/50">Window: {days}d</div>
        </div>

        <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3">
          {(((founding as any)?.segmentation?.engagement_by_source || []) as any[]).map((r: any) => {
            const src = String(r?.source || 'other').toUpperCase();
            const total = Number((founding as any)?.segmentation?.founders_total_by_source?.[String(r?.source)] || 0) || 0;
            const joined = Number((founding as any)?.segmentation?.founders_joined_by_source?.[String(r?.source)] || 0) || 0;
            return (
              <div key={String(r?.source)} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-white">{src}</div>
                  <div className="text-[11px] text-white/50">{total} founders</div>
                </div>

                <div className="mt-2 space-y-1 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-white/70">Joined ({days}d)</span>
                    <span className="text-white font-semibold">{joined}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-white/70">Active</span>
                    <span className="text-white font-semibold">{Number(r?.active_founders || 0)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-white/70">$/Active</span>
                    <span className="text-white font-semibold">{money(r?.cost_per_active_founder)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-white/70">Waitlist → Founder</span>
                    <span className="text-white font-semibold">{pct(r?.waitlist?.waitlist_to_founder_rate, 0)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-white/70">Lead → User</span>
                    <span className="text-white font-semibold">{pct(r?.founding_leads?.lead_to_user_rate, 0)}</span>
                  </div>
                </div>

                <div className="mt-2 text-[11px] text-white/50 truncate">
                  Top tools: {((r?.top_tools_by_cost || []) as any[]).slice(0, 3).map((t: any) => String(t?.tool || '')).filter(Boolean).join(', ') || '—'}
                </div>
              </div>
            );
          })}

          {(!((founding as any)?.segmentation?.engagement_by_source) || ((founding as any).segmentation.engagement_by_source as any[]).length === 0) && (
            <div className="text-sm text-white/60">No segmentation data yet.</div>
          )}
        </div>

        <div className="mt-2 text-[11px] text-white/50">
          Sources derived from founding_source / source fields (normalized to ADMC, Reddit, Organic, Other).
        </div>
      </div>


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
            <div className="text-xs text-amber-200/80">Occurred</div>
            <div className="font-medium">{String(selectedFailure.occurred_at || '—')}</div>
          </div>
          <div className="p-2 rounded bg-white/5 border border-white/10">
            <div className="text-xs text-amber-200/80">Request ID</div>
            <div className="font-mono text-xs break-all">{String(selectedFailure.request_id || '—')}</div>
          </div>
          <div className="p-2 rounded bg-white/5 border border-white/10">
            <div className="text-xs text-amber-200/80">User</div>
            <div className="font-mono text-xs break-all">{String(selectedFailure.user_id || '—')}</div>
          </div>
          <div className="p-2 rounded bg-white/5 border border-white/10">
            <div className="text-xs text-amber-200/80">Tool</div>
            <div className="font-medium">{String(selectedFailure.tool || '—')}</div>
          </div>
          <div className="p-2 rounded bg-white/5 border border-white/10">
            <div className="text-xs text-amber-200/80">Provider / Model</div>
            <div className="font-medium">{String(selectedFailure.provider || '—')} / {String(selectedFailure.model || '—')}</div>
          </div>
          <div className="p-2 rounded bg-white/5 border border-white/10">
            <div className="text-xs text-amber-200/80">Outcome</div>
            <div className="font-medium">{String(selectedFailure.outcome || '—')}</div>
          </div>
          <div className="p-2 rounded bg-white/5 border border-white/10">
            <div className="text-xs text-amber-200/80">HTTP / Code</div>
            <div className="font-medium">{String(selectedFailure.http_status || '—')} / {String(selectedFailure.error_code || '—')}</div>
          </div>
          <div className="p-2 rounded bg-white/5 border border-white/10">
            <div className="text-xs text-amber-200/80">Latency</div>
            <div className="font-medium">{ms(selectedFailure.latency_ms)}</div>
          </div>
        </div>

        <div className="p-3 rounded bg-white/5 border border-white/10">
          <div className="text-xs text-amber-200/80">Endpoint</div>
          <div className="font-mono text-xs break-all">{String(selectedFailure.endpoint || '—')}</div>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <button
            className="px-3 py-1 rounded bg-purple-500/15 border border-purple-400/25 hover:bg-purple-500/20 text-sm"
            onClick={() =>
              openNotes(
                'failure',
                String(selectedFailure.request_id || selectedFailure.id || ''),
                `Failure notes — ${String(selectedFailure.tool || '—')} · ${String(selectedFailure.outcome || '—')}`
              )
            }
          >
            Notes
          </button>
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

{notesEntity && (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
    <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0b0f1a] shadow-xl">
      <div className="flex items-start justify-between gap-3 p-4 border-b border-white/10">
        <div>
          <div className="text-sm font-semibold">Notes</div>
          <div className="text-xs opacity-70 mt-0.5">{notesEntity.title}</div>
        </div>
        <button
          className="px-3 py-1 rounded bg-white/10 hover:bg-white/15 text-sm"
          onClick={() => setNotesEntity(null)}
        >
          Close
        </button>
      </div>

      <div className="p-4">
        {notesMissingTable && (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-400/20 text-amber-100 text-sm">
            Notes table not installed yet. Run <span className="font-mono">supabase/phase6_admin_ops.sql</span> to enable.
          </div>
        )}

        <div className="mt-3 space-y-2 max-h-[260px] overflow-auto">
          {notesBusy && notes.length === 0 && <div className="text-sm opacity-70">Loading…</div>}
          {!notesBusy && notes.length === 0 && <div className="text-sm opacity-70">No notes yet.</div>}
          {notes.map((n: any) => (
            <div key={String(n.id)} className="p-3 rounded-lg bg-white/5 border border-white/10">
              <div className="text-xs text-amber-200/80">{String(n.created_at || '')}</div>
              <div className="text-sm mt-1 whitespace-pre-wrap">{String(n.note || '')}</div>
              {n.resolved && <div className="text-xs mt-2 text-emerald-200">Marked resolved</div>}
            </div>
          ))}
        </div>

        <div className="mt-4">
          <textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="Add a note about investigation, mitigation, or resolution…"
            className="w-full min-h-[90px] px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white/90"
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={notesBusy || noteDraft.trim().length === 0}
              onClick={() => addNote(false)}
              className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white/90 hover:bg-white/15 transition text-sm disabled:opacity-50"
            >
              Add note
            </button>
            <button
              type="button"
              disabled={notesBusy}
              onClick={() => addNote(true)}
              className="px-3 py-2 rounded-lg bg-emerald-500/15 border border-emerald-400/25 text-emerald-100 hover:bg-emerald-500/20 transition text-sm disabled:opacity-50"
            >
              Resolve
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
)}

      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-amber-200">Admin – Overview</h2>
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
              <div className="text-xs text-amber-200/80">Most events in window</div>
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
              <div className="text-xs text-amber-200/80">Highest estimated cost</div>
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
        

        </div>
      </div>

      {/* Phase 3.1 — True MAU Trend + Adoption Over Time */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium">MAU / WAU Trend</div>
              <div className="text-xs opacity-70 mt-0.5">Daily = rolling 30-day MAU · Weekly = WAU</div>
            </div>
            <div className="flex items-center gap-1 text-xs">
              <button
                className={`px-2 py-1 rounded border border-white/10 ${mauMode === 'daily' ? 'bg-white/15' : 'bg-white/5 hover:bg-white/10'}`}
                onClick={() => setMauMode('daily')}
              >
                Daily
              </button>
              <button
                className={`px-2 py-1 rounded border border-white/10 ${mauMode === 'weekly' ? 'bg-white/15' : 'bg-white/5 hover:bg-white/10'}`}
                onClick={() => setMauMode('weekly')}
              >
                Weekly
              </button>
            </div>
          </div>

          <div className="mt-3 flex items-end gap-[2px] h-16">
            {(() => {
              const series = mauMode === 'daily' ? mauDaily : mauWeekly;
              const maxV = Math.max(0, ...series.map((d: any) => Number(d?.value ?? d?.mau ?? d?.wau ?? 0)));
              if (!series || series.length === 0) return <div className="text-sm opacity-70">No data.</div>;
              return series.map((d: any, idx: number) => {
                const v = Number(d?.value ?? d?.mau ?? d?.wau ?? 0);
                const h = maxV > 0 ? Math.max(2, Math.round((v / maxV) * 64)) : 2;
                const label = String(d?.date || d?.week_end || idx);
                return (
                  <div
                    key={label}
                    title={`${label}: ${v}`}
                    className="w-[6px] rounded bg-white/15"
                    style={{ height: `${h}px` }}
                  />
                );
              });
            })()}
          </div>

          <div className="text-xs opacity-60 mt-2">
            {mauMode === 'daily'
              ? `Rolling MAU (30d): ${Number((mauDaily?.at?.(-1)?.value ?? 0)).toLocaleString()}`
              : `WAU (7d): ${Number((mauWeekly?.at?.(-1)?.value ?? 0)).toLocaleString()}`}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="text-sm font-medium">Adoption over time</div>
          <div className="text-xs opacity-70 mt-0.5">Top tools · daily % of active users (last 30d)</div>

          <div className="mt-3 space-y-2">
            {(!adoptionTrend || !(adoptionTrend as any).tools || (adoptionTrend as any).tools.length === 0) && (
              <div className="text-sm opacity-70">No adoption trend yet.</div>
            )}
            {((adoptionTrend as any)?.tools || []).slice(0, 5).map((t: any) => {
              const arr = (t?.adoption_rates || []) as any[];
              const maxA = Math.max(0, ...arr.map((x: any) => Number(x || 0)));
              return (
                <div key={String(t?.tool)} className="p-2 rounded bg-white/5 border border-white/10">
                  <div className="flex items-center justify-between text-sm">
                    <div className="truncate max-w-[70%]">{String(t?.tool || '—')}</div>
                    <div className="text-xs text-amber-200/80">latest: {pct(arr?.at?.(-1), 0)}</div>
                  </div>
                  <div className="mt-2 flex items-end gap-[2px] h-10">
                    {arr.slice(-30).map((v: any, idx: number) => {
                      const n = Number(v || 0);
                      const h = maxA > 0 ? Math.max(2, Math.round((n / maxA) * 40)) : 2;
                      return (
                        <div
                          key={idx}
                          className="w-[4px] rounded bg-white/15"
                          style={{ height: `${h}px` }}
                          title={`${n}`}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Phase 5 — Unit economics + cost controls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="text-sm font-medium">Unit economics</div>
          <div className="text-xs opacity-70 mt-0.5">Cost safety while you optimize activation</div>

          <div className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="opacity-80">Cost / active user</span>
              <span className="font-semibold">{money(unit.cost_per_active_user, 4)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="opacity-80">Cost / activated user</span>
              <span className="font-semibold">{money(unit.cost_per_activated_user, 4)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="opacity-80">Cost / tool session</span>
              <span className="font-semibold">{money(unit.cost_per_tool_session, 4)}</span>
            </div>
          </div>

          <div className="text-xs opacity-60 mt-2">
            Sessions = successful requests in window ({Number(unit.successful_sessions || 0).toLocaleString()}).
          </div>
        </div>

        <div className="p-3 rounded-xl bg-white/5 border border-white/10 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Spend trend</div>
              <div className="text-xs opacity-70 mt-0.5">Last 30 days (daily total estimated cost)</div>
            </div>
            <div className="text-sm font-semibold">{money(spendTrend.reduce((s: number, d: any) => s + Number(d?.total_cost_usd || 0), 0))}</div>
          </div>

          <div className="mt-3 flex items-end gap-[2px] h-16">
            {spendTrend.length === 0 && <div className="text-sm opacity-70">No data.</div>}
            {spendTrend.length > 0 &&
              spendTrend.map((d: any) => {
                const v = Number(d?.total_cost_usd || 0);
                const h = maxSpend > 0 ? Math.max(2, Math.round((v / maxSpend) * 64)) : 2;
                return (
                  <div
                    key={String(d?.date)}
                    title={`${String(d?.date)}: $${v.toFixed(4)}`}
                    className="w-[6px] rounded bg-white/15"
                    style={{ height: `${h}px` }}
                  />
                );
              })}
          </div>

          {topSpendersTrend?.[0]?.series?.length > 0 && (
            <div className="mt-4">
              <div className="text-xs text-amber-200/80">Top spender trend: {String(topSpendersTrend?.[0]?.email || topSpendersTrend?.[0]?.user_id || '—')}</div>
              <div className="mt-2 flex items-end gap-[2px] h-12">
                {(topSpendersTrend?.[0]?.series || []).map((d: any) => {
                  const v = Number(d?.cost_usd || 0);
                  const h = maxTopSpenderSpend > 0 ? Math.max(2, Math.round((v / maxTopSpenderSpend) * 48)) : 2;
                  return (
                    <div
                      key={String(d?.date)}
                      title={`${String(d?.date)}: $${v.toFixed(4)}`}
                      className="w-[5px] rounded bg-white/10"
                      style={{ height: `${h}px` }}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium">Top spenders</div>
              <div className="text-xs opacity-70 mt-0.5">Highest estimated cost in selected window</div>
            </div>
            <button
              type="button"
              onClick={() =>
                downloadCsv(
                  `top_spenders_${days}d.csv`,
                  topSpendersUE.map((u: any) => ({
                    user_id: u.user_id,
                    email: u.email,
                    total_cost_usd: u.total_cost_usd,
                    events: u.events,
                    successful_sessions: u.successful_sessions,
                    avg_latency_ms: u.avg_latency_ms,
                  }))
                )
              }
              className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white/90 hover:bg-white/15 transition text-xs"
            >
              Export CSV
            </button>
          </div>

          <div className="mt-3 space-y-2 text-sm">
            {topSpendersUE.length === 0 && <div className="text-sm opacity-70">No spenders found.</div>}
            {topSpendersUE.slice(0, 10).map((u: any) => (
              <div key={String(u.user_id)} className="flex items-center justify-between">
                <div className="truncate max-w-[70%]">{String(u.email || u.user_id)}</div>
                <div className="opacity-80">{money(u.total_cost_usd, 4)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-white/5 border border-white/10 lg:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium">Cost anomalies</div>
              <div className="text-xs opacity-70 mt-0.5">Spike + outlier detection (rules-based)</div>
            </div>
            <button
              type="button"
              onClick={() =>
                downloadCsv(
                  `cost_anomalies_${days}d.csv`,
                  costAnomalies.map((a: any) => ({
                    type: a.type,
                    entity: a.entity,
                    current_value: a.current_value,
                    baseline: a.baseline,
                    multiplier: a.multiplier,
                  }))
                )
              }
              className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white/90 hover:bg-white/15 transition text-xs"
            >
              Export CSV
            </button>
          </div>

          <div className="mt-3 space-y-2 text-sm">
            {costAnomalies.length === 0 && <div className="text-sm opacity-70">No cost anomalies detected — system stable.</div>}
            {costAnomalies.map((a: any, i: number) => (
              <button
                type="button"
                key={`${a.type}-${i}`}
                onClick={() => openNotes('cost_anomaly', `${String(a.type)}:${String(a.entity)}`, `Cost anomaly — ${String(a.type)} · ${String(a.entity)}`)}
                className="w-full text-left flex items-center justify-between gap-3 px-2 py-2 rounded-lg hover:bg-white/10 transition"
                title="Open notes"
              >
                <div className="truncate">
                  <span className="font-medium">{String(a.type)}</span>
                  <span className="opacity-70"> · {String(a.entity)}</span>
                </div>
                <div className="text-right whitespace-nowrap opacity-80">
                  {Number(a.multiplier || 0).toFixed(1)}×
                </div>
              </button>
            ))}
          </div>

          <div className="text-xs opacity-60 mt-2">
            daily_spike: today &gt; 2.5× 7‑day avg · tool_spike: today &gt; 3× tool 7‑day avg · user_outlier: &gt; P95 user cost
          </div>
        </div>
      </div>

      {/* Phase 6 — Admin Ops polish */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium">Watchlist — near quota</div>
              <div className="text-xs opacity-70 mt-0.5">Users with &le; 20% remaining in any monthly quota</div>
            </div>
            <button
              type="button"
              onClick={() => downloadCsv(`watchlist_near_quota_${days}d.csv`, (watchlist?.watchlist?.near_quota || []) as any[])}
              className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white/90 hover:bg-white/15 transition text-xs"
            >
              Export
            </button>
          </div>
          {watchErr && <div className="mt-3 text-sm text-red-200">{watchErr}</div>}
          <div className="mt-3 space-y-2 text-sm">
            {(watchlist?.watchlist?.near_quota || []).length === 0 && <div className="opacity-70">No users near quota.</div>}
            {(watchlist?.watchlist?.near_quota || []).slice(0, 8).map((u: any) => (
              <div key={String(u.user_id)} className="flex items-center justify-between gap-3">
                <div className="truncate max-w-[70%]">{String(u.email || u.user_id)}</div>
                <div className="text-xs opacity-70 truncate">{(u.triggers || []).join(', ')}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium">Watchlist — repeated errors</div>
              <div className="text-xs opacity-70 mt-0.5">Users with ≥ 5 error/timeout/rate-limit events</div>
            </div>
            <button
              type="button"
              onClick={() => downloadCsv(`watchlist_repeated_errors_${days}d.csv`, (watchlist?.watchlist?.repeated_errors || []) as any[])}
              className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white/90 hover:bg-white/15 transition text-xs"
            >
              Export
            </button>
          </div>
          <div className="mt-3 space-y-2 text-sm">
            {(watchlist?.watchlist?.repeated_errors || []).length === 0 && <div className="opacity-70">No repeated-error users.</div>}
            {(watchlist?.watchlist?.repeated_errors || []).slice(0, 8).map((u: any) => (
              <button
                type="button"
                key={String(u.user_id)}
                onClick={() => openNotes('user', String(u.user_id), `User notes — ${String(u.email || u.user_id)}`)}
                className="w-full text-left flex items-center justify-between gap-3 px-2 py-2 rounded-lg hover:bg-white/10 transition"
                title="Open notes"
              >
                <div className="truncate max-w-[70%]">{String(u.email || u.user_id)}</div>
                <div className="text-xs text-amber-200/80">{Number(u.error_events || 0)} events</div>
              </button>
            ))}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium">Watchlist — big spenders</div>
              <div className="text-xs opacity-70 mt-0.5">Top spenders in the selected window</div>
            </div>
            <button
              type="button"
              onClick={() => downloadCsv(`watchlist_big_spenders_${days}d.csv`, (watchlist?.watchlist?.big_spenders || []) as any[])}
              className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white/90 hover:bg-white/15 transition text-xs"
            >
              Export
            </button>
          </div>
          <div className="mt-3 space-y-2 text-sm">
            {(watchlist?.watchlist?.big_spenders || []).length === 0 && <div className="opacity-70">No spenders found.</div>}
            {(watchlist?.watchlist?.big_spenders || []).slice(0, 8).map((u: any) => (
              <button
                type="button"
                key={String(u.user_id)}
                onClick={() => openNotes('user', String(u.user_id), `User notes — ${String(u.email || u.user_id)}`)}
                className="w-full text-left flex items-center justify-between gap-3 px-2 py-2 rounded-lg hover:bg-white/10 transition"
                title="Open notes"
              >
                <div className="truncate max-w-[70%]">{String(u.email || u.user_id)}</div>
                <div className="text-xs text-amber-200/80">{money(u.total_cost_usd, 4)}</div>
              </button>
            ))}
          </div>
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
        <thead className="text-xs text-amber-200/80">
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
    <div className="flex items-center justify-between gap-2">
      <div>
        <div className="text-sm font-medium">AI Provider Health</div>
        <div className="text-xs opacity-70 mt-0.5">Live health + costs (uses telemetry)</div>
      </div>
      <button
        type="button"
        onClick={() => void load()}
        className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white/90 hover:bg-white/15 transition text-xs"
        title="Refresh"
      >
        Refresh
      </button>
    </div>

    <div className="mt-3 flex items-center justify-between gap-2">
      <div className="text-sm">
        <span className="opacity-70">Runtime:</span>{' '}
        <span className="font-medium">{providerLabel(aiHealth?.runtimeProvider)}</span>{' '}
        <span className="text-xs opacity-70">({String(aiHealth?.source || '—')})</span>
      </div>
      <div
        className={
          'text-xs px-2 py-1 rounded-full border ' +
          (aiHealthStatus.tone === 'good'
            ? 'bg-emerald-500/10 border-emerald-400/30 text-emerald-200'
            : aiHealthStatus.tone === 'warn'
            ? 'bg-amber-500/10 border-amber-400/30 text-amber-200'
            : aiHealthStatus.tone === 'bad'
            ? 'bg-rose-500/10 border-rose-400/30 text-rose-200'
            : 'bg-white/5 border-white/10 text-white/70')
        }
      >
        {aiHealthStatus.label}
      </div>
    </div>

    {aiHealthErr && <div className="mt-2 text-xs text-rose-200/80">{aiHealthErr}</div>}

    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
      <div className="p-2 rounded bg-white/5 border border-white/10">
        <div className="opacity-70">Last 60m</div>
        <div className="mt-1 flex items-center justify-between"><span>Cost</span><span className="text-amber-200/80">{money(aiHealth?.last_60m?.cost_usd, 4)}</span></div>
        <div className="flex items-center justify-between"><span>Error rate</span><span>{pct(aiHealth?.last_60m?.error_rate, 1)}</span></div>
        <div className="flex items-center justify-between"><span>P95</span><span>{ms(aiHealth?.last_60m?.p95_latency_ms)}</span></div>
      </div>
      <div className="p-2 rounded bg-white/5 border border-white/10">
        <div className="opacity-70">Selected window</div>
        <div className="mt-1 flex items-center justify-between"><span>Cost</span><span className="text-amber-200/80">{money(aiHealth?.window?.cost_usd, 4)}</span></div>
        <div className="flex items-center justify-between"><span>Error rate</span><span>{pct(aiHealth?.window?.error_rate, 1)}</span></div>
        <div className="flex items-center justify-between"><span>P95</span><span>{ms(aiHealth?.window?.p95_latency_ms)}</span></div>
      </div>
      <div className="p-2 rounded bg-white/5 border border-white/10 col-span-2">
        <div className="flex items-center justify-between">
          <div className="opacity-70">Key status</div>
          <div className="text-[11px] opacity-60">Configured in Vercel env</div>
        </div>
        <div className="mt-1 grid grid-cols-3 gap-2">
          {(['gemini', 'openai', 'anthropic'] as const).map((p) => {
            const ok = (aiHealth as any)?.key_status?.[p]?.configured;
            return (
              <div key={p} className="flex items-center justify-between gap-2">
                <span className="opacity-80">{providerLabel(p)}</span>
                <span className={ok ? 'text-emerald-200' : 'text-rose-200'}>{ok ? 'OK' : 'Missing'}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>

    {Number((aiHealth as any)?.limitations_count || 0) > 0 && (
      <div className="mt-3 p-2 rounded bg-amber-500/10 border border-amber-400/30 text-xs">
        <div className="flex items-center justify-between gap-2">
          <div className="font-medium text-amber-200">Provider limitations detected</div>
          <div className="text-[11px] opacity-80">
            {Number((aiHealth as any)?.limitations_count || 0)} tool(s) not supported by{' '}
            <span className="font-medium">{providerLabel(aiHealth?.runtimeProvider)}</span>
          </div>
        </div>
        <div className="mt-2 space-y-2">
          {(((aiHealth as any)?.limitations || []) as any[]).slice(0, 8).map((t: any) => (
            <div key={t.id} className="p-2 rounded bg-white/5 border border-white/10">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium text-white/90">{String(t.label || t.id)}</div>
                <div className="text-[11px] opacity-80">
                  Supports: {Array.isArray(t.support) ? t.support.map((p: any) => providerLabel(p)).join(', ') : '—'}
                </div>
              </div>
              {t.note && <div className="mt-1 text-[11px] opacity-80">{String(t.note)}</div>}
              {Array.isArray(t.endpoints) && t.endpoints.length > 0 && (
                <div className="mt-1 text-[11px] opacity-70">Endpoints: {t.endpoints.join(', ')}</div>
              )}
            </div>
          ))}
          {(((aiHealth as any)?.limitations || []) as any[]).length > 8 && (
            <div className="text-[11px] opacity-80">
              Showing first 8. See /api/adminAiHealth for full list.
            </div>
          )}
        </div>
      </div>
    )}

    <div className="mt-3">
      <div className="text-xs opacity-70">Provider breakdown (window)</div>
      <div className="mt-2 overflow-auto">
        <table className="w-full text-xs">
          <thead className="text-[11px] text-amber-200/80">
            <tr className="border-b border-white/10">
              <th className="text-left py-2 pr-2">Provider</th>
              <th className="text-right py-2 px-2">Calls</th>
              <th className="text-right py-2 px-2">Errors</th>
              <th className="text-right py-2 px-2">Err%</th>
              <th className="text-right py-2 px-2">P95</th>
              <th className="text-right py-2 pl-2">Cost</th>
            </tr>
          </thead>
          <tbody>
            {(aiHealth?.by_provider || []).map((r: any, i: number) => (
              <tr key={r.provider || i} className="border-b border-white/5">
                <td className="py-2 pr-2 whitespace-nowrap">{providerLabel(r.provider)}</td>
                <td className="py-2 px-2 text-right">{Number(r.calls || 0).toLocaleString()}</td>
                <td className="py-2 px-2 text-right">{Number(r.errors || 0).toLocaleString()}</td>
                <td className="py-2 px-2 text-right">{pct(r.error_rate, 1)}</td>
                <td className="py-2 px-2 text-right">{ms(r.p95_latency_ms)}</td>
                <td className="py-2 pl-2 text-right text-amber-200/80">{money(r.cost_usd, 4)}</td>
              </tr>
            ))}
            {(!aiHealth?.by_provider || aiHealth.by_provider.length === 0) && (
              <tr>
                <td className="py-3 opacity-70" colSpan={6}>No provider data yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
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
      <thead className="text-xs text-amber-200/80">
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