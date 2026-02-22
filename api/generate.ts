// NOTE:
// Vercel serverless functions run as ESM. In ESM, relative imports must include
// the file extension (e.g. './lib/usage.js') or Node will throw ERR_MODULE_NOT_FOUND
// even when the file exists.
//
// Also: keep provider SDK imports *inside* the handler via dynamic import.
// This avoids "FUNCTION_INVOCATION_FAILED" when a module has ESM/CJS quirks.

import { enforceAiUsage } from '../server/usage.js';
import { resolveProvider, callOpenAI, callAnthropic } from '../lib/server/providers/index.js';

// Effect Engine is inherently "idea generation" and can occasionally run long on slower models.
// We keep an app-level timeout (to avoid platform-level 504s), but allow it to be tuned via env.
// NOTE: Vercel maxDuration is configured separately in vercel.json.
const DEFAULT_TIMEOUT_MS = (() => {
  const v = Number(process.env.EFFECT_ENGINE_TIMEOUT_MS);
  // sensible bounds: 10s–55s
  if (Number.isFinite(v) && v >= 10_000 && v <= 55_000) return Math.floor(v);
  return 40_000;
})();


const DEFAULT_MAX_TOKENS = (() => {
  const raw = Number(process.env.EFFECT_ENGINE_MAX_TOKENS);
  // sensible bounds: 600–3000
  if (Number.isFinite(raw) && raw >= 600 && raw <= 3000) return Math.floor(raw);
  return 2200;
})();

function clampMaxTokens(v: any): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return DEFAULT_MAX_TOKENS;
  if (n < 200) return 200;
  if (n > 3000) return 3000;
  return Math.floor(n);
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

function extractText(result: any): string {
  if (typeof result?.text === 'string' && result.text.trim()) return result.text;

  const parts = result?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    const joined = parts
      .map((p: any) => p?.text)
      .filter((t: any) => typeof t === 'string')
      .join('')
      .trim();
    if (joined) return joined;
  }

  const maybe =
    result?.output_text ||
    result?.content ||
    result?.message?.content ||
    result?.choices?.[0]?.message?.content;
  if (typeof maybe === 'string' && maybe.trim()) return maybe.trim();

  return '';
}

function countHeadings(text: string): number {
  const m = text.match(/\n\s*#{2,6}\s*\d+\./g);
  return m ? m.length : 0;
}

function looksLikeTruncatedTeaser(text: string): boolean {
  const t = (text || '').trim();
  if (!t) return true;
  // Very short responses or those that end immediately after a divider are almost always incomplete.
  if (t.length < 140) return true;
  if (/\n\s*\*\*\*\s*$/.test(t)) return true;
  if (/^here are\s+\w+.*\*\*\*\s*$/i.test(t)) return true;
  return false;
}

function extractItemsFromContents(contents: any): string[] {
  try {
    const arr = Array.isArray(contents) ? contents : [];
    // Find the last user text part
    for (let i = arr.length - 1; i >= 0; i--) {
      const msg = arr[i];
      if (msg?.role !== 'user') continue;
      const text = msg?.parts?.map((p: any) => p?.text).filter(Boolean).join('') || '';

      // Common pattern in EffectGenerator.ts
      const m1 = text.match(/items:\s*([^\.\n]+)\.?/i);
      if (m1?.[1]) {
        return m1[1]
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean)
          .slice(0, 4);
      }

      // Fallback: take everything after "following items:".
      const m2 = text.match(/following items:\s*([^\.\n]+)\.?/i);
      if (m2?.[1]) {
        return m2[1]
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean)
          .slice(0, 4);
      }
    }
  } catch {
    // ignore
  }
  return [];
}


export default async function handler(request: any, response: any) {
  // IMPORTANT:
  // Vercel will sometimes return a plain-text 500 "FUNCTION_INVOCATION_FAILED"
  // when an exception occurs outside our try/catch. That makes the UI show the
  // unhelpful message "Request failed (500)". To avoid that, keep *all* logic
  // inside a single try/catch and always return JSON.
  try {
    if (request.method !== 'POST') {
      return response.status(405).json({ error: 'Method not allowed' });
    }

    // Basic Auth Check (Simulated)
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return response.status(401).json({ error: 'Unauthorized. Please log in.' });
    }

    // AI cost protection (daily caps + per-minute burst limits)
    // IMPORTANT: /generate powers the Effect Engine. It must be metered + logged.
    const usage = await enforceAiUsage(request, 1, { tool: 'effect_engine' });
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
    const { model, contents, config } = request.body || {};

    // Speed guardrails for Effect Engine (helps avoid timeouts on default configs)
    // - keep outputs bounded
    // - default to a fast Gemini model when caller didn't specify
    const boundedConfig = {
      ...(config || {}),
      // If not specified, keep the output size sane.
      maxOutputTokens: clampMaxTokens((config || {})?.maxOutputTokens),
    };

    let result: any;

    const run = async (override?: { providerModel?: string; hardTimeoutMs?: number; contentsOverride?: any }) => {
      const hardTimeout = override?.hardTimeoutMs ?? DEFAULT_TIMEOUT_MS;

      if (provider === 'openai') {
        return await withTimeout(
          callOpenAI({ model: override?.providerModel || model, contents: override?.contentsOverride ?? contents, config: boundedConfig }),
          hardTimeout
        );
      }

      if (provider === 'anthropic') {
        return await withTimeout(
          callAnthropic({ model: override?.providerModel || model, contents: override?.contentsOverride ?? contents, config: boundedConfig }),
          hardTimeout
        );
      }

      const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.API_KEY;
      if (!apiKey) {
        // This is an infra misconfig (not a user error)
        throw new Error(
          'Google API key is not configured. Set GEMINI_API_KEY (preferred), or GOOGLE_API_KEY, or legacy API_KEY in Vercel environment variables.'
        );
      }

      // Dynamic import to avoid hard crashes at module init time.
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });

      // If no model was provided, default Effect Engine to a faster model.
      // This dramatically reduces timeouts while keeping quality acceptable for brainstorming.
      const defaultFast = process.env.GEMINI_EFFECT_MODEL || 'gemini-1.5-flash';
      const chosenModel = override?.providerModel || model || defaultFast;

      return await withTimeout(
        ai.models.generateContent({
          model: chosenModel,
          contents: override?.contentsOverride ?? contents,
          config: {
            ...boundedConfig,
          },
        }),
        hardTimeout
      );
    };

    // Primary attempt
    try {
      result = await run();
    } catch (e: any) {
      // One fast retry on timeout only. This keeps UX smooth without hammering providers.
      // If the first attempt used a slower model, retry with a fast model + tighter cap.
      if (String(e?.message || '').startsWith('TIMEOUT_')) {
        const retryFastModel =
          provider === 'openai'
            ? (process.env.OPENAI_EFFECT_MODEL || 'gpt-4o-mini')
            : provider === 'anthropic'
              ? (process.env.ANTHROPIC_EFFECT_MODEL || 'claude-3-5-haiku-20241022')
              : (process.env.GEMINI_EFFECT_MODEL || 'gemini-1.5-flash');

        result = await run({ providerModel: retryFastModel, hardTimeoutMs: 22_000 });
      } else {
        throw e;
      }
    }

    
    // Some Gemini responses can arrive "half-finished" (model stops early).
    // If we detect fewer than 3 numbered sections, do a single quick continuation
    // and append the remainder. Best-effort only.
    try {
      const firstText = extractText(result);

      // Ensure `text` exists for clients that prefer the simple extraction path.
      if (firstText) result = { ...(result || {}), text: firstText };

      // Only attempt continuation for Gemini-style message arrays.
      if (provider !== 'openai' && provider !== 'anthropic') {
        const n = firstText ? countHeadings(firstText) : 0;
        if (firstText && n > 0 && n < 4 && Array.isArray(contents)) {
          const continuation = [
            ...contents,
            { role: 'model', parts: [{ text: firstText }] },
            {
              role: 'user',
              parts: [
                {
                  text:
                    `Continue from where you left off. Provide ONLY the remaining effect concepts (#${n + 1} through #4). ` +
                    `Do NOT repeat any earlier effects. Keep the same Markdown format and include full details for each remaining effect.`,
                },
              ],
            },
          ];

          const continued = await run({ hardTimeoutMs: 15_000, contentsOverride: continuation });
          const moreText = extractText(continued);

          if (moreText) {
            const finalText = (firstText + '\n\n' + moreText).trim();
            result = { ...(result || {}), text: finalText };
          }
        }

        // Fallback: sometimes the model returns only an intro line (no headings at all).
        // In that case, do a single strict retry that forces complete, formatted output.
        if (firstText && n === 0 && looksLikeTruncatedTeaser(firstText)) {
          const items = extractItemsFromContents(contents);
          const itemLine = items.length ? items.join(', ') : 'the provided items';
          const strictPrompt =
            `You MUST return a complete set of magic effect ideas now (do not stop after an intro).\n` +
            `Create EXACTLY 4 effects using: ${itemLine}.\n\n` +
            `For each effect, include these headings in Markdown:\n` +
            `### <number>. <Effect Name>\n` +
            `**The Experience:** (2–4 sentences)\n` +
            `**The Secret Hint:** (high-level, no exposure)\n\n` +
            `No preamble, no closing text—only the 4 formatted effects.`;

          const retryFastModel = process.env.GEMINI_EFFECT_MODEL || 'gemini-1.5-flash';
          const strictContents = [{ role: 'user', parts: [{ text: strictPrompt }] }];
          const retried = await run({ providerModel: retryFastModel, hardTimeoutMs: 22_000, contentsOverride: strictContents });
          const retryText = extractText(retried);
          if (retryText && retryText.trim().length > firstText.trim().length) {
            result = { ...(retried || {}), text: retryText.trim() };
          }
        }
      }
    } catch {
      // ignore (best-effort)
    }

// Return usage headers for the Usage Meter UI (best-effort)
    response.setHeader('X-AI-Remaining', String(usage.remaining ?? ''));
    response.setHeader('X-AI-Limit', String(usage.limit ?? ''));
    response.setHeader('X-AI-Membership', String(usage.membership ?? ''));
    response.setHeader('X-AI-Burst-Remaining', String(usage.burstRemaining ?? ''));
    response.setHeader('X-AI-Burst-Limit', String(usage.burstLimit ?? ''));
    response.setHeader('X-AI-Provider-Used', provider);

    return response.status(200).json(result);
  } catch (error: any) {
    // Ensure we always return JSON so the client can show a helpful message.
    console.error('AI Provider Error:', error);

    if (String(error?.message || '').startsWith('TIMEOUT_')) {
      return response.status(504).json({ error: 'Request timed out. Please try again.' });
    }

    if (error?.message?.includes('finishReason: SAFETY')) {
      return response.status(400).json({ error: 'The request was blocked by safety filters.' });
    }

    return response.status(500).json({
      error: error?.message || 'An internal error occurred while processing your request.',
    });
  }
}
