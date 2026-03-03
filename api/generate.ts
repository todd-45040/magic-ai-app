// NOTE:
// Vercel serverless functions run as ESM. In ESM, relative imports must include
// the file extension (e.g. './lib/usage.js') or Node will throw ERR_MODULE_NOT_FOUND
// even when the file exists.
//
// Also: keep provider SDK imports *inside* the handler via dynamic import.
// This avoids "FUNCTION_INVOCATION_FAILED" when a module has ESM/CJS quirks.

import { enforceAiUsage } from '../server/usage.js';
import { resolveProvider, callOpenAI, callAnthropic } from '../lib/server/providers/index.js';
import { getGoogleAiApiKey } from '../server/gemini.js';

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

const DEFAULT_TIMEOUT_MS = (() => {
  const v = Number(process.env.EFFECT_ENGINE_TIMEOUT_MS);
  // sensible bounds: 10s–85s (deep mode can legitimately take longer)
  // Keep this under Vercel maxDuration so we can return a controlled error instead of a 504.
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

function getDemoEffectEnginePayload(scenario: string | undefined): EffectEnginePayload {
  // Demo Mode v2 (Phase 2): deterministic, pre-curated payload.
  // Keep methods NON-EXPOSURE — this is a showcase, not a teaching reveal.
  const s = String(scenario || '').trim().toLowerCase();

  // Default: corporate close-up journey (safe, universal, great for onboarding recordings)
  if (!s || s === 'corporate_closeup' || s === 'corporate-closeup' || s === 'corporate') {
    return {
      effects: [
        {
          name: "The CEO's Promise",
          premise:
            "A borrowed ring and a simple rubber band become a playful metaphor for commitment and trust. The audience feels like they're watching a personal story unfold rather than 'a trick.'",
          experience:
            "You borrow a ring and briefly 'test' the tension of a rubber band as you talk about promises that stretch but don't break. The ring is fairly displayed, then the band is looped in a clean, casual way that looks like nothing. With a gentle tug and a beat of eye contact, the ring appears to melt through the band in a moment of impossible softness. You reset the picture and repeat the moment in slow-motion framing, letting the audience call the timing. For a final beat, you hand everything out and let them feel the band and ring themselves, reinforcing that nothing sneaky happened. The tone stays elegant and corporate-friendly, with the impossibility landing as 'that can't be real.'",
          method_overview:
            "A classic close-up penetration structure using clean displays, rhythm management, and motivated hand positions. The strength comes from choreography and timing rather than complicated technique.",
          performance_notes:
            "Work chest-high at a cocktail height; keep elbows relaxed and hands in the light. Use a short pause before the moment to let the picture register. If the group is large, angle the final moment toward the widest side and immediately hand the props forward to a spectator to lock in fairness. Build in a quick 'try it' joke line, but avoid turning it into a challenge.",
          secret_hint:
            "Treat the band as the 'story' and the ring as the 'proof.' The clearer the picture before the moment, the stronger the impossibility after.",
        },
        {
          name: 'Key to the Corner Office',
          premise:
            "A key represents access and opportunity—perfect corporate symbolism. A coin becomes the 'investment' that makes the key finally turn.",
          experience:
            "You introduce a key as the symbol of 'earned access' and a coin as the 'small investment' that changes outcomes. The key is openly shown and the coin is placed fairly. With an upbeat patter beat, the coin seems to jump from your fingertips to appear impossibly trapped with the key. The moment is framed like an earned promotion—one clean change and the picture is instantly readable. You hand the key forward while keeping the coin visible, letting the audience react to the impossible pairing.",
          method_overview:
            "A visual object-to-object relationship change built around clarity: show key, show coin, then show the new impossible condition. Use clean transitions and avoid over-proving.",
          performance_notes:
            "This plays best in a standing cluster. Keep the 'before' picture simple and the 'after' picture held still for two full beats. If someone reaches, invite it—confidence sells. Have a backup line ready if someone tries to inspect early: 'In a moment—let the photo in your mind develop first.'",
          secret_hint:
            "The reaction is in the stillness. Freeze the final display like a product reveal.",
        },
        {
          name: 'The Rubber Contract',
          premise:
            "A rubber band becomes a 'contract'—flexible but binding. A Sharpie signature makes it personal and impossible to fake.",
          experience:
            "You stretch a band and talk about how agreements can flex, but the signature is what makes them real. A spectator signs a bold mark that visually tags the moment. The band is shown unmistakably as the same object, then it seems to change position in a way that matches your story beat. The ending is a clean reveal that the signed condition is preserved, which locks the impossibility emotionally.",
          method_overview:
            "A signed-object continuity effect—audience tracking replaces technical complexity. The magic is framed as preserving identity through change.",
          performance_notes:
            "Use a bold marker and keep the signature large. Don't rush the signing moment; it creates ownership. Maintain spectator involvement: let them hold something at least once during the sequence.",
          secret_hint:
            "When they 'own' the object, they stop hunting for method and start remembering the moment.",
        },
        {
          name: 'The Quiet Upgrade',
          premise:
            "A normal object becomes 'premium' in an instant—mirroring a brand upgrade. The transformation is visual, fast, and clean.",
          experience:
            "You talk about subtle improvements that change everything, then demonstrate a crisp visual transformation with everyday props. The change happens at the exact moment you say the word 'upgrade,' creating a perfect audio/visual sync. You immediately hand the item out and pivot, leaving them with a story that sounds impossible but feels true.",
          method_overview:
            "A visual transformation structure: establish normal, isolate moment, reveal new condition. The method stays concealed by pacing and motivated actions.",
          performance_notes:
            "Keep the moment short—less is more. Use strong contrast if possible (lighting matters). Rehearse the reveal angle for standing audiences.",
          secret_hint:
            "Say less, show more. The cleaner the sentence, the louder the magic.",
        },
      ],
    };
  }

  // Fallback
  return getDemoEffectEnginePayload('corporate_closeup');
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

    // Demo Mode v2 (Phase 2): intercept ONLY the Effect Engine when explicitly requested.
    const demoMode = String(request.headers['x-demo-mode'] || '').toLowerCase() === 'true';
    const demoTool = String(request.headers['x-demo-tool'] || '').toLowerCase();
    const demoScenario = String(request.headers['x-demo-scenario'] || '').trim();
    if (demoMode && demoTool === 'effect_engine') {
      const payload = getDemoEffectEnginePayload(demoScenario);
      const markdown = renderEffectsToMarkdown(payload);
      response.setHeader('X-AI-Membership', 'demo');
      response.setHeader('X-AI-Remaining', '');
      response.setHeader('X-AI-Limit', '');
      response.setHeader('X-AI-Burst-Remaining', '');
      response.setHeader('X-AI-Burst-Limit', '');
      response.setHeader('X-AI-Provider-Used', 'demo');
      return response.status(200).json({ text: markdown, effect_engine_json: payload, demo: true, scenario: demoScenario || 'corporate_closeup' });
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

    const provider = await resolveProvider(request);
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

      const apiKey = getGoogleAiApiKey();
      if (!apiKey) {
        throw new Error('Missing GOOGLE_AI_API_KEY in Vercel environment variables.');
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
