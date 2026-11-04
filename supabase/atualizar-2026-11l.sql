-- Sala de aprovação: packages only the team sees (a scene's materials), after atualizar-2026-11k.sql.
-- Paste it once in the SQL Editor and Run. It adds two columns to requests: team_only (the package is the team's own:
-- the client never receives it, nor its files and notes) and scene (the scene a package belongs to, for the studio's
-- picker). The client's policies on requests, request_files and request_notes, and set_request_note(), skip team_only
-- packages; what the client sees today does not change. No row is changed or deleted. Running it again changes nothing.
-- Afterwards the database is the same as one made from scratch with the current schema.sql.
-- A job that shares a project (config.js SCHEMA, BUCKET, JOB) runs it through job.py:
--   python3 supabase/job.py <schema> <job> <bucket> supabase/atualizar-2026-11l.sql > job-update.sql

begin;

alter table public.requests add column if not exists team_only boolean not null default false;
alter table public.requests add column if not exists scene integer;

drop policy if exists requests_select on public.requests;
create policy requests_select on public.requests for select to authenticated using ((select is_team()) or ((select is_client()) and not team_only));

drop policy if exists request_files_select on public.request_files;
drop policy if exists request_files_insert on public.request_files;
drop policy if exists request_files_delete on public.request_files;
create policy request_files_select on public.request_files for select to authenticated
  using ((select is_team()) or ((select is_client()) and exists (select 1 from public.requests r where r.id = request_files.request_id and not r.team_only)));
create policy request_files_insert on public.request_files for insert to authenticated
  with check (side = (select public.side()) and ((select is_team())
    or ((select is_client()) and exists (select 1 from public.requests r where r.id = request_files.request_id and not r.team_only))));
create policy request_files_delete on public.request_files for delete to authenticated
  using ((select is_team()) or ((select is_client()) and side = 'cliente'
    and exists (select 1 from public.requests r where r.id = request_files.request_id and not r.team_only)));

drop policy if exists request_notes_select on public.request_notes;
drop policy if exists request_notes_insert on public.request_notes;
drop policy if exists request_notes_update on public.request_notes;
drop policy if exists request_notes_delete on public.request_notes;
create policy request_notes_select on public.request_notes for select to authenticated
  using ((select is_team()) or ((select is_client()) and exists (select 1 from public.requests r where r.id = request_notes.request_id and not r.team_only)));
create policy request_notes_insert on public.request_notes for insert to authenticated
  with check (side = (select public.side()) and ((select is_team())
    or ((select is_client()) and exists (select 1 from public.requests r where r.id = request_notes.request_id and not r.team_only))));
create policy request_notes_update on public.request_notes for update to authenticated
  using ((select is_team()) or ((select is_client()) and side = 'cliente'
    and exists (select 1 from public.requests r where r.id = request_notes.request_id and not r.team_only)))
  with check ((select is_team()) or ((select is_client()) and side = 'cliente'
    and exists (select 1 from public.requests r where r.id = request_notes.request_id and not r.team_only)));
create policy request_notes_delete on public.request_notes for delete to authenticated
  using ((select is_team()) or ((select is_client()) and side = 'cliente'
    and exists (select 1 from public.requests r where r.id = request_notes.request_id and not r.team_only)));

-- The link or remark on a request: the only column of requests the client may change (never on a team_only package).
create or replace function public.set_request_note(p_request uuid, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (public.is_team() or public.is_client()) then raise exception 'not allowed'; end if;
  update public.requests set note = left(coalesce(p_note, ''), 2000) where id = p_request and (public.is_team() or not team_only);
end $$;

commit;
