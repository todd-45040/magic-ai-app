-- Founding Circle Phase 3.5 — Email versioning + provider message id + open/click tracking scaffold
-- Date: 2026-02-27
-- Notes:
-- - Service-role writes are expected (cron + tracking endpoints).
-- - RLS enabled; no public insert policies are created here.

-- 1) Email queue enhancements
ALTER TABLE public.maw_email_queue
  ADD COLUMN IF NOT EXISTS template_version integer NOT NULL DEFAULT 1;

ALTER TABLE public.maw_email_queue
  ADD COLUMN IF NOT EXISTS provider_message_id text NULL;

ALTER TABLE public.maw_email_queue
  ADD COLUMN IF NOT EXISTS tracking_id uuid NOT NULL DEFAULT gen_random_uuid();

CREATE INDEX IF NOT EXISTS maw_email_queue_tracking_id_idx
  ON public.maw_email_queue (tracking_id);

-- 2) Email event tracking scaffold (opens/clicks)
CREATE TABLE IF NOT EXISTS public.maw_email_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tracking_id uuid NOT NULL,
  event_type text NOT NULL, -- 'open' | 'click'
  template_key text NULL,
  template_version integer NULL,
  url text NULL,
  user_agent text NULL,
  ip_hash text NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT maw_email_events_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS maw_email_events_tracking_id_idx
  ON public.maw_email_events (tracking_id);

CREATE INDEX IF NOT EXISTS maw_email_events_type_created_idx
  ON public.maw_email_events (event_type, created_at DESC);

ALTER TABLE public.maw_email_events ENABLE ROW LEVEL SECURITY;

-- Intentionally no anon/user insert policy — tracking endpoints write via service role.
