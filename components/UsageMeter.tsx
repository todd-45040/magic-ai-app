import React, { useEffect, useMemo, useState } from 'react';
import { fetchUsageStatus, type UsageStatus } from '../services/usageStatusService';

type UsageDetail = UsageStatus & { ts?: number };

function formatMembership(m?: string) {
  if (!m) return '';
  if (m === 'semi-pro') return 'Semi‑Pro';
  return m.charAt(0).toUpperCase() + m.slice(1);
}

export default function UsageMeter() {
  const [status, setStatus] = useState<UsageDetail>({ ok: true });

  const percentUsed = useMemo(() => {
    const used = status.used ?? (status.limit != null && status.remaining != null ? status.limit - status.remaining : undefined);
    const limit = status.limit;
    if (used == null || !limit || limit <= 0) return 0;
    return Math.min(100, Math.max(0, Math.round((used / limit) * 100)));
  }, [status.used, status.limit, status.remaining]);

  const label = useMemo(() => {
    const remaining = status.remaining;
    const limit = status.limit;
    const mem = formatMembership(status.membership);

    if (limit === 10000 && remaining != null) {
      return `${mem}: ${remaining}+`;
    }
    if (remaining == null || limit == null) {
      return mem ? `${mem}` : 'AI Usage';
    }
    return `${mem}: ${remaining}/${limit}`;
  }, [status.remaining, status.limit, status.membership]);

  const burst = useMemo(() => {
    if (status.burstRemaining == null || status.burstLimit == null) return null;
    return `${status.burstRemaining}/${status.burstLimit} min`;
  }, [status.burstRemaining, status.burstLimit]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const s = await fetchUsageStatus();
      if (mounted && s?.ok) setStatus(s);
    };

    load();
    const interval = window.setInterval(load, 60000);

    const onUsageUpdate = (e: Event) => {
      const ce = e as CustomEvent;
      const detail = (ce.detail || {}) as UsageDetail;

      // Merge partial updates from headers
      setStatus(prev => ({
        ...prev,
        ...detail,
        ok: true,
      }));
    };

    window.addEventListener('ai-usage-update', onUsageUpdate);

    return () => {
      mounted = false;
      window.clearInterval(interval);
      window.removeEventListener('ai-usage-update', onUsageUpdate);
    };
  }, []);

  // If we have no data yet, keep it subtle
  const showBar = status.limit != null && status.limit > 0 && status.remaining != null;

  return (
    <div className="hidden sm:flex items-center gap-3 px-3 py-1.5 rounded-full bg-slate-900/60 border border-slate-700">
      <div className="flex flex-col leading-tight">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-200">{label}</span>
          {burst && <span className="text-[10px] text-slate-400">• {burst}</span>}
        </div>
        {showBar && (
          <div className="mt-1 h-1.5 w-36 rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-purple-500/80"
              style={{ width: `${percentUsed}%` }}
              aria-label="AI usage progress"
            />
          </div>
        )}
      </div>
    </div>
  );
}
