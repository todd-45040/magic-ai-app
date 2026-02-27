import React, { useMemo, useState } from 'react';
import type { User } from '../types';
import { supabase } from '../supabase';
import { StarIcon, LockIcon, CheckIcon, UsersIcon } from './icons';

const PRICING_LOCK = 'founding_pro_admc_2026';

async function getAccessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? null;
  } catch {
    return null;
  }
}

async function postJoin(payload: any, token?: string | null) {
  const r = await fetch('/api/waitlistSignup', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.ok) throw new Error(j?.message || j?.error || 'Could not join. Please try again.');
  return j;
}

export default function FoundingCirclePage(props: { user: User | null; onBack: () => void }) {
  const { user, onBack } = props;

  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const prefillEmail = useMemo(() => {
    const u = (user?.email || '').trim();
    return u || '';
  }, [user?.email]);

  const isAlreadyFounder = Boolean(user?.foundingCircleMember);

  const handleJoin = async () => {
    setLoading(true);
    setMsg(null);

    try {
      const token = await getAccessToken();
      const finalEmail = (prefillEmail || email).trim();

      const payload = {
        name: (name || '').trim() || null,
        email: finalEmail,
        source: 'FOUNDING_CIRCLE',
        meta: {
          founding_circle: true,
          pricing_lock: PRICING_LOCK,
          joined_from: 'founding-circle-page',
        },
        founding_circle: true,
        pricing_lock: PRICING_LOCK,
        founding_source: 'ADMC_2026',
      };

      await postJoin(payload, token);
      setDone(true);
    } catch (e: any) {
      setMsg(e?.message || 'Could not join. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <button
          type="button"
          onClick={onBack}
          className="text-sm px-3 py-1.5 rounded-md border border-white/10 bg-black/20 hover:bg-white/10 transition"
        >
          ← Back
        </button>

        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-amber-400/25 bg-amber-500/10">
          <StarIcon className="w-4 h-4 text-[#E6C77A]" />
          <span className="text-xs font-semibold tracking-wide text-amber-200">Founding Circle</span>
        </div>
      </div>

      <div className="rounded-2xl border border-purple-500/20 bg-gradient-to-b from-purple-900/35 via-slate-950/35 to-slate-950/25 p-6 sm:p-8 shadow-[0_0_80px_rgba(168,85,247,0.10)]">
        <h1 className="font-cinzel text-3xl sm:text-4xl font-bold text-white tracking-wide">
          Be among the original magicians shaping Magic AI Wizard.
        </h1>
        <p className="mt-3 text-slate-200/90 text-base sm:text-lg max-w-2xl">
          The Founding Circle is a calm, premium early-adopter layer. No hype — just access, identity, and an ADMC pricing lock before Stripe goes live.
        </p>

        <div className="mt-7 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-center gap-2">
              <UsersIcon className="w-5 h-5 text-purple-300" />
              <div className="font-semibold text-white">Identity</div>
            </div>
            <div className="mt-2 text-sm text-slate-300">In-app badge and founder status surfaced in Admin.</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-center gap-2">
              <LockIcon className="w-5 h-5 text-purple-300" />
              <div className="font-semibold text-white">Pricing Lock</div>
            </div>
            <div className="mt-2 text-sm text-slate-300">Lock in the ADMC founding rate (applied automatically later).</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-center gap-2">
              <CheckIcon className="w-5 h-5 text-purple-300" />
              <div className="font-semibold text-white">Early Access</div>
            </div>
            <div className="mt-2 text-sm text-slate-300">Priority access to new tools and director-grade workflows.</div>
          </div>
        </div>

        <div className="mt-7 rounded-xl border border-white/10 bg-black/20 p-4 sm:p-5">
          {isAlreadyFounder ? (
            <div className="flex items-center justify-between gap-4 flex-col sm:flex-row">
              <div>
                <div className="text-white font-semibold">You’re already in the Founding Circle.</div>
                <div className="text-sm text-slate-300 mt-1">Your badge will show inside the app.</div>
              </div>
              <button
                type="button"
                onClick={onBack}
                className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-semibold transition"
              >
                Return to the App
              </button>
            </div>
          ) : done ? (
            <div>
              <div className="text-white font-semibold">Welcome — you’re in.</div>
              <div className="text-sm text-slate-300 mt-1">Check your inbox for the Founding Circle confirmation email.</div>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4 flex-col sm:flex-row">
                <div>
                  <div className="text-white font-semibold">Join the Founding Circle</div>
                  <div className="text-sm text-slate-300 mt-1">Limited early group. Calm authority. No spam.</div>
                </div>
                <div className="text-xs text-slate-400">
                  Trust: We don’t sell your data. Ever.
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Name (optional)"
                  className="px-4 py-3 rounded-lg bg-black/30 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500/60"
                />

                <input
                  value={prefillEmail || email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  disabled={Boolean(prefillEmail)}
                  className="px-4 py-3 rounded-lg bg-black/30 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500/60 disabled:opacity-70"
                />

                <button
                  type="button"
                  onClick={handleJoin}
                  disabled={loading || !(prefillEmail || email).trim()}
                  className="px-4 py-3 rounded-lg bg-amber-400/90 hover:bg-amber-400 text-black font-bold transition disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? 'Joining…' : 'Join Founding Circle'}
                </button>
              </div>

              {msg ? <div className="mt-3 text-sm text-rose-300">{msg}</div> : null}

              <div className="mt-4 text-xs text-slate-400">
                By joining, you’ll receive a short 4-email sequence explaining early access, pricing lock, and what’s shipping next.
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mt-6 text-center text-xs text-slate-500">
        Founding Circle is an identity layer — not a public coupon code.
      </div>
    </div>
  );
}
