import { resolveProvider, type AIProvider } from '../../../lib/server/providers/index.js';
import { getGoogleAiApiKey } from '../../../server/gemini.js';

export type ImageProvider = 'gemini' | 'openai';

export type ImageProviderResolution = {
  provider: ImageProvider;
  requestedProvider: AIProvider;
  warnings: string[];
};

function hasOpenAiImageKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

function hasGeminiImageKey(): boolean {
  return Boolean(getGoogleAiApiKey());
}

/**
 * Resolve an image-capable provider.
 *
 * The app has a global AI provider setting for text/json tools, but not every
 * provider can generate/edit images. Visual Brainstorm and Illusion Blueprint
 * must not fail just because the global provider is Anthropic. Prefer the
 * configured provider only when it supports images and is configured; otherwise
 * fall back to an image-capable provider with a configured key.
 */
export async function resolveImageProvider(req: any): Promise<ImageProviderResolution> {
  const requestedProvider = await resolveProvider(req);
  const warnings: string[] = [];

  if (requestedProvider === 'openai') {
    if (hasOpenAiImageKey()) return { provider: 'openai', requestedProvider, warnings };
    if (hasGeminiImageKey()) {
      warnings.push('Global provider is OpenAI, but OPENAI_API_KEY is not configured for images; using Gemini image provider.');
      return { provider: 'gemini', requestedProvider, warnings };
    }
    throw Object.assign(new Error('No image provider is configured. Set OPENAI_API_KEY or GOOGLE_AI_API_KEY.'), {
      status: 500,
      code: 'CONFIG_ERROR',
    });
  }

  if (requestedProvider === 'anthropic') {
    if (hasGeminiImageKey()) {
      warnings.push('Global provider is Anthropic, which does not support image generation; using Gemini image provider.');
      return { provider: 'gemini', requestedProvider, warnings };
    }
    if (hasOpenAiImageKey()) {
      warnings.push('Global provider is Anthropic, which does not support image generation; using OpenAI image provider.');
      return { provider: 'openai', requestedProvider, warnings };
    }
    throw Object.assign(new Error('The selected AI provider does not support image generation, and no image-capable provider key is configured.'), {
      status: 500,
      code: 'CONFIG_ERROR',
    });
  }

  // Default / Gemini path.
  if (hasGeminiImageKey()) return { provider: 'gemini', requestedProvider, warnings };
  if (hasOpenAiImageKey()) {
    warnings.push('Gemini image provider is not configured; using OpenAI image provider.');
    return { provider: 'openai', requestedProvider, warnings };
  }

  throw Object.assign(new Error('Google AI API key is not configured. Set GOOGLE_AI_API_KEY.'), {
    status: 500,
    code: 'CONFIG_ERROR',
  });
}
