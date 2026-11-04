-- Sala de aprovação: links and texts inside a request (a package in Materiais), after atualizar-2026-11f.sql.
-- Paste it once in the SQL Editor and Run. It adds one table (request_notes: a link or a text in a package, written by
-- either side as itself, like the files) and copies each package's old note (requests.note) into it as its first text,
-- or as a link when the note is only an address. requests.note stays as it was (the room stops showing it). Nothing is
-- deleted. Running it again changes nothing: a package that already has notes is skipped.
-- Afterwards the database is the same as one made from scratch with the current schema.sql, plus the copied notes.
-- A job that shares a project (config.js SCHEMA, BUCKET, JOB) runs it through job.py:
--   python3 supabase/job.py <schema> <job> <bucket> supabase/atualizar-2026-11g.sql > job-update.sql

begin;

-- a link or a text in a package: both sides add them as themselves; the client edits and removes only its own
create table if not exists public.request_notes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  kind text not null check (kind in ('link', 'text')),
  title text not null default '' check (length(title) <= 200),
  url text not null default '' check (length(url) <= 2000),
  body text not null default '' check (length(body) <= 8000),
  added_by text not null default '',
  side text not null check (side in ('time', 'cliente')),
  created_at timestamptz not null default now(),
  check ((kind = 'link' and url <> '') or (kind = 'text' and body <> ''))
);
create index if not exists request_notes_req_idx on public.request_notes (request_id);

alter table public.request_notes enable row level security;
drop policy if exists request_notes_select on public.request_notes;
drop policy if exists request_notes_insert on public.request_notes;
drop policy if exists request_notes_update on public.request_notes;
drop policy if exists request_notes_delete on public.request_notes;
create policy request_notes_select on public.request_notes for select to authenticated using ((select is_team()) or (select is_client()));
create policy request_notes_insert on public.request_notes for insert to authenticated
  with check (side = (select public.side()) and ((select is_team()) or (select is_client())));
create policy request_notes_update on public.request_notes for update to authenticated
  using ((select is_team()) or ((select is_client()) and side = 'cliente'))
  with check ((select is_team()) or ((select is_client()) and side = 'cliente'));
create policy request_notes_delete on public.request_notes for delete to authenticated
  using ((select is_team()) or ((select is_client()) and side = 'cliente'));

-- each package's old note becomes its first text (or link, when it is only an address); the note itself stays
insert into public.request_notes (request_id, kind, url, body, side)
select r.id,
  case when btrim(r.note) ~ '^https?://\S+$' then 'link' else 'text' end,
  case when btrim(r.note) ~ '^https?://\S+$' then btrim(r.note) else '' end,
  case when btrim(r.note) ~ '^https?://\S+$' then '' else btrim(r.note) end,
  'time'
from public.requests r
where btrim(r.note) <> ''
  and not exists (select 1 from public.request_notes n where n.request_id = r.id);

commit;
