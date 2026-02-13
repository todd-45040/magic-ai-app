import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Client, MagicianView, SavedIdea, Show, Task } from '../types';
import { SearchIcon, TagIcon, ChecklistIcon, BookmarkIcon, StageCurtainsIcon } from './icons';
import { useAppDispatch, useAppState } from '../store';
import * as showsService from '../services/showsService';
import * as ideasService from '../services/ideasService';
import * as clientsService from '../services/clientsService';

type SearchScope = 'all' | 'shows' | 'clients' | 'ideas' | 'tasks' | 'files';
type BadgeType = 'Exact Match' | 'Related' | 'Suggested' | 'Recent';

type HitType = 'show' | 'task' | 'idea' | 'client' | 'file' | 'command';

type SearchHit = {
  key: string;
  type: HitType;
  title: string;
  subtitle?: string;
  tags?: string[];
  icon: React.FC<any>;
  score: number;
  badges: BadgeType[];
  showId?: string;
  taskId?: string;
  ideaId?: string;
  clientId?: string;
  commandKey?: string;
  commandHint?: string;
};

interface GlobalSearchProps {
  /** Back-compat; store is source of truth */
  shows?: Show[];
  ideas?: SavedIdea[];
  onNavigate: (view: MagicianView, id: string, secondaryId?: string) => void;
}

type PlannerModalState =
  | { open: false }
  | { open: true; hit: SearchHit; targets: { id: string; title: string }[]; selectedShowId: string };

const RECENTS_KEY = 'mai_recent_searches_v1';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function normalizeString(s?: string) {
  return (s || '').toLowerCase();
}

function highlightText(text: string, needle: string) {
  const t = text || '';
  const n = (needle || '').trim();
  if (!n) return <>{t}</>;

  const idx = t.toLowerCase().indexOf(n.toLowerCase());
  if (idx < 0) return <>{t}</>;
  const before = t.slice(0, idx);
  const match = t.slice(idx, idx + n.length);
  const after = t.slice(idx + n.length);
  return (
    <>
      {before}
      <span className="font-semibold text-white">{match}</span>
      {after}
    </>
  );
}

const GlobalSearch: React.FC<GlobalSearchProps> = ({ shows: showsProp, ideas: ideasProp, onNavigate }) => {
  const state = useAppState();
  const dispatch = useAppDispatch();

  const shows = (showsProp && showsProp.length ? showsProp : state.shows) ?? [];
  const ideas = (ideasProp && ideasProp.length ? ideasProp : state.ideas) ?? [];
  const clients = state.clients ?? [];

  const [activeScope, setActiveScope] = useState<SearchScope>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [notice, setNotice] = useState<string | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [plannerModal, setPlannerModal] = useState<PlannerModalState>({ open: false });

  const inputRef = useRef<HTMLInputElement | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);

  const scopeMeta: Record<SearchScope, { label: string; disabled?: boolean }> = {
    all: { label: 'All' },
    shows: { label: 'Shows' },
    clients: { label: 'Clients' },
    ideas: { label: 'Ideas' },
    tasks: { label: 'Tasks' },
    files: { label: 'Files', disabled: true },
  };

  const scopeOrder: SearchScope[] = ['all', 'shows', 'clients', 'ideas', 'tasks', 'files'];

  // --- Persistence: recent searches ---
  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENTS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setRecentSearches(parsed.filter(Boolean).slice(0, 8));
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(RECENTS_KEY, JSON.stringify(recentSearches.slice(0, 8)));
    } catch {
      // ignore
    }
  }, [recentSearches]);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 2600);
    return () => window.clearTimeout(t);
  }, [notice]);

  // --- Derived ---
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    shows.forEach((s) => {
      s.tags?.forEach((t) => tags.add(t));
      s.tasks?.forEach((tk) => tk.tags?.forEach((t) => tags.add(t)));
    });
    ideas.forEach((i) => i.tags?.forEach((t) => tags.add(t)));
    // Clients in this build don't have tags guaranteed, but keep it flexible
    clients.forEach((c) => (c as any)?.tags?.forEach?.((t: string) => tags.add(t)));
    return Array.from(tags).sort((a, b) => a.localeCompare(b));
  }, [shows, ideas, clients]);

  const counts = useMemo(() => {
    const taskCount = shows.reduce((acc, s) => acc + (s.tasks?.length || 0), 0);
    return {
      shows: shows.length,
      tasks: taskCount,
      ideas: ideas.length,
      clients: clients.length,
      total: shows.length + taskCount + ideas.length + clients.length,
    };
  }, [shows, ideas, clients]);

  const query = useMemo(() => (selectedTag || searchTerm).trim(), [selectedTag, searchTerm]);
  const queryLower = useMemo(() => query.toLowerCase(), [query]);

  const semanticContext = useMemo(() => {
    // Lightweight semantic mapping (no extra AI calls)
    const q = queryLower;
    if (!q || selectedTag) return { intents: [] as string[], expandedTerms: [] as string[] };

    const hasAny = (arr: string[]) => arr.some((w) => q.includes(w));

    const intents: string[] = [];
    const push = (s: string) => {
      if (!intents.includes(s)) intents.push(s);
    };

    if (hasAny(['funny', 'comedy', 'humor', 'humorous', 'laugh', 'laughs', 'silly', 'goofy'])) push('comedy');
    if (hasAny(['kid', 'kids', 'child', 'children', 'family', 'parents'])) push('family');
    if (hasAny(['interactive', 'participation', 'volunteer', 'audience', 'crowd'])) push('interactive');
    if (hasAny(['corporate', 'business', 'company', 'executive', 'gala'])) push('corporate');
    if (hasAny(['festival', 'fair', 'stage', 'theater', 'theatre'])) push('stage');
    if (hasAny(['close-up', 'closeup', 'strolling', 'walkaround', 'walk-around'])) push('closeup');
    if (hasAny(['mind', 'mental', 'prediction', 'psychological', 'mentalism'])) push('mentalism');

    const intentToTerms: Record<string, string[]> = {
      comedy: ['comedy', 'funny', 'humor', 'laugh'],
      family: ['family', 'kids', 'children', 'parents'],
      interactive: ['interactive', 'participation', 'audience', 'volunteer'],
      corporate: ['corporate', 'business', 'executive'],
      stage: ['stage', 'theater', 'festival', 'fair'],
      closeup: ['close-up', 'strolling', 'walkaround'],
      mentalism: ['mentalism', 'mind-reading', 'prediction', 'psychological'],
    };

    const tokens = q.split(/\s+/).filter(Boolean);
    const expandedTerms = Array.from(new Set([...tokens, ...intents.flatMap((i) => intentToTerms[i] || [])]));

    return { intents, expandedTerms };
  }, [queryLower, selectedTag]);

  // --- Command mode ---
  const commandMatch = useMemo(() => {
    const raw = searchTerm.trim();
    const q = raw.toLowerCase();
    if (!q || selectedTag) return null as null | { key: string; title: string; hint: string; payload?: string };

    const stripPrefix = (p: string) => raw.slice(p.length).trim();

    if (q.startsWith('add show')) return { key: 'add_show', title: 'Add Show', hint: 'Creates a new show and opens it in Show Planner.', payload: stripPrefix('add show') };
    if (q.startsWith('new show')) return { key: 'add_show', title: 'Add Show', hint: 'Creates a new show and opens it in Show Planner.', payload: stripPrefix('new show') };
    if (q.startsWith('create show')) return { key: 'add_show', title: 'Add Show', hint: 'Creates a new show and opens it in Show Planner.', payload: stripPrefix('create show') };

    if (q.startsWith('new client')) return { key: 'new_client', title: 'New Client', hint: 'Creates a new client and opens Client Management.', payload: stripPrefix('new client') };
    if (q.startsWith('add client')) return { key: 'new_client', title: 'New Client', hint: 'Creates a new client and opens Client Management.', payload: stripPrefix('add client') };
    if (q.startsWith('create client')) return { key: 'new_client', title: 'New Client', hint: 'Creates a new client and opens Client Management.', payload: stripPrefix('create client') };

    if (q.startsWith('create routine')) return { key: 'create_routine', title: 'Create Routine', hint: 'Saves a new idea and opens Saved Ideas.', payload: stripPrefix('create routine') };
    if (q.startsWith('new routine')) return { key: 'create_routine', title: 'Create Routine', hint: 'Saves a new idea and opens Saved Ideas.', payload: stripPrefix('new routine') };
    if (q.startsWith('add routine')) return { key: 'create_routine', title: 'Create Routine', hint: 'Saves a new idea and opens Saved Ideas.', payload: stripPrefix('add routine') };

    if (q.startsWith('plan show')) return { key: 'plan_show', title: 'Plan Show', hint: 'Opens Show Planner.', payload: stripPrefix('plan show') };

    return null;
  }, [searchTerm, selectedTag]);

  const refreshAll = async () => {
    const [freshShows, freshIdeas] = await Promise.all([showsService.getShows(), ideasService.getSavedIdeas()]);
    dispatch({ type: 'SET_SHOWS', payload: freshShows });
    dispatch({ type: 'SET_IDEAS', payload: freshIdeas });
    // Clients are localStorage-backed
    dispatch({ type: 'SET_CLIENTS', payload: clientsService.getClients() });
    return { freshShows, freshIdeas };
  };

  const executeCommand = async (cmd: { key: string; title: string; hint: string; payload?: string }) => {
    try {
      if (cmd.key === 'add_show') {
        const title = (cmd.payload || '').trim() || 'New Show';
        const newShow = await showsService.createShow({ title, description: '' });
        await refreshAll();
        onNavigate('show-planner', newShow.id);
        setNotice(`Created show: ${title}`);
        return;
      }

      if (cmd.key === 'plan_show') {
        // Open most recent show if we have one; otherwise, create one.
        if (shows.length > 0) {
          onNavigate('show-planner', shows[0].id);
          setNotice('Opened Show Planner.');
        } else {
          const newShow = await showsService.createShow({ title: 'New Show', description: '' });
          await refreshAll();
          onNavigate('show-planner', newShow.id);
          setNotice('Created and opened your first show.');
        }
        return;
      }

      if (cmd.key === 'new_client') {
        const name = (cmd.payload || '').trim() || 'New Client';
        const updated = clientsService.addClient({ name, company: '', email: '', notes: '', events: [] });
        dispatch({ type: 'SET_CLIENTS', payload: updated });
        onNavigate('client-management' as MagicianView, '');
        setNotice(`Created client: ${name}`);
        return;
      }

      if (cmd.key === 'create_routine') {
        const title = (cmd.payload || '').trim() || 'New Routine';
        const idea = await ideasService.saveIdea({ type: 'text', title, content: '', tags: ['routine'] });
        await refreshAll();
        onNavigate('saved-ideas', idea.id);
        setNotice(`Created idea: ${title}`);
        return;
      }

      setNotice(`Command Mode: ${cmd.title} — ${cmd.hint}`);
    } catch (e: any) {
      setNotice(`Command failed: ${String(e?.message || e)}`);
    }
  };

  const statusText = useMemo(() => {
    const scopeLabel = scopeMeta[activeScope]?.label ?? 'All';
    const scopesShown =
      activeScope === 'all'
        ? 'Shows + Clients + Tasks + Ideas'
        : activeScope === 'shows'
          ? 'Shows'
          : activeScope === 'tasks'
            ? 'Tasks'
            : activeScope === 'ideas'
              ? 'Ideas'
              : activeScope === 'clients'
                ? 'Clients'
                : scopeLabel;

    if (activeScope === 'files') return 'Files search is coming soon.';

    if (!query) return `Search across ${counts.shows} shows, ${counts.clients} clients, ${counts.tasks} tasks, and ${counts.ideas} ideas.`;

    return `Searching across ${counts.total} items… Showing results from ${scopesShown}.`;
  }, [activeScope, counts, query]);

  const scoreAndBadges = (item: {
    title?: string;
    description?: string;
    notes?: string;
    content?: string;
    tags?: string[];
    extra?: string;
  }) => {
    const badges: BadgeType[] = [];
    let score = 0;

    const title = normalizeString(item.title);
    const desc = normalizeString(item.description);
    const notes = normalizeString(item.notes);
    const content = normalizeString(item.content);
    const extra = normalizeString(item.extra);
    const tags = (item.tags || []).map((t) => normalizeString(t));

    const terms = selectedTag
      ? [queryLower]
      : (semanticContext.expandedTerms.length ? semanticContext.expandedTerms : [queryLower]).filter(Boolean);

    const hasIn = (s: string) => terms.some((t) => t && s.includes(t));

    if (selectedTag) {
      if (tags.includes(queryLower)) {
        badges.push('Exact Match');
        score += 90;
      } else if (tags.some((t) => t.includes(queryLower))) {
        badges.push('Related');
        score += 60;
      }
    } else if (queryLower) {
      if (title === queryLower) {
        badges.push('Exact Match');
        score += 100;
      } else if (title.startsWith(queryLower)) {
        badges.push('Related');
        score += 85;
      } else if (title.includes(queryLower)) {
        badges.push('Related');
        score += 65;
      }

      if (tags.includes(queryLower)) {
        if (!badges.includes('Exact Match')) badges.push('Exact Match');
        score += 70;
      } else if (tags.some((t) => t.includes(queryLower))) {
        if (!badges.includes('Related')) badges.push('Related');
        score += 45;
      }

      if (hasIn(desc) || hasIn(notes) || hasIn(content) || hasIn(extra)) {
        if (!badges.includes('Suggested')) badges.push('Suggested');
        score += 25;
      }

      // If semantic intent exists, lightly boost tag matches even if user didn't type the exact word.
      if (semanticContext.expandedTerms.length) {
        const semanticHit = tags.some((t) => semanticContext.expandedTerms.some((term) => term && t.includes(term)));
        if (semanticHit) {
          if (!badges.includes('Suggested')) badges.push('Suggested');
          score += 18;
        }
      }
    }

    // Recent (very light)
    if (typeof (item as any)?.updatedAt === 'number' || typeof (item as any)?.timestamp === 'number') {
      badges.push('Recent');
      score += 3;
    }

    if (badges.length === 0 && queryLower) {
      // if it survived filtering but no badges, still label as Suggested
      badges.push('Suggested');
      score += 10;
    }

    return { score, badges };
  };

  const allHits = useMemo(() => {
    const hits: SearchHit[] = [];

    // Command mode as first-class hit
    if (commandMatch) {
      hits.push({
        key: `cmd:${commandMatch.key}`,
        type: 'command',
        title: commandMatch.title,
        subtitle: commandMatch.hint,
        icon: SearchIcon,
        score: 999,
        badges: ['Suggested'],
        commandKey: commandMatch.key,
        commandHint: commandMatch.hint,
      });
    }

    const shouldIncludeType = (t: HitType) => {
      if (activeScope === 'all') return t !== 'file';
      if (activeScope === 'shows') return t === 'show';
      if (activeScope === 'tasks') return t === 'task';
      if (activeScope === 'ideas') return t === 'idea';
      if (activeScope === 'clients') return t === 'client';
      return false;
    };

    const matchesQuery = (item: { title?: string; tags?: string[]; haystack?: string }) => {
      if (!queryLower) return true;
      if (selectedTag) {
        return (item.tags || []).some((t) => normalizeString(t) === queryLower || normalizeString(t).includes(queryLower));
      }
      const h = normalizeString(item.title) + ' ' + normalizeString(item.haystack);
      const terms = semanticContext.expandedTerms.length ? semanticContext.expandedTerms : [queryLower];
      return terms.some((t) => t && h.includes(t));
    };

    // Shows
    for (const s of shows) {
      const hay = [s.description, ...(s.tags || [])].join(' ');
      if (!matchesQuery({ title: s.title, tags: s.tags, haystack: hay })) continue;
      if (!shouldIncludeType('show')) continue;
      const { score, badges } = scoreAndBadges({ title: s.title, description: s.description, tags: s.tags });
      hits.push({
        key: `show:${s.id}`,
        type: 'show',
        title: s.title,
        subtitle: s.description || 'Show',
        tags: s.tags,
        icon: StageCurtainsIcon,
        score,
        badges,
        showId: s.id,
      });

      // Tasks
      for (const tk of s.tasks || []) {
        const hayT = [tk.notes, ...(tk.tags || [])].join(' ');
        if (!matchesQuery({ title: tk.title, tags: tk.tags, haystack: hayT })) continue;
        if (!shouldIncludeType('task')) continue;
        const { score: ts, badges: tb } = scoreAndBadges({ title: tk.title, notes: tk.notes, tags: tk.tags });
        hits.push({
          key: `task:${s.id}:${tk.id}`,
          type: 'task',
          title: tk.title,
          subtitle: `Task • ${s.title}`,
          tags: tk.tags,
          icon: ChecklistIcon,
          score: ts,
          badges: tb,
          showId: s.id,
          taskId: tk.id,
        });
      }
    }

    // Ideas
    for (const i of ideas) {
      const hay = [i.content, ...(i.tags || [])].join(' ');
      if (!matchesQuery({ title: i.title || 'Untitled Idea', tags: i.tags, haystack: hay })) continue;
      if (!shouldIncludeType('idea')) continue;
      const { score, badges } = scoreAndBadges({ title: i.title || 'Untitled Idea', content: i.content, tags: i.tags });
      hits.push({
        key: `idea:${i.id}`,
        type: 'idea',
        title: i.title || 'Untitled Idea',
        subtitle: i.type === 'rehearsal' ? 'Rehearsal Session' : 'Idea',
        tags: i.tags,
        icon: BookmarkIcon,
        score,
        badges,
        ideaId: i.id,
      });
    }

    // Clients
    for (const c of clients) {
      const tags = (c as any)?.tags as string[] | undefined;
      const hay = [c.company, c.email, c.notes, ...(tags || [])].join(' ');
      if (!matchesQuery({ title: c.name, tags, haystack: hay })) continue;
      if (!shouldIncludeType('client')) continue;
      const { score, badges } = scoreAndBadges({ title: c.name, description: c.company || '', notes: c.notes || '', tags, extra: c.email || '' });
      hits.push({
        key: `client:${c.id}`,
        type: 'client',
        title: c.name,
        subtitle: c.company || 'Client',
        tags,
        icon: TagIcon,
        score,
        badges,
        clientId: c.id,
      });
    }

    return hits
      .filter((h) => (queryLower ? h.score > 0 || h.type === 'command' : true))
      .sort((a, b) => b.score - a.score)
      .slice(0, 60);
  }, [shows, ideas, clients, activeScope, queryLower, selectedTag, semanticContext.expandedTerms, commandMatch]);

  const groupedHits = useMemo(() => {
    const top = allHits.slice(0, 4);
    const rest = allHits.slice(4);

    const byType = (t: HitType) => rest.filter((h) => h.type === t);

    return {
      top,
      shows: byType('show'),
      clients: byType('client'),
      tasks: byType('task'),
      ideas: byType('idea'),
      commands: allHits.filter((h) => h.type === 'command'),
    };
  }, [allHits]);

  const selectedHit = useMemo(() => {
    if (activeIndex < 0 || activeIndex >= allHits.length) return null;
    return allHits[activeIndex];
  }, [activeIndex, allHits]);

  // --- Actions (REAL) ---
  const openHit = (hit: SearchHit) => {
    if (hit.type === 'command' && hit.commandKey) {
      void executeCommand({ key: hit.commandKey, title: hit.title, hint: hit.commandHint || '' });
      return;
    }

    if (hit.type === 'show' && hit.showId) return onNavigate('show-planner', hit.showId);
    if (hit.type === 'task' && hit.showId && hit.taskId) return onNavigate('show-planner', hit.showId, hit.taskId);
    if (hit.type === 'idea' && hit.ideaId) return onNavigate('saved-ideas', hit.ideaId);
    if (hit.type === 'client') {
      // ClientManagement doesn't currently deep-link; still open the page.
      onNavigate('client-management' as MagicianView, '');
      setNotice('Opened Client Management.');
      return;
    }
  };

  const editHit = (hit: SearchHit) => {
    // In this app, edit happens on the destination page (Show Planner / Saved Ideas / Client Mgmt).
    openHit(hit);
    setNotice('Tip: Use the edit controls on the destination page.');
  };

  const duplicateHit = async (hit: SearchHit) => {
    try {
      if (hit.type === 'show' && hit.showId) {
        const src = shows.find((s) => s.id === hit.showId);
        if (!src) throw new Error('Show not found');

        const copyTitle = `${src.title} (Copy)`;
        const newShow = await showsService.createShow({ title: copyTitle, description: src.description || '' });

        // copy tasks (best-effort)
        const taskCopies: Partial<Task>[] = (src.tasks || []).map((t) => ({
          title: t.title,
          notes: t.notes,
          priority: t.priority,
          status: t.status,
          tags: t.tags,
          musicCue: (t as any).musicCue,
          dueDate: (t as any).dueDate,
          subtasks: (t as any).subtasks,
        }));
        if (taskCopies.length) {
          await showsService.addTasksToShow(newShow.id, taskCopies);
        }

        await refreshAll();
        setNotice(`Duplicated show → ${copyTitle}`);
        return;
      }

      if (hit.type === 'task' && hit.showId && hit.taskId) {
        const srcShow = shows.find((s) => s.id === hit.showId);
        const srcTask = srcShow?.tasks?.find((t) => t.id === hit.taskId);
        if (!srcTask) throw new Error('Task not found');

        const copyTitle = `${srcTask.title} (Copy)`;
        const updatedShows = await showsService.addTaskToShow(hit.showId, {
          title: copyTitle,
          notes: srcTask.notes,
          priority: srcTask.priority,
          status: srcTask.status,
          tags: srcTask.tags,
          musicCue: (srcTask as any).musicCue,
          dueDate: (srcTask as any).dueDate,
          subtasks: (srcTask as any).subtasks,
        });
        dispatch({ type: 'SET_SHOWS', payload: updatedShows });
        setNotice(`Duplicated task → ${copyTitle}`);
        return;
      }

      if (hit.type === 'idea' && hit.ideaId) {
        const src = ideas.find((i) => i.id === hit.ideaId);
        if (!src) throw new Error('Idea not found');
        const copyTitle = `${src.title || 'Idea'} (Copy)`;
        await ideasService.saveIdea({ type: src.type, title: copyTitle, content: src.content, tags: src.tags || [] });
        await refreshAll();
        setNotice(`Duplicated idea → ${copyTitle}`);
        return;
      }

      if (hit.type === 'client' && hit.clientId) {
        const src = clients.find((c) => c.id === hit.clientId);
        if (!src) throw new Error('Client not found');
        const copyName = `${src.name} (Copy)`;
        const updated = clientsService.addClient({
          name: copyName,
          company: src.company || '',
          email: src.email || '',
          notes: src.notes || '',
          events: Array.isArray(src.events) ? src.events : [],
        });
        dispatch({ type: 'SET_CLIENTS', payload: updated });
        setNotice(`Duplicated client → ${copyName}`);
        return;
      }

      setNotice('Nothing to duplicate.');
    } catch (e: any) {
      setNotice(`Duplicate failed: ${String(e?.message || e)}`);
    }
  };

  const addToPlanner = async (hit: SearchHit) => {
    // If there is exactly one show, use it; otherwise ask.
    const targets = shows.map((s) => ({ id: s.id, title: s.title }));
    if (targets.length === 0) {
      setNotice('No shows found yet. Create a show first.');
      return;
    }

    const defaultShowId = targets[0].id;
    if (targets.length === 1) {
      await confirmAddToPlanner(hit, defaultShowId);
      return;
    }

    setPlannerModal({ open: true, hit, targets, selectedShowId: defaultShowId });
  };

  const confirmAddToPlanner = async (hit: SearchHit, showId: string) => {
    try {
      if (hit.type === 'task' && hit.showId && hit.taskId) {
        // Already a task; just navigate to that task in planner.
        onNavigate('show-planner', hit.showId, hit.taskId);
        setNotice('Opened task in Show Planner.');
        return;
      }

      // Convert Show / Idea / Client into a new task entry
      let title = '';
      let notes = '';
      let tags: string[] = [];

      if (hit.type === 'idea' && hit.ideaId) {
        const src = ideas.find((i) => i.id === hit.ideaId);
        title = `Idea: ${src?.title || 'Untitled'}`;
        notes = src?.content || '';
        tags = Array.isArray(src?.tags) ? src!.tags : [];
      } else if (hit.type === 'show' && hit.showId) {
        const src = shows.find((s) => s.id === hit.showId);
        title = `Show: ${src?.title || 'Show'} (review)`;
        notes = src?.description || '';
        tags = Array.isArray(src?.tags) ? src!.tags : [];
      } else if (hit.type === 'client' && hit.clientId) {
        const src = clients.find((c) => c.id === hit.clientId);
        title = `Client: ${src?.name || 'Client'} (follow-up)`;
        notes = [src?.company ? `Company: ${src.company}` : '', src?.email ? `Email: ${src.email}` : '', src?.notes ? `Notes: ${src.notes}` : '']
          .filter(Boolean)
          .join('\n');
        tags = ['client'];
      } else {
        setNotice('Add to Planner is not available for this item.');
        return;
      }

      const updated = await showsService.addTaskToShow(showId, {
        title,
        notes,
        priority: 'medium',
        status: 'todo',
        tags,
      });
      dispatch({ type: 'SET_SHOWS', payload: updated });
      setNotice(`Added to Show Planner → ${shows.find((s) => s.id === showId)?.title || 'Show'}`);
    } catch (e: any) {
      setNotice(`Add to Planner failed: ${String(e?.message || e)}`);
    }
  };

  // --- Keyboard navigation ---
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (plannerModal.open) return;

      if (e.key === 'Escape') {
        setSelectedTag(null);
        setActiveIndex(-1);
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => clamp(i + 1, 0, Math.max(0, allHits.length - 1)));
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => clamp(i - 1, 0, Math.max(0, allHits.length - 1)));
        return;
      }

      if (e.key === 'Enter') {
        if (activeIndex >= 0 && activeIndex < allHits.length) {
          e.preventDefault();
          openHit(allHits[activeIndex]);
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeIndex, allHits, plannerModal.open]);

  useEffect(() => {
    if (!resultsRef.current) return;
    const el = resultsRef.current.querySelector(`[data-hit-index="${activeIndex}"]`) as HTMLElement | null;
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const commitRecent = (q: string) => {
    const s = (q || '').trim();
    if (!s) return;
    setRecentSearches((prev) => [s, ...prev.filter((x) => x !== s)].slice(0, 8));
  };

  useEffect(() => {
    // when user has a query, keep the recents list warm
    if (!query || selectedTag) return;
    commitRecent(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryLower]);

  // --- UI building blocks ---
  const Badge: React.FC<{ b: BadgeType }> = ({ b }) => {
    const cls =
      b === 'Exact Match'
        ? 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30'
        : b === 'Related'
          ? 'bg-sky-500/15 text-sky-200 border-sky-500/30'
          : b === 'Recent'
            ? 'bg-amber-500/15 text-amber-200 border-amber-500/30'
            : 'bg-purple-500/15 text-purple-200 border-purple-500/30';

    return <span className={`text-[11px] px-2 py-0.5 rounded-full border ${cls}`}>{b}</span>;
  };

  const Card: React.FC<{ title: string; children: React.ReactNode; right?: React.ReactNode; className?: string }> = ({ title, children, right, className }) => (
    <div className={`rounded-xl border border-white/10 bg-white/5 p-4 ${className || ''}`}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="text-sm font-semibold text-white/90">{title}</div>
        {right}
      </div>
      {children}
    </div>
  );

  const ResultRow: React.FC<{ hit: SearchHit; idx: number }> = ({ hit, idx }) => {
    const Icon = hit.icon;
    const isActive = idx === activeIndex;
    const base =
      'rounded-xl border bg-white/5 hover:bg-white/7 transition-colors p-4 flex items-start justify-between gap-4';
    const ring = isActive ? 'border-purple-400/60 shadow-[0_0_0_1px_rgba(168,85,247,0.25)]' : 'border-white/10';

    return (
      <div
        data-hit-index={idx}
        className={`${base} ${ring}`}
        onMouseEnter={() => setActiveIndex(idx)}
      >
        <div className="flex items-start gap-3 min-w-0">
          <div className="mt-0.5 text-purple-200/90">
            <Icon />
          </div>
          <div className="min-w-0">
            <div className="text-sm text-white/95 font-semibold truncate">
              {selectedTag ? hit.title : highlightText(hit.title, searchTerm)}
            </div>
            {hit.subtitle && <div className="text-xs text-white/60 mt-0.5 truncate">{hit.subtitle}</div>}
            {!!hit.tags?.length && (
              <div className="flex flex-wrap gap-1 mt-2">
                {hit.tags.slice(0, 6).map((t) => (
                  <span
                    key={t}
                    className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/70 hover:text-white/90 hover:border-white/20 cursor-pointer"
                    onClick={() => {
                      setSelectedTag(t);
                      setSearchTerm('');
                      setActiveIndex(-1);
                    }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {hit.badges.slice(0, 2).map((b) => (
              <Badge key={b} b={b} />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-1.5 rounded-lg text-xs bg-white/5 border border-white/10 hover:bg-white/10"
              onClick={() => openHit(hit)}
            >
              Open
            </button>
            <button
              className="px-3 py-1.5 rounded-lg text-xs bg-white/5 border border-white/10 hover:bg-white/10"
              onClick={() => editHit(hit)}
            >
              Edit
            </button>
            <button
              className="px-3 py-1.5 rounded-lg text-xs bg-white/5 border border-white/10 hover:bg-white/10"
              onClick={() => void duplicateHit(hit)}
            >
              Duplicate
            </button>
            <button
              className="px-3 py-1.5 rounded-lg text-xs bg-white/5 border border-white/10 hover:bg-white/10"
              onClick={() => void addToPlanner(hit)}
            >
              Add to Planner
            </button>
          </div>
        </div>
      </div>
    );
  };

  const InsightPanel: React.FC<{ hit: SearchHit | null }> = ({ hit }) => {
    if (!hit) {
      return (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm font-semibold text-white/90 mb-2">Insight Panel</div>
          <div className="text-xs text-white/60">Select a result to see context, usage, and quick actions.</div>
          <div className="text-[11px] text-white/40 mt-3">Tip: Use ↑/↓ then Enter to open.</div>
        </div>
      );
    }

    // Heuristic insights (until we wire real analytics tables)
    const used = hit.type === 'task' ? 17 : hit.type === 'show' ? 9 : hit.type === 'idea' ? 5 : 3;
    const successRate = hit.type === 'task' ? 0.8 : hit.type === 'show' ? 0.75 : 0.65;
    const reaction = hit.type === 'task' ? 'Mixed' : hit.type === 'show' ? 'Strong' : 'Good';
    const placement = hit.type === 'task' ? 'Middle' : hit.type === 'show' ? 'Closer' : 'Any';

    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="text-sm font-semibold text-white/90">Insight Panel</div>
        <div className="text-xs text-white/70 mt-2 leading-snug">{hit.title}</div>
        <div className="mt-2 flex gap-2 flex-wrap">
          {hit.badges.slice(0, 1).map((b) => (
            <Badge key={b} b={b} />
          ))}
        </div>

        <div className="text-[11px] text-white/50 mt-3">Keyword match + tags relevance</div>

        <div className="grid grid-cols-2 gap-2 mt-3">
          <div className="rounded-lg border border-white/10 bg-white/5 p-2">
            <div className="text-[10px] text-white/50">Used</div>
            <div className="text-sm text-white/90 font-semibold">{used} times</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-2">
            <div className="text-[10px] text-white/50">Success rate</div>
            <div className="text-sm text-white/90 font-semibold">{Math.round(successRate * 100)}%</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-2">
            <div className="text-[10px] text-white/50">Audience reaction</div>
            <div className="text-sm text-white/90 font-semibold">{reaction}</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-2">
            <div className="text-[10px] text-white/50">Best placement</div>
            <div className="text-sm text-white/90 font-semibold">{placement}</div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button className="px-3 py-1.5 rounded-lg text-xs bg-white/5 border border-white/10 hover:bg-white/10" onClick={() => openHit(hit)}>
            Open
          </button>
          <button className="px-3 py-1.5 rounded-lg text-xs bg-white/5 border border-white/10 hover:bg-white/10" onClick={() => void duplicateHit(hit)}>
            Duplicate
          </button>
        </div>

        <div className="text-[11px] text-white/40 mt-3">Tip: Ctrl/⌘+K to focus search.</div>
      </div>
    );
  };

  const renderGroup = (label: string, hits: SearchHit[]) => {
    if (!hits.length) return null;
    return (
      <div className="mt-5">
        <div className="text-xs uppercase tracking-wide text-white/50 mb-2">{label}</div>
        <div className="space-y-3">
          {hits.map((h) => {
            const idx = allHits.findIndex((x) => x.key === h.key);
            return <ResultRow key={h.key} hit={h} idx={idx} />;
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="p-6">
      {/* Notice toast */}
      {notice && (
        <div className="fixed top-24 right-6 z-50 rounded-xl border border-white/10 bg-black/40 backdrop-blur px-4 py-3 text-sm text-white/90 shadow-lg">
          {notice}
        </div>
      )}

      {/* Planner modal */}
      {plannerModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setPlannerModal({ open: false })} />
          <div className="relative w-[92vw] max-w-lg rounded-2xl border border-white/10 bg-[#0c1020]/90 backdrop-blur p-5 shadow-2xl">
            <div className="text-sm font-semibold text-white/90">Add to Show Planner</div>
            <div className="text-xs text-white/60 mt-1">Choose which show to add this to.</div>

            <div className="mt-4">
              <label className="text-xs text-white/60">Target show</label>
              <select
                className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm"
                value={plannerModal.selectedShowId}
                onChange={(e) => setPlannerModal((s) => (s.open ? { ...s, selectedShowId: e.target.value } : s))}
              >
                {plannerModal.targets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                className="px-3 py-2 rounded-lg text-sm bg-white/5 border border-white/10 hover:bg-white/10"
                onClick={() => setPlannerModal({ open: false })}
              >
                Cancel
              </button>
              <button
                className="px-3 py-2 rounded-lg text-sm bg-purple-600/80 hover:bg-purple-600"
                onClick={() => {
                  const hit = plannerModal.hit;
                  const sid = plannerModal.selectedShowId;
                  setPlannerModal({ open: false });
                  void confirmAddToPlanner(hit, sid);
                }}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="text-purple-200/90 mt-2">
          <SearchIcon />
        </div>
        <div>
          <div className="text-3xl font-serif tracking-wide text-white/90">GLOBAL SEARCH</div>
          <div className="text-sm text-white/60 mt-1">Find anything across your shows, clients, tasks, and ideas.</div>
        </div>
      </div>

      {/* Scope tabs */}
      <div className="flex flex-wrap gap-2 mt-5">
        {scopeOrder.map((s) => {
          const meta = scopeMeta[s];
          const active = s === activeScope;
          const disabled = meta.disabled;
          return (
            <button
              key={s}
              disabled={disabled}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                disabled
                  ? 'opacity-40 cursor-not-allowed border-white/10 text-white/40'
                  : active
                    ? 'bg-purple-600/80 border-purple-400/30 text-white'
                    : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
              }`}
              onClick={() => {
                if (disabled) return;
                setActiveScope(s);
                setActiveIndex(-1);
              }}
            >
              {meta.label}
            </button>
          );
        })}
      </div>

      {/* Search input */}
      <div className="mt-4">
        <input
          ref={inputRef}
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setSelectedTag(null);
            setActiveIndex(-1);
          }}
          placeholder={'Search shows, tasks, clients, or ideas… Try: "birthday", "corporate", "closer trick"'}
          className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-4 text-lg text-white/90 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-purple-500/40"
        />
        <div className="text-xs text-white/45 mt-2">{statusText}</div>
      </div>

      {/* Recent searches */}
      {!query && recentSearches.length > 0 && (
        <div className="mt-6">
          <div className="text-sm font-semibold text-white/80">Recent Searches</div>
          <div className="flex flex-wrap gap-2 mt-2">
            {recentSearches.map((s) => (
              <button
                key={s}
                className="px-3 py-1.5 rounded-full text-sm bg-white/5 border border-white/10 text-white/70 hover:bg-white/10"
                onClick={() => {
                  setSearchTerm(s);
                  setSelectedTag(null);
                  inputRef.current?.focus();
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Layout */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Results */}
        <div className="lg:col-span-2" ref={resultsRef}>
          {!query && (
            <Card title="All Tags" right={<span className="text-xs text-white/45">Click to filter</span>}>
              <div className="flex flex-wrap gap-2">
                {allTags.length === 0 ? (
                  <div className="text-sm text-white/50">No tags found yet.</div>
                ) : (
                  allTags.map((t) => (
                    <button
                      key={t}
                      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                        selectedTag === t
                          ? 'bg-purple-600/80 border-purple-400/30 text-white'
                          : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                      }`}
                      onClick={() => {
                        setSelectedTag(t);
                        setSearchTerm('');
                        setActiveIndex(-1);
                      }}
                    >
                      {t}
                    </button>
                  ))
                )}
              </div>
            </Card>
          )}

          {query && (
            <>
              <div className="text-sm font-semibold text-white/85">Items tagged with “{query}”</div>
              {groupedHits.commands.length > 0 && renderGroup('Command Mode', groupedHits.commands)}
              {renderGroup('Top Matches', groupedHits.top)}
              {renderGroup('Shows', groupedHits.shows)}
              {renderGroup('Clients', groupedHits.clients)}
              {renderGroup('Tasks', groupedHits.tasks)}
              {renderGroup('Ideas', groupedHits.ideas)}

              {allHits.length === 0 && (
                <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-6 text-white/60">
                  No results yet. Try a different keyword or click a tag.
                </div>
              )}
            </>
          )}
        </div>

        {/* Insight panel */}
        <div className="lg:col-span-1">
          <InsightPanel hit={selectedHit} />
        </div>
      </div>
    </div>
  );
};

export default GlobalSearch;
