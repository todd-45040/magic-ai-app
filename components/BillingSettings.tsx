import React, { useEffect, useMemo, useState } from 'react';
import type { User } from '../types';
import { BILLING_PLAN_CATALOG, formatPriceCents, resolveBillingPlanKey, type BillingCycle } from '../services/planCatalog';
import { createPortalSession, fetchBillingStatus, type BillingStatusPayload } from '../services/billingClient';

interface BillingSettingsProps {
  user: User | null;
  onUpgrade: (selection: { tier:'amateur'|'professional'; billingCycle?: BillingCycle; founderRequested?: boolean; }) => void;
}

const humanizePlan = (plan?: string | null) => String(plan || 'free')
  .replace(/_/g, ' ')
  .replace(/\b\w/g, (m) => m.toUpperCase());

const formatDate = (value?: string | null) => value ? new Date(value).toLocaleDateString() : '-';

const planPrice = (tier: 'amateur'|'professional', founder: boolean, cycle: BillingCycle) => {
  const key = founder
    ? (tier === 'amateur' ? 'founder_amateur' : 'founder_professional')
    : tier;
  const plan = BILLING_PLAN_CATALOG[key];
  return `${formatPriceCents(cycle === 'yearly' ? plan.annualPriceCents : plan.monthlyPriceCents)}${cycle === 'yearly' ? '/yr' : '/mo'}`;
};

const normalizeMembershipToPlanKey = (membership?: User['membership'] | null): string | null => {
  switch (membership) {
    case 'amateur':
    case 'performer':
      return 'amateur';
    case 'professional':
    case 'semi-pro':
      return 'professional';
    case 'free':
    case 'trial':
    case 'expired':
    case 'admin':
    default:
      return membership || null;
  }
};


const getPlanTierRank = (planKey?: string | null): number => {
  switch (planKey) {
    case 'founder_professional':
    case 'professional':
      return 2;
    case 'founder_amateur':
    case 'amateur':
      return 1;
    default:
      return 0;
  }
};

const pickMostAuthoritativePlanKey = (...planKeys: Array<string | null | undefined>): string => {
  return planKeys.reduce((best, candidate) =>
    getPlanTierRank(candidate) > getPlanTierRank(best) ? String(candidate) : best,
    'free'
  );
};
const BILLING_CYCLE_NOTICE_KEY = 'maw_billing_cycle_notice';

const BillingSettings: React.FC<BillingSettingsProps> = ({ user, onUpgrade }) => {
  const [status, setStatus] = useState<BillingStatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalMessage, setPortalMessage] = useState('');
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [founderRequested, setFounderRequested] = useState(false);
  const [billingNotice, setBillingNotice] = useState('');

  useEffect(() => {
    try {
      const savedNotice = window.sessionStorage.getItem(BILLING_CYCLE_NOTICE_KEY);
      if (!savedNotice) return;
      setBillingNotice(savedNotice);
      window.sessionStorage.removeItem(BILLING_CYCLE_NOTICE_KEY);
    } catch {}
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const next = await fetchBillingStatus();
        if (!active) return;
        setStatus(next);
        setBillingCycle(next.currentBillingCycle || 'monthly');
        if (!next.founderProtected && next.founderLockedPlan == null) {
          setFounderRequested(false);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const statusPlanKey = status?.planKey || 'free';
  const membershipPlanKey = normalizeMembershipToPlanKey(user?.membership);
  const userPlanKey = resolveBillingPlanKey(user);
  const currentPlanKey = pickMostAuthoritativePlanKey(statusPlanKey, membershipPlanKey, userPlanKey);
  const currentBillingCycle = status?.currentBillingCycle || 'monthly';
  const founderEligible = Boolean(status?.founderProtected || status?.founderLockedPlan);
  const founderLabel = useMemo(
    () =>
      status?.founderProtected
        ? `${humanizePlan(status.founderLockedPlan)} at ${formatPriceCents(status.founderLockedPriceCents)}`
        : 'Standard pricing',
    [status]
  );
  const readiness = status?.billingReadiness;
  const missingEnvKeys = readiness?.missingEnvKeys || [];

  const openPortal = async () => {
    setPortalBusy(true);
    setPortalMessage('');
    try {
      const result = await createPortalSession();
      if (result.url) {
        window.location.href = result.url;
      } else {
        setPortalMessage(result.message || 'Billing portal is not available yet.');
      }
    } catch (e: any) {
      setPortalMessage(e?.message || 'Unable to open billing portal.');
    } finally {
      setPortalBusy(false);
    }
  };

  const isCurrentAmateur = currentPlanKey === 'amateur' || currentPlanKey === 'founder_amateur';
  const isCurrentProfessional = currentPlanKey === 'professional' || currentPlanKey === 'founder_professional';

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-white">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Billing summary</h2>
            <p className="mt-1 text-sm text-white/60">
              Choose a plan and billing cycle in one place. This keeps the pricing controls visually attached to the upgrade cards.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 xl:justify-end">
            <div className="inline-flex rounded-xl border border-white/10 bg-black/20 p-1">
              <button
                onClick={() => setBillingCycle('monthly')}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${billingCycle === 'monthly' ? 'bg-purple-600 text-white' : 'text-white/70 hover:bg-white/[0.05]'}`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingCycle('yearly')}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${billingCycle === 'yearly' ? 'bg-purple-600 text-white' : 'text-white/70 hover:bg-white/[0.05]'}`}
              >
                Yearly
              </button>
            </div>
            <button
              onClick={() => founderEligible && setFounderRequested((v) => !v)}
              disabled={!founderEligible}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${founderRequested ? 'bg-amber-500 text-slate-950' : 'border border-white/10 bg-white/[0.04] text-white/70'} disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {founderEligible
                ? `Founder pricing path ${founderRequested ? 'On' : 'Off'}`
                : 'Founder pricing path unavailable'}
            </button>
          </div>
        </div>

        {billingNotice ? (
          <div className="mt-4 flex items-start justify-between gap-3 rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-sm text-emerald-100">
            <div>
              <div className="font-semibold">Proration applied</div>
              <div className="mt-1 text-emerald-50/90">{billingNotice}</div>
            </div>
            <button
              type="button"
              onClick={() => setBillingNotice('')}
              className="rounded-lg border border-white/10 px-2 py-1 text-xs font-semibold text-white/80 transition hover:bg-white/10"
            >
              Dismiss
            </button>
          </div>
        ) : null}

        <div className="mt-4 grid gap-3 md:grid-cols-5 text-sm">
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-white/50 text-xs uppercase">Current plan</div>
            <div className="mt-1">{loading ? 'Loading…' : humanizePlan(currentPlanKey)}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-white/50 text-xs uppercase">Billing state</div>
            <div className="mt-1">{loading ? 'Loading…' : (status?.billingStatus || 'unknown')}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="flex items-center gap-2 text-white/50 text-xs uppercase">
              <span>Renewal</span>
              <span
                title="If you recently changed billing cycles, Stripe may apply a proration credit or charge and adjust the next invoice accordingly."
                className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/15 text-[10px] normal-case text-white/70 cursor-help"
              >
                i
              </span>
            </div>
            <div className="mt-1">{loading ? 'Loading…' : formatDate(status?.renewalDate)}</div>
            <div className="mt-1 text-[11px] text-white/45">Next invoice may be adjusted due to billing changes.</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-white/50 text-xs uppercase">Billing cycle</div>
            <div className="mt-1">{loading ? 'Loading…' : humanizePlan(currentBillingCycle)}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-white/50 text-xs uppercase">Founder status</div>
            <div className="mt-1">{loading ? 'Loading…' : founderLabel}</div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2 text-white">
        {(['amateur', 'professional'] as const).map((tier) => {
          const currentPlanMatch = tier === 'amateur' ? isCurrentAmateur : isCurrentProfessional;
          const badge = founderRequested && founderEligible ? 'Founder pricing path' : 'Standard pricing';
          const selectedCycle = billingCycle;
          const planName = tier === 'amateur' ? 'Amateur' : 'Professional';
          const currentTierRank = getPlanTierRank(currentPlanKey);
          const targetTierRank = getPlanTierRank(tier);
          const isDowngradePath = targetTierRank < currentTierRank;
          const isSamePlanAndCycle = currentPlanMatch && currentBillingCycle === selectedCycle;
          const isSamePlanDifferentCycle = currentPlanMatch && currentBillingCycle !== selectedCycle;
          const showCurrentBadge = isSamePlanAndCycle;
          const showCycleSwitchBadge = isSamePlanDifferentCycle;

          let buttonLabel = `Upgrade to ${planName}`;
          let buttonDisabled = loading;
          let helperText = '';

          if (isDowngradePath) {
            buttonLabel = 'Higher plan active';
            buttonDisabled = true;
            helperText = `Your ${humanizePlan(currentPlanKey)} plan is currently active. Downgrade paths are not available from this billing screen.`;
          } else if (isSamePlanAndCycle) {
            buttonLabel = 'Current plan';
            buttonDisabled = true;
            helperText = `Your ${planName} ${selectedCycle} plan is already active.`;
          } else if (isSamePlanDifferentCycle) {
            if (!status?.billingCustomerExists) {
              buttonLabel = 'Complete checkout to activate billing';
              buttonDisabled = true;
              helperText = 'Complete checkout to activate billing.';
            } else {
              buttonLabel = selectedCycle === 'yearly' ? 'Switch to Yearly' : 'Switch to Monthly';
              helperText = `Switch your ${planName} plan to ${selectedCycle} billing.`;
            }
          }

          return (
            <div
              key={tier}
              className={`rounded-2xl border p-5 ${tier === 'amateur' ? 'border-purple-400/20 bg-purple-500/10' : 'border-amber-400/20 bg-amber-500/10'}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{planName}</p>
                    {showCurrentBadge ? (
                      <span className="rounded-full border border-white/20 px-2 py-0.5 text-[10px] uppercase">Current</span>
                    ) : showCycleSwitchBadge ? (
                      <span className="rounded-full border border-white/20 px-2 py-0.5 text-[10px] uppercase">Switch billing cycle</span>
                    ) : (
                      <span className="rounded-full border border-white/20 px-2 py-0.5 text-[10px] uppercase">{badge}</span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-white/65">
                    {tier === 'amateur'
                      ? 'Creative tools, saved workspaces, and broader practice access.'
                      : 'Full rehearsal, performance, and business operating system access.'}
                  </p>
                </div>
                <div className="text-right">
                  <span className="rounded-full border border-white/15 px-3 py-1 text-xs font-semibold">
                    {planPrice(tier, founderRequested && founderEligible, selectedCycle)}
                  </span>
                  {selectedCycle === 'yearly' ? (
                    <div className="mt-2 text-xs text-emerald-300">Save with yearly billing</div>
                  ) : null}
                </div>
              </div>

              <button
                onClick={() => {
                  if (isDowngradePath) {
                    console.warn('Blocked lower-tier checkout attempt while a higher-tier plan is active.');
                    return;
                  }
                  if (isSamePlanAndCycle) {
                    console.warn('Blocked duplicate subscription attempt for the current billing plan and cycle.');
                    return;
                  }
                  onUpgrade({ tier, billingCycle: selectedCycle, founderRequested: founderRequested && founderEligible });
                }}
                disabled={buttonDisabled}
                className={`mt-4 inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-bold transition ${tier === 'amateur' ? 'bg-purple-600 text-white hover:bg-purple-700' : 'bg-amber-500 text-slate-950 hover:bg-amber-400'} ${(isSamePlanAndCycle || isDowngradePath) ? 'opacity-50 cursor-not-allowed' : ''} disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {buttonLabel}
              </button>
              {helperText ? <div className="mt-2 text-xs text-white/60">{helperText}</div> : null}
            </div>
          );
        })}
        </div>

        <p className="mt-4 text-xs text-white/50">
          Single billing truth model: Amateur and Professional each support monthly, yearly, founder monthly, and founder yearly checkout paths.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-white">
        <h2 className="text-lg font-semibold">Stripe readiness check</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-white/50 text-xs uppercase">Expected webhook path</div>
            <div className="mt-1 break-all text-sm">{readiness?.expectedWebhookPath || '/api/stripeWebhook'}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-white/50 text-xs uppercase">Expected webhook URL</div>
            <div className="mt-1 break-all text-sm">{readiness?.expectedWebhookUrl || 'Unavailable'}</div>
          </div>
        </div>
        <div className="mt-3 text-sm text-white/70">
          Server secret: {readiness?.hasServerSecretKey ? 'Present' : 'Missing'} · Publishable key: {readiness?.hasPublishableKey ? 'Present' : 'Missing'} · Webhook secret: {readiness?.hasWebhookSecret ? 'Present' : 'Missing'}
        </div>
        <div className="mt-2 text-sm text-white/70">
          Configured price IDs: {readiness?.configuredPriceKeys?.length || 0} · Missing price IDs: {readiness?.missingPriceKeys?.length || 0}
        </div>
        {missingEnvKeys.length ? (
          <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-sm text-amber-100">
            <div className="font-semibold">Missing Stripe env vars</div>
            <div className="mt-2 break-words">{missingEnvKeys.join(', ')}</div>
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-sm text-emerald-100">
            Stripe readiness check passed for the current expected env set.
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-white">
        <h2 className="text-lg font-semibold">Portal & customer record</h2>
        <div className="mt-3 text-sm text-white/70">
          Stripe configured: {status?.stripeConfigured ? 'Yes' : 'No'} · Billing customer: {status?.billingCustomerExists ? 'Exists' : 'Not yet created'}
        </div>
        <button
          onClick={() => void openPortal()}
          disabled={portalBusy}
          className="mt-4 inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {portalBusy ? 'Checking billing portal…' : status?.stripeConfigured ? 'Open billing portal' : 'Billing portal coming soon'}
        </button>
        {portalMessage ? <div className="mt-3 text-sm text-white/70">{portalMessage}</div> : null}
      </div>
    </div>
  );
};

export default BillingSettings;
