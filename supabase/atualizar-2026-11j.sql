-- Sala de aprovação: a card keeps its kit for the studio, after atualizar-2026-11i.sql.
-- Paste it once in the SQL Editor and Run. It adds one table, team only: item_kits, one row per card with what the
-- studio's Guardar no card saved (the references in order, the prompt, the model, the duration and the resolution).
-- The card's ✦ then opens the studio already like that. No row is changed or deleted. Running it again changes nothing.
-- Afterwards the database is the same as one made from scratch with the current schema.sql.
-- A job that shares a project (config.js SCHEMA, BUCKET, JOB) runs it through job.py:
--   python3 supabase/job.py <schema> <job> <bucket> supabase/atualizar-2026-11j.sql > job-update.sql

begin;

create table if not exists public.item_kits (
  item_id uuid primary key references public.items (id) on delete cascade,
  kit jsonb not null default '{}',   -- { kind, model, dur, vres, vaspect, sound, aspect, res, refs: [{ path, preview, thumb_path, label, kind }], prompt }
  updated_by text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.item_kits enable row level security;
drop policy if exists item_kits_team on public.item_kits;
create policy item_kits_team on public.item_kits for all to authenticated
  using ((select is_team())) with check ((select is_team()));

commit;
