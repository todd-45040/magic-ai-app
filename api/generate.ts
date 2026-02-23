// NOTE:
// Vercel serverless functions run as ESM. In ESM, relative imports must include
// the file extension (e.g. './lib/usage.js') or Node will throw ERR_MODULE_NOT_FOUND
// even when the file exists.
//
// Also: keep provider SDK imports *inside* the handler via dynamic import.
// This avoids "FUNCTION_INVOCATION_FAILED" when a module has ESM/CJS quirks.

import { enforceAiUsage } from '../server/usage.js';
import { resolveProvider, callOpenAI, callAnthropic } from '../lib/server/providers/index.js';

// Effect Engine can run long on slower models.
// Keep an app-level timeout (to avoid platform-level 504s), tunable via env.
const DEFAULT_TIMEOUT_MS = (() => {
  const v = Number(process.env.EFFECT_ENGINE_TIMEOUT_MS);
  // sensible bounds: 10s–55s
  if (Number.isFinite(v) && v >= 10_000 && v <= 55_000) return Math.floor(v);
  return 40_000;
})();

// Output token budget. We now prefer a strict JSON contract (smaller output),
// but we keep this tunable for safety.
const DEFAULT_EFFECT_MAX_TOKENS = (() => {
  const v = Number(process.env.EFFECT_ENGINE_MAX_TOKENS);
  // sensible bounds: 600–12000
  if (Number.isFinite(v) && v >= 600 && v <= 12_000) return Math.floor(v);
  return 5200;
})();

function clampMaxOutputTokens(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.floor(n) : DEFAULT_EFFECT_MAX_TOKENS;
  return Math.max(200, Math.min(12_000, v));
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

function stripCodeFences(s: string): string {
  return (s || '').replace(/^```[a-zA-Z]*\s*/g, '').replace(/\s*```\s*$/g, '').trim();
}

function extractFirstJsonObject(s: string): string {
  const t = stripCodeFences(s || '');
  const start = t.indexOf('{');
  if (start < 0) return '';

  // Scan forward to find a balanced JSON object.
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < t.length; i++) {
    const ch = t[i];

    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) {
        return t.slice(start, i + 1).trim();
      }
    }
  }

  // If we never balanced, return best-effort from the first {.
  return t.slice(start).trim();
}

type EffectJson = {
  effects: Array<{
    name: string;
    premise: string;
    experience: string;
    method_overview: string;
    performance_notes: string;
    secret_hint: string;
  }>;
};

function validateEffectJson(obj: any): obj is EffectJson {
  if (!obj || typeof obj !== 'object') return false;
  if (!Array.isArray(obj.effects) || obj.effects.length !== 4) return false;

  // Minimum lengths tuned for "deep, professional routine builder"
  const MIN_NAME = 3;
  const MIN_PREMISE = 40;
  const MIN_EXPERIENCE = 140; // should describe the full audience-facing sequence
  const MIN_METHOD = 90; // high-level method overview (no step-by-step exposure)
  const MIN_NOTES = 90; // staging, timing, angles, outs, audience management
  const MIN_HINT = 50; // method category + convincer framing

  for (const e of obj.effects) {
    if (!e || typeof e !== 'object') return false;

    const name = typeof e.name === 'string' ? e.name.trim() : '';
    const premise = typeof e.premise === 'string' ? e.premise.trim() : '';
    const experience = typeof e.experience === 'string' ? e.experience.trim() : '';
    const method_overview = typeof e.method_overview === 'string' ? e.method_overview.trim() : '';
    const performance_notes = typeof e.performance_notes === 'string' ? e.performance_notes.trim() : '';
    const secret_hint = typeof e.secret_hint === 'string' ? e.secret_hint.trim() : '';

    if (name.length < MIN_NAME) return false;
    if (premise.length < MIN_PREMISE) return false;
    if (experience.length < MIN_EXPERIENCE) return false;
    if (method_overview.length < MIN_METHOD) return false;
    if (performance_notes.length < MIN_NOTES) return false;
    if (secret_hint.length < MIN_HINT) return false;
  }

  return true;
}


function jsonToMarkdown(obj: EffectJson): string {
  return obj.effects
    .map((e, idx) => {
      const n = idx + 1;
      return [
        `### ${n}. ${String(e.name).trim()}`,
        '',
        `**Premise:** ${String(e.premise).trim()}`,
        '',
        `**The Experience:** ${String(e.experience).trim()}`,
        '',
        `**Method Overview:** ${String(e.method_overview).trim()}`,
        '',
        `**Performance Notes:** ${String(e.performance_notes).trim()}`,
        '',
        `**The Secret Hint:** ${String(e.secret_hint).trim()}`,
      ].join('\n');
    })
    .join('\n\n***\n\n');
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

function buildJsonContractPrompt(items: string[]): string {
  const itemLine = items.length ? items.join(', ') : 'the provided items';

  return (
    `Return ONLY valid JSON (no Markdown, no code fences, no commentary).
` +
    `You are a world-class magic inventor and director. Generate FOUR deep, professional, performance-ready routines using exactly these everyday items: ${itemLine}.

` +
    `JSON schema (must match exactly):
` +
    `{
` +
    `  "effects": [
` +
    `    {
` +
    `      "name": "...",
` +
    `      "premise": "...",
` +
    `      "experience": "...",
` +
    `      "method_overview": "...",
` +
    `      "performance_notes": "...",
` +
    `      "secret_hint": "..."
` +
    `    },
` +
    `    { ... },
` +
    `    { ... },
` +
    `    { ... }
` +
    `  ]
` +
    `}

` +
    `Rules (strict):
` +
    `- effects MUST be exactly 4 objects (no more, no less).
` +
    `- Each routine must feel distinct (different plot, structure, and climax).
` +
    `- premise: 1–2 sentences that frame the emotional hook + why these props belong together.
` +
    `- experience: audience-facing, step-by-step performance description (8–14 sentences), present tense. Include at least one strong spectator moment.
` +
    `- method_overview: high-level method category + structure (misdirection beats, gimmick category, switch/force/penetration/transport/etc.). NO step-by-step exposure.
` +
    `- performance_notes: staging, angles, timing, handling tips, volunteer management, reset/cleanup, and at least one “out” or contingency.
` +
    `- secret_hint: a concise, non-exposure hint that suggests the secret principle + a convincer (still high-level).
` +
    `- Use plain text strings. Do NOT include Markdown. Do NOT include extra keys.
`
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

    // Meter + log
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

    // Only the Effect Engine should use the strict JSON contract path.
    // Many other tools route through /api/generate for general chat.
    const systemInstruction = (config || {})?.systemInstruction;
    const isEffectEngineRequest =
      typeof systemInstruction === 'string' &&
      systemInstruction.includes('world-class magic inventor') &&
      systemInstruction.includes('Effect Name') &&
      systemInstruction.includes('Secret Hint');

    // Bound output size
    const boundedConfig = {
      ...(config || {}),
      maxOutputTokens: clampMaxOutputTokens((config || {})?.maxOutputTokens),
    };

    const run = async (override?: { providerModel?: string; hardTimeoutMs?: number; contentsOverride?: any }) => {
      const hardTimeout = override?.hardTimeoutMs ?? DEFAULT_TIMEOUT_MS;
      const useContents = override?.contentsOverride ?? contents;
      const useModel = override?.providerModel || model;

      if (provider === 'openai') {
        return await withTimeout(callOpenAI({ model: useModel, contents: useContents, config: boundedConfig }), hardTimeout);
      }

      if (provider === 'anthropic') {
        return await withTimeout(callAnthropic({ model: useModel, contents: useContents, config: boundedConfig }), hardTimeout);
      }

      const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.API_KEY;
      if (!apiKey) {
        throw new Error(
          'Google API key is not configured. Set GEMINI_API_KEY (preferred) or GOOGLE_API_KEY or API_KEY in Vercel environment variables.'
        );
      }

      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });

      // Gemini 1.5 aliases can return NOT_FOUND on v1beta; default to Gemini 2.5 family.
      const defaultFast = process.env.GEMINI_EFFECT_MODEL || process.env.GEMINI_FAST_MODEL || 'gemini-2.5-flash-lite';
      const chosenModel = useModel || defaultFast;

      return await withTimeout(
        ai.models.generateContent({
          model: chosenModel,
          contents: useContents,
          config: {
            ...boundedConfig,
          },
        }),
        hardTimeout
      );
    };

    let responsePayload: any;

    if (isEffectEngineRequest) {
      // ---- JSON-contract path (never cut off) ----
      const items = extractItemsFromContents(contents);
      const prompt = buildJsonContractPrompt(items);
      const contractContents = [{ role: 'user', parts: [{ text: prompt }] }];

      const parseAttempt = async (
        r: any
      ): Promise<{ ok: true; obj: EffectJson; raw: string } | { ok: false; raw: string }> => {
        const raw = extractText(r);
        const jsonStr = extractFirstJsonObject(raw);
        if (!jsonStr) return { ok: false, raw };
        try {
          const obj = JSON.parse(jsonStr);
          if (!validateEffectJson(obj)) return { ok: false, raw };
          return { ok: true, obj, raw };
        } catch {
          return { ok: false, raw };
        }
      };

      // Primary attempt
      let result: any;
      try {
        result = await run({ contentsOverride: contractContents });
      } catch (e: any) {
        // One fast retry on timeout
        if (String(e?.message || '').startsWith('TIMEOUT_')) {
          const retryFastModel =
            provider === 'openai'
              ? process.env.OPENAI_EFFECT_MODEL || 'gpt-4o-mini'
              : provider === 'anthropic'
                ? process.env.ANTHROPIC_EFFECT_MODEL || 'claude-3-5-haiku-20241022'
                : process.env.GEMINI_EFFECT_MODEL || process.env.GEMINI_FAST_MODEL || 'gemini-2.5-flash-lite';

          result = await run({ providerModel: retryFastModel, hardTimeoutMs: 22_000, contentsOverride: contractContents });
        } else {
          throw e;
        }
      }

      let parsed = await parseAttempt(result);

      // Retry once if invalid/short
      if (!parsed.ok) {
        const retryPrompt =
          prompt +
          `\n\nIMPORTANT: Your previous output was invalid or incomplete. Return ONLY a single valid JSON object that matches the schema EXACTLY.`;
        const retryContents = [{ role: 'user', parts: [{ text: retryPrompt }] }];

        const retryFastModel =
          provider === 'openai'
            ? process.env.OPENAI_EFFECT_MODEL || 'gpt-4o-mini'
            : provider === 'anthropic'
              ? process.env.ANTHROPIC_EFFECT_MODEL || 'claude-3-5-haiku-20241022'
              : process.env.GEMINI_EFFECT_MODEL || process.env.GEMINI_FAST_MODEL || 'gemini-2.5-flash-lite';

        const retried = await run({ providerModel: retryFastModel, hardTimeoutMs: 22_000, contentsOverride: retryContents });
        parsed = await parseAttempt(retried);

        if (parsed.ok) {
          result = retried;
        }
      }

      if (parsed.ok) {
        responsePayload = {
          ...(result || {}),
          text: jsonToMarkdown(parsed.obj),
          effect_engine_json: parsed.obj,
        };
      } else {
        const raw = extractText(result);
        responsePayload = {
          ...(result || {}),
          text: raw || 'Error: could not generate effect ideas. Please try again.',
          effect_engine_json_error: true,
        };
      }
    } else {
      // Default behavior for all other tools: passthrough result but ensure `.text` exists.
      let result: any;
      try {
        result = await run();
      } catch (e: any) {
        if (String(e?.message || '').startsWith('TIMEOUT_')) {
          const retryFastModel =
            provider === 'openai'
              ? process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini'
              : provider === 'anthropic'
                ? process.env.ANTHROPIC_CHAT_MODEL || 'claude-3-5-haiku-20241022'
                : process.env.GEMINI_CHAT_MODEL || process.env.GEMINI_EFFECT_MODEL || process.env.GEMINI_FAST_MODEL || 'gemini-2.5-flash-lite';

          result = await run({ providerModel: retryFastModel, hardTimeoutMs: 22_000 });
        } else {
          throw e;
        }
      }

      const t = extractText(result);
      responsePayload = t ? { ...(result || {}), text: t } : result;
    }

    // Usage headers (best-effort)
    response.setHeader('X-AI-Remaining', String(usage.remaining ?? ''));
    response.setHeader('X-AI-Limit', String(usage.limit ?? ''));
    response.setHeader('X-AI-Membership', String(usage.membership ?? ''));
    response.setHeader('X-AI-Burst-Remaining', String(usage.burstRemaining ?? ''));
    response.setHeader('X-AI-Burst-Limit', String(usage.burstLimit ?? ''));
    response.setHeader('X-AI-Provider-Used', provider);

    return response.status(200).json(responsePayload);
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
