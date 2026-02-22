// NOTE:
// Vercel serverless functions run as ESM. In ESM, relative imports must include
// the file extension (e.g. './lib/usage.js') or Node will throw ERR_MODULE_NOT_FOUND
// even when the file exists.
//
// Also: keep provider SDK imports *inside* the handler via dynamic import.
// This avoids "FUNCTION_INVOCATION_FAILED" when a module has ESM/CJS quirks.

import { enforceAiUsage } from '../server/usage.js';
import { resolveProvider, callOpenAI, callAnthropic } from '../lib/server/providers/index';

export default async function handler(request: any, response: any) {
  // IMPORTANT:
  // Vercel will sometimes return a plain-text 500 "FUNCTION_INVOCATION_FAILED"
  // when an exception occurs outside our try/catch. That makes the UI show the
  // unhelpful message "Request failed (500)". To avoid that, keep *all* logic
  // inside a single try/catch and always return JSON.
  try {
    if (request.method !== 'POST') {
      return response.status(405).json({ error: 'Method not allowed' });
    }

    // Basic Auth Check (Simulated)
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return response.status(401).json({ error: 'Unauthorized. Please log in.' });
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

    const provider = resolveProvider(request);
    const { model, contents, config } = request.body || {};

    let result: any;

    if (provider === 'openai') {
      result = await callOpenAI({ model, contents, config });
    } else if (provider === 'anthropic') {
      result = await callAnthropic({ model, contents, config });
    } else {
      const apiKey = process.env.GOOGLE_API_KEY || process.env.API_KEY;
      if (!apiKey) {
        return response
          .status(500)
          .json({
            error:
              'Google API key is not configured. Set GOOGLE_API_KEY (preferred) or API_KEY in Vercel environment variables.',
          });
      }

      // Dynamic import to avoid hard crashes at module init time.
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });
      result = await ai.models.generateContent({
        model: model || 'gemini-3-pro-preview',
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
    // Ensure we always return JSON so the client can show a helpful message.
    console.error('AI Provider Error:', error);

    if (error?.message?.includes('finishReason: SAFETY')) {
      return response.status(400).json({ error: 'The request was blocked by safety filters.' });
    }

    return response.status(500).json({
      error: error?.message || 'An internal error occurred while processing your request.',
    });
  }
}
