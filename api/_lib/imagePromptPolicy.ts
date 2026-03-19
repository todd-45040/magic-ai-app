export type ImagePromptMode = 'practical' | 'blueprint' | 'edit';

const PRACTICAL_IMAGE_GUARDRAIL = [
  'Create practical, believable magic-design imagery.',
  'Rules:',
  '- Prioritize real-world staging, real materials, and buildable props.',
  '- Prefer workshop-feasible construction, believable scenic finishes, and touring-friendly scale.',
  '- Avoid dream-like, surreal, cosmic, sci-fi, impossible, floating, or fantasy-engineering visuals unless the user explicitly requests poster-art styling.',
  '- Show designs that could realistically be fabricated for stage, parlor, platform, or trade-show performance.',
  '- Favor clean theatrical realism over abstract art.',
  '- No impossible architecture, impossible physics, or magical energy effects.',
  '- If the prompt is vague, interpret it as practical stage design rather than fantasy illustration.',
].join('\n');

const BLUEPRINT_IMAGE_GUARDRAIL = [
  PRACTICAL_IMAGE_GUARDRAIL,
  '',
  'Blueprint mode:',
  '- Favor fabrication logic, measurable structure, and workshop realism.',
  '- Emphasize practical construction views rather than glamour or poster-art rendering.',
].join('\n');

const EDIT_IMAGE_GUARDRAIL = [
  PRACTICAL_IMAGE_GUARDRAIL,
  '',
  'Edit mode:',
  '- Preserve believable materials, scale, and buildability while applying the requested changes.',
  '- If a requested change implies fantasy physics, restyle it into a practical theatrical version.',
].join('\n');

export function applyImagePromptPolicy(rawPrompt: unknown, mode: ImagePromptMode = 'practical'): string {
  const prompt = typeof rawPrompt === 'string' ? rawPrompt.trim() : '';
  const policy = mode === 'blueprint'
    ? BLUEPRINT_IMAGE_GUARDRAIL
    : mode === 'edit'
      ? EDIT_IMAGE_GUARDRAIL
      : PRACTICAL_IMAGE_GUARDRAIL;

  return prompt ? `${policy}\n\nUSER PROMPT:\n${prompt}` : policy;
}
