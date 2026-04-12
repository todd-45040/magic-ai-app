import React, { useMemo, useState } from 'react';
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
  <li className="flex items-start gap-3 text-sm leading-6 text-slate-200">
    <CheckIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-400" />
    <span>{children}</span>
  </li>
);

const UpgradeModal: React.FC<UpgradeModalProps> = ({ onClose, onUpgrade, variant = 'generic', user }) => {
  const founderProtected = isFounderProtected(user);
  const founderLockLabel = getFounderLockLabel(user);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const founderPricingApplied = founderProtected;

  const ux = getUpgradeUxCopy(
    variant === 'trial-expired' ? 'trial_exhausted' : founderProtected ? 'founder_protected' : 'locked_by_plan',
    { user, targetPlan: 'Professional', toolName: 'this feature' }
  );

  const title = variant === 'trial-expired' ? ux.title : variant === 'locked-tool' ? 'Locked by plan' : 'Choose your access level';
  const subtitle =
    variant === 'trial-expired'
      ? ux.message
      : founderProtected
        ? 'Your founder pricing remains protected across upgrades, downgrades, cancellation, and reactivation.'
        : 'Choose the plan that fits how often you create, rehearse, and run your show business.';

  const priceText = useMemo(
    () => (tier: 'amateur' | 'professional') => {
      const key = founderPricingApplied ? (tier === 'amateur' ? 'founder_amateur' : 'founder_professional') : tier;
      const plan = BILLING_PLAN_CATALOG[key];
      return `${formatPriceCents(billingCycle === 'yearly' ? plan.annualPriceCents : plan.monthlyPriceCents)}${billingCycle === 'yearly' ? '/yr' : '/mo'}`;
    },
    [billingCycle, founderPricingApplied]
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-700/80 bg-slate-950 shadow-2xl shadow-purple-900/40"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(168,85,247,0.18),_transparent_40%),radial-gradient(circle_at_bottom_right,_rgba(245,158,11,0.12),_transparent_30%)]" />

        <div className="relative border-b border-slate-800/90 px-5 py-5 sm:px-8 sm:py-7">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 rounded-full border border-slate-700 bg-slate-900/80 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white"
          >
            Close
          </button>

          <div className="mx-auto max-w-3xl text-center">
            <WandIcon className="mx-auto mb-3 h-12 w-12 text-amber-300" />
            <h2 className="font-cinzel text-3xl font-bold text-white sm:text-4xl">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300 sm:text-base">{subtitle}</p>
            <div className="mt-4 inline-flex max-w-full items-center gap-2 rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-400">
              <ShieldIcon className="h-4 w-4 flex-shrink-0 text-emerald-300" />
              <span>Secure payments • Cancel anytime • Billing syncs automatically</span>
            </div>
          </div>
        </div>

        <div className="relative px-5 py-5 sm:px-8 sm:py-7">
          {founderProtected && (
            <div className="mb-6 rounded-2xl border border-amber-300/35 bg-amber-500/10 px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-200/90">Founder protected</span>
                <span className="rounded-full border border-amber-300/30 px-2 py-0.5 text-[11px] text-amber-100">Rate locked for life</span>
              </div>
              <div className="mt-2 text-sm text-amber-100">
                Your founder pricing stays attached to your account across subscription changes and reactivation.
              </div>
              <div className="mt-1 text-xs text-slate-300/90">
                Lock key: <span className="font-mono text-amber-200/90">{founderLockLabel}</span>
              </div>
            </div>
          )}

          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center">
            <div className="inline-flex rounded-2xl border border-slate-700 bg-slate-900/70 p-1">
              <button
                onClick={() => setBillingCycle('monthly')}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${billingCycle === 'monthly' ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/30' : 'text-slate-300 hover:text-white'}`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingCycle('yearly')}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${billingCycle === 'yearly' ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/30' : 'text-slate-300 hover:text-white'}`}
              >
                Yearly
              </button>
            </div>

            <div
              className={`rounded-2xl px-4 py-2 text-sm font-semibold ${founderPricingApplied ? 'border border-amber-400/30 bg-amber-500/15 text-amber-200' : 'border border-slate-700 bg-slate-900/70 text-slate-300'}`}
            >
              {founderPricingApplied ? 'Founder pricing locked' : 'Founder pricing path unavailable'}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="flex h-full flex-col rounded-2xl border border-slate-800 bg-slate-950/40 p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-cinzel text-2xl font-bold text-slate-100">14-Day Free Trial</h3>
                <span className="rounded-full border border-slate-700 bg-slate-800/70 px-2.5 py-1 text-xs font-semibold text-slate-200">Trial</span>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Built for evaluation and early momentum, not long-term production use.
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
                className="mt-auto w-full rounded-xl bg-slate-800 px-4 py-3 font-bold text-white transition-colors hover:bg-slate-700"
              >
                {variant === 'trial-expired' ? 'Close' : 'Continue on current plan'}
              </button>
            </div>

            {(['amateur', 'professional'] as const).map((tier) => (
              <div
                key={tier}
                className={`flex h-full flex-col rounded-2xl p-5 sm:p-6 ${tier === 'professional' ? 'border-2 border-amber-400/70 bg-gradient-to-b from-amber-500/10 to-slate-950/50 shadow-[0_0_24px_rgba(245,158,11,0.08)]' : 'border border-slate-700 bg-slate-950/50'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className={`font-cinzel text-2xl font-bold ${tier === 'professional' ? 'text-amber-200' : 'text-purple-200'}`}>
                      {tier === 'amateur' ? 'Amateur' : 'Professional'}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      {tier === 'amateur'
                        ? 'For consistent rehearsal and show-building work.'
                        : 'Full performance and business operating system access.'}
                    </p>
                  </div>
                  <span
                    className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${tier === 'professional' ? 'border border-amber-400/40 bg-amber-500/15 text-amber-200' : 'border border-purple-400/30 bg-purple-500/15 text-purple-200'}`}
                  >
                    {founderPricingApplied ? 'Pricing locked' : tier === 'professional' ? 'Best for Pros' : 'Upgrade available'}
                  </span>
                </div>

                <div className="mt-4">
                  <div className="text-3xl font-bold text-white">{priceText(tier)}</div>
                  <div className="mt-1 text-sm text-slate-400">
                    {founderPricingApplied ? 'Your pricing is protected from future increases.' : 'Standard public pricing path.'}
                  </div>
                </div>

                <ul className="mb-6 mt-5 flex-1 space-y-2">
                  {tier === 'amateur' ? (
                    <>
                      <Row>Higher monthly AI and image limits</Row>
                      <Row>Show Planner, Saved Ideas, and Search access</Row>
                      <Row>Monthly and yearly billing supported</Row>
                    </>
                  ) : (
                    <>
                      <Row>Highest monthly AI and heavy-tool capacity</Row>
                      <Row>Live Rehearsal, Video Analysis, and business tools</Row>
                      <Row>Best fit for regular performers and working pros</Row>
                    </>
                  )}
                </ul>

                <button
                  onClick={() => onUpgrade({ tier, billingCycle, founderRequested: founderPricingApplied })}
                  className={`mt-auto w-full rounded-xl px-4 py-3 font-bold transition-colors ${tier === 'professional' ? 'bg-amber-500 text-slate-950 hover:bg-amber-400' : 'bg-purple-600 text-white hover:bg-purple-500'}`}
                >
                  Upgrade to {tier === 'amateur' ? 'Amateur' : 'Professional'}
                </button>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-col gap-3 border-t border-slate-800/80 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-slate-500">
              Membership upgrades route through the same billing system and return you to the app after checkout.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              {variant !== 'trial-expired' && (
                <button
                  onClick={onClose}
                  className="rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-slate-700"
                >
                  Continue on current plan
                </button>
              )}
              <button
                onClick={() => onUpgrade({ tier: 'amateur', billingCycle, founderRequested: founderPricingApplied })}
                className="rounded-xl border border-purple-400/40 bg-slate-900/40 px-4 py-2.5 text-sm font-bold text-purple-200 transition-colors hover:bg-slate-800/70 sm:hidden"
              >
                Upgrade to Amateur
              </button>
              <button
                onClick={() => onUpgrade({ tier: 'professional', billingCycle, founderRequested: founderPricingApplied })}
                className="rounded-xl bg-amber-500/90 px-4 py-2.5 text-sm font-extrabold text-slate-950 transition-colors hover:bg-amber-400 sm:hidden"
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
