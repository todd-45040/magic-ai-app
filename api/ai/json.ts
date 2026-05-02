// Phase 1.5 hardened AI JSON endpoint
// - size guard
// - rate limiting (best-effort in-memory)
// - timeout protection
// - consistent error contract { ok:false, error_code, message, retryable, details? }
// - preview-only debug details
// - Supabase-backed usage enforcement + best-effort incrementing
//
// Input normalization:
// - Accept OpenAI-style `messages` as canonical input
// - For Gemini, adapt messages -> `contents` (required by @google/genai)

import { resolveProvider, callOpenAI, callAnthropic } from '../../lib/server/providers/index.js';
import { getGoogleAiApiKey } from '../../server/gemini.js';
import { rateLimit } from './_lib/rateLimit.js';
import {
  getApproxBodySizeBytes,
  getRateLimitKey,
  isPreviewEnv,
  jsonError,
  mapProviderError,
  withTimeout,
} from './_lib/hardening.js';
import { applyUsageHeaders, bestEffortIncrementAiUsage, guardAiUsage } from './_lib/usageGuard.js';

const MAX_BODY_BYTES = 2 * 1024 * 1024; // ~2MB
const TIMEOUT_MS = 55_000;
const REPAIR_MAX_OUTPUT_TOKENS = 4096;

function getClientIp(req: any): string | null {
  const xf = req?.headers?.['x-forwarded-for'] || req?.headers?.['X-Forwarded-For'];
  if (typeof xf === 'string' && xf.trim()) {
    // may be a comma-separated list; take first
    return xf.split(',')[0].trim();
  }
  const realIp = req?.headers?.['x-real-ip'] || req?.headers?.['X-Real-IP'];
  if (typeof realIp === 'string' && realIp.trim()) return realIp.trim();
  const sock = req?.socket || req?.connection;
  const addr = sock?.remoteAddress;
  return typeof addr === 'string' && addr.trim() ? addr.trim() : null;
}

function extractText(result: any): string {
  // Gemini SDK
  const t1 = result?.response?.text?.();
  if (typeof t1 === 'string') return t1;

  // Direct candidates
  const parts = result?.candidates?.[0]?.content?.parts;
  const t2 = parts?.map((p: any) => p?.text).filter(Boolean).join('');
  if (typeof t2 === 'string' && t2.trim()) return t2;

  // OpenAI/Anthropic wrappers may return { text } or similar
  if (typeof result?.text === 'string') return result.text;
  if (typeof result?.output_text === 'string') return result.output_text;

  try {
    return JSON.stringify(result);
  } catch {
    return String(result ?? '');
  }
}




function normalizeGeminiSchema(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(normalizeGeminiSchema);

  const out: any = { ...schema };
  if (typeof out.type === 'string') {
    const t = out.type.toLowerCase();
    const map: Record<string, string> = {
      object: 'OBJECT',
      array: 'ARRAY',
      string: 'STRING',
      number: 'NUMBER',
      integer: 'INTEGER',
      boolean: 'BOOLEAN',
    };
    out.type = map[t] || out.type;
  }

  if (out.properties && typeof out.properties === 'object') {
    out.properties = Object.fromEntries(
      Object.entries(out.properties).map(([key, value]) => [key, normalizeGeminiSchema(value)])
    );
  }
  if (out.items) out.items = normalizeGeminiSchema(out.items);
  if (Array.isArray(out.anyOf)) out.anyOf = out.anyOf.map(normalizeGeminiSchema);
  if (Array.isArray(out.oneOf)) out.oneOf = out.oneOf.map(normalizeGeminiSchema);
  if (Array.isArray(out.allOf)) out.allOf = out.allOf.map(normalizeGeminiSchema);
  return out;
}

function tryExtractStructuredJson(result: any): any | null {
  const parsed = result?.response?.parsed ?? result?.parsed ?? null;
  if (parsed && typeof parsed === 'object') return parsed;

  const directJson = result?.response?.json ?? result?.json ?? null;
  if (directJson && typeof directJson === 'object') return directJson;

  return null;
}

// Accept OpenAI-style messages as canonical input and adapt for Gemini when needed.
function messagesToGeminiContents(messages: any[]): any[] {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((m) => m && typeof m.content === 'string' && m.content.trim())
    .map((m) => {
      const role =
        m.role === 'assistant'
          ? 'model'
          : m.role === 'user'
            ? 'user'
            : m.role === 'system'
              ? 'user' // Gemini doesn't truly support system; treat as user guidance
              : 'user';
      return { role, parts: [{ text: String(m.content) }] };
    });
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'POST') {
      return jsonError(res, 405, {
        ok: false,
        error_code: 'METHOD_NOT_ALLOWED',
        message: 'Method not allowed',
        retryable: false,
      });
    }

    const bodySize = getApproxBodySizeBytes(req);
    if (bodySize > MAX_BODY_BYTES) {
      return jsonError(res, 413, {
        ok: false,
        error_code: 'PAYLOAD_TOO_LARGE',
        message: 'Request payload too large. Please keep requests under ~2MB.',
        retryable: false,
        ...(isPreviewEnv() ? { details: { bodySize, limit: MAX_BODY_BYTES } } : {}),
      });
    }

    let rlKey = await getRateLimitKey(req);
    // Guests may not have auth context; fall back to IP-based rate limit key.
    if (!rlKey) {
      const ip = getClientIp(req) || 'unknown';
      rlKey = { key: 'ai:json:guest:' + ip, kind: 'guest', ip } as any;
    }

    const rl = rateLimit(rlKey.key, { windowMs: 60_000, max: 20 });
    if (!rl.ok) {
      // IMPORTANT: set Retry-After directly (Vercel can drop headers passed via helper)
      try {
        res.setHeader('Retry-After', String(rl.retryAfterSeconds));
      } catch {
        // ignore
      }
      return jsonError(res, 429, {
        ok: false,
        error_code: 'RATE_LIMITED',
        message: 'Too many requests. Please wait and try again.',
        retryable: true,
        ...(isPreviewEnv() ? { details: { key: rlKey.key, resetAt: rl.resetAt } } : {}),
      });
    }

    // Supabase usage guard (single source of truth)
    const guard = await guardAiUsage(req, 1);
    if (!guard.ok) {
      return jsonError(res, guard.status, guard.error);
    }

    const provider = await resolveProvider(req);
    const body = req.body || {};
    const { model, config } = body;

    let responseSchema = config?.responseSchema;
    if (!responseSchema || typeof responseSchema !== 'object') {
      return jsonError(res, 400, {
        ok: false,
        error_code: 'BAD_REQUEST',
        message: 'Missing required structured output schema: provide config.responseSchema.',
        retryable: false,
        ...(isPreviewEnv() ? { details: { hint: 'Send { config: { responseSchema: { ... } } }' } } : {}),
      });
    }

    // Normalize JSON schema type names before passing to Gemini.
    // Several frontend tools use standard JSON Schema lowercase values ('object',
    // 'array', 'string'), while @google/genai expects uppercase enum values
    // ('OBJECT', 'ARRAY', 'STRING'). Without this, Gemini can throw INVALID_ARGUMENT
    // and the UI only sees the generic hardening message.
    responseSchema = normalizeGeminiSchema(responseSchema);

    // Canonical input: messages[]; for Gemini we must provide `contents`.
    const messages = body.messages;
    let contents = body.contents;

    if (provider === 'gemini' && !contents && Array.isArray(messages)) {
      contents = messagesToGeminiContents(messages);
    }

    // Fail fast: prevent Gemini INVALID_ARGUMENT crashes when contents is missing/empty.
    if (provider === 'gemini' && (!Array.isArray(contents) || contents.length === 0)) {
      return jsonError(res, 400, {
        ok: false,
        error_code: 'BAD_REQUEST',
        message: 'Missing required input: provide `messages` (recommended) or `contents` for Gemini.',
        retryable: false,
        ...(isPreviewEnv() ? { details: { hint: "Send { messages:[{role:'user',content:'...'}] }" } } : {}),
      });
    }

    const run = async () => {
      if (provider === 'openai') {
        return callOpenAI({ model, contents, config: { ...config, responseMimeType: 'application/json' } });
      }
      if (provider === 'anthropic') {
        return callAnthropic({ model, contents, config: { ...config, responseMimeType: 'application/json' } });
      }

      const apiKey = getGoogleAiApiKey();
      if (!apiKey) {
        throw new Error(
          'Google AI API key is not configured. Set GOOGLE_AI_API_KEY in Vercel environment variables.',
        );
      }

      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });
      return ai.models.generateContent({
        model: model || 'gemini-2.5-flash',
        contents,
        config: {
          ...config,
          responseMimeType: 'application/json',
          responseSchema,
          temperature: typeof config?.temperature === 'number' ? config.temperature : 0.2,
        },
      });
    };

    const result = await withTimeout(run(), TIMEOUT_MS, 'TIMEOUT');
    const directStructured = tryExtractStructuredJson(result);
    const rawText = extractText(result);

    let parsed: any = directStructured;
    // --- Robust JSON recovery (booth reliability)
    // Providers occasionally return "JSON" with:
    // - extra wrapper text
    // - fenced code blocks
    // - raw newlines/tabs inside quoted strings (invalid JSON)
    // - occasional stray text before/after the JSON
    // We'll do:
    //   1) strict parse
    //   2) best-effort repair + parse
    //   3) ONE automatic "repair" retry to the model (re-emit ONLY valid JSON)

    const stripFences = (s: string) => {
      const t = (s || '').trim();
      if (t.startsWith('```')) {
        return t
          .replace(/^```[a-zA-Z]*\s*/m, '')
          .replace(/```\s*$/m, '')
          .trim();
      }
      return t;
    };

    const extractJsonBlock = (input: string) => {
      const text = (input || '').trim();
      if (!text) return '';
      const firstObj = text.indexOf('{');
      const firstArr = text.indexOf('[');
      let start = -1;
      if (firstObj === -1) start = firstArr;
      else if (firstArr === -1) start = firstObj;
      else start = Math.min(firstObj, firstArr);
      if (start === -1) return text;
      const endObj = text.lastIndexOf('}');
      const endArr = text.lastIndexOf(']');
      const end = Math.max(endObj, endArr);
      if (end === -1 || end <= start) return text.slice(start);
      return text.slice(start, end + 1);
    };

    const escapeControlCharsInsideStrings = (jsonLike: string) => {
      let out = '';
      let inStr = false;
      let esc = false;
      for (let i = 0; i < jsonLike.length; i++) {
        const ch = jsonLike[i];
        if (esc) {
          out += ch;
          esc = false;
          continue;
        }
        if (ch === '\\') {
          out += ch;
          esc = true;
          continue;
        }
        if (ch === '"') {
          inStr = !inStr;
          out += ch;
          continue;
        }
        if (inStr) {
          if (ch === '\n' || ch === '\r') {
            out += '\\n';
            if (ch === '\r' && jsonLike[i + 1] === '\n') i++;
            continue;
          }
          if (ch === '\t') {
            out += '\\t';
            continue;
          }
          if (ch === '\b') {
            out += '\\b';
            continue;
          }
          if (ch === '\f') {
            out += '\\f';
            continue;
          }
        }
        out += ch;
      }
      return out;
    };

    const tryParse = (text: string): any | null => {
      if (!text || typeof text !== 'string') return null;
      try {
        return JSON.parse(text);
      } catch {
        // ignore
      }
      try {
        const candidate = extractJsonBlock(stripFences(text));
        const repaired = escapeControlCharsInsideStrings(candidate);
        return JSON.parse(repaired);
      } catch {
        return null;
      }
    };

    if (parsed == null) parsed = tryParse(rawText);

    if (parsed == null) {
      // One automatic repair retry (rare, but dramatically improves booth reliability)
      const repairPrompt =
        'You returned invalid JSON. Re-emit ONLY valid JSON for the SAME schema. ' +
        'Do not add commentary, markdown fences, or extra keys. ' +
        'All string values must be single-line; if you need line breaks, use \\n.\n\n' +
        'INVALID JSON (fix this):\n' +
        rawText;

      const repairContents = [{ role: 'user', parts: [{ text: repairPrompt }] }];

      const runRepair = async () => {
        if (provider === 'openai') {
          return callOpenAI({ model, contents: repairContents, config: { ...config, maxOutputTokens: Math.max(Number(config?.maxOutputTokens || 0), REPAIR_MAX_OUTPUT_TOKENS) } });
        }
        if (provider === 'anthropic') {
          return callAnthropic({ model, contents: repairContents, config: { ...config, maxOutputTokens: Math.max(Number(config?.maxOutputTokens || 0), REPAIR_MAX_OUTPUT_TOKENS) } });
        }
        const apiKey = getGoogleAiApiKey();
        if (!apiKey) {
          throw new Error('Google AI API key is not configured. Set GOOGLE_AI_API_KEY in Vercel environment variables.');
        }
        const { GoogleGenAI } = await import('@google/genai');
        const ai = new GoogleGenAI({ apiKey });
        return ai.models.generateContent({
          model: model || 'gemini-2.5-flash',
          contents: repairContents,
          config: { ...config, responseMimeType: 'application/json', responseSchema, maxOutputTokens: Math.max(Number(config?.maxOutputTokens || 0), REPAIR_MAX_OUTPUT_TOKENS), temperature: 0 },
        });
      };

      try {
        const repairResult = await withTimeout(runRepair(), TIMEOUT_MS, 'TIMEOUT');
        const repairText = extractText(repairResult);
        parsed = tryParse(repairText);
      } catch {
        // ignore; will fail below
      }
    }

    if (parsed == null) {
      return jsonError(res, 422, {
        ok: false,
        error_code: 'BAD_JSON',
        message: 'The AI response was not valid JSON. Please try again.',
        retryable: true,
        ...(isPreviewEnv() ? { details: { rawText: rawText?.slice(0, 4000) } } : {}),
      });
    }

    // Best-effort increment AFTER success
    // IMPORTANT: await so metering reliably persists in serverless runtimes
    await bestEffortIncrementAiUsage(req, 1);

    applyUsageHeaders(res, guard.usage);
    res.setHeader('X-AI-Provider-Used', provider);

    return res.status(200).json({ ok: true, json: parsed });
  } catch (err: any) {
    console.error('AI JSON Error:', err);

    const mapped = mapProviderError(err);
    const details = isPreviewEnv()
      ? {
          name: String(err?.name || 'Error'),
          message: String(err?.message || err),
          code: err?.code,
          stack: String(err?.stack || ''),
        }
      : undefined;

    return jsonError(res, mapped.status, {
      ok: false,
      error_code: mapped.error_code,
      message: mapped.message,
      retryable: mapped.retryable,
      ...(details ? { details } : {}),
    });
  }
}
