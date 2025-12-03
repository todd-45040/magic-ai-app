import { db, auth } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import type { DashboardLayout, DashboardWidget } from '../types';
import { RabbitIcon, ClockIcon, StarIcon, BookmarkIcon, WandIcon } from '../components/icons';

export const WIDGETS: DashboardWidget[] = [
    { id: 'quick-actions', title: 'Quick Actions', icon: RabbitIcon },
    { id: 'upcoming-tasks', title: 'Upcoming Tasks', icon: ClockIcon },
    { id: 'latest-feedback', title: 'Latest Feedback', icon: StarIcon },
    { id: 'recent-idea', title: 'Last Saved Idea', icon: BookmarkIcon },
    { id: 'featured-tools', title: 'Featured Tools', icon: WandIcon },
];

export const getDefaultLayout = (): DashboardLayout => ({
    visible: ['quick-actions', 'featured-tools', 'upcoming-tasks', 'latest-feedback', 'recent-idea'],
    hidden: [],
});

export const getLayout = async (): Promise<DashboardLayout> => {
    if (!auth.currentUser) return getDefaultLayout();
    try {
        const snap = await getDoc(doc(db, 'users', auth.currentUser.uid, 'settings', 'dashboard'));
        if (snap.exists()) {
            const parsed = snap.data() as DashboardLayout;
            const allWidgetIds = WIDGETS.map(w => w.id);
            const validVisible = parsed.visible.filter(id => allWidgetIds.includes(id));
            const validHidden = parsed.hidden.filter(id => allWidgetIds.includes(id));
            const newIds = allWidgetIds.filter(id => !validVisible.includes(id) && !validHidden.includes(id));
            return {
                visible: [...validVisible, ...newIds],
                hidden: validHidden,
            };
        }
    } catch (error) {
        console.error("Failed to load dashboard layout", error);
    }
    return getDefaultLayout();
};

export const saveLayout = async (layout: DashboardLayout): Promise<void> => {
    if (auth.currentUser) {
        await setDoc(doc(db, 'users', auth.currentUser.uid, 'settings', 'dashboard'), layout);
    }
};
