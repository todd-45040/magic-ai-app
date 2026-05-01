// src/services/aiProxy.ts
//
// Single, universal client gateway for ALL AI calls.
// UI/components should import from here only (no direct Gemini SDK usage in the browser).
//
// Endpoints expected:
//   POST /api/ai/chat      { messages:[...], contents? }        -> { ok:true, data:{ text } }
//   POST /api/ai/json      { messages:[...], contents?, config? } -> { ok:true, data:{ json } }
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


function buildMessages(prompt: string, system?: string) {
  const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
  if (system && system.trim()) {
    messages.push({ role: 'system', content: system.trim() });
  }
  messages.push({ role: 'user', content: prompt });
  return messages;
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
  const r = await fetch(url, initWithAuth);
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


function unwrapAiPayload<T = unknown>(res: any): T {
  if (res?.data?.json !== undefined) return res.data.json as T;
  if (res?.json !== undefined) return res.json as T;
  if (res?.data !== undefined) return res.data as T;
  return res as T;
}

function unwrapAiText(res: any): string {
  if (res?.data?.text !== undefined) return String(res.data.text);
  if (res?.text !== undefined) return String(res.text);
  if (typeof res?.data === 'string') return res.data;
  if (typeof res === 'string') return res;
  return '';
}

function toImageDataUrl(img: any): string | null {
  if (typeof img === 'string' && img.trim()) {
    return img.startsWith('data:') ? img : img;
  }

  const base64 =
    img?.image?.imageBytes ||
    img?.imageBytes ||
    img?.b64_json ||
    img?.base64;
  const mime = img?.mimeType || img?.mime || 'image/jpeg';

  if (typeof base64 === 'string' && base64.length > 0) {
    return `data:${mime};base64,${base64}`;
  }

  return null;
}

function unwrapAiImages(res: any): string[] {
  const imgs =
    res?.data?.images ||
    res?.images ||
    res?.data?.generatedImages ||
    res?.generatedImages ||
    res?.data?.data?.generatedImages ||
    res?.data?.data?.images ||
    res?.data;

  if (!Array.isArray(imgs)) return [];
  return imgs.map(toImageDataUrl).filter((url): url is string => Boolean(url));
}

function unwrapAiResult<T = unknown>(res: any): T {
  if (res?.data?.result !== undefined) return res.data.result as T;
  if (res?.result !== undefined) return res.result as T;
  if (res?.data !== undefined) return res.data as T;
  return res as T;
}

/** aiChat(prompt, system?) → plain text response */
export async function aiChat(prompt: string, system?: string) {
  const res = await safeFetchJson<{ text: string }>("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: buildMessages(prompt, system) }),
  });

  return unwrapAiText(res);
}

export type AiJsonConfig = {
  schemaName?: string;
  responseSchema?: Record<string, unknown>;
  temperature?: number;
  maxOutputTokens?: number;
};

/** aiJson(prompt, system?, config?) → structured JSON response */
export async function aiJson<T = unknown>(
  prompt: string,
  system?: string,
  configOrSchemaName?: string | AiJsonConfig
) {
  const config: AiJsonConfig | undefined =
    typeof configOrSchemaName === 'string'
      ? { schemaName: configOrSchemaName }
      : configOrSchemaName;

  const res = await safeFetchJson<{ json: T }>("/api/ai/json", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: buildMessages(prompt, system),
      config,
    }),
  });

  return unwrapAiPayload<T>(res);
}

/** aiImage(prompt, options?) → returns array of image data URLs or URLs */
export type AiImageOptions = {
  style?: string;
  size?: "512x512" | "1024x1024" | "1536x1536";
  aspectRatio?: "1:1" | "3:4" | "4:3" | "9:16" | "16:9";
  count?: number;
};

export async function aiImage(
  prompt: string,
  styleOrOptions?: string | AiImageOptions,
  size?: "512x512" | "1024x1024" | "1536x1536"
) {
  const options: AiImageOptions =
    typeof styleOrOptions === 'object' && styleOrOptions !== null
      ? styleOrOptions
      : { style: styleOrOptions, size };

  const res = await safeFetchJson<{ images: string[] }>("/api/ai/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      style: options.style,
      size: options.size,
      aspectRatio: options.aspectRatio || '4:3',
      count: Math.max(1, Math.min(4, Math.floor(Number(options.count) || 1))),
    }),
  });

  return unwrapAiImages(res);
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

  return unwrapAiResult<T>(res);
}
