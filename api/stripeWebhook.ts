import { processStripeWebhook, readRawBody } from '../server/billing/stripeWebhook.js';
import { getStripeEnvironmentReport } from '../server/billing/stripeConfig.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const envReport = getStripeEnvironmentReport();
  if (!envReport.webhookSecretConfigured && !envReport.webhookSecretNextConfigured) {
    return res.status(503).json({ ok: false, error: 'Stripe webhook secret is not configured.' });
  }

  try {
    const rawBody = await readRawBody(req);
    const signatureHeader = String(req?.headers?.['stripe-signature'] || '').trim();
    const requestId = String(req?.headers?.['stripe-request-id'] || req?.headers?.['request-id'] || '').trim() || null;

    const result = await processStripeWebhook({ rawBody, signatureHeader, requestId });

    if (!result.ok && result.received === false) {
      const status = result.error === 'missing_signature_header' || result.error === 'signature_mismatch' || result.error === 'timestamp_out_of_tolerance'
        ? 400
        : 503;
      return res.status(status).json(result);
    }

    if (!result.ok) {
      return res.status(500).json(result);
    }

    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(500).json({ ok: false, received: false, error: String(error?.message || error || 'Webhook processing failed') });
  }
}
