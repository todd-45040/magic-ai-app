import { supabase } from '../supabase';
import type { AppSuggestion } from '../types';

// Supabase table: app_suggestions
// Columns used by the app:
//   id (text, pk), type (text), content (text), timestamp (bigint), status (text),
//   user_id (uuid/text), user_email (text)

export const addSuggestion = async (suggestionData: { type: 'bug' | 'feature' | 'general'; content: string; }): Promise<void> => {
  const id = `suggestion-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const { data: userData } = await supabase.auth.getUser();
  const currentUser = userData?.user ?? null;

  const newSuggestion: AppSuggestion = {
    id,
    type: suggestionData.type,
    content: suggestionData.content,
    timestamp: Date.now(),
    status: 'new',
    userId: currentUser ? currentUser.id : undefined,
    userEmail: currentUser ? (currentUser.email ?? undefined) : undefined
  };

  const { error } = await supabase
    .from('app_suggestions')
    .insert({
      id: newSuggestion.id,
      type: newSuggestion.type,
      content: newSuggestion.content,
      timestamp: newSuggestion.timestamp,
      status: newSuggestion.status,
      user_id: newSuggestion.userId ?? null,
      user_email: newSuggestion.userEmail ?? null
    });

  if (error) {
    console.error('Failed to save app suggestion to Supabase', error);
  }
};
