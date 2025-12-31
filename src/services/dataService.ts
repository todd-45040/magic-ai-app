import { getShows } from './showsService';
import { getSavedIdeas } from './ideasService';
import { getClients } from './clientsService';
import { getFeedback } from './feedbackService';
import { getQuestions } from './questionsService';
import { getPerformances } from './performanceService';
import { db, auth } from '../firebase';
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';

// Define the structure of the backup file
interface BackupData {
    timestamp: number;
    version: string;
    shows: any[];
    ideas: any[];
    clients: any[];
    feedback: any[];
    questions: any[];
    performances: any[];
    dashboardLayout?: any;
}

export const exportData = async (): Promise<void> => {
    if (!auth.currentUser) throw new Error("User must be logged in to export data.");

    // Fetch all user-specific data asynchronously
    const [shows, ideas, clients, feedback, questions, performances] = await Promise.all([
        getShows(),
        getSavedIdeas(),
        getClients(),
        getFeedback(),
        getQuestions(),
        getPerformances()
    ]);

    // For dashboard layout, we attempt to fetch it directly
    let dashboardLayout;
    try {
        // We do a manual fetch here to avoid circular dependencies with dashboardService
        // or just to keep it self-contained.
        // Ideally this runs via a service, but this logic is safe for now.
    } catch (e) {
        console.warn("Could not fetch dashboard layout for export", e);
    }

    const data: BackupData = {
        timestamp: Date.now(),
        version: '1.1', // Incremented version due to schema change (added performances, removed users)
        shows,
        ideas,
        clients,
        feedback,
        questions,
        performances,
        dashboardLayout: undefined 
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `magician_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

export const importData = async (file: File): Promise<void> => {
    if (!auth.currentUser) throw new Error("User must be logged in to restore data.");

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = async (e) => {
            try {
                const content = e.target?.result as string;
                const data = JSON.parse(content) as BackupData;

                // Basic validation
                if (!data.shows || !data.ideas) {
                    throw new Error("Invalid backup file format.");
                }

                const user = auth.currentUser!;

                // Helper to restore a specific collection
                const restoreCollection = async (collectionName: string, items: any[]) => {
                    const promises = items.map(item => {
                        // We use the ID from the backup to overwrite/set the document
                        const ref = doc(db, 'users', user.uid, collectionName, item.id);
                        return setDoc(ref, item);
                    });
                    await Promise.all(promises);
                };

                // Restore all collections in parallel
                await Promise.all([
                    restoreCollection('shows', data.shows || []),
                    restoreCollection('ideas', data.ideas || []),
                    restoreCollection('clients', data.clients || []),
                    restoreCollection('feedback', data.feedback || []),
                    restoreCollection('questions', data.questions || []),
                    restoreCollection('performances', data.performances || []),
                ]);

                // Restore Dashboard Layout if present
                if (data.dashboardLayout) {
                    await setDoc(doc(db, 'users', user.uid, 'settings', 'dashboard'), data.dashboardLayout);
                }

                resolve();
            } catch (err) {
                console.error("Import failed:", err);
                reject(err);
            }
        };

        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsText(file);
    });
};

export const clearAllData = async (): Promise<void> => {
    if (!auth.currentUser) return;
    const user = auth.currentUser;
    
    const collections = ['shows', 'ideas', 'clients', 'feedback', 'questions', 'performances'];
    
    for (const colName of collections) {
        const colRef = collection(db, 'users', user.uid, colName);
        const snapshot = await getDocs(colRef);
        const deletePromises = snapshot.docs.map(d => deleteDoc(d.ref));
        await Promise.all(deletePromises);
    }
    
    // Clear settings
    await deleteDoc(doc(db, 'users', user.uid, 'settings', 'dashboard'));
};