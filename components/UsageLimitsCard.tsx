import React, { useMemo, useState } from 'react';
import { getUpgradeUxCopy } from '../services/upgradeUx';

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
  const monthlyResetAt = usageSnapshot?.quota?.nextResetAt ?? usageSnapshot?.quota?.resetAt ?? null;

  const shouldShowUpgrade = Boolean(onRequestUpgrade) && plan !== 'professional' && plan !== 'admin' && (nearLimit || upgradeRecommended);
  const upgradeCopy = useMemo(() => getUpgradeUxCopy(nearLimit || upgradeRecommended ? 'upgrade_available' : 'limit_reached', { targetPlan: plan === 'free' || plan === 'trial' ? 'Amateur' : 'Professional' }), [nearLimit, upgradeRecommended, plan]);

  const planLabel = useMemo(() => {
    if (plan === 'admin') return 'Admin';
    if (plan === 'professional') return 'Professional';
    if (plan === 'amateur') return 'Amateur';
    if (plan === 'trial') return '14-Day Trial';
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
    if (node?.hidden) return null;
    const remaining = node?.remaining;
    const limit = node?.limit;
    const daily = node?.daily;

    const resolvedLabel = key === 'image_gen' && plan === 'amateur' ? 'Visual Brainstorm' : label;
    const isProOnly = Boolean(opts?.proOnly);
    const locked = isProOnly && plan !== 'professional';
    const isUnlimited = !locked && ((typeof limit === 'number' && limit >= 9999) || (typeof remaining === 'number' && remaining >= 9999));
    const isNotTrackedYet = Boolean(node?.tracked === false);
    const hasDaily = daily && typeof daily?.used === 'number' && typeof daily?.limit === 'number';
    const dailyRemaining = hasDaily && typeof daily?.remaining === 'number'
      ? Number(daily.remaining)
      : hasDaily
        ? Math.max(0, Number(daily.limit) - Number(daily.used))
        : null;
    const monthlyRemaining = typeof remaining === 'number' ? Number(remaining) : null;

    const display = (() => {
      if (locked) return '🔒 Pro';
      if (isUnlimited) return 'Unlimited';
      if (isNotTrackedYet) return 'Not tracked yet';
      if (hasDaily) {
        return `${daily.used} / ${daily.limit}${opts?.unit ? ` ${opts.unit}` : ''}`;
      }
      if (typeof remaining === 'number' && typeof limit === 'number') return `${remaining} / ${limit}${opts?.unit ? ` ${opts.unit}` : ''}`;
      if (typeof remaining === 'number') return `${remaining}${opts?.unit ? ` ${opts.unit}` : ''}`;
      return '—';
    })();

    const exhausted = !locked && !isUnlimited && !isNotTrackedYet && (
      hasDaily
        ? (dailyRemaining ?? 0) <= 0
        : (typeof remaining === 'number' && remaining <= 0)
    );
    const exhaustedLabel = hasDaily ? 'Daily remaining: 0' : (plan === 'trial' ? 'Trial remaining: 0' : 'Monthly remaining: 0');
    const progressPct = hasDaily && typeof daily?.limit === 'number' && daily.limit > 0 && typeof daily?.used === 'number'
      ? Math.min(100, Math.max(0, (daily.used / daily.limit) * 100))
      : null;

    return (
      <div className="flex items-start justify-between gap-3 py-2.5">
        <div className="flex flex-col gap-1.5 min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <span className="text-sm text-slate-200 truncate">{resolvedLabel}</span>
          {exhausted && (
            <span className="text-[11px] px-2 py-0.5 rounded-full border border-rose-400/25 bg-rose-500/10 text-rose-200">
              {exhaustedLabel}
            </span>
          )}
          {!hasDaily && monthlyRemaining !== null && monthlyRemaining <= 0 && !exhausted && (
            <span className="text-[11px] px-2 py-0.5 rounded-full border border-slate-400/20 bg-slate-500/10 text-slate-200">
              {plan === 'trial' ? 'Trial remaining: 0' : 'Monthly remaining: 0'}
            </span>
          )}
          {locked && (
            <span className="text-[11px] px-2 py-0.5 rounded-full border border-amber-400/20 bg-amber-500/10 text-amber-200">
              Pro-only
            </span>
          )}
          </div>

          {isUnlimited ? (
            <div className="text-[12px] text-slate-400">Unlimited</div>
          ) : isNotTrackedYet ? (
            <div className="text-[12px] text-slate-400/70">Usage tracking coming soon</div>
          ) : hasDaily ? (
            <>
              <div className="text-[12px] text-slate-400">
                Daily: <span className="tabular-nums text-slate-300">{daily.used}</span> / <span className="tabular-nums">{daily.limit}</span>{opts?.unit ? ` ${opts.unit}` : ''}
                {key === 'image_gen' && monthlyRemaining !== null && typeof limit === 'number' ? (
                  <span className="ml-2 text-slate-500">• {plan === 'trial' ? 'Trial remaining' : 'Monthly remaining'}: <span className="tabular-nums text-slate-300">{monthlyRemaining}</span> / <span className="tabular-nums">{limit}</span></span>
                ) : null}
              </div>
              {(key === 'live_audio_minutes' || key === 'image_gen') && progressPct !== null && (
                <div className="h-1.5 max-w-[400px] rounded-full bg-black/20 overflow-hidden border border-white/5">
                  <div className="h-full bg-white/20" style={{ width: `${progressPct}%` }} aria-hidden="true" />
                </div>
              )}
            </>
          ) : null}
        </div>
        <div className={`text-[15px] font-semibold tabular-nums ${isNotTrackedYet ? 'text-slate-50/95' : 'text-slate-50'}`}>{display}</div>
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
              Upgrade available
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {shouldShowUpgrade && (
            <span className="hidden sm:inline text-xs text-slate-200/80">Upgrade available →</span>
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

              {Array.isArray((usageSnapshot as any)?.warnings) && (usageSnapshot as any).warnings.length > 0 && (
                <div className="mt-3 rounded-xl border border-[#E6C77A]/20 bg-[#E6C77A]/10 px-3 py-2 text-sm text-[#E6C77A]">
                  {(usageSnapshot as any).warnings.slice(0, 2).join(' ')}
                </div>
              )}

              <div className="mt-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-slate-300">Tool usage</div>
                  <div className="text-[11px] text-slate-300/70 text-right">
                    {(resetHourLocal != null && resetTz) ? `Daily AI resets at ${resetHourLocal}:00 (${resetTz})` : 'Daily AI usage resets each day'}
                    {plan !== 'trial' && monthlyResetAt ? <span className="block">Monthly limits reset {new Date(monthlyResetAt).toLocaleDateString()}</span> : null}
                  </div>
                </div>

                <div className="mt-2 divide-y divide-white/10">
                  {quotaRow('Live Rehearsal (Audio)', 'live_audio_minutes', { unit: 'min' })}
                  {quotaRow(plan === 'amateur' ? 'Visual Brainstorm' : 'Image Generation', 'image_gen')}
                  {quotaRow('Identify a Trick', 'identify')}
                  {quotaRow('Video Rehearsal Uploads', 'video_uploads')}
                </div>

                {shouldShowUpgrade && (
                  <div className="mt-4 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={onRequestUpgrade}
                      className="px-4 py-2 rounded-xl border border-[#E6C77A]/25 bg-[#E6C77A]/10 text-[#E6C77A] text-sm font-semibold hover:bg-[#E6C77A]/15 transition-colors"
                    >
                      {upgradeCopy.primaryCta}
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
