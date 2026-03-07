import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ASSISTANT_STUDIO_SYSTEM_INSTRUCTION } from '../constants';
import { generateResponse } from '../services/geminiService';
import { saveIdea } from '../services/ideasService';
import { addTasksToShow, getShows } from '../services/showsService';
import type { Show, Task, User } from '../types';

type Props = {
  user?: User;
  onIdeaSaved?: () => void;
};

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
  | 'fullText';

type StructuredOutput = Partial<Record<SectionKey, string>>;

const GUEST_USER: User = {
  email: '',
  membership: 'free',
  generationCount: 0,
  lastResetDate: '',
};

const DRAFT_KEY = 'maw_assistant_studio_draft_v5';
const CONTEXT_KEY = 'maw_assistant_studio_context_v5';
const REQUEST_TIMEOUT_MS = 45_000;

const PRESETS: Array<{ label: string; tag: string; template: (input: string) => string }> = [
  {
    label: 'Generate Cue Sheet',
    tag: 'cue-sheet',
    template: (input) =>
      `Create an assistant cue sheet for this routine. Include stage layout, assistant positions, cue timeline, prop movement, reveal choreography, and practical prop table organization.\n\nROUTINE DESCRIPTION:\n${input}`,
  },
  {
    label: 'Volunteer Flow',
    tag: 'volunteer-flow',
    template: (input) =>
      `Plan volunteer management for this routine. Show where volunteers stand, how assistants guide them, how exposure is avoided, and what safety notes matter.\n\nROUTINE DESCRIPTION:\n${input}`,
  },
  {
    label: 'Misdirection Timing',
    tag: 'misdirection',
    template: (input) =>
      `Analyze the critical misdirection windows in this routine. Identify the moment, the assistant action, the assistant position, and the recommended timing.\n\nROUTINE DESCRIPTION:\n${input}`,
  },
  {
    label: 'Prop Table Layout',
    tag: 'prop-table',
    template: (input) =>
      `Optimize the prop table for this routine. Give ideal prop placement, reset order, and assistant access path for fastest retrieval and cleanest resets.\n\nROUTINE DESCRIPTION:\n${input}`,
  },
  {
    label: 'Improve Transitions',
    tag: 'transitions',
    template: (input) =>
      `Improve transitions for this routine. Focus on assistant timing, stage traffic, prop movement, and clean reveals.\n\nROUTINE DESCRIPTION:\n${input}`,
  },
  {
    label: 'Safety Check',
    tag: 'safety',
    template: (input) =>
      `Review this routine for safety, spacing, traffic, volunteer handling, and exposure risks.\n\nROUTINE DESCRIPTION:\n${input}`,
  },
];

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
  { key: 'fullText', label: 'Full Text' },
];

const REFINE_ACTIONS: Array<{ label: string; instruction: string }> = [
  { label: 'Tighten blocking', instruction: 'Tighten the blocking plan and reduce unnecessary crossings.' },
  { label: 'Stronger misdirection', instruction: 'Strengthen the misdirection windows and be more precise about timing and assistant action.' },
  { label: 'Better volunteer flow', instruction: 'Improve volunteer flow with clearer assistant guidance and safer placements.' },
  { label: 'Faster prop retrieval', instruction: 'Optimize the prop table and assistant access path for faster retrieval.' },
  { label: 'Simplify reset', instruction: 'Simplify the reset order while keeping the routine practical.' },
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

const HEADERS: Record<Exclude<SectionKey, 'fullText'>, string> = {
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
};

function Skeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-4 rounded bg-slate-800 animate-pulse" style={{ width: `${55 + i * 6}%` }} />
      ))}
    </div>
  );
}

function detectQuotaError(message: string) {
  const m = (message || '').toLowerCase();
  return m.includes('quota') || m.includes('rate limit') || m.includes('429') || m.includes('resource_exhausted');
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
  const next = nextHeaders
    .map((h) => {
      const idx = afterStart.indexOf(h);
      return idx === -1 ? Number.POSITIVE_INFINITY : idx;
    })
    .filter(Number.isFinite);
  const endRel = next.length ? Math.min(...next) : afterStart.length;
  return afterStart.slice(0, endRel).trim();
}

function parseStructured(raw: string): StructuredOutput {
  const out: StructuredOutput = { fullText: raw?.trim() || '' };
  if (!raw.includes(HEADERS.stageLayout)) return out;
  const values = Object.values(HEADERS);
  (Object.entries(HEADERS) as Array<[Exclude<SectionKey, 'fullText'>, string]>).forEach(([key, header]) => {
    out[key] = extractSection(raw, header, values.filter((h) => h !== header));
  });
  return out;
}

function buildStructuredPrompt(opts: {
  userInput: string;
  refineInstruction?: string | null;
  previousOutput?: string | null;
  context?: { stageSize?: string; venueType?: string; numberAssistants?: string; audienceDistance?: string };
}) {
  const { userInput, refineInstruction, previousOutput, context } = opts;
  const contextLines: string[] = [];
  if (context?.stageSize) contextLines.push(`Stage size: ${context.stageSize}`);
  if (context?.venueType) contextLines.push(`Venue type: ${context.venueType}`);
  if (context?.numberAssistants) contextLines.push(`Number of assistants: ${context.numberAssistants}`);
  if (context?.audienceDistance) contextLines.push(`Audience distance: ${context.audienceDistance}`);

  const contextBlock = contextLines.length ? `\n\nCONTEXT:\n${contextLines.join('\n')}` : '';
  const refineBlock =
    refineInstruction && previousOutput
      ? `\n\nREFINE REQUEST: ${refineInstruction}\n\nPREVIOUS OUTPUT:\n${previousOutput}`
      : '';

  return `You are creating a production-ready assistant operations plan for a magic routine. Be practical, specific, and performance-safe. Do not expose methods. Focus on staging, cueing, volunteer management, misdirection timing, prop flow, and assistant logistics.

Return your answer in EXACTLY this format and use all headings below:
### STAGE_LAYOUT
Describe stage geography, prop table location, volunteer area, and traffic lanes.
### BLOCKING_PLAN
Describe performer and assistant movement by beat.
### ASSISTANT_POSITIONS
State where assistants begin, shift, and finish.
### CUE_TIMELINE
Provide a cue sheet with timestamps or beat labels.
### PROP_MOVEMENT
Explain when props move, who moves them, and why.
### REVEAL_CHOREOGRAPHY
Describe the reveal sequence and assistant role.
### VOLUNTEER_PLAN
Explain where volunteers stand, how they are guided, and how exposure is avoided.
### ASSISTANT_INSTRUCTIONS
Give direct rehearsal-ready instructions assistants can follow.
### SAFETY_NOTES
Call out spacing, traffic, and handling risks.
### MISDIRECTION_WINDOWS
Identify critical misdirection windows, assistant actions, and recommended timing.
### PROP_TABLE_LAYOUT
Design the ideal prop table layout using rows, zones, or left/right placement.
### RESET_ORDER
List the reset order step by step.
### ASSISTANT_ACCESS_PATH
Explain the fastest and cleanest access path to and from the prop table.${contextBlock}

ROUTINE DESCRIPTION:
${userInput}${refineBlock}`;
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
  const [toast, setToast] = useState<string | null>(null);

  const [stageSize, setStageSize] = useState('');
  const [venueType, setVenueType] = useState('');
  const [numberAssistants, setNumberAssistants] = useState('');
  const [audienceDistance, setAudienceDistance] = useState('');
  const [lastPreset, setLastPreset] = useState('');

  const [shows, setShows] = useState<Show[]>([]);
  const [showPickerOpen, setShowPickerOpen] = useState(false);
  const [selectedShowId, setSelectedShowId] = useState('');
  const [sendMode, setSendMode] = useState<'run' | 'sections'>('sections');
  const [blueprintOpen, setBlueprintOpen] = useState(false);
  const [blueprintName, setBlueprintName] = useState('');
  const [savingBlueprint, setSavingBlueprint] = useState(false);

  const requestIdRef = useRef(0);
  const cancelledUpToRef = useRef(0);
  const outputRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) setInput(saved);
      const ctx = localStorage.getItem(CONTEXT_KEY);
      if (ctx) {
        const parsed = JSON.parse(ctx);
        setStageSize(parsed?.stageSize || '');
        setVenueType(parsed?.venueType || '');
        setNumberAssistants(parsed?.numberAssistants || '');
        setAudienceDistance(parsed?.audienceDistance || '');
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, input);
      localStorage.setItem(CONTEXT_KEY, JSON.stringify({ stageSize, venueType, numberAssistants, audienceDistance }));
    } catch {
      // ignore
    }
  }, [input, stageSize, venueType, numberAssistants, audienceDistance]);

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
    window.setTimeout(() => outputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }, [outputRaw]);

  const clearErrors = () => {
    setErrorKind(null);
    setErrorMsg(null);
  };

  const runGenerate = async (opts?: { refineInstruction?: string; usePrevious?: boolean }) => {
    if (!input.trim()) return;
    const myId = ++requestIdRef.current;
    try {
      setLoading(true);
      clearErrors();
      const prompt = buildStructuredPrompt({
        userInput: input.trim(),
        refineInstruction: opts?.refineInstruction || null,
        previousOutput: opts?.usePrevious ? outputRaw : null,
        context: { stageSize, venueType, numberAssistants, audienceDistance },
      });
      const text = await withTimeout(generateResponse(prompt, ASSISTANT_STUDIO_SYSTEM_INSTRUCTION, currentUser), REQUEST_TIMEOUT_MS);
      if (cancelledUpToRef.current >= myId) return;
      setOutputRaw(text);
      const parsed = parseStructured(text);
      setOutput(parsed);
      setActiveTab(parsed.stageLayout ? 'stageLayout' : 'fullText');
    } catch (e: any) {
      const msg = e?.message || 'Something went wrong.';
      if (msg === 'TIMEOUT') {
        setErrorKind('timeout');
        setErrorMsg('The request was stopped after 45 seconds.');
      } else {
        setErrorKind(detectQuotaError(msg) ? 'quota' : 'other');
        setErrorMsg(msg);
      }
    } finally {
      if (requestIdRef.current === myId) setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!outputRaw) return;
    const textToCopy = activeTab === 'fullText' ? outputRaw : output[activeTab] || outputRaw;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  };

  const handleSaveIdea = async () => {
    if (!outputRaw) return;
    try {
      await saveIdea({
        type: 'text',
        title: 'Assistant Studio Plan',
        content: outputRaw,
        tags: ['assistant-studio', 'assistant-ops', ...(lastPreset ? [lastPreset] : []), 'prop-table'],
      });
      onIdeaSaved?.();
      setToast('Saved to Ideas ✓');
      setTimeout(() => setToast(null), 1200);
    } catch (e: any) {
      setErrorKind('other');
      setErrorMsg(e?.message || 'Could not save this idea.');
    }
  };

  const saveBlueprint = async () => {
    if (!outputRaw) return;
    setSavingBlueprint(true);
    try {
      const header = [
        `BLUEPRINT: ${blueprintName || 'Assistant Studio Blueprint'}`,
        stageSize ? `Stage size: ${stageSize}` : '',
        venueType ? `Venue: ${venueType}` : '',
        numberAssistants ? `Assistants: ${numberAssistants}` : '',
        audienceDistance ? `Audience distance: ${audienceDistance}` : '',
        lastPreset ? `Preset: ${lastPreset}` : '',
        '',
        '---',
        '',
      ]
        .filter(Boolean)
        .join('\n');
      await saveIdea({
        type: 'text',
        title: blueprintName || 'Assistant Studio Blueprint',
        content: `${header}${outputRaw}`,
        tags: ['assistant-studio', 'blueprint', 'assistant-ops', 'prop-table'],
      });
      setBlueprintOpen(false);
      setToast('Blueprint saved ✓');
      setTimeout(() => setToast(null), 1400);
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
    try {
      let tasks: Partial<Task>[] = [];
      if (sendMode === 'run') {
        tasks = [
          { title: 'Assistant Run – Stage Layout', notes: output.stageLayout || outputRaw, priority: 'High' as any },
          { title: 'Assistant Run – Cue Timeline', notes: output.cueTimeline || outputRaw, priority: 'High' as any },
          { title: 'Assistant Run – Prop Table', notes: output.propTableLayout || outputRaw, priority: 'Medium' as any },
          { title: 'Assistant Run – Reset Order', notes: output.resetOrder || outputRaw, priority: 'Medium' as any },
        ];
      } else {
        tasks = [
          { title: 'Assistant Studio – Blocking Plan', notes: output.blockingPlan || outputRaw, priority: 'Medium' as any },
          { title: 'Assistant Studio – Volunteer Plan', notes: output.volunteerPlan || outputRaw, priority: 'Medium' as any },
          { title: 'Assistant Studio – Misdirection Windows', notes: output.misdirectionWindows || outputRaw, priority: 'Medium' as any },
          { title: 'Assistant Studio – Prop Table Layout', notes: output.propTableLayout || outputRaw, priority: 'Medium' as any },
          { title: 'Assistant Studio – Assistant Access Path', notes: output.assistantAccessPath || outputRaw, priority: 'Medium' as any },
          { title: 'Assistant Studio – Safety Notes', notes: output.safetyNotes || outputRaw, priority: 'Medium' as any },
        ];
      }
      await addTasksToShow(selectedShowId, tasks);
      setShowPickerOpen(false);
      setToast('Sent to Show Planner ✓');
      setTimeout(() => setToast(null), 1400);
    } catch (e: any) {
      setErrorKind('other');
      setErrorMsg(e?.message || 'Could not send to Show Planner.');
    } finally {
      setSending(false);
    }
  };

  const applyPreset = (idx: number) => {
    const preset = PRESETS[idx];
    setInput(preset.template(input.trim() || '[Describe the routine here]'));
    setLastPreset(preset.tag);
    setToast(`Preset: ${preset.label}`);
    setTimeout(() => setToast(null), 900);
  };

  const clearContext = () => {
    setStageSize('');
    setVenueType('');
    setNumberAssistants('');
    setAudienceDistance('');
  };

  const handleReset = () => {
    cancelledUpToRef.current = requestIdRef.current;
    setLoading(false);
    setOutputRaw('');
    setOutput({});
    setActiveTab('stageLayout');
    setInput('');
    setLastPreset('');
    clearErrors();
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // ignore
    }
  };

  const availableTabs = useMemo(() => {
    const base = TABS.filter((t) => t.key === 'fullText' || !!output[t.key]);
    if (!outputRaw) return base;
    if (!output.stageLayout && !output.blockingPlan && !output.cueTimeline && !output.propTableLayout) {
      return [{ key: 'fullText', label: 'Full Text' }];
    }
    return base;
  }, [output, outputRaw]);

  const contextSummary = useMemo(() => {
    const parts: string[] = [];
    if (stageSize) parts.push(stageSize);
    if (venueType) parts.push(venueType);
    if (numberAssistants) parts.push(`${numberAssistants} assistants`);
    if (audienceDistance) parts.push(`audience: ${audienceDistance}`);
    return parts.join(' • ');
  }, [stageSize, venueType, numberAssistants, audienceDistance]);

  const renderTabContent = () => {
    const value = activeTab === 'fullText' ? outputRaw : output[activeTab] || '';
    return <div className="whitespace-pre-wrap text-slate-100 leading-relaxed">{value || outputRaw}</div>;
  };

  return (
    <div className="relative p-6 pb-24 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Assistant&apos;s Studio</h1>
          {contextSummary ? (
            <div className="text-xs text-slate-400">Context: <span className="text-slate-200">{contextSummary}</span></div>
          ) : (
            <div className="text-[11px] italic text-slate-500/80">Plan the invisible work that makes the miracle happen.</div>
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
            <div className="text-xs text-slate-400">Routine staging context:</div>
            <button type="button" onClick={clearContext} className="text-xs px-2 py-1 rounded border border-slate-700 hover:border-slate-500 text-slate-200" disabled={!stageSize && !venueType && !numberAssistants && !audienceDistance}>
              Clear context
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <input value={stageSize} onChange={(e) => setStageSize(e.target.value)} placeholder="Stage size" className="p-2 rounded bg-slate-950/50 border border-slate-700 text-white placeholder:text-slate-500" />
            <select value={venueType} onChange={(e) => setVenueType(e.target.value)} className="p-2 rounded bg-slate-950/50 border border-slate-700 text-white">
              <option value="">Venue type</option>
              {VENUE_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
            <input value={numberAssistants} onChange={(e) => setNumberAssistants(e.target.value)} placeholder="# of assistants" className="p-2 rounded bg-slate-950/50 border border-slate-700 text-white placeholder:text-slate-500" />
            <input value={audienceDistance} onChange={(e) => setAudienceDistance(e.target.value)} placeholder="Audience distance" className="p-2 rounded bg-slate-950/50 border border-slate-700 text-white placeholder:text-slate-500" />
          </div>

          <textarea
            className="w-full p-3 border border-slate-700 rounded bg-slate-950/50 text-white min-h-[280px] placeholder:text-slate-500"
            rows={10}
            placeholder="Describe the routine, illusion, assistant duties, staging problem, or prop-table challenge here…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />

          <div className="text-xs text-slate-500">Best results come from describing entrances, props, volunteer moments, and the final reveal.</div>

          <div className="pt-3 border-t border-slate-800/60">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="text-xs text-slate-400">Refine this plan:</div>
              {lastPreset ? <div className="text-xs text-slate-500">Focus: <span className="text-slate-300">{lastPreset}</span></div> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {REFINE_ACTIONS.map((r) => (
                <button key={r.label} type="button" onClick={() => runGenerate({ refineInstruction: r.instruction, usePrevious: true })} disabled={!outputRaw || loading} className="px-3 py-1.5 rounded-full border border-slate-700 bg-slate-950/50 hover:bg-slate-950/70 hover:border-slate-500 text-sm disabled:opacity-40">
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
              <div className="mt-1 text-sm text-slate-300">{errorMsg}</div>
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
                    <button key={t.key} type="button" onClick={() => setActiveTab(t.key)} className={('px-3 py-1.5 rounded-full border text-sm ' + (activeTab === t.key ? 'border-purple-500 bg-purple-500/10 text-purple-200' : 'border-slate-700 bg-slate-950/40 hover:border-slate-500 text-slate-200'))}>
                      {t.label}
                    </button>
                  ))}
                </div>
                {renderTabContent()}
              </>
            ) : (
              <div className="text-slate-400 text-sm space-y-2">
                <div>Your assistant operations plan will appear here.</div>
                <div className="text-slate-500">Try <span className="text-slate-300">Prop Table Layout</span> or <span className="text-slate-300">Generate Cue Sheet</span> and then click Generate.</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg maw-card p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-lg font-semibold">Send to Show Planner</div>
              <button className="px-2 py-1 rounded border border-slate-700 hover:border-slate-500" onClick={() => setShowPickerOpen(false)}>Close</button>
            </div>
            <select value={selectedShowId} onChange={(e) => setSelectedShowId(e.target.value)} className="w-full p-2 rounded bg-slate-950/50 border border-slate-700 text-white">
              {(shows || []).map((show) => <option key={show.id} value={show.id}>{show.title}</option>)}
            </select>
            <div className="flex gap-3 text-sm">
              <label className="flex items-center gap-2"><input type="radio" checked={sendMode === 'sections'} onChange={() => setSendMode('sections')} /> Section tasks</label>
              <label className="flex items-center gap-2"><input type="radio" checked={sendMode === 'run'} onChange={() => setSendMode('run')} /> Run plan</label>
            </div>
            <button className="px-4 py-2 rounded bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-40" disabled={!selectedShowId || sending} onClick={sendToShowPlanner}>{sending ? 'Sending…' : 'Send'}</button>
          </div>
        </div>
      )}

      {blueprintOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg maw-card p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-lg font-semibold">Save Blueprint</div>
              <button className="px-2 py-1 rounded border border-slate-700 hover:border-slate-500" onClick={() => setBlueprintOpen(false)}>Close</button>
            </div>
            <input value={blueprintName} onChange={(e) => setBlueprintName(e.target.value)} placeholder="Blueprint name" className="w-full p-2 rounded bg-slate-950/50 border border-slate-700 text-white placeholder:text-slate-500" />
            <button className="px-4 py-2 rounded bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-40" disabled={savingBlueprint} onClick={saveBlueprint}>{savingBlueprint ? 'Saving…' : 'Save Blueprint'}</button>
          </div>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-800 bg-slate-950/95 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <button onClick={() => runGenerate()} disabled={!input.trim() || loading} className="px-4 py-2 rounded bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-40">{loading ? 'Generating…' : 'Generate'}</button>
            <button onClick={handleCopy} disabled={!outputRaw || loading} className="px-4 py-2 rounded border border-slate-700 hover:border-slate-500 text-slate-200 disabled:opacity-40">{copied ? 'Copied ✓' : 'Copy'}</button>
            <button onClick={handleSaveIdea} disabled={!outputRaw || loading} className="px-4 py-2 rounded border border-slate-700 hover:border-slate-500 text-slate-200 disabled:opacity-40">Save to Idea Vault</button>
            <button onClick={() => setBlueprintOpen(true)} disabled={!outputRaw || loading} className="px-4 py-2 rounded border border-slate-700 hover:border-slate-500 text-slate-200 disabled:opacity-40">Save Blueprint</button>
            <button onClick={() => setShowPickerOpen(true)} disabled={!outputRaw || loading || shows.length === 0} className="px-4 py-2 rounded border border-slate-700 hover:border-slate-500 text-slate-200 disabled:opacity-40">Send to Show Planner</button>
          </div>
          <button onClick={handleReset} className="px-4 py-2 rounded border border-slate-700 hover:border-slate-500 text-slate-300">Reset</button>
        </div>
      </div>
    </div>
  );
}
