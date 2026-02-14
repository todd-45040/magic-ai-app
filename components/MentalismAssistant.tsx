import React, { useMemo, useState } from 'react';
import { Type } from '@google/genai';
import { generateStructuredResponse } from '../services/geminiService';
import { saveIdea } from '../services/ideasService';
import { createShow, addTasksToShow } from '../services/showsService';
import { MENTALISM_ASSISTANT_SYSTEM_INSTRUCTION } from '../constants';
import { WandIcon, SaveIcon, CheckIcon, CopyIcon, ShareIcon, SearchIcon, LightbulbIcon } from './icons';
import ShareButton from './ShareButton';
import { useAppState } from '../store';

interface MentalismAssistantProps {
    onIdeaSaved: () => void;
    onOpenShowPlanner?: (showId?: string | null, taskId?: string | null) => void;
    onOpenLiveRehearsal?: () => void;
}

const LoadingIndicator: React.FC = () => (
    <div className="flex flex-col items-center justify-center text-center p-8">
        <div className="relative">
            <WandIcon className="w-16 h-16 text-purple-400 animate-pulse" />
            <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
                <div className="w-24 h-24 border-t-2 border-purple-300 rounded-full animate-spin"></div>
            </div>
        </div>
        <p className="text-slate-300 mt-4 text-lg">Reading minds...</p>
        <p className="text-slate-400 text-sm">Crafting seemingly impossible feats.</p>
    </div>
);
const PsychologicalLayerVisualizer: React.FC<{ compact?: boolean }> = ({ compact }) => {
    const layers = [
        'Effect Surface',
        'Psychological Justification',
        'Conviction Layer',
        'Memory Distortion Layer',
        'Impossible Climax',
    ];

    return (
        <div className={`relative ${compact ? 'p-3' : 'p-6'} rounded-lg border border-slate-800 bg-slate-950/30 overflow-hidden`}>
            <div className="absolute -top-24 -right-24 w-64 h-64 bg-purple-600/10 blur-3xl rounded-full" />
            <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-indigo-600/10 blur-3xl rounded-full" />
            <div className="relative">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-sm font-semibold text-slate-200">Psychological Layering</div>
                        <div className="text-xs text-slate-400">A mentalism routine should feel engineered, not “answered”.</div>
                    </div>
                    <div className="text-[11px] text-slate-500">visualizer</div>
                </div>

                <div className={`${compact ? 'mt-3' : 'mt-5'} flex flex-col items-center`}>
                    {layers.map((label, i) => (
                        <React.Fragment key={label}>
                            <div className="w-full max-w-[340px] rounded-md border border-slate-700 bg-slate-900/40 px-3 py-2">
                                <div className="text-sm text-slate-200 font-semibold">{label}</div>
                            </div>
                            {i < layers.length - 1 && (
                                <div className="h-6 flex items-center justify-center text-slate-500">
                                    <span className="text-lg leading-none">↓</span>
                                </div>
                            )}
                        </React.Fragment>
                    ))}
                </div>
            </div>
        </div>
    );
};

const CATEGORY_QUERIES = [
    {
        name: 'Core Principles',
        query: "Explain the fundamental principles of mentalism, such as 'Dual Reality,' 'Cold Reading,' and 'Suggestion.' Provide examples of how each could be applied in a performance context, citing key resources like Corinda's '13 Steps to Mentalism'.",
    },
    {
        name: 'Effect Design',
        query: 'Brainstorm three original mentalism effects. For each, describe the audience\'s experience, the psychological principles at play (e.g., confirmation bias, psychological force), and a subtle hint at the method without full exposure.',
    },
    {
        name: 'Showmanship & Persona',
        query: "Discuss the importance of persona in mentalism. Compare the 'psychic entertainer' persona with the 'psychological illusionist' persona. Provide scripting tips for establishing credibility and managing spectators.",
    },
    {
        name: 'Ethics in Mentalism',
        query: 'Provide a detailed guide on the ethical considerations in mentalism. Discuss the pros and cons of disclaimers and how to present effects in a way that is entertaining without being exploitative.',
    },
];

type AudienceReactionModel = {
    gasps_likelihood_1_to_10: number;
    skeptic_resistance_probability_0_to_1: number;
    confusion_risk_0_to_1: number;
    memory_distortion_strength_1_to_10: number;
    notes: string;
};

type MentalismBlueprint = {
    premise: string;
    psychological_frame: string;
    phase_structure: string[];
    audience_control_points: string[];
    conviction_builders: string[];
    outs: string[];
    ethical_flags: string[];
    escalation_options: string[];
    audience_reaction_model: AudienceReactionModel;
};


type StressPersona = 'Intelligent Skeptic' | 'Aggressive Debunker' | 'Corporate HR Mindset' | 'Teen Audience';

type StressFinding = {
    persona: StressPersona;
    where_suspicion_forms: string;
    why_it_triggers: string;
    severity_1_to_5: number;
};

type StressPatch = {
    persona: StressPersona;
    patch: string;
    rationale: string;
};

type StressTestReport = {
    overall_risk: 'low' | 'medium' | 'high';
    vulnerability_summary: string;
    suspicion_points: StressFinding[];
    recommended_patches: StressPatch[];
    optional_script_adjustments: string[];
};

type ColdReadingPhrases = {
    barnum_statements: string[];
    rainbow_ruse_phrasing: string[];
    dual_reality_lines: string[];
    ambiguous_scripting: string[];
    conviction_lines: string[];
};

const INTENSITY_LABELS = [
    'Subtle Psychological',
    'Suggestion-Based',
    'Influence / Pre-show',
    'Direct Mind Reading',
    'Paranormal Framing',
] as const;

function safeList(v: any): string[] {
    if (!Array.isArray(v)) return [];
    return v
        .map((x) => String(x ?? '').trim())
        .filter(Boolean);

function safeNumber(v: any, fallback = 0): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

function clamp01(v: any, fallback = 0): number {
    const n = safeNumber(v, fallback);
    if (n < 0) return 0;
    if (n > 1) return 1;
    return n;
}

function clamp1to10(v: any, fallback = 5): number {
    const n = Math.round(safeNumber(v, fallback));
    if (n < 1) return 1;
    if (n > 10) return 10;
    return n;
}

}

function toBlueprint(v: any): MentalismBlueprint {
    return {
        premise: String(v?.premise ?? '').trim(),
        psychological_frame: String(v?.psychological_frame ?? '').trim(),
        phase_structure: safeList(v?.phase_structure),
        audience_control_points: safeList(v?.audience_control_points),
        conviction_builders: safeList(v?.conviction_builders),
        outs: safeList(v?.outs),
        ethical_flags: safeList(v?.ethical_flags),
        escalation_options: safeList(v?.escalation_options),
        audience_reaction_model: {
            gasps_likelihood_1_to_10: clamp1to10(v?.audience_reaction_model?.gasps_likelihood_1_to_10 ?? v?.gasps_likelihood_1_to_10, 6),
            skeptic_resistance_probability_0_to_1: clamp01(v?.audience_reaction_model?.skeptic_resistance_probability_0_to_1 ?? v?.skeptic_resistance_probability_0_to_1, 0.35),
            confusion_risk_0_to_1: clamp01(v?.audience_reaction_model?.confusion_risk_0_to_1 ?? v?.confusion_risk_0_to_1, 0.25),
            memory_distortion_strength_1_to_10: clamp1to10(v?.audience_reaction_model?.memory_distortion_strength_1_to_10 ?? v?.memory_distortion_strength_1_to_10, 6),
            notes: String(v?.audience_reaction_model?.notes ?? v?.audience_reaction_notes ?? '').trim(),
        },
    };
}

function blueprintToText(topic: string, b: MentalismBlueprint): string {
    const lines: string[] = [];
    lines.push(`# Mentalism Blueprint`);
    if (topic?.trim()) lines.push(`**Topic:** ${topic.trim()}`);
    lines.push('');
    if (b.premise) {
        lines.push('## Premise');
        lines.push(b.premise);
        lines.push('');
    }
    if (b.psychological_frame) {
        lines.push('## Psychological Frame');
        lines.push(b.psychological_frame);
        lines.push('');
    }

    const addList = (h: string, items: string[]) => {
        if (!items?.length) return;
        lines.push(`## ${h}`);
        items.forEach((x) => lines.push(`- ${x}`));
        lines.push('');
    };

    addList('Phase Structure', b.phase_structure);
    addList('Audience Control Points', b.audience_control_points);
    addList('Conviction Builders', b.conviction_builders);
    addList('Outs', b.outs);
    addList('Ethical Flags', b.ethical_flags);
    addList('Escalation Options', b.escalation_options);

    if (b.audience_reaction_model) {
        lines.push('## Audience Reaction Model');
        lines.push(`- Gasps likelihood (1–10): ${b.audience_reaction_model.gasps_likelihood_1_to_10}`);
        lines.push(`- Skeptic resistance probability (0–1): ${b.audience_reaction_model.skeptic_resistance_probability_0_to_1}`);
        lines.push(`- Confusion risk (0–1): ${b.audience_reaction_model.confusion_risk_0_to_1}`);
        lines.push(`- Memory distortion strength (1–10): ${b.audience_reaction_model.memory_distortion_strength_1_to_10}`);
        if (b.audience_reaction_model.notes) lines.push(`- Notes: ${b.audience_reaction_model.notes}`);
        lines.push('');
    }

    lines.push('---');
    lines.push('## JSON');
    lines.push('```json');
    lines.push(JSON.stringify(b, null, 2));
    lines.push('```');
    return lines.join('\n');
}

function clampSeverity(n: any): number {
    const v = Number(n);
    if (!Number.isFinite(v)) return 3;
    return Math.min(5, Math.max(1, Math.round(v)));
}

function toStressReport(v: any): StressTestReport {
    const overall = String(v?.overall_risk ?? '').toLowerCase();
    const overall_risk = overall === 'low' || overall === 'high' || overall === 'medium' ? overall : 'medium';

    const suspicion_points = Array.isArray(v?.suspicion_points)
        ? v.suspicion_points
              .map((x: any) => ({
                  persona: String(x?.persona ?? '').trim() as any,
                  where_suspicion_forms: String(x?.where_suspicion_forms ?? '').trim(),
                  why_it_triggers: String(x?.why_it_triggers ?? '').trim(),
                  severity_1_to_5: clampSeverity(x?.severity_1_to_5),
              }))
              .filter((x: any) => x.where_suspicion_forms || x.why_it_triggers)
        : [];

    const recommended_patches = Array.isArray(v?.recommended_patches)
        ? v.recommended_patches
              .map((x: any) => ({
                  persona: String(x?.persona ?? '').trim() as any,
                  patch: String(x?.patch ?? '').trim(),
                  rationale: String(x?.rationale ?? '').trim(),
              }))
              .filter((x: any) => x.patch)
        : [];

    return {
        overall_risk,
        vulnerability_summary: String(v?.vulnerability_summary ?? '').trim(),
        suspicion_points,
        recommended_patches,
        optional_script_adjustments: safeList(v?.optional_script_adjustments),
    };
}

function toColdReading(v: any): ColdReadingPhrases {
    return {
        barnum_statements: safeList(v?.barnum_statements),
        rainbow_ruse_phrasing: safeList(v?.rainbow_ruse_phrasing),
        dual_reality_lines: safeList(v?.dual_reality_lines),
        ambiguous_scripting: safeList(v?.ambiguous_scripting),
        conviction_lines: safeList(v?.conviction_lines),
    };
}

const MentalismAssistant: React.FC<MentalismAssistantProps> = ({ onIdeaSaved, onOpenShowPlanner, onOpenLiveRehearsal }) => {
    const { currentUser } = useAppState() as any;

    const [query, setQuery] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [blueprint, setBlueprint] = useState<MentalismBlueprint | null>(null);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
    const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');

    // Tier-1 controls
    const [intensityIdx, setIntensityIdx] = useState<number>(1);
    const [ethicalMode, setEthicalMode] = useState<boolean>(true);

    // Tier-2: Stress test
    const [isStressTesting, setIsStressTesting] = useState(false);
    const [stressError, setStressError] = useState<string | null>(null);
    const [stressReport, setStressReport] = useState<StressTestReport | null>(null);

    // Tier-3: System integration
    const [isSendingToPlanner, setIsSendingToPlanner] = useState(false);
    const [sendPlannerError, setSendPlannerError] = useState<string | null>(null);
    const [sendPlannerSuccess, setSendPlannerSuccess] = useState(false);

    const [isPreparingRehearsal, setIsPreparingRehearsal] = useState(false);
    const [rehearsalPrepError, setRehearsalPrepError] = useState<string | null>(null);

    // Tier-2: Cold reading phrase builder
    const [isPhraseLoading, setIsPhraseLoading] = useState(false);
    const [phraseError, setPhraseError] = useState<string | null>(null);
    const [phrases, setPhrases] = useState<ColdReadingPhrases | null>(null);
    const [phraseCount, setPhraseCount] = useState<number>(5);
    const [phraseTypes, setPhraseTypes] = useState({
        barnum: true,
        rainbow: true,
        dual: true,
        ambiguous: true,
        conviction: true,
    });

    const intensityLabel = useMemo(() => {
        const idx = Math.min(Math.max(Number(intensityIdx) || 0, 0), INTENSITY_LABELS.length - 1);
        return INTENSITY_LABELS[idx];
    }, [intensityIdx]);

    const blueprintSchema = useMemo(
        () => ({
            type: Type.OBJECT,
            properties: {
                premise: { type: Type.STRING },
                psychological_frame: { type: Type.STRING },
                phase_structure: { type: Type.ARRAY, items: { type: Type.STRING } },
                audience_control_points: { type: Type.ARRAY, items: { type: Type.STRING } },
                conviction_builders: { type: Type.ARRAY, items: { type: Type.STRING } },
                outs: { type: Type.ARRAY, items: { type: Type.STRING } },
                ethical_flags: { type: Type.ARRAY, items: { type: Type.STRING } },
                escalation_options: { type: Type.ARRAY, items: { type: Type.STRING } },
                audience_reaction_model: {
                    type: Type.OBJECT,
                    properties: {
                        gasps_likelihood_1_to_10: { type: Type.NUMBER },
                        skeptic_resistance_probability_0_to_1: { type: Type.NUMBER },
                        confusion_risk_0_to_1: { type: Type.NUMBER },
                        memory_distortion_strength_1_to_10: { type: Type.NUMBER },
                        notes: { type: Type.STRING },
                    },
                    required: [
                        'gasps_likelihood_1_to_10',
                        'skeptic_resistance_probability_0_to_1',
                        'confusion_risk_0_to_1',
                        'memory_distortion_strength_1_to_10',
                        'notes',
                    ],
                },
            },
            required: [
                'premise',
                'psychological_frame',
                'phase_structure',
                'audience_control_points',
                'conviction_builders',
                'outs',
                'ethical_flags',
                'escalation_options',
                'audience_reaction_model',
            ],
        }),
        []
    );


    const stressTestSchema = useMemo(
        () => ({
            type: Type.OBJECT,
            properties: {
                overall_risk: { type: Type.STRING, enum: ['low', 'medium', 'high'] },
                vulnerability_summary: { type: Type.STRING },
                suspicion_points: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            persona: { type: Type.STRING },
                            where_suspicion_forms: { type: Type.STRING },
                            why_it_triggers: { type: Type.STRING },
                            severity_1_to_5: { type: Type.NUMBER },
                        },
                        required: ['persona', 'where_suspicion_forms', 'why_it_triggers', 'severity_1_to_5'],
                    },
                },
                recommended_patches: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            persona: { type: Type.STRING },
                            patch: { type: Type.STRING },
                            rationale: { type: Type.STRING },
                        },
                        required: ['persona', 'patch', 'rationale'],
                    },
                },
                optional_script_adjustments: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['overall_risk', 'vulnerability_summary', 'suspicion_points', 'recommended_patches', 'optional_script_adjustments'],
        }),
        []
    );

    const coldReadingSchema = useMemo(
        () => ({
            type: Type.OBJECT,
            properties: {
                barnum_statements: { type: Type.ARRAY, items: { type: Type.STRING } },
                rainbow_ruse_phrasing: { type: Type.ARRAY, items: { type: Type.STRING } },
                dual_reality_lines: { type: Type.ARRAY, items: { type: Type.STRING } },
                ambiguous_scripting: { type: Type.ARRAY, items: { type: Type.STRING } },
                conviction_lines: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: [
                'barnum_statements',
                'rainbow_ruse_phrasing',
                'dual_reality_lines',
                'ambiguous_scripting',
                'conviction_lines',
            ],
        }),
        []
    );

    const handleGenerate = async (searchQuery?: string) => {
        const currentQuery = String(searchQuery || query || '').trim();
        if (!currentQuery) {
            setError('Please enter a theme, effect, or principle.');
            return;
        }

        setIsLoading(true);
        setError(null);
        setBlueprint(null);
        setStressReport(null);
        setStressError(null);
        setSaveStatus('idle');
        setCopyStatus('idle');

        try {
            const ethicalBlock = ethicalMode
                ? `\nEthical Performance Mode: ON\n- Avoid medical claims.\n- Avoid real psychic claims (frame as entertainment / psychological illusion).\n- Avoid grief exploitation / vulnerable subjects.\n- Prefer respectful disclaimers tone.\n`
                : `\nEthical Performance Mode: OFF (Still keep it entertainment-safe.)\n`;

            const prompt = `
Generate a mentalism routine blueprint in STRICT JSON that matches the schema provided.

User topic/question:
${currentQuery}

Mentalism style intensity:
${intensityLabel}
${ethicalBlock}

Output guidelines:
- Keep it practical and performance-ready.
- NON-EXPOSURE: do not reveal methods, gimmicks, or step-by-step secrets.
- phase_structure should read like a sequence of beats/phases (short, actionable lines).
- audience_control_points should name moments where attention, choices, and framing are managed.
- conviction_builders should be subtle convincers (timing, language, justification, props handling).
- outs should be safe, non-exposure failure paths.
- ethical_flags should list any potential ethical pitfalls (and how to avoid them).
- escalation_options should give upgrades (bigger climax, stronger impossibility) without exposure.
- audience_reaction_model should provide semi-theoretical predictions: gasps_likelihood_1_to_10, skeptic_resistance_probability_0_to_1, confusion_risk_0_to_1, memory_distortion_strength_1_to_10, plus a short notes field explaining why.
`;

            const raw = await generateStructuredResponse(
                prompt,
                MENTALISM_ASSISTANT_SYSTEM_INSTRUCTION,
                blueprintSchema,
                currentUser || { email: '', membership: 'free', generationCount: 0, lastResetDate: '' }
            );

            const next = toBlueprint(raw);
            if (!next.premise && !next.phase_structure?.length) {
                throw new Error('The AI returned an empty blueprint. Please try again with a bit more context (venue, audience, effect type).');
            }
            setBlueprint(next);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleExampleClick = (exampleQuery: string) => {
        setQuery(exampleQuery);
        handleGenerate(exampleQuery);
    };

    const handleSave = () => {
        if (!blueprint) return;
        const fullContent = blueprintToText(query, blueprint);
        saveIdea('text', fullContent, `Mentalism Blueprint — ${query}`);
        onIdeaSaved();
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
    };

    const handleCopy = () => {
        if (!blueprint) return;
        const fullContent = blueprintToText(query, blueprint);
        navigator.clipboard.writeText(fullContent);
        setCopyStatus('copied');
        setTimeout(() => setCopyStatus('idle'), 2000);
    };


    const handleStressTest = async () => {
        if (!blueprint) return;
        setIsStressTesting(true);
        setStressError(null);
        setStressReport(null);

        try {
            const ethicalBlock = ethicalMode
                ? `\nEthical Performance Mode: ON\n- Avoid medical claims.\n- Avoid real psychic claims (frame as entertainment / psychological illusion).\n- Avoid grief exploitation / vulnerable subjects.\n- Prefer respectful disclaimers tone.\n`
                : `\nEthical Performance Mode: OFF (Still keep it entertainment-safe.)\n`;

            const prompt = `
You are performing a "Stress Test Against Skeptic" for a mentalism routine blueprint.

Return a STRICT JSON report matching the schema provided.

Routine topic:
${query}

Mentalism style intensity:
${intensityLabel}
${ethicalBlock}

Blueprint (for context):
${JSON.stringify(blueprint, null, 2)}

Simulate these audience mindsets:
- Intelligent Skeptic
- Aggressive Debunker
- Corporate HR Mindset
- Teen Audience

Output requirements:
- NON-EXPOSURE: do not reveal methods, gimmicks, or step-by-step secrets.
- Identify where suspicion forms (moments/phrases/props handling) and why.
- Give specific, performance-safe patches (wording, pacing, framing, volunteer handling).
- Keep it respectful and ethical.
`;
            const raw = await generateStructuredResponse(
                prompt,
                MENTALISM_ASSISTANT_SYSTEM_INSTRUCTION,
                stressTestSchema,
                currentUser || { email: '', membership: 'free', generationCount: 0, lastResetDate: '' }
            );

            const next = toStressReport(raw);
            if (!next.vulnerability_summary && !next.suspicion_points?.length && !next.recommended_patches?.length) {
                throw new Error('The AI returned an empty stress test report. Try again or add more context to the routine.');
            }
            setStressReport(next);
        } catch (err) {
            setStressError(err instanceof Error ? err.message : 'An unknown error occurred.');
        } finally {
            setIsStressTesting(false);
        }
    };

    const handleSendToShowPlanner = async () => {
        if (!blueprint) return;
        setIsSendingToPlanner(true);
        setSendPlannerError(null);
        setSendPlannerSuccess(false);

        try {
            const topic = String(query || '').trim() || 'Mentalism Routine';
            const showTitle = `Mentalism Routine — ${topic}`;
            const descParts: string[] = [];
            if (blueprint.premise) descParts.push(`Premise: ${blueprint.premise}`);
            if (blueprint.psychological_frame) descParts.push(`Frame: ${blueprint.psychological_frame}`);
            const show = await createShow(showTitle, descParts.join('\n').slice(0, 800) || null);

            const phase0 = blueprint.phase_structure?.[0] ?? '';
            const phase1 = blueprint.phase_structure?.[1] ?? '';
            const phase2 = blueprint.phase_structure?.[2] ?? '';
            const lastPhase = blueprint.phase_structure?.[blueprint.phase_structure.length - 1] ?? '';

            const audienceModel = blueprint.audience_reaction_model;
            const audienceModelText = audienceModel
                ? `Audience Reaction Model\n- Gasps (1–10): ${audienceModel.gasps_likelihood_1_to_10}\n- Skeptic resistance (0–1): ${audienceModel.skeptic_resistance_probability_0_to_1}\n- Confusion risk (0–1): ${audienceModel.confusion_risk_0_to_1}\n- Memory distortion (1–10): ${audienceModel.memory_distortion_strength_1_to_10}\n${audienceModel.notes ? `- Notes: ${audienceModel.notes}\n` : ''}`
                : '';

            const pick = (arr: string[], n: number) => (Array.isArray(arr) ? arr.slice(0, n) : []);
            const listBlock = (label: string, arr: string[]) => (arr?.length ? `${label}\n- ${arr.join('\n- ')}\n` : '');

            const openerNotes = [
                'OPENER FRAMING',
                blueprint.premise ? `Premise\n${blueprint.premise}\n` : '',
                blueprint.psychological_frame ? `Psychological Frame\n${blueprint.psychological_frame}\n` : '',
                phase0 ? `Opening Beat\n- ${phase0}\n` : '',
                listBlock('Audience Control (early)', pick(blueprint.audience_control_points, 3)),
                listBlock('Ethical Notes', pick(blueprint.ethical_flags, 3)),
                audienceModelText,
            ]
                .filter(Boolean)
                .join('\n');

            const phase1Notes = [
                'PHASE 1',
                phase1 ? `Beat\n- ${phase1}\n` : phase0 ? `Beat\n- ${phase0}\n` : '',
                listBlock('Conviction Builders', pick(blueprint.conviction_builders, 4)),
                listBlock('Control Points', pick(blueprint.audience_control_points, 4)),
                listBlock('Safe Outs', pick(blueprint.outs, 2)),
            ]
                .filter(Boolean)
                .join('\n');

            const phase2Notes = [
                'PHASE 2',
                phase2 ? `Beat\n- ${phase2}\n` : lastPhase ? `Beat\n- ${lastPhase}\n` : '',
                listBlock('Conviction Builders (continue)', blueprint.conviction_builders?.slice(2, 7) ?? []),
                listBlock('Control Points (continue)', blueprint.audience_control_points?.slice(2, 7) ?? []),
                listBlock('Safe Outs', pick(blueprint.outs, 2)),
            ]
                .filter(Boolean)
                .join('\n');

            const revealNotes = [
                'REVEAL',
                lastPhase ? `Reveal Beat\n- ${lastPhase}\n` : '',
                listBlock('Escalation Options', pick(blueprint.escalation_options, 4)),
                listBlock('Control Points (reveal)', blueprint.audience_control_points?.slice(-3) ?? []),
                listBlock('Ethical Notes', pick(blueprint.ethical_flags, 3)),
            ]
                .filter(Boolean)
                .join('\n');

            const closerNotes = [
                'CLOSER TAG',
                listBlock('Tag / Callback Ideas', pick(blueprint.escalation_options, 6)),
                listBlock('Outs / Backup Lines', pick(blueprint.outs, 4)),
                audienceModelText,
                '',
                'Full Blueprint (for reference)',
                blueprintToText(topic, blueprint),
            ]
                .filter(Boolean)
                .join('\n');

            const tasks = [
                { title: 'Opener framing', notes: openerNotes, priority: 'Medium', status: 'To-Do' },
                { title: 'Phase 1', notes: phase1Notes, priority: 'Medium', status: 'To-Do' },
                { title: 'Phase 2', notes: phase2Notes, priority: 'Medium', status: 'To-Do' },
                { title: 'Reveal', notes: revealNotes, priority: 'Medium', status: 'To-Do' },
                { title: 'Closer tag', notes: closerNotes, priority: 'Medium', status: 'To-Do' },
            ];

            await addTasksToShow(show.id as any, tasks as any);

            setSendPlannerSuccess(true);
            // Navigate to Show Planner and open the newly-created show
            onOpenShowPlanner?.(show.id as any, null);
            setTimeout(() => setSendPlannerSuccess(false), 3500);
        } catch (e: any) {
            setSendPlannerError(String(e?.message ?? e ?? 'Failed to send to Show Planner.'));
        } finally {
            setIsSendingToPlanner(false);
        }
    };

    const handleRehearseInLiveStudio = async () => {
        if (!blueprint) return;
        setIsPreparingRehearsal(true);
        setRehearsalPrepError(null);

        try {
            const topic = String(query || '').trim() || 'Mentalism Blueprint';
            const lines: string[] = [];
            lines.push(`MENTALISM REHEARSAL PRELOAD`);
            lines.push(`Topic: ${topic}`);
            lines.push('');
            if (blueprint.premise) {
                lines.push('Premise:');
                lines.push(blueprint.premise);
                lines.push('');
            }
            if (blueprint.psychological_frame) {
                lines.push('Psychological Frame:');
                lines.push(blueprint.psychological_frame);
                lines.push('');
            }

            if (blueprint.phase_structure?.length) {
                lines.push('Beats (speakable checkpoints):');
                blueprint.phase_structure.forEach((b, i) => {
                    lines.push(`${i + 1}. ${b}`);
                });
                lines.push('');
            }

            if (blueprint.audience_control_points?.length) {
                lines.push('Psychological pacing cues (where to slow down / anchor):');
                blueprint.audience_control_points.slice(0, 6).forEach((x) => lines.push(`- ${x}`));
                lines.push('');
            }

            if (blueprint.conviction_builders?.length) {
                lines.push('Conviction lines (sprinkle these):');
                blueprint.conviction_builders.slice(0, 6).forEach((x) => lines.push(`- ${x}`));
                lines.push('');
            }

            const a = blueprint.audience_reaction_model;
            if (a) {
                lines.push('Audience reaction targets (semi-theoretical):');
                lines.push(`- Gasps likelihood (1–10): ${a.gasps_likelihood_1_to_10}`);
                lines.push(`- Skeptic resistance probability (0–1): ${a.skeptic_resistance_probability_0_to_1}`);
                lines.push(`- Confusion risk (0–1): ${a.confusion_risk_0_to_1}`);
                lines.push(`- Memory distortion strength (1–10): ${a.memory_distortion_strength_1_to_10}`);
                if (a.notes) lines.push(`- Notes: ${a.notes}`);
                lines.push('');
            }

            if (blueprint.ethical_flags?.length) {
                lines.push('Ethical reminders:');
                blueprint.ethical_flags.slice(0, 5).forEach((x) => lines.push(`- ${x}`));
                lines.push('');
            }

            // Hand off to Live Rehearsal via localStorage prefill (LiveRehearsal reads this on mount)
            const PREFILL_KEY = 'maw_live_rehearsal_prefill_v1';
            localStorage.setItem(
                PREFILL_KEY,
                JSON.stringify({
                    version: 1,
                    title: `Mentalism Rehearsal — ${topic}`,
                    notes: lines.join('\n'),
                    createdAt: Date.now(),
                    source: 'mentalism',
                })
            );

            onOpenLiveRehearsal?.();
        } catch (e: any) {
            setRehearsalPrepError(String(e?.message ?? e ?? 'Failed to prepare rehearsal preload.'));
        } finally {
            setIsPreparingRehearsal(false);
        }
    };


    const handleGeneratePhrases = async () => {
        const currentQuery = String(query || '').trim();
        if (!currentQuery) {
            setPhraseError('Please enter a topic first (so the phrases match your routine).');
            return;
        }

        const anySelected = Object.values(phraseTypes).some(Boolean);
        if (!anySelected) {
            setPhraseError('Select at least one phrase type.');
            return;
        }

        setIsPhraseLoading(true);
        setPhraseError(null);
        setPhrases(null);

        try {
            const ethicalBlock = ethicalMode
                ? `\nEthical Performance Mode: ON\n- Avoid medical claims.\n- Avoid real psychic claims (frame as entertainment / psychological illusion).\n- Avoid grief exploitation / vulnerable subjects.\n- Prefer respectful disclaimers tone.\n`
                : `\nEthical Performance Mode: OFF (Still keep it entertainment-safe.)\n`;

            const prompt = `
Generate performance-safe cold reading style phrasing in STRICT JSON matching the schema.

Topic/context:
${currentQuery}

Mentalism style intensity:
${intensityLabel}
${ethicalBlock}

Requested amount per category: ${Math.min(10, Math.max(3, Number(phraseCount) || 5))}

Only include categories that are selected:
- barnum_statements: ${phraseTypes.barnum ? 'YES' : 'NO'}
- rainbow_ruse_phrasing: ${phraseTypes.rainbow ? 'YES' : 'NO'}
- dual_reality_lines: ${phraseTypes.dual ? 'YES' : 'NO'}
- ambiguous_scripting: ${phraseTypes.ambiguous ? 'YES' : 'NO'}
- conviction_lines: ${phraseTypes.conviction ? 'YES' : 'NO'}

Output guidelines:
- NON-EXPOSURE: do not reveal methods, gimmicks, or step-by-step secrets.
- Keep language respectful; avoid claims of medical diagnosis or grief exploitation.
- Favor lines that strengthen framing, volunteer comfort, and audience buy-in.
`;
            const raw = await generateStructuredResponse(
                prompt,
                MENTALISM_ASSISTANT_SYSTEM_INSTRUCTION,
                coldReadingSchema,
                currentUser || { email: '', membership: 'free', generationCount: 0, lastResetDate: '' }
            );

            const next = toColdReading(raw);

            if (!phraseTypes.barnum) next.barnum_statements = [];
            if (!phraseTypes.rainbow) next.rainbow_ruse_phrasing = [];
            if (!phraseTypes.dual) next.dual_reality_lines = [];
            if (!phraseTypes.ambiguous) next.ambiguous_scripting = [];
            if (!phraseTypes.conviction) next.conviction_lines = [];

            const total =
                next.barnum_statements.length +
                next.rainbow_ruse_phrasing.length +
                next.dual_reality_lines.length +
                next.ambiguous_scripting.length +
                next.conviction_lines.length;

            if (!total) throw new Error('No phrases were generated. Try widening the topic or selecting more categories.');
            setPhrases(next);
        } catch (err) {
            setPhraseError(err instanceof Error ? err.message : 'An unknown error occurred.');
        } finally {
            setIsPhraseLoading(false);
        }
    };

    return (
        <div className="flex-1 lg:grid lg:grid-cols-2 gap-6 overflow-y-auto p-4 md:p-6 animate-fade-in">
            {/* Control Panel */}
            <div className="flex flex-col">
                <h2 className="text-xl font-bold text-slate-300 mb-2">Mentalism Mind Lab</h2>
                <p className="text-slate-400 mb-4">
                    Explore the psychology, showmanship, and secrets of mind-reading. Develop routines that create the illusion of extraordinary mental abilities.
                </p>

                <div className="space-y-4">
                    <div>
                        <label htmlFor="mentalism-prompt" className="block text-sm font-medium text-slate-300 mb-1">
                            Your Question or Topic
                        </label>
                        <textarea
                            id="mentalism-prompt"
                            rows={5}
                            value={query}
                            onChange={(e) => {
                                setQuery(e.target.value);
                                setError(null);
                            }}
                            placeholder="e.g., How can I structure a routine around a 'book test'?"
                            className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
                        />
                    </div>

                    {/* Tier-1: Routine Intensity Slider */}
                    <div className="bg-slate-900/40 border border-slate-700 rounded-lg p-3">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <div className="text-sm font-semibold text-slate-200">Mentalism Style</div>
                                <div className="text-xs text-slate-400">{intensityLabel}</div>
                            </div>
                            <div className="text-xs text-slate-500">Low → High</div>
                        </div>
                        <input
                            type="range"
                            min={0}
                            max={INTENSITY_LABELS.length - 1}
                            step={1}
                            value={intensityIdx}
                            onChange={(e) => setIntensityIdx(Number(e.target.value))}
                            className="w-full mt-3 accent-purple-500"
                        />
                        <div className="mt-2 flex justify-between text-[11px] text-slate-500">
                            <span>Subtle</span>
                            <span>Paranormal</span>
                        </div>
                    </div>

                    {/* Tier-1: Ethical Guardrail Layer */}
                    <label className="flex items-start gap-3 bg-slate-900/40 border border-slate-700 rounded-lg p-3 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={ethicalMode}
                            onChange={(e) => setEthicalMode(e.target.checked)}
                            className="mt-1 accent-purple-500"
                        />
                        <div>
                            <div className="text-sm font-semibold text-slate-200">Ethical Performance Mode</div>
                            <div className="text-xs text-slate-400 leading-relaxed">
                                Avoid medical claims • avoid “real psychic” framing • avoid grief exploitation • prefer respectful disclaimers tone
                            </div>
                        </div>
                    </label>

                    {/* Tier-1: Primary Blueprint Button */}
                    <button
                        onClick={() => handleGenerate()}
                        disabled={isLoading || !query.trim()}
                        className="w-full py-3 mt-1 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed"
                    >
                        <WandIcon className="w-5 h-5" />
                        <span>Build Mentalism Blueprint</span>
                    </button>

                    {error && <p className="text-red-400 mt-2 text-sm text-center">{error}</p>}

                    {/* Tier-2: Cold Reading Phrase Builder */}
                    <div className="bg-slate-900/40 border border-slate-700 rounded-lg p-3">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <div className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                                    <LightbulbIcon className="w-4 h-4 text-purple-300" />
                                    <span>Cold Reading Phrase Builder</span>
                                </div>
                                <div className="text-xs text-slate-400">Generate performance-safe phrasing that strengthens conviction without exposure.</div>
                            </div>
                            <div className="text-[11px] text-slate-500">mini-tool</div>
                        </div>

                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                            <label className="flex items-center gap-2 text-slate-300 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={phraseTypes.barnum}
                                    onChange={(e) => setPhraseTypes((p) => ({ ...p, barnum: e.target.checked }))}
                                    className="accent-purple-500"
                                />
                                <span>Barnum statements</span>
                            </label>
                            <label className="flex items-center gap-2 text-slate-300 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={phraseTypes.rainbow}
                                    onChange={(e) => setPhraseTypes((p) => ({ ...p, rainbow: e.target.checked }))}
                                    className="accent-purple-500"
                                />
                                <span>Rainbow ruse</span>
                            </label>
                            <label className="flex items-center gap-2 text-slate-300 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={phraseTypes.dual}
                                    onChange={(e) => setPhraseTypes((p) => ({ ...p, dual: e.target.checked }))}
                                    className="accent-purple-500"
                                />
                                <span>Dual reality lines</span>
                            </label>
                            <label className="flex items-center gap-2 text-slate-300 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={phraseTypes.ambiguous}
                                    onChange={(e) => setPhraseTypes((p) => ({ ...p, ambiguous: e.target.checked }))}
                                    className="accent-purple-500"
                                />
                                <span>Ambiguous scripting</span>
                            </label>
                            <label className="flex items-center gap-2 text-slate-300 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={phraseTypes.conviction}
                                    onChange={(e) => setPhraseTypes((p) => ({ ...p, conviction: e.target.checked }))}
                                    className="accent-purple-500"
                                />
                                <span>Convincers</span>
                            </label>
                        </div>

                        <div className="mt-3">
                            <div className="flex items-center justify-between">
                                <div className="text-xs text-slate-400">Phrases per category</div>
                                <div className="text-xs text-slate-300 font-semibold">{phraseCount}</div>
                            </div>
                            <input
                                type="range"
                                min={3}
                                max={10}
                                step={1}
                                value={phraseCount}
                                onChange={(e) => setPhraseCount(Number(e.target.value))}
                                className="w-full mt-2 accent-purple-500"
                            />
                        </div>

                        <button
                            onClick={handleGeneratePhrases}
                            disabled={isPhraseLoading}
                            className="w-full mt-3 py-2 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md text-slate-200 font-semibold transition-colors disabled:bg-slate-700/50 disabled:cursor-not-allowed"
                        >
                            {isPhraseLoading ? (
                                <>
                                    <div className="w-4 h-4 border-t-2 border-slate-300 rounded-full animate-spin" />
                                    <span>Generating phrases…</span>
                                </>
                            ) : (
                                <>
                                    <LightbulbIcon className="w-4 h-4" />
                                    <span>Generate Phrases</span>
                                </>
                            )}
                        </button>

                        {phraseError && <p className="text-red-400 mt-2 text-xs text-center">{phraseError}</p>}

                        {phrases && (
                            <div className="mt-3 space-y-2">
                                {phrases.barnum_statements?.length ? (
                                    <details className="bg-slate-950/30 border border-slate-700 rounded-md p-2">
                                        <summary className="cursor-pointer text-slate-200 text-sm font-semibold">Barnum statements</summary>
                                        <ul className="mt-2 text-xs text-slate-300 list-disc pl-5 space-y-1">
                                            {phrases.barnum_statements.map((x, i) => (
                                                <li key={i} className="whitespace-pre-wrap">{x}</li>
                                            ))}
                                        </ul>
                                    </details>
                                ) : null}

                                {phrases.rainbow_ruse_phrasing?.length ? (
                                    <details className="bg-slate-950/30 border border-slate-700 rounded-md p-2">
                                        <summary className="cursor-pointer text-slate-200 text-sm font-semibold">Rainbow ruse phrasing</summary>
                                        <ul className="mt-2 text-xs text-slate-300 list-disc pl-5 space-y-1">
                                            {phrases.rainbow_ruse_phrasing.map((x, i) => (
                                                <li key={i} className="whitespace-pre-wrap">{x}</li>
                                            ))}
                                        </ul>
                                    </details>
                                ) : null}

                                {phrases.dual_reality_lines?.length ? (
                                    <details className="bg-slate-950/30 border border-slate-700 rounded-md p-2">
                                        <summary className="cursor-pointer text-slate-200 text-sm font-semibold">Dual reality lines</summary>
                                        <ul className="mt-2 text-xs text-slate-300 list-disc pl-5 space-y-1">
                                            {phrases.dual_reality_lines.map((x, i) => (
                                                <li key={i} className="whitespace-pre-wrap">{x}</li>
                                            ))}
                                        </ul>
                                    </details>
                                ) : null}

                                {phrases.ambiguous_scripting?.length ? (
                                    <details className="bg-slate-950/30 border border-slate-700 rounded-md p-2">
                                        <summary className="cursor-pointer text-slate-200 text-sm font-semibold">Ambiguous scripting</summary>
                                        <ul className="mt-2 text-xs text-slate-300 list-disc pl-5 space-y-1">
                                            {phrases.ambiguous_scripting.map((x, i) => (
                                                <li key={i} className="whitespace-pre-wrap">{x}</li>
                                            ))}
                                        </ul>
                                    </details>
                                ) : null}

                                {phrases.conviction_lines?.length ? (
                                    <details className="bg-slate-950/30 border border-slate-700 rounded-md p-2">
                                        <summary className="cursor-pointer text-slate-200 text-sm font-semibold">Convincers</summary>
                                        <ul className="mt-2 text-xs text-slate-300 list-disc pl-5 space-y-1">
                                            {phrases.conviction_lines.map((x, i) => (
                                                <li key={i} className="whitespace-pre-wrap">{x}</li>
                                            ))}
                                        </ul>
                                    </details>
                                ) : null}
                            </div>
                        )}
                    </div>

                    <div className="pt-4">
                        <h3 className="text-sm font-semibold text-slate-400 mb-2 text-center uppercase tracking-wider">Explore Key Concepts</h3>
                        <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {CATEGORY_QUERIES.map((cat) => (
                                <button
                                    key={cat.name}
                                    onClick={() => handleExampleClick(cat.query)}
                                    className="w-full p-3 bg-slate-800/50 hover:bg-purple-900/50 border border-slate-700 rounded-lg text-sm text-slate-300 text-center font-semibold transition-colors"
                                >
                                    {cat.name}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Result Area */}
            <div className="flex flex-col bg-slate-900/50 rounded-lg border border-slate-800 min-h-[300px]">
                {isLoading ? (
                    <div className="flex-1 flex items-center justify-center">
                        <LoadingIndicator />
                    </div>
                ) : blueprint ? (
                    <div className="relative group flex-1 flex flex-col">
                        <div className="p-4 overflow-y-auto">
                            <div className="mb-4">
                                <PsychologicalLayerVisualizer compact />
                            </div>

                            {(stressError || stressReport) && (
                                <details open className="bg-slate-950/30 border border-slate-700 rounded-lg p-3 mb-4">
                                    <summary className="cursor-pointer text-slate-200 font-semibold">Stress Test Report</summary>

                                    {stressError ? (
                                        <div className="mt-2 text-sm text-red-400">{stressError}</div>
                                    ) : stressReport ? (
                                        <div className="mt-3 space-y-3">
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="text-sm text-slate-200 font-semibold">Overall Risk</div>
                                                <div
                                                    className={`text-xs px-2 py-1 rounded-md border ${
                                                        stressReport.overall_risk === 'high'
                                                            ? 'border-red-500/40 text-red-300 bg-red-500/10'
                                                            : stressReport.overall_risk === 'low'
                                                              ? 'border-green-500/40 text-green-300 bg-green-500/10'
                                                              : 'border-yellow-500/40 text-yellow-200 bg-yellow-500/10'
                                                    }`}
                                                >
                                                    {stressReport.overall_risk.toUpperCase()}
                                                </div>
                                            </div>

                                            {stressReport.vulnerability_summary && (
                                                <div className="text-sm text-slate-300 whitespace-pre-wrap">{stressReport.vulnerability_summary}</div>
                                            )}

                                            {stressReport.suspicion_points?.length ? (
                                                <details className="bg-slate-900/30 border border-slate-700 rounded-md p-2">
                                                    <summary className="cursor-pointer text-slate-200 text-sm font-semibold">Where suspicion forms</summary>
                                                    <div className="mt-2 space-y-2">
                                                        {stressReport.suspicion_points.map((s, i) => (
                                                            <div key={i} className="rounded-md border border-slate-700 bg-slate-950/30 p-2">
                                                                <div className="flex items-center justify-between">
                                                                    <div className="text-xs font-semibold text-slate-200">{s.persona}</div>
                                                                    <div className="text-[11px] text-slate-400">Severity: {s.severity_1_to_5}/5</div>
                                                                </div>
                                                                <div className="mt-1 text-xs text-slate-300 whitespace-pre-wrap">
                                                                    <span className="text-slate-400">Moment:</span> {s.where_suspicion_forms || '—'}
                                                                </div>
                                                                <div className="mt-1 text-xs text-slate-300 whitespace-pre-wrap">
                                                                    <span className="text-slate-400">Why:</span> {s.why_it_triggers || '—'}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </details>
                                            ) : null}

                                            {stressReport.recommended_patches?.length ? (
                                                <details className="bg-slate-900/30 border border-slate-700 rounded-md p-2">
                                                    <summary className="cursor-pointer text-slate-200 text-sm font-semibold">Recommended patches</summary>
                                                    <div className="mt-2 space-y-2">
                                                        {stressReport.recommended_patches.map((p, i) => (
                                                            <div key={i} className="rounded-md border border-slate-700 bg-slate-950/30 p-2">
                                                                <div className="text-xs font-semibold text-slate-200">{p.persona}</div>
                                                                <div className="mt-1 text-xs text-slate-300 whitespace-pre-wrap">
                                                                    <span className="text-slate-400">Patch:</span> {p.patch || '—'}
                                                                </div>
                                                                {p.rationale ? (
                                                                    <div className="mt-1 text-xs text-slate-300 whitespace-pre-wrap">
                                                                        <span className="text-slate-400">Rationale:</span> {p.rationale}
                                                                    </div>
                                                                ) : null}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </details>
                                            ) : null}

                                            {stressReport.optional_script_adjustments?.length ? (
                                                <details className="bg-slate-900/30 border border-slate-700 rounded-md p-2">
                                                    <summary className="cursor-pointer text-slate-200 text-sm font-semibold">Optional script adjustments</summary>
                                                    <ul className="mt-2 text-xs text-slate-300 list-disc pl-5 space-y-1">
                                                        {stressReport.optional_script_adjustments.map((x, i) => (
                                                            <li key={i} className="whitespace-pre-wrap">{x}</li>
                                                        ))}
                                                    </ul>
                                                </details>
                                            ) : null}
                                        </div>
                                    ) : null}
                                </details>
                            )}

                            <div className="space-y-3">
                                <details open className="bg-slate-950/30 border border-slate-700 rounded-lg p-3">
                                    <summary className="cursor-pointer text-slate-200 font-semibold">Premise</summary>
                                    <div className="mt-2 text-sm text-slate-300 whitespace-pre-wrap">{blueprint.premise || '—'}</div>
                                </details>

                                <details open className="bg-slate-950/30 border border-slate-700 rounded-lg p-3">
                                    <summary className="cursor-pointer text-slate-200 font-semibold">Psychological Frame</summary>
                                    <div className="mt-2 text-sm text-slate-300 whitespace-pre-wrap">{blueprint.psychological_frame || '—'}</div>
                                </details>

                                <details open className="bg-slate-950/30 border border-slate-700 rounded-lg p-3">
                                    <summary className="cursor-pointer text-slate-200 font-semibold">Phase Structure</summary>
                                    <div className="mt-2 text-sm text-slate-300">
                                        {blueprint.phase_structure?.length ? (
                                            <ul className="list-disc pl-5 space-y-1">
                                                {blueprint.phase_structure.map((x, i) => (
                                                    <li key={i} className="whitespace-pre-wrap">{x}</li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <div className="text-slate-500">—</div>
                                        )}
                                    </div>
                                </details>

                                <details className="bg-slate-950/30 border border-slate-700 rounded-lg p-3">
                                    <summary className="cursor-pointer text-slate-200 font-semibold">Audience Control Points</summary>
                                    <div className="mt-2 text-sm text-slate-300">
                                        {blueprint.audience_control_points?.length ? (
                                            <ul className="list-disc pl-5 space-y-1">
                                                {blueprint.audience_control_points.map((x, i) => (
                                                    <li key={i} className="whitespace-pre-wrap">{x}</li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <div className="text-slate-500">—</div>
                                        )}
                                    </div>
                                </details>

                                <details className="bg-slate-950/30 border border-slate-700 rounded-lg p-3">
                                    <summary className="cursor-pointer text-slate-200 font-semibold">Conviction Builders</summary>
                                    <div className="mt-2 text-sm text-slate-300">
                                        {blueprint.conviction_builders?.length ? (
                                            <ul className="list-disc pl-5 space-y-1">
                                                {blueprint.conviction_builders.map((x, i) => (
                                                    <li key={i} className="whitespace-pre-wrap">{x}</li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <div className="text-slate-500">—</div>
                                        )}
                                    </div>
                                </details>

                                <details className="bg-slate-950/30 border border-slate-700 rounded-lg p-3">
                                    <summary className="cursor-pointer text-slate-200 font-semibold">Outs</summary>
                                    <div className="mt-2 text-sm text-slate-300">
                                        {blueprint.outs?.length ? (
                                            <ul className="list-disc pl-5 space-y-1">
                                                {blueprint.outs.map((x, i) => (
                                                    <li key={i} className="whitespace-pre-wrap">{x}</li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <div className="text-slate-500">—</div>
                                        )}
                                    </div>
                                </details>

                                <details className="bg-slate-950/30 border border-slate-700 rounded-lg p-3">
                                    <summary className="cursor-pointer text-slate-200 font-semibold">Ethical Flags</summary>
                                    <div className="mt-2 text-sm text-slate-300">
                                        {blueprint.ethical_flags?.length ? (
                                            <ul className="list-disc pl-5 space-y-1">
                                                {blueprint.ethical_flags.map((x, i) => (
                                                    <li key={i} className="whitespace-pre-wrap">{x}</li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <div className="text-slate-500">—</div>
                                        )}
                                    </div>
                                </details>

                                <details className="bg-slate-950/30 border border-slate-700 rounded-lg p-3">
                                    <summary className="cursor-pointer text-slate-200 font-semibold">Escalation Options</summary>
                                    <div className="mt-2 text-sm text-slate-300">
                                        {blueprint.escalation_options?.length ? (
                                            <ul className="list-disc pl-5 space-y-1">
                                                {blueprint.escalation_options.map((x, i) => (
                                                    <li key={i} className="whitespace-pre-wrap">{x}</li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <div className="text-slate-500">—</div>
                                        )}
                                    </div>
                                </details>
                                <details className="bg-slate-950/30 border border-slate-700 rounded-lg p-3">
                                    <summary className="cursor-pointer text-slate-200 font-semibold">Audience Reaction Model</summary>
                                    <div className="mt-2 text-sm text-slate-300">
                                        {blueprint.audience_reaction_model ? (
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between text-xs">
                                                    <span className="text-slate-400">Gasps likelihood</span>
                                                    <span className="text-slate-200 font-semibold">{blueprint.audience_reaction_model.gasps_likelihood_1_to_10}/10</span>
                                                </div>
                                                <div className="flex items-center justify-between text-xs">
                                                    <span className="text-slate-400">Skeptic resistance probability</span>
                                                    <span className="text-slate-200 font-semibold">{blueprint.audience_reaction_model.skeptic_resistance_probability_0_to_1}</span>
                                                </div>
                                                <div className="flex items-center justify-between text-xs">
                                                    <span className="text-slate-400">Confusion risk</span>
                                                    <span className="text-slate-200 font-semibold">{blueprint.audience_reaction_model.confusion_risk_0_to_1}</span>
                                                </div>
                                                <div className="flex items-center justify-between text-xs">
                                                    <span className="text-slate-400">Memory distortion strength</span>
                                                    <span className="text-slate-200 font-semibold">{blueprint.audience_reaction_model.memory_distortion_strength_1_to_10}/10</span>
                                                </div>
                                                {blueprint.audience_reaction_model.notes ? (
                                                    <div className="text-xs text-slate-300 whitespace-pre-wrap border-t border-slate-800 pt-2">
                                                        {blueprint.audience_reaction_model.notes}
                                                    </div>
                                                ) : null}
                                            </div>
                                        ) : (
                                            <div className="text-slate-500">—</div>
                                        )}
                                    </div>
                                </details>

                            </div>
                        </div>

                        {sendPlannerError ? (
                            <div className="mt-3 mb-1 text-sm text-red-300 bg-red-950/30 border border-red-900/40 rounded-md p-2">
                                {sendPlannerError}
                            </div>
                        ) : null}
                        {rehearsalPrepError ? (
                            <div className="mt-3 mb-1 text-sm text-red-300 bg-red-950/30 border border-red-900/40 rounded-md p-2">
                                {rehearsalPrepError}
                            </div>
                        ) : null}
                        {sendPlannerSuccess ? (
                            <div className="mt-3 mb-1 text-sm text-green-300 bg-green-950/20 border border-green-900/40 rounded-md p-2">
                                Sent to Show Planner ✓
                            </div>
                        ) : null}

                        <div className="sticky bottom-0 right-0 mt-auto p-2 bg-slate-900/50 flex flex-wrap justify-end gap-2 border-t border-slate-800">
                            <button
                                onClick={handleSendToShowPlanner}
                                disabled={isSendingToPlanner || !blueprint}
                                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-purple-700/70 hover:bg-purple-600/80 border border-purple-500/40 rounded-md text-white transition-colors disabled:bg-purple-900/30 disabled:text-slate-400 disabled:cursor-not-allowed"
                                title="Create a Show + tasks in Show Planner from this blueprint"
                            >
                                {isSendingToPlanner ? (
                                    <>
                                        <div className="w-4 h-4 border-t-2 border-white/80 rounded-full animate-spin" />
                                        <span>Sending…</span>
                                    </>
                                ) : (
                                    <>
                                        <LightbulbIcon className="w-4 h-4" />
                                        <span>Send to Show Planner</span>
                                    </>
                                )}
                            </button>

                            <button
                                onClick={handleRehearseInLiveStudio}
                                disabled={isPreparingRehearsal || !blueprint}
                                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md text-slate-200 transition-colors disabled:bg-slate-700/50 disabled:cursor-not-allowed"
                                title="Jump into Live Rehearsal with this blueprint preloaded"
                            >
                                {isPreparingRehearsal ? (
                                    <>
                                        <div className="w-4 h-4 border-t-2 border-slate-300 rounded-full animate-spin" />
                                        <span>Preparing…</span>
                                    </>
                                ) : (
                                    <>
                                        <WandIcon className="w-4 h-4" />
                                        <span>Rehearse in Live Studio</span>
                                    </>
                                )}
                            </button>

                            <button
                                onClick={handleStressTest}
                                disabled={isStressTesting}
                                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md text-slate-200 transition-colors disabled:bg-slate-700/50 disabled:cursor-not-allowed"
                                title="Stress test the routine against skeptical audiences"
                            >
                                {isStressTesting ? (
                                    <>
                                        <div className="w-4 h-4 border-t-2 border-slate-300 rounded-full animate-spin" />
                                        <span>Stress testing…</span>
                                    </>
                                ) : (
                                    <>
                                        <SearchIcon className="w-4 h-4" />
                                        <span>Stress Test</span>
                                    </>
                                )}
                            </button>
                            <ShareButton
                                title={`Mentalism Blueprint: ${query}`}
                                text={blueprintToText(query, blueprint)}
                                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200 transition-colors"
                            >
                                <ShareIcon className="w-4 h-4" />
                                <span>Share</span>
                            </ShareButton>
                            <button
                                onClick={handleCopy}
                                disabled={copyStatus === 'copied'}
                                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200 disabled:cursor-default transition-colors"
                            >
                                {copyStatus === 'copied' ? (
                                    <>
                                        <CheckIcon className="w-4 h-4 text-green-400" />
                                        <span>Copied!</span>
                                    </>
                                ) : (
                                    <>
                                        <CopyIcon className="w-4 h-4" />
                                        <span>Copy</span>
                                    </>
                                )}
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saveStatus === 'saved'}
                                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200 disabled:cursor-default transition-colors"
                            >
                                {saveStatus === 'saved' ? (
                                    <>
                                        <CheckIcon className="w-4 h-4 text-green-400" />
                                        <span>Saved!</span>
                                    </>
                                ) : (
                                    <>
                                        <SaveIcon className="w-4 h-4" />
                                        <span>Save Idea</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-center text-slate-500 p-4">
                        <div className="w-full max-w-md">
                            <PsychologicalLayerVisualizer />
                            <p className="mt-4 text-sm text-slate-400">Your mentalism routine blueprint will appear here.</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MentalismAssistant;
