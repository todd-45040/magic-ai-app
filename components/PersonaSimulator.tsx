
import React, { useState, useRef, useEffect } from 'react';
import { generateResponse } from '../services/geminiService';
import { saveIdea } from '../services/ideasService';
import { PERSONAS, PERSONA_SIMULATOR_SYSTEM_INSTRUCTION } from '../constants';
import type { ChatMessage, Persona, User } from '../types';
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
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
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

    const handleStartSimulation = async () => {
        if (!script.trim() || !selectedPersonaObj) return;

        setError(null);

        const firstMessage = createChatMessage('user', script);
        setMessages([firstMessage]);
        setMode('simulation');
        setIsLoading(true);

        try {
            // Ensure the model is strongly anchored to the selected persona.
            const systemInstruction = PERSONA_SIMULATOR_SYSTEM_INSTRUCTION(selectedPersonaObj.description);
            const response = await generateResponse(script, systemInstruction, user);
            setMessages(prev => [...prev, createChatMessage('model', response)]);
        } catch (e) {
            // Friendly, on-brand message. Never surface raw API errors.
            setError("The audience didn’t respond — try again in a moment.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSend = async () => {
        if (!input.trim() || !selectedPersonaObj) return;

        setError(null);

        const userMessage = createChatMessage('user', input);
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);
        
        try {
            const systemInstruction = PERSONA_SIMULATOR_SYSTEM_INSTRUCTION(selectedPersonaObj.description);
            const history = [...messages, userMessage]; // include the new message for context
            const response = await generateResponse(input, systemInstruction, user, history);
            setMessages(prev => [...prev, createChatMessage('model', response)]);
        } catch (e) {
            setError("The audience didn’t respond — try again in a moment.");
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleEndSimulation = () => {
        setMode('setup');
        setMessages([]);
        // Do not clear script or persona, user might want to re-run
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
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                         <button onClick={handleSave} className="px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-white font-semibold transition-colors flex items-center gap-2">
                            <SaveIcon className="w-4 h-4" /> Save Transcript
                         </button>
                        <button onClick={handleEndSimulation} className="px-4 py-2 text-sm bg-red-800/80 hover:bg-red-700 rounded-md text-white font-bold transition-colors">End Simulation</button>
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
                    {messages.map((msg) => (
                        <div key={msg.id} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            {msg.role === 'model' ? (
                            <>
                                <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center flex-shrink-0">
                                    <selectedPersonaObj.icon className="w-5 h-5 text-purple-400" />
                                </div>
                                <div className="max-w-lg px-4 py-2 rounded-xl bg-slate-700 text-slate-200">
                                    <FormattedText text={msg.text} />
                                </div>
                            </>
                            ) : (
                                <div className="max-w-lg px-4 py-2 rounded-xl bg-purple-800 text-white">
                                    <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                                </div>
                            )}
                        </div>
                    ))}
                    {isLoading && (
                    <div className="flex items-start gap-3 justify-start">
                        <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center flex-shrink-0">
                            <selectedPersonaObj.icon className="w-5 h-5 text-purple-400" />
                        </div>
                        <div className="max-w-lg px-4 py-2 rounded-xl bg-slate-700 text-slate-200">
                            <LoadingIndicator />
                        </div>
                    </div>
                    )}
                    <div ref={messagesEndRef} />
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
                        <WandIcon className="w-5 h-5" />
                        <span>Start Simulation</span>
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
