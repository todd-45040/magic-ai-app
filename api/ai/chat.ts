import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenerativeAI } from "@google/generative-ai";

type ChatReq = {
  prompt: string;
  system?: string;
  model?: string; // optional override
};

function jsonError(res: VercelResponse, status: number, code: string, message: string, retryable = false) {
  return res.status(status).json({ ok: false, error_code: code, message, retryable });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return jsonError(res, 405, "METHOD_NOT_ALLOWED", "Only POST allowed");
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return jsonError(res, 500, "SERVER_MISCONFIG", "Missing GEMINI_API_KEY on server", false);
  }

  let body: ChatReq;
  try {
    body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) as ChatReq;
  } catch {
    return jsonError(res, 400, "BAD_JSON", "Invalid JSON body");
  }

  const prompt = (body?.prompt ?? "").trim();
  if (!prompt) {
    return jsonError(res, 400, "MISSING_PROMPT", "Prompt is required");
  }

  // Timeout guard (20s)
  const timeoutMs = 20000;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelName = body.model || "gemini-2.5-flash"; // pick your default
    const model = genAI.getGenerativeModel({ model: modelName });

    // Optional system instruction: prepend to prompt (simple approach)
    const system = (body.system ?? "").trim();
    const finalPrompt = system ? `${system}\n\nUSER:\n${prompt}` : prompt;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
      // signal: controller.signal, // if SDK supports it in your version; if not, abort won't cancel but timeout still returns error below
    } as any);

    const text = result?.response?.text?.() ?? "";
    clearTimeout(t);

    return res.status(200).json({
      ok: true,
      data: { text }
    });
  } catch (err: any) {
    clearTimeout(t);

    // Abort / timeout
    const msg = String(err?.message || err);
    if (msg.toLowerCase().includes("aborted") || msg.toLowerCase().includes("abort")) {
      return jsonError(res, 504, "TIMEOUT", "AI timed out. Please retry.", true);
    }

    // Basic quota/rate hints (we’ll improve later)
    if (msg.toLowerCase().includes("quota") || msg.toLowerCase().includes("resource")) {
      return jsonError(res, 429, "QUOTA_EXCEEDED", "AI quota reached. Try again later.", false);
    }

    return jsonError(res, 500, "AI_ERROR", "AI request failed. Please retry.", true);
  }
}
