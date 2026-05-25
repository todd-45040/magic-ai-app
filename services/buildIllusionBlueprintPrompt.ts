import type { IllusionIdentity } from './buildIllusionIdentity';
import { buildIllusionIdentityBrief } from './buildIllusionIdentity';

export type IllusionBlueprintStyleMode =
  | 'realistic_builder_plan'
  | 'technical_blueprint'
  | 'realistic_concept_visual';

export type IllusionBlueprintPlanParams = {
  generationContext: string;
};

export type IllusionBlueprintVisualPlan = {
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
};

export type IllusionBlueprintMatchedOutput = {
  index: number;
  label: 'A' | 'B';
  directive: string;
};

export type IllusionBlueprintImagePromptParams = {
  plan: IllusionBlueprintVisualPlan;
  visualContinuityBrief: string;
  visualAnchor: string;
  illusionIdentity?: IllusionIdentity;
  venueScale: string;
  performerStyle: string;
  matchedOutput: IllusionBlueprintMatchedOutput;
};

export const ILLUSION_BLUEPRINT_MATCHED_OUTPUTS: IllusionBlueprintMatchedOutput[] = [
  {
    index: 0,
    label: 'A',
    directive: 'MATCHED DESIGN A: compact touring version with clean rectangular geometry, visible wheeled base, practical access panels, modest scenic trim, and a restrained premium stage finish.',
  },
  {
    index: 1,
    label: 'B',
    directive: 'MATCHED DESIGN B: slightly more theatrical scenic-shell version with the same footprint and mechanism direction, reinforced base, practical caster support, builder-visible panel logic, and a polished theatre finish.',
  },
];

export const ILLUSION_BLUEPRINT_REALISM_SYSTEM_INSTRUCTION = `You are a professional illusion builder's planning assistant.

Your job is to create realistic, high-quality builder plans for stage and performance illusions.

Realism and physics standards:
- Every plan must conform to real-world physics, gravity, load paths, human movement limits, stage sightlines, and normal theatrical fabrication practices.
- Treat every concept as something a real magician, assistant, crew, and builder would need to rehearse, transport, assemble, reset, and operate safely.
- Do not invent fantasy materials, anti-gravity devices, magical energy, impossible floating structures, portals, teleportation technology, holographic machinery, or science-fiction engineering.
- If the user requests an impossible effect, translate it into a practical theatrical illusion concept that creates the audience impression without claiming impossible engineering.
- If the venue, crew, budget, reset, transport, or safety constraints conflict with the requested effect, adapt the concept to the safest realistic version.

Rules:
- Output ONLY valid JSON matching the provided schema.
- Stay practical, workshop-minded, and non-exposure.
- Use high-level principle language only. Do NOT reveal secrets or step-by-step exposure.
- Prioritize buildability, modularity, transport, stability, safe operation, and realistic rehearsal needs.
- Use common theatrical fabrication language and realistic materials/hardware.
- Keep the response compact and useful for a builder/fabricator.
- No dangerous instructions involving weapons, explosives, pyrotechnics, illegal construction, or unqualified rigging.
- Require professional fabrication, load testing, and safety review where relevant.
- Do NOT propose effects, dimensions, or mechanisms that require hidden infrastructure, trap access, overhead rigging, or external stage modifications unless the user explicitly states those are available.
- Do NOT produce fanciful building plans. Do not describe designs that could not exist in the physical world we live in.
- Build complexity must be a number from 1 to 5.
- English language only. Return every title, label, section, note, and generated text field in clear English. Do not use non-English words unless they are part of a proper noun supplied by the user.`;

const PHYSICS_AND_BUILDABILITY_GUIDANCE = `Realism standard:
- Keep the concept grounded in real-world physics and stagecraft.
- Use practical theatrical construction, conventional materials, believable load paths, and safe human-scale operation.
- The result should be something a competent illusion builder could evaluate, prototype, transport, rehearse, and operate after proper engineering and safety review.
- No magical energy, anti-gravity, portals, impossible levitation beams, floating geometry, fantasy machinery, or science-fiction technology.
- No unsupported loads, impossible balance, unsafe performer positioning, unprotected pinch points, or vague mechanisms that ignore gravity, weight, sightlines, or reset logistics.
- If the requested visual effect is impossible literally, represent it as a realistic stage illusion presentation rather than a literal physics violation.`;

const BLUEPRINT_STYLE_GUIDE = `Create technical blueprint-style drawings for a stage illusion prop.

${PHYSICS_AND_BUILDABILITY_GUIDANCE}

Drawing requirements:
- Show practical construction-oriented diagram views with clean white or light blue linework on a dark blueprint background.
- Include front elevation, side elevation, and cutaway or mechanism-style layout where helpful.
- Emphasize structural sections, dimensional feel, fabrication logic, workshop realism, access, stability, transport, and believable real-world construction.
- Every support, platform, base, cabinet, frame, caster, hinge, and panel must appear physically plausible and structurally grounded.
- English language only across the entire drawing.
- Any visible labels must be short, clear English words such as FRONT, SIDE, BASE, PANEL, FRAME, WHEEL, HINGE, TRIM, ACCESS, SUPPORT, PLATFORM, TOP, LEFT, RIGHT.
- Do not use non-English writing, pseudo-foreign characters, random glyphs, or unreadable invented labels.
- No text paragraphs. No poster art. No glossy rendering. No fantasy concept art.
- The drawing must clearly show a stage illusion apparatus with builder-visible structure; never show food, consumer products, unrelated stock objects, landscapes, animals, or random props outside the requested illusion.
- Make it look like an illusion builder's practical technical concept sheet, not a fanciful invention.`;

const IMAGE_STYLE_GUIDE = `Create theatrical but practical illusion concept imagery.

${PHYSICS_AND_BUILDABILITY_GUIDANCE}

Visual requirements:
- Show the prop or illusion unit clearly in a real stage, parlor, theatre, ballroom, or event environment.
- Prioritize believable materials, clean stage presentation, builder-oriented visibility, fabrication realism, and touring-feasible scale.
- Use realistic lighting, shadows, human proportions, sightlines, audience placement, and professional magician wardrobe.
- Any platform, cabinet, base, frame, trunk, scenic shell, or support structure must appear buildable and physically stable.
- English language only across the entire image.
- Do not include non-English words, pseudo-foreign writing, random glyphs, or unreadable invented text.
- If any visible labels or signs appear, they must be simple English words only; otherwise use no text overlays.
- No exploded diagrams. No impossible sci-fi visuals, floating structures, fantasy physics, magical energy effects, portals, glowing force fields, or abstract AI-art compositions.
- The image must clearly show a stage illusion apparatus or performance prop matching the builder plan; never show food, hamburgers, sandwiches, consumer products, animals, unrelated still-life objects, landscapes, or generic stock photography.
- The final image should look like a real staged illusion concept or practical promotional photograph.`;

export function buildIllusionBlueprintPlanPrompt({ generationContext }: IllusionBlueprintPlanParams): string {
  return [
    'Create a realistic builder plan for the following illusion request.',
    '',
    PHYSICS_AND_BUILDABILITY_GUIDANCE,
    '',
    generationContext,
    '',
    'Return a compact, practical plan for a real builder/fabricator.',
    'Use English language only throughout every field of the plan.',
    'The mechanism section must stay non-exposure and principle-based only.',
    'Include only 1 primary and 1 alternate mechanism direction.',
    'Keep all sections concise and reliable.',
    'If the original request is fanciful or physically impossible, convert it into a realistic theatrical illusion design that creates the audience impression without violating real-world physics.',
  ].join('\n');
}

export function buildIllusionBlueprintDrawingPrompt({
  plan,
  visualContinuityBrief,
  visualAnchor,
  illusionIdentity,
  matchedOutput,
}: IllusionBlueprintImagePromptParams): string {
  return [
    BLUEPRINT_STYLE_GUIDE,
    '',
    visualContinuityBrief,
    '',
    illusionIdentity ? buildIllusionIdentityBrief(illusionIdentity) : '',
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
    `Matched output requirement: This is Blueprint ${matchedOutput.label}. ${matchedOutput.directive}`,
    `Blueprint continuity requirement: Create exactly one technical drawing sheet for Matched Design ${matchedOutput.label} of the same ${visualAnchor}; do not introduce unrelated boxes, tables, cabinets, platforms, fantasy machinery, food, consumer products, stock objects, or impossible floating structures unless they are part of this practical plan.`,
    'Pairing requirement: This blueprint must be visually matchable to the Concept Image with the same letter. Keep the silhouette, base, major panels, footprint, finish direction, and visible construction cues consistent.',
    'Physics requirement: every visual element must look structurally supported, safely balanced, human-scale, and physically buildable in a real workshop or theatre.',
    'Language requirement: English only. If labels appear inside the drawing, they must be readable English labels. Avoid foreign words, pseudo-language, random symbols, and garbled text.',
    `Create one technical drawing style image suitable for illusion build planning. Do not create multiple alternate concepts inside the same image; only show Matched Design ${matchedOutput.label}.`,
  ].join('\n');
}

export function buildIllusionConceptImagePrompt({
  plan,
  visualContinuityBrief,
  visualAnchor,
  illusionIdentity,
  venueScale,
  performerStyle,
  matchedOutput,
}: IllusionBlueprintImagePromptParams): string {
  return [
    IMAGE_STYLE_GUIDE,
    '',
    visualContinuityBrief,
    '',
    illusionIdentity ? buildIllusionIdentityBrief(illusionIdentity) : '',
    '',
    `Project title: ${plan.project_title}`,
    `Audience effect: ${plan.audience_effect}`,
    `Build concept: ${plan.build_concept}`,
    `Dimensions / footprint: ${plan.dimensions_footprint}`,
    `Materials direction: ${plan.recommended_construction.materials.join(', ')}`,
    `Mobility / modularity: ${plan.recommended_construction.mobility_modularity}`,
    `Venue / scale: ${venueScale}`,
    `Performer style: ${performerStyle}`,
    `Matched output requirement: This is Concept ${matchedOutput.label}. ${matchedOutput.directive}`,
    `Concept continuity requirement: Produce exactly one realistic staged rendering of Matched Design ${matchedOutput.label} for the same ${visualAnchor}. This concept image must match Blueprint ${matchedOutput.label} in silhouette, base shape, major panels, footprint, visible structure, finish direction, and practical construction cues.`,
    'Pairing requirement: Do not invent a new prop. Do not change the illusion category. Do not replace the blueprint with an unrelated cabinet, platform, trunk, table, scenic unit, food item, consumer product, animal, landscape, or stock-photo object.',
    'Physics requirement: all concept images must look practical, stable, human-scale, safely staged, and commercially buildable. Do not generate fantasy energy effects, impossible geometry, cartoon styling, distorted anatomy, or unrealistic physics.',
    'Language requirement: English only. Any signage, labels, notes, or visible words inside the concept image must be clear English. Prefer no text if clean English text cannot be rendered reliably.',
    `Produce one polished realistic concept image that matches Blueprint ${matchedOutput.label}. The image must contain the illusion apparatus as the central subject; if the prompt could be interpreted as food, product photography, or a generic object, ignore that interpretation and render the practical stage illusion instead.`,
  ].join('\n');
}
