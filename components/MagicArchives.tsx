
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
    query: "Provide a detailed overview of the fundamental sleights in card magic, citing key resources like 'The Royal Road to Card Magic' and 'Expert at the Card Table'."
  },
  {
    name: "Mentalism",
    description: "Psychological forces, prediction systems",
    query: "Explain the core principles of modern mentalism. Discuss the contributions of figures like Theodore Annemann, Tony Corinda, and Derren Brown."
  },
  {
    name: "Illusions",
    description: "Stage-scale theatrical effects",
    query: "Describe three classic grand illusions, such as 'Metamorphosis' or 'Sawing a Woman in Half'. Briefly touch on their history and the general principles they rely on, without exposing methods."
  },
  {
    name: "Magic History",
    description: "Creators, eras, and movements",
    query: "Provide a brief history of magic's golden era, from the late 19th to early 20th century. Mention key figures like Robert-Houdin, Houdini, and Thurston."
  },
  {
    name: "Performance Theory",
    description: "Misdirection, timing, audience psychology",
    query: "Summarize the key ideas from Darwin Ortiz's 'Strong Magic' and Henning Nelms' 'Magic and Showmanship'."
  },
  {
    name: "Close-Up Magic",
    description: "Intimate, high-impact performance",
    query: "Discuss the legacy and influence of Dai Vernon on the art of close-up magic."
  }
];


const MagicArchives: React.FC<MagicArchivesProps> = ({ onIdeaSaved }) => {
    const { currentUser } = useAppState() as any;
    const [query, setQuery] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<string | null>(null);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
    const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle');
    const [recentTopics, setRecentTopics] = useState<RecentTopic[]>([]);

    useEffect(() => {
        // localStorage-only; safe to read on mount
        setRecentTopics(getRecentTopics());
    }, []);

    const selectedCategory = useMemo(() => {
        // Best-effort: if the user clicked a category prompt, we can infer category name.
        const match = CATEGORY_QUERIES.find(c => c.query === query);
        return match?.name || 'General';
    }, [query]);

    const handleSearch = async (searchQuery?: string) => {
        const currentQuery = searchQuery || query;
        if (!currentQuery.trim()) {
            setError("Please enter a search query.");
            return;
        }

        // Update recents immediately for a responsive feel.
        const updatedRecents = saveRecentTopic(currentQuery);
        setRecentTopics(updatedRecents);

        setIsLoading(true);
        setError(null);
        setResult(null);
        setSaveStatus('idle');
        setCopyStatus('idle');

        try {
            // FIX: pass currentUser as the 3rd argument to generateResponse
            const response = await generateResponse(currentQuery, MAGIC_RESEARCH_SYSTEM_INSTRUCTION, currentUser || { email: '', membership: 'free', generationCount: 0, lastResetDate: '' });
            setResult(response);
        } catch (err) {
            setError(err instanceof Error ? err.message : "An unknown error occurred.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleExampleClick = (exampleQuery: string) => {
        setQuery(exampleQuery);
        handleSearch(exampleQuery);
    };

    const handleSaveToLibrary = () => {
        if (!result) return;

        const title = query.trim() || 'Magic Archives Research';
        const summary = result.replace(/\s+/g, ' ').trim().slice(0, 180);

        const entry: SavedLibraryEntry = {
            id: (crypto as any)?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            title,
            category: selectedCategory,
            summary,
            full_response: result,
            tags: [],
            created_at: Date.now(),
        };

        saveLibraryEntry(entry);

        // Keep existing "Saved Ideas" integration so nothing else breaks.
        // This also helps users find saved research in your existing ideas list.
        const fullContent = `## Magic Archives Research: ${title}\n\n${result}`;
        saveIdea('text', fullContent);
        onIdeaSaved();

        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
    };

    const handleCopy = () => {
        if (result) {
            const fullContent = `Magic Archives Research: ${query}\n\n${result}`;
            navigator.clipboard.writeText(fullContent);
            setCopyStatus('copied');
            setTimeout(() => setCopyStatus('idle'), 2000);
        }
    };

    return (
        <div className="flex-1 flex flex-col">
            {/* Search Bar */}
            <div className="p-4 md:p-6 border-b border-slate-800">
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
                    <button onClick={() => handleSearch()} disabled={isLoading || !query.trim()} className="p-3 text-purple-400 hover:text-purple-300 disabled:text-slate-600 transition-colors">
                        <SearchIcon className="w-6 h-6" />
                    </button>
                </div>
                 {error && <p className="text-red-400 mt-2 text-sm text-center">{error}</p>}
            </div>

            {/* Results Area */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6">
                {isLoading ? (
                    <div className="flex items-center justify-center h-full">
                       <LoadingIndicator />
                    </div>
                ) : result ? (
                    <div className="relative group">
                        <div className="text-slate-200">
                            <FormattedText text={result} />
                        </div>
                        <div className="sticky bottom-0 right-0 mt-4 py-2 flex justify-end gap-2 bg-slate-900/50">
                             <ShareButton
                                title={`Magic Archives Research: ${query}`}
                                text={result}
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
                                {copyStatus === 'copied' ? <><CheckIcon className="w-4 h-4 text-green-400" /><span>Copied!</span></> : <><CopyIcon className="w-4 h-4" /><span>Copy</span></>}
                            </button>
                            <button
                                onClick={handleSaveToLibrary}
                                disabled={saveStatus === 'saved'}
                                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-amber-500/90 hover:bg-amber-400 rounded-md text-slate-950 disabled:cursor-default transition-colors"
                            >
                                {saveStatus === 'saved' ? <><CheckIcon className="w-4 h-4" /><span>Saved!</span></> : <><SaveIcon className="w-4 h-4" /><span>Save to Library</span></>}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center text-slate-500">
                         <BookIcon className="w-24 h-24 mx-auto mb-4" />
                        <h2 className="text-xl font-bold text-slate-300">Your Personal Magic Library</h2>
                        <p className="mt-2 text-sm tracking-wide text-slate-400">
                            Research. Organize. Preserve. Expand.
                        </p>
                        <p className="max-w-md mt-2 mb-6">
                           Uncover the secrets of the past to inspire your magic of the future. Ask a question above, or explore a topic to begin.
                        </p>
                        <div className="w-full max-w-2xl">
                            {recentTopics.length > 0 && (
                                <div className="mb-8">
                                    <h3 className="text-sm font-semibold text-slate-400 mb-2 uppercase tracking-wider">Recent Topics</h3>
                                    <div className="space-y-2">
                                        {recentTopics.map((topic) => (
                                            <button
                                                key={topic.createdAt}
                                                onClick={() => { setQuery(topic.query); handleSearch(topic.query); }}
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
                                {CATEGORY_QUERIES.map(cat => (
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

                            <h3 className="text-sm font-semibold text-slate-400 mb-2 uppercase tracking-wider">Or Try a Specific Question</h3>
                            <div className="space-y-2">
                                {EXAMPLE_QUERIES.map(ex => (
                                    <button
                                        key={ex}
                                        onClick={() => handleExampleClick(ex)}
                                        className="w-full p-2 bg-slate-800/50 hover:bg-purple-900/50 border border-slate-700 rounded-lg text-xs text-slate-300 text-left transition-colors"
                                    >
                                        "{ex}"
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MagicArchives;
