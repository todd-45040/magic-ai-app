
import React, { useState, useEffect } from 'react';
import { getPerformanceById, addReaction } from '../services/performanceService';
import { getShowById } from '../services/showsService';
import type { Show, ReactionType } from '../types';
import { AmazedIcon, LaughingIcon, ConfusedIcon, CheckIcon } from './icons';

interface LiveFeedbackViewProps {
    performanceId: string;
}

const LiveFeedbackView: React.FC<LiveFeedbackViewProps> = ({ performanceId }) => {
    const [show, setShow] = useState<Show | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastReaction, setLastReaction] = useState<ReactionType | null>(null);
    const [isThrottled, setIsThrottled] = useState(false);

    useEffect(() => {
        // FIX: getShowById is async, resolve with async function
        const fetchShow = async () => {
            const performance = getPerformanceById(performanceId);
            if (performance) {
                const foundShow = await getShowById(performance.showId);
                if (foundShow) {
                    setShow(foundShow);
                } else {
                    setError("Could not find the show associated with this performance.");
                }
            } else {
                setError("Invalid performance link.");
            }
            setIsLoading(false);
        };
        fetchShow();
    }, [performanceId]);

    const handleReaction = (reaction: ReactionType) => {
        if (isThrottled) return;
        
        addReaction(performanceId, reaction);
        setLastReaction(reaction);
        setIsThrottled(true);

        setTimeout(() => {
            setLastReaction(null);
        }, 1500); // Animation duration

        setTimeout(() => {
            setIsThrottled(false);
        }, 3000); // Cooldown duration
    };

    if (isLoading) {
        return <div className="text-white">Loading...</div>;
    }

    if (error) {
        return <div className="text-red-400 p-4 bg-red-900/30 rounded-lg">{error}</div>;
    }

    if (!show) {
        return <div className="text-white">Show not found.</div>;
    }
    
    const ReactionButton: React.FC<{ type: ReactionType, icon: React.FC<any>, label: string, color: string }> = ({ type, icon: Icon, label, color }) => (
        <button
            onClick={() => handleReaction(type)}
            disabled={isThrottled}
            className={`relative w-24 h-24 sm:w-32 sm:h-32 rounded-full flex flex-col items-center justify-center transition-all duration-300 transform focus:outline-none ${
                isThrottled ? 'bg-slate-700 cursor-not-allowed' : `${color} hover:scale-110`
            }`}
        >
            {lastReaction === type ? (
                 <CheckIcon className="w-12 h-12 text-white animate-fade-in" />
            ) : (
                <>
                    <Icon className="w-10 h-10 sm:w-12 sm:h-12 text-white" />
                    <span className="text-white font-semibold text-sm sm:text-base mt-1">{label}</span>
                </>
            )}
        </button>
    );

    return (
        <div className="w-full max-w-2xl text-center p-4">
            <h1 className="font-cinzel text-3xl md:text-4xl font-bold text-amber-300 mb-2">
                {show.title}
            </h1>
            <p className="text-slate-300 mb-8 text-lg">React to the show in real-time!</p>
            
            <div className="flex justify-around items-center gap-4">
                <ReactionButton type="amazed" icon={AmazedIcon} label="Amazed!" color="bg-yellow-500 hover:bg-yellow-600" />
                <ReactionButton type="laughing" icon={LaughingIcon} label="Laughing!" color="bg-green-500 hover:bg-green-600" />
                <ReactionButton type="confused" icon={ConfusedIcon} label="Confused!" color="bg-blue-500 hover:bg-blue-600" />
            </div>

            <p className="text-slate-500 mt-12 text-sm">
                Your feedback is anonymous. Tap an emoji any time something amazes, confuses, or makes you laugh.
            </p>
        </div>
    );
};

export default LiveFeedbackView;
