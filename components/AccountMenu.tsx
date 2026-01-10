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

type MenuPos = { top: number; left: number; width: number };

export default function AccountMenu({ user, onLogout }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const [openAdmin, setOpenAdmin] = useState(false);
  const [openSuggestions, setOpenSuggestions] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);

  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const isAdmin = !!(user as any)?.isAdmin;

  const updatePosition = () => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = 260;
    const left = Math.min(Math.max(12, r.right - width), window.innerWidth - width - 12);
    const top = Math.min(r.bottom + 10, window.innerHeight - 12);
    setPos({ top, left, width });
  };

  useEffect(() => {
    if (!open) return;
    updatePosition();

    const onClick = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (btnRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };

    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onEsc);

    const onResize = () => updatePosition();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);

    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onEsc);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [open]);

  const menu = useMemo(() => {
    if (!open || !pos) return null;

    const doLogout = async () => {
      setOpen(false);
      try {
        // Prevent accidental form submit / navigation from interrupting sign-out.
        await Promise.resolve(onLogout());
      } catch (err) {
        console.error("Logout failed:", err);
      }
    };

    return (
      <div
        className="fixed inset-0 z-[80]"
        aria-hidden={!open}
      >
        <div
          ref={menuRef}
          style={{ top: pos.top, left: pos.left, width: pos.width }}
          className="absolute rounded-2xl border border-slate-700/60 bg-slate-950/95 shadow-2xl backdrop-blur-xl p-2"
          role="menu"
        >
          <div className="px-3 py-2">
            <div className="text-xs text-slate-400">Signed in as</div>
            <div className="text-sm text-slate-100 break-all">{user.email}</div>
          </div>

          <div className="h-px bg-slate-800/70 my-1" />

          <button
            type="button"
            onClick={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              try {
                setOpen(false);
                await exportData();
              } catch (err) {
                console.error("Export failed:", err);
              }
            }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-slate-200 hover:bg-slate-800/60 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
            role="menuitem"
          >
            <DatabaseIcon className="w-4 h-4 opacity-90" />
            Export my data
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
                setOpenAdmin(true);
              }}
              className="mt-1 w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-slate-200 hover:bg-slate-800/60 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
              role="menuitem"
            >
              ⚙️ Admin settings
            </button>
          )}

          {isAdmin && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
                setOpenSuggestions(true);
              }}
              className="mt-1 w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-slate-200 hover:bg-slate-800/60 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
              role="menuitem"
            >
              🧾 Review suggestions
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void doLogout();
            }}
            className="mt-1 w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-slate-200 hover:bg-slate-800/60 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
            role="menuitem"
          >
            ⎋ Logout
          </button>
        </div>
      </div>
    );
  }, [open, pos, user.email, isAdmin, onLogout]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-700/60 bg-slate-950/40 hover:bg-slate-900/50 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30"
        aria-haspopup="menu"
        aria-expanded={open}
        title={user.email}
      >
        <span className="max-w-[180px] truncate">{user.email}</span>
        <ChevronDownIcon className={"w-4 h-4 opacity-80 transition-transform " + (open ? "rotate-180" : "")} />
      </button>

      {typeof document !== "undefined" && menu ? createPortal(menu, document.body) : null}

      <AdminSettingsModal open={openAdmin} onClose={() => setOpenAdmin(false)} />
      <AdminSuggestionsModal open={openSuggestions} onClose={() => setOpenSuggestions(false)} />
    </>
  );
}
