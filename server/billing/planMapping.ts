/**
 * Phase 1 billing freeze scope
 *
 * Plan resolution stays isolated to Stripe/billing truth work so the current
 * stable auth, DNS, email, and broader UI layers remain untouched.
 */
import type { BillingPlanKey } from '../../services/planCatalog.js';
import { BILLING_PLAN_CATALOG } from '../../services/planCatalog.js';

export type StripeSubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'incomplete'
  | 'incomplete_expired'
  | 'paused'
  | 'unknown';

export type UsagePlanAlias = 'free' | 'trial' | 'amateur' | 'professional' | 'admin' | 'expired';

export type BillingAccessState = 'active' | 'grace' | 'scheduled_cancel' | 'restricted' | 'inactive';

export type StripePlanBinding = {
  planKey: BillingPlanKey;
  displayName: string;
  stripeLookupKeys: string[];
  stripePriceEnvKeys: string[];
  stripeProductEnvKeys: string[];
};

export type BillingPlanResolution = {
  planKey: BillingPlanKey;
  accessState: BillingAccessState;
  billingStatus: StripeSubscriptionStatus;
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
    planKey: 'free',
    displayName: 'Free',
    stripeLookupKeys: [],
    stripePriceEnvKeys: [],
    stripeProductEnvKeys: [],
  },
  amateur: {
    planKey: 'amateur',
    displayName: 'Amateur',
    stripeLookupKeys: ['amateur_monthly', 'amateur_yearly'],
    stripePriceEnvKeys: ['STRIPE_PRICE_AMATEUR_MONTHLY', 'STRIPE_PRICE_AMATEUR_YEARLY', 'STRIPE_PRICE_AMATEUR_ANNUAL'],
    stripeProductEnvKeys: ['STRIPE_PRODUCT_AMATEUR'],
  },
  founder_amateur: {
    planKey: 'founder_amateur',
    displayName: 'Founder Amateur',
    stripeLookupKeys: ['founder_amateur_monthly', 'founder_amateur_yearly'],
    stripePriceEnvKeys: ['STRIPE_PRICE_AMATEUR_FOUNDER_MONTHLY', 'STRIPE_PRICE_AMATEUR_FOUNDER_YEARLY', 'STRIPE_PRICE_AMATEUR_FOUNDER_ANNUAL'],
    stripeProductEnvKeys: ['STRIPE_PRODUCT_AMATEUR_FOUNDER'],
  },
  professional: {
    planKey: 'professional',
    displayName: 'Professional',
    stripeLookupKeys: ['professional_monthly', 'professional_yearly'],
    stripePriceEnvKeys: ['STRIPE_PRICE_PRO_MONTHLY', 'STRIPE_PRICE_PRO_YEARLY', 'STRIPE_PRICE_PRO_ANNUAL'],
    stripeProductEnvKeys: ['STRIPE_PRODUCT_PRO'],
  },
  founder_professional: {
    planKey: 'founder_professional',
    displayName: 'Founder Professional',
    stripeLookupKeys: ['founder_professional_monthly', 'founder_professional_yearly'],
    stripePriceEnvKeys: ['STRIPE_PRICE_PRO_FOUNDER_MONTHLY', 'STRIPE_PRICE_PRO_FOUNDER_YEARLY', 'STRIPE_PRICE_PRO_FOUNDER_ANNUAL'],
    stripeProductEnvKeys: ['STRIPE_PRODUCT_PRO_FOUNDER'],
  },
};

export function resolvePlanKeyFromStripeRefs(input?: {
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
    if (lookupKey && binding.stripeLookupKeys.includes(lookupKey)) return binding.planKey;
    if (priceId && binding.stripePriceEnvKeys.some((envKey) => String(env?.[envKey] || '').trim() === priceId)) return binding.planKey;
    if (productId && binding.stripeProductEnvKeys.some((envKey) => String(env?.[envKey] || '').trim() === productId)) return binding.planKey;
  }

  return null;
}

export function resolveBillingPlan(input?: {
  planKey?: BillingPlanKey | null;
  billingStatus?: string | null;
  cancelAtPeriodEnd?: boolean | null;
  currentPeriodEnd?: string | number | Date | null;
  founderLockedPlan?: BillingPlanKey | null;
}): BillingPlanResolution {
  const requestedPlan = input?.planKey ?? input?.founderLockedPlan ?? 'free';
  const billingStatus = normalizeStripeStatus(input?.billingStatus);
  const founderLockedPlan = input?.founderLockedPlan ?? null;
  const currentPeriodEndMs = input?.currentPeriodEnd ? new Date(input.currentPeriodEnd as any).getTime() : NaN;
  const stillInPaidWindow = Number.isFinite(currentPeriodEndMs) ? currentPeriodEndMs > Date.now() : false;
  const notes: string[] = [];

  if (billingStatus === 'active') {
    if (input?.cancelAtPeriodEnd && stillInPaidWindow) {
      notes.push('Subscription is active and scheduled to cancel at period end.');
      return { planKey: requestedPlan, accessState: 'scheduled_cancel', billingStatus, keepAccess: true, downgradeTo: 'free', notes };
    }
    notes.push('Subscription is active.');
    return { planKey: requestedPlan, accessState: 'active', billingStatus, keepAccess: true, downgradeTo: null, notes };
  }

  if (billingStatus === 'trialing') {
    notes.push('Subscription is trialing; entitlements remain active.');
    return { planKey: requestedPlan, accessState: 'active', billingStatus, keepAccess: true, downgradeTo: null, notes };
  }

  if (billingStatus === 'past_due') {
    notes.push('Subscription is past_due; keep access during grace handling until webhook policy changes it.');
    return { planKey: requestedPlan, accessState: 'grace', billingStatus, keepAccess: true, downgradeTo: null, notes };
  }

  if (billingStatus === 'canceled' && stillInPaidWindow) {
    notes.push('Subscription was canceled but the current paid period has not ended yet.');
    return { planKey: requestedPlan, accessState: 'scheduled_cancel', billingStatus, keepAccess: true, downgradeTo: 'free', notes };
  }

  if (billingStatus === 'canceled') {
    notes.push('Subscription is canceled and no paid access remains.');
    return { planKey: founderLockedPlan ?? 'free', accessState: 'inactive', billingStatus, keepAccess: false, downgradeTo: 'free', notes };
  }

  if (billingStatus === 'incomplete') {
    notes.push('Initial payment is incomplete; do not grant paid entitlements yet.');
    return { planKey: founderLockedPlan ?? 'free', accessState: 'restricted', billingStatus, keepAccess: false, downgradeTo: 'free', notes };
  }

  if (billingStatus === 'unpaid' || billingStatus === 'incomplete_expired' || billingStatus === 'paused') {
    notes.push('Billing is not in a collectible state; fall back to free access until restored.');
    return { planKey: founderLockedPlan ?? 'free', accessState: 'inactive', billingStatus, keepAccess: false, downgradeTo: 'free', notes };
  }

  notes.push('Billing status is unknown; safest fallback is free access.');
  return { planKey: founderLockedPlan ?? 'free', accessState: 'inactive', billingStatus, keepAccess: false, downgradeTo: 'free', notes };
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

  if (planAlias === 'trial') {
    return {
      dailyAiLimit: 20,
      burstLimit: 20,
      monthlyToolQuotas: {
        quota_live_audio_minutes: 300,
        quota_image_gen: 2,
        quota_identify: 10,
        quota_video_uploads: 1,
      },
      dailyToolLimits: {
        live_audio_minutes: 60,
        video_uploads: 1,
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
        billingPlanKey === 'professional' ? 60
        : billingPlanKey === 'amateur' ? 45
        : 10,
      video_uploads:
        billingPlanKey === 'professional' ? 6
        : billingPlanKey === 'amateur' ? 1
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
