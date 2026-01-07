import { GoogleGenAI } from '@google/genai';
import { enforceAiUsage } from './_lib/usage';
import { resolveProvider } from './_lib/providers';

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
    const { prompt, aspectRatio = '1:1' } = request.body || {};

    let result: any;

    if (provider === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) return response.status(500).json({ error: 'OPENAI_API_KEY is not configured.' });

      const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';

      const resp = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          prompt: String(prompt || ''),
          // size mapping: OpenAI uses fixed sizes; keep default
          size: '1024x1024',
          response_format: 'b64_json',
        }),
      });

      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const msg = json?.error?.message || json?.message || `OpenAI image request failed (${resp.status})`;
        return response.status(500).json({ error: msg });
      }

      result = json; // geminiService already supports data[0].b64_json
    } else if (provider === 'anthropic') {
      return response.status(400).json({ error: 'Image generation is not supported for Anthropic provider.' });
    } else {
      const apiKey = process.env.API_KEY;
      if (!apiKey) {
        return response.status(500).json({ error: 'API_KEY is not configured on the server.' });
      }

      const ai = new GoogleGenAI({ apiKey });
      result = await ai.models.generateImages({
        model: 'imagen-4.0-generate-preview-06-06',
        prompt,
        config: {
          numberOfImages: 1,
          outputMimeType: 'image/jpeg',
          aspectRatio,
        },
      });
    }

    response.setHeader('X-AI-Remaining', String(usage.remaining ?? ''));
    response.setHeader('X-AI-Limit', String(usage.limit ?? ''));
    response.setHeader('X-AI-Membership', String(usage.membership ?? ''));
    response.setHeader('X-AI-Burst-Remaining', String(usage.burstRemaining ?? ''));
    response.setHeader('X-AI-Burst-Limit', String(usage.burstLimit ?? ''));
    response.setHeader('X-AI-Provider-Used', provider);

    return response.status(200).json(result);
  } catch (error: any) {
    console.error('Image Provider Error:', error);
    return response.status(500).json({
      error: error?.message || 'Failed to generate image. Please try a different prompt.',
    });
  }
}
