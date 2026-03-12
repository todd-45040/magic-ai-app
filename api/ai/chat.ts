// Phase 1.5 hardened AI chat endpoint
// - size guard
// - rate limiting (best-effort in-memory)
// - timeout protection
// - consistent error contract { ok:false, error_code, message, retryable, details? }
// - preview-only debug details
// - Supabase-backed usage enforcement + best-effort incrementing

import { resolveProvider, callOpenAI, callAnthropic } from '../../lib/server/providers/index.js';
import {
    isPreviewEnv,
  jsonError,
  mapProviderError,
  withTimeout,
} from './_lib/hardening.js';
import { applyUsageHeaders, bestEffortIncrementAiUsage, guardAiUsage } from './_lib/usageGuard.js';
import { bestEffortLog, completeProtectedRequest, failProtectedRequest, startProtectedRequest } from './_lib/requestSafety.js';
import { getGoogleAiApiKey } from '../../server/gemini.js';

const MAX_BODY_BYTES = 2 * 1024 * 1024; // ~2MB
const TIMEOUT_MS = 25_000;



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
    safety = await startProtectedRequest({ req, res, tool: 'chat', payloadForFingerprint: req.body || {}, endpoint: '/api/ai/chat' });
    if (!safety?.ok) return safety;

    // Supabase usage guard (single source of truth)
    const guard = await guardAiUsage(req, 1);
    if (!guard.ok) {
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
        return callOpenAI({ model, contents, config });
      }
      if (provider === 'anthropic') {
        return callAnthropic({ model, contents, config });
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
        },
      });
    };

    const result = await withTimeout(run(), TIMEOUT_MS, 'TIMEOUT');

    await bestEffortIncrementAiUsage(req, 1);

    applyUsageHeaders(res, guard.usage);
    res.setHeader('X-AI-Provider-Used', provider);

    const payload = { ok: true, data: result };
    completeProtectedRequest(safety.fingerprint, payload, 'chat');
    await bestEffortLog({ req, tool: 'chat', endpoint: '/api/ai/chat', provider, model: model || 'gemini-3-pro-preview', success: true, charged_units: 1, input_size: safety.bodySize, output_size: JSON.stringify(payload).length, latency_ms: Date.now() - start });
    return res.status(200).json(payload);
  } catch (err: any) {
    console.error('AI Chat Error:', err);

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

    await bestEffortLog({ req, tool: 'chat', endpoint: '/api/ai/chat', success: false, error_code: mapped.error_code, http_status: mapped.status, charged_units: 0 });
    return jsonError(res, mapped.status, {
      ok: false,
      error_code: mapped.error_code,
      message: mapped.message,
      retryable: mapped.retryable,
      ...(details ? { details } : {}),
    });
  }
}
