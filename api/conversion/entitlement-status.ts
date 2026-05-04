import { getServerUserProfile } from '../../server/conversion/entitlementMiddleware.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  }

  const profileResult = await getServerUserProfile(req);
  if (!profileResult.ok) {
    return res.status(profileResult.status).json({ ok: false, error: profileResult.error });
  }

  const trialEnd = Number(profileResult.profile?.trial_end_date || 0);
  const trialActive = String(profileResult.profile?.membership || '') === 'trial' && Number.isFinite(trialEnd) && trialEnd > Date.now();
  const daysRemaining = trialActive ? Math.ceil((trialEnd - Date.now()) / (24 * 60 * 60 * 1000)) : null;

  return res.status(200).json({
    ok: true,
    tier: profileResult.tier,
    membership: profileResult.profile?.membership || 'free',
    stripe_status: profileResult.profile?.stripe_status || null,
    stripe_subscription_id_present: Boolean(profileResult.profile?.stripe_subscription_id),
    stripe_customer_id_present: Boolean(profileResult.profile?.stripe_customer_id),
    trial_active: trialActive,
    trial_end_date: trialEnd || null,
    trial_days_remaining: daysRemaining,
    partner_source: profileResult.profile?.partner_source || profileResult.profile?.signup_source || null,
    requested_trial_days: profileResult.profile?.requested_trial_days || null,
  });
}
