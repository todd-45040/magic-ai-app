import React from 'react';
import type { BlockedUx } from '../services/blockedUx';
import { LockIcon, WandIcon, ShuffleIcon } from './icons';

type Props = {
  ui: BlockedUx;
  onUpgrade?: () => void;
  onTryAgain?: () => void;
  onDismiss?: () => void;
};

const BlockedPanel: React.FC<Props> = ({ ui, onUpgrade, onTryAgain, onDismiss }) => {
  if (!ui?.blocked) return null;

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900/40 p-5 shadow-lg">
      <div className="flex items-start gap-3">
        <div className="mt-1 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800/80 border border-slate-700">
          {ui.showUpgrade ? (
            <LockIcon className="h-5 w-5 text-amber-300" />
          ) : (
            <WandIcon className="h-5 w-5 text-purple-300" />
          )}
        </div>

        <div className="flex-1">
          <div className="text-slate-100 font-semibold">{ui.title}</div>
          <div className="mt-1 text-slate-300 text-sm leading-relaxed">{ui.message}</div>

          <div className="mt-4 flex flex-wrap gap-2">
            {ui.showUpgrade && onUpgrade ? (
              <button
                onClick={onUpgrade}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-500/90 hover:bg-amber-500 px-4 py-2 text-slate-950 font-semibold transition"
              >
                <LockIcon className="h-4 w-4" />
                Upgrade
              </button>
            ) : null}

            {ui.showTryAgain && onTryAgain ? (
              <button
                onClick={onTryAgain}
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
