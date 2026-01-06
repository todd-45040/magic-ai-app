import { Type, Modality } from "@google/genai";
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
  const prompt = "Identify this magic trick based on the image provided and find 3 YouTube performance examples. Return as JSON.";

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      trickName: { type: Type.STRING },
      videoExamples: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            url: { type: Type.STRING }
          },
          required: ['title', 'url']
        }
      }
    },
    required: ['trickName', 'videoExamples']
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
  return JSON.parse(text || '{}') as TrickIdentificationResult;
};

export const startLiveSession = () => {
  // Live sessions are not supported through the simple /api proxy yet.
  // Keep the API surface so the app compiles, but fail gracefully.
  throw new Error('Live sessions are not configured for production yet.');
};

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
  _base64ImageData: string,
  _mimeType: string,
  _prompt: string,
  _currentUser?: User
): Promise<string> => {
  throw new Error('Image editing is not configured yet.');
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
export const generateMagicWireFeed = async (
  count: number,
  currentUser?: User
): Promise<any[]> => {
  const safeCount = Math.max(1, Math.min(12, Math.floor(count || 1)));
  const prompt = `Generate ${safeCount} DISTINCT magic news articles for the 'Magic Wire' feed.

Return ONLY a JSON array of ${safeCount} items.

Each item must include: category, headline, source, summary, body.
If you reference a real public source, include its URL in sourceUrl; otherwise omit sourceUrl.

Make the headlines varied (new releases, interviews, reviews, community news, opinions). Keep it safe and family-friendly.`;

  const itemSchema = {
    type: Type.OBJECT,
    properties: {
      category: { type: Type.STRING },
      headline: { type: Type.STRING },
      source: { type: Type.STRING },
      sourceUrl: { type: Type.STRING },
      summary: { type: Type.STRING },
      body: { type: Type.STRING },
    },
    required: ['category', 'headline', 'source', 'summary', 'body'],
  };

  const responseSchema = {
    type: Type.ARRAY,
    items: itemSchema,
  };

  const arr = await generateStructuredResponse(
    prompt,
    'You are the Magic Wire editor. Write engaging, plausible-sounding magic industry news. Keep it safe and family-friendly.',
    responseSchema,
    currentUser
  );

  return Array.isArray(arr) ? arr : [];
};

export { Modality, Type };