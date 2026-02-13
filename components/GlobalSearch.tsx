import React, { useMemo, useState } from 'react';
import type { Show, Task, SavedIdea, MagicianView } from '../types';
import { SearchIcon, TagIcon, ChecklistIcon, BookmarkIcon, StageCurtainsIcon } from './icons';

interface GlobalSearchProps {
    shows: Show[];
    ideas: SavedIdea[];
    onNavigate: (view: MagicianView, id: string, secondaryId?: string) => void;
}

type SearchScope = 'all' | 'shows' | 'tasks' | 'ideas' | 'clients' | 'files';
type BadgeType = 'Exact Match' | 'Related' | 'Suggested' | 'Recent';

type HitType = 'show' | 'task' | 'idea' | 'client' | 'file';

type SearchHit = {
    key: string;
    type: HitType;
    title: string;
    subtitle?: string;
    tags?: string[];
    icon: React.FC<any>;
    onClick?: () => void;
    score: number;
    badges: BadgeType[];
};

const GlobalSearch: React.FC<GlobalSearchProps> = ({ shows, ideas, onNavigate }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTag, setSelectedTag] = useState<string | null>(null);
    const [activeScope, setActiveScope] = useState<SearchScope>('all');

    const scopeMeta: Record<SearchScope, { label: string; disabled?: boolean }> = {
        all: { label: 'All' },
        shows: { label: 'Shows' },
        clients: { label: 'Clients', disabled: true },
        ideas: { label: 'Ideas' },
        tasks: { label: 'Tasks' },
        files: { label: 'Files', disabled: true },
    };

    const scopeOrder: SearchScope[] = ['all', 'shows', 'clients', 'ideas', 'tasks', 'files'];

    const allTags = useMemo(() => {
        const tags = new Set<string>();
        shows.forEach(show => {
            show.tags?.forEach(t => tags.add(t));
            show.tasks?.forEach(task => task.tags?.forEach(t => tags.add(t)));
        });
        ideas.forEach(idea => idea.tags?.forEach(t => tags.add(t)));
        return Array.from(tags).sort((a, b) => a.localeCompare(b));
    }, [shows, ideas]);

    const counts = useMemo(() => {
        const taskCount = shows.reduce((acc, s) => acc + (s.tasks?.length || 0), 0);
        return {
            shows: shows.length,
            tasks: taskCount,
            ideas: ideas.length,
            total: shows.length + taskCount + ideas.length,
        };
    }, [shows, ideas]);

    const query = useMemo(() => (selectedTag || searchTerm).trim(), [selectedTag, searchTerm]);
    const queryLower = useMemo(() => query.toLowerCase(), [query]);

    const statusText = useMemo(() => {
        const scopeLabel = scopeMeta[activeScope]?.label ?? 'All';
        const scopesShown =
            activeScope === 'all'
                ? 'Shows + Tasks + Ideas'
                : activeScope === 'shows'
                ? 'Shows'
                : activeScope === 'tasks'
                ? 'Tasks'
                : activeScope === 'ideas'
                ? 'Ideas'
                : scopeLabel;

        if (activeScope === 'clients') return 'Clients search is coming soon.';
        if (activeScope === 'files') return 'Files search is coming soon.';

        if (!query) return `Search across ${counts.shows} shows, ${counts.tasks} tasks, and ${counts.ideas} ideas.`;

        return `Searching across ${counts.total} items… Showing results from ${scopesShown}.`;
    }, [activeScope, counts, query]);

    const getTimestamp = (obj: any): number | null => {
        const raw =
            obj?.updated_at ??
            obj?.updatedAt ??
            obj?.last_modified ??
            obj?.lastModified ??
            obj?.created_at ??
            obj?.createdAt ??
            null;
        if (!raw) return null;
        const t = typeof raw === 'number' ? raw : Date.parse(String(raw));
        return Number.isFinite(t) ? t : null;
    };

    const scoreAndBadges = (item: { title?: string; description?: string; notes?: string; content?: string; tags?: string[] }) => {
        const badges: BadgeType[] = [];
        let score = 0;

        const title = (item.title || '').toLowerCase();
        const desc = (item.description || '').toLowerCase();
        const notes = (item.notes || '').toLowerCase();
        const content = (typeof item.content === 'string' ? item.content : '').toLowerCase();
        const tags = (item.tags || []).map(t => t.toLowerCase());

        // Tag-based search
        if (selectedTag) {
            if (tags.includes(queryLower)) {
                badges.push('Exact Match');
                score += 90;
            } else if (tags.some(t => t.includes(queryLower))) {
                badges.push('Related');
                score += 60;
            }
        } else if (searchTerm.trim()) {
            // Text-based search
            if (title === queryLower) {
                badges.push('Exact Match');
                score += 100;
            } else if (title.startsWith(queryLower)) {
                badges.push('Related');
                score += 80;
            } else if (title.includes(queryLower)) {
                badges.push('Related');
                score += 65;
            }

            if (tags.includes(queryLower)) {
                if (!badges.includes('Exact Match')) badges.push('Exact Match');
                score += 70;
            } else if (tags.some(t => t.includes(queryLower))) {
                if (!badges.includes('Related')) badges.push('Related');
                score += 45;
            }

            const inDesc = !!queryLower && desc.includes(queryLower);
            const inNotes = !!queryLower && notes.includes(queryLower);
            const inContent = !!queryLower && content.includes(queryLower);

            if ((inDesc || inNotes || inContent) && !badges.length) {
                badges.push('Suggested');
                score += 30;
            } else if (inDesc || inNotes || inContent) {
                score += 15;
            }
        }

        // Recent badge (best-effort)
        const ts = getTimestamp(item);
        if (ts) {
            const days = (Date.now() - ts) / (1000 * 60 * 60 * 24);
            if (days <= 14) {
                badges.push('Recent');
                score += 10;
            }
        }

        if (!badges.length && score > 0) badges.push('Suggested');
        return { score, badges };
    };

    const matchesQuery = (item: { title?: string; description?: string; notes?: string; content?: string; tags?: string[] }) => {
        if (!queryLower) return false;
        const tags = item.tags?.map(t => t.toLowerCase()) || [];
        if (selectedTag) return tags.includes(queryLower);

        const hay = [
            item.title ?? '',
            item.description ?? '',
            item.notes ?? '',
            typeof item.content === 'string' ? item.content : '',
            ...tags,
        ]
            .join(' ')
            .toLowerCase();

        return hay.includes(queryLower);
    };

    const searchResults = useMemo(() => {
        if (!queryLower) return null;

        const showHits: SearchHit[] = [];
        const taskHits: SearchHit[] = [];
        const ideaHits: SearchHit[] = [];

        // Shows
        shows.forEach(show => {
            if (!matchesQuery(show)) return;
            const { score, badges } = scoreAndBadges(show);
            showHits.push({
                key: `show:${show.id}`,
                type: 'show',
                title: show.title,
                subtitle: show.description,
                tags: show.tags,
                icon: StageCurtainsIcon,
                onClick: () => onNavigate('show-planner', show.id),
                score,
                badges,
            });
        });

        // Tasks (inside shows)
        shows.forEach(show => {
            (show.tasks || []).forEach(task => {
                if (!matchesQuery(task)) return;
                const { score, badges } = scoreAndBadges(task);
                taskHits.push({
                    key: `task:${show.id}:${task.id}`,
                    type: 'task',
                    title: task.title,
                    subtitle: `In Show: ${show.title}`,
                    tags: task.tags,
                    icon: ChecklistIcon,
                    onClick: () => onNavigate('show-planner', show.id, task.id),
                    score,
                    badges,
                });
            });
        });

        // Ideas
        ideas.forEach(idea => {
            if (!matchesQuery(idea)) return;
            const { score, badges } = scoreAndBadges(idea);
            ideaHits.push({
                key: `idea:${idea.id}`,
                type: 'idea',
                title: idea.title,
                subtitle: idea.description,
                tags: idea.tags,
                icon: BookmarkIcon,
                onClick: () => onNavigate('saved-ideas', idea.id),
                score,
                badges,
            });
        });

        const sortByScore = (a: SearchHit, b: SearchHit) => (b.score - a.score) || a.title.localeCompare(b.title);

        showHits.sort(sortByScore);
        taskHits.sort(sortByScore);
        ideaHits.sort(sortByScore);

        // Scope filtering
        let showsScoped = showHits;
        let tasksScoped = taskHits;
        let ideasScoped = ideaHits;

        if (activeScope !== 'all') {
            if (activeScope !== 'shows') showsScoped = [];
            if (activeScope !== 'tasks') tasksScoped = [];
            if (activeScope !== 'ideas') ideasScoped = [];
            if (activeScope === 'clients' || activeScope === 'files') {
                showsScoped = [];
                tasksScoped = [];
                ideasScoped = [];
            }
        }

        const combined = [...showsScoped, ...tasksScoped, ...ideasScoped].sort(sortByScore);
        const topMatches = combined.slice(0, 6);

        return {
            topMatches,
            shows: showsScoped,
            tasks: tasksScoped,
            ideas: ideasScoped,
            clients: [] as SearchHit[],
        };
    }, [queryLower, shows, ideas, activeScope]);

    const handleTagClick = (tag: string) => {
        setSearchTerm('');
        setSelectedTag(prev => (prev === tag ? null : tag));
    };

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSelectedTag(null);
        setSearchTerm(e.target.value);
    };

    const highlightQuery = useMemo(() => (selectedTag ? '' : searchTerm.trim()), [selectedTag, searchTerm]);

    const renderHighlighted = (text: string) => {
        const q = highlightQuery;
        if (!q) return text;
        const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`(${escaped})`, 'ig');
        const parts = text.split(re);
        if (parts.length === 1) return text;
        return (
            <>
                {parts.map((part, idx) => {
                    const isMatch = part.toLowerCase() === q.toLowerCase();
                    return isMatch ? (
                        <span key={idx} className="font-bold text-slate-100">
                            {part}
                        </span>
                    ) : (
                        <span key={idx}>{part}</span>
                    );
                })}
            </>
        );
    };

    const badgeClass = (b: BadgeType) => {
        switch (b) {
            case 'Exact Match':
                return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
            case 'Related':
                return 'bg-purple-500/15 text-purple-300 border-purple-500/30';
            case 'Suggested':
                return 'bg-sky-500/15 text-sky-300 border-sky-500/30';
            case 'Recent':
                return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
            default:
                return 'bg-slate-500/10 text-slate-300 border-slate-500/20';
        }
    };

    const ResultRow: React.FC<{ hit: SearchHit }> = ({ hit }) => (
        <button
            onClick={hit.onClick}
            disabled={!hit.onClick}
            className={[
                'w-full text-left p-3 bg-slate-800 border border-slate-700 rounded-lg transition-colors',
                hit.onClick ? 'hover:bg-purple-900/50' : 'opacity-60 cursor-not-allowed',
            ].join(' ')}
        >
            <div className="flex items-start gap-3">
                <div className="mt-1">
                    {(() => { const Icon = hit.icon; return <Icon className="w-5 h-5 text-purple-400" />; })()}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-slate-200 truncate">{renderHighlighted(hit.title)}</p>
                        {hit.badges?.length ? (
                            <div className="flex flex-wrap gap-1 justify-end">
                                {hit.badges.slice(0, 2).map(b => (
                                    <span
                                        key={b}
                                        className={[
                                            'px-2 py-0.5 text-[10px] font-bold rounded-full border',
                                            badgeClass(b),
                                        ].join(' ')}
                                    >
                                        {b}
                                    </span>
                                ))}
                            </div>
                        ) : null}
                    </div>
                    {hit.subtitle && <p className="text-xs text-slate-400 mt-0.5">{renderHighlighted(hit.subtitle)}</p>}
                    {hit.tags && hit.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                            {hit.tags.map(tag => {
                                const isMatch = !selectedTag && highlightQuery && tag.toLowerCase().includes(highlightQuery.toLowerCase());
                                return (
                                    <span
                                        key={tag}
                                        className={[
                                            'px-1.5 py-0.5 text-xs font-semibold rounded border',
                                            isMatch
                                                ? 'bg-purple-500/25 text-purple-200 border-purple-500/40'
                                                : 'bg-purple-500/15 text-purple-300 border-purple-500/25',
                                        ].join(' ')}
                                    >
                                        {tag}
                                    </span>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </button>
    );

    const hasAnyResults =
        !!searchResults &&
        (searchResults.topMatches.length > 0 ||
            searchResults.shows.length > 0 ||
            searchResults.tasks.length > 0 ||
            searchResults.ideas.length > 0);

    return (
        <div className="flex-1 flex flex-col overflow-y-auto p-4 md:p-6 animate-fade-in">
            <header className="mb-6">
                <div className="flex items-center gap-3">
                    <SearchIcon className="w-8 h-8 text-purple-400" />
                    <h2 className="text-2xl font-bold text-slate-200 font-cinzel">Global Search</h2>
                </div>
                <p className="text-slate-400 mt-1">Find anything across your shows, tasks, and ideas.</p>
            </header>

            {/* Scope tabs */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
                {scopeOrder.map(scope => {
                    const meta = scopeMeta[scope];
                    const isActive = activeScope === scope;
                    return (
                        <button
                            key={scope}
                            type="button"
                            disabled={!!meta.disabled}
                            onClick={() => setActiveScope(scope)}
                            className={[
                                'px-3 py-1 text-xs font-semibold rounded-full border transition-colors',
                                meta.disabled
                                    ? 'opacity-40 cursor-not-allowed border-slate-700 text-slate-500'
                                    : 'border-slate-700 text-slate-300 hover:bg-slate-800',
                                isActive ? 'bg-purple-600 text-white border-purple-500' : 'bg-slate-900/40',
                            ].join(' ')}
                        >
                            {meta.label}
                        </button>
                    );
                })}
            </div>

            {/* Search input */}
            <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg mb-2">
                <input
                    type="text"
                    value={searchTerm}
                    onChange={handleSearchChange}
                    placeholder='Search shows, tasks, or ideas... Try: "birthday", "corporate", "closer trick"'
                    className="flex-1 w-full bg-transparent px-4 py-3 text-white placeholder-slate-400 focus:outline-none"
                />
            </div>
            <p className="text-xs text-slate-500 mb-6">{statusText}</p>

            {/* Results */}
            {searchResults ? (
                <div className="mb-10">
                    <h3 className="text-lg font-bold text-slate-300 mb-3">
                        {selectedTag ? `Items tagged with "${selectedTag}"` : `Search Results for "${searchTerm}"`}
                    </h3>

                    {!hasAnyResults ? (
                        <div className="text-slate-500 text-sm bg-slate-900/40 border border-slate-800 rounded-lg p-4">
                            No results found. Try a different keyword or choose a tag.
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* Top Matches */}
                            {searchResults.topMatches.length > 0 && (
                                <div>
                                    <h4 className="font-semibold text-slate-400 mb-2">Top Matches</h4>
                                    <div className="space-y-2">
                                        {searchResults.topMatches.map(hit => (
                                            <ResultRow key={hit.key} hit={hit} />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Shows */}
                            {searchResults.shows.length > 0 && (
                                <div>
                                    <h4 className="font-semibold text-slate-400 mb-2">Shows ({searchResults.shows.length})</h4>
                                    <div className="space-y-2">
                                        {searchResults.shows.map(hit => (
                                            <ResultRow key={hit.key} hit={hit} />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Clients (coming soon) */}
                            {(activeScope === 'all' || activeScope === 'clients') && (
                                <div>
                                    <h4 className="font-semibold text-slate-400 mb-2">Clients</h4>
                                    <div className="text-slate-500 text-sm bg-slate-900/40 border border-slate-800 rounded-lg p-4">
                                        Clients search is coming soon.
                                    </div>
                                </div>
                            )}

                            {/* Tasks */}
                            {searchResults.tasks.length > 0 && (
                                <div>
                                    <h4 className="font-semibold text-slate-400 mb-2">Tasks ({searchResults.tasks.length})</h4>
                                    <div className="space-y-2">
                                        {searchResults.tasks.map(hit => (
                                            <ResultRow key={hit.key} hit={hit} />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Ideas */}
                            {searchResults.ideas.length > 0 && (
                                <div>
                                    <h4 className="font-semibold text-slate-400 mb-2">Ideas ({searchResults.ideas.length})</h4>
                                    <div className="space-y-2">
                                        {searchResults.ideas.map(hit => (
                                            <ResultRow key={hit.key} hit={hit} />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            ) : (
                <div className="mb-10">
                    <h3 className="text-lg font-bold text-slate-300 mb-3">All Tags</h3>
                    {allTags.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                            {allTags.map(tag => (
                                <button
                                    key={tag}
                                    onClick={() => handleTagClick(tag)}
                                    className={`px-3 py-1 text-sm font-semibold rounded-full capitalize transition-colors ${
                                        selectedTag === tag ? 'bg-purple-600 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                                    }`}
                                >
                                    {tag}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <p className="text-slate-500 text-center py-8">
                            No tags found. Add tags to your shows, tasks, and ideas to organize them here.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};

export default GlobalSearch;
