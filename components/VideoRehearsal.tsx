
import React, { useState, useRef } from 'react';
import { generateResponseWithParts } from '../services/geminiService';
import { saveIdea } from '../services/ideasService';
import { VIDEO_REHEARSAL_SYSTEM_INSTRUCTION } from '../constants';
import { extractVideoFrames } from '../utils/videoFrames';
import { VideoIcon, WandIcon, SaveIcon, CheckIcon, ShareIcon, TrashIcon, InfoIcon } from './icons';
import ShareButton from './ShareButton';
import FormattedText from './FormattedText';
import type { User } from '../types';
import { canConsume, consume } from '../services/usageTracker';

interface VideoRehearsalProps {
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
        <p className="text-slate-300 mt-4 text-lg">Analyzing your performance...</p>
        <p className="text-slate-400 text-sm">This is a complex process and may take some time.</p>
    </div>
);


const GuidedPlaceholder: React.FC = () => (
    <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-xl text-slate-200">
            <div className="text-center mb-6">
                <div className="mx-auto w-14 h-14 rounded-2xl bg-slate-800/70 border border-slate-700 flex items-center justify-center">
                    <VideoIcon className="w-8 h-8 text-slate-300" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-200">Ready when you are</h3>
                <p className="mt-1 text-sm text-slate-400">
                    Upload a rehearsal video and click <span className="text-slate-200 font-medium">Analyze</span>. Your feedback will appear here.
                </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                {[
                    { title: 'Posture', desc: 'Tension, stance, and “magician’s guilt” tells.' },
                    { title: 'Blocking', desc: 'Where your body and props sit in the frame.' },
                    { title: 'Timing', desc: 'Pace, pauses, and moments that feel rushed.' },
                    { title: 'Angles', desc: 'Sightlines and exposure risk based on frames.' },
                ].map((c) => (
                    <div key={c.title} className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                        <div className="flex items-center justify-between">
                            <p className="font-semibold text-slate-200">{c.title}</p>
                            <div className="h-2 w-16 rounded-full bg-slate-800 overflow-hidden">
                                <div className="h-full w-1/2 bg-slate-700 animate-pulse" />
                            </div>
                        </div>
                        <p className="mt-1 text-xs text-slate-400">{c.desc}</p>
                        <div className="mt-3 space-y-2 animate-pulse">
                            <div className="h-2 rounded bg-slate-800" />
                            <div className="h-2 rounded bg-slate-800 w-5/6" />
                        </div>
                    </div>
                ))}
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-3 text-sm text-slate-300">
                <p className="font-semibold text-slate-200 mb-1">Tip</p>
                <p className="text-slate-400">
                    Use the <span className="text-slate-200">Analysis Focus</span> chips to guide the AI (e.g., angles, pacing, posture).
                </p>
            </div>
        </div>
    </div>
);

const VideoRehearsal: React.FC<VideoRehearsalProps> = ({ user, onIdeaSaved }) => {
    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
    const [prompt, setPrompt] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [analysisResult, setAnalysisResult] = useState<string | null>(null);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
    const [isInfoOpen, setIsInfoOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Phase 2: Guided intent chips that help users provide better analysis focus prompts.
    const focusChips = [
        'Check angles during sleights',
        'Evaluate pacing and pauses',
        'Body posture & hand tension',
        'Timing of secret actions',
        'Staging & blocking across the frame',
    ];

    const applyFocusChip = (text: string) => {
        setPrompt((prev) => {
            const p = (prev || '').trim();
            // If empty, just use the chip.
            if (!p) return text;

            // If the exact chip is already present, don't duplicate.
            if (p.toLowerCase().includes(text.toLowerCase())) return prev;

            // Otherwise append on a new line for readability.
            return `${p}\n${text}`;
        });
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (!file.type.startsWith('video/')) {
                setError('Invalid file type. Please upload a video file (MP4, MOV, WEBM, etc.).');
                return;
            }
            // Demo-friendly size limit
            if (file.size > 50 * 1024 * 1024) { // 50 MB
                setError('File is too large. Please upload a video under 50MB for this demo.');
                return;
            }

            setVideoFile(file);
            const url = URL.createObjectURL(file);
            setVideoPreviewUrl(url);
            setError(null);
            setAnalysisResult(null);
        }
    };

    const handleRemoveVideo = () => {
        if (videoPreviewUrl) {
            URL.revokeObjectURL(videoPreviewUrl);
        }
        setVideoFile(null);
        setVideoPreviewUrl(null);
        if(fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const handleAnalyze = async () => {
        if (!videoFile) return;

        // Daily cap: video analyses/uploads
        const chk = canConsume(user, 'video_upload', 1);
        if (!chk.ok) {
            setError(`Daily video limit reached (${chk.used}/${chk.limit}). Upgrade to continue.`);
            return;
        }
        consume(user, 'video_upload', 1);
        
        setIsLoading(true);
        setError(null);
        setAnalysisResult(null);
        setSaveStatus('idle');
        // Frame-based analysis:
        // We extract representative frames client-side and send them to Gemini Vision.
        // This ensures the feedback is grounded in the uploaded video (not a simulation).
        try {
            const frames = await extractVideoFrames(videoFile, {
                frameCount: 12,
                maxWidth: 640,
                jpegQuality: 0.72,
            });

            if (!frames.length) {
                throw new Error('No frames could be extracted from the video.');
            }

            const focusText = (prompt || '').trim() || 'No specific instructions provided. Please give general feedback.';

            const intro = [
                `You are reviewing a magician's rehearsal video using ONLY the provided video frames.`,
                `CRITICAL RULES:`,
                `- Base your analysis ONLY on what is visible in the frames. If something is not visible, say "not visible in the provided frames".`,
                `- Do NOT assume a routine type unless it is clearly shown.`,
                `- Do NOT invent props, methods, or actions that are not present.`,
                ``,
                `The performer requested the following analysis focus: "${focusText}"`,
                ``,
                `Deliverables:`,
                `1) A short 2–3 sentence overview of what you observe (routine/props/staging).`,
                `2) A detailed time-stamped analysis referencing the provided frame timestamps when possible.`,
                `3) A concise summary of 3–7 actionable items.`,
            ].join('\n');

            const parts: any[] = [{ text: intro }];

            // Interleave timestamp labels so the model can anchor observations.
            for (const f of frames) {
                parts.push({ text: `Frame @ ${f.timeSec.toFixed(2)}s` });
                parts.push({ inlineData: { mimeType: f.mimeType, data: f.base64Data } });
            }

            const response = await generateResponseWithParts(parts, VIDEO_REHEARSAL_SYSTEM_INSTRUCTION, user);
            setAnalysisResult(response);
        } catch (err) {
            setError(err instanceof Error ? err.message : "An unknown error occurred during the analysis.");
        } finally {
            setIsLoading(false);
        }
    };
  
    const handleSave = () => {
        if (analysisResult) {
            const title = `Video Analysis for ${videoFile?.name || 'rehearsal'}`;
            const content = `## Analysis for: ${videoFile?.name}\n\n**Focus Prompt:** ${prompt || 'None'}\n\n---\n\n${analysisResult}`;
            saveIdea('text', content, title);
            onIdeaSaved();
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 2000);
        }
    };

    const handleStartOver = () => {
        handleRemoveVideo();
        setPrompt('');
        setAnalysisResult(null);
        setError(null);
        setIsLoading(false);
    };

    return (
        <main className="flex-1 overflow-y-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
            {/* Control Panel */}
            <div className="flex flex-col">
                <div className="flex items-center gap-2 mb-2">
                    <h2 className="text-xl font-bold text-slate-300">Video Rehearsal Studio</h2>
                    <button
                        type="button"
                        onClick={() => setIsInfoOpen(true)}
                        className="ml-1 inline-flex items-center justify-center w-8 h-8 rounded-full border border-slate-700 bg-slate-900/40 text-slate-300 hover:text-white hover:border-purple-500 transition-colors"
                        title="What the AI looks for"
                        aria-label="What the AI looks for"
                    >
                        <InfoIcon className="w-4 h-4" />
                    </button>
                </div>
                <p className="text-slate-400 mb-4">Upload a video of your performance to get AI-driven feedback on body language, staging, and physical timing.</p>

{isInfoOpen && (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <button
            type="button"
            className="absolute inset-0 bg-black/60"
            onClick={() => setIsInfoOpen(false)}
            aria-label="Close info modal"
        />
        <div className="relative w-full max-w-2xl rounded-xl border border-slate-700 bg-slate-950 shadow-xl">
            <div className="flex items-start justify-between gap-4 p-4 border-b border-slate-800">
                <div>
                    <h3 className="text-lg font-bold text-slate-200">What the AI looks for</h3>
                    <p className="text-sm text-slate-400 mt-1">
                        This analysis is grounded in extracted video frames. If something isn’t visible, the AI will say so.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setIsInfoOpen(false)}
                    className="w-9 h-9 rounded-full border border-slate-700 bg-slate-900/40 text-slate-300 hover:text-white hover:border-purple-500 transition-colors flex items-center justify-center"
                    aria-label="Close"
                    title="Close"
                >
                    <span className="text-xl leading-none">×</span>
                </button>
            </div>

            <div className="p-4 space-y-4">
                <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                    <p className="font-semibold text-slate-200 mb-2">What is analyzed</p>
                    <ul className="list-disc pl-5 space-y-1 text-sm text-slate-300">
                        <li><span className="font-medium text-slate-200">Posture & tension:</span> stance, shoulders, hand tension, and unnatural freezes.</li>
                        <li><span className="font-medium text-slate-200">Blocking & framing:</span> where you stand, where props live, and how clearly the “effect” reads.</li>
                        <li><span className="font-medium text-slate-200">Timing & pacing:</span> rushed moments, missing pauses, and when to let reactions land.</li>
                        <li><span className="font-medium text-slate-200">Angles & sightlines:</span> exposure risk based on what the camera can see.</li>
                    </ul>
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-900/20 p-3">
                    <p className="font-semibold text-slate-200 mb-2">What is NOT analyzed</p>
                    <ul className="list-disc pl-5 space-y-1 text-sm text-slate-300">
                        <li><span className="font-medium text-slate-200">No method exposure:</span> it won’t teach secrets, gimmicks, or how-to instructions.</li>
                        <li><span className="font-medium text-slate-200">No guessing:</span> it won’t invent props or moves that aren’t visible in the frames.</li>
                        <li><span className="font-medium text-slate-200">No identity judgments:</span> feedback is about performance mechanics, not personal traits.</li>
                    </ul>
                </div>

                <div className="text-xs text-slate-400">
                    Tip: Use <span className="text-slate-200 font-medium">Analysis Focus</span> to ask for specific checks (angles, posture, timing).
                </div>
            </div>
        </div>
    </div>
)}

                
                <div className="space-y-4">
                    <input type="file" accept="video/*" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
                    
                    {!videoPreviewUrl ? (
                        <button onClick={() => fileInputRef.current?.click()} className="w-full flex flex-col items-center justify-center p-12 border-2 border-dashed border-slate-600 rounded-lg hover:bg-slate-800/50 hover:border-purple-500 transition-colors">
                            <VideoIcon className="w-12 h-12 text-slate-500 mb-2"/>
                            <span className="font-semibold text-slate-300">Upload a Rehearsal Video</span>
                            <span className="text-sm text-slate-400">MP4, MOV, WEBM, etc. (Max 50MB)</span>
                        </button>
                    ) : (
                        <div>
                            <div className="relative w-full aspect-video bg-black rounded-lg flex items-center justify-center overflow-hidden mb-2">
                                <video src={videoPreviewUrl} controls className="w-full h-full object-contain" />
                                <button onClick={handleRemoveVideo} className="absolute top-2 right-2 p-2 bg-black/50 rounded-full text-white hover:bg-red-600 transition-colors" title="Remove video">
                                    <TrashIcon className="w-5 h-5" />
                                </button>
                            </div>
                            <p className="text-xs text-slate-400 text-center">{videoFile?.name} ({(videoFile!.size / 1024 / 1024).toFixed(2)} MB)</p>
                        </div>
                    )}

                    <p className="text-xs text-slate-400 text-center">
                        Video uploads do not consume Live Rehearsal minutes.
                    </p>

                    <div>
                        <label htmlFor="analysis-prompt" className="block text-sm font-medium text-slate-300 mb-1">Analysis Focus (Optional)</label>
                        <textarea id="analysis-prompt" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g., Check my posture and hand movements during the vanish." className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white placeholder-slate-500" />

                        {/* Guided prompt chips */}
                        <div className="mt-2 flex flex-wrap gap-2">
                            {focusChips.map((chip) => (
                                <button
                                    key={chip}
                                    type="button"
                                    onClick={() => applyFocusChip(chip)}
                                    className="px-2.5 py-1 rounded-full text-xs bg-slate-800/70 border border-slate-600 text-slate-200 hover:border-purple-500 hover:bg-slate-800 transition-colors"
                                >
                                    {chip}
                                </button>
                            ))}
                        </div>
                    </div>
                    
                    <button onClick={handleAnalyze} disabled={isLoading || !videoFile} className="w-full py-3 mt-4 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed">
                        <WandIcon className="w-5 h-5" />
                        <span>
                            {isLoading ? 'Analyzing…' : videoFile ? 'Analyze Performance (Ready)' : 'Analyze Performance'}
                        </span>
                    </button>
                    {error && <p className="text-red-400 mt-2 text-sm text-center">{error}</p>}
                </div>
            </div>

            {/* Result Display Area */}
            <div className="flex flex-col bg-slate-900/50 rounded-lg border border-slate-800 min-h-[300px]">
                {isLoading ? (
                    <div className="flex-1 flex items-center justify-center"><LoadingIndicator /></div>
                ) : analysisResult ? (
                     <div className="relative group flex-1 flex flex-col">
                        <div className="p-4 overflow-y-auto"><FormattedText text={analysisResult} /></div>
                        <div className="mt-auto p-2 bg-slate-900/50 flex justify-end gap-2 border-t border-slate-800">
                            <button onClick={handleStartOver} className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200">Start Over</button>
                            <ShareButton title={`Video Analysis: ${videoFile?.name}`} text={analysisResult} className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200"><ShareIcon className="w-4 h-4" /><span>Share</span></ShareButton>
                            <button onClick={handleSave} disabled={saveStatus === 'saved'} className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200">{saveStatus === 'saved' ? <><CheckIcon className="w-4 h-4 text-green-400" /><span>Saved!</span></> : <><SaveIcon className="w-4 h-4" /><span>Save Idea</span></>}</button>
                        </div>
                    </div>
                ) : (
                    <GuidedPlaceholder />
                )}
            </div>
        </main>
    );
};

export default VideoRehearsal;
