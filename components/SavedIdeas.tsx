
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { getSavedIdeas, deleteIdea, updateIdea } from '../services/ideasService';
import type { SavedIdea, Transcription, IdeaType, AiSparkAction } from '../types';
import { BookmarkIcon, TrashIcon, ShareIcon, MicrophoneIcon, PrintIcon, FileTextIcon, ImageIcon, PencilIcon, WandIcon, CrossIcon } from './icons';
import ShareButton from './ShareButton';

interface SavedIdeasProps {
    initialIdeaId?: string;
    onAiSpark: (action: AiSparkAction) => void;
}

const IdeaShareWrapper: React.FC<{ idea: SavedIdea }> = ({ idea }) => {
    const [shareFile, setShareFile] = useState<File | null>(null);

    useEffect(() => {
        if (idea.type === 'image') {
            const convertDataUrlToFile = async () => {
                try {
                    const res = await fetch(idea.content);
                    const blob = await res.blob();
                    const file = new File([blob], `magic-idea.jpg`, { type: 'image/jpeg' });
                    setShareFile(file);
                } catch (e) {
                    console.error("Error creating file for sharing", e);
                }
            };
            convertDataUrlToFile();
        }
    }, [idea]);
    
    return (
        <ShareButton
            title={idea.type === 'image' ? 'Shared Magic Idea (Image)' : 'Shared Magic Idea'}
            text={idea.type === 'text' ? idea.content : "Check out this visual idea I saved!"}
            file={shareFile ?? undefined}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-slate-800/70 hover:bg-purple-900/50 rounded-full text-slate-300 hover:text-purple-300 transition-colors backdrop-blur-sm"
            aria-label="Share idea"
        >
            <ShareIcon className="w-3 h-3" />
            <span>Share</span>
        </ShareButton>
    );
};

function splitLeadingHeading(content: string): { heading?: string; rest: string } {
    const text = (content ?? '').toString();
    const lines = text.split(/\r?\n/);
    if (lines.length === 0) return { rest: text };

    const firstNonEmptyIdx = lines.findIndex((l) => l.trim().length > 0);
    if (firstNonEmptyIdx === -1) return { rest: '' };

    const first = lines[firstNonEmptyIdx].trim();
    const m = first.match(/^#{1,3}\s+(.*)$/);
    if (!m) return { rest: text };

    const heading = (m[1] || '').trim();
    const restLines = lines.slice(0, firstNonEmptyIdx).concat(lines.slice(firstNonEmptyIdx + 1));
    const rest = restLines.join('\n').trimStart();
    return { heading, rest };
}

function formatSavedOn(idea: SavedIdea): string {
    const anyIdea = idea as any;
    const raw = anyIdea.created_at ?? anyIdea.createdAt ?? idea.timestamp;
    if (!raw) return '—';
    const d = new Date(raw);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString();
}



function isErrorIdea(content: string): boolean {
    const t = (content ?? '').toString().toLowerCase();
    return t.includes('request failed') || t.includes('error:') || t.includes('function_invocation_failed');
}

function extractFirstDataImage(markdown: string): { imgSrc: string | null; cleaned: string } {
    const text = (markdown ?? '').toString();
    // Matches: ![Alt](data:image/<type>;base64,....)
    const re = /!\[[^\]]*\]\((data:image\/[a-zA-Z0-9.+-]+;base64,[^)]+)\)/m;
    const m = text.match(re);
    const imgSrc = m?.[1] ?? null;
    const cleaned = text.replace(re, '').trim();
    return { imgSrc, cleaned };
}


const SavedIdeas: React.FC<SavedIdeasProps> = ({ initialIdeaId, onAiSpark }) => {
    const [ideas, setIdeas] = useState<SavedIdea[]>([]);
    const [typeFilter, setTypeFilter] = useState<'all' | IdeaType>('all');
    const [tagFilter, setTagFilter] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<'recent' | 'title' | 'mostUsed' | 'lastOpened' | 'aiScore'>('recent');
    const [sectionOpen, setSectionOpen] = useState<Record<string, boolean>>({
        saved_notes: true,
        blueprints: true,
        video_analyses: true,
        rehearsal_sessions: true,
    });
    const [editingIdeaId, setEditingIdeaId] = useState<string | null>(null);
    const [editText, setEditText] = useState('');
    const [isSavingTags, setIsSavingTags] = useState(false);
    const [tagSaveError, setTagSaveError] = useState<string | null>(null);
    const [lightboxImg, setLightboxImg] = useState<string | null>(null);
    const ideaRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());


    useEffect(() => {
        // FIX: getSavedIdeas() is async, resolve with .then()
        getSavedIdeas().then(setIdeas);
    }, []);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") setLightboxImg(null);
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);
    
    useEffect(() => {
        if (initialIdeaId) {
            const itemRef = ideaRefs.current.get(initialIdeaId);
            if (itemRef) {
                itemRef.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Add a temporary highlight effect
                itemRef.classList.add('ring-2', 'ring-purple-500', 'transition-all', 'duration-1000');
                setTimeout(() => {
                    itemRef.classList.remove('ring-2', 'ring-purple-500');
                }, 2000);
            }
        }
    }, [initialIdeaId]);


    // FIX: handler should be async to await deleteIdea
    const handleDelete = async (id: string) => {
        try {
            await deleteIdea(id);
            setIdeas((prev) => prev.filter((i) => i.id !== id));
        } catch (e) {
            // fail silently; console will show if needed
            console.error('Failed to delete idea', e);
        }
    };

    const handlePrint = (idea: SavedIdea) => {
        const printWindow = window.open('', '_blank');
        if (printWindow) {
            let contentToPrint = '';
            let title = idea.title || `Saved ${idea.type} Idea`;

            if (idea.type === 'rehearsal') {
                try {
                    const parsed = JSON.parse(idea.content);
                    const transcript = parsed.transcript || (Array.isArray(parsed) ? parsed : []);
                    const notes = parsed.notes || null;
                    contentToPrint = formatRehearsalForSharing(idea, transcript, notes).replace(/\n/g, '<br/>');
                    title = idea.title || 'Untitled Rehearsal';
                } catch {
                    contentToPrint = idea.content.replace(/\n/g, '<br/>');
                }
            } else if (idea.type === 'image') {
                 contentToPrint = `<img src="${idea.content}" style="max-width: 100%;" />`;
            }
            else {
                contentToPrint = idea.content.replace(/\n/g, '<br/>');
            }
            
            printWindow.document.write(`
                <html>
                    <head>
                        <title>Print: ${title}</title>
                        <style>
                            body { font-family: sans-serif; background: #1E293B; color: #E2E8F0; padding: 2rem; }
                            h1 { color: #C4B5FD; }
                            pre { white-space: pre-wrap; }
                        </style>
                    </head>
                    <body>
                        <h1>${title}</h1>
                        <p>Saved on: ${new Date(idea.timestamp).toLocaleString()}</p>
                        <hr>
                        <div>${contentToPrint}</div>
                    </body>
                </html>
            `);
            printWindow.document.close();
            printWindow.focus();
            setTimeout(() => {
                printWindow.print();
                printWindow.close();
            }, 250);
        }
    };

    const handleStartEditTags = (idea: SavedIdea) => {
        setEditingIdeaId(idea.id);
        setEditText((idea.tags || []).join(', '));
    };

    const handleCancelEdit = () => {
        setEditingIdeaId(null);
        setEditText('');
    };

    // FIX: handler should be async and should refresh ideas after update (updateIdea may not return the full list)
    const handleSaveTags = async (ideaId: string) => {
        setIsSavingTags(true);
        setTagSaveError(null);

        try {
            if (!ideaId) throw new Error('Missing idea id.');

            const newTags = Array.from(
                new Set(
                    editText
                        .split(',')
                        .map((t) => t.trim().toLowerCase())
                        .filter(Boolean)
                )
            );

            const updated = await updateIdea(ideaId, { tags: newTags });

            // Update only the affected card (fast + reliable)
            setIdeas((prev) =>
                prev.map((i) => (i.id === ideaId ? { ...i, tags: (updated as any).tags ?? newTags } : i))
            );

            handleCancelEdit();
        } catch (e: any) {
            setTagSaveError(e?.message ?? 'Failed to save tags.');
        } finally {
            setIsSavingTags(false);
        }
    };
    
    const allTags = useMemo(() => {
        const tagsSet = new Set<string>();
        ideas.forEach(idea => {
            (idea.tags || []).forEach(tag => tagsSet.add(tag));
        });
        return Array.from(tagsSet).sort();
    }, [ideas]);

    const filteredIdeas = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();

        const base = ideas.filter((idea) => {
            const typeMatch = typeFilter === 'all' || idea.type === typeFilter;
            const tagMatch = !tagFilter || (idea.tags || []).includes(tagFilter);
            const searchMatch =
                !q ||
                (idea.title || '').toLowerCase().includes(q) ||
                (idea.content || '').toLowerCase().includes(q) ||
                (idea.tags || []).some((t) => t.toLowerCase().includes(q));
            return typeMatch && tagMatch && searchMatch;
        });

        const sorted = [...base].sort((a, b) => {
            if (sortBy === 'title') {
                const at = (a.title || '').toLowerCase();
                const bt = (b.title || '').toLowerCase();
                return at.localeCompare(bt);
            }
            // Placeholder sorting modes (future data): mostUsed, lastOpened, aiScore
            // For now, fall back to "recent".
            return (b.timestamp || 0) - (a.timestamp || 0);
        });

        return sorted;
    }, [ideas, typeFilter, tagFilter, searchQuery, sortBy]);


    const sections = useMemo(() => {
        const normalize = (s: string) => (s || '').toLowerCase();

        const classify = (idea: SavedIdea): 'saved_notes' | 'blueprints' | 'video_analyses' | 'rehearsal_sessions' => {
            if (idea.type === 'rehearsal') return 'rehearsal_sessions';

            const titleGuess =
                idea.title ||
                splitLeadingHeading(idea.content).heading ||
                '';
            const t = normalize(titleGuess);
            const tags = (idea.tags || []).map(normalize);

            const hasBlueprint = t.includes('blueprint') || tags.some((x) => x.includes('blueprint'));
            if (hasBlueprint) return 'blueprints';

            const hasVideoAnalysis =
                (t.includes('video') && t.includes('analysis')) ||
                tags.some((x) => x.includes('analysis')) ||
                tags.some((x) => x.includes('video'));
            if (hasVideoAnalysis) return 'video_analyses';

            return 'saved_notes';
        };

        const buckets: Record<string, SavedIdea[]> = {
            saved_notes: [],
            blueprints: [],
            video_analyses: [],
            rehearsal_sessions: [],
        };

        filteredIdeas.forEach((idea) => {
            buckets[classify(idea)].push(idea);
        });

        return buckets as {
            saved_notes: SavedIdea[];
            blueprints: SavedIdea[];
            video_analyses: SavedIdea[];
            rehearsal_sessions: SavedIdea[];
        };
    }, [filteredIdeas]);

    const formatRehearsalForSharing = (idea: SavedIdea, transcript: Transcription[], notes: string | null): string => {
        let shareText = `Rehearsal: ${idea.title || 'Untitled Session'}\n\n`;
        if (notes) {
            shareText += `Notes:\n${notes}\n\n`;
        }
        shareText += '--- Transcript ---\n\n';

        transcript.forEach(t => {
            const speaker = t.source === 'user' ? 'You' : 'AI Coach';
            shareText += `${speaker}: ${t.text}\n\n`;
        });
        return shareText.trim();
    };
    
    const TagEditor: React.FC<{ idea: SavedIdea }> = ({ idea }) => (
        <div className="mt-2 space-y-2">
            <input
                type="text"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                placeholder="card magic, opener, comedy..."
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-600 rounded-md text-sm text-white focus:outline-none focus:border-purple-500"
                autoFocus
            />
            <div className="flex items-center gap-2">
                <button
                    onClick={() => handleSaveTags(idea.id)}
                    className="flex-1 py-1 px-3 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-semibold text-xs transition-colors"
                    disabled={isSavingTags}
                    aria-disabled={isSavingTags}
                >
                    Save Tags
                </button>
                <button
                    onClick={handleCancelEdit}
                    className="flex-1 py-1 px-3 bg-slate-600/50 hover:bg-slate-700 rounded-md text-slate-300 font-semibold text-xs transition-colors"
                >
                    Cancel
                </button>
            </div>
            {tagSaveError ? (
                <div className="text-xs text-rose-300">{tagSaveError}</div>
            ) : null}
        </div>
    );

    const TagDisplay: React.FC<{ idea: SavedIdea }> = ({ idea }) => (
        <div className="mt-3 flex items-center gap-2 flex-wrap">
            {(idea.tags || []).map(tag => (
                <button
                    key={tag}
                    onClick={() => setTagFilter(tag)}
                    className="px-2 py-0.5 text-xs font-semibold rounded-full bg-purple-500/20 text-purple-300 hover:bg-purple-500/40"
                >
                    {tag}
                </button>
            ))}
            <button
                onClick={() => handleStartEditTags(idea)}
                className="p-1 text-slate-500 hover:text-purple-300 rounded-full transition-colors"
                title="Edit tags"
            >
                <PencilIcon className="w-4 h-4" />
            </button>
        </div>
    );

    const RehearsalIdeaCard: React.FC<{ idea: SavedIdea }> = ({ idea }) => {
        const { transcript, notes } = useMemo(() => {
            try {
                const parsedContent = JSON.parse(idea.content);
                if (Array.isArray(parsedContent)) {
                    return { transcript: parsedContent as Transcription[], notes: null };
                } else if (parsedContent && Array.isArray(parsedContent.transcript)) {
                    return { transcript: parsedContent.transcript as Transcription[], notes: parsedContent.notes || null };
                }
            } catch (e) {
                return { transcript: [{ source: 'user' as const, text: idea.content, isFinal: true }], notes: 'Note: This is a legacy rehearsal save.' };
            }
            return { transcript: [], notes: null };
        }, [idea.content]);

        const formattedShareText = useMemo(() => formatRehearsalForSharing(idea, transcript, notes), [idea, transcript, notes]);

        const handleRefineRehearsal = () => {
            let contentForAI = `Title: ${idea.title || 'Untitled Rehearsal'}\n\n`;
            if (notes) {
                contentForAI += `My Notes:\n${notes}\n\n`;
            }
            contentForAI += "--- Transcript ---\n\n";
            transcript.forEach(t => {
                const speaker = t.source === 'user' ? 'Magician' : 'AI Coach';
                contentForAI += `${speaker}: ${t.text}\n\n`;
            });
            onAiSpark({ type: 'refine-idea', payload: { content: contentForAI.trim() } });
        };

        return (
            <div
                ref={el => { ideaRefs.current.set(idea.id, el); }}
                className="group relative bg-gradient-to-br from-slate-800 to-slate-900/50 border-2 border-purple-700/50 rounded-lg p-4 flex flex-col justify-between col-span-1 md:col-span-2 lg:col-span-3">
                <div>
                    <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-slate-900 rounded-lg flex items-center justify-center flex-shrink-0"><MicrophoneIcon className="w-6 h-6 text-purple-400" /></div>
                            <div>
                                <h3 className="font-bold text-yellow-300 pr-20 overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">{idea.title || 'Untitled Rehearsal'}</h3>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <div className="flex items-center gap-2 mt-1">
                                                    <p className="text-xs text-slate-400">Saved on {formatSavedOn(idea)}</p>
                                                    <span className="text-[10px] px-2 py-0.5 rounded-full border border-slate-600 bg-slate-900/40 text-slate-300 uppercase tracking-wide">
                                                        {idea.type}
                                                    </span>
                                                </div>
                                                    <span className="text-[10px] px-2 py-0.5 rounded-full border border-slate-600 bg-slate-900/40 text-slate-300 uppercase tracking-wide">
                                                        {idea.type}
                                                    </span>
                                                </div>
                            </div>
                        </div>
                    </div>
                    {notes && (
                        <div className="mt-2 mb-3 p-3 bg-slate-900/50 rounded-md">
                            <p className="text-sm text-slate-300 font-semibold mb-1">Notes:</p>
                            <p className="text-sm text-slate-400 whitespace-pre-wrap">{notes}</p>
                        </div>
                    )}
                    <div className="max-h-48 overflow-y-auto space-y-2 pr-2">
                        {transcript.map((t, i) => (
                            <div key={i} className={`flex text-sm ${t.source === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <p className={`max-w-[80%] px-3 py-1.5 rounded-lg ${t.source === 'user' ? 'bg-purple-900/70 text-purple-100' : 'bg-slate-700/70 text-slate-200'}`}>
                                    <strong>{t.source === 'user' ? 'You:' : 'Coach:'}</strong> {t.text}
                                </p>
                            </div>
                        ))}
                    </div>
                    {editingIdeaId === idea.id ? <TagEditor idea={idea} /> : <TagDisplay idea={idea} />}
                </div>
                <div className="absolute top-3 right-3 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={handleRefineRehearsal} className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-slate-700/50 hover:bg-purple-900/50 rounded-full text-slate-300 hover:text-purple-300 transition-colors" aria-label="Refine with AI"><WandIcon className="w-3 h-3" /><span>Refine</span></button>
                    <ShareButton title={`Rehearsal: ${idea.title || 'Untitled Session'}`} text={formattedShareText} className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-slate-700/50 hover:bg-purple-900/50 rounded-full text-slate-300 hover:text-purple-300 transition-colors" aria-label="Share"><ShareIcon className="w-3 h-3" /><span>Share</span></ShareButton>
                    <button onClick={() => handlePrint(idea)} className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-slate-700/50 hover:bg-purple-900/50 rounded-full text-slate-300 hover:text-purple-300 transition-colors" aria-label="Print"><PrintIcon className="w-3 h-3" /></button>
                    <button onClick={() => handleDelete(idea.id)} className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-900/50 rounded-full transition-colors" aria-label="Delete idea"><TrashIcon className="w-4 h-4" /></button>
                </div>
            </div>
        );
    };

    return (
        <div className="flex-1 overflow-y-auto p-4 md:p-6 animate-fade-in">
            <div className="flex items-center gap-3 mb-4">
                <BookmarkIcon className="w-8 h-8 text-purple-400" />
                <h2 className="text-2xl font-bold text-yellow-400 font-cinzel">My Saved Ideas</h2>
            </div>

            {/* Sticky Filters */}
            <div className="sticky top-0 z-20 -mx-4 md:-mx-6 px-4 md:px-6 py-3 mb-4 bg-slate-950/70 backdrop-blur border-b border-slate-800">
                <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                    <div className="flex-1">
                        <input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search ideas..."
                            className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-md text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-purple-500"
                            aria-label="Search ideas"
                        />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <label className="text-xs font-semibold text-slate-400">Sort:</label>
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as any)}
                            className="px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-purple-500"
                            aria-label="Sort ideas"
                        >
                            <option value="recent">Recent</option>
                            <option value="mostUsed">Most Used</option>
                            <option value="lastOpened">Last Opened</option>
                            <option value="title">Title</option>
                            <option value="aiScore">AI Score (future)</option>
                        </select>

                        <label className="text-xs font-semibold text-slate-400">Type:</label>
                        <select
                            value={typeFilter}
                            onChange={(e) => { setTypeFilter(e.target.value as any); setTagFilter(null); }}
                            className="px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-purple-500"
                            aria-label="Filter by type"
                        >
                            <option value="all">All</option>
                            <option value="text">Text</option>
                            <option value="image">Image</option>
                            <option value="rehearsal">Rehearsal</option>
                        </select>

                        <label className="text-xs font-semibold text-slate-400">Tag:</label>
                        <select
                            value={tagFilter ?? ''}
                            onChange={(e) => setTagFilter(e.target.value ? e.target.value : null)}
                            className="px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-purple-500"
                            aria-label="Filter by tag"
                        >
                            <option value="">All</option>
                            {allTags.map((t) => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Empty / No Results */}
            {ideas.length === 0 ? (
                <div className="text-center py-16 text-slate-400">
                    <div className="text-3xl mb-2">✨</div>
                    <div className="text-lg font-semibold text-slate-200">No saved ideas yet</div>
                    <div className="text-sm text-slate-400 mt-1">Generate your first idea to begin building your library.</div>
                </div>
            ) : filteredIdeas.length === 0 ? (
                <div className="text-center py-10 text-slate-400">
                    <div className="text-lg font-semibold text-slate-200">No matches</div>
                    <div className="text-sm text-slate-400 mt-1">Try a different search, tag, or type filter.</div>
                </div>
            ) : (
                <div className="space-y-4">
                    {([
                        { key: 'saved_notes', label: 'Saved Notes', items: sections.saved_notes },
                        { key: 'blueprints', label: 'Blueprints', items: sections.blueprints },
                        { key: 'video_analyses', label: 'Video Analyses', items: sections.video_analyses },
                        { key: 'rehearsal_sessions', label: 'Rehearsal Sessions', items: sections.rehearsal_sessions },
                    ] as const).map((sec) => {
                        if (!sec.items.length) return null;
                        const isOpen = sectionOpen[sec.key] ?? true;

                        return (
                            <div key={sec.key} className="bg-slate-900/20 border border-slate-800 rounded-xl overflow-hidden mb-10 bg-white/3 backdrop-blur-sm hover:border-indigo-400/20">
                                <button
                                    type="button"
                                    onClick={() => setSectionOpen((prev) => ({ ...prev, [sec.key]: !isOpen }))}
                                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-800/30 transition-colors"
                                    aria-expanded={isOpen}
                                >
                                    <div className="flex items-center gap-3">
                                        <span className={`text-slate-300 transition-transform duration-300 ${isOpen ? 'rotate-90' : 'rotate-0'}`}>▼</span>
                                        <div className="font-semibold tracking-tight line-clamp-2 text-slate-100">{sec.label}</div>
                                        <div className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                                            {sec.items.length}
                                        </div>
                                    </div>
                                    <div className="text-xs text-slate-500">
                                        {isOpen ? 'Collapse' : 'Expand'}
                                    </div>
                                </button>

                                {isOpen ? (
                                    <div className="p-4">
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                            {sec.items.map((idea) => {
                                                if (idea.type === 'image') {
                                                    return (
                                                        <div key={idea.id} ref={el => { ideaRefs.current.set(idea.id, el); }} className="group relative bg-slate-900 border border-slate-700 rounded-lg flex flex-col justify-between overflow-hidden aspect-square transition-all hover:border-purple-500">
                                                            <img src={idea.content} alt={idea.title || 'Saved visual idea'} className="w-full h-full object-cover absolute inset-0 transition-transform duration-300 group-hover:scale-105"/>
                                                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent"></div>
                                                            <div className="relative z-10 p-3 flex flex-col justify-end h-full">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-8 h-8 bg-slate-900/70 rounded-lg flex items-center justify-center flex-shrink-0 backdrop-blur-sm"><ImageIcon className="w-5 h-5 text-purple-400" /></div>
                                                                    <div>
                                                                        <h3 className="font-bold text-yellow-300 text-sm overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:1]">{idea.title || 'Image Idea'}</h3>
                                                                        <div className="flex items-center gap-2 mt-1">
                                                                            <p className="text-xs text-slate-400">{formatSavedOn(idea)}</p>
                                                                            <span className="text-[10px] px-2 py-0.5 rounded-full border border-slate-600 bg-slate-900/40 text-slate-300 uppercase tracking-wide">{idea.type}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                {editingIdeaId === idea.id ? <TagEditor idea={idea} /> : <TagDisplay idea={idea} />}
                                                            </div>
                                                            <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <IdeaShareWrapper idea={idea} />
                                                                <button onClick={() => handleDelete(idea.id)} className="p-1.5 bg-black/50 text-slate-300 hover:text-red-400 hover:bg-red-900/50 rounded-full transition-colors backdrop-blur-sm" aria-label="Delete idea"><TrashIcon className="w-4 h-4" /></button>
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                                if (idea.type === 'rehearsal') {
                                                    return <RehearsalIdeaCard key={idea.id} idea={idea} />;
                                                }

                                                return (
                                                    <div
                                                        key={idea.id}
                                                        ref={el => { ideaRefs.current.set(idea.id, el); }}
                                                        className="group relative bg-slate-800 border border-slate-700 rounded-lg p-4 flex flex-col justify-between transition-all hover:border-purple-500 min-h-[180px] max-h-[180px] overflow-hidden"
                                                    >
                                                        <div className="min-w-0">
                                                            <div className="flex items-start justify-between gap-3 mb-2">
                                                                <div className="flex items-center gap-3 min-w-0">
                                                                    <div className="w-10 h-10 bg-slate-900 rounded-lg flex items-center justify-center flex-shrink-0"><FileTextIcon className="w-6 h-6 text-purple-400" /></div>
                                                                    <div className="min-w-0">
                                                                        <h3 className="font-bold text-yellow-300 pr-20 overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">{idea.title || splitLeadingHeading(idea.content).heading || 'Saved Note'}</h3>
                                                                        <p className="text-xs text-slate-400">Saved on {formatSavedOn(idea)}</p>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {(() => {
                                                                const isError = isErrorIdea(idea.content);
                                                                const { heading, rest } = splitLeadingHeading(idea.content);
                                                                const { imgSrc, cleaned } = extractFirstDataImage(rest);
                                                                return (
                                                                    <div className="text-sm text-slate-300 whitespace-pre-wrap break-words">
                                                                        {isError ? (
                                                                            <div className="text-sm text-slate-300">
                                                                                <div className="font-semibold text-slate-200">This item failed to load.</div>
                                                                                <div className="text-slate-400 mt-1 overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]">
                                                                                    {idea.content}
                                                                                </div>
                                                                                <div className="text-slate-500 mt-2">You can safely delete it.</div>
                                                                            </div>
                                                                        ) : (
                                                                            <>
                                                                                {heading ? <div className="text-yellow-300 font-semibold mb-1 overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:1]">{heading}</div> : null}
                                                                                {imgSrc ? (
                                                                                    <div className="mt-2 mb-2">
                                                                                        <button type="button" onClick={() => setLightboxImg(imgSrc)} className="block w-full" aria-label="Open concept art">
                                                                                            <img
                                                                                                src={imgSrc}
                                                                                                alt="Concept art"
                                                                                                loading="lazy"
                                                                                                className="w-full h-24 object-cover rounded-lg border border-slate-700 bg-slate-950/20 cursor-zoom-in"
                                                                                            />
                                                                                        </button>
                                                                                    </div>
                                                                                ) : null}
                                                                                <div className="overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:4]">{cleaned}</div>
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })()}
                                                        </div>

                                                        {editingIdeaId === idea.id ? <TagEditor idea={idea} /> : <TagDisplay idea={idea} />}

                                                        <div className="absolute top-3 right-3 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <IdeaShareWrapper idea={idea} />
                                                            <button onClick={() => handlePrint(idea)} className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-slate-700/50 hover:bg-purple-900/50 rounded-full text-slate-300 hover:text-purple-300 transition-colors" aria-label="Print"><PrintIcon className="w-3 h-3" /></button>
                                                            <button onClick={() => handleDelete(idea.id)} className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-900/50 rounded-full transition-colors" aria-label="Delete idea"><TrashIcon className="w-4 h-4" /></button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Lightbox */}
            {lightboxImg ? (
                <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" role="dialog" aria-modal="true">
                    <button
                        type="button"
                        onClick={() => setLightboxImg(null)}
                        className="absolute top-4 right-4 p-2 rounded-full bg-slate-900/60 text-slate-200 hover:text-white hover:bg-slate-900/80 transition"
                        aria-label="Close image"
                    >
                        <CrossIcon className="w-5 h-5" />
                    </button>
                    <img src={lightboxImg} alt="Concept art" className="max-w-full max-h-full rounded-xl border border-slate-700" />
                </div>
            ) : null}
        </div>
    );
};

export default SavedIdeas;
