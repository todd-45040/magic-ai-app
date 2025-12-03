import { db, auth } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';
import type { AppSuggestion } from '../types';

export const addSuggestion = async (suggestionData: { type: 'bug' | 'feature' | 'general'; content: string; }): Promise<void> => {
  const id = `suggestion-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const currentUser = auth.currentUser;

  const newSuggestion: AppSuggestion = {
    id,
    type: suggestionData.type,
    content: suggestionData.content,
    timestamp: Date.now(),
    status: 'new',
    userId: currentUser ? currentUser.uid : undefined,
    userEmail: currentUser ? currentUser.email || undefined : undefined
  };

  // Save to a root-level collection so admins can see all suggestions
  await setDoc(doc(db, 'app_suggestions', id), newSuggestion);
};