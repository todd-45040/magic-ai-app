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

const REQUEST_TIMEOUT_MS = 45_000;
const DRAFT_KEY = 'maw_assistant_studio_phase6_draft';
const CONTEXT_KEY = 'maw_assistant_studio_phase6_context';

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
  | 'misdirectionWindows'
  | 'propTableLayout'
  | 'resetOrder'
  | 'assistantAccessPath'
  | 'transitionPlan'
  | 'lightingCues'
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
  { key: 'misdirectionWindows', label: 'Misdirection Windows' },
  { key: 'propTableLayout', label: 'Prop Table Layout' },
  { key: 'resetOrder', label: 'Reset Order' },
  { key: 'assistantAccessPath', label: 'Access Path' },
  { key: 'transitionPlan', label: 'Transition Plan' },
  { key: 'lightingCues', label: 'Lighting Cues' },
  { key: 'fullText', label: 'Full Text' },
];

const PRESETS: Array<{ label: string; template: (input: string) => string; tag: string }> = [
  {
    label: 'Routine Staging',
    tag: 'routine-staging',
    template: (input) =>
      `Create a practical routine staging plan for this magic routine. Focus on stage layout, blocking, assistant positions, cue timing, prop movement, reveal choreography, and smooth transitions.\n\nROUTINE DESCRIPTION:\n${input}`,
  },
  {
    label: 'Generate Cue Sheet',
    tag: 'cue-sheet',
    template: (input) =>
      `Turn this routine into an assistant cue sheet with a timestamped cue timeline and short action lines.\n\nROUTINE DESCRIPTION:\n${input}`,
  },
  {
    label: 'Volunteer Flow',
    tag: 'volunteer-flow',
    template: (input) =>
      `Plan volunteer staging and assistant guidance for this routine. Include where volunteers stand, how they enter/exit, and how to avoid exposure.\n\nROUTINE DESCRIPTION:\n${input}`,
  },
  {
    label: 'Misdirection Timing',
    tag: 'misdirection-timing',
    template: (input) =>
      `Analyze this routine for critical misdirection windows. Identify the moment, assistant action, and recommended timing.\n\nROUTINE DESCRIPTION:\n${input}`,
  },
  {
    label: 'Prop Table Layout',
    tag: 'prop-table-layout',
    template: (input) =>
      `Design an efficient prop table layout, reset order, and assistant access path for this routine.\n\nROUTINE DESCRIPTION:\n${input}`,
  },
  {
    label: 'Transition Flow',
    tag: 'transition-flow',
    template: (input) =>
      `Create a transition flow plan for this routine. Focus on assistant movement, reset order, lighting cues, and applause-cover actions between beats.\n\nROUTINE DESCRIPTION:\n${input}`,
  },
  {
    label: 'Safety Check',
    tag: 'safety-check',
    template: (input) =>
      `Review this routine for safety, assistant traffic, volunteer handling, prop hazards, and reveal exposure risks.\n\nROUTINE DESCRIPTION:\n${input}`,
  },
];

const REFINE_ACTIONS: Array<{ label: string; instruction: string }> = [
  { label: 'Tighter blocking', instruction: 'Tighten the blocking and simplify crossings. Reduce unnecessary assistant movement.' },
  { label: 'Stronger misdirection', instruction: 'Strengthen the misdirection timing. Emphasize attention shifts and assistant positioning.' },
  { label: 'Faster prop retrieval', instruction: 'Optimize for faster prop retrieval and cleaner access from the prop table.' },
  { label: 'Simplify reset', instruction: 'Simplify the reset order and remove extra handling between beats.' },
  { label: 'Cleaner transitions', instruction: 'Improve transition flow with clearer assistant movement and cleaner lighting cue timing.' },
  { label: 'Safer volunteer flow', instruction: 'Make volunteer handling safer, clearer, and less exposure-prone.' },
];

const VENUE_TYPES = [
  'Close-up / Walkaround',
  'Parlor',
  'Theater / Stage',
  'Corporate',
  'School',
  'Festival / Street',
  'Cruise / Resort',
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
    cueTimeline: '### CUE_TIMELINE',
    propMovement: '### PROP_MOVEMENT',
    revealChoreography: '### REVEAL_CHOREOGRAPHY',
    volunteerPlan: '### VOLUNTEER_PLAN',
    assistantInstructions: '### ASSISTANT_INSTRUCTIONS',
    safetyNotes: '### SAFETY_NOTES',
    misdirectionWindows: '### MISDIRECTION_WINDOWS',
    propTableLayout: '### PROP_TABLE_LAYOUT',
    resetOrder: '### RESET_ORDER',
    assistantAccessPath: '### ASSISTANT_ACCESS_PATH',
    transitionPlan: '### TRANSITION_PLAN',
    lightingCues: '### LIGHTING_CUES',
  } as const;

  const out: StructuredOutput = { fullText: raw?.trim() || '' };
  if (!raw.includes(headers.stageLayout)) return out;
  const all = Object.values(headers);

  (Object.keys(headers) as Array<Exclude<SectionKey, 'fullText'>>).forEach((key) => {
    out[key] = extractSection(raw, headers[key], all.filter((h) => h !== headers[key]));
  });

  return out;
}

function formatSectionBundle(output: StructuredOutput, keys: SectionKey[]) {
  return keys
    .map((key) => {
      const value = output[key]?.trim();
      if (!value) return null;
      const tab = TABS.find((t) => t.key === key);
      return `${tab?.label?.toUpperCase() || key}\n${value}`;
    })
    .filter(Boolean)
    .join('\n\n');
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
    lightingNotes?: string;
  };
}) {
  const { userInput, refineInstruction, previousOutput, context } = opts;

  const contextLines: string[] = [];
  if (context?.stageSize) contextLines.push(`Stage size: ${context.stageSize}`);
  if (context?.assistantsCount) contextLines.push(`Number of assistants: ${context.assistantsCount}`);
  if (context?.audienceDistance) contextLines.push(`Audience distance: ${context.audienceDistance}`);
  if (context?.venueType) contextLines.push(`Venue type: ${context.venueType}`);
  if (context?.lightingNotes) contextLines.push(`Lighting notes: ${context.lightingNotes}`);

  const contextBlock = contextLines.length ? `\n\nCONTEXT:\n${contextLines.join('\n')}` : '';
  const refineBlock =
    refineInstruction && previousOutput
      ? `\n\nREFINE REQUEST: ${refineInstruction}\n\nPREVIOUS OUTPUT:\n${previousOutput}`
      : '';

  return (
    `You are creating an assistant operations plan for a magic routine. Be practical, stage-aware, and specific.` +
    `\n\nReturn your answer in EXACTLY this format using these headings and no others:` +
    `\n### STAGE_LAYOUT` +
    `\nDescribe stage zones, performer area, prop table location, volunteer area, and assistant traffic lanes.` +
    `\n### BLOCKING_PLAN` +
    `\nDescribe the key stage movement beat by beat.` +
    `\n### ASSISTANT_POSITIONS` +
    `\nList assistant positions for opening, key beats, and finale.` +
    `\n### CUE_TIMELINE` +
    `\nProvide a timestamped cue sheet using mm:ss format.` +
    `\n### PROP_MOVEMENT` +
    `\nList who moves what and when.` +
    `\n### REVEAL_CHOREOGRAPHY` +
    `\nExplain the reveal flow from the audience perspective without exposing secrets.` +
    `\n### VOLUNTEER_PLAN` +
    `\nExplain where volunteers stand, how they enter/exit, and how assistants guide them.` +
    `\n### ASSISTANT_INSTRUCTIONS` +
    `\nGive concise practical instructions the assistant can follow during rehearsal.` +
    `\n### SAFETY_NOTES` +
    `\nList safety and exposure-avoidance reminders.` +
    `\n### MISDIRECTION_WINDOWS` +
    `\nIdentify 2-4 critical misdirection moments. For each: Moment, Assistant Action, Recommended Timing.` +
    `\n### PROP_TABLE_LAYOUT` +
    `\nDescribe ideal prop table organization by rows or zones.` +
    `\n### RESET_ORDER` +
    `\nGive the reset order immediately after the routine.` +
    `\n### ASSISTANT_ACCESS_PATH` +
    `\nState the fastest and safest assistant access path to props and staging zones.` +
    `\n### TRANSITION_PLAN` +
    `\nExplain transition flow between routine beats or between this routine and the next piece. Include assistant movement, prop reset order, and applause cover.` +
    `\n### LIGHTING_CUES` +
    `\nProvide simple, practical lighting cues that support transitions and reveals.` +
    contextBlock +
    `\n\nUSER INPUT:\n${userInput}` +
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
  const [errorDebug, setErrorDebug] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const [stageSize, setStageSize] = useState('');
  const [assistantsCount, setAssistantsCount] = useState('1');
  const [audienceDistance, setAudienceDistance] = useState('');
  const [venueType, setVenueType] = useState('');
  const [lightingNotes, setLightingNotes] = useState('');
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
        setAssistantsCount(parsed?.assistantsCount || '1');
        setAudienceDistance(parsed?.audienceDistance || '');
        setVenueType(parsed?.venueType || '');
        setLightingNotes(parsed?.lightingNotes || '');
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
      localStorage.setItem(
        CONTEXT_KEY,
        JSON.stringify({ stageSize, assistantsCount, audienceDistance, venueType, lightingNotes })
      );
    } catch {
      // ignore
    }
  }, [stageSize, assistantsCount, audienceDistance, venueType, lightingNotes]);

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
        refineInstruction: opts?.refineInstruction || null,
        previousOutput: opts?.usePrevious ? outputRaw : null,
        context: { stageSize, assistantsCount, audienceDistance, venueType, lightingNotes },
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
    setAssistantsCount('1');
    setAudienceDistance('');
    setVenueType('');
    setLightingNotes('');
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
        'staging',
        'cue-sheet',
        'transitions',
        ...(lastPreset ? [lastPreset] : []),
        ...(venueType ? [venueType.toLowerCase().replace(/\s+/g, '-').replace(/\//g, '-')] : []),
      ];

      await saveIdea({
        type: 'text',
        title: 'Assistant Studio Plan',
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
      blueprintName || (lastPreset ? `Assistant Studio – ${lastPreset.replace(/-/g, ' ')}` : 'Assistant Studio Blueprint')
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
      lightingNotes ? `Lighting notes: ${lightingNotes}` : '',
      '',
      '---',
      '',
    ]
      .filter(Boolean)
      .join('\n');

    const tags = [
      'assistant-studio',
      'blueprint',
      'transition-plan',
      ...(lastPreset ? [lastPreset] : []),
      ...(venueType ? [venueType.toLowerCase().replace(/\s+/g, '-').replace(/\//g, '-')] : []),
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
        {
          title: 'Assistant Studio – Staging Run',
          notes: formatSectionBundle(output, [
            'stageLayout',
            'blockingPlan',
            'assistantPositions',
            'cueTimeline',
            'transitionPlan',
          ]) || outputRaw,
          priority: 'High',
        },
        {
          title: 'Assistant Studio – Prop / Reset Run',
          notes: formatSectionBundle(output, ['propTableLayout', 'propMovement', 'resetOrder', 'assistantAccessPath']) || outputRaw,
          priority: 'Medium',
        },
        {
          title: 'Assistant Studio – Volunteer / Safety Run',
          notes: formatSectionBundle(output, ['volunteerPlan', 'assistantInstructions', 'safetyNotes', 'misdirectionWindows']) || outputRaw,
          priority: 'Medium',
        },
        {
          title: 'Assistant Studio – Lighting / Reveal Run',
          notes: formatSectionBundle(output, ['revealChoreography', 'lightingCues', 'transitionPlan']) || outputRaw,
          priority: 'Medium',
        },
      ];
    } else {
      const sectionTaskKeys: SectionKey[] = [
        'stageLayout',
        'blockingPlan',
        'assistantPositions',
        'cueTimeline',
        'propMovement',
        'revealChoreography',
        'volunteerPlan',
        'assistantInstructions',
        'safetyNotes',
        'misdirectionWindows',
        'propTableLayout',
        'resetOrder',
        'assistantAccessPath',
        'transitionPlan',
        'lightingCues',
      ];
      tasks = sectionTaskKeys
        .filter((key) => !!output[key])
        .map((key) => ({
          title: `Assistant Studio – ${TABS.find((t) => t.key === key)?.label || key}`,
          notes: output[key] || outputRaw,
          priority: key === 'cueTimeline' || key === 'transitionPlan' ? 'High' : 'Medium',
        }));
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
    setInput(preset.template(base || '[Paste your routine description or script outline here]'));
    setLastPreset(preset.tag);
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
      return <div className="text-slate-400 text-sm">This section is not available in this result yet. Try generating again or switch to Full Text.</div>;
    }
    return <div className="whitespace-pre-wrap text-slate-100 leading-relaxed">{value || outputRaw}</div>;
  };

  const availableTabs = useMemo(() => {
    const base = TABS.filter((t) => t.key === 'fullText' || !!output[t.key]);
    if (!outputRaw) return base;
    if (base.length === 1 && base[0].key === 'fullText') return base;
    if (!base.find((t) => t.key === 'fullText')) base.push({ key: 'fullText', label: 'Full Text' });
    return base;
  }, [output, outputRaw]);

  const contextSummary = useMemo(() => {
    const parts: string[] = [];
    if (stageSize) parts.push(stageSize);
    if (assistantsCount) parts.push(`${assistantsCount} assistant${assistantsCount === '1' ? '' : 's'}`);
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
            <div className="text-[11px] italic text-slate-500/80">Design the invisible work that makes the miracle happen.</div>
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
            <div className="text-xs text-slate-400">Performance context</div>
            <button
              type="button"
              onClick={clearContext}
              className="text-xs px-2 py-1 rounded border border-slate-700 hover:border-slate-500 text-slate-200"
              disabled={!stageSize && assistantsCount === '1' && !audienceDistance && !venueType && !lightingNotes}
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

          <input
            value={lightingNotes}
            onChange={(e) => setLightingNotes(e.target.value)}
            placeholder="Lighting notes / cue limitations (optional)"
            className="w-full p-2 rounded bg-slate-950/50 border border-slate-700 text-white placeholder:text-slate-500"
          />

          <textarea
            className="w-full p-3 border border-slate-700 rounded bg-slate-950/50 text-white min-h-[280px] placeholder:text-slate-500"
            rows={10}
            placeholder="Routine / illusion description, script outline, or staging notes…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onTextKeyDown}
          />

          <div className="text-xs text-slate-500">
            Shortcut: <span className="text-slate-300">Ctrl/Cmd + Enter</span> to generate • <span className="text-slate-300">Esc</span> to cancel
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
                    {errorKind === 'timeout' ? 'Timed out' : errorKind === 'quota' ? 'Usage limit reached' : 'Something went wrong'}
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
                  <button className="px-3 py-2 rounded bg-purple-600 hover:bg-purple-500 text-white" onClick={handleGenerate} disabled={!input.trim() || loading}>
                    Retry
                  </button>
                  <button className="px-3 py-2 rounded border border-slate-600 hover:border-slate-400 text-slate-200" onClick={handleReset}>
                    Reset
                  </button>
                  <button className="px-3 py-2 rounded border border-slate-600 hover:border-slate-400 text-slate-200" onClick={reportIssue}>
                    Report issue
                  </button>
                  {(errorKind === 'timeout' || errorKind === 'quota') && (
                    <button className="px-3 py-2 rounded border border-slate-600 hover:border-slate-400 text-slate-200" onClick={copyPrompt}>
                      Copy prompt
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 min-h-[280px]">
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
                <div>Your assistant plan will appear here.</div>
                <div className="text-slate-500">
                  Try <span className="text-slate-300">Routine Staging</span>, <span className="text-slate-300">Generate Cue Sheet</span>, or <span className="text-slate-300">Transition Flow</span>, then hit Generate.
                </div>
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
              <button className="px-2 py-1 rounded border border-slate-700 hover:border-slate-500" onClick={() => setShowPickerOpen(false)}>
                Close
              </button>
            </div>
            <div className="mt-4 space-y-4">
              <div className="flex flex-col gap-2 text-sm text-slate-200">
                <label className="flex items-center gap-2">
                  <input type="radio" name="sendMode" checked={sendMode === 'run'} onChange={() => setSendMode('run')} />
                  Create run blocks (staging / prop-reset / volunteer-safety / lighting-reveal)
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="sendMode" checked={sendMode === 'sections'} onChange={() => setSendMode('sections')} />
                  Create section tasks (one task per assistant planning section)
                </label>
              </div>

              {shows.length === 0 ? (
                <div className="text-slate-300 text-sm">No shows found. Create a show in <span className="text-slate-100">Show Planner</span> first.</div>
              ) : (
                <>
                  <label className="text-sm text-slate-300">Choose a show</label>
                  <select className="w-full p-2 rounded bg-slate-900 border border-slate-700" value={selectedShowId} onChange={(e) => setSelectedShowId(e.target.value)}>
                    {shows.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                  <button className="w-full mt-2 px-4 py-2 rounded bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-40" disabled={!selectedShowId || sending} onClick={sendToShowPlanner}>
                    {sending ? 'Sending…' : sendMode === 'run' ? 'Create Run Blocks' : 'Create Section Tasks'}
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
              <button className="px-2 py-1 rounded border border-slate-700 hover:border-slate-500" onClick={() => setBlueprintOpen(false)}>
                Close
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <label className="text-sm text-slate-300">Blueprint name</label>
              <input
                value={blueprintName}
                onChange={(e) => setBlueprintName(e.target.value)}
                placeholder="e.g., Assistant Transition Blueprint"
                className="w-full p-2 rounded bg-slate-900 border border-slate-700 text-white placeholder:text-slate-500"
              />
              <div className="text-xs text-slate-400">Includes output, preset, and stage / assistant / venue context.</div>
              <button className="w-full mt-2 px-4 py-2 rounded bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-40" disabled={!outputRaw || savingBlueprint} onClick={saveBlueprint}>
                {savingBlueprint ? 'Saving…' : 'Save Blueprint'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto max-w-7xl px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button onClick={handleReset} className="px-3 py-2 rounded bg-transparent border border-slate-600 hover:border-slate-400 text-slate-200">
              Reset / Clear
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className={
                'px-5 py-2 rounded bg-purple-600 hover:bg-purple-500 text-white transition-transform duration-150 ' +
                (!canGenerate ? 'opacity-30' : 'hover:scale-[1.02] shadow-[0_0_18px_0_rgba(168,85,247,0.25)]')
              }
            >
              {loading ? 'Generating…' : 'Generate'}
            </button>
          </div>
          <div className="flex items-center gap-2">
            {loading ? (
              <button onClick={handleCancel} className="px-3 py-2 rounded border border-slate-600 hover:border-slate-400 text-slate-200">
                Cancel
              </button>
            ) : null}
            <button onClick={handleCopy} disabled={!canCopySave} className="px-3 py-2 rounded border border-slate-600 hover:border-slate-400 text-slate-200 disabled:opacity-40">
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
            <button onClick={handleSaveIdea} disabled={!canCopySave} className="px-3 py-2 rounded bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-40">
              Save
            </button>
            <button onClick={openBlueprint} disabled={!canCopySave} className="px-3 py-2 rounded border border-slate-600 hover:border-slate-400 text-slate-200 disabled:opacity-40">
              Save Blueprint
            </button>
            <button onClick={() => (!canCopySave ? null : openSend())} disabled={!canCopySave} className="px-3 py-2 rounded border border-slate-600 hover:border-slate-400 text-slate-200 disabled:opacity-40">
              Send to Show Planner
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
