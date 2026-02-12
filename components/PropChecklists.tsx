import React, { useMemo, useRef, useState } from 'react';
import { generateResponse } from '../services/geminiService';
import { saveIdea } from '../services/ideasService';
import * as showsService from '../services/showsService';
import { ChecklistIcon, WandIcon, SaveIcon, CheckIcon, ShareIcon, SendIcon, BlueprintIcon, LockIcon } from './icons';
import ShareButton from './ShareButton';
import { useAppDispatch, useAppState, refreshShows, refreshIdeas } from '../store';

interface PropChecklistsProps {
  onIdeaSaved: () => void;
}

type OutputMode = 'checklist' | 'detailed' | 'director';

type ParsedSection = {
  key: string;
  title: string;
  content: string;
};

const MODE_LABELS: Record<OutputMode, string> = {
  checklist: 'Checklist Mode',
  detailed: 'Detailed Production Plan',
  director: 'Director Mode',
};

const SECTION_HEADINGS = [
  '🧰 Props',
  '🎬 Staging',
  '⚠️ Risk & Angles',
  '🔁 Reset',
  '🎵 Sound & Lighting',
  '📝 Notes',
] as const;

const PROP_CHECKLIST_SYSTEM_INSTRUCTION = `You are an expert magic production stage manager and prop master for professional magicians.
Your job is to generate practical, non-exposure production plans. You MUST NOT reveal secret methods, gimmicks, or instructions that expose magic.
Always produce clean, usable, performer-facing output.

CRITICAL FORMAT REQUIREMENTS:
- Output MUST be in Markdown.
- Use EXACTLY these H2 headings (each on its own line, in this exact order):
  ## 🧰 Props
  ## 🎬 Staging
  ## ⚠️ Risk & Angles
  ## 🔁 Reset
  ## 🎵 Sound & Lighting
  ## 📝 Notes

CONTENT GUIDELINES:
- Use bullet lists wherever helpful.
- Keep language practical and specific (what to pack, where it goes, what to check, what can fail).
- Include backups/consumables when relevant.
- If information is missing, make safe assumptions and label them clearly.
`;

const LoadingIndicator: React.FC = () => (
  <div className="flex flex-col items-center justify-center text-center p-8">
    <div className="relative">
      <WandIcon className="w-16 h-16 text-purple-400 animate-pulse" />
      <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
        <div className="w-24 h-24 border-t-2 border-purple-300 rounded-full animate-spin" />
      </div>
    </div>
    <p className="text-slate-300 mt-4 text-lg">Building your checklist...</p>
    <p className="text-slate-400 text-sm">Thinking of every little detail.</p>
  </div>
);

function normalizeSectionKey(title: string) {
  return title
    .replace(/^#+\s*/g, '')
    .replace(/[^-]+/g, '') // strip emoji for key
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .toLowerCase()
    .trim();
}

function parseMarkdownSections(markdown: string): ParsedSection[] {
  const text = String(markdown ?? '').trim();
  if (!text) return [];

  const headingRe = /^##\s+(.+)$/gm;
  const matches: { title: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(text)) !== null) {
    matches.push({ title: m[1].trim(), index: m.index });
  }

  // If headings are missing, fall back to a single section.
  if (matches.length === 0) {
    return [{ key: 'output', title: 'Output', content: text }];
  }

  const sections: ParsedSection[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const block = text.slice(start, end).trim();

    // block begins with "## Title"
    const firstLineEnd = block.indexOf('\n');
    const titleLine = firstLineEnd >= 0 ? block.slice(0, firstLineEnd) : block;
    const title = titleLine.replace(/^##\s+/, '').trim();
    const content = firstLineEnd >= 0 ? block.slice(firstLineEnd + 1).trim() : '';

    sections.push({
      key: normalizeSectionKey(title),
      title,
      content,
    });
  }

  // Ensure any missing standard sections still show up (empty) to keep UI consistent.
  const map = new Map(sections.map((s) => [s.title, s]));
  const normalized = SECTION_HEADINGS.map((h) => {
    const existing = [...map.values()].find((s) => s.title === h || s.title.endsWith(h));
    if (existing) return existing;
    return { key: normalizeSectionKey(h), title: h, content: '' };
  });

  // Also include any extra sections the model returned (rare) after the standard set.
  const extras = sections.filter((s) => !normalized.some((n) => n.key === s.key));
  return [...normalized, ...extras];
}

function getSectionContent(sections: ParsedSection[], heading: string): string {
  const match = sections.find((s) => s.title.trim() === heading.trim() || s.title.trim().endsWith(heading.trim()));
  return match?.content ?? '';
}

function extractBulletLikeItems(content: string): string[] {
  const lines = String(content ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const items: string[] = [];
  for (const line of lines) {
    // - item, * item, • item, 1. item
    const m = line.match(/^([-*•]|\d+\.|\d+\))\s+(.*)$/);
    if (m?.[2]) items.push(m[2].trim());
  }
  // fallback: if no bullets, treat non-empty lines as items (rare)
  return items.length ? items : lines;
}

function parseTimeRange(text: string): string | null {
  const t = String(text ?? '');
  const range = t.match(/(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*(minutes?|mins?|min)/i);
  if (range) return `${range[1]}–${range[2]} min`;
  const single = t.match(/\b(\d+(?:\.\d+)?)\s*(minutes?|mins?|min)\b/i);
  if (single) return `${single[1]} min`;
  return null;
}

function inferInsights(params: {
  routine: string;
  selectedContexts: string[];
  sections: ParsedSection[];
  isPro: boolean;
}): BlueprintInsights {
  const { routine, selectedContexts, sections, isPro } = params;

  // Routine type
  const routineType = selectedContexts.length
    ? selectedContexts.length === 1
      ? selectedContexts[0]
      : 'Mixed'
    : 'General';

  // Duration (try to read from routine text)
  const durMatch = String(routine).match(/\b(\d{1,3})\s*(?:minute|minutes|min)\b/i);
  const estimatedDuration = durMatch ? `${durMatch[1]} min` : '—';

  // Props
  const propsContent = getSectionContent(sections, '🧰 Props');
  const props = extractBulletLikeItems(propsContent);
  const totalProps = propsContent.trim() ? props.length : null;

  const bigKeywords = /(table|servante|case|suitcase|sound system|speaker|mic stand|microphone stand|tripod|camera|backdrop|banner|stand|stage\s+table|side\s+table|easel|chair|stool|platform|light|lighting)/i;
  const pocketUnfriendly = /(box|ring|rings|rope|bottle|ball|balls|cups?|wand|clipboard|pad|book|glass|wine|bowl|tube)/i;
  const hasBig = bigKeywords.test(propsContent) || bigKeywords.test(getSectionContent(sections, '🎬 Staging'));

  let pocketLoad: BlueprintInsights['pocketLoad'] = null;
  if (totalProps != null) {
    // Pocket Load is about how feasible this is to carry "on-body" (walkaround), not whether props are bulky stage pieces.
    const isStageLike = selectedContexts.some((c) => ['Stage', 'Parlor', 'Corporate', 'Family Show'].includes(c)) && !selectedContexts.includes('Close-Up');

    const propText = `${propsContent}\n${getSectionContent(sections, '🎬 Staging')}\n${routine}`;
    const hasBulkyStageGear = bigKeywords.test(propText);
    const hasLargeHandProps = /(linking\s+rings?|\brings?\b|\brope\b|\bcups?\b|\bballs?\b|\bwand\b|\bbook\b|\bclipboard\b|\bpad\b|\btube\b)/i.test(propText);

    // Count "small" items roughly (cards, coins, rubber bands, sharpie, etc.) to approximate true pocket load.
    const smallItemHints = /(cards?|deck|coins?|rubber\s*bands?|sharpie|marker|pen|business\s*cards?|wallet|keys?|ring\s*box|tt\b|thumb\s*tip)/i;
    const smallCount = props.filter((it) => smallItemHints.test(it)).length;

    // Base pocket-load: lean lower for stage-like contexts, higher for close-up/walkaround style.
    let base: BlueprintInsights['pocketLoad'] = 'Moderate';
    if (isStageLike) {
      base = totalProps <= 10 ? 'Low' : totalProps <= 18 ? 'Moderate' : 'High';
    } else {
      // Close-Up / unspecified: pockets matter more.
      base = totalProps <= 6 ? 'Low' : totalProps <= 12 ? 'Moderate' : 'High';
    }

    // If the list is dominated by large hand props (rings/rope/etc.), that usually reduces POCKET load (carried in case),
    // even if total prop count is non-trivial.
    if (hasLargeHandProps && smallCount <= 2 && base === 'High') base = 'Moderate';
    if (hasLargeHandProps && smallCount <= 2 && base === 'Moderate') base = 'Low';

    // If there are many small items and the context suggests close-up, bump up.
    if (!isStageLike && smallCount >= 8 && base !== 'High') base = 'High';

    // Stage gear (tables, cases, audio, etc.) should not inflate pocket load; it typically implies a case/table, not pockets.
    pocketLoad = hasBulkyStageGear ? (base === 'High' ? 'Moderate' : base) : base;
  }

  const tableRequired =
 propsContent.trim()
    ? /\b(table|mat|close[- ]?up pad|servante|side table)\b/i.test(propsContent + '\n' + getSectionContent(sections, '🎬 Staging'))
    : null;

  // Reset time
  const resetContent = getSectionContent(sections, '🔁 Reset');
  const resetTime = parseTimeRange(resetContent) ?? (totalProps == null ? null : totalProps <= 6 ? '1–2 min' : totalProps <= 12 ? '2–3 min' : '4–6 min');

  // Risk level
  const riskContent = getSectionContent(sections, '⚠️ Risk & Angles');
  let riskLevel: BlueprintInsights['riskLevel'] = null;
  const riskText = `${riskContent}\n${getSectionContent(sections, '🎬 Staging')}`;
  if (riskContent.trim()) {
    if (/\b(high|critical)\b/i.test(riskText) || /(flash|exposed|angle[- ]?sensitive|hazard)/i.test(riskText)) riskLevel = 'High';
    else if (/\b(medium|moderate)\b/i.test(riskText) || /(angles?|timing|lighting|reset|volunteer management)/i.test(riskText)) riskLevel = 'Medium';
    else if (/\b(low|minimal)\b/i.test(riskText)) riskLevel = 'Low';
    else riskLevel = totalProps != null ? (totalProps <= 6 ? 'Low' : totalProps <= 12 ? 'Medium' : 'High') : 'Medium';
  }

  // Complexity score 1-10
  let complexityScore: number | null = null;
  if (totalProps != null) {
    const propScore = Math.min(6, Math.ceil(totalProps / 2)); // 1..6-ish
    const riskScore = riskLevel === 'High' ? 3 : riskLevel === 'Medium' ? 2 : 1;
    const tableScore = tableRequired ? 1 : 0;
    complexityScore = Math.max(1, Math.min(10, propScore + riskScore + tableScore));
  }

  // Budget estimate (PRO)
  let estimatedPropCost: BlueprintInsights['estimatedPropCost'] = null;
  if (isPro && totalProps != null) {
    let base = 0;
    for (const item of props) {
      const s = item.toLowerCase();
      if (/(speaker|mic|microphone|amp|audio|light|lighting|tripod|camera)/i.test(s)) base += 60;
      else if (/(table|case|suitcase|backdrop|banner|stand|easel)/i.test(s)) base += 40;
      else if (/(rope|rings?|cups?|balls?|wand|book|pad|clipboard)/i.test(s)) base += 20;
      else base += 10;
    }
    const min = Math.max(0, Math.round(base * 0.7 / 5) * 5);
    const max = Math.max(min + 10, Math.round(base * 1.3 / 5) * 5);
    estimatedPropCost = { min, max };
  }

  // Optimization suggestion (PRO feature output)
  const optimizationSuggestion = isPro
    ? hasBig
      ? 'Consider removing or consolidating table-dependent pieces for true walkaround.'
      : 'This appears walkaround-friendly. You could further reduce bulk by merging redundancies.'
    : null;

  return {
    routineType,
    estimatedDuration,
    complexityScore,
    totalProps,
    pocketLoad,
    tableRequired,
    resetTime,
    riskLevel,
    estimatedPropCost,
    optimizationSuggestion,
  };
}

const PropChecklists: React.FC<PropChecklistsProps> = ({ onIdeaSaved }) => {
  const dispatch = useAppDispatch();
  const { currentUser } = useAppState() as any; // currentUser exists in some branches

  const isPro = (currentUser?.membership ?? 'free') === 'professional';

  const [routine, setRoutine] = useState('');
  const [outputMode, setOutputMode] = useState<OutputMode>('checklist');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rawOutput, setRawOutput] = useState<string | null>(null);
  const [sections, setSections] = useState<ParsedSection[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [plannerStatus, setPlannerStatus] = useState<'idle' | 'sent'>('idle');
  const [blueprintStatus, setBlueprintStatus] = useState<'idle' | 'saved'>('idle');
  const [optimizeStatus, setOptimizeStatus] = useState<'idle' | 'optimizing' | 'done'>('idle');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const CONTEXT_CHIPS = useMemo(
    () => [
      { label: 'Stage', emoji: '🎭' },
      { label: 'Close-Up', emoji: '🪄' },
      { label: 'Mentalism', emoji: '🧠' },
      { label: 'Family Show', emoji: '👨‍👩‍👧' },
      { label: 'Corporate', emoji: '🏢' },
      { label: 'Gospel', emoji: '⛪' },
      { label: 'Parlor', emoji: '🎪' },
    ],
    []
  );

  const [selectedContexts, setSelectedContexts] = useState<string[]>([]);

  const insights = useMemo(() => {
    if (!rawOutput || !sections.length) return null;
    return inferInsights({ routine, selectedContexts, sections, isPro });
  }, [rawOutput, sections, routine, selectedContexts, isPro]);

  const toggleContext = (label: string) => {
    setSelectedContexts((prev) => (prev.includes(label) ? prev.filter((x) => x !== label) : [...prev, label]));
  };


  const handleClearAll = () => {
    setRoutine('');
    setSelectedContexts([]);
    setError(null);

    // Clear generated output + UI state
    setRawOutput(null);
    setSections([]);
    setExpanded({});
    setPlannerStatus('idle');
    setBlueprintStatus('idle');
    setOptimizeStatus('idle');
  };

  const handleGenerate = async () => {
    if (!routine.trim()) {
      setError('Please describe the routine or show.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setRawOutput(null);
    setSections([]);
    setExpanded({});
    setSaveStatus('idle');
    setPlannerStatus('idle');
    setBlueprintStatus('idle');

    const contextLine = selectedContexts.length ? `Context: ${selectedContexts.join(', ')}.` : '';
    const modeLine = `Output Mode: ${MODE_LABELS[outputMode]}.`;

    const modeInstruction =
      outputMode === 'checklist'
        ? 'Keep each section concise and checklist-oriented (bullets, short phrases).'
        : outputMode === 'detailed'
          ? 'Be more detailed: include steps, timing cues, and practical notes per bullet.'
          : 'Act like a show director: include performance cues, audience management notes, and transitions (still practical and non-exposure).';

    const prompt = `
${contextLine}
${modeLine}

Routine / Show Concept:
"${routine}"

Instructions:
- Follow the CRITICAL FORMAT REQUIREMENTS exactly.
- ${modeInstruction}
- Keep it ethical and non-exposure.
`.trim();

    try {
      const response = await generateResponse(
        prompt,
        PROP_CHECKLIST_SYSTEM_INSTRUCTION,
        currentUser || { email: '', membership: 'free', generationCount: 0, lastResetDate: '' }
      );

      setRawOutput(response);
      const parsed = parseMarkdownSections(response);

      // Default open the first two sections for a strong "power" feel.
      const initialExpanded: Record<string, boolean> = {};
      parsed.forEach((s, idx) => {
        initialExpanded[s.key] = idx < 2;
      });

      setSections(parsed);
      setExpanded(initialExpanded);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveBlueprint = async () => {
    if (!rawOutput) return;
    try {
      const fullContent = `# Routine Blueprint: ${routine}\n\n${rawOutput}`;
      await saveIdea({
        type: 'text',
        title: `Routine Blueprint: ${routine}`,
        content: fullContent,
        tags: ['routine-blueprint'],
      });
      onIdeaSaved();
      await refreshIdeas(dispatch);
      setBlueprintStatus('saved');
      setTimeout(() => setBlueprintStatus('idle'), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save blueprint.');
    }
  };

  const handleSendToShowPlanner = async () => {
    if (!rawOutput) return;
    setError(null);

    try {
      // Create a new show with the routine name; the user can later move/merge tasks if desired.
      const title = routine.trim().slice(0, 80) || 'Routine Blueprint';
      const description = [
        selectedContexts.length ? `Context: ${selectedContexts.join(', ')}` : null,
        `Mode: ${MODE_LABELS[outputMode]}`,
        '',
        'Generated from Routine Blueprint tool.',
      ]
        .filter(Boolean)
        .join('\n');

      const created = await showsService.createShow(title, description);

      const tasks = sections.length
        ? sections.map((s) => ({
            title: s.title,
            notes: s.content?.trim() ? s.content.trim() : '(No additional notes generated.)',
            priority: 'Medium' as const,
            status: 'To-Do' as const,
          }))
        : [
            {
              title: 'Routine Blueprint',
              notes: rawOutput,
              priority: 'Medium' as const,
              status: 'To-Do' as const,
            },
          ];

      await showsService.addTasksToShow(created.id as any, tasks as any);

      await refreshShows(dispatch);

      setPlannerStatus('sent');
      setTimeout(() => setPlannerStatus('idle'), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send to Show Planner.');
    }
  };

  const handleOptimizeForWalkaround = async () => {
    if (!rawOutput) return;
    if (!isPro) {
      setError('Walkaround optimization is a Professional feature.');
      return;
    }

    setOptimizeStatus('optimizing');
    setError(null);

    const contextLine = selectedContexts.length ? `Current Context: ${selectedContexts.join(', ')}.` : '';
    const prompt = `
${contextLine}

You previously generated this Routine Blueprint:

---
${rawOutput}
---

Task:
- Optimize this plan for TRUE walkaround / pockets-only performance.
- Reduce bulky props, remove table-dependent staging, and suggest pocket-friendly substitutions where appropriate.
- Keep it ethical and non-exposure.
- Follow the CRITICAL FORMAT REQUIREMENTS exactly and output Markdown.
- Keep the same headings and order.
`.trim();

    try {
      const response = await generateResponse(
        prompt,
        PROP_CHECKLIST_SYSTEM_INSTRUCTION,
        currentUser || { email: '', membership: 'free', generationCount: 0, lastResetDate: '' }
      );

      setRawOutput(response);
      const parsed = parseMarkdownSections(response);
      const initialExpanded: Record<string, boolean> = {};
      parsed.forEach((s, idx) => {
        initialExpanded[s.key] = idx < 2;
      });
      setSections(parsed);
      setExpanded(initialExpanded);

      setOptimizeStatus('done');
      setTimeout(() => setOptimizeStatus('idle'), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to optimize for walkaround.');
      setOptimizeStatus('idle');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setRoutine(text);
      };
      reader.readAsText(file);
    }
    if (e.target) e.target.value = '';
  };

  const baseChip = 'px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 border';
  const selectedChip =
    'bg-gradient-to-r from-yellow-400/20 to-yellow-500/20 border-yellow-400/50 text-yellow-200 shadow-[0_0_8px_rgba(250,204,21,0.25)]';
  const unselectedChip =
    'bg-slate-800/60 border-slate-700 text-slate-300 hover:border-slate-500 hover:bg-slate-700/60';

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Control Panel */}
      <div className="flex flex-col">
        <h2 className="text-xl font-bold text-slate-300 mb-2">Routine Blueprint</h2>
        <p className="text-slate-400/80 mb-4 leading-relaxed">
          Describe your routine, theme, or full show concept. The Wizard will generate a structured production checklist including
          props, staging notes, reset considerations, and performance risks.
        </p>

        <div className="space-y-4">
          <div>
            <div className="flex justify-between items-baseline mb-1">
              <label htmlFor="routine-description" className="block text-sm font-medium text-slate-300">
                Routine or Show Description
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2 py-0.5 text-xs font-semibold text-purple-400 hover:text-purple-300 transition-colors"
                >
                  Upload Script...
                </button>
                {routine && (
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="px-2 py-0.5 text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-700 rounded-md transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".txt,.md" />

            {/* Context chips */}
            <div className="mb-3">
              <p className="text-xs font-semibold text-slate-400 mb-2">CONTEXT (OPTIONAL)</p>
              <div className="flex flex-wrap gap-2">
                {CONTEXT_CHIPS.map((chip) => {
                  const isActive = selectedContexts.includes(chip.label);
                  return (
                    <button
                      key={chip.label}
                      type="button"
                      onClick={() => toggleContext(chip.label)}
                      className={`${baseChip} ${isActive ? selectedChip : unselectedChip}`}
                    >
                      <span className="mr-1">{chip.emoji}</span>
                      <span>{chip.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <textarea
              id="routine-description"
              rows={8}
              value={routine}
              onChange={(e) => {
                setRoutine(e.target.value);
                setError(null);
              }}
              placeholder={
                'Describe your routine, theme, or full show concept...\n\n' +
                'Example: A 5-minute silent multiplying balls routine with a musical score.\n' +
                'Example: A 30-minute corporate stage act: card manipulation, a mind-reading segment, and linking rings.'
              }
              className="w-full min-h-[180px] bg-slate-800/70 border border-slate-700 rounded-lg p-4 text-slate-200 placeholder-slate-400 resize-none transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400/60 focus:shadow-[0_0_10px_rgba(250,204,21,0.25)]"
            />
          </div>

          {/* Output mode toggle */}
          <div>
            <p className="text-xs font-semibold text-slate-400 mb-2">OUTPUT MODE</p>
            <div className="inline-flex w-full rounded-lg border border-slate-700/80 bg-slate-900/40 p-1">
              {(['checklist', 'detailed', 'director'] as OutputMode[]).map((mode) => {
                const active = outputMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setOutputMode(mode)}
                    className={
                      'flex-1 px-3 py-2 text-xs sm:text-sm font-semibold rounded-md transition-all ' +
                      (active
                        ? 'bg-slate-800/80 text-yellow-200 shadow-[0_0_10px_rgba(250,204,21,0.18)] border border-yellow-400/30'
                        : 'text-slate-300 hover:text-slate-100 hover:bg-slate-800/40')
                    }
                  >
                    {MODE_LABELS[mode]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={handleSaveBlueprint}
              disabled={!rawOutput || isLoading}
              className="w-full py-3 flex items-center justify-center gap-2 bg-slate-800/70 hover:bg-slate-700/70 rounded-md text-slate-200 font-bold transition-colors disabled:bg-slate-800/30 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-700"
              title={!rawOutput ? 'Generate a blueprint first' : 'Save this blueprint (tagged: routine-blueprint)'}
            >
              {blueprintStatus === 'saved' ? <CheckIcon className="w-5 h-5 text-green-400" /> : <SaveIcon className="w-5 h-5" />}
              <span>{blueprintStatus === 'saved' ? 'Saved!' : 'Save'}</span>
            </button>

            <button
              onClick={handleGenerate}
              disabled={isLoading || !routine.trim()}
              className="w-full py-3 flex items-center justify-center gap-2 rounded-md text-white font-bold transition-all disabled:bg-slate-600 disabled:cursor-not-allowed bg-purple-600 hover:bg-purple-700 hover:-translate-y-0.5 hover:shadow-[0_0_18px_rgba(250,204,21,0.18)] relative overflow-hidden group"
            >
              <span className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="absolute -inset-10 bg-gradient-to-r from-yellow-400/10 via-purple-500/10 to-yellow-400/10 animate-pulse" />
              </span>
              <BlueprintIcon className="w-5 h-5 relative" />
              <span className="relative">{isLoading ? 'Generating…' : rawOutput ? 'Regenerate' : 'Generate'}</span>
            </button>
          </div>

          {error && <p className="text-red-400 mt-2 text-sm text-center">{error}</p>}
        </div>
      </div>

      {/* Output Display Area */}
      <div className="flex flex-col bg-slate-900/50 rounded-lg border border-slate-800 min-h-[300px]">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <LoadingIndicator />
          </div>
        ) : rawOutput ? (
          <div className="relative group flex-1 flex flex-col">
            {/* Collapsible sections */}
            <div className="p-4 overflow-y-auto space-y-3">
              {insights && (
                <div className="rounded-lg border border-yellow-400/20 bg-slate-950/40 p-3 mb-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
                    <div className="px-2 py-1 rounded-md bg-slate-900/60 border border-slate-800">
                      <span className="text-slate-400">Routine Type:</span>{' '}
                      <span className="font-semibold text-slate-200">{insights.routineType}</span>
                    </div>
                    <div className="px-2 py-1 rounded-md bg-slate-900/60 border border-slate-800">
                      <span className="text-slate-400">Estimated Duration:</span>{' '}
                      <span className="font-semibold text-slate-200">{insights.estimatedDuration}</span>
                    </div>
                    <div className="px-2 py-1 rounded-md bg-slate-900/60 border border-slate-800">
                      <span className="text-slate-400">Complexity:</span>{' '}
                      <span className="font-semibold text-yellow-200">
                        {insights.complexityScore != null ? `${insights.complexityScore}/10` : '—'}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center justify-between px-3 py-2 rounded-md bg-slate-900/40 border border-slate-800">
                      <span className="text-slate-400">Total Props</span>
                      <span className="font-semibold text-slate-200">{insights.totalProps ?? '—'}</span>
                    </div>
                    <div className="flex items-center justify-between px-3 py-2 rounded-md bg-slate-900/40 border border-slate-800">
                      <span className="text-slate-400">Pocket Load</span>
                      <span className="font-semibold text-slate-200">{insights.pocketLoad ?? '—'}</span>
                    </div>
                    <div className="flex items-center justify-between px-3 py-2 rounded-md bg-slate-900/40 border border-slate-800">
                      <span className="text-slate-400">Table Required</span>
                      <span className="font-semibold text-slate-200">
                        {insights.tableRequired == null ? '—' : insights.tableRequired ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between px-3 py-2 rounded-md bg-slate-900/40 border border-slate-800">
                      <span className="text-slate-400">Reset Time</span>
                      <span className="font-semibold text-slate-200">{insights.resetTime ?? '—'}</span>
                    </div>
                    <div className="flex items-center justify-between px-3 py-2 rounded-md bg-slate-900/40 border border-slate-800">
                      <span className="text-slate-400">Risk Level</span>
                      <span className="font-semibold text-slate-200">{insights.riskLevel ?? '—'}</span>
                    </div>
                    {isPro && (
                      <div className="flex items-center justify-between px-3 py-2 rounded-md bg-slate-900/40 border border-slate-800">
                        <span className="text-slate-400">Estimated Prop Cost</span>
                        <span className="font-semibold text-slate-200">
                          {insights.estimatedPropCost ? `$${insights.estimatedPropCost.min}–$${insights.estimatedPropCost.max}` : '—'}
                        </span>
                      </div>
                    )}
                  </div>

                  {isPro && insights.optimizationSuggestion && (
                    <div className="mt-3 text-xs text-slate-300">
                      <span className="text-slate-400">Walkaround note:</span> {insights.optimizationSuggestion}
                    </div>
                  )}
                </div>
              )}

              {sections.map((s) => {
                const isOpen = Boolean(expanded[s.key]);
                return (
                  <div key={s.key} className="rounded-lg border border-slate-800 bg-slate-950/30 overflow-hidden transition-shadow hover:shadow-[0_0_14px_rgba(250,204,21,0.08)]">
                    <button
                      type="button"
                      onClick={() => setExpanded((prev) => ({ ...prev, [s.key]: !prev[s.key] }))}
                      className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-900/40 transition-colors border-b border-yellow-400/20 hover:border-yellow-400/40"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-slate-200 font-semibold">{s.title}</span>
                        {!s.content?.trim() && <span className="text-xs text-slate-500">(empty)</span>}
                      </div>
                      <span className="text-slate-400">{isOpen ? '▾' : '▸'}</span>
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-4">
                        <pre className="whitespace-pre-wrap break-words text-slate-200 font-sans text-sm leading-relaxed">
                          {s.content?.trim() ? s.content : 'No additional notes generated for this section.'}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Footer actions */}
            <div className="sticky bottom-0 right-0 mt-auto p-2 bg-slate-900/60 backdrop-blur flex flex-wrap justify-end gap-2 border-t border-slate-800">
              <button
                onClick={handleOptimizeForWalkaround}
                disabled={!isPro || optimizeStatus === 'optimizing'}
                className={
                  'flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors border ' +
                  (isPro
                    ? 'bg-slate-700 hover:bg-slate-600 border-yellow-400/20 text-slate-200'
                    : 'bg-slate-800/40 border-slate-700 text-slate-500 cursor-not-allowed')
                }
                title={isPro ? 'Optimize this blueprint for walkaround / pockets-only' : 'Professional tier required'}
              >
                {isPro ? (
                  optimizeStatus === 'optimizing' ? (
                    <WandIcon className="w-4 h-4 animate-pulse" />
                  ) : optimizeStatus === 'done' ? (
                    <CheckIcon className="w-4 h-4 text-green-400" />
                  ) : (
                    <WandIcon className="w-4 h-4" />
                  )
                ) : (
                  <LockIcon className="w-4 h-4" />
                )}
                <span>
                  {isPro
                    ? optimizeStatus === 'optimizing'
                      ? 'Optimizing...'
                      : optimizeStatus === 'done'
                        ? 'Optimized'
                        : 'Optimize for Walkaround'
                    : 'Optimize for Walkaround'}
                </span>
              </button>

              <button
                onClick={handleSendToShowPlanner}
                disabled={plannerStatus === 'sent'}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200 disabled:cursor-default disabled:bg-slate-700/40 transition-colors"
                title="Create a new show and add these sections as tasks"
              >
                {plannerStatus === 'sent' ? <CheckIcon className="w-4 h-4 text-green-400" /> : <SendIcon className="w-4 h-4" />}
                <span>{plannerStatus === 'sent' ? 'Added!' : 'Add to Show Planner'}</span>
              </button>

              <ShareButton
                title={`Routine Blueprint: ${routine}`}
                text={rawOutput}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200 transition-colors"
              >
                <ShareIcon className="w-4 h-4" />
                <span>Share</span>
              </ShareButton>
</div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-center text-slate-500 p-4">
            <div className="-mt-4">
              <div className="relative mx-auto mb-4 w-fit">
                <ChecklistIcon className="w-20 h-20 mx-auto text-slate-500/80 animate-pulse" />
                <div className="absolute -inset-2 rounded-full bg-purple-500/10 blur-xl opacity-60" />
              </div>
              <p className="text-slate-300 font-semibold">Your production checklist will appear here.</p>
              <p className="text-slate-500 text-sm mt-1">
                Includes props, staging notes, risk alerts, reset flow, and performance cues.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PropChecklists;
