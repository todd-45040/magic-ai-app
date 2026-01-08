import { supabase } from '../supabase';
import type { SavedIdea, IdeaType } from '../types';

/**
 * Notes:
 * - This service assumes a Supabase table named: public.ideas
 * - Columns expected by the app (based on existing UI usage):
 *   id (uuid/text), user_id (uuid/text), type (text), content (text), timestamp (timestamptz)
 *
 * If your schema uses created_at instead of timestamp, either:
 * - create a generated view/column named timestamp, or
 * - update the order() call below to use created_at.
 */

async function requireUserId(): Promise<string> {
  const { data: userData, error } = await supabase.auth.getUser();
  if (error) throw error;
  const sbUser = userData?.user ?? null;
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
      .order('timestamp', { ascending: false });

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
    // Keep compatibility with existing code that orders by 'timestamp'
    timestamp: new Date().toISOString(),
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
