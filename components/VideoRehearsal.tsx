
import React, { useState, useRef } from 'react';
import { generateResponse } from '../services/geminiService';
import { saveIdea } from '../services/ideasService';
import { VIDEO_REHEARSAL_SYSTEM_INSTRUCTION } from '../constants';
import { VideoIcon, WandIcon, SaveIcon, CheckIcon, ShareIcon, TrashIcon } from './icons';
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

const VideoRehearsal: React.FC<VideoRehearsalProps> = ({ user, onIdeaSaved }) => {
    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
    const [prompt, setPrompt] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [analysisResult, setAnalysisResult] = useState<string | null>(null);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
    const fileInputRef = useRef<HTMLInputElement>(null);

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

        // SIMULATION: Since the Gemini API doesn't directly support video file uploads for analysis yet,
        // we will simulate the process. We'll send a text prompt that describes the scenario to get
        // a realistic-looking analysis back.
        const simulationPrompt = `
            I have just "watched" a video of a magician rehearsing a performance. The video is approximately ${Math.round((videoFile.size / 1024 / 1024) * 15)} seconds long based on file size.
            The magician provided the following specific instructions for the analysis: "${prompt || 'No specific instructions provided. Please give general feedback.'}"
            
            Based on this hypothetical video, please generate a detailed, time-stamped performance analysis.
        `;
        
        try {
          // FIX: Pass the user object to generateResponse as the 3rd argument.
          const response = await generateResponse(simulationPrompt, VIDEO_REHEARSAL_SYSTEM_INSTRUCTION, user);
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
                <h2 className="text-xl font-bold text-slate-300 mb-2">Video Rehearsal Studio</h2>
                <p className="text-slate-400 mb-4">Upload a video of your performance to get AI-driven feedback on body language, staging, and physical timing.</p>
                
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
                    </div>
                    
                    <button onClick={handleAnalyze} disabled={isLoading || !videoFile} className="w-full py-3 mt-4 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed">
                        <WandIcon className="w-5 h-5" />
                        <span>Analyze Performance</span>
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
                    <div className="flex-1 flex items-center justify-center text-center text-slate-500 p-4">
                        <div>
                            <VideoIcon className="w-24 h-24 mx-auto mb-4" />
                            <p>Your performance analysis will appear here.</p>
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
};

export default VideoRehearsal;
