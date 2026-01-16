import React, { useState, useEffect, useRef } from 'react';
import { LiveServerMessage, Blob, FunctionCall } from '@google/genai';
import { startLiveSession, decode, decodeAudioData, type LiveSession } from '../services/geminiService';
import { saveIdea } from '../services/ideasService';
import type { Transcription, TimerState, User } from '../types';
import { canConsume, consumeLiveMinutes, getUsage } from '../services/usageTracker';
import { MAGICIAN_LIVE_REHEARSAL_SYSTEM_INSTRUCTION, LIVE_REHEARSAL_TOOLS } from '../constants';
import { BackIcon, MicrophoneIcon, StopIcon, SaveIcon, WandIcon, TrashIcon, TimerIcon } from './icons';

interface LiveRehearsalProps {
  user: User;
  onReturnToStudio: (transcriptToDiscuss?: Transcription[]) => void;
  onIdeaSaved: () => void;
}

// Helper functions for audio processing, moved from geminiService
function encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function createBlob(data: Float32Array): Blob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

// Convert float audio samples (-1..1) to 16-bit PCM.
function floatToInt16(data: Float32Array): Int16Array {
  const out = new Int16Array(data.length);
  for (let i = 0; i < data.length; i++) {
    const s = Math.max(-1, Math.min(1, data[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

// Build a mono 16-bit PCM WAV blob.
function pcm16ToWavBlob(pcm: Int16Array, sampleRate = 16000): globalThis.Blob {
  const numChannels = 1;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcm.length * bytesPerSample;

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, 1, true); // audio format = PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // PCM samples
  let offset = 44;
  for (let i = 0; i < pcm.length; i++, offset += 2) {
    view.setInt16(offset, pcm[i], true);
  }

  return new globalThis.Blob([buffer], { type: 'audio/wav' });
}

async function blobToBase64(blob: globalThis.Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read audio blob'));
    reader.onload = () => {
      const result = String(reader.result || '');
      // result is data:<mime>;base64,<data>
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}


const LiveRehearsal: React.FC<LiveRehearsalProps> = ({ user, onReturnToStudio, onIdeaSaved }) => {
    const [view, setView] = useState<'idle' | 'rehearsing' | 'reviewing'>('idle');
    const [status, setStatus] = useState<'idle' | 'connecting' | 'listening' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState('');
    const [transcriptionHistory, setTranscriptionHistory] = useState<Transcription[]>([]);
    const [isFinalizing, setIsFinalizing] = useState(false);
    
    const sessionRef = useRef<LiveSession | null>(null);
    const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
    const cleanupMicStreamRef = useRef<(() => void) | null>(null);
    const errorOccurred = useRef(false);

    // Audio playback refs
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const outputNodeRef = useRef<GainNode | null>(null);
    const sourcesRef = useRef(new Set<AudioBufferSourceNode>());
    const nextStartTimeRef = useRef(0);
    
    // Timer state and refs
    const [timer, setTimer] = useState<TimerState>({ startTime: null, duration: null, isRunning: false });
    const timerIntervalRef = useRef<number | null>(null);

    // Usage tracking (client-side, per-day)
    const sessionStartRef = useRef<number | null>(null);
    const usageIntervalRef = useRef<number | null>(null);

    const transcriptEndRef = useRef<HTMLDivElement>(null);

    // --- Optional browser-side transcription fallback (Web Speech API) ---
    // Gemini Live transcription can fail depending on audio format/model access.
    // We run browser speech recognition in parallel and only use it if Gemini returns no user transcript.
    const speechRecRef = useRef<any>(null);
    const speechTextRef = useRef<string>('');

    // --- Server-side transcription fallback buffer ---
    // We buffer the 16kHz PCM16 samples we already send to Gemini Live,
    // then (if Gemini returns no transcript) we send the buffered audio
    // to a serverless endpoint for transcription.
    const pcm16ChunksRef = useRef<Int16Array[]>([]);

    const startBrowserTranscription = () => {
        try {
            if (speechRecRef.current) return;
            const SpeechRec: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
            if (!SpeechRec) return;
            const rec = new SpeechRec();
            rec.lang = 'en-US';
            rec.continuous = true;
            rec.interimResults = false;
            speechTextRef.current = '';
            rec.onresult = (e: any) => {
                for (let i = e.resultIndex; i < e.results.length; i++) {
                    if (e.results[i].isFinal) {
                        speechTextRef.current += (e.results[i][0]?.transcript || '') + ' ';
                    }
                }
            };
            rec.onerror = () => {
                // Ignore — fallback is best-effort.
            };
            rec.onend = () => {
                // Some browsers end automatically; keep reference so we can stop explicitly.
            };
            rec.start();
            speechRecRef.current = rec;
        } catch {
            // Ignore — fallback is best-effort.
        }
    };

    const stopBrowserTranscription = () => {
        try {
            if (speechRecRef.current) {
                speechRecRef.current.stop?.();
            }
        } catch {
            // Ignore
        } finally {
            speechRecRef.current = null;
        }
    };

    const transcribeOnServer = async (): Promise<string> => {
        // Combine buffered PCM chunks and send as WAV to /api/transcribe
        const chunks = pcm16ChunksRef.current;
        if (!chunks || chunks.length === 0) return '';

        const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
        if (totalLen <= 0) return '';

        const combined = new Int16Array(totalLen);
        let offset = 0;
        for (const c of chunks) {
            combined.set(c, offset);
            offset += c.length;
        }

        const wavBlob = pcm16ToWavBlob(combined, 16000);
        const audioBase64 = await blobToBase64(wavBlob);

        const res = await fetch('/api/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audioBase64, mimeType: 'audio/wav' }),
        });

        if (!res.ok) {
            const t = await res.text().catch(() => '');
            throw new Error(t || `Transcription failed (${res.status})`);
        }
        const json = await res.json();
        return String(json?.transcript || '').trim();
    };

    const safeReturnToStudio = (transcriptToDiscuss?: Transcription[]) => {
        cleanupSession();
        setView('idle');
        setStatus('idle');
        setErrorMessage('');
        setTranscriptionHistory([]);
        onReturnToStudio(transcriptToDiscuss);
    };

    useEffect(() => {
        transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [transcriptionHistory]);

    const cleanupSession = () => {
        // Stop any browser-side fallback transcription.
        stopBrowserTranscription();
        if (sessionRef.current) {
            sessionRef.current.close();
            sessionRef.current = null;
        }
        if (cleanupMicStreamRef.current) {
            cleanupMicStreamRef.current();
            cleanupMicStreamRef.current = null;
        }
        if (outputAudioContextRef.current) {
            outputAudioContextRef.current.close();
            outputAudioContextRef.current = null;
        }
        if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
        }
        if (usageIntervalRef.current) {
            clearInterval(usageIntervalRef.current);
            usageIntervalRef.current = null;
        }
        sessionStartRef.current = null;
        setTimer({ startTime: null, duration: null, isRunning: false });
        setStatus('idle');
    };

    useEffect(() => {
        return () => cleanupSession();
    }, []);


    const handleStartSession = async () => {
        // Client-side cap for live rehearsal minutes (daily). Server-side usage enforcement still applies to text requests.
        const cur = getUsage(user, 'live_minutes');
        if (cur.limit > 0 && cur.remaining <= 0) {
            setStatus('error');
            setErrorMessage(`Daily live rehearsal limit reached (${cur.used}/${cur.limit} min). Upgrade to continue.`);
            return;
        }
        setStatus('connecting');
        setErrorMessage('');
        setTranscriptionHistory([]);
        setIsFinalizing(false);
        pcm16ChunksRef.current = [];
        // Start best-effort browser transcription in parallel.
        // We'll only use it if Gemini returns no user transcript.
        startBrowserTranscription();
        errorOccurred.current = false;
        try {
            // FIX: Request audio without a specific sample rate to ensure compatibility.
            // The audio will be resampled later if needed.
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                }
            });

            // Setup output audio context
            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            outputAudioContextRef.current = audioCtx;
            outputNodeRef.current = audioCtx.createGain();
            outputNodeRef.current.connect(audioCtx.destination);
            
            // FIX: Create input audio context with the stream's native sample rate to avoid mismatches.
            const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            let source: MediaStreamAudioSourceNode | null = null;
            let scriptProcessor: ScriptProcessorNode | null = null;

            const sessionPromise = startLiveSession(
                MAGICIAN_LIVE_REHEARSAL_SYSTEM_INSTRUCTION,
                {
                    onopen: () => { 
                        // Setup microphone streaming once the connection is open
                        source = inputAudioContext.createMediaStreamSource(stream);
                        scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);

                        // FIX: Implement audio resampling within the audio processor
                        // to convert the microphone's native sample rate to the 16000Hz required by the API.
                        scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                            const inputSampleRate = inputAudioContext.sampleRate;
                            const outputSampleRate = 16000;

                            let resampledData = inputData;
                            if (inputSampleRate !== outputSampleRate) {
                                const sampleRateRatio = inputSampleRate / outputSampleRate;
                                const newLength = Math.round(inputData.length / sampleRateRatio);
                                resampledData = new Float32Array(newLength);
                                let offsetResult = 0;
                                let offsetBuffer = 0;
                                while (offsetResult < newLength) {
                                    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
                                    let accum = 0, count = 0;
                                    for (let i = offsetBuffer; i < nextOffsetBuffer && i < inputData.length; i++) {
                                        accum += inputData[i];
                                        count++;
                                    }
                                    resampledData[offsetResult] = count > 0 ? accum / count : 0;
                                    offsetResult++;
                                    offsetBuffer = nextOffsetBuffer;
                                }
                            }

                            const pcmBlob = createBlob(resampledData);
                            // Buffer PCM16 for server-side transcription fallback.
                            // Keep up to ~10 minutes to avoid unbounded memory.
                            try {
                                pcm16ChunksRef.current.push(floatToInt16(resampledData));
                                const maxSamples = 16000 * 60 * 10; // 10 minutes
                                let currentSamples = pcm16ChunksRef.current.reduce((s, c) => s + c.length, 0);
                                while (currentSamples > maxSamples && pcm16ChunksRef.current.length > 1) {
                                    const dropped = pcm16ChunksRef.current.shift();
                                    currentSamples -= dropped ? dropped.length : 0;
                                }
                            } catch {
                                // Ignore buffering errors
                            }
                            // Use the session promise to send data, preventing race conditions
                            sessionPromise.then((session) => {
                                session.sendRealtimeInput({ media: pcmBlob });
                            });
                        };

                        source.connect(scriptProcessor);
                        scriptProcessor.connect(inputAudioContext.destination);

                        setStatus('listening');
                        setView('rehearsing');

                        // Start usage timer
                        sessionStartRef.current = Date.now();
                        if (usageIntervalRef.current) {
                            clearInterval(usageIntervalRef.current);
                        }
                        usageIntervalRef.current = window.setInterval(() => {
                            const start = sessionStartRef.current;
                            if (!start) return;
                            const elapsedMin = (Date.now() - start) / 60000;
                            const cur2 = getUsage(user, 'live_minutes');
                            // When elapsed session time reaches remaining daily minutes, stop.
                            if (cur2.limit > 0 && elapsedMin >= cur2.remaining) {
                                handleStopRehearsal('Daily live rehearsal minutes reached. Upgrade to continue.');
                            }
                        }, 5000);
                    },
                    onmessage: handleServerMessage,
                    onerror: (e) => {
                        console.error('Live session error:', e);
                        errorOccurred.current = true;
                        setErrorMessage('A live session error occurred. The connection may have been interrupted.');
                        setStatus('error');
                        setView('rehearsing');
                    },
                    onclose: () => {
                        if (!errorOccurred.current) {
                           // A clean close (e.g., user stops talking) should go to the review screen
                           setStatus('idle');
                           setView('reviewing');
                        }
                    },
                },
                LIVE_REHEARSAL_TOOLS
            );
            
            sessionPromiseRef.current = sessionPromise;
            sessionRef.current = await sessionPromise;

            // Define the cleanup function for all audio resources
            cleanupMicStreamRef.current = () => {
                stream.getTracks().forEach(track => track.stop());
                if(scriptProcessor) scriptProcessor.disconnect();
                if(source) source.disconnect();
                if(inputAudioContext.state !== 'closed') inputAudioContext.close();
            };

        } catch (error: any) {
            console.error('Failed to start session or get microphone:', error);
            errorOccurred.current = true;
            if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                setErrorMessage('Microphone permission denied. Please allow microphone access in your browser settings.');
            } else {
                setErrorMessage('Failed to connect. Please check your connection and microphone, then try again.');
            }
            setStatus('error');
            setView('rehearsing');
        }
    };
    
    const handleToolCall = (fc: FunctionCall) => {
        let result: any;
        switch(fc.name) {
            case 'startTimer':
                if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
                setTimer({ startTime: Date.now(), duration: '00:00.0', isRunning: true });
                timerIntervalRef.current = window.setInterval(() => {
                    setTimer(prev => {
                        if (!prev.startTime) return prev;
                        const elapsed = Date.now() - prev.startTime;
                        const totalSeconds = Math.floor(elapsed / 1000);
                        const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
                        const seconds = (totalSeconds % 60).toString().padStart(2, '0');
                        const tenths = Math.floor((elapsed % 1000) / 100);
                        return { ...prev, duration: `${minutes}:${seconds}.${tenths}` };
                    });
                }, 100);
                result = { result: "Timer started successfully." };
                break;
            case 'stopTimer':
                if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
                const finalDuration = timer.duration;
                setTimer(prev => ({ ...prev, isRunning: false, duration: finalDuration }));
                result = { result: `Timer stopped. The final duration was ${finalDuration}.` };
                break;
            default:
                result = { error: "Unknown function." };
        }
        
        sessionPromiseRef.current?.then((session) => {
            session.sendToolResponse({
                functionResponses: { id: fc.id, name: fc.name, response: result }
            });
        });
    };

    const handleServerMessage = async (message: LiveServerMessage) => {
        if (message.toolCall) {
            for (const fc of message.toolCall.functionCalls) {
                handleToolCall(fc);
            }
        }

        if (message.serverContent?.inputTranscription) {
            const text = message.serverContent.inputTranscription.text;
            setTranscriptionHistory(prev => {
                const last = prev[prev.length - 1];
                if (last?.source === 'user' && !last.isFinal) {
                    const updatedLast = { ...last, text: last.text + text };
                    return [...prev.slice(0, -1), updatedLast];
                }
                return [...prev, { source: 'user', text, isFinal: false }];
            });
        }
        if (message.serverContent?.outputTranscription) {
            const text = message.serverContent.outputTranscription.text;
            setTranscriptionHistory(prev => {
                const last = prev[prev.length - 1];
                if (last?.source === 'model' && !last.isFinal) {
                    const updatedLast = { ...last, text: last.text + text };
                    return [...prev.slice(0, -1), updatedLast];
                }
                return [...prev, { source: 'model', text, isFinal: false }];
            });
        }
        if (message.serverContent?.turnComplete) {
            setTranscriptionHistory(prev => prev.map(t => ({...t, isFinal: true})));
        }

        const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
        if (base64Audio && outputAudioContextRef.current && outputNodeRef.current) {
            const ctx = outputAudioContextRef.current;
            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
            const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(outputNodeRef.current);
            source.addEventListener('ended', () => sourcesRef.current.delete(source));
            source.start(nextStartTimeRef.current);
            nextStartTimeRef.current += audioBuffer.duration;
            sourcesRef.current.add(source);
        }

        if (message.serverContent?.interrupted) {
            for (const source of sourcesRef.current.values()) {
                source.stop();
                sourcesRef.current.delete(source);
            }
            nextStartTimeRef.current = 0;
        }
    };

    const handleStopRehearsal = async (reason?: string) => {
        // Stop browser fallback transcription first.
        stopBrowserTranscription();
        setIsFinalizing(true);
        setView('reviewing');

        // Record minutes used for the current session.
        const start = sessionStartRef.current;
        if (start) {
            const minutes = (Date.now() - start) / 60000;
            consumeLiveMinutes(user, minutes);
            sessionStartRef.current = null;
        }

        // Close live session + mic now (we already buffered PCM).
        cleanupSession();

        // Fallback 1: If Gemini produced no user transcription, use browser transcript if available.
        const browserFallback = (speechTextRef.current || '').trim();
        const hadUserTranscript = transcriptionHistory.some(t => t.source === 'user' && (t.text || '').trim().length > 0);
        if (!hadUserTranscript && browserFallback) {
            setTranscriptionHistory(prev => [...prev, { source: 'user', text: browserFallback, isFinal: true }]);
        }

        // Fallback 2 (recommended): Server-side transcription from buffered audio.
        const hadUserAfterBrowser = hadUserTranscript || (!!browserFallback);
        if (!hadUserAfterBrowser) {
            try {
                const transcript = await transcribeOnServer();
                if (transcript) {
                    setTranscriptionHistory(prev => [...prev, { source: 'user', text: transcript, isFinal: true }]);
                }
            } catch (e: any) {
                console.warn('Server transcription fallback failed:', e);
            }
        }

        if (reason) setErrorMessage(reason);
        setIsFinalizing(false);
    };
    
    const handleHeaderButtonClick = () => {
        if (view === 'rehearsing') {
            handleStopRehearsal();
        } else {
            safeReturnToStudio();
        }
    };
    
    const renderContent = () => {
        switch(view) {
            case 'reviewing':
                return <ReviewView 
                    transcription={transcriptionHistory}
                    isFinalizing={isFinalizing}
                    onIdeaSaved={onIdeaSaved}
                    onReturnToStudio={safeReturnToStudio}
                />;
            case 'rehearsing':
            case 'idle':
            default:
                return (
                    <div className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col">
                        {transcriptionHistory.length > 0 ? (
                            <div className="space-y-4">
                                {transcriptionHistory.map((t, i) => (
                                    <div key={i} className={`flex flex-col ${t.source === 'user' ? 'items-end' : 'items-start'}`}>
                                        <span className="text-xs text-slate-400 px-2 mb-0.5 font-semibold">
                                            {t.source === 'user' ? 'You' : 'AI Coach'}
                                        </span>
                                        <p className={`max-w-xl px-4 py-2 rounded-lg ${t.source === 'user' ? 'bg-purple-800 text-white' : 'bg-slate-700 text-slate-200'} ${!t.isFinal ? 'opacity-70' : ''}`}>
                                            {t.text}
                                        </p>
                                    </div>
                                ))}
                                <div ref={transcriptEndRef} />
                            </div>
                        ) : (
                            <div className="flex-1 flex items-center justify-center">
                                <StatusIndicator status={status} errorMessage={errorMessage} onStart={handleStartSession} />
                            </div>
                        )}
                    </div>
                );
        }
    };

    return (
        <div className="flex flex-col h-full relative">
            <header className="p-4 border-b border-slate-800 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-3">
                    <MicrophoneIcon className="w-6 h-6 text-purple-400" />
                    <h2 className="text-xl font-bold text-white">Live Rehearsal Studio</h2>
                </div>
                <button 
                    onClick={handleHeaderButtonClick} 
                    className={`flex items-center gap-2 px-4 py-2 text-sm rounded-md font-bold transition-colors ${
                        view === 'rehearsing' 
                            ? 'bg-red-600 hover:bg-red-700 text-white' 
                            : 'bg-slate-600 hover:bg-slate-700 text-white'
                    }`}
                >
                    {view === 'rehearsing' ? <StopIcon className="w-4 h-4" /> : <BackIcon className="w-4 h-4" />}
                    <span>{view === 'rehearsing' ? 'Stop & Review' : 'Back to Studio'}</span>
                </button>
            </header>
            {renderContent()}
            
            {(timer.isRunning || timer.duration) && view === 'rehearsing' && (
                <div className={`absolute bottom-4 right-4 flex items-center gap-2 px-4 py-2 rounded-lg border text-lg font-mono font-semibold transition-colors ${timer.isRunning ? 'bg-green-900/50 border-green-500/50 text-green-300' : 'bg-slate-800 border-slate-600 text-slate-300'}`}>
                    <TimerIcon className="w-5 h-5" />
                    <span>{timer.duration}</span>
                </div>
            )}
        </div>
    );
};


const StatusIndicator: React.FC<{status: string, errorMessage: string, onStart: () => void}> = ({status, errorMessage, onStart}) => {
    switch (status) {
        case 'connecting':
            return <p className="text-slate-300 text-lg">Connecting and requesting microphone...</p>;
        case 'listening':
            return (
                 <div className="flex flex-col items-center">
                     <div className="relative w-24 h-24 flex items-center justify-center">
                         <div className="absolute w-full h-full bg-purple-500 rounded-full animate-ping opacity-75"></div>
                         <div className="relative w-20 h-20 bg-purple-600 rounded-full flex items-center justify-center">
                            <MicrophoneIcon className="w-10 h-10 text-white" />
                         </div>
                     </div>
                     <p className="text-slate-300 mt-4 text-lg animate-pulse">Listening...</p>
                 </div>
            );
        case 'error':
            return (
                <div className="text-center">
                    <p className="text-red-400 text-lg mb-4">{errorMessage}</p>
                     <button onClick={onStart} className="px-6 py-3 bg-slate-600 hover:bg-slate-700 rounded-full text-white font-bold transition-colors">
                        Try Again
                    </button>
                </div>
            );
        case 'idle':
        default:
            return (
                <div className="text-center">
                    <MicrophoneIcon className="w-24 h-24 text-slate-500 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold text-slate-300 mb-2">Live Rehearsal Studio</h2>
                    <p className="text-slate-400 max-w-lg mb-6">Practice your script and get instant, AI-powered feedback on your vocal tone, confidence, and clarity. You can also use voice commands like "start timer" and "stop timer" to time your routines hands-free.</p>
                    <div className="max-w-md mx-auto bg-purple-900/20 border border-purple-700/50 p-3 rounded-lg text-sm text-purple-200/90 mb-8">
                        <strong>For the best results, please use headphones.</strong> This prevents the AI coach's voice from creating an echo.
                    </div>
                    <button onClick={onStart} className="px-8 py-4 bg-purple-600 hover:bg-purple-700 rounded-full text-white font-bold text-lg transition-colors flex items-center gap-3 mx-auto">
                        <MicrophoneIcon className="w-6 h-6" />
                        <span>Start Rehearsal</span>
                    </button>
                </div>
            );
    }
};

const ReviewView: React.FC<{
    transcription: Transcription[];
    isFinalizing?: boolean;
    onIdeaSaved: () => void;
    onReturnToStudio: (transcriptToDiscuss?: Transcription[]) => void;
}> = ({ transcription, isFinalizing = false, onIdeaSaved, onReturnToStudio }) => {
    const transcriptEndRef = useRef<HTMLDivElement>(null);
    const [showSaveForm, setShowSaveForm] = useState(false);
    const [title, setTitle] = useState(`Rehearsal - ${new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`);
    const [notes, setNotes] = useState('');

    useEffect(() => {
        transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [transcription]);
    
    const handleConfirmSave = () => {
        const content = {
            transcript: transcription,
            notes: notes
        };
        saveIdea('rehearsal', JSON.stringify(content), title);
        onIdeaSaved();
        onReturnToStudio(); // Exit after saving
    };

    if (transcription.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                <MicrophoneIcon className="w-16 h-16 text-slate-600 mb-4" />
                <h3 className="text-xl font-bold text-slate-300">Rehearsal Complete</h3>
                <p className="text-slate-400 mt-2 mb-6">
                    {isFinalizing ? 'Processing your audio…' : 'No speech was transcribed during the session.'}
                </p>
                <button
                    onClick={() => onReturnToStudio()}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200 font-bold transition-colors"
                >
                    <BackIcon className="w-5 h-5" />
                    <span>Back to Studio</span>
                </button>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-4 md:p-6 flex-1 overflow-y-auto">
                <h3 className="text-xl font-bold text-slate-200 font-cinzel mb-4">Rehearsal Transcript</h3>
                <div className="space-y-4 bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                    {transcription.map((t, i) => (
                        <div key={i} className={`flex flex-col ${t.source === 'user' ? 'items-end' : 'items-start'}`}>
                            <span className="text-xs text-slate-400 px-2 mb-0.5 font-semibold">
                                {t.source === 'user' ? 'You' : 'AI Coach'}
                            </span>
                            <p className={`max-w-xl px-4 py-2 rounded-lg ${t.source === 'user' ? 'bg-purple-800 text-white' : 'bg-slate-700 text-slate-200'}`}>
                                {t.text}
                            </p>
                        </div>
                    ))}
                    <div ref={transcriptEndRef} />
                </div>
            </div>
            <footer className="p-4 border-t border-slate-800 flex flex-col items-center justify-center gap-4">
                {showSaveForm ? (
                    <div className="w-full max-w-lg mx-auto space-y-4 p-4 bg-slate-900/50 rounded-lg border border-slate-700 animate-fade-in">
                        <h4 className="font-bold text-white text-lg">Save Rehearsal Session</h4>
                        <div>
                            <label htmlFor="rehearsal-title" className="block text-sm font-medium text-slate-300 mb-1">Title</label>
                            <input
                                id="rehearsal-title"
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white focus:outline-none focus:border-purple-500"
                            />
                        </div>
                        <div>
                            <label htmlFor="rehearsal-notes" className="block text-sm font-medium text-slate-300 mb-1">Notes (Optional)</label>
                            <textarea
                                id="rehearsal-notes"
                                rows={3}
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="e.g., First run-through of the new opener. Focus on comedic timing."
                                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white focus:outline-none focus:border-purple-500"
                            />
                        </div>
                        <div className="flex gap-3 pt-2">
                             <button
                                onClick={() => setShowSaveForm(false)}
                                className="w-full flex items-center justify-center gap-2 px-6 py-2 text-sm bg-slate-600 hover:bg-slate-700 rounded-md text-slate-200 font-bold transition-colors"
                            >
                                Cancel
                            </button>
                             <button
                                onClick={handleConfirmSave}
                                className="w-full flex items-center justify-center gap-2 px-6 py-2 text-sm bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold transition-colors"
                            >
                                <SaveIcon className="w-5 h-5" />
                                <span>Confirm Save & Exit</span>
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                        <button
                            onClick={() => setShowSaveForm(true)}
                            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 text-sm bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold transition-colors"
                        >
                            <SaveIcon className="w-5 h-5" />
                            <span>Save & Exit</span>
                        </button>
                        <button
                            onClick={() => onReturnToStudio(transcription)}
                            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200 font-bold transition-colors"
                        >
                            <WandIcon className="w-5 h-5" />
                            <span>Discuss with AI</span>
                        </button>
                        <button
                            onClick={() => onReturnToStudio()}
                            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 text-sm text-slate-400 hover:text-white transition-colors"
                        >
                            <TrashIcon className="w-5 h-5" />
                            <span>Discard & Exit</span>
                        </button>
                    </div>
                )}
            </footer>
        </div>
    );
};


export default LiveRehearsal;
