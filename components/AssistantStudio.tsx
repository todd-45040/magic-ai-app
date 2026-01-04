
import React, { useState } from 'react';
import { generateResponse } from '../services/geminiService';
import { saveIdea } from '../services/ideasService';
import { ASSISTANT_STUDIO_SYSTEM_INSTRUCTION } from '../constants';
import { UsersIcon, WandIcon, SaveIcon, CheckIcon, ShareIcon } from './icons';
import ShareButton from './ShareButton';
import FormattedText from './FormattedText';
import type { User } from '../types';

interface AssistantStudioProps {
    user: User;
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
        <p className="text-slate-300 mt-4 text-lg">Consulting with the director...</p>
        <p className="text-slate-400 text-sm">Crafting the perfect performance notes.</p>
    </div>
);

type Mode = 'collaboration' | 'solo';

const AssistantStudio: React.FC<AssistantStudioProps> = ({ user, onIdeaSaved }) => {
    const [mode, setMode] = useState<Mode>('collaboration');
    
    // Form State
    const [collaborationInput, setCollaborationInput] = useState('');
    const [soloSkills, setSoloSkills] = useState('');
    const [soloStyle, setSoloStyle] = useState('');

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<string | null>(null);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
    const [lastQuery, setLastQuery] = useState('');

    const handleGenerate = async () => {
        let prompt = '';
        let queryTitle = '';

        if (mode === 'collaboration') {
            if (!collaborationInput.trim()) {
                setError("Please describe the routine you're working on.");
                return;
            }
            prompt = `Provide collaboration coaching for a magician's assistant performing the following routine: "${collaborationInput}"`;
            queryTitle = `Collaboration notes for: ${collaborationInput}`;
        } else { // mode === 'solo'
            if (!soloSkills.trim()) {
                setError("Please describe the assistant's skills.");
                return;
            }
            prompt = `Brainstorm a solo act for a magician's assistant with the following skills: "${soloSkills}". The desired performance style is: "${soloStyle || 'not specified'}."`;
            queryTitle = `Solo act idea for assistant with skills: ${soloSkills}`;
        }

        setLastQuery(queryTitle);
        setIsLoading(true);
        setError(null);
        setResult(null);
        setSaveStatus('idle');

        try {
            // FIX: Pass the user object to generateResponse as the 3rd argument.
            const response = await generateResponse(prompt, ASSISTANT_STUDIO_SYSTEM_INSTRUCTION, user);
            setResult(response);
        } catch (err) {
            setError(err instanceof Error ? err.message : "An unknown error occurred.");
        } finally {
            setIsLoading(false);
        }
    };
  
    const handleSave = () => {
        if (result) {
            const fullContent = `## ${lastQuery}\n\n${result}`;
            saveIdea('text', fullContent, lastQuery);
            onIdeaSaved();
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 2000);
        }
    };
    
    const isGenerateDisabled = isLoading || (mode === 'collaboration' && !collaborationInput.trim()) || (mode === 'solo' && !soloSkills.trim());

    return (
        <main className="flex-1 overflow-y-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
            {/* Control Panel */}
            <div className="flex flex-col">
                <h2 className="text-xl font-bold text-slate-300 mb-2">Assistant's Studio</h2>
                <p className="text-slate-400 mb-4">A creative space for the magician's indispensable partner. Get coaching on collaboration or develop a show-stopping solo act.</p>
                
                <div className="bg-slate-700 p-1 rounded-md flex items-center mb-4">
                    <button onClick={() => setMode('collaboration')} className={`flex-1 py-2 text-sm font-medium rounded transition-colors ${mode === 'collaboration' ? 'bg-purple-600 text-white' : 'text-slate-300 hover:bg-slate-600'}`}>Collaboration Coaching</button>
                    <button onClick={() => setMode('solo')} className={`flex-1 py-2 text-sm font-medium rounded transition-colors ${mode === 'solo' ? 'bg-purple-600 text-white' : 'text-slate-300 hover:bg-slate-600'}`}>Solo Act Development</button>
                </div>

                <div className="space-y-4">
                    {mode === 'collaboration' ? (
                        <div>
                            <label htmlFor="collab-input" className="block text-sm font-medium text-slate-300 mb-1">Describe the Routine</label>
                            <textarea id="collab-input" rows={8} value={collaborationInput} onChange={(e) => setCollaborationInput(e.target.value)} placeholder="e.g., The magician performs a cup and balls routine. My job is to hand them the props and manage the audience volunteer on stage." className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white" />
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div><label htmlFor="solo-skills" className="block text-sm font-medium text-slate-300 mb-1">Assistant's Skills*</label><textarea id="solo-skills" rows={4} value={soloSkills} onChange={(e) => setSoloSkills(e.target.value)} placeholder="e.g., Quick hands, experience in dance, good comedic timing, skilled with silks." className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white" /></div>
                            <div><label htmlFor="solo-style" className="block text-sm font-medium text-slate-300 mb-1">Desired Performance Style</label><input id="solo-style" type="text" value={soloStyle} onChange={(e) => setSoloStyle(e.target.value)} placeholder="e.g., Elegant and silent, or funny and talkative" className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white" /></div>
                        </div>
                    )}
                    <button onClick={handleGenerate} disabled={isGenerateDisabled} className="w-full py-3 mt-4 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed">
                        <WandIcon className="w-5 h-5" />
                        <span>Generate Ideas</span>
                    </button>
                    {error && <p className="text-red-400 mt-2 text-sm text-center">{error}</p>}
                </div>
            </div>

            {/* Result Display Area */}
            <div className="flex flex-col bg-slate-900/50 rounded-lg border border-slate-800 min-h-[300px]">
                {isLoading ? (
                    <div className="flex-1 flex items-center justify-center"><LoadingIndicator /></div>
                ) : result ? (
                     <div className="relative group flex-1 flex flex-col">
                        <div className="p-4 overflow-y-auto"><FormattedText text={result} /></div>
                        <div className="mt-auto p-2 bg-slate-900/50 flex justify-end gap-2 border-t border-slate-800">
                            <ShareButton title={lastQuery} text={result} className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200"><ShareIcon className="w-4 h-4" /><span>Share</span></ShareButton>
                            <button onClick={handleSave} disabled={saveStatus === 'saved'} className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200">{saveStatus === 'saved' ? <><CheckIcon className="w-4 h-4 text-green-400" /><span>Saved!</span></> : <><SaveIcon className="w-4 h-4" /><span>Save Idea</span></>}</button>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-center text-slate-500 p-4">
                        <div>
                            <UsersIcon className="w-24 h-24 mx-auto mb-4" />
                            <p>Your generated coaching notes and routine ideas will appear here.</p>
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
};

export default AssistantStudio;
