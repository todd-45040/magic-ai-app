import type { Question } from '../types';

const QUESTIONS_STORAGE_KEY = 'magician_audience_questions';

export const getQuestions = (): Question[] => {
  try {
    const savedData = localStorage.getItem(QUESTIONS_STORAGE_KEY);
    if (savedData) {
      const questions = JSON.parse(savedData) as Question[];
      return questions.sort((a, b) => b.timestamp - a.timestamp);
    }
  } catch (error) {
    console.error("Failed to load questions from localStorage", error);
  }
  return [];
};

export const addQuestion = (questionData: { question: string; name?: string; answer?: string; }): void => {
  const allQuestions = getQuestions();
  const newQuestion: Question = {
    id: `question-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    ...questionData,
    timestamp: Date.now(),
  };

  const updatedQuestions = [newQuestion, ...allQuestions];

  try {
    localStorage.setItem(QUESTIONS_STORAGE_KEY, JSON.stringify(updatedQuestions));
  } catch (error)
 {
    console.error("Failed to save question to localStorage", error);
  }
};