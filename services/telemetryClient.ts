// services/telemetryClient.ts
// Lightweight, best-effort client telemetry to server-side ai_usage_events.
// No schema changes: we log into ai_usage_events with endpoint="client:<action>".

import { supabase } from '../supabase';

export type ClientTelemetryAction =
  | 'identify_upload_selected'
  | 'identify_request_start'
  | 'identify_request_success'
  | 'identify_request_error'
  | 'identify_retry_click'
  | 'identify_refine_click'
  | 'identify_save_click'
  | 'identify_save_success'
  | 'visual_request_start'
  | 'visual_request_success'
  | 'visual_request_error'
  | 'visual_refine_click'
  | 'visual_save_click'
  | 'visual_save_success'
  | 'director_request_start'
  | 'director_request_success'
  | 'director_request_error'
  | 'director_refine_click'
  | 'director_save_blueprint'
  | 'director_create_show'
  | 'director_send_to_show_planner'
  | 'angle_risk_analysis_start'
  | 'angle_risk_analysis_success'
  | 'angle_risk_analysis_error'
  | 'angle_risk_analysis_saved'
  | 'angle_risk_send_to_director'
  | 'angle_risk_send_to_rehearsal'
  | 'live_rehearsal_session_start'
  | 'live_rehearsal_session_error'
  | 'live_rehearsal_start_blocked'
  | 'live_rehearsal_take_complete'
  | 'live_rehearsal_demo_loaded'
  | 'live_rehearsal_demo_review'
  | 'live_rehearsal_analyze_click'
  | 'live_rehearsal_session_saved'
  | 'live_rehearsal_next_take'
  | 'live_rehearsal_take_selected'
  | 'live_rehearsal_send_to_angle_risk'
  | 'live_rehearsal_send_to_patter'
  | 'live_rehearsal_send_to_director'
  | 'live_rehearsal_save_routine'
;

export async function trackClientEvent(input: {
  tool: string;
  action: ClientTelemetryAction | string;
  metadata?: any;
  outcome?: 'SUCCESS_NOT_CHARGED' | 'ERROR_UPSTREAM' | 'ALLOWED' | 'SUCCESS_CHARGED';
  http_status?: number;
  error_code?: string;
  retryable?: boolean;
  units?: number;
}): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;

    await fetch('/api/telemetry/event', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: token ? `Bearer ${token}` : 'Bearer guest',
      },
      body: JSON.stringify(input),
    });
  } catch {
    // Never break UX for telemetry
  }
}
