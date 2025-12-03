import type { Show, Task, TaskPriority, Subtask } from '../types';

const SHOWS_STORAGE_KEY = 'magician_show_planner_shows';

// --- Show-level CRUD ---

export const getShows = (): Show[] => {
  try {
    const savedData = localStorage.getItem(SHOWS_STORAGE_KEY);
    if (savedData) {
      const shows = JSON.parse(savedData) as Show[];
      return shows.sort((a, b) => b.updatedAt - a.updatedAt);
    }
  } catch (error) {
    console.error("Failed to load shows from localStorage", error);
  }
  return [];
};

const saveShows = (shows: Show[]): void => {
  try {
    localStorage.setItem(SHOWS_STORAGE_KEY, JSON.stringify(shows));
  } catch (error) {
    console.error("Failed to save shows to localStorage", error);
  }
};

export const getShowById = (id: string): Show | undefined => {
    const shows = getShows();
    return shows.find(s => s.id === id);
};

export const addShow = (title: string, description?: string, clientId?: string): Show[] => {
  const shows = getShows();
  const now = Date.now();
  const newShow: Show = {
    id: `show-${now}-${Math.random().toString(36).substr(2, 9)}`,
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
  const updatedShows = [newShow, ...shows];
  saveShows(updatedShows);
  return getShows();
};

export const updateShow = (id: string, updates: Partial<Omit<Show, 'id'>>): Show[] => {
  let shows = getShows();
  const showIndex = shows.findIndex(s => s.id === id);
  if (showIndex > -1) {
    shows[showIndex] = { ...shows[showIndex], ...updates, updatedAt: Date.now() };
    saveShows(shows);
  }
  return getShows();
};

export const deleteShow = (id: string): Show[] => {
  let shows = getShows();
  const updatedShows = shows.filter(s => s.id !== id);
  saveShows(updatedShows);
  return updatedShows;
};

export const findShowByTitle = (title: string): Show | undefined => {
    const shows = getShows();
    return shows.find(show => show.title.toLowerCase() === title.toLowerCase());
};


// --- Task-level CRUD within a Show ---

export const addTaskToShow = (showId: string, taskData: { title: string; notes?: string; priority: TaskPriority; dueDate?: number, musicCue?: string, subtasks?: Omit<Subtask, 'id'|'completed'>[], tags?: string[] }): Show[] => {
  const shows = getShows();
  const showIndex = shows.findIndex(s => s.id === showId);
  if (showIndex > -1) {
    const newTask: Task = {
      id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: taskData.title,
      notes: taskData.notes,
      priority: taskData.priority,
      status: 'To-Do',
      dueDate: taskData.dueDate,
      musicCue: taskData.musicCue,
      subtasks: (taskData.subtasks || []).map(st => ({...st, id: `subtask-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, completed: false})),
      tags: taskData.tags || [],
      createdAt: Date.now(),
    };
    shows[showIndex].tasks.push(newTask);
    shows[showIndex].updatedAt = Date.now();
    saveShows(shows);
  }
  return getShows();
};

export const addTasksToShow = (showId: string, tasksData: { title: string; priority: TaskPriority }[]): Show[] => {
    const shows = getShows();
    const showIndex = shows.findIndex(s => s.id === showId);
    if (showIndex > -1) {
        const now = Date.now();
        const newTasks: Task[] = tasksData.map((taskData, index) => ({
            id: `task-${now}-${index}-${Math.random().toString(36).substr(2, 9)}`,
            title: taskData.title,
            priority: taskData.priority,
            status: 'To-Do',
            createdAt: now + index, // Ensure unique creation time for sorting
            tags: [],
        }));
        
        shows[showIndex].tasks.push(...newTasks);
        shows[showIndex].updatedAt = now;
        saveShows(shows);
    }
    return getShows();
};


export const updateTaskInShow = (showId: string, taskId: string, updates: Partial<Task>): Show[] => {
    const shows = getShows();
    const showIndex = shows.findIndex(s => s.id === showId);
    if (showIndex > -1) {
        const taskIndex = shows[showIndex].tasks.findIndex(t => t.id === taskId);
        if (taskIndex > -1) {
            shows[showIndex].tasks[taskIndex] = { ...shows[showIndex].tasks[taskIndex], ...updates };
            shows[showIndex].updatedAt = Date.now();
            saveShows(shows);
        }
    }
    return getShows();
};

export const deleteTaskFromShow = (showId: string, taskId: string): Show[] => {
    const shows = getShows();
    const showIndex = shows.findIndex(s => s.id === showId);
    if (showIndex > -1) {
        shows[showIndex].tasks = shows[showIndex].tasks.filter(t => t.id !== taskId);
        shows[showIndex].updatedAt = Date.now();
        saveShows(shows);
    }
    return getShows();
};

// --- Subtask-level CRUD ---
export const toggleSubtask = (showId: string, taskId: string, subtaskId: string): Show[] => {
    const shows = getShows();
    const showIndex = shows.findIndex(s => s.id === showId);
    if (showIndex > -1) {
        const taskIndex = shows[showIndex].tasks.findIndex(t => t.id === taskId);
        if (taskIndex > -1) {
            const task = shows[showIndex].tasks[taskIndex];
            if (task.subtasks) {
                const subtaskIndex = task.subtasks.findIndex(st => st.id === subtaskId);
                if (subtaskIndex > -1) {
                    task.subtasks[subtaskIndex].completed = !task.subtasks[subtaskIndex].completed;
                    shows[showIndex].updatedAt = Date.now();
                    saveShows(shows);
                }
            }
        }
    }
    return getShows();
};