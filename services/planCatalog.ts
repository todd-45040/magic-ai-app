import type { User } from '../types';
import type { CanonicalTier } from './membershipService';
import { normalizeTier } from './membershipService';
import type { ResourceType, ToolName } from './entitlements';

export type BillingPlanKey = 'free' | 'amateur' | 'professional' | 'founder_professional';
export type InternalPlanState = BillingPlanKey | 'admin' | 'expired' | 'trial';

export type PlanLimits = Record<ResourceType, number>;

export type HeavyToolLimits = {
  imageGenerationsMonthly: number;
  videoAnalysisClipsMonthly: number;
  liveRehearsalMinutesMonthly: number;
  maxConcurrentLiveSessions: number;
  maxReconnectAttemptsPerSession: number;
  maxVideoUploadMb: number;
  maxImageUploadMb: number;
};

export type StorageLimits = {
  savedShows: number;
  savedIdeas: number;
};

export type UpgradePathRule = {
  from: BillingPlanKey;
  to: BillingPlanKey;
  allowed: boolean;
  reason?: string;
};

export type DowngradeBehavior = {
  downgradeTo: BillingPlanKey;
  takesEffect: 'immediately' | 'period_end';
  preserveExistingProjects: boolean;
  blockNewStorageWhenOverLimit: boolean;
  overageMessage: string;
};

export type FounderOverrideBehavior = {
  eligible: boolean;
  lockedPlan: BillingPlanKey | null;
  lockedPriceCents: number | null;
  preventAutomaticDowngrade: boolean;
  preservePriceOnReactivation: boolean;
  notes: string[];
};

export type BillingPlanDefinition = {
  key: BillingPlanKey;
  planId: string;
  stripeLookupKey: string | null;
  displayName: string;
  publicLabel: string;
  monthlyPriceCents: number | null;
  annualPriceCents: number | null;
  entitlementTier: Extract<CanonicalTier, 'free' | 'amateur' | 'professional'>;
  monthlyLimits: PlanLimits;
  heavyToolLimits: HeavyToolLimits;
  storageLimits: StorageLimits;
  featureAccessMatrix: Record<ToolName, boolean>;
  allowedUpgrades: BillingPlanKey[];
  downgradeBehavior: DowngradeBehavior;
  founderOverrideBehavior: FounderOverrideBehavior;
};

const INFINITE_LIMIT = Number.MAX_SAFE_INTEGER;

const FREE_FEATURES: ToolName[] = ['EffectGenerator', 'PatterEngine', 'MagicWire', 'Publications', 'Community', 'IdentifyTrick'];
const AMATEUR_FEATURES: ToolName[] = [...FREE_FEATURES, 'ShowPlanner', 'SavedIdeas', 'Search'];
const PROFESSIONAL_FEATURES: ToolName[] = [
  ...AMATEUR_FEATURES,
  'LiveRehearsal',
  'VideoAnalysis',
  'PersonaSimulator',
  'VisualBrainstorm',
  'DirectorMode',
  'ImageGeneration',
  'CRM',
  'Contracts',
  'FinanceTracker',
  'MarketingGenerator',
  'AssistantStudio',
  'PropChecklists',
  'ShowFeedback',
  'GospelMagic',
  'MentalismAssistant',
  'IllusionBlueprint',
];

const ALL_TOOLS: ToolName[] = [
  'EffectGenerator',
  'PatterEngine',
  'ShowPlanner',
  'SavedIdeas',
  'Search',
  'LiveRehearsal',
  'VideoAnalysis',
  'PersonaSimulator',
  'VisualBrainstorm',
  'DirectorMode',
  'ImageGeneration',
  'CRM',
  'Contracts',
  'FinanceTracker',
  'MarketingGenerator',
  'MagicWire',
  'Publications',
  'Community',
  'IdentifyTrick',
  'AssistantStudio',
  'PropChecklists',
  'ShowFeedback',
  'GospelMagic',
  'MentalismAssistant',
  'IllusionBlueprint',
];

function buildFeatureMatrix(enabledTools: ToolName[]): Record<ToolName, boolean> {
  return ALL_TOOLS.reduce((acc, tool) => {
    acc[tool] = enabledTools.includes(tool);
    return acc;
  }, {} as Record<ToolName, boolean>);
}

export const BILLING_PLAN_CATALOG: Record<BillingPlanKey, BillingPlanDefinition> = {
  free: {
    key: 'free',
    planId: 'free',
    stripeLookupKey: null,
    displayName: 'Free',
    publicLabel: 'Free',
    monthlyPriceCents: null,
    annualPriceCents: null,
    entitlementTier: 'free',
    monthlyLimits: {
      text_generations: 20,
      image_generations: 5,
      live_rehearsal_minutes: 0,
      video_analysis_clips: 0,
      saved_shows: 3,
      saved_ideas: 10,
    },
    heavyToolLimits: {
      imageGenerationsMonthly: 5,
      videoAnalysisClipsMonthly: 0,
      liveRehearsalMinutesMonthly: 0,
      maxConcurrentLiveSessions: 0,
      maxReconnectAttemptsPerSession: 0,
      maxVideoUploadMb: 0,
      maxImageUploadMb: 10,
    },
    storageLimits: {
      savedShows: 3,
      savedIdeas: 10,
    },
    featureAccessMatrix: buildFeatureMatrix(FREE_FEATURES),
    allowedUpgrades: ['amateur', 'professional', 'founder_professional'],
    downgradeBehavior: {
      downgradeTo: 'free',
      takesEffect: 'period_end',
      preserveExistingProjects: true,
      blockNewStorageWhenOverLimit: true,
      overageMessage: 'Free users keep their existing records, but cannot create new items once storage limits are exceeded.',
    },
    founderOverrideBehavior: {
      eligible: false,
      lockedPlan: null,
      lockedPriceCents: null,
      preventAutomaticDowngrade: false,
      preservePriceOnReactivation: false,
      notes: ['Baseline plan with no founder protections.'],
    },
  },
  amateur: {
    key: 'amateur',
    planId: 'amateur',
    stripeLookupKey: 'amateur_monthly',
    displayName: 'Amateur',
    publicLabel: 'Amateur',
    monthlyPriceCents: 995,
    annualPriceCents: null,
    entitlementTier: 'amateur',
    monthlyLimits: {
      text_generations: 200,
      image_generations: 40,
      live_rehearsal_minutes: 60,
      video_analysis_clips: 10,
      saved_shows: 25,
      saved_ideas: 100,
    },
    heavyToolLimits: {
      imageGenerationsMonthly: 40,
      videoAnalysisClipsMonthly: 10,
      liveRehearsalMinutesMonthly: 60,
      maxConcurrentLiveSessions: 1,
      maxReconnectAttemptsPerSession: 2,
      maxVideoUploadMb: 50,
      maxImageUploadMb: 10,
    },
    storageLimits: {
      savedShows: 25,
      savedIdeas: 100,
    },
    featureAccessMatrix: buildFeatureMatrix(AMATEUR_FEATURES),
    allowedUpgrades: ['professional', 'founder_professional'],
    downgradeBehavior: {
      downgradeTo: 'free',
      takesEffect: 'period_end',
      preserveExistingProjects: true,
      blockNewStorageWhenOverLimit: true,
      overageMessage: 'After downgrading from Amateur, existing shows and ideas remain, but new saves are blocked until usage is back under Free limits.',
    },
    founderOverrideBehavior: {
      eligible: false,
      lockedPlan: null,
      lockedPriceCents: null,
      preventAutomaticDowngrade: false,
      preservePriceOnReactivation: false,
      notes: ['Standard paid plan with no lifetime founder lock.'],
    },
  },
  professional: {
    key: 'professional',
    planId: 'professional',
    stripeLookupKey: 'professional_monthly',
    displayName: 'Professional',
    publicLabel: 'Professional',
    monthlyPriceCents: 2995,
    annualPriceCents: null,
    entitlementTier: 'professional',
    monthlyLimits: {
      text_generations: 1000,
      image_generations: 200,
      live_rehearsal_minutes: 300,
      video_analysis_clips: 50,
      saved_shows: INFINITE_LIMIT,
      saved_ideas: INFINITE_LIMIT,
    },
    heavyToolLimits: {
      imageGenerationsMonthly: 200,
      videoAnalysisClipsMonthly: 50,
      liveRehearsalMinutesMonthly: 300,
      maxConcurrentLiveSessions: 2,
      maxReconnectAttemptsPerSession: 5,
      maxVideoUploadMb: 50,
      maxImageUploadMb: 10,
    },
    storageLimits: {
      savedShows: INFINITE_LIMIT,
      savedIdeas: INFINITE_LIMIT,
    },
    featureAccessMatrix: buildFeatureMatrix(PROFESSIONAL_FEATURES),
    allowedUpgrades: [],
    downgradeBehavior: {
      downgradeTo: 'amateur',
      takesEffect: 'period_end',
      preserveExistingProjects: true,
      blockNewStorageWhenOverLimit: true,
      overageMessage: 'After downgrading from Professional, existing items remain available, but new content creation is limited until the account returns under Amateur limits.',
    },
    founderOverrideBehavior: {
      eligible: false,
      lockedPlan: null,
      lockedPriceCents: null,
      preventAutomaticDowngrade: false,
      preservePriceOnReactivation: false,
      notes: ['Standard public Professional plan.'],
    },
  },
  founder_professional: {
    key: 'founder_professional',
    planId: 'founder_professional',
    stripeLookupKey: 'founder_professional_monthly',
    displayName: 'Founder Professional',
    publicLabel: 'Founder Professional',
    monthlyPriceCents: 2995,
    annualPriceCents: null,
    entitlementTier: 'professional',
    monthlyLimits: {
      text_generations: 1000,
      image_generations: 200,
      live_rehearsal_minutes: 300,
      video_analysis_clips: 50,
      saved_shows: INFINITE_LIMIT,
      saved_ideas: INFINITE_LIMIT,
    },
    heavyToolLimits: {
      imageGenerationsMonthly: 200,
      videoAnalysisClipsMonthly: 50,
      liveRehearsalMinutesMonthly: 300,
      maxConcurrentLiveSessions: 2,
      maxReconnectAttemptsPerSession: 5,
      maxVideoUploadMb: 50,
      maxImageUploadMb: 10,
    },
    storageLimits: {
      savedShows: INFINITE_LIMIT,
      savedIdeas: INFINITE_LIMIT,
    },
    featureAccessMatrix: buildFeatureMatrix(PROFESSIONAL_FEATURES),
    allowedUpgrades: [],
    downgradeBehavior: {
      downgradeTo: 'free',
      takesEffect: 'period_end',
      preserveExistingProjects: true,
      blockNewStorageWhenOverLimit: true,
      overageMessage: 'Founder accounts keep existing work if billing ends, but new content remains gated until billing is restored or access is reassigned by admin policy.',
    },
    founderOverrideBehavior: {
      eligible: true,
      lockedPlan: 'founder_professional',
      lockedPriceCents: 2995,
      preventAutomaticDowngrade: true,
      preservePriceOnReactivation: true,
      notes: [
        'Founder Professional mirrors Professional entitlements.',
        'Stripe status can suspend billing state, but it should not rewrite the founder plan assignment.',
        'Any reactivation should preserve the founder locked price.',
      ],
    },
  },
};

export const BILLING_UPGRADE_PATHS: UpgradePathRule[] = [
  { from: 'free', to: 'amateur', allowed: true },
  { from: 'free', to: 'professional', allowed: true },
  { from: 'free', to: 'founder_professional', allowed: true, reason: 'Allowed only when a founder override exists.' },
  { from: 'amateur', to: 'professional', allowed: true },
  { from: 'amateur', to: 'founder_professional', allowed: true, reason: 'Allowed only when a founder override exists.' },
  { from: 'professional', to: 'founder_professional', allowed: true, reason: 'Allowed only when migrating an existing founder account.' },
  { from: 'founder_professional', to: 'professional', allowed: false, reason: 'Founder pricing should not be silently converted to public Professional pricing.' },
];

const INTERNAL_PLAN_STATE_TO_BILLING_PLAN: Record<Exclude<InternalPlanState, BillingPlanKey>, BillingPlanKey> = {
  admin: 'professional',
  expired: 'free',
  trial: 'free',
};

export function getBillingPlanDefinition(planKey: BillingPlanKey): BillingPlanDefinition {
  return BILLING_PLAN_CATALOG[planKey];
}

export function getBillingPlanKeys(): BillingPlanKey[] {
  return Object.keys(BILLING_PLAN_CATALOG) as BillingPlanKey[];
}

export function isFounderUser(user?: User | null): boolean {
  return Boolean(user?.foundingCircleMember || user?.pricingLock);
}

export function resolveInternalPlanState(user?: User | null): InternalPlanState {
  if (!user) return 'free';
  const tier = normalizeTier(user.membership);
  if (isFounderUser(user) && tier === 'professional') return 'founder_professional';
  if (tier === 'admin') return 'admin';
  if (tier === 'expired') return 'expired';
  if (tier === 'trial') return 'trial';
  if (tier === 'amateur') return 'amateur';
  if (tier === 'professional') return 'professional';
  return 'free';
}

export function resolveBillingPlanKey(user?: User | null): BillingPlanKey {
  const state = resolveInternalPlanState(user);
  return state in BILLING_PLAN_CATALOG
    ? (state as BillingPlanKey)
    : INTERNAL_PLAN_STATE_TO_BILLING_PLAN[state as Exclude<InternalPlanState, BillingPlanKey>] ?? 'free';
}

export function getEffectiveEntitlementTier(user?: User | null): CanonicalTier {
  const state = resolveInternalPlanState(user);
  if (state === 'admin' || state === 'expired' || state === 'trial') return state;
  return BILLING_PLAN_CATALOG[state].entitlementTier;
}

export function getPlanLimits(user?: User | null): PlanLimits {
  return getBillingPlanDefinition(resolveBillingPlanKey(user)).monthlyLimits;
}

export function getStorageLimits(user?: User | null): StorageLimits {
  return getBillingPlanDefinition(resolveBillingPlanKey(user)).storageLimits;
}

export function getHeavyToolLimits(user?: User | null): HeavyToolLimits {
  return getBillingPlanDefinition(resolveBillingPlanKey(user)).heavyToolLimits;
}

export function getFeatureMatrix(user?: User | null): Record<ToolName, boolean> {
  return getBillingPlanDefinition(resolveBillingPlanKey(user)).featureAccessMatrix;
}

export function canUpgradePlan(from: BillingPlanKey, to: BillingPlanKey): boolean {
  if (from === to) return false;
  return BILLING_UPGRADE_PATHS.some((rule) => rule.from === from && rule.to === to && rule.allowed);
}

export function getDowngradeBehavior(user?: User | null): DowngradeBehavior {
  return getBillingPlanDefinition(resolveBillingPlanKey(user)).downgradeBehavior;
}

export function getFounderOverrideBehavior(user?: User | null): FounderOverrideBehavior {
  return getBillingPlanDefinition(resolveBillingPlanKey(user)).founderOverrideBehavior;
}
