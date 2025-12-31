import { db, auth } from '../firebase';
import { collection, getDocs, doc, setDoc, updateDoc, getDoc } from 'firebase/firestore';
import type { Performance, ReactionType, AudienceReaction } from '../types';

const getCollectionRef = () => {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated");
    return collection(db, 'users', user.uid, 'performances');
};

export const getPerformances = async (): Promise<Performance[]> => {
    if (!auth.currentUser) return [];
    try {
        const snapshot = await getDocs(getCollectionRef());
        return snapshot.docs.map(d => d.data() as Performance);
    } catch (e) {
        console.error("Failed to get performances from Firestore", e);
        return [];
    }
};

export const startPerformance = async (showId: string): Promise<Performance> => {
    if (!auth.currentUser) throw new Error("User not authenticated");
    const id = `perf-${Date.now()}`;
    const newPerformance: Performance = {
        id,
        showId,
        startTime: Date.now(),
        reactions: [],
    };
    await setDoc(doc(db, 'users', auth.currentUser.uid, 'performances', id), newPerformance);
    return newPerformance;
};

export const endPerformance = async (performanceId: string): Promise<Performance | undefined> => {
    if (!auth.currentUser) return undefined;
    const perfRef = doc(db, 'users', auth.currentUser.uid, 'performances', performanceId);
    await updateDoc(perfRef, { endTime: Date.now() });
    const snap = await getDoc(perfRef);
    return snap.data() as Performance;
};

export const addReaction = async (performanceId: string, type: ReactionType): Promise<void> => {
    if (!auth.currentUser) return;
    
    const perfRef = doc(db, 'users', auth.currentUser.uid, 'performances', performanceId);
    const snap = await getDoc(perfRef);
    if (snap.exists()) {
        const perf = snap.data() as Performance;
        const newReaction: AudienceReaction = {
            type,
            timestamp: Date.now(),
        };
        const updatedReactions = [...perf.reactions, newReaction];
        await updateDoc(perfRef, { reactions: updatedReactions });
    }
};

export const getPerformanceById = async (performanceId: string): Promise<Performance | undefined> => {
    if (!auth.currentUser) return undefined;
    const snap = await getDoc(doc(db, 'users', auth.currentUser.uid, 'performances', performanceId));
    return snap.exists() ? snap.data() as Performance : undefined;
};

export const getPerformancesByShowId = async (showId: string): Promise<Performance[]> => {
    const all = await getPerformances();
    return all.filter(p => p.showId === showId).sort((a, b) => b.startTime - a.startTime);
};
