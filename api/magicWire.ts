import { requireSupabaseAuth } from '../server/auth';

type Item = {
  title: string;
  link: string;
  pubDate?: string;
  description?: string;
  source?: string;
};

function stripHtml(input: string): string {
  return (input || '')
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickCategory(title: string): 'New Release' | 'Interview' | 'Review' | 'Community News' | 'Opinion' {
  const t = (title || '').toLowerCase();
  if (t.includes('review')) return 'Review';
  if (t.includes('interview') || t.includes('podcast')) return 'Interview';
  if (t.includes('opinion') || t.includes('editorial')) return 'Opinion';
  if (t.includes('announce') || t.includes('launch') || t.includes('release') || t.includes('available')) return 'New Release';
  return 'Community News';
}

function parseRss(xml: string, sourceLabel: string): Item[] {
  const items: Item[] = [];
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  for (const block of itemBlocks) {
    const title = (block.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim();
    const link = (block.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] || '').trim();
    const pubDate = (block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1] || '').trim();
    const desc =
      (block.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1] || '').trim() ||
      (block.match(/<content:encoded[^>]*>([\s\S]*?)<\/content:encoded>/i)?.[1] || '').trim();

    if (!title || !link) continue;

    items.push({ title, link, pubDate, description: desc, source: sourceLabel });
  }
  return items;
}

function hostFromUrl(u: string): string {
  try {
    const h = new URL(u).hostname.replace(/^www\./, '');
    return h || 'Unknown';
  } catch {
    return 'Unknown';
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Require a valid session token to prevent public scraping / cost abuse.
  const auth = await requireSupabaseAuth(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const countRaw = Array.isArray(req.query?.count) ? req.query.count[0] : req.query?.count;
  const count = Math.max(1, Math.min(12, parseInt(String(countRaw || '9'), 10) || 9));

  const feeds: { url: string; label: string }[] = [
    { url: 'https://www.vanishingincmagic.com/rss/', label: 'Vanishing Inc.' },
    { url: 'https://www.penguinmagic.com/rss/', label: 'Penguin Magic' },
    { url: 'https://www.magicshop.co.uk/feed/', label: 'MagicShop.co.uk' },
  ];

  try {
    const fetched = await Promise.allSettled(
      feeds.map(async (f) => {
        const r = await fetch(f.url, {
          headers: { 'User-Agent': 'Magic AI Wizard (MagicWire)' },
        });
        const xml = await r.text();
        return { xml, label: f.label };
      })
    );

    const all: Item[] = [];
    for (const it of fetched) {
      if (it.status === 'fulfilled') {
        all.push(...parseRss(it.value.xml, it.value.label));
      }
    }

    // De-dupe by link
    const seen = new Set<string>();
    const deduped = all.filter((x) => {
      if (!x.link || seen.has(x.link)) return false;
      seen.add(x.link);
      return true;
    });

    // Sort newest first (best-effort)
    deduped.sort((a, b) => {
      const ad = a.pubDate ? Date.parse(a.pubDate) : 0;
      const bd = b.pubDate ? Date.parse(b.pubDate) : 0;
      return (bd || 0) - (ad || 0);
    });

    const now = Date.now();
    const items = deduped.slice(0, count).map((x, idx) => {
      const body = stripHtml(x.description || '');
      const summary = body.length > 220 ? body.slice(0, 220).trim() + '…' : body;

      const ts = x.pubDate ? Date.parse(x.pubDate) : (now - idx);

      return {
        id: x.link,
        timestamp: Number.isFinite(ts) ? ts : (now - idx),
        category: pickCategory(x.title),
        headline: stripHtml(x.title),
        source: x.source || hostFromUrl(x.link),
        sourceUrl: x.link,
        summary,
        body: body || summary,
      };
    });

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json(items);
  } catch (e: any) {
    console.error('MagicWire RSS error:', e);
    // Fail soft: return empty array instead of 500 so UI doesn't hang.
    return res.status(200).json([]);
  }
}
