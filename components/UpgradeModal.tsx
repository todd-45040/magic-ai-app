import React from 'react';
import { CheckIcon, WandIcon, ShieldIcon } from './icons';

interface UpgradeModalProps {
  onClose: () => void;
  onUpgrade: (tier: 'amateur' | 'professional') => void;
  variant?: 'locked-tool' | 'trial-expired' | 'generic';
}

const Row: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <li className="flex items-start gap-3">
    <CheckIcon className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
    <span className="text-slate-200">{children}</span>
  </li>
);

const UpgradeModal: React.FC<UpgradeModalProps> = ({ onClose, onUpgrade, variant = 'generic' }) => {
  const title =
    variant === 'trial-expired'
      ? 'Your trial has ended'
      : variant === 'locked-tool'
      ? 'Upgrade to unlock this tool'
      : 'Choose Your Access Level';

  const subtitle =
    variant === 'trial-expired'
      ? 'Choose an access level to keep using the operating system for professional magicians.'
      : 'Choose your access level. Write. Rehearse. Book. Perform — in one unified workspace.';

  return (
    <div
      // Allow scrolling when modal content exceeds viewport height (common on laptops/mobile)
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 sm:p-6 overflow-y-auto z-50 animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        // Constrain height and enable internal scroll so the pricing grid remains usable
        className="w-full max-w-4xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl shadow-purple-900/40 max-h-[calc(100vh-3rem)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-20 p-6 sm:p-8 text-center border-b border-slate-800 bg-slate-900/95 backdrop-blur">
          <WandIcon className="w-14 h-14 mx-auto mb-3 text-amber-300" />
          <h2 className="font-cinzel text-3xl font-bold text-white">{title}</h2>
          <p className="text-slate-300 mt-2">{subtitle}</p>
          <div className="mt-4 inline-flex items-center gap-2 text-xs text-slate-400 bg-slate-800/60 border border-slate-700 rounded-full px-3 py-1">
            <ShieldIcon className="w-4 h-4 text-emerald-300" />
            <span>Secure payments • Cancel anytime • Ethical AI</span>
          </div>
        </div>

        <div className="p-8 pb-28">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Free Trial (informational) */}
            <div className="p-6 bg-slate-950/30 border border-slate-800 rounded-2xl flex flex-col">
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-bold text-slate-100 font-cinzel">Free Trial</h3>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-800/70 border border-slate-700 text-slate-200">
                  Start Here
                </span>
              </div>

              <p className="text-slate-400 mt-2">Experience the operating system — without commitment.</p>

              <div className="mt-4">
                <div className="text-3xl font-bold text-white">$0</div>
                <div className="text-sm text-slate-400">No credit card required</div>
              </div>

              <ul className="space-y-2 mt-5 mb-6 flex-1">
                <Row>Up to <span className="font-semibold">10</span> saved ideas</Row>
                <Row><span className="font-semibold">10 minutes</span> of rehearsal coaching</Row>
                <Row><span className="font-semibold">1</span> active show in Show Planner</Row>
                <Row>Full Demo Mode access</Row>
              </ul>

              <button
                onClick={onClose}
                className="w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 rounded-xl text-white font-bold transition-colors"
              >
                Continue Free Trial
              </button>
            </div>

            {/* Amateur (Creative Tier) */}
            <div className="p-6 bg-slate-950/40 border border-slate-700 rounded-2xl flex flex-col">
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-bold text-purple-200 font-cinzel">Amateur</h3>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-500/15 border border-purple-400/30 text-purple-200">
                  Most Popular
                </span>
              </div>

              <p className="text-slate-400 mt-2">For consistent practice and show prep.</p>

              <div className="mt-4">
                <div className="text-3xl font-bold text-white">$15.95<span className="text-sm font-normal text-slate-400">/mo</span></div>
                <div className="text-sm text-slate-400">Annual billing coming soon</div>
              </div>

              <ul className="space-y-2 mt-5 mb-6 flex-1">
                <Row>Save unlimited ideas & drafts</Row>
                <Row>Live rehearsal coaching</Row>
                <Row>Video rehearsal analysis</Row>
                <Row>Visual Brainstorm Studio</Row>
              </ul>

              <button
                onClick={() => onUpgrade('amateur')}
                className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 rounded-xl text-white font-bold transition-colors"
              >
                Upgrade to Amateur
              </button>
            </div>

            {/* Professional */}
            <div className="p-6 bg-gradient-to-b from-amber-500/10 to-slate-950/40 border-2 border-amber-400/70 rounded-2xl flex flex-col">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-2xl font-bold text-amber-200 font-cinzel">Professional</h3>
                  <p className="text-slate-400 mt-2">Business-grade tools for working performers.</p>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-400/40 text-amber-200 whitespace-nowrap">
                  Best for Pros
                </span>
              </div>

              <div className="mt-4">
                <div className="text-3xl font-bold text-white">$29.95<span className="text-sm font-normal text-slate-400">/mo</span></div>
                <div className="text-sm text-slate-400">$299/year (2 months free)</div>

                {/* Founding member callout (visually separated) */}
                <div className="mt-4 rounded-xl border border-amber-300/40 bg-amber-500/10 px-4 py-3">
                  <div className="text-xs uppercase tracking-wider text-amber-200/90 font-semibold">Founding Professional Rate</div>
                  <div className="mt-1 text-sm text-amber-100">
                    <span className="font-extrabold">$29.95/month</span> — locked for life (pre-launch).
                  </div>
                  <div className="mt-1 text-xs text-slate-300/90">Available to early adopters before public launch.</div>
                </div>
              </div>

              <ul className="space-y-2 mt-5 mb-6 flex-1">
                <Row>Unlimited ideas, scripts, and show assets</Row>
                <Row>Full rehearsal suite (audio + video + diagnostics)</Row>
                <Row>CRM + client performance history</Row>
                <Row>Contracts + invoicing-ready docs</Row>
                <Row>Finance tracking for every gig</Row>
                <Row>Audience feedback analytics</Row>
              </ul>

              <button
                onClick={() => onUpgrade('professional')}
                className="w-full py-3 px-4 bg-amber-500 hover:bg-amber-600 rounded-xl text-slate-900 font-extrabold transition-colors"
              >
                Upgrade to Professional
              </button>
            </div>
          </div>

          <div className="mt-6 text-center text-xs text-slate-500">
            Your material is not shared. Audience tools never reveal methods. AI assistance follows ethical magic guidelines.
          </div>
        </div>

<div className="sticky bottom-0 z-20 border-t border-slate-800 bg-slate-900/95 backdrop-blur px-6 py-4">
  <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
    <button
      onClick={onClose}
      className="text-slate-400 hover:text-white transition-colors text-sm font-semibold"
    >
      Close
    </button>

    {/*
      Mobile-friendly CTA layout:
      - Professional is primary and full-width on mobile
      - Amateur is secondary on mobile
      - Desktop keeps a standard right-aligned row
    */}
    <div className="grid grid-cols-1 sm:flex sm:flex-row gap-3 sm:justify-end sm:items-center w-full sm:w-auto">
      <button
        onClick={() => onUpgrade('professional')}
        className="order-1 sm:order-3 w-full sm:w-auto py-2.5 px-4 bg-amber-500/90 hover:bg-amber-500 rounded-xl text-slate-950 font-extrabold transition-colors"
      >
        Upgrade to Professional
      </button>

      <button
        onClick={() => onUpgrade('amateur')}
        className="order-2 sm:order-2 w-full sm:w-auto py-2.5 px-4 rounded-xl font-bold transition-colors border border-purple-400/40 text-purple-200 bg-slate-900/30 hover:bg-slate-800/60 sm:border-0 sm:text-white sm:bg-purple-700/80 sm:hover:bg-purple-700"
      >
        Upgrade to Amateur
      </button>

      {variant !== 'trial-expired' && (
        <button
          onClick={onClose}
          className="order-3 sm:order-1 w-full sm:w-auto py-2.5 px-4 bg-slate-800 hover:bg-slate-700 rounded-xl text-white font-bold transition-colors"
        >
          Continue Free Trial
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
