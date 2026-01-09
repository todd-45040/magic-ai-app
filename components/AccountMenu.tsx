import { useState } from "react";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { ChevronDown, LogOut, Database } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function AccountMenu() {
  const { user, signOut, exportUserData } = useAuth();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  const handleBackup = async () => {
    try {
      await exportUserData();
    } catch (err) {
      console.error("Backup failed", err);
    }
  };

  return (
    <Menu as="div" className="relative inline-block text-left">
      <MenuButton
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-2 rounded-full border border-purple-500/40 bg-purple-900/40 px-3 py-1.5 text-sm text-purple-100 hover:bg-purple-800/50 transition"
      >
        <span className="truncate max-w-[180px]">
          {user.email}
        </span>
        <ChevronDown className="h-4 w-4 opacity-70" />
      </MenuButton>

      <MenuItems className="absolute right-0 z-50 mt-2 w-64 origin-top-right rounded-xl border border-purple-500/30 bg-[#120a24] shadow-xl focus:outline-none">
        <div className="px-4 py-3 border-b border-purple-500/20">
          <p className="text-xs text-purple-400">Signed in as</p>
          <p className="text-sm font-medium text-purple-100 truncate">
            {user.email}
          </p>
          <p className="mt-1 text-xs text-purple-400">
            Membership: <span className="text-purple-200">Trial</span>
          </p>
        </div>

        {/* Backup / Export */}
        <MenuItem>
          {({ active }) => (
            <button
              onClick={handleBackup}
              className={`flex w-full items-center gap-2 px-4 py-2 text-sm ${
                active ? "bg-purple-800/40" : ""
              } text-purple-100`}
            >
              <Database className="h-4 w-4 text-purple-400" />
              Export / Backup Data
            </button>
          )}
        </MenuItem>

        {/* Logout */}
        <MenuItem>
          {({ active }) => (
            <button
              onClick={signOut}
              className={`flex w-full items-center gap-2 px-4 py-2 text-sm ${
                active ? "bg-purple-800/40" : ""
              } text-purple-100`}
            >
              <LogOut className="h-4 w-4 text-purple-400" />
              Logout
            </button>
          )}
        </MenuItem>
      </MenuItems>
    </Menu>
  );
}
