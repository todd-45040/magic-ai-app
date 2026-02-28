import React from 'react';
import type { Mode, User } from '../types';

type Props = {
  mode: Mode;
  user: User | null;
  onGoMainMenu: () => void;
  onGoDashboard: () => void;
};

export default function PersistentHeader({ mode, user, onGoMainMenu, onGoDashboard }: Props) {
  if (mode === 'selection' || mode === 'auth' || mode === 'live-feedback') return null;

  return (
    <header className="sticky top-0 z-20 w-full">
      <div className="backdrop-blur-md bg-black/50 border-b border-yellow-500/20">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={onGoMainMenu}
              className="px-3 py-2 rounded-lg bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-300 hover:text-yellow-200 transition-colors border border-yellow-500/20"
              aria-label="Return to main menu"
            >
              Main Menu
            </button>

            <button
              onClick={onGoDashboard}
              disabled={!user}
              className={
                user
                  ? "px-3 py-2 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-200 transition-colors border border-purple-400/20"
                  : "px-3 py-2 rounded-lg bg-slate-800/40 text-slate-500 border border-slate-700/40 cursor-not-allowed"
              }
              aria-label="Return to dashboard"
            >
              Dashboard
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-300/70 truncate max-w-[520px]">
            {user?.foundingCircleMember ? (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-amber-400/25 bg-amber-500/10 text-amber-200 font-semibold">
                <span className="text-[11px]">★</span>
                Founder
              </span>
            ) : null}
            <div className="truncate">
              {user?.email ? `Signed in as ${user.email}` : ''}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
