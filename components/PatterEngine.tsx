import React, { useState } from 'react';
import { generateResponse } from '../services/geminiService';
import { saveIdea } from '../services/ideasService';
import { PATTER_ENGINE_SYSTEM_INSTRUCTION } from '../constants';
import { BookIcon, WandIcon, SaveIcon, CheckIcon, CopyIcon, ShareIcon } from './icons';
import ShareButton from './ShareButton';
// FIX: Import User type for props
import type { User } from '../types';

interface PatterEngineProps {
  onIdeaSaved: () => void;
  user: User;
}

const LoadingIndicator: React.FC = () => (
  <div className="flex flex-col items-center justify-center text-center p-8">
    <div className="relative">
      <WandIcon className="w-16 h-16 text-purple-400 animate-pulse" />
      <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
        <div className="w-24 h-24 border-t-2 border-purple-300 rounded-full animate-spin"></div>
      </div>
    </div>
    <p className="text-slate-300 mt-4 text-lg">Writing your scripts...</p>
    <p className="text-slate-400 text-sm">Crafting the perfect words for your performance.</p>
  </div>
);

const TONES = ['Comedic', 'Mysterious', 'Dramatic', 'Storytelling'];

const PatterEngine: React.FC<PatterEngineProps> = ({ onIdeaSaved, user }) => {
  const [effectDescription, setEffectDescription] = useState('');
  const [selectedTones, setSelectedTones] = useState<string[]>(['Comedic', 'Mysterious']);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');

  const handleToneToggle = (tone: string) => {
    setSelectedTones(prev => (prev.includes(tone) ? prev.filter(t => t !== tone) : [...prev, tone]));
  };

  const handleGenerate = async () => {
    if (!effectDescription.trim()) {
      setError('Please describe the magic effect.');
      return;
    }
    if (selectedTones.length === 0) {
      setError('Please select at least one tone.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);
    setSaveStatus('idle');
    setCopyStatus('idle');

    const prompt = `Generate patter for the effect "${effectDescription}" with the following tones: ${selectedTones.join(
      ', '
    )}.`;

    try {
      const response = await generateResponse(prompt, PATTER_ENGINE_SYSTEM_INSTRUCTION, user);
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  const fullContentForSave = () => `## Patter Variations for: ${effectDescription}

${result ?? ''}`;
  const fullContentForCopy = () => `Patter Variations for: ${effectDescription}

${result ?? ''}`;

  const handleSave = async () => {
    if (!result) return;

    try {
      const fullContent = fullContentForSave();
      await saveIdea('text', fullContent);
      onIdeaSaved();
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      console.error('Save idea failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to save idea.');
    }
  };

  const handleCopy = async () => {
    if (!result) return;

    try {
      const fullContent = fullContentForCopy();

      // Clipboard API can fail on some browsers/contexts; handle gracefully.
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(fullContent);
      } else {
        // Fallback: temporary textarea
        const ta = document.createElement('textarea');
        ta.value = fullContent;
        ta.style.position = 'fixed';
        ta.style.top = '-9999px';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }

      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 1500);
    } catch (err) {
      console.error('Copy failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to copy.');
    }
  };

  return (
    <main className="flex-1 overflow-y-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
      {/* Control Panel */}
      <div className="flex flex-col">
        <h2 className="text-xl font-bold text-slate-300 mb-2">The Patter Engine</h2>
        <p className="text-slate-400 mb-4">
          Generate multiple scripts for any effect. Describe your trick, choose your desired tones, and get performance-ready
          patter.
        </p>

        <div className="space-y-4">
          <div>
            <label htmlFor="effect-description" className="block text-sm font-medium text-slate-300 mb-1">
              Effect Description
            </label>
            <textarea
              id="effect-description"
              rows={5}
              value={effectDescription}
              onChange={e => {
                setEffectDescription(e.target.value);
                setError(null);
              }}
              placeholder="e.g., A spectator's signed card vanishes from the deck and reappears inside a lemon."
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Select Tones</label>
            <div className="grid grid-cols-2 gap-2">
              {TONES.map(tone => (
                <button
                  key={tone}
                  onClick={() => handleToneToggle(tone)}
                  className={`py-2 px-3 rounded-md transition-colors text-sm font-semibold ${
                    selectedTones.includes(tone)
                      ? 'bg-purple-600 text-white'
                      : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                  }`}
                >
                  {tone}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={isLoading || !effectDescription.trim() || selectedTones.length === 0}
            className="w-full py-3 mt-4 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed"
          >
            <WandIcon className="w-5 h-5" />
            <span>Generate Patter</span>
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
                title={`Patter Variations for: ${effectDescription}`}
                text={fullContentForCopy()}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200 transition-colors"
              >
                <ShareIcon className="w-4 h-4" />
                <span>Share</span>
              </ShareButton>

              {/* Single Copy button (no duplicates) */}
              <button
                onClick={handleCopy}
                disabled={copyStatus === 'copied'}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200 disabled:cursor-default transition-colors"
                title="Copy patter to clipboard"
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
                title="Save this patter to your Ideas"
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
              <BookIcon className="w-24 h-24 mx-auto mb-4" />
              <p>Your generated patter scripts will appear here.</p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
};

export default PatterEngine;
