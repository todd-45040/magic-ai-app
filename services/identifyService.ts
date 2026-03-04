// services/identifyService.ts
//
// Identify a trick via server-side vision + video enrichment.
// Keeps ALL provider keys server-side.
// UI components should call this (or still call geminiService.identifyTrickFromImage if you prefer).

import type { User, TrickIdentificationResult } from "../types";
import { aiIdentify, aiJson } from "./aiProxy";

type Video = { title: string; url: string };

async function postJson<T>(url: string, body: any): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await r.text();
  let parsed: any;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Non-JSON response (${r.status}): ${text.slice(0, 200)}`);
  }
  if (!r.ok) {
    throw new Error(parsed?.message || `Request failed (${r.status})`);
  }
  return parsed as T;
}

export async function identifyTrickFromImageServer(
  base64ImageData: string,
  mimeType: string,
  currentUser?: User,
  opts?: { context?: string; imageCount?: number; fileNames?: string[] }
): Promise<TrickIdentificationResult> {
  const dataUrl = base64ImageData.startsWith("data:")
    ? base64ImageData
    : `data:${mimeType || "image/jpeg"};base64,${base64ImageData}`;

  const contextLine = opts?.context?.trim()
    ? `\nPerformance context: ${opts.context.trim()}`
    : '';

  const imagesLine =
    opts?.imageCount && opts.imageCount > 1
      ? `\nAdditional note: User provided ${opts.imageCount} images (${(opts.fileNames || [])
          .slice(0, 5)
          .join(', ')}${(opts.fileNames || []).length > 5 ? '…' : ''}). Use the first image plus this note to improve identification.`
      : '';

  const prompt =
    "Identify this magic trick based on the image provided." +
    contextLine +
    imagesLine +
    "\n\nReturn ONLY valid JSON with keys:\n" +
    "- trickName (string)\n" +
    "- confidence (string: High|Medium|Low)\n" +
    "- summary (string, 1-2 sentences)\n" +
    "- observations (array of 3-6 short bullets describing what you see: props, staging, tells; NO exposure)\n" +
    "- likelyEffectPlot (string, 2-4 sentences; performance-safe; NO exposure)\n" +
    "- performanceStructure (array of 3-6 bullets; beats/flow; performance-safe)\n" +
    "- presentationIdeas (array of 3-6 bullets; performance-safe)\n" +
    "- angleRiskNotes (array of 3-6 bullets; sightlines/reset/handling cautions; NO exposure)\n" +
    "- variations (array of 3-6 bullets; alternate plots/presentations; performance-safe)\n" +
    "- videoQueries (array of 3 concise YouTube search queries, NO URLs).";

  // Optional: pass user id for rate limiting (best effort)
  const result = await aiIdentify<{ text: string }>(dataUrl, prompt);

  const rawText = String((result as any)?.text ?? "").trim();
  let parsed: any = null;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    const s = rawText.indexOf("{");
    const e = rawText.lastIndexOf("}");
    if (s >= 0 && e > s) {
      try { parsed = JSON.parse(rawText.slice(s, e + 1)); } catch { parsed = null; }
    }
  }

  const trickName: string = String(parsed?.trickName || "").trim() || "Unknown Trick";
  const confidenceRaw = String(parsed?.confidence || '').trim();
  const confidence: 'High' | 'Medium' | 'Low' | undefined =
    confidenceRaw === 'High' || confidenceRaw === 'Medium' || confidenceRaw === 'Low'
      ? (confidenceRaw as any)
      : undefined;

  const summary: string | undefined =
    String(parsed?.summary || '').trim() || undefined;

  const observations: string[] | undefined = Array.isArray(parsed?.observations)
    ? parsed.observations
        .map((x: any) => String(x || '').trim())
        .filter(Boolean)
        .slice(0, 8)
    : undefined;

  const likelyEffectPlot: string | undefined =
    String(parsed?.likelyEffectPlot || '').trim() || undefined;

  const performanceStructure: string[] | undefined = Array.isArray(parsed?.performanceStructure)
    ? parsed.performanceStructure
        .map((x: any) => String(x || '').trim())
        .filter(Boolean)
        .slice(0, 10)
    : undefined;

  const presentationIdeas: string[] | undefined = Array.isArray(parsed?.presentationIdeas)
    ? parsed.presentationIdeas
        .map((x: any) => String(x || '').trim())
        .filter(Boolean)
        .slice(0, 12)
    : undefined;

  const angleRiskNotes: string[] | undefined = Array.isArray(parsed?.angleRiskNotes)
    ? parsed.angleRiskNotes
        .map((x: any) => String(x || '').trim())
        .filter(Boolean)
        .slice(0, 12)
    : undefined;

  const variations: string[] | undefined = Array.isArray(parsed?.variations)
    ? parsed.variations
        .map((x: any) => String(x || '').trim())
        .filter(Boolean)
        .slice(0, 12)
    : undefined;
  const queries: string[] = Array.isArray(parsed?.videoQueries)
    ? parsed.videoQueries.map((q: any) => String(q || "").trim()).filter(Boolean).slice(0, 3)
    : [];

  const fallbackQueries = [
    `${trickName} magic trick performance`,
    `${trickName} illusion performance`,
    `${trickName} magic trick live show`,
  ];

  const queriesToUse = queries.length ? queries : fallbackQueries;

  let videos: Video[] = [];
  try {
    const yt = await postJson<any>("/api/videoSearch", {
      queries: queriesToUse,
      maxResultsPerQuery: 3,
      safeSearch: "strict",
    });

    const ytVideos = Array.isArray(yt?.videos) ? yt.videos : [];
    videos = ytVideos
      .map((v: any) => ({ title: String(v?.title || "").trim(), url: String(v?.url || "").trim() }))
      .filter((v: any) => v.title && v.url)
      .slice(0, 3);
  } catch {
    videos = queriesToUse.slice(0, 3).map((q) => ({
      title: `Search YouTube: ${q}`,
      url: `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
    }));
  }

  return {
    trickName,
    confidence,
    summary,
    observations,
    likelyEffectPlot,
    performanceStructure,
    presentationIdeas,
    angleRiskNotes,
    variations,
    raw: parsed,
    videoExamples: videos,
  } as TrickIdentificationResult;
}

type IdentifyRefineIntent =
  | 'clarify'
  | 'visual'
  | 'comedy'
  | 'mentalism'
  | 'practical'
  | 'safer_angles';

function refineInstruction(intent: IdentifyRefineIntent): string {
  switch (intent) {
    case 'clarify':
      return 'Tighten the description. Reduce ambiguity. Make the plot and effect clearer in performance-safe language.';
    case 'visual':
      return 'Make the presentation more visual and clear for the audience. Add vivid staging/visual beats without exposing methods.';
    case 'comedy':
      return 'Add tasteful comedic framing, lines, and audience interaction beats while keeping the core effect the same.';
    case 'mentalism':
      return 'Shift framing toward mentalism-style presentation (psychological/reading/intuition) while keeping it performance-safe and non-exposure.';
    case 'practical':
      return 'Improve practicality: reset, pocket management, venue suitability, clarity of instructions for the performer (NO methods).';
    case 'safer_angles':
      return 'Focus on making it safer for angles/sightlines and real-world performance conditions. Provide risk notes and blocking tips (NO exposure).';
    default:
      return 'Refine the output while keeping the same core effect.';
  }
}

/**
 * Refine an Identify-a-Trick result WITHOUT re-identifying the trick.
 * We pass the original result JSON and apply controlled mutation per intent.
 * Output must remain performance-safe and non-exposure.
 */
export async function refineIdentifyResult(
  original: TrickIdentificationResult,
  intent: IdentifyRefineIntent
): Promise<TrickIdentificationResult> {
  const originalJson = original?.raw ?? {
    trickName: original.trickName,
    confidence: original.confidence,
    summary: original.summary,
    observations: original.observations,
    likelyEffectPlot: original.likelyEffectPlot,
    performanceStructure: original.performanceStructure,
    presentationIdeas: original.presentationIdeas,
    angleRiskNotes: original.angleRiskNotes,
    variations: original.variations,
  };

  const instruction = refineInstruction(intent);

  const prompt =
    'You are refining an existing Identify-a-Trick analysis. DO NOT re-identify a new trick.\n' +
    'Non-negotiable rules:\n' +
    '- NO exposure: do not explain secret methods, gimmicks, sleights, stacks, or construction.\n' +
    '- Keep the same core effect/trick name unless the original is clearly "Unknown Trick".\n' +
    '- Preserve the overall structure and improve/extend the content per the refine intent.\n\n' +
    'REFINE INTENT:\n' +
    instruction +
    '\n\n' +
    'ORIGINAL RESULT JSON:\n' +
    JSON.stringify(originalJson, null, 2) +
    '\n\n' +
    'Return ONLY valid JSON with keys:\n' +
    '- trickName (string)\n' +
    '- confidence (string: High|Medium|Low)\n' +
    '- summary (string, 1-2 sentences)\n' +
    '- observations (array of 3-8 short bullets; what you see; NO exposure)\n' +
    '- likelyEffectPlot (string, 2-6 sentences; performance-safe; NO exposure)\n' +
    '- performanceStructure (array of 3-10 bullets; beats/flow)\n' +
    '- presentationIdeas (array of 3-12 bullets)\n' +
    '- angleRiskNotes (array of 3-12 bullets; sightlines/reset/handling cautions; NO exposure)\n' +
    '- variations (array of 3-12 bullets; alternate plots/presentations; performance-safe)';

  const json = await aiJson<any>(prompt);

  const trickName: string = String(json?.trickName || original.trickName || '').trim() || 'Unknown Trick';
  const confidenceRaw = String(json?.confidence || original.confidence || '').trim();
  const confidence: 'High' | 'Medium' | 'Low' | undefined =
    confidenceRaw === 'High' || confidenceRaw === 'Medium' || confidenceRaw === 'Low'
      ? (confidenceRaw as any)
      : original.confidence;

  const summary: string | undefined = String(json?.summary || '').trim() || original.summary;

  const observations: string[] | undefined = Array.isArray(json?.observations)
    ? json.observations.map((x: any) => String(x || '').trim()).filter(Boolean).slice(0, 8)
    : original.observations;

  const likelyEffectPlot: string | undefined = String(json?.likelyEffectPlot || '').trim() || original.likelyEffectPlot;

  const performanceStructure: string[] | undefined = Array.isArray(json?.performanceStructure)
    ? json.performanceStructure.map((x: any) => String(x || '').trim()).filter(Boolean).slice(0, 10)
    : original.performanceStructure;

  const presentationIdeas: string[] | undefined = Array.isArray(json?.presentationIdeas)
    ? json.presentationIdeas.map((x: any) => String(x || '').trim()).filter(Boolean).slice(0, 12)
    : original.presentationIdeas;

  const angleRiskNotes: string[] | undefined = Array.isArray(json?.angleRiskNotes)
    ? json.angleRiskNotes.map((x: any) => String(x || '').trim()).filter(Boolean).slice(0, 12)
    : original.angleRiskNotes;

  const variations: string[] | undefined = Array.isArray(json?.variations)
    ? json.variations.map((x: any) => String(x || '').trim()).filter(Boolean).slice(0, 12)
    : original.variations;

  // Preserve videoExamples from original so refinement is fast and stable.
  return {
    trickName,
    confidence,
    summary,
    observations,
    likelyEffectPlot,
    performanceStructure,
    presentationIdeas,
    angleRiskNotes,
    variations,
    raw: json,
    videoExamples: original.videoExamples,
  } as TrickIdentificationResult;
}
