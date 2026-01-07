-- Magic AI Wizard - Admin-controlled global settings
-- Run this once in Supabase SQL Editor.

create table if not exists public.app_settings (
  id text primary key,
  ai_provider text not null default 'gemini',
  updated_at timestamptz
);

-- Optional: keep it private (server uses service role key)
alter table public.app_settings enable row level security;

-- No client policies required because the app reads/writes through serverless API
-- (using SUPABASE_SERVICE_ROLE_KEY).

insert into public.app_settings (id, ai_provider, updated_at)
values ('global', 'gemini', now())
on conflict (id) do nothing;
