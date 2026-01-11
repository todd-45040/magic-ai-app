
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Type } from '@google/genai';
import QRCode from 'qrcode';
import type { Show, Task, Subtask, TaskPriority, Client, Finances, Expense, Performance, User } from '../types';
import { getShows, addShow, updateShow, deleteShow, addTaskToShow, updateTaskInShow, deleteTaskFromShow, toggleSubtask, addTasksToShow } from '../services/showsService';
import { startPerformance, endPerformance, getPerformancesByShowId } from '../services/performanceService';
import { generateResponse, generateStructuredResponse } from '../services/geminiService';
import { AI_TASK_SUGGESTER_SYSTEM_INSTRUCTION, IN_TASK_PATTER_SYSTEM_INSTRUCTION } from '../constants';
import { ChecklistIcon, TrashIcon, WandIcon, PencilIcon, CalendarIcon, ViewGridIcon, ViewListIcon, FileTextIcon, CopyIcon, CheckIcon, MusicNoteIcon, BackIcon, StageCurtainsIcon, DollarSignIcon, UsersIcon, QrCodeIcon, AnalyticsIcon } from './icons';
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
    onSave: (data: any) => void;
    taskToEdit?: Task | null;
    user: User;
}> = ({ onClose, onSave, taskToEdit, user }) => {
    const [title, setTitle] = useState('');
    const [notes, setNotes] = useState('');
    const [priority, setPriority] = useState<TaskPriority>('Medium');
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

    const handleSubmit = (e: React.FormEvent) => {
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
            dueDate: dueDate ? new Date(dueDate + 'T00:00:00').getTime() : undefined
        };

        if (taskToEdit) {
            onSave({ ...taskData, id: taskToEdit.id });
        } else {
            onSave(taskData);
        }
    };

    const modalTitle = taskToEdit ? 'Edit Task' : 'Add New Task';
    const buttonText = taskToEdit ? 'Save Changes' : 'Add Task';
    
    const modalContent = (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in" onClick={onClose}>
            <div className="w-full max-w-lg bg-slate-800 border border-purple-500 rounded-lg shadow-2xl flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-xl font-bold text-white p-6 border-b border-slate-700 flex-shrink-0">{modalTitle}</h2>
                <form id="task-form" onSubmit={handleSubmit} onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        const target = e.target as HTMLElement;
                        const tag = target.tagName.toLowerCase();
                        const isTextArea = tag === "textarea";
                        const canSubmit = !!title.trim();
                        if (!canSubmit) return;
                        // Allow normal Enter behavior in textarea unless Ctrl/Cmd is held.
                        if (isTextArea && !(e.ctrlKey || e.metaKey)) return;
                        e.preventDefault();
                        handleSubmit(e as any);
                    }} className="flex-1 overflow-y-auto p-6 space-y-4">
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
                        <textarea id="notes" rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g., Prop list, patter cues..." className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white focus:outline-none focus:border-purple-500" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="priority" className="block text-sm font-medium text-slate-300 mb-1">Priority</label>
                            <select id="priority" value={priority} onChange={e => setPriority(e.target.value as TaskPriority)} className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white focus:outline-none focus:border-purple-500">
                                <option>High</option><option>Medium</option><option>Low</option>
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
                            <input type="text" value={newSubtaskText} onChange={e => setNewSubtaskText(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddSubtask())} placeholder="Add a new sub-task..." className="flex-1 w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white focus:outline-none focus:border-purple-500" />
                            <button type="button" onClick={handleAddSubtask} className="px-4 py-2 bg-slate-600 hover:bg-slate-700 rounded-md text-white font-semibold text-sm">Add</button>
                        </div>
                    </div>
                </form>
                <div className="flex gap-3 p-6 flex-shrink-0 bg-slate-800 border-t border-slate-700">
                    <button type="button" onClick={onClose} className="w-full py-2 px-4 bg-slate-600/50 hover:bg-slate-700 rounded-md text-slate-300 font-bold transition-colors">Cancel</button>
                    <button type="submit" form="task-form" disabled={!title.trim()} title={!title.trim() ? "Task title required" : undefined} className={`w-full py-2 px-4 rounded-md text-white font-bold transition-colors ${!title.trim() ? "bg-slate-600 cursor-not-allowed opacity-70" : "bg-purple-600 hover:bg-purple-700"}`}>{buttonText}</button>
                    {!title.trim() && <p className="text-xs text-slate-400 mt-2 text-center">Task title required</p>}
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
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in" onClick={onClose}>
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
    const [selectedShow, setSelectedShow] = useState<Show | null>(null);
    const [viewMode, setViewMode] = useState<ViewMode>('board');
    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
    const [isScriptModalOpen, setIsScriptModalOpen] = useState(false);
    const [isShowModalOpen, setIsShowModalOpen] = useState(false);
    const [isLiveModalOpen, setIsLiveModalOpen] = useState(false);
    const [generatedScript, setGeneratedScript] = useState('');
    const [taskToEdit, setTaskToEdit] = useState<Task | null>(null);
    const [sortBy, setSortBy] = useState<SortBy>('dueDate');
    const taskRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());

     // Keyboard shortcuts:
     // Esc: close modal / back to All Shows
     // Cmd/Ctrl+N: new task (when a show is open)
     useEffect(() => {
         const onKeyDown = (e: KeyboardEvent) => {
             if (e.key === 'Escape') {
                 if (isTaskModalOpen) { setIsTaskModalOpen(false); setTaskToEdit(null); return; }
                 if (isScriptModalOpen) { setIsScriptModalOpen(false); return; }
                 if (isShowModalOpen) { setIsShowModalOpen(false); return; }
                 if (isLiveModalOpen) { setIsLiveModalOpen(false); return; }
                 if (selectedShow) { setSelectedShow(null); return; }
             }
             const isCmdOrCtrl = e.metaKey || e.ctrlKey;
             if (isCmdOrCtrl && (e.key === 'n' || e.key === 'N')) {
                 if (!selectedShow) return;
                 // Don't steal the shortcut when typing in inputs/textareas.
                 const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
                 if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
                 e.preventDefault();
                 setTaskToEdit(null);
                 setIsTaskModalOpen(true);
             }
         };
         window.addEventListener('keydown', onKeyDown);
         return () => window.removeEventListener('keydown', onKeyDown);
     }, [isTaskModalOpen, isScriptModalOpen, isShowModalOpen, isLiveModalOpen, selectedShow]);


    useEffect(() => {
        const fetchShows = async () => {
            const allShows = await getShows();
            setShows(allShows);
            if (initialShowId) {
                const show = allShows.find(s => s.id === initialShowId);
                if (show) {
                    setSelectedShow(show);
                }
            }
        };
        fetchShows();
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
        const newShows = await addShow(title, description, clientId);
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
             <div ref={el => { taskRefs.current.set(task.id, el); }} className={`p-3 rounded-lg border flex flex-col gap-3 transition-all ${isOverdue ? 'bg-red-900/20 border-red-500/50' : `bg-slate-800 border-slate-700 border-l-4 ${priorityBorders[task.priority]}`}`} onClick={() => openEditModal(task)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openEditModal(task); } }}}>
                <div className="flex items-start gap-3">
                    <input type="checkbox" checked={task.status === 'Completed'} onChange={() => handleToggleStatus(task)} className="mt-1 w-5 h-5 accent-purple-500 bg-slate-900 flex-shrink-0"  onClick={(e) => e.stopPropagation()} />
                    <div className="flex-1">
                        <p className={`font-semibold text-slate-200 ${isOverdue ? '!text-red-300' : ''}`}>{task.title}</p>
                        {task.notes && <p className="text-sm text-slate-400 mt-1 whitespace-pre-line break-words line-clamp-3 max-h-16 overflow-hidden">{task.notes}</p>}
                    </div>
                    <div className="flex items-center gap-1">
                        <button onClick={(e) => { e.stopPropagation(); openEditModal(task); }} className="p-2 text-slate-400 hover:text-amber-300 rounded-full hover:bg-slate-700 transition-colors"><PencilIcon className="w-5 h-5"/></button>
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteTask(task.id); }} className="p-2 text-slate-400 hover:text-red-400 rounded-full hover:bg-slate-700 transition-colors"><TrashIcon className="w-5 h-5"/></button>
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
        <div className="flex flex-col h-full animate-fade-in">
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
                {shows.length > 0 ? (
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
        const [activeTab, setActiveTab] = useState<'tasks' | 'finances' | 'history'>('tasks');
        const [isSuggesting, setIsSuggesting] = useState(false);
        const [suggestionError, setSuggestionError] = useState<string | null>(null);
        const [pastPerformances, setPastPerformances] = useState<Performance[]>([]);
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
             <div className="flex flex-col h-full animate-fade-in">
                <header className="p-4 md:px-6 md:pt-6">
                    <button onClick={() => setSelectedShow(null)} className="flex items-center gap-2 mb-4 text-slate-300 hover:text-white transition-colors"><BackIcon className="w-5 h-5" /><span>Back to All Shows</span></button>
                    <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-200 font-cinzel truncate">{selectedShow.title}</h2>
                            {client && <p className="text-sm text-slate-400 flex items-center gap-2"><UsersIcon className="w-4 h-4" /> {client.name}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setIsLiveModalOpen(true)} className="px-3 py-2 bg-green-600 hover:bg-green-700 rounded-md text-white font-semibold transition-colors flex items-center gap-2 text-sm"><QrCodeIcon className="w-4 h-4" /><span>Start Live Show</span></button>
                            <button onClick={handleAiSuggestTasks} disabled={isSuggesting} className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200 font-semibold transition-colors flex items-center gap-2 text-sm disabled:opacity-50"><WandIcon className="w-4 h-4" /><span>{isSuggesting ? 'Thinking...' : 'AI-Suggest Tasks'}</span></button>
                            <button onClick={generateScriptGuide} className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200 font-semibold transition-colors flex items-center gap-2 text-sm"><FileTextIcon className="w-4 h-4" /><span>Script Guide</span></button>
                            <button onClick={() => { setTaskToEdit(null); setIsTaskModalOpen(true); }} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold transition-colors flex items-center gap-2 text-sm"><ChecklistIcon className="w-4 h-4" /><span>Add Task</span></button>
                        </div>
                    </div>
                    {suggestionError && <p className="text-red-400 text-center text-sm mb-2">{suggestionError}</p>}
                    <div className="bg-slate-800/50 border-y border-slate-700 -mx-4 md:-mx-6 px-4 md:px-6 flex items-center justify-between">
                         <div className="flex items-center">
                            <TabButton icon={ChecklistIcon} label="Tasks" isActive={activeTab === 'tasks'} onClick={() => setActiveTab('tasks')} />
                            <TabButton icon={DollarSignIcon} label="Finances" isActive={activeTab === 'finances'} onClick={() => setActiveTab('finances')} />
                            <TabButton icon={AnalyticsIcon} label="Performance History" isActive={activeTab === 'history'} onClick={() => setActiveTab('history')} />
                        </div>
                        {activeTab === 'tasks' && <div className="bg-slate-700 p-1 rounded-md flex items-center"><button onClick={() => setViewMode('board')} className={`flex items-center gap-2 px-3 py-1 text-sm font-medium rounded transition-colors ${viewMode === 'board' ? 'bg-purple-600 text-white' : 'text-slate-300 hover:bg-slate-600'}`}><ViewGridIcon className="w-4 h-4" />Board</button><button onClick={() => setViewMode('list')} className={`flex items-center gap-2 px-3 py-1 text-sm font-medium rounded transition-colors ${viewMode === 'list' ? 'bg-purple-600 text-white' : 'text-slate-300 hover:bg-slate-600'}`}><ViewListIcon className="w-4 h-4" />List</button></div>}
                        {activeTab === 'tasks' && viewMode === 'list' && (<div className="flex items-center gap-2"><label htmlFor="sort-by" className="text-sm font-medium text-slate-400">Sort By</label><select id="sort-by" value={sortBy} onChange={e => setSortBy(e.target.value as any)} className="bg-slate-700 text-white text-sm rounded-md py-1 px-2 border border-slate-600"><option value="dueDate">Due Date</option><option value="priority">Priority</option><option value="createdAt">Created Date</option></select></div>)}
                    </div>
                </header>
                <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-4 pt-4">
                    {activeTab === 'tasks' ? (
                        tasks.length === 0 ? <div className="text-center py-12"><ChecklistIcon className="w-16 h-16 mx-auto text-slate-600 mb-4" /><h3 className="text-lg font-bold text-slate-400">This Show is Empty</h3><p className="text-slate-500 mb-4">Click "Add Task" to start planning manually, or let the AI help.</p><button onClick={handleAiSuggestTasks} disabled={isSuggesting} className="px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold transition-colors flex items-center gap-2 text-base mx-auto"><WandIcon className="w-5 h-5" /><span>{isSuggesting ? 'Thinking...' : 'AI-Suggest Tasks'}</span></button></div>
                        : viewMode === 'list' ? <ListView /> : <BoardView />
                    ) : activeTab === 'finances' ? (
                        <FinanceTracker show={selectedShow} onUpdate={(updates) => handleUpdateShow(selectedShow.id, updates)} />
                    ) : (
                        <PerformanceHistory performances={pastPerformances} onNavigateToAnalytics={onNavigateToAnalytics} />
                    )}
                </div>
            </div>
        );
    };
    
    const ShowModal: React.FC<{ onSave: (title: string, description?: string, clientId?: string) => void, onClose: () => void }> = ({ onSave, onClose }) => {
        const [title, setTitle] = useState('');
        const [description, setDescription] = useState('');
        const [clientId, setClientId] = useState('');
        
        const handleSubmit = (e: React.FormEvent) => {
            e.preventDefault();
            if (!title.trim()) return;
            onSave(title, description, clientId || undefined);
        };

        return (
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in" onClick={onClose}>
                <div className="w-full max-w-md bg-slate-800 border border-purple-500 rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
                    <form onSubmit={handleSubmit} className="p-6 space-y-4">
                        <h2 className="text-xl font-bold text-white">Create New Show</h2>
                        <div><label htmlFor="show-title" className="block text-sm font-medium text-slate-300 mb-1">Show Title</label><input id="show-title" type="text" value={title} onChange={e => setTitle(e.target.value)} required autoFocus className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white" /></div>
                        <div><label htmlFor="show-desc" className="block text-sm font-medium text-slate-300 mb-1">Description (Optional)</label><textarea id="show-desc" rows={2} value={description} onChange={e => setDescription(e.target.value)} className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white" /></div>
                        <div><label htmlFor="show-client" className="block text-sm font-medium text-slate-300 mb-1">Client (Optional)</label>
                            <select id="show-client" value={clientId} onChange={e => setClientId(e.target.value)} className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white">
                                <option value="">No Client</option>
                                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
                        <div className="flex gap-3 pt-2"><button type="button" onClick={onClose} className="w-full py-2 bg-slate-600/50 hover:bg-slate-700 rounded-md text-slate-300 font-bold">Cancel</button><button type="submit" className="w-full py-2 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold">Create Show</button></div>
                    </form>
                </div>
            </div>
        );
    };

    return (
        <>
            {isTaskModalOpen && <TaskModal onClose={() => { setIsTaskModalOpen(false); setTaskToEdit(null); }} onSave={taskToEdit ? handleUpdateTask : handleAddTask} taskToEdit={taskToEdit} user={user} />}
            {isScriptModalOpen && <ScriptGuideModal script={generatedScript} onClose={() => setIsScriptModalOpen(false)} />}
            {isShowModalOpen && <ShowModal onClose={() => setIsShowModalOpen(false)} onSave={handleAddShow} />}
            {isLiveModalOpen && selectedShow && <LivePerformanceModal show={selectedShow} onClose={() => setIsLiveModalOpen(false)} onEnd={(id) => { setIsLiveModalOpen(false); onNavigateToAnalytics(id); }} />}
            {selectedShow ? <ShowDetailView /> : <ShowListView />}
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

const FinanceTracker: React.FC<{ show: Show, onUpdate: (updates: Partial<Show>) => void }> = ({ show, onUpdate }) => {
    const finances = useMemo(() => show.finances || { performanceFee: 0, expenses: [] }, [show.finances]);
    const [fee, setFee] = useState(finances.performanceFee);
    const [newExpenseDesc, setNewExpenseDesc] = useState('');
    const [newExpenseAmount, setNewExpenseAmount] = useState('');

    const totalExpenses = useMemo(() => finances.expenses.reduce((sum, exp) => sum + exp.amount, 0), [finances.expenses]);
    const netProfit = fee - totalExpenses;

    const handleFeeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFee(parseFloat(e.target.value) || 0);
    };

    const handleFeeUpdate = () => {
        onUpdate({ finances: { ...finances, performanceFee: fee } });
    };

    const handleAddExpense = () => {
        if (!newExpenseDesc.trim() || !newExpenseAmount) return;
        const newExpense: Expense = {
            id: `exp-${Date.now()}`,
            description: newExpenseDesc,
            amount: parseFloat(newExpenseAmount)
        };
        onUpdate({ finances: { ...finances, expenses: [...finances.expenses, newExpense] } });
        setNewExpenseDesc('');
        setNewExpenseAmount('');
    };

    const handleDeleteExpense = (expenseId: string) => {
        onUpdate({ finances: { ...finances, expenses: finances.expenses.filter(e => e.id !== expenseId) } });
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
                <div>
                    <h3 className="text-lg font-bold text-white mb-2">Expenses</h3>
                    <div className="bg-slate-800 border border-slate-700 rounded-lg">
                        <div className="p-3 flex items-center gap-3">
                            <input type="text" value={newExpenseDesc} onChange={e => setNewExpenseDesc(e.target.value)} placeholder="Expense description (e.g., Props, Travel)" className="flex-1 bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-sm" />
                            <input type="number" value={newExpenseAmount} onChange={e => setNewExpenseAmount(e.target.value)} placeholder="Amount ($)" className="w-32 bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-sm" />
                            <button onClick={handleAddExpense} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-semibold text-sm">Add</button>
                        </div>
                        <div className="max-h-64 overflow-y-auto border-t border-slate-700">
                            {finances.expenses.length > 0 ? finances.expenses.map(exp => (
                                <div key={exp.id} className="p-3 flex items-center justify-between border-b border-slate-700/50">
                                    <span className="text-slate-300">{exp.description}</span>
                                    <div className="flex items-center gap-3">
                                        <span className="text-slate-400">${exp.amount.toLocaleString()}</span>
                                        <button onClick={() => handleDeleteExpense(exp.id)} className="p-1 text-slate-500 hover:text-red-400"><TrashIcon className="w-4 h-4" /></button>
                                    </div>
                                </div>
                            )) : <p className="text-center text-sm text-slate-500 p-6">No expenses logged yet.</p>}
                        </div>
                    </div>
                </div>
            </div>
            <div className="space-y-4">
                <h3 className="text-lg font-bold text-white mb-2">Financial Summary</h3>
                <div className="space-y-3 bg-slate-800 border border-slate-700 rounded-lg p-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Performance Fee</label>
                        <div className="flex items-center gap-2">
                            <span className="text-lg text-slate-400">$</span>
                            <input type="number" value={fee} onChange={handleFeeChange} onBlur={handleFeeUpdate} className="flex-1 bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-lg font-bold" />
                        </div>
                    </div>
                    <div className="border-t border-slate-700 pt-3 space-y-2">
                        <div className="flex justify-between items-center"><span className="text-slate-400">Total Expenses:</span><span className="font-semibold text-red-300">-${totalExpenses.toLocaleString()}</span></div>
                        <div className={`flex justify-between items-center text-lg font-bold border-t border-slate-600 pt-2 ${netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}><span>Net Profit:</span><span>${netProfit.toLocaleString()}</span></div>
                    </div>
                </div>
            </div>
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


export default ShowPlanner;
