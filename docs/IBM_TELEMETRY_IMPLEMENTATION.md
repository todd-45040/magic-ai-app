IBM telemetry implementation

This patch adds / strengthens backend tracking for IBM trial users:
- user_activity_log rows are enriched server-side with { source: 'ibm', campaign: 'ibm-30day' } when the authenticated user row has signup_source='ibm'.
- /api/telemetry/event now enriches server-side tool/error activity with IBM metadata.
- /api/user-activity now enriches all activity events with IBM metadata.
- /api/adminIbmFunnel now exposes richer event counts, key rates, and top error kinds.

Recommended events to watch:
- signup
- login / first_login
- first_tool_used
- first_idea_saved
- upgrade_prompt_viewed
- upgrade_clicked
- checkout_started
- checkout_completed
- trial_expired
- error (with metadata.error_kind)
