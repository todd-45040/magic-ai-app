import type { BillingPlanKey } from '../../services/planCatalog.js';
import { BILLING_PLAN_CATALOG } from '../../services/planCatalog.js';
import { deriveFounderProtection } from './founderProtection.js';
import { resolveBillingPlan } from './planMapping.js';
import { getBillingConfig, type BillingCheckoutLookupKey } from './billingConfig.js';

export type BillingStatusResponse = {
  ok: true;
  planKey: BillingPlanKey;
  billingStatus: string;
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
  currentBillingCycle: 'monthly' | 'yearly';
  currentPriceId: string | null;
  source: 'database' | 'fallback';
  billingReadiness: {
    expectedWebhookPath: string;
    expectedWebhookUrl: string;
    missingEnvKeys: string[];
    configuredPriceKeys: string[];
    missingPriceKeys: string[];
    hasPublishableKey: boolean;
    hasWebhookSecret: boolean;
    hasServerSecretKey: boolean;
  };
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

function normalizeBillingPlanKey(value: unknown): BillingPlanKey | null {
  const raw = String(value || '').trim();
  if (raw === 'free' || raw === 'amateur' || raw === 'founder_amateur' || raw === 'professional' || raw === 'founder_professional') {
    return raw as BillingPlanKey;
  }
  return null;
}


function inferBillingCycleFromLookupKey(lookupKey: BillingCheckoutLookupKey | null): 'monthly' | 'yearly' | null {
  if (!lookupKey) return null;
  return lookupKey.endsWith('_yearly') ? 'yearly' : 'monthly';
}

function findConfiguredLookupKeyForPriceId(
  priceId: string | null,
  priceLookup: Record<BillingCheckoutLookupKey, { stripePriceEnvKey: string; stripePriceEnvFallbackKey?: string }>,
  env: NodeJS.ProcessEnv = process.env,
): BillingCheckoutLookupKey | null {
  const normalizedPriceId = String(priceId || '').trim();
  if (!normalizedPriceId) return null;

  for (const [lookupKey, config] of Object.entries(priceLookup) as Array<[BillingCheckoutLookupKey, { stripePriceEnvKey: string; stripePriceEnvFallbackKey?: string }]>) {
    const primaryPriceId = String(env?.[config.stripePriceEnvKey] || '').trim();
    if (primaryPriceId && primaryPriceId === normalizedPriceId) {
      return lookupKey;
    }

    const fallbackPriceId = config.stripePriceEnvFallbackKey
      ? String(env?.[config.stripePriceEnvFallbackKey] || '').trim()
      : '';
    if (fallbackPriceId && fallbackPriceId === normalizedPriceId) {
      return lookupKey;
    }
  }

  return null;
}

function inferBillingCycleFromPeriod(start: unknown, end: unknown): 'monthly' | 'yearly' | null {
  const startMs = start ? new Date(start as any).getTime() : NaN;
  const endMs = end ? new Date(end as any).getTime() : NaN;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return null;
  }

  const days = (endMs - startMs) / (1000 * 60 * 60 * 24);
  if (days >= 300) return 'yearly';
  if (days >= 20 && days <= 45) return 'monthly';
  return null;
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
        .select('id, membership, is_admin, pricing_lock, founding_bucket, founding_circle_member, stripe_price_id')
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
        .select('id, plan_key, billing_status, current_period_start, current_period_end, cancel_at_period_end, founder_locked_price, founder_locked_plan, stripe_subscription_id, price_id')
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

  const profilePlan = normalizeProfileMembership(profile?.membership);
  const subscriptionPlan = normalizeBillingPlanKey(subscription?.plan_key);
  const hasSubscriptionSignal = Boolean(
    subscriptionPlan ||
    String(subscription?.stripe_subscription_id || '').trim() ||
    String(subscription?.billing_status || '').trim() ||
    subscription?.id
  );

  const resolved = resolveBillingPlan({
    planKey: subscriptionPlan || (!hasSubscriptionSignal ? profilePlan : 'free'),
    billingStatus: subscription?.billing_status || (!hasSubscriptionSignal && profilePlan !== 'free' ? 'active' : 'unknown'),
    cancelAtPeriodEnd: Boolean(subscription?.cancel_at_period_end),
    currentPeriodEnd: subscription?.current_period_end || null,
    // Founder protection must not be treated as an active paid entitlement fallback.
    // It remains an eligibility/pricing overlay that survives independently of subscription state.
    founderLockedPlan: null,
  });

  const effectivePlanKey = resolved.keepAccess
    ? resolved.planKey
    : 'free';

  const planDef = BILLING_PLAN_CATALOG[effectivePlanKey] || BILLING_PLAN_CATALOG.free;
  const upgradeTargets = planDef.allowedUpgrades || [];

  const currentPriceId =
    String(subscription?.price_id || profile?.stripe_price_id || '').trim() || null;

  const configuredLookupKey = findConfiguredLookupKeyForPriceId(currentPriceId, config.priceLookup);
  const currentBillingCycle: 'monthly' | 'yearly' =
    inferBillingCycleFromLookupKey(configuredLookupKey)
    ?? inferBillingCycleFromPeriod(subscription?.current_period_start, subscription?.current_period_end)
    ?? 'monthly';

  return {
    ok: true,
    planKey: effectivePlanKey,
    billingStatus: resolved.billingStatus,
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
    currentBillingCycle,
    currentPriceId,
    source: subscription || billingCustomer || usagePeriod || founderOverride ? 'database' : 'fallback',
    billingReadiness: config.readiness,
  };
}
