import type { Membership, User } from '../types';

export type CanonicalTier = 'trial' | 'amateur' | 'professional' | 'admin' | 'expired' | 'free';

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
    case 'amateur':
      return 'amateur';
    case 'performer':
    case 'semi-pro':
      // legacy tiers
      return 'amateur';
    case 'expired':
      return 'expired';
    case 'trial':
      return 'trial';
    case 'free':
    default:
      return 'free';
  }
}


export function isActiveTrialUser(user?: User | null): boolean {
  if (!user || user.isAdmin) return false;
  const tier = normalizeTier(user.membership);
  if (tier !== 'trial') return false;
  if (typeof user.trialEndDate !== 'number' || !Number.isFinite(user.trialEndDate)) {
    return false;
  }
  return user.trialEndDate > Date.now();
}

export function hasExpiredTrial(user?: User | null): boolean {
  if (!user || user.isAdmin) return false;
  const tier = normalizeTier(user.membership);
  return tier === 'trial' && typeof user.trialEndDate === 'number' && Number.isFinite(user.trialEndDate) && user.trialEndDate <= Date.now();
}

export function hasActivePaidSubscription(user?: User | null): boolean {
  if (!user) return false;
  const status = String((user as any).stripeStatus || (user as any).stripe_status || '').trim().toLowerCase();
  const hasStripeIdentity = Boolean(
    (user as any).stripeSubscriptionId ||
    (user as any).stripe_subscription_id ||
    (user as any).stripeCustomerId ||
    (user as any).stripe_customer_id
  );
  return hasStripeIdentity && (status === 'active' || status === 'trialing');
}

export function getEffectiveMembership(user?: User | null): CanonicalTier {
  if (!user) return 'free';
  const tier = normalizeTier(user.membership);
  if (tier === 'admin') return 'admin';

  // Billing/access source of truth:
  // - active trial_end_date grants Professional access during partner/free trials
  // - active Stripe subscription grants paid access even if UI state is stale immediately after checkout
  if (isActiveTrialUser(user)) return 'professional';
  if (hasActivePaidSubscription(user)) {
    if (tier === 'amateur' || tier === 'professional') return tier;
    return 'professional';
  }

  if (tier === 'professional' || tier === 'amateur') {
    return tier;
  }
  return 'free';
}

export function getEffectiveMembershipTier(user?: User | null): CanonicalTier {
  return getEffectiveMembership(user);
}

export function isPaidTier(tier: CanonicalTier): boolean {
  return tier === 'amateur' || tier === 'professional' || tier === 'admin';
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
    case 'amateur':
      return 'Amateur';
    case 'professional':
      return 'Professional';
    case 'expired':
      return 'Expired';
    case 'free':
    default:
      return 'Free';
  }
}
