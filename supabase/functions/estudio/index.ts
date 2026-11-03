// Estúdio da sala: asks image and video models for the team, through two providers:
// - Magnific (Nano Banana 2.1), key in the Edge Function secret MAGNIFIC_KEY;
// - Higgsfield (GPT Image 2.5, Grok, Qwen, Soul 2, Seedance, Genjutsu), key in HF_KEY or the Vault secret read by estudio_hf_key();
// and Claude, which looks at the images, the drawing and the notes and writes the prompt (ANTHROPIC_KEY).
// The keys stay on the server and are never returned; only a caller signed in with the team login
// (app_metadata.side = "time", or app_metadata.room = "time" in a job that shares the project) gets through. Inputs are
// files of the room's bucket, passed as storage paths and signed here with the caller's own login, so storage rules still
// apply. The room sends its schema and bucket (config.js SCHEMA, BUCKET; "public" and "media" when it does not): only
// names, since the caller's login still decides what it may read and write there.
// ALLOWED_ORIGINS (optional, comma-separated: "https://sala.example.com,https://outra.example.com") limits which sites
// may call it; unset, any site may, since the team login is the real gate.
// Actions (POST JSON): check, write, submit, status, file.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";

const BASE = { mg: "https://api.magnific.com", hf: "https://api.higgsfield.ai" };
type Via = keyof typeof BASE;
const NAME: Record<Via, string> = { mg: "o Magnific", hf: "a Higgsfield" };
const NO_KEY: Record<Via, string> = {
  mg: "A chave do Magnific ainda não foi configurada no servidor.",
  hf: "A chave da Higgsfield ainda não foi configurada no servidor.",
};
// the room's sites (ALLOWED_ORIGINS); a copy running on this computer (localhost, any port) is always let through, for tests
const ORIGINS = new Set((Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean));
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const allowed = (origin: string) => !!origin && (!ORIGINS.size || ORIGINS.has(origin) || LOCAL.test(origin));
// the models the studio offers, where each one runs and the input fields it takes; anything else is refused
const IMG = ["prompt", "image_urls", "resolution", "aspect_ratio", "quality"];
const MODELS: Record<string, { via: Via; path: string; fields: string[] }> = {
  "magnific/nano-banana-2-1": { via: "mg", path: "/v1/ai/text-to-image/nano-banana-2-1", fields: ["prompt", "image_urls", "resolution", "aspect_ratio", "thinking_level"] },
  "marketing-studio/image/sunburst": { via: "hf", path: "/marketing-studio/image/sunburst", fields: IMG },
  "marketing-studio/image/flare": { via: "hf", path: "/marketing-studio/image/flare", fields: IMG },
  "xai/grok-imagine-image-2.0": { via: "hf", path: "/xai/grok-imagine-image-2.0", fields: IMG },
  "alibaba/qwen-image-3/edit": { via: "hf", path: "/alibaba/qwen-image-3/edit", fields: ["prompt", "image_urls"] },
  // Soul 2 with a trained face (a Soul ID made by the Galeria's souls function, with this same key): the base is the
  // scene it starts from, custom_reference_id the face, custom_reference_strength how much of it (0–1)
  "higgsfield-ai/soul/v2/image-to-image": { via: "hf", path: "/higgsfield-ai/soul/v2/image-to-image", fields: ["prompt", "image_url", "custom_reference_id", "custom_reference_strength", "resolution", "aspect_ratio", "batch_size", "enhance_prompt", "seed"] },
  "bytedance/seedance-2.5/text-to-video": { via: "hf", path: "/bytedance/seedance-2.5/text-to-video", fields: ["prompt", "duration", "resolution", "aspect_ratio", "generate_audio"] },
  "bytedance/seedance-2.5/image-to-video": { via: "hf", path: "/bytedance/seedance-2.5/image-to-video", fields: ["prompt", "image_url", "end_image_url", "duration", "resolution", "generate_audio"] },
  "bytedance/seedance-2.5/reference-to-video": { via: "hf", path: "/bytedance/seedance-2.5/reference-to-video", fields: ["prompt", "image_urls", "video_urls", "audio_urls", "duration", "resolution", "aspect_ratio", "generate_audio"] },
  // Genjutsu on a guide video (4 to 30 s) and up to 8 images: motion transfer rebuilds the scene from the images with the
  // video's motion and camera; object swap keeps the video and swaps in the images' people, things or places. The result
  // is as long as the video; resolution 480p, 720p or 1080p
  "higgsfield/genjutsu/motion-transfer/v1.0": { via: "hf", path: "/higgsfield/genjutsu/motion-transfer/v1.0", fields: ["prompt", "video_url", "image_urls", "resolution"] },
  "higgsfield/genjutsu/object-swap/v1.0": { via: "hf", path: "/higgsfield/genjutsu/object-swap/v1.0", fields: ["prompt", "video_url", "image_urls", "resolution"] },
};
const FILE_FIELDS = new Set(["image_urls", "video_urls", "audio_urls", "image_url", "end_image_url", "video_url"]);
const OPEN = new Set(["queued", "in_progress"]);
// Magnific task states, in the studio's words
const MG_STATUS: Record<string, string> = { CREATED: "queued", IN_PROGRESS: "in_progress", COMPLETED: "completed", FAILED: "failed" };
// the provider's own words when it refuses something (FastAPI lists, plain messages, nested errors)
// deno-lint-ignore no-explicit-any
const errOf = (o: any): string => {
  if (Array.isArray(o?.detail)) return o.detail.map((d: { msg?: string; loc?: unknown[] }) => [d?.loc?.slice(1).join("."), d?.msg].filter(Boolean).join(": ")).filter(Boolean).join("; ");
  return [o?.detail, o?.message, o?.error?.message, o?.error, o?.data?.message].find((x) => typeof x === "string" && x) || "";
};

// the prompt writer: what Claude is told for each kind of request (the images come numbered as the model will see them).
// LOOK marks where the film's look goes: the room sends it with each request (config.js ESTUDIO.look), else DEFAULT_LOOK
const LOOK = "{{look}}";
const DEFAULT_LOOK = "photoreal film still, natural light, true-to-life color, real textures and skin";
const MAX_LOOK = 400;
// an image model reads a negated word as the word itself ("never muted" comes out muted), so a negated color word that
// slips into a prompt comes out, and so do the film's own words to avoid (config.js ESTUDIO.avoid) said with a "never"
const AVOID_MAX = 8;
const unwash = (s: string, avoid: string[] = []) => {
  const w = ["muted", "desaturated", "washed[- ]out", ...avoid.map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+"))].join("|");
  return s.replace(new RegExp(`,?\\s*(?:and\\s+)?(?:never|not|no|nothing)\\s+(?:${w})(?:\\s+(?:or|and|nor)\\s+(?:${w}))*`, "gi"), "")
    .replace(/\(\s*\)/g, "").replace(/[ \t]+([.,;])/g, "$1");
};
// people in set places (around a table, in a row) are said place by place, so a model does not swap them
const PLACES = "When people sit or stand in set places (around a table, in a row), give each one's place in order, from the camera's left to right, and keep everyone in that place for the whole shot.";
const WRITER: Record<string, string> = {
  edit: `You write prompts for an image model (Nano Banana) in the AI studio of a film production. The images you see are the ones the model will see, with the same numbers. Image 1 is the picture to edit. If one image is the same picture with the director's marks and numbered notes drawn on top, it only shows where and what to change. Any other image is a reference the director attached.
Read the director's request and notes (often in Portuguese), look at the pictures, and write one edit instruction in English: what to change and exactly where (describe the spot by what is there and its position in the frame), how the result should look so it belongs in the scene (materials, light direction, perspective, scale), and that everything else stays exactly as in image 1. Name reference images by number when they matter. The model must never draw the marks, the numbers or the note text. ${LOOK}
Answer with the prompt only, in plain prose, in at most 120 words.`,
  // Novo ângulo: the base is the scene to photograph again from another camera position, not a frame to keep
  angle: `You write prompts for an image model (Nano Banana) in the AI studio of a film production. The images you see are the ones the model will see, with the same numbers. Image 1 is the scene, to be photographed again from a new camera position: it is not a frame to keep. If one image is the same picture with the director's marks and numbered notes drawn on top, they show where the new camera goes and what it frames. Any other image is a reference the director attached.
Read the director's request and notes (often in Portuguese), look at the pictures, and write one prompt in English for the new photograph of the same scene: where the camera is now, its height and angle, what it frames and how close, the lens and the perspective, and what can be seen from there, with the same place, people, objects, light and time of day as image 1. Name reference images by number when they matter. The model must never draw the marks, the numbers or the note text. ${LOOK}
Answer with the prompt only, in plain prose, in at most 150 words.`,
  create: `You write prompts for an image model (Nano Banana) in the AI studio of a film production. The images you see are references the model will also see, with the same numbers. Read the director's idea (often in Portuguese) and write one prompt in English for a new picture: subject, action, setting, composition and camera (shot size, angle, lens feel), light, and which reference image gives which person, place or object, by number. ${LOOK}
Answer with the prompt only, in plain prose, in at most 150 words.`,
  blocking: `You write prompts for an image model (Nano Banana) in the AI studio of a film production. Image 1 is a 3D blocking frame: grey low-poly placeholders that fix the camera, the framing, the scale and the poses of a shot. The other images are references (the approved location, the cast, the product), numbered as the model will see them; a copy of image 1 with marks and notes, if there is one, shows the director's changes. Write one prompt in English that turns image 1 into the real photographic frame: keep its camera, framing, scale and poses exactly, take every look from the references by number, replace every placeholder with the real thing, and apply the director's notes. ${LOOK}
Answer with the prompt only, in plain prose, in at most 180 words.`,
  video: `You write prompts for Seedance 2.5, a video model, in the AI studio of a film production. References are tagged in load order: @image1, @image2… for images, @video1… for videos, @audio1… for voice takes the model lip-syncs to. You see the images; videos and audio are only named.
Write one prompt in English for a single shot of the given duration, in these blocks, using only the ones the shot needs: SCENE CONTEXT, ACTIVE REFERENCES (each tag with a minimal anchor and "100% matches the reference"), LOCATION MAP, FIRST FRAME / BLOCKING, FORMAT MODE ("One continuous shot, the camera does not cut on its own." unless cuts are asked for), CAMERA (field of view in degrees, one of 107°, 84°, 63°, 47°, 29°, 18°, 12°, 8°, or 180° for a fisheye; height; movement), ACTION, PERFORMANCE, LIGHTING (source, direction, white balance in Kelvin), AUDIO, POSITIVE LOCKS.
Write what can be seen and measured, in positive phrasing only; left and right are from the camera; speeds in km/h; no director, film or equipment names. When a voice is attached, say who speaks the line from which @audio tag, lips in sync. ${PLACES} ${LOOK}
Answer with the prompt only.`,
  // Genjutsu on a guide video: the images come numbered as the model gets them; the video is only named
  motion: `You write prompts for Genjutsu motion transfer, a video model, in the AI studio of a film production. It takes only the motion and the camera of a guide video (a previz, a 3D blocking, a take) and rebuilds the whole scene from up to 8 reference images, Image 1, Image 2… in the order the model gets them: nothing of the video's own people or place stays. Image 1 leads, as the first frame: the whole clip keeps its look. You see the images; the video is only named.
Read the director's request (often in Portuguese) and write one prompt in English: who and what is in the scene and from which Image, one sentence each, and that the moves, the framing and the camera follow the video. Two people can blend into each other, so describe each one apart and plainly, by how they look and where they are. ${PLACES} Let the images carry the likeness: a few anchoring words at most. ${LOOK}
Answer with the prompt only, in plain prose, in at most 150 words.`,
  swap: `You write prompts for Genjutsu object swap, a video model, in the AI studio of a film production. It gets a video clip and up to 8 reference images, Image 1, Image 2… in the order the model gets them, and replaces people, objects or places in the video with the subjects of the images, keeping everything else: the camera, the motion, the framing, the light and the timing. You see the images; the video is only named.
Read the director's request (often in Portuguese) and write one prompt in English: name each original subject of the video by how it looks and where it is ("the driver in the red shirt"), then say which Image it becomes, one sentence each, and ask to keep the place, the camera, the motion and the light. It reliably changes the most prominent person; when two change, say plainly that both do. ${PLACES} Let the images carry the likeness: a few anchoring words at most. ${LOOK}
Answer with the prompt only, in plain prose, in at most 120 words.`,
  frames: `You write prompts for Seedance 2.5 image-to-video in the AI studio of a film production. The first image is the first frame of the shot and, when there is a second one, it is the last frame. Write one prompt in English for a single continuous shot of the given duration that takes the first frame to the last: what moves and how (speeds in km/h), what the camera does (field of view in degrees, movement), the performance, light consistent with the frames, and the sound. Write what can be seen, in positive phrasing only; left and right are from the camera; no director, film or equipment names. ${LOOK}
Answer with the prompt only.`,
};
// the camera the director set in the studio's bar comes as one line already in the generator's own terms (photo words and
// the gear for an image model; field of view and look words, no names, for Seedance); how says what it is for
const CAM_ASK: Record<string, string> = {
  keep: "The director set the camera look below: write the edit so the whole picture looks shot that way, while its framing and everything in it stay as in image 1.",
  new: "The director set the new camera below: photograph the scene with it.",
  weave: "The director set the camera below: the picture is shot with it.",
  video: "The director set the camera below, already in field-of-view and look words: put it where the prompt describes the camera and the look, with its field of view as given and no camera, lens or film names.",
};
const CLAUDE_KEYS = ["ANTHROPIC_KEY", "ANTHROPIC_API_KEY", "CLAUDE_KEY", "CLAUDE_API_KEY"];
const claudeKey = () => CLAUDE_KEYS.map((n) => (Deno.env.get(n) || "").trim()).find(Boolean) || "";

const cors = (origin: string) => ({
  // a site that is not allowed gets the room's own address back, so its browser refuses to read the answer
  "Access-Control-Allow-Origin": allowed(origin) ? origin : [...ORIGINS][0] || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const body = await req.json().catch(() => ({}));
    const ident = (v: unknown, ok: RegExp, d: string) => (typeof v === "string" && ok.test(v) ? v : d);
    const schema = ident(body.schema, /^[a-z_][a-z0-9_]{0,62}$/, "public"), bucket = ident(body.bucket, /^[a-z0-9_-]{1,63}$/, "media");
    const db = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      db: { schema },
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: who } = await db.auth.getUser(token);
    const meta = who?.user?.app_metadata || {};
    if ((meta.job ? meta.room : meta.side) !== "time") return json({ error: "Só a equipe usa o estúdio." }, 403);

    // trimmed: a key pasted in the dashboard often brings a space or a line break along
    const keyOf = async (via: Via) => {
      if (via === "mg") return (Deno.env.get("MAGNIFIC_KEY") || "").trim();
      const env = (Deno.env.get("HF_KEY") || "").trim();
      if (env) return env;
      const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
      const { data } = await admin.rpc("estudio_hf_key");
      return ((data as string) || "").trim();
    };
    const api = (via: Via, key: string, path: string, init: RequestInit = {}) =>
      fetch(BASE[via] + path, {
        ...init,
        headers: { ...(via === "mg" ? { "x-magnific-api-key": key } : { Authorization: `Key ${key}` }), "Content-Type": "application/json", ...(init.headers || {}) },
      });

    const sign = async (path: unknown) => {
      if (typeof path !== "string" || !path || path.includes("..") || /^[a-z]+:/i.test(path)) throw new Error("Arquivo inválido.");
      const { data, error } = await db.storage.from(bucket).createSignedUrl(path, 2 * 3600);
      if (error || !data) throw new Error(`Não consegui abrir ${path}`);
      return data.signedUrl;
    };

    // which providers have a key: null = none set, true = set (and accepted, with verify), false = refused.
    // verify asks each provider for something free (a task list, a request that does not exist), never a generation:
    // only 401/403 mean a refused key (an empty list answers 404). It reports the provider's answer, never the key
    if (body.action === "check") {
      const keys: Record<string, boolean | null> = {}, answers: Record<string, string> = {};
      for (const via of ["mg", "hf"] as Via[]) {
        const key = await keyOf(via);
        const name = via === "mg" ? "magnific" : "higgsfield";
        let ok: boolean | null = key ? true : null;
        if (key && body.verify) {
          const r = via === "mg"
            ? await api(via, key, MODELS["magnific/nano-banana-2-1"].path)
            : await api(via, key, `/requests/${crypto.randomUUID()}/status`);
          ok = r.status !== 401 && r.status !== 403;
          answers[name] = `${r.status} ${errOf(await r.json().catch(() => ({}))).slice(0, 160)}`.trim();
        }
        keys[name] = ok;
      }
      // Claude: listing the models is free
      const ck = claudeKey();
      keys.claude = ck ? true : null;
      if (ck && body.verify) {
        try { await new Anthropic({ apiKey: ck }).models.list({ limit: 1 }); answers.claude = "200"; }
        catch (e) {
          if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) keys.claude = false;
          answers.claude = e instanceof Anthropic.APIError ? `${e.status} ${String(e.message).slice(0, 160)}` : String(e).slice(0, 160);
        }
      }
      return json(body.verify ? { keys, answers } : { keys });
    }

    // Claude looks at the images (numbered as the generator will see them), the drawing and the notes, and writes the prompt
    if (body.action === "write") {
      const apiKey = claudeKey();
      if (!apiKey) return json({ error: "A chave do Claude ainda não foi configurada no servidor." }, 503);
      const kind = WRITER[body.kind] ? body.kind : "edit";
      // the film's look: a short line of text, or nothing (then the neutral default); one line, so it stays a sentence
      if (body.look != null && (typeof body.look !== "string" || body.look.length > MAX_LOOK)) return json({ error: `O look do filme precisa ser um texto de até ${MAX_LOOK} caracteres.` }, 400);
      const look = ((body.look as string | undefined) || "").replace(/\s+/g, " ").trim().replace(/[.\s]+$/, "") || DEFAULT_LOOK;
      // words the film never wants in a prompt, not even negated (a few short words or phrases)
      const avoid: string[] = (Array.isArray(body.avoid) ? body.avoid : []).filter((a: unknown) => typeof a === "string" && /^[\p{L}][\p{L} -]{0,29}$/u.test(a.trim()))
        .map((a: string) => a.trim()).slice(0, AVOID_MAX);
      const avoidLine = avoid.length ? ` Say it only in positive words: the words ${avoid.length > 1 ? `${avoid.slice(0, -1).join(", ")} and ${avoid.at(-1)}` : avoid[0]} never appear in your prompt, not even negated.` : "";
      const content: Anthropic.Beta.BetaContentBlockParam[] = [];
      const images = (Array.isArray(body.images) ? body.images : []).slice(0, 12);
      for (const [i, im] of images.entries()) {
        content.push({ type: "text", text: `${kind === "video" ? `@image${i + 1}` : `Image ${i + 1}`}: ${String(im?.label || "").slice(0, 160)}` });
        content.push({ type: "image", source: { type: "url", url: await sign(im?.path) } });
      }
      const notes = (Array.isArray(body.notes) ? body.notes : []).slice(0, 12).map((n: unknown) => String(n).slice(0, 200));
      const camLine = typeof body.camera?.line === "string" ? body.camera.line.slice(0, 700) : "";
      // the recipes the director put on the prompt (the room's `recipes` table): how to ask for that kind of change
      const recipes = (Array.isArray(body.recipes) ? body.recipes : []).slice(0, 8)
        .map((r: { name?: unknown; instruction?: unknown; base?: unknown; drawing?: unknown }) => ({
          name: String(r?.name || "").slice(0, 60), instruction: String(r?.instruction || "").slice(0, 2000),
          reshoot: r?.base === "reshoot", hint: r?.drawing === "hint",
        }))
        .filter((r: { instruction: string }) => r.instruction);
      const brief = [
        body.scene ? `Scene: ${String(body.scene).slice(0, 200)}.` : "",
        body.item ? `The result goes into the room item "${String(body.item).slice(0, 120)}".` : "",
        body.duration ? `Duration: ${Number(body.duration) || 5} s${body.aspect ? `, aspect ratio ${String(body.aspect).slice(0, 8)}` : ""}.` : "",
        ...(Array.isArray(body.tags) ? body.tags : []).slice(0, 12).map((t: { tag?: string; label?: string }) => `${String(t?.tag || "").slice(0, 12)}: ${String(t?.label || "").slice(0, 160)}`),
        notes.length ? `Notes written on the drawing: ${notes.map((n: string, i: number) => `${i + 1}) ${n}`).join("; ")}.` : "",
        camLine ? `${CAM_ASK[body.camera?.how] || CAM_ASK.weave} Weave it into the prompt once, in your own words:\n${camLine}` : "",
        recipes.length ? `The director picked ${recipes.length > 1 ? "these recipes" : "this recipe"} for the request. Follow ${recipes.length > 1 ? "each one" : "it"} in this scene's context and write it into the prompt once, in your own words; where a recipe and the general rules above differ, the recipe wins, and the director's own words win over both:\n${recipes.map((r: { name: string; instruction: string; reshoot: boolean; hint: boolean }, i: number) => `${i + 1}) ${r.name}${r.reshoot ? " (image 1 is the scene to photograph again)" : ""}${r.hint ? " (a drawing only points at what it is about)" : " (with a drawing, the change stays where it is marked)"}: ${r.instruction}`).join("\n")}` : "",
        `What the director asks: ${String(body.prompt || "").slice(0, 3000) || (recipes.length ? "follow the recipes, with the notes on the drawing." : camLine || kind === "angle" ? "see the camera and the notes on the drawing." : "see the notes on the drawing.")}`,
      ].filter(Boolean).join("\n");
      content.push({ type: "text", text: brief });
      const r = await new Anthropic({ apiKey }).beta.messages.create({
        model: "claude-opus-5-5",
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium" },
        system: WRITER[kind].replace(LOOK, () => `The film's look: ${look}.${avoidLine}`), // a function: a "$" in the look stays a "$"
        messages: [{ role: "user", content }],
      });
      if (r.stop_reason === "refusal") return json({ error: "O Claude não quis escrever esse prompt." }, 400);
      const prompt = unwash(r.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n"), avoid).trim();
      if (!prompt) return json({ error: "O Claude não devolveu um prompt." }, 502);
      return json({ prompt });
    }

    if (body.action === "submit") {
      const m = MODELS[body.model];
      if (!m) return json({ error: "Modelo não liberado no estúdio." }, 400);
      if (!body.item_id) return json({ error: "Falta o item." }, 400);
      const key = await keyOf(m.via);
      if (!key) return json({ error: NO_KEY[m.via] }, 503);
      const input = body.input || {};
      const send: Record<string, unknown> = {};
      for (const k of m.fields) {
        const v = input[k];
        if (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length)) continue;
        send[k] = FILE_FIELDS.has(k) ? (Array.isArray(v) ? await Promise.all(v.map(sign)) : await sign(v)) : v;
      }
      // Magnific takes references as {image: url} (named Image 1, Image 2… in the prompt) and resolution in capitals
      if (m.via === "mg") {
        if (send.image_urls) { send.reference_images = (send.image_urls as string[]).map((image) => ({ image })); delete send.image_urls; }
        if (typeof send.resolution === "string") send.resolution = send.resolution.toUpperCase();
      }
      const r = await api(m.via, key, m.path, { method: "POST", body: JSON.stringify(send) });
      const out = await r.json().catch(() => ({}));
      const id = m.via === "mg" ? out.data?.task_id || out.task_id : out.request_id;
      if (!r.ok || !id) return json({ error: errOf(out) || `${NAME[m.via]} respondeu ${r.status}` }, 400);
      const status = m.via === "mg" ? MG_STATUS[out.data?.status || out.status] || "queued" : out.status || "queued";
      const { data: job, error } = await db.from("estudio_jobs").insert({
        item_id: body.item_id, base_option: body.base_option || null, mode: body.mode || "edit", model: body.model,
        label: String(body.label || "").slice(0, 120), prompt: String(body.prompt || input.prompt || "").slice(0, 4000),
        input, refs: body.refs || [], request_id: String(id), status,
        created_by: String(body.created_by || "").slice(0, 60),
      }).select().single();
      if (error) throw error;
      return json({ job });
    }

    if (body.action === "status") {
      const { data: job, error } = await db.from("estudio_jobs").select("*").eq("id", body.job_id).single();
      if (error || !job) return json({ error: "Pedido não encontrado." }, 404);
      const m = MODELS[job.model];
      if (!job.request_id || !OPEN.has(job.status) || !m) return json({ job });
      const key = await keyOf(m.via);
      if (!key) return json({ error: NO_KEY[m.via] }, 503);
      let status: string, fail: string | null = null, result = job.result;
      if (m.via === "mg") {
        const r = await api("mg", key, `${m.path}/${job.request_id}`);
        const s = await r.json().catch(() => ({}));
        if (!r.ok) return json({ error: errOf(s) || `O Magnific respondeu ${r.status}` }, 400);
        const d = s.data || s;
        status = MG_STATUS[d.status] || job.status;
        if (status === "completed") {
          const images = (d.generated || []).map((x: string | { url?: string }) => (typeof x === "string" ? x : x?.url)).filter(Boolean);
          result = { images, video: null, expires_at: null };
          if (!images.length) { status = "failed"; fail = "O Magnific terminou sem imagem."; }
        }
        if (status === "failed") fail = fail || errOf(d) || "O Magnific não conseguiu gerar.";
      } else {
        const r = await api("hf", key, `/requests/${job.request_id}/status`);
        const s = await r.json().catch(() => ({}));
        if (!r.ok) return json({ error: errOf(s) || `A Higgsfield respondeu ${r.status}` }, 400);
        status = s.status;
        fail = s.error || null;
        if (s.status === "completed") {
          result = { images: (s.images || []).map((x: { url: string }) => x.url), video: s.video?.url || null, expires_at: s.expires_at || null };
          if (!result.images.length && !result.video) { status = "failed"; fail = "A Higgsfield terminou sem arquivo."; }
        }
      }
      const { data: upd, error: e2 } = await db.from("estudio_jobs")
        .update({ status, error: fail, result, updated_at: new Date().toISOString() })
        .eq("id", job.id).in("status", [...OPEN]).select().maybeSingle();
      if (e2) throw e2;
      return json({ job: upd || job });
    }

    // the finished file, streamed back so the browser can store it in the room (the CDNs do not allow cross-origin reads)
    if (body.action === "file") {
      const { data: job } = await db.from("estudio_jobs").select("result").eq("id", body.job_id).single();
      const src = body.kind === "video" ? job?.result?.video : job?.result?.images?.[Number(body.index) || 0];
      if (!src) return json({ error: "Esse pedido não tem arquivo." }, 404);
      const r = await fetch(src);
      if (!r.ok || !r.body) return json({ error: `O arquivo não baixou (${r.status}).` }, 502);
      return new Response(r.body, { headers: { ...cors(origin), "Content-Type": r.headers.get("content-type") || "application/octet-stream" } });
    }

    return json({ error: "Ação desconhecida." }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
