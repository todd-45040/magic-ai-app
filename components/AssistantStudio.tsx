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

const PRESETS: Array<{ label: string; template: (input: string) => string; tag?: string }> = [
  {
    label: 'Generate Cue Sheet',
    tag: 'cue-sheet',
    template: (input) =>
      `Build an assistant cue sheet timeline for this routine. Include simple time stamps, movement cues, prop handoffs, and reveal preparation.\n\nROUTINE:\n${input}`,
  },
  {
    label: 'Tighten Blocking',
    tag: 'blocking',
    template: (input) =>
      `Improve the blocking for this routine. Simplify movement, reduce dead time, and make assistant positions cleaner and more motivated.\n\nROUTINE:\n${input}`,
  },
  {
    label: 'Improve Transitions',
    tag: 'transitions',
    template: (input) =>
      `Improve transitions between moments in this routine. Focus on assistant movement, prop flow, handoffs, and stage traffic.\n\nROUTINE:\n${input}`,
  },
  {
    label: 'Prop Flow Pass',
    tag: 'props',
    template: (input) =>
      `Optimize prop movement for this routine. Clarify where props start, who moves them, and how resets happen smoothly.\n\nROUTINE:\n${input}`,
  },
  {
    label: 'Reveal Choreography',
    tag: 'reveal',
    template: (input) =>
      `Design cleaner reveal choreography for this routine. Focus on timing, assistant framing, audience sightlines, and clean final picture.\n\nROUTINE:\n${input}`,
  },
  {
    label: 'Safety Check',
    tag: 'safety',
    template: (input) =>
      `Review this routine for assistant safety, collision risks, traffic flow, rushed handoffs, and awkward stage crossings.\n\nROUTINE:\n${input}`,
  },
];

const DRAFT_KEY = 'maw_assistant_studio_draft_v4';
const CONTEXT_KEY = 'maw_assistant_studio_context_v2';
const REQUEST_TIMEOUT_MS = 45_000;

type ErrorKind = 'timeout' | 'quota' | 'other' | null;

type SectionKey =
  | 'stageLayout'
  | 'blockingPlan'
  | 'assistantPositions'
  | 'cueTiming'
  | 'propMovement'
  | 'revealChoreography'
  | 'cueTimeline'
  | 'fullText';

type StructuredOutput = Partial<Record<SectionKey, string>>;

const TABS: Array<{ key: SectionKey; label: string }> = [
  { key: 'stageLayout', label: 'Stage Layout' },
  { key: 'blockingPlan', label: 'Blocking Plan' },
  { key: 'assistantPositions', label: 'Assistant Positions' },
  { key: 'cueTiming', label: 'Cue Timing' },
  { key: 'propMovement', label: 'Prop Movement' },
  { key: 'revealChoreography', label: 'Reveal Choreography' },
  { key: 'cueTimeline', label: 'Cue Timeline' },
  { key: 'fullText', label: 'Full Text' },
];

const REFINE_ACTIONS: Array<{ label: string; instruction: string }> = [
  { label: 'Tighter cues', instruction: 'Tighten the cue timeline. Make each cue shorter, clearer, and easier for an assistant to follow in rehearsal.' },
  { label: 'Cleaner blocking', instruction: 'Improve blocking. Reduce unnecessary crossings and make every assistant movement feel motivated.' },
  { label: 'Simpler staging', instruction: 'Simplify the staging for a practical real-world performance with less complexity and fewer moving parts.' },
  { label: 'Safer traffic', instruction: 'Improve safety and traffic flow. Flag risky crossings, collisions, rushed turns, or awkward prop movement.' },
  { label: 'Stronger reveal', instruction: 'Strengthen the reveal choreography and final stage picture without adding unrealistic complexity.' },
];

const VENUE_TYPES = [
  'Theater / Stage',
  'Parlor',
  'Close-up / Walkaround',
  'Corporate',
  'School',
  'Festival / Street',
  'Restaurant',
  'Wedding',
  'Birthday / Family',
  'Other',
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

function detectQuotaError(message: string) {
  const m = (message || '').toLowerCase();
  return (
    m.includes('quota') ||
    m.includes('resource_exhausted') ||
    m.includes('rate limit') ||
    m.includes('too many') ||
    m.includes('429') ||
    m.includes('limit reached') ||
    m.includes('daily') ||
    m.includes('exceeded')
  );
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
  const afterStart = raw.slice(start + header.length);
  const nextIdxs = nextHeaders
    .map((h) => {
      const idx = afterStart.indexOf(h);
      return idx === -1 ? Number.POSITIVE_INFINITY : idx;
    })
    .filter((n) => Number.isFinite(n));

  const endRel = nextIdxs.length ? Math.min(...nextIdxs) : afterStart.length;
  return afterStart.slice(0, endRel).trim();
}

function parseStructured(raw: string): StructuredOutput {
  const headers = {
    stageLayout: '### STAGE_LAYOUT',
    blockingPlan: '### BLOCKING_PLAN',
    assistantPositions: '### ASSISTANT_POSITIONS',
    cueTiming: '### CUE_TIMING',
    propMovement: '### PROP_MOVEMENT',
    revealChoreography: '### REVEAL_CHOREOGRAPHY',
    cueTimeline: '### CUE_TIMELINE',
  } as const;

  const out: StructuredOutput = { fullText: raw?.trim() || '' };
  if (!raw.includes(headers.stageLayout)) return out;

  const all = Object.values(headers);
  out.stageLayout = extractSection(raw, headers.stageLayout, all.filter((h) => h !== headers.stageLayout));
  out.blockingPlan = extractSection(raw, headers.blockingPlan, all.filter((h) => h !== headers.blockingPlan));
  out.assistantPositions = extractSection(raw, headers.assistantPositions, all.filter((h) => h !== headers.assistantPositions));
  out.cueTiming = extractSection(raw, headers.cueTiming, all.filter((h) => h !== headers.cueTiming));
  out.propMovement = extractSection(raw, headers.propMovement, all.filter((h) => h !== headers.propMovement));
  out.revealChoreography = extractSection(raw, headers.revealChoreography, all.filter((h) => h !== headers.revealChoreography));
  out.cueTimeline = extractSection(raw, headers.cueTimeline, all.filter((h) => h !== headers.cueTimeline));
  return out;
}

function buildStructuredPrompt(opts: {
  userInput: string;
  refineInstruction?: string | null;
  previousOutput?: string | null;
  context?: {
    stageSize?: string;
    assistantsCount?: string;
    audienceDistance?: string;
    venueType?: string;
  };
}) {
  const { userInput, refineInstruction, previousOutput, context } = opts;

  const contextLines: string[] = [];
  if (context?.stageSize) contextLines.push(`Stage size: ${context.stageSize}`);
  if (context?.assistantsCount) contextLines.push(`Number of assistants: ${context.assistantsCount}`);
  if (context?.audienceDistance) contextLines.push(`Audience distance: ${context.audienceDistance}`);
  if (context?.venueType) contextLines.push(`Venue type: ${context.venueType}`);

  const contextBlock = contextLines.length ? `\n\nCONTEXT:\n${contextLines.join('\n')}` : '';

  const refineBlock =
    refineInstruction && previousOutput
      ? `\n\nREFINE REQUEST: ${refineInstruction}\n\nPREVIOUS OUTPUT (for refinement):\n${previousOutput}`
      : '';

  return (
    `You are building a practical assistant cue plan for a magician's routine.` +
    `\n\nReturn your answer in EXACTLY this format, using these headings only:` +
    `\n### STAGE_LAYOUT` +
    `\nDescribe the playing area, tables, entrances, reveal zones, and general positioning.` +
    `\n### BLOCKING_PLAN` +
    `\nGive a simple beat-by-beat blocking plan for performer and assistant movement.` +
    `\n### ASSISTANT_POSITIONS` +
    `\nList assistant starting positions and where they move during key beats.` +
    `\n### CUE_TIMING` +
    `\nExplain the important timing moments, cue triggers, and what the assistant watches/listens for.` +
    `\n### PROP_MOVEMENT` +
    `\nExplain how props move on/off stage, handoffs, and reset-friendly flow.` +
    `\n### REVEAL_CHOREOGRAPHY` +
    `\nDescribe reveal preparation, framing, body positioning, and final picture.` +
    `\n### CUE_TIMELINE` +
    `\nProvide a practical assistant cue sheet timeline using simple mm:ss style stamps, one cue per line.` +
    `\nUse practical stage language. Favor realistic staging. Do not assume trap doors, rigging, hidden infrastructure, or special stage modifications unless clearly provided. Keep guidance safe, concise, and rehearsal-ready.` +
    contextBlock +
    `\n\nROUTINE DESCRIPTION / SCRIPT / OUTLINE:\n${userInput}` +
    refineBlock
  );
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
  const [errorDebug, setErrorDebug] = useState<string>('');

  const [toast, setToast] = useState<string | null>(null);

  const [stageSize, setStageSize] = useState('');
  const [assistantsCount, setAssistantsCount] = useState('');
  const [audienceDistance, setAudienceDistance] = useState('');
  const [venueType, setVenueType] = useState('');
  const [lastPreset, setLastPreset] = useState('');

  const requestIdRef = useRef(0);
  const cancelledUpToRef = useRef(0);
  const outputRef = useRef<HTMLDivElement | null>(null);

  const [shows, setShows] = useState<Show[]>([]);
  const [showPickerOpen, setShowPickerOpen] = useState(false);
  const [selectedShowId, setSelectedShowId] = useState<string>('');
  const [sendMode, setSendMode] = useState<'run' | 'sections'>('sections');

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
        setAssistantsCount(parsed?.assistantsCount || '');
        setAudienceDistance(parsed?.audienceDistance || '');
        setVenueType(parsed?.venueType || '');
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, input);
    } catch {
      // ignore
    }
  }, [input]);

  useEffect(() => {
    try {
      localStorage.setItem(CONTEXT_KEY, JSON.stringify({ stageSize, assistantsCount, audienceDistance, venueType }));
    } catch {
      // ignore
    }
  }, [stageSize, assistantsCount, audienceDistance, venueType]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const list = await getShows();
        if (!mounted) return;
        setShows(list || []);
        if ((list || []).length > 0) setSelectedShowId((list || [])[0].id);
      } catch {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!outputRaw) return;
    window.setTimeout(() => {
      outputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }, [outputRaw]);

  const canGenerate = !!input.trim() && !loading;

  const clearErrors = () => {
    setErrorKind(null);
    setErrorMsg(null);
    setErrorDebug('');
  };

  const hardUnlock = (message?: string) => {
    setLoading(false);
    if (message) {
      setToast(message);
      window.setTimeout(() => setToast(null), 1200);
    }
  };

  const quotaMessage = () => {
    const tier = (currentUser?.membership || 'free').toLowerCase();
    if (tier.includes('trial')) return 'You may have hit a trial usage limit. Upgrade to continue without interruptions.';
    if (tier.includes('free')) return 'Free tier limit reached. Upgrade to keep generating without daily caps.';
    return 'Usage limit reached. If this seems wrong, try again in a bit or contact support.';
  };

  const runGenerate = async (opts?: { refineInstruction?: string; usePrevious?: boolean }) => {
    if (!input.trim()) return;
    const myId = ++requestIdRef.current;

    try {
      setLoading(true);
      clearErrors();
      setToast(null);

      const prompt = buildStructuredPrompt({
        userInput: input.trim(),
        refineInstruction: opts?.refineInstruction || null,
        previousOutput: opts?.usePrevious ? outputRaw : null,
        context: { stageSize, assistantsCount, audienceDistance, venueType },
      });

      const text = await withTimeout(
        generateResponse(prompt, ASSISTANT_STUDIO_SYSTEM_INSTRUCTION, currentUser),
        REQUEST_TIMEOUT_MS
      );

      if (cancelledUpToRef.current >= myId) return;

      setOutputRaw(text);
      const parsed = parseStructured(text);
      setOutput(parsed);
      setActiveTab(parsed.stageLayout ? 'stageLayout' : 'fullText');
    } catch (e: any) {
      console.error(e);

      if (e?.message === 'TIMEOUT') {
        setErrorKind('timeout');
        setErrorMsg('This took too long and was stopped to keep the app responsive.');
        setErrorDebug(`timeout_ms=${REQUEST_TIMEOUT_MS}; reqId=${myId}`);
      } else {
        const msg = e?.message || 'Something went wrong.';
        const isQuota = detectQuotaError(msg);
        setErrorKind(isQuota ? 'quota' : 'other');
        setErrorMsg(msg);
        setErrorDebug(`reqId=${myId}; membership=${currentUser?.membership || 'unknown'}`);
      }
    } finally {
      if (requestIdRef.current === myId) setLoading(false);
    }
  };

  const handleGenerate = () => runGenerate();

  const handleRefine = async (instruction: string) => {
    if (!outputRaw) return;
    await runGenerate({ refineInstruction: instruction, usePrevious: true });
    setToast('Refined ✓');
    window.setTimeout(() => setToast(null), 900);
  };

  const handleCancel = () => {
    cancelledUpToRef.current = requestIdRef.current;
    hardUnlock('Cancelled');
  };

  const clearContext = () => {
    setStageSize('');
    setAssistantsCount('');
    setAudienceDistance('');
    setVenueType('');
    setToast('Context cleared');
    window.setTimeout(() => setToast(null), 900);
  };

  const handleReset = () => {
    cancelledUpToRef.current = requestIdRef.current;
    hardUnlock();
    clearErrors();
    setOutputRaw('');
    setOutput({});
    setActiveTab('stageLayout');
    setInput('');
    setCopied(false);
    setLastPreset('');
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // ignore
    }
  };

  const handleCopy = async () => {
    if (!outputRaw) return;
    try {
      const textToCopy = activeTab === 'fullText' ? outputRaw : output?.[activeTab] || outputRaw;
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  };

  const handleSaveIdea = async () => {
    if (!outputRaw) return;
    try {
      const tags = [
        'assistant-studio',
        'staging-plan',
        'cue-sheet',
        ...(lastPreset ? [lastPreset] : []),
        ...(venueType ? [venueType.toLowerCase().replace(/\s+/g, '-')] : []),
      ];

      await saveIdea({
        type: 'text',
        title: 'Assistant Studio Output',
        content: outputRaw,
        tags,
      });

      onIdeaSaved?.();
      setToast('Saved to Ideas ✓');
      window.setTimeout(() => setToast(null), 1400);
    } catch (e) {
      console.error(e);
      setErrorKind('other');
      setErrorMsg('Could not save this idea. (Check Supabase auth / RLS)');
      setErrorDebug('saveIdea_failed');
    }
  };

  const openBlueprint = () => {
    setBlueprintName(
      blueprintName ||
        (lastPreset ? `Blueprint – ${lastPreset.replace(/-/g, ' ')}` : 'Blueprint – Assistant Studio')
    );
    setBlueprintOpen(true);
  };

  const saveBlueprint = async () => {
    if (!outputRaw) return;

    setSavingBlueprint(true);
    clearErrors();
    setToast(null);

    const header = [
      `BLUEPRINT: ${blueprintName || 'Assistant Studio Blueprint'}`,
      `Preset: ${lastPreset || '—'}`,
      stageSize ? `Stage size: ${stageSize}` : '',
      assistantsCount ? `Assistants: ${assistantsCount}` : '',
      audienceDistance ? `Audience distance: ${audienceDistance}` : '',
      venueType ? `Venue: ${venueType}` : '',
      '',
      '---',
      '',
    ]
      .filter(Boolean)
      .join('\n');

    const tags = [
      'assistant-studio',
      'blueprint',
      'cue-sheet',
      ...(lastPreset ? [lastPreset] : []),
      ...(venueType ? [venueType.toLowerCase().replace(/\s+/g, '-')] : []),
    ];

    try {
      await saveIdea({
        type: 'text',
        title: blueprintName || 'Assistant Studio Blueprint',
        content: header + outputRaw,
        tags,
      });

      setBlueprintOpen(false);
      setToast('Blueprint saved ✓');
      window.setTimeout(() => setToast(null), 1500);
    } catch (e: any) {
      console.error(e);
      setErrorKind('other');
      setErrorMsg(e?.message || 'Could not save blueprint.');
      setErrorDebug('saveBlueprint_failed');
    } finally {
      setSavingBlueprint(false);
    }
  };

  const openSend = () => setShowPickerOpen(true);

  const sendToShowPlanner = async () => {
    if (!selectedShowId || !outputRaw) return;
    setSending(true);
    setToast(null);
    clearErrors();

    let tasks: Partial<Task>[] = [];

    if (sendMode === 'run') {
      tasks = [
        { title: 'Assistant Studio – Stage Layout', notes: output.stageLayout || outputRaw, priority: 'medium' as any },
        { title: 'Assistant Studio – Blocking Plan', notes: output.blockingPlan || outputRaw, priority: 'medium' as any },
        { title: 'Assistant Studio – Cue Timing', notes: output.cueTiming || outputRaw, priority: 'high' as any },
        { title: 'Assistant Studio – Cue Timeline', notes: output.cueTimeline || outputRaw, priority: 'high' as any },
      ];
    } else {
      tasks = [
        { title: 'Assistant Studio – Stage Layout', notes: output.stageLayout || outputRaw, priority: 'medium' as any },
        { title: 'Assistant Studio – Blocking Plan', notes: output.blockingPlan || outputRaw, priority: 'medium' as any },
        { title: 'Assistant Studio – Assistant Positions', notes: output.assistantPositions || outputRaw, priority: 'medium' as any },
        { title: 'Assistant Studio – Cue Timing', notes: output.cueTiming || outputRaw, priority: 'high' as any },
        { title: 'Assistant Studio – Prop Movement', notes: output.propMovement || outputRaw, priority: 'medium' as any },
        { title: 'Assistant Studio – Reveal Choreography', notes: output.revealChoreography || outputRaw, priority: 'medium' as any },
        { title: 'Assistant Studio – Cue Timeline', notes: output.cueTimeline || outputRaw, priority: 'high' as any },
      ];
    }

    try {
      await addTasksToShow(selectedShowId, tasks);
      setShowPickerOpen(false);
      setToast('Sent to Show Planner ✓');
      window.setTimeout(() => setToast(null), 1600);
    } catch (e: any) {
      console.error(e);
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
    const base = input.trim();
    setInput(preset.template(base || '[Paste the routine description here]'));
    setLastPreset(preset.tag || preset.label.toLowerCase().replace(/\s+/g, '-'));
    setToast(`Preset: ${preset.label}`);
    window.setTimeout(() => setToast(null), 900);
  };

  const reportIssue = async () => {
    const payload = [
      '[Magic AI Wizard] Assistant Studio Issue',
      `time=${new Date().toISOString()}`,
      `membership=${currentUser?.membership || 'unknown'}`,
      errorKind ? `kind=${errorKind}` : '',
      errorMsg ? `message=${errorMsg}` : '',
      errorDebug ? `debug=${errorDebug}` : '',
      `prompt_len=${input?.length || 0}`,
    ]
      .filter(Boolean)
      .join('\n');
    try {
      await navigator.clipboard.writeText(payload);
      setToast('Issue details copied ✓');
      window.setTimeout(() => setToast(null), 1400);
    } catch {
      // ignore
    }
  };

  const renderTabContent = () => {
    const value = activeTab === 'fullText' ? outputRaw : output?.[activeTab] || '';
    if (!value && activeTab !== 'fullText') {
      return (
        <div className="text-slate-400 text-sm">
          This section isn’t available yet. Try generating again — the model sometimes returns fewer sections.
        </div>
      );
    }
    return <div className="whitespace-pre-wrap text-slate-100 leading-relaxed">{value || outputRaw}</div>;
  };

  const availableTabs = useMemo(() => {
    const base = TABS.filter((t) => {
      if (t.key === 'fullText') return true;
      return !!output?.[t.key];
    });
    if (!outputRaw) return base;
    if (!output.stageLayout) return [{ key: 'fullText', label: 'Full Text' }];
    if (!base.find((t) => t.key === 'fullText')) base.push({ key: 'fullText', label: 'Full Text' });
    return base;
  }, [output, outputRaw]);

  const contextSummary = useMemo(() => {
    const parts: string[] = [];
    if (stageSize) parts.push(stageSize);
    if (assistantsCount) parts.push(`${assistantsCount} assistants`);
    if (audienceDistance) parts.push(audienceDistance);
    if (venueType) parts.push(venueType);
    return parts.join(' • ');
  }, [stageSize, assistantsCount, audienceDistance, venueType]);

  return (
    <div className="relative p-6 pb-24 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Assistant&apos;s Studio</h1>
          {contextSummary ? (
            <div className="text-xs text-slate-400">
              Context: <span className="text-slate-200">{contextSummary}</span>
            </div>
          ) : (
            <div className="text-[11px] italic text-slate-500/80">Design the choreography behind the magic.</div>
          )}
        </div>

        <div className="text-sm text-slate-400 min-h-[1.25rem]">{toast ? <span className="text-emerald-400">{toast}</span> : null}</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p, idx) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(idx)}
                className="px-3 py-1.5 rounded-full border border-slate-700 bg-slate-950/50 hover:bg-slate-950/70 hover:border-slate-500 text-sm"
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-400">Routine staging context (optional):</div>
            <button
              type="button"
              onClick={clearContext}
              className="text-xs px-2 py-1 rounded border border-slate-700 hover:border-slate-500 text-slate-200"
              disabled={!stageSize && !assistantsCount && !audienceDistance && !venueType}
            >
              Clear context
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <input
              value={stageSize}
              onChange={(e) => setStageSize(e.target.value)}
              placeholder="Stage size"
              className="p-2 rounded bg-slate-950/50 border border-slate-700 text-white placeholder:text-slate-500"
            />
            <input
              value={assistantsCount}
              onChange={(e) => setAssistantsCount(e.target.value)}
              placeholder="Number of assistants"
              className="p-2 rounded bg-slate-950/50 border border-slate-700 text-white placeholder:text-slate-500"
            />
            <input
              value={audienceDistance}
              onChange={(e) => setAudienceDistance(e.target.value)}
              placeholder="Audience distance"
              className="p-2 rounded bg-slate-950/50 border border-slate-700 text-white placeholder:text-slate-500"
            />
            <select
              value={venueType}
              onChange={(e) => setVenueType(e.target.value)}
              className="p-2 rounded bg-slate-950/50 border border-slate-700 text-white"
            >
              <option value="">Venue type</option>
              {VENUE_TYPES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div className="text-xs font-medium text-slate-300">Routine / illusion description</div>
          <textarea
            className="w-full p-3 border border-slate-700 rounded bg-slate-950/50 text-white min-h-[260px] placeholder:text-slate-500"
            rows={10}
            placeholder="Paste your routine script, staging notes, or illusion outline here…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onTextKeyDown}
          />

          <div className="text-xs text-slate-500">
            Shortcut: <span className="text-slate-300">Ctrl/Cmd + Enter</span> to generate •{' '}
            <span className="text-slate-300">Esc</span> to cancel
          </div>

          <div className="pt-3 border-t border-slate-800/60">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="text-xs text-slate-400">Refine this assistant plan:</div>
              {lastPreset ? (
                <div className="text-xs text-slate-500">
                  Preset: <span className="text-slate-300">{lastPreset}</span>
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {REFINE_ACTIONS.map((r) => (
                <button
                  key={r.label}
                  type="button"
                  onClick={() => handleRefine(r.instruction)}
                  disabled={!outputRaw || loading}
                  className="px-3 py-1.5 rounded-full border border-slate-700 bg-slate-950/50 hover:bg-slate-950/70 hover:border-slate-500 text-sm disabled:opacity-40"
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div ref={outputRef} className="space-y-3">
          {errorKind && (
            <div className="maw-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold text-slate-100">
                    {errorKind === 'timeout'
                      ? 'Timed out'
                      : errorKind === 'quota'
                      ? 'Usage limit reached'
                      : 'Something went wrong'}
                  </div>

                  <div className="mt-1 text-sm text-slate-300">
                    {errorKind === 'timeout'
                      ? 'The request was stopped after 45 seconds so the app never gets stuck.'
                      : errorKind === 'quota'
                      ? quotaMessage()
                      : 'Please try again. If it keeps happening, report it so we can fix it fast.'}
                  </div>

                  {errorKind !== 'quota' && errorMsg && errorKind !== 'timeout' && (
                    <div className="mt-2 text-xs text-slate-500 break-words">{errorMsg}</div>
                  )}
                </div>

                <div className="flex flex-col gap-2 min-w-[140px]">
                  <button
                    className="px-3 py-2 rounded bg-purple-600 hover:bg-purple-500 text-white"
                    onClick={handleGenerate}
                    disabled={!input.trim() || loading}
                  >
                    Retry
                  </button>
                  <button
                    className="px-3 py-2 rounded border border-slate-600 hover:border-slate-400 text-slate-200"
                    onClick={handleReset}
                  >
                    Reset
                  </button>
                  <button
                    className="px-3 py-2 rounded border border-slate-600 hover:border-slate-400 text-slate-200"
                    onClick={reportIssue}
                  >
                    Report issue
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="maw-card p-3 min-h-[380px]">
            {!outputRaw && !loading ? (
              <div className="text-slate-400 text-sm">
                <div>Your results will appear here.</div>
                <div className="mt-2">Try: “Generate Cue Sheet” or “Tighten Blocking”, then hit Generate.</div>
              </div>
            ) : loading ? (
              <div className="space-y-3">
                <div className="text-sm text-slate-300">Generating assistant staging plan and cue timeline…</div>
                <Skeleton />
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-2 mb-3 border-b border-slate-800 pb-3">
                  {availableTabs.map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setActiveTab(t.key)}
                      className={`px-3 py-1.5 rounded-full text-sm border ${
                        activeTab === t.key
                          ? 'bg-purple-600 border-purple-500 text-white'
                          : 'bg-slate-950/50 border-slate-700 hover:border-slate-500 text-slate-200'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                {renderTabContent()}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-slate-800 bg-[#050816]/95 backdrop-blur">
        <div className="max-w-[1600px] mx-auto px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="px-4 py-2 rounded border border-slate-700 hover:border-slate-500 text-slate-100"
            >
              Reset / Clear
            </button>
            {loading ? (
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 rounded bg-rose-600 hover:bg-rose-500 text-white"
              >
                Cancel
              </button>
            ) : (
              <button
                type="button"
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="px-6 py-2 rounded bg-purple-700 hover:bg-purple-600 disabled:opacity-40 text-white"
              >
                Generate
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              disabled={!outputRaw || loading}
              className="px-4 py-2 rounded border border-slate-700 hover:border-slate-500 text-slate-100 disabled:opacity-40"
            >
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
            <button
              type="button"
              onClick={handleSaveIdea}
              disabled={!outputRaw || loading}
              className="px-4 py-2 rounded bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-40"
            >
              Save
            </button>
            <button
              type="button"
              onClick={openBlueprint}
              disabled={!outputRaw || loading}
              className="px-4 py-2 rounded border border-slate-700 hover:border-slate-500 text-slate-100 disabled:opacity-40"
            >
              Save Blueprint
            </button>
            <button
              type="button"
              onClick={openSend}
              disabled={!outputRaw || loading}
              className="px-4 py-2 rounded border border-slate-700 hover:border-slate-500 text-slate-100 disabled:opacity-40"
            >
              Send to Show Planner
            </button>
          </div>
        </div>
      </div>

      {showPickerOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-xl maw-card p-5 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-100">Send to Show Planner</h3>
              <p className="text-sm text-slate-400">Choose a show and how to convert this assistant plan into tasks.</p>
            </div>

            <div className="space-y-3">
              <select
                value={selectedShowId}
                onChange={(e) => setSelectedShowId(e.target.value)}
                className="w-full p-2 rounded bg-slate-950/50 border border-slate-700 text-white"
              >
                <option value="">Select a show</option>
                {shows.map((show) => (
                  <option key={show.id} value={show.id}>
                    {show.title}
                  </option>
                ))}
              </select>

              <div className="flex flex-wrap gap-3 text-sm text-slate-200">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={sendMode === 'sections'}
                    onChange={() => setSendMode('sections')}
                    className="accent-purple-500"
                  />
                  Send each section as its own task
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={sendMode === 'run'}
                    onChange={() => setSendMode('run')}
                    className="accent-purple-500"
                  />
                  Send condensed run plan
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowPickerOpen(false)}
                className="px-4 py-2 rounded border border-slate-700 hover:border-slate-500 text-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={sendToShowPlanner}
                disabled={!selectedShowId || sending}
                className="px-4 py-2 rounded bg-purple-700 hover:bg-purple-600 disabled:opacity-40 text-white"
              >
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {blueprintOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-lg maw-card p-5 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-100">Save Blueprint</h3>
              <p className="text-sm text-slate-400">Save this assistant staging plan as a reusable blueprint.</p>
            </div>

            <input
              value={blueprintName}
              onChange={(e) => setBlueprintName(e.target.value)}
              placeholder="Blueprint name"
              className="w-full p-2 rounded bg-slate-950/50 border border-slate-700 text-white placeholder:text-slate-500"
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setBlueprintOpen(false)}
                className="px-4 py-2 rounded border border-slate-700 hover:border-slate-500 text-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveBlueprint}
                disabled={!outputRaw || savingBlueprint}
                className="px-4 py-2 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white"
              >
                {savingBlueprint ? 'Saving…' : 'Save Blueprint'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
