import React, { useEffect, useRef, useState } from 'react';
import { supabase, isSupabaseConfigValid } from './supabase';
import type { Mode, User } from './types';
import {
  registerOrUpdateUser,
  checkAndUpdateUserTrialStatus,
  updateUserMembership,
  getUserProfile,
} from './services/usersService';
import { ADMIN_EMAIL } from './constants';
import { useAppDispatch, refreshAllData } from './store';
import ModeSelector from './components/ModeSelector';
import Auth from './components/Auth';
import AudienceMode from './components/AudienceMode';
import MagicianMode from './components/MagicianMode';
import About from './components/About';
import DisclaimerModal from './components/DisclaimerModal';
import LiveFeedbackView from './components/LiveFeedbackView';
import AppSuggestionModal from './components/AppSuggestionModal';
import { isDemoEnabled, enableDemo, seedDemoData } from './services/demoSeedService';

const DISCLAIMER_ACKNOWLEDGED_KEY = 'magician_ai_disclaimer_acknowledged';

function App() {
  const [mode, setMode] = useState<Mode>('selection');
  const [user, setUser] = useState<User | null>(null);
  const [isDisclaimerOpen, setIsDisclaimerOpen] = useState(false);
  const [isSuggestionModalOpen, setIsSuggestionModalOpen] = useState(false);
  const [livePerformanceId, setLivePerformanceId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const dispatch = useAppDispatch();
  const loggingOutRef = useRef(false);

  useEffect(() => {
    const loadingTimeout = window.setTimeout(() => {
      setAuthLoading(false);
    }, 5000);

    const urlParams = new URLSearchParams(window.location.search);
    const modeParam = urlParams.get('mode');
    const perfId = urlParams.get('performanceId');

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
        window.history.replaceState({}, document.title, `${base}/`);
      } catch {}
    };

    const demoEnabled = (() => {
      try {
        return isDemoEnabled();
      } catch {
        return false;
      }
    })();

    if (demoEnabled) {
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

    if (modeParam === 'live-feedback' && perfId) {
      setLivePerformanceId(perfId);
      setMode('live-feedback');
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
          let appUser: User = {
            email: sbUser.email,
            membership: 'trial',
            isAdmin: sbUser.email === ADMIN_EMAIL,
            generationCount: 0,
            lastResetDate: new Date().toISOString(),
          };

          const profile = await getUserProfile(sbUser.id);
          if (profile) appUser = { ...appUser, ...profile };

          await registerOrUpdateUser(appUser, sbUser.id);
          appUser = await checkAndUpdateUserTrialStatus(appUser, sbUser.id);

          setUser(appUser);
          refreshAllData(dispatch);

          setMode(prev =>
            prev === 'auth' || prev === 'selection' ? 'magician' : prev
          );

          if (modeParam === 'auth-callback') cleanupAuthCallbackUrl();
        } else {
          setUser(null);
          setMode(prev => (prev === 'magician' ? 'selection' : prev));
          if (modeParam === 'auth-callback') cleanupAuthCallbackUrl();
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

    if (mode === 'magician' && user) {
      return (
        <MagicianMode
          onBack={() => setMode('selection')}
          user={user}
          onUpgrade={() => {}}
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
      <div className="relative z-10 flex flex-col flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 md:p-8 justify-center">
        {renderContent()}
      </div>

      <footer className="relative z-10 w-full text-center p-4 text-xs text-slate-500">
        <p className="text-yellow-300/80 mb-1">
          Magic AI Wizard — Actively evolving with the magic community
        </p>
        <p>Copyright 2026 Magicians&apos; AI Wizard, LLC - v0.93 Beta</p>
      </footer>
    </div>
  );
}

// footer.tsx
const BUILD_TAG = "live-rehearsal-env-fix-1";

export default App;
