import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MAGIC_DICTIONARY_TERMS } from '../constants';
import { TutorIcon, SearchIcon, BookIcon, ChevronDownIcon } from './icons';

type SkillLevel = 'Beginner' | 'Pro';
type Category = string;

type DictionaryReference = { title: string; url: string };

type DictionaryTerm = {
  term: string;
  definition: string;
  references?: DictionaryReference[];

  // Optional “Mini Knowledge Base” fields (gracefully handled if missing)
  category?: Category;
  skillLevel?: SkillLevel;
  whyItMatters?: string;
  beginnerMistakes?: string[];
  relatedTerms?: string[];
  usedInWizard?: Array<{ feature: string; note?: string } | string>;
};

const GOLD = 'text-amber-300'; // richer gold accent
const GOLD_MUTED = 'text-amber-200/90';

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

const MagicDictionary: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedTerm, setExpandedTerm] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [skillFilter, setSkillFilter] = useState<'All' | SkillLevel>('All');

  // Used to scroll after state updates (expand + filter + search)
  const pendingScrollTermRef = useRef<string | null>(null);

  const sortedTerms = useMemo(() => {
    return [...(MAGIC_DICTIONARY_TERMS as DictionaryTerm[])]
      .filter(Boolean)
      .sort((a, b) => a.term.localeCompare(b.term));
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    let hasUncategorized = false;

    for (const t of sortedTerms) {
      if (!t) continue;
      const c = (t.category || '').trim();
      if (c) set.add(c);
      else hasUncategorized = true;
    }

    const list = ['All', ...Array.from(set).sort((a, b) => a.localeCompare(b))];
    if (hasUncategorized) list.push('Uncategorized');
    return list;
  }, [sortedTerms]);

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

      const itemCategory = (item.category || '').trim() || 'Uncategorized';
      const matchesCategory = categoryFilter === 'All' || itemCategory === categoryFilter;

      const itemSkill = item.skillLevel || 'Beginner';
      const matchesSkill = skillFilter === 'All' || itemSkill === skillFilter;

      return matchesSearch && matchesCategory && matchesSkill;
    });
  }, [searchTerm, sortedTerms, categoryFilter, skillFilter]);

  const clearFilters = () => {
    setSearchTerm('');
    setCategoryFilter('All');
    setSkillFilter('All');
  };

  const isFiltered = searchTerm.trim() !== '' || categoryFilter !== 'All' || skillFilter !== 'All';

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
    setCategoryFilter('All');
    setSkillFilter('All');

    pendingScrollTermRef.current = related;

    // Expand immediately if it exists in the full list
    const match = sortedTerms.find((t) => t && t.term.toLowerCase() === related.toLowerCase());
    if (match) {
      setExpandedTerm(match.term);
      setHashToTerm(match.term);
    } else {
      // If it doesn't exist as a term, we still update search to show matches.
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
        // Ensure it appears even if filters were previously set (fresh load: should be defaults)
        pendingScrollTermRef.current = match.term;
        setSearchTerm('');
        setCategoryFilter('All');
        setSkillFilter('All');
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

    // Only scroll when the term is visible in the current filtered list
    const visible = filteredTerms.some((x) => x && x.term.toLowerCase() === t.toLowerCase());
    if (!visible) return;

    // Wait a tick for DOM to reflect expanded state and filtering
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
        <h4 className={`text-sm font-semibold ${GOLD_MUTED} mb-2`}>Common Beginner Mistakes</h4>
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

  const CategoryBadge: React.FC<{ category?: string }> = ({ category }) => {
    const label = (category && category.trim()) ? category.trim() : 'Uncategorized';
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold bg-slate-700/70 border border-slate-600 text-purple-200">
        {label}
      </span>
    );
  };

  const SkillBadge: React.FC<{ skill?: SkillLevel }> = ({ skill }) => {
    const label = skill || 'Beginner';
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold bg-slate-800/60 border border-slate-700 text-slate-300">
        {label}
      </span>
    );
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto p-4 md:p-6 animate-fade-in">
      <header className="mb-6">
        <div className="flex items-center gap-3">
          <TutorIcon className="w-8 h-8 text-purple-400" />
          <div>
            <h2 className="text-2xl font-bold text-slate-200 font-cinzel">Magic Dictionary</h2>
            <p className="text-slate-400 mt-1">A curated glossary of professional magic terms and concepts.</p>
          </div>
        </div>
      </header>

      {/* Filters Bar */}
      <div className="sticky top-0 bg-slate-900/80 backdrop-blur-sm py-3 z-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Search */}
          <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg overflow-hidden md:col-span-2">
            <div className="pl-4 pr-2 text-slate-500">
              <SearchIcon className="w-5 h-5" />
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search magic terms…"
              className="flex-1 w-full bg-transparent pr-4 py-3 text-white placeholder-slate-400 focus:outline-none"
              aria-label="Search magic dictionary"
            />
          </div>

          {/* Category */}
          <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg px-3">
            <label className="text-xs font-semibold text-slate-400 mr-3 whitespace-nowrap">Category</label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full bg-transparent py-3 text-white focus:outline-none"
              aria-label="Filter by category"
            >
              {categories.map((c) => (
                <option key={c} value={c} className="bg-slate-900">
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Skill + Clear */}
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg px-3 flex-1">
              <span className="text-xs font-semibold text-slate-400 mr-3 whitespace-nowrap">Skill</span>
              <div className="flex-1 flex items-center justify-end">
                <div className="inline-flex rounded-lg border border-slate-700 overflow-hidden">
                  {(['All', 'Beginner', 'Pro'] as const).map((lvl) => {
                    const active = skillFilter === lvl;
                    return (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => setSkillFilter(lvl)}
                        className={[
                          'px-3 py-2 text-sm transition-colors',
                          active ? 'bg-purple-600/20 text-purple-200' : 'bg-transparent text-slate-300 hover:text-white',
                          'focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60',
                        ].join(' ')}
                        aria-pressed={active}
                      >
                        {lvl}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {isFiltered ? (
              <button
                type="button"
                onClick={clearFilters}
                className="px-3 py-3 rounded-lg border border-slate-700 bg-slate-900/40 text-purple-300 hover:text-white hover:border-purple-500/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60 whitespace-nowrap"
                aria-label="Clear filters"
                title="Clear search and filters"
              >
                Clear
              </button>
            ) : null}
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
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className={`font-bold text-lg ${GOLD} tracking-wide`}>{item.term}</h3>
                          <CategoryBadge category={item.category} />
                          <SkillBadge skill={item.skillLevel} />
                        </div>
                        <p className="mt-2 text-slate-300 text-sm leading-relaxed line-clamp-2">
                          {clipOneLine(item.definition)}
                        </p>
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
                          <h4 className={`text-sm font-semibold ${GOLD} mb-2`}>Definition (Plain English)</h4>
                          <p className="text-slate-200 leading-relaxed">{item.definition}</p>
                        </div>

                        {/* Why it matters */}
                        {item.whyItMatters ? (
                          <div>
                            <h4 className={`text-sm font-semibold ${GOLD} mb-2`}>Why It Matters in Performance</h4>
                            <p className="text-slate-300 leading-relaxed">{item.whyItMatters}</p>
                          </div>
                        ) : null}

                        {/* Beginner mistakes */}
                        {renderBeginnerMistakes(item)}

                        {/* Related terms */}
                        {renderRelatedTerms(item)}

                        {/* Used in app */}
                        {renderUsedInWizard(item)}

                        {/* References */}
                        {renderReferences(item)}

                        {/* Optional future action row */}
                        <div className="pt-2 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            className="px-3 py-2 text-sm rounded-lg border border-slate-700 bg-slate-900/40 text-purple-300 hover:text-white hover:border-purple-500/40 transition-colors"
                            onClick={() => {
                              // Future hook: launch AI modal, or prefill prompts
                            }}
                            aria-label="Ask AI about this term"
                          >
                            🔮 Ask AI (coming soon)
                          </button>

                          <button
                            type="button"
                            className="px-3 py-2 text-sm rounded-lg border border-slate-700 bg-slate-900/40 text-purple-300 hover:text-white hover:border-purple-500/40 transition-colors"
                            onClick={() => {
                              // Future hook: save favorite
                            }}
                            aria-label="Save term"
                          >
                            ⭐ Save (coming soon)
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
            <p>No terms found for &quot;{searchTerm}&quot;.</p>
            <p className="mt-2 text-sm text-slate-600">Try clearing filters or using fewer keywords.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default MagicDictionary;
