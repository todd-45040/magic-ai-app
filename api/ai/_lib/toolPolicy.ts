export type AICostTier = 'LOW' | 'MEDIUM' | 'HIGH';

export type ToolPolicy = {
  tool: string;
  costTier: AICostTier;
  cooldownMs: number;
  duplicateWindowMs: number;
  payloadMaxBytes: number;
  promptMaxChars: number;
  contextMaxChars: number;
  imageMaxBytes?: number;
  imageMaxCount?: number;
  videoMaxBytes?: number;
  audioMaxSessionMinutes?: number;
};

const MB = 1024 * 1024;

export const TOOL_POLICIES: Record<string, ToolPolicy> = {
  chat: {
    tool: 'chat', costTier: 'LOW', cooldownMs: 4000, duplicateWindowMs: 30000,
    payloadMaxBytes: 2 * MB, promptMaxChars: 6000, contextMaxChars: 12000,
  },
  json: {
    tool: 'json', costTier: 'MEDIUM', cooldownMs: 9000, duplicateWindowMs: 45000,
    payloadMaxBytes: 2 * MB, promptMaxChars: 6000, contextMaxChars: 12000,
  },
  image: {
    tool: 'image_generation', costTier: 'HIGH', cooldownMs: 20000, duplicateWindowMs: 60000,
    payloadMaxBytes: 2 * MB, promptMaxChars: 4000, contextMaxChars: 4000, imageMaxBytes: 10 * MB, imageMaxCount: 1,
  },
  identify: {
    tool: 'identify_trick', costTier: 'HIGH', cooldownMs: 15000, duplicateWindowMs: 45000,
    payloadMaxBytes: 2 * MB, promptMaxChars: 3000, contextMaxChars: 3000, imageMaxBytes: 10 * MB, imageMaxCount: 1,
  },
  live_rehearsal_audio: {
    tool: 'live_rehearsal_audio', costTier: 'HIGH', cooldownMs: 20000, duplicateWindowMs: 60000,
    payloadMaxBytes: 512 * 1024, promptMaxChars: 2000, contextMaxChars: 2000, audioMaxSessionMinutes: 30,
  },
  video_rehearsal: {
    tool: 'video_rehearsal', costTier: 'HIGH', cooldownMs: 30000, duplicateWindowMs: 60000,
    payloadMaxBytes: 55 * MB, promptMaxChars: 4000, contextMaxChars: 4000, videoMaxBytes: 50 * MB,
  },
};

export function getToolPolicy(tool: string): ToolPolicy {
  return TOOL_POLICIES[tool] || TOOL_POLICIES.chat;
}

export function getCooldownHeaders(tool: string, resetAtMs: number): Record<string, string> {
  return {
    'X-AI-Tool': tool,
    'X-AI-Cooldown-Until': String(Math.floor(resetAtMs / 1000)),
  };
}
