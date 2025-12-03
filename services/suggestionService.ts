import { db, auth } from '../firebase';
import { collection, doc, setDoc } from 'firebase/firestore';
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
    userId: currentUser ? currentUser.uid :