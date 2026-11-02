-- Sala de aprovação: update to the November 2026 schema, for a room installed from the earlier schema.sql.
-- Paste it once in the SQL Editor and Run. It only adds: columns, tables, indexes, functions and access rules, and it
-- replaces three things in place (who sees which items, the rule of which options the client sees, and
-- confirm_round). No row is changed or deleted. Running it again changes nothing.
-- Afterwards the database is the same as one made from scratch with the current schema.sql.
--
-- What it brings: versions inside each round (rounds.version, options.version/based_on) with the per-version rule of
-- what the client sees; the team's reading of the client's answers (item_feedback, feedback_refs, tasks, pendencias,
-- round_notes); what goes in each delivery (envio); drawings on images (annotations); the studio (estudio_jobs and the
-- key lookup for its edge function); the 3D sets (blocking_shots, cena3d).
-- Existing rounds start at version 1 and existing options belong to version 1, so the client sees the same options it
-- saw. One visible change: a sent item with no option to show (none uploaded yet, or all dropped) no longer appears.

begin;

-- ---------- new columns ----------
alter table public.rounds add column if not exists version integer not null default 1;

alter table public.options add column if not exists version integer not null default 1;
alter table public.options add column if not exists based_on uuid;
alter table public.options add column if not exists stack uuid;
alter table public.options add column if not exists face uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.options'::regclass and conname = 'options_based_on_fkey') then
    alter table public.options add constraint options_based_on_fkey foreign key (based_on) references public.options (id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.options'::regclass and conname = 'options_stack_fkey') then
    alter table public.options add constraint options_stack_fkey foreign key (stack) references public.options (id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.options'::regclass and conname = 'options_face_fkey') then
    alter table public.options add constraint options_face_fkey foreign key (face) references public.options (id) on delete set null;
  end if;
end $$;

-- ---------- new tables (same definitions and comments as in schema.sql) ----------
-- The "Retorno" of a round: how the team reads what the client said about each item, in the room, in a call, in a deck
-- or in a chat. One row per round, item and version: version is the version the client talked about (v1), answered in
-- the next one (v2).
create table if not exists public.item_feedback (
  round_id text not null references public.rounds (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  version integer not null default 1,
  status text not null check (status in ('aprovado', 'ajustar', 'refazer', 'novo', 'espera')), -- approved, adjust, redo, new direction, waiting for the client
  summary text not null default '' check (length(summary) <= 200),
  base_option uuid references public.options (id) on delete set null, -- the option the client approved or wants adjusted
  base_note text not null default '' check (length(base_note) <= 300),
  notes text not null default '' check (length(notes) <= 2000),        -- the team's own notes, one per line
  client_extra text not null default '' check (length(client_extra) <= 2000), -- what the client asked outside the room, one per line
  next_round text not null default '' check (length(next_round) <= 80),
  updated_at timestamptz not null default now(),
  primary key (round_id, item_id, version)
);

-- References the client gave for an item (an image, a video at a given second, a link), and where they came from.
create table if not exists public.feedback_refs (
  id uuid primary key default gen_random_uuid(),
  round_id text not null references public.rounds (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  version integer not null default 1,
  source text not null check (source in ('deck', 'sala', 'whatsapp', 'conversa', 'nossa', 'material')),
  kind text not null check (kind in ('image', 'video', 'link')),
  label text not null default '' check (length(label) <= 200),
  path text,                           -- a file in the bucket, or
  url text,                            -- a link
  t_sec integer check (t_sec >= 0),    -- for a video: the second that matters
  cited boolean not null default false,
  sort double precision not null default extract(epoch from clock_timestamp()),
  created_at timestamptz not null default now(),
  check (path is not null or url is not null)
);

-- The team's tasks for a round (on an item, or on the round as a whole).
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  round_id text not null references public.rounds (id) on delete cascade,
  item_id uuid references public.items (id) on delete cascade,
  version integer not null default 1,
  text text not null check (length(text) between 1 and 300),
  done boolean not null default false,
  assignee text check (length(assignee) between 1 and 40),             -- a key of PEOPLE (config.js)
  sort double precision not null default extract(epoch from clock_timestamp()),
  created_at timestamptz not null default now()
);

-- What is still open with the client ("pendências"): something to ask, to receive, or to decide.
create table if not exists public.pendencias (
  id uuid primary key default gen_random_uuid(),
  round_id text not null references public.rounds (id) on delete cascade,
  item_id uuid references public.items (id) on delete cascade,
  version integer not null default 1,
  kind text not null check (kind in ('perguntar', 'receber', 'decidir')),
  text text not null check (length(text) between 1 and 500),
  answer text not null default '' check (length(answer) <= 1000),
  resolved boolean not null default false,
  sort double precision not null default extract(epoch from clock_timestamp()),
  created_at timestamptz not null default now()
);

-- What was agreed with the client about a round as a whole.
create table if not exists public.round_notes (
  round_id text primary key references public.rounds (id) on delete cascade,
  body text not null default '' check (length(body) <= 4000),
  updated_at timestamptz not null default now()
);

-- What goes to the client in each version of a round, decided by hand on the page. A row here beats the rule in
-- option_dropped(): include = true shows the option in that version, false hides it. nova marks an extra put straight
-- into the delivery for the team to compare (tagged in the client room only for the team's admin view).
create table if not exists public.envio (
  option_id uuid not null references public.options (id) on delete cascade,
  version integer not null,
  include boolean not null,
  nova boolean not null default false,
  by text not null default '',
  updated_at timestamptz not null default now(),
  primary key (option_id, version)
);

-- What someone drew or wrote on an image: strokes and pins in 0–1 image coordinates, plus what to change in words.
-- The client's drawings are seen by the client and the team; the team's stay internal.
create table if not exists public.annotations (
  id uuid primary key default gen_random_uuid(),
  option_id uuid not null references public.options (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  side text not null check (side in ('time', 'cliente')),
  author text not null default '',
  strokes jsonb not null default '[]',
  notes jsonb not null default '[]',
  body text not null default '',
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

-- A generation the team asked the studio for (team only). The edge function `estudio` submits it to the image/video
-- API and keeps the status; the browser imports the result into the item as new options and records them in
-- `imported`, so a closed tab never loses a finished generation.
--   mode: edit (a new card from an option), create (from scratch), video, version (the result joins the edited
--         image's card), ref (an edit of a reference: it stacks onto the asset without moving its face)
create table if not exists public.estudio_jobs (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  base_option uuid references public.options (id) on delete set null,
  mode text not null default 'edit' check (mode in ('edit', 'create', 'video', 'version', 'ref')),
  model text not null,
  label text not null default '',
  prompt text not null default '',
  input jsonb not null default '{}',
  refs jsonb not null default '[]',
  request_id text,                     -- the provider's id for the job
  status text not null default 'queued',
  error text,
  result jsonb,
  imported jsonb not null default '[]', -- ids of the options made from the result
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Cena 3D: the team's low-poly blocking set of an approved location (sala/cena3d/), team only. The angles the team
-- saves go into the location item as ordinary options (no ✓, so the client does not see them until someone checks
-- one), and the studio reads blocking_shots to render them with AI.
-- One saved angle: the option (PNG 16:9) plus everything the studio needs to dress it with the references.
--   camera:          {position: [x,y,z], target: [x,y,z], fov (vertical, degrees), lens_mm (35 mm equivalent)}
--   cast:            [{item_id, option_id (the approved casting image), name, pose, color, box}], box = where the
--                    figure sits in the frame, 0–1 from the top left: {x0, y0, x1, y1}
--   location_option: the approved location image the set copies
--   device:          {position, rotation, scale, attach, box} of the product/prop in the shot, or null when it is not in it
create table if not exists public.blocking_shots (
  option_id uuid primary key references public.options (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  scene integer not null,
  camera jsonb not null,
  "cast" jsonb not null default '[]',
  location_option uuid references public.options (id) on delete set null,
  device jsonb,
  created_by text not null default '',
  created_at timestamptz not null default now()
);

-- The editable state of each set (where the cast, the device and the camera are), saved as the team works.
create table if not exists public.cena3d (
  item_id uuid primary key references public.items (id) on delete cascade,
  state jsonb not null default '{}',
  updated_by text not null default '',
  updated_at timestamptz not null default now()
);

create index if not exists options_based_on on public.options (based_on);
create index if not exists options_stack_idx on public.options (stack);
create index if not exists item_feedback_item on public.item_feedback (item_id);
create index if not exists feedback_refs_item on public.feedback_refs (item_id);
create index if not exists tasks_item on public.tasks (item_id);
create index if not exists pendencias_item on public.pendencias (item_id);
create index if not exists annotations_option_idx on public.annotations (option_id);
create index if not exists estudio_jobs_item_idx on public.estudio_jobs (item_id, created_at desc);
create index if not exists blocking_shots_item_idx on public.blocking_shots (item_id, created_at desc);

-- ---------- what the client must not see ----------
-- true when the client does not see the option. Per version of the round (rounds.version):
--   v1:       everything not dropped, until the team checks (✓ keep) an option of the item; then only the checked ones.
--   v2 on:    the team's ✓ on options of this version, plus what the client picked in the last one: by click
--             (items.chosen_option) or, in the team's reading of its answer, item_feedback.base_option of the previous
--             version when that feedback is 'aprovado' or 'ajustar'; plus the whole kept set of an item in 'set' mode
--             that the client approved (by click, or 'aprovado' in the feedback).
--   always:   a 'drop' hides; a row in envio for this version beats all of the above (include true shows, false hides).
-- An item with nothing to show does not go (item_shown). The team room mirrors this rule, so both rooms give the same
-- letter to the same image. Security definer because the client cannot read option_reviews, item_feedback or envio.
create or replace function public.option_dropped(p_option uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  with o as (
    select o.id, o.item_id, coalesce(o.version, 1) as v, i.round_id, i.chosen_option, i.decision, i.mode,
           coalesce(r.version, 1) as rv, (select verdict from public.option_reviews where option_id = o.id) as verdict
    from public.options o join public.items i on i.id = o.item_id join public.rounds r on r.id = i.round_id
    where o.id = p_option
  ), f as (
    select f.status, f.base_option
    from public.item_feedback f join o on f.round_id = o.round_id and f.item_id = o.item_id and f.version = o.rv - 1
  )
  select not coalesce(
    (select e.include from public.envio e join o on e.option_id = o.id and e.version = o.rv),
    (select case
      when o.verdict = 'drop' then false
      when o.rv = 1 then o.verdict = 'keep' or not exists (
        select 1 from public.options o2 join public.option_reviews r2 on r2.option_id = o2.id and r2.verdict = 'keep'
        where o2.item_id = o.item_id)
      else (o.verdict = 'keep' and o.v = o.rv) or o.id = o.chosen_option
        or exists (select 1 from f where f.status in ('aprovado', 'ajustar') and f.base_option = o.id)
        or (o.mode = 'set' and o.verdict = 'keep' and o.v < o.rv
            and (o.decision = 'approved' or exists (select 1 from f where f.status = 'aprovado')))
    end from o),
    false);
$$;

-- The client sees an item that was sent (visible) and has something to show in this version.
create or replace function public.item_shown(p_item uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.items where id = p_item and visible)
     and exists (select 1 from public.options where item_id = p_item and not public.option_dropped(id));
$$;

-- ---------- row-level security ----------
alter table public.item_feedback enable row level security;
alter table public.feedback_refs enable row level security;
alter table public.tasks enable row level security;
alter table public.pendencias enable row level security;
alter table public.round_notes enable row level security;
alter table public.envio enable row level security;
alter table public.annotations enable row level security;
alter table public.estudio_jobs enable row level security;
alter table public.blocking_shots enable row level security;
alter table public.cena3d enable row level security;

-- items: the client now sees a sent item only when it has something to show in the round's version
drop policy if exists items_select on public.items;
create policy items_select on public.items for select to authenticated
  using ((select is_team()) or ((select is_client()) and public.item_shown(id)));

-- the new team-only tables
drop policy if exists item_feedback_team on public.item_feedback;
create policy item_feedback_team on public.item_feedback for all to authenticated
  using ((select is_team())) with check ((select is_team()));
drop policy if exists feedback_refs_team on public.feedback_refs;
create policy feedback_refs_team on public.feedback_refs for all to authenticated
  using ((select is_team())) with check ((select is_team()));
drop policy if exists tasks_team on public.tasks;
create policy tasks_team on public.tasks for all to authenticated
  using ((select is_team())) with check ((select is_team()));
drop policy if exists pendencias_team on public.pendencias;
create policy pendencias_team on public.pendencias for all to authenticated
  using ((select is_team())) with check ((select is_team()));
drop policy if exists round_notes_team on public.round_notes;
create policy round_notes_team on public.round_notes for all to authenticated
  using ((select is_team())) with check ((select is_team()));
drop policy if exists envio_team on public.envio;
create policy envio_team on public.envio for all to authenticated
  using ((select is_team())) with check ((select is_team()));
drop policy if exists estudio_jobs_team on public.estudio_jobs;
create policy estudio_jobs_team on public.estudio_jobs for all to authenticated
  using ((select is_team())) with check ((select is_team()));
drop policy if exists blocking_shots_team on public.blocking_shots;
create policy blocking_shots_team on public.blocking_shots for all to authenticated
  using ((select is_team())) with check ((select is_team()));
drop policy if exists cena3d_team on public.cena3d;
create policy cena3d_team on public.cena3d for all to authenticated
  using ((select is_team())) with check ((select is_team()));

-- annotations: the team reads and manages all of them and draws as itself. The client draws on the options it can
-- see, reads only its own drawings (never the team's) and removes only its own; it cannot edit them.
drop policy if exists annotations_team_select on public.annotations;
create policy annotations_team_select on public.annotations for select to authenticated using ((select is_team()));
drop policy if exists annotations_team_insert on public.annotations;
create policy annotations_team_insert on public.annotations for insert to authenticated
  with check ((select is_team()) and side = 'time');
drop policy if exists annotations_team_update on public.annotations;
create policy annotations_team_update on public.annotations for update to authenticated
  using ((select is_team())) with check ((select is_team()));
drop policy if exists annotations_team_delete on public.annotations;
create policy annotations_team_delete on public.annotations for delete to authenticated using ((select is_team()));
drop policy if exists annotations_client_select on public.annotations;
create policy annotations_client_select on public.annotations for select to authenticated
  using ((select is_client()) and side = 'cliente' and public.item_shown(item_id) and not public.option_dropped(option_id));
drop policy if exists annotations_client_insert on public.annotations;
create policy annotations_client_insert on public.annotations for insert to authenticated
  with check ((select is_client()) and side = 'cliente' and public.item_shown(item_id) and not public.option_dropped(option_id)
    and exists (select 1 from public.options o where o.id = annotations.option_id and o.item_id = annotations.item_id));
drop policy if exists annotations_client_delete on public.annotations;
create policy annotations_client_delete on public.annotations for delete to authenticated
  using ((select is_client()) and side = 'cliente' and public.item_shown(item_id) and not public.option_dropped(option_id));

-- ---------- functions ----------
-- Close a round: only the client confirms. (Same behavior as before; the message no longer names anyone.)
create or replace function public.confirm_round(p_round text, p_who text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_client() then raise exception 'only the client confirms a round'; end if;
  update public.rounds set confirmed_at = now(), confirmed_by = left(coalesce(nullif(trim(p_who), ''), 'Cliente'), 60) where id = p_round;
end $$;

-- ---------- the studio's API key (server side only) ----------
-- The edge function `estudio` (supabase/functions/estudio) needs the image/video API key. The simplest way is an Edge
-- Function secret named HF_KEY (Dashboard → Edge Functions → Secrets); the function reads it first. If you prefer
-- Vault, store it there under the name 'HF_KEY', typing it in the SQL Editor only (never in a file or a migration):
--   select vault.create_secret('<the key>', 'HF_KEY');
-- and the edge function reads it through estudio_hf_key(), which only the service role can call: the browser (anon or
-- either login) never can. Without Vault, or without the secret, it returns null.
create or replace function public.estudio_hf_key() returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  return (select decrypted_secret from vault.decrypted_secrets where name = 'HF_KEY' limit 1);
exception when undefined_table or invalid_schema_name then
  return null;
end $$;

-- Supabase grants new functions to anon by default: these run only for a signed-in user (and the service role).
revoke execute on function public.decide(uuid, uuid, text, text) from public, anon;
revoke execute on function public.confirm_round(text, text) from public, anon;
revoke execute on function public.set_request_note(uuid, text) from public, anon;
revoke execute on function public.option_dropped(uuid) from public, anon;
revoke execute on function public.item_shown(uuid) from public, anon;
grant execute on function public.decide(uuid, uuid, text, text) to authenticated, service_role;
grant execute on function public.confirm_round(text, text) to authenticated, service_role;
grant execute on function public.set_request_note(uuid, text) to authenticated, service_role;
grant execute on function public.option_dropped(uuid) to authenticated, service_role;
grant execute on function public.item_shown(uuid) to authenticated, service_role;
revoke all on function public.estudio_hf_key() from public, anon, authenticated;
grant execute on function public.estudio_hf_key() to service_role;

commit;
