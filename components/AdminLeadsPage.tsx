import React, { useEffect, useMemo, useState } from 'react';
import AdminWindowSelector from './AdminWindowSelector';
import { downloadCsv } from './adminCsv';
import { fetchAdminWaitlistLeads } from '../services/adminLeadsService';
import { ADMIN_WINDOWS, type AdminWindowDays } from '../utils/adminMetrics';

function fmt(ts: any) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts || '');
  }
}

function getMeta(row: any) {
  const m = row?.meta;
  if (!m) return {};
  if (typeof m === 'object') return m;
  try {
    return JSON.parse(String(m));
  } catch {
    return {};
  }
}

export default function AdminLeadsPage() {
  const [days, setDays] = useState<AdminWindowDays>(7);
  const [rows, setRows] = useState<any[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const windowLabel = useMemo(() => (ADMIN_WINDOWS.find((w) => w.days === days)?.label ?? `${days}d`), [days]);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetchAdminWaitlistLeads({ source: 'admc', days, limit: 500, offset: 0 });
      setRows(r?.rows || []);
      setCount(typeof r?.count === 'number' ? r.count : null);
    } catch (e: any) {
      setErr(e?.message || 'Failed to load leads');
      setRows([]);
      setCount(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const exportRows = useMemo(() => {
    return (rows || []).map((r) => {
      const m = getMeta(r);
      const utm = (m?.utm && typeof m.utm === 'object') ? m.utm : {};
      return {
        created_at: r?.created_at || '',
        name: r?.name || '',
        email: r?.email || '',
        source: r?.source || '',
        performer_type: m?.performer_type || m?.type || '',
        page: m?.page || '',
        ref: m?.ref || '',
        utm_source: utm?.utm_source || '',
        utm_medium: utm?.utm_medium || '',
        utm_campaign: utm?.utm_campaign || '',
        utm_content: utm?.utm_content || '',
        utm_term: utm?.utm_term || '',
      };
    });
  }, [rows]);

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <div className="text-xl font-bold text-amber-200">ADMC Leads</div>
          <div className="text-sm opacity-80">Convention waitlist signups (source = admc).</div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <AdminWindowSelector value={days} onChange={setDays} label="Window" />
          <button
            type="button"
            onClick={() => downloadCsv(`admc_leads_${windowLabel}.csv`, exportRows)}
            className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white/90 hover:bg-white/15 transition"
            disabled={loading || exportRows.length === 0}
            title={exportRows.length === 0 ? 'No rows to export' : 'Download CSV'}
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => load()}
            className="px-3 py-2 rounded-lg bg-purple-500/15 border border-purple-400/25 text-purple-100 hover:bg-purple-500/20 hover:border-purple-300/40 transition"
            disabled={loading}
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="text-sm opacity-80">ADMC leads captured ({windowLabel})</div>
        <div className="mt-1 text-3xl font-extrabold text-white">{count === null ? '—' : count}</div>
      </div>

      {err && <div className="p-3 rounded-lg bg-red-500/10 border border-red-400/20 text-red-100">{err}</div>}

      <div className="rounded-xl border border-white/10 overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-white/5 text-xs uppercase tracking-wide text-white/60">
          <div className="col-span-2">Created</div>
          <div className="col-span-3">Name</div>
          <div className="col-span-3">Email</div>
          <div className="col-span-2">Performer</div>
          <div className="col-span-2">Ref / Page</div>
        </div>

        {loading ? (
          <div className="p-4 text-white/70">Loading leads…</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-white/60">No ADMC leads for this window.</div>
        ) : (
          <div className="divide-y divide-white/10">
            {rows.map((r) => {
              const m = getMeta(r);
              return (
                <div key={r.id} className="grid grid-cols-12 gap-2 px-4 py-3">
                  <div className="col-span-2 text-xs text-white/70">{fmt(r.created_at)}</div>
                  <div className="col-span-3 text-sm font-semibold text-white/90 truncate" title={r?.name || ''}>
                    {r?.name || '—'}
                  </div>
                  <div className="col-span-3 text-sm text-white/85 truncate" title={r?.email || ''}>
                    {r?.email || '—'}
                  </div>
                  <div className="col-span-2 text-sm text-white/80 truncate" title={m?.performer_type || ''}>
                    {m?.performer_type || '—'}
                  </div>
                  <div className="col-span-2 text-xs text-white/70 truncate" title={`${m?.ref || ''} ${m?.page || ''}`}>
                    {(m?.ref ? `ref:${m.ref}` : '') || (m?.page || '—')}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="text-xs text-white/60">
        Tip: Keep your QR pointing to the ADMC page with UTMs (utm_source=admc) so you can track ROI in analytics + exports.
      </div>
    </div>
  );
}
