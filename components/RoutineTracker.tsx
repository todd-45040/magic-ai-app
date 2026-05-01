import React from 'react';
import type { SavedIdea, Show } from '../types';

interface RoutineTrackerProps {
  ideas: SavedIdea[];
  shows: Show[];
}

const hasScriptSignal = (idea: SavedIdea) => {
  const text = `${idea.title || ''} ${idea.content || ''} ${(idea.tags || []).join(' ')}`.toLowerCase();
  return text.includes('patter') || text.includes('script') || text.includes('opening line') || text.includes('closer');
};

const RoutineTracker: React.FC<RoutineTrackerProps> = ({ ideas, shows }) => {
  const hasEffect = ideas.length > 0;
  const hasPatter = ideas.some(hasScriptSignal);
  const hasRehearsal = ideas.some((idea) => idea.type === 'rehearsal' || (idea.tags || []).some((tag) => tag.toLowerCase().includes('rehearsal')));
  const hasShow = shows.some((show) => (show.tasks || []).length > 0) || ideas.some((idea) => (idea.tags || []).some((tag) => tag.toLowerCase().startsWith('show:')));

  const steps = [
    { label: 'Create an Effect', done: hasEffect },
    { label: 'Generate Patter', done: hasPatter },
    { label: 'Rehearse It', done: hasRehearsal },
    { label: 'Add to a Show', done: hasShow },
  ];
  const complete = steps.filter((step) => step.done).length;

  return (
    <section className="mb-5 rounded-2xl border border-slate-800 bg-slate-900/55 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.22em] text-purple-200/75">Your first routine</div>
          <h3 className="mt-1 text-lg font-bold text-slate-100">Build one saved idea into something performable</h3>
          <p className="mt-1 text-sm text-slate-400">{complete}/4 steps complete. Keep moving one step at a time.</p>
        </div>
        <div className="h-2 w-full rounded-full bg-slate-800 lg:w-56" aria-label={`${complete} of 4 routine steps complete`}>
          <div className="h-2 rounded-full bg-purple-500 transition-all" style={{ width: `${(complete / steps.length) * 100}%` }} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {steps.map((step) => (
          <div key={step.label} className={`rounded-xl border px-3 py-2 ${step.done ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100' : 'border-slate-700 bg-slate-950/35 text-slate-300'}`}>
            <span className="mr-2">{step.done ? '✅' : '⬜'}</span>
            <span className="text-sm font-semibold">{step.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
};

export default RoutineTracker;
