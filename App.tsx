import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigValid } from './supabase';
import type { Mode, User } from './types';
import { registerOrUpdateUser, checkAndUpdateUserTrialStatus, updateUserMembership, getUserProfile } from './services/usersService';
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

  useEffect(() => {
    // Safety timeout for the loading screen
    const loadingTimeout = setTimeout(() => {
      if (authLoading) setAuthLoading(false);
    }, 5000);

    const urlParams = new URLSearchParams(window.location.search);
    const modeParam = urlParams.get('mode');

    // Helper: our SPA is commonly served under /app (vercel.json rewrites).
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
        // Strip auth callback query params and any hash fragments from Supabase.
        window.history.replaceState({}, document.title, `${base}/`);
      } catch {
        // noop
      }
    };
    // Demo Mode (for conventions / talks)
    const demoEnabled = (() => {
      try {
        return isDemoEnabled();
      } catch {
        return false;
      }
    })();
    if (demoEnabled) {
      try { enableDemo(); } catch {}
      try { seedDemoData(); } catch {}
      const demoUser = {
        email: 'demo@magicaiwizard.com',
        membership: 'professional',
        isAdmin: false,
        generationCount: 0,
        lastResetDate: new Date().toISOString(),
      } as any;
      setUser(demoUser);
      refreshAllData(dispatch);
      setMode('magician');
      setAuthLoading(false);
      clearTimeout(loadingTimeout);
      return;
    }

    const perfId = urlParams.get('performanceId');
    if (modeParam === 'live-feedback' && perfId) {
        setLivePerformanceId(perfId);
        setMode('live-feedback');
        setAuthLoading(false);
        clearTimeout(loadingTimeout);
        return; 
    }

    // When a user clicks the Supabase email verification link, we redirect back
    // to /app/?mode=auth-callback (set in components/Auth.tsx). During this
    // callback we keep the user in the auth flow while Supabase hydrates the session.
    if (modeParam === 'auth-callback') {
      setMode('auth');
    }

	    if (!isSupabaseConfigValid) {
        setAuthLoading(false);
        clearTimeout(loadingTimeout);
        return;
    }

    // Initial session sync (Supabase)
    const initialSync = async () => {
        try {
            const { data } = await supabase.auth.getSession();
            const sbUser = data?.session?.user ?? null;
            if (sbUser && sbUser.email) {
                let appUser: User = {
                    email: sbUser.email,
                    membership: 'trial',
                    isAdmin: sbUser.email === ADMIN_EMAIL,
                    generationCount: 0,
                    lastResetDate: new Date().toISOString()
                };
                const profile = await getUserProfile(sbUser.id);
                if (profile) {
                    appUser = { ...appUser, ...profile };
                }

                await registerOrUpdateUser(appUser, sbUser.id);
                appUser = await checkAndUpdateUserTrialStatus(appUser, sbUser.id);

                setUser(appUser);
                refreshAllData(dispatch);
                setMode(prev => (prev === 'auth' || prev === 'selection') ? 'magician' : prev);
                if (modeParam === 'auth-callback') cleanupAuthCallbackUrl();
            } else {
                setUser(null);
                setMode(prev => prev === 'magician' ? 'selection' : prev);
                if (modeParam === 'auth-callback') cleanupAuthCallbackUrl();
            }
        } catch (error) {
            console.error('Supabase initial auth sync error:', error);
        } finally {
            if (modeParam === 'auth-callback') {
              cleanupAuthCallbackUrl();
            }
            setAuthLoading(false);
            clearTimeout(loadingTimeout);
        }
    };

    initialSync();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, session) => {
        try {
            const sbUser = session?.user ?? null;
            if (sbUser && sbUser.email) {
                let appUser: User = {
                    email: sbUser.email,
                    membership: 'trial', 
                    isAdmin: sbUser.email === ADMIN_EMAIL,
                    generationCount: 0,
                    lastResetDate: new Date().toISOString()
                };

                const profile = await getUserProfile(sbUser.id);
                if (profile) {
                    appUser = { ...appUser, ...profile };
                }

                await registerOrUpdateUser(appUser, sbUser.id);
                appUser = await checkAndUpdateUserTrialStatus(appUser, sbUser.id);

                setUser(appUser);
                refreshAllData(dispatch);

                setMode(prev => (prev === 'auth' || prev === 'selection') ? 'magician' : prev);
            } else {
                setUser(null);
                setMode(prev => prev === 'magician' ? 'selection' : prev);
            }
        } catch (error) {
            console.error("Auth sync error:", error);
        } finally {
            setAuthLoading(false);
            clearTimeout(loadingTimeout);
        }
    });
    
    try {
        const hasAcknowledged = localStorage.getItem(DISCLAIMER_ACKNOWLEDGED_KEY);
        if (hasAcknowledged !== 'true') {
            setIsDisclaimerOpen(true);
        }
    } catch (error) {
        console.error("Failed to check disclaimer status", error);
        setIsDisclaimerOpen(true);
    }

    return () => {
      authListener?.subscription?.unsubscribe?.();
      clearTimeout(loadingTimeout);
    };
  }, [dispatch]);

  const handleSelectMode = (selectedMode: Mode) => {
    if (selectedMode === 'magician') {
      if (user) {
        setMode('magician');
      } else {
        setMode('auth');
      }
    } else {
      setMode(selectedMode);
    }
  };
  
  const handleBackToSelection = () => {
    setMode('selection'); 
  };

  const handleLogout = async () => {
    try {
        await supabase.auth.signOut();
    } catch (error) {
        console.error("Failed to sign out", error);
    }
  };
  
  const handleUpgrade = async (toTier: 'performer' | 'professional') => {
    if (user && user.email) {
        const upgradedUser = { ...user, membership: toTier };
        if ('trialEndDate' in upgradedUser) {
            delete (upgradedUser as any).trialEndDate;
        }
        setUser(upgradedUser);
        await updateUserMembership(user.email, toTier as any);
    }
  }

  const handleDisclaimerAcknowledge = () => {
      try {
          localStorage.setItem(DISCLAIMER_ACKNOWLEDGED_KEY, 'true');
      } catch (error) {
          console.error("Failed to save disclaimer status", error);
      }
      setIsDisclaimerOpen(false);
  };

  const renderContent = () => {
    if (authLoading) {
        return (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-4"></div>
            <div className="text-white text-xl animate-pulse font-cinzel tracking-widest">Loading Magic...</div>
          </div>
        );
    }

    if (mode === 'live-feedback' && livePerformanceId) {
        return <LiveFeedbackView performanceId={livePerformanceId} />;
    }

    if (mode === 'magician' && user) {
        return <MagicianMode onBack={handleBackToSelection} user={user} onUpgrade={handleUpgrade} onLogout={handleLogout} />;
    }

    switch (mode) {
      case 'about':
        return <About onBack={() => setMode('selection')} />;
      case 'audience':
        return <AudienceMode onBack={() => setMode('selection')} />;
      case 'auth':
        return (
          <Auth
            onLogin={(appUser) => {
              // Immediately enter the app shell on successful login.
              // This avoids "stuck on login until refresh" when the Supabase session hydration
              // or background profile bootstrap lags behind UI state.
              setUser(appUser);
              setAuthLoading(false);
              refreshAllData(dispatch);
              setMode('magician');
            }}
            onBack={() => setMode('selection')}
          />
        );
      case 'selection':
      default:
        return <ModeSelector onSelectMode={handleSelectMode} />;
    }
  };

  if (mode === 'live-feedback') {
    return (
        <div className="bg-slate-900 text-white min-h-screen flex flex-col items-center justify-center">
            {renderContent()}
        </div>
    );
  }

  return (
    <div className="magical-bg text-white min-h-screen flex flex-col relative">
      <div className="dust-pattern" />
      
      {isDisclaimerOpen && <DisclaimerModal onClose={handleDisclaimerAcknowledge} />}
      {isSuggestionModalOpen && <AppSuggestionModal onClose={() => setIsSuggestionModalOpen(false)} />}
      
      <div className="relative z-10 flex flex-col flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 md:p-8 justify-center">
         {renderContent()}
      </div>
      
      <footer className="relative z-10 w-full text-center p-4 text-xs text-slate-500">
        <p>Copyright 2026 Magicians' AI Wizard, LLC - v0.8 Beta</p>
        <div className="flex justify-center items-center gap-4 mt-2">
            <button onClick={() => setMode('about')} className="text-slate-400 hover:text-white transition-colors underline">
                About Memberships
            </button>
            <span className="text-slate-600">|</span>
            <button onClick={() => setIsDisclaimerOpen(true)} className="text-slate-400 hover:text-white transition-colors underline">
                Disclaimer
            </button>
            <span className="text-slate-600">|</span>
            <button onClick={() => setIsSuggestionModalOpen(true)} className="text-slate-400 hover:text-white transition-colors underline">
                Submit App Feedback
            </button>
        </div>
      </footer>
    </div>
  );
}

export default App;