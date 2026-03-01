import React, { useMemo, useState } from 'react';
import { useAppDispatch, useAppState, refreshShows, refreshIdeas } from '../store';
import * as showsService from '../services/showsService';
import * as ideasService from '../services/ideasService';

type Energy = 'Low' | 'Medium' | 'High';
type Participation = 'Low' | 'Medium' | 'High';

function slugLineToTaskTitle(line: string): string {
  const cleaned = line
    .replace(/^[-*•\u2022\u25CF\u25E6\u2043\u2219]+\s*/, '')
    .replace(/^\d+[\).\-:]\s*/, '')
    .trim();
  return cleaned || 'New beat';
}

function splitIntoTasks(text: string): string[] {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const bullets = lines.filter((l) => /^([-*•\u2022\u25CF\u25E6\u2043\u2219]|\d+[\).\-:])\s+/.test(l));
  if (bullets.length >= 2) return bullets.map(slugLineToTaskTitle).slice(0, 25);
  return [];
}

export const CohesionActions: React.FC<{
  content: string;
  defaultTitle: string;
  defaultTags?: string[];
  ideaType?: 'text' | 'image' | 'rehearsal';
  compact?: boolean;
}> = ({ content, defaultTitle, defaultTags = [], ideaType = 'text', compact = false }) => {
  const { shows } = useAppState();
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<'idle' | 'saving' | 'task' | 'converting'>('idle');
  const [error, setError] = useState<string | null>(null);

  const [showId, setShowId] = useState<string>('');
  const [createNewShowTitle, setCreateNewShowTitle] = useState('');
  const [taskTitle, setTaskTitle] = useState(defaultTitle);
  const [tagText, setTagText] = useState(defaultTags.join(', '));
  const [tagWithShow, setTagWithShow] = useState(true);
  const [durationMinutes, setDurationMinutes] = useState<number | ''>('');
  const [resetMinutes, setResetMinutes] = useState<number | ''>('');
  const [energyLevel, setEnergyLevel] = useState<Energy>('Medium');
  const [participationLevel, setParticipationLevel] = useState<Participation>('Medium');

  const showsSorted = useMemo(() => {
    const arr = Array.isArray(shows) ? [...shows] : [];
    return arr.sort((a: any, b: any) => (b?.updatedAt ?? 0) - (a?.updatedAt ?? 0));
  }, [shows]);

  const selectedShow = useMemo(() => {
    if (!showId) return null;
    return showsSorted.find((s: any) => String(s?.id) === String(showId)) ?? null;
  }, [showId, showsSorted]);

  const computeTags = (): string[] => {
    const base = tagText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const showTag = tagWithShow && selectedShow?.title ? [selectedShow.title] : [];
    return Array.from(new Set([...(defaultTags ?? []), ...base, ...showTag]));
  };

  const ensureShow = async (): Promise<string> => {
    if (createNewShowTitle.trim()) {
      const created = await showsService.createShow(createNewShowTitle.trim(), null, null);
      await refreshShows(dispatch);
      return String(created.id);
    }
    if (!showId) throw new Error('Please select a show (or create a new one).');
    return String(showId);
  };

  const onOpen = () => {
    setError(null);
    const firstId = showsSorted?.[0]?.id ? String(showsSorted[0].id) : '';
    setShowId((prev) => prev || firstId);
    setTaskTitle(defaultTitle);
    setCreateNewShowTitle('');
    setOpen(true);
  };

  const saveAsIdea = async () => {
    setError(null);
    setBusy('saving');
    try {
      const tags = computeTags();
      await ideasService.saveIdea({ type: ideaType as any, title: defaultTitle, content, tags });
      await refreshIdeas(dispatch);
      setOpen(false);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to save idea.');
    } finally {
      setBusy('idle');
    }
  };

  const saveAsTask = async () => {
    setError(null);
    setBusy('task');
    try {
      const sid = await ensureShow();
      const tags = computeTags();
      await showsService.addTaskToShow(sid, {
        title: taskTitle.trim() || defaultTitle,
        notes: String(content ?? ''),
        priority: 'Medium',
        status: 'To-Do',
        createdAt: Date.now(),
        tags,
        durationMinutes: durationMinutes === '' ? undefined : Number(durationMinutes),
        resetMinutes: resetMinutes === '' ? undefined : Number(resetMinutes),
        energyLevel,
        participationLevel,
      } as any);
      await refreshShows(dispatch);
      setOpen(false);
      try {
        localStorage.setItem(
          'maw_showplanner_focus',
          JSON.stringify({ showId: String(sid), taskTitle: String(taskTitle.trim() || defaultTitle), ts: Date.now() })
        );
      } catch {}
    } catch (e: any) {
      setError(e?.message ?? 'Failed to add task to show.');
    } finally {
      setBusy('idle');
    }
  };

  const convertToTasks = async () => {
    setError(null);
    setBusy('converting');
    try {
      const sid = await ensureShow();
      const tags = computeTags();
      const list = splitIntoTasks(content);
      const tasks = (list.length ? list : [taskTitle.trim() || defaultTitle])
        .slice(0, 25)
        .map((t) => ({
          title: t,
          notes: list.length ? undefined : String(content ?? ''),
          priority: 'Medium',
          status: 'To-Do',
          createdAt: Date.now(),
          tags,
        }));
      await showsService.addTasksToShow(sid, tasks as any);
      await refreshShows(dispatch);
      setOpen(false);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to convert to tasks.');
    } finally {
      setBusy('idle');
    }
  };

  const btnBase =
    'px-3 py-2 rounded-md text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed';

  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        disabled={!content}
        className={`${btnBase} ${compact ? 'bg-slate-800 hover:bg-slate-700 text-slate-200' : 'bg-slate-800 hover:bg-slate-700 text-slate-200'}`}
      >
        Save / Add to Show
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="maw-card w-full max-w-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-white">No dead ends — save this output</h3>
                <p className="text-sm text-slate-300 mt-1">
                  Save as an Idea, add it as a Performance Beat, or convert it into tasks.
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-slate-300 hover:text-white px-2 py-1"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="maw-card-flat">
                <div className="text-sm font-semibold text-slate-200 mb-2">Choose a Show</div>

                <label className="block text-xs text-slate-400 mb-1">Existing show</label>
                <select
                  value={showId}
                  onChange={(e) => setShowId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-md text-white"
                >
                  <option value="">Select…</option>
                  {showsSorted.map((s: any) => (
                    <option key={String(s.id)} value={String(s.id)}>
                      {s.title}
                    </option>
                  ))}
                </select>

                <div className="mt-3">
                  <label className="block text-xs text-slate-400 mb-1">Or create new show</label>
                  <input
                    value={createNewShowTitle}
                    onChange={(e) => setCreateNewShowTitle(e.target.value)}
                    placeholder="e.g., ADMC Close-Up Set"
                    className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-md text-white"
                  />
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <input
                    id="tagWithShow"
                    type="checkbox"
                    checked={tagWithShow}
                    onChange={(e) => setTagWithShow(e.target.checked)}
                  />
                  <label htmlFor="tagWithShow" className="text-sm text-slate-300">
                    Tag with show name
                  </label>
                </div>

                <div className="mt-3">
                  <label className="block text-xs text-slate-400 mb-1">Tags (comma-separated)</label>
                  <input
                    value={tagText}
                    onChange={(e) => setTagText(e.target.value)}
                    placeholder="e.g., opener, comedy, close-up"
                    className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-md text-white"
                  />
                </div>
              </div>

              <div className="maw-card-flat">
                <div className="text-sm font-semibold text-slate-200 mb-2">Task settings (optional)</div>
                <label className="block text-xs text-slate-400 mb-1">Task title</label>
                <input
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-md text-white"
                />

                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Duration (min)</label>
                    <input
                      type="number"
                      min={0}
                      value={durationMinutes}
                      onChange={(e) => setDurationMinutes(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-md text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Reset (min)</label>
                    <input
                      type="number"
                      min={0}
                      value={resetMinutes}
                      onChange={(e) => setResetMinutes(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-md text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Energy</label>
                    <select
                      value={energyLevel}
                      onChange={(e) => setEnergyLevel(e.target.value as Energy)}
                      className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-md text-white"
                    >
                      <option>Low</option>
                      <option>Medium</option>
                      <option>High</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Participation</label>
                    <select
                      value={participationLevel}
                      onChange={(e) => setParticipationLevel(e.target.value as Participation)}
                      className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-md text-white"
                    >
                      <option>Low</option>
                      <option>Medium</option>
                      <option>High</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {error && <div className="mt-3 text-sm text-red-300">{error}</div>}

            <div className="mt-4 flex flex-wrap gap-2 justify-end">
              <button
                onClick={saveAsIdea}
                disabled={busy !== 'idle'}
                className={`${btnBase} bg-slate-800 hover:bg-slate-700 text-white`}
              >
                {busy === 'saving' ? 'Saving…' : 'Save as Idea'}
              </button>
              <button
                onClick={saveAsTask}
                disabled={busy !== 'idle'}
                className={`${btnBase} bg-purple-600 hover:bg-purple-700 text-white`}
              >
                {busy === 'task' ? 'Adding…' : 'Save to Show (1 beat)'}
              </button>
              <button
                onClick={convertToTasks}
                disabled={busy !== 'idle'}
                className={`${btnBase} bg-slate-700 hover:bg-slate-600 text-white`}
              >
                {busy === 'converting' ? 'Converting…' : 'Convert to Tasks'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
