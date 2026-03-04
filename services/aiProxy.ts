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

import { supabase } from '../supabase';

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


const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_RETRIES = 2;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryableStatus(status: number) {
  return status === 502 || status === 503 || status === 504;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}


async function getBearerToken(): Promise<string> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    return token ? `Bearer ${token}` : 'Bearer guest';
  } catch {
    return 'Bearer guest';
  }
}

async function withAuthHeaders(headers: Record<string, string> = {}): Promise<Record<string, string>> {
  return {
    ...headers,
    Authorization: await getBearerToken(),
  };
}

// Reads response as text first, then parses JSON.
// This makes debugging far easier when the server returns HTML (404/500) or empty responses.
async function safeFetchJson<T>(
  url: string,
  init: RequestInit
): Promise<OkResponse<T>> {
  const initWithAuth: RequestInit = {
    ...init,
    headers: await withAuthHeaders((init.headers as Record<string, string>) || {}),
  };

  let lastErr: any = null;

  for (let attempt = 0; attempt <= DEFAULT_RETRIES; attempt++) {
    try {
      const r = await fetchWithTimeout(url, initWithAuth, DEFAULT_TIMEOUT_MS);
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

        if (attempt < DEFAULT_RETRIES && e.retryable && isRetryableStatus(r.status)) {
          await sleep(800 * (attempt + 1));
          continue;
        }

        throw e;
      }

      const e: AiError = new Error(
        `Unexpected server response shape (${r.status}).`
      );
      e.code = "UNKNOWN_ERROR";
      e.status = r.status;
      throw e;
    } catch (err: any) {
      lastErr = err;

      const isAbort = err?.name === "AbortError" || /aborted/i.test(String(err?.message || ""));
      const isNetwork = /network|failed to fetch/i.test(String(err?.message || ""));

      if (attempt < DEFAULT_RETRIES && (isAbort || isNetwork)) {
        await sleep(800 * (attempt + 1));
        continue;
      }

      break;
    }
  }

  const msg =
    lastErr?.name === "AbortError"
      ? `Request timed out (${Math.round(DEFAULT_TIMEOUT_MS / 1000)}s)`
      : String(lastErr?.message || "AI request failed");

  const e: AiError = new Error(msg);
  if (lastErr?.code) e.code = lastErr.code;
  if (typeof lastErr?.status === "number") e.status = lastErr.status;
  if (typeof lastErr?.retryable === "boolean") e.retryable = lastErr.retryable;
  if (lastErr?.requestId) e.requestId = lastErr.requestId;
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
