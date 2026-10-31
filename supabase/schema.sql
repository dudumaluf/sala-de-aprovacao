-- Sala de aprovação: the whole database (tables, access rules, functions and the file bucket).
-- Run it once, in the SQL Editor of a new Supabase project. Then create the two logins (see README).
--
-- Who is who: each of the two logins carries app_metadata.side = 'time' (the team) or 'cliente' (the client).
-- app_metadata can only be set with the service key (dashboard or SQL), never by the user, so it is safe to trust.
-- Every rule below is keyed on that side. Anyone else who manages to sign in gets no rows at all.

-- ---------- who is signed in ----------
create or replace function public.side() returns text
language sql stable set search_path = '' as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'side', '')
$$;
create or replace function public.is_team() returns boolean
language sql stable set search_path = '' as $$ select public.side() = 'time' $$;
create or replace function public.is_client() returns boolean
language sql stable set search_path = '' as $$ select public.side() = 'cliente' $$;

-- ---------- tables ----------
-- A round (A1, A2, ... Entrega) is one batch the client decides and confirms. The team room creates them from config.js.
create table public.rounds (
  id text primary key,                 -- goes in the URL: #/r/a1
  code text not null,
  title text not null,
  due date not null,
  sort integer not null default 0,
  intro text not null default '',      -- shown on the round's cover, to the client
  reply_by timestamptz,                -- optional answer deadline
  sent_at timestamptz,                 -- last time the team sent items
  confirmed_at timestamptz,            -- the client closed the round
  confirmed_by text
);

-- An item is one decision: a casting, a location, a look... with its options.
-- The client sees it only once the team sends it (visible = true).
create table public.items (
  id uuid primary key default gen_random_uuid(),
  round_id text not null references public.rounds (id) on delete cascade,
  scene integer not null default 0,    -- position in SCENES (config.js)
  kind text not null check (length(kind) between 1 and 40),             -- a key of KINDS (config.js)
  title text not null check (length(title) between 1 and 120),
  brief text not null default '',
  assignee text check (length(assignee) between 1 and 40),             -- a key of PEOPLE (config.js)
  status text not null default 'todo' check (status in ('todo', 'doing', 'ready')),
  visible boolean not null default false,
  mode text not null default 'choose' check (mode in ('choose', 'set')), -- choose one option, or approve the set
  decision text not null default 'pending' check (decision in ('pending', 'approved', 'changes')),
  chosen_option uuid,                  -- foreign key added below, once options exists
  decided_by text,
  decided_at timestamptz,
  refs uuid[] not null default '{}',   -- request_files ids: photos for Compare, voice takes to play next to the options
  variants jsonb not null default '{}', -- {"A": "who or where", ...}: turned into prompts with PROMPTS (config.js)
  sort integer not null default 0,
  created_at timestamptz not null default now()
);

-- An option is one image or video of an item. The original stays at path; preview and thumb are JPEGs made in the browser.
create table public.options (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  caption text not null default '',    -- one line the client sees
  path text not null,
  preview_path text,
  thumb_path text,
  mime text not null default '',
  name text not null default '',
  prompt text not null default '',     -- team only in the UI: how it was generated
  model text not null default '',
  reasoning text not null default '' check (length(reasoning) <= 1000), -- why this option works for the scene
  refs jsonb not null default '[]',    -- team only in the UI: the images that went into it, [{"label", "path", "thumb"}] in the bucket
  created_by text,
  sort double precision not null default extract(epoch from clock_timestamp()), -- upload order
  created_at timestamptz not null default now()
);

alter table public.items
  add constraint items_chosen_option_fkey foreign key (chosen_option) references public.options (id) on delete set null;

-- The team's private verdict on an option. 'drop' hides it from the client; once any option of an item is
-- 'keep', the client sees only the kept ones (see option_dropped below).
create table public.option_reviews (
  option_id uuid primary key references public.options (id) on delete cascade,
  verdict text check (verdict in ('keep', 'redo', 'drop')),
  note text not null default '' check (length(note) <= 2000),
  author text not null default '' check (length(author) <= 60),
  updated_at timestamptz not null default now()
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  author text not null check (length(author) between 1 and 60),
  side text not null check (side in ('time', 'cliente')),
  body text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

-- What the team asks the client for (photos, voices, logos...), and the files that come back.
create table public.requests (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 120),
  detail text not null default '',
  note text not null default '',       -- a link or a remark; the client writes it through set_request_note()
  done boolean not null default false,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.request_files (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  path text not null,
  preview_path text,
  thumb_path text,
  name text not null,
  mime text not null default '',
  size bigint not null default 0,
  uploaded_by text not null default '',
  side text not null check (side in ('time', 'cliente')),
  created_at timestamptz not null default now()
);

create index items_round_idx on public.items (round_id, scene, sort);
create index items_chosen_idx on public.items (chosen_option);
create index options_item_idx on public.options (item_id);
create index comments_item_idx on public.comments (item_id, created_at);
create index request_files_req_idx on public.request_files (request_id);

-- ---------- what the client must not see ----------
-- An option is out for the client when the team dropped it, or when the team kept (✓) other options of the same
-- item and not this one. Security definer because the client cannot read option_reviews (team only).
create or replace function public.option_dropped(p_option uuid) returns boolean
language sql stable security definer set search_path = 'public' as $$
  select exists (select 1 from option_reviews where option_id = p_option and verdict = 'drop')
      or (
        not exists (select 1 from option_reviews where option_id = p_option and verdict = 'keep')
        and exists (
          select 1 from options o
          join options o2 on o2.item_id = o.item_id
          join option_reviews r on r.option_id = o2.id and r.verdict = 'keep'
          where o.id = p_option
        )
      );
$$;

-- ---------- row-level security ----------
-- (select is_team()) instead of is_team(): evaluated once per query, not once per row.
alter table public.rounds enable row level security;
alter table public.items enable row level security;
alter table public.options enable row level security;
alter table public.option_reviews enable row level security;
alter table public.comments enable row level security;
alter table public.requests enable row level security;
alter table public.request_files enable row level security;

-- rounds: both sides read; only the team writes (the client confirms through confirm_round())
create policy rounds_select on public.rounds for select to authenticated using ((select is_team()) or (select is_client()));
create policy rounds_insert on public.rounds for insert to authenticated with check ((select is_team()));
create policy rounds_update on public.rounds for update to authenticated using ((select is_team())) with check ((select is_team()));
create policy rounds_delete on public.rounds for delete to authenticated using ((select is_team()));

-- items: the client sees only what was sent; only the team writes (the client decides through decide())
create policy items_select on public.items for select to authenticated
  using ((select is_team()) or ((select is_client()) and visible));
create policy items_insert on public.items for insert to authenticated with check ((select is_team()));
create policy items_update on public.items for update to authenticated using ((select is_team())) with check ((select is_team()));
create policy items_delete on public.items for delete to authenticated using ((select is_team()));

-- options: the client sees the options of sent items, minus the dropped ones (and only the kept ones, when there are)
create policy options_select on public.options for select to authenticated
  using ((select is_team()) or (
    (select is_client())
    and exists (select 1 from public.items i where i.id = options.item_id and i.visible)
    and not public.option_dropped(id)
  ));
create policy options_insert on public.options for insert to authenticated with check ((select is_team()));
create policy options_update on public.options for update to authenticated using ((select is_team())) with check ((select is_team()));
create policy options_delete on public.options for delete to authenticated using ((select is_team()));

-- option_reviews: team only, the client never knows what was dropped or why
create policy option_reviews_team on public.option_reviews for all to authenticated
  using ((select is_team())) with check ((select is_team()));

-- comments: each side writes as itself; the client only on sent items; nobody edits, only the team deletes
create policy comments_select on public.comments for select to authenticated
  using ((select is_team()) or ((select is_client()) and exists (select 1 from public.items i where i.id = comments.item_id and i.visible)));
create policy comments_insert on public.comments for insert to authenticated
  with check (side = (select public.side()) and ((select is_team()) or ((select is_client())
    and exists (select 1 from public.items i where i.id = comments.item_id and i.visible))));
create policy comments_delete on public.comments for delete to authenticated using ((select is_team()));

-- requests: both read; the team asks, edits and deletes (the client fills the note through set_request_note())
create policy requests_select on public.requests for select to authenticated using ((select is_team()) or (select is_client()));
create policy requests_insert on public.requests for insert to authenticated with check ((select is_team()));
create policy requests_update on public.requests for update to authenticated using ((select is_team())) with check ((select is_team()));
create policy requests_delete on public.requests for delete to authenticated using ((select is_team()));

-- request_files: both upload as themselves; the client can remove only what the client sent
create policy request_files_select on public.request_files for select to authenticated using ((select is_team()) or (select is_client()));
create policy request_files_insert on public.request_files for insert to authenticated
  with check (side = (select public.side()) and ((select is_team()) or (select is_client())));
create policy request_files_delete on public.request_files for delete to authenticated
  using ((select is_team()) or ((select is_client()) and side = 'cliente'));

-- ---------- what the client can do (and nothing more) ----------
-- Pick, approve or ask for changes on one item. The team uses it too (to reopen a decision).
create or replace function public.decide(p_item uuid, p_option uuid, p_decision text, p_who text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (public.is_team() or public.is_client()) then raise exception 'not allowed'; end if;
  if p_decision not in ('pending', 'approved', 'changes') then raise exception 'bad decision'; end if;
  if not exists (select 1 from public.items where id = p_item and (visible or public.is_team())) then
    raise exception 'item not found';
  end if;
  if p_option is not null and not exists (select 1 from public.options where id = p_option and item_id = p_item) then
    raise exception 'option not in item';
  end if;
  update public.items
     set chosen_option = p_option, decision = p_decision,
         decided_by = nullif(left(coalesce(p_who, ''), 60), ''), decided_at = now()
   where id = p_item;
end $$;

-- Close a round: only the client confirms.
create or replace function public.confirm_round(p_round text, p_who text) returns void
language plpgsql security definer set search_path = 'public' as $$
begin
  if not (select is_client()) then raise exception 'only the client confirms a round'; end if;
  update public.rounds set confirmed_at = now(), confirmed_by = left(coalesce(nullif(trim(p_who), ''), 'Cliente'), 60) where id = p_round;
end $$;

-- The link or remark on a request: the only column of requests the client may change.
create or replace function public.set_request_note(p_request uuid, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (public.is_team() or public.is_client()) then raise exception 'not allowed'; end if;
  update public.requests set note = left(coalesce(p_note, ''), 2000) where id = p_request;
end $$;

-- Supabase grants new functions to anon by default: these run only for a signed-in user.
revoke execute on function public.decide(uuid, uuid, text, text) from public, anon;
revoke execute on function public.confirm_round(text, text) from public, anon;
revoke execute on function public.set_request_note(uuid, text) from public, anon;
revoke execute on function public.option_dropped(uuid) from public, anon;
grant execute on function public.decide(uuid, uuid, text, text) to authenticated;
grant execute on function public.confirm_round(text, text) to authenticated;
grant execute on function public.set_request_note(uuid, text) to authenticated;
grant execute on function public.option_dropped(uuid) to authenticated;

-- ---------- files ----------
-- One private bucket. The app reads through signed URLs (12 h). Layout: items/<item id>/... for options (team),
-- requests/<request id>/... for materials (both sides). 50 MB per file, the free plan's limit.
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', false, 52428800)
on conflict (id) do nothing;

create policy media_select on storage.objects for select to authenticated
  using (bucket_id = 'media' and ((select public.is_team()) or (select public.is_client())));
create policy media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and ((select public.is_team())
    or ((select public.is_client()) and (storage.foldername(name))[1] = 'requests')));
create policy media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and ((select public.is_team())
    or ((select public.is_client()) and (storage.foldername(name))[1] = 'requests')));
