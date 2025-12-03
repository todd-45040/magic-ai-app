import { db, auth } from '../firebase';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import type { Question } from '../types';

export const getQuestions = async (): Promise<Question[]> => {
  if (!auth.currentUser) return [];
  try {
    const snapshot = await getDocs(collection(db, 'users', auth.currentUser.uid, 'questions'));
    const questions = snapshot.docs.map(d => d.data() as Question);
    return questions.sort((a, b) => b.timestamp - a.timestamp);
  } catch (error) {
    console.error("Failed to load questions from Firestore", error);
    return [];
  }
};

export const addQuestion = async (questionData: { question: string; name?: string; answer?: string; }): Promise<void> => {
  if (auth.currentUser) {
      const id = `question-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const newQuestion: Question = {
        id,
        ...questionData,
        timestamp: Date.now(),
      };
      await setDoc(doc(db, 'users', auth.currentUser.uid, 'questions', id), newQuestion);
  }
};
