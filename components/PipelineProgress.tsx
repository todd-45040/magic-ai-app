import { useEffect, useMemo, useState } from 'react';
import { getPipelineSession, type PipelineSession, type PipelineStep } from '../services/pipelineSessionService';

const STEPS: PipelineStep[] = ['image', 'effect', 'script', 'routine', 'show'];

const LABELS: Record<PipelineStep, string> = {
  image: 'Image',
  effect: 'Effect',
  script: 'Script',
  routine: 'Routine',
  show: 'Show',
};

const STAGE_DESCRIPTIONS: Record<PipelineStep, string> = {
  image: 'Collect a visual seed, staging direction, or design reference that can anchor the project.',
  effect: 'Shape the seed into a practical effect concept with method-safe theatrical structure.',
  script: 'Turn the concept into usable patter, beats, tone, and audience-facing language.',
  routine: 'Rehearse and refine timing, clarity, blocking, transitions, and performance confidence.',
  show: 'Move the routine into a show plan with props, tasks, cues, and production details.',
};

const NEXT_ACTIONS: Record<PipelineStep, { next?: PipelineStep; label: string; detail: string }> = {
  image: {
    next: 'effect',
    label: 'Develop an effect from this visual seed',
    detail: 'Use the selected image or brainstorm direction as the anchor for the next creative decision.',
  },
  effect: {
    next: 'script',
    label: 'Write performance-ready patter',
    detail: 'Convert the effect concept into a script with tone, beats, and audience management language.',
  },
  script: {
    next: 'routine',
    label: 'Rehearse the script as a routine',
    detail: 'Test timing, pacing, clarity, and delivery before moving it into a show plan.',
  },
  routine: {
    next: 'show',
    label: 'Add the routine to a show plan',
    detail: 'Connect the routine with props, staging notes, tasks, cues, and performance logistics.',
  },
  show: {
    label: 'Project is ready for performance planning',
    detail: 'Review the full workspace, confirm props and timing, then continue refining as needed.',
  },
};

const WORKSPACE_SELECTION_KEY = 'maw_project_workspace_selected_v1';
const WORKSPACE_HANDOFF_KEY = 'maw_project_continuity_handoff_v1';
const PIPELINE_PROJECT_MEMORY_KEY = 'maw_creative_pipeline_project_memory_v1';

type WorkspacePipelineContext = {
  projectId?: string;
  projectTitle?: string;
  projectStage?: string;
  targetView?: string;
  imageUrl?: string;
  linkedAssetIds: string[];
  linkedAssetCount: number;
  source?: string;
  updatedAt?: number;
};

interface PipelineProgressProps {
  currentStep?: PipelineStep;
  compact?: boolean;
}

const safeJsonParse = <T,>(raw: string | null): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const readWorkspaceContext = (): WorkspacePipelineContext | null => {
  if (typeof window === 'undefined') return null;
  try {
    const handoff = safeJsonParse<Record<string, any>>(localStorage.getItem(WORKSPACE_HANDOFF_KEY)) || {};
    const selected = safeJsonParse<Record<string, any>>(localStorage.getItem(WORKSPACE_SELECTION_KEY)) || {};
    const project = handoff.project && typeof handoff.project === 'object' ? handoff.project : {};
    const linkedAssetIds = Array.isArray(handoff.ideaIds)
      ? handoff.ideaIds.map(String).filter(Boolean)
      : Array.isArray(project.linkedAssetIds)
        ? project.linkedAssetIds.map(String).filter(Boolean)
        : [];

    const projectTitle = String(
      handoff.projectTitle ||
      handoff.title ||
      project.projectTitle ||
      selected.projectTitle ||
      ''
    ).trim();
    const projectId = String(handoff.projectId || project.projectId || selected.projectId || '').trim();

    if (!projectTitle && !projectId && linkedAssetIds.length === 0) return null;

    return {
      projectId: projectId || undefined,
      projectTitle: projectTitle || 'Current Project',
      projectStage: String(project.projectStage || project.workspaceStage || handoff.pipelineStage || '').trim() || undefined,
      targetView: String(handoff.targetView || project.workspaceStage || '').trim() || undefined,
      imageUrl: String(handoff.imageUrl || '').trim() || undefined,
      linkedAssetIds,
      linkedAssetCount: linkedAssetIds.length,
      source: String(handoff.source || 'project_workspace'),
      updatedAt: Number(selected.updatedAt || project.lastUpdatedAt || Date.parse(handoff.created_at || '') || Date.now()),
    };
  } catch {
    return null;
  }
};

const formatRelativeTime = (timestamp?: number | string | null): string => {
  if (!timestamp) return 'Recently';
  const ms = typeof timestamp === 'string' ? Date.parse(timestamp) : timestamp;
  if (!Number.isFinite(ms)) return 'Recently';
  const diff = Math.max(0, Date.now() - ms);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  try {
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(ms));
  } catch {
    return 'Recently';
  }
};

const stepIndex = (step: PipelineStep) => Math.max(0, STEPS.indexOf(step));

const inferCompletedSteps = (session: PipelineSession | null, active: PipelineStep): PipelineStep[] => {
  const completed = new Set<PipelineStep>();
  const activeIndex = stepIndex(active);
  STEPS.forEach((step, index) => {
    if (index < activeIndex) completed.add(step);
  });

  if (session?.imageUrl || session?.prompt) completed.add('image');
  if (session?.effect) completed.add('effect');
  if (session?.script) completed.add('script');
  if (session?.routine) completed.add('routine');
  if (session?.showId) completed.add('show');

  return STEPS.filter((step) => completed.has(step));
};

const viewForStep = (step?: PipelineStep): string => {
  if (step === 'image') return 'Visual Brainstorm';
  if (step === 'effect') return 'Effect Engine';
  if (step === 'script') return 'Patter Engine';
  if (step === 'routine') return 'Live Rehearsal';
  if (step === 'show') return 'Show Planner';
  return 'Project Workspace';
};

const PipelineProgress: React.FC<PipelineProgressProps> = ({ currentStep, compact = false }) => {
  const [session, setSession] = useState<PipelineSession | null>(() => getPipelineSession());
  const [workspaceContext, setWorkspaceContext] = useState<WorkspacePipelineContext | null>(() => readWorkspaceContext());

  useEffect(() => {
    const refresh = () => {
      setSession(getPipelineSession());
      setWorkspaceContext(readWorkspaceContext());
    };
    window.addEventListener('storage', refresh);
    window.addEventListener('maw:pipeline-session-updated', refresh as EventListener);
    window.addEventListener('maw:workspace-context-updated', refresh as EventListener);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('maw:pipeline-session-updated', refresh as EventListener);
      window.removeEventListener('maw:workspace-context-updated', refresh as EventListener);
    };
  }, []);

  const active = currentStep || session?.lastStep || 'image';
  const activeIndex = stepIndex(active);
  const completedSteps = useMemo(() => inferCompletedSteps(session, active), [session, active]);
  const nextAction = NEXT_ACTIONS[active];
  const projectTitle = workspaceContext?.projectTitle || session?.title || 'Creative pipeline';
  const isProjectAware = Boolean(workspaceContext?.projectTitle || workspaceContext?.projectId);
  const linkedAssetCount = workspaceContext?.linkedAssetCount || 0;
  const lastActivity = formatRelativeTime(session?.updatedAt || workspaceContext?.updatedAt || session?.lastStepAt);
  const helper = isProjectAware
    ? `${LABELS[active]} stage • Next: ${viewForStep(nextAction.next)}`
    : session?.sourceType === 'guided_creator'
      ? 'Guided path: Effect → Script → Routine → Show'
      : 'Keep moving: Image → Effect → Script → Routine → Show';

  useEffect(() => {
    if (!isProjectAware && !session) return;
    try {
      localStorage.setItem(PIPELINE_PROJECT_MEMORY_KEY, JSON.stringify({
        projectId: workspaceContext?.projectId || session?.id || null,
        projectTitle,
        currentStep: active,
        completedSteps,
        recommendedNextStep: nextAction.next || null,
        linkedAssetCount,
        lastActivityAt: Date.now(),
        source: workspaceContext?.source || session?.sourceType || 'creative_pipeline',
      }));
    } catch {}
  }, [active, completedSteps, isProjectAware, linkedAssetCount, nextAction.next, projectTitle, session, workspaceContext]);

  return (
    <div className={`rounded-2xl border border-purple-400/20 bg-slate-950/50 ${compact ? 'p-3' : 'p-4'} shadow-lg shadow-purple-950/20`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.2em] text-purple-200/70">Creative Pipeline</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <div className="truncate text-sm font-semibold text-white">{isProjectAware ? `Project: ${projectTitle}` : projectTitle}</div>
            {isProjectAware ? (
              <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-100">Project-aware</span>
            ) : null}
          </div>
          {!compact ? (
            <div className="mt-2 grid gap-2 text-xs text-slate-400 sm:grid-cols-3">
              <div><span className="text-slate-500">Current:</span> <span className="font-semibold text-purple-100">{LABELS[active]}</span></div>
              <div><span className="text-slate-500">Assets:</span> <span className="font-semibold text-slate-200">{linkedAssetCount ? `${linkedAssetCount} linked` : 'Not linked yet'}</span></div>
              <div><span className="text-slate-500">Last activity:</span> <span className="font-semibold text-slate-200">{lastActivity}</span></div>
            </div>
          ) : null}
        </div>
        <div className="text-xs text-slate-400 lg:text-right">{helper}</div>
      </div>

      <div className="mt-3 grid grid-cols-5 gap-2">
        {STEPS.map((step, index) => {
          const done = completedSteps.includes(step) && index < activeIndex;
          const completedCurrent = completedSteps.includes(step) && index === activeIndex;
          const isActive = index === activeIndex;
          return (
            <div key={step} className="flex flex-col items-center gap-1">
              <div className={`h-2 w-full rounded-full ${done || completedCurrent ? 'bg-emerald-400' : isActive ? 'bg-purple-400' : 'bg-slate-700'}`} />
              <div className={`text-[11px] font-semibold ${done || completedCurrent ? 'text-emerald-200' : isActive ? 'text-purple-100' : 'text-slate-500'}`}>{done || completedCurrent ? '✓ ' : ''}{LABELS[step]}</div>
            </div>
          );
        })}
      </div>

      {!compact ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-xl border border-slate-800 bg-slate-900/55 p-3">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Stage Description</div>
            <p className="mt-1 text-sm leading-6 text-slate-300">{STAGE_DESCRIPTIONS[active]}</p>
          </div>
          <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-3">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-200/80">Recommended Next Action</div>
            <p className="mt-1 text-sm font-bold text-white">{nextAction.label}</p>
            <p className="mt-1 text-xs leading-5 text-slate-300">{nextAction.detail}</p>
          </div>
        </div>
      ) : null}

      {!compact && workspaceContext?.imageUrl ? (
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/40 p-2">
          <img src={workspaceContext.imageUrl} alt="Current project seed" className="h-12 w-16 rounded-lg object-cover" />
          <div className="min-w-0 text-xs text-slate-400">
            <div className="font-bold text-slate-200">Linked seed image available</div>
            <div className="truncate">This project has a visual anchor available for downstream tools.</div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default PipelineProgress;
