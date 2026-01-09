import React, { useEffect, useRef, useState } from 'react';
import type { User } from '../types';
import AdminSettingsModal from './AdminSettingsModal';

interface AccountMenuProps {
  user: User;
  onLogout: () => void;
}

function ChevronDownIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function initialsFromEmail(email: string) {
  const s = email.split('@')[0] || email;
  const parts = s.split(/[._-]+/).filter(Boolean);
  const a = (parts[0]?.[0] || s[0] || 'U').toUpperCase();
  const b = (parts[1]?.[0] || parts[0]?.[1] || '').toUpperCase();
  return (a + b).slice(0, 2);
}

export default function AccountMenu({ user, onLogout }: AccountMenuProps) {
  const [openAdmin, setOpenAdmin] = useState(false);
  const [open, setOpen] = useState(false);
  const isAdmin = !!user.isAdmin;
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, []);

  return (
    <>
      <div ref={wrapRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-full bg-slate-900/60 border border-slate-700 hover:border-slate-600 text-slate-200 hover:text-white transition-colors"
          aria-label="Open account menu"
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-purple-500/20 border border-purple-400/20 text-xs font-semibold">
            {initialsFromEmail(user.email)}
          </span>
          <span className="hidden md:block text-xs max-w-[220px] truncate">{user.email}</span>
          <span className="hidden sm:inline-flex text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-yellow-200/90">
            {user.membership}
          </span>
          <ChevronDownIcon className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div
            role="menu"
            className="absolute right-0 mt-2 w-72 rounded-xl border border-slate-700/70 bg-slate-950/95 backdrop-blur-md shadow-2xl shadow-black/50 overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-slate-800">
              <div className="text-sm font-semibold text-white truncate">{user.email}</div>
              <div className="mt-1 text-xs text-slate-300/80">Membership: <span className="text-slate-200">{user.membership}</span></div>
            </div>
            <div className="p-3 flex items-center gap-2 flex-wrap">
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setOpenAdmin(true);
                  }}
                  className="btn"
                  aria-label="Admin settings"
                >
                  Admin
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onLogout();
                }}
                className="btn"
                aria-label="Logout"
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
