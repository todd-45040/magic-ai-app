// services/analyticsService.ts

import { supabase } from '../supabase';

export function logEvent(
  event_name: string,
  payload: Record<string, unknown> = {},
  partner_source?: string
) {
  try {
    supabase.auth.getSession().then(({ data }: { data: { session: { access_token?: string } | null } }) => {
      const token = data.session?.access_token;

      if (!token) {
        console.warn('No auth token — skipping telemetry');
        return;
      }

      void fetch('/api/analyticsEvent', {
        method: 'POST',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          event_name,
          event_payload: payload,
          partner_source,
        }),
      }).then(async (response) => {
        if (!response.ok) {
          const text = await response.text().catch(() => '');
          console.warn('Telemetry endpoint error:', response.status, text);
        }
      }).catch((err: unknown) => {
        console.warn('Telemetry request failed:', err);
      });
    }).catch((err: unknown) => {
      console.warn('Telemetry session lookup failed:', err);
    });
  } catch (err: unknown) {
    console.warn('Telemetry failed:', err);
  }
}

export async function logEventAsync(
  event_name: string,
  payload: Record<string, unknown> = {},
  partner_source?: string
): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    if (!token) {
      console.warn('No auth token — skipping telemetry');
      return;
    }

    const response = await fetch('/api/analyticsEvent', {
      method: 'POST',
      keepalive: true,
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
      console.warn('Telemetry endpoint error:', response.status, text);
    }
  } catch (err: unknown) {
    console.warn('Telemetry failed:', err);
  }
}
