import { requireSupabaseAuth } from '../_auth.js';
import { getBillingConfig } from '../../server/billing/billingConfig.js';

export default async function handler(request: any, response: any) {
  try {
    if (request.method !== 'POST') {
      return response.status(405).json({ error: 'Method not allowed' });
    }

    const auth = await requireSupabaseAuth(request);
    if (!auth.ok) {
      return response.status(auth.status).json({ error: auth.error || 'Unauthorized' });
    }

    const { data: billingCustomer, error } = await auth.admin
      .from('billing_customers')
      .select('id, stripe_customer_id')
      .eq('user_id', auth.userId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message || 'Unable to inspect billing customer record.');
    }

    if (!billingCustomer?.id) {
      return response.status(404).json({
        error: 'No billing customer exists for this account yet.',
        stripeConfigured: false,
      });
    }

    const config = getBillingConfig();
    if (!config.stripeConfigured) {
      return response.status(200).json({
        ok: true,
        mode: 'placeholder',
        stripeConfigured: false,
        billingCustomerExists: true,
        message: 'Stripe customer portal is not configured yet',
        returnUrl: config.portalReturnUrl,
      });
    }

    return response.status(501).json({
      error: 'Stripe customer portal is not connected yet.',
      billingCustomerExists: true,
    });
  } catch (err: any) {
    console.error('billing/create-portal-session error:', err);
    return response.status(500).json({ error: err?.message || 'portal scaffold failed' });
  }
}
