import React, { useEffect, useMemo } from 'react';
import type { User } from '../types';
import { getMembershipDaysRemaining, hasExpiredTrial, isActiveTrialUser } from '../services/membershipService';
import { getPartnerTrialBadgeLabel, isPartnerTrialUser } from '../services/trialMessaging';
import { logIbmConversionEvent } from '../services/ibmConversionTracking';

interface Props {
  user: User | null;
  onUpgrade: () => void;
  compact?: boolean;
}

function getTrialEndLabel(user?: User | null): string {
  const value = Number(user?.trialEndDate || 0);
  if (!Number.isFinite(value) || value <= 0) return 'Trial date unavailable';
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(value));
  } catch {
    return new Date(value).toLocaleDateString();
  }
}

function getProgress(daysRemaining: number | null, requestedDays: number | undefined): number {
  const totalDays = Math.max(1, Number(requestedDays || 30));
  if (daysRemaining == null) return 0;
  const elapsed = Math.max(0, totalDays - daysRemaining);
  return Math.min(100, Math.round((elapsed / totalDays) * 100));
}

export default function TrialCountdownCard({ user, onUpgrade, compact = false }: Props) {
  const isPartnerTrial = isPartnerTrialUser(user);
  const activeTrial = isActiveTrialUser(user);
  const expiredTrial = hasExpiredTrial(user);
  const daysRemaining = getMembershipDaysRemaining(user);
  const requestedDays = Number((user as any)?.requestedTrialDays || 30);
  const progress = useMemo(() => getProgress(daysRemaining, requestedDays), [daysRemaining, requestedDays]);

  useEffect(() => {
    if (!user || !isPartnerTrial || (!activeTrial && !expiredTrial)) return;
    void logIbmConversionEvent(user, 'upgrade_prompt_viewed', {
      location: compact ? 'trial_countdown_compact' : 'trial_countdown_card',
      days_remaining: daysRemaining,
      trial_expired: expiredTrial,
    });
  }, [user?.email, user?.trialEndDate, isPartnerTrial, activeTrial, expiredTrial, daysRemaining, compact]);

  if (!user || !isPartnerTrial || (!activeTrial && !expiredTrial)) return null;

  const danger = expiredTrial || (daysRemaining != null && daysRemaining <= 3);
  const label = getPartnerTrialBadgeLabel(user);
  const headline = expiredTrial
    ? 'Your Professional Trial has ended'
    : daysRemaining === 1
      ? '1 day left in your Professional Trial'
      : `${daysRemaining ?? '—'} days left in your Professional Trial`;

  return (
    <div className={`rounded-2xl border ${danger ? 'border-amber-400/40 bg-amber-500/10' : 'border-fuchsia-400/30 bg-fuchsia-500/10'} ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white/80">
              {label}
            </span>
            <span className="text-xs text-white/55">Ends {getTrialEndLabel(user)}</span>
          </div>
          <div className="text-sm font-bold text-white sm:text-base">{headline}</div>
          <div className="mt-1 text-sm text-white/70">
            Keep your saved ideas, rehearsal work, and show-planning workflow active by choosing a paid plan before access changes.
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-950/60">
            <div
              className={`h-full rounded-full ${danger ? 'bg-amber-300' : 'bg-fuchsia-300'}`}
              style={{ width: `${progress}%` }}
              aria-hidden="true"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            void logIbmConversionEvent(user, 'upgrade_clicked', {
              location: 'trial_countdown_card',
              days_remaining: daysRemaining,
              trial_expired: expiredTrial,
            });
            onUpgrade();
          }}
          className={`shrink-0 rounded-xl px-4 py-2 text-sm font-bold transition ${danger ? 'bg-amber-400 text-slate-950 hover:bg-amber-300' : 'bg-fuchsia-500 text-white hover:bg-fuchsia-400'}`}
        >
          {expiredTrial ? 'Reactivate access' : 'Keep full access'}
        </button>
      </div>
    </div>
  );
}
