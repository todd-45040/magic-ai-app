import { logEvent } from './analyticsService';

export type PipelineStep = 'image' | 'effect' | 'script' | 'routine' | 'show';
export type PipelineSourceType = 'image' | 'effect' | 'script' | 'routine' | 'manual';

export interface PipelineSession {
  id: string;
  sourceType: PipelineSourceType;
  imageUrl?: string | null;
  prompt?: string | null;
  title?: string | null;
  effect?: any;
  script?: string | null;
  routine?: any;
  showId?: string | null;
  lastStep: PipelineStep;
  createdAt: string;
  updatedAt: string;
  lastStepAt: number;
}

const PIPELINE_SESSION_KEY = 'maw_pipeline_session_v1';
const PIPELINE_SESSION_HISTORY_KEY = 'maw_pipeline_session_history_v1';

const nowIso = () => new Date().toISOString();
const nowMs = () => Date.now();

const safeJsonParse = <T,>(raw: string | null): T | null => {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
};

const makeId = () => {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  } catch {}
  return `pipeline_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

export function getPipelineSession(): PipelineSession | null {
  try { return safeJsonParse<PipelineSession>(localStorage.getItem(PIPELINE_SESSION_KEY)); } catch { return null; }
}

export function savePipelineSession(session: PipelineSession): PipelineSession {
  try { localStorage.setItem(PIPELINE_SESSION_KEY, JSON.stringify(session)); } catch {}
  return session;
}

function appendHistory(session: PipelineSession) {
  try {
    const existing = safeJsonParse<PipelineSession[]>(localStorage.getItem(PIPELINE_SESSION_HISTORY_KEY)) || [];
    const next = [session, ...existing.filter((item) => item.id !== session.id)].slice(0, 20);
    localStorage.setItem(PIPELINE_SESSION_HISTORY_KEY, JSON.stringify(next));
  } catch {}
}

export function startPipelineSession(input: Partial<PipelineSession> & { sourceType: PipelineSourceType; lastStep: PipelineStep }): PipelineSession {
  const ts = nowMs();
  const session: PipelineSession = {
    id: input.id || makeId(),
    sourceType: input.sourceType,
    imageUrl: input.imageUrl ?? null,
    prompt: input.prompt ?? null,
    title: input.title ?? null,
    effect: input.effect ?? null,
    script: input.script ?? null,
    routine: input.routine ?? null,
    showId: input.showId ?? null,
    lastStep: input.lastStep,
    createdAt: input.createdAt || nowIso(),
    updatedAt: nowIso(),
    lastStepAt: ts,
  };
  savePipelineSession(session);
  appendHistory(session);
  void logEvent('pipeline_session_started', { session_id: session.id, source_type: session.sourceType, step: session.lastStep });
  return session;
}

export function updatePipelineSession(step: PipelineStep, patch: Partial<PipelineSession> = {}): PipelineSession {
  const existing = getPipelineSession();
  const ts = nowMs();
  const previousStep = existing?.lastStep || null;
  const previousStepAt = existing?.lastStepAt || ts;
  const session: PipelineSession = {
    id: existing?.id || makeId(),
    sourceType: patch.sourceType || existing?.sourceType || 'manual',
    imageUrl: patch.imageUrl ?? existing?.imageUrl ?? null,
    prompt: patch.prompt ?? existing?.prompt ?? null,
    title: patch.title ?? existing?.title ?? null,
    effect: patch.effect ?? existing?.effect ?? null,
    script: patch.script ?? existing?.script ?? null,
    routine: patch.routine ?? existing?.routine ?? null,
    showId: patch.showId ?? existing?.showId ?? null,
    lastStep: step,
    createdAt: existing?.createdAt || patch.createdAt || nowIso(),
    updatedAt: nowIso(),
    lastStepAt: ts,
  };
  savePipelineSession(session);
  appendHistory(session);
  void logEvent('pipeline_step_completed', {
    session_id: session.id,
    from: previousStep,
    to: step,
    source: session.sourceType,
    time_ms: previousStep ? Math.max(0, ts - previousStepAt) : 0,
  });
  return session;
}

export function trackPipelineAdvance(from: PipelineStep, to: PipelineStep, source?: string, extra: Record<string, any> = {}) {
  const session = getPipelineSession();
  const ts = nowMs();
  const timeMs = session?.lastStepAt ? Math.max(0, ts - session.lastStepAt) : 0;
  void logEvent('pipeline_time_to_next_step', {
    session_id: session?.id || null,
    from,
    to,
    source: source || session?.sourceType || 'unknown',
    time_ms: timeMs,
    ...extra,
  });
}

export function clearPipelineSession() {
  try { localStorage.removeItem(PIPELINE_SESSION_KEY); } catch {}
}
