import React, { useEffect, useMemo, useState } from 'react';
import type { User } from '../types';
import { supabase } from '../supabase';
import { StarIcon, LockIcon, CheckIcon, UsersIcon } from './icons';

const PRICING_LOCK = 'founding_pro_admc_2026';

const FOUNDING_WINDOW = {
  // ADMC 2026: Thu Apr 2, 2026 6:00 PM ET → closes 72 hours after event ends (Sat midnight → Wed 11:59 PM)
  opensAtISO: '2026-04-02T18:00:00-04:00',
  closesAtISO: '2026-04-08T23:59:00-04:00',
  tz: 'America/New_York',
} as const;

function fmtET(iso: string) {
  try {
    const d = new Date(iso);
    return (
      new Intl.DateTimeFormat('en-US', {
        timeZone: FOUNDING_WINDOW.tz,
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(d) +
      ' ET'
    );
  } catch {
    return iso;
  }
}


function getAttributionFromUrl(): { raw: string; bucket: 'admc' | 'reddit' | 'organic' | 'other' } {
  try {
    const params = new URLSearchParams(window.location.search || '');
    const raw = (params.get('src') || params.get('utm_source') || params.get('source') || '').trim().slice(0, 120);
    const s = raw.toLowerCase();
    let bucket: 'admc' | 'reddit' | 'organic' | 'other' = 'organic';
    if (!s) bucket = 'organic';
    else if (s.includes('admc') || s.includes('convention') || s.includes('booth') || s.includes('table')) bucket = 'admc';
    else if (s.includes('reddit')) bucket = 'reddit';
    else if (s.includes('organic') || s.includes('direct') || s.includes('site') || s.includes('web')) bucket = 'organic';
    else bucket = 'other';
    return { raw, bucket };
  } catch {
    return { raw: '', bucket: 'organic' };
  }
}

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
  const { user, onBack } = props as any;

  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [foundersCount, setFoundersCount] = useState<number | null>(null);
  const [isClosed, setIsClosed] = useState<boolean>(false);
  const [closeReason, setCloseReason] = useState<string | null>(null);
  const [maxMembers, setMaxMembers] = useState<number | null>(null);
  const [closesAt, setClosesAt] = useState<string | null>(null);

  const prefillEmail = useMemo(() => {
    const u = (user?.email || '').trim();
    return u || '';
  }, [user?.email]);

  const isAlreadyFounder = Boolean(user?.foundingCircleMember);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/foundingStats');
        const j = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (j?.ok) {
          setFoundersCount(typeof j.foundersCount === 'number' ? j.foundersCount : null);
          setIsClosed(Boolean(j.isClosed));
          setCloseReason(j.reason || null);
          setMaxMembers(typeof j.maxMembers === 'number' ? j.maxMembers : null);
          setClosesAt(j.closesAt || null);
        }
      } catch {
        // non-blocking
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleJoin = async () => {
    setLoading(true);
    setMsg(null);

    try {
      const token = await getAccessToken();
      const finalEmail = (prefillEmail || email).trim();

      const attribution = getAttributionFromUrl();

      const payload = {
        name: (name || '').trim() || null,
        email: finalEmail,
        source: attribution.bucket,
        meta: {
          founding_circle: true,
          attribution_raw: attribution.raw,
          source_bucket: attribution.bucket,
          pricing_lock: PRICING_LOCK,
          joined_from: 'founding-circle-page',
        },
        founding_circle: true,
          attribution_raw: attribution.raw,
          source_bucket: attribution.bucket,
        pricing_lock: PRICING_LOCK,
        founding_source: 'ADMC_2026',
        founding_bucket: 'admc_2026',
      };

      await postJoin(payload, token);

      // Phase 2: force reconciliation (safe/idempotent) so the badge + lock surface instantly,
      // even if the user joined while signed-out earlier.
      try {
        if (token) {
          await fetch('/api/foundingReconcile', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({}),
          });
        }
      } catch {
        // non-blocking
      }

      setDone(true);

      // Ask the parent to refresh the user profile so the Founding badge appears immediately.
      try {
        if (typeof (props as any)?.onJoined === 'function') (props as any).onJoined();
      } catch {}
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

      <div className="rounded-2xl border border-amber-400/20 bg-gradient-to-b from-purple-900/35 via-slate-950/35 to-slate-950/25 p-6 sm:p-8 shadow-[0_0_80px_rgba(168,85,247,0.10),0_0_60px_rgba(251,191,36,0.08)]">
        <div className="flex items-start justify-between gap-6 flex-col sm:flex-row">
          <div className="min-w-0">
            <h1 className="font-cinzel text-3xl sm:text-4xl font-bold text-white tracking-wide">
              Be among the original magicians shaping Magic AI Wizard.
            </h1>
            <p className="mt-3 text-slate-200/90 text-base sm:text-lg max-w-2xl">
              The Founding Circle is a calm, premium early-adopter layer. No hype — just access, identity, and an ADMC pricing lock before Stripe goes live.
            </p>

            <div className="mt-4 inline-flex flex-col gap-1 rounded-xl border border-amber-400/25 bg-amber-500/10 px-4 py-2">
              <div className="text-xs font-semibold tracking-wide text-amber-200">Offer window (Eastern Time)</div>
              <div className="text-xs text-slate-200/90">
                Opens <span className="text-amber-200">{fmtET(FOUNDING_WINDOW.opensAtISO)}</span> • Closes{' '}
                <span className="text-amber-200">{fmtET(FOUNDING_WINDOW.closesAtISO)}</span>
              </div>
              <div className="text-[11px] text-slate-300/90">
                Available during ADMC and through the following Wednesday at midnight (72 hours after the convention ends).
              </div>
            </div>
          </div>

          <div className="w-full sm:w-[260px] shrink-0">
            <div className="rounded-2xl border border-amber-400/20 bg-black/20 p-4 shadow-[0_0_40px_rgba(251,191,36,0.10)]">
              <img
                src="/assets/branding/wizard-head-wtext.png"
                alt="Magicians' AI Wizard"
                className="w-full h-auto opacity-95"
                loading="lazy"
              />
            </div>
          </div>
        </div>

        <div className="mt-7 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-center gap-2">
              <UsersIcon className="w-5 h-5 text-amber-200/90" />
              <div className="font-semibold text-white">Identity</div>
            </div>
            <div className="mt-2 text-sm text-slate-300">In-app badge and founder status surfaced in Admin.</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-center gap-2">
              <LockIcon className="w-5 h-5 text-amber-200/90" />
              <div className="font-semibold text-white">Pricing Lock</div>
            </div>
            <div className="mt-2 text-sm text-slate-300">Lock in the ADMC founding rate (applied automatically later).</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-center gap-2">
              <CheckIcon className="w-5 h-5 text-amber-200/90" />
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
                  <div className="text-sm text-slate-300 mt-1">
                    Limited to the first {maxMembers || 100} Founding Members. Calm authority. No spam.
                    {typeof foundersCount === 'number' ? (
                      <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-white/10 bg-white/5 text-xs text-slate-200">
                        <UsersIcon className="w-3.5 h-3.5 text-slate-300" />
                        {maxMembers ? `${foundersCount} / ${maxMembers} founders` : `${foundersCount} founders joined`}
                      </span>
                    ) : null}
                  </div>
                  {isClosed ? (
                    <div className="mt-2 text-xs text-amber-200/90">
                      Founding Circle is {closeReason === 'permanently_closed' || closeReason === 'limit_reached' ? 'permanently closed' : 'currently closed'}{closeReason === 'date_passed' ? ' (window ended)' : ''}.
                    </div>
                  ) : closesAt ? (
                    <div className="mt-2 text-xs text-slate-400">
                      Live window close: <span className="text-amber-200">{fmtET(closesAt)}</span>.
                    </div>
                  ) : null}
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
                  className="px-4 py-3 rounded-lg bg-black/30 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400/60"
                />

                <input
                  value={prefillEmail || email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  disabled={Boolean(prefillEmail)}
                  className="px-4 py-3 rounded-lg bg-black/30 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400/60 disabled:opacity-70"
                />

                <button
                  type="button"
                  onClick={handleJoin}
                  disabled={isClosed || loading || !(prefillEmail || email).trim()}
                  className="px-4 py-3 rounded-lg bg-amber-400/90 hover:bg-amber-400 text-black font-bold transition shadow-[0_0_28px_rgba(251,191,36,0.18)] disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isClosed ? 'Founding Closed' : (loading ? 'Joining…' : 'Join Founding Circle')}
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
