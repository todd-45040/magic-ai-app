import { db, auth } from '../firebase';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import type { Feedback } from '../types';

export const getFeedback = async (): Promise<Feedback[]> => {
  if (!auth.currentUser) return [];
  try {
    const snapshot = await getDocs(collection(db, 'users', auth.currentUser.uid, 'feedback'));
    const feedback = snapshot.docs.map(d => d.data() as Feedback);
    return feedback.sort((a, b) => b.timestamp - a.timestamp);
  } catch (error) {
    console.error("Failed to load feedback from Firestore", error);
    return [];
  }
};

export const addFeedback = async (feedbackData: { rating: number; tags: string[]; comment: string; name?: string; showTitle?: string; magicianName?: string; location?: string; performanceDate?: number; }): Promise<void> => {
  // Note: For Audience Mode (unauthenticated users), writing to a specific magician's profile 
  // would require knowing the magician's UID. For this MVP migration, we only support writing
  // if the current user is logged in (testing mode) or if we implement a public profile lookup.
  // We will assume for now it writes to the currently logged in user's feedback collection.
  
  if (auth.currentUser) {
      const id = `feedback-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const newFeedback: Feedback = {
        id,
        ...feedbackData,
        timestamp: Date.now(),
      };
      await setDoc(doc(db, 'users', auth.currentUser.uid, 'feedback', id), newFeedback);
  } else {
      console.warn("Feedback not saved to cloud: User not authenticated or target magician unknown.");
  }
};
