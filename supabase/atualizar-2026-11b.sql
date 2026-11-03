-- Sala de aprovação: update for the Galeria, Soul ID and the studio's recipes (after atualizar-2026-11.sql).
-- Paste it once in the SQL Editor and Run. It only adds: four team-only tables with their access rules, and a starting
-- set of recipes when the room has none. No row is changed or deleted. Running it again changes nothing.
-- Afterwards the database is the same as one made from scratch with the current schema.sql.
--
-- What it brings: the Galeria's groups (gallery_groups, gallery_group_items), the Soul IDs it trains (souls, with the
-- edge function supabase/functions/souls) and the recipes of the studio's Receitas drawer (recipes).
-- A job that shares a project (config.js SCHEMA, BUCKET, JOB) runs it through job.py:
--   python3 supabase/job.py <schema> <job> <bucket> supabase/atualizar-2026-11b.sql > job-update.sql

begin;

-- ---------- new tables (same definitions and comments as in schema.sql) ----------
-- Galeria (sala/galeria.js): everything the room made or received, in one grid the team filters, selects and acts on.
-- A group the team saves from a selection ("Agrupar") is a named collection that becomes a filter. Its members are
-- options or files the client sent (request_files); deleting a group never touches the images.
create table if not exists public.gallery_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  created_by text not null default '',
  created_at timestamptz not null default now()
);
create table if not exists public.gallery_group_items (
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
create table if not exists public.souls (
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
create table if not exists public.recipes (
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

create index if not exists gallery_group_items_option_idx on public.gallery_group_items (option_id);
create index if not exists gallery_group_items_file_idx on public.gallery_group_items (file_id);

-- ---------- row-level security: team only ----------
alter table public.gallery_groups enable row level security;
alter table public.gallery_group_items enable row level security;
alter table public.souls enable row level security;
alter table public.recipes enable row level security;
drop policy if exists gallery_groups_team on public.gallery_groups;
create policy gallery_groups_team on public.gallery_groups for all to authenticated
  using ((select is_team())) with check ((select is_team()));
drop policy if exists gallery_group_items_team on public.gallery_group_items;
create policy gallery_group_items_team on public.gallery_group_items for all to authenticated
  using ((select is_team())) with check ((select is_team()));
drop policy if exists souls_team on public.souls;
create policy souls_team on public.souls for all to authenticated
  using ((select is_team())) with check ((select is_team()));
drop policy if exists recipes_team on public.recipes;
create policy recipes_team on public.recipes for all to authenticated
  using ((select is_team())) with check ((select is_team()));

-- ---------- the first recipes, when the room has none ----------
insert into public.recipes (category, name, hint, instruction, base, drawing, video, sort, created_by)
select * from (values
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
  ($r$Estilo de foto$r$, $r$Anamórfica$r$, $r$Flares horizontais e bokeh oval.$r$, $r$Make the picture look like it was shot with an anamorphic cinema lens: horizontal flares from bright lights, oval bokeh, a slight falloff at the edges and a wide cinematic feel. Keep the composition and everything in it exactly.$r$, 'edit', 'hint', true, 300, '')
) as r (category, name, hint, instruction, base, drawing, video, sort, created_by)
where not exists (select 1 from public.recipes);

commit;
