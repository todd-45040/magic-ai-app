import React, { useEffect, useMemo, useState } from 'react';
import { fetchStripeReadiness, fetchStripeWebhookHealth, fetchFounderCounts, manualFounderClaim, type FounderCountResult, type StripeReadinessResult, type StripeWebhookHealthResult } from '../services/adminStripeReadinessService';

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs border ${ok ? 'bg-emerald-500/10 border-emerald-400/30 text-emerald-200' : 'bg-rose-500/10 border-rose-400/30 text-rose-200'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-emerald-300' : 'bg-rose-300'}`} />
      {label}
    </span>
  );
}

export default function AdminStripeReadinessPanel() {
  const [data, setData] = useState<StripeReadinessResult | null>(null);
  const [webhook, setWebhook] = useState<StripeWebhookHealthResult | null>(null);
  const [founderCounts, setFounderCounts] = useState<FounderCountResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [dryRunLoading, setDryRunLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualEmail, setManualEmail] = useState('');
  const [manualStatus, setManualStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [manualLoading, setManualLoading] = useState(false);

  async function load(dryRun = false) {
    setError(null);
    if (dryRun) setDryRunLoading(true);
    else setLoading(true);

    try {
      const [r, w] = await Promise.all([
        fetchStripeReadiness(dryRun),
        fetchStripeWebhookHealth(),
      ]);
      if (!r.ok) throw new Error(r.error || 'Stripe readiness failed.');
      setData(r);
      setWebhook(w.ok ? w : w);
    } catch (e: any) {
      setError(e?.message || 'Stripe readiness failed.');
    } finally {
      setLoading(false);
      setDryRunLoading(false);
    }
  }

  useEffect(() => {
    load(false);
  }, []);


  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const fc = await fetchFounderCounts();
        setFounderCounts(fc?.ok ? fc : fc);
      } catch {
        // ignore
      }
    }, 30000);
    return () => clearInterval(t);
  }, []);


  const envRows = useMemo(() => {
    const env = data?.env || {};
    const keys = Object.keys(env);
    const required = [
      'STRIPE_SECRET_KEY',
      'STRIPE_PRICE_AMATEUR_MONTHLY',
      'STRIPE_PRICE_AMATEUR_ANNUAL',
      'STRIPE_PRICE_PRO_MONTHLY',
      'STRIPE_PRICE_PRO_ANNUAL',
    ];
    const founderOptional = ['STRIPE_PRICE_PRO_FOUNDER_MONTHLY', 'STRIPE_PRICE_PRO_FOUNDER_ANNUAL', 'STRIPE_COUPON_FOUNDER_PRO'];
    const webhook = ['STRIPE_WEBHOOK_SECRET'];

    const ordered = [...required, ...founderOptional, ...webhook].filter((k, i, a) => a.indexOf(k) === i && keys.includes(k));
    // include any unknown extras at the end
    const extras = keys.filter((k) => !ordered.includes(k)).sort();
    return [...ordered, ...extras].map((k) => ({ key: k, ok: !!env[k] }));
  }, [data]);

  const founders = data?.founders;
  const backup = data?.backup;

  const webhookStatus = useMemo(() => {
    const last = webhook?.last_event_received_at ? Date.parse(webhook.last_event_received_at) : NaN;
    const minutesAgo = Number.isFinite(last) ? Math.floor((Date.now() - last) / 60000) : null;

    const configured = !!webhook?.webhook_secret_configured;
    const sigActive = !!webhook?.signature_verification_active;

    // Green only if configured + signature verification active + we received an event recently.
    const recentOk = minutesAgo !== null && minutesAgo <= 10;
    const ok = configured && sigActive && recentOk;

    let label = 'No webhook events yet';
    if (minutesAgo !== null) label = `Last webhook: ${minutesAgo} min ago`;
    return { ok, minutesAgo, label };
  }, [webhook]);

  const backupLinkMasked = useMemo(() => {
    const url = backup?.payment_link_url;
    if (!url) return null;
    if (url.length <= 42) return url;
    return `${url.slice(0, 26)}…${url.slice(-12)}`;
  }, [backup?.payment_link_url]);

  async function copyBackupLink() {
    const url = backup?.payment_link_url;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setManualStatus({ ok: true, msg: 'Backup link copied.' });
      setTimeout(() => setManualStatus(null), 2500);
    } catch {
      setManualStatus({ ok: false, msg: 'Could not copy link (clipboard blocked).' });
      setTimeout(() => setManualStatus(null), 3000);
    }
  }

  async function runManualClaim() {
    const email = manualEmail.trim().toLowerCase();
    if (!email) {
      setManualStatus({ ok: false, msg: 'Enter an email address first.' });
      return;
    }
    setManualLoading(true);
    setManualStatus(null);
    try {
      const r = await manualFounderClaim(email);
      if (!r.ok) throw new Error(r.error || 'Manual claim failed.');
      setManualStatus({ ok: true, msg: r.message || 'Founder claimed.' });
      setManualEmail('');
      // refresh counts
      load(false);
    } catch (e: any) {
      setManualStatus({ ok: false, msg: e?.message || 'Manual claim failed.' });
    } finally {
      setManualLoading(false);
      setTimeout(() => setManualStatus(null), 4500);
    }
  }


  return (
    <div className="space-y-4">
      <div className="p-4 rounded-2xl bg-black/20 border border-white/10">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-white font-semibold">Stripe Readiness</div>
            <div className="text-white/60 text-sm">Confidence scaffolding before Stripe goes live.</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => load(false)}
              disabled={loading || dryRunLoading}
              className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white text-sm hover:bg-white/15 disabled:opacity-60"
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
            <button
              type="button"
              onClick={() => load(true)}
              disabled={loading || dryRunLoading}
              className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-400/20 text-amber-100 text-sm hover:bg-amber-500/15 disabled:opacity-60"
            >
              {dryRunLoading ? 'Running…' : 'Run Dry-Run Checkout'}
            </button>
          </div>
        </div>

        {error ? <div className="mt-3 text-sm text-rose-200">{error}</div> : null}
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-black/20 border border-white/10">
          <div className="text-white font-semibold mb-2">Required Env Vars</div>
          <div className="space-y-2">
            {envRows.map((r) => (
              <div key={r.key} className="flex items-center justify-between gap-3">
                <div className="text-sm text-white/80">{r.key}</div>
                <Badge ok={r.ok} label={r.ok ? 'Present' : 'Missing'} />
              </div>
            ))}
          </div>
          <div className="mt-3 text-xs text-white/50">
            Founder pricing: use <span className="text-white/70">founder price IDs</span> OR a <span className="text-white/70">hidden coupon</span>.
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-black/20 border border-white/10">
          <div className="text-white font-semibold mb-2">Founder Lock Integrity</div>

          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-white/5 border border-white/10">
              <div className="text-xs text-white/60">Founders</div>
              <div className="text-lg text-white font-semibold">{founders?.founders_total ?? '—'}</div>
            </div>
            <div className="p-3 rounded-xl bg-white/5 border border-white/10">
              <div className="text-xs text-white/60">With Lock</div>
              <div className="text-lg text-white font-semibold">{founders?.founders_with_lock ?? '—'}</div>
            </div>
            <div className="p-3 rounded-xl bg-white/5 border border-white/10">
              <div className="text-xs text-white/60">Lock %</div>
              <div className="text-lg text-white font-semibold">{typeof founders?.founders_lock_pct === 'number' ? `${founders.founders_lock_pct}%` : '—'}</div>
            </div>
          </div>

          <div className="mt-3 text-sm text-white/70">
            Goal: <span className="text-white">100%</span> founders have <span className="text-white">pricing_lock</span> set before Stripe goes live.
          </div>
        </div>
        
        <div className="p-4 rounded-2xl bg-black/20 border border-white/10">
          <div className="text-white font-semibold mb-2">Founder Allocation</div>

          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-white/5 border border-white/10">
              <div className="text-xs text-white/60">ADMC</div>
              <div className="text-lg text-white font-semibold">
                {typeof founderCounts?.admc_count === 'number' ? `${founderCounts.admc_count} / ${founderCounts.admc_limit ?? 75}` : '—'}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-white/5 border border-white/10">
              <div className="text-xs text-white/60">Reserve</div>
              <div className="text-lg text-white font-semibold">
                {typeof founderCounts?.reserve_count === 'number' ? `${founderCounts.reserve_count} / ${founderCounts.reserve_limit ?? 25}` : '—'}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-white/5 border border-white/10">
              <div className="text-xs text-white/60">Total</div>
              <div className="text-lg text-white font-semibold">
                {typeof founderCounts?.total_count === 'number' ? `${founderCounts.total_count} / ${founderCounts.total_limit ?? 100}` : '—'}
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="text-xs text-white/50">Auto-refreshes every 30s.</div>
            <Badge
              ok={!!founderCounts && founderCounts.admc_count < (founderCounts.admc_limit ?? 75)}
              label={!!founderCounts && founderCounts.admc_count < (founderCounts.admc_limit ?? 75) ? 'ADMC spots available' : 'ADMC full'}
            />
          </div>
        </div>

<div className="p-4 rounded-2xl bg-black/20 border border-white/10">
          <div className="text-white font-semibold mb-2">Webhook Health</div>

          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-white/80">{webhookStatus.label}</div>
            <Badge ok={webhookStatus.ok} label={webhookStatus.ok ? 'Healthy' : 'Needs Attention'} />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-white/5 border border-white/10">
              <div className="text-xs text-white/60">Secret</div>
              <div className="text-sm text-white font-semibold">{webhook?.webhook_secret_configured ? 'Configured' : 'Missing'}</div>
            </div>
            <div className="p-3 rounded-xl bg-white/5 border border-white/10">
              <div className="text-xs text-white/60">Signature Verify</div>
              <div className="text-sm text-white font-semibold">{webhook?.signature_verification_active ? 'Active' : 'Inactive'}</div>
            </div>
          </div>

          <div className="mt-3 text-xs text-white/50">
            Green = secret configured + signature verification active + webhook received in last <span className="text-white/70">10 minutes</span>.
            {webhook?.last_event_type ? (
              <span className="block mt-1">Last type: <span className="text-white/70">{webhook.last_event_type}</span></span>
            ) : null}
          </div>
        </div>

      </div>

      <div className="p-4 rounded-2xl bg-black/20 border border-white/10">
        <div className="text-white font-semibold mb-2">Dry-Run Checkout Result</div>

        {!data?.dryRun?.attempted ? (
          <div className="text-sm text-white/60">Run a dry-run checkout to verify your Stripe secret key + pricing configuration without redirecting.</div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge ok={!!data?.dryRun?.ok} label={data?.dryRun?.ok ? 'Success' : 'Failed'} />
              {data?.dryRun?.isTestKey === true ? <span className="text-xs text-white/50">(Test key detected)</span> : null}
              {data?.dryRun?.isTestKey === false ? <span className="text-xs text-white/50">(Live key detected)</span> : null}
            </div>

            <div className="text-sm text-white/70">
              Strategy: <span className="text-white">{data?.dryRun?.strategy || '—'}</span> • Price: <span className="text-white">{data?.dryRun?.priceId || '—'}</span>
              {data?.dryRun?.couponId ? (
                <>
                  {' '}
                  • Coupon: <span className="text-white">{data?.dryRun?.couponId}</span>
                </>
              ) : null}
            </div>

            {data?.dryRun?.session_id ? (
              <div className="text-sm text-white/70">
                Session: <span className="text-white">{data.dryRun.session_id}</span>
              </div>
            ) : null}

            {data?.dryRun?.error ? <div className="text-sm text-rose-200">{String(data.dryRun.error)}</div> : null}
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="p-4 rounded-2xl bg-black/20 border border-white/10">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-white font-semibold">Fail-Safe Backup Link</div>
              <div className="text-white/60 text-sm">Booth fallback if WiFi or app flow fails.</div>
            </div>
            <Badge ok={!!backup?.payment_link_configured} label={backup?.payment_link_configured ? 'Configured' : 'Missing'} />
          </div>

          <div className="mt-3 p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="text-xs text-white/60">STRIPE_FOUNDER_PAYMENT_LINK_URL</div>
            <div className="mt-1 flex items-center justify-between gap-3">
              <div className="text-sm text-white font-semibold break-all">{backupLinkMasked || '—'}</div>
              <button
                type="button"
                disabled={!backup?.payment_link_url}
                onClick={copyBackupLink}
                className="shrink-0 px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white text-sm hover:bg-white/15 disabled:opacity-60"
              >
                Copy
              </button>
            </div>
          </div>

          <div className="mt-3 text-xs text-white/50">
            Use this link at ADMC if the in-app checkout flow fails. After payment, manually claim the founder slot below to lock pricing.
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-black/20 border border-white/10">
          <div className="text-white font-semibold">Manual Founder Claim</div>
          <div className="text-white/60 text-sm">After backup-link payment, mark a user as an ADMC Founder (atomic cap-safe).</div>

          <div className="mt-3 flex items-center gap-2">
            <input
              value={manualEmail}
              onChange={(e) => setManualEmail(e.target.value)}
              placeholder="email@example.com"
              className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white text-sm outline-none focus:border-white/20"
            />
            <button
              type="button"
              onClick={runManualClaim}
              disabled={manualLoading}
              className="px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-400/20 text-emerald-100 text-sm hover:bg-emerald-500/15 disabled:opacity-60"
            >
              {manualLoading ? 'Claiming…' : 'Claim'}
            </button>
          </div>

          {manualStatus ? (
            <div className={`mt-3 text-sm ${manualStatus.ok ? 'text-emerald-200' : 'text-rose-200'}`}>{manualStatus.msg}</div>
          ) : null}

          <div className="mt-3 text-xs text-white/50">
            This writes <span className="text-white/70">founding_bucket=admc_2026</span> and applies <span className="text-white/70">pricing_lock</span> while enforcing the 75/100 caps.
          </div>
        </div>
      </div>
    </div>
  );
}
