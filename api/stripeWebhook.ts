// Stripe webhook scaffold (Phase 5)
//
// This endpoint is intentionally conservative:
// - If STRIPE_WEBHOOK_SECRET is not set, it returns 200 (no-op).
// - Once Stripe is live, you can upgrade this to verify signatures and
//   write stripe_customer_id / subscription_id onto public.users.

export const config = {
  api: {
    bodyParser: true,
  },
};

function getEnv(name: string): string | null {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : null;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  // Not live yet: keep webhook as a safe no-op.
  const webhookSecret = getEnv('STRIPE_WEBHOOK_SECRET');
  if (!webhookSecret) {
    return res.status(200).json({ ok: true, noop: true });
  }

  // NOTE: Signature verification requires raw body. When you turn Stripe on,
  // switch bodyParser off and verify `Stripe-Signature` properly.
  // For now, accept the payload and log it for debugging.
  try {
    const sig = String(req?.headers?.['stripe-signature'] || '').trim();
    const event = req?.body || {};
    return res.status(200).json({ ok: true, received: true, hasSignature: Boolean(sig), type: String(event?.type || '') });
  } catch {
    return res.status(200).json({ ok: true, received: false });
  }
}
