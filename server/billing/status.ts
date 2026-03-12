/**
 * Billing status is the server source of truth for current access.
 * Checkout return URLs are informational only and must never grant entitlements.
 * Future live billing changes reconcile through webhook processing.
 */

import type { BillingPlanKey } from '../../services/planCatalog.js';
import { BILLING_PLAN_CATALOG } from '../../services/planCatalog.js';
import { deriveFounderProtection } from './founderProtection.js';
import { resolveBillingPlan } from './planMapping.js';
import { getBillingConfig } from './billingConfig.js';

export type BillingStatusResponse = {
  ok: true;
  membershipTier: BillingPlanKey;
  subscriptionStatus: string;
  accessState: string;
  renewalDate: string | null;
  cancelAtPeriodEnd: boolean;
  founderProtected: boolean;
  founderLockedPlan: BillingPlanKey | null;
  founderLockedPriceCents: number | null;
  usagePeriodStart: string | null;
  usagePeriodEnd: string | null;
  upgradeTargets: BillingPlanKey[];
  stripeConfigured: boolean;
  billingCustomerExists: boolean;
  stripeCustomerIdPresent: boolean;
  source: 'database' | 'fallback';
};

function asIso(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(value as any);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function normalizeProfileMembership(value: unknown): BillingPlanKey {
  const raw = String(value || '').trim();
  if (raw === 'amateur') return 'amateur';
  if (raw === 'professional') return 'professional';
  return 'free';
}

async function maybeSelectSingle(query: Promise<any>) {
  try {
    const { data, error } = await query;
    if (error) return null;
    return data || null;
  } catch {
    return null;
  }
}

export async function resolveBillingStatusForUser(admin: any, userId: string): Promise<BillingStatusResponse> {
  const config = getBillingConfig();

  const [profile, billingCustomer, subscription, usagePeriod, founderOverride] = await Promise.all([
    maybeSelectSingle(
      admin.from('users')
        .select('id, membership, is_admin, pricing_lock, founding_bucket, founding_circle_member')
        .eq('id', userId)
        .maybeSingle()
    ),
    maybeSelectSingle(
      admin.from('billing_customers')
        .select('id, stripe_customer_id, provider_status')
        .eq('user_id', userId)
        .maybeSingle()
    ),
    maybeSelectSingle(
      admin.from('subscriptions')
        .select('id, plan_key, billing_status, current_period_start, current_period_end, cancel_at_period_end, founder_locked_price, founder_locked_plan, stripe_subscription_id')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    ),
    maybeSelectSingle(
      admin.from('usage_periods')
        .select('id, plan_key, period_start, period_end')
        .eq('user_id', userId)
        .order('period_start', { ascending: false })
        .limit(1)
        .maybeSingle()
    ),
    maybeSelectSingle(
      admin.from('founder_overrides')
        .select('locked_plan_key, locked_price_cents, pricing_lock, founder_bucket, override_active')
        .eq('user_id', userId)
        .maybeSingle()
    ),
  ]);

  const founderProtection = deriveFounderProtection({
    user: profile || undefined,
    subscription: subscription || undefined,
    founderOverride: founderOverride || undefined,
  });

  const fallbackMembershipTier = founderProtection.lockedPlan || normalizeProfileMembership(profile?.membership);
  const resolved = resolveBillingPlan({
    membershipTier: (subscription?.plan_key as BillingPlanKey | null) || fallbackMembershipTier,
    subscriptionStatus: subscription?.billing_status || (fallbackMembershipTier === 'free' ? 'unknown' : 'active'),
    cancelAtPeriodEnd: Boolean(subscription?.cancel_at_period_end),
    currentPeriodEnd: subscription?.current_period_end || null,
    founderLockedPlan: founderProtection.lockedPlan,
  });

  const effectiveMembershipTier = resolved.keepAccess
    ? resolved.membershipTier
    : (founderProtection.lockedPlan || 'free');

  const membershipDefinition = BILLING_PLAN_CATALOG[effectiveMembershipTier] || BILLING_PLAN_CATALOG.free;
  const upgradeTargets = (membershipDefinition.allowedUpgrades || []).filter((membershipTier) => {
    if (membershipTier === 'founder_professional') return founderProtection.founderProtected;
    return true;
  });

  return {
    ok: true,
    membershipTier: effectiveMembershipTier,
    subscriptionStatus: resolved.subscriptionStatus,
    accessState: resolved.accessState,
    renewalDate: asIso(subscription?.current_period_end),
    cancelAtPeriodEnd: Boolean(subscription?.cancel_at_period_end),
    founderProtected: founderProtection.founderProtected,
    founderLockedPlan: founderProtection.lockedPlan,
    founderLockedPriceCents: founderProtection.lockedPriceCents,
    usagePeriodStart: asIso(usagePeriod?.period_start),
    usagePeriodEnd: asIso(usagePeriod?.period_end),
    upgradeTargets,
    stripeConfigured: config.stripeConfigured,
    billingCustomerExists: Boolean(billingCustomer?.id),
    stripeCustomerIdPresent: Boolean(String(billingCustomer?.stripe_customer_id || '').trim()),
    source: subscription || billingCustomer || usagePeriod || founderOverride ? 'database' : 'fallback',
  };
}
