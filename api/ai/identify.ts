// api/ai/identify.ts
// Vision analysis endpoint ("identify trick"/prop recognition)
//
// Request: { imageBase64: string (dataUrl or raw base64), mimeType?: string, prompt?: string, model?: string }
// Response: { ok:true, data:{ result:{ text:string } } } or { ok:false, error_code, message, retryable, details? }

import { GoogleGenAI } from "@google/genai";
import { enforceAiUsage } from "../../server/usage.js";
// NOTE: This file lives in api/ai/, so _lib is a sibling folder.
// Vercel/TS expects the correct relative path (and extensionless imports).
import { rateLimit } from "./_lib/rateLimit.js";

type Body = {
  imageBase64?: string; // base64 only OR full data URL
  mimeType?: string;    // if base64 is raw, supply mime; default image/jpeg
  prompt?: string;
  model?: string;
  userId?: string;      // optional: pass from client if available
};

function getClientIpFromRequest(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0].trim();
  const xr = req.headers.get("x-real-ip");
  if (xr) return xr.trim();
  return "0.0.0.0";
}

function getApiKey(): string | null {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    process.env.VITE_API_KEY ||
    null
  );
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

  // Rate limiting (Phase 1 best-effort)
  const ip = getClientIpFromRequest(req as any);
  const userKey = String(body.userId || "").trim();
  const key = userKey ? `identify:user:${userKey}` : `identify:ip:${ip}`;

  const limit = Number(process.env.IDENTIFY_RATE_LIMIT || 8); // 8 requests / minute default
  const windowMs = Number(process.env.IDENTIFY_RATE_WINDOW_MS || 60_000);

  const rl = rateLimit(key, { max: limit, windowMs });
  if (!rl.ok) {
    res.setHeader("Retry-After", String(rl.retryAfterSeconds));
    return err(
      res,
      429,
      "RATE_LIMITED",
      `Too many requests. Please wait ${rl.retryAfterSeconds}s and try again.`,
      true,
      { requestId, retryAfterSeconds: rl.retryAfterSeconds }
    );
  }

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

    return ok(res, { result: { text } }, requestId);
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
      return err(res, 504, "TIMEOUT", "Vision request timed out. Please retry.", true, { requestId, ...(details ? { details } : {}) });
    }
    if (/quota|resource|429/i.test(msg)) {
      return err(res, 429, "QUOTA_EXCEEDED", "AI quota reached. Try again later.", false, { requestId, ...(details ? { details } : {}) });
    }

    return err(res, 500, "AI_ERROR", "Vision request failed. Please retry.", true, { requestId, ...(details ? { details } : {}) });
  }
}