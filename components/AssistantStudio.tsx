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

const DRAFT_KEY = 'maw_assistant_studio_draft_v2';
const WALKAROUND_KEY = 'maw_assistant_studio_walkaround_v1';
const REQUEST_TIMEOUT_MS = 45_000;

type ErrorKind = 'timeout' | 'quota' | 'other' | null;

type SectionKey =
  | 'quickWins'
  | 'lineEdits'
  | 'structureNotes'
  | 'audienceFit'
  | 'rehearsalTasks'
  | 'walkaroundRewrite'
  | 'fullText';

type StructuredOutput = Partial<Record<SectionKey, string>>;

const TABS: Array<{ key: SectionKey; label: string }> = [
  { key: 'quickWins', label: 'Quick Wins' },
  { key: 'lineEdits', label: 'Line Edits' },
  { key: 'structureNotes', label: 'Structure' },
  { key: 'audienceFit', label: 'Audience Fit' },
  { key: 'rehearsalTasks', label: 'Rehearsal Tasks' },
  { key: 'walkaroundRewrite', label: 'Walkaround Rewrite' },
  { key: 'fullText', label: 'Full Text' },
];

const REFINE_ACTIONS: Array<{ label: string; instruction: string }> = [
  { label: 'Make it punchier', instruction: 'Make it punchier: tighten phrasing, stronger verbs, faster rhythm.' },
  { label: 'More wonder', instruction: 'Increase wonder: elevate mystery and amazement, strengthen reveals.' },
  { label: 'More comedy', instruction: 'Increase comedy: add laughs without undercutting the magic.' },
  { label: 'Shorter', instruction: 'Make it shorter: remove repetition, cut fluff, keep strongest lines.' },
  { label: 'Cleaner', instruction: 'Make it cleaner: simplify wording, clarify actions, remove ambiguity.' },
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
    quickWins: '### QUICK_WINS',
    lineEdits: '### LINE_EDITS',
    structureNotes: '### STRUCTURE_NOTES',
    audienceFit: '### AUDIENCE_FIT',
    rehearsalTasks: '### REHEARSAL_TASKS',
    walkaroundRewrite: '### WALKAROUND_REWRITE',
  } as const;

  const out: StructuredOutput = { fullText: raw?.trim() || '' };

  // If headings aren't present, return only fullText.
  if (!raw.includes(headers.quickWins)) return out;

  const all = Object.values(headers);

  out.quickWins = extractSection(raw, headers.quickWins, all.filter((h) => h !== headers.quickWins));
  out.lineEdits = extractSection(raw, headers.lineEdits, all.filter((h) => h !== headers.lineEdits));
  out.structureNotes = extractSection(raw, headers.structureNotes, all.filter((h) => h !== headers.structureNotes));
  out.audienceFit = extractSection(raw, headers.audienceFit, all.filter((h) => h !== headers.audienceFit));
  out.rehearsalTasks = extractSection(raw, headers.rehearsalTasks, all.filter((h) => h !== headers.rehearsalTasks));
  out.walkaroundRewrite = extractSection(
    raw,
    headers.walkaroundRewrite,
    all.filter((h) => h !== headers.walkaroundRewrite)
  );

  return out;
}

function buildStructuredPrompt(opts: {
  userInput: string;
  walkaroundOn: boolean;
  refineInstruction?: string | null;
  previousOutput?: string | null;
}) {
  const { userInput, walkaroundOn, refineInstruction, previousOutput } = opts;

  const walkaroundGuidance = walkaroundOn
    ? `\n\nWALKAROUND OPTIMIZER (ON): Rewrite/adjust for walkaround/close-up with: quick reset speed, angle safety, audience management, pocket management, louder lines, and smooth transitions between groups. Include a WALKAROUND_REWRITE section.`
    : '';

  const refineBlock =
    refineInstruction && previousOutput
      ? `\n\nREFINE REQUEST: ${refineInstruction}\n\nPREVIOUS OUTPUT (for refinement):\n${previousOutput}`
      : '';

  return (
    `You are a magic performance writing assistant. Produce clean, structured, practical suggestions.` +
    `\n\nReturn your answer in EXACTLY this format, using these headings (no extra headings):` +
    `\n### QUICK_WINS` +
    `\n- (exactly 3 bullets, 1 line each)` +
    `\n### LINE_EDITS` +
    `\nProvide direct line edits + replacement lines. Use short bullet points.` +
    `\n### STRUCTURE_NOTES` +
    `\nBeats, pacing, callbacks, escalation, clarity.` +
    `\n### AUDIENCE_FIT` +
    `\nAdjustments for family, corporate, close-up. Be specific.` +
    `\n### REHEARSAL_TASKS` +
    `\n- [ ] Actionable checklist items (6–10).` +
    (walkaroundOn ? `\n### WALKAROUND_REWRITE\nGive a cleaned-up walkaround-ready rewrite.` : '') +
    `\n\nUSER INPUT:\n${userInput}` +
    walkaroundGuidance +
    refineBlock
  );
}

export default function AssistantStudio({ user, onIdeaSaved }: Props) {
  const currentUser = useMemo(() => user || GUEST_USER, [user]);

  const [input, setInput] = useState('');
  const [outputRaw, setOutputRaw] = useState('');
  const [output, setOutput] = useState<StructuredOutput>({});
  const [activeTab, setActiveTab] = useState<SectionKey>('quickWins');

  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);

  // Tier-2: internal, tool-level error handling
  const [errorKind, setErrorKind] = useState<ErrorKind>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorDebug, setErrorDebug] = useState<string>('');

  const [toast, setToast] = useState<string | null>(null);

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

  // Autosave draft prompt + walkaround toggle
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) setInput(saved);
      const w = localStorage.getItem(WALKAROUND_KEY);
      if (w === '1') setWalkaroundOn(true);
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
      });

      const text = await withTimeout(generateResponse(prompt, ASSISTANT_STUDIO_SYSTEM_INSTRUCTION, currentUser), REQUEST_TIMEOUT_MS);

      if (cancelledUpToRef.current >= myId) return;

      setOutputRaw(text);
      const parsed = parseStructured(text);
      setOutput(parsed);

      // tab behavior: keep user tab if it exists, else default to quick wins, else full text
      if (parsed.quickWins) setActiveTab('quickWins');
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

  const handleReset = () => {
    cancelledUpToRef.current = requestIdRef.current;
    hardUnlock();
    clearErrors();
    setOutputRaw('');
    setOutput({});
    setActiveTab('quickWins');
    setInput('');
    setCopied(false);
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

  const handleSave = async () => {
    if (!outputRaw) return;
    try {
      const title = 'Assistant Studio Output';
      const content = outputRaw;
      const tags = ['assistant-studio', ...(walkaroundOn ? ['walkaround'] : [])];

      await saveIdea({ type: 'text', title, content, tags });
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

  const openSend = () => setShowPickerOpen(true);

  const sendToShowPlanner = async () => {
    if (!selectedShowId || !outputRaw) return;
    setSending(true);
    setToast(null);
    clearErrors();

    const notes = outputRaw;

    const tasks: Partial<Task>[] = [
      { title: 'Assistant Studio – Quick Wins', notes: output.quickWins || notes, priority: 'medium' as any },
      { title: 'Assistant Studio – Line Edits', notes: output.lineEdits || notes, priority: 'medium' as any },
      { title: 'Assistant Studio – Structure Notes', notes: output.structureNotes || notes, priority: 'medium' as any },
      { title: 'Assistant Studio – Audience Fit', notes: output.audienceFit || notes, priority: 'medium' as any },
      { title: 'Assistant Studio – Rehearsal Tasks', notes: output.rehearsalTasks || notes, priority: 'medium' as any },
    ];

    if (walkaroundOn && output.walkaroundRewrite) {
      tasks.push({ title: 'Assistant Studio – Walkaround Rewrite', notes: output.walkaroundRewrite, priority: 'medium' as any });
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
    return <div className="whitespace-pre-wrap text-slate-100">{value || outputRaw}</div>;
  };

  const availableTabs = useMemo(() => {
    const base = TABS.filter((t) => {
      if (t.key === 'walkaroundRewrite') return walkaroundOn && !!output.walkaroundRewrite;
      if (t.key === 'fullText') return true;
      return !!output?.[t.key];
    });
    // If we couldn't parse anything, still show Full Text.
    if (!outputRaw) return base;
    if (!output.quickWins && !output.lineEdits && !output.structureNotes && !output.audienceFit && !output.rehearsalTasks) {
      return [{ key: 'fullText', label: 'Full Text' }];
    }
    // Always include Full Text at end
    if (!base.find((t) => t.key === 'fullText')) base.push({ key: 'fullText', label: 'Full Text' });
    return base;
  }, [output, outputRaw, walkaroundOn]);

  return (
    <div className="relative p-6 pb-24 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Assistant&apos;s Studio</h1>
        <div className="text-sm text-slate-400 min-h-[1.25rem]">{toast ? <span className="text-emerald-400">{toast}</span> : null}</div>
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

          {/* Walkaround toggle */}
          <label className="flex items-center gap-2 text-sm text-slate-200 select-none">
            <input
              type="checkbox"
              checked={walkaroundOn}
              onChange={(e) => setWalkaroundOn(e.target.checked)}
              className="h-4 w-4 accent-purple-500"
            />
            Optimize for walkaround (reset, angles, crowd management, louder lines)
          </label>

          <textarea
            className="w-full p-3 border border-slate-700 rounded bg-slate-950/60 text-white min-h-[260px]"
            rows={10}
            placeholder="Describe what you want help with (script notes, structure, punchlines, transitions, callbacks, etc.)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onTextKeyDown}
          />

          <div className="text-xs text-slate-500">
            Shortcut: <span className="text-slate-300">Ctrl/Cmd + Enter</span> to generate •{' '}
            <span className="text-slate-300">Esc</span> to cancel
          </div>

          {/* Refine controls */}
          <div className="pt-2 border-t border-slate-800/60">
            <div className="text-xs text-slate-400 mb-2">Refine:</div>
            <div className="flex flex-wrap gap-2">
              {REFINE_ACTIONS.map((r) => (
                <button
                  key={r.label}
                  type="button"
                  onClick={() => handleRefine(r.instruction)}
                  disabled={!outputRaw || loading}
                  className="px-3 py-1.5 rounded-full border border-slate-700 bg-slate-950/60 hover:border-slate-500 text-sm disabled:opacity-40"
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
            <div className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
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
                {/* Output tabs */}
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
              <div className="text-slate-400 text-sm">Your results will appear here. Use a preset chip above to get started quickly.</div>
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
              <button className="px-2 py-1 rounded border border-slate-700 hover:border-slate-500" onClick={() => setShowPickerOpen(false)}>
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
                  <select className="w-full p-2 rounded bg-slate-900 border border-slate-700" value={selectedShowId} onChange={(e) => setSelectedShowId(e.target.value)}>
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
                    {sending ? 'Sending…' : 'Send Sections as Tasks'}
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
            <button onClick={handleReset} className="px-3 py-2 rounded bg-transparent border border-slate-600 hover:border-slate-400 text-slate-200">
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

          {/* Right: Copy / Save / Send / Cancel */}
          <div className="flex items-center gap-2">
            {loading ? (
              <button onClick={handleCancel} className="px-3 py-2 rounded border border-slate-600 hover:border-slate-400 text-slate-200">
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
              onClick={handleSave}
              disabled={!canCopySave}
              className="px-3 py-2 rounded bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-40"
            >
              Save
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
