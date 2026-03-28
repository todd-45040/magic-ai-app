/**
 * Phase 1 billing freeze scope
 *
 * This module is inside the Stripe-only validation area. Keep auth, DNS,
 * email, and unrelated UI changes out of this file during billing cleanup.
 */
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
  billingTruth: BillingTruthDebug;
};

export type BillingTruthDebug = {
  database: {
    billingCustomer: any | null;
    subscription: any | null;
    usagePeriod: any | null;
    founderOverride: any | null;
  };
  stripe: {
    customerExists: boolean;
    subscriptionExists: boolean;
    customerId: string | null;
    subscriptionId: string | null;
    status: string | null;
    priceId: string | null;
    interval: string | null;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean | null;
    latestInvoiceId: string | null;
    latestInvoiceStatus: string | null;
    latestPaymentIntentStatus: string | null;
    error?: string | null;
  };
  resolved: {
    currentPlan: BillingPlanKey;
    billingState: string;
    accessState: string;
    currentBillingCycle: 'monthly' | 'yearly';
    renewalDate: string | null;
    founderProtected: boolean;
    upgradeTargets: BillingPlanKey[];
  };
  mismatches: {
    planMismatch: boolean;
    statusMismatch: boolean;
    renewalMismatch: boolean;
    cycleMismatch: boolean;
    missingStripeCustomerLink: boolean;
    missingStripeSubscriptionLink: boolean;
    missingDbPeriodDates: boolean;
  };
  nextInspectionFocus: string[];
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


async function fetchStripeBillingSnapshot(stripeCustomerId: string | null, stripeSubscriptionId: string | null): Promise<BillingTruthDebug['stripe']> {
  const secretKey = String(process.env.STRIPE_SECRET_KEY || '').trim();
  const emptySnapshot: BillingTruthDebug['stripe'] = {
    customerExists: false,
    subscriptionExists: false,
    customerId: stripeCustomerId,
    subscriptionId: stripeSubscriptionId,
    status: null,
    priceId: null,
    interval: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: null,
    latestInvoiceId: null,
    latestInvoiceStatus: null,
    latestPaymentIntentStatus: null,
  };

  if (!secretKey) {
    return { ...emptySnapshot, error: 'missing_stripe_secret_key' };
  }

  const authHeader = `Bearer ${secretKey}`;

  async function stripeGet(path: string) {
    const response = await fetch(`https://api.stripe.com${path}`, {
      method: 'GET',
      headers: {
        Authorization: authHeader,
      },
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message = typeof payload?.error?.message === 'string'
        ? payload.error.message
        : `stripe_http_${response.status}`;
      throw new Error(message);
    }

    return payload;
  }

  try {
    let customer: any = null;
    if (stripeCustomerId) {
      customer = await stripeGet(`/v1/customers/${encodeURIComponent(stripeCustomerId)}`);
    }

    let subscription: any = null;
    if (stripeSubscriptionId) {
      subscription = await stripeGet(`/v1/subscriptions/${encodeURIComponent(stripeSubscriptionId)}?expand[]=latest_invoice.payment_intent`);
    } else if (stripeCustomerId) {
      const list = await stripeGet(`/v1/subscriptions?customer=${encodeURIComponent(stripeCustomerId)}&status=all&limit=1&expand[]=data.latest_invoice.payment_intent`);
      subscription = Array.isArray(list?.data) ? (list.data[0] || null) : null;
    }

    const latestInvoice = subscription?.latest_invoice || null;
    const paymentIntent = latestInvoice?.payment_intent || null;

    return {
      customerExists: Boolean(customer?.id),
      subscriptionExists: Boolean(subscription?.id),
      customerId: customer?.id || stripeCustomerId || null,
      subscriptionId: subscription?.id || stripeSubscriptionId || null,
      status: subscription?.status || null,
      priceId: subscription?.items?.data?.[0]?.price?.id || null,
      interval: subscription?.items?.data?.[0]?.price?.recurring?.interval || null,
      currentPeriodStart: asIso(subscription?.current_period_start ? subscription.current_period_start * 1000 : null),
      currentPeriodEnd: asIso(subscription?.current_period_end ? subscription.current_period_end * 1000 : null),
      cancelAtPeriodEnd: typeof subscription?.cancel_at_period_end === 'boolean' ? subscription.cancel_at_period_end : null,
      latestInvoiceId: latestInvoice?.id || null,
      latestInvoiceStatus: latestInvoice?.status || null,
      latestPaymentIntentStatus: paymentIntent?.status || null,
    };
  } catch (error: any) {
    return {
      ...emptySnapshot,
      error: String(error?.message || error || 'stripe_fetch_failed'),
    };
  }
}

function buildBillingTruthDebug(args: {
  billingCustomer: any | null;
  subscription: any | null;
  usagePeriod: any | null;
  founderOverride: any | null;
  stripe: BillingTruthDebug['stripe'];
  resolved: BillingTruthDebug['resolved'];
}): BillingTruthDebug {
  const dbPlan = normalizeBillingPlanKey(args.subscription?.plan_key);
  const dbStatus = String(args.subscription?.billing_status || '').trim() || null;
  const dbPeriodEnd = asIso(args.subscription?.current_period_end);
  const dbCycle = inferBillingCycleFromPeriod(args.subscription?.current_period_start, args.subscription?.current_period_end);
  const stripeCycle = args.stripe.interval === 'year' ? 'yearly' : args.stripe.interval === 'month' ? 'monthly' : null;

  const mismatches = {
    planMismatch: Boolean(dbPlan && args.resolved.currentPlan !== dbPlan),
    statusMismatch: Boolean(dbStatus && args.resolved.billingState !== dbStatus),
    renewalMismatch: Boolean(dbPeriodEnd && args.resolved.renewalDate && dbPeriodEnd !== args.resolved.renewalDate),
    cycleMismatch: Boolean((stripeCycle || dbCycle) && args.resolved.currentBillingCycle !== (stripeCycle || dbCycle)),
    missingStripeCustomerLink: !String(args.billingCustomer?.stripe_customer_id || '').trim(),
    missingStripeSubscriptionLink: !String(args.subscription?.stripe_subscription_id || '').trim(),
    missingDbPeriodDates: !args.subscription?.current_period_start || !args.subscription?.current_period_end,
  };

  const nextInspectionFocus: string[] = [];
  if (mismatches.missingStripeCustomerLink || mismatches.missingStripeSubscriptionLink) nextInspectionFocus.push('DB linkage issue (customer/subscription missing)');
  if (mismatches.missingDbPeriodDates) nextInspectionFocus.push('Webhook persistence issue (period dates missing in DB)');
  if (mismatches.statusMismatch) nextInspectionFocus.push('status.ts billing state mapping issue');
  if (mismatches.renewalMismatch) nextInspectionFocus.push('renewal date resolution mismatch');
  if (mismatches.cycleMismatch) nextInspectionFocus.push('billing cycle inference mismatch');
  if (args.stripe.error) nextInspectionFocus.push('live Stripe snapshot unavailable');

  return {
    database: {
      billingCustomer: args.billingCustomer,
      subscription: args.subscription,
      usagePeriod: args.usagePeriod,
      founderOverride: args.founderOverride,
    },
    stripe: args.stripe,
    resolved: args.resolved,
    mismatches,
    nextInspectionFocus,
  };
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
        .select('id, user_id, stripe_customer_id, provider_status, created_at, updated_at')
        .eq('user_id', userId)
        .maybeSingle()
    ),
    maybeSelectSingle(
      admin.from('subscriptions')
        .select('id, user_id, plan_key, billing_status, current_period_start, current_period_end, cancel_at_period_end, founder_locked_price, founder_locked_plan, stripe_subscription_id, stripe_customer_id, price_id, created_at, updated_at')
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

  const stripeCustomerId = String(billingCustomer?.stripe_customer_id || subscription?.stripe_customer_id || '').trim() || null;
  const stripeSubscriptionId = String(subscription?.stripe_subscription_id || '').trim() || null;
  const stripeSnapshot = await fetchStripeBillingSnapshot(stripeCustomerId, stripeSubscriptionId);

  const billingTruth = buildBillingTruthDebug({
    billingCustomer,
    subscription,
    usagePeriod,
    founderOverride,
    stripe: stripeSnapshot,
    resolved: {
      currentPlan: effectivePlanKey,
      billingState: resolved.billingStatus,
      accessState: resolved.accessState,
      currentBillingCycle,
      renewalDate: asIso(subscription?.current_period_end),
      founderProtected: founderProtection.founderProtected,
      upgradeTargets,
    },
  });

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
    billingTruth,
  };
}
