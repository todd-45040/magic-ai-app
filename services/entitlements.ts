import type { Show, User } from '../types';
import { normalizeTier, type CanonicalTier } from './membershipService.js';
import { getPlanLimits, getEffectiveEntitlementTier } from './planCatalog.js';
import { getTierLimit } from './usageService.js';

export type ToolName =
  | 'EffectGenerator'
  | 'PatterEngine'
  | 'ShowPlanner'
  | 'SavedIdeas'
  | 'Search'
  | 'LiveRehearsal'
  | 'VideoAnalysis'
  | 'PersonaSimulator'
  | 'VisualBrainstorm'
  | 'DirectorMode'
  | 'ImageGeneration'
  | 'CRM'
  | 'Contracts'
  | 'FinanceTracker'
  | 'MarketingGenerator'
  | 'MagicWire'
  | 'Publications'
  | 'Community'
  | 'IdentifyTrick'
  | 'AssistantStudio'
  | 'PropChecklists'
  | 'ShowFeedback'
  | 'GospelMagic'
  | 'MentalismAssistant'
  | 'IllusionBlueprint'
  | 'MagicDictionary'
  | 'MagicTheoryTutor'
  | 'MagicArchives'
  | 'InnovationEngine'
  | 'AngleRiskAnalysis'
  | 'RehearsalCoaching';

export type ResourceType =
  | 'text_generations'
  | 'image_generations'
  | 'live_rehearsal_minutes'
  | 'video_analysis_clips'
  | 'saved_shows'
  | 'saved_ideas';

export type AccessState = 'unlocked' | 'limited' | 'locked';

type TierConfig = {
  text_generations: number;
  image_generations: number;
  live_rehearsal_minutes: number;
  video_analysis_clips: number;
  saved_shows: number;
  saved_ideas: number;
  warningThresholds: number[];
  enforcement: 'hard_stop' | 'warning_hard_stop' | 'soft_cap_review';
};

type ToolPolicy = {
  minTier: CanonicalTier;
  allowedTiers?: CanonicalTier[];
  limitedTiers?: CanonicalTier[];
  usageResource?: ResourceType;
  upgradeLabel?: 'Amateur' | 'Professional';
};

const INFINITE_LIMIT = Number.MAX_SAFE_INTEGER;

export const PLAN_USAGE_MATRIX: Record<CanonicalTier, TierConfig> = {
  free: {
    ...getPlanLimits({ membership: 'free' } as User),
    warningThresholds: [0.7, 0.9, 1],
    enforcement: 'hard_stop',
  },
  trial: {
    ...getPlanLimits({ membership: 'trial' } as User),
    warningThresholds: [0.7, 0.9, 1],
    enforcement: 'hard_stop',
  },
  amateur: {
    ...getPlanLimits({ membership: 'amateur' } as User),
    warningThresholds: [0.8, 1],
    enforcement: 'warning_hard_stop',
  },
  professional: {
    ...getPlanLimits({ membership: 'professional' } as User),
    warningThresholds: [0.9, 1],
    enforcement: 'soft_cap_review',
  },
  admin: {
    text_generations: INFINITE_LIMIT,
    image_generations: INFINITE_LIMIT,
    live_rehearsal_minutes: INFINITE_LIMIT,
    video_analysis_clips: INFINITE_LIMIT,
    saved_shows: INFINITE_LIMIT,
    saved_ideas: INFINITE_LIMIT,
    warningThresholds: [1],
    enforcement: 'soft_cap_review',
  },
  expired: {
    text_generations: 0,
    image_generations: 0,
    live_rehearsal_minutes: 0,
    video_analysis_clips: 0,
    saved_shows: 0,
    saved_ideas: 0,
    warningThresholds: [1],
    enforcement: 'hard_stop',
  },
};

const TOOL_POLICIES: Record<ToolName, ToolPolicy> = {
  EffectGenerator: { minTier: 'free', limitedTiers: ['free', 'trial'], usageRepartner_source: 'text_generations', upgradeLabel: 'Amateur' },
  PatterEngine: { minTier: 'free', limitedTiers: ['free', 'trial'], usageRepartner_source: 'text_generations', upgradeLabel: 'Amateur' },
  ShowPlanner: { minTier: 'amateur', allowedTiers: ['trial', 'amateur', 'professional', 'admin'], limitedTiers: ['trial', 'amateur'], usageRepartner_source: 'saved_shows', upgradeLabel: 'Amateur' },
  SavedIdeas: { minTier: 'amateur', allowedTiers: ['trial', 'amateur', 'professional', 'admin'], limitedTiers: ['trial', 'amateur'], usageRepartner_source: 'saved_ideas', upgradeLabel: 'Amateur' },
  Search: { minTier: 'amateur', limitedTiers: ['amateur'], upgradeLabel: 'Amateur' },
  LiveRehearsal: { minTier: 'professional', usageRepartner_source: 'live_rehearsal_minutes', upgradeLabel: 'Professional' },
  VideoAnalysis: { minTier: 'amateur', allowedTiers: ['trial', 'amateur', 'professional', 'admin'], limitedTiers: ['trial', 'amateur'], usageRepartner_source: 'video_analysis_clips', upgradeLabel: 'Professional' },
  PersonaSimulator: { minTier: 'professional', usageRepartner_source: 'text_generations', upgradeLabel: 'Professional' },
  VisualBrainstorm: { minTier: 'amateur', allowedTiers: ['trial', 'amateur', 'professional', 'admin'], limitedTiers: ['trial', 'amateur'], usageRepartner_source: 'image_generations', upgradeLabel: 'Professional' },
  DirectorMode: { minTier: 'professional', usageRepartner_source: 'text_generations', upgradeLabel: 'Professional' },
  ImageGeneration: { minTier: 'professional', usageRepartner_source: 'image_generations', upgradeLabel: 'Professional' },
  CRM: { minTier: 'professional', upgradeLabel: 'Professional' },
  Contracts: { minTier: 'professional', upgradeLabel: 'Professional' },
  FinanceTracker: { minTier: 'professional', upgradeLabel: 'Professional' },
  MarketingGenerator: { minTier: 'professional', usageRepartner_source: 'text_generations', upgradeLabel: 'Professional' },
  MagicWire: { minTier: 'free' },
  Publications: { minTier: 'free' },
  Community: { minTier: 'free' },
  IdentifyTrick: { minTier: 'free', limitedTiers: ['free', 'trial'], upgradeLabel: 'Amateur' },
  AssistantStudio: { minTier: 'professional', upgradeLabel: 'Professional' },
  PropChecklists: { minTier: 'professional', upgradeLabel: 'Professional' },
  ShowFeedback: { minTier: 'professional', upgradeLabel: 'Professional' },
  GospelMagic: { minTier: 'amateur', allowedTiers: ['trial', 'amateur', 'professional', 'admin'], limitedTiers: ['trial', 'amateur'], usageRepartner_source: 'text_generations', upgradeLabel: 'Professional' },
  MentalismAssistant: { minTier: 'amateur', allowedTiers: ['trial', 'amateur', 'professional', 'admin'], limitedTiers: ['trial', 'amateur'], usageRepartner_source: 'text_generations', upgradeLabel: 'Professional' },
  IllusionBlueprint: { minTier: 'professional', usageRepartner_source: 'image_generations', upgradeLabel: 'Professional' },
  MagicDictionary: { minTier: 'amateur', limitedTiers: ['amateur'], usageRepartner_source: 'text_generations', upgradeLabel: 'Professional' },
  MagicTheoryTutor: { minTier: 'amateur', limitedTiers: ['amateur'], usageRepartner_source: 'text_generations', upgradeLabel: 'Professional' },
  MagicArchives: { minTier: 'amateur', upgradeLabel: 'Amateur' },
  InnovationEngine: { minTier: 'amateur', usageRepartner_source: 'text_generations', upgradeLabel: 'Amateur' },
  AngleRiskAnalysis: { minTier: 'professional', usageRepartner_source: 'text_generations', upgradeLabel: 'Professional' },
  RehearsalCoaching: { minTier: 'professional', usageRepartner_source: 'text_generations', upgradeLabel: 'Professional' },
};

function tierRank(tier: CanonicalTier): number {
  switch (tier) {
    case 'expired':
      return 0;
    case 'free':
    case 'trial':
      return 1;
    case 'amateur':
      return 2;
    case 'professional':
      return 3;
    case 'admin':
      return 4;
    default:
      return 0;
  }
}

export function getTierConfig(user?: User | null): TierConfig {
  const tier = getEffectiveEntitlementTier(user);
  return PLAN_USAGE_MATRIX[tier] ?? PLAN_USAGE_MATRIX.trial;
}

export function getUsageLimit(user: User | null | undefined, resourceType: ResourceType): number {
  return getTierConfig(user)[resourceType];
}

export function getResourceUsage(user: User | null | undefined, resourceType: ResourceType, counts?: Partial<Record<ResourceType, number>>) {
  const limit = getUsageLimit(user, resourceType);
  const used = Math.max(0, Number(counts?.[resourceType] ?? 0));
  const remaining = limit >= INFINITE_LIMIT ? INFINITE_LIMIT : Math.max(0, limit - used);
  const ratio = limit > 0 && limit < INFINITE_LIMIT ? used / limit : 0;
  return { used, limit, remaining, ratio, unlimited: limit >= INFINITE_LIMIT };
}

export function hasRemainingUsage(user: User | null | undefined, resourceType: ResourceType, counts?: Partial<Record<ResourceType, number>>, amount = 1): boolean {
  const usage = getResourceUsage(user, resourceType, counts);
  if (usage.unlimited) return true;
  return usage.remaining >= amount;
}

export function getWarningLevel(user: User | null | undefined, resourceType: ResourceType, counts?: Partial<Record<ResourceType, number>>) {
  const tierConfig = getTierConfig(user);
  const usage = getResourceUsage(user, resourceType, counts);
  if (usage.unlimited || usage.limit <= 0) return null;
  const matched = [...tierConfig.warningThresholds].sort((a, b) => b - a).find((threshold) => usage.ratio >= threshold);
  if (!matched) return null;
  return Math.round(matched * 100);
}

export function canUseTool(user: User | null | undefined, toolName: ToolName): boolean {
  const policy = TOOL_POLICIES[toolName];
  const tier = getEffectiveEntitlementTier(user);
  if (policy.allowedTiers?.length) return policy.allowedTiers.includes(tier);
  return tierRank(tier) >= tierRank(policy.minTier);
}

export function getToolAccess(user: User | null | undefined, toolName: ToolName): {
  state: AccessState;
  upgradeLabel: 'Amateur' | 'Professional' | null;
  resource?: ResourceType;
  tier: CanonicalTier;
} {
  const policy = TOOL_POLICIES[toolName];
  const tier = getEffectiveEntitlementTier(user);
  if (!policy) return { state: 'locked', upgradeLabel: 'Professional', tier };
  if (!canUseTool(user, toolName)) {
    return {
      state: 'locked',
      upgradeLabel: policy.upgradeLabel ?? (tierRank(policy.minTier) >= tierRank('professional') ? 'Professional' : 'Amateur'),
      repartner_source: policy.usageResource,
      tier,
    };
  }
  if (policy.limitedTiers?.includes(tier)) {
    return { state: 'limited', upgradeLabel: policy.upgradeLabel ?? null, repartner_source: policy.usageResource, tier };
  }
  return { state: 'unlocked', upgradeLabel: null, repartner_source: policy.usageResource, tier };
}

export function getToolAccessMessage(user: User | null | undefined, toolName: ToolName): string | null {
  const access = getToolAccess(user, toolName);
  if (access.state === 'locked') {
    return `🔒 ${access.upgradeLabel || 'Upgrade'} feature — upgrade to unlock ${toolName.replace(/([A-Z])/g, ' $1').trim()}.`;
  }
  if (access.state === 'limited' && access.resource) {
    const limit = getUsageLimit(user, access.resource);
    if (limit >= INFINITE_LIMIT) return null;
    return `${toolName.replace(/([A-Z])/g, ' $1').trim()} is included on your current tier with a ${limit.toLocaleString()} ${access.resource.replace(/_/g, ' ')} monthly allowance.`;
  }
  return null;
}


const PROMPT_TITLE_TOOL_MAP: Partial<Record<string, ToolName>> = {
  'Effect Generator': 'EffectGenerator',
  'Patter Engine': 'PatterEngine',
  'Innovation Engine': 'InnovationEngine',
  'Angle/Risk Analysis': 'AngleRiskAnalysis',
  'Rehearsal Coaching': 'RehearsalCoaching',
  'Live Patter Rehearsal': 'LiveRehearsal',
  'Video Rehearsal Studio': 'VideoAnalysis',
  'Director Mode': 'DirectorMode',
  'Illusion Blueprint Generator': 'IllusionBlueprint',
  'Magic Theory Tutor': 'MagicTheoryTutor',
  'Magic Dictionary': 'MagicDictionary',
  'Persona Simulator': 'PersonaSimulator',
  'Visual Brainstorm Studio': 'VisualBrainstorm',
  'Prop Checklist Generator': 'PropChecklists',
  'Marketing Campaign': 'MarketingGenerator',
  'Contract Generator': 'Contracts',
  "Assistant's Studio": 'AssistantStudio',
  'Client Management': 'CRM',
  'Magic Archives': 'MagicArchives',
  'Global Search': 'Search',
  'My Saved Ideas': 'SavedIdeas',
  'Gospel Magic Assistant': 'GospelMagic',
  'Mentalism Assistant': 'MentalismAssistant',
  'Show Feedback': 'ShowFeedback',
};

export function getToolNameForPromptTitle(title: string): ToolName | null {
  return PROMPT_TITLE_TOOL_MAP[title] ?? null;
}

export function getPromptAccess(user: User | null | undefined, title: string) {
  const toolName = getToolNameForPromptTitle(title);
  if (!toolName) {
    return { toolName: null, state: 'unlocked' as AccessState, upgradeLabel: null as 'Amateur' | 'Professional' | null, tier: getEffectiveEntitlementTier(user) };
  }
  return { toolName, ...getToolAccess(user, toolName) };
}

export function getShowPlannerUsage(user: User | null | undefined, shows: Show[]) {
  const showUsage = getResourceUsage(user, 'saved_shows', { saved_shows: shows.length });
  const activeShows = shows.filter((show) => String((show as any).status || '').toLowerCase() !== 'completed').length;
  const taskCount = shows.reduce((sum, show) => sum + (Array.isArray(show.tasks) ? show.tasks.length : 0), 0);
  return {
    showUsage,
    activeShows,
    taskCount,
    summary: showUsage.unlimited
      ? `${shows.length} saved show${shows.length === 1 ? '' : 's'} across your workspace.`
      : `${showUsage.used} of ${showUsage.limit} saved shows used this month.`,
  };
}

export function getLimitReachedMessage(user: User | null | undefined, resourceType: ResourceType): string {
  const tier = getEffectiveEntitlementTier(user);
  const readable = resourceType.replace(/_/g, ' ');
  if (resourceType === 'saved_shows') {
    return tier === 'professional' || tier === 'admin'
      ? 'Show storage is under review for unusually heavy usage.'
      : 'You have reached your saved show limit. Upgrade to Amateur or Professional to continue adding shows.';
  }
  return tier === 'professional' || tier === 'admin'
    ? `You are at the current fair-use threshold for ${readable}.`
    : `You have reached your monthly ${readable} limit. Upgrade to continue.`;
}

export function getUsageLimitBanner(user: User | null | undefined, resourceType: ResourceType, counts?: Partial<Record<ResourceType, number>>) {
  const usage = getResourceUsage(user, resourceType, counts);
  const warningLevel = getWarningLevel(user, resourceType, counts);
  if (usage.unlimited) return null;
  return {
    label: `${usage.used} / ${usage.limit}`,
    remainingLabel: `${usage.remaining} remaining`,
    warningLevel,
    reached: usage.remaining <= 0,
    message: usage.remaining <= 0
      ? getLimitReachedMessage(user, resourceType)
      : warningLevel
        ? `You have used ${usage.used} of ${usage.limit} ${resourceType.replace(/_/g, ' ')}.`
        : null,
  };
}

export function getLegacyDailyTextGenerationLimit(user: User | null | undefined): number {
  return user ? getTierLimit(user.membership) : 0;
}
