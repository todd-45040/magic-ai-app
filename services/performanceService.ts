import type { Performance, ReactionType, AudienceReaction } from '../types';

const PERFORMANCES_STORAGE_KEY = 'magician_performances';

const getPerformances = (): Performance[] => {
    try {
        const data = localStorage.getItem(PERFORMANCES_STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        console.error("Failed to get performances from localStorage", e);
        return [];
    }
};

const savePerformances = (performances: Performance[]): void => {
    try {
        localStorage.setItem(PERFORMANCES_STORAGE_KEY, JSON.stringify(performances));
    } catch (e) {
        console.error("Failed to save performances to localStorage", e);
    }
};

export const startPerformance = (showId: string): Performance => {
    const performances = getPerformances();
    const newPerformance: Performance = {
        id: `perf-${Date.now()}`,
        showId,
        startTime: Date.now(),
        reactions: [],
    };
    savePerformances([...performances, newPerformance]);
    return newPerformance;
};

export const endPerformance = (performanceId: string): Performance | undefined => {
    const performances = getPerformances();
    const performanceIndex = performances.findIndex(p => p.id === performanceId);
    if (performanceIndex > -1) {
        performances[performanceIndex].endTime = Date.now();
        savePerformances(performances);
        return performances[performanceIndex];
    }
    return undefined;
};

export const addReaction = (performanceId: string, type: ReactionType): void => {
    const performances = getPerformances();
    const performanceIndex = performances.findIndex(p => p.id === performanceId);
    if (performanceIndex > -1) {
        const newReaction: AudienceReaction = {
            type,
            timestamp: Date.now(),
        };
        performances[performanceIndex].reactions.push(newReaction);
        savePerformances(performances);
    }
};

export const getPerformanceById = (performanceId: string): Performance | undefined => {
    const performances = getPerformances();
    return performances.find(p => p.id === performanceId);
};

export const getPerformancesByShowId = (showId: string): Performance[] => {
    const performances = getPerformances();
    return performances.filter(p => p.showId === showId).sort((a, b) => b.startTime - a.startTime);
};
