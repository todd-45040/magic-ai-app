import React, { useEffect, useMemo, useState } from 'react';
import AdminWindowSelector from './AdminWindowSelector';
import { snapAdminWindowDays } from '../utils/adminMetrics';
import { fetchAdminUsers, type AdminUserRow } from '../services/adminUsersService';

function money(n: any, digits = 4) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return `$${v.toFixed(digits)}`;
}

function fmtDate(s: string | null) {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleString();
  } catch {
    return s;
  }
}

function labelPlan(m: string | null) {
  const v = String(m || 'unknown');
  if (v === 'professional' || v === 'pro') return 'Pro';
  if (v === 'amateur' || v === 'performer' || v === 'semi-pro') return 'Amateur';
  if (v === 'trial') return 'Trial';
  if (v === 'admin') return 'Admin';
  if (v === 'expired') return 'Expired';
  if (v === 'free') return 'Free';
  return v;
}

export default function AdminUsersPage() {
  const [plan, setPlan] = useState<string>('all');
  const [q, setQ] = useState<string>('');
  const [days, setDays] = useState<number>(() => {
    const params = new URLSearchParams(window.location.search);
    return snapAdminWindowDays(params.get('days') ?? 30, 30);
  });
  const [limit, setLimit] = useState<number>(50);
  const [offset, setOffset] = useState<number>(0);

  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [err, setErr] = useState<string | null>(null);

  const page = Math.floor(offset / limit) + 1;
  const pages = Math.max(1, Math.ceil(total / limit));

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetchAdminUsers({ plan, q, days, limit, offset });
      setRows(res.users || []);
      setTotal(Number(res.paging?.total || 0));
      // Keep UI in sync with backend snapping (prevents drift if URL/query is non-standard)
      if (res.window?.days && res.window.days !== days) setDays(res.window.days);
    } catch (e: any) {
      setErr(e?.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, days, limit, offset]);

  const onSearch = () => {
    setOffset(0);
    void load();
  };

  const totals = useMemo(() => {
    let cost = 0;
    let events = 0;
    for (const r of rows) {
      cost += Number(r.cost_usd_window || 0);
      events += Number(r.events_window || 0);
    }
    return { cost, events };
  }, [rows]);

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Admin – Users</h2>
          <div className="text-sm opacity-75">Drill-down list with activity + cost in the selected window.</div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <AdminWindowSelector
            value={days}
            onChange={(d) => {
              setDays(d);
              setOffset(0);
            }}
          />

          <select
            value={plan}
            onChange={(e) => {
              setPlan(e.target.value);
              setOffset(0);
            }}
            className="px-2 py-1 rounded border border-white/10 bg-black/20"
          >
            <option value="all">All plans</option>
            <option value="trial">Trial</option>
            <option value="amateur">Amateur</option>
            <option value="professional">Pro</option>
            <option value="admin">Admin</option>
            <option value="expired">Expired</option>
            <option value="free">Free</option>
          </select>

          <select
            value={limit}
            onChange={(e) => {
              setLimit(Number(e.target.value));
              setOffset(0);
            }}
            className="px-2 py-1 rounded border border-white/10 bg-black/20"
            title="Rows per page"
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>

          <div className="flex items-center gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSearch();
              }}
              placeholder="Search email…"
              className="px-3 py-1.5 rounded-lg bg-black/20 border border-white/10 text-white/90 w-[220px]"
            />
            <button
              type="button"
              onClick={onSearch}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10"
              disabled={loading}
            >
              Search
            </button>
          </div>

          <button
            type="button"
            onClick={load}
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10"
            disabled={loading}
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {err && <div className="p-3 rounded bg-red-500/10 border border-red-500/20 text-red-200">{err}</div>}

      <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex flex-wrap items-center gap-3 text-sm">
        <div className="opacity-80">
          Showing <span className="font-mono">{rows.length}</span> of <span className="font-mono">{total}</span>
        </div>
        <div className="opacity-80">
          Page <span className="font-mono">{page}</span> / <span className="font-mono">{pages}</span>
        </div>
        <div className="opacity-80">
          Page cost: <span className="font-mono">{money(totals.cost, 4)}</span>
        </div>
        <div className="opacity-80">
          Page events: <span className="font-mono">{totals.events}</span>
        </div>
      </div>

      <div className="overflow-auto rounded-xl border border-white/10 bg-black/20">
        <table className="min-w-[980px] w-full text-sm">
          <thead className="bg-white/5">
            <tr className="text-left">
              <th className="p-3">Email</th>
              <th className="p-3">Plan</th>
              <th className="p-3">Created</th>
              <th className="p-3">Last Active</th>
              <th className="p-3">Events (win)</th>
              <th className="p-3">Cost (win)</th>
              <th className="p-3">User ID</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="p-4 opacity-70" colSpan={7}>
                  {loading ? 'Loading…' : 'No users found.'}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-white/10 hover:bg-white/5">
                  <td className="p-3">{r.email || '—'}</td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded-full bg-white/10 border border-white/10">{labelPlan(r.membership)}</span>
                  </td>
                  <td className="p-3 font-mono text-xs">{fmtDate(r.created_at)}</td>
                  <td className="p-3 font-mono text-xs">{fmtDate(r.last_active_at)}</td>
                  <td className="p-3 font-mono">{r.events_window ?? 0}</td>
                  <td className="p-3 font-mono">{money(r.cost_usd_window, 4)}</td>
                  <td className="p-3 font-mono text-xs opacity-70">{r.id}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setOffset(Math.max(0, offset - limit))}
          disabled={loading || offset === 0}
          className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 disabled:opacity-50"
        >
          Prev
        </button>
        <button
          type="button"
          onClick={() => setOffset(Math.min((pages - 1) * limit, offset + limit))}
          disabled={loading || offset + limit >= total}
          className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}
