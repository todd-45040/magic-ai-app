import { requireSupabaseAuth } from './_auth.js';
import { getFoundersConfig, countFounders, permanentlyCloseFounders } from './_lib/foundersCap.js';

function json(res: any, status: number, payload: any) {
  return res.status(status).json(payload);
}

function isValidFoundingBucket(value: unknown): value is 'admc_2026' | 'reserve_2026' {
  return value === 'admc_2026' || value === 'reserve_2026';
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return json(res, 405, { ok: false, error: 'Method not allowed' });
  }

  const auth = await requireSupabaseAuth(req);
  if (!auth.ok) {
    return json(res, auth.status, { ok: false, error: auth.error });
  }

  const admin = auth.admin;
  const userId = auth.userId;
  const email = String(auth.email || '').trim().toLowerCase();
  if (!email) {
    return json(res, 400, { ok: false, error: 'Authenticated user email is required.' });
  }

  try {
    const { data: userRow, error: userErr } = await admin
      .from('users')
      .select('id,email,founding_circle_member,pricing_lock,founding_source,founding_bucket')
      .eq('id', userId)
      .maybeSingle();

    if (userErr) {
      return json(res, 500, { ok: false, error: 'Could not load user profile.' });
    }

    if (userRow?.founding_circle_member || String(userRow?.pricing_lock || '').trim()) {
      return json(res, 200, { ok: true, reconciled: false, alreadyFounder: true });
    }

    const { data: leadRow, error: leadErr } = await admin
      .from('maw_founding_circle_leads')
      .select('email_lower,source,founding_bucket,meta,converted_to_user,converted_user_id')
      .eq('email_lower', email)
      .maybeSingle();

    if (leadErr) {
      return json(res, 500, { ok: false, error: 'Could not load founding lead.' });
    }

    if (!leadRow) {
      return json(res, 200, { ok: true, reconciled: false, reason: 'no_matching_lead' });
    }

    const desiredBucket = isValidFoundingBucket(leadRow?.founding_bucket) ? leadRow.founding_bucket : 'admc_2026';
    const desiredSource = String(leadRow?.source || (leadRow?.meta as any)?.founding_source || 'ADMC_2026').trim() || 'ADMC_2026';
    const pricingLock = String((leadRow?.meta as any)?.pricing_lock || 'founding_pro_admc_2026').trim() || 'founding_pro_admc_2026';

    try {
      const cfg = await getFoundersConfig(admin);
      if (cfg?.closed) {
        return json(res, 409, {
          ok: false,
          error_code: 'FOUNDERS_CLOSED',
          message: 'Founders Circle is full and permanently closed.',
          retryable: false,
        });
      }
    } catch {
      // non-blocking: rely on RPC below
    }

    const { data: claimRows, error: claimErr } = await admin.rpc('maw_claim_founding_bucket', {
      p_user_id: userId,
      p_bucket: desiredBucket,
    });

    const claim = Array.isArray(claimRows) ? claimRows[0] : claimRows;
    if (claimErr || !claim?.ok) {
      const reason = String(claim?.reason || claimErr?.message || 'limit_reached');
      return json(res, 409, {
        ok: false,
        error_code: 'FOUNDERS_CLOSED',
        message:
          reason === 'admc_limit_reached'
            ? 'ADMC Founders Circle is full (75/75).'
            : reason === 'total_limit_reached'
            ? 'Founders Circle is full.'
            : 'Founders Circle is currently unavailable.',
        retryable: false,
      });
    }

    const nowIso = new Date().toISOString();
    const { error: updateUserErr } = await admin
      .from('users')
      .update({
        founding_circle_member: true,
        founding_joined_at: nowIso,
        founding_source: desiredSource,
        pricing_lock: pricingLock,
        founding_bucket: desiredBucket,
      })
      .eq('id', userId);

    if (updateUserErr) {
      return json(res, 500, { ok: false, error: 'Could not update user founding status.' });
    }

    const { error: updateLeadErr } = await admin
      .from('maw_founding_circle_leads')
      .update({
        converted_to_user: true,
        converted_user_id: userId,
        converted_at: nowIso,
      })
      .eq('email_lower', email);

    if (updateLeadErr) {
      console.warn('foundingReconcile lead update warning', updateLeadErr);
    }

    try {
      const cfg = await getFoundersConfig(admin);
      if (cfg && !cfg.closed) {
        const current = await countFounders(admin);
        if (current >= Number(cfg.cap || 100)) await permanentlyCloseFounders(admin);
      }
    } catch {
      // ignore post-success closure attempt
    }

    return json(res, 200, {
      ok: true,
      reconciled: true,
      founding_bucket: desiredBucket,
      founding_source: desiredSource,
      pricing_lock: pricingLock,
    });
  } catch (error: any) {
    console.error('foundingReconcile failed', error);
    return json(res, 500, {
      ok: false,
      error: 'Could not reconcile founding status.',
      details: process.env.VERCEL_ENV !== 'production' ? String(error?.message || error) : undefined,
    });
  }
}
