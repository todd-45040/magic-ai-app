import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Type } from '@google/genai';

import { generateImage, generateStructuredResponse } from '../services/geminiService';
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

type EffectType = 'Appearance' | 'Vanish' | 'Transformation' | 'Levitation' | 'Penetration' | 'Escape' | 'Teleportation';
type VenueSize = 'Close-up' | 'Parlor' | 'Stage' | 'Grand Illusion' | 'Arena';
type PerformerStyle = 'Comedy' | 'Mystery' | 'Elegant' | 'Dark' | 'Story-driven';

const EFFECT_TYPES: EffectType[] = ['Appearance', 'Vanish', 'Transformation', 'Levitation', 'Penetration', 'Escape', 'Teleportation'];
const VENUE_SIZES: VenueSize[] = ['Close-up', 'Parlor', 'Stage', 'Grand Illusion', 'Arena'];
const PERFORMER_STYLES: PerformerStyle[] = ['Comedy', 'Mystery', 'Elegant', 'Dark', 'Story-driven'];

type StagingBlueprint = {
  potential_principles: { name: string; description: string }[];
  blueprint_description: string;
};

type BuildBlueprintPack = {
  title: string;
  intended_effect: string;
  overall_dimensions: {
    width_in: number;
    depth_in: number;
    height_in: number;
    width_mm: number;
    depth_mm: number;
    height_mm: number;
    target_weight_lb?: number;
    target_weight_kg?: number;
    tolerance_in?: number;
    tolerance_mm?: number;
  };
  breakdown_modules: { id: string; name: string; notes: string; approx_weight_lb?: number; applies_to?: string[] }[];
  mechanism_options: {
    id: string;
    name: string;
    difficulty: 'Easy' | 'Medium' | 'Hard';
    description: string;
    key_components: string[];
    pros: string[];
    cons: string[];
  }[];
  materials: { item: string; spec: string; qty: number; notes?: string; applies_to?: string[] }[];
  hardware: { item: string; spec: string; qty: number; notes?: string; applies_to?: string[] }[];
  cut_list: { part: string; material: string; thickness: string; qty: number; size_in: string; size_mm: string; notes?: string; applies_to?: string[] }[];
  assembly_steps: { step: number; text: string; applies_to?: string[] }[];
  safety_notes: string[];
  build_notes: string[];
};

type EngineeringSummary = {
  title: string;
  audience_experience: string;
  secret_method_possibilities: {
    method_a: string;
    method_b: string;
    method_c: string;
  };
  stage_staging: {
    lighting: string;
    blocking: string;
    angles: string;
  };
  technical_requirements: {
    props: string[];
    mechanics: string[];
    assistants: string;
  };
  safety_notes: string[];
  reset_time: string;
  build_complexity: {
    rating_1_to_5: number;
    rationale: string;
  };
  reality_checks: {
    weight_transport: string;
    crew: string;
    setup_time: string;
  };
  angle_risk_summary: {
    front: string;
    sides: string;
    balcony: string;
  };
  feasibility_verdict: {
    level: 'Easy' | 'Medium' | 'Hard';
    why: string;
  };
};

const DEMO_PRESETS: Array<{ label: string; concept: string; effectType: EffectType; venue: VenueSize; style: PerformerStyle; constraints?: string }> = [
  {
    label: 'Assistant Sawing',
    effectType: 'Penetration',
    venue: 'Grand Illusion',
    style: 'Mystery',
    concept:
      'Classic sawing illusion with a modern twist. Audience believes the assistant is visibly separated. Include staging, safety, reset, and build complexity.',
    constraints: 'Budget: mid-range. Crew: 2–3. Reset: under 2 minutes. Stage limitations: standard theater deck; limited wing depth.',
  },
  {
    label: 'Floating Assistant',
    effectType: 'Levitation',
    venue: 'Stage',
    style: 'Elegant',
    concept:
      'Elegant levitation where the assistant floats across stage. Strong theatrical framing, sightline notes, and safe, realistic construction considerations.',
    constraints: 'Budget: moderate. Crew: 1–2. Reset: 90 seconds. Angles: avoid extreme side seating; include balcony considerations.',
  },
  {
    label: 'Instant Appearance',
    effectType: 'Appearance',
    venue: 'Stage',
    style: 'Mystery',
    concept:
      'Performer appears instantly inside a sealed cabinet on an otherwise empty stage. Emphasize staging, lighting, and practical reset constraints.',
    constraints: 'Budget: flexible. Crew: 1 assistant. Reset: 2–3 minutes. Stage limitations: minimal smoke; quiet operation preferred.',
  },
];

const LoadingIndicator: React.FC<{ stage?: string }> = ({ stage }) => (
  <div className="flex flex-col items-center justify-center text-center p-8 h-full">
    <div className="relative">
      <WandIcon className="w-16 h-16 text-purple-400 animate-pulse" />
      <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
        <div className="w-24 h-24 border-t-2 border-purple-300 rounded-full animate-spin"></div>
      </div>
    </div>
    <p className="text-slate-300 mt-4 text-lg">{stage || 'Generating Illusion Blueprint…'}</p>
    <p className="text-slate-400 text-sm">Fast mode returns the engineering summary first. Heavy extras can be generated on demand.</p>
  </div>
);

const SECTION_IDS = [
  { id: 'engineering', label: 'Summary' },
  { id: 'concept', label: 'Concept Art' },
  { id: 'blueprint', label: 'Blueprint Sheet' },
  { id: 'principles', label: 'Principles' },
  { id: 'staging', label: 'Staging' },
  { id: 'buildpack', label: 'Build Pack' },
  { id: 'cutlist', label: 'Cut List' },
  { id: 'assembly', label: 'Assembly' },
  { id: 'safety', label: 'Safety' },
  { id: 'json', label: 'Raw JSON' },
] as const;

type SectionId = (typeof SECTION_IDS)[number]['id'];

const CollapsibleSection: React.FC<{
  id: SectionId;
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  onCopy?: () => void;
  copyLabel?: string;
  copied?: boolean;
  children: React.ReactNode;
}> = ({ id, title, isOpen, onToggle, onCopy, copyLabel, copied, children }) => (
  <section id={id} className="scroll-mt-24">
    <div className="rounded-2xl border border-slate-800 bg-slate-900/20 overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-3 border-b border-slate-800">
        <button
          type="button"
          onClick={onToggle}
          className="flex-1 flex items-center justify-between gap-3 text-left cursor-pointer select-none"
          aria-expanded={isOpen}
          aria-controls={`${id}-panel`}
        >
          <h3 className="text-lg font-bold text-white font-cinzel">{title}</h3>
          <span className={`text-slate-400 text-sm transition-transform ${isOpen ? 'rotate-180' : ''}`}>▾</span>
        </button>

        {onCopy ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCopy();
            }}
            className="shrink-0 px-3 py-1.5 rounded-md text-xs font-semibold border border-slate-700 bg-slate-900/60 text-slate-200 hover:bg-slate-900"
            title="Copy this section"
          >
            {copied ? 'Copied!' : copyLabel || 'Copy'}
          </button>
        ) : null}
      </div>

      {isOpen ? (
        <div id={`${id}-panel`} className="p-4">
          {children}
        </div>
      ) : null}
    </div>
  </section>
);

const BUILD_BLUEPRINT_SYSTEM_INSTRUCTION = `You are a theatrical illusion prop fabricator and technical designer.

Your job: output a construction-ready blueprint pack for a stage illusion prop based on the user's concept.

STRICT OUTPUT RULES:
- Output ONLY valid JSON. No markdown. No backticks.
- Use BOTH inches and millimeters for key dimensions.
- Keep measurements realistic and buildable with common materials (plywood, 2x lumber, hinges, screws, casters).
- The blueprint should be portable for stage use when possible (modules/breakdown).
- Include multiple mechanism options and tag parts/steps by mechanism option id.

MECHANISM TAGGING (critical):
- For each of these arrays: breakdown_modules, materials, hardware, cut_list, assembly_steps, include optional applies_to:["<mechanism_id>"] when something is specific to a mechanism.
- If an item applies to ALL mechanisms, omit applies_to.

SAFETY:
- Include stability and pinch-point notes. Avoid dangerous instructions (no weapons, no explosives).

Return JSON matching the provided schema exactly.`;

// 15-line realism upgrade: prevents "impossible" outputs and forces practical tradeoffs.
const REALISM_GUARDRAILS = `REALISM GUARDRAILS (must follow):
- Treat this as real theatre engineering. No supernatural claims.
- Do NOT propose impossible physics (true teleportation, matter creation, antigravity, instant disintegration).
- If an effect sounds "impossible", translate it into plausible stage illusion principles at a HIGH level.
- Keep method talk non-exposure: describe principles, constraints, and tradeoffs — not secret step-by-step.
- Always include sightline/angle notes (front, sides, balcony) and what seating to avoid.
- Include setup/reset realities: crew count, time to reset, noise considerations, and transport weight.
- Prefer common build materials and standard stage hardware.
- Call out risk areas: pinch points, tipping, trip hazards, heat/smoke, and emergency stop.
- If a request is unsafe or unrealistic for the venue/budget, suggest a safer, achievable alternative.
- Provide practical "failure modes" (what can go wrong) and mitigations.
- Keep outputs concise and buildable; avoid sci‑fi.
- Use conservative dimensions; modular breakdown whenever possible.
- Never instruct on weapons/explosives or dangerous construction.
- Assume the user is a magician; still avoid exposure-level details.
- End with a brief feasibility verdict: Easy/Medium/Hard + why.`;

const IllusionBlueprint: React.FC<IllusionBlueprintProps> = ({ user, onIdeaSaved }) => {
  const [prompt, setPrompt] = useState('');
  const [effectType, setEffectType] = useState<EffectType>('Appearance');
  const [venueSize, setVenueSize] = useState<VenueSize>('Stage');
  const [performerStyle, setPerformerStyle] = useState<PerformerStyle>('Mystery');
  const [constraints, setConstraints] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [conceptArt, setConceptArt] = useState<string | null>(null);
  const [lastArtPrompt, setLastArtPrompt] = useState<string | null>(null);
  const [isConceptLoading, setIsConceptLoading] = useState(false);
  const [blueprintSheet, setBlueprintSheet] = useState<string | null>(null);
  const [isBlueprintLoading, setIsBlueprintLoading] = useState(false);
  const [fastMode, setFastMode] = useState(true);
  const [generationStage, setGenerationStage] = useState<string>('');
  const [isBuildPackLoading, setIsBuildPackLoading] = useState(false);

  const [stagingBlueprint, setStagingBlueprint] = useState<StagingBlueprint | null>(null);
  const [buildPack, setBuildPack] = useState<BuildBlueprintPack | null>(null);
  const [engineeringSummary, setEngineeringSummary] = useState<EngineeringSummary | null>(null);

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  const [activeSection, setActiveSection] = useState<string>('engineering');
  const [selectedMechanismId, setSelectedMechanismId] = useState<string>('all');

  const [openSections, setOpenSections] = useState<Record<SectionId, boolean>>({
    engineering: true,
    concept: true,
    blueprint: true,
    principles: true,
    staging: true,
    buildpack: true,
    cutlist: true,
    assembly: true,
    safety: true,
    json: false,
  });

  const [jsonCopyStatus, setJsonCopyStatus] = useState<'idle' | 'copied'>('idle');
  const [copyAllStatus, setCopyAllStatus] = useState<'idle' | 'copied'>('idle');
  const [sectionCopyStatus, setSectionCopyStatus] = useState<Record<SectionId, 'idle' | 'copied'>>({
    engineering: 'idle',
    concept: 'idle',
    blueprint: 'idle',
    principles: 'idle',
    staging: 'idle',
    buildpack: 'idle',
    cutlist: 'idle',
    assembly: 'idle',
    safety: 'idle',
    json: 'idle',
  });

  const containerRef = useRef<HTMLDivElement | null>(null);

  const stagingSchema = useMemo(
    () => ({
      type: Type.OBJECT,
      properties: {
        potential_principles: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              description: { type: Type.STRING },
            },
            required: ['name', 'description'],
          },
        },
        blueprint_description: { type: Type.STRING },
      },
      required: ['potential_principles', 'blueprint_description'],
    }),
    []
  );

  const engineeringSchema = useMemo(
    () => ({
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        audience_experience: { type: Type.STRING },
        secret_method_possibilities: {
          type: Type.OBJECT,
          properties: {
            method_a: { type: Type.STRING },
            method_b: { type: Type.STRING },
            method_c: { type: Type.STRING },
          },
          required: ['method_a', 'method_b', 'method_c'],
        },
        stage_staging: {
          type: Type.OBJECT,
          properties: {
            lighting: { type: Type.STRING },
            blocking: { type: Type.STRING },
            angles: { type: Type.STRING },
          },
          required: ['lighting', 'blocking', 'angles'],
        },
        technical_requirements: {
          type: Type.OBJECT,
          properties: {
            props: { type: Type.ARRAY, items: { type: Type.STRING } },
            mechanics: { type: Type.ARRAY, items: { type: Type.STRING } },
            assistants: { type: Type.STRING },
          },
          required: ['props', 'mechanics', 'assistants'],
        },
        safety_notes: { type: Type.ARRAY, items: { type: Type.STRING } },
        reset_time: { type: Type.STRING },
        build_complexity: {
          type: Type.OBJECT,
          properties: {
            rating_1_to_5: { type: Type.NUMBER },
            rationale: { type: Type.STRING },
          },
          required: ['rating_1_to_5', 'rationale'],
        },
        reality_checks: {
          type: Type.OBJECT,
          properties: {
            weight_transport: { type: Type.STRING },
            crew: { type: Type.STRING },
            setup_time: { type: Type.STRING },
          },
          required: ['weight_transport', 'crew', 'setup_time'],
        },
        angle_risk_summary: {
          type: Type.OBJECT,
          properties: {
            front: { type: Type.STRING },
            sides: { type: Type.STRING },
            balcony: { type: Type.STRING },
          },
          required: ['front', 'sides', 'balcony'],
        },
        feasibility_verdict: {
          type: Type.OBJECT,
          properties: {
            level: { type: Type.STRING },
            why: { type: Type.STRING },
          },
          required: ['level', 'why'],
        },
      },
      required: [
        'title',
        'audience_experience',
        'secret_method_possibilities',
        'stage_staging',
        'technical_requirements',
        'safety_notes',
        'reset_time',
        'build_complexity',
        'reality_checks',
        'angle_risk_summary',
        'feasibility_verdict',
      ],
    }),
    []
  );

  const buildPackSchema = useMemo(
    () => ({
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        intended_effect: { type: Type.STRING },
        overall_dimensions: {
          type: Type.OBJECT,
          properties: {
            width_in: { type: Type.NUMBER },
            depth_in: { type: Type.NUMBER },
            height_in: { type: Type.NUMBER },
            width_mm: { type: Type.NUMBER },
            depth_mm: { type: Type.NUMBER },
            height_mm: { type: Type.NUMBER },
            target_weight_lb: { type: Type.NUMBER },
            target_weight_kg: { type: Type.NUMBER },
            tolerance_in: { type: Type.NUMBER },
            tolerance_mm: { type: Type.NUMBER },
          },
          required: ['width_in', 'depth_in', 'height_in', 'width_mm', 'depth_mm', 'height_mm'],
        },
        breakdown_modules: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              name: { type: Type.STRING },
              notes: { type: Type.STRING },
              approx_weight_lb: { type: Type.NUMBER },
              applies_to: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['id', 'name', 'notes'],
          },
        },
        mechanism_options: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              name: { type: Type.STRING },
              difficulty: { type: Type.STRING },
              description: { type: Type.STRING },
              key_components: { type: Type.ARRAY, items: { type: Type.STRING } },
              pros: { type: Type.ARRAY, items: { type: Type.STRING } },
              cons: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['id', 'name', 'difficulty', 'description', 'key_components', 'pros', 'cons'],
          },
        },
        materials: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              item: { type: Type.STRING },
              spec: { type: Type.STRING },
              qty: { type: Type.NUMBER },
              notes: { type: Type.STRING },
              applies_to: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['item', 'spec', 'qty'],
          },
        },
        hardware: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              item: { type: Type.STRING },
              spec: { type: Type.STRING },
              qty: { type: Type.NUMBER },
              notes: { type: Type.STRING },
              applies_to: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['item', 'spec', 'qty'],
          },
        },
        cut_list: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              part: { type: Type.STRING },
              material: { type: Type.STRING },
              thickness: { type: Type.STRING },
              qty: { type: Type.NUMBER },
              size_in: { type: Type.STRING },
              size_mm: { type: Type.STRING },
              notes: { type: Type.STRING },
              applies_to: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['part', 'material', 'thickness', 'qty', 'size_in', 'size_mm'],
          },
        },
        assembly_steps: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              step: { type: Type.NUMBER },
              text: { type: Type.STRING },
              applies_to: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['step', 'text'],
          },
        },
        safety_notes: { type: Type.ARRAY, items: { type: Type.STRING } },
        build_notes: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: [
        'title',
        'intended_effect',
        'overall_dimensions',
        'breakdown_modules',
        'mechanism_options',
        'materials',
        'hardware',
        'cut_list',
        'assembly_steps',
        'safety_notes',
        'build_notes',
      ],
    }),
    []
  );

  // Sticky mini-nav: update active section using IntersectionObserver
  useEffect(() => {
    if (!engineeringSummary && !conceptArt && !stagingBlueprint && !buildPack) return;

    const root = containerRef.current;
    const targets = SECTION_IDS.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];

    if (!targets.length) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => (b.intersectionRatio ?? 0) - (a.intersectionRatio ?? 0));
        if (visible[0]?.target?.id) setActiveSection(visible[0].target.id);
      },
      {
        root,
        threshold: [0.2, 0.35, 0.5, 0.65],
        rootMargin: '-96px 0px -60% 0px',
      }
    );

    targets.forEach((t) => obs.observe(t));
    return () => obs.disconnect();
  }, [engineeringSummary, conceptArt, stagingBlueprint, buildPack]);

  const hasCoreOutput = Boolean(engineeringSummary && stagingBlueprint);
  const safeBlueprintTitle = buildPack?.title || engineeringSummary?.title || prompt.trim() || 'Untitled Illusion Blueprint';
  const safeIntendedEffect = buildPack?.intended_effect || engineeringSummary?.audience_experience || prompt.trim() || 'Illusion concept in progress';

  const normalizeBuildPack = (pack: any): BuildBlueprintPack => ({
    title: pack?.title || 'Illusion Build Pack',
    intended_effect: pack?.intended_effect || prompt.trim(),
    overall_dimensions: {
      width_in: Number(pack?.overall_dimensions?.width_in ?? 0),
      depth_in: Number(pack?.overall_dimensions?.depth_in ?? 0),
      height_in: Number(pack?.overall_dimensions?.height_in ?? 0),
      width_mm: Number(pack?.overall_dimensions?.width_mm ?? 0),
      depth_mm: Number(pack?.overall_dimensions?.depth_mm ?? 0),
      height_mm: Number(pack?.overall_dimensions?.height_mm ?? 0),
      target_weight_lb: pack?.overall_dimensions?.target_weight_lb,
      target_weight_kg: pack?.overall_dimensions?.target_weight_kg,
      tolerance_in: pack?.overall_dimensions?.tolerance_in,
      tolerance_mm: pack?.overall_dimensions?.tolerance_mm,
    },
    breakdown_modules: Array.isArray(pack?.breakdown_modules) ? pack.breakdown_modules : [],
    mechanism_options: Array.isArray(pack?.mechanism_options) ? pack.mechanism_options : [],
    materials: Array.isArray(pack?.materials) ? pack.materials : [],
    hardware: Array.isArray(pack?.hardware) ? pack.hardware : [],
    cut_list: Array.isArray(pack?.cut_list) ? pack.cut_list : [],
    assembly_steps: Array.isArray(pack?.assembly_steps) ? pack.assembly_steps : [],
    safety_notes: Array.isArray(pack?.safety_notes) ? pack.safety_notes : [],
    build_notes: Array.isArray(pack?.build_notes) ? pack.build_notes : [],
  });

  const buildContext = () => [
    `Effect Type: ${effectType}`,
    `Venue Size: ${venueSize}`,
    `Performer Style: ${performerStyle}`,
    constraints.trim() ? `Constraints: ${constraints.trim()}` : 'Constraints: (none provided)',
    `Concept: ${prompt.trim()}`,
  ].join('\n');

  const handleGenerateBuildPack = async () => {
    if (!prompt.trim()) {
      setError('Please describe your illusion concept first.');
      return;
    }
    const context = buildContext();
    const buildProfile = fastMode
      ? 'FAST BUILD PACK: keep output concise. Use 1-2 mechanism options, 8 cut-list rows max, and 8 assembly steps max.'
      : 'FULL BUILD PACK: include practical detail, but keep it readable and stage-realistic.';
    const buildPrompt = `Create a BUILD BLUEPRINT PACK for this illusion request.\n\n${context}\n\n${buildProfile}\n\n${REALISM_GUARDRAILS}\n\nProvide realistic dimensions and a concise cut list. Include mechanism ids and tag parts/steps that differ by option.`;
    try {
      setIsBuildPackLoading(true);
      setGenerationStage('Generating build pack…');
      setError(null);
      const buildResult = await generateStructuredResponse(
        buildPrompt,
        `${BUILD_BLUEPRINT_SYSTEM_INSTRUCTION}\n\n${REALISM_GUARDRAILS}`,
        buildPackSchema,
        user,
        { speedMode: fastMode ? 'fast' : 'full', maxOutputTokens: fastMode ? 1600 : 3200 }
      );
      setBuildPack(normalizeBuildPack(buildResult));
      setOpenSections((prev) => ({ ...prev, buildpack: true, cutlist: true, assembly: true, safety: true }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate build pack. Please try again.');
    } finally {
      setGenerationStage('');
      setIsBuildPackLoading(false);
    }
  };

  const handleGenerateConceptArt = async () => {
    if (!prompt.trim()) {
      setError('Please describe your illusion concept first.');
      return;
    }
    const context = buildContext();
    const artPrompt = `Dramatic, theatrical concept art for a stage illusion.\n\n${context}\n\nFocus on the magical moment from the audience's perspective. Cinematic lighting, professional digital painting style.`;
    try {
      setIsConceptLoading(true);
      setGenerationStage('Generating concept art…');
      setError(null);
      setLastArtPrompt(artPrompt);
      const img = await generateImage(artPrompt, '16:9', user);
      setConceptArt(img);
      setOpenSections((prev) => ({ ...prev, concept: true }));
    } catch (e: any) {
      setError(e?.message || 'Could not generate concept art.');
    } finally {
      setGenerationStage('');
      setIsConceptLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('Please describe your illusion concept.');
      return;
    }

    const context = buildContext();
    const speedProfile = fastMode
      ? 'FAST MODE: Keep all text concise. Max 4 bullets per list. Max 2 short sentences per paragraph.'
      : 'FULL MODE: You may add more detail, but stay practical and non-exposure.';

    setIsLoading(true);
    setGenerationStage('Generating engineering summary…');
    setError(null);
    setConceptArt(null);
    setBlueprintSheet(null);
    setEngineeringSummary(null);
    setStagingBlueprint(null);
    setBuildPack(null);
    setSelectedMechanismId('all');
    setActiveSection('engineering');
    setOpenSections((prev) => ({
      ...prev,
      engineering: true,
      concept: false,
      blueprint: false,
      principles: false,
      staging: true,
      buildpack: false,
      cutlist: false,
      assembly: false,
      safety: false,
      json: false,
    }));
    setJsonCopyStatus('idle');
    setSaveStatus('idle');

    const engineeringPrompt = `Create an ENGINEERING-MINDED SUMMARY for this stage illusion request.\n\n${context}\n\n${speedProfile}\n\n${REALISM_GUARDRAILS}\n\nSTRICT: non-exposure. Provide high-level principles and tradeoffs only. No step-by-step secrets.\n\nReturn JSON matching the schema exactly.`;
    const stagingPrompt = `Generate a STAGING blueprint for this illusion request.\n\n${context}\n\n${speedProfile}\n\n${REALISM_GUARDRAILS}\n\nProvide performance-facing principles and a clear staging description.`;

    try {
      const engineeringResult = await generateStructuredResponse(
        engineeringPrompt,
        'You are a master illusion designer and technical director. Produce practical, build-realistic, non-exposure engineering summaries for stage illusions. Output only JSON.',
        engineeringSchema,
        user,
        { speedMode: fastMode ? 'fast' : 'full', maxOutputTokens: fastMode ? 1200 : 2200 }
      );
      setEngineeringSummary(engineeringResult as EngineeringSummary);

      setGenerationStage('Drafting staging blueprint…');
      const stagingResult = await generateStructuredResponse(
        stagingPrompt,
        'You are an expert stage illusion designer.',
        stagingSchema,
        user,
        { speedMode: fastMode ? 'fast' : 'full', maxOutputTokens: fastMode ? 1000 : 1800 }
      );
      setStagingBlueprint(stagingResult as StagingBlueprint);

      if (!fastMode) {
        await handleGenerateBuildPack();
        await handleGenerateConceptArt();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred. Please try again.');
    } finally {
      setGenerationStage('');
      setIsLoading(false);
    }
  };


const handleGenerateBlueprint = async () => {
  if (!prompt.trim()) {
    setError('Please describe your illusion concept first.');
    return;
  }
  if (!buildPack?.overall_dimensions) {
    setError('Generate an illusion first so we have dimensions for the blueprint sheet.');
    return;
  }

  setIsBlueprintLoading(true);
  setError(null);

  const d = buildPack.overall_dimensions;
  const dimsLine = `Overall dimensions: W ${d.width_in} in (${d.width_mm} mm) × D ${d.depth_in} in (${d.depth_mm} mm) × H ${d.height_in} in (${d.height_mm} mm).`;

  const blueprintPrompt = [
    'Create a clean TECHNICAL BLUEPRINT SHEET for a theatrical stage illusion prop.',
    'Style: orthographic blueprint drawing, crisp white line-art on a blueprint background, no shading, no perspective.',
    'Include FRONT, SIDE, and TOP views on the same sheet, with dimension lines, arrows, and labeled measurements.',
    'Include a simple title block with the illusion name and the overall dimensions.',
    'Keep it readable and print-friendly.',
    '',
    `Illusion request details:\nEffect Type: ${effectType}\nVenue Size: ${venueSize}\nPerformer Style: ${performerStyle}\nConstraints: ${constraints.trim() || '(none provided)'}\nConcept: ${prompt}`,
    dimsLine,
  ].join('\n');

  try {
    const img = await generateImage(blueprintPrompt);
    setBlueprintSheet(img);
    setOpenSections((prev) => ({ ...prev, blueprint: true }));
    setActiveSection('blueprint');
    // Scroll after the image renders
    setTimeout(() => scrollToSection('blueprint'), 50);
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Failed to generate blueprint sheet. Please try again.');
  } finally {
    setIsBlueprintLoading(false);
  }
};


const handleRegenerateConceptArt = async () => {
  await handleGenerateConceptArt();
};


  const toFiltered = <T extends { applies_to?: string[] }>(arr: T[]): T[] => {
    if (selectedMechanismId === 'all') return arr;
    return arr.filter((x) => !x.applies_to || x.applies_to.includes(selectedMechanismId));
  };

  const filteredModules = useMemo(() => (buildPack ? toFiltered(buildPack.breakdown_modules || []) : []), [buildPack, selectedMechanismId]);
  const filteredMaterials = useMemo(() => (buildPack ? toFiltered(buildPack.materials || []) : []), [buildPack, selectedMechanismId]);
  const filteredHardware = useMemo(() => (buildPack ? toFiltered(buildPack.hardware || []) : []), [buildPack, selectedMechanismId]);
  const filteredCutList = useMemo(() => (buildPack ? toFiltered(buildPack.cut_list || []) : []), [buildPack, selectedMechanismId]);
  const filteredSteps = useMemo(() => (buildPack ? toFiltered(buildPack.assembly_steps || []) : []), [buildPack, selectedMechanismId]);

  const buildFullContent = () => {
    if (!engineeringSummary || !stagingBlueprint) return '';
    let fullContent = `## Illusion Blueprint: ${prompt}\n\n`;
    fullContent += `**Effect Type:** ${effectType}\n\n`;
    fullContent += `**Venue Size:** ${venueSize}\n\n`;
    fullContent += `**Performer Style:** ${performerStyle}\n\n`;
    if (constraints.trim()) fullContent += `**Constraints:** ${constraints.trim()}\n\n`;
    fullContent += `### Engineering Summary\n\n`;
    fullContent += `**Title:** ${engineeringSummary.title}\n\n`;
    fullContent += `**Audience Experience:** ${engineeringSummary.audience_experience}\n\n`;
    fullContent += `**Build Complexity (1–5):** ${engineeringSummary.build_complexity.rating_1_to_5} — ${engineeringSummary.build_complexity.rationale}\n\n`;
    fullContent += `**Reset Time:** ${engineeringSummary.reset_time}\n\n`;
    fullContent += `**Angle Risk Summary:**\n- Front: ${engineeringSummary.angle_risk_summary.front}\n- Sides: ${engineeringSummary.angle_risk_summary.sides}\n- Balcony: ${engineeringSummary.angle_risk_summary.balcony}\n\n`;
    fullContent += `**Reality Checks:**\n- Weight/Transport: ${engineeringSummary.reality_checks.weight_transport}\n- Crew: ${engineeringSummary.reality_checks.crew}\n- Setup Time: ${engineeringSummary.reality_checks.setup_time}\n\n`;
    fullContent += `**Feasibility Verdict:** ${engineeringSummary.feasibility_verdict.level} — ${engineeringSummary.feasibility_verdict.why}\n\n`;
    if (conceptArt) fullContent += `![Concept Art](${conceptArt})\n\n`;
    fullContent += `### Potential Principles\n\n`;
    stagingBlueprint.potential_principles.forEach((p) => {
      fullContent += `**${p.name}:** ${p.description}\n\n`;
    });
    fullContent += `### Staging Blueprint\n\n${stagingBlueprint.blueprint_description}\n\n`;
    fullContent += `### Build Blueprint Pack (JSON)\n\n`;
    fullContent += JSON.stringify(buildPack, null, 2);
    return fullContent;
  };

  const handleSave = () => {
    if (!engineeringSummary || !stagingBlueprint) return;
    const fullContent = buildFullContent();
    const titleBase = prompt.trim() || safeBlueprintTitle;
    saveIdea('text', fullContent, `Illusion Blueprint (${effectType}) — ${titleBase}`);
    onIdeaSaved();
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2000);
  };

  const handleCopyAll = async () => {
    try {
      const fullContent = buildFullContent();
      if (!fullContent) return;
      await navigator.clipboard.writeText(fullContent);
      setCopyAllStatus('copied');
      setTimeout(() => setCopyAllStatus('idle'), 1500);
    } catch {
      // Clipboard can be blocked by browser permissions; user can still copy manually.
    }
  };

  const buildSectionContent = (id: SectionId) => {
    if (!engineeringSummary || !stagingBlueprint || !buildPack) return '';
    const header = `## Illusion Blueprint: ${prompt || buildPack.title}\n`;
    const meta = `Effect Type: ${effectType}\nVenue: ${venueSize}\nStyle: ${performerStyle}${constraints.trim() ? `\nConstraints: ${constraints.trim()}` : ''}\n\n`;

    switch (id) {
      case 'engineering': {
        return (
          header +
          meta +
          `### Engineering Summary\n\n` +
          `Title: ${engineeringSummary.title}\n\n` +
          `Audience Experience: ${engineeringSummary.audience_experience}\n\n` +
          `Method Possibilities (non-exposure):\n- A: ${engineeringSummary.secret_method_possibilities.method_a}\n- B: ${engineeringSummary.secret_method_possibilities.method_b}\n- C: ${engineeringSummary.secret_method_possibilities.method_c}\n\n` +
          `Stage Staging:\n- Lighting: ${engineeringSummary.stage_staging.lighting}\n- Blocking: ${engineeringSummary.stage_staging.blocking}\n- Angles: ${engineeringSummary.stage_staging.angles}\n\n` +
          `Technical Requirements:\n- Assistants: ${engineeringSummary.technical_requirements.assistants}\n- Props: ${engineeringSummary.technical_requirements.props.join(', ')}\n- Mechanics: ${engineeringSummary.technical_requirements.mechanics.join(', ')}\n\n` +
          `Safety Notes:\n${engineeringSummary.safety_notes.map((s) => `- ${s}`).join('\n')}\n\n` +
          `Reset Time: ${engineeringSummary.reset_time}\n\n` +
          `Build Complexity (1–5): ${engineeringSummary.build_complexity.rating_1_to_5} — ${engineeringSummary.build_complexity.rationale}\n\n` +
          `Reality Checks:\n- Weight/Transport: ${engineeringSummary.reality_checks.weight_transport}\n- Crew: ${engineeringSummary.reality_checks.crew}\n- Setup Time: ${engineeringSummary.reality_checks.setup_time}\n\n` +
          `Angle Risk Summary:\n- Front: ${engineeringSummary.angle_risk_summary.front}\n- Sides: ${engineeringSummary.angle_risk_summary.sides}\n- Balcony: ${engineeringSummary.angle_risk_summary.balcony}\n\n` +
          `Feasibility Verdict: ${engineeringSummary.feasibility_verdict.level} — ${engineeringSummary.feasibility_verdict.why}\n`
        );
      }
      case 'concept': {
        return (
          header +
          meta +
          `### Concept Art\n\n` +
          (lastArtPrompt ? `Prompt used: ${lastArtPrompt}\n\n` : '') +
          (conceptArt ? `Image URL: ${conceptArt}\n` : 'No concept art generated.')
        );
      }
      case 'blueprint': {
        return header + meta + `### Blueprint Sheet\n\n` + (blueprintSheet ? `Image URL: ${blueprintSheet}\n` : 'No blueprint sheet generated.');
      }
      case 'principles': {
        return (
          header +
          meta +
          `### Potential Principles\n\n` +
          stagingBlueprint.potential_principles.map((p) => `- ${p.name}: ${p.description}`).join('\n') +
          `\n`
        );
      }
      case 'staging': {
        return header + meta + `### Staging Blueprint\n\n${stagingBlueprint.blueprint_description}\n`;
      }
      case 'buildpack': {
        return header + meta + `### Build Blueprint Pack (JSON)\n\n${JSON.stringify(buildPack, null, 2)}\n`;
      }
      case 'cutlist': {
        const lines = filteredCutList.map((c) => `- ${c.part} (${c.material}, ${c.thickness}) x${c.qty} — ${c.size_in} / ${c.size_mm}${c.notes ? ` — ${c.notes}` : ''}`);
        return header + meta + `### Cut List\n\n${lines.join('\n')}\n`;
      }
      case 'assembly': {
        const steps = filteredSteps.map((s) => `${s.step}. ${s.text}`);
        return header + meta + `### Assembly Steps\n\n${steps.join('\n')}\n`;
      }
      case 'safety': {
        const merged = Array.from(new Set([...(engineeringSummary.safety_notes || []), ...(buildPack.safety_notes || [])]));
        return header + meta + `### Safety Notes\n\n${merged.map((s) => `- ${s}`).join('\n')}\n`;
      }
      case 'json': {
        return header + meta + `### Raw JSON\n\n${rawJson}\n`;
      }
      default:
        return '';
    }
  };

  const handleCopySection = async (id: SectionId) => {
    try {
      const text = buildSectionContent(id);
      if (!text) return;
      await navigator.clipboard.writeText(text);
      setSectionCopyStatus((prev) => ({ ...prev, [id]: 'copied' }));
      setTimeout(() => setSectionCopyStatus((prev) => ({ ...prev, [id]: 'idle' })), 1200);
    } catch {
      // ignore
    }
  };

  const handleStartOver = () => {
    setPrompt('');
    setEffectType('Appearance');
    setVenueSize('Stage');
    setPerformerStyle('Mystery');
    setConstraints('');
    setConceptArt(null);
    setBlueprintSheet(null);
    setEngineeringSummary(null);
    setStagingBlueprint(null);
    setBuildPack(null);
    setError(null);
    setSelectedMechanismId('all');
    setActiveSection('engineering');
    setOpenSections({
      engineering: true,
      concept: true,
      blueprint: true,
      principles: true,
      staging: true,
      buildpack: true,
      cutlist: true,
      assembly: true,
      safety: true,
      json: false,
    });
    setJsonCopyStatus('idle');
    setCopyAllStatus('idle');
    setSectionCopyStatus({
      engineering: 'idle',
      concept: 'idle',
      blueprint: 'idle',
      principles: 'idle',
      staging: 'idle',
      buildpack: 'idle',
      cutlist: 'idle',
      assembly: 'idle',
      safety: 'idle',
      json: 'idle',
    });
    setSaveStatus('idle');
  };

  const rawJson = useMemo(() => (buildPack ? JSON.stringify(buildPack, null, 2) : ''), [buildPack]);

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(rawJson);
      setJsonCopyStatus('copied');
      setTimeout(() => setJsonCopyStatus('idle'), 1500);
    } catch {
      // fallback: nothing (clipboard may be blocked); user can select/copy manually
    }
  };

  const handleDownloadJson = () => {
    if (!rawJson) return;
    const safeName = (prompt || buildPack?.title || 'illusion-blueprint')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 64);

    const blob = new Blob([rawJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName || 'illusion-blueprint'}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const toggleSection = (id: SectionId) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const setAllSections = (open: boolean) => {
    setOpenSections({
      engineering: open,
      concept: open,
      blueprint: open,
      principles: open,
      staging: open,
      buildpack: open,
      cutlist: open,
      assembly: open,
      safety: open,
      // Keep Raw JSON closed by default unless explicitly opened.
      json: open ? openSections.json : false,
    });
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-4 md:p-6 animate-fade-in">
      <header className="mb-6">
        <div className="flex items-center gap-3">
          <BlueprintIcon className="w-8 h-8 text-purple-400" />
          <h2 className="text-2xl font-bold text-slate-200 font-cinzel">Illusion Blueprint Generator</h2>
        </div>
        <p className="text-slate-400 mt-1">From a simple concept to stage-ready plans. Generate concept art, staging, and build-ready construction plans.</p>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 overflow-hidden">
        {/* LEFT COLUMN — Inputs */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/20 p-4 md:p-5 overflow-y-auto">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="text-xs text-slate-400">Demo presets:</div>
            {DEMO_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setPrompt(p.concept);
                  setEffectType(p.effectType);
                  setVenueSize(p.venue);
                  setPerformerStyle(p.style);
                  setConstraints(p.constraints || '');
                  setError(null);
                }}
                className="px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border bg-slate-900/40 border-slate-700 text-slate-200 hover:border-slate-500"
              >
                {p.label}
              </button>
            ))}

            <button
              type="button"
              onClick={handleStartOver}
              className="ml-auto px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border bg-slate-900/40 border-slate-700 text-slate-200 hover:border-slate-500"
            >
              Reset
            </button>
          </div>

          <div className="mb-4 rounded-xl border border-slate-800 bg-slate-900/30 p-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-200">Booth Demo Speed</div>
              <div className="text-xs text-slate-400">Fast = summary + staging first. Full adds build pack + art automatically.</div>
            </div>
            <button
              type="button"
              onClick={() => setFastMode((v) => !v)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${fastMode ? 'bg-purple-600/30 border-purple-500 text-purple-200' : 'bg-slate-900/40 border-slate-700 text-slate-200'}`}
            >
              {fastMode ? 'Fast: ON' : 'Full: ON'}
            </button>
          </div>

          {/* Micro-help (parity with other tools) */}
          <div className="mb-4 rounded-xl border border-slate-800 bg-slate-900/30 p-3">
            <div className="text-sm font-semibold text-slate-200">Why use this?</div>
            <ul className="mt-1 text-xs text-slate-400 list-disc pl-5 space-y-1">
              <li>Turns an illusion idea into a structured, stage-ready blueprint.</li>
              <li>Adds staging + safety + reset thinking so concepts stay realistic.</li>
              <li>Provides build-ready details (modules, materials, cut list) you can hand to a fabricator.</li>
            </ul>
          </div>

          {/* Inputs */}
          <div className="space-y-3">
            <div>
              <div className="text-xs font-semibold text-slate-300 mb-1">Effect Type</div>
              <div className="flex flex-wrap gap-2">
                {EFFECT_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setEffectType(t)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border ${
                      effectType === t
                        ? 'bg-purple-600/30 border-purple-500 text-purple-200'
                        : 'bg-slate-900/40 border-slate-700 text-slate-200 hover:border-slate-500'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 mb-1 block">Venue Size</label>
                <select
                  value={venueSize}
                  onChange={(e) => setVenueSize(e.target.value as VenueSize)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white focus:outline-none focus:border-purple-500 transition-colors"
                >
                  {VENUE_SIZES.map((v) => (
                    <option key={v} value={v}>
                      {v}
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
                  {PERFORMER_STYLES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 mb-1 block">Constraints (optional)</label>
              <textarea
                rows={3}
                value={constraints}
                onChange={(e) => {
                  setConstraints(e.target.value);
                  setError(null);
                }}
                placeholder="Props available, stage limitations, budget range, crew size, reset requirements…"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 mb-1 block">Core Concept</label>
              <textarea
                rows={4}
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  setError(null);
                }}
                placeholder="e.g., I want to make a motorcycle appear from a cloud of smoke on an empty stage."
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={isLoading || !prompt.trim()}
            className="w-full py-3 mt-4 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed"
          >
            <WandIcon className="w-5 h-5" />
            <span>{isLoading ? 'Generating…' : 'Generate Blueprint'}</span>
          </button>
          {error && <p className="text-red-400 mt-2 text-sm">{error}</p>}
        </div>

        {/* RIGHT COLUMN — Output */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/20 overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-200">Blueprint Output</div>
              <div className="text-xs text-slate-500">Fast mode returns summary + staging first. Add art/build pack on demand.</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleCopyAll()}
                disabled={!hasCoreOutput}
                className="px-3 py-1.5 rounded-md text-[11px] font-semibold border border-slate-700 bg-slate-900/60 text-slate-200 hover:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Copy the full blueprint"
              >
                {copyAllStatus === 'copied' ? 'Copied!' : 'Copy Blueprint'}
              </button>
              {hasCoreOutput && !conceptArt ? (
                <button
                  type="button"
                  onClick={handleGenerateConceptArt}
                  disabled={isConceptLoading || isLoading}
                  className="px-3 py-1.5 rounded-md text-[11px] font-semibold border border-slate-700 bg-slate-900/60 text-slate-200 hover:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isConceptLoading ? 'Generating Art…' : 'Generate Art'}
                </button>
              ) : null}
              {hasCoreOutput && !buildPack ? (
                <button
                  type="button"
                  onClick={handleGenerateBuildPack}
                  disabled={isBuildPackLoading || isLoading}
                  className="px-3 py-1.5 rounded-md text-[11px] font-semibold border border-slate-700 bg-slate-900/60 text-slate-200 hover:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isBuildPackLoading ? 'Generating Build…' : 'Generate Build Pack'}
                </button>
              ) : null}
              <div className="text-[11px] text-slate-500">Version: {APP_VERSION}</div>
            </div>
          </div>

          <div ref={containerRef} className="flex-1 overflow-y-auto p-4 md:p-5">
            {!hasCoreOutput ? (
              <div className="h-full flex items-center justify-center">
                {isLoading ? (
                  <LoadingIndicator stage={generationStage} />
                ) : (
                  <div className="max-w-md text-center">
                    <div className="text-slate-200 font-semibold">Your blueprint will appear here.</div>
                    <div className="text-sm text-slate-400 mt-2">
                      Choose an effect type, venue, and style — then generate a structured blueprint that stays realistic.
                    </div>
                    <div className="mt-3 text-xs text-slate-500">
                      Tip: Demo presets are great for booth flow.
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-6">
          {/* Sticky Mini-Nav */}
          <div className="sticky top-0 z-20 -mx-4 md:-mx-5 px-4 md:px-5 py-3 bg-slate-950/80 backdrop-blur border-b border-slate-800">
            <div className="flex flex-wrap items-center gap-2">
              {SECTION_IDS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => scrollToSection(s.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border ${
                    activeSection === s.id
                      ? 'bg-purple-600/30 border-purple-500 text-purple-200'
                      : 'bg-slate-900/40 border-slate-700 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  {s.label}
                </button>
              ))}

              {buildPack ? (
                <div className="flex items-center gap-2 ml-1">
                  <span className="text-[11px] text-slate-400">Mechanism:</span>
                  <select
                    value={selectedMechanismId}
                    onChange={(e) => setSelectedMechanismId(e.target.value)}
                    className="bg-slate-900 border border-slate-700 text-slate-200 text-[11px] rounded-md px-2 py-1 focus:outline-none focus:border-purple-500"
                  >
                    <option value="all">All</option>
                    {(buildPack?.mechanism_options ?? []).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={handleGenerateBlueprint}
                    disabled={isBlueprintLoading}
                    className="px-3 py-1.5 rounded-md text-[11px] font-semibold border border-slate-700 bg-slate-900/60 text-slate-200 hover:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Generate blueprint-style orthographic plan image"
                  >
                    {isBlueprintLoading ? "Generating Blueprint…" : "Generate Blueprint Sheet"}
                  </button>
                </div>
              ) : null}

              {/* Expand/collapse controls */}
              <button
                type="button"
                onClick={() => setAllSections(true)}
                className="px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border bg-slate-900/40 border-slate-700 text-slate-300 hover:border-slate-500"
              >
                Expand all
              </button>
              <button
                type="button"
                onClick={() => setAllSections(false)}
                className="px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border bg-slate-900/40 border-slate-700 text-slate-300 hover:border-slate-500"
              >
                Collapse all
              </button>

              <div className="ml-auto text-[11px] text-slate-400">{APP_VERSION}</div>
            </div>
          </div>

          {/* Engineering Summary */}
          <CollapsibleSection
            id="engineering"
            title="Engineering Summary"
            isOpen={openSections.engineering}
            onToggle={() => toggleSection('engineering')}
            onCopy={() => void handleCopySection('engineering')}
            copied={sectionCopyStatus.engineering === 'copied'}
          >
            <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 space-y-4">
              <div>
                <div className="text-xs text-slate-400">Title</div>
                <div className="text-lg font-bold text-white font-cinzel">{engineeringSummary.title}</div>
              </div>

              <div>
                <div className="text-xs text-slate-400">Audience Experience</div>
                <div className="text-sm text-slate-200 leading-relaxed">{engineeringSummary.audience_experience}</div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-800 bg-slate-950/20 p-3">
                  <div className="text-xs text-slate-400">Build Complexity (1–5)</div>
                  <div className="text-sm text-slate-200 font-semibold">
                    {engineeringSummary.build_complexity.rating_1_to_5} / 5
                  </div>
                  <div className="text-xs text-slate-400 mt-1">{engineeringSummary.build_complexity.rationale}</div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/20 p-3">
                  <div className="text-xs text-slate-400">Reset Time</div>
                  <div className="text-sm text-slate-200 font-semibold">{engineeringSummary.reset_time}</div>
                  <div className="text-xs text-slate-400 mt-1">
                    Feasibility: <span className="text-slate-200 font-semibold">{engineeringSummary.feasibility_verdict.level}</span> —
                    <span className="text-slate-400"> {engineeringSummary.feasibility_verdict.why}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-800 bg-slate-950/20 p-3">
                  <div className="text-xs text-slate-400">Angle Risk Summary</div>
                  <ul className="mt-2 text-xs text-slate-300 space-y-1">
                    <li><span className="text-slate-400">Front:</span> {engineeringSummary.angle_risk_summary.front}</li>
                    <li><span className="text-slate-400">Sides:</span> {engineeringSummary.angle_risk_summary.sides}</li>
                    <li><span className="text-slate-400">Balcony:</span> {engineeringSummary.angle_risk_summary.balcony}</li>
                  </ul>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/20 p-3">
                  <div className="text-xs text-slate-400">Reality Checks</div>
                  <ul className="mt-2 text-xs text-slate-300 space-y-1">
                    <li><span className="text-slate-400">Weight/Transport:</span> {engineeringSummary.reality_checks.weight_transport}</li>
                    <li><span className="text-slate-400">Crew:</span> {engineeringSummary.reality_checks.crew}</li>
                    <li><span className="text-slate-400">Setup Time:</span> {engineeringSummary.reality_checks.setup_time}</li>
                  </ul>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-800 bg-slate-950/20 p-3">
                  <div className="text-xs text-slate-400 mb-2">Secret Method Possibilities (non-exposure)</div>
                  <div className="text-xs text-slate-300 space-y-2">
                    <div><span className="text-slate-400 font-semibold">A:</span> {engineeringSummary.secret_method_possibilities.method_a}</div>
                    <div><span className="text-slate-400 font-semibold">B:</span> {engineeringSummary.secret_method_possibilities.method_b}</div>
                    <div><span className="text-slate-400 font-semibold">C:</span> {engineeringSummary.secret_method_possibilities.method_c}</div>
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/20 p-3">
                  <div className="text-xs text-slate-400 mb-2">Stage Staging</div>
                  <div className="text-xs text-slate-300 space-y-2">
                    <div><span className="text-slate-400 font-semibold">Lighting:</span> {engineeringSummary.stage_staging.lighting}</div>
                    <div><span className="text-slate-400 font-semibold">Blocking:</span> {engineeringSummary.stage_staging.blocking}</div>
                    <div><span className="text-slate-400 font-semibold">Angles:</span> {engineeringSummary.stage_staging.angles}</div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-800 bg-slate-950/20 p-3">
                  <div className="text-xs text-slate-400 mb-2">Technical Requirements</div>
                  <div className="text-xs text-slate-300">
                    <div className="mb-2"><span className="text-slate-400 font-semibold">Assistants:</span> {engineeringSummary.technical_requirements.assistants}</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <div className="text-[11px] text-slate-400 font-semibold">Props</div>
                        <ul className="mt-1 list-disc pl-5 space-y-1">
                          {engineeringSummary.technical_requirements.props.map((p, i) => (
                            <li key={i}>{p}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <div className="text-[11px] text-slate-400 font-semibold">Mechanics</div>
                        <ul className="mt-1 list-disc pl-5 space-y-1">
                          {engineeringSummary.technical_requirements.mechanics.map((m, i) => (
                            <li key={i}>{m}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/20 p-3">
                  <div className="text-xs text-slate-400 mb-2">Safety Notes</div>
                  <ul className="text-xs text-slate-300 list-disc pl-5 space-y-1">
                    {engineeringSummary.safety_notes.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </CollapsibleSection>

          {/* Concept Art */}
          {conceptArt ? (
            <CollapsibleSection
              id="concept"
              title="Concept Art"
              isOpen={openSections.concept}
              onToggle={() => toggleSection('concept')}
              onCopy={() => void handleCopySection('concept')}
              copied={sectionCopyStatus.concept === 'copied'}
            >
              <img
                src={conceptArt}
                alt="Generated concept art for the illusion"
                className="w-full rounded-lg border border-slate-700"
              />
            
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleRegenerateConceptArt}
                  disabled={isConceptLoading || isLoading}
                  className="px-3 py-1.5 rounded-md text-sm font-semibold border border-slate-700/60 bg-slate-900/40 text-slate-200 hover:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isConceptLoading ? 'Regenerating…' : 'Regenerate Concept Art'}
                </button>
              </div>
</CollapsibleSection>
          ) : null}

          {/* Principles */}
          

{/* Blueprint Sheet (quick win) */}
{buildPack ? (
  <CollapsibleSection
    id="blueprint"
    title="Blueprint Sheet"
    isOpen={openSections.blueprint}
    onToggle={() => toggleSection('blueprint')}
    onCopy={() => void handleCopySection('blueprint')}
    copied={sectionCopyStatus.blueprint === 'copied'}
  >
    {!blueprintSheet ? (
      <div className="rounded-md border border-slate-700/60 bg-slate-900/40 p-4">
        <p className="text-sm text-slate-200 font-semibold mb-1">Blueprint-style plan image</p>
        <p className="text-sm text-slate-300">
          Generate an orthographic “blueprint sheet” (front/side/top views) for quick planning and sharing.
          Measurements are based on the Build Pack dimensions — always verify before cutting.
        </p>
        <div className="mt-3">
          <button
            type="button"
            onClick={handleGenerateBlueprint}
            disabled={isBlueprintLoading}
            className="px-4 py-2 rounded-md font-semibold bg-yellow-600 hover:bg-yellow-500 text-black disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isBlueprintLoading ? 'Generating Blueprint…' : 'Generate Blueprint Sheet'}
          </button>
        </div>
      </div>
    ) : (
      <div>
        <img
          src={blueprintSheet}
          alt="Generated blueprint sheet for the illusion"
          className="w-full rounded-lg border border-slate-700"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleGenerateBlueprint}
            disabled={isBlueprintLoading}
            className="px-3 py-1.5 rounded-md text-sm font-semibold border border-slate-700 bg-slate-900/60 text-slate-200 hover:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isBlueprintLoading ? 'Regenerating…' : 'Regenerate Blueprint'}
          </button>
        </div>
      </div>
    )}
  </CollapsibleSection>
) : null}

<CollapsibleSection
            id="principles"
            title="Potential Principles"
            isOpen={openSections.principles}
            onToggle={() => toggleSection('principles')}
            onCopy={() => void handleCopySection('principles')}
            copied={sectionCopyStatus.principles === 'copied'}
          >
            <div className="space-y-3">
                {stagingBlueprint.potential_principles.map((principle, i) => (
                  <div key={i} className="bg-slate-800/50 p-3 rounded-md border border-slate-700/50">
                    <h4 className="font-semibold text-purple-300">{principle.name}</h4>
                    <p className="text-sm text-slate-400">{principle.description}</p>
                  </div>
                ))}
            </div>
          </CollapsibleSection>

          {/* Staging */}
          <CollapsibleSection
            id="staging"
            title="Staging Blueprint"
            isOpen={openSections.staging}
            onToggle={() => toggleSection('staging')}
            onCopy={() => void handleCopySection('staging')}
            copied={sectionCopyStatus.staging === 'copied'}
          >
            <div className="bg-slate-800/50 p-3 rounded-md border border-slate-700/50">
              <pre className="whitespace-pre-wrap break-words text-slate-300 font-sans text-sm">{stagingBlueprint.blueprint_description}</pre>
            </div>
          </CollapsibleSection>

          {/* Build Pack */}
          {buildPack ? (
          <CollapsibleSection
            id="buildpack"
            title="Build Blueprint Pack"
            isOpen={openSections.buildpack}
            onToggle={() => toggleSection('buildpack')}
            onCopy={() => void handleCopySection('buildpack')}
            copied={sectionCopyStatus.buildpack === 'copied'}
          >
            <div className="space-y-4">
                <div className="bg-slate-800/50 p-4 rounded-md border border-slate-700/50">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                    <div>
                      <h4 className="text-white font-semibold">{buildPack.title}</h4>
                      <p className="text-slate-300 text-sm mt-1">{buildPack.intended_effect}</p>
                    </div>
                  </div>

                  {/* Dimensions callout */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
                    <div className="bg-slate-900/40 border border-slate-700/50 rounded-md p-3">
                      <div className="text-xs text-slate-400">Width</div>
                      <div className="text-slate-200 font-semibold">{buildPack.overall_dimensions.width_in}"</div>
                      <div className="text-xs text-slate-400">{buildPack.overall_dimensions.width_mm} mm</div>
                    </div>
                    <div className="bg-slate-900/40 border border-slate-700/50 rounded-md p-3">
                      <div className="text-xs text-slate-400">Depth</div>
                      <div className="text-slate-200 font-semibold">{buildPack.overall_dimensions.depth_in}"</div>
                      <div className="text-xs text-slate-400">{buildPack.overall_dimensions.depth_mm} mm</div>
                    </div>
                    <div className="bg-slate-900/40 border border-slate-700/50 rounded-md p-3">
                      <div className="text-xs text-slate-400">Height</div>
                      <div className="text-slate-200 font-semibold">{buildPack.overall_dimensions.height_in}"</div>
                      <div className="text-xs text-slate-400">{buildPack.overall_dimensions.height_mm} mm</div>
                    </div>
                    <div className="bg-slate-900/40 border border-slate-700/50 rounded-md p-3">
                      <div className="text-xs text-slate-400">Tolerance</div>
                      <div className="text-slate-200 font-semibold">
                        {(buildPack.overall_dimensions.tolerance_in ?? 0.125).toFixed(3)}"
                      </div>
                      <div className="text-xs text-slate-400">{buildPack.overall_dimensions.tolerance_mm ?? 3} mm</div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                    {(buildPack?.mechanism_options ?? []).map((m) => {
                      const isActive = selectedMechanismId === m.id;
                      return (
                        <div
                          key={m.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedMechanismId((prev) => (prev === m.id ? 'all' : m.id))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSelectedMechanismId((prev) => (prev === m.id ? 'all' : m.id));
                            }
                          }}
                          className={`rounded-md border p-3 bg-slate-900/30 ${
                            isActive ? 'border-purple-500/70' : 'border-slate-700/50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <h5 className="text-slate-200 font-semibold text-sm">{m.name}</h5>
                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
                              {m.difficulty}
                            </span>
                          </div>
                          <p className="text-xs text-slate-300 mt-1">{m.description}</p>
                          <div className="mt-2">
                            <div className="text-[11px] text-slate-400">Key components</div>
                            <ul className="list-disc list-inside text-xs text-slate-300 mt-1 space-y-1">
                              {m.key_components.slice(0, 4).map((k, idx) => (
                                <li key={idx}>{k}</li>
                              ))}
                            </ul>
                          </div>
                          {isActive ? (
                            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <div className="text-[11px] text-slate-400">Pros</div>
                                <ul className="list-disc list-inside text-xs text-slate-300 mt-1 space-y-1">
                                  {m.pros.slice(0, 4).map((p, idx) => (
                                    <li key={idx}>{p}</li>
                                  ))}
                                </ul>
                              </div>
                              <div>
                                <div className="text-[11px] text-slate-400">Cons</div>
                                <ul className="list-disc list-inside text-xs text-slate-300 mt-1 space-y-1">
                                  {m.cons.slice(0, 4).map((c, idx) => (
                                    <li key={idx}>{c}</li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Modules / Materials / Hardware */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="bg-slate-800/50 p-4 rounded-md border border-slate-700/50">
                    <h4 className="text-white font-semibold">Modules</h4>
                    <ul className="mt-2 space-y-2">
                      {filteredModules.map((m) => (
                        <li key={m.id} className="text-sm text-slate-300">
                          <span className="text-purple-300 font-semibold">{m.name}:</span> {m.notes}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="bg-slate-800/50 p-4 rounded-md border border-slate-700/50">
                    <h4 className="text-white font-semibold">Materials</h4>
                    <ul className="mt-2 space-y-2">
                      {filteredMaterials.map((m, idx) => (
                        <li key={`${m.item}-${idx}`} className="text-sm text-slate-300">
                          <span className="text-purple-300 font-semibold">{m.qty}×</span> {m.item} —{' '}
                          <span className="text-slate-200">{m.spec}</span>
                          {m.notes ? <div className="text-xs text-slate-400 mt-0.5">{m.notes}</div> : null}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="bg-slate-800/50 p-4 rounded-md border border-slate-700/50">
                    <h4 className="text-white font-semibold">Hardware</h4>
                    <ul className="mt-2 space-y-2">
                      {filteredHardware.map((h, idx) => (
                        <li key={`${h.item}-${idx}`} className="text-sm text-slate-300">
                          <span className="text-purple-300 font-semibold">{h.qty}×</span> {h.item} —{' '}
                          <span className="text-slate-200">{h.spec}</span>
                          {h.notes ? <div className="text-xs text-slate-400 mt-0.5">{h.notes}</div> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
            </div>
          </CollapsibleSection>
          ) : null}

          {/* Cut list */}
          {buildPack ? (
          <CollapsibleSection
            id="cutlist"
            title="Cut List"
            isOpen={openSections.cutlist}
            onToggle={() => toggleSection('cutlist')}
            onCopy={() => void handleCopySection('cutlist')}
            copied={sectionCopyStatus.cutlist === 'copied'}
          >
            <div className="overflow-x-auto bg-slate-800/40 border border-slate-700/50 rounded-md">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-900/60 text-slate-200">
                    <tr>
                      <th className="px-3 py-2">Part</th>
                      <th className="px-3 py-2">Material</th>
                      <th className="px-3 py-2">Thk</th>
                      <th className="px-3 py-2">Qty</th>
                      <th className="px-3 py-2">Size (in)</th>
                      <th className="px-3 py-2">Size (mm)</th>
                      <th className="px-3 py-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-300">
                    {filteredCutList.map((c, idx) => (
                      <tr key={`${c.part}-${idx}`} className="border-t border-slate-700/40">
                        <td className="px-3 py-2 font-semibold text-slate-200">{c.part}</td>
                        <td className="px-3 py-2">{c.material}</td>
                        <td className="px-3 py-2">{c.thickness}</td>
                        <td className="px-3 py-2">{c.qty}</td>
                        <td className="px-3 py-2">{c.size_in}</td>
                        <td className="px-3 py-2">{c.size_mm}</td>
                        <td className="px-3 py-2 text-xs text-slate-400">{c.notes ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="text-xs text-slate-400 mt-2">
                Tip: Verify stock thickness, kerf, and square before final assembly. Treat dimensions as nominal and test-fit critical parts.
              </div>
          </CollapsibleSection>
          ) : null}

          {/* Assembly */}
          {buildPack ? (
          <CollapsibleSection
            id="assembly"
            title="Assembly Steps"
            isOpen={openSections.assembly}
            onToggle={() => toggleSection('assembly')}
            onCopy={() => void handleCopySection('assembly')}
            copied={sectionCopyStatus.assembly === 'copied'}
          >
            <div className="bg-slate-800/50 p-4 rounded-md border border-slate-700/50">
                <ol className="list-decimal list-inside space-y-2 text-slate-300">
                  {filteredSteps
                    .slice()
                    .sort((a, b) => a.step - b.step)
                    .map((s) => (
                      <li key={s.step} className="text-sm">
                        {s.text}
                      </li>
                    ))}
                </ol>

                {buildPack.build_notes?.length ? (
                  <div className="mt-4">
                    <h4 className="text-white font-semibold">Build Notes</h4>
                    <ul className="mt-2 list-disc list-inside text-sm text-slate-300 space-y-1">
                      {buildPack.build_notes.map((n, idx) => (
                        <li key={idx}>{n}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
            </div>
          </CollapsibleSection>
          ) : null}

          {/* Safety */}
          {buildPack ? (
          <CollapsibleSection
            id="safety"
            title="Safety & Stability"
            isOpen={openSections.safety}
            onToggle={() => toggleSection('safety')}
            onCopy={() => void handleCopySection('safety')}
            copied={sectionCopyStatus.safety === 'copied'}
          >
            <div className="bg-slate-800/50 p-4 rounded-md border border-slate-700/50">
                <ul className="list-disc list-inside text-sm text-slate-300 space-y-1">
                  {(buildPack?.safety_notes ?? []).map((n, idx) => (
                    <li key={idx}>{n}</li>
                  ))}
                </ul>
            </div>
          </CollapsibleSection>
          ) : null}

          {/* Blueprint Data Info Box */}
{buildPack ? (
<div className="mb-4 rounded-md border border-slate-700/60 bg-slate-800/40 p-4 text-sm text-slate-300">
  <div className="mb-1 font-semibold text-slate-200">Blueprint Data (Advanced)</div>
  <p className="mb-1">
    This JSON contains the complete technical blueprint for this illusion — including dimensions, cut list, materials, and assembly steps.
  </p>
  <p>Use it to export plans, share with builders, or feed into other design tools.</p>
</div>
) : null}

{/* Raw JSON */}
          {buildPack ? (
          <CollapsibleSection
            id="json"
            title="Raw JSON"
            isOpen={openSections.json}
            onToggle={() => toggleSection('json')}
            onCopy={() => void handleCopySection('json')}
            copied={sectionCopyStatus.json === 'copied'}
            copyLabel="Copy section"
          >
                <div className="flex items-center gap-2 mb-2">
                  <button
                    onClick={handleCopyJson}
                    className="px-3 py-1.5 text-xs font-semibold bg-slate-700 hover:bg-slate-600 rounded-md text-white"
                    type="button"
                  >
                    {jsonCopyStatus === 'copied' ? 'Copied!' : 'Copy JSON'}
                  </button>
                  <button
                    onClick={handleDownloadJson}
                    className="px-3 py-1.5 text-xs font-semibold bg-slate-700 hover:bg-slate-600 rounded-md text-white"
                    type="button"
                  >
                    Download .json
                  </button>
                  <div className="ml-auto text-[11px] text-slate-500">Tip: use this for exporting or future PDF generation.</div>
                </div>

                <pre className="whitespace-pre-wrap break-words text-slate-300 font-mono text-xs bg-slate-900/60 p-3 rounded-md border border-slate-700/50">
                  {rawJson}
                </pre>
          </CollapsibleSection>
          ) : null}

              </div>
            )}
          </div>

          {/* Pinned SaveActionBar + workflow parity (outside scroll area) */}
          {hasCoreOutput ? (
            <div className="border-t border-slate-800 bg-slate-950/70 backdrop-blur p-4">
              <div className="flex flex-col gap-3">
                <SaveActionBar
                  title="Next step:"
                  subtitle="Save it, then move it into a Show or Task."
                  onSave={handleSave}
                  onCopy={() => void handleCopyAll()}
                  saved={saveStatus === 'saved'}
                  saving={false}
                  primaryLabel="Save Blueprint to Idea Vault"
                />

                <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
                  <CohesionActions
                    content={buildFullContent()}
                    defaultTitle={`Illusion Blueprint: ${safeBlueprintTitle}`}
                    defaultTags={["illusion-blueprint", "build"]}
                    compact
                  />

                  <button
                    type="button"
                    onClick={handleStartOver}
                    className="px-5 py-2 rounded-lg border border-slate-700 bg-slate-900/40 text-slate-100 font-semibold hover:bg-slate-900/60"
                  >
                    Start Over
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default IllusionBlueprint;