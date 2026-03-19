
import React, { useEffect, useMemo, useState } from 'react';
import { Type } from "@google/genai";
import { saveIdea } from '../services/ideasService';
import { CohesionActions } from './CohesionActions';
import { createShow, addTasksToShow } from '../services/showsService';
import { saveDirectorBlueprint } from '../services/directorBlueprintsService';
import { trackClientEvent } from '../services/telemetryClient';
import { DIRECTOR_MODE_SYSTEM_INSTRUCTION, MAGIC_DICTIONARY_TERMS } from '../constants';
import type { DirectorModeBlueprint } from '../types';
import { WandIcon, SaveIcon, CheckIcon, ChecklistIcon } from './icons';
import { generateStructuredResponse } from '../services/geminiService';


interface DirectorModeProps {
    onIdeaSaved: () => void;
}

const LoadingIndicator: React.FC = () => (
    <div className="flex flex-col items-center justify-center text-center p-8">
        <div className="relative">
            <WandIcon className="w-16 h-16 text-purple-400 animate-pulse" />
            <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
                 <div className="w-24 h-24 border-t-2 border-purple-300 rounded-full animate-spin"></div>
            </div>
        </div>
        <p className="text-slate-300 mt-4 text-lg">Directing your masterpiece...</p>
        <p className="text-slate-400 text-sm">Structuring the narrative and flow.</p>
    </div>
);

const slugify = (s: string) =>
    (s || '')
        .toLowerCase()
        .trim()
        .replace(/['"]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

const extractDictionaryTerms = (textBlocks: string[]): string[] => {
    const dictTerms = (MAGIC_DICTIONARY_TERMS as any[])
        .map((t) => String(t?.term || '').trim())
        .filter(Boolean);
    const lower = dictTerms.map((t) => t.toLowerCase());

    const hay = textBlocks.join(' \n ').toLowerCase();
    const found = new Set<string>();

    // Try exact name matches first; keep list small enough to be fast.
    lower.forEach((t, i) => {
        if (!t) return;
        // Simple contains check; avoids regex complexity and is adequate for our short strings.
        if (hay.includes(t)) found.add(dictTerms[i]);
    });

    // Add a few “high value” theory terms even if not in dictionary yet (safe no-op if missing)
    ['Framing', 'Beat', 'Offbeat', 'Conviction', 'Clarity', 'Misdirection', 'Audience Control'].forEach((t) => {
        if (hay.includes(t.toLowerCase())) found.add(t);
    });

    return Array.from(found).sort((a, b) => a.localeCompare(b));
};


const parseTransitionExtras = (raw: string) => {
    const text = (raw || '').trim();
    // Extras are encoded schema-safe inside transition_notes separated by " | "
    // Example:
    // "Transition sentence one. Transition sentence two. | Beats: • beat1 • beat2 • beat3 | Volunteer moment: ... | Patter hook: ..."
    const parts = text.split('|').map((p) => p.trim()).filter(Boolean);

    let base = '';
    const beats: string[] = [];
    let volunteer = '';
    let patter = '';
    let audienceMoment = '';

    for (const p of parts) {
        const lower = p.toLowerCase();

        if (lower.startsWith('beats:')) {
            const after = p.slice(p.indexOf(':') + 1).trim();
            const rawBeats = after
                .split('•')
                .map((b) => b.trim())
                .filter(Boolean);
            if (rawBeats.length) beats.push(...rawBeats);
            continue;
        }

        if (lower.startsWith('volunteer moment:') || lower.startsWith('volunteer:')) {
            volunteer = p.slice(p.indexOf(':') + 1).trim();
            continue;
        }

        if (lower.startsWith('patter hook:') || lower.startsWith('patter:')) {
            patter = p.slice(p.indexOf(':') + 1).trim();
            continue;
        }

        if (lower.startsWith('audience moment:')) {
            audienceMoment = p.slice(p.indexOf(':') + 1).trim();
            continue;
        }

        // Unlabeled portion: treat as base transition (first one wins)
        if (!base) base = p;
    }

    // If no pipes/labels, whole string is base
    if (!base && !beats.length && !volunteer && !patter && !audienceMoment) base = text;

    return { base: base || '—', beats, volunteer, patter, audienceMoment };
};


const asNonEmptyString = (value: any, fallback = ''): string => {
    const str = typeof value === 'string' ? value.trim() : '';
    return str || fallback;
};

const asStringArray = (value: any): string[] =>
    Array.isArray(value)
        ? value.map((item) => String(item ?? '').trim()).filter(Boolean)
        : [];

const asPositiveInt = (value: any, fallback = 0): number => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
};

const normalizeDirectorSegment = (raw: any, index: number, purposeFallback: 'opener' | 'middle' | 'closer'): any => ({
    title: asNonEmptyString(raw?.title, `Segment ${index + 1}`),
    purpose: (['opener', 'middle', 'closer'].includes(String(raw?.purpose || '').toLowerCase())
        ? String(raw?.purpose).toLowerCase()
        : purposeFallback) as 'opener' | 'middle' | 'closer',
    duration_estimate_minutes: asPositiveInt(raw?.duration_estimate_minutes, 1),
    audience_interaction_level: (['low', 'medium', 'high'].includes(String(raw?.audience_interaction_level || '').toLowerCase())
        ? String(raw?.audience_interaction_level).toLowerCase()
        : 'medium') as 'low' | 'medium' | 'high',
    props_required: asStringArray(raw?.props_required),
    transition_notes: asNonEmptyString(raw?.transition_notes, 'Clean transition into the next effect.'),
    beats: asStringArray(raw?.beats),
    patter_hook: asNonEmptyString(raw?.patter_hook),
    blocking_notes: asNonEmptyString(raw?.blocking_notes),
    volunteer_management: asNonEmptyString(raw?.volunteer_management),
    music_lighting: asNonEmptyString(raw?.music_lighting),
});

const normalizeDirectorBlueprint = (raw: any): DirectorModeBlueprint => {
    const rawSegments = Array.isArray(raw?.segments) ? raw.segments : [];
    const normalizedSegments = rawSegments
        .map((segment, index) => normalizeDirectorSegment(
            segment,
            index,
            index === 0 ? 'opener' : index === rawSegments.length - 1 ? 'closer' : 'middle'
        ))
        .filter((segment) => segment.title);

    return {
        show_title: asNonEmptyString(raw?.show_title, 'Untitled Show'),
        show_length_minutes: asPositiveInt(raw?.show_length_minutes, normalizedSegments.reduce((sum, seg) => sum + (Number(seg.duration_estimate_minutes) || 0), 0)),
        audience_type: asNonEmptyString(raw?.audience_type, 'General Audience'),
        venue_type: asNonEmptyString(raw?.venue_type, 'Stage'),
        tone: asNonEmptyString(raw?.tone, 'Balanced'),
        performer_persona: asNonEmptyString(raw?.performer_persona, 'Magician'),
        constraints: {
            skill_level: asNonEmptyString(raw?.constraints?.skill_level, 'Intermediate'),
            reset_time: asNonEmptyString(raw?.constraints?.reset_time, 'Moderate'),
            props_owned: asStringArray(raw?.constraints?.props_owned),
            notes: asNonEmptyString(raw?.constraints?.notes),
        },
        segments: normalizedSegments,
        created_at: asNonEmptyString(raw?.created_at),
    };
};

const validateDirectorBlueprint = (blueprint: DirectorModeBlueprint, speedMode: 'full') => {
    if (!blueprint.show_title.trim()) throw new Error('Director Mode returned no show title. Please try again.');
    if (!Array.isArray(blueprint.segments) || blueprint.segments.length < 3) {
        throw new Error('Director Mode returned an incomplete show outline. Please try again.');
    }

    const openerCount = blueprint.segments.filter((seg) => seg.purpose === 'opener').length;
    const middleCount = blueprint.segments.filter((seg) => seg.purpose === 'middle').length;
    const closerCount = blueprint.segments.filter((seg) => seg.purpose === 'closer').length;

    if (openerCount !== 1 || closerCount !== 1 || middleCount < 1) {
        throw new Error('Director Mode returned an invalid segment structure. Please try again.');
    }

    const totalMinutes = blueprint.segments.reduce((sum, seg) => sum + (Number(seg.duration_estimate_minutes) || 0), 0);
    if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) {
        throw new Error('Director Mode returned invalid segment timing. Please try again.');
    }

    if (Number.isFinite(blueprint.show_length_minutes) && blueprint.show_length_minutes > 0 && totalMinutes !== blueprint.show_length_minutes) {
        throw new Error('Director Mode returned a timing mismatch. Please try again.');
    }

    if (speedMode === 'full') {
        const missingFullFields = blueprint.segments.some((seg) => !Array.isArray(seg.beats) || !seg.beats.length || !seg.patter_hook || !seg.blocking_notes);
        if (missingFullFields) {
            throw new Error('Director Mode returned incomplete full-detail notes. Please try again.');
        }
    }
};

const blueprintToOutline = (bp: DirectorModeBlueprint, opts?: { fullDetail?: boolean }): string => {
    if (!bp) return '';
    const fullDetail = Boolean(opts?.fullDetail);

    const lines: string[] = [];
    const title = (bp.show_title || 'Untitled Show').trim();
    const len = bp.show_length_minutes ? `${bp.show_length_minutes} Minute` : '';
    const venue = (bp.venue_type || '').trim();
    const tone = (bp.tone || '').trim();

    lines.push(title.toUpperCase());
    const headerBits = [len, venue ? `${venue} Show` : 'Show'].filter(Boolean).join(' ');
    if (headerBits) lines.push(headerBits);
    if (tone) lines.push(`Tone: ${tone}`);
    lines.push('');

    (bp.segments || []).forEach((seg) => {
        const purpose = (seg.purpose || '').toUpperCase();
        const dur = Number.isFinite(Number(seg.duration_estimate_minutes)) ? `${seg.duration_estimate_minutes} min` : '';
        lines.push(`${purpose} — ${seg.title}${dur ? ` (${dur})` : ''}`);
        lines.push('');
        lines.push(`Audience Interaction: ${(seg.audience_interaction_level || '').toString().replace(/^./, (c) => c.toUpperCase())}`);

        const props = Array.isArray(seg.props_required) ? seg.props_required.filter(Boolean) : [];
        lines.push(`Props: ${props.length ? props.join(', ') : '—'}`);
        lines.push('');

        const t = parseTransitionExtras(seg.transition_notes || '');
        lines.push('Transition:');
        lines.push(t.base);
        lines.push('');

        if (fullDetail) {
            const beats = Array.isArray((seg as any).beats) && (seg as any).beats.length
                ? ((seg as any).beats as string[]).filter(Boolean)
                : t.beats;
            const audienceMoment = (seg as any).audience_moment || t.audienceMoment;
            const volunteer = (seg as any).volunteer_management || t.volunteer;
            const patter = (seg as any).patter_hook || t.patter;
            const blocking = (seg as any).blocking_notes;
            const music = (seg as any).music_lighting;

            if (beats.length) {
                lines.push('Beats:');
                beats.slice(0, 6).forEach((b) => lines.push(`• ${b}`));
                lines.push('');
            }
            if (audienceMoment) {
                lines.push(`Audience moment: ${audienceMoment}`);
                lines.push('');
            }
            if (volunteer) {
                lines.push(`Volunteer management: ${volunteer}`);
                lines.push('');
            }
            if (patter) {
                lines.push(`Patter hook: ${patter}`);
                lines.push('');
            }
            if (blocking) {
                lines.push(`Blocking notes: ${blocking}`);
                lines.push('');
            }
            if (music) {
                lines.push(`Music/lighting: ${music}`);
                lines.push('');
            }
        }
    });

    return lines.join('\n');
};


const DirectorMode: React.FC<DirectorModeProps> = ({ onIdeaSaved }) => {
    // Form State
    const [showTitle, setShowTitle] = useState('');
    const [showLength, setShowLength] = useState('');

    // Reliability
    const [genTimingMs, setGenTimingMs] = useState<{ full?: number }>({});
    const [timelineReady, setTimelineReady] = useState(false);
    const [outlineFullDetail, setOutlineFullDetail] = useState<boolean>(true);


    useEffect(() => {
        try {
            const raw = localStorage.getItem('maw_director_mode_prefill_v1');
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (!parsed || parsed.version !== 1) {
                localStorage.removeItem('maw_director_mode_prefill_v1');
                return;
            }
            if (typeof parsed.showTitle === 'string' && parsed.showTitle.trim()) setShowTitle(parsed.showTitle.trim());
            if (typeof parsed.theme === 'string') setTheme(parsed.theme);
            if (typeof parsed.constraintNotes === 'string') setConstraintNotes(parsed.constraintNotes);
            if (typeof parsed.tone === 'string') setTone(parsed.tone);
            localStorage.removeItem('maw_director_mode_prefill_v1');
        } catch {
            // ignore prefill errors
        }
    }, []);
    // Audience: quick-select chips + optional custom text
    const [audienceType, setAudienceType] = useState(''); // custom audience text
    const [audienceChips, setAudienceChips] = useState<string[]>([]);

    // Theme/Style
    const [theme, setTheme] = useState('');

    // Venue / Tone / Persona (Phase 1+)
    const [venueType, setVenueType] = useState('');
    const [tone, setTone] = useState('');
    const [performerPersona, setPerformerPersona] = useState('');
    const [skillLevel, setSkillLevel] = useState<'Beginner' | 'Intermediate' | 'Advanced' | ''>('');
    const [resetTime, setResetTime] = useState<'Instant' | '30s' | '1 min' | '2 min' | '5+ min' | ''>('');
    const [propsOwned, setPropsOwned] = useState(''); // comma / newline separated
    const [constraintNotes, setConstraintNotes] = useState('');


    // Advanced Options (optional)
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [pacing, setPacing] = useState<'Relaxed' | 'Balanced' | 'High-energy' | ''>('');
    const [comedyLevel, setComedyLevel] = useState<'Low' | 'Medium' | 'High' | ''>('');
    const [participation, setParticipation] = useState<'Low' | 'Medium' | 'High' | ''>('');
    const [volunteersOk, setVolunteersOk] = useState<'Yes' | 'No' | ''>('');
    // Demo / onboarding examples (rotating)
    type DirectorExample = {
        label: string;
        showTitle: string;
        showLength: string;
        audienceChips: string[];
        audienceType?: string;
        theme: string;
        venueType: string;
        tone: string;
        performerPersona: string;
        skillLevel: 'Beginner' | 'Intermediate' | 'Advanced' | '';
        resetTime: 'Instant' | '30s' | '1 min' | '2 min' | '5+ min' | '';
        propsOwned: string;
        constraintNotes: string;
        // Optional advanced (if you later surface these on the UI)
        pacing?: 'Relaxed' | 'Balanced' | 'High-energy' | '';
        comedyLevel?: 'Low' | 'Medium' | 'High' | '';
        participation?: 'Low' | 'Medium' | 'High' | '';
        volunteersOk?: 'Yes' | 'No' | '';
    };

    const DIRECTOR_EXAMPLES_A: DirectorExample[] = [
        {
            label: 'Corporate 45 (Comedy + Mind)',
            showTitle: 'The Corporate Mind-Reader',
            showLength: '45',
            audienceChips: ['Corporate', 'Adults'],
            audienceType: '150 people • banquet room • after-dinner',
            theme: 'polished, funny, modern mentalism with a clean “wow” ending',
            venueType: 'banquet hall / hotel ballroom',
            tone: 'funny + intelligent + high-energy',
            performerPersona: 'charming storyteller • confident • playful • professional',
            skillLevel: 'Intermediate',
            resetTime: '1 min',
            propsOwned: 'deck of cards, billets, Sharpies, coin set, pad, invisible thread',
            constraintNotes: 'No fire. Minimal table space. Keep it clean for corporate audience.',
        },
        {
            label: 'School 30 (Fast + Visual)',
            showTitle: 'Mystery at the Assembly',
            showLength: '30',
            audienceChips: ['School Assembly', 'Kids'],
            audienceType: 'ages 8–12 • big group',
            theme: 'high-clarity, visual magic with quick laughs and volunteer moments',
            venueType: 'school gym / auditorium stage',
            tone: 'funny + upbeat + wholesome',
            performerPersona: 'friendly “cool teacher” energy • big gestures • clear instructions',
            skillLevel: 'Beginner',
            resetTime: '30s',
            propsOwned: 'sponge balls, rope, silks, thumb tip, deck of cards',
            constraintNotes: 'Keep volunteers safe and easy. Big visibility. No complex reset.',
        },
        {
            label: 'Close-up 60 (Interactive)',
            showTitle: 'Impossible at Your Table',
            showLength: '60',
            audienceChips: ['Adults'],
            audienceType: 'walk-around / table-hopping',
            theme: 'sleek close-up miracles with escalating impossibility',
            venueType: 'restaurant / cocktail hour',
            tone: 'mysterious + charming + witty',
            performerPersona: 'smooth close-up specialist • friendly • confident',
            skillLevel: 'Advanced',
            resetTime: 'Instant',
            propsOwned: 'cards, coins, rubber bands, ring, marker, small pad',
            constraintNotes: 'No loud music cues. Quick resets. Keep props pocket-friendly.',
        },
    ];

    const DIRECTOR_EXAMPLES_B: DirectorExample[] = [
        {
            label: 'Theater 90 (Dramatic)',
            showTitle: 'The Alchemist’s Secret',
            showLength: '90',
            audienceChips: ['Adults', 'Seniors'],
            audienceType: 'seated theater • attentive crowd',
            theme: 'dramatic, story-driven mystery with strong emotional beats',
            venueType: 'small theater / stage',
            tone: 'dramatic + mysterious + cinematic',
            performerPersona: 'mysterious narrator • deliberate pacing • strong presence',
            skillLevel: 'Advanced',
            resetTime: '2 min',
            propsOwned: 'rings, rope, book test, prediction envelopes, sound cue device',
            constraintNotes: 'Minimize dead time between segments. Strong transitions. Limited backstage.',
        },
        {
            label: 'Family 45 (Comedy)',
            showTitle: 'Laughs & Wonders',
            showLength: '45',
            audienceChips: ['Families', 'Kids'],
            audienceType: 'mixed ages • community event',
            theme: 'big laughs, simple plots, highly visual magic',
            venueType: 'community center / park pavilion',
            tone: 'funny + energetic + warm',
            performerPersona: 'silly but in-control • friendly • high audience rapport',
            skillLevel: 'Intermediate',
            resetTime: '1 min',
            propsOwned: 'silks, sponge balls, rope, linking rings, comedy wand',
            constraintNotes: 'Wind/noise possible. Keep it visual and loud-friendly.',
        },
        {
            label: 'Mystery 60 (Minimal Props)',
            showTitle: 'One Pocket Wonders',
            showLength: '60',
            audienceChips: ['Adults', 'Corporate'],
            audienceType: 'small group • close seating',
            theme: 'minimal-prop mentalism + strong audience interaction',
            venueType: 'conference room',
            tone: 'mysterious + smart + dry humor',
            performerPersona: 'calm psychological entertainer • confident • precise',
            skillLevel: 'Intermediate',
            resetTime: '30s',
            propsOwned: 'billets, Sharpies, index cards, small notebook',
            constraintNotes: 'No bulky props. Limited reset. Focus on participation and clarity.',
        },
    ];

    const [exampleIndexA, setExampleIndexA] = useState(0);
    const [exampleIndexB, setExampleIndexB] = useState(0);

    const applyExample = (ex: DirectorExample) => {
        setShowTitle(ex.showTitle);
        setShowLength(ex.showLength);
        setAudienceChips(ex.audienceChips);
        setAudienceType(ex.audienceType || '');
        setTheme(ex.theme);

        setVenueType(ex.venueType);
        setTone(ex.tone);
        setPerformerPersona(ex.performerPersona);
        setSkillLevel(ex.skillLevel);
        setResetTime(ex.resetTime);
        setPropsOwned(ex.propsOwned);
        setConstraintNotes(ex.constraintNotes);

        // Keep Advanced collapsed by default for clean onboarding
        setShowAdvanced(false);

        // If you later expose these controls in Advanced, keep the state synced:
        if (ex.pacing !== undefined) setPacing(ex.pacing);
        if (ex.comedyLevel !== undefined) setComedyLevel(ex.comedyLevel);
        if (ex.participation !== undefined) setParticipation(ex.participation);
        if (ex.volunteersOk !== undefined) setVolunteersOk(ex.volunteersOk);
    };

    const onExampleA = () => {
        const ex = DIRECTOR_EXAMPLES_A[exampleIndexA % DIRECTOR_EXAMPLES_A.length];
        applyExample(ex);
        setExampleIndexA((i) => (i + 1) % DIRECTOR_EXAMPLES_A.length);
    };

    const onExampleB = () => {
        const ex = DIRECTOR_EXAMPLES_B[exampleIndexB % DIRECTOR_EXAMPLES_B.length];
        applyExample(ex);
        setExampleIndexB((i) => (i + 1) % DIRECTOR_EXAMPLES_B.length);
    };

    // Legacy constraints textarea replaced by constraintNotes
    // const [constraints, setConstraints] = useState('');

    // Control State
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPlan, setShowPlan] = useState<DirectorModeBlueprint | null>(null);
    useEffect(() => {
        if (showPlan?.segments?.length) {
            setTimelineReady(false);
            // Animate timeline bars after render
            requestAnimationFrame(() => setTimelineReady(true));
        }
    }, [showPlan]);
    // Phase 5: Refinement versions
    const [blueprintVersions, setBlueprintVersions] = useState<Array<{ id: string; createdAt: number; blueprint: DirectorModeBlueprint; diffHint?: string }>>([]);
    const [activeBlueprintId, setActiveBlueprintId] = useState<string | null>(null);
    const [isRefining, setIsRefining] = useState(false);
    const [refineNotice, setRefineNotice] = useState<string | null>(null);
    // Phase 4: workflow wiring helpers
    const [createdShowId, setCreatedShowId] = useState<string | null>(null);
    const [createShowNotice, setCreateShowNotice] = useState<string | null>(null);
    const [isAddedToPlanner, setIsAddedToPlanner] = useState(false);
    const [isAddingToPlanner, setIsAddingToPlanner] = useState(false);
    const [isSavingIdea, setIsSavingIdea] = useState(false);
    const [isSavedToIdeas, setIsSavedToIdeas] = useState(false);
    const [plannerNotice, setPlannerNotice] = useState<string | null>(null);
    const [ideaNotice, setIdeaNotice] = useState<string | null>(null);

    // In-panel Save Blueprint status (more native than global toast)
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');

    // Blueprint viewer tabs (Segments | Show Outline | JSON)
    const [blueprintView, setBlueprintView] = useState<'segments' | 'outline' | 'json'>('outline');

    
    const computedAudience = (() => {
        const picked = audienceChips.join(', ');
        const custom = audienceType.trim();
        if (picked && custom) return `${picked}, ${custom}`;
        return picked || custom;
    })();

    const directorsNotesBlock = useMemo(() => {
        if (!showPlan) return '';
        const parts: string[] = [];
        parts.push(`Constraints:`);
        parts.push(`- Skill level: ${showPlan.constraints?.skill_level || ''}`);
        parts.push(`- Reset time: ${showPlan.constraints?.reset_time || ''}`);
        if (Array.isArray(showPlan.constraints?.props_owned) && showPlan.constraints.props_owned.length) {
            parts.push(`- Props owned: ${showPlan.constraints.props_owned.join(', ')}`);
        }
        if (showPlan.constraints?.notes?.trim()) {
            parts.push(`- Notes: ${showPlan.constraints.notes.trim()}`);
        }
        parts.push('');
        parts.push('Segments:');
        (showPlan.segments || []).forEach((s) => {
            const props = Array.isArray(s.props_required) && s.props_required.length ? ` | props: ${s.props_required.join(', ')}` : '';
            const ai = (s as any).audience_interaction_level ? `, ${(s as any).audience_interaction_level}` : '';
            const purpose = (s as any).purpose ? (s as any).purpose : 'segment';
            parts.push(`- ${purpose}: ${s.title} (${s.duration_estimate_minutes} min${ai}${props})`);
            if (s.transition_notes?.trim()) parts.push(`  transition: ${s.transition_notes.trim()}`);
        });
        return parts.join('\n');
    }, [showPlan]);

const dictionaryLinks = useMemo(() => {
        if (!showPlan) return [] as string[];
        const blocks: string[] = [];
        blocks.push(showPlan.show_title || '');
        blocks.push(showPlan.tone || '');
        blocks.push(showPlan.performer_persona || '');
        (showPlan.constraints?.notes ? [showPlan.constraints.notes] : []).forEach((x) => blocks.push(x));
        (showPlan.segments || []).forEach((s) => {
            blocks.push(s.title || '');
            blocks.push(s.transition_notes || '');
        });
        return extractDictionaryTerms(blocks);
    }, [showPlan]);

// Tier 3: Director Mode -> Magic Dictionary integration
    const dictionaryTermSet = useMemo(() => {
        const set = new Set<string>();
        (MAGIC_DICTIONARY_TERMS as any[]).forEach((t) => {
            const name = String(t?.term || '').trim();
            if (name) set.add(name);
        });
        return set;
    }, []);

    const extractDictionaryMentions = useMemo(() => {
        if (!showPlan) return [] as string[];
        const blobs: string[] = [];

        const pushText = (x?: string) => {
            if (!x) return;
            const s = String(x || '').trim();
            if (s) blobs.push(s);
        };

        pushText(showPlan.tone);
        pushText(showPlan.performer_persona);
        pushText(showPlan.constraints?.notes);
        (showPlan.segments || []).forEach((s) => {
            pushText(s.title);
            pushText(s.transition_notes);
        });

        const text = blobs.join(' \n ').toLowerCase();
        const matches: string[] = [];
        Array.from(dictionaryTermSet).forEach((term) => {
            const t = term.toLowerCase();
            if (!t || t.length < 3) return;
            const re = new RegExp(`(^|[^a-z0-9])${t.replace(/[.*+?^${}()|[]]/g, '\\$&')}([^a-z0-9]|$)`, 'i');
            if (re.test(text)) matches.push(term);
        });
        return matches.sort((a, b) => a.localeCompare(b));
    }, [showPlan, dictionaryTermSet]);

// Show Title is optional: AI can generate a strong title if the user leaves it blank.
    const isFormValid = Boolean(
        showLength &&
        computedAudience &&
        venueType.trim() &&
        (tone.trim() || theme.trim()) &&
        performerPersona.trim() &&
        skillLevel &&
        resetTime
    );

    const makeId = () => `${Date.now()}_${Math.random().toString(16).slice(2)}`;

    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            return false;
        }
    };

    const buildOutlineFromBlueprint = (plan: DirectorModeBlueprint) => {
        const lines: string[] = [];
        lines.push(`${plan.show_title} (${plan.show_length_minutes} min)`);
        lines.push(`Audience: ${plan.audience_type}`);
        lines.push(`Venue: ${plan.venue_type}`);
        lines.push(`Tone: ${plan.tone}`);
        lines.push(`Persona: ${plan.performer_persona}`);
        lines.push('');
        lines.push('Constraints:');
        lines.push(`- Skill: ${plan.constraints?.skill_level || ''}`);
        lines.push(`- Reset: ${plan.constraints?.reset_time || ''}`);
        if (Array.isArray(plan.constraints?.props_owned) && plan.constraints.props_owned.length) {
            lines.push(`- Props owned: ${plan.constraints.props_owned.join(', ')}`);
        }
        if (plan.constraints?.notes?.trim()) {
            lines.push(`- Notes: ${plan.constraints.notes.trim()}`);
        }
        lines.push('');
        lines.push('Segments:');
        (plan.segments || []).forEach((seg, i) => {
            lines.push(`${i + 1}. ${seg.purpose.toUpperCase()} — ${seg.title} (${seg.duration_estimate_minutes} min, ${seg.audience_interaction_level})`);
            if (Array.isArray(seg.props_required) && seg.props_required.length) lines.push(`   Props: ${seg.props_required.join(', ')}`);
            if (seg.transition_notes?.trim()) lines.push(`   Transition: ${seg.transition_notes.trim()}`);
            if (Array.isArray((seg as any).beats) && (seg as any).beats.length) lines.push(`   Beats: ${(seg as any).beats.join(' | ')}`);
            if ((seg as any).patter_hook?.trim()) lines.push(`   Patter hook: ${(seg as any).patter_hook.trim()}`);
            if ((seg as any).blocking_notes?.trim()) lines.push(`   Blocking: ${(seg as any).blocking_notes.trim()}`);
            if ((seg as any).volunteer_management?.trim()) lines.push(`   Volunteer: ${(seg as any).volunteer_management.trim()}`);
            if ((seg as any).music_lighting?.trim()) lines.push(`   Music/lighting: ${(seg as any).music_lighting.trim()}`);
        });
        return lines.join('\n');
    };

    const getActiveBlueprint = () => {
        if (!blueprintVersions.length) return null;
        const active = blueprintVersions.find((v) => v.id === activeBlueprintId);
        return active?.blueprint ?? blueprintVersions[blueprintVersions.length - 1].blueprint;
    };

    const computeDiffHint = (prev: DirectorModeBlueprint, next: DirectorModeBlueprint, instruction: string) => {
        const hints: string[] = [];
        const getTitle = (p: 'opener' | 'middle' | 'closer', plan: DirectorModeBlueprint) =>
            (plan.segments || []).find((s) => s.purpose === p)?.title || '';

        if (prev.show_length_minutes !== next.show_length_minutes) hints.push('Updated length');
        if (getTitle('closer', prev) && getTitle('closer', prev) !== getTitle('closer', next)) hints.push('Changed closer');
        if (getTitle('opener', prev) && getTitle('opener', prev) !== getTitle('opener', next)) hints.push('Changed opener');
        if (prev.constraints?.reset_time !== next.constraints?.reset_time) hints.push('Adjusted resets');

        const normalized = instruction.toLowerCase();
        if (normalized.includes('audience interaction')) hints.push('More interaction');
        if (normalized.includes('more comedy')) hints.push('More comedy');
        if (normalized.includes('more dramatic')) hints.push('More dramatic');
        if (normalized.includes('swap closer')) hints.push('Changed closer');
        if (normalized.includes('shorten')) hints.push('Shortened show');
        if (normalized.includes('reduce')) hints.push('Reduced prop resets');

        const unique = Array.from(new Set(hints));
        return unique.slice(0, 2).join(' + ') || 'Refined';
    };

    const showLengthPresets = [30, 45, 60, 90];
    const audiencePresets = [
        'Families',
        'Kids',
        'Corporate',
        'Adults',
        'Seniors',
        'College',
        'School Assembly',
    ];

    const toggleAudienceChip = (label: string) => {
        setAudienceChips((prev) =>
            prev.includes(label) ? prev.filter((x) => x !== label) : [...prev, label]
        );
    };

    const normalizeTitle = (value: string) => {
        // Lightweight title casing (does not try to be linguistically perfect)
        const v = value.trim();
        if (!v) return '';
        return v
            .split(/\s+/)
            .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
            .join(' ');
    };

    // Phase B: Structured output schema.
    // FAST schema is minimal for speed.
    // FULL schema adds richer fields per segment (beats, patter, blocking, etc.).
    const baseSegmentSchema = {
        type: Type.OBJECT,
        properties: {
            title: { type: Type.STRING },
            purpose: { type: Type.STRING, enum: ['opener', 'middle', 'closer'] },
            duration_estimate_minutes: { type: Type.NUMBER },
            audience_interaction_level: { type: Type.STRING, enum: ['low', 'medium', 'high'] },
            props_required: { type: Type.ARRAY, items: { type: Type.STRING } },
            transition_notes: { type: Type.STRING },
        },
        required: ['title', 'purpose', 'duration_estimate_minutes', 'audience_interaction_level', 'props_required', 'transition_notes'],
    };

    const richSegmentSchema = {
        ...baseSegmentSchema,
        properties: {
            ...(baseSegmentSchema as any).properties,
            beats: { type: Type.ARRAY, items: { type: Type.STRING } },
            patter_hook: { type: Type.STRING },
            blocking_notes: { type: Type.STRING },
            volunteer_management: { type: Type.STRING },
            music_lighting: { type: Type.STRING },
        },
        // FULL requires the rich fields (volunteer/music can be empty strings if not applicable)
        required: [
            'title',
            'purpose',
            'duration_estimate_minutes',
            'audience_interaction_level',
            'props_required',
            'transition_notes',
            'beats',
            'patter_hook',
            'blocking_notes',
            'volunteer_management',
            'music_lighting',
        ],
    };

    const baseBlueprintSchema = {
        type: Type.OBJECT,
        properties: {
            show_title: { type: Type.STRING },
            show_length_minutes: { type: Type.NUMBER },
            audience_type: { type: Type.STRING },
            venue_type: { type: Type.STRING },
            tone: { type: Type.STRING },
            performer_persona: { type: Type.STRING },
            constraints: {
                type: Type.OBJECT,
                properties: {
                    props_owned: { type: Type.ARRAY, items: { type: Type.STRING } },
                    reset_time: { type: Type.STRING },
                    skill_level: { type: Type.STRING },
                    notes: { type: Type.STRING },
                },
                required: ['props_owned', 'reset_time', 'skill_level', 'notes'],
            },
            segments: {
                type: Type.ARRAY,
                items: {
                    ...(baseSegmentSchema as any),
                },
            },
        },
        required: ['show_title', 'show_length_minutes', 'audience_type', 'venue_type', 'tone', 'performer_persona', 'constraints', 'segments'],
    };

    const directorResponseSchemaFull = {
        ...(baseBlueprintSchema as any),
        properties: {
            ...(baseBlueprintSchema as any).properties,
            segments: {
                type: Type.ARRAY,
                items: {
                    ...(richSegmentSchema as any),
                },
            },
        },
    };
    const handleGenerate = async () => {
        if (!isFormValid) {
            setError("Please fill in all required fields.");
            return;
        }
        
        setIsLoading(true);
        setError(null);
        setShowPlan(null);
        setBlueprintVersions([]);
        setActiveBlueprintId(null);
        setRefineNotice(null);

        // Telemetry: refine clicked (best-effort)
        trackClientEvent({
            tool: 'director_mode',
            action: 'director_refine_click',
            metadata: { speed_mode: 'full' },
        });
        setCreatedShowId(null);
        setCreateShowNotice(null);
        setIsAddedToPlanner(false);
        setIsSavedToIdeas(false);

        // Telemetry: Director Mode request start (best-effort)
        trackClientEvent({
            tool: 'director_mode',
            action: 'director_request_start',
            metadata: { speed_mode: 'full' },
            // Use units to store requested show length for KPI averages
            units: Number.isFinite(Number(showLength)) ? Number(showLength) : undefined,
        });

        const titleLine = showTitle.trim()
            ? `- Show Title: ${showTitle.trim()}`
            : `- Show Title: (not provided) Please invent a strong, marketable show title that fits the audience and theme.`;

        const propsOwnedList = propsOwned
            .split(/\n|,/g)
            .map((s) => s.trim())
            .filter(Boolean);

        const showLenNum = Number(showLength);
        const fullSegmentsTarget = !Number.isFinite(showLenNum)
          ? 5
          : showLenNum <= 25
            ? 4
            : showLenNum <= 40
              ? 5
              : 6;

        const speedConstraints = `\nGeneration mode: FULL (reliability-first)\n- Return EXACTLY ${fullSegmentsTarget} segments total (not fewer).\n- Must include exactly 1 opener and 1 closer.\n- All remaining segments must be purpose: middle.\n- Each segment MUST include these full-detail fields (schema-required):\n  - beats: array of 2–4 short "moments" (strings)\n  - patter_hook: 1–2 sentences\n  - blocking_notes: 1–2 sentences (stage movement / handling)\n  - volunteer_management: short line (or empty string if not needed)\n  - music_lighting: short line (or empty string if not needed)\n- Make purpose STRONGER and more specific (an actionable intent, not generic).\n- transition_notes: 2 sentences (when possible), practical and non-exposure.\n- props_required: keep practical (up to ~6 items when needed).`;

        const prompt = `
Please generate a show blueprint in STRICT JSON matching the provided schema.
IMPORTANT: Keep ALL string values single-line (no raw line breaks). If you must represent a line break, use the literal sequence \\n inside the string.

The blueprint must be practical, stage-ready, and non-exposure (no secrets).
Keep it structured and concise.

Inputs:
${titleLine}
- show_length_minutes: ${showLength}
- audience_type: ${computedAudience}
- venue_type: ${venueType}
- tone: ${tone || theme || 'Balanced'}
- performer_persona: ${performerPersona}
- constraints.reset_time: ${resetTime}
- constraints.skill_level: ${skillLevel}
- constraints.props_owned: ${propsOwnedList.length ? propsOwnedList.join(', ') : '(not provided)'}
- constraints.notes: ${constraintNotes.trim() ? constraintNotes.trim() : '(none)'}
${pacing ? `- pacing_hint: ${pacing}` : ''}
${comedyLevel ? `- comedy_hint: ${comedyLevel}` : ''}
${participation ? `- participation_hint: ${participation}` : ''}
${volunteersOk ? `- volunteers_ok: ${volunteersOk}` : ''}

Hard requirements:
- segments must include exactly 1 opener and 1 closer, and at least 1 middle.
- Sum of duration_estimate_minutes across segments MUST equal show_length_minutes exactly.
- Use audience_interaction_level: low/medium/high.
- props_required should be a list of props needed for that segment (can be empty).
- transition_notes should be short, actionable cues between segments.
${speedConstraints}
`;
try {
          const startedAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
          const resultJson = await generateStructuredResponse(
            prompt,
            DIRECTOR_MODE_SYSTEM_INSTRUCTION,
            directorResponseSchemaFull,
            undefined,
            { maxOutputTokens: 4096, speedMode: 'full' }
          );
          const endedAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
          const elapsedMs = Math.max(0, Math.round((endedAt as number) - (startedAt as number)));
          setGenTimingMs({ full: elapsedMs });

            const blueprint = normalizeDirectorBlueprint(resultJson);
            validateDirectorBlueprint(blueprint, 'full');
          const vId = makeId();
          setShowPlan(blueprint);
          setBlueprintVersions([{ id: vId, createdAt: Date.now(), blueprint, diffHint: 'Initial blueprint' }]);
          setActiveBlueprintId(vId);
          setBlueprintView('outline');

          // Telemetry: request success (units = segment count for KPI averages)
          trackClientEvent({
            tool: 'director_mode',
            action: 'director_request_success',
            metadata: { speed_mode: 'full' },
            units: Array.isArray(blueprint?.segments) ? blueprint.segments.length : undefined,
          });
          // Persist blueprint JSON (non-fatal if table not installed yet)
          await saveDirectorBlueprint(
            {
              showTitle: showTitle.trim() || null,
              showLengthMinutes: Number(showLength),
              audience_type: computedAudience,
              venue_type: venueType,
              tone: tone || theme || '',
              performer_persona: performerPersona,
              constraints: {
                props_owned: propsOwnedList,
                reset_time: resetTime,
                skill_level: skillLevel,
                notes: constraintNotes.trim(),
              },
            },
            blueprint
          );
        } catch (err) {
          console.error(err);

          // Telemetry: request error
          trackClientEvent({
            tool: 'director_mode',
            action: 'director_request_error',
            metadata: { speed_mode: 'full' },
            outcome: 'ERROR_UPSTREAM',
            error_code: err instanceof Error ? err.name : 'UNKNOWN',
          });
          setError(err instanceof Error ? err.message : "An unknown error occurred while generating the plan. The AI may have returned an invalid structure. Please try again.");
        } finally {
          setIsLoading(false);
        }
    };
  
    // Phase C: Send structured blueprint into Show Planner as a NEW show + 4 core tasks.
    
    const buildIdeaFromShowPlan = (plan: DirectorModeBlueprint) => {
        const lines: string[] = [];

        lines.push(`Show Title: ${plan.show_title}`);
        lines.push(`Length: ${plan.show_length_minutes} min`);
        lines.push(`Audience: ${plan.audience_type}`);
        lines.push(`Venue: ${plan.venue_type}`);
        lines.push(`Tone: ${plan.tone}`);
        lines.push(`Performer Persona: ${plan.performer_persona}`);
        lines.push('');

        const c = plan.constraints;
        lines.push('Constraints:');
        lines.push(`  • Skill Level: ${c?.skill_level || ''}`);
        lines.push(`  • Reset Time: ${c?.reset_time || ''}`);
        if (Array.isArray(c?.props_owned) && c.props_owned.length) {
            lines.push(`  • Props Owned: ${c.props_owned.join(', ')}`);
        }
        if (c?.notes?.trim()) {
            lines.push(`  • Notes: ${c.notes.trim()}`);
        }
        lines.push('');

        lines.push('Segments:');
        (plan.segments || []).forEach((seg, i) => {
            lines.push(`  ${i + 1}) ${seg.purpose.toUpperCase()} (${seg.duration_estimate_minutes} min): ${seg.title}`);
            lines.push(`     - Interaction: ${seg.audience_interaction_level}`);
            if (Array.isArray(seg.props_required) && seg.props_required.length) {
                lines.push(`     - Props: ${seg.props_required.join(', ')}`);
            }
            if (seg.transition_notes?.trim()) {
                lines.push(`     - Transition: ${seg.transition_notes.trim()}`);
            }
        });

        return {
            title: plan.show_title,
            content: lines.join('\n'),
        };
    };;

    const handleSaveToIdeas = async () => {
        const active = getActiveBlueprint() ?? showPlan;
        if (!active || isSavingIdea || isSavedToIdeas) return;
        try {
            setIsSavingIdea(true);
            setSaveStatus('saving');
            setError(null);
            setIdeaNotice(null);

            const outline = buildOutlineFromBlueprint(active);
            await saveIdea({
                type: 'text',
                title: `${active.show_title} (Blueprint)`,
                content: outline + `\n\n---\nBlueprint JSON:\n` + JSON.stringify(active, null, 2),
                tags: ['blueprint', 'director-mode', 'show-builder'],
            });

            setIsSavedToIdeas(true);
            setSaveStatus('saved');
            window.setTimeout(() => setSaveStatus('idle'), 3000);

            // Telemetry: saved blueprint
            trackClientEvent({
                tool: 'director_mode',
                action: 'director_save_blueprint',
            });
            setIdeaNotice('Saved — open Saved Ideas to view this blueprint.');
            window.setTimeout(() => setIdeaNotice(null), 7000);
            onIdeaSaved?.();
        } catch (e: any) {
            console.error('Save to Ideas failed:', e);
            setSaveStatus('failed');
            window.setTimeout(() => setSaveStatus('idle'), 4500);
            setError(e?.message ?? 'Unable to save to Saved Ideas.');
        } finally {
            setIsSavingIdea(false);
            if (saveStatus === 'saving') setSaveStatus('idle');
        }
    };

    const handleCopyJson = async () => {
        const active = getActiveBlueprint() ?? showPlan;
        if (!active) return;
        const ok = await copyToClipboard(JSON.stringify(active, null, 2));
        setRefineNotice(ok ? 'Copied blueprint JSON to clipboard.' : 'Copy failed — your browser blocked clipboard access.');
        window.setTimeout(() => setRefineNotice(null), 2500);
    };

    const handleCopyOutline = async () => {
        const active = getActiveBlueprint() ?? showPlan;
        if (!active) return;

        // Copy should match what the user is currently viewing (Segments | Show Outline | JSON)
        let payload = '';
        let ok = false;

        if (blueprintView === 'json') {
            payload = JSON.stringify(active, null, 2);
            ok = await copyToClipboard(payload);
            setRefineNotice(ok ? 'Copied JSON to clipboard.' : 'Copy failed — your browser blocked clipboard access.');
        } else if (blueprintView === 'outline') {
            payload = blueprintToOutline(active, { fullDetail: outlineFullDetail });
            ok = await copyToClipboard(payload);
            setRefineNotice(ok ? 'Copied outline to clipboard.' : 'Copy failed — your browser blocked clipboard access.');
        } else {
            // segments
            const segs = (active.segments || []) as any[];
            const total = segs.length || 0;

            const getTimelineRole = (idx: number, totalCount: number, seg: any) => {
                const p = String(seg?.purpose || '').toLowerCase();
                if (p.includes('open')) return 'Opener';
                if (p.includes('close')) return 'Closer';
                if (p.includes('middle')) return 'Middle';
                if (p.includes('audience')) return 'Audience Piece';
                if (p.includes('feature')) return 'Feature';
                if (idx === 0) return 'Opener';
                if (idx === totalCount - 1) return 'Closer';
                const middleCount = Math.max(0, totalCount - 2);
                const pos = idx - 1;
                if (middleCount <= 1) return 'Middle';
                if (middleCount === 2) return pos === 0 ? 'Middle' : 'Feature';
                if (middleCount === 3) return ['Middle', 'Feature', 'Audience Piece'][pos] || 'Feature';
                if (pos === 0) return 'Middle';
                if (pos === 1) return 'Feature';
                if (pos === 2) return 'Audience Piece';
                return 'Feature';
            };

            const fullDetail = outlineFullDetail;

            payload = segs.map((seg, idx) => {
                const role = getTimelineRole(idx, total, seg);
                const minutes = Number(seg?.duration_estimate_minutes) || 0;
                const lines: string[] = [];
                lines.push(`${role.toUpperCase()} — ${seg?.title || 'Untitled'} (${minutes}m)`);
                const props = Array.isArray(seg?.props_required) ? seg.props_required.filter(Boolean) : [];
                if (props.length) lines.push(`Props: ${props.join(', ')}`);
                if (String(seg?.transition_notes || '').trim()) lines.push(`Transition: ${String(seg.transition_notes).trim()}`);
                if (fullDetail) {
                    const beats = Array.isArray(seg?.beats) ? seg.beats.filter(Boolean) : [];
                    if (beats.length) lines.push(`Beats: ${beats.join(' • ')}`);
                    if (String(seg?.patter_hook || '').trim()) lines.push(`Patter: ${String(seg.patter_hook).trim()}`);
                    if (String(seg?.blocking_notes || '').trim()) lines.push(`Blocking: ${String(seg.blocking_notes).trim()}`);
                    if (String(seg?.volunteer_management || '').trim()) lines.push(`Volunteer: ${String(seg.volunteer_management).trim()}`);
                    if (String(seg?.music_lighting || '').trim()) lines.push(`Music/lighting: ${String(seg.music_lighting).trim()}`);
                }
                return lines.join('\n');
            }).join('\n\n');

            ok = await copyToClipboard(payload);
            setRefineNotice(ok ? 'Copied segments to clipboard.' : 'Copy failed — your browser blocked clipboard access.');
        }

        window.setTimeout(() => setRefineNotice(null), 2500);
    };

    const handleCopyShowOutline = async () => {
        const active = getActiveBlueprint() ?? showPlan;
        if (!active) return;
        const ok = await copyToClipboard(blueprintToOutline(active, { fullDetail: outlineFullDetail }));
        setRefineNotice(ok ? 'Copied show outline to clipboard.' : 'Copy failed — your browser blocked clipboard access.');
        window.setTimeout(() => setRefineNotice(null), 2500);
    };

    const handleCreateShow = async () => {
        const active = getActiveBlueprint() ?? showPlan;
        if (!active || isAddingToPlanner || createdShowId) return;
        try {
            setIsAddingToPlanner(true);
            setError(null);
            setCreateShowNotice(null);
            const description = buildOutlineFromBlueprint(active) + `\n\n---\nBlueprint JSON:\n` + JSON.stringify(active, null, 2);
            const created = await createShow(active.show_title, description);
            const showId = (created as any)?.id ?? null;
            setCreatedShowId(showId);
            setCreateShowNotice('Show created in Show Planner.');

            // Telemetry: created show
            trackClientEvent({
                tool: 'director_mode',
                action: 'director_create_show',
            });
            window.setTimeout(() => setCreateShowNotice(null), 7000);
        } catch (e: any) {
            console.error('Create show failed:', e);
            setError(e?.message ?? 'Unable to create show.');
        } finally {
            setIsAddingToPlanner(false);
        }
    };

    const handleReset = () => {
        // Booth demo reset: clear generated output, reset versions, and scroll to top
        setIsLoading(false);
        setIsRefining(false);
        setError(null);

        setShowPlan(null);
        setBlueprintVersions([]);
        setActiveBlueprintId(null);

        setRefineNotice(null);
        setPlannerNotice(null);
        setIdeaNotice(null);
        setSaveStatus('idle');

        setCreatedShowId(null);
        setCreateShowNotice(null);
        setIsAddedToPlanner(false);
        setIsSavedToIdeas(false);

        setBlueprintView('outline');
        setTimelineReady(false);

        // Optional: clear timing badges so each booth run is clean
        setGenTimingMs({});

        if (typeof window !== 'undefined' && window.scrollTo) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };


    const handleRefine = async (instruction: string) => {
        const active = getActiveBlueprint() ?? showPlan;
        if (!active || isRefining) return;
        setIsRefining(true);
        setError(null);
        setRefineNotice(null);

        const propsOwnedList = propsOwned
            .split(/\n|,/g)
            .map((s) => s.trim())
            .filter(Boolean);

        const originalInputs = {
            show_title: showTitle.trim() || null,
            show_length_minutes: Number(showLength),
            audience_type: computedAudience,
            venue_type: venueType,
            tone: tone || theme || '',
            performer_persona: performerPersona,
            constraints: {
                props_owned: propsOwnedList,
                reset_time: resetTime,
                skill_level: skillLevel,
                notes: constraintNotes.trim(),
            },
            hints: {
                pacing,
                comedyLevel,
                participation,
                volunteersOk,
            },
        };

        const showLenNum = Number(showLength);
        const fullSegmentsTarget = !Number.isFinite(showLenNum)
          ? 5
          : showLenNum <= 25
            ? 4
            : showLenNum <= 40
              ? 5
              : 6;

        const speedConstraints = `\nGeneration mode: FULL (reliability-first)\n- Return EXACTLY ${fullSegmentsTarget} segments total (not fewer).\n- Must include exactly 1 opener and 1 closer.\n- All remaining segments must be purpose: middle.\n- Each segment MUST include these full-detail fields (schema-required):\n  - beats: array of 2–4 short "moments" (strings)\n  - patter_hook: 1–2 sentences\n  - blocking_notes: 1–2 sentences (stage movement / handling)\n  - volunteer_management: short line (or empty string if not needed)\n  - music_lighting: short line (or empty string if not needed)\n- Make purpose STRONGER and more specific (an actionable intent, not generic).\n- transition_notes: 2 sentences (when possible), practical and non-exposure.\n- props_required: keep practical (up to ~6 items when needed).`;

        const refinePrompt = `
You are refining an EXISTING show blueprint.

Return a NEW JSON blueprint that matches the schema.

Original inputs (do not lose these):\n${JSON.stringify(originalInputs, null, 2)}

Last blueprint JSON:\n${JSON.stringify(active, null, 2)}

Refinement instruction:\n- ${instruction}

Hard requirements:
- The returned JSON MUST match the schema.
- Sum of duration_estimate_minutes across segments MUST equal show_length_minutes exactly.
- Must include exactly 1 opener and 1 closer, and at least 1 middle.
- Keep it practical and non-exposure.
${speedConstraints}
`;
        try {
            const startedAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
            const resultJson = await generateStructuredResponse(
                refinePrompt,
                DIRECTOR_MODE_SYSTEM_INSTRUCTION,
                directorResponseSchemaFull,
                undefined,
                { maxOutputTokens: 4096, speedMode: 'full' }
            );
            const next = normalizeDirectorBlueprint(resultJson);
            validateDirectorBlueprint(next, 'full');
            const vId = makeId();
            const diffHint = computeDiffHint(active, next, instruction);

            setBlueprintVersions((prev) => [...prev, { id: vId, createdAt: Date.now(), blueprint: next, diffHint }]);
            setActiveBlueprintId(vId);
          setBlueprintView('outline');
            setShowPlan(next);

            // Reset workflow state since blueprint changed
            setIsAddedToPlanner(false);
            setPlannerNotice(null);
            setCreatedShowId(null);
            setCreateShowNotice(null);

            setRefineNotice(`Updated — ${diffHint}`);
            window.setTimeout(() => setRefineNotice(null), 3500);

            // Persist refined blueprint (non-fatal)
            await saveDirectorBlueprint({ ...originalInputs, refinement: instruction, previous_blueprint_id: activeBlueprintId }, next);

            // Telemetry: refine (best-effort)
            trackClientEvent({
                tool: 'director_mode',
                action: 'director_refine_click',
                metadata: { speed_mode: 'full' },
                units: Array.isArray(next?.segments) ? next.segments.length : undefined,
            });
        } catch (e: any) {
            console.error('Refine failed:', e);
            setError(e?.message ?? 'Unable to refine blueprint.');
        } finally {
            setIsRefining(false);
        }
    };

    const handleSendToPlanner = async () => {
        if (!showPlan) return;
        if (isAddedToPlanner || isAddingToPlanner) return;

        try {
            setIsAddingToPlanner(true);
            setError(null);
            setPlannerNotice(null);

            const active = getActiveBlueprint() ?? showPlan;
            const description = buildOutlineFromBlueprint(active) + `\n\n---\nBlueprint JSON:\n` + JSON.stringify(active, null, 2);
            const created = await createShow(active.show_title, description);
            const showId = created?.id;
            if (!showId) throw new Error('Could not create the show in Show Planner.');
            setCreatedShowId(showId);

            const tasks = (active.segments || []).map((seg) => {
                const propsLine = Array.isArray(seg.props_required) && seg.props_required.length
                    ? `Props: ${seg.props_required.join(', ')}\n`
                    : '';
                const notes =
                    `Purpose: ${seg.purpose}\n` +
                    `Estimated: ${seg.duration_estimate_minutes} min\n` +
                    `Interaction: ${seg.audience_interaction_level}\n` +
                    propsLine +
                    `Transition: ${seg.transition_notes || ''}` +
                    (Array.isArray((seg as any).beats) && (seg as any).beats.length ? `\nBeats: ${(seg as any).beats.join(' | ')}` : '') +
                    ((seg as any).patter_hook ? `\nPatter hook: ${(seg as any).patter_hook}` : '') +
                    ((seg as any).blocking_notes ? `\nBlocking notes: ${(seg as any).blocking_notes}` : '') +
                    ((seg as any).volunteer_management ? `\nVolunteer management: ${(seg as any).volunteer_management}` : '') +
                    ((seg as any).music_lighting ? `\nMusic/lighting: ${(seg as any).music_lighting}` : '');

                return {
                    title: `Build: ${seg.title}`,
                    notes,
                    priority: 'Medium' as const,
                    dueDate: null,
                    durationMinutes: Math.max(1, Math.round(Number(seg.duration_estimate_minutes) || 1)),
                    tags: ['director-mode', 'show-builder', seg.purpose],
                    subtasks: [
                        `Rehearse ${seg.purpose}`,
                        'Source props',
                        'Write patter',
                        'Block staging / beats',
                    ],
                };
            });

            if (!tasks.length) throw new Error('No segments were returned to create planner tasks.');

            await addTasksToShow(showId, tasks as any);

            setIsAddedToPlanner(true);
            setIsAddingToPlanner(false);
            setPlannerNotice('Added to Show Planner — a show and tasks were created from your blueprint.');

            // Telemetry: sent to show planner
            trackClientEvent({
                tool: 'director_mode',
                action: 'director_send_to_show_planner',
            });
        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : 'Failed to send to Show Planner.');
        } finally {
            setIsAddingToPlanner(false);
        }
    };;

    const handleBackToForm = () => {
        // Phase B: keep inputs editable; do not clear the form.
        setShowPlan(null);
        setBlueprintVersions([]);
        setActiveBlueprintId(null);
        setRefineNotice(null);
        setCreatedShowId(null);
        setCreateShowNotice(null);
        setIsAddedToPlanner(false);
        setIsSavedToIdeas(false);

        // Telemetry: Director Mode request start (best-effort)
        trackClientEvent({
            tool: 'director_mode',
            action: 'director_request_start',
            // Use units to store requested show length for KPI averages
            units: Number.isFinite(Number(showLength)) ? Number(showLength) : undefined,
        });
        setError(null);
    };

    if (isLoading) {
        return <div className="flex-1 flex items-center justify-center"><LoadingIndicator /></div>;
    }
    
    if (showPlan) {
                const active = getActiveBlueprint() ?? showPlan;
        const segments = (active.segments || []) as any[];

        // Support both Full (purpose field present) and Fast (no purpose; infer by index)
        const opener = segments.find((s) => s?.purpose === 'opener') ?? segments[0];
        const closer = segments.find((s) => s?.purpose === 'closer') ?? segments[segments.length - 1];
        const middles = segments.filter((s, idx) => {
            if (!s) return false;
            if (s === opener || s === closer) return false;
            // Prefer explicit purpose when available; otherwise treat as middle bucket.
            if (s?.purpose) return s.purpose === 'middle';
            return true;
        });

        const getTimelineRole = (idx: number, total: number, seg: any) => {
            const p = String(seg?.purpose || '').toLowerCase();
            if (p.includes('open')) return 'Opener';
            if (p.includes('close')) return 'Closer';
            if (p.includes('middle')) return 'Middle';
            if (p.includes('audience')) return 'Audience Piece';
            if (p.includes('feature')) return 'Feature';

            if (idx === 0) return 'Opener';
            if (idx === total - 1) return 'Closer';

            const middleCount = Math.max(0, total - 2);
            const pos = idx - 1; // 0..middleCount-1

            if (middleCount <= 1) return 'Middle';
            if (middleCount === 2) return pos === 0 ? 'Middle' : 'Feature';
            if (middleCount === 3) return ['Middle', 'Feature', 'Audience Piece'][pos] || 'Feature';

            // 4+ middle items: Middle, Feature, Audience Piece, then remaining as Feature(s)
            if (pos === 0) return 'Middle';
            if (pos === 1) return 'Feature';
            if (pos === 2) return 'Audience Piece';
            return 'Feature';
        };

        const timelineItems = (() => {
            const total = segments.length || 0;
            const sum = segments.reduce((acc, s) => acc + (Number(s?.duration_estimate_minutes) || 0), 0) || 1;

            return segments.map((s, idx) => {
                const minutes = Number(s?.duration_estimate_minutes) || 0;
                const pct = Math.max(6, Math.round((minutes / sum) * 100)); // minimum visual width
                return {
                    idx,
                    role: getTimelineRole(idx, total, s),
                    title: String(s?.title || ''),
                    minutes,
                    pct,
                };
            });
        })();


        return (

            <main className="flex-1 overflow-y-auto p-4 md:p-6 animate-fade-in">
                <div className="w-full max-w-7xl mx-auto">
                    <div className="mb-4 md:mb-5 text-left">
                        <h2 className="text-xl md:text-2xl font-bold text-slate-300 font-cinzel">Director Mode</h2>
                        <p className="text-slate-400 mt-1 text-sm">Your show blueprint is ready. Refine it, save it, or send it to the Show Planner.</p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* LEFT PANEL — Controls */}
                        <div className="space-y-4">
                            <div className="bg-slate-800/50 p-5 rounded-lg border border-slate-700">
                                <h3 className="text-xl font-bold text-white font-cinzel">{active.show_title}</h3>
                                <p className="text-slate-400 mt-2 text-sm">
                                    {active.show_length_minutes} min • {active.audience_type} • {active.venue_type}
                                </p>
                                <p className="text-slate-400 mt-1 text-sm">
                                    Tone: <span className="text-slate-200">{active.tone}</span> • Persona: <span className="text-slate-200">{active.performer_persona}</span>
                                </p>

                                <div className="mt-4 flex flex-wrap gap-2">
                                    <span className="px-2.5 py-1 rounded-full border text-xs bg-slate-900/60 border-slate-600/60 text-slate-200">
                                        Skill: {active.constraints?.skill_level || '—'}
                                    </span>
                                    <span className="px-2.5 py-1 rounded-full border text-xs bg-slate-900/60 border-slate-600/60 text-slate-200">
                                        Reset: {active.constraints?.reset_time || '—'}
                                    </span>
                                    <span className="px-2.5 py-1 rounded-full border text-xs bg-slate-900/60 border-slate-600/60 text-slate-200">
                                        Venue: {active.venue_type || '—'}
                                    </span>
                                </div>

                                <div className="mt-4 flex flex-wrap gap-2">
                                    <button
                                        onClick={handleBackToForm}
                                        className="px-4 py-2 rounded-lg bg-slate-900/40 hover:bg-slate-900/60 text-slate-200 border border-slate-700"
                                    >
                                        Back
                                    </button>
                                    <div className="min-w-[120px] text-sm text-slate-300/90 pl-3">
                                        {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved ✓' : saveStatus === 'failed' ? 'Save failed' : ''}
                                    </div>

                                    <button
                                        onClick={handleSaveToIdeas}
                                        disabled={isSavingIdea || isSavedToIdeas}
                                        className={`px-4 py-2 rounded-lg border ${
                                            isSavedToIdeas ? 'bg-emerald-600/20 border-emerald-400 text-emerald-200' : 'bg-purple-600 hover:bg-purple-500 border-purple-400 text-white'
                                        }`}
                                    >
                                        {isSavedToIdeas ? (
                                            <span className="inline-flex items-center gap-2"><CheckIcon className="w-5 h-5" /> Saved</span>
                                        ) : (
                                            <span className="inline-flex items-center gap-2"><SaveIcon className="w-5 h-5" /> Save Blueprint</span>
                                        )}
                                    </button>

                                    <button
                                        onClick={handleCreateShow}
                                        disabled={isAddingToPlanner || Boolean(createdShowId)}
                                        className={`px-4 py-2 rounded-lg border ${
                                            createdShowId ? 'bg-emerald-600/20 border-emerald-400 text-emerald-200' : 'bg-slate-900/40 hover:bg-slate-900/60 border-slate-700 text-slate-200'
                                        }`}
                                    >
                                        {createdShowId ? 'Show Created' : 'Create Show'}
                                    </button>

                                    <button
                                        onClick={handleSendToPlanner}
                                        disabled={isAddingToPlanner || isAddedToPlanner}
                                        className={`px-4 py-2 rounded-lg border ${
                                            isAddedToPlanner ? 'bg-emerald-600/20 border-emerald-400 text-emerald-200' : 'bg-slate-900/40 hover:bg-slate-900/60 border-slate-700 text-slate-200'
                                        }`}
                                    >
                                        {isAddedToPlanner ? (
                                            <span className="inline-flex items-center gap-2"><ChecklistIcon className="w-5 h-5" /> Sent</span>
                                        ) : (
                                            <span className="inline-flex items-center gap-2"><ChecklistIcon className="w-5 h-5" /> Send to Show Planner</span>
                                        )}
                                    </button>

                                    <button
                                        onClick={handleCopyOutline}
                                        className="px-4 py-2 rounded-lg bg-slate-900/40 hover:bg-slate-900/60 text-slate-200 border border-slate-700"
                                    >
                                        {blueprintView === 'json' ? 'Copy JSON' : blueprintView === 'segments' ? 'Copy Segments' : 'Copy Outline'}
                                    </button>

                                    <button
                                        onClick={handleCopyJson}
                                        className="px-4 py-2 rounded-lg bg-slate-900/40 hover:bg-slate-900/60 text-slate-200 border border-slate-700"
                                    >
                                        Copy JSON
                                    </button>
                                </div>
                            </div>

                            {/* Refinement controls */}
                            <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-4">
                                <div>
                                    <p className="text-sm font-semibold text-slate-200">Refine Blueprint</p>
                                    <p className="text-xs text-slate-400">One-click refinements create a new version (v1, v2, v3…).</p>
                                </div>

                                <div className="mt-3 flex flex-wrap gap-2">
                                    {[
                                        'More audience interaction',
                                        'More comedy',
                                        'More dramatic',
                                        'Shorten show by 5 minutes',
                                        'Swap closer',
                                        'Reduce prop resets',
                                    ].map((label) => (
                                        <button
                                            key={label}
                                            type="button"
                                            onClick={() => handleRefine(label)}
                                            disabled={isRefining}
                                            className={(isRefining ? 'opacity-60 cursor-not-allowed ' : '') + 'px-3 py-1 rounded-full border text-xs transition-colors bg-slate-900/60 border-slate-600/60 text-slate-200 hover:bg-slate-900'}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>

                                {blueprintVersions.length ? (
                                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                                        <span className="text-xs text-slate-400 mr-1">Versions:</span>
                                        {blueprintVersions.map((v, idx) => {
                                            const activeV = v.id === activeBlueprintId;
                                            return (
                                                <button
                                                    key={v.id}
                                                    type="button"
                                                    onClick={() => setActiveBlueprintId(v.id)}
                                                    className={
                                                        (activeV
                                                            ? 'bg-yellow-500/20 border-yellow-500/40 text-yellow-200'
                                                            : 'bg-slate-900/60 border-slate-600/60 text-slate-300 hover:bg-slate-900') +
                                                        ' px-2.5 py-1 rounded-full border text-xs transition-colors'
                                                    }
                                                    title={v.diffHint || ''}
                                                >
                                                    v{idx + 1}
                                                </button>
                                            );
                                        })}
                                        {blueprintVersions.length >= 2 && blueprintVersions[blueprintVersions.length - 1]?.diffHint ? (
                                            <span className="text-xs text-slate-400">Latest: {blueprintVersions[blueprintVersions.length - 1].diffHint}</span>
                                        ) : null}
                                    </div>
                                ) : null}
                            </div>

                            {/* Notices */}
                            {plannerNotice ? (
                                <div className="bg-emerald-900/20 border border-emerald-700 text-emerald-200 rounded-lg p-3 text-sm">
                                    {plannerNotice}
                                </div>
                            ) : null}

                            {createShowNotice ? (
                                <div className="bg-emerald-900/10 border border-emerald-700 text-emerald-200 rounded-lg p-3 text-sm">
                                    {createShowNotice}
                                </div>
                            ) : null}

                            {ideaNotice ? (
                                <div className="bg-emerald-900/10 border border-emerald-700 text-emerald-200 rounded-lg p-3 text-sm">
                                    {ideaNotice}
                                </div>
                            ) : null}

                            {refineNotice ? (
                                <div className="bg-slate-900/40 border border-slate-700 text-slate-200 rounded-lg p-3 text-sm">
                                    {refineNotice}
                                </div>
                            ) : null}

                            {error ? (
                                <div className="bg-rose-900/20 border border-rose-700 text-rose-200 rounded-lg p-3 text-sm">
                                    {error}
                                </div>
                            ) : null}

                            {/* Constraints detail */}
                            <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                                <h3 className="text-lg font-bold text-[#E6C77A] font-cinzel">Constraints</h3>
                                <div className="mt-3 space-y-2 text-sm text-slate-300">
                                    <p><span className="text-slate-400">Skill level:</span> {active.constraints?.skill_level || ''}</p>
                                    <p><span className="text-slate-400">Reset time:</span> {active.constraints?.reset_time || ''}</p>
                                    <p><span className="text-slate-400">Props owned:</span> {(active.constraints?.props_owned || []).join(', ') || '—'}</p>
                                    {active.constraints?.notes?.trim() ? (
                                        <p><span className="text-slate-400">Notes:</span> {active.constraints.notes}</p>
                                    ) : null}
                                </div>
                            </div>
                        </div>

                        {/* RIGHT PANEL — Output */}
                        <div className="space-y-4">
                            <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                                <div className="flex items-center justify-between gap-3">
                                    <h3 className="text-xl font-bold text-[#E6C77A] font-cinzel">
                                        {blueprintView === 'segments' ? 'Segments' : blueprintView === 'outline' ? 'Show Outline' : 'Blueprint JSON'}
                                    </h3>

                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setBlueprintView('segments')}
                                            className={
                                                (blueprintView === 'segments'
                                                    ? 'bg-purple-600/30 border-purple-400 text-purple-100'
                                                    : 'bg-slate-900/40 border-slate-700 text-slate-200 hover:bg-slate-900/60') +
                                                ' px-3 py-1.5 rounded-full border text-xs transition-colors'
                                            }
                                        >
                                            Segments
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setBlueprintView('outline')}
                                            className={
                                                (blueprintView === 'outline'
                                                    ? 'bg-purple-600/30 border-purple-400 text-purple-100'
                                                    : 'bg-slate-900/40 border-slate-700 text-slate-200 hover:bg-slate-900/60') +
                                                ' px-3 py-1.5 rounded-full border text-xs transition-colors'
                                            }
                                        >
                                            Show Outline
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setBlueprintView('json')}
                                            className={
                                                (blueprintView === 'json'
                                                    ? 'bg-purple-600/30 border-purple-400 text-purple-100'
                                                    : 'bg-slate-900/40 border-slate-700 text-slate-200 hover:bg-slate-900/60') +
                                                ' px-3 py-1.5 rounded-full border text-xs transition-colors'
                                            }
                                        >
                                            JSON
                                        </button>
                                    </div>
                                </div>

                                {timelineItems.length ? (
                                    <div className="mt-3">
                                        <div className="flex items-center justify-between mb-2">
                                            <p className="text-xs text-slate-400">Show Timeline</p>
                                            <p className="text-xs text-slate-500">{segments.reduce((acc, s) => acc + (Number(s?.duration_estimate_minutes) || 0), 0)} min total</p>
                                        </div>

                                        <div className="flex w-full gap-2">
                                            {timelineItems.map((it) => (
                                                <div
                                                    key={it.idx}
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={() => {
                                                        setBlueprintView('segments');
                                                        requestAnimationFrame(() => {
                                                            const el = document.getElementById(`segment-card-${it.idx}`);
                                                            el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                                        });
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' || e.key === ' ') {
                                                            e.preventDefault();
                                                            setBlueprintView('segments');
                                                            requestAnimationFrame(() => {
                                                                const el = document.getElementById(`segment-card-${it.idx}`);
                                                                el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                                            });
                                                        }
                                                    }}
                                                    className="flex flex-col justify-between bg-slate-900/40 border border-slate-700/60 rounded-lg p-2 min-w-[88px] transition-transform duration-500 ease-out cursor-pointer hover:bg-slate-900/60 hover:border-purple-400/60"
                                                    style={{ width: `${it.pct}%`, transform: timelineReady ? 'scaleX(1)' : 'scaleX(0.02)', transformOrigin: 'left' }}
                                                    title={`${it.role} — ${it.title} (${it.minutes} min)`}
                                                >
                                                    <p className="text-[10px] uppercase tracking-wide text-slate-400">{it.role}</p>
                                                    <p className="text-xs text-slate-100 font-semibold leading-snug line-clamp-2">{it.title || '—'}</p>
                                                    <p className="text-[11px] text-slate-300 mt-1">{it.minutes}m</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : null}


                                {blueprintView === 'segments' ? (
                                    <div className="mt-3 space-y-3 text-sm text-slate-300">
                                        {opener ? (
                                            <div id={`segment-card-${segments.indexOf(opener)}`} className="bg-slate-900/40 rounded-md p-3 border border-slate-700/60">
                                                <p className="font-semibold text-white">Opener</p>
                                                <p className="text-slate-300">{opener.title} • {opener.duration_estimate_minutes} min{opener.audience_interaction_level ? ` • ${opener.audience_interaction_level}` : ''}</p>
                                                <p className="text-slate-400 mt-1">Props: {(opener.props_required || []).join(', ') || '—'}</p>
                                                {opener.transition_notes ? <p className="text-slate-400 mt-1">Transition: {opener.transition_notes}</p> : null}
                                                {outlineFullDetail ? (
                                                    <div className="text-slate-400 mt-2 space-y-1">
                                                        {Array.isArray((opener as any).beats) && (opener as any).beats.length ? (
                                                            <p>Beats: {(opener as any).beats.join(' • ')}</p>
                                                        ) : null}
                                                        {(opener as any).patter_hook ? <p>Patter hook: {(opener as any).patter_hook}</p> : null}
                                                        {(opener as any).blocking_notes ? <p>Blocking: {(opener as any).blocking_notes}</p> : null}
                                                        {(opener as any).volunteer_management ? <p>Volunteer: {(opener as any).volunteer_management}</p> : null}
                                                        {(opener as any).music_lighting ? <p>Music/lighting: {(opener as any).music_lighting}</p> : null}
                                                    </div>
                                                ) : null}
                                            </div>
                                        ) : null}

                                        {middles.map((mSeg, i) => (
                                            <div key={i} id={`segment-card-${segments.indexOf(mSeg)}`} className="bg-slate-900/40 rounded-md p-3 border border-slate-700/60">
                                                <p className="font-semibold text-white">Middle</p>
                                                <p className="text-slate-300">{mSeg.title} • {mSeg.duration_estimate_minutes} min{mSeg.audience_interaction_level ? ` • ${mSeg.audience_interaction_level}` : ''}</p>
                                                <p className="text-slate-400 mt-1">Props: {(mSeg.props_required || []).join(', ') || '—'}</p>
                                                {mSeg.transition_notes ? <p className="text-slate-400 mt-1">Transition: {mSeg.transition_notes}</p> : null}
                                                {outlineFullDetail ? (
                                                    <div className="text-slate-400 mt-2 space-y-1">
                                                        {Array.isArray((mSeg as any).beats) && (mSeg as any).beats.length ? (
                                                            <p>Beats: {(mSeg as any).beats.join(' • ')}</p>
                                                        ) : null}
                                                        {(mSeg as any).patter_hook ? <p>Patter hook: {(mSeg as any).patter_hook}</p> : null}
                                                        {(mSeg as any).blocking_notes ? <p>Blocking: {(mSeg as any).blocking_notes}</p> : null}
                                                        {(mSeg as any).volunteer_management ? <p>Volunteer: {(mSeg as any).volunteer_management}</p> : null}
                                                        {(mSeg as any).music_lighting ? <p>Music/lighting: {(mSeg as any).music_lighting}</p> : null}
                                                    </div>
                                                ) : null}
                                            </div>
                                        ))}

                                        {closer ? (
                                            <div id={`segment-card-${segments.indexOf(closer)}`} className="bg-slate-900/40 rounded-md p-3 border border-slate-700/60">
                                                <p className="font-semibold text-white">Closer</p>
                                                <p className="text-slate-300">{closer.title} • {closer.duration_estimate_minutes} min{closer.audience_interaction_level ? ` • ${closer.audience_interaction_level}` : ''}</p>
                                                <p className="text-slate-400 mt-1">Props: {(closer.props_required || []).join(', ') || '—'}</p>
                                                {closer.transition_notes ? <p className="text-slate-400 mt-1">Transition: {closer.transition_notes}</p> : null}
                                                {outlineFullDetail ? (
                                                    <div className="text-slate-400 mt-2 space-y-1">
                                                        {Array.isArray((closer as any).beats) && (closer as any).beats.length ? (
                                                            <p>Beats: {(closer as any).beats.join(' • ')}</p>
                                                        ) : null}
                                                        {(closer as any).patter_hook ? <p>Patter hook: {(closer as any).patter_hook}</p> : null}
                                                        {(closer as any).blocking_notes ? <p>Blocking: {(closer as any).blocking_notes}</p> : null}
                                                        {(closer as any).volunteer_management ? <p>Volunteer: {(closer as any).volunteer_management}</p> : null}
                                                        {(closer as any).music_lighting ? <p>Music/lighting: {(closer as any).music_lighting}</p> : null}
                                                    </div>
                                                ) : null}
                                            </div>
                                        ) : null}
                                    </div>
                                ) : null}

                                {blueprintView === 'outline' ? (
                                    <div className="mt-3">
                                        <div className="flex items-center justify-between mb-2 gap-3">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setOutlineFullDetail((v) => !v)}
                                                    className={
                                                        (outlineFullDetail
                                                            ? 'bg-purple-600/30 border-purple-400 text-purple-100'
                                                            : 'bg-slate-900/40 border-slate-700 text-slate-200 hover:bg-slate-900/60') +
                                                        ' px-3 py-1.5 rounded-full border text-xs transition-colors'
                                                    }
                                                    title='Toggle full-detail outline formatting'
                                                >
                                                    {outlineFullDetail ? 'Full Detail: On' : 'Full Detail: Off'}
                                                </button>
                                                {
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => setOutlineFullDetail(true)}
                                                            disabled={outlineFullDetail}
                                                            className={
                                                                (outlineFullDetail
                                                                    ? 'opacity-60 cursor-not-allowed bg-slate-900/30 border-slate-800 text-slate-400'
                                                                    : 'bg-slate-900/40 border-slate-700 text-slate-200 hover:bg-slate-900/60') +
                                                                ' px-2.5 py-1.5 rounded-full border text-xs transition-colors'
                                                            }
                                                            title="Expand all director notes"
                                                        >
                                                            Expand all
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setOutlineFullDetail(false)}
                                                            disabled={!outlineFullDetail}
                                                            className={
                                                                (!outlineFullDetail
                                                                    ? 'opacity-60 cursor-not-allowed bg-slate-900/30 border-slate-800 text-slate-400'
                                                                    : 'bg-slate-900/40 border-slate-700 text-slate-200 hover:bg-slate-900/60') +
                                                                ' px-2.5 py-1.5 rounded-full border text-xs transition-colors'
                                                            }
                                                            title="Collapse director notes"
                                                        >
                                                            Collapse all
                                                        </button>
                                                    </div>
                                                }

                                                <span className="text-xs text-slate-400 hidden sm:inline">
                                                    {outlineFullDetail
                                                      ? 'Director notes enabled.'
                                                      : 'Enable Full Detail to view director notes.'}
                                                </span>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={handleCopyShowOutline}
                                                className="px-3 py-1.5 rounded-lg bg-slate-900/40 hover:bg-slate-900/60 text-slate-200 border border-slate-700 text-xs"
                                            >
                                                Copy Show Outline
                                            </button>
                                        </div>
                                        <div className="space-y-3">
                                            {(segments || []).map((seg: any, idx: number) => {
                                                const role = getTimelineRole(idx, (segments || []).length, seg);
                                                const isFullDetail = outlineFullDetail;

                                                return (
                                                    <div key={idx} className="bg-slate-900/40 rounded-md p-3 border border-slate-700/60">
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div>
                                                                <p className="font-semibold text-white">{role}</p>
                                                                <p className="text-slate-300">{seg.title} • {seg.duration_estimate_minutes} min</p>
                                                            </div>
                                                            <div className="text-right">
                                                                <p className="text-xs text-slate-400">Props</p>
                                                                <p className="text-xs text-slate-300">{(seg.props_required || []).join(', ') || '—'}</p>
                                                            </div>
                                                        </div>

                                                        {seg.transition_notes ? (
                                                            <p className="text-slate-400 mt-2 text-sm">
                                                                <span className="text-slate-500">Transition:</span> {seg.transition_notes}
                                                            </p>
                                                        ) : null}

                                                        {isFullDetail ? (
                                                            <div className="text-slate-400 mt-2 space-y-1 text-sm">
                                                                {Array.isArray(seg.beats) && seg.beats.length ? (
                                                                    <p><span className="text-slate-500">Beats:</span> {seg.beats.join(' • ')}</p>
                                                                ) : null}
                                                                {seg.patter_hook ? <p><span className="text-slate-500">Patter hook:</span> {seg.patter_hook}</p> : null}
                                                                {seg.blocking_notes ? <p><span className="text-slate-500">Blocking:</span> {seg.blocking_notes}</p> : null}
                                                                {seg.volunteer_management ? <p><span className="text-slate-500">Volunteer:</span> {seg.volunteer_management}</p> : null}
                                                                {seg.music_lighting ? <p><span className="text-slate-500">Music/lighting:</span> {seg.music_lighting}</p> : null}
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ) : null}

                                {blueprintView === 'json' ? (
                                    <pre className="mt-3 text-xs text-slate-200 bg-slate-950/40 border border-slate-700/60 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
{JSON.stringify(active, null, 2)}
                                    </pre>
                                ) : null}
                            </div>
                        </div>
                    </div>
                </div>
            </main>
);
    }
    return (
        <main className="flex-1 overflow-y-auto p-4 md:p-6 animate-fade-in">
            <div className="w-full max-w-7xl mx-auto">
                <div className="mb-4 md:mb-5 text-left">
                    <h2 className="text-xl md:text-2xl font-bold text-slate-300 font-cinzel">Director Mode</h2>
                    <p className="text-slate-400 mt-1 text-sm">Let's design your next show. Provide the core details, and the AI will architect a complete show structure for you.</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* LEFT PANEL — Inputs */}
                    <div className="space-y-4">
                        <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
                            <div className="flex items-center justify-between mb-3"><h3 className="text-sm font-semibold text-slate-200">Core Inputs</h3><div className="flex items-center gap-2"><button type="button" onClick={onExampleA} className="px-2.5 py-1 text-xs rounded-md border border-slate-600 bg-slate-900/40 text-slate-200 hover:bg-slate-900/70">Try Example</button><button type="button" onClick={onExampleB} className="px-2.5 py-1 text-xs rounded-md border border-slate-600 bg-slate-900/40 text-slate-200 hover:bg-slate-900/70">Try Another</button></div></div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="show-title" className="block text-sm font-medium text-slate-300 mb-1">Show Title</label>
                                    <input
                                        id="show-title"
                                        type="text"
                                        value={showTitle}
                                        onChange={(e) => setShowTitle(e.target.value)}
                                        onBlur={() => setShowTitle((v) => normalizeTitle(v))}
                                        placeholder="e.g., Mysteries of the Mind"
                                        className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-yellow-500/30 focus:border-yellow-500/40"
                                    />
                                    <p className="mt-1 text-xs text-slate-400">Optional — the AI can generate a title for you.</p>
                                </div>

                                <div>
                                    <label htmlFor="show-length" className="block text-sm font-medium text-slate-300 mb-1">Show Length (min)</label>
                                    <input
                                        id="show-length"
                                        type="number"
                                        inputMode="numeric"
                                        min={5}
                                        max={240}
                                        value={showLength}
                                        onChange={(e) => setShowLength(e.target.value)}
                                        placeholder="e.g., 45"
                                        className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-yellow-500/30 focus:border-yellow-500/40"
                                    />
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {showLengthPresets.map((m) => (
                                            <button
                                                key={m}
                                                type="button"
                                                onClick={() => setShowLength(String(m))}
                                                className={
                                                    (showLength === String(m)
                                                        ? 'bg-yellow-500/20 border-yellow-500/40 text-yellow-200'
                                                        : 'bg-slate-900/60 border-slate-600/60 text-slate-300 hover:bg-slate-900') +
                                                    ' px-2.5 py-1 rounded-full border text-xs transition-colors'
                                                }
                                            >
                                                {m}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4">
                                <label className="block text-sm font-medium text-slate-300 mb-1">Target Audience</label>
                                <div className="flex flex-wrap gap-2">
                                    {audiencePresets.map((label) => {
                                        const selected = audienceChips.includes(label);
                                        return (
                                            <button
                                                key={label}
                                                type="button"
                                                onClick={() => toggleAudienceChip(label)}
                                                className={
                                                    (selected
                                                        ? 'bg-yellow-500/20 border-yellow-500/40 text-yellow-200'
                                                        : 'bg-slate-900/60 border-slate-600/60 text-slate-300 hover:bg-slate-900') +
                                                    ' px-3 py-1 rounded-full border text-xs transition-colors'
                                                }
                                            >
                                                {label}
                                            </button>
                                        );
                                    })}
                                </div>

                                <input
                                    id="audience-type"
                                    type="text"
                                    value={audienceType}
                                    onChange={(e) => setAudienceType(e.target.value)}
                                    placeholder="Optional: add specifics (e.g., ages 8–12, 150 people, corporate holiday party)"
                                    className="mt-3 w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-yellow-500/30 focus:border-yellow-500/40"
                                />
                                <p className="mt-1 text-xs text-slate-400">Tip: pick one or more chips, then add a short note if needed.</p>
                            </div>

                            <div className="mt-4">
                                <label htmlFor="theme" className="block text-sm font-medium text-slate-300 mb-1">Overall Theme / Style</label>
                                <input
                                    id="theme"
                                    type="text"
                                    value={theme}
                                    onChange={(e) => setTheme(e.target.value)}
                                    placeholder="e.g., elegant & mysterious • high-energy comedy • mind reading with audience participation"
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-yellow-500/30 focus:border-yellow-500/40"
                                />
                                <p className="mt-1 text-xs text-slate-400">Describe the overall vibe and style. Tone/persona/constraints are captured below.</p>
                            </div>
                        </div>

                        <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
                            <h3 className="text-sm font-semibold text-slate-200 mb-3">Constraints</h3>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="venue-type" className="block text-sm font-medium text-slate-300 mb-1">Venue Type</label>
                                    <input
                                        id="venue-type"
                                        type="text"
                                        value={venueType}
                                        onChange={(e) => setVenueType(e.target.value)}
                                        placeholder="e.g., banquet hall • theater • close-up strolling • school assembly"
                                        className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-yellow-500/30 focus:border-yellow-500/40"
                                    />
                                </div>

                                <div>
                                    <label htmlFor="tone" className="block text-sm font-medium text-slate-300 mb-1">Tone</label>
                                    <input
                                        id="tone"
                                        type="text"
                                        value={tone}
                                        onChange={(e) => setTone(e.target.value)}
                                        placeholder="e.g., funny • dramatic • mysterious • family-friendly"
                                        className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-yellow-500/30 focus:border-yellow-500/40"
                                    />
                                </div>

                                <div className="sm:col-span-2">
                                    <label htmlFor="persona" className="block text-sm font-medium text-slate-300 mb-1">Performer Persona</label>
                                    <input
                                        id="persona"
                                        type="text"
                                        value={performerPersona}
                                        onChange={(e) => setPerformerPersona(e.target.value)}
                                        placeholder="e.g., charming storyteller • high-energy comedy magician • mysterious mind reader"
                                        className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-yellow-500/30 focus:border-yellow-500/40"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Skill Level</label>
                                    <select
                                        value={skillLevel}
                                        onChange={(e) => setSkillLevel(e.target.value as any)}
                                        className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/30 focus:border-yellow-500/40"
                                    >
                                        <option value="">Select…</option>
                                        <option value="Beginner">Beginner</option>
                                        <option value="Intermediate">Intermediate</option>
                                        <option value="Advanced">Advanced</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Reset Time</label>
                                    <select
                                        value={resetTime}
                                        onChange={(e) => setResetTime(e.target.value as any)}
                                        className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/30 focus:border-yellow-500/40"
                                    >
                                        <option value="">Select…</option>
                                        <option value="Instant">Instant</option>
                                        <option value="30s">~30 seconds</option>
                                        <option value="1 min">~1 minute</option>
                                        <option value="2 min">~2 minutes</option>
                                        <option value="5+ min">5+ minutes</option>
                                    </select>
                                </div>

                                <div className="sm:col-span-2">
                                    <label htmlFor="props-owned" className="block text-sm font-medium text-slate-300 mb-1">Props Owned (optional)</label>
                                    <textarea
                                        id="props-owned"
                                        value={propsOwned}
                                        onChange={(e) => setPropsOwned(e.target.value)}
                                        placeholder="List props you already have (comma or newline separated)"
                                        rows={3}
                                        className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-yellow-500/30 focus:border-yellow-500/40"
                                    />
                                </div>

                                <div className="sm:col-span-2">
                                    <label htmlFor="constraints-notes" className="block text-sm font-medium text-slate-300 mb-1">Constraints / Notes (optional)</label>
                                    <textarea
                                        id="constraints-notes"
                                        value={constraintNotes}
                                        onChange={(e) => setConstraintNotes(e.target.value)}
                                        placeholder="Any constraints: kid-safe, no fire, limited pocket space, no table, etc."
                                        rows={3}
                                        className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-yellow-500/30 focus:border-yellow-500/40"
                                    />
                                </div>
                            </div>

                            <div className="pt-3">
                                <button
                                    type="button"
                                    onClick={() => setShowAdvanced((v) => !v)}
                                    className="w-full flex items-center justify-between px-3 py-2 rounded-md bg-slate-900/40 border border-slate-700 text-slate-200 hover:bg-slate-900/60 transition-colors"
                                >
                                    <span className="text-sm font-semibold">Advanced Options (optional)</span>
                                    <span className="text-xs text-slate-400">{showAdvanced ? 'Hide' : 'Show'}</span>
                                </button>

                                {showAdvanced && (
                                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-1">Pacing</label>
                                            <select
                                                value={pacing}
                                                onChange={(e) => setPacing(e.target.value as any)}
                                                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/30 focus:border-yellow-500/40"
                                            >
                                                <option value="">Select…</option>
                                                <option value="Relaxed">Relaxed</option>
                                                <option value="Balanced">Balanced</option>
                                                <option value="High-energy">High-energy</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-1">Comedy Level</label>
                                            <select
                                                value={comedyLevel}
                                                onChange={(e) => setComedyLevel(e.target.value as any)}
                                                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/30 focus:border-yellow-500/40"
                                            >
                                                <option value="">Select…</option>
                                                <option value="Low">Low</option>
                                                <option value="Medium">Medium</option>
                                                <option value="High">High</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-1">Audience Participation</label>
                                            <select
                                                value={participation}
                                                onChange={(e) => setParticipation(e.target.value as any)}
                                                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/30 focus:border-yellow-500/40"
                                            >
                                                <option value="">Select…</option>
                                                <option value="Low">Low</option>
                                                <option value="Medium">Medium</option>
                                                <option value="High">High</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-1">Volunteers OK?</label>
                                            <select
                                                value={volunteersOk}
                                                onChange={(e) => setVolunteersOk(e.target.value as any)}
                                                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/30 focus:border-yellow-500/40"
                                            >
                                                <option value="">Select…</option>
                                                <option value="Yes">Yes</option>
                                                <option value="No">No</option>
                                            </select>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                            <div className="flex items-center justify-between gap-3 mb-3">
                                <div>
                                    <div className="text-xs font-semibold text-slate-200">Generation Mode</div>
                                    <div className="text-[11px] text-slate-400">Director Mode now always uses Full mode for consistent results.</div>
                                </div>
                                {genTimingMs.full ? (
                                    <span className="inline-flex items-center gap-1 rounded-full border border-slate-600 bg-slate-900/60 px-2 py-0.5 text-[11px] text-slate-200">
                                        <span className="text-slate-400">Last generation:</span> {(genTimingMs.full / 1000).toFixed(1)}s
                                    </span>
                                ) : null}
                            </div>
                            <div className="flex gap-2">
                            <button
                                onClick={handleGenerate}
                                disabled={!isFormValid}
                                className="flex-1 py-3 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed"
                            >
                                <WandIcon className="w-5 h-5" />
                                <span>🎭 Direct My Show Blueprint</span>
                            </button>

                            <button
                                type="button"
                                onClick={handleReset}
                                disabled={isLoading || isRefining}
                                className="px-3 py-3 rounded-md border border-slate-700 bg-slate-900/50 hover:bg-slate-900/70 text-slate-200 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Reset output (booth demo)"
                            >
                                Reset
                            </button>
                        </div>
                            <p className="text-center text-xs text-slate-400 mt-2">Director Mode now uses the full blueprint engine for more consistent results.</p>

                            {error && <p className="text-red-400 mt-2 text-sm text-center">{error}</p>}
                        </div>
                    </div>

                    {/* RIGHT PANEL — Results placeholder */}
                    <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-6 flex flex-col items-center justify-center text-center min-h-[520px]">
                        <div className="w-14 h-14 rounded-xl bg-slate-900/40 border border-slate-700 flex items-center justify-center mb-4">
                            <WandIcon className="w-7 h-7 text-slate-300" />
                        </div>
                        <p className="text-slate-200 font-semibold">Your show blueprint will appear here.</p>
                        <p className="text-slate-400 text-sm mt-2 max-w-sm">
                            Fill in the inputs on the left, then click <span className="text-slate-200">Direct My Show Blueprint</span>.
                            You’ll get a segment-by-segment plan with transitions, props, and workflow actions.
                        </p>
                    </div>
                </div>
            </div>
        </main>
    );
};

export default DirectorMode;
