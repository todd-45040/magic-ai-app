import React, { useMemo, useState } from 'react';
import type { MagicianView, SavedIdea, CreativeProjectLink } from '../types';
import { getCreativeProjectFromIdea, getProjectDisplayLabel } from '../services/creativeProjectContinuity';

type WorkspaceAsset = {
  idea: SavedIdea;
  title: string;
  summary: string;
  tool: string;
  stage: string;
  imageUrl?: string;
};

type WorkspaceGroup = {
  id: string;
  label: string;
  project: CreativeProjectLink | null;
  items: SavedIdea[];
  assets: WorkspaceAsset[];
  tools: string[];
  stages: string[];
  lastUpdatedAt: number;
};

interface ProjectWorkspaceProps {
  ideas: SavedIdea[];
  onNavigate: (view: MagicianView) => void;
}

const WORKSPACE_SELECTION_KEY = 'maw_project_workspace_selected_v1';

function safeParse(value: string): any | null {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function textFromUnknown(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(textFromUnknown).filter(Boolean).join(' ');
  if (value && typeof value === 'object') {
    const raw = value as Record<string, unknown>;
    return textFromUnknown(raw.display || raw.summary || raw.description || raw.body || raw.text || raw.content || raw.result || '');
  }
  return '';
}

function getIdeaTitle(idea: SavedIdea): string {
  const parsed = safeParse(idea.content || '');
  const title = textFromUnknown(parsed?.title || parsed?.display?.title || parsed?.structured?.title || parsed?.meta?.title || idea.title || '');
  return title.trim() || idea.title || 'Untitled asset';
}

function getIdeaSummary(idea: SavedIdea): string {
  const parsed = safeParse(idea.content || '');
  const summary = textFromUnknown(
    parsed?.summary ||
    parsed?.display?.summary ||
    parsed?.display?.body ||
    parsed?.structured?.summary ||
    parsed?.meta?.prompt ||
    parsed?.prompt ||
    parsed?.body ||
    parsed?.text ||
    parsed?.content ||
    idea.content
  );
  return summary.replace(/\s+/g, ' ').trim().slice(0, 220) || 'Saved project asset.';
}

function getToolName(idea: SavedIdea): string {
  const parsed = safeParse(idea.content || '');
  return String(parsed?.tool || parsed?.source || parsed?.meta?.tool || parsed?.structured?.tool || idea.project?.originTool || idea.category || 'Saved Ideas')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function getImageUrl(idea: SavedIdea): string | undefined {
  if (idea.type !== 'image') return undefined;
  const parsed = safeParse(idea.content || '');
  const candidates = [
    parsed?.imageUrl,
    parsed?.image_url,
    parsed?.url,
    parsed?.display?.imageUrl,
    parsed?.structured?.imageUrl,
    parsed?.meta?.imageUrl,
    parsed?.raw?.imageUrl,
    idea.content,
  ];
  const found = candidates.find((candidate) => typeof candidate === 'string' && /^(data:image|https?:\/\/|blob:)/.test(candidate));
  return found ? String(found) : undefined;
}

function getProjectKey(project: CreativeProjectLink | null, idea: SavedIdea): string | null {
  if (project?.projectId) return project.projectId;
  if (project?.projectTitle) return `project-${project.projectTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return null;
}

function buildGroups(ideas: SavedIdea[]): WorkspaceGroup[] {
  const map = new Map<string, WorkspaceGroup>();

  ideas.forEach((idea) => {
    const project = idea.project || getCreativeProjectFromIdea(idea);
    const key = getProjectKey(project, idea);
    if (!key) return;

    const label = getProjectDisplayLabel(project).replace(/ • .*$/, '') || project?.projectTitle || getIdeaTitle(idea);
    const asset: WorkspaceAsset = {
      idea,
      title: getIdeaTitle(idea),
      summary: getIdeaSummary(idea),
      tool: getToolName(idea),
      stage: project?.projectStage || (idea.category === 'rehearsal' ? 'rehearsal' : idea.category === 'blueprint' ? 'development' : 'concept'),
      imageUrl: getImageUrl(idea),
    };

    const existing = map.get(key);
    if (existing) {
      existing.items.push(idea);
      existing.assets.push(asset);
      existing.lastUpdatedAt = Math.max(existing.lastUpdatedAt, idea.timestamp || 0, project?.lastUpdatedAt || 0);
      if (!existing.tools.includes(asset.tool)) existing.tools.push(asset.tool);
      if (!existing.stages.includes(asset.stage)) existing.stages.push(asset.stage);
      return;
    }

    map.set(key, {
      id: key,
      label,
      project,
      items: [idea],
      assets: [asset],
      tools: [asset.tool],
      stages: [asset.stage],
      lastUpdatedAt: Math.max(idea.timestamp || 0, project?.lastUpdatedAt || 0, project?.createdAt || 0),
    });
  });

  return Array.from(map.values())
    .map((group) => ({ ...group, assets: group.assets.sort((a, b) => (b.idea.timestamp || 0) - (a.idea.timestamp || 0)) }))
    .sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt);
}

function stageState(group: WorkspaceGroup, stage: string): 'done' | 'current' | 'todo' {
  const lowerStages = group.stages.map((item) => item.toLowerCase());
  const has = lowerStages.includes(stage);
  if (has) return 'done';
  if (stage === 'development' && (lowerStages.includes('concept') || lowerStages.includes('blueprint'))) return 'current';
  if (stage === 'rehearsal' && (lowerStages.includes('development') || lowerStages.includes('blueprint'))) return 'current';
  if (stage === 'performance' && lowerStages.includes('rehearsal')) return 'current';
  return 'todo';
}

function nextViewForGroup(group: WorkspaceGroup): MagicianView {
  const categories = new Set(group.items.map((idea) => idea.category));
  const tools = group.tools.join(' ').toLowerCase();
  if (!categories.has('blueprint') && (categories.has('image') || tools.includes('visual brainstorm'))) return 'illusion-blueprint';
  if (!categories.has('script') && !tools.includes('patter')) return 'patter-engine';
  if (!categories.has('rehearsal')) return 'live-rehearsal';
  return 'show-planner';
}


function viewLabel(view: MagicianView): string {
  const labels: Partial<Record<MagicianView, string>> = {
    'visual-brainstorm': 'Visual Brainstorm',
    'illusion-blueprint': 'Illusion Blueprint',
    'patter-engine': 'Patter Engine',
    'live-rehearsal': 'Live Rehearsal',
    'show-planner': 'Show Planner',
    'effect-generator': 'Effect Engine',
    'saved-ideas': 'Saved Ideas',
    'project-workspace': 'Project Workspace',
  };
  return labels[view] || String(view).replace(/-/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

function currentStageForGroup(group: WorkspaceGroup): string {
  const state = stageLabels.find((stage) => stageState(group, stage.key) === 'current');
  if (state) return state.label;
  const lastDone = [...stageLabels].reverse().find((stage) => stageState(group, stage.key) === 'done');
  return lastDone?.label || 'Collect';
}

function nextStepCopy(group: WorkspaceGroup): { view: MagicianView; title: string; body: string } {
  const view = nextViewForGroup(group);
  if (view === 'illusion-blueprint') {
    return { view, title: 'Build a realistic illusion blueprint', body: 'Turn the strongest visual seed into a practical, physically plausible apparatus plan with matched render continuity.' };
  }
  if (view === 'patter-engine') {
    return { view, title: 'Develop performance patter', body: 'Convert the concept into a usable script, presentation beats, and performance-ready language.' };
  }
  if (view === 'live-rehearsal') {
    return { view, title: 'Rehearse and refine delivery', body: 'Take the script into rehearsal so timing, clarity, confidence, and pacing can improve before show planning.' };
  }
  return { view, title: 'Move into show planning', body: 'Add the developed routine to a show plan with props, tasks, staging notes, and production details.' };
}

function sourceViewForAsset(asset: WorkspaceAsset): MagicianView {
  const raw = `${asset.tool} ${asset.idea.category || ''}`.toLowerCase();
  if (raw.includes('visual') || asset.idea.type === 'image') return 'visual-brainstorm';
  if (raw.includes('blueprint') || asset.idea.category === 'blueprint') return 'illusion-blueprint';
  if (raw.includes('patter') || asset.idea.category === 'script') return 'patter-engine';
  if (raw.includes('rehears') || asset.idea.category === 'rehearsal') return 'live-rehearsal';
  if (raw.includes('effect') || asset.idea.category === 'effect') return 'effect-generator';
  return 'saved-ideas';
}

function formatDate(timestamp: number): string {
  if (!timestamp) return 'Recently';
  try {
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(timestamp));
  } catch {
    return 'Recently';
  }
}

const stageLabels = [
  { key: 'concept', label: 'Brainstorm' },
  { key: 'development', label: 'Develop' },
  { key: 'rehearsal', label: 'Rehearse' },
  { key: 'performance', label: 'Perform' },
];

const ProjectWorkspace: React.FC<ProjectWorkspaceProps> = ({ ideas, onNavigate }) => {
  const groups = useMemo(() => buildGroups(ideas || []), [ideas]);
  const [selectedId, setSelectedId] = useState<string>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(WORKSPACE_SELECTION_KEY) || '{}');
      return String(stored.projectId || stored.id || '');
    } catch {
      return '';
    }
  });

  const selected = groups.find((group) => group.id === selectedId) || groups[0] || null;
  const nextView = selected ? nextViewForGroup(selected) : 'saved-ideas';
  const nextStep = selected ? nextStepCopy(selected) : null;

  const selectGroup = (group: WorkspaceGroup) => {
    setSelectedId(group.id);
    try {
      localStorage.setItem(WORKSPACE_SELECTION_KEY, JSON.stringify({ projectId: group.id, projectTitle: group.label, updatedAt: Date.now() }));
    } catch {}
  };

  const continueProject = (group: WorkspaceGroup, targetView: MagicianView = nextViewForGroup(group)) => {
    const imageAsset = group.assets.find((asset) => asset.imageUrl);
    const projectPayload = {
      projectId: group.project?.projectId || group.id,
      projectTitle: group.project?.projectTitle || group.label,
      projectType: group.project?.projectType || 'creative_project',
      projectStage: group.project?.projectStage || (targetView === 'live-rehearsal' ? 'rehearsal' : targetView === 'show-planner' ? 'performance' : 'development'),
      originTool: 'Project Workspace',
      createdAt: group.project?.createdAt || group.lastUpdatedAt || Date.now(),
      lastUpdatedAt: Date.now(),
      workspaceStage: targetView,
      linkedAssetIds: group.items.map((idea) => idea.id),
      parentProjectId: group.project?.parentProjectId,
    };
    const context = [
      `Creative Project: ${group.label}`,
      `Linked assets: ${group.items.length}`,
      `Known tools: ${group.tools.join(', ')}`,
      '',
      ...group.assets.slice(0, 6).map((asset) => `- ${asset.tool}: ${asset.title} — ${asset.summary}`),
    ].join('\n');

    try {
      localStorage.setItem(WORKSPACE_SELECTION_KEY, JSON.stringify({ projectId: group.id, projectTitle: group.label, updatedAt: Date.now() }));
      localStorage.setItem('maw_project_continuity_handoff_v1', JSON.stringify({
        version: 2,
        source: 'project_workspace',
        targetView,
        projectId: projectPayload.projectId,
        projectTitle: projectPayload.projectTitle,
        project: projectPayload,
        ideaIds: group.items.map((idea) => idea.id),
        imageUrl: imageAsset?.imageUrl || '',
        prompt: context,
        title: group.label,
        created_at: new Date().toISOString(),
      }));

      if (targetView === 'illusion-blueprint') {
        localStorage.setItem('maw_illusion_blueprint_visual_handoff', JSON.stringify({
          version: 2,
          source: 'project_workspace',
          title: group.label,
          imageUrl: imageAsset?.imageUrl || '',
          prompt: [
            'Continue this Project Workspace concept in Illusion Blueprint. Preserve the selected project direction and keep the result physically plausible, buildable, theatrical, and realistic.',
            context,
          ].join('\n\n'),
          project: projectPayload,
          linkedAssetIds: group.items.map((idea) => idea.id),
          created_at: new Date().toISOString(),
        }));
      }

      if (targetView === 'patter-engine') {
        localStorage.setItem('maw_patter_engine_prefill_v1', JSON.stringify({
          version: 2,
          source: 'project_workspace',
          pipelineStage: 'workspace_to_script',
          effectTitle: group.label,
          effectDescription: context,
          selectedTones: ['Professional', 'Storytelling'],
          project: projectPayload,
          ideaIds: group.items.map((idea) => idea.id),
          created_at: new Date().toISOString(),
        }));
      }

      if (targetView === 'show-planner') {
        localStorage.setItem('maw_show_planner_routine_handoff_v1', JSON.stringify({
          version: 2,
          source: 'project_workspace',
          pipelineStage: 'workspace_to_show_planner',
          title: group.label,
          notes: context,
          effectDescription: context,
          upstream: projectPayload,
          created_at: new Date().toISOString(),
        }));
      }
    } catch {}

    try { window.dispatchEvent(new CustomEvent('maw:workspace-context-updated')); } catch {}
    onNavigate(targetView);
  };


  const openAssetSource = (group: WorkspaceGroup, asset: WorkspaceAsset) => {
    const targetView = sourceViewForAsset(asset);
    const projectPayload = {
      projectId: group.project?.projectId || group.id,
      projectTitle: group.project?.projectTitle || group.label,
      projectType: group.project?.projectType || 'creative_project',
      projectStage: group.project?.projectStage || asset.stage || 'development',
      originTool: asset.tool,
      createdAt: group.project?.createdAt || group.lastUpdatedAt || Date.now(),
      lastUpdatedAt: Date.now(),
      workspaceStage: targetView,
      linkedAssetIds: group.items.map((idea) => idea.id),
      parentProjectId: group.project?.parentProjectId,
    };

    try {
      localStorage.setItem(WORKSPACE_SELECTION_KEY, JSON.stringify({ projectId: group.id, projectTitle: group.label, updatedAt: Date.now() }));
      localStorage.setItem('maw_project_continuity_handoff_v1', JSON.stringify({
        version: 2,
        source: 'project_workspace_asset',
        targetView,
        projectId: projectPayload.projectId,
        projectTitle: projectPayload.projectTitle,
        project: projectPayload,
        ideaIds: group.items.map((idea) => idea.id),
        focusedIdeaId: asset.idea.id,
        imageUrl: asset.imageUrl || group.assets.find((item) => item.imageUrl)?.imageUrl || '',
        prompt: `${asset.tool}: ${asset.title}\n\n${asset.summary}`,
        title: group.label,
        created_at: new Date().toISOString(),
      }));
      window.dispatchEvent(new CustomEvent('maw:workspace-context-updated'));
    } catch {}

    onNavigate(targetView);
  };

  if (!selected) {
    return (
      <div className="h-full overflow-y-auto bg-slate-950 p-6 text-slate-100">
        <div className="mx-auto max-w-4xl rounded-3xl border border-slate-800 bg-slate-900/60 p-8 text-center">
          <div className="text-4xl">🧭</div>
          <h1 className="mt-3 text-2xl font-bold">Project Workspace</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">No linked project assets were found yet. Save a Visual Brainstorm, Effect Engine, Blueprint, or rehearsal output with project metadata to begin building a workspace.</p>
          <button onClick={() => onNavigate('saved-ideas')} className="mt-5 rounded-xl bg-purple-600 px-4 py-2 text-sm font-bold text-white hover:bg-purple-500">Open Saved Ideas</button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-950 p-4 text-slate-100 md:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="rounded-3xl border border-purple-400/20 bg-gradient-to-br from-purple-950/40 via-slate-900 to-slate-950 p-5 shadow-2xl shadow-black/20">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-purple-200/80">
                <button onClick={() => onNavigate('dashboard')} className="hover:text-white">Dashboard</button>
                <span>/</span>
                <span>Project Workspace</span>
                <span>/</span>
                <span className="text-emerald-200">{selected.label}</span>
              </div>
              <h1 className="mt-3 text-2xl font-black text-white md:text-3xl">{selected.label}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">A unified workspace for linked brainstorms, selected seed images, blueprint work, scripts, rehearsal notes, and show-planning handoffs.</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-emerald-100">{selected.items.length} linked asset{selected.items.length === 1 ? '' : 's'}</span>
                <span className="rounded-full border border-sky-400/25 bg-sky-500/10 px-3 py-1 text-sky-100">Updated {formatDate(selected.lastUpdatedAt)}</span>
                <span className="rounded-full border border-purple-400/25 bg-purple-500/10 px-3 py-1 text-purple-100">Next: {nextView.replace(/-/g, ' ')}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => continueProject(selected)} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-emerald-950/40 hover:bg-emerald-500">Continue in {viewLabel(nextView)}</button>
              <button onClick={() => continueProject(selected, 'illusion-blueprint')} className="rounded-xl border border-blue-400/30 bg-blue-500/10 px-4 py-2 text-sm font-bold text-blue-100 hover:bg-blue-500/20">Continue in Blueprint</button>
              <button onClick={() => continueProject(selected, 'patter-engine')} className="rounded-xl border border-purple-400/30 bg-purple-500/10 px-4 py-2 text-sm font-bold text-purple-100 hover:bg-purple-500/20">Continue in Patter</button>
              <button onClick={() => onNavigate('saved-ideas')} className="rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-2 text-sm font-bold text-slate-200 hover:border-purple-400/40">Saved Ideas</button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[18rem_1fr]">
          <aside className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/55 p-3">
            <div className="px-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Projects</div>
            {groups.map((group) => (
              <button key={group.id} onClick={() => selectGroup(group)} className={`w-full rounded-xl border p-3 text-left transition ${group.id === selected.id ? 'border-purple-400/40 bg-purple-500/15' : 'border-slate-800 bg-slate-950/45 hover:border-slate-600'}`}>
                <div className="line-clamp-2 text-sm font-bold text-slate-100">{group.label}</div>
                <div className="mt-1 text-xs text-slate-400">{group.items.length} assets • {formatDate(group.lastUpdatedAt)}</div>
              </button>
            ))}
          </aside>

          <main className="space-y-5">
            <section className="rounded-2xl border border-slate-800 bg-slate-900/55 p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-white">Creative Timeline</h2>
                  <p className="text-xs text-slate-400">Shows where this project has been and the next practical stage.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                {stageLabels.map((stage, index) => {
                  const state = stageState(selected, stage.key);
                  return (
                    <div key={stage.key} className={`rounded-2xl border p-4 ${state === 'done' ? 'border-emerald-400/30 bg-emerald-500/10' : state === 'current' ? 'border-purple-400/30 bg-purple-500/10' : 'border-slate-800 bg-slate-950/35'}`}>
                      <div className="flex items-center gap-2">
                        <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-black ${state === 'done' ? 'bg-emerald-500 text-white' : state === 'current' ? 'bg-purple-500 text-white' : 'bg-slate-800 text-slate-400'}`}>{state === 'done' ? '✓' : index + 1}</span>
                        <div className="font-bold text-slate-100">{stage.label}</div>
                      </div>
                      <div className="mt-2 text-xs capitalize text-slate-400">{state === 'todo' ? 'Not started' : state === 'current' ? 'Recommended next' : 'Linked asset found'}</div>
                    </div>
                  );
                })}
              </div>
            </section>


            {nextStep ? (
              <section className="rounded-2xl border border-amber-400/25 bg-gradient-to-br from-amber-500/10 via-slate-900/60 to-slate-950/60 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.16em] text-amber-200/80">Current Stage / Recommended Next Step</div>
                    <h2 className="mt-2 text-lg font-black text-white">{currentStageForGroup(selected)} → {viewLabel(nextStep.view)}</h2>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300"><span className="font-semibold text-amber-100">{nextStep.title}.</span> {nextStep.body}</p>
                    {selected.assets.length === 1 ? (
                      <p className="mt-2 text-xs text-slate-400">This project currently has one linked asset. Continue it into the next tool to build a stronger workspace timeline.</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => continueProject(selected, nextStep.view)} className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-black text-slate-950 hover:bg-amber-400">Continue in {viewLabel(nextStep.view)}</button>
                    <button onClick={() => continueProject(selected, 'live-rehearsal')} className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-bold text-emerald-100 hover:bg-emerald-500/20">Continue in Rehearsal</button>
                    <button onClick={() => continueProject(selected, 'show-planner')} className="rounded-xl border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-sm font-bold text-sky-100 hover:bg-sky-500/20">Continue in Show Planner</button>
                  </div>
                </div>
              </section>
            ) : null}

            <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {selected.assets.length === 1 ? (
                <div className="xl:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/45 p-4 text-sm text-slate-300">
                  <div className="font-bold text-white">Project just started</div>
                  <p className="mt-1 text-slate-400">Only one asset is linked so far. Use the Continue buttons to create the next connected asset and fill out this workspace.</p>
                </div>
              ) : null}
              {selected.assets.map((asset) => (
                <article key={asset.idea.id} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/55 shadow-lg shadow-black/10">
                  {asset.imageUrl && <img src={asset.imageUrl} alt={asset.title} className="h-52 w-full object-cover" />}
                  <div className="p-4">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                      <span className="rounded-full border border-slate-700 bg-slate-950/60 px-2 py-0.5">{asset.tool}</span>
                      <span className="rounded-full border border-purple-400/25 bg-purple-500/10 px-2 py-0.5 text-purple-100">{asset.stage}</span>
                    </div>
                    <h3 className="mt-3 text-base font-bold text-yellow-100">{asset.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-400">{asset.summary}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button onClick={() => openAssetSource(selected, asset)} className="rounded-lg border border-slate-600 bg-slate-950/60 px-3 py-1.5 text-xs font-bold text-slate-100 hover:border-slate-400">Open in {viewLabel(sourceViewForAsset(asset))}</button>
                      <button onClick={() => continueProject(selected, 'illusion-blueprint')} className="rounded-lg border border-blue-400/30 bg-blue-500/10 px-3 py-1.5 text-xs font-bold text-blue-100 hover:bg-blue-500/20">Blueprint</button>
                      <button onClick={() => continueProject(selected, 'patter-engine')} className="rounded-lg border border-purple-400/30 bg-purple-500/10 px-3 py-1.5 text-xs font-bold text-purple-100 hover:bg-purple-500/20">Script</button>
                      <button onClick={() => continueProject(selected, 'show-planner')} className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-100 hover:bg-emerald-500/20">Plan Show</button>
                    </div>
                  </div>
                </article>
              ))}
            </section>
          </main>
        </div>
      </div>
    </div>
  );
};

export default ProjectWorkspace;
