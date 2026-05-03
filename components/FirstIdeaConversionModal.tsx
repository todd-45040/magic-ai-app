import React from 'react';
import type { User } from '../types';
import { getMembershipDaysRemaining, isActiveTrialUser } from '../services/membershipService';
import { getPartnerTrialBadgeLabel, isPartnerTrialUser } from '../services/trialMessaging';

interface Props {
  user: User | null;
  onClose: () => void;
  onViewIdeas: () => void;
  onUpgrade: () => void;
}

export default function FirstIdeaConversionModal({ user, onClose, onViewIdeas, onUpgrade }: Props) {
  const daysRemaining = getMembershipDaysRemaining(user);
  const activePartnerTrial = Boolean(user && isPartnerTrialUser(user) && isActiveTrialUser(user));
  const badge = activePartnerTrial ? getPartnerTrialBadgeLabel(user) : 'First Win';

  return (
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-3xl border border-purple-400/30 bg-slate-900 p-6 shadow-2xl shadow-purple-950/40"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 inline-flex rounded-full border border-purple-300/25 bg-purple-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-purple-100">
          {badge}
        </div>
        <h2 className="font-cinzel text-2xl font-bold text-white">You just started building your magic system.</h2>
        <p className="mt-3 text-slate-300">
          That saved idea is now part of your working act library. The strongest conversion moment is ownership: keep developing it, rehearse it, and connect it to your next show.
        </p>
        <div className="mt-5 rounded-2xl border border-slate-700 bg-slate-950/45 p-4">
          <div className="text-sm font-semibold text-white">What to do next</div>
          <ol className="mt-3 space-y-2 text-sm text-slate-300">
            <li>1. Open Saved Ideas and give this item a performance-ready title.</li>
            <li>2. Send it into Effect Engine or Patter Engine for the next draft.</li>
            <li>3. Rehearse the best version before the trial window closes.</li>
          </ol>
        </div>
        {activePartnerTrial && (
          <div className="mt-4 rounded-2xl border border-amber-300/25 bg-amber-500/10 p-4 text-sm text-amber-100">
            {daysRemaining === 1
              ? 'Your Professional Trial has 1 day left. Keep this workflow active by choosing a paid plan.'
              : `Your Professional Trial has ${daysRemaining ?? 'limited'} days left. Keep this workflow active by choosing a paid plan before the trial ends.`}
          </div>
        )}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
          >
            Continue working
          </button>
          <button
            type="button"
            onClick={onViewIdeas}
            className="rounded-xl bg-purple-600 px-4 py-2 text-sm font-bold text-white hover:bg-purple-500"
          >
            View Saved Ideas
          </button>
          <button
            type="button"
            onClick={onUpgrade}
            className="rounded-xl bg-amber-400 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-amber-300"
          >
            Keep full access
          </button>
        </div>
      </div>
    </div>
  );
}
