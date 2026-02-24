// Demo Mode v2 (Phase 1): Safe isolation layer.
// This file intentionally contains ONLY light helpers and does not intercept AI calls yet.
//
// Activation rules:
// - URL flag: ?demo=1
// - LocalStorage flag: maw_demo_mode === "true"
//
// NOTE: This is separate from the older demoSeedService so we can evolve Demo Mode
// without touching production logic.

export const DEMO_FLAG_KEY = 'maw_demo_mode';

export function isDemoMode(): boolean {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const urlFlag = urlParams.get('demo') === '1';
    const lsFlag = localStorage.getItem(DEMO_FLAG_KEY) === 'true';
    return urlFlag || lsFlag;
  } catch {
    return false;
  }
}

export function enableDemoMode(): void {
  try {
    localStorage.setItem(DEMO_FLAG_KEY, 'true');
  } catch {
    // ignore
  }
}

export function disableDemoMode(): void {
  try {
    localStorage.setItem(DEMO_FLAG_KEY, 'false');
  } catch {
    // ignore
  }
}
