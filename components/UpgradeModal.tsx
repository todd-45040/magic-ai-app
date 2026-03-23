import React from 'react';
import { CheckIcon, WandIcon, ShieldIcon } from './icons';
import { getFounderLockLabel, getUpgradeUxCopy, isFounderProtected } from '../services/upgradeUx';

interface UpgradeModalProps {
  onClose: () => void;
  onUpgrade: (tier: 'amateur' | 'professional', billingCycle?: 'monthly' | 'yearly', founderRequested?: boolean) => void;
  variant?: 'locked-tool' | 'trial-expired' | 'generic';
  user?: any;
}

const Row: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <li className="flex items-start gap-3">
    <CheckIcon className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
    <span className="text-slate-200">{children}</span>
  </li>
);

const UpgradeModal: React.FC<UpgradeModalProps> = ({ onClose, onUpgrade, variant = 'generic', user }) => {
  const founderProtected = isFounderProtected(user);
  const [billingCycle, setBillingCycle] = React.useState<'monthly' | 'yearly'>('monthly');
  const [founderRequested, setFounderRequested] = React.useState<boolean>(Boolean(founderProtected));
  const founderLockLabel = getFounderLockLabel(user);
  const ux = getUpgradeUxCopy(
    variant === 'trial-expired' ? 'trial_exhausted' : founderProtected ? 'founder_protected' : 'locked_by_plan',
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
      ? 'Your founder pricing remains protected across upgrades, downgrades, cancellation, and reactivation.'
      : 'Keep plan language and upgrade paths consistent across the platform.';

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 sm:p-6 overflow-y-auto z-50 animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-4xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl shadow-purple-900/40 max-h-[calc(100vh-3rem)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-20 p-6 sm:p-8 text-center border-b border-slate-800 bg-slate-900/95 backdrop-blur">
          <WandIcon className="w-14 h-14 mx-auto mb-3 text-amber-300" />
          <h2 className="font-cinzel text-3xl font-bold text-white">{title}</h2>
          <p className="text-slate-300 mt-2">{subtitle}</p>
          <div className="mt-4 inline-flex items-center gap-2 text-xs text-slate-400 bg-slate-800/60 border border-slate-700 rounded-full px-3 py-1">
            <ShieldIcon className="w-4 h-4 text-emerald-300" />
            <span>Secure payments • Cancel anytime • Billing state syncs through verified webhooks</span>
          </div>
        </div>

        <div className="p-8 pb-28">
          {founderProtected && (
            <div className="mb-6 rounded-2xl border border-amber-300/35 bg-amber-500/10 px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] uppercase tracking-wider text-amber-200/90 font-semibold">Founder Protected</span>
                <span className="text-[11px] rounded-full border border-amber-300/30 px-2 py-0.5 text-amber-100">Rate locked for life</span>
              </div>
              <div className="mt-2 text-sm text-amber-100">
                Your founder pricing stays attached to your account across subscription changes and reactivation.
              </div>
              <div className="mt-1 text-xs text-slate-300/90">
                Lock key: <span className="font-mono text-amber-200/90">{founderLockLabel}</span>
              </div>
            </div>
          )}

          <div className="mb-6 rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-white">Checkout options</p>
                <p className="mt-1 text-sm text-slate-400">Expose the real Stripe path here so monthly, yearly, and founder-aware checkout can be tested directly.</p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="inline-flex rounded-xl border border-slate-700 bg-slate-900/50 p-1">
                  <button type="button" onClick={() => setBillingCycle('monthly')} className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${billingCycle === 'monthly' ? 'bg-purple-600 text-white' : 'text-slate-300 hover:text-white'}`}>Monthly</button>
                  <button type="button" onClick={() => setBillingCycle('yearly')} className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${billingCycle === 'yearly' ? 'bg-purple-600 text-white' : 'text-slate-300 hover:text-white'}`}>Yearly</button>
                </div>
                <label className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${founderProtected ? 'border-amber-300/30 bg-amber-500/10 text-amber-100' : 'border-slate-700 bg-slate-900/50 text-slate-500'}`}>
                  <input type="checkbox" checked={founderRequested} onChange={(e) => setFounderRequested(e.target.checked)} disabled={!founderProtected} />
                  <span>Use founder pricing path</span>
                </label>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 bg-slate-950/30 border border-slate-800 rounded-2xl flex flex-col">
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-bold text-slate-100 font-cinzel">14-Day Free Trial</h3>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-800/70 border border-slate-700 text-slate-200">
                  Trial
                </span>
              </div>
              <p className="text-slate-400 mt-2">Built for evaluation and first-week momentum, not long-term production use.</p>
              <div className="mt-4">
                <div className="text-3xl font-bold text-white">$0</div>
                <div className="text-sm text-slate-400">No credit card required</div>
              </div>
              <ul className="space-y-2 mt-5 mb-6 flex-1">
                <Row>Daily AI cap plus 14-day trial limits on selected tools</Row>
                <Row>Basic idea generation and research access</Row>
                <Row>Best for evaluation, not full production workflow after trial ends</Row>
              </ul>
              <button
                onClick={onClose}
                className="w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 rounded-xl text-white font-bold transition-colors"
              >
                {variant === 'trial-expired' ? 'Close' : 'Continue on current plan'}
              </button>
            </div>

            <div className="p-6 bg-slate-950/40 border border-slate-700 rounded-2xl flex flex-col">
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-bold text-purple-200 font-cinzel">Amateur</h3>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-500/15 border border-purple-400/30 text-purple-200">
                  Upgrade Available
                </span>
              </div>
              <p className="text-slate-400 mt-2">For consistent rehearsal and show-building work.</p>
              <div className="mt-4">
                <div className="text-3xl font-bold text-white">{billingCycle === 'yearly' ? '$95.40' : '$9.95'}<span className="text-sm font-normal text-slate-400">/{billingCycle === 'yearly' ? 'yr' : 'mo'}</span></div>
                <div className="text-sm text-slate-400">Expanded monthly limits with saved workspaces and broader ongoing access</div>
              </div>
              <ul className="space-y-2 mt-5 mb-6 flex-1">
                <Row>Higher monthly AI and image limits</Row>
                <Row>Show Planner, Saved Ideas, and Search access</Row>
                <Row>Standard upgrade path from Free and Trial</Row>
              </ul>
              <button
                onClick={() => onUpgrade('amateur', billingCycle, founderRequested)}
                className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 rounded-xl text-white font-bold transition-colors"
              >
                {`Upgrade to Amateur ${billingCycle === 'yearly' ? 'Yearly' : 'Monthly'}${founderRequested && founderProtected ? ' (Founder)' : ''}`}
              </button>
            </div>

            <div className="p-6 bg-gradient-to-b from-amber-500/10 to-slate-950/40 border-2 border-amber-400/70 rounded-2xl flex flex-col">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-2xl font-bold text-amber-200 font-cinzel">Professional</h3>
                  <p className="text-slate-400 mt-2">Full performance and business operating system access.</p>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-400/40 text-amber-200 whitespace-nowrap">
                  {founderProtected ? 'Founder Protected' : 'Best for Pros'}
                </span>
              </div>
              <div className="mt-4">
                <div className="text-3xl font-bold text-white">{billingCycle === 'yearly' ? '$299.50' : '$29.95'}<span className="text-sm font-normal text-slate-400">/{billingCycle === 'yearly' ? 'yr' : 'mo'}</span></div>
                <div className="text-sm text-slate-400">
                  {founderProtected ? 'Locked founder rate preserved on reactivation' : 'Highest limits and full feature access'}
                </div>
              </div>
              <ul className="space-y-2 mt-5 mb-6 flex-1">
                <Row>Highest monthly AI and heavy-tool capacity</Row>
                <Row>Live Rehearsal, Video Analysis, and business tools</Row>
                <Row>Founder users keep protected pricing through billing changes</Row>
              </ul>
              <button
                onClick={() => onUpgrade('professional', billingCycle, founderRequested)}
                className="w-full py-3 px-4 bg-amber-500 hover:bg-amber-600 rounded-xl text-slate-900 font-extrabold transition-colors"
              >
                {founderRequested && founderProtected ? `Continue with founder ${billingCycle}` : `Upgrade to Professional ${billingCycle === 'yearly' ? 'Yearly' : 'Monthly'}`}
              </button>
            </div>
          </div>

          <div className="mt-6 text-center text-xs text-slate-500">
            Entitlements are the product truth. Stripe is the payment truth. Verified webhooks synchronize them.
          </div>
        </div>

        <div className="sticky bottom-0 z-20 border-t border-slate-800 bg-slate-900/95 backdrop-blur px-6 py-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors text-sm font-semibold">
              Close
            </button>
            <div className="grid grid-cols-1 sm:flex sm:flex-row gap-3 sm:justify-end sm:items-center w-full sm:w-auto">
              <button
                onClick={() => onUpgrade('professional', billingCycle, founderRequested)}
                className="order-1 sm:order-3 w-full sm:w-auto py-2.5 px-4 bg-amber-500/90 hover:bg-amber-500 rounded-xl text-slate-950 font-extrabold transition-colors"
              >
                {founderRequested && founderProtected ? `Continue with founder ${billingCycle}` : `Upgrade to Professional ${billingCycle === 'yearly' ? 'Yearly' : 'Monthly'}`}
              </button>
              <button
                onClick={() => onUpgrade('amateur', billingCycle, founderRequested)}
                className="order-2 sm:order-2 w-full sm:w-auto py-2.5 px-4 rounded-xl font-bold transition-colors border border-purple-400/40 text-purple-200 bg-slate-900/30 hover:bg-slate-800/60 sm:border-0 sm:text-white sm:bg-purple-700/80 sm:hover:bg-purple-700"
              >
                {`Upgrade to Amateur ${billingCycle === 'yearly' ? 'Yearly' : 'Monthly'}${founderRequested && founderProtected ? ' (Founder)' : ''}`}
              </button>
              {variant !== 'trial-expired' && (
                <button
                  onClick={onClose}
                  className="order-3 sm:order-1 w-full sm:w-auto py-2.5 px-4 bg-slate-800 hover:bg-slate-700 rounded-xl text-white font-bold transition-colors"
                >
                  Continue on current plan
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UpgradeModal;
