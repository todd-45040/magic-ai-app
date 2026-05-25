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

const VISUAL_BRAINSTORM_REALISM_GUIDANCE = `
Create a highly realistic professional magic visualization.

The image should resemble:
- real theatrical photography
- believable stage or parlor magic
- commercially buildable illusion concepts
- authentic lighting, props, staging, and audience placement
- practical materials and engineering
- realistic body proportions and hand anatomy
- physically plausible environments and reflections
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
- warped anatomy or malformed hands
- impossible prop structures
- science-fiction machinery
- abstract AI-art compositions

The final image should look like a real magician could actually perform this routine on stage today.
`.trim();

const VISUAL_BRAINSTORM_NEGATIVE_REINFORCEMENT =
  'Do not generate fantasy energy effects, impossible geometry, cartoon styling, distorted anatomy, or unrealistic physics unless explicitly requested by the user.';

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
}: BuildVisualBrainstormPromptParams): string {
  const userPrompt = prompt.trim();
  const realismEnabled = styleMode !== 'fantasy_surreal' && !userExplicitlyRequestedFantasy(userPrompt);
  const sections = [
    realismEnabled ? VISUAL_BRAINSTORM_REALISM_GUIDANCE : '',
    STYLE_MODE_GUIDANCE[styleMode],
    hasUploadedImage
      ? 'Reference image mode: preserve believable scale, materials, lighting, and practical magic staging while applying the requested changes.'
      : '',
    `User concept:\n${userPrompt}`,
    'Generate a polished, commercially usable magic visualization.',
    realismEnabled ? VISUAL_BRAINSTORM_NEGATIVE_REINFORCEMENT : '',
  ];

  return sections.filter((section) => section.trim().length > 0).join('\n\n').trim();
}
