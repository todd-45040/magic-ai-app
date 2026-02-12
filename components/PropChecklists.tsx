
import React, { useMemo, useRef, useState } from 'react';
import { generateResponse } from '../services/geminiService';
import { saveIdea } from '../services/ideasService';
import { ChecklistIcon, WandIcon, SaveIcon, CheckIcon, ShareIcon } from './icons';
import ShareButton from './ShareButton';
import { useAppState } from '../store';

interface PropChecklistsProps {
    onIdeaSaved: () => void;
}

const PROP_CHECKLIST_SYSTEM_INSTRUCTION = `You are an expert magic prop master and stage manager for professional magicians. Your task is to generate extremely detailed and practical checklists. When given a routine name or list of effects, create a comprehensive checklist covering three sections: Pre-Show Setup (what needs to be prepared hours or days before), Performance (items that need to be on the performer or table during the act), and Post-Show Reset (how to pack up and reset props for the next show). Be thorough and think about backups, consumables, and environment-specific items. Format the output clearly with headings.`;

const LoadingIndicator: React.FC = () => (
    <div className="flex flex-col items-center justify-center text-center p-8">
        <div className="relative">
            <WandIcon className="w-16 h-16 text-purple-400 animate-pulse" />
            <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
                 <div className="w-24 h-24 border-t-2 border-purple-300 rounded-full animate-spin"></div>
            </div>
        </div>
        <p className="text-slate-300 mt-4 text-lg">Building your checklist...</p>
        <p className="text-slate-400 text-sm">Thinking of every little detail.</p>
    </div>
);

const PropChecklists: React.FC<PropChecklistsProps> = ({ onIdeaSaved }) => {
  const { currentUser } = useAppState() as any; // currentUser added to AppState in some branches
  // FIX: This component needs access to the current user for usage tracking
  // In this app structure, we might need to pass it from MagicianMode
  
  const [routine, setRoutine] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const CONTEXT_CHIPS = useMemo(() => ([
    { label: 'Stage', emoji: '🎭' },
    { label: 'Close-Up', emoji: '🪄' },
    { label: 'Mentalism', emoji: '🧠' },
    { label: 'Family Show', emoji: '👨‍👩‍👧' },
    { label: 'Corporate', emoji: '🏢' },
    { label: 'Gospel', emoji: '⛪' },
    { label: 'Parlor', emoji: '🎪' },
  ]), []);
  const [selectedContexts, setSelectedContexts] = useState<string[]>([]);

  const toggleContext = (label: string) => {
    setSelectedContexts((prev) => (
      prev.includes(label)
        ? prev.filter((x) => x !== label)
        : [...prev, label]
    ));
  };

  const handleGenerate = async () => {
    if (!routine.trim()) {
      setError("Please describe the routine or show.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setChecklist(null);
    setSaveStatus('idle');

    const contextLine = selectedContexts.length
      ? `Context: ${selectedContexts.join(', ')}.`
      : '';
    const prompt = `${contextLine}\nGenerate a prop and setup checklist for the following: "${routine}".`.trim();
    try {
      // FIX: pass currentUser as the 3rd argument to generateResponse. 
      // Assuming user is available via useAppState or similar. 
      // For this fix, let's use a dummy user if not found to avoid crash, but ideally pass from parent.
      const response = await generateResponse(prompt, PROP_CHECKLIST_SYSTEM_INSTRUCTION, currentUser || { email: '', membership: 'free', generationCount: 0, lastResetDate: '' });
      setChecklist(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = () => {
    if (checklist) {
      const fullContent = `## Prop Checklist for: ${routine}\n\n${checklist}`;
      saveIdea('text', fullContent);
      onIdeaSaved();
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setRoutine(text);
      };
      reader.readAsText(file);
    }
    if (e.target) e.target.value = ''; // Allow re-uploading the same file
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Control Panel */}
        <div className="flex flex-col">
            <h2 className="text-xl font-bold text-slate-300 mb-2">Routine Blueprint</h2>
            <p className="text-slate-400 mb-4">Describe your routine, theme, or full show concept. The Wizard will generate a structured production checklist including props, staging notes, reset considerations, and performance risks.</p>
            
            <div className="space-y-4">
                <div>
                    <div className="flex justify-between items-baseline mb-1">
                        <label htmlFor="routine-description" className="block text-sm font-medium text-slate-300">Routine or Show Description</label>
                        <div className="flex items-center gap-2">
                             <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="px-2 py-0.5 text-xs font-semibold text-purple-400 hover:text-purple-300 transition-colors"
                            >
                                Upload Script...
                            </button>
                            {routine && (
                                <button
                                    type="button"
                                    onClick={() => setRoutine('')}
                                    className="px-2 py-0.5 text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-700 rounded-md transition-colors"
                                >
                                    Clear
                                </button>
                            )}
                        </div>
                    </div>
                     <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        className="hidden"
                        accept=".txt,.md"
                    />
                    {/* Context chips */}
                    <div className="mb-3">
                      <p className="text-xs font-semibold text-slate-400 mb-2">Context (optional)</p>
                      <div className="flex flex-wrap gap-2">
                        {CONTEXT_CHIPS.map((chip) => {
                          const isActive = selectedContexts.includes(chip.label);
                          return (
                            <button
                              key={chip.label}
                              type="button"
                              onClick={() => toggleContext(chip.label)}
                              className={
                                `px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ` +
                                (isActive
                                  ? 'bg-purple-600/20 border-purple-500 text-purple-200'
                                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500')
                              }
                            >
                              <span className="mr-1">{chip.emoji}</span>
                              <span>{chip.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <textarea
                        id="routine-description"
                        rows={8}
                        value={routine}
                        onChange={(e) => { setRoutine(e.target.value); setError(null); }}
                        placeholder="Describe your routine, theme, or full show concept...\n\nExample: A 5-minute silent multiplying balls routine with a musical score.\nExample: A 30-minute corporate stage act: card manipulation, a mind-reading segment, and linking rings."
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
                    />
                </div>
                
                <button
                    onClick={handleGenerate}
                    disabled={isLoading || !routine.trim()}
                    className="w-full py-3 mt-4 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed"
                >
                    <WandIcon className="w-5 h-5" />
                    <span>Generate Checklist</span>
                </button>
                {error && <p className="text-red-400 mt-2 text-sm text-center">{error}</p>}
            </div>
        </div>

        {/* Checklist Display Area */}
        <div className="flex flex-col bg-slate-900/50 rounded-lg border border-slate-800 min-h-[300px]">
            {isLoading ? (
                <div className="flex-1 flex items-center justify-center">
                    <LoadingIndicator />
                </div>
            ) : checklist ? (
                 <div className="relative group flex-1 flex flex-col">
                    <div className="p-4 overflow-y-auto">
                        <pre className="whitespace-pre-wrap break-words text-slate-200 font-sans text-sm">{checklist}</pre>
                    </div>
                    <div className="sticky bottom-0 right-0 mt-auto p-2 bg-slate-900/50 flex justify-end gap-2 border-t border-slate-800">
                         <ShareButton
                            title={`Prop Checklist for: ${routine}`}
                            text={checklist}
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
                        <div className="relative mx-auto mb-4 w-fit">
                          <ChecklistIcon className="w-20 h-20 mx-auto text-slate-500/80 animate-pulse" />
                          <div className="absolute -inset-2 rounded-full bg-purple-500/10 blur-xl opacity-60" />
                        </div>
                        <p className="text-slate-300 font-semibold">Your production checklist will appear here.</p>
                        <p className="text-slate-500 text-sm mt-1">Includes props, staging notes, risk alerts, reset flow, and performance cues.</p>
                    </div>
                </div>
            )}
        </div>
    </div>
  );
};

export default PropChecklists;
