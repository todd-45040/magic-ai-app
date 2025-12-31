
import { GoogleGenAI, type LiveSession, Type } from "@google/genai";
import type { ChatMessage, TrickIdentificationResult, User, NewsArticle } from '../types';
import { MAGIC_NEWS_SYSTEM_INSTRUCTION } from '../constants';

export type { LiveSession };

// FIX: Export 'ai' so it can be used directly in components (MagicianMode, DirectorMode) as requested.
// Initializing using process.env.API_KEY directly as per the initialization guidelines.
export const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateResponse = async (
  prompt: string, 
  systemInstruction: string, 
  currentUser: User, 
  history?: ChatMessage[]
): Promise<string> => {
  try {
    const apiHistory = history?.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.text }]
    })) || [];

    const response = await ai.models.generateContent({
      model: systemInstruction.includes('creative partner') ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview',
      contents: [...apiHistory, { role: 'user', parts: [{ text: prompt }] }],
      config: { systemInstruction }
    });

    return response.text || "No response generated.";
  } catch (error: any) {
    console.error("AI Error:", error);
    return `Error: ${error.message || "Failed to connect to AI wizard."}`;
  }
};

export const generateStructuredResponse = async (
  prompt: string, 
  systemInstruction: string, 
  responseSchema: any, 
  currentUser: User
): Promise<any> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema,
      },
    });

    return JSON.parse(response.text || '{}');
  } catch (error) {
    console.error("Structured AI Error:", error);
    throw new Error("Failed to generate structured response.");
  }
};

export const identifyTrickFromImage = async (
  base64ImageData: string, 
  mimeType: string, 
  currentUser: User
): Promise<TrickIdentificationResult> => {
  const prompt = "You are a magic expert. Identify this trick based on the image provided and find 3 YouTube performance examples. Return as JSON.";
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

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { text: prompt },
          { inlineData: { mimeType, data: base64ImageData } }
        ]
      },
      config: { 
        responseMimeType: "application/json", 
        responseSchema 
      }
    });
    
    return JSON.parse(response.text || '{}') as TrickIdentificationResult;
  } catch (error) {
    console.error("Identify Trick Error:", error);
    throw new Error("Trick identification failed.");
  }
};

// FIX: Implement and export the missing 'generateNewsArticle' function required by MagicWire component.
export const generateNewsArticle = async (
  currentUser: User
): Promise<Omit<NewsArticle, 'id' | 'timestamp'>> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ role: 'user', parts: [{ text: "Generate a fictional but insightful magic industry news article." }] }],
      config: {
        systemInstruction: MAGIC_NEWS_SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            category: { 
              type: Type.STRING,
              enum: ['New Release', 'Interview', 'Review', 'Community News', 'Opinion', 'Historical Piece']
            },
            headline: { type: Type.STRING },
            source: { type: Type.STRING },
            summary: { type: Type.STRING },
            body: { type: Type.STRING },
          },
          required: ['category', 'headline', 'source', 'summary', 'body'],
        },
      },
    });

    return JSON.parse(response.text || '{}');
  } catch (error) {
    console.error("News Article Error:", error);
    throw new Error("Failed to generate magic news.");
  }
};

export const generateImage = async (
  prompt: string, 
  aspectRatio: '1:1' | '16:9' | '9:16', 
  currentUser: User
): Promise<string> => {
  try {
    const response = await ai.models.generateImages({
      model: 'imagen-4.0-generate-001',
      prompt,
      config: {
        numberOfImages: 1,
        outputMimeType: 'image/jpeg',
        aspectRatio,
      },
    });

    const base64 = response.generatedImages?.[0]?.image?.imageBytes;
    if (!base64) throw new Error("No image data returned.");
    return `data:image/jpeg;base64,${base64}`;
  } catch (error) {
    console.error("Image Gen Error:", error);
    throw new Error("Image conjuring failed.");
  }
};

export const editImageWithPrompt = async (
  base64ImageData: string, 
  mimeType: string, 
  prompt: string, 
  currentUser: User
): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          { inlineData: { mimeType, data: base64ImageData } },
          { text: prompt }
        ]
      }
    });
    
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image returned.");
  } catch (error) {
    console.error("Image Edit Error:", error);
    throw new Error("Image editing failed.");
  }
};

export const startLiveSession = (
  systemInstruction: string,
  callbacks: any,
  tools?: any
) => {
  return ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-preview-09-2025',
    callbacks,
    config: {
      responseModalities: ['AUDIO'],
      systemInstruction,
      tools,
    },
  });
};

export function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
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
