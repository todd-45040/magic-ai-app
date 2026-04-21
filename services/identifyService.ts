// services/identifyService.ts
//
// Identify a trick via server-side vision + video enrichment.
// Keeps ALL provider keys server-side.
// UI components should call this (or still call geminiService.identifyTrickFromImage if you prefer).

import type { User, TrickIdentificationResult, TrickPerformanceReference } from "../types";
import { aiIdentify, aiJson } from "./aiProxy";
import { supabase } from "../supabase";

type Video = TrickPerformanceReference & { sourceQuery?: string; sourceQueryIndex?: number; score?: number };

async function getBearerToken(): Promise<string> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    return token ? `Bearer ${token}` : 'Bearer guest';
  } catch {
    return 'Bearer guest';
  }
}

async function postJson<T>(url: string, body: any): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": await getBearerToken(),
    },
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
  currentUser?: User
): Promise<TrickIdentificationResult> {
  const dataUrl = base64ImageData.startsWith("data:")
    ? base64ImageData
    : `data:${mimeType || "image/jpeg"};base64,${base64ImageData}`;

  const prompt =
    "Identify this magic trick based on the image provided. " +
    "Return ONLY valid JSON with keys:\n" +
    "- trickName (string)\n" +
    "- confidence (string: High|Medium|Low)\n" +
    "- summary (string, 1-2 sentences)\n" +
    "- observations (array of 3-6 short bullets describing what you see: props, staging, tells; NO exposure)\n" +
    "- likelyEffectPlot (string, 2-4 sentences; performance-safe; NO exposure)\n" +
    "- performanceStructure (array of 3-6 bullets; beats/flow; performance-safe)\n" +
    "- presentationIdeas (array of 3-6 bullets; performance-safe)\n" +
    "- angleRiskNotes (array of 3-6 bullets; sightlines/reset/handling cautions; NO exposure)\n" +
    "- variations (array of 3-6 bullets; alternate plots/presentations; performance-safe)\n" +
    "- videoQueries (array of exactly 3 concise YouTube search queries, NO URLs)\n" +
    "For videoQueries, follow this exact pattern:\n" +
    "1. query 1 = a narrow query likely to find ONE specific performance video of this trick\n" +
    "2. query 2 = a different narrow query likely to find an alternate specific performance video\n" +
    "3. query 3 = a broader query meant for general YouTube search results\n" +
    "Do NOT make all three queries broad. The first two should try to surface direct performance videos. The third should be exploratory.";

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
    `${trickName} magician live performance`,
    `${trickName} magic routine performance`,
    `${trickName} magic performance`,
  ];

  const queriesToUse = [
    queries[0] || fallbackQueries[0],
    queries[1] || fallbackQueries[1],
    queries[2] || fallbackQueries[2],
  ].slice(0, 3);

  const makeYoutubeSearchUrl = (query: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;

  let videos: Video[] = [];
  try {
    const yt = await postJson<any>("/api/videoSearch", {
      queries: queriesToUse,
      maxResultsPerQuery: 4,
      safeSearch: "strict",
    });

    const ytVideos = Array.isArray(yt?.videos) ? yt.videos : [];
    const normalized: Video[] = ytVideos
      .map((v: any) => ({
        title: String(v?.title || "").trim(),
        url: String(v?.url || "").trim(),
        videoId: String(v?.videoId || "").trim() || undefined,
        channelTitle: String(v?.channelTitle || "").trim() || undefined,
        sourceQuery: String(v?.sourceQuery || "").trim() || undefined,
        sourceQueryIndex: Number.isFinite(Number(v?.sourceQueryIndex)) ? Number(v.sourceQueryIndex) : undefined,
        score: Number.isFinite(Number(v?.score)) ? Number(v.score) : undefined,
        kind: 'specific' as const,
        platform: 'youtube' as const,
      }))
      .filter((v: Video) => v.title && v.url && /youtube\.com\/watch|youtu\.be\//i.test(v.url));

    const used = new Set<string>();
    const specificRefs: TrickPerformanceReference[] = [];

    const pickForQuery = (queryIndex: number) =>
      normalized.find((candidate: Video) => {
        if (candidate.sourceQueryIndex !== queryIndex) return false;
        if (!candidate.url || used.has(candidate.url)) return false;
        return true;
      });

    for (const queryIndex of [0, 1]) {
      const preferred = pickForQuery(queryIndex);
      if (preferred?.url) {
        used.add(preferred.url);
        specificRefs.push({
          title: preferred.title,
          url: preferred.url,
          kind: 'specific',
          platform: 'youtube',
          channelTitle: preferred.channelTitle,
          videoId: preferred.videoId,
        });
      }
    }

    if (specificRefs.length < 2) {
      for (const candidate of normalized) {
        if (!candidate?.url || used.has(candidate.url)) continue;
        used.add(candidate.url);
        specificRefs.push({
          title: candidate.title,
          url: candidate.url,
          kind: 'specific',
          platform: 'youtube',
          channelTitle: candidate.channelTitle,
          videoId: candidate.videoId,
        });
        if (specificRefs.length >= 2) break;
      }
    }

    const specificQuery1 = queriesToUse[0] || `${trickName} magician live performance`;
    const specificQuery2 = queriesToUse[1] || `${trickName} magic routine performance`;
    while (specificRefs.length < 2) {
      const fallbackQuery = specificRefs.length === 0 ? specificQuery1 : specificQuery2;
      const label = specificRefs.length === 0 ? 'Watch performances on YouTube' : 'Watch alternate performances on YouTube';
      specificRefs.push({
        title: `${label}: ${fallbackQuery}`,
        url: makeYoutubeSearchUrl(fallbackQuery),
        kind: 'specific',
        platform: 'youtube',
      });
    }

    const broadQuery = queriesToUse[2] || queriesToUse[0] || `${trickName} magic performance`;
    const searchRef: TrickPerformanceReference = {
      title: `Explore on YouTube: ${broadQuery}`,
      url: makeYoutubeSearchUrl(broadQuery),
      kind: 'search',
      platform: 'youtube',
    };

    videos = [...specificRefs.slice(0, 2), searchRef];
  } catch {
    videos = [
      {
        title: `Watch performances on YouTube: ${queriesToUse[0]}`,
        url: makeYoutubeSearchUrl(queriesToUse[0]),
        kind: 'specific',
        platform: 'youtube',
      },
      {
        title: `Watch alternate performances on YouTube: ${queriesToUse[1]}`,
        url: makeYoutubeSearchUrl(queriesToUse[1]),
        kind: 'specific',
        platform: 'youtube',
      },
      {
        title: `Explore on YouTube: ${queriesToUse[2]}`,
        url: makeYoutubeSearchUrl(queriesToUse[2]),
        kind: 'search',
        platform: 'youtube',
      },
    ];
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
