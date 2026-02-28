-- Founding Circle Phase 8 — Founder Feedback Inbox (Replies capture)
-- Stores replies / feature requests from Founders so feedback isn't lost.

create table if not exists public.maw_founder_feedback (
  id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  received_at timestamptz null,
  source text not null default 'manual'::text, -- manual | webhook | forward
  status text not null default 'new'::text,    -- new | archived
  message_id text null,                        -- unique id from provider if available
  from_email text not null,
  from_name text null,
  subject text null,
  body_text text null,
  body_html text null,
  meta jsonb null,
  constraint maw_founder_feedback_pkey primary key (id)
);

create unique index if not exists maw_founder_feedback_message_id_uidx
  on public.maw_founder_feedback (message_id)
  where message_id is not null;

create index if not exists maw_founder_feedback_status_idx
  on public.maw_founder_feedback (status);

create index if not exists maw_founder_feedback_received_at_idx
  on public.maw_founder_feedback (coalesce(received_at, created_at));

alter table public.maw_founder_feedback enable row level security;

-- No direct client access. Admin API uses service role.
drop policy if exists "maw_feedback_no_public" on public.maw_founder_feedback;
create policy "maw_feedback_no_public"
on public.maw_founder_feedback
for all
to public
using (false)
with check (false);
