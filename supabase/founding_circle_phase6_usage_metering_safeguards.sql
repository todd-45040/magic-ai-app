-- Founding Circle Phase 6 — Usage Metering Safeguards (Pre‑Pro Launch)
--
-- Goal:
--   Add daily guardrails for high-cost rehearsal usage.
--   Monthly quotas already exist (quota_live_audio_minutes, etc.).
--   These new columns allow daily caps + warning banners without Redis.

-- Daily Live Rehearsal (Audio) usage bucket (minutes)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS daily_live_audio_minutes_used integer NOT NULL DEFAULT 0;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS daily_live_audio_reset_date timestamp with time zone NOT NULL DEFAULT now();

-- Optional: daily video rehearsal uploads bucket (count)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS daily_video_uploads_used integer NOT NULL DEFAULT 0;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS daily_video_uploads_reset_date timestamp with time zone NOT NULL DEFAULT now();
