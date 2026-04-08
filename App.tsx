import React, { useEffect, useRef, useState } from 'react';
import { supabase, isSupabaseConfigValid } from './supabase';
import type { Mode, User } from './types';
import {
  registerOrUpdateUser,
  checkAndUpdateUserTrialStatus,
  updateUserMembership,
  getUserProfile,
  reconcileFoundingLead,
} from './services/usersService';
import { ADMIN_EMAIL, APP_VERSION } from './constants';
import { useAppDispatch, refreshAllData } from './store';
import ModeSelector from './components/ModeSelector';
import Auth from './components/Auth';
import AudienceMode from './components/AudienceMode';
import MagicianMode from './components/MagicianMode';
import About from './components/About';
import DisclaimerModal from './components/DisclaimerModal';
import LiveFeedbackView from './components/LiveFeedbackView';
import PublicFeedbackForm from './components/PublicFeedbackForm';
import AppSuggestionModal from './components/AppSuggestionModal';
import DemoBanner from './components/DemoBanner';
import FoundingCirclePage from './components/FoundingCirclePage';
import FounderSuccessPage from './components/FounderSuccessPage';
import { isDemoEnabled, enableDemo, seedDemoData } from './services/demoSeedService';
import { createCheckoutSession, fetchBillingStatus, resolveCheckoutLookupKey } from './services/billingClient';

const DISCLAIMER_ACKNOWLEDGED_KEY = 'magician_ai_disclaimer_acknowledged';

// Cast modal components to `any` so footer link wiring can't break the build
// if the modal prop types evolve.
const DisclaimerModalAny = DisclaimerModal as any;
const AppSuggestionModalAny = AppSuggestionModal as any;

function App() {
  const [mode, setMode] = useState<Mode>('selection');
  const [user, setUser] = useState<User | null>(null);
  const [isDisclaimerOpen, setIsDisclaimerOpen] = useState(false);
  const [isSuggestionModalOpen, setIsSuggestionModalOpen] = useState(false);
  const [livePerformanceId, setLivePerformanceId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const dispatch = useAppDispatch();
  const loggingOutRef = useRef(false);
  const checkoutSyncRef = useRef<string | null>(null);

  const handleUpgrade = async (selection: any, options?: any) => {
    try {
      const normalized = typeof selection === 'string' ? { tier: selection, billingCycle: options?.billingCycle || 'monthly', founderRequested: Boolean(options?.founderRequested) } : { tier: selection?.tier, billingCycle: selection?.billingCycle || 'monthly', founderRequested: Boolean(selection?.founderRequested) };
      const billingStatus = await fetchBillingStatus();
      const lookupKey = resolveCheckoutLookupKey(normalized, billingStatus);
      const result = await createCheckoutSession(lookupKey);

      if (result?.url) {
        window.location.href = String(result.url);
        return;
      }

      if (result?.cycleSwitchApplied) {
        alert(result?.message || 'Billing cycle updated successfully.');
        window.location.reload();
        return;
      }

      alert(result?.message || (result?.stripeConfigured ? 'Upgrade session is not ready yet.' : 'Stripe is not configured yet.'));
    } catch (e: any) {
      alert(e?.message || 'Upgrade could not start. Please try again.');
      console.error(e);
    }
  };

  useEffect(() => {
    const loadingTimeout = window.setTimeout(() => {
      setAuthLoading(false);
    }, 5000);

    const urlParams = new URLSearchParams(window.location.search);
    const modeParam = urlParams.get('mode');
    const perfId = urlParams.get('performanceId');
    const showIdParam = urlParams.get('showId');
    const tokenParam = urlParams.get('token');
    const recordParam = urlParams.get('record') === '1';
    const isAuthCallbackFlow = modeParam === 'auth-callback' || Boolean(urlParams.get('code'));

    const getAppBasePath = () => {
      try {
        return window.location.pathname.startsWith('/app') ? '/app' : '';
      } catch {
        return '';
      }
    };

    const cleanupAuthCallbackUrl = () => {
      try {
        const base = getAppBasePath();
        const cleanPath = `${base}/`;
        window.history.replaceState({}, document.title, cleanPath);
      } catch {}
    };

    const routeAuthCallbackToHome = () => {
      try {
        localStorage.setItem('magician_active_view', 'home');
      } catch {}

      try {
        const base = getAppBasePath();
        const cleanPath = `${base}/`;
        window.history.replaceState({}, document.title, cleanPath);
      } catch {}
    };

    const exchangeAuthCodeIfPresent = async () => {
      try {
        const currentUrl = new URL(window.location.href);
        const hasCode = Boolean(currentUrl.searchParams.get('code'));
        if (!hasCode) return;
        await supabase.auth.exchangeCodeForSession(window.location.href);
        routeAuthCallbackToHome();
      } catch (error) {
        console.error('Auth code exchange failed:', error);
      }
    };

    const demoEnabled = (() => {
      try {
        return isDemoEnabled();
      } catch {
        return false;
      }
    })();

    if (demoEnabled) {
      // Optional recording-friendly mode (Demo only): slightly larger type + spacing.
      try {
        if (recordParam) document.documentElement.classList.add('maw-record');
        else document.documentElement.classList.remove('maw-record');
      } catch {}

      try {
        enableDemo();
        seedDemoData();
      } catch {}

      setUser({
        email: 'demo@magicaiwizard.com',
        membership: 'professional',
        isAdmin: false,
        generationCount: 0,
        lastResetDate: new Date().toISOString(),
      } as any);

      refreshAllData(dispatch);
      setMode('magician');
      setAuthLoading(false);
      window.clearTimeout(loadingTimeout);
      return;
    }

    // Public landing routes (no login required)
    // NOTE: Demo Mode must take precedence above, otherwise a URL like
    // /app/founding-circle?demo=1 would never enter Demo Mode.
    try {
      const p = window.location.pathname || '';
      if (p.endsWith('/founding-circle')) {
        setMode('founding-circle');
        setAuthLoading(false);
        window.clearTimeout(loadingTimeout);
        return;
      }

      // Post-checkout founder success route.
      // This page guides activation BEFORE any email sequence begins.
      if (p.endsWith('/founder-success')) {
        setMode('founder-success');
        // Do not early-return: allow auth hydration to run so we can confirm Founder status.
      }
    } catch {}

    // Ensure recording class is not left on in normal mode.
    try { document.documentElement.classList.remove('maw-record'); } catch {}

    if (modeParam === 'live-feedback' && perfId) {
      setLivePerformanceId(perfId);
      setMode('live-feedback');
      setAuthLoading(false);
      window.clearTimeout(loadingTimeout);
      return;
    }

    // Public, no-login audience feedback via QR code
    if (modeParam === 'audience-feedback' && showIdParam && tokenParam) {
      setMode('audience-feedback');
      setAuthLoading(false);
      window.clearTimeout(loadingTimeout);
      return;
    }

    if (modeParam === 'auth') {
      setMode('auth');
      setAuthLoading(false);
      window.clearTimeout(loadingTimeout);
      return;
    }

    if (modeParam === 'auth-callback') {
      setMode('auth');
    }

    if (!isSupabaseConfigValid) {
      setAuthLoading(false);
      window.clearTimeout(loadingTimeout);
      return;
    }

    const applySessionToState = async (session: any) => {
      if (loggingOutRef.current) return;

      try {
        const sbUser = session?.user ?? null;

        if (sbUser?.email) {
          // Phase 2: Founding lead reconciliation (signed-out join → later signup).
          // If this flips anything, we'll re-fetch the profile so the badge/pricing lock shows immediately.
          let reconciled = false;
          try {
            const token = String(session?.access_token || '').trim();
            if (token) reconciled = await reconcileFoundingLead(token);
          } catch {
            reconciled = false;
          }

          const metadata = (sbUser as any)?.user_metadata || {};
          const signupSource = String(metadata?.signup_source || '').trim().toLowerCase();
          const requestedTrialDaysRaw = Number(metadata?.requested_trial_days);
          const requestedTrialDays = Number.isFinite(requestedTrialDaysRaw) && requestedTrialDaysRaw > 0
            ? requestedTrialDaysRaw
            : 14;
          const initialTrialDays = signupSource === 'ibm' && requestedTrialDays === 30 ? 30 : 14;

          let appUser: User = {
            email: sbUser.email,
            membership: 'trial',
            isAdmin: sbUser.email === ADMIN_EMAIL,
            generationCount: 0,
            lastResetDate: new Date().toISOString(),
            trialEndDate: Date.now() + initialTrialDays * 24 * 60 * 60 * 1000,
            signupSource: signupSource || 'direct',
            requestedTrialDays: initialTrialDays,
          } as any;

          const profile = await getUserProfile(sbUser.id);
          const isNewProfile = !profile;
          if (profile) appUser = { ...appUser, ...profile };

          if (isNewProfile) {
            void logUserActivity({
              tool_name: 'system',
              event_type: 'signup',
              success: true,
              metadata: signupSource === 'ibm'
                ? { source: 'ibm', campaign: 'ibm-30day', requested_trial_days: initialTrialDays }
                : { source: signupSource || 'direct', requested_trial_days: initialTrialDays },
            });
          }

          // If reconciliation ran, the DB row may have just been upgraded.
          // Pull fresh state so the Founding badge + pricing lock show immediately.
          if (reconciled) {
            const refreshed = await getUserProfile(sbUser.id);
            if (refreshed) appUser = { ...appUser, ...refreshed };
          }

          await registerOrUpdateUser(appUser, sbUser.id);
          appUser = await checkAndUpdateUserTrialStatus(appUser, sbUser.id);

          setUser(appUser);
          refreshAllData(dispatch);

          if (isAuthCallbackFlow) {
            routeAuthCallbackToHome();
            setMode('magician');
          } else {
            setMode(prev =>
              prev === 'auth' || prev === 'selection' ? 'magician' : prev
            );
          }

          if (isAuthCallbackFlow) cleanupAuthCallbackUrl();
        } else {
          setUser(null);
          setMode(prev => (prev === 'magician' ? 'selection' : prev));
          if (isAuthCallbackFlow) cleanupAuthCallbackUrl();
        }
      } catch (error) {
        console.error('Auth sync error:', error);
        setUser(null);
        setMode('selection');
      } finally {
        setAuthLoading(false);
        window.clearTimeout(loadingTimeout);
      }
    };

    const initialHydrate = async () => {
      try {
        await exchangeAuthCodeIfPresent();
        const { data } = await supabase.auth.getSession();
        await applySessionToState(data?.session ?? null);
      } catch {
        setAuthLoading(false);
        window.clearTimeout(loadingTimeout);
      }
    };

    void initialHydrate();

    // Keep the UI in sync with auth changes (sign-in / sign-out) without requiring a hard refresh.
    // Without this, a successful login can leave the user stuck on the Auth screen until reload.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void applySessionToState(session);
    });

    return () => {
      subscription?.unsubscribe();
      window.clearTimeout(loadingTimeout);
    };
  }, [dispatch]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkoutState = String(params.get('checkout') || '').trim();
    const sessionId = String(params.get('session_id') || '').trim();
    if (!user?.email || checkoutState !== 'success' || !sessionId) return;
    if (checkoutSyncRef.current === sessionId) return;
    checkoutSyncRef.current = sessionId;

    const run = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (!token) return;

        const response = await fetch('/api/billing/confirm-checkout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ sessionId }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(String(payload?.error || 'Checkout confirmation sync failed.'));

        const { data: refreshedSession } = await supabase.auth.getSession();
        const sbUser = refreshedSession?.session?.user;
        if (sbUser?.id) {
          const refreshed = await getUserProfile(sbUser.id);
          if (refreshed) setUser(refreshed as any);
        }
        await refreshAllData(dispatch);

        params.delete('checkout');
        params.delete('session_id');
        const nextQuery = params.toString();
        const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash || ''}`;
        window.location.replace(nextUrl);
        return;
      } catch (error) {
        console.error('Checkout confirmation sync failed:', error);
      }
    };

    void run();
  }, [dispatch, user?.email]);

  const renderContent = () => {
    if (authLoading) {
      return (
        <div className="flex flex-col items-center justify-center h-full">
          <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-4" />
          <div className="text-white text-xl animate-pulse font-cinzel tracking-widest">
            Loading Magic...
          </div>
        </div>
      );
    }

    if (mode === 'live-feedback' && livePerformanceId) {
      return <LiveFeedbackView performanceId={livePerformanceId} />;
    }

    if (mode === 'audience-feedback') {
      return <PublicFeedbackForm />;
    }

    if (mode === 'audience-feedback') {
      return <PublicFeedbackForm />;
    }

    if (mode === 'magician' && user) {
      return (
        <MagicianMode
          onBack={() => setMode('selection')}
          user={user}
          onUpgrade={handleUpgrade as any}
          onLogout={async () => {
            loggingOutRef.current = true;
            await supabase.auth.signOut();
            setUser(null);
            setMode('selection');
            loggingOutRef.current = false;
          }}
        />
      );
    }

    switch (mode) {
      case 'about':
        return <About onBack={() => setMode('selection')} />;
      case 'founding-circle':
        return (
          <FoundingCirclePage
            user={user}
            onBack={() => setMode('selection')}
            onJoined={async () => {
              try {
                const { data } = await supabase.auth.getSession();
                const sbUser = data?.session?.user;
                if (!sbUser?.id) return;
                const refreshed = await getUserProfile(sbUser.id);
                if (refreshed) setUser((prev) => ({ ...(prev as any), ...refreshed }));
              } catch {}
            }}
          />
        );
      case 'founder-success':
        return (
          <FounderSuccessPage
            user={user}
            onBack={() => setMode('selection')}
            onStartIdea={() => {
              try { localStorage.setItem('magician_active_view', 'effect-generator'); } catch {}
              setMode('magician');
            }}
            onRefreshProfile={async () => {
              const { data } = await supabase.auth.getSession();
              const sbUser = data?.session?.user;
              if (!sbUser?.id) return;
              const refreshed = await getUserProfile(sbUser.id);
              if (refreshed) setUser((prev) => ({ ...(prev as any), ...refreshed }));
            }}
          />
        );
      case 'audience':
        return <AudienceMode onBack={() => setMode('selection')} />;
      case 'auth':
        return (
          <Auth
            onLogin={(u) => {
              // Optimistically set the user so the UI feels instant.
              // The onAuthStateChange handler will hydrate the full profile and route correctly.
              setUser(u);
            }}
            onBack={() => setMode('selection')}
          />
        );
      default:
        return <ModeSelector onSelectMode={setMode} />;
    }
  };

  return (
    <div className="magical-bg text-white min-h-screen flex flex-col relative">

      <DemoBanner />
<div className="relative z-10 flex flex-col flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 md:p-8 justify-center">
        {renderContent()}
      </div>

      {/*
        Only mount the Disclaimer modal when the user explicitly opens it.
        This prevents it from blocking the app if the modal component's prop
        API changes (e.g., it expects `open` instead of `isOpen`) or defaults to open.
      */}
      {isDisclaimerOpen ? (
        <DisclaimerModalAny
          isOpen={true}
          open={true}
          onClose={() => setIsDisclaimerOpen(false)}
          onOpenChange={(next: boolean) => setIsDisclaimerOpen(Boolean(next))}
          onAcknowledge={() => {
            try {
              localStorage.setItem(DISCLAIMER_ACKNOWLEDGED_KEY, 'true');
            } catch {}
            setIsDisclaimerOpen(false);
          }}
          onAccept={() => {
            try {
              localStorage.setItem(DISCLAIMER_ACKNOWLEDGED_KEY, 'true');
            } catch {}
            setIsDisclaimerOpen(false);
          }}
        />
      ) : null}

      {/*
        Only mount the Feedback modal when the user explicitly opens it.
        This prevents accidental auto-open behavior if the modal component's
        prop API changes (e.g., it expects `open` instead of `isOpen`).
      */}
      {isSuggestionModalOpen ? (
        <AppSuggestionModalAny
          isOpen={true}
          open={true}
          onClose={() => setIsSuggestionModalOpen(false)}
          onSubmitted={() => setIsSuggestionModalOpen(false)}
          onSuccess={() => setIsSuggestionModalOpen(false)}
          user={user}
        />
      ) : null}

      <footer className="relative z-10 w-full text-center p-4 text-xs text-slate-500">
        <p className="text-yellow-300/80 mb-1">
          Magic AI Wizard — Actively evolving with the magic community
        </p>

        {/* Restored global footer links */}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setMode('about')}
            className="text-purple-300 hover:text-white transition hover:underline hover:underline-offset-4"
          >
            Membership Types
          </button>
          <span className="text-slate-600">•</span>
          <button
            type="button"
            onClick={() => setIsDisclaimerOpen(true)}
            className="text-purple-300 hover:text-white transition hover:underline hover:underline-offset-4"
          >
            <span className="inline-flex items-center gap-1">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-4 w-4 opacity-70"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 11V8a4 4 0 0 0-8 0v3" />
                <rect x="4" y="11" width="16" height="10" rx="2" />
                <path d="M12 16h.01" />
              </svg>
              <span>Privacy &amp; Disclaimer</span>
            </span>
          </button>
          <span className="text-slate-600">•</span>
          <button
            type="button"
            onClick={() => setIsSuggestionModalOpen(true)}
            className="text-purple-300 hover:text-white transition hover:underline hover:underline-offset-4"
          >
            Feedback
          </button>
        </div>

        <p>Copyright 2026 Magicians&apos; AI Wizard, LLC — {APP_VERSION}</p>
      </footer>
    </div>
  );
}

export default App;
