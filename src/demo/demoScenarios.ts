// Demo Mode v2: Scenario definitions.
// Phase 2 wires deterministic outputs for the Effect Engine only.
// Phase 3 will add step orchestration across multiple tools.

export type DemoToolKey = string;

export interface DemoToolStep<TInput = any, TOutput = any> {
  tool: DemoToolKey;
  title?: string;
  description?: string;
  input?: TInput;
  output?: TOutput;
}

export interface DemoScenario {
  key: string;
  title: string;
  description?: string;
  steps: DemoToolStep[];
}

// Phase 1: ship with a single placeholder scenario.
export const demoScenarios: Record<string, DemoScenario> = {
  corporate_closeup: {
    key: 'corporate_closeup',
    title: 'Corporate Close-Up Journey',
    description: 'A polished, deterministic showcase path designed for onboarding recordings.',
    steps: [
      {
        tool: 'effect_engine',
        title: 'Effect Engine',
        description: 'Generate 4 curated, convention-safe effects for a corporate cocktail setting.',
      },
      {
        tool: 'script_builder',
        title: 'Script Builder (Coming in Phase 3)',
      },
      {
        tool: 'rehearsal_feedback',
        title: 'Rehearsal Feedback (Coming in Phase 3)',
      },
    ],
  },
};
