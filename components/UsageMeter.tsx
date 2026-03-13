import React, { useEffect, useMemo, useState } from 'react';
import { fetchUsageStatus, type UsageStatus } from '../services/usageStatusService';
import { getUsage } from '../services/usageTracker';
import type { User } from '../types';

type UsageDetail = UsageStatus & { ts?: number };

function formatMembership(m?: string) {
  if (!m) return '';
  if (m === 'semi-pro') return 'Semi‑Pro';
  return m.charAt(0).toUpperCase() + m.slice(1);
}

export default function UsageMeter({ user }: { user?: User | null }) {
  const [status, setStatus] = useState<UsageDetail>({ ok: true });
  const [live, setLive] = useState<{ used: number; limit: number; remaining: number } | null>(null);

  const percentUsed = useMemo(() => {
    const used = status.used ?? (status.limit != null && status.remaining != null ? status.limit - status.remaining : undefined);
    const limit = status.limit;
    if (used == null || !limit || limit <= 0) return 0;
    return Math.min(100, Math.max(0, Math.round((used / limit) * 100)));
  }, [status.used, status.limit, status.remaining]);

  const label = useMemo(() => {
    const remaining = status.remaining;
    const limit = status.limit;
    const used = status.used ?? (limit != null && remaining != null ? limit - remaining : undefined);
    const mem = formatMembership(status.membership);

    if (limit === 10000 && remaining != null) {
      return `${mem}: ${remaining}+`;
    }
    if (remaining == null || limit == null) {
      return mem ? `${mem}` : 'AI Usage';
    }
    // Show USED/LIMIT to avoid confusion (e.g., "11/20" can read like used when it's actually remaining).
    return used == null ? `${mem}: ${remaining}/${limit}` : `${mem}: ${used}/${limit}`;
  }, [status.used, status.remaining, status.limit, status.membership]);

  const liveLabel = useMemo(() => {
    if (!live || !live.limit) return null;
    // Show USED/LIMIT for consistency with AI label.
    return `Live Rehearsal (Audio): ${live.used}/${live.limit} min`;
  }, [live]);

  useEffect(() => {
    let mounted = true;

    const loadServer = async () => {
      try {
        const s = await fetchUsageStatus();
        if (mounted && s?.ok) setStatus(s);
      } catch {
        // ignore
      }
    };

    const loadLive = (s?: UsageStatus) => {
      // Prefer server-backed live usage. Fall back to local only if server doesn't provide live fields.
      if (s?.liveLimit != null && s.liveRemaining != null && s.liveUsed != null) {
        setLive({ used: Number(s.liveUsed || 0), limit: Number(s.liveLimit || 0), remaining: Number(s.liveRemaining || 0) });
        return;
      }
      if (!user) {
        setLive(null);
        return;
      }
      try {
        setLive(getUsage(user, 'live_minutes'));
      } catch {
        setLive(null);
      }
    };

    (async () => {
      const s = await fetchUsageStatus().catch(() => null as any);
      if (mounted && s?.ok) {
        setStatus(s);
        loadLive(s);
      } else {
        loadLive();
      }
    })();

    const interval = window.setInterval(async () => {
      const s = await fetchUsageStatus().catch(() => null as any);
      if (mounted && s?.ok) {
        setStatus(s);
        loadLive(s);
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

    const onLocalUsageUpdate = (e: Event) => {
      const ce = e as CustomEvent;
      const detail = (ce.detail || {}) as any;
      if (detail.metric !== 'live_minutes') return;
      if (!mounted) return;
      setLive({
        used: Number(detail.used ?? 0),
        limit: Number(detail.limit ?? 0),
        remaining: Number(detail.remaining ?? 0),
      });
    };

    const onLiveUsageUpdate = (e: Event) => {
      const ce = e as CustomEvent;
      const detail = (ce.detail || {}) as any;
      if (!mounted) return;
      if (detail.liveLimit == null && detail.liveRemaining == null && detail.liveUsed == null) return;
      setLive({
        used: Number(detail.liveUsed ?? 0),
        limit: Number(detail.liveLimit ?? 0),
        remaining: Number(detail.liveRemaining ?? 0),
      });
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
