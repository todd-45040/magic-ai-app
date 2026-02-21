import type { Membership, User } from '../types';

export type CanonicalTier = 'trial' | 'performer' | 'professional' | 'admin' | 'expired' | 'free';

/**
 * Normalize legacy membership labels into the canonical tiers used by the app.
 */
export function normalizeTier(m?: Membership | string | null): CanonicalTier {
  const raw = (m || '').toString();
  switch (raw) {
    case 'admin':
      return 'admin';
    case 'professional':
      return 'professional';
    case 'performer':
      return 'performer';
    // Legacy tiers (older builds)
    case 'amateur':
    case 'semi-pro':
      return 'performer';
    case 'expired':
      return 'expired';
    case 'trial':
      return 'trial';
    case 'free':
    default:
      return 'free';
  }
}

export function isPaidTier(tier: CanonicalTier): boolean {
  return tier === 'performer' || tier === 'professional' || tier === 'admin';
}

export function isTrialTier(tier: CanonicalTier): boolean {
  return tier === 'trial';
}

export function isExpired(tier: CanonicalTier): boolean {
  return tier === 'expired';
}

/**
 * Returns days remaining for time-limited memberships (currently Trial).
 * For non-expiring tiers, returns null.
 */
export function getMembershipDaysRemaining(user?: User | null): number | null {
  if (!user) return null;

  const tier = normalizeTier(user.membership);
  if (tier !== 'trial') return null;

  if (!user.trialEndDate) return null;
  const ms = user.trialEndDate - Date.now();
  // If already expired, clamp to 0 so UI can show "0 days left"
  if (ms <= 0) return 0;

  const dayMs = 24 * 60 * 60 * 1000;
  return Math.ceil(ms / dayMs);
}

export function formatTierLabel(tier: CanonicalTier): string {
  switch (tier) {
    case 'admin':
      return 'Admin';
    case 'trial':
      return 'Trial';
    case 'performer':
      return 'Performer';
    case 'professional':
      return 'Professional';
    case 'expired':
      return 'Expired';
    case 'free':
    default:
      return 'Free';
  }
}
