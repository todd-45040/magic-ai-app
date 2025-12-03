import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { User, Show, Feedback, SavedIdea, MagicianView, PredefinedPrompt, DashboardLayout, WidgetId } from '../types';
import { getLayout, saveLayout, WIDGETS, getDefaultLayout } from '../services/dashboardService';
import { updateTaskInShow } from '../services/showsService';
import FeedbackModal from './FeedbackModal';
import { RabbitIcon, ClockIcon, StarIcon, BookmarkIcon, WandIcon, MicrophoneIcon, StageCurtainsIcon, LightbulbIcon, UsersCogIcon, ChecklistIcon, FileTextIcon, ImageIcon, BookIcon, CustomizeIcon, DragHandleIcon, EyeIcon, EyeOffIcon, ChevronDownIcon } from './icons';

interface DashboardProps {
    user: User;
    shows: Show[];
    feedback: Feedback[];
    ideas: SavedIdea[];
    onNavigate: (view: MagicianView) => void;
    onPromptClick: (prompt: PredefinedPrompt) => void;
    onShowsUpdate: () => void;
}

const COLLAPSED_WIDGETS_KEY = 'magician_dashboard_collapsed_widgets';

// --- Individual Widget Components ---

const QuickActionsWidget: React.FC<{ onNavigate: (view: MagicianView) => void }> = ({ onNavigate }) => (
    <>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <button onClick={() => onNavigate('chat')} className="p-4 bg-slate-800 border border-slate-700 rounded-lg text-left h-full group transition-colors hover:bg-purple-900/50 hover:border-purple-500">
                <WandIcon className="w-8 h-8 mb-2 text-purple-400 group-hover:text-purple-300" />
                <p className="font-bold text-slate-200">AI Assistant</p>
                <p className="text-sm text-slate-400">Start a creative chat</p>
            </button>
            <button onClick={() => onNavigate('live-rehearsal')} className="p-4 bg-slate-800 border border-slate-700 rounded-lg text-left h-full group transition-colors hover:bg-purple-900/50 hover:border-purple-500">
                <MicrophoneIcon className="w-8 h-8 mb-2 text-purple-400 group-hover:text-purple-300" />
                <p className="font-bold text-slate-200">Live Rehearsal</p>
                <p className="text-sm text-slate-400">Get vocal feedback</p>
            </button>
            <button onClick={() => onNavigate('show-planner')} className="p-4 bg-slate-800 border border-slate-700 rounded-lg text-left h-full group transition-colors hover:bg-purple-900/50 hover:border-purple-500">
                <ChecklistIcon className="w-8 h-8 mb-2 text-purple-400 group-hover:text-purple-300" />
                <p className="font-bold text-slate-200">Show Planner</p>
                <p className="text-sm text-slate-400">Organize your shows</p>
            </button>
        </div>
    </>
);

const UpcomingTasksWidget: React.FC<{ shows: Show[], onNavigate: (view: MagicianView) => void, onShowsUpdate: () => void }> = ({ shows, onNavigate, onShowsUpdate }) => {
    const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set());
    const upcomingTasks = useMemo(() => {
        return shows
            .flatMap(show => show.tasks.map(task => ({ ...task, showTitle: show.title, showId: show.id })))
            .filter(task => task.status === 'To-Do' && task.dueDate)
            .sort((a, b) => a.dueDate! - b.dueDate!)
            .slice(0, 5);
    }, [shows]);

    const handleTaskToggle = (task: (typeof upcomingTasks)[0]) => {
        updateTaskInShow(task.showId, task.id, { status: 'Completed' });
        setCompletedTasks(prev => new Set(prev).add(task.id));
        setTimeout(() => {
            onShowsUpdate();
            setCompletedTasks(new Set());
        }, 500); // Wait for animation before refreshing
    };

    const formatRelativeDate = (timestamp: number) => {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const diffDays = Math.round((timestamp - today) / (1000 * 60 * 60 * 24));

        if (diffDays < 0) return `Overdue`;
        if (diffDays === 0) return "Today";
        if (diffDays === 1) return "Tomorrow";
        return `in ${diffDays} days`;
    };

    return (
        <>
            {upcomingTasks.length > 0 ? (
                <div className="space-y-3">
                    {upcomingTasks.map(task => {
                        const isCompleted = completedTasks.has(task.id);
                        return (
                            <div key={task.id} className={`p-3 bg-slate-900/50 rounded-md border-l-4 border-purple-500 transition-all duration-300 ${isCompleted ? 'opacity-30' : 'opacity-100'}`}>
                                <div className="flex justify-between items-start gap-2">
                                    <div className="flex items-start gap-3">
                                        <input type="checkbox" checked={isCompleted} onChange={() => handleTaskToggle(task)} className="mt-1 w-5 h-5 accent-purple-500 bg-slate-900 flex-shrink-0" />
                                        <div>
                                            <p className="font-semibold text-slate-200">{task.title}</p>
                                            <p className="text-xs text-slate-400">From: {task.showTitle}</p>
                                        </div>
                                    </div>
                                    <p className={`flex-shrink-0 text-sm font-semibold ${task.dueDate! < Date.now() ? 'text-red-400' : 'text-slate-300'}`}>{formatRelativeDate(task.dueDate!)}</p>
                                </div>
                            </div>
                        )
                    })}
                </div>
            ) : (
                <p className="text-sm text-slate-500 text-center py-4">No upcoming tasks with due dates. Stay sharp!</p>
            )}
            <button onClick={() => onNavigate('show-planner')} className="text-sm text-purple-400 hover:text-purple-300 font-semibold mt-3 w-full text-center">View Full Planner</button>
        </>
    );
};

const LatestFeedbackWidget: React.FC<{ feedback: Feedback[], onNavigate: (view: MagicianView) => void, onFeedbackClick: (fb: Feedback) => void }> = ({ feedback, onNavigate, onFeedbackClick }) => {
    const recentFeedback = useMemo(() => feedback.slice(0, 3), [feedback]);
    return (
        <>
            {recentFeedback.length > 0 ? (
                <div className="space-y-3">
                    {recentFeedback.map(fb => (
                        <button key={fb.id} onClick={() => onFeedbackClick(fb)} className="w-full text-left p-2 bg-slate-900/50 rounded-md hover:bg-slate-700/50 transition-colors">
                            <div className="flex items-center gap-2">
                                <div className="flex">{[...Array(5)].map((_, i) => <StarIcon key={i} className={`w-4 h-4 ${i < fb.rating ? 'text-amber-400' : 'text-slate-600'}`} />)}</div>
                                <p className="text-xs text-slate-500">{new Date(fb.timestamp).toLocaleDateString()}</p>
                            </div>
                            <p className="text-sm text-slate-300 mt-1 truncate">"{fb.comment || 'No comment provided'}"</p>
                        </button>
                    ))}
                    <button onClick={() => onNavigate('show-feedback')} className="text-sm text-purple-400 hover:text-purple-300 font-semibold mt-1 w-full text-center">View All Feedback</button>
                </div>
            ) : (
                <p className="text-sm text-slate-500 text-center py-4">No audience feedback yet.</p>
            )}
        </>
    );
};

const RecentIdeaWidget: React.FC<{ ideas: SavedIdea[], onNavigate: (view: MagicianView) => void }> = ({ ideas, onNavigate }) => {
    const recentIdea = useMemo(() => ideas[0], [ideas]);
    const getIdeaIcon = (type: SavedIdea['type']) => {
        switch (type) {
            case 'image': return ImageIcon;
            case 'rehearsal': return MicrophoneIcon;
            default: return FileTextIcon;
        }
    };
    return (
        <>
            {recentIdea ? (
                <div className="space-y-2">
                    <button onClick={() => onNavigate('saved-ideas')} className="w-full text-left p-3 bg-slate-900/50 rounded-md hover:bg-slate-700/50 transition-colors">
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-300">
                            {React.createElement(getIdeaIcon(recentIdea.type), { className: "w-4 h-4" })}
                            <p className="truncate">{recentIdea.title || `Untitled ${recentIdea.type} idea`}</p>
                        </div>
                        <p className="text-xs text-slate-400 mt-1 line-clamp-2">{typeof recentIdea.content === 'string' && recentIdea.content.startsWith('{') ? `[${recentIdea.type} data]` : (recentIdea.content.substring(0, 100) + '...')}</p>
                    </button>
                    <button onClick={() => onNavigate('saved-ideas')} className="text-sm text-purple-400 hover:text-purple-300 font-semibold mt-1 w-full text-center">View All Saved Ideas</button>
                </div>
            ) : (
                <p className="text-sm text-slate-500 text-center py-4">No saved ideas yet.</p>
            )}
        </>
    );
};

const FeaturedToolsWidget: React.FC<{ onNavigate: (view: MagicianView) => void }> = ({ onNavigate }) => (
    <>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <button onClick={() => onNavigate('effect-generator')} className="p-3 bg-slate-800 border border-slate-700 rounded-lg text-left h-full group transition-colors hover:bg-purple-900/50 hover:border-purple-500">
                <LightbulbIcon className="w-6 h-6 mb-1 text-purple-400" />
                <p className="font-semibold text-slate-200 text-sm">Effect Generator</p>
            </button>
            <button onClick={() => onNavigate('director-mode')} className="p-3 bg-slate-800 border border-slate-700 rounded-lg text-left h-full group transition-colors hover:bg-purple-900/50 hover:border-purple-500">
                <StageCurtainsIcon className="w-6 h-6 mb-1 text-purple-400" />
                <p className="font-semibold text-slate-200 text-sm">Director Mode</p>
            </button>
            <button onClick={() => onNavigate('persona-simulator')} className="p-3 bg-slate-800 border border-slate-700 rounded-lg text-left h-full group transition-colors hover:bg-purple-900/50 hover:border-purple-500">
                <UsersCogIcon className="w-6 h-6 mb-1 text-purple-400" />
                <p className="font-semibold text-slate-200 text-sm">Persona Simulator</p>
            </button>
            <button onClick={() => onNavigate('patter-engine')} className="p-3 bg-slate-800 border border-slate-700 rounded-lg text-left h-full group transition-colors hover:bg-purple-900/50 hover:border-purple-500">
                <BookIcon className="w-6 h-6 mb-1 text-purple-400" />
                <p className="font-semibold text-slate-200 text-sm">Patter Engine</p>
            </button>
        </div>
    </>
);


// --- Main Dashboard Component ---

const Dashboard: React.FC<DashboardProps> = ({ user, shows, feedback, ideas, onNavigate, onShowsUpdate }) => {
    const [layout, setLayout] = useState<DashboardLayout>(getDefaultLayout());
    const [isCustomizeMode, setIsCustomizeMode] = useState(false);
    const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(null);
    const [draggedWidgetId, setDraggedWidgetId] = useState<WidgetId | null>(null);
    const [collapsedWidgets, setCollapsedWidgets] = useState<Set<WidgetId>>(new Set());

    const isTrialActive = user.membership === 'trial' && user.trialEndDate ? user.trialEndDate > Date.now() : false;
    const hasProAccess = user.membership === 'professional' || isTrialActive;

    useEffect(() => {
        if (hasProAccess) {
            setLayout(getLayout());
            const savedCollapsed = localStorage.getItem(COLLAPSED_WIDGETS_KEY);
            if (savedCollapsed) {
                setCollapsedWidgets(new Set(JSON.parse(savedCollapsed)));
            }
        }
    }, [hasProAccess]);

    const toggleCollapse = (widgetId: WidgetId) => {
        setCollapsedWidgets(prev => {
            const newSet = new Set(prev);
            if (newSet.has(widgetId)) {
                newSet.delete(widgetId);
            } else {
                newSet.add(widgetId);
            }
            localStorage.setItem(COLLAPSED_WIDGETS_KEY, JSON.stringify(Array.from(newSet)));
            return newSet;
        });
    };

    const handleLayoutChange = (newLayout: DashboardLayout) => {
        setLayout(newLayout);
        saveLayout(newLayout);
    };

    const handleHideWidget = (widgetId: WidgetId) => {
        const newLayout = {
            visible: layout.visible.filter(id => id !== widgetId),
            hidden: [...layout.hidden, widgetId]
        };
        handleLayoutChange(newLayout);
    };

    const handleShowWidget = (widgetId: WidgetId) => {
        const newLayout = {
            visible: [...layout.visible, widgetId],
            hidden: layout.hidden.filter(id => id !== widgetId)
        };
        handleLayoutChange(newLayout);
    };

    const onDragStart = (e: React.DragEvent<HTMLDivElement>, widgetId: WidgetId) => {
        setDraggedWidgetId(widgetId);
        e.dataTransfer.effectAllowed = 'move';
    };

    const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
    };

    const onDrop = (e: React.DragEvent<HTMLDivElement>, targetWidgetId: WidgetId) => {
        e.preventDefault();
        if (!draggedWidgetId) return;

        const visibleWidgets = [...layout.visible];
        const draggedIndex = visibleWidgets.indexOf(draggedWidgetId);
        const targetIndex = visibleWidgets.indexOf(targetWidgetId);

        if (draggedIndex > -1 && targetIndex > -1) {
            const [removed] = visibleWidgets.splice(draggedIndex, 1);
            visibleWidgets.splice(targetIndex, 0, removed);
            handleLayoutChange({ ...layout, visible: visibleWidgets });
        }
        setDraggedWidgetId(null);
    };
    
    const widgetComponents: Record<WidgetId, React.ReactNode> = {
        'quick-actions': <QuickActionsWidget onNavigate={onNavigate} />,
        'upcoming-tasks': <UpcomingTasksWidget shows={shows} onNavigate={onNavigate} onShowsUpdate={onShowsUpdate} />,
        'latest-feedback': <LatestFeedbackWidget feedback={feedback} onNavigate={onNavigate} onFeedbackClick={setSelectedFeedback} />,
        'recent-idea': <RecentIdeaWidget ideas={ideas} onNavigate={onNavigate} />,
        'featured-tools': <FeaturedToolsWidget onNavigate={onNavigate} />,
    };

    const renderWidget = (widgetId: WidgetId) => {
        const isCollapsed = collapsedWidgets.has(widgetId);
        const widgetInfo = WIDGETS.find(w => w.id === widgetId)!;

        const widgetContent = (
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden">
                <button
                    className="w-full flex items-center justify-between p-4 text-left"
                    onClick={() => toggleCollapse(widgetId)}
                    aria-expanded={!isCollapsed}
                >
                    <div className="flex items-center gap-2">
                         <widgetInfo.icon className="w-5 h-5 text-purple-400" />
                         <h2 className="font-bold text-white">{widgetInfo.title}</h2>
                    </div>
                    <ChevronDownIcon className={`w-6 h-6 text-slate-400 transition-transform duration-300 ${isCollapsed ? '-rotate-180' : ''}`} />
                </button>
                <div className={`transition-all duration-300 ease-in-out grid ${isCollapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'}`}>
                    <div className="overflow-hidden">
                        <div className="p-4 pt-0">
                            {widgetComponents[widgetId]}
                        </div>
                    </div>
                </div>
            </div>
        );

        if (hasProAccess && isCustomizeMode) {
             return (
                <div
                    draggable
                    onDragStart={(e) => onDragStart(e, widgetId)}
                    onDragOver={onDragOver}
                    onDrop={(e) => onDrop(e, widgetId)}
                    className="relative p-2 bg-slate-800/50 border-2 border-dashed border-slate-600 rounded-lg cursor-move group"
                >
                    <div className="absolute top-1 right-1 flex items-center gap-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleHideWidget(widgetId)} title="Hide widget" className="p-1.5 bg-slate-700/80 rounded-full text-slate-400 hover:text-white hover:bg-red-600/80"><EyeOffIcon className="w-4 h-4" /></button>
                        <DragHandleIcon className="w-6 h-6 text-slate-400 cursor-grab" />
                    </div>
                    {widgetContent}
                </div>
            );
        }

        return widgetContent;
    };


    return (
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 animate-fade-in">
            {selectedFeedback && createPortal(<FeedbackModal feedback={selectedFeedback} onClose={() => setSelectedFeedback(null)} />, document.body)}

            <header className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-white font-cinzel">Welcome, {user.email.split('@')[0]}</h1>
                    <p className="text-slate-400">Here's your magic dashboard for today.</p>
                </div>
                {hasProAccess && (
                    <button onClick={() => setIsCustomizeMode(prev => !prev)} className={`flex items-center gap-2 px-4 py-2 rounded-md font-semibold transition-colors ${isCustomizeMode ? 'bg-purple-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                        <CustomizeIcon className="w-5 h-5" />
                        <span>{isCustomizeMode ? 'Done' : 'Customize'}</span>
                    </button>
                )}
            </header>
            
            <div className="space-y-6">
                {layout.visible.map(widgetId => (
                    <div key={widgetId} data-widget-id={widgetId}>
                        {renderWidget(widgetId)}
                    </div>
                ))}
            </div>
            
            {hasProAccess && isCustomizeMode && (
                <div className="mt-8 pt-6 border-t border-slate-700">
                    <h2 className="font-bold text-slate-400 mb-3">Hidden Widgets</h2>
                    {layout.hidden.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                            {layout.hidden.map(widgetId => (
                                <button key={widgetId} onClick={() => handleShowWidget(widgetId)} className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-md text-slate-300">
                                    <EyeIcon className="w-4 h-4" />
                                    <span>{WIDGETS.find(w => w.id === widgetId)?.title || 'Unknown'}</span>
                                </button>
                            ))}
                        </div>
                    ) : <p className="text-sm text-slate-500">All widgets are visible.</p>}
                </div>
            )}
        </div>
    );
};

export default Dashboard;