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
- real theatrical photography
- believable stage or parlor magic
- commercially buildable illusion concepts
- authentic lighting, props, staging, and audience placement
- practical materials and engineering
- realistic body proportions, natural hand anatomy, and complete visible human figures
- physically plausible environments and reflections
- every visible arm, hand, leg, and face must belong to a clearly visible person or assistant in the scene
- ropes, rings, and props must be physically supported by hands, stands, tables, rigging, or visible apparatus
- professional magician wardrobe and venue details

Preferred aesthetic:
- cinematic realism
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
- warped anatomy, malformed hands, disembodied limbs, floating arms, extra fingers, duplicated body parts, or partial people entering from nowhere
- impossible prop structures
- science-fiction machinery
- abstract AI-art compositions

The final image should look like a real magician could actually perform this routine on stage today.
`.trim();

const VISUAL_BRAINSTORM_NEGATIVE_REINFORCEMENT =
  'Do not generate fantasy energy effects, impossible geometry, cartoon styling, distorted anatomy, disembodied limbs, floating arms, extra hands, partial people, or unrealistic physics unless explicitly requested by the user.';

const VISUAL_BRAINSTORM_FRESH_CONTEXT_ISOLATION = `
Fresh generation context isolation:
- This is a clean-slate, prompt-only image generation request.
- Do not reference, preserve, continue, or echo any prior image, prior prop, prior costume, prior apparatus, prior color palette, prior stage design, prior motif, or prior session artifact.
- Only depict objects, performers, materials, staging, and atmosphere explicitly requested in the current user concept.
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
