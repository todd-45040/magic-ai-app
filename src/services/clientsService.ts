import { db, auth } from '../firebase';
import { collection, getDocs, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import type { Client } from '../types';

const getCollectionRef = () => {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated");
    return collection(db, 'users', user.uid, 'clients');
};

export const getClients = async (): Promise<Client[]> => {
  if (!auth.currentUser) return [];
  try {
    const snapshot = await getDocs(getCollectionRef());
    const clients = snapshot.docs.map(d => d.data() as Client);
    return clients.sort((a, b) => b.createdAt - a.createdAt);
  } catch (error) {
    console.error("Failed to get clients from Firestore", error);
    return [];
  }
};

export const addClient = async (clientData: Omit<Client, 'id' | 'createdAt'>): Promise<Client[]> => {
    if (auth.currentUser) {
        const id = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const newClient: Client = {
            id,
            ...clientData,
            createdAt: Date.now(),
        };
        await setDoc(doc(db, 'users', auth.currentUser.uid, 'clients', id), newClient);
    }
    return getClients();
};

export const updateClient = async (id: string, updates: Partial<Omit<Client, 'id' | 'createdAt'>>): Promise<Client[]> => {
    if (auth.currentUser) {
        await updateDoc(doc(db, 'users', auth.currentUser.uid, 'clients', id), updates);
    }
    return getClients();
};

export const deleteClient = async (id: string): Promise<Client[]> => {
    if (auth.currentUser) {
        await deleteDoc(doc(db, 'users', auth.currentUser.uid, 'clients', id));
    }
    return getClients();
};
