import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { User } from "../types";
import AdminSettingsModal from "./AdminSettingsModal";
import { exportData } from "../services/dataService";
import { ChevronDownIcon, DatabaseIcon } from "./icons";

interface AccountMenuProps {
  user: User;
  onLogout: () => void;
}

export default function AccountMenu({ user, onLogout }: AccountMenuProps) {
  const [openAdmin, setOpenAdmin] = useState(false);
  const [open, setOpen] = useState(false);

  const isAdmin = !!user.isAdmin;

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  const [pos, setPos] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 288, // 18rem default menu width
  });

  const menuWidth = 288;

  const updatePosition = () => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const top = r.bottom + 8; // 8px gap
    const left = Math.max(8, r.right - menuWidth); // right-align to button
    setPos({ top, left, width: menuWidth });
  };

  // Close on outside click + Escape
  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  // When menu opens, calculate position and keep it updated
  useEffect(() => {
    if (!open) return;

    updatePosition();
    const onScroll = () => updatePosition();
    const onResize = () => updatePosition();

    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  const handleBackup = async () => {
    try {
      await exportData();
      setOpen(false);
    } catch (err) {
      console.error("Export/backup failed:", err);
    }
  };

  const menu = useMemo(() => {
    if (!open) return null;

    return (
      <div
        role="menu"
        className="fixed z-[9999] rounded-xl border border-slate-700/70 bg-slate-950/95 backdrop-blur-md shadow-2xl shadow-black/50 overflow-hidden"
        style={{ top: pos.top, left: pos.left, width: pos.width }}
      >
        <div className="px-4 py-3 border-b border-slate-800">
          <div className="text-sm font-semibold text-white truncate">{user.email}</div>
          <div className="mt-1 text-xs text-slate-300/80">
            Membership: <span className="text-slate-200">{user.membership}</span>
          </div>
        </div>

        <div className="p-2">
          <button
            type="button"
            onClick={handleBackup}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-200 hover:text-white hover:bg-slate-800/60 transition-colors"
          >
            <DatabaseIcon className="w-4 h-4 text-purple-300" />
            Export / Backup Data
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setOpenAdmin(true);
              }}
              className="mt-1 w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-200 hover:text-white hover:bg-slate-800/60 transition-colors"
            >
              <span className="inline-flex w-4 h-4 items-center justify-center text-[10px] font-bold text-amber-300">
                A
              </span>
              Admin Settings
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className="mt-1 w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-200 hover:text-white hover:bg-slate-800/60 transition-colors"
          >
            <span className="inline-flex w-4 h-4 items-center justify-center text-xs text-slate-300">
              ⎋
            </span>
            Logout
          </button>
        </div>
      </div>
    );
  }, [open, pos.top, pos.left, pos.width, user.email, user.membership, isAdmin]);

  return (
    <>
      <div ref={wrapRef} className="relative">
        <button
          ref={btnRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-full bg-slate-900/60 border border-slate-700 hover:border-slate-600 text-slate-200 hover:text-white transition-colors"
          aria-label="Open account menu"
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <span className="hidden md:block text-xs max-w-[220px] truncate">{user.email}</span>
          <span className="hidden sm:inline-flex text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-yellow-200/90">
            {user.membership}
          </span>
          <ChevronDownIcon className={`w-4 h-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {typeof document !== "undefined" && menu ? createPortal(menu, document.body) : null}

      <AdminSettingsModal open={openAdmin} onClose={() => setOpenAdmin(false)} />
    </>
  );
}
