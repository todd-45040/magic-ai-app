import { requireSupabaseAuth } from './_auth';

function getEnv(name: string): string | null {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : null;
}

function getOrigin(req: any): string {
  const o = String(req?.headers?.origin || '').trim();
  if (o) return o;
  const host = String(req?.headers?.host || '').trim();
  if (!host) return 'https://example.com';
  const proto = String(req?.headers?.['x-forwarded-proto'] || 'https');
  return `${proto}://${host}`;
}

type Tier = 'amateur' | 'professional';
type Billing = 'monthly' | 'annual';


function inferBucketFromProfile(profile: any): 'admc_2026' | 'reserve_2026' {
  const explicit = String(profile?.founding_bucket || '').trim();
  if (explicit === 'admc_2026' || explicit === 'reserve_2026') return explicit as any;

  const src = String(profile?.founding_source || '').toLowerCase();
  if (src.includes('admc') || src.includes('convention') || src.includes('booth') || src.includes('table')) return 'admc_2026';

  // Default: keep founder pricing tied to ADMC allocation unless explicitly marked as reserve.
  return 'admc_2026';
}


function pickPriceId(tier: Tier, billing: Billing, founderLocked: boolean): { priceId: string | null; couponId: string | null } {
  // Default (public) price ids
  const amateurMonthly = getEnv('STRIPE_PRICE_AMATEUR_MONTHLY');
  const amateurAnnual = getEnv('STRIPE_PRICE_AMATEUR_ANNUAL');
  const proMonthly = getEnv('STRIPE_PRICE_PRO_MONTHLY');
  const proAnnual = getEnv('STRIPE_PRICE_PRO_ANNUAL');

  // Founder-specific options
  const founderProMonthly = getEnv('STRIPE_PRICE_PRO_FOUNDER_MONTHLY');
  const founderProAnnual = getEnv('STRIPE_PRICE_PRO_FOUNDER_ANNUAL');
  const founderProCoupon = getEnv('STRIPE_COUPON_FOUNDER_PRO');

  if (tier === 'amateur') {
    return { priceId: billing === 'annual' ? amateurAnnual : amateurMonthly, couponId: null };
  }

  // Professional
  if (founderLocked) {
    // Prefer a dedicated founder price id (cleanest).
    const founderPrice = billing === 'annual' ? founderProAnnual : founderProMonthly;
    if (founderPrice) return { priceId: founderPrice, couponId: null };

    // Fallback: use the public price + hidden coupon.
    const publicPrice = billing === 'annual' ? proAnnual : proMonthly;
    return { priceId: publicPrice, couponId: founderProCoupon };
  }

  return { priceId: billing === 'annual' ? proAnnual : proMonthly, couponId: null };
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const stripeKey = getEnv('STRIPE_SECRET_KEY');
  if (!stripeKey) {
    return res.status(503).json({ ok: false, error: 'Stripe is not configured yet.' });
  }

  const auth = await requireSupabaseAuth(req);
  if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

  const body = (req.body || {}) as { tier?: Tier; billing?: Billing };
  const tier = (body.tier || 'professional') as Tier;
  const billing = (body.billing || 'monthly') as Billing;

  if (!['amateur', 'professional'].includes(tier)) {
    return res.status(400).json({ ok: false, error: 'Invalid tier' });
  }
  if (!['monthly', 'annual'].includes(billing)) {
    return res.status(400).json({ ok: false, error: 'Invalid billing' });
  }

  // Load user profile so pricing locks can override pricing forever.
  let profile: any = null;
  try {
    const { data } = await auth.admin.from('users').select('email,founding_circle_member,founding_joined_at,founding_source,founding_bucket,pricing_lock').eq('id', auth.userId).maybeSingle();
    profile = data || null;
  } catch {
    profile = null;
  }

  const email = String(profile?.email || '').trim();
  const foundingMember = Boolean(profile?.founding_circle_member);
  const foundingJoinedAt = profile?.founding_joined_at ? String(profile.founding_joined_at) : '';
  const foundingSource = profile?.founding_source ? String(profile.founding_source) : '';
  const pricingLockKey = profile?.pricing_lock ? String(profile.pricing_lock) : '';

  const founderLocked = Boolean(pricingLockKey || foundingMember);

  // Step 1 (Allocation Enforcement):
  // If user is attempting to use founder pricing, atomically claim/verify capacity server-side.
  if (tier === 'professional' && founderLocked) {
    const desiredBucket = inferBucketFromProfile(profile);
    try {
      const { data: claimRows, error: claimErr } = await auth.admin.rpc('maw_claim_founding_bucket', {
        p_user_id: auth.userId,
        p_bucket: desiredBucket,
      });
      const claim = Array.isArray(claimRows) ? (claimRows[0] as any) : (claimRows as any);
      if (claimErr || !claim?.ok) {
        const reason = String(claim?.reason || claimErr?.message || 'limit_reached');
        return res.status(409).json({
          ok: false,
          error_code: 'FOUNDERS_CLOSED',
          message:
            reason === 'admc_limit_reached'
              ? 'ADMC Founders Circle is full (75/75).'
              : reason === 'total_limit_reached'
              ? 'Founders Circle is full.'
              : 'Founder pricing is currently unavailable.',
        });
      }
    } catch {
      return res.status(409).json({ ok: false, error_code: 'FOUNDERS_CLOSED', message: 'Founder pricing is currently unavailable.' });
    }
  }

  const { priceId, couponId } = pickPriceId(tier, billing, founderLocked);
  if (!priceId) {
    return res.status(503).json({ ok: false, error: 'Stripe price IDs are not configured yet.' });
  }

  const origin = getOrigin(req);
  const successUrl = `${origin}/app/?stripe=success&tier=${encodeURIComponent(tier)}`;
  const cancelUrl = `${origin}/app/?stripe=cancel`;

  // Stripe Checkout API (REST) – no stripe SDK dependency required.
  const params = new URLSearchParams();
  params.set('mode', 'subscription');
  if (email) params.set('customer_email', email);
  params.set('success_url', successUrl);
  params.set('cancel_url', cancelUrl);

  params.set('line_items[0][price]', priceId);
  params.set('line_items[0][quantity]', '1');

  // Hidden coupon fallback for founders (if you choose that route).
  if (couponId) {
    params.set('discounts[0][coupon]', couponId);
  }

  // Metadata strategy (persists into Stripe objects if you copy it in webhook later)
  params.set('metadata[app]', 'magic_ai_wizard');
  params.set('metadata[tier_requested]', tier);
  params.set('metadata[billing]', billing);
  params.set('metadata[user_id]', auth.userId);
  params.set('metadata[founding_member]', foundingMember ? 'true' : 'false');
  if (foundingJoinedAt) params.set('metadata[founding_joined_at]', foundingJoinedAt);
  if (foundingSource) params.set('metadata[founding_source]', foundingSource);
  if (pricingLockKey) {
    params.set('metadata[pricing_lock]', 'true');
    params.set('metadata[pricing_lock_key]', pricingLockKey);
  } else {
    params.set('metadata[pricing_lock]', founderLocked ? 'true' : 'false');
    if (founderLocked) params.set('metadata[pricing_lock_key]', 'founding_pro_admc_2026');
  }

  try {
    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const j = await r.json().catch(() => ({} as any));
    if (!r.ok) {
      return res.status(500).json({ ok: false, error: 'Stripe checkout failed', details: j });
    }

    const url = String((j as any)?.url || '').trim();
    if (!url) {
      return res.status(500).json({ ok: false, error: 'Stripe did not return a checkout URL.' });
    }

    return res.status(200).json({ ok: true, url });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: 'Stripe request failed', details: String(e?.message || e || '') });
  }
}
