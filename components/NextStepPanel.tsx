import React from 'react';
import { logEvent } from '../services/analyticsService';
import type { AiSparkAction, SavedIdea } from '../types';

interface NextStepPanelProps {
  idea: SavedIdea;
  title: string;
  body: string;
  onAiSpark: (action: AiSparkAction) => void;
  onAddToShow: (idea: SavedIdea) => void;
  onPromoteToRoutine: (idea: SavedIdea) => void;
}

const buildIdeaContext = (title: string, body: string) => {
  const trimmedBody = (body || '').trim();
  return `Routine idea: ${title || 'Saved Idea'}${trimmedBody ? `\n\n${trimmedBody.slice(0, 2400)}` : ''}`;
};

const NextStepPanel: React.FC<NextStepPanelProps> = ({ idea, title, body, onAiSpark, onAddToShow, onPromoteToRoutine }) => {
  const ideaContext = buildIdeaContext(title, body);

  React.useEffect(() => {
    void logEvent('next_step_panel_viewed', {
      idea_id: idea?.id ?? null,
      idea_type: idea?.type ?? null,
      title: title || idea?.title || null,
      source: 'saved_ideas',
    });
  }, [idea?.id]);

  const trackNextStepClick = (action: string) => {
    void logEvent('next_step_clicked', {
      action,
      idea_id: idea?.id ?? null,
      idea_type: idea?.type ?? null,
      title: title || idea?.title || null,
      source: 'saved_ideas',
    });
  };

  const handleNextStepClickCapture = (event: React.MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest<HTMLButtonElement>('[data-next-step-action]');
    const action = button?.dataset.nextStepAction;

    if (!action) return;

    // Capture-phase logging fires before any button action changes views,
    // opens modals, or triggers AI flows. This makes next_step_clicked
    // reliable even when the button immediately starts another workflow.
    trackNextStepClick(action);
  };

  return (
    <section
      onClickCapture={handleNextStepClickCapture}
      className="mb-5 rounded-2xl border border-amber-400/25 bg-gradient-to-br from-amber-500/10 via-purple-500/10 to-slate-950/70 p-4 shadow-[0_18px_42px_rgba(15,23,42,0.28)]"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="text-xs font-bold uppercase tracking-[0.22em] text-amber-200/80">Next step</div>
          <h3 className="mt-1 text-lg font-bold text-yellow-200">You created an effect. Now turn it into a performance.</h3>
          <p className="mt-1 text-sm leading-6 text-slate-300">
            Continue building <span className="font-semibold text-purple-100">{title || 'this saved idea'}</span> while the creative momentum is still fresh.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:min-w-[520px]">
          <button
            type="button"
            data-next-step-action="generate_patter"
            onClick={() => {
              onAiSpark({
              type: 'custom-prompt',
              payload: {
                prompt: `Generate polished performance patter for this magic routine. Include: a strong opening line, audience interaction beats, a concise script, and a closer. Keep it practical and performance-ready.\n\n${ideaContext}`,
              },
            });
            }}
            className="rounded-xl border border-purple-400/25 bg-purple-500/15 px-3 py-3 text-left transition hover:bg-purple-500/25 hover:text-white"
          >
            <div className="text-sm font-bold text-purple-100">🎭 Generate Patter</div>
            <div className="mt-1 text-xs leading-5 text-slate-300">Create a usable script from this idea.</div>
          </button>

          <button
            type="button"
            data-next-step-action="rehearse_this"
            onClick={() => {
              try {
                window.dispatchEvent(new CustomEvent('maw:navigate', { detail: { view: 'live-rehearsal' } }));
              } catch {}
              onAiSpark({
                type: 'custom-prompt',
                payload: {
                  prompt: `Create a short rehearsal plan for this routine. Give me 3 practice passes, what to listen for, and where to pause for audience reaction.\n\n${ideaContext}`,
                },
              });
            }}
            className="rounded-xl border border-blue-400/25 bg-blue-500/10 px-3 py-3 text-left transition hover:bg-blue-500/20 hover:text-white"
          >
            <div className="text-sm font-bold text-blue-100">🎙️ Rehearse This</div>
            <div className="mt-1 text-xs leading-5 text-slate-300">Prepare a practice path before performance.</div>
          </button>

          <button
            type="button"
            data-next-step-action="add_to_show"
            onClick={() => { onAddToShow(idea); }}
            className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-3 text-left transition hover:bg-emerald-500/20 hover:text-white"
          >
            <div className="text-sm font-bold text-emerald-100">📋 Add to Show</div>
            <div className="mt-1 text-xs leading-5 text-slate-300">Place it into an existing show plan.</div>
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 border-t border-white/10 pt-3">
        <button
          type="button"
          data-next-step-action="start_new_routine"
          onClick={() => { onPromoteToRoutine(idea); }}
          className="rounded-full border border-amber-400/25 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-100 transition hover:bg-amber-500/20"
        >
          Start a new routine from this idea
        </button>
      </div>
    </section>
  );
};

export default NextStepPanel;
