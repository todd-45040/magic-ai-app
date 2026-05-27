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
- restrained stage realism only when it keeps the apparatus geometry readable
- practical stagecraft
- real-world textures
- grounded theatrical presentation
- practical promotional photography with clear prop geometry

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




const VISUAL_BRAINSTORM_OPERATIONAL_STATE_ANCHOR = `
Operational state anchor:
- Preserve the requested apparatus identity across every generated variation. The operational state may change, but the apparatus family must not change.
- Keep the same primary silhouette, scale, base/platform form, dominant geometry, material language, theatrical setting, and illusion category from the user concept.
- Operational-state changes may ONLY alter door positions, panel positions, lid/roof position, empty/reveal condition, performer interaction, visibility state, and lighting emphasis.
- Do not replace the requested apparatus with a different illusion type, levitation rig, suspension device, black-art platform, generic demonstration stand, abstract display rig, hoop/ring apparatus, rope apparatus, cabinet substitute, or unrelated stage mechanism.
- If the prompt asks for a dog house production, every variation must remain a dog-house production apparatus. If the prompt asks for a box, every variation must remain that box family. If the prompt asks for a cabinet/platform/pedestal, preserve that apparatus category.
- Apply state inheritance before styling: apparatus category first, primary silhouette second, structural geometry third, base/platform form fourth, theatrical setting fifth, then operational state.
- For empty-display mode, show the same apparatus with doors/panels open and the interior visibly empty; do not invent a different inspection rig.
- For closed-ready mode, show the same apparatus closed and prepared for presentation.
- For reveal/production mode, show the same apparatus in reveal condition; do not switch to another production method or unrelated scenic prop.
`.trim();

const VISUAL_BRAINSTORM_PROFESSIONAL_ILLUSION_REFINEMENT = `
Professional illusion design refinement:
- Apparatus engineering realism: show believable wheel/caster placement, base width, stage transport logic, balanced center of gravity, visible support points, practical pedestal/table geometry, and stable load paths.
- Trap/access plausibility: if the concept needs access, suggest it visually through plausible panel seams, hinged doors, removable lids, service panels, or builder-friendly openings without exposing secrets.
- Performance blocking intelligence: place the magician in a natural working stance beside the apparatus, facing the audience with clear reveal orientation, ergonomic reach distance, and sightline-aware spacing.
- Assistant positioning: include assistants only when explicitly requested; if included, show complete assistants in natural positions with clear purpose and no cropped limbs.
- Stage lighting intelligence: use realistic theatre spotlights, practical stage wash, believable shadows, and only light controlled fog/haze that does not obscure the apparatus geometry.
- Builder material intelligence: render credible wood grain, metal brackets, hinges, latches, casters, seams, trim, scenic paint, theatrical finish materials, and fabrication details.
- Keep the image useful to an illusion designer: the apparatus should look like it could be fabricated, transported, rolled into position, rehearsed, photographed professionally, and converted into a readable blueprint.
`.trim();


const VISUAL_BRAINSTORM_BLUEPRINT_HANDOFF_POLISH = `
Blueprint handoff polish:
- When the concept is an illusion apparatus, prop, box, cabinet, house, platform, pedestal, or production device, make the apparatus easy to read as a buildable object.
- Favor simple product-photo stage composition over cinematic spectacle: clear silhouette, visible base, visible floor contact, believable scale, and readable front/side structure.
- Do not let fog, spotlights, darkness, or dramatic camera angles hide the primary geometry, base, wheels, openings, doors, panels, or support structure.
- Keep decorative styling restrained and inherited from the requested concept; do not upscale into luxury scenery, fantasy architecture, or an unrelated illusion category.
- Preserve one clear mechanism impression per image: same front/roof/lid/opening logic, not multiple competing reveal systems.
- The image should be a strong seed for a fabrication blueprint: clear apparatus identity first, theatrical mood second.
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
    'Style mode: TV special cinematic. Use broadcast-quality lighting while preserving readable prop geometry, realistic stagecraft, and buildable apparatus structure.',
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
    realismEnabled ? VISUAL_BRAINSTORM_OPERATIONAL_STATE_ANCHOR : '',
    realismEnabled ? VISUAL_BRAINSTORM_PROFESSIONAL_ILLUSION_REFINEMENT : '',
    realismEnabled ? VISUAL_BRAINSTORM_BLUEPRINT_HANDOFF_POLISH : '',
    hasUploadedImage
      ? 'Reference image mode: preserve believable scale, materials, lighting, and practical magic staging while applying the requested changes.'
      : '',
    `User concept:\n${userPrompt}`,
    'Generate a polished, commercially usable magic visualization with clear apparatus geometry suitable for later blueprint conversion.',
    realismEnabled ? VISUAL_BRAINSTORM_NEGATIVE_REINFORCEMENT : '',
    freshContext && !hasUploadedImage ? buildStaleNegativeGuidance(staleNegativeTerms) : '',
  ];

  return sections.filter((section) => section.trim().length > 0).join('\n\n').trim();
}
