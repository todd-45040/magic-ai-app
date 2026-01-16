import { GoogleGenAI, Type, Modality } from "@google/genai";
import { supabase } from '../supabase';
import type { ChatMessage, TrickIdentificationResult, User } from '../types';
import { getAiProvider } from './aiProviderService';

// Keep this type export for components that reference live sessions.
// Live sessions are currently not enabled through the serverless proxy.
export type LiveSession = any;

/**
 * IMPORTANT (Blank-screen fix):
 * We no longer instantiate GoogleGenAI in the browser at module load.
 * If the API key is missing/empty, some SDK versions can throw during init,
 * crashing the app before React mounts (dark blank background).
 *
 * Instead, all AI calls go through serverless endpoints (Vercel /api/*).
 * Your Gemini API key must be configured on the SERVER as API_KEY.
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

async function postJson<T>(url: string, body: any, currentUser?: User): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': await getBearerToken(),
      'X-AI-Provider': getAiProvider(),
    },
    body: JSON.stringify(body),
  });


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
    throw new Error(message);
  }

  return json as T;
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
  history?: ChatMessage[]
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
    const result = await postJson<any>('/api/generate', body, currentUser);
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
  currentUser?: User
): Promise<any> => {
  const body: GeminiGenerateBody = {
    model: 'gemini-3-flash-preview',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema,
    },
  };

  const result = await postJson<any>('/api/generate', body, currentUser);
  const text = extractText(result);
  return JSON.parse(text || '{}');
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
    model: 'gemini-3-flash-preview',
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

// Keep a stable list of candidates. Google rotates preview suffixes.
// Docs + pricing currently reference the 12-2025 native-audio preview.
const LIVE_MODEL_CANDIDATES = [
  'gemini-2.5-flash-native-audio-preview-12-2025',
  'gemini-2.5-flash-native-audio-preview-09-2025',
];

function getLiveApiKey(): string {
  const liveKey = (import.meta as any)?.env?.VITE_GEMINI_LIVE_API_KEY;
  const fallback = (import.meta as any)?.env?.VITE_GEMINI_API_KEY;
  const key = String(liveKey || fallback || '').trim();
  if (!key) {
    throw new Error(
      'Live Rehearsal is not configured: missing VITE_GEMINI_LIVE_API_KEY. Add it to your Vercel env and redeploy.'
    );
  }
  return key;
}

/**
 * Attempts to open a Live API session using the best available native-audio model.
 * If the first model fails due to model availability or access gating, it tries fallbacks.
 */
export async function startLiveSession(
  systemInstruction: string,
  callbacks: LiveCallbacks,
  tools?: any
): Promise<LiveSession> {
  const apiKey = getLiveApiKey();

  // Note: For production we should use ephemeral tokens instead of embedding an API key.
  // For Beta, this is acceptable while you validate product behavior.
  const ai = new GoogleGenAI({ apiKey } as any);

  let lastErr: any = null;
  for (const model of LIVE_MODEL_CANDIDATES) {
    try {
      const session = await (ai as any).live.connect({
        model,
        callbacks,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction,
          tools,
        },
      });
      (session as any).__liveModel = model;
      return session;
    } catch (e: any) {
      lastErr = e;
      // If the key is invalid, no need to try other models.
      const msg = String(e?.message || e || 'Live connect failed');
      if (/invalid api key|api key|unauthorized|401/i.test(msg)) break;
      // Otherwise try next model.
    }
  }

  const message = String(lastErr?.message || lastErr || 'Live connect failed');
  throw new Error(
    `Unable to start Live Rehearsal session. ${message}`
  );
}

/**
 * Best-effort helper for UI messaging. This does not guarantee access,
 * but reflects the most likely working models per official docs.
 */
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