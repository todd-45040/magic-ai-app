import React, { useEffect, useState } from 'react';
import type { MagicianView } from '../types';

const WORKSPACE_SELECTION_KEY = 'maw_project_workspace_selected_v1';
const WORKSPACE_HANDOFF_KEY = 'maw_project_continuity_handoff_v1';

type WorkspaceCrumb = {
  projectId?: string;
  projectTitle?: string;
  source?: string;
  targetView?: MagicianView;
  updatedAt?: number;
};

function readWorkspaceCrumb(): WorkspaceCrumb | null {
  if (typeof window === 'undefined') return null;
  try {
    const handoff = JSON.parse(localStorage.getItem(WORKSPACE_HANDOFF_KEY) || '{}');
    const selected = JSON.parse(localStorage.getItem(WORKSPACE_SELECTION_KEY) || '{}');
    const projectTitle = String(handoff.projectTitle || handoff.title || selected.projectTitle || '').trim();
    const projectId = String(handoff.projectId || handoff.project?.projectId || selected.projectId || '').trim();
    if (!projectTitle && !projectId) return null;
    return {
      projectId,
      projectTitle: projectTitle || 'Current Project',
      source: String(handoff.source || 'project_workspace'),
      targetView: handoff.targetView,
      updatedAt: Number(selected.updatedAt || Date.now()),
    };
  } catch {
    return null;
  }
}

interface WorkspaceBreadcrumbsProps {
  currentToolLabel: string;
  className?: string;
}

const WorkspaceBreadcrumbs: React.FC<WorkspaceBreadcrumbsProps> = ({ currentToolLabel, className = '' }) => {
  const [crumb, setCrumb] = useState<WorkspaceCrumb | null>(() => readWorkspaceCrumb());

  useEffect(() => {
    const refresh = () => setCrumb(readWorkspaceCrumb());
    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener('maw:workspace-context-updated', refresh as EventListener);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('maw:workspace-context-updated', refresh as EventListener);
    };
  }, []);

  if (!crumb) return null;

  const openWorkspace = () => {
    try {
      localStorage.setItem(WORKSPACE_SELECTION_KEY, JSON.stringify({
        projectId: crumb.projectId,
        projectTitle: crumb.projectTitle,
        updatedAt: Date.now(),
      }));
    } catch {}
    window.dispatchEvent(new CustomEvent('maw:navigate', { detail: { view: 'project-workspace', source: 'workspace_breadcrumb', projectId: crumb.projectId } }));
  };

  return (
    <div className={`mb-4 rounded-2xl border border-purple-400/25 bg-purple-500/10 px-4 py-3 text-sm text-purple-50 ${className}`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-purple-200/80">Project Workspace</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <button type="button" onClick={openWorkspace} className="font-bold text-white underline decoration-purple-300/40 underline-offset-4 hover:text-purple-100">
              {crumb.projectTitle || 'Current Project'}
            </button>
            <span className="text-purple-200/60">/</span>
            <span className="text-purple-100">{currentToolLabel}</span>
          </div>
        </div>
        <button type="button" onClick={openWorkspace} className="rounded-xl border border-purple-300/30 bg-slate-950/30 px-3 py-1.5 text-xs font-bold text-purple-50 hover:bg-purple-500/20">
          Back to Workspace
        </button>
      </div>
    </div>
  );
};

export default WorkspaceBreadcrumbs;
