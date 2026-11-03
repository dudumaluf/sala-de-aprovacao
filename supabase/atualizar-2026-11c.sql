-- Sala de aprovação: update for the Galeria's Vídeo filter (after atualizar-2026-11b.sql).
-- Paste it once in the SQL Editor and Run. It only adds one column to options: no row is changed or deleted. Running it
-- again changes nothing. Afterwards the database is the same as one made from scratch with the current schema.sql.
--
-- What it brings: options.role, what a video is (take or cut, comparison, animatic). The team sets it from the Galeria's
-- menu; while it is null the room guesses it from the file name and the model.
-- A job that shares a project (config.js SCHEMA, BUCKET, JOB) runs it through job.py:
--   python3 supabase/job.py <schema> <job> <bucket> supabase/atualizar-2026-11c.sql > job-update.sql

begin;

alter table public.options add column if not exists role text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'options_role_check' and conrelid = 'public.options'::regclass) then
    alter table public.options add constraint options_role_check check (role in ('take', 'compara', 'animatic', 'outro'));
  end if;
end $$;

commit;

notify pgrst, 'reload schema';
