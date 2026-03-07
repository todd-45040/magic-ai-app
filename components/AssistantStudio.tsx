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
    label: 'Routine Staging Optimizer',
    tag: 'staging-optimizer',
    template: (input) =>
      `Create a practical staging optimization plan for this routine. Focus on stage layout, assistant blocking, positions, cue timing, prop movement, and final reveal choreography.\n\nROUTINE DESCRIPTION:\n${input}`,
  },
  {
    label: 'Tighten Blocking',
    tag: 'tighten-blocking',
    template: (input) =>
      `Tighten the blocking for this routine. Reduce wasted movement, clarify assistant jobs, and improve sightlines.\n\nROUTINE DESCRIPTION:\n${input}`,
  },
  {
    label: 'Safer Prop Flow',
    tag: 'prop-flow',
    template: (input) =>
      `Improve prop movement and backstage flow for this routine. Emphasize safety, reset practicality, and clean handoffs.\n\nROUTINE DESCRIPTION:\n${input}`,
  },
  {
    label: 'Stronger Reveal',
    tag: 'stronger-reveal',
    template: (input) =>
      `Strengthen the reveal choreography for this routine. Improve timing, framing, assistant position, and visual impact.\n\nROUTINE DESCRIPTION:\n${input}`,
  },
];

const DRAFT_KEY = 'maw_assistant_studio_draft_v4';
const WALKAROUND_KEY = 'maw_assistant_studio_walkaround_v1';
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
  | 'fullText';

type StructuredOutput = Partial<Record<SectionKey, string>>;

const TABS: Array<{ key: SectionKey; label: string }> = [
  { key: 'stageLayout', label: 'Stage Layout' },
  { key: 'blockingPlan', label: 'Blocking Plan' },
  { key: 'assistantPositions', label: 'Assistant Positions' },
  { key: 'cueTiming', label: 'Cue Timing' },
  { key: 'propMovement', label: 'Prop Movement' },
  { key: 'revealChoreography', label: 'Reveal Choreography' },
  { key: 'fullText', label: 'Full Text' },
];

const REFINE_ACTIONS: Array<{ label: string; instruction: string }> = [
  { label: 'Tighter blocking', instruction: 'Tighten the blocking. Remove wasted movement and simplify assistant travel paths.' },
  { label: 'Clearer cues', instruction: 'Make the cue timing clearer and more precise for the assistant team.' },
  { label: 'More visual reveal', instruction: 'Make the reveal choreography more visual and stageworthy without adding unsafe complexity.' },
  { label: 'Safer prop flow', instruction: 'Improve safety and prop traffic. Reduce collisions, awkward handoffs, and reset confusion.' },
  { label: 'Simpler staging', instruction: 'Simplify the staging plan so it is easier to execute reliably in real venues.' },
];

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
  } as const;

  const out: StructuredOutput = { fullText: raw?.trim() || '' };

  if (!raw.includes(headers.stageLayout)) return out;

  const all = Object.values(headers);

  out.stageLayout = extractSection(raw, headers.stageLayout, all.filter((h) => h !== headers.stageLayout));
  out.blockingPlan = extractSection(raw, headers.blockingPlan, all.filter((h) => h !== headers.blockingPlan));
  out.assistantPositions = extractSection(raw, headers.assistantPositions, all.filter((h) => h !== headers.assistantPositions));
  out.cueTiming = extractSection(raw, headers.cueTiming, all.filter((h) => h !== headers.cueTiming));
  out.propMovement = extractSection(raw, headers.propMovement, all.filter((h) => h !== headers.propMovement));
  out.revealChoreography = extractSection(
    raw,
    headers.revealChoreography,
    all.filter((h) => h !== headers.revealChoreography)
  );

  return out;
}

function formatNotesBlock(output: StructuredOutput, fallback: string) {
  const stageLayout = output.stageLayout?.trim();
  const blockingPlan = output.blockingPlan?.trim();
  const assistantPositions = output.assistantPositions?.trim();
  const cueTiming = output.cueTiming?.trim();
  const propMovement = output.propMovement?.trim();
  const revealChoreography = output.revealChoreography?.trim();

  const parts: string[] = [];
  if (stageLayout) parts.push(`STAGE LAYOUT\n${stageLayout}`);
  if (blockingPlan) parts.push(`BLOCKING PLAN\n${blockingPlan}`);
  if (assistantPositions) parts.push(`ASSISTANT POSITIONS\n${assistantPositions}`);
  if (cueTiming) parts.push(`CUE TIMING\n${cueTiming}`);
  if (propMovement) parts.push(`PROP MOVEMENT\n${propMovement}`);
  if (revealChoreography) parts.push(`REVEAL CHOREOGRAPHY\n${revealChoreography}`);

  return parts.length ? parts.join('\n\n') : fallback;
}

function buildStructuredPrompt(opts: {
  userInput: string;
  walkaroundOn: boolean;
  refineInstruction?: string | null;
  previousOutput?: string | null;
  context?: {
    clientName?: string;
    venueType?: string;
    audienceSize?: string;
    stageSize?: string;
    numberOfAssistants?: string;
    audienceDistance?: string;
  };
}) {
  const { userInput, walkaroundOn, refineInstruction, previousOutput, context } = opts;

  const contextLines: string[] = [];
  if (context?.clientName) contextLines.push(`Client / Show: ${context.clientName}`);
  if (context?.venueType) contextLines.push(`Venue type: ${context.venueType}`);
  if (context?.audienceSize) contextLines.push(`Audience size: ${context.audienceSize}`);
  if (context?.stageSize) contextLines.push(`Stage size: ${context.stageSize}`);
  if (context?.numberOfAssistants) contextLines.push(`Number of assistants: ${context.numberOfAssistants}`);
  if (context?.audienceDistance) contextLines.push(`Audience distance: ${context.audienceDistance}`);

  const contextBlock = contextLines.length ? `\n\nCONTEXT:\n${contextLines.join('\n')}` : '';

  const walkaroundGuidance = walkaroundOn
    ? `\n\nWALKAROUND / TIGHT-SPACE OPTIMIZER (ON): prefer shorter travel paths, louder visual cueing, tighter audience management, and reduced prop spread.`
    : '';

  const refineBlock =
    refineInstruction && previousOutput
      ? `\n\nREFINE REQUEST: ${refineInstruction}\n\nPREVIOUS OUTPUT (for refinement):\n${previousOutput}`
      : '';

  return (
    `You are creating a practical Routine Staging Optimizer plan for a magician and their assistant team.` +
    ` Prioritize real-world staging, reliable cueing, clean traffic flow, safety, and visual clarity.` +
    ` Do not expose secret methods. Do not invent trap doors, overhead rigging, hidden infrastructure, or stage modifications unless the user explicitly provides them.` +
    ` If anything sounds unrealistic for the venue, crew, distance, or reset demands, revise it to the most practical version.` +
    `\n\nReturn your answer in EXACTLY this format, using these headings and no extra headings:` +
    `\n### STAGE_LAYOUT` +
    `\nDescribe stage zones, prop-table placement, assistant lanes, and reveal position.` +
    `\n### BLOCKING_PLAN` +
    `\nGive a beat-by-beat blocking plan for the performer and assistant team.` +
    `\n### ASSISTANT_POSITIONS` +
    `\nList where each assistant begins, where they move, and why their placement works.` +
    `\n### CUE_TIMING` +
    `\nProvide a cue sheet with labeled beats or approximate timestamps.` +
    `\n### PROP_MOVEMENT` +
    `\nExplain handoffs, resets, traffic flow, and prop handling safety.` +
    `\n### REVEAL_CHOREOGRAPHY` +
    `\nDescribe the final reveal picture, assistant framing, timing, and cleanup path.` +
    contextBlock +
    `\n\nROUTINE DESCRIPTION:\n${userInput}` +
    walkaroundGuidance +
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

  // Context + Blueprint metadata
  const [clientName, setClientName] = useState('');
  const [venueType, setVenueType] = useState('');
  const [audienceSize, setAudienceSize] = useState('');
  const [stageSize, setStageSize] = useState('');
  const [numberOfAssistants, setNumberOfAssistants] = useState('');
  const [audienceDistance, setAudienceDistance] = useState('');
  const [lastPreset, setLastPreset] = useState<string>('');

  // Walkaround optimizer toggle
  const [walkaroundOn, setWalkaroundOn] = useState(false);

  // “Cancel” support: we can’t abort the network call here,
  // but we can ignore its result and immediately unlock the UI.
  const requestIdRef = useRef(0);
  const cancelledUpToRef = useRef(0);

  // Auto-scroll target
  const outputRef = useRef<HTMLDivElement | null>(null);

  // Show planner modal
  const [shows, setShows] = useState<Show[]>([]);
  const [showPickerOpen, setShowPickerOpen] = useState(false);
  const [selectedShowId, setSelectedShowId] = useState<string>('');
  const [sendMode, setSendMode] = useState<'run' | 'sections'>('run');

  // Blueprint modal
  const [blueprintOpen, setBlueprintOpen] = useState(false);
  const [blueprintName, setBlueprintName] = useState('');
  const [savingBlueprint, setSavingBlueprint] = useState(false);

  // Autosave draft prompt + context + walkaround toggle
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) setInput(saved);
      const w = localStorage.getItem(WALKAROUND_KEY);
      if (w === '1') setWalkaroundOn(true);
      const ctx = localStorage.getItem(CONTEXT_KEY);
      if (ctx) {
        const parsed = JSON.parse(ctx);
        setClientName(parsed?.clientName || '');
        setVenueType(parsed?.venueType || '');
        setAudienceSize(parsed?.audienceSize || '');
        setStageSize(parsed?.stageSize || '');
        setNumberOfAssistants(parsed?.numberOfAssistants || '');
        setAudienceDistance(parsed?.audienceDistance || '');
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
      localStorage.setItem(WALKAROUND_KEY, walkaroundOn ? '1' : '0');
    } catch {
      // ignore
    }
  }, [walkaroundOn]);

  useEffect(() => {
    try {
      localStorage.setItem(CONTEXT_KEY, JSON.stringify({ clientName, venueType, audienceSize, stageSize, numberOfAssistants, audienceDistance }));
    } catch {
      // ignore
    }
  }, [clientName, venueType, audienceSize, stageSize, numberOfAssistants, audienceDistance]);

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
  const canCopySave = !!outputRaw && !loading;

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
        walkaroundOn,
        refineInstruction: opts?.refineInstruction || null,
        previousOutput: opts?.usePrevious ? outputRaw : null,
        context: { clientName, venueType, audienceSize, stageSize, numberOfAssistants, audienceDistance },
      });

      const text = await withTimeout(
        generateResponse(prompt, ASSISTANT_STUDIO_SYSTEM_INSTRUCTION, currentUser),
        REQUEST_TIMEOUT_MS
      );

      if (cancelledUpToRef.current >= myId) return;

      setOutputRaw(text);
      const parsed = parseStructured(text);
      setOutput(parsed);

      if (parsed.stageLayout) setActiveTab('stageLayout');
      else setActiveTab('fullText');
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
    setClientName('');
    setVenueType('');
    setAudienceSize('');
    setStageSize('');
    setNumberOfAssistants('');
    setAudienceDistance('');
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

  const copyPrompt = async () => {
    if (!input) return;
    try {
      await navigator.clipboard.writeText(input);
      setToast('Prompt copied ✓');
      window.setTimeout(() => setToast(null), 1200);
    } catch {
      // ignore
    }
  };

  const handleSaveIdea = async () => {
    if (!outputRaw) return;
    try {
      const tags = [
        'assistant-studio',
        ...(walkaroundOn ? ['walkaround'] : []),
        ...(lastPreset ? [lastPreset] : []),
        ...(venueType ? [venueType.toLowerCase().replace(/\s+/g, '-')] : []),
      ];

      await saveIdea({
        type: 'text',
        title: 'Assistant Studio – Staging Plan',
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

  // Save as Blueprint (stored in Ideas with blueprint tag + metadata header)
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
      `BLUEPRINT: ${blueprintName || 'Assistant Studio Staging Blueprint'}`,
      `Preset: ${lastPreset || '—'}`,
      `Walkaround Optimizer: ${walkaroundOn ? 'ON' : 'OFF'}`,
      clientName ? `Client: ${clientName}` : '',
      venueType ? `Venue: ${venueType}` : '',
      audienceSize ? `Audience: ${audienceSize}` : '',
      '',
      '---',
      '',
    ]
      .filter(Boolean)
      .join('\n');

    const content = header + outputRaw;

    const tags = [
      'assistant-studio',
      'blueprint',
      ...(walkaroundOn ? ['walkaround'] : []),
      ...(lastPreset ? [lastPreset] : []),
      ...(venueType ? [venueType.toLowerCase().replace(/\s+/g, '-')] : []),
    ];

    try {
      await saveIdea({
        type: 'text',
        title: blueprintName || 'Assistant Studio Staging Blueprint',
        content,
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

  // Send to Show Planner as 4-part run OR sections
  const sendToShowPlanner = async () => {
    if (!selectedShowId || !outputRaw) return;
    setSending(true);
    setToast(null);
    clearErrors();

    const directorAndLines = formatNotesBlock(output, outputRaw);
    const cueTiming = output.cueTiming?.trim();

    const makeRunNotes = (part: string) => {
      const parts: string[] = [];
      parts.push(`PART: ${part}`);
      if (cueTiming) parts.push(`\nCUE TIMING\n${cueTiming}`);
      parts.push(`\n${directorAndLines}`);
      if (walkaroundOn) parts.push(`\nTIGHT-SPACE MODE\nPrefer shorter travel paths, visible cueing, and compact prop spread.`);
      return parts.join('\n');
    };

    let tasks: Partial<Task>[] = [];

    if (sendMode === 'run') {
      tasks = [
        { title: 'Opener', notes: makeRunNotes('Opener'), priority: 'high' as any },
        { title: 'Middle 1', notes: makeRunNotes('Middle 1'), priority: 'medium' as any },
        { title: 'Middle 2', notes: makeRunNotes('Middle 2'), priority: 'medium' as any },
        { title: 'Closer', notes: makeRunNotes('Closer'), priority: 'high' as any },
      ];
    } else {
      tasks = [
        { title: 'Assistant Studio – Stage Layout', notes: output.stageLayout || outputRaw, priority: 'medium' as any },
        { title: 'Assistant Studio – Blocking Plan', notes: output.blockingPlan || outputRaw, priority: 'high' as any },
        { title: 'Assistant Studio – Assistant Positions', notes: output.assistantPositions || outputRaw, priority: 'medium' as any },
        { title: 'Assistant Studio – Cue Timing', notes: output.cueTiming || outputRaw, priority: 'high' as any },
        { title: 'Assistant Studio – Prop Movement', notes: output.propMovement || outputRaw, priority: 'medium' as any },
        { title: 'Assistant Studio – Reveal Choreography', notes: output.revealChoreography || outputRaw, priority: 'medium' as any },
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
      handleCancel();
    }
  };

  const applyPreset = (presetIndex: number) => {
    const preset = PRESETS[presetIndex];
    const base = input.trim();
    setInput(preset.template(base || '[Paste your script/notes here]'));
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
    if (!output.stageLayout && !output.blockingPlan && !output.assistantPositions && !output.cueTiming && !output.propMovement && !output.revealChoreography) {
      return [{ key: 'fullText', label: 'Full Text' }];
    }
    if (!base.find((t) => t.key === 'fullText')) base.push({ key: 'fullText', label: 'Full Text' });
    return base;
  }, [output, outputRaw, walkaroundOn]);

  const contextSummary = useMemo(() => {
    const parts: string[] = [];
    if (clientName) parts.push(clientName);
    if (venueType) parts.push(venueType);
    if (stageSize) parts.push(stageSize);
    if (numberOfAssistants) parts.push(`${numberOfAssistants} assistants`);
    if (audienceDistance) parts.push(audienceDistance);
    if (audienceSize) parts.push(`${audienceSize} ppl`);
    return parts.join(' • ');
  }, [clientName, venueType, audienceSize, stageSize, numberOfAssistants, audienceDistance]);

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
            <div className="text-[11px] italic text-slate-500/80">Build a practical staging plan for assistants, cueing, traffic flow, and reveal choreography.</div>
          )}
        </div>

        <div className="text-sm text-slate-400 min-h-[1.25rem]">{toast ? <span className="text-emerald-400">{toast}</span> : null}</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT: Input */}
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

          {/* Context selectors */}
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-400">Routine staging context:</div>
            <button
              type="button"
              onClick={clearContext}
              className="text-xs px-2 py-1 rounded border border-slate-700 hover:border-slate-500 text-slate-200"
              disabled={!clientName && !venueType && !audienceSize && !stageSize && !numberOfAssistants && !audienceDistance}
            >
              Clear context
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Routine / client"
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
            <input
              value={stageSize}
              onChange={(e) => setStageSize(e.target.value)}
              placeholder="Stage size"
              className="p-2 rounded bg-slate-950/50 border border-slate-700 text-white placeholder:text-slate-500"
            />
            <input
              value={numberOfAssistants}
              onChange={(e) => setNumberOfAssistants(e.target.value)}
              placeholder="# of assistants"
              className="p-2 rounded bg-slate-950/50 border border-slate-700 text-white placeholder:text-slate-500"
            />
            <input
              value={audienceDistance}
              onChange={(e) => setAudienceDistance(e.target.value)}
              placeholder="Audience distance"
              className="p-2 rounded bg-slate-950/50 border border-slate-700 text-white placeholder:text-slate-500"
            />
            <input
              value={audienceSize}
              onChange={(e) => setAudienceSize(e.target.value)}
              placeholder="Audience size"
              className="p-2 rounded bg-slate-950/50 border border-slate-700 text-white placeholder:text-slate-500"
            />
          </div>

          {/* Walkaround toggle */}
          <label className="flex items-center gap-2 text-sm text-slate-200 select-none">
            <input
              type="checkbox"
              checked={walkaroundOn}
              onChange={(e) => setWalkaroundOn(e.target.checked)}
              className="h-4 w-4 accent-purple-500"
            />
            Optimize for tight spaces <span className="text-slate-400">(shorter travel paths, cue visibility, crowd mgmt)</span>
          </label>

          <textarea
            className="w-full p-3 border border-slate-700 rounded bg-slate-950/50 text-white min-h-[260px] placeholder:text-slate-500"
            rows={10}
            placeholder="Describe the routine, effect flow, props, reveal, and anything the assistant team currently does or struggles with…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onTextKeyDown}
          />

          <div className="text-xs text-slate-500">
            Shortcut: <span className="text-slate-300">Ctrl/Cmd + Enter</span> to generate •{' '}
            <span className="text-slate-300">Esc</span> to cancel
          </div>

          {/* Refine controls */}
          <div className="pt-3 border-t border-slate-800/60">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="text-xs text-slate-400">Refine this staging plan:</div>
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

        {/* RIGHT: Output */}
        <div ref={outputRef} className="space-y-3">
          {/* Inline tool-level error boundary */}
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

                  {(errorKind === 'timeout' || errorKind === 'quota') && (
                    <button
                      className="px-3 py-2 rounded border border-slate-600 hover:border-slate-400 text-slate-200"
                      onClick={copyPrompt}
                    >
                      Copy prompt
                    </button>
                  )}
                </div>
              </div>

              {errorKind === 'quota' && (
                <div className="mt-3 text-sm text-slate-300">
                  Tip: click <span className="text-slate-100">Membership Types</span> in the footer to upgrade.
                </div>
              )}
            </div>
          )}

          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 min-h-[260px]">
            {loading ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-purple-300">Generating…</div>
                  <div className="h-2 w-24 rounded bg-slate-800 animate-pulse" />
                </div>
                <Skeleton />
              </div>
            ) : outputRaw ? (
              <>
                <div className="flex flex-wrap gap-2 mb-3">
                  {availableTabs.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setActiveTab(t.key)}
                      className={
                        'px-3 py-1.5 rounded-full border text-sm ' +
                        (activeTab === t.key
                          ? 'border-purple-500 bg-purple-500/10 text-purple-200'
                          : 'border-slate-700 bg-slate-950/40 hover:border-slate-500 text-slate-200')
                      }
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {renderTabContent()}
              </>
            ) : (
              <div className="text-slate-400 text-sm space-y-2">
                <div>Your results will appear here.</div>
                <div className="text-slate-500">
                  Try: <span className="text-slate-300">“Routine Staging Optimizer”</span> or{' '}
                  <span className="text-slate-300">“Tighten Blocking”</span>, then hit Generate.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Send to Show Planner modal */}
      {showPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg maw-card p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-lg font-semibold">Send to Show Planner</div>
              <button
                className="px-2 py-1 rounded border border-slate-700 hover:border-slate-500"
                onClick={() => setShowPickerOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="flex flex-col gap-2 text-sm text-slate-200">
                <label className="flex items-center gap-2">
                  <input type="radio" name="sendMode" checked={sendMode === 'run'} onChange={() => setSendMode('run')} />
                  Create 4-part run (Opener / Middle 1 / Middle 2 / Closer)
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="sendMode"
                    checked={sendMode === 'sections'}
                    onChange={() => setSendMode('sections')}
                  />
                  Create section tasks (Stage Layout / Blocking / Cue Timing / etc.)
                </label>
              </div>

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
                    {sending ? 'Sending…' : sendMode === 'run' ? 'Create Opener/Middles/Closer' : 'Create Staging Tasks'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Blueprint modal */}
      {blueprintOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg maw-card p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-lg font-semibold">Save as Blueprint</div>
              <button
                className="px-2 py-1 rounded border border-slate-700 hover:border-slate-500"
                onClick={() => setBlueprintOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <label className="text-sm text-slate-300">Blueprint name</label>
              <input
                value={blueprintName}
                onChange={(e) => setBlueprintName(e.target.value)}
                placeholder="e.g., Corporate Opener Blueprint"
                className="w-full p-2 rounded bg-slate-900 border border-slate-700 text-white placeholder:text-slate-500"
              />

              <div className="text-xs text-slate-400">
                Includes output + preset + tight-space toggle + context (routine, venue, stage, assistants, audience) + tags.
              </div>

              <button
                className="w-full mt-2 px-4 py-2 rounded bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-40"
                disabled={!outputRaw || savingBlueprint}
                onClick={saveBlueprint}
              >
                {savingBlueprint ? 'Saving…' : 'Save Blueprint'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sticky footer controls */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto max-w-7xl px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className="px-3 py-2 rounded bg-transparent border border-slate-600 hover:border-slate-400 text-slate-200"
            >
              Reset / Clear
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className={
                'px-5 py-2 rounded bg-purple-600 hover:bg-purple-500 text-white transition-transform duration-150 ' +
                (!canGenerate
                  ? 'opacity-30'
                  : 'hover:scale-[1.02] shadow-[0_0_18px_0_rgba(168,85,247,0.25)]')
              }
            >
              {loading ? 'Generating…' : 'Generate'}
            </button>
          </div>

          <div className="flex items-center gap-2">
            {loading ? (
              <button
                onClick={handleCancel}
                className="px-3 py-2 rounded border border-slate-600 hover:border-slate-400 text-slate-200"
              >
                Cancel
              </button>
            ) : null}

            <button
              onClick={handleCopy}
              disabled={!canCopySave}
              className="px-3 py-2 rounded border border-slate-600 hover:border-slate-400 text-slate-200 disabled:opacity-40"
            >
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
            <button
              onClick={handleSaveIdea}
              disabled={!canCopySave}
              className="px-3 py-2 rounded bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-40"
            >
              Save
            </button>
            <button
              onClick={openBlueprint}
              disabled={!canCopySave}
              className="px-3 py-2 rounded border border-slate-600 hover:border-slate-400 text-slate-200 disabled:opacity-40"
            >
              Save Blueprint
            </button>
            <button
              onClick={() => (!canCopySave ? null : openSend())}
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
