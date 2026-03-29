/**
 * Phase 1 billing freeze scope
 *
 * This webhook file is part of the isolated Stripe validation surface. Avoid
 * unrelated auth, domain, email, or non-billing infrastructure changes here.
 */
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type { BillingPlanKey } from '../../services/planCatalog.js';
import { resolvePlanKeyFromStripeRefs, resolveBillingPlan } from './planMapping.js';
import { getOptionalEnv, getStripeWebhookSecrets, sanitizeStripeLogValue } from './stripeConfig.js';
import { deriveFounderProtection } from './founderProtection.js';

export type WebhookVerificationResult =
  | { ok: true; secretIndex: number }
  | { ok: false; reason: string };

export type ProcessStripeWebhookResult = {
  ok: boolean;
  received: boolean;
  duplicate?: boolean;
  processed?: boolean;
  ignored?: boolean;
  eventType?: string;
  eventId?: string;
  error?: string;
};

function getAdminClient() {
  const supabaseUrl = getOptionalEnv('SUPABASE_URL');
  const serviceKey = getOptionalEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function readRawBody(req: any): Promise<Buffer> {
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: any) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function timingSafeEqualHex(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a, 'hex');
    const bb = Buffer.from(b, 'hex');
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

export function verifyStripeSignature(rawBody: Buffer, signatureHeader: string, secrets: string[]): WebhookVerificationResult {
  if (!signatureHeader) return { ok: false, reason: 'missing_signature_header' };
  if (!secrets.length) return { ok: false, reason: 'missing_webhook_secret' };

  const parts = signatureHeader.split(',').map((part) => part.trim());
  const timestampPart = parts.find((part) => part.startsWith('t='));
  const signatures = parts.filter((part) => part.startsWith('v1='));
  if (!timestampPart || signatures.length === 0) return { ok: false, reason: 'invalid_signature_header' };

  const timestamp = Number(timestampPart.slice(2));
  if (!Number.isFinite(timestamp) || timestamp <= 0) return { ok: false, reason: 'invalid_timestamp' };

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > 300) return { ok: false, reason: 'timestamp_out_of_tolerance' };

  const signedPayload = `${timestamp}.${rawBody.toString('utf8')}`;
  for (let index = 0; index < secrets.length; index += 1) {
    const expected = crypto.createHmac('sha256', secrets[index]).update(signedPayload, 'utf8').digest('hex');
    for (const entry of signatures) {
      if (timingSafeEqualHex(expected, entry.slice(3))) {
        return { ok: true, secretIndex: index };
      }
    }
  }

  return { ok: false, reason: 'signature_mismatch' };
}

function safeIsoFromUnixSeconds(value: unknown): string | null {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

function normalizeLiveStripeSubscriptionSnapshot(json: any) {
  if (!json?.id) return null;
  return {
    id: String(json.id),
    status: String(json?.status || '').trim() || null,
    currentPeriodStart: safeIsoFromUnixSeconds(json?.current_period_start),
    currentPeriodEnd: safeIsoFromUnixSeconds(json?.current_period_end),
    cancelAtPeriodEnd: Boolean(json?.cancel_at_period_end),
    priceId: String(json?.items?.data?.[0]?.price?.id || '').trim() || null,
    productId: String(json?.items?.data?.[0]?.price?.product || '').trim() || null,
    latestInvoiceId: String(json?.latest_invoice?.id || '').trim() || null,
    latestInvoiceStatus: String(json?.latest_invoice?.status || '').trim() || null,
    latestPaymentIntentStatus: String(json?.latest_invoice?.payment_intent?.status || '').trim() || null,
  };
}

async function fetchLiveStripeSubscriptionSnapshot(subscriptionId: string | null, stripeCustomerId?: string | null) {
  const normalizedId = String(subscriptionId || '').trim();
  const stripeKey = getOptionalEnv('STRIPE_SECRET_KEY');
  if (!normalizedId && !stripeCustomerId || !stripeKey) return null;

  const apiVersion = getOptionalEnv('STRIPE_API_VERSION') || '2024-06-20';

  let direct: any = null;
  if (normalizedId) {
    try {
      const response = await fetch(
        `https://api.stripe.com/v1/subscriptions/${encodeURIComponent(normalizedId)}?expand[]=latest_invoice.payment_intent`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${stripeKey}`,
            'Stripe-Version': apiVersion,
          },
        },
      );
      if (response.ok) {
        direct = normalizeLiveStripeSubscriptionSnapshot(await response.json().catch(() => null));
      }
    } catch {
      direct = null;
    }
  }

  const customerId = String(stripeCustomerId || '').trim();
  if (!customerId) return direct;

  try {
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
      return statusRank * 1_000_000_000 + Number(row?.created || 0);
    };
    rows.sort((a: any, b: any) => score(b) - score(a));
    const best = normalizeLiveStripeSubscriptionSnapshot(rows[0]);
    if (!best) return direct;
    if (!direct) return best;
    const directActive = direct.status === 'active' || direct.status === 'trialing';
    const bestActive = best.status === 'active' || best.status === 'trialing';
    const newerBest = best.currentPeriodEnd && direct.currentPeriodEnd && new Date(best.currentPeriodEnd).getTime() > new Date(direct.currentPeriodEnd).getTime();
    return (best.id !== direct.id && ((bestActive && !directActive) || newerBest)) ? best : direct;
  } catch {
    return direct;
  }
}

function normalizeBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  const raw = String(value ?? '').trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

function normalizePlanFromObject(object: any, fallback?: { priceId?: string | null; productId?: string | null }): BillingPlanKey {
  const metadata = object?.metadata || {};
  const explicitPlan = String(metadata?.plan_key || metadata?.internal_plan_key || '').trim();
  if (explicitPlan === 'free' || explicitPlan === 'amateur' || explicitPlan === 'founder_amateur' || explicitPlan === 'professional' || explicitPlan === 'founder_professional') {
    return explicitPlan as BillingPlanKey;
  }

  const founderLike = normalizeBool(metadata?.founding_member) || Boolean(String(metadata?.pricing_lock || '').trim()) || Boolean(String(metadata?.founder_offer || '').trim());
  const requestedTier = String(metadata?.tier_requested || metadata?.tier || '').trim().toLowerCase();
  if (founderLike && requestedTier === 'professional') return 'founder_professional';
  if (founderLike && requestedTier === 'amateur') return 'founder_amateur';
  if (requestedTier === 'professional') return 'professional';
  if (requestedTier === 'amateur') return 'amateur';

  const firstPrice = object?.items?.data?.[0]?.price || object?.lines?.data?.[0]?.price || object?.plan || null;
  const resolved = resolvePlanKeyFromStripeRefs({
    lookupKey: firstPrice?.lookup_key || object?.lookup_key || null,
    priceId: firstPrice?.id || object?.price?.id || fallback?.priceId || null,
    productId: firstPrice?.product || object?.price?.product || object?.product || fallback?.productId || null,
  });

  return resolved || (founderLike ? (requestedTier === 'amateur' ? 'founder_amateur' : 'founder_professional') : 'free');
}

function normalizeStatusFromEvent(eventType: string, object: any): string {
  if (eventType === 'customer.subscription.deleted') return 'canceled';
  if (eventType === 'invoice.payment_failed') return 'past_due';
  if (eventType === 'invoice.paid') return 'active';
  if (eventType === 'checkout.session.completed') {
    return String(object?.payment_status || '').trim() === 'paid' ? 'active' : 'incomplete';
  }
  return String(object?.status || object?.subscription_status || '').trim() || 'unknown';
}

function buildEventSummary(event: any) {
  const object = event?.data?.object || {};
  const metadata = object?.metadata || {};
  const firstPrice = object?.items?.data?.[0]?.price || object?.lines?.data?.[0]?.price || object?.plan || null;
  return sanitizeStripeLogValue({
    id: event?.id || null,
    type: event?.type || null,
    livemode: Boolean(event?.livemode),
    created: safeIsoFromUnixSeconds(event?.created),
    objectType: object?.object || null,
    checkoutSessionId: object?.id && object?.object === 'checkout.session' ? object.id : null,
    stripeCustomerId: object?.customer || null,
    stripeSubscriptionId: object?.subscription || (object?.object === 'subscription' ? object.id : null),
    stripePriceId: firstPrice?.id || object?.price?.id || null,
    stripeProductId: firstPrice?.product || object?.price?.product || object?.product || null,
    lookupKey: firstPrice?.lookup_key || object?.lookup_key || null,
    status: object?.status || object?.payment_status || null,
    cancelAtPeriodEnd: Boolean(object?.cancel_at_period_end),
    metadata: {
      user_id: metadata?.user_id || null,
      tier_requested: metadata?.tier_requested || null,
      billing: metadata?.billing || null,
      founding_member: metadata?.founding_member || null,
      pricing_lock: metadata?.pricing_lock ? '[redacted]' : null,
      founder_offer: metadata?.founder_offer || null,
    },
  });
}

async function findExistingBillingEvent(admin: any, stripeEventId: string) {
  const { data, error } = await admin
    .from('billing_events')
    .select('id, event_status, processed_at')
    .eq('stripe_event_id', stripeEventId)
    .maybeSingle();

  if (error) return null;
  return data || null;
}

async function insertBillingEventReceipt(admin: any, event: any, requestId: string | null, verifiedSecretSlot: number) {
  const object = event?.data?.object || {};
  const metadata = object?.metadata || {};
  const stripeEventId = String(event?.id || '').trim();
  const stripeSubscriptionId = String(object?.subscription || (object?.object === 'subscription' ? object?.id : '') || '').trim() || null;
  const stripeCustomerId = String(object?.customer || '').trim() || null;
  const userId = String(metadata?.user_id || '').trim() || null;

  const payload = {
    request_id: requestId,
    verified_secret_slot: verifiedSecretSlot,
    summary: buildEventSummary(event),
  };

  const existing = stripeEventId ? await findExistingBillingEvent(admin, stripeEventId) : null;
  if (existing?.processed_at || existing?.event_status === 'processed' || existing?.event_status === 'ignored') {
    return { duplicate: true, billingEventId: existing.id };
  }

  const { data, error } = await admin
    .from('billing_events')
    .upsert(
      [{
        user_id: userId,
        stripe_event_id: stripeEventId || null,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
        event_type: String(event?.type || 'unknown'),
        event_source: 'stripe',
        event_status: 'received',
        payload,
        event_created_at: safeIsoFromUnixSeconds(event?.created),
        request_id: requestId,
        last_received_at: new Date().toISOString(),
      }],
      { onConflict: 'stripe_event_id' },
    )
    .select('id, event_status, processed_at')
    .single();

  if (error) throw new Error(`billing_event_insert_failed:${error.message}`);
  return { duplicate: false, billingEventId: data?.id as string | null };
}


async function mirrorWebhookHealthEvent(admin: any, event: any, requestId: string | null, signaturePresent: boolean) {
  const stripeEventId = String(event?.id || '').trim();
  if (!stripeEventId) return;

  await admin
    .from('maw_stripe_webhook_events')
    .upsert([
      {
        stripe_event_id: stripeEventId,
        event_type: String(event?.type || 'unknown'),
        livemode: Boolean(event?.livemode),
        stripe_created_at: safeIsoFromUnixSeconds(event?.created),
        received_at: new Date().toISOString(),
        request_id: requestId,
        signature_present: signaturePresent,
        processed: false,
        error: null,
        delivery_attempts: 1,
      },
    ], { onConflict: 'stripe_event_id' });
}

async function incrementWebhookHealthAttempt(admin: any, stripeEventId: string | null, requestId?: string | null) {
  const normalizedEventId = String(stripeEventId || '').trim();
  if (!normalizedEventId) return;

  const { data } = await admin
    .from('maw_stripe_webhook_events')
    .select('delivery_attempts')
    .eq('stripe_event_id', normalizedEventId)
    .maybeSingle();

  const nextAttempts = Math.max(1, Number(data?.delivery_attempts || 1) + 1);
  await admin
    .from('maw_stripe_webhook_events')
    .update({
      delivery_attempts: nextAttempts,
      received_at: new Date().toISOString(),
      request_id: requestId || null,
    })
    .eq('stripe_event_id', normalizedEventId);
}

async function markWebhookHealthStatus(admin: any, stripeEventId: string | null, status: 'processed' | 'failed', error?: string | null) {
  const normalizedEventId = String(stripeEventId || '').trim();
  if (!normalizedEventId) return;

  await admin
    .from('maw_stripe_webhook_events')
    .update({
      processed: status === 'processed',
      error: error || null,
    })
    .eq('stripe_event_id', normalizedEventId);
}

async function incrementBillingEventAttempt(admin: any, billingEventId: string | null) {
  if (!billingEventId) return;

  const { data } = await admin
    .from('billing_events')
    .select('delivery_attempts')
    .eq('id', billingEventId)
    .maybeSingle();

  const nextAttempts = Math.max(1, Number(data?.delivery_attempts || 1) + 1);
  await admin
    .from('billing_events')
    .update({
      delivery_attempts: nextAttempts,
      last_received_at: new Date().toISOString(),
    })
    .eq('id', billingEventId);
}

async function markBillingEventStatus(admin: any, billingEventId: string | null, status: 'processed' | 'ignored' | 'failed', details?: unknown) {
  if (!billingEventId) return;
  const patch: Record<string, unknown> = {
    event_status: status,
    processed_at: new Date().toISOString(),
  };
  if (details !== undefined) patch.payload = sanitizeStripeLogValue(details);
  if (status === 'failed' && details && typeof details === 'object' && 'error' in (details as any)) patch.last_error = String((details as any).error || '');
  await admin.from('billing_events').update(patch).eq('id', billingEventId);
}

async function upsertBillingCustomer(admin: any, params: { userId: string | null; stripeCustomerId: string | null; email?: string | null; livemode?: boolean }) {
  if (!params.userId && !params.stripeCustomerId) return null;

  const { data: existingByCustomer } = params.stripeCustomerId
    ? await admin.from('billing_customers').select('id').eq('stripe_customer_id', params.stripeCustomerId).maybeSingle()
    : { data: null };
  const { data: existingByUser } = params.userId
    ? await admin.from('billing_customers').select('id').eq('user_id', params.userId).maybeSingle()
    : { data: null };

  const payload: Record<string, unknown> = {
    user_id: params.userId,
    stripe_customer_id: params.stripeCustomerId,
    email: params.email || null,
    billing_provider: 'stripe',
    provider_status: 'synced',
    synced_at: new Date().toISOString(),
    source_updated_at: new Date().toISOString(),
  };
  const existingId = existingByCustomer?.id || existingByUser?.id || null;
  if (existingId) payload.id = existingId;

  const conflictTarget = params.userId ? 'user_id' : 'stripe_customer_id';
  const { data, error } = await admin.from('billing_customers').upsert([payload], { onConflict: conflictTarget }).select('id').single();
  if (error) throw new Error(`billing_customer_upsert_failed:${error.message}`);
  return data?.id as string | null;
}

async function getFounderOverride(admin: any, userId: string | null) {
  if (!userId) return null;
  const { data, error } = await admin.from('founder_overrides').select('locked_plan_key, locked_price_cents, pricing_lock, founder_bucket, override_active').eq('user_id', userId).maybeSingle();
  if (error) return null;
  return data || null;
}

async function upsertFounderOverride(admin: any, params: { userId: string | null; planKey: BillingPlanKey; metadata: any; existingOverride?: any }) {
  if (!params.userId || (params.planKey !== 'founder_professional' && params.planKey !== 'founder_amateur')) return;
  const founderState = deriveFounderProtection({ metadata: params.metadata, founderOverride: params.existingOverride || null });

  await admin.from('founder_overrides').upsert([
    {
      user_id: params.userId,
      locked_plan_key: params.planKey,
      locked_price_cents: founderState.lockedPriceCents || (params.planKey === 'founder_amateur' ? 1595 : 2995),
      override_active: true,
      pricing_lock: founderState.pricingLockKey || (params.planKey === 'founder_amateur' ? 'founding_amateur_2026' : 'founding_pro_admc_2026'),
      founder_bucket: founderState.bucket,
      granted_reason: 'stripe_webhook_sync',
      source_updated_at: new Date().toISOString(),
      last_synced_at: new Date().toISOString(),
    },
  ], { onConflict: 'user_id' });
}


async function syncUserMembership(admin: any, params: {
  userId: string | null;
  planKey: BillingPlanKey;
  billingStatus: string;
  founderLockedPlan?: BillingPlanKey | null;
  founderProtected?: boolean;
  pricingLock?: string | null;
  foundingBucket?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripePriceId?: string | null;
  stripeCurrentPeriodEnd?: string | null;
  stripeCancelAtPeriodEnd?: boolean;
}) {
  if (!params.userId) return { updated: false, reason: 'missing_user_id' };

  const { data: existingUser, error: existingUserError } = await admin
    .from('users')
    .select('id,membership,pricing_lock,founding_bucket,founding_circle_member,stripe_customer_id,stripe_subscription_id,stripe_price_id,stripe_status,stripe_current_period_end,stripe_cancel_at_period_end')
    .eq('id', params.userId)
    .maybeSingle();

  if (existingUserError) {
    throw new Error(`user_sync_lookup_failed:${existingUserError.message}`);
  }
  if (!existingUser?.id) {
    return { updated: false, reason: 'user_not_found' };
  }

  const resolution = resolveBillingPlan({
    planKey: params.planKey,
    billingStatus: params.billingStatus,
    founderLockedPlan: null,
  });

  const paidMembership = resolution.keepAccess
    ? ((params.founderLockedPlan === 'founder_professional' || params.planKey === 'professional' || params.planKey === 'founder_professional')
      ? 'professional'
      : (params.founderLockedPlan === 'founder_amateur' || params.planKey === 'amateur' || params.planKey === 'founder_amateur')
        ? 'amateur'
        : 'free')
    : 'free';

  const normalizedStripeCustomerId = String(params.stripeCustomerId || '').trim() || null;
  const normalizedStripeSubscriptionId = String(params.stripeSubscriptionId || '').trim() || null;
  const normalizedStripePriceId = String(params.stripePriceId || '').trim() || null;
  const normalizedPeriodEnd = params.stripeCurrentPeriodEnd || null;
  const normalizedCancelAtPeriodEnd = typeof params.stripeCancelAtPeriodEnd === 'boolean'
    ? params.stripeCancelAtPeriodEnd
    : Boolean(existingUser.stripe_cancel_at_period_end);

  const patch: Record<string, unknown> = {
    membership: paidMembership,
    trial_end_date: null,
    stripe_status: params.billingStatus || existingUser.stripe_status || null,
    stripe_cancel_at_period_end: normalizedCancelAtPeriodEnd,
  };

  if (normalizedPeriodEnd || !existingUser.stripe_current_period_end) {
    patch.stripe_current_period_end = normalizedPeriodEnd;
  }

  if (params.founderProtected) {
    patch.pricing_lock = params.pricingLock || (params.founderLockedPlan === 'founder_amateur' ? 'founding_amateur_2026' : 'founding_pro_admc_2026');
    patch.founding_bucket = params.foundingBucket || existingUser.founding_bucket || null;
    patch.founding_circle_member = true;
  }

  if (normalizedStripeCustomerId || !existingUser.stripe_customer_id) {
    patch.stripe_customer_id = normalizedStripeCustomerId;
  }
  if (normalizedStripeSubscriptionId || !existingUser.stripe_subscription_id) {
    patch.stripe_subscription_id = normalizedStripeSubscriptionId;
  }
  if (normalizedStripePriceId || !existingUser.stripe_price_id) {
    patch.stripe_price_id = normalizedStripePriceId;
  }

  const { error: updateError } = await admin
    .from('users')
    .update(patch)
    .eq('id', params.userId);

  if (updateError) {
    throw new Error(`user_sync_update_failed:${updateError.message}`);
  }

  return {
    updated: true,
    membership: paidMembership,
    previous: existingUser,
    next: {
      membership: paidMembership,
      pricing_lock: patch.pricing_lock ?? existingUser.pricing_lock,
      founding_bucket: patch.founding_bucket ?? existingUser.founding_bucket,
      founding_circle_member: patch.founding_circle_member ?? existingUser.founding_circle_member,
      stripe_customer_id: patch.stripe_customer_id ?? existingUser.stripe_customer_id,
      stripe_subscription_id: patch.stripe_subscription_id ?? existingUser.stripe_subscription_id,
      stripe_price_id: patch.stripe_price_id ?? existingUser.stripe_price_id,
      stripe_status: patch.stripe_status,
      stripe_current_period_end: patch.stripe_current_period_end,
      stripe_cancel_at_period_end: patch.stripe_cancel_at_period_end,
    },
  };
}

async function upsertUsagePeriod(admin: any, params: {
  userId: string | null;
  planKey: BillingPlanKey;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
}) {
  if (!params.userId || !params.currentPeriodStart || !params.currentPeriodEnd) return;

  const effectivePlan = params.planKey === 'founder_professional' ? 'professional' : params.planKey === 'founder_amateur' ? 'amateur' : params.planKey;
  const { data: existing } = await admin
    .from('usage_periods')
    .select('id')
    .eq('user_id', params.userId)
    .order('period_start', { ascending: false })
    .limit(1)
    .maybeSingle();

  const payload: Record<string, unknown> = {
    user_id: params.userId,
    plan_key: effectivePlan,
    period_start: params.currentPeriodStart,
    period_end: params.currentPeriodEnd,
    source_of_truth: 'stripe',
    source_updated_at: new Date().toISOString(),
    last_synced_at: new Date().toISOString(),
  };
  if (existing?.id) payload.id = existing.id;

  await admin.from('usage_periods').upsert([payload], { onConflict: 'id' });
}

async function upsertSubscription(admin: any, params: {
  userId: string | null;
  billingCustomerId: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  checkoutSessionId?: string | null;
  planKey: BillingPlanKey;
  billingStatus: string;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  founderLockedPrice?: number | null;
  founderLockedPlan?: BillingPlanKey | null;
  priceId?: string | null;
  productId?: string | null;
}) {
  const matchSubscriptionId = String(params.stripeSubscriptionId || '').trim();
  let existingId: string | null = null;
  if (matchSubscriptionId) {
    const { data } = await admin.from('subscriptions').select('id').eq('stripe_subscription_id', matchSubscriptionId).maybeSingle();
    existingId = (data?.id as string | undefined) || null;
  }
  if (!existingId && params.userId) {
    const { data } = await admin
      .from('subscriptions')
      .select('id')
      .eq('user_id', params.userId)
      .eq('source_of_truth', 'stripe')
      .maybeSingle();
    existingId = (data?.id as string | undefined) || null;
  }

  const resolution = resolveBillingPlan({
    planKey: params.planKey,
    billingStatus: params.billingStatus,
    cancelAtPeriodEnd: params.cancelAtPeriodEnd,
    currentPeriodEnd: params.currentPeriodEnd,
    founderLockedPlan: params.founderLockedPlan,
  });

  const payload: Record<string, unknown> = {
    user_id: params.userId,
    billing_customer_id: params.billingCustomerId,
    stripe_customer_id: params.stripeCustomerId,
    stripe_subscription_id: params.stripeSubscriptionId,
    plan_key: resolution.planKey,
    billing_status: resolution.billingStatus,
    current_period_start: params.currentPeriodStart || null,
    current_period_end: params.currentPeriodEnd || null,
    cancel_at_period_end: Boolean(params.cancelAtPeriodEnd),
    founder_locked_price: params.founderLockedPrice ?? null,
    founder_locked_plan: params.founderLockedPlan ?? null,
    checkout_session_id: params.checkoutSessionId || null,
    price_id: params.priceId || null,
    source_of_truth: 'stripe',
    last_synced_at: new Date().toISOString(),
    source_updated_at: new Date().toISOString(),
  };
  if (existingId) payload.id = existingId;

  const { data, error } = await admin.from('subscriptions').upsert([payload], { onConflict: 'stripe_subscription_id' }).select('id').single();
  if (error) throw new Error(`subscription_upsert_failed:${error.message}`);
  return data?.id as string | null;
}

async function syncFromEvent(admin: any, event: any) {
  const eventType = String(event?.type || '').trim();
  const object = event?.data?.object || {};
  const metadata = object?.metadata || {};
  const firstPrice = object?.items?.data?.[0]?.price || object?.lines?.data?.[0]?.price || object?.plan || null;

  const userId = String(metadata?.user_id || object?.client_reference_id || '').trim() || null;
  const existingFounderOverride = await getFounderOverride(admin, userId);
  const founderState = deriveFounderProtection({ metadata, founderOverride: existingFounderOverride });
  const stripeCustomerId = String(object?.customer || '').trim() || null;
  const stripeSubscriptionId = String(object?.subscription || (object?.object === 'subscription' ? object?.id : '') || '').trim() || null;
  const liveSubscription = await fetchLiveStripeSubscriptionSnapshot(stripeSubscriptionId, stripeCustomerId);
  const normalizedPlanKey = normalizePlanFromObject(object, {
    priceId: liveSubscription?.priceId || null,
    productId: liveSubscription?.productId || null,
  });
  const planKey = founderState.founderProtected && founderState.lockedPlan ? founderState.lockedPlan : normalizedPlanKey;
  const billingStatus = String(liveSubscription?.status || normalizeStatusFromEvent(eventType, object)).trim();
  const checkoutSessionId = object?.object === 'checkout.session' ? String(object?.id || '').trim() || null : null;
  const currentPeriodStart = liveSubscription?.currentPeriodStart || safeIsoFromUnixSeconds(object?.current_period_start || object?.period_start) || null;
  const currentPeriodEnd = liveSubscription?.currentPeriodEnd || safeIsoFromUnixSeconds(object?.current_period_end || object?.period_end) || null;
  const founderLockedPlan = founderState.founderProtected && founderState.lockedPlan ? founderState.lockedPlan : (planKey === 'founder_professional' ? 'founder_professional' : planKey === 'founder_amateur' ? 'founder_amateur' : null);
  const founderLockedPrice = founderState.founderProtected ? (founderState.lockedPriceCents || (founderLockedPlan === 'founder_amateur' ? 1595 : 2995)) : null;

  const billingCustomerId = await upsertBillingCustomer(admin, {
    userId,
    stripeCustomerId,
    email: object?.customer_details?.email || object?.customer_email || null,
    livemode: Boolean(event?.livemode),
  });

  if (founderLockedPlan) {
    await upsertFounderOverride(admin, { userId, planKey, metadata, existingOverride: existingFounderOverride });
  }

  const userSync = await syncUserMembership(admin, {
    userId,
    planKey,
    billingStatus,
    founderLockedPlan,
    founderProtected: founderState.founderProtected,
    pricingLock: founderState.pricingLockKey,
    foundingBucket: founderState.bucket,
    stripeCustomerId,
    stripeSubscriptionId,
    stripePriceId: liveSubscription?.priceId || firstPrice?.id || object?.price?.id || null,
    stripeCurrentPeriodEnd: currentPeriodEnd,
    stripeCancelAtPeriodEnd: liveSubscription?.cancelAtPeriodEnd
      ?? (typeof object?.cancel_at_period_end === 'boolean' ? object.cancel_at_period_end : undefined),
  });

  await upsertUsagePeriod(admin, {
    userId,
    planKey,
    currentPeriodStart,
    currentPeriodEnd,
  });

  const subscriptionId = await upsertSubscription(admin, {
    userId,
    billingCustomerId,
    stripeCustomerId,
    stripeSubscriptionId,
    checkoutSessionId,
    planKey,
    billingStatus,
    currentPeriodStart,
    currentPeriodEnd,
    cancelAtPeriodEnd: liveSubscription?.cancelAtPeriodEnd ?? Boolean(object?.cancel_at_period_end),
    founderLockedPrice,
    founderLockedPlan,
    priceId: liveSubscription?.priceId || firstPrice?.id || object?.price?.id || null,
    productId: liveSubscription?.productId || firstPrice?.product || object?.price?.product || null,
  });

  return {
    userId,
    billingCustomerId,
    subscriptionId,
    stripeCustomerId,
    stripeSubscriptionId,
    planKey,
    billingStatus,
    userSync,
  };
}

async function cancelSubscriptionBestEffort(subscriptionId: string, reason: string) {
  const stripeKey = getOptionalEnv('STRIPE_SECRET_KEY');
  if (!stripeKey || !subscriptionId) return { ok: false, error: 'missing_cancel_requirements' };

  try {
    const response = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${stripeKey}` },
    });
    if (!response.ok) {
      return { ok: false, error: 'stripe_cancel_failed', reason };
    }
    return { ok: true };
  } catch (error: any) {
    return { ok: false, error: String(error?.message || error || 'unknown_cancel_error'), reason };
  }
}

async function enforceFounderCapBestEffort(admin: any, event: any) {
  const object = event?.data?.object || {};
  const metadata = object?.metadata || {};
  const founderLike = normalizeBool(metadata?.founding_member) || Boolean(String(metadata?.pricing_lock || '').trim()) || Boolean(String(metadata?.founder_offer || '').trim());
  if (!founderLike) return { skipped: true };

  const { getFoundersConfig, countFounders, permanentlyCloseFounders } = await import('../../api/_lib/foundersCap.js');
  const config = await getFoundersConfig(admin);
  if (!config) return { skipped: true };

  const current = await countFounders(admin);
  if (current < Number(config.cap || 100)) return { skipped: false, overCap: false };

  await permanentlyCloseFounders(admin);
  const subscriptionId = String(object?.subscription || (object?.object === 'subscription' ? object?.id : '') || '').trim();
  if (subscriptionId) {
    await cancelSubscriptionBestEffort(subscriptionId, 'founder_cap_exceeded');
  }
  return { skipped: false, overCap: true, subscriptionId: subscriptionId || null };
}

export async function processStripeWebhook(input: {
  rawBody: Buffer;
  signatureHeader: string;
  requestId?: string | null;
}): Promise<ProcessStripeWebhookResult> {
  const admin = getAdminClient();
  if (!admin) {
    return { ok: false, received: false, error: 'supabase_not_configured' };
  }

  const secrets = getStripeWebhookSecrets();
  const verification = verifyStripeSignature(input.rawBody, input.signatureHeader, secrets);
  if (!verification.ok) {
    return { ok: false, received: false, error: verification.reason };
  }

  let event: any;
  try {
    event = JSON.parse(input.rawBody.toString('utf8') || '{}');
  } catch {
    return { ok: false, received: false, error: 'invalid_json' };
  }

  const eventType = String(event?.type || '').trim();
  const eventId = String(event?.id || '').trim();

  await mirrorWebhookHealthEvent(admin, event, input.requestId || null, Boolean(input.signatureHeader));
  const trackedEventTypes = new Set([
    'checkout.session.completed',
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'invoice.paid',
    'invoice.payment_failed',
  ]);

  let billingEventId: string | null = null;
  try {
    const receipt = await insertBillingEventReceipt(admin, event, input.requestId || null, verification.secretIndex);
    billingEventId = receipt.billingEventId;
    if (receipt.duplicate) {
      await incrementBillingEventAttempt(admin, billingEventId);
      await incrementWebhookHealthAttempt(admin, eventId, input.requestId || null);
      return { ok: true, received: true, duplicate: true, processed: true, eventType, eventId };
    }

    if (!trackedEventTypes.has(eventType)) {
      await markBillingEventStatus(admin, billingEventId, 'ignored', {
        summary: buildEventSummary(event),
        note: 'Unhandled event type ignored intentionally.',
      });
      await markWebhookHealthStatus(admin, eventId, 'processed', null);
      return { ok: true, received: true, ignored: true, eventType, eventId };
    }

    const sync = await syncFromEvent(admin, event);
    const founderCap = await enforceFounderCapBestEffort(admin, event);

    await markBillingEventStatus(admin, billingEventId, 'processed', {
      summary: buildEventSummary(event),
      sync,
      founderCap,
    });
    await markWebhookHealthStatus(admin, eventId, 'processed', null);

    return { ok: true, received: true, processed: true, eventType, eventId };
  } catch (error: any) {
    const normalizedError = String(error?.message || error || 'unknown_webhook_failure');
    await markBillingEventStatus(admin, billingEventId, 'failed', {
      summary: event ? buildEventSummary(event) : null,
      error: sanitizeStripeLogValue(normalizedError),
    });
    await markWebhookHealthStatus(admin, eventId, 'failed', normalizedError);
    return { ok: false, received: true, processed: false, eventType, eventId, error: normalizedError };
  }
}
