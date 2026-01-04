import React from 'react';
import { CheckIcon, WandIcon, ShieldIcon } from './icons';

interface UpgradeModalProps {
  onClose: () => void;
  onUpgrade: (tier: 'performer' | 'professional') => void;
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
      : 'Upgrade Your Membership';

  const subtitle =
    variant === 'trial-expired'
      ? 'Choose a plan to keep using Magic AI Wizard.'
      : 'Choose the plan that matches how often you create, rehearse, and perform.';

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-4xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl shadow-purple-900/40"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-8 text-center border-b border-slate-800">
          <WandIcon className="w-14 h-14 mx-auto mb-3 text-amber-300" />
          <h2 className="font-cinzel text-3xl font-bold text-white">{title}</h2>
          <p className="text-slate-300 mt-2">{subtitle}</p>
          <div className="mt-4 inline-flex items-center gap-2 text-xs text-slate-400 bg-slate-800/60 border border-slate-700 rounded-full px-3 py-1">
            <ShieldIcon className="w-4 h-4 text-emerald-300" />
            <span>Secure payments • Cancel anytime • Ethical AI</span>
          </div>
        </div>

        <div className="p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Performer */}
            <div className="p-6 bg-slate-950/40 border border-slate-700 rounded-2xl flex flex-col">
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-bold text-purple-200 font-cinzel">Performer</h3>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-500/15 border border-purple-400/30 text-purple-200">
                  Most Popular
                </span>
              </div>

              <p className="text-slate-400 mt-2">Designed for regular practice and show preparation.</p>

              <div className="mt-4">
                <div className="text-3xl font-bold text-white">$19.95<span className="text-sm font-normal text-slate-400">/mo</span></div>
                <div className="text-sm text-slate-400">$199/year (2 months free)</div>
              </div>

              <ul className="space-y-2 mt-5 mb-6 flex-1">
                <Row>Generous daily AI usage for scripts, ideas, and planning</Row>
                <Row>Live rehearsal support (30 min/day)</Row>
                <Row>Video rehearsal analysis (20 uploads/day)</Row>
                <Row>Visual Brainstorm Studio (25 images/day)</Row>
              </ul>

              <button
                onClick={() => onUpgrade('performer')}
                className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 rounded-xl text-white font-bold transition-colors"
              >
                Upgrade to Performer
              </button>
            </div>

            {/* Professional */}
            <div className="p-6 bg-slate-950/40 border-2 border-amber-400/70 rounded-2xl flex flex-col">
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-bold text-amber-200 font-cinzel">Professional</h3>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-400/40 text-amber-200">
                  Best for Pros
                </span>
              </div>

              <p className="text-slate-400 mt-2">Business-grade tools for working performers.</p>

              <div className="mt-4">
                <div className="text-3xl font-bold text-white">$29.95<span className="text-sm font-normal text-slate-400">/mo</span></div>
                <div className="text-sm text-slate-400">$299/year (2 months free)</div>
              </div>

              <ul className="space-y-2 mt-5 mb-6 flex-1">
                <Row>Everything in Performer</Row>
                <Row>Unlimited text AI within fair use</Row>
                <Row>More rehearsal capacity (120 min/day)</Row>
                <Row>Higher image cap (100 images/day)</Row>
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

          <button
            onClick={onClose}
            className="w-full mt-5 py-2.5 px-4 text-slate-400 hover:text-white transition-colors"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
};

export default UpgradeModal;
