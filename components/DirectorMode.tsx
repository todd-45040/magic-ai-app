
import React, { useMemo, useState } from 'react';
import { Type } from "@google/genai";
import { saveIdea } from '../services/ideasService';
import { CohesionActions } from './CohesionActions';
import { createShow, addTasksToShow } from '../services/showsService';
import { DIRECTOR_MODE_SYSTEM_INSTRUCTION, MAGIC_DICTIONARY_TERMS } from '../constants';
import type { DirectorModeResponse } from '../types';
import { StageCurtainsIcon, WandIcon, SaveIcon, CheckIcon, ChecklistIcon } from './icons';
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

const DirectorMode: React.FC<DirectorModeProps> = ({ onIdeaSaved }) => {
    // Form State
    const [showTitle, setShowTitle] = useState('');
    const [showLength, setShowLength] = useState('');
    // Audience: quick-select chips + optional custom text
    const [audienceType, setAudienceType] = useState(''); // custom audience text
    const [audienceChips, setAudienceChips] = useState<string[]>([]);

    // Theme/Style
    const [theme, setTheme] = useState('');

    // Advanced Options (optional)
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [pacing, setPacing] = useState<'Relaxed' | 'Balanced' | 'High-energy' | ''>('');
    const [comedyLevel, setComedyLevel] = useState<'Low' | 'Medium' | 'High' | ''>('');
    const [participation, setParticipation] = useState<'Low' | 'Medium' | 'High' | ''>('');
    const [volunteersOk, setVolunteersOk] = useState<'Yes' | 'No' | ''>('');
    const [constraints, setConstraints] = useState('');

    // Control State
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPlan, setShowPlan] = useState<DirectorModeResponse | null>(null);
    const [isAddedToPlanner, setIsAddedToPlanner] = useState(false);
    const [isAddingToPlanner, setIsAddingToPlanner] = useState(false);
    const [isSavingIdea, setIsSavingIdea] = useState(false);
    const [isSavedToIdeas, setIsSavedToIdeas] = useState(false);
    const [plannerNotice, setPlannerNotice] = useState<string | null>(null);
    const [ideaNotice, setIdeaNotice] = useState<string | null>(null);
    
    const computedAudience = (() => {
        const picked = audienceChips.join(', ');
        const custom = audienceType.trim();
        if (picked && custom) return `${picked}, ${custom}`;
        return picked || custom;
    })();

    const directorsNotesBlock = useMemo(() => {
        if (!showPlan) return '';
        const parts: string[] = [];
        parts.push(`Effect Types (non-exposure):`);
        parts.push(`- Visual opener: ${showPlan.effect_types.visual_opener}`);
        parts.push(`- Interactive centerpiece: ${showPlan.effect_types.interactive_centerpiece}`);
        parts.push(`- Emotional closer: ${showPlan.effect_types.emotional_closer}`);
        parts.push('');
        parts.push('Pacing:');
        parts.push(`- Energy flow: ${showPlan.pacing_notes.energy_flow}`);
        if (showPlan.pacing_notes.reset_moments?.length) parts.push(`- Reset moments: ${showPlan.pacing_notes.reset_moments.join('; ')}`);
        if (showPlan.pacing_notes.volunteer_moments?.length) parts.push(`- Volunteer moments: ${showPlan.pacing_notes.volunteer_moments.join('; ')}`);
        if (showPlan.directors_notes.risk_points?.length) {
            parts.push('');
            parts.push('Risk points:');
            showPlan.directors_notes.risk_points.forEach((x) => parts.push(`- ${x}`));
        }
        if (showPlan.directors_notes.adaptation_suggestions?.length) {
            parts.push('');
            parts.push('Adaptation suggestions:');
            showPlan.directors_notes.adaptation_suggestions.forEach((x) => parts.push(`- ${x}`));
        }
        return parts.join('\n');
    }, [showPlan]);

    const dictionaryLinks = useMemo(() => {
        if (!showPlan) return [] as string[];
        const blocks: string[] = [];
        blocks.push(showPlan.show_description || '');
        blocks.push(showPlan.pacing_notes?.energy_flow || '');
        (showPlan.pacing_notes?.reset_moments || []).forEach((x) => blocks.push(x));
        (showPlan.pacing_notes?.volunteer_moments || []).forEach((x) => blocks.push(x));
        (showPlan.directors_notes?.risk_points || []).forEach((x) => blocks.push(x));
        (showPlan.directors_notes?.adaptation_suggestions || []).forEach((x) => blocks.push(x));
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
        const push = (arr?: string[]) => {
            if (!arr?.length) return;
            arr.forEach((x) => blobs.push(String(x || '')));
        };
        push(showPlan.pacing_notes?.reset_moments);
        push(showPlan.pacing_notes?.volunteer_moments);
        push(showPlan.directors_notes?.risk_points);
        push(showPlan.directors_notes?.adaptation_suggestions);

        const text = blobs.join(' \n ').toLowerCase();
        const matches: string[] = [];
        Array.from(dictionaryTermSet).forEach((term) => {
            const t = term.toLowerCase();
            if (!t || t.length < 3) return;
            // Word-ish boundary match to reduce false positives
            const re = new RegExp(`(^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i');
            if (re.test(text)) matches.push(term);
        });
        return matches
            .sort((a, b) => a.localeCompare(b))
            .slice(0, 12);
    }, [showPlan, dictionaryTermSet]);

    // Show Title is optional: AI can generate a strong title if the user leaves it blank.
    const isFormValid = Boolean(showLength && computedAudience && theme.trim());

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

    // Phase B: Structure output like a director's plan (overview, act structure, pacing, etc.)
    const directorResponseSchema = {
        type: Type.OBJECT,
        properties: {
            show_title: { type: Type.STRING },
            show_description: { type: Type.STRING },
            show_overview: {
                type: Type.OBJECT,
                properties: {
                    theme: { type: Type.STRING },
                    audience: { type: Type.STRING },
                    tone: { type: Type.STRING },
                    runtime_minutes: { type: Type.NUMBER },
                },
                required: ['theme', 'audience', 'tone', 'runtime_minutes'],
            },
            act_structure: {
                type: Type.OBJECT,
                properties: {
                    opener: {
                        type: Type.OBJECT,
                        properties: {
                            title: { type: Type.STRING },
                            minutes: { type: Type.NUMBER },
                            objective: { type: Type.STRING },
                        },
                        required: ['title', 'minutes', 'objective'],
                    },
                    middle: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                title: { type: Type.STRING },
                                minutes: { type: Type.NUMBER },
                                objective: { type: Type.STRING },
                            },
                            required: ['title', 'minutes', 'objective'],
                        },
                    },
                    closer: {
                        type: Type.OBJECT,
                        properties: {
                            title: { type: Type.STRING },
                            minutes: { type: Type.NUMBER },
                            objective: { type: Type.STRING },
                        },
                        required: ['title', 'minutes', 'objective'],
                    },
                },
                required: ['opener', 'middle', 'closer'],
            },
            effect_types: {
                type: Type.OBJECT,
                properties: {
                    visual_opener: { type: Type.STRING },
                    interactive_centerpiece: { type: Type.STRING },
                    emotional_closer: { type: Type.STRING },
                },
                required: ['visual_opener', 'interactive_centerpiece', 'emotional_closer'],
            },
            pacing_notes: {
                type: Type.OBJECT,
                properties: {
                    energy_flow: { type: Type.STRING },
                    reset_moments: { type: Type.ARRAY, items: { type: Type.STRING } },
                    volunteer_moments: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: ['energy_flow', 'reset_moments', 'volunteer_moments'],
            },
            directors_notes: {
                type: Type.OBJECT,
                properties: {
                    risk_points: { type: Type.ARRAY, items: { type: Type.STRING } },
                    adaptation_suggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: ['risk_points', 'adaptation_suggestions'],
            },
        },
        required: ['show_title', 'show_overview', 'act_structure', 'effect_types', 'pacing_notes', 'directors_notes'],
    };

    const handleGenerate = async () => {
        if (!isFormValid) {
            setError("Please fill in all required fields.");
            return;
        }
        
        setIsLoading(true);
        setError(null);
        setShowPlan(null);
        setIsAddedToPlanner(false);
        setIsSavedToIdeas(false);

        const titleLine = showTitle.trim()
            ? `- Show Title: ${showTitle.trim()}`
            : `- Show Title: (not provided) Please invent a strong, marketable show title that fits the audience and theme.`;

        const prompt = `
Please generate a show plan in STRICT JSON matching the provided schema.

Create a director-style plan (not a long narrative). Keep it practical and stage-ready.

Details:
${titleLine}
- Desired Length (minutes): ${showLength}
- Target Audience: ${computedAudience}
- Overall Theme/Style: ${theme}
${pacing ? `- Pacing: ${pacing}` : ''}
${comedyLevel ? `- Comedy Level: ${comedyLevel}` : ''}
${participation ? `- Audience Participation Level: ${participation}` : ''}
${volunteersOk ? `- Volunteers OK: ${volunteersOk}` : ''}
${constraints.trim() ? `- Constraints / Special Notes: ${constraints.trim()}` : ''}

Output requirements:
- show_overview should summarize theme/audience/tone/runtime.
- act_structure: opener (5–7 min), middle (2–5 segments sized to fit), closer.
- effect_types must stay NON-EXPOSURE (high-level categories only).
- pacing_notes: energy flow + when to reset + when to engage volunteers.
- directors_notes: risk points + adaptation suggestions.
`;
        
        try {
          const resultJson = await generateStructuredResponse(
            prompt,
            DIRECTOR_MODE_SYSTEM_INSTRUCTION,
            directorResponseSchema
          );
          setShowPlan(resultJson as DirectorModeResponse);
        } catch (err) {
          console.error(err);
          setError(err instanceof Error ? err.message : "An unknown error occurred while generating the plan. The AI may have returned an invalid structure. Please try again.");
        } finally {
          setIsLoading(false);
        }
    };
  
    // Phase C: Send structured blueprint into Show Planner as a NEW show + 4 core tasks.
    
    const buildIdeaFromShowPlan = (plan: DirectorModeResponse) => {
        const lines: string[] = [];
        lines.push(`Show Title: ${plan.show_title}`);
        if (plan.show_description?.trim()) lines.push(`Show Description: ${plan.show_description.trim()}`);
        lines.push('');
        lines.push('Show Overview:');
        lines.push(`  • Theme: ${plan.show_overview?.theme ?? ''}`);
        lines.push(`  • Audience: ${plan.show_overview?.audience ?? ''}`);
        lines.push(`  • Tone: ${plan.show_overview?.tone ?? ''}`);
        lines.push(`  • Runtime: ${plan.show_overview?.runtime_minutes ?? ''} min`);
        lines.push('');
        lines.push('Act Structure:');
        lines.push(`  1) Opener (${plan.act_structure.opener.minutes} min): ${plan.act_structure.opener.title}`);
        lines.push(`     - Objective: ${plan.act_structure.opener.objective}`);
        plan.act_structure.middle.forEach((m, i) => {
            lines.push(`  ${i + 2}) Middle (${m.minutes} min): ${m.title}`);
            lines.push(`     - Objective: ${m.objective}`);
        });
        lines.push(`  ${plan.act_structure.middle.length + 2}) Closer (${plan.act_structure.closer.minutes} min): ${plan.act_structure.closer.title}`);
        lines.push(`     - Objective: ${plan.act_structure.closer.objective}`);
        lines.push('');
        lines.push('Effect Types (Non-Exposure):');
        lines.push(`  • Visual opener: ${plan.effect_types.visual_opener}`);
        lines.push(`  • Interactive centerpiece: ${plan.effect_types.interactive_centerpiece}`);
        lines.push(`  • Emotional closer: ${plan.effect_types.emotional_closer}`);
        lines.push('');
        lines.push('Pacing Notes:');
        lines.push(`  • Energy flow: ${plan.pacing_notes.energy_flow}`);
        if (plan.pacing_notes.reset_moments?.length) {
            lines.push('  • Reset moments:');
            plan.pacing_notes.reset_moments.forEach((x) => lines.push(`     - ${x}`));
        }
        if (plan.pacing_notes.volunteer_moments?.length) {
            lines.push('  • Volunteer moments:');
            plan.pacing_notes.volunteer_moments.forEach((x) => lines.push(`     - ${x}`));
        }
        lines.push('');
        lines.push("Director's Notes:");
        if (plan.directors_notes.risk_points?.length) {
            lines.push('  • Risk points:');
            plan.directors_notes.risk_points.forEach((x) => lines.push(`     - ${x}`));
        }
        if (plan.directors_notes.adaptation_suggestions?.length) {
            lines.push('  • Adaptation suggestions:');
            plan.directors_notes.adaptation_suggestions.forEach((x) => lines.push(`     - ${x}`));
        }

        const prettyJson = JSON.stringify(plan, null, 2);

        const content =
`${lines.join('\n')}

--- JSON (for reuse / export) ---
${prettyJson}
`;
        const title = `Director Mode — ${plan.show_title}`;
        const tags = ['director-mode', 'show-blueprint'];
        return { title, content, tags };
    };

    const handleSaveToIdeas = async () => {
        if (!showPlan || isSavingIdea || isSavedToIdeas) return;
        try {
            setIsSavingIdea(true);
            setError(null);
            setIdeaNotice(null);

            const { title, content, tags } = buildIdeaFromShowPlan(showPlan);

            await saveIdea({
                type: 'text',
                title,
                content,
                tags,
            } as any);

            setIsSavedToIdeas(true);
            setIdeaNotice('Saved — open Saved Ideas to view this blueprint.');
            window.setTimeout(() => setIdeaNotice(null), 7000);
            onIdeaSaved?.();
        } catch (e: any) {
            console.error('Save to Ideas failed:', e);
            setError(e?.message ?? 'Unable to save to Saved Ideas.');
        } finally {
            setIsSavingIdea(false);
        }
    };

    const handleSendToPlanner = async () => {
        if (!showPlan) return;
        if (isAddedToPlanner || isAddingToPlanner) return;

        try {
            setIsAddingToPlanner(true);
            setError(null);
            setPlannerNotice(null);

            // Create a NEW show in Show Planner (Director Mode is intentionally additive)
            const created = await createShow(showPlan.show_title, showPlan.show_description ?? null);
            const showId = created?.id;
            if (!showId) throw new Error('Could not create the show in Show Planner.');

            // Build 4 tasks: Opener, Segment 1, Segment 2, Closer.
            // If there are more than 2 middle segments, we fold extras into Segment 2 notes.
            const opener = showPlan.act_structure.opener;
            const closer = showPlan.act_structure.closer;
            const middle = Array.isArray(showPlan.act_structure.middle) ? showPlan.act_structure.middle : [];
            const seg1 = middle[0];
            const seg2 = middle[1];
            const extras = middle.slice(2);

            const directorNotesForTasks = directorsNotesBlock ? `\n\n--- Director Notes ---\n${directorsNotesBlock}` : '';

            const taskPayloads = [
                {
                    title: `Opener — ${opener.title}`,
                    notes: `Objective: ${opener.objective}\nEstimated: ${opener.minutes} min${directorNotesForTasks}`,
                },
                {
                    title: `Segment 1 — ${seg1?.title ?? 'Core Feature'}`,
                    notes: `Objective: ${seg1?.objective ?? 'Develop the central throughline and build audience buy-in.'}` +
                        `\nEstimated: ${seg1?.minutes ?? Math.max(5, Math.round(Number(showPlan.show_overview.runtime_minutes) / 4))} min` +
                        `${extras.length ? `\n\nAdditional middle beats to consider:\n- ${extras.map((x) => x.title).join('\n- ')}` : ''}` +
                        `${directorNotesForTasks}`,
                },
                {
                    title: `Segment 2 — ${seg2?.title ?? 'Interactive Centerpiece'}`,
                    notes: `Objective: ${seg2?.objective ?? 'Raise stakes, increase interaction, and set up the closer.'}` +
                        `\nEstimated: ${seg2?.minutes ?? Math.max(5, Math.round(Number(showPlan.show_overview.runtime_minutes) / 4))} min` +
                        `${directorNotesForTasks}`,
                },
                {
                    title: `Closer — ${closer.title}`,
                    notes: `Objective: ${closer.objective}\nEstimated: ${closer.minutes} min${directorNotesForTasks}`,
                },
            ];

            await addTasksToShow(showId, taskPayloads as any);

            setIsAddedToPlanner(true);
            setPlannerNotice('Saved — open Show Planner to see the new show and tasks.');

            // Auto-clear the notice after a short time
            window.setTimeout(() => setPlannerNotice(null), 7000);
        } catch (e: any) {
            console.error('Send to Show Planner failed:', e);
            setError(e?.message ?? 'Unable to send the blueprint to Show Planner.');
        } finally {
            setIsAddingToPlanner(false);
        }
    };

    const handleBackToForm = () => {
        // Phase B: keep inputs editable; do not clear the form.
        setShowPlan(null);
        setIsAddedToPlanner(false);
        setIsSavedToIdeas(false);
        setError(null);
    };

    if (isLoading) {
        return <div className="flex-1 flex items-center justify-center"><LoadingIndicator /></div>;
    }
    
    if (showPlan) {
        return (
            <div className="flex-1 flex flex-col overflow-y-auto p-4 md:p-6 animate-fade-in">
                <h2 className="text-3xl font-bold text-white font-cinzel">{showPlan.show_title}</h2>
                {showPlan.show_description ? (
                    <p className="text-slate-400 mt-2">{showPlan.show_description}</p>
                ) : null}

                {/* Phase B: results actions (keep inputs editable + frictionless reruns) */}
                <div className="mt-5 mb-6 flex flex-wrap gap-2">
                    <button
                        onClick={handleGenerate}
                        className="px-4 py-2 rounded-md bg-slate-700/60 hover:bg-slate-700 border border-slate-600 text-white font-bold transition-colors"
                        title="Regenerate this blueprint using your current inputs"
                    >
                        Revise Blueprint
                    </button>
                    <button
                        onClick={handleBackToForm}
                        className="px-4 py-2 rounded-md bg-slate-700/40 hover:bg-slate-700 border border-slate-600 text-white font-bold transition-colors"
                        title="Go back to adjust audience (inputs are kept)"
                    >
                        Change Audience
                    </button>
                    <button
                        onClick={handleBackToForm}
                        className="px-4 py-2 rounded-md bg-slate-600 hover:bg-slate-700 text-white font-bold transition-colors"
                        title="Hide results (inputs kept)"
                    >
                        Hide Results
                    </button>
                </div>

                {/* Phase B: structured sections */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                        <h3 className="text-xl font-bold text-[#E6C77A] font-cinzel">Show Overview</h3>
                        <div className="mt-3 space-y-2 text-sm text-slate-300">
                            <p><span className="text-slate-400">Theme:</span> {showPlan.show_overview.theme}</p>
                            <p><span className="text-slate-400">Audience:</span> {showPlan.show_overview.audience}</p>
                            <p><span className="text-slate-400">Tone:</span> {showPlan.show_overview.tone}</p>
                            <p><span className="text-slate-400">Runtime:</span> {showPlan.show_overview.runtime_minutes} min</p>
                        </div>
                    </div>

                    <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                        <h3 className="text-xl font-bold text-[#E6C77A] font-cinzel">Effect Types (No Exposure)</h3>
                        <div className="mt-3 space-y-3 text-sm text-slate-300">
                            <div className="bg-slate-900/40 rounded-md p-3 border border-slate-700/60">
                                <p className="font-semibold text-white">Visual opener</p>
                                <p className="text-slate-300">{showPlan.effect_types.visual_opener}</p>
                            </div>
                            <div className="bg-slate-900/40 rounded-md p-3 border border-slate-700/60">
                                <p className="font-semibold text-white">Interactive centerpiece</p>
                                <p className="text-slate-300">{showPlan.effect_types.interactive_centerpiece}</p>
                            </div>
                            <div className="bg-slate-900/40 rounded-md p-3 border border-slate-700/60">
                                <p className="font-semibold text-white">Emotional closer</p>
                                <p className="text-slate-300">{showPlan.effect_types.emotional_closer}</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 lg:col-span-2">
                        <h3 className="text-xl font-bold text-[#E6C77A] font-cinzel">Act Structure</h3>
                        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="bg-slate-900/40 rounded-md p-3 border border-slate-700/60">
                                <p className="text-xs text-slate-400">Opener ({showPlan.act_structure.opener.minutes} min)</p>
                                <p className="font-semibold text-white">{showPlan.act_structure.opener.title}</p>
                                <p className="text-sm text-slate-300 mt-1">{showPlan.act_structure.opener.objective}</p>
                            </div>
                            <div className="bg-slate-900/40 rounded-md p-3 border border-slate-700/60 md:col-span-1">
                                <p className="text-xs text-slate-400">Middle (segments)</p>
                                <div className="mt-2 space-y-2">
                                    {showPlan.act_structure.middle.map((m, i) => (
                                        <div key={i} className="border border-slate-700/60 rounded-md p-2 bg-slate-950/20">
                                            <p className="text-xs text-slate-400">{m.minutes} min</p>
                                            <p className="font-semibold text-white">{m.title}</p>
                                            <p className="text-sm text-slate-300 mt-1">{m.objective}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="bg-slate-900/40 rounded-md p-3 border border-slate-700/60">
                                <p className="text-xs text-slate-400">Closer ({showPlan.act_structure.closer.minutes} min)</p>
                                <p className="font-semibold text-white">{showPlan.act_structure.closer.title}</p>
                                <p className="text-sm text-slate-300 mt-1">{showPlan.act_structure.closer.objective}</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                        <h3 className="text-xl font-bold text-[#E6C77A] font-cinzel">Pacing Notes</h3>
                        <div className="mt-3 text-sm text-slate-300 space-y-3">
                            <div>
                                <p className="text-slate-400">Energy rises/falls</p>
                                <p>{showPlan.pacing_notes.energy_flow}</p>
                            </div>
                            {showPlan.pacing_notes.reset_moments?.length ? (
                                <div>
                                    <p className="text-slate-400">When to reset</p>
                                    <ul className="list-disc list-inside">
                                        {showPlan.pacing_notes.reset_moments.map((x, i) => <li key={i}>{x}</li>)}
                                    </ul>
                                </div>
                            ) : null}
                            {showPlan.pacing_notes.volunteer_moments?.length ? (
                                <div>
                                    <p className="text-slate-400">When to engage volunteers</p>
                                    <ul className="list-disc list-inside">
                                        {showPlan.pacing_notes.volunteer_moments.map((x, i) => <li key={i}>{x}</li>)}
                                    </ul>
                                </div>
                            ) : null}
                        </div>
                    </div>

                    <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                        <h3 className="text-xl font-bold text-[#E6C77A] font-cinzel">Director’s Notes</h3>
                        <div className="mt-3 text-sm text-slate-300 space-y-3">
                            {showPlan.directors_notes.risk_points?.length ? (
                                <div>
                                    <p className="text-slate-400">Risk points</p>
                                    <ul className="list-disc list-inside">
                                        {showPlan.directors_notes.risk_points.map((x, i) => <li key={i}>{x}</li>)}
                                    </ul>
                                </div>
                            ) : null}
                            {showPlan.directors_notes.adaptation_suggestions?.length ? (
                                <div>
                                    <p className="text-slate-400">Adaptation suggestions</p>
                                    <ul className="list-disc list-inside">
                                        {showPlan.directors_notes.adaptation_suggestions.map((x, i) => <li key={i}>{x}</li>)}
                                    </ul>
                                </div>
                            ) : null}

                            {dictionaryLinks.length ? (
                                <div className="pt-2">
                                    <p className="text-slate-400">Dictionary references</p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {dictionaryLinks.map((t) => (
                                            <button
                                                key={t}
                                                type="button"
                                                onClick={() => {
                                                    if (typeof window === 'undefined') return;
                                                    window.dispatchEvent(
                                                        new CustomEvent('maw:navigate', {
                                                            detail: { view: 'magic-dictionary', hash: slugify(t) },
                                                        })
                                                    );
                                                }}
                                                className="text-xs px-2 py-1 rounded-full bg-slate-900/50 border border-slate-700 text-purple-200 hover:text-white hover:border-purple-500/40 transition-colors"
                                                title="Open this term in Magic Dictionary"
                                            >
                                                Dictionary → {t}
                                            </button>
                                        ))}
                                    </div>
                                    <p className="text-xs text-slate-500 mt-2">Tip: these are the theory concepts the AI referenced in your plan.</p>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
                    {/* Cohesion: save to existing show / convert to tasks / tag to project */}
                    <CohesionActions
                        content={buildIdeaFromShowPlan(showPlan).content}
                        defaultTitle={buildIdeaFromShowPlan(showPlan).title}
                        defaultTags={buildIdeaFromShowPlan(showPlan).tags}
                        compact
                    />
                    <button
                        onClick={handleSaveToIdeas}
                        disabled={isSavingIdea || isSavedToIdeas}
                        className="px-4 py-2 rounded-md bg-slate-700/60 hover:bg-slate-700 border border-slate-600 text-white font-bold transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
                        title="Save a snapshot of this plan to your Saved Ideas"
                    >
                        {isSavedToIdeas ? <CheckIcon className="w-5 h-5" /> : <SaveIcon className="w-5 h-5" />}
                        <span>
                            {isSavedToIdeas ? 'Saved to Ideas!' : (isSavingIdea ? 'Saving…' : 'Save to Ideas')}
                        </span>
                    </button>

                    <button onClick={handleSendToPlanner} disabled={isAddedToPlanner || isAddingToPlanner} className="px-6 py-2 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold transition-colors disabled:bg-green-700 disabled:cursor-not-allowed flex items-center gap-2">
                        {isAddedToPlanner ? <CheckIcon className="w-5 h-5" /> : <ChecklistIcon className="w-5 h-5" />}
                        <span>{isAddedToPlanner ? 'Sent to Show Planner!' : (isAddingToPlanner ? 'Sending…' : 'Send Blueprint to Show Planner')}</span>
                    </button>
                </div>

                {(plannerNotice || ideaNotice) ? (
                    <div className="mt-4 flex flex-col items-center gap-2">
                        {plannerNotice ? (
                            <div className="px-4 py-2 rounded-md bg-green-900/30 border border-green-700/40 text-green-200 text-sm">
                                {plannerNotice}
                            </div>
                        ) : null}
                        {ideaNotice ? (
                            <div className="px-4 py-2 rounded-md bg-green-900/30 border border-green-700/40 text-green-200 text-sm">
                                {ideaNotice}
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </div>
        );
    }

    return (
        <main className="flex-1 overflow-y-auto p-4 md:p-6 flex items-center justify-center animate-fade-in">
            <div className="w-full max-w-lg">
                <div className="text-center">
                    <StageCurtainsIcon className="w-16 h-16 text-purple-400 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold text-slate-300 mb-2 font-cinzel">Director Mode</h2>
                    <p className="text-slate-400 mb-6">Let's design your next show. Provide the core details, and the AI will architect a complete show structure for you.</p>
                </div>
                
                <div className="space-y-4 bg-slate-800/50 p-6 rounded-lg border border-slate-700">
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
                            <p className="mt-1 text-xs text-slate-400">
                                Optional — the AI can generate a title for you.
                            </p>
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

                    <div>
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
                        <p className="mt-1 text-xs text-slate-400">
                            Tip: pick one or more chips, then add a short note if needed.
                        </p>
                    </div>

                    <div>
                        <label htmlFor="theme" className="block text-sm font-medium text-slate-300 mb-1">Overall Theme / Style</label>
                        <input
                            id="theme"
                            type="text"
                            value={theme}
                            onChange={(e) => setTheme(e.target.value)}
                            placeholder="e.g., elegant & mysterious • high-energy comedy • mind reading with audience participation"
                            className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-yellow-500/30 focus:border-yellow-500/40"
                        />
                        <p className="mt-1 text-xs text-slate-400">
                            Describe tone, pacing, and your performing persona. The AI will keep the structure consistent.
                        </p>
                    </div>

                    <div className="pt-2">
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
                                <div className="sm:col-span-2">
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Constraints / Notes</label>
                                    <textarea
                                        value={constraints}
                                        onChange={(e) => setConstraints(e.target.value)}
                                        rows={3}
                                        placeholder="Optional: stage size, no fire, limited props, family-friendly only, etc."
                                        className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-yellow-500/30 focus:border-yellow-500/40"
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    <button
                        onClick={handleGenerate}
                        disabled={!isFormValid}
                        className="w-full py-3 mt-4 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed"
                    >
                        <WandIcon className="w-5 h-5" />
                        <span>🎭 Direct My Show Blueprint</span>
                    </button>
                    <p className="text-center text-xs text-slate-400 -mt-2">Typically takes 10–15 seconds.</p>

                    {error && <p className="text-red-400 mt-2 text-sm text-center">{error}</p>}
                </div>
            </div>
        </main>
    );
};

export default DirectorMode;
