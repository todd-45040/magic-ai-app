import React, { useState } from 'react';
import { CheckIcon, WandIcon, ShieldIcon } from './icons';
import { getFounderLockLabel, getUpgradeUxCopy, isFounderProtected } from '../services/upgradeUx';
import type { BillingCycle } from '../services/planCatalog';
import { BILLING_PLAN_CATALOG, formatPriceCents } from '../services/planCatalog';

interface UpgradeModalProps {
  onClose: () => void;
  onUpgrade: (selection: {
    tier: 'amateur' | 'professional';
    billingCycle?: BillingCycle;
    founderRequested?: boolean;
  }) => void;
  variant?: 'locked-tool' | 'trial-expired' | 'generic';
  user?: any;
}

const Row: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <li className="flex items-start gap-3">
    <CheckIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-400" />
    <span className="text-slate-200">{children}</span>
  </li>
);

const UpgradeModal: React.FC<UpgradeModalProps> = ({
  onClose,
  onUpgrade,
  variant = 'generic',
  user,
}) => {
  const founderProtected = isFounderProtected(user);
  const founderLockLabel = getFounderLockLabel(user);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const founderPricingApplied = founderProtected;

  const ux = getUpgradeUxCopy(
    variant === 'trial-expired'
      ? 'trial_exhausted'
      : founderProtected
        ? 'founder_protected'
        : 'locked_by_plan',
    { user, targetPlan: 'Professional', toolName: 'this feature' },
  );

  const title =
    variant === 'trial-expired'
      ? ux.title
      : variant === 'locked-tool'
        ? 'Locked by plan'
        : 'Choose your access level';

  const subtitle =
    variant === 'trial-expired'
      ? ux.message
      : founderProtected
        ? 'Your founder pricing stays protected across upgrades, downgrades, cancellation, and reactivation.'
        : 'Choose the plan that matches how often you rehearse, create, and run your shows.';

  const priceText = (tier: 'amateur' | 'professional') => {
    const key = founderPricingApplied
      ? tier === 'amateur'
        ? 'founder_amateur'
        : 'founder_professional'
      : tier;

    const plan = BILLING_PLAN_CATALOG[key];
    return `${formatPriceCents(
      billingCycle === 'yearly' ? plan.annualPriceCents : plan.monthlyPriceCents,
    )}${billingCycle === 'yearly' ? '/yr' : '/mo'}`;
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-slate-950/85 p-4 backdrop-blur-md sm:items-center sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative w-full max-w-5xl rounded-3xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/50"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full border border-slate-700 bg-slate-800/90 px-3 py-1.5 text-sm font-semibold text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
          aria-label="Close upgrade modal"
        >
          Close
        </button>

        <div className="border-b border-slate-800 px-6 pb-6 pt-8 text-center sm:px-8">
          <WandIcon className="mx-auto mb-3 h-12 w-12 text-amber-300" />
          <h2 className="font-cinzel text-3xl font-bold text-white">{title}</h2>
          <p className="mx-auto mt-3 max-w-2xl text-slate-300">{subtitle}</p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-800/60 px-3 py-1 text-xs text-slate-400">
            <ShieldIcon className="h-4 w-4 text-emerald-300" />
            <span>Secure payments • Cancel anytime • Billing syncs automatically</span>
          </div>
        </div>

        <div className="px-6 py-6 sm:px-8 sm:py-8">
          {founderProtected && (
            <div className="mb-6 rounded-2xl border border-amber-300/35 bg-amber-500/10 px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-200/90">
                  Founder Protected
                </span>
                <span className="rounded-full border border-amber-300/30 px-2 py-0.5 text-[11px] text-amber-100">
                  Rate locked for life
                </span>
              </div>
              <div className="mt-2 text-sm text-amber-100">
                Your founder pricing stays attached to your account across subscription changes and reactivation.
              </div>
              <div className="mt-1 text-xs text-slate-300/90">
                Lock key: <span className="font-mono text-amber-200/90">{founderLockLabel}</span>
              </div>
            </div>
          )}

          <div className="mb-8 flex flex-wrap items-center justify-center gap-3">
            <div className="inline-flex rounded-2xl border border-slate-700 bg-slate-950/50 p-1">
              <button
                onClick={() => setBillingCycle('monthly')}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                  billingCycle === 'monthly'
                    ? 'bg-purple-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800/80'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingCycle('yearly')}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                  billingCycle === 'yearly'
                    ? 'bg-purple-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800/80'
                }`}
              >
                Yearly
              </button>
            </div>
            <div
              className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                founderPricingApplied
                  ? 'border border-amber-400/30 bg-amber-500/15 text-amber-200'
                  : 'border border-slate-700 bg-slate-800/60 text-slate-300'
              }`}
            >
              {founderPricingApplied ? 'Founder pricing locked' : 'Founder pricing unavailable'}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="flex flex-col rounded-2xl border border-slate-800 bg-slate-950/30 p-6">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-cinzel text-2xl font-bold text-slate-100">14-Day Free Trial</h3>
                <span className="rounded-full border border-slate-700 bg-slate-800/70 px-2.5 py-1 text-xs font-semibold text-slate-200">
                  Trial
                </span>
              </div>
              <p className="mt-2 text-slate-400">
                Built for evaluation and first-week momentum, not long-term production use.
              </p>
              <div className="mt-4">
                <div className="text-3xl font-bold text-white">$0</div>
                <div className="text-sm text-slate-400">No credit card required</div>
              </div>
              <ul className="mb-6 mt-5 flex-1 space-y-2">
                <Row>Daily AI cap plus 14-day trial limits on selected tools</Row>
                <Row>Basic idea generation and research access</Row>
                <Row>Best for evaluation, not full production workflow after trial ends</Row>
              </ul>
              <button
                onClick={onClose}
                className="w-full rounded-xl bg-slate-800 px-4 py-3 font-bold text-white transition-colors hover:bg-slate-700"
              >
                {variant === 'trial-expired' ? 'Close' : 'Continue on current plan'}
              </button>
            </div>

            {(['amateur', 'professional'] as const).map((tier) => (
              <div
                key={tier}
                className={`flex h-full flex-col rounded-2xl p-6 ${
                  tier === 'professional'
                    ? 'border-2 border-amber-400/70 bg-gradient-to-b from-amber-500/10 to-slate-950/40'
                    : 'border border-slate-700 bg-slate-950/40'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3
                      className={`font-cinzel text-2xl font-bold ${
                        tier === 'professional' ? 'text-amber-200' : 'text-purple-200'
                      }`}
                    >
                      {tier === 'amateur' ? 'Amateur' : 'Professional'}
                    </h3>
                    <p className="mt-2 text-slate-400">
                      {tier === 'amateur'
                        ? 'For consistent rehearsal and show-building work.'
                        : 'Full performance and business operating system access.'}
                    </p>
                  </div>
                  <span
                    className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${
                      tier === 'professional'
                        ? 'border border-amber-400/40 bg-amber-500/15 text-amber-200'
                        : 'border border-purple-400/30 bg-purple-500/15 text-purple-200'
                    }`}
                  >
                    {founderPricingApplied
                      ? 'Pricing locked'
                      : tier === 'professional'
                        ? 'Best for Pros'
                        : 'Upgrade available'}
                  </span>
                </div>
                <div className="mt-4">
                  <div className="text-3xl font-bold text-white">{priceText(tier)}</div>
                  <div className="text-sm text-slate-400">
                    {founderPricingApplied
                      ? 'Your current pricing is protected from future increases.'
                      : 'Standard public pricing path.'}
                  </div>
                </div>
                <ul className="mb-6 mt-5 flex-1 space-y-2">
                  {tier === 'amateur' ? (
                    <>
                      <Row>Higher monthly AI and image limits</Row>
                      <Row>Show Planner, Saved Ideas, and Search access</Row>
                      <Row>Available as monthly and yearly billing</Row>
                    </>
                  ) : (
                    <>
                      <Row>Highest monthly AI and heavy-tool capacity</Row>
                      <Row>Live Rehearsal, Video Analysis, and business tools</Row>
                      <Row>Available as monthly and yearly billing</Row>
                    </>
                  )}
                </ul>
                <button
                  onClick={() => onUpgrade({ tier, billingCycle, founderRequested: founderPricingApplied })}
                  className={`mt-auto w-full rounded-xl px-4 py-3 font-bold transition-colors ${
                    tier === 'professional'
                      ? 'bg-amber-500 font-extrabold text-slate-900 hover:bg-amber-600'
                      : 'bg-purple-600 text-white hover:bg-purple-700'
                  }`}
                >
                  Upgrade to {tier === 'amateur' ? 'Amateur' : 'Professional'}
                </button>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-col gap-3 border-t border-slate-800 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-slate-400">
              Pick a plan to continue without interruption, or close this panel and come back later.
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              {variant !== 'trial-expired' && (
                <button
                  onClick={onClose}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 font-semibold text-white transition-colors hover:bg-slate-700"
                >
                  Continue on current plan
                </button>
              )}
              <button
                onClick={() =>
                  onUpgrade({
                    tier: 'professional',
                    billingCycle,
                    founderRequested: founderPricingApplied,
                  })
                }
                className="rounded-xl bg-amber-500 px-4 py-3 font-extrabold text-slate-900 transition-colors hover:bg-amber-600"
              >
                Upgrade to Professional
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UpgradeModal;
