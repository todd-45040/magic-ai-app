import React, { useMemo, useState } from 'react';
import { Type } from '@google/genai';

import { generateImages, generateStructuredResponse } from '../services/geminiService';
import { saveIdea } from '../services/ideasService';
import { CohesionActions } from './CohesionActions';
import SaveActionBar from './shared/SaveActionBar';
import type { User } from '../types';
import { APP_VERSION } from '../constants';
import { BlueprintIcon, WandIcon } from './icons';

interface IllusionBlueprintProps {
  user: User;
  onIdeaSaved: () => void;
}

type SaveStatus = 'idle' | 'saved';
type CopyStatus = 'idle' | 'copied';

type EffectSuggestion =
  | 'Appearance'
  | 'Vanish'
  | 'Levitation'
  | 'Penetration'
  | 'Transformation'
  | 'Escape'
  | 'Teleportation';

type VenueScale = 'Close-up' | 'Parlor' | 'Stage' | 'Grand Illusion' | 'Arena';
type PerformerStyle = 'Comedy' | 'Mystery' | 'Elegant' | 'Dark' | 'Story-driven';
type BudgetLevel = 'Lean' | 'Moderate' | 'Premium';
type CrewSize = 'Solo' | '1 Assistant' | '2-3 Crew' | '4+ Crew';
type ResetRequirement = 'Instant' | 'Under 1 minute' | 'Under 3 minutes' | 'Flexible';

type BuilderPlan = {
  project_title: string;
  audience_effect: string;
  build_concept: string;
  recommended_construction: {
    main_structure: string[];
    materials: string[];
    hardware: string[];
    mobility_modularity: string;
  };
  dimensions_footprint: string;
  mechanism_approach: {
    primary: string;
    alternate: string;
  };
  assembly_overview: string[];
  safety_stability_notes: string[];
  reset_transport_crew: string[];
  build_complexity: {
    rating_1_to_5: number;
    rationale: string;
  };
};

const EFFECT_SUGGESTIONS: EffectSuggestion[] = [
  'Appearance',
  'Vanish',
  'Levitation',
  'Penetration',
  'Transformation',
  'Escape',
  'Teleportation',
];

const VENUE_SCALES: VenueScale[] = ['Close-up', 'Parlor', 'Stage', 'Grand Illusion', 'Arena'];
const PERFORMER_STYLES: PerformerStyle[] = ['Comedy', 'Mystery', 'Elegant', 'Dark', 'Story-driven'];
const BUDGET_LEVELS: BudgetLevel[] = ['Lean', 'Moderate', 'Premium'];
const CREW_SIZES: CrewSize[] = ['Solo', '1 Assistant', '2-3 Crew', '4+ Crew'];
const RESET_REQUIREMENTS: ResetRequirement[] = ['Instant', 'Under 1 minute', 'Under 3 minutes', 'Flexible'];

const DEMO_PRESETS = [
  {
    label: 'Floating Assistant',
    effect: 'Levitation with a graceful assistant floating several feet above a low platform and rotating slightly for the audience.',
    venue: 'Stage' as VenueScale,
    style: 'Elegant' as PerformerStyle,
    budget: 'Premium' as BudgetLevel,
    crew: '2-3 Crew' as CrewSize,
    reset: 'Under 3 minutes' as ResetRequirement,
    transport: 'Must break down into rolling road-case-friendly sections.',
    stage: 'Proscenium theatre, limited wing depth, avoid extreme side seating exposure.',
    safety: 'Performer and assistant stability, smooth ascent, emergency access.',
    materials: 'Aluminum frame, birch ply skin, soft goods trim.',
    notes: 'Prioritize elegance, sightline discipline, and quiet operation.',
  },
  {
    label: 'Instant Appearance Cabinet',
    effect: 'Performer appears instantly inside a compact cabinet center stage after a brief burst of theatrical cover.',
    venue: 'Grand Illusion' as VenueScale,
    style: 'Mystery' as PerformerStyle,
    budget: 'Moderate' as BudgetLevel,
    crew: '1 Assistant' as CrewSize,
    reset: 'Under 1 minute' as ResetRequirement,
    transport: 'Must fit into a box truck with modular sections.',
    stage: 'Indoor convention stage, shallow backstage crossover.',
    safety: 'Tipping resistance, fast latch access, clean performer egress.',
    materials: 'Plywood, steel reinforcement where needed, concealed casters.',
    notes: 'Cabinet should read premium and theatrical without becoming oversized.',
  },
  {
    label: 'Motorcycle Vanish',
    effect: 'A full-size motorcycle vanishes from a raised display platform under theatrical cover within seconds.',
    venue: 'Arena' as VenueScale,
    style: 'Dark' as PerformerStyle,
    budget: 'Premium' as BudgetLevel,
    crew: '4+ Crew' as CrewSize,
    reset: 'Flexible' as ResetRequirement,
    transport: 'Heavy scenic pieces acceptable, but modularity still preferred.',
    stage: 'Large stage with flown lighting, broad audience width, balcony sightlines present.',
    safety: 'Vehicle handling, platform load, edge protection, crew communication.',
    materials: 'Steel frame primary, scenic panels secondary.',
    notes: 'Keep it realistic, safe, and suitable for repeated touring use.',
  },
];

const PLAN_SYSTEM_INSTRUCTION = `You are a professional illusion builder's planning assistant.

Your job is to create realistic, high-quality builder plans for stage and performance illusions.

Rules:
- Output ONLY valid JSON matching the provided schema.
- Stay practical, workshop-minded, and non-exposure.
- Use high-level principle language only. Do NOT reveal secrets or step-by-step exposure.
- Prioritize buildability, modularity, transport, stability, and safe operation.
- Use common theatrical fabrication language and realistic materials/hardware.
- Keep the response compact and useful for a builder/fabricator.
- If a requested effect is unrealistic for the stated constraints, adapt it into a safer, more achievable version.
- No dangerous instructions involving weapons, explosives, or illegal construction.
- Build complexity must be a number from 1 to 5.`;

const IMAGE_STYLE_GUIDE = `Create theatrical but practical illusion concept imagery. Show the prop or illusion unit clearly. Prioritize believable materials, clean stage presentation, and builder-oriented visibility. No text overlays. No exploded diagrams. No impossible sci-fi visuals.`;

const LoadingIndicator: React.FC<{ stage: string }> = ({ stage }) => (
  <div className="flex flex-col items-center justify-center text-center p-8 h-full">
    <div className="relative">
      <WandIcon className="w-16 h-16 text-purple-400 animate-pulse" />
      <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
        <div className="w-24 h-24 border-t-2 border-purple-300 rounded-full animate-spin"></div>
      </div>
    </div>
    <p className="text-slate-300 mt-4 text-lg">Building your illusion plan…</p>
    <p className="text-slate-400 text-sm">{stage}</p>
  </div>
);

const CollapsibleCard: React.FC<{
  title: string;
  subtitle?: string;
  isOpen: boolean;
  onToggle: () => void;
  actions?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, subtitle, isOpen, onToggle, actions, children }) => (
  <section className="rounded-2xl border border-slate-800 bg-slate-900/20 overflow-hidden">
    <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-3">
      <button
        type="button"
        onClick={onToggle}
        className="flex-1 text-left flex items-center justify-between gap-3"
      >
        <div>
          <h3 className="text-lg font-bold text-white font-cinzel">{title}</h3>
          {subtitle ? <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p> : null}
        </div>
        <span className={`text-slate-400 text-sm transition-transform ${isOpen ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
    {isOpen ? <div className="p-4">{children}</div> : null}
  </section>
);

const DetailList: React.FC<{ items: string[] }> = ({ items }) => (
  <ul className="list-disc pl-5 text-sm text-slate-200 space-y-1.5">
    {items.map((item, idx) => (
      <li key={`${item}-${idx}`}>{item}</li>
    ))}
  </ul>
);

const IllusionBlueprint: React.FC<IllusionBlueprintProps> = ({ user, onIdeaSaved }) => {
  const [effectInput, setEffectInput] = useState('');
  const [venueScale, setVenueScale] = useState<VenueScale>('Stage');
  const [performerStyle, setPerformerStyle] = useState<PerformerStyle>('Mystery');
  const [budgetLevel, setBudgetLevel] = useState<BudgetLevel>('Moderate');
  const [crewSize, setCrewSize] = useState<CrewSize>('1 Assistant');
  const [resetRequirement, setResetRequirement] = useState<ResetRequirement>('Under 3 minutes');
  const [transportLimitations, setTransportLimitations] = useState('');
  const [stageLimitations, setStageLimitations] = useState('');
  const [safetyConcerns, setSafetyConcerns] = useState('');
  const [materialsPreference, setMaterialsPreference] = useState('');
  const [specialNotes, setSpecialNotes] = useState('');

  const [builderPlan, setBuilderPlan] = useState<BuilderPlan | null>(null);
  const [imageOptions, setImageOptions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState('');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle');
  const [openSections, setOpenSections] = useState({
    plan: true,
    construction: true,
    operations: true,
    visuals: true,
  });

  const planSchema = useMemo(
    () => ({
      type: Type.OBJECT,
      properties: {
        project_title: { type: Type.STRING },
        audience_effect: { type: Type.STRING },
        build_concept: { type: Type.STRING },
        recommended_construction: {
          type: Type.OBJECT,
          properties: {
            main_structure: { type: Type.ARRAY, items: { type: Type.STRING } },
            materials: { type: Type.ARRAY, items: { type: Type.STRING } },
            hardware: { type: Type.ARRAY, items: { type: Type.STRING } },
            mobility_modularity: { type: Type.STRING },
          },
          required: ['main_structure', 'materials', 'hardware', 'mobility_modularity'],
        },
        dimensions_footprint: { type: Type.STRING },
        mechanism_approach: {
          type: Type.OBJECT,
          properties: {
            primary: { type: Type.STRING },
            alternate: { type: Type.STRING },
          },
          required: ['primary', 'alternate'],
        },
        assembly_overview: { type: Type.ARRAY, items: { type: Type.STRING } },
        safety_stability_notes: { type: Type.ARRAY, items: { type: Type.STRING } },
        reset_transport_crew: { type: Type.ARRAY, items: { type: Type.STRING } },
        build_complexity: {
          type: Type.OBJECT,
          properties: {
            rating_1_to_5: { type: Type.NUMBER },
            rationale: { type: Type.STRING },
          },
          required: ['rating_1_to_5', 'rationale'],
        },
      },
      required: [
        'project_title',
        'audience_effect',
        'build_concept',
        'recommended_construction',
        'dimensions_footprint',
        'mechanism_approach',
        'assembly_overview',
        'safety_stability_notes',
        'reset_transport_crew',
        'build_complexity',
      ],
    }),
    []
  );

  const toggleSection = (key: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const applyPreset = (preset: (typeof DEMO_PRESETS)[number]) => {
    setEffectInput(preset.effect);
    setVenueScale(preset.venue);
    setPerformerStyle(preset.style);
    setBudgetLevel(preset.budget);
    setCrewSize(preset.crew);
    setResetRequirement(preset.reset);
    setTransportLimitations(preset.transport);
    setStageLimitations(preset.stage);
    setSafetyConcerns(preset.safety);
    setMaterialsPreference(preset.materials);
    setSpecialNotes(preset.notes);
    setError(null);
    setWarning(null);
  };

  const resetAll = () => {
    setEffectInput('');
    setVenueScale('Stage');
    setPerformerStyle('Mystery');
    setBudgetLevel('Moderate');
    setCrewSize('1 Assistant');
    setResetRequirement('Under 3 minutes');
    setTransportLimitations('');
    setStageLimitations('');
    setSafetyConcerns('');
    setMaterialsPreference('');
    setSpecialNotes('');
    setBuilderPlan(null);
    setImageOptions([]);
    setError(null);
    setWarning(null);
    setSaveStatus('idle');
    setCopyStatus('idle');
    setLoadingStage('');
    setOpenSections({
      plan: true,
      construction: true,
      operations: true,
      visuals: true,
    });
  };

  const generationContext = useMemo(
    () => [
      `Requested effect: ${effectInput.trim() || '(none provided)'}`,
      `Venue / performance scale: ${venueScale}`,
      `Performer style: ${performerStyle}`,
      `Budget level: ${budgetLevel}`,
      `Crew size: ${crewSize}`,
      `Reset requirement: ${resetRequirement}`,
      `Transport limitations: ${transportLimitations.trim() || 'Not specified'}`,
      `Stage limitations: ${stageLimitations.trim() || 'Not specified'}`,
      `Safety concerns: ${safetyConcerns.trim() || 'Not specified'}`,
      `Materials preference: ${materialsPreference.trim() || 'Not specified'}`,
      `Special notes: ${specialNotes.trim() || 'Not specified'}`,
    ].join('\n'),
    [
      effectInput,
      venueScale,
      performerStyle,
      budgetLevel,
      crewSize,
      resetRequirement,
      transportLimitations,
      stageLimitations,
      safetyConcerns,
      materialsPreference,
      specialNotes,
    ]
  );

  const planMarkdown = useMemo(() => {
    if (!builderPlan) return '';

    return [
      `# ${builderPlan.project_title}`,
      '',
      `**Requested Effect:** ${effectInput}`,
      `**Venue / Scale:** ${venueScale}`,
      `**Performer Style:** ${performerStyle}`,
      `**Budget Level:** ${budgetLevel}`,
      `**Crew Size:** ${crewSize}`,
      `**Reset Requirement:** ${resetRequirement}`,
      transportLimitations.trim() ? `**Transport Limitations:** ${transportLimitations.trim()}` : '',
      stageLimitations.trim() ? `**Stage Limitations:** ${stageLimitations.trim()}` : '',
      safetyConcerns.trim() ? `**Safety Concerns:** ${safetyConcerns.trim()}` : '',
      materialsPreference.trim() ? `**Materials Preference:** ${materialsPreference.trim()}` : '',
      specialNotes.trim() ? `**Special Notes:** ${specialNotes.trim()}` : '',
      '',
      '## Audience Effect',
      builderPlan.audience_effect,
      '',
      '## Build Concept',
      builderPlan.build_concept,
      '',
      '## Recommended Construction',
      ...builderPlan.recommended_construction.main_structure.map((item) => `- ${item}`),
      '',
      '### Materials',
      ...builderPlan.recommended_construction.materials.map((item) => `- ${item}`),
      '',
      '### Hardware',
      ...builderPlan.recommended_construction.hardware.map((item) => `- ${item}`),
      '',
      `### Mobility / Modularity\n${builderPlan.recommended_construction.mobility_modularity}`,
      '',
      '## Dimensions / Footprint',
      builderPlan.dimensions_footprint,
      '',
      '## Mechanism Approach',
      `- Primary: ${builderPlan.mechanism_approach.primary}`,
      `- Alternate: ${builderPlan.mechanism_approach.alternate}`,
      '',
      '## Assembly Overview',
      ...builderPlan.assembly_overview.map((item, idx) => `${idx + 1}. ${item}`),
      '',
      '## Safety / Stability Notes',
      ...builderPlan.safety_stability_notes.map((item) => `- ${item}`),
      '',
      '## Reset / Transport / Crew',
      ...builderPlan.reset_transport_crew.map((item) => `- ${item}`),
      '',
      `## Build Complexity\n${builderPlan.build_complexity.rating_1_to_5} / 5 — ${builderPlan.build_complexity.rationale}`,
    ]
      .filter(Boolean)
      .join('\n');
  }, [
    builderPlan,
    effectInput,
    venueScale,
    performerStyle,
    budgetLevel,
    crewSize,
    resetRequirement,
    transportLimitations,
    stageLimitations,
    safetyConcerns,
    materialsPreference,
    specialNotes,
  ]);

  const handleCopy = async () => {
    if (!planMarkdown) return;
    try {
      await navigator.clipboard.writeText(planMarkdown);
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 1500);
    } catch {
      // ignore clipboard permission issues
    }
  };

  const handleSave = async () => {
    if (!builderPlan || !planMarkdown) return;
    try {
      await saveIdea({
        type: 'text',
        title: `Illusion Builder Plan — ${builderPlan.project_title}`,
        content: planMarkdown,
        tags: ['illusion-blueprint', 'builder-plan'],
      });
      onIdeaSaved();
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err: any) {
      setError(err?.message || 'Could not save this builder plan.');
    }
  };

  const handleGenerate = async () => {
    if (!effectInput.trim()) {
      setError('Please describe the illusion or effect you want to build.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setWarning(null);
    setBuilderPlan(null);
    setImageOptions([]);
    setSaveStatus('idle');
    setCopyStatus('idle');

    const planPrompt = [
      'Create a realistic builder plan for the following illusion request.',
      '',
      generationContext,
      '',
      'Return a compact, practical plan for a real builder/fabricator.',
      'The mechanism section must stay non-exposure and principle-based only.',
      'Include only 1 primary and 1 alternate mechanism direction.',
      'Keep all sections concise and reliable.',
    ].join('\n');

    try {
      setLoadingStage('Generating builder plan…');
      const plan = (await generateStructuredResponse(
        planPrompt,
        PLAN_SYSTEM_INSTRUCTION,
        planSchema,
        user,
        { maxOutputTokens: 1800, speedMode: 'fast' }
      )) as BuilderPlan;

      setBuilderPlan(plan);
      setOpenSections({
        plan: true,
        construction: true,
        operations: true,
        visuals: true,
      });

      setLoadingStage('Generating visual concepts…');
      const imagePrompt = [
        IMAGE_STYLE_GUIDE,
        '',
        `Project title: ${plan.project_title}`,
        `Audience effect: ${plan.audience_effect}`,
        `Build concept: ${plan.build_concept}`,
        `Dimensions / footprint: ${plan.dimensions_footprint}`,
        `Materials direction: ${plan.recommended_construction.materials.join(', ')}`,
        `Mobility / modularity: ${plan.recommended_construction.mobility_modularity}`,
        `Venue / scale: ${venueScale}`,
        `Performer style: ${performerStyle}`,
        'Produce three distinct but related design directions.',
      ].join('\n');

      try {
        const images = await generateImages(imagePrompt, '16:9', 3, user);
        setImageOptions(images);
      } catch (imageErr: any) {
        setWarning(imageErr?.message || 'Builder plan generated, but visual concepts could not be created this time.');
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to generate the builder plan.');
    } finally {
      setLoadingStage('');
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-4 md:p-6 animate-fade-in">
      <header className="mb-6">
        <div className="flex items-center gap-3">
          <BlueprintIcon className="w-8 h-8 text-purple-400" />
          <h2 className="text-2xl font-bold text-slate-200 font-cinzel">Illusion Blueprint Generator</h2>
        </div>
        <p className="text-slate-400 mt-1">
          Builder Plans + Visual Concepts. Create practical illusion construction plans with multiple supporting concept images.
        </p>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 overflow-hidden">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/20 p-4 md:p-5 overflow-y-auto">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="text-xs text-slate-400">Demo presets:</div>
            {DEMO_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyPreset(preset)}
                className="px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border bg-slate-900/40 border-slate-700 text-slate-200 hover:border-slate-500"
              >
                {preset.label}
              </button>
            ))}
            <button
              type="button"
              onClick={resetAll}
              className="ml-auto px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border bg-slate-900/40 border-slate-700 text-slate-200 hover:border-slate-500"
            >
              Reset
            </button>
          </div>

          <div className="mb-4 rounded-xl border border-slate-800 bg-slate-900/30 p-3">
            <div className="text-sm font-semibold text-slate-200">Why use this?</div>
            <ul className="mt-1 text-xs text-slate-400 list-disc pl-5 space-y-1">
              <li>Turns a rough illusion idea into a realistic builder-oriented plan.</li>
              <li>Focuses on construction, safety, transport, and practical stage use.</li>
              <li>Automatically gives you multiple concept images to help choose a direction.</li>
            </ul>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 mb-1 block">Effect or Illusion to Build</label>
              <textarea
                rows={4}
                value={effectInput}
                onChange={(e) => {
                  setEffectInput(e.target.value);
                  setError(null);
                }}
                placeholder="Describe the effect in your own words. Example: A performer vanishes a motorcycle from a raised platform under a brief theatrical cover."
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {EFFECT_SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setEffectInput((prev) => (prev.trim() ? prev : suggestion))}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border bg-slate-900/40 border-slate-700 text-slate-200 hover:border-slate-500"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 mb-1 block">Venue / Performance Scale</label>
                <select
                  value={venueScale}
                  onChange={(e) => setVenueScale(e.target.value as VenueScale)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white focus:outline-none focus:border-purple-500 transition-colors"
                >
                  {VENUE_SCALES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-300 mb-1 block">Performer Style</label>
                <select
                  value={performerStyle}
                  onChange={(e) => setPerformerStyle(e.target.value as PerformerStyle)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white focus:outline-none focus:border-purple-500 transition-colors"
                >
                  {PERFORMER_STYLES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-300 mb-1 block">Budget Level</label>
                <select
                  value={budgetLevel}
                  onChange={(e) => setBudgetLevel(e.target.value as BudgetLevel)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white focus:outline-none focus:border-purple-500 transition-colors"
                >
                  {BUDGET_LEVELS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-300 mb-1 block">Crew Size</label>
                <select
                  value={crewSize}
                  onChange={(e) => setCrewSize(e.target.value as CrewSize)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white focus:outline-none focus:border-purple-500 transition-colors"
                >
                  {CREW_SIZES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-slate-300 mb-1 block">Reset Requirement</label>
                <select
                  value={resetRequirement}
                  onChange={(e) => setResetRequirement(e.target.value as ResetRequirement)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white focus:outline-none focus:border-purple-500 transition-colors"
                >
                  {RESET_REQUIREMENTS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 mb-1 block">Transport Limitations</label>
                <textarea
                  rows={2}
                  value={transportLimitations}
                  onChange={(e) => setTransportLimitations(e.target.value)}
                  placeholder="Road cases, trailer only, one-person load-in, stairs, etc."
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-300 mb-1 block">Stage Limitations</label>
                <textarea
                  rows={2}
                  value={stageLimitations}
                  onChange={(e) => setStageLimitations(e.target.value)}
                  placeholder="Sightline issues, shallow depth, balcony seating, no trap access, etc."
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-300 mb-1 block">Safety Concerns</label>
                <textarea
                  rows={2}
                  value={safetyConcerns}
                  onChange={(e) => setSafetyConcerns(e.target.value)}
                  placeholder="Load capacity, pinch points, performer access, emergency stop needs, etc."
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-300 mb-1 block">Materials Preference</label>
                <textarea
                  rows={2}
                  value={materialsPreference}
                  onChange={(e) => setMaterialsPreference(e.target.value)}
                  placeholder="Birch ply, aluminum, steel frame, lightweight scenic skin, etc."
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-300 mb-1 block">Special Notes</label>
                <textarea
                  rows={3}
                  value={specialNotes}
                  onChange={(e) => setSpecialNotes(e.target.value)}
                  placeholder="Anything else the builder should account for."
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
                />
              </div>
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={isLoading || !effectInput.trim()}
            className="w-full py-3 mt-4 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed"
          >
            <WandIcon className="w-5 h-5" />
            <span>{isLoading ? 'Generating…' : 'Generate Builder Plan + Images'}</span>
          </button>

          {error ? <p className="text-red-400 mt-3 text-sm">{error}</p> : null}
          {warning ? <p className="text-yellow-300 mt-2 text-sm">{warning}</p> : null}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/20 overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-200">Builder Output</div>
              <div className="text-xs text-slate-500">Realistic plan first. Multiple image concepts second.</div>
            </div>
            <div className="text-[11px] text-slate-500">Version: {APP_VERSION}</div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-5">
            {!builderPlan ? (
              <div className="h-full flex items-center justify-center">
                {isLoading ? (
                  <LoadingIndicator stage={loadingStage || 'Working through the request…'} />
                ) : (
                  <div className="max-w-md text-center">
                    <div className="text-slate-200 font-semibold">Your builder plan will appear here.</div>
                    <div className="text-sm text-slate-400 mt-2">
                      Describe the effect, add your constraints, and generate a practical construction plan with several visual directions.
                    </div>
                    <div className="mt-3 text-xs text-slate-500">Designed to stay fast, reliable, and demo-ready.</div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-5">
                <div className="sticky top-0 z-20 -mx-4 md:-mx-5 px-4 md:px-5 py-3 bg-slate-950/80 backdrop-blur border-b border-slate-800">
                  <div className="flex flex-wrap gap-2">
                    {[
                      ['plan', 'Overview'],
                      ['construction', 'Construction'],
                      ['operations', 'Safety & Ops'],
                      ['visuals', 'Visual Concepts'],
                    ].map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          const el = document.getElementById(`ib-${key}`);
                          el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }}
                        className="px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border bg-slate-900/40 border-slate-700 text-slate-300 hover:border-slate-500"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div id="ib-plan">
                  <CollapsibleCard
                    title={builderPlan.project_title}
                    subtitle="Audience effect, concept direction, and build complexity"
                    isOpen={openSections.plan}
                    onToggle={() => toggleSection('plan')}
                  >
                    <div className="space-y-4">
                      <div>
                        <div className="text-xs text-slate-400 mb-1">Audience Effect</div>
                        <p className="text-sm text-slate-200 leading-relaxed">{builderPlan.audience_effect}</p>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400 mb-1">Build Concept</div>
                        <p className="text-sm text-slate-200 leading-relaxed">{builderPlan.build_concept}</p>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="rounded-lg border border-slate-800 bg-slate-950/20 p-3">
                          <div className="text-xs text-slate-400">Dimensions / Footprint</div>
                          <p className="text-sm text-slate-200 mt-1">{builderPlan.dimensions_footprint}</p>
                        </div>
                        <div className="rounded-lg border border-slate-800 bg-slate-950/20 p-3">
                          <div className="text-xs text-slate-400">Build Complexity</div>
                          <p className="text-sm text-slate-200 mt-1 font-semibold">
                            {builderPlan.build_complexity.rating_1_to_5} / 5
                          </p>
                          <p className="text-xs text-slate-400 mt-1">{builderPlan.build_complexity.rationale}</p>
                        </div>
                      </div>
                    </div>
                  </CollapsibleCard>
                </div>

                <div id="ib-construction">
                  <CollapsibleCard
                    title="Recommended Construction"
                    subtitle="Structure, materials, hardware, and mechanism direction"
                    isOpen={openSections.construction}
                    onToggle={() => toggleSection('construction')}
                  >
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="rounded-lg border border-slate-800 bg-slate-950/20 p-3">
                          <div className="text-xs text-slate-400 mb-2">Main Structure</div>
                          <DetailList items={builderPlan.recommended_construction.main_structure} />
                        </div>
                        <div className="rounded-lg border border-slate-800 bg-slate-950/20 p-3">
                          <div className="text-xs text-slate-400 mb-2">Materials</div>
                          <DetailList items={builderPlan.recommended_construction.materials} />
                        </div>
                        <div className="rounded-lg border border-slate-800 bg-slate-950/20 p-3">
                          <div className="text-xs text-slate-400 mb-2">Hardware</div>
                          <DetailList items={builderPlan.recommended_construction.hardware} />
                        </div>
                        <div className="rounded-lg border border-slate-800 bg-slate-950/20 p-3">
                          <div className="text-xs text-slate-400 mb-2">Mobility / Modularity</div>
                          <p className="text-sm text-slate-200 leading-relaxed">
                            {builderPlan.recommended_construction.mobility_modularity}
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="rounded-lg border border-slate-800 bg-slate-950/20 p-3">
                          <div className="text-xs text-slate-400 mb-2">Primary Mechanism Approach</div>
                          <p className="text-sm text-slate-200 leading-relaxed">{builderPlan.mechanism_approach.primary}</p>
                        </div>
                        <div className="rounded-lg border border-slate-800 bg-slate-950/20 p-3">
                          <div className="text-xs text-slate-400 mb-2">Alternate Mechanism Approach</div>
                          <p className="text-sm text-slate-200 leading-relaxed">{builderPlan.mechanism_approach.alternate}</p>
                        </div>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-950/20 p-3">
                        <div className="text-xs text-slate-400 mb-2">Assembly Overview</div>
                        <ol className="list-decimal pl-5 text-sm text-slate-200 space-y-1.5">
                          {builderPlan.assembly_overview.map((item, idx) => (
                            <li key={`${item}-${idx}`}>{item}</li>
                          ))}
                        </ol>
                      </div>
                    </div>
                  </CollapsibleCard>
                </div>

                <div id="ib-operations">
                  <CollapsibleCard
                    title="Safety, Reset, Transport, and Crew"
                    subtitle="Operational realities for the finished unit"
                    isOpen={openSections.operations}
                    onToggle={() => toggleSection('operations')}
                  >
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="rounded-lg border border-slate-800 bg-slate-950/20 p-3">
                        <div className="text-xs text-slate-400 mb-2">Safety / Stability Notes</div>
                        <DetailList items={builderPlan.safety_stability_notes} />
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-950/20 p-3">
                        <div className="text-xs text-slate-400 mb-2">Reset / Transport / Crew</div>
                        <DetailList items={builderPlan.reset_transport_crew} />
                      </div>
                    </div>
                  </CollapsibleCard>
                </div>

                <div id="ib-visuals">
                  <CollapsibleCard
                    title="Visual Concepts"
                    subtitle="Builder-oriented image directions to choose from"
                    isOpen={openSections.visuals}
                    onToggle={() => toggleSection('visuals')}
                    actions={
                      imageOptions.length ? (
                        <div className="text-[11px] text-slate-500">{imageOptions.length} options</div>
                      ) : null
                    }
                  >
                    {imageOptions.length ? (
                      <div className="grid grid-cols-1 gap-4">
                        {imageOptions.map((src, idx) => (
                          <div key={`${src.slice(0, 30)}-${idx}`} className="rounded-xl border border-slate-800 bg-slate-950/20 p-2">
                            <img
                              src={src}
                              alt={`Illusion concept option ${idx + 1}`}
                              className="w-full rounded-lg border border-slate-700"
                            />
                            <div className="text-xs text-slate-400 mt-2">Concept option {idx + 1}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950/20 p-4 text-sm text-slate-400">
                        The builder plan completed, but concept images were not returned on this attempt.
                      </div>
                    )}
                  </CollapsibleCard>
                </div>

                <SaveActionBar
                  title="Next step: save or move this plan"
                  subtitle="Keep the builder plan in your vault, copy it, or send it into your show workflow."
                  onSave={() => void handleSave()}
                  primaryLabel={saveStatus === 'saved' ? 'Saved' : 'Save to Idea Vault'}
                  saved={saveStatus === 'saved'}
                  onCopy={() => void handleCopy()}
                  refineNode={
                    <div className="text-sm text-zinc-300 leading-relaxed">
                      This simplified version is intentionally focused on two reliable outputs: a builder plan and multiple visual concepts.
                    </div>
                  }
                />

                <div className="flex flex-wrap gap-2">
                  <CohesionActions
                    content={planMarkdown}
                    defaultTitle={builderPlan.project_title}
                    defaultTags={['illusion-blueprint', 'builder-plan']}
                    ideaType="text"
                    compact
                  />
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="px-3 py-2 rounded-md text-sm font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200"
                  >
                    {copyStatus === 'copied' ? 'Copied!' : 'Copy Plan'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default IllusionBlueprint;
