import { requireSupabaseAuth } from '../_auth.js';
import { getBillingConfig } from '../../server/billing/billingConfig.js';
import { createStripeBillingPortalSession } from '../../server/billing/stripeClient.js';

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

    const config = getBillingConfig();

    const { data: billingCustomer, error } = await auth.admin
      .from('billing_customers')
      .select('id, stripe_customer_id')
      .eq('user_id', auth.userId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message || 'Unable to inspect billing customer record.');
    }

    const billingCustomerExists = Boolean(billingCustomer?.id);
    const stripeCustomerId = String(billingCustomer?.stripe_customer_id || '').trim();

    if (!config.stripeConfigured) {
      return response.status(200).json({
        ok: true,
        mode: 'placeholder',
        stripeConfigured: false,
        billingCustomerExists,
        message: billingCustomerExists
          ? 'Billing portal will become available after Stripe is connected.'
          : 'Billing portal will become available after Stripe is connected and a billing customer record exists.',
        returnUrl: config.portalReturnUrl,
      });
    }

    if (!billingCustomerExists || !stripeCustomerId) {
      return response.status(404).json({
        error: 'No Stripe billing customer exists for this account yet.',
        stripeConfigured: true,
      });
    }

    const portal = await createStripeBillingPortalSession({
      customer: stripeCustomerId,
      return_url: ensureAbsoluteUrl(request?.body?.returnUrl || config.portalReturnUrl, config.appBaseUrl),
    });

    if (!portal?.url) {
      throw new Error('Stripe returned no portal URL.');
    }

    return response.status(200).json({
      ok: true,
      stripeConfigured: true,
      billingCustomerExists: true,
      url: portal.url,
    });
  } catch (err: any) {
    console.error('billing/create-portal-session error:', err);
    return response.status(500).json({ error: err?.message || 'portal creation failed' });
  }
}
