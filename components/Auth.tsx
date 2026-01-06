
import React, { useState } from 'react';
import { supabase } from '../supabase';
import type { User } from '../types';
import { ADMIN_EMAIL } from '../constants';
import { getUserProfile, registerOrUpdateUser, checkAndUpdateUserTrialStatus } from '../services/usersService';
import { BackIcon, MailIcon, CheckIcon, ShieldIcon } from './icons';

interface AuthProps {
  onLogin: (user: User) => void;
  onBack: () => void;
}

type AuthStep = 'login' | 'signup' | 'forgot_password' | 'verify_email';

const Auth: React.FC<AuthProps> = ({ onBack, onLogin }) => {
  const [step, setStep] = useState<AuthStep>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');

  // The app is deployed under /app on Vercel (see vercel.json rewrites).
  // Supabase email links MUST redirect back to the same base path.
  const getAppBasePath = () => {
    try {
      return window.location.pathname.startsWith('/app') ? '/app' : '';
    } catch {
      return '';
    }
  };

  const getAuthRedirectUrl = () => {
    const base = getAppBasePath();
    // Keep the redirect simple (no client-side routes) so Vercel rewrites always work.
    return `${window.location.origin}${base}/?mode=auth-callback`;
  };

  const handleLogin = async (e: React.FormEvent) => {
  e.preventDefault();
  setError('');
  setIsLoading(true);

  try {
const { data: signInData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
if (authError) throw authError;

// Prefer user/session returned from sign-in to avoid extra network calls.
const sbUser = signInData?.user ?? signInData?.session?.user ?? null;
if (!sbUser?.id) {
  throw new Error('Signed in, but no user/session was returned.');
}

// ✅ Minimal user profile to enter the app immediately (no blocking awaits)
const safeEmail = sbUser.email ?? email ?? '';
let appUser: User = {
  id: sbUser.id,
  email: safeEmail,
  membership: 'trial',
  isTrialExpired: false,
  dailyRemaining: 0,
  dailyLimit: 0,
  burstRemaining: 0,
  burstLimit: 0,
  isAdmin: safeEmail === ADMIN_EMAIL
} as any;

// Enter the app immediately
onLogin(appUser);

// Post-login bootstrap (best-effort, non-blocking)
void (async () => {
  try {
    // Try to fetch existing profile and merge
    const existing = await getUserProfile(sbUser.id);
    if (existing) {
      appUser = { ...appUser, ...existing };
    }
    await registerOrUpdateUser(appUser, sbUser.id);
    const updated = await checkAndUpdateUserTrialStatus(appUser, sbUser.id);
    onLogin(updated);
  } catch (e) {
    console.warn('Post-login bootstrap failed:', e);
  }
})();
} catch (err: any) {
    const msg = err?.message ?? 'Login failed. Please try again.';
    setError(msg);
  } finally {
    setIsLoading(false);
  }
};

const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: getAuthRedirectUrl(),
      },
    });

    if (authError) {
      setError(authError.message);
      setIsLoading(false);
    } else if (data?.user && data.session === null) {
      setStep('verify_email');
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setIsLoading(true);

    const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: getAuthRedirectUrl(),
    });
    if (authError) {
        setError(authError.message);
    } else {
        setMessage('Check your email for the reset link.');
    }
    setIsLoading(false);
  };

  const handleLogoutAndBack = async () => {
    await supabase.auth.signOut();
    setStep('login');
    onBack();
  };

  const renderLogin = () => (
    <div className="w-full max-w-md border border-slate-700 rounded-lg p-8 shadow-2xl shadow-purple-900/20 animate-fade-in brand-motif">
        <div className="flex justify-center mb-6">
            <img src="/images/wizard-login-logo.png" alt="Magicians' AI Wizard" className="w-48 h-auto" />
        </div>
        <h2 className="font-cinzel text-3xl font-bold text-white mb-2 text-center">Magician's Login</h2>
        <p className="text-slate-400 mb-6 text-center">Enter the secret sanctum.</p>
        <form onSubmit={handleLogin} className="space-y-4">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="w-full px-4 py-3 bg-slate-900 border-2 border-slate-600 rounded-md text-white focus:border-purple-500" required />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className="w-full px-4 py-3 bg-slate-900 border-2 border-slate-600 rounded-md text-white focus:border-purple-500" required />
            {error && <p className="text-red-400 text-sm text-center font-semibold">{error}</p>}
            <button type="submit" className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold disabled:bg-slate-600" disabled={isLoading}>{isLoading ? 'Unlocking...' : 'Login'}</button>
            <div className="flex justify-between items-center text-sm pt-2">
              <button type="button" onClick={() => setStep('signup')} className="text-purple-400 hover:text-purple-300">Join the Circle</button>
              <button type="button" onClick={() => setStep('forgot_password')} className="text-slate-400 hover:text-slate-300">Forgot password?</button>
            </div>
            <button type="button" onClick={onBack} className="text-slate-400 hover:text-white flex items-center gap-2 text-sm mt-4 pt-4 border-t border-slate-700/50"><BackIcon className="w-4 h-4" /><span>Back</span></button>
        </form>
    </div>
  );

  const renderSignUp = () => (
    <div className="w-full max-w-md border border-slate-700 rounded-lg p-8 shadow-2xl shadow-purple-900/20 animate-fade-in">
        <h2 className="font-cinzel text-3xl font-bold text-white mb-2 text-center">New Apprentice</h2>
        <form onSubmit={handleSignUp} className="space-y-4">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="w-full px-4 py-3 bg-slate-900 border-2 border-slate-600 rounded-md text-white focus:border-purple-500" required />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (6+ chars)" className="w-full px-4 py-3 bg-slate-900 border-2 border-slate-600 rounded-md text-white focus:border-purple-500" required />
            {error && <p className="text-red-400 text-sm text-center font-semibold">{error}</p>}
            <button type="submit" className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold disabled:bg-slate-600" disabled={isLoading}>{isLoading ? 'Creating...' : 'Sign Up'}</button>
            <button type="button" onClick={() => setStep('login')} className="w-full text-center text-sm text-purple-400 mt-2">Already an apprentice? Log in</button>
            <button type="button" onClick={onBack} className="text-slate-400 hover:text-white flex items-center gap-2 text-sm mt-4 pt-4 border-t border-slate-700/50"><BackIcon className="w-4 h-4" /><span>Back</span></button>
        </form>
    </div>
  );

  const renderVerifyEmail = () => (
    <div className="w-full max-w-md border border-slate-700 rounded-lg p-8 shadow-2xl shadow-purple-900/20 animate-fade-in text-center">
        <MailIcon className="w-16 h-16 mx-auto mb-4 text-amber-400" />
        <h2 className="font-cinzel text-2xl font-bold text-white mb-2">Check Your Email</h2>
        <p className="text-slate-400 mb-6">A verification link has been sent to <strong>{email}</strong>.</p>
        <button onClick={() => window.location.reload()} className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold mb-4">I've Verified My Email</button>
        <button onClick={handleLogoutAndBack} className="text-slate-500 hover:text-slate-400 text-sm underline">Use a different account</button>
    </div>
  );

  // FIX: Created render method for forgot password step
  const renderForgotPassword = () => (
    <div className="w-full max-w-md border border-slate-700 rounded-lg p-8 shadow-2xl shadow-purple-900/20 animate-fade-in">
        <h2 className="font-cinzel text-3xl font-bold text-white mb-2 text-center">Forgot Password</h2>
        <p className="text-slate-400 mb-6 text-center">Enter your email to receive a reset link.</p>
        <form onSubmit={handleForgotPassword} className="space-y-4">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="w-full px-4 py-3 bg-slate-900 border-2 border-slate-600 rounded-md text-white focus:border-purple-500" required />
            {error && <p className="text-red-400 text-sm text-center font-semibold">{error}</p>}
            {message && <p className="text-green-400 text-sm text-center font-semibold">{message}</p>}
            <button type="submit" className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold disabled:bg-slate-600" disabled={isLoading}>{isLoading ? 'Sending...' : 'Send Reset Link'}</button>
            <button type="button" onClick={() => setStep('login')} className="w-full text-center text-sm text-purple-400 mt-2">Back to Login</button>
            <button type="button" onClick={onBack} className="text-slate-400 hover:text-white flex items-center gap-2 text-sm mt-4 pt-4 border-t border-slate-700/50"><BackIcon className="w-4 h-4" /><span>Back</span></button>
        </form>
    </div>
  );

  return (
    <div className="flex flex-col items-center justify-center h-full">
        {step === 'login' && renderLogin()}
        {step === 'signup' && renderSignUp()}
        {/* FIX: Use the render method instead of the function reference */}
        {step === 'forgot_password' && renderForgotPassword()}
        {step === 'verify_email' && renderVerifyEmail()}
    </div>
  );
};

export default Auth;
