import React, { useState } from "react";
import { saveIdea } from "../services/ideasService";
import { BookIcon, WandIcon, SaveIcon, CheckIcon, CopyIcon, ShareIcon } from "./icons";
import ShareButton from "./ShareButton";
import type { User } from "../types";

interface PatterEngineProps {
  user: User;
  onIdeaSaved: () => void;
}

const PatterEngine: React.FC<PatterEngineProps> = ({ user, onIdeaSaved }) => {
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied">("idle");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved">("idle");

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError("Please enter a prompt.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setCopyStatus("idle");
    setSaveStatus("idle");

    try {
      const res = await fetch(`/api/generatePatter?ts=${Date.now()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      const data = await res.json();

      const text =
        data?.candidates?.[0]?.content?.parts
          ?.map((p: any) => p?.text || "")
          .join("") ?? "";

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
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      setCopyStatus("copied");
      setTimeout(() => setCopyStatus("idle"), 1500);
    } catch {
      setError("Copy failed.");
    }
  };

  const handleSave = async () => {
    if (!result) return;
    try {
      await saveIdea("text", result);
      onIdeaSaved();
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 1500);
    } catch (err) {
      setError("Failed to save idea.");
    }
  };

  return (
    <main className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div>
        <h2 className="text-xl font-bold text-slate-300 mb-2">The Patter Engine</h2>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the routine or idea you want patter for..."
          className="w-full h-40 p-3 bg-slate-800 text-white rounded-md border border-slate-600"
        />
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="mt-4 w-full py-3 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold"
        >
          <WandIcon className="inline w-5 h-5 mr-2" />
          Generate Patter
        </button>
        {error && <p className="text-red-400 mt-3">{error}</p>}
      </div>

      <div className="flex flex-col bg-slate-900/50 rounded-lg border border-slate-800">
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-slate-400">
            Generating...
          </div>
        ) : result ? (
          <>
            <div className="p-4 overflow-y-auto whitespace-pre-wrap text-slate-200">
              {result}
            </div>
            <div className="p-2 border-t border-slate-800 flex justify-end gap-2">
              <ShareButton title="Patter Idea" text={result}>
                <ShareIcon className="w-4 h-4" />
                Share
              </ShareButton>

              <button onClick={handleCopy} className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 rounded-md">
                {copyStatus === "copied" ? (
                  <>
                    <CheckIcon className="w-4 h-4 text-green-400" /> Copied
                  </>
                ) : (
                  <>
                    <CopyIcon className="w-4 h-4" /> Copy
                  </>
                )}
              </button>

              <button onClick={handleSave} className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 rounded-md">
                {saveStatus === "saved" ? (
                  <>
                    <CheckIcon className="w-4 h-4 text-green-400" /> Saved
                  </>
                ) : (
                  <>
                    <SaveIcon className="w-4 h-4" /> Save Idea
                  </>
                )}
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-500">
            <BookIcon className="w-20 h-20 mb-2" />
          </div>
        )}
      </div>
    </main>
  );
};

export default PatterEngine;
