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

    const selectedShow: Show | undefined = useMemo(() => shows.find(s => s.id === selectedShowId) , [shows, selectedShowId]);

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

    const averageRating = useMemo(() => {
        if (feedback.length === 0) return 0;
        // FIX: Explicitly type the parameters of the `reduce` callback to resolve an error with arithmetic operations on an incorrectly inferred type.
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
        } catch {}
    };

    return (
        <div className="flex flex-col h-full animate-fade-in">
            <header className="p-4 md:px-6 md:pt-6">
                <div className="flex items-center gap-3 mb-4">
                    <StarIcon className="w-8 h-8 text-purple-400" />
                    <h2 className="text-2xl font-bold text-slate-200 font-cinzel">Audience Feedback</h2>
                </div>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                    <div className="flex items-center gap-2">
                        <label className="text-sm font-semibold text-slate-400" htmlFor="show-select">Show</label>
                        <select
                            id="show-select"
                            value={selectedShowId}
                            onChange={(e) => setSelectedShowId(e.target.value)}
                            className="bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white min-w-[220px]"
                        >
                            {shows.map(s => (
                                <option key={s.id} value={s.id}>{s.title}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={copyLink}
                            disabled={!feedbackUrl}
                            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md text-slate-200 font-semibold text-sm flex items-center gap-2 disabled:opacity-50"
                            title="Copy feedback QR link"
                        >
                            <CopyIcon className="w-4 h-4" />
                            Copy QR Link
                        </button>
                        <div className="hidden md:flex items-center gap-2 text-xs text-slate-400">
                            <QrCodeIcon className="w-4 h-4" />
                            Generate QR in Show Planner
                        </div>
                    </div>
                </div>

                {errorMsg && (
                    <div className="p-3 rounded-md bg-red-900/25 border border-red-500/40 text-red-200 text-sm mb-4">
                        {errorMsg}
                        <div className="text-xs text-red-200/80 mt-1">
                            If this is your first time using QR feedback, you may need to create the Supabase table and RLS policies.
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                        <h3 className="text-sm font-semibold text-slate-400">Average Rating</h3>
                        <p className="text-3xl font-bold text-white flex items-center gap-2">
                            <StarIcon className="w-7 h-7 text-amber-400"/>
                            {feedback.length ? averageRating : '—'}
                        </p>
                    </div>
                    <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                        <h3 className="text-sm font-semibold text-slate-400">Total Responses</h3>
                        <p className="text-3xl font-bold text-white flex items-center gap-2">
                            <UsersIcon className="w-7 h-7 text-sky-400"/>
                            {loading ? '…' : feedback.length}
                        </p>
                    </div>
                    <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-semibold text-slate-400">Reaction Breakdown</h3>
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
                        )
                        <div className="flex flex-wrap gap-2">
                            {REACTIONS.map(r => (
                                <span key={String(r.key)} className=\"px-2 py-1 text-sm rounded-md bg-slate-900/40 border border-slate-700 text-slate-200 flex items-center gap-2\" title={`${r.label}: ${r.tip}`} aria-label={`${r.label}. ${r.tip}`}>
                                    <span className="text-base" aria-hidden="true">{String(r.key)}</span>
                                    <span className="text-xs text-slate-300">{reactionCounts[String(r.key)] ?? 0}</span>
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            </header>
            <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-4 pt-4">
                {loading ? (
                    <div className="text-center py-12 text-slate-400">Loading feedback…</div>
                ) : feedback.length > 0 ? (
                    <div className="space-y-4">
                        {feedback.map(item => (
                            <div key={item.id} className="bg-slate-800 border border-slate-700 p-4 rounded-lg">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <StarRatingDisplay rating={item.rating} />
                                        <p className="text-xs text-slate-500 mt-1">
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
                                    <p className="text-slate-200 mt-3 pt-3 border-t border-slate-700/50">"{item.comment}"</p>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-12">
                        <StarIcon className="w-16 h-16 mx-auto text-slate-600 mb-4" />
                        <h3 className="text-lg font-bold text-slate-400">No Feedback Yet</h3>
                        <p className="text-slate-500">Generate a QR code in Show Planner and share it after your show.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ShowFeedback;