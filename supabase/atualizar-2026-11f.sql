-- Sala de aprovação: an etiqueta can also mark one image of a card (the one a cut used), and an etiqueta can be the
-- room's default filter, after atualizar-2026-11e.sql.
-- Paste it once in the SQL Editor and Run. It only adds a table (which image has which etiqueta, team only) and a
-- column (labels.padrao). No row is changed or deleted. Running it again changes nothing.
-- Afterwards the database is the same as one made from scratch with the current schema.sql.
-- A job that shares a project (config.js SCHEMA, BUCKET, JOB) runs it through job.py:
--   python3 supabase/job.py <schema> <job> <bucket> supabase/atualizar-2026-11f.sql > job-update.sql

begin;

-- an etiqueta on one image: with the etiqueta's filter on, that card shows only its marked images (the others stay,
-- one click away); deleting the image or the etiqueta takes the mark along, never the other one
create table if not exists public.option_labels (
  option_id uuid not null references public.options (id) on delete cascade,
  label_id uuid not null references public.labels (id) on delete cascade,
  added_by text not null default '',
  added_at timestamptz not null default now(),
  primary key (option_id, label_id)
);
create index if not exists option_labels_label_idx on public.option_labels (label_id);

alter table public.option_labels enable row level security;
drop policy if exists option_labels_team on public.option_labels;
create policy option_labels_team on public.option_labels for all to authenticated
  using ((select is_team())) with check ((select is_team()));

-- the etiqueta(s) the team's room opens filtered by (Filtros › Etiquetas: the pin)
alter table public.labels add column if not exists padrao boolean not null default false;

commit;
