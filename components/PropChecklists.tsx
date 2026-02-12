import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { User, Task } from '../types';
import { generateResponse } from '../services/geminiService';
import { saveIdea } from '../services/ideasService';
import { createShow, addTasksToShow } from '../services/showsService';
import { normalizeTier } from '../services/membershipService';
import { ChecklistIcon, SaveIcon, ShareIcon } from './icons';
import ShareButton from './ShareButton';
import { useAppDispatch, refreshIdeas, refreshShows } from '../store';

interface PropChecklistsProps {
  user: User;
  onIdeaSaved: () => void;
}

type OutputMode = 'checklist' | 'detailed' | 'director';

const LoadingOverlay: React.FC<{ label?: string; sublabel?: string }> = ({
  label = 'Generating…',
  sublabel = 'The Wizard is building your blueprint.',
}) => (
  <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm">
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-700 bg-slate-900/40 px-6 py-5 shadow-lg">
      <div className="h-10 w-10 rounded-full border-2 border-slate-500 border-t-transparent animate-spin" />
      <div className="text-slate-100 font-semibold">{label}</div>
      <div className="text-slate-400 text-sm">{sublabel}</div>
    </div>
  </div>
);

type NormalizedAiError = {
  userMessage: string;
  isQuota: boolean;
  isTimeout: boolean;
};

type SectionKey = 'props' | 'staging' | 'risk' | 'reset' | 'sound' | 'notes';

type BlueprintSection = {
  key: SectionKey;
  title: string;
  icon: React.ReactNode;
  content: string;
};

type Insights = {
  routineType: string;
  estimatedDuration: string;
  complexityScore: number; // 1-10
  totalProps: number;
  pocketLoad: 'Low' | 'Moderate' | 'High';
  tableRequired: 'Yes' | 'No';
  resetTime: string;
  riskLevel: 'Low' | 'Medium' | 'High';
  budgetEstimate?: string; // Pro only
};

const CONTEXT_OPTIONS = [
  { key: 'Stage', icon: '🎭' },
  { key: 'Close-Up', icon: '🪄' },
  { key: 'Mentalism', icon: '🧠' },
  { key: 'Family Show', icon: '👨‍👩‍👧' },
  { key: 'Corporate', icon: '🏢' },
  { key: 'Gospel', icon: '⛪' },
  { key: 'Parlor', icon: '🎪' },
] as const;

const SYSTEM_RULES = `
You are Magic AI Wizard — a professional show production planner for magicians.
Your job: turn a routine description into a structured, practical "Routine Blueprint".

Rules:
- Do not reveal methods or secret workings.
- Focus on logistics: props, staging, angles, risks, reset workflow, and cues.
- Be concise, professional, and actionable.
- Use clear markdown headings exactly matching the requested section titles.
`.trim();

function normalizeAiError(err: unknown): NormalizedAiError {
  const raw =
    (err as any)?.message ||
    (typeof err === 'string' ? err : '') ||
    (() => {
      try {
        return JSON.stringify(err ?? '');
      } catch {
        return '';
      }
    })();

  const msg = String(raw).toLowerCase();
  const status = (err as any)?.status ?? (err as any)?.code;

  const isTimeout = msg.includes('timeout') || msg.includes('timed out');
  const isQuota =
    status === 429 ||
    msg.includes('quota') ||
    msg.includes('resource_exhausted') ||
    msg.includes('too many requests') ||
    msg.includes('rate limit') ||
    msg.includes('exceeded') ||
    msg.includes('billing');

  if (isTimeout) {
    return {
      userMessage:
        'The AI request timed out. Please try again. If this keeps happening, refresh the page and check your network connection.',
      isQuota,
      isTimeout: true,
    };
  }

  if (isQuota) {
    return {
      userMessage:
        'AI quota or billing limit reached. Please confirm your Google AI billing/quota, then try again.',
      isQuota: true,
      isTimeout: false,
    };
  }

  const userMessage = raw
    ? `AI error: ${String(raw).slice(0, 240)}`
    : 'An unknown error occurred while generating your blueprint.';
  return { userMessage, isQuota: false, isTimeout: false };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('Request timeout')), ms);
    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((e) => {
        window.clearTimeout(timer);
        reject(e);
      });
  });
}

function stripMarkdown(s: string): string {
  return (s ?? '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[#>*_`]/g, '')
    .trim();
}

function extractDurationText(input: string): string | null {
  const s = (input ?? '').toLowerCase();
  const m1 = s.match(/(\d+)\s*(?:-|to)\s*(\d+)\s*(?:min|minute|minutes)\b/);
  if (m1) return `${m1[1]}–${m1[2]} min`;
  const m2 = s.match(/\b(\d+)\s*(?:min|minute|minutes)\b/);
  if (m2) return `${m2[1]} min`;
  return null;
}

function countBullets(markdown: string): number {
  const lines = (markdown ?? '').split('\n');
  return lines.filter((l) => /^\s*([-*•]|\d+\.)\s+/.test(l.trim())).length;
}

function hasAny(text: string, keywords: string[]): boolean {
  const s = (text ?? '').toLowerCase();
  return keywords.some((k) => s.includes(k));
}

function parseSections(raw: string): BlueprintSection[] {
  const normalized = (raw ?? '').replace(/\r\n/g, '\n').trim();

  const headingMap: Array<{ key: SectionKey; title: string; re: RegExp; icon: React.ReactNode }> = [
    { key: 'props', title: 'Props', re: /^#{2,3}\s*Props\b.*$/gim, icon: <span className="mr-2">🧰</span> },
    { key: 'staging', title: 'Staging', re: /^#{2,3}\s*Staging\b.*$/gim, icon: <span className="mr-2">🎬</span> },
    { key: 'risk', title: 'Risk & Angles', re: /^#{2,3}\s*Risk\s*&\s*Angles\b.*$/gim, icon: <span className="mr-2">⚠️</span> },
    { key: 'reset', title: 'Reset', re: /^#{2,3}\s*Reset\b.*$/gim, icon: <span className="mr-2">🔁</span> },
    { key: 'sound', title: 'Sound & Lighting', re: /^#{2,3}\s*Sound\s*&\s*Lighting\b.*$/gim, icon: <span className="mr-2">🎵</span> },
    { key: 'notes', title: 'Notes', re: /^#{2,3}\s*Notes\b.*$/gim, icon: <span className="mr-2">📝</span> },
  ];

  // Collect all heading indices
  const hits: Array<{ idx: number; key: SectionKey; title: string; icon: React.ReactNode; headerLen: number }> = [];
  for (const h of headingMap) {
    const m = [...normalized.matchAll(h.re)];
    for (const mm of m) {
      const idx = mm.index ?? -1;
      if (idx >= 0) hits.push({ idx, key: h.key, title: h.title, icon: h.icon, headerLen: mm[0].length });
    }
  }
  hits.sort((a, b) => a.idx - b.idx);

  if (hits.length === 0) {
    // No headings detected: keep UI stable by putting everything in Notes.
    return headingMap.map((h) => ({
      key: h.key,
      title: h.title,
      icon: h.icon,
      content: h.key === 'notes' ? normalized : '',
    }));
  }

  const result: BlueprintSection[] = [];
  for (let i = 0; i < hits.length; i++) {
    const cur = hits[i];
    const next = hits[i + 1];
    const start = cur.idx + cur.headerLen;
    const end = next ? next.idx : normalized.length;
    const content = normalized.slice(start, end).trim();
    result.push({ key: cur.key, title: cur.title, icon: cur.icon, content });
  }

  // Ensure all keys exist (for stable UI ordering)
  const byKey = new Map(result.map((s) => [s.key, s]));
  const ordered = headingMap.map((h) => byKey.get(h.key) ?? { key: h.key, title: h.title, icon: h.icon, content: '' });
  // If notes missing, also place any leftover trailing text into notes (rare)
  return ordered;
}

function inferInsights(args: {
  routine: string;
  selectedContexts: string[];
  sections: BlueprintSection[];
  isPro: boolean;
}): Insights {
  const { routine, selectedContexts, sections, isPro } = args;
  const ctx = selectedContexts.length ? selectedContexts.join(', ') : 'General';
  const duration = extractDurationText(routine) ?? '—';

  const propsText = sections.find((s) => s.key === 'props')?.content ?? '';
  const riskText = sections.find((s) => s.key === 'risk')?.content ?? '';
  const resetText = sections.find((s) => s.key === 'reset')?.content ?? '';

  const totalProps = Math.max(0, countBullets(propsText));
  const largePropKeywords = [
    'ring',
    'linking rings',
    'rope',
    'chair',
    'table',
    'case',
    'suitcase',
    'trunk',
    'box',
    'cabinet',
    'sword',
    'cane',
    'umbrella',
    'banner',
    'stand',
    'mic stand',
  ];
  const smallPropKeywords = [
    'coin',
    'card',
    'deck',
    'marker',
    'sharpie',
    'rubber band',
    'band',
    'thumb tip',
    'tt',
    'silk',
    'business card',
    'note',
    'paper',
    'envelope',
    'wallet',
    'ring box',
  ];

  const isLargePropRoutine = hasAny(routine + '\n' + propsText, largePropKeywords);
  const smallItemsCount = (propsText ?? '')
    .split('\n')
    .filter((l) => /^\s*([-*•]|\d+\.)\s+/.test(l.trim()))
    .filter((l) => hasAny(l, smallPropKeywords))
    .length;

  // Pocket load: based on small-item burden, not large stage props.
  let pocketLoad: Insights['pocketLoad'] = 'Low';
  if (smallItemsCount >= 10) pocketLoad = 'High';
  else if (smallItemsCount >= 5) pocketLoad = 'Moderate';
  else pocketLoad = 'Low';

  // If it's clearly a large-prop routine and small items are low, pocket load should stay Low.
  if (isLargePropRoutine && smallItemsCount < 5) pocketLoad = 'Low';

  // Table required heuristic
  const tableRequired = hasAny(propsText + '\n' + sections.map((s) => s.content).join('\n'), [
    'table',
    'servante',
    'close-up mat',
    'mat',
    'working surface',
  ])
    ? 'Yes'
    : 'No';

  // Reset time heuristic
  const resetCount = Math.max(countBullets(resetText), 0);
  const resetBase = Math.max(totalProps, 1) + resetCount;
  let resetTime = '1–2 min';
  if (resetBase >= 18) resetTime = '5–10 min';
  else if (resetBase >= 12) resetTime = '3–5 min';
  else if (resetBase >= 7) resetTime = '2–3 min';

  // Risk heuristic
  let riskLevel: Insights['riskLevel'] = 'Low';
  const riskSignalsHigh = ['angle', 'angles', 'flash', 'exposure', 'gimmick', 'key ring', 'break', 'crack', 'drop'];
  const riskSignalsMed = ['timing', 'reset', 'noise', 'lighting', 'reflection', 'spectator management'];
  const riskHigh = hasAny(riskText, riskSignalsHigh);
  const riskMed = hasAny(riskText, riskSignalsMed);
  if (riskHigh) riskLevel = 'High';
  else if (riskMed) riskLevel = 'Medium';
  else riskLevel = 'Low';

  // Complexity score 1-10
  const complexity = Math.min(
    10,
    Math.max(
      1,
      Math.round(
        2 +
          totalProps * 0.35 +
          resetCount * 0.25 +
          (riskLevel === 'High' ? 2 : riskLevel === 'Medium' ? 1 : 0) +
          (isLargePropRoutine ? 1 : 0)
      )
    )
  );

  // Routine type
  const routineType =
    selectedContexts.length > 0
      ? selectedContexts[0]
      : hasAny(routine, ['stage', 'parlor', 'close-up', 'walkaround'])
      ? 'General'
      : 'General';

  // Pro-only budget estimate heuristic
  let budgetEstimate: string | undefined;
  if (isPro) {
    const base = totalProps * 6;
    const largeBoost = isLargePropRoutine ? 75 : 0;
    const low = Math.max(20, Math.round((base + largeBoost) * 0.8));
    const high = Math.max(low + 30, Math.round((base + largeBoost) * 1.6));
    budgetEstimate = `$${low}–$${high}`;
  }

  return {
    routineType: routineType || ctx,
    estimatedDuration: duration,
    complexityScore: complexity,
    totalProps,
    pocketLoad,
    tableRequired,
    resetTime,
    riskLevel,
    budgetEstimate,
  };
}

const OutputModeToggle: React.FC<{
  value: OutputMode;
  onChange: (v: OutputMode) => void;
}> = ({ value, onChange }) => {
  const items: Array<{ key: OutputMode; label: string }> = [
    { key: 'checklist', label: 'Checklist Mode' },
    { key: 'detailed', label: 'Detailed Production Plan' },
    { key: 'director', label: 'Director Mode' },
  ];
  return (
    <div className="mt-5">
      <div className="text-xs uppercase tracking-wider text-slate-400/80 mb-2">Output Mode</div>
      <div className="flex w-full rounded-lg border border-slate-700 overflow-hidden bg-slate-900/40">
        {items.map((it) => {
          const active = it.key === value;
          return (
            <button
              key={it.key}
              type="button"
              onClick={() => onChange(it.key)}
              className={[
                'flex-1 px-3 py-2 text-sm font-semibold transition-all',
                active
                  ? 'bg-gradient-to-r from-yellow-400/15 to-yellow-500/15 text-yellow-200 border-r border-yellow-400/30 shadow-[0_0_10px_rgba(250,204,21,0.15)]'
                  : 'text-slate-300 hover:bg-slate-800/50',
              ].join(' ')}
            >
              {it.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

const CollapsibleSection: React.FC<{
  section: BlueprintSection;
  isOpen: boolean;
  onToggle: () => void;
}> = ({ section, isOpen, onToggle }) => {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/25 overflow-hidden transition-all hover:border-yellow-400/20 hover:shadow-[0_0_16px_rgba(250,204,21,0.06)]">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center text-slate-200 font-semibold">
          {section.icon}
          <span>{section.title}</span>
        </div>
        <div className="text-slate-400">{isOpen ? '▾' : '▸'}</div>
      </button>

      {/* subtle gold accent divider */}
      <div className="h-px bg-gradient-to-r from-yellow-400/20 via-yellow-500/5 to-transparent" />

      {isOpen && (
        <div className="px-4 py-4 text-slate-200">
          {section.content ? (
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200/95">
              {stripMarkdown(section.content)}
            </div>
          ) : (
            <div className="text-sm text-slate-500">No items generated for this section.</div>
          )}
        </div>
      )}
    </div>
  );
};

const PropChecklists: React.FC<PropChecklistsProps> = ({ user, onIdeaSaved }) => {
  const dispatch = useAppDispatch();
  const tier = normalizeTier((user as any)?.membership as any);
  const isPro = tier === 'professional';

  const [routine, setRoutine] = useState('');
  const [selectedContexts, setSelectedContexts] = useState<string[]>([]);
  const [outputMode, setOutputMode] = useState<OutputMode>('checklist');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rawOutput, setRawOutput] = useState<string>('');
  const [sections, setSections] = useState<BlueprintSection[]>([]);
  const [openKeys, setOpenKeys] = useState<Set<SectionKey>>(new Set(['props']));

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');

  // Reliability guards
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1; // invalidate
    };
  }, []);

  const insights = useMemo(() => {
    if (!rawOutput) return null;
    return inferInsights({ routine, selectedContexts, sections, isPro });
  }, [rawOutput, routine, selectedContexts, sections, isPro]);

  const promptForMode = (mode: OutputMode, baseRoutine: string, ctx: string[]) => {
    const ctxLine = ctx.length ? `Context: ${ctx.join(', ')}` : 'Context: (none)';
    const common = `
${SYSTEM_RULES}

Routine Description:
${baseRoutine}

${ctxLine}

Output exactly these headings in this order (markdown):
## Props
## Staging
## Risk & Angles
## Reset
## Sound & Lighting
## Notes
`.trim();

    if (mode === 'checklist') {
      return common + `\n\nWrite concise bullet checklists in each section.`;
    }
    if (mode === 'detailed') {
      return common + `\n\nWrite a more detailed production plan with short paragraphs + bullets where helpful.`;
    }
    // director
    return common + `\n\nWrite like a show director: include cues, beats, and practical notes, while still staying non-exposure.`;
  };

  const handleToggleContext = (key: string) => {
    setSelectedContexts((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const handleClearAll = () => {
    requestIdRef.current += 1; // cancel in-flight
    setIsLoading(false);
    setError(null);
    setRoutine('');
    setSelectedContexts([]);
    setRawOutput('');
    setSections([]);
    setOpenKeys(new Set(['props']));
    setSaveStatus('idle');
  };

  const handleGenerate = async () => {
    const trimmed = routine.trim();
    if (!trimmed || isLoading) return;

    const reqId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const prompt = promptForMode(outputMode, trimmed, selectedContexts);
      const response = await withTimeout(generateResponse(prompt), 45000);

      if (!mountedRef.current || reqId !== requestIdRef.current) return;

      setRawOutput(response);

      const parsed = parseSections(response);
      setSections(parsed);

      // Open first meaningful section after generation
      const firstKey = (parsed.find((s) => s.content && s.content.trim())?.key ?? 'props') as SectionKey;
      setOpenKeys(new Set([firstKey]));
    } catch (err) {
      if (!mountedRef.current || reqId !== requestIdRef.current) return;
      const normalized = normalizeAiError(err);
      setError(normalized.userMessage);
    } finally {
      if (!mountedRef.current || reqId !== requestIdRef.current) return;
      setIsLoading(false);
    }
  };

  const handleSaveBlueprint = async () => {
    if (!rawOutput) return;
    try {
      const title = routine.trim() ? `Routine Blueprint: ${routine.trim().slice(0, 60)}` : 'Routine Blueprint';
      await saveIdea({
        type: 'text',
        title,
        content: rawOutput,
        tags: ['routine-blueprint'],
      });
      onIdeaSaved();
      await refreshIdeas(dispatch);
      setSaveStatus('saved');
      window.setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (e) {
      const normalized = normalizeAiError(e);
      setError(normalized.userMessage);
    }
  };

  const handleAddToShowPlanner = async () => {
    if (!rawOutput || sections.length === 0) return;
    const showTitle = routine.trim() ? routine.trim().slice(0, 80) : 'Routine Blueprint';
    try {
      setError(null);
      const show = await createShow(showTitle, 'Auto-created from Routine Blueprint');
      const tasks: Partial<Task>[] = sections
        .filter((s) => s.content && s.content.trim())
        .map((s) => ({
          title: s.title,
          notes: stripMarkdown(s.content),
          status: 'To-Do',
          priority: 'Medium',
          tags: ['routine-blueprint'],
        }));

      await addTasksToShow(show.id, tasks);
      await refreshShows(dispatch);
    } catch (e) {
      const normalized = normalizeAiError(e);
      setError(normalized.userMessage);
    }
  };

  const handleOptimizeWalkaround = async () => {
    if (!isPro || !rawOutput || isLoading) return;

    const reqId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const base = `Optimize this Routine Blueprint for walkaround: minimize props, avoid table dependency, prioritize pocket-friendly items. Keep the same headings and stay non-exposure.\n\n${rawOutput}`;
      const prompt = promptForMode(outputMode, base, [...selectedContexts, 'Walkaround']);
      const response = await withTimeout(generateResponse(prompt), 45000);

      if (!mountedRef.current || reqId !== requestIdRef.current) return;

      setRawOutput(response);
      const parsed = parseSections(response);
      setSections(parsed);
      const firstKey = (parsed.find((s) => s.content && s.content.trim())?.key ?? 'props') as SectionKey;
      setOpenKeys(new Set([firstKey]));
    } catch (err) {
      if (!mountedRef.current || reqId !== requestIdRef.current) return;
      const normalized = normalizeAiError(err);
      setError(normalized.userMessage);
    } finally {
      if (!mountedRef.current || reqId !== requestIdRef.current) return;
      setIsLoading(false);
    }
  };

  const toggleSection = (key: SectionKey) => {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const hasOutput = Boolean(rawOutput && rawOutput.trim().length > 0);

  const generateLabel = isLoading ? 'Generating…' : hasOutput ? 'Regenerate' : 'Generate';
  const generateDisabled = isLoading || routine.trim().length === 0;

  const saveLabel = saveStatus === 'saved' ? 'Saved ✓' : 'Save Blueprint';

  return (
    <div className="w-full">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/20 p-6">
          <h2 className="text-2xl font-bold text-slate-100">Routine Blueprint</h2>
          <p className="text-slate-400/80 mt-2 leading-relaxed">
            Describe your routine, theme, or full show concept. The Wizard will generate a structured production checklist
            including props, staging notes, reset considerations, and performance risks.
          </p>

          <div className="mt-6 flex items-end justify-between">
            <div>
              <div className="text-slate-200 font-semibold">Routine or Show Description</div>
              <div className="text-xs uppercase tracking-wider text-slate-400/80 mt-2">Context (optional)</div>
              <div className="flex flex-wrap gap-2 mt-2">
                {CONTEXT_OPTIONS.map((c) => {
                  const selected = selectedContexts.includes(c.key);
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => handleToggleContext(c.key)}
                      className={[
                        'px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 border',
                        selected
                          ? 'bg-gradient-to-r from-yellow-400/20 to-yellow-500/20 border-yellow-400/50 text-yellow-200 shadow-[0_0_8px_rgba(250,204,21,0.25)]'
                          : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:border-slate-500 hover:bg-slate-700/60',
                      ].join(' ')}
                    >
                      <span className="mr-2">{c.icon}</span>
                      {c.key}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <label className="text-sm text-purple-300 hover:text-purple-200 cursor-pointer">
                <input type="file" accept=".txt,.md" className="hidden" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (event) => setRoutine(String(event.target?.result ?? ''));
                  reader.readAsText(file);
                  (e.target as any).value = '';
                }} />
                Upload Script…
              </label>

              <button
                type="button"
                onClick={handleClearAll}
                className="text-sm text-slate-400 hover:text-slate-200"
              >
                Clear
              </button>
            </div>
          </div>

          <textarea
            value={routine}
            onChange={(e) => setRoutine(e.target.value)}
            placeholder={
              'Describe your routine, theme, or full show concept...\n\nExample: A 5-minute silent multiplying balls routine with a musical score.\nExample: A 30-minute corporate stage act: card manipulation, a mind-reading segment, and linking rings.'
            }
            className="w-full min-h-[200px] mt-4 bg-slate-800/70 border border-slate-700 rounded-lg p-4 text-slate-200 placeholder-slate-400 resize-none transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400/60 focus:shadow-[0_0_10px_rgba(250,204,21,0.25)]"
          />

          <OutputModeToggle value={outputMode} onChange={setOutputMode} />

          {error && (
            <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-200 text-sm">
              {error}
            </div>
          )}

          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleSaveBlueprint}
              disabled={!hasOutput}
              className={[
                'flex items-center justify-center gap-2 rounded-lg border px-4 py-3 font-semibold transition-all',
                hasOutput
                  ? 'border-slate-700 bg-slate-900/40 text-slate-200 hover:bg-slate-800/50'
                  : 'border-slate-800 bg-slate-950/20 text-slate-600 cursor-not-allowed',
              ].join(' ')}
              title={!hasOutput ? 'Generate a blueprint first' : 'Save blueprint to Saved Ideas'}
            >
              <SaveIcon className="w-5 h-5" />
              {saveLabel}
            </button>

            <button
              type="button"
              onClick={handleGenerate}
              disabled={generateDisabled}
              className={[
                'flex items-center justify-center gap-2 rounded-lg px-4 py-3 font-bold transition-all',
                generateDisabled
                  ? 'bg-slate-700/50 text-slate-400 cursor-not-allowed'
                  : 'bg-purple-600 hover:bg-purple-500 text-white shadow-[0_0_14px_rgba(168,85,247,0.25)] hover:shadow-[0_0_18px_rgba(168,85,247,0.35)]',
              ].join(' ')}
            >
              <ChecklistIcon className="w-5 h-5" />
              {generateLabel}
            </button>
          </div>
        </div>

        {/* Right */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/20 overflow-hidden flex flex-col relative">
          {isLoading && <LoadingOverlay label="Generating…" sublabel="Hang tight — this usually takes a few seconds." />}

          {!hasOutput ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-10 -mt-4">
              <ChecklistIcon className="w-14 h-14 text-slate-500 animate-pulse" />
              <div className="mt-5 text-slate-200 font-semibold text-lg">Your production checklist will appear here.</div>
              <div className="mt-2 text-slate-400 text-sm">
                Includes props, staging notes, risk alerts, reset flow, and performance cues.
              </div>
            </div>
          ) : (
            <>
              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {insights && (
                  <>
                    {/* Thin insight strip */}
                    <div className="flex flex-wrap gap-2 text-sm">
                      <div className="px-3 py-1 rounded-full border border-slate-700 bg-slate-900/30 text-slate-200">
                        Routine Type: <span className="text-slate-100 font-semibold">{insights.routineType}</span>
                      </div>
                      <div className="px-3 py-1 rounded-full border border-slate-700 bg-slate-900/30 text-slate-200">
                        Estimated Duration: <span className="text-slate-100 font-semibold">{insights.estimatedDuration}</span>
                      </div>
                      <div className="px-3 py-1 rounded-full border border-slate-700 bg-slate-900/30 text-slate-200">
                        Complexity: <span className="text-yellow-200 font-semibold">{insights.complexityScore}/10</span>
                      </div>
                    </div>

                    {/* Production intelligence */}
                    <div className="rounded-xl border border-slate-800 bg-slate-900/20 p-4">
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-lg border border-slate-800 bg-slate-950/20 p-3 flex items-center justify-between">
                          <span className="text-slate-300">Total Props</span>
                          <span className="text-slate-100 font-semibold">{insights.totalProps}</span>
                        </div>
                        <div className="rounded-lg border border-slate-800 bg-slate-950/20 p-3 flex items-center justify-between">
                          <span className="text-slate-300">Pocket Load</span>
                          <span className="text-slate-100 font-semibold">{insights.pocketLoad}</span>
                        </div>
                        <div className="rounded-lg border border-slate-800 bg-slate-950/20 p-3 flex items-center justify-between">
                          <span className="text-slate-300">Table Required</span>
                          <span className="text-slate-100 font-semibold">{insights.tableRequired}</span>
                        </div>
                        <div className="rounded-lg border border-slate-800 bg-slate-950/20 p-3 flex items-center justify-between">
                          <span className="text-slate-300">Reset Time</span>
                          <span className="text-slate-100 font-semibold">{insights.resetTime}</span>
                        </div>
                        <div className="rounded-lg border border-slate-800 bg-slate-950/20 p-3 flex items-center justify-between col-span-2">
                          <span className="text-slate-300">Risk Level</span>
                          <span className="text-slate-100 font-semibold">{insights.riskLevel}</span>
                        </div>
                        {isPro && insights.budgetEstimate && (
                          <div className="rounded-lg border border-slate-800 bg-slate-950/20 p-3 flex items-center justify-between col-span-2">
                            <span className="text-slate-300">Estimated Prop Cost</span>
                            <span className="text-slate-100 font-semibold">{insights.budgetEstimate}</span>
                          </div>
                        )}
                      </div>
                      <div className="mt-3 text-xs text-slate-500">
                        Estimates based on description + selected context.
                      </div>
                    </div>
                  </>
                )}

                {/* Sections */}
                <div className="space-y-3">
                  {sections.map((s) => (
                    <CollapsibleSection
                      key={s.key}
                      section={s}
                      isOpen={openKeys.has(s.key)}
                      onToggle={() => toggleSection(s.key)}
                    />
                  ))}
                </div>
              </div>

              {/* Sticky footer controls */}
              <div className="sticky bottom-0 border-t border-slate-800 bg-slate-950/40 backdrop-blur px-4 py-3 flex flex-wrap gap-2 items-center justify-end">
                <button
                  type="button"
                  onClick={handleOptimizeWalkaround}
                  disabled={!isPro || isLoading || !hasOutput}
                  className={[
                    'px-4 py-2 rounded-lg font-semibold border transition-all',
                    !isPro
                      ? 'border-slate-800 bg-slate-950/20 text-slate-600 cursor-not-allowed'
                      : isLoading || !hasOutput
                      ? 'border-slate-700 bg-slate-900/30 text-slate-500 cursor-not-allowed'
                      : 'border-slate-700 bg-slate-900/30 text-slate-200 hover:bg-slate-800/50',
                  ].join(' ')}
                  title={!isPro ? 'Professional tier required' : 'Optimize this blueprint for walkaround'}
                >
                  🔒 Optimize for Walkaround
                </button>

                <button
                  type="button"
                  onClick={handleAddToShowPlanner}
                  disabled={!hasOutput || isLoading}
                  className={[
                    'px-4 py-2 rounded-lg font-bold transition-all',
                    !hasOutput || isLoading
                      ? 'bg-slate-700/50 text-slate-400 cursor-not-allowed'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-100',
                  ].join(' ')}
                  title="Create a Show and add tasks from this blueprint"
                >
                  ▶ Add to Show Planner
                </button>

                <ShareButton
                  title="Routine Blueprint"
                  text={rawOutput}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold"
                >
                  <ShareIcon className="w-5 h-5 inline-block mr-2" />
                  Share
                </ShareButton>

                <button
                  type="button"
                  onClick={handleSaveBlueprint}
                  disabled={!hasOutput}
                  className={[
                    'px-4 py-2 rounded-lg border font-semibold transition-all',
                    hasOutput ? 'border-slate-700 bg-slate-900/30 text-slate-200 hover:bg-slate-800/50' : 'border-slate-800 bg-slate-950/20 text-slate-600 cursor-not-allowed',
                  ].join(' ')}
                >
                  <SaveIcon className="w-5 h-5 inline-block mr-2" />
                  {saveLabel}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PropChecklists;