import { GoogleGenAI } from '@google/genai';
import { enforceAiUsage } from '../server/usage';
import { resolveProvider, callOpenAI, callAnthropic } from '../server/providers';

export default async function handler(request: any, response: any) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return response.status(401).json({ error: 'Unauthorized.' });
  }

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
    const provider = resolveProvider(request);
    const body = request.body || {};
    let result: any;

    if (provider === 'openai') {
      // Accept either Gemini-style body (model/contents/config) or {prompt, systemInstruction}
      const contents =
        body.contents ||
        [
          { role: 'user', parts: [{ text: body.prompt || '' }] },
        ];

      const config = body.config || {
        systemInstruction: body.systemInstruction,
      };

      result = await callOpenAI({
        model: body.model || 'gemini-3-flash-preview',
        contents,
        config,
      });
    } else if (provider === 'anthropic') {
      const contents =
        body.contents ||
        [
          { role: 'user', parts: [{ text: body.prompt || '' }] },
        ];

      const config = body.config || {
        systemInstruction: body.systemInstruction,
      };

      result = await callAnthropic({
        model: body.model || 'gemini-3-flash-preview',
        contents,
        config,
      });
    } else {
      const apiKey = process.env.API_KEY;
      if (!apiKey) {
        return response.status(500).json({ error: 'API_KEY is not configured.' });
      }

      const ai = new GoogleGenAI({ apiKey });

      if (body.prompt && body.systemInstruction) {
        // For endpoints that send prompt/systemInstruction directly
        result = await ai.models.generateContent({
          model: body.model || 'gemini-3-flash-preview',
          contents: [{ role: 'user', parts: [{ text: body.prompt }] }],
          config: {
            systemInstruction: body.systemInstruction,
          },
        });
      } else {
        // For endpoints that send model/contents/config
        result = await ai.models.generateContent({
          model: body.model || 'gemini-3-flash-preview',
          contents: body.contents,
          config: body.config,
        });
      }
    }

    response.setHeader('X-AI-Remaining', String(usage.remaining ?? ''));
    response.setHeader('X-AI-Limit', String(usage.limit ?? ''));
    response.setHeader('X-AI-Membership', String(usage.membership ?? ''));
    response.setHeader('X-AI-Burst-Remaining', String(usage.burstRemaining ?? ''));
    response.setHeader('X-AI-Burst-Limit', String(usage.burstLimit ?? ''));
    response.setHeader('X-AI-Provider-Used', provider);

    return response.status(200).json(result);
  } catch (error: any) {
    console.error('AI Provider Error:', error);
    return response.status(500).json({ error: error?.message || 'Request failed.' });
  }
}
