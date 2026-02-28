// Stripe webhook (Founder Allocation Enforcement + Stripe scaffold)
//
// IMPORTANT:
// - Signature verification requires raw body. When you turn Stripe fully live,
//   switch bodyParser off and verify Stripe-Signature properly.
// - This implementation focuses on *allocation enforcement* as a safety net.
//   The primary enforcement should happen pre-checkout in /api/stripeCheckout.
//
// Behavior:
// - If STRIPE_WEBHOOK_SECRET is not set, returns 200 (no-op).
// - If founder pricing is detected and caps are exceeded, cancels the subscription
//   immediately via Stripe API (best-effort), and logs the condition.

import { createClient } from '@supabase/supabase-js';

export const config = {
  api: {
    bodyParser: true,
  },
};

function getEnv(name: string): string | null {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : null;
}

function getAdminClient() {
  const supabaseUrl = getEnv('SUPABASE_URL');
  const serviceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function isFounderPricing(meta: any): boolean {
  const v = String(meta?.pricing_lock || meta?.founding_member || '').toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

function normalizeBucket(meta: any): 'admc_2026' | 'reserve_2026' {
  const b = String(meta?.founding_bucket || meta?.founding_source || '').toLowerCase();
  if (b.includes('reserve')) return 'reserve_2026';
  return 'admc_2026';
}

async function cancelSubscriptionBestEffort(subscriptionId: string, reason: string) {
  const stripeKey = getEnv('STRIPE_SECRET_KEY');
  if (!stripeKey) return { ok: false, error: 'no_stripe_key' };

  try {
    // Cancel immediately (Stripe REST; no SDK dependency).
    const r = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${stripeKey}` },
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({} as any));
      return { ok: false, error: 'stripe_cancel_failed', details: j, reason };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: 'stripe_cancel_exception', details: String(e?.message || e || ''), reason };
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  // Not live yet: keep webhook as a safe no-op.
  const webhookSecret = getEnv('STRIPE_WEBHOOK_SECRET');
  if (!webhookSecret) {
    return res.status(200).json({ ok: true, noop: true });
  }

  const admin = getAdminClient();
  if (!admin) {
    return res.status(200).json({ ok: true, received: false, error: 'supabase_not_configured' });
  }

  try {
    const sig = String(req?.headers?.['stripe-signature'] || '').trim();
    const event = req?.body || {};
    const type = String(event?.type || '');
    const obj = (event?.data?.object || {}) as any;
    const meta = (obj?.metadata || {}) as any;

    // We only care about events that can carry a subscription id + metadata.
    const relevant =
      type === 'checkout.session.completed' ||
      type === 'customer.subscription.created' ||
      type === 'customer.subscription.updated';

    if (!relevant) {
      return res.status(200).json({ ok: true, received: true, hasSignature: Boolean(sig), type });
    }

    if (!isFounderPricing(meta)) {
      return res.status(200).json({ ok: true, received: true, hasSignature: Boolean(sig), type, founder: false });
    }

    const userId = String(meta?.user_id || '').trim();
    const desiredBucket = normalizeBucket(meta);

    if (!userId) {
      // Can't enforce without user id; log and return.
      console.warn('[stripeWebhook] founder pricing missing user_id in metadata', { type });
      return res.status(200).json({ ok: true, received: true, hasSignature: Boolean(sig), type, enforced: false, reason: 'missing_user_id' });
    }

    // Atomically claim/verify capacity (safety net; primary enforcement is pre-checkout).
    const { data: claimRows, error: claimErr } = await admin.rpc('maw_claim_founding_bucket', {
      p_user_id: userId,
      p_bucket: desiredBucket,
    });

    const claim = Array.isArray(claimRows) ? (claimRows[0] as any) : (claimRows as any);

    if (claimErr || !claim?.ok) {
      const reason = String(claim?.reason || claimErr?.message || 'limit_reached');
      console.warn('[stripeWebhook] founder allocation exceeded; canceling subscription', { reason, userId, type });

      // Best-effort cancellation if we have a subscription id.
      const subscriptionId =
        type === 'checkout.session.completed'
          ? String(obj?.subscription || '').trim()
          : String(obj?.id || '').trim();

      let cancel: any = null;
      if (subscriptionId) {
        cancel = await cancelSubscriptionBestEffort(subscriptionId, reason);
      }

      return res.status(200).json({
        ok: true,
        received: true,
        hasSignature: Boolean(sig),
        type,
        enforced: true,
        allocation_ok: false,
        reason,
        subscriptionCanceled: Boolean(cancel?.ok),
      });
    }

    return res.status(200).json({
      ok: true,
      received: true,
      hasSignature: Boolean(sig),
      type,
      enforced: true,
      allocation_ok: true,
      bucket: desiredBucket,
      admc_count: claim?.admc_count ?? null,
      total_count: claim?.total_count ?? null,
    });
  } catch (e: any) {
    return res.status(200).json({ ok: true, received: false, error: String(e?.message || e || '') });
  }
}
