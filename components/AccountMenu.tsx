import React, { useState } from 'react';
import type { User } from '../types';
import AdminSettingsModal from './AdminSettingsModal';

interface AccountMenuProps {
  user: User;
  onLogout: () => void;
}

export default function AccountMenu({ user, onLogout }: AccountMenuProps) {  const [openAdmin, setOpenAdmin] = useState(false);

  const isAdmin = !!user.isAdmin;

  return (
    <>
      <div style={{ padding: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>{user.email}</div>
        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 12 }}>
          Membership: {user.membership}
        </div>

        <div className="menu-item" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {isAdmin && (
          <button onClick={onLogout} className="btn" aria-label="Logout">
            Logout
          </button>
        </div>      </div>      <AdminSettingsModal open={openAdmin} onClose={() => setOpenAdmin(false)} />
    </>
  );
}
