-- IBM signup source + requested trial days support
alter table public.users
  add column if not exists signup_source text;

alter table public.users
  add column if not exists requested_trial_days integer;

create index if not exists users_signup_source_idx
  on public.users (signup_source);
