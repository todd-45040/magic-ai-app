import type { Feedback } from '../types';

const FEEDBACK_STORAGE_KEY = 'magician_audience_feedback';

export const getFeedback = (): Feedback[] => {
  try {
    const savedData = localStorage.getItem(FEEDBACK_STORAGE_KEY);
    if (savedData) {
      const feedback = JSON.parse(savedData) as Feedback[];
      return feedback.sort((a, b) => b.timestamp - a.timestamp);
    }
  } catch (error) {
    console.error("Failed to load feedback from localStorage", error);
  }
  return [];
};

export const addFeedback = (feedbackData: { rating: number; tags: string[]; comment: string; name?: string; showTitle?: string; magicianName?: string; location?: string; performanceDate?: number; }): void => {
  const allFeedback = getFeedback();
  const newFeedback: Feedback = {
    id: `feedback-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    ...feedbackData,
    timestamp: Date.now(),
  };

  const updatedFeedback = [newFeedback, ...allFeedback];

  try {
    localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(updatedFeedback));
  } catch (error) {
    console.error("Failed to save feedback to localStorage", error);
  }
};