
import React, { useState } from 'react';
import { generateResponse } from '../services/geminiService';
import { saveIdea } from '../services/ideasService';
import { GOSPEL_MAGIC_SYSTEM_INSTRUCTION } from '../constants';
import { BackIcon, WandIcon, SaveIcon, CheckIcon, CrossIcon, ShareIcon } from './icons';
import ShareButton from './ShareButton';
import FormattedText from './FormattedText';
import { useAppState } from '../store';

interface GospelMagicAssistantProps {
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
        <p className="text-slate-300 mt-4 text-lg">Seeking inspiration...</p>
        <p className="text-slate-400 text-sm">Crafting a message-driven routine.</p>
    </div>
);

const EXAMPLE_QUERIES = [
    "Create a routine for 'Torn and Restored Newspaper' about God's forgiveness.",
    "What Bible verse would fit with a 'Linking Rings' routine about unity?",
    "Brainstorm an effect to illustrate the story of the Loaves and Fishes.",
    "Help me script a message about 'new life in Christ' using a change bag.",
];

const GospelMagicAssistant: React.FC<GospelMagicAssistantProps> = ({ onIdeaSaved }) => {
    const { currentUser } = useAppState() as any;
    const [theme, setTheme] = useState('');
    const [passage, setPassage] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<string | null>(null);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
    const [lastQuery, setLastQuery] = useState('');

    const handleGenerate = async (searchQuery?: string) => {
        const currentTheme = searchQuery || theme;
        
        let finalPrompt = '';
        const themePart = currentTheme.trim();
        const passagePart = passage.trim();

        if (!themePart && !passagePart) {
            setError("Please enter a theme, effect, or Bible passage.");
            return;
        }

        if (passagePart && themePart) {
            finalPrompt = `Create a gospel magic routine based on the Bible passage "${passagePart}". The routine should also incorporate the theme: "${themePart}".`;
            setLastQuery(`${passagePart}: ${themePart}`);
        } else if (passagePart) {
            finalPrompt = `Create a gospel magic routine based on the Bible passage "${passagePart}".`;
            setLastQuery(passagePart);
        } else if (themePart) {
            finalPrompt = `Create a gospel magic routine based on the theme or effect: "${themePart}".`;
            setLastQuery(themePart);
        }

        setIsLoading(true);
        setError(null);
        setResult(null);
        setSaveStatus('idle');

        try {
            // FIX: pass currentUser as the 3rd argument to generateResponse
            const response = await generateResponse(finalPrompt, GOSPEL_MAGIC_SYSTEM_INSTRUCTION, currentUser || { email: '', membership: 'free', generationCount: 0, lastResetDate: '' });
            setResult(response);
        } catch (err) {
            setError(err instanceof Error ? err.message : "An unknown error occurred.");
        } finally {
            setIsLoading(false);
            setTheme('');
            setPassage('');
        }
    };

    const handleExampleClick = (exampleQuery: string) => {
        setTheme(exampleQuery);
        setPassage('');
        handleGenerate(exampleQuery);
    };

    const handleSave = () => {
        if (result) {
            const fullContent = `## Gospel Magic Idea: ${lastQuery}\n\n${result}`;
            saveIdea('text', fullContent, lastQuery);
            onIdeaSaved();
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 2000);
        }
    };

    return (
        <div className="flex-1 lg:grid lg:grid-cols-2 gap-6 overflow-y-auto p-4 md:p-6">
            {/* Control Panel */}
            <div className="flex flex-col">
                <h2 className="text-xl font-bold text-slate-300 mb-2">Creative Partner for Ministry</h2>
                <p className="text-slate-400 mb-4">Connect magic with message. Describe a theme or enter a Bible passage to develop a powerful Gospel magic routine.</p>
                
                <div className="space-y-4">
                     <div>
                        <label htmlFor="gospel-passage" className="block text-sm font-medium text-slate-300 mb-1">Bible Passage (Optional)</label>
                        <input
                            id="gospel-passage"
                            type="text"
                            value={passage}
                            onChange={(e) => { setPassage(e.target.value); setError(null); }}
                            placeholder="e.g., John 3:16 or Genesis 1:1-3"
                            className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
                        />
                    </div>
                    <div>
                        <label htmlFor="gospel-theme" className="block text-sm font-medium text-slate-300 mb-1">Theme, Effect, or Message (Optional)</label>
                        <textarea
                            id="gospel-theme"
                            rows={3}
                            value={theme}
                            onChange={(e) => { setTheme(e.target.value); setError(null); }}
                            placeholder="e.g., A routine about 'faith as a seed' using a growing flower effect."
                            className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
                        />
                    </div>
                    
                    <button
                        onClick={() => handleGenerate()}
                        disabled={isLoading || (!theme.trim() && !passage.trim())}
                        className="w-full py-3 mt-4 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed"
                    >
                        <WandIcon className="w-5 h-5" />
                        <span>Develop Routine</span>
                    </button>
                    {error && <p className="text-red-400 mt-2 text-sm text-center">{error}</p>}

                     <div className="pt-4">
                        <h3 className="text-sm font-semibold text-slate-400 mb-2 text-center">Or try an example...</h3>
                        <div className="w-full space-y-2">
                            {EXAMPLE_QUERIES.map(ex => (
                                <button
                                    key={ex}
                                    onClick={() => handleExampleClick(ex)}
                                    className="w-full p-2 bg-slate-800/50 hover:bg-purple-900/50 border border-slate-700 rounded-lg text-xs text-slate-300 text-left transition-colors"
                                >
                                    {ex}
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
                                title={`Gospel Magic Idea: ${lastQuery}`}
                                text={result}
                                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200 transition-colors"
                            >
                                <ShareIcon className="w-4 h-4" />
                                <span>Share</span>
                            </ShareButton>
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
                            <CrossIcon className="w-24 h-24 mx-auto mb-4" />
                            <p>Your generated routine ideas will appear here.</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default GospelMagicAssistant;
