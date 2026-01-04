
import React, { useState, useMemo } from 'react';
import { generateResponse } from '../services/geminiService';
import { saveIdea } from '../services/ideasService';
import { MARKETING_ASSISTANT_SYSTEM_INSTRUCTION } from '../constants';
import { MegaphoneIcon, WandIcon, SaveIcon, CheckIcon, ShareIcon, UsersIcon, StageCurtainsIcon } from './icons';
import ShareButton from './ShareButton';
import type { User } from '../types';

interface MarketingCampaignProps {
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
        <p className="text-slate-300 mt-4 text-lg">Building your campaign...</p>
        <p className="text-slate-400 text-sm">Crafting the perfect promotional materials.</p>
    </div>
);

const AUDIENCE_CATEGORIES = ['Corporate', 'Family Show', 'Private Party', 'Theater / Stage', 'Festival / Fair', 'Strolling / Close-up'];
const STYLE_CHOICES = ['Comedic', 'Mysterious', 'Dramatic', 'Elegant', 'Storytelling', 'Interactive'];


const MarketingCampaign: React.FC<MarketingCampaignProps> = ({ user, onIdeaSaved }) => {
    const [showTitle, setShowTitle] = useState('');
    const [selectedAudiences, setSelectedAudiences] = useState<string[]>([]);
    const [customAudience, setCustomAudience] = useState('');
    const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
    const [keyThemes, setKeyThemes] = useState('');

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<string | null>(null);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
    
    const handleAudienceToggle = (audience: string) => {
        setSelectedAudiences(prev => 
            prev.includes(audience) ? prev.filter(a => a !== audience) : [...prev, audience]
        );
    };

    const handleStyleToggle = (style: string) => {
        setSelectedStyles(prev => 
            prev.includes(style) ? prev.filter(s => s !== style) : [...prev, style]
        );
    };

    const isFormValid = useMemo(() => {
        return showTitle.trim() !== '' && (selectedAudiences.length > 0 || customAudience.trim() !== '');
    }, [showTitle, selectedAudiences, customAudience]);


    const handleGenerate = async () => {
        if (!isFormValid) {
            setError("Please provide at least a Show Title and select/enter a Target Audience.");
            return;
        }
        
        setIsLoading(true);
        setError(null);
        setResult(null);
        setSaveStatus('idle');

        const allAudiences = [...selectedAudiences];
        if (customAudience.trim()) {
            allAudiences.push(customAudience.trim());
        }

        const prompt = `
            Generate a marketing campaign toolkit for the following magic show:
            - **Show Title:** ${showTitle}
            - **Target Audience:** ${allAudiences.join(', ')}
            - **Performance Style/Persona:** ${selectedStyles.join(', ') || 'Not specified'}
            - **Key Effects or Themes:** ${keyThemes || 'Not specified'}
        `;
        
        try {
          // FIX: Pass the user object to generateResponse as the 3rd argument.
          const response = await generateResponse(prompt, MARKETING_ASSISTANT_SYSTEM_INSTRUCTION, user);
          setResult(response);
        } catch (err) {
          setError(err instanceof Error ? err.message : "An unknown error occurred.");
        } finally {
          setIsLoading(false);
        }
    };
  
    const handleSave = () => {
        if (result) {
            const fullContent = `## Marketing Campaign for: ${showTitle}\n\n${result}`;
            saveIdea('text', fullContent, `Marketing for ${showTitle}`);
            onIdeaSaved();
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 2000);
        }
    };

    return (
        <main className="flex-1 overflow-y-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
            {/* Control Panel */}
            <div className="flex flex-col">
                <h2 className="text-xl font-bold text-slate-300 mb-2">Marketing Campaign Generator</h2>
                <p className="text-slate-400 mb-4">Fill in your show details to generate a complete promotional toolkit, including press releases, social media posts, and more.</p>
                
                <div className="space-y-6">
                    <div>
                        <label htmlFor="show-title" className="block text-sm font-medium text-slate-300 mb-1">Show Title*</label>
                        <input id="show-title" type="text" value={showTitle} onChange={(e) => setShowTitle(e.target.value)} placeholder="e.g., Echoes of the Enchanted" className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white" />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                            <UsersIcon className="w-5 h-5 text-slate-400" />
                            Target Audience*
                        </label>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {AUDIENCE_CATEGORIES.map(cat => (
                                <button key={cat} onClick={() => handleAudienceToggle(cat)} className={`py-2 px-3 rounded-md transition-colors text-sm font-semibold ${ selectedAudiences.includes(cat) ? 'bg-purple-600 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300' }`}>
                                    {cat}
                                </button>
                            ))}
                        </div>
                        <input type="text" value={customAudience} onChange={e => setCustomAudience(e.target.value)} placeholder="Other (please specify)..." className="w-full mt-2 px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white text-sm" />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                            <StageCurtainsIcon className="w-5 h-5 text-slate-400" />
                            Performance Style
                        </label>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {STYLE_CHOICES.map(style => (
                                 <button key={style} onClick={() => handleStyleToggle(style)} className={`py-2 px-3 rounded-md transition-colors text-sm font-semibold ${ selectedStyles.includes(style) ? 'bg-purple-600 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300' }`}>
                                    {style}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label htmlFor="key-themes" className="block text-sm font-medium text-slate-300 mb-1">Key Effects or Themes (Optional)</label>
                        <textarea id="key-themes" rows={3} value={keyThemes} onChange={(e) => setKeyThemes(e.target.value)} placeholder="e.g., Classic sleight of hand, modern mind reading, story of a magical artifact" className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white" />
                    </div>
                    
                    <button
                        onClick={handleGenerate}
                        disabled={isLoading || !isFormValid}
                        className="w-full py-3 mt-4 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed"
                    >
                        <WandIcon className="w-5 h-5" />
                        <span>Generate Campaign</span>
                    </button>
                    {error && <p className="text-red-400 mt-2 text-sm text-center">{error}</p>}
                </div>
            </div>

            {/* Result Display Area */}
            <div className="flex flex-col bg-slate-900/50 rounded-lg border border-slate-800 min-h-[300px]">
                {isLoading ? (
                    <div className="flex-1 flex items-center justify-center">
                        <LoadingIndicator />
                    </div>
                ) : result ? (
                     <div className="relative group flex-1 flex flex-col">
                        <div className="p-4 overflow-y-auto">
                            <pre className="whitespace-pre-wrap break-words text-slate-200 font-sans text-sm">{result}</pre>
                        </div>
                        <div className="mt-auto p-2 bg-slate-900/50 flex justify-end gap-2 border-t border-slate-800">
                            <ShareButton
                                title={`Marketing Campaign for: ${showTitle}`}
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
                            <MegaphoneIcon className="w-24 h-24 mx-auto mb-4" />
                            <p>Your generated marketing toolkit will appear here.</p>
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
};

export default MarketingCampaign;
