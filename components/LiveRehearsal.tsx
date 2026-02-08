import React, { useState, useEffect, useRef } from 'react';
// NOTE: This project does not depend on react-router-dom. Navigation is handled
// by the parent App shell (props callback) and/or a simple location redirect.
import { LiveServerMessage, FunctionCall } from '@google/genai';
import { startLiveSession, decode, decodeAudioData, type LiveSession } from '../services/geminiService';
import { saveIdea, updateIdea, getRehearsalSessions } from '../services/ideasService';
import type { Transcription, TimerState, User } from '../types';
import { canConsume, consumeLiveMinutes, getUsage } from '../services/usageTracker';
import { MAGICIAN_LIVE_REHEARSAL_SYSTEM_INSTRUCTION, LIVE_REHEARSAL_TOOLS } from '../constants';
import { BackIcon, MicrophoneIcon, StopIcon, SaveIcon, WandIcon, TrashIcon, TimerIcon } from './icons';

// ---- Debug instrumentation (enabled via ?debugRehearsal=1 or localStorage MAW_DEBUG_REHEARSAL=1) ----
type DebugEvent = { ts: number; event: string; data?: any };

function isDebugEnabled(): boolean {
  try {
    const qs = new URLSearchParams(window.location.search);
    if (qs.get('debugRehearsal') === '1') return true;
    return localStorage.getItem('MAW_DEBUG_REHEARSAL') === '1';
  } catch {
    return false;
  }
}

function pushDebug(event: string, data?: any) {
  try {
    const w = window as any;
    if (!w.__REHEARSAL_DEBUG__) {
      w.__REHEARSAL_DEBUG__ = { enabled: isDebugEnabled(), buildTs: Date.now(), events: [] as DebugEvent[], summary: {} as any };
    }
    if (!w.__REHEARSAL_DEBUG__.enabled) return;
    w.__REHEARSAL_DEBUG__.events.push({ ts: Date.now(), event, data });
    w.__REHEARSAL_DEBUG__.summary.lastEvent = { ts: Date.now(), event, data };
  } catch {
    // ignore
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

interface LiveRehearsalProps {
  user: User;
  onReturnToStudio: (transcriptToDiscuss?: Transcription[]) => void;
  onIdeaSaved: () => void;
}

// Helper functions for audio processing, moved from geminiService
type GeminiBlob = {
  data: string;
  mimeType: string;
};

function encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function createBlob(data: Float32Array): GeminiBlob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    // Clamp to [-1, 1] and use asymmetric scaling to avoid overflow/wrap distortion.
    const s = Math.max(-1, Math.min(1, data[i]));
    int16[i] = s < 0 ? s * 32768 : s * 32767;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}


const LiveRehearsal: React.FC<LiveRehearsalProps> = ({ user, onReturnToStudio, onIdeaSaved }) => {
    const [view, setView] = useState<'idle' | 'rehearsing' | 'reviewing'>('idle');
    const [status, setStatus] = useState<'idle' | 'connecting' | 'listening' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState('');
    const [transcriptionHistory, setTranscriptionHistory] = useState<Transcription[]>([]);
    
    const sessionRef = useRef<LiveSession | null>(null);
    const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
    const cleanupMicStreamRef = useRef<(() => void) | null>(null);
    const errorOccurred = useRef(false);

    // Ground-truth recording (for server-side transcription fallback)
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordedChunksRef = useRef<BlobPart[]>([]);
    const recordedMimeTypeRef = useRef<string>('audio/webm');

    // Audio playback refs
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const outputNodeRef = useRef<GainNode | null>(null);
    const sourcesRef = useRef(new Set<AudioBufferSourceNode>());
    const nextStartTimeRef = useRef(0);
    
    // Timer state and refs
    const [timer, setTimer] = useState<TimerState>({ startTime: null, duration: null, isRunning: false });
    const timerIntervalRef = useRef<number | null>(null);

    // --- Multi-take session state ---
    type Take = {
        takeNumber: number;
        startedAt: number;
        endedAt: number;
        transcript: Transcription[];
    };

    type RehearsalSessionContentV2 = {
        version: 2;
        title: string;
        notes?: string;
        takes: Take[];
    };

    const [sessionIdeaId, setSessionIdeaId] = useState<string | null>(null);
    const [sessionTitle, setSessionTitle] = useState<string>(() => `Live Rehearsal Session - ${new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`);
    const [sessionNotes, setSessionNotes] = useState<string>('');
    const [takes, setTakes] = useState<Take[]>([]);
    const [selectedTake, setSelectedTake] = useState<number>(0);

    const currentTakeStartRef = useRef<number | null>(null);
    const transcriptionHistoryRef = useRef<Transcription[]>([]);

    /**
     * "Back to Studio" navigation is handled by the MagicianMode shell.
     * (This project does not use react-router.)
     */
    const safeReturnToStudio = (transcriptToDiscuss?: Transcription[]) => {
        try {
            onReturnToStudio?.(transcriptToDiscuss);
        } catch {
            // ignore
        }
    };

    // Usage tracking (client-side, per-day)
    const sessionStartRef = useRef<number | null>(null);
    const usageIntervalRef = useRef<number | null>(null);

    const transcriptEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        transcriptionHistoryRef.current = transcriptionHistory;
        transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [transcriptionHistory]);

    const safeCleanupSession = async () => {
        // Best-effort cleanup: never allow cleanup errors to crash navigation.
        // Stop recorder if still running
        try {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                mediaRecorderRef.current.stop();
            }
        } catch {
            // ignore
        }
        mediaRecorderRef.current = null;

        try {
            if (sessionRef.current) {
                sessionRef.current.close();
                sessionRef.current = null;
            }
        } catch {
            // ignore
        }

        try {
            if (cleanupMicStreamRef.current) {
                cleanupMicStreamRef.current();
                cleanupMicStreamRef.current = null;
            }
        } catch {
            // ignore
        }

        try {
            if (outputAudioContextRef.current) {
                const ctx = outputAudioContextRef.current;
                outputAudioContextRef.current = null;
                if ((ctx as any).state !== 'closed') {
                    await ctx.close().catch(() => void 0);
                }
            }
        } catch {
            // ignore
        }

        try {
            if (timerIntervalRef.current) {
                clearInterval(timerIntervalRef.current);
                timerIntervalRef.current = null;
            }
        } catch {
            // ignore
        }

        try {
            if (usageIntervalRef.current) {
                clearInterval(usageIntervalRef.current);
                usageIntervalRef.current = null;
            }
        } catch {
            // ignore
        }

        sessionStartRef.current = null;
        setTimer({ startTime: null, duration: null, isRunning: false });
        setStatus('idle');
    };

    useEffect(() => {
        return () => {
            void safeCleanupSession();
        };
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
        currentTakeStartRef.current = Date.now();
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

            pushDebug('mic_acquired', {
                trackCount: stream.getAudioTracks().length,
                settings: stream.getAudioTracks()[0]?.getSettings?.(),
                constraints: stream.getAudioTracks()[0]?.getConstraints?.(),
            });

            // Start a parallel MediaRecorder capture so we can always transcribe server-side
            // even when Live inputTranscription doesn't come through.
            try {
                const preferred = 'audio/webm;codecs=opus';
                const mimeType = (window as any).MediaRecorder?.isTypeSupported?.(preferred)
                    ? preferred
                    : ((window as any).MediaRecorder?.isTypeSupported?.('audio/webm') ? 'audio/webm' : '');
                recordedChunksRef.current = [];
                const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
                recordedMimeTypeRef.current = mimeType || recorder.mimeType || 'audio/webm';
                recorder.ondataavailable = (e) => {
                    if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data);
                };
                recorder.onerror = (e: any) => {
                    pushDebug('media_recorder_error', { message: String(e?.error?.message || e?.message || e) });
                };
                recorder.onstart = () => {
                    pushDebug('media_recorder_start', { mimeType: recorder.mimeType });
                };
                recorder.onstop = () => {
                    pushDebug('media_recorder_stop', {
                        chunks: recordedChunksRef.current.length,
                        bytes: recordedChunksRef.current.reduce((sum: number, c: any) => sum + (c?.size || 0), 0),
                    });
                };
                mediaRecorderRef.current = recorder;
                // timeslice ensures we always get dataavailable events
                recorder.start(250);
            } catch (err: any) {
                pushDebug('media_recorder_failed', { message: String(err?.message || err) });
                // continue; Live session can still work without this
            }

            // Setup output audio context
            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            outputAudioContextRef.current = audioCtx;
            outputNodeRef.current = audioCtx.createGain();
            outputNodeRef.current.connect(audioCtx.destination);
            
            // FIX: Create input audio context with the stream's native sample rate to avoid mismatches.
            const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            let source: MediaStreamAudioSourceNode | null = null;
            let scriptProcessor: ScriptProcessorNode | null = null;
            let zeroGain: GainNode | null = null;

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
                            // Use the session promise to send data, preventing race conditions
                            sessionPromise.then((session) => {
                                session.sendRealtimeInput({ media: pcmBlob });
                            });
                        };

                        source.connect(scriptProcessor);
                        // Keep the ScriptProcessorNode alive without routing audible audio to speakers.
                        zeroGain = inputAudioContext.createGain();
                        zeroGain.gain.value = 0;
                        scriptProcessor.connect(zeroGain);
                        zeroGain.connect(inputAudioContext.destination);

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
                                void handleStopRehearsal('Daily live rehearsal minutes reached. Upgrade to continue.');
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
                if(zeroGain) zeroGain.disconnect();
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

        // Some model turns include multiple parts (text + audio). Scan all parts for inline audio.
        const parts = message.serverContent?.modelTurn?.parts || [];
        const audioPart = parts.find((p: any) => {
            const mime = String(p?.inlineData?.mimeType || '');
            return Boolean(p?.inlineData?.data) && mime.startsWith('audio/');
        });
        const base64Audio = audioPart?.inlineData?.data;
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

    const getUserText = (items: Transcription[]) =>
        items
            .filter((t) => t.source === 'user')
            .map((t) => t.text)
            .join(' ')
            .trim();

    /**
     * Ensure we have a usable USER transcript for the take.
     *
     * IMPORTANT: React state updates are async. Callers should use the returned
     * value rather than reading `transcriptionHistoryRef.current` immediately
     * after this function.
     */
    const transcribeOnServerIfNeeded = async (): Promise<Transcription[]> => {
        // Only attempt server transcription if we already have user transcript.
        const existing = getUserText(transcriptionHistory);
        if (existing) {
            pushDebug('transcribe_skipped', { reason: 'existing_user_transcript', len: existing.length });
            return Array.isArray(transcriptionHistory) ? transcriptionHistory : [];
        }

        const chunks = recordedChunksRef.current;
        const mimeType = (recordedMimeTypeRef.current || 'audio/webm').split(';')[0];
        const bytes = chunks.reduce((sum: number, c: any) => sum + (c?.size || 0), 0);

        if (!chunks.length || bytes < 1024) {
            pushDebug('transcribe_skipped', { reason: 'no_audio_chunks', chunks: chunks.length, bytes });
            return Array.isArray(transcriptionHistory) ? transcriptionHistory : [];
        }

        const blob = new Blob(chunks, { type: mimeType });
        try {
            const w = window as any;
            w.__REHEARSAL_AUDIO__ = { size: blob.size, type: blob.type, ts: Date.now() };
            w.__REHEARSAL_AUDIO_URL__ = URL.createObjectURL(blob);
        } catch {
            // ignore
        }

        pushDebug('audio_finalized', { chunks: chunks.length, bytes: blob.size, type: blob.type });

        const audioBase64 = await blobToBase64(blob);
        pushDebug('transcribe_request', { bytes: blob.size, mimeType: blob.type, base64Len: audioBase64.length });

        try {
            const res = await fetch('/api/transcribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ audioBase64, mimeType: blob.type }),
            });
            const json = await res.json().catch(() => ({}));
            const transcript = String(json?.transcript || '').trim();

            const w = window as any;
            w.__REHEARSAL_TRANSCRIBE__ = {
                status: res.status,
                ok: res.ok,
                error: json?.error ? String(json.error) : '',
                len: transcript.length,
                preview: transcript.slice(0, 160),
                ts: Date.now(),
            };

            pushDebug('transcribe_response', {
                status: res.status,
                ok: res.ok,
                len: transcript.length,
                error: json?.error ? String(json.error).slice(0, 200) : '',
            });

            if (res.ok && transcript) {
                const finalHistory: Transcription[] = [{ source: 'user', text: transcript, isFinal: true } as any];
                setTranscriptionHistory(finalHistory);
                return finalHistory;
            }
        } catch (err: any) {
            pushDebug('transcribe_error', { message: String(err?.message || err) });
            try {
                (window as any).__REHEARSAL_TRANSCRIBE__ = { status: 0, ok: false, error: String(err?.message || err), len: 0, preview: '', ts: Date.now() };
            } catch {
                // ignore
            }
        }

        return Array.isArray(transcriptionHistory) ? transcriptionHistory : [];
    };

    const stopRecorderAndFlush = async () => {
        const recorder = mediaRecorderRef.current;
        if (!recorder || recorder.state === 'inactive') return;
        try {
            recorder.requestData?.();
        } catch {
            // ignore
        }

        await new Promise<void>((resolve) => {
            const onStop = () => {
                recorder.removeEventListener('stop', onStop);
                resolve();
            };
            recorder.addEventListener('stop', onStop);
            try {
                recorder.stop();
            } catch {
                recorder.removeEventListener('stop', onStop);
                resolve();
            }
        });
    };

    const handleStopRehearsal = async (reason?: string) => {
        // Record minutes used for the current session.
        const start = sessionStartRef.current;
        if (start) {
            const minutes = (Date.now() - start) / 60000;
            consumeLiveMinutes(user, minutes);
            sessionStartRef.current = null;
        }
        if (reason) setErrorMessage(reason);

        // Stop recording and flush last chunks BEFORE we tear down tracks.
        await stopRecorderAndFlush();

        // Try to transcribe server-side if Live inputTranscription didn't arrive.
        // Use the returned transcript immediately (do not rely on state/ref sync).
        const finalizedHistory = await transcribeOnServerIfNeeded();

        // Finalize this take
        try {
            // Prefer storing only USER transcript. But if we have none (e.g., transcription failed),
            // store whatever we have so the take isn't "empty".
            const all = Array.isArray(finalizedHistory) ? finalizedHistory : [];
            const userOnly = all.filter((t) => t?.source === 'user');
            const takeTranscript = userOnly.length ? userOnly : all;
            const startedAt = currentTakeStartRef.current ?? Date.now();
            const endedAt = Date.now();
            setTakes((prev) => {
                const takeNumber = (prev?.length ?? 0) + 1;
                const next = [...(prev ?? []), { takeNumber, startedAt, endedAt, transcript: takeTranscript } as any];
                setSelectedTake(Math.max(0, next.length - 1));
                return next as any;
            });
        } catch {
            // ignore
        } finally {
            currentTakeStartRef.current = null;
        }

        await safeCleanupSession();
        setView('reviewing');
    };
    
    const handleHeaderButtonClick = async () => {
        try {
            if (view === 'rehearsing') {
                // Stop & Review button in header
                await handleStopRehearsal();
            } else {
                // Back to Studio button in header
                await safeCleanupSession();
                safeReturnToStudio();
            }
        } catch (err) {
            console.error('Header action failed:', err);
            setError('Something went wrong. Please refresh and try again.');
            setView('error');
        }
    };
    
    const renderContent = () => {
        switch(view) {
            case 'reviewing':
                return <ReviewView
                    takes={takes}
                    selectedTake={selectedTake}
                    sessionIdeaId={sessionIdeaId}
                    sessionTitle={sessionTitle}
                    sessionNotes={sessionNotes}
                    onChangeTitle={setSessionTitle}
                    onChangeNotes={setSessionNotes}
                    onSelectTake={setSelectedTake}
                    onStartNewTake={() => void handleStartSession()}
                    onResetSession={() => {
                        setSessionIdeaId(null);
                        setSessionTitle(`Live Rehearsal Session - ${new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`);
                        setSessionNotes('');
                        setTakes([]);
                        setSelectedTake(0);
                        setTranscriptionHistory([]);
                        setErrorMessage('');
                        setStatus('idle');
                        setView('idle');
                    }}
                    onSessionSaved={(id) => setSessionIdeaId(id)}
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
                            <div className="flex-1 flex flex-col items-center justify-center gap-6">
                                <StatusIndicator status={status} errorMessage={errorMessage} onStart={handleStartSession} />
                                {view === 'idle' && status !== 'connecting' && (
                                    <div className="w-full max-w-3xl">
                                        <RehearsalHistory onDiscuss={(t) => safeReturnToStudio(t)} />
                                    </div>
                                )}
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

type RehearsalHistoryItem = {
    id: string;
    title: string;
    createdAt: string;
    transcript: Transcription[];
    notes: string;
};

const RehearsalHistory: React.FC<{ onDiscuss: (transcript: Transcription[]) => void }> = ({ onDiscuss }) => {
    const [expanded, setExpanded] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string>('');
    const [items, setItems] = useState<RehearsalHistoryItem[]>([]);

    const load = async () => {
        setError('');
        setLoading(true);
        try {
            const rows = await getRehearsalSessions(25);
            const parsed: RehearsalHistoryItem[] = (rows ?? []).map((r) => {
                const createdAt = new Date(r.timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
                let transcript: Transcription[] = [];
                let notes = '';
                try {
                    const obj = JSON.parse(String(r.content || ''));
                    // v1 shape: { transcript: [...], notes: string }
                    if (Array.isArray(obj?.transcript)) {
                        transcript = obj.transcript as any;
                    }
                    // v2 shape: { version: 2, takes: [...], notes: string }
                    if (Array.isArray(obj?.takes)) {
                        const combined: Transcription[] = [];
                        for (const take of obj.takes) {
                            const n = Number(take?.takeNumber ?? 0) || combined.length + 1;
                            combined.push({ source: 'model', text: `— Take ${n} —`, isFinal: true } as any);
                            if (Array.isArray(take?.transcript)) {
                                for (const seg of take.transcript) combined.push(seg as any);
                            }
                        }
                        transcript = combined;
                    }
                    if (typeof obj?.notes === 'string') notes = obj.notes;
                } catch {
                    // If content isn't JSON, treat it as plain transcript text
                    const t = String(r.content || '').trim();
                    transcript = t ? ([{ source: 'user', text: t, isFinal: true }] as any) : [];
                }
                return {
                    id: r.id,
                    title: r.title || 'Rehearsal',
                    createdAt,
                    transcript,
                    notes,
                };
            });
            setItems(parsed);
        } catch (e: any) {
            setError(String(e?.message || e || 'Failed to load rehearsal history.'));
            setItems([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
        const onSaved = () => void load();
        window.addEventListener('maw-rehearsal-saved', onSaved as any);
        return () => window.removeEventListener('maw-rehearsal-saved', onSaved as any);
    }, []);

    if (!expanded) {
        return (
            <div className="w-full bg-slate-900/30 border border-slate-700 rounded-lg px-4 py-3 flex items-center justify-between">
                <div>
                    <div className="text-slate-200 font-semibold">Rehearsal History</div>
                    <div className="text-xs text-slate-400">Your saved Live Rehearsal sessions (most recent first)</div>
                </div>
                <button
                    onClick={() => setExpanded(true)}
                    className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-md text-slate-100 text-sm font-semibold transition-colors"
                >
                    Show
                </button>
            </div>
        );
    }

    return (
        <div className="w-full bg-slate-900/30 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <div className="text-slate-200 font-semibold">Rehearsal History</div>
                    <div className="text-xs text-slate-400">Your saved Live Rehearsal sessions (most recent first)</div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => void load()}
                        className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-md text-slate-100 text-sm font-semibold transition-colors"
                    >
                        {loading ? 'Loading…' : 'Refresh'}
                    </button>
                    <button
                        onClick={() => setExpanded(false)}
                        className="px-3 py-1.5 bg-transparent hover:bg-slate-800/40 rounded-md text-slate-300 text-sm font-semibold transition-colors"
                    >
                        Hide
                    </button>
                </div>
            </div>

            {error && (
                <div className="mt-3 text-sm text-red-300 bg-red-900/20 border border-red-700/40 rounded-md px-3 py-2">
                    {error}
                </div>
            )}

            <div className="mt-4 text-sm text-slate-300">
                <div className="mb-2">{items.length} session{items.length === 1 ? '' : 's'}</div>
                {items.length === 0 ? (
                    <div className="text-slate-400">No saved sessions yet. After you stop a rehearsal, choose <span className="text-slate-200 font-semibold">Save &amp; Exit</span> to add it here.</div>
                ) : (
                    <div className="space-y-3">
                        {items.map((it) => (
                            <div key={it.id} className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-800/30 border border-slate-700 rounded-lg px-4 py-3">
                                <div className="min-w-0">
                                    <div className="text-slate-100 font-semibold truncate">{it.title}</div>
                                    <div className="text-xs text-slate-400">
                                        {it.createdAt} • {it.transcript.filter(t => t?.source === 'user').length} user segment{it.transcript.filter(t => t?.source === 'user').length === 1 ? '' : 's'}
                                    </div>
                                    {it.notes ? (
                                        <div className="text-xs text-slate-300/80 mt-1 line-clamp-2">{it.notes}</div>
                                    ) : null}
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => onDiscuss(it.transcript)}
                                        className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 rounded-md text-white text-sm font-semibold transition-colors"
                                    >
                                        Discuss with AI
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};


const ReviewView: React.FC<{
    takes: { takeNumber: number; startedAt: number; endedAt: number; transcript: Transcription[] }[];
    selectedTake: number;
    sessionIdeaId: string | null;
    sessionTitle: string;
    sessionNotes: string;
    onChangeTitle: (t: string) => void;
    onChangeNotes: (n: string) => void;
    onSelectTake: (idx: number) => void;
    onStartNewTake: () => void;
    onResetSession: () => void;
    onSessionSaved: (id: string) => void;
    onIdeaSaved: () => void;
    onReturnToStudio: (transcriptToDiscuss?: Transcription[]) => void;
}> = ({
    takes,
    selectedTake,
    sessionIdeaId,
    sessionTitle,
    sessionNotes,
    onChangeTitle,
    onChangeNotes,
    onSelectTake,
    onStartNewTake,
    onResetSession,
    onSessionSaved,
    onIdeaSaved,
    onReturnToStudio,
}) => {
    const transcriptEndRef = useRef<HTMLDivElement>(null);
    const [saveError, setSaveError] = useState<string>('');
    const [saveSuccess, setSaveSuccess] = useState<string>('');
    const [isSaving, setIsSaving] = useState(false);

    const current = takes?.[selectedTake] ?? null;

    useEffect(() => {
        transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [selectedTake, takes]);

    const buildCombinedTranscript = (allTakes: typeof takes): Transcription[] => {
        const out: Transcription[] = [];
        for (const t of allTakes ?? []) {
            out.push({ source: 'model', text: `— Take ${t.takeNumber} —`, isFinal: true } as any);

            const segs = Array.isArray(t?.transcript) ? t.transcript : [];
            const hasUser = segs.some((s) => s?.source === 'user');

            // If a take somehow has no user segments (e.g., transcription fallback failed),
            // coerce remaining text segments to `user` so downstream “Discuss with AI”
            // still has something to analyze.
            const normalized = hasUser
                ? segs
                : segs.map((s) => ({ ...(s as any), source: 'user', isFinal: true }));

            for (const seg of normalized) out.push(seg as any);
        }
        return out;
    };

    const handleSaveSession = async () => {
        setSaveError('');
        setSaveSuccess('');
        setIsSaving(true);
        try {
            const content = {
                version: 2,
                title: sessionTitle,
                notes: sessionNotes,
                takes: takes ?? [],
            };

            if (!sessionIdeaId) {
                const saved = await saveIdea({ type: 'rehearsal', content: JSON.stringify(content), title: sessionTitle });
                onSessionSaved(saved.id);
            } else {
                await updateIdea(sessionIdeaId, { title: sessionTitle, content: JSON.stringify(content) } as any);
            }

            try {
                onIdeaSaved();
            } catch (cbErr: any) {
                console.error('onIdeaSaved callback failed:', cbErr);
            }

            try {
                window.dispatchEvent(new CustomEvent('maw-rehearsal-saved'));
            } catch {
                // ignore
            }

            setSaveSuccess('Saved successfully. You can start another take or continue refining your notes.');
        } catch (err: any) {
            setSaveError(String(err?.message || err || 'Failed to save rehearsal session.'));
        } finally {
            setIsSaving(false);
        }
    };

    const hasAnyTakes = (takes?.length ?? 0) > 0;

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-4 md:p-6 flex-1 overflow-y-auto space-y-5">
                <div className="flex flex-col gap-3">
                    <h3 className="text-xl font-bold text-slate-200 font-cinzel">Session Review</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Session Title</label>
                            <input
                                value={sessionTitle}
                                onChange={(e) => onChangeTitle(e.target.value)}
                                className="w-full px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                placeholder="e.g., Linking Rings Patter Session"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Session Notes</label>
                            <input
                                value={sessionNotes}
                                onChange={(e) => onChangeNotes(e.target.value)}
                                className="w-full px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                placeholder="What are you working on in this session?"
                            />
                        </div>
                    </div>

                    {saveError && (
                        <div className="text-sm text-red-300 bg-red-900/20 border border-red-700/40 rounded-md px-3 py-2">
                            {saveError}
                        </div>
                    )}
                    {saveSuccess && (
                        <div className="text-sm text-green-300 bg-green-900/20 border border-green-700/40 rounded-md px-3 py-2">
                            {saveSuccess}
                        </div>
                    )}
                </div>

                <div className="bg-slate-900/40 border border-slate-700 rounded-lg p-4">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <div className="text-slate-100 font-semibold">Takes</div>
                            <div className="text-xs text-slate-400">Record multiple takes in one session (Take 1, Take 2, Take 3…)</div>
                        </div>
                        <button
                            onClick={onStartNewTake}
                            className="px-3 py-2 bg-purple-600 hover:bg-purple-700 rounded-md text-white text-sm font-semibold transition-colors"
                        >
                            Start Next Take
                        </button>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                        {(takes ?? []).map((t, idx) => (
                            <button
                                key={t.takeNumber}
                                onClick={() => onSelectTake(idx)}
                                className={`px-3 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
                                    idx === selectedTake
                                        ? 'bg-purple-700/60 border-purple-500/60 text-white'
                                        : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700/60'
                                }`}
                            >
                                Take {t.takeNumber}
                            </button>
                        ))}
                        {!hasAnyTakes ? (
                            <div className="text-sm text-slate-400">No takes recorded yet.</div>
                        ) : null}
                    </div>
                </div>

                <div className="space-y-4 bg-slate-800/40 border border-slate-700 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                        <div className="text-slate-200 font-semibold">
                            {current ? `Transcript — Take ${current.takeNumber}` : 'Transcript'}
                        </div>
                        {hasAnyTakes ? (
                            <button
                                onClick={() => onReturnToStudio(buildCombinedTranscript(takes))}
                                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-md text-slate-100 text-sm font-semibold transition-colors"
                            >
                                Discuss all takes with AI
                            </button>
                        ) : null}
                    </div>

                    {current?.transcript?.length ? (
                        <div className="space-y-4">
                            {current.transcript.map((t, i) => (
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
                    ) : (
                        <div className="text-slate-400">No transcript for this take.</div>
                    )}
                </div>
            </div>

            <footer className="p-4 border-t border-slate-800 flex flex-col md:flex-row items-center justify-center gap-3">
                <button
                    onClick={handleSaveSession}
                    disabled={isSaving}
                    className={`w-full md:w-auto flex items-center justify-center gap-2 px-5 py-2.5 text-sm rounded-md font-bold transition-colors ${
                        isSaving ? 'bg-slate-700 text-slate-300' : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    }`}
                >
                    <SaveIcon className="w-4 h-4" />
                    <span>{isSaving ? 'Saving…' : (sessionIdeaId ? 'Save Session' : 'Save Session (first save)')}</span>
                </button>

                <button
                    onClick={() => onReturnToStudio(hasAnyTakes ? buildCombinedTranscript(takes) : undefined)}
                    className="w-full md:w-auto flex items-center justify-center gap-2 px-5 py-2.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200 font-bold transition-colors"
                >
                    <BackIcon className="w-5 h-5" />
                    <span>Back to Studio</span>
                </button>

                <button
                    onClick={onResetSession}
                    className="w-full md:w-auto flex items-center justify-center gap-2 px-5 py-2.5 text-sm bg-transparent hover:bg-slate-800/40 rounded-md text-slate-300 font-bold transition-colors"
                >
                    <TrashIcon className="w-5 h-5" />
                    <span>Start New Session</span>
                </button>
            </footer>
        </div>
    );
};


export default LiveRehearsal;
