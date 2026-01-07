// api/magicWire.ts
//
// Magic Wire v2:
// - Reliable RSS sources (Google News queries + Reddit RSS)
// - Per-feed timeouts + “HTML/WAF page” detection
// - Warm-lambda in-memory cache (10 min)
// - CDN cache headers (s-maxage + stale-while-revalidate)
// - Optional refresh bypass: ?refresh=1
// - Always returns 200 JSON (never breaks UI)

type WireItem = {
  category: string;
  headline: string;
  summary: string;
  body: string;
  source: string;
  sourceUrl: string | null;
  publishedAt?: string;
};

type WireResponse = {
  meta: {
    count: number;
    requested: number;
    usedCache: boolean;
    usedFallback: boolean;
    refreshed: boolean;
    ts: string;
  };
  items: WireItem[];
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
    .replace(/&#39;/g, "'");
}

function stripTags(s: string) {
  return s.replace(/<[^>]*>/g, "").trim();
}

function extractTag(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = re.exec(block);
  return m ? m[1].trim() : null;
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

    // Many providers return HTML challenge/WAF pages to serverless clients.
    const head = text.slice(0, 2000).toLowerCase();
    if (head.includes("<html") || head.includes("<!doctype html")) return null;

    return text;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function parseFeed(xml: string, source: string, category: string): WireItem[] {
  const { blocks } = pickBlocks(xml);
  if (!blocks.length) return [];

  return blocks.slice(0, 25).map((b) => {
    const titleRaw = extractTag(b, "title") || "";
    const headline = decodeHtml(stripTags(titleRaw)) || "Magic News";

    // RSS: <link>...</link>
    let link = extractTag(b, "link");
    if (link) link = stripTags(link);
    // Atom fallback
    if (!link) link = extractAtomLink(b) || undefined;

    const sourceUrl = link && link.length ? link : null;

    const descRaw =
      extractTag(b, "description") ||
      extractTag(b, "summary") ||
      extractTag(b, "content") ||
      "";

    const desc = decodeHtml(stripTags(descRaw)).trim();
    const summary = desc
      ? desc.length > 180
        ? desc.slice(0, 177) + "..."
        : desc
      : "Read more…";

    const publishedAt =
      extractTag(b, "pubDate") ||
      extractTag(b, "updated") ||
      extractTag(b, "published") ||
      undefined;

    return {
      category,
      headline,
      summary,
      body: desc || summary,
      source,
      sourceUrl,
      publishedAt: publishedAt || undefined,
    };
  });
}

// ---------- warm-lambda cache ----------
declare global {
  // eslint-disable-next-line no-var
  var __mw_cache_v2: { ts: number; items: WireItem[] } | undefined;
}

function getCached(maxAgeMs: number): WireItem[] | null {
  const c = globalThis.__mw_cache_v2;
  if (!c) return null;
  if (Date.now() - c.ts > maxAgeMs) return null;
  return c.items;
}

function setCached(items: WireItem[]) {
  globalThis.__mw_cache_v2 = { ts: Date.now(), items };
}

export default async function handler(req: any, res: any) {
  // CDN cache: 10 minutes fresh, allow stale while background refreshes for 1 day
  // (This makes the feed fast + resilient.)
  res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=86400");

  try {
    if (req?.method && req.method !== "GET") {
      return sendJson(res, 405, { error: "Method not allowed" });
    }

    const countRaw = String(req?.query?.count ?? "9");
    const requested = Math.max(1, Math.min(12, parseInt(countRaw, 10) || 9));

    // If caller passes refresh=1, bypass warm cache.
    const refreshed = String(req?.query?.refresh ?? "0") === "1";

    const cacheMs = 10 * 60 * 1000;

    if (!refreshed) {
      const cached = getCached(cacheMs);
      if (cached) {
        const response: WireResponse = {
          meta: {
            count: Math.min(requested, cached.length),
            requested,
            usedCache: true,
            usedFallback: false,
            refreshed: false,
            ts: new Date().toISOString(),
          },
          items: cached.slice(0, requested),
        };
        return sendJson(res, 200, response);
      }
    }

    // Reliable serverless-friendly sources
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

    // De-dupe by headline
    const seen = new Set<string>();
    const deduped = merged.filter((a) => {
      const k = (a.headline || "").toLowerCase().trim();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    const fallback: WireItem[] = [
      {
        category: "Magic News",
        headline: "Magic Wire is refreshing sources",
        summary: "If a source throttles requests, try refresh again in a minute.",
        body: "If a source throttles requests, try refresh again in a minute.",
        source: "Magic AI Wizard",
        sourceUrl: "https://www.magicaiwizard.com/app/",
      },
      {
        category: "Community",
        headline: "Tip: You can swap feeds anytime",
        summary: "Edit api/magicWire.ts to add more RSS sources or adjust search terms.",
        body: "Edit api/magicWire.ts to add more RSS sources or adjust search terms.",
        source: "Magic AI Wizard",
        sourceUrl: "https://www.magicaiwizard.com/app/",
      },
      {
        category: "Shows & Events",
        headline: "Want convention/dealer feeds next?",
        summary: "We can add more sources once you pick the top sites you want to track.",
        body: "We can add more sources once you pick the top sites you want to track.",
        source: "Magic AI Wizard",
        sourceUrl: "https://www.magicaiwizard.com/app/",
      },
    ];

    const usedFallback = deduped.length === 0;
    const finalItems = usedFallback ? fallback : deduped;

    setCached(finalItems);

    const response: WireResponse = {
      meta: {
        count: Math.min(requested, finalItems.length),
        requested,
        usedCache: false,
        usedFallback,
        refreshed,
        ts: new Date().toISOString(),
      },
      items: finalItems.slice(0, requested),
    };

    return sendJson(res, 200, response);
  } catch {
    // Never break the page
    const response: WireResponse = {
      meta: {
        count: 0,
        requested: 0,
        usedCache: false,
        usedFallback: true,
        refreshed: false,
        ts: new Date().toISOString(),
      },
      items: [],
    };
    return sendJson(res, 200, response);
  }
}
