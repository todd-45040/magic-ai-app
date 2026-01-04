
import React, { useState } from 'react';
import { generateResponse } from '../services/geminiService';
import { saveIdea } from '../services/ideasService';
import { EFFECT_GENERATOR_SYSTEM_INSTRUCTION } from '../constants';
import { LightbulbIcon, WandIcon, SaveIcon, CheckIcon, CopyIcon, ShareIcon } from './icons';
import ShareButton from './ShareButton';
import { useAppState } from '../store';

interface EffectGeneratorProps {
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
        <p className="text-slate-300 mt-4 text-lg">Brewing creative ideas...</p>
        <p className="text-slate-400 text-sm">Your next masterpiece is moments away.</p>
    </div>
);

const EffectGenerator: React.FC<EffectGeneratorProps> = ({ onIdeaSaved }) => {
  const { currentUser } = useAppState() as any;
  const [items, setItems] = useState(['', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ideas, setIdeas] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');

  const handleItemChange = (index: number, value: string) => {
    const newItems = [...items];
    newItems[index] = value;
    setItems(newItems);
    setError(null);
  };

  const handleGenerate = async () => {
    const validItems = items.map(item => item.trim()).filter(item => item !== '');
    if (validItems.length === 0) {
      setError("Please enter at least one item.");
      return;
    }
    
    setIsLoading(true);
    setError(null);
    setIdeas(null);
    setSaveStatus('idle');
    setCopyStatus('idle');

    const itemList = validItems.join(', ');
    const prompt = `Generate magic effect ideas using the following items: ${itemList}.`;
    
    try {
      // FIX: pass currentUser as the 3rd argument to generateResponse
      const response = await generateResponse(prompt, EFFECT_GENERATOR_SYSTEM_INSTRUCTION, currentUser || { email: '', membership: 'free', generationCount: 0, lastResetDate: '' });
      setIdeas(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred.");
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleSave = () => {
    if (ideas) {
      const itemList = items.map(item => item.trim()).filter(item => item !== '').join(', ');
      const fullContent = `## Effect Ideas for: ${itemList}\n\n${ideas}`;
      saveIdea('text', fullContent);
      onIdeaSaved();
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }
  };

  const handleCopy = () => {
    if (ideas) {
      const itemList = items.map(item => item.trim()).filter(item => item !== '').join(', ');
      const fullContent = `Effect Ideas for: ${itemList}\n\n${ideas}`;
      navigator.clipboard.writeText(fullContent);
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 2000);
    }
  }

  return (
    <main className="flex-1 overflow-y-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
        {/* Control Panel */}
        <div className="flex flex-col">
            <h2 className="text-xl font-bold text-slate-300 mb-2">The Effect Engine</h2>
            <p className="text-slate-400 mb-4">Combine everyday objects to invent extraordinary magic. Enter up to four items to see what's possible.</p>
            
            <div className="space-y-3">
                {[0, 1, 2, 3].map(index => (
                    <div key={index}>
                        <label htmlFor={`item-${index}`} className="block text-sm font-medium text-slate-400 mb-1">Item {index + 1}</label>
                        <input
                            id={`item-${index}`}
                            type="text"
                            value={items[index]}
                            onChange={(e) => handleItemChange(index, e.target.value)}
                            placeholder={index === 0 ? "e.g., A key" : index === 1 ? "e.g., A rubber band" : "..."}
                            className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
                        />
                    </div>
                ))}
                
                <button
                    onClick={handleGenerate}
                    disabled={isLoading || items.every(item => item.trim() === '')}
                    className="w-full py-3 mt-4 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed"
                >
                    <WandIcon className="w-5 h-5" />
                    <span>Generate Ideas</span>
                </button>
                {error && <p className="text-red-400 mt-2 text-sm text-center">{error}</p>}
            </div>
        </div>

        {/* Ideas Display Area */}
        <div className="flex flex-col bg-slate-900/50 rounded-lg border border-slate-800 min-h-[300px]">
            {isLoading ? (
                <div className="flex-1 flex items-center justify-center">
                    <LoadingIndicator />
                </div>
            ) : ideas ? (
                 <div className="relative group flex-1 flex flex-col">
                    <div className="p-4">
                        <pre className="whitespace-pre-wrap break-words text-slate-200 font-sans text-sm">{ideas}</pre>
                    </div>
                    <div className="mt-auto p-2 bg-slate-900/50 flex justify-end gap-2 border-t border-slate-800">
                        <ShareButton
                            title={`Magic Effect Ideas for: ${items.map(item => item.trim()).filter(item => item !== '').join(', ')}`}
                            text={ideas}
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
                        <LightbulbIcon className="w-24 h-24 mx-auto mb-4" />
                        <p>Your generated effect ideas will appear here.</p>
                    </div>
                </div>
            )}
        </div>
    </main>
  );
};

export default EffectGenerator;
