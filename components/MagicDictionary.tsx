import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MAGIC_DICTIONARY_TERMS, MAGIC_TECHNIQUE_TERMS } from '../constants';
import type { AiSparkAction, Membership } from '../types';
import { useAppState } from '../store';
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

  // Tier-4: Modern interpretations + ethics (optional; inferred if missing)
  classicDefinition?: string;
  modernApplication?: string;
  ethicalReminder?: string;

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
  /** Used for soft-gating + pro badges (Tier 5). */
  membership?: Membership;
  /** Opens the app-level upgrade modal (Tier 5). */
  onRequestUpgrade?: () => void;
};

type DictionaryLayer = 'core' | 'terms';

type TechniqueCategory =
  | 'All'
  | 'Sleights'
  | 'Forces'
  | 'Gimmicks'
  | 'Stage Terminology'
  | 'Equipment'
  | 'Method Classifications';

type TechniqueTerm = {
  term: string;
  category: Exclude<TechniqueCategory, 'All'>;
  definition: string;
  historicalNote?: string;
};

// --- Tier 5 (Soft Monetization): local analytics + thresholds ---
// We keep everything functional, but:
//  - show subtle "Pro" badges
//  - trigger the Upgrade modal once a user crosses a soft usage threshold
// This gives you real-world activation signals without hard-locking users.
type SoftGateKey = 'scenario' | 'diagnostic' | 'tutor-l2' | 'tutor-l3';

type SoftGateState = {
  day: string; // YYYY-MM-DD
  counts: Record<SoftGateKey, number>;
  prompted: Record<SoftGateKey, boolean>; // only prompt once per day per feature
};

const SOFT_GATE_STORAGE_KEY = 'maw_dictionary_softgate_v1';

const SOFT_GATE_DEFAULT: SoftGateState = {
  day: '',
  counts: { scenario: 0, diagnostic: 0, 'tutor-l2': 0, 'tutor-l3': 0 },
  prompted: { scenario: false, diagnostic: false, 'tutor-l2': false, 'tutor-l3': false },
};

const SOFT_GATE_THRESHOLDS: Record<SoftGateKey, number> = {
  scenario: 3,
  diagnostic: 2,
  'tutor-l2': 2,
  'tutor-l3': 1,
};

function todayKey(): string {
  const d = new Date();
  const y = String(d.getFullYear());
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function readSoftGateState(): SoftGateState {
  try {
    const raw = localStorage.getItem(SOFT_GATE_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as SoftGateState) : null;
    const t = todayKey();
    if (!parsed || parsed.day !== t) {
      return { ...SOFT_GATE_DEFAULT, day: t };
    }
    // Merge defensively in case schema evolves.
    return {
      day: parsed.day || t,
      counts: { ...SOFT_GATE_DEFAULT.counts, ...(parsed.counts || {}) },
      prompted: { ...SOFT_GATE_DEFAULT.prompted, ...(parsed.prompted || {}) },
    };
  } catch {
    return { ...SOFT_GATE_DEFAULT, day: todayKey() };
  }
}

function writeSoftGateState(state: SoftGateState) {
  try {
    localStorage.setItem(SOFT_GATE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

type ScenarioPersona =
  | 'Skeptical Heckler'
  | 'Friendly Volunteer'
  | 'Distracted Corporate Guest'
  | 'Enthusiastic Child'
  | 'Quiet Analytical Viewer';

const SCENARIO_PERSONAS: ScenarioPersona[] = [
  'Skeptical Heckler',
  'Friendly Volunteer',
  'Distracted Corporate Guest',
  'Enthusiastic Child',
  'Quiet Analytical Viewer',
];

// Tier 4 — Magic Theory Tutor
type TutorLevel = 1 | 2 | 3;
type TutorStep = {
  level: TutorLevel;
  title: string;
  term: string;
  quiz: string;
  tip?: string;
};

const TUTOR_STEPS: TutorStep[] = [
  {
    level: 1,
    title: 'Level 1 — Fundamentals',
    term: 'Beat',
    quiz: 'In a 3-phase routine, where would you place a clear beat so the audience understands what just changed?',
    tip: 'Hint: a beat is usually a pause or a marked moment right after an action lands.'
  },
  {
    level: 1,
    title: 'Level 1 — Fundamentals',
    term: 'Clarity',
    quiz: 'What is one sentence you could add that makes the “moment of magic” unmistakable for the audience?',
  },
  {
    level: 1,
    title: 'Level 1 — Fundamentals',
    term: 'Framing',
    quiz: 'How would you frame the premise so spectators know their role and what success looks like?',
  },
  {
    level: 2,
    title: 'Level 2 — Advanced Tools',
    term: 'Dual Reality',
    quiz: 'Where could dual reality help create a stronger reveal without confusing the rest of the audience?',
  },
  {
    level: 2,
    title: 'Level 2 — Advanced Tools',
    term: 'Psychological Forces',
    quiz: 'Give one ethical way you could use psychological forces to guide a choice while keeping it fair and fun.',
    tip: 'We keep this high-level: no exposure, no step-by-step methods. Focus on framing and participant experience.'
  },
  {
    level: 3,
    title: 'Level 3 — Structure Mastery',
    term: 'Narrative Structure',
    quiz: 'Describe a simple story arc (setup → tension → payoff) that could connect two effects into one routine.',
  },
  {
    level: 3,
    title: 'Level 3 — Structure Mastery',
    term: 'Time Misdirection',
    quiz: 'Where would you place the offbeat in this routine, and what would you do during it to protect the method?',
  },
];

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

const inferClassicDefinition = (t: DictionaryTerm): string => {
  const v = (t.classicDefinition || '').trim();
  if (v) return v;
  return (t.definition || '').trim();
};

const inferModernApplication = (t: DictionaryTerm): string => {
  const v = (t.modernApplication || '').trim();
  if (v) return v;

  // If the term has an explicit “why it matters”, reframe it as practical application.
  if (t.whyItMatters && t.whyItMatters.trim()) {
    return `${t.whyItMatters.trim()}\n\nModern takeaway: identify the audience’s focus *right now* (eyes + thoughts), then design your words, timing, and staging so the focus lands where you want—without looking like you are “steering” it.`;
  }

  // Fallback: use the scenario as an applied example.
  return `Modern application: ${inferScenario(t)}`;
};

const inferEthicalReminder = (t: DictionaryTerm): string => {
  const v = (t.ethicalReminder || '').trim();
  if (v) return v;
  return 'Use this concept to strengthen clarity and wonder—not to embarrass spectators. Keep interactions safe, respectful, and consent-based.';
};

const NO_EXPOSURE_POLICY =
  'No exposure policy: do not reveal methods, gimmicks, secret setups, or step-by-step instructions in public-facing contexts. Focus on presentation, structure, and audience experience.';

type StudyList = {
  id: string;
  name: string;
  termSlugs: string[];
  createdAt: number;
};

type StudyState = {
  version: 1;
  bookmarked: Record<string, { notes?: string; lists?: string[] }>; // key = termSlug
  lists: Record<string, StudyList>;
};

const STUDY_STORAGE_KEY = 'maw_dictionary_study_v1';

const loadStudyState = (): StudyState => {
  if (typeof window === 'undefined') return { version: 1, bookmarked: {}, lists: {} };
  try {
    const raw = window.localStorage.getItem(STUDY_STORAGE_KEY);
    if (!raw) return { version: 1, bookmarked: {}, lists: {} };
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1) return { version: 1, bookmarked: {}, lists: {} };
    return {
      version: 1,
      bookmarked: typeof parsed.bookmarked === 'object' && parsed.bookmarked ? parsed.bookmarked : {},
      lists: typeof parsed.lists === 'object' && parsed.lists ? parsed.lists : {},
    };
  } catch {
    return { version: 1, bookmarked: {}, lists: {} };
  }
};

const saveStudyState = (state: StudyState) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STUDY_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
};

const MagicDictionary: React.FC<Props> = ({ onAiSpark, membership = 'trial', onRequestUpgrade }) => {
  const { shows } = useAppState();

  const isProfessional = membership === 'professional';

  const bumpSoftGate = (key: SoftGateKey) => {
    if (typeof window === 'undefined') return;
    const st = readSoftGateState();
    st.counts[key] = (st.counts[key] || 0) + 1;

    const threshold = SOFT_GATE_THRESHOLDS[key] ?? 0;
    const over = st.counts[key] > threshold;
    const shouldPrompt = !isProfessional && over && !st.prompted[key];

    if (shouldPrompt) {
      st.prompted[key] = true;
      // Soft prompt: open upgrade modal, but do not block the action.
      try { onRequestUpgrade && onRequestUpgrade(); } catch { /* ignore */ }
    }

    writeSoftGateState(st);
  };
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedTerm, setExpandedTerm] = useState<string | null>(null);
  const [expandedTechTerm, setExpandedTechTerm] = useState<string | null>(null);

  // Two-layer dictionary architecture:
  //  - core: curated Performance Intelligence concepts (deep + AI-powered)
  //  - terms: static Technique & Terms taxonomy (high-level, non-exposure)
  const [layer, setLayer] = useState<DictionaryLayer>('core');
  const [techCategory, setTechCategory] = useState<TechniqueCategory>('All');

  // Tier 3 – Scenario Simulator
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [scenarioTerm, setScenarioTerm] = useState<DictionaryTerm | null>(null);
  const [scenarioPersona, setScenarioPersona] = useState<ScenarioPersona>('Skeptical Heckler');
  const [scenarioGoal, setScenarioGoal] = useState('');

  // Tier 3 – Performance Diagnostic
  const [diagnosticOpen, setDiagnosticOpen] = useState(false);
  const [diagnosticScript, setDiagnosticScript] = useState('');
  const [diagnosticShowId, setDiagnosticShowId] = useState<string>('');
  const [diagnosticRoutine, setDiagnosticRoutine] = useState('');
  const [conceptFilter, setConceptFilter] = useState<'All' | ConceptCategory>('All');
  const [difficultyFilter, setDifficultyFilter] = useState<'All' | DifficultyLevel>('All');

  // Tier-2: Saved Study Concepts
  const [study, setStudy] = useState<StudyState>(() => loadStudyState());
  const [studyOpen, setStudyOpen] = useState(false);
  const [newListName, setNewListName] = useState('');

  // Tier-4: Magic Theory Tutor Mode
  const [tutorOpen, setTutorOpen] = useState(false);
  const [tutorLevel, setTutorLevel] = useState<TutorLevel>(1);
  const [tutorIndex, setTutorIndex] = useState(0); // index within filtered steps for selected level
  const [tutorAnswer, setTutorAnswer] = useState('');

  // Tier-2: Apply concept to a show
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyTerm, setApplyTerm] = useState<DictionaryTerm | null>(null);
  const [applyShowId, setApplyShowId] = useState<string>('');
  const [applyTaskId, setApplyTaskId] = useState<string>('');

  // Tier-2: Concept map
  const [mapOpen, setMapOpen] = useState(false);
  const [mapTerm, setMapTerm] = useState<DictionaryTerm | null>(null);

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

  // Layer 2: Technique & Terms (static taxonomy)
  const sortedTechniqueTerms = useMemo(() => {
    return [...(MAGIC_TECHNIQUE_TERMS as TechniqueTerm[])]
      .filter(Boolean)
      .sort((a, b) => a.term.localeCompare(b.term));
  }, []);

  const filteredTechniqueTerms = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return sortedTechniqueTerms.filter((t) => {
      if (!t) return false;
      const matchesCategory = techCategory === 'All' || t.category === techCategory;
      const matchesSearch =
        !q ||
        t.term.toLowerCase().includes(q) ||
        (t.definition || '').toLowerCase().includes(q) ||
        (t.historicalNote || '').toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [sortedTechniqueTerms, techCategory, searchTerm]);

  // Tier-4: Tutor steps for current level
  const tutorSteps = useMemo(() => {
    return TUTOR_STEPS.filter((s) => s.level === tutorLevel);
  }, [tutorLevel]);

  const currentTutorStep = tutorSteps[Math.max(0, Math.min(tutorSteps.length - 1, tutorIndex))];

  const findTerm = (name: string): DictionaryTerm | null => {
    const n = (name || '').trim().toLowerCase();
    const hit = sortedTerms.find((t) => (t.term || '').trim().toLowerCase() === n);
    return hit || null;
  };

  const clearFilters = () => {
    setSearchTerm('');
    setConceptFilter('All');
    setDifficultyFilter('All');
    setTechCategory('All');
  };

  const isFiltered =
    searchTerm.trim() !== '' ||
    (layer === 'core' ? conceptFilter !== 'All' || difficultyFilter !== 'All' : techCategory !== 'All');

  useEffect(() => {
    saveStudyState(study);
  }, [study]);

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

  const termSlug = (t: DictionaryTerm | string) => slugify(typeof t === 'string' ? t : t.term);

  const isBookmarked = (item: DictionaryTerm) => Boolean(study.bookmarked[termSlug(item)]);

  const toggleBookmark = (item: DictionaryTerm) => {
    const key = termSlug(item);
    setStudy((prev) => {
      const next: StudyState = { ...prev, bookmarked: { ...prev.bookmarked }, lists: { ...prev.lists } };
      if (next.bookmarked[key]) {
        // Remove from lists as well
        delete next.bookmarked[key];
        Object.values(next.lists).forEach((l) => {
          l.termSlugs = l.termSlugs.filter((x) => x !== key);
        });
      } else {
        next.bookmarked[key] = { notes: '', lists: [] };
      }
      return next;
    });
  };

  const createStudyList = () => {
    const name = newListName.trim();
    if (!name) return;
    const id = `list_${Date.now()}`;
    setStudy((prev) => {
      const next: StudyState = { ...prev, bookmarked: { ...prev.bookmarked }, lists: { ...prev.lists } };
      next.lists[id] = { id, name, termSlugs: [], createdAt: Date.now() };
      return next;
    });
    setNewListName('');
  };

  const setBookmarkNotes = (item: DictionaryTerm, notes: string) => {
    const key = termSlug(item);
    setStudy((prev) => {
      if (!prev.bookmarked[key]) return prev;
      return {
        ...prev,
        bookmarked: {
          ...prev.bookmarked,
          [key]: { ...prev.bookmarked[key], notes },
        },
      };
    });
  };

  const toggleTermInList = (item: DictionaryTerm, listId: string) => {
    const key = termSlug(item);
    setStudy((prev) => {
      const list = prev.lists[listId];
      if (!list) return prev;
      const exists = list.termSlugs.includes(key);

      const nextList: StudyList = {
        ...list,
        termSlugs: exists ? list.termSlugs.filter((x) => x !== key) : [...list.termSlugs, key],
      };

      const nextBookmarked = { ...prev.bookmarked };
      if (!nextBookmarked[key]) nextBookmarked[key] = { notes: '', lists: [] };

      const currentLists = new Set(nextBookmarked[key].lists || []);
      if (exists) currentLists.delete(listId);
      else currentLists.add(listId);
      nextBookmarked[key] = { ...nextBookmarked[key], lists: Array.from(currentLists) };

      return {
        ...prev,
        bookmarked: nextBookmarked,
        lists: { ...prev.lists, [listId]: nextList },
      };
    });
  };

  const getTermBySlug = (slug: string): DictionaryTerm | undefined =>
    sortedTerms.find((t) => t && termSlug(t) === slug);

  const connectionsFor = (item: DictionaryTerm): string[] => {
    const base = new Set<string>();
    (item.relatedTerms || []).forEach((t) => base.add(t));
    // Reverse links: any term that lists this term as related
    sortedTerms.forEach((t) => {
      if (!t?.relatedTerms?.length) return;
      const isRelated = t.relatedTerms.some((rt) => termSlug(rt) === termSlug(item) || rt.toLowerCase() === item.term.toLowerCase());
      if (isRelated) base.add(t.term);
    });
    return Array.from(base)
      .filter((x) => x && x.toLowerCase() !== item.term.toLowerCase())
      .sort((a, b) => a.localeCompare(b));
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

  const openApply = (item: DictionaryTerm) => {
    setApplyTerm(item);
    setApplyOpen(true);
    setApplyShowId(shows?.[0]?.id || '');
    setApplyTaskId('');
  };

  const runApplyToShow = () => {
    if (!onAiSpark || !applyTerm) return;
    const show = (shows || []).find((s) => s.id === applyShowId);
    const task = show?.tasks?.find((t) => t.id === applyTaskId);

    const concept = inferConceptCategory(applyTerm);
    const difficulty = inferDifficulty(applyTerm);

    const prompt = [
      `You are my magic director + theory coach. Apply the concept below to my real show/routine. Do NOT expose secrets or methods; focus on performance, framing, scripting, and audience management.`,
      '',
      `CONCEPT: ${applyTerm.term}`,
      `CATEGORY: ${concept}`,
      `DIFFICULTY: ${difficulty}`,
      '',
      `Definition: ${applyTerm.definition}`,
      applyTerm.whyItMatters ? `Why it matters: ${applyTerm.whyItMatters}` : '',
      applyTerm.beginnerMistakes?.length
        ? `Common mistakes:\n${applyTerm.beginnerMistakes.map((m) => `- ${m}`).join('\n')}`
        : '',
      '',
      show ? `SHOW: ${show.title}` : 'SHOW: (not selected)',
      show?.description ? `Show notes: ${show.description}` : '',
      task ? `ROUTINE/TASK: ${task.title}` : '',
      task?.notes ? `Task notes: ${task.notes}` : '',
      '',
      `Give me actionable output in this format:`,
      `1) What to change (3–6 bullets)`,
      `2) A short script/patter tweak example (safe, non-exposure)`,
      `3) Blocking / audience focus notes (angles, staging, attention cues)`,
      `4) 3 rehearsal drills specific to this show` ,
      `5) One advanced “upgrade” idea if appropriate`,
    ]
      .filter(Boolean)
      .join('\n');

    setApplyOpen(false);
    onAiSpark({ type: 'custom-prompt', payload: { prompt } });
  };

  const openConceptMap = (item: DictionaryTerm) => {
    setMapTerm(item);
    setMapOpen(true);
  };

  // Tier 3: Scenario Simulator (turn concept → rehearsal interaction)
  const openScenario = (item: DictionaryTerm) => {
    setScenarioTerm(item);
    setScenarioGoal('');
    setScenarioPersona('Skeptical Heckler');
    setScenarioOpen(true);
  };

  const runScenario = () => {
    if (!onAiSpark || !scenarioTerm) return;

    const concept = inferConceptCategory(scenarioTerm);
    const difficulty = inferDifficulty(scenarioTerm);
    const goal = scenarioGoal.trim();

    const prompt = [
      `You are an AI audience member simulator for a live magic show. You MUST stay in character and help me rehearse without exposing secrets or methods.`,
      '',
      `CONCEPT TO TEST: ${scenarioTerm.term}`,
      `CATEGORY: ${concept}`,
      `DIFFICULTY: ${difficulty}`,
      '',
      `PERSONA: ${scenarioPersona}`,
      goal ? `MY GOAL: ${goal}` : '',
      '',
      `Instructions:`,
      `- Start by creating a realistic moment where this concept matters (e.g., a heckler challenges me, a volunteer hesitates, a corporate guest interrupts).`,
      `- Ask me (the magician) to respond. After I respond, react as the persona would.`,
      `- Run 4 rounds total. Keep each of your replies short (1–3 sentences).`,
      `- After the 4th round, break character and give me a short coaching debrief using the concept name (and 2–3 related concepts if relevant).`,
      '',
      `Begin now with Round 1.`,
    ]
      .filter(Boolean)
      .join('\n');

    bumpSoftGate('scenario');
    setScenarioOpen(false);
    onAiSpark({ type: 'custom-prompt', payload: { prompt } });
  };

  // Tier 3: Performance Diagnostic (script → concept-based critique)
  const openDiagnostic = () => {
    setDiagnosticOpen(true);
  };

  // Tier 4: Magic Theory Tutor
  const openTutor = () => {
    setTutorOpen(true);
    // Ensure index stays in range when reopening
    setTutorIndex((idx) => Math.max(0, Math.min((TUTOR_STEPS.filter((s) => s.level === tutorLevel).length || 1) - 1, idx)));
  };

  const startTutorLevel = (lvl: TutorLevel) => {
    if (lvl === 2) bumpSoftGate('tutor-l2');
    if (lvl === 3) bumpSoftGate('tutor-l3');
    setTutorLevel(lvl);
    setTutorIndex(0);
    setTutorAnswer('');
  };

  const tutorGoPrev = () => {
    setTutorIndex((i) => Math.max(0, i - 1));
    setTutorAnswer('');
  };

  const tutorGoNext = () => {
    setTutorIndex((i) => Math.min(Math.max(0, tutorSteps.length - 1), i + 1));
    setTutorAnswer('');
  };

  const tutorAskAiFeedback = () => {
    if (!onAiSpark) return;
    const step = currentTutorStep;
    if (!step) return;

    const termObj = findTerm(step.term);
    const answer = tutorAnswer.trim();
    if (!answer) return;

    const prompt = [
      `You are my Magic Theory Tutor. Stay ethical and DO NOT expose secrets or methods.`,
      `I'm studying "${step.term}" (${step.title}).`,
      '',
      termObj
        ? `Dictionary context:\n- Classic definition: ${inferClassicDefinition(termObj)}\n- Modern application: ${inferModernApplication(termObj)}`
        : `Dictionary context: term may not exist yet; treat it as a performance theory concept and stay high-level.`,
      '',
      `Quiz question: ${step.quiz}`,
      `My answer: ${answer}`,
      '',
      `Give feedback in this format:`,
      `1) What I did well (2 bullets)`,
      `2) What to improve (2 bullets)`,
      `3) A stronger example answer (short)`,
      `4) A mini-drill I can do in rehearsal (1 drill)`,
      `5) Dictionary References: list 2–4 related concept names (e.g., "Dictionary → Offbeat")`,
    ].join('\n');

    onAiSpark({ type: 'custom-prompt', payload: { prompt } });
  };

  const runDiagnostic = () => {
    if (!onAiSpark) return;
    const script = diagnosticScript.trim();
    if (!script) return;

    const show = (shows || []).find((s) => s.id === diagnosticShowId);
    const dictCore = ['Clarity', 'Conviction', 'Framing', 'Beat', 'Offbeat', 'Misdirection', 'Applause Cue', 'Angle Sensitivity', 'Audience Control'];

    const prompt = [
      `You are my performance director + magic theory coach. Diagnose my script WITHOUT exposing secrets.`,
      `Your job is to find weaknesses and opportunities using Magic Dictionary concepts by name (so I can look them up).`,
      '',
      show ? `SHOW CONTEXT: ${show.title}${show.description ? ` — ${show.description}` : ''}` : '',
      diagnosticRoutine.trim() ? `ROUTINE: ${diagnosticRoutine.trim()}` : '',
      '',
      `SCRIPT:`,
      script,
      '',
      `Analyze for:`,
      `- Missing Clarity (confusing beats, unclear moments, weak “this is the moment”)`,
      `- Weak Conviction (apology words, hedging, low-status phrasing)`,
      `- Poor Framing (unclear premise, stakes, or role for the audience)`,
      `- Misplaced Beat / Offbeat (pauses, transitions, resets, applause timing)`,
      `- Misdirection / Attention Control issues (where focus should go)`,
      '',
      `Output format (keep it practical):`,
      `1) Quick Diagnosis (3–6 bullets)`,
      `2) Line-level edits (quote short fragments, then show improved versions)`,
      `3) Rehearsal Drills (3 drills)`,
      `4) Dictionary References: list concept names you used, like “Dictionary → Framing”, “Dictionary → Offbeat”, etc.`,
      '',
      `Core concepts you should try to use when applicable: ${dictCore.join(', ')}`,
    ]
      .filter(Boolean)
      .join('\n');

    bumpSoftGate('diagnostic');
    setDiagnosticOpen(false);
    onAiSpark({ type: 'custom-prompt', payload: { prompt } });
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto p-4 md:p-6 animate-fade-in">
      {/* Technique view should start higher to avoid a “blank band” above the taxonomy/cards. */}
      <header className={layer === 'core' ? "mb-6" : "mb-2"}>
        <div className="flex items-center gap-3">
          <TutorIcon className="w-8 h-8 text-purple-400" />
          <div>
            <h2 className="text-2xl font-bold text-slate-200 font-cinzel">Magic Dictionary</h2>
            <p className="text-slate-400 mt-1">A curated reference of professional magic terms and performance concepts.</p>
            <p className={layer === 'core' ? 'text-xs text-slate-500 mt-1' : 'text-xs text-slate-500 mt-0.5'}>
              {layer === 'core'
                ? `Performance Intelligence Framework • ${sortedTerms.length} curated principles`
                : `Technique & Term Reference • ${sortedTechniqueTerms.length} high-level terms`}
            </p>
          </div>
        </div>
      </header>

      {/* Filters Bar */}
      <div className={layer === 'core' ? 'sticky top-0 bg-slate-900/80 backdrop-blur-sm py-2 z-10' : 'sticky top-0 bg-slate-900/80 backdrop-blur-sm py-1.5 z-10'}>
        {/*
          Core view needs a denser control matrix (chips + difficulty + tools).
          Technique view should stay lean to avoid wasted horizontal space.
        */}
        <div
          className={
            layer === 'core'
              ? 'grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3'
              : 'flex flex-col md:flex-row md:items-center gap-3'
          }
        >
          {/* Layer Toggle */}
          <div className={layer === 'core' ? 'flex flex-wrap items-center gap-2' : 'flex flex-wrap items-center gap-2 lg:shrink-0'}>
            <div className="inline-flex rounded-full border border-slate-700 bg-slate-800/40 overflow-hidden">
              <button
                type="button"
                onClick={() => {
                  setLayer('core');
                  // keep search, but reset technique category for cleanliness
                  setTechCategory('All');
                  setExpandedTechTerm(null);
                }}
                className={[
                  'px-4 py-2 text-sm transition-colors',
                  layer === 'core' ? 'bg-purple-600/20 text-purple-100' : 'bg-transparent text-slate-300 hover:text-white',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60',
                ].join(' ')}
                aria-pressed={layer === 'core'}
              >
                Core Performance Intelligence
              </button>
              <button
                type="button"
                onClick={() => {
                  setLayer('terms');
                  // Technique view shouldn't inherit core-only filters
                  setConceptFilter('All');
                  setDifficultyFilter('All');
                  setExpandedTerm(null);
                  setExpandedTechTerm(null);
                }}
                className={[
                  'px-4 py-2 text-sm transition-colors',
                  layer === 'terms' ? 'bg-purple-600/20 text-purple-100' : 'bg-transparent text-slate-300 hover:text-white',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60',
                ].join(' ')}
                aria-pressed={layer === 'terms'}
              >
                Technique & Terms
              </button>
            </div>

            <div
              className={
                layer === 'core'
                  ? 'ml-auto text-xs text-slate-400'
                  : 'w-full md:w-auto md:ml-auto text-xs text-slate-400'
              }
            >
              {layer === 'core' ? 'Deep concepts + coaching tools' : 'High-level taxonomy (non-exposure)'}
            </div>
          </div>
          {/* Search */}
          <div
            className={
              layer === 'core'
                ? 'flex items-center bg-slate-800 border border-slate-700 rounded-lg overflow-hidden'
                : 'flex items-center bg-slate-800 border border-slate-700 rounded-lg overflow-hidden w-full lg:flex-1'
            }
          >
            <div className="pl-4 pr-2 text-slate-500">
              <SearchIcon className="w-5 h-5" />
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={layer === 'core' ? 'Search terms, definitions, mistakes…' : 'Search technique terms…'}
              className={layer === 'core'
                ? 'flex-1 w-full bg-transparent pr-4 py-2 text-white placeholder-slate-400 focus:outline-none'
                : 'flex-1 w-full bg-transparent pr-4 py-1.5 text-white placeholder-slate-400 focus:outline-none'}
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

            {layer === 'core' ? (
              <>
                <button
                  type="button"
                  onClick={openTutor}
                  className="mr-3 px-3 py-2 text-sm rounded-lg border border-amber-400/30 bg-amber-400/10 text-amber-200 hover:bg-amber-400/15 hover:border-amber-300/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60"
                  aria-label="Open Magic Theory Tutor"
                  title="Guided study path + quizzes (Tier 4)"
                >
                  Tutor
                </button>

                <button
                  type="button"
                  onClick={() => setStudyOpen(true)}
                  className="mr-3 px-3 py-2 text-sm rounded-lg border border-slate-700 bg-slate-900/40 text-slate-200 hover:text-white hover:border-slate-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60"
                  aria-label="Open Study Concepts"
                  title="Bookmarked concepts, study lists, and notes"
                >
                  Study
                </button>

                <button
                  type="button"
                  onClick={openDiagnostic}
                  className="mr-3 px-3 py-2 text-sm rounded-lg border border-purple-500/40 bg-purple-600/15 text-purple-100 hover:bg-purple-600/25 hover:border-purple-400/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60"
                  aria-label="Open performance diagnostic"
                  title="Paste a script and get a dictionary-based performance diagnosis"
                >
                  <span className="flex items-center gap-2">
                    Diagnose Script
                    {!isProfessional ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full border border-amber-400/35 bg-amber-400/10 text-amber-200">PRO</span>
                    ) : null}
                  </span>
                </button>
              </>
            ) : null}
          </div>

            {layer === 'core' ? (
            <>
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
            </>
          ) : null}
        </div>
      </div>

      {/* Cards */}
      <div className={layer === 'core' ? 'mt-4' : 'mt-2'}>
        {layer === 'core' ? (
          filteredTerms.length > 0 ? (
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

                      <div className="flex items-center gap-2 flex-shrink-0 mt-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleBookmark(item);
                          }}
                          className={[
                            'inline-flex items-center justify-center w-9 h-9 rounded-lg border transition-colors',
                            isBookmarked(item)
                              ? 'border-amber-400/40 bg-amber-400/10 text-amber-200 hover:bg-amber-400/15'
                              : 'border-slate-700 bg-slate-900/30 text-slate-400 hover:text-white hover:border-slate-600',
                            'focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60',
                          ].join(' ')}
                          aria-label={isBookmarked(item) ? 'Remove bookmark' : 'Bookmark this concept'}
                          title={isBookmarked(item) ? 'Bookmarked (click to remove)' : 'Bookmark this concept'}
                        >
                          <BookIcon className="w-4 h-4" />
                        </button>

                        <ChevronDownIcon
                          className={[
                            'w-6 h-6 text-purple-200/80',
                            'transition-transform duration-300',
                            isExpanded ? 'rotate-180' : '',
                          ].join(' ')}
                        />
                      </div>
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

                        {/* Tier-4: Modern interpretations */}
                        <div className="rounded-xl border border-slate-700 bg-slate-900/30 p-4">
                          <h4 className={`text-sm font-semibold ${GOLD_MUTED} mb-3`}>🧠 Modern Interpretations</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <div className="text-xs font-semibold text-slate-400 mb-1">Classic Definition</div>
                              <p className="text-slate-200 leading-relaxed whitespace-pre-line">{inferClassicDefinition(item)}</p>
                            </div>
                            <div>
                              <div className="text-xs font-semibold text-slate-400 mb-1">Modern Application</div>
                              <p className="text-slate-300 leading-relaxed whitespace-pre-line">{inferModernApplication(item)}</p>
                            </div>
                          </div>
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

                        {/* Tier-4: Ethical + no exposure guardrails */}
                        <div className="rounded-xl border border-slate-700 bg-slate-900/30 p-4">
                          <h4 className={`text-sm font-semibold ${GOLD_MUTED} mb-2`}>🛡 Ethics & Guardrails</h4>
                          <p className="text-slate-300 leading-relaxed">{inferEthicalReminder(item)}</p>
                          <p className="mt-2 text-sm text-slate-400 leading-relaxed">{NO_EXPOSURE_POLICY}</p>
                        </div>

                        {/* Saved Study Concepts */}
                        <div className="rounded-xl border border-slate-700 bg-slate-900/30 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h4 className={`text-sm font-semibold ${GOLD_MUTED}`}>Saved Study Concept</h4>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                toggleBookmark(item);
                              }}
                              className={[
                                'inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors',
                                isBookmarked(item)
                                  ? 'border-amber-400/40 bg-amber-400/10 text-amber-200 hover:bg-amber-400/15'
                                  : 'border-slate-700 bg-slate-900/40 text-slate-300 hover:text-white hover:border-slate-600',
                                'focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60',
                              ].join(' ')}
                            >
                              <BookIcon className="w-4 h-4" />
                              {isBookmarked(item) ? 'Bookmarked' : 'Bookmark'}
                            </button>
                          </div>

                          {isBookmarked(item) ? (
                            <div className="mt-4 space-y-3">
                              {/* Notes */}
                              <div>
                                <label className="block text-xs font-semibold text-slate-400 mb-1">Notes</label>
                                <textarea
                                  value={study.bookmarked[termSlug(item)]?.notes || ''}
                                  onChange={(e) => setBookmarkNotes(item, e.target.value)}
                                  placeholder="What do you want to remember / practice?"
                                  className="w-full min-h-[84px] rounded-lg bg-slate-950/40 border border-slate-700 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60"
                                />
                              </div>

                              {/* Lists */}
                              <div>
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-semibold text-slate-400">Study Lists</span>
                                  <button
                                    type="button"
                                    onClick={() => setStudyOpen(true)}
                                    className="text-xs text-purple-300 hover:text-white transition-colors"
                                  >
                                    Manage
                                  </button>
                                </div>
                                {Object.keys(study.lists).length ? (
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {Object.values(study.lists)
                                      .sort((a, b) => a.name.localeCompare(b.name))
                                      .map((l) => {
                                        const on = l.termSlugs.includes(termSlug(item));
                                        return (
                                          <button
                                            key={l.id}
                                            type="button"
                                            onClick={() => toggleTermInList(item, l.id)}
                                            className={[
                                              'text-xs px-2 py-1 rounded-full border transition-colors',
                                              on
                                                ? 'bg-purple-600/20 border-purple-500/40 text-purple-100'
                                                : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:text-white hover:border-slate-600',
                                              'focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60',
                                            ].join(' ')}
                                          >
                                            {l.name}
                                          </button>
                                        );
                                      })}
                                  </div>
                                ) : (
                                  <p className="mt-2 text-sm text-slate-500">No study lists yet. Create one in Study →</p>
                                )}
                              </div>
                            </div>
                          ) : (
                            <p className="mt-3 text-sm text-slate-500">
                              Bookmark this term to create notes and add it to study lists.
                            </p>
                          )}
                        </div>

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
                            className={[
                              'inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border',
                              onAiSpark
                                ? 'border-amber-400/30 bg-amber-400/10 text-amber-200 hover:bg-amber-400/15 hover:border-amber-300/40'
                                : 'border-slate-700 bg-slate-900/40 text-slate-500 cursor-not-allowed',
                              'transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60',
                            ].join(' ')}
                            onClick={() => openApply(item)}
                            disabled={!onAiSpark}
                            aria-label="Apply this concept to my show"
                            title={!onAiSpark ? 'AI actions unavailable in this view' : 'Apply this concept to a show or routine'}
                          >
                            Apply This to My Show
                          </button>

                          <button
                            type="button"
                            className={[
                              'inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border',
                              onAiSpark
                                ? 'border-purple-500/40 bg-slate-900/40 text-slate-200 hover:text-white hover:border-purple-400/60 hover:bg-slate-900/55'
                                : 'border-slate-700 bg-slate-900/40 text-slate-500 cursor-not-allowed',
                              'transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60',
                            ].join(' ')}
                            onClick={() => openScenario(item)}
                            disabled={!onAiSpark}
                            aria-label="Test this concept"
                            title={!onAiSpark ? 'AI actions unavailable in this view' : 'Run a rehearsal-style scenario in chat'}
                          >
                            <span className="flex items-center gap-2">
                              Test This Concept
                              {!isProfessional ? (
                                <span className="text-[10px] px-2 py-0.5 rounded-full border border-amber-400/35 bg-amber-400/10 text-amber-200">PRO</span>
                              ) : null}
                            </span>
                          </button>

                          <button
                            type="button"
                            className="px-3 py-2 text-sm rounded-lg border border-slate-700 bg-slate-900/40 text-slate-300 hover:text-white hover:border-slate-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60"
                            onClick={() => openConceptMap(item)}
                            aria-label="View concept map"
                            title="View concept connections"
                          >
                            View Concept Map
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
          )
        ) : (
          // Technique & Terms: use a real grid (not flex) so the term cards start at the top
          // alongside the taxonomy, even on mid-sized screens.
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {/* Left taxonomy sidebar */}
            <aside className="md:col-span-4 xl:col-span-3 bg-slate-800/30 border border-slate-700 rounded-xl p-3 md:sticky md:top-20 h-fit">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-400">Technique Categories</p>
                <button
                  type="button"
                  onClick={() => setTechCategory('All')}
                  className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
                >
                  All
                </button>
              </div>

              <div className="mt-2 space-y-1">
                {(
                  [
                    'Sleights',
                    'Forces',
                    'Gimmicks',
                    'Stage Terminology',
                    'Equipment',
                    'Method Classifications',
                  ] as Exclude<TechniqueCategory, 'All'>[]
                ).map((c) => {
                  const active = techCategory === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setTechCategory(c)}
                      className={[
                        'w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors',
                        active
                          ? 'bg-purple-600/20 border-purple-500/40 text-purple-100'
                          : 'bg-slate-900/30 border-slate-700 text-slate-300 hover:text-white hover:border-slate-600',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60',
                      ].join(' ')}
                      aria-pressed={active}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 pt-4 border-t border-slate-700/60">
                <p className="text-xs text-slate-500 leading-relaxed">
                  This tab is a <span className="text-slate-300">high-level reference</span>. It avoids method mechanics,
                  construction details, and step-by-step handling.
                </p>
              </div>
            </aside>

            {/* Term cards */}
            <section className="md:col-span-8 xl:col-span-9 min-w-0">
              {filteredTechniqueTerms.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {filteredTechniqueTerms.map((t) => {
                    const open = expandedTechTerm === t.term;
                    return (
                      <div
                        key={`${t.category}-${t.term}`}
                        className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden"
                      >
                        <button
                          type="button"
                          onClick={() => setExpandedTechTerm(open ? null : t.term)}
                          className="w-full text-left p-3 hover:bg-slate-700/40 transition-colors"
                          aria-expanded={open}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className={`font-bold text-lg ${GOLD} tracking-wide`}>{t.term}</h3>
                                <span className="text-[11px] px-2 py-0.5 rounded-full border border-slate-700 bg-slate-950/30 text-slate-300">
                                  {t.category}
                                </span>
                              </div>
                              <p className="mt-2 text-slate-300 text-sm leading-relaxed line-clamp-2">{clipOneLine(t.definition)}</p>
                            </div>
                            <div className="text-slate-400">
                              <ChevronDownIcon className={['w-5 h-5 transition-transform', open ? 'rotate-180 text-purple-300' : ''].join(' ')} />
                            </div>
                          </div>
                        </button>

                        {open ? (
                          <div className="px-4 pb-4">
                            <div className="pt-2 text-sm text-slate-200">
                              <p className="text-slate-300 leading-relaxed">{t.definition}</p>
                              {t.historicalNote ? (
                                <div className="mt-3 rounded-lg border border-slate-700 bg-slate-950/20 p-3">
                                  <p className="text-xs font-semibold text-slate-400">Historical Note</p>
                                  <p className="mt-1 text-sm text-slate-300 leading-relaxed">{t.historicalNote}</p>
                                </div>
                              ) : null}

                              <div className="mt-3 text-xs text-slate-500 border-t border-slate-700/60 pt-3">
                                Structural overview only. Study specific mechanics through proper instructional materials.
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12 text-slate-500">
                  <p>No terms found for “{searchTerm}”.</p>
                  <p className="mt-2 text-sm text-slate-600">Try a different keyword or choose another category.</p>
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      {/* Tier-2 Modals */}

      {/* Tier-4: Magic Theory Tutor Modal */}
      {tutorOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={() => setTutorOpen(false)} />
          <div className="relative w-full max-w-3xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-700">
              <div>
                <h3 className="text-lg font-semibold text-slate-100">Magic Theory Tutor</h3>
                <p className="text-sm text-slate-400">Guided study paths + quizzes (no exposure, practical coaching).</p>
              </div>
              <button
                type="button"
                onClick={() => setTutorOpen(false)}
                className="px-3 py-2 text-sm rounded-lg border border-slate-700 bg-slate-950/40 text-slate-200 hover:text-white hover:border-slate-600 transition-colors"
              >
                Close
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Level selector */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-slate-400 mr-1">Level:</span>
                {([1, 2, 3] as TutorLevel[]).map((lvl) => {
                  const active = tutorLevel === lvl;
                  const label = lvl === 1 ? 'Level 1: Fundamentals' : lvl === 2 ? 'Level 2: Advanced Tools' : 'Level 3: Structure Mastery';
                  return (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => startTutorLevel(lvl)}
                      className={[
                        'px-3 py-2 text-sm rounded-lg border transition-colors',
                        active ? 'bg-purple-600/20 border-purple-500/40 text-purple-100' : 'bg-slate-950/30 border-slate-700 text-slate-300 hover:text-white hover:border-slate-600',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60',
                      ].join(' ')}
                      aria-pressed={active}
                    >
                      <span className="flex items-center gap-2">
                        {label}
                        {!isProfessional && lvl !== 1 ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full border border-amber-400/35 bg-amber-400/10 text-amber-200">PRO</span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Step content */}
              {currentTutorStep ? (
                <div className="rounded-2xl border border-slate-700 bg-slate-950/30 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs text-slate-500">{currentTutorStep.title}</div>
                      <div className="text-xl font-bold text-amber-200 mt-1">{currentTutorStep.term}</div>
                    </div>
                    <div className="text-xs text-slate-500">
                      Step {Math.min(tutorSteps.length, tutorIndex + 1)} of {tutorSteps.length || 1}
                    </div>
                  </div>

                  {/* Dictionary context */}
                  {(() => {
                    const termObj = findTerm(currentTutorStep.term);
                    if (!termObj) {
                      return (
                        <p className="mt-3 text-sm text-slate-400">
                          This concept isn’t in your dictionary yet. Tutor mode will stay high-level and focus on performance principles.
                        </p>
                      );
                    }
                    return (
                      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <div className="text-xs font-semibold text-slate-400 mb-1">Classic Definition</div>
                          <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-line">{inferClassicDefinition(termObj)}</p>
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-slate-400 mb-1">Modern Application</div>
                          <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">{inferModernApplication(termObj)}</p>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Quiz */}
<div className="mt-4">
  <div className="text-sm font-semibold text-slate-200">Quiz</div>
  <p className="mt-1 text-sm text-slate-300 leading-relaxed">{currentTutorStep.quiz}</p>
  {currentTutorStep.tip ? <p className="mt-2 text-xs text-slate-500">{currentTutorStep.tip}</p> : null}
</div>

<div className="mt-3">
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Your answer</label>
                    <textarea
                      value={tutorAnswer}
                      onChange={(e) => setTutorAnswer(e.target.value)}
                      placeholder="Write a short, practical answer…"
                      className="w-full min-h-[96px] rounded-lg bg-slate-950/40 border border-slate-700 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60"
                    />
                    <div className="mt-3 rounded-xl border border-slate-700 bg-slate-900/30 p-3">
                      <div className="text-xs font-semibold text-slate-400 mb-1">Ethics</div>
                      <p className="text-xs text-slate-500 leading-relaxed">{NO_EXPOSURE_POLICY}</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={tutorGoPrev}
                        disabled={tutorIndex <= 0}
                        className={[
                          'px-3 py-2 text-sm rounded-lg border transition-colors',
                          tutorIndex <= 0 ? 'border-slate-700 bg-slate-900/40 text-slate-500 cursor-not-allowed' : 'border-slate-700 bg-slate-950/40 text-slate-200 hover:text-white hover:border-slate-600',
                          'focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60',
                        ].join(' ')}
                      >
                        Prev
                      </button>
                      <button
                        type="button"
                        onClick={tutorGoNext}
                        disabled={tutorIndex >= Math.max(0, tutorSteps.length - 1)}
                        className={[
                          'px-3 py-2 text-sm rounded-lg border transition-colors',
                          tutorIndex >= Math.max(0, tutorSteps.length - 1)
                            ? 'border-slate-700 bg-slate-900/40 text-slate-500 cursor-not-allowed'
                            : 'border-slate-700 bg-slate-950/40 text-slate-200 hover:text-white hover:border-slate-600',
                          'focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60',
                        ].join(' ')}
                      >
                        Next
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={tutorAskAiFeedback}
                      disabled={!onAiSpark || !currentTutorStep || !tutorAnswer.trim()}
                      className={[
                        'px-4 py-2 text-sm rounded-lg border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60',
                        !onAiSpark || !tutorAnswer.trim()
                          ? 'border-slate-700 bg-slate-900/40 text-slate-500 cursor-not-allowed'
                          : 'border-amber-400/30 bg-amber-400/10 text-amber-200 hover:bg-amber-400/15 hover:border-amber-300/40',
                      ].join(' ')}
                      title={!onAiSpark ? 'AI actions unavailable in this view' : 'Send your answer to the AI Tutor for feedback'}
                    >
                      Get AI Feedback
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-700 bg-slate-950/30 p-4">
                  <p className="text-sm text-slate-300">No tutor steps found for this level.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {studyOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
            onClick={() => setStudyOpen(false)}
          />
          <div className="relative w-full max-w-3xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-700">
              <div>
                <h3 className="text-lg font-semibold text-slate-100">Study Concepts</h3>
                <p className="text-sm text-slate-400">Bookmarks, study lists, and personal notes.</p>
              </div>
              <button
                type="button"
                onClick={() => setStudyOpen(false)}
                className="px-3 py-2 text-sm rounded-lg border border-slate-700 bg-slate-950/40 text-slate-200 hover:text-white hover:border-slate-600 transition-colors"
              >
                Close
              </button>
            </div>

            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Bookmarks */}
              <div className="rounded-xl border border-slate-700 bg-slate-950/30 p-4">
                <h4 className="text-sm font-semibold text-amber-200">Bookmarked</h4>
                <p className="text-xs text-slate-500 mt-1">Click a term to open it in the dictionary.</p>

                <div className="mt-3 space-y-2 max-h-[340px] overflow-auto pr-1">
                  {Object.keys(study.bookmarked).length ? (
                    Object.keys(study.bookmarked)
                      .map((slug) => ({ slug, term: getTermBySlug(slug)?.term || slug }))
                      .sort((a, b) => a.term.localeCompare(b.term))
                      .map(({ slug, term }) => (
                        <button
                          key={slug}
                          type="button"
                          onClick={() => {
                            const t = getTermBySlug(slug)?.term || term;
                            setStudyOpen(false);
                            handleRelatedClick(t);
                          }}
                          className="w-full text-left px-3 py-2 rounded-lg border border-slate-700 bg-slate-900/40 text-slate-200 hover:border-slate-600 hover:bg-slate-900/55 transition-colors"
                        >
                          {term}
                        </button>
                      ))
                  ) : (
                    <p className="text-sm text-slate-500">No bookmarks yet. Tap the bookmark icon on a term.</p>
                  )}
                </div>
              </div>

              {/* Lists */}
              <div className="rounded-xl border border-slate-700 bg-slate-950/30 p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-slate-200">Study Lists</h4>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <input
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    placeholder="New list name…"
                    className="flex-1 rounded-lg bg-slate-950/40 border border-slate-700 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60"
                  />
                  <button
                    type="button"
                    onClick={createStudyList}
                    className="px-3 py-2 text-sm rounded-lg border border-purple-500/40 bg-purple-600/15 text-purple-100 hover:bg-purple-600/25 hover:border-purple-400/60 transition-colors"
                  >
                    Create
                  </button>
                </div>

                <div className="mt-4 space-y-3 max-h-[300px] overflow-auto pr-1">
                  {Object.keys(study.lists).length ? (
                    Object.values(study.lists)
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((l) => (
                        <div key={l.id} className="rounded-lg border border-slate-700 bg-slate-900/30 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <div className="text-sm font-semibold text-slate-100">{l.name}</div>
                              <div className="text-xs text-slate-500">{l.termSlugs.length} terms</div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setStudy((prev) => {
                                  const next: StudyState = { ...prev, bookmarked: { ...prev.bookmarked }, lists: { ...prev.lists } };
                                  delete next.lists[l.id];
                                  // remove list ref from bookmarks
                                  Object.keys(next.bookmarked).forEach((k) => {
                                    const lists = new Set(next.bookmarked[k].lists || []);
                                    lists.delete(l.id);
                                    next.bookmarked[k] = { ...next.bookmarked[k], lists: Array.from(lists) };
                                  });
                                  return next;
                                });
                              }}
                              className="text-xs px-2 py-1 rounded-lg border border-slate-700 bg-slate-950/40 text-slate-300 hover:text-white hover:border-slate-600 transition-colors"
                            >
                              Delete
                            </button>
                          </div>

                          {l.termSlugs.length ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {l.termSlugs
                                .map((slug) => getTermBySlug(slug)?.term || slug)
                                .sort((a, b) => a.localeCompare(b))
                                .map((t) => (
                                  <button
                                    key={`${l.id}-${t}`}
                                    type="button"
                                    onClick={() => {
                                      setStudyOpen(false);
                                      handleRelatedClick(t);
                                    }}
                                    className="text-xs px-2 py-1 rounded-full border border-slate-700 bg-slate-950/30 text-slate-200 hover:text-white hover:border-slate-600 transition-colors"
                                  >
                                    {t}
                                  </button>
                                ))}
                            </div>
                          ) : (
                            <p className="mt-2 text-xs text-slate-500">Add terms to this list from any entry’s Study box.</p>
                          )}
                        </div>
                      ))
                  ) : (
                    <p className="text-sm text-slate-500">No lists yet. Create one above.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {applyOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={() => setApplyOpen(false)} />
          <div className="relative w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-700">
              <h3 className="text-lg font-semibold text-slate-100">Apply to My Show</h3>
              <p className="text-sm text-slate-400">
                Choose a show (and optional routine/task) so the AI can generate actionable suggestions.
              </p>
            </div>

            <div className="p-5 space-y-4">
              {shows && shows.length ? (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Show</label>
                    <select
                      value={applyShowId}
                      onChange={(e) => {
                        setApplyShowId(e.target.value);
                        setApplyTaskId('');
                      }}
                      className="w-full rounded-lg bg-slate-950/40 border border-slate-700 px-3 py-2 text-sm text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60"
                    >
                      {shows
                        .slice()
                        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.title}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Routine / Task (optional)</label>
                    <select
                      value={applyTaskId}
                      onChange={(e) => setApplyTaskId(e.target.value)}
                      className="w-full rounded-lg bg-slate-950/40 border border-slate-700 px-3 py-2 text-sm text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60"
                    >
                      <option value="">(No specific task)</option>
                      {(shows.find((s) => s.id === applyShowId)?.tasks || []).map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-slate-500 mt-1">Tip: pick a specific routine for more targeted advice.</p>
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-slate-700 bg-slate-950/30 p-4">
                  <p className="text-sm text-slate-300">You don’t have any shows yet.</p>
                  <p className="text-sm text-slate-500 mt-1">Create a show in Show Planner, then come back and apply concepts directly to it.</p>
                </div>
              )}
            </div>

            <div className="px-5 py-4 border-t border-slate-700 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setApplyOpen(false)}
                className="px-3 py-2 text-sm rounded-lg border border-slate-700 bg-slate-950/40 text-slate-200 hover:text-white hover:border-slate-600 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={runApplyToShow}
                disabled={!onAiSpark || !(shows && shows.length) || !applyTerm}
                className={[
                  'px-4 py-2 text-sm rounded-lg border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60',
                  !onAiSpark || !(shows && shows.length) || !applyTerm
                    ? 'border-slate-700 bg-slate-900/40 text-slate-500 cursor-not-allowed'
                    : 'border-amber-400/30 bg-amber-400/10 text-amber-200 hover:bg-amber-400/15 hover:border-amber-300/40',
                ].join(' ')}
              >
                Generate Suggestions
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {mapOpen && mapTerm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={() => setMapOpen(false)} />
          <div className="relative w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-100">Concept Map</h3>
                <p className="text-sm text-slate-400">Connections that frequently relate to this idea.</p>
              </div>
              <button
                type="button"
                onClick={() => setMapOpen(false)}
                className="px-3 py-2 text-sm rounded-lg border border-slate-700 bg-slate-950/40 text-slate-200 hover:text-white hover:border-slate-600 transition-colors"
              >
                Close
              </button>
            </div>

            <div className="p-5">
              <div className="rounded-xl border border-purple-500/30 bg-purple-600/10 p-4">
                <div className="text-xs text-purple-200/80">Center</div>
                <div className="text-xl font-bold text-amber-200 mt-1">{mapTerm.term}</div>
                <div className="text-sm text-slate-300 mt-2">{clipOneLine(mapTerm.definition)}</div>
              </div>

              <div className="mt-4">
                <div className="text-xs font-semibold text-slate-400">Connected concepts</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {connectionsFor(mapTerm).length ? (
                    connectionsFor(mapTerm).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          setMapOpen(false);
                          handleRelatedClick(t);
                        }}
                        className="text-xs px-2 py-1 rounded-full bg-slate-800/60 border border-slate-700 text-purple-200 hover:text-white hover:border-purple-500/40 transition-colors"
                      >
                        {t}
                      </button>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500">No connections set yet for this term.</p>
                  )}
                </div>

                <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950/30 p-4">
                  <div className="text-sm text-slate-200 font-semibold">Tip</div>
                  <p className="text-sm text-slate-500 mt-1">
                    This concept map is based on related-term links. Over time, you can expand the dictionary to create a proprietary theory network.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Tier-3: Scenario Simulator Modal */}
      {scenarioOpen && scenarioTerm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={() => setScenarioOpen(false)} />
          <div className="relative w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-100">Test This Concept</h3>
                <p className="text-sm text-slate-400">Run a short rehearsal scenario in the AI Assistant chat.</p>
              </div>
              <button
                type="button"
                onClick={() => setScenarioOpen(false)}
                className="px-3 py-2 text-sm rounded-lg border border-slate-700 bg-slate-950/40 text-slate-200 hover:text-white hover:border-slate-600 transition-colors"
              >
                Close
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="rounded-xl border border-purple-500/30 bg-purple-600/10 p-4">
                <div className="text-xs text-purple-200/80">Concept</div>
                <div className="text-xl font-bold text-amber-200 mt-1">{scenarioTerm.term}</div>
                <div className="text-sm text-slate-300 mt-2">{clipOneLine(scenarioTerm.definition)}</div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Audience Persona</label>
                <select
                  value={scenarioPersona}
                  onChange={(e) => setScenarioPersona(e.target.value as ScenarioPersona)}
                  className="w-full rounded-lg bg-slate-950/40 border border-slate-700 px-3 py-2 text-sm text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60"
                >
                  {SCENARIO_PERSONAS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-1">This will run a 4-round simulation and end with a coaching debrief.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Goal (optional)</label>
                <input
                  value={scenarioGoal}
                  onChange={(e) => setScenarioGoal(e.target.value)}
                  placeholder="Example: Keep control without sounding defensive"
                  className="w-full rounded-lg bg-slate-950/40 border border-slate-700 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60"
                />
              </div>
            </div>

            <div className="px-5 py-4 border-t border-slate-700 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setScenarioOpen(false)}
                className="px-4 py-2 text-sm rounded-lg border border-slate-700 bg-slate-950/40 text-slate-200 hover:text-white hover:border-slate-600 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={runScenario}
                disabled={!onAiSpark}
                className={[
                  'px-4 py-2 text-sm rounded-lg border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60',
                  !onAiSpark
                    ? 'border-slate-700 bg-slate-900/40 text-slate-500 cursor-not-allowed'
                    : 'border-purple-500/40 bg-purple-600/15 text-purple-100 hover:bg-purple-600/25 hover:border-purple-400/60',
                ].join(' ')}
              >
                Start Scenario
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Tier-3: Performance Diagnostic Modal */}
      {diagnosticOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={() => setDiagnosticOpen(false)} />
          <div className="relative w-full max-w-3xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-100">Diagnose Script</h3>
                <p className="text-sm text-slate-400">Paste a script and get concept-based notes that reference the Magic Dictionary.</p>
              </div>
              <button
                type="button"
                onClick={() => setDiagnosticOpen(false)}
                className="px-3 py-2 text-sm rounded-lg border border-slate-700 bg-slate-950/40 text-slate-200 hover:text-white hover:border-slate-600 transition-colors"
              >
                Close
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Show (optional)</label>
                  <select
                    value={diagnosticShowId}
                    onChange={(e) => setDiagnosticShowId(e.target.value)}
                    className="w-full rounded-lg bg-slate-950/40 border border-slate-700 px-3 py-2 text-sm text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60"
                  >
                    <option value="">(No show selected)</option>
                    {(shows || [])
                      .slice()
                      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.title}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Routine name (optional)</label>
                  <input
                    value={diagnosticRoutine}
                    onChange={(e) => setDiagnosticRoutine(e.target.value)}
                    placeholder="Example: Ambitious Card"
                    className="w-full rounded-lg bg-slate-950/40 border border-slate-700 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Script</label>
                <textarea
                  value={diagnosticScript}
                  onChange={(e) => setDiagnosticScript(e.target.value)}
                  placeholder="Paste your script or routine outline here…"
                  className="w-full min-h-[220px] rounded-lg bg-slate-950/40 border border-slate-700 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60"
                />
                <p className="text-xs text-slate-500 mt-1">Tip: include stage directions like (pause), (gesture), (volunteer), etc.</p>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-slate-700 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setDiagnosticOpen(false)}
                className="px-4 py-2 text-sm rounded-lg border border-slate-700 bg-slate-950/40 text-slate-200 hover:text-white hover:border-slate-600 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={runDiagnostic}
                disabled={!onAiSpark || !diagnosticScript.trim()}
                className={[
                  'px-4 py-2 text-sm rounded-lg border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60',
                  !onAiSpark || !diagnosticScript.trim()
                    ? 'border-slate-700 bg-slate-900/40 text-slate-500 cursor-not-allowed'
                    : 'border-amber-400/30 bg-amber-400/10 text-amber-200 hover:bg-amber-400/15 hover:border-amber-300/40',
                ].join(' ')}
              >
                Run Diagnosis
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default MagicDictionary;
