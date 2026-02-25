import React from 'react';
import { useAppState } from '../store';

type Props = {
  className?: string;
};

/**
 * Phase 2 (Activation Optimization)
 * Lightweight progress nudge. Purely client-derived (no backend changes).
 */
export default function ActivationProgress({ className }: Props) {
  const { ideas, shows } = useAppState();

  const hasFirstRoutine = (ideas?.length ?? 0) > 0;
  const hasFirstShow = (shows?.length ?? 0) > 0;
  const hasRehearsal = (ideas ?? []).some((i) => (i as any)?.type === 'rehearsal');

  const Item = ({ done, label }: { done: boolean; label: string }) => (
    <div className="flex items-center gap-2 text-sm">
      <span
        className={
          done
            ? 'inline-flex h-5 w-5 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-500/15 text-emerald-200'
            : 'inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/45'
        }
        aria-hidden
      >
        {done ? '✓' : '•'}
      </span>
      <span className={done ? 'text-white/80' : 'text-white/55'}>{label}</span>
    </div>
  );

  return (
    <div className={className ?? ''}>
      <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/55">Quick wins</p>
        <Item done={hasFirstRoutine} label="Created your first routine" />
        <Item done={hasFirstShow} label="Planned your first show" />
        <Item done={hasRehearsal} label="Ran your first rehearsal" />
      </div>
    </div>
  );
}
