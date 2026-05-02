// services/analyticsService.ts

import { supabase } from '../supabase';

export function logEvent(
  event_name: string,
  payload: any = {},
  partner_source?: string
) {
  try {
    supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token;

      if (!token) {
        console.warn('No auth token — skipping telemetry');
        return;
      }

      fetch('/api/analyticsEvent', {
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
      }).catch((err) => {
        console.warn('Telemetry request failed:', err);
      });
    }).catch((err) => {
      console.warn('Telemetry session lookup failed:', err);
    });
  } catch (err) {
    console.warn('Telemetry failed:', err);
  }
}
