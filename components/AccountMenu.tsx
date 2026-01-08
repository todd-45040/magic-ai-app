import React, { useEffect, useRef, useState } from 'react';
import type { User } from '../types';
import AdminSettingsModal from './AdminSettingsModal';
import { UserIcon } from './icons';

interface AccountMenuProps {
  user: User;
  onLogout: () => void;
}

/**
 * Compact account chip + dropdown.
 *
 * This intentionally keeps the nav bar clean by:
 *  - removing the old Data / Refresh quick actions
 *  - removing the AI Provider admin notice
 */
export default function AccountMenu({ user, onLogout }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const [openAdmin, setOpenAdmin] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const isAdmin = !!user.isAdmin;

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (wrapRef.current.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  const emailShort = user.email.length > 22 ? `${user.email.slice(0, 19)}…` : user.email;

  return (
    <>
      <div ref={wrapRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 px-3 py-2 rounded-full border border-slate-700/60 bg-slate-900/40 hover:bg-slate-800/60 transition-colors"
          aria-haspopup="menu"
          aria-expanded={open}
          title={user.email}
        >
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-800 border border-slate-700/60">
            <UserIcon className="w-4 h-4 text-slate-200" />
          </span>
          <span className="hidden sm:flex flex-col items-start leading-tight">
            <span className="text-sm font-semibold text-slate-100">{emailShort}</span>
            <span className="text-[11px] text-slate-400">{user.membership}</span>
          </span>
        </button>

        {open && (
          <div
            role="menu"
            className="absolute right-0 mt-2 w-64 rounded-xl border border-slate-800 bg-slate-950/95 shadow-2xl shadow-purple-900/20 overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-slate-800">
              <div className="text-sm font-semibold text-slate-100 break-all">{user.email}</div>
              <div className="text-xs text-slate-400 mt-1">Membership: {user.membership}</div>
            </div>

            <div className="p-2 flex flex-col gap-1">
              {isAdmin && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    setOpenAdmin(true);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-200 hover:bg-slate-800/60 transition-colors"
                >
                  Admin settings
                </button>
              )}

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onLogout();
                }}
                className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-200 hover:bg-slate-800/60 transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        )}
      </div>

      <AdminSettingsModal open={openAdmin} onClose={() => setOpenAdmin(false)} />
    </>
  );
}
