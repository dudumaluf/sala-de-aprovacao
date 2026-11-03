-- Sala de aprovação: comments at a moment of a video (the animatic), after atualizar-2026-11c.sql.
-- Paste it once in the SQL Editor and Run. It only adds two columns to comments (the video and the second a comment was
-- written at) and their index. No row is changed or deleted. Running it again changes nothing.
-- Afterwards the database is the same as one made from scratch with the current schema.sql.
-- A job that shares a project (config.js SCHEMA, BUCKET, JOB) runs it through job.py:
--   python3 supabase/job.py <schema> <job> <bucket> supabase/atualizar-2026-11d.sql > job-update.sql

begin;

-- a comment written on a video at a moment of it (the animatic): the video (an option of the item) and the second
alter table public.comments add column if not exists option_id uuid references public.options (id) on delete set null;
alter table public.comments add column if not exists t_sec double precision;
create index if not exists comments_option_idx on public.comments (option_id);

commit;
