import { db, auth } from '../firebase';
import { collection, getDocs, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import type { Show, Task, TaskPriority, Subtask } from '../types';

const getCollectionRef = () => {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated");
    return collection(db, 'users', user.uid, 'shows');
};

export const getShows = async (): Promise<Show[]> => {
  if (!auth.currentUser) return [];
  try {
    const snapshot = await getDocs(getCollectionRef());
    const shows = snapshot.docs.map(d => d.data() as Show);
    return shows.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (error) {
    console.error("Failed to load shows from Firestore", error);
    return [];
  }
};

export const getShowById = async (id: string): Promise<Show | undefined> => {
    const shows = await getShows();
    return shows.find(s => s.id === id);
};

export const addShow = async (title: string, description?: string, clientId?: string): Promise<Show[]> => {
  const now = Date.now();
  const id = `show-${now}-${Math.random().toString(36).substr(2, 9)}`;
  const newShow: Show = {
    id,
    title,
    description,
    clientId,
    tasks: [],
    finances: {
      performanceFee: 0,
      expenses: [],
    },
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
  
  if (auth.currentUser) {
      await setDoc(doc(db, 'users', auth.currentUser.uid, 'shows', id), newShow);
  }
  return getShows();
};

export const updateShow = async (id: string, updates: Partial<Omit<Show, 'id'>>): Promise<Show[]> => {
  if (auth.currentUser) {
      await updateDoc(doc(db, 'users', auth.currentUser.uid, 'shows', id), { ...updates, updatedAt: Date.now() });
  }
  return getShows();
};

export const deleteShow = async (id: string): Promise<Show[]> => {
  if (auth.currentUser) {
      await deleteDoc(doc(db, 'users', auth.currentUser.uid, 'shows', id));
  }
  return getShows();
};

export const findShowByTitle = async (title: string): Promise<Show | undefined> => {
    const shows = await getShows();
    return shows.find(show => show.title.toLowerCase() === title.toLowerCase());
};

// --- Task-level CRUD within a Show ---

export const addTaskToShow = async (showId: string, taskData: { title: string; notes?: string; priority: TaskPriority; dueDate?: number, musicCue?: string, subtasks?: Partial<Subtask>[], tags?: string[] }): Promise<Show[]> => {
  const shows = await getShows();
  const show = shows.find(s => s.id === showId);
  if (show && auth.currentUser) {
    const newTask: Task = {
      id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: taskData.title,
      notes: taskData.notes,
      priority: taskData.priority,
      status: 'To-Do',
      dueDate: taskData.dueDate,
      musicCue: taskData.musicCue,
      subtasks: (taskData.subtasks || []).map(st => ({
          id: `subtask-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, 
          text: st.text || '', 
          completed: st.completed || false
      })),
      tags: taskData.tags || [],
      createdAt: Date.now(),
    };
    const updatedTasks = [...show.tasks, newTask];
    await updateDoc(doc(db, 'users', auth.currentUser.uid, 'shows', showId), { tasks: updatedTasks, updatedAt: Date.now() });
  }
  return getShows();
};

export const addTasksToShow = async (showId: string, tasksData: { title: string; priority: TaskPriority }[]): Promise<Show[]> => {
    const shows = await getShows();
    const show = shows.find(s => s.id === showId);
    if (show && auth.currentUser) {
        const now = Date.now();
        const newTasks: Task[] = tasksData.map((taskData, index) => ({
            id: `task-${now}-${index}-${Math.random().toString(36).substr(2, 9)}`,
            title: taskData.title,
            priority: taskData.priority,
            status: 'To-Do',
            createdAt: now + index,
            tags: [],
        }));
        const updatedTasks = [...show.tasks, ...newTasks];
        await updateDoc(doc(db, 'users', auth.currentUser.uid, 'shows', showId), { tasks: updatedTasks, updatedAt: now });
    }
    return getShows();
};

export const updateTaskInShow = async (showId: string, taskId: string, updates: Partial<Task>): Promise<Show[]> => {
    const shows = await getShows();
    const show = shows.find(s => s.id === showId);
    if (show && auth.currentUser) {
        const updatedTasks = show.tasks.map(t => t.id === taskId ? { ...t, ...updates } : t);
        await updateDoc(doc(db, 'users', auth.currentUser.uid, 'shows', showId), { tasks: updatedTasks, updatedAt: Date.now() });
    }
    return getShows();
};

export const deleteTaskFromShow = async (showId: string, taskId: string): Promise<Show[]> => {
    const shows = await getShows();
    const show = shows.find(s => s.id === showId);
    if (show && auth.currentUser) {
        const updatedTasks = show.tasks.filter(t => t.id !== taskId);
        await updateDoc(doc(db, 'users', auth.currentUser.uid, 'shows', showId), { tasks: updatedTasks, updatedAt: Date.now() });
    }
    return getShows();
};

export const toggleSubtask = async (showId: string, taskId: string, subtaskId: string): Promise<Show[]> => {
    const shows = await getShows();
    const show = shows.find(s => s.id === showId);
    if (show && auth.currentUser) {
        const updatedTasks = show.tasks.map(task => {
            if (task.id === taskId && task.subtasks) {
                const updatedSubtasks = task.subtasks.map(st => st.id === subtaskId ? { ...st, completed: !st.completed } : st);
                return { ...task, subtasks: updatedSubtasks };
            }
            return task;
        });
        await updateDoc(doc(db, 'users', auth.currentUser.uid, 'shows', showId), { tasks: updatedTasks, updatedAt: Date.now() });
    }
    return getShows();
};