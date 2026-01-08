import React, { useMemo, useState } from "react";
import { saveIdea } from "../services/ideasService";
import { BookIcon, WandIcon, SaveIcon, CheckIcon, CopyIcon } from "./icons";
import type { User } from "../types";

interface PatterEngineProps {
  user: User;
  onIdeaSaved: () => void;
}

const TONES = ["Comedic", "Mysterious", "Dramatic", "Storytelling"] as const;

const LoadingIndicator: React.FC = () => (
  <div className="flex flex-col items-center justify-center text-center p-8">
    <div className="relative">
      <WandIcon className="w-16 h-16 text-purple-400 animate-pulse" />
      <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
        <div className="w-24 h-24 border-t-2 border-purple-300 rounded-full animate-spin" />
      </div>
    </div>
    <p className="text-slate-300 mt-4 text-lg">Writing your scripts...</p>
    <p className="text-slate-400 text-sm">Crafting the perfect words for your performance.</p>
  </div>
);

function extractGeminiText(data: any): string {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) return parts.map((p: any) => p?.text || "").join("");
  return data?.text || data?.output || "";
}

const PatterEngine: React.FC<PatterEngineProps> = ({ user, onIdeaSaved }) => {
  const [effectDescription, setEffectDescription] = useState("");
  const [selectedTones, setSelectedTones] = useState<string[]>(["Comedic", "Mysterious"]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const [saveStatus, setSaveStatus] = useState<"idle" | "saved">("idle");
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied">("idle");

  const canGenerate = effectDescription.trim().length > 0 && selectedTones.length > 0 && !isLoading;

  const prompt = useMemo(() => {
    const tones = selectedTones.join(", ");
    return `Generate performance-ready patter for the effect below. Provide multiple variations and beat-by-beat suggestions. Keep it practical for live performance.\n\nEffect: ${effectDescription}\n\nTones: ${tones}`;
  }, [effectDescription, selectedTones]);

  const handleToneToggle = (tone: string) => {
    setSelectedTones((prev) => (prev.includes(tone) ? prev.filter((t) => t !== tone) : [...prev, tone]));
  };

  const handleGenerate = async () => {
    if (!effectDescription.trim()) {
      setError("Please describe the magic effect.");
      return;
    }
    if (selectedTones.length === 0) {
      setError("Please select at least one tone.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);
    setSaveStatus("idle");
    setCopyStatus("idle");

    try {
      const res = await fetch(`/api/generatePatter?ts=${Date.now()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      const data = await res.json().catch(async () => {
        const t = await res.text();
        throw new Error(t || `Request failed (${res.status})`);
      });

      const text = extractGeminiText(data);

      if (!res.ok) {
        throw new Error(text || data?.error || `Request failed (${res.status})`);
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
      onIdeaSaved();
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (err: any) {
      console.error("Save idea failed:", err);
      setError(err?.message || "Failed to save idea.");
    }
  };

  return (
    <main className="flex-1 overflow-y-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
      {/* Control Panel */}
      <div className="flex flex-col">
        <h2 className="text-xl font-bold text-slate-300 mb-2">The Patter Engine</h2>
        <p className="text-slate-400 mb-4">
          Describe your effect, choose a style, and generate performance-ready patter you can copy or save to your Ideas.
        </p>

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
              placeholder='e.g., "Chinese Linking Rings: a comedic routine where the rings seem to have a mind of their own."'
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
            />
          </div>

          {/* Tone buttons */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Select Tones</label>
            <div className="grid grid-cols-2 gap-2">
              {TONES.map((tone) => (
                <button
                  key={tone}
                  type="button"
                  onClick={() => handleToneToggle(tone)}
                  className={`py-2 px-3 rounded-md transition-colors text-sm font-semibold ${
                    selectedTones.includes(tone)
                      ? "bg-purple-600 text-white"
                      : "bg-slate-700 hover:bg-slate-600 text-slate-300"
                  }`}
                >
                  {tone}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={handleGenerate}
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
            <LoadingIndicator />
          </div>
        ) : result ? (
          <div className="relative group flex-1 flex flex-col">
            <div className="p-4 overflow-y-auto">
              <pre className="whitespace-pre-wrap break-words text-slate-200 font-sans text-sm">{result}</pre>
            </div>

            {/* Footer: Copy + Save only */}
            <div className="mt-auto p-2 bg-slate-900/50 flex justify-end gap-2 border-t border-slate-800">
              <button
                type="button"
                onClick={handleCopy}
                disabled={copyStatus === "copied"}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200 disabled:cursor-default transition-colors"
                title="Copy patter to clipboard"
              >
                {copyStatus === "copied" ? (
                  <>
                    <CheckIcon className="w-4 h-4 text-green-400" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <CopyIcon className="w-4 h-4" />
                    <span>Copy</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleSave}
                disabled={saveStatus === "saved"}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200 disabled:cursor-default transition-colors"
                title="Save this patter to your Ideas"
              >
                {saveStatus === "saved" ? (
                  <>
                    <CheckIcon className="w-4 h-4 text-green-400" />
                    <span>Saved!</span>
                  </>
                ) : (
                  <>
                    <SaveIcon className="w-4 h-4" />
                    <span>Save Idea</span>
                  </>
                )}
              </button>
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
  );
};

export default PatterEngine;
