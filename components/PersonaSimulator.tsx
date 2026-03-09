import React, { useState, useRef, useEffect } from 'react';
import { Type } from '@google/genai';
import { generateResponse, generateStructuredResponse } from '../services/geminiService';
import { saveIdea } from '../services/ideasService';
import { getShows, addTaskToShow } from '../services/showsService';
import { trackClientEvent } from '../services/telemetryClient';
import { PERSONAS, PERSONA_SIMULATOR_SYSTEM_INSTRUCTION } from '../constants';
import type { ChatMessage, Persona, Show, User } from '../types';
import { UsersCogIcon, WandIcon, SaveIcon, SendIcon, CheckIcon, ChevronDownIcon } from './icons';
import FormattedText from './FormattedText';

interface PersonaSimulatorProps {
    user: User;
    onIdeaSaved: () => void;
}

const createChatMessage = (role: 'user' | 'model', text: string): ChatMessage => ({
    id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    role,
    text,
});

const LoadingIndicator: React.FC = () => (
    <div className="flex items-center space-x-1">
        <div className="w-2 h-2 bg-purple-300 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
        <div className="w-2 h-2 bg-purple-300 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
        <div className="w-2 h-2 bg-purple-300 rounded-full animate-bounce"></div>
    </div>
);

type PersonaKey = 'heckler' | 'child' | 'corporate' | 'supportive';
type PersonaIntensity = 'gentle' | 'realistic' | 'brutal';
type PanelKey = 'transcript' | 'psychology' | 'risk' | 'coaching' | 'adjustments';

type PersonaSimulationResult = {
    interactionTranscript: string[];
    audiencePsychology: string[];
    riskMoments: string[];
    directorCoaching: string[];
    recommendedAdjustments: string[];
    overallTakeaway: string;
};

const INTENSITY_LABELS: Record<PersonaIntensity, string> = {
    gentle: 'Gentle',
    realistic: 'Realistic',
    brutal: 'Brutal',
};

const INTENSITY_HELP: Record<PersonaIntensity, string> = {
    gentle: 'Less interruption. Softer critique. More encouragement.',
    realistic: 'Balanced, believable audience behavior.',
    brutal: 'More interruption. Blunt critique. Higher skepticism.',
};

const PERSONA_MICRO_DESCRIPTIONS: Record<PersonaKey, string> = {
    heckler: 'Challenges logic, interrupts, doubts',
    child: 'Overreacts, blurts thoughts, emotional',
    corporate: 'Half-listening, polite, easily distracted',
    supportive: 'Encouraging, affirming, emotionally tuned',
};

const DIFFICULTY_LABELS: Record<PersonaIntensity, string> = {
    gentle: 'Supportive',
    realistic: 'Neutral',
    brutal: 'Challenging',
};

const SCRIPT_EXAMPLE =
    "Ladies and gentlemen, let’s try a quick experiment. I’ll need your imagination for just a moment…\n\n" +
    "In a second, you’ll see something that looks impossible — and that’s because it is… until it isn’t.\n\n" +
    "If at any point you think you know what’s happening, don’t say it out loud — just smile and keep it to yourself.";

const PERSONA_KEY_BY_NAME: Record<string, PersonaKey> = {
    'Skeptical Heckler': 'heckler',
    'Enthusiastic Child': 'child',
    'Distracted Corporate Guest': 'corporate',
    'Supportive Partner': 'supportive',
};

const DEMO_PRESETS: Record<'demo' | 'tough' | 'supportive', { persona: PersonaKey; intensity: PersonaIntensity; title: string }> = {
    demo: { persona: 'corporate', intensity: 'realistic', title: 'Run Demo Simulation' },
    tough: { persona: 'heckler', intensity: 'brutal', title: 'Tough Audience' },
    supportive: { persona: 'supportive', intensity: 'gentle', title: 'Supportive Audience' },
};

const DEFAULT_OPEN_PANELS: Record<PanelKey, boolean> = {
    transcript: true,
    psychology: true,
    risk: true,
    coaching: true,
    adjustments: true,
};

const getPersonaKey = (persona: Persona): PersonaKey => PERSONA_KEY_BY_NAME[persona.name] ?? 'heckler';

const safeStringArray = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];

const PersonaSimulator: React.FC<PersonaSimulatorProps> = ({ user, onIdeaSaved }) => {
    const [script, setScript] = useState('');
    const [selectedPersona, setSelectedPersona] = useState<PersonaKey | null>(null);
    const [intensity, setIntensity] = useState<PersonaIntensity>('realistic');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<PersonaSimulationResult | null>(null);
    const [hasRunSimulation, setHasRunSimulation] = useState(false);
    const [activeDemoMode, setActiveDemoMode] = useState<'demo' | 'tough' | 'supportive' | null>(null);
    const [openPanels, setOpenPanels] = useState<Record<PanelKey, boolean>>(DEFAULT_OPEN_PANELS);

    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
    const [saveTarget, setSaveTarget] = useState<'ideas' | 'sessionNotes' | 'showPlanner'>('ideas');
    const [shows, setShows] = useState<Show[]>([]);
    const [selectedShowId, setSelectedShowId] = useState<string>('');
    const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [postSaveNotice, setPostSaveNotice] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const selectedPersonaObj = selectedPersona
        ? PERSONAS.find(p => getPersonaKey(p) === selectedPersona) ?? null
        : null;

    const canStart = !!script.trim() && !!selectedPersonaObj && !isLoading;
    const canSend = !!input.trim() && !!selectedPersonaObj && !isLoading;

    useEffect(() => {
        void trackClientEvent({ tool: 'persona_simulator', action: 'page_open' });
    }, []);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);

    useEffect(() => {
        if (!postSaveNotice) return;
        const t = window.setTimeout(() => setPostSaveNotice(null), 7000);
        return () => window.clearTimeout(t);
    }, [postSaveNotice]);

    const togglePanel = (key: PanelKey) => {
        setOpenPanels(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const buildIntensityModifier = (level: PersonaIntensity) => {
        if (level === 'gentle') {
            return `Tone: supportive and constructive. Keep interruptions minimal. If you are a heckler persona, challenge politely and back off quickly.`;
        }
        if (level === 'brutal') {
            return `Tone: blunt and demanding. Interrupt more often. If you are a heckler persona, challenge aggressively and test confidence. Keep it non-harassing.`;
        }
        return `Tone: realistic and balanced. React naturally without overdoing it.`;
    };

    const buildStructuredPrompt = (personaName: string, personaDescription: string, scriptText: string, level: PersonaIntensity) => (
        `You are simulating a live audience member reacting to a magician's material.\n\n` +
        `Persona: ${personaName}\n` +
        `Persona behavior: ${personaDescription}\n` +
        `Intensity: ${INTENSITY_LABELS[level]} (${INTENSITY_HELP[level]})\n\n` +
        `Instructions:\n` +
        `- Stay fully inside the persona during the simulated interaction.\n` +
        `- Do not explain methods, secrets, gimmicks, or sleights.\n` +
        `- Simulate realistic audience interruptions, doubts, excitement, or drift in attention based on the persona.\n` +
        `- After the simulation, convert the audience behavior into practical director coaching.\n` +
        `- Make every point specific to the script, not generic.\n\n` +
        `SCRIPT:\n${scriptText}`
    );

    const getResultSummaryText = (personaName: string, res: PersonaSimulationResult, level: PersonaIntensity = intensity) => (
        `Persona: ${personaName}\n` +
        `Intensity: ${INTENSITY_LABELS[level]}\n` +
        `Difficulty: ${DIFFICULTY_LABELS[level]}\n\n` +
        `Overall Takeaway:\n${res.overallTakeaway}\n\n` +
        `Simulated Audience Interaction:\n${res.interactionTranscript.map(line => `- ${line}`).join('\n') || '- (none)'}\n\n` +
        `Audience Psychology:\n${res.audiencePsychology.map(line => `- ${line}`).join('\n') || '- (none)'}\n\n` +
        `Risk Moments:\n${res.riskMoments.map(line => `- ${line}`).join('\n') || '- (none)'}\n\n` +
        `Director Coaching:\n${res.directorCoaching.map(line => `- ${line}`).join('\n') || '- (none)'}\n\n` +
        `Recommended Adjustments:\n${res.recommendedAdjustments.map(line => `- ${line}`).join('\n') || '- (none)'}`
    );

    const getFollowupContext = () => {
        if (!selectedPersonaObj || !result) return '';
        return (
            `Current persona session context:\n` +
            `Persona: ${selectedPersonaObj.name}\n` +
            `Intensity: ${INTENSITY_LABELS[intensity]}\n` +
            `Overall takeaway: ${result.overallTakeaway}\n` +
            `Key psychology notes: ${result.audiencePsychology.slice(0, 3).join(' | ') || 'none'}\n` +
            `Key risk moments: ${result.riskMoments.slice(0, 3).join(' | ') || 'none'}\n` +
            `Continue the same rehearsal session. Stay consistent with the persona and prior reactions.`
        );
    };

    const runSimulation = async (options?: {
        demoMode?: 'demo' | 'tough' | 'supportive';
        personaOverride?: Persona;
        intensityOverride?: PersonaIntensity;
        scriptOverride?: string;
    }) => {
        const personaForRun = options?.personaOverride ?? selectedPersonaObj;
        const intensityForRun = options?.intensityOverride ?? intensity;
        const scriptForRun = options?.scriptOverride ?? script;
        const demoMode = options?.demoMode;

        if (!scriptForRun.trim() || !personaForRun) return;

        setError(null);
        setResult(null);
        setHasRunSimulation(true);
        setActiveDemoMode(demoMode ?? null);
        setOpenPanels(DEFAULT_OPEN_PANELS);

        const firstMessage = createChatMessage('user', scriptForRun);
        setMessages([firstMessage]);
        setIsLoading(true);

        void trackClientEvent({
            tool: 'persona_simulator',
            action: 'simulation_start',
            metadata: {
                persona: getPersonaKey(personaForRun),
                intensity: intensityForRun,
                scriptLength: scriptForRun.trim().length,
                hasCustomScript: scriptForRun.trim() !== SCRIPT_EXAMPLE.trim(),
                demoMode: demoMode ?? null,
            },
        });

        try {
            const intensityModifier = buildIntensityModifier(intensityForRun);
            const baseSystemInstruction = PERSONA_SIMULATOR_SYSTEM_INSTRUCTION(personaForRun.description);
            const systemInstruction = `${baseSystemInstruction}\n\n${intensityModifier}`;
            const prompt = buildStructuredPrompt(personaForRun.name, personaForRun.description, scriptForRun, intensityForRun);

            const responseSchema = {
                type: Type.OBJECT,
                properties: {
                    interactionTranscript: { type: Type.ARRAY, items: { type: Type.STRING } },
                    audiencePsychology: { type: Type.ARRAY, items: { type: Type.STRING } },
                    riskMoments: { type: Type.ARRAY, items: { type: Type.STRING } },
                    directorCoaching: { type: Type.ARRAY, items: { type: Type.STRING } },
                    recommendedAdjustments: { type: Type.ARRAY, items: { type: Type.STRING } },
                    overallTakeaway: { type: Type.STRING },
                },
                required: ['interactionTranscript', 'audiencePsychology', 'riskMoments', 'directorCoaching', 'recommendedAdjustments', 'overallTakeaway'],
            };

            const structured = await generateStructuredResponse(prompt, systemInstruction, responseSchema, user);
            const safeResult: PersonaSimulationResult = {
                interactionTranscript: safeStringArray(structured?.interactionTranscript),
                audiencePsychology: safeStringArray(structured?.audiencePsychology),
                riskMoments: safeStringArray(structured?.riskMoments),
                directorCoaching: safeStringArray(structured?.directorCoaching),
                recommendedAdjustments: safeStringArray(structured?.recommendedAdjustments),
                overallTakeaway: typeof structured?.overallTakeaway === 'string' && structured.overallTakeaway.trim().length > 0
                    ? structured.overallTakeaway
                    : 'Useful rehearsal insights were returned, but the model did not supply a final summary.',
            };

            setResult(safeResult);
            const transcriptText = getResultSummaryText(personaForRun.name, safeResult, intensityForRun);
            setMessages(prev => [...prev, createChatMessage('model', transcriptText)]);

            void trackClientEvent({
                tool: 'persona_simulator',
                action: 'simulation_success',
                outcome: 'SUCCESS_NOT_CHARGED',
                metadata: {
                    persona: getPersonaKey(personaForRun),
                    intensity: intensityForRun,
                    transcriptCount: safeResult.interactionTranscript.length,
                    riskCount: safeResult.riskMoments.length,
                    coachingCount: safeResult.directorCoaching.length,
                    demoMode: demoMode ?? null,
                },
            });
        } catch (e: any) {
            const message = e?.message ? String(e.message) : 'Unknown error';
            setError("The audience didn’t respond — try again in a moment.");
            void trackClientEvent({
                tool: 'persona_simulator',
                action: 'simulation_error',
                outcome: 'ERROR_UPSTREAM',
                metadata: { persona: personaForRun ? getPersonaKey(personaForRun) : selectedPersona, intensity: intensityForRun, message, demoMode: demoMode ?? null },
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleStartSimulation = async () => {
        await runSimulation();
    };

    const handleRunPreset = async (mode: 'demo' | 'tough' | 'supportive') => {
        const preset = DEMO_PRESETS[mode];
        const nextScript = script.trim() || SCRIPT_EXAMPLE;
        setSelectedPersona(preset.persona);
        setIntensity(preset.intensity);
        setScript(nextScript);
        setError(null);
        const personaObj = PERSONAS.find(p => getPersonaKey(p) === preset.persona) ?? null;
        if (!personaObj) return;
        void runSimulation({ demoMode: mode, personaOverride: personaObj, intensityOverride: preset.intensity, scriptOverride: nextScript });
    };

    const handleSend = async () => {
        if (!input.trim() || !selectedPersonaObj) return;

        setError(null);
        const userMessage = createChatMessage('user', input);
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);
        void trackClientEvent({ tool: 'persona_simulator', action: 'followup_send', metadata: { persona: selectedPersona, intensity } });

        try {
            const intensityModifier = buildIntensityModifier(intensity);
            const baseSystemInstruction = PERSONA_SIMULATOR_SYSTEM_INSTRUCTION(selectedPersonaObj.description);
            const systemInstruction = `${baseSystemInstruction}\n\n${intensityModifier}\n\n${getFollowupContext()}`;
            const history = [...messages, userMessage];
            const response = await generateResponse(input, systemInstruction, user, history);
            setMessages(prev => [...prev, createChatMessage('model', response)]);
        } catch {
            setError("The audience didn’t respond — try again in a moment.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveTranscript = async () => {
        if (messages.length === 0 || !selectedPersonaObj) return;
        let content = `## Persona Simulation: ${selectedPersonaObj.name}\n\n`;
        content += messages.map(msg => `**${msg.role === 'user' ? 'Magician' : selectedPersonaObj.name}:** ${msg.text}`).join('\n\n---\n\n');
        const title = `Persona Sim: ${selectedPersonaObj.name}`;
        await saveIdea('text', content, title, ['persona-simulator', 'transcript', selectedPersona ?? 'unknown']);
        onIdeaSaved();
        void trackClientEvent({ tool: 'persona_simulator', action: 'save_transcript', outcome: 'SUCCESS_NOT_CHARGED', metadata: { persona: selectedPersona, intensity } });
        setPostSaveNotice('Transcript saved to Saved Ideas.');
    };

    const openSaveModal = async () => {
        if (!selectedPersonaObj || !result) return;
        setSaveStatus(null);
        setSaveTarget('ideas');
        setIsSaveModalOpen(true);
        try {
            const fetched = await getShows();
            setShows(fetched);
            if (fetched?.length && !selectedShowId) setSelectedShowId(fetched[0].id);
        } catch {
            setShows([]);
        }
    };

    const handleSaveFeedback = async () => {
        if (!selectedPersonaObj || !result) return;
        setIsSaving(true);
        setSaveStatus(null);

        const titleBase = `Persona Feedback: ${selectedPersonaObj.name}`;
        const feedbackText = getResultSummaryText(selectedPersonaObj.name, result);

        try {
            if (saveTarget === 'ideas') {
                await saveIdea({
                    type: 'text',
                    title: titleBase,
                    content: `## ${titleBase}\n\n${feedbackText}`,
                    tags: ['persona-simulator', 'feedback', selectedPersona ?? 'unknown'],
                });
                onIdeaSaved();
                setSaveStatus({ type: 'success', message: 'Saved to Saved Ideas.' });
                setIsSaveModalOpen(false);
                void trackClientEvent({ tool: 'persona_simulator', action: 'save_feedback', outcome: 'SUCCESS_NOT_CHARGED', metadata: { destination: 'ideas', persona: selectedPersona, intensity } });
                return;
            }

            if (saveTarget === 'sessionNotes') {
                await saveIdea({
                    type: 'text',
                    title: `Session Notes: ${titleBase}`,
                    content: `## Session Notes\n\n${feedbackText}`,
                    tags: ['session-notes', 'persona-simulator', 'feedback', selectedPersona ?? 'unknown'],
                });
                onIdeaSaved();
                setSaveStatus({ type: 'success', message: 'Saved to Session Notes.' });
                setIsSaveModalOpen(false);
                void trackClientEvent({ tool: 'persona_simulator', action: 'save_feedback', outcome: 'SUCCESS_NOT_CHARGED', metadata: { destination: 'sessionNotes', persona: selectedPersona, intensity } });
                return;
            }

            if (saveTarget === 'showPlanner') {
                const showId = selectedShowId || shows?.[0]?.id;
                if (!showId) {
                    throw new Error('No show selected. Create a show in Show Planner first.');
                }

                await addTaskToShow(showId, {
                    title: titleBase,
                    notes: feedbackText,
                    priority: 'Medium' as any,
                    status: 'To-Do' as any,
                    tags: ['persona-simulator', 'feedback', selectedPersona ?? 'unknown'],
                });

                setSaveStatus({ type: 'success', message: 'Saved to Show Planner as a new task.' });
                setPostSaveNotice('Saved — open Show Planner to see the new task.');
                setIsSaveModalOpen(false);
                void trackClientEvent({ tool: 'persona_simulator', action: 'show_planner_handoff', outcome: 'SUCCESS_NOT_CHARGED', metadata: { persona: selectedPersona, intensity } });
                return;
            }
        } catch (e: any) {
            setSaveStatus({
                type: 'error',
                message: e?.message ? String(e.message) : 'Could not save feedback. Please try again.',
            });
        } finally {
            setIsSaving(false);
        }
    };

    const ResultPanel: React.FC<{ panelKey: PanelKey; title: string; items: string[]; emptyText: string }> = ({ panelKey, title, items, emptyText }) => (
        <section className="rounded-2xl border border-slate-700 bg-slate-800/60 overflow-hidden">
            <button
                type="button"
                onClick={() => togglePanel(panelKey)}
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-700/40 transition-colors"
            >
                <span className="text-sm font-bold text-slate-100">{title}</span>
                <ChevronDownIcon className={`w-5 h-5 text-slate-400 transition-transform ${openPanels[panelKey] ? 'rotate-180' : ''}`} />
            </button>
            {openPanels[panelKey] && (
                <div className="px-4 pb-4">
                    {items.length ? (
                        <ul className="list-disc pl-5 space-y-2 text-slate-200 text-sm">
                            {items.map((item, idx) => (
                                <li key={`${panelKey}-${idx}`} className="whitespace-pre-wrap break-words">{item}</li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-sm text-slate-400">{emptyText}</p>
                    )}
                </div>
            )}
        </section>
    );

    return (
        <div className="flex-1 overflow-y-auto p-4 md:p-6 animate-fade-in">
            <div className="max-w-7xl mx-auto space-y-6">
                <section className="rounded-2xl border border-slate-700 bg-gradient-to-r from-slate-900 via-purple-950/40 to-slate-900 p-5 md:p-6">
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                        <div className="flex items-start gap-4">
                            <div className="w-14 h-14 rounded-2xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center shrink-0">
                                <UsersCogIcon className="w-8 h-8 text-purple-300" />
                            </div>
                            <div>
                                <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-200 mb-3">
                                    AI Studio Rehearsal Lab
                                </div>
                                <h2 className="text-2xl md:text-3xl font-bold text-white font-cinzel">Persona Simulator</h2>
                                <p className="mt-2 text-slate-300 max-w-3xl">
                                    Stress-test your material against a simulated audience persona, study the psychology of their reactions,
                                    and get director-grade coaching before you step on stage.
                                </p>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 lg:w-[420px]">
                            {(['demo', 'tough', 'supportive'] as const).map((mode) => (
                                <button
                                    key={mode}
                                    type="button"
                                    onClick={() => handleRunPreset(mode)}
                                    disabled={isLoading}
                                    className="px-3 py-3 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700/80 text-sm font-semibold text-slate-100 disabled:opacity-50"
                                >
                                    {DEMO_PRESETS[mode].title}
                                </button>
                            ))}
                        </div>
                    </div>
                </section>

                {postSaveNotice && (
                    <div className="text-sm text-green-200 bg-green-950/30 border border-green-800/40 rounded-md px-3 py-2">
                        {postSaveNotice}
                    </div>
                )}

                <div className="grid grid-cols-1 xl:grid-cols-[420px_minmax(0,1fr)] gap-6 items-start">
                    <aside className="space-y-5 xl:sticky xl:top-4">
                        <section className="rounded-2xl border border-slate-700 bg-slate-900/80 p-5">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-lg font-bold text-slate-100">Simulation Setup</h3>
                                <span className="text-xs text-slate-400">Audience lab</span>
                            </div>

                            <div>
                                <h4 className="text-sm font-semibold text-slate-200 mb-2">Choose a Persona</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-3">
                                    {PERSONAS.map(persona => {
                                        const key = getPersonaKey(persona);
                                        const isSelected = selectedPersona === key;
                                        return (
                                            <button
                                                key={persona.name}
                                                onClick={() => { setSelectedPersona(key); setError(null); }}
                                                className={`relative text-left p-3 rounded-xl border transition-all ${isSelected ? 'border-yellow-400 bg-purple-900/40 shadow-[0_0_0_3px_rgba(250,204,21,0.12)]' : 'border-slate-700 bg-slate-800 hover:border-slate-500'}`}
                                            >
                                                {isSelected && (
                                                    <span className="absolute top-2 right-2 inline-flex items-center justify-center w-6 h-6 rounded-full bg-yellow-400/20 border border-yellow-400/40">
                                                        <CheckIcon className="w-4 h-4 text-yellow-300" />
                                                    </span>
                                                )}
                                                <div className="flex items-start gap-3">
                                                    <persona.icon className="w-8 h-8 text-purple-400 shrink-0 mt-0.5" />
                                                    <div>
                                                        <div className="font-semibold text-sm text-white">{persona.name}</div>
                                                        <div className="mt-1 text-[11px] text-slate-400 leading-snug">{PERSONA_MICRO_DESCRIPTIONS[key]}</div>
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="mt-5">
                                <div className="flex items-center justify-between mb-2">
                                    <h4 className="text-sm font-semibold text-slate-200">Difficulty</h4>
                                    <span className="text-xs text-purple-300 font-semibold">{DIFFICULTY_LABELS[intensity]}</span>
                                </div>
                                <div className="inline-flex rounded-lg border border-slate-700 bg-slate-800 p-1 w-full">
                                    {(['gentle', 'realistic', 'brutal'] as PersonaIntensity[]).map((level) => {
                                        const active = intensity === level;
                                        return (
                                            <button
                                                key={level}
                                                type="button"
                                                onClick={() => setIntensity(level)}
                                                className={`flex-1 px-3 py-2 rounded-md text-sm font-semibold transition-colors ${active ? 'bg-purple-700 text-white' : 'text-slate-200 hover:bg-slate-700/60'}`}
                                                title={INTENSITY_HELP[level]}
                                            >
                                                {INTENSITY_LABELS[level]}
                                            </button>
                                        );
                                    })}
                                </div>
                                <p className="mt-2 text-xs text-slate-400">{INTENSITY_HELP[intensity]}</p>
                            </div>

                            <div className="mt-5">
                                <div className="flex items-center justify-between mb-2">
                                    <h4 className="text-sm font-semibold text-slate-200">Script or Routine Notes</h4>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const next = script.trim().length ? `${script.replace(/\s*$/, '')}\n\n${SCRIPT_EXAMPLE}` : SCRIPT_EXAMPLE;
                                            setScript(next);
                                            setError(null);
                                        }}
                                        className="text-xs font-semibold text-purple-300 hover:text-purple-200 underline underline-offset-4"
                                    >
                                        Insert example
                                    </button>
                                </div>
                                <textarea
                                    rows={12}
                                    value={script}
                                    onChange={(e) => { setScript(e.target.value); if (error) setError(null); }}
                                    placeholder="Paste your patter, volunteer script, or routine description here..."
                                    className="w-full px-3 py-3 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
                                />
                                <p className="mt-2 text-xs text-slate-500">Best results with 1–5 minutes of spoken text or a concise routine outline.</p>
                            </div>

                            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <button
                                    onClick={handleStartSimulation}
                                    disabled={!canStart}
                                    className="px-4 py-3 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 rounded-xl text-white font-bold transition-colors disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed"
                                >
                                    {isLoading ? (
                                        <>
                                            <LoadingIndicator />
                                            <span>Running…</span>
                                        </>
                                    ) : (
                                        <>
                                            <WandIcon className="w-5 h-5" />
                                            <span>Run Simulation</span>
                                        </>
                                    )}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setMessages([]);
                                        setResult(null);
                                        setHasRunSimulation(false);
                                        setInput('');
                                        setError(null);
                                        setActiveDemoMode(null);
                                    }}
                                    className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold"
                                >
                                    Clear Session
                                </button>
                            </div>

                            {!canStart && !isLoading && (
                                <p className="text-center text-sm text-slate-400 mt-3">Select a persona and enter material to begin.</p>
                            )}
                        </section>
                    </aside>

                    <section className="space-y-5">
                        <section className="rounded-2xl border border-slate-700 bg-slate-900/80 p-5">
                            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-100">Simulation Output</h3>
                                    <p className="text-sm text-slate-400 mt-1">
                                        Transcript beats, audience psychology, risk moments, and director coaching.
                                    </p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        onClick={() => void runSimulation({ demoMode: activeDemoMode ?? undefined })}
                                        disabled={!canStart}
                                        className="px-4 py-2 text-sm bg-purple-700 hover:bg-purple-600 rounded-md text-white font-bold transition-colors disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed"
                                    >
                                        Run Again
                                    </button>
                                    <button
                                        onClick={openSaveModal}
                                        disabled={!result || isLoading}
                                        className="px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-white font-semibold transition-colors flex items-center gap-2 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed"
                                    >
                                        <SaveIcon className="w-4 h-4" /> Save Feedback as Notes
                                    </button>
                                    <button
                                        onClick={() => void handleSaveTranscript()}
                                        disabled={messages.length === 0 || isLoading}
                                        className="px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-white font-semibold transition-colors flex items-center gap-2 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed"
                                    >
                                        <SaveIcon className="w-4 h-4" /> Save Transcript
                                    </button>
                                </div>
                            </div>

                            {selectedPersonaObj && (
                                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                                    <span className="px-2.5 py-1 rounded-full bg-purple-900/40 border border-purple-700/40 text-purple-200 font-semibold">Persona: {selectedPersonaObj.name}</span>
                                    <span className="px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300">Intensity: {INTENSITY_LABELS[intensity]}</span>
                                    <span className="px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300">Difficulty: {DIFFICULTY_LABELS[intensity]}</span>
                                    {activeDemoMode && <span className="px-2.5 py-1 rounded-full bg-amber-900/30 border border-amber-700/40 text-amber-200">Demo preset active</span>}
                                </div>
                            )}

                            {error && (
                                <div className="mt-4 text-sm text-red-300 bg-red-950/40 border border-red-900/60 rounded-md px-3 py-2">
                                    {error}
                                </div>
                            )}

                            {!hasRunSimulation && !isLoading && (
                                <div className="mt-5 rounded-2xl border border-slate-700 bg-slate-800/40 p-6 text-slate-300">
                                    Run a persona simulation to see a rehearsal transcript, psychology breakdown, risk moments, and practical adjustments.
                                </div>
                            )}

                            {isLoading && (
                                <div className="mt-5 rounded-2xl border border-slate-700 bg-slate-800/40 p-6 flex items-center gap-3 text-slate-200">
                                    <LoadingIndicator />
                                    <span>Audience reacting… building the rehearsal breakdown.</span>
                                </div>
                            )}

                            {result && !isLoading && (
                                <div className="mt-5 space-y-4">
                                    <section className="rounded-2xl border border-purple-800/40 bg-purple-950/20 p-4">
                                        <h4 className="text-sm font-bold text-purple-200 mb-2">Overall Takeaway</h4>
                                        <p className="text-slate-100 whitespace-pre-wrap break-words">{result.overallTakeaway}</p>
                                    </section>

                                    <ResultPanel
                                        panelKey="transcript"
                                        title="Simulated Audience Interaction"
                                        items={result.interactionTranscript}
                                        emptyText="No transcript beats returned."
                                    />
                                    <ResultPanel
                                        panelKey="psychology"
                                        title="Audience Psychology"
                                        items={result.audiencePsychology}
                                        emptyText="No psychology analysis returned."
                                    />
                                    <ResultPanel
                                        panelKey="risk"
                                        title="Risk Moments"
                                        items={result.riskMoments}
                                        emptyText="No major risk moments detected."
                                    />
                                    <ResultPanel
                                        panelKey="coaching"
                                        title="Director Coaching"
                                        items={result.directorCoaching}
                                        emptyText="No director coaching returned."
                                    />
                                    <ResultPanel
                                        panelKey="adjustments"
                                        title="Recommended Adjustments"
                                        items={result.recommendedAdjustments}
                                        emptyText="No recommended adjustments returned."
                                    />
                                </div>
                            )}
                        </section>

                        <section className="rounded-2xl border border-slate-700 bg-slate-900/80 p-5">
                            <h3 className="text-lg font-bold text-slate-100 mb-2">Continue the Session</h3>
                            <p className="text-sm text-slate-400 mb-4">Ask the persona to push harder, soften, react to a revised line, or explain where attention drifted.</p>

                            {messages.length > 2 && (
                                <div className="space-y-3 mb-4 max-h-[420px] overflow-y-auto pr-1">
                                    {messages.slice(2).map((msg) => (
                                        <div key={msg.id} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                            {msg.role === 'model' ? (
                                                <div className="max-w-3xl px-4 py-3 rounded-2xl bg-slate-700 text-slate-200">
                                                    <FormattedText text={msg.text} />
                                                </div>
                                            ) : (
                                                <div className="max-w-3xl px-4 py-3 rounded-2xl bg-purple-800 text-white">
                                                    <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="flex items-center bg-slate-800 rounded-xl border border-slate-700">
                                <input
                                    type="text"
                                    value={input}
                                    onChange={(e) => { setInput(e.target.value); if (error) setError(null); }}
                                    onKeyDown={(e) => e.key === 'Enter' && canSend && handleSend()}
                                    placeholder="Example: React as an even tougher skeptic to my opening line..."
                                    className="flex-1 w-full bg-transparent px-4 py-3 text-white placeholder-slate-400 focus:outline-none"
                                    disabled={isLoading || !selectedPersonaObj}
                                />
                                <button onClick={handleSend} disabled={!canSend} className="p-3 text-purple-400 hover:text-purple-300 disabled:text-slate-600 transition-colors">
                                    <SendIcon className="w-6 h-6" />
                                </button>
                            </div>

                            <div ref={messagesEndRef} />
                        </section>
                    </section>
                </div>
            </div>

            {isSaveModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60" onClick={() => !isSaving && setIsSaveModalOpen(false)} />
                    <div className="relative w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 shadow-xl">
                        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
                            <div>
                                <div className="text-lg font-bold text-slate-100">Save Feedback as Notes</div>
                                <div className="text-xs text-slate-400">Send this persona feedback into your workflow.</div>
                            </div>
                            <button
                                className="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold disabled:opacity-50"
                                onClick={() => setIsSaveModalOpen(false)}
                                disabled={isSaving}
                            >
                                Close
                            </button>
                        </div>

                        <div className="p-4 space-y-4">
                            <div className="space-y-2">
                                <div className="text-sm font-semibold text-slate-200">Save destination</div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    <label className={`cursor-pointer rounded-lg border px-3 py-2 text-sm ${saveTarget === 'ideas' ? 'border-purple-500 bg-purple-900/20 text-slate-100' : 'border-slate-700 bg-slate-800 text-slate-200 hover:border-slate-500'}`}>
                                        <input type="radio" name="saveTarget" className="sr-only" checked={saveTarget === 'ideas'} onChange={() => setSaveTarget('ideas')} disabled={isSaving} />
                                        <div className="font-semibold">Saved Ideas</div>
                                        <div className="text-[11px] text-slate-400">Stores as a text idea</div>
                                    </label>
                                    <label className={`cursor-pointer rounded-lg border px-3 py-2 text-sm ${saveTarget === 'sessionNotes' ? 'border-purple-500 bg-purple-900/20 text-slate-100' : 'border-slate-700 bg-slate-800 text-slate-200 hover:border-slate-500'}`}>
                                        <input type="radio" name="saveTarget" className="sr-only" checked={saveTarget === 'sessionNotes'} onChange={() => setSaveTarget('sessionNotes')} disabled={isSaving} />
                                        <div className="font-semibold">Session Notes</div>
                                        <div className="text-[11px] text-slate-400">Tagged for notes</div>
                                    </label>
                                    <label className={`cursor-pointer rounded-lg border px-3 py-2 text-sm ${saveTarget === 'showPlanner' ? 'border-purple-500 bg-purple-900/20 text-slate-100' : 'border-slate-700 bg-slate-800 text-slate-200 hover:border-slate-500'}`}>
                                        <input type="radio" name="saveTarget" className="sr-only" checked={saveTarget === 'showPlanner'} onChange={() => setSaveTarget('showPlanner')} disabled={isSaving} />
                                        <div className="font-semibold">Show Planner</div>
                                        <div className="text-[11px] text-slate-400">Creates a task</div>
                                    </label>
                                </div>
                            </div>

                            {saveTarget === 'showPlanner' && (
                                <div className="space-y-2">
                                    <div className="text-sm font-semibold text-slate-200">Choose show</div>
                                    <select
                                        value={selectedShowId}
                                        onChange={(e) => setSelectedShowId(e.target.value)}
                                        className="w-full rounded-md bg-slate-800 border border-slate-700 text-slate-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                        disabled={isSaving}
                                    >
                                        {shows.length === 0 ? (
                                            <option value="">No shows found (create one in Show Planner)</option>
                                        ) : (
                                            shows.map((s) => (
                                                <option key={s.id} value={s.id}>{s.title}</option>
                                            ))
                                        )}
                                    </select>
                                    <div className="text-xs text-slate-400">This will add a new task titled “Persona Feedback…” to the selected show.</div>
                                </div>
                            )}

                            {saveStatus && (
                                <div className={`text-sm rounded-md px-3 py-2 border ${saveStatus.type === 'success' ? 'text-green-200 bg-green-950/30 border-green-800/40' : 'text-red-200 bg-red-950/30 border-red-800/40'}`}>
                                    {saveStatus.message}
                                </div>
                            )}

                            <div className="flex items-center justify-end gap-2">
                                <button className="px-4 py-2 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold disabled:opacity-50" onClick={() => setIsSaveModalOpen(false)} disabled={isSaving}>Cancel</button>
                                <button
                                    className="px-4 py-2 rounded-md bg-purple-600 hover:bg-purple-700 text-white font-bold disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed flex items-center gap-2"
                                    onClick={handleSaveFeedback}
                                    disabled={isSaving || (saveTarget === 'showPlanner' && shows.length === 0)}
                                >
                                    {isSaving ? (
                                        <>
                                            <LoadingIndicator />
                                            <span>Saving…</span>
                                        </>
                                    ) : (
                                        <>
                                            <SaveIcon className="w-4 h-4" />
                                            <span>Save</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PersonaSimulator;
