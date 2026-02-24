// Demo Mode v2 (Phase 1): Scenario definitions (placeholder).
// These will be expanded in Phase 2/3 to power deterministic "Guided Showcase" flows.

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
  guided_showcase_placeholder: {
    key: 'guided_showcase_placeholder',
    title: 'Guided Showcase (Placeholder)',
    description:
      'Phase 1 placeholder scenario. Phase 2 will add deterministic tool outputs and step orchestration.',
    steps: [],
  },
};
