// api/ai/json.ts
// Structured JSON endpoint (Director Mode, Prop Checklists, Blueprints)
//
// Request:  { prompt: string, system?: string, schemaName?: string, model?: string, temperature?: number }
// Response: { ok:true, data:{ json: any } }  OR  { ok:false, error_code, message, retryable }

import { GoogleGenAI } from "@google/genai";

type Body = {
  prompt?: string;
  system?: string;
  schemaName?: string;
  model?: string;
  temperature?: number;
};

function getApiKey(): string | null {
  // Prefer server-only secret, but keep backwards compatibility with existing env names
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

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return err(res, 405, "METHOD_NOT_ALLOWED", "Only POST allowed");

  const apiKey = getApiKey();
  if (!apiKey) return err(res, 500, "SERVER_MISCONFIG", "Missing Gemini API key on server");

  const body: Body = req.body || {};
  const prompt = String(body.prompt || "").trim();
  if (!prompt) return err(res, 400, "BAD_REQUEST", "Missing prompt");

  const system = String(body.system || "").trim();
  const schemaName = String(body.schemaName || "").trim();
  const model = String(body.model || process.env.GEMINI_JSON_MODEL || "gemini-2.5-flash");
  const temperature = typeof body.temperature === "number" ? body.temperature : 0.2;

  // We don’t know your exact JSON schema here, but we can:
  // - enforce “JSON only”
  // - optionally hint a schemaName for human readability
  const jsonInstruction =
    "Return ONLY valid JSON. No markdown, no backticks, no commentary. " +
    "If a value is unknown, use null. Ensure the output parses as JSON.";

  const schemaHint = schemaName ? `\n\nSchema name to follow: ${schemaName}` : "";
  const finalSystem = [system, jsonInstruction + schemaHint].filter(Boolean).join("\n\n");

  try {
    const ai = new GoogleGenAI({ apiKey });

    const result = await withTimeout(
      ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          systemInstruction: finalSystem,
          temperature,
          // Strong nudge for JSON mode where supported
          responseMimeType: "application/json",
        },
      }),
      20000
    );

    const text = String((result as any)?.text || "").trim();
    if (!text) return err(res, 502, "AI_ERROR", "Empty response from AI", true);

    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Try to salvage common “wrapped json” cases by extracting first/last braces
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start >= 0 && end > start) {
        const slice = text.slice(start, end + 1);
        try {
          parsed = JSON.parse(slice);
        } catch {
          parsed = null;
        }
      }
    }

    if (parsed == null) {
      return err(
        res,
        502,
        "BAD_JSON",
        "AI returned invalid JSON. Please retry or adjust the prompt.",
        true
      );
    }

    return ok(res, { json: parsed });
  } catch (e: any) {
    const msg = String(e?.message || e || "");
    if (msg === "TIMEOUT") return err(res, 504, "TIMEOUT", "AI timed out. Please retry.", true);
    if (/quota|resource|429/i.test(msg)) return err(res, 429, "QUOTA_EXCEEDED", "AI quota reached.", false);
    return err(res, 500, "AI_ERROR", "AI request failed. Please retry.", true);
  }
}
