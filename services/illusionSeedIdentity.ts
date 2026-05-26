export type IllusionSeedIdentity = {
  source: 'visual_brainstorm' | 'manual';
  primaryObjects: string[];
  dominantGeometry: string[];
  stageLayout: string[];
  performerPosition: string[];
  apparatusForm: string[];
  materialStyle: string[];
  atmosphere: string[];
  illusionMotion: string[];
  illusionCategory: string;
  negativeDriftGuards: string[];
  rawSeedText: string;
};

const uniq = (items: string[]): string[] => Array.from(new Set(items.map((item) => item.trim()).filter(Boolean))).slice(0, 8);

const has = (text: string, pattern: RegExp): boolean => pattern.test(text);

const addIf = (target: string[], condition: boolean, value: string) => {
  if (condition) target.push(value);
};

export function buildIllusionSeedIdentity(seedText: string, source: IllusionSeedIdentity['source'] = 'manual'): IllusionSeedIdentity | null {
  const raw = String(seedText || '').trim();
  if (!raw) return null;
  const text = raw.toLowerCase();

  const primaryObjects: string[] = [];
  addIf(primaryObjects, has(text, /\brope|cord|line\b/), 'rope or cord');
  addIf(primaryObjects, has(text, /\bring|rings|brass ring|linking ring\b/), 'brass rings');
  addIf(primaryObjects, has(text, /\bchain|chains\b/), 'chain elements');
  addIf(primaryObjects, has(text, /\btrunk|crate|chest\b/), 'trunk or chest');
  addIf(primaryObjects, has(text, /\bcabinet\b/), 'cabinet');
  addIf(primaryObjects, has(text, /\bplatform|base|pedestal\b/), 'platform or base');
  addIf(primaryObjects, has(text, /\bmirror|glass\b/), 'mirror or glass');
  addIf(primaryObjects, has(text, /\bbox|case\b/), 'box or case');

  const dominantGeometry: string[] = [];
  addIf(dominantGeometry, has(text, /\bcircle|circular|ring|loop|brass ring\b/), 'circular ring geometry');
  addIf(dominantGeometry, has(text, /\bvertical|suspend|hanging|overhead|rope\b/), 'vertical suspension lines');
  addIf(dominantGeometry, has(text, /\brectangular|box|cabinet|trunk|case\b/), 'rectangular builder geometry');
  addIf(dominantGeometry, has(text, /\barch|arched\b/), 'arched scenic form');
  addIf(dominantGeometry, has(text, /\bsymmetry|center stage|centered\b/), 'centered symmetrical composition');

  const stageLayout: string[] = [];
  addIf(stageLayout, has(text, /\bstage|theater|theatre|victorian theater|curtain|proscenium\b/), 'theatre stage setting');
  addIf(stageLayout, has(text, /\bcenter stage|centered|solo performer\b/), 'center-stage focus');
  addIf(stageLayout, has(text, /\baudience|front-facing|audience-facing\b/), 'front-facing audience orientation');
  addIf(stageLayout, has(text, /\bfog|smoke|spotlight|dramatic lighting\b/), 'dramatic lighting and atmospheric floor haze');

  const performerPosition: string[] = [];
  addIf(performerPosition, has(text, /\bsolo performer|single performer|magician\b/), 'solo magician visible with apparatus');
  addIf(performerPosition, has(text, /\bassistant\b/), 'assistant staging included');
  addIf(performerPosition, has(text, /\bholding|holds|hand|grip\b/), 'performer physically handling the prop');

  const apparatusForm: string[] = [];
  addIf(apparatusForm, has(text, /\brope|ring|rings|loop\b/), 'open rope-and-ring apparatus rather than a sealed cabinet');
  addIf(apparatusForm, has(text, /\bplatform|base|pedestal\b/), 'visible base/platform support');
  addIf(apparatusForm, has(text, /\bcase|box|trunk|cabinet\b/), 'case or cabinet support element');
  addIf(apparatusForm, has(text, /\bstand|tripod|frame\b/), 'visible stand or frame');

  const materialStyle: string[] = [];
  addIf(materialStyle, has(text, /\bbrass|bronze|gold\b/), 'brass or warm metal accents');
  addIf(materialStyle, has(text, /\bwood|wooden|mahogany|victorian\b/), 'dark theatrical wood finish');
  addIf(materialStyle, has(text, /\bsteampunk|gear|gears|cog\b/), 'steampunk gear-and-brass language');
  addIf(materialStyle, has(text, /\bblack|velvet|curtain\b/), 'black stage fabric and curtain contrast');

  const atmosphere: string[] = [];
  addIf(atmosphere, has(text, /\bmysterious|mystery\b/), 'mysterious theatrical mood');
  addIf(atmosphere, has(text, /\bvictorian\b/), 'Victorian theatre atmosphere');
  addIf(atmosphere, has(text, /\bfog|smoke|haze\b/), 'subtle fog or haze');
  addIf(atmosphere, has(text, /\bdramatic lighting|spotlight\b/), 'dramatic spotlighting');

  const illusionMotion: string[] = [];
  addIf(illusionMotion, has(text, /\blink|linking|unlink|penetration\b/), 'linking or penetration action');
  addIf(illusionMotion, has(text, /\bsuspend|suspension|hanging\b/), 'suspension or hanging action');
  addIf(illusionMotion, has(text, /\bappear|appearance|production\b/), 'appearance or production moment');
  addIf(illusionMotion, has(text, /\bvanish|disappear\b/), 'vanish moment');
  addIf(illusionMotion, has(text, /\btransform|transformation\b/), 'transformation moment');

  let illusionCategory = 'custom stage illusion concept';
  if (has(text, /\brope|ring|rings|linking/)) illusionCategory = 'rope-and-ring stage illusion concept';
  else if (has(text, /\bappear|appearance|production\b/)) illusionCategory = 'appearance stage illusion concept';
  else if (has(text, /\bvanish|disappear\b/)) illusionCategory = 'vanish stage illusion concept';
  else if (has(text, /\blevitat|float|suspend\b/)) illusionCategory = 'levitation or suspension stage illusion concept';
  else if (has(text, /\btrunk|crate|chest\b/)) illusionCategory = 'trunk-based stage illusion concept';

  const negativeDriftGuards = [
    'do not replace the seed concept with a generic cabinet unless the seed explicitly contains a cabinet',
    'do not replace the seed concept with a dollhouse, cottage, house facade, random scenic building, or unrelated box prop',
    'do not substitute a standard sawing, sword-box, appearance-cage, or trunk illusion unless it is already present in the seed',
    'do not remove the seed primary props, dominant silhouette, performer relationship, or stage composition',
  ];

  return {
    source,
    primaryObjects: uniq(primaryObjects),
    dominantGeometry: uniq(dominantGeometry),
    stageLayout: uniq(stageLayout),
    performerPosition: uniq(performerPosition),
    apparatusForm: uniq(apparatusForm),
    materialStyle: uniq(materialStyle),
    atmosphere: uniq(atmosphere),
    illusionMotion: uniq(illusionMotion),
    illusionCategory,
    negativeDriftGuards,
    rawSeedText: raw.slice(0, 900),
  };
}

const listOrFallback = (items: string[], fallback: string): string => (items.length ? items.join(', ') : fallback);

export function buildSeedIdentityBrief(identity: IllusionSeedIdentity | null): string {
  if (!identity) return '';
  return [
    'SEED IMAGE STRUCTURAL IDENTITY LOCK:',
    `Seed source: ${identity.source}`,
    `Primary props: ${listOrFallback(identity.primaryObjects, 'preserve the user selected source props')}`,
    `Dominant geometry: ${listOrFallback(identity.dominantGeometry, 'preserve the selected image silhouette and composition')}`,
    `Stage layout: ${listOrFallback(identity.stageLayout, 'preserve the source stage layout')}`,
    `Performer staging: ${listOrFallback(identity.performerPosition, 'preserve performer-to-prop relationship')}`,
    `Apparatus form: ${listOrFallback(identity.apparatusForm, 'preserve original apparatus form')}`,
    `Material/style language: ${listOrFallback(identity.materialStyle, 'preserve original material and style language')}`,
    `Atmosphere: ${listOrFallback(identity.atmosphere, 'preserve original theatrical mood')}`,
    `Illusion motion: ${listOrFallback(identity.illusionMotion, 'preserve original action idea')}`,
    `Illusion category: ${identity.illusionCategory}`,
    'Continuity weighting hierarchy: 1) seed image identity, 2) structural composition, 3) prop relationships, 4) staging geometry, 5) broad illusion category.',
    'Continuity enforcement: preserve the original visual identity of the selected concept. Do not substitute unrelated illusion apparatus. Maintain core prop relationships, silhouette structure, and theatrical staging from the original concept.',
    'Anti-generic drift rules:',
    ...identity.negativeDriftGuards.map((guard) => `- ${guard}`),
    `Raw selected seed direction: ${identity.rawSeedText}`,
  ].join('\n');
}
