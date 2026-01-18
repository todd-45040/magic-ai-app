import React, { useState, useEffect, useRef } from 'react';
// NOTE: This project does not depend on react-router-dom. Navigation is handled
// by the parent App shell (props callback) and/or a simple location redirect.
import { LiveServerMessage, FunctionCall } from '@google/genai';
import { startLiveSession, decode, decodeAudioData, type LiveSession } from '../services/geminiService';
import { deleteIdea, getRehearsalSessions, saveIdea } from '../services/ideasService';
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
    int16[i] = data[i] * 32768;
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

    // Rehearsal History (saved sessions)
    const [historyOpen, setHistoryOpen] = useState(true);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState<string>('');
    const [rehearsalHistory, setRehearsalHistory] = useState<Array<{ id: string; title?: string; createdAt: string; transcriptCount: number; notesPreview: string; raw: string }>>([]);
    const [historyModal, setHistoryModal] = useState<null | { id: string; title?: string; createdAt: string; transcript: Transcription[]; notes: string }>(null);
    
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
        transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [transcriptionHistory]);

    // ---- Rehearsal History helpers ----
    const parseRehearsalContent = (content: string): { transcript: Transcription[]; notes: string } => {
        try {
            const parsed = JSON.parse(content || '{}');
            const t = Array.isArray(parsed?.transcript) ? parsed.transcript : [];
            const transcript: Transcription[] = t
                .map((x: any) => ({
                    source: x?.source === 'ai' ? 'ai' : 'user',
                    text: String(x?.text ?? ''),
                }))
                .filter((x: Transcription) => x.text.trim().length > 0);
            const notes = typeof parsed?.notes === 'string' ? parsed.notes : '';
            return { transcript, notes };
        } catch {
            return { transcript: [], notes: '' };
        }
    };

    const loadHistory = async () => {
        setHistoryLoading(true);
        setHistoryError('');
        try {
            const rows = await getRehearsalSessions(50);
            const mapped = rows.map((r) => {
                const createdAt = r.timestamp ? new Date(r.timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';
                const parsed = parseRehearsalContent(r.content);
                const notesPreview = (parsed.notes || '').trim().slice(0, 140);
                return {
                    id: r.id,
                    title: r.title,
                    createdAt,
                    transcriptCount: parsed.transcript.length,
                    notesPreview,
                    raw: r.content,
                };
            });
            setRehearsalHistory(mapped);
        } catch (e: any) {
            setHistoryError(String(e?.message || e || 'Failed to load rehearsal history.'));
        } finally {
            setHistoryLoading(false);
        }
    };

    // Load history when landing on the idle screen.
    useEffect(() => {
        if (view === 'idle') {
            loadHistory();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [view]);

    const cleanupSession = () => {
        // Stop recorder if still running (best-effort)
        try {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                mediaRecorderRef.current.stop();
            }
        } catch {
            // ignore
        }
        mediaRecorderRef.current = null;
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

    const getUserText = (items: Transcription[]) =>
        items
            .filter((t) => t.source === 'user')
            .map((t) => t.text)
            .join(' ')
            .trim();

    const transcribeOnServerIfNeeded = async () => {
        // Only attempt server transcription if we have no user transcript.
        const existing = getUserText(transcriptionHistory);
        if (existing) {
            pushDebug('transcribe_skipped', { reason: 'existing_user_transcript', len: existing.length });
            return;
        }

        const chunks = recordedChunksRef.current;
        const mimeType = (recordedMimeTypeRef.current || 'audio/webm').split(';')[0];
        const bytes = chunks.reduce((sum: number, c: any) => sum + (c?.size || 0), 0);

        if (!chunks.length || bytes < 1024) {
            pushDebug('transcribe_skipped', { reason: 'no_audio_chunks', chunks: chunks.length, bytes });
            return;
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
                setTranscriptionHistory([{ source: 'user', text: transcript, isFinal: true } as any]);
            }
        } catch (err: any) {
            pushDebug('transcribe_error', { message: String(err?.message || err) });
            try {
                (window as any).__REHEARSAL_TRANSCRIBE__ = { status: 0, ok: false, error: String(err?.message || err), len: 0, preview: '', ts: Date.now() };
            } catch {
                // ignore
            }
        }
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
        await transcribeOnServerIfNeeded();

        cleanupSession();
        setView('reviewing');
    };
    
    const handleHeaderButtonClick = () => {
        if (view === 'rehearsing') {
            void handleStopRehearsal();
        } else {
            cleanupSession();
            safeReturnToStudio();
        }
    };
    
    const renderContent = () => {
        switch(view) {
            case 'reviewing':
                return <ReviewView 
                    transcription={transcriptionHistory}
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
                            <div className="flex-1 flex flex-col items-center justify-center gap-10">
                                <StatusIndicator status={status} errorMessage={errorMessage} onStart={handleStartSession} />

                                {/* Rehearsal History */}
                                {view === 'idle' && (
                                    <div className="w-full max-w-3xl mx-auto">
                                        <div className="bg-slate-900/40 border border-slate-700 rounded-lg overflow-hidden">
                                            <button
                                                type="button"
                                                onClick={() => setHistoryOpen((v) => !v)}
                                                className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-800/40 transition-colors"
                                            >
                                                <div>
                                                    <div className="text-slate-200 font-bold">Rehearsal History</div>
                                                    <div className="text-xs text-slate-400">Your saved Live Rehearsal sessions (most recent first)</div>
                                                </div>
                                                <div className="text-slate-400 text-sm font-semibold">
                                                    {historyOpen ? 'Hide' : 'Show'}
                                                </div>
                                            </button>

                                            {historyOpen && (
                                                <div className="px-4 pb-4">
                                                    <div className="flex items-center justify-between gap-3 pt-3">
                                                        <div className="text-xs text-slate-400">
                                                            {historyLoading ? 'Loading sessions…' : `${rehearsalHistory.length} session${rehearsalHistory.length === 1 ? '' : 's'}`}
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => loadHistory()}
                                                            className="text-xs px-3 py-1 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-100 font-semibold transition-colors"
                                                        >
                                                            Refresh
                                                        </button>
                                                    </div>

                                                    {historyError && (
                                                        <div className="mt-3 text-sm text-red-300 bg-red-900/20 border border-red-700/40 rounded-md px-3 py-2">
                                                            {historyError}
                                                        </div>
                                                    )}

                                                    {!historyLoading && rehearsalHistory.length === 0 && !historyError && (
                                                        <div className="mt-4 text-sm text-slate-400">
                                                            No saved sessions yet. After you stop a rehearsal, choose <span className="text-slate-200 font-semibold">Save & Exit</span> to add it here.
                                                        </div>
                                                    )}

                                                    <div className="mt-4 space-y-3">
                                                        {rehearsalHistory.map((s) => (
                                                            <div key={s.id} className="flex flex-col sm:flex-row sm:items-center gap-3 bg-slate-800/40 border border-slate-700 rounded-lg p-3">
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="text-slate-100 font-semibold truncate">{s.title || 'Untitled rehearsal'}</div>
                                                                        <div className="text-xs text-slate-400 whitespace-nowrap">· {s.createdAt}</div>
                                                                    </div>
                                                                    <div className="text-xs text-slate-400 mt-1">
                                                                        {s.transcriptCount} line{s.transcriptCount === 1 ? '' : 's'}{s.notesPreview ? ` · Notes: ${s.notesPreview}${s.notesPreview.length >= 140 ? '…' : ''}` : ''}
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            const parsed = parseRehearsalContent(s.raw);
                                                                            setHistoryModal({ id: s.id, title: s.title, createdAt: s.createdAt, transcript: parsed.transcript, notes: parsed.notes });
                                                                        }}
                                                                        className="px-3 py-2 text-xs rounded-md bg-slate-700 hover:bg-slate-600 text-slate-100 font-semibold transition-colors"
                                                                    >
                                                                        View
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            const parsed = parseRehearsalContent(s.raw);
                                                                            safeReturnToStudio(parsed.transcript);
                                                                        }}
                                                                        className="px-3 py-2 text-xs rounded-md bg-purple-600 hover:bg-purple-700 text-white font-semibold transition-colors"
                                                                    >
                                                                        Discuss with AI
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={async () => {
                                                                            if (!confirm('Delete this rehearsal session? This cannot be undone.')) return;
                                                                            try {
                                                                                await deleteIdea(s.id);
                                                                                await loadHistory();
                                                                            } catch (e: any) {
                                                                                setHistoryError(String(e?.message || e || 'Failed to delete session.'));
                                                                            }
                                                                        }}
                                                                        className="px-3 py-2 text-xs rounded-md text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
                                                                    >
                                                                        Delete
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
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

            {historyModal && (
                <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
                    <div className="w-full max-w-4xl bg-slate-900 border border-slate-700 rounded-lg shadow-xl overflow-hidden">
                        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                            <div className="min-w-0">
                                <div className="text-slate-100 font-bold truncate">{historyModal.title || 'Untitled rehearsal'}</div>
                                <div className="text-xs text-slate-400">{historyModal.createdAt}</div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => safeReturnToStudio(historyModal.transcript)}
                                    className="px-3 py-2 text-xs rounded-md bg-purple-600 hover:bg-purple-700 text-white font-semibold transition-colors"
                                >
                                    Discuss with AI
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setHistoryModal(null)}
                                    className="px-3 py-2 text-xs rounded-md bg-slate-700 hover:bg-slate-600 text-slate-100 font-semibold transition-colors"
                                >
                                    Close
                                </button>
                            </div>
                        </div>

                        <div className="p-4 md:p-6 max-h-[75vh] overflow-y-auto">
                            {historyModal.notes && (
                                <div className="mb-4">
                                    <div className="text-xs text-slate-400 font-semibold mb-1">Notes</div>
                                    <div className="text-sm text-slate-200 bg-slate-800/40 border border-slate-700 rounded-lg p-3 whitespace-pre-wrap">
                                        {historyModal.notes}
                                    </div>
                                </div>
                            )}

                            <div className="text-xs text-slate-400 font-semibold mb-2">Transcript</div>
                            <div className="space-y-4 bg-slate-800/30 border border-slate-700 rounded-lg p-4">
                                {historyModal.transcript.length === 0 ? (
                                    <div className="text-sm text-slate-400">No transcript text was found for this session.</div>
                                ) : (
                                    historyModal.transcript.map((t, i) => (
                                        <div key={i} className={`flex flex-col ${t.source === 'user' ? 'items-end' : 'items-start'}`}>
                                            <span className="text-xs text-slate-400 px-2 mb-0.5 font-semibold">{t.source === 'user' ? 'You' : 'AI Coach'}</span>
                                            <p className={`max-w-3xl px-4 py-2 rounded-lg ${t.source === 'user' ? 'bg-purple-800 text-white' : 'bg-slate-700 text-slate-200'}`}>{t.text}</p>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
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
    onIdeaSaved: () => void;
    onReturnToStudio: (transcriptToDiscuss?: Transcription[]) => void;
}> = ({ transcription, onIdeaSaved, onReturnToStudio }) => {
    const transcriptEndRef = useRef<HTMLDivElement>(null);
    const [showSaveForm, setShowSaveForm] = useState(false);
    const [title, setTitle] = useState(`Rehearsal - ${new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`);
    const [notes, setNotes] = useState('');
    const [saveError, setSaveError] = useState<string>('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [transcription]);
    
    const handleConfirmSave = async () => {
        setSaveError('');
        setIsSaving(true);
        try {
            const content = {
                transcript: transcription,
                notes: notes,
            };

            // Backward-compatible ideasService supports both signatures.
            // Prefer object form to match the DB schema (created_at-based).
            await saveIdea({ type: 'rehearsal', content: JSON.stringify(content), title });
            onIdeaSaved();
            onReturnToStudio(); // Exit after saving
        } catch (err: any) {
            const msg = String(err?.message || err || 'Failed to save rehearsal.');
            setSaveError(msg);
        } finally {
            setIsSaving(false);
        }
    };

    if (transcription.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                <MicrophoneIcon className="w-16 h-16 text-slate-600 mb-4" />
                <h3 className="text-xl font-bold text-slate-300">Rehearsal Complete</h3>
                <p className="text-slate-400 mt-2 mb-6">No speech was transcribed during the session.</p>
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
                        {saveError && (
                            <div className="text-sm text-red-300 bg-red-900/20 border border-red-700/40 rounded-md px-3 py-2">
                                {saveError}
                            </div>
                        )}
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
                                disabled={isSaving}
                                className={`w-full flex items-center justify-center gap-2 px-6 py-2 text-sm rounded-md text-white font-bold transition-colors ${isSaving ? 'bg-purple-700/60 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700'}`}
                            >
                                <SaveIcon className="w-5 h-5" />
                                <span>{isSaving ? 'Saving…' : 'Confirm Save & Exit'}</span>
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
