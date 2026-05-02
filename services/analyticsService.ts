// services/analyticsService.ts

import { supabase } from '../supabase';

export async function logEvent(
  event_name: string,
  payload: any = {},
  partner_source?: string
) {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const token = session?.access_token;

    if (!token) {
      console.warn('No auth token — skipping telemetry');
      return;
    }

    const response = await fetch('/api/analyticsEvent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        event_name,
        event_payload: payload,
        partner_source,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error('Telemetry endpoint error:', response.status, text);
    }
  } catch (err) {
    console.error('Telemetry failed:', err);
  }
}
