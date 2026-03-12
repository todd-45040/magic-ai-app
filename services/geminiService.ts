import { Type } from "@google/genai";
import { supabase } from '../supabase';
import type { ChatMessage, TrickIdentificationResult, User } from '../types';
import { getAiProvider } from './aiProviderService';

// Keep this type export for components that reference live sessions.
// NOTE: Live sessions are intentionally disabled in the production baseline because
// they require an ephemeral-token broker to avoid exposing secrets in the frontend.
export type LiveSession = any;


function extractJsonBlock(input: string): string {
  const text = (input || '').trim();
  if (!text) return '';
  const firstObj = text.indexOf('{');
  const firstArr = text.indexOf('[');
  let start = -1;
  if (firstObj === -1) start = firstArr;
  else if (firstArr === -1) start = firstObj;
  else start = Math.min(firstObj, firstArr);
  if (start === -1) return text;
  // Try to find the matching last brace/bracket (best-effort)
  const endObj = text.lastIndexOf('}');
  const endArr = text.lastIndexOf(']');
  const end = Math.max(endObj, endArr);
  if (end === -1 || end <= start) return text.slice(start);
  return text.slice(start, end + 1);
}

function escapeNewlinesInsideStrings(jsonLike: string): string {
  let out = '';
  let inStr = false;
  let esc = false;
  for (let i = 0; i < jsonLike.length; i++) {
    const ch = jsonLike[i];
    if (esc) {
      out += ch;
      esc = false;
      continue;
    }
    if (ch === '\\') {
      out += ch;
      esc = true;
      continue;
    }
    if (ch === '"') {
      inStr = !inStr;
      out += ch;
      continue;
    }
    if (inStr && (ch === '\n' || ch === '\r')) {
      out += '\\n';
      if (ch === '\r' && jsonLike[i + 1] === '\n') i++;
      continue;
    }
    if (inStr && ch === '\t') {
      out += '\\t';
      continue;
    }
    out += ch;
  }
  return out;
}

function stripTrailingCommas(jsonLike: string): string {
  return String(jsonLike || '').replace(/,\s*([}\]])/g, '$1');
}

function closeLikelyTruncatedJson(jsonLike: string): string {
  const src = String(jsonLike || '');
  let out = '';
  let inStr = false;
  let esc = false;
  const closers: string[] = [];

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    out += ch;

    if (esc) {
      esc = false;
      continue;
    }
    if (ch === '\\') {
      esc = true;
      continue;
    }
    if (ch === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;

    if (ch === '{') closers.push('}');
    else if (ch === '[') closers.push(']');
    else if ((ch === '}' || ch === ']') && closers.length) closers.pop();
  }

  if (inStr) out += '"';
  if (closers.length) out += closers.reverse().join('');
  return out;
}

function safeJsonParse(text: string): any {
  const candidate = extractJsonBlock(text);
  const base = candidate || '{}';
  const repaired = escapeNewlinesInsideStrings(base);
  const attempts = [
    base,
    repaired,
    stripTrailingCommas(repaired),
    closeLikelyTruncatedJson(stripTrailingCommas(repaired)),
  ];

  let lastErr: any = null;
  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt || '{}');
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Invalid JSON');
}

function isAssistantStudioStructuredRequest(prompt: string, systemInstruction: string): boolean {
  const haystack = `${String(prompt || '')}
${String(systemInstruction || '')}`.toLowerCase();
  return (
    haystack.includes("assistant studio") ||
    haystack.includes("assistant-operations") ||
    haystack.includes("assistant operations") ||
    haystack.includes("assistant choreography") ||
    haystack.includes("stage director") ||
    haystack.includes("rehearsal notes")
  );
}

function buildSchemaFallback(responseSchema: any, rawText: string): any {
  const props = responseSchema?.properties && typeof responseSchema.properties === 'object'
    ? responseSchema.properties
    : {};

  const lines = String(rawText || '')
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^```/.test(line))
    .slice(0, 8);

  const shortText = lines.length
    ? lines.join('\n')
    : 'Plan generated, but structured formatting failed. Please regenerate for a cleaner layout.';

  const out: Record<string, any> = {};
  Object.keys(props).forEach((key, idx) => {
    const propType = String(props[key]?.type || '').toLowerCase();
    if (propType === 'array') out[key] = lines.length ? lines.slice(idx, idx + 3) : [];
    else if (propType === 'number' || propType === 'integer') out[key] = 0;
    else if (propType === 'boolean') out[key] = false;
    else out[key] = shortText;
  });
  return out;
}

/**
 * IMPORTANT (Blank-screen fix):
 * We no longer instantiate GoogleGenAI in the browser at module load.
 * If the API key is missing/empty, some SDK versions can throw during init,
 * crashing the app before React mounts (dark blank background).
 *
 * Instead, all AI calls go through serverless endpoints (Vercel /api/*).
 * Your Google AI key must be configured on the SERVER as GOOGLE_AI_API_KEY.
 */

type GeminiGenerateBody = {
  model?: string;
  contents: any;
  config?: any;
  tools?: any;
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

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(input, { ...init, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number) {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

async function postJson<T>(
  url: string,
  body: any,
  currentUser?: User,
  extraHeaders?: Record<string, string>,
  options?: { timeoutMs?: number; retries?: number }
): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? 90000; // keep under common serverless proxy timeouts
  const retries = options?.retries ?? 2;

  const init: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': await getBearerToken(),
      'X-AI-Provider': getAiProvider(),
      ...(extraHeaders || {}),
    },
    body: JSON.stringify(body),
  };

  let lastErr: any = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, init, timeoutMs);

      // Emit usage info for the Usage Meter UI (best-effort)
      try {
        const remaining = res.headers.get('X-AI-Remaining');
        const limit = res.headers.get('X-AI-Limit');
        const membership = res.headers.get('X-AI-Membership');
        const burstRemaining = res.headers.get('X-AI-Burst-Remaining');
        const burstLimit = res.headers.get('X-AI-Burst-Limit');

        if (remaining || limit || membership || burstRemaining || burstLimit) {
          window.dispatchEvent(
            new CustomEvent('ai-usage-update', {
              detail: {
                remaining: remaining ? Number(remaining) : undefined,
                limit: limit ? Number(limit) : undefined,
                membership: membership || undefined,
                burstRemaining: burstRemaining ? Number(burstRemaining) : undefined,
                burstLimit: burstLimit ? Number(burstLimit) : undefined,
                ts: Date.now(),
              },
            })
          );
        }
      } catch {
        // ignore
      }

      const text = await res.text();
      let json: any;
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        json = { raw: text };
      }

      if (!res.ok) {
        const message = json?.error || json?.message || `Request failed (${res.status})`;

        // Retry on transient upstream / proxy failures
        if (attempt < retries && isRetryableStatus(res.status)) {
          await sleep(800 * (attempt + 1));
          continue;
        }

        throw new Error(message);
      }

      return json as T;
    } catch (err: any) {
      lastErr = err;

      // Abort / network errors: one retry helps a lot
      const isAbort = err?.name === 'AbortError' || /aborted/i.test(String(err?.message || ''));
      const isNetwork = /network|failed to fetch/i.test(String(err?.message || ''));

      if (attempt < retries && (isAbort || isNetwork)) {
        await sleep(800 * (attempt + 1));
        continue;
      }

      break;
    }
  }

  // If we exhausted retries, surface a helpful message
  const msg = lastErr?.name === 'AbortError'
    ? `Request timed out (${Math.round((options?.timeoutMs ?? 90000) / 1000)}s)`
    : (lastErr?.message || 'Request failed');

  throw new Error(msg);
}



function extractText(result: any): string {
  // SDK usually exposes `.text` (client-side). Your serverless function returns the raw result.
  if (typeof result?.text === 'string' && result.text.trim()) return result.text;

  // Try common candidate path
  const parts = result?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    const joined = parts
      .map((p: any) => p?.text)
      .filter((t: any) => typeof t === 'string')
      .join('')
      .trim();
    if (joined) return joined;
  }

  return "No response generated.";
}

export const generateResponse = async (
  prompt: string,
  systemInstruction: string,
  currentUser?: User,
  history?: ChatMessage[],
  options?: { extraHeaders?: Record<string, string> }
): Promise<string> => {
  const apiHistory = history?.map(msg => ({
    role: msg.role,
    parts: [{ text: msg.text }]
  })) || [];

  const body: GeminiGenerateBody = {
    model: 'gemini-3-pro-preview',
    contents: [...apiHistory, { role: 'user', parts: [{ text: prompt }] }],
    config: { systemInstruction },
  };

  try {
    const result = await postJson<any>('/api/generate', body, currentUser, options?.extraHeaders, { timeoutMs: 90000, retries: 2 });
    return extractText(result);
  } catch (error: any) {
    console.error('AI Error:', error);
    return `Error: ${error?.message || 'Failed to connect to AI wizard.'}`;
  }
};


export const generateResponseWithParts = async (
  parts: any[],
  systemInstruction: string,
  currentUser?: User,
  history?: ChatMessage[],
  options?: { extraHeaders?: Record<string, string> }
): Promise<string> => {
  const apiHistory = history?.map(msg => ({
    role: msg.role,
    parts: [{ text: msg.text }]
  })) || [];

  const body: GeminiGenerateBody = {
    model: 'gemini-3-pro-preview',
    contents: [...apiHistory, { role: 'user', parts }],
    config: { systemInstruction },
  };

  try {
    const result = await postJson<any>('/api/generate', body, currentUser, options?.extraHeaders, { timeoutMs: 90000, retries: 2 });
    return extractText(result);
  } catch (error: any) {
    console.error('AI Error:', error);
    return `Error: ${error?.message || 'Failed to connect to AI wizard.'}`;
  }
};

export const generateStructuredResponse = async (
  prompt: string,
  systemInstruction: string,
  responseSchema: any,
  currentUser?: User,
  options?: { extraHeaders?: Record<string, string>; maxOutputTokens?: number; speedMode?: 'fast' | 'full' }
): Promise<any> => {
  const speedMode = options?.speedMode ?? 'full';
  const model = speedMode === 'fast' ? 'gemini-2.5-flash' : 'gemini-2.5-pro';
  const body: GeminiGenerateBody = {
    model,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema,
      ...(typeof options?.maxOutputTokens === 'number' ? { maxOutputTokens: options.maxOutputTokens } : {}),
    },
  };

  const result = await postJson<any>('/api/generate', body, currentUser, options?.extraHeaders, { timeoutMs: 90000, retries: 2 });
  const text = extractText(result);

  const looksTruncated = (raw: string, errMsg: string) => {
    const t = (raw || '').trim();
    if (!t) return false;
    if (/end of data/i.test(errMsg)) return true;
    // If it doesn't end like JSON, it was likely cut off mid-object/array.
    return !/[}\]]\s*$/.test(t);
  };

  const clampForPrompt = (s: string, maxChars: number) => {
    const str = String(s || '');
    if (str.length <= maxChars) return str;
    return str.slice(0, maxChars) + `\n\n[TRUNCATED ${str.length - maxChars} CHARS]`;
  };

  // First attempt: best-effort local repair (escape newlines in strings, extract JSON block)
  try {
    return safeJsonParse(text || '{}');
  } catch (err: any) {
    // Second attempt: ask the model to re-emit ONLY valid JSON (booth-proofing).
    // This is the most reliable fix for "unterminated string" and truncation errors.
    const msg = String(err?.message || err || 'Invalid JSON');
    const wasTruncated = looksTruncated(text || '', msg);
    const retryPrompt =
      `The previous response was INVALID JSON and failed to parse (error: ${msg}).\n` +
      (wasTruncated ? `It appears the JSON was TRUNCATED (cut off before closing braces).\n\n` : `\n`) +
      `Re-emit ONLY valid JSON that conforms EXACTLY to the provided schema.\n` +
      `Rules:\n` +
      `- Output ONLY JSON (no markdown fences, no prose).\n` +
      `- Do NOT include trailing comments.\n` +
      `- Do NOT include raw newlines inside string values; use \\n if needed.\n` +
      `- Ensure all quotes inside strings are properly escaped.\n` +
      `- The JSON MUST be complete and MUST end with a closing } or ].\n` +
      `- If you are running out of space, shorten string fields (titles, transitions) but keep the schema valid.\n\n` +
      `Here is the invalid output to fix:\n` +
      `${clampForPrompt(text || '', 8000)}\n\n` +
      `Now output the corrected JSON only.`;

    const retryBody: GeminiGenerateBody = {
      // More reliable structured output in edge cases (truncation / schema pressure)
      model,
      contents: [{ role: 'user', parts: [{ text: retryPrompt }] }],
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema,
        // Completion-safe retry budget (even if Fast)
        ...(speedMode === 'fast'
          ? { maxOutputTokens: Math.max(Number(options?.maxOutputTokens ?? 900), 1200) }
          : (typeof options?.maxOutputTokens === 'number'
              ? { maxOutputTokens: Math.max(options.maxOutputTokens, 8192) }
              : { maxOutputTokens: 8192 })),
      },
    };

    const retryResult = await postJson<any>('/api/generate', retryBody, currentUser, options?.extraHeaders, { timeoutMs: 90000, retries: 1 });
    const retryText = extractText(retryResult);

    try {
      return safeJsonParse(retryText || '{}');
    } catch (err2: any) {
      const isAssistantStudio = isAssistantStudioStructuredRequest(prompt, systemInstruction);

      // Assistant's Studio Fast mode should not silently fake success with thin fallback stubs.
      // Give it one shorter-string recovery attempt and then surface a real error.
      if (speedMode === 'fast' && isAssistantStudio) {
        const msg2 = String(err2?.message || err2 || 'Invalid JSON');
        const shorterPrompt =
          `The JSON is still invalid after a repair attempt (error: ${msg2}).

` +
          `Re-emit a SHORTER but still useful JSON object that fits the schema exactly.
` +
          `Hard requirements:
` +
          `- JSON ONLY (no markdown, no prose).
` +
          `- Keep every required field populated.
` +
          `- Shorten string values aggressively, but do not leave fields blank.
` +
          `- Every field must remain usable rehearsal content.
` +
          `- The JSON MUST be complete and MUST end with } or ].

` +
          `Here is the invalid output to shorten and repair:
` +
          `${clampForPrompt(retryText || text || '', 5000)}

` +
          `Now output the corrected SHORTER JSON only.`;

        const shorterBody: GeminiGenerateBody = {
          model,
          contents: [{ role: 'user', parts: [{ text: shorterPrompt }] }],
          config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseSchema,
            maxOutputTokens: Math.max(Number(options?.maxOutputTokens ?? 900), 1200),
          },
        };

        const shorterResult = await postJson<any>('/api/generate', shorterBody, currentUser, options?.extraHeaders, { timeoutMs: 90000, retries: 1 });
        const shorterText = extractText(shorterResult);
        try {
          return safeJsonParse(shorterText || '{}');
        } catch (err3: any) {
          throw new Error(`Assistant Studio JSON parse failed after repair retry: ${String(err3?.message || err3 || 'Invalid JSON')}`);
        }
      }

      // Assistant Studio must not silently fake success with fallback stubs.
      // For other fast tools, keep the lightweight schema fallback.
      if (speedMode === 'fast' && !isAssistantStudio) {
        return buildSchemaFallback(responseSchema, retryText || text || '');
      }
      // Final fallback: force a SHORTER JSON re-emit. This is specifically for truncation
      // where even the first re-emit attempt was cut off.
      const msg2 = String(err2?.message || err2 || 'Invalid JSON');
      const fallbackPrompt =
        `The JSON is STILL invalid after a repair attempt (error: ${msg2}).\n\n` +
        `Re-emit a SHORTER JSON that fits within limits while preserving the schema.\n` +
        `Hard requirements:\n` +
        `- JSON ONLY (no markdown, no prose).\n` +
        `- MUST be complete and MUST end with } or ].\n` +
        `- Preserve the provided schema exactly.\n` +
        `- Shorten all strings aggressively (especially transition_notes).\n` +
        `- If segments are part of the schema, keep them minimal and concise.\n\n` +
        `Here is the last invalid output (for reference):\n` +
        `${clampForPrompt(retryText || text || '', 6000)}\n\n` +
        `Now output the corrected SHORTER JSON only.`;

      const fallbackBody: GeminiGenerateBody = {
        model,
        contents: [{ role: 'user', parts: [{ text: fallbackPrompt }] }],
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema,
          maxOutputTokens: 4096,
        },
      };

      const fallbackResult = await postJson<any>('/api/generate', fallbackBody, currentUser, options?.extraHeaders, { timeoutMs: 90000, retries: 1 });
      const fallbackText = extractText(fallbackResult);
      try {
        return safeJsonParse(fallbackText || '{}');
      } catch (err3: any) {
        if (isAssistantStudioStructuredRequest(prompt, systemInstruction)) {
          throw new Error(`Assistant Studio JSON parse failed after final repair attempt: ${String(err3?.message || err3 || 'Invalid JSON')}`);
        }
        return buildSchemaFallback(responseSchema, fallbackText || retryText || text || '');
      }
    }
  }
};

export const identifyTrickFromImage = async (
  base64ImageData: string,
  mimeType: string,
  currentUser?: User
): Promise<TrickIdentificationResult> => {
  // IMPORTANT:
  // Do NOT ask the model for direct YouTube URLs.
  // Models frequently hallucinate links. Instead, request 3 *search queries*.
  // We then look up real, current videos via the YouTube Data API.
  const prompt =
    "Identify this magic trick based on the image provided. " +
    "Return JSON with: (1) trickName and (2) videoQueries: 3 concise YouTube search queries " +
    "that will likely find real performance examples (no URLs).";

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      trickName: { type: Type.STRING },
      videoQueries: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
      },
    },
    required: ['trickName', 'videoQueries']
  };

  const body: GeminiGenerateBody = {
    model,
    contents: {
      parts: [
        { text: prompt },
        { inlineData: { mimeType, data: base64ImageData } }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema,
    },
  };

  const result = await postJson<any>('/api/generate', body, currentUser);
  const text = extractText(result);
  const parsed = JSON.parse(text || '{}') as any;

  const trickName: string = String(parsed?.trickName || '').trim() || 'Unknown Trick';
  const videoQueriesRaw: any[] = Array.isArray(parsed?.videoQueries) ? parsed.videoQueries : [];
  const videoQueries: string[] = videoQueriesRaw
    .map((q) => String(q || '').trim())
    .filter(Boolean)
    .slice(0, 3);

  // Fallback queries if the model returns nothing useful.
  const fallbackQueries = [
    `${trickName} magic trick performance`,
    `${trickName} illusion on stage performance`,
    `${trickName} magic trick live show`,
  ];

  const queriesToUse = videoQueries.length ? videoQueries : fallbackQueries;

  // Look up real YouTube videos. This does NOT consume AI quota.
  let videos: Array<{ title: string; url: string }> = [];
  try {
    const yt = await postJson<any>(
      '/api/videoSearch',
      { queries: queriesToUse, maxResultsPerQuery: 3, safeSearch: 'strict' },
      currentUser
    );
    const ytVideos = Array.isArray(yt?.videos) ? yt.videos : [];
    videos = ytVideos
      .map((v: any) => ({ title: String(v?.title || '').trim(), url: String(v?.url || '').trim() }))
      .filter((v: any) => v.title && v.url)
      .slice(0, 3);
  } catch {
    // If YouTube API fails (quota/network), keep a safe fallback:
    // provide YouTube search links that will always work.
    videos = queriesToUse.slice(0, 3).map((q) => ({
      title: `Search YouTube: ${q}`,
      url: `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
    }));
  }

  return { trickName, videoExamples: videos } as TrickIdentificationResult;
};

type LiveCallbacks = {
  onopen?: () => void;
  onmessage?: (message: any) => void;
  onerror?: (e: any) => void;
  onclose?: (e: any) => void;
};

// Google rotates preview suffixes; keep a short list of likely working models.
// (Used for display only until we ship an ephemeral-token broker.)
const LIVE_MODEL_CANDIDATES = [
  'gemini-2.5-flash-native-audio-preview-12-2025',
  'gemini-2.5-flash-native-audio-preview-09-2025',
];

/**
 * Start a Gemini Live (native audio) session.
 *
 * Production baseline:
 * - Disabled until we add a server-side ephemeral token broker.
 * - This prevents exposing any Google AI keys in the client bundle.
 */
export async function startLiveSession(
  systemInstruction: string,
  callbacks: LiveCallbacks,
  tools?: any
): Promise<LiveSession> {
  void systemInstruction;
  void tools;

  // Lightweight local session shim:
  // - allows the Live Rehearsal UI to open and capture real microphone audio
  // - preserves existing startup diagnostics from getUserMedia()
  // - keeps the review flow working even when a native Gemini Live broker is not configured
  //
  // Notes:
  // - sendRealtimeInput / sendToolResponse are no-ops in this fallback session
  // - final coaching still comes from the existing transcript/review pipeline
  // - if/when a server-side broker is added, this function can be swapped to a real live transport
  const session: LiveSession = {
    sendRealtimeInput: (_payload: any) => {
      void _payload;
    },
    sendToolResponse: (_payload: any) => {
      void _payload;
    },
    close: () => {
      try {
        callbacks.onclose?.({ reason: 'local-session-closed' });
      } catch {
        // ignore
      }
    },
  };

  await Promise.resolve();
  callbacks.onopen?.();
  return session;
}

// Optional helper for UI display/diagnostics.
export function getLikelyLiveAudioModels(): string[] {
  return [...LIVE_MODEL_CANDIDATES];
}

// Minimal helper used by LiveRehearsal.tsx. This implementation assumes raw PCM16.
// If you re-enable live audio, you may want a more robust decoder.
export async function decodeAudioData(
  bytes: Uint8Array,
  ctx: AudioContext,
  sampleRate = 24000,
  channels = 1
): Promise<AudioBuffer> {
  // Convert signed 16-bit PCM to Float32
  const int16 = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;

  const buffer = ctx.createBuffer(channels, float32.length, sampleRate);
  buffer.getChannelData(0).set(float32);
  return buffer;
}

export function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

export function encode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// --- Image + News helpers (serverless) ---

/**
 * Generate an image using the serverless Imagen endpoint.
 * Returns a data URL you can drop directly into an <img src="..." />.
 */
export const generateImage = async (
  prompt: string,
  aspectRatio: "1:1" | "3:4" | "4:3" | "9:16" | "16:9" = "1:1",
  currentUser?: User
): Promise<string> => {
  const result = await postJson<any>(
    '/api/generate-images',
    { prompt, aspectRatio },
    currentUser
  );

  // Try common response shapes
  const img = result?.generatedImages?.[0] || result?.images?.[0] || result?.data?.[0];
  const base64 =
    img?.image?.imageBytes ||
    img?.imageBytes ||
    img?.b64_json ||
    img?.base64;
  const mime = img?.mimeType || img?.mime || 'image/jpeg';

  if (typeof base64 === 'string' && base64.length > 0) {
    return `data:${mime};base64,${base64}`;
  }

  throw new Error('No image data returned from /api/generate-images.');
};

/**
 * Generate multiple images (variations) using the serverless Imagen endpoint.
 * Returns an array of data URLs you can drop directly into an <img src="..." />.
 */
export const generateImages = async (
  prompt: string,
  aspectRatio: "1:1" | "3:4" | "4:3" | "9:16" | "16:9" = "1:1",
  count: number = 4,
  currentUser?: User
): Promise<string[]> => {
  const safeCount = Math.max(1, Math.min(4, Math.floor(Number(count) || 1)));

  const result = await postJson<any>(
    '/api/generate-images',
    { prompt, aspectRatio, count: safeCount },
    currentUser
  );

  const imgs = result?.generatedImages || result?.images || result?.data;
  if (!Array.isArray(imgs) || imgs.length === 0) {
    throw new Error('No image data returned from /api/generate-images.');
  }

  const out: string[] = [];
  for (const img of imgs.slice(0, safeCount)) {
    const base64 =
      img?.image?.imageBytes ||
      img?.imageBytes ||
      img?.b64_json ||
      img?.base64;
    const mime = img?.mimeType || img?.mime || 'image/jpeg';
    if (typeof base64 === 'string' && base64.length > 0) {
      out.push(`data:${mime};base64,${base64}`);
    }
  }

  if (out.length === 0) {
    throw new Error('No image data returned from /api/generate-images.');
  }

  return out;
};

/**
 * Image editing is not wired through a serverless route yet.
 * Keep the API surface so the app compiles, but fail gracefully.
 */
export const editImageWithPrompt = async (
  base64ImageData: string,
  mimeType: string,
  prompt: string,
  currentUser?: User
): Promise<string> => {
  const result = await postJson<any>(
    '/api/edit-images',
    { imageBase64: base64ImageData, mimeType, prompt },
    currentUser
  );

  // Try common response shapes
  const img = result?.generatedImages?.[0] || result?.images?.[0] || result?.data?.[0];
  const base64 =
    img?.image?.imageBytes ||
    img?.imageBytes ||
    img?.b64_json ||
    img?.base64;
  const mime = img?.mimeType || img?.mime || 'image/jpeg';

  if (typeof base64 === 'string' && base64.length > 0) {
    return `data:${mime};base64,${base64}`;
  }

  throw new Error('No image data returned from /api/edit-images.');
};

/**
 * Generate a single fictional news article for the Magic Wire.
 */
export const generateNewsArticle = async (currentUser?: User): Promise<any> => {
  const prompt = "Generate a single magic news article for the 'Magic Wire' feed. Return as JSON. If you reference a real public source, include its URL in sourceUrl; otherwise omit sourceUrl.";
  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      category: { type: Type.STRING },
      headline: { type: Type.STRING },
      source: { type: Type.STRING },
      sourceUrl: { type: Type.STRING },
      summary: { type: Type.STRING },
      body: { type: Type.STRING },
    },
    required: ['category', 'headline', 'source', 'summary', 'body']
  };

  return generateStructuredResponse(
    prompt,
    'You are the Magic Wire editor. Write engaging, plausible-sounding magic industry news. Keep it safe and family-friendly.',
    responseSchema,
    currentUser
  );
};

/**
 * Generate multiple fictional news articles for the Magic Wire in ONE server call.
 * This is much more reliable than firing many parallel requests (burst limits / timeouts).
 */
export const generateMagicWireFeed = async (count: number): Promise<any[]> => {
  const safeCount = Math.max(1, Math.min(12, Math.floor(count || 1)));

  // Magic Wire is now sourced from server-side RSS aggregation (no AI dependency).
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`/api/magicWire?count=${safeCount}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const text = await res.text();
  if (!res.ok) throw new Error(text || `Request failed (${res.status})`);

  return JSON.parse(text);
};


export { Modality, Type };