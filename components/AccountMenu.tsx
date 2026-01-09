import React, { useEffect, useRef, useState } from "react";
import type { User } from "../types";
import AdminSettingsModal from "./AdminSettingsModal";
import { exportData } from "../services/dataService";
import { ChevronDownIcon, DatabaseIcon } from "./icons";

interface AccountMenuProps {
  user: User;
  onLogout: () => void;
}

export default function AccountMenu({ user, onLogout }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const [openAdmin, setOpenAdmin] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const isAdmin = !!user.isAdmin;

  // Close on outside click + Escape
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const handleBackup = async () => {
    try {
      await exportData();
      setOpen(false);
    } catch (err) {
      console.error("Export/backup failed:", err);
    }
  };

  return (
    <>
      <div ref={rootRef} className="relative inline-block text-left">
        {/* Compact pill trigger (keeps header slim) */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-2 rounded-full border border-purple-500/30 bg-purple-900/30 px-3 py-1.5 text-sm text-purple-100 hover:bg-purple-800/40 transition"
          aria-haspopup="menu"
          aria-expanded={open}
          title={user.email}
        >
          <span className="truncate max-w-[160px]">{user.email}</span>
          <ChevronDownIcon className="w-4 h-4 opacity-70" />
        </button>

        {open && (
          <div
            role="menu"
            className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-purple-500/25 bg-[#120a24] shadow-xl"
          >
            <div className="px-4 py-3 border-b border-purple-500/15">
              <div className="text-xs text-purple-400">Signed in as</div>
              <div className="text-sm font-semibold text-purple-100 truncate">
                {user.email}
              </div>
              <div className="mt-1 text-xs text-purple-400">
                Membership:{" "}
                <span className="text-purple-200">{user.membership}</span>
              </div>
            </div>

            {/* Backup / Export */}
            <button
              type="button"
              onClick={handleBackup}
              role="menuitem"
              className="flex w-full items-center gap-2 px-4 py-2 text-sm text-purple-100 hover:bg-purple-800/35 transition"
            >
              <DatabaseIcon className="w-4 h-4 text-purple-300" />
              Export / Backup Data
            </button>

            {/* Admin (optional) */}
            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setOpenAdmin(true);
                }}
                role="menuitem"
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-purple-100 hover:bg-purple-800/35 transition"
              >
                <span className="inline-flex w-4 h-4 items-center justify-center text-xs font-bold text-amber-300">
                  A
                </span>
                Admin Settings
              </button>
            )}

            {/* Logout */}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
              role="menuitem"
              className="flex w-full items-center gap-2 px-4 py-2 text-sm text-purple-100 hover:bg-purple-800/35 transition"
            >
              <span className="inline-flex w-4 h-4 items-center justify-center text-xs text-purple-300">
                ⎋
              </span>
              Logout
            </button>
          </div>
        )}
      </div>

      <AdminSettingsModal open={openAdmin} onClose={() => setOpenAdmin(false)} />
    </>
  );
}
