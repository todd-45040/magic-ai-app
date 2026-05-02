import React, { useEffect, useMemo, useRef, useState } from "react";
import { saveIdea } from "../services/ideasService";
import { supabase } from "../supabase";
import { trackClientEvent } from "../services/telemetryClient";
import { CohesionActions } from "./CohesionActions";
import SaveActionBar from "./shared/SaveActionBar";
import { BookIcon, WandIcon, CheckIcon, CopyIcon } from "./icons";
import type { User } from "../types";
import PipelineProgress from './PipelineProgress';
import { updatePipelineSession, trackPipelineAdvance } from '../services/pipelineSessionService';

interface PatterEngineProps {
  user: User;
  onIdeaSaved: () => void;
}

const TONES = ["Comedic", "Mysterious", "Dramatic", "Storytelling"] as const;
const PATTER_ENGINE_PREFILL_KEY = "maw_patter_engine_prefill_v1";
const SHOW_PLANNER_ROUTINE_HANDOFF_KEY = "maw_show_planner_routine_handoff_v1";


const LoadingIndicator: React.FC<{ statusText?: string }> = ({ statusText }) => (
  <div className="flex flex-col items-center justify-center text-center p-8">
    <div className="relative">
      <WandIcon className="w-16 h-16 text-purple-400 animate-pulse" />
      <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
        <div className="w-24 h-24 border-t-2 border-purple-300 rounded-full animate-spin" />
      </div>
    </div>
    <p className="text-slate-300 mt-4 text-lg">{statusText || "Writing your scripts..."}</p>
    <p className="text-slate-400 text-sm">Crafting the perfect words for your performance.</p>
  </div>
);

function extractGeminiText(data: any): string {
  const source = data?.data ?? data;
  const parts = source?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    return parts.map((p: any) => p?.text || "").join("").trim();
  }
  return String(source?.text || source?.output || "").trim();
}

const PatterEngine: React.FC<PatterEngineProps> = ({ user: _user, onIdeaSaved }) => {
  const [effectDescription, setEffectDescription] = useState("");
  const [selectedTones, setSelectedTones] = useState<string[]>(["Comedic", "Mysterious"]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [attemptedGenerate, setAttemptedGenerate] = useState(false);
  const [pipelineSource, setPipelineSource] = useState<any>(null);

  // Perceived speed: staged progress text while loading
  const [loadingStep, setLoadingStep] = useState(0);
  const loadingSteps = useMemo(
    () => ["Analyzing effect…", "Building beats…", "Writing 2–3 variations…", "Final polish…"],
    []
  );

  const topRef = useRef<HTMLDivElement | null>(null);

  const [saveStatus, setSaveStatus] = useState<"idle" | "saved">("idle");
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied">("idle");

  const canGenerate = effectDescription.trim().length > 20 && selectedTones.length > 0 && !isLoading;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PATTER_ENGINE_PREFILL_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== 1) {
        localStorage.removeItem(PATTER_ENGINE_PREFILL_KEY);
        return;
      }
      if (typeof parsed.effectDescription === 'string' && parsed.effectDescription.trim()) {
        setEffectDescription(parsed.effectDescription.trim());
      }
      if (Array.isArray(parsed.selectedTones) && parsed.selectedTones.length) {
        const tones = parsed.selectedTones.filter((tone: string) => TONES.includes(tone as any));
        if (tones.length) setSelectedTones(tones);
      }
      setPipelineSource(parsed);
      const pipeline = updatePipelineSession('script', {
        sourceType: parsed.source === 'visual_image' || parsed.visualSeed?.source === 'visual_image' ? 'image' : 'effect',
        title: parsed.effectTitle || 'Script draft',
        imageUrl: parsed.visualSeed?.imageUrl || undefined,
        prompt: parsed.visualSeed?.prompt || undefined,
        effect: parsed.effectDescription || null,
      });
      try { window.dispatchEvent(new CustomEvent('maw:pipeline-session-updated', { detail: pipeline })); } catch {}
      localStorage.removeItem(PATTER_ENGINE_PREFILL_KEY);
      void trackClientEvent({ tool: 'creative_pipeline', action: 'script_prefill_loaded', outcome: 'SUCCESS_NOT_CHARGED', metadata: { source: parsed.source || 'unknown', effectTitle: parsed.effectTitle || null } });
    } catch {
      // ignore prefill errors
    }
  }, []);


  const buildPrompt = (desc: string, tonesList: string[]) => {
    const tones = tonesList.join(", ");
    return `You are a professional magician and script writer.

Write TWO complete performance-ready patter scripts for the following effect.

Effect:
${desc}

Tone(s):
${tones}

REQUIREMENTS:
- Each variation must be a FULL SCRIPT, not bullet points
- Write exactly as a magician would speak on stage
- Include natural dialogue, audience interaction lines, pauses, pacing, and clear transitions between phases
- Include humor, tension, wonder, or emotional beats based on the selected tone(s)
- Give each script a strong opening hook, a build in the middle, a climax, and a memorable callback or ending
- Make each variation feel polished, performable, and distinct from the other
- Each variation should feel like 2–4 minutes of spoken performance
- Keep the total response compact enough for the app to render cleanly, but rich enough to feel like a real routine

STRUCTURE:
Variation A
[full script]

Variation B
[full script]

STYLE RULES:
- DO NOT write bullet points
- DO NOT summarize
- DO NOT explain the method
- DO NOT describe what the magician is doing mechanically unless it is part of the spoken presentation
- Write only the performer's spoken script plus light stage directions in parentheses when truly helpful
- No preamble before Variation A

Return plain text.`;
  };

  const handleToneToggle = (tone: string) => {
    setSelectedTones((prev) => (prev.includes(tone) ? prev.filter((t) => t !== tone) : [...prev, tone]));
  };

  const handleGenerate = async (override?: { description?: string; tones?: string[] }) => {
    setAttemptedGenerate(true);
    const desc = (override?.description ?? effectDescription).trim();
    const tones = override?.tones ?? selectedTones;

    if (!desc) {
      setError("Please describe the magic effect.");
      return;
    }
    if (desc.length <= 20) {
      setError("Please add a bit more detail (at least ~20 characters) for best results.");
      return;
    }
    if (tones.length === 0) {
      setError("Please select at least one tone.");
      return;
    }

    setIsLoading(true);
    const startedAt = Date.now();
    setError(null);
    setResult(null);
    void trackClientEvent({ tool: 'patter_engine', action: 'patter_generate_start', metadata: { tones, descriptionLength: desc.length } });
    setSaveStatus("idle");
    setCopyStatus("idle");

    try {
      // Critical: /api/generatePatter requires an auth header (Bearer token)
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        setError("Please log in to generate patter.");
        return;
      }

      // Client-side safety timeout (keeps demos snappy even if the network stalls)
      const controller = new AbortController();
      const abortTimer = window.setTimeout(() => controller.abort(), 55_000);

      let res: Response;
      try {
        res = await fetch(`/api/generatePatter?ts=${Date.now()}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
          body: JSON.stringify({
            messages: [
              {
                role: "user",
                content: buildPrompt(desc, tones),
              },
            ],
          }),
        });
      } finally {
        window.clearTimeout(abortTimer);
      }

      const raw = await res.text();
      let payload: any;
      try {
        payload = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(raw || `Request failed (${res.status})`);
      }

      const text = extractGeminiText(payload?.data ?? payload);

      if (!res.ok) {
        throw new Error(text || payload?.error || `Request failed (${res.status})`);
      }

      if (!text) {
        throw new Error("No text returned from AI.");
      }

      setResult(text);
      const pipeline = updatePipelineSession('script', {
        title: pipelineSource?.effectTitle || effectDescription.split('\n')[0]?.slice(0, 80) || 'Generated script',
        script: text,
      });
      try { window.dispatchEvent(new CustomEvent('maw:pipeline-session-updated', { detail: pipeline })); } catch {}
      void trackClientEvent({ tool: 'patter_engine', action: 'patter_generate_success', outcome: 'SUCCESS_NOT_CHARGED', metadata: { tones, descriptionLength: desc.length, duration_ms: Date.now() - startedAt } });
    } catch (err: any) {
      void trackClientEvent({ tool: 'patter_engine', action: 'patter_generate_error', outcome: 'ERROR_UPSTREAM', metadata: { tones, descriptionLength: desc.length, duration_ms: Date.now() - startedAt, message: err?.message || 'unknown' } });
      console.error("Patter generation failed:", err);
      if (err?.name === "AbortError") {
        setError("Request timed out. Please try again.");
      } else {
        setError(err?.message || "Failed to generate patter.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isLoading) return;
    setLoadingStep(0);
    const t = window.setInterval(() => setLoadingStep((s) => (s + 1) % loadingSteps.length), 950);
    return () => window.clearInterval(t);
  }, [isLoading, loadingSteps.length]);

  // Reset: clear ALL inputs + UI state (booth-ready)
  const handleReset = () => {
    setEffectDescription("");
    setSelectedTones([]);
    setError(null);
    setResult(null);
    setIsLoading(false);
    setSaveStatus("idle");
    setCopyStatus("idle");
    setAttemptedGenerate(false);
    setLoadingStep(0);
    setPipelineSource(null);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const presets = useMemo(
    () => [
      {
        label: "Linking Rings (Comedy)",
        description:
          "Chinese Linking Rings: a playful comedic routine where the rings seem to have a mind of their own. Include quick audience lines and a strong callback at the end.",
        tones: ["Comedic"],
      },
      {
        label: "Ambitious Card (Mysterious)",
        description:
          "Ambitious Card: a mysterious, impossible escalation where the signed card repeatedly rises to the top. Emphasize suspense, pauses, and clean fairness lines.",
        tones: ["Mysterious"],
      },
      {
        label: "Torn & Restored (Story)",
        description:
          "Torn & Restored: a storytelling presentation about memory and second chances, ending with a strong emotional beat. Keep it warm and audience-safe.",
        tones: ["Storytelling"],
      },
    ],
    []
  );

  const parseSections = (text: string) => {
    const cleaned = text.trim();
    const cleanedNoMd = cleaned.replace(/\*\*/g, "");
    const re = /(^|\n)(variation\s*(?:a|b|c|1|2|3)\b[^\n]*:?)/gi;
    const matches = Array.from(cleanedNoMd.matchAll(re));
    if (matches.length === 0) return [{ title: "Script", body: cleaned }];

    const sections: { title: string; body: string }[] = [];
    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index ?? 0;
      const end = i + 1 < matches.length ? (matches[i + 1].index ?? cleanedNoMd.length) : cleanedNoMd.length;
      const chunk = cleanedNoMd.slice(start, end).trim();
      const firstLine = chunk.split("\n")[0].trim();
      const body = chunk.replace(firstLine, "").trim();
      sections.push({ title: firstLine.replace(/^\n/, "").trim(), body: body || chunk });
    }
    return sections;
  };

  const copySection = async (sectionText: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(sectionText);
      } else {
        const ta = document.createElement("textarea");
        ta.value = sectionText;
        ta.style.position = "fixed";
        ta.style.top = "-9999px";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopyStatus("copied");
      setTimeout(() => setCopyStatus("idle"), 1500);
    } catch (err: any) {
      console.error("Copy failed:", err);
      setError(err?.message || "Copy failed.");
    }
  };

  const fullContentForSave = () =>
    `## Patter Variations for: ${effectDescription}\n\nTones: ${selectedTones.join(", ")}\n\n${result ?? ""}`;

  const fullContentForCopy = () =>
    `Patter Variations for: ${effectDescription}\nTones: ${selectedTones.join(", ")}\n\n${result ?? ""}`;

  const handleCopy = async () => {
    if (!result) return;
    try {
      const text = fullContentForCopy();
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.top = "-9999px";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopyStatus("copied");
      setTimeout(() => setCopyStatus("idle"), 1500);
    } catch (err: any) {
      console.error("Copy failed:", err);
      setError(err?.message || "Copy failed.");
    }
  };

  const handleSave = async () => {
    if (!result) return;
    try {
      const full = fullContentForSave();
      await saveIdea("text", full);
      void trackClientEvent({ tool: 'patter_engine', action: 'patter_save_success', outcome: 'SUCCESS_NOT_CHARGED', metadata: { tones: selectedTones, descriptionLength: effectDescription.trim().length } });
      onIdeaSaved();
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (err: any) {
      console.error("Save idea failed:", err);
      setError(err?.message || "Failed to save idea.");
    }
  };

  const handleCreateRoutineForShow = () => {
    if (!result) return;
    const title = pipelineSource?.effectTitle || effectDescription.split('\n')[0]?.replace(/^Effect title:\s*/i, '').slice(0, 80) || 'Generated Routine';
    const payload = {
      version: 1,
      source: 'patter_engine',
      pipelineStage: 'script_to_routine',
      title: String(title || 'Generated Routine'),
      notes: fullContentForSave(),
      patter: result,
      effectDescription,
      selectedTones,
      upstream: pipelineSource || null,
      created_at: new Date().toISOString(),
    };

    try {
      localStorage.setItem(SHOW_PLANNER_ROUTINE_HANDOFF_KEY, JSON.stringify(payload));
      localStorage.setItem('maw_creative_pipeline_last_stage', JSON.stringify({ stage: 'script_to_routine', ts: Date.now(), title: payload.title }));
      trackPipelineAdvance('script', 'routine', pipelineSource?.source || 'patter_engine', { title: payload.title });
      const pipeline = updatePipelineSession('routine', { title: payload.title, script: result || null, routine: payload });
      try { window.dispatchEvent(new CustomEvent('maw:pipeline-session-updated', { detail: pipeline })); } catch {}
    } catch {}

    void trackClientEvent({ tool: 'creative_pipeline', action: 'script_to_routine_clicked', outcome: 'SUCCESS_NOT_CHARGED', metadata: { title: payload.title, source: pipelineSource?.source || 'patter_engine' } });

    try {
      window.dispatchEvent(new CustomEvent('maw:navigate', { detail: { view: 'show-planner', source: 'patter_engine', title: payload.title } }));
    } catch {}
  };

  return (
    <div className="space-y-6">
      <PipelineProgress currentStep="script" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
      {/* Control Panel */}
      <div className="flex flex-col">
        <div ref={topRef} />
        <h2 className="text-xl font-bold text-slate-300 mb-2">The Patter Engine</h2>
        <p className="text-slate-400 mb-4">
          Describe your effect, choose a style, and generate performance-ready patter you can copy or save to your Ideas.
        </p>

        {pipelineSource ? (
          <div className="mb-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-50">
            <div className="font-bold text-amber-200">Creative Pipeline: Effect → Script</div>
            <div className="mt-1 text-amber-50/80">Loaded from: {pipelineSource.effectTitle || 'Effect Engine concept'}</div>
            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={!canGenerate}
              className="mt-3 rounded-lg bg-amber-500/20 border border-amber-300/30 px-3 py-2 text-xs font-semibold text-amber-50 hover:bg-amber-500/30 disabled:opacity-50"
            >
              Generate script from this effect
            </button>
          </div>
        ) : null}

        {/* Booth-friendly presets + reset */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-xs font-semibold text-slate-400 mr-1">Demo presets:</span>
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                setEffectDescription(p.description);
                setSelectedTones(p.tones);
                setError(null);
                void handleGenerate({ description: p.description, tones: p.tones });
              }}
              className="px-2.5 py-1.5 text-xs rounded-md bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700 transition-colors"
              title="Load a preset and generate"
            >
              {p.label}
            </button>
          ))}
          <div className="flex-1" />
          <button
            type="button"
            onClick={handleReset}
            className="px-2.5 py-1.5 text-xs rounded-md bg-transparent border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors"
            title="Reset this tool"
          >
            Reset
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="effect-description" className="block text-sm font-medium text-slate-300 mb-1">
              Effect Description
            </label>
            <textarea
              id="effect-description"
              rows={5}
              value={effectDescription}
              onChange={(e) => {
                setEffectDescription(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault();
                  void handleGenerate();
                }
              }}
              placeholder='e.g., "Chinese Linking Rings: a comedic routine where the rings seem to have a mind of their own."'
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
            />
            {attemptedGenerate && effectDescription.trim().length > 0 && effectDescription.trim().length <= 20 ? (
              <p className="text-amber-300 mt-2 text-xs">Add a bit more detail (at least ~20 characters) for best results.</p>
            ) : null}
          </div>

          {/* Tone buttons */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Select Tones</label>
            <p className="text-xs text-slate-500 mb-2">Pick 1–2 tones for best output.</p>
            <div className="grid grid-cols-2 gap-2">
              {TONES.map((tone) => (
                <button
                  key={tone}
                  type="button"
                  onClick={() => handleToneToggle(tone)}
                  className={`py-2 px-3 rounded-md transition-colors text-sm font-semibold flex items-center justify-between gap-2 ${
                    selectedTones.includes(tone)
                      ? "bg-purple-600 text-white"
                      : "bg-slate-700 hover:bg-slate-600 text-slate-300"
                  }`}
                >
                  <span>{tone}</span>
                  {selectedTones.includes(tone) ? <CheckIcon className="w-4 h-4" /> : <span className="w-4 h-4" />}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={!canGenerate}
            className="w-full py-3 mt-4 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed"
          >
            <WandIcon className="w-5 h-5" />
            <span>Generate Patter</span>
          </button>

          {error && <p className="text-red-400 mt-2 text-sm text-center">{error}</p>}
        </div>
      </div>

      {/* Result Display Area */}
      <div className="flex flex-col bg-slate-900/50 rounded-lg border border-slate-800 min-h-[300px]">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <LoadingIndicator statusText={loadingSteps[loadingStep]} />
          </div>
        ) : result ? (
          <div className="relative group flex-1 flex flex-col">
            <div className="p-4 overflow-y-auto space-y-3">
              <div className="text-xs text-slate-400">
                <span className="font-semibold text-slate-300">{effectDescription || "Patter"}</span>
                <span className="mx-2">•</span>
                <span>{selectedTones.join(", ")}</span>
              </div>

              {parseSections(result).map((sec, idx) => (
                <div key={`${sec.title}-${idx}`} className="rounded-xl border border-slate-800 bg-slate-950/30 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-200">{sec.title}</div>
                    <button
                      type="button"
                      onClick={() => void copySection(`${sec.title}\n\n${sec.body}`)}
                      className="flex items-center gap-1.5 px-2 py-1 text-xs rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
                      title="Copy this variation"
                    >
                      <CopyIcon className="w-3.5 h-3.5" />
                      Copy
                    </button>
                  </div>
                  <div className="mt-2 whitespace-pre-wrap break-words text-slate-200 font-sans text-sm">{sec.body}</div>
                </div>
              ))}
            </div>

            {/* Premium SaveActionBar + keep CohesionActions for workflow parity (Option A) */}
            <div className="mt-auto p-3 border-t border-slate-800 bg-slate-950/30">
              <SaveActionBar
                title="Next step:"
                subtitle="Save it, then move it into a Show or Task."
                onSave={handleSave}
                onCopy={handleCopy}
                saved={saveStatus === "saved"}
                saving={false}
              />
              <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCreateRoutineForShow}
                  className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/20 transition"
                >
                  Create Routine → Add to Show
                </button>
                <CohesionActions content={fullContentForSave()} defaultTitle={"Patter"} defaultTags={["patter"]} compact />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-center text-slate-500 p-4">
            <div>
              <BookIcon className="w-24 h-24 mx-auto mb-4" />
              <p>Your generated patter scripts will appear here.</p>
            </div>
          </div>
        )}
      </div>
      </main>
    </div>
  );
};

export default PatterEngine;
