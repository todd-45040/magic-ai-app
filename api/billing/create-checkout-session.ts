import { requireSupabaseAuth } from '../_auth.js';
import { getBillingConfig, getBillingPlanPlaceholder, isBillingCheckoutLookupKey } from '../../server/billing/billingConfig.js';
import { resolveBillingStatusForUser } from '../../server/billing/status.js';
import { createStripeCheckoutSession } from '../../server/billing/stripeClient.js';

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
    const currentBaseTier = billingStatus.planKey === 'founder_amateur' ? 'amateur' : billingStatus.planKey === 'founder_professional' ? 'professional' : billingStatus.planKey;
    const requestedBaseTier = target.internalPlanKey === 'founder_amateur' ? 'amateur' : target.internalPlanKey === 'founder_professional' ? 'professional' : target.internalPlanKey;
    const sameTierCycleChange = currentBaseTier === requestedBaseTier && currentBaseTier !== 'free';
    const allowedTarget = sameTierCycleChange || billingStatus.upgradeTargets.includes(target.internalPlanKey);

    if (!allowedTarget) {
      return response.status(403).json({
        error: 'Requested billing path is not allowed for this account.',
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
      .select('id, email, founding_circle_member, pricing_lock, founding_bucket')
      .eq('id', auth.userId)
      .maybeSingle();

    if (profileError) {
      throw new Error(profileError.message || 'Unable to load user profile for billing.');
    }

    const { data: billingCustomer, error: billingCustomerError } = await auth.admin
      .from('billing_customers')
      .select('id, stripe_customer_id')
      .eq('user_id', auth.userId)
      .maybeSingle();

    if (billingCustomerError) {
      throw new Error(billingCustomerError.message || 'Unable to inspect billing customer record.');
    }

    const customerId = String(billingCustomer?.stripe_customer_id || '').trim() || undefined;
    const email = String(profile?.email || '').trim() || undefined;
    const founderProtected = Boolean(
      billingStatus.founderProtected || profile?.founding_circle_member || String(profile?.pricing_lock || '').trim()
    );

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
      customer_email: customerId ? undefined : email,
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
