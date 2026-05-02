// services/analyticsService.ts

import { supabase } from '@/lib/supabase';

export async function logEvent(
  event_name: string,
  payload: any = {},
  user_id?: string,
  partner_source?: string
) {
  try {
    const { error } = await supabase
      .from('analytics_events')
      .insert([
        {
          user_id,
          event_name,
          event_payload: payload,
          partner_source,
        },
      ]);

    if (error) {
      console.error('Telemetry insert error:', error);
    }
  } catch (err) {
    console.error('Telemetry failed:', err);
  }
}
