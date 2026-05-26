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
  operationalState: 'empty-display' | 'production-reveal';
  stateDescription: string;
};

export type IllusionBlueprintDesignSpec = {
  label: 'A' | 'B';
  designName: string;
  apparatusFamily: string;
  fixedSilhouette: string;
  roofOrTopline: string;
  frontOpening: string;
  doorPanelLayout: string;
  basePlatform: string;
  supportAndCasters: string;
  facadeTrim: string;
  visibleHardware: string;
  proportions: string;
  performerBlocking: string;
  operationalState: string;
  geometryProfile: string;
  silhouetteLock: string;
  proportionLock: string;
  componentInheritance: string;
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
  designSpec?: IllusionBlueprintDesignSpec;
};

export const ILLUSION_BLUEPRINT_MATCHED_OUTPUTS: IllusionBlueprintMatchedOutput[] = [
  {
    index: 0,
    label: 'A',
    directive: 'MATCHED DESIGN A: compact touring version that preserves the seed silhouette and primary props, uses practical support/base logic only where needed, includes builder-visible access or rigging cues, modest scenic trim, and a restrained premium stage finish.',
    operationalState: 'empty-display',
    stateDescription: 'EMPTY-DISPLAY STATE: the apparatus is opened or presented to show a clean, apparently empty interior. No production moment is shown. No dog, assistant, object, or final reveal appears in this state unless the selected seed already explicitly shows it.',
  },
  {
    index: 1,
    label: 'B',
    directive: 'MATCHED DESIGN B: slightly more theatrical version that preserves the same seed silhouette, prop relationships, footprint, and mechanism direction while adding polished theatre finish, stronger scenic framing, and practical transport/support details.',
    operationalState: 'production-reveal',
    stateDescription: 'PRODUCTION / REVEAL STATE: the apparatus is in the later reveal moment, with the produced object, assistant, or theatrical result visible only if the requested effect calls for it. Do not also show the empty-display proof in the same image.',
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


const GEOMETRIC_IDENTITY_LOCK_REQUIREMENTS = `Geometric identity lock requirements:
- Geometry is the controlling artifact. Theme, mood, operational state, and theatrical styling are secondary.
- Before drawing or rendering, inherit the fixed geometry profile, silhouette lock, component inheritance, and proportion lock from the matched design spec.
- Lock the same roofline/topline, main body outline, front opening location, door/panel count, side-wall arrangement, base/platform footprint, support/caster layout, facade trim locations, and performer-to-prop scale.
- Variant A and Variant B may differ in finish, state, and mechanism presentation, but each matched blueprint/render pair must preserve its own exact geometry.
- Do not reinterpret dimensions, simplify the profile into a generic box, add a different roof, move the opening, change the support platform, invent a new base, or redesign the visible facade.
- The apparatus should be recognizable as the same object in blueprint and render even if all text and labels are removed.`;



const OPERATIONAL_STATE_INTELLIGENCE = `Operational state intelligence:
- Treat the illusion as a sequence of distinct operating states: closed-ready, display-empty, production/reveal, and reset/service.
- Do not merge multiple moments of the illusion into one render or one blueprint view unless a blueprint explicitly labels separate state diagrams.
- Display-empty state means the performer is demonstrating the apparatus apparently empty; the produced item or final reveal must not be visible in that same render.
- Production/reveal state means the later effect moment is shown; do not also show the full empty-display proof at the same time.
- Closed-ready state means the apparatus is closed, staged, stable, and ready for operation; no reveal is visible.
- Reset/service state is for builder planning only and should be described as non-exposure crew access, panel service, or transport reset cues.
- Blueprint sheets may define transition arrows, operator positions, concealment flow zones, and state labels at a high level.
- Concept renders must show exactly ONE operational state per image. No split-screen, no before/after collage, no simultaneous empty-and-reveal contradiction.`;

const getOperationalStateBrief = (matchedOutput: IllusionBlueprintMatchedOutput): string => [
  `OPERATIONAL STATE FOR MATCHED DESIGN ${matchedOutput.label}: ${matchedOutput.operationalState.toUpperCase()}.`,
  matchedOutput.stateDescription,
  matchedOutput.operationalState === 'empty-display'
    ? 'Render instruction: show the apparatus in empty-display mode only. Doors/panels may be open to suggest the interior is being shown cleanly, but do not show the produced object, final reveal, or a second later moment.'
    : 'Render instruction: show the apparatus in production/reveal mode only. The reveal may be visible if it belongs to the requested effect, but do not include a separate empty-proof display, before/after split, or duplicate operational moment.',
].join('\n');

const BLUEPRINT_RENDER_SEPARATION_REQUIREMENTS = `Blueprint / render separation requirements:
- Blueprint generation and concept render generation have separate roles.
- Blueprint prompts may include dimensions, cutaways, mechanisms, section views, hidden paths, annotations, fabrication notes, exploded views, and measurement callouts.
- Concept render prompts must NOT include blueprint labels, measurement text, annotation language, arrows, note callouts, cutaway instructions, exploded-view instructions, section-view instructions, or technical drawing paragraphs.
- Concept renders should receive only visual structure anchors: geometry, silhouette, proportions, visible facade details, platform/base details, stage appearance, lighting, reveal state, and performer blocking.
- Never render blueprint pages, technical diagrams, text blocks, note sheets, measurement overlays, instruction panels, or split-screen plan artifacts inside concept render images.`;

const RENDER_SANITIZATION_REQUIREMENTS = `Render sanitization layer:
- Strip all blueprint-only information before concept rendering: measurement text, labels, annotations, arrows, note callouts, cutaway references, exploded-view references, section-view references, construction instructions, mechanism notes, and fabrication paragraphs.
- Preserve only the visible apparatus form: overall silhouette, roofline/topline, major door/panel placement, base/platform shape, visible supports, wheel/caster placement, facade materials, trim style, and practical stage scale.
- The rendered image must be a clean photorealistic stage view, not a document, not a diagram, not a blueprint, not a poster, and not an instructional sheet.
- Do not show white margins, printed-page backgrounds, text columns, dimension lines, arrows, technical labels, or embedded blueprint graphics in the render.`;

const RENDER_ONLY_MECHANISM_VISUALS = `Render-only mechanism interpretation:
- Show mechanism and fabrication intelligence only through believable visible design cues: stable base, logical hinges, access seams, handles, casters, bracing, balanced proportions, and practical performer reach.
- Do not visualize secret method details, hidden load paths, load chambers, cutaways, internal construction diagrams, mechanism labels, or service notes in the photorealistic render.
- If the apparatus is open or in reveal state, show only a plausible visible interior and consistent doors/panels; do not show explanatory labels or exposed secret workings.`;

const buildRenderStructureAnchors = ({ plan, visualAnchor, venueScale, performerStyle, matchedOutput, seedIdentity, illusionIdentity, designSpec }: IllusionBlueprintImagePromptParams): string => {
  const seedBrief = buildSeedIdentityBrief(seedIdentity || null);
  const identityBrief = illusionIdentity ? buildIllusionIdentityBrief(illusionIdentity) : '';
  return [
    `SANITIZED RENDER STRUCTURE ANCHORS FOR CONCEPT ${matchedOutput.label}:`,
    `Subject: ${visualAnchor}.`,
    `Project title: ${plan.project_title}.`,
    `Audience effect: ${plan.audience_effect}.`,
    `Visible build concept: ${plan.build_concept}.`,
    `Visible structure: ${plan.recommended_construction.main_structure.join(', ')}.`,
    `Visible materials and finish: ${plan.recommended_construction.materials.join(', ')}.`,
    `Visible hardware cues only: ${plan.recommended_construction.hardware.join(', ')}.`,
    `Footprint/proportion cue: ${plan.dimensions_footprint}.`,
    `Mobility/base cue: ${plan.recommended_construction.mobility_modularity}.`,
    `Venue / scale: ${venueScale}.`,
    `Performer style: ${performerStyle}.`,
    `Matched design direction: ${matchedOutput.directive}.`,
    buildRenderDesignSpecBrief(designSpec),
    getOperationalStateBrief(matchedOutput),
    seedBrief,
    identityBrief,
  ].filter(Boolean).join('\n');
};



const compactList = (items: string[] | undefined, fallback: string, limit = 4): string => {
  const clean = (items || []).map((item) => String(item || '').trim()).filter(Boolean);
  return clean.length ? clean.slice(0, limit).join(', ') : fallback;
};

const inferTopline = (seedIdentity?: IllusionSeedIdentity | null): string => {
  const raw = `${seedIdentity?.rawSeedText || ''} ${seedIdentity?.apparatusForm?.join(' ') || ''}`.toLowerCase();
  if (/dog\s*house|hound\s*house|haunted\s*house|house/.test(raw)) return 'pitched dog-house roofline with one front gable, visible roof thickness, and no alternate roof redesign';
  if (/ring|rope|suspend|hanging/.test(raw)) return 'open vertical rope/ring topline with visible suspension geometry and no sealed-box substitution';
  if (/trunk|chest|crate/.test(raw)) return 'rectangular trunk top with consistent lid line and hinge-side orientation';
  return 'same topline/roofline implied by the seed and builder plan';
};

const inferOpening = (seedIdentity?: IllusionSeedIdentity | null): string => {
  const raw = `${seedIdentity?.rawSeedText || ''} ${seedIdentity?.primaryObjects?.join(' ') || ''}`.toLowerCase();
  if (/dog\s*house|hound\s*house|house/.test(raw)) return 'single front dog-house opening with arched or rectangular doorway preserved in every paired output';
  if (/box|cabinet|case/.test(raw)) return 'single audience-facing opening or door location preserved exactly between blueprint and render';
  return 'primary audience-facing opening or interaction zone preserved exactly between blueprint and render';
};


const inferGeometryProfile = (seedIdentity?: IllusionSeedIdentity | null): string => {
  const raw = `${seedIdentity?.rawSeedText || ''} ${seedIdentity?.apparatusForm?.join(' ') || ''} ${seedIdentity?.dominantGeometry?.join(' ') || ''}`.toLowerCase();
  if (/dog\s*house|hound\s*house|house/.test(raw)) {
    return [
      'GEOMETRIC PROFILE: one compact dog-house scenic shell only',
      'single steep gable roof over a rectangular body',
      'front wall contains the primary opening',
      'side walls remain vertical plank panels',
      'roof overhang and body footprint stay consistent',
      'base is a rectangular wheeled stage platform/pedestal directly under the house body',
    ].join('; ');
  }
  if (/box|cabinet|case/.test(raw)) {
    return [
      'GEOMETRIC PROFILE: one rectangular audience-facing cabinet/box only',
      'flat top or simple hinged lid as implied by seed',
      'single dominant front face',
      'base/pedestal directly under the cabinet footprint',
      'no alternate scenic shell or different cabinet family',
    ].join('; ');
  }
  if (/ring|rope|suspend|hanging/.test(raw)) {
    return [
      'GEOMETRIC PROFILE: open rope/ring apparatus only',
      'visible vertical suspension lines and circular brass/ring forms',
      'no sealed box, cottage, trunk, or unrelated platform substitution',
    ].join('; ');
  }
  return 'GEOMETRIC PROFILE: preserve the exact primary geometric profile implied by the selected seed image; do not invent a new apparatus outline.';
};

const inferSilhouetteLock = (seedIdentity?: IllusionSeedIdentity | null): string => {
  const raw = `${seedIdentity?.rawSeedText || ''} ${seedIdentity?.apparatusForm?.join(' ') || ''}`.toLowerCase();
  if (/dog\s*house|hound\s*house|house/.test(raw)) {
    return 'SILHOUETTE LOCK: tall narrow dog-house silhouette, triangular gable roof, centered front opening, simple rectangular side mass, platform below; Blueprint and Render must be recognizable as the same outline at thumbnail size.';
  }
  if (/box|cabinet|case/.test(raw)) {
    return 'SILHOUETTE LOCK: rectangular cabinet silhouette with the same front face, lid/topline, side depth, and base footprint in both blueprint and render.';
  }
  return 'SILHOUETTE LOCK: preserve the seed silhouette exactly enough that the blueprint and render read as the same apparatus at a glance.';
};

const inferComponentInheritance = (seedIdentity?: IllusionSeedIdentity | null): string => {
  const raw = `${seedIdentity?.rawSeedText || ''} ${seedIdentity?.apparatusForm?.join(' ')} ${seedIdentity?.primaryObjects?.join(' ')}`.toLowerCase();
  if (/dog\s*house|hound\s*house|house/.test(raw)) {
    return [
      'COMPONENT INHERITANCE: every paired output must retain the same dog-house body, roof, front opening, side plank wall, hinged/display door, rectangular base/pedestal, floor-contact supports, and caster/wheel strategy',
      'operational state may open/close panels or reveal/empty the interior, but may not move the opening to a new wall, change the roof family, replace the base, or convert the unit into a different cabinet style',
    ].join('; ');
  }
  return 'COMPONENT INHERITANCE: every paired output inherits the same primary apparatus components from the seed/spec before applying state or style changes.';
};

export function buildIllusionDesignSpec({
  plan,
  matchedOutput,
  seedIdentity,
  venueScale,
  performerStyle,
}: Pick<IllusionBlueprintImagePromptParams, 'plan' | 'matchedOutput' | 'seedIdentity' | 'venueScale' | 'performerStyle'>): IllusionBlueprintDesignSpec {
  const seedApparatus = compactList(seedIdentity?.apparatusForm, 'apparatus form from the selected seed image', 3);
  const seedGeometry = compactList(seedIdentity?.dominantGeometry, 'dominant silhouette from the selected seed image', 3);
  const seedMaterials = compactList(seedIdentity?.materialStyle, compactList(plan.recommended_construction.materials, 'theatrical wood/metal scenic finish', 3), 3);
  const baseCue = plan.recommended_construction.mobility_modularity || 'visible stage base/platform with caster-ready support';
  const proportionCue = plan.dimensions_footprint || 'human-scale stage prop proportions';
  const variantCue = matchedOutput.label === 'A'
    ? 'compact practical touring version; restrained trim; clear empty-display access orientation'
    : 'more theatrical premium version; same family and footprint; reveal-state presentation details only';

  return {
    label: matchedOutput.label,
    designName: `Matched Design ${matchedOutput.label}`,
    apparatusFamily: `${seedIdentity?.illusionCategory || plan.project_title}; ${seedApparatus}`,
    fixedSilhouette: `${seedGeometry}; same outer profile in Blueprint ${matchedOutput.label} and Concept ${matchedOutput.label}`,
    roofOrTopline: inferTopline(seedIdentity),
    frontOpening: inferOpening(seedIdentity),
    doorPanelLayout: matchedOutput.label === 'A'
      ? 'front door/panel system shown in empty-display orientation; same hinge side, opening size, and panel count in both paired outputs'
      : 'front door/panel system shown in production/reveal orientation; same hinge side, opening size, and panel count in both paired outputs',
    basePlatform: `same ${baseCue}; do not change base footprint between blueprint and render`,
    supportAndCasters: 'same visible support structure, bracing language, caster/wheel count, and floor-contact points in both paired outputs',
    facadeTrim: `${seedMaterials}; same facade trim, decorative motif, window/vent placement, and scenic finish in both paired outputs`,
    visibleHardware: compactList(plan.recommended_construction.hardware, 'hinges, latches, handles, casters, brackets, seams', 5),
    proportions: `${proportionCue}; preserve width/depth/height ratio, base height, opening scale, and performer-to-prop scale`,
    performerBlocking: `${venueScale} staging with ${performerStyle} performer style; performer stands beside the apparatus without hiding the fixed silhouette`,
    operationalState: `${matchedOutput.operationalState}: ${matchedOutput.stateDescription} ${variantCue}`,
    geometryProfile: inferGeometryProfile(seedIdentity),
    silhouetteLock: inferSilhouetteLock(seedIdentity),
    proportionLock: `PROPORTION LOCK: ${proportionCue}; keep the same width-to-height ratio, roof-to-body ratio, opening-to-body ratio, base-to-body ratio, platform footprint, caster scale, and performer-to-prop scale in Blueprint ${matchedOutput.label} and Concept ${matchedOutput.label}.`,
    componentInheritance: inferComponentInheritance(seedIdentity),
  };
}

const buildDesignSpecBrief = (designSpec?: IllusionBlueprintDesignSpec): string => {
  if (!designSpec) return '';
  return [
    `DESIGN SPEC LOCK — ${designSpec.designName}:`,
    `Apparatus family: ${designSpec.apparatusFamily}`,
    `Fixed silhouette: ${designSpec.fixedSilhouette}`,
    `Roof/topline: ${designSpec.roofOrTopline}`,
    `Front opening: ${designSpec.frontOpening}`,
    `Door/panel layout: ${designSpec.doorPanelLayout}`,
    `Base/platform: ${designSpec.basePlatform}`,
    `Support/casters: ${designSpec.supportAndCasters}`,
    `Facade/trim/materials: ${designSpec.facadeTrim}`,
    `Visible hardware: ${designSpec.visibleHardware}`,
    `Proportions: ${designSpec.proportions}`,
    `Performer blocking: ${designSpec.performerBlocking}`,
    `Operational state: ${designSpec.operationalState}`,
    designSpec.geometryProfile,
    designSpec.silhouetteLock,
    designSpec.proportionLock,
    designSpec.componentInheritance,
    `Pair rule: Blueprint ${designSpec.label} and Concept ${designSpec.label} must be generated from this exact same design spec. Do not independently reinterpret, simplify, replace, or redesign the apparatus.`
  ].join('\n');
};

const buildRenderDesignSpecBrief = (designSpec?: IllusionBlueprintDesignSpec): string => {
  if (!designSpec) return '';
  return [
    `RENDER DESIGN SPEC LOCK — CONCEPT ${designSpec.label}:`,
    `Render the exact staged/photo version of this fixed apparatus family: ${designSpec.apparatusFamily}.`,
    `Preserve silhouette: ${designSpec.fixedSilhouette}.`,
    `Preserve roof/topline: ${designSpec.roofOrTopline}.`,
    `Preserve front opening and panels: ${designSpec.frontOpening}; ${designSpec.doorPanelLayout}.`,
    `Preserve base/support/casters: ${designSpec.basePlatform}; ${designSpec.supportAndCasters}.`,
    `Preserve materials/trim/hardware: ${designSpec.facadeTrim}; ${designSpec.visibleHardware}.`,
    `Preserve proportions and blocking: ${designSpec.proportions}; ${designSpec.performerBlocking}.`,
    `Render only this state: ${designSpec.operationalState}.`,
    designSpec.geometryProfile,
    designSpec.silhouetteLock,
    designSpec.proportionLock,
    designSpec.componentInheritance,
    'Do not introduce a new apparatus family, new roofline, new platform type, different door layout, different support frame, different opening location, or different scenic shell.'
  ].join('\n');
};

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

${OPERATIONAL_STATE_INTELLIGENCE}

${DIMENSIONED_BLUEPRINT_REQUIREMENTS}

${DIMENSIONED_PAIR_LOCK_REQUIREMENTS}

${GEOMETRIC_IDENTITY_LOCK_REQUIREMENTS}

${BLUEPRINT_RENDER_SEPARATION_REQUIREMENTS}

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

${OPERATIONAL_STATE_INTELLIGENCE}

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
  `SANITIZED BLUEPRINT-TO-RENDER LOCK FOR MATCHED DESIGN ${matchedOutput.label}:`,
  `Render a clean photorealistic stage version of the same visible apparatus form intended by Blueprint ${matchedOutput.label} for the same ${visualAnchor}.`,
  `Blueprint ${matchedOutput.label} controls Concept ${matchedOutput.label} ONLY at the level of visible geometry, silhouette, proportions, roofline/topline, major doors/panels, base/platform, supports, casters, visible hardware, trim, and audience-facing orientation.`,
  'Do not redesign the apparatus, but also do not render the blueprint sheet itself.',
  'Do not render measurement labels, text notes, dimension arrows, cutaway diagrams, exploded-view panels, annotation blocks, or white technical-document fragments.',
  'Translate the blueprint design into a realistic staged apparatus: theatrical lighting, practical fog, performer stance, curtains or performance floor, believable shadows, and real material textures are allowed.',
  'Keep mechanism intelligence invisible or expressed only as normal visible construction cues such as seams, hinges, handles, stable base spread, bracing, casters, and service-friendly panel placement.',
  'Do not reinterpret the apparatus. Do not redesign the illusion. Do not substitute a different prop, cabinet, platform, trunk, table, product, food item, animal, landscape, or unrelated object.',
  HARD_ANTI_DRIFT_EXCLUSIONS,
  'The rendered concept image should look like a professional staged/photo version of the matching apparatus, not a new visual idea and not a technical drawing.',
].join('\n');


export function buildIllusionConceptRenderRecoveryPrompt({
  plan,
  visualAnchor,
  venueScale,
  performerStyle,
  matchedOutput,
  seedIdentity,
  designSpec,
}: IllusionBlueprintImagePromptParams): string {
  const seedBrief = buildSeedIdentityBrief(seedIdentity || null);
  const renderDesignSpecBrief = buildRenderDesignSpecBrief(designSpec);
  return [
    'RECOVERY MODE: Create a clean photorealistic stage render only.',
    `Render Matched Concept ${matchedOutput.label}: ${visualAnchor}.`,
    `Subject: ${plan.project_title}.`,
    `Visible apparatus: ${plan.recommended_construction.main_structure.slice(0, 3).join(', ')}.`,
    `Visible materials: ${plan.recommended_construction.materials.slice(0, 4).join(', ')}.`,
    `Base/platform cue: ${plan.recommended_construction.mobility_modularity}.`,
    `Stage scale: ${venueScale}. Performer style: ${performerStyle}.`,
    `Design direction: ${matchedOutput.directive}.`,
    renderDesignSpecBrief,
    getOperationalStateBrief(matchedOutput),
    seedBrief,
    '',
    'Show one real stage apparatus centered on a theatre floor with practical lighting, believable shadows, and one complete magician or assistant positioned naturally beside it.',
    'Show only the assigned operational state. Do not create a before/after layout, split-screen sequence, or contradictory empty-and-reveal composition.',
    'The image must look like commercial illusion catalog photography or a staged promotional render.',
    'Do not show any paper, blueprint, technical drawing, text block, measurement line, annotation, diagram, white page, split screen, document margin, instruction sheet, arrow, callout, or overlay.',
    'Do not include extra arms, floating hands, cropped assistants, distorted anatomy, fantasy portals, unrelated objects, food, furniture, or stock photography.',
    GEOMETRIC_IDENTITY_LOCK_REQUIREMENTS,
    'Keep the same visible silhouette, roofline/topline, base/platform, major door/panel placement, supports, wheels/casters, trim, and façade style implied by the matched design.',
  ].filter(Boolean).join('\n');
}

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
    OPERATIONAL_STATE_INTELLIGENCE,
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
  designSpec,
}: IllusionBlueprintImagePromptParams): string {
  const designSpecBrief = buildDesignSpecBrief(designSpec);
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
    designSpecBrief,
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
    GEOMETRIC_IDENTITY_LOCK_REQUIREMENTS,
    `Primary mechanism direction: ${plan.mechanism_approach.primary}`,
    `Mobility / modularity: ${plan.recommended_construction.mobility_modularity}`,
    'Mechanism/fabrication requirement: include non-exposure labels for concealment volume, service access path, load chamber zone, hinge/panel operation, caster/load support, performer position, and audience sightline direction where they make sense for this apparatus.',
    'Blueprint view requirement: include at least one cutaway or exploded-view style area that clarifies structure, support, access, and operation-state relationships without exposing a secret method.',
    getOperationalStateBrief(matchedOutput),
    'Blueprint operational-state requirement: define closed-ready, display-empty, production/reveal, and reset/service as separate labeled state notes or small state diagrams where helpful. Keep transition logic high-level and non-exposure. Show operator/performer position overlays and audience sightline direction without revealing secret method steps.',
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
  designSpec,
}: IllusionBlueprintImagePromptParams): string {
  const sanitizedStructureAnchors = buildRenderStructureAnchors({
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

  return [
    'Create a clean photorealistic theatrical stage concept render, not a technical drawing.',
    '',
    PHYSICS_AND_BUILDABILITY_GUIDANCE,
    '',
    HARD_ANTI_DRIFT_EXCLUSIONS,
    '',
    sanitizedStructureAnchors,
    '',
    'RENDER ROLE: Create ONLY a polished stage photograph / promotional render of the apparatus. Do not create any document, page, sheet, diagram, technical drawing, construction document, annotated cutaway, exploded view, instruction page, or text-heavy image.',
    GEOMETRIC_IDENTITY_LOCK_REQUIREMENTS,
    'VISUAL CONTINUITY ROLE: Preserve the visible apparatus form from the paired design: silhouette, roofline/topline, base/platform, support structure, door/panel placement, visible hardware, trim, caster/wheel placement, material finish, performer blocking, stage orientation, and approximate proportions.',
    getOperationalStateBrief(matchedOutput),
    `Concept ${matchedOutput.label} requirement: Produce exactly one clean, polished, photorealistic stage rendering of Matched Design ${matchedOutput.label} for the same ${visualAnchor}.`,
    `Pair lock: Concept ${matchedOutput.label} must look like a staged photo of the apparatus represented by Blueprint ${matchedOutput.label}, but it must NOT include Blueprint ${matchedOutput.label} as a visible page, overlay, sheet, drawing, diagram, margin, note, label, dimension line, or text block.`,
    'Forbidden in the render: printed paper, blueprint sheets, white document panels, measurement labels, arrows, callout lines, text columns, construction notes, cutaway labels, exploded-view graphics, diagram overlays, and technical-document artifacts.',
    'Render-state requirement: show exactly the assigned operational state for this matched concept. Preserve the same visible apparatus, access placement cues, doors/panels, support members, caster/base logic, performer position, and audience-facing orientation from the paired design.',
    'Anti-state-blending rule: do not show the apparatus both empty and producing at once; do not show before/after split screens; do not combine closed-ready, display-empty, reveal, and reset into a single photorealistic render.',
    'Interior visibility requirement: if the apparatus is shown open or in reveal state, the visible interior must remain plausible and match the exterior proportions without adding fantasy space, impossible voids, labels, or exposed secret workings.',
    'Seed continuity requirement: this rendered concept must be a staged/photo realization of the same selected source concept, preserving the seed primary props, silhouette, geometry, performer position, staging, materials, atmosphere, and apparatus form. Do not let the builder plan or matched-output variant erase the original seed identity.',
    'Anti-generic substitution: do not replace rope/ring/suspension/open apparatus concepts with sealed cabinets, dollhouses, cottages, house facades, unrelated boxes, standard sawing props, appearance cages, or trunk illusions unless the seed explicitly contains those elements.',
    buildBlueprintToRenderLock({ matchedOutput, visualAnchor }),
    APPARATUS_VALIDATION_REQUIREMENTS,
    'Physics requirement: all concept images must look practical, stable, human-scale, safely staged, and commercially buildable. Do not generate fantasy energy effects, impossible geometry, cartoon styling, distorted anatomy, or unrealistic physics.',
    HARD_ANTI_DRIFT_EXCLUSIONS,
    'Language requirement: Prefer no visible text in concept renders. If unavoidable signage appears, it must be simple English only. Never render technical-note text, measurement text, or blueprint labels in the concept render.',
    `Produce one polished realistic concept image that matches the visible apparatus form for Matched Design ${matchedOutput.label}. The image must contain the illusion apparatus as the central subject in a stage environment and must not look like a document or diagram.`,
  ].join('\n');

}
