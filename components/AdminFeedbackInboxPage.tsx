import React, { useEffect, useMemo, useState } from 'react';
import {
  createFounderFeedback,
  deleteFounderFeedback,
  listFounderFeedback,
  updateFounderFeedback,
  type FounderFeedback,
} from '../services/adminFounderFeedbackService';

function fmtDate(ts?: string | null) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return d.toLocaleString();
  } catch {
    return String(ts);
  }
}

export default function AdminFeedbackInboxPage() {
  const [status, setStatus] = useState<'new' | 'archived'>('new');
  const [rows, setRows] = useState<FounderFeedback[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [addFrom, setAddFrom] = useState('');
  const [addName, setAddName] = useState('');
  const [addSubject, setAddSubject] = useState('');
  const [addBody, setAddBody] = useState('');

  const [selected, setSelected] = useState<FounderFeedback | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await listFounderFeedback({ status, limit: 200 });
      setRows(data);
    } catch (e: any) {
      setError(e?.message || 'Failed to load feedback');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const counts = useMemo(() => {
    return { total: rows.length };
  }, [rows]);

  async function onArchive(r: FounderFeedback, next: 'new' | 'archived') {
    try {
      await updateFounderFeedback(r.id, { status: next });
      await load();
    } catch (e: any) {
      alert(e?.message || 'Failed to update');
    }
  }

  async function onDelete(r: FounderFeedback) {
    if (!confirm('Delete this message?')) return;
    try {
      await deleteFounderFeedback(r.id);
      await load();
    } catch (e: any) {
      alert(e?.message || 'Failed to delete');
    }
  }

  async function onAdd() {
    if (!addFrom.trim()) return alert('From email is required.');
    try {
      await createFounderFeedback({
        from_email: addFrom.trim(),
        from_name: addName.trim() || null,
        subject: addSubject.trim() || null,
        body_text: addBody.trim() || null,
        received_at: new Date().toISOString(),
        source: 'manual',
        status: 'new',
      });
      setShowAdd(false);
      setAddFrom('');
      setAddName('');
      setAddSubject('');
      setAddBody('');
      await load();
    } catch (e: any) {
      alert(e?.message || 'Failed to add feedback');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-white">Founder Feedback Inbox</div>
          <div className="text-sm text-slate-300">
            Replies + feature requests from Founders. Capture everything here so nothing gets lost.
            
            Tip: You can forward replies into <code className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">/api/founderFeedbackInbound</code> using <span className="font-mono">INBOUND_MAIL_SECRET</span>.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            className={`px-3 py-1.5 rounded-lg text-sm border ${
              status === 'new'
                ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200'
                : 'bg-white/5 border-white/10 text-slate-200 hover:bg-white/10'
            }`}
            onClick={() => setStatus('new')}
          >
            New
          </button>
          <button
            className={`px-3 py-1.5 rounded-lg text-sm border ${
              status === 'archived'
                ? 'bg-amber-500/15 border-amber-400/40 text-amber-200'
                : 'bg-white/5 border-white/10 text-slate-200 hover:bg-white/10'
            }`}
            onClick={() => setStatus('archived')}
          >
            Archived
          </button>
          <button
            className="px-3 py-1.5 rounded-lg text-sm border bg-white/5 border-white/10 text-slate-200 hover:bg-white/10"
            onClick={() => setShowAdd(true)}
          >
            + Add (Manual)
          </button>
          <button
            className="px-3 py-1.5 rounded-lg text-sm border bg-white/5 border-white/10 text-slate-200 hover:bg-white/10"
            onClick={() => load()}
            disabled={loading}
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-200">
            Showing <span className="font-semibold">{counts.total}</span> message(s)
          </div>
          {error ? <div className="text-sm text-red-300">{error}</div> : null}
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-slate-300">
              <tr className="border-b border-white/10">
                <th className="py-2 text-left font-medium">Received</th>
                <th className="py-2 text-left font-medium">From</th>
                <th className="py-2 text-left font-medium">Subject</th>
                <th className="py-2 text-left font-medium">Preview</th>
                <th className="py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="text-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-2 pr-3 whitespace-nowrap">{fmtDate(r.received_at || r.created_at)}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    <div className="font-medium">{r.from_name || r.from_email}</div>
                    <div className="text-xs text-slate-400">{r.from_email}</div>
                  </td>
                  <td className="py-2 pr-3">
                    <button className="text-left hover:underline" onClick={() => setSelected(r)}>
                      {r.subject || '(no subject)'}
                    </button>
                  </td>
                  <td className="py-2 pr-3 text-slate-300">
                    {(r.body_text || '').slice(0, 90)}
                    {(r.body_text || '').length > 90 ? '…' : ''}
                  </td>
                  <td className="py-2 text-right">
                    <div className="inline-flex items-center gap-2">
                      {status === 'new' ? (
                        <button
                          className="px-2 py-1 rounded-lg text-xs border bg-amber-500/15 border-amber-400/30 text-amber-200 hover:bg-amber-500/20"
                          onClick={() => onArchive(r, 'archived')}
                        >
                          Archive
                        </button>
                      ) : (
                        <button
                          className="px-2 py-1 rounded-lg text-xs border bg-emerald-500/15 border-emerald-400/30 text-emerald-200 hover:bg-emerald-500/20"
                          onClick={() => onArchive(r, 'new')}
                        >
                          Unarchive
                        </button>
                      )}
                      <button
                        className="px-2 py-1 rounded-lg text-xs border bg-red-500/10 border-red-400/30 text-red-200 hover:bg-red-500/15"
                        onClick={() => onDelete(r)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!rows.length && !loading ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-400">
                    No messages in this view.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {showAdd ? (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-white">Add feedback manually</div>
            <button className="text-slate-300 hover:text-white" onClick={() => setShowAdd(false)}>
              ✕
            </button>
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-slate-300 mb-1">From email *</div>
              <input className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-slate-100"
                value={addFrom} onChange={(e) => setAddFrom(e.target.value)} placeholder="founder@email.com" />
            </div>
            <div>
              <div className="text-xs text-slate-300 mb-1">From name</div>
              <input className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-slate-100"
                value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="Name (optional)" />
            </div>
            <div className="md:col-span-2">
              <div className="text-xs text-slate-300 mb-1">Subject</div>
              <input className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-slate-100"
                value={addSubject} onChange={(e) => setAddSubject(e.target.value)} placeholder="Feature request subject" />
            </div>
            <div className="md:col-span-2">
              <div className="text-xs text-slate-300 mb-1">Message</div>
              <textarea className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-slate-100 min-h-[120px]"
                value={addBody} onChange={(e) => setAddBody(e.target.value)} placeholder="Paste the reply content here..." />
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button className="px-3 py-1.5 rounded-lg text-sm border bg-white/5 border-white/10 text-slate-200 hover:bg-white/10" onClick={() => setShowAdd(false)}>
              Cancel
            </button>
            <button className="px-3 py-1.5 rounded-lg text-sm border bg-emerald-500/15 border-emerald-400/30 text-emerald-200 hover:bg-emerald-500/20" onClick={() => onAdd()}>
              Save
            </button>
          </div>
        </div>
      ) : null}

      {selected ? (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-white font-semibold">{selected.subject || '(no subject)'}</div>
              <div className="text-xs text-slate-400 mt-1">
                From {selected.from_name ? `${selected.from_name} <${selected.from_email}>` : selected.from_email} • {fmtDate(selected.received_at || selected.created_at)}
              </div>
            </div>
            <button className="text-slate-300 hover:text-white" onClick={() => setSelected(null)}>✕</button>
          </div>
          <div className="mt-3 whitespace-pre-wrap text-slate-200 text-sm">
            {selected.body_text || '(no text body)'}
          </div>
        </div>
      ) : null}
    </div>
  );
}
