import React, { useMemo, useState } from 'react';

type UsageSnapshot = any;

type Props = {
  usageSnapshot: UsageSnapshot | null;
  error: string | null;
  onRequestUpgrade?: () => void;
};

/**
 * Option 1 UI: Polished "Usage & Limits" collapsible card.
 * Uses /api/ai/usage snapshot shape:
 *  - plan, used, limit, remaining
 *  - quota: { live_audio_minutes, image_gen, identify, video_uploads, resetAt }
 *  - resetHourLocal, resetTz
 */
export default function UsageLimitsCard({ usageSnapshot, error, onRequestUpgrade }: Props) {
  const [open, setOpen] = useState(false);

  const plan = usageSnapshot?.plan ?? 'free';
  const dailyUsed = Number(usageSnapshot?.used ?? 0);
  const dailyLimit = Number(usageSnapshot?.limit ?? 0);
  const dailyRemaining = Number(usageSnapshot?.remaining ?? Math.max(0, dailyLimit - dailyUsed));
  const nearLimit = Boolean(usageSnapshot?.nearLimit);
  const upgradeRecommended = Boolean(usageSnapshot?.upgradeRecommended);

  const quota = usageSnapshot?.quota ?? {};
  const resetHourLocal = usageSnapshot?.resetHourLocal;
  const resetTz = usageSnapshot?.resetTz;

  const planLabel = useMemo(() => {
    if (plan === 'admin') return 'Admin';
    if (plan === 'professional') return 'Pro';
    if (plan === 'amateur') return 'Amateur';
    if (plan === 'trial') return 'Trial';
    return String(plan).slice(0, 1).toUpperCase() + String(plan).slice(1);
  }, [plan]);

  const planBadgeClasses = useMemo(() => {
    if (plan === 'admin') return 'bg-amber-500/15 border-amber-500/25 text-amber-200';
    if (plan === 'professional') return 'bg-purple-500/15 border-purple-500/25 text-purple-200';
    if (plan === 'amateur') return 'bg-indigo-500/15 border-indigo-500/25 text-indigo-200';
    if (plan === 'trial') return 'bg-yellow-500/15 border-yellow-500/25 text-[#E6C77A]';
    return 'bg-slate-900/60 border-slate-700 text-slate-200';
  }, [plan]);

  const pct = useMemo(() => {
    if (!dailyLimit || dailyLimit <= 0) return 0;
    const v = Math.min(100, Math.max(0, (dailyUsed / dailyLimit) * 100));
    return v;
  }, [dailyUsed, dailyLimit]);

  const quotaRow = (label: string, key: string, opts?: { proOnly?: boolean; unit?: string }) => {
    const node = quota?.[key];
    const remaining = node?.remaining;
    const limit = node?.limit;

    const isProOnly = Boolean(opts?.proOnly);
    const locked = isProOnly && plan !== 'professional';

    const display = (() => {
      if (locked) return '🔒 Pro';
      if (typeof remaining === 'number' && typeof limit === 'number') return `${remaining} / ${limit}${opts?.unit ? ` ${opts.unit}` : ''}`;
      if (typeof remaining === 'number') return `${remaining}${opts?.unit ? ` ${opts.unit}` : ''}`;
      return '—';
    })();

    const exhausted = !locked && typeof remaining === 'number' && remaining <= 0;

    return (
      <div className="flex items-center justify-between gap-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm text-slate-200 truncate">{label}</span>
          {exhausted && (
            <span className="text-[11px] px-2 py-0.5 rounded-full border border-rose-400/25 bg-rose-500/10 text-rose-200">
              0 remaining
            </span>
          )}
          {locked && (
            <span className="text-[11px] px-2 py-0.5 rounded-full border border-amber-400/20 bg-amber-500/10 text-amber-200">
              Pro-only
            </span>
          )}
        </div>
        <div className="text-sm font-semibold text-slate-100 tabular-nums">{display}</div>
      </div>
    );
  };

  return (
    <section className={`rounded-2xl border border-white/10 bg-white/5 shadow-sm transition-all duration-300 ${open ? 'ring-1 ring-white/10' : 'hover:bg-white/[0.06]'}`}>
      <button
        type="button"
        className="w-full flex items-center justify-between gap-3 px-4 py-3 transition-colors rounded-2xl"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="text-sm font-semibold text-slate-100">Usage &amp; Limits</div>
          <span className={`text-[11px] px-2 py-0.5 rounded-full border ${planBadgeClasses}`}>
            {planLabel}
          </span>
          {(nearLimit || upgradeRecommended) && (
            <span className="text-[11px] px-2 py-0.5 rounded-full border border-[#E6C77A]/25 bg-[#E6C77A]/10 text-[#E6C77A]">
              Upgrade recommended
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onRequestUpgrade && (nearLimit || upgradeRecommended) && (
            <span className="hidden sm:inline text-xs text-slate-200/80">More capacity →</span>
          )}
          <span className="text-xs text-slate-300/80">{open ? 'Hide' : 'Show'}</span>
          <svg
            className={`w-4 h-4 text-slate-300/70 transition-transform duration-300 ${open ? 'rotate-180' : 'rotate-0'}`}
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08z" clipRule="evenodd" />
          </svg>
        </div>
      </button>

      <div
        className={`px-4 border-t border-white/10 overflow-hidden transition-[max-height,opacity] duration-300 ease-out ${open ? 'max-h-[680px] opacity-100 pb-4 pt-1' : 'max-h-0 opacity-0 pb-0 pt-0'}`}
      >
          {error ? (
            <div className="mt-3 rounded-xl border border-rose-400/15 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
              Usage unavailable: <span className="text-rose-100/80">{error}</span>
            </div>
          ) : (
            <>
              <div className="mt-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-slate-300">Daily AI usage</div>
                  <div className="text-xs text-slate-300/80 tabular-nums">
                    {dailyUsed} used • {dailyRemaining} remaining
                  </div>
                </div>
                <div className="mt-2 h-2 rounded-full bg-black/30 overflow-hidden border border-white/10">
                  <div
                    className="h-full bg-white/30"
                    style={{ width: `${pct}%` }}
                    aria-label="Daily usage progress"
                  />
                </div>
                <div className="mt-1 text-[11px] text-slate-300/70">
                  Limit: {dailyLimit || '—'} • Burst: {usageSnapshot?.burstRemaining ?? '—'} / {usageSnapshot?.burstLimit ?? '—'}
                </div>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-slate-300">Monthly tool quotas</div>
                  {(resetHourLocal != null && resetTz) && (
                    <div className="text-[11px] text-slate-300/70">
                      Resets daily at {resetHourLocal}:00 ({resetTz})
                    </div>
                  )}
                </div>

                <div className="mt-2 divide-y divide-white/10">
                  {quotaRow('Live Rehearsal (Audio)', 'live_audio_minutes', { unit: 'min' })}
                  {quotaRow('Image Generation', 'image_gen')}
                  {quotaRow('Identify a Trick', 'identify')}
                  {quotaRow('Video Rehearsal Uploads', 'video_uploads', { proOnly: true })}
                </div>

                {onRequestUpgrade && (
                  <div className="mt-4 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={onRequestUpgrade}
                      className="px-4 py-2 rounded-xl border border-[#E6C77A]/25 bg-[#E6C77A]/10 text-[#E6C77A] text-sm font-semibold hover:bg-[#E6C77A]/15 transition-colors"
                    >
                      Upgrade
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
      </div>
    </section>
  );
}
