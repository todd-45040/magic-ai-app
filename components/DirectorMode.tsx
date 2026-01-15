
import React, { useState } from 'react';
import { Type } from "@google/genai";
import { saveIdea } from '../services/ideasService';
import { addShow, addTaskToShow } from '../services/showsService';
import { DIRECTOR_MODE_SYSTEM_INSTRUCTION } from '../constants';
import type { DirectorModeResponse } from '../types';
import { StageCurtainsIcon, WandIcon, SaveIcon, CheckIcon, ShareIcon, ChecklistIcon } from './icons';
import ShareButton from './ShareButton';
import { generateStructuredResponse } from '../services/geminiService';


interface DirectorModeProps {
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
        <p className="text-slate-300 mt-4 text-lg">Directing your masterpiece...</p>
        <p className="text-slate-400 text-sm">Structuring the narrative and flow.</p>
    </div>
);

const DirectorMode: React.FC<DirectorModeProps> = ({ onIdeaSaved }) => {
    // Form State
    const [showTitle, setShowTitle] = useState('');
    const [showLength, setShowLength] = useState('');
    // Audience: quick-select chips + optional custom text
    const [audienceType, setAudienceType] = useState(''); // custom audience text
    const [audienceChips, setAudienceChips] = useState<string[]>([]);

    // Theme/Style
    const [theme, setTheme] = useState('');

    // Advanced Options (optional)
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [pacing, setPacing] = useState<'Relaxed' | 'Balanced' | 'High-energy' | ''>('');
    const [comedyLevel, setComedyLevel] = useState<'Low' | 'Medium' | 'High' | ''>('');
    const [participation, setParticipation] = useState<'Low' | 'Medium' | 'High' | ''>('');
    const [volunteersOk, setVolunteersOk] = useState<'Yes' | 'No' | ''>('');
    const [constraints, setConstraints] = useState('');

    // Control State
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPlan, setShowPlan] = useState<DirectorModeResponse | null>(null);
    const [isAddedToPlanner, setIsAddedToPlanner] = useState(false);
    
    const computedAudience = (() => {
        const picked = audienceChips.join(', ');
        const custom = audienceType.trim();
        if (picked && custom) return `${picked}, ${custom}`;
        return picked || custom;
    })();

    const isFormValid = showTitle.trim() && showLength && computedAudience && theme.trim();

    const showLengthPresets = [30, 45, 60, 90];
    const audiencePresets = [
        'Families',
        'Kids',
        'Corporate',
        'Adults',
        'Seniors',
        'College',
        'School Assembly',
    ];

    const toggleAudienceChip = (label: string) => {
        setAudienceChips((prev) =>
            prev.includes(label) ? prev.filter((x) => x !== label) : [...prev, label]
        );
    };

    const normalizeTitle = (value: string) => {
        // Lightweight title casing (does not try to be linguistically perfect)
        const v = value.trim();
        if (!v) return '';
        return v
            .split(/\s+/)
            .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
            .join(' ');
    };

    const directorResponseSchema = {
        type: Type.OBJECT,
        properties: {
            show_title: { type: Type.STRING },
            show_description: { type: Type.STRING },
            segments: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING },
                        description: { type: Type.STRING },
                        suggested_effects: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    type: { type: Type.STRING },
                                    rationale: { type: Type.STRING },
                                },
                                required: ['type', 'rationale'],
                            },
                        },
                    },
                    required: ['title', 'description', 'suggested_effects'],
                },
            },
        },
        required: ['show_title', 'show_description', 'segments'],
    };

    const handleGenerate = async () => {
        if (!isFormValid) {
            setError("Please fill in all required fields.");
            return;
        }
        
        setIsLoading(true);
        setError(null);
        setShowPlan(null);
        setIsAddedToPlanner(false);

        const prompt = `
            Please generate a show plan with the following details:
            - Show Title: ${showTitle}
            - Desired Length (minutes): ${showLength}
            - Target Audience: ${computedAudience}
            - Overall Theme/Style: ${theme}
            ${pacing ? `- Pacing: ${pacing}` : ''}
            ${comedyLevel ? `- Comedy Level: ${comedyLevel}` : ''}
            ${participation ? `- Audience Participation Level: ${participation}` : ''}
            ${volunteersOk ? `- Volunteers OK: ${volunteersOk}` : ''}
            ${constraints.trim() ? `- Constraints / Special Notes: ${constraints.trim()}` : ''}
        `;
        
        try {
          const resultJson = await generateStructuredResponse(
            prompt,
            DIRECTOR_MODE_SYSTEM_INSTRUCTION,
            directorResponseSchema
          );
          setShowPlan(resultJson as DirectorModeResponse);
        } catch (err) {
          console.error(err);
          setError(err instanceof Error ? err.message : "An unknown error occurred while generating the plan. The AI may have returned an invalid structure. Please try again.");
        } finally {
          setIsLoading(false);
        }
    };
  
    // FIX: Marked handleAddToPlanner as async to resolve the missing await error on addShow().
    const handleAddToPlanner = async () => {
        if (!showPlan) return;
        // FIX: Added await to correctly resolve the Promise returned by addShow() and resolve the Property 'find' does not exist error.
        const newShows = await addShow(showPlan.show_title, showPlan.show_description);
        const newShow = newShows.find(s => s.title === showPlan.show_title);
        if (!newShow) {
            setError("Failed to create the new show in the planner.");
            return;
        }

        let showsWithTasks = newShows;
        for (const segment of showPlan.segments) {
            for (const effect of segment.suggested_effects) {
                const taskData = {
                    title: `${segment.title}: ${effect.type}`,
                    notes: effect.rationale,
                    priority: 'Medium' as const
                };
                // FIX: Added await for sequential task creation in a loop.
                showsWithTasks = await addTaskToShow(newShow.id, taskData);
            }
        }
        setIsAddedToPlanner(true);
        onIdeaSaved();
    };

    const handleStartOver = () => {
        setShowPlan(null);
        setIsAddedToPlanner(false);
        setError(null);
        // Optional: clear form fields
        // setShowTitle(''); setShowLength(''); setAudienceType(''); setTheme('');
    };

    if (isLoading) {
        return <div className="flex-1 flex items-center justify-center"><LoadingIndicator /></div>;
    }
    
    if (showPlan) {
        return (
            <div className="flex-1 flex flex-col overflow-y-auto p-4 md:p-6 animate-fade-in">
                <h2 className="text-3xl font-bold text-white font-cinzel">{showPlan.show_title}</h2>
                <p className="text-slate-400 mt-2 mb-6">{showPlan.show_description}</p>
                
                <div className="space-y-4">
                    {showPlan.segments.map((segment, index) => (
                        <div key={index} className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                            <h3 className="text-xl font-bold text-[#E6C77A] font-cinzel">{segment.title}</h3>
                            <p className="text-sm text-slate-300 mt-1 mb-3">{segment.description}</p>
                            <div className="space-y-2 border-t border-slate-700/50 pt-3">
                                {segment.suggested_effects.map((effect, effIndex) => (
                                    <div key={effIndex} className="bg-slate-900/50 p-3 rounded-md">
                                        <h4 className="font-semibold text-white">{effect.type}</h4>
                                        <p className="text-xs text-slate-400">{effect.rationale}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
                    <button onClick={handleStartOver} className="px-6 py-2 bg-slate-600 hover:bg-slate-700 rounded-md text-white font-bold transition-colors">Start Over</button>
                    <button onClick={handleAddToPlanner} disabled={isAddedToPlanner} className="px-6 py-2 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold transition-colors disabled:bg-green-700 disabled:cursor-not-allowed flex items-center gap-2">
                        {isAddedToPlanner ? <CheckIcon className="w-5 h-5" /> : <ChecklistIcon className="w-5 h-5" />}
                        <span>{isAddedToPlanner ? 'Added to Show Planner!' : 'Add to Show Planner'}</span>
                    </button>
                </div>
            </div>
        );
    }

    return (
        <main className="flex-1 overflow-y-auto p-4 md:p-6 flex items-center justify-center animate-fade-in">
            <div className="w-full max-w-lg">
                <div className="text-center">
                    <StageCurtainsIcon className="w-16 h-16 text-purple-400 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold text-slate-300 mb-2 font-cinzel">Director Mode</h2>
                    <p className="text-slate-400 mb-6">Let's design your next show. Provide the core details, and the AI will architect a complete show structure for you.</p>
                </div>
                
                <div className="space-y-4 bg-slate-800/50 p-6 rounded-lg border border-slate-700">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="show-title" className="block text-sm font-medium text-slate-300 mb-1">Show Title</label>
                            <input
                                id="show-title"
                                type="text"
                                value={showTitle}
                                onChange={(e) => setShowTitle(e.target.value)}
                                onBlur={() => setShowTitle((v) => normalizeTitle(v))}
                                placeholder="e.g., Mysteries of the Mind"
                                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-yellow-500/30 focus:border-yellow-500/40"
                            />
                        </div>

                        <div>
                            <label htmlFor="show-length" className="block text-sm font-medium text-slate-300 mb-1">Show Length (min)</label>
                            <input
                                id="show-length"
                                type="number"
                                inputMode="numeric"
                                min={5}
                                max={240}
                                value={showLength}
                                onChange={(e) => setShowLength(e.target.value)}
                                placeholder="e.g., 45"
                                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-yellow-500/30 focus:border-yellow-500/40"
                            />
                            <div className="mt-2 flex flex-wrap gap-2">
                                {showLengthPresets.map((m) => (
                                    <button
                                        key={m}
                                        type="button"
                                        onClick={() => setShowLength(String(m))}
                                        className={
                                            (showLength === String(m)
                                                ? 'bg-yellow-500/20 border-yellow-500/40 text-yellow-200'
                                                : 'bg-slate-900/60 border-slate-600/60 text-slate-300 hover:bg-slate-900') +
                                            ' px-2.5 py-1 rounded-full border text-xs transition-colors'
                                        }
                                    >
                                        {m}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Target Audience</label>
                        <div className="flex flex-wrap gap-2">
                            {audiencePresets.map((label) => {
                                const selected = audienceChips.includes(label);
                                return (
                                    <button
                                        key={label}
                                        type="button"
                                        onClick={() => toggleAudienceChip(label)}
                                        className={
                                            (selected
                                                ? 'bg-yellow-500/20 border-yellow-500/40 text-yellow-200'
                                                : 'bg-slate-900/60 border-slate-600/60 text-slate-300 hover:bg-slate-900') +
                                            ' px-3 py-1 rounded-full border text-xs transition-colors'
                                        }
                                    >
                                        {label}
                                    </button>
                                );
                            })}
                        </div>

                        <input
                            id="audience-type"
                            type="text"
                            value={audienceType}
                            onChange={(e) => setAudienceType(e.target.value)}
                            placeholder="Optional: add specifics (e.g., ages 8–12, 150 people, corporate holiday party)"
                            className="mt-3 w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-yellow-500/30 focus:border-yellow-500/40"
                        />
                        <p className="mt-1 text-xs text-slate-400">
                            Tip: pick one or more chips, then add a short note if needed.
                        </p>
                    </div>

                    <div>
                        <label htmlFor="theme" className="block text-sm font-medium text-slate-300 mb-1">Overall Theme / Style</label>
                        <input
                            id="theme"
                            type="text"
                            value={theme}
                            onChange={(e) => setTheme(e.target.value)}
                            placeholder="e.g., elegant & mysterious • high-energy comedy • mind reading with audience participation"
                            className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-yellow-500/30 focus:border-yellow-500/40"
                        />
                        <p className="mt-1 text-xs text-slate-400">
                            Describe tone, pacing, and your performing persona. The AI will keep the structure consistent.
                        </p>
                    </div>

                    <div className="pt-2">
                        <button
                            type="button"
                            onClick={() => setShowAdvanced((v) => !v)}
                            className="w-full flex items-center justify-between px-3 py-2 rounded-md bg-slate-900/40 border border-slate-700 text-slate-200 hover:bg-slate-900/60 transition-colors"
                        >
                            <span className="text-sm font-semibold">Advanced Options (optional)</span>
                            <span className="text-xs text-slate-400">{showAdvanced ? 'Hide' : 'Show'}</span>
                        </button>

                        {showAdvanced && (
                            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Pacing</label>
                                    <select
                                        value={pacing}
                                        onChange={(e) => setPacing(e.target.value as any)}
                                        className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/30 focus:border-yellow-500/40"
                                    >
                                        <option value="">Select…</option>
                                        <option value="Relaxed">Relaxed</option>
                                        <option value="Balanced">Balanced</option>
                                        <option value="High-energy">High-energy</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Comedy Level</label>
                                    <select
                                        value={comedyLevel}
                                        onChange={(e) => setComedyLevel(e.target.value as any)}
                                        className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/30 focus:border-yellow-500/40"
                                    >
                                        <option value="">Select…</option>
                                        <option value="Low">Low</option>
                                        <option value="Medium">Medium</option>
                                        <option value="High">High</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Audience Participation</label>
                                    <select
                                        value={participation}
                                        onChange={(e) => setParticipation(e.target.value as any)}
                                        className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/30 focus:border-yellow-500/40"
                                    >
                                        <option value="">Select…</option>
                                        <option value="Low">Low</option>
                                        <option value="Medium">Medium</option>
                                        <option value="High">High</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Volunteers OK?</label>
                                    <select
                                        value={volunteersOk}
                                        onChange={(e) => setVolunteersOk(e.target.value as any)}
                                        className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/30 focus:border-yellow-500/40"
                                    >
                                        <option value="">Select…</option>
                                        <option value="Yes">Yes</option>
                                        <option value="No">No</option>
                                    </select>
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Constraints / Notes</label>
                                    <textarea
                                        value={constraints}
                                        onChange={(e) => setConstraints(e.target.value)}
                                        rows={3}
                                        placeholder="Optional: stage size, no fire, limited props, family-friendly only, etc."
                                        className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-yellow-500/30 focus:border-yellow-500/40"
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    <button
                        onClick={handleGenerate}
                        disabled={!isFormValid}
                        className="w-full py-3 mt-4 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed"
                    >
                        <WandIcon className="w-5 h-5" />
                        <span>✨ ✨ Create My Show Blueprint ✨</span>
                    </button>
                    <p className="text-center text-xs text-slate-400 -mt-2">Typically takes 10–15 seconds.</p>

                    {error && <p className="text-red-400 mt-2 text-sm text-center">{error}</p>}
                </div>
            </div>
        </main>
    );
};

export default DirectorMode;
