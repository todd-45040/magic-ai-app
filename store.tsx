import React, { createContext, useReducer, useContext, useEffect, Dispatch, ReactNode } from 'react';
import type { Show, Client, Feedback, SavedIdea } from './types';
import * as showsService from './services/showsService';
import * as clientsService from './services/clientsService';
import * as feedbackService from './services/feedbackService';
import * as ideasService from './services/ideasService';

// --- STATE & ACTION TYPES ---

interface AppState {
    shows: Show[];
    clients: Client[];
    feedback: Feedback[];
    ideas: SavedIdea[];
    isLoaded: boolean;
}

type Action =
    | { type: 'SET_ALL_DATA'; payload: Omit<AppState, 'isLoaded'> }
    | { type: 'REFRESH_SHOWS' }
    | { type: 'REFRESH_CLIENTS' }
    | { type: 'REFRESH_IDEAS' }
    | { type: 'REFRESH_FEEDBACK' };

// --- REDUCER ---

const initialState: AppState = {
    shows: [],
    clients: [],
    feedback: [],
    ideas: [],
    isLoaded: false,
};

const AppReducer = (state: AppState, action: Action): AppState => {
    switch (action.type) {
        case 'SET_ALL_DATA':
            return { ...state, ...action.payload, isLoaded: true };
        case 'REFRESH_SHOWS':
            return { ...state, shows: showsService.getShows() };
        case 'REFRESH_CLIENTS':
            return { ...state, clients: clientsService.getClients() };
        case 'REFRESH_IDEAS':
            return { ...state, ideas: ideasService.getSavedIdeas() };
        case 'REFRESH_FEEDBACK':
            return { ...state, feedback: feedbackService.getFeedback() };
        default:
            return state;
    }
};

// --- CONTEXT ---

const AppStateContext = createContext<AppState>(initialState);
const AppDispatchContext = createContext<Dispatch<Action>>(() => null);

// --- PROVIDER ---

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [state, dispatch] = useReducer(AppReducer, initialState);

    useEffect(() => {
        // Initial data load on app start
        if (!state.isLoaded) {
            const allShows = showsService.getShows();
            const allClients = clientsService.getClients();
            const allFeedback = feedbackService.getFeedback();
            const allIdeas = ideasService.getSavedIdeas();
            dispatch({ type: 'SET_ALL_DATA', payload: { shows: allShows, clients: allClients, feedback: allFeedback, ideas: allIdeas } });
        }
    }, [state.isLoaded]);

    return (
        <AppStateContext.Provider value={state}>
            <AppDispatchContext.Provider value={dispatch}>
                {children}
            </AppDispatchContext.Provider>
        </AppStateContext.Provider>
    );
};

// --- HOOKS & HELPERS ---

export const useAppState = () => useContext(AppStateContext);
export const useAppDispatch = () => useContext(AppDispatchContext);

// Export helper functions to be called from components
export const refreshAllData = (dispatch: Dispatch<Action>) => {
    dispatch({
        type: 'SET_ALL_DATA',
        payload: {
            shows: showsService.getShows(),
            clients: clientsService.getClients(),
            feedback: feedbackService.getFeedback(),
            ideas: ideasService.getSavedIdeas(),
        }
    });
};

export const refreshShows = (dispatch: Dispatch<Action>) => dispatch({ type: 'REFRESH_SHOWS' });
export const refreshClients = (dispatch: Dispatch<Action>) => dispatch({ type: 'REFRESH_CLIENTS' });
export const refreshIdeas = (dispatch: Dispatch<Action>) => dispatch({ type: 'REFRESH_IDEAS' });
export const refreshFeedback = (dispatch: Dispatch<Action>) => dispatch({ type: 'REFRESH_FEEDBACK' });
