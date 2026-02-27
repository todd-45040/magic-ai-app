-- Magic AI Wizard — Founding Circle Framework (Phase 3)
-- Email System Activation: retries + attempt tracking
-- Date: 2026-02-27

-- Adds retry/telemetry columns used by /api/emailDrip

alter table public.maw_email_queue
  add column if not exists attempt_count int not null default 0;

alter table public.maw_email_queue
  add column if not exists last_attempt_at timestamptz;

-- Optional helper index for cron efficiency when using retries
create index if not exists maw_email_queue_retry_idx
  on public.maw_email_queue (send_at asc)
  where status in ('queued','error');
