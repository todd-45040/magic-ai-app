import React, { useMemo, useState } from 'react';
import { supabase } from '../supabase';

type AuthMode = 'login' | 'signup' | 'reset';

interface AuthProps {
  onLoginSuccess: () => void;
  onBack?: () => void;
}

function getAppBasePath(): string {
  try {
    return window.location.pathname.startsWith('/app') ? '/app' : '';
  } catch {
    return '';
  }
}

export default function Auth({ onLoginSuccess, onBack }: AuthProps) {
  const [mode, setMode] = useState<AuthMode>('login');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    if (!email.trim()) return false;
    if (mode === 'reset') return true;
    if (!password) return false;
    if (mode === 'signup' && password !== confirm) return false;
    return true;
  }, [email, password, confirm, mode]);

  const title =
    mode === 'login' ? 'Magician Login' : mode === 'signup' ? 'Start Your Free Trial' : 'Password Recovery';

  const subtitle =
    mode === 'login'
      ? 'Enter your credentials to open the Studio.'
      : mode === 'signup'
      ? 'Create an account and unlock your AI rehearsal & creative suite.'
      : 'We’ll email you a secure reset link.';

  function formatAuthError(err: any, context: 'login' | 'signup' | 'reset'): string {
    const msg = String(err?.message || '').trim();
    const lower = msg.toLowerCase();

    // Supabase Auth: shared email provider can rate-limit signup/reset emails during testing.
    if (lower.includes('email rate limit exceeded') || (lower.includes('rate limit') && lower.includes('email'))) {
      return context === 'reset'
        ? 'Too many reset emails were requested recently. Please wait a bit and try again (or sign in if you already have an account).'
        : 'Too many confirmation emails were requested recently. Please wait a bit and try again, or sign in if you already created an account.';
    }

    // Friendly common cases
    if (lower.includes('invalid login credentials')) return 'That email/password combination didn\'t work. Please try again.';
    if (lower.includes('user already registered')) return 'That email is already registered. Try logging in instead.';
    if (lower.includes('email address') && lower.includes('is invalid')) return 'That email looks invalid. Please remove any spaces and try again.';

    return msg || 'Something went wrong. Please try again.';
  }

  async function doLogin() {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function doSignup() {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  }

  async function doReset() {
    const base = getAppBasePath();
    const redirectTo = `${window.location.origin}${base}/reset`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || isLoading) return;

    setError(null);
    setMessage(null);
    setIsLoading(true);

    try {
      if (mode === 'login') {
        await doLogin();
        setMessage('Welcome back — loading your Studio…');
        onLoginSuccess();
      } else if (mode === 'signup') {
        await doSignup();
        setMessage('Account created! Check your email if confirmation is required.');
        onLoginSuccess();
      } else {
        await doReset();
        setMessage('If an account exists for that email, a reset link has been sent.');
      }
    } catch (err: any) {
      setError(formatAuthError(err, mode));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full bg-[#05060a] relative overflow-hidden text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-purple-700/20 blur-[120px]" />
        <div className="absolute -bottom-52 -right-40 h-[560px] w-[560px] rounded-full bg-yellow-500/10 blur-[140px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.06),rgba(0,0,0,0.0),rgba(0,0,0,0.0))]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-5xl items-center justify-center px-4 py-10">
        <div className="grid w-full grid-cols-1 gap-10 lg:grid-cols-2 lg:items-stretch">
          {/* Brand panel */}
          <div className="hidden lg:flex flex-col justify-center rounded-2xl border border-white/10 bg-white/5 p-10 shadow-[0_20px_60px_rgba(0,0,0,0.55)]">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-purple-600/90 to-yellow-400/70 shadow-[0_0_0_1px_rgba(255,255,255,0.15)]" />
              <div>
                <div className="text-white text-xl font-semibold tracking-wide">Magicians’ AI Wizard</div>
                <div className="text-white/70 text-sm">Your creative & business suite for performers</div>
              </div>
            </div>

            <div className="mt-10 space-y-4 text-white/85">
              <div className="text-2xl font-semibold leading-snug">
                Build stronger routines. Rehearse smarter. Run your show like a pro.
              </div>
              <ul className="mt-6 space-y-3 text-sm">
                {[ 
                  'Generate patter, beats, and stage direction in seconds',
                  'Live rehearsal feedback on pacing, clarity, and confidence',
                  'Show planning, tasks, and organizational tools that stick',
                  'Ethical guardrails — no exposure, just better performance',
                ].map((t) => (
                  <li key={t} className="flex items-start gap-3">
                    <span className="mt-1 inline-block h-2 w-2 rounded-full bg-yellow-400/90 shadow-[0_0_14px_rgba(250,204,21,0.45)]" />
                    <span className="text-white/80">{t}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-10 rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="text-white/90 text-sm font-medium">Tip</div>
                <div className="mt-1 text-white/70 text-sm">
                  Use an email you can access — it makes password recovery painless.
                </div>
              </div>
            </div>
          </div>

          {/* Auth card */}
          <div className="flex items-center justify-center">
            <div className="w-full max-w-md rounded-2xl border border-white/10 bg-gradient-to-b from-[#0b1222]/90 to-[#070a12]/90 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.65)] backdrop-blur">
              <div className="flex flex-col items-center">
                <img
                  src={"/Wizard_Head_wText.png"}
                  alt="Magicians' AI Wizard"
                  className="h-20 w-auto select-none drop-shadow-[0_12px_28px_rgba(0,0,0,0.65)]"
                  draggable={false}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
                <div className="mt-4 text-white text-xl font-semibold">{title}</div>
                <div className="mt-1 text-white/65 text-sm text-center">{subtitle}</div>
              </div>

              <div className="mt-6 grid grid-cols-3 rounded-xl border border-white/10 bg-white/5 p-1">
                {[
                  { key: 'login' as const, label: 'Login' },
                  { key: 'signup' as const, label: 'Join' },
                  { key: 'reset' as const, label: 'Recover' },
                ].map((t) => {
                  const active = mode === t.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => {
                        setMode(t.key);
                        setError(null);
                        setMessage(null);
                      }}
                      className={[
                        'rounded-lg px-3 py-2 text-sm transition',
                        active
                          ? 'bg-gradient-to-r from-purple-600 to-purple-500 text-white shadow-[0_10px_24px_rgba(124,58,237,0.35)]'
                          : 'text-white/70 hover:text-white hover:bg-white/5',
                      ].join(' ')}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>

              {error && (
                <div className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {error}
                </div>
              )}
              {message && (
                <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                  {message}
                </div>
              )}

              <form onSubmit={onSubmit} className="mt-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium tracking-wide text-white/75">Email</label>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    required
                    className="mt-2 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-white placeholder:text-white/35 outline-none transition focus:border-purple-500/60 focus:ring-2 focus:ring-purple-500/20"
                  />
                </div>

                {mode !== 'reset' && (
                  <div>
                    <label className="block text-xs font-medium tracking-wide text-white/75">Password</label>
                    <input
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      type="password"
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      placeholder="••••••••"
                      required
                      className="mt-2 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-white placeholder:text-white/35 outline-none transition focus:border-purple-500/60 focus:ring-2 focus:ring-purple-500/20"
                    />
                  </div>
                )}

                {mode === 'signup' && (
                  <div>
                    <label className="block text-xs font-medium tracking-wide text-white/75">Confirm Password</label>
                    <input
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      type="password"
                      autoComplete="new-password"
                      placeholder="••••••••"
                      required
                      className="mt-2 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-white placeholder:text-white/35 outline-none transition focus:border-purple-500/60 focus:ring-2 focus:ring-purple-500/20"
                    />
                    {confirm && password !== confirm && (
                      <div className="mt-2 text-xs text-red-200/90">Passwords do not match.</div>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={!canSubmit || isLoading}
                  className={[
                    'mt-2 w-full rounded-lg py-3 text-sm font-semibold tracking-wide transition',
                    'shadow-[0_14px_30px_rgba(124,58,237,0.35)]',
                    !canSubmit || isLoading
                      ? 'bg-purple-600/40 text-white/60 cursor-not-allowed'
                      : 'bg-gradient-to-r from-purple-600 to-purple-500 text-white hover:brightness-110',
                  ].join(' ')}
                >
                  {isLoading
                    ? 'Working…'
                    : mode === 'login'
                    ? 'Enter the Studio'
                    : mode === 'signup'
                    ? 'Create Account & Start Trial'
                    : 'Send Reset Link'}
                </button>

                <div className="flex items-center justify-between pt-2 text-xs">
                  {mode !== 'reset' ? (
                    <button
                      type="button"
                      onClick={() => {
                        setMode('reset');
                        setError(null);
                        setMessage(null);
                      }}
                      className="text-white/65 hover:text-white underline underline-offset-4"
                    >
                      Forgot password?
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setMode('login');
                        setError(null);
                        setMessage(null);
                      }}
                      className="text-white/65 hover:text-white underline underline-offset-4"
                    >
                      Back to login
                    </button>
                  )}

                  {mode !== 'signup' ? (
                    <button
                      type="button"
                      onClick={() => {
                        setMode('signup');
                        setError(null);
                        setMessage(null);
                      }}
                      className="text-yellow-200/80 hover:text-yellow-200 underline underline-offset-4"
                    >
                      New here? Start trial
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setMode('login');
                        setError(null);
                        setMessage(null);
                      }}
                      className="text-white/65 hover:text-white underline underline-offset-4"
                    >
                      Already have an account?
                    </button>
                  )}
                </div>

                {onBack && (
                  <div className="pt-2 text-center">
                    <button
                      type="button"
                      onClick={onBack}
                      className="text-white/55 hover:text-white underline underline-offset-4 text-xs"
                    >
                      Back to mode selection
                    </button>
                  </div>
                )}

                <div className="pt-3 text-[11px] leading-relaxed text-white/45">
                  By continuing, you agree to the platform’s ethical guidelines: no exposure — performance, rehearsal,
                  and business support only.
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
