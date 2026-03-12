import { getGoogleAiApiKey } from '../../server/gemini.js';
import { handleAiRequest } from '../../server/ai/handleAiRequest.js';

function parseDataUrl(input: string): { mimeType: string; data: string } | null {
  const m = /^data:([^;]+);base64,(.+)$/i.exec(input.trim());
  if (!m) return null;
  return { mimeType: m[1], data: m[2] };
}

function estimateBytesFromBase64(base64: string): number {
  const len = base64.length;
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((len * 3) / 4) - padding);
}

export default async function handler(req: any, res: any) {
  return handleAiRequest(req, res, {
    tool: 'identify_trick',
    endpoint: '/api/ai/identify',
    costTier: 'medium',
    validate: ({ body }) => {
      const raw = String(body.imageBase64 || '').trim();
      if (!raw) {
        const e: any = new Error('Missing imageBase64');
        e.code = 'BAD_REQUEST';
        throw e;
      }
      const parsed = /^data:[^;]+;base64,/.test(raw) ? parseDataUrl(raw) : { mimeType: String(body.mimeType || 'image/jpeg'), data: raw };
      const bytes = estimateBytesFromBase64(parsed?.data || '');
      if (bytes > Number(process.env.IDENTIFY_MAX_BYTES || 2 * 1024 * 1024)) {
        const e: any = new Error('Image is too large. Please upload an image under 2 MB.');
        e.code = 'PAYLOAD_TOO_LARGE';
        throw e;
      }
    },
    run: async ({ body }) => {
      const raw = String(body.imageBase64 || '').trim();
      const parsed = /^data:[^;]+;base64,/.test(raw) ? parseDataUrl(raw) : { mimeType: String(body.mimeType || 'image/jpeg'), data: raw };
      const apiKey = getGoogleAiApiKey();
      if (!apiKey) throw new Error('Missing Gemini API key on server');
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });
      return ai.models.generateContent({
        model: String(body.model || process.env.GEMINI_VISION_MODEL || 'gemini-2.5-flash'),
        contents: [{ role: 'user', parts: [{ text: String(body.prompt || 'Identify the likely prop/effect in the image and suggest 3 possible routines or uses.') }, { inlineData: { mimeType: parsed?.mimeType || 'image/jpeg', data: parsed?.data || '' } }] }],
      });
    },
    normalize: (result: any) => ({ result: { text: typeof result?.text === 'string' ? result.text : result?.response?.text?.() || '' }, raw: result }),
  });
}
