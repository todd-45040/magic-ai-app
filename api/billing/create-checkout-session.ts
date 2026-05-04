import { requireSupabaseAuth } from '../_auth.js';
import { getBillingConfig, getBillingPlanPlaceholder, isBillingCheckoutLookupKey } from '../../server/billing/billingConfig.js';
import { resolveBillingStatusForUser } from '../../server/billing/status.js';
import { createStripeCheckoutSession, createStripeCustomer, fetchStripeSubscription, listStripeSubscriptionsByCustomer, updateStripeSubscription, type StripeSubscriptionRecord } from '../../server/billing/stripeClient.js';



function pickBestSubscription(rows: StripeSubscriptionRecord[] | undefined | null): StripeSubscriptionRecord | null {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
  if (!list.length) return null;

  const score = (row: StripeSubscriptionRecord) => {
    const status = String(row?.status || '').trim();
    const statusRank = status === 'active' ? 5 : status === 'trialing' ? 4 : status === 'past_due' ? 3 : status === 'incomplete' ? 2 : status === 'canceled' ? 1 : 0;
    const end = Number(row?.current_period_end || 0);
    return statusRank * 1_000_000_000 + end;
  };

  return [...list].sort((a, b) => score(b) - score(a))[0] || null;
}

async function resolveLiveSubscription(params: { stripeSubscriptionId?: string | null; stripeCustomerId?: string | null }): Promise<StripeSubscriptionRecord | null> {
  const directId = String(params.stripeSubscriptionId || '').trim();
  const customerId = String(params.stripeCustomerId || '').trim();

  let direct: StripeSubscriptionRecord | null = null;
  if (directId) {
    try {
      direct = await fetchStripeSubscription(directId);
    } catch {
      direct = null;
    }
  }

  if (!customerId) return direct;

  try {
    const listed = await listStripeSubscriptionsByCustomer(customerId);
    const best = pickBestSubscription(listed?.data);
    if (!best) return direct;
    if (!direct) return best;

    const directStatus = String(direct.status || '').trim();
    const bestStatus = String(best.status || '').trim();
    const directActive = directStatus === 'active' || directStatus === 'trialing';
    const bestActive = bestStatus === 'active' || bestStatus === 'trialing';
    if (best.id !== direct.id && bestActive && !directActive) return best;

    const bestEnd = Number(best.current_period_end || 0);
    const directEnd = Number(direct.current_period_end || 0);
    if (best.id !== direct.id && bestEnd > directEnd) return best;

    return direct;
  } catch {
    return direct;
  }
}

function ensureAbsoluteUrl(value: string, fallbackBase: string): string {
  const raw = String(value || '').trim();
  if (!raw) return fallbackBase;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${fallbackBase.replace(/\/$/, '')}/${raw.replace(/^\//, '')}`;
}

export default async function handler(request: any, response: any) {
  try {
    if (request.method !== 'POST') {
      return response.status(405).json({ error: 'Method not allowed' });
    }

    const auth = await requireSupabaseAuth(request);
    if (!auth.ok) {
      return response.status(auth.status).json({ error: auth.error || 'Unauthorized' });
    }

    const planKey = request?.body?.planKey;
    if (!isBillingCheckoutLookupKey(planKey)) {
      return response.status(400).json({
        error: 'Invalid plan key. Client must send an internal billing lookup key only.',
      });
    }

    const billingStatus = await resolveBillingStatusForUser(auth.admin, auth.userId);
    const target = getBillingPlanPlaceholder(planKey);
    const samePlanCycleChange = billingStatus.planKey === target.internalPlanKey;
    const allowedTarget = samePlanCycleChange || billingStatus.upgradeTargets.includes(target.internalPlanKey);

    if (!allowedTarget) {
      return response.status(403).json({
        error: 'Requested upgrade path is not allowed for this account.',
        currentPlan: billingStatus.planKey,
        allowedTargets: billingStatus.upgradeTargets,
        requestedPlan: target.internalPlanKey,
      });
    }

    const config = getBillingConfig();

    if (!config.stripeConfigured || !target.configuredStripePriceId) {
      return response.status(200).json({
        ok: true,
        mode: 'placeholder',
        stripeConfigured: false,
        message: 'Stripe not configured yet',
        targetPlanKey: target.internalPlanKey,
        targetLookupKey: target.internalLookupKey,
        successUrl: config.successUrl,
        cancelUrl: config.cancelUrl,
      });
    }

    const { data: profile, error: profileError } = await auth.admin
      .from('users')
      .select('id, email, stripe_customer_id, founding_circle_member, pricing_lock, founding_bucket')
      .eq('id', auth.userId)
      .maybeSingle();

    if (profileError) {
      throw new Error(profileError.message || 'Unable to load user profile for billing.');
    }

    const [{ data: billingCustomer, error: billingCustomerError }, { data: subscriptionRow, error: subscriptionRowError }] = await Promise.all([
      auth.admin
        .from('billing_customers')
        .select('id, stripe_customer_id')
        .eq('user_id', auth.userId)
        .maybeSingle(),
      auth.admin
        .from('subscriptions')
        .select('id, stripe_subscription_id, stripe_customer_id, plan_key, billing_status, price_id')
        .eq('user_id', auth.userId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (billingCustomerError) {
      throw new Error(billingCustomerError.message || 'Unable to inspect billing customer record.');
    }
    if (subscriptionRowError) {
      throw new Error(subscriptionRowError.message || 'Unable to inspect current subscription record.');
    }

    let customerId = String(
      billingCustomer?.stripe_customer_id ||
      subscriptionRow?.stripe_customer_id ||
      profile?.stripe_customer_id ||
      ''
    ).trim() || undefined;
    const email = String(profile?.email || '').trim() || undefined;

    // Permanent customer mapping fix:
    // If this user does not already have a Stripe customer, create one before checkout,
    // persist it in both legacy users.stripe_customer_id and billing_customers, and pass
    // that same customer into Checkout. This prevents Stripe from creating an unmapped
    // customer that the webhook cannot match later.
    if (!customerId) {
      const createdCustomer = await createStripeCustomer({
        email,
        metadata: {
          user_id: auth.userId,
          source: 'create_checkout_session',
          environment_name: config.environmentName,
        },
      });

      customerId = String(createdCustomer?.id || '').trim() || undefined;

      if (!customerId) {
        throw new Error('Stripe returned no customer id during checkout customer creation.');
      }

      const { error: userCustomerError } = await auth.admin
        .from('users')
        .update({ stripe_customer_id: customerId })
        .eq('id', auth.userId);

      if (userCustomerError) {
        throw new Error(`Unable to save Stripe customer id on user: ${userCustomerError.message}`);
      }

      const { error: billingCustomerUpsertError } = await auth.admin
        .from('billing_customers')
        .upsert([{
          user_id: auth.userId,
          stripe_customer_id: customerId,
          email,
          billing_provider: 'stripe',
          provider_status: 'created_for_checkout',
          synced_at: new Date().toISOString(),
          source_updated_at: new Date().toISOString(),
        }], { onConflict: 'user_id' });

      if (billingCustomerUpsertError) {
        throw new Error(`Unable to save billing customer record: ${billingCustomerUpsertError.message}`);
      }
    }

    const founderProtected = Boolean(
      billingStatus.founderProtected || profile?.founding_circle_member || String(profile?.pricing_lock || '').trim()
    );

    if (samePlanCycleChange && customerId) {
      const liveSubscription = await resolveLiveSubscription({
        stripeSubscriptionId: String(subscriptionRow?.stripe_subscription_id || '').trim() || null,
        stripeCustomerId: customerId,
      });

      const subscriptionId = String(liveSubscription?.id || '').trim();
      const subscriptionItemId = String(liveSubscription?.items?.data?.[0]?.id || '').trim();
      // Partner/product trials can have Professional access without a Stripe subscription yet.
      // In that case, do not block checkout; fall through and create the first paid subscription.
      if (subscriptionId && subscriptionItemId) {
        const updated = await updateStripeSubscription(subscriptionId, {
          cancel_at_period_end: false,
          billing_cycle_anchor: 'now',
          proration_behavior: 'create_prorations',
          items: [{
            id: subscriptionItemId,
            price: target.configuredStripePriceId,
          }],
          metadata: {
            user_id: auth.userId,
            internal_plan_key: target.internalPlanKey,
            checkout_lookup_key: target.internalLookupKey,
            tier_requested: target.internalPlanKey.includes('professional') ? 'professional' : 'amateur',
            founding_member: (founderProtected || target.founderOnly) ? 'true' : 'false',
            founder_offer: target.founderOnly ? 'true' : 'false',
            pricing_lock: target.founderOnly || billingStatus.founderLockedPlan
              ? String(profile?.pricing_lock || billingStatus.founderLockedPlan || 'founding_member_2026')
              : String(profile?.pricing_lock || ''),
            founding_bucket: String(profile?.founding_bucket || ''),
            environment_name: config.environmentName,
          },
        });

        return response.status(200).json({
          ok: true,
          stripeConfigured: true,
          targetPlanKey: target.internalPlanKey,
          targetLookupKey: target.internalLookupKey,
          cycleSwitchApplied: true,
          billingAction: 'subscription_update',
          subscriptionId: String(updated?.id || subscriptionId),
          message: 'Billing cycle updated on the existing Stripe subscription.',
        });
      }
    }

    const successUrl = ensureAbsoluteUrl(
      request?.body?.successUrl || config.successUrl,
      config.appBaseUrl,
    );
    const cancelUrl = ensureAbsoluteUrl(
      request?.body?.cancelUrl || config.cancelUrl,
      config.appBaseUrl,
    );

    const session = await createStripeCheckoutSession({
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: auth.userId,
      customer: customerId,
      customer_email: undefined,
      allow_promotion_codes: !target.founderOnly,
      line_items: [{
        price: target.configuredStripePriceId,
        quantity: 1,
      }],
      metadata: {
        user_id: auth.userId,
        internal_plan_key: target.internalPlanKey,
        checkout_lookup_key: target.internalLookupKey,
        tier_requested: target.internalPlanKey.includes('professional') ? 'professional' : 'amateur',
        founding_member: (founderProtected || target.founderOnly) ? 'true' : 'false',
        founder_offer: target.founderOnly ? 'true' : 'false',
        pricing_lock: target.founderOnly || billingStatus.founderLockedPlan
          ? String(profile?.pricing_lock || billingStatus.founderLockedPlan || 'founding_member_2026')
          : String(profile?.pricing_lock || ''),
        founding_bucket: String(profile?.founding_bucket || ''),
        environment_name: config.environmentName,
      },
      subscription_data: {
        metadata: {
          user_id: auth.userId,
          internal_plan_key: target.internalPlanKey,
          checkout_lookup_key: target.internalLookupKey,
          tier_requested: target.internalPlanKey.includes('professional') ? 'professional' : 'amateur',
          founding_member: (founderProtected || target.founderOnly) ? 'true' : 'false',
          founder_offer: target.founderOnly ? 'true' : 'false',
          pricing_lock: target.founderOnly || billingStatus.founderLockedPlan
            ? String(profile?.pricing_lock || billingStatus.founderLockedPlan || 'founding_member_2026')
            : String(profile?.pricing_lock || ''),
          founding_bucket: String(profile?.founding_bucket || ''),
        },
      },
    });

    if (!session?.url) {
      throw new Error('Stripe returned no checkout URL.');
    }

    return response.status(200).json({
      ok: true,
      stripeConfigured: true,
      targetPlanKey: target.internalPlanKey,
      targetLookupKey: target.internalLookupKey,
      url: session.url,
    });
  } catch (err: any) {
    console.error('billing/create-checkout-session error:', err);
    return response.status(500).json({ error: err?.message || 'checkout creation failed' });
  }
}
