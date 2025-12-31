
import React, { useState } from 'react';
import { auth } from '../firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import type { User, Membership } from '../types';
import { ADMIN_EMAIL } from '../constants';
import { BackIcon, RabbitIcon, MailIcon, CheckIcon } from './icons';

interface AuthProps {
  onLogin: (user: User) => void; // This is now mostly handled by App.tsx listener, but we keep signature compatible
  onBack: () => void;
}

type AuthStep = 'credentials' | 'waitlist';

const Auth: React.FC<AuthProps> = ({ onBack }) => {
  const [step, setStep] = useState<AuthStep>('credentials');
  
  // Login/Register State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Waitlist State
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [waitlistSubmitted, setWaitlistSubmitted] = useState(false);

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setIsLoading(true);
    setError('');

    try {
        // Try to sign in first
        await signInWithEmailAndPassword(auth, email, password);
        // Successful login triggers onAuthStateChanged in App.tsx
    } catch (loginError: any) {
        // If user not found, try to register
        if (loginError.code === 'auth/user-not-found' || loginError.code === 'auth/invalid-credential') {
             // For UX, if it looks like a new user, we could try registering. 
             // However, separating Login and Register is usually safer.
             // For this transition, we will attempt registration if login fails with "invalid credential" 
             // AND the password is strong enough (Firebase requires 6 chars).
             if (password.length >= 6) {
                 try {
                     await createUserWithEmailAndPassword(auth, email, password);
                     // Registration success triggers onAuthStateChanged
                 } catch (regError: any) {
                     if (regError.code === 'auth/email-already-in-use') {
                         setError('Incorrect password for this email.');
                     } else {
                         setError('Login failed. If registering, ensure password is 6+ chars.');
                         console.error(regError);
                     }
                 }
             } else {
                 setError('Invalid email or password. Password must be 6+ characters.');
             }
        } else {
            setError('Authentication failed. Please try again.');
            console.error(loginError);
        }
    } finally {
        setIsLoading(false);
    }
  };

  const handleWaitlistSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!waitlistEmail.trim()) return;
      console.log(`Waitlist signup: ${waitlistEmail}`);
      setWaitlistSubmitted(true);
  };
  
  const renderCredentialsStep = () => (
    <div className="w-full max-w-md border border-slate-700 rounded-lg p-8 shadow-2xl shadow-purple-900/20 animate-fade-in">
        <div className="flex justify-center mb-6">
            <img src="/logo.svg" alt="Magicians' AI Wizard" className="w-48 h-auto" />
        </div>
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
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
             <div className="pt-2">
                <button
                    type="submit"
                    className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold transition-colors disabled:bg-slate-600"
                    disabled={!email || !password || isLoading}
                >
                    {isLoading ? 'Processing...' : 'Login / Register'}
                </button>
                <p className="text-xs text-slate-500 mt-2 text-center">
                    New email addresses will be automatically registered.
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
        {step === 'waitlist' && renderWaitlistStep()}
    </div>
  );
};

export default Auth;
