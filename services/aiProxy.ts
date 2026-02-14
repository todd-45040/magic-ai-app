// src/services/aiProxy.ts
//
// Single, universal client gateway for ALL AI calls.
// UI/components should import from here only (no direct Gemini SDK usage in the browser).
//
// Endpoints expected:
//   POST /api/ai/chat      { prompt, system? }                 -> { ok:true, data:{ text } }
//   POST /api/ai/json      { prompt, system?, schemaName? }     -> { ok:true, data:{ json } }
//   POST /api/ai/image     { prompt, style?, size? }            -> { ok:true, data:{ images } }
//   POST /api/ai/identify  { imageBase64, prompt? }             -> { ok:true, data:{ result } }

export type AiErrorCode =
  | "BAD_REQUEST"
  | "BAD_JSON"
  | "METHOD_NOT_ALLOWED"
  | "RATE_LIMITED"
  | "QUOTA_EXCEEDED"
  | "TIMEOUT"
  | "SERVER_MISCONFIG"
  | "AI_ERROR"
  | "UNKNOWN_ERROR";

export type AiError = Error & {
  code?: AiErrorCode | string;
  retryable?: boolean;
  status?: number;
  requestId?: string;
};

type OkResponse<T> = {
  ok: true;
  requestId?: string;
  data: T;
};

type ErrResponse = {
  ok: false;
  requestId?: string;
  error_code: AiErrorCode | string;
  message: string;
  retryable?: boolean;
};

// Reads response as text first, then parses JSON.
// This makes debugging far easier when the server returns HTML (404/500) or empty responses.
async function safeFetchJson<T>(
  url: string,
  init: RequestInit
): Promise<OkResponse<T>> {
  const r = await fetch(url, init);
  const text = await r.text();

  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    const e: AiError = new Error(
      `Non-JSON response (${r.status}). First 200 chars: ${text.slice(0, 200)}`
    );
    e.code = "UNKNOWN_ERROR";
    e.status = r.status;
    throw e;
  }

  if (parsed && typeof parsed.ok === "boolean") {
    if (parsed.ok) return parsed as OkResponse<T>;

    const err = parsed as ErrResponse;
    const e: AiError = new Error(err.message || "AI request failed");
    e.code = err.error_code || "UNKNOWN_ERROR";
    e.retryable = Boolean(err.retryable);
    e.status = r.status;
    e.requestId = err.requestId;
    throw e;
  }

  const e: AiError = new Error(
    `Unexpected server response shape (${r.status}).`
  );
  e.code = "UNKNOWN_ERROR";
  e.status = r.status;
  throw e;
}

/** aiChat(prompt, system?) → plain text response */
export async function aiChat(prompt: string, system?: string) {
  const res = await safeFetchJson<{ text: string }>("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, system }),
  });

  return res.data.text;
}

/** aiJson(prompt, system?, schemaName?) → structured JSON response */
export async function aiJson<T = unknown>(
  prompt: string,
  system?: string,
  schemaName?: string
) {
  const res = await safeFetchJson<{ json: T }>("/api/ai/json", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, system, schemaName }),
  });

  return res.data.json;
}

/** aiImage(prompt, style?, size?) → returns array of image strings (urls or base64, depending on server) */
export async function aiImage(
  prompt: string,
  style?: string,
  size?: "512x512" | "1024x1024" | "1536x1536"
) {
  const res = await safeFetchJson<{ images: string[] }>("/api/ai/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, style, size }),
  });

  return res.data.images;
}

/** aiIdentify(imageBase64, prompt?) → vision analysis result (generic type) */
export async function aiIdentify<T = unknown>(
  imageBase64: string,
  prompt?: string
) {
  const res = await safeFetchJson<{ result: T }>("/api/ai/identify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64, prompt }),
  });

  return res.data.result;
}
