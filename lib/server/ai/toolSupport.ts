import type { AIProvider } from '../providers/index.js';

export type ToolSupportRow = {
  id: string;
  label: string;
  category: 'core' | 'creative' | 'rehearsal' | 'multimodal' | 'admin';
  endpoints: string[];
  support: AIProvider[];
  note?: string;
};

// A human-readable registry of which tools/features can be served by which AI provider.
// This is intentionally explicit so Admin can see "what will break" before switching.
//
// IMPORTANT: Keep this list conservative. If in doubt, mark the tool as Gemini-only.
export const TOOL_SUPPORT: ToolSupportRow[] = [
  {
    id: 'ai_chat',
    label: 'AI Chat (core assistant)',
    category: 'core',
    endpoints: ['/api/ai/chat'],
    support: ['gemini', 'openai', 'anthropic'],
  },
  {
    id: 'ai_json',
    label: 'Structured JSON tools (director/planner outputs)',
    category: 'core',
    endpoints: ['/api/ai/json'],
    support: ['gemini', 'openai', 'anthropic'],
  },
  {
    id: 'ai_image_edit',
    label: 'Image tools (generate/edit)',
    category: 'multimodal',
    endpoints: ['/api/ai/image', '/api/generate-images', '/api/edit-images'],
    support: ['gemini', 'openai'],
    note: 'Anthropic does not support image generation/edit in this build.',
  },
  {
    id: 'identify_trick',
    label: 'Identify a Trick (vision recognition)',
    category: 'multimodal',
    endpoints: ['/api/ai/identify'],
    support: ['gemini'],
    note: 'Currently implemented with Google Gemini vision API only.',
  },
  {
    id: 'transcribe',
    label: 'Audio Transcribe',
    category: 'rehearsal',
    endpoints: ['/api/transcribe'],
    support: ['gemini'],
    note: 'Currently implemented with Google Gemini audio transcription only.',
  },
];

export function getProviderLimitations(provider: AIProvider) {
  const limitations = TOOL_SUPPORT.filter((t) => !(t.support || []).includes(provider));
  return {
    provider,
    limitations,
    limitations_count: limitations.length,
  };
}
