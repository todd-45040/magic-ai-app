-- Phase 6 — Admin Ops polish
-- Lightweight notes/audit trail for anomalies, failures, users, etc.

create table if not exists public.admin_ops_notes (
  id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid null,
  entity_type text not null,
  entity_id text not null,
  note text not null default '',
  resolved boolean not null default false,
  resolved_at timestamptz null,
  constraint admin_ops_notes_pkey primary key (id)
);

create index if not exists admin_ops_notes_entity_idx
  on public.admin_ops_notes (entity_type, entity_id);

create index if not exists admin_ops_notes_created_at_idx
  on public.admin_ops_notes (created_at desc);

-- Optional: if you want to lock this to admins only, you can enable RLS and add policies.
-- (Admin API routes already use service-role key.)
-- alter table public.admin_ops_notes enable row level security;
