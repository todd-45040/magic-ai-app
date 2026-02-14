// api/ai/identify.ts
// Vision analysis endpoint ("identify trick"/prop recognition)
//
// Request: { imageBase64: string, prompt?: string, mimeType?: string, model?: string }
// Response: { ok:true, data:{ result: any } } (default: { text: string })

import { GoogleGenAI } from "@google/genai";

type Body = {
  imageBase64?: string; // base64 only OR full data URL
  mimeType?: string;    // if base64 is raw, supply mime; default image/jpeg
  prompt?: string;
  model?: string;
};

function getApiKey(): string | null {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    process.env.VITE_API_KEY ||
    null
  );
}

function ok(res: any, data: any) {
  return res.status(200).json({ ok: true, data });
}

function err(res: any, status: number, error_code: string, message: string, retryable = false) {
  return res.status(status).json({ ok: false, error_code, message, retryable });
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

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return err(res, 405, "METHOD_NOT_ALLOWED", "Only POST allowed");

  const apiKey = getApiKey();
  if (!apiKey) return err(res, 500, "SERVER_MISCONFIG", "Missing Gemini API key on server");

  const body: Body = req.body || {};
  const raw = String(body.imageBase64 || "").trim();
  if (!raw) return err(res, 400, "BAD_REQUEST", "Missing imageBase64");

  const fromDataUrl = parseDataUrl(raw);
  const mimeType = fromDataUrl?.mimeType || String(body.mimeType || "image/jpeg");
  const data = fromDataUrl?.data || raw;

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
    if (!text) return err(res, 502, "AI_ERROR", "Empty response from vision model.", true);

    return ok(res, { result: { text } });
  } catch (e: any) {
    const msg = String(e?.message || e || "");
    if (msg === "TIMEOUT") return err(res, 504, "TIMEOUT", "Vision request timed out. Please retry.", true);
    if (/quota|resource|429/i.test(msg)) return err(res, 429, "QUOTA_EXCEEDED", "AI quota reached.", false);
    return err(res, 500, "AI_ERROR", "Vision request failed. Please retry.", true);
  }
}
