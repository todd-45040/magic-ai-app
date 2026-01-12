import { supabase } from '../supabase';
import type { Show, Task } from '../types';

// Helpers
const getUserIdOrThrow = async (): Promise<string> => {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const userId = data?.user?.id;
  if (!userId) throw new Error('Not authenticated');
  return userId;
};

const toIsoOrNull = (value?: string | number | Date | null) => {
  if (value === undefined || value === null || value === '') return null;
  const d = new Date(value as any);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

// Normalize priority values coming from UI/DB to the canonical set used by the app.
// Protects against older data like "high"/"LOW" or labels like "High Priority".
const normalizePriority = (value: any): 'High' | 'Medium' | 'Low' => {
  const raw = String(value ?? '').trim();
  if (!raw) return 'Medium';
  const lowered = raw.toLowerCase();
  if (lowered.startsWith('high')) return 'High';
  if (lowered.startsWith('low')) return 'Low';
  if (lowered.startsWith('med')) return 'Medium';
  // fallback (keeps UI stable)
  return 'Medium';
};

const mapTaskToDb = (showId: string, userId: string, task: Partial<Task>) => {
  // Support a few possible field names that exist in your app over time.
  const title = (task as any).title ?? (task as any).taskTitle ?? '';
  const notes =
    (task as any).notes ??
    (task as any).patter ??
    (task as any).notesPatter ??
    (task as any).notes_patter ??
    '';

  // Priority sometimes arrives in different shapes (older UI fields, differing casing).
  // Normalize to the canonical values used by the board filters.
  const priority = normalizePriority((task as any).priority ?? (task as any).taskPriority ?? (task as any).priorityLevel);
  const dueDate = (task as any).dueDate ?? (task as any).due_date ?? null;
  const musicCue = (task as any).musicCue ?? (task as any).music_cue ?? '';
  // The planner UI expects 'To-Do' or 'Completed'. Default to 'To-Do' so new tasks appear immediately.
  const status = (task as any).status ?? 'To-Do';
  const subtasks = (task as any).subtasks ?? [];

  return {
    show_id: showId,
    user_id: userId,
    title,
    notes,
    priority,
    due_date: toIsoOrNull(dueDate),
    music_cue: musicCue || null,
    status,
    subtasks
  };
};

export const getShows = async (): Promise<Show[]> => {
  const userId = await getUserIdOrThrow();

  const { data, error } = await supabase
    .from('shows')
    .select(
      `
      *,
      tasks (*)
    `
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .order('created_at', { foreignTable: 'tasks', ascending: true });

  if (error) throw error;
  // Normalize task fields to keep UI grouping/filtering stable across older rows.
  return (((data as any[]) ?? []) as any[]).map((show) => ({
    ...show,
    tasks: Array.isArray(show.tasks)
      ? show.tasks.map((t: any) => ({
          ...t,
          priority: normalizePriority(t.priority),
          status: t.status ?? 'To-Do'
        }))
      : []
  })) as Show[];
};

export const getShowById = async (id: string): Promise<Show | undefined> => {
  const userId = await getUserIdOrThrow();

  const { data, error } = await supabase
    .from('shows')
    .select(
      `
      *,
      tasks (*)
    `
    )
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (error) throw error;
  return data as unknown as Show;
};

export const addShow = async (show: Partial<Show>): Promise<Show[]> => {
  const userId = await getUserIdOrThrow();

  const title = (show as any).title ?? (show as any).showTitle ?? '';
  if (!title.trim()) throw new Error('Show title required');

  const payload: any = {
    user_id: userId,
    title: title.trim(),
    description: (show as any).description ?? null,
    // Keep finances in a single JSON object (this avoids schema-cache column errors)
    finances: (show as any).finances ?? {
      performanceFee: 0,
      expenses: [],
      income: []
    },
    updated_at: new Date().toISOString()
  };

  // If your DB has client columns, they can be included; otherwise they’ll be ignored if not present
  // but Supabase will error if column truly does not exist. So we only include if provided and non-empty.
  const maybeClient = (show as any).client ?? null;
  if (maybeClient && typeof maybeClient === 'string' && maybeClient.trim()) {
    payload.client = maybeClient.trim();
  }

  const { error } = await supabase.from('shows').insert(payload);
  if (error) throw error;

  return getShows();
};

export const updateShow = async (id: string, updates: Partial<Show>): Promise<Show[]> => {
  const userId = await getUserIdOrThrow();

  const payload: any = { ...updates, updated_at: new Date().toISOString() };

  // Prevent accidentally writing tasks array into shows row (tasks live in tasks table)
  delete payload.tasks;

  const { error } = await supabase.from('shows').update(payload).eq('id', id).eq('user_id', userId);
  if (error) throw error;

  return getShows();
};

export const deleteShow = async (id: string): Promise<Show[]> => {
  const userId = await getUserIdOrThrow();

  // Delete tasks first (in case FK cascade is not enabled)
  await supabase.from('tasks').delete().eq('show_id', id).eq('user_id', userId);

  const { error } = await supabase.from('shows').delete().eq('id', id).eq('user_id', userId);
  if (error) throw error;

  return getShows();
};

export const addTaskToShow = async (showId: string, task: Partial<Task>): Promise<Show[]> => {
  const userId = await getUserIdOrThrow();

  const payload = mapTaskToDb(showId, userId, task);

  if (!payload.title || !String(payload.title).trim()) {
    throw new Error('Task title required');
  }

  const { error } = await supabase.from('tasks').insert(payload);
  if (error) throw error;

  return getShows();
};

export const addTasksToShow = async (showId: string, tasks: Partial<Task>[]): Promise<Show[]> => {
  const userId = await getUserIdOrThrow();

  const payloads = tasks
    .map((t) => mapTaskToDb(showId, userId, t))
    .filter((p) => p.title && String(p.title).trim());

  if (payloads.length === 0) return getShows();

  const { error } = await supabase.from('tasks').insert(payloads);
  if (error) throw error;

  return getShows();
};

export const updateTaskInShow = async (showId: string, taskId: string, updates: Partial<Task>): Promise<Show[]> => {
  const userId = await getUserIdOrThrow();

  const dbUpdates: any = {};

  if ((updates as any).title !== undefined) dbUpdates.title = (updates as any).title;
  if ((updates as any).notes !== undefined) dbUpdates.notes = (updates as any).notes;
  if ((updates as any).patter !== undefined) dbUpdates.notes = (updates as any).patter;
  if ((updates as any).priority !== undefined) dbUpdates.priority = normalizePriority((updates as any).priority);
  if ((updates as any).taskPriority !== undefined) dbUpdates.priority = normalizePriority((updates as any).taskPriority);
  if ((updates as any).priorityLevel !== undefined) dbUpdates.priority = normalizePriority((updates as any).priorityLevel);
  if ((updates as any).musicCue !== undefined) dbUpdates.music_cue = (updates as any).musicCue;
  if ((updates as any).status !== undefined) dbUpdates.status = (updates as any).status;
  if ((updates as any).subtasks !== undefined) dbUpdates.subtasks = (updates as any).subtasks;

  if ((updates as any).dueDate !== undefined) {
    dbUpdates.due_date = toIsoOrNull((updates as any).dueDate);
  }
  if ((updates as any).due_date !== undefined) {
    dbUpdates.due_date = toIsoOrNull((updates as any).due_date);
  }

  const { error } = await supabase
    .from('tasks')
    .update(dbUpdates)
    .eq('id', taskId)
    .eq('show_id', showId)
    .eq('user_id', userId);

  if (error) throw error;

  return getShows();
};

export const deleteTaskFromShow = async (showId: string, taskId: string): Promise<Show[]> => {
  const userId = await getUserIdOrThrow();

  const { error } = await supabase.from('tasks').delete().eq('id', taskId).eq('show_id', showId).eq('user_id', userId);
  if (error) throw error;

  return getShows();
};

export const toggleSubtask = async (showId: string, taskId: string, subtaskId: string): Promise<Show[]> => {
  const userId = await getUserIdOrThrow();

  const { data, error } = await supabase
    .from('tasks')
    .select('subtasks')
    .eq('id', taskId)
    .eq('show_id', showId)
    .eq('user_id', userId)
    .single();

  if (error) throw error;

  const subtasks: any[] = Array.isArray((data as any)?.subtasks) ? (data as any).subtasks : [];
  const updated = subtasks.map((st) => (st.id === subtaskId ? { ...st, completed: !st.completed } : st));

  const { error: updErr } = await supabase
    .from('tasks')
    .update({ subtasks: updated })
    .eq('id', taskId)
    .eq('show_id', showId)
    .eq('user_id', userId);

  if (updErr) throw updErr;

  return getShows();
};
