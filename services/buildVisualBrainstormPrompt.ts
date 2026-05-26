export type VisualBrainstormStyleMode =
  | 'realistic_stage'
  | 'luxury_promo'
  | 'technical_prop'
  | 'tv_cinematic'
  | 'vintage_poster'
  | 'fantasy_surreal';

export interface BuildVisualBrainstormPromptParams {
  prompt: string;
  aspectRatio?: string;
  styleMode?: VisualBrainstormStyleMode;
  hasUploadedImage?: boolean;
  /**
   * Fresh generation intentionally severs previous session/image context.
   * Continuity is reserved for explicit edit, variation, or refine actions.
   */
  freshContext?: boolean;
  staleNegativeTerms?: string[];
}

const VISUAL_BRAINSTORM_REALISM_GUIDANCE = `
Create a highly realistic professional magic visualization.

The image should resemble:
- professional theatrical stage photography
- commercial illusion advertising photography
- clean centered composition with the prop/apparatus as the focal point
- believable stage or parlor magic
- commercially buildable illusion concepts
- authentic lighting, props, staging, and audience placement
- practical materials and engineering
- one complete, clearly visible magician or presenter unless the user explicitly requests assistants or spectators
- complete human silhouettes with natural proportions and conservative gesture poses
- clean empty frame edges with no partial people entering from the sides
- physically plausible environments and reflections
- ropes, rings, and props physically supported by visible hands, stands, tables, rigging, or visible apparatus
- professional magician wardrobe and venue details

Preferred aesthetic:
- professional theatrical stage photography
- commercial illusion advertising photography
- clean centered composition
- cinematic realism only when it remains physically realistic
- practical stagecraft
- real-world textures
- grounded theatrical presentation
- premium promotional photography

Avoid unless explicitly requested:
- fantasy spell effects
- glowing magical energy
- impossible levitation beams
- surreal floating geometry
- dreamlike distortions
- cartoon or anime aesthetics
- impossible prop structures
- science-fiction machinery
- horror-style body-part imagery or surreal haunted-house appendage effects

The final image should look like a real magician could actually perform this routine on stage today.
`.trim();

const VISUAL_BRAINSTORM_ANATOMY_SUPPRESSION = `
Human staging lock:
- Use a clean one-presenter stage composition unless the user explicitly requests assistants or spectators.
- Any visible person must appear as a complete, naturally proportioned human figure.
- Keep the sides of the image clear; do not place isolated human body parts at the frame edges.
- Keep performer gestures natural and attached to visible bodies.
- For prop showcases, illusion demos, and apparatus reveals: center the apparatus and place one complete magician beside it.
`.trim();

const VISUAL_BRAINSTORM_NEGATIVE_REINFORCEMENT = `
Composition exclusions:
- no extra people unless explicitly requested
- no isolated body parts at image edges
- no partial assistants entering from the sides
- no horror-appendage staging
- no surreal anatomy
- no unrealistic physics
- no unrelated prior-session props
`.trim();

const VISUAL_BRAINSTORM_FRESH_CONTEXT_ISOLATION = `
Fresh generation context isolation:
- This is a clean-slate, prompt-only image generation request.
- Do not reference, preserve, continue, or echo any prior image, prior prop, prior costume, prior apparatus, prior color palette, prior stage design, prior motif, or prior session artifact.
- Only depict objects, performers, materials, staging, human figures, and atmosphere explicitly requested in the current user concept.
- Treat unrelated elements from earlier generations as prohibited visual contamination.
`.trim();

const buildStaleNegativeGuidance = (terms: string[] = []) => {
  const cleaned = Array.from(new Set(
    terms
      .map((t) => String(t || '').trim())
      .filter(Boolean)
      .filter((t) => t.length >= 3)
  )).slice(0, 18);

  const base = [
    'rope',
    'ropes',
    'ring',
    'rings',
    'brass rings',
    'steampunk apparatus',
    'unrequested assistants holding ropes',
    'unrelated prior-session props',
  ];

  const all = Array.from(new Set([...cleaned, ...base]));
  return `Do not include stale or unrelated prior-session artifacts unless explicitly requested in the current prompt: ${all.join(', ')}.`;
};


const STYLE_MODE_GUIDANCE: Record<VisualBrainstormStyleMode, string> = {
  realistic_stage:
    'Style mode: realistic stage concept. Use grounded theatrical photography, practical staging, and believable real-world props.',
  luxury_promo:
    'Style mode: luxury promo photography. Use polished premium advertising photography while keeping the performance visually plausible and buildable.',
  technical_prop:
    'Style mode: technical prop visualization. Emphasize practical construction, real materials, structural plausibility, and clear prop design.',
  tv_cinematic:
    'Style mode: TV special cinematic. Use dramatic broadcast-quality lighting and camera composition while preserving realistic stagecraft.',
  vintage_poster:
    'Style mode: vintage magic poster. Use classic poster composition, but keep the depicted props and staging physically coherent.',
  fantasy_surreal:
    'Style mode: fantasy/surreal. Artistic stylization is allowed because the user selected or requested a fantasy direction.',
};

export function userExplicitlyRequestedFantasy(prompt: string): boolean {
  return /\b(fantasy|surreal|dreamlike|wizard|spell|magical energy|glowing aura|anime|cartoon|storybook|mythic|sci-fi|science fiction)\b/i.test(
    prompt
  );
}


function needsStrictSinglePresenterLock(prompt: string): boolean {
  return /\b(prop|apparatus|box|production|dog house|cabinet|platform|pedestal|stand|show empty|fog machine|display|showcase|illusion demo)\b/i.test(prompt);
}

function buildStrictSinglePresenterGuidance(prompt: string): string {
  if (!needsStrictSinglePresenterLock(prompt)) return '';
  return `
Strict prop-showcase composition:
- Center the requested apparatus/prop as the main subject.
- Show exactly one complete magician/presenter standing beside the apparatus.
- Do not include assistants, spectators, reaching audience interaction, or side-of-frame people unless the user explicitly asks for them.
- Use a clean professional stage product-photo layout with open space around the prop.
- If the concept involves Halloween, haunted, scary, or mysterious styling, express it through lighting, scenic texture, aged paint, and fog only; do not use horror-body imagery.
`.trim();
}

export function buildVisualBrainstormImagePrompt({
  prompt,
  styleMode = 'realistic_stage',
  hasUploadedImage = false,
  freshContext = false,
  staleNegativeTerms = [],
}: BuildVisualBrainstormPromptParams): string {
  const userPrompt = prompt.trim();
  const realismEnabled = styleMode !== 'fantasy_surreal' && !userExplicitlyRequestedFantasy(userPrompt);
  const sections = [
    realismEnabled ? VISUAL_BRAINSTORM_REALISM_GUIDANCE : '',
    freshContext && !hasUploadedImage ? VISUAL_BRAINSTORM_FRESH_CONTEXT_ISOLATION : '',
    STYLE_MODE_GUIDANCE[styleMode],
    realismEnabled ? VISUAL_BRAINSTORM_ANATOMY_SUPPRESSION : '',
    realismEnabled ? buildStrictSinglePresenterGuidance(userPrompt) : '',
    hasUploadedImage
      ? 'Reference image mode: preserve believable scale, materials, lighting, and practical magic staging while applying the requested changes.'
      : '',
    `User concept:\n${userPrompt}`,
    'Generate a polished, commercially usable magic visualization.',
    realismEnabled ? VISUAL_BRAINSTORM_NEGATIVE_REINFORCEMENT : '',
    freshContext && !hasUploadedImage ? buildStaleNegativeGuidance(staleNegativeTerms) : '',
  ];

  return sections.filter((section) => section.trim().length > 0).join('\n\n').trim();
}
