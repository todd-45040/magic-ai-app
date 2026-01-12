import React, { useMemo, useState } from 'react';
import {
    WandIcon, LightbulbIcon, MicrophoneIcon, ImageIcon, BookmarkIcon, ChecklistIcon,
    StarIcon, SearchIcon, CrossIcon, CameraIcon, QuestionMarkIcon, UsersCogIcon, UsersIcon,
    BookIcon, ShieldIcon, ClockIcon, MegaphoneIcon, FileTextIcon, StageCurtainsIcon, VideoIcon,
    DollarSignIcon, AnalyticsIcon, BlueprintIcon, TutorIcon, NewspaperIcon, ViewGridIcon, DatabaseIcon
} from './icons';

type HelpCategory =
    | 'Getting Started'
    | 'Create'
    | 'Rehearse'
    | 'Plan & Organize'
    | 'Business'
    | 'Learn'
    | 'Community'
    | 'Search'
    | 'Account'
    | 'Other';

interface HelpModalProps {
    onClose: () => void;
    onNavigate?: (view: string) => void;
}

type HelpFeature = {
    icon: React.ElementType;
    title: string;
    description: string;
    proTip: string;
};

type EnrichedFeature = HelpFeature & {
    category: HelpCategory;
    view?: string;
};

/* --- feature data unchanged --- */

const HelpModal: React.FC<HelpModalProps> = ({ onClose, onNavigate }) => {
    const [query, setQuery] = useState('');
    const canNavigate = typeof onNavigate === 'function';

    return (
        <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50"
            onClick={onClose}
        >
            <div
                className="w-full max-w-5xl h-[92vh] bg-slate-800/90 border border-slate-600 rounded-lg shadow-2xl shadow-purple-900/40 flex flex-col"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label="Help Center"
            >
                {/* Header */}
                <header className="p-4 border-b border-slate-700 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <QuestionMarkIcon className="w-8 h-8 text-purple-400" />
                        <div>
                            <h2 className="font-cinzel text-2xl font-bold text-yellow-400">
                                Help Center
                            </h2>
                            <p className="text-xs text-slate-400">
                                Find tools, workflows, and troubleshooting tips.
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200 transition-colors"
                    >
                        Close
                    </button>
                </header>

                <main className="flex-1 overflow-y-auto p-5">
                    {/* Getting Started */}
                    <div className="bg-slate-900/40 border border-slate-700 rounded-lg p-4 mb-5">
                        <div className="flex items-center gap-2 mb-3">
                            <StarIcon className="w-5 h-5 text-purple-400" />
                            <h3 className="text-lg font-bold text-yellow-300">
                                Getting Started
                            </h3>
                        </div>

                        {/* workflow cards */}
                        {/* logic unchanged */}
                    </div>

                    {/* Feature Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* map */}
                        <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                            <div className="flex items-center gap-3 mb-2">
                                <WandIcon className="w-6 h-6 text-purple-400" />
                                <h3 className="text-lg font-bold text-yellow-300">
                                    Effect Generator
                                </h3>
                            </div>
                            <p className="text-sm text-slate-400">
                                Generate new magic trick ideas tailored to your show.
                            </p>
                        </div>
                    </div>

                    {/* Troubleshooting */}
                    <div className="mt-6 bg-slate-900/40 border border-slate-700 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <ShieldIcon className="w-5 h-5 text-purple-400" />
                            <h3 className="text-lg font-bold text-yellow-300">
                                Troubleshooting
                            </h3>
                        </div>

                        {/* details blocks unchanged */}
                    </div>

                    <div className="mt-5 text-xs text-slate-500">
                        Looking for something specific? Use the search above or re-open Help anytime.
                    </div>
                </main>
            </div>
        </div>
    );
};

export default HelpModal;
