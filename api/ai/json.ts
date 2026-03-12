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
import {
    isPreviewEnv,
  jsonError,
  mapProviderError,
  withTimeout,
} from './_lib/hardening.js';
import { applyUsageHeaders, bestEffortIncrementAiUsage, guardAiUsage } from './_lib/usageGuard.js';
import { bestEffortLog, completeProtectedRequest, failProtectedRequest, startProtectedRequest } from './_lib/requestSafety.js';

const MAX_BODY_BYTES = 2 * 1024 * 1024; // ~2MB
const TIMEOUT_MS = 25_000;

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
  let safety: any;
  let start = Date.now();
  try {
    if (req.method !== 'POST') {
      return jsonError(res, 405, {
        ok: false,
        error_code: 'METHOD_NOT_ALLOWED',
        message: 'Method not allowed',
        retryable: false,
      });
    }
    start = Date.now();
    safety = await startProtectedRequest({ req, res, tool: 'json', payloadForFingerprint: req.body || {}, endpoint: '/api/ai/json' });
    if (!safety?.ok) return safety;

    const guard = await guardAiUsage(req, 1);
    if (!guard.ok) {
      failProtectedRequest(safety.fingerprint);
      return jsonError(res, guard.status, guard.error);
    }

    const provider = await resolveProvider(req);
    const body = req.body || {};
    const { model, config } = body;

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
        model: model || 'gemini-3-pro-preview',
        contents,
        config: {
          ...config,
          responseMimeType: 'application/json',
        },
      });
    };

    const result = await withTimeout(run(), TIMEOUT_MS, 'TIMEOUT');
    const rawText = extractText(result);

    let parsed: any;
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

    parsed = tryParse(rawText);

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
          return callOpenAI({ model, contents: repairContents, config: { ...config, maxOutputTokens: 1400 } });
        }
        if (provider === 'anthropic') {
          return callAnthropic({ model, contents: repairContents, config: { ...config, maxOutputTokens: 1400 } });
        }
        const apiKey = getGoogleAiApiKey();
        if (!apiKey) {
          throw new Error('Google AI API key is not configured. Set GOOGLE_AI_API_KEY in Vercel environment variables.');
        }
        const { GoogleGenAI } = await import('@google/genai');
        const ai = new GoogleGenAI({ apiKey });
        return ai.models.generateContent({
          model: model || 'gemini-3-pro-preview',
          contents: repairContents,
          config: { ...config, responseMimeType: 'application/json', maxOutputTokens: 1400 },
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

    failProtectedRequest((typeof safety !== 'undefined' && safety && safety.fingerprint) ? safety.fingerprint : undefined);
    const mapped = mapProviderError(err);
    const details = isPreviewEnv()
      ? {
          name: String(err?.name || 'Error'),
          message: String(err?.message || err),
          code: err?.code,
          stack: String(err?.stack || ''),
        }
      : undefined;

    await bestEffortLog({ req, tool: 'json', endpoint: '/api/ai/json', success: false, error_code: mapped.error_code, http_status: mapped.status, charged_units: 0 });
    return jsonError(res, mapped.status, {
      ok: false,
      error_code: mapped.error_code,
      message: mapped.message,
      retryable: mapped.retryable,
      ...(details ? { details } : {}),
    });
  }
}
