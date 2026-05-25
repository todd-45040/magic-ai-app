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
}

export interface VisualBrainstormPromptValidation {
  ok: boolean;
  missingRequired: string[];
  blockedTerms: string[];
}

const REQUIRED_REALISM_CATEGORIES: Record<string, string[]> = {
  stage: ['stage', 'theater', 'theatre', 'parlor', 'parlour', 'performance venue', 'showroom', 'club venue'],
  apparatus: ['apparatus', 'prop', 'practical prop', 'magic prop', 'routine object', 'stage equipment', 'performance object'],
  performance: ['magician', 'performer', 'performance', 'routine', 'stagecraft', 'audience'],
  physics: ['physically plausible', 'real-world physics', 'believable scale', 'practical materials', 'commercially buildable'],
};

const HARD_ANTI_DRIFT_TERMS = [
  'food',
  'hamburger',
  'burger',
  'sandwich',
  'pizza',
  'furniture',
  'sofa',
  'couch',
  'appliance',
  'refrigerator',
  'washing machine',
  'microwave',
  'unrelated product',
  'product photography',
  'fantasy weapon',
  'axe',
  'gun',
  'ray gun',
  'science-fiction machinery',
  'sci-fi machinery',
  'animal',
  'dragon',
  'monster',
  'creature',
  'surreal abstract art',
  'abstract art',
];

const VISUAL_BRAINSTORM_REALISM_GUIDANCE = `
Create a highly realistic professional magic visualization that obeys real-world physics.

The image must depict a practical magic performance idea that could exist in the real world. It should clearly include:
- a believable stage, parlor, theater, showroom, or performance venue context
- a magician, performer, practical prop, stage apparatus, or routine object
- realistic audience orientation, camera perspective, and performance staging
- practical materials, believable scale, and physically plausible construction
- authentic lighting, props, wardrobe, venue details, and stagecraft
- realistic body proportions and hand anatomy
- physically plausible environments, reflections, shadows, support points, and object placement

Preferred aesthetic:
- cinematic realism
- practical stagecraft
- real-world textures
- grounded theatrical presentation
- premium promotional photography

Hard anti-drift exclusions — do not generate:
- food, hamburgers, sandwiches, pizza, drinks, or restaurant items
- furniture, home decor, sofas, chairs, tables, or unrelated room furnishings as the subject
- appliances, electronics-as-products, or household products unrelated to a magic routine
- unrelated commercial products, stock product photography, package shots, or catalog imagery
- fantasy weapons, sci-fi machinery, ray guns, robots, spaceships, or futuristic machines
- animals, monsters, dragons, creatures, mascots, or pet imagery
- surreal abstract art, floating geometry, dreamlike distortions, or non-representational AI art
- fantasy spell effects, glowing magical energy, impossible levitation beams, or supernatural portals
- cartoon, anime, toy-like, warped anatomy, malformed hands, or impossible prop structures

The final image should look like a real magician could actually stage, photograph, rehearse, or perform this routine today.
`.trim();

const VISUAL_BRAINSTORM_NEGATIVE_REINFORCEMENT = `
Do not reinterpret the request into unrelated objects or fantasy artwork. Do not generate food, furniture, appliances, unrelated products, fantasy weapons, sci-fi machinery, animals, or surreal abstract art. Keep every object grounded in real-world stage magic physics.
`.trim();

const STYLE_MODE_GUIDANCE: Record<VisualBrainstormStyleMode, string> = {
  realistic_stage:
    'Style mode: realistic stage concept. Use grounded theatrical photography, practical staging, believable real-world props, and physically plausible stagecraft.',
  luxury_promo:
    'Style mode: luxury promo photography. Use polished premium advertising photography while keeping the performance visually plausible, practical, and buildable.',
  technical_prop:
    'Style mode: technical prop visualization. Emphasize practical construction, real materials, structural plausibility, and clear prop design that obeys real-world physics.',
  tv_cinematic:
    'Style mode: TV special cinematic. Use dramatic broadcast-quality lighting and camera composition while preserving realistic stagecraft and practical staging.',
  vintage_poster:
    'Style mode: vintage magic poster. Use classic poster composition, but keep the depicted props, staging, anatomy, and physics coherent.',
  fantasy_surreal:
    'Style mode: realism-protected imaginative concept. Keep the mood theatrical, but do not create supernatural effects, fantasy creatures, sci-fi machinery, impossible physics, or unrelated surreal imagery.',
};

export function userExplicitlyRequestedFantasy(prompt: string): boolean {
  return /\b(fantasy|surreal|dreamlike|wizard|spell|magical energy|glowing aura|anime|cartoon|storybook|mythic|sci-fi|science fiction)\b/i.test(
    prompt
  );
}

function extractUserConcept(prompt: string): string {
  const marker = 'User concept:';
  const idx = prompt.indexOf(marker);
  if (idx < 0) return prompt;
  const afterMarker = prompt.slice(idx + marker.length);
  const nextSection = afterMarker.search(/\n\n[A-Z][^\n]+/);
  return nextSection >= 0 ? afterMarker.slice(0, nextSection) : afterMarker;
}

export function validateVisualBrainstormPrompt(prompt: string): VisualBrainstormPromptValidation {
  const normalized = prompt.toLowerCase();
  const userConcept = extractUserConcept(prompt).toLowerCase();
  const missingRequired = Object.entries(REQUIRED_REALISM_CATEGORIES)
    .filter(([, terms]) => !terms.some((term) => normalized.includes(term)))
    .map(([category]) => category);

  // Only inspect the user's concept for blocked drift terms. The provider prompt
  // intentionally contains these words inside "do not generate" guardrails.
  const blockedTerms = HARD_ANTI_DRIFT_TERMS.filter((term) => userConcept.includes(term));

  return {
    ok: missingRequired.length === 0 && blockedTerms.length === 0,
    missingRequired,
    blockedTerms,
  };
}

export function reinforceVisualBrainstormPrompt(prompt: string): string {
  const validation = validateVisualBrainstormPrompt(prompt);
  if (validation.ok) return prompt;

  const reinforcement = `
Visual Brainstorm realism lock:
- The image must show a real-world magic performance idea, not an unrelated object.
- Required context: stage/theater/parlor venue, magician or performer, practical magic prop or apparatus, audience-facing staging, and physically plausible construction.
- All elements must obey real-world physics, believable scale, practical materials, realistic shadows, realistic supports, and grounded theatrical lighting.
- Reject semantic drift into food, furniture, appliances, unrelated products, fantasy weapons, sci-fi machinery, animals, or surreal abstract art.
`.trim();

  return `${prompt}\n\n${reinforcement}`.trim();
}

export function buildVisualBrainstormImagePrompt({
  prompt,
  styleMode = 'realistic_stage',
  hasUploadedImage = false,
}: BuildVisualBrainstormPromptParams): string {
  const userPrompt = prompt.trim();
  const protectedStyleMode: VisualBrainstormStyleMode = styleMode === 'fantasy_surreal' ? 'fantasy_surreal' : styleMode;
  const sections = [
    VISUAL_BRAINSTORM_REALISM_GUIDANCE,
    STYLE_MODE_GUIDANCE[protectedStyleMode],
    userExplicitlyRequestedFantasy(userPrompt)
      ? 'User wording includes a fantasy or surreal cue. Interpret it only as theatrical mood. Do not render impossible physics, supernatural forces, sci-fi machinery, fantasy creatures, or abstract art.'
      : '',
    hasUploadedImage
      ? 'Reference image mode: preserve believable scale, materials, lighting, practical magic staging, and real-world physics while applying the requested changes.'
      : '',
    `User concept:\n${userPrompt}`,
    'Generate a polished, commercially usable magic visualization that a real magician could stage or rehearse.',
    VISUAL_BRAINSTORM_NEGATIVE_REINFORCEMENT,
  ];

  return reinforceVisualBrainstormPrompt(sections.filter((section) => section.trim().length > 0).join('\n\n').trim());
}
