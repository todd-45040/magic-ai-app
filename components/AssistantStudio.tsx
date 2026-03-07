import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ASSISTANT_STUDIO_SYSTEM_INSTRUCTION } from '../constants';
import { generateStructuredResponse } from '../services/geminiService';
import { saveIdea } from '../services/ideasService';
import { getShows, addTasksToShow } from '../services/showsService';
import type { Show, Task, User } from '../types';

type Props = {
  user?: User;
  onIdeaSaved?: () => void;
};

const GUEST_USER: User = {
  email: '',
  membership: 'free',
  generationCount: 0,
  lastResetDate: '',
};

const PRESETS: Array<{ label: string; tag: string; template: (input: string) => string }> = [
  {
    label: 'Routine Staging',
    tag: 'routine-staging',
    template: (input) =>
      `Build a practical assistant staging plan for this routine. Focus on stage layout, blocking, assistant positions, cue timing, prop movement, reveal choreography, and any safety concerns.\n\nROUTINE DESCRIPTION:\n${input}`,
  },
  {
    label: 'Generate Cue Sheet',
    tag: 'cue-sheet',
    template: (input) =>
      `Create an assistant cue timeline with time-style beats for this routine. Include entrances, handoffs, resets, prop movements, reveal preparation, and volunteer handling where needed.\n\nROUTINE DESCRIPTION:\n${input}`,
  },
  {
    label: 'Volunteer Flow',
    tag: 'volunteer-flow',
    template: (input) =>
      `Plan volunteer staging for this routine. Explain where volunteers stand, how assistants guide them, how to avoid exposure, and what safety reminders matter.\n\nROUTINE DESCRIPTION:\n${input}`,
  },
  {
    label: 'Misdirection Timing',
    tag: 'misdirection-timing',
    template: (input) =>
      `Identify the strongest misdirection windows in this routine. Show the magician's visible action, the assistant's hidden support action, and the best timing window.\n\nROUTINE DESCRIPTION:\n${input}`,
  },
  {
    label: 'Prop Table Layout',
    tag: 'prop-table-layout',
    template: (input) =>
      `Design a prop table layout for this routine. Include ideal placement, reset order, and the assistant access path for fastest retrieval.\n\nROUTINE DESCRIPTION:\n${input}`,
  },
  {
    label: 'Transition Flow',
    tag: 'transition-flow',
    template: (input) =>
      `Plan the transitions for this routine. Focus on assistant movement, prop reset order, traffic flow, and lighting cues that keep the show clean.\n\nROUTINE DESCRIPTION:\n${input}`,
  },
  {
    label: 'Safety Check',
    tag: 'safety-check',
    template: (input) =>
      `Run a safety and risk analysis for this routine. Check assistant path collisions, heavy prop safety, crowd proximity, reveal risks, and timing hazards.\n\nROUTINE DESCRIPTION:\n${input}`,
  },
];

const DRAFT_KEY = 'maw_assistant_studio_draft_v8';
const CONTEXT_KEY = 'maw_assistant_studio_context_v8';
const REQUEST_TIMEOUT_MS = 45_000;

type ErrorKind = 'timeout' | 'quota' | 'other' | null;
type ResponseMode = 'fast' | 'full';

type SectionKey =
  | 'stageLayout'
  | 'blockingPlan'
  | 'assistantPositions'
  | 'cueTimeline'
  | 'propMovement'
  | 'revealChoreography'
  | 'volunteerPlan'
  | 'assistantInstructions'
  | 'volunteerManagement'
  | 'contingencyPlan'
  | 'safetyNotes'
  | 'misdirectionWindows'
  | 'propTableLayout'
  | 'resetOrder'
  | 'assistantAccessPath'
  | 'transitionPlan'
  | 'lightingCues'
  | 'safetyRiskAnalysis'
  | 'fullText';

type StructuredFieldValue = string | string[];
type StructuredOutput = Partial<Record<SectionKey, StructuredFieldValue>>;

const TABS: Array<{ key: SectionKey; label: string }> = [
  { key: 'stageLayout', label: 'Stage Layout' },
  { key: 'blockingPlan', label: 'Blocking Plan' },
  { key: 'assistantPositions', label: 'Assistant Positions' },
  { key: 'cueTimeline', label: 'Cue Timeline' },
  { key: 'propMovement', label: 'Prop Movement' },
  { key: 'revealChoreography', label: 'Reveal Choreography' },
  { key: 'volunteerPlan', label: 'Volunteer Plan' },
  { key: 'assistantInstructions', label: 'Assistant Instructions' },
  { key: 'volunteerManagement', label: 'Volunteer Management' },
  { key: 'contingencyPlan', label: 'Contingency Plan' },
  { key: 'safetyNotes', label: 'Safety Notes' },
  { key: 'misdirectionWindows', label: 'Misdirection Windows' },
  { key: 'propTableLayout', label: 'Prop Table Layout' },
  { key: 'resetOrder', label: 'Reset Order' },
  { key: 'assistantAccessPath', label: 'Assistant Access Path' },
  { key: 'transitionPlan', label: 'Transition Plan' },
  { key: 'lightingCues', label: 'Lighting Cues' },
  { key: 'safetyRiskAnalysis', label: 'Safety & Risk Analysis' },
  { key: 'fullText', label: 'Full Text' },
];

const REFINE_ACTIONS: Array<{ label: string; instruction: string }> = [
  { label: 'Cleaner transitions', instruction: 'Improve the transition plan so handoffs, resets, and assistant travel paths feel cleaner and faster.' },
  { label: 'Safer pathing', instruction: 'Reduce path collisions and improve assistant traffic flow, especially around reveals and heavy props.' },
  { label: 'Stronger misdirection', instruction: 'Strengthen misdirection windows and make the assistant actions subtler but more effective.' },
  { label: 'Faster prop retrieval', instruction: 'Optimize prop placement and assistant access for quicker retrieval and smoother reset.' },
  { label: 'Tighter volunteer handling', instruction: 'Tighten volunteer staging, guidance, and safety so the helpers look confident and controlled.' },
  { label: 'More practical', instruction: 'Revise anything overly idealized into a practical version for real-world staging, crews, and venue limits.' },
];

const VENUE_TYPES = [
  'Theater / Stage',
  'Parlor',
  'Corporate',
  'School',
  'Festival / Fair',
  'Restaurant',
  'Birthday / Family',
  'Close-up / Walkaround',
  'Other',
];

const DEMO_SCENARIOS = [
  {
    label: 'Levitation Illusion',
    tag: 'admc-demo',
    clientName: 'Floating Assistant Illusion',
    venueType: 'Theater / Stage',
    stageSize: '30 ft stage',
    numberOfAssistants: '2',
    audienceDistance: '25 ft',
    lightingNotes: 'Soft blue wash, one reveal special, no overhead fly cues',
    input:
      'Magician levitates an assistant on stage using a floating platform illusion. Assistant begins inside a decorative prop cabinet, exits for the levitation sequence, then remounts safely for the finish. Need staging, cue timing, and safety checks for the platform, reveal, and assistant movement.',
  },
  {
    label: 'Audience Prediction',
    tag: 'admc-demo',
    clientName: 'Audience Prediction',
    venueType: 'Corporate',
    stageSize: 'Small stage',
    numberOfAssistants: '1',
    audienceDistance: '10 ft',
    lightingNotes: 'House lights dimmed slightly, no timed board lighting',
    input:
      'Magician invites two volunteers on stage for a sealed prediction routine. Assistant helps guide volunteers to their marks, manages envelopes and a prediction board, and keeps staging clean without flashing hidden information. Need volunteer flow, cue timing, and exposure-safe positioning.',
  },
  {
    label: 'Silk Production',
    tag: 'admc-demo',
    clientName: 'Silk Fountain Production',
    venueType: 'Parlor',
    stageSize: '12 ft playing area',
    numberOfAssistants: '1',
    audienceDistance: '8 ft',
    lightingNotes: 'Warm wash only; no timed lighting changes',
    input:
      'Magician performs a silk production routine from a prop table, building to a silk fountain finale. Assistant manages hidden loads, table organization, reset order, and final reveal timing. Need prop table optimization, cue timing, and a practical assistant movement plan.',
  },
  {
    label: 'Motorcycle Appearance',
    tag: 'admc-demo',
    clientName: 'Motorcycle Appearance',
    venueType: 'Theater / Stage',
    stageSize: '40 ft stage',
    numberOfAssistants: '3',
    audienceDistance: '30 ft',
    lightingNotes: 'Smoke burst at reveal; floor practicals only; no trap or fly system',
    input:
      'Magician appears a full motorcycle from an empty-looking stage frame after a smoke burst. Assistants manage frame movement, cover timing, and safety around the heavy prop. Need transition planning, assistant traffic flow, and safety/risk analysis for the reveal.',
  },
  {
    label: 'Walkaround Card',
    tag: 'admc-demo',
    clientName: 'Walkaround Card Routine',
    venueType: 'Close-up / Walkaround',
    stageSize: 'Walkaround footprint',
    numberOfAssistants: '1',
    audienceDistance: '1-2 ft',
    lightingNotes: 'Ambient cocktail lighting only',
    input:
      'Magician performs an ambitious card routine in a cocktail environment. Assistant helps with reset management, crowd shaping, and spectator placement while keeping the performer mobile. Need volunteer handling, misdirection timing, and fast prop reset guidance.',
  },
] as const;

const SECTION_LABELS: Record<Exclude<SectionKey, 'fullText'>, string> = {
  stageLayout: 'Stage picture, zones, tables, and traffic lanes.',
  blockingPlan: 'Core movement plan beat by beat.',
  assistantPositions: 'Assistant starting positions and movement anchors.',
  cueTimeline: 'Timeline cue sheet using timestamps like 00:00, 00:15, 00:40.',
  propMovement: 'Prop handoffs, travel paths, and reset-sensitive items.',
  revealChoreography: 'Reveal sequence and who does what.',
  volunteerPlan: 'Volunteer entry, standing positions, exits, and no-go areas.',
  assistantInstructions: 'Concise operator-style instructions the assistant can follow.',
  volunteerManagement: 'Volunteer control, exposure prevention, audience management, and backup handling.',
  contingencyPlan: 'What assistants do if a cue slips, applause runs long, or a prop/reset issue appears.',
  safetyNotes: 'Short safety reminders and spacing notes.',
  misdirectionWindows: '2-4 critical windows with Moment / Assistant Action / Recommended Timing.',
  propTableLayout: 'Prop table rows or zones.',
  resetOrder: 'Fastest reset order.',
  assistantAccessPath: 'Best assistant retrieval and return path.',
  transitionPlan: 'How transitions between beats stay clean.',
  lightingCues: 'Practical cue support for transitions and reveals.',
  safetyRiskAnalysis: 'Collision, heavy prop, crowd proximity, and timing hazard review with fixes.',
};

const SECTION_PROFILES: Record<string, Array<Exclude<SectionKey, 'fullText'>>> = {
  'routine-staging': ['stageLayout', 'assistantPositions', 'blockingPlan', 'cueTimeline', 'propMovement', 'safetyNotes'],
  'cue-sheet': ['assistantPositions', 'cueTimeline', 'transitionPlan', 'propMovement', 'safetyNotes', 'contingencyPlan'],
  'volunteer-flow': ['stageLayout', 'volunteerPlan', 'assistantInstructions', 'volunteerManagement', 'safetyNotes', 'contingencyPlan'],
  'misdirection-timing': ['blockingPlan', 'assistantPositions', 'misdirectionWindows', 'transitionPlan', 'safetyNotes', 'contingencyPlan'],
  'prop-table-layout': ['propTableLayout', 'resetOrder', 'assistantAccessPath', 'propMovement', 'transitionPlan', 'safetyNotes'],
  'transition-flow': ['cueTimeline', 'propMovement', 'transitionPlan', 'lightingCues', 'safetyNotes', 'contingencyPlan'],
  'safety-check': ['assistantPositions', 'volunteerPlan', 'transitionPlan', 'safetyNotes', 'safetyRiskAnalysis', 'contingencyPlan'],
  'admc-demo': ['stageLayout', 'assistantPositions', 'cueTimeline', 'propMovement', 'transitionPlan', 'safetyNotes'],
  default: ['stageLayout', 'assistantPositions', 'blockingPlan', 'cueTimeline', 'transitionPlan', 'safetyNotes'],
};

const FAST_SECTION_PROFILES: Record<string, Array<Exclude<SectionKey, 'fullText'>>> = {
  'routine-staging': ['stageLayout', 'assistantPositions', 'cueTimeline', 'safetyNotes'],
  'cue-sheet': ['assistantPositions', 'cueTimeline', 'propMovement', 'safetyNotes'],
  'volunteer-flow': ['stageLayout', 'volunteerPlan', 'assistantInstructions', 'safetyNotes'],
  'misdirection-timing': ['blockingPlan', 'assistantPositions', 'misdirectionWindows', 'safetyNotes'],
  'prop-table-layout': ['propTableLayout', 'resetOrder', 'assistantAccessPath', 'propMovement'],
  'transition-flow': ['cueTimeline', 'propMovement', 'transitionPlan', 'safetyNotes'],
  'safety-check': ['assistantPositions', 'volunteerPlan', 'transitionPlan', 'safetyNotes'],
  'admc-demo': ['stageLayout', 'assistantPositions', 'cueTimeline', 'safetyNotes'],
  default: ['stageLayout', 'assistantPositions', 'cueTimeline', 'safetyNotes'],
};

function Skeleton() {
  return (
    <div className="space-y-3">
      <div className="h-4 w-2/3 rounded bg-slate-800 animate-pulse" />
      <div className="h-4 w-5/6 rounded bg-slate-800 animate-pulse" />
      <div className="h-4 w-4/6 rounded bg-slate-800 animate-pulse" />
      <div className="h-4 w-3/6 rounded bg-slate-800 animate-pulse" />
      <div className="h-4 w-5/6 rounded bg-slate-800 animate-pulse" />
      <div className="h-4 w-2/6 rounded bg-slate-800 animate-pulse" />
    </div>
  );
}

function detectQuotaError(message: string) {
  const m = (message || '').toLowerCase();
  return (
    m.includes('quota') ||
    m.includes('resource_exhausted') ||
    m.includes('rate limit') ||
    m.includes('too many') ||
    m.includes('429') ||
    m.includes('limit reached') ||
    m.includes('daily') ||
    m.includes('exceeded')
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number) {
  let t: number | undefined;
  const timeout = new Promise<T>((_, reject) => {
    t = window.setTimeout(() => reject(new Error('TIMEOUT')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (t) window.clearTimeout(t);
  });
}

function extractSection(raw: string, header: string, nextHeaders: string[]) {
  const start = raw.indexOf(header);
  if (start === -1) return '';
  const afterStart = raw.slice(start + header.length);
  const nextIdxs = nextHeaders
    .map((h) => {
      const idx = afterStart.indexOf(h);
      return idx === -1 ? Number.POSITIVE_INFINITY : idx;
    })
    .filter((n) => Number.isFinite(n));

  const endRel = nextIdxs.length ? Math.min(...nextIdxs) : afterStart.length;
  return afterStart.slice(0, endRel).trim();
}

const HEADERS = {
  stageLayout: '### STAGE_LAYOUT',
  blockingPlan: '### BLOCKING_PLAN',
  assistantPositions: '### ASSISTANT_POSITIONS',
  cueTimeline: '### CUE_TIMELINE',
  propMovement: '### PROP_MOVEMENT',
  revealChoreography: '### REVEAL_CHOREOGRAPHY',
  volunteerPlan: '### VOLUNTEER_PLAN',
  assistantInstructions: '### ASSISTANT_INSTRUCTIONS',
  volunteerManagement: '### VOLUNTEER_MANAGEMENT',
  contingencyPlan: '### CONTINGENCY_PLAN',
  safetyNotes: '### SAFETY_NOTES',
  misdirectionWindows: '### MISDIRECTION_WINDOWS',
  propTableLayout: '### PROP_TABLE_LAYOUT',
  resetOrder: '### RESET_ORDER',
  assistantAccessPath: '### ASSISTANT_ACCESS_PATH',
  transitionPlan: '### TRANSITION_PLAN',
  lightingCues: '### LIGHTING_CUES',
  safetyRiskAnalysis: '### SAFETY_RISK_ANALYSIS',
} as const;

function parseStructured(raw: string): StructuredOutput {
  const out: StructuredOutput = { fullText: raw?.trim() || '' };
  const all = Object.values(HEADERS);
  if (!all.some((h) => raw.includes(h))) return out;

  (Object.keys(HEADERS) as Array<keyof typeof HEADERS>).forEach((key) => {
    out[key] = extractSection(raw, HEADERS[key], all.filter((h) => h !== HEADERS[key]));
  });

  return out;
}

function buildStructuredPrompt(opts: {
  userInput: string;
  refineInstruction?: string | null;
  previousOutput?: string | null;
  focusTag?: string | null;
  context?: {
    clientName?: string;
    venueType?: string;
    stageSize?: string;
    numberOfAssistants?: string;
    audienceDistance?: string;
    lightingNotes?: string;
  };
  responseMode?: ResponseMode;
  demoMode?: boolean;
}) {
  const { userInput, refineInstruction, previousOutput, focusTag, context, responseMode = 'fast', demoMode = false } = opts;

  const contextLines: string[] = [];
  if (context?.clientName) contextLines.push(`Client / show: ${context.clientName}`);
  if (context?.venueType) contextLines.push(`Venue type: ${context.venueType}`);
  if (context?.stageSize) contextLines.push(`Stage size: ${context.stageSize}`);
  if (context?.numberOfAssistants) contextLines.push(`Number of assistants: ${context.numberOfAssistants}`);
  if (context?.audienceDistance) contextLines.push(`Audience distance / proximity: ${context.audienceDistance}`);
  if (context?.lightingNotes) contextLines.push(`Lighting notes / cue limits: ${context.lightingNotes}`);

  const contextBlock = contextLines.length ? `\n\nCONTEXT:\n${contextLines.join('\n')}` : '';
  const refineBlock =
    refineInstruction && previousOutput
      ? `\n\nREFINE REQUEST: ${refineInstruction}\n\nPREVIOUS OUTPUT:\n${previousOutput}`
      : '';

  const requestedSections = getRequestedSections(focusTag, responseMode, demoMode);

  const fastRule = `
- FAST MODE: generate a compact but complete rehearsal assistant summary.
- Return exactly the 4 requested sections and make every section useful.
- Each section must contain 3-4 bullet points.
- Each bullet should contain useful rehearsal or staging information, not short fragments.
- Each bullet may be 1-2 short sentences, but keep it tight, actionable, and easy to scan.
- Do not leave any requested section blank or nearly empty.
- Avoid long explanations and narrative paragraphs.
- Prioritize speed, clarity, and instant booth readability.`;

  const fullRule = `
- FULL MODE: generate a professional assistant operations plan that is richer than Fast but still compact.
- Return exactly 6 strong sections.
- Use 4-5 short bullets or operational lines per section.
- Each bullet should contain a clear operational instruction for assistants, staging, timing, prop flow, volunteer handling, or fallback actions.
- Short explanatory notes are encouraged when they improve rehearsal clarity.
- Bullets should contain useful rehearsal or staging information, not short fragments.
- No long prose, no filler, and no narrative paragraphs.`;

  const demoRule = demoMode
    ? `
- DEMO MODE: optimize for booth reliability. Keep output compact, practical, and instantly scannable.
- In demo mode, aim for 3 bullets per section and allow up to 4 when needed for clarity.`
    : '';

  const toolSpecificRule = getToolSpecificInstruction(focusTag, responseMode, demoMode);

  return (
    `You are building a practical assistant-operations plan for a magic routine. Return useful, stage-ready guidance with no fluff.` +
    `

IMPORTANT RULES:` +
    `
- Do not expose methods, gimmicks, or secret workings.` +
    `
- Prioritize realistic staging, safe traffic flow, and practical assistant movement.` +
    `
- If a routine element sounds unrealistic, revise it into a practical version rather than leaving it as fantasy.` +
    `
- Do not assume trap doors, fly systems, hidden infrastructure, or stage modifications unless the context explicitly allows them.` +
    `
- Write for real assistants, stage managers, and rehearsal use.` +
    (responseMode === 'fast' ? fastRule : fullRule) +
    demoRule +
    toolSpecificRule +
    `
- Return a JSON object matching the requested schema.
- Do not include markdown headings inside any field.
- Do not repeat the section title inside the field value.
- Each field should contain only the bullet content for that section.
- Every field must contain usable rehearsal notes, not summaries.
- Every requested section must contain useful content; do not leave sections blank.` +
    contextBlock +
    `

REQUESTED SECTIONS:
${requestedSections.map((key) => `- ${SECTION_LABELS[key]} (${key})`).join('\n')}

ROUTINE DESCRIPTION / OUTLINE:
${userInput}` +
    refineBlock
  );
}

function combineRunNotes(output: StructuredOutput, fallback: string) {
  const sections: Array<[string, string | undefined]> = [
    ['STAGE LAYOUT', output.stageLayout],
    ['BLOCKING PLAN', output.blockingPlan],
    ['ASSISTANT POSITIONS', output.assistantPositions],
    ['CUE TIMELINE', output.cueTimeline],
    ['PROP MOVEMENT', output.propMovement],
    ['VOLUNTEER MANAGEMENT', output.volunteerManagement],
    ['MISDIRECTION WINDOWS', output.misdirectionWindows],
    ['TRANSITION PLAN', output.transitionPlan],
    ['CONTINGENCY PLAN', output.contingencyPlan],
    ['SAFETY & RISK ANALYSIS', output.safetyRiskAnalysis],
  ];
  const parts = sections.filter(([, value]) => value?.trim()).map(([title, value]) => `${title}\n${value}`);
  return parts.length ? parts.join('\n\n') : fallback;
}

function getRequestedSections(focusTag?: string | null, responseMode: ResponseMode = 'fast', demoMode = false) {
  const baseSections = SECTION_PROFILES[focusTag || ''] || SECTION_PROFILES.default;
  const fastSections = FAST_SECTION_PROFILES[focusTag || ''] || FAST_SECTION_PROFILES.default;

  if (demoMode) return fastSections.slice(0, Math.min(4, fastSections.length));
  if (responseMode === 'fast') return fastSections.slice(0, Math.min(4, fastSections.length));

  return baseSections.slice(0, Math.min(6, baseSections.length));
}

function getToolSpecificInstruction(focusTag?: string | null, responseMode: ResponseMode = 'fast', demoMode = false) {
  const mode = demoMode ? 'fast' : responseMode;
  switch (focusTag) {
    case 'cue-sheet':
      return mode === 'fast'
        ? `
- For CUE_TIMELINE, return exactly 6 numbered cues in chronological order. Each cue should be one short operational line with the action, who owns it, and a brief timing anchor when useful.`
        : `
- For CUE_TIMELINE, return 8-10 numbered cues in chronological order. Each cue should include timing, assistant responsibility, and a short backup or hold note where useful.`;
    case 'routine-staging':
      return mode === 'fast'
        ? `
- Treat this like a quick rehearsal cheat sheet. Focus on stage picture, assistant anchors, key cues, safety, and practical reveal handling using fuller rehearsal bullets instead of fragments.`
        : `
- Treat this like a professional assistant operations plan. Keep it tight but premium: stage picture, blocking, cue timing, prop flow, safety, and one fallback note where relevant.`;
    case 'volunteer-flow':
      return mode === 'fast'
        ? `
- Keep volunteer guidance compact and practical, but make each bullet complete enough to use during rehearsal.`
        : `
- Include exposure prevention, audience management, assistant backup handling, and calm volunteer recovery steps in concise operational bullets.`;
    case 'transition-flow':
      return mode === 'fast'
        ? `
- Focus on the cleanest transition path and reset sequence, with short but complete rehearsal-ready instructions.`
        : `
- Include traffic flow, reset choreography, cue support, and what happens if applause or timing runs long using short operational bullets.`;
    case 'safety-check':
      return mode === 'fast'
        ? `
- Flag only the most important staging hazards and fixes, but make each note specific enough to act on during rehearsal.`
        : `
- Review collision risks, heavy props, crowd proximity, timing hazards, and practical mitigation steps with concise contingency notes.`;
    default:
      return mode === 'fast'
        ? `
- Make this feel like a quick rehearsal cheat sheet with complete, actionable bullets.`
        : `
- Make this feel like a professional assistant planning document.`;
  }
}

function getAssistantStudioSpeedMode(
  focusTag?: string | null,
  responseMode: ResponseMode = 'fast',
  demoMode = false
): 'fast' | 'full' {
  if (demoMode) return 'fast';
  return responseMode === 'full' ? 'full' : 'fast';
}

function buildStructuredSchema(keys: Array<Exclude<SectionKey, 'fullText'>>) {
  const properties: Record<string, any> = {};
  keys.forEach((key) => {
    properties[key] = {
      type: 'string',
      description: SECTION_LABELS[key],
    };
  });

  return {
    type: 'object',
    properties,
    required: keys,
  };
}

function structuredResultToText(obj: Record<string, any>, keys: Array<Exclude<SectionKey, 'fullText'>>) {
  return keys
    .map((key) => {
      const value = String(obj?.[key] || '').trim();
      return value ? `### ${String(key).toUpperCase()}\n${value}` : '';
    })
    .filter(Boolean)
    .join('\n\n')
    .trim();
}


function compactStructuredResultToText(obj: Record<string, any>, keys: Array<Exclude<SectionKey, 'fullText'>>) {
  return keys
    .map((key) => {
      const value = String(obj?.[key] || '').trim();
      return value ? `${SECTION_LABELS[key]}\n${value}` : '';
    })
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

export default function AssistantStudio({ user, onIdeaSaved }: Props) {
  const currentUser = useMemo(() => user || GUEST_USER, [user]);

  const [input, setInput] = useState('');
  const [outputRaw, setOutputRaw] = useState('');
  const [output, setOutput] = useState<StructuredOutput>({});
  const [activeTab, setActiveTab] = useState<SectionKey>('stageLayout');

  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showLongLoadingHint, setShowLongLoadingHint] = useState(false);

  const [errorKind, setErrorKind] = useState<ErrorKind>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorDebug, setErrorDebug] = useState<string>('');

  const [toast, setToast] = useState<string | null>(null);

  const [clientName, setClientName] = useState('');
  const [venueType, setVenueType] = useState('');
  const [stageSize, setStageSize] = useState('');
  const [numberOfAssistants, setNumberOfAssistants] = useState('');
  const [audienceDistance, setAudienceDistance] = useState('');
  const [lightingNotes, setLightingNotes] = useState('');
  const [lastPreset, setLastPreset] = useState<string>('');
  const [responseMode, setResponseMode] = useState<ResponseMode>('fast');
  const [demoMode, setDemoMode] = useState(false);

  const requestIdRef = useRef(0);
  const cancelledUpToRef = useRef(0);
  const outputRef = useRef<HTMLDivElement | null>(null);

  const [shows, setShows] = useState<Show[]>([]);
  const [showPickerOpen, setShowPickerOpen] = useState(false);
  const [selectedShowId, setSelectedShowId] = useState<string>('');
  const [sendMode, setSendMode] = useState<'run' | 'sections'>('run');

  const [blueprintOpen, setBlueprintOpen] = useState(false);
  const [blueprintName, setBlueprintName] = useState('');
  const [savingBlueprint, setSavingBlueprint] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) setInput(saved);
      const ctx = localStorage.getItem(CONTEXT_KEY);
      if (ctx) {
        const parsed = JSON.parse(ctx);
        setClientName(parsed?.clientName || '');
        setVenueType(parsed?.venueType || '');
        setStageSize(parsed?.stageSize || '');
        setNumberOfAssistants(parsed?.numberOfAssistants || '');
        setAudienceDistance(parsed?.audienceDistance || '');
        setLightingNotes(parsed?.lightingNotes || '');
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, input);
    } catch {
      // ignore
    }
  }, [input]);

  useEffect(() => {
    try {
      localStorage.setItem(
        CONTEXT_KEY,
        JSON.stringify({
          clientName,
          venueType,
          stageSize,
          numberOfAssistants,
          audienceDistance,
          lightingNotes,
        })
      );
    } catch {
      // ignore
    }
  }, [clientName, venueType, stageSize, numberOfAssistants, audienceDistance, lightingNotes]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const list = await getShows();
        if (!mounted) return;
        setShows(list || []);
        if ((list || []).length > 0) setSelectedShowId((list || [])[0].id);
      } catch {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!outputRaw) return;
    window.setTimeout(() => {
      outputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }, [outputRaw]);

  useEffect(() => {
    if (!loading) {
      setShowLongLoadingHint(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setShowLongLoadingHint(true);
    }, 12_000);

    return () => window.clearTimeout(timer);
  }, [loading]);

  const canGenerate = !!input.trim() && !loading;
  const canCopySave = !!outputRaw && !loading;

  const clearErrors = () => {
    setErrorKind(null);
    setErrorMsg(null);
    setErrorDebug('');
  };

  const hardUnlock = (message?: string) => {
    setLoading(false);
    if (message) {
      setToast(message);
      window.setTimeout(() => setToast(null), 1200);
    }
  };

  const quotaMessage = () => {
    const tier = (currentUser?.membership || 'free').toLowerCase();
    if (tier.includes('trial')) return 'You may have hit a trial usage limit. Upgrade to continue without interruptions.';
    if (tier.includes('free')) return 'Free tier limit reached. Upgrade to keep generating without daily caps.';
    return 'Usage limit reached. If this seems wrong, try again in a bit or contact support.';
  };

  const runGenerate = async (opts?: { refineInstruction?: string; usePrevious?: boolean }) => {
    if (!input.trim()) return;
    const myId = ++requestIdRef.current;

    try {
      setLoading(true);
      setShowLongLoadingHint(false);
      clearErrors();
      setToast(null);

      const effectiveResponseMode: ResponseMode = demoMode ? 'fast' : responseMode;

      const prompt = buildStructuredPrompt({
        userInput: input.trim(),
        refineInstruction: opts?.refineInstruction || null,
        previousOutput: opts?.usePrevious ? outputRaw : null,
        context: { clientName, venueType, stageSize, numberOfAssistants, audienceDistance, lightingNotes },
        focusTag: lastPreset || null,
        responseMode: effectiveResponseMode,
        demoMode,
      });

      const requestedSections = getRequestedSections(lastPreset || null, effectiveResponseMode, demoMode);
      const assistantStudioSpeedMode = getAssistantStudioSpeedMode(lastPreset || null, effectiveResponseMode, demoMode);
      const obj = await withTimeout(
        generateStructuredResponse(
          prompt,
          ASSISTANT_STUDIO_SYSTEM_INSTRUCTION,
          buildStructuredSchema(requestedSections),
          currentUser,
          effectiveResponseMode === 'fast'
            ? { maxOutputTokens: demoMode ? 950 : 1100, speedMode: 'fast' }
            : { maxOutputTokens: 1700, speedMode: assistantStudioSpeedMode }
        ),
        REQUEST_TIMEOUT_MS
      );

      if (cancelledUpToRef.current >= myId) return;

      const displayText =
        demoMode && effectiveResponseMode === 'fast'
          ? compactStructuredResultToText(obj || {}, requestedSections)
          : structuredResultToText(obj || {}, requestedSections);

      const normalized = {
        ...(obj || {}),
        fullText: displayText,
      };

      setOutput(normalized);
      setOutputRaw(displayText);

      const firstAvailable = TABS.find(
        (t) => t.key !== 'fullText' && String((obj || {})[t.key] || '').trim()
      );
      setActiveTab(firstAvailable?.key || 'fullText');
    } catch (e: any) {
      console.error(e);

      if (e?.message === 'TIMEOUT') {
        setErrorKind('timeout');
        setErrorMsg('This took too long and was stopped to keep the app responsive.');
        setErrorDebug(`timeout_ms=${REQUEST_TIMEOUT_MS}; reqId=${myId}`);
      } else {
        const msg = e?.message || 'Something went wrong.';
        const isQuota = detectQuotaError(msg);
        setErrorKind(isQuota ? 'quota' : 'other');
        setErrorMsg(msg);
        setErrorDebug(`reqId=${myId}; membership=${currentUser?.membership || 'unknown'}`);
      }
    } finally {
      if (requestIdRef.current === myId) setLoading(false);
    }
  };

  const handleGenerate = () => runGenerate();

  const handleRefine = async (instruction: string) => {
    if (!outputRaw) return;
    await runGenerate({ refineInstruction: instruction, usePrevious: true });
    setToast('Refined ✓');
    window.setTimeout(() => setToast(null), 900);
  };

  const handleCancel = () => {
    cancelledUpToRef.current = requestIdRef.current;
    hardUnlock('Cancelled');
  };

  const clearContext = () => {
    setClientName('');
    setVenueType('');
    setStageSize('');
    setNumberOfAssistants('');
    setAudienceDistance('');
    setLightingNotes('');
    setToast('Context cleared');
    window.setTimeout(() => setToast(null), 900);
  };

  const handleReset = () => {
    cancelledUpToRef.current = requestIdRef.current;
    hardUnlock();
    clearErrors();
    setOutputRaw('');
    setOutput({});
    setActiveTab('stageLayout');
    setInput('');
    setCopied(false);
    setLastPreset('');
    setDemoMode(false);
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // ignore
    }
  };

  const handleCopy = async () => {
    if (!outputRaw) return;
    try {
      const textToCopy = activeTab === 'fullText' ? outputRaw : output?.[activeTab] || outputRaw;
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  };

  const copyPrompt = async () => {
    if (!input) return;
    try {
      await navigator.clipboard.writeText(input);
      setToast('Prompt copied ✓');
      window.setTimeout(() => setToast(null), 1200);
    } catch {
      // ignore
    }
  };

  const handleSaveIdea = async () => {
    if (!outputRaw) return;
    try {
      const tags = [
        'assistant-studio',
        'staging',
        ...(lastPreset ? [lastPreset] : []),
        ...(venueType ? [venueType.toLowerCase().replace(/\s+/g, '-').replace(/\//g, '-')] : []),
      ];

      await saveIdea({
        type: 'text',
        title: 'Assistant Studio Output',
        content: outputRaw,
        tags,
      });

      onIdeaSaved?.();
      setToast('Saved to Ideas ✓');
      window.setTimeout(() => setToast(null), 1400);
    } catch (e) {
      console.error(e);
      setErrorKind('other');
      setErrorMsg('Could not save this idea. (Check Supabase auth / RLS)');
      setErrorDebug('saveIdea_failed');
    }
  };

  const openBlueprint = () => {
    setBlueprintName(
      blueprintName ||
        (lastPreset ? `Assistant Plan – ${lastPreset.replace(/-/g, ' ')}` : 'Assistant Plan – Staging')
    );
    setBlueprintOpen(true);
  };

  const saveBlueprint = async () => {
    if (!outputRaw) return;

    setSavingBlueprint(true);
    clearErrors();
    setToast(null);

    const header = [
      `BLUEPRINT: ${blueprintName || 'Assistant Studio Blueprint'}`,
      `Preset: ${lastPreset || '—'}`,
      clientName ? `Client / Show: ${clientName}` : '',
      venueType ? `Venue: ${venueType}` : '',
      stageSize ? `Stage size: ${stageSize}` : '',
      numberOfAssistants ? `Assistants: ${numberOfAssistants}` : '',
      audienceDistance ? `Audience distance: ${audienceDistance}` : '',
      lightingNotes ? `Lighting notes: ${lightingNotes}` : '',
      '',
      '---',
      '',
    ]
      .filter(Boolean)
      .join('\n');

    const tags = [
      'assistant-studio',
      'blueprint',
      'staging',
      ...(lastPreset ? [lastPreset] : []),
      ...(venueType ? [venueType.toLowerCase().replace(/\s+/g, '-').replace(/\//g, '-')] : []),
    ];

    try {
      await saveIdea({
        type: 'text',
        title: blueprintName || 'Assistant Studio Blueprint',
        content: header + outputRaw,
        tags,
      });

      setBlueprintOpen(false);
      setToast('Blueprint saved ✓');
      window.setTimeout(() => setToast(null), 1500);
    } catch (e: any) {
      console.error(e);
      setErrorKind('other');
      setErrorMsg(e?.message || 'Could not save blueprint.');
      setErrorDebug('saveBlueprint_failed');
    } finally {
      setSavingBlueprint(false);
    }
  };

  const openSend = () => setShowPickerOpen(true);

  const sendToShowPlanner = async () => {
    if (!selectedShowId || !outputRaw) return;
    setSending(true);
    setToast(null);
    clearErrors();

    let tasks: Partial<Task>[] = [];

    if (sendMode === 'run') {
      const runNotes = combineRunNotes(output, outputRaw);
      tasks = [
        { title: 'Assistant Run – Pre-Set', notes: `PART: Pre-Set\n\n${runNotes}`, priority: 'high' as any },
        { title: 'Assistant Run – Performance Beats', notes: `PART: Performance Beats\n\n${runNotes}`, priority: 'high' as any },
        { title: 'Assistant Run – Transition / Reset', notes: `PART: Transition / Reset\n\n${runNotes}`, priority: 'medium' as any },
        { title: 'Assistant Run – Safety Check', notes: `PART: Safety Check\n\n${output.safetyRiskAnalysis || output.safetyNotes || outputRaw}`, priority: 'high' as any },
      ];
    } else {
      const sectionTasks: Array<[string, string | undefined]> = [
        ['Stage Layout', output.stageLayout],
        ['Blocking Plan', output.blockingPlan],
        ['Assistant Positions', output.assistantPositions],
        ['Cue Timeline', output.cueTimeline],
        ['Prop Movement', output.propMovement],
        ['Reveal Choreography', output.revealChoreography],
        ['Volunteer Plan', output.volunteerPlan],
        ['Assistant Instructions', output.assistantInstructions],
        ['Volunteer Management', output.volunteerManagement],
        ['Contingency Plan', output.contingencyPlan],
        ['Safety Notes', output.safetyNotes],
        ['Misdirection Windows', output.misdirectionWindows],
        ['Prop Table Layout', output.propTableLayout],
        ['Reset Order', output.resetOrder],
        ['Assistant Access Path', output.assistantAccessPath],
        ['Transition Plan', output.transitionPlan],
        ['Lighting Cues', output.lightingCues],
        ['Safety & Risk Analysis', output.safetyRiskAnalysis],
      ];
      tasks = sectionTasks
        .filter(([, value]) => !!value?.trim())
        .map(([title, notes]) => ({ title: `Assistant Studio – ${title}`, notes: notes!, priority: 'medium' as any }));
      if (tasks.length === 0) {
        tasks = [{ title: 'Assistant Studio – Output', notes: outputRaw, priority: 'medium' as any }];
      }
    }

    try {
      await addTasksToShow(selectedShowId, tasks);
      setShowPickerOpen(false);
      setToast('Sent to Show Planner ✓');
      window.setTimeout(() => setToast(null), 1600);
    } catch (e: any) {
      console.error(e);
      setErrorKind('other');
      setErrorMsg(e?.message || 'Could not send to Show Planner.');
      setErrorDebug('sendToShowPlanner_failed');
    } finally {
      setSending(false);
    }
  };

  const onTextKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
    const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

    if (cmdOrCtrl && e.key === 'Enter') {
      e.preventDefault();
      if (canGenerate) handleGenerate();
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  const applyPreset = (presetIndex: number) => {
    const preset = PRESETS[presetIndex];
    const base = input.trim();
    setInput(preset.template(base || '[Describe the routine, illusion, or staging problem here]'));
    setLastPreset(preset.tag);
    setToast(`Preset: ${preset.label}`);
    window.setTimeout(() => setToast(null), 900);
  };

  const loadDemoScenario = (scenario: (typeof DEMO_SCENARIOS)[number]) => {
    setClientName(scenario.clientName);
    setVenueType(scenario.venueType);
    setStageSize(scenario.stageSize);
    setNumberOfAssistants(scenario.numberOfAssistants);
    setAudienceDistance(scenario.audienceDistance);
    setLightingNotes(scenario.lightingNotes);
    setInput(scenario.input);
    setLastPreset(scenario.tag);
    setResponseMode('fast');
    setDemoMode(false);
    clearErrors();
    setToast(`Demo loaded: ${scenario.label} • Demo Mode OFF for Fast/Full testing`);
    window.setTimeout(() => setToast(null), 1400);
  };

  const reportIssue = async () => {
    const payload = [
      '[Magic AI Wizard] Assistant Studio Issue',
      `time=${new Date().toISOString()}`,
      `membership=${currentUser?.membership || 'unknown'}`,
      errorKind ? `kind=${errorKind}` : '',
      errorMsg ? `message=${errorMsg}` : '',
      errorDebug ? `debug=${errorDebug}` : '',
      `prompt_len=${input?.length || 0}`,
    ]
      .filter(Boolean)
      .join('\n');
    try {
      await navigator.clipboard.writeText(payload);
      setToast('Issue details copied ✓');
      window.setTimeout(() => setToast(null), 1400);
    } catch {
      // ignore
    }
  };

  const renderAccordionText = (text: string) => {
    const normalized = text.replace(/\r\n/g, '\n');
    const matches = [...normalized.matchAll(/^###\s*(\d+\.[^\n]*)$/gm)];
    if (matches.length < 2) {
      return <div className="whitespace-pre-wrap text-slate-100 leading-relaxed">{text}</div>;
    }

    const panels = matches.map((match, idx) => {
      const start = match.index ?? 0;
      const end = idx + 1 < matches.length ? (matches[idx + 1].index ?? normalized.length) : normalized.length;
      const rawBlock = normalized.slice(start, end).trim();
      const lines = rawBlock.split('\n');
      const title = lines[0].replace(/^###\s*/, '').trim();
      const body = lines.slice(1).join('\n').trim();

      return (
        <details
          key={title || idx}
          className="rounded-xl border border-slate-800 bg-slate-950/40 overflow-hidden"
          open={idx === 0}
        >
          <summary className="cursor-pointer list-none select-none px-4 py-3 flex items-center justify-between gap-3 text-slate-100 font-medium">
            <span>{title || `Part ${idx + 1}`}</span>
            <span className="text-xs text-slate-500">Show / Hide</span>
          </summary>
          <div className="border-t border-slate-800 px-4 py-3 whitespace-pre-wrap text-slate-100 leading-relaxed">
            {body}
          </div>
        </details>
      );
    });

    return <div className="space-y-3">{panels}</div>;
  };

  const renderTabContent = () => {
    const value: StructuredFieldValue = activeTab === 'fullText' ? outputRaw : output?.[activeTab] || '';
    const hasValue = Array.isArray(value) ? value.some((line) => String(line || '').trim()) : !!String(value || '').trim();
    if (!hasValue && activeTab !== 'fullText') {
      return (
        <div className="text-slate-400 text-sm">
          This section isn’t available yet. Try generating again — the model sometimes returns fewer sections.
        </div>
      );
    }

    const displayValue = hasValue ? value : outputRaw;
    if (activeTab === 'fullText' && typeof displayValue === 'string' && displayValue) {
      return renderAccordionText(displayValue);
    }

    if (Array.isArray(displayValue)) {
      const lines = displayValue.map((line) => String(line || '').trim()).filter(Boolean);
      return (
        <ul className="list-disc pl-5 space-y-1 text-slate-100 leading-relaxed">
          {lines.map((line, i) => (
            <li key={`${activeTab}-${i}`}>{line}</li>
          ))}
        </ul>
      );
    }

    return <div className="whitespace-pre-wrap text-slate-100 leading-relaxed">{displayValue}</div>;
  };

  const availableTabs = useMemo(() => {
    const base = TABS.filter((t) => (t.key === 'fullText' ? true : !!output?.[t.key]));
    if (!outputRaw) return base;
    const hasStructured = (Object.keys(HEADERS) as Array<keyof typeof HEADERS>).some((k) => !!output[k]);
    if (!hasStructured) return [{ key: 'fullText', label: 'Full Text' }];
    if (!base.find((t) => t.key === 'fullText')) base.push({ key: 'fullText', label: 'Full Text' });
    return base;
  }, [output, outputRaw]);

  const contextSummary = useMemo(() => {
    const parts: string[] = [];
    if (clientName) parts.push(clientName);
    if (venueType) parts.push(venueType);
    if (stageSize) parts.push(stageSize);
    if (numberOfAssistants) parts.push(`${numberOfAssistants} asst`);
    return parts.join(' • ');
  }, [clientName, venueType, stageSize, numberOfAssistants]);

  return (
    <div className="relative p-6 pb-24 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Assistant&apos;s Studio</h1>
          {contextSummary ? (
            <div className="text-xs text-slate-400">
              Context: <span className="text-slate-200">{contextSummary}</span>
            </div>
          ) : (
            <div className="text-[11px] italic text-slate-500/80">Plan the invisible work that makes the miracle happen.</div>
          )}
        </div>

        <div className="text-sm text-slate-400 min-h-[1.25rem]">{toast ? <span className="text-emerald-400">{toast}</span> : null}</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p, idx) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(idx)}
                className="px-3 py-1.5 rounded-full border border-slate-700 bg-slate-950/50 hover:bg-slate-950/70 hover:border-slate-500 text-sm"
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 space-y-2">
            <div className="text-xs font-medium tracking-wide text-slate-300 uppercase">Demo Scenarios (ADMC)</div>
            <div className="text-[11px] text-slate-500">One click fills the form so you can demo Assistant&apos;s Studio quickly at the booth.</div>
            <div className="flex flex-wrap gap-2">
              {DEMO_SCENARIOS.map((scenario) => (
                <button
                  key={scenario.label}
                  type="button"
                  onClick={() => loadDemoScenario(scenario)}
                  className="px-3 py-1.5 rounded-full border border-purple-700/70 bg-purple-500/10 hover:bg-purple-500/20 hover:border-purple-500 text-sm text-slate-100"
                >
                  {scenario.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-400">Routine context (optional):</div>
            <button
              type="button"
              onClick={clearContext}
              className="text-xs px-2 py-1 rounded border border-slate-700 hover:border-slate-500 text-slate-200"
              disabled={!clientName && !venueType && !stageSize && !numberOfAssistants && !audienceDistance && !lightingNotes}
            >
              Clear context
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Routine / show name"
              className="p-2 rounded bg-slate-950/50 border border-slate-700 text-white placeholder:text-slate-500"
            />
            <select
              value={venueType}
              onChange={(e) => setVenueType(e.target.value)}
              className="p-2 rounded bg-slate-950/50 border border-slate-700 text-white"
            >
              <option value="">Venue type</option>
              {VENUE_TYPES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
            <input
              value={stageSize}
              onChange={(e) => setStageSize(e.target.value)}
              placeholder="Stage size"
              className="p-2 rounded bg-slate-950/50 border border-slate-700 text-white placeholder:text-slate-500"
            />
            <input
              value={numberOfAssistants}
              onChange={(e) => setNumberOfAssistants(e.target.value)}
              placeholder="Number of assistants"
              className="p-2 rounded bg-slate-950/50 border border-slate-700 text-white placeholder:text-slate-500"
            />
            <input
              value={audienceDistance}
              onChange={(e) => setAudienceDistance(e.target.value)}
              placeholder="Audience distance / crowd proximity"
              className="p-2 rounded bg-slate-950/50 border border-slate-700 text-white placeholder:text-slate-500"
            />
            <input
              value={lightingNotes}
              onChange={(e) => setLightingNotes(e.target.value)}
              placeholder="Lighting notes / cue limitations"
              className="p-2 rounded bg-slate-950/50 border border-slate-700 text-white placeholder:text-slate-500"
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-800/80 bg-slate-950/35 px-3 py-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Response mode</div>
              <div className="text-xs text-slate-500">Fast is best for ADMC demos. Full asks for more detail and may take longer.</div>
            </div>
            <div className="flex rounded-lg border border-slate-700/80 overflow-hidden">
              {(['fast', 'full'] as ResponseMode[]).map((mode) => {
                const active = responseMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                    if (demoMode && mode === 'full') {
                      setToast('Demo Mode uses Fast generation to ensure reliable booth demos.');
                      window.setTimeout(() => setToast(null), 1600);
                      setResponseMode('fast');
                      return;
                    }
                    setResponseMode(mode);
                  }}
                    className={`px-3 py-1.5 text-sm ${active ? 'bg-purple-600 text-white' : 'bg-slate-950/40 text-slate-300 hover:bg-slate-900/70'}`}
                  >
                    {mode === 'fast' ? 'Fast' : 'Full'}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-800/80 bg-slate-950/35 px-3 py-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Demo mode</div>
              <div className="text-xs text-slate-500">Convention-safe mode forces Flash routing, tighter output caps, and a maximum of 6 sections.</div>
            </div>
            <button
              type="button"
              onClick={() => {
                setDemoMode((v) => {
                  const next = !v;
                  if (next) {
                    setResponseMode('fast');
                    setToast('Demo Mode ON • Fast mode enforced for booth reliability.');
                    window.setTimeout(() => setToast(null), 1600);
                  }
                  return next;
                });
              }}
              className={`px-3 py-1.5 rounded-lg border text-sm ${demoMode ? 'border-emerald-500/70 bg-emerald-500/15 text-emerald-300' : 'border-slate-700/80 bg-slate-950/40 text-slate-300 hover:bg-slate-900/70'}`}
            >
              {demoMode ? 'Demo Mode ON' : 'Demo Mode OFF'}
            </button>
          </div>

          <textarea
            className="w-full p-3 border border-slate-700 rounded bg-slate-950/50 text-white min-h-[280px] placeholder:text-slate-500"
            rows={12}
            placeholder="Describe the routine, staging, illusion, or assistant problem here…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onTextKeyDown}
          />

          <div className="text-xs text-slate-500">
            Shortcut: <span className="text-slate-300">Ctrl/Cmd + Enter</span> to generate •{' '}
            <span className="text-slate-300">Esc</span> to cancel
          </div>

          <div className="pt-3 border-t border-slate-800/60">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="text-xs text-slate-400">Refine this plan:</div>
              {lastPreset ? (
                <div className="text-xs text-slate-500">
                  Preset: <span className="text-slate-300">{lastPreset}</span> • Mode: <span className="text-slate-300">{demoMode ? 'demo' : responseMode}</span>
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {REFINE_ACTIONS.map((r) => (
                <button
                  key={r.label}
                  type="button"
                  onClick={() => handleRefine(r.instruction)}
                  disabled={!outputRaw || loading}
                  className="px-3 py-1.5 rounded-full border border-slate-700 bg-slate-950/50 hover:bg-slate-950/70 hover:border-slate-500 text-sm disabled:opacity-40"
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div ref={outputRef} className="space-y-3">
          {errorKind && (
            <div className="maw-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold text-slate-100">
                    {errorKind === 'timeout'
                      ? 'Timed out'
                      : errorKind === 'quota'
                      ? 'Usage limit reached'
                      : 'Something went wrong'}
                  </div>

                  <div className="mt-1 text-sm text-slate-300">
                    {errorKind === 'timeout'
                      ? 'The request was stopped after 45 seconds so the app never gets stuck. Try Fast mode or a demo scenario for a faster, smaller response.'
                      : errorKind === 'quota'
                      ? quotaMessage()
                      : 'Please try again. If it keeps happening, report it so we can fix it fast.'}
                  </div>

                  {errorKind !== 'quota' && errorMsg && errorKind !== 'timeout' && (
                    <div className="mt-2 text-xs text-slate-500 break-words">{errorMsg}</div>
                  )}
                </div>

                <div className="flex flex-col gap-2 min-w-[140px]">
                  {errorKind === 'timeout' && responseMode === 'full' && (
                    <button
                      className="px-3 py-2 rounded bg-fuchsia-700 hover:bg-fuchsia-600 text-white"
                      onClick={() => { setResponseMode('fast'); handleGenerate(); }}
                      disabled={!input.trim() || loading}
                    >
                      Retry Fast
                    </button>
                  )}
                  <button
                    className="px-3 py-2 rounded bg-purple-600 hover:bg-purple-500 text-white"
                    onClick={handleGenerate}
                    disabled={!input.trim() || loading}
                  >
                    Retry
                  </button>
                  <button
                    className="px-3 py-2 rounded border border-slate-600 hover:border-slate-400 text-slate-200"
                    onClick={handleReset}
                  >
                    Reset
                  </button>
                  <button
                    className="px-3 py-2 rounded border border-slate-600 hover:border-slate-400 text-slate-200"
                    onClick={reportIssue}
                  >
                    Report issue
                  </button>

                  {(errorKind === 'timeout' || errorKind === 'quota') && (
                    <button
                      className="px-3 py-2 rounded border border-slate-600 hover:border-slate-400 text-slate-200"
                      onClick={copyPrompt}
                    >
                      Copy prompt
                    </button>
                  )}
                </div>
              </div>

              {errorKind === 'quota' && (
                <div className="mt-3 text-sm text-slate-300">
                  Tip: click <span className="text-slate-100">Membership Types</span> in the footer to upgrade.
                </div>
              )}
            </div>
          )}

          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 min-h-[280px]">
            {loading ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-purple-300">Generating assistant operations plan…</div>
                  <div className="h-2 w-24 rounded bg-slate-800 animate-pulse" />
                </div>
                <Skeleton />
                {showLongLoadingHint ? (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                    <div>Assistant is preparing your stage plan...</div>
                    <div className="text-amber-100/80">Complex routines may take a few seconds.</div>
                  </div>
                ) : null}
              </div>
            ) : outputRaw ? (
              <>
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <div className={`px-3 py-1 rounded-full text-xs font-semibold border ${demoMode || responseMode === 'fast' ? 'border-amber-500/40 bg-amber-500/10 text-amber-200' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'}`}>
                    {demoMode || responseMode === 'fast' ? '⚡ Quick Assistant Plan' : '📋 Professional Assistant Operations Plan'}
                  </div>
                  {demoMode ? <div className="text-[11px] text-slate-500">Demo Mode is using Fast generation for reliability.</div> : null}
                </div>

                <div className="flex flex-wrap gap-2 mb-3">
                  {availableTabs.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setActiveTab(t.key)}
                      className={
                        'px-3 py-1.5 rounded-full border text-sm ' +
                        (activeTab === t.key
                          ? 'border-purple-500 bg-purple-500/10 text-purple-200'
                          : 'border-slate-700 bg-slate-950/40 hover:border-slate-500 text-slate-200')
                      }
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {renderTabContent()}
              </>
            ) : (
              <div className="text-slate-400 text-sm space-y-2">
                <div>Your assistant planning results will appear here.</div>
                <div className="text-slate-500">
                  Try: <span className="text-slate-300">“Routine Staging”</span>,{' '}
                  <span className="text-slate-300">“Generate Cue Sheet”</span>, or{' '}
                  <span className="text-slate-300">“Safety Check”</span>, then hit Generate. Fast mode is best for demos.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg maw-card p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-lg font-semibold">Send to Show Planner</div>
              <button
                className="px-2 py-1 rounded border border-slate-700 hover:border-slate-500"
                onClick={() => setShowPickerOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="flex flex-col gap-2 text-sm text-slate-200">
                <label className="flex items-center gap-2">
                  <input type="radio" name="sendMode" checked={sendMode === 'run'} onChange={() => setSendMode('run')} />
                  Create assistant run tasks
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="sendMode"
                    checked={sendMode === 'sections'}
                    onChange={() => setSendMode('sections')}
                  />
                  Create section tasks (cue timeline, transition plan, safety, etc.)
                </label>
              </div>

              {shows.length === 0 ? (
                <div className="text-slate-300 text-sm">
                  No shows found. Create a show in <span className="text-slate-100">Show Planner</span> first.
                </div>
              ) : (
                <>
                  <label className="text-sm text-slate-300">Choose a show</label>
                  <select
                    className="w-full p-2 rounded bg-slate-900 border border-slate-700"
                    value={selectedShowId}
                    onChange={(e) => setSelectedShowId(e.target.value)}
                  >
                    {shows.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title}
                      </option>
                    ))}
                  </select>

                  <button
                    className="w-full mt-2 px-4 py-2 rounded bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-40"
                    disabled={!selectedShowId || sending}
                    onClick={sendToShowPlanner}
                  >
                    {sending ? 'Sending…' : sendMode === 'run' ? 'Create Assistant Run Tasks' : 'Create Section Tasks'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {blueprintOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg maw-card p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-lg font-semibold">Save as Blueprint</div>
              <button
                className="px-2 py-1 rounded border border-slate-700 hover:border-slate-500"
                onClick={() => setBlueprintOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <label className="text-sm text-slate-300">Blueprint name</label>
              <input
                value={blueprintName}
                onChange={(e) => setBlueprintName(e.target.value)}
                placeholder="e.g., Vanish Assistant Operations Plan"
                className="w-full p-2 rounded bg-slate-900 border border-slate-700 text-white placeholder:text-slate-500"
              />

              <div className="text-xs text-slate-400">
                Includes output, preset, and context such as venue, stage size, assistants, and lighting limits.
              </div>

              <button
                className="w-full mt-2 px-4 py-2 rounded bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-40"
                disabled={!outputRaw || savingBlueprint}
                onClick={saveBlueprint}
              >
                {savingBlueprint ? 'Saving…' : 'Save Blueprint'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto max-w-7xl px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className="px-3 py-2 rounded bg-transparent border border-slate-600 hover:border-slate-400 text-slate-200"
            >
              Reset / Clear
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className={
                'px-5 py-2 rounded bg-purple-600 hover:bg-purple-500 text-white transition-transform duration-150 ' +
                (!canGenerate ? 'opacity-30' : 'hover:scale-[1.02] shadow-[0_0_18px_0_rgba(168,85,247,0.25)]')
              }
            >
              {loading ? 'Generating…' : 'Generate'}
            </button>
          </div>

          <div className="flex items-center gap-2">
            {loading ? (
              <button
                onClick={handleCancel}
                className="px-3 py-2 rounded border border-slate-600 hover:border-slate-400 text-slate-200"
              >
                Cancel
              </button>
            ) : null}

            <button
              onClick={handleCopy}
              disabled={!canCopySave}
              className="px-3 py-2 rounded border border-slate-600 hover:border-slate-400 text-slate-200 disabled:opacity-40"
            >
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
            <button
              onClick={handleSaveIdea}
              disabled={!canCopySave}
              className="px-3 py-2 rounded bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-40"
            >
              Save
            </button>
            <button
              onClick={openBlueprint}
              disabled={!canCopySave}
              className="px-3 py-2 rounded border border-slate-600 hover:border-slate-400 text-slate-200 disabled:opacity-40"
            >
              Save Blueprint
            </button>
            <button
              onClick={() => (!canCopySave ? null : openSend())}
              disabled={!canCopySave}
              className="px-3 py-2 rounded border border-slate-600 hover:border-slate-400 text-slate-200 disabled:opacity-40"
            >
              Send to Show Planner
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
