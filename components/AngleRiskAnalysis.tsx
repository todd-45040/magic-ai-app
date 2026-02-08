import React, { useMemo, useState } from 'react';
import type { User } from '../types';
import { generateResponse } from '../services/geminiService';
import { saveIdea } from '../services/ideasService';
import { ShieldIcon, SaveIcon } from './icons';
import FormattedText from './FormattedText';
import { useToast } from './ToastProvider';

type AudienceSetup = 'Seated (front)' | 'Standing (close-up)' | 'Surrounded / 360°' | 'Stage (wide)';
type PerformanceMode = 'Close-up' | 'Parlor' | 'Stage' | 'Walkaround';

const DEFAULT_KEY_MOMENTS = [
  'Load',
  'Ditch',
  'Secret action',
  'Reset',
  'Volunteer management',
] as const;

const FOCUS_CHIPS = [
  'Sightlines & angles',
  'Reset risks',
  'Handling tells',
  'Blocking & body position',
  'Timing of secret actions',
] as const;

export default function AngleRiskAnalysis({ user, onIdeaSaved }: { user: User; onIdeaSaved?: () => void }) {
  const toast = useToast();

  const [routineName, setRoutineName] = useState('');
  const [mode, setMode] = useState<PerformanceMode>('Close-up');
  const [setup, setSetup] = useState<AudienceSetup>('Seated (front)');
  const [propsText, setPropsText] = useState('');
  const [keyMoments, setKeyMoments] = useState<string[]>([]);
  const [focusText, setFocusText] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [analysis, setAnalysis] = useState<string>('');

  const canAnalyze = routineName.trim().length > 0;

  const normalizedTags = useMemo(() => {
    const tags = new Set<string>();
    tags.add('angle-risk');
    tags.add('analysis');
    if (mode) tags.add(mode.toLowerCase());
    if (setup.toLowerCase().includes('360')) tags.add('surrounded');
    if (focusText.toLowerCase().includes('reset')) tags.add('reset');
    if (focusText.toLowerCase().includes('angle') || focusText.toLowerCase().includes('sight')) tags.add('angles');
    if (focusText.toLowerCase().includes('timing')) tags.add('timing');
    return Array.from(tags).slice(0, 10);
  }, [focusText, mode, setup]);

  const toggleKeyMoment = (m: string) => {
    setKeyMoments(prev => (prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]));
  };

  const appendFocusChip = (t: string) => {
    setFocusText(prev => {
      const trimmed = prev.trim();
      if (!trimmed) return t;
      if (trimmed.toLowerCase().includes(t.toLowerCase())) return prev;
      return `${trimmed}\n${t}`;
    });
  };

  const handleAnalyze = async () => {
    if (!canAnalyze || isLoading) return;
    setIsLoading(true);
    setAnalysis('');

    const prompt = [
      `You are an expert stagecraft and rehearsal coach for magicians.`,
      `Task: Provide an Angle/Risk Analysis for the routine named: "${routineName.trim()}".`,
      `Context: Performance mode = ${mode}. Audience setup = ${setup}.`,
      propsText.trim() ? `Props/Setup Notes: ${propsText.trim()}` : null,
      keyMoments.length ? `Key moments to protect: ${keyMoments.join(', ')}.` : null,
      focusText.trim() ? `User focus requests: ${focusText.trim()}` : null,
      '',
      `Rules (important):`,
      `- Do NOT expose methods, secret gimmicks, sleights, or step-by-step instructions.`,
      `- Give performance-safe guidance: blocking, sightlines, timing, misdirection, handling tells, reset and pocket management.`,
      `- If something depends on method details you cannot know, say what to watch for in general (non-exposure).`,
      '',
      `Output format (use headings):`,
      `1) Overview (1 short paragraph)`,
      `2) Sightline & Angle Risks (bullets)`,
      `3) Reset & Pocket/Prop Management Risks (bullets)`,
      `4) Handling/Body-Language Tells (bullets)`,
      `5) Mitigations (3–7 actionable steps, written as checklist items)`,
    ].filter(Boolean).join('\n');

    try {
      const text = await generateResponse(prompt, user);
      setAnalysis(text);
    } catch (e: any) {
      console.error(e);
      toast.showToast('Angle/Risk analysis failed. Please try again.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveIdea = async () => {
    if (!analysis.trim()) return;
    try {
      await saveIdea({
        type: 'text',
        title: `Angle/Risk: ${routineName.trim() || 'Routine'}`,
        content: `Routine: ${routineName}\nMode: ${mode}\nAudience: ${setup}\n\nFocus:\n${focusText || '(none)'}\n\n---\n\n${analysis}`,
        tags: normalizedTags,
      } as any);
      toast.showToast('Saved to My Ideas', 'success');
      onIdeaSaved?.();
    } catch (e) {
      console.error(e);
      toast.showToast('Could not save idea.', 'error');
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 p-6">
      {/* Left: Inputs */}
      <div className="w-full lg:w-[420px]">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-purple-400/20 bg-purple-500/15 text-purple-200">
              <ShieldIcon className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Angle/Risk Analysis</h2>
              <p className="mt-1 text-sm text-white/65">Spot sightline issues, reset risks, and performance vulnerabilities.</p>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-white/80 mb-1">Routine name</label>
              <input
                value={routineName}
                onChange={(e) => setRoutineName(e.target.value)}
                placeholder="e.g., Zombie Ball (floating sphere)"
                className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/40"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">Performance mode</label>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as PerformanceMode)}
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40"
                >
                  {(['Close-up', 'Parlor', 'Stage', 'Walkaround'] as const).map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">Audience setup</label>
                <select
                  value={setup}
                  onChange={(e) => setSetup(e.target.value as AudienceSetup)}
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40"
                >
                  {(['Seated (front)', 'Standing (close-up)', 'Surrounded / 360°', 'Stage (wide)'] as const).map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">Key moments to protect</label>
              <div className="flex flex-wrap gap-2">
                {DEFAULT_KEY_MOMENTS.map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => toggleKeyMoment(m)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${keyMoments.includes(m)
                      ? 'border-purple-400/40 bg-purple-500/20 text-purple-100'
                      : 'border-white/10 bg-white/[0.02] text-white/70 hover:bg-white/[0.05]'}
                    `}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-white/80 mb-1">Props / constraints (optional)</label>
              <textarea
                value={propsText}
                onChange={(e) => setPropsText(e.target.value)}
                rows={3}
                placeholder="e.g., table height is low; black backdrop; foulard cloth; limited pocket space"
                className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/40"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white/80 mb-1">Focus (optional)</label>
              <textarea
                value={focusText}
                onChange={(e) => setFocusText(e.target.value)}
                rows={3}
                placeholder="e.g., angles during steals, reset risk between tables, posture tells during secret actions"
                className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/40"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {FOCUS_CHIPS.map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => appendFocusChip(t)}
                    className="rounded-full border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.05]"
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleAnalyze}
              disabled={!canAnalyze || isLoading}
              className="mt-1 w-full rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Analyzing…' : 'Run Angle/Risk Analysis'}
            </button>
          </div>
        </div>
      </div>

      {/* Right: Output */}
      <div className="flex-1">
        <div className="h-full min-h-[520px] rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          {!analysis && !isLoading && (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.02] text-white/70">
                <ShieldIcon className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-white">Ready when you are</h3>
              <p className="mt-1 max-w-md text-sm text-white/60">Fill in the routine details and click <span className="text-white/75">Run Angle/Risk Analysis</span>. Your feedback will appear here.</p>

              <div className="mt-6 grid w-full max-w-2xl grid-cols-1 gap-3 md:grid-cols-2">
                {['Posture', 'Blocking', 'Timing', 'Angles'].map((t) => (
                  <div key={t} className="rounded-xl border border-white/10 bg-black/10 p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-white">{t}</p>
                      <div className="h-2 w-16 rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full w-1/2 bg-white/20 animate-pulse" />
                      </div>
                    </div>
                    <div className="mt-3 space-y-2">
                      <div className="h-2 rounded bg-white/10 animate-pulse" />
                      <div className="h-2 w-5/6 rounded bg-white/10 animate-pulse" />
                      <div className="h-2 w-2/3 rounded bg-white/10 animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isLoading && (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-4" />
              <div className="text-white/80 font-semibold">Analyzing angle and risk…</div>
              <div className="mt-2 text-sm text-white/55">Looking for sightlines, reset pressure points, and tells.</div>
            </div>
          )}

          {!!analysis && !isLoading && (
            <div className="flex h-full flex-col">
              <div className="flex-1 overflow-auto pr-1">
                <FormattedText text={analysis} />
              </div>
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  onClick={handleSaveIdea}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-white/80 hover:bg-white/[0.07]"
                >
                  <SaveIcon className="h-4 w-4" />
                  Save Idea
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
