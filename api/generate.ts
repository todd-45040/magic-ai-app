import { GoogleGenAI } from '@google/genai';
import { enforceAiUsage } from '../server/usage';
import { resolveProvider, callOpenAI, callAnthropic } from '../server/providers';
import { requireSupabaseAuth } from '../server/auth';
import { getAppSettings } from '../server/settings';
import { getGeminiApiKey, DEFAULT_GEMINI_TEXT_MODEL } from '../server/gemini';

export default async function handler(request: any, response: any) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  // AI cost protection (daily caps + per-minute burst limits)
  const usage = await enforceAiUsage(request, 1);
  if (!usage.ok) {
    return response
      .status(usage.status || 429)
      .json({
        error: usage.error || 'AI usage limit reached.',
        remaining: usage.remaining,
        limit: usage.limit,
        burstRemaining: usage.burstRemaining,
        burstLimit: usage.burstLimit,
      });
  }

  try {
    // Default provider is controlled server-side (and via Admin Settings table if present).
    // End-users do NOT get to pick the provider.
    let defaultProvider: any = 'gemini';
    try {
      const auth = await requireSupabaseAuth(request);
      if (auth.ok) {
        const settings = await getAppSettings((auth as any).admin);
        defaultProvider = settings.aiProvider || defaultProvider;
      }
    } catch {}

    const provider = resolveProvider(request, { allowHeader: false, defaultProvider });
    const { model, contents, config } = request.body || {};

    let result: any;

    if (provider === 'openai') {
      result = await callOpenAI({ model, contents, config });
    } else if (provider === 'anthropic') {
      result = await callAnthropic({ model, contents, config });
    } else {
      const apiKey = getGeminiApiKey();
      if (!apiKey) {
        return response.status(503).json({ error: 'Gemini API key is not configured on the server.' });
      }

      const ai = new GoogleGenAI({ apiKey });
      result = await ai.models.generateContent({
        model: model || DEFAULT_GEMINI_TEXT_MODEL,
        contents,
        config: {
          ...config,
        },
      });
    }

    // Return usage headers for the Usage Meter UI (best-effort)
    response.setHeader('X-AI-Remaining', String(usage.remaining ?? ''));
    response.setHeader('X-AI-Limit', String(usage.limit ?? ''));
    response.setHeader('X-AI-Membership', String(usage.membership ?? ''));
    response.setHeader('X-AI-Burst-Remaining', String(usage.burstRemaining ?? ''));
    response.setHeader('X-AI-Burst-Limit', String(usage.burstLimit ?? ''));
    response.setHeader('X-AI-Provider-Used', provider);

    return response.status(200).json(result);
  } catch (error: any) {
    console.error('AI Provider Error:', error);

    if (error?.message?.includes('finishReason: SAFETY')) {
      return response.status(400).json({ error: 'The request was blocked by safety filters.' });
    }

    return response.status(500).json({
      error: error?.message || 'An internal error occurred while processing your request.',
    });
  }
}
