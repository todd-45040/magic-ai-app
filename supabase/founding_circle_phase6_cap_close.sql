-- Founders Circle Step 6 — Permanent cap closure
-- Creates a single-row config table that permanently closes once cap reached.

create table if not exists public.maw_founders_config (
  id int primary key default 1,
  cap int not null default 100,
  closed boolean not null default false,
  closed_at timestamptz null
);

insert into public.maw_founders_config (id, cap, closed)
values (1, 100, false)
on conflict (id) do nothing;

-- Optional performance index for founder counting
create index if not exists idx_users_founding_circle_member_true
on public.users (founding_circle_member)
where founding_circle_member = true;
