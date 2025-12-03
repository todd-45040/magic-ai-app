import { GoogleGenAI, LiveServerMessage, Modality, Blob, Type, FunctionDeclaration, GenerateContentResponse, GenerateImagesResponse } from "@google/genai";
import { MAGICIAN_SYSTEM_INSTRUCTION, MAGIC_NEWS_SYSTEM_INSTRUCTION } from '../constants';
import type { ChatMessage, TrickIdentificationResult, NewsArticle } from '../types';

// NOTE: The Live API (WebSockets) still requires the key in the browser for now 
// as standard serverless functions cannot easily proxy persistent WebSocket connections.
// For all other features (Text, Image, Vision), we use the secure /api proxy.
const API_KEY = process.env.API_KEY;

// Helper to ensure we have a non-null instance for TypeScript type inference
const typeClient = new GoogleGenAI({ apiKey: "TYPE_INFERENCE" });
type LiveSessionPromise = ReturnType<typeof typeClient.live.connect>;
export type LiveSession = LiveSessionPromise extends Promise<infer U> ? U : never;

// Only initialize the SDK locally for Live API usage if the key is present
const liveAiClient = API_KEY ? new GoogleGenAI({ apiKey: API_KEY }) : null;

// --- Resiliency: Retry Logic with Exponential Backoff ---
const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;

const withRetry = async <T>(apiCall: () => Promise<T>): Promise<T> => {
    let lastError: any;
    for (let i = 0; i < MAX_RETRIES; i++) {
        try {
            return await apiCall();
        } catch (error: any) {
            lastError = error;
            const isRetriable = !error.status || (error.status >= 500 && error.status < 600);
            
            if (isRetriable && i < MAX_RETRIES - 1) {
                const delay = INITIAL_DELAY_MS * Math.pow(2, i);
                console.warn(`API call failed, retrying in ${delay}ms... (Attempt ${i + 1})`, error);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                console.error(`API call failed after ${i + 1} attempts.`, error);
                throw error; 
            }
        }
    }
    throw lastError; 
};

// --- Secure Backend Fetch Helper ---
const fetchFromBackend = async (endpoint: string, body: any) => {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server error: ${response.status}`);
    }

    return await response.json();
};

// Helper to extract text from raw JSON response (since we lose SDK getter methods over HTTP)
const extractTextFromRawResponse = (response: any): string => {
    return response.candidates?.[0]?.content?.parts?.[0]?.text || "";
};

export const generateResponse = async (prompt: string, systemInstruction: string, history?: ChatMessage[]): Promise<string> => {
  const modelName = systemInstruction === MAGICIAN_SYSTEM_INSTRUCTION
    ? 'gemini-2.5-pro'
    : 'gemini-2.5-flash';

  let contents;

  if (history) {
    contents = [
      ...history.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.text }]
      })),
      { role: 'user', parts: [{ text: prompt }] }
    ];
  } else {
    contents = [{ role: 'user', parts: [{ text: prompt }] }];
  }

  try {
    const result = await withRetry(() => fetchFromBackend('/api/generate', {
        model: modelName,
        contents,
        config: { systemInstruction }
    }));
    return extractTextFromRawResponse(result);
  } catch (error) {
    console.error("Error generating response:", error);
    return "An error occurred while communicating with the AI. Please ensure your API key is set up correctly in the backend.";
  }
};

export const generateStructuredResponse = async (prompt: string, systemInstruction: string, responseSchema: any): Promise<any> => {
    try {
        const result = await withRetry(() => fetchFromBackend('/api/generate', {
            model: 'gemini-2.5-flash',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json",
                responseSchema,
            },
        }));

        const text = extractTextFromRawResponse(result);
        return JSON.parse(text);
    } catch (error) {
        console.error("Error generating structured response:", error);
        throw new Error("Failed to generate a structured response from the AI.");
    }
};


// --- Image Identification ---
export const identifyTrickFromImage = async (base64ImageData: string, mimeType: string): Promise<TrickIdentificationResult> => {
  const modelName = 'gemini-2.5-flash';
  const prompt = "You are a magic expert. Analyze the provided image of a magic trick. Based on the props, setup, and action depicted, identify the common name of the trick. Then, find up to three publicly available YouTube video links showcasing performances of this effect. Provide the response as a JSON object.";

  const imagePart = { inlineData: { mimeType, data: base64ImageData } };
  const textPart = { text: prompt };

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      trickName: { type: Type.STRING, description: "The common name of the magic trick." },
      videoExamples: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { title: { type: Type.STRING }, url: { type: Type.STRING } }, required: ['title', 'url'] } }
    },
    required: ['trickName', 'videoExamples']
  };

  try {
    const result = await withRetry(() => fetchFromBackend('/api/generate', {
        model: modelName,
        contents: { parts: [textPart, imagePart] },
        config: { responseMimeType: "application/json", responseSchema }
    }));
    
    const text = extractTextFromRawResponse(result);
    return JSON.parse(text) as TrickIdentificationResult;

  } catch (error) {
    console.error("Error identifying trick from image:", error);
    throw new Error("Failed to identify the trick. The image might be unclear.");
  }
};


// --- Image Generation ---
export const generateImage = async (prompt: string, aspectRatio: '1:1' | '16:9' | '9:16'): Promise<string> => {
  try {
    const response = await withRetry(() => fetchFromBackend('/api/generate-images', {
        prompt,
        aspectRatio
    }));

    const base64ImageBytes = response.generatedImages?.[0]?.image?.imageBytes;
    if (!base64ImageBytes) throw new Error("No image returned from API");
    
    return `data:image/jpeg;base64,${base64ImageBytes}`;
  } catch (error) {
    console.error("Error generating image:", error);
    throw new Error("Failed to generate image.");
  }
};

// --- Image Editing ---
export const editImageWithPrompt = async (base64ImageData: string, mimeType: string, prompt: string): Promise<string> => {
  const modelName = 'gemini-2.5-flash-image';
  const imagePart = { inlineData: { mimeType, data: base64ImageData } };
  const textPart = { text: prompt };

  try {
    // Editing uses generateContent (multimodal), not generateImages
    const result = await withRetry(() => fetchFromBackend('/api/generate', {
        model: modelName,
        contents: { parts: [imagePart, textPart] },
        config: { responseModalities: [Modality.IMAGE] }
    }));
    
    const parts = result.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData) {
        const base64ImageBytes = part.inlineData.data;
        const responseMimeType = part.inlineData.mimeType;
        return `data:${responseMimeType};base64,${base64ImageBytes}`;
      }
    }
    
    throw new Error("The AI did not return an image.");

  } catch (error) {
    console.error("Error editing image:", error);
    throw new Error("Failed to edit image.");
  }
};


// --- Live Session additions ---
// NOTE: Live Session relies on direct WebSocket connection which cannot be easily
// proxied via serverless functions. This part remains client-side.

export function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export const startLiveSession = (
  systemInstruction: string,
  callbacks: {
    onopen: () => void;
    onmessage: (message: LiveServerMessage) => void;
    onerror: (e: ErrorEvent) => void;
    onclose: (e: CloseEvent) => void;
  },
  tools?: { functionDeclarations: FunctionDeclaration[] }[]
): Promise<LiveSession> => {
  if (!liveAiClient) {
      throw new Error("Live API requires API_KEY to be present in client environment variables for this beta feature.");
  }
  
  const sessionPromise = liveAiClient.live.connect({
    model: 'gemini-2.5-flash-native-audio-preview-09-2025',
    callbacks,
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
      },
      systemInstruction: systemInstruction,
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      tools,
    },
  });

  return sessionPromise;
};

// --- Magic Wire News Feed Generation ---
const NEWS_GENERATION_PROMPTS: string[] = [
    "Write a short news article about a new, groundbreaking magic effect that was just released by a famous (but fictional) creator. Give it a catchy name.",
    "Write a brief, insightful interview with a fictional, legendary magician about their creative process and their advice for aspiring performers.",
    "Write a critical but fair review of a new, fictional magic book on advanced card technique. Mention its strengths and weaknesses.",
    "Write a news report about a major fictional magic convention that just concluded, highlighting the winners of the close-up and stage competitions.",
    "Write an opinion piece from the perspective of a seasoned magician about the impact of social media on the art of magic.",
    "Write a historical piece about the life and influence of a lesser-known but important (and fictional) magical figure from the early 20th century."
];

export const generateNewsArticle = async (): Promise<Omit<NewsArticle, 'id' | 'timestamp'>> => {
    const prompt = NEWS_GENERATION_PROMPTS[Math.floor(Math.random() * NEWS_GENERATION_PROMPTS.length)];

    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            category: { type: Type.STRING, enum: ['New Release', 'Interview', 'Review', 'Community News', 'Opinion', 'Historical Piece'] },
            headline: { type: Type.STRING },
            source: { type: Type.STRING },
            summary: { type: Type.STRING },
            body: { type: Type.STRING }
        },
        required: ['category', 'headline', 'source', 'summary', 'body']
    };

    try {
        const result = await withRetry(() => fetchFromBackend('/api/generate', {
            model: 'gemini-2.5-pro',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
                systemInstruction: MAGIC_NEWS_SYSTEM_INSTRUCTION,
                responseMimeType: "application/json",
                responseSchema,
            },
        }));

        const text = extractTextFromRawResponse(result);
        return JSON.parse(text) as Omit<NewsArticle, 'id' | 'timestamp'>;

    } catch (error) {
        console.error("Error generating news article:", error);
        throw new Error("Failed to generate a news article from the AI.");
    }
};

// Export the 'ai' instance for compatibility with existing components that might import it directly,
// although they should be refactored to use the service methods.
export const ai = liveAiClient || new GoogleGenAI({ apiKey: "SERVER_SIDE_ONLY" });
