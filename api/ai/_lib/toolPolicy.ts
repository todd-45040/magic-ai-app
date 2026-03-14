export type AiCostTier = 'LOW' | 'MEDIUM' | 'HIGH';

export type ToolPolicy = {
  tool: string;
  costTier: AiCostTier;
  burstWindowMs: number;
  burstMaxByPlan: Record<'trial' | 'amateur' | 'professional' | 'admin' | 'expired', number>;
  maxBodyBytes?: number;
  maxPromptChars?: number;
  maxContextChars?: number;
  maxFileBytes?: number;
  maxClipDurationSeconds?: number;
  allowedMimePrefixes?: string[];
};

const FIVE_MIN = 5 * 60_000;

export const TOOL_POLICIES: Record<string, ToolPolicy> = {
  chat: {
    tool: 'chat', costTier: 'LOW', burstWindowMs: FIVE_MIN,
    burstMaxByPlan: { trial: 5, amateur: 20, professional: 50, admin: 100, expired: 0 },
    maxBodyBytes: 2 * 1024 * 1024, maxPromptChars: 6000, maxContextChars: 12000,
  },
  json: {
    tool: 'json', costTier: 'MEDIUM', burstWindowMs: FIVE_MIN,
    burstMaxByPlan: { trial: 5, amateur: 20, professional: 50, admin: 100, expired: 0 },
    maxBodyBytes: 2 * 1024 * 1024, maxPromptChars: 6000, maxContextChars: 12000,
  },
  image_generation: {
    tool: 'image_generation', costTier: 'HIGH', burstWindowMs: FIVE_MIN,
    burstMaxByPlan: { trial: 2, amateur: 6, professional: 12, admin: 25, expired: 0 },
    maxBodyBytes: 2 * 1024 * 1024, maxPromptChars: 4000, maxContextChars: 6000, maxFileBytes: 10 * 1024 * 1024,
    allowedMimePrefixes: ['image/'],
  },
  visual_brainstorm: {
    tool: 'visual_brainstorm', costTier: 'HIGH', burstWindowMs: FIVE_MIN,
    burstMaxByPlan: { trial: 0, amateur: 6, professional: 12, admin: 25, expired: 0 },
    maxBodyBytes: 2 * 1024 * 1024, maxPromptChars: 4000, maxContextChars: 6000, maxFileBytes: 10 * 1024 * 1024,
    allowedMimePrefixes: ['image/'],
  },
  identify_trick: {
    tool: 'identify_trick', costTier: 'MEDIUM', burstWindowMs: FIVE_MIN,
    burstMaxByPlan: { trial: 5, amateur: 20, professional: 50, admin: 100, expired: 0 },
    maxBodyBytes: 2 * 1024 * 1024, maxFileBytes: 10 * 1024 * 1024, allowedMimePrefixes: ['image/'],
  },
  live_rehearsal_audio: {
    tool: 'live_rehearsal_audio', costTier: 'HIGH', burstWindowMs: FIVE_MIN,
    burstMaxByPlan: { trial: 0, amateur: 4, professional: 8, admin: 20, expired: 0 },
    maxBodyBytes: 256 * 1024, maxPromptChars: 3000, maxContextChars: 6000,
  },
  video_analysis: {
    tool: 'video_analysis', costTier: 'HIGH', burstWindowMs: FIVE_MIN,
    burstMaxByPlan: { trial: 0, amateur: 3, professional: 8, admin: 20, expired: 0 },
    maxBodyBytes: 512 * 1024, maxPromptChars: 4000, maxContextChars: 6000,
    maxFileBytes: 50 * 1024 * 1024, maxClipDurationSeconds: 180,
    allowedMimePrefixes: ['video/'],
  },
};

export function normalizePlan(plan?: string | null): 'trial' | 'amateur' | 'professional' | 'admin' | 'expired' {
  const p = String(plan || '').toLowerCase();
  if (p === 'admin') return 'admin';
  if (p === 'professional' || p === 'pro') return 'professional';
  if (p === 'amateur' || p === 'performer' || p === 'semi-pro') return 'amateur';
  if (p === 'expired') return 'expired';
  return 'trial';
}

export function getToolPolicy(tool: string): ToolPolicy {
  return TOOL_POLICIES[tool] || TOOL_POLICIES.chat;
}
