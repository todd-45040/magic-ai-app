import React, { useMemo, useState } from 'react';
import { ASSISTANT_STUDIO_SYSTEM_INSTRUCTION } from '../constants';
import { generateResponse } from '../services/geminiService';
import { saveIdea } from '../services/ideasService';
import type { User } from '../types';

type Props = {
  user?: User;
  onIdeaSaved?: () => void;
};

const GUEST_USER: User = {
  email: '',
  membership: 'free',
  generationCount: 0,
  lastResetDate: '',
};

export default function AssistantStudio({ user, onIdeaSaved }: Props) {
  const currentUser = useMemo(() => user || GUEST_USER, [user]);

  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!input.trim()) return;

    try {
      setLoading(true);
      setError(null);

      const text = await generateResponse(
        input.trim(),
        ASSISTANT_STUDIO_SYSTEM_INSTRUCTION,
        currentUser
      );

      setOutput(text);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'Failed to generate response.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
    } catch {
      // ignore
    }
  };

  const handleSave = async () => {
    if (!output) return;

    try {
      await saveIdea({
        type: 'text',
        title: 'Assistant Studio Output',
        content: output,
        tags: ['assistant-studio'],
      });

      onIdeaSaved?.();
    } catch (e) {
      console.error(e);
      setError('Could not save this idea. (Check Supabase auth / RLS)');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Assistant&apos;s Studio</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            disabled={!output}
            className="px-3 py-2 rounded border border-slate-600 hover:border-slate-400 disabled:opacity-40"
          >
            Copy
          </button>
          <button
            onClick={handleSave}
            disabled={!output}
            className="px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>

      <textarea
        className="w-full p-3 border border-slate-700 rounded bg-slate-900 text-white"
        rows={7}
        placeholder="Describe what you want help with (script notes, structure, punchlines, transitions, callbacks, etc.)"
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />

      <div className="flex gap-3">
        <button
          onClick={handleGenerate}
          disabled={loading || !input.trim()}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded text-white disabled:opacity-40"
        >
          {loading ? 'Thinking…' : 'Generate'}
        </button>
      </div>

      {error && <div className="text-red-400">{error}</div>}

      {output && (
        <div className="p-4 bg-slate-950 rounded border border-slate-800 whitespace-pre-wrap">
          {output}
        </div>
      )}
    </div>
  );
}
