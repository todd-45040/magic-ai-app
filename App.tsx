
import React, { useState, useEffect } from 'react';
import { auth } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import type { Mode, User } from './types';
import { registerOrUpdateUser, checkAndUpdateUserTrialStatus, updateUserMembership, getUserProfile } from './services/usersService';
import { ADMIN_EMAIL, APP_VERSION } from './constants';
import { useAppDispatch, refreshAllData } from './store';
import ModeSelector from './components/ModeSelector';
import Auth from './components/Auth';
import AudienceMode from './components/AudienceMode';
import MagicianMode from './components/MagicianMode';
import About from './components/About';
import DisclaimerModal from './components/DisclaimerModal';
import LiveFeedbackView from './components/LiveFeedbackView';
import AppSuggestionModal from './components/AppSuggestionModal';

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
    const urlParams = new URLSearchParams(window.location.search);
    const modeParam = urlParams.get('mode');
    const perfId = urlParams.get('performanceId');
    if (modeParam === 'live-feedback' && perfId) {
        setLivePerformanceId(perfId);
        setMode('live-feedback');
        setAuthLoading(false);
        return; 
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        if (firebaseUser && firebaseUser.email) {
            let appUser: User = {
                email: firebaseUser.email,
                membership: 'trial', 
                isAdmin: firebaseUser.email === ADMIN_EMAIL,
                generationCount: 0,
                lastResetDate: new Date().toISOString()
            };

            const profile = await getUserProfile(firebaseUser.uid);
            if (profile) {
                appUser = { ...appUser, ...profile };
            }

            await registerOrUpdateUser(appUser, firebaseUser.uid);
            appUser = await checkAndUpdateUserTrialStatus(appUser, firebaseUser.uid);

            setUser(appUser);
            refreshAllData(dispatch);

            setMode(prev => (prev === 'auth' || prev === 'selection') ? 'magician' : prev);
        } else {
            setUser(null);
            setMode(prev => prev === 'magician' ? 'selection' : prev);
        }
        setAuthLoading(false);
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

    return () => unsubscribe();
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
        await signOut(auth);
    } catch (error) {
        console.error("Failed to sign out", error);
    }
  };
  
  const handleUpgrade = async (toTier: 'amateur' | 'semi-pro' | 'professional') => {
    if (user && user.email) {
        const upgradedUser = { ...user, membership: toTier };
        delete upgradedUser.trialEndDate;
        setUser(upgradedUser);
        await updateUserMembership(user.email, toTier);
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
        return <div className="text-white text-xl animate-pulse flex items-center justify-center">Loading Magic...</div>;
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
        return <Auth onLogin={() => {}} onBack={() => setMode('selection')} />;
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
        <p>Copyright 2026 Magicians' AI Wizard, LLC - {APP_VERSION}</p>
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
