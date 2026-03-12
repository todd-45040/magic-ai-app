// Phase 1.5 hardened AI image endpoint
// - size guard
// - rate limiting (best-effort in-memory)
// - timeout protection
// - consistent error contract { ok:false, error_code, message, retryable, details? }
// - preview-only debug details
// - Supabase-backed usage enforcement + best-effort incrementing
//
// Input normalization:
// - Accept OpenAI-style `messages` as canonical input
// - Derive `prompt` from messages when prompt is not provided

import { resolveProvider } from '../../lib/server/providers/index.js';
import {
    isPreviewEnv,
  jsonError,
  mapProviderError,
  withTimeout,
} from './_lib/hardening.js';
import { applyUsageHeaders, bestEffortIncrementAiUsage, guardAiUsage } from './_lib/usageGuard.js';
import { bestEffortLog, completeProtectedRequest, failProtectedRequest, startProtectedRequest } from './_lib/requestSafety.js';
import { getGoogleAiApiKey } from '../../server/gemini.js';

const MAX_BODY_BYTES = 2 * 1024 * 1024; // prompts should be tiny; this is a safety cap
const TIMEOUT_MS = 45_000;

// Accept OpenAI-style messages as canonical input and derive a prompt string.
// This makes /api/ai/image consistent with /api/ai/chat and /api/ai/json.
function promptFromMessages(messages: any[]): string {
  if (!Array.isArray(messages)) return '';
  const parts: string[] = [];
  for (const m of messages) {
    if (!m) continue;
    const role = String(m.role || '').toLowerCase();
    const content = typeof m.content === 'string' ? m.content.trim() : '';
    if (!content) continue;

    // Include system guidance as part of the prompt. Prefer user content.
    if (role === 'system') parts.push(`Instruction: ${content}`);
    else if (role === 'user') parts.push(content);
  }
  // If no user/system, fall back to any string content
  if (parts.length === 0) {
    for (const m of messages) {
      const content = typeof m?.content === 'string' ? m.content.trim() : '';
      if (content) parts.push(content);
    }
  }
  return parts.join('\n\n').slice(0, 8000);
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
    safety = await startProtectedRequest({ req, res, tool: 'image', payloadForFingerprint: req.body || {}, endpoint: '/api/ai/image' });
    if (!safety?.ok) return safety;

    const guard = await guardAiUsage(req, 1);
    if (!guard.ok) {
      failProtectedRequest(safety.fingerprint);
      return jsonError(res, guard.status, guard.error);
    }

    const provider = await resolveProvider(req);
    const body = req.body || {};
    const { aspectRatio = '1:1' } = body;

    // Canonical input: messages[]; derive prompt if prompt is missing.
    const prompt =
      typeof body.prompt === 'string' && body.prompt.trim()
        ? body.prompt
        : Array.isArray(body.messages)
          ? promptFromMessages(body.messages)
          : '';

    if (!prompt.trim()) {
      return jsonError(res, 400, {
        ok: false,
        error_code: 'BAD_REQUEST',
        message: 'Missing required input: provide `prompt` or `messages`.',
        retryable: false,
        ...(isPreviewEnv()
          ? { details: { hint: "Send { prompt: '...', ... } or { messages:[{role:'user',content:'...'}] }" } }
          : {}),
      });
    }

    const run = async () => {
      if (provider === 'openai') {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) throw new Error('OPENAI_API_KEY is not configured.');

        const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';

        const resp = await fetch('https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            prompt: String(prompt || ''),
            size: '1024x1024',
            response_format: 'b64_json',
          }),
        });

        const json = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          const msg = json?.error?.message || json?.message || `OpenAI image request failed (${resp.status})`;
          const e: any = new Error(msg);
          e.status = resp.status;
          throw e;
        }

        return json;
      }

      if (provider === 'anthropic') {
        const e: any = new Error('Image generation is not supported for Anthropic provider.');
        e.status = 400;
        throw e;
      }

      const apiKey = getGoogleAiApiKey();
      if (!apiKey) throw new Error('Google AI API key is not configured. Set GOOGLE_AI_API_KEY.');

      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });

      // NOTE: For @google/genai generateImages, empty prompt can cause INVALID_ARGUMENT "Empty instances."
      return ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt,
        config: {
          numberOfImages: 1,
          outputMimeType: 'image/jpeg',
          aspectRatio,
        },
      });
    };

    const result = await withTimeout(run(), TIMEOUT_MS, 'TIMEOUT');

    // Best-effort increment AFTER success
    // IMPORTANT: await so metering reliably persists in serverless runtimes
    await bestEffortIncrementAiUsage(req, 1);

    applyUsageHeaders(res, guard.usage);
    res.setHeader('X-AI-Provider-Used', provider);

    const payload = { ok: true, data: result };
    completeProtectedRequest(safety.fingerprint, payload, 'image');
    await bestEffortLog({ req, tool: 'image_generation', endpoint: '/api/ai/image', provider, model: 'imagen-4.0-generate-001', success: true, charged_units: 1, input_size: safety.bodySize, output_size: JSON.stringify(payload).length, latency_ms: Date.now() - start });
    return res.status(200).json(payload);
  } catch (err: any) {
    console.error('AI Image Error:', err);

    failProtectedRequest(safety?.fingerprint);
    const mapped = mapProviderError(err);
    const details = isPreviewEnv()
      ? {
          name: String(err?.name || 'Error'),
          message: String(err?.message || err),
          code: err?.code,
          status: err?.status,
          stack: String(err?.stack || ''),
        }
      : undefined;

    await bestEffortLog({ req, tool: 'image_generation', endpoint: '/api/ai/image', success: false, error_code: mapped.error_code, http_status: mapped.status, charged_units: 0 });
    return jsonError(res, mapped.status, {
      ok: false,
      error_code: mapped.error_code,
      message: mapped.message,
      retryable: mapped.retryable,
      ...(details ? { details } : {}),
    });
  }
}
