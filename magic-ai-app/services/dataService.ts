
import { getShows } from './showsService';
import { getSavedIdeas } from './ideasService';
import { getClients } from './clientsService';
import { getFeedback } from './feedbackService';
import { getQuestions } from './questionsService';
import { getUsers } from './usersService';

// Define the structure of the backup file
interface BackupData {
    timestamp: number;
    version: string;
    shows: any[];
    ideas: any[];
    clients: any[];
    feedback: any[];
    questions: any[];
    users: any[];
    dashboardLayout?: any;
}

// Keys used in localStorage
const KEYS = {
    shows: 'magician_show_planner_shows',
    ideas: 'magician_saved_ideas',
    clients: 'magician_clients_db',
    feedback: 'magician_audience_feedback',
    questions: 'magician_audience_questions',
    users: 'magician_ai_users_db',
    dashboard: 'magician_dashboard_layout'
};

// FIX: Marked the function as async to handle the Promise returned by getUsers().
export const exportData = async (): Promise<void> => {
    // FIX: Added await to getShows() and getSavedIdeas() as they return Promises, resolving errors in dataService.ts.
    const data: BackupData = {
        timestamp: Date.now(),
        version: '1.0',
        shows: await getShows(),
        ideas: await getSavedIdeas(),
        clients: getClients(),
        feedback: getFeedback(),
        questions: getQuestions(),
        // FIX: Added await to correctly resolve the Promise returned by getUsers().
        users: await getUsers(),
        dashboardLayout: localStorage.getItem(KEYS.dashboard) ? JSON.parse(localStorage.getItem(KEYS.dashboard)!) : undefined
    };
    try { localStorage.setItem("maw_last_backup_at", String(Date.now())); } catch {}

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

export const importData = (file: File): Promise<void> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                const content = e.target?.result as string;
                const data = JSON.parse(content) as BackupData;

                // Basic validation
                if (!data.shows || !data.ideas) {
                    throw new Error("Invalid backup file format.");
                }

                // Restore data to localStorage
                localStorage.setItem(KEYS.shows, JSON.stringify(data.shows));
                localStorage.setItem(KEYS.ideas, JSON.stringify(data.ideas));
                localStorage.setItem(KEYS.clients, JSON.stringify(data.clients || []));
                localStorage.setItem(KEYS.feedback, JSON.stringify(data.feedback || []));
                localStorage.setItem(KEYS.questions, JSON.stringify(data.questions || []));
                if (data.users) localStorage.setItem(KEYS.users, JSON.stringify(data.users));
                if (data.dashboardLayout) localStorage.setItem(KEYS.dashboard, JSON.stringify(data.dashboardLayout));

                resolve();
            } catch (err) {
                reject(err);
            }
        };

        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsText(file);
    });
};

export const clearAllData = (): void => {
    Object.values(KEYS).forEach(key => localStorage.removeItem(key));
    // Note: This does not clear authentication state (magician_ai_user) to keep user logged in,
    // unless explicitely desired. Usually better to keep auth.
};
