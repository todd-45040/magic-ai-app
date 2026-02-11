import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { User, Show, Feedback, SavedIdea, MagicianView, PredefinedPrompt, DashboardLayout, WidgetId } from '../types';
import { getLayout, saveLayout, WIDGETS, getDefaultLayout } from '../services/dashboardService';
import { updateTaskInShow } from '../services/showsService';
import { getPerformancesByShowId } from '../services/performanceService';
import { supabase } from '../supabase';
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
            <button onClick={() => onNavigate('assistant-home')} className="p-4 bg-slate-800 border border-slate-700 rounded-lg text-left h-full group transition-colors hover:bg-purple-900/50 hover:border-purple-500">
                <WandIcon className="w-8 h-8 mb-2 text-purple-400 group-hover:text-purple-300" />
                <p className="font-bold text-yellow-200 group-hover:text-yellow-100 transition-colors">AI Assistant</p>
                <p className="text-sm text-slate-400">Choose a tool or ask a question</p>
            </button>
            <button onClick={() => onNavigate('live-rehearsal')} className="p-4 bg-slate-800 border border-slate-700 rounded-lg text-left h-full group transition-colors hover:bg-purple-900/50 hover:border-purple-500">
                <MicrophoneIcon className="w-8 h-8 mb-2 text-purple-400 group-hover:text-purple-300" />
                <p className="font-bold text-yellow-200 group-hover:text-yellow-100 transition-colors">Live Rehearsal</p>
                <p className="text-sm text-slate-400">Start a rehearsal session</p>
            </button>
            <button onClick={() => onNavigate('show-planner')} className="p-4 bg-slate-800 border border-slate-700 rounded-lg text-left h-full group transition-colors hover:bg-purple-900/50 hover:border-purple-500">
                <ChecklistIcon className="w-8 h-8 mb-2 text-purple-400 group-hover:text-purple-300" />
                <p className="font-bold text-yellow-200 group-hover:text-yellow-100 transition-colors">Show Planner</p>
                <p className="text-sm text-slate-400">Plan routines and tasks</p>
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
            <button onClick={() => onNavigate('show-planner')} className="text-sm text-purple-400 hover:text-purple-300 font-semibold mt-3 w-full text-center">Open Planner</button>
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
                    <button onClick={() => onNavigate('show-feedback')} className="text-sm text-purple-400 hover:text-purple-300 font-semibold mt-1 w-full text-center">Open Feedback</button>
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
                    <button onClick={() => onNavigate('saved-ideas')} className="text-sm text-purple-400 hover:text-purple-300 font-semibold mt-1 w-full text-center">View Ideas</button>
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
                <p className="font-semibold text-yellow-200 text-sm">Effect Generator</p>
            </button>
            <button onClick={() => onNavigate('director-mode')} className="p-3 bg-slate-800 border border-slate-700 rounded-lg text-left h-full group transition-colors hover:bg-purple-900/50 hover:border-purple-500">
                <StageCurtainsIcon className="w-6 h-6 mb-1 text-purple-400" />
                <p className="font-semibold text-yellow-200 text-sm">Director Mode</p>
            </button>
            <button onClick={() => onNavigate('persona-simulator')} className="p-3 bg-slate-800 border border-slate-700 rounded-lg text-left h-full group transition-colors hover:bg-purple-900/50 hover:border-purple-500">
                <UsersCogIcon className="w-6 h-6 mb-1 text-purple-400" />
                <p className="font-semibold text-yellow-200 text-sm">Persona Simulator</p>
            </button>
            <button onClick={() => onNavigate('patter-engine')} className="p-3 bg-slate-800 border border-slate-700 rounded-lg text-left h-full group transition-colors hover:bg-purple-900/50 hover:border-purple-500">
                <BookIcon className="w-6 h-6 mb-1 text-purple-400" />
                <p className="font-semibold text-yellow-200 text-sm">Patter Engine</p>
            </button>
        </div>
    </>
);

const formatMoney = (value: number, currency: string = 'USD') => {
    try {
        return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value);
    } catch {
        return `$${value.toFixed(0)}`;
    }
};

const BusinessMetricsWidget: React.FC<{ shows: Show[]; feedback: Feedback[] }> = ({ shows, feedback }) => {
    const { gross, expenses, net, completedCount, avgRating, responseCount } = useMemo(() => {
        const gross = shows.reduce((sum, s) => sum + (s.finances?.performanceFee || 0), 0);
        const expenses = shows.reduce((sum, s) => {
            const ex = s.finances?.expenses || [];
            return sum + ex.reduce((sub, e) => sub + (e.amount || 0), 0);
        }, 0);
        const net = gross - expenses;

        const completedCount = shows.reduce((count, s) => {
            const perfs = getPerformancesByShowId(s.id);
            return count + (perfs.some(p => !!p.endTime) ? 1 : 0);
        }, 0);

        const responseCount = feedback.length;
        const avgRating = responseCount > 0 ? (feedback.reduce((sum, f) => sum + (f.rating || 0), 0) / responseCount) : 0;

        return { gross, expenses, net, completedCount, avgRating, responseCount };
    }, [shows, feedback]);

    return (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3">
                <div className="text-xs text-slate-400">Gross Revenue</div>
                <div className="mt-1 text-xl font-bold text-slate-100">{formatMoney(gross)}</div>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3">
                <div className="text-xs text-slate-400">Expenses</div>
                <div className="mt-1 text-xl font-bold text-slate-100">{formatMoney(expenses)}</div>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3">
                <div className="text-xs text-slate-400">Net (Estimated)</div>
                <div className="mt-1 text-xl font-bold text-yellow-200">{formatMoney(net)}</div>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3">
                <div className="text-xs text-slate-400">Completed Shows</div>
                <div className="mt-1 text-xl font-bold text-slate-100">{completedCount}</div>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3">
                <div className="text-xs text-slate-400">Avg Rating</div>
                <div className="mt-1 text-xl font-bold text-slate-100">{avgRating ? avgRating.toFixed(1) : '—'}</div>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3">
                <div className="text-xs text-slate-400">Audience Responses</div>
                <div className="mt-1 text-xl font-bold text-slate-100">{responseCount}</div>
            </div>

            <p className="col-span-2 lg:col-span-3 text-xs text-slate-400">
                Revenue is pulled from Show Planner fees and expenses. Completed Shows are counted when a performance has an end time.
            </p>
        </div>
    );
};



const ContractPipelineWidget: React.FC = () => {
    const [stats, setStats] = useState<{ draft: number; sent: number; signed: number; depositsCollected: number; outstandingBalances: number; }>({
        draft: 0,
        sent: 0,
        signed: 0,
        depositsCollected: 0,
        outstandingBalances: 0,
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const { data: userData, error: userErr } = await supabase.auth.getUser();
                if (userErr) throw userErr;
                const userId = userData?.user?.id;
                if (!userId) {
                    // Not logged in via Supabase Auth — show 0s quietly
                    setLoading(false);
                    return;
                }

                const { data, error: qErr } = await supabase
                    .from('contracts')
                    .select('status, deposit_paid, balance_paid')
                    .eq('user_id', userId);

                if (qErr) throw qErr;

                const rows = (data || []) as any[];
                const next = {
                    draft: rows.filter(r => (r.status || 'draft') === 'draft').length,
                    sent: rows.filter(r => r.status === 'sent').length,
                    signed: rows.filter(r => r.status === 'signed').length,
                    depositsCollected: rows.filter(r => r.deposit_paid === true).length,
                    outstandingBalances: rows.filter(r => (r.status === 'signed') && r.balance_paid !== true).length,
                };
                setStats(next);
            } catch (e: any) {
                console.error('Failed to load contract pipeline stats:', e);
                setError(e?.message ? String(e.message) : 'Failed to load contract stats.');
            } finally {
                setLoading(false);
            }
        };

        load();
    }, []);

    return (
        <>
            {error && <p className="text-sm text-red-400 mb-2">{error}</p>}
            <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-900/50 rounded-md border border-slate-700">
                    <p className="text-xs text-slate-400">Contracts Draft</p>
                    <p className="text-2xl font-bold text-amber-300">{loading ? '—' : stats.draft}</p>
                </div>
                <div className="p-3 bg-slate-900/50 rounded-md border border-slate-700">
                    <p className="text-xs text-slate-400">Contracts Sent</p>
                    <p className="text-2xl font-bold text-blue-300">{loading ? '—' : stats.sent}</p>
                </div>
                <div className="p-3 bg-slate-900/50 rounded-md border border-slate-700">
                    <p className="text-xs text-slate-400">Contracts Signed</p>
                    <p className="text-2xl font-bold text-green-300">{loading ? '—' : stats.signed}</p>
                </div>
                <div className="p-3 bg-slate-900/50 rounded-md border border-slate-700">
                    <p className="text-xs text-slate-400">Deposits Collected</p>
                    <p className="text-2xl font-bold text-slate-200">{loading ? '—' : stats.depositsCollected}</p>
                </div>
                <div className="col-span-2 p-3 bg-slate-900/50 rounded-md border border-slate-700 flex items-center justify-between">
                    <div>
                        <p className="text-xs text-slate-400">Outstanding Balances</p>
                        <p className="text-2xl font-bold text-slate-200">{loading ? '—' : stats.outstandingBalances}</p>
                    </div>
                    <p className="text-xs text-slate-500">Signed & unpaid</p>
                </div>
            </div>
        </>
    );
};

const StrategicInsightsWidget: React.FC<{ shows: Show[]; feedback: Feedback[]; onNavigate: (view: MagicianView) => void }> = ({ shows, feedback, onNavigate }) => {
    const insights = useMemo(() => {
        const out: { title: string; detail: string; action?: { label: string; view: MagicianView } }[] = [];

        const showsWithFee = shows.filter(s => (s.finances?.performanceFee || 0) > 0).length;
        const showsWithFeedback = new Set(feedback.map(f => f.showId)).size;

        if (shows.length > 0 && showsWithFeedback < shows.length) {
            out.push({
                title: 'Collect more audience feedback',
                detail: `${shows.length - showsWithFeedback} show(s) have no audience responses yet. Generate a QR code and display it after the show.`,
                action: { label: 'Audience Feedback', view: 'show-feedback' },
            });
        }

        const highExpenseShows = shows.filter(s => {
            const fee = s.finances?.performanceFee || 0;
            const exp = (s.finances?.expenses || []).reduce((sum, e) => sum + (e.amount || 0), 0);
            return fee > 0 && exp / fee >= 0.5;
        }).length;
        if (highExpenseShows > 0) {
            out.push({
                title: 'Watch profit on a few shows',
                detail: `${highExpenseShows} show(s) have expenses above 50% of your fee. Consider tightening travel/prop costs for better margins.`,
            });
        }

        if (showsWithFee === 0 && shows.length > 0) {
            out.push({
                title: 'Add your performance fee',
                detail: 'Your shows don’t have fees recorded yet. Adding fees/expenses makes your business dashboard instantly more valuable.',
                action: { label: 'Show Planner', view: 'show-planner' },
            });
        }

        const avgRating = feedback.length ? feedback.reduce((s, f) => s + (f.rating || 0), 0) / feedback.length : 0;
        if (feedback.length >= 3 && avgRating >= 4.6) {
            out.push({
                title: 'You’re in “rebook” territory',
                detail: `Your average rating is ${avgRating.toFixed(1)} across ${feedback.length} response(s). Consider adding a 2-sentence rebooking ask to your follow-up email.`,
                action: { label: 'Draft Email', view: 'client-management' },
            });
        }

        return out.length ? out : [{ title: 'Keep building data', detail: 'Add fees/expenses, collect audience feedback, and log performances to unlock smarter insights.' }];
    }, [shows, feedback]);

    return (
        <div className="space-y-3">
            {insights.slice(0, 4).map((i, idx) => (
                <div key={idx} className="rounded-lg border border-slate-700 bg-slate-900/40 p-3">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <div className="font-semibold text-slate-100">{i.title}</div>
                            <div className="text-sm text-slate-400 mt-1">{i.detail}</div>
                        </div>
                        {i.action && (
                            <button
                                onClick={() => onNavigate(i.action!.view)}
                                className="shrink-0 px-3 py-1.5 rounded-md bg-purple-600/80 hover:bg-purple-600 text-white text-sm font-semibold"
                            >
                                {i.action.label}
                            </button>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
};


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
        'business-metrics': <BusinessMetricsWidget shows={shows} feedback={feedback} />,
        'contract-pipeline': <ContractPipelineWidget />,
        'strategic-insights': <StrategicInsightsWidget shows={shows} feedback={feedback} onNavigate={onNavigate} />,
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
                         <h2 className="font-bold text-yellow-200 tracking-wide">{widgetInfo.title}</h2>
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
                    <h1 className="text-3xl font-bold text-yellow-200 font-cinzel">Welcome, {user.email.split('@')[0]}</h1>
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
                    <h2 className="font-bold text-yellow-200/80 mb-3">Hidden Widgets</h2>
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