import { callAnthropic, callOpenAI } from '../../lib/server/providers/index.js';
import { getGoogleAiApiKey } from '../../server/gemini.js';
import { handleAiRequest } from '../../server/ai/handleAiRequest.js';

function messagesToGeminiContents(messages: any[]): any[] {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((m) => m && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(m.content) }],
    }));
}

function extractText(result: any): string {
  const t1 = result?.response?.text?.();
  if (typeof t1 === 'string' && t1.trim()) return t1;
  if (typeof result?.text === 'string' && result.text.trim()) return result.text;
  const parts = result?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    const joined = parts.map((p: any) => p?.text).filter(Boolean).join('').trim();
    if (joined) return joined;
  }
  return '{}';
}

export default async function handler(req: any, res: any) {
  return handleAiRequest(req, res, {
    tool: 'json_generation',
    endpoint: '/api/ai/json',
    costTier: 'medium',
    validate: ({ body, provider }) => {
      if (provider === 'gemini') {
        const contents = body.contents || (Array.isArray(body.messages) ? messagesToGeminiContents(body.messages) : []);
        if (!Array.isArray(contents) || contents.length === 0) {
          const e: any = new Error('Missing required input: provide `messages` (recommended) or `contents` for Gemini.');
          e.code = 'BAD_REQUEST';
          throw e;
        }
      }
    },
    run: async ({ body, provider }) => {
      const model = body.model;
      const config = { ...(body.config || {}), responseMimeType: 'application/json' };
      const contents = body.contents || (Array.isArray(body.messages) ? messagesToGeminiContents(body.messages) : []);

      if (provider === 'openai') return callOpenAI({ model, contents, config });
      if (provider === 'anthropic') return callAnthropic({ model, contents, config });

      const apiKey = getGoogleAiApiKey();
      if (!apiKey) throw new Error('Google AI API key is not configured. Set GOOGLE_AI_API_KEY in Vercel environment variables.');
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });
      return ai.models.generateContent({ model: model || 'gemini-2.5-pro', contents, config });
    },
    normalize: (result) => {
      const text = extractText(result);
      let json: any = {};
      try { json = JSON.parse(text); } catch { json = { rawText: text }; }
      return { json, raw: result };
    },
  });
}
