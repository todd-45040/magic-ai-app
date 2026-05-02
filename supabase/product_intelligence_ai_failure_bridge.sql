-- Product Intelligence + AI Observability Bridge
-- Purpose: connect activation funnel behavior to AI-generation failures without adding heavy analytics tooling.

-- 1) Recent AI-generation failures captured in analytics_events.
SELECT
  created_at,
  user_id,
  partner_source,
  event_payload->>'tool' AS tool,
  event_payload->>'action' AS action,
  event_payload->>'http_status' AS http_status,
  event_payload->>'error_code' AS error_code,
  event_payload->>'retryable' AS retryable,
  event_payload->>'message' AS message
FROM analytics_events
WHERE event_name = 'ai_generation_failed'
ORDER BY created_at DESC
LIMIT 50;

-- 2) Funnel + AI failure summary by partner source.
CREATE OR REPLACE VIEW activation_funnel_ai_failure_summary AS
WITH user_events AS (
  SELECT
    user_id,
    COALESCE(partner_source, 'unknown') AS partner_source,
    MIN(created_at) FILTER (WHERE event_name = 'activation_viewed') AS activation_viewed_at,
    MIN(created_at) FILTER (WHERE event_name = 'activation_started') AS activation_started_at,
    MIN(created_at) FILTER (WHERE event_name = 'activation_generate_clicked') AS activation_generate_clicked_at,
    MIN(created_at) FILTER (WHERE event_name = 'activation_effect_generated') AS activation_effect_generated_at,
    MIN(created_at) FILTER (WHERE event_name = 'first_idea_saved') AS first_idea_saved_at,
    MIN(created_at) FILTER (WHERE event_name = 'next_step_clicked') AS next_step_clicked_at,
    COUNT(*) FILTER (WHERE event_name = 'ai_generation_failed') AS ai_generation_failures
  FROM analytics_events
  WHERE user_id IS NOT NULL
  GROUP BY user_id, COALESCE(partner_source, 'unknown')
)
SELECT
  partner_source,
  COUNT(*) FILTER (WHERE activation_viewed_at IS NOT NULL) AS viewed_users,
  COUNT(*) FILTER (WHERE activation_started_at IS NOT NULL) AS started_users,
  COUNT(*) FILTER (WHERE activation_generate_clicked_at IS NOT NULL) AS generated_click_users,
  COUNT(*) FILTER (WHERE activation_effect_generated_at IS NOT NULL) AS effect_generated_users,
  COUNT(*) FILTER (WHERE first_idea_saved_at IS NOT NULL) AS saved_users,
  COUNT(*) FILTER (WHERE next_step_clicked_at IS NOT NULL) AS next_step_clicked_users,
  COUNT(*) FILTER (WHERE ai_generation_failures > 0) AS users_with_ai_generation_failures,
  COALESCE(SUM(ai_generation_failures), 0) AS total_ai_generation_failures,
  ROUND(100.0 * COUNT(*) FILTER (WHERE activation_effect_generated_at IS NOT NULL) / NULLIF(COUNT(*) FILTER (WHERE activation_generate_clicked_at IS NOT NULL), 0), 1) AS pct_generate_click_to_effect,
  ROUND(100.0 * COUNT(*) FILTER (WHERE first_idea_saved_at IS NOT NULL) / NULLIF(COUNT(*) FILTER (WHERE activation_effect_generated_at IS NOT NULL), 0), 1) AS pct_effect_to_save,
  ROUND(100.0 * COUNT(*) FILTER (WHERE ai_generation_failures > 0) / NULLIF(COUNT(*) FILTER (WHERE activation_generate_clicked_at IS NOT NULL), 0), 1) AS pct_generate_click_users_with_ai_failure
FROM user_events
GROUP BY partner_source
ORDER BY partner_source;

-- 3) Users who clicked generate but did not get an effect, with failure context.
CREATE OR REPLACE VIEW activation_generate_dropoff_with_ai_failures AS
WITH per_user AS (
  SELECT
    user_id,
    COALESCE(partner_source, 'unknown') AS partner_source,
    MIN(created_at) FILTER (WHERE event_name = 'activation_generate_clicked') AS generate_clicked_at,
    MIN(created_at) FILTER (WHERE event_name = 'activation_effect_generated') AS effect_generated_at,
    MIN(created_at) FILTER (WHERE event_name = 'first_idea_saved') AS saved_at,
    COUNT(*) FILTER (WHERE event_name = 'ai_generation_failed') AS ai_generation_failures,
    MAX(event_payload) FILTER (WHERE event_name = 'ai_generation_failed') AS latest_ai_failure_payload
  FROM analytics_events
  WHERE user_id IS NOT NULL
  GROUP BY user_id, COALESCE(partner_source, 'unknown')
)
SELECT *
FROM per_user
WHERE generate_clicked_at IS NOT NULL
  AND (effect_generated_at IS NULL OR saved_at IS NULL OR ai_generation_failures > 0)
ORDER BY generate_clicked_at DESC;
