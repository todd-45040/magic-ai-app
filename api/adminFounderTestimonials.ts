import { requireAdmin } from '../lib/server/auth/index.js';

function json(res: any, status: number, body: any) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(body));
}

type TestimonialRow = {
  id: string;
  created_at: string;
  updated_at: string;
  founder_name: string | null;
  founder_title: string | null;
  use_case: string | null;
  headline: string | null;
  quote: string;
  meta: any | null;
  is_published: boolean;
  featured_at: string | null;
};

export default async function handler(req: any, res: any) {
  try {
    const auth = await requireAdmin(req as any);
    if (!auth.ok) return json(res, auth.status, { ok: false, error: auth.error });

    const table = 'maw_founder_testimonials';

    if (req.method === 'GET') {
      const q = (req?.query || {}) as any;
      const limit = Math.min(500, Math.max(1, Number(q.limit || 50)));
      const published = q.published;

      let qb = auth.admin
        .from(table)
        .select('id,created_at,updated_at,founder_name,founder_title,use_case,headline,quote,meta,is_published,featured_at')
        .order('featured_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(limit);

      if (published === 'true') qb = qb.eq('is_published', true);
      if (published === 'false') qb = qb.eq('is_published', false);

      const { data, error } = await qb;
      if (error) return json(res, 500, { ok: false, error: error.message || String(error) });
      return json(res, 200, { ok: true, testimonials: (data || []) as TestimonialRow[] });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const quote = String(body.quote || '').trim();
      if (!quote) return json(res, 400, { ok: false, error: 'quote is required' });

      const payload = {
        founder_name: body.founder_name ?? null,
        founder_title: body.founder_title ?? null,
        use_case: body.use_case ?? null,
        headline: body.headline ?? null,
        quote,
        meta: body.meta ?? null,
        is_published: Boolean(body.is_published ?? false),
        featured_at: body.featured_at ?? null,
      };

      const { data, error } = await auth.admin
        .from(table)
        .insert(payload)
        .select('id')
        .maybeSingle();

      if (error) return json(res, 500, { ok: false, error: error.message || String(error) });
      return json(res, 200, { ok: true, id: data?.id });
    }

    if (req.method === 'PATCH') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const id = String(body.id || '').trim();
      if (!id) return json(res, 400, { ok: false, error: 'id is required' });

      const patch: any = {};
      if ('founder_name' in body) patch.founder_name = body.founder_name ?? null;
      if ('founder_title' in body) patch.founder_title = body.founder_title ?? null;
      if ('use_case' in body) patch.use_case = body.use_case ?? null;
      if ('headline' in body) patch.headline = body.headline ?? null;
      if ('quote' in body) patch.quote = String(body.quote || '').trim();
      if ('meta' in body) patch.meta = body.meta ?? null;
      if ('is_published' in body) patch.is_published = Boolean(body.is_published);
      if ('featured_at' in body) patch.featured_at = body.featured_at ?? null;

      const { error } = await auth.admin.from(table).update(patch).eq('id', id);
      if (error) return json(res, 500, { ok: false, error: error.message || String(error) });
      return json(res, 200, { ok: true });
    }

    if (req.method === 'DELETE') {
      const q = (req?.query || {}) as any;
      const id = String(q.id || '').trim();
      if (!id) return json(res, 400, { ok: false, error: 'id is required' });
      const { error } = await auth.admin.from(table).delete().eq('id', id);
      if (error) return json(res, 500, { ok: false, error: error.message || String(error) });
      return json(res, 200, { ok: true });
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return json(res, 405, { ok: false, error: 'Method Not Allowed' });
  } catch (e: any) {
    return json(res, 500, { ok: false, error: e?.message || String(e) });
  }
}
