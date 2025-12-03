import React, { useState, useEffect } from 'react';
import type { Mode, User } from './types';
import { registerOrUpdateUser, checkAndUpdateUserTrialStatus, updateUserMembership, getUsers } from './services/usersService';
import ModeSelector from './components/ModeSelector';
import Auth from './components/Auth';
import AudienceMode from './components/AudienceMode';
import MagicianMode from './components/MagicianMode';
import About from './components/About';
import DisclaimerModal from './components/DisclaimerModal';
import LiveFeedbackView from './components/LiveFeedbackView';

const USER_STORAGE_KEY = 'magician_ai_user';
const DISCLAIMER_ACKNOWLEDGED_KEY = 'magician_ai_disclaimer_acknowledged';

function App() {
  const [mode, setMode] = useState<Mode>('selection');
  const [user, setUser] = useState<User | null>(null);
  const [isDisclaimerOpen, setIsDisclaimerOpen] = useState(false);
  const [livePerformanceId, setLivePerformanceId] = useState<string | null>(null);

  useEffect(() => {
    // Check for special URL params first for live feedback mode
    const urlParams = new URLSearchParams(window.location.search);
    const modeParam = urlParams.get('mode');
    const perfId = urlParams.get('performanceId');
    if (modeParam === 'live-feedback' && perfId) {
        setLivePerformanceId(perfId);
        setMode('live-feedback');
        return; // Stop further processing if in live feedback mode
    }

    // Check for a saved user session on initial load
    try {
      const savedUser = localStorage.getItem(USER_STORAGE_KEY);
      if (savedUser) {
        let parsedUser = JSON.parse(savedUser) as User;
        // Check if trial has expired and update status if needed
        parsedUser = checkAndUpdateUserTrialStatus(parsedUser);
        
        setUser(parsedUser);
        setMode('magician');
        // Save the potentially updated user back to localStorage
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(parsedUser));
      }
    } catch (error) {
      console.error("Failed to load user from localStorage", error);
      localStorage.removeItem(USER_STORAGE_KEY);
    }
    
    // Check if the disclaimer has been acknowledged. If not, show it.
    try {
        const hasAcknowledged = localStorage.getItem(DISCLAIMER_ACKNOWLEDGED_KEY);
        if (hasAcknowledged !== 'true') {
            setIsDisclaimerOpen(true);
        }
    } catch (error) {
        console.error("Failed to check disclaimer status from localStorage", error);
        // If we can't check, it's safer to show it.
        setIsDisclaimerOpen(true);
    }
  }, []);

  const handleSelectMode = (selectedMode: Mode) => {
    if (selectedMode === 'magician') {
      // If user is already logged in, go straight to magician mode.
      // Otherwise, go to the authentication screen.
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
    setMode('selection'); // Go back to selection screen without logging out
  };

  const handleLogin = (loggedInUser: User) => {
    registerOrUpdateUser(loggedInUser); // Add/update user in our "database", this will set trial if needed
    
    // After registering, get the potentially modified user (with trial info) from the "DB"
    const users = getUsers();
    const finalUser = users.find(u => u.email === loggedInUser.email) || loggedInUser;

    setUser(finalUser);
    setMode('magician');
    try {
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(finalUser));
    } catch (error) {
        console.error("Failed to save user to localStorage", error);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setMode('selection');
    try {
        localStorage.removeItem(USER_STORAGE_KEY);
    } catch (error) {
        console.error("Failed to remove user from localStorage", error);
    }
  };
  
  const handleUpgrade = (toTier: 'amateur' | 'professional') => {
    if (user) {
        const upgradedUser = { ...user, membership: toTier };
        // Clean up trial end date if it exists
        delete upgradedUser.trialEndDate;
        setUser(upgradedUser);
         try {
            localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(upgradedUser));
             // Also update in the main "DB"
            updateUserMembership(upgradedUser.email, upgradedUser.membership);
        } catch (error) {
            console.error("Failed to save upgraded user to localStorage", error);
        }
    }
  }

  const handleDisclaimerAcknowledge = () => {
      try {
          localStorage.setItem(DISCLAIMER_ACKNOWLEDGED_KEY, 'true');
      } catch (error) {
          console.error("Failed to save disclaimer status to localStorage", error);
      }
      setIsDisclaimerOpen(false);
  };

  const renderContent = () => {
    if (mode === 'live-feedback' && livePerformanceId) {
        return <LiveFeedbackView performanceId={livePerformanceId} />;
    }

    // If a user is logged in, and we're in magician mode, show it.
    if (mode === 'magician' && user) {
        return <MagicianMode onBack={handleBackToSelection} user={user} onUpgrade={handleUpgrade} onLogout={handleLogout} />;
    }

    switch (mode) {
      case 'about':
        return <About onBack={() => setMode('selection')} />;
      case 'audience':
        return <AudienceMode onBack={() => setMode('selection')} />;
      case 'auth':
        return <Auth onLogin={handleLogin} onBack={() => setMode('selection')} />;
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

  const isMagicianFlow = (mode === 'magician' && user) || mode === 'auth';

  // In Magician mode, the gradient is adjusted to a vertical purple glow from the bottom.
  const gradientClass = isMagicianFlow
    ? 'bg-gradient-to-b from-slate-900 to-purple-900'
    : 'bg-gradient-to-br from-slate-900/20 via-slate-900 to-sky-900/20';

  return (
    <div className={`bg-slate-900 text-white min-h-screen flex flex-col ${gradientClass}`}>
      {isDisclaimerOpen && <DisclaimerModal onClose={handleDisclaimerAcknowledge} />}
      <div className="max-w-7xl w-full mx-auto p-4 sm:p-6 md:p-8 flex-1 flex justify-center">
         {renderContent()}
      </div>
      <footer className="w-full text-center p-4 text-xs text-slate-500">
        <p>Copyright 2026 Magicians' AI Wizard, LLC - v0.76 Beta</p>
        <div className="flex justify-center items-center gap-4 mt-2">
            <button onClick={() => setMode('about')} className="text-slate-400 hover:text-white transition-colors underline">
                About Memberships
            </button>
            <span className="text-slate-600">|</span>
            <button onClick={() => setIsDisclaimerOpen(true)} className="text-slate-400 hover:text-white transition-colors underline">
                Disclaimer
            </button>
        </div>
      </footer>
    </div>
  );
}

export default App;