import React, { useEffect, useState } from 'react';
import { disableDemoMode, isDemoMode } from '../src/demo/demoEngine';

/**
 * Phase 1: Simple visual indicator when Demo Mode is active.
 * No interception of AI calls yet.
 */
const DemoBanner: React.FC = () => {
  const [active, setActive] = useState(false);

  useEffect(() => {
    setActive(isDemoMode());
  }, []);

  if (!active) return null;

  return (
    <div className="sticky top-0 z-50 w-full">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8 pt-3">
        <div className="rounded-xl border border-amber-400/30 bg-black/40 backdrop-blur px-4 py-3 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center rounded-full bg-amber-400/15 border border-amber-400/30 px-3 py-1 text-xs font-semibold tracking-widest text-amber-200">
              ✨ DEMO MODE
            </span>
            <div className="text-sm text-slate-200">
              Guided Showcase is active (seeded data, safe sandbox).{' '}
              <span className="text-slate-400">Great for recording onboarding examples.</span>
            </div>
          </div>

          <button
            type="button"
            className="text-xs font-semibold tracking-wide rounded-lg border border-slate-600/60 bg-slate-900/40 px-3 py-2 text-slate-200 hover:bg-slate-900/70 hover:border-slate-400/60 transition"
            onClick={() => {
              disableDemoMode();
              try {
                const url = new URL(window.location.href);
                url.searchParams.delete('demo');
                window.location.href = url.toString();
              } catch {
                window.location.reload();
              }
            }}
            aria-label="Exit Demo Mode"
            title="Exit Demo Mode"
          >
            Exit Demo
          </button>
        </div>
      </div>
    </div>
  );
};

export default DemoBanner;
