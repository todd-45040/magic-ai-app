import React, { useMemo, useState, useEffect } from 'react';
import type { Feedback, Show } from '../types';
import { fetchShowFeedback, buildShowFeedbackUrl } from '../services/showFeedbackService';
import { StarIcon, UsersIcon, QrCodeIcon, CopyIcon } from './icons';
import { useAppState } from '../store';

const REACTIONS: { key: Feedback['reaction']; label: string; tip: string; tone: 'positive' | 'warning' }[] = [
    { key: '🎉', label: 'Big Reaction', tip: 'Strong surprise or applause moment', tone: 'positive' },
    { key: '😲', label: 'Amazed', tip: 'Audience visibly impressed or surprised', tone: 'positive' },
    { key: '😂', label: 'Laughter', tip: 'Comedic beat landed well', tone: 'positive' },
    { key: '🤔', label: 'Confused', tip: 'Moment may need clarification or tightening', tone: 'warning' },
    { key: '👏', label: 'Applause', tip: 'Clear positive response or appreciation', tone: 'positive' },
    { key: '❤️', label: 'Loved It', tip: 'Emotional connection or favorite moment', tone: 'positive' },
];

const TIMELINE_SEGMENTS = [
    { key: 'opening', label: 'Opening' },
    { key: 'early', label: 'Early Middle' },
    { key: 'late', label: 'Late Middle' },
    { key: 'closing', label: 'Closing' },
] as const;

const StarRatingDisplay: React.FC<{ rating: number }> = ({ rating }) => (
    <div className="flex">
        {[1, 2, 3, 4, 5].map((star) => (
            <StarIcon
                key={star}
                className={`w-5 h-5 ${star <= rating ? 'text-amber-400' : 'text-slate-600'}`}
            />
        ))}
    </div>
);

const formatDate = (timestamp?: number) => {
    if (!timestamp) return 'Unknown date';
    try {
        return new Date(timestamp).toLocaleString();
    } catch {
        return 'Unknown date';
    }
};

const ShowFeedback: React.FC = () => {
    const { shows } = useAppState();
    const [showLegend, setShowLegend] = useState(false);
    const [selectedShowId, setSelectedShowId] = useState<string>('');
    const [feedback, setFeedback] = useState<Feedback[]>([]);
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string>('');
    const [copied, setCopied] = useState(false);
    const [showDemoGuide, setShowDemoGuide] = useState(false);

    const selectedShow: Show | undefined = useMemo(() => shows.find(s => s.id === selectedShowId), [shows, selectedShowId]);

    useEffect(() => {
        if (!selectedShowId && shows.length > 0) {
            setSelectedShowId(shows[0].id);
        }
    }, [shows, selectedShowId]);

    useEffect(() => {
        const run = async () => {
            if (!selectedShowId) return;
            setLoading(true);
            setErrorMsg('');
            try {
                const data = await fetchShowFeedback(selectedShowId);
                setFeedback(data);
            } catch (e: any) {
                console.error(e);
                setFeedback([]);
                setErrorMsg(e?.message ?? 'Unable to load feedback.');
            } finally {
                setLoading(false);
            }
        };
        void run();
    }, [selectedShowId]);

    useEffect(() => {
        if (!copied) return;
        const timer = window.setTimeout(() => setCopied(false), 1800);
        return () => window.clearTimeout(timer);
    }, [copied]);

    const averageRating = useMemo(() => {
        if (feedback.length === 0) return 0;
        const total = feedback.reduce((sum: number, item: Feedback) => sum + item.rating, 0);
        return (total / feedback.length).toFixed(1);
    }, [feedback]);

    const reactionCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        REACTIONS.forEach(r => { if (r.key) counts[String(r.key)] = 0; });
        feedback.forEach(item => {
            if (item.reaction) {
                const k = String(item.reaction);
                counts[k] = (counts[k] ?? 0) + 1;
            }
        });
        return counts;
    }, [feedback]);

    const feedbackUrl = useMemo(() => {
        if (!selectedShowId) return '';
        try {
            return buildShowFeedbackUrl(selectedShowId);
        } catch {
            return '';
        }
    }, [selectedShowId]);

    const strongestReaction = useMemo(() => {
        const ranked = REACTIONS
            .map(r => ({ ...r, count: reactionCounts[String(r.key)] ?? 0 }))
            .sort((a, b) => b.count - a.count);
        return ranked[0]?.count ? ranked[0] : null;
    }, [reactionCounts]);

    const feedbackPatterns = useMemo(() => {
        const totalPositiveSignals = feedback.reduce((sum, item) => {
            const isPositiveReaction = item.reaction && item.reaction !== '🤔';
            return sum + (item.rating >= 4 ? 1 : 0) + (isPositiveReaction ? 1 : 0);
        }, 0);

        const confusedCount = reactionCounts['🤔'] ?? 0;
        const commentCount = feedback.filter(item => Boolean(item.comment?.trim())).length;
        const tagFrequency: Record<string, number> = {};
        feedback.forEach(item => {
            const maybeTags = ((item as any).tags ?? []) as string[];
            maybeTags.forEach(tag => {
                tagFrequency[tag] = (tagFrequency[tag] ?? 0) + 1;
            });
        });
        const mostCommonTagEntry = Object.entries(tagFrequency).sort((a, b) => b[1] - a[1])[0];

        let dominantPattern = 'Mixed audience response';
        if (feedback.length === 0) {
            dominantPattern = 'No response data yet';
        } else if (confusedCount >= Math.max(2, Math.ceil(feedback.length * 0.25))) {
            dominantPattern = 'Some moments may need clarification';
        } else if (Number(averageRating) >= 4.5) {
            dominantPattern = 'Consistently strong audience response';
        } else if (Number(averageRating) >= 4) {
            dominantPattern = 'Generally positive engagement';
        } else if (Number(averageRating) < 3) {
            dominantPattern = 'Performance may need refinement';
        }

        return {
            totalPositiveSignals,
            confusedCount,
            commentCount,
            mostCommonTag: mostCommonTagEntry?.[0] ?? null,
            dominantPattern,
            lowResponse: feedback.length < 3,
        };
    }, [averageRating, feedback, reactionCounts]);

    const timelineData = useMemo(() => {
        if (feedback.length === 0) {
            return TIMELINE_SEGMENTS.map(segment => ({ ...segment, count: 0, share: 0, summary: 'No responses yet' }));
        }

        const sorted = [...feedback].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
        const size = Math.max(1, Math.ceil(sorted.length / TIMELINE_SEGMENTS.length));

        return TIMELINE_SEGMENTS.map((segment, index) => {
            const group = sorted.slice(index * size, (index + 1) * size);
            const count = group.length;
            const share = count === 0 ? 0 : Math.min(100, Math.round((group.reduce((sum, item) => {
                const reactionBoost = item.reaction && item.reaction !== '🤔' ? 1 : 0;
                return sum + item.rating + reactionBoost;
            }, 0) / (count * 6)) * 100));

            const localReactionCounts: Record<string, number> = {};
            group.forEach(item => {
                if (item.reaction) {
                    localReactionCounts[String(item.reaction)] = (localReactionCounts[String(item.reaction)] ?? 0) + 1;
                }
            });
            const topLocalReaction = REACTIONS
                .map(r => ({ ...r, count: localReactionCounts[String(r.key)] ?? 0 }))
                .sort((a, b) => b.count - a.count)[0];

            const summary = count === 0
                ? 'No audience responses captured'
                : topLocalReaction?.count
                    ? `${topLocalReaction.label} was the strongest signal`
                    : 'Ratings were submitted without reaction markers';

            return {
                ...segment,
                count,
                share,
                summary,
            };
        });
    }, [feedback]);

    const copyLink = async () => {
        if (!feedbackUrl) return;
        try {
            await navigator.clipboard.writeText(feedbackUrl);
            setCopied(true);
        } catch {}
    };

    return (
        <div className="flex flex-col h-full animate-fade-in">
            <header className="px-4 pt-4 md:px-6 md:pt-6 pb-5 border-b border-slate-800/80 bg-gradient-to-b from-slate-950/20 to-transparent">
                <div className="flex items-center gap-3 mb-2">
                    <StarIcon className="w-8 h-8 text-purple-400" />
                    <h2 className="text-2xl font-bold text-slate-100 font-cinzel tracking-wide">Audience Feedback</h2>
                </div>
                <p className="text-sm md:text-base text-slate-400 mb-5 max-w-3xl">
                    Review audience response for this performance, monitor feedback activity, and prepare the next show with clearer insight.
                </p>

                <div className="rounded-xl border border-slate-700/80 bg-slate-900/35 p-4 md:p-5 mb-5">
                    <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
                        <div className="flex-1 min-w-0">
                            <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 mb-2" htmlFor="show-select">
                                Performance Selection
                            </label>
                            <div className="flex items-center gap-3 flex-wrap">
                                <select
                                    id="show-select"
                                    value={selectedShowId}
                                    onChange={(e) => setSelectedShowId(e.target.value)}
                                    className="bg-slate-800 border border-slate-700 rounded-md px-3 py-2.5 text-white min-w-[260px] max-w-full"
                                >
                                    {shows.map(s => (
                                        <option key={s.id} value={s.id}>{s.title}</option>
                                    ))}
                                </select>
                                {selectedShow && (
                                    <span className="text-sm text-slate-400">
                                        Viewing feedback for <span className="text-slate-200 font-medium">{selectedShow.title}</span>
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="flex flex-col sm:items-end gap-2">
                            <div className="flex flex-wrap gap-2 sm:justify-end">
                                <button
                                    onClick={copyLink}
                                    disabled={!feedbackUrl}
                                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md text-slate-100 font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50 min-w-[150px]"
                                    title="Copy feedback QR link"
                                >
                                    <CopyIcon className="w-4 h-4" />
                                    {copied ? 'Link Copied' : 'Copy QR Link'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowDemoGuide(v => !v)}
                                    className="px-4 py-2.5 bg-purple-500/10 hover:bg-purple-500/15 border border-purple-500/25 rounded-md text-purple-100 font-semibold text-sm flex items-center justify-center gap-2 min-w-[150px]"
                                    title="Show a quick demo of the QR workflow"
                                >
                                    <QrCodeIcon className="w-4 h-4 text-purple-300" />
                                    {showDemoGuide ? 'Hide Demo' : 'QR Demo'}
                                </button>
                            </div>
                            <div className="flex items-start sm:items-center gap-2 rounded-lg border border-purple-500/20 bg-purple-500/10 px-3 py-2 text-xs text-purple-100 max-w-sm">
                                <QrCodeIcon className="w-4 h-4 mt-0.5 sm:mt-0 flex-shrink-0 text-purple-300" />
                                <span>
                                    Generate a show QR code in <span className="font-semibold text-white">Show Planner</span>, then share it after the performance so audience responses appear here.
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {showDemoGuide && (
                    <div className="mb-5 rounded-xl border border-purple-500/25 bg-gradient-to-r from-purple-500/10 to-slate-900/35 p-4 md:p-5 animate-fade-in">
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                            <div>
                                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-200 mb-2">QR Feedback Demo</h3>
                                <p className="text-sm text-slate-300 max-w-3xl">
                                    Use this quick walkthrough to show users how feedback gets from the audience into this dashboard.
                                </p>
                            </div>
                            <span className="px-3 py-1 rounded-full text-xs font-semibold border border-purple-500/25 bg-purple-500/10 text-purple-100">
                                3-step demo
                            </span>
                        </div>
                        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="rounded-xl border border-slate-700/70 bg-slate-900/45 p-4">
                                <div className="text-xs uppercase tracking-[0.14em] text-purple-200/80 mb-2">Step 1</div>
                                <div className="mb-4 flex items-center justify-center">
                                    <div className="rounded-2xl border border-purple-500/25 bg-slate-950/70 p-3 shadow-[0_0_24px_rgba(168,85,247,0.12)]">
                                        <div className="grid grid-cols-5 gap-1">
                                            {[
                                                1,1,1,0,1,
                                                1,0,1,0,0,
                                                1,1,1,0,1,
                                                0,0,0,1,1,
                                                1,0,1,1,1,
                                            ].map((cell, idx) => (
                                                <div
                                                    key={`qr-demo-${idx}`}
                                                    className={`h-2.5 w-2.5 rounded-[2px] ${cell ? 'bg-white' : 'bg-slate-800 border border-slate-700/70'}`}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <div className="text-base font-semibold text-white">Generate the QR code</div>
                                <p className="text-sm text-slate-400 mt-2">
                                    Open <span className="font-semibold text-slate-200">Show Planner</span> and create the audience feedback QR code for this performance.
                                </p>
                            </div>
                            <div className="rounded-xl border border-slate-700/70 bg-slate-900/45 p-4">
                                <div className="text-xs uppercase tracking-[0.14em] text-purple-200/80 mb-2">Step 2</div>
                                <div className="mb-4 flex items-center justify-center gap-3">
                                    <div className="rounded-2xl border border-slate-700/80 bg-slate-950/80 px-3 py-2 shadow-[0_0_24px_rgba(56,189,248,0.10)]">
                                        <div className="h-12 w-7 rounded-lg border border-slate-600 bg-slate-900 relative overflow-hidden">
                                            <div className="absolute inset-x-1 top-1 h-6 rounded bg-gradient-to-b from-purple-500/30 to-sky-400/20 border border-purple-400/20"></div>
                                            <div className="absolute bottom-1 left-1/2 -translate-x-1/2 h-1.5 w-1.5 rounded-full bg-slate-500"></div>
                                        </div>
                                    </div>
                                    <div className="text-purple-300 text-lg">→</div>
                                    <div className="flex gap-1.5">
                                        <div className="h-8 w-8 rounded-full border border-slate-700 bg-slate-950/70 flex items-center justify-center text-sm">🙂</div>
                                        <div className="h-8 w-8 rounded-full border border-slate-700 bg-slate-950/70 flex items-center justify-center text-sm">👏</div>
                                        <div className="h-8 w-8 rounded-full border border-slate-700 bg-slate-950/70 flex items-center justify-center text-sm">⭐</div>
                                    </div>
                                </div>
                                <div className="text-base font-semibold text-white">Share it after the show</div>
                                <p className="text-sm text-slate-400 mt-2">
                                    Display the QR on a screen or send the copied link so audience members can rate the performance on their phones.
                                </p>
                            </div>
                            <div className="rounded-xl border border-slate-700/70 bg-slate-900/45 p-4">
                                <div className="text-xs uppercase tracking-[0.14em] text-purple-200/80 mb-2">Step 3</div>
                                <div className="mb-4 rounded-2xl border border-slate-700/80 bg-slate-950/70 p-3 shadow-[0_0_24px_rgba(168,85,247,0.10)]">
                                    <div className="flex items-end gap-1 h-12">
                                        <div className="w-4 rounded-t bg-sky-400/70 h-5"></div>
                                        <div className="w-4 rounded-t bg-purple-400/70 h-8"></div>
                                        <div className="w-4 rounded-t bg-emerald-400/70 h-10"></div>
                                        <div className="w-4 rounded-t bg-amber-400/70 h-6"></div>
                                    </div>
                                    <div className="mt-3 grid grid-cols-3 gap-2">
                                        <div className="h-2 rounded bg-slate-700/80"></div>
                                        <div className="h-2 rounded bg-slate-700/80"></div>
                                        <div className="h-2 rounded bg-slate-700/80"></div>
                                    </div>
                                </div>
                                <div className="text-base font-semibold text-white">Review the results here</div>
                                <p className="text-sm text-slate-400 mt-2">
                                    Ratings, reactions, comments, and future insight panels appear on this page once responses are submitted.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {errorMsg && (
                    <div className="p-3 rounded-md bg-red-900/25 border border-red-500/40 text-red-200 text-sm mb-5">
                        {errorMsg}
                        <div className="text-xs text-red-200/80 mt-1">
                            If this is your first time using QR feedback, you may need to create the Supabase table and RLS policies.
                        </div>
                    </div>
                )}

                <div className="mb-3">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 mb-3">Performance Summary</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-slate-800/50 p-5 rounded-xl border border-slate-700/80 min-h-[132px]">
                            <h4 className="text-sm font-semibold text-slate-400 mb-4">Average Rating</h4>
                            <p className="text-3xl font-bold text-white flex items-center gap-3">
                                <StarIcon className="w-7 h-7 text-amber-400" />
                                {feedback.length ? averageRating : '—'}
                            </p>
                        </div>
                        <div className="bg-slate-800/50 p-5 rounded-xl border border-slate-700/80 min-h-[132px]">
                            <h4 className="text-sm font-semibold text-slate-400 mb-4">Total Responses</h4>
                            <p className="text-3xl font-bold text-white flex items-center gap-3">
                                <UsersIcon className="w-7 h-7 text-sky-400" />
                                {loading ? '…' : feedback.length}
                            </p>
                        </div>
                        <div className="bg-slate-800/50 p-5 rounded-xl border border-slate-700/80 min-h-[132px]">
                            <div className="flex items-center justify-between mb-3 gap-3">
                                <h4 className="text-sm font-semibold text-slate-400">Reaction Breakdown</h4>
                                <button
                                    type="button"
                                    onClick={() => setShowLegend(v => !v)}
                                    className="text-xs text-slate-400 hover:text-slate-200 underline decoration-slate-600 hover:decoration-slate-300 transition"
                                >
                                    What do these mean?
                                </button>
                            </div>
                            {showLegend && (
                                <div className="mb-3 rounded-lg border border-slate-700 bg-slate-900/30 p-3 text-xs text-slate-200">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {REACTIONS.map(r => (
                                            <div key={`legend-${String(r.key)}`} className="flex items-start gap-2">
                                                <span className="text-base leading-none mt-[1px]" aria-hidden="true">{String(r.key)}</span>
                                                <div className="leading-snug">
                                                    <div className="font-semibold text-slate-100">{r.label}</div>
                                                    <div className="text-slate-300">{r.tip}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <div className="flex flex-wrap gap-2">
                                {REACTIONS.map(r => (
                                    <span key={String(r.key)} className="px-2.5 py-1.5 text-sm rounded-md bg-slate-900/40 border border-slate-700 text-slate-200 flex items-center gap-2" title={`${r.label}: ${r.tip}`} aria-label={`${r.label}. ${r.tip}`}>
                                        <span className="text-base" aria-hidden="true">{String(r.key)}</span>
                                        <span className="text-xs text-slate-300">{reactionCounts[String(r.key)] ?? 0}</span>
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </header>
            <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-6 pt-5">
                {loading ? (
                    <div className="text-center py-14 text-slate-400">Loading feedback…</div>
                ) : feedback.length > 0 ? (
                    <div className="space-y-6">
                        <section className="rounded-2xl border border-slate-700/80 bg-slate-900/35 p-5 md:p-6">
                            <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
                                <div>
                                    <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 mb-2">Reaction Timeline</h3>
                                    <p className="text-sm text-slate-400 max-w-2xl">
                                        A performance-pattern view based on submitted ratings and reactions. Until true routine timestamps are available,
                                        this panel estimates where the strongest audience energy appeared across the show.
                                    </p>
                                </div>
                                {strongestReaction && (
                                    <div className="rounded-xl border border-purple-500/25 bg-purple-500/10 px-4 py-3 min-w-[200px]">
                                        <div className="text-xs uppercase tracking-[0.16em] text-purple-200/80 mb-1">Top Reaction</div>
                                        <div className="text-lg font-semibold text-white flex items-center gap-2">
                                            <span className="text-xl" aria-hidden="true">{String(strongestReaction.key)}</span>
                                            {strongestReaction.label}
                                        </div>
                                        <div className="text-xs text-slate-300 mt-1">{strongestReaction.count} audience signals</div>
                                    </div>
                                )}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                                {timelineData.map(segment => (
                                    <div key={segment.key} className="rounded-xl border border-slate-700/70 bg-slate-800/45 p-4">
                                        <div className="flex items-center justify-between gap-3 mb-3">
                                            <h4 className="text-sm font-semibold text-slate-200">{segment.label}</h4>
                                            <span className="text-xs text-slate-400">{segment.count} responses</span>
                                        </div>
                                        <div className="h-2 rounded-full bg-slate-950/60 overflow-hidden mb-3">
                                            <div className="h-full rounded-full bg-gradient-to-r from-sky-500 via-purple-500 to-fuchsia-500" style={{ width: `${segment.share}%` }} />
                                        </div>
                                        <div className="text-xs uppercase tracking-[0.14em] text-slate-500 mb-1">Engagement Signal</div>
                                        <div className="text-lg font-semibold text-white mb-2">{segment.share}%</div>
                                        <p className="text-sm text-slate-400 leading-relaxed">{segment.summary}</p>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section className="rounded-2xl border border-slate-700/80 bg-slate-900/35 p-5 md:p-6">
                            <div className="mb-5">
                                <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 mb-2">Key Insights</h3>
                                <p className="text-sm text-slate-400">
                                    Quick performance intelligence inferred from ratings, reactions, and audience comments.
                                </p>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                                <div className="rounded-xl border border-slate-700/70 bg-slate-800/45 p-4">
                                    <div className="text-xs uppercase tracking-[0.14em] text-slate-500 mb-2">Strongest Audience Signal</div>
                                    <div className="text-lg font-semibold text-white">
                                        {strongestReaction ? `${String(strongestReaction.key)} ${strongestReaction.label}` : 'No reaction data yet'}
                                    </div>
                                    <div className="text-sm text-slate-400 mt-2">
                                        {strongestReaction ? `${strongestReaction.count} audience members selected this reaction.` : 'Ask viewers to tap a reaction after the show.'}
                                    </div>
                                </div>
                                <div className="rounded-xl border border-slate-700/70 bg-slate-800/45 p-4">
                                    <div className="text-xs uppercase tracking-[0.14em] text-slate-500 mb-2">Most Common Pattern</div>
                                    <div className="text-lg font-semibold text-white">{feedbackPatterns.dominantPattern}</div>
                                    <div className="text-sm text-slate-400 mt-2">
                                        {feedbackPatterns.mostCommonTag
                                            ? `Most-mentioned theme: ${feedbackPatterns.mostCommonTag}.`
                                            : 'Add optional audience tags to identify recurring strengths.'}
                                    </div>
                                </div>
                                <div className="rounded-xl border border-slate-700/70 bg-slate-800/45 p-4">
                                    <div className="text-xs uppercase tracking-[0.14em] text-slate-500 mb-2">Positive Engagement</div>
                                    <div className="text-2xl font-bold text-white">{feedbackPatterns.totalPositiveSignals}</div>
                                    <div className="text-sm text-slate-400 mt-2">
                                        Combined count of high ratings and positive reactions across this performance.
                                    </div>
                                </div>
                                <div className="rounded-xl border border-slate-700/70 bg-slate-800/45 p-4">
                                    <div className="text-xs uppercase tracking-[0.14em] text-slate-500 mb-2">Response Condition</div>
                                    <div className="text-lg font-semibold text-white">
                                        {feedbackPatterns.lowResponse ? 'Low-response sample' : 'Healthy response volume'}
                                    </div>
                                    <div className="text-sm text-slate-400 mt-2">
                                        {feedbackPatterns.lowResponse
                                            ? 'Collect more scans after the next show to improve confidence in the pattern.'
                                            : `${feedbackPatterns.commentCount} written comments and ${feedbackPatterns.confusedCount} confusion markers captured.`}
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section>
                            <div className="mb-4">
                                <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 mb-2">Audience Comments</h3>
                                <p className="text-sm text-slate-400">Raw response details are listed below to support the higher-level summary and insight panels above.</p>
                            </div>
                            <div className="space-y-4">
                                {feedback.map(item => {
                                    const metaTags = ((item as any).tags ?? []) as string[];
                                    const showAssociation = ((item as any).showTitle ?? selectedShow?.title ?? '') as string;
                                    return (
                                        <div key={item.id} className="bg-slate-800/75 border border-slate-700/80 p-4 md:p-5 rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.01)]">
                                            <div className="flex justify-between items-start gap-4 flex-wrap">
                                                <div className="space-y-2 min-w-0">
                                                    <StarRatingDisplay rating={item.rating} />
                                                    <div className="flex flex-wrap gap-2 text-xs text-slate-300">
                                                        <span className="px-2.5 py-1 rounded-md border border-slate-700 bg-slate-900/50">
                                                            {formatDate(item.timestamp)}
                                                        </span>
                                                        {item.name && (
                                                            <span className="px-2.5 py-1 rounded-md border border-slate-700 bg-slate-900/50">
                                                                {item.name}
                                                            </span>
                                                        )}
                                                        {showAssociation && (
                                                            <span className="px-2.5 py-1 rounded-md border border-slate-700 bg-slate-900/50">
                                                                {showAssociation}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 flex-wrap justify-end">
                                                    {item.reaction && (
                                                        <span className={`px-2.5 py-1.5 text-sm rounded-md border ${item.reaction === '🤔' ? 'bg-amber-500/10 border-amber-500/30 text-amber-200' : 'bg-purple-500/15 border-purple-500/30 text-purple-200'}`}>
                                                            {String(item.reaction)}
                                                        </span>
                                                    )}
                                                    <span className="px-2.5 py-1.5 text-xs rounded-md border border-slate-700 bg-slate-900/50 text-slate-300">
                                                        {item.rating}/5 rating
                                                    </span>
                                                </div>
                                            </div>

                                            {metaTags.length > 0 && (
                                                <div className="mt-3 flex flex-wrap gap-2">
                                                    {metaTags.map(tag => (
                                                        <span key={`${item.id}-${tag}`} className="px-2.5 py-1 text-xs rounded-full bg-sky-500/10 border border-sky-500/25 text-sky-200">
                                                            {tag}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}

                                            {item.comment ? (
                                                <p className="text-slate-200 mt-4 pt-4 border-t border-slate-700/50 leading-relaxed">“{item.comment}”</p>
                                            ) : (
                                                <p className="text-slate-500 mt-4 pt-4 border-t border-slate-700/50 text-sm italic">No written comment provided.</p>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    </div>
                ) : (
                    <div className="mt-10 rounded-2xl border border-slate-700/80 bg-slate-900/35 px-6 py-14 text-center max-w-3xl mx-auto">
                        <div className="w-24 h-24 rounded-full border border-slate-700 bg-slate-900/50 flex items-center justify-center mx-auto mb-5 shadow-[0_0_24px_rgba(168,85,247,0.14)]">
                            <StarIcon className="w-12 h-12 text-purple-400 drop-shadow-[0_0_10px_rgba(168,85,247,0.35)]" />
                        </div>
                        <h3 className="text-2xl font-bold text-slate-200 mb-3">No Audience Feedback Yet</h3>
                        <p className="text-slate-400 max-w-xl mx-auto mb-6">
                            Audience responses will appear here after a show. To start collecting feedback, create a QR code in Show Planner and share it with your audience when the performance ends.
                        </p>
                        <div className="inline-flex items-start gap-3 rounded-xl border border-purple-500/25 bg-purple-500/10 px-4 py-3 text-left max-w-xl mx-auto">
                            <QrCodeIcon className="w-5 h-5 text-purple-300 mt-0.5 flex-shrink-0" />
                            <div>
                                <div className="text-sm font-semibold text-slate-100">Next step: generate your feedback QR code</div>
                                <div className="text-sm text-slate-300 mt-1">
                                    Open <span className="font-semibold text-white">Show Planner</span>, generate the audience QR code for this show, then display or share it after the performance.
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ShowFeedback;
