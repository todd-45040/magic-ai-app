import type { User, Membership } from '../types';
import { normalizeTier } from './membershipService';

// Text-generation ("AI requests") daily limits.
// NOTE: Other tool-type caps (video/image/live minutes) are tracked client-side
// in services/usageTracker.ts.
const TIER_LIMITS: Record<string, number> = {
  free: 10,
  trial: 20,
  performer: 100,
  professional: 10000, // effectively unlimited (fair use)
  expired: 0,
  // legacy
  amateur: 100,
  'semi-pro': 100,
};

function getTodayKeyUTC(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Client-side helper (for UI display).
 * The hard enforcement happens on the serverless /api/* endpoints.
 */
export const checkUsage = async (
  user: User
): Promise<{ canProceed: boolean; remaining: number; limit: number }> => {
  const tier = normalizeTier(user.membership);
  const limit = TIER_LIMITS[tier] ?? TIER_LIMITS.trial;

  const today = getTodayKeyUTC();
  const lastKey = getTodayKeyUTC(new Date(user.lastResetDate || new Date().toISOString()));

  const count = lastKey !== today ? 0 : (user.generationCount ?? 0);
  const remaining = Math.max(0, limit - count);

  return { canProceed: remaining > 0, remaining, limit };
};

/**
 * Kept for backwards compatibility; server enforces usage and increments.
 * You can use this later if you add a Supabase RPC to increment usage client-side.
 */
export const incrementUsage = async (_userId: string, _units = 1) => {
  return;
};

export const getTierLimit = (membership: Membership): number => {
  const tier = normalizeTier(membership);
  return TIER_LIMITS[tier] ?? TIER_LIMITS.trial;
};
