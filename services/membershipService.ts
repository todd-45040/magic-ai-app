import type { Membership } from '../types';

export type CanonicalTier = 'trial' | 'performer' | 'professional' | 'expired' | 'free';

/**
 * Normalize legacy membership labels into the canonical tiers used by the app.
 */
export function normalizeTier(m?: Membership | string | null): CanonicalTier {
  const raw = (m || '').toString();
  switch (raw) {
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
  return tier === 'performer' || tier === 'professional';
}

export function isTrialTier(tier: CanonicalTier): boolean {
  return tier === 'trial';
}

export function isExpired(tier: CanonicalTier): boolean {
  return tier === 'expired';
}
