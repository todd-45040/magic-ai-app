import { requireAdmin } from './ai/_lib/auth';
import { getFoundersConfig, countFounders, permanentlyCloseFounders } from './_lib/foundersCap';

function json(res: any, status: number, body: any) {
  return res.status(status).json(body);
}

function isValidEmail(email: string): boolean {
  if (!email) return false;
  if (email.length > 320) return false;
  // Simple, safe email validation (not RFC-perfect, but practical)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeEmail(email: string): string {
  return String(email || '').trim().toLowerCase();
}

function isValidFoundingBucket(v: any): v is 'admc_2026' | 'reserve_2026' {
  return v === 'admc_2026' || v === 'reserve_2026';
}

/**
 * Admin-only: Manually mark a user as a Founder after using the Stripe Payment Link backup.
 * - Enforces caps atomically via `maw_claim_founding_bucket`.
 * - Applies pricing_lock (founder tier key) and founding metadata.
 */
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' });

  const auth = await requireAdmin(req);
  if (!auth.ok) return json(res, auth.status, auth);

  let body: any = null;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    body = req.body;
  }

  const email = normalizeEmail(body?.email);
  if (!isValidEmail(email)) return json(res, 400, { ok: false, error: 'Invalid email' });

  const bucketRaw = typeof body?.founding_bucket === 'string' ? body.founding_bucket.trim() : 'admc_2026';
  const founding_bucket: 'admc_2026' | 'reserve_2026' = isValidFoundingBucket(bucketRaw) ? bucketRaw : 'admc_2026';

  const source = typeof body?.source === 'string' ? String(body.source).slice(0, 80) : 'backup_payment_link';
  const pricing_lock = 'founding_pro_admc_2026';

  const admin = auth.admin;

// Step 6 — Permanent closure gate (if config table installed)
try {
  const cfg = await getFoundersConfig(admin);
  if (cfg?.closed) {
    return json(res, 409, { ok: false, error: 'Founders Circle is full and permanently closed.' });
  }
} catch {
  // non-blocking (fallback to RPC cap enforcement)
}


  // Find user by email
  const { data: user, error: userErr } = await admin
    .from('users')
    .select('id,email')
    .eq('email_lower', email)
    .maybeSingle();

  if (userErr) {
    console.error('manual founder claim: user lookup error', userErr);
  }

  if (!user?.id) {
    // User not found — store as a founding lead so it can reconcile later.
    try {
      await admin.from('maw_founding_circle_leads').upsert(
        {
          email,
          email_lower: email,
          name: null,
          source,
          converted_to_user: false,
          converted_user_id: null,
          founding_bucket,
          meta: { manual_claim_pending: true, via: 'backup_payment_link' },
        },
        { onConflict: 'email_lower' }
      );
    } catch (e) {
      console.warn('manual founder claim: lead upsert failed', e);
    }

    return json(res, 404, {
      ok: false,
      error: 'User not found. Lead recorded as pending; claim again after the user signs up.',
    });
  }

  // Atomically claim the bucket (enforces ADMC 75 + total 100)
  try {
    const { data: claimRows, error: claimErr } = await admin.rpc('maw_claim_founding_bucket', {
      p_user_id: String(user.id),
      p_bucket: founding_bucket,
    });

    const claim = Array.isArray(claimRows) ? (claimRows[0] as any) : (claimRows as any);
    if (claimErr || !claim?.ok) {
      const reason = String(claim?.reason || claimErr?.message || 'limit_reached');
      return json(res, 409, {
        ok: false,
        error:
          reason === 'admc_limit_reached'
            ? 'ADMC Founders Circle is full (75/75).'
            : reason === 'total_limit_reached'
            ? 'Founders Circle is full.'
            : 'Founders Circle is currently unavailable.',
      });
    }
  } catch (e) {
    console.warn('manual founder claim: rpc failed', e);
    return json(res, 500, { ok: false, error: 'Could not claim founder slot. Try again.' });
  }

  // Apply identity fields (idempotent)
  try {
    await admin
      .from('users')
      .update({
        founding_circle_member: true,
        founding_joined_at: new Date().toISOString(),
        founding_source: source,
        pricing_lock,
        founding_bucket,
      })
      .eq('id', String(user.id));
  } catch (e) {
    console.warn('manual founder claim: user update failed', e);
  }

  // Update lead table (best-effort)
  try {
    await admin.from('maw_founding_circle_leads').upsert(
      {
        email,
        email_lower: email,
        name: null,
        source,
        converted_to_user: true,
        converted_user_id: String(user.id),
        founding_bucket,
        meta: { via: 'backup_payment_link', manual_claimed_at: new Date().toISOString() },
      },
      { onConflict: 'email_lower' }
    );
  } catch {
    // ignore
  }

// Step 6 — if we just hit the cap, permanently close founders (idempotent)
try {
  const cfg = await getFoundersConfig(admin);
  if (cfg && !cfg.closed) {
    const current = await countFounders(admin);
    if (current >= Number(cfg.cap || 100)) await permanentlyCloseFounders(admin);
  }
} catch {
  // ignore
}

return json(res, 200, { ok: true, message: `Founder claimed for ${email}.` });

}
