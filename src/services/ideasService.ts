import { db, auth } from '../firebase';
import { collection, getDocs, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import type { SavedIdea, IdeaType } from '../types';

const getCollectionRef = () => {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated");
    return collection(db, 'users', user.uid, 'ideas');
};

export const getSavedIdeas = async (): Promise<SavedIdea[]> => {
  if (!auth.currentUser) return [];
  try {
    const snapshot = await getDocs(getCollectionRef());
    const ideas = snapshot.docs.map(d => d.data() as SavedIdea);
    return ideas.sort((a, b) => b.timestamp - a.timestamp);
  } catch (error) {
    console.error("Failed to load ideas from Firestore", error);
    return [];
  }
};

export const saveIdea = async (type: IdeaType, content: string, title?: string): Promise<SavedIdea> => {
  if (!auth.currentUser) throw new Error("User must be logged in to save ideas");
  
  const id = `idea-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const newIdea: SavedIdea = {
    id,
    type,
    title,
    content,
    timestamp: Date.now(),
    tags: [],
  };

  try {
    await setDoc(doc(db, 'users', auth.currentUser.uid, 'ideas', id), newIdea);
  } catch (error) {
    console.error("Failed to save idea to Firestore", error);
  }

  return newIdea;
};

export const updateIdea = async (id: string, updates: Partial<SavedIdea>): Promise<SavedIdea[]> => {
  if (auth.currentUser) {
      await updateDoc(doc(db, 'users', auth.currentUser.uid, 'ideas', id), updates);
  }
  return getSavedIdeas();
};

export const deleteIdea = async (id: string): Promise<SavedIdea[]> => {
  if (auth.currentUser) {
      await deleteDoc(doc(db, 'users', auth.currentUser.uid, 'ideas', id));
  }
  return getSavedIdeas();
};
