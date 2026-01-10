import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { User } from "../types";
import AdminSettingsModal from "./AdminSettingsModal";
import AdminSuggestionsModal from "./AdminSuggestionsModal";
import { exportData } from "../services/dataService";
import { ChevronDownIcon, DatabaseIcon } from "./icons";

interface AccountMenuProps {
  user: User;
  onLogout: () => void | Promise<void>;
}

export default function AccountMenu({ user, onLogout }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const [openAdmin, setOpenAdmin] = useState(false);
  const [openSuggestions, setOpenSuggestions] = useState(false);

  const isAdmin = !!user.isAdmin;

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  
  const menuRef = useRef<HTMLDivElement | null>(null);
const [pos, setPos] = useState({ top: 0, left: 0, width: 288 });

  const menuWidth = 288;

  const updatePosition = () => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPos({
      top: r.bottom + 8,
      left: Math.max(8, r.right - menuWidth),
      width: menuWidth,
    });
  };

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!wrapRef.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  const menu = useMemo(() => {
    if (!open) return null;

    return (
      <div
        role="menu"
        ref={menuRef} className="fixed z-[9999] rounded-xl border border-slate-700/70 bg-slate-950/95 shadow-2xl"
        style={{ top: pos.top, left: pos.left, width: pos.width }}
      >
        <div className="px-4 py-3 border-b border-slate-800">
          <div className="text-sm font-semibold text-white truncate">{user.email}</div>
          <div className="mt-1 text-xs text-slate-300">
            Membership: <span className="text-slate-200">{user.membership}</span>
          </div>
        </div>

        <div className="p-2">
          <button
            onClick={async () => {
              await exportData();
              setOpen(false);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-200 hover:bg-slate-800/60"
          >
            <DatabaseIcon className="w-4 h-4 text-purple-300" />
            Export / Backup Data
          </button>

          {isAdmin && (
            <button
              onClick={() => {
                setOpen(false);
                setOpenSuggestions(true);
              }}
              className="mt-1 w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-200 hover:bg-slate-800/60"
            >
              <span className="w-4 h-4 text-amber-300 font-bold">!</span>
              Review Suggestions
            </button>
          )}

          {isAdmin && (
            <button
              onClick={() => {
                setOpen(false);
                setOpenAdmin(true);
              }}
              className="mt-1 w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-200 hover:bg-slate-800/60"
            >
              <span className="w-4 h-4 text-amber-300 font-bold">A</span>
              Admin Settings
            </button>
          )}

          <button
            type="button"
            onClick={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              try {
                await onLogout();
              } catch (e) {
                console.error("Logout failed:", e);
              }
            }}
            className="mt-1 w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-200 hover:bg-slate-800/60"
          >
            ⎋ Logout
          </button>
        </div>
      </div>
    );
  }, [open, pos, user, isAdmin]);

  return (
    <>
      <div ref={wrapRef}>
        <button
          ref={btnRef}
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-full bg-slate-900/60 border border-slate-700 text-slate-200"
        >
          <span className="hidden md:block text-xs truncate max-w-[220px]">
            {user.email}
          </span>
          <ChevronDownIcon className="w-4 h-4" />
        </button>
      </div>

      {typeof document !== "undefined" && menu
        ? createPortal(menu, document.body)
        : null}

      <AdminSettingsModal open={openAdmin} onClose={() => setOpenAdmin(false)} />
      <AdminSuggestionsModal
        open={openSuggestions}
        onClose={() => setOpenSuggestions(false)}
      />
    </>
  );
}