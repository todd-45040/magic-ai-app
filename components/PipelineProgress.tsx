import React, { useEffect, useState } from 'react';
import { getPipelineSession, type PipelineSession, type PipelineStep } from '../services/pipelineSessionService';

const STEPS: PipelineStep[] = ['image', 'effect', 'script', 'routine', 'show'];
const LABELS: Record<PipelineStep, string> = {
  image: 'Image',
  effect: 'Effect',
  script: 'Script',
  routine: 'Routine',
  show: 'Show',
};

interface PipelineProgressProps {
  currentStep?: PipelineStep;
  compact?: boolean;
}

const PipelineProgress: React.FC<PipelineProgressProps> = ({ currentStep, compact = false }) => {
  const [session, setSession] = useState<PipelineSession | null>(() => getPipelineSession());

  useEffect(() => {
    const refresh = () => setSession(getPipelineSession());
    window.addEventListener('storage', refresh);
    window.addEventListener('maw:pipeline-session-updated', refresh as EventListener);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('maw:pipeline-session-updated', refresh as EventListener);
    };
  }, []);

  const active = currentStep || session?.lastStep || 'image';
  const activeIndex = STEPS.indexOf(active);
  const title = session?.title || 'Creative pipeline';

  return (
    <div className={`rounded-2xl border border-purple-400/20 bg-slate-950/50 ${compact ? 'p-3' : 'p-4'} shadow-lg shadow-purple-950/20`}>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-purple-200/70">Creative Pipeline</div>
          <div className="text-sm font-semibold text-white">{title}</div>
        </div>
        <div className="text-xs text-slate-400">Keep moving: Image → Effect → Script → Routine → Show</div>
      </div>
      <div className="mt-3 grid grid-cols-5 gap-2">
        {STEPS.map((step, index) => {
          const done = index < activeIndex;
          const isActive = index === activeIndex;
          return (
            <div key={step} className="flex flex-col items-center gap-1">
              <div className={`h-2 w-full rounded-full ${done ? 'bg-emerald-400' : isActive ? 'bg-purple-400' : 'bg-slate-700'}`} />
              <div className={`text-[11px] font-semibold ${done ? 'text-emerald-200' : isActive ? 'text-purple-100' : 'text-slate-500'}`}>{LABELS[step]}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PipelineProgress;
