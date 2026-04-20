import React, { useMemo, useState } from 'react';
import type { User } from '../types';
import { generateResponse } from '../services/geminiService';
import { saveIdea } from '../services/ideasService';
import { refreshAllData, useAppDispatch, useAppState } from '../store';
import ActivationProgress from './ActivationProgress';

type Props = {
  user?: User | null;
  onNavigate: (view: string) => void;
  onDismiss?: () => void;
};

const FIRST_WIN_SYSTEM = `You are Magic AI Wizard — the operating system for professional magicians.

You help the user quickly create a strong, original, performance-ready routine.

Rules:
- Never expose methods, gimmicks, sleights, stacks, or secret setups.
- Provide ethical, practical stagecraft and presentation guidance.
- Write for real-world performance (beats, timing, audience lines, stage directions).
- Keep it tight and usable: structured sections, no fluff.
`;

function buildFirstRoutinePrompt(objects: string, style: string) {
  return [
    `Create a professional 3–5 minute magic routine suitable for a general audience (parlor or small stage).`,
    `Preferred props / objects: ${objects}.`,
    `Performance style: ${style}.`,
    'Return the routine in this structure:',
    '',
    'TITLE:',
    'EFFECT SUMMARY (no exposure):',
    'OPENER (first 20 seconds):',
    'BEATS (5–9 beats with estimated seconds):',
    'KEY LINES (3–7 strong audience-facing lines):',
    'BLOCKING / STAGE DIRECTIONS:',
    'RESET NOTES (non-exposure):',
    'CLOSER (final 20 seconds):',
    '',
    'Make it modern, confident, and performance-ready. Avoid method details.',
  ].join('\n');
}

export default function FirstWinGate({ user, onNavigate, onDismiss }: Props) {
  const dispatch = useAppDispatch();
  const { ideas, shows } = useAppState();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdIdeaId, setCreatedIdeaId] = useState<string | null>(null);
  const [selectedObjects, setSelectedObjects] = useState('Everyday objects');
  const [selectedStyle, setSelectedStyle] = useState('Visual');
  const objectOptions = ['Cards', 'Coins', 'Everyday objects', 'Mentalism'];
  const styleOptions = ['Funny', 'Mysterious', 'Mind-reading', 'Visual'];

  const hasActivated = useMemo(() => (ideas?.length ?? 0) > 0 || (shows?.length ?? 0) > 0, [ideas, shows]);

  const runFirstRoutine = async () => {
    setError(null);
    setBusy(true);
    try {
      const prompt = buildFirstRoutinePrompt(selectedObjects, selectedStyle);
      const text = await generateResponse(prompt, FIRST_WIN_SYSTEM, user ?? undefined);
      if (!text || String(text).toLowerCase().startsWith('error:')) {
        throw new Error('The AI didn\'t respond this time. Please try again.');
      }

      // Critical activation move: auto-save the first routine.
      const saved = await saveIdea({
        type: 'text',
        title: `My First ${selectedStyle} Routine`,
        content: String(text).trim(),
        tags: ['first-win', selectedObjects.toLowerCase().replace(/[^a-z0-9]+/g, '-'), selectedStyle.toLowerCase().replace(/[^a-z0-9]+/g, '-')],
      } as any);

      setCreatedIdeaId(saved?.id ?? null);
      await refreshAllData(dispatch);
    } catch (e: any) {
      const msg = String(e?.message ?? 'We’re warming up the magic engine. Try again in a few seconds.');
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  // Once the user has activated, we should let them see the normal dashboard.
  // MagicianMode will naturally re-render out of this gate once store updates.
  if (hasActivated && !busy && !createdIdeaId) {
    return null;
  }

  return (
    <div className="px-4 md:px-6 py-6">
      <div className="mx-auto max-w-4xl">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-6 md:p-8">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-purple-500/10 via-transparent to-yellow-500/5" />
          <div className="relative">
            <div className="flex flex-col gap-3">
              <p className="inline-flex w-fit items-center gap-2 rounded-full border border-yellow-400/20 bg-yellow-500/10 px-3 py-1 text-xs font-semibold text-yellow-100">
                ✨ First Win
                <span className="text-yellow-100/70">under 90 seconds</span>
              </p>
              <h1 className="text-2xl md:text-3xl font-semibold text-white">What are you working on today?</h1>
              <p className="text-sm md:text-base text-white/65 max-w-2xl">
                Pick one. We’ll generate something real and save it to your workspace — so you leave with momentum, not tabs.
              </p>
            </div>

            <div className="mt-6 grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-6">
              <div className="rounded-2xl border border-purple-400/20 bg-purple-500/10 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-purple-100/80">Step 1</p>
                <h2 className="mt-2 text-lg font-semibold text-white">What objects do you like to perform with?</h2>
                <div className="mt-4 flex flex-wrap gap-2">
                  {objectOptions.map((option) => (
                    <button
                      key={option}
                      onClick={() => setSelectedObjects(option)}
                      className={`rounded-full border px-3 py-2 text-sm transition ${selectedObjects === option ? 'border-yellow-400/40 bg-yellow-500/15 text-yellow-50' : 'border-white/10 bg-white/[0.03] text-white/75 hover:bg-white/[0.06] hover:text-white'}`}
                    >
                      {option}
                    </button>
                  ))}
                </div>

                <p className="mt-6 text-xs font-semibold uppercase tracking-[0.16em] text-purple-100/80">Step 2</p>
                <h2 className="mt-2 text-lg font-semibold text-white">What style fits you best?</h2>
                <div className="mt-4 flex flex-wrap gap-2">
                  {styleOptions.map((option) => (
                    <button
                      key={option}
                      onClick={() => setSelectedStyle(option)}
                      className={`rounded-full border px-3 py-2 text-sm transition ${selectedStyle === option ? 'border-yellow-400/40 bg-yellow-500/15 text-yellow-50' : 'border-white/10 bg-white/[0.03] text-white/75 hover:bg-white/[0.06] hover:text-white'}`}
                    >
                      {option}
                    </button>
                  ))}
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    onClick={runFirstRoutine}
                    disabled={busy}
                    className="rounded-2xl border border-yellow-400/30 bg-yellow-500/15 px-4 py-3 text-sm font-semibold text-yellow-50 transition hover:bg-yellow-500/25 disabled:opacity-60"
                  >
                    ✨ Generate My First Effect
                  </button>
                  <button
                    onClick={() => onNavigate('show-planner')}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-medium text-white/80 transition hover:bg-white/[0.06]"
                  >
                    🗂 Start with Show Planner
                  </button>
                  {onDismiss && (
                    <button
                      onClick={onDismiss}
                      className="rounded-2xl px-2 py-3 text-sm text-white/55 transition hover:text-white"
                    >
                      Not now
                    </button>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-yellow-100/80">Your quick win</p>
                <h3 className="mt-2 text-lg font-semibold text-white">We’ll build something you can actually use.</h3>
                <div className="mt-4 space-y-3 text-sm text-white/65">
                  <div className="rounded-xl border border-white/8 bg-black/20 p-3">
                    <div className="text-white font-medium">Objects</div>
                    <div className="mt-1">{selectedObjects}</div>
                  </div>
                  <div className="rounded-xl border border-white/8 bg-black/20 p-3">
                    <div className="text-white font-medium">Style</div>
                    <div className="mt-1">{selectedStyle}</div>
                  </div>
                  <div className="rounded-xl border border-emerald-400/15 bg-emerald-500/10 p-3">
                    <div className="text-white font-medium">What happens next</div>
                    <div className="mt-1">You’ll get a performance-ready routine with beats, key lines, and stage directions — then it saves automatically to Saved Ideas.</div>
                  </div>
                </div>

                <div className="mt-4">
                  <ActivationProgress />
                </div>
              </div>
            </div>

            {busy && (
              <div className="mt-6 rounded-2xl border border-purple-400/20 bg-purple-500/10 p-4">
                <p className="text-sm font-semibold text-white">Generating your first professional routine…</p>
                <p className="mt-1 text-sm text-white/65">This usually takes 10–15 seconds. We’re tailoring it for {selectedObjects.toLowerCase()} in a {selectedStyle.toLowerCase()} style.</p>
              </div>
            )}

            {error && (
              <div className="mt-6 rounded-2xl border border-red-400/20 bg-red-500/10 p-4">
                <p className="text-sm font-semibold text-red-100">{error}</p>
              </div>
            )}

            {createdIdeaId && !busy && (
              <div className="mt-6 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
                <p className="text-sm font-semibold text-emerald-100">🎉 Your first routine is ready — and saved.</p>
                <p className="mt-1 text-sm text-white/70">Next: edit it, add it to a show, or generate another.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => onNavigate('saved-ideas')}
                    className="rounded-xl border border-emerald-400/25 bg-emerald-500/15 px-3 py-2 text-sm font-medium text-emerald-50 transition hover:bg-emerald-500/25"
                  >
                    ✏ Open Saved Ideas
                  </button>
                  <button
                    onClick={() => onNavigate('show-planner')}
                    className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm font-medium text-white/80 transition hover:bg-white/[0.05]"
                  >
                    📅 Add to a Show
                  </button>
                  <button
                    onClick={runFirstRoutine}
                    className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm font-medium text-white/80 transition hover:bg-white/[0.05]"
                  >
                    ➕ Generate Another
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
