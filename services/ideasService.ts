import type { SavedIdea, IdeaType } from '../types';

const IDEAS_STORAGE_KEY = 'magician_saved_ideas';

export const getSavedIdeas = (): SavedIdea[] => {
  try {
    const savedData = localStorage.getItem(IDEAS_STORAGE_KEY);
    if (savedData) {
      const ideas = JSON.parse(savedData) as SavedIdea[];
      // Sort by newest first
      return ideas.sort((a, b) => b.timestamp - a.timestamp);
    }
  } catch (error) {
    console.error("Failed to load ideas from localStorage", error);
  }
  return [];
};

export const saveIdea = (type: IdeaType, content: string, title?: string): SavedIdea => {
  const ideas = getSavedIdeas();
  const newIdea: SavedIdea = {
    id: `idea-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type,
    title,
    content,
    timestamp: Date.now(),
    tags: [],
  };

  const updatedIdeas = [newIdea, ...ideas];

  try {
    localStorage.setItem(IDEAS_STORAGE_KEY, JSON.stringify(updatedIdeas));
  } catch (error) {
    console.error("Failed to save idea to localStorage", error);
  }

  return newIdea;
};

export const updateIdea = (id: string, updates: Partial<SavedIdea>): SavedIdea[] => {
  let ideas = getSavedIdeas();
  const ideaIndex = ideas.findIndex(idea => idea.id === id);
  if (ideaIndex > -1) {
    ideas[ideaIndex] = { ...ideas[ideaIndex], ...updates };
    try {
      localStorage.setItem(IDEAS_STORAGE_KEY, JSON.stringify(ideas));
    } catch (error) {
      console.error("Failed to update idea in localStorage", error);
    }
  }
  return ideas;
};

export const deleteIdea = (id: string): SavedIdea[] => {
  let ideas = getSavedIdeas();
  const updatedIdeas = ideas.filter(idea => idea.id !== id);

  try {
    localStorage.setItem(IDEAS_STORAGE_KEY, JSON.stringify(updatedIdeas));
    return updatedIdeas;
  } catch (error) {
    console.error("Failed to delete idea from localStorage", error);
    return ideas; // return original list on failure
  }
};