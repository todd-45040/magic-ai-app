-- Founding Circle Phase 7 — Founder Testimonials (for Day 7 Spotlight automation)

create table if not exists public.maw_founder_testimonials (
  id uuid not null default gen_random_uuid(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),

  -- Display fields
  founder_name text null,
  founder_title text null,
  use_case text null,
  headline text null,
  quote text not null,

  -- Optional structured metadata
  meta jsonb null,

  -- Publishing controls
  is_published boolean not null default false,
  featured_at timestamp with time zone null,

  constraint maw_founder_testimonials_pkey primary key (id)
) tablespace pg_default;

create index if not exists maw_founder_testimonials_published_idx
  on public.maw_founder_testimonials (is_published, featured_at desc, created_at desc);

-- Keep updated_at fresh
create or replace function public.maw_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists maw_founder_testimonials_set_updated_at on public.maw_founder_testimonials;
create trigger maw_founder_testimonials_set_updated_at
before update on public.maw_founder_testimonials
for each row execute function public.maw_set_updated_at();

-- Lock down direct client access (admin API uses service role)
alter table public.maw_founder_testimonials enable row level security;

-- Optional: allow authenticated users to read published testimonials (not required for drip)
-- drop policy if exists "Read published testimonials" on public.maw_founder_testimonials;
-- create policy "Read published testimonials" on public.maw_founder_testimonials
--   for select to authenticated
--   using (is_published = true);
