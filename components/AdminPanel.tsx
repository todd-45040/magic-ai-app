import React, { useMemo, useState } from 'react';
import type { User } from '../types';
import AdminUsageDashboard from './AdminUsageDashboard';
import AdminSettingsModal from './AdminSettingsModal';

export default function AdminPanel({ user }: { user: User }) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  const headerPills = useMemo(
    () => [
      { label: 'Email', value: user.email },
      { label: 'Tier', value: String(user.membership || '—') },
      { label: 'is_admin', value: user.isAdmin ? 'true' : 'false' },
    ],
    [user.email, user.membership, user.isAdmin]
  );

  return (
    <div className="flex-1 flex flex-col">
      <div className="p-4 border-b border-white/10 bg-white/5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <div className="text-xl font-bold">Admin Dashboard</div>
            <div className="text-sm opacity-80">Diagnostics, telemetry, and system controls (admin-only).</div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="px-3 py-2 rounded-lg bg-purple-500/15 border border-purple-400/25 text-purple-100 hover:bg-purple-500/20 hover:border-purple-300/40 transition"
            >
              Admin Settings
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {headerPills.map((p) => (
            <div
              key={p.label}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/20 border border-white/10"
              title={p.value}
            >
              <span className="text-xs opacity-70">{p.label}</span>
              <span className="text-xs font-mono text-white/90 max-w-[260px] truncate">{p.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <AdminUsageDashboard />
      </div>

      <AdminSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
