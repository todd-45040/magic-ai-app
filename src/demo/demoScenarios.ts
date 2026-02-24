// Demo Mode v2: Scenario definitions.
// Phase 2 wires deterministic outputs for the Effect Engine only.
// Phase 3 adds a lightweight step-orchestrator ("guided showcase") across multiple views.

export type DemoToolKey =
  | 'effect_engine'
  | 'script_builder'
  | 'rehearsal_feedback';

export interface DemoToolStep<TInput = any, TOutput = any> {
  tool: DemoToolKey;
  /** MagicianMode view id (used for locking + Continue navigation) */
  view: string;
  title: string;
  description?: string;
  input?: TInput;
  output?: TOutput;
  /** CTA label when advancing to the next step */
  continueLabel?: string;
}

export interface DemoScenario {
  key: string;
  title: string;
  description?: string;
  steps: DemoToolStep[];
}

// Phase 3: ship with a single polished, recordable scenario.
// NOTE: Views map directly to MagicianMode views.
export const demoScenarios: Record<string, DemoScenario> = {
  corporate_closeup: {
    key: 'corporate_closeup',
    title: 'Corporate Close-Up Journey',
    description: 'A deterministic, convention-safe guided showcase designed for onboarding recordings.',
    steps: [
      {
        tool: 'effect_engine',
        view: 'effect-generator',
        title: 'Effect Engine',
        description: 'Generate a polished set of effects for a corporate cocktail setting.',
        continueLabel: 'Continue to Patter Engine',
      },
      {
        tool: 'script_builder',
        view: 'patter-engine',
        title: 'Patter Engine',
        description: 'Turn one effect into tight, stage-ready scripting beats.',
        continueLabel: 'Continue to Live Rehearsal',
      },
      {
        tool: 'rehearsal_feedback',
        view: 'live-rehearsal',
        title: 'Live Rehearsal',
        description: 'Practice, refine pacing, and get feedback (demo walkthrough).',
        continueLabel: 'Finish Tour',
      },
    ],
  },
};
