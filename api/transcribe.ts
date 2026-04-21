import { markLegacyRoute } from './_lib/legacyRoute.js';
import { GoogleGenAI } from '@google/genai';
import { enforceAiUsage } from '../server/usage.js';
import { getGoogleAiApiKey } from '../server/gemini.js';

type Body = {
  audioBase64?: string;
  mimeType?: string;
  prompt?: string;
};

const DEFAULT_TIMEOUT_MS = 45_000;

function getApiKey(): string | undefined {
  return getGoogleAiApiKey() || undefined;
}

function getModel(): string {
  // NOTE: "gemini-1.5-flash" is returning NOT_FOUND for many projects on v1beta.
  // Use a modern multimodal model that supports audio inputs.
  return process.env.GEMINI_TRANSCRIBE_MODEL || 'gemini-2.0-flash';
}

function friendlyTransientMessage(): string {
  return 'AI temporarily unavailable. Please try again in a moment.';
}

function buildUsageErrorResponse(usage: Awaited<ReturnType<typeof enforceAiUsage>>) {
  return {
    error: usage.error || 'AI usage limit reached.',
    remaining: usage.remaining,
    limit: usage.limit,
    burstRemaining: usage.burstRemaining,
    burstLimit: usage.burstLimit,
  };
}

function applyUsageHeaders(res: any, usage: Awaited<ReturnType<typeof enforceAiUsage>>) {
  res.setHeader('X-AI-Remaining', String(usage.remaining ?? ''));
  res.setHeader('X-AI-Limit', String(usage.limit ?? ''));
  res.setHeader('X-AI-Membership', String(usage.membership ?? ''));
  res.setHeader('X-AI-Burst-Remaining', String(usage.burstRemaining ?? ''));
  res.setHeader('X-AI-Burst-Limit', String(usage.burstLimit ?? ''));
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: any;
  const timeout = new Promise<never>((_, reject) => {
    t = setTimeout(() => reject(new Error(`TIMEOUT_${ms}MS`)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(t);
  }
}

async function generateWithFallback(
  ai: GoogleGenAI,
  models: string[],
  args: any,
) {
  let lastErr: any = null;
  for (const model of models) {
    try {
      return await withTimeout(ai.models.generateContent({ ...args, model }), DEFAULT_TIMEOUT_MS);
    } catch (err: any) {
      lastErr = err;
      const msg = String(err?.message || '');
      // Only fall back on model-not-found / not-supported errors.
      if (!/(NOT_FOUND|404|not found|not supported)/i.test(msg)) throw err;
    }
  }
  throw lastErr;
}

export default async function handler(req: any, res: any) {
  markLegacyRoute(res, '/api/ai/transcribe');
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.trim() === 'Bearer guest') {
    res.status(401).json({ error: 'Unauthorized. Please log in.' });
    return;
  }

  const usage = await enforceAiUsage(req, 1, { tool: 'live_rehearsal_audio' });
  if (!usage.ok) {
    return res.status(usage.status || 429).json(buildUsageErrorResponse(usage));
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
    const preferred = getModel();
    // Try preferred model first, then common modern fallbacks.
    const modelFallbacks = Array.from(
      new Set([preferred, 'gemini-2.5-flash', 'gemini-2.0-flash'])
    );

    const result = await generateWithFallback(ai, modelFallbacks, {
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
    applyUsageHeaders(res, usage);
    res.status(200).json({ transcript: text });
  } catch (err: any) {
    console.error('Transcribe error:', err);
    if (String(err?.message || '').startsWith('TIMEOUT_')) {
      return res.status(504).json({ error: friendlyTransientMessage() });
    }
    return res.status(500).json({ error: friendlyTransientMessage() });
  }
}
