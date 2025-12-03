import type { User, Membership } from '../types';
import { ADMIN_EMAIL } from '../constants';

const USERS_DB_KEY = 'magician_ai_users_db';

// Helper to get all users from our simulated DB
export const getUsers = (): User[] => {
  try {
    const data = localStorage.getItem(USERS_DB_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error("Failed to get users from localStorage", error);
    return [];
  }
};

// Helper to save all users to our simulated DB
const saveUsers = (users: User[]): void => {
  try {
    localStorage.setItem(USERS_DB_KEY, JSON.stringify(users));
  } catch (error) {
    console.error("Failed to save users to localStorage", error);
  }
};

// When a user logs in, add them to the "database" if they don't exist
export const registerOrUpdateUser = (newUser: User): void => {
  const users = getUsers();
  const existingUserIndex = users.findIndex(u => u.email === newUser.email);

  if (existingUserIndex > -1) {
    // User exists, update their info but preserve their original trial date unless it's a new login setting it
    const existingUser = users[existingUserIndex];
    users[existingUserIndex] = { ...existingUser, ...newUser };
  } else {
    // New user, if they are not admin and have a special membership, set them on a trial
    if (newUser.membership === 'free') {
        const trialEndDate = Date.now() + 14 * 24 * 60 * 60 * 1000;
        newUser.membership = 'trial';
        newUser.trialEndDate = trialEndDate;
    }
    users.push(newUser);
  }

  saveUsers(users);
};

// Update a user's membership status
export const updateUserMembership = (email: string, membership: Membership): User[] => {
  const users = getUsers();
  const userIndex = users.findIndex(u => u.email === email);

  if (userIndex > -1) {
    users[userIndex].membership = membership;
    // When manually changing membership, clear trial date if it's no longer a trial
    if (membership !== 'trial') {
        delete users[userIndex].trialEndDate;
    }
    saveUsers(users);
  }
  return users;
};

// Delete a user from the database
export const deleteUser = (email: string): User[] => {
  let users = getUsers();
  users = users.filter(u => u.email !== email);
  saveUsers(users);
  return users;
};

// New function to add a user, typically by an admin
export const addUser = (email: string, membership: Membership): User[] | { error: string } => {
  const users = getUsers();
  const lowerCaseEmail = email.toLowerCase();
  
  if (users.find(u => u.email === lowerCaseEmail)) {
    return { error: 'A user with this email already exists.' };
  }

  const newUser: User = {
    email: lowerCaseEmail,
    membership,
    isAdmin: lowerCaseEmail === ADMIN_EMAIL, // Automatically assign admin if it's the admin email
  };

  const updatedUsers = [...users, newUser];
  saveUsers(updatedUsers);
  return getUsers(); // Return the fresh, sorted list
};


// New function to check trial status
export const checkAndUpdateUserTrialStatus = (user: User): User => {
    if (user.membership === 'trial' && user.trialEndDate && user.trialEndDate < Date.now()) {
        const updatedUser = { ...user, membership: 'free' as Membership };
        delete updatedUser.trialEndDate;
        
        // Also update the user in the main database
        updateUserMembership(user.email, 'free');
        
        return updatedUser;
    }
    return user;
};