// api/ai/identify.ts
// Vision analysis endpoint ("identify trick"/prop recognition)
//
// Request: { imageBase64: string (dataUrl or raw base64), mimeType?: string, prompt?: string, model?: string }
// Response: { ok:true, data:{ result:{ text:string } } } or { ok:false, error_code, message, retryable, details? }

import { GoogleGenAI } from "@google/genai";
import { enforceAiUsage } from "../../server/usage.js";
import { getGoogleAiApiKey } from "../../server/gemini.js";
import { bestEffortLog, completeProtectedRequest, failProtectedRequest, startProtectedRequest } from './_lib/requestSafety.js';
// NOTE: This file lives in api/ai/, so _lib is a sibling folder.
// Vercel/TS expects the correct relative path (and extensionless imports).

type Body = {
  imageBase64?: string; // base64 only OR full data URL
  mimeType?: string;    // if base64 is raw, supply mime; default image/jpeg
  prompt?: string;
  model?: string;
  userId?: string;      // optional: pass from client if available
};

function getHeader(req: any, name: string): string | undefined {
  const key = name.toLowerCase();

  // Fetch Request-style headers
  if (req?.headers?.get && typeof req.headers.get === "function") {
    const v = req.headers.get(name);
    return v ?? undefined;
  }

  // Node/Vercel API req (IncomingMessage): headers is a plain object
  const h = req?.headers;
  if (!h) return undefined;

  const v = h[key] ?? h[name];
  if (Array.isArray(v)) return v[0];
  return typeof v === "string" ? v : undefined;
}

function getClientIpFromRequest(req: any): string {
  const xf = getHeader(req, "x-forwarded-for");
  if (xf) return xf.split(",")[0].trim();

  const xr = getHeader(req, "x-real-ip");
  if (xr) return xr.trim();

  if (typeof req?.ip === "string" && req.ip) return req.ip;

  return "0.0.0.0";
}

function getApiKey(): string | null {
  // Server-side only. Never read VITE_* here.
  return getGoogleAiApiKey();
}

function ok(res: any, data: any, requestId?: string) {
  return res.status(200).json({ ok: true, data, ...(requestId ? { requestId } : {}) });
}

function err(res: any, status: number, error_code: string, message: string, retryable = false, extra?: any) {
  return res.status(status).json({ ok: false, error_code, message, retryable, ...(extra || {}) });
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), ms)),
  ]);
}

function parseDataUrl(input: string): { mimeType: string; data: string } | null {
  const m = /^data:([^;]+);base64,(.+)$/i.exec(input.trim());
  if (!m) return null;
  return { mimeType: m[1], data: m[2] };
}

function estimateBytesFromBase64(base64: string): number {
  // base64 length * 3/4 minus padding
  const len = base64.length;
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((len * 3) / 4) - padding);
}

export default async function handler(req: any, res: any) {
  const requestId = (typeof crypto !== "undefined" && "randomUUID" in crypto) ? (crypto as any).randomUUID() : `${Date.now()}-${Math.random()}`;
  let safety: any;
  const startedAt = Date.now();

  // Vercel will return a generic non-JSON 500 if this function throws before
  // writing a response. Wrap the entire handler to guarantee structured JSON.
  try {

  if (req.method !== "POST") {
    return err(res, 405, "METHOD_NOT_ALLOWED", "Only POST allowed", false, { requestId });
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    return err(res, 500, "SERVER_MISCONFIG", "Missing Gemini API key on server", false, { requestId });
  }

  const body: Body = req.body || {};
  const raw = String(body.imageBase64 || "").trim();
  if (!raw) return err(res, 400, "BAD_REQUEST", "Missing imageBase64", false, { requestId });

  // Placeholder guard
  if (raw.includes("....")) {
    return err(res, 400, "BAD_REQUEST", "imageBase64 looks like a placeholder.", false, { requestId });
  }

  // Accept either data URL or raw base64. Validate format.
  const isDataUrl = /^data:[^;]+;base64,/.test(raw);
  const looksLikeBase64 = /^[A-Za-z0-9+/=\r\n]+$/.test(raw);

  if (!isDataUrl && !looksLikeBase64) {
    return err(res, 400, "BAD_REQUEST", "imageBase64 is not a valid data URL or base64 string.", false, { requestId });
  }

  // Extract mime/base64 payload
  const fromDataUrl = isDataUrl ? parseDataUrl(raw) : null;
  const mimeType = fromDataUrl?.mimeType || String(body.mimeType || "image/jpeg");
  const data = fromDataUrl?.data || raw;

  // Size guard (Phase 1): reject >2MB images (base64 payload)
  const maxBytes = Number(process.env.IDENTIFY_MAX_BYTES || 2 * 1024 * 1024);
  const bytes = estimateBytesFromBase64(data);
  if (bytes > maxBytes) {
    return err(
      res,
      413,
      "PAYLOAD_TOO_LARGE",
      `Image is too large (${Math.ceil(bytes/1024)} KB). Please upload an image under ${Math.ceil(maxBytes/1024)} KB (about ${Math.ceil(maxBytes/1024/1024)} MB).`,
      false,
      { requestId }
    );
  }

  safety = await startProtectedRequest({ req, res, tool: 'identify', payloadForFingerprint: { imageBase64: data.slice(0, 512), mimeType, prompt: body.prompt || '' }, endpoint: '/api/ai/identify', model: body.model || process.env.GEMINI_VISION_MODEL || 'gemini-2.5-flash' });
  if (!safety?.ok) return safety;

  // Phase 2C-B: tool quota enforcement (monthly)
  const usage = await enforceAiUsage(req, 1, { tool: 'identify_trick' });
  if (!usage.ok) {
    return err(res, usage.status || 402, usage.error_code || 'USAGE_LIMIT_REACHED', usage.error || 'Quota exceeded.', Boolean(usage.retryable), {
      requestId,
      remaining: usage.remaining,
      limit: usage.limit,
      membership: usage.membership,
      burstRemaining: usage.burstRemaining,
      burstLimit: usage.burstLimit,
    });
  }

  const prompt =
    String(body.prompt || "").trim() ||
    "You are a helpful magic assistant. Identify the likely prop/effect in the image and suggest 3 possible routines or uses. Keep it practical and non-exposure.";

  const model = String(body.model || process.env.GEMINI_VISION_MODEL || "gemini-2.5-flash");

  try {
    const ai = new GoogleGenAI({ apiKey });

    const result: any = await withTimeout(
      ai.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              { inlineData: { mimeType, data } },
            ],
          },
        ],
      }),
      20000
    );

    const text = String(result?.text || "").trim();
    if (!text) {
      return err(res, 502, "AI_ERROR", "Empty response from vision model.", true, { requestId });
    }

    const payload = { ok: true, data: { result: { text } }, requestId };
    completeProtectedRequest(safety.fingerprint, payload, 'identify');
    await bestEffortLog({ req, tool: 'identify_trick', endpoint: '/api/ai/identify', provider: 'gemini', model, success: true, charged_units: 1, input_size: bytes, output_size: text.length, latency_ms: Date.now() - startedAt });
    return res.status(200).json(payload);
  } catch (e: any) {
    const msg = String(e?.message || e || "");
    const name = String(e?.name || "");
    const stack = String(e?.stack || "");

    const isPreviewOrDev =
      process.env.VERCEL_ENV === "preview" ||
      process.env.VERCEL_ENV === "development" ||
      process.env.NODE_ENV !== "production";

    const details = isPreviewOrDev
      ? { name, message: msg.slice(0, 800), stack: stack.slice(0, 1200) }
      : undefined;

    if (msg === "TIMEOUT") {
      failProtectedRequest(safety?.fingerprint);
      await bestEffortLog({ req, tool: 'identify_trick', endpoint: '/api/ai/identify', success: false, error_code: 'AI_TIMEOUT', http_status: 504, charged_units: 0 });
      return err(res, 504, "AI_TIMEOUT", "AI is temporarily unavailable. Please try again in a moment.", true, { requestId, ...(details ? { details } : {}) });
    }
    if (/quota|resource|429/i.test(msg)) {
      failProtectedRequest(safety?.fingerprint);
      await bestEffortLog({ req, tool: 'identify_trick', endpoint: '/api/ai/identify', success: false, error_code: 'AI_LIMIT_REACHED', http_status: 429, charged_units: 0 });
      return err(res, 429, "AI_LIMIT_REACHED", "You’ve reached your limit for this feature this month.", false, { requestId, ...(details ? { details } : {}) });
    }

    failProtectedRequest(safety?.fingerprint);
    await bestEffortLog({ req, tool: 'identify_trick', endpoint: '/api/ai/identify', success: false, error_code: 'AI_PROVIDER_UNAVAILABLE', http_status: 500, charged_units: 0 });
    return err(res, 503, "AI_PROVIDER_UNAVAILABLE", "AI is temporarily unavailable. Please try again in a moment.", true, { requestId, ...(details ? { details } : {}) });
  }

  } catch (e: any) {
    console.error('identify fatal (outer):', e);
    failProtectedRequest(safety?.fingerprint);
    await bestEffortLog({ req, tool: 'identify_trick', endpoint: '/api/ai/identify', success: false, error_code: 'AI_PROVIDER_UNAVAILABLE', http_status: 500, charged_units: 0 });
    return err(res, 500, 'AI_PROVIDER_UNAVAILABLE', 'AI is temporarily unavailable. Please try again in a moment.', true, {
      requestId,
      details:
        process.env.VERCEL_ENV !== 'production'
          ? { message: String(e?.message || e || '').slice(0, 800) }
          : undefined,
    });
  }
}