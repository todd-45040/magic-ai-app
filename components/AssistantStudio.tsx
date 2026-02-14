import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ASSISTANT_STUDIO_SYSTEM_INSTRUCTION } from '../constants';
import { generateResponse } from '../services/geminiService';
import { saveIdea } from '../services/ideasService';
import { getShows, addTasksToShow } from '../services/showsService';
import type { Show, Task, User } from '../types';

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

const PRESETS: Array<{ label: string; template: (input: string) => string }> = [
  {
    label: 'Tighten Script',
    template: (input) =>
      `Tighten this script. Keep my voice, remove fluff, sharpen phrasing, and improve clarity.\n\nSCRIPT/NOTES:\n${input}`,
  },
  {
    label: 'Add Callbacks',
    template: (input) =>
      `Add 2–4 strong callbacks and running gags that pay off later. Show exactly where they land.\n\nSCRIPT/NOTES:\n${input}`,
  },
  {
    label: 'Improve Transitions',
    template: (input) =>
      `Improve transitions between beats/props. Give clean, motivated bridges and one-liners that justify the next effect.\n\nSCRIPT/NOTES:\n${input}`,
  },
  {
    label: 'Comedy Pass',
    template: (input) =>
      `Do a comedy pass: add laughs without undercutting the magic. Provide options: dry, playful, and cheeky (family-safe).\n\nSCRIPT/NOTES:\n${input}`,
  },
  {
    label: 'Walkaround Version',
    template: (input) =>
      `Rewrite/adjust this for walkaround/close-up: quick reset, angle safety, audience management, pocket management, and louder lines.\n\nSCRIPT/NOTES:\n${input}`,
  },
  {
    label: 'Family-Friendly Pass',
    template: (input) =>
      `Make this 100% family-friendly while staying funny and strong. Remove anything edgy and replace with clean alternatives.\n\nSCRIPT/NOTES:\n${input}`,
  },
];

function Skeleton() {
  return (
    <div className="space-y-3">
      <div className="h-4 w-2/3 rounded bg-slate-800 animate-pulse" />
      <div className="h-4 w-5/6 rounded bg-slate-800 animate-pulse" />
      <div className="h-4 w-4/6 rounded bg-slate-800 animate-pulse" />
      <div className="h-4 w-3/6 rounded bg-slate-800 animate-pulse" />
      <div className="h-4 w-5/6 rounded bg-slate-800 animate-pulse" />
      <div className="h-4 w-2/6 rounded bg-slate-800 animate-pulse" />
    </div>
  );
}

export default function AssistantStudio({ user, onIdeaSaved }: Props) {
  const currentUser = useMemo(() => user || GUEST_USER, [user]);

  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [copied, setCopied] = useState(false);

  // “Esc to stop” support (best-effort): we can’t abort the network call,
  // but we can ignore its result if the user cancels.
  const requestIdRef = useRef(0);
  const cancelledUpToRef = useRef(0);

  // Auto-scroll target
  const outputRef = useRef<HTMLDivElement | null>(null);

  // Show planner modal
  const [shows, setShows] = useState<Show[]>([]);
  const [showPickerOpen, setShowPickerOpen] = useState(false);
  const [selectedShowId, setSelectedShowId] = useState<string>('');
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const list = await getShows();
        if (!mounted) return;
        setShows(list || []);
        if ((list || []).length > 0) setSelectedShowId((list || [])[0].id);
      } catch {
        // ignore — user may be logged out or RLS blocks it
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!output) return;
    // slight delay so DOM paints before scroll
    window.setTimeout(() => {
      outputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }, [output]);

  const canCopySave = !!output && !loading;
  const canGenerate = !!input.trim() && !loading;

  const handleGenerate = async () => {
    if (!input.trim()) return;

    const myId = ++requestIdRef.current;

    try {
      setLoading(true);
      setError(null);
      setSendMsg(null);

      const text = await generateResponse(input.trim(), ASSISTANT_STUDIO_SYSTEM_INSTRUCTION, currentUser);

      // If user hit Esc while this was running, ignore the result.
      if (cancelledUpToRef.current >= myId) return;

      setOutput(text);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'Failed to generate response.');
    } finally {
      // Only end loading if this is the latest request
      if (requestIdRef.current === myId) setLoading(false);
    }
  };

  const handleReset = () => {
    cancelledUpToRef.current = requestIdRef.current; // ignore any in-flight response
    setLoading(false);
    setError(null);
    setSendMsg(null);
    setOutput('');
    setInput('');
    setCopied(false);
  };

  const handleCopy = async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
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
      setSendMsg('Saved to Ideas ✓');
      window.setTimeout(() => setSendMsg(null), 1400);
    } catch (e) {
      console.error(e);
      setError('Could not save this idea. (Check Supabase auth / RLS)');
    }
  };

  const openSend = () => {
    setSendMsg(null);
    setShowPickerOpen(true);
  };

  const sendToShowPlanner = async () => {
    if (!selectedShowId || !output) return;

    setSending(true);
    setSendMsg(null);
    setError(null);

    // Tier-1 implementation: send output as a single task.
    // (Tier-4 upgrade can split into Opener/Segments/Closer later.)
    const tasks: Partial<Task>[] = [
      {
        title: 'Assistant Studio Notes',
        notes: output,
        priority: 'medium' as any,
      },
    ];

    try {
      await addTasksToShow(selectedShowId, tasks);
      setShowPickerOpen(false);
      setSendMsg('Sent to Show Planner ✓');
      window.setTimeout(() => setSendMsg(null), 1600);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'Could not send to Show Planner.');
    } finally {
      setSending(false);
    }
  };

  // Keyboard shortcuts
  const onTextKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
    const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

    if (cmdOrCtrl && e.key === 'Enter') {
      e.preventDefault();
      if (canGenerate) handleGenerate();
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      cancelledUpToRef.current = requestIdRef.current; // ignore in-flight response
      setLoading(false);
      setSendMsg('Stopped');
      window.setTimeout(() => setSendMsg(null), 900);
    }
  };

  const applyPreset = (presetIndex: number) => {
    const preset = PRESETS[presetIndex];
    const base = input.trim();
    setInput(preset.template(base || '[Paste your script/notes here]'));
  };

  return (
    <div className="relative p-6 pb-24 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Assistant&apos;s Studio</h1>
        {/* Inline feedback */}
        <div className="text-sm text-slate-400 min-h-[1.25rem]">
          {sendMsg ? <span className="text-emerald-400">{sendMsg}</span> : error ? <span className="text-red-400">{error}</span> : null}
        </div>
      </div>

      {/* Two-column tool layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT: Input */}
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p, idx) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(idx)}
                className="px-3 py-1.5 rounded-full border border-slate-700 bg-slate-950/60 hover:border-slate-500 text-sm"
              >
                {p.label}
              </button>
            ))}
          </div>

          <textarea
            className="w-full p-3 border border-slate-700 rounded bg-slate-950/60 text-white min-h-[260px]"
            rows={10}
            placeholder="Describe what you want help with (script notes, structure, punchlines, transitions, callbacks, etc.)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onTextKeyDown}
          />

          <div className="text-xs text-slate-500">
            Shortcut: <span className="text-slate-300">Ctrl/Cmd + Enter</span> to generate • <span className="text-slate-300">Esc</span> to stop
          </div>
        </div>

        {/* RIGHT: Output / spinner panel */}
        <div ref={outputRef} className="space-y-3">
          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 min-h-[260px]">
            {loading ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-purple-300">Generating…</div>
                  <div className="h-2 w-24 rounded bg-slate-800 animate-pulse" />
                </div>
                <Skeleton />
              </div>
            ) : output ? (
              <div className="whitespace-pre-wrap text-slate-100">{output}</div>
            ) : (
              <div className="text-slate-400 text-sm">
                Your results will appear here. Use a preset chip above to get started quickly.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Send to Show Planner modal */}
      {showPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-950 p-5 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <div className="text-lg font-semibold">Send to Show Planner</div>
              <button
                className="px-2 py-1 rounded border border-slate-700 hover:border-slate-500"
                onClick={() => setShowPickerOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {shows.length === 0 ? (
                <div className="text-slate-300 text-sm">
                  No shows found. Create a show in <span className="text-slate-100">Show Planner</span> first.
                </div>
              ) : (
                <>
                  <label className="text-sm text-slate-300">Choose a show</label>
                  <select
                    className="w-full p-2 rounded bg-slate-900 border border-slate-700"
                    value={selectedShowId}
                    onChange={(e) => setSelectedShowId(e.target.value)}
                  >
                    {shows.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title}
                      </option>
                    ))}
                  </select>

                  <button
                    className="w-full mt-2 px-4 py-2 rounded bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-40"
                    disabled={!selectedShowId || sending}
                    onClick={sendToShowPlanner}
                  >
                    {sending ? 'Sending…' : 'Send Notes as Task'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sticky footer controls */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto max-w-7xl px-6 py-3 flex items-center justify-between gap-3">
          {/* Left: Reset */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className="px-3 py-2 rounded bg-transparent border border-slate-600 hover:border-slate-400 text-slate-200"
            >
              Reset / Clear
            </button>
          </div>

          {/* Center: Generate */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="px-5 py-2 rounded bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-40"
            >
              {loading ? 'Generating…' : 'Generate'}
            </button>
          </div>

          {/* Right: Copy / Save / Send */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              disabled={!canCopySave}
              className="px-3 py-2 rounded border border-slate-600 hover:border-slate-400 text-slate-200 disabled:opacity-40"
            >
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
            <button
              onClick={handleSave}
              disabled={!canCopySave}
              className="px-3 py-2 rounded bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-40"
            >
              Save
            </button>
            <button
              onClick={openSend}
              disabled={!canCopySave}
              className="px-3 py-2 rounded border border-slate-600 hover:border-slate-400 text-slate-200 disabled:opacity-40"
            >
              Send to Show Planner
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
