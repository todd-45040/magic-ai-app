export type MagicWireItem = {
  id?: string;
  category?: string;
  type?: string;
  headline?: string;
  title?: string;
  summary?: string;
  body?: string;
  source?: string;
  sourceUrl?: string | null;
  thumbnailUrl?: string | null;
  publishedAt?: string;
  tags?: string[];
};

export type MagicWireSavedPost = {
  id: string;
  title: string;
  summary: string;
  source: string;
  sourceUrl?: string | null;
  thumbnailUrl?: string | null;
  publishedAt?: string;
  category: string;
  type: string;
  tags: string[];
  savedAt: number;
};

const SAVED_STORAGE_KEY = "maw_magic_wire_saved_posts_v1";

function normalizePayload(payload: any): MagicWireItem[] {
  if (Array.isArray(payload)) return payload;
  if (payload?.items && Array.isArray(payload.items)) return payload.items;
  return [];
}

export async function getPosts(opts?: {
  count?: number;
  refresh?: boolean;
}): Promise<MagicWireItem[]> {
  const count = opts?.count ?? 12;
  const refresh = Boolean(opts?.refresh);

  const url = refresh
    ? `/api/magicWire?count=${count}&refresh=1`
    : `/api/magicWire?count=${count}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Magic Wire request failed (${res.status})`);
  }

  const json = await res.json();
  return normalizePayload(json);
}

function loadSavedMap(): Record<string, MagicWireSavedPost> {
  try {
    const raw = localStorage.getItem(SAVED_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveSavedMap(map: Record<string, MagicWireSavedPost>) {
  try {
    localStorage.setItem(SAVED_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore storage failures
  }
}

export function getSavedPosts(): MagicWireSavedPost[] {
  const map = loadSavedMap();
  return Object.values(map).sort((a, b) => b.savedAt - a.savedAt);
}

export function isPostSaved(id: string): boolean {
  if (!id) return false;
  const map = loadSavedMap();
  return Boolean(map[id]);
}

export function savePost(post: Omit<MagicWireSavedPost, "savedAt">): MagicWireSavedPost {
  const map = loadSavedMap();
  const saved: MagicWireSavedPost = {
    ...post,
    savedAt: Date.now(),
  };
  map[post.id] = saved;
  saveSavedMap(map);
  return saved;
}

export function removeSavedPost(id: string): void {
  if (!id) return;
  const map = loadSavedMap();
  delete map[id];
  saveSavedMap(map);
}
