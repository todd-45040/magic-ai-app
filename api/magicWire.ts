type WireItem = {
  category: string;
  headline: string;
  summary: string;
  body: string;
  source: string;
  sourceUrl: string | null;
  publishedAt?: string;
  thumbnailUrl?: string | null;
};

function sendJson(res: any, status: number, body: any) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function decodeHtml(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripTags(s: string) {
  return s.replace(/<[^>]*>/g, "").trim();
}

function extractTag(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = re.exec(block);
  return m ? m[1].trim() : null;
}

function firstMatch(block: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = re.exec(block);
    if (m?.[1]) return decodeHtml(m[1].trim());
  }
  return null;
}

function isUsableImageUrl(value?: string | null): value is string {
  if (!value) return false;
  const url = value.trim();
  if (!/^https?:\/\//i.test(url)) return false;
  if (/\.(svg)(\?|#|$)/i.test(url)) return false;
  if (/spacer|pixel|tracking|blank|transparent|avatar|logo-?small/i.test(url)) return false;
  return true;
}

function extractThumbnailFromBlock(block: string): string | null {
  const direct = firstMatch(block, [
    /<media:thumbnail[^>]*url=["']([^"']+)["'][^>]*>/i,
    /<media:content[^>]*url=["']([^"']+)["'][^>]*>/i,
    /<enclosure[^>]*url=["']([^"']+)["'][^>]*type=["']image\/[^"']+["'][^>]*>/i,
    /<itunes:image[^>]*href=["']([^"']+)["'][^>]*>/i,
    /<image[^>]*url=["']([^"']+)["'][^>]*>/i,
  ]);
  if (isUsableImageUrl(direct)) return direct;

  const encodedContent =
    extractTag(block, "description") ||
    extractTag(block, "summary") ||
    extractTag(block, "content") ||
    extractTag(block, "content:encoded") ||
    "";

  const decoded = decodeHtml(encodedContent);
  const img = firstMatch(decoded, [
    /<img[^>]*src=["']([^"']+)["'][^>]*>/i,
    /src=["']([^"']+\.(?:jpg|jpeg|png|webp)(?:\?[^"']*)?)["']/i,
  ]);

  return isUsableImageUrl(img) ? img : null;
}

async function fetchOgImage(url: string | null): Promise<string | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  if (/news\.google\.com/i.test(url)) return null;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 3500);

  try {
    const r = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "MagicAIWizard/1.0 (+https://www.magicaiwizard.com)",
        Accept: "text/html,application/xhtml+xml",
      },
    } as any);

    if (!r.ok) return null;
    const html = (await r.text()).slice(0, 90000);
    const og = firstMatch(html, [
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["'][^>]*>/i,
      /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["'][^>]*>/i,
    ]);

    if (!og) return null;
    const absolute = og.startsWith("//")
      ? `https:${og}`
      : og.startsWith("/")
        ? new URL(og, url).toString()
        : og;

    return isUsableImageUrl(absolute) ? absolute : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function extractAtomLink(block: string): string | null {
  const m = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  return m ? m[1] : null;
}

function pickBlocks(xml: string): { blocks: string[]; kind: "rss" | "atom" | "none" } {
  const items = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  if (items.length) return { blocks: items, kind: "rss" };
  const entries = xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];
  if (entries.length) return { blocks: entries, kind: "atom" };
  return { blocks: [], kind: "none" };
}

async function fetchXml(url: string): Promise<string | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 7500);

  try {
    const r = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "MagicAIWizard/1.0 (+https://www.magicaiwizard.com)",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
    } as any);

    if (!r.ok) return null;
    const text = await r.text();
    const head = text.slice(0, 2000).toLowerCase();
    if (head.includes("<html") || head.includes("<!doctype html")) return null;
    return text;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function cleanTextFromRss(raw: string): string {
  if (!raw) return "";
  const decodedOnce = decodeHtml(raw);
  const stripped = stripTags(decodedOnce);
  const decodedTwice = decodeHtml(stripped);
  return decodedTwice.trim();
}

function parseFeed(xml: string, source: string, category: string): WireItem[] {
  const { blocks } = pickBlocks(xml);
  if (!blocks.length) return [];

  return blocks.slice(0, 25).map((b) => {
    const titleRaw = extractTag(b, "title") || "";
    const headline = cleanTextFromRss(titleRaw) || "Magic News";

    let link = extractTag(b, "link");
    if (link) link = stripTags(link);
    if (!link) {
      const atomLink = extractAtomLink(b);
      link = atomLink ? atomLink : null;
    }

    const sourceUrl = link && link.length ? link : null;

    const descRaw =
      extractTag(b, "description") ||
      extractTag(b, "summary") ||
      extractTag(b, "content") ||
      extractTag(b, "content:encoded") ||
      "";

    const desc = cleanTextFromRss(descRaw);
    const maxLen = 190;
    const summary = desc
      ? desc.length > maxLen
        ? desc.slice(0, maxLen - 1) + "…"
        : desc
      : "Read more…";

    const publishedAt =
      extractTag(b, "pubDate") ||
      extractTag(b, "updated") ||
      extractTag(b, "published") ||
      undefined;

    const thumbnailUrl = extractThumbnailFromBlock(b);

    return {
      category,
      headline,
      summary,
      body: desc || summary,
      source,
      sourceUrl,
      publishedAt: publishedAt || undefined,
      thumbnailUrl,
    };
  });
}

declare global {
  // eslint-disable-next-line no-var
  var __mw_cache: { ts: number; items: WireItem[] } | undefined;
}

function getCached(maxAgeMs: number): WireItem[] | null {
  const c = globalThis.__mw_cache;
  if (!c) return null;
  if (Date.now() - c.ts > maxAgeMs) return null;
  return c.items;
}

function setCached(items: WireItem[]) {
  globalThis.__mw_cache = { ts: Date.now(), items };
}

export default async function handler(req: any, res: any) {
  try {
    if (req?.method && req.method !== "GET") {
      return sendJson(res, 405, { error: "Method not allowed" });
    }

    const countRaw = String(req?.query?.count ?? "18");
    const count = Math.max(1, Math.min(24, parseInt(countRaw, 10) || 18));
    const forceRefresh = String(req?.query?.refresh ?? "") === "1";

    const cached = forceRefresh ? null : getCached(10 * 60 * 1000);
    if (cached) return sendJson(res, 200, cached.slice(0, count));

    const feeds: { url: string; source: string; category: string }[] = [
      {
        url: "https://news.google.com/rss/search?q=magic+trick+magician&hl=en-US&gl=US&ceid=US:en",
        source: "Google News",
        category: "Magic News",
      },
      {
        url: "https://news.google.com/rss/search?q=illusionist+show&hl=en-US&gl=US&ceid=US:en",
        source: "Google News",
        category: "Shows & Events",
      },
      {
        url: "https://news.google.com/rss/search?q=card+magic+new+trick&hl=en-US&gl=US&ceid=US:en",
        source: "Google News",
        category: "New Tricks",
      },
      {
        url: "https://www.reddit.com/r/MagicTricks/.rss",
        source: "Reddit r/MagicTricks",
        category: "Community",
      },
    ];

    const settled = await Promise.allSettled(
      feeds.map(async (f) => {
        const xml = await fetchXml(f.url);
        if (!xml) return [] as WireItem[];
        return parseFeed(xml, f.source, f.category);
      })
    );

    const merged: WireItem[] = [];
    for (const s of settled) {
      if (s.status === "fulfilled") merged.push(...s.value);
    }

    const seen = new Set<string>();
    const deduped = merged.filter((a) => {
      const k = (a.headline || "").toLowerCase().trim();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    const enriched = await Promise.all(
      deduped.slice(0, count).map(async (item) => ({
        ...item,
        thumbnailUrl: item.thumbnailUrl || await fetchOgImage(item.sourceUrl),
      }))
    );

    const fallback: WireItem[] = [
      {
        category: "Magic News",
        headline: "Magic Wire is refreshing sources",
        summary: "If a source throttles requests, try refresh again in a minute.",
        body: "If a source throttles requests, try refresh again in a minute.",
        source: "Magic AI Wizard",
        sourceUrl: "https://www.magicaiwizard.com/app/",
        thumbnailUrl: "https://images.unsplash.com/photo-1518709268805-4e9042af2176?auto=format&fit=crop&w=1200&q=80",
      },
    ];

    const finalItems = enriched.length ? enriched : fallback;

    setCached(finalItems);
    return sendJson(res, 200, finalItems.slice(0, count));
  } catch {
    return sendJson(res, 200, []);
  }
}
