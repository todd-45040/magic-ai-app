import React, { useEffect, useMemo, useState } from "react";
import {
  fetchSuggestions,
  updateSuggestionStatus,
  deleteSuggestion,
  AppSuggestionRow,
  SuggestionStatus,
} from "../services/adminSuggestionsService";

function formatWhen(ts: number) {
  return new Date(ts).toLocaleString();
}

export default function AdminSuggestionsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<AppSuggestionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<SuggestionStatus | "all">("all");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchSuggestions({ status }));
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) load();
  }, [open, status]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-[#12121a] w-full max-w-4xl rounded-xl overflow-hidden border border-white/10">
        <div className="p-4 border-b border-white/10 flex justify-between items-center">
          <h2 className="font-bold">Admin – Suggestions</h2>
          <button onClick={onClose}>✕</button>
        </div>

        {error && <div className="p-3 text-red-300">{error}</div>}

        <div className="p-4 space-y-3 max-h-[70vh] overflow-auto">
          {loading ? (
            <div>Loading…</div>
          ) : rows.length === 0 ? (
            <div>No suggestions found.</div>
          ) : (
            rows.map((r) => (
              <div key={r.id} className="p-3 rounded-lg border border-white/10">
                <div className="text-sm opacity-80">
                  {r.type} • {r.status} • {formatWhen(r.timestamp)}
                </div>
                <div className="mt-2 whitespace-pre-wrap">{r.content}</div>
                <div className="mt-2 text-xs opacity-70">
                  {r.user_email ?? "Unknown user"}
                </div>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => updateSuggestionStatus(r.id, "resolved")}>
                    Resolve
                  </button>
                  <button onClick={() => deleteSuggestion(r.id)} className="text-red-400">
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}