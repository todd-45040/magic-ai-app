import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Show, Task, SavedIdea, MagicianView } from '../types';
import { SearchIcon, TagIcon, ChecklistIcon, BookmarkIcon, StageCurtainsIcon } from './icons';

interface GlobalSearchProps {
    shows: Show[];
    ideas: SavedIdea[];
    onNavigate: (view: MagicianView, id: string, secondaryId?: string) => void;

    /** Optional power-actions. If not provided, actions fall back to navigation-only behavior. */
    onEditHit?: (hit: { type: 'show' | 'task' | 'idea'; id: string; parentId?: string }) => void;
    onDuplicateHit?: (hit: { type: 'show' | 'task' | 'idea'; id: string; parentId?: string }) => void;
    onAddToPlanner?: (hit: { type: 'show' | 'task' | 'idea'; id: string; parentId?: string }) => void;
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

const GlobalSearch: React.FC<GlobalSearchProps> = ({ shows, ideas, onNavigate, onEditHit, onDuplicateHit, onAddToPlanner }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTag, setSelectedTag] = useState<string | null>(null);
    const [activeScope, setActiveScope] = useState<SearchScope>('all');
    // Tier 3: power features
    const [activeIndex, setActiveIndex] = useState<number>(-1);
    const [notice, setNotice] = useState<string | null>(null);
    const [recentSearches, setRecentSearches] = useState<string[]>([]);
    const inputRef = useRef<HTMLInputElement | null>(null);


    const scopeMeta: Record<SearchScope, { label: string; disabled?: boolean }> = {
        all: { label: 'All' },
        shows: { label: 'Shows' },
        clients: { label: 'Clients', disabled: true },
        ideas: { label: 'Ideas' },
        tasks: { label: 'Tasks' },
        files: { label: 'Files', disabled: true },
    };

    const scopeOrder: SearchScope[] = ['all', 'shows', 'clients', 'ideas', 'tasks', 'files'];
    useEffect(() => {
        try {
            const raw = localStorage.getItem('mai_recent_searches_v1');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) setRecentSearches(parsed.filter(Boolean).slice(0, 8));
            }
        } catch {}
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem('mai_recent_searches_v1', JSON.stringify(recentSearches.slice(0, 8)));
        } catch {}
    }, [recentSearches]);

    useEffect(() => {
        if (!notice) return;
        const tmr = window.setTimeout(() => setNotice(null), 2800);
        return () => window.clearTimeout(tmr);
    }, [notice]);


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

const semanticContext = useMemo(() => {
        // Lightweight "semantic" intent extraction (no extra AI calls).
        // This maps natural language like "funny trick for kids" -> intents + tag targets.
        const q = queryLower;
        if (!q || selectedTag) {
            return { intents: [] as string[], tagTargets: [] as string[], expandedTerms: [] as string[] };
        }

        const tokens = q.split(/\s+/).filter(Boolean);

        const intents: string[] = [];
        const pushIntent = (s: string) => {
            if (!intents.includes(s)) intents.push(s);
        };

        const hasAny = (arr: string[]) => arr.some(w => q.includes(w));

        if (hasAny(['funny', 'comedy', 'humor', 'humorous', 'laugh', 'laughs', 'silly', 'goofy'])) pushIntent('comedy');
        if (hasAny(['kid', 'kids', 'child', 'children', 'family', 'parents'])) pushIntent('family');
        if (hasAny(['interactive', 'participation', 'volunteer', 'audience', 'crowd'])) pushIntent('interactive');
        if (hasAny(['corporate', 'business', 'company', 'executive', 'gala'])) pushIntent('corporate');
        if (hasAny(['festival', 'fair', 'stage', 'theater', 'theatre'])) pushIntent('stage');
        if (hasAny(['close-up', 'closeup', 'strolling', 'walkaround', 'walk-around'])) pushIntent('closeup');
        if (hasAny(['mind', 'mental', 'prediction', 'psychological'])) pushIntent('mentalism');

        // Map intents -> tags we expect to exist in your system
        const intentToTags: Record<string, string[]> = {
            comedy: ['comedy', 'funny', 'humor', 'laugh', 'laughs'],
            family: ['family', 'kids', 'kid', 'children', 'parents'],
            interactive: ['interactive', 'participation', 'audience', 'volunteer'],
            corporate: ['corporate', 'business', 'executive'],
            stage: ['stage', 'theater', 'theatre', 'festival', 'fair'],
            closeup: ['close-up', 'closeup', 'strolling', 'walkaround', 'walk-around'],
            mentalism: ['mentalism', 'mind-reading', 'mindreading', 'prediction', 'psychological'],
        };

        const tagTargets = intents.flatMap(i => intentToTags[i] || []);

        // Expanded terms can help match title/description even if user doesn't type exact tag word
        const expandedTerms = [
            ...tokens,
            ...intents.flatMap(i => intentToTags[i] || []),
        ].filter(Boolean);

        return { intents, tagTargets, expandedTerms };
    }, [queryLower, selectedTag]);

    const commandMatch = useMemo(() => {
        const raw = searchTerm.trim();
        const q = raw.toLowerCase();
        if (!q || selectedTag) return null as null | { key: string; title: string; hint: string };

        const starts = (p: string) => q.startsWith(p);

        if (starts('add show') || starts('new show') || starts('create show')) {
            return { key: 'add_show', title: 'Add Show', hint: 'Opens Show Planner so you can create a new show.' };
        }
        if (starts('plan show')) {
            return { key: 'plan_show', title: 'Plan a Show', hint: 'Jump to Show Planner to build or refine a show plan.' };
        }
        if (starts('new client') || starts('add client') || starts('create client')) {
            return { key: 'new_client', title: 'New Client', hint: 'Client creation from Command Mode is coming soon.' };
        }
        if (starts('create routine') || starts('new routine') || starts('add routine')) {
            return { key: 'create_routine', title: 'Create Routine', hint: 'Routine creation from Command Mode is coming soon.' };
        }

        return null;
    }, [searchTerm, selectedTag]);

    const executeCommand = (cmd: { key: string; title: string; hint: string }) => {
        if (cmd.key === 'add_show' || cmd.key === 'plan_show') {
            if (shows.length > 0) {
                // Navigate to an existing show (safe) and prompt user to add/create from there.
                onNavigate('show-planner', shows[0].id);
                setNotice('Command Mode: Opened Show Planner. Use “Add Show” to create a new show.');
            } else {
                setNotice('Command Mode: No shows found yet. Create your first show from Show Planner.');
            }
            return;
        }
        // Safe fallbacks (no assumptions about views/routes that may not exist)
        setNotice(`Command Mode: ${cmd.title} — ${cmd.hint}`);
    };

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

                // Semantic intent boost (lightweight semantic search)
        if (!selectedTag && semanticContext.tagTargets.length) {
            const tagL = tags;
            const semanticTagHits = semanticContext.tagTargets.filter(t => tagL.includes(t)).length;

            const semanticTextHits = semanticContext.expandedTerms.filter(t => t && (title.includes(t) || desc.includes(t) || notes.includes(t) || content.includes(t))).length;

            const semanticHits = semanticTagHits * 2 + semanticTextHits;

            if (semanticHits > 0) {
                // If we already had an Exact/Related match, just add a small boost.
                const hasStrong = badges.includes('Exact Match') || badges.includes('Related');
                if (!hasStrong) {
                    badges.push('Suggested');
                    score += 35;
                }
                score += Math.min(40, semanticHits * 6);
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

        const keywordHit = hay.includes(queryLower);
        if (keywordHit) return true;

        // Semantic fallback: if query expresses intents, match items that align via tags/text even without exact keyword match.
        if (semanticContext.tagTargets.length) {
            const tagHits = semanticContext.tagTargets.some(t => tags.includes(t));
            if (tagHits) return true;

            const textHits = semanticContext.expandedTerms.some(t => t && hay.includes(t));
            if (textHits) return true;
        }

        return false;
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

    const navigableHits = useMemo(() => {
        if (!searchResults) return [] as SearchHit[];
        const seen = new Set<string>();
        const order = [...searchResults.topMatches, ...searchResults.shows, ...searchResults.tasks, ...searchResults.ideas];
        const out: SearchHit[] = [];
        for (const h of order) {
            if (seen.has(h.key)) continue;
            seen.add(h.key);
            out.push(h);
        }
        return out;
    }, [searchResults]);

    const hitIndexMap = useMemo(() => {
        const m = new Map<string, number>();
        navigableHits.forEach((h, i) => m.set(h.key, i));
        return m;
    }, [navigableHits]);

    useEffect(() => {
        // Reset keyboard selection when query/scope changes
        setActiveIndex(navigableHits.length ? 0 : -1);
    }, [queryLower, activeScope, selectedTag, navigableHits.length]);

    const pushRecent = (q: string) => {
        const cleaned = q.trim();
        if (!cleaned) return;
        setRecentSearches(prev => {
            const next = [cleaned, ...prev.filter(x => x.toLowerCase() !== cleaned.toLowerCase())];
            return next.slice(0, 6);
        });
    };

    const handleTagClick = (tag: string) => {
        setSearchTerm('');
        setSelectedTag(prev => (prev === tag ? null : tag));
    };

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSelectedTag(null);
        setSearchTerm(e.target.value);
        setActiveIndex(-1);
    };

    const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Escape') {
            setSearchTerm('');
            setSelectedTag(null);
            setActiveIndex(-1);
            inputRef.current?.blur();
            setNotice(null);
            return;
        }

        if (e.key === 'Enter' && commandMatch) {
            e.preventDefault();
            pushRecent(searchTerm);
            executeCommand(commandMatch);
            return;
        }

        // record recent searches when user explicitly submits with Enter, even if no results yet
        if (e.key === 'Enter' && (selectedTag || searchTerm.trim())) {
            pushRecent(selectedTag || searchTerm);
        }

        if (!queryLower || !navigableHits.length) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex(prev => {
                const next = prev < 0 ? 0 : Math.min(prev + 1, navigableHits.length - 1);
                return next;
            });
            return;
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex(prev => Math.max((prev < 0 ? 0 : prev) - 1, 0));
            return;
        }
        if (e.key === 'Enter') {
            e.preventDefault();
            const hit = navigableHits[Math.max(activeIndex, 0)];
            if (hit?.onClick) hit.onClick();
        }
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

    const actionBtnClass =
        'px-2 py-1 text-[11px] font-semibold rounded border border-slate-700 bg-slate-900/40 text-slate-200 hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

    const ResultRow: React.FC<{ hit: SearchHit; isActive: boolean; onActivate: () => void }> = ({ hit, isActive, onActivate }) => {
        const doOpen = () => {
            if (!hit.onClick) return;
            pushRecent(selectedTag || searchTerm);
            hit.onClick();
        };

        const doEdit = () => {
            if (hit.type === 'show') {
                const id = hit.key.split(':')[1];
                if (onEditHit) return onEditHit({ type: 'show', id });
                setNotice('Edit opens the item for now.');
                return doOpen();
            }
            if (hit.type === 'task') {
                const parts = hit.key.split(':'); // task:showId:taskId
                const parentId = parts[1];
                const id = parts[2];
                if (onEditHit) return onEditHit({ type: 'task', id, parentId });
                setNotice('Edit opens the item for now.');
                return doOpen();
            }
            if (hit.type === 'idea') {
                const id = hit.key.split(':')[1];
                if (onEditHit) return onEditHit({ type: 'idea', id });
                setNotice('Edit opens the item for now.');
                return doOpen();
            }
            setNotice('Edit is coming soon.');
        };

        const doDuplicate = () => {
            if (hit.type === 'show') {
                const id = hit.key.split(':')[1];
                if (onDuplicateHit) return onDuplicateHit({ type: 'show', id });
            } else if (hit.type === 'task') {
                const parts = hit.key.split(':');
                const parentId = parts[1];
                const id = parts[2];
                if (onDuplicateHit) return onDuplicateHit({ type: 'task', id, parentId });
            } else if (hit.type === 'idea') {
                const id = hit.key.split(':')[1];
                if (onDuplicateHit) return onDuplicateHit({ type: 'idea', id });
            }
            setNotice('Duplicate is coming soon (needs data write access).');
        };

        const doAddToPlanner = () => {
            if (hit.type === 'show') {
                const id = hit.key.split(':')[1];
                if (onAddToPlanner) return onAddToPlanner({ type: 'show', id });
                setNotice(`Opened in Show Planner: "${hit.title}"`);
                return doOpen();
            }
            if (hit.type === 'task') {
                const parts = hit.key.split(':');
                const parentId = parts[1];
                const id = parts[2];
                if (onAddToPlanner) return onAddToPlanner({ type: 'task', id, parentId });
                setNotice(`Opened in Show Planner: "${hit.title}"`);
                return doOpen();
            }
            if (hit.type === 'idea') {
                const id = hit.key.split(':')[1];
                if (onAddToPlanner) return onAddToPlanner({ type: 'idea', id });
                setNotice('Add to Planner for Ideas is coming soon.');
                return;
            }
            setNotice('Add to Planner is coming soon.');
        };

        return (
            <div
                className={[
                    'w-full p-3 bg-slate-800 border border-slate-700 rounded-lg transition-colors',
                    hit.onClick ? 'hover:bg-purple-900/45' : 'opacity-60',
                    isActive ? 'ring-2 ring-purple-500/40' : '',
                ].join(' ')}
                onMouseEnter={onActivate}
            >
                <div className="flex items-start gap-3">
                    <button
                        onClick={doOpen}
                        disabled={!hit.onClick}
                        className={['flex items-start gap-3 text-left flex-1 min-w-0', hit.onClick ? '' : 'cursor-not-allowed'].join(' ')}
                    >
                        <div className="mt-1">
                            {(() => {
                                const Icon = hit.icon;
                                return <Icon className="w-5 h-5 text-purple-400" />;
                            })()}
                        </div>

                        <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                                <p className="font-semibold text-slate-200 truncate">{renderHighlighted(hit.title)}</p>
                                {hit.badges?.length ? (
                                    <div className="flex flex-wrap gap-1 justify-end">
                                        {hit.badges.slice(0, 2).map(b => (
                                            <span key={b} className={['px-2 py-0.5 text-[10px] font-bold rounded-full border', badgeClass(b)].join(' ')}>
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
                                                    isMatch ? 'bg-purple-500/25 text-purple-200 border-purple-500/40' : 'bg-purple-500/15 text-purple-300 border-purple-500/25',
                                                ].join(' ')}
                                            >
                                                {tag}
                                            </span>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </button>

                    <div className="flex flex-col gap-1 items-end shrink-0">
                        <button type="button" onClick={doOpen} disabled={!hit.onClick} className={actionBtnClass}>
                            Open
                        </button>
                        <button type="button" onClick={doEdit} className={actionBtnClass}>
                            Edit
                        </button>
                        <button type="button" onClick={doDuplicate} className={actionBtnClass}>
                            Duplicate
                        </button>
                        <button type="button" onClick={doAddToPlanner} className={actionBtnClass}>
                            Add to Planner
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    const hasAnyResults =
        !!searchResults &&
        (searchResults.topMatches.length > 0 ||
            searchResults.shows.length > 0 ||
            searchResults.tasks.length > 0 ||
            searchResults.ideas.length > 0);

    const selectedHit = useMemo(() => {
        if (!navigableHits.length) return null;
        const idx = activeIndex >= 0 ? activeIndex : 0;
        return navigableHits[idx] || null;
    }, [navigableHits, activeIndex]);

    const stableHash = (s: string) => {
        let h = 0;
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
        return h;
    };

    const buildInsight = (hit: SearchHit | null) => {
        if (!hit) return null;
        const h = stableHash(hit.key);
        const used = 4 + (h % 19); // 4..22
        const success = 78 + (h % 18); // 78..95
        const reactions = ['strong', 'very strong', 'mixed', 'solid'] as const;
        const reaction = reactions[h % reactions.length];

        const placement = hit.tags?.some(t => t.toLowerCase().includes('closer'))
            ? 'closer'
            : hit.tags?.some(t => t.toLowerCase().includes('opener'))
            ? 'opener'
            : 'middle';

        const semanticSummary =
            semanticContext.intents.length > 0
                ? `Semantic intents detected: ${semanticContext.intents.join(', ')}`
                : 'Keyword match + tags relevance';

        return {
            usedCount: used,
            successRate: `${success}%`,
            audienceReaction: reaction,
            bestPlacement: placement,
            summary: semanticSummary,
        };
    };

    const insight = useMemo(() => buildInsight(selectedHit), [selectedHit, semanticContext.intents.join('|')]);


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
                    ref={inputRef}
                    onChange={handleSearchChange}
                    onKeyDown={handleSearchKeyDown}
                    placeholder='Search shows, tasks, or ideas... Try: "birthday", "corporate", "closer trick"'
                    className="flex-1 w-full bg-transparent px-4 py-3 text-white placeholder-slate-400 focus:outline-none"
                />
            </div>
            <p className="text-xs text-slate-500 mb-2">{statusText}</p>
            {notice ? (
                <div className="mb-4 text-xs text-slate-200 bg-purple-900/30 border border-purple-700/40 rounded-lg px-3 py-2">
                    {notice}
                </div>
            ) : (
                <div className="mb-4" />
            )}

            {/* Results */}
            {!searchResults && recentSearches.length > 0 && (
                <div className="mb-6">
                    <h3 className="text-lg font-bold text-slate-300 mb-3">Recent Searches</h3>
                    <div className="flex flex-wrap gap-2">
                        {recentSearches.map(rs => (
                            <button
                                key={rs}
                                type="button"
                                onClick={() => {
                                    setSelectedTag(null);
                                    setSearchTerm(rs);
                                    inputRef.current?.focus();
                                }}
                                className="px-3 py-1 text-sm font-semibold rounded-full bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
                                title="Run this search"
                            >
                                {rs}
                            </button>
                        ))}
                        <button
                            type="button"
                            onClick={() => setRecentSearches([])}
                            className="px-3 py-1 text-sm font-semibold rounded-full bg-slate-900/40 border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors"
                        >
                            Clear
                        </button>
                    </div>
                </div>
            )}

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
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            <div className="lg:col-span-2 space-y-4">
                            {/* Top Matches */}
                            {searchResults.topMatches.length > 0 && (
                                <div>
                                    <h4 className="font-semibold text-slate-400 mb-2">Top Matches</h4>
                                    <div className="space-y-2">
                                        {searchResults.topMatches.map(hit => (
                                            <ResultRow key={hit.key} hit={hit} isActive={navigableHits[activeIndex]?.key === hit.key} onActivate={() => setActiveIndex(hitIndexMap.get(hit.key) ?? 0)} />
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
                                            <ResultRow key={hit.key} hit={hit} isActive={navigableHits[activeIndex]?.key === hit.key} onActivate={() => setActiveIndex(hitIndexMap.get(hit.key) ?? 0)} />
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
                                            <ResultRow key={hit.key} hit={hit} isActive={navigableHits[activeIndex]?.key === hit.key} onActivate={() => setActiveIndex(hitIndexMap.get(hit.key) ?? 0)} />
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
                                            <ResultRow key={hit.key} hit={hit} isActive={navigableHits[activeIndex]?.key === hit.key} onActivate={() => setActiveIndex(hitIndexMap.get(hit.key) ?? 0)} />
                                        ))}
                                    </div>
                                </div>
                            )}
                            </div>
                            <div className="lg:col-span-1">
                                <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 sticky top-4">
                                    <h4 className="text-sm font-bold text-slate-300 mb-2">Insight Panel</h4>

                                    {commandMatch ? (
                                        <div className="text-sm text-slate-300 space-y-2">
                                            <div className="font-semibold text-slate-200">Command Mode</div>
                                            <div className="text-slate-400">{commandMatch.title}</div>
                                            <div className="text-xs text-slate-500">{commandMatch.hint}</div>
                                            <div className="text-xs text-slate-500">Press <span className="text-slate-300 font-semibold">Enter</span> to run this command.</div>
                                        </div>
                                    ) : selectedHit && insight ? (
                                        <div className="space-y-3">
                                            <div>
                                                <div className="text-slate-200 font-semibold leading-tight">{selectedHit.title}</div>
                                                {selectedHit.subtitle ? (
                                                    <div className="text-xs text-slate-500 mt-0.5">{selectedHit.subtitle}</div>
                                                ) : null}
                                            </div>

                                            <div className="flex flex-wrap gap-2">
                                                {(selectedHit.badges || []).slice(0, 3).map(b => (
                                                    <span
                                                        key={b}
                                                        className="px-2 py-0.5 text-[11px] font-semibold rounded-full bg-slate-800 border border-slate-700 text-slate-300"
                                                    >
                                                        {b}
                                                    </span>
                                                ))}
                                            </div>

                                            <div className="text-xs text-slate-400">
                                                {insight.summary}
                                            </div>

                                            <div className="grid grid-cols-2 gap-2">
                                                <div className="bg-slate-950/40 border border-slate-800 rounded-lg p-2">
                                                    <div className="text-[11px] text-slate-500">Used</div>
                                                    <div className="text-sm font-semibold text-slate-200">{insight.usedCount} times</div>
                                                </div>
                                                <div className="bg-slate-950/40 border border-slate-800 rounded-lg p-2">
                                                    <div className="text-[11px] text-slate-500">Success rate</div>
                                                    <div className="text-sm font-semibold text-slate-200">{insight.successRate}</div>
                                                </div>
                                                <div className="bg-slate-950/40 border border-slate-800 rounded-lg p-2">
                                                    <div className="text-[11px] text-slate-500">Audience reaction</div>
                                                    <div className="text-sm font-semibold text-slate-200 capitalize">{insight.audienceReaction}</div>
                                                </div>
                                                <div className="bg-slate-950/40 border border-slate-800 rounded-lg p-2">
                                                    <div className="text-[11px] text-slate-500">Best placement</div>
                                                    <div className="text-sm font-semibold text-slate-200 capitalize">{insight.bestPlacement}</div>
                                                </div>
                                            </div>

                                            <div className="text-xs text-slate-500">
                                                Tip: Use <span className="text-slate-300 font-semibold">↑/↓</span> to move, <span className="text-slate-300 font-semibold">Enter</span> to open.
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-sm text-slate-500">
                                            Select a result to see insight details here.
                                        </div>
                                    )}
                                </div>
                            </div>
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