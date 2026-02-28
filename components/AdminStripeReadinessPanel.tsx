import React, { useEffect, useMemo, useState } from 'react';
import { fetchStripeReadiness, type StripeReadinessResult } from '../services/adminStripeReadinessService';

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
  const [loading, setLoading] = useState(false);
  const [dryRunLoading, setDryRunLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(dryRun = false) {
    setError(null);
    if (dryRun) setDryRunLoading(true);
    else setLoading(true);

    try {
      const r = await fetchStripeReadiness(dryRun);
      if (!r.ok) throw new Error(r.error || 'Stripe readiness failed.');
      setData(r);
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

      <div className="grid md:grid-cols-2 gap-4">
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
    </div>
  );
}
