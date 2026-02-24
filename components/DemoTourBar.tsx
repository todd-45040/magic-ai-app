import React, { useEffect, useMemo, useState } from 'react';
import {
  advanceDemoStep,
  canContinueFromCurrentStep,
  getCurrentDemoStep,
  getCurrentDemoView,
  isDemoTourActive,
  resetDemoTourProgress,
  setDemoStepIndex,
} from '../services/demoTourService';

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
      window.alert('Demo Tour complete! You can restart the tour from Step 1 any time.');
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
    </div>
  );
};

export default DemoTourBar;
