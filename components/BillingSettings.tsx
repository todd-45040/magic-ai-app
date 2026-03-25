import React, { useEffect, useMemo, useState } from 'react';
import type { User } from '../types';
import { BILLING_PLAN_CATALOG, formatPriceCents, type BillingCycle } from '../services/planCatalog';
import { createPortalSession, fetchBillingStatus, type BillingStatusPayload } from '../services/billingClient';

interface BillingSettingsProps {
  user: User | null;
  onUpgrade: (selection: {
    tier: 'amateur' | 'professional';
    billingCycle?: BillingCycle;
    founderRequested?: boolean;
  }) => void;
}

const humanizePlan = (plan?: string | null) => String(plan || 'free').replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
const formatDate = (value?: string | null) => value ? new Date(value).toLocaleDateString() : '-';
const planPrice = (tier: 'amateur' | 'professional', founder: boolean, cycle: BillingCycle) => {
  const key = founder ? (tier === 'amateur' ? 'founder_amateur' : 'founder_professional') : tier;
  const plan = BILLING_PLAN_CATALOG[key];
  return `${formatPriceCents(cycle === 'yearly' ? plan.annualPriceCents : plan.monthlyPriceCents)}${cycle === 'yearly' ? '/yr' : '/mo'}`;
};

const BillingSettings: React.FC<BillingSettingsProps> = ({ onUpgrade }) => {
  const [status, setStatus] = useState<BillingStatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalMessage, setPortalMessage] = useState('');
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [founderRequested, setFounderRequested] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const next = await fetchBillingStatus();
        if (active) {
          setStatus(next);
          setBillingCycle(next.currentBillingCycle || 'monthly');
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const currentPlanKey = status?.planKey || 'free';
  const currentCycle = status?.currentBillingCycle || 'monthly';
  const founderLabel = useMemo(
    () => status?.founderProtected
      ? `${humanizePlan(status.founderLockedPlan)} at ${formatPriceCents(status.founderLockedPriceCents)}`
      : 'Standard pricing',
    [status],
  );

  const openPortal = async () => {
    setPortalBusy(true);
    setPortalMessage('');
    try {
      const result = await createPortalSession();
      if (result.url) window.location.href = result.url;
      else setPortalMessage(result.message || 'Billing portal is not available yet.');
    } catch (e: any) {
      setPortalMessage(e?.message || 'Unable to open billing portal.');
    } finally {
      setPortalBusy(false);
    }
  };

  const isCurrentAmateur = currentPlanKey === 'amateur' || currentPlanKey === 'founder_amateur';
  const isCurrentProfessional = currentPlanKey === 'professional' || currentPlanKey === 'founder_professional';

  const getButtonLabel = (tier: 'amateur' | 'professional', current: boolean) => {
    if (!current) return tier === 'amateur' ? 'Choose Amateur' : 'Upgrade to Professional';
    if (billingCycle !== currentCycle) return billingCycle === 'yearly' ? 'Switch to Yearly' : 'Switch to Monthly';
    return 'Current plan';
  };

  const isDisabled = (current: boolean) => loading || (current && billingCycle === currentCycle);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-white">
        <h2 className="text-lg font-semibold">Billing summary</h2>
        <div className="mt-3 grid gap-3 text-sm md:grid-cols-5">
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-xs uppercase text-white/50">Current plan</div>
            <div className="mt-1">{loading ? 'Loading…' : humanizePlan(currentPlanKey)}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-xs uppercase text-white/50">Billing state</div>
            <div className="mt-1">{loading ? 'Loading…' : (status?.billingStatus || 'unknown')}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-xs uppercase text-white/50">Renewal</div>
            <div className="mt-1">{loading ? 'Loading…' : formatDate(status?.renewalDate)}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-xs uppercase text-white/50">Billing cycle</div>
            <div className="mt-1">{loading ? 'Loading…' : humanizePlan(currentCycle)}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-xs uppercase text-white/50">Founder status</div>
            <div className="mt-1">{loading ? 'Loading…' : founderLabel}</div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button onClick={() => setBillingCycle('monthly')} className={`rounded-xl px-4 py-2 text-sm font-semibold ${billingCycle === 'monthly' ? 'bg-purple-600 text-white' : 'border border-white/10 bg-white/[0.04] text-white/70'}`}>Monthly</button>
          <button onClick={() => setBillingCycle('yearly')} className={`rounded-xl px-4 py-2 text-sm font-semibold ${billingCycle === 'yearly' ? 'bg-purple-600 text-white' : 'border border-white/10 bg-white/[0.04] text-white/70'}`}>Yearly</button>
          <button onClick={() => setFounderRequested((v) => !v)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${founderRequested ? 'bg-amber-500 text-slate-950' : 'border border-white/10 bg-white/[0.04] text-white/70'}`}>Founder pricing path {founderRequested ? 'On' : 'Off'}</button>
        </div>
        <p className="mt-3 text-xs text-white/50">Single billing truth model: Amateur and Professional each support monthly, yearly, founder monthly, and founder yearly checkout paths.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 text-white lg:grid-cols-2">
        {(['amateur', 'professional'] as const).map((tier) => {
          const current = tier === 'amateur' ? isCurrentAmateur : isCurrentProfessional;
          const badge = founderRequested ? 'Founder pricing path' : 'Standard pricing';
          return (
            <div key={tier} className={`rounded-2xl border p-5 ${tier === 'amateur' ? 'border-purple-400/20 bg-purple-500/10' : 'border-amber-400/20 bg-amber-500/10'}`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{tier === 'amateur' ? 'Amateur' : 'Professional'}</p>
                    {current ? (
                      <span className="rounded-full border border-white/20 px-2 py-0.5 text-[10px] uppercase">Current</span>
                    ) : (
                      <span className="rounded-full border border-white/20 px-2 py-0.5 text-[10px] uppercase">{badge}</span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-white/65">{tier === 'amateur' ? 'Creative tools, saved workspaces, and broader practice access.' : 'Full rehearsal, performance, and business operating system access.'}</p>
                </div>
                <div className="text-right">
                  <span className="rounded-full border border-white/15 px-3 py-1 text-xs font-semibold">{planPrice(tier, founderRequested, billingCycle)}</span>
                  {billingCycle === 'yearly' ? <div className="mt-2 text-[11px] text-emerald-300">Save with yearly billing</div> : null}
                </div>
              </div>
              <button
                onClick={() => onUpgrade({ tier, billingCycle, founderRequested })}
                disabled={isDisabled(current)}
                className={`mt-4 inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-bold transition ${tier === 'amateur' ? 'bg-purple-600 text-white hover:bg-purple-700' : 'bg-amber-500 text-slate-950 hover:bg-amber-400'} disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {getButtonLabel(tier, current)}
              </button>
            </div>
          );
        })}
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-white">
        <h2 className="text-lg font-semibold">Portal & customer record</h2>
        <div className="mt-3 text-sm text-white/70">Stripe configured: {status?.stripeConfigured ? 'Yes' : 'No'} · Billing customer: {status?.billingCustomerExists ? 'Exists' : 'Not yet created'}</div>
        <button onClick={() => void openPortal()} disabled={portalBusy} className="mt-4 inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60">{portalBusy ? 'Checking billing portal…' : status?.stripeConfigured ? 'Open billing portal' : 'Billing portal coming soon'}</button>
        {portalMessage ? <div className="mt-3 text-sm text-white/70">{portalMessage}</div> : null}
      </div>
    </div>
  );
};

export default BillingSettings;
