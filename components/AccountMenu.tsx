import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, Database } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function AccountMenu() {
  const { user, signOut, exportUserData } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  if (!user) return null;

  const handleBackup = async () => {
    try {
      await exportUserData();
      setIsOpen(false);
    } catch (err) {
      console.error("Backup failed", err);
    }
  };

  // Close on outside click + Escape
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setIsOpen(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <div ref={rootRef} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-full border border-purple-500/40 bg-purple-900/40 px-3 py-1.5 text-sm text-purple-100 hover:bg-purple-800/50 transition"
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <span className="truncate max-w-[180px]">{user.email}</span>
        <ChevronDown className="h-4 w-4 opacity-70" />
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-64 origin-top-right rounded-xl border border-purple-500/30 bg-[#120a24] shadow-xl overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-purple-500/20">
            <p className="text-xs text-purple-400">Signed in as</p>
            <p className="text-sm font-medium text-purple-100 truncate">
              {user.email}
            </p>
            <p className="mt-1 text-xs text-purple-400">
              Membership: <span className="text-purple-200">Trial</span>
            </p>
          </div>

          <button
            type="button"
            onClick={handleBackup}
            role="menuitem"
            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-purple-100 hover:bg-purple-800/40 transition"
          >
            <Database className="h-4 w-4 text-purple-400" />
            Export / Backup Data
          </button>

          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              signOut();
            }}
            role="menuitem"
            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-purple-100 hover:bg-purple-800/40 transition"
          >
            <LogOut className="h-4 w-4 text-purple-400" />
            Logout
          </button>
        </div>
      )}
    </div>
  );
}
