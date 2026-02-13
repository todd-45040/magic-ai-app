import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MAGIC_DICTIONARY_TERMS } from '../constants';
import type { AiSparkAction } from '../types';
import { TutorIcon, SearchIcon, BookIcon, ChevronDownIcon, WandIcon } from './icons';

type DifficultyLevel = 'Beginner' | 'Intermediate' | 'Advanced' | 'Mastery';

type DictionaryReference = { title: string; url: string };

type ConceptCategory =
  | 'Performance Psychology'
  | 'Misdirection'
  | 'Structure & Theory'
  | 'Stagecraft'
  | 'Audience Control'
  | 'Business'
  | 'Mentalism'
  | 'Close-Up'
  | 'Stage';

type DictionaryTerm = {
  term: string;
  definition: string;
  references?: DictionaryReference[];

  // Optional “Mini Knowledge Base” fields (gracefully handled if missing)
  category?: string; // legacy / source category
  whyItMatters?: string;
  beginnerMistakes?: string[];
  relatedTerms?: string[];
  usedInWizard?: Array<{ feature: string; note?: string } | string>;

  // Tier-1 upgrades (optional; can be inferred)
  conceptCategory?: ConceptCategory;
  difficulty?: DifficultyLevel;
  strength?: number; // 0..100 (Fundamental -> Advanced)
  exampleScenario?: string;
};

type Props = {
  onAiSpark?: (action: AiSparkAction) => void;
};

const GOLD = 'text-amber-300';
const GOLD_MUTED = 'text-amber-200/90';

const CONCEPT_CATEGORIES: Array<'All' | ConceptCategory> = [
  'All',
  'Performance Psychology',
  'Misdirection',
  'Structure & Theory',
  'Stagecraft',
  'Audience Control',
  'Business',
  'Mentalism',
  'Close-Up',
  'Stage',
];

const slugify = (s: string) =>
  (s || '')
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

const normalizeHash = (hash: string) => {
  const raw = (hash || '').replace(/^#/, '');
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

const starsForDifficulty = (d: DifficultyLevel) => {
  switch (d) {
    case 'Beginner':
      return '⭐';
    case 'Intermediate':
      return '⭐⭐';
    case 'Advanced':
      return '⭐⭐⭐';
    case 'Mastery':
      return '🎓';
    default:
      return '⭐';
  }
};

const inferConceptCategory = (t: DictionaryTerm): ConceptCategory => {
  if (t.conceptCategory) return t.conceptCategory;

  const term = (t.term || '').toLowerCase();
  const legacy = (t.category || '').toLowerCase();

  // Strong signals first
  if (term.includes('misdirection') || legacy.includes('misdirection')) return 'Misdirection';
  if (legacy.includes('stagecraft') || term.includes('angle') || term.includes('blocking') || term.includes('lighting')) return 'Stagecraft';
  if (legacy.includes('business') || term.includes('reset') || term.includes('booking') || term.includes('contract')) return 'Business';
  if (legacy.includes('mentalism') || term.includes('mentalism') || term.includes('cold reading')) return 'Mentalism';
  if (legacy.includes('close') || term.includes('close-up') || term.includes('table') || term.includes('walk-around')) return 'Close-Up';
  if (legacy.includes('stage') || term.includes('stage')) return 'Stage';
  if (term.includes('heckler') || term.includes('audience') || term.includes('spectator') || legacy.includes('audience')) return 'Audience Control';

  // Fallbacks
  if (legacy.includes('theory')) return 'Structure & Theory';
  return 'Performance Psychology';
};

const inferDifficulty = (t: DictionaryTerm): DifficultyLevel => {
  if (t.difficulty) return t.difficulty;

  const term = (t.term || '').toLowerCase();
  const legacy = (t.category || '').toLowerCase();

  if (term.includes('dual reality') || term.includes('time misdirection')) return 'Advanced';
  if (term.includes('out') || term.includes('heckler')) return 'Advanced';
  if (legacy.includes('theory')) return 'Intermediate';
  return 'Beginner';
};

const inferStrength = (t: DictionaryTerm): number => {
  if (typeof t.strength === 'number' && !Number.isNaN(t.strength)) {
    return Math.max(0, Math.min(100, t.strength));
  }

  const d = inferDifficulty(t);
  switch (d) {
    case 'Beginner':
      return 25;
    case 'Intermediate':
      return 45;
    case 'Advanced':
      return 70;
    case 'Mastery':
      return 90;
    default:
      return 45;
  }
};

const inferScenario = (t: DictionaryTerm): string => {
  if (t.exampleScenario && t.exampleScenario.trim()) return t.exampleScenario.trim();

  const term = (t.term || '').toLowerCase();
  if (term.includes('misdirection')) {
    return 'You get a laugh from a quick line, then casually adjust your grip as you gesture toward a spectator. The audience’s focus stays on the interaction—not the hands.';
  }
  if (term.includes('time misdirection')) {
    return 'You make an important action early, then shift into a short story beat. When the revelation happens later, the audience no longer connects the earlier moment to the method.';
  }
  if (term.includes('beat')) {
    return 'You pause after a key moment (a card is lost / a coin vanishes) so the audience registers what changed before you move on.';
  }
  if (term.includes('offbeat')) {
    return 'Right after applause, you reset and reposition naturally while the audience’s attention drops—then you cleanly transition to the next phase.';
  }
  if (term.includes('angle')) {
    return 'At a corporate cocktail hour, guests gather behind you. You pivot your stance and bring the action higher so the side angles can’t see anything suspicious.';
  }
  if (term.includes('reset')) {
    return 'During walk-around, you finish an effect and immediately pocket the props in a set order so you can perform the same piece again at the next table without fumbling.';
  }
  if (term.includes('out')) {
    return 'A selection is unclear, so you smoothly reframe: “Let’s try something even cleaner…” and transition to a backup phase that preserves the mystery.';
  }

  return 'Use this concept in a real routine: identify the “moment of magic,” then decide what the audience should be thinking and feeling right before and right after it.';
};

const MagicDictionary: React.FC<Props> = ({ onAiSpark }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedTerm, setExpandedTerm] = useState<string | null>(null);
  const [conceptFilter, setConceptFilter] = useState<'All' | ConceptCategory>('All');
  const [difficultyFilter, setDifficultyFilter] = useState<'All' | DifficultyLevel>('All');

  // Used to scroll after state updates (expand + filter + search)
  const pendingScrollTermRef = useRef<string | null>(null);

  const sortedTerms = useMemo(() => {
    return [...(MAGIC_DICTIONARY_TERMS as DictionaryTerm[])]
      .filter(Boolean)
      .sort((a, b) => a.term.localeCompare(b.term));
  }, []);

  const filteredTerms = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();

    return sortedTerms.filter((item) => {
      if (!item) return false;

      const matchesSearch =
        !q ||
        item.term.toLowerCase().includes(q) ||
        (item.definition || '').toLowerCase().includes(q) ||
        (item.whyItMatters || '').toLowerCase().includes(q) ||
        (item.beginnerMistakes || []).some((m) => m.toLowerCase().includes(q));

      const itemConcept = inferConceptCategory(item);
      const matchesConcept = conceptFilter === 'All' || itemConcept === conceptFilter;

      const itemDifficulty = inferDifficulty(item);
      const matchesDifficulty = difficultyFilter === 'All' || itemDifficulty === difficultyFilter;

      return matchesSearch && matchesConcept && matchesDifficulty;
    });
  }, [searchTerm, sortedTerms, conceptFilter, difficultyFilter]);

  const clearFilters = () => {
    setSearchTerm('');
    setConceptFilter('All');
    setDifficultyFilter('All');
  };

  const isFiltered = searchTerm.trim() !== '' || conceptFilter !== 'All' || difficultyFilter !== 'All';

  const setHashToTerm = (term: string | null) => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (!term) {
      url.hash = '';
    } else {
      url.hash = encodeURIComponent(slugify(term));
    }
    window.history.replaceState(null, '', url.toString());
  };

  const scrollToTerm = (term: string) => {
    if (typeof window === 'undefined') return;
    const id = `term-${slugify(term)}`;
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleToggle = (term: string) => {
    setExpandedTerm((prev) => {
      const next = prev === term ? null : term;
      setHashToTerm(next);
      return next;
    });
  };

  const handleRelatedClick = (related: string) => {
    // Make sure the related term is visible, then expand + deep-link + scroll.
    setSearchTerm(related);
    setConceptFilter('All');
    setDifficultyFilter('All');

    pendingScrollTermRef.current = related;

    // Expand immediately if it exists in the full list
    const match = sortedTerms.find((t) => t && t.term.toLowerCase() === related.toLowerCase());
    if (match) {
      setExpandedTerm(match.term);
      setHashToTerm(match.term);
    } else {
      setExpandedTerm(null);
      setHashToTerm(null);
    }
  };

  // On first load, support deep-linking via URL hash: /dictionary#misdirection
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const tryOpenFromHash = () => {
      const raw = normalizeHash(window.location.hash);
      if (!raw) return;

      const desiredSlug = slugify(raw);

      const match = sortedTerms.find((t) => {
        if (!t) return false;
        return slugify(t.term) === desiredSlug || t.term.toLowerCase() === raw.toLowerCase();
      });

      if (match) {
        pendingScrollTermRef.current = match.term;
        setSearchTerm('');
        setConceptFilter('All');
        setDifficultyFilter('All');
        setExpandedTerm(match.term);
        setHashToTerm(match.term);
      }
    };

    tryOpenFromHash();

    const onHashChange = () => {
      tryOpenFromHash();
    };

    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [sortedTerms]);

  // After expand/search changes, scroll if requested.
  useEffect(() => {
    const t = pendingScrollTermRef.current;
    if (!t) return;

    const visible = filteredTerms.some((x) => x && x.term.toLowerCase() === t.toLowerCase());
    if (!visible) return;

    const handle = window.setTimeout(() => {
      scrollToTerm(t);
      pendingScrollTermRef.current = null;
    }, 50);

    return () => window.clearTimeout(handle);
  }, [expandedTerm, filteredTerms]);

  const clipOneLine = (text: string) => (text || '').replace(/\s+/g, ' ').trim();

  const renderUsedInWizard = (item: DictionaryTerm) => {
    if (!item.usedInWizard || item.usedInWizard.length === 0) return null;

    return (
      <div>
        <h4 className={`text-sm font-semibold ${GOLD_MUTED} mb-2`}>Used in Magic AI Wizard</h4>
        <ul className="space-y-2">
          {item.usedInWizard.map((u, idx) => {
            if (typeof u === 'string') {
              return (
                <li key={`${item.term}-wiz-${idx}`} className="text-slate-300 text-sm">
                  • <span className="text-slate-200 font-medium">{u}</span>
                </li>
              );
            }
            return (
              <li key={`${item.term}-wiz-${idx}`} className="text-slate-300 text-sm">
                • <span className="text-slate-200 font-medium">{u.feature}</span>
                {u.note ? <span className="text-slate-400"> — {u.note}</span> : null}
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  const renderRelatedTerms = (item: DictionaryTerm) => {
    if (!item.relatedTerms || item.relatedTerms.length === 0) return null;

    return (
      <div>
        <h4 className={`text-sm font-semibold ${GOLD_MUTED} mb-2`}>Related Concepts</h4>
        <div className="flex flex-wrap gap-2">
          {item.relatedTerms.map((t) => (
            <button
              key={`${item.term}-rel-${t}`}
              type="button"
              onClick={() => handleRelatedClick(t)}
              className="text-xs px-2 py-1 rounded-full bg-slate-700/60 border border-slate-600 text-purple-200 hover:text-white hover:border-purple-500/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60"
              title={`Explore: ${t}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderBeginnerMistakes = (item: DictionaryTerm) => {
    if (!item.beginnerMistakes || item.beginnerMistakes.length === 0) return null;

    return (
      <div>
        <h4 className={`text-sm font-semibold ${GOLD_MUTED} mb-2`}>Common Mistakes</h4>
        <ul className="space-y-1">
          {item.beginnerMistakes.map((m, idx) => (
            <li key={`${item.term}-mist-${idx}`} className="text-slate-300 text-sm">
              • {m}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  const renderReferences = (item: DictionaryTerm) => {
    const refs = item.references || [];
    if (refs.length === 0) return null;

    return (
      <div>
        <h4 className="text-sm font-semibold text-slate-400 mb-2">Further Reading</h4>
        <ul className="space-y-1">
          {refs.map((ref) => (
            <li key={ref.url}>
              <a
                href={ref.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center gap-2 text-sm text-purple-300 hover:text-white transition-colors"
              >
                <BookIcon className="w-4 h-4 text-purple-300 group-hover:text-white transition-colors" />
                <span className="underline decoration-transparent group-hover:decoration-white/60 transition-colors">
                  {ref.title}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  const ConceptBadge: React.FC<{ concept: ConceptCategory }> = ({ concept }) => (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold bg-slate-700/70 border border-slate-600 text-purple-200">
      {concept}
    </span>
  );

  const DifficultyBadge: React.FC<{ difficulty: DifficultyLevel }> = ({ difficulty }) => (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold bg-slate-900/40 border border-slate-700 text-slate-200"
      title={difficulty}
    >
      <span className="mr-1">{starsForDifficulty(difficulty)}</span>
      <span className="text-slate-300">{difficulty}</span>
    </span>
  );

  const StrengthMeter: React.FC<{ strength: number }> = ({ strength }) => {
    const pct = Math.round(Math.max(0, Math.min(100, strength)));
    const w = clamp01(pct / 100) * 100;

    return (
      <div className="w-full">
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span>Fundamental</span>
          <span>Advanced Theory</span>
        </div>
        <div className="mt-1 h-2 rounded-full bg-slate-900/50 border border-slate-700 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-purple-500/40 to-amber-400/50"
            style={{ width: `${w}%` }}
          />
        </div>
      </div>
    );
  };

  const askAiForTerm = (item: DictionaryTerm) => {
    if (!onAiSpark) return;

    const concept = inferConceptCategory(item);
    const difficulty = inferDifficulty(item);

    const prompt = [
      `You are my magic theory coach. Help me apply this concept to real performance without exposing secrets.`,
      '',
      `CONCEPT: ${item.term}`,
      `CATEGORY: ${concept}`,
      `DIFFICULTY: ${difficulty}`,
      '',
      `Definition: ${item.definition}`,
      item.whyItMatters ? `Why it matters: ${item.whyItMatters}` : '',
      item.beginnerMistakes?.length ? `Common mistakes: ${item.beginnerMistakes.map((m) => `- ${m}`).join('\n')}` : '',
      item.relatedTerms?.length ? `Related terms: ${item.relatedTerms.join(', ')}` : '',
      '',
      `Give me:`,
      `1) A practical performance explanation (plain English)`,
      `2) A short example scenario (what I would do/say on stage)`,
      `3) 3 quick drills I can practice`,
      `4) One “upgrade” tip appropriate for my level`,
    ]
      .filter(Boolean)
      .join('\n');

    onAiSpark({ type: 'custom-prompt', payload: { prompt } });
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto p-4 md:p-6 animate-fade-in">
      <header className="mb-6">
        <div className="flex items-center gap-3">
          <TutorIcon className="w-8 h-8 text-purple-400" />
          <div>
            <h2 className="text-2xl font-bold text-slate-200 font-cinzel">Magic Dictionary</h2>
            <p className="text-slate-400 mt-1">A curated reference of professional magic terms and performance concepts.</p>
          </div>
        </div>
      </header>

      {/* Filters Bar */}
      <div className="sticky top-0 bg-slate-900/80 backdrop-blur-sm py-3 z-10">
        <div className="grid grid-cols-1 gap-3">
          {/* Search */}
          <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
            <div className="pl-4 pr-2 text-slate-500">
              <SearchIcon className="w-5 h-5" />
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search terms, definitions, mistakes…"
              className="flex-1 w-full bg-transparent pr-4 py-3 text-white placeholder-slate-400 focus:outline-none"
              aria-label="Search magic dictionary"
            />
            {isFiltered ? (
              <button
                type="button"
                onClick={clearFilters}
                className="mr-2 px-3 py-2 text-sm rounded-lg border border-slate-700 bg-slate-900/40 text-purple-300 hover:text-white hover:border-purple-500/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60"
                aria-label="Clear filters"
                title="Clear search and filters"
              >
                Reset
              </button>
            ) : null}
          </div>

          {/* Concept Category Chips */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {CONCEPT_CATEGORIES.map((c) => {
              const active = conceptFilter === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setConceptFilter(c)}
                  className={[
                    'shrink-0 px-3 py-1.5 rounded-full border text-sm transition-colors',
                    active
                      ? 'bg-purple-600/20 border-purple-500/40 text-purple-100'
                      : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:text-white hover:border-slate-600',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60',
                  ].join(' ')}
                  aria-pressed={active}
                >
                  {c}
                </button>
              );
            })}
          </div>

          {/* Difficulty */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-400 mr-1">Difficulty:</span>
            <div className="inline-flex rounded-full border border-slate-700 overflow-hidden">
              {(['All', 'Beginner', 'Intermediate', 'Advanced', 'Mastery'] as const).map((lvl) => {
                const active = difficultyFilter === lvl;
                return (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setDifficultyFilter(lvl)}
                    className={[
                      'px-3 py-2 text-sm transition-colors',
                      active ? 'bg-purple-600/20 text-purple-200' : 'bg-transparent text-slate-300 hover:text-white',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60',
                    ].join(' ')}
                    aria-pressed={active}
                    title={lvl === 'All' ? 'All levels' : lvl}
                  >
                    {lvl === 'All' ? 'All' : starsForDifficulty(lvl)}
                  </button>
                );
              })}
            </div>
            <span className="text-xs text-slate-500">(tap stars)</span>
          </div>
        </div>
      </div>

      {/* Cards */}
      <div className="mt-4">
        {filteredTerms.length > 0 ? (
          <div className="grid grid-cols-1 gap-3">
            {filteredTerms.filter(Boolean).map((item) => {
              const isExpanded = expandedTerm === item.term;
              const cardId = `term-${slugify(item.term)}`;
              const concept = inferConceptCategory(item);
              const difficulty = inferDifficulty(item);
              const strength = inferStrength(item);

              return (
                <div
                  key={item.term}
                  id={cardId}
                  className={[
                    'bg-slate-800/50 border rounded-xl overflow-hidden',
                    'transition-all duration-200',
                    isExpanded ? 'border-purple-500/40 shadow-lg shadow-purple-500/10' : 'border-slate-700 hover:border-slate-600',
                  ].join(' ')}
                >
                  {/* Collapsed Header (Card) */}
                  <button
                    onClick={() => handleToggle(item.term)}
                    className="w-full text-left p-4 md:p-5 hover:bg-slate-700/40 transition-colors"
                    aria-expanded={isExpanded}
                    aria-controls={`${cardId}-panel`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className={`font-bold text-lg ${GOLD} tracking-wide`}>{item.term}</h3>
                          <ConceptBadge concept={concept} />
                          <DifficultyBadge difficulty={difficulty} />
                        </div>
                        <p className="mt-2 text-slate-300 text-sm leading-relaxed line-clamp-2">
                          {clipOneLine(item.definition)}
                        </p>

                        <div className="mt-3">
                          <StrengthMeter strength={strength} />
                        </div>
                      </div>

                      <ChevronDownIcon
                        className={[
                          'w-6 h-6 flex-shrink-0 mt-1 text-purple-200/80',
                          'transition-transform duration-300',
                          isExpanded ? 'rotate-180' : '',
                        ].join(' ')}
                      />
                    </div>

                    <div className="mt-3">
                      <span className="text-sm text-purple-300 hover:text-white transition-colors">
                        {isExpanded ? 'Collapse ▲' : 'Learn more ▾'}
                      </span>
                    </div>
                  </button>

                  {/* Expanded Content */}
                  <div
                    id={`${cardId}-panel`}
                    className={[
                      'grid transition-all duration-300 ease-in-out',
                      isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
                    ].join(' ')}
                  >
                    <div className="overflow-hidden">
                      <div className="px-4 md:px-5 pb-5 space-y-5">
                        {/* Definition */}
                        <div className="pt-1">
                          <h4 className={`text-sm font-semibold ${GOLD} mb-2`}>📖 Definition</h4>
                          <p className="text-slate-200 leading-relaxed">{item.definition}</p>
                        </div>

                        {/* Why it matters */}
                        {item.whyItMatters ? (
                          <div>
                            <h4 className={`text-sm font-semibold ${GOLD} mb-2`}>🎭 Why It Matters in Performance</h4>
                            <p className="text-slate-300 leading-relaxed">{item.whyItMatters}</p>
                          </div>
                        ) : null}

                        {/* Common mistakes */}
                        {renderBeginnerMistakes(item)}

                        {/* Example */}
                        <div>
                          <h4 className={`text-sm font-semibold ${GOLD} mb-2`}>🎬 Real Example Scenario</h4>
                          <p className="text-slate-300 leading-relaxed">{inferScenario(item)}</p>
                        </div>

                        {/* Related terms */}
                        {renderRelatedTerms(item)}

                        {/* Used in app */}
                        {renderUsedInWizard(item)}

                        {/* References */}
                        {renderReferences(item)}

                        {/* Action row */}
                        <div className="pt-2 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            className={[
                              'inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border',
                              onAiSpark
                                ? 'border-purple-500/40 bg-purple-600/15 text-purple-100 hover:bg-purple-600/25 hover:border-purple-400/60'
                                : 'border-slate-700 bg-slate-900/40 text-slate-500 cursor-not-allowed',
                              'transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60',
                            ].join(' ')}
                            onClick={() => askAiForTerm(item)}
                            disabled={!onAiSpark}
                            aria-label="Ask AI about this concept"
                            title={!onAiSpark ? 'AI actions unavailable in this view' : 'Ask AI about this concept'}
                          >
                            <WandIcon className="w-4 h-4" />
                            Ask AI About This Concept
                          </button>

                          <button
                            type="button"
                            className="px-3 py-2 text-sm rounded-lg border border-slate-700 bg-slate-900/40 text-slate-300 hover:text-white hover:border-slate-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60"
                            onClick={() => {
                              // Copy a sharable deep-link
                              if (typeof window === 'undefined') return;
                              const url = new URL(window.location.href);
                              url.hash = encodeURIComponent(slugify(item.term));
                              navigator.clipboard?.writeText(url.toString());
                            }}
                            aria-label="Copy link to this term"
                            title="Copy a link to this term"
                          >
                            Copy Link
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 text-slate-500">
            <p>No terms found for “{searchTerm}”.</p>
            <p className="mt-2 text-sm text-slate-600">Try clearing filters or using fewer keywords.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default MagicDictionary;
