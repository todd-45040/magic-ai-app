
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Type } from '@google/genai';
import QRCode from 'qrcode';
import type { Show, Task, Subtask, TaskPriority, Client, Finances, Expense, Performance, User } from '../types';
import { getShows, addShow, updateShow, deleteShow, addTaskToShow, addTasksToShow, updateTaskInShow, deleteTaskFromShow, toggleSubtask } from '../services/showsService';
import { startPerformance, endPerformance, getPerformancesByShowId } from '../services/performanceService';
import { listContractsForShow, updateContractStatus, type ContractRow, type ContractStatus } from '../services/contractsService';
import { generateResponse, generateStructuredResponse } from '../services/geminiService';
import { buildShowFeedbackUrl, rotateShowFeedbackToken } from '../services/showFeedbackService';
import { AI_TASK_SUGGESTER_SYSTEM_INSTRUCTION, IN_TASK_PATTER_SYSTEM_INSTRUCTION } from '../constants';
import { AnalyticsIcon, BackIcon, CalendarIcon, CheckIcon, ChecklistIcon, CopyIcon, DollarSignIcon, FileTextIcon, MusicNoteIcon, PencilIcon, QrCodeIcon, StageCurtainsIcon, TrashIcon, UsersIcon, ViewGridIcon, ViewListIcon, WandIcon } from './icons';
import { useAppState } from '../store';

type ViewMode = 'list' | 'board';
type SortBy = 'dueDate' | 'priority' | 'createdAt';

const PRIORITY_STYLES: Record<TaskPriority, string> = {
    'High': 'bg-red-500/20 text-red-300 border-red-500/30',
    'Medium': 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    'Low': 'bg-green-500/20 text-green-300 border-green-500/30',
};

const PRIORITY_ORDER: Record<TaskPriority, number> = {
    'High': 1,
    'Medium': 2,
    'Low': 3,
};

// --- Helper Components ---

const PriorityBadge: React.FC<{ priority: TaskPriority }> = ({ priority }) => (
    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${PRIORITY_STYLES[priority]}`}>
        {priority}
    </span>
);

const TaskModal: React.FC<{
    onClose: () => void;
    onSave: (data: any) => Promise<void> | void;
    taskToEdit?: Task | null;
    user: User;
    onToast?: (msg: string) => void;
}> = ({ onClose, onSave, taskToEdit, user, onToast }) => {
    const [title, setTitle] = useState('');
    const [notes, setNotes] = useState('');
    const [priority, setPriority] = useState<TaskPriority>('Medium');
    const [isSaving, setIsSaving] = useState(false);
    const [dueDate, setDueDate] = useState('');
    const [musicCue, setMusicCue] = useState('');
    const [subtasks, setSubtasks] = useState<Partial<Subtask>[]>([]);
    const [newSubtaskText, setNewSubtaskText] = useState('');
    const [isGeneratingPatter, setIsGeneratingPatter] = useState(false);


    useEffect(() => {
        if (taskToEdit) {
            setTitle(taskToEdit.title);
            setPriority(taskToEdit.priority);
            setNotes(taskToEdit.notes || '');
            setMusicCue(taskToEdit.musicCue || '');
            setSubtasks(taskToEdit.subtasks || []);
            if (taskToEdit.dueDate) {
                const d = new Date(taskToEdit.dueDate);
                d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
                setDueDate(d.toISOString().slice(0, 10));
            } else {
                setDueDate('');
            }
        }
    }, [taskToEdit]);

    const handleAddSubtask = () => {
        if (newSubtaskText.trim()) {
            setSubtasks([...subtasks, { text: newSubtaskText, completed: false }]);
            setNewSubtaskText('');
        }
    };

    const handleRemoveSubtask = (index: number) => {
        setSubtasks(subtasks.filter((_, i) => i !== index));
    };

    const handleGeneratePatter = async () => {
        if (!title.trim()) return;
        setIsGeneratingPatter(true);
        try {
            // FIX: Pass user object to generateResponse
            const patter = await generateResponse(title, IN_TASK_PATTER_SYSTEM_INSTRUCTION, user);
            setNotes(prev => prev ? `${prev}\n\n---\n\n${patter}` : patter);
        } catch (error) {
            console.error("Patter generation failed:", error);
        } finally {
            setIsGeneratingPatter(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;

        const finalSubtasks = subtasks
            .filter(st => st.text?.trim())
            .map(st => ({
                id: st.id || `subtask-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                text: st.text!,
                completed: st.completed || false
            }));

        const taskData = {
            title,
            notes,
            priority,
            musicCue,
            subtasks: finalSubtasks,
            // Ensure newly created tasks are immediately visible in the planner.
            status: taskToEdit?.status ?? 'To-Do',
            dueDate: dueDate ? new Date(dueDate + 'T00:00:00').getTime() : undefined
        };

        try {
            setIsSaving(true);
            const payload = taskToEdit ? { ...taskData, id: taskToEdit.id } : taskData;
            console.log('Saving task priority:', payload.priority);
            await Promise.resolve(onSave(payload));
            onToast?.(taskToEdit ? 'Task updated.' : 'Task saved.');
        } catch (err) {
            console.error(err);
            onToast?.("Couldn't save task.");
        } finally {
            setIsSaving(false);
        }
    };

    const modalTitle = taskToEdit ? 'Edit Task' : 'Add New Task';
    const buttonText = taskToEdit ? 'Save Changes' : 'Add Task';
    
    const modalContent = (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 motion-reduce:animate-none animate-fade-in" onClick={onClose}>
            <div className="w-full max-w-lg bg-slate-800 border border-purple-500 rounded-lg shadow-2xl flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-xl font-bold text-white p-6 border-b border-slate-700 flex-shrink-0">{modalTitle}</h2>
                <form id="task-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
                    <div>
                        <label htmlFor="title" className="block text-sm font-medium text-slate-300 mb-1">Task Title</label>
                        <input id="title" type="text" value={title} onChange={e => setTitle(e.target.value)} required autoFocus className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white focus:outline-none focus:border-purple-500" />
                    </div>
                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <label htmlFor="notes" className="block text-sm font-medium text-slate-300">Notes / Patter (Optional)</label>
                            <button
                                type="button"
                                onClick={handleGeneratePatter}
                                disabled={!title.trim() || isGeneratingPatter}
                                className="flex items-center gap-1.5 px-2 py-1 text-xs font-semibold bg-slate-700 hover:bg-purple-800 border border-slate-600 rounded-full text-slate-200 transition-colors disabled:opacity-50"
                            >
                                <WandIcon className="w-3 h-3" />
                                {isGeneratingPatter ? 'Generating...' : 'Generate Patter'}
                            </button>
                        </div>
                        <textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full bg-slate-900/50 border border-slate-700 rounded-md p-2 text-white focus:outline-none focus:border-purple-500" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="priority" className="block text-sm font-medium text-slate-300 mb-1">Priority</label>
                            <select
                                id="priority"
                                value={priority}
                                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                                className="w-full bg-slate-900 px-3 py-2 border border-slate-600 rounded-md text-white focus:outline-none focus:border-purple-500"
                            >
                                <option value="High">High</option>
                                <option value="Medium">Medium</option>
                                <option value="Low">Low</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="due-date" className="block text-sm font-medium text-slate-300 mb-1">Due Date (Optional)</label>
                            <input id="due-date" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white focus:outline-none focus:border-purple-500" />
                        </div>
                    </div>
                    <div>
                        <label htmlFor="music-cue" className="block text-sm font-medium text-slate-300 mb-1">Music Cue (Optional)</label>
                        <input id="music-cue" type="text" value={musicCue} onChange={e => setMusicCue(e.target.value)} placeholder="e.g., 'Mysterious Fanfare' at 0:32" className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white focus:outline-none focus:border-purple-500" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Sub-Tasks</label>
                        <div className="max-h-32 overflow-y-auto space-y-2 pr-2 border border-slate-700/50 bg-slate-900/50 rounded-md p-2">
                            {subtasks.length > 0 ? subtasks.map((subtask, index) => (
                                <div key={index} className="flex items-center gap-2">
                                    <input type="checkbox" checked={subtask.completed} readOnly className="w-4 h-4 accent-purple-500 flex-shrink-0" />
                                    <input type="text" value={subtask.text}
                                        onChange={(e) => {
                                            const newSubtasks = [...subtasks];
                                            newSubtasks[index].text = e.target.value;
                                            setSubtasks(newSubtasks);
                                        }}
                                        className="flex-1 bg-slate-700/50 px-2 py-1 rounded-md text-sm text-white"
                                    />
                                    <button type="button" onClick={() => handleRemoveSubtask(index)} className="p-1 text-slate-400 hover:text-red-400 flex-shrink-0"><TrashIcon className="w-4 h-4" /></button>
                                </div>
                            )) : (
                                <p className="text-xs text-slate-500 text-center py-2">No sub-tasks yet.</p>
                            )}
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                            <input type="text" value={newSubtaskText} onChange={(e) => setNewSubtaskText(e.target.value)} placeholder="New subtask..." className="flex-1 bg-slate-900/50 border border-slate-700 rounded-md p-2 text-white focus:outline-none focus:border-purple-500" />
                            <button type="button" onClick={handleAddSubtask} className="px-4 py-2 bg-slate-600 hover:bg-slate-700 rounded-md text-white font-semibold text-sm">Add</button>
                        </div>
                    </div>
                </form>
                <div className="flex gap-3 p-6 flex-shrink-0 bg-slate-800 border-t border-slate-700">
                    <button type="button" onClick={onClose} disabled={isSaving} className="w-full py-2 px-4 bg-slate-600/50 hover:bg-slate-700 rounded-md text-slate-300 font-bold transition-colors">Cancel</button>
                    <button type="submit" form="task-form" disabled={isSaving} className="w-full py-2 px-4 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold transition-colors">{isSaving ? 'Saving...' : buttonText}</button>
                </div>
            </div>
        </div>
    );
    
    return createPortal(modalContent, document.body);
};

const ScriptGuideModal: React.FC<{ script: string; onClose: () => void }> = ({ script, onClose }) => {
    const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');

    const handleCopy = () => {
        navigator.clipboard.writeText(script);
        setCopyStatus('copied');
        setTimeout(() => setCopyStatus('idle'), 2000);
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 motion-reduce:animate-none animate-fade-in" onClick={onClose}>
            <div className="w-full max-w-2xl h-[90vh] max-h-[700px] bg-slate-800 border border-purple-500 rounded-lg shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
                <header className="p-4 border-b border-slate-700 flex items-center justify-between flex-shrink-0">
                    <h2 className="text-xl font-bold text-white">Show Script & Cue Sheet</h2>
                    <div className="flex items-center gap-2">
                         <button onClick={handleCopy} className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200 transition-colors">
                            {copyStatus === 'copied' ? <CheckIcon className="w-4 h-4 text-green-400" /> : <CopyIcon className="w-4 h-4" />}
                            <span>{copyStatus === 'copied' ? 'Copied!' : 'Copy'}</span>
                        </button>
                        <button onClick={onClose} className="py-1.5 px-3 bg-slate-600/50 hover:bg-slate-700 rounded-md text-slate-300 font-bold transition-colors">Close</button>
                    </div>
                </header>
                <main className="flex-1 overflow-y-auto p-6">
                    <pre className="whitespace-pre-wrap break-words text-slate-200 font-sans text-sm">{script}</pre>
                </main>
            </div>
        </div>
    );
};


// --- Main Planner Component ---

interface ShowPlannerProps {
    user: User;
    clients: Client[];
    onNavigateToAnalytics: (performanceId: string) => void;
    initialShowId?: string | null;
    initialTaskId?: string | null;
}

const ShowPlanner: React.FC<ShowPlannerProps> = ({ user, clients, onNavigateToAnalytics, initialShowId, initialTaskId }) => {
    const [shows, setShows] = useState<Show[]>([]);
    const [isLoadingShows, setIsLoadingShows] = useState(true);
    const [showsError, setShowsError] = useState<string | null>(null);
    const [toastMsg, setToastMsg] = useState<string | null>(null);

    useEffect(() => {
        if (!toastMsg) return;
        const t = window.setTimeout(() => setToastMsg(null), 2200);
        return () => window.clearTimeout(t);
    }, [toastMsg]);
    const [selectedShow, setSelectedShow] = useState<Show | null>(null);
    const [viewMode, setViewMode] = useState<ViewMode>('board');
    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
    const [isScriptModalOpen, setIsScriptModalOpen] = useState(false);
    const [isShowModalOpen, setIsShowModalOpen] = useState(false);
    const [isLiveModalOpen, setIsLiveModalOpen] = useState(false);
    const [isAudienceQrModalOpen, setIsAudienceQrModalOpen] = useState(false);
    const [generatedScript, setGeneratedScript] = useState('');
    const [taskToEdit, setTaskToEdit] = useState<Task | null>(null);
    const [sortBy, setSortBy] = useState<SortBy>('dueDate');
    const taskRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());

    useEffect(() => {
        let isMounted = true;
        const fetchShows = async () => {
            try {
                setShowsError(null);
                setIsLoadingShows(true);
                const allShows = await getShows();
                if (!isMounted) return;
                setShows(allShows);

                if (initialShowId) {
                    const show = allShows.find((s) => s.id === initialShowId);
                    if (show) setSelectedShow(show);
                }
            } catch (err: any) {
                if (!isMounted) return;
                console.error('Failed to load shows:', err);
                setShowsError(err?.message ?? 'Failed to load shows.');
            } finally {
                if (!isMounted) return;
                setIsLoadingShows(false);
            }
        };
        fetchShows();
        return () => {
            isMounted = false;
        };
    }, [initialShowId]);

    useEffect(() => {
        if (selectedShow && initialTaskId) {
            const taskRef = taskRefs.current.get(initialTaskId);
            if (taskRef) {
                setTimeout(() => {
                    taskRef.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    taskRef.classList.add('ring-2', 'ring-purple-500', 'transition-all', 'duration-1000');
                    setTimeout(() => {
                        taskRef.classList.remove('ring-2', 'ring-purple-500');
                    }, 2000);
                }, 100);
            }
        }
    }, [selectedShow, initialTaskId]);

    // Show handlers
    const handleAddShow = async (title: string, description?: string, clientId?: string) => {
        // NOTE: showsService.addShow expects a Partial<Show> object.
        // We intentionally do NOT persist clientId unless your DB schema supports it.
        const newShows = await addShow({
            title,
            description: description || null,
            finances: { performanceFee: 0, expenses: [], income: [] }
        } as any);
        setShows(newShows);
        setIsShowModalOpen(false);
    };
    const handleDeleteShow = async (id: string) => {
        if (window.confirm('Are you sure you want to delete this entire show? This cannot be undone.')) {
            const newShows = await deleteShow(id);
            setShows(newShows);
        }
    };
    const handleUpdateShow = async (showId: string, updates: Partial<Show>) => {
        const newShows = await updateShow(showId, updates);
        setShows(newShows);
        setSelectedShow(newShows.find(s => s.id === showId) || null);
    };
    
    // Task handlers
    const handleAddTask = async (data: any) => {
        if (!selectedShow) return;
        const newShows = await addTaskToShow(selectedShow.id, data);
        setShows(newShows);
        setSelectedShow(newShows.find(s => s.id === selectedShow.id) || null);
        setIsTaskModalOpen(false);
    };
    const handleUpdateTask = async (data: Omit<Task, 'createdAt'>) => {
        if (!selectedShow) return;
        const newShows = await updateTaskInShow(selectedShow.id, data.id, data);
        setShows(newShows);
        setSelectedShow(newShows.find(s => s.id === selectedShow.id) || null);
        setIsTaskModalOpen(false);
        setTaskToEdit(null);
    };
    const handleToggleStatus = async (task: Task) => {
        if (!selectedShow) return;
        const newStatus = task.status === 'To-Do' ? 'Completed' : 'To-Do';
        const newShows = await updateTaskInShow(selectedShow.id, task.id, { status: newStatus });
        setShows(newShows);
        setSelectedShow(newShows.find(s => s.id === selectedShow.id) || null);
    };
    const handleDeleteTask = async (id: string) => {
        if (!selectedShow) return;
        if (window.confirm('Are you sure you want to delete this task?')) {
            const newShows = await deleteTaskFromShow(selectedShow.id, id);
            setShows(newShows);
            setSelectedShow(newShows.find(s => s.id === selectedShow.id) || null);
        }
    };
    
    const handleToggleSubtask = async (taskId: string, subtaskId: string) => {
        if (!selectedShow) return;
        const newShows = await toggleSubtask(selectedShow.id, taskId, subtaskId);
        setShows(newShows);
        setSelectedShow(newShows.find(s => s.id === selectedShow.id) || null);
    };
    
    const openEditModal = (task: Task) => {
        setTaskToEdit(task);
        setIsTaskModalOpen(true);
    };
    
    const generateScriptGuide = () => {
        if (!selectedShow) return;
        const activeTasks = selectedShow.tasks
            .filter(t => t.status === 'To-Do')
            .sort((a, b) => a.createdAt - b.createdAt);

        if (activeTasks.length === 0) {
            setGeneratedScript("No active tasks to generate a script from. Add some tasks first!");
            setIsScriptModalOpen(true);
            return;
        }

        const script = activeTasks.map((task, index) => {
            let segment = `CUE #${index + 1}: ${task.title}\n`;
            if (task.musicCue) segment += `MUSIC: ${task.musicCue}\n`;
            if (task.notes) segment += `\n--- NOTES / SCRIPT ---\n${task.notes}\n`;
            if (task.subtasks && task.subtasks.length > 0) {
                segment += `\n--- SUB-TASKS ---\n${task.subtasks.map(st => `- [ ] ${st.text}`).join('\n')}\n`;
            }
            return segment;
        }).join('\n========================\n\n');
        
        setGeneratedScript(`SHOW SCRIPT & CUE SHEET FOR: ${selectedShow.title}\nGenerated on ${new Date().toLocaleString()}\n\n========================\n\n${script}`);
        setIsScriptModalOpen(true);
    };

    const formatRelativeDate = (timestamp: number) => {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const diffDays = Math.round((timestamp - today) / (1000 * 60 * 60 * 24));

        if (diffDays < 0) return `Overdue by ${-diffDays} day(s)`;
        if (diffDays === 0) return "Due Today";
        if (diffDays === 1) return "Due Tomorrow";
        return `Due in ${diffDays} days`;
    };

    const TaskItem: React.FC<{task: Task}> = ({ task }) => {
        const isOverdue = task.status === 'To-Do' && task.dueDate && task.dueDate < new Date(new Date().toDateString()).getTime();
        const priorityBorders: Record<TaskPriority, string> = { 'High': 'border-l-red-500', 'Medium': 'border-l-amber-400', 'Low': 'border-l-green-500' };
        
        const completedSubtasks = task.subtasks?.filter(st => st.completed).length || 0;
        const totalSubtasks = task.subtasks?.length || 0;
        const progress = totalSubtasks > 0 ? (completedSubtasks / totalSubtasks) * 100 : 0;
        
        return (
             <div ref={el => { taskRefs.current.set(task.id, el); }} className={`p-3 rounded-lg border flex flex-col gap-3 transition-all ${isOverdue ? 'bg-red-900/20 border-red-500/50' : `bg-slate-800 border-slate-700 border-l-4 ${priorityBorders[task.priority]}`}`}>
                <div className="flex items-start gap-3">
                    <input type="checkbox" checked={task.status === 'Completed'} onChange={() => handleToggleStatus(task)} className="mt-1 w-5 h-5 accent-purple-500 bg-slate-900 flex-shrink-0" />
                    <div className="flex-1">
                        <p className={`font-semibold text-slate-200 ${isOverdue ? '!text-red-300' : ''}`}>{task.title}</p>
                        {task.notes && <p className="text-sm text-slate-400 mt-1 whitespace-pre-wrap break-words">{task.notes}</p>}
                    </div>
                    <div className="flex items-center gap-1">
                        <button onClick={() => openEditModal(task)} className="p-2 text-slate-400 hover:text-amber-300 rounded-full hover:bg-slate-700 transition-colors"><PencilIcon className="w-5 h-5"/></button>
                        <button onClick={() => handleDeleteTask(task.id)} className="p-2 text-slate-400 hover:text-red-400 rounded-full hover:bg-slate-700 transition-colors"><TrashIcon className="w-5 h-5"/></button>
                    </div>
                </div>
                {task.subtasks && task.subtasks.length > 0 && (
                    <div className="pl-8 space-y-1">
                        <div className="w-full bg-slate-700 rounded-full h-1.5 mb-2"><div className="bg-purple-500 h-1.5 rounded-full" style={{ width: `${progress}%` }}></div></div>
                        {task.subtasks.map(st => (
                            <div key={st.id} className="flex items-center gap-2">
                                <input type="checkbox" checked={st.completed} onChange={() => handleToggleSubtask(task.id, st.id)} className="w-4 h-4 accent-purple-500 bg-slate-900" />
                                <span className={`text-sm ${st.completed ? 'text-slate-500 line-through' : 'text-slate-300'}`}>{st.text}</span>
                            </div>
                        ))}
                    </div>
                )}
                <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mt-2 text-sm pl-8">
                    <PriorityBadge priority={task.priority} />
                    {task.dueDate && <div className="flex items-center gap-1.5"><CalendarIcon className={`w-4 h-4 ${isOverdue ? 'text-red-400' : 'text-slate-500'}`} /><span className={`font-medium ${isOverdue ? 'text-red-400' : 'text-slate-400'}`}>{formatRelativeDate(task.dueDate)}</span></div>}
                    {task.musicCue && <div className="flex items-center gap-1.5"><MusicNoteIcon className="w-4 h-4 text-slate-500" /><span className="text-slate-400">{task.musicCue}</span></div>}
                </div>
            </div>
        );
    };

    const ShowListView = () => (
        <div className="flex flex-col h-full">
            <header className="p-4 md:px-6 md:pt-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <ChecklistIcon className="w-8 h-8 text-purple-400" />
                        <h2 className="text-2xl font-bold text-slate-200 font-cinzel">All Shows</h2>
                    </div>
                    <button onClick={() => setIsShowModalOpen(true)} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold transition-colors flex items-center gap-2 text-sm"><WandIcon className="w-4 h-4" /><span>Create New Show</span></button>
                </div>
            </header>
            <main className="flex-1 overflow-y-auto p-4 md:p-6">
                {showsError && (
                    <div className="mb-4 p-3 rounded-md bg-red-900/30 border border-red-500/40 text-red-200 text-sm">
                        {showsError}
                    </div>
                )}
                {isLoadingShows ? (
                    <div className="text-center py-12 text-slate-300">Loading shows…</div>
                ) : shows.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {shows.map(show => <ShowListItem key={show.id} show={show} clients={clients} onSelect={() => setSelectedShow(show)} onDelete={() => handleDeleteShow(show.id)} />)}
                    </div>
                ) : (
                    <div className="text-center py-12"><StageCurtainsIcon className="w-16 h-16 mx-auto text-slate-600 mb-4" /><h3 className="text-lg font-bold text-slate-400">Your Stage is Bare</h3><p className="text-slate-500">Click "Create New Show" to start planning your next masterpiece.</p></div>
                )}
            </main>
        </div>
    );
    
    const ShowDetailView = () => {
        if (!selectedShow) return null;
        const [activeTab, setActiveTab] = useState<'tasks' | 'finances' | 'contract' | 'history'>('tasks');
        const [isSuggesting, setIsSuggesting] = useState(false);
        const [suggestionError, setSuggestionError] = useState<string | null>(null);
        const [pastPerformances, setPastPerformances] = useState<Performance[]>([]);
        const [contractRows, setContractRows] = useState<ContractRow[]>([]);
        const [activeContractId, setActiveContractId] = useState<string>('');
        const [activeContractContent, setActiveContractContent] = useState<string>('');
        const [activeContractStatus, setActiveContractStatus] = useState<ContractStatus>('draft');
        const [isLoadingContracts, setIsLoadingContracts] = useState(false);
        const [contractError, setContractError] = useState<string | null>(null);

        const client = clients.find(c => c.id === selectedShow.clientId);

        useEffect(() => {
            if (activeTab === 'history') {
                // FIX: Correctly handle the async call to getPerformancesByShowId.
                const fetchHistory = async () => {
                    const data = await getPerformancesByShowId(selectedShow.id);
                    setPastPerformances(data);
                };
                fetchHistory();
            }

            if (activeTab === 'contract') {
                const fetchContracts = async () => {
                    setIsLoadingContracts(true);
                    setContractError(null);
                    try {
                        const rows = await listContractsForShow(selectedShow.id);
                        setContractRows(rows);

                        const latest = rows?.[0];
                        if (latest) {
                            setActiveContractId(latest.id);
                            setActiveContractContent(latest.content || '');
                            setActiveContractStatus((latest.status || 'draft') as ContractStatus);
                        } else {
                            setActiveContractId('');
                            setActiveContractContent('');
                            setActiveContractStatus('draft');
                        }
                    } catch (e: any) {
                        console.error('Failed to load contracts for show:', e);
                        setContractError(e?.message ? String(e.message) : 'Failed to load contracts.');
                    } finally {
                        setIsLoadingContracts(false);
                    }
                };
                fetchContracts();
            }
        }, [activeTab, selectedShow.id]);

        const tasks = selectedShow.tasks;
        const processedTasks = {
            activeTasks: tasks.filter(t => t.status === 'To-Do'),
            completedTasks: tasks.filter(t => t.status === 'Completed').sort((a,b) => b.createdAt - a.createdAt)
        };
        
        const handleAiSuggestTasks = async () => {
            if (!selectedShow) return;
            setIsSuggesting(true);
            setSuggestionError(null);
            try {
                const prompt = `Show Title: ${selectedShow.title}\nShow Description: ${selectedShow.description || 'N/A'}`;
                const schema = {
                    type: Type.OBJECT,
                    properties: {
                        tasks: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING },
                        },
                    },
                    required: ['tasks']
                };
                // FIX: pass user object to generateStructuredResponse
                const result = await generateStructuredResponse(prompt, AI_TASK_SUGGESTER_SYSTEM_INSTRUCTION, schema, user);
                
                if (result.tasks && Array.isArray(result.tasks)) {
                    const tasksData = result.tasks.map((title: string) => ({ title, priority: 'Medium' as const }));
                    const newShows = await addTasksToShow(selectedShow.id, tasksData);
                    setShows(newShows);
                    setSelectedShow(newShows.find(s => s.id === selectedShow.id) || null);
                } else {
                    throw new Error("AI response did not contain a valid 'tasks' array.");
                }
            } catch (err) {
                setSuggestionError(err instanceof Error ? err.message : "An unknown error occurred.");
            } finally {
                setIsSuggesting(false);
            }
        };

        const ListView = () => {
            const sortedActiveTasks = [...processedTasks.activeTasks].sort((a, b) => {
                if (sortBy === 'priority') return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
                if (sortBy === 'createdAt') return b.createdAt - a.createdAt;
                if (a.dueDate && b.dueDate) return a.dueDate - b.dueDate;
                if (a.dueDate) return -1; if (b.dueDate) return 1; return 0;
            });
            return <div className="space-y-2">{sortedActiveTasks.map(task => <TaskItem key={task.id} task={task} />)}</div>;
        };

        const BoardView = () => {
            const columns: Record<string, Task[]> = {
                'High Priority': processedTasks.activeTasks.filter(t => t.priority === 'High'),
                'Medium Priority': processedTasks.activeTasks.filter(t => t.priority === 'Medium'),
                'Low Priority': processedTasks.activeTasks.filter(t => t.priority === 'Low'),
            };
            const columnStyles: Record<string, string> = { 'High Priority': 'border-t-red-500', 'Medium Priority': 'border-t-amber-400', 'Low Priority': 'border-t-green-500' };
            return (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {Object.entries(columns).map(([title, tasksInColumn]) => (
                        <div key={title} className={`bg-slate-900/50 rounded-lg border-t-4 ${columnStyles[title]}`}>
                            <h3 className="font-cinzel font-bold text-slate-300 p-3 text-base border-b-2 border-slate-700/50">{title} <span className="text-sm font-normal text-slate-500">({tasksInColumn.length})</span></h3>
                            <div className="p-3 space-y-3">{tasksInColumn.length > 0 ? tasksInColumn.map(task => <TaskItem key={task.id} task={task} />) : <div className="text-center py-6 text-sm text-slate-500">No tasks here.</div>}</div>
                        </div>
                    ))}
                </div>
            );
        };

        const TabButton: React.FC<{ icon: React.FC<any>, label: string, isActive: boolean, onClick: () => void }> = ({ icon: Icon, label, isActive, onClick }) => (
            <button onClick={onClick} className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${isActive ? 'border-b-2 border-purple-400 text-purple-300' : 'border-b-2 border-transparent text-slate-400 hover:text-white'}`}>
                <Icon className="w-5 h-5" />
                <span>{label}</span>
            </button>
        );
        
        return (
             <div className="flex flex-col h-full">
                <header className="p-4 md:px-6 md:pt-6">
                    <button onClick={() => setSelectedShow(null)} className="flex items-center gap-2 mb-4 text-slate-300 hover:text-white transition-colors"><BackIcon className="w-5 h-5" /><span>Back to All Shows</span></button>
                    <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-200 font-cinzel truncate">{selectedShow.title}</h2>
                            {client && <p className="text-sm text-slate-400 flex items-center gap-2"><UsersIcon className="w-4 h-4" /> {client.name}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setIsAudienceQrModalOpen(true)} className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-md text-white font-semibold transition-colors flex items-center gap-2 text-sm" title="Generate a post-show feedback QR code"><QrCodeIcon className="w-4 h-4" /><span>Audience QR</span></button>
                            <button onClick={() => setIsLiveModalOpen(true)} className="px-3 py-2 bg-green-600 hover:bg-green-700 rounded-md text-white font-semibold transition-colors flex items-center gap-2 text-sm"><QrCodeIcon className="w-4 h-4" /><span>Start Live Show</span></button>
                            <button onClick={handleAiSuggestTasks} disabled={isSuggesting} className="px-3 py-2 rounded-md bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold flex items-center gap-2 transition-colors"><WandIcon className="w-4 h-4" /><span>{isSuggesting ? 'Thinking...' : 'AI-Suggest Tasks'}</span></button>
                            <button onClick={generateScriptGuide} className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200 font-semibold transition-colors flex items-center gap-2 text-sm"><FileTextIcon className="w-4 h-4" /><span>Script Guide</span></button>
                            <button onClick={() => { setTaskToEdit(null); setIsTaskModalOpen(true); }} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold transition-colors flex items-center gap-2 text-sm"><ChecklistIcon className="w-4 h-4" /><span>Add Task</span></button>
                        </div>
                    </div>
                    {suggestionError && <p className="text-red-400 text-center text-sm mb-2">{suggestionError}</p>}
                    <div className="bg-slate-800/50 border-y border-slate-700 -mx-4 md:-mx-6 px-4 md:px-6 flex items-center justify-between">
                         <div className="flex items-center">
                            <TabButton icon={ChecklistIcon} label="Tasks" isActive={activeTab === 'tasks'} onClick={() => setActiveTab('tasks')} />
                            <TabButton icon={DollarSignIcon} label="Finances" isActive={activeTab === 'finances'} onClick={() => setActiveTab('finances')} />
                            <TabButton icon={FileTextIcon} label="Contract" isActive={activeTab === 'contract'} onClick={() => setActiveTab('contract')} />
                            <TabButton icon={AnalyticsIcon} label="Performance History" isActive={activeTab === 'history'} onClick={() => setActiveTab('history')} />
                        </div>
                        {activeTab === 'tasks' && <div className="bg-slate-700 p-1 rounded-md flex items-center"><button onClick={() => setViewMode('board')} className={`flex items-center gap-2 px-3 py-1 text-sm font-medium rounded transition-colors ${viewMode === 'board' ? 'bg-purple-600 text-white' : 'text-slate-300 hover:bg-slate-600'}`}><ViewGridIcon className="w-4 h-4" />Board</button><button onClick={() => setViewMode('list')} className={`flex items-center gap-2 px-3 py-1 text-sm font-medium rounded transition-colors ${viewMode === 'list' ? 'bg-purple-600 text-white' : 'text-slate-300 hover:bg-slate-600'}`}><ViewListIcon className="w-4 h-4" />List</button></div>}
                        {activeTab === 'tasks' && viewMode === 'list' && (<div className="flex items-center gap-2"><label htmlFor="sort-by" className="text-sm font-medium text-slate-400">Sort By</label><select id="sort-by" value={sortBy} onChange={e => setSortBy(e.target.value as any)} className="bg-slate-700 text-white text-sm rounded-md py-1 px-2 border border-slate-600"><option value="dueDate">Due Date</option><option value="priority">Priority</option><option value="createdAt">Created Date</option></select></div>)}
                    </div>
                </header>
                <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-4 pt-4">
                    {activeTab === 'tasks' ? (
                        tasks.length === 0 ? <div className="text-center py-10 text-slate-400"><p className="mb-3">No tasks yet. Click <span className="text-slate-200 font-semibold">Add Task</span> to get started.</p><button onClick={handleAiSuggestTasks} disabled={isSuggesting} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold transition-colors"><WandIcon className="w-4 h-4" /><span>{isSuggesting ? 'Thinking...' : 'AI-Suggest Tasks'}</span></button></div> : viewMode === 'list' ? <ListView /> : <BoardView />

                    
                    ) : activeTab === 'finances' ? (
                        <FinanceTracker show={selectedShow} onUpdate={(updates) => handleUpdateShow(selectedShow.id, updates)} />
                    ) : activeTab === 'contract' ? (
                        <div className="space-y-4">
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <div className="text-slate-300 text-sm font-semibold">Version</div>
                                    <select
                                        value={activeContractId}
                                        onChange={(e) => {
                                            const id = e.target.value;
                                            setActiveContractId(id);
                                            const row = contractRows.find(r => r.id === id);
                                            if (row) {
                                                setActiveContractContent(row.content || '');
                                                setActiveContractStatus((row.status || 'draft') as ContractStatus);
                                            }
                                        }}
                                        className="bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-slate-200 text-sm"
                                        disabled={isLoadingContracts || contractRows.length === 0}
                                        title={contractRows.length === 0 ? 'No saved contracts yet' : 'Select a saved contract version'}
                                    >
                                        {contractRows.length === 0 ? (
                                            <option value="">No contracts</option>
                                        ) : (
                                            contractRows
                                                .slice()
                                                .sort((a, b) => (b.version ?? 0) - (a.version ?? 0))
                                                .map((r) => (
                                                    <option key={r.id} value={r.id}>
                                                        v{r.version} ({r.status})
                                                    </option>
                                                ))
                                        )}
                                    </select>

                                    <span
                                        className={`px-2 py-1 rounded-full text-xs font-semibold border ${
                                            activeContractStatus === 'signed'
                                                ? 'bg-green-500/15 text-green-300 border-green-500/30'
                                                : activeContractStatus === 'sent'
                                                ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                                                : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                        }`}
                                        title="Contract status"
                                    >
                                        {activeContractStatus.toUpperCase()}
                                    </span>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => {
                                            if (!activeContractContent) return;
                                            navigator.clipboard.writeText(activeContractContent);
                                        }}
                                        className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-100 text-sm"
                                        title="Copy contract text"
                                    >
                                        <CopyIcon className="w-4 h-4" />
                                        Copy
                                    </button>

                                    <button
                                        disabled
                                        className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-slate-800 text-slate-500 text-sm cursor-not-allowed"
                                        title="PDF download coming soon"
                                    >
                                        <FileTextIcon className="w-4 h-4" />
                                        Download PDF (Soon)
                                    </button>

                                    <button
                                        onClick={async () => {
                                            if (!activeContractId) return;
                                            try {
                                                const updated = await updateContractStatus(activeContractId, 'sent');
                                                setActiveContractStatus((updated.status || 'sent') as ContractStatus);
                                                const rows = await listContractsForShow(selectedShow.id);
                                                setContractRows(rows);
                                            } catch (e) {
                                                console.error(e);
                                                setContractError('Failed to update status to SENT.');
                                            }
                                        }}
                                        disabled={!activeContractId}
                                        className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-blue-700 hover:bg-blue-600 disabled:bg-slate-800 disabled:text-slate-500 text-white text-sm"
                                        title="Mark as Sent"
                                    >
                                        Mark Sent
                                    </button>

                                    <button
                                        onClick={async () => {
                                            if (!activeContractId) return;
                                            try {
                                                const updated = await updateContractStatus(activeContractId, 'signed');
                                                setActiveContractStatus((updated.status || 'signed') as ContractStatus);
                                                const rows = await listContractsForShow(selectedShow.id);
                                                setContractRows(rows);
                                            } catch (e) {
                                                console.error(e);
                                                setContractError('Failed to update status to SIGNED.');
                                            }
                                        }}
                                        disabled={!activeContractId}
                                        className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-green-700 hover:bg-green-600 disabled:bg-slate-800 disabled:text-slate-500 text-white text-sm"
                                        title="Mark as Signed"
                                    >
                                        Mark Signed
                                    </button>
                                </div>
                            </div>

                            {contractError && (
                                <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-md p-3">
                                    {contractError}
                                </div>
                            )}

                            <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-4 min-h-[280px]">
                                {isLoadingContracts ? (
                                    <div className="text-slate-400">Loading contracts…</div>
                                ) : !activeContractContent ? (
                                    <div className="text-slate-400">
                                        No saved contract for this show yet. Generate one in the Contract Generator and click <span className="text-slate-200 font-semibold">Save to Show</span>.
                                    </div>
                                ) : (
                                    <pre className="whitespace-pre-wrap text-slate-200 text-sm leading-relaxed">
{activeContractContent}
                                    </pre>
                                )}
                            </div>
                        </div>
                    ) : (
                        <PerformanceHistory performances={pastPerformances} onNavigateToAnalytics={onNavigateToAnalytics} />
                    )}
                        
                </div>
            </div>
        );
    };
    
    
const ShowModal: React.FC<{
    onSave: (title: string, description?: string, clientId?: string) => Promise<void>;
    onClose: () => void;
}> = ({ onSave, onClose }) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [clientId, setClientId] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        e?.stopPropagation();
        setError(null);
        if (!title.trim()) {
            setError('Show title is required.');
            return;
        }
        try {
            setIsSaving(true);
            await onSave(title.trim(), description.trim() || undefined, clientId || undefined);
        } catch (err: any) {
            console.error('Create show failed:', err);
            setError(err?.message ?? 'Create show failed.');
            return;
        } finally {
            setIsSaving(false);
        }
    };

    if (typeof document === 'undefined') return null;

    return createPortal(
        <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-[999] motion-reduce:animate-none animate-fade-in"
            onClick={onClose}
        >
            <div
                className="w-full max-w-md bg-slate-800 border border-purple-500 rounded-lg shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <h2 className="text-xl font-bold text-white">Create New Show</h2>

                    {error && (
                        <div className="p-3 rounded-md bg-red-900/30 border border-red-500/40 text-red-200 text-sm">
                            {error}
                        </div>
                    )}

                    <div>
                        <label htmlFor="show-title" className="block text-sm font-medium text-slate-300 mb-1">
                            Show Title
                        </label>
                        <input
                            id="show-title"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white"
                            placeholder="e.g., Birthday Party Show"
                            autoFocus
                        />
                    </div>

                    <div>
                        <label htmlFor="show-desc" className="block text-sm font-medium text-slate-300 mb-1">
                            Description (Optional)
                        </label>
                        <textarea
                            id="show-desc"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white h-24"
                            placeholder="Notes about this show..."
                        />
                    </div>

                    <div>
                        <label htmlFor="show-client" className="block text-sm font-medium text-slate-300 mb-1">
                            Client (Optional)
                        </label>
                        <select
                            id="show-client"
                            value={clientId}
                            onChange={(e) => setClientId(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white"
                        >
                            <option value="">No Client</option>
                            {clients.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-md text-white font-bold"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSaving || !title.trim()}
                            className={`flex-1 px-4 py-2 rounded-md text-white font-bold ${
                                (isSaving || !title.trim()) ? 'bg-slate-700 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700'
                            }`}
                            title={!title.trim() ? 'Show title required' : undefined}
                        >
                            Create Show
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
};
return (
        <>
            {isTaskModalOpen && <TaskModal onClose={() => { setIsTaskModalOpen(false); setTaskToEdit(null); }} onSave={taskToEdit ? handleUpdateTask : handleAddTask} taskToEdit={taskToEdit} user={user} />}
            {isScriptModalOpen && <ScriptGuideModal script={generatedScript} onClose={() => setIsScriptModalOpen(false)} />}
            {isShowModalOpen && <ShowModal onClose={() => setIsShowModalOpen(false)} onSave={handleAddShow} />}
            {isLiveModalOpen && selectedShow && <LivePerformanceModal show={selectedShow} onClose={() => setIsLiveModalOpen(false)} onEnd={(id) => { setIsLiveModalOpen(false); onNavigateToAnalytics(id); }} />}
            {isAudienceQrModalOpen && selectedShow && <AudienceFeedbackQrModal show={selectedShow} onClose={() => setIsAudienceQrModalOpen(false)} />}
            {selectedShow ? <ShowDetailView /> : <ShowListView />}

            {toastMsg && (
                <div className="fixed bottom-6 right-6 z-[9999] bg-slate-900/95 text-white px-4 py-2 rounded-lg shadow-lg border border-white/10">
                    {toastMsg}
                </div>
            )}
        </>
    );
};

const ShowListItem: React.FC<{show: Show, clients: Client[], onSelect: () => void, onDelete: () => void}> = ({ show, clients, onSelect, onDelete }) => {
    const completedTasks = show.tasks.filter(t => t.status === 'Completed').length;
    const totalTasks = show.tasks.length;
    const progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
    const client = clients.find(c => c.id === show.clientId);

    return (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 flex flex-col justify-between transition-all hover:border-purple-500 hover:shadow-lg hover:shadow-purple-900/20">
            <div>
                <div className="flex justify-between items-start gap-2">
                    <div>
                        <h3 className="font-cinzel font-bold text-lg text-white mb-1 pr-10">{show.title}</h3>
                        {client && <p className="text-xs text-slate-400 flex items-center gap-1"><UsersIcon className="w-3 h-3" /> {client.name}</p>}
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="p-2 -mt-1 -mr-1 text-slate-400 hover:text-red-400 rounded-full hover:bg-slate-700 transition-colors"><TrashIcon className="w-5 h-5"/></button>
                </div>
                <p className="text-sm text-slate-400 line-clamp-2 min-h-[2.5rem] mt-2">{show.description || 'No description'}</p>
            </div>
            <div className="mt-4">
                <div className="flex justify-between items-center text-xs text-slate-400 mb-1">
                    <span>Progress</span>
                    <span>{completedTasks} / {totalTasks} Tasks</span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-2"><div className="bg-purple-500 h-2 rounded-full" style={{ width: `${progress}%` }}></div></div>
                <button onClick={onSelect} className="w-full text-center mt-4 py-2 px-4 bg-slate-700/50 hover:bg-purple-800 rounded-md text-white font-bold transition-colors">Open Planner</button>
            </div>
        </div>
    );
};


const FinanceTracker: React.FC<{ show: Show; onUpdate: (updates: Partial<Show>) => void }> = ({ show, onUpdate }) => {
    type MoneyEntry = { id: string; description: string; amount: number; createdAt?: number };

    const finances = useMemo(
        () =>
            (show.finances as any) || {
                performanceFee: 0,
                expenses: [],
                income: []
            },
        [show.finances]
    );

    const performanceFee = Number(finances.performanceFee || 0);
    const expenses: MoneyEntry[] = Array.isArray(finances.expenses) ? finances.expenses : [];
    const income: MoneyEntry[] = Array.isArray(finances.income) ? finances.income : [];

    const [fee, setFee] = useState<string>(String(performanceFee ?? 0));

    // Add/Edit modal state
    const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
    const [entryMode, setEntryMode] = useState<'add' | 'edit'>('add');
    const [entryType, setEntryType] = useState<'income' | 'expense'>('expense');
    const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
    const [entryDesc, setEntryDesc] = useState('');
    const [entryAmount, setEntryAmount] = useState('');

    const totalExpenses = useMemo(() => expenses.reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0), [expenses]);
    const totalIncome = useMemo(() => income.reduce((sum, inc) => sum + (Number(inc.amount) || 0), 0) + performanceFee, [income, performanceFee]);
    const netProfit = useMemo(() => totalIncome - totalExpenses, [totalIncome, totalExpenses]);

    const formatMoney = (value: number) =>
        value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });


    const formatToFixed2 = (raw: string) => {
        const n = parseFloat(raw);
        if (!Number.isFinite(n)) return '';
        return n.toFixed(2);
    };

    const getEntryTs = (entry: MoneyEntry) => {
        if (typeof entry.createdAt === 'number') return entry.createdAt;
        const match = String(entry.id).match(/-(\d{10,})$/);
        if (match) return parseInt(match[1], 10);
        return 0;
    };

    const sortedExpenses = useMemo(() => [...expenses].sort((a, b) => getEntryTs(b) - getEntryTs(a)), [expenses]);
    const sortedIncome = useMemo(() => [...income].sort((a, b) => getEntryTs(b) - getEntryTs(a)), [income]);

    const openAddEntry = (type: 'income' | 'expense') => {
        setEntryMode('add');
        setEntryType(type);
        setEditingEntryId(null);
        setEntryDesc('');
        setEntryAmount('');
        setIsEntryModalOpen(true);
    };

    const openEditEntry = (type: 'income' | 'expense', entry: MoneyEntry) => {
        setEntryMode('edit');
        setEntryType(type);
        setEditingEntryId(entry.id);
        setEntryDesc(entry.description || '');
        setEntryAmount(String(entry.amount ?? ''));
        setIsEntryModalOpen(true);
    };

    const closeEntryModal = () => {
        setIsEntryModalOpen(false);
        setEntryDesc('');
        setEntryAmount('');
        setEditingEntryId(null);
    };

    const handleFeeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFee(e.target.value);
    };

    const handleFeeUpdate = () => {
        const n = parseFloat(fee);
        onUpdate({ finances: { ...finances, performanceFee: Number.isFinite(n) ? n : 0 } });
    };

    const saveEntry = () => {
        const amount = parseFloat(entryAmount);
        if (!entryDesc.trim() || !Number.isFinite(amount)) return;

        const now = Date.now();

        const newEntry: MoneyEntry = {
            id: entryMode === 'edit' && editingEntryId ? editingEntryId : `${entryType}-${now}`,
            description: entryDesc.trim(),
            amount,
            createdAt: entryMode === 'edit' ? (getEntryTs({ id: editingEntryId || '', description: '', amount } as any) || now) : now
        };

        if (entryType === 'expense') {
            const next = entryMode === 'edit'
                ? expenses.map(e => (e.id === newEntry.id ? newEntry : e))
                : [...expenses, newEntry];
            onUpdate({ finances: { ...finances, expenses: next } });
        } else {
            const next = entryMode === 'edit'
                ? income.map(i => (i.id === newEntry.id ? newEntry : i))
                : [...income, newEntry];
            onUpdate({ finances: { ...finances, income: next } });
        }

        closeEntryModal();
    };

    const deleteEntry = (type: 'income' | 'expense', id: string) => {
        if (type === 'expense') {
            onUpdate({ finances: { ...finances, expenses: expenses.filter(e => e.id !== id) } });
        } else {
            onUpdate({ finances: { ...finances, income: income.filter(i => i.id !== id) } });
        }
    };

    const SummaryCard = (
        <div className="bg-slate-900/40 border border-slate-700 rounded-xl p-4 md:p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h3 className="text-lg font-bold text-white">Finances</h3>
                    <p className="text-sm text-slate-400">Track income, expenses, and profit for this show.</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => openAddEntry('income')}
                        className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-md text-white font-semibold text-sm transition-colors"
                    >
                        + Add Income
                    </button>
                    <button
                        type="button"
                        onClick={() => openAddEntry('expense')}
                        className="px-3 py-2 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-semibold text-sm transition-colors"
                    >
                        + Add Expense
                    </button>
                </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-slate-800/70 border border-slate-700 rounded-lg p-3 flex items-center justify-between">
                    <span className="text-sm text-slate-300">Total Income</span>
                    <span className="text-sm font-bold text-slate-100">${formatMoney(totalIncome)}</span>
                </div>
                <div className="bg-slate-800/70 border border-slate-700 rounded-lg p-3 flex items-center justify-between">
                    <span className="text-sm text-slate-300">Total Expenses</span>
                    <span className="text-sm font-bold text-slate-100">${formatMoney(totalExpenses)}</span>
                </div>
                <div className="bg-slate-800/70 border border-slate-700 rounded-lg p-3 flex items-center justify-between">
                    <span className="text-sm text-slate-300">Net</span>
                    <span className={`text-sm font-bold ${netProfit >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                        {netProfit >= 0 ? '+' : '-'}${formatMoney(Math.abs(netProfit))}
                    </span>
                </div>
            </div>
        </div>
    );

    const EntryList = ({ type, title, items }: { type: 'income' | 'expense'; title: string; items: MoneyEntry[] }) => (
        <div className="bg-slate-900/40 border border-slate-700 rounded-xl">
            <div className="p-4 flex items-center justify-between">
                <h4 className="text-base font-bold text-white">{title}</h4>
                <button
                    type="button"
                    onClick={() => openAddEntry(type)}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md text-slate-100 text-sm font-semibold transition-colors"
                >
                    + Add
                </button>
            </div>

            <div className="border-t border-slate-700">
                {items.length === 0 ? (
                    <div className="p-6 text-center">
                        <p className="text-sm text-slate-400">
                            No {type === 'income' ? 'income' : 'expense'} entries yet.
                        </p>
                        <button
                            type="button"
                            onClick={() => openAddEntry(type)}
                            className="mt-3 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-semibold text-sm transition-colors"
                        >
                            + Add {type === 'income' ? 'Income' : 'Expense'}
                        </button>
                    </div>
                ) : (
                    <div className="max-h-80 overflow-y-auto">
                        {items.map((entry) => (
                            <div
                                key={entry.id}
                                onClick={() => openEditEntry(type, entry)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        openEditEntry(type, entry);
                                    }
                                }}
                                className="p-3 flex items-center justify-between gap-3 border-b border-slate-800 hover:bg-slate-800/60 transition-colors cursor-pointer"
                            >
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-slate-200 truncate">{entry.description}</p>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <span className={`text-sm font-bold ${type === 'income' ? 'text-emerald-300' : 'text-red-300'}`}>
                                        {type === 'income' ? '+' : '-'}${formatMoney(Math.abs(Number(entry.amount) || 0))}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            deleteEntry(type, entry.id);
                                        }}
                                        className="p-2 rounded-md text-slate-400 hover:text-red-300 hover:bg-slate-900/60 transition-colors"
                                        aria-label="Delete entry"
                                    >
                                        <TrashIcon className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );

    return (
        <div className="space-y-6">
            {SummaryCard}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <EntryList type="expense" title="Expenses" items={sortedExpenses} />
                    <EntryList type="income" title="Additional Income" items={sortedIncome} />
                </div>

                <div className="space-y-6">
                    <div className="bg-slate-900/40 border border-slate-700 rounded-xl p-4">
                        <h4 className="text-base font-bold text-white mb-3">Performance Fee</h4>
                        <p className="text-sm text-slate-400 mb-3">Your primary fee for performing this show.</p>
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                inputMode="decimal"
                                value={fee}
                                onChange={handleFeeChange}
                                onBlur={() => setFee((prev) => (prev.trim() === "" ? "" : formatToFixed2(prev)))}
                                className="flex-1 bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-sm text-white"
                                placeholder="0.00"
                            />
                            <button
                                type="button"
                                onClick={handleFeeUpdate}
                                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md text-white font-semibold text-sm transition-colors"
                            >
                                Save
                            </button>
                        </div>
                    </div>

                    <div className="bg-slate-900/40 border border-slate-700 rounded-xl p-4">
                        <h4 className="text-base font-bold text-white mb-2">At a Glance</h4>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between text-slate-300">
                                <span>Income</span>
                                <span className="text-slate-100 font-semibold">${formatMoney(totalIncome)}</span>
                            </div>
                            <div className="flex justify-between text-slate-300">
                                <span>Expenses</span>
                                <span className="text-slate-100 font-semibold">${formatMoney(totalExpenses)}</span>
                            </div>
                            <div className={`flex justify-between font-bold ${netProfit >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                                <span>Net</span>
                                <span>{netProfit >= 0 ? '+' : '-'}${formatMoney(Math.abs(netProfit))}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {isEntryModalOpen && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
                    <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg p-5">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h3 className="text-lg font-bold text-white">
                                    {entryMode === 'add' ? 'Add' : 'Edit'} {entryType === 'income' ? 'Income' : 'Expense'}
                                </h3>
                                <p className="text-sm text-slate-400">
                                    {entryType === 'income' ? 'Record additional income for this show.' : 'Track a cost related to this show.'}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={closeEntryModal}
                                className="p-2 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                                aria-label="Close"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="mt-4 space-y-3">
                            <div>
                                <label className="block text-sm font-semibold text-slate-300">Description</label>
                                <input
                                    type="text"
                                    value={entryDesc}
                                    onChange={(e) => setEntryDesc(e.target.value)}
                                    className="mt-1 w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-sm text-white"
                                    placeholder={entryType === 'income' ? 'Ticket sales, merch, add-on…' : 'Props, travel, marketing…'}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-300">Amount</label>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    value={entryAmount}
                                    onChange={(e) => setEntryAmount(e.target.value)}
                                    onBlur={() => setEntryAmount((prev) => (prev.trim() === "" ? "" : formatToFixed2(prev)))}
                                    className="mt-1 w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-sm text-white"
                                    placeholder="0.00"
                                />
                                <p className="text-xs text-slate-400 mt-1">Enter the amount in dollars. Use positive numbers.</p>
                            </div>
                        </div>

                        <div className="mt-5 flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={closeEntryModal}
                                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md text-white font-semibold text-sm transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={saveEntry}
                                disabled={!entryDesc.trim() || !entryAmount}
                                className={`px-4 py-2 rounded-md text-white font-semibold text-sm transition-colors ${
                                    !entryDesc.trim() || !entryAmount ? 'bg-slate-700 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700'
                                }`}
                            >
                                {entryMode === 'add' ? 'Add' : 'Save'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const PerformanceHistory: React.FC<{ performances: Performance[], onNavigateToAnalytics: (id: string) => void }> = ({ performances, onNavigateToAnalytics }) => {
    if (performances.length === 0) {
        return <div className="text-center py-12"><AnalyticsIcon className="w-16 h-16 mx-auto text-slate-600 mb-4" /><h3 className="text-lg font-bold text-slate-400">No Performance History</h3><p className="text-slate-500">Performances with live feedback will be logged here.</p></div>;
    }
    return (
        <div className="space-y-3">
            {performances.map(perf => (
                <button key={perf.id} onClick={() => onNavigateToAnalytics(perf.id)} className="w-full text-left p-3 bg-slate-800 hover:bg-purple-900/50 border border-slate-700 rounded-lg transition-colors">
                    <p className="font-semibold text-slate-200">Performance on {new Date(perf.startTime).toLocaleString()}</p>
                    <p className="text-sm text-slate-400">{perf.reactions.length} reactions recorded</p>
                </button>
            ))}
        </div>
    );
};

const LivePerformanceModal: React.FC<{ show: Show; onClose: () => void; onEnd: (performanceId: string) => void }> = ({ show, onClose, onEnd }) => {
    const [performance, setPerformance] = useState<Performance | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        // FIX: Correctly resolve the async startPerformance call.
        const initPerformance = async () => {
            const perf = await startPerformance(show.id);
            setPerformance(perf);
            const url = `${window.location.origin}?mode=live-feedback&performanceId=${perf.id}`;
            if (canvasRef.current) {
                QRCode.toCanvas(canvasRef.current, url, { width: 256, color: { dark: '#e2e8f0', light: '#0000' } }, (error) => {
                    if (error) console.error(error);
                });
            }
        };
        initPerformance();
    }, [show.id]);

    const handleEnd = async () => {
        if (performance) {
            // FIX: Added await to correctly resolve endPerformance().
            await endPerformance(performance.id);
            onEnd(performance.id);
        }
    };

    return createPortal(
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={onClose}>
            <div className="w-full max-w-md bg-slate-800 border border-purple-500 rounded-lg shadow-2xl text-center p-8" onClick={(e) => e.stopPropagation()}>
                <QrCodeIcon className="w-12 h-12 mx-auto mb-2 text-purple-400" />
                <h2 className="text-2xl font-bold text-white font-cinzel">Live Performance Mode</h2>
                <p className="text-slate-400 mt-2 mb-4">Display this QR code to your audience. They can scan it to provide real-time feedback during the show.</p>
                <div className="bg-slate-900 p-4 rounded-lg inline-block border border-slate-700">
                    {performance ? <canvas ref={canvasRef} /> : <p>Generating QR Code...</p>}
                </div>
                <button onClick={handleEnd} className="w-full mt-6 py-3 bg-red-600 hover:bg-red-700 rounded-md text-white font-bold transition-colors">End Show & View Analytics</button>
            </div>
        </div>,
        document.body
    );
};

const AudienceFeedbackQrModal: React.FC<{ show: Show; onClose: () => void }> = ({ show, onClose }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [url, setUrl] = useState('');
    const [copied, setCopied] = useState(false);


    useEffect(() => {
        // Generate the feedback URL first so the <canvas> mounts.
        setUrl(buildShowFeedbackUrl(show.id));
    }, [show.id]);

    useEffect(() => {
        // Draw (or redraw) the QR once the URL is set and the canvas exists.
        if (!url || !canvasRef.current) return;
        QRCode.toCanvas(
            canvasRef.current,
            url,
            { width: 256, color: { dark: '#e2e8f0', light: '#0000' } },
            (error) => {
                if (error) console.error(error);
            }
        );
    }, [url]);
    const handleCopy = async () => {
        if (!url) return;
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        } catch {
            // ignore
        }
    };

    const handleRotate = async () => {
        try {
            // Rotate token, update URL; the QR redraw happens in the [url] effect above.
            setUrl(buildShowFeedbackUrl(show.id, rotateShowFeedbackToken(show.id)));
        } catch {
            // ignore
        }
    };

    return createPortal(
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={onClose}>
            <div className="w-full max-w-md bg-slate-800 border border-purple-500 rounded-lg shadow-2xl text-center p-8" onClick={(e) => e.stopPropagation()}>
                <QrCodeIcon className="w-12 h-12 mx-auto mb-2 text-purple-400" />
                <h2 className="text-2xl font-bold text-white font-cinzel">Post‑Show Feedback</h2>
                <p className="text-slate-400 mt-2 mb-4">
                    Display this QR code after the show. Audience members can scan it to leave a quick rating and comments.
                </p>
                <div className="bg-slate-900 p-4 rounded-lg inline-block border border-slate-700">
                    {url ? <canvas ref={canvasRef} /> : <p>Generating QR Code...</p>}
                </div>
                <div className="mt-5 flex gap-2">
                    <button onClick={handleCopy} className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 rounded-md text-white font-bold transition-colors">
                        {copied ? 'Copied!' : 'Copy Link'}
                    </button>
                    <button onClick={handleRotate} className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 rounded-md text-white font-bold transition-colors" title="Invalidate old QR links and create a new one">
                        Rotate Link
                    </button>
                </div>
                <button onClick={onClose} className="w-full mt-3 py-2 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold transition-colors">Done</button>
            </div>
        </div>,
        document.body
    );
};


export default ShowPlanner;