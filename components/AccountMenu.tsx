import React, { useState } from 'react';
import type { User } from '../types';
import { DatabaseIcon } from './icons';
import DataManager from './DataManager';
import { useAppDispatch, refreshAllData } from '../store';
import AdminSettingsModal from './AdminSettingsModal';

interface AccountMenuProps {
  user: User;
  onLogout: () => void;
}

export default function AccountMenu({ user, onLogout }: AccountMenuProps) {
  const dispatch = useAppDispatch();
  const [openDataManager, setOpenDataManager] = useState(false);
  const [openAdmin, setOpenAdmin] = useState(false);

  const isAdmin = !!user.isAdmin;

  return (
    <>
      <div style={{ padding: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>{user.email}</div>
        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 12 }}>
          Membership: {user.membership}
        </div>

        <div className="menu-item" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={() => setOpenDataManager(true)}
            className="btn"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
            aria-label="Manage Data"
          >
            <DatabaseIcon className="w-4 h-4" />
            Data
          </button>

          {isAdmin && (
            <button
              onClick={() => setOpenAdmin(true)}
              className="btn"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
              aria-label="Administrator Settings"
            >
              Admin
            </button>
          )}

          <button
            onClick={() => dispatch(refreshAllData())}
            className="btn"
            aria-label="Refresh data"
          >
            Refresh
          </button>

          <button onClick={onLogout} className="btn" aria-label="Logout">
            Logout
          </button>
        </div>

        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
          AI Provider is managed by the administrator. Default: Google Gemini.
        </div>
      </div>

      {openDataManager && <DataManager onClose={() => setOpenDataManager(false)} />}
      <AdminSettingsModal open={openAdmin} onClose={() => setOpenAdmin(false)} />
    </>
  );
}
