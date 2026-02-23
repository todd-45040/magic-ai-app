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

function clampInt(v: any, def: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function stripCodeFences(s: string): string {
  const t = (s || '').trim();
  if (!t) return '';
  // ```json ... ``` or ``` ... ```
  const m = t.match(/^```[a-zA-Z0-9_-]*\s*([\s\S]*?)\s*```\s*$/);
  return m?.[1]?.trim() || t;
}

type EffectJson = {
  name: string;
  premise: string;
  experience: string;
  method_overview: string;
  performance_notes: string;
  secret_hint: string;
};

type EffectEnginePayload = { effects: EffectJson[] };

function isNonEmptyString(x: any): x is string {
  return typeof x === 'string' && x.trim().length > 0;
}

function validateEffectEngineJson(payload: any): { ok: true; data: EffectEnginePayload } | { ok: false; reason: string } {
  if (!payload || typeof payload !== 'object') return { ok: false, reason: 'payload_not_object' };
  const effects = (payload as any).effects;
  if (!Array.isArray(effects)) return { ok: false, reason: 'effects_not_array' };
  if (effects.length !== 4) return { ok: false, reason: 'effects_not_4' };

  const min = {
    name: 3,
    premise: 40,
    experience: 140,
    method_overview: 90,
    performance_notes: 90,
    secret_hint: 50,
  };

  for (let i = 0; i < effects.length; i++) {
    const e = effects[i];
    if (!e || typeof e !== 'object') return { ok: false, reason: `effect_${i}_not_object` };
    const fields: (keyof EffectJson)[] = ['name', 'premise', 'experience', 'method_overview', 'performance_notes', 'secret_hint'];
    for (const f of fields) {
      const val = (e as any)[f];
      if (!isNonEmptyString(val)) return { ok: false, reason: `effect_${i}_${String(f)}_missing` };
      if (val.trim().length < (min as any)[f]) return { ok: false, reason: `effect_${i}_${String(f)}_too_short` };
    }
  }

  return { ok: true, data: { effects: effects as EffectJson[] } };
}

function effectEngineJsonToMarkdown(data: EffectEnginePayload): string {
  const blocks = data.effects.map((e, idx) => {
    const n = idx + 1;
    return (
      `### ${n}. ${e.name.trim()}\n\n` +
      `**Premise:** ${e.premise.trim()}\n\n` +
      `**The Experience:** ${e.experience.trim()}\n\n` +
      `**Method Overview:** ${e.method_overview.trim()}\n\n` +
      `**Performance Notes:** ${e.performance_notes.trim()}\n\n` +
      `**The Secret Hint:** ${e.secret_hint.trim()}`
    );
  });
  return blocks.join('\n\n***\n\n');
}

function buildEffectEngineJsonPrompt(items: string[]): string {
  const itemLine = items.length ? items.join(', ') : 'the provided items';
  return (
    `Return ONLY valid JSON. No markdown, no prose, no commentary.\n` +
    `Schema (MUST match exactly):\n` +
    `{"effects":[{"name":"...","premise":"...","experience":"...","method_overview":"...","performance_notes":"...","secret_hint":"..."}, ... (exactly 4 total)]}\n\n` +
    `Create EXACTLY 4 professional, performance-ready magic effects using: ${itemLine}.\n\n` +
    `Field requirements:\n` +
    `- name: short, punchy title\n` +
    `- premise: emotional hook + why these props belong together\n` +
    `- experience: audience-facing routine flow (8–14 sentences)\n` +
    `- method_overview: high-level method category + structure (NO step-by-step exposure)\n` +
    `- performance_notes: angles, timing, volunteer handling, reset, outs/contingency\n` +
    `- secret_hint: concise non-exposure hint + convincer framing\n\n` +
    `Rules:\n` +
    `- Output MUST be strict JSON (double quotes, no trailing commas).\n` +
    `- effects array MUST have exactly 4 objects.\n`
  );
}

function buildEffectEngineRetryPrompt(items: string[], reason: string, lastText: string): string {
  const base = buildEffectEngineJsonPrompt(items);
  return (
    base +
    `\nYour previous output was invalid (${reason}). Fix it.\n` +
    `Return ONLY corrected JSON that validates.\n` +
    `Previous output (for reference, do NOT repeat as-is):\n` +
    `${lastText}`
  );
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

    // Effect Engine detection: keep it conservative so other /api/generate callers
    // aren't forced into JSON mode.
    const sys = String((config || {})?.systemInstruction || '');
    const isEffectEngine =
      /Effect Engine/i.test(sys) ||
      /Combine everyday objects/i.test(sys) ||
      /The Secret Hint/i.test(sys) ||
      /Effect Name/i.test(sys) ||
      // UI may not send a system prompt; in that case, detect by 1–4 item pattern
      (Array.isArray(contents) && extractItemsFromContents(contents).length >= 2);

    // Speed guardrails for Effect Engine (helps avoid timeouts on default configs)
    // - keep outputs bounded
    // - default to a fast Gemini model when caller didn't specify
    const effectMax = clampInt(process.env.EFFECT_ENGINE_MAX_TOKENS, 9000, 1200, 12000);
    const defaultMax = 900;
    const boundedConfig = {
      ...(config || {}),
      // If not specified, keep the output size sane.
      // Effect Engine uses a larger default (JSON contract is validated + retried).
      maxOutputTokens:
        typeof (config || {})?.maxOutputTokens === 'number'
          ? (config || {}).maxOutputTokens
          : (isEffectEngine ? effectMax : defaultMax),
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
          'Google API key is not configured. Set GOOGLE_API_KEY (preferred) or API_KEY in Vercel environment variables.'
        );
      }

      // Dynamic import to avoid hard crashes at module init time.
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });

      // If no model was provided, default Effect Engine to a faster model.
      // This dramatically reduces timeouts while keeping quality acceptable for brainstorming.
      const defaultFast = process.env.GEMINI_EFFECT_MODEL || process.env.GEMINI_FAST_MODEL || 'gemini-2.5-flash-lite';
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

    // Effect Engine "never cut off" path: strict JSON contract + validation + single retry.
    // We still render to markdown for the UI, but include the structured JSON for later reuse.
    if (isEffectEngine && provider !== 'openai' && provider !== 'anthropic') {
      const items = extractItemsFromContents(contents);
      const effectModel = process.env.GEMINI_EFFECT_MODEL || 'gemini-2.5-flash';
      const prompt = buildEffectEngineJsonPrompt(items);
      const jsonContents = [{ role: 'user', parts: [{ text: prompt }] }];

      const attemptOnce = async (retry?: { reason: string; lastText: string }) => {
        const prompt2 = retry ? buildEffectEngineRetryPrompt(items, retry.reason, retry.lastText) : prompt;
        const jsonContents2 = [{ role: 'user', parts: [{ text: prompt2 }] }];
        const r = await run({ providerModel: effectModel, hardTimeoutMs: DEFAULT_TIMEOUT_MS, contentsOverride: jsonContents2 });
        const txt = stripCodeFences(extractText(r));
        let parsed: any = null;
        try {
          parsed = JSON.parse(txt);
        } catch {
          return { ok: false as const, reason: 'json_parse_failed', text: txt };
        }
        const v = validateEffectEngineJson(parsed);
        if (!v.ok) return { ok: false as const, reason: v.reason, text: txt };
        return { ok: true as const, data: v.data, rawText: txt };
      };

      // Primary + single retry
      const a1 = await attemptOnce();
      if (!a1.ok) {
        const a2 = await attemptOnce({ reason: a1.reason, lastText: a1.text });
        if (!a2.ok) {
          // As a last resort, return whatever we got so the UI isn't blank.
          // (But we still keep it short to avoid truncation.)
          result = { text: (a2.text || a1.text || '').trim() };
        } else {
          result = {
            text: effectEngineJsonToMarkdown(a2.data),
            effect_engine_json: a2.data,
          };
        }
      } else {
        result = {
          text: effectEngineJsonToMarkdown(a1.data),
          effect_engine_json: a1.data,
        };
      }
    } else {
      // Primary attempt (non Effect Engine or non-Gemini providers)
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
                : (process.env.GEMINI_EFFECT_MODEL || process.env.GEMINI_FAST_MODEL || 'gemini-2.5-flash-lite');

          result = await run({ providerModel: retryFastModel, hardTimeoutMs: 22_000 });
        } else {
          throw e;
        }
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
      if (!isEffectEngine && provider !== 'openai' && provider !== 'anthropic') {
        const n = firstText ? countHeadings(firstText) : 0;
        if (firstText && n > 0 && n < 3 && Array.isArray(contents)) {
          const continuation = [
            ...contents,
            { role: 'model', parts: [{ text: firstText }] },
            {
              role: 'user',
              parts: [
                {
                  text:
                    'Continue from where you left off. Provide the remaining effect concepts (2 and 3). ' +
                    'Do not repeat #1. Keep the same format and include full details.',
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

          const retryFastModel = process.env.GEMINI_EFFECT_MODEL || process.env.GEMINI_FAST_MODEL || 'gemini-2.5-flash-lite';
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
