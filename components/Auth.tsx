
import React, { useState } from 'react';
import type { User, Membership } from '../types';
import { ADMIN_EMAIL } from '../constants';
import { getUsers } from '../services/usersService';
import { BackIcon, RabbitIcon, ShieldIcon, MailIcon, CheckIcon } from './icons';

interface AuthProps {
  onLogin: (user: User) => void;
  onBack: () => void;
}

type AuthStep = 'credentials' | '2fa_setup' | 'waitlist';

const Auth: React.FC<AuthProps> = ({ onLogin, onBack }) => {
  const [step, setStep] = useState<AuthStep>('credentials');
  
  // Login/Register State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tempUser, setTempUser] = useState<User | null>(null);
  
  // 2FA State
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [twoFactorError, setTwoFactorError] = useState('');

  // Waitlist State
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [waitlistSubmitted, setWaitlistSubmitted] = useState(false);

  const handleCredentialsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;

    const lowerCaseEmail = email.toLowerCase();
    const allUsers = getUsers();
    const existingUser = allUsers.find(u => u.email === lowerCaseEmail);

    if (existingUser) {
      // For existing users, log them in directly
      onLogin(existingUser);
    } else {
      // For new users, initiate the 2FA setup process
      let membership: Membership = 'free';
      const isAdmin = lowerCaseEmail === ADMIN_EMAIL;
      if (isAdmin || lowerCaseEmail === 'pro@magician.com') {
          membership = 'professional';
      } else if (lowerCaseEmail === 'amateur@magician.com') {
          membership = 'amateur';
      }
      
      const newUser: User = { email: lowerCaseEmail, membership, isAdmin };
      setTempUser(newUser);
      setStep('2fa_setup');
    }
  };

  const handleTwoFactorSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTwoFactorError('');

    if (!/^\d{6}$/.test(twoFactorCode)) {
      setTwoFactorError('Please enter a valid 6-digit code.');
      return;
    }
    
    // In this simulation, any 6-digit code is accepted.
    // We can now complete the login process for the new user.
    if (tempUser) {
        onLogin(tempUser);
    }
  };

  const handleWaitlistSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!waitlistEmail.trim()) return;

      // NOTE: In a real deployment, you would send this to a service like Formspree
      // or a Vercel API route that saves to a database.
      // Example: await fetch('https://formspree.io/f/YOUR_FORM_ID', { method: 'POST', body: ... })
      
      console.log(`Waitlist signup: ${waitlistEmail}`);
      setWaitlistSubmitted(true);
  };
  
  const renderCredentialsStep = () => (
    <div className="w-full max-w-md border border-slate-700 rounded-lg p-8 shadow-2xl shadow-purple-900/20 animate-fade-in">
        <RabbitIcon className="w-16 h-16 mx-auto mb-4 text-purple-400" />
        <h2 className="font-cinzel text-3xl font-bold text-white mb-2 text-center">Enter Magician's Circle</h2>
        <p className="text-slate-400 mb-6 text-center">Login or register to access your AI assistant.</p>
        <form onSubmit={handleCredentialsSubmit} className="space-y-4">
            <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                className="w-full px-4 py-3 bg-slate-900 border-2 border-slate-600 rounded-md text-white focus:outline-none focus:border-purple-500 transition-colors"
                required
                autoFocus
            />
             <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full px-4 py-3 bg-slate-900 border-2 border-slate-600 rounded-md text-white focus:outline-none focus:border-purple-500 transition-colors"
                required
            />
             <div className="pt-2">
                <button
                    type="submit"
                    className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold transition-colors disabled:bg-slate-600"
                    disabled={!email || !password}
                >
                    Login / Register
                </button>
                <p className="text-xs text-slate-500 mt-2 text-center">
                    (Demo: Use "amateur@magician.com", "pro@magician.com", or "admin@magician.com". New emails will start a 14-day trial after 2FA setup.)
                </p>
            </div>
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-700/50">
                 <button
                    type="button"
                    onClick={onBack}
                    className="text-slate-400 hover:text-white transition-colors flex items-center gap-2 text-sm"
                >
                    <BackIcon className="w-4 h-4" />
                    <span>Back</span>
                </button>
                <button
                    type="button"
                    onClick={() => setStep('waitlist')}
                    className="text-purple-400 hover:text-purple-300 transition-colors text-sm font-semibold"
                >
                    Just want to subscribe?
                </button>
            </div>
        </form>
    </div>
  );

  const renderTwoFactorStep = () => (
     <div className="w-full max-w-md border border-slate-700 rounded-lg p-8 shadow-2xl shadow-purple-900/20 animate-fade-in">
        <ShieldIcon className="w-16 h-16 mx-auto mb-4 text-purple-400" />
        <h2 className="font-cinzel text-2xl font-bold text-white mb-2 text-center">Set Up 2FA Security</h2>
        <p className="text-slate-400 mb-6 text-center">As a new user, you must set up two-factor authentication for your account's security.</p>
        
        <div className="bg-white p-2 rounded-lg w-32 h-32 mx-auto mb-4 flex items-center justify-center">
            <div className="w-full h-full bg-black grid grid-cols-5 gap-0.5 p-1">
                {Array.from({ length: 25 }).map((_, i) => (
                    <div key={i} className={`w-full h-full ${Math.random() > 0.5 ? 'bg-white' : 'bg-black'}`}></div>
                ))}
            </div>
        </div>

        <p className="text-xs text-slate-400 text-center mb-4">
            In a real application, you would scan this QR code with an app like Google Authenticator. For this demo, enter any 6-digit code.
        </p>

        <form onSubmit={handleTwoFactorSubmit} className="space-y-4">
            <input
                type="text"
                value={twoFactorCode}
                onChange={(e) => setTwoFactorCode(e.target.value)}
                placeholder="6-digit code"
                maxLength={6}
                className="w-full px-4 py-3 bg-slate-900 border-2 border-slate-600 rounded-md text-white text-center text-xl tracking-[0.5em] focus:outline-none focus:border-purple-500 transition-colors"
                required
                autoFocus
            />
            {twoFactorError && <p className="text-red-400 text-sm text-center -mt-2">{twoFactorError}</p>}
            <div className="pt-2">
                <button
                    type="submit"
                    className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold transition-colors disabled:bg-slate-600"
                    disabled={!twoFactorCode}
                >
                    Verify & Complete Setup
                </button>
            </div>
            <button
                type="button"
                onClick={() => setStep('credentials')}
                className="w-full mt-3 py-3 px-4 bg-slate-600/50 hover:bg-slate-700 rounded-md text-slate-300 font-bold transition-colors flex items-center justify-center gap-2"
            >
                <BackIcon className="w-5 h-5" />
                <span>Back</span>
            </button>
        </form>
    </div>
  );

  const renderWaitlistStep = () => (
    <div className="w-full max-w-md border border-slate-700 rounded-lg p-8 shadow-2xl shadow-purple-900/20 animate-fade-in text-center">
        <MailIcon className="w-16 h-16 mx-auto mb-4 text-sky-400" />
        <h2 className="font-cinzel text-2xl font-bold text-white mb-2">Join the Waitlist</h2>
        <p className="text-slate-400 mb-6">Not ready to sign up? Be the first to know about new features and public launches.</p>
        
        {waitlistSubmitted ? (
            <div className="bg-green-900/30 border border-green-500/50 p-6 rounded-lg animate-fade-in">
                <CheckIcon className="w-12 h-12 mx-auto mb-2 text-green-400" />
                <h3 className="text-lg font-bold text-green-300">You're on the list!</h3>
                <p className="text-slate-300 mt-2 text-sm">We'll keep you posted.</p>
                <button 
                    onClick={() => { setWaitlistSubmitted(false); setStep('credentials'); }}
                    className="mt-4 text-sky-400 hover:text-sky-300 underline text-sm"
                >
                    Back to Login
                </button>
            </div>
        ) : (
            <form onSubmit={handleWaitlistSubmit} className="space-y-4">
                <input
                    type="email"
                    value={waitlistEmail}
                    onChange={(e) => setWaitlistEmail(e.target.value)}
                    placeholder="Enter your email address"
                    className="w-full px-4 py-3 bg-slate-900 border-2 border-slate-600 rounded-md text-white focus:outline-none focus:border-sky-500 transition-colors"
                    required
                    autoFocus
                />
                <button
                    type="submit"
                    className="w-full py-3 px-4 bg-sky-600 hover:bg-sky-700 rounded-md text-white font-bold transition-colors disabled:bg-slate-600"
                    disabled={!waitlistEmail}
                >
                    Notify Me
                </button>
                <button
                    type="button"
                    onClick={() => setStep('credentials')}
                    className="w-full mt-2 text-slate-400 hover:text-white transition-colors text-sm"
                >
                    Wait, I want to login
                </button>
            </form>
        )}
    </div>
  );

  return (
    <div className="flex flex-col items-center justify-center h-full">
        {step === 'credentials' && renderCredentialsStep()}
        {step === '2fa_setup' && renderTwoFactorStep()}
        {step === 'waitlist' && renderWaitlistStep()}
    </div>
  );
};

export default Auth;
