import { requireSupabaseAuth } from './_auth';

function hasEnv(name: string): boolean {
  const v = process.env[name];
  return !!(v && String(v).trim());
}

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

function pickPriceId(tier: Tier, billing: Billing, founderLocked: boolean): { priceId: string | null; couponId: string | null; strategy: 'founder_price' | 'coupon' | 'normal' | 'missing' } {
  const amateurMonthly = getEnv('STRIPE_PRICE_AMATEUR_MONTHLY');
  const amateurAnnual = getEnv('STRIPE_PRICE_AMATEUR_ANNUAL');
  const proMonthly = getEnv('STRIPE_PRICE_PRO_MONTHLY');
  const proAnnual = getEnv('STRIPE_PRICE_PRO_ANNUAL');

  const founderProMonthly = getEnv('STRIPE_PRICE_PRO_FOUNDER_MONTHLY');
  const founderProAnnual = getEnv('STRIPE_PRICE_PRO_FOUNDER_ANNUAL');
  const founderCoupon = getEnv('STRIPE_COUPON_FOUNDER_PRO');

  if (tier === 'amateur') {
    const priceId = billing === 'annual' ? amateurAnnual : amateurMonthly;
    return { priceId: priceId || null, couponId: null, strategy: priceId ? 'normal' : 'missing' };
  }

  // professional
  if (founderLocked) {
    const founderPriceId = billing === 'annual' ? founderProAnnual : founderProMonthly;
    if (founderPriceId) return { priceId: founderPriceId, couponId: null, strategy: 'founder_price' };
    if (founderCoupon) return { priceId: (billing === 'annual' ? proAnnual : proMonthly) || null, couponId: founderCoupon, strategy: (billing === 'annual' ? proAnnual : proMonthly) ? 'coupon' : 'missing' };
    // fall through to normal
  }

  const normal = billing === 'annual' ? proAnnual : proMonthly;
  return { priceId: normal || null, couponId: null, strategy: normal ? 'normal' : 'missing' };
}

export default async function handler(req: any, res: any) {
  const auth = await requireSupabaseAuth(req);
  if (!auth.ok) return res.status(auth.status).json(auth);

  const admin = auth.admin;

  // env checks (server-side only)
  const envChecks: Record<string, boolean> = {
    STRIPE_SECRET_KEY: hasEnv('STRIPE_SECRET_KEY'),
    STRIPE_WEBHOOK_SECRET: hasEnv('STRIPE_WEBHOOK_SECRET'),
    STRIPE_PRICE_AMATEUR_MONTHLY: hasEnv('STRIPE_PRICE_AMATEUR_MONTHLY'),
    STRIPE_PRICE_AMATEUR_ANNUAL: hasEnv('STRIPE_PRICE_AMATEUR_ANNUAL'),
    STRIPE_PRICE_PRO_MONTHLY: hasEnv('STRIPE_PRICE_PRO_MONTHLY'),
    STRIPE_PRICE_PRO_ANNUAL: hasEnv('STRIPE_PRICE_PRO_ANNUAL'),
    STRIPE_PRICE_PRO_FOUNDER_MONTHLY: hasEnv('STRIPE_PRICE_PRO_FOUNDER_MONTHLY'),
    STRIPE_PRICE_PRO_FOUNDER_ANNUAL: hasEnv('STRIPE_PRICE_PRO_FOUNDER_ANNUAL'),
    STRIPE_COUPON_FOUNDER_PRO: hasEnv('STRIPE_COUPON_FOUNDER_PRO'),
  };

  // Founder lock stats
  const [{ count: foundersTotal }, { count: foundersLocked }] = await Promise.all([
    admin.from('users').select('id', { count: 'exact', head: true }).eq('founding_circle_member', true),
    admin
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('founding_circle_member', true)
      .not('pricing_lock', 'is', null),
  ]).then((arr: any[]) => arr.map((r) => ({ count: r?.count ?? 0 })));

  const lockedPct = foundersTotal > 0 ? Math.round((foundersLocked / foundersTotal) * 1000) / 10 : 0;

  // Dry run checkout (optional)
  const dryRunRequested = String(req?.query?.dryRun || req?.query?.dry_run || '').trim() === '1';
  let dryRun: any = { attempted: false };

  if (dryRunRequested) {
    const stripeKey = getEnv('STRIPE_SECRET_KEY');
    const origin = getOrigin(req);

    const isTestKey = !!(stripeKey && stripeKey.startsWith('sk_test'));
    const founderLocked = foundersLocked > 0; // if we have founders, test founder path; else normal
    const { priceId, couponId, strategy } = pickPriceId('professional', 'monthly', founderLocked);

    if (!stripeKey) {
      dryRun = { attempted: true, ok: false, error: 'Missing STRIPE_SECRET_KEY.' };
    } else if (!priceId) {
      dryRun = { attempted: true, ok: false, error: 'Missing price id for dry run.', strategy };
    } else {
      const params = new URLSearchParams();
      params.set('mode', 'subscription');
      params.set('line_items[0][price]', priceId);
      params.set('line_items[0][quantity]', '1');
      params.set('success_url', `${origin}/membership?stripe=success&dryRun=1`);
      params.set('cancel_url', `${origin}/membership?stripe=cancel&dryRun=1`);
      params.set('client_reference_id', `stripe_readiness_dry_run_${Date.now()}`);
      params.set('metadata[source]', 'admin_stripe_readiness');
      params.set('metadata[dry_run]', 'true');
      params.set('metadata[founding_member]', founderLocked ? 'true' : 'false');
      params.set('metadata[pricing_lock]', founderLocked ? 'true' : 'false');
      if (founderLocked) params.set('metadata[pricing_lock_key]', 'founding_pro_admc_2026');
      if (couponId) {
        params.set('discounts[0][coupon]', couponId);
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
          dryRun = { attempted: true, ok: false, error: j?.error?.message || 'Stripe dry run failed.', details: j, isTestKey, strategy, priceId, couponId: couponId || null };
        } else {
          dryRun = { attempted: true, ok: true, session_id: j?.id || null, isTestKey, strategy, priceId, couponId: couponId || null };
        }
      } catch (e: any) {
        dryRun = { attempted: true, ok: false, error: e?.message || 'Stripe dry run exception.', isTestKey, strategy, priceId, couponId: couponId || null };
      }
    }
  }

  return res.status(200).json({
    ok: true,
    env: envChecks,
    founders: {
      founders_total: foundersTotal,
      founders_with_lock: foundersLocked,
      founders_lock_pct: lockedPct,
    },
    dryRun,
  });
}
