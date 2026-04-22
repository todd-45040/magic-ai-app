import React, { useState, useEffect, useRef } from 'react';
// NOTE: This project does not depend on react-router-dom. Navigation is handled
// by the parent App shell (props callback) and/or a simple location redirect.
import { LiveServerMessage, FunctionCall } from '@google/genai';
import { startLiveSession, decode, decodeAudioData, type LiveSession, normalizeAiUserFacingError, getHighCostToolNotice } from '../services/geminiService';
import { saveIdea, updateIdea, getRehearsalSessions } from '../services/ideasService';
import type { Transcription, TimerState, User } from '../types';
import { canConsume, getUsage, consumeLiveMinutes, getSoftLimitWarning } from '../services/usageTracker';
import { consumeLiveMinutesServer, emitLiveUsageUpdate } from '../services/liveMinutesService';
import { fetchUsageStatus } from '../services/usageStatusService';
import { MAGICIAN_LIVE_REHEARSAL_SYSTEM_INSTRUCTION, LIVE_REHEARSAL_TOOLS } from '../constants';
import { BackIcon, MicrophoneIcon, StopIcon, SaveIcon, WandIcon, TrashIcon, TimerIcon, ChevronDownIcon, CheckIcon, LightbulbIcon } from './icons';
import BlockedPanel from './BlockedPanel';
import { normalizeBlockedUx, type BlockedUx } from '../services/blockedUx';
import { logEvent } from '../services/analyticsService';
import { trackClientEvent } from '../services/telemetryClient';
import { logUserActivity } from '../services/userActivityService';

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
  onOpenAngleRisk?: () => void;
  onOpenPatterEngine?: () => void;
  onOpenDirectorMode?: () => void;
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

function buildWavBlobFromFloat32(chunks: Float32Array[], sampleRate = 16000): Blob | null {
  if (!Array.isArray(chunks) || chunks.length === 0) return null;

  const totalSamples = chunks.reduce((sum, chunk) => sum + (chunk?.length || 0), 0);
  if (!totalSamples) return null;

  const pcm16 = new Int16Array(totalSamples);
  let offset = 0;
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i++) {
      const s = Math.max(-1, Math.min(1, chunk[i]));
      pcm16[offset++] = s < 0 ? s * 32768 : s * 32767;
    }
  }

  const dataSize = pcm16.byteLength;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (off: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(off + i, value.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  new Int16Array(buffer, 44).set(pcm16);
  return new Blob([buffer], { type: 'audio/wav' });
}




const MIN_TRANSCRIBE_AUDIO_BYTES = 8_000;
const MIN_TRANSCRIBE_AUDIO_DURATION_MS = 1_200;
const EMPTY_TRANSCRIPT_RETRY_MIN_CHARS = 8;
const AUDIO_WARMUP_MS = 400;
const FORCE_TRANSCRIBE_SOURCE: 'media_recorder' | 'pcm_wav' = 'media_recorder';

const delay = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

const DEMO_SCRIPT = `Good evening, everyone. I want to try a quick experiment in attention.
In a moment, I'll ask you to remember one simple detail, and I want you to trust your first impression.
Watch closely... because the moment that feels the most ordinary is often the moment the magic actually happens.
Take a breath, lock in what you think you saw, and don't change your mind too quickly.
Now... if your memory is certain, this reveal should feel impossible.`;

const DEMO_DURATION_SECONDS = 62;
const DEMO_SESSION_NOTES = 'Convention-ready sample patter loaded for booth testing.';
const buildDemoMarkers = (startedAt: number): SegmentMarker[] => ([
    { id: `demo-marker-1-${startedAt}`, label: 'Opener', createdAtMs: startedAt + 8000 },
    { id: `demo-marker-2-${startedAt}`, label: 'Spectator moment', createdAtMs: startedAt + 28000 },
    { id: `demo-marker-3-${startedAt}`, label: 'Reveal', createdAtMs: startedAt + 50000 },
]);

const formatElapsed = (ms: number): string => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60).toString();
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
};

type FeedbackSection = {
    title: string;
    bullets: string[];
};

type RehearsalFeedback = {
    confidenceScore: number;
    sections: FeedbackSection[];
};

type CoachingFollowUpSectionKey = 'Suggested Rewrite' | 'Pacing Adjustment' | 'Audience Interaction Upgrade' | 'Priority Fixes';

type CoachingFollowUpRequest = {
    instruction: string;
    takeTitle: string;
    transcript: Transcription[];
    markers?: SegmentMarker[];
    metrics: RehearsalMetrics;
    startedAt?: number;
    endedAt?: number;
};

type CoachingFollowUpResult = {
    prompt: string;
    takeTitle: string;
    sections: Array<FeedbackSection & { key: CoachingFollowUpSectionKey }>;
};

type SegmentMarker = {
    id: string;
    label: string;
    createdAtMs: number;
};

const DEFAULT_MARKER_LABELS = ['Opener', 'Spectator moment', 'Reveal', 'Applause cue', 'Closer'];

const createDefaultMarker = (index: number, elapsedLabel: string): SegmentMarker => ({
    id: `marker-${Date.now()}-${index + 1}`,
    label: DEFAULT_MARKER_LABELS[index] || `Segment ${index + 1}`,
    createdAtMs: Date.now(),
});

type TimelineItem = {
    timestampLabel: string;
    seconds: number;
    label: string;
    commentary?: string;
};

const formatTimelineTimestamp = (seconds: number): string => {
    const safe = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(safe / 60).toString();
    const secs = (safe % 60).toString().padStart(2, '0');
    return `${minutes}:${secs}`;
};

const buildSessionTimeline = (transcript: Transcription[], markers: SegmentMarker[] = [], startedAt?: number, endedAt?: number): TimelineItem[] => {
    const userText = (transcript || [])
        .filter((t) => t?.source === 'user')
        .map((t) => t.text || '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

    const durationSeconds = Math.max(45, Math.round(((endedAt || 0) - (startedAt || 0)) / 1000) || 0);

    if (markers.length > 0) {
        const safeDuration = Math.max(30, durationSeconds);
        return markers.map((marker, index) => {
            const relativeSeconds = startedAt ? Math.max(0, Math.min(safeDuration, Math.round((marker.createdAtMs - startedAt) / 1000))) : Math.round((safeDuration / Math.max(1, markers.length + 1)) * (index + 1));
            const commentary = /reveal/i.test(marker.label)
                ? `Reveal Segment: Energy is strong here, but pacing may rush at ${formatTimelineTimestamp(relativeSeconds)}. Consider adding a dramatic pause.`
                : /spectator|audience/i.test(marker.label)
                    ? 'Spectator interaction happens here. Slow your wording slightly so the participant can follow without pressure.'
                    : index === 0
                        ? 'Opening segment is clearly defined. Keep the first beat calm and confident.'
                        : 'This marked segment helps define the routine structure. Keep the transition into it crisp and intentional.';
            return {
                timestampLabel: formatTimelineTimestamp(relativeSeconds),
                seconds: relativeSeconds,
                label: marker.label,
                commentary,
            };
        });
    }

    if (!userText) {
        const fallbackMid = Math.max(12, Math.round(durationSeconds * 0.45));
        const fallbackEnd = Math.max(24, Math.round(durationSeconds * 0.82));
        return [
            {
                timestampLabel: '0:00',
                seconds: 0,
                label: 'Opening beat',
                commentary: 'Record a longer take to generate a fuller rehearsal timeline.',
            },
            {
                timestampLabel: formatTimelineTimestamp(fallbackMid),
                seconds: fallbackMid,
                label: 'Effect explanation',
                commentary: 'Try speaking your middle section more fully so pacing can be analyzed.',
            },
            {
                timestampLabel: formatTimelineTimestamp(fallbackEnd),
                seconds: fallbackEnd,
                label: 'Reveal moment',
                commentary: 'Add a cleaner pause before the climax to strengthen impact.',
            },
        ];
    }

    const sentences = userText.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
    const lower = userText.toLowerCase();
    const hasQuestion = userText.includes('?');
    const hasInstruction = /\b(look|watch|remember|imagine|hold|take|choose|think|breathe|focus)\b/i.test(userText);
    const hasReveal = /\b(reveal|impossible|now|suddenly|changed|appears?|vanishes?|gone|inside|there it is)\b/i.test(lower);
    const wordCount = userText.split(/\s+/).filter(Boolean).length;
    const avgSentenceWords = sentences.length ? wordCount / sentences.length : wordCount;

    const endSeconds = Math.max(1, Math.round(durationSeconds * 0.84));

    const baseEvents = [
        {
            pos: 0,
            label: 'Introduction',
            commentary: 'Opening delivery is clear. Keep the first line calm and confident.',
        },
        {
            pos: hasInstruction ? 0.34 : 0.42,
            label: hasInstruction ? 'Audience setup' : 'Effect setup',
            commentary: hasInstruction
                ? 'This is where spectator instruction begins. Keep your wording short and deliberate.'
                : 'The premise is introduced here. Add one crisp cue word to focus attention.',
        },
        {
            pos: hasQuestion ? 0.6 : 0.66,
            label: hasQuestion ? 'Audience interaction beat' : 'First magical moment',
            commentary: hasQuestion
                ? 'Pacing shifts during audience engagement. Leave a touch more space after the question.'
                : 'This beat likely carries the first strong magical impression. Hold eye contact a fraction longer.',
        },
        {
            pos: 0.84,
            label: hasReveal ? 'Reveal' : 'Climax',
            commentary:
                avgSentenceWords > 18
                    ? `At ${formatTimelineTimestamp(endSeconds)} pacing appears to accelerate. Consider adding a dramatic pause.`
                    : `At ${formatTimelineTimestamp(endSeconds)} your reveal timing is close. A slightly longer pause would make it land harder.`,
        },
    ];

    return baseEvents.map((event, index) => {
        const rawSeconds = index === 0 ? 0 : Math.max(1, Math.round(durationSeconds * event.pos));
        return {
            timestampLabel: formatTimelineTimestamp(rawSeconds),
            seconds: rawSeconds,
            label: event.label,
            commentary: event.commentary,
        };
    });
};

type RehearsalMetrics = {
    confidenceScore: number;
    fillerWords: number;
    averageSpeakingSpeed: number;
    totalPauseTimeSeconds: number;
    energyLevel: string;
};

const buildRehearsalMetrics = (transcript: Transcription[], startedAt?: number, endedAt?: number): RehearsalMetrics => {
    const userText = (transcript || [])
        .filter((t) => t?.source === 'user')
        .map((t) => t.text || '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

    const words = userText ? userText.split(/\s+/).filter(Boolean) : [];
    const fillerWords = (userText.match(/\b(um|uh|like|you know|so|actually|basically)\b/gi) || []).length;
    const pauseCueCount = (userText.match(/\b(now|watch|wait|pause|look|listen|remember|breathe)\b/gi) || []).length;
    const exclamations = (userText.match(/!/g) || []).length;
    const questionCount = (userText.match(/\?/g) || []).length;
    const durationSeconds = Math.max(1, Math.round((((endedAt || 0) - (startedAt || 0)) / 1000) || Math.max(45, words.length / 2.3)));
    const averageSpeakingSpeed = Math.max(70, Math.min(220, Math.round((words.length / durationSeconds) * 60)));

    const punctuationPauses = (userText.match(/[,.!?;:]/g) || []).length;
    const totalPauseTimeSeconds = Math.max(2, Math.min(45, Math.round((pauseCueCount * 1.4) + (punctuationPauses * 0.18))));

    const confidenceScore = Math.max(
        62,
        Math.min(
            97,
            Math.round(
                84
                - fillerWords * 3
                - Math.max(0, averageSpeakingSpeed - 168) / 5
                - Math.max(0, 110 - averageSpeakingSpeed) / 6
                + Math.min(8, questionCount * 2)
                + Math.min(6, pauseCueCount)
                + Math.min(4, exclamations)
            )
        )
    );

    let energyLevel = 'Moderate';
    if (averageSpeakingSpeed >= 150 || exclamations >= 2 || pauseCueCount >= 4) energyLevel = 'High';
    if (averageSpeakingSpeed < 115 && exclamations === 0 && pauseCueCount < 2) energyLevel = 'Measured';

    return {
        confidenceScore,
        fillerWords,
        averageSpeakingSpeed,
        totalPauseTimeSeconds,
        energyLevel,
    };
};

const buildRehearsalFeedback = (transcript: Transcription[], markers: SegmentMarker[] = [], startedAt?: number, endedAt?: number): RehearsalFeedback => {
    const userText = (transcript || [])
        .filter((t) => t?.source === 'user')
        .map((t) => t.text || '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!userText) {
        return {
            confidenceScore: 76,
            sections: [
                { title: 'Delivery & Vocal Tone', bullets: ['Voice sample captured. Record a slightly longer take for deeper tone analysis.'] },
                { title: 'Timing & Pacing', bullets: ['Try a full opener-to-reveal run so pacing feedback can be more specific.'] },
                { title: 'Audience Engagement', bullets: ['Add one direct audience line or question to strengthen interaction.'] },
                { title: 'Clarity of Effect', bullets: ['State the effect outcome clearly so the magical moment lands cleanly.'] },
                { title: 'Improvement Suggestions', bullets: ['Record another pass with stronger pauses before the climax.'] },
            ],
        };
    }

    const metrics = buildRehearsalMetrics(transcript, startedAt, endedAt);
    const words = userText.split(/\s+/).filter(Boolean);
    const sentences = userText.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
    const questionCount = (userText.match(/\?/g) || []).length;
    const pauseCueCount = (userText.match(/\b(now|watch|wait|pause|look|listen|remember|breathe)\b/gi) || []).length;
    const avgSentenceWords = sentences.length ? words.length / sentences.length : words.length;
    const longestSentence = sentences.reduce((max, s) => Math.max(max, s.split(/\s+/).filter(Boolean).length), 0);
    const revealMarker = markers.find((marker) => /reveal/i.test(marker.label));

    const deliveryBullets = [
        metrics.fillerWords <= 2
            ? 'Strong vocal control overall. Your delivery reads as deliberate and performance-ready.'
            : `A few filler words (${metrics.fillerWords}) softened authority. Tightening those moments will increase confidence.`,
        pauseCueCount >= 3
            ? 'You naturally use cue words like “watch,” “remember,” or “now,” which helps shape attention.'
            : 'Add a few stronger cue words to guide attention and give the routine more command.',
    ];

    const pacingBullets = [
        avgSentenceWords <= 18
            ? 'Pacing is generally clean. Sentence length stays compact enough for live delivery.'
            : 'Some lines run long. Breaking larger thoughts into shorter beats will improve pacing.',
        revealMarker
            ? 'Reveal Segment: Energy is strong, but pacing feels slightly rushed. Add a short pause before the payoff.'
            : longestSentence > 28
                ? 'One or more explanation phases feel dense. Insert a deliberate pause before the reveal beat.'
                : 'Reveal pacing appears controlled. A slightly longer beat before the climax could make it land harder.',
    ];

    const engagementBullets = [
        questionCount > 0
            ? 'Direct audience language is present, which helps create interaction and buy-in.'
            : 'Add one audience-facing question or challenge line to increase engagement.',
        words.length >= 70
            ? 'The take has enough verbal substance for a convincing rehearsal pass.'
            : 'This take is concise. A longer run-through will help evaluate audience connection more deeply.',
    ];

    const clarityBullets = [
        avgSentenceWords <= 20
            ? 'Effect explanation is mostly clear and should be easy for spectators to follow.'
            : 'Clarify spectator instructions. A few phrases may be too dense in the middle section.',
        userText.toLowerCase().includes('reveal') || userText.toLowerCase().includes('impossible')
            ? 'The magical outcome is verbally framed, which strengthens the effect moment.'
            : 'Name the impossible outcome more explicitly so the effect registers cleanly.',
    ];

    const suggestionBullets = [
        metrics.fillerWords > 0
            ? 'Remove filler phrases from the first thirty seconds to sound more certain immediately.'
            : 'Keep the opening exactly this direct — it establishes authority quickly.',
        'Add a clear pause just before the strongest magical sentence or reveal line.',
        questionCount === 0
            ? 'Include one audience prompt so the script feels more interactive in performance.'
            : 'Strengthen the final line so the audience interaction resolves with a stronger payoff.',
    ];

    return {
        confidenceScore: metrics.confidenceScore,
        sections: [
            { title: 'Delivery & Vocal Tone', bullets: deliveryBullets },
            { title: 'Timing & Pacing', bullets: pacingBullets },
            { title: 'Audience Engagement', bullets: engagementBullets },
            { title: 'Clarity of Effect', bullets: clarityBullets },
            { title: 'Improvement Suggestions', bullets: suggestionBullets },
        ],
    };
};

const buildCoachingFollowUp = ({
    instruction,
    takeTitle,
    transcript,
    markers = [],
    metrics,
    startedAt,
    endedAt,
}: CoachingFollowUpRequest): CoachingFollowUpResult => {
    const normalizedPrompt = (instruction || '').trim();
    const lowerPrompt = normalizedPrompt.toLowerCase();
    const userText = (transcript || [])
        .filter((t) => t?.source === 'user')
        .map((t) => t.text || '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

    const sentences = userText
        .split(/(?<=[.!?])\s+/)
        .map((part) => part.trim())
        .filter(Boolean);
    const feedback = buildRehearsalFeedback(transcript, markers, startedAt, endedAt);
    const timeline = buildSessionTimeline(transcript, markers, startedAt, endedAt);
    const openerSentence = sentences[0] || 'Open with one direct line that frames the effect immediately.';
    const revealLine = sentences.find((sentence) => /reveal|impossible|now|memory|change|vanish|appear/i.test(sentence)) || sentences[sentences.length - 1] || openerSentence;
    const audienceLine = sentences.find((sentence) => /you|your|spectator|remember|watch|look|trust/i.test(sentence)) || openerSentence;
    const revealTimeline = timeline.find((item) => /reveal|climax/i.test(item.label)) || timeline[timeline.length - 1];
    const revealMarker = markers.find((marker) => /reveal/i.test(marker.label));
    const audienceMarker = markers.find((marker) => /spectator|audience/i.test(marker.label));
    const clarityNote = feedback.sections.find((section) => section.title === 'Clarity of Effect')?.bullets?.[0] || 'State the magical change in one clean sentence.';

    const style = lowerPrompt.includes('myster')
        ? 'mysterious'
        : lowerPrompt.includes('confiden')
            ? 'confident'
            : lowerPrompt.includes('family')
                ? 'family-friendly'
                : lowerPrompt.includes('dramatic')
                    ? 'dramatic'
                    : 'clear';

    const tightenSentence = (sentence: string) => {
        const words = sentence.replace(/[“”"]/g, '').split(/\s+/).filter(Boolean);
        return words.slice(0, Math.min(words.length, 16)).join(' ').replace(/[,:;]$/, '');
    };

    const buildRewrite = () => {
        if (!userText) return 'Record a short spoken pass first so the follow-up rewrite can lock to your actual wording.';
        if (lowerPrompt.includes('opening') || lowerPrompt.includes('opener')) {
            const base = tightenSentence(openerSentence.replace(/^(good evening[,!]?)\s*/i, ''));
            if (style === 'mysterious') return `Try this opener: “In the next few seconds, your first impression is going to matter more than you think.”`;
            if (style === 'confident') return `Try this opener: “Stay with me. What feels ordinary right now is the exact moment the effect begins.”`;
            return `Try this opener: “${base}. Keep that first impression, because we are about to test it.”`;
        }
        if (lowerPrompt.includes('reveal') || lowerPrompt.includes('pause') || lowerPrompt.includes('pacing')) {
            return `Use this reveal line: “${tightenSentence(revealLine)}” — then stop for one full beat before continuing.`;
        }
        if (lowerPrompt.includes('clear') || lowerPrompt.includes('instruction')) {
            return `Clarify the audience line to: “${tightenSentence(audienceLine)} — and commit to that first impression.”`;
        }
        if (lowerPrompt.includes('audience') || lowerPrompt.includes('interactive') || lowerPrompt.includes('family')) {
            return `Add this audience line: “Keep your eyes on this moment, because in a second I’m going to ask what you think you saw.”`;
        }
        if (lowerPrompt.includes('confidence')) {
            return `Firm up the wording: “Watch closely. I want your first impression, because that instinct is about to be challenged.”`;
        }
        return `Refined line: “${tightenSentence(openerSentence)} — and the more certain you feel, the stronger the reveal becomes.”`;
    };

    const buildPacing = () => {
        const timestamp = revealTimeline?.timestampLabel || 'the reveal beat';
        const revealLabel = revealTimeline?.label || 'reveal';
        const speedNote = metrics.averageSpeakingSpeed > 165
            ? `Your current speed (${metrics.averageSpeakingSpeed} WPM) is a little fast for the payoff. Slow the final sentence by about 10–15%.`
            : metrics.averageSpeakingSpeed < 105
                ? `Your speed (${metrics.averageSpeakingSpeed} WPM) is measured. Keep the setup moving so the reveal does not feel underpowered.`
                : `Your speed (${metrics.averageSpeakingSpeed} WPM) is workable. The main gain comes from a cleaner pause before the payoff.`;
        return [
            `At ${timestamp}, the routine reaches the ${revealLabel.toLowerCase()}. Leave one visible pause before the final line.`,
            speedNote,
        ];
    };

    const buildAudienceUpgrade = () => {
        const markerLabel = audienceMarker?.label || 'middle beat';
        const promptLine = lowerPrompt.includes('family')
            ? 'Use a simple participation cue: “Point to the moment you think everything changed.”'
            : 'Add one short spectator question so the audience has a job before the reveal.';
        return [
            `${markerLabel.charAt(0).toUpperCase() + markerLabel.slice(1)} is your best interaction moment. ${promptLine}`,
            `Keep the participation line under 12 words so it feels intentional, not chatty.`,
        ];
    };

    const priorityFixes = [
        clarityNote,
        metrics.fillerWords > 0
            ? `Remove ${metrics.fillerWords} filler word${metrics.fillerWords === 1 ? '' : 's'} from this take before the next pass.`
            : 'Keep the language trimmed — filler words are already under control.',
        revealMarker
            ? `Treat ${revealMarker.label} as the slowest beat in the routine.`
            : 'Mark your reveal beat on the next take so pacing notes can lock to a performer-defined moment.',
    ];

    return {
        prompt: normalizedPrompt,
        takeTitle,
        sections: [
            { key: 'Suggested Rewrite', title: 'Suggested Rewrite', bullets: [buildRewrite()] },
            { key: 'Pacing Adjustment', title: 'Pacing Adjustment', bullets: buildPacing() },
            { key: 'Audience Interaction Upgrade', title: 'Audience Interaction Upgrade', bullets: buildAudienceUpgrade() },
            { key: 'Priority Fixes', title: 'Priority Fixes', bullets: priorityFixes },
        ],
    };
};

const trackLiveRehearsalEvent = (action: string, metadata?: Record<string, any>, extra?: Partial<{ outcome: 'SUCCESS_NOT_CHARGED' | 'ERROR_UPSTREAM' | 'ALLOWED' | 'SUCCESS_CHARGED'; http_status: number; error_code: string; retryable: boolean; units: number; }>) => {
    void trackClientEvent({
        tool: 'live_rehearsal',
        action,
        metadata,
        outcome: extra?.outcome,
        http_status: extra?.http_status,
        error_code: extra?.error_code,
        retryable: extra?.retryable,
        units: extra?.units,
    });
};

const LiveRehearsal: React.FC<LiveRehearsalProps & { onRequestUpgrade?: () => void }> = ({ user, onReturnToStudio, onIdeaSaved, onOpenAngleRisk, onOpenPatterEngine, onOpenDirectorMode, onRequestUpgrade }) => {
    const [view, setView] = useState<'idle' | 'rehearsing' | 'reviewing'>('idle');
    const [status, setStatus] = useState<'idle' | 'connecting' | 'listening' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState('');
    const [blockedUx, setBlockedUx] = useState<BlockedUx | null>(null);
  const [usageWarning, setUsageWarning] = useState<string | null>(getSoftLimitWarning(user, 'live_minutes'));
  const resourceNotice = getHighCostToolNotice('live_rehearsal');
    const [transcriptionHistory, setTranscriptionHistory] = useState<Transcription[]>([]);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    
    const sessionRef = useRef<LiveSession | null>(null);
    const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
    const cleanupMicStreamRef = useRef<(() => void) | null>(null);
    const inputAudioContextRef = useRef<AudioContext | null>(null);
    const inputSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const inputProcessorNodeRef = useRef<ScriptProcessorNode | null>(null);
    const inputZeroGainRef = useRef<GainNode | null>(null);
    const activeTakeIdRef = useRef(0);
    const errorOccurred = useRef(false);

    // Ground-truth recording (for server-side transcription fallback)
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordedChunksRef = useRef<BlobPart[]>([]);
    const recordedMimeTypeRef = useRef<string>('audio/webm');
    const pcmChunksRef = useRef<Float32Array[]>([]);
    const pcmSampleRateRef = useRef<number>(16000);

    // Audio playback refs
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const outputNodeRef = useRef<GainNode | null>(null);
    const sourcesRef = useRef(new Set<AudioBufferSourceNode>());
    const nextStartTimeRef = useRef(0);
    
    // Timer state and refs
    const [timer, setTimer] = useState<TimerState>({ startTime: null, duration: null, isRunning: false });
    const timerIntervalRef = useRef<number | null>(null);
    const [studioHelpOpen, setStudioHelpOpen] = useState(true);
    const [markerCount, setMarkerCount] = useState(0);
    const [currentMarkers, setCurrentMarkers] = useState<SegmentMarker[]>([]);
    const [demoScript, setDemoScript] = useState('');
    const [demoDurationSeconds, setDemoDurationSeconds] = useState(0);
    const [demoMarkers, setDemoMarkers] = useState<SegmentMarker[]>([]);
    const [sessionElapsed, setSessionElapsed] = useState('0:00');
    const sessionElapsedIntervalRef = useRef<number | null>(null);

    // --- Multi-take session state ---
    // Persist draft state so users can jump to AI analysis and then come back to record Take 2.
    const DRAFT_STORAGE_KEY = 'maw_live_rehearsal_draft_v2';
    type Take = {
        takeNumber: number;
        startedAt: number;
        endedAt: number;
        transcript: Transcription[];
        markers?: SegmentMarker[];
        transcriptionError?: string;
        audioSource?: 'pcm_wav' | 'media_recorder' | 'none';
        audioBytes?: number;
    };

    type TakeAudioSnapshot = {
        takeId: number;
        createdAt: number;
        startedAt: number | null;
        durationMs: number;
        recorderChunks: BlobPart[];
        recorderMimeType: string;
        recorderBytes: number;
        pcmChunks: Float32Array[];
        pcmSampleRate: number;
        pcmBlob: Blob | null;
        pcmBytes: number;
        chosenBlob: Blob | null;
        chosenMimeType: string;
        chosenBytes: number;
        chosenSource: 'pcm_wav' | 'media_recorder' | 'none';
        isValidForTranscription: boolean;
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

    const isDemoTranscript = (transcript?: Transcription[]) =>
        Boolean(transcript?.some((seg) => String(seg?.text || '').includes('quick experiment in attention')));

    const isDemoTakeEntry = (take?: Take | null) =>
        Boolean(take && sessionTitle === 'Demo Rehearsal Session' && isDemoTranscript(take.transcript));

    const hasDemoLoaded = Boolean(demoScript.trim());
    const hasLiveTake = takes.some((take) => !isDemoTakeEntry(take));

    // Phase 6.5: show daily live rehearsal remaining (server-backed when available)
    const [dailyLive, setDailyLive] = useState<{ used: number; limit: number; remaining: number; source: 'server' | 'local' } | null>(null);
    const dailyLiveStartRemainingRef = useRef<number | null>(null);

    const refreshDailyLive = async () => {
        try {
            const s = await fetchUsageStatus();
            const daily = (s as any)?.quota?.live_audio_minutes?.daily;
            if ((s as any)?.ok && daily && Number(daily.limit ?? 0) > 0) {
                setDailyLive({ used: Number(daily.used ?? 0), limit: Number(daily.limit ?? 0), remaining: Number(daily.remaining ?? 0), source: 'server' });
                return;
            }
        } catch {
            // ignore
        }
        try {
            const cur = getUsage(user, 'live_minutes');
            setDailyLive({ used: Number(cur.used ?? 0), limit: Number(cur.limit ?? 0), remaining: Number(cur.remaining ?? 0), source: 'local' });
        } catch {
            // ignore
        }
    };

    useEffect(() => {
        void refreshDailyLive();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Keep refs in sync so we can persist draft reliably even during rapid state transitions
    const sessionIdeaIdRef = useRef<string | null>(null);
    const sessionTitleRef = useRef<string>('');
    const sessionNotesRef = useRef<string>('');
    const takesRef = useRef<Take[]>([]);
    const selectedTakeRef = useRef<number>(0);

    useEffect(() => { sessionIdeaIdRef.current = sessionIdeaId; }, [sessionIdeaId]);
    useEffect(() => { sessionTitleRef.current = sessionTitle; }, [sessionTitle]);
    useEffect(() => { sessionNotesRef.current = sessionNotes; }, [sessionNotes]);
    useEffect(() => { takesRef.current = takes; }, [takes]);
    useEffect(() => { selectedTakeRef.current = selectedTake; }, [selectedTake]);

    const currentTakeStartRef = useRef<number | null>(null);
    const pcmDiscardUntilRef = useRef<number>(0);
    const transcriptionHistoryRef = useRef<Transcription[]>([]);
    const currentTakeUserTranscriptTextRef = useRef<string>('');

    const persistDraft = (override?: Partial<{ ideaId: string | null; title: string; notes: string; takes: Take[]; selectedTake: number; }>) => {
        try {
            const payload = {
                version: 2,
                ideaId: override?.ideaId ?? sessionIdeaIdRef.current,
                title: override?.title ?? sessionTitleRef.current,
                notes: override?.notes ?? sessionNotesRef.current,
                takes: override?.takes ?? takesRef.current,
                selectedTake: override?.selectedTake ?? selectedTakeRef.current,
                savedAt: Date.now(),
            };
            // Only store if there's something meaningful to resume.
            if ((payload.takes?.length ?? 0) === 0) return;
            localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
        } catch {
            // ignore
        }
    };

    const clearDraft = () => {
        try {
            localStorage.removeItem(DRAFT_STORAGE_KEY);
        } catch {
            // ignore
        }
    };

    /**
     * "Back to Studio" navigation is handled by the MagicianMode shell.
     * Keep Live Rehearsal self-contained: do not hand off to the global chat renderer
     * from this page. Preserve the current session draft, then return to the shell.
     */
    const safeReturnToStudio = () => {
        try {
            persistDraft();
            onReturnToStudio?.();
        } catch {
            // ignore
        }
    };

    // Restore any in-progress rehearsal draft (so "Back to Live Rehearsal" from AI analysis works).
    useEffect(() => {
        try {
            const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (!parsed || parsed.version !== 2) return;
            if (!Array.isArray(parsed.takes) || parsed.takes.length === 0) return;

            setSessionIdeaId(parsed.ideaId ?? null);
            setSessionTitle(typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title : sessionTitle);
            setSessionNotes(typeof parsed.notes === 'string' ? parsed.notes : '');
            setTakes(parsed.takes);
            const idx = typeof parsed.selectedTake === 'number' ? parsed.selectedTake : parsed.takes.length - 1;
            setSelectedTake(Math.max(0, Math.min(idx, parsed.takes.length - 1)));
            setView('reviewing');
            setStatus('idle');
        } catch {
            // ignore
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Optional: preload a rehearsal title/notes from another tool (e.g., Mentalism Mind Lab)
    useEffect(() => {
        try {
            const PREFILL_KEY = 'maw_live_rehearsal_prefill_v1';
            const raw = localStorage.getItem(PREFILL_KEY);
            if (!raw) return;

            // If an active draft exists (takes recorded), don't override it.
            const draftRaw = localStorage.getItem(DRAFT_STORAGE_KEY);
            if (draftRaw) {
                try {
                    const parsedDraft = JSON.parse(draftRaw);
                    if (parsedDraft?.version === 2 && Array.isArray(parsedDraft?.takes) && parsedDraft.takes.length > 0) {
                        localStorage.removeItem(PREFILL_KEY);
                        return;
                    }
                } catch {
                    // ignore
                }
            }

            const parsed = JSON.parse(raw);
            if (!parsed || parsed.version !== 1) {
                localStorage.removeItem(PREFILL_KEY);
                return;
            }

            if (typeof parsed.title === 'string' && parsed.title.trim()) setSessionTitle(parsed.title.trim());
            if (typeof parsed.notes === 'string') setSessionNotes(parsed.notes);

            localStorage.removeItem(PREFILL_KEY);
        } catch {
            // ignore
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Usage tracking (client-side, per-day)
    const sessionStartRef = useRef<number | null>(null);
    const usageIntervalRef = useRef<number | null>(null);

    const transcriptEndRef = useRef<HTMLDivElement>(null);

    const hardResetTakeState = (reason: string) => {
        activeTakeIdRef.current += 1;

        recordedChunksRef.current = [];
        recordedMimeTypeRef.current = 'audio/webm';
        pcmChunksRef.current = [];
        pcmSampleRateRef.current = 16000;

        transcriptionHistoryRef.current = [];
        currentTakeUserTranscriptTextRef.current = '';

        setTranscriptionHistory([]);
        setMarkerCount(0);
        setCurrentMarkers([]);
        currentTakeStartRef.current = null;
        setSessionElapsed('0:00');
        setErrorMessage('');
        setBlockedUx(null);

        try {
            for (const source of sourcesRef.current.values()) {
                try { source.stop(); } catch {}
            }
            sourcesRef.current.clear();
            nextStartTimeRef.current = 0;
        } catch {
            // ignore
        }

        pushDebug('take_state_reset', {
            reason,
            takeId: activeTakeIdRef.current,
            existingTakes: takesRef.current.length,
        });
    };

    const cleanupInputAudioChain = async (reason: string) => {
        pushDebug('cleanup_input_audio_chain_start', {
            reason,
            takeId: activeTakeIdRef.current,
            hasInputContext: !!inputAudioContextRef.current,
            hasSource: !!inputSourceNodeRef.current,
            hasProcessor: !!inputProcessorNodeRef.current,
            hasZeroGain: !!inputZeroGainRef.current,
        });

        try {
            if (inputProcessorNodeRef.current) {
                try { inputProcessorNodeRef.current.onaudioprocess = null; } catch {}
                try { inputProcessorNodeRef.current.disconnect(); } catch {}
            }
        } catch {
            // ignore
        }

        try {
            if (inputZeroGainRef.current) {
                try { inputZeroGainRef.current.disconnect(); } catch {}
            }
        } catch {
            // ignore
        }

        try {
            if (inputSourceNodeRef.current) {
                try { inputSourceNodeRef.current.disconnect(); } catch {}
            }
        } catch {
            // ignore
        }

        try {
            if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
                await inputAudioContextRef.current.close().catch(() => void 0);
            }
        } catch {
            // ignore
        }

        inputProcessorNodeRef.current = null;
        inputZeroGainRef.current = null;
        inputSourceNodeRef.current = null;
        inputAudioContextRef.current = null;

        pushDebug('cleanup_input_audio_chain_done', {
            reason,
            takeId: activeTakeIdRef.current,
        });
    };

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

        await cleanupInputAudioChain('safe_cleanup_session');

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
            if (sessionElapsedIntervalRef.current) {
                clearInterval(sessionElapsedIntervalRef.current);
                sessionElapsedIntervalRef.current = null;
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

        sessionPromiseRef.current = null;
        recordedChunksRef.current = [];
        recordedMimeTypeRef.current = 'audio/webm';
        pcmChunksRef.current = [];
        pcmSampleRateRef.current = 16000;
        transcriptionHistoryRef.current = [];
        currentTakeUserTranscriptTextRef.current = '';

        try {
            for (const source of sourcesRef.current.values()) {
                try { source.stop(); } catch {}
            }
            sourcesRef.current.clear();
            nextStartTimeRef.current = 0;
        } catch {
            // ignore
        }

        sessionStartRef.current = null;
        setTimer({ startTime: null, duration: null, isRunning: false });
        setSessionElapsed('0:00');
        setStatus('idle');
        setIsAnalyzing(false);
    };

    useEffect(() => {
        return () => {
            void safeCleanupSession();
        };
    }, []);

    const scrollReviewIntoView = () => {
        window.setTimeout(() => {
            try {
                const el = document.getElementById('live-rehearsal-review-anchor');
                el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } catch {
                // ignore
            }
        }, 80);
    };

    const openReviewForTake = (takeIndex?: number) => {
        const maxIndex = Math.max(0, takesRef.current.length - 1);
        if (typeof takeIndex === 'number' && Number.isFinite(takeIndex)) {
            setSelectedTake(Math.max(0, Math.min(takeIndex, maxIndex)));
        }
        setBlockedUx(null);
        setIsAnalyzing(false);
        setErrorMessage('');
        setStatus('idle');
        setView('reviewing');
        scrollReviewIntoView();
    };

    const handleStartSession = async () => {
        setBlockedUx(null);

        await safeCleanupSession();
        await cleanupInputAudioChain('before_new_take');
        hardResetTakeState('before_new_take');

        // Group 1 stabilization: if the current review state only contains a demo take,
        // clear it before starting a real live recording so the first live take is always Take 1.
        if (hasDemoLoaded && !hasLiveTake) {
            setTakes([]);
            setSelectedTake(0);
            setDemoScript('');
            setDemoDurationSeconds(0);
            setDemoMarkers([]);
            setSessionTitle(`Live Rehearsal Session - ${new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`);
            setSessionNotes('');
            clearDraft();
        }

        // Server-backed cap for live rehearsal minutes (daily), consistent across devices.
        try {
            const s = await fetchUsageStatus();
            const daily = (s as any)?.quota?.live_audio_minutes?.daily;
            if ((s as any)?.ok && daily && Number(daily.limit ?? 0) > 0) {
                setDailyLive({ used: Number(daily.used ?? 0), limit: Number(daily.limit ?? 0), remaining: Number(daily.remaining ?? 0), source: 'server' });
                dailyLiveStartRemainingRef.current = Number(daily.remaining ?? 0);
                setUsageWarning(Number(daily.remaining ?? 0) <= Math.max(1, Math.ceil(Number(daily.limit ?? 0) * 0.2)) ? `Heads up: you only have ${Number(daily.remaining ?? 0)} live rehearsal minutes remaining today.` : null);
            }

            if ((s as any)?.ok && daily && Number(daily.limit ?? 0) > 0 && Number(daily.remaining ?? 0) <= 0) {
                setBlockedUx(
                    normalizeBlockedUx(
                        { error_code: 'QUOTA_EXCEEDED', message: 'Live rehearsal minutes limit reached.', status: 429, retryable: false },
                        { toolName: 'Live Rehearsal (Audio)' }
                    )
                );
                setStatus('error');
                setErrorMessage(
                    `Daily live rehearsal minutes limit reached (${Number(daily.used ?? 0)}/${Number(daily.limit ?? 0)} min). This is separate from the AI message limit. Upgrade to continue.`
                );
                trackLiveRehearsalEvent('live_rehearsal_start_blocked', { source: 'server', used: Number(daily.used ?? 0), limit: Number(daily.limit ?? 0) }, { outcome: 'ERROR_UPSTREAM', http_status: 429, error_code: 'quota_exceeded', retryable: false });
                void logEvent('limit_hit_ai_generation', { source: 'live_rehearsal_start', feature: 'live_rehearsal', limit_scope: 'daily', quota_source: 'server' });
                return;
            }
        } catch {
            // If server usage is unavailable, fall back to the existing local tracker.
            try {
                const cur = getUsage(user, 'live_minutes');
                setDailyLive({ used: Number(cur.used ?? 0), limit: Number(cur.limit ?? 0), remaining: Number(cur.remaining ?? 0), source: 'local' });
                dailyLiveStartRemainingRef.current = Number(cur.remaining ?? 0);
                setUsageWarning(getSoftLimitWarning(user, 'live_minutes'));
                if (cur.limit > 0 && cur.remaining <= 0) {
                    setBlockedUx(
                        normalizeBlockedUx(
                            { error_code: 'QUOTA_EXCEEDED', message: 'Live rehearsal minutes limit reached.', status: 429, retryable: false },
                            { toolName: 'Live Rehearsal (Audio)' }
                        )
                    );
                    setStatus('error');
                    setErrorMessage(
                        `Daily live rehearsal minutes limit reached (${cur.used}/${cur.limit} min). This is separate from the AI message limit. Upgrade to continue.`
                    );
                    trackLiveRehearsalEvent('live_rehearsal_start_blocked', { source: 'local', used: Number(cur.used ?? 0), limit: Number(cur.limit ?? 0) }, { outcome: 'ERROR_UPSTREAM', http_status: 429, error_code: 'quota_exceeded', retryable: false });
                    void logEvent('limit_hit_ai_generation', { source: 'live_rehearsal_start', feature: 'live_rehearsal', limit_scope: 'daily', quota_source: 'local' });
                    return;
                }
            } catch {
                // ignore
            }
        }
        setStatus('connecting');
        setErrorMessage('');
        if (sessionElapsedIntervalRef.current) {
            clearInterval(sessionElapsedIntervalRef.current);
            sessionElapsedIntervalRef.current = null;
        }
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
                    pushDebug('media_recorder_chunk', {
                        takeId: activeTakeIdRef.current,
                        chunkSize: Number(e?.data?.size || 0),
                        chunkType: String(e?.data?.type || recorder.mimeType || recordedMimeTypeRef.current || ''),
                        chunkCount: recordedChunksRef.current.length,
                        totalBytes: recordedChunksRef.current.reduce((sum: number, c: any) => sum + (c?.size || 0), 0),
                    });
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
            inputAudioContextRef.current = inputAudioContext;
            inputSourceNodeRef.current = null;
            inputProcessorNodeRef.current = null;
            inputZeroGainRef.current = null;

            const sessionPromise = startLiveSession(
                MAGICIAN_LIVE_REHEARSAL_SYSTEM_INSTRUCTION,
                {
                    onopen: async () => { 
                        // Setup microphone streaming once the connection is open
                        const source = inputAudioContext.createMediaStreamSource(stream);
                        const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);

                        inputSourceNodeRef.current = source;
                        inputProcessorNodeRef.current = scriptProcessor;

                        // FIX: Implement audio resampling within the audio processor
                        // to convert the microphone's native sample rate to the 16000Hz required by the API.
                        const thisTakeId = activeTakeIdRef.current;
                        scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                            if (thisTakeId !== activeTakeIdRef.current) {
                                pushDebug('stale_audio_callback_ignored', {
                                    thisTakeId,
                                    activeTakeId: activeTakeIdRef.current,
                                });
                                return;
                            }
                            if (Date.now() < pcmDiscardUntilRef.current) {
                                return;
                            }
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

                            pcmChunksRef.current.push(new Float32Array(resampledData));
                            pcmSampleRateRef.current = outputSampleRate;

                            const pcmBlob = createBlob(resampledData);
                            // This currently resolves to a no-op shim in the production baseline,
                            // but we keep the call shape intact so the component remains forward-compatible.
                            sessionPromise.then((session) => {
                                session.sendRealtimeInput({ media: pcmBlob });
                            });
                        };

                        source.connect(scriptProcessor);
                        // Keep the ScriptProcessorNode alive without routing audible audio to speakers.
                        const zeroGain = inputAudioContext.createGain();
                        zeroGain.gain.value = 0;
                        inputZeroGainRef.current = zeroGain;
                        scriptProcessor.connect(zeroGain);
                        zeroGain.connect(inputAudioContext.destination);

                        try {
                            await inputAudioContext.resume();
                        } catch {
                            // ignore
                        }
                        pcmDiscardUntilRef.current = Date.now() + AUDIO_WARMUP_MS;
                        pushDebug('audio_warmup_start', {
                            takeId: activeTakeIdRef.current,
                            warmupMs: AUDIO_WARMUP_MS,
                            inputSampleRate: inputAudioContext.sampleRate,
                        });
                        await delay(AUDIO_WARMUP_MS);

                        currentTakeStartRef.current = Date.now();
                        if (sessionElapsedIntervalRef.current) {
                            clearInterval(sessionElapsedIntervalRef.current);
                        }
                        sessionElapsedIntervalRef.current = window.setInterval(() => {
                            const startedAt = currentTakeStartRef.current;
                            setSessionElapsed(startedAt ? formatElapsed(Date.now() - startedAt) : '0:00');
                        }, 250);

                        setStatus('listening');
                        setView('rehearsing');
                        trackLiveRehearsalEvent('live_rehearsal_session_start', {
                            mode: 'live',
                            daily_remaining: dailyLiveStartRemainingRef.current,
                        }, { outcome: 'ALLOWED' });

                        // Start usage timer
                        sessionStartRef.current = Date.now();
                        if (usageIntervalRef.current) {
                            clearInterval(usageIntervalRef.current);
                        }
                        usageIntervalRef.current = window.setInterval(() => {
                            const start = sessionStartRef.current;
                            if (!start) return;
                            const elapsedMin = (Date.now() - start) / 60000;
                            const startRemaining = dailyLiveStartRemainingRef.current;
                            // When elapsed session time reaches remaining daily minutes (at session start), stop.
                            if (startRemaining != null && startRemaining > 0 && elapsedMin >= startRemaining) {
                                void handleStopRehearsal('Daily live rehearsal minutes reached. Upgrade to continue.');
                            }
                        }, 5000);
                    },
                    onmessage: handleServerMessage,
                    onerror: async (e) => {
                        console.error('Live session error:', e);
                        errorOccurred.current = true;
                        setErrorMessage(normalizeAiUserFacingError(e));
                        await safeCleanupSession();
                        trackLiveRehearsalEvent('live_rehearsal_session_error', { phase: 'live_session', has_transcript: transcriptionHistoryRef.current.length > 0 }, { outcome: 'ERROR_UPSTREAM', error_code: 'live_session_error', retryable: true });
                        setStatus('error');
                        setView(transcriptionHistoryRef.current.length > 0 ? 'rehearsing' : 'idle');
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
            };

        } catch (error: any) {
            console.error('Failed to start session or get microphone:', error);
            errorOccurred.current = true;
            try {
                const blocked = normalizeBlockedUx(error, { toolName: 'Live Rehearsal (Audio)' });
                if (blocked.showUpgrade || blocked.retryable) {
                    setBlockedUx(blocked);
                    if (blocked.showUpgrade) {
                        void logEvent('limit_hit_ai_generation', { source: 'live_rehearsal_error', feature: 'live_rehearsal' });
                    }
                }
            } catch {
                // ignore
            }
            const errorName = String(error?.name || '');
            const errorMessage = String(error?.message || error || '');
            if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError') {
                setErrorMessage('Microphone permission denied. Please allow microphone access in your browser settings.');
            } else if (errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError') {
                setErrorMessage('No microphone was detected. Connect an audio input device and try again.');
            } else if (errorName === 'NotReadableError' || errorName === 'TrackStartError') {
                setErrorMessage('Your microphone is busy or unavailable. Close other apps using the mic and try again.');
            } else if (errorName === 'AbortError' || errorName === 'NetworkError' || /network|fetch|timeout|connection/i.test(errorMessage)) {
                setErrorMessage(normalizeAiUserFacingError(error));
            } else {
                setErrorMessage('AI temporarily unavailable. Please try again in a moment.');
            }
            trackLiveRehearsalEvent('live_rehearsal_session_error', { phase: 'session_start', error_name: errorName || 'unknown' }, { outcome: 'ERROR_UPSTREAM', error_code: errorName || 'live_start_failed', retryable: true });
            await safeCleanupSession();
            setStatus('error');
            setView('idle');
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
                const next = last?.source === 'user' && !last.isFinal
                    ? [...prev.slice(0, -1), { ...last, text: last.text + text }]
                    : [...prev, { source: 'user', text, isFinal: false }];
                transcriptionHistoryRef.current = next;
                currentTakeUserTranscriptTextRef.current = next
                    .filter((t) => t?.source === 'user')
                    .map((t) => String(t?.text || ''))
                    .join(' ')
                    .replace(/\s+/g, ' ')
                    .trim();
                return next;
            });
        }
        if (message.serverContent?.outputTranscription) {
            const text = message.serverContent.outputTranscription.text;
            setTranscriptionHistory(prev => {
                const last = prev[prev.length - 1];
                const next = last?.source === 'model' && !last.isFinal
                    ? [...prev.slice(0, -1), { ...last, text: last.text + text }]
                    : [...prev, { source: 'model', text, isFinal: false }];
                transcriptionHistoryRef.current = next;
                return next;
            });
        }
        if (message.serverContent?.turnComplete) {
            setTranscriptionHistory(prev => {
                const next = prev.map(t => ({ ...t, isFinal: true }));
                transcriptionHistoryRef.current = next;
                currentTakeUserTranscriptTextRef.current = next
                    .filter((t) => t?.source === 'user')
                    .map((t) => String(t?.text || ''))
                    .join(' ')
                    .replace(/\s+/g, ' ')
                    .trim();
                return next;
            });
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

    const normalizeTranscript = (items: Transcription[]): Transcription[] =>
        (items || [])
            .filter((t) => t && typeof t.text === 'string' && t.text.trim().length > 0)
            .map((t) => ({ ...t, text: String(t.text).trim() }));

    const getFinalUserTranscriptText = (items: Transcription[]) =>
        normalizeTranscript(items)
            .filter((t) => t.source === 'user')
            .map((t) => t.text)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();

    const captureTakeSnapshot = (): TakeAudioSnapshot => {
        const takeId = activeTakeIdRef.current;
        const createdAt = Date.now();
        const startedAt = currentTakeStartRef.current;
        const durationMs = startedAt ? Math.max(0, createdAt - startedAt) : 0;

        const recorderChunks = Array.isArray(recordedChunksRef.current)
            ? [...recordedChunksRef.current]
            : [];
        const recorderMimeType = (recordedMimeTypeRef.current || 'audio/webm').split(';')[0];
        const recorderBytes = recorderChunks.reduce((sum: number, c: any) => sum + (c?.size || 0), 0);

        const pcmChunks = Array.isArray(pcmChunksRef.current)
            ? pcmChunksRef.current.map((chunk) => new Float32Array(chunk))
            : [];
        const pcmSampleRate = pcmSampleRateRef.current || 16000;
        const pcmBlob = buildWavBlobFromFloat32(pcmChunks, pcmSampleRate);

        const mediaRecorderBlob =
            recorderChunks.length && recorderBytes >= MIN_TRANSCRIBE_AUDIO_BYTES
                ? new Blob(recorderChunks, { type: recorderMimeType })
                : null;

        const preferredBlob =
            FORCE_TRANSCRIBE_SOURCE === 'media_recorder'
                ? mediaRecorderBlob
                : pcmBlob;

        const fallbackBlob =
            FORCE_TRANSCRIBE_SOURCE === 'media_recorder'
                ? pcmBlob
                : mediaRecorderBlob;

        const chosenBlob = preferredBlob || fallbackBlob || null;

        const chosenSource =
            chosenBlob === pcmBlob && pcmBlob
                ? 'pcm_wav'
                : (chosenBlob === mediaRecorderBlob && mediaRecorderBlob ? 'media_recorder' : 'none');

        const chosenBytes = chosenBlob?.size || 0;
        const isValidForTranscription =
            durationMs >= MIN_TRANSCRIBE_AUDIO_DURATION_MS && chosenBytes >= MIN_TRANSCRIBE_AUDIO_BYTES;

        const snapshot: TakeAudioSnapshot = {
            takeId,
            createdAt,
            startedAt,
            durationMs,
            recorderChunks,
            recorderMimeType,
            recorderBytes,
            pcmChunks,
            pcmSampleRate,
            pcmBlob,
            pcmBytes: pcmBlob?.size || 0,
            chosenBlob,
            chosenMimeType: chosenBlob?.type || recorderMimeType,
            chosenBytes,
            chosenSource,
            isValidForTranscription,
        };

        pushDebug('take_audio_snapshot', {
            takeId,
            createdAt,
            startedAt,
            durationMs,
            pcmChunkCount: snapshot.pcmChunks.length,
            pcmBlobBytes: snapshot.pcmBytes,
            pcmSampleRate: snapshot.pcmSampleRate,
            recorderChunkCount: snapshot.recorderChunks.length,
            recorderBytes: snapshot.recorderBytes,
            recorderMimeType: snapshot.recorderMimeType,
            chosenSource: snapshot.chosenSource,
            chosenBytes: snapshot.chosenBytes,
            chosenMimeType: snapshot.chosenMimeType,
            isValidForTranscription: snapshot.isValidForTranscription,
            forcedSource: FORCE_TRANSCRIBE_SOURCE,
        });

        console.log('[AUDIO DEBUG]', {
            takeId,
            durationMs,
            pcmBytes: snapshot.pcmBytes,
            mediaRecorderBytes: snapshot.recorderBytes,
            chosenSource: snapshot.chosenSource,
            chosenBytes: snapshot.chosenBytes,
            chosenMimeType: snapshot.chosenMimeType,
            isValidForTranscription: snapshot.isValidForTranscription,
            forcedSource: FORCE_TRANSCRIBE_SOURCE,
        });

        return snapshot;
    };

    const transcribeFromSnapshot = async (
        snapshot: TakeAudioSnapshot
    ): Promise<{
        transcript: Transcription[];
        transcriptionError?: string;
        audioSource: TakeAudioSnapshot['chosenSource'];
        audioBytes: number;
    }> => {
        const currentHistory = Array.isArray(transcriptionHistoryRef.current) ? transcriptionHistoryRef.current : [];
        const normalizedCurrent = normalizeTranscript(currentHistory);
        const currentUserText = getFinalUserTranscriptText(normalizedCurrent);
        const hasFinalUserSegment = normalizedCurrent.some((t) => t.source === 'user' && t.isFinal);

        pushDebug('transcribe_audio_sources', {
            takeId: snapshot.takeId,
            liveLen: currentUserText.length,
            hasFinalUserSegment,
            pcmChunkCount: snapshot.pcmChunks.length,
            pcmBlobBytes: snapshot.pcmBytes,
            pcmSampleRate: snapshot.pcmSampleRate,
            recorderChunkCount: snapshot.recorderChunks.length,
            recorderBytes: snapshot.recorderBytes,
            recorderMimeType: snapshot.recorderMimeType,
            chosenSource: snapshot.chosenSource,
            chosenBytes: snapshot.chosenBytes,
            chosenMimeType: snapshot.chosenMimeType,
        });

        if (hasFinalUserSegment && currentUserText) {
            pushDebug('transcribe_skipped', {
                reason: 'final_live_user_transcript_present',
                len: currentUserText.length,
                takeId: snapshot.takeId,
            });
            return {
                transcript: normalizedCurrent,
                audioSource: snapshot.chosenSource,
                audioBytes: snapshot.chosenBytes,
            };
        }

        if (!snapshot.chosenBlob || !snapshot.isValidForTranscription) {
            pushDebug('transcribe_skipped', {
                reason: !snapshot.chosenBlob ? 'no_audio_chunks' : 'audio_below_minimum_quality_gate',
                takeId: snapshot.takeId,
                durationMs: snapshot.durationMs,
                chosenBytes: snapshot.chosenBytes,
                minDurationMs: MIN_TRANSCRIBE_AUDIO_DURATION_MS,
                minBytes: MIN_TRANSCRIBE_AUDIO_BYTES,
                chunks: snapshot.recorderChunks.length,
                liveLen: currentUserText.length,
                hasFinalUserSegment,
            });

            return {
                transcript: currentUserText
                    ? ([{ source: 'user', text: currentUserText, isFinal: true }] as any)
                    : [],
                transcriptionError: currentUserText ? undefined : (!snapshot.chosenBlob ? 'no_audio_captured' : 'audio_below_minimum_quality_gate'),
                audioSource: snapshot.chosenSource,
                audioBytes: snapshot.chosenBytes,
            };
        }

        try {
            const w = window as any;
            w.__REHEARSAL_AUDIO__ = {
                size: snapshot.chosenBlob.size,
                type: snapshot.chosenBlob.type,
                ts: Date.now(),
            };
            w.__REHEARSAL_AUDIO_URL__ = URL.createObjectURL(snapshot.chosenBlob);
        } catch {
            // ignore
        }

        pushDebug('audio_finalized', {
            takeId: snapshot.takeId,
            chunks: snapshot.recorderChunks.length,
            bytes: snapshot.chosenBlob.size,
            type: snapshot.chosenBlob.type,
            source: snapshot.chosenSource,
        });

        const audioBase64 = await blobToBase64(snapshot.chosenBlob);

        pushDebug('transcribe_request', {
            takeId: snapshot.takeId,
            bytes: snapshot.chosenBlob.size,
            mimeType: snapshot.chosenBlob.type,
            base64Len: audioBase64.length,
            liveLen: currentUserText.length,
            hasFinalUserSegment,
            durationMs: snapshot.durationMs,
            chosenSource: snapshot.chosenSource,
        });

        const transcribeStartedAt = Date.now();

        try {
            const { getBearerToken } = await import('../services/usageStatusService');
            const authHeader = await getBearerToken();
            const requestBody = JSON.stringify({
                audioBase64,
                mimeType: snapshot.chosenBlob.type,
            });

            const requestTranscription = async (attempt: number) => {
                const res = await fetch('/api/transcribe', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: authHeader,
                    },
                    body: requestBody,
                });
                const json = await res.json().catch(() => ({}));
                const serverTranscript = String(json?.transcript || '').trim();
                pushDebug('transcribe_attempt', {
                    takeId: snapshot.takeId,
                    attempt,
                    status: res.status,
                    ok: res.ok,
                    transcriptLen: serverTranscript.length,
                    error: json?.error ? String(json.error).slice(0, 200) : '',
                });
                return { res, json, serverTranscript };
            };

            let { res, json, serverTranscript } = await requestTranscription(1);
            if (res.ok && serverTranscript.length < EMPTY_TRANSCRIPT_RETRY_MIN_CHARS) {
                await delay(350);
                const retry = await requestTranscription(2);
                if (retry.serverTranscript.length > serverTranscript.length || (!serverTranscript && retry.res.ok)) {
                    ({ res, json, serverTranscript } = retry);
                }
            }

            try {
                (window as any).__REHEARSAL_TRANSCRIBE__ = {
                    status: res.status,
                    ok: res.ok,
                    error: json?.error ? String(json.error) : '',
                    len: serverTranscript.length,
                    preview: serverTranscript.slice(0, 160),
                    ts: Date.now(),
                };
            } catch {
                // ignore
            }

            pushDebug('transcribe_response', {
                takeId: snapshot.takeId,
                status: res.status,
                ok: res.ok,
                serverLen: serverTranscript.length,
                liveLen: currentUserText.length,
                error: json?.error ? String(json.error).slice(0, 200) : '',
            });

            if (res.ok && serverTranscript) {
                void logUserActivity({
                    tool_name: 'live_rehearsal',
                    event_type: 'tool_used',
                    success: true,
                    duration_ms: Date.now() - transcribeStartedAt,
                    metadata: {
                        source: 'transcribe',
                        transcript_length: serverTranscript.length,
                    },
                });

                const winner =
                    serverTranscript.length >= currentUserText.length
                        ? serverTranscript
                        : currentUserText;

                if (winner) {
                    const finalHistory: Transcription[] = [
                        { source: 'user', text: winner, isFinal: true } as any,
                    ];
                    transcriptionHistoryRef.current = finalHistory;
                    currentTakeUserTranscriptTextRef.current = winner;
                    setTranscriptionHistory(finalHistory);

                    return {
                        transcript: finalHistory,
                        audioSource: snapshot.chosenSource,
                        audioBytes: snapshot.chosenBytes,
                    };
                }
            }

            if (!res.ok) {
                void logUserActivity({
                    tool_name: 'live_rehearsal',
                    event_type: 'error',
                    success: false,
                    duration_ms: Date.now() - transcribeStartedAt,
                    metadata: {
                        source: 'transcribe',
                        message: json?.error ? String(json.error) : `HTTP ${res.status}`,
                        error_kind: /quota|limit/i.test(String(json?.error || ''))
                            ? 'usage_limit_hit'
                            : /timeout/i.test(String(json?.error || ''))
                                ? 'timeout'
                                : 'ai_failure',
                        status: res.status,
                    },
                });
            }

            const fallbackTranscript = currentUserText
                ? ([{ source: 'user', text: currentUserText, isFinal: true }] as any)
                : [];

            return {
                transcript: fallbackTranscript,
                transcriptionError: serverTranscript
                    ? undefined
                    : (json?.error ? String(json.error) : (!res.ok ? `HTTP ${res.status}` : 'empty_transcript')),
                audioSource: snapshot.chosenSource,
                audioBytes: snapshot.chosenBytes,
            };
        } catch (err: any) {
            void logUserActivity({
                tool_name: 'live_rehearsal',
                event_type: 'error',
                success: false,
                duration_ms: Date.now() - transcribeStartedAt,
                metadata: {
                    source: 'transcribe',
                    message: String(err?.message || err),
                    error_kind: /timeout/i.test(String(err?.message || err)) ? 'timeout' : 'ai_failure',
                },
            });

            pushDebug('transcribe_error', {
                takeId: snapshot.takeId,
                message: String(err?.message || err),
            });

            try {
                (window as any).__REHEARSAL_TRANSCRIBE__ = {
                    status: 0,
                    ok: false,
                    error: String(err?.message || err),
                    len: 0,
                    preview: '',
                    ts: Date.now(),
                };
            } catch {
                // ignore
            }

            return {
                transcript: currentUserText
                    ? ([{ source: 'user', text: currentUserText, isFinal: true }] as any)
                    : [],
                transcriptionError: String(err?.message || err),
                audioSource: snapshot.chosenSource,
                audioBytes: snapshot.chosenBytes,
            };
        }
    };

    const buildTakeFromSnapshot = (
        snapshot: TakeAudioSnapshot,
        transcriptResult: {
            transcript: Transcription[];
            transcriptionError?: string;
            audioSource: TakeAudioSnapshot['chosenSource'];
            audioBytes: number;
        },
        markers: SegmentMarker[],
        startedAt: number,
        endedAt: number,
        takeNumber: number
    ): Take => ({
        takeNumber,
        startedAt,
        endedAt,
        transcript: transcriptResult.transcript,
        markers,
        transcriptionError: transcriptResult.transcriptionError,
        audioSource: transcriptResult.audioSource,
        audioBytes: transcriptResult.audioBytes,
    });

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
        setIsAnalyzing(true);
        // Record minutes used for the current session.
        const start = sessionStartRef.current;
        if (start) {
            const minutes = (Date.now() - start) / 60000;
            try {
                const res = await consumeLiveMinutesServer(minutes);
                emitLiveUsageUpdate(res);
                // Refresh chip after server-side consumption
                void refreshDailyLive();
                if (!res.ok) {
                    // If we hit the cap, show it immediately (unified blocked UX).
                    setBlockedUx(
                        normalizeBlockedUx(
                            { error_code: 'QUOTA_EXCEEDED', message: res.error || 'Live rehearsal limit reached.', status: 429, retryable: false },
                            { toolName: 'Live Rehearsal (Audio)' }
                        )
                    );
                    setStatus('error');
                    setErrorMessage(res.error || 'You’ve reached today’s live rehearsal limit. Your minutes reset tomorrow.');
                }
            } catch {
                // Fall back to local tracker if server is unavailable.
                try {
                    consumeLiveMinutes(user, minutes);
                    setUsageWarning(getSoftLimitWarning(user, 'live_minutes'));
                    void refreshDailyLive();
                } catch {
                    // ignore
                }
            }
            sessionStartRef.current = null;
        }
        if (reason) setErrorMessage(reason);

        // Stop recording and flush last chunks BEFORE we tear down tracks.
        await stopRecorderAndFlush();

        // Snapshot audio immediately after recorder stop. Finalize from this immutable take snapshot.
        const audioSnapshot = captureTakeSnapshot();
        const transcriptResult = await transcribeFromSnapshot(audioSnapshot);

        // Finalize this take from one resolved transcript source.
        let completedTake: any = null;
        try {
            const resolvedTranscript = normalizeTranscript(transcriptResult.transcript);
            const fallbackText = String(currentTakeUserTranscriptTextRef.current || '').trim();
            const takeTranscript = resolvedTranscript.length > 0
                ? resolvedTranscript
                : (fallbackText ? ([{ source: 'user', text: fallbackText, isFinal: true }] as any) : []);

            const startedAt = currentTakeStartRef.current ?? audioSnapshot.createdAt;
            const endedAt = Date.now();
            const takeNumber = (takesRef.current?.length ?? 0) + 1;

            pushDebug('take_transcript_before_save', {
                takeId: audioSnapshot.takeId,
                takeNumber,
                resolvedTranscriptLen: getFinalUserTranscriptText(resolvedTranscript).length,
                fallbackTextLen: fallbackText.length,
                finalTranscriptLen: getFinalUserTranscriptText(takeTranscript).length,
                finalTranscriptPreview: getFinalUserTranscriptText(takeTranscript).slice(0, 120),
                audioSource: audioSnapshot.chosenSource,
                audioBytes: audioSnapshot.chosenBytes,
                transcriptionError: transcriptResult.transcriptionError || '',
            });

            const finalizedTake = buildTakeFromSnapshot(
                audioSnapshot,
                { ...transcriptResult, transcript: takeTranscript },
                currentMarkers,
                startedAt,
                endedAt,
                takeNumber
            ) as any;

            if (finalizedTake.transcriptionError) {
                pushDebug('take_finalized_without_transcript', {
                    takeId: audioSnapshot.takeId,
                    takeNumber,
                    reason: finalizedTake.transcriptionError,
                    audioSource: finalizedTake.audioSource,
                    audioBytes: finalizedTake.audioBytes,
                });
            }

            const nextTakes = [...(takesRef.current ?? []), finalizedTake];
            completedTake = finalizedTake;
            takesRef.current = nextTakes;
            const nextSelectedTake = Math.max(0, nextTakes.length - 1);
            selectedTakeRef.current = nextSelectedTake;
            setTakes(nextTakes as any);
            setSelectedTake(nextSelectedTake);

            pushDebug('finalized_take', {
                takeId: audioSnapshot.takeId,
                takeNumber,
                transcriptLen: getFinalUserTranscriptText(takeTranscript).length,
                transcriptPreview: getFinalUserTranscriptText(takeTranscript).slice(0, 120),
                takesCount: nextTakes.length,
                selectedTake: nextSelectedTake,
                audioSource: finalizedTake.audioSource,
                audioBytes: finalizedTake.audioBytes,
                transcriptionError: finalizedTake.transcriptionError || '',
            });
        } catch {
            // ignore
        } finally {
            currentTakeStartRef.current = null;
            setCurrentMarkers([]);
        }

        completedTake = completedTake ?? takesRef.current[takesRef.current.length - 1];
        trackLiveRehearsalEvent('live_rehearsal_take_complete', {
            mode: isDemoTranscript(completedTake?.transcript) ? 'demo' : 'live',
            take_number: completedTake?.takeNumber ?? takesRef.current.length,
            markers: Array.isArray(completedTake?.markers) ? completedTake.markers.length : 0,
            transcript_chars: buildTakeTranscriptText(completedTake).length,
        }, {
            outcome: 'SUCCESS_NOT_CHARGED',
            units: completedTake?.startedAt && completedTake?.endedAt ? Math.max(1, Math.round((completedTake.endedAt - completedTake.startedAt) / 1000)) : undefined,
        });

        await safeCleanupSession();
        openReviewForTake(Math.max(0, takesRef.current.length - 1));
    };
    

    const handleAddMarker = () => {
        if (status !== 'listening') return;
        setCurrentMarkers((prev) => {
            const next = [...prev, createDefaultMarker(prev.length, sessionElapsed)];
            setMarkerCount(next.length);
            return next;
        });
    };

    const loadDemoScriptIntoStudio = () => {
        trackLiveRehearsalEvent('live_rehearsal_demo_loaded', { mode: 'demo' }, { outcome: 'SUCCESS_NOT_CHARGED' });
        const startedAt = Date.now() - (DEMO_DURATION_SECONDS * 1000);
        const markers = buildDemoMarkers(startedAt);
        setDemoScript(DEMO_SCRIPT);
        setDemoDurationSeconds(DEMO_DURATION_SECONDS);
        setDemoMarkers(markers);
        setMarkerCount(markers.length);
        setSessionElapsed('0:00');
        setStatus('idle');
        setErrorMessage('');
        setBlockedUx(null);
        currentTakeUserTranscriptTextRef.current = '';
        pcmChunksRef.current = [];
        setTranscriptionHistory([]);
        setTakes([]);
        setSelectedTake(0);
        clearDraft();
        setSessionTitle('Demo Rehearsal Session');
        setSessionNotes(DEMO_SESSION_NOTES);
    };

    const handleAddDemoButton = () => {
        if (demoScript.trim()) {
            handleRunDemoReview();
            return;
        }
        loadDemoScriptIntoStudio();
    };

    const injectDemoTake = (replaceSelected = false) => {
        const script = demoScript.trim();
        if (!script) return;
        const now = Date.now();
        const durationSeconds = demoDurationSeconds || DEMO_DURATION_SECONDS;
        const startedAt = now - durationSeconds * 1000;
        const markers = buildDemoMarkers(startedAt);
        const demoTranscript = [{ source: 'user', text: script, isFinal: true }] as Transcription[];

        setTakes((prev) => {
            const incomingDemoTake = { takeNumber: 1, startedAt, endedAt: now, transcript: demoTranscript, markers } as any;
            const existing = [...(prev ?? [])];
            const liveOnly = existing.filter((take) => !isDemoTranscript((take as any)?.transcript));
            const hasOnlyDemoState = existing.length > 0 && liveOnly.length === 0;

            if (replaceSelected && existing.length > 0 && selectedTake >= 0 && selectedTake < existing.length) {
                const target = existing[selectedTake] as any;
                if (isDemoTranscript(target?.transcript) || hasOnlyDemoState) {
                    setSelectedTake(0);
                    return [incomingDemoTake] as any;
                }
            }

            if (hasOnlyDemoState || existing.length === 0) {
                setSelectedTake(0);
                return [incomingDemoTake] as any;
            }

            const takeNumber = liveOnly.length + 1;
            const next = [...liveOnly, { ...incomingDemoTake, takeNumber } as any];
            setSelectedTake(Math.max(0, next.length - 1));
            return next as any;
        });
        setMarkerCount(markers.length);
        setCurrentMarkers([]);
        currentTakeUserTranscriptTextRef.current = '';
        pcmChunksRef.current = [];
        setTranscriptionHistory([]);
        setErrorMessage('');
        setBlockedUx(null);
        setStatus('idle');
        setSessionElapsed('0:00');
        setSessionTitle('Demo Rehearsal Session');
        setSessionNotes(DEMO_SESSION_NOTES);
        setView('reviewing');
    };

    const handleRunDemoReview = () => {
        trackLiveRehearsalEvent('live_rehearsal_demo_review', { mode: 'demo' }, { outcome: 'SUCCESS_NOT_CHARGED' });
        injectDemoTake(false);
        openReviewForTake(0);
    };

    const handleAnalyzeDemoTake = () => {
        trackLiveRehearsalEvent('live_rehearsal_analyze_click', { mode: 'demo', selected_take: 1 }, { outcome: 'SUCCESS_NOT_CHARGED' });
        injectDemoTake(true);
        openReviewForTake(0);
    };

    const handleAnalyzeCurrentTake = () => {
        const activeIndex = Math.max(0, Math.min(selectedTakeRef.current, Math.max(0, takesRef.current.length - 1)));
        const activeTake = takesRef.current[activeIndex];
        trackLiveRehearsalEvent('live_rehearsal_analyze_click', { mode: isDemoTranscript(activeTake?.transcript) ? 'demo' : 'live', selected_take: activeIndex + 1 }, { outcome: 'SUCCESS_NOT_CHARGED' });
        openReviewForTake(activeIndex);
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
            setErrorMessage('Something went wrong. Please refresh and try again.');
            setStatus('error');
            setView('rehearsing');
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
                        clearDraft();
                        setSessionIdeaId(null);
                        setSessionTitle(`Live Rehearsal Session - ${new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`);
                        setSessionNotes('');
                        setTakes([]);
                        setSelectedTake(0);
                        setDemoScript('');
                        setDemoDurationSeconds(0);
                        setDemoMarkers([]);
                        currentTakeUserTranscriptTextRef.current = '';
        pcmChunksRef.current = [];
        setTranscriptionHistory([]);
                        setErrorMessage('');
                        setStatus('idle');
                        setView('idle');
                    }}
                    onSessionSaved={(id) => setSessionIdeaId(id)}
                    onIdeaSaved={onIdeaSaved}
                    onReturnToStudio={safeReturnToStudio}
                    onAnalyzeDemoTake={handleAnalyzeDemoTake}
                    onAnalyzeTake={handleAnalyzeCurrentTake}
                    onOpenAngleRisk={onOpenAngleRisk}
                    onOpenPatterEngine={onOpenPatterEngine}
                    onOpenDirectorMode={onOpenDirectorMode}
                />;
            case 'rehearsing':
            case 'idle':
            default:
                return (
                    <div className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col gap-5">
                        <StatusIndicator
                            status={status}
                            isAnalyzing={isAnalyzing}
                            errorMessage={errorMessage}
                            usageWarning={usageWarning}
                            resourceNotice={resourceNotice}
                            blockedUx={blockedUx}
                            onUpgrade={onRequestUpgrade}
                            onStart={handleStartSession}
                            elapsed={sessionElapsed}
                            markerCount={markerCount}
                            helpOpen={studioHelpOpen}
                            onToggleHelp={() => setStudioHelpOpen((prev) => !prev)}
                            onReset={() => {
                                setMarkerCount(0);
                                setCurrentMarkers([]);
                                setDemoScript('');
                                setDemoDurationSeconds(0);
                                setDemoMarkers([]);
                                setTakes([]);
                                setSelectedTake(0);
                                setSessionTitle(`Live Rehearsal Session - ${new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`);
                                setSessionNotes('');
                                clearDraft();
                                currentTakeUserTranscriptTextRef.current = '';
        pcmChunksRef.current = [];
        setTranscriptionHistory([]);
                                setErrorMessage('');
                                setBlockedUx(null);
                                setStatus('idle');
                                setSessionElapsed('0:00');
                                setView('idle');
                            }}
                            onAddMarker={handleAddMarker}
                            currentMarkers={currentMarkers}
                            onLoadDemo={handleAddDemoButton}
                            onRunDemoReview={handleRunDemoReview}
                            demoScript={demoScript}
                            demoDurationSeconds={demoDurationSeconds}
                            demoMarkers={demoMarkers}
                        />

                        {transcriptionHistory.length > 0 ? (
                            <div className="space-y-4 bg-slate-900/30 border border-slate-700 rounded-xl p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <div className="text-slate-100 font-semibold">Live Transcript</div>
                                        <div className="text-xs text-slate-400">Your rehearsal transcript builds here while the AI coach listens.</div>
                                    </div>
                                    {status === 'listening' ? (
                                        <div className="text-xs text-purple-200 bg-purple-900/30 border border-purple-700/50 rounded-full px-3 py-1 font-semibold">Recording Active</div>
                                    ) : null}
                                </div>
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
                        ) : null}

                        {view === 'idle' && status !== 'connecting' && (
                            <div className="w-full max-w-3xl mx-auto">
                                <RehearsalHistory />
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
                    <div className={`rounded-full ${status === 'listening' ? 'animate-pulse shadow-[0_0_18px_rgba(168,85,247,0.5)]' : ''}`}>
                        <MicrophoneIcon className={`w-6 h-6 ${status === 'listening' ? 'text-purple-300' : 'text-purple-400'}`} />
                    </div>
                    <h2 className="text-xl font-bold text-white">Live Rehearsal Studio</h2>
                    {dailyLive && dailyLive.limit > 0 ? (
                        <div
                            title={`Daily live rehearsal minutes remaining (${dailyLive.source}).`}
                            className={`ml-2 inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold border ${
                                dailyLive.remaining <= 2
                                    ? 'bg-red-900/30 border-red-600/40 text-red-200'
                                    : dailyLive.remaining <= 5
                                      ? 'bg-amber-900/30 border-amber-600/40 text-amber-200'
                                      : 'bg-slate-800/60 border-slate-600/50 text-slate-200'
                            }`}
                        >
                            <span className="opacity-80">Daily Remaining</span>
                            <span className="text-white">{Math.max(0, Math.round(dailyLive.remaining))}m</span>
                        </div>
                    ) : null}
                </div>
                <button 
                    onClick={handleHeaderButtonClick}
                    disabled={isAnalyzing}
                    className={`flex items-center gap-2 px-4 py-2 text-sm rounded-md font-bold transition-colors ${
                        view === 'rehearsing'
                            ? (isAnalyzing
                                ? 'bg-amber-600 text-white cursor-wait animate-pulse'
                                : 'bg-red-600 hover:bg-red-700 text-white')
                            : 'bg-slate-600 hover:bg-slate-700 text-white'
                    }`}
                >
                    {view === 'rehearsing'
                        ? (isAnalyzing ? <div className="w-4 h-4 rounded-full border-2 border-white/70 border-t-transparent animate-spin" /> : <StopIcon className="w-4 h-4" />)
                        : <BackIcon className="w-4 h-4" />}
                    <span>{view === 'rehearsing' ? (isAnalyzing ? 'Analyzing…' : 'Stop & Review') : 'Back to Studio'}</span>
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


const StatusIndicator: React.FC<{
    status: string,
    isAnalyzing: boolean,
    errorMessage: string,
    usageWarning: string | null,
    resourceNotice: string,
    blockedUx: BlockedUx | null,
    onUpgrade?: () => void,
    onStart: () => void,
    elapsed: string,
    markerCount: number,
    helpOpen: boolean,
    onToggleHelp: () => void,
    onReset: () => void,
    onAddMarker: () => void,
    currentMarkers: SegmentMarker[],
    onLoadDemo: () => void,
    onRunDemoReview: () => void,
    demoScript: string,
    demoDurationSeconds: number,
    demoMarkers: SegmentMarker[],
}> = ({status, isAnalyzing, errorMessage, usageWarning, resourceNotice, blockedUx, onUpgrade, onStart, elapsed, markerCount, helpOpen, onToggleHelp, onReset, onAddMarker, currentMarkers, onLoadDemo, onRunDemoReview, demoScript, demoDurationSeconds, demoMarkers}) => {
    const isDemoLoaded = Boolean(demoScript.trim());
    const isRecording = status === 'listening';
    const isConnecting = status === 'connecting';
    const label = isAnalyzing ? 'Analyzing' : isRecording ? 'Recording' : isConnecting ? 'Connecting' : status === 'error' ? 'Attention Needed' : 'Ready';

    return (
        <div className="w-full max-w-4xl mx-auto space-y-4">
            <div className="bg-slate-900/40 border border-slate-700 rounded-2xl p-5 md:p-6">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
                    <div className="flex items-start gap-4">
                        <div className={`relative w-16 h-16 rounded-2xl border flex items-center justify-center ${isRecording ? 'bg-purple-600/20 border-purple-400/60 shadow-[0_0_18px_rgba(168,85,247,0.35)]' : isAnalyzing ? 'bg-amber-600/20 border-amber-400/60' : 'bg-slate-800 border-slate-700'}`}>
                            {isRecording ? <div className="absolute inset-0 rounded-2xl bg-purple-500/20 animate-ping opacity-70" /> : null}
                            {isRecording ? <div className="absolute inset-1 rounded-2xl border border-purple-300/30 animate-pulse" /> : null}
                            <MicrophoneIcon className={`relative w-8 h-8 ${isRecording ? 'text-purple-200' : isAnalyzing ? 'text-amber-200' : 'text-slate-300'}`} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-slate-100">Live Rehearsal Studio</h2>
                            <p className="text-sm text-slate-400 mt-1 max-w-2xl">Practice your script and get structured feedback on delivery, pacing, confidence, and clarity.</p>
                            <div className={`mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold border ${isRecording ? 'bg-purple-900/30 border-purple-500/50 text-purple-100' : isAnalyzing ? 'bg-amber-900/20 border-amber-500/40 text-amber-100 animate-pulse' : isConnecting ? 'bg-amber-900/20 border-amber-500/40 text-amber-100' : status === 'error' ? 'bg-red-900/20 border-red-500/40 text-red-100' : 'bg-slate-800 border-slate-600 text-slate-200'}`}>
                                <span>🎤 Status:</span>
                                <span>{label}</span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 min-w-[260px]">
                        <div className="rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3">
                            <div className="text-[11px] uppercase tracking-wide text-slate-400">Status</div>
                            <div className="mt-1 text-sm font-semibold text-slate-100">{label}</div>
                        </div>
                        <div className="rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3">
                            <div className="text-[11px] uppercase tracking-wide text-slate-400">Duration</div>
                            <div className="mt-1 text-sm font-semibold text-slate-100">{elapsed}</div>
                        </div>
                        <div className="rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3 col-span-2 md:col-span-1">
                            <div className="text-[11px] uppercase tracking-wide text-slate-400">Markers</div>
                            <div className="mt-1 text-sm font-semibold text-slate-100">{markerCount}</div>
                        </div>
                    </div>
                </div>

                {status === 'error' && blockedUx ? (
                    <div className="mt-5 max-w-xl">
                        <BlockedPanel
                            blocked={blockedUx}
                            onUpgrade={blockedUx.showUpgrade ? onUpgrade : undefined}
                            onRetry={blockedUx.retryable ? onStart : undefined}
                        />
                    </div>
                ) : null}

                {status === 'error' && !blockedUx && errorMessage ? (
                    <div className="mt-5 text-sm text-red-300 bg-red-900/20 border border-red-700/40 rounded-md px-3 py-2">
                        {errorMessage}
                    </div>
                ) : null}
                <div className="mt-5 text-xs text-amber-100 bg-amber-900/20 border border-amber-700/30 rounded-md px-3 py-2">
                    {resourceNotice}
                </div>
                {status !== 'error' && usageWarning ? (
                    <div className="mt-5 text-sm text-amber-200 bg-amber-900/20 border border-amber-700/40 rounded-md px-3 py-2">
                        {usageWarning}
                    </div>
                ) : null}

                <div className="mt-5 flex flex-wrap items-center gap-3">
                    <button onClick={onStart} disabled={isRecording || isConnecting || isAnalyzing} className={`px-6 py-3 rounded-full text-white font-bold transition-colors flex items-center gap-3 ${isRecording || isConnecting || isAnalyzing ? 'bg-slate-700 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700'}`}>
                        <MicrophoneIcon className="w-5 h-5" />
                        <span>{isRecording ? 'Rehearsal Active' : isAnalyzing ? 'Analysis in Progress…' : isConnecting ? 'Connecting…' : 'Start Rehearsal'}</span>
                    </button>
                    <button onClick={onAddMarker} disabled={!isRecording || isAnalyzing} className={`px-4 py-2.5 rounded-lg border font-semibold transition-colors ${isRecording ? 'border-amber-500/50 text-amber-200 hover:bg-amber-900/15' : 'border-slate-700 text-slate-500 cursor-not-allowed'}`} >
                        Add Marker
                    </button>
                    <button onClick={onReset} className="px-4 py-2.5 rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800/60 font-semibold transition-colors">
                        Reset Studio
                    </button>
                    <button onClick={onLoadDemo} className="px-4 py-2.5 rounded-lg border border-purple-600/50 text-purple-200 hover:bg-purple-900/20 font-semibold transition-colors">
                        {isDemoLoaded ? 'Analyze Loaded Demo' : 'Load Demo Script'}
                    </button>
                </div>
            </div>

            {currentMarkers.length > 0 ? (
                <div className="bg-slate-900/30 border border-slate-700 rounded-xl p-4">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <div className="text-slate-100 font-semibold">Segment Markers</div>
                            <div className="text-xs text-slate-400">Label the important beats of the routine while you rehearse.</div>
                        </div>
                        <div className="text-xs uppercase tracking-wide text-amber-200/80">Live markers</div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                        {currentMarkers.map((marker, index) => (
                            <div key={marker.id} className="px-3 py-1.5 rounded-full border border-amber-500/30 bg-amber-900/15 text-amber-100 text-sm font-medium">
                                {`Marker ${index + 1} – ${marker.label}`}
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}

            <div className="bg-slate-900/30 border border-slate-700 rounded-xl overflow-hidden">
                <button onClick={onToggleHelp} className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-800/60 transition-colors">
                    <div>
                        <div className="text-slate-100 font-semibold">How Live Rehearsal Works</div>
                        <div className="text-xs text-slate-400">Quick guidance for stronger rehearsals and cleaner AI feedback.</div>
                    </div>
                    <ChevronDownIcon className={`w-5 h-5 text-slate-300 transition-transform ${helpOpen ? 'rotate-180' : ''}`} />
                </button>
                {helpOpen ? (
                    <div className="px-4 pb-4">
                        <div className="grid gap-2 text-sm text-slate-300">
                            <div className="flex items-start gap-2"><CheckIcon className="w-4 h-4 mt-0.5 text-purple-300" /><span>Speak your script naturally and let the system capture your delivery rhythm.</span></div>
                            <div className="flex items-start gap-2"><CheckIcon className="w-4 h-4 mt-0.5 text-purple-300" /><span>The AI analyzes pacing, tone, confidence, and clarity after the rehearsal ends.</span></div>
                            <div className="flex items-start gap-2"><CheckIcon className="w-4 h-4 mt-0.5 text-purple-300" /><span>Use headphones for best results so the coach audio does not echo into the mic.</span></div>
                        </div>
                    </div>
                ) : null}
            </div>

            {demoScript ? (
                <div className="bg-purple-900/15 border border-purple-700/40 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                        <LightbulbIcon className="w-5 h-5 text-purple-300 mt-0.5" />
                        <div className="flex-1">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <div className="text-purple-100 font-semibold">Demo Script Loaded</div>
                                    <div className="text-xs text-purple-100/70 mt-1">Sample transcript, duration, markers, and session metadata are now loaded into the studio.</div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <div className="px-3 py-1.5 rounded-full border border-purple-500/30 bg-purple-950/40 text-purple-100 text-xs font-semibold">Duration preset: {formatElapsed(demoDurationSeconds * 1000)}</div>
                                    <div className="px-3 py-1.5 rounded-full border border-purple-500/30 bg-purple-950/40 text-purple-100 text-xs font-semibold">Markers preset: {demoMarkers.length}</div>
                                </div>
                            </div>
                            <p className="text-sm text-purple-100/90 mt-3 whitespace-pre-line">{demoScript}</p>
                            {demoMarkers.length > 0 ? (
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {demoMarkers.map((marker, index) => (
                                        <div key={marker.id} className="px-3 py-1.5 rounded-full border border-amber-500/30 bg-amber-900/15 text-amber-100 text-sm font-medium">
                                            {`Marker ${index + 1} – ${marker.label}`}
                                        </div>
                                    ))}
                                </div>
                            ) : null}
                            <div className="mt-4 flex flex-wrap items-center gap-3">
                                <button onClick={onRunDemoReview} className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-semibold transition-colors">
                                    Run Demo Review
                                </button>
                                <div className="text-xs text-purple-100/75">Generate the same structured rehearsal review used after a real take, without leaving this page. The main demo button above also becomes Analyze Loaded Demo after the script is loaded.</div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
};

type RehearsalHistoryItem = {
    id: string;
    title: string;
    createdAt: string;
    transcript: Transcription[];
    notes: string;
    sessionLengthLabel: string;
    confidenceScore: number;
    markerLabels: string[];
};

const RehearsalHistory: React.FC = () => {
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
                let latestTake: { startedAt?: number; endedAt?: number; transcript?: Transcription[]; markers?: SegmentMarker[] } | null = null;
                let totalDurationMs = 0;
                let markerLabels: string[] = [];
                try {
                    const obj = JSON.parse(String(r.content || ''));
                    if (Array.isArray(obj?.transcript)) {
                        transcript = obj.transcript as any;
                        latestTake = { transcript };
                    }
                    if (Array.isArray(obj?.takes)) {
                        const combined: Transcription[] = [];
                        for (const take of obj.takes) {
                            const n = Number(take?.takeNumber ?? 0) || combined.length + 1;
                            combined.push({ source: 'model', text: `— Take ${n} —`, isFinal: true } as any);
                            if (Array.isArray(take?.transcript)) {
                                for (const seg of take.transcript) combined.push(seg as any);
                            }
                            const startedAt = Number(take?.startedAt ?? 0) || 0;
                            const endedAt = Number(take?.endedAt ?? 0) || 0;
                            if (startedAt && endedAt && endedAt > startedAt) totalDurationMs += (endedAt - startedAt);
                        }
                        transcript = combined;
                        latestTake = obj.takes[obj.takes.length - 1] || null;
                        markerLabels = Array.isArray(latestTake?.markers) ? latestTake!.markers!.map((m: any) => String(m?.label || '')).filter(Boolean) : [];
                    }
                    if (typeof obj?.notes === 'string') notes = obj.notes;
                } catch {
                    const t = String(r.content || '').trim();
                    transcript = t ? ([{ source: 'user', text: t, isFinal: true }] as any) : [];
                    latestTake = { transcript };
                }
                const metrics = buildRehearsalMetrics(latestTake?.transcript || transcript, latestTake?.startedAt, latestTake?.endedAt);
                const sessionLengthLabel = formatElapsed(totalDurationMs || (((latestTake?.endedAt || 0) - (latestTake?.startedAt || 0)) || 0) || 0);
                return {
                    id: r.id,
                    title: r.title || 'Rehearsal',
                    createdAt,
                    transcript,
                    notes,
                    sessionLengthLabel: sessionLengthLabel === '0:00' ? '0:45' : sessionLengthLabel,
                    confidenceScore: metrics.confidenceScore,
                    markerLabels,
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
                        className="px-3 py-1.5 bg-transparent hover:bg-slate-800/60 rounded-md text-slate-300 text-sm font-semibold transition-colors"
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
                                        {it.createdAt}
                                    </div>
                                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                                        <div className="rounded-md border border-slate-700 bg-slate-900/40 px-2.5 py-2">
                                            <div className="text-slate-500 uppercase tracking-wide">Session length</div>
                                            <div className="text-slate-100 font-semibold mt-0.5">{it.sessionLengthLabel}</div>
                                        </div>
                                        <div className="rounded-md border border-slate-700 bg-slate-900/40 px-2.5 py-2">
                                            <div className="text-slate-500 uppercase tracking-wide">Confidence</div>
                                            <div className="text-emerald-300 font-semibold mt-0.5">{it.confidenceScore}%</div>
                                        </div>
                                        <div className="rounded-md border border-slate-700 bg-slate-900/40 px-2.5 py-2">
                                            <div className="text-slate-500 uppercase tracking-wide">Markers</div>
                                            <div className="text-slate-100 font-semibold mt-0.5">{it.markerLabels.length}</div>
                                        </div>
                                    </div>
                                    {it.markerLabels.length > 0 ? (
                                        <div className="mt-2 text-xs text-amber-200/90">
                                            Segments: {it.markerLabels.join(', ')}
                                        </div>
                                    ) : null}
                                    {it.notes ? (
                                        <div className="text-xs text-slate-300/80 mt-1 line-clamp-2">{it.notes}</div>
                                    ) : null}
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="px-3 py-1.5 rounded-md border border-slate-700 bg-slate-900/40 text-slate-300 text-sm font-semibold">
                                        Review saved session
                                    </div>
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
    takes: { takeNumber: number; startedAt: number; endedAt: number; transcript: Transcription[]; markers?: SegmentMarker[] }[];
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
    onAnalyzeDemoTake?: () => void;
    onAnalyzeTake?: () => void;
    onOpenAngleRisk?: () => void;
    onOpenPatterEngine?: () => void;
    onOpenDirectorMode?: () => void;
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
    onAnalyzeDemoTake,
    onAnalyzeTake,
    onOpenAngleRisk,
    onOpenPatterEngine,
    onOpenDirectorMode,
}) => {
    const transcriptEndRef = useRef<HTMLDivElement>(null);
    const [saveError, setSaveError] = useState<string>('');
    const [saveSuccess, setSaveSuccess] = useState<string>('');
    const [isSaving, setIsSaving] = useState(false);
    const [integrationMessage, setIntegrationMessage] = useState<string>('');
    const [isSavingRoutine, setIsSavingRoutine] = useState(false);
    const [refineOpen, setRefineOpen] = useState(false);
    const [refinePrompt, setRefinePrompt] = useState('');
    const [refineResult, setRefineResult] = useState<CoachingFollowUpResult | null>(null);

    const current = takes?.[selectedTake] ?? null;
    const displayTakeNumber = current ? selectedTake + 1 : 0;
    const isDemoTake = Boolean(current && sessionTitle === 'Demo Rehearsal Session' && current.transcript?.some((seg) => String(seg?.text || '').includes('quick experiment in attention')));

    const scrollToReviewCards = () => {
        window.setTimeout(() => {
            try {
                const el = document.getElementById('live-rehearsal-review-anchor');
                el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } catch {
                // ignore
            }
        }, 50);
    };

    const handleAnalyzeSelectedTake = () => {
        setIntegrationMessage('');
        setSaveError('');
        if (isDemoTake) {
            onAnalyzeDemoTake?.();
        } else {
            onAnalyzeTake?.();
        }
        scrollToReviewCards();
    };

    useEffect(() => {
        setRefinePrompt('');
        setRefineResult(null);
        setRefineOpen(false);
    }, [selectedTake]);

    useEffect(() => {
        transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [selectedTake, takes]);


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

            trackLiveRehearsalEvent('live_rehearsal_session_saved', { takes: takes?.length ?? 0, session_title: sessionTitle || 'untitled' }, { outcome: 'SUCCESS_NOT_CHARGED' });
            setSaveSuccess('Saved successfully. You can start another take or continue refining your notes.');
        } catch (err: any) {
            setSaveError(String(err?.message || err || 'Failed to save rehearsal session.'));
        } finally {
            setIsSaving(false);
        }
    };

    const hasAnyTakes = (takes?.length ?? 0) > 0;

    const handleAnalyzeAngles = () => {
        if (!current) return;
        try {
            localStorage.setItem('maw_angle_risk_prefill_v1', JSON.stringify(buildAngleRiskPrefill(current, sessionTitle, sessionNotes)));
            trackLiveRehearsalEvent('live_rehearsal_send_to_angle_risk', { selected_take: current?.takeNumber ?? null }, { outcome: 'SUCCESS_NOT_CHARGED' });
            setIntegrationMessage('Sent to Angle & Risk. Your latest rehearsal transcript is ready as context.');
            onOpenAngleRisk?.();
        } catch (err: any) {
            setSaveError(String(err?.message || err || 'Failed to open Angle & Risk.'));
        }
    };

    const handleRefineScript = () => {
        if (!current) return;
        try {
            localStorage.setItem('maw_patter_engine_prefill_v1', JSON.stringify(buildPatterPrefill(current, sessionTitle, sessionNotes)));
            trackLiveRehearsalEvent('live_rehearsal_send_to_patter', { selected_take: current?.takeNumber ?? null }, { outcome: 'SUCCESS_NOT_CHARGED' });
            setIntegrationMessage('Sent to Patter Engine. The rehearsal transcript has been loaded for script refinement.');
            onOpenPatterEngine?.();
        } catch (err: any) {
            setSaveError(String(err?.message || err || 'Failed to open Patter Engine.'));
        }
    };

    const handleEvaluateInShow = () => {
        if (!current) return;
        try {
            localStorage.setItem('maw_director_mode_prefill_v1', JSON.stringify(buildDirectorPrefill(current, sessionTitle, sessionNotes)));
            trackLiveRehearsalEvent('live_rehearsal_send_to_director', { selected_take: current?.takeNumber ?? null }, { outcome: 'SUCCESS_NOT_CHARGED' });
            setIntegrationMessage('Sent to Director Mode. The current take is ready for show-level evaluation.');
            onOpenDirectorMode?.();
        } catch (err: any) {
            setSaveError(String(err?.message || err || 'Failed to open Director Mode.'));
        }
    };


    const quickRefinePrompts = [
        'Tighten my opening',
        'Improve pacing at reveal',
        'Make instructions clearer',
        'Add stronger audience engagement',
        'Rewrite this for more confidence',
    ];

    const runRefine = (promptOverride?: string) => {
        if (!current) return;
        const promptToUse = (promptOverride ?? refinePrompt).trim();
        if (!promptToUse) return;
        setRefinePrompt(promptToUse);
        const metrics = buildRehearsalMetrics(current.transcript, current.startedAt, current.endedAt);
        setRefineResult(buildCoachingFollowUp({
            instruction: promptToUse,
            takeTitle: `${sessionTitle} — Take ${current.takeNumber}`,
            transcript: current.transcript,
            markers: current.markers || [],
            metrics,
            startedAt: current.startedAt,
            endedAt: current.endedAt,
        }));
        setRefineOpen(true);
    };

    const handleSaveRoutine = async () => {
        if (!current) return;
        setIntegrationMessage('');
        setSaveError('');
        setIsSavingRoutine(true);
        try {
            await saveIdea(buildRoutineIdeaPayload(current, sessionTitle, sessionNotes));
            trackLiveRehearsalEvent('live_rehearsal_save_routine', { selected_take: current?.takeNumber ?? null }, { outcome: 'SUCCESS_NOT_CHARGED' });
            setIntegrationMessage('Routine saved to Idea Vault.');
            try { onIdeaSaved(); } catch {}
        } catch (err: any) {
            setSaveError(String(err?.message || err || 'Failed to save routine.'));
        } finally {
            setIsSavingRoutine(false);
        }
    };

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-4 md:p-6 flex-1 overflow-y-auto space-y-5">
                <div className="flex flex-col gap-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <h3 className="text-xl font-bold text-slate-200 font-cinzel">Session Review</h3>
                        {current ? (
                            <button
                                onClick={() => setRefineOpen((prev) => !prev)}
                                className="px-4 py-2 rounded-md border border-purple-500/40 bg-purple-900/20 hover:bg-purple-900/30 text-purple-100 text-sm font-semibold transition-colors"
                            >
                                {refineOpen ? 'Hide AI Follow-Up' : 'Refine with AI'}
                            </button>
                        ) : null}
                    </div>
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

                {current && refineOpen ? (
                    <div className="bg-slate-900/40 border border-slate-700 rounded-xl p-4 space-y-4">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                            <div>
                                <div className="text-slate-100 font-semibold">AI Coaching Follow-Up</div>
                                <div className="text-sm text-slate-400 mt-1">Ask for a focused rewrite or coaching pass without leaving this take.</div>
                            </div>
                            <div className="text-xs uppercase tracking-wide text-purple-200/80">Take {current.takeNumber} refinement</div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            {quickRefinePrompts.map((prompt) => (
                                <button
                                    key={prompt}
                                    onClick={() => runRefine(prompt)}
                                    className="px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-slate-100 text-sm font-medium transition-colors"
                                >
                                    {prompt}
                                </button>
                            ))}
                        </div>

                        <div className="flex flex-col lg:flex-row gap-3">
                            <input
                                value={refinePrompt}
                                onChange={(e) => setRefinePrompt(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') runRefine(); }}
                                className="flex-1 px-3 py-3 rounded-md bg-slate-800 border border-slate-700 text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                placeholder="Ask AI to refine this take, rewrite a line, or improve a specific beat..."
                            />
                            <button
                                onClick={() => runRefine()}
                                disabled={!refinePrompt.trim()}
                                className={`px-4 py-3 rounded-md text-sm font-semibold transition-colors ${refinePrompt.trim() ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
                            >
                                Submit Follow-Up
                            </button>
                        </div>

                        {refineResult ? (
                            <div className="space-y-3">
                                <div className="bg-slate-950/40 border border-slate-700 rounded-xl px-4 py-3">
                                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                                        <div>
                                            <div className="text-slate-100 font-semibold">AI Coaching Follow-Up Result</div>
                                            <div className="text-xs text-slate-400 mt-1">Context locked to {refineResult.takeTitle}</div>
                                        </div>
                                        <div className="text-xs text-purple-200/80 uppercase tracking-wide">Structured coaching cards</div>
                                    </div>
                                    <div className="text-sm text-slate-300 mt-3">
                                        <span className="text-slate-400">Latest coaching request:</span> {refineResult.prompt}
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {refineResult.sections.map((section) => (
                                        <div key={section.key} className="bg-slate-800/60 border border-slate-700 rounded-xl p-4">
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="text-slate-100 font-semibold">{section.title}</div>
                                                <div className="text-[10px] uppercase tracking-wide text-slate-400">take-local</div>
                                            </div>
                                            <ul className="mt-3 space-y-2 text-sm text-slate-300 list-disc pl-5">
                                                {section.bullets.slice(0, 3).map((bullet, idx) => (
                                                    <li key={idx}>{bullet}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="text-sm text-slate-400 bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-3">
                                Choose a quick coaching prompt or ask for a targeted rewrite to continue refining Take {current.takeNumber}.
                            </div>
                        )}
                    </div>
                ) : null}

                {current ? (
                    <>
                        <div id="live-rehearsal-review-anchor" className="h-px w-full" />
                        <RehearsalFeedbackCard transcript={current.transcript} markers={current.markers || []} startedAt={current.startedAt} endedAt={current.endedAt} />
                        <RehearsalMetricsCard transcript={current.transcript} startedAt={current.startedAt} endedAt={current.endedAt} />
                        <SessionTimelineCard
                            transcript={current.transcript}
                            markers={current.markers || []}
                            startedAt={current.startedAt}
                            endedAt={current.endedAt}
                        />
                        {(current.markers?.length ?? 0) > 0 ? (
                            <div className="bg-slate-900/40 border border-slate-700 rounded-xl p-4">
                                <div className="text-slate-100 font-semibold">Segment Markers</div>
                                <div className="text-sm text-slate-400 mt-1">This take includes performer-labeled routine sections.</div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {(current.markers || []).map((marker, idx) => (
                                        <div key={marker.id} className="px-3 py-1.5 rounded-full border border-amber-500/30 bg-amber-900/15 text-amber-100 text-sm font-medium">
                                            {`Marker ${idx + 1} – ${marker.label}`}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : null}

                        <div className="bg-slate-900/40 border border-slate-700 rounded-xl p-4">
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                <div>
                                    <div className="text-slate-100 font-semibold">Workflow Integration</div>
                                    <div className="text-sm text-slate-400 mt-1">Send this take into other Magic AI Wizard tools to continue rehearsal refinement.</div>
                                </div>
                                <div className="text-xs uppercase tracking-wide text-amber-200/80">Live Rehearsal → Ecosystem</div>
                            </div>
                            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                                <button
                                    onClick={handleAnalyzeAngles}
                                    className="px-4 py-3 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-slate-100 text-sm font-semibold transition-colors text-left"
                                >
                                    <div>Analyze Angles</div>
                                    <div className="text-xs text-slate-400 mt-1">Open Angle & Risk with transcript context.</div>
                                </button>
                                <button
                                    onClick={handleRefineScript}
                                    className="px-4 py-3 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-slate-100 text-sm font-semibold transition-colors text-left"
                                >
                                    <div>Refine Script</div>
                                    <div className="text-xs text-slate-400 mt-1">Open Patter Engine with your rehearsal transcript.</div>
                                </button>
                                <button
                                    onClick={handleEvaluateInShow}
                                    className="px-4 py-3 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-slate-100 text-sm font-semibold transition-colors text-left"
                                >
                                    <div>Evaluate in Show</div>
                                    <div className="text-xs text-slate-400 mt-1">Open Director Mode to test show fit and pacing.</div>
                                </button>
                                <button
                                    onClick={() => void handleSaveRoutine()}
                                    disabled={isSavingRoutine}
                                    className={`px-4 py-3 rounded-xl border text-sm font-semibold transition-colors text-left ${isSavingRoutine ? 'border-emerald-500/20 bg-emerald-900/10 text-emerald-200/70' : 'border-emerald-500/30 bg-emerald-900/20 hover:bg-emerald-900/30 text-emerald-100'}`}
                                >
                                    <div>{isSavingRoutine ? 'Saving Routine…' : 'Save Routine'}</div>
                                    <div className="text-xs text-emerald-200/70 mt-1">Save this take and critique to Idea Vault.</div>
                                </button>
                            </div>
                            {integrationMessage ? (
                                <div className="mt-3 text-sm text-emerald-300 bg-emerald-900/20 border border-emerald-700/40 rounded-md px-3 py-2">
                                    {integrationMessage}
                                </div>
                            ) : null}
                        </div>
                    </>
                ) : null}

                <div className="bg-slate-900/40 border border-slate-700 rounded-lg p-4">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <div className="text-slate-100 font-semibold">Takes</div>
                            <div className="text-xs text-slate-400">Record multiple takes in one session (Take 1, Take 2, Take 3…)</div>
                        </div>
                        <button
                            onClick={() => { trackLiveRehearsalEvent('live_rehearsal_next_take', { current_take_count: takes?.length ?? 0 }, { outcome: 'SUCCESS_NOT_CHARGED' }); onStartNewTake(); }}
                            className="px-3 py-2 bg-purple-600 hover:bg-purple-700 rounded-md text-white text-sm font-semibold transition-colors"
                        >
                            Start Next Take
                        </button>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                        {(takes ?? []).map((t, idx) => (
                            <button
                                key={t.takeNumber}
                                onClick={() => { trackLiveRehearsalEvent('live_rehearsal_take_selected', { selected_take: idx + 1 }, { outcome: 'SUCCESS_NOT_CHARGED' }); onSelectTake(idx); }}
                                className={`px-3 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
                                    idx === selectedTake
                                        ? 'bg-[#7c3aed] border-purple-400/80 text-white shadow-[0_0_8px_rgba(124,58,237,.4)]'
                                        : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700/60'
                                }`}
                            >
                                Take {idx + 1}
                            </button>
                        ))}
                        {!hasAnyTakes ? (
                            <div className="text-sm text-slate-400">No takes recorded yet.</div>
                        ) : null}
                    </div>
                </div>

                <div className="space-y-4 bg-slate-800/60 border border-slate-700 rounded-lg p-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="text-slate-200 font-semibold">
                            {current ? `Transcript — Take ${displayTakeNumber}` : 'Transcript'}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                            {current ? (
                                <button
                                    onClick={handleAnalyzeSelectedTake}
                                    className="px-3 py-1.5 rounded-md border border-purple-600/40 bg-purple-900/20 text-purple-100 text-sm font-semibold hover:bg-purple-900/30 transition-colors"
                                >
                                    {isDemoTake ? 'Analyze This Demo Take' : 'Analyze This Take'}
                                </button>
                            ) : null}
                            {hasAnyTakes ? (
                                <div className="px-3 py-1.5 rounded-md border border-slate-700 bg-slate-900/40 text-slate-300 text-sm font-semibold">
                                    In-page refinement active
                                </div>
                            ) : null}
                        </div>
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
                    onClick={() => onReturnToStudio()}
                    className="w-full md:w-auto flex items-center justify-center gap-2 px-5 py-2.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200 font-bold transition-colors"
                >
                    <BackIcon className="w-5 h-5" />
                    <span>Back to Studio</span>
                </button>

                <button
                    onClick={onResetSession}
                    className="w-full md:w-auto flex items-center justify-center gap-2 px-5 py-2.5 text-sm bg-transparent hover:bg-slate-800/60 rounded-md text-slate-300 font-bold transition-colors"
                >
                    <TrashIcon className="w-5 h-5" />
                    <span>Start New Session</span>
                </button>
            </footer>
        </div>
    );
};



const buildTakeTranscriptText = (take: { transcript?: Transcription[]; takeNumber?: number } | null | undefined): string => {
    const parts = (take?.transcript || [])
        .filter((t) => t?.source === 'user')
        .map((t) => (t?.text || '').trim())
        .filter(Boolean);
    return parts.join(' ').replace(/\s+/g, ' ').trim();
};

const buildAngleRiskPrefill = (take: { transcript?: Transcription[]; markers?: SegmentMarker[]; takeNumber?: number } | null | undefined, sessionTitle: string, sessionNotes: string) => {
    const transcriptText = buildTakeTranscriptText(take);
    const markerLabels = (take?.markers || []).map((m) => m.label).filter(Boolean);
    const steps = markerLabels.length
        ? markerLabels.map((label, index) => `${index + 1}. ${label}`).join('\n')
        : '1. Introduction / framing\n2. Spectator instruction\n3. Main magical moment\n4. Reveal / applause cue\n5. Cleanup / reset';
    const focusBits = [
        sessionNotes ? `Session notes: ${sessionNotes}` : '',
        markerLabels.length ? `Performer-marked segments: ${markerLabels.join(', ')}` : '',
        transcriptText ? `Transcript context: ${transcriptText}` : '',
    ].filter(Boolean);
    return {
        version: 1,
        source: 'live-rehearsal',
        routineName: sessionTitle || 'Live Rehearsal Routine',
        focusText: focusBits.join('\n\n'),
        routineSteps: steps,
        propsText: '',
        createdAt: Date.now(),
    };
};

const buildPatterPrefill = (take: { transcript?: Transcription[]; markers?: SegmentMarker[] } | null | undefined, sessionTitle: string, sessionNotes: string) => {
    const transcriptText = buildTakeTranscriptText(take);
    const markerLabels = (take?.markers || []).map((m) => m.label).filter(Boolean);
    const descriptionParts = [
        sessionTitle ? `Routine: ${sessionTitle}` : '',
        sessionNotes ? `Rehearsal focus: ${sessionNotes}` : '',
        markerLabels.length ? `Routine segments: ${markerLabels.join(', ')}` : '',
        transcriptText ? `Latest rehearsal transcript: ${transcriptText}` : '',
        'Task: refine the spoken script into stronger, more polished performance patter while preserving the core routine structure.'
    ].filter(Boolean);
    return {
        version: 1,
        source: 'live-rehearsal',
        effectDescription: descriptionParts.join('\n\n'),
        selectedTones: ['Storytelling', 'Mysterious'],
        createdAt: Date.now(),
    };
};

const buildDirectorPrefill = (take: { transcript?: Transcription[]; markers?: SegmentMarker[] } | null | undefined, sessionTitle: string, sessionNotes: string) => {
    const transcriptText = buildTakeTranscriptText(take);
    const markerLabels = (take?.markers || []).map((m) => m.label).filter(Boolean);
    const constraintBits = [
        sessionNotes ? `Session focus: ${sessionNotes}` : '',
        markerLabels.length ? `Routine structure: ${markerLabels.join(' -> ')}` : '',
        transcriptText ? `Live rehearsal transcript: ${transcriptText}` : '',
        'Evaluate how this routine fits into a larger show, including pacing, transitions, and audience management.'
    ].filter(Boolean);
    return {
        version: 1,
        source: 'live-rehearsal',
        showTitle: sessionTitle || 'Live Rehearsal Routine',
        theme: 'Refine this rehearsed routine into a stronger show segment with better arc, transitions, and audience clarity.',
        constraintNotes: constraintBits.join('\n\n'),
        tone: 'confident, theatrical, audience-focused',
        createdAt: Date.now(),
    };
};

const buildRoutineIdeaPayload = (take: { transcript?: Transcription[]; markers?: SegmentMarker[]; startedAt?: number; endedAt?: number; takeNumber?: number } | null | undefined, sessionTitle: string, sessionNotes: string) => {
    const transcriptText = buildTakeTranscriptText(take);
    const markers = (take?.markers || []).map((m, index) => `- Marker ${index + 1}: ${m.label}`).join('\n');
    const metrics = buildRehearsalMetrics(take?.transcript || [], take?.startedAt, take?.endedAt);
    const feedback = buildRehearsalFeedback(take?.transcript || [], take?.markers || [], take?.startedAt, take?.endedAt);
    const timeline = buildSessionTimeline(take?.transcript || [], take?.markers || [], take?.startedAt, take?.endedAt)
        .map((item) => `- ${item.timestampLabel} ${item.label}${item.commentary ? ` — ${item.commentary}` : ''}`)
        .join('\n');

    const lines = [
        sessionTitle || 'Live Rehearsal Routine',
        '',
        sessionNotes ? `Session Notes\n${sessionNotes}\n` : '',
        `Confidence Score: ${metrics.confidenceScore}%`,
        `Filler Words: ${metrics.fillerWords}`,
        `Average Speaking Speed: ${metrics.averageSpeakingSpeed} WPM`,
        `Total Pause Time: ${metrics.totalPauseTimeSeconds}s`,
        `Energy Level: ${metrics.energyLevel}`,
        '',
        markers ? `Segment Markers\n${markers}\n` : '',
        transcriptText ? `Transcript\n${transcriptText}\n` : '',
        timeline ? `Session Timeline\n${timeline}\n` : '',
        'AI Rehearsal Feedback',
        ...feedback.sections.map((section) => `${section.title}\n${section.bullets.map((bullet) => `- ${bullet}`).join('\n')}`),
    ].filter(Boolean);

    return {
        type: 'text' as const,
        title: sessionTitle || 'Live Rehearsal Routine',
        content: lines.join('\n'),
        tags: ['live-rehearsal', 'routine'],
    };
};



const RehearsalFeedbackCard: React.FC<{ transcript: Transcription[]; markers?: SegmentMarker[]; startedAt?: number; endedAt?: number }> = ({ transcript, markers = [], startedAt, endedAt }) => {
    const feedback = buildRehearsalFeedback(transcript, markers, startedAt, endedAt);

    return (
        <div className="bg-slate-900/40 border border-slate-700 rounded-xl p-4 md:p-5">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <div className="text-slate-100 font-semibold text-lg">AI Rehearsal Feedback</div>
                    <div className="text-sm text-slate-400 mt-1">Structured coaching based on your latest recorded take.</div>
                </div>
                <div className="inline-flex items-center gap-3 self-start md:self-auto px-4 py-2 rounded-xl border border-purple-600/40 bg-purple-900/20">
                    <div className="text-xs uppercase tracking-wide text-purple-200/80">Confidence Score</div>
                    <div className="text-3xl font-bold text-white">{feedback.confidenceScore}%</div>
                </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                {feedback.sections.map((section) => (
                    <div key={section.title} className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
                        <div className="text-slate-100 font-semibold mb-2">{section.title}</div>
                        <ul className="space-y-2 text-sm text-slate-300">
                            {section.bullets.map((bullet, idx) => (
                                <li key={idx} className="flex items-start gap-2">
                                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-purple-300 flex-shrink-0" />
                                    <span>{bullet}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
        </div>
    );
};


const RehearsalMetricsCard: React.FC<{ transcript: Transcription[]; startedAt?: number; endedAt?: number }> = ({ transcript, startedAt, endedAt }) => {
    const metrics = buildRehearsalMetrics(transcript, startedAt, endedAt);
    const metricItems = [
        { label: 'Confidence Score', value: `${metrics.confidenceScore}%`, tone: 'text-emerald-300' },
        { label: 'Filler Words', value: String(metrics.fillerWords), tone: 'text-slate-100' },
        { label: 'Speaking Speed', value: `${metrics.averageSpeakingSpeed} WPM`, tone: 'text-slate-100' },
        { label: 'Total Pause Time', value: `${metrics.totalPauseTimeSeconds}s`, tone: 'text-slate-100' },
        { label: 'Energy Level', value: metrics.energyLevel, tone: 'text-amber-200' },
    ];

    return (
        <div className="bg-slate-900/40 border border-slate-700 rounded-xl p-4">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <div className="text-slate-100 font-semibold">Rehearsal Metrics</div>
                    <div className="text-sm text-slate-400 mt-1">Measured performance signals from this take.</div>
                </div>
                <div className="px-3 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 text-sm font-semibold">
                    Confidence {metrics.confidenceScore}%
                </div>
            </div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
                {metricItems.map((item) => (
                    <div key={item.label} className="rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-3">
                        <div className="text-[11px] uppercase tracking-wide text-slate-500">{item.label}</div>
                        <div className={`mt-1 text-lg font-semibold ${item.tone}`}>{item.value}</div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const SessionTimelineCard: React.FC<{ transcript: Transcription[]; markers?: SegmentMarker[]; startedAt?: number; endedAt?: number }> = ({ transcript, markers = [], startedAt, endedAt }) => {
    const timeline = buildSessionTimeline(transcript, markers, startedAt, endedAt);

    return (
        <div className="bg-slate-900/40 border border-slate-700 rounded-xl p-4 md:p-5">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                    <div className="text-slate-100 font-semibold text-lg">Session Timeline</div>
                    <div className="text-sm text-slate-400 mt-1">See where the routine shifts and where the coaching notes matter most.</div>
                </div>
                <div className="text-xs uppercase tracking-wide text-purple-200/80 px-3 py-1.5 rounded-full border border-purple-600/30 bg-purple-900/15 self-start md:self-auto">
                    Timeline Analysis
                </div>
            </div>

            <div className="mt-4 grid grid-cols-1 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-4">
                <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
                    <div className="text-slate-100 font-semibold mb-3">Routine Beats</div>
                    <div className="space-y-3">
                        {timeline.map((item, idx) => (
                            <div key={`${item.seconds}-${idx}`} className="flex items-start gap-3">
                                <div className="w-14 shrink-0 rounded-md border border-purple-500/30 bg-purple-900/20 text-center text-sm font-bold text-white px-2 py-1">
                                    {item.timestampLabel}
                                </div>
                                <div className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900/35 px-3 py-2">
                                    <div className="text-slate-100 font-medium">{item.label}</div>
                                    <div className="text-xs text-slate-400 mt-1">Beat {idx + 1}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
                    <div className="text-slate-100 font-semibold mb-3">AI Commentary</div>
                    <div className="space-y-3">
                        {timeline.map((item, idx) => (
                            <div key={`${item.label}-commentary-${idx}`} className="rounded-lg border border-slate-700 bg-slate-900/35 px-4 py-3">
                                <div className="text-xs uppercase tracking-wide text-purple-200/80">{item.timestampLabel} · {item.label}</div>
                                <div className="text-sm text-slate-300 mt-1">{item.commentary || 'Solid beat. Keep this transition clean and unhurried.'}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LiveRehearsal;


// ===== AUDIO DEBUG PATCH ADDED =====
console.log('[AUDIO DEBUG FILE LOADED]');
