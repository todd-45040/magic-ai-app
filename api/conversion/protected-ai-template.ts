import { requireToolEntitlement, sendEntitlementError } from '../../server/conversion/entitlementMiddleware.js';

// Template only: copy this shape when adding a new paid/protected API route.
// Do not call Gemini, Stripe, or Supabase privileged work before this guard passes.
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed.' });

  const entitlement = await requireToolEntitlement(req, 'director_mode');
  if (!entitlement.ok) return sendEntitlementError(res, entitlement);

  return res.status(200).json({
    ok: true,
    message: 'Entitlement passed. Put the protected server-side AI action here.',
    tier: entitlement.tier,
  });
}
