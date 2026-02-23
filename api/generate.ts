// NOTE:
// Vercel serverless functions run as ESM. In ESM, relative imports must include
// the file extension (e.g. './lib/usage.js') or Node will throw ERR_MODULE_NOT_FOUND
// even when the file exists.
//
// Also: keep provider SDK imports *inside* the handler via dynamic import.
// This avoids "FUNCTION_INVOCATION_FAILED" when a module has ESM/CJS quirks.

import { enforceAiUsage } from '../server/usage.js';
import { resolveProvider, callOpenAI, callAnthropic } from '../lib/server/providers/index.js';

type EffectJson = {
  name: string;
  premise: string;
  experience: string;
  method_overview: string;
  performance_notes: string;
  secret_hint: string;
};

type EffectEnginePayload = {
  effects: EffectJson[];
};

// Effect Engine generations are intentionally heavy (deep JSON contract).
// Timeout must be tunable via env and long enough for "Deep Mode".
// NOTE: Keep this below Vercel function maxDuration (see vercel.json).
const DEFAULT_TIMEOUT_MS = (() => {
  const v = Number(process.env.EFFECT_ENGINE_TIMEOUT_MS);
  // sensible bounds: 10s–85s
  if (Number.isFinite(v) && v >= 10_000 && v <= 85_000) return Math.floor(v);
  return 75_000;
})();

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function getEffectEngineMaxTokens(configMaybe: any): number {
  const env = Number(process.env.EFFECT_ENGINE_MAX_TOKENS);
  const envVal = Number.isFinite(env) ? env : 9000;
  const cfgVal = typeof configMaybe?.maxOutputTokens === 'number' ? configMaybe.maxOutputTokens : envVal;
  return clampInt(cfgVal, 600, 12_000);
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
  if (typeof result?.text === 'string' && result.text.trim()) return result.text.trim();

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

function stripCodeFences(s: string): string {
  const t = (s || '').trim();
  if (!t) return '';
  // ```json ... ```
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```\s*$/i);
  if (m?.[1]) return m[1].trim();
  return t;
}

function safeJsonParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function isNonEmptyStr(v: any, minLen: number): v is string {
  return typeof v === 'string' && v.trim().length >= minLen;
}

function validateDeepEffectEngineJson(payload: any): payload is EffectEnginePayload {
  if (!payload || typeof payload !== 'object') return false;
  if (!Array.isArray(payload.effects) || payload.effects.length !== 4) return false;

  return payload.effects.every((e: any) =>
    e &&
    isNonEmptyStr(e.name, 3) &&
    isNonEmptyStr(e.premise, 40) &&
    isNonEmptyStr(e.experience, 140) &&
    isNonEmptyStr(e.method_overview, 90) &&
    isNonEmptyStr(e.performance_notes, 90) &&
    isNonEmptyStr(e.secret_hint, 50)
  );
}

function renderEffectsToMarkdown(payload: EffectEnginePayload): string {
  const blocks = payload.effects.map((e, i) => {
    const n = i + 1;
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

function extractItemsFromContents(contents: any): string[] {
  try {
    const arr = Array.isArray(contents) ? contents : [];
    for (let i = arr.length - 1; i >= 0; i--) {
      const msg = arr[i];
      if (msg?.role !== 'user') continue;
      const text = msg?.parts?.map((p: any) => p?.text).filter(Boolean).join('') || '';

      const m1 = text.match(/items:\s*([^\.\n]+)\.?/i);
      if (m1?.[1]) {
        return m1[1]
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean)
          .slice(0, 4);
      }

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

function buildDeepEffectEngineJsonPrompt(items: string[]): string {
  const itemLine = items.length ? items.join(', ') : 'the provided items';

  // IMPORTANT: we do not want step-by-step exposure. Keep methods high-level.
  return (
    `Return ONLY valid JSON. No markdown. No commentary.\n` +
    `You are a world-class magic inventor and director.\n\n` +
    `Create EXACTLY 4 distinct magic effect concepts using: ${itemLine}.\n\n` +
    `JSON schema (must match exactly):\n` +
    `{\n` +
    `  "effects": [\n` +
    `    {\n` +
    `      "name": "",\n` +
    `      "premise": "",\n` +
    `      "experience": "",\n` +
    `      "method_overview": "",\n` +
    `      "performance_notes": "",\n` +
    `      "secret_hint": ""\n` +
    `    }\n` +
    `  ]\n` +
    `}\n\n` +
    `Field requirements:\n` +
    `- name: short, punchy title\n` +
    `- premise: emotional hook + why these props belong together (2–4 sentences)\n` +
    `- experience: audience-facing, step-by-step performance flow (8–14 sentences)\n` +
    `- method_overview: high-level method category + structure; NO step-by-step exposure\n` +
    `- performance_notes: angles, reset, timing, volunteer handling, outs/contingencies\n` +
    `- secret_hint: concise non-exposure hint + convincer framing\n\n` +
    `Hard rules:\n` +
    `- EXACTLY 4 effects in the array.\n` +
    `- No extra keys.\n` +
    `- No markdown fences.\n` +
    `- Keep methods non-exposure.\n`
  );
}

export default async function handler(request: any, response: any) {
  try {
    if (request.method !== 'POST') {
      return response.status(405).json({ error: 'Method not allowed' });
    }

    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return response.status(401).json({ error: 'Unauthorized. Please log in.' });
    }

    // Meter + log (Effect Engine)
    const usage = await enforceAiUsage(request, 1, { tool: 'effect_engine' });
    if (!usage.ok) {
      return response.status(usage.status || 429).json({
        error: usage.error || 'AI usage limit reached.',
        remaining: usage.remaining,
        limit: usage.limit,
        burstRemaining: usage.burstRemaining,
        burstLimit: usage.burstLimit,
      });
    }

    const provider = resolveProvider(request);
    const { model, contents, config } = request.body || {};

    const maxOutputTokens = getEffectEngineMaxTokens(config);

    const boundedConfig = {
      ...(config || {}),
      maxOutputTokens,
    };

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
        throw new Error('Missing GEMINI_API_KEY (preferred) or GOOGLE_API_KEY (fallback) in Vercel environment variables.');
      }

      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });

      const defaultModel = process.env.GEMINI_EFFECT_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
      const chosenModel = override?.providerModel || model || defaultModel;

      return await withTimeout(
        ai.models.generateContent({
          model: chosenModel,
          contents: override?.contentsOverride ?? contents,
          config: { ...boundedConfig },
        }),
        hardTimeout
      );
    };

    // --- Never-cut-off path: Deep JSON contract + validate + retry once ---
    const items = extractItemsFromContents(contents);
    const jsonPrompt = buildDeepEffectEngineJsonPrompt(items);
    const jsonContents = [{ role: 'user', parts: [{ text: jsonPrompt }] }];

    const attemptOnce = async (extra?: { strengthen?: boolean; lastText?: string }) => {
      const strengthened = extra?.strengthen
        ? jsonPrompt + `\n\nYour last response was invalid or incomplete. Return ONLY valid JSON that matches the schema exactly.`
        : jsonPrompt;

      const contentsOverride = [{ role: 'user', parts: [{ text: strengthened }] }];
      const result = await run({ contentsOverride, hardTimeoutMs: DEFAULT_TIMEOUT_MS });
      const raw = extractText(result);
      const parsed = safeJsonParse<EffectEnginePayload>(stripCodeFences(raw));
      return { result, raw, parsed };
    };

    let finalResult: any;
    let payload: EffectEnginePayload | null = null;

    const first = await attemptOnce();
    if (first.parsed && validateDeepEffectEngineJson(first.parsed)) {
      payload = first.parsed;
      finalResult = first.result;
    } else {
      const second = await attemptOnce({ strengthen: true, lastText: first.raw });
      if (second.parsed && validateDeepEffectEngineJson(second.parsed)) {
        payload = second.parsed;
        finalResult = second.result;
      } else {
        // Last resort: return the raw text (still useful for debugging)
        finalResult = first.result;
      }
    }

    if (payload) {
      const markdown = renderEffectsToMarkdown(payload);
      finalResult = {
        ...(finalResult || {}),
        text: markdown,
        effect_engine_json: payload,
      };
    } else {
      // Ensure text exists for clients
      const t = extractText(finalResult);
      if (t) finalResult = { ...(finalResult || {}), text: t };
    }

    // Return usage headers for the Usage Meter UI (best-effort)
    response.setHeader('X-AI-Remaining', String(usage.remaining ?? ''));
    response.setHeader('X-AI-Limit', String(usage.limit ?? ''));
    response.setHeader('X-AI-Membership', String(usage.membership ?? ''));
    response.setHeader('X-AI-Burst-Remaining', String(usage.burstRemaining ?? ''));
    response.setHeader('X-AI-Burst-Limit', String(usage.burstLimit ?? ''));
    response.setHeader('X-AI-Provider-Used', provider);

    return response.status(200).json(finalResult);
  } catch (error: any) {
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
