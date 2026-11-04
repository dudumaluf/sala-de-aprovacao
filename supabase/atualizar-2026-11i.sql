-- Sala de aprovação: a deleted comment no longer reaches the client at all, after atualizar-2026-11h.sql.
-- Paste it once in the SQL Editor and Run. It only rewrites the comments read policy: the client reads a comment only
-- while it is not deleted (the room hid deleted ones, but the client's browser still downloaded them; a team note
-- deleted by mistake stayed readable). The team still reads everything. Desfazer keeps working: delete_comment() runs
-- as its owner. No row is changed. Running it again changes nothing.
-- Afterwards the database is the same as one made from scratch with the current schema.sql.
-- A job that shares a project (config.js SCHEMA, BUCKET, JOB) runs it through job.py:
--   python3 supabase/job.py <schema> <job> <bucket> supabase/atualizar-2026-11i.sql > job-update.sql

begin;

drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments for select to authenticated
  using ((select is_team()) or ((select is_client()) and deleted_at is null and exists (select 1 from public.items i where i.id = comments.item_id and i.visible)));

commit;
