import type { User, Membership } from '../types';

const TIER_LIMITS: Record<Membership, number> = {
  free: 10,
  trial: 100,
  amateur: 50,
  'semi-pro': 200,
  professional: 10000, // effectively unlimited
  expired: 0,
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
  const membership = user.membership || 'trial';
  const limit = TIER_LIMITS[membership] ?? TIER_LIMITS.trial;

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
  return TIER_LIMITS[membership] ?? TIER_LIMITS.trial;
};
