import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';

interface ResetPasswordProps {
  onRecovered?: (email: string) => void;
  onBack?: () => void;
}

function getAppBasePath(): string {
  try {
    return window.location.pathname.startsWith('/app') ? '/app' : '';
  } catch {
    return '';
  }
}

function computeStrength(pw: string) {
  const lengthOk = pw.length >= 10;
  const lowerOk = /[a-z]/.test(pw);
  const upperOk = /[A-Z]/.test(pw);
  const numberOk = /\d/.test(pw);
  const specialOk = /[^A-Za-z0-9]/.test(pw);
  const score = [lengthOk, lowerOk, upperOk, numberOk, specialOk].filter(Boolean).length;
  return { lengthOk, lowerOk, upperOk, numberOk, specialOk, score };
}

export default function ResetPassword({ onRecovered, onBack }: ResetPasswordProps) {
  const [stage, setStage] = useState<'exchanging' | 'ready'>('exchanging');
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const strength = useMemo(() => computeStrength(password), [password]);
  const passwordsMatch = password.length > 0 && password === confirm;
  const strongEnough = strength.score >= 4 && strength.lengthOk;

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        // Handles both "?code=" PKCE links and "#access_token=" hash links safely.
        await supabase.auth.exchangeCodeForSession(window.location.href);
      } catch {
        // Ignore — exchangeCodeForSession can throw for non-code URLs.
      }

      try {
        const { data } = await supabase.auth.getSession();
        const email = data?.session?.user?.email ?? null;
        if (!cancelled) {
          setSessionEmail(email);
          setStage('ready');
        }

        // Keep URL clean (remove tokens / code) but keep the user on /reset
        if (!cancelled) {
          const base = getAppBasePath();
          const resetPath = `${base}/reset`;
          try {
            window.history.replaceState({}, document.title, resetPath);
          } catch {}
        }
      } catch {
        if (!cancelled) {
          setSessionEmail(null);
          setStage('ready');
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const canSubmit = useMemo(() => {
    return !isLoading && passwordsMatch && strongEnough;
  }, [isLoading, passwordsMatch, strongEnough]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsLoading(true);
    setError(null);
    setMessage(null);

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      setMessage('Password updated! Opening your Studio…');

      const { data } = await supabase.auth.getSession();
      const email = data?.session?.user?.email ?? sessionEmail;

      const base = getAppBasePath();
      try {
        window.history.replaceState({}, document.title, `${base}/`);
      } catch {}

      if (email) onRecovered?.(email);
    } catch (err: any) {
      setError(err?.message || 'Could not update password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#05060a] relative overflow-hidden text-white">
      {/* Background glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-purple-700/20 blur-[120px]" />
        <div className="absolute -bottom-52 -right-40 h-[560px] w-[560px] rounded-full bg-yellow-500/10 blur-[140px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.06),rgba(0,0,0,0.0),rgba(0,0,0,0.0))]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-xl items-center justify-center px-4 py-10">
        <div className="w-full rounded-2xl border border-white/10 bg-gradient-to-b from-[#0b1222]/90 to-[#070a12]/90 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.65)] backdrop-blur">
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

            <div className="mt-4 text-white text-xl font-semibold">Set New Password</div>
            <div className="mt-1 text-white/65 text-sm text-center">
              {stage === 'exchanging'
                ? 'Verifying your secure reset link…'
                : sessionEmail
                ? `Resetting password for ${sessionEmail}`
                : 'Your reset link has been verified. Set your new password below.'}
            </div>
          </div>

          {stage === 'exchanging' && (
            <div className="mt-6 flex flex-col items-center justify-center">
              <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
              <div className="mt-3 text-white/70 text-sm">Loading…</div>
            </div>
          )}

          {stage === 'ready' && (
            <>
              {error && (
                <div className="mt-5 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {error}
                </div>
              )}
              {message && (
                <div className="mt-5 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                  {message}
                </div>
              )}

              <form onSubmit={onSubmit} className="mt-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium tracking-wide text-white/75">New Password</label>
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type="password"
                    autoComplete="new-password"
                    placeholder="••••••••"
                    className="mt-2 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-white placeholder:text-white/35 outline-none transition focus:border-purple-500/60 focus:ring-2 focus:ring-purple-500/20"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium tracking-wide text-white/75">Confirm New Password</label>
                  <input
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    type="password"
                    autoComplete="new-password"
                    placeholder="••••••••"
                    className="mt-2 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-white placeholder:text-white/35 outline-none transition focus:border-purple-500/60 focus:ring-2 focus:ring-purple-500/20"
                    required
                  />
                </div>

                {/* Strength checklist */}
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs font-semibold text-white/80">Password strength</div>
                  <div className="mt-2 grid grid-cols-1 gap-2 text-xs">
                    <Check ok={strength.lengthOk} label="At least 10 characters" />
                    <Check ok={strength.lowerOk} label="Contains a lowercase letter" />
                    <Check ok={strength.upperOk} label="Contains an uppercase letter" />
                    <Check ok={strength.numberOk} label="Contains a number" />
                    <Check ok={strength.specialOk} label="Contains a symbol" />
                    <Check ok={passwordsMatch} label="Passwords match" />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!canSubmit}
                  className={[
                    'mt-2 w-full rounded-lg py-3 text-sm font-semibold tracking-wide transition',
                    'shadow-[0_14px_30px_rgba(124,58,237,0.35)]',
                    !canSubmit
                      ? 'bg-purple-600/40 text-white/60 cursor-not-allowed'
                      : 'bg-gradient-to-r from-purple-600 to-purple-500 text-white hover:brightness-110',
                  ].join(' ')}
                >
                  {isLoading ? 'Updating…' : 'Update Password'}
                </button>

                <div className="flex items-center justify-between pt-2 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      const base = getAppBasePath();
                      try {
                        window.history.replaceState({}, document.title, `${base}/`);
                      } catch {}
                      onBack?.();
                    }}
                    className="text-white/65 hover:text-white underline underline-offset-4"
                  >
                    Back
                  </button>

                  <div className="text-white/45">Tip: a long phrase is easiest to remember.</div>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={[
          'inline-flex h-5 w-5 items-center justify-center rounded-md border text-[11px] font-bold',
          ok
            ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
            : 'border-white/10 bg-black/20 text-white/40',
        ].join(' ')}
      >
        {ok ? '✓' : '•'}
      </span>
      <span className={ok ? 'text-white/80' : 'text-white/50'}>{label}</span>
    </div>
  );
}
