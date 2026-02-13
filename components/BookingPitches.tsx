import React, { useEffect, useMemo, useState } from 'react';
import { FileTextIcon, TrashIcon, BackIcon, SearchIcon, CopyIcon } from './icons';
import { getBookingPitches, deleteBookingPitch, type BookingPitch } from '../services/pitchsService';

function fmt(ts: number): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return '';
  }
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // ignore
  }
}

interface BookingPitchsProps {
  initialId?: string | null;
  onBack: () => void;
}

const BookingPitchs: React.FC<BookingPitchsProps> = ({ initialId, onBack }) => {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<BookingPitch[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialId ?? null);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const data = await getBookingPitches();
        if (!alive) return;
        setItems(data);
        if (!selectedId && data[0]) setSelectedId(data[0].id);
      } catch (e: any) {
        if (!alive) return;
        setNotice(String(e?.message ?? 'Failed to load pitchs'));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(p =>
      (p.title ?? '').toLowerCase().includes(q) ||
      (p.content ?? '').toLowerCase().includes(q)
    );
  }, [items, query]);

  const selected = useMemo(
    () => items.find(i => i.id === selectedId) ?? null,
    [items, selectedId]
  );

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this pitch?')) return;
    try {
      await deleteBookingPitch(id);
      setItems(prev => prev.filter(p => p.id !== id));
      setNotice('Deleted.');
      if (selectedId === id) setSelectedId(null);
    } catch (e: any) {
      setNotice(String(e?.message ?? 'Delete failed'));
    }
  };

  return (
    <div className="w-full h-full flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-slate-200 hover:text-white"
        >
          <BackIcon className="w-4 h-4" />
          Back
        </button>

        <div className="flex items-center gap-2 text-slate-200">
          <FileTextIcon className="w-5 h-5" />
          <h2 className="text-lg font-semibold">Booking Pitches</h2>
        </div>

        <div className="w-24" />
      </div>

      {notice && (
        <div className="text-xs text-slate-200 bg-slate-900/40 border border-slate-800 rounded-md px-3 py-2">
          {notice}
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-3 min-h-0">
        {/* List */}
        <div className="lg:col-span-1 bg-slate-900/30 border border-slate-800 rounded-lg p-3 min-h-0 flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <SearchIcon className="w-4 h-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search pitchs…"
              className="w-full bg-slate-950/40 border border-slate-800 rounded-md px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-600/40"
            />
          </div>

          {loading ? (
            <div className="text-sm text-slate-400">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-slate-400">
              No pitchs yet. Create one from the Marketing Campaign Generator.
            </div>
          ) : (
            <div className="flex-1 overflow-auto space-y-2 pr-1">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  className={[
                    "w-full text-left rounded-md border px-3 py-2 transition-colors",
                    selectedId === p.id
                      ? "bg-purple-700/20 border-purple-500/40"
                      : "bg-slate-950/30 border-slate-800 hover:bg-slate-900/40"
                  ].join(' ')}
                >
                  <div className="text-sm text-slate-100 font-medium line-clamp-1">
                    {p.title || 'Untitled Proposal'}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {fmt(p.createdAt)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Detail */}
        <div className="lg:col-span-2 bg-slate-900/30 border border-slate-800 rounded-lg p-3 min-h-0 flex flex-col">
          {!selected ? (
            <div className="text-sm text-slate-400">
              Select a pitch on the left to view it here.
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className="text-base font-semibold text-slate-100">
                    {selected.title || 'Untitled Proposal'}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    Created {fmt(selected.createdAt)}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await copyToClipboard(selected.content);
                      setNotice('Copied to clipboard.');
                      setTimeout(() => setNotice(null), 1500);
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200 transition-colors"
                  >
                    <CopyIcon className="w-4 h-4" />
                    Copy
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(selected.id)}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-red-900/40 hover:bg-red-900/60 border border-red-700/40 rounded-md text-slate-100 transition-colors"
                  >
                    <TrashIcon className="w-4 h-4" />
                    Delete
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-auto bg-slate-950/30 border border-slate-800 rounded-md p-3">
                <pre className="whitespace-pre-wrap text-sm text-slate-100 leading-relaxed">
                  {selected.content}
                </pre>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default BookingPitchs;
