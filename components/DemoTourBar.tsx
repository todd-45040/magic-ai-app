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

  // Pre-launch email capture (Day 7)
  const [leadName, setLeadName] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [leadStatus, setLeadStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [leadMessage, setLeadMessage] = useState<string | null>(null);

  const recordMode = useMemo(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get('record') === '1';
    } catch {
      return false;
    }
  }, []);

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

  // Continue is enabled when:
  // - On current step AND step requirements met
  // - OR user is off-path (Continue snaps them back to the tour step)
  const canContinue = isOnCurrentStep ? canContinueFromCurrentStep() : true;

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

  const submitLead = async () => {
    const name = String(leadName || '').trim();
    const email = String(leadEmail || '').trim();
    if (!email) {
      setLeadStatus('error');
      setLeadMessage('Please enter an email address.');
      return;
    }
    // Basic email sanity check (server validates too)
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailOk) {
      setLeadStatus('error');
      setLeadMessage('Please enter a valid email address.');
      return;
    }

    setLeadStatus('submitting');
    setLeadMessage(null);

    try {
      const res = await fetch(`${getAppBasePath()}/api/waitlistSignup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name || null,
          email,
          source: 'demo_final_cta',
          meta: {
            recordMode,
            demoIndex: state?.index ?? null,
            demoTotal: state?.total ?? null,
          },
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        const msg = data?.message || 'Could not save your email. Please try again.';
        setLeadStatus('error');
        setLeadMessage(msg);
        return;
      }

      setLeadStatus('success');
      setLeadMessage(
        data?.already_subscribed
          ? 'You’re already on the list — we’ll keep you posted.'
          : 'Saved! We’ll notify you when Professional launches.',
      );
    } catch {
      setLeadStatus('error');
      setLeadMessage('Network error. Please try again.');
    }
  };

  return (
    <div className="mb-4">
      <div className={
        "rounded-2xl border border-amber-400/35 bg-gradient-to-r from-amber-500/15 via-purple-600/10 to-black/30 backdrop-blur shadow-lg " +
        (recordMode ? "px-5 py-4" : "px-4 py-3")
      }>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="inline-flex items-center rounded-full bg-amber-400/15 border border-amber-400/40 px-3 py-1 text-xs font-semibold tracking-widest text-amber-200">
              ✨ DEMO TOUR
            </div>
            <div className="min-w-0">
              <div className={"text-slate-200 font-semibold " + (recordMode ? "text-sm" : "text-xs")}>Step {state.index + 1} of {state.total}</div>
              <div className={"text-amber-200 font-bold leading-tight " + (recordMode ? "text-lg" : "text-base")}>
                {state.step.title}
              </div>
              <div className={"text-slate-300/80 " + (recordMode ? "text-sm" : "text-xs")}>
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
              title={isOnCurrentStep ? (state.step.continueLabel ?? 'Continue') : 'Return to the current demo step'}
            >
              {state.step.continueLabel ?? 'Continue'}
            </button>
          </div>
        </div>
      </div>
        {enabled && isOnCurrentStep && state.index === state.total - 1 && canContinueFromCurrentStep() && (
      <div className="mt-3 rounded-2xl border border-amber-400/30 bg-gradient-to-r from-black/40 via-amber-500/10 to-purple-700/10 px-4 py-4 shadow-lg">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-100">
              Ready to build your real show?
            </div>
            <div className="text-xs text-slate-300/80">
              You’ve experienced the system in demo mode. Now create your private workspace and start building performances that are truly yours.
            </div>
            <div className="text-xs text-slate-300/70 mt-1">
              The operating system for professional magicians — now in your hands.
            </div>

            <form
              className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center"
              onSubmit={(e) => {
                e.preventDefault();
                if (leadStatus !== 'success' && leadStatus !== 'submitting') submitLead();
              }}
            >
              <input
                type="text"
                placeholder="Name (optional)"
                value={leadName}
                onChange={(e) => setLeadName(e.target.value)}
                disabled={leadStatus === 'success' || leadStatus === 'submitting'}
                className="w-full sm:w-48 rounded-lg border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
              />
              <input
                type="email"
                placeholder="Email"
                value={leadEmail}
                onChange={(e) => setLeadEmail(e.target.value)}
                disabled={leadStatus === 'success' || leadStatus === 'submitting'}
                className="w-full sm:flex-1 rounded-lg border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
              />
              <button
                type="submit"
                disabled={leadStatus === 'success' || leadStatus === 'submitting'}
                className={
                  "text-xs font-semibold tracking-wide rounded-lg border px-3 py-2 transition " +
                  (leadStatus === 'success'
                    ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-100 cursor-default"
                    : leadStatus === 'submitting'
                      ? "border-slate-700/60 bg-slate-900/30 text-slate-400 cursor-wait"
                      : "border-slate-500/60 bg-slate-900/40 text-slate-200 hover:bg-slate-900/70 hover:border-slate-400/60")
                }
                title="Get notified when Professional launches"
              >
                {leadStatus === 'submitting' ? 'Saving…' : leadStatus === 'success' ? 'On the list ✓' : 'Notify me when Pro launches'}
              </button>
            </form>

            {leadMessage && (
              <div
                className={
                  "mt-2 text-xs " +
                  (leadStatus === 'error' ? "text-rose-200/90" : "text-emerald-200/90")
                }
              >
                {leadMessage}
              </div>
            )}

          </div>

          <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-end">
            <button
              type="button"
              className="text-xs font-semibold tracking-wide rounded-lg border border-amber-400/60 bg-amber-400/15 px-3 py-2 text-amber-100 hover:bg-amber-400/25 transition"
              onClick={handleStartTrial}
            >
              Start Your Free Trial
            </button>
            <button
              type="button"
              className="text-xs font-semibold tracking-wide rounded-lg border border-purple-400/60 bg-purple-500/15 px-3 py-2 text-purple-100 hover:bg-purple-500/25 transition"
              onClick={handleUnlockLive}
              title="Creates an account and locks in the founding professional rate"
            >
              Lock Founding Professional Rate — $29.95/mo
            </button>
          </div>
        </div>
      </div>
    )}
    </div>

  );
};

export default DemoTourBar;
