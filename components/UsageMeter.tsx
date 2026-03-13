import React, { useEffect, useMemo, useState } from 'react';
import { fetchUsageStatus, type UsageStatus } from '../services/usageStatusService';
import { buildNormalizedUsageSnapshot } from '../services/usagePresentation';
import type { User } from '../types';

type UsageDetail = UsageStatus & { ts?: number };

export default function UsageMeter({ user }: { user?: User | null }) {
  const [status, setStatus] = useState<UsageDetail>({ ok: true });

  const normalized = useMemo(() => buildNormalizedUsageSnapshot(user, status?.ok ? status : null), [user, status]);

  const percentUsed = useMemo(() => {
    const used = normalized.used;
    const limit = normalized.limit;
    if (used == null || !limit || limit <= 0) return 0;
    return Math.min(100, Math.max(0, Math.round((used / limit) * 100)));
  }, [normalized.used, normalized.limit]);

  const label = useMemo(() => {
    if (normalized.limit === 10000 && normalized.remaining != null) {
      return `${normalized.planLabel}: ${normalized.remaining}+`;
    }
    if (normalized.remaining == null || normalized.limit == null) {
      return normalized.planLabel ? `${normalized.planLabel}` : 'AI Usage';
    }
    return `${normalized.planLabel}: ${normalized.used}/${normalized.limit}`;
  }, [normalized]);

  const liveLabel = useMemo(() => {
    if (!normalized.liveHeader || !normalized.liveHeader.limit) return null;
    return `Live Rehearsal (Audio): ${normalized.liveHeader.used}/${normalized.liveHeader.limit} min`;
  }, [normalized.liveHeader]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const s = await fetchUsageStatus().catch(() => null as any);
      if (mounted && s?.ok) {
        setStatus(s);
      } else if (mounted) {
        setStatus({ ok: false } as UsageDetail);
      }
    })();

    const interval = window.setInterval(async () => {
      const s = await fetchUsageStatus().catch(() => null as any);
      if (mounted && s?.ok) {
        setStatus(s);
      }
    }, 60000);

    const onServerUsageUpdate = (e: Event) => {
      const ce = e as CustomEvent;
      const detail = (ce.detail || {}) as UsageDetail;

      // Merge partial updates from headers
      setStatus((prev) => ({
        ...prev,
        ...detail,
        ok: true,
      }));
    };

    const onLocalUsageUpdate = () => {
      if (!mounted) return;
      setStatus((prev) => ({ ...(prev || { ok: false }), ts: Date.now() } as UsageDetail));
    };

    const onLiveUsageUpdate = () => {
      if (!mounted) return;
      setStatus((prev) => ({ ...(prev || { ok: false }), ts: Date.now() } as UsageDetail));
    };

    window.addEventListener('ai-usage-update', onServerUsageUpdate);
    window.addEventListener('maw-usage-local-update', onLocalUsageUpdate);
    window.addEventListener('live-usage-update', onLiveUsageUpdate);

    return () => {
      mounted = false;
      window.clearInterval(interval);
      window.removeEventListener('ai-usage-update', onServerUsageUpdate);
      window.removeEventListener('maw-usage-local-update', onLocalUsageUpdate);
      window.removeEventListener('live-usage-update', onLiveUsageUpdate);
    };
  }, [user]);

  // If we have no data yet, keep it subtle
  const showBar = status.limit != null && status.limit > 0 && status.remaining != null;

  return (
    <div className="hidden sm:flex items-center gap-3 px-3 py-1.5 rounded-full bg-slate-900/60 border border-slate-700">
      <div className="flex flex-col leading-tight">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-200">{label}</span>
          {liveLabel && <span className="text-[10px] text-slate-400">• {liveLabel}</span>}
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
