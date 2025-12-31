import React, { useState } from 'react';
import type { User } from '../types';
import { DatabaseIcon } from './icons';
import DataManager from './DataManager';
import { useAppDispatch, refreshAllData } from '../store';

interface AccountMenuProps {
    user: User;
    onLogout: () => void;
}

const AccountMenu: React.FC<AccountMenuProps> = ({ user, onLogout }) => {
    const [isDataManagerOpen, setIsDataManagerOpen] = useState(false);
    const dispatch = useAppDispatch();

    const getMembershipDisplay = () => {
        if (user.membership === 'trial' && user.trialEndDate) {
            const daysLeft = Math.ceil((user.trialEndDate - Date.now()) / (1000 * 60 * 60 * 24));
            if (daysLeft > 0) {
                return `Trial (${daysLeft} day${daysLeft !== 1 ? 's' : ''} left)`;
            }
            return 'Trial Expired';
        }
        return `${user.membership.replace('-', ' ')} Member`;
    };

    const getMembershipClass = () => {
        switch(user.membership) {
            case 'professional': return 'text-amber-300';
            case 'semi-pro': return 'text-purple-300';
            case 'amateur': return 'text-sky-300';
            case 'trial': return 'text-green-300';
            default: return 'text-slate-400';
        }
    }

    const handleDataRestored = () => {
        // Refresh the global store when data is imported
        refreshAllData(dispatch);
    };

    return (
        <div className="flex items-center gap-4">
            {isDataManagerOpen && <DataManager onClose={() => setIsDataManagerOpen(false)} onDataRestored={handleDataRestored} />}
            <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold text-white truncate max-w-[150px]">{user.email}</p>
                <p className={`text-xs font-bold uppercase tracking-wider ${getMembershipClass()}`}>
                    {getMembershipDisplay()}
                </p>
            </div>
            <div className="flex items-center gap-2">
                <button
                    onClick={() => setIsDataManagerOpen(true)}
                    className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-full transition-colors"
                    title="Manage Data & Backups"
                >
                    <DatabaseIcon className="w-5 h-5" />
                </button>
                <button
                    onClick={onLogout}
                    className="px-4 py-2 text-sm bg-slate-700 hover:bg-red-800/50 rounded-md text-slate-300 hover:text-red-300 transition-colors"
                    title="Logout"
                >
                    Logout
                </button>
            </div>
        </div>
    );
};

export default AccountMenu;