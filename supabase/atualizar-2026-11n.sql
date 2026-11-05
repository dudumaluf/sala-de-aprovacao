-- 05/11 · a video's resolution, known without playing it (the team's Filtros › Resolução).
-- options.res: the video's short side in pixels (1080, 720, 480…), read from the file itself. The room writes it when a
-- video goes up from a card, and the first time a team browser loads a video's size; the rows that came before were
-- measured with ffprobe on 05/11. Empty for images and for a video nobody has opened yet (the room then reads the
-- resolution from the studio's label, as before). Safe to run more than once.
begin;

alter table public.options add column if not exists res smallint;
comment on column public.options.res is 'Video short side in pixels (1080, 720, 480…), read from the file; null for images or not measured yet';

commit;

notify pgrst, 'reload schema';
