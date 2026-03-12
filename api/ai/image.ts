import { getGoogleAiApiKey } from '../../server/gemini.js';
import { handleAiRequest } from '../../server/ai/handleAiRequest.js';

function promptFromMessages(messages: any[]): string {
  if (!Array.isArray(messages)) return '';
  return messages.map((m) => String(m?.content || '').trim()).filter(Boolean).join('\n\n').slice(0, 8000);
}

export default async function handler(req: any, res: any) {
  return handleAiRequest(req, res, {
    tool: 'image_generation',
    endpoint: '/api/ai/image',
    costTier: 'high',
    cooldownMs: 20_000,
    run: async ({ body, provider }) => {
      const prompt = typeof body.prompt === 'string' && body.prompt.trim() ? body.prompt : promptFromMessages(body.messages);
      if (!prompt.trim()) {
        const e: any = new Error('Missing required input: provide `prompt` or `messages`.');
        e.code = 'BAD_REQUEST';
        throw e;
      }
      if (provider === 'anthropic') {
        const e: any = new Error('Image generation is not supported for Anthropic provider.');
        e.code = 'BAD_REQUEST';
        throw e;
      }
      if (provider === 'openai') {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) throw new Error('OPENAI_API_KEY is not configured.');
        const resp = await fetch('https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1', prompt, size: '1024x1024', response_format: 'b64_json' }),
        });
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(json?.error?.message || `OpenAI image request failed (${resp.status})`);
        return json;
      }
      const apiKey = getGoogleAiApiKey();
      if (!apiKey) throw new Error('Google AI API key is not configured. Set GOOGLE_AI_API_KEY.');
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });
      return ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt,
        config: { numberOfImages: 1, outputMimeType: 'image/jpeg', aspectRatio: body.aspectRatio || '1:1' },
      });
    },
    normalize: (result: any) => {
      const generated = result?.generatedImages || result?.images || [];
      const images = Array.isArray(generated)
        ? generated.map((img: any) => img?.image?.imageBytes || img?.imageBytes || img?.b64_json || img?.base64).filter(Boolean)
        : [];
      return { images, raw: result };
    },
  });
}
