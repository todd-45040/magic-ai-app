import { enforceAiUsage } from './lib/usage';
import { resolveProvider, callOpenAI, callAnthropic } from './lib/providers';

/**
 * Text generation proxy.
 *
 * IMPORTANT:
 * - Do NOT import '@google/genai' at module scope.
 *   Some Vercel/Node runtimes treat it as ESM-only and will throw during
 *   function initialization, producing FUNCTION_INVOCATION_FAILED (500).
 * - Instead we dynamically import it inside the handler.
 */

export default async function handler(request: any, response: any) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return response.status(401).json({ error: 'Unauthorized.' });
  }

  // AI cost protection (daily caps + per-minute burst limits)
  const usage = await enforceAiUsage(request, 1);
  if (!usage.ok) {
    return response.status(usage.status || 429).json({
      error: usage.error || 'AI usage limit reached.',
      remaining: usage.remaining,
      limit: usage.limit,
      burstRemaining: usage.burstRemaining,
      burstLimit: usage.burstLimit,
    });
  }

  try {
    const provider = resolveProvider(request);
    const body = request.body || {};
    const model = body.model || process.env.AI_MODEL || 'gemini-2.0-flash';
    const contents = body.contents;
    const config = body.config || {};
    const tools = body.tools;

    let result: any;

    if (provider === 'openai') {
      result = await callOpenAI({ model, contents, config, tools });
    } else if (provider === 'anthropic') {
      result = await callAnthropic({ model, contents, config, tools });
    } else {
      // Gemini
      const apiKey = process.env.GOOGLE_API_KEY || process.env.API_KEY;
      if (!apiKey) {
        return response
          .status(500)
          .json({ error: 'Missing GOOGLE_API_KEY (or legacy API_KEY) in server environment.' });
      }

      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });

      result = await ai.models.generateContent({
        model,
        contents,
        config,
        tools,
      });
    }

    // Send headers for the Usage Meter UI
    response.setHeader('X-AI-Remaining', String(usage.remaining ?? ''));
    response.setHeader('X-AI-Limit', String(usage.limit ?? ''));
    response.setHeader('X-AI-Membership', String(usage.membership ?? ''));
    response.setHeader('X-AI-Burst-Remaining', String(usage.burstRemaining ?? ''));
    response.setHeader('X-AI-Burst-Limit', String(usage.burstLimit ?? ''));
    response.setHeader('X-AI-Provider-Used', provider);

    return response.status(200).json(result);
  } catch (error: any) {
    console.error('AI Provider Error:', error);
    return response.status(500).json({
      error: error?.message || 'Failed to generate response. Please try again.',
    });
  }
}
