// api/ai/image.ts
// Image generation endpoint (Imagen)
//
// Request:  { prompt: string, style?: string, size?: "512x512"|"1024x1024"|"1536x1536" }
// Response: { ok:true, data:{ images: string[] } } where images are data URLs

import { GoogleGenAI } from "@google/genai";

type Body = {
  prompt?: string;
  style?: string;
  size?: "512x512" | "1024x1024" | "1536x1536";
  aspectRatio?: "1:1" | "3:4" | "4:3" | "9:16" | "16:9";
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

// Basic mapping: if caller provides size, infer aspect ratio as 1:1.
// If caller provides aspectRatio explicitly, use it.
function inferAspectRatio(body: Body): Body["aspectRatio"] {
  return body.aspectRatio || "1:1";
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return err(res, 405, "METHOD_NOT_ALLOWED", "Only POST allowed");

  const apiKey = getApiKey();
  if (!apiKey) return err(res, 500, "SERVER_MISCONFIG", "Missing Gemini API key on server");

  const body: Body = req.body || {};
  const prompt = String(body.prompt || "").trim();
  if (!prompt) return err(res, 400, "BAD_REQUEST", "Missing prompt");

  const style = String(body.style || "").trim();
  const fullPrompt = style ? `${prompt}\n\nStyle notes: ${style}` : prompt;

  const aspectRatio = inferAspectRatio(body);

  try {
    const ai = new GoogleGenAI({ apiKey });

    const result: any = await withTimeout(
      ai.models.generateImages({
        model: process.env.IMAGEN_MODEL || "imagen-4.0-generate-preview-06-06",
        prompt: fullPrompt,
        config: {
          numberOfImages: 1,
          outputMimeType: "image/jpeg",
          aspectRatio,
        },
      }),
      25000
    );

    // Try common response shapes
    const img = result?.generatedImages?.[0] || result?.images?.[0] || result?.data?.[0];
    const base64 =
      img?.image?.imageBytes ||
      img?.imageBytes ||
      img?.b64_json ||
      img?.base64;

    const mime = img?.mimeType || img?.mime || "image/jpeg";

    if (typeof base64 !== "string" || !base64) {
      return err(res, 502, "AI_ERROR", "No image data returned from Imagen.", true);
    }

    const dataUrl = `data:${mime};base64,${base64}`;
    return ok(res, { images: [dataUrl] });
  } catch (e: any) {
    const msg = String(e?.message || e || "");
    if (msg === "TIMEOUT") return err(res, 504, "TIMEOUT", "Image generation timed out. Please retry.", true);
    if (/quota|resource|429/i.test(msg)) return err(res, 429, "QUOTA_EXCEEDED", "AI quota reached.", false);
    return err(res, 500, "AI_ERROR", "Image generation failed. Please retry.", true);
  }
}
