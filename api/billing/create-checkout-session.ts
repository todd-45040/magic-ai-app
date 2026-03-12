/**
 * Billing flow guardrail:
 * - entitlements are resolved from server-side billing state
 * - checkout return must not grant access
 * - future live access changes reconcile through verified webhook processing
 */

import { requireSupabaseAuth } from '../_auth.js';
import { getBillingConfig, getBillingPlanPlaceholder, isBillingCheckoutLookupKey } from '../../server/billing/billingConfig.js';
import { resolveBillingStatusForUser } from '../../server/billing/status.js';

export default async function handler(request: any, response: any) {
  try {
    if (request.method !== 'POST') {
      return response.status(405).json({ error: 'Method not allowed' });
    }

    const auth = await requireSupabaseAuth(request);
    if (!auth.ok) {
      return response.status(auth.status).json({ error: auth.error || 'Unauthorized' });
    }

    const lookupKey = request?.body?.lookupKey;
    if (!isBillingCheckoutLookupKey(lookupKey)) {
      return response.status(400).json({
        error: 'Invalid plan key. Client must send an internal billing lookup key only.',
      });
    }

    const billingStatus = await resolveBillingStatusForUser(auth.admin, auth.userId);
    const checkoutTarget = getBillingPlanPlaceholder(lookupKey);
    const allowedTarget = billingStatus.upgradeTargets.includes(checkoutTarget.membershipTier);

    if (!allowedTarget) {
      return response.status(403).json({
        error: 'Requested upgrade path is not allowed for this account.',
        currentMembershipTier: billingStatus.membershipTier,
        allowedTargets: billingStatus.upgradeTargets,
        requestedMembershipTier: checkoutTarget.membershipTier,
      });
    }

    if (checkoutTarget.founderOnly && !billingStatus.founderProtected) {
      return response.status(403).json({
        error: 'Founder pricing is protected and is not available for this account.',
      });
    }

    const config = getBillingConfig();

    if (!config.stripeConfigured) {
      return response.status(200).json({
        ok: true,
        mode: 'placeholder',
        stripeConfigured: false,
        message: 'Stripe not configured yet',
        membershipTier: checkoutTarget.membershipTier,
        lookupKey: checkoutTarget.lookupKey,
        successUrl: config.successUrl,
        cancelUrl: config.cancelUrl,
      });
    }

    return response.status(501).json({
      error: 'Stripe checkout session creation is not connected yet.',
      membershipTier: checkoutTarget.membershipTier,
      lookupKey: checkoutTarget.lookupKey,
    });
  } catch (err: any) {
    console.error('billing/create-checkout-session error:', err);
    return response.status(500).json({ error: err?.message || 'checkout scaffold failed' });
  }
}
