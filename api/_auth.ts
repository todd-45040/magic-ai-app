import { createClient } from '@supabase/supabase-js';

export type SupabaseAuthOk = {
  ok: true;
  token: string;
  userId: string;
  email?: string;
  // Supabase Admin client (service role). Use ONLY on server.
  admin: any;
};

export type SupabaseAuthFail = {
  ok: false;
  status: number;
  error: string;
};

export function getBearerToken(req: any): string | null {
  const headers: any = req?.headers;
  const h = typeof headers?.get === 'function'
    ? (headers.get('authorization') || headers.get('Authorization'))
    : (headers?.authorization || headers?.Authorization || headers?.AUTHORIZATION);
  if (!h || typeof h !== 'string') return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

/**
 * Require a valid Supabase JWT in the Authorization header.
 * - Returns { ok:false, status:401 } for missing/invalid tokens.
 * - Returns { ok:false, status:503 } if server auth env vars are missing.
 *
 * NOTE: This uses the Supabase *service role* key server-side to validate the JWT and
 * resolve the user. Never call from the browser.
 */
export async function requireSupabaseAuth(req: any): Promise<SupabaseAuthOk | SupabaseAuthFail> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token = getBearerToken(req);

  if (!supabaseUrl || !serviceKey) {
    return { ok: false, status: 503, error: 'Server auth is not configured.' };
  }

  if (!token || token === 'guest') {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user?.id) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  return { ok: true, token, userId: data.user.id, email: data.user.email, admin };
}

export async function requireAdmin(req: any): Promise<SupabaseAuthOk | SupabaseAuthFail> {
  const auth = await requireSupabaseAuth(req);
  if (!auth.ok) return auth;

  try {
    const { data, error } = await auth.admin
      .from('users')
      .select('is_admin,email')
      .eq('id', auth.userId)
      .maybeSingle();

    if (!error && data?.is_admin) return auth;

    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail && auth.email && auth.email.toLowerCase() === adminEmail.toLowerCase()) return auth;

    return { ok: false, status: 403, error: 'Forbidden' };
  } catch {
    return { ok: false, status: 403, error: 'Forbidden' };
  }
}

