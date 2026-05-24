import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileTextIcon, StageCurtainsIcon, WandIcon } from './icons';
import { logEvent } from '../services/analyticsService';

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

export type GuidedCreatorSessionProps = {
  onPathSelect?: (path: GuidedCreatorPath) => void;
  onSkip?: () => void;
  onComplete?: (path: GuidedCreatorPath) => void;
};

type GuidedCreatorAnswers = Record<string, string>;

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
      {
        id: 'prop',
        question: 'What object or prop do you want to use?',
        helperText: 'Examples: a borrowed ring, a deck of cards, a phone, a coin, a receipt, a key.',
        inputType: 'text',
        placeholder: 'A borrowed ring and a sealed envelope',
      },
      {
        id: 'audience',
        question: 'What kind of audience?',
        helperText: 'This helps the Wizard shape the pacing, tone, and level of interaction.',
        inputType: 'select',
        options: ['Close-up adults', 'Family audience', 'Corporate audience', 'Kids show', 'Magic club', 'Walk-around guests'],
      },
      {
        id: 'style',
        question: 'What style?',
        helperText: 'Choose the emotional flavor of the routine.',
        inputType: 'select',
        options: ['Mysterious', 'Comedic', 'Mentalism', 'Storytelling', 'Visual', 'Bizarre'],
      },
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
      {
        id: 'script',
        question: 'Paste your current script.',
        helperText: 'A rough draft is fine. The goal is to make it clearer, more performable, and more audience-centered.',
        inputType: 'textarea',
        placeholder: 'Paste your current patter here...',
      },
      {
        id: 'tone',
        question: 'Choose tone.',
        helperText: 'This helps the Wizard preserve your performing character.',
        inputType: 'select',
        options: ['Conversational', 'Funny', 'Mysterious', 'Warm', 'Dramatic', 'Fast-paced'],
      },
      {
        id: 'length',
        question: 'Choose performance length.',
        helperText: 'Keep this realistic for the moment you are trying to create.',
        inputType: 'select',
        options: ['30 seconds', '1 minute', '2 minutes', '3 minutes', '5 minutes'],
      },
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
      {
        id: 'showType',
        question: 'What kind of show?',
        helperText: 'Examples: birthday party, corporate strolling, church program, stage show, school assembly.',
        inputType: 'text',
        placeholder: 'Corporate strolling magic at a holiday event',
      },
      {
        id: 'duration',
        question: 'How long is it?',
        helperText: 'This helps estimate structure, pacing, and preparation needs.',
        inputType: 'select',
        options: ['10 minutes', '20 minutes', '30 minutes', '45 minutes', '60 minutes', '90 minutes'],
      },
      {
        id: 'audience',
        question: 'Who is the audience?',
        helperText: 'Audience context helps shape the recommended opener, middle, closer, and rehearsal priorities.',
        inputType: 'text',
        placeholder: 'Adults at a company banquet, about 150 people',
      },
    ],
  },
];

const getInitialAnswer = (step: GuidedCreatorStep): string => step.options?.[0] || '';

const buildInitialAnswers = (path: GuidedCreatorPathCard): GuidedCreatorAnswers => path.steps.reduce<GuidedCreatorAnswers>((answers, step) => {
  answers[step.id] = getInitialAnswer(step);
  return answers;
}, {});

const buildResult = (path: GuidedCreatorPathCard, answers: GuidedCreatorAnswers): string[] => {
  if (path.id === 'new-effect') {
    return [
      `Start with ${answers.prop || 'your chosen prop'} for ${answers.audience || 'your audience'}.`,
      `Frame the routine with a ${answers.style || 'clear'} tone so the effect feels intentional instead of generic.`,
      'Next best step: turn this seed into a full effect structure with beats, props, risks, and patter.',
    ];
  }

  if (path.id === 'improve-patter') {
    return [
      `Shape the script toward a ${answers.tone || 'clear'} tone and keep it near ${answers.length || 'the target length'}.`,
      'Focus on shorter audience-facing lines, clearer moments of attention, and one memorable emotional beat.',
      'Next best step: send this into the Patter Engine for a full rewrite and rehearsal-ready version.',
    ];
  }

  return [
    `Prepare this as a ${answers.duration || 'focused'} ${answers.showType || 'performance'} for ${answers.audience || 'your audience'}.`,
    'Build the plan around a strong opener, a flexible middle, and a clear closer with reset and prop checks.',
    'Next best step: move this into Show Planner and create rehearsal, packing, and client-prep tasks.',
  ];
};

export default function GuidedCreatorSession({ onPathSelect, onSkip, onComplete }: GuidedCreatorSessionProps) {
  const hasLoggedViewRef = useRef(false);
  const [selectedPathId, setSelectedPathId] = useState<GuidedCreatorPath | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [answers, setAnswers] = useState<GuidedCreatorAnswers>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generatedResult, setGeneratedResult] = useState<string[] | null>(null);

  const selectedPath = useMemo(
    () => guidedCreatorPaths.find((path) => path.id === selectedPathId) || null,
    [selectedPathId]
  );

  const currentStep = selectedPath?.steps[currentStepIndex];
  const totalSteps = selectedPath ? selectedPath.steps.length + 1 : 0;
  const displayedStepNumber = selectedPath ? Math.min(currentStepIndex + 1, totalSteps) : 0;

  useEffect(() => {
    if (hasLoggedViewRef.current) return;
    hasLoggedViewRef.current = true;
    void logEvent('guided_creator_viewed', {
      entry: 'guided_creator_session',
      version: 'phase_3',
    });
  }, []);

  const handlePathSelect = (path: GuidedCreatorPath) => {
    const nextPath = guidedCreatorPaths.find((candidate) => candidate.id === path);
    if (!nextPath) return;

    setSelectedPathId(path);
    setCurrentStepIndex(0);
    setAnswers(buildInitialAnswers(nextPath));
    setGenerationError(null);
    setGeneratedResult(null);

    void logEvent('guided_creator_path_selected', {
      path,
      entry: 'guided_creator_session',
      version: 'phase_3',
    });
    onPathSelect?.(path);
  };

  const handleAnswerChange = (stepId: string, value: string) => {
    setAnswers((previous) => ({ ...previous, [stepId]: value }));
  };

  const handleNextStep = () => {
    if (!selectedPath || !currentStep) return;

    const answer = answers[currentStep.id]?.trim();
    if (!answer) {
      setGenerationError('Please answer this question before moving forward.');
      return;
    }

    setGenerationError(null);
    void logEvent('guided_creator_step_completed', {
      path: selectedPath.id,
      step_id: currentStep.id,
      step_number: currentStepIndex + 1,
      total_question_steps: selectedPath.steps.length,
      version: 'phase_3',
    });

    setCurrentStepIndex((previous) => previous + 1);
  };

  const handleBack = () => {
    setGenerationError(null);
    if (!selectedPath || currentStepIndex === 0) {
      setSelectedPathId(null);
      setGeneratedResult(null);
      return;
    }
    setCurrentStepIndex((previous) => previous - 1);
  };

  const handleGenerate = async () => {
    if (!selectedPath) return;

    setIsGenerating(true);
    setGenerationError(null);
    setGeneratedResult(null);

    void logEvent('guided_creator_generation_started', {
      path: selectedPath.id,
      version: 'phase_3',
    });

    try {
      const result = buildResult(selectedPath, answers);
      setGeneratedResult(result);
      void logEvent('guided_creator_generation_completed', {
        path: selectedPath.id,
        version: 'phase_3',
      });
      onComplete?.(selectedPath.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to generate the guided result.';
      setGenerationError(message);
      void logEvent('guided_creator_generation_failed', {
        path: selectedPath.id,
        error: message,
        version: 'phase_3',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const renderStepInput = () => {
    if (!currentStep) return null;

    const value = answers[currentStep.id] || '';

    if (currentStep.inputType === 'textarea') {
      return (
        <textarea
          value={value}
          onChange={(event) => handleAnswerChange(currentStep.id, event.target.value)}
          placeholder={currentStep.placeholder}
          rows={8}
          className="mt-6 w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-base text-white outline-none transition focus:border-yellow-300/60 focus:ring-2 focus:ring-yellow-300/20"
        />
      );
    }

    if (currentStep.inputType === 'select') {
      return (
        <select
          value={value}
          onChange={(event) => handleAnswerChange(currentStep.id, event.target.value)}
          className="mt-6 w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-base text-white outline-none transition focus:border-yellow-300/60 focus:ring-2 focus:ring-yellow-300/20"
        >
          {(currentStep.options || []).map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      );
    }

    return (
      <input
        type="text"
        value={value}
        onChange={(event) => handleAnswerChange(currentStep.id, event.target.value)}
        placeholder={currentStep.placeholder}
        className="mt-6 w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-base text-white outline-none transition focus:border-yellow-300/60 focus:ring-2 focus:ring-yellow-300/20"
      />
    );
  };

  const renderPathCards = () => (
    <>
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
    </>
  );

  const renderWizard = () => {
    if (!selectedPath) return null;
    const Icon = selectedPath.icon;
    const isReviewStep = currentStepIndex >= selectedPath.steps.length;

    return (
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={handleBack}
            className="rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-white/25 hover:text-white"
          >
            Back
          </button>
          {onSkip && (
            <button
              type="button"
              onClick={onSkip}
              className="text-sm font-medium text-slate-400 underline decoration-slate-600 underline-offset-4 transition-colors hover:text-slate-200 hover:decoration-slate-300"
            >
              Skip to dashboard
            </button>
          )}
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/20 backdrop-blur sm:p-8">
          <div className="flex items-start gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-yellow-300/20 bg-yellow-300/10 text-yellow-200">
              <Icon className="h-7 w-7" />
            </span>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-yellow-300/80">
                Step {displayedStepNumber} of {totalSteps}
              </p>
              <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
                {isReviewStep ? selectedPath.generateLabel : currentStep?.question}
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                {isReviewStep
                  ? 'Review your answers, then generate the first version of your guided creator result.'
                  : currentStep?.helperText}
              </p>
            </div>
          </div>

          <div className="mt-8 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-yellow-300 transition-all duration-300"
              style={{ width: `${(displayedStepNumber / Math.max(totalSteps, 1)) * 100}%` }}
            />
          </div>

          {isReviewStep ? (
            <div className="mt-8 space-y-4">
              {selectedPath.steps.map((step) => (
                <div key={step.id} className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{step.question}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-200 whitespace-pre-wrap">{answers[step.id]}</p>
                </div>
              ))}
            </div>
          ) : renderStepInput()}

          {generationError && (
            <p className="mt-5 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {generationError}
            </p>
          )}

          {generatedResult && (
            <div className="mt-8 rounded-3xl border border-yellow-300/20 bg-yellow-300/10 p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-yellow-200">{selectedPath.resultTitle}</p>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-yellow-50">
                {generatedResult.map((line) => (
                  <li key={line} className="flex gap-3">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-yellow-200" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-end">
            {isReviewStep ? (
              <button
                type="button"
                onClick={handleGenerate}
                disabled={isGenerating}
                className="inline-flex items-center justify-center rounded-full bg-yellow-300 px-6 py-3 text-sm font-bold text-slate-950 transition hover:bg-yellow-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isGenerating ? 'Generating…' : selectedPath.generateLabel}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleNextStep}
                className="inline-flex items-center justify-center rounded-full bg-yellow-300 px-6 py-3 text-sm font-bold text-slate-950 transition hover:bg-yellow-200"
              >
                Continue
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <main className="relative min-h-[calc(100vh-5rem)] overflow-hidden bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(168,85,247,0.22),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(234,179,8,0.16),transparent_34%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-yellow-300/40 to-transparent" />

      <section className="relative z-10 mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-6xl flex-col justify-center px-4 py-12 sm:px-6 lg:px-8">
        {selectedPath ? renderWizard() : renderPathCards()}
      </section>
    </main>
  );
}
