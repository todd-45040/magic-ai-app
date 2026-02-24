import React, { useEffect, useMemo, useState } from 'react';
import {
  advanceDemoStep,
  canContinueFromCurrentStep,
  getCurrentDemoStep,
  getCurrentDemoView,
  isDemoTourActive,
  resetDemoTourProgress,
  setDemoStepIndex,
  exitDemoModeHard,
} from '../services/demoTourService';

function getAppBasePath(): string {
  try {
    return window.location.pathname.startsWith('/app') ? '/app' : '';
  } catch {
    return '';
  }
}

type Props = {
  activeView: string;
  onNavigate: (view: any) => void;
};

const DemoTourBar: React.FC<Props> = ({ activeView, onNavigate }) => {
  const [enabled, setEnabled] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setEnabled(isDemoTourActive());
  }, []);

  // Re-render when localStorage-driven progress changes
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => setTick(t => (t + 1) % 100000), 500);
    return () => window.clearInterval(id);
  }, [enabled]);

  const state = useMemo(() => getCurrentDemoStep(), [tick]);
  const currentView = useMemo(() => getCurrentDemoView(), [tick]);
  const isOnCurrentStep = enabled && currentView === activeView;

  if (!enabled) return null;

  const canContinue = isOnCurrentStep && canContinueFromCurrentStep();

  const handleContinue = () => {
    if (!isOnCurrentStep) {
      // If user is off-path, snap back to the current tour step.
      if (currentView) onNavigate(currentView as any);
      return;
    }

    if (!canContinueFromCurrentStep()) {
      window.alert('Demo Tour: complete the current step first (run the Effect Engine demo once).');
      return;
    }

    const scenario = state.scenario;
    const nextIndex = Math.min(state.index + 1, scenario.steps.length - 1);

    // If already at the last step, we just inform.
    if (state.index >= scenario.steps.length - 1) {
      window.alert('Demo Tour complete! Scroll down for next steps.');
      return;
    }

    advanceDemoStep();
    const nextView = scenario.steps[nextIndex]?.view;
    if (nextView) onNavigate(nextView as any);
  };

  const handleRestart = () => {
    resetDemoTourProgress();
    setDemoStepIndex(0);
    const first = state.scenario.steps[0]?.view;
    if (first) onNavigate(first as any);
  };

  const goToSignup = (intent: 'trial' | 'live') => {
    // Leave demo mode and route to Auth screen (signup tab preselected).
    exitDemoModeHard();
    const base = getAppBasePath();
    const params = new URLSearchParams();
    params.set('mode', 'auth');
    params.set('auth', 'signup');
    if (intent === 'live') params.set('intent', 'live');
    window.location.href = `${window.location.origin}${base}/?${params.toString()}`;
  };

  const handleStartTrial = () => goToSignup('trial');
  const handleUnlockLive = () => goToSignup('live');

  return (
    <div className="mb-4">
      <div className="rounded-2xl border border-amber-400/35 bg-gradient-to-r from-amber-500/15 via-purple-600/10 to-black/30 backdrop-blur px-4 py-3 shadow-lg">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="inline-flex items-center rounded-full bg-amber-400/15 border border-amber-400/40 px-3 py-1 text-xs font-semibold tracking-widest text-amber-200">
              ✨ DEMO TOUR
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-200">
                Step {state.index + 1} of {state.total}: <span className="text-amber-200">{state.step.title}</span>
              </div>
              <div className="text-xs text-slate-300/80">
                {state.step.description ?? state.scenario.description}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              className="text-xs font-semibold tracking-wide rounded-lg border border-slate-600/60 bg-slate-900/40 px-3 py-2 text-slate-200 hover:bg-slate-900/70 hover:border-slate-400/60 transition"
              onClick={handleRestart}
              title="Restart the guided demo tour"
            >
              Restart
            </button>

            <button
              type="button"
              disabled={!canContinue}
              className={
                "text-xs font-semibold tracking-wide rounded-lg px-3 py-2 transition border " +
                (canContinue
                  ? "border-amber-400/60 bg-amber-400/15 text-amber-100 hover:bg-amber-400/25"
                  : "border-slate-700/60 bg-slate-900/30 text-slate-400 cursor-not-allowed")
              }
              onClick={handleContinue}
              title={isOnCurrentStep ? state.step.continueLabel ?? 'Continue' : 'Return to current demo step'}
            >
              {isOnCurrentStep ? (state.step.continueLabel ?? 'Continue') : 'Go to current step'}
            </button>
          </div>
        </div>
      </div>
        {enabled && isOnCurrentStep && state.index === state.total - 1 && canContinueFromCurrentStep() && (
      <div className="mt-3 rounded-2xl border border-amber-400/30 bg-gradient-to-r from-black/40 via-amber-500/10 to-purple-700/10 px-4 py-4 shadow-lg">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-100">
              Ready to build your own?
            </div>
            <div className="text-xs text-slate-300/80">
              Start a free trial to save your work, unlock full generation limits, and access Live tools.
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-end">
            <button
              type="button"
              className="text-xs font-semibold tracking-wide rounded-lg border border-amber-400/60 bg-amber-400/15 px-3 py-2 text-amber-100 hover:bg-amber-400/25 transition"
              onClick={handleStartTrial}
            >
              Start Free Trial
            </button>
            <button
              type="button"
              className="text-xs font-semibold tracking-wide rounded-lg border border-purple-400/60 bg-purple-500/15 px-3 py-2 text-purple-100 hover:bg-purple-500/25 transition"
              onClick={handleUnlockLive}
              title="Creates an account and unlocks Live Rehearsal features"
            >
              Unlock Live Mode
            </button>
          </div>
        </div>
      </div>
    )}
    </div>

  );
};

export default DemoTourBar;
