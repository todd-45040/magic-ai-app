
import React, { useState } from 'react';
import { Type } from "@google/genai";
import { saveIdea } from '../services/ideasService';
import { createShow, addTasksToShow, updateShow } from '../services/showsService';
import { saveDirectorBlueprint } from '../services/directorBlueprintsService';
import { DIRECTOR_MODE_SYSTEM_INSTRUCTION } from '../constants';
import type { DirectorModeBlueprint } from '../types';
import { StageCurtainsIcon, WandIcon } from './icons';
import { generateStructuredResponse } from '../services/geminiService';


interface DirectorModeProps {
    onIdeaSaved: () => void;
    hasProfessionalAccess?: boolean;
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


// (Dictionary extraction removed from Director Mode — Phase 3 focuses on blueprint readability + actions.)

const DirectorMode: React.FC<DirectorModeProps> = ({ onIdeaSaved, hasProfessionalAccess }) => {
    // Form State
    const [showTitle, setShowTitle] = useState('');
    const [showLength, setShowLength] = useState('');
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
    // Legacy constraints textarea replaced by constraintNotes
    // const [constraints, setConstraints] = useState('');

    // Control State
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPlan, setShowPlan] = useState<DirectorModeBlueprint | null>(null);
    const [isAddedToPlanner, setIsAddedToPlanner] = useState(false);
    const [isAddingToPlanner, setIsAddingToPlanner] = useState(false);
    const [isSavingIdea, setIsSavingIdea] = useState(false);
    const [isSavedToIdeas, setIsSavedToIdeas] = useState(false);
    const [plannerNotice, setPlannerNotice] = useState<string | null>(null);
    const [ideaNotice, setIdeaNotice] = useState<string | null>(null);

    // Phase 3 — Results UI
    const [expandedSegmentKeys, setExpandedSegmentKeys] = useState<Record<string, boolean>>({});
    const [copyNotice, setCopyNotice] = useState<string | null>(null);
    const [blueprintNotice, setBlueprintNotice] = useState<string | null>(null);
    const [isSavingBlueprint, setIsSavingBlueprint] = useState(false);
    const [proPolish, setProPolish] = useState<any | null>(null);
    const [isGeneratingPolish, setIsGeneratingPolish] = useState(false);

    // Phase 4 — Workflow Wiring
    const [createdShowId, setCreatedShowId] = useState<string | null>(null);
    const [isCreatingShow, setIsCreatingShow] = useState(false);
    const [showNotice, setShowNotice] = useState<string | null>(null);
    
    const computedAudience = (() => {
        const picked = audienceChips.join(', ');
        const custom = audienceType.trim();
        if (picked && custom) return `${picked}, ${custom}`;
        return picked || custom;
    })();


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
                },
            },
        },
        required: ['show_title', 'show_length_minutes', 'audience_type', 'venue_type', 'tone', 'performer_persona', 'constraints', 'segments'],
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
        setCreatedShowId(null);

        const titleLine = showTitle.trim()
            ? `- Show Title: ${showTitle.trim()}`
            : `- Show Title: (not provided) Please invent a strong, marketable show title that fits the audience and theme.`;

        const propsOwnedList = propsOwned
            .split(/\n|,/g)
            .map((s) => s.trim())
            .filter(Boolean);

        const prompt = `
Please generate a show blueprint in STRICT JSON matching the provided schema.

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
`;
try {
          const resultJson = await generateStructuredResponse(
            prompt,
            DIRECTOR_MODE_SYSTEM_INSTRUCTION,
            directorResponseSchema
          );
          setShowPlan(resultJson as DirectorModeBlueprint);
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
            resultJson as DirectorModeBlueprint
          );
        } catch (err) {
          console.error(err);
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

        const display = lines.join('\n');
        const v2 = {
            format: 'maw.idea.blueprint.v1',
            tool: 'director-mode',
            timestamp: Date.now(),
            title: plan.show_title,
            display,
            structured: plan,
            meta: {
                show_length_minutes: plan.show_length_minutes,
                audience_type: plan.audience_type,
                venue_type: plan.venue_type,
                tone: plan.tone,
            }
        };

        return {
            title: plan.show_title,
            content: JSON.stringify(v2),
            tags: ['director-mode', 'show-builder', 'blueprint'],
        };
    };;

    const handleSaveToIdeas = async () => {
        if (!showPlan || isSavingIdea || isSavedToIdeas) return;
        try {
            setIsSavingIdea(true);
            setError(null);
            setIdeaNotice(null);

            const { title, content, tags } = buildIdeaFromShowPlan(showPlan);

            await saveIdea({
                type: 'blueprint',
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

    const uid = () => {
        try {
            return (globalThis.crypto as any)?.randomUUID?.() || `id_${Math.random().toString(36).slice(2)}_${Date.now()}`;
        } catch {
            return `id_${Math.random().toString(36).slice(2)}_${Date.now()}`;
        }
    };

    const buildShowDescriptionWithBlueprint = (plan: DirectorModeBlueprint) => {
        const header = `Director Blueprint — ${plan.show_length_minutes} min • ${plan.audience_type} • ${plan.venue_type}`;
        const outline = `\n\n[Director Blueprint Summary]\nTone: ${plan.tone}\nPersona: ${plan.performer_persona}\nSegments: ${(plan.segments || []).map(s => `${s.purpose}:${s.title}(${s.duration_estimate_minutes}m)`).join(' | ')}`;
        // Keep JSON embedded but lightweight (still useful for recovery)
        const embedded = `\n\n[Director Blueprint JSON]\n${JSON.stringify(plan, null, 2)}`;
        return header + outline + embedded;
    };

    const ensureShowCreated = async (): Promise<string> => {
        if (!showPlan) throw new Error('No blueprint loaded.');
        if (createdShowId) return createdShowId;

        const description = buildShowDescriptionWithBlueprint(showPlan);
        const created = await createShow(showPlan.show_title, description);
        const showId = created?.id;
        if (!showId) throw new Error('Could not create the show.');

        // Best-effort: attach JSON into a dedicated column if it exists in some envs.
        // This will silently no-op if the column doesn't exist (schema drift safe).
        try {
            await updateShow(showId, {
                ...({ director_blueprint_json: showPlan } as any),
                ...({ director_blueprint_version: 'v1' } as any),
            } as any);
        } catch (e) {
            // Non-fatal. Description already contains the embedded blueprint.
            console.warn('Attach blueprint to show (optional columns) failed:', e);
        }

        setCreatedShowId(showId);
        return showId;
    };

    const handleCreateShow = async () => {
        if (!showPlan || isCreatingShow) return;
        try {
            setIsCreatingShow(true);
            setError(null);
            setShowNotice(null);
            const showId = await ensureShowCreated();
            setShowNotice(`Show created in Show Planner (ID: ${showId.slice(0, 8)}...).`);
            window.setTimeout(() => setShowNotice(null), 6000);
        } catch (e: any) {
            console.error('Create show failed:', e);
            setError(e?.message || 'Failed to create show.');
        } finally {
            setIsCreatingShow(false);
        }
    };

    const handleSendToPlanner = async () => {
        if (!showPlan) return;
        if (isAddedToPlanner || isAddingToPlanner) return;

        try {
            setIsAddingToPlanner(true);
            setError(null);
            setPlannerNotice(null);

            const showId = await ensureShowCreated();

            const tasks = (showPlan.segments || []).map((seg) => {
                const propsLine = Array.isArray(seg.props_required) && seg.props_required.length
                    ? `Props: ${seg.props_required.join(', ')}`
                    : 'Props: (none listed)';

                const notes =
                    `Purpose: ${seg.purpose}\n` +
                    `Estimated: ${seg.duration_estimate_minutes} min\n` +
                    `Interaction: ${seg.audience_interaction_level}\n` +
                    `${propsLine}\n` +
                    `Transition: ${seg.transition_notes || ''}`;

                return {
                    title: `Build: ${seg.title}`,
                    notes,
                    priority: 'Medium' as const,
                    dueDate: null,
                    durationMinutes: Math.max(1, Math.round(Number(seg.duration_estimate_minutes) || 1)),
                    tags: ['director-mode', 'show-builder', seg.purpose],
                    subtasks: [
                        { id: uid(), text: `Rehearse ${seg.purpose}: ${seg.title}`, completed: false },
                        { id: uid(), text: 'Source props', completed: false },
                        { id: uid(), text: 'Write patter', completed: false },
                        { id: uid(), text: 'Block staging / beats', completed: false },
                    ],
                };
            });

            if (!tasks.length) throw new Error('No segments were returned to create planner tasks.');

            await addTasksToShow(showId, tasks as any);

            setIsAddedToPlanner(true);
            setPlannerNotice('Tasks created — each segment is now a “Build:” task with rehearsal subtasks.');
            window.setTimeout(() => setPlannerNotice(null), 8000);
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
        setIsAddedToPlanner(false);
        setIsSavedToIdeas(false);
        setCreatedShowId(null);
        setError(null);
    };

    if (isLoading) {
        return <div className="flex-1 flex items-center justify-center"><LoadingIndicator /></div>;
    }
    if (showPlan) {
        const orderedSegments = (() => {
            const segs = Array.isArray(showPlan.segments) ? [...showPlan.segments] : [];
            const rank = (p: string) => (p === 'opener' ? 0 : p === 'middle' ? 1 : p === 'closer' ? 2 : 9);
            return segs.sort((a: any, b: any) => rank(a?.purpose) - rank(b?.purpose));
        })();

        const keyChips = [
            showPlan.constraints?.skill_level ? `Skill: ${showPlan.constraints.skill_level}` : null,
            showPlan.constraints?.reset_time ? `Reset: ${showPlan.constraints.reset_time}` : null,
            showPlan.venue_type ? `Venue: ${showPlan.venue_type}` : null,
        ].filter(Boolean) as string[];

        const buildOutlineFromPlan = (plan: DirectorModeBlueprint) => {
            const lines: string[] = [];
            lines.push(`${plan.show_title}`);
            lines.push(`${plan.show_length_minutes} min • ${plan.audience_type} • ${plan.venue_type}`);
            lines.push(`Tone: ${plan.tone} • Persona: ${plan.performer_persona}`);
            lines.push('');
            lines.push('Constraints');
            lines.push(`- Skill level: ${plan.constraints?.skill_level || ''}`);
            lines.push(`- Reset time: ${plan.constraints?.reset_time || ''}`);
            if (Array.isArray(plan.constraints?.props_owned) && plan.constraints.props_owned.length) {
                lines.push(`- Props owned: ${plan.constraints.props_owned.join(', ')}`);
            }
            if (plan.constraints?.notes?.trim()) lines.push(`- Notes: ${plan.constraints.notes.trim()}`);
            lines.push('');
            lines.push('Run of Show');
            (plan.segments || []).forEach((s, idx) => {
                const props = Array.isArray(s.props_required) && s.props_required.length ? ` (Props: ${s.props_required.join(', ')})` : '';
                lines.push(`${idx + 1}. ${String(s.purpose || '').toUpperCase()} — ${s.title} (${s.duration_estimate_minutes} min, ${s.audience_interaction_level})${props}`);
                if (s.transition_notes?.trim()) lines.push(`   Transition: ${s.transition_notes.trim()}`);
            });
            return lines.join('\\n');
        };

        const copyToClipboard = async (content: string, label: string) => {
            try {
                await navigator.clipboard.writeText(content);
                setCopyNotice(`${label} copied to clipboard.`);
                window.setTimeout(() => setCopyNotice(null), 4000);
            } catch (e) {
                console.error('Clipboard copy failed:', e);
                setCopyNotice('Copy failed — your browser blocked clipboard access.');
                window.setTimeout(() => setCopyNotice(null), 6000);
            }
        };

        const handleSaveBlueprint = async () => {
            if (isSavingBlueprint) return;
            try {
                setIsSavingBlueprint(true);
                setBlueprintNotice(null);
                await saveDirectorBlueprint(
                    {
                        showTitle: showTitle.trim() || null,
                        showLengthMinutes: Number(showPlan.show_length_minutes || showLength || 0),
                        audience_type: showPlan.audience_type,
                        venue_type: showPlan.venue_type,
                        tone: showPlan.tone,
                        performer_persona: showPlan.performer_persona,
                        constraints: {
                            props_owned: showPlan.constraints?.props_owned || [],
                            reset_time: showPlan.constraints?.reset_time || '',
                            skill_level: showPlan.constraints?.skill_level || '',
                            notes: showPlan.constraints?.notes || '',
                        },
                    } as any,
                    showPlan
                );
                setBlueprintNotice('Blueprint saved.');
                window.setTimeout(() => setBlueprintNotice(null), 5000);
            } catch (e: any) {
                console.error('Save blueprint failed:', e);
                setBlueprintNotice(e?.message || 'Unable to save blueprint.');
                window.setTimeout(() => setBlueprintNotice(null), 7000);
            } finally {
                setIsSavingBlueprint(false);
            }
        };

        const toggleSegment = (key: string) => {
            setExpandedSegmentKeys((prev) => ({ ...prev, [key]: !prev[key] }));
        };

        const generateProPolish = async () => {
            if (isGeneratingPolish) return;
            if (!hasProfessionalAccess) {
                setBlueprintNotice('Pro Polish is a Professional feature.');
                window.setTimeout(() => setBlueprintNotice(null), 6000);
                return;
            }
            try {
                setIsGeneratingPolish(true);
                setProPolish(null);
                const polishSchema = {
                    type: Type.OBJECT,
                    properties: {
                        alt_opener_titles: { type: Type.ARRAY, items: { type: Type.STRING } },
                        alt_closer_titles: { type: Type.ARRAY, items: { type: Type.STRING } },
                        stronger_transitions: { type: Type.ARRAY, items: { type: Type.STRING } },
                        audience_participation_beats: { type: Type.ARRAY, items: { type: Type.STRING } },
                    },
                    required: ['alt_opener_titles', 'alt_closer_titles', 'stronger_transitions', 'audience_participation_beats'],
                };
                const prompt = `You are a director for a stage magic show. Based on the show blueprint JSON below, provide PRO-ONLY polish suggestions.

Rules:
- Do NOT reveal secrets or methods.
- Keep suggestions short and stage-ready.
- Provide 2 alternative opener titles, 2 alternative closer titles.
- Provide 4 stronger transitions (one per segment boundary where possible).
- Provide 4 optional audience participation beats that can be inserted without changing the core effects.

Blueprint JSON:
${JSON.stringify(showPlan, null, 2)}
`;
                const result = await generateStructuredResponse(
                    prompt,
                    'Return JSON ONLY matching the schema. No markdown. No extra keys.',
                    polishSchema
                );
                setProPolish(result);
            } catch (e: any) {
                console.error('Pro polish failed:', e);
                setBlueprintNotice(e?.message || 'Unable to generate Pro Polish.');
                window.setTimeout(() => setBlueprintNotice(null), 7000);
            } finally {
                setIsGeneratingPolish(false);
            }
        };

        return (
            <div className="flex-1 flex flex-col overflow-y-auto p-4 md:p-6 animate-fade-in">
                <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-5">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="min-w-[280px]">
                            <div className="text-xs uppercase tracking-wider text-purple-300">Director Blueprint</div>
                            <h2 className="text-3xl font-bold text-white font-cinzel mt-1">{showPlan.show_title}</h2>
                            <p className="text-slate-300 mt-2"><span className="text-slate-200 font-semibold">{showPlan.show_length_minutes} min</span> • {showPlan.audience_type} • {showPlan.venue_type}</p>
                            <p className="text-slate-400 mt-1">Vibe: <span className="text-slate-200">{showPlan.tone}</span> • Persona: <span className="text-slate-200">{showPlan.performer_persona}</span></p>
                            {keyChips.length ? (
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {keyChips.map((c) => (
                                        <span key={c} className="px-2.5 py-1 rounded-full text-xs border border-slate-600/70 bg-slate-950/30 text-slate-200">{c}</span>
                                    ))}
                                </div>
                            ) : null}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <button onClick={() => copyToClipboard(JSON.stringify(showPlan, null, 2), 'Blueprint JSON')} className="px-3 py-2 rounded-lg bg-slate-900/40 hover:bg-slate-900/60 text-slate-200 border border-slate-700 text-sm">Copy JSON</button>
                            <button onClick={() => copyToClipboard(buildOutlineFromPlan(showPlan), 'Outline')} className="px-3 py-2 rounded-lg bg-slate-900/40 hover:bg-slate-900/60 text-slate-200 border border-slate-700 text-sm">Copy Outline</button>
                            <button onClick={handleSaveBlueprint} disabled={isSavingBlueprint} className="px-3 py-2 rounded-lg bg-slate-900/40 hover:bg-slate-900/60 text-slate-200 border border-slate-700 text-sm">Save Blueprint</button>
                            <button onClick={handleCreateShow} disabled={isCreatingShow || Boolean(createdShowId)} className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-sm disabled:opacity-60">
                                {createdShowId ? 'Show Created' : (isCreatingShow ? 'Creating…' : 'Create Show')}
                            </button>
                            <button onClick={handleSendToPlanner} disabled={isAddingToPlanner || isAddedToPlanner} className="px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 border border-purple-400 text-white text-sm">{isAddedToPlanner ? 'Tasks Created' : 'Send to Show Planner'}</button>
                            <button onClick={handleSaveToIdeas} disabled={isSavingIdea || isSavedToIdeas} className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-sm">{isSavedToIdeas ? 'Saved to Vault' : 'Save to Idea Vault'}</button>
                            <button onClick={handleBackToForm} className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-sm">Back</button>
                        </div>
                    </div>
                </div>

                {copyNotice ? (<div className="mt-4 bg-slate-900/40 border border-slate-700 text-slate-200 rounded-lg p-3 text-sm">{copyNotice}</div>) : null}
                {blueprintNotice ? (<div className="mt-4 bg-slate-900/40 border border-slate-700 text-slate-200 rounded-lg p-3 text-sm">{blueprintNotice}</div>) : null}
                {showNotice ? (<div className="mt-4 bg-slate-900/40 border border-slate-700 text-slate-200 rounded-lg p-3 text-sm">{showNotice}</div>) : null}
                {plannerNotice ? (<div className="mt-4 bg-emerald-900/20 border border-emerald-700 text-emerald-200 rounded-lg p-3 text-sm">{plannerNotice}</div>) : null}
                {error ? (<div className="mt-4 bg-rose-900/20 border border-rose-700 text-rose-200 rounded-lg p-3 text-sm">{error}</div>) : null}

                <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xl font-bold text-[#E6C77A] font-cinzel">Segments</h3>
                            <div className="text-xs text-slate-400">Expand details</div>
                        </div>
                        <div className="mt-3 space-y-3">
                            {orderedSegments.map((seg: any, idx: number) => {
                                const key = `${idx}-${slugify(seg?.purpose)}-${slugify(seg?.title)}`;
                                const open = Boolean(expandedSegmentKeys[key]);
                                const badge = String(seg?.purpose || '').toUpperCase();
                                return (
                                    <div key={key} className="rounded-xl border border-slate-700/70 bg-slate-950/25">
                                        <button type="button" onClick={() => toggleSegment(key)} className="w-full text-left p-3 flex items-center justify-between gap-3 hover:bg-slate-950/40 rounded-xl">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-500/15 border border-purple-400/30 text-purple-200">{badge}</span>
                                                    <span className="text-white font-semibold truncate">{seg.title}</span>
                                                </div>
                                                <div className="mt-1 text-sm text-slate-300">{seg.duration_estimate_minutes} min • {seg.audience_interaction_level}</div>
                                            </div>
                                            <div className="shrink-0 text-slate-300 text-sm">{open ? '−' : '+'}</div>
                                        </button>
                                        {open ? (
                                            <div className="px-3 pb-3 text-sm text-slate-300">
                                                <div className="mt-2 grid grid-cols-1 gap-2">
                                                    <div><span className="text-slate-400">Interaction:</span> {seg.audience_interaction_level}</div>
                                                    <div><span className="text-slate-400">Props required:</span> {Array.isArray(seg.props_required) && seg.props_required.length ? seg.props_required.join(', ') : '—'}</div>
                                                    <div><span className="text-slate-400">Transition notes:</span> {seg.transition_notes?.trim() ? seg.transition_notes.trim() : '—'}</div>
                                                </div>
                                            </div>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700 relative overflow-hidden">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xl font-bold text-[#E6C77A] font-cinzel">Pro Polish</h3>
                            <span className="text-xs px-2 py-1 rounded-full border border-yellow-500/30 bg-yellow-500/10 text-yellow-200">Professional</span>
                        </div>
                        <p className="mt-2 text-sm text-slate-300">Alt opener/closer options, stronger transitions, and optional participation beats.</p>
                        <div className="mt-3">
                            <button type="button" onClick={generateProPolish} disabled={isGeneratingPolish || !hasProfessionalAccess} className="w-full px-3 py-2 rounded-lg border text-sm bg-purple-600 hover:bg-purple-500 border-purple-400 text-white disabled:bg-slate-900/30 disabled:border-slate-700 disabled:text-slate-400">
                                {isGeneratingPolish ? 'Generating Pro Polish…' : 'Generate Pro Polish'}
                            </button>
                        </div>
                        {proPolish ? (
                            <div className="mt-4 space-y-3 text-sm text-slate-300">
                                <div className="bg-slate-950/25 border border-slate-700/70 rounded-xl p-3">
                                    <div className="text-xs uppercase tracking-wider text-purple-300">Alt Opener Titles</div>
                                    <ul className="mt-2 list-disc ml-5">{(proPolish.alt_opener_titles || []).slice(0, 3).map((x: string, i: number) => (<li key={i}>{x}</li>))}</ul>
                                </div>
                                <div className="bg-slate-950/25 border border-slate-700/70 rounded-xl p-3">
                                    <div className="text-xs uppercase tracking-wider text-purple-300">Alt Closer Titles</div>
                                    <ul className="mt-2 list-disc ml-5">{(proPolish.alt_closer_titles || []).slice(0, 3).map((x: string, i: number) => (<li key={i}>{x}</li>))}</ul>
                                </div>
                                <div className="bg-slate-950/25 border border-slate-700/70 rounded-xl p-3">
                                    <div className="text-xs uppercase tracking-wider text-purple-300">Stronger Transitions</div>
                                    <ul className="mt-2 list-disc ml-5">{(proPolish.stronger_transitions || []).slice(0, 6).map((x: string, i: number) => (<li key={i}>{x}</li>))}</ul>
                                </div>
                                <div className="bg-slate-950/25 border border-slate-700/70 rounded-xl p-3">
                                    <div className="text-xs uppercase tracking-wider text-purple-300">Participation Beats</div>
                                    <ul className="mt-2 list-disc ml-5">{(proPolish.audience_participation_beats || []).slice(0, 6).map((x: string, i: number) => (<li key={i}>{x}</li>))}</ul>
                                </div>
                            </div>
                        ) : (<div className="mt-4 text-sm text-slate-400">Tip: Generate polish after the structure feels right.</div>)}
                        {!hasProfessionalAccess ? (
                            <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-[1px] flex items-center justify-center">
                                <div className="text-center p-6">
                                    <div className="text-sm font-semibold text-yellow-200">Professional feature</div>
                                    <div className="text-xs text-slate-300 mt-1">Upgrade to generate Pro Polish overlays.</div>
                                </div>
                            </div>
                        ) : null}
                    </div>

                    <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700 lg:col-span-2">
                        <div className="flex items-center justify-between gap-3">
                            <h3 className="text-xl font-bold text-[#E6C77A] font-cinzel">Blueprint JSON</h3>
                            <button type="button" onClick={() => copyToClipboard(JSON.stringify(showPlan, null, 2), 'Blueprint JSON')} className="px-3 py-2 rounded-lg bg-slate-900/40 hover:bg-slate-900/60 text-slate-200 border border-slate-700 text-sm">Copy</button>
                        </div>
                        <pre className="mt-3 text-xs text-slate-200 bg-slate-950/40 border border-slate-700/60 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap">
{JSON.stringify(showPlan, null, 2)}
                        </pre>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <main className="flex-1 overflow-y-auto p-4 md:p-6 animate-fade-in">
            <div className="w-full max-w-6xl mx-auto">
                <div className="text-center mb-6">
                    <StageCurtainsIcon className="w-16 h-16 text-purple-400 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold text-slate-300 mb-2 font-cinzel">Director Mode</h2>
                    <p className="text-slate-400">Design your next show. Fill in the core details, and the AI will architect a complete, stage-ready blueprint.</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
                    {/* Left: Core Inputs */}
                    <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 space-y-4">
                        <h3 className="text-lg font-semibold text-slate-200">Core Inputs</h3>

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
                            <p className="mt-1 text-xs text-slate-400">Tip: pick one or more chips, then add a short note if needed.</p>
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
                            <p className="mt-1 text-xs text-slate-400">Describe the overall vibe. The AI will keep the structure consistent.</p>
                        </div>
                    </div>

                    {/* Right: Constraints */}
                    <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 space-y-4">
                        <h3 className="text-lg font-semibold text-slate-200">Constraints</h3>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="venue-type" className="block text-sm font-medium text-slate-300 mb-1">Venue Type</label>
                                <input
                                    id="venue-type"
                                    type="text"
                                    value={venueType}
                                    onChange={(e) => setVenueType(e.target.value)}
                                    placeholder="e.g., banquet hall • theater • strolling"
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
                                    placeholder="e.g., funny • dramatic • mysterious"
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
                                    placeholder="e.g., charming storyteller • comedy magician"
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
                                    placeholder="Any constraints: kid-safe, no fire, limited pocket space, etc."
                                    rows={3}
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-yellow-500/30 focus:border-yellow-500/40"
                                />
                            </div>
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
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="mt-5 bg-slate-800/50 p-4 rounded-2xl border border-slate-700">
                    <button
                        onClick={handleGenerate}
                        disabled={!isFormValid}
                        className="w-full py-3 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed"
                    >
                        <WandIcon className="w-5 h-5" />
                        <span>🎭 Direct My Show Blueprint</span>
                    </button>
                    <p className="text-center text-xs text-slate-400 mt-2">Typically takes 10–15 seconds.</p>
                    {error && <p className="text-red-400 mt-3 text-sm text-center">{error}</p>}
                </div>
            </div>
        </main>
    );
};

export default DirectorMode;
