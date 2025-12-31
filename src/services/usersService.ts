import { db } from '../firebase';
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, getDoc, query, where } from 'firebase/firestore';
import type { User, Membership } from '../types';
import { ADMIN_EMAIL } from '../constants';

const USERS_COLLECTION = 'users';

// Helper to get all users from Firestore
export const getUsers = async (): Promise<User[]> => {
  try {
    const querySnapshot = await getDocs(collection(db, USERS_COLLECTION));
    const users: User[] = [];
    querySnapshot.forEach((doc) => {
      users.push(doc.data() as User);
    });
    return users;
  } catch (error) {
    console.error("Failed to get users from Firestore", error);
    return [];
  }
};

// Retrieve a single user by their UID (which matches the doc ID)
export const getUserProfile = async (uid: string): Promise<User | null> => {
    try {
        const userDoc = await getDoc(doc(db, USERS_COLLECTION, uid));
        if (userDoc.exists()) {
            return userDoc.data() as User;
        }
        return null;
    } catch (error) {
        console.error("Failed to get user profile", error);
        return null;
    }
};

// When a user registers or logs in for the first time
export const registerOrUpdateUser = async (user: User, uid: string): Promise<void> => {
  try {
      const userRef = doc(db, USERS_COLLECTION, uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
          // User exists, update basic info but preserve critical fields
          await updateDoc(userRef, { 
              email: user.email,
          });
      } else {
          // New user logic: Always start on Trial unless manually set otherwise before save
          // If the incoming user has no membership set or it's just 'trial' without a date, initialize it.
          
          if (!['amateur', 'semi-pro', 'professional'].includes(user.membership)) {
              const trialEndDate = Date.now() + 14 * 24 * 60 * 60 * 1000;
              user.membership = 'trial';
              user.trialEndDate = trialEndDate;
          }
          await setDoc(userRef, user);
      }
  } catch (error) {
      console.error("Failed to register/update user in Firestore", error);
  }
};

// Update a user's membership status (Admin function mostly)
export const updateUserMembership = async (email: string, membership: Membership): Promise<User[]> => {
  try {
      // Efficiently find the user by email
      const q = query(collection(db, USERS_COLLECTION), where("email", "==", email));
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
          const targetDoc = snapshot.docs[0];
          const updates: any = { membership };
          if (membership !== 'trial') {
              updates.trialEndDate = null; // Remove trial end date if changing tier
          }
          await updateDoc(targetDoc.ref, updates);
      } else {
          console.warn(`User with email ${email} not found.`);
      }
      
      return await getUsers();
  } catch (error) {
      console.error("Failed to update membership", error);
      return [];
  }
};

// Delete a user from the database
export const deleteUser = async (email: string): Promise<User[]> => {
    try {
        const q = query(collection(db, USERS_COLLECTION), where("email", "==", email));
        const snapshot = await getDocs(q);

        const deletePromises: Promise<void>[] = [];
        snapshot.forEach(d => {
            deletePromises.push(deleteDoc(d.ref));
        });
        await Promise.all(deletePromises);

        return await getUsers();
    } catch (error) {
        console.error("Failed to delete user", error);
        return [];
    }
};

// Add a user manually (Admin)
export const addUser = async (email: string, membership: Membership): Promise<User[] | { error: string }> => {
    try {
        const lowerCaseEmail = email.toLowerCase();
        
        // Check if user exists efficiently
        const q = query(collection(db, USERS_COLLECTION), where("email", "==", lowerCaseEmail));
        const snapshot = await getDocs(q);
        
        if (!snapshot.empty) {
            return { error: 'A user with this email already exists.' };
        }

        // We use a random ID for placeholder users
        const placeholderUid = `placeholder-${Date.now()}`;
        const newUser: User = {
            email: lowerCaseEmail,
            membership,
            isAdmin: lowerCaseEmail === ADMIN_EMAIL,
        };

        await setDoc(doc(db, USERS_COLLECTION, placeholderUid), newUser);
        return await getUsers();
    } catch (error) {
        console.error("Failed to add user", error);
        return { error: "Failed to add user to database." };
    }
};

// Check trial status
export const checkAndUpdateUserTrialStatus = async (user: User, uid: string): Promise<User> => {
    if (user.membership === 'trial' && user.trialEndDate && user.trialEndDate < Date.now()) {
        const updatedUser = { ...user, membership: 'expired' as Membership };
        delete updatedUser.trialEndDate;
        
        await updateDoc(doc(db, USERS_COLLECTION, uid), {
            membership: 'expired',
            trialEndDate: null
        } as any);
        
        return updatedUser;
    }
    return user;
};