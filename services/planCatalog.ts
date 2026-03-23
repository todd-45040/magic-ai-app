import type { User } from '../types';
import type { CanonicalTier } from './membershipService.js';
import { normalizeTier } from './membershipService.js';
import type { ResourceType, ToolName } from './entitlements.js';

export type BillingPlanKey = 'free' | 'amateur' | 'founder_amateur' | 'professional' | 'founder_professional';
export type InternalPlanState = BillingPlanKey | 'admin' | 'expired' | 'trial';
export type BillingCycle = 'monthly' | 'yearly';

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
export type StorageLimits = { savedShows: number; savedIdeas: number; };
export type UpgradePathRule = { from: BillingPlanKey; to: BillingPlanKey; allowed: boolean; reason?: string; };
export type DowngradeBehavior = { downgradeTo: BillingPlanKey; takesEffect: 'immediately' | 'period_end'; preserveExistingProjects: boolean; blockNewStorageWhenOverLimit: boolean; overageMessage: string; };
export type FounderOverrideBehavior = { eligible: boolean; lockedPlan: BillingPlanKey | null; lockedPriceCents: number | null; preventAutomaticDowngrade: boolean; preservePriceOnReactivation: boolean; notes: string[]; };
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
const AMATEUR_FEATURES: ToolName[] = [...FREE_FEATURES, 'ShowPlanner', 'SavedIdeas', 'Search', 'VisualBrainstorm', 'VideoAnalysis', 'MagicDictionary', 'MagicTheoryTutor', 'MentalismAssistant', 'GospelMagic'];
const PROFESSIONAL_FEATURES: ToolName[] = [...AMATEUR_FEATURES, 'LiveRehearsal', 'VideoAnalysis', 'PersonaSimulator', 'AngleRiskAnalysis', 'RehearsalCoaching', 'VisualBrainstorm', 'DirectorMode', 'ImageGeneration', 'CRM', 'Contracts', 'FinanceTracker', 'MarketingGenerator', 'AssistantStudio', 'PropChecklists', 'ShowFeedback', 'IllusionBlueprint'];
const ALL_TOOLS: ToolName[] = ['EffectGenerator','PatterEngine','ShowPlanner','SavedIdeas','Search','LiveRehearsal','VideoAnalysis','PersonaSimulator','AngleRiskAnalysis','RehearsalCoaching','VisualBrainstorm','DirectorMode','ImageGeneration','CRM','Contracts','FinanceTracker','MarketingGenerator','MagicWire','Publications','Community','IdentifyTrick','AssistantStudio','PropChecklists','ShowFeedback','IllusionBlueprint','MagicDictionary','MagicTheoryTutor','MentalismAssistant','GospelMagic'];
const buildFeatureMatrix = (enabled: ToolName[]) => ALL_TOOLS.reduce((a, t) => { a[t] = enabled.includes(t); return a; }, {} as Record<ToolName, boolean>);
const FOUNDER_RATE_NOTES = ['Founder pricing is a rate lock designation, not a separate feature tier.', 'Founder billing should preserve the locked rate across cancellation and reactivation.'];

export const BILLING_PLAN_CATALOG: Record<BillingPlanKey, BillingPlanDefinition> = {
  free: {
    key: 'free', planId: 'free', stripeLookupKey: null, displayName: 'Free', publicLabel: 'Free', monthlyPriceCents: null, annualPriceCents: null, entitlementTier: 'free',
    monthlyLimits: { text_generations: 20, image_generations: 0, live_rehearsal_minutes: 0, video_analysis_clips: 2, saved_shows: 3, saved_ideas: 10 },
    heavyToolLimits: { imageGenerationsMonthly: 0, videoAnalysisClipsMonthly: 2, liveRehearsalMinutesMonthly: 0, maxConcurrentLiveSessions: 0, maxReconnectAttemptsPerSession: 0, maxVideoUploadMb: 25, maxImageUploadMb: 10 },
    storageLimits: { savedShows: 3, savedIdeas: 10 }, featureAccessMatrix: buildFeatureMatrix(FREE_FEATURES),
    allowedUpgrades: ['amateur', 'founder_amateur', 'professional', 'founder_professional'],
    downgradeBehavior: { downgradeTo: 'free', takesEffect: 'period_end', preserveExistingProjects: true, blockNewStorageWhenOverLimit: true, overageMessage: 'Free users keep existing records but cannot create new items once storage limits are exceeded.' },
    founderOverrideBehavior: { eligible: false, lockedPlan: null, lockedPriceCents: null, preventAutomaticDowngrade: false, preservePriceOnReactivation: false, notes: ['Baseline plan with no founder protections.'] },
  },
  amateur: {
    key: 'amateur', planId: 'amateur', stripeLookupKey: 'amateur_monthly', displayName: 'Amateur', publicLabel: 'Amateur', monthlyPriceCents: 995, annualPriceCents: 9950, entitlementTier: 'amateur',
    monthlyLimits: { text_generations: 200, image_generations: 20, live_rehearsal_minutes: 0, video_analysis_clips: 2, saved_shows: 25, saved_ideas: 100 },
    heavyToolLimits: { imageGenerationsMonthly: 20, videoAnalysisClipsMonthly: 2, liveRehearsalMinutesMonthly: 0, maxConcurrentLiveSessions: 0, maxReconnectAttemptsPerSession: 0, maxVideoUploadMb: 25, maxImageUploadMb: 10 },
    storageLimits: { savedShows: 25, savedIdeas: 100 }, featureAccessMatrix: buildFeatureMatrix(AMATEUR_FEATURES),
    allowedUpgrades: ['founder_amateur', 'professional', 'founder_professional'],
    downgradeBehavior: { downgradeTo: 'free', takesEffect: 'period_end', preserveExistingProjects: true, blockNewStorageWhenOverLimit: true, overageMessage: 'After downgrading from Amateur, existing work remains but new saves are blocked until usage returns under Free limits.' },
    founderOverrideBehavior: { eligible: false, lockedPlan: null, lockedPriceCents: null, preventAutomaticDowngrade: false, preservePriceOnReactivation: false, notes: ['Standard Amateur pricing.'] },
  },
  founder_amateur: {
    key: 'founder_amateur', planId: 'founder_amateur', stripeLookupKey: 'founder_amateur_monthly', displayName: 'Founder Amateur', publicLabel: 'Founder Amateur', monthlyPriceCents: 995, annualPriceCents: 9950, entitlementTier: 'amateur',
    monthlyLimits: { text_generations: 200, image_generations: 20, live_rehearsal_minutes: 0, video_analysis_clips: 2, saved_shows: 25, saved_ideas: 100 },
    heavyToolLimits: { imageGenerationsMonthly: 20, videoAnalysisClipsMonthly: 2, liveRehearsalMinutesMonthly: 0, maxConcurrentLiveSessions: 0, maxReconnectAttemptsPerSession: 0, maxVideoUploadMb: 25, maxImageUploadMb: 10 },
    storageLimits: { savedShows: 25, savedIdeas: 100 }, featureAccessMatrix: buildFeatureMatrix(AMATEUR_FEATURES),
    allowedUpgrades: ['professional', 'founder_professional'],
    downgradeBehavior: { downgradeTo: 'free', takesEffect: 'period_end', preserveExistingProjects: true, blockNewStorageWhenOverLimit: true, overageMessage: 'Founder Amateur keeps access history, but new saves remain limited until billing is restored.' },
    founderOverrideBehavior: { eligible: true, lockedPlan: 'founder_amateur', lockedPriceCents: 995, preventAutomaticDowngrade: true, preservePriceOnReactivation: true, notes: FOUNDER_RATE_NOTES },
  },
  professional: {
    key: 'professional', planId: 'professional', stripeLookupKey: 'professional_monthly', displayName: 'Professional', publicLabel: 'Professional', monthlyPriceCents: 2995, annualPriceCents: 29950, entitlementTier: 'professional',
    monthlyLimits: { text_generations: 1000, image_generations: 100, live_rehearsal_minutes: 180, video_analysis_clips: 6, saved_shows: INFINITE_LIMIT, saved_ideas: INFINITE_LIMIT },
    heavyToolLimits: { imageGenerationsMonthly: 200, videoAnalysisClipsMonthly: 50, liveRehearsalMinutesMonthly: 300, maxConcurrentLiveSessions: 2, maxReconnectAttemptsPerSession: 5, maxVideoUploadMb: 50, maxImageUploadMb: 10 },
    storageLimits: { savedShows: INFINITE_LIMIT, savedIdeas: INFINITE_LIMIT }, featureAccessMatrix: buildFeatureMatrix(PROFESSIONAL_FEATURES),
    allowedUpgrades: ['founder_professional'],
    downgradeBehavior: { downgradeTo: 'amateur', takesEffect: 'period_end', preserveExistingProjects: true, blockNewStorageWhenOverLimit: true, overageMessage: 'After downgrading from Professional, existing items remain available, but new content creation is limited until the account returns under Amateur limits.' },
    founderOverrideBehavior: { eligible: false, lockedPlan: null, lockedPriceCents: null, preventAutomaticDowngrade: false, preservePriceOnReactivation: false, notes: ['Standard public Professional plan.'] },
  },
  founder_professional: {
    key: 'founder_professional', planId: 'founder_professional', stripeLookupKey: 'founder_professional_monthly', displayName: 'Founder Professional', publicLabel: 'Founder Professional', monthlyPriceCents: 2995, annualPriceCents: 29950, entitlementTier: 'professional',
    monthlyLimits: { text_generations: 1000, image_generations: 100, live_rehearsal_minutes: 180, video_analysis_clips: 6, saved_shows: INFINITE_LIMIT, saved_ideas: INFINITE_LIMIT },
    heavyToolLimits: { imageGenerationsMonthly: 200, videoAnalysisClipsMonthly: 50, liveRehearsalMinutesMonthly: 300, maxConcurrentLiveSessions: 2, maxReconnectAttemptsPerSession: 5, maxVideoUploadMb: 50, maxImageUploadMb: 10 },
    storageLimits: { savedShows: INFINITE_LIMIT, savedIdeas: INFINITE_LIMIT }, featureAccessMatrix: buildFeatureMatrix(PROFESSIONAL_FEATURES),
    allowedUpgrades: [],
    downgradeBehavior: { downgradeTo: 'free', takesEffect: 'period_end', preserveExistingProjects: true, blockNewStorageWhenOverLimit: true, overageMessage: 'Founder Professional keeps existing work if billing ends, but new content remains gated until billing is restored or reassigned by admin policy.' },
    founderOverrideBehavior: { eligible: true, lockedPlan: 'founder_professional', lockedPriceCents: 2995, preventAutomaticDowngrade: true, preservePriceOnReactivation: true, notes: FOUNDER_RATE_NOTES },
  },
};

export const BILLING_UPGRADE_PATHS: UpgradePathRule[] = [
  { from: 'free', to: 'amateur', allowed: true }, { from: 'free', to: 'founder_amateur', allowed: true }, { from: 'free', to: 'professional', allowed: true }, { from: 'free', to: 'founder_professional', allowed: true },
  { from: 'amateur', to: 'founder_amateur', allowed: true }, { from: 'amateur', to: 'professional', allowed: true }, { from: 'amateur', to: 'founder_professional', allowed: true },
  { from: 'founder_amateur', to: 'professional', allowed: true }, { from: 'founder_amateur', to: 'founder_professional', allowed: true },
  { from: 'professional', to: 'founder_professional', allowed: true },
  { from: 'founder_professional', to: 'professional', allowed: false, reason: 'Founder pricing should not be silently converted to public pricing.' },
];

const INTERNAL_PLAN_STATE_TO_BILLING_PLAN: Record<Exclude<InternalPlanState, BillingPlanKey>, BillingPlanKey> = { admin: 'professional', expired: 'free', trial: 'free' };
export const formatPriceCents = (cents: number | null | undefined) => cents == null ? '—' : `$${(cents / 100).toFixed(2)}`;
export const formatPlanPrice = (planKey: BillingPlanKey, cycle: BillingCycle) => formatPriceCents(cycle === 'yearly' ? BILLING_PLAN_CATALOG[planKey].annualPriceCents : BILLING_PLAN_CATALOG[planKey].monthlyPriceCents) + (cycle === 'yearly' ? '/yr' : '/mo');
export const getBillingPlanDefinition = (planKey: BillingPlanKey) => BILLING_PLAN_CATALOG[planKey];
export const getBillingPlanKeys = (): BillingPlanKey[] => Object.keys(BILLING_PLAN_CATALOG) as BillingPlanKey[];
export const isFounderUser = (user?: User | null): boolean => Boolean(user?.foundingCircleMember || user?.pricingLock);
export function resolveInternalPlanState(user?: User | null): InternalPlanState {
  if (!user) return 'free';
  const tier = normalizeTier(user.membership);
  if (isFounderUser(user) && tier === 'professional') return 'founder_professional';
  if (isFounderUser(user) && tier === 'amateur') return 'founder_amateur';
  if (tier === 'admin') return 'admin'; if (tier === 'expired') return 'expired'; if (tier === 'trial') return 'trial'; if (tier === 'amateur') return 'amateur'; if (tier === 'professional') return 'professional'; return 'free';
}
export const resolveBillingPlanKey = (user?: User | null): BillingPlanKey => {
  const state = resolveInternalPlanState(user);
  return state in BILLING_PLAN_CATALOG ? (state as BillingPlanKey) : INTERNAL_PLAN_STATE_TO_BILLING_PLAN[state as Exclude<InternalPlanState, BillingPlanKey>] ?? 'free';
};
export const getEffectiveEntitlementTier = (user?: User | null): CanonicalTier => { const state = resolveInternalPlanState(user); return state === 'admin' || state === 'expired' || state === 'trial' ? state : BILLING_PLAN_CATALOG[state].entitlementTier; };
export const getPlanLimits = (user?: User | null): PlanLimits => getBillingPlanDefinition(resolveBillingPlanKey(user)).monthlyLimits;
export const getStorageLimits = (user?: User | null): StorageLimits => getBillingPlanDefinition(resolveBillingPlanKey(user)).storageLimits;
export const getHeavyToolLimits = (user?: User | null): HeavyToolLimits => getBillingPlanDefinition(resolveBillingPlanKey(user)).heavyToolLimits;
export const getFeatureMatrix = (user?: User | null): Record<ToolName, boolean> => getBillingPlanDefinition(resolveBillingPlanKey(user)).featureAccessMatrix;
export const canUpgradePlan = (from: BillingPlanKey, to: BillingPlanKey): boolean => from !== to && BILLING_UPGRADE_PATHS.some((rule) => rule.from === from && rule.to === to && rule.allowed);
export const getDowngradeBehavior = (user?: User | null): DowngradeBehavior => getBillingPlanDefinition(resolveBillingPlanKey(user)).downgradeBehavior;
export const getFounderOverrideBehavior = (user?: User | null): FounderOverrideBehavior => getBillingPlanDefinition(resolveBillingPlanKey(user)).founderOverrideBehavior;
