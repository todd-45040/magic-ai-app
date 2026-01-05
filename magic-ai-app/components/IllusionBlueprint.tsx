
import React, { useState } from 'react';
import { generateImage, generateStructuredResponse } from '../services/geminiService';
import { saveIdea } from '../services/ideasService';
import { ILLUSION_BLUEPRINT_SYSTEM_INSTRUCTION } from '../constants';
import type { IllusionBlueprintResponse, User } from '../types';
import { BlueprintIcon, WandIcon, SaveIcon, CheckIcon, ShareIcon } from './icons';
import ShareButton from './ShareButton';
import { Type } from '@google/genai';

interface IllusionBlueprintProps {
    user: User;
    onIdeaSaved: () => void;
}

const LoadingIndicator: React.FC = () => (
    <div className="flex flex-col items-center justify-center text-center p-8 h-full">
        <div className="relative">
            <WandIcon className="w-16 h-16 text-purple-400 animate-pulse" />
            <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
                 <div className="w-24 h-24 border-t-2 border-purple-300 rounded-full animate-spin"></div>
            </div>
        </div>
        <p className="text-slate-300 mt-4 text-lg">Generating Illusion Blueprint...</p>
        <p className="text-slate-400 text-sm">This involves multiple AI steps and may take a moment.</p>
    </div>
);

const IllusionBlueprint: React.FC<IllusionBlueprintProps> = ({ user, onIdeaSaved }) => {
    const [prompt, setPrompt] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [conceptArt, setConceptArt] = useState<string | null>(null);
    const [blueprint, setBlueprint] = useState<IllusionBlueprintResponse | null>(null);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');

    const blueprintSchema = {
        type: Type.OBJECT,
        properties: {
            potential_principles: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        name: { type: Type.STRING },
                        description: { type: Type.STRING },
                    },
                    required: ['name', 'description'],
                },
            },
            blueprint_description: { type: Type.STRING },
        },
        required: ['potential_principles', 'blueprint_description'],
    };

    const handleGenerate = async () => {
        if (!prompt.trim()) {
            setError("Please describe your illusion concept.");
            return;
        }
        
        setIsLoading(true);
        setError(null);
        setConceptArt(null);
        setBlueprint(null);
        setSaveStatus('idle');

        const artPrompt = `Dramatic, theatrical concept art for a grand illusion: ${prompt}. Focus on the magical moment from the audience's perspective. Cinematic lighting, professional digital painting style.`;
        const textPrompt = `Generate a blueprint for an illusion concept: "${prompt}"`;

        try {
            // FIX: Pass the user object to generateImage and generateStructuredResponse for usage tracking.
            const artPromise = generateImage(artPrompt, '16:9', user);
            const blueprintPromise = generateStructuredResponse(textPrompt, ILLUSION_BLUEPRINT_SYSTEM_INSTRUCTION, blueprintSchema, user);
            
            const [artResult, blueprintResult] = await Promise.all([artPromise, blueprintPromise]);

            setConceptArt(artResult);
            setBlueprint(blueprintResult as IllusionBlueprintResponse);

        } catch (err) {
            setError(err instanceof Error ? err.message : "An unknown error occurred. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };
  
    const handleSave = () => {
        if (blueprint && conceptArt) {
            let fullContent = `## Illusion Blueprint: ${prompt}\n\n`;
            fullContent += `![Concept Art](${conceptArt})\n\n`;
            fullContent += `### Potential Principles\n\n`;
            blueprint.potential_principles.forEach(p => {
                fullContent += `**${p.name}:** ${p.description}\n\n`;
            });
            fullContent += `### Staging Blueprint\n\n${blueprint.blueprint_description}`;
            
            saveIdea('text', fullContent, `Illusion Blueprint: ${prompt}`);
            onIdeaSaved();
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 2000);
        }
    };

    const handleStartOver = () => {
        setPrompt('');
        setConceptArt(null);
        setBlueprint(null);
        setError(null);
    };

    return (
        <div className="flex-1 flex flex-col overflow-y-auto p-4 md:p-6 animate-fade-in">
            <header className="mb-6">
                <div className="flex items-center gap-3">
                    <BlueprintIcon className="w-8 h-8 text-purple-400" />
                    <h2 className="text-2xl font-bold text-slate-200 font-cinzel">Illusion Blueprint Generator</h2>
                </div>
                <p className="text-slate-400 mt-1">From a simple concept to a stage-ready blueprint. Describe your grand illusion idea below.</p>
            </header>

            {!blueprint ? (
                <div className="flex-1 flex items-center justify-center">
                    <div className="w-full max-w-xl">
                         <textarea
                            rows={4}
                            value={prompt}
                            onChange={(e) => { setPrompt(e.target.value); setError(null); }}
                            placeholder="e.g., I want to make a motorcycle appear from a cloud of smoke on an empty stage."
                            className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
                        />
                         <button
                            onClick={handleGenerate}
                            disabled={isLoading || !prompt.trim()}
                            className="w-full py-3 mt-4 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed"
                        >
                            <WandIcon className="w-5 h-5" />
                            <span>{isLoading ? 'Generating...' : 'Generate Blueprint'}</span>
                        </button>
                        {error && <p className="text-red-400 mt-2 text-sm text-center">{error}</p>}
                        {isLoading && <LoadingIndicator />}
                    </div>
                </div>
            ) : (
                <div className="space-y-6">
                    {conceptArt && (
                        <div>
                            <h3 className="text-lg font-bold text-white mb-2 font-cinzel">Concept Art</h3>
                            <img src={conceptArt} alt="Generated concept art for the illusion" className="w-full rounded-lg border border-slate-700" />
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                             <h3 className="text-lg font-bold text-white mb-2 font-cinzel">Potential Principles</h3>
                             <div className="space-y-3">
                                {blueprint.potential_principles.map((principle, i) => (
                                    <div key={i} className="bg-slate-800/50 p-3 rounded-md border border-slate-700/50">
                                        <h4 className="font-semibold text-purple-300">{principle.name}</h4>
                                        <p className="text-sm text-slate-400">{principle.description}</p>
                                    </div>
                                ))}
                             </div>
                        </div>
                         <div>
                             <h3 className="text-lg font-bold text-white mb-2 font-cinzel">Staging Blueprint</h3>
                             <div className="bg-slate-800/50 p-3 rounded-md border border-slate-700/50">
                                <pre className="whitespace-pre-wrap break-words text-slate-300 font-sans text-sm">{blueprint.blueprint_description}</pre>
                             </div>
                        </div>
                    </div>
                    
                    <div className="flex items-center justify-center gap-4 pt-4 border-t border-slate-700">
                        <button onClick={handleStartOver} className="px-6 py-2 bg-slate-600 hover:bg-slate-700 rounded-md text-white font-bold">Start Over</button>
                        <button onClick={handleSave} disabled={saveStatus === 'saved'} className="flex items-center gap-2 px-6 py-2 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold">
                            {saveStatus === 'saved' ? <><CheckIcon className="w-5 h-5"/><span>Saved!</span></> : <><SaveIcon className="w-5 h-5"/><span>Save Blueprint</span></>}
                        </button>
                    </div>

                </div>
            )}
        </div>
    );
};

export default IllusionBlueprint;
