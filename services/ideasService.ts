
import { supabase } from '../supabase';
import type { SavedIdea, IdeaType } from '../types';

export const getSavedIdeas = async (): Promise<SavedIdea[]> => {
  const { data: userData } = await supabase.auth.getUser();
  const sbUser = userData?.user ?? null;
  if (!sbUser) return [];

  const { data, error } = await supabase
    .from('ideas')
    .select('*')
    .eq('user_id', sbUser.id)
    .order('timestamp', { ascending: false });

  if (error) return [];
  return data as SavedIdea[];
};

export const saveIdea = async (type: IdeaType, content: string, title?: string): Promise<SavedIdea> => {
  const { data: userData } = await supabase.auth.getUser();
  const sbUser = userData?.user ?? null;
  if (!sbUser) throw new Error("Unauthorized");
  
  const { data, error } = await supabase
    .from('ideas')
    .insert([{
      type,
      title,
      content,
      user_id: sbUser.id,
      timestamp: new Date().toISOString(),
      tags: []
    }])
    .select()
    .single();

  if (error) throw error;
  return data as SavedIdea;
};

export const updateIdea = async (id: string, updates: Partial<SavedIdea>): Promise<SavedIdea[]> => {
  await supabase.from('ideas').update(updates).eq('id', id);
  return getSavedIdeas();
};

export const deleteIdea = async (id: string): Promise<SavedIdea[]> => {
  await supabase.from('ideas').delete().eq('id', id);
  return getSavedIdeas();
};