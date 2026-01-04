import React, { useState, useEffect, useMemo } from 'react';
import { getFeedback } from '../services/feedbackService';
import type { Feedback } from '../types';
import { StarIcon, UsersIcon } from './icons';

const FEEDBACK_TAGS = ["Card Tricks", "Comedy", "Mind Reading", "Storytelling", "Audience Interaction"];

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
    const [feedback, setFeedback] = useState<Feedback[]>([]);

    useEffect(() => {
        setFeedback(getFeedback());
    }, []);

    const averageRating = useMemo(() => {
        if (feedback.length === 0) return 0;
        // FIX: Explicitly type the parameters of the `reduce` callback to resolve an error with arithmetic operations on an incorrectly inferred type.
        const total = feedback.reduce((sum: number, item: Feedback) => sum + item.rating, 0);
        return (total / feedback.length).toFixed(1);
    }, [feedback]);

    const tagCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        FEEDBACK_TAGS.forEach(tag => counts[tag] = 0);
        feedback.forEach(item => {
            item.tags.forEach(tag => {
                if (counts[tag] !== undefined) {
                    counts[tag]++;
                }
            });
        });
        return counts;
    }, [feedback]);

    return (
        <div className="flex flex-col h-full animate-fade-in">
            <header className="p-4 md:px-6 md:pt-6">
                <div className="flex items-center gap-3 mb-4">
                    <StarIcon className="w-8 h-8 text-purple-400" />
                    <h2 className="text-2xl font-bold text-slate-200 font-cinzel">Audience Feedback</h2>
                </div>
                {feedback.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                            <h3 className="text-sm font-semibold text-slate-400">Average Rating</h3>
                            <p className="text-3xl font-bold text-white flex items-center gap-2">
                                <StarIcon className="w-7 h-7 text-amber-400"/>
                                {averageRating}
                            </p>
                        </div>
                         <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                            <h3 className="text-sm font-semibold text-slate-400">Total Responses</h3>
                            <p className="text-3xl font-bold text-white flex items-center gap-2">
                                <UsersIcon className="w-7 h-7 text-sky-400"/>
                                {feedback.length}
                            </p>
                        </div>
                        <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                             <h3 className="text-sm font-semibold text-slate-400 mb-2">Most Liked Aspects</h3>
                             <div className="flex flex-wrap gap-x-3 gap-y-1">
                                {/* FIX: Explicitly type the parameters of the `sort` callback to resolve an error with arithmetic operations on an incorrectly inferred type. */}
                                {Object.entries(tagCounts).sort(([, a]: [string, number], [, b]: [string, number]) => b - a).slice(0, 3).map(([tag, count]) => (
                                    <div key={tag} className="text-sm text-slate-300">
                                        <span className="font-semibold">{tag}:</span> {count}
                                    </div>
                                ))}
                             </div>
                        </div>
                    </div>
                )}
            </header>
            <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-4 pt-4">
                {feedback.length > 0 ? (
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
                                    {item.tags.length > 0 && (
                                        <div className="flex flex-wrap gap-2 justify-end max-w-xs">
                                            {item.tags.map(tag => (
                                                <span key={tag} className="px-2 py-0.5 text-xs font-semibold rounded-full bg-purple-500/20 text-purple-300">{tag}</span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                
                                {(item.showTitle || item.magicianName || item.location || item.performanceDate) && (
                                    <div className="mt-3 pt-3 border-t border-slate-700/50 text-sm grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                                        {item.showTitle && <p className="text-slate-400"><strong>Show:</strong> <span className="text-slate-300">{item.showTitle}</span></p>}
                                        {item.magicianName && <p className="text-slate-400"><strong>Magician:</strong> <span className="text-slate-300">{item.magicianName}</span></p>}
                                        {item.location && <p className="text-slate-400"><strong>Location:</strong> <span className="text-slate-300">{item.location}</span></p>}
                                        {item.performanceDate && <p className="text-slate-400"><strong>Date:</strong> <span className="text-slate-300">{new Date(item.performanceDate).toLocaleDateString()}</span></p>}
                                    </div>
                                )}

                                {item.comment && (
                                    <p className={`text-slate-200 mt-3 pt-3 ${ (item.showTitle || item.magicianName || item.location || item.performanceDate) ? '' : 'border-t border-slate-700/50'}`}>"{item.comment}"</p>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-12">
                        <StarIcon className="w-16 h-16 mx-auto text-slate-600 mb-4" />
                        <h3 className="text-lg font-bold text-slate-400">No Feedback Yet</h3>
                        <p className="text-slate-500">Audience feedback will appear here once it's submitted.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ShowFeedback;