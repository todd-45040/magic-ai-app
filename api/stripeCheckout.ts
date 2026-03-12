/**
 * @deprecated Legacy Stripe checkout route retained only as a hard-stop guard.
 *
 * Phase 1C billing cleanup:
 * - Normal upgrade CTAs must route through:
 *   onUpgrade(planKey) -> billingClient.createCheckoutSession(planKey)
 *   -> POST /api/billing/create-checkout-session
 * - Client-side checkout returns must never grant entitlements.
 * - This route intentionally does not construct or serve success/cancel URLs.
 *
 * If this handler is ever hit, an inactive legacy flow is still wired somewhere
 * in the UI or in a stale deployment artifact and should be removed.
 */
export default async function handler(_req: any, res: any) {
  return res.status(410).json({
    ok: false,
    deprecated: true,
    error: 'Legacy checkout route is disabled. Use /api/billing/create-checkout-session instead.',
  });
}
