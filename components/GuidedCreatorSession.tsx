import React, { useEffect, useRef } from 'react';
import { FileTextIcon, StageCurtainsIcon, WandIcon } from './icons';
import { logEvent } from '../services/analyticsService';

export type GuidedCreatorPath = 'new-effect' | 'improve-patter' | 'prepare-performance';

type GuidedCreatorPathCard = {
  id: GuidedCreatorPath;
  title: string;
  description: string;
  helperText: string;
  icon: React.ComponentType<{ className?: string }>;
};

export type GuidedCreatorSessionProps = {
  onPathSelect?: (path: GuidedCreatorPath) => void;
  onSkip?: () => void;
};

const guidedCreatorPaths: GuidedCreatorPathCard[] = [
  {
    id: 'new-effect',
    title: 'Create a new effect',
    description: 'Start with a prop, theme, or audience and shape it into a performance-ready idea.',
    helperText: 'Best for creators, hobbyists, and magicians looking for a fresh routine.',
    icon: WandIcon,
  },
  {
    id: 'improve-patter',
    title: 'Improve my patter',
    description: 'Turn rough lines into tighter, clearer, more theatrical audience-facing script work.',
    helperText: 'Best when you already have a trick but want stronger presentation.',
    icon: FileTextIcon,
  },
  {
    id: 'prepare-performance',
    title: 'Prepare a performance',
    description: 'Build momentum around a show, audience, theme, or upcoming booking.',
    helperText: 'Best for performers getting ready for a real event or rehearsal.',
    icon: StageCurtainsIcon,
  },
];

export default function GuidedCreatorSession({ onPathSelect, onSkip }: GuidedCreatorSessionProps) {
  const hasLoggedViewRef = useRef(false);

  useEffect(() => {
    if (hasLoggedViewRef.current) return;
    hasLoggedViewRef.current = true;
    void logEvent('guided_creator_viewed', {
      entry: 'guided_creator_session',
      version: 'phase_1',
    });
  }, []);

  const handlePathSelect = (path: GuidedCreatorPath) => {
    void logEvent('guided_creator_path_selected', {
      path,
      entry: 'guided_creator_session',
      version: 'phase_1',
    });
    onPathSelect?.(path);
  };

  return (
    <main className="relative min-h-[calc(100vh-5rem)] overflow-hidden bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(168,85,247,0.22),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(234,179,8,0.16),transparent_34%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-yellow-300/40 to-transparent" />

      <section className="relative z-10 mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-6xl flex-col justify-center px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.35em] text-yellow-300/80">
            Guided Creator Session
          </p>
          <h1 className="text-4xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl">
            Welcome to Magic AI Wizard.
          </h1>
          <p className="mt-5 text-xl text-slate-200 sm:text-2xl">
            Let’s create something together.
          </p>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-400">
            Choose one starting point. The next step will stay focused, collaborative, and simple.
          </p>
          {onSkip && (
            <button
              type="button"
              onClick={onSkip}
              className="mt-6 text-sm font-medium text-slate-400 underline decoration-slate-600 underline-offset-4 transition-colors hover:text-slate-200 hover:decoration-slate-300"
            >
              Skip to dashboard
            </button>
          )}
        </div>

        <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
          {guidedCreatorPaths.map((path) => {
            const Icon = path.icon;
            return (
              <button
                key={path.id}
                type="button"
                onClick={() => handlePathSelect(path.id)}
                className="group flex h-full flex-col rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-left shadow-2xl shadow-black/20 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-yellow-300/50 hover:bg-white/[0.07] focus:outline-none focus:ring-2 focus:ring-yellow-300/50"
              >
                <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-yellow-300/20 bg-yellow-300/10 text-yellow-200 transition-colors group-hover:border-yellow-300/50 group-hover:bg-yellow-300/20">
                  <Icon className="h-7 w-7" />
                </span>
                <span className="text-xl font-bold text-yellow-100">{path.title}</span>
                <span className="mt-3 text-sm leading-6 text-slate-300">{path.description}</span>
                <span className="mt-5 border-t border-white/10 pt-4 text-xs leading-5 text-slate-500 group-hover:text-slate-400">
                  {path.helperText}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}
