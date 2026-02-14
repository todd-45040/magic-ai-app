import React, { useEffect, useMemo, useState } from 'react';
import { generateResponse } from '../services/geminiService';
import { saveIdea } from '../services/ideasService';
import { MAGIC_RESEARCH_SYSTEM_INSTRUCTION } from '../constants';
import { SearchIcon, WandIcon, SaveIcon, CheckIcon, CopyIcon, BookIcon, ShareIcon } from './icons';
import ShareButton from './ShareButton';
import FormattedText from './FormattedText';
import { useAppState } from '../store';

interface MagicArchivesProps {
  onIdeaSaved: () => void;
}

type SaveStatus = 'idle' | 'saved';
type CopyStatus = 'idle' | 'copied';
type Mode = 'research' | 'compare';

interface RecentTopic {
  query: string;
  createdAt: number;
}

interface SavedLibraryEntry {
  id: string;
  title: string;
  category: string;
  summary: string;
  full_response: string;
  tags: string[];
  created_at: number;
}

type ArchiveView =
  | { kind: 'text'; text: string }
  | { kind: 'creator'; data: CreatorDeepDive }
  | { kind: 'timeline'; data: MagicTimeline }
  | { kind: 'compare'; data: CompareResult };

interface MagicTimeline {
  eraLabel: string;
  key_creators: string[];
  landmark_effects: string[];
  major_innovations: string[];
  cultural_shifts: string[];
}

interface CreatorDeepDive {
  name: string;
  bio: string;
  key_contributions: string[];
  signature_effects: string[];
  recommended_reading: string[];
  performance_philosophy: string[];
}

interface CompareResult {
  topicA: string;
  topicB: string;
  similarities: string[];
  differences: string[];
  philosophy: string[];
  practical_takeaways: string[];
}

const RECENT_TOPICS_KEY = 'magic_archives_recent_topics_v1';
const LIBRARY_KEY = 'magic_archives_library_v1';

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function getRecentTopics(): RecentTopic[] {
  const topics = safeJsonParse<RecentTopic[]>(localStorage.getItem(RECENT_TOPICS_KEY), []);
  return Array.isArray(topics) ? topics : [];
}

function saveRecentTopic(query: string): RecentTopic[] {
  const normalized = query.trim();
  const existing = getRecentTopics().filter(t => t.query !== normalized);
  const updated: RecentTopic[] = [{ query: normalized, createdAt: Date.now() }, ...existing].slice(0, 5);
  localStorage.setItem(RECENT_TOPICS_KEY, JSON.stringify(updated));
  return updated;
}

function getLibraryEntries(): SavedLibraryEntry[] {
  const entries = safeJsonParse<SavedLibraryEntry[]>(localStorage.getItem(LIBRARY_KEY), []);
  return Array.isArray(entries) ? entries : [];
}

function saveLibraryEntry(entry: SavedLibraryEntry): void {
  const existing = getLibraryEntries();
  localStorage.setItem(LIBRARY_KEY, JSON.stringify([entry, ...existing]));
}

function tryParseJson<T>(raw: string): T | null {
  // Many models sometimes wrap JSON in markdown fences; this safely extracts the first JSON object/array.
  const trimmed = raw.trim();

  // If fenced, strip fences.
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenceMatch?.[1]?.trim() || trimmed;

  // Find first "{" and last "}" to handle leading text.
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const slice = candidate.slice(start, end + 1);
    try {
      return JSON.parse(slice) as T;
    } catch {
      return null;
    }
  }

  return null;
}

function isLikelyCreatorQuery(q: string): boolean {
  const s = q.trim();
  if (!s) return false;
  if (s.length > 40) return false;
  if (/[?]/.test(s)) return false;
  if (/\b(compare|vs\.?|versus)\b/i.test(s)) return false;
  // If it's mostly words (name / short concept), treat as creator query.
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length >= 1 && words.length <= 4) return true;
  return false;
}

const LoadingIndicator: React.FC = () => (
  <div className="flex flex-col items-center justify-center text-center p-8">
    <div className="relative">
      <WandIcon className="w-16 h-16 text-purple-400 animate-pulse" />
      <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
        <div className="w-24 h-24 border-t-2 border-purple-300 rounded-full animate-spin"></div>
      </div>
    </div>
    <p className="text-slate-300 mt-4 text-lg">Searching the archives...</p>
    <p className="text-slate-400 text-sm">Consulting with the masters of old.</p>
  </div>
);

const EXAMPLE_QUERIES = [
  "Who was S.W. Erdnase?",
  "Compare the psychological principles of Derren Brown and Eugene Burger.",
  "What are the essential books for learning sleight of hand with cards?",
  "History of the Linking Rings effect.",
];

const CATEGORY_QUERIES = [
  {
    name: "Sleight of Hand",
    description: "Card, coin, and close-up techniques",
    query:
      "Provide a detailed overview of the fundamental sleights in card magic, citing key resources like 'The Royal Road to Card Magic' and 'Expert at the Card Table'.",
  },
  {
    name: "Mentalism",
    description: "Psychological forces, prediction systems",
    query:
      "Explain the core principles of modern mentalism. Discuss the contributions of figures like Theodore Annemann, Tony Corinda, and Derren Brown.",
  },
  {
    name: "Illusions",
    description: "Stage-scale theatrical effects",
    query:
      "Describe three classic grand illusions, such as 'Metamorphosis' or 'Sawing a Woman in Half'. Briefly touch on their history and the general principles they rely on, without exposing methods.",
  },
  {
    name: "Magic History",
    description: "Creators, eras, and movements",
    query:
      "Provide a brief history of magic's golden era, from the late 19th to early 20th century. Mention key figures like Robert-Houdin, Houdini, and Thurston.",
  },
  {
    name: "Performance Theory",
    description: "Misdirection, timing, audience psychology",
    query: "Summarize the key ideas from Darwin Ortiz's 'Strong Magic' and Henning Nelms' 'Magic and Showmanship'.",
  },
  {
    name: "Close-Up Magic",
    description: "Intimate, high-impact performance",
    query: "Discuss the legacy and influence of Dai Vernon on the art of close-up magic.",
  },
];

const TIMELINE_ERAS: { label: string; value: '1800-1900' | '1900-1950' | '1950-2000' | 'modern' }[] = [
  { label: '1800–1900', value: '1800-1900' },
  { label: '1900–1950', value: '1900-1950' },
  { label: '1950–2000', value: '1950-2000' },
  { label: 'Modern Era', value: 'modern' },
];

const MagicArchives: React.FC<MagicArchivesProps> = ({ onIdeaSaved }) => {
  const { currentUser } = useAppState() as any;

  const [mode, setMode] = useState<Mode>('research');
  const [query, setQuery] = useState('');
  const [compareA, setCompareA] = useState('');
  const [compareB, setCompareB] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // view is the rendered result (text/cards). Keeps rendering logic clean.
  const [view, setView] = useState<ArchiveView | null>(null);

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle');
  const [recentTopics, setRecentTopics] = useState<RecentTopic[]>([]);
  const [timelineOpen, setTimelineOpen] = useState(false);

  useEffect(() => {
    setRecentTopics(getRecentTopics());
  }, []);

  const selectedCategory = useMemo(() => {
    const match = CATEGORY_QUERIES.find(c => c.query === query);
    return match?.name || 'General';
  }, [query]);

  const resetStatuses = () => {
    setSaveStatus('idle');
    setCopyStatus('idle');
  };

  const runGenerate = async (prompt: string) => {
    // FIX: pass currentUser as the 3rd argument to generateResponse
    return generateResponse(
      prompt,
      MAGIC_RESEARCH_SYSTEM_INSTRUCTION,
      currentUser || { email: '', membership: 'free', generationCount: 0, lastResetDate: '' }
    );
  };

  const handleSearch = async (searchQuery?: string) => {
    const currentQuery = (searchQuery ?? query).trim();
    if (!currentQuery) {
      setError("Please enter a search query.");
      return;
    }

    const updatedRecents = saveRecentTopic(currentQuery);
    setRecentTopics(updatedRecents);

    setIsLoading(true);
    setError(null);
    setView(null);
    resetStatuses();
    setTimelineOpen(false);

    try {
      // Tier 2: auto-upgrade short "name-like" queries to a Creator Deep Dive card response.
      if (isLikelyCreatorQuery(currentQuery)) {
        const creatorPrompt = [
          "Return ONLY valid JSON (no markdown, no commentary).",
          "You are generating a structured Creator Deep Dive card for a magic historian archive.",
          `Subject: ${currentQuery}`,
          "",
          "JSON schema:",
          "{",
          '  "name": string,',
          '  "bio": string,',
          '  "key_contributions": string[],',
          '  "signature_effects": string[],',
          '  "recommended_reading": string[],',
          '  "performance_philosophy": string[]',
          "}",
          "",
          "Guidelines:",
          "- Keep bio concise (3–6 sentences).",
          "- Avoid exposure of methods; discuss principles and history.",
          "- If the subject is not a person, treat it as a concept and still fill fields appropriately.",
        ].join('\n');

        const response = await runGenerate(creatorPrompt);
        const parsed = tryParseJson<CreatorDeepDive>(response);
        if (parsed?.name) {
          setView({ kind: 'creator', data: parsed });
        } else {
          // fallback to text
          setView({ kind: 'text', text: response });
        }
      } else {
        const response = await runGenerate(currentQuery);
        setView({ kind: 'text', text: response });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCompare = async () => {
    const a = compareA.trim();
    const b = compareB.trim();

    if (!a || !b) {
      setError("Please enter two creators or theories to compare.");
      return;
    }

    const compositeQuery = `Compare: ${a} vs ${b}`;
    const updatedRecents = saveRecentTopic(compositeQuery);
    setRecentTopics(updatedRecents);

    setIsLoading(true);
    setError(null);
    setView(null);
    resetStatuses();
    setTimelineOpen(false);

    try {
      const comparePrompt = [
        "Return ONLY valid JSON (no markdown, no commentary).",
        "You are generating a structured comparison for a magic theory archive.",
        `Topic A: ${a}`,
        `Topic B: ${b}`,
        "",
        "JSON schema:",
        "{",
        '  "topicA": string,',
        '  "topicB": string,',
        '  "similarities": string[],',
        '  "differences": string[],',
        '  "philosophy": string[],',
        '  "practical_takeaways": string[]',
        "}",
        "",
        "Guidelines:",
        "- No method exposure. Focus on history, philosophy, and performance principles.",
        "- Keep bullets crisp (max ~8 per section).",
      ].join('\n');

      const response = await runGenerate(comparePrompt);
      const parsed = tryParseJson<CompareResult>(response);
      if (parsed?.topicA && parsed?.topicB) {
        setView({ kind: 'compare', data: parsed });
      } else {
        setView({ kind: 'text', text: response });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleTimeline = async (era: typeof TIMELINE_ERAS[number]) => {
    const timelineQuery = `Magic Timeline: ${era.label}`;
    const updatedRecents = saveRecentTopic(timelineQuery);
    setRecentTopics(updatedRecents);

    setIsLoading(true);
    setError(null);
    setView(null);
    resetStatuses();

    try {
      const timelinePrompt = [
        "Return ONLY valid JSON (no markdown, no commentary).",
        "You are a magic historian creating a timeline summary for an archive.",
        `Era: ${era.label}`,
        "",
        "JSON schema:",
        "{",
        `  "eraLabel": "${era.label}",`,
        '  "key_creators": string[],',
        '  "landmark_effects": string[],',
        '  "major_innovations": string[],',
        '  "cultural_shifts": string[]',
        "}",
        "",
        "Guidelines:",
        "- Avoid method exposure; use high-level descriptions.",
        "- Keep lists focused and useful (5–10 items each).",
      ].join('\n');

      const response = await runGenerate(timelinePrompt);
      const parsed = tryParseJson<MagicTimeline>(response);
      if (parsed?.eraLabel) {
        setView({ kind: 'timeline', data: parsed });
      } else {
        setView({ kind: 'text', text: response });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred.");
    } finally {
      setIsLoading(false);
      setTimelineOpen(false);
    }
  };

  const handleExampleClick = (exampleQuery: string) => {
    setMode('research');
    setQuery(exampleQuery);
    handleSearch(exampleQuery);
  };

  const handleSaveToLibrary = () => {
    if (!view) return;

    // serialize whatever view is into a "full_response" string for library
    const titleBase =
      mode === 'compare' && compareA.trim() && compareB.trim()
        ? `${compareA.trim()} vs ${compareB.trim()}`
        : query.trim() || 'Magic Archives Research';

    const category =
      view.kind === 'timeline' ? 'Magic Timeline' :
      view.kind === 'creator' ? 'Creator Deep Dive' :
      view.kind === 'compare' ? 'Compare Mode' :
      selectedCategory;

    const fullText =
      view.kind === 'text'
        ? view.text
        : JSON.stringify(view.data, null, 2);

    const summary = fullText.replace(/\s+/g, ' ').trim().slice(0, 180);

    const entry: SavedLibraryEntry = {
      id: (crypto as any)?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title: titleBase,
      category,
      summary,
      full_response: fullText,
      tags: [],
      created_at: Date.now(),
    };

    saveLibraryEntry(entry);

    // Keep existing "Saved Ideas" integration so nothing else breaks.
    const ideaTitle =
      view.kind === 'timeline' ? `Magic Timeline: ${view.data.eraLabel}` :
      view.kind === 'creator' ? `Creator Deep Dive: ${view.data.name}` :
      view.kind === 'compare' ? `Compare: ${view.data.topicA} vs ${view.data.topicB}` :
      `Magic Archives Research: ${titleBase}`;

    const fullContent = `## ${ideaTitle}\n\n${fullText}`;
    saveIdea('text', fullContent);
    onIdeaSaved();

    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2000);
  };

  const handleCopy = () => {
    if (!view) return;

    const title =
      view.kind === 'timeline' ? `Magic Timeline: ${view.data.eraLabel}` :
      view.kind === 'creator' ? `Creator Deep Dive: ${view.data.name}` :
      view.kind === 'compare' ? `Compare: ${view.data.topicA} vs ${view.data.topicB}` :
      `Magic Archives Research: ${query}`;

    const content =
      view.kind === 'text' ? view.text : JSON.stringify(view.data, null, 2);

    navigator.clipboard.writeText(`${title}\n\n${content}`);
    setCopyStatus('copied');
    setTimeout(() => setCopyStatus('idle'), 2000);
  };

  const renderCards = () => {
    if (!view) return null;

    if (view.kind === 'text') {
      return (
        <div className="text-slate-200">
          <FormattedText text={view.text} />
        </div>
      );
    }

    if (view.kind === 'creator') {
      const d = view.data;
      return (
        <div className="space-y-4">
          <div className="p-4 rounded-lg border border-slate-700 bg-slate-900/40">
            <div className="text-slate-100 text-xl font-semibold">{d.name}</div>
            <div className="mt-2 text-slate-200 text-sm leading-relaxed whitespace-pre-wrap">{d.bio}</div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg border border-slate-700 bg-slate-900/40">
              <div className="text-slate-200 font-semibold">Key Contributions</div>
              <ul className="mt-2 list-disc list-inside text-sm text-slate-300 space-y-1">
                {d.key_contributions?.map((x, i) => <li key={i}>{x}</li>)}
              </ul>
            </div>

            <div className="p-4 rounded-lg border border-slate-700 bg-slate-900/40">
              <div className="text-slate-200 font-semibold">Signature Effects</div>
              <ul className="mt-2 list-disc list-inside text-sm text-slate-300 space-y-1">
                {d.signature_effects?.map((x, i) => <li key={i}>{x}</li>)}
              </ul>
            </div>

            <div className="p-4 rounded-lg border border-slate-700 bg-slate-900/40">
              <div className="text-slate-200 font-semibold">Recommended Reading</div>
              <ul className="mt-2 list-disc list-inside text-sm text-slate-300 space-y-1">
                {d.recommended_reading?.map((x, i) => <li key={i}>{x}</li>)}
              </ul>
            </div>

            <div className="p-4 rounded-lg border border-slate-700 bg-slate-900/40">
              <div className="text-slate-200 font-semibold">Performance Philosophy</div>
              <ul className="mt-2 list-disc list-inside text-sm text-slate-300 space-y-1">
                {d.performance_philosophy?.map((x, i) => <li key={i}>{x}</li>)}
              </ul>
            </div>
          </div>
        </div>
      );
    }

    if (view.kind === 'timeline') {
      const t = view.data;
      const Section = ({ title, items }: { title: string; items: string[] }) => (
        <div className="p-4 rounded-lg border border-slate-700 bg-slate-900/40">
          <div className="text-slate-200 font-semibold">{title}</div>
          <ul className="mt-2 list-disc list-inside text-sm text-slate-300 space-y-1">
            {items?.map((x, i) => <li key={i}>{x}</li>)}
          </ul>
        </div>
      );

      return (
        <div className="space-y-4">
          <div className="p-4 rounded-lg border border-slate-700 bg-slate-900/40">
            <div className="text-slate-100 text-xl font-semibold">🗓 {t.eraLabel}</div>
            <div className="mt-1 text-slate-400 text-sm">A historian’s snapshot of the era.</div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Section title="Key Creators" items={t.key_creators} />
            <Section title="Landmark Effects" items={t.landmark_effects} />
            <Section title="Major Innovations" items={t.major_innovations} />
            <Section title="Cultural Shifts" items={t.cultural_shifts} />
          </div>
        </div>
      );
    }

    if (view.kind === 'compare') {
      const c = view.data;
      const Section = ({ title, items }: { title: string; items: string[] }) => (
        <div className="p-4 rounded-lg border border-slate-700 bg-slate-900/40">
          <div className="text-slate-200 font-semibold">{title}</div>
          <ul className="mt-2 list-disc list-inside text-sm text-slate-300 space-y-1">
            {items?.map((x, i) => <li key={i}>{x}</li>)}
          </ul>
        </div>
      );

      return (
        <div className="space-y-4">
          <div className="p-4 rounded-lg border border-slate-700 bg-slate-900/40">
            <div className="text-slate-100 text-xl font-semibold">⚖ {c.topicA} vs {c.topicB}</div>
            <div className="mt-1 text-slate-400 text-sm">A structured comparison to support better creative decisions.</div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Section title="Similarities" items={c.similarities} />
            <Section title="Differences" items={c.differences} />
            <Section title="Philosophy" items={c.philosophy} />
            <Section title="Practical Takeaways" items={c.practical_takeaways} />
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* Search Bar */}
      <div className="p-4 md:p-6 border-b border-slate-800">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setMode('research'); setError(null); }}
              className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                mode === 'research' ? 'bg-purple-900/40 border-purple-700 text-slate-100' : 'bg-slate-900/20 border-slate-700 text-slate-300 hover:bg-slate-800/40'
              }`}
            >
              Research
            </button>
            <button
              onClick={() => { setMode('compare'); setError(null); }}
              className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                mode === 'compare' ? 'bg-purple-900/40 border-purple-700 text-slate-100' : 'bg-slate-900/20 border-slate-700 text-slate-300 hover:bg-slate-800/40'
              }`}
              title="⚖ Compare Two Creators / Theories"
            >
              ⚖ Compare
            </button>
          </div>

          {/* Timeline quick action */}
          <div className="relative">
            <button
              onClick={() => setTimelineOpen(v => !v)}
              className="px-3 py-1.5 text-xs rounded-md border border-slate-700 bg-slate-900/20 text-slate-300 hover:bg-slate-800/40 transition-colors"
              title="🗓 Magic Timeline"
            >
              🗓 Timeline
            </button>

            {timelineOpen && (
              <div className="absolute right-0 mt-2 w-44 rounded-lg border border-slate-700 bg-slate-900 shadow-xl p-2 z-20">
                <div className="text-[11px] text-slate-400 px-2 pb-1">Choose an era</div>
                {TIMELINE_ERAS.map(era => (
                  <button
                    key={era.value}
                    onClick={() => handleTimeline(era)}
                    className="w-full text-left px-2 py-1.5 text-xs rounded-md text-slate-200 hover:bg-purple-900/40 transition-colors"
                    disabled={isLoading}
                  >
                    {era.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {mode === 'research' ? (
          <div className="flex items-center bg-slate-800 rounded-lg">
            <input
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setError(null); }}
              onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleSearch()}
              placeholder="Ask about effects, creators, or magic history..."
              className="flex-1 w-full bg-transparent px-4 py-3 text-white placeholder-slate-400 focus:outline-none"
              disabled={isLoading}
            />
            <button
              onClick={() => handleSearch()}
              disabled={isLoading || !query.trim()}
              className="p-3 text-purple-400 hover:text-purple-300 disabled:text-slate-600 transition-colors"
            >
              <SearchIcon className="w-6 h-6" />
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <input
              type="text"
              value={compareA}
              onChange={(e) => { setCompareA(e.target.value); setError(null); }}
              onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleCompare()}
              placeholder="Creator / Theory A (e.g., Vernon)"
              className="w-full bg-slate-800 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:outline-none"
              disabled={isLoading}
            />
            <input
              type="text"
              value={compareB}
              onChange={(e) => { setCompareB(e.target.value); setError(null); }}
              onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleCompare()}
              placeholder="Creator / Theory B (e.g., Tamariz)"
              className="w-full bg-slate-800 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:outline-none"
              disabled={isLoading}
            />

            <div className="md:col-span-2 flex justify-end">
              <button
                onClick={handleCompare}
                disabled={isLoading || !compareA.trim() || !compareB.trim()}
                className="px-4 py-2 rounded-md bg-purple-700/80 hover:bg-purple-600 text-slate-100 text-sm font-semibold disabled:bg-slate-700/50 disabled:text-slate-400 transition-colors"
              >
                ⚖ Compare
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-red-400 mt-2 text-sm text-center">{error}</p>}
      </div>

      {/* Results Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <LoadingIndicator />
          </div>
        ) : view ? (
          <div className="relative group">
            {renderCards()}

            <div className="sticky bottom-0 right-0 mt-4 py-2 flex justify-end gap-2 bg-slate-900/50">
              <ShareButton
                title={
                  view.kind === 'timeline' ? `Magic Timeline: ${view.data.eraLabel}` :
                  view.kind === 'creator' ? `Creator Deep Dive: ${view.data.name}` :
                  view.kind === 'compare' ? `Compare: ${view.data.topicA} vs ${view.data.topicB}` :
                  `Magic Archives Research: ${query}`
                }
                text={view.kind === 'text' ? view.text : JSON.stringify(view.data, null, 2)}
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
                onClick={handleSaveToLibrary}
                disabled={saveStatus === 'saved'}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-amber-500/90 hover:bg-amber-400 rounded-md text-slate-950 disabled:cursor-default transition-colors"
              >
                {saveStatus === 'saved' ? (
                  <>
                    <CheckIcon className="w-4 h-4" />
                    <span>Saved!</span>
                  </>
                ) : (
                  <>
                    <SaveIcon className="w-4 h-4" />
                    <span>Save to Library</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center text-slate-500">
            <BookIcon className="w-24 h-24 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-300">Your Personal Magic Library</h2>
            <p className="mt-2 text-sm tracking-wide text-slate-400">Research. Organize. Preserve. Expand.</p>
            <p className="max-w-md mt-2 mb-6">
              Uncover the secrets of the past to inspire your magic of the future. Ask a question above, or explore a
              topic to begin.
            </p>

            <div className="w-full max-w-2xl">
              {recentTopics.length > 0 && (
                <div className="mb-8">
                  <h3 className="text-sm font-semibold text-slate-400 mb-2 uppercase tracking-wider">Recent Topics</h3>
                  <div className="space-y-2">
                    {recentTopics.map((topic) => (
                      <button
                        key={topic.createdAt}
                        onClick={() => {
                          setMode('research');
                          setQuery(topic.query);
                          handleSearch(topic.query);
                        }}
                        className="w-full p-2 bg-slate-800/50 hover:bg-purple-900/50 border border-slate-700 rounded-lg text-xs text-slate-300 text-left transition-colors"
                      >
                        🕒 {topic.query}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <h3 className="text-sm font-semibold text-slate-400 mb-2 uppercase tracking-wider">Explore by Category</h3>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
                {/* Tier 2: Timeline tile inside category grid */}
                <button
                  onClick={() => setTimelineOpen(true)}
                  className="p-3 bg-slate-800/50 hover:bg-purple-900/50 border border-slate-700 rounded-lg text-left transition-colors"
                >
                  <div className="text-sm text-slate-200 font-semibold">🗓 Magic Timeline</div>
                  <div className="text-xs text-slate-400 mt-1">Explore eras and key innovations</div>
                </button>

                {CATEGORY_QUERIES.map((cat) => (
                  <button
                    key={cat.name}
                    onClick={() => handleExampleClick(cat.query)}
                    className="p-3 bg-slate-800/50 hover:bg-purple-900/50 border border-slate-700 rounded-lg text-left transition-colors"
                  >
                    <div className="text-sm text-slate-200 font-semibold">{cat.name}</div>
                    <div className="text-xs text-slate-400 mt-1">{cat.description}</div>
                  </button>
                ))}
              </div>

              {/* Inline timeline selector when opened from the empty-state grid */}
              {timelineOpen && (
                <div className="mb-6 p-3 rounded-lg border border-slate-700 bg-slate-900/40">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-slate-200">🗓 Choose a timeline era</div>
                    <button
                      onClick={() => setTimelineOpen(false)}
                      className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
                    >
                      Close
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
                    {TIMELINE_ERAS.map((era) => (
                      <button
                        key={era.value}
                        onClick={() => handleTimeline(era)}
                        disabled={isLoading}
                        className="px-3 py-2 text-xs rounded-md bg-slate-800/60 hover:bg-purple-900/40 border border-slate-700 text-slate-200 transition-colors"
                      >
                        {era.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <h3 className="text-sm font-semibold text-slate-400 mb-2 uppercase tracking-wider">Or Try a Specific Question</h3>
              <div className="space-y-2">
                {EXAMPLE_QUERIES.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => handleExampleClick(ex)}
                    className="w-full p-2 bg-slate-800/50 hover:bg-purple-900/50 border border-slate-700 rounded-lg text-xs text-slate-300 text-left transition-colors"
                  >
                    "{ex}"
                  </button>
                ))}
              </div>

              {/* Tier 2: Compare prompt hint */}
              <div className="mt-6 text-xs text-slate-500">
                Tip: Use <span className="text-slate-300">⚖ Compare</span> to evaluate two creators, books, or theories side-by-side.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MagicArchives;
