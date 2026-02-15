// services/identifyService.ts
//
// Identify a trick via server-side vision + video enrichment.
// Keeps ALL provider keys server-side.
// UI components should call this (or still call geminiService.identifyTrickFromImage if you prefer).

import type { User, TrickIdentificationResult } from "../types";
import { aiIdentify } from "./aiProxy";

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
  currentUser?: User
): Promise<TrickIdentificationResult> {
  const dataUrl = base64ImageData.startsWith("data:")
    ? base64ImageData
    : `data:${mimeType || "image/jpeg"};base64,${base64ImageData}`;

  const prompt =
    "Identify this magic trick based on the image provided. " +
    "Return ONLY valid JSON with keys: trickName (string) and videoQueries (array of 3 concise YouTube search queries, NO URLs).";

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

  return { trickName, videoExamples: videos } as TrickIdentificationResult;
}
