import { createClient } from '@supabase/supabase-js';

function getEnv(name: string): string | undefined {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : undefined;
}

export function getSupabaseAdmin() {
  const url = getEnv('SUPABASE_URL') || getEnv('VITE_SUPABASE_URL');
  const serviceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) {
    throw new Error('Supabase server environment variables missing: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  }
  return createClient(url, serviceKey, { auth: { persistSession: false } }) as any;
}

// Supports both Web Fetch Request (headers.get) and Node/Vercel req (plain object headers)
export function getBearerToken(req: any): string | null {
  const headersObj = (req && (req.headers as any)) || undefined;

  // Web Fetch Request style
  const hWeb = headersObj && typeof headersObj.get === 'function'
    ? (headersObj.get('authorization') || headersObj.get('Authorization'))
    : null;

  // Node/Vercel style: req.headers is a plain object
  const hNode = !hWeb && headersObj && typeof headersObj === 'object'
    ? (headersObj['authorization'] || headersObj['Authorization'])
    : null;

  const h = (hWeb || hNode || '').toString();
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1] : null;
}

export async function requireSupabaseAuth(req: any): Promise<
  | { ok: true; admin: any; userId: string; email?: string }
  | { ok: false; status: number; error: string }
> {
  const token = getBearerToken(req);
  if (!token || token === 'guest') return { ok: false, status: 401, error: 'Unauthorized' };

  let admin: any;
  try {
    admin = getSupabaseAdmin();
  } catch (e: any) {
    return { ok: false, status: 503, error: String(e?.message || e) };
  }

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return { ok: false, status: 401, error: 'Unauthorized' };

  return { ok: true, admin, userId: data.user.id, email: data.user.email };
}

export async function requireAdmin(req: Request): Promise<
  | { ok: true; admin: any; userId: string; email?: string }
  | { ok: false; status: number; error: string }
> {
  const auth = await requireSupabaseAuth(req);
  if (!auth.ok) return auth;

  // Check users table for is_admin flag (preferred)
  try {
    const { data, error } = await auth.admin
      .from('users')
      .select('is_admin,email')
      .eq('id', auth.userId)
      .maybeSingle();

    if (!error && data?.is_admin) return auth;

    // Fallback: allow ADMIN_EMAIL env as super-admin override
    const adminEmail = getEnv('ADMIN_EMAIL');
    if (adminEmail && auth.email && auth.email.toLowerCase() === adminEmail.toLowerCase()) return auth;

    return { ok: false, status: 403, error: 'Forbidden' };
  } catch {
    return { ok: false, status: 403, error: 'Forbidden' };
  }
}
