import React, { useEffect, useMemo, useState } from 'react';
import type { User } from '../types';

type FounderCounts = {
  ok: boolean;
  admc_count: number;
  reserve_count: number;
  total_count: number;
  admc_limit: number;
  reserve_limit: number;
  total_limit: number;
};

function StarIcon(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={props.className}
    >
      <path d="M12 2l2.9 6.1 6.7.6-5.1 4.3 1.6 6.5L12 16.9 5.9 19.5 7.5 13 2.4 8.7l6.7-.6L12 2z" />
    </svg>
  );
}

export default function FounderSuccessPage(props: {
  user: User | null;
  onBack: () => void;
  onStartIdea: () => void;
  onRefreshProfile: () => Promise<void>;
}) {
  const { user, onBack, onStartIdea, onRefreshProfile } = props;
  const [counts, setCounts] = useState<FounderCounts | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [statusTries, setStatusTries] = useState(0);

  const isFounder = Boolean((user as any)?.is_founder ?? (user as any)?.foundingCircleMember);
  const lockedRate = useMemo(() => {
    // Pricing lock is immutable server-side; display a friendly, fixed anchor.
    // If you ever introduce multiple founder prices, you can map pricingLock keys here.
    return '29.95';
  }, []);

  // Live founder counter (public, cached for ~10s)
  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const r = await fetch('/api/admin/founder-count');
        const j = (await r.json().catch(() => null)) as FounderCounts | null;
        if (!alive) return;
        if (j && typeof j.total_limit === 'number') setCounts(j);
      } catch {
        // ignore
      }
    };

    void load();
    const t = window.setInterval(load, 30_000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);

  // If webhook processing is still catching up, poll for the upgraded profile.
  // Goal: ensure the Success Page only becomes "done" once the founder badge/pricing lock is confirmed.
  useEffect(() => {
    let alive = true;

    const poll = async () => {
      if (!alive) return;

      // If not signed in yet, we can't confirm status.
      if (!user) {
        setCheckingStatus(false);
        return;
      }

      if (isFounder) {
        setCheckingStatus(false);
        return;
      }

      setCheckingStatus(true);

      // Try a handful of times (webhooks are usually fast, but venues/WiFi can be weird).
      // After that, we still show the CTA + a fallback message.
      if (statusTries >= 12) {
        setCheckingStatus(false);
        return;
      }

      try {
        await onRefreshProfile();
      } catch {
        // ignore
      } finally {
        if (!alive) return;
        setStatusTries((n) => n + 1);
      }
    };

    const t = window.setInterval(poll, 2500);
    void poll();
    return () => {
      alive = false;
      window.clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isFounder, statusTries]);

  const totalText = (() => {
    if (!counts) return '— / —';
    return `${counts.total_count} / ${counts.total_limit}`;
  })();

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="rounded-2xl border border-white/10 bg-black/30 backdrop-blur-sm shadow-2xl shadow-purple-900/20 overflow-hidden">
        <div className="p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-amber-400/25 bg-amber-500/10 mb-4">
                <StarIcon className="w-4 h-4 text-[#E6C77A]" />
                <span className="text-xs font-semibold tracking-wide text-amber-200">Founding Circle</span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-cinzel tracking-wide text-white">
                🎩 Welcome, Founding Member.
              </h1>
              <p className="mt-2 text-slate-300">
                You are one of the first 100 performers shaping the future of magic.
              </p>
            </div>

            <button
              type="button"
              onClick={onBack}
              className="text-slate-400 hover:text-white transition text-sm"
              aria-label="Back"
            >
              Back
            </button>
          </div>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs uppercase tracking-widest text-slate-400">Founder Spots</div>
              <div className="mt-2 text-2xl font-semibold text-white">{totalText}</div>
              <div className="mt-1 text-xs text-slate-400">Live count (auto-refresh)</div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs uppercase tracking-widest text-slate-400">Rate Locked</div>
              <div className="mt-2 text-2xl font-semibold text-white">${lockedRate}/mo</div>
              <div className="mt-1 text-xs text-slate-400">Protected forever (immutable)</div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs uppercase tracking-widest text-slate-400">Founder Badge</div>
              <div className="mt-2 flex items-center gap-2">
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-amber-400/25 via-yellow-300/10 to-purple-500/10 border border-amber-400/25 flex items-center justify-center">
                  <StarIcon className="w-5 h-5 text-[#E6C77A]" />
                </div>
                <div>
                  <div className="text-white font-semibold">Founding Circle</div>
                  <div className="text-xs text-slate-400">Preview</div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-white/10 bg-gradient-to-br from-purple-500/10 via-black/10 to-amber-500/10 p-4">
            {!user ? (
              <div className="text-slate-200">
                <div className="font-semibold text-white">Sign in to complete your Founder activation.</div>
                <div className="text-sm text-slate-300 mt-1">Your checkout is complete — we just need you logged in to unlock your Founder badge and pricing lock in the app.</div>
              </div>
            ) : checkingStatus ? (
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                <div>
                  <div className="text-white font-semibold">Finalizing your Founder status…</div>
                  <div className="text-sm text-slate-300">This usually takes a moment while Stripe confirms your subscription.</div>
                </div>
              </div>
            ) : isFounder ? (
              <div>
                <div className="text-white font-semibold">Founder status confirmed ✅</div>
                <div className="text-sm text-slate-300 mt-1">Let’s lock in your first win: generate and save your first idea.</div>
              </div>
            ) : (
              <div>
                <div className="text-white font-semibold">Checkout complete — syncing your Founder badge…</div>
                <div className="text-sm text-slate-300 mt-1">If this takes longer than 1–2 minutes, refresh this page. Your Founder pricing is protected server-side.</div>
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={onStartIdea}
              className="flex-1 inline-flex items-center justify-center px-4 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 transition font-semibold"
            >
              👉 Start Your First Idea
            </button>

            <button
              type="button"
              onClick={async () => {
                try {
                  setStatusTries(0);
                  setCheckingStatus(true);
                  await onRefreshProfile();
                } catch {
                  // ignore
                }
              }}
              className="px-4 py-3 rounded-xl border border-white/10 bg-black/20 hover:bg-black/30 transition text-slate-200"
              title="Refresh Founder status"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="text-center text-xs text-slate-500 mt-4">
        Tip: Founders activate fastest when they save their first idea within the first 5 minutes.
      </div>
    </div>
  );
}
