
import React, { useState, useEffect, useMemo } from 'react';
import { getPerformanceById } from '../services/performanceService';
import { getShowById } from '../services/showsService';
import type { Performance, Show, ReactionType } from '../types';
import { AnalyticsIcon, BackIcon, AmazedIcon, LaughingIcon, ConfusedIcon } from './icons';

interface PerformanceAnalyticsProps {
    performanceId: string;
    onBack: () => void;
}

const REACTION_CONFIG: Record<ReactionType, { Icon: React.FC<any>, color: string, label: string }> = {
    amazed: { Icon: AmazedIcon, color: 'text-yellow-400', label: 'Amazed' },
    laughing: { Icon: LaughingIcon, color: 'text-green-400', label: 'Laughing' },
    confused: { Icon: ConfusedIcon, color: 'text-blue-400', label: 'Confused' },
};

const INTERVAL_SECONDS = 15;

const PerformanceAnalytics: React.FC<PerformanceAnalyticsProps> = ({ performanceId, onBack }) => {
    const [performance, setPerformance] = useState<Performance | null>(null);
    const [show, setShow] = useState<Show | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // FIX: getShowById is async, resolve with async function
        const fetchData = async () => {
            const perf = getPerformanceById(performanceId);
            if (perf) {
                setPerformance(perf);
                const associatedShow = await getShowById(perf.showId);
                if (associatedShow) {
                    setShow(associatedShow);
                }
            }
            setIsLoading(false);
        };
        fetchData();
    }, [performanceId]);

    const analyticsData = useMemo(() => {
        if (!performance || !performance.endTime) return null;

        const durationSeconds = Math.ceil((performance.endTime - performance.startTime) / 1000);
        const numIntervals = Math.max(1, Math.ceil(durationSeconds / INTERVAL_SECONDS));
        
        const intervals: Record<ReactionType, number[]> = {
            amazed: Array(numIntervals).fill(0),
            laughing: Array(numIntervals).fill(0),
            confused: Array(numIntervals).fill(0),
        };

        const totals: Record<ReactionType, number> = { amazed: 0, laughing: 0, confused: 0 };
        
        performance.reactions.forEach(reaction => {
            const timeOffset = reaction.timestamp - performance.startTime;
            const intervalIndex = Math.floor(timeOffset / (INTERVAL_SECONDS * 1000));
            if (intervalIndex < numIntervals) {
                intervals[reaction.type][intervalIndex]++;
                totals[reaction.type]++;
            }
        });
        
        const maxReactionsInInterval = Math.max(1, ...Object.values(intervals).flatMap(arr => arr));

        return { intervals, totals, maxReactionsInInterval, numIntervals };
    }, [performance]);

    if (isLoading) {
        return <div className="text-center p-8">Loading analytics...</div>;
    }
    
    if (!performance || !show) {
        return <div className="text-center p-8 text-red-400">Could not load performance data.</div>;
    }
    
    if (!performance.endTime) {
         return <div className="text-center p-8 text-amber-400">This performance has not ended yet.</div>;
    }

    return (
        <div className="flex-1 flex flex-col overflow-y-auto p-4 md:p-6 animate-fade-in">
            <header>
                <button onClick={onBack} className="flex items-center gap-2 mb-4 text-slate-300 hover:text-white">
                    <BackIcon className="w-5 h-5" />
                    <span>Back to Show Planner</span>
                </button>
                <div className="flex items-center gap-3 mb-2">
                    <AnalyticsIcon className="w-8 h-8 text-purple-400" />
                    <div>
                        <h2 className="text-2xl font-bold text-slate-200 font-cinzel">Performance Analytics</h2>
                        <p className="text-slate-400">For "{show.title}" on {new Date(performance.startTime).toLocaleString()}</p>
                    </div>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-6">
                {Object.entries(analyticsData?.totals || {}).map(([type, count]) => {
                    const config = REACTION_CONFIG[type as ReactionType];
                    return (
                        <div key={type} className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                            <h3 className={`text-sm font-semibold flex items-center gap-2 ${config.color}`}>
                                <config.Icon className="w-5 h-5"/>
                                Total {config.label} Reactions
                            </h3>
                            <p className="text-3xl font-bold text-white mt-1">{count}</p>
                        </div>
                    );
                })}
            </div>

            <div>
                <h3 className="font-bold text-lg text-white mb-3">Reaction Timeline</h3>
                <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 overflow-x-auto">
                    <div className="flex gap-1" style={{minWidth: `${(analyticsData?.numIntervals || 0) * 3}rem`}}>
                        {Array.from({ length: analyticsData?.numIntervals || 0 }).map((_, i) => {
                             const timeLabel = `${Math.floor(i * INTERVAL_SECONDS / 60)}:${(i * INTERVAL_SECONDS % 60).toString().padStart(2, '0')}`;
                             const amazedCount = analyticsData?.intervals.amazed[i] || 0;
                             const laughingCount = analyticsData?.intervals.laughing[i] || 0;
                             const confusedCount = analyticsData?.intervals.confused[i] || 0;
                             const totalInInterval = amazedCount + laughingCount + confusedCount;
                             
                             const amazedHeight = totalInInterval > 0 ? (amazedCount / analyticsData!.maxReactionsInInterval) * 100 : 0;
                             const laughingHeight = totalInInterval > 0 ? (laughingCount / analyticsData!.maxReactionsInInterval) * 100 : 0;
                             const confusedHeight = totalInInterval > 0 ? (confusedCount / analyticsData!.maxReactionsInInterval) * 100 : 0;

                             return (
                                <div key={i} className="flex-1 flex flex-col items-center group relative" title={`${totalInInterval} reactions`}>
                                    <div className="w-full h-48 flex flex-col-reverse justify-start">
                                         <div className="w-full bg-blue-500/80 group-hover:bg-blue-400 transition-colors" style={{ height: `${confusedHeight}%` }}></div>
                                         <div className="w-full bg-green-500/80 group-hover:bg-green-400 transition-colors" style={{ height: `${laughingHeight}%` }}></div>
                                         <div className="w-full bg-yellow-500/80 group-hover:bg-yellow-400 transition-colors" style={{ height: `${amazedHeight}%` }}></div>
                                    </div>
                                    <span className="text-xs text-slate-400 mt-1">{timeLabel}</span>
                                </div>
                             );
                        })}
                    </div>
                     <div className="flex justify-center items-center gap-4 mt-4 pt-4 border-t border-slate-700 text-sm">
                        <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-yellow-500 rounded-sm"></div><span className="text-slate-300">Amazed</span></div>
                        <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-green-500 rounded-sm"></div><span className="text-slate-300">Laughing</span></div>
                        <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-blue-500 rounded-sm"></div><span className="text-slate-300">Confused</span></div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PerformanceAnalytics;
