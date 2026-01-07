-- App-wide settings table (admin-managed)
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- Optional default seed
insert into public.app_settings (key, value)
values ('ai_defaults', '{"provider":"gemini"}'::jsonb)
on conflict (key) do nothing;
