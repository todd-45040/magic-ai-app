import type { Client } from '../types';

const CLIENTS_STORAGE_KEY = 'magician_clients_db';

// Helper to get all clients from our simulated DB
export const getClients = (): Client[] => {
  try {
    const data = localStorage.getItem(CLIENTS_STORAGE_KEY);
    if (data) {
        const clients = JSON.parse(data) as Client[];
        // Sort by creation date, newest first
        return clients.sort((a, b) => b.createdAt - a.createdAt);
    }
    return [];
  } catch (error) {
    console.error("Failed to get clients from localStorage", error);
    return [];
  }
};

// Helper to save all clients to our simulated DB
const saveClients = (clients: Client[]): void => {
  try {
    localStorage.setItem(CLIENTS_STORAGE_KEY, JSON.stringify(clients));
  } catch (error) {
    console.error("Failed to save clients to localStorage", error);
  }
};

export const addClient = (clientData: Omit<Client, 'id' | 'createdAt'>): Client[] => {
    const clients = getClients();
    const newClient: Client = {
        id: `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        ...clientData,
        createdAt: Date.now(),
    };
    const updatedClients = [newClient, ...clients];
    saveClients(updatedClients);
    return getClients(); // Return fresh sorted list
};

export const updateClient = (id: string, updates: Partial<Omit<Client, 'id' | 'createdAt'>>): Client[] => {
    let clients = getClients();
    const clientIndex = clients.findIndex(c => c.id === id);
    if (clientIndex > -1) {
        clients[clientIndex] = { ...clients[clientIndex], ...updates };
        saveClients(clients);
    }
    return getClients(); // Return fresh sorted list
};


export const deleteClient = (id: string): Client[] => {
    let clients = getClients();
    const updatedClients = clients.filter(c => c.id !== id);
    saveClients(updatedClients);
    return updatedClients;
};