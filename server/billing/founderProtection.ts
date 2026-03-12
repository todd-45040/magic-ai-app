import type { BillingPlanKey } from '../../services/planCatalog.js';

export type FounderProtectionState = {
  founderProtected: boolean;
  lockedPlan: BillingPlanKey | null;
  lockedPriceCents: number | null;
  pricingLockKey: string | null;
  bucket: string | null;
  reason: string;
};

function truthy(value: unknown): boolean {
  const raw = String(value ?? '').trim().toLowerCase();
  return value === true || raw === 'true' || raw === '1' || raw === 'yes';
}

export function deriveFounderProtection(input?: {
  metadata?: Record<string, unknown> | null;
  subscription?: Record<string, unknown> | null;
  user?: Record<string, unknown> | null;
  founderOverride?: Record<string, unknown> | null;
}): FounderProtectionState {
  const metadata = input?.metadata || {};
  const subscription = input?.subscription || {};
  const user = input?.user || {};
  const founderOverride = input?.founderOverride || {};

  const pricingLockKey = String(
    founderOverride['pricing_lock'] ||
    metadata['pricing_lock_key'] ||
    metadata['pricing_lock'] ||
    user['pricing_lock'] ||
    ''
  ).trim() || null;

  const founderProtected = Boolean(
    founderOverride['override_active'] ||
    truthy(metadata['founding_member']) ||
    truthy(metadata['founder_offer']) ||
    truthy(user['founding_circle_member']) ||
    pricingLockKey
  );

  const lockedPlanRaw = String(
    founderOverride['locked_plan_key'] ||
    subscription['founder_locked_plan'] ||
    ''
  ).trim();
  const lockedPlan = lockedPlanRaw === 'founder_professional' ? 'founder_professional' : founderProtected ? 'founder_professional' : null;

  const lockedPriceRaw = Number(
    founderOverride['locked_price_cents'] ?? subscription['founder_locked_price'] ?? 2995
  );
  const lockedPriceCents = founderProtected && Number.isFinite(lockedPriceRaw) ? lockedPriceRaw : null;

  const bucket = String(
    founderOverride['founder_bucket'] || metadata['founding_bucket'] || user['founding_bucket'] || ''
  ).trim() || null;

  return {
    founderProtected,
    lockedPlan,
    lockedPriceCents,
    pricingLockKey,
    bucket,
    reason: founderProtected ? 'founder_lock_present' : 'standard_pricing',
  };
}
