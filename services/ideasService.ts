import { supabase } from '../supabase';
import type { SavedIdea } from '../types';

/**
 * ideasService.ts
 *
 * Supabase table: public.ideas
 * Expected columns (minimum):
 *   - id (uuid/text PK)
 *   - user_id (uuid/text, references auth.users)
 *   - type (text)              // e.g., 'text' | 'image' | 'rehearsal'
 *   - content (text)
 *   - created_at (timestamptz, default now())
 *
 * Optional (recommended):
 *   - tags (text[], default '{}')
 */

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const uid = data?.user?.id;
  if (!uid) throw new Error('Not authenticated.');
  return uid;
}

export async function getSavedIdeas(): Promise<SavedIdea[]> {
  const uid = await requireUserId();
  const { data, error } = await supabase
    .from('ideas')
    .select('*')
    .eq('user_id', uid)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as SavedIdea[];
}

export async function saveIdea(idea: Omit<SavedIdea, 'id' | 'user_id' | 'created_at'>): Promise<SavedIdea> {
  const uid = await requireUserId();
  const { data, error } = await supabase
    .from('ideas')
    .insert({ ...idea, user_id: uid })
    .select('*')
    .single();

  if (error) throw error;
  return data as SavedIdea;
}

/**
 * Update a single idea row and return the updated row.
 * IMPORTANT: This throws on Supabase errors (including RLS denial).
 */
export async function updateIdea(id: string, updates: Partial<SavedIdea>): Promise<SavedIdea> {
  if (!id) throw new Error('updateIdea: missing id');
  await requireUserId();

  const { data, error } = await supabase
    .from('ideas')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return data as SavedIdea;
}

export async function deleteIdea(id: string): Promise<void> {
  if (!id) throw new Error('deleteIdea: missing id');
  await requireUserId();

  const { error } = await supabase.from('ideas').delete().eq('id', id);
  if (error) throw error;
}
