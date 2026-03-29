
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { getSavedIdeas, deleteIdea, updateIdea } from '../services/ideasService';
import { getShows, createShow, updateShow, addTaskToShow } from '../services/showsService';
import type { SavedIdea, Transcription, IdeaType, IdeaCategory, Show, AiSparkAction } from '../types';
import { BookmarkIcon, TrashIcon, ShareIcon, MicrophoneIcon, PrintIcon, FileTextIcon, ImageIcon, PencilIcon, WandIcon, CrossIcon } from './icons';
import ShareButton from './ShareButton';

type MawIdeaV2 = {
    format: string;
    tool?: string;
    timestamp?: number;
    title?: string;
    display?: string;
    structured?: any;
    meta?: any;
    raw?: any;
    content?: any;
    text?: any;
    body?: any;
    result?: any;
};

function decodeHtmlEntities(input: string): string {
    return String(input || '')
        .replace(/&quot;/g, '"')
        .replace(/&#34;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}

function stripMarkdownForTitle(input: string): string {
    return String(input || '')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
}

const METADATA_ONLY_KEYS = new Set([
    'format',
    'tool',
    'timestamp',
    'meta',
    'raw',
    'structured',
    'createdat',
    'updatedat',
    'userid',
    'id',
    'type',
    'category',
    'tags',
    'model',
    'provider',
    'mime',
    'mimetype',
]);

function collectReadableText(value: any, depth = 0): string[] {
    if (value == null || depth > 4) return [];
    if (typeof value === 'string') {
        const cleaned = value.trim();
        return cleaned ? [cleaned] : [];
    }
    if (typeof value === 'number' || typeof value === 'boolean') return [];
    if (Array.isArray(value)) return value.flatMap((item) => collectReadableText(item, depth + 1));
    if (typeof value === 'object') {
        return Object.entries(value).flatMap(([key, val]) => {
            if (METADATA_ONLY_KEYS.has(String(key).toLowerCase())) return [];
            return collectReadableText(val, depth + 1);
        });
    }
    return [];
}

function normalizeDisplayBody(content: string): string {
    const rawText = (content ?? '').toString().trim();
    if (!rawText) return '';

    const text = decodeHtmlEntities(rawText);
    const v2 = tryParseMawIdeaV2(text);
    if (v2) {
        const direct = [v2.display, v2.body, v2.text, v2.content, v2.result]
            .find((value) => typeof value === 'string' && value.trim());
        if (typeof direct === 'string' && direct.trim()) {
            const { rest } = splitLeadingHeading(direct.trim());
            return rest || direct.trim();
        }

        const readable = collectReadableText(v2).filter(Boolean);
        if (readable.length) return Array.from(new Set(readable)).join('\n\n').trim();
    }

    if (text.startsWith('{') || text.startsWith('[')) {
        try {
            const parsed = JSON.parse(text);
            const prioritized = [parsed?.display, parsed?.content, parsed?.text, parsed?.body, parsed?.result, parsed?.response, parsed?.markdown]
                .find((value) => typeof value === 'string' && value.trim());
            if (typeof prioritized === 'string' && prioritized.trim()) {
                const { rest } = splitLeadingHeading(prioritized.trim());
                return rest || prioritized.trim();
            }

            const readable = collectReadableText(parsed).filter(Boolean);
            if (readable.length) return Array.from(new Set(readable)).join('\n\n').trim();
        } catch {
            // leave as legacy plain text
        }
    }

    return text;
}


type CategoryMeta = { label: string; icon: string; searchLabel: string };

const IDEA_CATEGORY_META: Record<IdeaCategory, CategoryMeta> = {
    effect: { label: 'Effects', icon: '🎩', searchLabel: 'effect' },
    script: { label: 'Scripts', icon: '📝', searchLabel: 'script' },
    image: { label: 'Images', icon: '🖼', searchLabel: 'image' },
    blueprint: { label: 'Blueprints', icon: '📐', searchLabel: 'blueprint' },
    research: { label: 'Research', icon: '📚', searchLabel: 'research' },
    rehearsal: { label: 'Rehearsal Insights', icon: '🎤', searchLabel: 'rehearsal' },
};

const IDEA_CATEGORY_ORDER: IdeaCategory[] = ['effect', 'script', 'image', 'blueprint', 'research', 'rehearsal'];

const IDEA_PROMOTABLE_CATEGORIES: IdeaCategory[] = ['effect', 'script', 'blueprint', 'research', 'rehearsal'];
const DEFAULT_SLOT_OPTIONS = ['Opener', 'Middle', 'Closer'];


function getIdeaSourceTool(idea: SavedIdea): string {
    const v2 = tryParseMawIdeaV2(idea.content);
    const candidates = [
        (v2 as any)?.tool,
        (v2 as any)?.meta?.tool,
        (v2 as any)?.structured?.tool,
        (idea as any)?.tool,
        (idea as any)?.sourceTool,
        (idea as any)?.source_tool,
    ];
    const fromPayload = candidates.find((value) => typeof value === 'string' && value.trim());
    if (fromPayload) return fromPayload.trim();

    const title = safeLower(idea.title);
    const content = safeLower(idea.content);
    const tags = (idea.tags || []).map((tag) => safeLower(tag));
    const haystack = [title, content, tags.join(' ')].join(' ');

    if (idea.type === 'rehearsal' || haystack.includes('video rehearsal') || haystack.includes('video analysis')) return 'Video Rehearsal';
    if (haystack.includes('live rehearsal')) return 'Live Rehearsal';
    if (haystack.includes('effect generator')) return 'Effect Generator';
    if (haystack.includes('patter engine')) return 'Patter Engine';
    if (haystack.includes('visual brainstorm')) return 'Visual Brainstorm';
    if (haystack.includes('persona simulator')) return 'Persona Simulator';
    if (haystack.includes('blueprint')) return 'Blueprint Generator';
    if (haystack.includes('director mode')) return 'Director Mode';
    if (haystack.includes('assistant studio')) return 'Assistant Studio';
    if (idea.type === 'image') return 'Visual Brainstorm';
    return 'Saved Notes';
}

function inferIdeaCategory(idea: SavedIdea): IdeaCategory {
    if (idea.category) return idea.category;
    if (idea.type === 'image') return 'image';
    if (idea.type === 'rehearsal') return 'rehearsal';

    const tool = safeLower(getIdeaSourceTool(idea));
    const title = safeLower(idea.title);
    const content = safeLower(idea.content);
    const tags = (idea.tags || []).map((tag) => safeLower(tag));
    const haystack = [tool, title, content, tags.join(' ')].join(' ');

    if (tool.includes('effect generator')) return 'effect';
    if (tool.includes('patter engine')) return 'script';
    if (tool.includes('visual brainstorm')) return 'image';
    if (tool.includes('blueprint')) return 'blueprint';
    if (tool.includes('persona simulator')) return 'research';
    if (tool.includes('video rehearsal') || tool.includes('live rehearsal')) return 'rehearsal';
    if (tool.includes('saved notes')) return 'research';

    if (haystack.includes('blueprint')) return 'blueprint';
    if (haystack.includes('script') || haystack.includes('patter')) return 'script';
    if (haystack.includes('effect') || haystack.includes('routine') || haystack.includes('trick')) return 'effect';
    if (haystack.includes('persona simulator') || haystack.includes('director mode') || haystack.includes('assistant studio') || haystack.includes('research') || haystack.includes('notes')) return 'research';

    return 'research';
}

function getIdeaCategoryMeta(idea: SavedIdea): CategoryMeta {
    return IDEA_CATEGORY_META[inferIdeaCategory(idea)];
}

function buildIdeaPlannerNotes(idea: SavedIdea, extraNotes?: string, slot?: string): string {
    const display = getIdeaDisplay(idea);
    const lines = [
        `Idea Vault source: ${display.title || idea.title || 'Saved Idea'}`,
        `Source tool: ${getIdeaSourceTool(idea)}`,
        `Category: ${getIdeaCategoryMeta(idea).label}`,
        slot ? `Preferred slot: ${slot}` : '',
        idea.tags?.length ? `Tags: ${idea.tags.join(', ')}` : '',
        '',
        extraNotes ? `Routine Notes:
${extraNotes}` : '',
        '',
        'Original Idea:',
        display.body || idea.content || '',
    ].filter(Boolean);
    return lines.join('\n');
}

function buildRoutineShowTags(idea: SavedIdea, category: IdeaCategory, slot?: string): string[] {
    const tags = new Set<string>(['routine', 'idea-vault', category]);
    (idea.tags || []).forEach((tag) => tags.add(tag));
    if (slot) tags.add(`slot:${slot.toLowerCase()}`);
    return Array.from(tags);
}

function ideaIsArchived(idea: SavedIdea): boolean {
    return (idea.tags || []).some((tag) => String(tag).toLowerCase() === 'archived');
}

function tryParseMawIdeaV2(content: string): MawIdeaV2 | null {
    const t = decodeHtmlEntities((content ?? '').toString().trim());
    if (!t || t[0] !== '{') return null;
    try {
        const parsed = JSON.parse(t);
        if (!parsed || typeof parsed !== 'object') return null;
        if (typeof (parsed as any).format !== 'string') return null;
        if (!(parsed as any).format.startsWith('maw.idea.')) return null;
        return parsed as MawIdeaV2;
    } catch {
        return null;
    }
}

function getImageUrlForIdea(idea: SavedIdea): string {
    if (idea.type !== 'image') return idea.content;
    const v2 = tryParseMawIdeaV2(idea.content);
    const url = (v2 as any)?.meta?.imageUrl || (v2 as any)?.structured?.imageUrl || (v2 as any)?.imageUrl;
    if (typeof url === 'string' && url.trim()) return url.trim();
    // Backward compatibility: older image ideas store a direct URL in content.
    return idea.content;
}

function getIdeaDisplay(idea: SavedIdea): { title: string; body: string } {
    if (idea.type === 'image') return { title: idea.title || 'Saved Image', body: '' };

    const v2 = tryParseMawIdeaV2(idea.content);
    const cleanedBody = normalizeDisplayBody(idea.content);

    if (idea.type === 'rehearsal') {
        return { title: idea.title || 'Saved Rehearsal', body: cleanedBody || idea.content || '' };
    }

    if (v2) {
        const displayHeading = typeof v2.display === 'string' ? splitLeadingHeading(v2.display).heading : undefined;
        const structuredLabel = [
            (v2 as any)?.structured?.mostLikelyTrick,
            (v2 as any)?.structured?.effectName,
            (v2 as any)?.structured?.routineName,
            (v2 as any)?.structured?.title,
        ].find((value) => typeof value === 'string' && value.trim());

        let title = (
            displayHeading ||
            structuredLabel ||
            v2.title ||
            idea.title ||
            'Saved Idea'
        ).toString().trim();

        title = stripMarkdownForTitle(title).replace(/^Identify Trick:\s*/i, '');
        if (typeof structuredLabel === 'string' && structuredLabel.trim()) {
            title = structuredLabel.trim();
        }
        if (!title) title = 'Saved Idea';

        return { title, body: cleanedBody };
    }

    const fallbackTitle = stripMarkdownForTitle(idea.title || splitLeadingHeading(cleanedBody || idea.content).heading || 'Saved Note') || 'Saved Note';
    return { title: fallbackTitle, body: cleanedBody || idea.content || '' };
}


function extractOriginalPrompt(idea: SavedIdea): string | null {
    const v2 = tryParseMawIdeaV2(idea.content);
    const candidates = [
        (v2 as any)?.meta?.originalPrompt,
        (v2 as any)?.meta?.prompt,
        (v2 as any)?.structured?.originalPrompt,
        (v2 as any)?.structured?.prompt,
        (idea as any)?.originalPrompt,
        (idea as any)?.prompt,
    ];
    const found = candidates.find((value) => typeof value === 'string' && value.trim());
    return found ? String(found).trim() : null;
}

function getRelatedShowNames(idea: SavedIdea, shows: Show[]): string[] {
    const tags = (idea.tags || []).map((tag) => String(tag));
    const explicit = tags
        .filter((tag) => tag.toLowerCase().startsWith('show:'))
        .map((tag) => tag.slice(5).trim())
        .filter(Boolean);
    const matched = shows
        .filter((show) => (show.tasks || []).some((task) => (task.notes || '').includes(idea.id) || (task.notes || '').includes(getIdeaDisplay(idea).title || '')))
        .map((show) => show.title);
    return Array.from(new Set([...explicit, ...matched]));
}

function getRelatedRoutineNames(idea: SavedIdea, shows: Show[]): string[] {
    const tags = (idea.tags || []).map((tag) => String(tag));
    const explicit = tags
        .filter((tag) => tag.toLowerCase().startsWith('routine:'))
        .map((tag) => tag.slice(8).trim())
        .filter(Boolean);
    const matched = shows.flatMap((show) =>
        (show.tasks || [])
            .filter((task) => (task.notes || '').includes(idea.id) || (task.notes || '').includes(getIdeaDisplay(idea).title || ''))
            .map((task) => task.title)
    );
    return Array.from(new Set([...explicit, ...matched]));
}

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
                    const res = await fetch(getImageUrlForIdea(idea));
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
            text={idea.type === 'text' ? getIdeaDisplay(idea).body : "Check out this visual idea I saved!"}
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

function safeLower(s: any): string {
    return (s ?? '').toString().toLowerCase();
}

function tokenize(s: string): string[] {
    return safeLower(s)
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .filter((t) => t.length > 2)
        .slice(0, 200);
}

function jaccard(a: string[], b: string[]): number {
    if (!a.length || !b.length) return 0;
    const sa = new Set(a);
    const sb = new Set(b);
    let inter = 0;
    sa.forEach((t) => { if (sb.has(t)) inter += 1; });
    const union = sa.size + sb.size - inter;
    return union ? inter / union : 0;
}

function computePriorityScore(idea: SavedIdea, opts: { usedInShows: number; lastOpened?: number; isStarred: boolean; isPinned: boolean }): number {
    // Heuristic score (0..100-ish). Later this can be replaced with true AI scoring.
    const title = idea.title || '';
    const content = idea.content || '';
    const tokens = tokenize(title + ' ' + content);
    const novelty = Math.min(25, new Set(tokens).size / 2); // more unique terms = higher novelty
    const lengthSignal = Math.min(20, Math.sqrt((content || '').length) / 2);
    const usage = Math.min(25, opts.usedInShows * 8);
    const recency = opts.lastOpened ? Math.min(15, 15 / (1 + (Date.now() - opts.lastOpened) / (1000 * 60 * 60 * 24))) : 0;
    const starred = opts.isStarred ? 10 : 0;
    const pinned = opts.isPinned ? 6 : 0;

    // Type-based bias (small)
    const typeBoost = (idea.type === 'blueprint') ? 6 : (idea.type === 'rehearsal' ? 4 : 0);

    return Math.round(novelty + lengthSignal + usage + recency + starred + pinned + typeBoost);
}

type OrgCluster = { key: string; label: string; ideaIds: string[] };
type OrgDuplicate = { a: string; b: string; score: number };
type OrgTagSuggestion = { ideaId: string; suggested: string[] };
type OrgResults = {
    clusters: OrgCluster[];
    duplicates: OrgDuplicate[];
    tagSuggestions: OrgTagSuggestion[];
};

function organizeIdeasLocally(ideas: SavedIdea[], allTags: string[], getUsed: (i: SavedIdea)=>number, lastOpenedMap: Record<string, number>, isStarredFn: (id:string)=>boolean, isPinnedFn:(id:string)=>boolean): OrgResults {
    // Clusters: by strongest tag, else by type, else by top keyword
    const clustersMap = new Map<string, string[]>();

    const keywordOf = (idea: SavedIdea) => {
        const tokens = tokenize((idea.title || '') + ' ' + (idea.content || ''));
        const freq: Record<string, number> = {};
        tokens.forEach((t) => { freq[t] = (freq[t] || 0) + 1; });
        const top = Object.entries(freq).sort((a,b)=>b[1]-a[1])[0]?.[0];
        return top || 'misc';
    };

    ideas.forEach((idea) => {
        const tags = (idea.tags || []) as any[];
        const bestTag = tags?.[0] ? tags[0].toString() : null;
        const key = bestTag ? `tag:${bestTag}` : (idea.type ? `type:${idea.type}` : `kw:${keywordOf(idea)}`);
        const arr = clustersMap.get(key) || [];
        arr.push(idea.id);
        clustersMap.set(key, arr);
    });

    const clusters: OrgCluster[] = Array.from(clustersMap.entries())
        .map(([key, ideaIds]) => {
            const label = key.startsWith('tag:') ? `Theme: ${key.slice(4)}` : key.startsWith('type:') ? `Type: ${key.slice(5)}` : `Theme: ${key.slice(3)}`;
            return { key, label, ideaIds };
        })
        .sort((a,b)=>b.ideaIds.length-a.ideaIds.length);

    // Duplicates: quick scan on title equality + high Jaccard similarity.
    const duplicates: OrgDuplicate[] = [];
    const tokenCache = new Map<string, string[]>();
    const getTokens = (id: string) => {
        if (tokenCache.has(id)) return tokenCache.get(id)!;
        const idea = ideas.find(i=>i.id===id)!;
        const toks = tokenize((idea.title||'') + ' ' + (idea.content||''));
        tokenCache.set(id, toks);
        return toks;
    };

    for (let i=0;i<ideas.length;i++) {
        for (let j=i+1;j<ideas.length;j++) {
            const a = ideas[i], b = ideas[j];
            const at = safeLower(a.title);
            const bt = safeLower(b.title);
            if (at && bt && at === bt) {
                duplicates.push({ a: a.id, b: b.id, score: 1 });
                continue;
            }
            // avoid expensive compare for very different lengths
            const al = (a.content||'').length, bl=(b.content||'').length;
            if (!al || !bl) continue;
            const ratio = al > bl ? bl/al : al/bl;
            if (ratio < 0.5) continue;

            const score = jaccard(getTokens(a.id), getTokens(b.id));
            if (score >= 0.82) duplicates.push({ a: a.id, b: b.id, score: Math.round(score*100)/100 });
            if (duplicates.length >= 12) break;
        }
        if (duplicates.length >= 12) break;
    }

    // Tag suggestions: suggest from top keywords that match known tags OR propose new keyword tags
    const tagSet = new Set(allTags.map(t=>t.toLowerCase()));
    const tagSuggestions: OrgTagSuggestion[] = ideas.slice(0, 40).map((idea) => {
        const toks = tokenize((idea.title||'') + ' ' + (idea.content||''));
        const freq: Record<string, number> = {};
        toks.forEach(t => { freq[t] = (freq[t]||0)+1; });
        const top = Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,6).map(e=>e[0]);
        const suggested = top
            .filter(t => !['with','from','this','that','your'].includes(t))
            .filter(t => !((idea.tags||[]) as any[]).map(x=>x.toString().toLowerCase()).includes(t))
            .slice(0,3)
            .map(t => {
                const match = Array.from(tagSet).find(x=>x===t);
                return match ? match : t;
            });

        // Add priority-score driven suggestions: if high usage, suggest "repertoire"
        const used = getUsed(idea);
        const score = computePriorityScore(idea, { usedInShows: used, lastOpened: lastOpenedMap[idea.id], isStarred: isStarredFn(idea.id), isPinned: isPinnedFn(idea.id) });
        const extra: string[] = [];
        if (score >= 70) extra.push('high-value');
        if (used >= 2) extra.push('repertoire');
        return { ideaId: idea.id, suggested: Array.from(new Set([...extra, ...suggested])).slice(0, 4) };
    }).filter(s => s.suggested.length > 0);

    return { clusters, duplicates, tagSuggestions };
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
    const [shows, setShows] = useState<Show[]>([]);
    const [actionMessage, setActionMessage] = useState<string | null>(null);
    const [actionBusy, setActionBusy] = useState(false);
    const [promoteIdea, setPromoteIdea] = useState<SavedIdea | null>(null);
    const [addToShowIdea, setAddToShowIdea] = useState<SavedIdea | null>(null);
    const [promoteForm, setPromoteForm] = useState({ title: '', estimatedTime: '5', category: 'effect' as IdeaCategory, notes: '' });
    const [addToShowForm, setAddToShowForm] = useState({ showId: '', routineSlot: 'Middle', estimatedTime: '5' });
    const [categoryFilter, setCategoryFilter] = useState<'all' | IdeaCategory>('all');
    const [tagFilter, setTagFilter] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'favorites' | 'recentlyViewed'>('newest');
    const [viewMode, setViewMode] = useState<'grid' | 'compact'>('grid');

    const [smartTab, setSmartTab] = useState<'all' | 'recent' | 'starred' | 'used' | 'unused' | 'ai'>('all');
    const [pinnedIds, setPinnedIds] = useState<string[]>(() => {
        try { return JSON.parse(localStorage.getItem('savedIdeas:pins') || '[]'); } catch { return []; }
    });
    const [starredIds, setStarredIds] = useState<string[]>(() => {
        try { return JSON.parse(localStorage.getItem('savedIdeas:stars') || '[]'); } catch { return []; }
    });
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    

    const resetView = () => {
        setSearchQuery('');
        setTagFilter(null);
        setCategoryFilter('all');
        setSortBy('newest');
        setViewMode('grid');
        setSmartTab('all');
        setSelectedIds([]);
        setSectionOpen({
            effect: true,
            script: true,
            image: false,
            blueprint: false,
            research: false,
            rehearsal: false,
            pinned: true,
            favorites: true,
            archived: false
        });
    };

    const runOrganization = async () => {
        // Always provide instant local organization. If a parent AI handler exists, it can run in parallel.
        setOrgBusy(true);
        setOrgOpen(true);
        try {
            // Notify parent (optional)
            onAiSpark?.({ type: 'organize_saved_ideas', ideas } as any);

            const tags = allTags;
            const results = organizeIdeasLocally(ideas, tags, getUsedInShowsCount, lastOpenedMap, isStarred, isPinned);
            setOrgResults(results);
        } finally {
            setOrgBusy(false);
        }
    };



const [lastOpenedMap, setLastOpenedMap] = useState<Record<string, number>>(() => {
        try { return JSON.parse(localStorage.getItem('savedIdeas:lastOpened') || '{}'); } catch { return {}; }
    });
    const [openIdea, setOpenIdea] = useState<SavedIdea | null>(null);
    const [detailEdit, setDetailEdit] = useState({ isEditing: false, title: '', content: '', tags: '' });

    const [orgOpen, setOrgOpen] = useState(false);
    const [orgBusy, setOrgBusy] = useState(false);
    const [orgResults, setOrgResults] = useState<OrgResults | null>(null);



    useEffect(() => {
        if (!openIdea) return;
        setDetailEdit({
            isEditing: false,
            title: getIdeaDisplay(openIdea).title || openIdea.title || '',
            content: openIdea.type === 'image' ? '' : (getIdeaDisplay(openIdea).body || openIdea.content || ''),
            tags: (openIdea.tags || []).join(', '),
        });
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpenIdea(null);
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [openIdea]);


    const [sectionOpen, setSectionOpen] = useState<Record<string, boolean>>({
        effect: true,
        script: true,
        image: false,
        blueprint: false,
        research: false,
        rehearsal: false,
        pinned: true,
        favorites: true,
        archived: false,
    });

    const expandAllSections = () => {
        setSectionOpen({
            effect: true,
            script: true,
            image: true,
            blueprint: true,
            research: true,
            rehearsal: true,
            pinned: true,
            favorites: true,
            archived: true,
        });
    };

    const collapseAllSections = () => {
        setSectionOpen({
            effect: false,
            script: false,
            image: false,
            blueprint: false,
            research: false,
            rehearsal: false,
            pinned: false,
            favorites: false,
            archived: false,
        });
    };
    const [editingIdeaId, setEditingIdeaId] = useState<string | null>(null);
    const [editText, setEditText] = useState('');
    const [isSavingTags, setIsSavingTags] = useState(false);
    const [tagSaveError, setTagSaveError] = useState<string | null>(null);
    const [lightboxImg, setLightboxImg] = useState<string | null>(null);
    const ideaRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());


    useEffect(() => {
        // FIX: getSavedIdeas() is async, resolve with .then()
        getSavedIdeas().then(setIdeas);
        getShows().then(setShows).catch((error) => console.error('Failed to load shows', error));
    }, []);

    useEffect(() => {
        if (!actionMessage) return;
        const timeout = window.setTimeout(() => setActionMessage(null), 3200);
        return () => window.clearTimeout(timeout);
    }, [actionMessage]);
    useEffect(() => {
        try { localStorage.setItem('savedIdeas:pins', JSON.stringify(pinnedIds)); } catch {}
    }, [pinnedIds]);

    useEffect(() => {
        try { localStorage.setItem('savedIdeas:stars', JSON.stringify(starredIds)); } catch {}
    }, [starredIds]);

    useEffect(() => {
        try { localStorage.setItem('savedIdeas:lastOpened', JSON.stringify(lastOpenedMap)); } catch {}
    }, [lastOpenedMap]);


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

    const isPinned = (id: string) => pinnedIds.includes(id);
    const isStarred = (id: string) => starredIds.includes(id);

    const togglePin = (id: string) => {
        setPinnedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [id, ...prev]));
    };

    const toggleStar = (id: string) => {
        setStarredIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [id, ...prev]));
    };

    const toggleSelected = (id: string) => {
        setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    };

    const clearSelection = () => setSelectedIds([]);

    const markOpenedNow = (id: string) => {
        setLastOpenedMap((prev) => ({ ...prev, [id]: Date.now() }));
    };

    const getUsedInShowsCount = (idea: SavedIdea): number => {
        const anyIdea: any = idea as any;
        const arr = anyIdea.showIds || anyIdea.show_ids || anyIdea.shows || anyIdea.used_in_shows;
        if (Array.isArray(arr)) return arr.length;
        if (typeof arr === 'number') return arr;
        return 0;
    };

    const isAiGenerated = (idea: SavedIdea): boolean => {
        const anyIdea: any = idea as any;
        if (anyIdea.ai_generated || anyIdea.is_ai_generated || anyIdea.source === 'ai') return true;
        const tags = (idea.tags || []).map((t) => (t || '').toLowerCase());
        return tags.includes('ai') || tags.includes('ai-generated') || tags.includes('ai_generated');
    };

    const formatRelative = (ms: number) => {
        const diff = Date.now() - ms;
        const minutes = Math.floor(diff / 60000);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 48) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days < 60) return `${days}d ago`;
        const months = Math.floor(days / 30);
        return `${months}mo ago`;
    };

    const addTagToIdea = async (idea: SavedIdea, tag: string) => {
        const nextTags = Array.from(new Set([...(idea.tags || []), tag]));
        try {
            await updateIdea(idea.id, { tags: nextTags } as any);
            setIdeas((prev) => prev.map((i) => (i.id === idea.id ? { ...i, tags: nextTags } : i)));
        } catch (e) {
            console.error('Failed to update tags', e);
        }
    };

    const archiveIdea = async (idea: SavedIdea) => {
        if (ideaIsArchived(idea)) return;
        await addTagToIdea(idea, 'archived');
        setActionMessage('Idea archived.');
    };

    const bulkArchive = async () => {
        const targets = ideas.filter((i) => selectedIds.includes(i.id));
        for (const idea of targets) {
            // eslint-disable-next-line no-await-in-loop
            await archiveIdea(idea);
        }
        clearSelection();
    };

    const bulkAddTag = async () => {
        const tag = window.prompt('Add tag to selected ideas:', '');
        if (!tag) return;
        const targets = ideas.filter((i) => selectedIds.includes(i.id));
        for (const idea of targets) {
            // eslint-disable-next-line no-await-in-loop
            await addTagToIdea(idea, tag);
        }
        clearSelection();
    };

        const copyIdeaToClipboard = async (idea: SavedIdea) => {
        const d = getIdeaDisplay(idea);
        const text = `# ${d.title || 'Untitled'}\n${d.body || ''}`.trim();
        try { await navigator.clipboard.writeText(text); } catch {}
    };

const bulkDuplicateToClipboard = async () => {
        const targets = ideas.filter((i) => selectedIds.includes(i.id));
        const text = targets
            .map((i) => {
                const d = getIdeaDisplay(i);
                return `# ${d.title || 'Untitled'}\n${d.body || ''}`.trim();
            })
            .join('\n\n---\n\n');
        try { await navigator.clipboard.writeText(text); } catch {}
        clearSelection();
    };

        const openIdeaView = (idea: SavedIdea) => {
        markOpenedNow(idea.id);
        if (idea.type === 'image' && idea.content) {
            setLightboxImg(getImageUrlForIdea(idea));
            return;
        }
        setOpenIdea(idea);
    };

const openPromoteModal = (idea: SavedIdea) => {
        const display = getIdeaDisplay(idea);
        setPromoteIdea(idea);
        setPromoteForm({
            title: display.title || idea.title || 'New Routine',
            estimatedTime: '5',
            category: inferIdeaCategory(idea),
            notes: '',
        });
    };

    const openAddToShowModal = (idea: SavedIdea) => {
        setAddToShowIdea(idea);
        setAddToShowForm({
            showId: shows[0]?.id || '',
            routineSlot: 'Middle',
            estimatedTime: '5',
        });
    };

    const sendToPlanner = (idea: SavedIdea) => {
        openPromoteModal(idea);
    };

    const bulkSendToPlanner = () => {
        const targets = ideas.filter((i) => selectedIds.includes(i.id));
        if (targets[0]) openPromoteModal(targets[0]);
        clearSelection();
    };

    const submitPromoteToRoutine = async () => {
        if (!promoteIdea) return;
        const title = promoteForm.title.trim();
        if (!title) {
            setActionMessage('Routine title is required.');
            return;
        }

        setActionBusy(true);
        try {
            const createdShow = await createShow(title, promoteForm.notes || `Promoted from Idea Vault: ${getIdeaDisplay(promoteIdea).title || promoteIdea.title || 'Saved Idea'}`);
            await updateShow((createdShow as any).id, {
                tags: buildRoutineShowTags(promoteIdea, promoteForm.category),
                status: 'Draft',
                description: promoteForm.notes || `Promoted from Idea Vault on ${new Date().toLocaleDateString()}`
            } as any);
            await addTaskToShow((createdShow as any).id, {
                title,
                notes: buildIdeaPlannerNotes(promoteIdea, promoteForm.notes),
                priority: 'Medium',
                status: 'To-Do',
                durationMinutes: Number(promoteForm.estimatedTime) || 5,
                tags: buildRoutineShowTags(promoteIdea, promoteForm.category),
                createdAt: Date.now(),
            } as any);
            const refreshedShows = await getShows();
            setShows(refreshedShows);
            setPromoteIdea(null);
            setActionMessage(`Routine "${title}" added to Show Planner.`);
            onAiSpark?.({ type: 'idea_promoted_to_routine', ideaId: promoteIdea.id, showTitle: title } as any);
        } catch (error) {
            console.error('Failed to promote idea to routine', error);
            setActionMessage('Could not promote idea to routine.');
        } finally {
            setActionBusy(false);
        }
    };

    const submitAddToShow = async () => {
        if (!addToShowIdea || !addToShowForm.showId) {
            setActionMessage('Select a show first.');
            return;
        }
        const selectedShow = shows.find((show) => show.id === addToShowForm.showId);
        if (!selectedShow) {
            setActionMessage('Selected show could not be found.');
            return;
        }

        setActionBusy(true);
        try {
            const display = getIdeaDisplay(addToShowIdea);
            const slot = addToShowForm.routineSlot;
            const category = inferIdeaCategory(addToShowIdea);
            await addTaskToShow(selectedShow.id, {
                title: `[${slot}] ${display.title || addToShowIdea.title || 'Saved Idea'}`,
                notes: buildIdeaPlannerNotes(addToShowIdea, `Added directly to show "${selectedShow.title}".`, slot),
                priority: 'Medium',
                status: 'To-Do',
                durationMinutes: Number(addToShowForm.estimatedTime) || 5,
                tags: buildRoutineShowTags(addToShowIdea, category, slot),
                createdAt: Date.now(),
            } as any);
            const refreshedShows = await getShows();
            setShows(refreshedShows);
            setAddToShowIdea(null);
            setActionMessage(`Idea added to "${selectedShow.title}".`);
            onAiSpark?.({ type: 'idea_added_to_show', ideaId: addToShowIdea.id, showId: selectedShow.id } as any);
        } catch (error) {
            console.error('Failed to add idea to show', error);
            setActionMessage('Could not add idea to show.');
        } finally {
            setActionBusy(false);
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
                 contentToPrint = `<img src="${getImageUrlForIdea(idea)}" style="max-width: 100%;" />`;
            }
            else {
                const d = getIdeaDisplay(idea);
                contentToPrint = (d.body || '').replace(/\n/g, '<br/>');
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
    
    const saveDetailEdits = async () => {
        if (!openIdea) return;
        setActionBusy(true);
        try {
            const nextTags = detailEdit.tags
                .split(',')
                .map((tag) => tag.trim())
                .filter(Boolean);
            const updates: Partial<SavedIdea> = {
                title: detailEdit.title.trim() || openIdea.title,
                tags: nextTags,
            };
            if (openIdea.type !== 'image') {
                updates.content = detailEdit.content;
            }
            const updated = await updateIdea(openIdea.id, updates as any);
            setIdeas((prev) => prev.map((idea) => (idea.id === openIdea.id ? { ...idea, ...updated } : idea)));
            setOpenIdea((prev) => prev ? { ...prev, ...updated } : prev);
            setDetailEdit((prev) => ({ ...prev, isEditing: false }));
            setActionMessage('Idea details updated.');
        } catch (error) {
            console.error('Failed to save idea details', error);
            setActionMessage('Could not save idea details.');
        } finally {
            setActionBusy(false);
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
            if (ideaIsArchived(idea)) return false;
            const typeMatch = categoryFilter === 'all' || inferIdeaCategory(idea) === categoryFilter;

            const usedCount = getUsedInShowsCount(idea);
            const isRecent = (idea.timestamp || 0) >= (Date.now() - 14 * 24 * 60 * 60 * 1000);
            const tabMatch =
                smartTab === 'all' ? true :
                smartTab === 'recent' ? isRecent :
                smartTab === 'starred' ? isStarred(idea.id) :
                smartTab === 'used' ? usedCount > 0 :
                smartTab === 'unused' ? usedCount === 0 :
                smartTab === 'ai' ? isAiGenerated(idea) :
                true;

            const tagMatch = !tagFilter || (idea.tags || []).includes(tagFilter);
            const display = getIdeaDisplay(idea);
            const sourceTool = getIdeaSourceTool(idea).toLowerCase();
            const searchMatch =
                !q ||
                (display.title || '').toLowerCase().includes(q) ||
                (display.body || '').toLowerCase().includes(q) ||
                sourceTool.includes(q) ||
                (idea.tags || []).some((t) => t.toLowerCase().includes(q));
            return typeMatch && tabMatch && tagMatch && searchMatch;
        });

        const sorted = [...base].sort((a, b) => {
            if (sortBy === 'oldest') {
                return (a.timestamp || 0) - (b.timestamp || 0);
            }
            if (sortBy === 'favorites') {
                const af = isStarred(a.id) ? 1 : 0;
                const bf = isStarred(b.id) ? 1 : 0;
                if (bf !== af) return bf - af;
                return (b.timestamp || 0) - (a.timestamp || 0);
            }
            if (sortBy === 'recentlyViewed') {
                const ao = lastOpenedMap[a.id] || 0;
                const bo = lastOpenedMap[b.id] || 0;
                return bo - ao;
            }
            return (b.timestamp || 0) - (a.timestamp || 0);
        });

        return sorted;
    }, [ideas, categoryFilter, tagFilter, searchQuery, sortBy, smartTab, starredIds, lastOpenedMap]);


    const sections = useMemo(() => {
        const buckets = IDEA_CATEGORY_ORDER.reduce((acc, key) => {
            acc[key] = [] as SavedIdea[];
            return acc;
        }, {} as Record<IdeaCategory, SavedIdea[]>);

        filteredIdeas.forEach((idea) => {
            buckets[inferIdeaCategory(idea)].push(idea);
        });

        return buckets;
    }, [filteredIdeas]);

    const sectionCounts = useMemo(
        () => IDEA_CATEGORY_ORDER.reduce((acc, key) => {
            acc[key] = sections[key]?.length || 0;
            return acc;
        }, {} as Record<IdeaCategory, number>),
        [sections]
    );
    const didInitSectionVisibility = useRef(false);

    useEffect(() => {
        setSectionOpen((prev) => {
            const next = { ...prev };
            IDEA_CATEGORY_ORDER.forEach((key) => {
                if ((sectionCounts[key] || 0) === 0) next[key] = false;
            });

            const firstPopulatedKey = IDEA_CATEGORY_ORDER.find((key) => (sectionCounts[key] || 0) > 0);
            if (!didInitSectionVisibility.current && firstPopulatedKey) {
                IDEA_CATEGORY_ORDER.forEach((key) => {
                    next[key] = false;
                });
                next[firstPopulatedKey] = true;
                didInitSectionVisibility.current = true;
            }
            return next;
        });
    }, [sectionCounts]);


    const pinnedIdeas = useMemo(() => {
        if (!pinnedIds.length) return [];
        const set = new Set(pinnedIds);
        // Keep order: pins first, then remaining
        const pinned = pinnedIds
            .map((id) => filteredIdeas.find((i) => i.id === id))
            .filter(Boolean) as SavedIdea[];
        // If a pinned id is no longer in filteredIdeas, ignore it.
        return pinned;
    }, [pinnedIds, filteredIdeas]);

    const favoriteIdeas = useMemo(() => filteredIdeas.filter((idea) => isStarred(idea.id)), [filteredIdeas, starredIds]);


    const mainSectionGridClass = viewMode === 'compact'
        ? 'grid grid-cols-1 2xl:grid-cols-2 gap-4'
        : 'grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-5';
    const summarySectionGridClass = viewMode === 'compact'
        ? 'grid grid-cols-1 2xl:grid-cols-2 gap-4'
        : 'grid grid-cols-1 xl:grid-cols-2 gap-5';

    const archivedIdeas = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return ideas
            .filter((idea) => ideaIsArchived(idea))
            .filter((idea) => categoryFilter === 'all' || inferIdeaCategory(idea) === categoryFilter)
            .filter((idea) => !tagFilter || (idea.tags || []).includes(tagFilter))
            .filter((idea) => {
                const display = getIdeaDisplay(idea);
                const sourceTool = getIdeaSourceTool(idea).toLowerCase();
                return !q ||
                    (display.title || '').toLowerCase().includes(q) ||
                    (display.body || '').toLowerCase().includes(q) ||
                    sourceTool.includes(q) ||
                    (idea.tags || []).some((t) => t.toLowerCase().includes(q));
            })
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    }, [ideas, categoryFilter, tagFilter, searchQuery]);


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
                className="group relative rounded-xl border border-white/10 bg-white/[0.02] p-4 flex flex-col justify-between col-span-1 md:col-span-2 lg:col-span-3">
                <div className="absolute top-3 left-3 z-10 rounded-full border border-slate-600 bg-slate-950/70 px-2 py-0.5 text-[11px] font-semibold text-slate-200">{getIdeaCategoryMeta(idea).icon} {getIdeaCategoryMeta(idea).label}</div>
                <div className="pt-7">
                    <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-slate-900 rounded-lg flex items-center justify-center flex-shrink-0"><MicrophoneIcon className="w-6 h-6 text-purple-400" /></div>
                            <div>
                                <h3 className="font-bold text-yellow-300 pr-20 overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">{idea.title || 'Untitled Rehearsal'}</h3>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <div className="flex items-center gap-2 mt-1">
                                                    <p className="text-xs leading-5 text-slate-400">{getIdeaSourceTool(idea)} • Used in {getUsedInShowsCount(idea)} shows • Last opened {lastOpenedMap[idea.id] ? formatRelative(lastOpenedMap[idea.id]) : "—"} • Created {formatSavedOn(idea)}</p>
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
                <div className="absolute top-3 right-3 flex items-center gap-1.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    <button onClick={handleRefineRehearsal} className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-slate-700/50 hover:bg-purple-900/50 rounded-full text-slate-300 hover:text-purple-300 transition-colors" aria-label="Refine with AI"><WandIcon className="w-3 h-3" /><span>Refine</span></button>
                    <ShareButton title={`Rehearsal: ${idea.title || 'Untitled Session'}`} text={formattedShareText} className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-slate-700/50 hover:bg-purple-900/50 rounded-full text-slate-300 hover:text-purple-300 transition-colors" aria-label="Share"><ShareIcon className="w-3 h-3" /><span>Share</span></ShareButton>
                    <button onClick={() => handlePrint(idea)} className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-slate-700/50 hover:bg-purple-900/50 rounded-full text-slate-300 hover:text-purple-300 transition-colors" aria-label="Print"><PrintIcon className="w-3 h-3" /></button>
                    <button onClick={() => handleDelete(idea.id)} className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-900/50 rounded-full transition-colors" aria-label="Delete idea"><TrashIcon className="w-4 h-4" /></button>
                </div>
            </div>
        );
    };

    const renderLibraryRow = (idea: SavedIdea) => (
        <div key={idea.id} className={`group flex h-full flex-col rounded-2xl border border-slate-800 bg-slate-950/70 ${viewMode === 'compact' ? 'p-4 min-h-[188px]' : 'p-5 min-h-[220px]'} transition hover:border-purple-400/30 hover:bg-slate-950/85`}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-base">{getIdeaCategoryMeta(idea).icon}</span>
                        <h3 className="text-sm font-semibold text-yellow-200 truncate">{getIdeaDisplay(idea).title || idea.title || 'Saved Idea'}</h3>
                    </div>
                    <div className="mt-1 text-xs text-slate-400">{getIdeaSourceTool(idea)} • {formatSavedOn(idea)}</div>
                </div>
                <button onClick={() => toggleStar(idea.id)} className="shrink-0 px-2.5 py-1 text-xs rounded-full bg-slate-800 text-slate-200 hover:bg-slate-700 transition">
                    {isStarred(idea.id) ? '★ Favorite' : '☆ Favorite'}
                </button>
            </div>
            <p className={`mt-3 text-sm leading-6 text-slate-300 overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] ${viewMode === 'compact' ? '[-webkit-line-clamp:3]' : '[-webkit-line-clamp:4]'}`}>{(getIdeaDisplay(idea).body || idea.content || '').trim()}</p>
            <div className="mt-auto pt-4">
                {idea.tags?.length ? (
                    <div className="mb-3 flex flex-wrap gap-2">
                        {idea.tags.slice(0, viewMode === 'compact' ? 3 : 4).map((tag) => (
                            <span key={tag} className="rounded-full border border-slate-700 bg-slate-900/70 px-2 py-0.5 text-[11px] text-slate-300">{tag}</span>
                        ))}
                    </div>
                ) : null}
                <div className="flex flex-wrap gap-2 border-t border-slate-800/80 pt-3">
                    <button onClick={() => openIdeaView(idea)} className="px-3 py-1.5 text-xs rounded-full bg-slate-800 text-slate-200 hover:bg-slate-700 transition">Open</button>
                    <button onClick={() => openPromoteModal(idea)} className="px-3 py-1.5 text-xs rounded-full bg-purple-900/30 text-purple-100 hover:bg-purple-900/50 transition">Promote</button>
                    <button onClick={() => openAddToShowModal(idea)} className="px-3 py-1.5 text-xs rounded-full bg-blue-900/30 text-blue-100 hover:bg-blue-900/50 transition">Add to Show</button>
                    {!ideaIsArchived(idea) ? <button onClick={() => archiveIdea(idea)} className="px-3 py-1.5 text-xs rounded-full bg-slate-800 text-slate-200 hover:bg-slate-700 transition">Archive</button> : null}
                </div>
            </div>
        </div>
    );

    return (
        <div className="flex-1 overflow-y-auto p-4 md:p-6 animate-fade-in">
            <div className="flex items-center gap-3 mb-4">
                <BookmarkIcon className="w-8 h-8 text-purple-400" />
                <h2 className="text-2xl font-bold text-yellow-400 font-cinzel">My Saved Ideas</h2>
            </div>

            {/* Sticky Filters */}
            <div className="sticky top-0 z-20 -mx-4 md:-mx-6 px-4 md:px-6 py-3 mb-5 bg-slate-950/80 backdrop-blur border-b border-slate-800">
                <div className="rounded-2xl border border-slate-800/90 bg-slate-900/55 p-4 shadow-[0_12px_32px_rgba(15,23,42,0.22)]">
                <div className="flex flex-col xl:flex-row xl:items-center gap-3">
                    <div className="flex-1">
                        <input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search ideas..."
                            className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-md text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-purple-500"
                            aria-label="Search ideas"
                        />
                    </div>

                    
                    <button
                        onClick={runOrganization}
                        className="px-3 py-2 text-xs font-semibold bg-purple-900/30 hover:bg-purple-900/50 border border-purple-500/30 rounded-md text-purple-100 transition flex items-center gap-2"
                        title="Organize and prioritize your ideas"
                    >
                        <WandIcon className={`w-4 h-4${orgResults ? ' ring-1 ring-purple-400/40 hover:ring-purple-300/60' : ''}`} />
                        Organize My Ideas
                    </button>

<button
                        onClick={resetView}
                        className="px-3 py-2 text-xs font-semibold bg-transparent border border-slate-600 hover:border-slate-400 border border-slate-600 rounded-md text-slate-200 transition"
                        title="Reset filters and view"
                    >
                        Reset
                    </button>


                    <div className="flex flex-wrap items-center gap-2 xl:gap-3">
                        <label className="text-xs font-semibold text-slate-400">View:</label>
                        <div className="flex overflow-hidden rounded-md border border-slate-700 bg-slate-900/60">
                            <button
                                type="button"
                                onClick={() => setViewMode('grid')}
                                className={`px-3 py-2 text-xs font-semibold transition ${viewMode === 'grid' ? 'bg-purple-600/30 text-purple-100' : 'text-slate-300 hover:bg-slate-800/70'}`}
                            >
                                Grid
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewMode('compact')}
                                className={`px-3 py-2 text-xs font-semibold transition ${viewMode === 'compact' ? 'bg-purple-600/30 text-purple-100' : 'text-slate-300 hover:bg-slate-800/70'}`}
                            >
                                Compact
                            </button>
                        </div>

                        <label className="text-xs font-semibold text-slate-400">Sort:</label>
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as any)}
                            className="px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-purple-500"
                            aria-label="Sort ideas"
                        >
                            <option value="newest">Newest</option>
                            <option value="oldest">Oldest</option>
                            <option value="favorites">Favorites</option>
                            <option value="recentlyViewed">Recently Viewed</option>
                        </select>

                        
                        <label className="text-xs font-semibold text-slate-400">Filter by tag:</label>
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


                        <div className="flex items-center gap-2 xl:ml-auto w-full xl:w-auto justify-end">
                            <button
                                type="button"
                                onClick={expandAllSections}
                                className="px-3 py-2 text-xs font-semibold bg-slate-900/60 border border-slate-700 rounded-md text-slate-200 transition hover:border-purple-400/40 hover:text-purple-100"
                                title="Open all idea sections"
                            >
                                Expand All
                            </button>
                            <button
                                type="button"
                                onClick={collapseAllSections}
                                className="px-3 py-2 text-xs font-semibold bg-slate-900/60 border border-slate-700 rounded-md text-slate-200 transition hover:border-purple-400/40 hover:text-purple-100"
                                title="Collapse all idea sections"
                            >
                                Compact All
                            </button>
                        </div>
                    </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                    {([
                        { key: 'all', label: 'All', icon: '✨' },
                        ...IDEA_CATEGORY_ORDER.map((key) => ({ key, label: IDEA_CATEGORY_META[key].label, icon: IDEA_CATEGORY_META[key].icon })),
                    ] as const).map((item) => (
                        <button
                            key={item.key}
                            type="button"
                            onClick={() => setCategoryFilter(item.key as 'all' | IdeaCategory)}
                            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                                categoryFilter === item.key
                                    ? 'bg-amber-500/20 border-amber-400/40 text-amber-100'
                                    : 'bg-slate-900/40 border-slate-700 text-slate-300 hover:border-amber-400/30 hover:text-amber-100'
                            }`}
                        >
                            <span className="mr-1.5">{item.icon}</span>
                            {item.label}
                        </button>
                    ))}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                    {([
                        { key: 'all', label: 'All' },
                        { key: 'recent', label: 'Recent' },
                        { key: 'starred', label: 'Favorites' },
                        { key: 'used', label: 'Used in Shows' },
                        { key: 'unused', label: 'Unused' },
                        { key: 'ai', label: 'AI Generated' },
                    ] as const).map((t) => (
                        <button
                            key={t.key}
                            type="button"
                            onClick={() => setSmartTab(t.key)}
                            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                                smartTab === t.key
                                    ? 'bg-purple-600/30 border-purple-400/40 text-purple-200'
                                    : 'bg-slate-900/40 border-slate-700 text-slate-300 hover:border-purple-400/30 hover:text-purple-200'
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* Active filter indicators */}
                {(() => {
                    const items: string[] = [];
                    if (smartTab !== 'all') {
                        const tabLabel: Record<string, string> = {
                            recent: 'Recent',
                            starred: 'Favorites',
                            used: 'Used in Shows',
                            unused: 'Unused',
                            ai: 'AI Generated',
                        };
                        items.push(`Tab=${tabLabel[smartTab] ?? smartTab}`);
                    }
                    if (categoryFilter !== 'all') items.push(`Category=${IDEA_CATEGORY_META[categoryFilter].label}`);
                    if (tagFilter) items.push(`Tag=${tagFilter}`);
                    if (searchQuery.trim()) items.push('Search active');
                    if (!items.length) return null;

                    return (
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-300">
                            <span className="text-slate-400">Filters active:</span>
                            {items.map((s) => (
                                <span key={s} className="px-2 py-0.5 rounded-full bg-slate-900/40 border border-slate-700">
                                    {s}
                                </span>
                            ))}
                        </div>
                    );
                })()}


            </div>
            </div>

            {/* Empty / No Results */}
            {ideas.length === 0 ? (
                <div className="text-center py-16 text-slate-400">
                    <div className="text-3xl mb-2">✨</div>
                    <div className="text-lg font-semibold text-slate-200">No saved ideas yet</div>
                    <div className="text-sm text-slate-400 mt-1">Generate your first idea to begin building your library.</div>
                    <div className="mt-5 flex justify-center">
                        <button
                            type="button"
                            onClick={() => {
                                onAiSpark({
                                    type: 'custom-prompt',
                                    payload: {
                                        prompt: 'Generate a strong, practical magic effect idea I can perform soon. Include: effect description, required props, reset time, and 3 lines of patter. Keep it realistic for a working magician.'
                                    }
                                });
                            }}
                            className="inline-flex items-center gap-2 rounded-xl border border-purple-400/25 bg-purple-500/15 px-4 py-2 text-sm font-semibold text-purple-100 transition hover:bg-purple-500/25 hover:text-white"
                        >
                            <WandIcon className="w-4 h-4" />
                            Spark My First Idea
                        </button>
                    </div>
                </div>
            ) : filteredIdeas.length === 0 ? (
                <div className="text-center py-10 text-slate-400">
                    <div className="text-lg font-semibold text-slate-200">No matches</div>
                    <div className="text-sm text-slate-400 mt-1">Try a different search, tag, or category filter.</div>
                </div>
            ) : (
                
                <div className="space-y-4">
                    {favoriteIdeas.length ? (
                        (() => {
                            const secKey = 'favorites';
                            return (
                                <section className="mb-8">
                                    <button
                                        type="button"
                                        onClick={() => setSectionOpen((prev) => ({ ...prev, [secKey]: !prev[secKey] }))}
                                        className="w-full flex items-center justify-between rounded-2xl border border-yellow-500/20 bg-gradient-to-r from-yellow-500/10 via-slate-900/70 to-slate-950/80 px-5 py-4 text-left hover:border-yellow-400/30 transition"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-10 h-10 rounded-2xl bg-yellow-500/15 border border-yellow-400/20 flex items-center justify-center text-lg">⭐</div>
                                            <div className="min-w-0">
                                                <h2 className="text-lg md:text-xl font-bold text-purple-100">Favorite Ideas</h2>
                                                <p className="text-sm text-slate-400">Quick access to your best working material.</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">{favoriteIdeas.length}</div>
                                            <div className="text-slate-400">{sectionOpen[secKey] ? '▼' : '▶'}</div>
                                        </div>
                                    </button>
                                    {sectionOpen[secKey] ? (
                                        <div className={`mt-4 ${summarySectionGridClass}`}>
                                            {favoriteIdeas.map((idea) => renderLibraryRow(idea))}
                                        </div>
                                    ) : null}
                                </section>
                            );
                        })()
                    ) : null}

                    {pinnedIdeas.length ? (
                        (() => {
                            const secKey = 'pinned';
                            const isOpen = sectionOpen[secKey] ?? true;
                            return (
                                <div key={secKey} className="bg-slate-900/20 border border-slate-800 rounded-xl overflow-hidden mb-10 bg-white/3 backdrop-blur-sm hover:border-indigo-400/20">
                                    <button
                                        type="button"
                                        onClick={() => setSectionOpen((prev) => ({ ...prev, [secKey]: !isOpen }))}
                                        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-800/30 transition-colors"
                                        aria-expanded={isOpen}
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className={`text-slate-300 transition-transform duration-300 ${isOpen ? 'rotate-90' : 'rotate-0'}`}>▼</span>
                                            <div className="font-semibold tracking-tight text-slate-100"><span className="mr-2">📌</span>Pinned</div>
                                            <div className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">{pinnedIdeas.length}</div>
                                        </div>
                                        <span className="text-xs text-slate-400">Collapse</span>
                                    </button>

                                    {isOpen ? (
                                        <div className="p-4">
                                            <div className={mainSectionGridClass}>
                                                {pinnedIdeas.map((idea) => (
                                                    <div key={idea.id}>
                                                        {/* Reuse normal rendering by filtering to this single idea via map below */}
                                                        {(() => {
                                                            // Inline reuse: match existing rendering paths
                                                            if (idea.type === 'image') {
                                                                return (
                                                                    <div
                                                                        key={idea.id}
                                                                        ref={el => { ideaRefs.current.set(idea.id, el); }}
                                                                        onClick={() => openIdeaView(idea)}
                                                                        className="group relative bg-slate-900 border border-slate-700 rounded-xl flex flex-col justify-between overflow-hidden aspect-square transition-all hover:border-purple-500"
                                                                    >
                                                                        <img src={getImageUrlForIdea(idea)} alt={idea.title || 'Saved visual idea'} className="w-full h-full object-cover absolute inset-0 transition-transform duration-300 group-hover:scale-105"/>
                                                                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent"></div>
                                                                        <div className="relative z-10 p-4 flex flex-col justify-end h-full">
                                                                            <div className="flex items-center gap-2">
                                                                                <div className="w-8 h-8 bg-slate-900/70 rounded-lg flex items-center justify-center flex-shrink-0 backdrop-blur-sm"><ImageIcon className="w-5 h-5 text-purple-400" /></div>
                                                                                <div className="min-w-0">
                                                                                    <h3 className="font-bold text-yellow-300 text-sm overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:1]">{idea.title || 'Image Idea'}</h3>
                                                                                    <p className="text-xs text-slate-400 mt-1">{getIdeaSourceTool(idea)} • {formatSavedOn(idea)}</p>
                                                                                </div>
                                                                            </div>
                                                                            {editingIdeaId === idea.id ? <TagEditor idea={idea} /> : <TagDisplay idea={idea} />}
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
                                                                    onClick={() => openIdeaView(idea)}
                                                                    className={`group relative bg-slate-800 border border-slate-700 rounded-xl ${viewMode === 'compact' ? 'p-4 min-h-[250px]' : 'p-5 min-h-[290px]'} flex flex-col transition-all hover:border-purple-500 overflow-hidden`}
                                                                >
                                                                    <div className="absolute top-3 left-3 z-10 rounded-full border border-slate-600 bg-slate-950/70 px-2 py-0.5 text-[11px] font-semibold text-slate-200">{getIdeaCategoryMeta(idea).icon} {getIdeaCategoryMeta(idea).label}</div>
                                                                    <div className="min-w-0 pt-7">
                                                                        <div className="flex items-start justify-between gap-3 mb-2">
                                                                            <div className="flex items-center gap-3 min-w-0">
                                                                                <div className="w-10 h-10 bg-slate-900 rounded-lg flex items-center justify-center flex-shrink-0"><FileTextIcon className="w-6 h-6 text-purple-400" /></div>
                                                                                <div className="min-w-0">
                                                                                    <h3 className="font-bold text-yellow-300 pr-20 overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">{getIdeaDisplay(idea).title}</h3>
                                                                                    <p className="text-xs text-slate-400">{getIdeaSourceTool(idea)} • Used in {getUsedInShowsCount(idea)} shows • Last opened {lastOpenedMap[idea.id] ? formatRelative(lastOpenedMap[idea.id]) : "—"} • Created {formatSavedOn(idea)}</p>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                        <div className="text-sm text-slate-300 overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:4]">{(getIdeaDisplay(idea).body || '').trim()}</div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                            );
                        })()
                    ) : null}

                    {IDEA_CATEGORY_ORDER.map((secKey) => {
                        const sec = {
                            key: secKey,
                            label: IDEA_CATEGORY_META[secKey].label,
                            icon: IDEA_CATEGORY_META[secKey].icon,
                            items: sections[secKey],
                        } as const;
                        const isOpen = sectionOpen[sec.key] ?? (sec.items.length > 0);

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
                                        <div className="font-semibold tracking-tight line-clamp-2 text-purple-100"><span className="mr-2">{sec.icon}</span>{sec.label}</div>
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
                                        {sec.items.length === 0 ? (
                                            <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/40 px-4 py-6 text-sm text-slate-400">No ideas in this section yet.</div>
                                        ) : (
                                        <div className={mainSectionGridClass}>
                                            {sec.items.map((idea) => {
                                                if (idea.type === 'image') {
                                                    return (
                                                        <div key={idea.id} ref={el => { ideaRefs.current.set(idea.id, el); }} onClick={() => openIdeaView(idea)} className="group relative bg-slate-900 border border-slate-700 rounded-xl flex flex-col justify-between overflow-hidden aspect-square transition-all hover:border-purple-500">
                                                            <div className="absolute left-3 top-11 z-20 rounded-full border border-slate-600 bg-slate-950/70 px-2 py-0.5 text-[11px] font-semibold text-slate-200">{getIdeaCategoryMeta(idea).icon} {getIdeaCategoryMeta(idea).label}</div>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => { e.stopPropagation(); toggleSelected(idea.id); }}
                                                                className="absolute top-3 left-3 z-20 w-6 h-6 rounded-md border border-slate-600 bg-black/40 backdrop-blur flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                                                aria-label={selectedIds.includes(idea.id) ? 'Deselect idea' : 'Select idea'}
                                                                title={selectedIds.includes(idea.id) ? 'Deselect' : 'Select'}
                                                            >
                                                                <span className={`text-xs ${selectedIds.includes(idea.id) ? 'text-purple-200' : 'text-slate-400'}`}>{selectedIds.includes(idea.id) ? '✓' : ''}</span>
                                                            </button>

                                                            <img src={getImageUrlForIdea(idea)} alt={idea.title || 'Saved visual idea'} className="w-full h-full object-cover absolute inset-0 transition-transform duration-300 group-hover:scale-105"/>
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
                                                                <div className="mt-3 flex flex-wrap items-center gap-1.5 rounded-xl border border-white/10 bg-black/30 p-2 backdrop-blur-sm">
                                                                <button onClick={(e) => { e.stopPropagation(); openIdeaView(idea); }} className="px-2.5 py-1 text-xs bg-black/40 hover:bg-black/60 rounded-full text-slate-200 transition-colors backdrop-blur-sm" aria-label="Open">Open</button>
                                                                <button onClick={(e) => { e.stopPropagation(); openPromoteModal(idea); }} className="px-2.5 py-1 text-xs bg-purple-900/30 hover:bg-purple-900/50 rounded-full text-purple-100 transition-colors backdrop-blur-sm" aria-label="Promote to Routine">Promote</button>
                                                                <button onClick={(e) => { e.stopPropagation(); openAddToShowModal(idea); }} className="px-2.5 py-1 text-xs bg-blue-900/30 hover:bg-blue-900/50 rounded-full text-blue-100 transition-colors backdrop-blur-sm" aria-label="Add to Show">Add to Show</button>
                                                                <button onClick={(e) => { e.stopPropagation(); copyIdeaToClipboard(idea); }} className="px-2.5 py-1 text-xs bg-black/40 hover:bg-black/60 rounded-full text-slate-200 transition-colors backdrop-blur-sm" aria-label="Copy">Copy</button>
                                                                <button onClick={(e) => { e.stopPropagation(); toggleStar(idea.id); }} className="px-2.5 py-1 text-xs bg-black/40 hover:bg-black/60 rounded-full text-slate-200 transition-colors backdrop-blur-sm" aria-label="Star">
                                                                    {isStarred(idea.id) ? '★ Favorite' : '☆ Favorite'}
                                                                </button>
                                                                <button onClick={(e) => { e.stopPropagation(); togglePin(idea.id); }} className="p-1.5 bg-black/40 text-slate-200 hover:text-purple-200 hover:bg-black/60 rounded-full transition-colors backdrop-blur-sm" aria-label="Pin" title={isPinned(idea.id) ? 'Unpin' : 'Pin'}>
                                                                    <BookmarkIcon className="w-4 h-4" />
                                                                </button>
                                                                <IdeaShareWrapper idea={idea} />
                                                                <button onClick={(e) => { e.stopPropagation(); handleDelete(idea.id); }} className="p-1.5 bg-black/50 text-slate-300 hover:text-red-400 hover:bg-red-900/50 rounded-full transition-colors backdrop-blur-sm" aria-label="Delete idea"><TrashIcon className="w-4 h-4" /></button>
                                                                </div>
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
                                                        onClick={() => openIdeaView(idea)}
                                                        className={`group relative bg-slate-800 border border-slate-700 rounded-xl ${viewMode === 'compact' ? 'p-4 min-h-[250px]' : 'p-5 min-h-[290px]'} flex flex-col transition-all hover:border-purple-500 overflow-hidden`}
                                                    >
                                                        <button
                                                            type="button"
                                                            onClick={(e) => { e.stopPropagation(); toggleSelected(idea.id); }}
                                                            className="absolute top-3 left-3 z-20 w-6 h-6 rounded-md border border-slate-600 bg-slate-950/40 backdrop-blur flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                                            aria-label={selectedIds.includes(idea.id) ? 'Deselect idea' : 'Select idea'}
                                                            title={selectedIds.includes(idea.id) ? 'Deselect' : 'Select'}
                                                        >
                                                            <span className={`text-xs ${selectedIds.includes(idea.id) ? 'text-purple-300' : 'text-slate-500'}`}>{selectedIds.includes(idea.id) ? '✓' : ''}</span>
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={(e) => { e.stopPropagation(); togglePin(idea.id); }}
                                                            className="absolute top-3 left-10 z-20 p-1.5 rounded-full bg-slate-950/40 border border-slate-700 text-slate-300 hover:text-purple-200 hover:border-purple-400/30 opacity-0 group-hover:opacity-100 transition-opacity"
                                                            aria-label={isPinned(idea.id) ? 'Unpin idea' : 'Pin idea'}
                                                            title={isPinned(idea.id) ? 'Unpin' : 'Pin'}
                                                        >
                                                            <BookmarkIcon className="w-4 h-4" />
                                                        </button>

                                                        <div className="min-w-0">
                                                            <div className="flex items-start justify-between gap-3 mb-2">
                                                                <div className="flex items-center gap-3 min-w-0">
                                                                    <div className="w-10 h-10 bg-slate-900 rounded-lg flex items-center justify-center flex-shrink-0"><FileTextIcon className="w-6 h-6 text-purple-400" /></div>
                                                                    <div className="min-w-0">
                                                                        <h3 className="font-bold text-yellow-300 pr-20 overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">{idea.title || splitLeadingHeading(idea.content).heading || 'Saved Note'}</h3>
                                                                        <p className="text-xs leading-5 text-slate-400">{getIdeaSourceTool(idea)} • Used in {getUsedInShowsCount(idea)} shows • Last opened {lastOpenedMap[idea.id] ? formatRelative(lastOpenedMap[idea.id]) : "—"} • Created {formatSavedOn(idea)}</p>
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
                                                                                <div className={`text-slate-400 mt-1 overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] ${viewMode === 'compact' ? '[-webkit-line-clamp:2]' : '[-webkit-line-clamp:3]'}`}>
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
                                                                                <div className={`overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] ${viewMode === 'compact' ? '[-webkit-line-clamp:2]' : '[-webkit-line-clamp:3]'}`}>{cleaned}</div>
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })()}
                                                        </div>

                                                        <div className="mt-auto pt-4">
                                                            {editingIdeaId === idea.id ? <TagEditor idea={idea} /> : <TagDisplay idea={idea} />}

                                                            <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-700/70 pt-3">
                                                            <button onClick={(e) => { e.stopPropagation(); openIdeaView(idea); }} className="px-2.5 py-1 text-xs bg-slate-700/50 hover:bg-slate-700/70 rounded-full text-slate-200 transition-colors" aria-label="Open">Open</button>
                                                            <button onClick={(e) => { e.stopPropagation(); openPromoteModal(idea); }} className="px-2.5 py-1 text-xs bg-purple-900/30 hover:bg-purple-900/50 rounded-full text-purple-100 transition-colors" aria-label="Promote to Routine">Promote</button>
                                                            <button onClick={(e) => { e.stopPropagation(); openAddToShowModal(idea); }} className="px-2.5 py-1 text-xs bg-blue-900/30 hover:bg-blue-900/50 rounded-full text-blue-100 transition-colors" aria-label="Add to Show">Add to Show</button>
                                                            <button onClick={(e) => { e.stopPropagation(); copyIdeaToClipboard(idea); }} className="px-2.5 py-1 text-xs bg-slate-700/50 hover:bg-slate-700/70 rounded-full text-slate-200 transition-colors" aria-label="Copy">Copy</button>
                                                            <button onClick={(e) => { e.stopPropagation(); toggleStar(idea.id); }} className="px-2.5 py-1 text-xs bg-slate-700/50 hover:bg-slate-700/70 rounded-full text-slate-200 transition-colors" aria-label="Star">
                                                                {isStarred(idea.id) ? '★ Favorite' : '☆ Favorite'}
                                                            </button>
                                                            <button onClick={(e) => { e.stopPropagation(); archiveIdea(idea); }} className="px-2.5 py-1 text-xs bg-slate-700/50 hover:bg-slate-700/70 rounded-full text-slate-200 transition-colors" aria-label="Archive">Archive</button>
                                                            <IdeaShareWrapper idea={idea} />
                                                            <button onClick={(e) => { e.stopPropagation(); handlePrint(idea); }} className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-slate-700/50 hover:bg-purple-900/50 rounded-full text-slate-300 hover:text-purple-300 transition-colors" aria-label="Print"><PrintIcon className="w-3 h-3" /></button>
                                                            <button onClick={(e) => { e.stopPropagation(); handleDelete(idea.id); }} className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-900/50 rounded-full transition-colors" aria-label="Delete idea"><TrashIcon className="w-4 h-4" /></button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        )}
                                    </div>
                                ) : null}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Lightbox */}
            {actionMessage ? (
                <div className="fixed top-20 right-4 z-50 rounded-xl border border-purple-500/30 bg-slate-950/95 px-4 py-3 text-sm text-slate-100 shadow-xl backdrop-blur">
                    {actionMessage}
                </div>
            ) : null}

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

            {promoteIdea ? (
                <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" role="dialog" aria-modal="true" onClick={(e)=>{ if(e.target===e.currentTarget && !actionBusy) setPromoteIdea(null); }}>
                    <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-950/95 p-6 shadow-2xl">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h3 className="text-xl font-bold text-yellow-300">Promote to Routine</h3>
                                <p className="mt-1 text-sm text-slate-400">Create a Show Planner routine directly from this saved idea.</p>
                            </div>
                            <button onClick={() => !actionBusy && setPromoteIdea(null)} className="p-2 rounded-full bg-slate-900/60 text-slate-200 hover:text-white hover:bg-slate-900/80 transition" aria-label="Close">
                                <CrossIcon className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                            <label className="space-y-2">
                                <span className="text-sm text-slate-300">Routine Title</span>
                                <input value={promoteForm.title} onChange={(e)=>setPromoteForm((prev)=>({ ...prev, title: e.target.value }))} className="w-full rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none focus:border-purple-500" />
                            </label>
                            <label className="space-y-2">
                                <span className="text-sm text-slate-300">Estimated Time (minutes)</span>
                                <input value={promoteForm.estimatedTime} onChange={(e)=>setPromoteForm((prev)=>({ ...prev, estimatedTime: e.target.value }))} type="number" min="1" className="w-full rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none focus:border-purple-500" />
                            </label>
                            <label className="space-y-2 md:col-span-2">
                                <span className="text-sm text-slate-300">Category</span>
                                <select value={promoteForm.category} onChange={(e)=>setPromoteForm((prev)=>({ ...prev, category: e.target.value as IdeaCategory }))} className="w-full rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none focus:border-purple-500">
                                    {IDEA_PROMOTABLE_CATEGORIES.map((category) => (
                                        <option key={category} value={category}>{IDEA_CATEGORY_META[category].label}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="space-y-2 md:col-span-2">
                                <span className="text-sm text-slate-300">Notes</span>
                                <textarea value={promoteForm.notes} onChange={(e)=>setPromoteForm((prev)=>({ ...prev, notes: e.target.value }))} rows={6} className="w-full rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none focus:border-purple-500" placeholder="Add notes for the new routine card in Show Planner." />
                            </label>
                        </div>
                        <div className="mt-6 flex items-center justify-end gap-3">
                            <button onClick={() => setPromoteIdea(null)} className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-500 transition">Cancel</button>
                            <button onClick={submitPromoteToRoutine} disabled={actionBusy} className="px-4 py-2 rounded-xl bg-purple-600 text-white hover:bg-purple-500 disabled:opacity-60 transition">{actionBusy ? 'Creating…' : 'Create Routine'}</button>
                        </div>
                    </div>
                </div>
            ) : null}

            {addToShowIdea ? (
                <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" role="dialog" aria-modal="true" onClick={(e)=>{ if(e.target===e.currentTarget && !actionBusy) setAddToShowIdea(null); }}>
                    <div className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-950/95 p-6 shadow-2xl">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h3 className="text-xl font-bold text-yellow-300">Add to Show</h3>
                                <p className="mt-1 text-sm text-slate-400">Drop this idea directly into an existing show plan.</p>
                            </div>
                            <button onClick={() => !actionBusy && setAddToShowIdea(null)} className="p-2 rounded-full bg-slate-900/60 text-slate-200 hover:text-white hover:bg-slate-900/80 transition" aria-label="Close">
                                <CrossIcon className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="mt-5 space-y-4">
                            <label className="space-y-2 block">
                                <span className="text-sm text-slate-300">Select Show</span>
                                <select value={addToShowForm.showId} onChange={(e)=>setAddToShowForm((prev)=>({ ...prev, showId: e.target.value }))} className="w-full rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none focus:border-blue-500">
                                    <option value="">Select a show…</option>
                                    {shows.map((show) => (
                                        <option key={show.id} value={show.id}>{show.title}</option>
                                    ))}
                                </select>
                            </label>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <label className="space-y-2">
                                    <span className="text-sm text-slate-300">Routine Slot</span>
                                    <select value={addToShowForm.routineSlot} onChange={(e)=>setAddToShowForm((prev)=>({ ...prev, routineSlot: e.target.value }))} className="w-full rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none focus:border-blue-500">
                                        {DEFAULT_SLOT_OPTIONS.map((slot) => (
                                            <option key={slot} value={slot}>{slot}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className="space-y-2">
                                    <span className="text-sm text-slate-300">Estimated Time (minutes)</span>
                                    <input value={addToShowForm.estimatedTime} onChange={(e)=>setAddToShowForm((prev)=>({ ...prev, estimatedTime: e.target.value }))} type="number" min="1" className="w-full rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none focus:border-blue-500" />
                                </label>
                            </div>
                            {!shows.length ? <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">Create a show in Show Planner first, then return here to add the idea.</div> : null}
                        </div>
                        <div className="mt-6 flex items-center justify-end gap-3">
                            <button onClick={() => setAddToShowIdea(null)} className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-500 transition">Cancel</button>
                            <button onClick={submitAddToShow} disabled={actionBusy || !shows.length} className="px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-60 transition">{actionBusy ? 'Adding…' : 'Add to Show'}</button>
                        </div>
                    </div>
                </div>
            ) : null}

            {archivedIdeas.length ? (
                <section className="mb-8">
                    <button
                        type="button"
                        onClick={() => setSectionOpen((prev) => ({ ...prev, archived: !prev.archived }))}
                        className="w-full flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/70 px-5 py-4 text-left hover:border-slate-700 transition"
                    >
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-lg">🗃️</div>
                            <div className="min-w-0">
                                <h2 className="text-lg md:text-xl font-semibold text-purple-100">Archived Ideas</h2>
                                <p className="text-sm text-slate-400">Older ideas moved out of the main creative workflow.</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">{archivedIdeas.length}</div>
                            <div className="text-slate-400">{sectionOpen.archived ? '▼' : '▶'}</div>
                        </div>
                    </button>
                    {sectionOpen.archived ? (
                        <div className={`mt-4 ${summarySectionGridClass} opacity-90`}>
                            {archivedIdeas.map((idea) => renderLibraryRow(idea))}
                        </div>
                    ) : null}
                </section>
            ) : null}

            {/* Open Idea Modal */}
            {openIdea ? (
                <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center p-4 pt-6 overflow-y-auto" onClick={(e)=>{ if(e.target===e.currentTarget) setOpenIdea(null); }} role="dialog" aria-modal="true">
                    <div className="w-full max-w-4xl mt-2 bg-slate-950/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl backdrop-blur">
                        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-800">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-lg">{getIdeaCategoryMeta(openIdea).icon}</span>
                                    <h3 className="text-lg font-bold text-yellow-300 truncate">{getIdeaDisplay(openIdea).title || 'Saved Idea'}</h3>
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-200">{getIdeaSourceTool(openIdea)}</span>
                                    {isStarred(openIdea.id) ? (
                                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-600/20 border border-yellow-500/30 text-yellow-200">Favorite</span>
                                    ) : null}
                                </div>
                                <div className="text-xs text-slate-400 mt-1">
                                    Created {formatSavedOn(openIdea)} • Last opened {lastOpenedMap[openIdea.id] ? formatRelative(lastOpenedMap[openIdea.id]) : '—'}
                                </div>
                            </div>

                            <div className="flex items-center gap-2 flex-wrap justify-end">
                                <button onClick={() => setDetailEdit((prev) => ({ ...prev, isEditing: !prev.isEditing }))} className="px-3 py-1.5 text-xs rounded-full bg-slate-800/60 border border-slate-700 text-slate-200 hover:border-slate-500 transition">
                                    {detailEdit.isEditing ? 'Cancel Edit' : 'Edit'}
                                </button>
                                <button onClick={() => toggleStar(openIdea.id)} className="px-3 py-1.5 text-xs rounded-full bg-slate-800/60 border border-slate-700 text-slate-200 hover:border-yellow-400/30 hover:text-yellow-200 transition">
                                    {isStarred(openIdea.id) ? 'Remove Favorite' : 'Favorite'}
                                </button>
                                <button onClick={() => openPromoteModal(openIdea)} className="px-3 py-1.5 text-xs rounded-full bg-purple-900/30 border border-purple-500/30 text-purple-100 hover:bg-purple-900/50 transition">
                                    Promote → Routine
                                </button>
                                <button onClick={() => openAddToShowModal(openIdea)} className="px-3 py-1.5 text-xs rounded-full bg-blue-900/30 border border-blue-500/30 text-blue-100 hover:bg-blue-900/50 transition">
                                    Add to Show
                                </button>
                                {!ideaIsArchived(openIdea) ? (
                                    <button onClick={() => archiveIdea(openIdea)} className="px-3 py-1.5 text-xs rounded-full bg-slate-800/60 border border-slate-700 text-slate-200 hover:border-slate-500 transition">
                                        Archive
                                    </button>
                                ) : null}
                                <button onClick={() => setOpenIdea(null)} className="p-2 rounded-full bg-slate-900/60 text-slate-200 hover:text-white hover:bg-slate-900/80 transition" aria-label="Close">
                                    <CrossIcon className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        <div className="p-5 max-h-[72vh] overflow-y-auto space-y-5">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                                    <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">Idea Details</div>
                                    <div className="space-y-2 text-sm text-slate-300">
                                        <div><span className="text-slate-500">Title:</span> {getIdeaDisplay(openIdea).title || 'Saved Idea'}</div>
                                        <div><span className="text-slate-500">Source Tool:</span> {getIdeaSourceTool(openIdea)}</div>
                                        <div><span className="text-slate-500">Creation Date:</span> {formatSavedOn(openIdea)}</div>
                                        <div><span className="text-slate-500">Related Show:</span> {getRelatedShowNames(openIdea, shows).join(', ') || '—'}</div>
                                        <div><span className="text-slate-500">Related Routine:</span> {getRelatedRoutineNames(openIdea, shows).join(', ') || '—'}</div>
                                    </div>
                                </div>
                                <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                                    <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">Tags</div>
                                    <div className="flex flex-wrap gap-2">
                                        {(openIdea.tags || []).length ? (openIdea.tags || []).map((tag) => (
                                            <span key={tag} className="rounded-full border border-slate-700 bg-slate-900/70 px-2 py-0.5 text-[11px] text-slate-300">{tag}</span>
                                        )) : <span className="text-sm text-slate-500">No tags yet</span>}
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
                                <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">Full Content</div>
                                {detailEdit.isEditing && openIdea.type !== 'image' ? (
                                    <textarea
                                        value={detailEdit.content}
                                        onChange={(e) => setDetailEdit((prev) => ({ ...prev, content: e.target.value }))}
                                        className="w-full min-h-[220px] rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-slate-200 focus:outline-none focus:border-purple-500"
                                    />
                                ) : openIdea.type === 'image' ? (
                                    <img src={getImageUrlForIdea(openIdea)} alt={openIdea.title || 'Saved image'} className="w-full rounded-xl border border-slate-800" />
                                ) : (
                                    <div className="text-sm text-slate-200 whitespace-pre-wrap break-words">{getIdeaDisplay(openIdea).body || openIdea.content}</div>
                                )}
                            </div>

                            <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
                                <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">Original Prompt</div>
                                <div className="text-sm text-slate-300 whitespace-pre-wrap">{extractOriginalPrompt(openIdea) || 'No original prompt stored for this item.'}</div>
                            </div>

                            {detailEdit.isEditing ? (
                                <div className="rounded-2xl border border-purple-500/20 bg-purple-950/10 p-4 space-y-3">
                                    <div className="text-xs uppercase tracking-wide text-purple-300">Edit Idea</div>
                                    <input
                                        value={detailEdit.title}
                                        onChange={(e) => setDetailEdit((prev) => ({ ...prev, title: e.target.value }))}
                                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500"
                                        placeholder="Idea title"
                                    />
                                    <input
                                        value={detailEdit.tags}
                                        onChange={(e) => setDetailEdit((prev) => ({ ...prev, tags: e.target.value }))}
                                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500"
                                        placeholder="Tags separated by commas"
                                    />
                                    <div className="flex justify-end gap-3">
                                        <button onClick={() => setDetailEdit((prev) => ({ ...prev, isEditing: false }))} className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-500 transition">Cancel</button>
                                        <button onClick={saveDetailEdits} disabled={actionBusy} className="px-4 py-2 rounded-xl bg-purple-600 text-white hover:bg-purple-500 disabled:opacity-60 transition">{actionBusy ? 'Saving…' : 'Save Changes'}</button>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            ) : null}


            {/* AI Organization Assistant */}
            {orgOpen ? (
                <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center p-4 pt-6 overflow-y-auto" role="dialog" aria-modal="true"
                    onClick={(e) => { if (e.target === e.currentTarget) setOrgOpen(false); }}
                >
                    <div className="w-full max-w-4xl mt-2 bg-slate-950/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl backdrop-blur">
                        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-800">
                            <div className="min-w-0">
                                <h3 className="text-lg font-bold text-yellow-300 truncate">AI Organization Assistant</h3>
                                <div className="text-xs text-slate-400 mt-1">
                                    Clusters • Tag suggestions • Duplicate detection • Priority scoring (heuristic now; AI-ready next)
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => { setOrgResults(null); runOrganization(); }}
                                    className="px-3 py-1.5 text-xs rounded-full bg-purple-900/30 border border-purple-500/30 text-purple-100 hover:bg-purple-900/50 transition"
                                >
                                    Re-run
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setOrgOpen(false)}
                                    className="p-2 rounded-full bg-slate-900/60 text-slate-200 hover:text-white hover:bg-slate-900/80 transition"
                                    aria-label="Close"
                                >
                                    <CrossIcon className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        <div className="p-5 space-y-5">
                            {orgBusy ? (
                                <div className="text-sm text-slate-200 flex items-center gap-3">
                                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-slate-600 border-t-slate-200" />
                                    Organizing your ideas…
                                </div>
                            ) : null}

                            {!orgBusy && !orgResults ? (
                                <div className="text-sm text-slate-300">
                                    Click <span className="text-purple-200 font-semibold">Re-run</span> to generate organization suggestions.
                                </div>
                            ) : null}

                            {orgResults ? (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                    <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
                                        <div className="text-sm font-bold text-slate-100 mb-2">Clusters (themes)</div>
                                        <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                                            {orgResults.clusters.slice(0, 10).map((c) => (
                                                <div key={c.key} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-slate-950/40 border border-slate-800">
                                                    <div className="text-sm text-slate-200">{c.label}</div>
                                                    <div className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">{c.ideaIds.length}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
                                        <div className="text-sm font-bold text-slate-100 mb-2">Potential duplicates</div>
                                        {orgResults.duplicates.length ? (
                                            <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                                                {orgResults.duplicates.map((d, i) => {
                                                    const a = ideas.find(x=>x.id===d.a);
                                                    const b = ideas.find(x=>x.id===d.b);
                                                    return (
                                                        <div key={i} className="px-3 py-2 rounded-lg bg-slate-950/40 border border-slate-800">
                                                            <div className="text-sm text-slate-200 truncate">{a?.title || 'Idea A'} <span className="text-slate-500">↔</span> {b?.title || 'Idea B'}</div>
                                                            <div className="text-xs text-slate-400 mt-0.5">Similarity: {d.score}</div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="text-sm text-slate-400">No strong duplicates detected.</div>
                                        )}
                                    </div>

                                    <div className="lg:col-span-2 bg-slate-900/40 border border-slate-800 rounded-xl p-4">
                                        <div className="text-sm font-bold text-slate-100 mb-2">Tag suggestions</div>
                                        <div className="text-xs text-slate-400 mb-3">
                                            (Preview only) Next step: one-click “Apply tags” per idea once we confirm your tag-save API behavior.
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[420px] overflow-y-auto pr-1">
                                            {orgResults.tagSuggestions.slice(0, 20).map((s) => {
                                                const idea = ideas.find(i=>i.id===s.ideaId);
                                                if (!idea) return null;
                                                return (
                                                    <div key={s.ideaId} className="px-3 py-2 rounded-lg bg-slate-950/40 border border-slate-800">
                                                        <div className="text-sm text-slate-200 truncate">{idea.title || 'Saved Idea'}</div>
                                                        <div className="mt-1 flex flex-wrap gap-1">
                                                            {s.suggested.map((t) => (
                                                                <span key={t} className="text-[10px] px-2 py-[2px] rounded-full bg-purple-900/20 border border-purple-500/20 text-purple-200">
                                                                    {t}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            ) : null}

            {/* Bulk Actions Bar */}
            {selectedIds.length ? (
                <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 px-4 py-3 rounded-2xl bg-slate-950/90 border border-slate-800 shadow-xl backdrop-blur flex flex-wrap items-center gap-2">
                    <div className="text-sm text-slate-200 font-semibold mr-2">{selectedIds.length} selected</div>
                    <button onClick={bulkSendToPlanner} className="px-3 py-1.5 text-xs rounded-full bg-purple-900/30 border border-purple-500/30 text-purple-100 hover:bg-purple-900/50 transition">Promote → Routine</button>
                    <button onClick={bulkDuplicateToClipboard} className="px-3 py-1.5 text-xs rounded-full bg-slate-800/60 border border-slate-700 text-slate-200 hover:border-slate-500 transition">Copy</button>
                    <button onClick={bulkAddTag} className="px-3 py-1.5 text-xs rounded-full bg-slate-800/60 border border-slate-700 text-slate-200 hover:border-slate-500 transition">Tag</button>
                    <button onClick={bulkArchive} className="px-3 py-1.5 text-xs rounded-full bg-slate-800/60 border border-slate-700 text-slate-200 hover:border-slate-500 transition">Archive</button>
<button onClick={clearSelection} className="px-3 py-1.5 text-xs rounded-full bg-slate-900/60 border border-slate-700 text-slate-300 hover:border-slate-500 transition">Clear</button>
                </div>
            ) : null}

        </div>
    );
};

export default SavedIdeas;
