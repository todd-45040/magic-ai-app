import { requireSupabaseAuth } from '../../api/ai/_lib/auth.js';

export type ConversionEntitlementTier = 'free' | 'trial' | 'amateur' | 'professional' | 'admin';
export type ProtectedTool =
  | 'effect_generator'
  | 'patter_engine'
  | 'live_rehearsal'
  | 'video_rehearsal'
  | 'visual_brainstorm'
  | 'director_mode'
  | 'contracts'
  | 'crm'
  | 'marketing_generator';

const TOOL_MIN_TIER: Record<ProtectedTool, ConversionEntitlementTier> = {
  effect_generator: 'trial',
  patter_engine: 'trial',
  live_rehearsal: 'professional',
  video_rehearsal: 'amateur',
  visual_brainstorm: 'amateur',
  director_mode: 'professional',
  contracts: 'professional',
  crm: 'professional',
  marketing_generator: 'professional',
};

function rank(tier: ConversionEntitlementTier): number {
  switch (tier) {
    case 'admin': return 4;
    case 'professional': return 3;
    case 'amateur': return 2;
    case 'trial': return 1;
    case 'free':
    default: return 0;
  }
}

function activeTrial(trialEndDate: any): boolean {
  const ms = Number(trialEndDate || 0);
  return Number.isFinite(ms) && ms > Date.now();
}

export function resolveServerEntitlement(profile: any): ConversionEntitlementTier {
  if (profile?.is_admin || String(profile?.membership || '') === 'admin') return 'admin';
  const membership = String(profile?.membership || 'free').trim().toLowerCase();
  if (membership === 'professional') return 'professional';
  if (membership === 'amateur' || membership === 'performer' || membership === 'semi-pro') return 'amateur';
  if (membership === 'trial' && activeTrial(profile?.trial_end_date)) return 'professional';
  return 'free';
}

export async function getServerUserProfile(req: any): Promise<
  | { ok: true; auth: any; profile: any; tier: ConversionEntitlementTier }
  | { ok: false; status: number; error: string }
> {
  const auth = await requireSupabaseAuth(req);
  if (!auth.ok) return auth;

  const { data, error } = await auth.admin
    .from('users')
    .select('id,email,membership,is_admin,trial_end_date,partner_source,signup_source,requested_trial_days')
    .eq('id', auth.userId)
    .maybeSingle();

  if (error) return { ok: false, status: 500, error: 'Unable to load user entitlement profile.' };
  const profile = data || { id: auth.userId, email: auth.email, membership: 'free' };
  return { ok: true, auth, profile, tier: resolveServerEntitlement(profile) };
}

export async function requireToolEntitlement(req: any, tool: ProtectedTool): Promise<
  | { ok: true; auth: any; profile: any; tier: ConversionEntitlementTier; requiredTier: ConversionEntitlementTier }
  | { ok: false; status: number; error: string; error_code: string; requiredTier?: ConversionEntitlementTier; tier?: ConversionEntitlementTier }
> {
  const result = await getServerUserProfile(req);
  if (!result.ok) return { ...result, error_code: result.status === 401 ? 'AUTH_REQUIRED' : 'ENTITLEMENT_LOOKUP_FAILED' };

  const requiredTier = TOOL_MIN_TIER[tool] || 'professional';
  if (rank(result.tier) < rank(requiredTier)) {
    return {
      ok: false,
      status: 402,
      error: `This tool requires ${requiredTier} access.`,
      error_code: 'PLAN_UPGRADE_REQUIRED',
      requiredTier,
      tier: result.tier,
    };
  }

  return { ok: true, auth: result.auth, profile: result.profile, tier: result.tier, requiredTier };
}

export function sendEntitlementError(res: any, result: Extract<Awaited<ReturnType<typeof requireToolEntitlement>>, { ok: false }>) {
  res.status(result.status).json({
    ok: false,
    error: result.error,
    error_code: result.error_code,
    required_tier: result.requiredTier || null,
    current_tier: result.tier || null,
    upgrade_required: result.error_code === 'PLAN_UPGRADE_REQUIRED',
  });
}
