import React, { useState } from 'react';
import type { User } from '../types';
import { getAiProvider, setAiProvider, type AIProvider } from '../services/aiProviderService';
import { DatabaseIcon } from './icons';
import DataManager from './DataManager';
import { useAppDispatch, refreshAllData } from '../store';

interface AccountMenuProps {
  user: User;
  onLogout: () => void;
}

const AccountMenu: React.FC<AccountMenuProps> = ({ user, onLogout }) => {
  const dispatch = useAppDispatch();
  const [aiProvider, setAiProviderState] = useState<AIProvider>(getAiProvider());
  const [isDataManagerOpen, setIsDataManagerOpen] = useState(false);

  const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value as AIProvider;
    setAiProvider(next);
    setAiProviderState(next);
  };

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
        <div className="menu-item" style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 4 }}>AI Provider</div>
          <select
            value={aiProvider}
            onChange={handleProviderChange}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 10 }}
            aria-label="AI Provider"
          >
            <option value="gemini">Gemini</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
          </select>
        </div>

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
