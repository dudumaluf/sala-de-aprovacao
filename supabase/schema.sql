-- Sala de aprovação: the whole database (tables, access rules, functions and the file bucket).
-- Run it once, in the SQL Editor of a new Supabase project. Then create the two logins (see README).
--
-- Who is who: each of the two logins carries app_metadata.side = 'time' (the team) or 'cliente' (the client).
-- app_metadata can only be set with the service key (dashboard or SQL), never by the user, so it is safe to trust.
-- Every rule below is keyed on that side. Anyone else who manages to sign in gets no rows at all.
--
-- What the client reads: the rounds, the items the team sent that have something to show, the options of each item
-- that the per-version rule lets through (option_dropped below), the comments on sent items, the requests and their
-- files, and its own drawings. Everything else here (reviews, the team's reading of the client's answers, tasks,
-- open questions, round notes, what goes in each delivery, studio jobs, 3D sets, the Galeria's groups, Soul IDs,
-- recipes and the cards' etiquetas) is team only.

-- ---------- who is signed in ----------
create or replace function public.side() returns text
language sql stable set search_path = '' as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'side', '')
$$;
create or replace function public.is_team() returns boolean
language sql stable set search_path = '' as $$ select public.side() = 'time' $$;
create or replace function public.is_client() returns boolean
language sql stable set search_path = '' as $$ select public.side() = 'cliente' $$;

-- ---------- the room ----------
-- A round (A1, A2, ... Entrega) is one batch the client decides and confirms. The team room creates them from config.js.
-- A round goes through versions: v1 is the first delivery; when the team answers the client's feedback it moves the
-- round to v2, v3... and the client then sees what the per-version rule picks (see option_dropped below).
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
  confirmed_by text,
  version integer not null default 1   -- the version the client is looking at now
);

-- An item is one decision: a casting, a location, a look... with its options.
-- The client sees it only once the team sends it (visible = true) and it has something to show (item_shown below).
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
-- Each option belongs to the version of the round it was made for. In the team room an image and the edits made on it in
-- the studio are one card: an edit points at the original (stack; an edit of an edit points at the same original), and
-- the original says which member is on the card now (face; null = the original itself). The client still sees options
-- one by one, and an edit only once it passes the per-version rule.
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
  version integer not null default 1,  -- the round version it was made for
  based_on uuid references public.options (id) on delete set null, -- the option of the previous version it answers
  stack uuid references public.options (id) on delete set null,    -- the original this one is an edit of
  face uuid references public.options (id) on delete set null,     -- on an original: the edit shown on its card
  role text check (role in ('take', 'compara', 'animatic', 'outro')), -- a video, for the Galeria's Vídeo filter: take or cut,
                                       -- comparison, animatic (previz, blocking, guide). Null: the room guesses from name and model
  created_by text,
  sort double precision not null default extract(epoch from clock_timestamp()), -- upload order
  created_at timestamptz not null default now()
);

alter table public.items
  add constraint items_chosen_option_fkey foreign key (chosen_option) references public.options (id) on delete set null;

-- The team's private verdict on an option: 'keep' (✓), 'redo' or 'drop'. 'drop' always hides it from the client; how
-- 'keep' shapes what the client sees depends on the round's version (see option_dropped below).
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
  -- a comment written on a video at a moment of it (the animatic): the video (an option of the item) and the second
  option_id uuid references public.options (id) on delete set null,
  t_sec double precision,
  created_at timestamptz not null default now()
);

-- What the team asks the client for (photos, voices, logos...), and the files that come back.
create table public.requests (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 120),
  detail text not null default '',
  note text not null default '',       -- a link or a remark (older rooms; links and texts now live in request_notes)
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

-- a link or a text in a package (a request): both sides add them as themselves, like the files
create table public.request_notes (
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

-- ---------- the client's answer, as the team reads it (team only) ----------
-- The "Retorno" of a round: how the team reads what the client said about each item, in the room, in a call, in a deck
-- or in a chat. One row per round, item and version: version is the version the client talked about (v1), answered in
-- the next one (v2).
create table public.item_feedback (
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
create table public.feedback_refs (
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
create table public.tasks (
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
create table public.pendencias (
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
create table public.round_notes (
  round_id text primary key references public.rounds (id) on delete cascade,
  body text not null default '' check (length(body) <= 4000),
  updated_at timestamptz not null default now()
);

-- What goes to the client in each version of a round, decided by hand on the page. A row here beats the rule in
-- option_dropped(): include = true shows the option in that version, false hides it. nova marks an extra put straight
-- into the delivery for the team to compare (tagged in the client room only for the team's admin view).
create table public.envio (
  option_id uuid not null references public.options (id) on delete cascade,
  version integer not null,
  include boolean not null,
  nova boolean not null default false,
  by text not null default '',
  updated_at timestamptz not null default now(),
  primary key (option_id, version)
);

-- ---------- studio and 3D sets ----------
-- What someone drew or wrote on an image: strokes and pins in 0–1 image coordinates, plus what to change in words.
-- The client's drawings are seen by the client and the team; the team's stay internal.
create table public.annotations (
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
create table public.estudio_jobs (
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
create table public.blocking_shots (
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
create table public.cena3d (
  item_id uuid primary key references public.items (id) on delete cascade,
  state jsonb not null default '{}',
  updated_by text not null default '',
  updated_at timestamptz not null default now()
);

-- ---------- Galeria, Soul ID and recipes (team only) ----------
-- Galeria (sala/galeria.js): everything the room made or received, in one grid the team filters, selects and acts on.
-- A group the team saves from a selection ("Agrupar") is a named collection that becomes a filter. Its members are
-- options or files the client sent (request_files); deleting a group never touches the images.
create table public.gallery_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  created_by text not null default '',
  created_at timestamptz not null default now()
);
create table public.gallery_group_items (
  group_id uuid not null references public.gallery_groups (id) on delete cascade,
  option_id uuid references public.options (id) on delete cascade,
  file_id uuid references public.request_files (id) on delete cascade,
  ref text generated always as (coalesce('o:' || option_id::text, 'f:' || file_id::text)) stored,
  added_by text not null default '',
  added_at timestamptz not null default now(),
  primary key (group_id, ref),
  check ((option_id is null) <> (file_id is null))
);

-- A Soul ID: one person the Higgsfield API trains from 5–20 photos (POST /v1/custom-references), used afterwards by the
-- Soul models as custom_reference_id (the studio's Soul 2). The edge function `souls` submits and follows it with the
-- caller's login.
--   ref_id: Higgsfield's id of the reference; status: Higgsfield's training state
--   photos: [{path, option_id | file_id}] in the order they were sent, so the Galeria can show them again
create table public.souls (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  model_version text not null default 'v2' check (model_version in ('v1', 'v2', 'cinema')),
  ref_id text,
  status text not null default 'queued' check (status in ('not_ready', 'queued', 'in_progress', 'completed', 'failed')),
  photos jsonb not null default '[]',
  thumbnail_url text,
  fail_reason text,
  item_id uuid references public.items (id) on delete set null,
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The studio's recipes: how to ask for one kind of change (a new angle, the time of day, a look…), written for the
-- prompt writer (Claude, the studio function's write action). The team creates and edits them in the studio's Receitas
-- drawer (sala/estudio.js); a recipe dragged to the prompt goes with Gerar and Melhorar.
--   category: the drawer's group, in the room's words (a new one is just a new name)
--   instruction: what Claude is told, in English: what changes and what stays
--   base: edit (the base is the picture to change) or reshoot (the base is the scene to photograph again)
--   drawing: area (the marks limit where it changes) or hint (they only point at what it is about)
--   video: it also goes with a video
--   archived: taken out of the drawer (a recipe is never deleted)
create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  category text not null check (char_length(btrim(category)) between 1 and 40),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  hint text not null default '' check (char_length(hint) <= 200),
  instruction text not null check (char_length(btrim(instruction)) between 1 and 2000),
  base text not null default 'edit' check (base in ('edit', 'reshoot')),
  drawing text not null default 'area' check (drawing in ('area', 'hint')),
  video boolean not null default false,
  sort double precision not null default 0,
  archived boolean not null default false,
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_by text not null default '',
  updated_at timestamptz not null default now()
);

-- An etiqueta: a name and a color anyone on the team makes; it shows on the cards that have it and becomes a filter
-- (Filtros › Etiquetas). item_labels says which card (item) has which, option_labels which image (the one a cut used:
-- with the filter on, that card shows only its marked images); deleting an etiqueta, a card or an image takes its
-- marks along, never the other one. padrao: the room opens filtered by it.
create table public.labels (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  color text not null default 'teal' check (color in ('teal', 'violet', 'coral', 'amber', 'pink', 'blue', 'green', 'gray')),
  sort double precision not null default extract(epoch from now()),
  created_by text not null default '',
  created_at timestamptz not null default now(),
  padrao boolean not null default false
);
create table public.item_labels (
  item_id uuid not null references public.items (id) on delete cascade,
  label_id uuid not null references public.labels (id) on delete cascade,
  added_by text not null default '',
  added_at timestamptz not null default now(),
  primary key (item_id, label_id)
);
create table public.option_labels (
  option_id uuid not null references public.options (id) on delete cascade,
  label_id uuid not null references public.labels (id) on delete cascade,
  added_by text not null default '',
  added_at timestamptz not null default now(),
  primary key (option_id, label_id)
);

create index items_round_idx on public.items (round_id, scene, sort);
create index items_chosen_idx on public.items (chosen_option);
create index options_item_idx on public.options (item_id);
create index options_based_on on public.options (based_on);
create index options_stack_idx on public.options (stack);
create index comments_item_idx on public.comments (item_id, created_at);
create index comments_option_idx on public.comments (option_id);
create index request_files_req_idx on public.request_files (request_id);
create index request_notes_req_idx on public.request_notes (request_id);
create index item_feedback_item on public.item_feedback (item_id);
create index feedback_refs_item on public.feedback_refs (item_id);
create index tasks_item on public.tasks (item_id);
create index pendencias_item on public.pendencias (item_id);
create index annotations_option_idx on public.annotations (option_id);
create index estudio_jobs_item_idx on public.estudio_jobs (item_id, created_at desc);
create index blocking_shots_item_idx on public.blocking_shots (item_id, created_at desc);
create index gallery_group_items_option_idx on public.gallery_group_items (option_id);
create index gallery_group_items_file_idx on public.gallery_group_items (file_id);
create index item_labels_label_idx on public.item_labels (label_id);
create index option_labels_label_idx on public.option_labels (label_id);

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
-- (select is_team()) instead of is_team(): evaluated once per query, not once per row.
alter table public.rounds enable row level security;
alter table public.items enable row level security;
alter table public.options enable row level security;
alter table public.option_reviews enable row level security;
alter table public.comments enable row level security;
alter table public.requests enable row level security;
alter table public.request_files enable row level security;
alter table public.request_notes enable row level security;
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
alter table public.gallery_groups enable row level security;
alter table public.gallery_group_items enable row level security;
alter table public.souls enable row level security;
alter table public.recipes enable row level security;
alter table public.labels enable row level security;
alter table public.item_labels enable row level security;
alter table public.option_labels enable row level security;

-- rounds: both sides read; only the team writes (the client confirms through confirm_round())
create policy rounds_select on public.rounds for select to authenticated using ((select is_team()) or (select is_client()));
create policy rounds_insert on public.rounds for insert to authenticated with check ((select is_team()));
create policy rounds_update on public.rounds for update to authenticated using ((select is_team())) with check ((select is_team()));
create policy rounds_delete on public.rounds for delete to authenticated using ((select is_team()));

-- items: the client sees what was sent and has something to show; only the team writes (the client decides through decide())
create policy items_select on public.items for select to authenticated
  using ((select is_team()) or ((select is_client()) and public.item_shown(id)));
create policy items_insert on public.items for insert to authenticated with check ((select is_team()));
create policy items_update on public.items for update to authenticated using ((select is_team())) with check ((select is_team()));
create policy items_delete on public.items for delete to authenticated using ((select is_team()));

-- options: the client sees the options of sent items that the per-version rule lets through
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

-- request_notes: the same, and each side edits only what it wrote (the team edits any)
create policy request_notes_select on public.request_notes for select to authenticated using ((select is_team()) or (select is_client()));
create policy request_notes_insert on public.request_notes for insert to authenticated
  with check (side = (select public.side()) and ((select is_team()) or (select is_client())));
create policy request_notes_update on public.request_notes for update to authenticated
  using ((select is_team()) or ((select is_client()) and side = 'cliente'))
  with check ((select is_team()) or ((select is_client()) and side = 'cliente'));
create policy request_notes_delete on public.request_notes for delete to authenticated
  using ((select is_team()) or ((select is_client()) and side = 'cliente'));

-- the team's reading of the client's answers, tasks, open questions, round notes, deliveries, studio jobs, 3D sets, and
-- the Galeria's groups, Soul IDs, recipes and the cards' etiquetas: team only, the client gets no rows and cannot write
create policy item_feedback_team on public.item_feedback for all to authenticated
  using ((select is_team())) with check ((select is_team()));
create policy feedback_refs_team on public.feedback_refs for all to authenticated
  using ((select is_team())) with check ((select is_team()));
create policy tasks_team on public.tasks for all to authenticated
  using ((select is_team())) with check ((select is_team()));
create policy pendencias_team on public.pendencias for all to authenticated
  using ((select is_team())) with check ((select is_team()));
create policy round_notes_team on public.round_notes for all to authenticated
  using ((select is_team())) with check ((select is_team()));
create policy envio_team on public.envio for all to authenticated
  using ((select is_team())) with check ((select is_team()));
create policy estudio_jobs_team on public.estudio_jobs for all to authenticated
  using ((select is_team())) with check ((select is_team()));
create policy blocking_shots_team on public.blocking_shots for all to authenticated
  using ((select is_team())) with check ((select is_team()));
create policy cena3d_team on public.cena3d for all to authenticated
  using ((select is_team())) with check ((select is_team()));
create policy gallery_groups_team on public.gallery_groups for all to authenticated
  using ((select is_team())) with check ((select is_team()));
create policy gallery_group_items_team on public.gallery_group_items for all to authenticated
  using ((select is_team())) with check ((select is_team()));
create policy souls_team on public.souls for all to authenticated
  using ((select is_team())) with check ((select is_team()));
create policy recipes_team on public.recipes for all to authenticated
  using ((select is_team())) with check ((select is_team()));
create policy labels_team on public.labels for all to authenticated
  using ((select is_team())) with check ((select is_team()));
create policy item_labels_team on public.item_labels for all to authenticated
  using ((select is_team())) with check ((select is_team()));
create policy option_labels_team on public.option_labels for all to authenticated
  using ((select is_team())) with check ((select is_team()));

-- annotations: the team reads and manages all of them and draws as itself. The client draws on the options it can
-- see, reads only its own drawings (never the team's) and removes only its own; it cannot edit them.
create policy annotations_team_select on public.annotations for select to authenticated using ((select is_team()));
create policy annotations_team_insert on public.annotations for insert to authenticated
  with check ((select is_team()) and side = 'time');
create policy annotations_team_update on public.annotations for update to authenticated
  using ((select is_team())) with check ((select is_team()));
create policy annotations_team_delete on public.annotations for delete to authenticated using ((select is_team()));
create policy annotations_client_select on public.annotations for select to authenticated
  using ((select is_client()) and side = 'cliente' and public.item_shown(item_id) and not public.option_dropped(option_id));
create policy annotations_client_insert on public.annotations for insert to authenticated
  with check ((select is_client()) and side = 'cliente' and public.item_shown(item_id) and not public.option_dropped(option_id)
    and exists (select 1 from public.options o where o.id = annotations.option_id and o.item_id = annotations.item_id));
create policy annotations_client_delete on public.annotations for delete to authenticated
  using ((select is_client()) and side = 'cliente' and public.item_shown(item_id) and not public.option_dropped(option_id));

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
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_client() then raise exception 'only the client confirms a round'; end if;
  update public.rounds set confirmed_at = now(), confirmed_by = left(coalesce(nullif(trim(p_who), ''), 'Cliente'), 60) where id = p_round;
end $$;

-- The link or remark on a request: the only column of requests the client may change.
create or replace function public.set_request_note(p_request uuid, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (public.is_team() or public.is_client()) then raise exception 'not allowed'; end if;
  update public.requests set note = left(coalesce(p_note, ''), 2000) where id = p_request;
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

-- ---------- files ----------
-- One private bucket. The app reads through signed URLs (12 h). Layout: items/<item id>/... for options (team),
-- requests/<request id>/... for materials (both sides), estudio/... for the studio's working files (team).
-- 50 MB per file, the free plan's limit.
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

-- ---------- the first recipes ----------
-- A starting set for the studio's Receitas drawer (camera angles, time of day, expression, the person, clean-up, color,
-- photo styles). The team edits them, writes new ones and takes out what does not fit the film.
insert into public.recipes (category, name, hint, instruction, base, drawing, video, sort, created_by) values
  ($r$Ângulo de câmera$r$, $r$Novo ângulo$r$, $r$A mesma cena vista de outro ponto. O desenho mostra onde fica a câmera.$r$, $r$Photograph the same scene again from a new camera position. Image 1 is the scene, not a frame to keep: keep the place, the people with their faces, clothes and look, the objects and the light, and show them as the new camera sees them, with a new viewpoint, framing and perspective. If the director drew on the picture, the marks show where the camera goes and what it frames. Say where the camera is in concrete terms (distance in meters or centimeters, height, tilt in degrees) and what is large in the foreground.$r$, 'reshoot', 'hint', true, 10, ''),
  ($r$Ângulo de câmera$r$, $r$Contra-plongée$r$, $r$Câmera baixa, olhando pra cima.$r$, $r$Photograph the scene again from a low camera near the ground or table, tilted about 20 to 30 degrees up at the subject, so the subject reads taller and the ceiling or sky shows behind. Keep the place, the people and the light.$r$, 'reshoot', 'hint', true, 20, ''),
  ($r$Ângulo de câmera$r$, $r$Zenital$r$, $r$De cima, olhando reto pra baixo.$r$, $r$Photograph the scene again from directly above, looking straight down, 90 degrees top-down: people and objects seen from the top, their shadows on the floor or table, the layout of the place readable. Keep the place, the people and the light.$r$, 'reshoot', 'hint', true, 30, ''),
  ($r$Ângulo de câmera$r$, $r$Drone alto$r$, $r$Vista aérea alta: o lugar inteiro, as pessoas pequenas.$r$, $r$Photograph the scene again as an aerial view from a drone 60 to 120 meters up, tilted 45 to 60 degrees down, showing the place and what surrounds it. The people are small but keep their clothes and colors; anchor their size to something nearby (no taller than the width of a path or a doorway). Keep the time of day and the light.$r$, 'reshoot', 'hint', true, 40, ''),
  ($r$Ângulo de câmera$r$, $r$POV / FPV$r$, $r$O ponto de vista de alguém ou de algo.$r$, $r$Photograph the scene again from the point of view of the character or object the director names or marks: the lens at its eyes or its front, what it sees large in the foreground, and its own hands, visor or edges at the frame's border when that is natural. Keep the place, the people and the light.$r$, 'reshoot', 'hint', true, 50, ''),
  ($r$Ângulo de câmera$r$, $r$Através de um objeto$r$, $r$A câmera atrás ou dentro de um copo, espelho, folhas…$r$, $r$Photograph the scene again from behind or inside the object the director names or marks (a glass, a mirror, leaves, a window). The object frames the picture at its edges, close to the lens and soft, bending or reflecting the view, and it never appears a second time anywhere in the frame. The subject seen through it stays sharp and recognizable. Keep the place, the people and the light.$r$, 'reshoot', 'hint', true, 60, ''),
  ($r$Hora do dia$r$, $r$Amanhecer$r$, $r$Sol baixo do começo do dia, céu claro.$r$, $r$Change only the time of day to sunrise: a low warm sun near the horizon, long soft shadows, a pale gold and blue sky and a gentle haze in the distance. Keep the composition, the camera, the people, their poses and expressions, and every object exactly. Only the light, the shadows, the sky and the color of the light change.$r$, 'edit', 'hint', true, 70, ''),
  ($r$Hora do dia$r$, $r$Meio-dia$r$, $r$Sol alto, sombras curtas e duras.$r$, $r$Change only the time of day to midday: a high sun, short hard shadows right under people and objects, a bright blue sky, crisp contrast and true color. Keep the composition, the camera, the people, their poses and expressions, and every object exactly.$r$, 'edit', 'hint', true, 80, ''),
  ($r$Hora do dia$r$, $r$Golden hour$r$, $r$Sol baixo e dourado, contraluz quente.$r$, $r$Change only the time of day to golden hour: a low golden sun from the side or behind, warm rim light on hair and shoulders, long warm shadows, glowing highlights and a warm sky. Keep the composition, the camera, the people, their poses and expressions, and every object exactly.$r$, 'edit', 'hint', true, 90, ''),
  ($r$Hora do dia$r$, $r$Hora azul$r$, $r$Logo depois do pôr do sol: céu azul profundo, luzes acesas.$r$, $r$Change only the time of day to blue hour, just after sunset: a deep blue sky, soft even light, and the practical lights switched on (lamps, windows, signs, screens) warm against the blue. Keep the composition, the camera, the people, their poses and expressions, and every object exactly.$r$, 'edit', 'hint', true, 100, ''),
  ($r$Hora do dia$r$, $r$Noite$r$, $r$Noite, com a luz das lâmpadas e da rua.$r$, $r$Change only the time of day to night: a dark sky, and the scene lit by its own practical sources (lamps, screens, street lights) in warm pools of light, faces readable, color rich and true. Keep the composition, the camera, the people, their poses and expressions, and every object exactly.$r$, 'edit', 'hint', true, 110, ''),
  ($r$Ação e expressão$r$, $r$Sorrir$r$, $r$Um sorriso natural; o resto igual.$r$, $r$Change only the expression of the person the director names or marks to a natural, genuine smile: eyes slightly narrowed, cheeks raised. Keep the same face and identity, the head angle, hair, clothes and pose, the other people and the whole picture exactly.$r$, 'edit', 'area', true, 120, ''),
  ($r$Ação e expressão$r$, $r$Abrir os olhos$r$, $r$Olhos abertos, olhando pra onde a cena pede.$r$, $r$Open the eyes of the person the director names or marks, looking where the scene implies (at the camera only if the director asks). Keep the same face and identity, the rest of the expression, the head angle, hair and everything else exactly.$r$, 'edit', 'area', true, 130, ''),
  ($r$Ação e expressão$r$, $r$Surpresa$r$, $r$Surpresa de verdade, sem exagero.$r$, $r$Change only the expression of the person the director names or marks to a natural surprise: eyebrows raised, eyes a little wider, lips slightly parted, believable and never cartoonish. Keep the identity, the pose and everything else exactly.$r$, 'edit', 'area', true, 140, ''),
  ($r$Ação e expressão$r$, $r$Mudar a ação$r$, $r$Outra ação ou gesto, na mesma cena.$r$, $r$Change what the person the director names or marks is doing to the action the director describes, with a natural pose and hands that hold things correctly. Keep their identity and clothes, the place, the camera, the light and the other people as they are.$r$, 'edit', 'hint', true, 150, ''),
  ($r$Pessoa$r$, $r$Trocar gênero$r$, $r$Outro gênero, mesma idade, roupa e pose.$r$, $r$Change the person the director names or marks to the other gender, as a believable real person of the same age range, skin tone, build, pose, clothing style and expression. Keep the place, the camera, the light and everyone else exactly.$r$, 'edit', 'hint', false, 160, ''),
  ($r$Pessoa$r$, $r$Trocar etnia$r$, $r$Outra etnia (diga qual), mesmo papel na cena.$r$, $r$Change the ethnicity of the person the director names or marks to the one the director asks for, as a believable real person with natural features, keeping the same gender, age, pose, clothes, expression and role in the scene. Keep everything else exactly.$r$, 'edit', 'hint', false, 170, ''),
  ($r$Pessoa$r$, $r$Mudar idade$r$, $r$Mais jovem ou mais velho (diga quanto).$r$, $r$Change the apparent age of the person the director names or marks as the director asks (younger or older, and by how much), with real skin and hair for that age. Keep the pose, clothes, expression and everything else exactly.$r$, 'edit', 'hint', false, 180, ''),
  ($r$Pessoa$r$, $r$Mudar cabelo$r$, $r$Outro corte, cor ou penteado.$r$, $r$Change only the hair of the person the director names or marks as the director describes (cut, length, color, style), with real hair texture and a natural hairline. Keep the face, the identity and everything else exactly.$r$, 'edit', 'area', false, 190, ''),
  ($r$Limpeza e acabamento$r$, $r$Limpar a imagem$r$, $r$Tira artefatos e distrações sem mudar nada.$r$, $r$Clean up the picture: remove artifacts, stray marks, dust, odd or broken text, warped details and small distractions, and fix broken hands, teeth and edges. Change nothing else: the composition, the people, their faces and the light stay exactly as they are.$r$, 'edit', 'area', false, 200, ''),
  ($r$Limpeza e acabamento$r$, $r$Pele natural$r$, $r$Trata a pele sem plastificar.$r$, $r$Retouch the skin naturally: even out blemishes and harsh shine while keeping pores, fine lines, freckles and real texture, with no smoothing and no plastic look. Keep the identity and everything else exactly.$r$, 'edit', 'area', false, 210, ''),
  ($r$Limpeza e acabamento$r$, $r$Tirar objeto$r$, $r$Remove o que você marcar e refaz o fundo.$r$, $r$Remove the object the director names or marks and rebuild what was behind it so the place reads naturally, continuing the surfaces, the light and the shadows. Keep everything else exactly.$r$, 'edit', 'area', false, 220, ''),
  ($r$Cor e look$r$, $r$Color wash$r$, $r$Um banho de cor (diga qual), sem perder a pele.$r$, $r$Give the whole picture a gentle color wash in the hue the director names (for example a warm amber or a teal green), mostly in the shadows and the light, while skin stays natural and true and the image keeps rich color and full contrast. Keep the composition and everything in it exactly.$r$, 'edit', 'hint', true, 230, ''),
  ($r$Cor e look$r$, $r$Cinema quente$r$, $r$Altas douradas, pele bonita, pretos ricos.$r$, $r$Grade the picture with a warm cinema look: golden highlights, slightly warm mid-tones, clean deep blacks, glowing natural skin and rich, saturated color. Keep the composition and everything in it exactly.$r$, 'edit', 'hint', true, 240, ''),
  ($r$Cor e look$r$, $r$Teal & orange$r$, $r$Clássico de cinema: pele quente, sombras frias.$r$, $r$Grade the picture with a teal and orange cinema look: warm, glowing skin and highlights against cool teal shadows and backgrounds, with rich color and full contrast. Keep the composition and everything in it exactly.$r$, 'edit', 'hint', true, 250, ''),
  ($r$Cor e look$r$, $r$Kodachrome$r$, $r$Cor vibrante de filme clássico.$r$, $r$Grade the picture like classic Kodachrome slide film: vivid reds and yellows, deep blues, punchy contrast and warm, true skin. Keep the composition and everything in it exactly.$r$, 'edit', 'hint', true, 260, ''),
  ($r$Estilo de foto$r$, $r$Película 35mm$r$, $r$Cara de filme de cinema em 35mm.$r$, $r$Make the picture look like a frame shot on 35mm motion picture film: organic highlight roll-off, a gentle halation around bright lights, rich natural color and true skin. Keep the composition and everything in it exactly.$r$, 'edit', 'hint', true, 270, ''),
  ($r$Estilo de foto$r$, $r$Médio formato$r$, $r$Foto de médio formato: detalhe fino, foco suave.$r$, $r$Make the picture look like a medium format photograph: very fine detail, smooth focus falloff with a slightly shallower depth of field, and a calm, rich tonality. Keep the composition and everything in it exactly.$r$, 'edit', 'hint', false, 280, ''),
  ($r$Estilo de foto$r$, $r$Celular espontâneo$r$, $r$Foto de celular, natural, sem pose.$r$, $r$Make the picture look like a spontaneous smartphone photo: deep focus, a slightly wide look, natural available light, crisp and casual. Keep the people, the place and what happens exactly.$r$, 'edit', 'hint', true, 290, ''),
  ($r$Estilo de foto$r$, $r$Anamórfica$r$, $r$Flares horizontais e bokeh oval.$r$, $r$Make the picture look like it was shot with an anamorphic cinema lens: horizontal flares from bright lights, oval bokeh, a slight falloff at the edges and a wide cinematic feel. Keep the composition and everything in it exactly.$r$, 'edit', 'hint', true, 300, '');
