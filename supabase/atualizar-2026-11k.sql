-- Sala de aprovação: the studio edits a reference that came from outside the room, after atualizar-2026-11j.sql.
-- Paste it once in the SQL Editor and Run. It adds one function, adopt_ref(): a copy of a file the studio holds as a
-- reference (from the computer, a kit or the material; the room has already copied it under the card in storage)
-- becomes an option of that card, out of what the client sees in this version (envio), in one go, so the client never
-- receives it. Its edits in the studio are then versions of it. Team only. No row is changed or deleted. Running it
-- again changes nothing.
-- Afterwards the database is the same as one made from scratch with the current schema.sql.
-- A job that shares a project (config.js SCHEMA, BUCKET, JOB) runs it through job.py:
--   python3 supabase/job.py <schema> <job> <bucket> supabase/atualizar-2026-11k.sql > job-update.sql

begin;

create or replace function public.adopt_ref(p_id uuid, p_item uuid, p_path text, p_preview text, p_thumb text, p_mime text,
  p_name text, p_by text, p_caption text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v integer;
begin
  if not public.is_team() then raise exception 'team only'; end if;
  select coalesce(r.version, 1) into v from public.items i join public.rounds r on r.id = i.round_id where i.id = p_item;
  if v is null then raise exception 'item not found'; end if;
  insert into public.options (id, item_id, path, preview_path, thumb_path, mime, name, created_by, version, caption, reasoning)
  values (p_id, p_item, p_path, p_preview, p_thumb, coalesce(p_mime, ''), left(coalesce(p_name, ''), 120), left(coalesce(p_by, ''), 60), v,
    left(coalesce(p_caption, ''), 140), 'Veio de fora da sala (do computador, de um kit ou do material) e entrou neste card pra ser editada no estúdio. Fica fora do envio.');
  insert into public.envio (option_id, version, include, by, updated_at) values (p_id, v, false, left(coalesce(p_by, ''), 60), now())
  on conflict (option_id, version) do update set include = false, by = excluded.by, updated_at = now();
  return p_id;
end $$;

revoke execute on function public.adopt_ref(uuid, uuid, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.adopt_ref(uuid, uuid, text, text, text, text, text, text, text) to authenticated, service_role;

commit;
