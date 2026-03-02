
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { generateResponse } from '../services/geminiService';
import { saveIdea } from '../services/ideasService';
import { EFFECT_GENERATOR_SYSTEM_INSTRUCTION } from '../constants';
import { LightbulbIcon, WandIcon, SaveIcon, CheckIcon, CopyIcon, ShareIcon } from './icons';
import ShareButton from './ShareButton';
import { useToast } from './ToastProvider';
import { useAppDispatch, useAppState } from '../store';
import { addTaskToShow } from '../services/showsService';
import { isDemoMode } from '../src/demo/demoEngine';
import { markDemoToolCompleted } from '../services/demoTourService';

type ParsedEffect = {
  name: string;
  premise: string;
  experience: string;
};

const normalize = (s: string) => String(s ?? '').replace(/\r\n/g, '\n').trim();

// Best-effort parser for the Effect Engine markdown output.
// Supports headings like "### 1. The Safehouse" and sections like **Premise:**, **The Experience:**
const parseEffectsFromMarkdown = (markdown: string): ParsedEffect[] => {
  const text = normalize(markdown);
  if (!text) return [];

  const headingRe = /^#{3,4}\s*\d+\.?\s*(.+)$/gm;
  const headings: Array<{ index: number; name: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(text))) {
    headings.push({ index: m.index, name: String(m[1] ?? '').trim() });
  }
  if (headings.length === 0) return [];

  const getSection = (block: string, label: string) => {
    // Capture from **Label:** to the next **Something:** or next heading.
    const re = new RegExp(`\\*\\*${label}\\*\\*\\s*:?\\s*([\\s\\S]*?)(?=\\n\\*\\*[^*]+\\*\\*\\s*:|\\n#{3,4}\\s*\\d+\\.?\\s+|$)`, 'i');
    const mm = re.exec(block);
    return normalize(mm?.[1] ?? '');
  };

  const effects: ParsedEffect[] = [];
  for (let i = 0; i < headings.length; i++) {
    const start = headings[i].index;
    const end = i + 1 < headings.length ? headings[i + 1].index : text.length;
    const block = text.slice(start, end);

    const name = headings[i].name;
    const premise = getSection(block, 'Premise');
    // some outputs use "The Experience" exactly
    const experience = getSection(block, 'The Experience') || getSection(block, 'Experience');

    if (name) effects.push({ name, premise, experience });
  }
  return effects;
};

interface EffectGeneratorProps {
    onIdeaSaved: () => void;
}

const LoadingIndicator: React.FC = () => (
    <div className="flex flex-col items-center justify-center text-center p-8">
        <div className="relative">
            <WandIcon className="w-16 h-16 text-purple-400 animate-pulse" />
            <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
                 <div className="w-24 h-24 border-t-2 border-purple-300 rounded-full animate-spin"></div>
            </div>
        </div>
        <p className="text-slate-300 mt-4 text-lg">Brewing creative ideas...</p>
        <p className="text-slate-400 text-sm">Your next masterpiece is moments away.</p>
    </div>
);

const EffectGenerator: React.FC<EffectGeneratorProps> = ({ onIdeaSaved }) => {
  const { currentUser } = useAppState() as any;
  const { shows } = useAppState() as any;
  const dispatch = useAppDispatch();
  const { showToast } = useToast();
  const [items, setItems] = useState(['', '', '', '']);
  // Phase 1 (Effectiveness Upgrades): user intent + difficulty for higher-quality generations.
  const [creativeIntent, setCreativeIntent] = useState<
    'Visual Miracle' | 'Comedy Bit' | 'Mentalism' | 'Close-Up Practical' | 'Stage Expansion' | 'Social Media Piece' | 'Emotional Story Piece'
  >('Visual Miracle');
  const [difficulty, setDifficulty] = useState<'Self-Working' | 'Intermediate' | 'Advanced / Gimmick Allowed'>('Intermediate');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ideas, setIdeas] = useState<string | null>(null);
  // Phase 4 (Recording Optimization): separate "display" ideas so we can simulate a cinematic reveal in Demo Mode.
  const [displayIdeas, setDisplayIdeas] = useState<string | null>(null);
  const [revealReady, setRevealReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [selectedShowId, setSelectedShowId] = useState<string>('');
  const [selectedEffectIndex, setSelectedEffectIndex] = useState<number>(0);
  const [importStatus, setImportStatus] = useState<'idle' | 'importing' | 'imported'>('idle');
  // Phase 3 (Data Integrity): convert a concept into an execution task with subtasks.
  const [isTaskOpen, setIsTaskOpen] = useState(false);
  const [taskShowId, setTaskShowId] = useState<string>('');
  const [taskEffectIndex, setTaskEffectIndex] = useState<number>(0);
  const [taskStatus, setTaskStatus] = useState<'idle' | 'creating' | 'created'>('idle');
  // Phase 2 (Conversion & Retention): lightweight "favorite" toggle for a generated idea.
  const [isStrongIdea, setIsStrongIdea] = useState(false);

  // Demo Mode v2 (Phase 2): deterministic Effect Engine responses when demo mode is active.
  const demoActive = isDemoMode();
  const demoScenario = 'corporate_closeup';

  const outputRef = useRef<HTMLDivElement | null>(null);

  // Phase 3A: draft persistence for typed items + settings (reduces frustration on refresh).
  const draftKey = useMemo(() => {
    const uid = String((currentUser as any)?.id ?? (currentUser as any)?.userId ?? (currentUser as any)?.uid ?? (currentUser as any)?.email ?? 'guest');
    return `maw_effect_engine_draft_v1:${uid}`;
  }, [currentUser]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.items)) {
        const next = [0, 1, 2, 3].map((i) => String(parsed.items?.[i] ?? ''));
        setItems(next);
      }
      if (typeof parsed?.creativeIntent === 'string') setCreativeIntent(parsed.creativeIntent as any);
      if (typeof parsed?.difficulty === 'string') setDifficulty(parsed.difficulty as any);
      if (typeof parsed?.isStrongIdea === 'boolean') setIsStrongIdea(Boolean(parsed.isStrongIdea));
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  useEffect(() => {
    // Debounced write to keep UI snappy.
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(
          draftKey,
          JSON.stringify({
            items,
            creativeIntent,
            difficulty,
            isStrongIdea,
            ts: Date.now(),
          })
        );
      } catch {
        // ignore
      }
    }, 250);
    return () => window.clearTimeout(t);
  }, [draftKey, items, creativeIntent, difficulty, isStrongIdea]);

  useEffect(() => {
    if (!displayIdeas) return;
    // Fade in + gentle auto-scroll for recording polish.
    setRevealReady(false);
    const t = window.setTimeout(() => {
      setRevealReady(true);
      try {
        outputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch {}
    }, 30);
    return () => window.clearTimeout(t);
  }, [displayIdeas]);

  const parsedEffects = useMemo(() => (ideas ? parseEffectsFromMarkdown(ideas) : []), [ideas]);

  const handleItemChange = (index: number, value: string) => {
    const newItems = [...items];
    newItems[index] = value;
    setItems(newItems);
    setError(null);
  };

  const handleClearAll = () => {
    setItems(['', '', '', '']);
    setError(null);
    setIdeas(null);
    setDisplayIdeas(null);
    setRevealReady(false);
    setSaveStatus('idle');
    setCopyStatus('idle');
    setIsStrongIdea(false);
    try {
      localStorage.removeItem(draftKey);
    } catch {}
  };

  const handleGenerate = async () => {
    const validItems = items.map(item => item.trim()).filter(item => item !== '');
    if (validItems.length === 0) {
      setError("Please enter at least one item.");
      return;
    }
    
    setIsLoading(true);
    setError(null);
    setIdeas(null);
    setDisplayIdeas(null);
    setRevealReady(false);
    setSaveStatus('idle');
    setCopyStatus('idle');
    setIsStrongIdea(false);

    const itemList = validItems.join(', ');
    // Phase 1: steer generations with intent + practicality constraints.
    const prompt = [
      `Generate magic effect ideas using the following items: ${itemList}.`,
      `Creative intent: ${creativeIntent}.`,
      `Difficulty level: ${difficulty}.`,
      `Make the ideas practical for real performance and clearly structured (Premise, The Experience, Method Overview, Performance Notes, Secret Hint).`,
    ].join(' ');
    
    try {
      // FIX: pass currentUser as the 3rd argument to generateResponse
      const response = await generateResponse(
        prompt,
        EFFECT_GENERATOR_SYSTEM_INSTRUCTION,
        currentUser || { email: '', membership: 'free', generationCount: 0, lastResetDate: '' },
        undefined,
        demoActive
          ? {
              extraHeaders: {
                'X-Demo-Mode': 'true',
                'X-Demo-Tool': 'effect_engine',
                'X-Demo-Scenario': demoScenario,
              },
            }
          : undefined
      );
      setIdeas(response);

      // Phase 4: simulated reveal delay in demo mode (800–1200ms) to make recordings feel cinematic.
      if (demoActive) {
        const delay = 800 + Math.floor(Math.random() * 401);
        await new Promise<void>((resolve) => window.setTimeout(() => resolve(), delay));
      }

      setDisplayIdeas(response);
      if (demoActive) {
        try { markDemoToolCompleted('effect_engine'); } catch {}
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  // Phase 2: generate a fresh concept using the same items, explicitly avoiding the last output.
  const handleGenerateAlternative = async () => {
    const validItems = items.map(item => item.trim()).filter(item => item !== '');
    if (validItems.length === 0) {
      setError('Please enter at least one item.');
      return;
    }
    if (!ideas) {
      // No prior idea to diverge from; fall back to a normal generation.
      return handleGenerate();
    }

    setIsLoading(true);
    setError(null);
    setIdeas(null);
    setDisplayIdeas(null);
    setRevealReady(false);
    setSaveStatus('idle');
    setCopyStatus('idle');
    setIsStrongIdea(false);

    const itemList = validItems.join(', ');
    const lastOutput = String(ideas).slice(0, 1500);

    const prompt = [
      `Generate NEW magic effect ideas using the following items: ${itemList}.`,
      `Creative intent: ${creativeIntent}.`,
      `Difficulty level: ${difficulty}.`,
      `IMPORTANT: The previous output is shown below. Your new concept must be meaningfully different (new premise, new structure, new method direction).`,
      `Avoid reusing the same title, premise, beats, or gimmick approach. Do not paraphrase the same idea — create a different one.`,
      `Format the ideas clearly (Premise, The Experience, Method Overview, Performance Notes, Secret Hint).`,
      `PREVIOUS OUTPUT (for avoidance):\n${lastOutput}`
    ].join(' ');

    try {
      const response = await generateResponse(
        prompt,
        EFFECT_GENERATOR_SYSTEM_INSTRUCTION,
        currentUser || { email: '', membership: 'free', generationCount: 0, lastResetDate: '' },
        undefined,
        demoActive
          ? {
              extraHeaders: {
                'X-Demo-Mode': 'true',
                'X-Demo-Tool': 'effect_engine',
                'X-Demo-Scenario': demoScenario,
              },
            }
          : undefined
      );

      setIdeas(response);

      // Demo Mode: keep the same cinematic reveal behavior.
      if (demoActive) {
        const delay = 800 + Math.floor(Math.random() * 401);
        await new Promise<void>((resolve) => window.setTimeout(() => resolve(), delay));
      }

      setDisplayIdeas(response);
      if (demoActive) {
        try { markDemoToolCompleted('effect_engine'); } catch {}
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleSave = async () => {
    if (!ideas) return;
    const cleanItems = items.map((item) => item.trim()).filter((item) => item !== '');
    const itemList = cleanItems.join(', ');
    const modelUsed = 'gemini-3-pro-preview';
    const uid = String((currentUser as any)?.id ?? (currentUser as any)?.userId ?? (currentUser as any)?.uid ?? 'unknown');

    // Prefer a meaningful title when the output includes parsed headings.
    const defaultTitle = cleanItems.length ? `Effect Engine: ${cleanItems.slice(0, 2).join(' + ')}${cleanItems.length > 2 ? '…' : ''}` : 'Effect Engine Idea';
    const headingTitle = parsedEffects?.[0]?.name?.trim();
    const title = headingTitle ? `Effect: ${headingTitle}` : defaultTitle;

    const tags = [
      'effect-engine',
      `intent:${String(creativeIntent).toLowerCase().replace(/\s+/g, '-')}`,
      `difficulty:${String(difficulty).toLowerCase().replace(/\s+|\//g, '-')}`,
      ...(isStrongIdea ? ['strong-idea'] : []),
    ].slice(0, 8);

    const fullContent = [
      `## ${title}`,
      '',
      'meta:',
      `  timestamp: ${new Date().toISOString()}`,
      `  userId: ${uid}`,
      `  model: ${modelUsed}`,
      `  items: ${cleanItems.length ? cleanItems.join(' | ') : 'N/A'}`,
      `  creativeIntent: ${creativeIntent}`,
      `  difficulty: ${difficulty}`,
      `  strongIdea: ${isStrongIdea ? 'Yes' : 'No'}`,
      '',
      ideas,
    ].join('\n');

    try {
      await saveIdea({ type: 'text', content: fullContent, title, tags });
      onIdeaSaved();
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
      // Keep the draft, but mark a successful save moment (best-effort).
      try {
        localStorage.setItem(`${draftKey}:lastSavedAt`, String(Date.now()));
      } catch {}
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save idea.');
    }
  };

  const handleCopy = () => {
    if (ideas) {
      const itemList = items.map(item => item.trim()).filter(item => item !== '').join(', ');
      const fullContent = `Effect Ideas for: ${itemList}\nCreative Intent: ${creativeIntent}\nDifficulty: ${difficulty}\nStrong Idea: ${isStrongIdea ? 'Yes' : 'No'}\n\n${ideas}`;
      navigator.clipboard.writeText(fullContent);
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 2000);
    }
  }

  // Phase 2: refinement actions that "layer" direction on top of the current output.
  const handleRefine = async (
    mode: 'refine' | 'comedy' | 'psych' | 'impossible' | 'visual'
  ) => {
    if (!ideas) return;

    const validItems = items.map(item => item.trim()).filter(item => item !== '');
    const itemList = validItems.join(', ');
    const base = String(ideas).slice(0, 4000);

    const instructionMap: Record<typeof mode, string> = {
      refine: 'Refine and improve clarity, pacing, and practicality. Keep the same core concept unless a small improvement is needed. Make it more performance-ready.',
      comedy: 'Add a comedy angle: include 2–3 punchy lines, a funny beat, and a playful premise twist while keeping the method practical.',
      psych: 'Add psychological/mentalism layering: motivations, convincers, subtle audience management, and one strong "why" that makes the effect feel impossible.',
      impossible: 'Increase the impossible factor: raise the stakes, strengthen the conditions, and add one clean moment that feels like "no way" while keeping it realistic to perform.',
      visual: 'Make it more visual: strengthen the picture moments, add a clean reveal, and improve the clarity of what the audience sees at each beat.',
    };

    const prompt = [
      `You are refining an existing Effect Engine output for Magic AI Wizard.`,
      `Original items: ${itemList || 'N/A'}.`,
      `Creative intent: ${creativeIntent}.`,
      `Difficulty level: ${difficulty}.`,
      `Task: ${instructionMap[mode]}`,
      `Rules: Keep the same structured format (Premise, The Experience, Method Overview, Performance Notes, Secret Hint).`,
      `Do NOT mention that you are an AI. Do NOT add safety disclaimers. Keep it concise and practical.`,
      `\nCURRENT OUTPUT TO REFINE:\n${base}`,
    ].join(' ');

    setIsLoading(true);
    setError(null);
    setSaveStatus('idle');
    setCopyStatus('idle');

    try {
      const response = await generateResponse(
        prompt,
        EFFECT_GENERATOR_SYSTEM_INSTRUCTION,
        currentUser || { email: '', membership: 'free', generationCount: 0, lastResetDate: '' },
        undefined,
        demoActive
          ? {
              extraHeaders: {
                'X-Demo-Mode': 'true',
                'X-Demo-Tool': 'effect_engine',
                'X-Demo-Scenario': demoScenario,
              },
            }
          : undefined
      );

      setIdeas(response);
      if (demoActive) {
        const delay = 800 + Math.floor(Math.random() * 401);
        await new Promise<void>((resolve) => window.setTimeout(() => resolve(), delay));
      }
      setDisplayIdeas(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  // Phase 2: favorite toggle stored locally (retention hook; safe + non-destructive).
  const toggleStrongIdea = () => {
    const next = !isStrongIdea;
    setIsStrongIdea(next);
    try {
      // Store a small local footprint keyed to the current output (best-effort, no backend coupling).
      const key = 'maw_effect_engine_strong_ideas';
      const raw = localStorage.getItem(key);
      const list: string[] = raw ? JSON.parse(raw) : [];
      const fingerprint = `${creativeIntent}|${difficulty}|${normalize(ideas ?? '')}`.slice(0, 800);
      const exists = list.includes(fingerprint);
      const updated = next ? (exists ? list : [fingerprint, ...list].slice(0, 50)) : list.filter(x => x !== fingerprint);
      localStorage.setItem(key, JSON.stringify(updated));
    } catch {}
  };

  const openImport = () => {
    if (!ideas) return;
    setError(null);
    setImportStatus('idle');
    // Default to most recent show if available.
    const firstShowId = Array.isArray(shows) && shows.length ? String(shows[0].id) : '';
    setSelectedShowId(firstShowId);
    setSelectedEffectIndex(0);
    setIsImportOpen(true);
  };

  // Phase 3C: convert to an execution task (with subtasks) inside a Show.
  const openConvertToTask = () => {
    if (!ideas) return;
    setError(null);
    setTaskStatus('idle');
    const firstShowId = Array.isArray(shows) && shows.length ? String(shows[0].id) : '';
    setTaskShowId(firstShowId);
    setTaskEffectIndex(0);
    setIsTaskOpen(true);
  };

  const handleConvertToTask = async () => {
    if (!ideas) return;
    if (!taskShowId) {
      setError('Please create or select a Show in Show Planner first.');
      setIsTaskOpen(false);
      return;
    }

    const effects = parsedEffects;
    const effect = effects[taskEffectIndex] || effects[0];
    const cleanItems = items.map((i) => i.trim()).filter(Boolean);
    const itemList = cleanItems.join(', ');
    const effectTitle = effect?.name?.trim() || (cleanItems.length ? `Effect Idea (${cleanItems.slice(0, 2).join(' + ')})` : 'Effect Idea');
    const title = `Build: ${effectTitle}`;

    const notes = [
      `Creative Intent: ${creativeIntent}`,
      `Difficulty: ${difficulty}`,
      cleanItems.length ? `Items: ${itemList}` : '',
      '',
      effect?.premise ? `Premise:\n${effect.premise}` : '',
      effect?.experience ? `Experience:\n${effect.experience}` : '',
    ].filter(Boolean).join('\n');

    const subtasks = [
      { title: 'Build prototype', done: false },
      { title: 'Order / prepare gimmick', done: false },
      { title: 'Test handling & timing', done: false },
      { title: 'Write / refine patter', done: false },
    ];

    setTaskStatus('creating');
    try {
      const updatedShows = await addTaskToShow(taskShowId, {
        title,
        notes,
        priority: 'Medium',
        status: 'To-Do',
        createdAt: Date.now(),
        // Optional column; showsService will safely omit if schema doesn't support it.
        subtasks,
      } as any);
      dispatch({ type: 'SET_SHOWS', payload: updatedShows } as any);

      try {
        const showTitle = (Array.isArray(shows) ? shows : []).find((s: any) => String(s?.id) === String(taskShowId))?.title ?? 'your show';
        showToast(`Task created in “${showTitle}”`, {
          label: 'View task',
          onClick: () => {
            try {
              window.dispatchEvent(new CustomEvent('maw:navigate', { detail: { view: 'show-planner', primaryId: String(taskShowId), secondaryId: String(title) } }));
            } catch {}
          },
        });
      } catch {}

      setTaskStatus('created');
      setTimeout(() => setTaskStatus('idle'), 1500);
      setIsTaskOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to convert to task.');
      setTaskStatus('idle');
      setIsTaskOpen(false);
    }
  };

  const handleImportToShowPlanner = async () => {
    if (!ideas) return;
    if (!selectedShowId) {
      setError('Please create or select a Show in Show Planner first.');
      setIsImportOpen(false);
      return;
    }

    const effects = parsedEffects;
    const effect = effects[selectedEffectIndex];
    if (!effect) {
      setError('Could not parse an effect from the output. Try generating again.');
      setIsImportOpen(false);
      return;
    }

    setImportStatus('importing');
    try {
      const title = effect.name.trim() || 'Imported Effect';
      const notesParts = [
        effect.premise ? `Premise:\n${effect.premise}` : '',
        effect.experience ? `Experience:\n${effect.experience}` : ''
      ].filter(Boolean);
      const notes = notesParts.join('\n\n');

      const updatedShows = await addTaskToShow(selectedShowId, {
        title,
        notes,
        priority: 'Medium',
        status: 'To-Do',
        createdAt: Date.now(),
      } as any);

      dispatch({ type: 'SET_SHOWS', payload: updatedShows } as any);
      // Set a focus hint so Show Planner can auto-scroll + pulse-highlight the newly added beat.
      try {
        const showTitle = (Array.isArray(shows) ? shows : []).find((s: any) => String(s?.id) === String(selectedShowId))?.title ?? 'your show';
        localStorage.setItem('maw_showplanner_focus', JSON.stringify({
          showId: String(selectedShowId),
          taskTitle: String(title),
          ts: Date.now(),
        }));

        showToast(`Performance Beat added to “${showTitle}”`, {
          label: 'View beat',
          onClick: () => {
            try {
              window.dispatchEvent(new CustomEvent('maw:navigate', { detail: { view: 'show-planner', primaryId: String(selectedShowId), secondaryId: String(title) } }));
            } catch {}
          }
        });
      } catch {}

      setImportStatus('imported');
      setTimeout(() => setImportStatus('idle'), 2000);
      setIsImportOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to import to Show Planner.');
      setImportStatus('idle');
      setIsImportOpen(false);
    }
  };

  return (
    <main className="flex-1 overflow-y-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
        {demoActive && (
            <div className="lg:col-span-2 rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <span className="font-semibold">✨ DEMO MODE — Guided Showcase</span>
                        <span className="ml-2 text-yellow-100/80">Step 1 of 3: Effect Engine</span>
                    </div>
                    <div className="text-yellow-100/70">Scenario: Corporate Close-Up</div>
                </div>
            </div>
        )}
        {/* Control Panel */}
        <div className="flex flex-col">
            <h2 className="text-xl font-bold text-slate-300 mb-2">The Effect Engine</h2>
            <p className="text-slate-400 mb-4">Combine everyday objects to invent extraordinary magic. Enter up to four items to see what's possible.</p>

            <div className="space-y-4">
                {/* Items panel */}
                <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm font-semibold text-slate-300">Items</div>
                    <button
                      type="button"
                      onClick={handleClearAll}
                      disabled={isLoading || items.every(i => i.trim() === '')}
                      className="text-xs px-2 py-1 rounded-md border border-slate-700 bg-slate-900/50 text-slate-300 hover:bg-slate-800/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Clear all items"
                    >
                      Clear All
                    </button>
                  </div>

                  <div className="space-y-3">
                    {[0, 1, 2, 3].map(index => (
                        <div key={index}>
                            <label htmlFor={`item-${index}`} className="block text-sm font-medium text-slate-400 mb-1">Item {index + 1}</label>
                            <input
                                id={`item-${index}`}
                                type="text"
                                value={items[index]}
                                onChange={(e) => handleItemChange(index, e.target.value)}
                                placeholder={index === 0 ? "e.g., A key" : index === 1 ? "e.g., A rubber band" : "..."}
                                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
                            />
                        </div>
                    ))}
                  </div>
                </div>

                {/* Creative goal */}
                <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-4">
                  <label className="block text-sm font-medium text-slate-300 mb-2">Creative Intent</label>
                  <select
                    value={creativeIntent}
                    onChange={(e) => setCreativeIntent(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white focus:outline-none focus:border-purple-500 transition-colors"
                  >
                    <option>Visual Miracle</option>
                    <option>Comedy Bit</option>
                    <option>Mentalism</option>
                    <option>Close-Up Practical</option>
                    <option>Stage Expansion</option>
                    <option>Social Media Piece</option>
                    <option>Emotional Story Piece</option>
                  </select>
                  <p className="mt-2 text-xs text-slate-400">Steers the engine toward the kind of magic you want to build.</p>
                </div>

                {/* Difficulty toggle */}
                <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium text-slate-300">Difficulty</div>
                    <div className="text-xs text-slate-400">Choose realism level</div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {(['Self-Working', 'Intermediate', 'Advanced / Gimmick Allowed'] as const).map((opt) => {
                      const active = difficulty === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setDifficulty(opt)}
                          className={
                            `px-2 py-2 rounded-md text-xs font-semibold border transition-colors ` +
                            (active
                              ? 'border-purple-500/60 bg-purple-500/20 text-white'
                              : 'border-slate-700 bg-slate-900/40 text-slate-300 hover:bg-slate-800/60')
                          }
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                      onClick={handleGenerate}
                      disabled={isLoading || items.every(item => item.trim() === '')}
                      className="w-full py-3 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed"
                  >
                      <WandIcon className="w-5 h-5" />
                      <span>Generate Ideas</span>
                  </button>

                  <button
                      onClick={handleGenerateAlternative}
                      disabled={isLoading || items.every(item => item.trim() === '') || !ideas}
                      className="w-full py-3 flex items-center justify-center gap-2 rounded-md border border-slate-700 bg-slate-900/40 text-slate-200 font-bold hover:bg-slate-800/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title={!ideas ? 'Generate once first, then create an alternative concept.' : 'Generate a different concept using the same items'}
                  >
                      <span aria-hidden="true">🔁</span>
                      <span>Alternative Concept</span>
                  </button>
                </div>
                {error && <p className="text-red-400 -mt-1 text-sm text-center">{error}</p>}
            </div>
        </div>

        {/* Ideas Display Area */}
        <div ref={outputRef} className="flex flex-col bg-slate-900/50 rounded-lg border border-slate-800 min-h-[300px]">
            {isLoading ? (
                <div className="flex-1 flex items-center justify-center">
                    <LoadingIndicator />
                </div>
            ) : displayIdeas ? (
                 <div className="relative group flex-1 flex flex-col">
                    <div className="p-4">
                        {/*
                          Phase 4: Fade-in reveal + highlighted sections for Demo Mode.
                          - Non-demo: show raw output.
                          - Demo: show structured cards for the parsed effects (more cinematic and scannable).
                        */}
                        <div className={`transition-opacity duration-700 ${revealReady ? 'opacity-100' : 'opacity-0'}`}>
                          {demoActive && parsedEffects.length ? (
                            <div className="space-y-4">
                              {parsedEffects.map((ef, idx) => (
                                <div
                                  key={idx}
                                  className={`rounded-xl border bg-slate-950/40 p-4 shadow-sm ${idx === 0 ? 'border-yellow-500/30 ring-1 ring-yellow-500/10' : 'border-slate-800'}`}
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <h3 className="text-slate-100 font-bold text-base">
                                      <span className="text-yellow-300/90">#{idx + 1}</span> {ef.name}
                                    </h3>
                                    {idx === 0 ? (
                                      <span className="text-xs rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2 py-1 text-yellow-200">Featured</span>
                                    ) : null}
                                  </div>

                                  {ef.premise ? (
                                    <div className="mt-3">
                                      <div className="text-xs font-semibold tracking-wide text-yellow-200/80">PREMISE</div>
                                      <div className="mt-1 text-sm text-slate-200 whitespace-pre-wrap">{ef.premise}</div>
                                    </div>
                                  ) : null}

                                  {ef.experience ? (
                                    <div className="mt-3">
                                      <div className="text-xs font-semibold tracking-wide text-yellow-200/80">THE EXPERIENCE</div>
                                      <div className="mt-1 text-sm text-slate-200 whitespace-pre-wrap">{ef.experience}</div>
                                    </div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <pre className="whitespace-pre-wrap break-words text-slate-200 font-sans text-sm">{displayIdeas}</pre>
                          )}
                        </div>
                    </div>

                    {/* Phase 2: refinement actions (conversion + engagement). */}
                    <div className="px-4 pb-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleRefine('refine')}
                          disabled={isLoading || !ideas}
                          className="px-3 py-1.5 text-xs font-semibold rounded-md border border-slate-700 bg-slate-900/40 text-slate-200 hover:bg-slate-800/60 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Refine and improve the current idea"
                        >
                          ✨ Refine
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRefine('comedy')}
                          disabled={isLoading || !ideas}
                          className="px-3 py-1.5 text-xs font-semibold rounded-md border border-slate-700 bg-slate-900/40 text-slate-200 hover:bg-slate-800/60 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Add a comedy angle"
                        >
                          🎭 Comedy
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRefine('psych')}
                          disabled={isLoading || !ideas}
                          className="px-3 py-1.5 text-xs font-semibold rounded-md border border-slate-700 bg-slate-900/40 text-slate-200 hover:bg-slate-800/60 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Add psychological layering"
                        >
                          🧠 Psychology
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRefine('impossible')}
                          disabled={isLoading || !ideas}
                          className="px-3 py-1.5 text-xs font-semibold rounded-md border border-slate-700 bg-slate-900/40 text-slate-200 hover:bg-slate-800/60 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Increase the impossible factor"
                        >
                          💥 More Impossible
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRefine('visual')}
                          disabled={isLoading || !ideas}
                          className="px-3 py-1.5 text-xs font-semibold rounded-md border border-slate-700 bg-slate-900/40 text-slate-200 hover:bg-slate-800/60 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Make the effect more visual"
                        >
                          🎬 More Visual
                        </button>

                        {/* Strong idea toggle (retention lever) */}
                        <div className="ml-auto flex items-center gap-2">
                          <button
                            type="button"
                            onClick={toggleStrongIdea}
                            disabled={!ideas}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                              isStrongIdea
                                ? 'border-yellow-500/40 bg-yellow-500/10 text-yellow-200'
                                : 'border-slate-700 bg-slate-900/40 text-slate-200 hover:bg-slate-800/60'
                            }`}
                            title={isStrongIdea ? 'Marked as a strong idea' : 'Mark as a strong idea'}
                          >
                            {isStrongIdea ? '★ Strong Idea' : '☆ Mark Strong'}
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="mt-auto p-2 bg-slate-900/50 flex justify-end gap-2 border-t border-slate-800">
                        {/* Quick favorite indicator (mirrors the strong-idea toggle above) */}
                        <button
                          type="button"
                          onClick={toggleStrongIdea}
                          disabled={!ideas}
                          className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                            isStrongIdea
                              ? 'bg-yellow-500/10 border border-yellow-500/30 text-yellow-200'
                              : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                          }`}
                          title={isStrongIdea ? 'This idea is starred' : 'Star this idea'}
                        >
                          <span aria-hidden="true">{isStrongIdea ? '★' : '☆'}</span>
                          <span className="hidden sm:inline">Star</span>
                        </button>
                        <ShareButton
                            title={`Magic Effect Ideas for: ${items.map(item => item.trim()).filter(item => item !== '').join(', ')}`}
                            text={ideas ?? displayIdeas ?? ''}
                            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200 transition-colors"
                        >
                            <ShareIcon className="w-4 h-4" />
                            <span>Share</span>
                        </ShareButton>
                         <button
                            onClick={handleCopy}
                            disabled={copyStatus === 'copied'}
                            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200 disabled:cursor-default transition-colors"
                        >
                            {copyStatus === 'copied' ? (
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
                            onClick={handleSave}
                            disabled={saveStatus === 'saved'}
                            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200 disabled:cursor-default transition-colors"
                        >
                            {saveStatus === 'saved' ? (
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

                        <button
                            onClick={openImport}
                            disabled={importStatus === 'importing'}
                            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-purple-700/80 hover:bg-purple-700 rounded-md text-slate-100 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                            title="Create a Performance Beat from this effect and add it to a Show"
                        >
                            {importStatus === 'imported' ? (
                              <>
                                <CheckIcon className="w-4 h-4 text-green-300" />
                                <span>Added</span>
                              </>
                            ) : (
                              <>
                                <span className="font-bold">+</span>
                                <span>Add to Show Planner</span>
                              </>
                            )}
                        </button>

                        <button
                            onClick={openConvertToTask}
                            disabled={taskStatus === 'creating'}
                            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-800/70 hover:bg-slate-700 rounded-md text-slate-100 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                            title="Convert this concept into an execution task with subtasks"
                        >
                            {taskStatus === 'created' ? (
                              <>
                                <CheckIcon className="w-4 h-4 text-green-300" />
                                <span>Created</span>
                              </>
                            ) : (
                              <>
                                <span className="text-lg">✓</span>
                                <span>Convert to Task</span>
                              </>
                            )}
                        </button>
                    </div>

                    {isImportOpen && (
                      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                        <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 shadow-xl">
                          <div className="p-4 border-b border-slate-800">
                            <h3 className="text-slate-100 font-bold text-lg">Add to Show Planner</h3>
                            <p className="text-slate-400 text-sm mt-1">Select a show and choose which generated effect to import as a Performance Beat.</p>
                          </div>

                          <div className="p-4 space-y-4">
                            <div>
                              <label className="block text-sm font-medium text-slate-300 mb-1">Show</label>
                              <select
                                value={selectedShowId}
                                onChange={(e) => setSelectedShowId(e.target.value)}
                                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white focus:outline-none focus:border-purple-500"
                              >
                                <option value="">Select a show…</option>
                                {(Array.isArray(shows) ? shows : []).map((s: any) => (
                                  <option key={s.id} value={s.id}>{s.title}</option>
                                ))}
                              </select>
                              {!Array.isArray(shows) || shows.length === 0 ? (
                                <p className="text-xs text-slate-500 mt-1">No shows found yet. Create one in Show Planner first.</p>
                              ) : null}
                            </div>

                            <div>
                              <label className="block text-sm font-medium text-slate-300 mb-1">Effect</label>
                              <select
                                value={String(selectedEffectIndex)}
                                onChange={(e) => setSelectedEffectIndex(Number(e.target.value))}
                                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white focus:outline-none focus:border-purple-500"
                              >
                                {(parsedEffects.length ? parsedEffects : [{ name: 'Effect 1', premise: '', experience: '' }]).map((ef, idx) => (
                                  <option key={idx} value={idx}>{idx + 1}. {ef.name || `Effect ${idx + 1}`}</option>
                                ))}
                              </select>
                              {parsedEffects.length === 0 ? (
                                <p className="text-xs text-slate-500 mt-1">Could not parse effect headings. Import will still try the first effect.</p>
                              ) : null}
                            </div>
                          </div>

                          <div className="p-4 border-t border-slate-800 flex justify-end gap-2">
                            <button
                              onClick={() => setIsImportOpen(false)}
                              className="px-3 py-2 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handleImportToShowPlanner}
                              disabled={importStatus === 'importing'}
                              className="px-4 py-2 rounded-md bg-purple-600 hover:bg-purple-700 text-white font-bold disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                            >
                              {importStatus === 'importing' ? 'Adding…' : 'Add Beat'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {isTaskOpen && (
                      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                        <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 shadow-xl">
                          <div className="p-4 border-b border-slate-800">
                            <h3 className="text-slate-100 font-bold text-lg">Convert to Task</h3>
                            <p className="text-slate-400 text-sm mt-1">Create an execution task with a few practical subtasks (prototype, prep, test, script) inside a Show.</p>
                          </div>

                          <div className="p-4 space-y-4">
                            <div>
                              <label className="block text-sm font-medium text-slate-300 mb-1">Show</label>
                              <select
                                value={taskShowId}
                                onChange={(e) => setTaskShowId(e.target.value)}
                                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white focus:outline-none focus:border-purple-500"
                              >
                                <option value="">Select a show…</option>
                                {(Array.isArray(shows) ? shows : []).map((s: any) => (
                                  <option key={s.id} value={s.id}>{s.title}</option>
                                ))}
                              </select>
                              {!Array.isArray(shows) || shows.length === 0 ? (
                                <p className="text-xs text-slate-500 mt-1">No shows found yet. Create one in Show Planner first.</p>
                              ) : null}
                            </div>

                            <div>
                              <label className="block text-sm font-medium text-slate-300 mb-1">Effect</label>
                              <select
                                value={String(taskEffectIndex)}
                                onChange={(e) => setTaskEffectIndex(Number(e.target.value))}
                                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white focus:outline-none focus:border-purple-500"
                              >
                                {(parsedEffects.length ? parsedEffects : [{ name: 'Effect 1', premise: '', experience: '' }]).map((ef, idx) => (
                                  <option key={idx} value={idx}>{idx + 1}. {ef.name || `Effect ${idx + 1}`}</option>
                                ))}
                              </select>
                              {parsedEffects.length === 0 ? (
                                <p className="text-xs text-slate-500 mt-1">Could not parse effect headings. Task will still use the first effect.</p>
                              ) : null}
                            </div>

                            <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-3">
                              <div className="text-xs font-semibold text-slate-300 mb-2">Subtasks that will be created</div>
                              <ul className="text-sm text-slate-300 list-disc ml-5 space-y-1">
                                <li>Build prototype</li>
                                <li>Order / prepare gimmick</li>
                                <li>Test handling &amp; timing</li>
                                <li>Write / refine patter</li>
                              </ul>
                            </div>
                          </div>

                          <div className="p-4 border-t border-slate-800 flex justify-end gap-2">
                            <button
                              onClick={() => setIsTaskOpen(false)}
                              className="px-3 py-2 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handleConvertToTask}
                              disabled={taskStatus === 'creating'}
                              className="px-4 py-2 rounded-md bg-purple-600 hover:bg-purple-700 text-white font-bold disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                            >
                              {taskStatus === 'creating' ? 'Creating…' : 'Create Task'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                </div>
            ) : (
                <div className="flex-1 flex items-center justify-center text-center text-slate-500 p-4">
                    <div>
                        <LightbulbIcon className="w-24 h-24 mx-auto mb-4" />
                        <p>Your generated effect ideas will appear here.</p>
                    </div>
                </div>
            )}
        </div>
    </main>
  );
};

export default EffectGenerator;
