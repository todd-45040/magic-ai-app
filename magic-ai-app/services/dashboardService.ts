import type { DashboardLayout, DashboardWidget, WidgetId } from '../types';
import { RabbitIcon, ClockIcon, StarIcon, BookmarkIcon, WandIcon } from '../components/icons';


const LAYOUT_STORAGE_KEY = 'magician_dashboard_layout';

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

export const getLayout = (): DashboardLayout => {
    try {
        const savedData = localStorage.getItem(LAYOUT_STORAGE_KEY);
        if (savedData) {
            const parsed = JSON.parse(savedData) as DashboardLayout;
            // Validate saved layout against current widgets
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
        console.error("Failed to load dashboard layout from localStorage", error);
    }
    return getDefaultLayout();
};

export const saveLayout = (layout: DashboardLayout): void => {
    try {
        localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
    } catch (error) {
        console.error("Failed to save dashboard layout to localStorage", error);
    }
};