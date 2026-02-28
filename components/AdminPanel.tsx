import React, { useEffect, useMemo, useState } from 'react';
import type { User } from '../types';
import AdminOverviewDashboard from './AdminOverviewDashboard';
import AdminUsageDashboard from './AdminUsageDashboard';
import AdminUsersPage from './AdminUsersPage';
import AdminLeadsPage from './AdminLeadsPage';
import AdminStripeReadinessPanel from './AdminStripeReadinessPanel';
import AdminSettingsModal from './AdminSettingsModal';
import AdminMetricDictionaryModal from './AdminMetricDictionaryModal';
import {
  fetchSuggestions,
  updateSuggestionStatus,
  deleteSuggestion,
  type AppSuggestionRow,
  type SuggestionStatus,
} from '../services/adminAppFeedbackService';

export default function AdminPanel({ user }: { user: User }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [metricOpen, setMetricOpen] = useState(false);
  const [tab, setTab] = useState<'overview' | 'users' | 'leads' | 'telemetry' | 'feedback' | 'stripe'>('overview');

  // App Feedback state
  const [statusFilter, setStatusFilter] = useState<SuggestionStatus | 'all'>('new');
  const [suggestions, setSuggestions] = useState<AppSuggestionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const headerPills = useMemo(
    () => [
      { label: 'Email', value: user.email },
      { label: 'Tier', value: String(user.membership || '—') },
      { label: 'is_admin', value: user.isAdmin ? 'true' : 'false' },
    ],
    [user.email, user.membership, user.isAdmin]
  );

  const loadSuggestions = async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchSuggestions({ status: statusFilter, limit: 250 });
      setSuggestions(rows);
    } catch (e: any) {
      setError(e?.message || 'Failed to load feedback');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'feedback') void loadSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, statusFilter]);

  const fmtTime = (ts: number) => {
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return String(ts);
    }
  };

  const statusPillClass = (s: string | null) => {
    const v = String(s || 'new');
    if (v === 'new') return 'bg-emerald-500/15 border-emerald-400/30 text-emerald-100';
    if (v === 'reviewing') return 'bg-sky-500/15 border-sky-400/30 text-sky-100';
    if (v === 'resolved') return 'bg-purple-500/15 border-purple-400/30 text-purple-100';
    return 'bg-white/10 border-white/15 text-white/80';
  };

  return (
    <div className="flex-1 flex flex-col">
      <div className="p-4 border-b border-white/10 bg-white/5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <div className="text-xl font-bold text-amber-200">Admin Dashboard</div>
            <div className="text-sm opacity-80">Diagnostics, telemetry, and system controls (admin-only).</div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-full bg-black/20 border border-white/10 p-1">
              <button
                type="button"
                onClick={() => setTab('overview')}
                className={`px-3 py-1.5 rounded-full text-sm transition ${tab === 'overview' ? 'bg-white/10 text-white' : 'text-white/70 hover:text-white'}`}
              >
                Overview
              </button>
              <button
                type="button"
                onClick={() => setTab('users')}
                className={`px-3 py-1.5 rounded-full text-sm transition ${tab === 'users' ? 'bg-white/10 text-white' : 'text-white/70 hover:text-white'}`}
              >
                Users
              </button>
              <button
                type="button"
                onClick={() => setTab('leads')}
                className={`px-3 py-1.5 rounded-full text-sm transition ${tab === 'leads' ? 'bg-white/10 text-white' : 'text-white/70 hover:text-white'}`}
              >
                Leads
              </button>
              <button
                type="button"
                onClick={() => setTab('feedback')}
                className={`px-3 py-1.5 rounded-full text-sm transition ${tab === 'feedback' ? 'bg-white/10 text-white' : 'text-white/70 hover:text-white'}`}
              >
                App Feedback
              </button>
              <button
                type="button"
                onClick={() => setTab('telemetry')}
                className={`px-3 py-1.5 rounded-full text-sm transition ${tab === 'telemetry' ? 'bg-white/10 text-white' : 'text-white/70 hover:text-white'}`}
              >
                Telemetry
              </button>
            </div>

            <button
              type="button"
              onClick={() => setMetricOpen(true)}
              className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white/90 hover:bg-white/15 transition"
            >
              Metric Definitions
            </button>

            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="px-3 py-2 rounded-lg bg-purple-500/15 border border-purple-400/25 text-purple-100 hover:bg-purple-500/20 hover:border-purple-300/40 transition"
            >
              Admin Settings
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {headerPills.map((p) => (
            <div
              key={p.label}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/20 border border-white/10"
              title={p.value}
            >
              <span className="text-xs opacity-70">{p.label}</span>
              <span className="text-xs font-mono text-white/90 max-w-[260px] truncate">{p.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'overview' ? (
          <AdminOverviewDashboard onGoUsers={() => setTab('users')} onGoLeads={() => setTab('leads')} />
        ) : tab === 'users' ? (
          <AdminUsersPage />
        ) : tab === 'leads' ? (
          <AdminLeadsPage />
        ) : tab === 'telemetry' ? (
          <AdminUsageDashboard />
        ) : tab === 'stripe' ? (
          <div className="p-4">
            <AdminStripeReadinessPanel />
          </div>
        ) : (
          <div className="p-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">App Feedback Inbox</div>
                <div className="text-sm opacity-75">Bug reports, feature requests, and general feedback submitted in-app.</div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white/90"
                >
                  <option value="new">New</option>
                  <option value="reviewing">Reviewing</option>
                  <option value="resolved">Resolved</option>
                  <option value="archived">Archived</option>
                  <option value="all">All</option>
                </select>

                <button
                  type="button"
                  onClick={() => loadSuggestions()}
                  className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white/90 hover:bg-white/15 transition"
                >
                  Refresh
                </button>
              </div>
            </div>

            {error && (
              <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-400/20 text-red-100">
                {error}
              </div>
            )}

            <div className="mt-4 rounded-xl border border-white/10 overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-white/5 text-xs uppercase tracking-wide text-white/60">
                <div className="col-span-2">Status</div>
                <div className="col-span-2">Type</div>
                <div className="col-span-6">Content</div>
                <div className="col-span-2">Actions</div>
              </div>

              {loading ? (
                <div className="p-4 text-white/70">Loading feedback…</div>
              ) : suggestions.length === 0 ? (
                <div className="p-6 text-white/60">No feedback found for this filter.</div>
              ) : (
                <div className="divide-y divide-white/10">
                  {suggestions.map((s) => {
                    const mailto = s.user_email
                      ? `mailto:${encodeURIComponent(s.user_email)}?subject=${encodeURIComponent('Re: Magic AI Wizard feedback')}&body=${encodeURIComponent(
                          `Hi!\n\nThanks for your feedback on Magic AI Wizard.\n\n---\nSubmitted: ${fmtTime(s.timestamp)}\nType: ${s.type}\nID: ${s.id}\n\nFeedback:\n${s.content}\n---\n\nReply here:\n`
                        )}`
                      : null;

                    return (
                      <div key={s.id} className="grid grid-cols-12 gap-2 px-4 py-3">
                        <div className="col-span-2 flex items-start gap-2">
                          <span className={`px-2 py-1 rounded-full text-xs border ${statusPillClass(s.status)}`}>{String(s.status || 'new')}</span>
                          <div className="text-xs text-white/50 mt-0.5" title={String(s.timestamp)}>
                            {fmtTime(s.timestamp)}
                          </div>
                        </div>

                        <div className="col-span-2">
                          <div className="text-sm font-semibold text-white/90">{s.type}</div>
                          <div className="text-xs text-white/60 truncate" title={s.user_email || ''}>
                            {s.user_email || 'anonymous'}
                          </div>
                        </div>

                        <div className="col-span-6">
                          <div className="text-sm text-white/85 whitespace-pre-wrap break-words">{s.content}</div>
                        </div>

                        <div className="col-span-2 flex flex-col gap-2 items-end">
                          <div className="flex gap-2">
                            <select
                              value={String(s.status || 'new')}
                              onChange={async (e) => {
                                const next = e.target.value as SuggestionStatus;
                                setBusyId(s.id);
                                try {
                                  await updateSuggestionStatus(s.id, next);
                                  setSuggestions((prev) => prev.map((x) => (x.id === s.id ? { ...x, status: next } : x)));
                                } catch (err: any) {
                                  setError(err?.message || 'Failed to update status');
                                } finally {
                                  setBusyId(null);
                                }
                              }}
                              className="px-2 py-1 rounded-lg bg-black/30 border border-white/10 text-white/90 text-sm"
                              disabled={busyId === s.id}
                            >
                              <option value="new">New</option>
                              <option value="reviewing">Reviewing</option>
                              <option value="resolved">Resolved</option>
                              <option value="archived">Archived</option>
                            </select>
                          </div>

                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await navigator.clipboard.writeText(
                                    `App Feedback (${s.type})\nSubmitted: ${fmtTime(s.timestamp)}\nUser: ${s.user_email || 'anonymous'}\nID: ${s.id}\n\n${s.content}`
                                  );
                                } catch {
                                  // no-op
                                }
                              }}
                              className="px-2 py-1 rounded-lg bg-white/10 border border-white/10 text-white/90 hover:bg-white/15 transition text-sm"
                            >
                              Copy
                            </button>

                            {mailto ? (
                              <a
                                href={mailto}
                                className="px-2 py-1 rounded-lg bg-purple-500/15 border border-purple-400/25 text-purple-100 hover:bg-purple-500/20 hover:border-purple-300/40 transition text-sm"
                              >
                                Reply
                              </a>
                            ) : (
                              <span className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-white/40 text-sm">Reply</span>
                            )}

                            <button
                              type="button"
                              onClick={async () => {
                                if (!confirm('Delete this feedback item? This cannot be undone.')) return;
                                setBusyId(s.id);
                                try {
                                  await deleteSuggestion(s.id);
                                  setSuggestions((prev) => prev.filter((x) => x.id !== s.id));
                                } catch (err: any) {
                                  setError(err?.message || 'Failed to delete');
                                } finally {
                                  setBusyId(null);
                                }
                              }}
                              className="px-2 py-1 rounded-lg bg-red-500/10 border border-red-400/20 text-red-100 hover:bg-red-500/15 transition text-sm"
                              disabled={busyId === s.id}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <AdminMetricDictionaryModal open={metricOpen} onClose={() => setMetricOpen(false)} />
      <AdminSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
