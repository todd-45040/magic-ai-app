// Image editing proxy endpoint.
//
// Important note:
// - True pixel-perfect "image editing" is provider-specific.
// - OpenAI supports edits natively via /v1/images/edits.
// - Gemini/Imagen (via @google/genai) does not expose a stable public "edit" method in this project,
//   so for the Gemini provider we implement a high-quality *reference-based* edit:
//   1) Caption the input image with Gemini (vision)
//   2) Generate a new image with Imagen using (caption + user instructions)

import { enforceAiUsage } from '../server/usage.ts';
import { resolveProvider } from '../lib/server/providers/index.js';

function extractGeminiText(result: any): string {
  if (typeof result?.text === 'string' && result.text.trim()) return result.text.trim();
  const parts = result?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    const joined = parts
      .map((p: any) => (typeof p?.text === 'string' ? p.text : ''))
      .filter(Boolean)
      .join('')
      .trim();
    if (joined) return joined;
  }
  return '';
}

export default async function handler(request: any, response: any) {
  try {
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

    const provider = resolveProvider(request);
    const { imageBase64, mimeType, prompt, aspectRatio = '1:1' } = request.body || {};

    if (!imageBase64 || !mimeType || !prompt) {
      return response.status(400).json({ error: 'Missing required fields: imageBase64, mimeType, prompt.' });
    }

    let result: any;

    if (provider === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) return response.status(500).json({ error: 'OPENAI_API_KEY is not configured.' });

      const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';

      // OpenAI image edits uses multipart/form-data
      const buf = Buffer.from(String(imageBase64), 'base64');
      const blob = new Blob([buf], { type: String(mimeType) });

      const form = new FormData();
      form.append('model', model);
      form.append('prompt', String(prompt));
      form.append('image', blob, 'input-image');
      form.append('size', '1024x1024');
      form.append('response_format', 'b64_json');

      const resp = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: form as any,
      });

      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const msg = json?.error?.message || json?.message || `OpenAI image edit request failed (${resp.status})`;
        return response.status(500).json({ error: msg });
      }

      result = json; // geminiService supports data[0].b64_json
    } else if (provider === 'anthropic') {
      return response.status(400).json({ error: 'Image editing is not supported for Anthropic provider.' });
    } else {
      const apiKey = process.env.GOOGLE_API_KEY || process.env.API_KEY;
      if (!apiKey) {
        return response.status(500).json({
          error:
            'Google API key is not configured. Set GOOGLE_API_KEY (preferred) or API_KEY in Vercel environment variables.',
        });
      }

      // Dynamic import to avoid module-init crashes in Vercel
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });

      // 1) Caption the input image (vision)
      const captionRes = await ai.models.generateContent({
        model: process.env.GEMINI_VISION_MODEL || 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text:
                  'Describe the image in rich visual detail for use as an image-generation reference. ' +
                  'Focus on objects, materials, colors, lighting, camera angle, background, and style. ' +
                  'Do not include copyrighted character names.',
              },
              {
                inlineData: {
                  mimeType: String(mimeType),
                  data: String(imageBase64),
                },
              },
            ],
          },
        ],
      });

      const caption = extractGeminiText(captionRes) || 'A detailed reference image.';

      // 2) Generate a new image guided by the caption + user's edit instructions
      const combinedPrompt = [
        'REFERENCE IMAGE (describe what to preserve):',
        caption,
        '',
        'EDIT INSTRUCTIONS (apply these changes):',
        String(prompt),
        '',
        'Output: one high-quality image. Keep composition similar unless instructed otherwise.',
      ].join('\n');

      result = await ai.models.generateImages({
        model: 'imagen-4.0-generate-preview-06-06',
        prompt: combinedPrompt,
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
    console.error('Image Edit Provider Error:', error);
    return response.status(500).json({
      error: error?.message || 'Failed to edit image. Please try again.',
    });
  }
}
