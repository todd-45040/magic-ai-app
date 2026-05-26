import type { IllusionIdentity } from './buildIllusionIdentity';
import type { IllusionSeedIdentity } from './illusionSeedIdentity';
import { buildSeedIdentityBrief } from './illusionSeedIdentity';
import { buildIllusionIdentityBrief } from './buildIllusionIdentity';

export type IllusionBlueprintStyleMode =
  | 'realistic_builder_plan'
  | 'technical_blueprint'
  | 'realistic_concept_visual';

export type IllusionBlueprintPlanParams = {
  generationContext: string;
  seedIdentity?: IllusionSeedIdentity | null;
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
  seedIdentity?: IllusionSeedIdentity | null;
};

export const ILLUSION_BLUEPRINT_MATCHED_OUTPUTS: IllusionBlueprintMatchedOutput[] = [
  {
    index: 0,
    label: 'A',
    directive: 'MATCHED DESIGN A: compact touring version that preserves the seed silhouette and primary props, uses practical support/base logic only where needed, includes builder-visible access or rigging cues, modest scenic trim, and a restrained premium stage finish.',
  },
  {
    index: 1,
    label: 'B',
    directive: 'MATCHED DESIGN B: slightly more theatrical version that preserves the same seed silhouette, prop relationships, footprint, and mechanism direction while adding polished theatre finish, stronger scenic framing, and practical transport/support details.',
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



const PROFESSIONAL_ILLUSION_DESIGN_REFINEMENT = `Professional illusion design refinement:
- Apparatus engineering realism: specify and depict believable base stability, wheel/caster placement, load paths, center-of-gravity logic, floor contact, transport modularity, and human-scale proportions.
- Trap/access plausibility: include high-level access logic through plausible seams, hinged panels, removable sections, service openings, platform/base access, or scenic shells without exposing secret methods.
- Performance blocking intelligence: preserve practical performer stance, reveal orientation, audience sightlines, ergonomic reach distance, reset path, and safe operating space.
- Stage lighting intelligence: use practical theatre spotlights, realistic stage wash, controlled fog/haze, believable floor shadows, and commercial promo-photo lighting rather than surreal atmosphere.
- Builder material intelligence: use credible wood grain, plywood, aluminum/steel framing, hinges, latches, casters, handles, brackets, seams, scenic paint, trim, and theatrical finish materials.
- The design should feel like a professional illusion development environment output: buildable, transportable, rehearseable, stage-ready, and visually tied to the selected concept.`;





const MECHANISM_AND_FABRICATION_INTELLIGENCE = `Mechanism and fabrication intelligence:
- Mechanism plausibility: show or describe non-exposure concealment volume, believable hidden access paths, realistic load chambers, and production routing as high-level theatrical engineering cues only.
- Structural realism: reinforce weight support, load-bearing frame members, hinge logic, panel operation, caster load realism, bracing, platform stability, center-of-gravity control, and stage mobility engineering.
- Blueprint intelligence: include clearer labeled sections, cutaway sections, exploded mechanism-style views, front/side/top relationships, service-panel callouts, performer-position overlays, audience sightline arrows, and operation-state notes when visually appropriate.
- Render intelligence: preserve closed-state and reveal-state continuity, interior visibility logic, practical performer blocking, reveal orientation, service access placement, and operation-stage continuity from the paired blueprint.
- Keep all mechanism information non-exposure and principle-based. Do not reveal secret methods, detailed load procedures, hidden-person instructions, trap construction steps, or unsafe rigging instructions.
- The output should look like a builder/fabricator can evaluate plausibility without receiving exposure-level instructions.`;

const DIMENSIONED_BLUEPRINT_REQUIREMENTS = `Dimensioned blueprint requirements:
- Include clear approximate builder dimensions directly on the blueprint drawing, using readable English measurement callouts.
- Dimension callouts should include overall width, overall depth, overall height, base/platform height, door or visible opening size, caster/wheel diameter, access panel location, roof/top clearance, and usable load/interior area where relevant.
- Use realistic approximate stage prop dimensions in inches or feet based on the builder plan footprint; examples: OVERALL 48" W x 36" D x 72" H, BASE 8" H, DOOR 24" W x 30" H, CASTERS 4", ACCESS PANEL, LOAD AREA.
- Keep measurements non-exposure and fabrication-planning oriented; do not describe secret method steps.
- Measurement labels must be legible English and placed as builder callouts, arrows, side notes, or dimension lines.`;

const DIMENSIONED_PAIR_LOCK_REQUIREMENTS = `Dimensioned pair lock requirements:
- Blueprint A controls Concept A. Blueprint B controls Concept B.
- The concept render must be a photorealistic stage rendition of the exact same apparatus shown in its paired blueprint.
- Do not redesign the roofline, base, wheels, platform, doors, panels, proportions, decoration, trim, support structure, access panel placement, or visible hardware.
- The blueprint is the controlling source of truth for the matching concept render.
- The concept render may add realistic lighting, performer stance, stage curtains, practical fog, and material texture, but it must not invent a different apparatus.
- Preserve the same measured proportions implied by the blueprint dimensions.`;

const HARD_ANTI_DRIFT_EXCLUSIONS = `Hard anti-drift exclusions:
- Do not generate food, hamburgers, sandwiches, cakes, drinks, or any edible object.
- Do not generate furniture unless it is explicitly part of the illusion apparatus described in the builder plan.
- Do not generate appliances, kitchen equipment, consumer electronics, vehicles, or unrelated household objects.
- Do not generate unrelated commercial products, product photography, catalog shots, logos, packaging, or stock-image objects.
- Do not generate fantasy weapons, sci-fi machinery, teleportation machines, portals, ray guns, robots, or futuristic devices.
- Do not generate animals, creatures, monsters, mascots, landscapes, nature scenes, or unrelated characters.
- Do not generate surreal abstract art, dreamlike AI-art compositions, magical energy beams, floating geometry, or non-physical fantasy scenes.
- If the request could be interpreted as one of these excluded subjects, ignore that interpretation and render the practical theatrical illusion apparatus instead.`;

const PHYSICS_AND_BUILDABILITY_GUIDANCE = `Realism standard:
- Keep the concept grounded in real-world physics and stagecraft.
- Use practical theatrical construction, conventional materials, believable load paths, and safe human-scale operation.
- The result should be something a competent illusion builder could evaluate, prototype, transport, rehearse, and operate after proper engineering and safety review.
- No magical energy, anti-gravity, portals, impossible levitation beams, floating geometry, fantasy machinery, or science-fiction technology.
- No unsupported loads, impossible balance, unsafe performer positioning, unprotected pinch points, or vague mechanisms that ignore gravity, weight, sightlines, or reset logistics.
- If the requested visual effect is impossible literally, represent it as a realistic stage illusion presentation rather than a literal physics violation.`;

const BLUEPRINT_STYLE_GUIDE = `Create technical blueprint-style drawings for a stage illusion prop.

${PHYSICS_AND_BUILDABILITY_GUIDANCE}

${PROFESSIONAL_ILLUSION_DESIGN_REFINEMENT}

${MECHANISM_AND_FABRICATION_INTELLIGENCE}

${DIMENSIONED_BLUEPRINT_REQUIREMENTS}

${DIMENSIONED_PAIR_LOCK_REQUIREMENTS}

${HARD_ANTI_DRIFT_EXCLUSIONS}

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


const APPARATUS_VALIDATION_REQUIREMENTS = `Phase 4 apparatus validation requirements:
- The render must clearly include a stage, theatre, parlor, platform, performance floor, audience orientation, or comparable show environment.
- The render must clearly include an illusion apparatus as the central subject.
- The render must clearly include illusion structure such as a cabinet, trunk, platform, base, frame, panel, support, scenic shell, or builder-visible prop geometry.
- The render must clearly communicate theatrical context rather than product photography, still life, landscape, food imagery, furniture imagery, or generic stock photography.
- The render must include magician staging language or magician-performance cues such as performer position, assistant position, audience-facing orientation, stage lighting, curtains, wings, rehearsal space, show floor, or stage-ready composition.
- If these cues are not present, the render should be considered invalid and regenerated.`;

const IMAGE_STYLE_GUIDE = `Create theatrical but practical illusion concept imagery.

${PHYSICS_AND_BUILDABILITY_GUIDANCE}

${PROFESSIONAL_ILLUSION_DESIGN_REFINEMENT}

${MECHANISM_AND_FABRICATION_INTELLIGENCE}

${DIMENSIONED_PAIR_LOCK_REQUIREMENTS}

${HARD_ANTI_DRIFT_EXCLUSIONS}

${APPARATUS_VALIDATION_REQUIREMENTS}

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


const buildBlueprintToRenderLock = ({ matchedOutput, visualAnchor }: Pick<IllusionBlueprintImagePromptParams, 'matchedOutput' | 'visualAnchor'>): string => [
  `BLUEPRINT-TO-RENDER LOCK FOR MATCHED DESIGN ${matchedOutput.label}:`,
  `Render THIS EXACT illusion apparatus shown in Blueprint ${matchedOutput.label} for the same ${visualAnchor}.`,
  `Blueprint ${matchedOutput.label} is the controlling design source for Concept ${matchedOutput.label}.`,
  'The concept render must be a photorealistic stage rendition of the exact same apparatus shown in its paired blueprint.',
  'Do not redesign the roofline, base, wheels, platform, doors, panels, proportions, decoration, trim, support structure, access panel placement, visible hardware, or caster/wheel arrangement.',
  'Maintain identical silhouette from the blueprint drawing.',
  'Maintain the same staging footprint and floor relationship from the blueprint drawing.',
  'Maintain the same mechanism placement and visible apparatus logic from the blueprint drawing.',
  'Maintain the same materials, finish direction, construction cues, and scenic trim from the blueprint drawing.',
  'Maintain the same audience orientation, camera/viewing angle, and theatrical context from the blueprint drawing.',
  'Maintain the same proportions, base shape, major panels, supports, frames, casters, hinges, access panels, and platform geometry from the blueprint drawing.',
  'Do not reinterpret the apparatus.',
  'Do not redesign the illusion.',
  'Do not substitute a different prop, cabinet, platform, trunk, table, product, food item, animal, landscape, or unrelated object.',
  HARD_ANTI_DRIFT_EXCLUSIONS,
  'The rendered concept image should look like a realistic staged/photo version of the matching blueprint, not a new visual idea.',
].join('\n');

export function buildIllusionBlueprintPlanPrompt({ generationContext, seedIdentity }: IllusionBlueprintPlanParams): string {
  const seedIdentityBrief = buildSeedIdentityBrief(seedIdentity || null);
  return [
    'Create a realistic builder plan for the following illusion request.',
    '',
    PHYSICS_AND_BUILDABILITY_GUIDANCE,
    '',
    PROFESSIONAL_ILLUSION_DESIGN_REFINEMENT,
    '',
    MECHANISM_AND_FABRICATION_INTELLIGENCE,
    '',
    generationContext,
    '',
    seedIdentityBrief,
    '',
    'STRUCTURAL CONTINUITY REQUIREMENT: If a seed image identity is provided, the builder plan must evolve that exact selected concept. Preserve the seed props, dominant geometry, silhouette, performer staging, material style, atmosphere, and composition. Do not collapse the design into a generic cabinet, random box, dollhouse, cottage, standard appearance cage, trunk, or unrelated illusion archetype unless those forms are explicitly present in the seed identity.',
    'Return a compact, practical plan for a real builder/fabricator.',
    'Use English language only throughout every field of the plan.',
    HARD_ANTI_DRIFT_EXCLUSIONS,
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
  seedIdentity,
}: IllusionBlueprintImagePromptParams): string {
  return [
    BLUEPRINT_STYLE_GUIDE,
    '',
    visualContinuityBrief,
    '',
    PROFESSIONAL_ILLUSION_DESIGN_REFINEMENT,
    '',
    MECHANISM_AND_FABRICATION_INTELLIGENCE,
    '',
    buildSeedIdentityBrief(seedIdentity || null),
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
    DIMENSIONED_BLUEPRINT_REQUIREMENTS,
    DIMENSIONED_PAIR_LOCK_REQUIREMENTS,
    `Primary mechanism direction: ${plan.mechanism_approach.primary}`,
    `Mobility / modularity: ${plan.recommended_construction.mobility_modularity}`,
    'Mechanism/fabrication requirement: include non-exposure labels for concealment volume, service access path, load chamber zone, hinge/panel operation, caster/load support, performer position, and audience sightline direction where they make sense for this apparatus.',
    'Blueprint view requirement: include at least one cutaway or exploded-view style area that clarifies structure, support, access, and operation-state relationships without exposing a secret method.',
    `Matched output requirement: This is Blueprint ${matchedOutput.label}. ${matchedOutput.directive}`,
    'Seed continuity requirement: the technical drawing must look engineered from the selected source concept, preserving its primary props, dominant geometry, silhouette, performer-to-prop relationship, stage layout, material language, and mood. The broad illusion category is less important than the seed image identity.',
    'Anti-generic substitution: do not replace rope/ring/suspension/open apparatus concepts with sealed cabinets, dollhouses, cottages, house facades, unrelated boxes, standard sawing props, appearance cages, or trunk illusions unless the seed explicitly contains those elements.',
    `Blueprint continuity requirement: Create exactly one technical drawing sheet for Matched Design ${matchedOutput.label} of the same ${visualAnchor}; do not introduce unrelated boxes, tables, cabinets, platforms, fantasy machinery, food, consumer products, stock objects, or impossible floating structures unless they are part of this practical plan.`,
    'Pairing requirement: This blueprint must be the controlling design source for the Concept Image with the same letter. Keep the silhouette, base, major panels, footprint, finish direction, measured proportions, hardware, access panels, roofline/top line, platform geometry, and visible construction cues consistent.',
    'Physics requirement: every visual element must look structurally supported, safely balanced, human-scale, and physically buildable in a real workshop or theatre.',
    'Language requirement: English only. If labels appear inside the drawing, they must be readable English labels. Avoid foreign words, pseudo-language, random symbols, and garbled text.',
    `Create one dimensioned technical drawing style image suitable for illusion build planning. Do not create multiple alternate concepts inside the same image; only show Matched Design ${matchedOutput.label}. The image must include visible dimension callouts and measurement lines.`,
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
  seedIdentity,
}: IllusionBlueprintImagePromptParams): string {
  return [
    IMAGE_STYLE_GUIDE,
    '',
    visualContinuityBrief,
    '',
    PROFESSIONAL_ILLUSION_DESIGN_REFINEMENT,
    '',
    MECHANISM_AND_FABRICATION_INTELLIGENCE,
    '',
    buildSeedIdentityBrief(seedIdentity || null),
    '',
    illusionIdentity ? buildIllusionIdentityBrief(illusionIdentity) : '',
    '',
    `Project title: ${plan.project_title}`,
    `Audience effect: ${plan.audience_effect}`,
    `Build concept: ${plan.build_concept}`,
    `Dimensions / footprint: ${plan.dimensions_footprint}`,
    DIMENSIONED_PAIR_LOCK_REQUIREMENTS,
    `Materials direction: ${plan.recommended_construction.materials.join(', ')}`,
    `Mobility / modularity: ${plan.recommended_construction.mobility_modularity}`,
    `Venue / scale: ${venueScale}`,
    `Performer style: ${performerStyle}`,
    `Matched output requirement: This is Concept ${matchedOutput.label}. ${matchedOutput.directive}`,
    'Render-state requirement: show a realistic closed-state or reveal-state stage view that preserves the same apparatus, access placement, visible panels, support members, caster/base logic, performer position, and audience-facing orientation from the paired blueprint.',
    'Interior visibility requirement: if the apparatus is shown open or in reveal state, the visible interior must match the paired blueprint proportions and remain plausible without adding fantasy space, impossible voids, or a redesigned shell.',
    'Seed continuity requirement: this rendered concept must be a staged/photo realization of the same selected source concept, preserving the seed primary props, silhouette, geometry, performer position, staging, materials, atmosphere, and apparatus form. Do not let the builder plan or matched-output variant erase the original seed identity.',
    'Anti-generic substitution: do not replace rope/ring/suspension/open apparatus concepts with sealed cabinets, dollhouses, cottages, house facades, unrelated boxes, standard sawing props, appearance cages, or trunk illusions unless the seed explicitly contains those elements.',
    buildBlueprintToRenderLock({ matchedOutput, visualAnchor }),
    APPARATUS_VALIDATION_REQUIREMENTS,
    `Concept continuity requirement: Produce exactly one realistic staged rendering of Matched Design ${matchedOutput.label} for the same ${visualAnchor}. The concept render must be a photorealistic stage rendition of the exact same apparatus shown in Blueprint ${matchedOutput.label}. Do not redesign the roofline, base, wheels, platform, doors, panels, proportions, decoration, or support structure. This concept image must match Blueprint ${matchedOutput.label} in silhouette, base shape, major panels, footprint, visible structure, finish direction, practical construction cues, audience orientation, proportions, materials, mechanism placement, and theatrical context.`,
    'Pairing requirement: Do not invent a new prop. Do not change the illusion category. Do not replace the blueprint with an unrelated cabinet, platform, trunk, table, scenic unit, food item, consumer product, animal, landscape, or stock-photo object. Do not reinterpret or redesign the apparatus.',
    'Physics requirement: all concept images must look practical, stable, human-scale, safely staged, and commercially buildable. Do not generate fantasy energy effects, impossible geometry, cartoon styling, distorted anatomy, or unrealistic physics.',
    HARD_ANTI_DRIFT_EXCLUSIONS,
    'Language requirement: English only. Any signage, labels, notes, or visible words inside the concept image must be clear English. Prefer no text if clean English text cannot be rendered reliably.',
    `Produce one polished realistic concept image that matches Blueprint ${matchedOutput.label}. The image must contain the illusion apparatus as the central subject; if the prompt could be interpreted as food, product photography, or a generic object, ignore that interpretation and render the practical stage illusion instead.`,
  ].join('\n');
}
