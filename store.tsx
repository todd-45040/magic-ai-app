
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
    | { type: 'SET_SHOWS'; payload: Show[] }
    | { type: 'SET_CLIENTS'; payload: Client[] }
    | { type: 'SET_IDEAS'; payload: SavedIdea[] }
    | { type: 'SET_FEEDBACK'; payload: Feedback[] };

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
        case 'SET_SHOWS':
            return { ...state, shows: action.payload };
        case 'SET_CLIENTS':
            return { ...state, clients: action.payload };
        case 'SET_IDEAS':
            return { ...state, ideas: action.payload };
        case 'SET_FEEDBACK':
            return { ...state, feedback: action.payload };
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
        const loadInitialData = async () => {
            if (!state.isLoaded) {
                try {
                    const [shows, ideas, feedback] = await Promise.all([
                        showsService.getShows(),
                        ideasService.getSavedIdeas(),
                        feedbackService.getFeedback()
                    ]);
                    const clients = await clientsService.getClients();
                    
                    dispatch({ 
                        type: 'SET_ALL_DATA', 
                        payload: { shows, clients, feedback, ideas } 
                    });
                } catch (error) {
                    console.error("Failed to load initial data:", error);
                }
            }
        };
        loadInitialData();
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

export const refreshAllData = async (dispatch: Dispatch<Action>) => {
    const [shows, ideas, feedback, clients] = await Promise.all([
        showsService.getShows(),
        ideasService.getSavedIdeas(),
        feedbackService.getFeedback(),
        clientsService.getClients()
    ]);

    dispatch({
        type: 'SET_ALL_DATA',
        payload: { shows, clients, feedback, ideas }
    });
};

export const refreshShows = async (dispatch: Dispatch<Action>) => {
    const shows = await showsService.getShows();
    dispatch({ type: 'SET_SHOWS', payload: shows });
};

export const refreshClients = async (dispatch: Dispatch<Action>) => {
    const clients = await clientsService.getClients();
    dispatch({ type: 'SET_CLIENTS', payload: clients });
};

export const refreshIdeas = async (dispatch: Dispatch<Action>) => {
    const ideas = await ideasService.getSavedIdeas();
    dispatch({ type: 'SET_IDEAS', payload: ideas });
};

export const refreshFeedback = async (dispatch: Dispatch<Action>) => {
    const feedback = await feedbackService.getFeedback();
    dispatch({ type: 'SET_FEEDBACK', payload: feedback });
};
