import { requireSupabaseAuth } from "./_auth.js";

type WireItem = {
  category: string;
  headline: string;
  summary: string;
  body: string;
  source: string;
  sourceUrl?: string;
  publishedAt?: string;
};

function sendJson(res: any, status: number, body: any) {
  // Works on multiple runtimes (Express-like or plain Node)
  if (typeof res?.status === "function" && typeof res?.json === "function") {
    return res.status(status).json(body);
  }
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
  // IMPORTANT: escape backslashes inside string pattern
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = re.exec(block);
  return m ? m[1].trim() : null;
}

function extractAtomLink(block: string): string | null {
  const m = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  return m ? m[1] : null;
}

async function fetchRss(url: string, source: string): Promise<WireItem[]> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 6500);

  try {
    const r = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "MagicAIWizard/1.0 (+https://www.magicaiwizard.com)",
        Accept:
          "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
    } as any);

    if (!r.ok) return [];

    const xml = await r.text();

    const items = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
    const entries = xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];
    const blocks = items.length ? items : entries;

    return blocks.slice(0, 20).map((b) => {
      const title = decodeHtml(stripTags(extractTag(b, "title") || "")) || "Magic News";

      // RSS: <link>...</link>, Atom: <link href="..."/>
      let link = extractTag(b, "link");
      if (link) link = stripTags(link);
      if (!link) link = extractAtomLink(b) || undefined;

      const descRaw =
        extractTag(b, "description") ||
        extractTag(b, "summary") ||
        extractTag(b, "content") ||
        "";
      const desc = decodeHtml(stripTags(descRaw));

      const pub =
        extractTag(b, "pubDate") ||
        extractTag(b, "updated") ||
        extractTag(b, "published") ||
        "";

      const summary = desc
        ? desc.length > 180
          ? desc.slice(0, 177) + "..."
          : desc
        : "Tap to read more.";

      return {
        category: "Community News",
        headline: title,
        summary,
        body: desc || summary,
        source,
        sourceUrl: link,
        publishedAt: pub || undefined,
      };
    });
  } catch {
    // fail-soft per feed
    return [];
  } finally {
    clearTimeout(t);
  }
}

export default async function handler(req: any, res: any) {
  try {
    if (req?.method && req.method !== "GET") {
      return sendJson(res, 405, { error: "Method not allowed" });
    }

    const auth = await requireSupabaseAuth(req);
    if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });

    const countRaw = String(req?.query?.count ?? "9");
    const count = Math.max(1, Math.min(12, parseInt(countRaw, 10) || 9));

    const feeds = [
      { url: "https://www.vanishingincmagic.com/rss/", source: "Vanishing Inc." },
      { url: "https://www.penguinmagic.com/rss.php", source: "Penguin Magic" },
      { url: "https://www.magicshop.co.uk/feed/", source: "Magic Shop UK" },
    ];

    const results = await Promise.allSettled(
      feeds.map((f) => fetchRss(f.url, f.source))
    );

    const merged: WireItem[] = [];
    for (const r of results) {
      if (r.status === "fulfilled" && Array.isArray(r.value)) merged.push(...r.value);
    }

    // de-dupe
    const seen = new Set<string>();
    const deduped = merged.filter((a) => {
      const k = (a.headline || "").toLowerCase().trim();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    return sendJson(res, 200, deduped.slice(0, count));
  } catch (e: any) {
    return sendJson(res, 500, { error: e?.message || String(e) });
  }
}
