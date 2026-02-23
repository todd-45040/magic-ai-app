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
      maxOutputTokens:
        typeof (config || {})?.maxOutputTokens === 'number'
          ? (config || {}).maxOutputTokens
          : 900,
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
              : (process.env.GEMINI_EFFECT_MODEL || process.env.GEMINI_FAST_MODEL || 'gemini-2.5-flash-lite');

        result = await run({ providerModel: retryFastModel, hardTimeoutMs: 22_000 });
      } else {
        throw e;
      }
    }
    // --- Effect Engine: "Never cut off" deep routine builder via JSON contract ---
    // We force a strict JSON schema for exactly 4 effects, validate server-side,
    // retry once if invalid/too short, then render JSON -> Markdown for UI.
    try {
      const items = extractItemsFromContents(contents);
      const itemLine = items.length ? items.join(', ') : 'the provided items';

      const maxTokens = (() => {
        const v = Number(process.env.EFFECT_ENGINE_MAX_TOKENS);
        // Deep routine builder needs headroom. Safe bounds: 1200–12000
        if (Number.isFinite(v) && v >= 1200 && v <= 12000) return Math.floor(v);
        return 9000;
      })();

      const deepSchemaInstructions =
        `Return ONLY valid JSON. No markdown. No backticks. No commentary.\n` +
        `Schema (MUST match): {"effects":[{"name":string,"premise":string,"experience":string,"method_overview":string,"performance_notes":string,"secret_hint":string}, ... exactly 4 ]}\n\n` +
        `Rules:\n` +
        `- EXACTLY 4 effects in the "effects" array.\n` +
        `- Each field must be plain text (no markdown).\n` +
        `- Write for a professional magician: deep, practical, and stage-ready.\n` +
        `- Do NOT reveal step-by-step secrets. Keep methods as high-level categories and principles.\n\n` +
        `Minimum lengths (MUST meet):\n` +
        `- name >= 3 chars\n` +
        `- premise >= 60 chars\n` +
        `- experience >= 220 chars (8–14 sentences)\n` +
        `- method_overview >= 140 chars\n` +
        `- performance_notes >= 160 chars\n` +
        `- secret_hint >= 90 chars\n\n` +
        `Props/items to use: ${itemLine}.`;

      const makeJsonContents = (extra?: string) => ([
        {
          role: 'user',
          parts: [
            {
              text: extra ? (deepSchemaInstructions + `\n\n` + extra) : deepSchemaInstructions,
            },
          ],
        },
      ]);

      const cleanJsonText = (t: string) => {
        const s = (t || '').trim();
        // Strip accidental code fences if model includes them
        return s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
      };

      const validateDeep = (obj: any) => {
        const effects = obj?.effects;
        if (!Array.isArray(effects) || effects.length !== 4) return { ok: false, why: 'effects must be an array of exactly 4' };

        const mins: Record<string, number> = {
          name: 3,
          premise: 60,
          experience: 220,
          method_overview: 140,
          performance_notes: 160,
          secret_hint: 90,
        };

        for (let i = 0; i < effects.length; i++) {
          const e = effects[i] || {};
          for (const k of Object.keys(mins)) {
            const v = String(e[k] ?? '').trim();
            if (v.length < mins[k]) return { ok: false, why: `effect #${i + 1} field "${k}" too short` };
          }
        }
        return { ok: true as const };
      };

      const renderMarkdown = (obj: any) => {
        const effects = obj.effects as any[];
        const blocks = effects.map((e, idx) => {
          const n = idx + 1;
          return [
            `### ${n}. ${String(e.name).trim()}`,
            ``,
            `**Premise:** ${String(e.premise).trim()}`,
            ``,
            `**The Experience:** ${String(e.experience).trim()}`,
            ``,
            `**Method Overview:** ${String(e.method_overview).trim()}`,
            ``,
            `**Performance Notes:** ${String(e.performance_notes).trim()}`,
            ``,
            `**The Secret Hint:** ${String(e.secret_hint).trim()}`,
          ].join('\n');
        });
        return blocks.join('\n\n***\n\n').trim();
      };

      const attempt = async (extra?: string) => {
        // NOTE: We keep provider selection the same; we only override contents/config.
        const r = await run({ contentsOverride: makeJsonContents(extra) });
        const raw = extractText(r);
        const cleaned = cleanJsonText(raw);
        let parsed: any = null;
        try {
          parsed = JSON.parse(cleaned);
        } catch {
          return { ok: false as const, why: 'json parse failed', raw: cleaned };
        }
        const v = validateDeep(parsed);
        if (!v.ok) return { ok: false as const, why: v.why, raw: cleaned, parsed };
        return { ok: true as const, parsed };
      };

      // Override boundedConfig token ceiling for this path (deep JSON needs more room).
      boundedConfig.maxOutputTokens = maxTokens;

      // Attempt #1
      let out = await attempt();
      // Retry once if invalid
      if (!out.ok) {
        out = await attempt(
          `IMPORTANT: Your previous output was invalid ("${out.why}"). ` +
            `Return ONLY valid JSON matching the schema exactly. Do not add any extra keys.`
        );
      }

      if (out.ok) {
        const md = renderMarkdown(out.parsed);
        result = { text: md, effect_engine_json: out.parsed };
      } else {
        // Fallback to whatever we got (better than a blank UI)
        const fallbackText = extractText(result) || '';
        result = { ...(result || {}), text: fallbackText.trim() || 'Unable to generate effects. Please try again.' };
      }
    } catch {
      // If JSON contract fails unexpectedly, we fall back to the provider's text.
      const fallbackText = extractText(result) || '';
      result = { ...(result || {}), text: fallbackText.trim() || 'Unable to generate effects. Please try again.' };
    }

    // Return usage headers for the Usage Meter UI (best-effort)
 for the Usage Meter UI (best-effort)
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
