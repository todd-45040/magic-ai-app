import React, { useEffect, useMemo, useState } from 'react';
import type { User } from '../types';
import { BILLING_PLAN_CATALOG, formatPriceCents, resolveBillingPlanKey, type BillingCycle } from '../services/planCatalog';
import { createPortalSession, fetchBillingStatus, type BillingStatusPayload } from '../services/billingClient';
import { getTrialPromptCopy } from '../services/trialMessaging';
import { logTrialExpiredOnce, logTrialPromptViewed } from '../services/ibmConversionTracking';

interface BillingSettingsProps {
  user: User | null;
  onUpgrade: (selection: { tier:'amateur'|'professional'; billingCycle?: BillingCycle; founderRequested?: boolean; }) => void;
}

const humanizePlan = (plan?: string | null) => String(plan || 'free')
  .replace(/_/g, ' ')
  .replace(/\w/g, (m) => m.toUpperCase());

const formatDate = (value?: string | null) => value ? new Date(value).toLocaleDateString() : '-';

const planPrice = (tier: 'amateur'|'professional', founder: boolean, cycle: BillingCycle) => {
  const key = founder
    ? (tier === 'amateur' ? 'founder_amateur' : 'founder_professional')
    : tier;
  const plan = BILLING_PLAN_CATALOG[key];
  return `${formatPriceCents(cycle === 'yearly' ? plan.annualPriceCents : plan.monthlyPriceCents)}${cycle === 'yearly' ? '/yr' : '/mo'}`;
};

const normalizeMembershipToPlanKey = (membership?: User['membership'] | null, trialEndDate?: number | null): string | null => {
  switch (membership) {
    case 'amateur':
    case 'performer':
      return 'amateur';
    case 'professional':
    case 'semi-pro':
      return 'professional';
    case 'trial':
      return typeof trialEndDate === 'number' && trialEndDate > Date.now() ? 'professional' : 'free';
    case 'admin':
      return 'professional';
    case 'free':
    case 'expired':
    default:
      return 'free';
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
const BillingSettings: React.FC<BillingSettingsProps> = ({ user, onUpgrade }) => {
  const [status, setStatus] = useState<BillingStatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalMessage, setPortalMessage] = useState('');
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');

  useEffect(() => {
    let active = true;

    const loadStatus = async () => {
      setLoading(true);
      try {
        const next = await fetchBillingStatus();
        if (!active) return;
        setStatus(next);
        setBillingCycle(next.currentBillingCycle || 'monthly');
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadStatus();
    return () => {
      active = false;
    };
  }, [user?.membership, user?.stripe_subscription_id, user?.stripe_status, user?.stripe_price_id]);

  const statusPlanKey = status?.planKey || 'free';
  const membershipPlanKey = normalizeMembershipToPlanKey(user?.membership, user?.trialEndDate);
  const userPlanKey = resolveBillingPlanKey(user);
  const currentPlanKey = pickMostAuthoritativePlanKey(statusPlanKey, membershipPlanKey, userPlanKey);
  const currentBillingCycle = status?.currentBillingCycle || 'monthly';
  const founderEligible = Boolean(status?.founderProtected || status?.founderLockedPlan);
  const founderPricingApplied = founderEligible;
  const cleanPlanName = status?.founderLockedPlan
  ?.replace('founder_', '')
  ?.replace(/^./, (c) => c.toUpperCase());

const founderLabel = useMemo(
  () =>
    status?.founderProtected
      ? `Founding Circle — Your ${cleanPlanName} pricing is locked at ${formatPriceCents(
          status.founderLockedPriceCents
        )}${(status?.currentBillingCycle || 'monthly') === 'yearly' ? '/yr' : '/mo'}`
      : 'Standard pricing',
  [status]
);
  const readiness = status?.billingReadiness;
  const missingEnvKeys = readiness?.missingEnvKeys || [];
  const trialPrompt = getTrialPromptCopy(user);

  useEffect(() => {
    if (!trialPrompt) return;
    void logTrialPromptViewed(user, 'billing');
    if (trialPrompt.stage === 'expired') {
      void logTrialExpiredOnce(user, 'billing');
    }
  }, [trialPrompt?.stage, user?.email, user?.trialEndDate, user?.signupSource]);

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
  const hasStripeSubscription = Boolean(
    status?.billingTruth?.stripeSnapshot?.subscriptionExists ||
    status?.billingTruth?.dbSnapshot?.stripeSubscriptionId ||
    status?.currentPriceId
  );
  const isTrialingWithoutPaidSubscription = Boolean(status?.billingStatus === 'trialing' && !hasStripeSubscription);


  return (
    <div className="space-y-6">
      {trialPrompt ? (
        <div className={`rounded-2xl border p-5 text-white ${trialPrompt.stage === 'expired' ? 'border-amber-400/35 bg-amber-500/10' : 'border-purple-400/30 bg-purple-500/10'}`}>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-base font-semibold">{trialPrompt.title}</div>
              <div className="mt-1 text-sm text-white/80">{trialPrompt.message}</div>
            </div>
            <button
              onClick={() => onUpgrade({ tier: 'professional', billingCycle, founderRequested: founderPricingApplied })}
              className={`inline-flex items-center justify-center rounded-xl px-4 py-3 text-sm font-bold transition ${trialPrompt.stage === 'expired' ? 'bg-amber-500 text-slate-950 hover:bg-amber-400' : 'bg-purple-600 text-white hover:bg-purple-700'}`}
            >
              {trialPrompt.cta}
            </button>
          </div>
        </div>
      ) : null}
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
            {/* <div
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${founderPricingApplied ? 'bg-amber-500/15 text-amber-200 border border-amber-400/30' : 'border border-white/10 bg-white/[0.04] text-white/70'}`}
            >
              {founderPricingApplied ? 'Founder pricing locked' : 'Founder pricing path unavailable'}
            </div> */}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-5 text-sm">
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-white/50 text-xs uppercase">Current plan</div>
            <div className="mt-1">{loading ? 'Loading…' : humanizePlan(currentPlanKey)?.replace(/^./, (c) => c.toUpperCase())}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-white/50 text-xs uppercase">Billing state</div>
            <div className="mt-1">{loading ? 'Loading…' : (status?.billingStatus || 'unknown')}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-white/50 text-xs uppercase">Renewal</div>
            <div className="mt-1">{loading ? 'Loading…' : formatDate(status?.renewalDate)}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-white/50 text-xs uppercase">Billing cycle</div>
            <div className="mt-1">{loading ? 'Loading…' : currentBillingCycle?.replace(/^./, (c) => c.toUpperCase())}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-white/50 text-xs uppercase">Founder status</div>
            <div className="mt-1">{loading ? 'Loading…' : founderLabel}</div>
            {!loading && founderPricingApplied ? (
              <div className="mt-1 text-xs text-amber-200/80">
                Your current pricing is protected from future increases.
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2 text-white">
        {(['amateur', 'professional'] as const).map((tier) => {
          const currentPlanMatch = tier === 'amateur' ? isCurrentAmateur : isCurrentProfessional;
          const badge = founderPricingApplied ? 'Founder pricing' : 'Standard pricing';
          const selectedCycle = billingCycle;
          const planName = tier === 'amateur' ? 'Amateur' : 'Professional';
          const currentTierRank = isTrialingWithoutPaidSubscription ? 0 : getPlanTierRank(currentPlanKey);
          const targetTierRank = getPlanTierRank(tier);
          const isDowngradePath = !isTrialingWithoutPaidSubscription && targetTierRank < currentTierRank;
          const isSamePlanAndCycle = !isTrialingWithoutPaidSubscription && currentPlanMatch && currentBillingCycle === selectedCycle;
          const isSamePlanDifferentCycle = !isTrialingWithoutPaidSubscription && currentPlanMatch && currentBillingCycle !== selectedCycle;
          const showCurrentBadge = isSamePlanAndCycle;
          const showCycleSwitchBadge = isSamePlanDifferentCycle;

          let buttonLabel = isTrialingWithoutPaidSubscription
            ? `Start ${planName} ${selectedCycle === 'yearly' ? 'Yearly' : 'Monthly'}`
            : `Upgrade to ${planName}`;
          let buttonDisabled = loading;
          let helperText = isTrialingWithoutPaidSubscription
            ? `Your IBM trial stays active. Checkout simply adds the paid ${planName} ${selectedCycle} plan so service can continue after the trial.`
            : '';

          if (isDowngradePath) {
            buttonLabel = 'Higher plan active';
            buttonDisabled = true;
            helperText = `Your ${humanizePlan(currentPlanKey)} plan is currently active. Downgrade paths are not available from this billing screen.`;
          } else if (isSamePlanAndCycle) {
            buttonLabel = 'Current plan';
            buttonDisabled = true;
            helperText = `Your ${planName} ${selectedCycle} plan is already active.`;
          } else if (isSamePlanDifferentCycle) {
            buttonLabel = selectedCycle === 'yearly' ? 'Switch to Yearly' : 'Switch to Monthly';
            helperText = status?.billingCustomerExists
              ? `Switch your ${planName} plan to ${selectedCycle} billing.`
              : `Start ${planName} ${selectedCycle} billing through checkout.`;
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
                    {planPrice(tier, founderPricingApplied, selectedCycle)}
                  </span>
                  {selectedCycle === 'yearly' ? (
                    <div className="mt-2 text-xs text-emerald-300">Save with yearly billing</div>
                  ) : null}
                </div>
              </div>

              <button
                onClick={() => {
                  if (!isTrialingWithoutPaidSubscription && isDowngradePath) {
                    console.warn('Blocked lower-tier checkout attempt while a higher-tier plan is active.');
                    return;
                  }
                  if (!isTrialingWithoutPaidSubscription && isSamePlanAndCycle) {
                    console.warn('Blocked duplicate subscription attempt for the current billing plan and cycle.');
                    return;
                  }
                  onUpgrade({ tier, billingCycle: selectedCycle, founderRequested: founderPricingApplied });
                }}
                disabled={buttonDisabled}
                className={`mt-4 inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-bold transition ${tier === 'amateur' ? 'bg-purple-600 text-white hover:bg-purple-700' : 'bg-amber-500 text-slate-950 hover:bg-amber-400'} ${(!isTrialingWithoutPaidSubscription && (isSamePlanAndCycle || isDowngradePath)) ? 'opacity-50 cursor-not-allowed' : ''} disabled:cursor-not-allowed disabled:opacity-50`}
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
            <div className="mt-1 break-all text-sm">{readiness?.expectedWebhookPath || '/api/stripe/webhook'}</div>
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
