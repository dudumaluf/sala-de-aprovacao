-- Sala de aprovação: etiquetas the team makes and puts on cards, each one also a filter, after atualizar-2026-11d.sql.
-- Paste it once in the SQL Editor and Run. It only adds two tables (the etiquetas, and which card has which), both team
-- only. No row is changed or deleted. Running it again changes nothing.
-- Afterwards the database is the same as one made from scratch with the current schema.sql.
-- A job that shares a project (config.js SCHEMA, BUCKET, JOB) runs it through job.py:
--   python3 supabase/job.py <schema> <job> <bucket> supabase/atualizar-2026-11e.sql > job-update.sql

begin;

-- an etiqueta: a name and a color anyone on the team makes; it shows on the cards that have it and becomes a filter
create table if not exists public.labels (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  color text not null default 'teal' check (color in ('teal', 'violet', 'coral', 'amber', 'pink', 'blue', 'green', 'gray')),
  sort double precision not null default extract(epoch from now()),
  created_by text not null default '',
  created_at timestamptz not null default now()
);
-- which card (item) has which etiqueta: deleting an etiqueta or a card takes its marks along, never the other one
create table if not exists public.item_labels (
  item_id uuid not null references public.items (id) on delete cascade,
  label_id uuid not null references public.labels (id) on delete cascade,
  added_by text not null default '',
  added_at timestamptz not null default now(),
  primary key (item_id, label_id)
);
create index if not exists item_labels_label_idx on public.item_labels (label_id);

alter table public.labels enable row level security;
alter table public.item_labels enable row level security;
drop policy if exists labels_team on public.labels;
create policy labels_team on public.labels for all to authenticated
  using ((select is_team())) with check ((select is_team()));
drop policy if exists item_labels_team on public.item_labels;
create policy item_labels_team on public.item_labels for all to authenticated
  using ((select is_team())) with check ((select is_team()));

commit;
