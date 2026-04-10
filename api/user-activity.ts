import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { getUserIbmContext, normalizeIbmMetadata, insertUserActivity } from './_lib/ibmTelemetry.js';

function parseBearer(req: any): string | null {
  const h = req?.headers?.authorization || req?.headers?.Authorization;
  if (!h || typeof h !== 'string') return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function getEnv(name: string): string | null {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : null;
}

function makeRequestId(): string {
  try {
    // @ts-ignore
    return crypto.randomUUID();
  } catch {
    return crypto.randomBytes(16).toString('hex');
  }
}

function createAdminClient() {
  const url = getEnv('SUPABASE_URL') || getEnv('VITE_SUPABASE_URL');
  const key = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function resolveUser(admin: any, token: string | null): Promise<{ id: string | null; email: string | null }> {
  if (!admin || !token || token === 'guest') return { id: null, email: null };
  try {
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user?.id) return { id: null, email: null };
    return { id: data.user.id, email: data.user.email ?? null };
  } catch {
    return { id: null, email: null };
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const requestId = makeRequestId();
  try {
    const admin = createAdminClient();
    if (!admin) return res.status(200).json({ ok: true, requestId, skipped: 'missing_admin_env' });

    const token = parseBearer(req);
    const user = await resolveUser(admin, token);
    if (!user.id) return res.status(200).json({ ok: true, requestId, skipped: 'no_user' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const tool_name = String(body.tool_name || 'system');
    const event_type = String(body.event_type || 'unknown');
    const success = body.success == null ? true : Boolean(body.success);
    const duration_ms = Number.isFinite(Number(body.duration_ms)) ? Number(body.duration_ms) : null;
    const metadata = body && typeof body.metadata === 'object' && body.metadata !== null ? body.metadata : {};
    const ibmContext = await getUserIbmContext(admin, user.id);
    const mergedMetadata = normalizeIbmMetadata(metadata, ibmContext);

    const baseRow = {
      user_id: user.id,
      email: user.email,
      tool_name,
      event_type,
      success,
      duration_ms,
      metadata: mergedMetadata,
    };

    const dedupedEventTypes = new Set(['signup', 'trial_expired', 'checkout_completed']);
    if (dedupedEventTypes.has(event_type)) {
      const { count } = await admin
        .from('user_activity_log')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('event_type', event_type);
      if (!count) {
        await insertUserActivity(admin, baseRow as any);
      }
    } else {
      await insertUserActivity(admin, baseRow as any);
    }

    if (event_type === 'login') {
      const { count } = await admin
        .from('user_activity_log')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('event_type', 'first_login');
      if (!count) {
        await insertUserActivity(admin, { ...baseRow, event_type: 'first_login', tool_name: 'system' } as any);
      }
    }

    if (event_type === 'tool_used') {
      const { count } = await admin
        .from('user_activity_log')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('event_type', 'first_tool_used');
      if (!count) {
        await insertUserActivity(admin, { ...baseRow, event_type: 'first_tool_used' } as any);
      }
    }

    if (event_type === 'idea_saved') {
      const { count } = await admin
        .from('user_activity_log')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('event_type', 'first_idea_saved');
      if (!count) {
        await insertUserActivity(admin, { ...baseRow, event_type: 'first_idea_saved' } as any);
      }
    }

    return res.status(200).json({ ok: true, requestId });
  } catch {
    return res.status(200).json({ ok: true, requestId });
  }
}
