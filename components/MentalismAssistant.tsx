import React, { useMemo, useState } from 'react';
import { Type } from '@google/genai';
import { generateStructuredResponse } from '../services/geminiService';
import { saveIdea } from '../services/ideasService';
import { MENTALISM_ASSISTANT_SYSTEM_INSTRUCTION } from '../constants';
import { WandIcon, SaveIcon, CheckIcon, CopyIcon, ShareIcon, UsersCogIcon } from './icons';
import ShareButton from './ShareButton';
import { useAppState } from '../store';

interface MentalismAssistantProps {
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
        <p className="text-slate-300 mt-4 text-lg">Reading minds...</p>
        <p className="text-slate-400 text-sm">Crafting seemingly impossible feats.</p>
    </div>
);

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

type MentalismBlueprint = {
    premise: string;
    psychological_frame: string;
    phase_structure: string[];
    audience_control_points: string[];
    conviction_builders: string[];
    outs: string[];
    ethical_flags: string[];
    escalation_options: string[];
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

    lines.push('---');
    lines.push('## JSON');
    lines.push('```json');
    lines.push(JSON.stringify(b, null, 2));
    lines.push('```');
    return lines.join('\n');
}

const MentalismAssistant: React.FC<MentalismAssistantProps> = ({ onIdeaSaved }) => {
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
                            </div>
                        </div>

                        <div className="sticky bottom-0 right-0 mt-auto p-2 bg-slate-900/50 flex justify-end gap-2 border-t border-slate-800">
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
                        <div>
                            <UsersCogIcon className="w-24 h-24 mx-auto mb-4" />
                            <p>Your mentalism routine blueprint will appear here.</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MentalismAssistant;
