// Shared Admin window parsing + consistent options.

export const ADMIN_WINDOW_OPTIONS_DAYS = [1, 7, 30, 90] as const;
export type AdminWindowDays = (typeof ADMIN_WINDOW_OPTIONS_DAYS)[number];

export function parseAdminWindowDays(input: any, fallback: AdminWindowDays = 30): AdminWindowDays {
  const n = Number(input);
  if (!Number.isFinite(n)) return fallback;

  // Exact matches first
  for (const d of ADMIN_WINDOW_OPTIONS_DAYS) {
    if (n === d) return d;
  }

  // If a non-standard value is provided, snap to the nearest supported window.
  const clamped = Math.max(1, Math.min(365, Math.floor(n)));
  let best: AdminWindowDays = fallback;
  let bestDist = Infinity;
  for (const d of ADMIN_WINDOW_OPTIONS_DAYS) {
    const dist = Math.abs(clamped - d);
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  return best;
}

export function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export function ymdDaysAgo(days: number): string {
  return isoDaysAgo(days).slice(0, 10);
}

export function adminWindowLabel(days: number): string {
  if (days === 1) return 'Today';
  return `${days}d`;
}
