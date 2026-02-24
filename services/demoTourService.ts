import { isDemoEnabled, DEMO_FLAG_KEY } from './demoSeedService';
import { demoScenarios } from '../src/demo/demoScenarios';

export const DEMO_SCENARIO_KEY = 'maw_demo_scenario';
export const DEMO_STEP_INDEX_KEY = 'maw_demo_step_index';
export const DEMO_STEPS_COMPLETED_KEY = 'maw_demo_steps_completed';

/**
 * Demo Mode v2 (Phase 3): lightweight "guided showcase" progress tracker.
 * - Uses localStorage only
 * - Does not touch Supabase
 * - Does not intercept AI calls (Phase 2 already intercepts Effect Engine only)
 */

type CompletedMap = Record<string, boolean>;

function getSafeStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}


function readJson<T>(key: string, fallback: T): T {
  try {
        const storage = getSafeStorage();
    const raw = storage?.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

export function isDemoTourActive(): boolean {
  // "Demo tour" is a UX layer on top of existing Demo Mode.
  return isDemoEnabled();
}

export function getDemoScenarioKey(): string {
  try {
    return (getSafeStorage()?.getItem(DEMO_SCENARIO_KEY) ?? null) || 'corporate_closeup';
  } catch {
    return 'corporate_closeup';
  }
}

export function setDemoScenarioKey(key: string): void {
  try {
        const storage = getSafeStorage();
    storage?.setItem(DEMO_SCENARIO_KEY, key);
  } catch {}
}

export function getDemoScenario() {
  const key = getDemoScenarioKey();
  return demoScenarios[key] ?? demoScenarios.corporate_closeup;
}

export function getDemoStepIndex(): number {
  try {
        const storage = getSafeStorage();
    const raw = storage?.getItem(DEMO_STEP_INDEX_KEY);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function setDemoStepIndex(index: number): void {
  try {
    localStorage.setItem(DEMO_STEP_INDEX_KEY, String(Math.max(0, index)));
  } catch {}
}

export function getCompletedSteps(): CompletedMap {
  return readJson<CompletedMap>(DEMO_STEPS_COMPLETED_KEY, {});
}

export function markDemoToolCompleted(tool: string): void {
  const completed = getCompletedSteps();
  completed[tool] = true;
  writeJson(DEMO_STEPS_COMPLETED_KEY, completed);
}

export function isDemoToolCompleted(tool: string): boolean {
  const completed = getCompletedSteps();
  return Boolean(completed[tool]);
}

export function getCurrentDemoStep() {
  const scenario = getDemoScenario();
  const idx = Math.min(getDemoStepIndex(), Math.max(0, scenario.steps.length - 1));
  return { step: scenario.steps[idx], index: idx, total: scenario.steps.length, scenario };
}

export function getCurrentDemoView(): string | null {
  const { step } = getCurrentDemoStep();
  return (step as any).view ?? null;
}

export function isViewLocked(view: string): boolean {
  if (!isDemoTourActive()) return false;

  const scenario = getDemoScenario();
  const idx = getDemoStepIndex();

  const stepIndexForView = scenario.steps.findIndex(s => (s as any).view === view);
  if (stepIndexForView === -1) return false; // views not part of tour remain accessible

  return stepIndexForView > idx;
}

/**
 * Can we continue from the current step?
 * Phase 3 rule: Step 1 requires an actual Effect Engine demo run (marked complete).
 * Other steps can be advanced via the "Continue" CTA (we mark them complete when continuing).
 */
export function canContinueFromCurrentStep(): boolean {
  const { step } = getCurrentDemoStep();
  const tool = step.tool;
  if (tool === 'effect_engine') return isDemoToolCompleted('effect_engine');
  return true;
}

export function advanceDemoStep(): void {
  const { index, total, step } = getCurrentDemoStep();
  // Mark current step complete on advance (except Effect Engine which is marked on generation)
  if (step.tool !== 'effect_engine') {
    markDemoToolCompleted(step.tool);
  }

  const nextIndex = Math.min(index + 1, total - 1);
  setDemoStepIndex(nextIndex);
}

export function resetDemoTourProgress(): void {
  try {
    localStorage.removeItem(DEMO_STEP_INDEX_KEY);
    localStorage.removeItem(DEMO_STEPS_COMPLETED_KEY);
  } catch {}
}

export function exitDemoModeHard(): void {
  // Used by UI to fully exit demo mode and clear progress.
  resetDemoTourProgress();
  try {
    localStorage.removeItem(DEMO_SCENARIO_KEY);
    localStorage.removeItem(DEMO_FLAG_KEY);
  } catch {}
}
