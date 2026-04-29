/**
 * Phase 1 billing freeze scope
 *
 * This module is inside the Stripe-only validation area. Keep auth, DNS,
 * email, and unrelated UI changes out of this file during billing cleanup.
 */
import type { BillingPlanKey } from '../../services/planCatalog.js';
import { BILLING_PLAN_CATALOG } from '../../services/planCatalog.js';
import { deriveFounderProtection } from './founderProtection.js';
import { resolveBillingPlan, resolvePlanKeyFromStripeRefs } from './planMapping.js';
import { getBillingConfig, type BillingCheckoutLookupKey } from './billingConfig.js';
import { getOptionalEnv } from './stripeConfig.js';

type StripeSubscriptionSnapshot = {
  id: string;
  status: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  priceId: string | null;
  interval: 'monthly' | 'yearly' | null;
  latestInvoiceId: string | null;
  latestInvoiceStatus: string | null;
  latestPaymentIntentStatus: string | null;
};


type BillingEventSnapshot = {
  eventId: string | null;
  eventType: string | null;
  eventStatus: string | null;
  createdAt: string | null;
  processedAt: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  requestId: string | null;
  lastError: string | null;
  summary: {
    livemode: boolean | null;
    objectType: string | null;
    customerId: string | null;
    subscriptionId: string | null;
    status: string | null;
  };
};

type BillingValidationChecks = {
  hasBillingCustomerLink: boolean;
  hasSubscriptionLink: boolean;
  checkoutReady: boolean;
  portalReady: boolean;
  webhookHealthy: boolean;
  renewalVisible: boolean;
  activeOrTrialing: boolean;
  currentPlanAligned: boolean;
  periodDatesPersisted: boolean;
  cancelStateReadable: boolean;
};

type BillingValidationGuide = {
  recommendedOrder: string[];
  nextManualChecks: string[];
  likelyOwner: 'webhook_ingest' | 'db_persistence' | 'status_resolution' | 'ui_rendering' | 'ready_for_manual_validation';
};

type BillingTruthDebug = {
  dbSnapshot: {
    billingCustomerId: string | null;
    stripeCustomerId: string | null;
    subscriptionId: string | null;
    stripeSubscriptionId: string | null;
    planKey: BillingPlanKey | null;
    billingStatus: string | null;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    priceId: string | null;
    founderLockedPlan: BillingPlanKey | null;
    founderLockedPriceCents: number | null;
    founderOverrideActive: boolean;
  };
  stripeSnapshot: {
    customerExists: boolean;
    subscriptionExists: boolean;
    status: string | null;
    priceId: string | null;
    interval: 'monthly' | 'yearly' | null;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    latestInvoiceId: string | null;
    latestInvoiceStatus: string | null;
    latestPaymentIntentStatus: string | null;
  };
  resolvedSnapshot: {
    planKey: BillingPlanKey;
    billingStatus: string;
    accessState: string;
    renewalDate: string | null;
    currentBillingCycle: 'monthly' | 'yearly';
    source: 'database' | 'fallback' | 'stripe_live';
  };
  mismatches: {
    planMismatch: boolean;
    statusMismatch: boolean;
    renewalMismatch: boolean;
    cycleMismatch: boolean;
    missingStripeCustomer: boolean;
    missingStripeSubscription: boolean;
    missingDbPeriodDates: boolean;
  };
  nextInspectionFocus: string[];
};

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
  source: 'database' | 'fallback' | 'stripe_live';
  billingTruth: BillingTruthDebug;
  recentBillingEvents: BillingEventSnapshot[];
  validationChecks: BillingValidationChecks;
  validationGuide: BillingValidationGuide;
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

function safeIsoFromUnixSeconds(value: unknown): string | null {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
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

function normalizeStripeSubscriptionSnapshot(json: any): StripeSubscriptionSnapshot | null {
  if (!json?.id) return null;
  const recurringInterval = String(json?.items?.data?.[0]?.price?.recurring?.interval || '').trim();
  return {
    id: String(json.id),
    status: String(json?.status || '').trim() || null,
    cancelAtPeriodEnd: Boolean(json?.cancel_at_period_end),
    currentPeriodStart: safeIsoFromUnixSeconds(json?.current_period_start),
    currentPeriodEnd: safeIsoFromUnixSeconds(json?.current_period_end),
    priceId: String(json?.items?.data?.[0]?.price?.id || '').trim() || null,
    interval: recurringInterval === 'year' ? 'yearly' : recurringInterval === 'month' ? 'monthly' : null,
    latestInvoiceId: String(json?.latest_invoice?.id || '').trim() || null,
    latestInvoiceStatus: String(json?.latest_invoice?.status || '').trim() || null,
    latestPaymentIntentStatus: String(json?.latest_invoice?.payment_intent?.status || '').trim() || null,
  };
}

async function fetchStripeSubscriptionSnapshotById(stripeSubscriptionId: string | null): Promise<StripeSubscriptionSnapshot | null> {
  const subscriptionId = String(stripeSubscriptionId || '').trim();
  const stripeKey = getOptionalEnv('STRIPE_SECRET_KEY');
  if (!subscriptionId || !stripeKey) return null;

  try {
    const apiVersion = getOptionalEnv('STRIPE_API_VERSION') || '2024-06-20';
    const response = await fetch(
      `https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}?expand[]=latest_invoice.payment_intent`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          'Stripe-Version': apiVersion,
        },
      },
    );

    if (!response.ok) return null;
    const json: any = await response.json().catch(() => null);
    return normalizeStripeSubscriptionSnapshot(json);
  } catch {
    return null;
  }
}

async function fetchPreferredStripeSubscriptionSnapshot(params: { stripeSubscriptionId: string | null; stripeCustomerId: string | null }): Promise<StripeSubscriptionSnapshot | null> {
  const stripeKey = getOptionalEnv('STRIPE_SECRET_KEY');
  if (!stripeKey) return null;

  const direct = await fetchStripeSubscriptionSnapshotById(params.stripeSubscriptionId);
  const customerId = String(params.stripeCustomerId || '').trim();
  if (!customerId) return direct;

  try {
    const apiVersion = getOptionalEnv('STRIPE_API_VERSION') || '2024-06-20';
    const response = await fetch(
      `https://api.stripe.com/v1/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=10&expand[]=data.latest_invoice.payment_intent`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          'Stripe-Version': apiVersion,
        },
      },
    );

    if (!response.ok) return direct;
    const json: any = await response.json().catch(() => null);
    const rows = Array.isArray(json?.data) ? json.data : [];
    if (!rows.length) return direct;

    const score = (row: any) => {
      const status = String(row?.status || '').trim();
      const statusRank = status === 'active' ? 5 : status === 'trialing' ? 4 : status === 'past_due' ? 3 : status === 'incomplete' ? 2 : status === 'canceled' ? 1 : 0;
      const created = Number(row?.created || 0);
      return statusRank * 1_000_000_000 + created;
    };

    rows.sort((a: any, b: any) => score(b) - score(a));
    const best = normalizeStripeSubscriptionSnapshot(rows[0]);
    if (!best) return direct;

    if (!direct) return best;

    const isDirectStale = best.id !== direct.id && (
      (best.status === 'active' || best.status === 'trialing') &&
      !(direct.status === 'active' || direct.status === 'trialing')
    );
    const isDirectOlderCycle = best.id !== direct.id && best.currentPeriodEnd && direct.currentPeriodEnd && new Date(best.currentPeriodEnd).getTime() > new Date(direct.currentPeriodEnd).getTime();

    return (isDirectStale || isDirectOlderCycle) ? best : direct;
  } catch {
    return direct;
  }
}

function buildBillingTruthDebug(input: {
  billingCustomer: any;
  subscription: any;
  founderOverride: any;
  stripeSnapshot: StripeSubscriptionSnapshot | null;
  resolved: {
    planKey: BillingPlanKey;
    billingStatus: string;
    accessState: string;
    renewalDate: string | null;
    currentBillingCycle: 'monthly' | 'yearly';
    source: 'database' | 'fallback' | 'stripe_live';
  };
}): BillingTruthDebug {
  const dbSnapshot = {
    billingCustomerId: String(input.billingCustomer?.id || '').trim() || null,
    stripeCustomerId: String(input.billingCustomer?.stripe_customer_id || input.subscription?.stripe_customer_id || '').trim() || null,
    subscriptionId: String(input.subscription?.id || '').trim() || null,
    stripeSubscriptionId: String(input.subscription?.stripe_subscription_id || '').trim() || null,
    planKey: normalizeBillingPlanKey(input.subscription?.plan_key),
    billingStatus: String(input.subscription?.billing_status || '').trim() || null,
    currentPeriodStart: asIso(input.subscription?.current_period_start),
    currentPeriodEnd: asIso(input.subscription?.current_period_end),
    cancelAtPeriodEnd: Boolean(input.subscription?.cancel_at_period_end),
    priceId: String(input.subscription?.price_id || '').trim() || null,
    founderLockedPlan: normalizeBillingPlanKey(input.subscription?.founder_locked_plan),
    founderLockedPriceCents: Number.isFinite(Number(input.subscription?.founder_locked_price)) ? Number(input.subscription?.founder_locked_price) : null,
    founderOverrideActive: Boolean(input.founderOverride?.override_active),
  };

  const stripeSnapshot = {
    customerExists: Boolean(dbSnapshot.stripeCustomerId),
    subscriptionExists: Boolean(input.stripeSnapshot?.id),
    status: input.stripeSnapshot?.status || null,
    priceId: input.stripeSnapshot?.priceId || null,
    interval: input.stripeSnapshot?.interval || null,
    currentPeriodStart: input.stripeSnapshot?.currentPeriodStart || null,
    currentPeriodEnd: input.stripeSnapshot?.currentPeriodEnd || null,
    cancelAtPeriodEnd: Boolean(input.stripeSnapshot?.cancelAtPeriodEnd),
    latestInvoiceId: input.stripeSnapshot?.latestInvoiceId || null,
    latestInvoiceStatus: input.stripeSnapshot?.latestInvoiceStatus || null,
    latestPaymentIntentStatus: input.stripeSnapshot?.latestPaymentIntentStatus || null,
  };

  const expectedRenewal = stripeSnapshot.currentPeriodEnd || dbSnapshot.currentPeriodEnd;
  const expectedCycle = stripeSnapshot.interval || inferBillingCycleFromPeriod(stripeSnapshot.currentPeriodStart || dbSnapshot.currentPeriodStart, stripeSnapshot.currentPeriodEnd || dbSnapshot.currentPeriodEnd);

  const mismatches = {
    planMismatch: Boolean(dbSnapshot.planKey && input.resolved.planKey !== dbSnapshot.planKey),
    statusMismatch: Boolean((stripeSnapshot.status || dbSnapshot.billingStatus) && input.resolved.billingStatus !== (stripeSnapshot.status || dbSnapshot.billingStatus)),
    renewalMismatch: Boolean(expectedRenewal && input.resolved.renewalDate !== expectedRenewal),
    cycleMismatch: Boolean(expectedCycle && input.resolved.currentBillingCycle !== expectedCycle),
    missingStripeCustomer: !dbSnapshot.stripeCustomerId,
    missingStripeSubscription: !dbSnapshot.stripeSubscriptionId,
    missingDbPeriodDates: !dbSnapshot.currentPeriodStart || !dbSnapshot.currentPeriodEnd,
  };

  const nextInspectionFocus: string[] = [];
  if (mismatches.missingStripeCustomer || mismatches.missingStripeSubscription) {
    nextInspectionFocus.push('DB linkage issue (customer/subscription missing).');
  }
  if (mismatches.missingDbPeriodDates) {
    nextInspectionFocus.push('Webhook persistence issue (period dates missing in DB).');
  }
  if (mismatches.statusMismatch) {
    nextInspectionFocus.push('status.ts mapping issue (resolved billing status differs from fresher subscription truth).');
  }
  if (mismatches.renewalMismatch || mismatches.cycleMismatch) {
    nextInspectionFocus.push('Source precedence issue (resolved renewal/cycle differs from fresher Stripe subscription data).');
  }

  return {
    dbSnapshot,
    stripeSnapshot,
    resolvedSnapshot: input.resolved,
    mismatches,
    nextInspectionFocus,
  };
}


async function fetchRecentBillingEvents(admin: any, input: {
  userId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}): Promise<BillingEventSnapshot[]> {
  const seen = new Set<string>();
  const rows: any[] = [];

  const collect = async (query: Promise<any>) => {
    try {
      const { data, error } = await query;
      if (error || !Array.isArray(data)) return;
      for (const row of data) {
        const id = String(row?.id || row?.stripe_event_id || '').trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        rows.push(row);
      }
    } catch {
      return;
    }
  };

  await collect(
    admin.from('billing_events')
      .select('id, stripe_event_id, event_type, event_status, created_at, processed_at, stripe_customer_id, stripe_subscription_id, request_id, last_error, payload')
      .eq('user_id', input.userId)
      .order('created_at', { ascending: false })
      .limit(6)
  );

  if (input.stripeCustomerId) {
    await collect(
      admin.from('billing_events')
        .select('id, stripe_event_id, event_type, event_status, created_at, processed_at, stripe_customer_id, stripe_subscription_id, request_id, last_error, payload')
        .eq('stripe_customer_id', input.stripeCustomerId)
        .order('created_at', { ascending: false })
        .limit(6)
    );
  }

  if (input.stripeSubscriptionId) {
    await collect(
      admin.from('billing_events')
        .select('id, stripe_event_id, event_type, event_status, created_at, processed_at, stripe_customer_id, stripe_subscription_id, request_id, last_error, payload')
        .eq('stripe_subscription_id', input.stripeSubscriptionId)
        .order('created_at', { ascending: false })
        .limit(6)
    );
  }

  return rows
    .sort((a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime())
    .slice(0, 6)
    .map((row) => ({
      eventId: String(row?.stripe_event_id || '').trim() || null,
      eventType: String(row?.event_type || '').trim() || null,
      eventStatus: String(row?.event_status || '').trim() || null,
      createdAt: asIso(row?.created_at),
      processedAt: asIso(row?.processed_at),
      stripeCustomerId: String(row?.stripe_customer_id || '').trim() || null,
      stripeSubscriptionId: String(row?.stripe_subscription_id || '').trim() || null,
      requestId: String(row?.request_id || '').trim() || null,
      lastError: String(row?.last_error || '').trim() || null,
      summary: {
        livemode: typeof row?.payload?.summary?.livemode === 'boolean' ? row.payload.summary.livemode : null,
        objectType: String(row?.payload?.summary?.objectType || '').trim() || null,
        customerId: String(row?.payload?.summary?.customerId || '').trim() || null,
        subscriptionId: String(row?.payload?.summary?.subscriptionId || '').trim() || null,
        status: String(row?.payload?.summary?.status || '').trim() || null,
      },
    }));
}

function buildValidationChecks(input: {
  billingTruth: BillingTruthDebug;
  billingCustomerExists: boolean;
  stripeConfigured: boolean;
  upgradeTargets: BillingPlanKey[];
  renewalDate: string | null;
  cancelAtPeriodEnd: boolean;
}): BillingValidationChecks {
  const processedEvents = input.billingTruth.stripeSnapshot.subscriptionExists;
  const freshStatus = input.billingTruth.resolvedSnapshot.billingStatus;
  const activeOrTrialing = freshStatus === 'active' || freshStatus === 'trialing';
  return {
    hasBillingCustomerLink: input.billingCustomerExists && !input.billingTruth.mismatches.missingStripeCustomer,
    hasSubscriptionLink: !input.billingTruth.mismatches.missingStripeSubscription,
    checkoutReady: input.stripeConfigured && input.upgradeTargets.length > 0,
    portalReady: input.stripeConfigured && input.billingCustomerExists,
    webhookHealthy: processedEvents && !input.billingTruth.mismatches.statusMismatch,
    renewalVisible: Boolean(input.renewalDate),
    activeOrTrialing,
    currentPlanAligned: !input.billingTruth.mismatches.planMismatch,
    periodDatesPersisted: !input.billingTruth.mismatches.missingDbPeriodDates,
    cancelStateReadable: input.cancelAtPeriodEnd ? Boolean(input.renewalDate) : true,
  };
}

function buildValidationGuide(input: {
  checks: BillingValidationChecks;
  billingTruth: BillingTruthDebug;
  recentBillingEvents: BillingEventSnapshot[];
}): BillingValidationGuide {
  const nextManualChecks: string[] = [];
  let likelyOwner: BillingValidationGuide['likelyOwner'] = 'ready_for_manual_validation';

  if (!input.checks.hasBillingCustomerLink || !input.checks.hasSubscriptionLink) {
    likelyOwner = 'db_persistence';
    nextManualChecks.push('Verify billing_customers and subscriptions rows are linked to the same test user.');
  }
  if (!input.checks.periodDatesPersisted) {
    likelyOwner = 'webhook_ingest';
    nextManualChecks.push('Inspect recent webhook events and confirm current_period_start/current_period_end are being persisted.');
  }
  if (!input.checks.activeOrTrialing || !input.checks.renewalVisible) {
    likelyOwner = likelyOwner === 'ready_for_manual_validation' ? 'status_resolution' : likelyOwner;
    nextManualChecks.push('Compare resolved billing status/renewal with live Stripe subscription truth in billingTruth.');
  }
  if (input.recentBillingEvents.some((event) => event.eventStatus === 'failed' || event.lastError)) {
    likelyOwner = 'webhook_ingest';
    nextManualChecks.push('Open the newest failed billing event and review last_error plus summary payload.');
  }
  if (!nextManualChecks.length) {
    nextManualChecks.push('Proceed with manual Phase 4 tests in order using the same test account.');
  }

  return {
    recommendedOrder: [
      'Test 1 — New trial user',
      'Test 2 — Upgrade to Amateur monthly',
      'Test 3 — Upgrade to Professional',
      'Test 4 — Portal session',
      'Test 5 — Cancel at period end',
      'Test 6 — Renewal / invoice behavior',
    ],
    nextManualChecks,
    likelyOwner,
  };
}

export async function resolveBillingStatusForUser(admin: any, userId: string): Promise<BillingStatusResponse> {
  const config = getBillingConfig();

  const [profile, billingCustomer, subscription, usagePeriod, founderOverride] = await Promise.all([
    maybeSelectSingle(
      admin.from('users')
        .select('id, membership, is_admin, pricing_lock, founding_bucket, founding_circle_member, stripe_price_id, trial_end_date')
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
        .select('id, plan_key, billing_status, current_period_start, current_period_end, cancel_at_period_end, founder_locked_price, founder_locked_plan, stripe_subscription_id, stripe_customer_id, price_id')
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

  const stripeSnapshot = await fetchPreferredStripeSubscriptionSnapshot({
    stripeSubscriptionId: subscription?.stripe_subscription_id || null,
    stripeCustomerId: billingCustomer?.stripe_customer_id || subscription?.stripe_customer_id || null,
  });

  const founderProtection = deriveFounderProtection({
    user: profile || undefined,
    subscription: subscription || undefined,
    founderOverride: founderOverride || undefined,
  });

  const profilePlan = normalizeProfileMembership(profile?.membership);
  const dbSubscriptionPlan = normalizeBillingPlanKey(subscription?.plan_key);
  const stripePlan = normalizeBillingPlanKey(resolvePlanKeyFromStripeRefs({ priceId: stripeSnapshot?.priceId || null }));
  const rawMembership = String(profile?.membership || '').trim().toLowerCase();
  const trialEndMs = Number(profile?.trial_end_date ?? NaN);
  const hasFiniteTrialEnd = Number.isFinite(trialEndMs);
  const trialActive = rawMembership === 'trial' && hasFiniteTrialEnd && trialEndMs > Date.now();
  const trialExpired = rawMembership === 'trial' && hasFiniteTrialEnd && trialEndMs <= Date.now();

  const hasSubscriptionSignal = Boolean(
    dbSubscriptionPlan ||
    String(subscription?.stripe_subscription_id || '').trim() ||
    String(subscription?.billing_status || '').trim() ||
    subscription?.id ||
    stripeSnapshot?.id
  );

  const effectivePlanInput = stripePlan || dbSubscriptionPlan || (trialActive ? 'professional' : (!hasSubscriptionSignal ? profilePlan : 'free'));
  const effectiveBillingStatus = trialActive
    ? 'trialing'
    : (stripeSnapshot?.status || subscription?.billing_status || (!hasSubscriptionSignal && profilePlan !== 'free' ? 'active' : 'unknown'));
  const effectiveCurrentPeriodEnd = trialActive
    ? new Date(trialEndMs).toISOString()
    : (stripeSnapshot?.currentPeriodEnd || asIso(subscription?.current_period_end));
  const effectiveCancelAtPeriodEnd = trialActive
    ? false
    : (stripeSnapshot?.cancelAtPeriodEnd ?? Boolean(subscription?.cancel_at_period_end));

  const resolved = resolveBillingPlan({
    planKey: effectivePlanInput,
    billingStatus: effectiveBillingStatus,
    cancelAtPeriodEnd: effectiveCancelAtPeriodEnd,
    currentPeriodEnd: effectiveCurrentPeriodEnd,
    founderLockedPlan: null,
  });

  const effectivePlanKey = trialExpired
    ? 'free'
    : (resolved.keepAccess ? resolved.planKey : 'free');

  const planDef = BILLING_PLAN_CATALOG[effectivePlanKey] || BILLING_PLAN_CATALOG.free;
  const upgradeTargets = trialActive
    ? (['amateur', 'founder_amateur', 'professional', 'founder_professional'] as BillingPlanKey[])
    : (planDef.allowedUpgrades || []);

  const currentPriceId =
    String(stripeSnapshot?.priceId || subscription?.price_id || profile?.stripe_price_id || '').trim() || null;

  const configuredLookupKey = findConfiguredLookupKeyForPriceId(currentPriceId, config.priceLookup);
  const currentBillingCycle: 'monthly' | 'yearly' =
    inferBillingCycleFromLookupKey(configuredLookupKey)
    ?? stripeSnapshot?.interval
    ?? inferBillingCycleFromPeriod(stripeSnapshot?.currentPeriodStart || subscription?.current_period_start, stripeSnapshot?.currentPeriodEnd || subscription?.current_period_end)
    ?? 'monthly';

  const renewalDate = stripeSnapshot?.currentPeriodEnd || asIso(subscription?.current_period_end);
  const source: 'database' | 'fallback' | 'stripe_live' = stripeSnapshot?.id
    ? 'stripe_live'
    : (subscription || billingCustomer || usagePeriod || founderOverride ? 'database' : 'fallback');

  const billingTruth = buildBillingTruthDebug({
    billingCustomer,
    subscription,
    founderOverride,
    stripeSnapshot,
    resolved: {
      planKey: effectivePlanKey,
      billingStatus: trialExpired ? 'unknown' : resolved.billingStatus,
      accessState: trialExpired ? 'inactive' : resolved.accessState,
      renewalDate: trialExpired ? null : renewalDate,
      currentBillingCycle,
      source,
    },
  });

  const recentBillingEvents = await fetchRecentBillingEvents(admin, {
    userId,
    stripeCustomerId: String(billingCustomer?.stripe_customer_id || subscription?.stripe_customer_id || '').trim() || null,
    stripeSubscriptionId: String(subscription?.stripe_subscription_id || '').trim() || null,
  });

  const validationChecks = buildValidationChecks({
    billingTruth,
    billingCustomerExists: Boolean(billingCustomer?.id),
    stripeConfigured: config.stripeConfigured,
    upgradeTargets,
    renewalDate,
    cancelAtPeriodEnd: effectiveCancelAtPeriodEnd,
  });

  const validationGuide = buildValidationGuide({
    checks: validationChecks,
    billingTruth,
    recentBillingEvents,
  });

  return {
    ok: true,
    planKey: effectivePlanKey,
    billingStatus: trialExpired ? 'unknown' : resolved.billingStatus,
    accessState: trialExpired ? 'inactive' : resolved.accessState,
    renewalDate: trialExpired ? null : renewalDate,
    cancelAtPeriodEnd: effectiveCancelAtPeriodEnd,
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
    source,
    billingTruth,
    recentBillingEvents,
    validationChecks,
    validationGuide,
    billingReadiness: config.readiness,
  };
}
