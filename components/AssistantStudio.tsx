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

const DRAFT_KEY = 'maw_assistant_studio_draft_v5';
const CONTEXT_KEY = 'maw_assistant_studio_context_v3';
const REQUEST_TIMEOUT_MS = 45_000;

type ErrorKind = 'timeout' | 'quota' | 'other' | null;
type SectionKey =
  | 'stageLayout'
  | 'blockingPlan'
  | 'assistantPositions'
  | 'cueTimeline'
  | 'propMovement'
  | 'revealChoreography'
  | 'volunteerPlan'
  | 'assistantInstructions'
  | 'safetyNotes'
  | 'fullText';

type StructuredOutput = Partial<Record<SectionKey, string>>;

const TABS: Array<{ key: SectionKey; label: string }> = [
  { key: 'stageLayout', label: 'Stage Layout' },
  { key: 'blockingPlan', label: 'Blocking Plan' },
  { key: 'assistantPositions', label: 'Assistant Positions' },
  { key: 'cueTimeline', label: 'Cue Timeline' },
  { key: 'propMovement', label: 'Prop Movement' },
  { key: 'revealChoreography', label: 'Reveal Choreography' },
  { key: 'volunteerPlan', label: 'Volunteer Plan' },
  { key: 'assistantInstructions', label: 'Assistant Instructions' },
  { key: 'safetyNotes', label: 'Safety Notes' },
  { key: 'fullText', label: 'Full Text' },
];

const PRESETS: Array<{ label: string; template: (input: string) => string; tag: string }> = [
  {
    label: 'Generate Cue Sheet',
    tag: 'cue-sheet',
    template: (input) => `Create a practical assistant cue sheet with timestamps, handoffs, reveal beats, and clean movement.\n\nROUTINE:\n${input}`,
  },
  {
    label: 'Volunteer Flow',
    tag: 'volunteer-flow',
    template: (input) => `Plan volunteer management for this routine. Include where volunteers stand, how the assistant guides them, and how to avoid exposure.\n\nROUTINE:\n${input}`,
  },
  {
    label: 'Tighten Blocking',
    tag: 'blocking',
    template: (input) => `Tighten the blocking for this routine. Remove dead movement and improve stage pictures.\n\nROUTINE:\n${input}`,
  },
  {
    label: 'Improve Transitions',
    tag: 'transitions',
    template: (input) => `Improve transitions and assistant movement between beats.\n\nROUTINE:\n${input}`,
  },
  {
    label: 'Prop Flow Pass',
    tag: 'prop-flow',
    template: (input) => `Optimize prop flow, handoffs, resets, and table use for the assistant.\n\nROUTINE:\n${input}`,
  },
  {
    label: 'Safety Check',
    tag: 'safety',
    template: (input) => `Check assistant safety, volunteer safety, collision points, and exposure risks.\n\nROUTINE:\n${input}`,
  },
];

const REFINE_ACTIONS = [
  { label: 'Tighten blocking', instruction: 'Tighten the blocking: reduce wasted movement and simplify paths.' },
  { label: 'Cleaner cues', instruction: 'Make the cueing cleaner: tighten timing, handoffs, and stage crossings.' },
  { label: 'Volunteer flow', instruction: 'Strengthen volunteer flow and clarify where assistants guide volunteers.' },
  { label: 'Safer staging', instruction: 'Increase safety: identify collisions, awkward traffic, and unsafe volunteer positions.' },
  { label: 'More portable', instruction: 'Make the routine more portable and efficient with simpler prop movement and resets.' },
] as const;

const VENUE_TYPES = [
  'Corporate',
  'Birthday / Family',
  'School',
  'Wedding',
  'Restaurant',
  'Festival / Street',
  'Theater / Stage',
  'Close-up / Walkaround',
  'Other',
];

function Skeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-4 rounded bg-slate-800 animate-pulse" style={{ width: `${60 + i * 5}%` }} />
      ))}
    </div>
  );
}

function detectQuotaError(message: string) {
  const m = (message || '').toLowerCase();
  return m.includes('quota') || m.includes('resource_exhausted') || m.includes('rate limit') || m.includes('429');
}

function withTimeout<T>(promise: Promise<T>, ms: number) {
  let t: number | undefined;
  const timeout = new Promise<T>((_, reject) => {
    t = window.setTimeout(() => reject(new Error('TIMEOUT')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (t) window.clearTimeout(t);
  });
}

function extractSection(raw: string, header: string, nextHeaders: string[]) {
  const start = raw.indexOf(header);
  if (start === -1) return '';
  const after = raw.slice(start + header.length);
  const end = nextHeaders
    .map((h) => after.indexOf(h))
    .filter((n) => n >= 0)
    .sort((a, b) => a - b)[0];
  return after.slice(0, end ?? after.length).trim();
}

function parseStructured(raw: string): StructuredOutput {
  const headers = {
    stageLayout: '### STAGE_LAYOUT',
    blockingPlan: '### BLOCKING_PLAN',
    assistantPositions: '### ASSISTANT_POSITIONS',
    cueTimeline: '### CUE_TIMELINE',
    propMovement: '### PROP_MOVEMENT',
    revealChoreography: '### REVEAL_CHOREOGRAPHY',
    volunteerPlan: '### VOLUNTEER_PLAN',
    assistantInstructions: '### ASSISTANT_INSTRUCTIONS',
    safetyNotes: '### SAFETY_NOTES',
  } as const;

  const out: StructuredOutput = { fullText: raw?.trim() || '' };
  if (!raw.includes(headers.stageLayout)) return out;
  const all = Object.values(headers);
  (Object.keys(headers) as Array<keyof typeof headers>).forEach((k) => {
    out[k] = extractSection(raw, headers[k], all.filter((h) => h !== headers[k]));
  });
  return out;
}

function buildStructuredPrompt(opts: {
  userInput: string;
  refineInstruction?: string | null;
  previousOutput?: string | null;
  context?: { stageSize?: string; numberOfAssistants?: string; audienceDistance?: string; venueType?: string };
}) {
  const { userInput, refineInstruction, previousOutput, context } = opts;
  const contextLines: string[] = [];
  if (context?.stageSize) contextLines.push(`Stage size: ${context.stageSize}`);
  if (context?.numberOfAssistants) contextLines.push(`Number of assistants: ${context.numberOfAssistants}`);
  if (context?.audienceDistance) contextLines.push(`Audience distance: ${context.audienceDistance}`);
  if (context?.venueType) contextLines.push(`Venue type: ${context.venueType}`);
  const contextBlock = contextLines.length ? `\n\nCONTEXT:\n${contextLines.join('\n')}` : '';
  const refineBlock =
    refineInstruction && previousOutput
      ? `\n\nREFINE REQUEST: ${refineInstruction}\n\nPREVIOUS OUTPUT:\n${previousOutput}`
      : '';

  return (
    `Return your answer in EXACTLY this format with no extra headings:` +
    `\n### STAGE_LAYOUT\nDescribe the stage picture, table placement, performer zone, assistant lanes, and volunteer area.` +
    `\n### BLOCKING_PLAN\nGive a beat-by-beat blocking plan.` +
    `\n### ASSISTANT_POSITIONS\nState where the assistant starts, moves, waits, and finishes.` +
    `\n### CUE_TIMELINE\nProvide a simple cue sheet with timestamps like 00:00, 00:15, 00:40.` +
    `\n### PROP_MOVEMENT\nList handoffs, retrievals, resets, and table movement.` +
    `\n### REVEAL_CHOREOGRAPHY\nDescribe the assistant's role in the reveal and how focus is controlled.` +
    `\n### VOLUNTEER_PLAN\nExplain where volunteers stand, how assistants guide them, and how exposure is avoided.` +
    `\n### ASSISTANT_INSTRUCTIONS\nGive practical assistant coaching notes in short bullets.` +
    `\n### SAFETY_NOTES\nList safety notes, visibility concerns, collision risks, and volunteer reminders.` +
    contextBlock +
    `\n\nROUTINE SCRIPT OR OUTLINE:\n${userInput}` +
    refineBlock
  );
}

function formatNotesBlock(output: StructuredOutput, fallback: string) {
  const parts: string[] = [];
  if (output.blockingPlan?.trim()) parts.push(`BLOCKING PLAN\n${output.blockingPlan.trim()}`);
  if (output.assistantPositions?.trim()) parts.push(`ASSISTANT POSITIONS\n${output.assistantPositions.trim()}`);
  if (output.cueTimeline?.trim()) parts.push(`CUE TIMELINE\n${output.cueTimeline.trim()}`);
  if (output.volunteerPlan?.trim()) parts.push(`VOLUNTEER PLAN\n${output.volunteerPlan.trim()}`);
  if (output.safetyNotes?.trim()) parts.push(`SAFETY NOTES\n${output.safetyNotes.trim()}`);
  return parts.length ? parts.join('\n\n') : fallback;
}

export default function AssistantStudio({ user, onIdeaSaved }: Props) {
  const currentUser = useMemo(() => user || GUEST_USER, [user]);
  const [input, setInput] = useState('');
  const [outputRaw, setOutputRaw] = useState('');
  const [output, setOutput] = useState<StructuredOutput>({});
  const [activeTab, setActiveTab] = useState<SectionKey>('stageLayout');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorKind, setErrorKind] = useState<ErrorKind>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorDebug, setErrorDebug] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [stageSize, setStageSize] = useState('');
  const [venueType, setVenueType] = useState('');
  const [audienceDistance, setAudienceDistance] = useState('');
  const [numberOfAssistants, setNumberOfAssistants] = useState('');
  const [lastPreset, setLastPreset] = useState('');
  const requestIdRef = useRef(0);
  const cancelledUpToRef = useRef(0);
  const outputRef = useRef<HTMLDivElement | null>(null);
  const [shows, setShows] = useState<Show[]>([]);
  const [showPickerOpen, setShowPickerOpen] = useState(false);
  const [selectedShowId, setSelectedShowId] = useState('');
  const [sendMode, setSendMode] = useState<'run' | 'sections'>('run');
  const [blueprintOpen, setBlueprintOpen] = useState(false);
  const [blueprintName, setBlueprintName] = useState('');
  const [savingBlueprint, setSavingBlueprint] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) setInput(saved);
      const ctx = localStorage.getItem(CONTEXT_KEY);
      if (ctx) {
        const parsed = JSON.parse(ctx);
        setStageSize(parsed?.stageSize || '');
        setVenueType(parsed?.venueType || '');
        setAudienceDistance(parsed?.audienceDistance || '');
        setNumberOfAssistants(parsed?.numberOfAssistants || '');
      }
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, input); } catch {}
  }, [input]);

  useEffect(() => {
    try {
      localStorage.setItem(CONTEXT_KEY, JSON.stringify({ stageSize, venueType, audienceDistance, numberOfAssistants }));
    } catch {}
  }, [stageSize, venueType, audienceDistance, numberOfAssistants]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const list = await getShows();
        if (!mounted) return;
        setShows(list || []);
        if ((list || []).length) setSelectedShowId((list || [])[0].id);
      } catch {}
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!outputRaw) return;
    window.setTimeout(() => outputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }, [outputRaw]);

  const canGenerate = !!input.trim() && !loading;
  const canCopySave = !!outputRaw && !loading;

  const clearErrors = () => {
    setErrorKind(null);
    setErrorMsg(null);
    setErrorDebug('');
  };

  const quotaMessage = () => {
    const tier = (currentUser?.membership || 'free').toLowerCase();
    if (tier.includes('trial')) return 'You may have hit a trial usage limit. Upgrade to continue.';
    if (tier.includes('free')) return 'Free tier limit reached. Upgrade to keep generating.';
    return 'Usage limit reached. Try again in a bit or contact support.';
  };

  const runGenerate = async (opts?: { refineInstruction?: string; usePrevious?: boolean }) => {
    if (!input.trim()) return;
    const myId = ++requestIdRef.current;
    setLoading(true);
    clearErrors();
    setToast(null);
    try {
      const prompt = buildStructuredPrompt({
        userInput: input.trim(),
        refineInstruction: opts?.refineInstruction || null,
        previousOutput: opts?.usePrevious ? outputRaw : null,
        context: { stageSize, numberOfAssistants, audienceDistance, venueType },
      });
      const text = await withTimeout(generateResponse(prompt, ASSISTANT_STUDIO_SYSTEM_INSTRUCTION, currentUser), REQUEST_TIMEOUT_MS);
      if (cancelledUpToRef.current >= myId) return;
      if (String(text).startsWith('Error:')) throw new Error(String(text));
      setOutputRaw(text);
      const parsed = parseStructured(text);
      setOutput(parsed);
      setActiveTab(parsed.stageLayout ? 'stageLayout' : 'fullText');
    } catch (e: any) {
      if (e?.message === 'TIMEOUT') {
        setErrorKind('timeout');
        setErrorMsg('The request was stopped after 45 seconds.');
      } else if (detectQuotaError(e?.message || '')) {
        setErrorKind('quota');
        setErrorMsg(e?.message || 'Usage limit reached.');
      } else {
        setErrorKind('other');
        setErrorMsg(e?.message || 'Something went wrong.');
      }
      setErrorDebug(String(e?.message || 'unknown_error'));
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = () => runGenerate();
  const handleRefine = (instruction: string) => runGenerate({ refineInstruction: instruction, usePrevious: true });
  const handleCancel = () => {
    cancelledUpToRef.current = requestIdRef.current;
    setLoading(false);
    setToast('Stopped');
    window.setTimeout(() => setToast(null), 1000);
  };
  const handleReset = () => {
    clearErrors();
    setOutputRaw('');
    setOutput({});
    setInput('');
    setActiveTab('stageLayout');
    setCopied(false);
    setLastPreset('');
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
  };

  const handleCopy = async () => {
    if (!outputRaw) return;
    const textToCopy = activeTab === 'fullText' ? outputRaw : output[activeTab] || outputRaw;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {}
  };

  const handleSaveIdea = async () => {
    if (!outputRaw) return;
    try {
      await saveIdea({
        type: 'text',
        title: 'Assistant Studio Output',
        content: outputRaw,
        tags: ['assistant-studio', 'staging', 'volunteer-plan', ...(lastPreset ? [lastPreset] : [])],
      });
      onIdeaSaved?.();
      setToast('Saved to Ideas ✓');
      window.setTimeout(() => setToast(null), 1400);
    } catch (e: any) {
      setErrorKind('other');
      setErrorMsg(e?.message || 'Could not save this idea.');
    }
  };

  const openBlueprint = () => {
    setBlueprintName(blueprintName || 'Assistant Studio Blueprint');
    setBlueprintOpen(true);
  };

  const saveBlueprint = async () => {
    if (!outputRaw) return;
    setSavingBlueprint(true);
    try {
      const header = [
        `BLUEPRINT: ${blueprintName || 'Assistant Studio Blueprint'}`,
        `Preset: ${lastPreset || '—'}`,
        `Stage size: ${stageSize || '—'}`,
        `Assistants: ${numberOfAssistants || '—'}`,
        `Audience distance: ${audienceDistance || '—'}`,
        venueType ? `Venue: ${venueType}` : '',
        '', '---', ''
      ].filter(Boolean).join('\n');
      await saveIdea({
        type: 'text',
        title: blueprintName || 'Assistant Studio Blueprint',
        content: `${header}${outputRaw}`,
        tags: ['assistant-studio', 'blueprint', 'staging'],
      });
      setBlueprintOpen(false);
      setToast('Blueprint saved ✓');
      window.setTimeout(() => setToast(null), 1500);
    } catch (e: any) {
      setErrorKind('other');
      setErrorMsg(e?.message || 'Could not save blueprint.');
    } finally {
      setSavingBlueprint(false);
    }
  };

  const sendToShowPlanner = async () => {
    if (!selectedShowId || !outputRaw) return;
    setSending(true);
    clearErrors();
    try {
      const notes = formatNotesBlock(output, outputRaw);
      let tasks: Partial<Task>[] = [];
      if (sendMode === 'run') {
        tasks = [
          { title: 'Staging Run – Opening', notes, priority: 'High' as any },
          { title: 'Staging Run – Middle A', notes, priority: 'Medium' as any },
          { title: 'Staging Run – Middle B', notes, priority: 'Medium' as any },
          { title: 'Staging Run – Reveal', notes, priority: 'High' as any },
        ];
      } else {
        tasks = [
          { title: 'Assistant Studio – Stage Layout', notes: output.stageLayout || outputRaw, priority: 'Medium' as any },
          { title: 'Assistant Studio – Blocking Plan', notes: output.blockingPlan || outputRaw, priority: 'Medium' as any },
          { title: 'Assistant Studio – Cue Timeline', notes: output.cueTimeline || outputRaw, priority: 'Medium' as any },
          { title: 'Assistant Studio – Volunteer Plan', notes: output.volunteerPlan || outputRaw, priority: 'Medium' as any },
          { title: 'Assistant Studio – Safety Notes', notes: output.safetyNotes || outputRaw, priority: 'Medium' as any },
        ];
      }
      await addTasksToShow(selectedShowId, tasks);
      setShowPickerOpen(false);
      setToast('Sent to Show Planner ✓');
      window.setTimeout(() => setToast(null), 1600);
    } catch (e: any) {
      setErrorKind('other');
      setErrorMsg(e?.message || 'Could not send to Show Planner.');
      setErrorDebug('sendToShowPlanner_failed');
    } finally {
      setSending(false);
    }
  };

  const onTextKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
    const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
    if (cmdOrCtrl && e.key === 'Enter') {
      e.preventDefault();
      if (canGenerate) handleGenerate();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  const applyPreset = (presetIndex: number) => {
    const preset = PRESETS[presetIndex];
    const base = input.trim() || '[Paste your routine outline here]';
    setInput(preset.template(base));
    setLastPreset(preset.tag);
    setToast(`Preset: ${preset.label}`);
    window.setTimeout(() => setToast(null), 900);
  };

  const renderTabContent = () => {
    const value = activeTab === 'fullText' ? outputRaw : output[activeTab] || '';
    if (!value && activeTab !== 'fullText') {
      return <div className="text-slate-400 text-sm">This section is not available in the current response.</div>;
    }
    return <div className="whitespace-pre-wrap text-slate-100 leading-relaxed">{value || outputRaw}</div>;
  };

  const availableTabs = useMemo(() => {
    const base = TABS.filter((t) => t.key === 'fullText' || !!output[t.key]);
    if (!outputRaw) return base;
    const hasStructured = TABS.some((t) => t.key !== 'fullText' && !!output[t.key]);
    return hasStructured ? base : [{ key: 'fullText', label: 'Full Text' }];
  }, [output, outputRaw]);

  const contextSummary = useMemo(() => {
    const parts: string[] = [];
    if (stageSize) parts.push(stageSize);
    if (venueType) parts.push(venueType);
    if (numberOfAssistants) parts.push(`${numberOfAssistants} assistant${numberOfAssistants === '1' ? '' : 's'}`);
    if (audienceDistance) parts.push(`Audience: ${audienceDistance}`);
    return parts.join(' • ');
  }, [stageSize, venueType, numberOfAssistants, audienceDistance]);

  return (
    <div className="relative p-6 pb-24 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Assistant&apos;s Studio</h1>
          {contextSummary ? (
            <div className="text-xs text-slate-400">Context: <span className="text-slate-200">{contextSummary}</span></div>
          ) : (
            <div className="text-[11px] italic text-slate-500/80">Optional context makes staging and volunteer guidance feel made for this performance.</div>
          )}
        </div>
        <div className="text-sm text-slate-400 min-h-[1.25rem]">{toast ? <span className="text-emerald-400">{toast}</span> : null}</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p, idx) => (
              <button key={p.label} type="button" onClick={() => applyPreset(idx)} className="px-3 py-1.5 rounded-full border border-slate-700 bg-slate-950/50 hover:bg-slate-950/70 hover:border-slate-500 text-sm">
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-400">Staging context (optional):</div>
            <button type="button" onClick={() => { setStageSize(''); setVenueType(''); setAudienceDistance(''); setNumberOfAssistants(''); }} className="text-xs px-2 py-1 rounded border border-slate-700 hover:border-slate-500 text-slate-200" disabled={!stageSize && !venueType && !audienceDistance && !numberOfAssistants}>
              Clear context
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <input value={stageSize} onChange={(e) => setStageSize(e.target.value)} placeholder="Stage size (e.g. 24x16 ft)" className="p-2 rounded bg-slate-950/50 border border-slate-700 text-white placeholder:text-slate-500" />
            <select value={venueType} onChange={(e) => setVenueType(e.target.value)} className="p-2 rounded bg-slate-950/50 border border-slate-700 text-white">
              <option value="">Venue type</option>
              {VENUE_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
            <input value={numberOfAssistants} onChange={(e) => setNumberOfAssistants(e.target.value)} placeholder="Number of assistants" className="p-2 rounded bg-slate-950/50 border border-slate-700 text-white placeholder:text-slate-500" />
            <input value={audienceDistance} onChange={(e) => setAudienceDistance(e.target.value)} placeholder="Audience distance" className="p-2 rounded bg-slate-950/50 border border-slate-700 text-white placeholder:text-slate-500" />
          </div>

          <textarea className="w-full p-3 border border-slate-700 rounded bg-slate-950/50 text-white min-h-[260px] placeholder:text-slate-500" rows={10} placeholder="Paste the routine script or outline here. Include volunteer moments, reveals, prop handoffs, and any assistant responsibilities…" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onTextKeyDown} />

          <div className="text-xs text-slate-500">Shortcut: <span className="text-slate-300">Ctrl/Cmd + Enter</span> to generate • <span className="text-slate-300">Esc</span> to cancel</div>

          <div className="pt-3 border-t border-slate-800/60">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="text-xs text-slate-400">Refine this plan:</div>
              {lastPreset ? <div className="text-xs text-slate-500">Preset: <span className="text-slate-300">{lastPreset}</span></div> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {REFINE_ACTIONS.map((r) => (
                <button key={r.label} type="button" onClick={() => handleRefine(r.instruction)} disabled={!outputRaw || loading} className="px-3 py-1.5 rounded-full border border-slate-700 bg-slate-950/50 hover:bg-slate-950/70 hover:border-slate-500 text-sm disabled:opacity-40">
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div ref={outputRef} className="space-y-3">
          {errorKind && (
            <div className="maw-card p-4">
              <div className="text-lg font-semibold text-slate-100">{errorKind === 'timeout' ? 'Timed out' : errorKind === 'quota' ? 'Usage limit reached' : 'Something went wrong'}</div>
              <div className="mt-1 text-sm text-slate-300">{errorKind === 'quota' ? quotaMessage() : errorMsg}</div>
              {errorDebug ? <div className="mt-2 text-xs text-slate-500 break-words">{errorDebug}</div> : null}
            </div>
          )}

          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 min-h-[260px]">
            {loading ? (
              <div className="space-y-4"><div className="text-sm text-purple-300">Generating…</div><Skeleton /></div>
            ) : outputRaw ? (
              <>
                <div className="flex flex-wrap gap-2 mb-3">
                  {availableTabs.map((t) => (
                    <button key={t.key} type="button" onClick={() => setActiveTab(t.key)} className={'px-3 py-1.5 rounded-full border text-sm ' + (activeTab === t.key ? 'border-purple-500 bg-purple-500/10 text-purple-200' : 'border-slate-700 bg-slate-950/40 hover:border-slate-500 text-slate-200')}>
                      {t.label}
                    </button>
                  ))}
                </div>
                {renderTabContent()}
              </>
            ) : (
              <div className="text-slate-400 text-sm space-y-2">
                <div>Your results will appear here.</div>
                <div className="text-slate-500">Try: <span className="text-slate-300">“Generate Cue Sheet”</span> or <span className="text-slate-300">“Volunteer Flow”</span>, then hit Generate.</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg maw-card p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-lg font-semibold">Send to Show Planner</div>
              <button className="px-2 py-1 rounded border border-slate-700 hover:border-slate-500" onClick={() => setShowPickerOpen(false)}>Close</button>
            </div>
            <div className="mt-4 space-y-4">
              <div className="flex flex-col gap-2 text-sm text-slate-200">
                <label className="flex items-center gap-2"><input type="radio" name="sendMode" checked={sendMode === 'run'} onChange={() => setSendMode('run')} />Create 4-part staging run (Opening / Middle A / Middle B / Reveal)</label>
                <label className="flex items-center gap-2"><input type="radio" name="sendMode" checked={sendMode === 'sections'} onChange={() => setSendMode('sections')} />Create section tasks (Layout / Blocking / Cue Timeline / Volunteer Plan / Safety)</label>
              </div>
              {shows.length === 0 ? (
                <div className="text-slate-300 text-sm">No shows found. Create a show in <span className="text-slate-100">Show Planner</span> first.</div>
              ) : (
                <>
                  <label className="text-sm text-slate-300">Choose a show</label>
                  <select className="w-full p-2 rounded bg-slate-900 border border-slate-700" value={selectedShowId} onChange={(e) => setSelectedShowId(e.target.value)}>
                    {shows.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </select>
                  <button className="w-full mt-2 px-4 py-2 rounded bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-40" disabled={!selectedShowId || sending} onClick={sendToShowPlanner}>
                    {sending ? 'Sending…' : sendMode === 'run' ? 'Create Staging Run Tasks' : 'Create Section Tasks'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {blueprintOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg maw-card p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-lg font-semibold">Save as Blueprint</div>
              <button className="px-2 py-1 rounded border border-slate-700 hover:border-slate-500" onClick={() => setBlueprintOpen(false)}>Close</button>
            </div>
            <div className="mt-4 space-y-3">
              <label className="text-sm text-slate-300">Blueprint name</label>
              <input value={blueprintName} onChange={(e) => setBlueprintName(e.target.value)} placeholder="e.g., Levitation Assistant Cue Blueprint" className="w-full p-2 rounded bg-slate-900 border border-slate-700 text-white placeholder:text-slate-500" />
              <div className="text-xs text-slate-400">Includes output + preset + context (stage size / assistants / audience distance / venue) + tags.</div>
              <button className="w-full mt-2 px-4 py-2 rounded bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-40" disabled={!outputRaw || savingBlueprint} onClick={saveBlueprint}>
                {savingBlueprint ? 'Saving…' : 'Save Blueprint'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto max-w-7xl px-6 py-3 flex items-center justify-between gap-3">
          <button onClick={handleReset} className="px-3 py-2 rounded bg-transparent border border-slate-600 hover:border-slate-400 text-slate-200">Reset / Clear</button>
          <div className="flex items-center gap-2">
            <button onClick={handleGenerate} disabled={!canGenerate} className={'px-5 py-2 rounded bg-purple-600 hover:bg-purple-500 text-white ' + (!canGenerate ? 'opacity-30' : 'shadow-[0_0_18px_0_rgba(168,85,247,0.25)]')}>
              {loading ? 'Generating…' : 'Generate'}
            </button>
            {loading ? <button onClick={handleCancel} className="px-3 py-2 rounded border border-slate-600 hover:border-slate-400 text-slate-200">Cancel</button> : null}
            <button onClick={handleCopy} disabled={!canCopySave} className="px-3 py-2 rounded border border-slate-600 hover:border-slate-400 text-slate-200 disabled:opacity-40">{copied ? 'Copied ✓' : 'Copy'}</button>
            <button onClick={handleSaveIdea} disabled={!canCopySave} className="px-3 py-2 rounded bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-40">Save</button>
            <button onClick={openBlueprint} disabled={!canCopySave} className="px-3 py-2 rounded border border-slate-600 hover:border-slate-400 text-slate-200 disabled:opacity-40">Save Blueprint</button>
            <button onClick={() => canCopySave && setShowPickerOpen(true)} disabled={!canCopySave} className="px-3 py-2 rounded border border-slate-600 hover:border-slate-400 text-slate-200 disabled:opacity-40">Send to Show Planner</button>
          </div>
        </div>
      </div>
    </div>
  );
}
