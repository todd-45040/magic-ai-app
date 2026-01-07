import React, { useState } from 'react';
import type { User } from '../types';
import { DatabaseIcon } from './icons';
import DataManager from './DataManager';
import { useAppDispatch, refreshAllData } from '../store';
import AdminSettings from './AdminSettings';

interface AccountMenuProps {
  user: User;
  onLogout: () => void;
}

const AccountMenu: React.FC<AccountMenuProps> = ({ user, onLogout }) => {
  const dispatch = useAppDispatch();
  const [isDataManagerOpen, setIsDataManagerOpen] = useState(false);
  const [showAdminSettings, setShowAdminSettings] = useState(false);

  const getMembershipDisplay = () => {
    if (user.membership === 'trial' && user.trialEndDate) {
      const daysLeft = Math.ceil((user.trialEndDate - Date.now()) / (1000 * 60 * 60 * 24));
      if (daysLeft > 0) return `Trial (${daysLeft} day${daysLeft !== 1 ? 's' : ''} left)`;
      return 'Trial Expired';
    }
    return `${user.membership} Member`;
  };

  const getMembershipClass = () => {
    switch (user.membership) {
      case 'professional':
        return 'text-yellow-300';
      case 'hobbyist':
        return 'text-purple-300';
      case 'amateur':
        return 'text-sky-300';
      case 'trial':
        return 'text-green-300';
      default:
        return 'text-slate-400';
    }
  };

  const handleDataRestored = () => {
    refreshAllData(dispatch);
  };

  return (
    <div className="flex items-center gap-4">
      {isDataManagerOpen && (
        <DataManager
          onClose={() => setIsDataManagerOpen(false)}
          onDataRestored={handleDataRestored}
        />
      )}

      <div className="text-right hidden sm:block">
        <p className="text-sm font-semibold text-white truncate max-w-[160px]">{user.email}</p>
        <p className={`text-xs font-bold uppercase tracking-wider ${getMembershipClass()}`}>
          {getMembershipDisplay()}
        </p>
      </div>

      <div className="flex items-center gap-2">
        {showAdminSettings && <AdminSettings onClose={() => setShowAdminSettings(false)} />}

        {user.isAdmin ? (
          <button
            onClick={() => setShowAdminSettings(true)}
            className="px-3 py-2 text-sm bg-slate-800 hover:bg-slate-700 rounded-md text-slate-200 transition-colors"
            title="Administrator Settings"
            type="button"
          >
            Admin
          </button>
        ) : null}

        <button
          onClick={() => setIsDataManagerOpen(true)}
          className="px-3 py-2 text-sm bg-slate-800 hover:bg-slate-700 rounded-md text-slate-200 transition-colors flex items-center gap-2"
          title="Import/Export Data"
          type="button"
        >
          <DatabaseIcon className="w-4 h-4" />
          <span className="hidden sm:inline">Data</span>
        </button>

        <button
          onClick={onLogout}
          className="px-4 py-2 text-sm bg-slate-800 hover:bg-slate-700 rounded-md text-slate-300 hover:text-red-300 transition-colors"
          title="Logout"
          type="button"
        >
          Logout
        </button>
      </div>
    </div>
  );
};

export default AccountMenu;
