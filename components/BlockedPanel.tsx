import React from 'react';
import type { BlockedUx } from '../services/blockedUx';
import { LockIcon, WandIcon, ShuffleIcon } from './icons';

type Props = {
  ui?: BlockedUx;
  blocked?: BlockedUx;
  onUpgrade?: () => void;
  onTryAgain?: () => void;
  onRetry?: () => void;
  onDismiss?: () => void;
};

const BlockedPanel: React.FC<Props> = ({ ui, blocked, onUpgrade, onTryAgain, onRetry, onDismiss }) => {
  const panelUi = ui ?? blocked;
  if (!panelUi?.blocked) return null;

  return (
    <div className="maw-card p-5">
      <div className="flex items-start gap-3">
        <div className="mt-1 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800/80 border border-slate-700">
          {panelUi.showUpgrade ? (
            <LockIcon className="h-5 w-5 text-amber-300" />
          ) : (
            <WandIcon className="h-5 w-5 text-purple-300" />
          )}
        </div>

        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-slate-100 font-semibold">{panelUi.title}</div>
            {panelUi.badge ? (
              <span className="inline-flex items-center rounded-full border border-amber-300/25 bg-amber-400/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-200">
                {panelUi.badge}
              </span>
            ) : null}
            {panelUi.currentPlanLabel ? (
              <span className="inline-flex items-center rounded-full border border-slate-600 bg-slate-800/80 px-2.5 py-0.5 text-[11px] font-semibold text-slate-200">
                Current plan: {panelUi.currentPlanLabel}
              </span>
            ) : null}
            {panelUi.founderProtected ? (
              <span className="inline-flex items-center rounded-full border border-amber-300/25 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-100">
                Founder protected
              </span>
            ) : null}
          </div>
          <div className="mt-1 text-slate-300 text-sm leading-relaxed">{panelUi.message}</div>

          <div className="mt-4 flex flex-wrap gap-2">
            {panelUi.showUpgrade && onUpgrade ? (
              <button
                onClick={onUpgrade}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-500/90 hover:bg-amber-500 px-4 py-2 text-slate-950 font-semibold transition"
              >
                <LockIcon className="h-4 w-4" />
                {panelUi.upgradeLabel || 'Upgrade'}
              </button>
            ) : null}

            {panelUi.showTryAgain && (onTryAgain || onRetry) ? (
              <button
                onClick={onTryAgain || onRetry}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 px-4 py-2 text-slate-100 font-semibold transition"
              >
                <ShuffleIcon className="h-4 w-4" />
                Try again
              </button>
            ) : null}

            {onDismiss ? (
              <button
                onClick={onDismiss}
                className="ml-auto text-slate-400 hover:text-slate-200 text-sm"
              >
                Dismiss
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BlockedPanel;
