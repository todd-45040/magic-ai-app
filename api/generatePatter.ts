import { enforceAiUsage } from '../server/usage.js';
import { getGoogleAiApiKey } from '../server/gemini.js';

const DEFAULT_TIMEOUT_MS = 20_000;

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

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized. Please log in.' });
    }

    // Meter + log (patter engine)
    const usage = await enforceAiUsage(req, 1, { tool: 'patter_engine' });
    if (!usage.ok) {
      return res.status(usage.status || 429).json({
        error: usage.error || 'AI usage limit reached.',
        remaining: usage.remaining,
        limit: usage.limit,
        burstRemaining: usage.burstRemaining,
        burstLimit: usage.burstLimit,
      });
    }

    const apiKey = getGoogleAiApiKey();
    if (!apiKey) {
      return res.status(500).json({
        error: "Missing GOOGLE_AI_API_KEY in server environment",
      });
    }

    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey });

    const body = req.body || {};
    const prompt = body.prompt || "Hello";

    const finalResult = await withTimeout(
      ai.models.generateContent({
        model: process.env.AI_MODEL || "gemini-2.0-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      }),
      DEFAULT_TIMEOUT_MS
    );

    // Best-effort headers for UI meters
    res.setHeader('X-AI-Remaining', String(usage.remaining ?? ''));
    res.setHeader('X-AI-Limit', String(usage.limit ?? ''));
    res.setHeader('X-AI-Membership', String(usage.membership ?? ''));
    res.setHeader('X-AI-Burst-Remaining', String(usage.burstRemaining ?? ''));
    res.setHeader('X-AI-Burst-Limit', String(usage.burstLimit ?? ''));

    return res.status(200).json(finalResult);
  } catch (err: any) {
    console.error("generatePatter error:", err);
    if (String(err?.message || '').startsWith('TIMEOUT_')) {
      return res.status(504).json({ error: 'Request timed out. Please try again.' });
    }
    return res.status(500).json({
      error: err?.message || "Internal server error",
    });
  }
}
