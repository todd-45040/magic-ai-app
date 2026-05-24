import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '../types';
import { generateStructuredResponse, normalizeAiUserFacingError } from '../services/geminiService';
import { saveIdea } from '../services/ideasService';
import { logEvent } from '../services/analyticsService';
import { CalendarIcon, CheckIcon, FileTextIcon, SaveIcon, StageCurtainsIcon, WandIcon } from './icons';

export type GuidedCreatorPath = 'new-effect' | 'improve-patter' | 'prepare-performance';

type GuidedCreatorStep = {
  id: string;
  question: string;
  helperText: string;
  inputType: 'text' | 'textarea' | 'select';
  placeholder?: string;
  options?: string[];
};

type GuidedCreatorPathCard = {
  id: GuidedCreatorPath;
  title: string;
  description: string;
  helperText: string;
  icon: React.ComponentType<{ className?: string }>;
  generateLabel: string;
  resultTitle: string;
  steps: GuidedCreatorStep[];
};

type GuidedCreatorResult = {
  title: string;
  summary: string;
  script: string;
  props: string[];
  nextSteps: string[];
};

export type GuidedCreatorSessionProps = {
  user?: User | null;
  onPathSelect?: (path: GuidedCreatorPath) => void;
  onSkip?: () => void;
  onComplete?: (path: GuidedCreatorPath) => void;
  onGoDashboard?: () => void;
  onOpenPatterEngine?: () => void;
  onOpenShowPlanner?: () => void;
};

type GuidedCreatorAnswers = Record<string, string>;

type ActionStatus = 'idle' | 'saved' | 'queued';

const PATTER_ENGINE_PREFILL_KEY = 'maw_patter_engine_prefill_v1';
const SHOW_PLANNER_ROUTINE_HANDOFF_KEY = 'maw_show_planner_routine_handoff_v1';

const guidedCreatorPaths: GuidedCreatorPathCard[] = [
  {
    id: 'new-effect',
    title: 'Create a new effect',
    description: 'Start with a prop, theme, or audience and shape it into a performance-ready idea.',
    helperText: 'Best for creators, hobbyists, and magicians looking for a fresh routine.',
    icon: WandIcon,
    generateLabel: 'Generate idea',
    resultTitle: 'Your new effect seed',
    steps: [
      { id: 'prop', question: 'What object or prop do you want to use?', helperText: 'Examples: a borrowed ring, a deck of cards, a phone, a coin, a receipt, a key.', inputType: 'text', placeholder: 'A borrowed ring and a sealed envelope' },
      { id: 'audience', question: 'What kind of audience?', helperText: 'This helps the Wizard shape the pacing, tone, and level of interaction.', inputType: 'select', options: ['Close-up adults', 'Family audience', 'Corporate audience', 'Kids show', 'Magic club', 'Walk-around guests'] },
      { id: 'style', question: 'What style?', helperText: 'Choose the emotional flavor of the routine.', inputType: 'select', options: ['Mysterious', 'Comedic', 'Mentalism', 'Storytelling', 'Visual', 'Bizarre'] },
    ],
  },
  {
    id: 'improve-patter',
    title: 'Improve my patter',
    description: 'Turn rough lines into tighter, clearer, more theatrical audience-facing script work.',
    helperText: 'Best when you already have a trick but want stronger presentation.',
    icon: FileTextIcon,
    generateLabel: 'Generate improved patter',
    resultTitle: 'Your improved patter direction',
    steps: [
      { id: 'script', question: 'Paste your current script.', helperText: 'A rough draft is fine. The goal is to make it clearer, more performable, and more audience-centered.', inputType: 'textarea', placeholder: 'Paste your current patter here...' },
      { id: 'tone', question: 'Choose tone.', helperText: 'This helps the Wizard preserve your performing character.', inputType: 'select', options: ['Conversational', 'Funny', 'Mysterious', 'Warm', 'Dramatic', 'Fast-paced'] },
      { id: 'length', question: 'Choose performance length.', helperText: 'Keep this realistic for the moment you are trying to create.', inputType: 'select', options: ['30 seconds', '1 minute', '2 minutes', '3 minutes', '5 minutes'] },
    ],
  },
  {
    id: 'prepare-performance',
    title: 'Prepare a performance',
    description: 'Build momentum around a show, audience, theme, or upcoming booking.',
    helperText: 'Best for performers getting ready for a real event or rehearsal.',
    icon: StageCurtainsIcon,
    generateLabel: 'Generate prep plan',
    resultTitle: 'Your performance prep plan',
    steps: [
      { id: 'showType', question: 'What kind of show?', helperText: 'Examples: birthday party, corporate strolling, church program, stage show, school assembly.', inputType: 'text', placeholder: 'Corporate strolling magic at a holiday event' },
      { id: 'duration', question: 'How long is it?', helperText: 'This helps estimate structure, pacing, and preparation needs.', inputType: 'select', options: ['10 minutes', '20 minutes', '30 minutes', '45 minutes', '60 minutes', '90 minutes'] },
      { id: 'audience', question: 'Who is the audience?', helperText: 'Audience context helps shape the recommended opener, middle, closer, and rehearsal priorities.', inputType: 'text', placeholder: 'Adults at a company banquet, about 150 people' },
    ],
  },
];

const GUIDED_CREATOR_RESULT_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
    script: { type: 'string' },
    props: { type: 'array', items: { type: 'string' } },
    nextSteps: { type: 'array', items: { type: 'string' } },
  },
  required: ['title', 'summary', 'script', 'props', 'nextSteps'],
};

const getInitialAnswer = (step: GuidedCreatorStep): string => step.options?.[0] || '';

const buildInitialAnswers = (path: GuidedCreatorPathCard): GuidedCreatorAnswers => path.steps.reduce<GuidedCreatorAnswers>((answerMap, step) => {
  answerMap[step.id] = getInitialAnswer(step);
  return answerMap;
}, {});

const compactAnswers = (path: GuidedCreatorPathCard, answers: GuidedCreatorAnswers) => path.steps
  .map((step) => `${step.question}\n${answers[step.id] || ''}`)
  .join('\n\n');

const normalizeResult = (raw: any, path: GuidedCreatorPathCard, answers: GuidedCreatorAnswers): GuidedCreatorResult => {
  const fallbackTitle = path.id === 'new-effect'
    ? `Effect idea with ${answers.prop || 'your prop'}`
    : path.id === 'improve-patter'
      ? 'Improved patter draft'
      : `${answers.showType || 'Performance'} prep plan`;

  const asArray = (value: any): string[] => Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 8)
    : [];

  return {
    title: String(raw?.title || fallbackTitle).trim(),
    summary: String(raw?.summary || 'A focused first draft is ready for your next creative step.').trim(),
    script: String(raw?.script || raw?.patter || raw?.plan || 'Use this draft as the first creative direction, then refine it inside the appropriate Magic AI Wizard tool.').trim(),
    props: asArray(raw?.props).length ? asArray(raw?.props) : ['Primary prop or premise', 'Audience context', 'Rehearsal notes'],
    nextSteps: asArray(raw?.nextSteps).length ? asArray(raw?.nextSteps) : ['Save this idea', 'Refine the draft', 'Move it into the next tool'],
  };
};

const buildPrompt = (path: GuidedCreatorPathCard, answers: GuidedCreatorAnswers) => {
  if (path.id === 'new-effect') {
    return `Use the existing Effect Generator logic style: create a magician-safe, high-level effect concept without exposing secret methods.\n\nInputs:\n${compactAnswers(path, answers)}\n\nReturn title, summary, script, props, and nextSteps. The script may be a short presentation seed or beat outline.`;
  }

  if (path.id === 'improve-patter') {
    return `Use the existing Patter Engine logic style: improve the user's patter into a concise, audience-facing performance draft. Do not reveal methods.\n\nInputs:\n${compactAnswers(path, answers)}\n\nReturn title, summary, script, props, and nextSteps. Put the improved spoken script in the script field.`;
  }

  return `Use the existing Show Planner logic style: create a practical performance preparation plan for a magician. Do not reveal methods.\n\nInputs:\n${compactAnswers(path, answers)}\n\nReturn title, summary, script, props, and nextSteps. Put the prep plan in the script field.`;
};

const SYSTEM_INSTRUCTION = `You are Magic AI Wizard's Guided Creator Session. You are not a separate AI product. You act as a front-end pathway into the existing Effect Generator, Patter Engine, and Show Planner workflows. Keep the output practical, magician-safe, and immediately useful. Never reveal secrets or exposure-level methods. Return only valid JSON matching the requested schema.`;

const resultToSaveText = (path: GuidedCreatorPathCard, result: GuidedCreatorResult) => [
  `Guided Creator Session: ${path.title}`,
  '',
  `Title: ${result.title}`,
  '',
  `Summary:\n${result.summary}`,
  '',
  `Script / Plan:\n${result.script}`,
  '',
  `Props:\n${result.props.map((prop) => `- ${prop}`).join('\n')}`,
  '',
  `Next Steps:\n${result.nextSteps.map((step) => `- ${step}`).join('\n')}`,
].join('\n');

export default function GuidedCreatorSession({ user, onPathSelect, onSkip, onComplete, onGoDashboard, onOpenPatterEngine, onOpenShowPlanner }: GuidedCreatorSessionProps) {
  const hasLoggedViewRef = useRef(false);
  const [selectedPathId, setSelectedPathId] = useState<GuidedCreatorPath | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [answers, setAnswers] = useState<GuidedCreatorAnswers>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generatedResult, setGeneratedResult] = useState<GuidedCreatorResult | null>(null);
  const [actionStatus, setActionStatus] = useState<ActionStatus>('idle');

  const selectedPath = useMemo(() => guidedCreatorPaths.find((path) => path.id === selectedPathId) || null, [selectedPathId]);
  const currentStep = selectedPath?.steps[currentStepIndex];
  const totalSteps = selectedPath ? selectedPath.steps.length + 1 : 0;
  const displayedStepNumber = selectedPath ? Math.min(currentStepIndex + 1, totalSteps) : 0;

  useEffect(() => {
    if (hasLoggedViewRef.current) return;
    hasLoggedViewRef.current = true;
    void logEvent('guided_creator_viewed', { entry: 'guided_creator_session', version: 'phase_4' });
  }, []);

  const handlePathSelect = (path: GuidedCreatorPath) => {
    const nextPath = guidedCreatorPaths.find((candidate) => candidate.id === path);
    if (!nextPath) return;
    setSelectedPathId(path);
    setCurrentStepIndex(0);
    setAnswers(buildInitialAnswers(nextPath));
    setGenerationError(null);
    setGeneratedResult(null);
    setActionStatus('idle');
    void logEvent('guided_creator_path_selected', { path, entry: 'guided_creator_session', version: 'phase_4' });
    onPathSelect?.(path);
  };

  const handleAnswerChange = (stepId: string, value: string) => setAnswers((previous) => ({ ...previous, [stepId]: value }));

  const handleNextStep = () => {
    if (!selectedPath || !currentStep) return;
    const answer = answers[currentStep.id]?.trim();
    if (!answer) {
      setGenerationError('Please answer this question before moving forward.');
      return;
    }
    setGenerationError(null);
    void logEvent('guided_creator_step_completed', { path: selectedPath.id, step_id: currentStep.id, step_number: currentStepIndex + 1, total_question_steps: selectedPath.steps.length, version: 'phase_4' });
    setCurrentStepIndex((previous) => previous + 1);
  };

  const handleBack = () => {
    setGenerationError(null);
    if (!selectedPath || currentStepIndex === 0) {
      setSelectedPathId(null);
      setGeneratedResult(null);
      setActionStatus('idle');
      return;
    }
    setCurrentStepIndex((previous) => previous - 1);
  };

  const handleGenerate = async () => {
    if (!selectedPath) return;
    setIsGenerating(true);
    setGenerationError(null);
    setGeneratedResult(null);
    setActionStatus('idle');
    void logEvent('guided_creator_generation_started', { path: selectedPath.id, version: 'phase_4', service: 'geminiService.generateStructuredResponse' });

    try {
      const structured = await generateStructuredResponse(
        buildPrompt(selectedPath, answers),
        SYSTEM_INSTRUCTION,
        GUIDED_CREATOR_RESULT_SCHEMA,
        user || undefined,
        { maxOutputTokens: 4096, speedMode: 'fast' }
      );
      const result = normalizeResult(structured, selectedPath, answers);
      setGeneratedResult(result);
      void logEvent('guided_creator_generation_completed', { path: selectedPath.id, version: 'phase_4', result_title: result.title });
      onComplete?.(selectedPath.id);
    } catch (error) {
      const message = normalizeAiUserFacingError(error);
      setGenerationError(message);
      void logEvent('guided_creator_generation_failed', { path: selectedPath.id, error: message, version: 'phase_4' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveIdea = async () => {
    if (!selectedPath || !generatedResult) return;
    try {
      await saveIdea('text', resultToSaveText(selectedPath, generatedResult));
      setActionStatus('saved');
      void logEvent('guided_creator_result_saved', { path: selectedPath.id, version: 'phase_4', title: generatedResult.title });
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : 'Unable to save this idea.');
    }
  };

  const handleSendToPatter = () => {
    if (!selectedPath || !generatedResult) return;
    const payload = {
      version: 1,
      source: 'guided_creator',
      pipelineStage: 'guided_creator_to_script',
      effectTitle: generatedResult.title,
      effectDescription: resultToSaveText(selectedPath, generatedResult),
      selectedTones: selectedPath.id === 'improve-patter' ? [answers.tone || 'Conversational'] : ['Mysterious', 'Storytelling'],
      created_at: new Date().toISOString(),
    };
    try {
      localStorage.setItem(PATTER_ENGINE_PREFILL_KEY, JSON.stringify(payload));
      setActionStatus('queued');
    } catch {}
    void logEvent('guided_creator_send_to_patter', { path: selectedPath.id, version: 'phase_4', title: generatedResult.title });
    onOpenPatterEngine?.();
  };

  const handleAddToShowPlanner = () => {
    if (!selectedPath || !generatedResult) return;
    const payload = {
      version: 1,
      source: 'guided_creator',
      pipelineStage: 'guided_creator_to_routine',
      title: generatedResult.title,
      notes: resultToSaveText(selectedPath, generatedResult),
      patter: generatedResult.script,
      effectDescription: generatedResult.summary,
      selectedTones: selectedPath.id === 'improve-patter' ? [answers.tone || 'Conversational'] : [],
      upstream: { path: selectedPath.id, answers },
      created_at: new Date().toISOString(),
    };
    try {
      localStorage.setItem(SHOW_PLANNER_ROUTINE_HANDOFF_KEY, JSON.stringify(payload));
      setActionStatus('queued');
    } catch {}
    void logEvent('guided_creator_add_to_show_planner', { path: selectedPath.id, version: 'phase_4', title: generatedResult.title });
    onOpenShowPlanner?.();
  };

  const handleRefine = () => {
    setGeneratedResult(null);
    setGenerationError(null);
    setActionStatus('idle');
    void logEvent('guided_creator_refine_clicked', { path: selectedPath?.id || 'unknown', version: 'phase_4' });
  };

  const renderStepInput = () => {
    if (!currentStep) return null;
    const value = answers[currentStep.id] || '';
    const className = 'mt-6 w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-base text-white outline-none transition focus:border-yellow-300/60 focus:ring-2 focus:ring-yellow-300/20';
    if (currentStep.inputType === 'textarea') return <textarea value={value} onChange={(event) => handleAnswerChange(currentStep.id, event.target.value)} placeholder={currentStep.placeholder} rows={8} className={className} />;
    if (currentStep.inputType === 'select') return <select value={value} onChange={(event) => handleAnswerChange(currentStep.id, event.target.value)} className={className}>{(currentStep.options || []).map((option) => <option key={option} value={option}>{option}</option>)}</select>;
    return <input type="text" value={value} onChange={(event) => handleAnswerChange(currentStep.id, event.target.value)} placeholder={currentStep.placeholder} className={className} />;
  };

  const renderPathCards = () => (
    <>
      <div className="mx-auto max-w-3xl text-center">
        <p className="mb-4 text-sm font-semibold uppercase tracking-[0.35em] text-yellow-300/80">Guided Creator Session</p>
        <h1 className="text-4xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl">Welcome to Magic AI Wizard.</h1>
        <p className="mt-5 text-xl text-slate-200 sm:text-2xl">Let’s create something together.</p>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-400">Choose one starting point. The next step will stay focused, collaborative, and simple.</p>
        {onSkip && <button type="button" onClick={onSkip} className="mt-6 text-sm font-medium text-slate-400 underline decoration-slate-600 underline-offset-4 transition-colors hover:text-slate-200 hover:decoration-slate-300">Skip to dashboard</button>}
      </div>
      <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
        {guidedCreatorPaths.map((path) => {
          const Icon = path.icon;
          return <button key={path.id} type="button" onClick={() => handlePathSelect(path.id)} className="group flex h-full flex-col rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-left shadow-2xl shadow-black/20 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-yellow-300/50 hover:bg-white/[0.07] focus:outline-none focus:ring-2 focus:ring-yellow-300/50"><span className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-yellow-300/20 bg-yellow-300/10 text-yellow-200 transition-colors group-hover:border-yellow-300/50 group-hover:bg-yellow-300/20"><Icon className="h-7 w-7" /></span><span className="text-xl font-bold text-yellow-100">{path.title}</span><span className="mt-3 text-sm leading-6 text-slate-300">{path.description}</span><span className="mt-5 border-t border-white/10 pt-4 text-xs leading-5 text-slate-500 group-hover:text-slate-400">{path.helperText}</span></button>;
        })}
      </div>
    </>
  );

  const renderResult = () => {
    if (!selectedPath || !generatedResult) return null;
    return (
      <div className="mt-8 rounded-3xl border border-yellow-300/20 bg-yellow-300/10 p-5">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-yellow-200">{selectedPath.resultTitle}</p>
        <h3 className="mt-3 text-2xl font-bold text-white">{generatedResult.title}</h3>
        <p className="mt-3 text-sm leading-6 text-yellow-50">{generatedResult.summary}</p>
        <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/45 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Script / Patter / Plan</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-100">{generatedResult.script}</p>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-yellow-200">Props</p>
            <ul className="mt-2 space-y-2 text-sm text-yellow-50">{generatedResult.props.map((prop) => <li key={prop} className="flex gap-2"><CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-yellow-200" />{prop}</li>)}</ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-yellow-200">Next steps</p>
            <ul className="mt-2 space-y-2 text-sm text-yellow-50">{generatedResult.nextSteps.map((step) => <li key={step} className="flex gap-2"><CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-yellow-200" />{step}</li>)}</ul>
          </div>
        </div>
        {actionStatus !== 'idle' && <p className="mt-4 rounded-2xl border border-emerald-300/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">{actionStatus === 'saved' ? 'Saved to your ideas.' : 'Queued for the next Magic AI Wizard tool.'}</p>}
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <button type="button" onClick={handleSaveIdea} className="inline-flex items-center justify-center gap-2 rounded-full bg-yellow-300 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-yellow-200"><SaveIcon className="h-4 w-4" />Save this idea</button>
          <button type="button" onClick={handleRefine} className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:border-white/25 hover:text-white"><WandIcon className="h-4 w-4" />Refine this</button>
          <button type="button" onClick={handleSendToPatter} className="inline-flex items-center justify-center gap-2 rounded-full border border-purple-300/25 bg-purple-400/10 px-4 py-3 text-sm font-semibold text-purple-100 transition hover:bg-purple-400/20"><FileTextIcon className="h-4 w-4" />Generate patter</button>
          <button type="button" onClick={handleAddToShowPlanner} className="inline-flex items-center justify-center gap-2 rounded-full border border-blue-300/25 bg-blue-400/10 px-4 py-3 text-sm font-semibold text-blue-100 transition hover:bg-blue-400/20"><CalendarIcon className="h-4 w-4" />Add to show planner</button>
          <button type="button" onClick={onGoDashboard} className="inline-flex items-center justify-center rounded-full border border-white/10 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:border-white/25 hover:text-white">Go to dashboard</button>
        </div>
      </div>
    );
  };

  const renderWizard = () => {
    if (!selectedPath) return null;
    const Icon = selectedPath.icon;
    const isReviewStep = currentStepIndex >= selectedPath.steps.length;
    return (
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <button type="button" onClick={handleBack} className="rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-white/25 hover:text-white">Back</button>
          {onSkip && <button type="button" onClick={onSkip} className="text-sm font-medium text-slate-400 underline decoration-slate-600 underline-offset-4 transition-colors hover:text-slate-200 hover:decoration-slate-300">Skip to dashboard</button>}
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/20 backdrop-blur sm:p-8">
          <div className="flex items-start gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-yellow-300/20 bg-yellow-300/10 text-yellow-200"><Icon className="h-7 w-7" /></span>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-yellow-300/80">Step {displayedStepNumber} of {totalSteps}</p>
              <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">{isReviewStep ? selectedPath.generateLabel : currentStep?.question}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-400">{isReviewStep ? 'Review your answers, then generate through the existing Magic AI Wizard AI service path.' : currentStep?.helperText}</p>
            </div>
          </div>
          <div className="mt-8 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-yellow-300 transition-all duration-300" style={{ width: `${(displayedStepNumber / Math.max(totalSteps, 1)) * 100}%` }} /></div>
          {isReviewStep ? <div className="mt-8 space-y-4">{selectedPath.steps.map((step) => <div key={step.id} className="rounded-2xl border border-white/10 bg-slate-900/70 p-4"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{step.question}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-200">{answers[step.id]}</p></div>)}</div> : renderStepInput()}
          {generationError && <p className="mt-5 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">{generationError}</p>}
          {renderResult()}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-end">
            {isReviewStep && !generatedResult ? <button type="button" onClick={handleGenerate} disabled={isGenerating} className="inline-flex items-center justify-center rounded-full bg-yellow-300 px-6 py-3 text-sm font-bold text-slate-950 transition hover:bg-yellow-200 disabled:cursor-not-allowed disabled:opacity-60">{isGenerating ? 'Generating…' : selectedPath.generateLabel}</button> : !isReviewStep ? <button type="button" onClick={handleNextStep} className="inline-flex items-center justify-center rounded-full bg-yellow-300 px-6 py-3 text-sm font-bold text-slate-950 transition hover:bg-yellow-200">Continue</button> : null}
          </div>
        </div>
      </div>
    );
  };

  return (
    <main className="relative min-h-[calc(100vh-5rem)] overflow-hidden bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(168,85,247,0.22),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(234,179,8,0.16),transparent_34%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-yellow-300/40 to-transparent" />
      <section className="relative z-10 mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-6xl flex-col justify-center px-4 py-12 sm:px-6 lg:px-8">{selectedPath ? renderWizard() : renderPathCards()}</section>
    </main>
  );
}
