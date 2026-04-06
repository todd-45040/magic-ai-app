import { supabase } from '../supabase';

export type UserActivityEventType =
  | 'login'
  | 'first_login'
  | 'tool_used'
  | 'first_tool_used'
  | 'idea_saved'
  | 'first_idea_saved'
  | 'error';

export async function logUserActivity(input: {
  tool_name: string;
  event_type: UserActivityEventType;
  success?: boolean;
  duration_ms?: number | null;
  metadata?: Record<string, any> | null;
}): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    await fetch('/api/user-activity', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: token ? `Bearer ${token}` : 'Bearer guest',
      },
      body: JSON.stringify({
        tool_name: input.tool_name,
        event_type: input.event_type,
        success: input.success ?? true,
        duration_ms: input.duration_ms ?? null,
        metadata: input.metadata ?? {},
      }),
    });
  } catch {
    // Never break UX for activity logging
  }
}
