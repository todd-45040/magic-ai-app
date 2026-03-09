import React, { useMemo, useState, useEffect } from 'react';
import type { Feedback, Show } from '../types';
import { fetchShowFeedback, buildShowFeedbackUrl } from '../services/showFeedbackService';
import { StarIcon, UsersIcon, QrCodeIcon, CopyIcon } from './icons';
import { useAppState } from '../store';

const REACTIONS: { key: Feedback['reaction']; label: string; tip: string }[] = [
    { key: '🎉', label: 'Big Reaction', tip: 'Strong surprise or applause moment' },
    { key: '😲', label: 'Amazed', tip: 'Audience visibly impressed or surprised' },
    { key: '😂', label: 'Laughter', tip: 'Comedic beat landed well' },
    { key: '🤔', label: 'Confused', tip: 'Moment may need clarification or tightening' },
    { key: '👏', label: 'Applause', tip: 'Clear positive response or appreciation' },
    { key: '❤️', label: 'Loved It', tip: 'Emotional connection or favorite moment' },
];

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

const ShowFeedback: React.FC = () => {
    const { shows } = useAppState();
    const [showLegend, setShowLegend] = useState(false);
    const [selectedShowId, setSelectedShowId] = useState<string>('');
    const [feedback, setFeedback] = useState<Feedback[]>([]);
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string>('');
    const [copied, setCopied] = useState(false);

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
                            <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 mb-2" htmlFor="show-select">
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
                            <button
                                onClick={copyLink}
                                disabled={!feedbackUrl}
                                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md text-slate-100 font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50 min-w-[150px]"
                                title="Copy feedback QR link"
                            >
                                <CopyIcon className="w-4 h-4" />
                                {copied ? 'Link Copied' : 'Copy QR Link'}
                            </button>
                            <div className="flex items-start sm:items-center gap-2 rounded-lg border border-purple-500/20 bg-purple-500/10 px-3 py-2 text-xs text-purple-100 max-w-sm">
                                <QrCodeIcon className="w-4 h-4 mt-0.5 sm:mt-0 flex-shrink-0 text-purple-300" />
                                <span>
                                    Generate a show QR code in <span className="font-semibold text-white">Show Planner</span>, then share it after the performance so audience responses appear here.
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {errorMsg && (
                    <div className="p-3 rounded-md bg-red-900/25 border border-red-500/40 text-red-200 text-sm mb-5">
                        {errorMsg}
                        <div className="text-xs text-red-200/80 mt-1">
                            If this is your first time using QR feedback, you may need to create the Supabase table and RLS policies.
                        </div>
                    </div>
                )}

                <div className="mb-3">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 mb-3">Performance Summary</h3>
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
                    <div>
                        <div className="mb-4">
                            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 mb-3">Audience Responses</h3>
                            <p className="text-sm text-slate-400">Individual comments and ratings for this performance.</p>
                        </div>
                        <div className="space-y-4">
                            {feedback.map(item => (
                                <div key={item.id} className="bg-slate-800 border border-slate-700 p-4 rounded-xl">
                                    <div className="flex justify-between items-start gap-3">
                                        <div>
                                            <StarRatingDisplay rating={item.rating} />
                                            <p className="text-xs text-slate-500 mt-1.5">
                                                Submitted on {new Date(item.timestamp).toLocaleString()}
                                                {item.name && ` by ${item.name}`}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {item.reaction && (
                                                <span className="px-2 py-1 text-sm rounded-md bg-purple-500/15 border border-purple-500/30 text-purple-200">
                                                    {String(item.reaction)}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {item.comment && (
                                        <p className="text-slate-200 mt-3 pt-3 border-t border-slate-700/50">“{item.comment}”</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="rounded-2xl border border-slate-700/80 bg-slate-900/35 px-6 py-14 text-center max-w-3xl mx-auto">
                        <div className="w-20 h-20 rounded-full border border-slate-700 bg-slate-900/50 flex items-center justify-center mx-auto mb-5">
                            <StarIcon className="w-10 h-10 text-purple-400/80" />
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
