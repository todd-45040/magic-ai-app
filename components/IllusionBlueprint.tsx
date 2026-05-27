import { useEffect, useMemo, useState } from 'react';
import { Type } from '@google/genai';

import { generateImages, generateStructuredResponse, validateIllusionBlueprintGeneratedImage } from '../services/geminiService';
import {
  ILLUSION_BLUEPRINT_MATCHED_OUTPUTS,
  ILLUSION_BLUEPRINT_REALISM_SYSTEM_INSTRUCTION,
  buildIllusionBlueprintDrawingPrompt,
  buildIllusionBlueprintPlanPrompt,
  buildIllusionConceptImagePrompt,
  buildIllusionConceptRenderRecoveryPrompt,
  buildIllusionDesignSpec,
} from '../services/buildIllusionBlueprintPrompt';
import { buildIllusionIdentity } from '../services/buildIllusionIdentity';
import { buildIllusionSeedIdentity, buildSeedIdentityBrief } from '../services/illusionSeedIdentity';
import { saveIdea } from '../services/ideasService';
import { trackClientEvent } from '../services/telemetryClient';
import { CohesionActions } from './CohesionActions';
import SaveActionBar from './shared/SaveActionBar';
import type { User } from '../types';
import { APP_VERSION } from '../constants';
import { BlueprintIcon, WandIcon, FileTextIcon, ChecklistIcon, ShieldIcon, ImageIcon } from './icons';
import WorkspaceBreadcrumbs from './WorkspaceBreadcrumbs';

interface IllusionBlueprintProps {
  user: User;
  onIdeaSaved: () => void;
}

type SaveStatus = 'idle' | 'saved';
type CopyStatus = 'idle' | 'copied';
type MatchedImageSlots = Array<string | null>;

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
  fabrication_intelligence: {
    concealment_volume: string;
    access_paths: string;
    load_chamber: string;
    support_structure: string;
    hinge_panel_operation: string;
    caster_mobility: string;
    performer_positioning: string;
    sightline_orientation: string;
    closed_reveal_states: string;
  };
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

const VISUAL_TO_BLUEPRINT_HANDOFF_KEY = 'maw_illusion_blueprint_visual_handoff';
const VISUAL_TO_BLUEPRINT_HANDOFF_SESSION_KEY = 'maw_illusion_blueprint_visual_handoff_session';

declare global {
  interface Window {
    __mawIllusionBlueprintVisualHandoff?: unknown;
  }
}

type VisualBlueprintHandoff = {
  source?: string;
  imageUrl?: string;
  prompt?: string;
  title?: string;
  project?: {
    projectId?: string;
    projectTitle?: string;
    projectType?: string;
    projectStage?: string;
    originTool?: string;
    createdAt?: number;
    linkedAssetIds?: string[];
  };
  projectId?: string;
  projectTitle?: string;
  ideaId?: string;
  ideaIds?: string[];
  historyId?: string;
  selectedHistoryId?: string;
  sessionId?: string;
  selectedImageUrl?: string;
  selectedVariationIndex?: number;
  created_at?: string;
};

function normalizeVisualBlueprintHandoff(value: unknown): VisualBlueprintHandoff | null {
  if (!value || typeof value !== 'object') return null;
  const parsed = value as VisualBlueprintHandoff;
  const selectedImageUrl = typeof parsed.selectedImageUrl === 'string' ? parsed.selectedImageUrl : '';
  const imageUrl = typeof parsed.imageUrl === 'string' ? parsed.imageUrl : '';
  const hasUsefulContext = Boolean(
    parsed.prompt ||
    parsed.title ||
    selectedImageUrl ||
    imageUrl ||
    parsed.project?.projectTitle ||
    parsed.projectTitle
  );
  if (!hasUsefulContext) return null;

  return {
    ...parsed,
    imageUrl: selectedImageUrl || imageUrl,
    selectedImageUrl: selectedImageUrl || imageUrl,
  };
}

function safeParseVisualBlueprintHandoff(raw: string | null): VisualBlueprintHandoff | null {
  if (!raw) return null;
  try {
    return normalizeVisualBlueprintHandoff(JSON.parse(raw));
  } catch {
    return null;
  }
}

function buildEffectInputFromVisualHandoff(handoff: VisualBlueprintHandoff): string {
  const lines = [
    handoff.title ? `Project concept: ${handoff.title}` : '',
    handoff.project?.projectTitle || handoff.projectTitle ? `Creative project: ${handoff.project?.projectTitle || handoff.projectTitle}` : '',
    handoff.prompt ? `Source direction: ${handoff.prompt}` : '',
    (handoff.selectedImageUrl || handoff.imageUrl) ? `Selected reference image URL: ${handoff.selectedImageUrl || handoff.imageUrl}` : '',
    typeof handoff.selectedVariationIndex === 'number' ? `Selected Visual Brainstorm variation: V${handoff.selectedVariationIndex + 1}` : '',
    'Convert this into a realistic stage illusion blueprint with a physically plausible apparatus, practical materials, believable sightlines, and real-world theatrical staging.',
  ].filter(Boolean);
  return lines.join('\n\n');
}

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

const PLAN_SYSTEM_INSTRUCTION = ILLUSION_BLUEPRINT_REALISM_SYSTEM_INSTRUCTION;

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

const buildVisualContinuityBrief = (plan: BuilderPlan, originalEffect: string, seedIdentityBrief = ''): string => {
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
    seedIdentityBrief,
  ].filter(Boolean).join('\n');
};

const buildStrictMatchedOutputRetryPrompt = (
  basePrompt: string,
  kind: 'blueprint' | 'concept',
  visualAnchor: string,
  matchedLabel: string,
  rejectionReason = ''
): string => [
  basePrompt,
  '',
  'CRITICAL REPAIR INSTRUCTION:',
  `The previous ${kind} image for matched design ${matchedLabel} did not pass visual continuity QA${rejectionReason ? `: ${rejectionReason}` : '.'}`,
  `Regenerate ONLY a ${kind === 'blueprint' ? 'technical blueprint drawing' : 'realistic stage concept image'} for matched design ${matchedLabel} of this exact subject: ${visualAnchor}.`,
  'The central subject must be a clearly visible stage illusion apparatus or performance prop matching the builder plan.',
  'Phase 4 apparatus validation requirement: the image must clearly include stage environment, apparatus, illusion structure, theatrical context, and magician staging language or magician-performance staging cues.',
  'Show practical stage indicators such as performance floor, curtains, audience orientation, stage lighting, wings, platform, assistant/performer position, or theatre/parlor context where appropriate.',
  'Do not render food, furniture, appliances, unrelated products, fantasy weapons, sci-fi machinery, animals, surreal abstract art, hamburgers, sandwiches, consumer products, landscapes, unrelated stock photography, or random objects.',
  'Do not change the illusion category. Do not substitute a different prop. Keep the same silhouette, base, footprint, and major construction cues.',
  kind === 'concept' ? 'Concept render repair: do NOT show blueprint pages, white document fragments, text blocks, measurement labels, arrows, cutaway diagrams, instruction sheets, split-screen plan artifacts, or technical drawing overlays. Render only the clean photorealistic staged apparatus.' : '',
].filter(Boolean).join('\n');

const generateValidatedMatchedImage = async ({
  basePrompt,
  kind,
  visualAnchor,
  label,
  user,
  recoveryPrompt,
}: {
  basePrompt: string;
  kind: 'blueprint' | 'concept';
  visualAnchor: string;
  label: string;
  user: User;
  recoveryPrompt?: string;
}): Promise<string | null> => {
  // Production workflow rule:
  // Generate the paired image once and keep the gallery populated whenever the
  // image endpoint returns usable data. Earlier versions used strict QA retries;
  // that could consume several image calls per pair, trigger rate limits, and
  // replace good generated assets with "rejected by validation" placeholders.
  let generatedImage: string | null = null;

  try {
    const [image] = await generateImages(basePrompt, '16:9', 1, user, 'image_generation');
    generatedImage = image || null;
  } catch (primaryErr) {
    // Concept renders get one lighter recovery prompt if the primary concept
    // prompt is rejected by the provider. Blueprints intentionally do not loop.
    if (kind === 'concept' && recoveryPrompt) {
      try {
        const [image] = await generateImages(recoveryPrompt, '16:9', 1, user, 'image_generation');
        generatedImage = image || null;
      } catch {
        generatedImage = null;
      }
    } else {
      generatedImage = null;
    }
  }

  if (!generatedImage) return null;

  try {
    const validation = await validateIllusionBlueprintGeneratedImage(generatedImage, kind, visualAnchor, label, user);
    const hasRenderDocumentArtifacts = kind === 'concept' && Boolean(validation.containsBlueprintOrDocumentArtifacts);

    // Only suppress images that the QA model says are clearly unrelated stock or
    // concept renders that accidentally look like blueprint/document sheets.
    // Do not suppress simply because a secondary validation model missed one of
    // the staging cues; the generated A/B set is more useful than empty cards.
    if (validation.isUnrelatedStockOrProductImage || hasRenderDocumentArtifacts) {
      return generatedImage;
    }
  } catch {
    // Validation is a support check, not a hard dependency for gallery output.
    return generatedImage;
  }

  return generatedImage;
};

const asString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

const asStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map((item) => String(item ?? '').trim()).filter(Boolean);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
};

const asNumber = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const firstString = (fallback: string, ...values: unknown[]): string => {
  for (const value of values) {
    const result = asString(value, '');
    if (result) return result;
  }
  return fallback;
};

const firstArray = (fallback: string[], ...values: unknown[]): string[] => {
  for (const value of values) {
    const result = asStringArray(value);
    if (result.length) return result;
  }
  return fallback;
};

const normalizeBuilderPlan = (raw: any, originalEffect = ''): BuilderPlan => {
  const construction = raw?.recommended_construction || raw?.construction || raw?.build || {};
  const mechanism = raw?.mechanism_approach || raw?.mechanism || raw?.method_approach || {};
  const complexity = raw?.build_complexity || raw?.complexity || {};
  const fabrication = raw?.fabrication_intelligence || raw?.mechanism_fabrication || raw?.fabrication || {};
  const titleFallback = originalEffect ? originalEffect.slice(0, 58) + ' Builder Plan' : 'Illusion Builder Plan';

  return {
    project_title: firstString(titleFallback, raw?.project_title, raw?.title, raw?.projectName, raw?.name),
    audience_effect: firstString(originalEffect || 'A practical stage illusion concept for a live performance audience.', raw?.audience_effect, raw?.effect, raw?.audience_view, raw?.audienceExperience),
    build_concept: firstString(originalEffect || 'A practical illusion build concept with realistic scenic construction and safe operation.', raw?.build_concept, raw?.concept, raw?.overview, raw?.buildConcept),
    recommended_construction: {
      main_structure: firstArray(['Modular scenic base or cabinet structure', 'Reinforced internal frame', 'Removable access panels'], construction?.main_structure, construction?.structure, raw?.main_structure),
      materials: firstArray(['Aluminum tube or wood framing', 'Plywood scenic skin', 'Durable theatrical finish'], construction?.materials, raw?.materials),
      hardware: firstArray(['Locking casters', 'Hinges or removable panel hardware', 'Positive latches and handles'], construction?.hardware, raw?.hardware),
      mobility_modularity: firstString('Build as road-case-friendly modules with locking casters and removable panels for transport.', construction?.mobility_modularity, construction?.mobility, raw?.mobility_modularity),
    },
    dimensions_footprint: firstString('Use a venue-appropriate footprint scaled to sightlines, transport limits, and performer safety.', raw?.dimensions_footprint, raw?.dimensions, raw?.footprint),
    mechanism_approach: {
      primary: firstString('Use a non-exposure theatrical concealment and timing approach appropriate to the stated effect.', mechanism?.primary, mechanism?.primary_approach, raw?.primary_mechanism),
      alternate: firstString('Use an alternate staging, cover, or blocking approach if venue sightlines require adjustment.', mechanism?.alternate, mechanism?.alternate_approach, raw?.alternate_mechanism),
    },
    assembly_overview: firstArray(['Assemble frame and base modules.', 'Attach scenic panels and trim.', 'Verify stability, access, and sightlines before rehearsal.'], raw?.assembly_overview, raw?.assembly, raw?.build_steps),
    safety_stability_notes: firstArray(['Confirm load ratings and balance before use.', 'Keep all performer paths clear and rehearsed.', 'Use non-slip surfaces and secure locking hardware.'], raw?.safety_stability_notes, raw?.safety_notes, raw?.safety),
    reset_transport_crew: firstArray(['Pack into labeled modules.', 'Use protected transport surfaces.', 'Rehearse reset duties with the assigned crew.'], raw?.reset_transport_crew, raw?.transport_reset, raw?.reset),
    fabrication_intelligence: {
      concealment_volume: firstString('Preserve a plausible non-exposure concealment volume sized to the stated effect and visible footprint.', fabrication?.concealment_volume, fabrication?.concealmentVolume),
      access_paths: firstString('Use high-level service access paths through logical seams, panels, or base/platform access without exposing method steps.', fabrication?.access_paths, fabrication?.accessPaths),
      load_chamber: firstString('Keep any load chamber reference conceptual, human-safe, ventilated where relevant, and consistent with the external dimensions.', fabrication?.load_chamber, fabrication?.loadChamber),
      support_structure: firstString('Use credible load-bearing frame members, bracing, base spread, and center-of-gravity control.', fabrication?.support_structure, fabrication?.supportStructure),
      hinge_panel_operation: firstString('Use practical hinge, latch, removable-panel, or sliding-panel logic with safe reach and pinch-point awareness.', fabrication?.hinge_panel_operation, fabrication?.hingePanelOperation),
      caster_mobility: firstString('Use locking casters or stage wheels with realistic load rating, floor contact, and transport handling.', fabrication?.caster_mobility, fabrication?.casterMobility),
      performer_positioning: firstString('Place the performer where reach, sightlines, and reveal orientation feel practical and rehearsable.', fabrication?.performer_positioning, fabrication?.performerPositioning),
      sightline_orientation: firstString('Orient the apparatus toward the audience with believable front, side, and service-angle control.', fabrication?.sightline_orientation, fabrication?.sightlineOrientation),
      closed_reveal_states: firstString('Keep closed-state and reveal-state visuals consistent so doors, panels, rooflines, and interior visibility do not redesign the apparatus.', fabrication?.closed_reveal_states, fabrication?.closedRevealStates),
    },
    build_complexity: {
      rating_1_to_5: Math.min(5, Math.max(1, asNumber(complexity?.rating_1_to_5 ?? complexity?.rating, 3))),
      rationale: firstString('Moderate build complexity because it requires reliable scenic construction, safe handling, and careful rehearsal.', complexity?.rationale, complexity?.notes, raw?.complexity_rationale),
    },
  };
};

const isUsableBuilderPlan = (plan: BuilderPlan): boolean =>
  Boolean(plan.project_title.trim() && plan.build_concept.trim());

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
  const [visualHandoff, setVisualHandoff] = useState<VisualBlueprintHandoff | null>(null);

  const [builderPlan, setBuilderPlan] = useState<BuilderPlan | null>(null);
  const [blueprintDrawings, setBlueprintDrawings] = useState<MatchedImageSlots>([]);
  const [imageOptions, setImageOptions] = useState<MatchedImageSlots>([]);
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
  const [regeneratingPairIndex, setRegeneratingPairIndex] = useState<number | null>(null);
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
        fabrication_intelligence: {
          type: Type.OBJECT,
          properties: {
            concealment_volume: { type: Type.STRING },
            access_paths: { type: Type.STRING },
            load_chamber: { type: Type.STRING },
            support_structure: { type: Type.STRING },
            hinge_panel_operation: { type: Type.STRING },
            caster_mobility: { type: Type.STRING },
            performer_positioning: { type: Type.STRING },
            sightline_orientation: { type: Type.STRING },
            closed_reveal_states: { type: Type.STRING },
          },
          required: [
            'concealment_volume',
            'access_paths',
            'load_chamber',
            'support_structure',
            'hinge_panel_operation',
            'caster_mobility',
            'performer_positioning',
            'sightline_orientation',
            'closed_reveal_states',
          ],
        },
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
        'fabrication_intelligence',
        'build_complexity',
      ],
    }),
    []
  );

  const toggleSection = (key: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const applyVisualHandoff = (handoff: VisualBlueprintHandoff | null) => {
      if (!handoff) return;
      setVisualHandoff(handoff);
      setEffectInput((prev) => (prev.trim() ? prev : buildEffectInputFromVisualHandoff(handoff)));
      setSpecialNotes((prev) => {
        if (prev.trim()) return prev;
        const referenceImage = handoff.selectedImageUrl || handoff.imageUrl || '';
        const lines = [
          'Imported from Visual Brainstorm. The selected image is the canonical apparatus reference. Convert the SAME apparatus into a realistic, stage-ready illusion apparatus; do not redesign, reinterpret, upscale, or replace it with another illusion category.',
          referenceImage ? `Selected reference image: ${referenceImage}` : '',
          typeof handoff.selectedVariationIndex === 'number' ? `Selected variation: V${handoff.selectedVariationIndex + 1}` : '',
          handoff.project?.projectTitle ? `Project: ${handoff.project.projectTitle}` : '',
        ].filter(Boolean);
        return lines.join('\n');
      });
    };

    const inMemoryHandoff = normalizeVisualBlueprintHandoff(window.__mawIllusionBlueprintVisualHandoff);
    const sessionHandoff = safeParseVisualBlueprintHandoff(sessionStorage.getItem(VISUAL_TO_BLUEPRINT_HANDOFF_SESSION_KEY));
    const storedHandoff = safeParseVisualBlueprintHandoff(localStorage.getItem(VISUAL_TO_BLUEPRINT_HANDOFF_KEY));
    const recoveredHandoff = inMemoryHandoff || sessionHandoff || storedHandoff;
    applyVisualHandoff(recoveredHandoff);
    if (recoveredHandoff) {
      try { sessionStorage.removeItem(VISUAL_TO_BLUEPRINT_HANDOFF_SESSION_KEY); } catch {}
      try { localStorage.removeItem(VISUAL_TO_BLUEPRINT_HANDOFF_KEY); } catch {}
      try { window.__mawIllusionBlueprintVisualHandoff = undefined; } catch {}
    }

    const onHandoff = (event: Event) => {
      const detail = (event as CustomEvent<VisualBlueprintHandoff>).detail;
      applyVisualHandoff(normalizeVisualBlueprintHandoff(detail));
    };

    window.addEventListener('maw:illusion-blueprint-handoff', onHandoff as EventListener);
    return () => window.removeEventListener('maw:illusion-blueprint-handoff', onHandoff as EventListener);
  }, []);

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
    setRegeneratingPairIndex(null);
    setLoadingStage('');
    setOpenSections({
      plan: true,
      construction: false,
      operations: false,
      blueprints: false,
      visuals: false,
    });
  };

  const visualSeedText = useMemo(() => {
    if (!visualHandoff) return effectInput;
    return [
      visualHandoff.title ? `Selected Visual Brainstorm title: ${visualHandoff.title}` : '',
      visualHandoff.prompt ? `Selected Visual Brainstorm prompt: ${visualHandoff.prompt}` : '',
      visualHandoff.project?.projectTitle || visualHandoff.projectTitle ? `Project title: ${visualHandoff.project?.projectTitle || visualHandoff.projectTitle}` : '',
      effectInput ? `Blueprint request: ${effectInput}` : '',
    ].filter(Boolean).join('\n');
  }, [effectInput, visualHandoff]);

  const seedIdentity = useMemo(
    () => buildIllusionSeedIdentity(visualSeedText, visualHandoff ? 'visual_brainstorm' : 'manual'),
    [visualSeedText, visualHandoff]
  );

  const seedIdentityBrief = useMemo(() => buildSeedIdentityBrief(seedIdentity), [seedIdentity]);

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
      seedIdentityBrief ? `Structural seed identity:\n${seedIdentityBrief}` : '',
    ].filter(Boolean).join('\n'),
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
      seedIdentityBrief,
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
        category: 'blueprint',
        source: 'illusion_blueprint',
        metadata: { projectStage: 'development', originTool: 'illusion_blueprint' },
      });
      void trackClientEvent({ tool: 'illusion_blueprint', action: 'illusion_blueprint_save_success', outcome: 'SUCCESS_NOT_CHARGED', metadata: { project_title: builderPlan?.project_title || '' } });
      onIdeaSaved();
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err: any) {
      setError(err?.message || 'Could not save this builder plan.');
    }
  };


  const handleRegeneratePair = async (pairIndex: number) => {
    if (!builderPlan) {
      setWarning('Generate a builder plan before regenerating a matched pair.');
      return;
    }

    const matchedOutput = ILLUSION_BLUEPRINT_MATCHED_OUTPUTS[pairIndex];
    if (!matchedOutput) return;

    setError(null);
    setWarning(null);
    setRegeneratingPairIndex(pairIndex);

    try {
      const illusionIdentity = buildIllusionIdentity(builderPlan, {
        originalEffect: effectInput,
        venueScale,
        performerStyle,
        budgetLevel,
        crewSize,
        resetRequirement,
        transportLimitations,
        stageLimitations,
        materialsPreference,
      });
      const visualContinuityBrief = buildVisualContinuityBrief(builderPlan, effectInput, seedIdentityBrief);
      const visualAnchor = illusionIdentity.illusionType;
      const designSpec = buildIllusionDesignSpec({
        plan: builderPlan,
        matchedOutput,
        seedIdentity,
        venueScale,
        performerStyle,
      });

      const blueprintPrompt = buildIllusionBlueprintDrawingPrompt({
        plan: builderPlan,
        visualContinuityBrief,
        visualAnchor,
        illusionIdentity,
        venueScale,
        performerStyle,
        matchedOutput,
        seedIdentity,
        designSpec,
      });

      const conceptPrompt = buildIllusionConceptImagePrompt({
        plan: builderPlan,
        visualContinuityBrief,
        visualAnchor,
        illusionIdentity,
        venueScale,
        performerStyle,
        matchedOutput,
        seedIdentity,
        designSpec,
      });

      const recoveryPrompt = buildIllusionConceptRenderRecoveryPrompt({
        plan: builderPlan,
        visualContinuityBrief,
        visualAnchor,
        illusionIdentity,
        venueScale,
        performerStyle,
        matchedOutput,
        seedIdentity,
        designSpec,
      });

      const [newBlueprint, newConcept] = await Promise.all([
        generateValidatedMatchedImage({
          basePrompt: blueprintPrompt,
          kind: 'blueprint',
          visualAnchor,
          label: matchedOutput.label,
          user,
        }),
        generateValidatedMatchedImage({
          basePrompt: conceptPrompt,
          kind: 'concept',
          visualAnchor,
          label: matchedOutput.label,
          user,
          recoveryPrompt,
        }),
      ]);

      setBlueprintDrawings((prev) => {
        const next: MatchedImageSlots = [...prev];
        while (next.length < ILLUSION_BLUEPRINT_MATCHED_OUTPUTS.length) next.push(null);
        if (newBlueprint) next[pairIndex] = newBlueprint;
        return next.slice(0, ILLUSION_BLUEPRINT_MATCHED_OUTPUTS.length);
      });

      setImageOptions((prev) => {
        const next: MatchedImageSlots = [...prev];
        while (next.length < ILLUSION_BLUEPRINT_MATCHED_OUTPUTS.length) next.push(null);
        if (newConcept) next[pairIndex] = newConcept;
        return next.slice(0, ILLUSION_BLUEPRINT_MATCHED_OUTPUTS.length);
      });

      if (!newBlueprint || !newConcept) {
        setWarning(`Pair ${String.fromCharCode(65 + pairIndex)} was regenerated, but one output failed validation. The previous valid image was preserved when available.`);
      }
    } catch (err: any) {
      setWarning(err?.message || `Pair ${String.fromCharCode(65 + pairIndex)} could not be regenerated this time.`);
    } finally {
      setRegeneratingPairIndex(null);
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
    setRegeneratingPairIndex(null);

    void trackClientEvent({ tool: 'illusion_blueprint', action: 'illusion_blueprint_start', metadata: { venueScale, performerStyle, budgetLevel, crewSize, resetRequirement } });

    const planPrompt = buildIllusionBlueprintPlanPrompt({ generationContext, seedIdentity });

    try {
      setLoadingStage('Generating builder plan…');
      const rawPlan = await generateStructuredResponse(
        planPrompt,
        PLAN_SYSTEM_INSTRUCTION,
        planSchema,
        user,
        { maxOutputTokens: 2400, speedMode: 'full' }
      );
      const plan = normalizeBuilderPlan(rawPlan, effectInput);

      if (!isUsableBuilderPlan(plan)) {
        throw new Error('Illusion Blueprint could not create a usable builder plan. Please add a little more detail and try again.');
      }

      setBuilderPlan(plan);
      const usedContinuityFallbacks = !asStringArray(rawPlan?.recommended_construction?.main_structure).length || !asStringArray(rawPlan?.assembly_overview).length;
      if (usedContinuityFallbacks) {
        setWarning('Builder plan generated with continuity safeguards. Review the construction details before using it for fabrication.');
      }
      void trackClientEvent({ tool: 'illusion_blueprint', action: 'illusion_blueprint_success', outcome: 'SUCCESS_NOT_CHARGED', metadata: { project_title: plan?.project_title || '', venueScale, performerStyle } });
      setOpenSections({
        plan: true,
        construction: false,
        operations: false,
        blueprints: false,
        visuals: false,
      });

      const illusionIdentity = buildIllusionIdentity(plan, {
        originalEffect: effectInput,
        venueScale,
        performerStyle,
        budgetLevel,
        crewSize,
        resetRequirement,
        transportLimitations,
        stageLimitations,
        materialsPreference,
      });
      const visualContinuityBrief = buildVisualContinuityBrief(plan, effectInput, seedIdentityBrief);
      const visualAnchor = illusionIdentity.illusionType;

      setLoadingStage('Generating matched blueprint drawings…');
      setIsGeneratingBlueprints(true);
      let matchedBlueprints: MatchedImageSlots = [];

      try {
        const drawingResults = await Promise.allSettled(
          ILLUSION_BLUEPRINT_MATCHED_OUTPUTS.map(async (matchedOutput) => {
            const designSpec = buildIllusionDesignSpec({
              plan,
              matchedOutput,
              seedIdentity,
              venueScale,
              performerStyle,
            });
            const blueprintPrompt = buildIllusionBlueprintDrawingPrompt({
              plan,
              visualContinuityBrief,
              visualAnchor,
              illusionIdentity,
              venueScale,
              performerStyle,
              matchedOutput,
              seedIdentity,
              designSpec,
            });
            return generateValidatedMatchedImage({
              basePrompt: blueprintPrompt,
              kind: 'blueprint',
              visualAnchor,
              label: matchedOutput.label,
              user,
            });
          })
        );
        matchedBlueprints = drawingResults
          .map((result) => result.status === 'fulfilled' ? result.value : null)
          .slice(0, 2);
        setBlueprintDrawings(matchedBlueprints);
        if (matchedBlueprints.filter(Boolean).length < 2) {
          setWarning('One or more blueprint drawings could not be generated. Regenerate Pair A/B if you need a complete matched set.');
        }
      } catch {
        matchedBlueprints = [];
        setBlueprintDrawings([]);
      } finally {
        setIsGeneratingBlueprints(false);
      }

      setLoadingStage('Generating matched concept images…');
      setIsGeneratingVisuals(true);

      try {
        const conceptResults = await Promise.allSettled(
          ILLUSION_BLUEPRINT_MATCHED_OUTPUTS.map(async (matchedOutput) => {
            const designSpec = buildIllusionDesignSpec({
              plan,
              matchedOutput,
              seedIdentity,
              venueScale,
              performerStyle,
            });
            const imagePrompt = buildIllusionConceptImagePrompt({
              plan,
              visualContinuityBrief,
              visualAnchor,
              illusionIdentity,
              venueScale,
              performerStyle,
              matchedOutput,
              seedIdentity,
              designSpec,
            });
            const recoveryPrompt = buildIllusionConceptRenderRecoveryPrompt({
              plan,
              visualContinuityBrief,
              visualAnchor,
              illusionIdentity,
              venueScale,
              performerStyle,
              matchedOutput,
              seedIdentity,
              designSpec,
            });
            return generateValidatedMatchedImage({
              basePrompt: imagePrompt,
              kind: 'concept',
              visualAnchor,
              label: matchedOutput.label,
              user,
              recoveryPrompt,
            });
          })
        );
        const matchedConcepts = conceptResults
          .map((result) => result.status === 'fulfilled' ? result.value : null)
          .slice(0, 2);
        setImageOptions(matchedConcepts);
        if (matchedConcepts.filter(Boolean).length < 2) {
          setWarning('One or more concept renders could not be generated. Regenerate Pair A/B if you need a complete matched set.');
        }
      } catch (imageErr: any) {
        setWarning(imageErr?.message || 'Builder plan generated, but matched concept images could not be created this time.');
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
      <WorkspaceBreadcrumbs currentToolLabel="Illusion Blueprint" />
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

          {visualHandoff ? (
            <div className="mb-4 rounded-xl border border-violet-400/30 bg-violet-500/10 p-3 text-sm text-violet-100">
              <div className="font-semibold">Imported from Visual Brainstorm</div>
              <div className="mt-1 text-xs text-violet-100/80">
                This blueprint request was prefilled from {visualHandoff.project?.projectTitle || visualHandoff.title || 'a selected visual concept'}.
                The generated plan should preserve the selected image while converting it into a realistic stage illusion apparatus.
                {typeof visualHandoff.selectedVariationIndex === 'number' ? ` Selected source: V${visualHandoff.selectedVariationIndex + 1}.` : ''}
              </div>
              {(visualHandoff.selectedImageUrl || visualHandoff.imageUrl) ? (
                <div className="mt-3 overflow-hidden rounded-lg border border-violet-300/20 bg-slate-950/40">
                  <img src={visualHandoff.selectedImageUrl || visualHandoff.imageUrl} alt="Selected Visual Brainstorm reference" className="max-h-44 w-full object-cover" />
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mb-4 rounded-xl border border-slate-800 bg-slate-900/30 p-3">
            <div className="text-sm font-semibold text-slate-200">Why use this?</div>
            <ul className="mt-1 text-xs text-slate-400 list-disc pl-5 space-y-1">
              <li>Turns a rough illusion idea into a realistic builder-oriented plan.</li>
              <li>Focuses on construction, safety, transport, and practical stage use.</li>
              <li>Automatically gives you two matched blueprint/concept pairs to compare.</li>
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
              <div className="text-xs text-slate-500">Realistic plan first. Two matched blueprint/concept pairs second.</div>
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
                      Describe the effect, add your constraints, and generate a practical construction plan with two matched visual directions.
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
                      ['blueprints', 'Dimensioned Blueprint Drawings'],
                      ['visuals', 'Matched Concept Renders'],
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

                      <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-4">
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-200 mb-3">Mechanism & Fabrication Intelligence</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <TextBlock text={builderPlan.fabrication_intelligence.concealment_volume} leadIn="Concealment volume" />
                          <TextBlock text={builderPlan.fabrication_intelligence.access_paths} leadIn="Access paths" />
                          <TextBlock text={builderPlan.fabrication_intelligence.load_chamber} leadIn="Load chamber logic" />
                          <TextBlock text={builderPlan.fabrication_intelligence.support_structure} leadIn="Support structure" />
                          <TextBlock text={builderPlan.fabrication_intelligence.hinge_panel_operation} leadIn="Hinge / panel operation" />
                          <TextBlock text={builderPlan.fabrication_intelligence.caster_mobility} leadIn="Caster mobility" />
                          <TextBlock text={builderPlan.fabrication_intelligence.performer_positioning} leadIn="Performer positioning" />
                          <TextBlock text={builderPlan.fabrication_intelligence.sightline_orientation} leadIn="Sightline orientation" />
                        </div>
                        <div className="mt-3 border-t border-amber-300/10 pt-3">
                          <TextBlock text={builderPlan.fabrication_intelligence.closed_reveal_states} leadIn="Closed / reveal state continuity" />
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
                    title="Dimensioned Blueprint Drawings"
                    subtitle="Dimensioned technical concept drawings for build planning"
                    isOpen={openSections.blueprints}
                    onToggle={() => toggleSection('blueprints')}
                    actions={
                      isGeneratingBlueprints ? (
                        <div className="text-[11px] text-violet-300">Generating…</div>
                      ) : blueprintDrawings.length ? (
                        <div className="text-[11px] text-slate-500">{blueprintDrawings.filter(Boolean).length} / {ILLUSION_BLUEPRINT_MATCHED_OUTPUTS.length} drawings</div>
                      ) : null
                    }
                  >
                    <div className="space-y-5">
                      <SectionIntro
                        icon={<BlueprintIcon className="h-4 w-4" />}
                        title="Dimensioned Technical Drawing Set"
                        subtitle="Blueprint-style concept drawings with approximate measurement callouts for structure, layout, and mechanism direction."
                      />
                      {builderPlan ? (
                        <div className="rounded-xl border border-sky-400/20 bg-sky-500/10 px-3.5 py-3 text-xs leading-relaxed text-sky-100">
                          <span className="font-semibold">Seed geometry lock:</span> these drawings are prompted as technical conversions of the same canonical seed apparatus: <span className="font-semibold">{deriveVisualAnchor(builderPlan, effectInput)}</span>.
                        </div>
                      ) : null}
                      {isGeneratingBlueprints ? (
                        <ImageGenerationCard label="Generating blueprint drawings" />
                      ) : blueprintDrawings.length ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {ILLUSION_BLUEPRINT_MATCHED_OUTPUTS.map((matchedOutput, idx) => {
                            const src = blueprintDrawings[idx];
                            const drawingLabel = `Blueprint ${String.fromCharCode(65 + idx)}`;
                            const continuityLabel = builderPlan ? `${drawingLabel} — ${deriveVisualAnchor(builderPlan, effectInput)}` : drawingLabel;
                            return (
                              <div
                                key={`blueprint-${matchedOutput.label}-${idx}`}
                                className="group relative overflow-hidden rounded-xl border border-white/10 bg-white/5 text-left transition-all duration-200 hover:border-sky-300/60 hover:shadow-md hover:shadow-black/20 hover:-translate-y-0.5"
                              >
                                <button
                                  type="button"
                                  onClick={() => src && setActiveBlueprintIndex(idx)}
                                  disabled={!src || regeneratingPairIndex === idx}
                                  className="block w-full text-left focus:outline-none focus:ring-2 focus:ring-inset focus:ring-sky-400/70 disabled:cursor-not-allowed"
                                >
                                  <div className="aspect-[4/3] overflow-hidden bg-slate-950/40">
                                    {src ? (
                                      <img
                                        src={src}
                                        alt={`Blueprint drawing ${continuityLabel}`}
                                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                                      />
                                    ) : (
                                      <div className="flex h-full w-full items-center justify-center p-6 text-center text-xs text-slate-400">
                                        Blueprint {String.fromCharCode(65 + idx)} was rejected by validation. Regenerate this pair to create a replacement.
                                      </div>
                                    )}
                                  </div>
                                </button>

                                <div className="p-3">
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <div className="text-sm font-semibold text-slate-100">{drawingLabel}</div>
                                      <div className="mt-1 text-xs text-slate-400">
                                        Dimensioned technical view for {builderPlan ? deriveVisualAnchor(builderPlan, effectInput) : 'this builder plan'}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="mt-3 flex items-center justify-between gap-3">
                                    <span className="text-[11px] text-slate-500">Dimensioned technical blueprint drawing</span>
                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => void handleRegeneratePair(idx)}
                                        disabled={regeneratingPairIndex !== null}
                                        className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-100 transition-colors hover:border-amber-300/70 disabled:cursor-not-allowed disabled:opacity-60"
                                      >
                                        {regeneratingPairIndex === idx ? 'Regenerating…' : `Regenerate Pair ${String.fromCharCode(65 + idx)}`}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => src && setActiveBlueprintIndex(idx)}
                                        disabled={!src}
                                        className="rounded-full border border-slate-700 bg-slate-900/50 px-2.5 py-1 text-[11px] font-semibold text-slate-300 transition-colors hover:border-sky-300/50 hover:text-sky-200 disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        View Larger
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
                          No blueprint drawings were returned on this attempt.
                        </div>
                      )}
                    </div>
                  </CollapsibleCard>
                </div>

                <div id="ib-visuals">
                  <CollapsibleCard
                    title="Matched Concept Renders"
                    subtitle="Photorealistic renders locked to each paired blueprint"
                    isOpen={openSections.visuals}
                    onToggle={() => toggleSection('visuals')}
                    actions={
                      isGeneratingVisuals ? (
                        <div className="text-[11px] text-violet-300">Generating…</div>
                      ) : imageOptions.length ? (
                        <div className="text-[11px] text-slate-500">{imageOptions.filter(Boolean).length} / {ILLUSION_BLUEPRINT_MATCHED_OUTPUTS.length} options</div>
                      ) : null
                    }
                  >
                    <div className="space-y-5">
                      <SectionIntro
                        icon={<ImageIcon className="h-4 w-4" />}
                        title="Matched Render Gallery"
                        subtitle="Compare the two matched concept renders, each locked to its paired dimensioned blueprint drawing."
                      />
                      {builderPlan ? (
                        <div className="rounded-xl border border-violet-400/20 bg-violet-500/10 px-3.5 py-3 text-xs leading-relaxed text-violet-100">
                          <span className="font-semibold">Seed geometry lock:</span> each concept render is prompted as a blueprint-derived photorealistic fabrication render of the same canonical seed apparatus for <span className="font-semibold">{deriveVisualAnchor(builderPlan, effectInput)}</span>. Convert, do not redesign or change illusion category.
                        </div>
                      ) : null}
                    {isGeneratingVisuals ? (
                      <ImageGenerationCard label="Generating matched concept renders" />
                    ) : imageOptions.length ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
                        {ILLUSION_BLUEPRINT_MATCHED_OUTPUTS.map((matchedOutput, idx) => {
                          const src = imageOptions[idx];
                          const conceptLabel = `Concept ${String.fromCharCode(65 + idx)}`;
                          const continuityLabel = builderPlan ? `${conceptLabel} — ${deriveVisualAnchor(builderPlan, effectInput)}` : conceptLabel;
                          const isSelected = selectedConceptIndex === idx;

                          return (
                            <div
                              key={`concept-${matchedOutput.label}-${idx}`}
                              className={`group relative overflow-hidden rounded-xl border bg-white/5 text-left transition-all duration-200 ${
                                isSelected
                                  ? 'border-violet-400 ring-2 ring-violet-400 shadow-lg shadow-violet-500/20'
                                  : 'border-white/10 hover:border-violet-300/60 hover:shadow-md hover:shadow-black/20 hover:-translate-y-0.5'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => src && setActiveConceptIndex(idx)}
                                disabled={!src || regeneratingPairIndex === idx}
                                className="block w-full text-left focus:outline-none focus:ring-2 focus:ring-inset focus:ring-violet-400/70 disabled:cursor-not-allowed"
                              >
                                <div className="aspect-[4/3] overflow-hidden bg-slate-950/40">
                                  {src ? (
                                    <img
                                      src={src}
                                      alt={`Illusion concept ${continuityLabel}`}
                                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                                    />
                                  ) : (
                                    <div className="flex h-full w-full items-center justify-center p-6 text-center text-xs text-slate-400">
                                      Concept {String.fromCharCode(65 + idx)} was rejected by validation. Regenerate this pair to create a replacement.
                                    </div>
                                  )}
                                </div>
                              </button>

                              <div className="p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="text-sm font-semibold text-slate-100">{conceptLabel}</div>
                                    <div className="mt-1 text-xs text-slate-400">
                                      {isSelected ? 'Selected matched concept' : `Matches Blueprint ${String.fromCharCode(65 + idx)} — ${builderPlan ? deriveVisualAnchor(builderPlan, effectInput) : 'this builder plan'}`}
                                    </div>
                                  </div>
                                  {isSelected ? (
                                    <span className="shrink-0 rounded-full border border-violet-400/70 bg-violet-500/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-violet-200">
                                      Selected for Build
                                    </span>
                                  ) : null}
                                </div>

                                <div className="mt-3 flex items-center justify-between gap-3">
                                  <span className="text-[11px] text-slate-500">Matched concept render</span>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => void handleRegeneratePair(idx)}
                                      disabled={regeneratingPairIndex !== null}
                                      className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-100 transition-colors hover:border-amber-300/70 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      {regeneratingPairIndex === idx ? 'Regenerating…' : `Regenerate Pair ${String.fromCharCode(65 + idx)}`}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => src && setActiveConceptIndex(idx)}
                                      disabled={!src}
                                      className="rounded-full border border-slate-700 bg-slate-900/50 px-2.5 py-1 text-[11px] font-semibold text-slate-300 transition-colors hover:border-violet-300/50 hover:text-violet-200 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      View Larger
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => src && setSelectedConceptIndex(idx)}
                                      disabled={!src}
                                      aria-pressed={isSelected}
                                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
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
                        The builder plan completed, but matched concept renders were not returned on this attempt.
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
