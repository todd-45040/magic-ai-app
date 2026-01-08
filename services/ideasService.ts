import { supabase } from '../supabase';
import type { SavedIdea, IdeaType } from '../types';

/**
 * ideasService.ts (created_at version)
 *
 * This service expects a Supabase table: public.ideas
 * Minimum columns:
 *   - id (uuid/text PK)
 *   - user_id (uuid/text, references auth.users)
 *   - type (text)
 *   - content (text)
 *   - created_at (timestamptz, default now())
 */

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const sbUser = data?.user ?? null;
  if (!sbUser) throw new Error('Not authenticated');
  return sbUser.id;
}

export const getSavedIdeas = async (): Promise<SavedIdea[]> => {
  try {
    const userId = await requireUserId();

    const { data, error } = await supabase
      .from('ideas')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data ?? []) as SavedIdea[];
  } catch (err) {
    console.error('getSavedIdeas failed:', err);
    return [];
  }
};

export const saveIdea = async (type: IdeaType | 'text', content: string): Promise<SavedIdea> => {
  const userId = await requireUserId();

  const payload: any = {
    user_id: userId,
    type: type ?? 'text',
    content,
  };

  const { data, error } = await supabase.from('ideas').insert([payload]).select('*').single();

  if (error) throw error;
  return data as SavedIdea;
};

export const updateIdea = async (id: string, updates: Partial<SavedIdea>): Promise<SavedIdea[]> => {
  await requireUserId();
  const { error } = await supabase.from('ideas').update(updates).eq('id', id);
  if (error) throw error;
  return getSavedIdeas();
};

export const deleteIdea = async (id: string): Promise<SavedIdea[]> => {
  await requireUserId();
  const { error } = await supabase.from('ideas').delete().eq('id', id);
  if (error) throw error;
  return getSavedIdeas();
};
