import React from 'react';
import { logEvent } from '../services/analyticsService';
import type { SavedIdea } from '../types';

interface ResumePanelProps {
  idea: SavedIdea;
  title: string;
  onOpen: (idea: SavedIdea) => void;
  onDismiss: () => void;
}

const ResumePanel: React.FC<ResumePanelProps> = ({ idea, title, onOpen, onDismiss }) => {
  React.useEffect(() => {
    void logEvent('resume_panel_viewed', {
      idea_id: idea?.id ?? null,
      idea_type: idea?.type ?? null,
      title: title || idea?.title || null,
      source: 'saved_ideas',
    });
  }, [idea?.id]);

  const trackResumeClick = (action: string) => {
    void logEvent(action === 'resume' ? 'resume_clicked' : 'resume_dismissed', {
      idea_id: idea?.id ?? null,
      idea_type: idea?.type ?? null,
      title: title || idea?.title || null,
      source: 'saved_ideas',
    });
  };

  return (
    <section className="mb-5 rounded-2xl border border-blue-400/20 bg-blue-500/10 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="text-xs font-bold uppercase tracking-[0.22em] text-blue-200/75">Continue where you left off</div>
          <h3 className="mt-1 truncate text-lg font-bold text-blue-100">{title || 'Saved Idea'}</h3>
          <p className="mt-1 text-sm text-slate-300">Resume your latest saved idea and keep building the routine.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => { trackResumeClick('resume'); onOpen(idea); }}
            className="rounded-xl bg-blue-500/20 px-4 py-2 text-sm font-bold text-blue-50 transition hover:bg-blue-500/30"
          >
            Resume
          </button>
          <button
            type="button"
            onClick={() => { trackResumeClick('dismiss'); onDismiss(); }}
            className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white"
          >
            Dismiss
          </button>
        </div>
      </div>
    </section>
  );
};

export default ResumePanel;
