
import React, { useState, useEffect } from 'react';
import type { User, Membership } from '../types';
import { getUsers, updateUserMembership, deleteUser, addUser } from '../services/usersService';
import { TrashIcon, UsersCogIcon } from './icons';

const MemberManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // New state for the add user form
  const [newEmail, setNewEmail] = useState('');
  const [newMembership, setNewMembership] = useState<Membership>('free');
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    // FIX: getUsers is async, handle with async IIFE
    const fetchUsers = async () => {
        const fetchedUsers = await getUsers();
        setUsers(fetchedUsers);
        setLoading(false);
    };
    fetchUsers();
  }, []);

  // FIX: Make async to await updateUserMembership
  const handleMembershipChange = async (email: string, newMembership: Membership) => {
    const updatedUsers = await updateUserMembership(email, newMembership);
    setUsers(updatedUsers);
  };

  // FIX: Make async to await deleteUser
  const handleDeleteUser = async (email: string) => {
    if (window.confirm(`Are you sure you want to delete the user ${email}? This action cannot be undone.`)) {
        const updatedUsers = await deleteUser(email);
        setUsers(updatedUsers);
    }
  };

  // FIX: Make async to await addUser and check resolved value type
  const handleAddUser = async (e: React.FormEvent) => {
      e.preventDefault();
      setAddError(null);

      if (!newEmail.trim()) {
          setAddError("Email address cannot be empty.");
          return;
      }
      if (!/\S+@\S+\.\S+/.test(newEmail)) {
          setAddError("Please enter a valid email address.");
          return;
      }

      try {
          const result = await addUser(newEmail, newMembership);

          if (result && 'error' in result) {
              setAddError(result.error);
          } else if (Array.isArray(result)) {
              setUsers(result);
              setNewEmail('');
              setNewMembership('free');
          }
      } catch (err: unknown) {
          // FIX: Handle 'unknown' error type
          if (err instanceof Error) {
              setAddError(err.message);
          } else {
              setAddError("An unexpected error occurred.");
          }
      }
  };


  if (loading) {
    return <div>Loading users...</div>;
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 animate-fade-in">
      <div className="flex items-center mb-6">
        <UsersCogIcon className="w-8 h-8 text-purple-400 mr-3" />
        <h2 className="text-2xl font-bold text-slate-200 font-cinzel">Member Management</h2>
      </div>

      <div className="mb-6 bg-slate-800/50 border border-slate-700 rounded-lg p-4">
          <h3 className="text-lg font-bold text-slate-200 mb-3">Add New User</h3>
          <form onSubmit={handleAddUser} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div className="md:col-span-1">
                  <label htmlFor="new-email" className="block text-sm font-medium text-slate-300 mb-1">Email Address</label>
                  <input
                      id="new-email"
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="user@example.com"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white focus:outline-none focus:border-purple-500"
                  />
              </div>
              <div className="md:col-span-1">
                  <label htmlFor="new-membership" className="block text-sm font-medium text-slate-300 mb-1">Membership Tier</label>
                  <select
                      id="new-membership"
                      value={newMembership}
                      onChange={(e) => setNewMembership(e.target.value as Membership)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white focus:outline-none focus:border-purple-500"
                  >
                      <option value="free">Free</option>
                      <option value="amateur">Amateur</option>
                      <option value="professional">Professional</option>
                  </select>
              </div>
              <div className="md:col-span-1">
                  <button
                      type="submit"
                      className="w-full py-2 px-4 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold transition-colors disabled:bg-slate-600"
                      disabled={!newEmail.trim()}
                  >
                      Add User
                  </button>
              </div>
          </form>
          {addError && <p className="text-red-400 mt-2 text-sm">{addError}</p>}
      </div>


      <div className="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-900/50">
            <tr>
              <th className="p-3 text-sm font-semibold text-slate-300">Email</th>
              <th className="p-3 text-sm font-semibold text-slate-300">Status</th>
              <th className="p-3 text-sm font-semibold text-slate-300 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.email} className="border-t border-slate-700 hover:bg-slate-800/40">
                <td className="p-3 text-slate-200">{user.email}</td>
                <td className="p-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2 py-1 text-xs font-bold rounded-full ${
                      user.membership === 'professional' ? 'bg-amber-500/20 text-amber-300' :
                      user.membership === 'amateur' ? 'bg-sky-500/20 text-sky-300' :
                      user.membership === 'trial' ? 'bg-green-500/20 text-green-300' :
                      'bg-slate-600/50 text-slate-300'
                    }`}>
                      {user.membership.toUpperCase()}
                    </span>
                    {Boolean((user as any)?.foundingCircleMember) && (
                      <span className="px-2 py-1 text-xs font-bold rounded-full border border-amber-400/30 bg-amber-500/10 text-amber-200">
                        🏆 FOUNDER
                      </span>
                    )}
                  </div>
                </td>
                <td className="p-3 text-right">
                    {user.isAdmin ? (
                        <span className="text-sm font-bold text-purple-400 mr-4">ADMIN</span>
                    ) : (
                        <div className="inline-flex items-center gap-2">
                             <select
                                value={user.membership}
                                onChange={(e) => handleMembershipChange(user.email, e.target.value as Membership)}
                                className="bg-slate-700 text-white text-sm rounded-md py-1 px-2 border border-slate-600 focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
                            >
                                {user.membership === 'trial' && <option value="trial" disabled>Trial</option>}
                                <option value="free">Free</option>
                                <option value="amateur">Amateur</option>
                                <option value="professional">Professional</option>
                            </select>
                             <button
                                onClick={() => handleDeleteUser(user.email)}
                                className="p-2 text-slate-400 hover:bg-red-900/50 hover:text-red-400 rounded-md transition-colors"
                                title="Delete user"
                             >
                                <TrashIcon className="w-5 h-5" />
                            </button>
                        </div>
                    )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && (
            <div className="text-center p-8 text-slate-500">
                <p>No registered users found in database.</p>
            </div>
        )}
      </div>
    </div>
  );
};

export default MemberManagement;
