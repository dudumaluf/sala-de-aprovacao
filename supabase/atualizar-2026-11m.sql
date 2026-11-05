-- 04/11 · the same file in several places, shown once (team).
-- A file copied in storage (a scene package's copy of a card's image, a file taken into a card from outside, the same
-- file uploaded twice) keeps its content, so storage keeps the same eTag and size for it. The team's lists (the Galeria,
-- the studio's +) show each file once: file_twins() returns every group of rows that share one file, as refs
-- ("o:<option id>" or "f:<request file id>"), only the groups of two or more. Nothing is merged or deleted: each card and
-- each package keeps its own row and its own copy.
-- Team only; it reads storage.objects' metadata, so it runs as its owner. p_bucket: the room's bucket (config BUCKET).
-- Safe to run more than once.
begin;

create or replace function public.file_twins(p_bucket text default 'media') returns table (refs text[])
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_team() then raise exception 'team only'; end if;
  return query
  with e as (
    select 'o:' || o.id::text as ref, so.metadata->>'eTag' as etag, (so.metadata->>'size')::bigint as sz
    from public.options o join storage.objects so on so.bucket_id = p_bucket and so.name = o.path
    union all
    select 'f:' || f.id::text, so.metadata->>'eTag', (so.metadata->>'size')::bigint
    from public.request_files f join storage.objects so on so.bucket_id = p_bucket and so.name = f.path
  )
  select array_agg(e.ref order by e.ref) from e where e.etag is not null group by e.etag, e.sz having count(*) > 1;
end $$;

revoke execute on function public.file_twins(text) from public, anon;
grant execute on function public.file_twins(text) to authenticated, service_role;

commit;
