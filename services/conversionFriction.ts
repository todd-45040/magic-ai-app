import type { User } from '../types';
import { normalizeTier, isActiveTrialUser } from './membershipService';
import { logEvent } from './analyticsService';

export const FRICTION_LIMITS = {
  freeDailyTextGenerations: 3,
  trialDailyTextGenerations: 10,
  freeSavedIdeas: 1,
  trialSavedIdeas: 1,
  trialLiveRehearsalMinutesDaily: 10,
  freeLiveRehearsalMinutesDaily: 0,
} as const;

export type FrictionReason =
  | 'daily_ai_limit'
  | 'saved_idea_limit'
  | 'live_rehearsal_limit'
  | 'locked_feature';

export class ConversionFrictionError extends Error {
  reason: FrictionReason;
  metadata: Record<string, any>;

  constructor(reason: FrictionReason, message: string, metadata: Record<string, any> = {}) {
    super(message);
    this.name = 'ConversionFrictionError';
    this.reason = reason;
    this.metadata = metadata;
  }
}

export function isConversionFrictionError(error: unknown): error is ConversionFrictionError {
  return Boolean(error && typeof error === 'object' && (error as any).name === 'ConversionFrictionError');
}

export function getFrictionTier(user?: User | null): 'free' | 'trial' | 'paid' | 'admin' | 'expired' {
  if (!user) return 'free';
  if (user.isAdmin) return 'admin';
  const tier = normalizeTier(user.membership as any);
  if (tier === 'admin') return 'admin';
  if (tier === 'professional' || tier === 'amateur') return 'paid';
  if (tier === 'trial') return isActiveTrialUser(user) ? 'trial' : 'expired';
  if (tier === 'expired') return 'expired';
  return 'free';
}

export function getDailyTextGenerationLimitForFriction(user?: User | null): number {
  const tier = getFrictionTier(user);
  if (tier === 'admin') return Number.MAX_SAFE_INTEGER;
  if (tier === 'paid') return 10000;
  if (tier === 'trial') return FRICTION_LIMITS.trialDailyTextGenerations;
  if (tier === 'expired') return 0;
  return FRICTION_LIMITS.freeDailyTextGenerations;
}

export function getSavedIdeaLimitForFriction(user?: User | null): number {
  const tier = getFrictionTier(user);
  if (tier === 'admin' || tier === 'paid') return Number.MAX_SAFE_INTEGER;
  if (tier === 'trial') return FRICTION_LIMITS.trialSavedIdeas;
  if (tier === 'expired') return 0;
  return FRICTION_LIMITS.freeSavedIdeas;
}

export function getLiveRehearsalMinuteLimitForFriction(user?: User | null): number {
  const tier = getFrictionTier(user);
  if (tier === 'admin') return Number.MAX_SAFE_INTEGER;
  if (tier === 'paid') return 60;
  if (tier === 'trial') return FRICTION_LIMITS.trialLiveRehearsalMinutesDaily;
  return 0;
}

export function getSavedIdeaLimitMessage(existingCount: number, limit: number): string {
  if (limit <= 0) {
    return 'Saving ideas is locked on your current access level. Upgrade to start building your saved magic system.';
  }
  return `Your first saved idea is free. You have ${existingCount} saved idea${existingCount === 1 ? '' : 's'} and have reached the ${limit}-idea trial limit. Upgrade to unlock unlimited saved routines.`;
}

export function dispatchConversionFrictionUpgrade(reason: FrictionReason, metadata: Record<string, any> = {}) {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('maw:conversion-friction-upgrade', { detail: { reason, ...metadata } }));
    }
  } catch {
    // ignore browser event failures
  }
}

export function recordConversionFriction(reason: FrictionReason, metadata: Record<string, any> = {}) {
  const eventName = reason === 'saved_idea_limit' || reason === 'locked_feature'
    ? 'locked_feature_clicked'
    : 'limit_hit_ai_generation';

  void logEvent(eventName, {
    reason,
    friction_patch: true,
    ...metadata,
  });
  dispatchConversionFrictionUpgrade(reason, metadata);
}


function generationPromptKey(user?: User | null, d = new Date()): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const who = user?.email ? user.email.toLowerCase() : 'anonymous';
  return `maw_friction_generation_prompt_v1:${yyyy}-${mm}-${dd}:${who}`;
}

export function recordTextGenerationSuccessAndMaybePrompt(user: User | null | undefined, source: string) {
  const tier = getFrictionTier(user);
  if (tier !== 'free' && tier !== 'trial') return;

  try {
    if (typeof localStorage === 'undefined') return;
    const key = generationPromptKey(user ?? null);
    const raw = localStorage.getItem(key);
    const state = raw ? JSON.parse(raw) : { count: 0, prompted: false };
    const next = { count: Number(state.count || 0) + 1, prompted: Boolean(state.prompted) };

    if (!next.prompted && next.count >= 2) {
      next.prompted = true;
      void logEvent('conversion_nudge_after_second_generate', {
        source,
        generation_count_today: next.count,
        tier,
        friction_patch: true,
      });
      dispatchConversionFrictionUpgrade('daily_ai_limit', {
        source,
        soft_prompt: true,
        generation_count_today: next.count,
        message: "You're building something real here. Upgrade to keep the creative pipeline moving without daily limits.",
      });
    }

    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // non-critical conversion nudge
  }
}
