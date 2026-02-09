
import React, { useState, useRef, useEffect } from 'react';
import { Type } from '@google/genai';
import { generateResponse, generateStructuredResponse } from '../services/geminiService';
import { saveIdea } from '../services/ideasService';
import { getShows, addTaskToShow } from '../services/showsService';
import { PERSONAS, PERSONA_SIMULATOR_SYSTEM_INSTRUCTION } from '../constants';
import type { ChatMessage, Persona, Show, User } from '../types';
import { UsersCogIcon, WandIcon, SaveIcon, SendIcon, CheckIcon } from './icons';
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

type PersonaSimulationResult = {
    personaReaction: string;
    riskMoments: string[];
    suggestions: string[];
};

type PersonaIntensity = 'gentle' | 'realistic' | 'brutal';

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

const getPersonaKey = (persona: Persona): PersonaKey => {
    // Fallback keeps the app functional if labels change unexpectedly.
    return PERSONA_KEY_BY_NAME[persona.name] ?? 'heckler';
};

const PersonaSimulator: React.FC<PersonaSimulatorProps> = ({ user, onIdeaSaved }) => {
    const [mode, setMode] = useState<'setup' | 'simulation'>('setup');
    const [script, setScript] = useState('');
    const [selectedPersona, setSelectedPersona] = useState<PersonaKey | null>(null);
    const [intensity, setIntensity] = useState<PersonaIntensity>('realistic');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<PersonaSimulationResult | null>(null);

    // Save Feedback as Notes
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
    const [saveTarget, setSaveTarget] = useState<'ideas' | 'sessionNotes' | 'showPlanner'>('ideas');
    const [shows, setShows] = useState<Show[]>([]);
    const [selectedShowId, setSelectedShowId] = useState<string>('');
    const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    // Friendly post-save notice (shown outside the modal) for destinations that may not auto-refresh.
    const [postSaveNotice, setPostSaveNotice] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const selectedPersonaObj = selectedPersona
        ? PERSONAS.find(p => getPersonaKey(p) === selectedPersona) ?? null
        : null;

    const canStart = !!script.trim() && !!selectedPersonaObj && !isLoading;
    const canSend = !!input.trim() && !!selectedPersonaObj && !isLoading;

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    useEffect(() => {
        if (!postSaveNotice) return;
        const t = window.setTimeout(() => setPostSaveNotice(null), 7000);
        return () => window.clearTimeout(t);
    }, [postSaveNotice]);

    const buildStructuredPrompt = (personaName: string, personaDescription: string, scriptText: string, level: PersonaIntensity) => {
        return (
            `You are simulating a live audience persona reacting to a magician's script.\n\n` +
            `Persona: ${personaName}\n` +
            `Persona behavior: ${personaDescription}\n\n` +
            `Intensity: ${INTENSITY_LABELS[level]} (${INTENSITY_HELP[level]})\n\n` +
            `TASK: React to the script as the persona would in the moment. Do not explain how magic works. ` +
            `Focus on audience reaction, attention risks, and actionable improvements.\n\n` +
            `SCRIPT:\n${scriptText}`
        );
    };

    const buildIntensityModifier = (level: PersonaIntensity) => {
        // Keep this concise and deterministic so the persona remains consistent.
        if (level === 'gentle') {
            return `Tone: supportive and constructive. Keep interruptions minimal. If you are a heckler persona, challenge politely and back off quickly.`;
        }
        if (level === 'brutal') {
            return `Tone: blunt and demanding. Interrupt more often. If you are a heckler persona, challenge aggressively and test confidence. Keep it non-harassing.`;
        }
        return `Tone: realistic and balanced. React naturally without overdoing it.`;
    };

    const getFeedbackText = (personaName: string, res: PersonaSimulationResult) => {
        return (
            `Persona: ${personaName}\n` +
            `Intensity: ${INTENSITY_LABELS[intensity]}\n\n` +
            `Persona Reaction:\n${res.personaReaction}\n\n` +
            `Risk Moments:\n${res.riskMoments.map(r => `- ${r}`).join('\n') || '- (none)'}\n\n` +
            `Suggestions:\n${res.suggestions.map(s => `- ${s}`).join('\n') || '- (none)'}`
        );
    };

    const openSaveModal = async () => {
        if (!selectedPersonaObj || !result) return;
        setSaveStatus(null);
        setSaveTarget('ideas');
        setIsSaveModalOpen(true);

        // Lazy-load shows so we don't incur a DB read on every visit.
        try {
            const fetched = await getShows();
            setShows(fetched);
            // Default select the most recent show if available.
            if (fetched?.length && !selectedShowId) setSelectedShowId(fetched[0].id);
        } catch {
            // It's okay if shows are unavailable; user can still save to ideas.
            setShows([]);
        }
    };

    const handleSaveFeedback = async () => {
        if (!selectedPersonaObj || !result) return;
        setIsSaving(true);
        setSaveStatus(null);

        const titleBase = `Persona Feedback: ${selectedPersonaObj.name}`;
        const feedbackText = getFeedbackText(selectedPersonaObj.name, result);

        try {
            if (saveTarget === 'ideas') {
                await saveIdea({
                    type: 'text',
                    title: titleBase,
                    content: `## ${titleBase}\n\n${feedbackText}`,
                    tags: ['persona-simulator', 'feedback', selectedPersona],
                });
                onIdeaSaved();
                setSaveStatus({ type: 'success', message: 'Saved to Saved Ideas.' });
                setIsSaveModalOpen(false);
                return;
            }

            if (saveTarget === 'sessionNotes') {
                await saveIdea({
                    type: 'text',
                    title: `Session Notes: ${titleBase}`,
                    content: `## Session Notes\n\n${feedbackText}`,
                    tags: ['session-notes', 'persona-simulator', 'feedback', selectedPersona],
                });
                onIdeaSaved();
                setSaveStatus({ type: 'success', message: 'Saved to Session Notes.' });
                setIsSaveModalOpen(false);
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
                    tags: ['persona-simulator', 'feedback', selectedPersona],
                });

                setSaveStatus({ type: 'success', message: 'Saved to Show Planner as a new task.' });
                // Some pages may not auto-refresh immediately; make the next step explicit.
                setPostSaveNotice('Saved — open Show Planner to see the new task.');
                setIsSaveModalOpen(false);
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

    const runSimulation = async () => {
        if (!script.trim() || !selectedPersonaObj) return;

        setError(null);
        setResult(null);

        const firstMessage = createChatMessage('user', script);
        setMessages([firstMessage]);
        setMode('simulation');
        setIsLoading(true);

        try {
            // Ensure the model is strongly anchored to the selected persona.
            const intensityModifier = buildIntensityModifier(intensity);
            const baseSystemInstruction = PERSONA_SIMULATOR_SYSTEM_INSTRUCTION(selectedPersonaObj.description);
            const systemInstruction = `${baseSystemInstruction}\n\n${intensityModifier}`;
            const prompt = buildStructuredPrompt(selectedPersonaObj.name, selectedPersonaObj.description, script, intensity);

            const responseSchema = {
                type: Type.OBJECT,
                properties: {
                    personaReaction: { type: Type.STRING },
                    riskMoments: { type: Type.ARRAY, items: { type: Type.STRING } },
                    suggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: ['personaReaction', 'riskMoments', 'suggestions'],
            };

            const structured = await generateStructuredResponse(prompt, systemInstruction, responseSchema, user);
            const safeResult: PersonaSimulationResult = {
                personaReaction: typeof structured?.personaReaction === 'string' ? structured.personaReaction : 'No reaction returned.',
                riskMoments: Array.isArray(structured?.riskMoments) ? structured.riskMoments.filter((x: any) => typeof x === 'string') : [],
                suggestions: Array.isArray(structured?.suggestions) ? structured.suggestions.filter((x: any) => typeof x === 'string') : [],
            };

            setResult(safeResult);

            // Keep a compact transcript for saving/export.
            const transcriptText = getFeedbackText(selectedPersonaObj.name, safeResult);

            setMessages(prev => [...prev, createChatMessage('model', transcriptText)]);
        } catch (e) {
            // Friendly, on-brand message. Never surface raw API errors.
            setError("The audience didn’t respond — try again in a moment.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleStartSimulation = async () => {
        await runSimulation();
    };

    const handleSend = async () => {
        if (!input.trim() || !selectedPersonaObj) return;

        setError(null);

        const userMessage = createChatMessage('user', input);
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);
        
        try {
            const intensityModifier = buildIntensityModifier(intensity);
            const baseSystemInstruction = PERSONA_SIMULATOR_SYSTEM_INSTRUCTION(selectedPersonaObj.description);
            const systemInstruction = `${baseSystemInstruction}\n\n${intensityModifier}`;
            const history = [...messages, userMessage]; // include the new message for context
            const response = await generateResponse(input, systemInstruction, user, history);
            setMessages(prev => [...prev, createChatMessage('model', response)]);
        } catch (e) {
            setError("The audience didn’t respond — try again in a moment.");
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleSave = () => {
        if (messages.length === 0 || !selectedPersonaObj) return;
        
        let content = `## Persona Simulation: ${selectedPersonaObj.name}\n\n`;
        content += messages.map(msg => `**${msg.role === 'user' ? 'Magician' : selectedPersonaObj.name}:** ${msg.text}`).join('\n\n---\n\n');

        const title = `Persona Sim: ${selectedPersonaObj.name}`;
        saveIdea('text', content, title);
        onIdeaSaved();
    };


    if (mode === 'simulation' && selectedPersonaObj) {
        return (
            <div className="flex-1 flex flex-col h-full overflow-hidden">
                <header className="p-4 border-b border-slate-700 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <selectedPersonaObj.icon className="w-8 h-8 text-purple-400" />
                        <div>
                            <h2 className="text-xl font-bold text-white">Rehearsing with:</h2>
                            <p className="font-semibold text-purple-300">{selectedPersonaObj.name}</p>
                            <p className="text-xs text-slate-400 mt-0.5">Intensity: <span className="text-slate-200 font-semibold">{INTENSITY_LABELS[intensity]}</span></p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                            onClick={runSimulation}
                            disabled={!canStart}
                            className="px-4 py-2 text-sm bg-purple-700 hover:bg-purple-600 rounded-md text-white font-bold transition-colors disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed"
                            title="Run the same script again with this persona"
                        >
                            Run Again
                        </button>
                        <button
                            onClick={() => { setMode('setup'); setMessages([]); setResult(null); setInput(''); setError(null); }}
                            className="px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-white font-semibold transition-colors"
                            title="Go back and choose a different persona"
                        >
                            Test with Another Persona
                        </button>
                        <button
                            onClick={openSaveModal}
                            disabled={!result || isLoading}
                            className="px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-white font-semibold transition-colors flex items-center gap-2 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed"
                            title="Save the structured feedback into your workflow"
                        >
                            <SaveIcon className="w-4 h-4" /> Save Feedback as Notes
                        </button>
                        <button onClick={handleSave} className="px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-white font-semibold transition-colors flex items-center gap-2">
                            <SaveIcon className="w-4 h-4" /> Save Transcript
                        </button>
                    </div>
                </header>

                {postSaveNotice && (
                    <div className="px-4 pt-4">
                        <div className="text-sm text-green-200 bg-green-950/30 border border-green-800/40 rounded-md px-3 py-2">
                            {postSaveNotice}
                        </div>
                    </div>
                )}

                <main className="flex-1 overflow-y-auto p-4 md:p-6">
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold text-slate-200">Persona Feedback</h3>
                            {isLoading && (
                                <div className="flex items-center gap-2 text-sm text-slate-300">
                                    <LoadingIndicator />
                                    <span>Audience reacting…</span>
                                </div>
                            )}
                        </div>

                        {result ? (
                            <div className="grid grid-cols-1 gap-4">
                                <section className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
                                    <h4 className="text-sm font-bold text-purple-300 mb-2">Persona Reaction</h4>
                                    <p className="text-slate-200 whitespace-pre-wrap break-words">{result.personaReaction}</p>
                                </section>

                                <section className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
                                    <h4 className="text-sm font-bold text-purple-300 mb-2">Risk Moments</h4>
                                    {result.riskMoments?.length ? (
                                        <ul className="list-disc pl-5 space-y-1 text-slate-200">
                                            {result.riskMoments.map((r, idx) => (
                                                <li key={idx} className="whitespace-pre-wrap break-words">{r}</li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="text-slate-400">No major risk moments detected.</p>
                                    )}
                                </section>

                                <section className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
                                    <h4 className="text-sm font-bold text-purple-300 mb-2">Suggestions</h4>
                                    {result.suggestions?.length ? (
                                        <ul className="list-disc pl-5 space-y-1 text-slate-200">
                                            {result.suggestions.map((s, idx) => (
                                                <li key={idx} className="whitespace-pre-wrap break-words">{s}</li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="text-slate-400">No suggestions returned.</p>
                                    )}
                                </section>
                            </div>
                        ) : (
                            <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4 text-slate-300">
                                {isLoading ? 'Generating persona feedback…' : 'Run the simulation to see structured feedback here.'}
                            </div>
                        )}

                        {/* Optional follow-ups */}
                        {messages.length > 2 && (
                            <section className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
                                <h4 className="text-sm font-bold text-slate-200 mb-2">Follow-ups</h4>
                                <div className="space-y-3">
                                    {messages.slice(2).map((msg) => (
                                        <div key={msg.id} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                            {msg.role === 'model' ? (
                                                <div className="max-w-2xl px-4 py-2 rounded-xl bg-slate-700 text-slate-200">
                                                    <FormattedText text={msg.text} />
                                                </div>
                                            ) : (
                                                <div className="max-w-2xl px-4 py-2 rounded-xl bg-purple-800 text-white">
                                                    <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        <div ref={messagesEndRef} />
                    </div>
                </main>

                <footer className="p-4 border-t border-slate-800">
                    <div className="flex items-center bg-slate-800 rounded-lg">
                        <input
                            type="text" value={input} onChange={(e) => { setInput(e.target.value); if (error) setError(null); }}
                            onKeyDown={(e) => e.key === 'Enter' && canSend && handleSend()}
                            placeholder="Continue the performance..."
                            className="flex-1 w-full bg-transparent px-4 py-3 text-white placeholder-slate-400 focus:outline-none"
                            disabled={isLoading}
                        />
                        <button onClick={handleSend} disabled={!canSend} className="p-3 text-purple-400 hover:text-purple-300 disabled:text-slate-600 transition-colors">
                            <SendIcon className="w-6 h-6" />
                        </button>
                    </div>

                    {error && (
                        <div className="mt-3 text-sm text-red-300 bg-red-950/40 border border-red-900/60 rounded-md px-3 py-2">
                            {error}
                        </div>
                    )}
                </footer>

                {isSaveModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <div
                            className="absolute inset-0 bg-black/60"
                            onClick={() => !isSaving && setIsSaveModalOpen(false)}
                        />
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
                                            <input
                                                type="radio"
                                                name="saveTarget"
                                                className="sr-only"
                                                checked={saveTarget === 'ideas'}
                                                onChange={() => setSaveTarget('ideas')}
                                                disabled={isSaving}
                                            />
                                            <div className="font-semibold">Saved Ideas</div>
                                            <div className="text-[11px] text-slate-400">Stores as a text idea</div>
                                        </label>
                                        <label className={`cursor-pointer rounded-lg border px-3 py-2 text-sm ${saveTarget === 'sessionNotes' ? 'border-purple-500 bg-purple-900/20 text-slate-100' : 'border-slate-700 bg-slate-800 text-slate-200 hover:border-slate-500'}`}>
                                            <input
                                                type="radio"
                                                name="saveTarget"
                                                className="sr-only"
                                                checked={saveTarget === 'sessionNotes'}
                                                onChange={() => setSaveTarget('sessionNotes')}
                                                disabled={isSaving}
                                            />
                                            <div className="font-semibold">Session Notes</div>
                                            <div className="text-[11px] text-slate-400">Tagged for notes</div>
                                        </label>
                                        <label className={`cursor-pointer rounded-lg border px-3 py-2 text-sm ${saveTarget === 'showPlanner' ? 'border-purple-500 bg-purple-900/20 text-slate-100' : 'border-slate-700 bg-slate-800 text-slate-200 hover:border-slate-500'}`}>
                                            <input
                                                type="radio"
                                                name="saveTarget"
                                                className="sr-only"
                                                checked={saveTarget === 'showPlanner'}
                                                onChange={() => setSaveTarget('showPlanner')}
                                                disabled={isSaving}
                                            />
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
                                                    <option key={s.id} value={s.id}>
                                                        {s.title}
                                                    </option>
                                                ))
                                            )}
                                        </select>
                                        <div className="text-xs text-slate-400">
                                            This will add a new task titled “Persona Feedback…” to the selected show.
                                        </div>
                                    </div>
                                )}

                                {saveStatus && (
                                    <div className={`text-sm rounded-md px-3 py-2 border ${saveStatus.type === 'success' ? 'text-green-200 bg-green-950/30 border-green-800/40' : 'text-red-200 bg-red-950/30 border-red-800/40'}`}>
                                        {saveStatus.message}
                                    </div>
                                )}

                                <div className="flex items-center justify-end gap-2">
                                    <button
                                        className="px-4 py-2 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold disabled:opacity-50"
                                        onClick={() => setIsSaveModalOpen(false)}
                                        disabled={isSaving}
                                    >
                                        Cancel
                                    </button>
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
        )
    }

    return (
        <main className="flex-1 overflow-y-auto p-4 md:p-6 flex items-center justify-center animate-fade-in">
            <div className="w-full max-w-2xl">
                <div className="text-center">
                    <UsersCogIcon className="w-16 h-16 text-purple-400 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold text-slate-300 mb-2 font-cinzel">Audience Persona Simulator</h2>
                    <p className="text-slate-400 mb-6">Test your material against a virtual audience member. Choose a persona, paste your script, and see how they react.</p>
                </div>
                
                <div className="space-y-6">
                    <div>
                        <h3 className="text-lg font-semibold text-slate-200 mb-2">1. Choose a Persona</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {PERSONAS.map(persona => (
                                (() => {
                                    const key = getPersonaKey(persona);
                                    const isSelected = selectedPersona === key;
                                    return (
                                <button
                                    key={persona.name}
                                    onClick={() => { setSelectedPersona(getPersonaKey(persona)); setError(null); }}
                                    className={`relative p-3 rounded-lg text-center border-2 transition-all ${
                                        isSelected
                                            ? 'border-yellow-400 bg-purple-900/50 shadow-[0_0_0_3px_rgba(250,204,21,0.12)]'
                                            : 'border-slate-700 bg-slate-800 hover:border-slate-500'
                                    }`}
                                >
                                    {isSelected && (
                                        <span className="absolute top-2 right-2 inline-flex items-center justify-center w-6 h-6 rounded-full bg-yellow-400/20 border border-yellow-400/40">
                                            <CheckIcon className="w-4 h-4 text-yellow-300" />
                                        </span>
                                    )}
                                    <persona.icon className="w-8 h-8 mx-auto mb-2 text-purple-400" />
                                    <p className="font-semibold text-sm text-white">{persona.name}</p>
                                    <p className="mt-1 text-[11px] leading-snug text-slate-400">
                                        {PERSONA_MICRO_DESCRIPTIONS[key]}
                                    </p>
                                </button>
                                    );
                                })()
                            ))}
                        </div>

                        {selectedPersonaObj && (
                            <p className="mt-3 text-sm text-slate-300">
                                <span className="text-slate-400">Persona selected:</span>{' '}
                                <span className="font-semibold text-purple-300">{selectedPersonaObj.name}</span>
                            </p>
                        )}

                        <div className="mt-4">
                            <h4 className="text-sm font-semibold text-slate-200 mb-2">Intensity</h4>
                            <div className="inline-flex rounded-lg border border-slate-700 bg-slate-800 p-1">
                                {(['gentle', 'realistic', 'brutal'] as PersonaIntensity[]).map((level) => {
                                    const active = intensity === level;
                                    return (
                                        <button
                                            key={level}
                                            type="button"
                                            onClick={() => setIntensity(level)}
                                            className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${
                                                active
                                                    ? 'bg-purple-700 text-white'
                                                    : 'text-slate-200 hover:bg-slate-700/60'
                                            }`}
                                            title={INTENSITY_HELP[level]}
                                        >
                                            {INTENSITY_LABELS[level]}
                                        </button>
                                    );
                                })}
                            </div>
                            <p className="mt-2 text-xs text-slate-400">{INTENSITY_HELP[intensity]}</p>
                        </div>
                    </div>

                    <div>
                        <h3 className="text-lg font-semibold text-slate-200 mb-2">2. Enter Your Script</h3>
                        <p className="text-sm text-slate-400 mb-2">
                            Paste your patter, routine description, or performance script.
                        </p>
                        <textarea
                            rows={8} value={script} onChange={(e) => { setScript(e.target.value); if (error) setError(null); }}
                            placeholder="Paste your patter or routine description here..."
                            className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
                        />

                        <div className="mt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <p className="text-xs text-slate-500">Best results with 1–5 minutes of spoken text.</p>
                            <button
                                type="button"
                                onClick={() => {
                                    const next = script.trim().length
                                        ? `${script.replace(/\s*$/, '')}\n\n${SCRIPT_EXAMPLE}`
                                        : SCRIPT_EXAMPLE;
                                    setScript(next);
                                    setError(null);
                                }}
                                className="text-xs font-semibold text-purple-300 hover:text-purple-200 underline underline-offset-4"
                            >
                                Insert example script
                            </button>
                        </div>
                    </div>
                    
                    <button
                        onClick={handleStartSimulation}
                        disabled={!canStart}
                        className="w-full py-3 mt-4 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed"
                    >
                        {isLoading ? (
                            <>
                                <LoadingIndicator />
                                <span>Audience reacting…</span>
                            </>
                        ) : (
                            <>
                                <WandIcon className="w-5 h-5" />
                                <span>Start Simulation</span>
                            </>
                        )}
                    </button>

                    {!canStart && (
                        <p className="text-center text-sm text-slate-400 mt-2">
                            Select a persona and enter your script to begin.
                        </p>
                    )}

                    {error && (
                        <div className="mt-3 text-sm text-red-300 bg-red-950/40 border border-red-900/60 rounded-md px-3 py-2">
                            {error}
                        </div>
                    )}
                </div>
            </div>
        </main>
    );
};

export default PersonaSimulator;
