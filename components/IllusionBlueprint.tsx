import React, { useMemo, useState } from 'react';
import { Type } from '@google/genai';

import { generateImages, generateStructuredResponse } from '../services/geminiService';
import { saveIdea } from '../services/ideasService';
import { trackClientEvent } from '../services/telemetryClient';
import { CohesionActions } from './CohesionActions';
import SaveActionBar from './shared/SaveActionBar';
import type { User } from '../types';
import { APP_VERSION } from '../constants';
import { BlueprintIcon, WandIcon, FileTextIcon, ChecklistIcon, ShieldIcon, ImageIcon } from './icons';

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
    label: 'Modern Assistant Levitation',
    effect: 'A modern stage levitation where an assistant rises cleanly from a low scenic base, floats several feet above it, and rotates just enough to feel impossible without exposing weak angles.',
    venue: 'Stage' as VenueScale,
    style: 'Elegant' as PerformerStyle,
    budget: 'Premium' as BudgetLevel,
    crew: '2-3 Crew' as CrewSize,
    reset: 'Under 3 minutes' as ResetRequirement,
    transport: 'Must break into road-case-friendly sections that can be rolled by a small crew and assembled without heavy rigging.',
    stage: 'Proscenium theatre with moderate wing space, no trap access, and audience sightlines extending into shallow side seats.',
    safety: 'Stable support for the assistant, smooth controlled motion, hidden access for spotting, and fast emergency release or descent path.',
    materials: 'Aluminum frame, birch ply scenic skin, lightweight trim panels, soft goods masking.',
    notes: 'Prioritize elegance, believable stage realism, and a polished touring finish over oversized scenery.',
  },
  {
    label: 'Motorcycle Appearance for Stage',
    effect: 'A full-size motorcycle appears center stage from a compact scenic platform after a brief burst of visual cover and lighting punctuation.',
    venue: 'Grand Illusion' as VenueScale,
    style: 'Dark' as PerformerStyle,
    budget: 'Premium' as BudgetLevel,
    crew: '4+ Crew' as CrewSize,
    reset: 'Flexible' as ResetRequirement,
    transport: 'System should be modular enough for touring in a box truck with platform sections, scenic shells, and protected vehicle load paths.',
    stage: 'Large convention or theatre stage with broad front sightlines, some balcony viewing, and limited backstage crossover depth.',
    safety: 'Vehicle load rating, stable wheel positioning, anti-tip protection, clean crew communication, and protected entry and exit paths.',
    materials: 'Steel primary frame, plywood scenic decking, reinforced hinges, concealed casters, durable touring skins.',
    notes: 'Keep it practical, stage-ready, and visually impressive without becoming fantasy engineering.',
  },
  {
    label: 'Compact Sword Penetration Cabinet',
    effect: 'A compact penetration cabinet for an assistant where blades visibly pass through the unit while the presentation still feels sleek and premium for family or general audience theatre shows.',
    venue: 'Stage' as VenueScale,
    style: 'Mystery' as PerformerStyle,
    budget: 'Moderate' as BudgetLevel,
    crew: '1 Assistant' as CrewSize,
    reset: 'Under 1 minute' as ResetRequirement,
    transport: 'Must fit through standard venue doors, roll in on concealed casters, and break down quickly into manageable modules.',
    stage: 'Shallow theatre stage with no trap, close audience proximity, and limited offstage storage footprint.',
    safety: 'Secure assistant positioning, controlled blade paths, fast access panels, anti-tip stability, and comfortable internal spacing.',
    materials: 'Birch ply, aluminum trim, steel reinforcement at stress points, durable scenic laminate or painted finish.',
    notes: 'Should read premium and compact rather than bulky, with strong visibility for the blade sequence.',
  },
  {
    label: 'Fast Reset Vanish Platform',
    effect: 'A performer vanishes from a raised display platform under a brief theatrical cover with a reset cycle suitable for repeated convention or trade show demonstrations.',
    venue: 'Stage' as VenueScale,
    style: 'Comedy' as PerformerStyle,
    budget: 'Moderate' as BudgetLevel,
    crew: '1 Assistant' as CrewSize,
    reset: 'Under 1 minute' as ResetRequirement,
    transport: 'One-van or trailer friendly, modular platform sections, light enough for fast load-in and frequent repositioning.',
    stage: 'Hotel ballroom or convention platform with flat floor, minimal backstage concealment, and audience mostly front-facing.',
    safety: 'Clear egress path, non-slip deck, secure cover handling, stable edges, and no pinch hazards during reset.',
    materials: 'Aluminum tube frame, plywood deck, lightweight scenic facings, locking casters, durable hardware for repeated resets.',
    notes: 'Prioritize speed, reliability, and a clean repeated-demo workflow over oversized scenic treatment.',
  },
  {
    label: 'Modular Teleportation Trunk',
    effect: 'A modular trunk-based teleportation illusion where the performer or assistant changes location quickly between two clearly defined stage positions.',
    venue: 'Grand Illusion' as VenueScale,
    style: 'Story-driven' as PerformerStyle,
    budget: 'Moderate' as BudgetLevel,
    crew: '2-3 Crew' as CrewSize,
    reset: 'Under 3 minutes' as ResetRequirement,
    transport: 'All units must collapse into stackable road-case-sized components suitable for touring and repeat assembly.',
    stage: 'Medium theatre with usable wing space, front rows near the action, and no overhead rigging dependency.',
    safety: 'Fast but controlled performer travel paths, protected internal edges, secure lid hardware, and positive locking between modules.',
    materials: 'Plywood trunk shells, aluminum framing, reinforced corners, concealed casters, durable scenic wrap.',
    notes: 'Emphasize modular touring practicality and a premium trunk aesthetic with believable stage footprint.',
  },
  {
    label: 'Corporate Stage Transformation',
    effect: 'A performer visibly transforms from one branded costume or silhouette into another on a clean corporate stage in a way that feels premium, modern, and event-friendly.',
    venue: 'Stage' as VenueScale,
    style: 'Elegant' as PerformerStyle,
    budget: 'Lean' as BudgetLevel,
    crew: 'Solo' as CrewSize,
    reset: 'Under 3 minutes' as ResetRequirement,
    transport: 'Must travel in a small vehicle, set up quickly by one performer, and avoid large scenic wagons or heavy steel framing.',
    stage: 'Corporate ballroom stage with projection screens, limited rehearsal time, and front-facing audience geometry.',
    safety: 'Fast costume-path access, stable positioning marks, minimal snag risk, and clean operation near AV equipment.',
    materials: 'Lightweight aluminum, fabric scenic elements, compact support framing, clean presentation skins.',
    notes: 'Keep the build corporate-friendly, elegant, and highly visual with strong image potential and minimal clutter.',
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
- If any part of the concept is not realistically buildable within the stated venue, crew, budget, transport, or safety constraints, revise it to the most practical version before returning the plan.
- Do NOT propose effects, dimensions, or mechanisms that require hidden infrastructure, trap access, overhead rigging, or external stage modifications unless the user explicitly states those are available.

- Build complexity must be a number from 1 to 5.`;

const IMAGE_STYLE_GUIDE = `Create theatrical but practical illusion concept imagery. Show the prop or illusion unit clearly. Prioritize believable materials, clean stage presentation, builder-oriented visibility, fabrication realism, and touring-feasible scale. No text overlays. No exploded diagrams. No impossible sci-fi visuals, floating structures, fantasy physics, or magical energy effects.`;

const BLUEPRINT_STYLE_GUIDE = `Create technical blueprint-style drawings for a stage illusion prop. Show practical construction-oriented diagram views with clean white or light blue linework on a dark blueprint background. Include front elevation, side elevation, and cutaway or mechanism-style layout where helpful. Emphasize labeled structural sections, dimensional feel, fabrication logic, workshop realism, and believable real-world construction. No text paragraphs. No poster art. No glossy rendering. Make it look like an illusion builder's technical concept sheet.`;

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

const ImageGenerationCard: React.FC<{ label: string }> = ({ label }) => (
  <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/30 p-5">
    <div className="flex items-center gap-3">
      <div className="h-8 w-8 rounded-full border-2 border-slate-600 border-t-violet-400 animate-spin" />
      <div>
        <div className="text-sm font-semibold text-slate-200">{label}</div>
        <div className="mt-1 text-xs text-slate-400">AI is still generating these images…</div>
      </div>
    </div>
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
  <section className="overflow-hidden rounded-2xl border border-slate-800/90 bg-gradient-to-br from-slate-900/55 to-slate-950/45 shadow-[0_8px_28px_-24px_rgba(15,23,42,0.9)]">
    <div className="flex items-start gap-3 border-b border-white/5 bg-white/[0.02] px-4 py-3.5">
      <button
        type="button"
        onClick={onToggle}
        className="min-w-0 flex-1 text-left"
        aria-expanded={isOpen}
      >
        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Builder Section</div>
        <h3 className="mt-1 text-lg font-bold text-white font-cinzel leading-tight">{title}</h3>
        {subtitle ? <p className="mt-1 text-xs leading-relaxed text-slate-400">{subtitle}</p> : null}
      </button>

      <div className="flex shrink-0 items-center gap-2 self-start">
        {actions ? <div className="shrink-0">{actions}</div> : null}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-label={isOpen ? `Collapse ${title}` : `Expand ${title}`}
          className={`flex h-8 w-8 items-center justify-center rounded-full border border-slate-700/80 bg-slate-950/70 text-slate-300 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        >
          ▾
        </button>
      </div>
    </div>
    {isOpen ? <div className="border-t border-white/[0.02] p-4 md:p-5">{children}</div> : null}
  </section>
);

const DetailList: React.FC<{ items: string[] }> = ({ items }) => (
  <ul className="list-disc pl-5 text-sm text-slate-200 space-y-1.5">
    {items.map((item, idx) => (
      <li key={`${item}-${idx}`}>{item}</li>
    ))}
  </ul>
);

const cleanText = (text: string): string => text.replace(/\*\*/g, '').replace(/\n{3,}/g, '\n\n').trim();

const splitListLines = (text: string): string[] =>
  cleanText(text)
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);

const parseTextContent = (text: string): { paragraphs: string[]; listItems: string[] } => {
  const cleaned = cleanText(text);
  if (!cleaned) return { paragraphs: [], listItems: [] };

  const lines = cleaned.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const listishLines = lines.filter((line) => /^(?:[-*•]|\d+[.)])\s+/.test(line));
  if (listishLines.length >= Math.max(2, Math.ceil(lines.length / 2))) {
    return { paragraphs: [], listItems: splitListLines(cleaned) };
  }

  const paragraphs = cleaned
    .split(/\n\n+/)
    .map((part) => part.trim())
    .filter(Boolean);

  return { paragraphs, listItems: [] };
};

const TextBlock: React.FC<{
  text: string;
  ordered?: boolean;
  leadIn?: string;
}> = ({ text, ordered = false, leadIn }) => {
  const { paragraphs, listItems } = parseTextContent(text);

  return (
    <div className="space-y-3">
      {leadIn ? (
        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">{leadIn}</div>
      ) : null}

      {listItems.length ? (
        ordered ? (
          <ol className="list-decimal pl-5 text-sm text-slate-200 space-y-2">
            {listItems.map((item, idx) => (
              <li key={`${item}-${idx}`} className="leading-relaxed">{item}</li>
            ))}
          </ol>
        ) : (
          <ul className="list-disc pl-5 text-sm text-slate-200 space-y-2">
            {listItems.map((item, idx) => (
              <li key={`${item}-${idx}`} className="leading-relaxed">{item}</li>
            ))}
          </ul>
        )
      ) : (
        paragraphs.map((paragraph, idx) => (
          <p key={`${paragraph}-${idx}`} className="text-sm text-slate-200 leading-relaxed">
            {paragraph}
          </p>
        ))
      )}
    </div>
  );
};

const MetricChip: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-full border border-slate-700 bg-slate-900/50 px-3 py-1.5 text-xs font-semibold text-slate-200">
    <span className="text-slate-400">{label}: </span>
    <span>{value}</span>
  </div>
);

const SectionIntro: React.FC<{ icon: React.ReactNode; title: string; subtitle: string }> = ({ icon, title, subtitle }) => (
  <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3">
    <div className="mt-0.5 rounded-lg border border-white/10 bg-slate-900/60 p-2 text-slate-200">{icon}</div>
    <div>
      <div className="text-sm font-semibold text-white">{title}</div>
      <div className="mt-1 text-xs leading-relaxed text-slate-400">{subtitle}</div>
    </div>
  </div>
);


const inferOperationalDetail = (items: string[], keywords: string[]): string | null => {
  const match = items.find((item) => keywords.some((keyword) => item.toLowerCase().includes(keyword)));
  if (!match) return null;
  const cleaned = match
    .replace(/^(crew|reset|transport|portability|mobility)\s*[:\-]\s*/i, '')
    .trim();
  return cleaned || match.trim();
};

const inferEffectCategory = (effectInput: string): string => {
  const lowered = effectInput.toLowerCase();
  const match = EFFECT_SUGGESTIONS.find((suggestion) => lowered.includes(suggestion.toLowerCase()));
  return match ?? 'Custom Illusion';
};

const compactPhrase = (value: string, fallback = 'stage illusion'): string => {
  const cleaned = cleanText(value)
    .replace(/[^a-zA-Z0-9\s,\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return fallback;
  return cleaned.length > 110 ? `${cleaned.slice(0, 107).trim()}…` : cleaned;
};

const deriveVisualAnchor = (plan: BuilderPlan, originalEffect: string): string => {
  const combined = [
    originalEffect,
    plan.project_title,
    plan.audience_effect,
    plan.build_concept,
    ...plan.recommended_construction.main_structure,
    plan.dimensions_footprint,
  ]
    .join(' ')
    .toLowerCase();

  const anchorPatterns: Array<[RegExp, string]> = [
    [/vanish|vanishing|disappear/, 'vanishing platform stage illusion'],
    [/appear|appearance|production/, 'appearance platform stage illusion'],
    [/levitat|float|floating|suspension/, 'assistant levitation stage illusion'],
    [/penetrat|sword|blade|spike/, 'penetration cabinet stage illusion'],
    [/teleport|transport|transposition/, 'modular teleportation trunk stage illusion'],
    [/transform|change|costume|metamorphosis/, 'visual transformation stage illusion'],
    [/escape|restraint|locked|chain/, 'escape cabinet stage illusion'],
    [/trunk|crate|box/, 'trunk-based stage illusion'],
    [/cabinet/, 'illusion cabinet stage prop'],
    [/platform|base|deck/, 'raised platform stage illusion'],
  ];

  const matched = anchorPatterns.find(([pattern]) => pattern.test(combined));
  if (matched) return matched[1];

  return compactPhrase(plan.project_title || originalEffect, 'custom stage illusion');
};

const buildVisualContinuityBrief = (plan: BuilderPlan, originalEffect: string): string => {
  const visualAnchor = deriveVisualAnchor(plan, originalEffect);
  const mainStructure = compactPhrase(plan.recommended_construction.main_structure.join(', '), 'practical theatrical structure');
  const materials = compactPhrase(plan.recommended_construction.materials.slice(0, 4).join(', '), 'realistic stage fabrication materials');
  const footprint = compactPhrase(plan.dimensions_footprint, 'stage-ready footprint');

  return [
    `VISUAL CONTINUITY ANCHOR: ${visualAnchor}.`,
    `All generated drawings and concept images must depict the same core illusion concept described in the builder plan, not a generic magic prop.`,
    `Required visual subject: ${compactPhrase(plan.project_title)} — ${compactPhrase(plan.audience_effect)}.`,
    `Visible structure must align with: ${mainStructure}.`,
    `Visual material language must align with: ${materials}.`,
    `Scale and footprint must feel consistent with: ${footprint}.`,
    `Do not change the effect category, prop type, or stage footprint between the plan, blueprint drawings, and concept gallery.`,
  ].join('\n');
};


const asString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((item) => String(item ?? '').trim()).filter(Boolean) : [];

const asNumber = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const normalizeBuilderPlan = (raw: any): BuilderPlan => ({
  project_title: asString(raw?.project_title, 'Illusion Builder Plan'),
  audience_effect: asString(raw?.audience_effect, 'Builder plan generated.'),
  build_concept: asString(raw?.build_concept, 'Concept needs regeneration.'),
  recommended_construction: {
    main_structure: asStringArray(raw?.recommended_construction?.main_structure),
    materials: asStringArray(raw?.recommended_construction?.materials),
    hardware: asStringArray(raw?.recommended_construction?.hardware),
    mobility_modularity: asString(raw?.recommended_construction?.mobility_modularity, 'Not specified'),
  },
  dimensions_footprint: asString(raw?.dimensions_footprint, 'Not specified'),
  mechanism_approach: {
    primary: asString(raw?.mechanism_approach?.primary, 'Not specified'),
    alternate: asString(raw?.mechanism_approach?.alternate, 'Not specified'),
  },
  assembly_overview: asStringArray(raw?.assembly_overview),
  safety_stability_notes: asStringArray(raw?.safety_stability_notes),
  reset_transport_crew: asStringArray(raw?.reset_transport_crew),
  build_complexity: {
    rating_1_to_5: Math.min(5, Math.max(1, asNumber(raw?.build_complexity?.rating_1_to_5, 3))),
    rationale: asString(raw?.build_complexity?.rationale, 'Not specified'),
  },
});

const isUsableBuilderPlan = (plan: BuilderPlan): boolean =>
  Boolean(
    plan.project_title.trim() &&
    plan.build_concept.trim() &&
    plan.recommended_construction.main_structure.length &&
    plan.recommended_construction.materials.length &&
    plan.mechanism_approach.primary.trim() &&
    plan.assembly_overview.length
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
  const [blueprintDrawings, setBlueprintDrawings] = useState<string[]>([]);
  const [imageOptions, setImageOptions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState('');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle');
  const [selectedConceptIndex, setSelectedConceptIndex] = useState<number | null>(null);
  const [activeConceptIndex, setActiveConceptIndex] = useState<number | null>(null);
  const [activeBlueprintIndex, setActiveBlueprintIndex] = useState<number | null>(null);
  const [isGeneratingBlueprints, setIsGeneratingBlueprints] = useState(false);
  const [isGeneratingVisuals, setIsGeneratingVisuals] = useState(false);
  const [openSections, setOpenSections] = useState({
    plan: true,
    construction: false,
    operations: false,
    blueprints: false,
    visuals: false,
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
    setBlueprintDrawings([]);
    setImageOptions([]);
    setError(null);
    setWarning(null);
    setSaveStatus('idle');
    setCopyStatus('idle');
    setSelectedConceptIndex(null);
    setActiveConceptIndex(null);
    setActiveBlueprintIndex(null);
    setIsGeneratingBlueprints(false);
    setIsGeneratingVisuals(false);
    setLoadingStage('');
    setOpenSections({
      plan: true,
      construction: false,
      operations: false,
      blueprints: false,
      visuals: false,
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

  const buildSummary = useMemo(() => {
    if (!builderPlan) return null;

    const transportProfile =
      inferOperationalDetail(builderPlan.reset_transport_crew, ['transport', 'road case', 'truck', 'modular', 'rolling', 'tour']) ||
      transportLimitations.trim() ||
      'Not specified';

    const crewProfile =
      inferOperationalDetail(builderPlan.reset_transport_crew, ['crew', 'assistant', 'operator']) ??
      crewSize;

    const resetProfile =
      inferOperationalDetail(builderPlan.reset_transport_crew, ['reset', 'seconds', 'minute']) ??
      resetRequirement;

    return {
      title: builderPlan.project_title,
      effectCategory: inferEffectCategory(effectInput),
      audienceEffect: builderPlan.audience_effect,
      footprint: builderPlan.dimensions_footprint,
      crew: crewProfile,
      reset: resetProfile,
      budget: budgetLevel,
      complexity: builderPlan.build_complexity.rating_1_to_5,
      complexityRationale: builderPlan.build_complexity.rationale,
      transport: transportProfile,
      materials: materialsPreference.trim() || builderPlan.recommended_construction.materials.slice(0, 3).join(', '),
      mechanism: builderPlan.mechanism_approach.primary || 'Not specified',
    };
  }, [
    builderPlan,
    effectInput,
    budgetLevel,
    crewSize,
    resetRequirement,
    transportLimitations,
    materialsPreference,
  ]);

  const exportBuilderPlanText = useMemo(() => {
    if (!builderPlan) return '';

    const selectedConcept =
      selectedConceptIndex !== null ? `Concept ${String.fromCharCode(65 + selectedConceptIndex)}` : 'None selected';

    const constructionSummary = [
      ...builderPlan.recommended_construction.main_structure,
      ...builderPlan.recommended_construction.materials.map((item) => `Materials: ${item}`),
      ...builderPlan.recommended_construction.hardware.map((item) => `Hardware: ${item}`),
      `Mobility / Modularity: ${builderPlan.recommended_construction.mobility_modularity}`,
    ];

    return [
      'ILLUSION BLUEPRINT',
      `Project Title: ${builderPlan.project_title}`,
      `Effect Category: ${buildSummary?.effectCategory ?? inferEffectCategory(effectInput)}`,
      '',
      'Audience Effect:',
      cleanText(builderPlan.audience_effect),
      '',
      'Build Concept:',
      cleanText(builderPlan.build_concept),
      '',
      'Construction:',
      ...constructionSummary.map((item) => `- ${cleanText(item)}`),
      '',
      'Mechanism Approach:',
      `- Primary: ${cleanText(builderPlan.mechanism_approach.primary)}`,
      `- Alternate: ${cleanText(builderPlan.mechanism_approach.alternate)}`,
      '',
      'Assembly Overview:',
      ...builderPlan.assembly_overview.map((item, idx) => `${idx + 1}. ${cleanText(item)}`),
      '',
      'Safety Notes:',
      ...builderPlan.safety_stability_notes.map((item) => `- ${cleanText(item)}`),
      '',
      'Reset / Transport / Crew:',
      ...builderPlan.reset_transport_crew.map((item) => `- ${cleanText(item)}`),
      '',
      `Build Complexity: ${builderPlan.build_complexity.rating_1_to_5} / 5 — ${cleanText(builderPlan.build_complexity.rationale)}`,
      `Stage Footprint: ${cleanText(builderPlan.dimensions_footprint)}`,
      `Budget Level: ${budgetLevel}`,
      `Materials Preference: ${buildSummary?.materials ?? (materialsPreference.trim() || 'Not specified')}`,
      `Selected Concept: ${selectedConcept}`,
    ]
      .filter(Boolean)
      .join('\n');
  }, [
    builderPlan,
    buildSummary,
    budgetLevel,
    effectInput,
    materialsPreference,
    selectedConceptIndex,
  ]);

  const handleCopy = async () => {
    if (!exportBuilderPlanText) return;
    try {
      await navigator.clipboard.writeText(exportBuilderPlanText);
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 1500);
    } catch {
      // ignore clipboard permission issues
    }
  };

  const handleSave = async () => {
    if (!builderPlan || !exportBuilderPlanText) return;
    try {
      await saveIdea({
        type: 'text',
        title: `Illusion Builder Plan — ${builderPlan.project_title}`,
        content: exportBuilderPlanText,
        tags: ['illusion-blueprint', 'builder-plan'],
      });
      void trackClientEvent({ tool: 'illusion_blueprint', action: 'illusion_blueprint_save_success', outcome: 'SUCCESS_NOT_CHARGED', metadata: { project_title: builderPlan?.project_title || '' } });
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
    setBlueprintDrawings([]);
    setImageOptions([]);
    setSaveStatus('idle');
    setCopyStatus('idle');
    setSelectedConceptIndex(null);
    setActiveConceptIndex(null);
    setActiveBlueprintIndex(null);
    setIsGeneratingBlueprints(false);
    setIsGeneratingVisuals(false);

    void trackClientEvent({ tool: 'illusion_blueprint', action: 'illusion_blueprint_start', metadata: { venueScale, performerStyle, budgetLevel, crewSize, resetRequirement } });

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
      const rawPlan = await generateStructuredResponse(
        planPrompt,
        PLAN_SYSTEM_INSTRUCTION,
        planSchema,
        user,
        { maxOutputTokens: 2400, speedMode: 'full' }
      );
      const plan = normalizeBuilderPlan(rawPlan);

      if (!isUsableBuilderPlan(plan)) {
        throw new Error('Illusion Blueprint returned an incomplete builder plan. Please try again.');
      }

      setBuilderPlan(plan);
      void trackClientEvent({ tool: 'illusion_blueprint', action: 'illusion_blueprint_success', outcome: 'SUCCESS_NOT_CHARGED', metadata: { project_title: plan?.project_title || '', venueScale, performerStyle } });
      setOpenSections({
        plan: true,
        construction: false,
        operations: false,
        blueprints: false,
        visuals: false,
      });

      const visualContinuityBrief = buildVisualContinuityBrief(plan, effectInput);
      const visualAnchor = deriveVisualAnchor(plan, effectInput);

      setLoadingStage('Generating blueprint drawings…');
      setIsGeneratingBlueprints(true);
      const blueprintPrompt = [
        BLUEPRINT_STYLE_GUIDE,
        '',
        visualContinuityBrief,
        '',
        `Project title: ${plan.project_title}`,
        `Audience effect: ${plan.audience_effect}`,
        `Build concept: ${plan.build_concept}`,
        `Main structure: ${plan.recommended_construction.main_structure.join(', ')}`,
        `Materials: ${plan.recommended_construction.materials.join(', ')}`,
        `Hardware: ${plan.recommended_construction.hardware.join(', ')}`,
        `Dimensions / footprint: ${plan.dimensions_footprint}`,
        `Primary mechanism direction: ${plan.mechanism_approach.primary}`,
        `Mobility / modularity: ${plan.recommended_construction.mobility_modularity}`,
        `Blueprint continuity requirement: Every drawing must be a technical view of the same ${visualAnchor}; do not introduce unrelated boxes, tables, cabinets, or platforms unless they are part of this plan.`,
        'Create technical drawing style images suitable for illusion build planning.',
      ].join('\n');

      try {
        const drawings = await generateImages(blueprintPrompt, '16:9', 2, user);
        setBlueprintDrawings(drawings);
      } catch {
        setBlueprintDrawings([]);
      } finally {
        setIsGeneratingBlueprints(false);
      }

      setLoadingStage('Generating visual concepts…');
      setIsGeneratingVisuals(true);
      const imagePrompt = [
        IMAGE_STYLE_GUIDE,
        '',
        visualContinuityBrief,
        '',
        `Project title: ${plan.project_title}`,
        `Audience effect: ${plan.audience_effect}`,
        `Build concept: ${plan.build_concept}`,
        `Dimensions / footprint: ${plan.dimensions_footprint}`,
        `Materials direction: ${plan.recommended_construction.materials.join(', ')}`,
        `Mobility / modularity: ${plan.recommended_construction.mobility_modularity}`,
        `Venue / scale: ${venueScale}`,
        `Performer style: ${performerStyle}`,
        `Concept continuity requirement: Produce three distinct visual variations of the same ${visualAnchor}. Vary finish, trim, framing, and staging only; do not change the illusion type or replace it with unrelated props.`,
        'Produce three distinct but clearly related design directions that match the builder plan above.',
      ].join('\n');

      try {
        const images = await generateImages(imagePrompt, '16:9', 3, user);
        setImageOptions(images);
      } catch (imageErr: any) {
        setWarning(imageErr?.message || 'Builder plan generated, but visual concepts could not be created this time.');
      } finally {
        setIsGeneratingVisuals(false);
      }
    } catch (err: any) {
      void trackClientEvent({ tool: 'illusion_blueprint', action: 'illusion_blueprint_error', outcome: 'ERROR_UPSTREAM', metadata: { venueScale, performerStyle, message: err?.message || 'unknown' } });
      setError(err?.message || 'Unable to generate the builder plan.');
    } finally {
      setLoadingStage('');
      setIsLoading(false);
    }
  };

  return (
    <>
      {activeBlueprintIndex !== null && blueprintDrawings[activeBlueprintIndex] ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Blueprint drawing preview"
          onClick={() => setActiveBlueprintIndex(null)}
        >
          <div
            className="w-full max-w-6xl overflow-hidden rounded-2xl border border-white/10 bg-slate-950 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Blueprint Preview</div>
                <div className="mt-1 text-lg font-bold text-white">{`Blueprint ${String.fromCharCode(65 + activeBlueprintIndex)} — ${builderPlan ? deriveVisualAnchor(builderPlan, effectInput) : 'Matched Technical View'}`}</div>
              </div>
              <button
                type="button"
                onClick={() => setActiveBlueprintIndex(null)}
                className="rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:border-slate-500"
              >
                Close
              </button>
            </div>

            <div className="bg-slate-950/60 p-4">
              <div className="overflow-hidden rounded-xl border border-white/10 bg-slate-900/50">
                <img
                  src={blueprintDrawings[activeBlueprintIndex]}
                  alt={`Blueprint drawing Blueprint ${String.fromCharCode(65 + activeBlueprintIndex)}`}
                  className="h-auto max-h-[78vh] w-full object-contain"
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeConceptIndex !== null && imageOptions[activeConceptIndex] ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Visual concept preview"
          onClick={() => setActiveConceptIndex(null)}
        >
          <div
            className="w-full max-w-5xl overflow-hidden rounded-2xl border border-white/10 bg-slate-950 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Concept Preview</div>
                <div className="mt-1 text-lg font-bold text-white">{`Concept ${String.fromCharCode(65 + activeConceptIndex)}`}</div>
              </div>
              <button
                type="button"
                onClick={() => setActiveConceptIndex(null)}
                className="rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:border-slate-500"
              >
                Close
              </button>
            </div>

            <div className="bg-slate-950/60 p-4">
              <div className="overflow-hidden rounded-xl border border-white/10 bg-slate-900/50">
                <img
                  src={imageOptions[activeConceptIndex]}
                  alt={`Illusion concept Concept ${String.fromCharCode(65 + activeConceptIndex)}`}
                  className="h-auto max-h-[72vh] w-full object-contain"
                />
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-slate-400">Inspect the concept at a larger size, then choose it as the preferred build direction.</div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedConceptIndex(activeConceptIndex)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                      selectedConceptIndex === activeConceptIndex
                        ? 'border border-violet-400/70 bg-violet-500/20 text-violet-100'
                        : 'border border-slate-700 bg-slate-900/70 text-slate-200 hover:border-violet-300/60 hover:text-violet-100'
                    }`}
                  >
                    {selectedConceptIndex === activeConceptIndex ? 'Selected for Build' : 'Select Concept'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveConceptIndex(null)}
                    className="rounded-full border border-slate-700 bg-slate-900/70 px-4 py-2 text-sm font-semibold text-slate-200 transition-colors hover:border-slate-500"
                  >
                    Close Preview
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

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

      <div className="flex-1 grid grid-cols-1 xl:grid-cols-2 gap-6 overflow-hidden">
        <div className="min-w-0 rounded-2xl border border-slate-800 bg-slate-950/20 p-4 md:p-5 overflow-y-auto">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="text-xs text-slate-400">Curated demo presets:</div>
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
              className="w-full sm:w-auto sm:ml-auto px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border bg-slate-900/40 border-slate-700 text-slate-200 hover:border-slate-500"
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

        <div className="min-w-0 rounded-2xl border border-slate-800 bg-slate-950/20 overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-slate-800 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
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
                  <div className="flex flex-wrap items-stretch gap-2">
                    {[
                      ['plan', 'Overview'],
                      ['construction', 'Construction'],
                      ['operations', 'Safety & Ops'],
                      ['blueprints', 'Blueprint Drawings'],
                      ['visuals', 'Visual Concepts'],
                    ].map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          const el = document.getElementById(`ib-${key}`);
                          el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }}
                        className="px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border bg-slate-900/40 border-slate-700 text-slate-300 hover:border-slate-500 whitespace-normal text-center leading-tight"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {buildSummary ? (
                  <section className="rounded-2xl border border-violet-400/20 bg-gradient-to-br from-slate-900/95 via-slate-900/90 to-violet-950/30 p-4 md:p-5 shadow-[0_12px_40px_-24px_rgba(139,92,246,0.55)]">
                    <div className="flex flex-col gap-4">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 rounded-xl border border-violet-400/30 bg-violet-500/10 p-2 text-violet-200">
                          <BlueprintIcon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-violet-200/80">
                            Builder Summary
                          </div>
                          <h3 className="mt-1 text-xl font-bold text-white font-cinzel">
                            {buildSummary.title}
                          </h3>
                          <p className="mt-2 text-sm leading-relaxed text-slate-300 max-w-3xl">
                            {buildSummary.audienceEffect}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-stretch gap-2">
                        {[
                          `Complexity ${buildSummary.complexity}/5`,
                          `Crew ${buildSummary.crew}`,
                          `Reset ${buildSummary.reset}`,
                          `Budget ${buildSummary.budget}`,
                        ].map((item) => (
                          <span
                            key={item}
                            className="rounded-full border border-violet-400/25 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200"
                          >
                            {item}
                          </span>
                        ))}
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Effect Category</div>
                          <p className="mt-1 text-sm text-slate-100">{buildSummary.effectCategory}</p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Stage Footprint</div>
                          <p className="mt-1 text-sm text-slate-100">{buildSummary.footprint}</p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Transport Profile</div>
                          <p className="mt-1 text-sm text-slate-100">{buildSummary.transport}</p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Materials Preference</div>
                          <p className="mt-1 text-sm text-slate-100">{buildSummary.materials}</p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 md:col-span-2">
                          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Primary Mechanism Direction</div>
                          <p className="mt-1 text-sm text-slate-100 leading-relaxed">{buildSummary.mechanism}</p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 md:col-span-2">
                          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Build Complexity Notes</div>
                          <p className="mt-1 text-sm text-slate-300 leading-relaxed">{buildSummary.complexityRationale}</p>
                        </div>
                      </div>
                    </div>
                  </section>
                ) : null}

                <div id="ib-plan">
                  <CollapsibleCard
                    title={builderPlan.project_title}
                    subtitle="Audience effect, concept direction, and build complexity"
                    isOpen={openSections.plan}
                    onToggle={() => toggleSection('plan')}
                  >
                    <div className="space-y-5">
                      <SectionIntro
                        icon={<FileTextIcon className="h-4 w-4" />}
                        title="Overview"
                        subtitle="Start with the audience experience and the overall construction direction before reviewing fabrication details."
                      />

                      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                        <div className="text-xs text-slate-400 mb-2">Audience Effect</div>
                        <TextBlock text={builderPlan.audience_effect} leadIn="What the audience sees" />
                      </div>

                      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                        <div className="text-xs text-slate-400 mb-2">Build Concept</div>
                        <TextBlock text={builderPlan.build_concept} leadIn="How the structure is approached" />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="rounded-xl border border-slate-800 bg-slate-950/20 p-4">
                          <div className="text-xs text-slate-400">Dimensions / Footprint</div>
                          <p className="text-sm text-slate-200 mt-2 leading-relaxed">{cleanText(builderPlan.dimensions_footprint)}</p>
                        </div>
                        <div className="rounded-xl border border-slate-800 bg-slate-950/20 p-4 space-y-3">
                          <div className="text-xs text-slate-400">Build Complexity</div>
                          <div className="flex flex-wrap items-stretch gap-2">
                            <MetricChip label="Complexity" value={`${builderPlan.build_complexity.rating_1_to_5} / 5`} />
                            <MetricChip label="Crew" value={buildSummary?.crew ?? crewSize} />
                            <MetricChip label="Reset" value={buildSummary?.reset ?? resetRequirement} />
                          </div>
                          <p className="text-sm text-slate-300 leading-relaxed">{cleanText(builderPlan.build_complexity.rationale)}</p>
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
                    <div className="space-y-5">
                      <SectionIntro
                        icon={<ChecklistIcon className="h-4 w-4" />}
                        title="Construction Breakdown"
                        subtitle="Review fabrication priorities, materials, and mechanism options in a format that is easy to scan in the shop."
                      />

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="rounded-xl border border-slate-800 bg-slate-950/20 p-4">
                          <div className="text-xs text-slate-400 mb-2">Main Structure</div>
                          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400 mb-3">What the builder should prioritize</div>
                          <DetailList items={builderPlan.recommended_construction.main_structure.map(cleanText)} />
                        </div>
                        <div className="rounded-xl border border-slate-800 bg-slate-950/20 p-4">
                          <div className="text-xs text-slate-400 mb-2">Materials</div>
                          <DetailList items={builderPlan.recommended_construction.materials.map(cleanText)} />
                        </div>
                        <div className="rounded-xl border border-slate-800 bg-slate-950/20 p-4">
                          <div className="text-xs text-slate-400 mb-2">Hardware</div>
                          <DetailList items={builderPlan.recommended_construction.hardware.map(cleanText)} />
                        </div>
                        <div className="rounded-xl border border-slate-800 bg-slate-950/20 p-4">
                          <div className="text-xs text-slate-400 mb-2">Mobility / Modularity</div>
                          <TextBlock text={builderPlan.recommended_construction.mobility_modularity} leadIn="Transport and breakdown approach" />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="rounded-xl border border-slate-800 bg-slate-950/20 p-4">
                          <div className="text-xs text-slate-400 mb-2">Primary Mechanism Approach</div>
                          <TextBlock text={builderPlan.mechanism_approach.primary} leadIn="Preferred direction" />
                        </div>
                        <div className="rounded-xl border border-slate-800 bg-slate-950/20 p-4">
                          <div className="text-xs text-slate-400 mb-2">Alternate Mechanism Approach</div>
                          <TextBlock text={builderPlan.mechanism_approach.alternate} leadIn="Backup direction" />
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-800 bg-slate-950/20 p-4">
                        <div className="text-xs text-slate-400 mb-2">Assembly Overview</div>
                        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400 mb-3">Ordered build path</div>
                        <ol className="list-decimal pl-5 text-sm text-slate-200 space-y-2">
                          {builderPlan.assembly_overview.map((item, idx) => (
                            <li key={`${item}-${idx}`} className="leading-relaxed">{cleanText(item)}</li>
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
                    <div className="space-y-5">
                      <SectionIntro
                        icon={<ShieldIcon className="h-4 w-4" />}
                        title="Operations and Safety"
                        subtitle="Use this section to review stability, service access, reset expectations, and real-world operating constraints."
                      />

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="rounded-xl border border-slate-800 bg-slate-950/20 p-4">
                          <div className="text-xs text-slate-400 mb-2">Safety / Stability Notes</div>
                          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400 mb-3">What the builder should prioritize</div>
                          <DetailList items={builderPlan.safety_stability_notes.map(cleanText)} />
                        </div>
                        <div className="rounded-xl border border-slate-800 bg-slate-950/20 p-4">
                          <div className="text-xs text-slate-400 mb-2">Reset / Transport / Crew</div>
                          <div className="flex flex-wrap gap-2 mb-3">
                            <MetricChip label="Crew" value={buildSummary?.crew ?? crewSize} />
                            <MetricChip label="Reset" value={buildSummary?.reset ?? resetRequirement} />
                            <MetricChip label="Budget" value={budgetLevel} />
                          </div>
                          <DetailList items={builderPlan.reset_transport_crew.map(cleanText)} />
                        </div>
                      </div>
                    </div>
                  </CollapsibleCard>
                </div>

                <div id="ib-blueprints">
                  <CollapsibleCard
                    title="Blueprint Drawings"
                    subtitle="Technical concept drawings for build planning"
                    isOpen={openSections.blueprints}
                    onToggle={() => toggleSection('blueprints')}
                    actions={
                      isGeneratingBlueprints ? (
                        <div className="text-[11px] text-violet-300">Generating…</div>
                      ) : blueprintDrawings.length ? (
                        <div className="text-[11px] text-slate-500">{blueprintDrawings.length} drawings</div>
                      ) : null
                    }
                  >
                    <div className="space-y-5">
                      <SectionIntro
                        icon={<BlueprintIcon className="h-4 w-4" />}
                        title="Technical Drawing Set"
                        subtitle="Blueprint-style concept drawings to help visualize structure, layout, and mechanism direction."
                      />
                      {builderPlan ? (
                        <div className="rounded-xl border border-sky-400/20 bg-sky-500/10 px-3.5 py-3 text-xs leading-relaxed text-sky-100">
                          <span className="font-semibold">Continuity lock:</span> these drawings are prompted as technical views of the same concept: <span className="font-semibold">{deriveVisualAnchor(builderPlan, effectInput)}</span>.
                        </div>
                      ) : null}
                      {isGeneratingBlueprints ? (
                        <ImageGenerationCard label="Generating blueprint drawings" />
                      ) : blueprintDrawings.length ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {blueprintDrawings.map((src, idx) => {
                            const drawingLabel = `Blueprint ${String.fromCharCode(65 + idx)}`;
                            const continuityLabel = builderPlan ? `${drawingLabel} — ${deriveVisualAnchor(builderPlan, effectInput)}` : drawingLabel;
                            return (
                              <div
                                key={`${src.slice(0, 30)}-${idx}`}
                                className="group relative overflow-hidden rounded-xl border border-white/10 bg-white/5 text-left transition-all duration-200 hover:border-sky-300/60 hover:shadow-md hover:shadow-black/20 hover:-translate-y-0.5"
                              >
                                <button
                                  type="button"
                                  onClick={() => setActiveBlueprintIndex(idx)}
                                  className="block w-full text-left focus:outline-none focus:ring-2 focus:ring-inset focus:ring-sky-400/70"
                                >
                                  <div className="aspect-[4/3] overflow-hidden bg-slate-950/40">
                                    <img
                                      src={src}
                                      alt={`Blueprint drawing ${continuityLabel}`}
                                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                                    />
                                  </div>
                                </button>

                                <div className="p-3">
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <div className="text-sm font-semibold text-slate-100">{drawingLabel}</div>
                                      <div className="mt-1 text-xs text-slate-400">
                                        Matched technical view for {builderPlan ? deriveVisualAnchor(builderPlan, effectInput) : 'this builder plan'}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="mt-3 flex items-center justify-between gap-3">
                                    <span className="text-[11px] text-slate-500">Technical blueprint drawing</span>
                                    <button
                                      type="button"
                                      onClick={() => setActiveBlueprintIndex(idx)}
                                      className="rounded-full border border-slate-700 bg-slate-900/50 px-2.5 py-1 text-[11px] font-semibold text-slate-300 transition-colors hover:border-sky-300/50 hover:text-sky-200"
                                    >
                                      View Larger
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950/20 p-4 text-sm text-slate-400">
                          No blueprint drawings were returned on this attempt.
                        </div>
                      )}
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
                      isGeneratingVisuals ? (
                        <div className="text-[11px] text-violet-300">Generating…</div>
                      ) : imageOptions.length ? (
                        <div className="text-[11px] text-slate-500">{imageOptions.length} options</div>
                      ) : null
                    }
                  >
                    <div className="space-y-5">
                      <SectionIntro
                        icon={<ImageIcon className="h-4 w-4" />}
                        title="Concept Gallery"
                        subtitle="Compare build directions visually, then select the concept that best matches the practical plan above."
                      />
                      {builderPlan ? (
                        <div className="rounded-xl border border-violet-400/20 bg-violet-500/10 px-3.5 py-3 text-xs leading-relaxed text-violet-100">
                          <span className="font-semibold">Visual continuity:</span> all concepts are prompted as variations of <span className="font-semibold">{deriveVisualAnchor(builderPlan, effectInput)}</span>, using the same audience effect, footprint, and material direction from the builder plan.
                        </div>
                      ) : null}
                    {isGeneratingVisuals ? (
                      <ImageGenerationCard label="Generating visual concepts" />
                    ) : imageOptions.length ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
                        {imageOptions.map((src, idx) => {
                          const conceptLabel = `Concept ${String.fromCharCode(65 + idx)}`;
                          const continuityLabel = builderPlan ? `${conceptLabel} — ${deriveVisualAnchor(builderPlan, effectInput)}` : conceptLabel;
                          const isSelected = selectedConceptIndex === idx;

                          return (
                            <div
                              key={`${src.slice(0, 30)}-${idx}`}
                              className={`group relative overflow-hidden rounded-xl border bg-white/5 text-left transition-all duration-200 ${
                                isSelected
                                  ? 'border-violet-400 ring-2 ring-violet-400 shadow-lg shadow-violet-500/20'
                                  : 'border-white/10 hover:border-violet-300/60 hover:shadow-md hover:shadow-black/20 hover:-translate-y-0.5'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => setActiveConceptIndex(idx)}
                                className="block w-full text-left focus:outline-none focus:ring-2 focus:ring-inset focus:ring-violet-400/70"
                              >
                                <div className="aspect-[4/3] overflow-hidden bg-slate-950/40">
                                  <img
                                    src={src}
                                    alt={`Illusion concept ${continuityLabel}`}
                                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                                  />
                                </div>
                              </button>

                              <div className="p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="text-sm font-semibold text-slate-100">{conceptLabel}</div>
                                    <div className="mt-1 text-xs text-slate-400">
                                      {isSelected ? 'Selected matched variation' : `Variation of ${builderPlan ? deriveVisualAnchor(builderPlan, effectInput) : 'this builder plan'}`}
                                    </div>
                                  </div>
                                  {isSelected ? (
                                    <span className="shrink-0 rounded-full border border-violet-400/70 bg-violet-500/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-violet-200">
                                      Selected for Build
                                    </span>
                                  ) : null}
                                </div>

                                <div className="mt-3 flex items-center justify-between gap-3">
                                  <span className="text-[11px] text-slate-500">Builder concept image</span>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setActiveConceptIndex(idx)}
                                      className="rounded-full border border-slate-700 bg-slate-900/50 px-2.5 py-1 text-[11px] font-semibold text-slate-300 transition-colors hover:border-violet-300/50 hover:text-violet-200"
                                    >
                                      View Larger
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setSelectedConceptIndex(idx)}
                                      aria-pressed={isSelected}
                                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                                        isSelected
                                          ? 'bg-violet-500/20 text-violet-200 border border-violet-400/60'
                                          : 'border border-slate-700 bg-slate-900/50 text-slate-300 hover:border-violet-300/50 hover:text-violet-200'
                                      }`}
                                    >
                                      {isSelected ? 'Selected' : 'Select Concept'}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950/20 p-4 text-sm text-slate-400">
                        The builder plan completed, but concept images were not returned on this attempt.
                      </div>
                    )}
                    </div>
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
                      Export a clean builder brief, save it to your vault, or move it into your workflow.
                    </div>
                  }
                />

                <div className="flex flex-wrap items-stretch gap-2">
                  <div className="w-full text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Export Builder Plan</div>
                  <CohesionActions
                    content={exportBuilderPlanText}
                    defaultTitle={builderPlan.project_title}
                    defaultTags={['illusion-blueprint', 'builder-plan']}
                    ideaType="text"
                    compact
                  />
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="w-full sm:w-auto px-3 py-2 rounded-md text-sm font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200"
                  >
                    {copyStatus === 'copied' ? 'Copied!' : 'Copy Builder Plan'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
    </>
  );
};

export default IllusionBlueprint;
