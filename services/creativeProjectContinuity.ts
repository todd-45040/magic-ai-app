import type { SavedIdea } from '../types';

export type CreativeProjectStage = 'concept' | 'development' | 'rehearsal' | 'performance';

export interface CreativeProjectLink {
  projectId: string;
  projectTitle: string;
  projectType?: string;
  projectStage?: CreativeProjectStage;
  originTool: string;
  createdAt: number;
  linkedAssetIds: string[];
}

const PROJECT_TAG_PREFIX = 'project:';

function cleanText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function slugifyProjectTitle(value: string): string {
  const slug = cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'creative-project';
}

export function createCreativeProjectId(projectTitle: string, _seed?: string | number): string {
  // Keep inferred IDs stable by project title so later saves can be grouped
  // without requiring a database migration or a separate projects table.
  return `project-${slugifyProjectTitle(projectTitle)}`;
}

export function inferProjectTitle(input: {
  projectTitle?: string;
  title?: string;
  prompt?: string;
  effect?: string;
  tool?: string;
}): string {
  const explicit = cleanText(input.projectTitle);
  if (explicit) return explicit;

  const title = cleanText(input.title)
    .replace(/^Effect:\s*/i, '')
    .replace(/^Illusion Builder Plan\s*[—-]\s*/i, '')
    .replace(/^Visual Concept\s*[—-]\s*/i, '')
    .replace(/^Effect Engine:\s*/i, '');
  if (title) return title.slice(0, 80);

  const effect = cleanText(input.effect);
  if (effect) return effect.slice(0, 80);

  const prompt = cleanText(input.prompt);
  if (prompt) return prompt.slice(0, 80);

  return `${cleanText(input.tool) || 'Creative'} Project`;
}

export function buildCreativeProjectLink(input: {
  projectId?: string;
  projectTitle?: string;
  title?: string;
  prompt?: string;
  effect?: string;
  projectType?: string;
  projectStage?: CreativeProjectStage;
  originTool: string;
  linkedAssetIds?: string[];
  createdAt?: number;
}): CreativeProjectLink {
  const projectTitle = inferProjectTitle({ ...input, tool: input.originTool });
  const createdAt = Number(input.createdAt || Date.now());
  return {
    projectId: cleanText(input.projectId) || createCreativeProjectId(projectTitle, createdAt),
    projectTitle,
    projectType: cleanText(input.projectType) || undefined,
    projectStage: input.projectStage || 'concept',
    originTool: cleanText(input.originTool) || 'unknown',
    createdAt,
    linkedAssetIds: Array.isArray(input.linkedAssetIds) ? input.linkedAssetIds.filter(Boolean).map(String) : [],
  };
}

export function normalizeCreativeProjectLink(value: unknown, fallback?: Partial<CreativeProjectLink>): CreativeProjectLink | null {
  if (!value || typeof value !== 'object') return fallback?.projectTitle || fallback?.originTool
    ? buildCreativeProjectLink({
        originTool: fallback.originTool || 'unknown',
        projectId: fallback.projectId,
        projectTitle: fallback.projectTitle,
        projectType: fallback.projectType,
        projectStage: fallback.projectStage,
        linkedAssetIds: fallback.linkedAssetIds,
        createdAt: fallback.createdAt,
      })
    : null;

  const raw = value as Partial<CreativeProjectLink> & Record<string, unknown>;
  return buildCreativeProjectLink({
    originTool: cleanText(raw.originTool) || fallback?.originTool || 'unknown',
    projectId: cleanText(raw.projectId) || fallback?.projectId,
    projectTitle: cleanText(raw.projectTitle) || fallback?.projectTitle,
    projectType: cleanText(raw.projectType) || fallback?.projectType,
    projectStage: (raw.projectStage as CreativeProjectStage) || fallback?.projectStage,
    linkedAssetIds: Array.isArray(raw.linkedAssetIds) ? raw.linkedAssetIds.map(String) : fallback?.linkedAssetIds,
    createdAt: Number(raw.createdAt || fallback?.createdAt || Date.now()),
  });
}

export function attachCreativeProjectToPayload<T extends Record<string, any>>(payload: T, project: CreativeProjectLink | null): T {
  if (!project) return payload;
  const next: T = { ...payload };
  next.project = project;
  next.creativeProject = project;
  next.meta = { ...(payload.meta || {}), project };
  next.structured = { ...(payload.structured || {}), project };
  return next;
}

export function getCreativeProjectTag(project: CreativeProjectLink | null | undefined): string | null {
  if (!project?.projectTitle) return null;
  return `${PROJECT_TAG_PREFIX}${slugifyProjectTitle(project.projectTitle)}`;
}

export function mergeProjectTags(tags: string[] | undefined, project: CreativeProjectLink | null | undefined): string[] {
  const merged = new Set<string>(Array.isArray(tags) ? tags.filter(Boolean) : []);
  const tag = getCreativeProjectTag(project);
  if (tag) merged.add(tag);
  if (project?.projectStage) merged.add(`stage:${project.projectStage}`);
  return Array.from(merged).slice(0, 12);
}

export function extractCreativeProjectFromContent(content: string): CreativeProjectLink | null {
  const text = String(content || '').trim();
  if (!text || text[0] !== '{') return null;
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') return null;
    return normalizeCreativeProjectLink(parsed.project || parsed.creativeProject || parsed?.meta?.project || parsed?.structured?.project);
  } catch {
    return null;
  }
}

export function getCreativeProjectFromIdea(idea: Pick<SavedIdea, 'content' | 'tags' | 'title' | 'category'>): CreativeProjectLink | null {
  const embedded = extractCreativeProjectFromContent(idea.content || '');
  if (embedded) return embedded;

  const projectTag = (idea.tags || []).find((tag) => String(tag).toLowerCase().startsWith(PROJECT_TAG_PREFIX));
  if (!projectTag) return null;
  const projectTitle = String(projectTag).slice(PROJECT_TAG_PREFIX.length).replace(/-/g, ' ').trim();
  if (!projectTitle) return null;
  return buildCreativeProjectLink({
    originTool: 'saved_ideas',
    projectTitle,
    projectType: idea.category || undefined,
    projectStage: 'concept',
  });
}

export function getProjectDisplayLabel(project: CreativeProjectLink | null | undefined): string {
  if (!project) return '';
  const stage = project.projectStage ? ` • ${project.projectStage}` : '';
  return `${project.projectTitle}${stage}`;
}
