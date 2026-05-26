export interface IllusionIdentityPlanInput {
  project_title: string;
  audience_effect: string;
  build_concept: string;
  recommended_construction: {
    main_structure: string[];
    materials: string[];
    hardware?: string[];
    mobility_modularity: string;
  };
  dimensions_footprint: string;
  mechanism_approach: {
    primary: string;
    alternate?: string;
  };
}

export interface IllusionIdentityContext {
  originalEffect: string;
  venueScale: string;
  performerStyle: string;
  budgetLevel?: string;
  crewSize?: string;
  resetRequirement?: string;
  transportLimitations?: string;
  stageLimitations?: string;
  materialsPreference?: string;
}

export interface IllusionIdentity {
  illusionType: string;
  silhouette: string;
  materials: string[];
  staging: string;
  footprint: string;
  audienceView: string;
  mechanismStyle: string;
  realismConstraints: string[];
}

const cleanIdentityText = (value: string, fallback = ''): string => {
  const cleaned = String(value || '')
    .replace(/\*\*/g, '')
    .replace(/[^a-zA-Z0-9\s,\-/.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return fallback;
  return cleaned.length > 120 ? `${cleaned.slice(0, 117).trim()}...` : cleaned;
};

const firstUseful = (fallback: string, ...values: Array<string | undefined>): string => {
  const match = values.find((value) => typeof value === 'string' && value.trim());
  return cleanIdentityText(match || fallback, fallback);
};

export const deriveIllusionType = (plan: IllusionIdentityPlanInput, originalEffect = ''): string => {
  const combined = [
    originalEffect,
    plan.project_title,
    plan.audience_effect,
    plan.build_concept,
    ...(plan.recommended_construction?.main_structure || []),
    plan.dimensions_footprint,
  ]
    .join(' ')
    .toLowerCase();

  const typePatterns: Array<[RegExp, string]> = [
    [/rope|cord|ring|rings|linking/, 'rope-and-ring stage illusion concept'],
    [/vanish|vanishing|disappear/, 'vanishing platform stage illusion'],
    [/appear|appearance|production/, 'appearance platform stage illusion'],
    [/levitat|float|floating|suspension/, 'assistant levitation stage illusion'],
    [/penetrat|sword|blade|spike/, 'penetration cabinet stage illusion'],
    [/teleport|transport|transposition/, 'modular teleportation trunk stage illusion'],
    [/transform|change|costume|metamorphosis/, 'visual transformation stage illusion'],
    [/escape|restraint|locked|chain/, 'escape cabinet stage illusion'],
    [/trunk|crate|box/, 'trunk-based stage illusion'],
    [/cabinet/, 'illusion cabinet stage prop'],
    [/platform|base|deck/, 'raised platform stage illusion'],
  ];

  const matched = typePatterns.find(([pattern]) => pattern.test(combined));
  if (matched) return matched[1];

  return firstUseful('custom stage illusion', plan.project_title, originalEffect);
};

export const buildIllusionIdentity = (
  plan: IllusionIdentityPlanInput,
  context: IllusionIdentityContext
): IllusionIdentity => {
  const illusionType = deriveIllusionType(plan, context.originalEffect);
  const mainStructure = plan.recommended_construction?.main_structure || [];
  const materials = [
    ...(context.materialsPreference ? [context.materialsPreference] : []),
    ...(plan.recommended_construction?.materials || []),
  ]
    .map((item) => cleanIdentityText(item))
    .filter(Boolean)
    .slice(0, 5);

  return {
    illusionType,
    silhouette: firstUseful(
      'practical stage illusion apparatus with consistent builder-visible geometry',
      mainStructure.join(', '),
      plan.build_concept
    ),
    materials: materials.length ? materials : ['realistic theatrical fabrication materials'],
    staging: cleanIdentityText(`${context.venueScale} setting with ${context.performerStyle} presentation`, 'real stage environment'),
    footprint: firstUseful('stage-ready footprint', plan.dimensions_footprint),
    audienceView: firstUseful(
      'front-facing audience view with controlled side sightlines',
      context.stageLimitations,
      `${context.venueScale} audience sightlines`
    ),
    mechanismStyle: firstUseful('principle-based practical stage mechanism', plan.mechanism_approach?.primary),
    realismConstraints: [
      'same illusion type across builder plan, blueprint drawings, and rendered concept images',
      'same silhouette, base, major panels, staging footprint, material direction, and audience orientation',
      'real-world physics, stable load paths, human-scale proportions, and believable theatrical construction',
      'hard anti-drift rule: no food, furniture, appliances, unrelated products, fantasy weapons, sci-fi machinery, animals, surreal abstract art, product photography, stock objects, landscapes, magical energy, portals, or impossible floating structures',
      'structural continuity rule: preserve any source image props, silhouette, performer relationship, dominant geometry, and stage composition ahead of generic illusion category labels',
      'anti-generic substitution rule: do not collapse unique rope/ring/suspension/open-apparatus source concepts into generic cabinets, dollhouses, cottages, house facades, standard boxes, or unrelated stage furniture',
      'professional fabrication, rehearsal, load testing, and safety review required before real-world construction or performance',
    ],
  };
};

export const buildIllusionIdentityBrief = (identity: IllusionIdentity): string => [
  'SHARED ILLUSION IDENTITY LOCK:',
  `Illusion type: ${identity.illusionType}`,
  `Silhouette / structure: ${identity.silhouette}`,
  `Materials: ${identity.materials.join(', ')}`,
  `Staging: ${identity.staging}`,
  `Footprint: ${identity.footprint}`,
  `Audience view: ${identity.audienceView}`,
  `Mechanism style: ${identity.mechanismStyle}`,
  'Realism constraints:',
  ...identity.realismConstraints.map((constraint) => `- ${constraint}`),
  'This identity is the canonical source of truth. Blueprint images and concept renderings must depict this same apparatus, not a reinterpreted or unrelated idea.',
].join('\n');
