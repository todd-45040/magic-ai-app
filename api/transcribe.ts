import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

type Body = {
  audioBase64?: string;
  mimeType?: string;
  prompt?: string;
};

function getApiKey(): string | undefined {
  // Prefer a server-only env var if you add one later.
  return (
    process.env.GEMINI_API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    process.env.VITE_GEMINI_LIVE_API_KEY
  );
}

function getModel(): string {
  return process.env.GEMINI_TRANSCRIBE_MODEL || 'gemini-1.5-flash';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    res.status(500).json({ error: 'Missing Gemini API key (server)' });
    return;
  }

  const body = (req.body || {}) as Body;
  const audioBase64 = body.audioBase64;
  const mimeType = body.mimeType || 'audio/wav';
  if (!audioBase64) {
    res.status(400).json({ error: 'Missing audioBase64' });
    return;
  }

  const prompt =
    body.prompt ||
    'Transcribe the spoken words in this audio. Return ONLY the transcript text. Do not add commentary.';

  try {
    const ai = new GoogleGenAI({ apiKey });
    const model = getModel();

    const result = await ai.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType,
                data: audioBase64,
              },
            },
          ],
        },
      ],
    });

    const text = (result.text || '').trim();
    res.status(200).json({ transcript: text });
  } catch (err: any) {
    console.error('Transcribe error:', err);
    res.status(500).json({ error: err?.message || 'Transcribe failed' });
  }
}
