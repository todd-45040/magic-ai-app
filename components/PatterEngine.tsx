
import React, { useEffect, useMemo, useRef, useState } from "react";
import { saveIdea } from "../services/ideasService";
import { supabase } from "../supabase";
import { CohesionActions } from "./CohesionActions";
import SaveActionBar from "./shared/SaveActionBar";
import { BookIcon, WandIcon, CheckIcon, CopyIcon } from "./icons";
import type { User } from "../types";

interface PatterEngineProps {
  user: User;
  onIdeaSaved: () => void;
}

const TONES = ["Comedic", "Mysterious", "Dramatic", "Storytelling"] as const;

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
  const parts = data?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) return parts.map((p: any) => p?.text || "").join("");
  return data?.text || data?.output || "";
}

const PatterEngine: React.FC<PatterEngineProps> = ({ user: _user, onIdeaSaved }) => {
  const [effectDescription, setEffectDescription] = useState("");
  const [selectedTones, setSelectedTones] = useState<string[]>(["Comedic", "Mysterious"]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [attemptedGenerate, setAttemptedGenerate] = useState(false);

  const [loadingStep, setLoadingStep] = useState(0);
  const loadingSteps = useMemo(
    () => ["Analyzing effect…", "Building beats…", "Writing 2–3 variations…", "Final polish…"],
    []
  );

  const topRef = useRef<HTMLDivElement | null>(null);

  const [saveStatus, setSaveStatus] = useState<"idle" | "saved">("idle");
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied">("idle");

  const canGenerate = effectDescription.trim().length > 20 && selectedTones.length > 0 && !isLoading;

  const buildPrompt = (desc: string, tonesList: string[]) => {
    const tones = tonesList.join(", ");
    return `Generate performance-ready patter for the effect below. Provide multiple variations and beat-by-beat suggestions. Keep it practical for live performance.

Effect: ${desc}

Tones: ${tones}`;
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
    setError(null);
    setResult(null);
    setSaveStatus("idle");
    setCopyStatus("idle");

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        setError("Please log in to generate patter.");
        return;
      }

      const res = await fetch(`/api/generatePatter?ts=${Date.now()}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ prompt: buildPrompt(desc, tones) }),
      });

      const payload = await res.json().catch(async () => {
        const t = await res.text();
        throw new Error(t || `Request failed (${res.status})`);
      });

      const text = extractGeminiText(payload);

      if (!res.ok) {
        throw new Error(text || payload?.error || `Request failed (${res.status})`);
      }

      if (!text) {
        throw new Error("No text returned from AI.");
      }

      setResult(text);
    } catch (err: any) {
      console.error("Patter generation failed:", err);
      setError(err?.message || "Failed to generate patter.");
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

  // UPDATED RESET FUNCTION
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

    topRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  };

  return null;
};

export default PatterEngine;
