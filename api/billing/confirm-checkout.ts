import { requireSupabaseAuth } from '../_auth.js';
import { fetchStripeCheckoutSession, fetchStripeSubscription } from '../../server/billing/stripeClient.js';
import { resolveBillingPlan, resolvePlanKeyFromStripeRefs } from '../../server/billing/planMapping.js';
import type { BillingPlanKey } from '../../services/planCatalog.js';

function safeIsoFromUnixSeconds(value: unknown): string | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString();
}

function normalizePlanKey(session: any, subscription: any): BillingPlanKey {
  const metadata = session?.metadata || subscription?.metadata || {};
  const explicit = String(metadata?.internal_plan_key || metadata?.plan_key || '').trim();
  if (
    explicit === 'free' ||
    explicit === 'amateur' ||
    explicit === 'founder_amateur' ||
    explicit === 'professional' ||
    explicit === 'founder_professional'
  ) {
    return explicit as BillingPlanKey;
  }

  const firstPrice = session?.line_items?.data?.[0]?.price || subscription?.items?.data?.[0]?.price || null;
  const resolved = resolvePlanKeyFromStripeRefs({
    lookupKey: firstPrice?.lookup_key || null,
    priceId: firstPrice?.id || null,
    productId: firstPrice?.product || null,
  });
  return resolved || 'free';
}

function toPaidMembership(planKey: BillingPlanKey, keepAccess: boolean): 'free' | 'amateur' | 'professional' {
  if (!keepAccess) return 'free';
  if (planKey === 'professional' || planKey === 'founder_professional') return 'professional';
  if (planKey === 'amateur' || planKey === 'founder_amateur') return 'amateur';
  return 'free';
}

export default async function handler(request: any, response: any) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await requireSupabaseAuth(request);
  if (!auth.ok) return response.status(auth.status).json({ error: auth.error });

  try {
    const body = typeof request.body === 'string' ? JSON.parse(request.body || '{}') : (request.body || {});
    const sessionId = String(body?.sessionId || '').trim();
    if (!sessionId) return response.status(400).json({ error: 'Missing sessionId' });

    const session = await fetchStripeCheckoutSession(sessionId);
    const referencedUserId = String(session?.client_reference_id || session?.metadata?.user_id || '').trim();
    if (referencedUserId && referencedUserId !== auth.userId) {
      return response.status(403).json({ error: 'Checkout session does not belong to this user.' });
    }

    const rawSubscription = session?.subscription || null;
    const subscription = !rawSubscription
      ? null
      : typeof rawSubscription === 'string'
        ? await fetchStripeSubscription(rawSubscription)
        : rawSubscription;

    const planKey = normalizePlanKey(session, subscription);
    const billingStatus = String(
      subscription?.status || (session?.payment_status === 'paid' ? 'active' : session?.status || 'unknown')
    ).trim() || 'unknown';
    const currentPeriodStart = safeIsoFromUnixSeconds(subscription?.current_period_start);
    const currentPeriodEnd = safeIsoFromUnixSeconds(subscription?.current_period_end);
    const cancelAtPeriodEnd = Boolean(subscription?.cancel_at_period_end);
    const resolution = resolveBillingPlan({
      planKey,
      billingStatus,
      cancelAtPeriodEnd,
      currentPeriodEnd,
      founderLockedPlan: null,
    });
    const membership = toPaidMembership(planKey, resolution.keepAccess);

    const stripeCustomer = session?.customer || null;
    const stripeCustomerId =
      typeof stripeCustomer === 'string'
        ? stripeCustomer
        : String(stripeCustomer?.id || '').trim() || null;

    const stripeSubscriptionId =
      String(subscription?.id || (typeof rawSubscription === 'string' ? rawSubscription : '') || '').trim() || null;
    const stripePriceId =
      String(subscription?.items?.data?.[0]?.price?.id || session?.line_items?.data?.[0]?.price?.id || '').trim() || null;
    const stripeProductId =
      String(subscription?.items?.data?.[0]?.price?.product || session?.line_items?.data?.[0]?.price?.product || '').trim() || null;

    const customerEmail =
      String(
        session?.customer_email ||
        (typeof stripeCustomer === 'object' && stripeCustomer ? stripeCustomer.email : '') ||
        ''
      ).trim().toLowerCase() || null;

    const founderProtected = planKey === 'founder_professional' || planKey === 'founder_amateur';

    const userPatch: Record<string, unknown> = {
      membership,
      trial_end_date: null,
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: stripeSubscriptionId,
      stripe_price_id: stripePriceId,
      stripe_status: billingStatus,
      stripe_current_period_end: currentPeriodEnd,
      stripe_cancel_at_period_end: cancelAtPeriodEnd,
    };
    if (founderProtected) userPatch.founding_circle_member = true;

    const { error: userError } = await auth.admin
      .from('users')
      .update(userPatch)
      .eq('id', auth.userId);
    if (userError) throw new Error(`user_sync_update_failed:${userError.message}`);

    if (stripeCustomerId) {
      await auth.admin
        .from('billing_customers')
        .upsert([{
          user_id: auth.userId,
          stripe_customer_id: stripeCustomerId,
          email: customerEmail,
          billing_provider: 'stripe',
          provider_status: 'synced',
          synced_at: new Date().toISOString(),
          source_updated_at: new Date().toISOString(),
        }], { onConflict: 'user_id' });
    }

    if (stripeSubscriptionId) {
      await auth.admin
        .from('subscriptions')
        .upsert([{
          user_id: auth.userId,
          stripe_customer_id: stripeCustomerId,
          stripe_subscription_id: stripeSubscriptionId,
          plan_key: resolution.planKey,
          billing_status: billingStatus,
          current_period_start: currentPeriodStart,
          current_period_end: currentPeriodEnd,
          cancel_at_period_end: cancelAtPeriodEnd,
          checkout_session_id: sessionId,
          price_id: stripePriceId,
          product_id: stripeProductId,
          source_of_truth: 'stripe',
          last_synced_at: new Date().toISOString(),
          source_updated_at: new Date().toISOString(),
        }], { onConflict: 'stripe_subscription_id' });
    }

    return response.status(200).json({
      ok: true,
      membership,
      billingStatus,
      planKey: resolution.planKey,
      stripeCustomerId,
      stripeSubscriptionId,
      stripePriceId,
    });
  } catch (error: any) {
    console.error('billing/confirm-checkout error:', error);
    return response.status(500).json({ error: error?.message || 'Checkout confirmation sync failed.' });
  }
}
