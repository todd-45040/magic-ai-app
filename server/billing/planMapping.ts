import type { BillingPlanKey } from '../../services/planCatalog.js';
import type { BillingAccessState, SubscriptionStatus } from '../../services/billingTypes.js';
import { BILLING_PLAN_CATALOG } from '../../services/planCatalog.js';

export type StripeSubscriptionStatus = SubscriptionStatus;

export type UsagePlanAlias = 'free' | 'trial' | 'amateur' | 'professional' | 'admin' | 'expired';

export type StripePlanBinding = {
  membershipTier: BillingPlanKey;
  displayName: string;
  stripeLookupKeys: string[];
  stripePriceEnvKeys: string[];
  stripeProductEnvKeys: string[];
};

export type BillingPlanResolution = {
  membershipTier: BillingPlanKey;
  accessState: BillingAccessState;
  subscriptionStatus: StripeSubscriptionStatus;
  keepAccess: boolean;
  downgradeTo: BillingPlanKey | null;
  notes: string[];
};

export type UsageQuotaConfig = {
  dailyAiLimit: number;
  burstLimit: number;
  monthlyToolQuotas: {
    quota_live_audio_minutes: number;
    quota_image_gen: number;
    quota_identify: number;
    quota_video_uploads: number;
  };
  dailyToolLimits: {
    live_audio_minutes: number;
    video_uploads: number;
  };
};

export const STRIPE_PLAN_BINDINGS: Record<BillingPlanKey, StripePlanBinding> = {
  free: {
    membershipTier: 'free',
    displayName: 'Free',
    stripeLookupKeys: [],
    stripePriceEnvKeys: [],
    stripeProductEnvKeys: [],
  },
  amateur: {
    membershipTier: 'amateur',
    displayName: 'Amateur',
    stripeLookupKeys: ['amateur_monthly', 'amateur_annual'],
    stripePriceEnvKeys: ['STRIPE_PRICE_AMATEUR_MONTHLY', 'STRIPE_PRICE_AMATEUR_ANNUAL'],
    stripeProductEnvKeys: ['STRIPE_PRODUCT_AMATEUR'],
  },
  professional: {
    membershipTier: 'professional',
    displayName: 'Professional',
    stripeLookupKeys: ['professional_monthly', 'professional_annual'],
    stripePriceEnvKeys: ['STRIPE_PRICE_PRO_MONTHLY', 'STRIPE_PRICE_PRO_ANNUAL'],
    stripeProductEnvKeys: ['STRIPE_PRODUCT_PRO'],
  },
  founder_professional: {
    membershipTier: 'founder_professional',
    displayName: 'Founder Professional',
    stripeLookupKeys: ['founder_professional_monthly', 'founder_professional_annual'],
    stripePriceEnvKeys: ['STRIPE_PRICE_PRO_FOUNDER_MONTHLY', 'STRIPE_PRICE_PRO_FOUNDER_ANNUAL'],
    stripeProductEnvKeys: ['STRIPE_PRODUCT_PRO_FOUNDER'],
  },
};

export function resolveMembershipTierFromStripeRefs(input?: {
  lookupKey?: string | null;
  priceId?: string | null;
  productId?: string | null;
  env?: NodeJS.ProcessEnv;
}): BillingPlanKey | null {
  const lookupKey = String(input?.lookupKey || '').trim();
  const priceId = String(input?.priceId || '').trim();
  const productId = String(input?.productId || '').trim();
  const env = input?.env ?? process.env;

  for (const binding of Object.values(STRIPE_PLAN_BINDINGS)) {
    if (lookupKey && binding.stripeLookupKeys.includes(lookupKey)) return binding.membershipTier;
    if (priceId && binding.stripePriceEnvKeys.some((envKey) => String(env?.[envKey] || '').trim() === priceId)) return binding.membershipTier;
    if (productId && binding.stripeProductEnvKeys.some((envKey) => String(env?.[envKey] || '').trim() === productId)) return binding.membershipTier;
  }

  return null;
}

export function resolveBillingPlan(input?: {
  membershipTier?: BillingPlanKey | null;
  subscriptionStatus?: SubscriptionStatus | string | null;
  planKey?: BillingPlanKey | null;
  billingStatus?: string | null;
  cancelAtPeriodEnd?: boolean | null;
  currentPeriodEnd?: string | number | Date | null;
  founderLockedPlan?: BillingPlanKey | null;
}): BillingPlanResolution {
  const requestedMembershipTier = input?.membershipTier ?? input?.planKey ?? input?.founderLockedPlan ?? 'free';
  const subscriptionStatus = normalizeStripeStatus(input?.subscriptionStatus ?? input?.billingStatus);
  const founderLockedPlan = input?.founderLockedPlan ?? null;
  const currentPeriodEndMs = input?.currentPeriodEnd ? new Date(input.currentPeriodEnd as any).getTime() : NaN;
  const stillInPaidWindow = Number.isFinite(currentPeriodEndMs) ? currentPeriodEndMs > Date.now() : false;
  const notes: string[] = [];

  if (subscriptionStatus === 'active') {
    if (input?.cancelAtPeriodEnd && stillInPaidWindow) {
      notes.push('Subscription is active and scheduled to cancel at period end.');
      return { membershipTier: requestedMembershipTier, accessState: 'scheduled_cancel', subscriptionStatus, keepAccess: true, downgradeTo: 'free', notes };
    }
    notes.push('Subscription is active.');
    return { membershipTier: requestedMembershipTier, accessState: 'active', subscriptionStatus, keepAccess: true, downgradeTo: null, notes };
  }

  if (subscriptionStatus === 'trialing') {
    notes.push('Subscription is trialing; entitlements remain active.');
    return { membershipTier: requestedMembershipTier, accessState: 'active', subscriptionStatus, keepAccess: true, downgradeTo: null, notes };
  }

  if (subscriptionStatus === 'past_due') {
    notes.push('Subscription is past_due; keep access during grace handling until webhook policy changes it.');
    return { membershipTier: requestedMembershipTier, accessState: 'grace', subscriptionStatus, keepAccess: true, downgradeTo: null, notes };
  }

  if (subscriptionStatus === 'canceled' && stillInPaidWindow) {
    notes.push('Subscription was canceled but the current paid period has not ended yet.');
    return { membershipTier: requestedMembershipTier, accessState: 'scheduled_cancel', subscriptionStatus, keepAccess: true, downgradeTo: 'free', notes };
  }

  if (subscriptionStatus === 'canceled') {
    notes.push('Subscription is canceled and no paid access remains.');
    return { membershipTier: founderLockedPlan ?? 'free', accessState: 'inactive', subscriptionStatus, keepAccess: false, downgradeTo: 'free', notes };
  }

  if (subscriptionStatus === 'incomplete') {
    notes.push('Initial payment is incomplete; do not grant paid entitlements yet.');
    return { membershipTier: founderLockedPlan ?? 'free', accessState: 'restricted', subscriptionStatus, keepAccess: false, downgradeTo: 'free', notes };
  }

  if (subscriptionStatus === 'unpaid' || subscriptionStatus === 'incomplete_expired' || subscriptionStatus === 'paused') {
    notes.push('Billing is not in a collectible state; fall back to free access until restored.');
    return { membershipTier: founderLockedPlan ?? 'free', accessState: 'inactive', subscriptionStatus, keepAccess: false, downgradeTo: 'free', notes };
  }

  notes.push('Billing status is unknown; safest fallback is free access.');
  return { membershipTier: founderLockedPlan ?? 'free', accessState: 'inactive', subscriptionStatus, keepAccess: false, downgradeTo: 'free', notes };
}

export function resolveUsagePlanAlias(membership?: string | null): UsagePlanAlias {
  switch (String(membership || '').trim()) {
    case 'admin':
      return 'admin';
    case 'professional':
      return 'professional';
    case 'amateur':
    case 'performer':
    case 'semi-pro':
      return 'amateur';
    case 'expired':
      return 'expired';
    case 'trial':
      return 'trial';
    default:
      return 'free';
  }
}

export function getUsageQuotaConfigForMembership(membership?: string | null): UsageQuotaConfig {
  const planAlias = resolveUsagePlanAlias(membership);
  if (planAlias === 'admin') {
    return {
      dailyAiLimit: 10000,
      burstLimit: 120,
      monthlyToolQuotas: {
        quota_live_audio_minutes: 9999,
        quota_image_gen: 9999,
        quota_identify: 9999,
        quota_video_uploads: 9999,
      },
      dailyToolLimits: {
        live_audio_minutes: 9999,
        video_uploads: 9999,
      },
    };
  }

  if (planAlias === 'expired') {
    return {
      dailyAiLimit: 0,
      burstLimit: 0,
      monthlyToolQuotas: {
        quota_live_audio_minutes: 0,
        quota_image_gen: 0,
        quota_identify: 0,
        quota_video_uploads: 0,
      },
      dailyToolLimits: {
        live_audio_minutes: 0,
        video_uploads: 0,
      },
    };
  }

  const billingPlanKey: BillingPlanKey =
    planAlias === 'professional' ? 'professional'
    : planAlias === 'amateur' ? 'amateur'
    : 'free';

  const plan = BILLING_PLAN_CATALOG[billingPlanKey];

  return {
    dailyAiLimit:
      billingPlanKey === 'professional' ? 1000
      : billingPlanKey === 'amateur' ? 200
      : 20,
    burstLimit:
      billingPlanKey === 'professional' ? 120
      : billingPlanKey === 'amateur' ? 60
      : 20,
    monthlyToolQuotas: {
      quota_live_audio_minutes: plan.heavyToolLimits.liveRehearsalMinutesMonthly,
      quota_image_gen: plan.heavyToolLimits.imageGenerationsMonthly,
      quota_identify:
        billingPlanKey === 'professional' ? 100
        : billingPlanKey === 'amateur' ? 50
        : 10,
      quota_video_uploads: plan.heavyToolLimits.videoAnalysisClipsMonthly,
    },
    dailyToolLimits: {
      live_audio_minutes:
        billingPlanKey === 'professional' ? 180
        : billingPlanKey === 'amateur' ? 45
        : 10,
      video_uploads:
        billingPlanKey === 'professional' ? 6
        : 0,
    },
  };
}

export function nextMonthlyResetAtISO(from?: string | number | Date | null): string {
  const base = from ? new Date(from as any) : new Date();
  const utcYear = base.getUTCFullYear();
  const utcMonth = base.getUTCMonth();
  return new Date(Date.UTC(utcYear, utcMonth + 1, 1, 0, 0, 0, 0)).toISOString();
}


export const resolvePlanKeyFromStripeRefs = resolveMembershipTierFromStripeRefs;

function normalizeStripeStatus(status?: string | null): StripeSubscriptionStatus {
  switch (String(status || '').trim()) {
    case 'trialing':
    case 'active':
    case 'past_due':
    case 'canceled':
    case 'unpaid':
    case 'incomplete':
    case 'incomplete_expired':
    case 'paused':
      return String(status) as StripeSubscriptionStatus;
    default:
      return 'unknown';
  }
}
