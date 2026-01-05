
import React, { useState } from 'react';
import { generateResponse } from '../services/geminiService';
import { saveIdea } from '../services/ideasService';
import { MENTALISM_ASSISTANT_SYSTEM_INSTRUCTION } from '../constants';
import { WandIcon, SaveIcon, CheckIcon, CopyIcon, ShareIcon, UsersCogIcon } from './icons';
import ShareButton from './ShareButton';
import FormattedText from './FormattedText';
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
  { name: "Core Principles", query: "Explain the fundamental principles of mentalism, such as 'Dual Reality,' 'Cold Reading,' and 'Suggestion.' Provide examples of how each could be applied in a performance context, citing key resources like Corinda's '13 Steps to Mentalism'." },
  { name: "Effect Design", query: "Brainstorm three original mentalism effects. For each, describe the audience's experience, the psychological principles at play (e.g., confirmation bias, psychological force), and a subtle hint at the method without full exposure." },
  { name: "Showmanship & Persona", query: "Discuss the importance of persona in mentalism. Compare the 'psychic entertainer' persona with the 'psychological illusionist' persona. Provide scripting tips for establishing credibility and managing spectators." },
  { name: "Ethics in Mentalism", query: "Provide a detailed guide on the ethical considerations in mentalism. Discuss the pros and cons of disclaimers and how to present effects in a way that is entertaining without being exploitative." },
];

const MentalismAssistant: React.FC<MentalismAssistantProps> = ({ onIdeaSaved }) => {
    const { currentUser } = useAppState() as any;
    const [query, setQuery] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<string | null>(null);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
    const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');

    const handleGenerate = async (searchQuery?: string) => {
        const currentQuery = searchQuery || query;
        if (!currentQuery.trim()) {
            setError("Please enter a theme, effect, or principle.");
            return;
        }
        setIsLoading(true);
        setError(null);
        setResult(null);
        setSaveStatus('idle');
        setCopyStatus('idle');

        try {
            // FIX: pass currentUser as the 3rd argument to generateResponse
            const response = await generateResponse(currentQuery, MENTALISM_ASSISTANT_SYSTEM_INSTRUCTION, currentUser || { email: '', membership: 'free', generationCount: 0, lastResetDate: '' });
            setResult(response);
        } catch (err) {
            setError(err instanceof Error ? err.message : "An unknown error occurred.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleExampleClick = (exampleQuery: string) => {
        setQuery(exampleQuery);
        handleGenerate(exampleQuery);
    };

    const handleSave = () => {
        if (result) {
            const fullContent = `## Mentalism Assistant Idea: ${query}\n\n${result}`;
            saveIdea('text', fullContent, query);
            onIdeaSaved();
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 2000);
        }
    };

    const handleCopy = () => {
        if (result) {
            const fullContent = `Mentalism Assistant Idea: ${query}\n\n${result}`;
            navigator.clipboard.writeText(fullContent);
            setCopyStatus('copied');
            setTimeout(() => setCopyStatus('idle'), 2000);
        }
    };

    return (
        <div className="flex-1 lg:grid lg:grid-cols-2 gap-6 overflow-y-auto p-4 md:p-6 animate-fade-in">
            {/* Control Panel */}
            <div className="flex flex-col">
                <h2 className="text-xl font-bold text-slate-300 mb-2">Mentalism Mind Lab</h2>
                <p className="text-slate-400 mb-4">Explore the psychology, showmanship, and secrets of mind-reading. Develop routines that create the illusion of extraordinary mental abilities.</p>
                
                <div className="space-y-4">
                    <div>
                        <label htmlFor="mentalism-prompt" className="block text-sm font-medium text-slate-300 mb-1">Your Question or Topic</label>
                        <textarea
                            id="mentalism-prompt"
                            rows={5}
                            value={query}
                            onChange={(e) => { setQuery(e.target.value); setError(null); }}
                            placeholder="e.g., How can I structure a routine around a 'book test'?"
                            className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
                        />
                    </div>
                    
                    <button
                        onClick={() => handleGenerate()}
                        disabled={isLoading || !query.trim()}
                        className="w-full py-3 mt-4 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed"
                    >
                        <WandIcon className="w-5 h-5" />
                        <span>Consult the Expert</span>
                    </button>
                    {error && <p className="text-red-400 mt-2 text-sm text-center">{error}</p>}

                     <div className="pt-4">
                        <h3 className="text-sm font-semibold text-slate-400 mb-2 text-center uppercase tracking-wider">Explore Key Concepts</h3>
                        <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {CATEGORY_QUERIES.map(cat => (
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
                ) : result ? (
                    <div className="relative group flex-1 flex flex-col">
                        <div className="p-4 overflow-y-auto">
                           <FormattedText text={result} />
                        </div>
                        <div className="sticky bottom-0 right-0 mt-auto p-2 bg-slate-900/50 flex justify-end gap-2 border-t border-slate-800">
                             <ShareButton
                                title={`Mentalism Assistant: ${query}`}
                                text={result}
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
                                {copyStatus === 'copied' ? <><CheckIcon className="w-4 h-4 text-green-400" /><span>Copied!</span></> : <><CopyIcon className="w-4 h-4" /><span>Copy</span></>}
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saveStatus === 'saved'}
                                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200 disabled:cursor-default transition-colors"
                            >
                                {saveStatus === 'saved' ? <><CheckIcon className="w-4 h-4 text-green-400" /><span>Saved!</span></> : <><SaveIcon className="w-4 h-4" /><span>Save Idea</span></>}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-center text-slate-500 p-4">
                        <div>
                            <UsersCogIcon className="w-24 h-24 mx-auto mb-4" />
                            <p>Your mentalism routine ideas and theory will appear here.</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MentalismAssistant;
