import React, { useMemo, useRef, useState } from 'react';
import type { User } from '../types';
import { ANGLE_RISK_ANALYSIS_SYSTEM_INSTRUCTION } from '../constants';
import { generateResponse } from '../services/geminiService';
import { saveIdea } from '../services/ideasService';
import { createShow, addTaskToShow } from '../services/showsService';
import { EyeIcon, SaveIcon, ShareIcon, ShieldIcon, VideoIcon, WandIcon } from './icons';
import FormattedText from './FormattedText';
import { useToast } from './ToastProvider';

type AudienceSetup = 'Seated (front)' | 'Standing (close-up)' | 'Surrounded / 360°' | 'Stage (wide)';
type PerformanceMode = 'Close-up' | 'Parlor' | 'Stage' | 'Walkaround';
type VenueType = 'Close-up table' | 'Walk-around floor' | 'Parlor room' | 'Theater stage' | 'Street / outdoor';
type LightingType = 'Bright / direct' | 'Mixed / uneven' | 'Dim / low light';
type AudienceDistance = '1–3 ft' | '3–10 ft' | '10+ ft';

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

const DEFAULT_ROUTINE_STEPS = [
  'Introduction / framing',
  'Secret setup or load',
  'Main effect sequence',
  'Reveal / applause cue',
  'Cleanup / reset',
];

type Props = {
  user: User;
  onIdeaSaved?: () => void;
  // Phase 6D: optional CTA hooks (kept optional to avoid breaking other pages)
  onDeepLinkShowPlanner?: (showId: string) => void;
  onNavigate?: (view: string) => void;
  onAiSpark?: (...args: any[]) => void;
};

export default function AngleRiskAnalysis({ user, onIdeaSaved, onDeepLinkShowPlanner, onNavigate, onAiSpark }: Props) {
  const toast = useToast();
  const routineNameRef = useRef<HTMLInputElement | null>(null);
  const focusRef = useRef<HTMLTextAreaElement | null>(null);

  const [routineName, setRoutineName] = useState('');
  const [mode, setMode] = useState<PerformanceMode>('Close-up');
  const [setup, setSetup] = useState<AudienceSetup>('Seated (front)');
  const [propsText, setPropsText] = useState('');
  const [keyMoments, setKeyMoments] = useState<string[]>([]);
  const [focusText, setFocusText] = useState('');
  const [routineSteps, setRoutineSteps] = useState(DEFAULT_ROUTINE_STEPS.join('\n'));
  const [venueType, setVenueType] = useState<VenueType>('Close-up table');
  const [lighting, setLighting] = useState<LightingType>('Bright / direct');
  const [audienceDistance, setAudienceDistance] = useState<AudienceDistance>('1–3 ft');

  const [isLoading, setIsLoading] = useState(false);
  const [analysis, setAnalysis] = useState<string>('');

  const parsedAnalysis = useMemo(() => {
    const raw = (analysis || '').trim();
    if (!raw) return null;

    const sectionEntries = raw
      .split(/\n(?=#{2,6}\s+)/)
      .map(section => section.trim())
      .filter(Boolean);

    const sections = sectionEntries.map(section => {
      const [headingLine, ...bodyLines] = section.split('\n');
      const heading = headingLine.replace(/^#{2,6}\s+/, '').trim();
      const body = bodyLines.join('\n').trim();
      const bulletItems = body
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => line.replace(/^[-*•]\s+/, ''))
        .map(line => line.replace(/^\d+\.\s+/, ''));

      return { heading, body, bulletItems };
    });

    const findSection = (...keywords: string[]) =>
      sections.find(section => {
        const heading = section.heading.toLowerCase();
        return keywords.every(keyword => heading.includes(keyword));
      }) ?? null;

    return {
      sections,
      overview: findSection('overview'),
      sightlines: findSection('sightline') ?? findSection('angle'),
      reset: findSection('reset') ?? findSection('pocket') ?? findSection('prop'),
      handling: findSection('handling') ?? findSection('body-language') ?? findSection('body language'),
      mitigations: findSection('mitigation'),
      questions: findSection('questions', 'refine'),
      critical: findSection('critical', 'exposure'),
      coaching: findSection('professional', 'coaching'),
    };
  }, [analysis]);

  const scoreRisk = (text: string, fallback = 30) => {
    const lower = text.toLowerCase();
    let score = fallback;
    if (/(extreme|highest risk|severe|very high)/.test(lower)) score += 45;
    if (/(high risk|high exposure|significant|critical)/.test(lower)) score += 30;
    if (/(moderate|medium|watch for|caution|careful)/.test(lower)) score += 15;
    if (/(low risk|generally safe|minimal|minor)/.test(lower)) score -= 10;
    return Math.max(10, Math.min(95, score));
  };

  const riskProfile = useMemo(() => {
    if (!analysis.trim()) return null;

    const postureScore = scoreRisk(parsedAnalysis?.handling?.body || analysis, 38);
    const blockingScore = scoreRisk(`${parsedAnalysis?.sightlines?.body || ''}\n${parsedAnalysis?.reset?.body || ''}` || analysis, 42);
    const timingScore = scoreRisk(`${focusText}\n${analysis}`, 35);
    const anglesScore = scoreRisk(parsedAnalysis?.sightlines?.body || analysis, 45);
    const resetScore = scoreRisk(parsedAnalysis?.reset?.body || analysis, 32);

    const metrics = [
      { label: 'Posture', score: postureScore },
      { label: 'Blocking', score: blockingScore },
      { label: 'Timing', score: timingScore },
      { label: 'Angles', score: anglesScore },
      { label: 'Reset', score: resetScore },
    ].map(metric => ({
      ...metric,
      level: metric.score >= 70 ? 'High' : metric.score >= 45 ? 'Medium' : 'Low',
    }));

    const average = Math.round(metrics.reduce((sum, item) => sum + item.score, 0) / metrics.length);
    const overall = average >= 70 ? { label: 'High', dot: '🔴' } : average >= 45 ? { label: 'Medium', dot: '🟡' } : { label: 'Low', dot: '🟢' };

    const topRisks = [...metrics]
      .sort((a, b) => b.score - a.score)
      .slice(0, 2)
      .map(item => item.label);

    return { overall, average, topRisks, metrics };
  }, [analysis, focusText, parsedAnalysis]);

  const criticalExposurePoints = useMemo(() => {
    const sourceItems = [
      ...(parsedAnalysis?.critical?.bulletItems || []),
      ...(parsedAnalysis?.sightlines?.bulletItems || []),
      ...(parsedAnalysis?.reset?.bulletItems || []),
      ...(parsedAnalysis?.handling?.bulletItems || []),
    ];

    return Array.from(new Set(sourceItems)).slice(0, 4);
  }, [parsedAnalysis]);

  const coachingNotes = useMemo(() => {
    const sourceItems = [
      ...(parsedAnalysis?.coaching?.bulletItems || []),
      ...(parsedAnalysis?.mitigations?.bulletItems || []),
    ];
    return Array.from(new Set(sourceItems)).slice(0, 5);
  }, [parsedAnalysis]);

  const canAnalyze = routineName.trim().length > 0;

  // Phase 6B: Improve output scannability without changing AI logic.
  // We decorate key section headings with visual anchors, and render the Mitigations section
  // in a dedicated, actionable checklist container.
  const decoratedOutput = useMemo(() => {
    const raw = analysis || '';
    if (!raw.trim()) return null;

    const decorateHeadings = (txt: string) => {
      const lines = txt.split('\n');
      const out: string[] = [];

      for (const line of lines) {
        const trimmed = line.trim();
        const isHeading = /^#{2,6}\s+/.test(trimmed);
        if (!isHeading) {
          out.push(line);
          continue;
        }

        const lower = trimmed.toLowerCase();

        // Sightlines
        if (lower.includes('sightline')) {
          out.push(trimmed.replace(/^#{2,6}\s+.*/, '### 👁 Sightlines'));
          continue;
        }
        // Reset / pocket / prop management
        if (lower.includes('reset') || lower.includes('pocket') || lower.includes('prop management')) {
          out.push(trimmed.replace(/^#{2,6}\s+.*/, '### 🔁 Reset Risks'));
          continue;
        }
        // Handling/body-language tells
        if (lower.includes('handling') || lower.includes('body-language') || lower.includes('body language') || lower.includes('tells')) {
          out.push(trimmed.replace(/^#{2,6}\s+.*/, '### 🧍 Handling Tells'));
          continue;
        }

        out.push(line);
      }

      return out.join('\n');
    };

    // Extract Mitigations section (if present) so we can render it as a checklist.
    // We look for a heading containing "Mitigations" and split until the next heading.
    const mitigationsHeadingRegex = /^#{2,6}\s+.*mitigations.*$/gim;
    const mitigationsMatch = mitigationsHeadingRegex.exec(raw);

    let mainWithoutMitigations = raw;
    let mitigationsItems: string[] = [];

    if (mitigationsMatch) {
      const headingStart = mitigationsMatch.index;
      const afterHeadingIndex = headingStart + mitigationsMatch[0].length;
      const afterHeading = raw.slice(afterHeadingIndex);

      // Find the next heading after Mitigations.
      const nextHeadingMatch = afterHeading.match(/\n#{2,6}\s+/m);
      const mitigationsBody = nextHeadingMatch
        ? afterHeading.slice(0, nextHeadingMatch.index ?? 0)
        : afterHeading;
      const post = nextHeadingMatch
        ? afterHeading.slice(nextHeadingMatch.index ?? 0)
        : '';

      const pre = raw.slice(0, headingStart);

      mitigationsItems = mitigationsBody
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean)
        .map(l => l.replace(/^[-*•]\s+/, ''))
        .map(l => l.replace(/^\d+\.?\s+/, ''))
        .filter(Boolean);

      mainWithoutMitigations = `${pre}\n${post}`.trim();
    }

    // Extract "Questions to refine this analysis" so we can elevate it with a refinement CTA.
    const questionsHeadingRegex = /^#{2,6}\s+.*questions\s+to\s+refine.*$/gim;
    const questionsMatch = questionsHeadingRegex.exec(mainWithoutMitigations);

    let mainText = mainWithoutMitigations;
    let questionsItems: string[] = [];

    if (questionsMatch) {
      const qStart = questionsMatch.index;
      const afterQHeadingIndex = qStart + questionsMatch[0].length;
      const afterHeading = mainWithoutMitigations.slice(afterQHeadingIndex);

      // Questions are usually at the end; if there's another heading after, stop there.
      const nextHeadingMatch = afterHeading.match(/\n#{2,6}\s+/m);
      const qBody = nextHeadingMatch
        ? afterHeading.slice(0, nextHeadingMatch.index ?? 0)
        : afterHeading;

      const qPre = mainWithoutMitigations.slice(0, qStart);
      const qPost = nextHeadingMatch
        ? afterHeading.slice(nextHeadingMatch.index ?? 0)
        : '';

      mainText = `${qPre}\n${qPost}`.trim();

      questionsItems = qBody
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean)
        .map(l => l.replace(/^[-*•]\s+/, ''))
        .map(l => l.replace(/^\d+\.?\s+/, ''))
        .filter(Boolean);
    }

    const firstQuestion = questionsItems.length ? questionsItems[0] : '';

    return {
      main: decorateHeadings(mainText),
      mitigationsItems,
      questionsItems,
      firstQuestion,
    };
  }, [analysis]);

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
    // Keep the main Analyze button behavior centralized so the refinement loop
    // and initial run always use the same prompt builder.
    await runAnalysis();
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

  // Phase 6D: Primary CTA - convert this analysis into a Show Planner item.
  const handleSaveToShowPlanner = async () => {
    if (!analysis.trim()) return;
    try {
      const title = routineName.trim() ? `Angle/Risk — ${routineName.trim()}` : 'Angle/Risk — Routine';
      const show = await createShow(title, 'Created from Angle/Risk Analysis');

      await addTaskToShow(show.id, {
        title: 'Review Angle/Risk Notes',
        notes: analysis,
        priority: 'High',
        status: 'To-Do',
      } as any);

      toast.showToast('Saved to Show Planner', 'success');
      if (onDeepLinkShowPlanner) {
        onDeepLinkShowPlanner(show.id);
      } else {
        // Fallback: if the parent doesn’t provide a deep-link handler, at least navigate.
        onNavigate?.('show-planner');
      }
    } catch (e) {
      console.error(e);
      toast.showToast('Could not save to Show Planner.', 'error');
    }
  };  
  // Helper used by both the initial analysis and the refinement loop.
  // Allows a one-off focus override without changing overall data flow.
  const runAnalysis = async (focusOverride?: string) => {
    if (!canAnalyze || isLoading) return;
    setIsLoading(true);
    setAnalysis('');

    const focusToUse = (focusOverride ?? focusText).trim();

    const prompt = [
      `You are an expert stagecraft and rehearsal coach for magicians.`,
      `Task: Provide an Angle/Risk Analysis for the routine named: "${routineName.trim()}".`,
      `Context: Performance mode = ${mode}. Audience setup = ${setup}.`,
      `Venue context: venue type = ${venueType}; lighting = ${lighting}; audience distance = ${audienceDistance}.`,
      routineSteps.trim() ? `Routine phases / structure:
${routineSteps.trim()}` : null,
      propsText.trim() ? `Props/Setup Notes: ${propsText.trim()}` : null,
      keyMoments.length ? `Key moments to protect: ${keyMoments.join(', ')}.` : null,
      focusToUse ? `User focus requests: ${focusToUse}` : null,
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
      `5) Critical Exposure Points (3-5 bullets that name the vulnerable moment, why it is exposed, and the safer adjustment)`,
      `6) Professional Coaching Notes (3-5 concise bullets on blocking, posture, timing, and audience management)`,
      `7) Mitigations (3–7 actionable steps, written as checklist items)`,
      `8) Questions to refine this analysis (3–6 targeted questions)`,
    ].filter(Boolean).join('\n');

    try {
      const text = await generateResponse(prompt, ANGLE_RISK_ANALYSIS_SYSTEM_INSTRUCTION, user);
      setAnalysis(text);
    } catch (e: any) {
      console.error(e);
      toast.showToast('Angle/Risk analysis failed. Please try again.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefineWithAI = async () => {
    if (!analysis.trim() || isLoading) return;
    const prompt = [
      'You are a rehearsal coach for a magician. Help refine this routine WITHOUT exposing method.',
      routineName.trim() ? `Routine: ${routineName.trim()}` : null,
      `Mode: ${mode}. Audience setup: ${setup}.`,
      focusText.trim() ? `Focus: ${focusText.trim()}` : null,
      '',
      'Angle/Risk Analysis Notes:',
      analysis.trim(),
      '',
      'Task: Propose a revised blocking and handling plan that reduces exposure risk. Provide 3-7 actionable rehearsal drills.',
    ].filter(Boolean).join('\n');

    // Preferred: hand off to the parent (AI Assistant) so the user can continue iterating there.
    if (onAiSpark) {
      onAiSpark({ kind: 'angle-risk-refine', prompt, routineName: routineName.trim() });
      onNavigate?.('ai-assistant');
      return;
    }

    // Fallback: if no parent handler exists, run the refinement on this page.
    setIsLoading(true);
    try {
      const text = await generateResponse(prompt, ANGLE_RISK_ANALYSIS_SYSTEM_INSTRUCTION, user);
      setAnalysis(text);
      toast.showToast('Refinement generated', 'success');
    } catch (e: any) {
      console.error(e);
      toast.showToast('Refinement failed. Please try again.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefineFromQuestions = () => {
    const q = decoratedOutput?.firstQuestion?.trim();
    if (!q) return;

    // Pre-fill focus field with the first refinement question and bring the user back to inputs.
    setFocusText(q);

    // Smooth scroll + focus + automatically rerun analysis with the new focus.
    setTimeout(() => {
      focusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      focusRef.current?.focus();
      // Run immediately using the override (state updates are async).
      void runAnalysis(q);
    }, 0);
  };
  const handleRunVideoRehearsal = () => {
    if (onNavigate) {
      onNavigate('video-rehearsal');
      return;
    }
    toast.showToast('Video Rehearsal navigation is not available in this build.', 'info');
  };

  // Phase 6D: utility CTAs
  const handleShare = async () => {
    if (!analysis.trim()) return;
    try {
      const shareText = `Angle/Risk Analysis — ${routineName.trim() || 'Routine'}\nMode: ${mode} | Audience: ${setup}\n\n${analysis}`;
      await navigator.clipboard.writeText(shareText);
      toast.showToast('Copied share text to clipboard', 'success');
    } catch {
      toast.showToast('Could not copy to clipboard.', 'error');
    }
  };

  const loadDemoPreset = () => {
    setRoutineName('Zombie Ball');
    setMode('Parlor');
    setSetup('Seated (front)');
    setVenueType('Parlor room');
    setLighting('Mixed / uneven');
    setAudienceDistance('3–10 ft');
    setKeyMoments(['Load', 'Secret action', 'Reset']);
    setPropsText('Floating sphere, foulard cloth, side table, limited backstage space.');
    setRoutineSteps(['Introduction with cloth display', 'Secret setup under the foulard', 'Floating sequence and audience focus shifts', 'Reveal and applause cue', 'Cleanup and reset before next piece'].join('\n'));
    setFocusText('Watch right-side exposure during the float, posture tells during the secret setup, and reset safety between routines.');
    toast.showToast('Demo routine loaded', 'success');
    setTimeout(() => routineNameRef.current?.focus(), 0);
  };

  const handleStartOver = () => {
    setAnalysis('');
    setIsLoading(false);
    setRoutineName('');
    setMode('Close-up');
    setSetup('Seated (front)');
    setVenueType('Close-up table');
    setLighting('Bright / direct');
    setAudienceDistance('1–3 ft');
    setPropsText('');
    setKeyMoments([]);
    setFocusText('');
    setRoutineSteps(DEFAULT_ROUTINE_STEPS.join('\n'));
    toast.showToast('Ready for a new analysis', 'info');
    setTimeout(() => routineNameRef.current?.focus(), 0);
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
              <p className="mt-1 text-sm text-white/65">Analyze sightline exposure, posture tells, blocking pressure points, and reset vulnerabilities.</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={loadDemoPreset}
              className="rounded-full border border-purple-400/30 bg-purple-500/10 px-3 py-1.5 text-xs font-semibold text-purple-100 hover:bg-purple-500/20"
            >
              Load Demo Routine
            </button>
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-white/80 mb-1">Routine name</label>
              <input
                ref={routineNameRef}
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

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">Venue type</label>
                <select
                  value={venueType}
                  onChange={(e) => setVenueType(e.target.value as VenueType)}
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40"
                >
                  {(['Close-up table', 'Walk-around floor', 'Parlor room', 'Theater stage', 'Street / outdoor'] as const).map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">Lighting</label>
                <select
                  value={lighting}
                  onChange={(e) => setLighting(e.target.value as LightingType)}
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40"
                >
                  {(['Bright / direct', 'Mixed / uneven', 'Dim / low light'] as const).map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">Audience distance</label>
                <select
                  value={audienceDistance}
                  onChange={(e) => setAudienceDistance(e.target.value as AudienceDistance)}
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40"
                >
                  {(['1–3 ft', '3–10 ft', '10+ ft'] as const).map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-white/80 mb-1">Routine phases</label>
              <textarea
                value={routineSteps}
                onChange={(e) => setRoutineSteps(e.target.value)}
                rows={5}
                placeholder="List the key phases in order so the AI can analyze the weak points more precisely"
                className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/40"
              />
              <p className="mt-2 text-xs text-white/55">One phase per line works best. This gives the analysis a real routine map instead of forcing it to guess.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">Key moments to protect <span className="text-white/50">(where exposure is most likely)</span></label>
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
                ref={focusRef}
                value={focusText}
                onChange={(e) => setFocusText(e.target.value)}
                rows={3}
                placeholder="e.g., angles during steals, reset risk between tables, posture tells during secret actions"
                className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/40"
              />
              <p className="mt-2 text-xs text-white/55">Use this to bias the analysis (e.g., angles, handling tells, reset safety).</p>
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
              {isLoading ? 'Analyzing…' : 'Analyze Routine Risk'}
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
              <h3 className="mt-4 text-lg font-semibold text-white">Ready to analyze this routine</h3>
              <p className="mt-1 max-w-md text-sm text-white/60">Enter the routine details and click <span className="text-white/75">Analyze Routine Risk</span>. The AI will score angles, posture, blocking, timing, and reset pressure points.</p>

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
                {riskProfile && (
                  <div className="mb-4 space-y-4">
                    <div className="rounded-xl border border-white/10 bg-black/10 p-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-white">Risk Profile</p>
                          <p className="mt-1 text-xs text-white/60">Fast scannable scoring so this page feels like a real rehearsal analysis system.</p>
                        </div>
                        <div className="lg:text-right">
                          <div className="text-sm text-white/85">
                            Overall Risk: <span className="font-semibold">{riskProfile.overall.dot} {riskProfile.overall.label}</span>
                          </div>
                          <div className="mt-1 text-xs text-white/60">Top pressure points: <span className="text-white/75">{riskProfile.topRisks.join(', ')}</span></div>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
                        {riskProfile.metrics.map(metric => (
                          <div key={metric.label} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-white">{metric.label}</p>
                              <span className="text-xs font-semibold text-white/70">{metric.level}</span>
                            </div>
                            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                              <div className="h-full rounded-full bg-purple-400/80" style={{ width: `${metric.score}%` }} />
                            </div>
                            <div className="mt-2 text-xs text-white/50">{metric.score}/100</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {(criticalExposurePoints.length > 0 || coachingNotes.length > 0) && (
                      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                        <div className="rounded-xl border border-white/10 bg-black/10 p-4">
                          <div className="flex items-center gap-2">
                            <EyeIcon className="h-4 w-4 text-purple-200" />
                            <p className="text-sm font-semibold text-white">Critical Exposure Points</p>
                          </div>
                          <p className="mt-1 text-xs text-white/60">The moments most likely to flash, feel suspicious, or create reset pressure.</p>
                          <ul className="mt-3 space-y-2">
                            {criticalExposurePoints.length ? criticalExposurePoints.map((item, idx) => (
                              <li key={`${idx}-${item.slice(0, 12)}`} className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-white/80">{item}</li>
                            )) : <li className="text-sm text-white/50">No critical points were extracted from this report.</li>}
                          </ul>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-black/10 p-4">
                          <div className="flex items-center gap-2">
                            <ShieldIcon className="h-4 w-4 text-purple-200" />
                            <p className="text-sm font-semibold text-white">Professional Coaching Notes</p>
                          </div>
                          <p className="mt-1 text-xs text-white/60">Quick rehearsal coaching notes you can actually act on during practice.</p>
                          <ul className="mt-3 space-y-2">
                            {coachingNotes.length ? coachingNotes.map((item, idx) => (
                              <li key={`${idx}-${item.slice(0, 12)}`} className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-white/80">{item}</li>
                            )) : <li className="text-sm text-white/50">No coaching notes were extracted from this report.</li>}
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Phase 6B: Decorated headings + actionable Mitigations checklist */}
                {decoratedOutput ? (
                  <>
                    {!!decoratedOutput.main.trim() && <FormattedText text={decoratedOutput.main} />}

                    {decoratedOutput.mitigationsItems.length > 0 && (
                      <div className="my-4 rounded-xl border border-purple-400/20 bg-purple-500/10 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-white">🛡 Mitigations</p>
                            <p className="mt-1 text-xs text-white/60">Actionable steps to reduce exposure risk and improve control.</p>
                          </div>
                        </div>

                        <ul className="mt-3 space-y-2">
                          {decoratedOutput.mitigationsItems.slice(0, 12).map((item, idx) => {
                            // Emphasize a leading verb/phrase (best-effort) without changing the model output.
                            const m = item.match(/^([A-Za-z][A-Za-z'’\-]+(?:\s+[A-Za-z][A-Za-z'’\-]+){0,2})([:—\-])\s*(.*)$/);
                            const lead = m ? m[1] : item.split(/\s+/)[0];
                            const rest = m ? m[3] : item.slice(lead.length).trim();

                            return (
                              <li key={`${idx}-${lead}`} className="flex gap-3 rounded-lg border border-white/10 bg-black/10 px-3 py-2">
                                <div className="mt-0.5 h-5 w-5 flex items-center justify-center rounded-md border border-white/10 bg-white/[0.03] text-white/60">
                                  ✓
                                </div>
                                <div className="text-sm text-white/85 leading-relaxed">
                                  <strong className="text-white">{lead}</strong>{rest ? ` — ${rest}` : ''}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}

                    {decoratedOutput.questionsItems.length > 0 && (
                      <div className="my-4 rounded-xl border border-white/10 bg-black/10 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-white">Want even more precision?</p>
                            <p className="mt-1 text-xs text-white/60">Answer the first question to refine your focus, then rerun the analysis.</p>
                          </div>
                          <button
                            onClick={handleRefineFromQuestions}
                            className="shrink-0 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/[0.07]"
                          >
                            Refine this analysis
                          </button>
                        </div>

                        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-white/80">
                          {decoratedOutput.questionsItems.slice(0, 8).map((q, i) => (
                            <li key={`${i}-${q.slice(0, 12)}`} className="leading-relaxed">{q}</li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </>
                ) : (
                  <FormattedText text={analysis} />
                )}
              </div>
              {/* Phase 6D: clearer CTA footer with primary "Next Steps" + de-emphasized utilities */}
              <div className="mt-4 rounded-xl border border-white/10 bg-black/10 p-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div className="flex-1">
                    <p className="text-xs font-semibold tracking-wide text-white/60">Next Steps</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        onClick={handleSaveToShowPlanner}
                        className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-xs font-semibold text-white hover:bg-purple-700"
                      >
                        <SaveIcon className="h-4 w-4" />
                        Save to Show Planner
                      </button>
                      <button
                        onClick={handleRefineWithAI}
                        className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/85 hover:bg-white/[0.07]"
                      >
                        <WandIcon className="h-4 w-4" />
                        Refine with AI
                      </button>
                      <button
                        onClick={handleRunVideoRehearsal}
                        className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/85 hover:bg-white/[0.07]"
                      >
                        <VideoIcon className="h-4 w-4" />
                        Run Video Rehearsal
                      </button>
                    </div>
                  </div>

                  <div className="lg:text-right">
                    <p className="text-xs font-semibold tracking-wide text-white/50">Utilities</p>
                    <div className="mt-2 flex flex-wrap gap-2 lg:justify-end">
                      <button
                        onClick={handleSaveIdea}
                        className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/[0.05]"
                      >
                        <SaveIcon className="h-4 w-4" />
                        Save Idea
                      </button>
                      <button
                        onClick={handleShare}
                        className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/[0.05]"
                      >
                        <ShareIcon className="h-4 w-4" />
                        Share
                      </button>
                      <button
                        onClick={handleStartOver}
                        className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/[0.05]"
                      >
                        Start Over
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}