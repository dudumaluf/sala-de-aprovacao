-- Sala de aprovação: each side edits and deletes its own comments, after atualizar-2026-11g.sql.
-- Paste it once in the SQL Editor and Run. It adds three columns to comments (edited_at, deleted_at, deleted_by) and two
-- functions, edit_comment() and delete_comment(). A deleted comment stays in the table with deleted_at set, so it can
-- come back (the room's Desfazer) and nothing anyone wrote is lost; the room just stops showing it. No row is changed.
-- Running it again changes nothing.
-- Afterwards the database is the same as one made from scratch with the current schema.sql.
-- A job that shares a project (config.js SCHEMA, BUCKET, JOB) runs it through job.py:
--   python3 supabase/job.py <schema> <job> <bucket> supabase/atualizar-2026-11h.sql > job-update.sql

begin;

alter table public.comments add column if not exists edited_at timestamptz;
alter table public.comments add column if not exists deleted_at timestamptz;
alter table public.comments add column if not exists deleted_by text not null default '';

-- A comment's text, changed by its own side (the client only on what it can see). The room shows the pencil only on
-- the comments its viewer wrote.
create or replace function public.edit_comment(p_comment uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if length(btrim(coalesce(p_body, ''))) not between 1 and 4000 then raise exception 'a comment has 1 to 4000 characters'; end if;
  update public.comments c set body = btrim(p_body), edited_at = now()
   where c.id = p_comment and c.side = public.side() and c.deleted_at is null
     and (public.is_team() or (public.is_client() and exists (select 1 from public.items i where i.id = c.item_id and i.visible)));
  if not found then raise exception 'comment not found, or not from this side'; end if;
end $$;

-- A comment deleted (p_on) or brought back (not p_on) by its own side: the row stays, with who and when.
create or replace function public.delete_comment(p_comment uuid, p_on boolean, p_who text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.comments c set deleted_at = case when p_on then now() end, deleted_by = case when p_on then left(coalesce(p_who, ''), 60) else '' end
   where c.id = p_comment and c.side = public.side()
     and (public.is_team() or (public.is_client() and exists (select 1 from public.items i where i.id = c.item_id and i.visible)));
  if not found then raise exception 'comment not found, or not from this side'; end if;
end $$;

revoke execute on function public.edit_comment(uuid, text) from public, anon;
revoke execute on function public.delete_comment(uuid, boolean, text) from public, anon;
grant execute on function public.edit_comment(uuid, text) to authenticated, service_role;
grant execute on function public.delete_comment(uuid, boolean, text) to authenticated, service_role;

commit;
