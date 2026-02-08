import { getBearerToken } from './usageStatusService';

export type LiveMinutesStatus = {
  ok: boolean;
  membership?: string;
  liveUsed?: number;
  liveLimit?: number;
  liveRemaining?: number;
  error?: string;
};

export async function fetchLiveMinutesStatus(): Promise<LiveMinutesStatus> {
  const res = await fetch('/api/liveMinutes', {
    method: 'GET',
    headers: { Authorization: await getBearerToken() },
  });

  let json: any = {};
  try {
    json = await res.json();
  } catch {
    // ignore
  }
  return { ok: !!json?.ok && res.ok, ...json } as LiveMinutesStatus;
}

export async function consumeLiveMinutesServer(minutes: number): Promise<LiveMinutesStatus> {
  const res = await fetch('/api/liveMinutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: await getBearerToken(),
    },
    body: JSON.stringify({ minutes }),
  });

  let json: any = {};
  try {
    json = await res.json();
  } catch {
    // ignore
  }

  // If it failed, preserve server-provided fields when present.
  if (!res.ok) {
    return {
      ok: false,
      error: json?.error || 'Daily live rehearsal limit reached.',
      membership: json?.membership,
      liveUsed: json?.liveUsed,
      liveLimit: json?.liveLimit,
      liveRemaining: json?.liveRemaining,
    };
  }

  return { ok: true, ...json } as LiveMinutesStatus;
}

export function emitLiveUsageUpdate(detail: LiveMinutesStatus) {
  try {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('live-usage-update', { detail: { ...detail, ts: Date.now() } }));
  } catch {
    // ignore
  }
}
