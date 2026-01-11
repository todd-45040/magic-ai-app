
import { supabase } from '../supabase';
import type { Show, Task, TaskPriority } from '../types';

export const getShows = async (): Promise<Show[]> => {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user ?? null;
  const userId = user?.id;
  if (!userId) return [];

  const { data, error } = await supabase
    .from('shows')
    .select(`
      *,
      tasks (*)
    `)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error("Failed to load shows:", error);
    return [];
  }

  // Map database snake_case to frontend camelCase if necessary, 
  // or assume database schema matches types.
  return data as Show[];
};

export const getShowById = async (id: string): Promise<Show | undefined> => {
    const { data } = await supabase
        .from('shows')
        .select('*, tasks (*)')
        .eq('id', id)
        .single();
    return data as Show;
};

export const addShow = async (title: string, description?: string, clientId?: string): Promise<Show[]> => {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return [];

  const userId = userData.user.id;

  const { error } = await supabase
    .from('shows')
    .insert([{
      title,
      description,
      client_id: clientId,
      user_id: userId,
      performance_fee: 0,
      expenses: []
    }]);

  if (error) throw error;

  return getShows();
};

export const updateShow = async (id: string, updates: Partial<Show>): Promise<Show[]> => {
  await supabase
    .from('shows')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);
  return getShows();
};

export const deleteShow = async (id: string): Promise<Show[]> => {
  await supabase.from('shows').delete().eq('id', id);
  return getShows();
};

export const findShowByTitle = async (title: string): Promise<Show | undefined> => {
    const shows = await getShows();
    return shows.find(show => show.title.toLowerCase() === title.toLowerCase());
};

// --- Task-level CRUD ---

export const addTaskToShow = async (showId: string, taskData: any): Promise<Show[]> => {
  await supabase
    .from('tasks')
    .insert([{
      show_id: showId,
      title: taskData.title,
      notes: taskData.notes,
      priority: taskData.priority,
      status: 'To-Do',
      due_date: taskData.dueDate ? new Date(taskData.dueDate).toISOString() : null,
      music_cue: taskData.musicCue,
      subtasks: taskData.subtasks || []
    }]);
    
  return getShows();
};

export const addTasksToShow = async (showId: string, tasksData: { title: string; priority: TaskPriority }[]): Promise<Show[]> => {
    const rows = tasksData.map(t => ({
        show_id: showId,
        title: t.title,
        priority: t.priority,
        status: 'To-Do'
    }));
    await supabase.from('tasks').insert(rows);
    return getShows();
};

export const updateTaskInShow = async (showId: string, taskId: string, updates: Partial<Task>): Promise<Show[]> => {
    // Map due_date if updating
    const dbUpdates: any = { ...updates };
    if (updates.dueDate) {
        dbUpdates.due_date = new Date(updates.dueDate).toISOString();
        delete dbUpdates.dueDate;
    }

    await supabase
        .from('tasks')
        .update(dbUpdates)
        .eq('id', taskId);
        
    return getShows();
};

export const deleteTaskFromShow = async (showId: string, taskId: string): Promise<Show[]> => {
    await supabase.from('tasks').delete().eq('id', taskId);
    return getShows();
};

export const toggleSubtask = async (showId: string, taskId: string, subtaskId: string): Promise<Show[]> => {
    const { data: task } = await supabase.from('tasks').select('subtasks').eq('id', taskId).single();
    if (task && task.subtasks) {
        const updated = task.subtasks.map((st: any) => st.id === subtaskId ? { ...st, completed: !st.completed } : st);
        await supabase.from('tasks').update({ subtasks: updated }).eq('id', taskId);
    }
    return getShows();
};