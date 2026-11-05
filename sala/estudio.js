// Estúdio da sala
// - Desenhar (both rooms): draw and write on an image to point out what to change. Saved per option in
//   `annotations`; the client's drawings also leave a line in the item's comments so the team sees them.
// - Editar / Criar com IA (team): edit an option, or create from scratch, with the room's own files as references,
//   through the edge function `estudio` (it keeps the Magnific and Higgsfield keys on the server). Every result lands in
//   the item as a new option of the round's version, based_on the image edited, so it shows under "Mudanças que fizemos"
//   and never reaches the client until someone checks it.
// - Vídeo (team): the same bar switched to Seedance 2.5 through Higgsfield, either from a first (and last) frame or from
//   references (images, videos and the casting's voice takes, so the lips follow the voice), or to Genjutsu on a guide
//   video (a previz, a blocking, a take): its motion with the scene rebuilt from images, or the video itself with someone
//   or something swapped in. Videos land like images do.
// It lives in its own overlay outside #app: the app's re-renders and shortcuts never touch the canvas or the prompt.
// From config.js: the client's name (PROJECT.client), the film's look for Claude (ESTUDIO.look) and the product that
// joins every scene (PRODUCT, or null for a film without one).
import { PROJECT, ESTUDIO, PRODUCT } from "./config.js";
// the client's name with "da / do / de" (PROJECT.clientArticle), as app.js says it
const DA_CL = `${{ a: "da ", o: "do " }[PROJECT.clientArticle] ?? "de "}${PROJECT.client || "cliente"}`;

// what Nano Banana 2.1 gives back at 2K for each aspect it takes (4K is twice each side): an area's crop is cut to one
// of these exactly, so the result lines up with it pixel for pixel (16:9 checked on real results)
const NB_2K = { "1:1": [2048, 2048], "16:9": [2752, 1536], "9:16": [1536, 2752], "4:3": [2400, 1792], "3:4": [1792, 2400], "3:2": [2528, 1696], "2:3": [1696, 2528], "4:5": [1856, 2304], "5:4": [2304, 1856], "21:9": [3168, 1344] };
// `via` is the provider whose key the model needs on the server (see KEYS); `sizes`: the model can edit only an area
const MODELS = [
  { id: "magnific/nano-banana-2-1", via: "magnific", name: "Nano Banana 2.1", label: "Nano Banana 2.1", res: ["1k", "2k", "4k"], q: [], ar: ["auto", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "1:1", "21:9", "4:5", "5:4"], max: 14, sizes: NB_2K },
  { id: "marketing-studio/image/sunburst", via: "higgsfield", name: "GPT 2.5 Sunburst", label: "GPT Image 2.5 Sunburst", res: ["1k", "2k", "4k"], q: ["low", "medium", "high", "xhigh", "max"], ar: ["auto", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "1:1", "21:9"], max: 16 },
  { id: "marketing-studio/image/flare", via: "higgsfield", name: "GPT 2.5 Flare", label: "GPT Image 2.5 Flare", res: ["1k", "2k", "4k"], q: ["low", "medium", "high", "xhigh", "max"], ar: ["auto", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "1:1", "21:9"], max: 16 },
  { id: "xai/grok-imagine-image-2.0", via: "higgsfield", name: "Grok Imagine 2.0", label: "Grok Imagine 2.0", res: ["1k", "2k"], q: ["low", "medium"], ar: ["auto", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "1:1", "2:1", "1:2"], max: 8 },
  { id: "alibaba/qwen-image-3/edit", via: "higgsfield", name: "Qwen Image 3", label: "Qwen Image 3", res: [], q: [], ar: [], max: 3, needsImage: true },
  // a trained face (Soul ID, made in the Galeria): the base is the scene it starts from, the face is picked next to it
  { id: "higgsfield-ai/soul/v2/image-to-image", via: "higgsfield", name: "Soul 2 · rosto treinado", label: "Soul 2", res: ["720p", "1080p"], q: [], ar: ["16:9", "9:16", "4:3", "3:4", "1:1", "2:3", "3:2"], max: 1, needsImage: true, soul: true },
];
// video: Seedance 2.5 guided by references (@image1, @video1, @audio1… in the prompt; text only when nothing is attached)
// or by its first frame (the base, or the first image) and an optional last frame (the next image)
const VIDEO_MODELS = [
  { id: "bytedance/seedance-2.5/reference-to-video", via: "higgsfield", name: "Seedance 2.5 · Referências", label: "Seedance 2.5", way: "refs", ar: ["16:9", "9:16", "4:3", "3:4", "1:1", "21:9"] },
  { id: "bytedance/seedance-2.5/image-to-video", via: "higgsfield", name: "Seedance 2.5 · Primeiro e último quadro", label: "Seedance 2.5", way: "frames", ar: [] },
  // Seedance 2.5 edits one video, the first attached (@video1), with up to 5 images (@image1…), more videos and voices: the
  // result keeps that video's length, framing and timing, so it has no duration or aspect of its own
  { id: "bytedance/seedance-2.5/video-edit", via: "higgsfield", name: "Seedance 2.5 · Editar vídeo", label: "Seedance 2.5 · edição", way: "edit", ar: [] },
  // Genjutsu on a guide video (the first video attached, 4 to 30 s) and up to 8 images, Image 1, Image 2… in order (the
  // base first): motion transfer takes only the video's motion and camera and rebuilds the scene from the images (Image 1
  // leads, as the first frame); object swap keeps the video and puts the images' people, things or places in it. The
  // result is as long as the video
  { id: "higgsfield/genjutsu/motion-transfer/v1.0", via: "higgsfield", name: "Genjutsu · Transferir movimento", label: "Genjutsu · movimento", way: "guide", ar: [] },
  { id: "higgsfield/genjutsu/object-swap/v1.0", via: "higgsfield", name: "Genjutsu · Trocar objeto", label: "Genjutsu · troca", way: "guide", ar: [] },
];
const GUIDE_MAX = 8; // Genjutsu: images with the guide video
const EDIT_MAX = 5; // Seedance video edit: images with the video it edits
const TEXT_TO_VIDEO = "bytedance/seedance-2.5/text-to-video";
const DURS = [4, 5, 6, 8, 10, 12, 15, 20, 30];
// what a reference is for (Papel, in its circle's right-click menu): Melhorar tells Claude, so the prompt says what each tag
// supplies and what not to take from it; the card's kit keeps it. [key, the team's word, Claude's words]
const ROLES = {
  image: [["first", "Primeiro quadro", "the first frame: the shot opens on this picture"], ["last", "Último quadro", "the last frame: the shot ends on this picture"],
    ["key", "Quadro-chave", "a keyframe of the shot, in the order the keyframes come"], ["face", "Personagem · rosto", "a character's face and likeness only"],
    ["costume", "Figurino", "a costume only"], ["place", "Locação", "the location only"], ["product", "Produto", "the product only: its look and its lights"],
    ["style", "Estilo e luz", "the light and the color only"],
    // Pessoa em 3D: the shot with each person as a colored mannequin (sala/pessoa3d.js)
    ["pose", "Espaço e posição", "only the space, the camera and where each person stands and how they pose: each colored mannequin is one person, a placeholder, so nothing of anyone's face, hair or clothes comes from it"]],
  video: [["guide", "Guia de tempo e câmera", "only the timing, the camera moves and the cuts"],
    ["blocking", "Blocking (bonecos)", "only the camera position and moves; its figures are placeholders, so not their poses or body mechanics"],
    ["motion", "Movimento", "only how the subject moves"], ["product", "Produto", "only how the product looks and lights up"], ["style", "Estilo e luz", "only the light and the color"]],
  audio: [["voice", "Voz e tempo das falas", "the voices and the timing of the lines"], ["timing", "Só o tempo das falas", "only the timing of the lines; the voices are generated"],
    ["music", "Música", "the music"], ["sfx", "Som ambiente", "the ambience and the sound effects"]],
};
const roleOf = (r) => (r?.role && (ROLES[r.kind || "image"] || []).find(([k]) => k === r.role)) || null;
const roleSays = (r) => { const x = roleOf(r); return x ? ` (its role: ${x[2]})` : ""; };
// a video reference edited from its circle's menu, by model
const EDIT_SAYS = { "bytedance/seedance-2.5/video-edit": "troca o visual, fica o tempo", "higgsfield/genjutsu/motion-transfer/v1.0": "só o movimento e a câmera", "higgsfield/genjutsu/object-swap/v1.0": "troca uma pessoa ou coisa" };
const VRES = ["480p", "720p", "1080p"];
const VMAX = { image: [9, "imagens"], video: [3, "vídeos"], audio: [3, "vozes"] };
// the room's bucket keeps files up to 50 MB
const MAX_FILE = 50 * 1024 * 1024;
// which providers have a key on the server, asked each time the studio opens: null = no key, false = key refused,
// undefined = not known yet (then every model stays available and Gerar shows the server's answer)
const KEYS = {};
const ready = (m) => KEYS[m.via] !== null && KEYS[m.via] !== false;
// Melhorar (Claude writes the prompt) needs its own key: KEYS.claude
const canWrite = () => KEYS.claude !== null && KEYS.claude !== false;
const Q_LABEL = { low: "Rápida", medium: "Média", high: "Alta", xhigh: "Muito alta", max: "Máxima" };
const COLORS = ["#FF453A", "#FFD60A", "#FFFFFF", "#34F58E"];
const OPEN = new Set(["queued", "in_progress"]);
const DONE = new Set(["imported", "failed", "nsfw", "canceled"]);
const SVG = (d, extra = "") => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${d}</svg>`;
export const ICONS = {
  move: SVG('<path d="M3.5 2.5l9.2 4.3-4 1.2-1.6 4z"/>'),
  spark: SVG('<path d="M7.5 1.5l1.4 3.6 3.6 1.4-3.6 1.4-1.4 3.6-1.4-3.6L2.5 6.5l3.6-1.4z"/><path d="M12.5 10.5v4M10.5 12.5h4"/>'),
  pen: SVG('<path d="M2.5 13.5l.8-3.2 7.9-7.9 2.4 2.4-7.9 7.9z"/><path d="M9.6 4l2.4 2.4"/>'),
  arrow: SVG('<path d="M3 13L12.5 3.5M6.5 3.5h6v6"/>'),
  box: SVG('<rect x="2.5" y="3.5" width="11" height="9" rx="1.2"/>'),
  text: SVG('<path d="M3 3.5h10M8 3.5v9.5M6 13h4"/>'),
  undo: SVG('<path d="M5.5 3.5L2.5 6.5l3 3"/><path d="M2.5 6.5h7a3.5 3.5 0 0 1 0 7H8"/>'),
  clear: SVG('<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"/>'),
  eye: SVG('<path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8z"/><circle cx="8" cy="8" r="1.8"/>'),
  plus: SVG('<path d="M8 3v10M3 8h10"/>'),
  x: SVG('<path d="M4 4l8 8M12 4l-8 8"/>'),
  back: SVG('<path d="M9.5 3.5 5 8l4.5 4.5"/>'),
  check: SVG('<path d="M3 8.5l3.2 3L13 4.5"/>'),
  film: SVG('<rect x="2" y="3.5" width="12" height="9" rx="1.5"/><path d="M6.5 6.2v3.6L9.6 8z"/>'),
  wand: SVG('<path d="M2.5 13.5l8-8M9 4l2 2"/><path d="M12.5 1.5v2.4M11.3 2.7h2.4M14 7v1.6M13.2 7.8h1.6M5.5 1.5v1.6M4.7 2.3h1.6"/>'),
  history: SVG('<path d="M2.6 8a5.4 5.4 0 1 0 1.6-3.8"/><path d="M2.4 2.6v2.7h2.7"/><path d="M8 5.2v3l2.1 1.3"/>'),
  image: SVG('<rect x="2" y="3" width="12" height="10" rx="1.5"/><circle cx="6" cy="6.5" r="1.1"/><path d="M3 12l3.5-3.5 2.5 2.5 2-2 3 3"/>'),
  aspect: SVG('<rect x="1.8" y="4" width="12.4" height="8" rx="1.4"/>'),
  clock: SVG('<circle cx="8" cy="8" r="5.6"/><path d="M8 4.9V8l2.1 1.3"/>'),
  layers: SVG('<path d="M8 2.2l5.8 3L8 8.2 2.2 5.2z"/><path d="M2.2 8.1L8 11.1l5.8-3"/><path d="M2.2 10.9L8 13.9l5.8-3"/>'),
  card: SVG('<rect x="2.5" y="2.5" width="11" height="11" rx="2"/><path d="M8 5.6v4.8M5.6 8h4.8"/>'),
  sound: SVG('<path d="M2.8 6.2h2.3L8.4 3.6v8.8L5.1 9.8H2.8z"/><path d="M10.8 5.6a3.2 3.2 0 0 1 0 4.8M12.6 3.9a5.6 5.6 0 0 1 0 8.2"/>'),
  mute: SVG('<path d="M2.8 6.2h2.3L8.4 3.6v8.8L5.1 9.8H2.8z"/><path d="M11 6.3l3 3.4M14 6.3l-3 3.4"/>'),
  wave: SVG('<path d="M2.5 7v2M5 5v6M7.5 3v10M10 5.5v5M12.5 7v2"/>'),
  area: SVG('<path d="M2.5 5.5v-3h3M10.5 2.5h3v3M13.5 10.5v3h-3M5.5 13.5h-3v-3"/><rect x="5.5" y="5.5" width="5" height="5" rx="0.6"/>'),
  crop: SVG('<path d="M4.5 1.5v9a1 1 0 0 0 1 1h9"/><path d="M1.5 4.5h9a1 1 0 0 1 1 1v9"/>'),
  minus: SVG('<path d="M3 8h10"/>'),
  rotl: SVG('<path d="M2.8 8.6A5.3 5.3 0 1 0 4.6 4.3"/><path d="M4.8 1.9l-.3 2.7 2.7.3"/>'),
  rotr: SVG('<path d="M13.2 8.6A5.3 5.3 0 1 1 11.4 4.3"/><path d="M11.2 1.9l.3 2.7-2.7.3"/>'),
  flipx: SVG('<path d="M8 1.5v13" stroke-dasharray="1.6 1.8"/><path d="M6 4.5L2 11.5h4zM10 4.5l4 7h-4z"/>'),
  flipy: SVG('<path d="M1.5 8h13" stroke-dasharray="1.6 1.8"/><path d="M4.5 6L11.5 2v4zM4.5 10l7 4v-4z"/>'),
  reset: SVG('<path d="M2.6 8a5.4 5.4 0 1 0 1.6-3.8"/><path d="M2.4 2.6v2.7h2.7"/>'),
  search: SVG('<circle cx="7" cy="7" r="4.5"/><path d="M10.4 10.4l3.6 3.6"/>'),
  face: SVG('<circle cx="8" cy="6.2" r="2.8"/><path d="M2.8 14c.6-2.8 2.7-4.4 5.2-4.4s4.6 1.6 5.2 4.4"/>'),
  camera: SVG('<path d="M1.8 5.4h2.7l1.2-1.9h4.6l1.2 1.9h2.7v7.3H1.8z"/><circle cx="8" cy="8.9" r="2.4"/>'),
  book: SVG('<path d="M8 4.6C6.6 3.6 4.6 3.2 2.2 3.4v9c2.4-.2 4.4.2 5.8 1.2 1.4-1 3.4-1.4 5.8-1.2v-9c-2.4-.2-4.4.2-5.8 1.2z"/><path d="M8 4.6v9"/>'),
};

const E = { ctx: null, root: null };
const esc = (s) => E.ctx.esc(s);
const $ = (sel) => E.root?.querySelector(sel);
const model = () => MODELS.find((m) => m.id === E.model) || MODELS[0];
const vmodel = () => VIDEO_MODELS.find((m) => m.id === E.vmodel) || VIDEO_MODELS[0];
const isVideo = () => E.mode !== "draw" && E.kind === "video";
const clamp = (v) => Math.max(0, Math.min(1, v));
// an option by its id, from one index per list of options (the room swaps the list on every load; a push changes its length)
let OPTS = null;
const optOf = (id) => {
  const all = E.ctx.S.options;
  if (OPTS?.all !== all || OPTS.n !== all.length) OPTS = { all, n: all.length, by: new Map(all.map((o) => [o.id, o])) };
  return OPTS.by.get(id);
};
const isImg = (o) => o && !o.mime.startsWith("video/");
const ago = (ts) => { const s = Math.max(0, (Date.now() - new Date(ts)) / 1000); return s < 60 ? `${Math.round(s)}s` : s < 3600 ? `${Math.round(s / 60)} min` : new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); };
const thumbUrl = (o) => E.ctx.urls.get(o.thumb_path || o.preview_path || o.path) || "";
const bigUrl = (o) => E.ctx.urls.get(o.preview_path || o.path) || "";
// Versões: an image and its edits are one card (options.stack points at the original, whose face is the version on the
// card). An edit's result joins the stack of the image it was made from, unless "Card novo" is picked in the bar.
const rootOf = (o) => (o ? optOf(o.stack || o.id) || o : null);
const membersOf = (root) => (root ? [root, ...E.ctx.S.options.filter((x) => x.stack === root.id).sort((a, b) => a.created_at.localeCompare(b.created_at))] : []);
const faceIdOf = (root) => (root?.face && optOf(root.face)?.stack === root.id ? root.face : root?.id);
const stack = () => (E.mode === "edit" && E.base?.id && isImg(E.base) ? membersOf(rootOf(E.base)) : []);
const shownOpt = () => (E.view ? optOf(E.view) : E.base);
// the drawer (Versões, results, drawings) on the right: open or closed, remembered on this computer
const drawerPref = () => { try { return localStorage.getItem("sala-est-drawer") !== "off"; } catch { return true; } };
// the prompt floats over the image; it can fold away so the image is whole (remembered on this computer too)
const barPref = () => { try { return localStorage.getItem("sala-est-bar") !== "off"; } catch { return true; } };
// and it can grow upward over the picture, for a long prompt (the arrow next to the fold; remembered too)
const bigPref = () => { try { return localStorage.getItem("sala-est-big") === "on"; } catch { return false; } };
const rootClass = () => `est est-${E.mode}${E.drawer ? "" : " drawer-off"}${E.barOn === false ? " bar-off" : ""}${E.barBig ? " bar-big" : ""}`;
const FOLD = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>';
const growSays = () => (E.barBig ? "Voltar o prompt ao tamanho normal" : "Expandir o prompt pra cima: mais linhas do texto e as bolinhas abertas");
const foldHtml = () => `<button class="est-grow" data-k="grow" title="${growSays()}" aria-label="${growSays()}" aria-pressed="${!!E.barBig}">${FOLD}</button><button class="est-fold" data-k="fold" title="Esconder o prompt: a imagem fica inteira" aria-label="Esconder o prompt">${FOLD}</button>`;
const unfoldHtml = () => `<button class="est-unfold" data-k="fold" title="Mostrar o prompt" aria-label="Mostrar o prompt">${ICONS.spark}<span>Prompt</span></button>`;

// ---------- the edge function ----------
async function call(action, payload = {}, raw = false) {
  const { data } = await E.ctx.sb.auth.getSession();
  const r = await fetch(E.ctx.fnUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token}`, apikey: E.ctx.anonKey },
    body: JSON.stringify({ action, ...payload, schema: E.ctx.schema, bucket: E.ctx.bucket }), // the room's schema and bucket
  });
  if (raw && r.ok) return r.blob();
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(out.error || `O estúdio respondeu ${r.status}`);
  return out;
}

// ---------- jobs: one engine for the open studio and for the background (a closed tab never loses a result) ----------
const JOBS = new Map();
let ticker = null;
const listeners = new Set();
// an edit of a reference (a click on its circle in another generation's bar): job id → the reference its result goes back into
const SWAPS = new Map();
// a Pessoa em 3D asked from a circle's menu: job id → the reference whose shot it is (its result comes in right after it)
const ADDS = new Map();
function track(job) {
  const was = JOBS.get(job.id)?.status;
  JOBS.set(job.id, { ...JOBS.get(job.id), ...job });
  // one that fails while no open studio shows its item says so: its card just stops showing it as running (making)
  if (OPEN.has(was) && (job.status === "failed" || job.status === "nsfw") && !(E.root && E.item?.id === job.item_id))
    E.ctx?.toast(`✦ ${E.ctx.itemOf(job.item_id)?.title || "Um card"}: ${job.status === "nsfw" ? "o modelo recusou o pedido" : "a geração não saiu"}${job.error ? ` (${String(job.error).slice(0, 140)})` : ""}`, true);
  const ref = DONE.has(job.status) && SWAPS.get(job.id);
  if (ref) {
    SWAPS.delete(job.id);
    ref.wait = Math.max(0, (ref.wait || 1) - 1);
    if (job.status === "imported" && job.imported?.length) swapRef(ref, job.imported.at(-1));
    else if (E.root) syncChips();
  }
  const add = DONE.has(job.status) && ADDS.get(job.id);
  if (add) {
    ADDS.delete(job.id);
    if (job.status === "imported" && job.imported?.length) addAfter(add, job.imported[0]);
    else if (E.root) syncChips();
  }
  listeners.forEach((f) => f());
  if (!ticker) ticker = setInterval(tick, 4000);
}
// the room's cards show what the studio is still making for them (Cena 3D's Renderizar sends the room to such a card)
export const making = (itemId = null) => [...JOBS.values()].filter((j) => !DONE.has(j.status) && (!itemId || j.item_id === itemId));
export const onJobs = (f) => listeners.add(f);
async function tick() {
  const live = [...JOBS.values()].filter((j) => !DONE.has(j.status));
  if (!live.length) { clearInterval(ticker); ticker = null; return; }
  for (const j of live) {
    if (j._busy) continue;
    // a video takes minutes: ask about it every 12 s instead of every tick
    if (j.mode === "video" && OPEN.has(j.status) && Date.now() - (j._at || 0) < 12e3) continue;
    j._busy = true;
    j._at = Date.now();
    try {
      if (OPEN.has(j.status)) { const { job } = await call("status", { job_id: j.id }); track(job); }
      else if (j.status === "importing") {
        // another tab is storing it; if that tab died midway (5 min), hand it back so this one finishes the job
        const stale = new Date(Date.now() - 3e5).toISOString();
        await E.ctx.sb.from("estudio_jobs").update({ status: "completed" }).eq("id", j.id).eq("status", "importing").lt("updated_at", stale);
        const { data } = await E.ctx.sb.from("estudio_jobs").select("*").eq("id", j.id).single();
        if (data) track(data);
      }
      const cur = JOBS.get(j.id);
      if (cur.status === "completed") await importJob(cur);
    } catch (e) { console.error(e); }
    const cur = JOBS.get(j.id);
    if (cur) cur._busy = false;
  }
}
// takes the job (so two open tabs never import it twice), stores each image or video in the item as a new option, marks it imported
async function importJob(job) {
  // the areas of one Gerar come back together, as one version
  if (job.input?.group) return importGroup(job);
  // Pessoa em 3D: the bodies are drawn over the shot here, in the browser
  if (job.model === P3D) return importBody(job);
  const { sb } = E.ctx;
  const { data: claimed } = await sb.from("estudio_jobs").update({ status: "importing", updated_at: new Date().toISOString() }).eq("id", job.id).eq("status", "completed").select().maybeSingle();
  if (!claimed) { track({ ...job, status: "importing" }); return; }
  track(claimed);
  try {
    const it = E.ctx.itemOf(job.item_id);
    const version = E.ctx.roundOf(it?.round_id)?.version || 1;
    const ids = [];
    // an edit made as a version joins the stack of the image it came from, and becomes the card's face; an edit of a
    // reference joins the stack too but leaves the card's face alone (it was made for one generation)
    const root = (job.mode === "version" || job.mode === "ref") && job.base_option ? rootOf(optOf(job.base_option)) : null;
    // an edit of only an area comes back as that area: it goes back into the whole picture before it is stored
    const area = job.input?.area || null;
    const outs = [...(job.result?.images || []).map((_, index) => ({ index })), ...(job.result?.video ? [{ kind: "video" }] : [])];
    for (const [i, w] of outs.entries()) {
      let blob = await call("file", { job_id: job.id, ...w }, true);
      const vid = w.kind === "video";
      if (blob.size > MAX_FILE) throw Object.assign(new Error(`o arquivo tem ${Math.round(blob.size / 1048576)} MB e a sala guarda até 50 MB; gere com menos duração ou resolução`), { final: true });
      if (area && !vid) blob = (await areaComposite([{ a: area, blob }]).catch((e) => { throw areaFail(job.id, e); })).blob;
      const type = blob.type && blob.type.startsWith(vid ? "video/" : "image/") ? blob.type : vid ? "video/mp4" : "image/png";
      const file = new File([blob], `estudio-${job.id.slice(0, 8)}-${i + 1}.${type.split("/")[1].replace("jpeg", "jpg").replace("quicktime", "mov")}`, { type });
      const m = await E.ctx.putFile(`items/${job.item_id}`, file);
      const { data: o, error } = await sb.from("options").insert({
        item_id: job.item_id, path: m.path, preview_path: m.preview_path, thumb_path: m.thumb_path, mime: m.mime, name: m.name,
        created_by: job.created_by || E.ctx.myName(), version, based_on: job.base_option || null, stack: root && !vid ? root.id : null,
        // the caption is the line the client reads under the image: it starts empty (the prompt stays in prompt)
        caption: "", model: job.label || job.model,
        prompt: [job.input?.soul && soulLine(job.input.soul), job.input?.ajuste && xfLine(job.input.ajuste), camLine(job.input?.camera), recLine(job.input?.recipes), area && areaLine(area), job.input?.prompt || job.prompt || ""].filter(Boolean).join("\n\n"),
        reasoning: area ? `Feito no estúdio editando só uma área${job.base_option ? " de outra opção" : ""}: o modelo gerou a área ampliada e ela voltou pra imagem inteira, que fora dela ficou igual.` : `Feito no estúdio${job.base_option ? " a partir de outra opção" : ""}.`,
      }).select().single();
      if (error) throw error;
      ids.push(o.id);
    }
    if (root && ids.length && job.mode === "version") await sb.from("options").update({ face: ids.at(-1) }).eq("id", root.id);
    const { data: done } = await sb.from("estudio_jobs").update({ status: "imported", imported: ids, updated_at: new Date().toISOString() }).eq("id", job.id).select().single();
    await E.ctx.refresh();
    // the studio open on this image shows the new version (unless a drawing is in progress there)
    if (root && ids.length && E.root && E.base && rootOf(E.base)?.id === root.id && !hasDrawing()) { E.view = ids.at(-1); syncStage(); }
    track(done || { ...job, status: "imported", imported: ids });
    const what = job.result?.video ? (ids.length > 1 ? `${ids.length} vídeos novos` : "Vídeo novo") : ids.length > 1 ? `${ids.length} imagens novas` : "Imagem nova";
    E.ctx.toast(`✦ ${what} em ${it?.title || "item"}`);
  } catch (e) {
    console.error(e);
    // a file too big for the room (or an area that keeps failing to go back in) fails for good; anything else goes back
    // to the queue for the next tick
    const error = e.final ? e.note || `Não coube na sala: ${e.message}` : null;
    await sb.from("estudio_jobs").update({ status: e.final ? "failed" : "completed", error, updated_at: new Date().toISOString() }).eq("id", job.id);
    track({ ...job, status: e.final ? "failed" : "completed", error });
    E.ctx.toast(`Não consegui guardar o resultado: ${e.message || e}`, true);
  }
}
// the areas of one Gerar (input.group: {id, n, i, label}) are jobs of their own and come back one by one. Once none is
// still being made, the first tab to see it takes the ones that came back, puts them all into the base in their numbers'
// order (where two cross, the higher number stays on top) and stores one version, naming in its prompt any that failed
const GROUP_SEEN = new Map();
async function importGroup(job) {
  const { sb } = E.ctx, g = job.input.group;
  // one look per group and tick, whichever of its jobs asks
  if (Date.now() - (GROUP_SEEN.get(g.id) || 0) < 3000) return;
  GROUP_SEEN.set(g.id, Date.now());
  const { data: all } = await sb.from("estudio_jobs").select("*").eq("input->group->>id", g.id);
  if (!all?.length) return;
  for (const s of all) if (JOBS.get(s.id)?.status !== s.status) track(s);
  // still being made, or being stored by another tab; a Gerar cut short (its tab closed while sending) waits two minutes
  const sent = Math.max(...all.map((s) => Date.parse(s.created_at)));
  if (all.some((s) => OPEN.has(s.status) || s.status === "importing") || (all.length < g.n && Date.now() - sent < 12e4)) return;
  const { data: mine } = await sb.from("estudio_jobs").update({ status: "importing", updated_at: new Date().toISOString() }).eq("input->group->>id", g.id).eq("status", "completed").select();
  if (!mine?.length) return;
  mine.forEach(track);
  const ids = mine.map((s) => s.id);
  try {
    const parts = [], lost = all.filter((s) => s.status === "failed" || s.status === "nsfw" || s.status === "canceled");
    for (const s of [...mine].sort((a, b) => a.input.group.i - b.input.group.i)) {
      if (!s.result?.images?.length) { lost.push({ ...s, error: "voltou sem imagem" }); continue; }
      const blob = await call("file", { job_id: s.id, index: 0 }, true);
      if (blob.size > MAX_FILE) throw Object.assign(new Error(`a área ${s.input.group.i + 1} tem ${Math.round(blob.size / 1048576)} MB e a sala guarda até 50 MB`), { final: true });
      parts.push({ a: s.input.area, job: s, blob });
    }
    if (!parts.length) throw Object.assign(new Error("nenhuma área voltou com imagem"), { final: true, note: "Nenhuma área voltou com imagem." });
    const out = (await areaComposite(parts).catch((e) => { throw areaFail(g.id, e); })).blob;
    const first = parts[0].job, it = E.ctx.itemOf(first.item_id);
    const version = E.ctx.roundOf(it?.round_id)?.version || 1;
    const root = (first.mode === "version" || first.mode === "ref") && first.base_option ? rootOf(optOf(first.base_option)) : null;
    const type = out.type && out.type.startsWith("image/") ? out.type : "image/png";
    const file = new File([out], `estudio-${g.id.slice(0, 8)}-areas.${type.split("/")[1].replace("jpeg", "jpg")}`, { type });
    const m = await E.ctx.putFile(`items/${first.item_id}`, file);
    const { data: o, error } = await sb.from("options").insert({
      item_id: first.item_id, path: m.path, preview_path: m.preview_path, thumb_path: m.thumb_path, mime: m.mime, name: m.name,
      created_by: first.created_by || E.ctx.myName(), version, based_on: first.base_option || null, stack: root ? root.id : null,
      caption: "", model: g.label || first.label || first.model,
      prompt: [first.input?.ajuste && xfLine(first.input.ajuste), areasText(parts, lost, g.n)].filter(Boolean).join("\n\n"),
      reasoning: `Feito no estúdio editando ${g.n} áreas${first.base_option ? " de outra opção" : ""}: o modelo gerou cada área ampliada, e elas voltaram juntas pra imagem inteira, que fora delas ficou igual.${lost.length ? ` ${lostLine(lost)}` : ""}`,
    }).select().single();
    if (error) throw error;
    if (root && first.mode === "version") await sb.from("options").update({ face: o.id }).eq("id", root.id);
    const { data: done } = await sb.from("estudio_jobs").update({ status: "imported", imported: [o.id], updated_at: new Date().toISOString() }).in("id", ids).select();
    await E.ctx.refresh();
    if (root && E.root && E.base && rootOf(E.base)?.id === root.id && !hasDrawing()) { E.view = o.id; syncStage(); }
    for (const s of mine) track(done?.find((d) => d.id === s.id) || { ...s, status: "imported", imported: [o.id] });
    E.ctx.toast(lost.length ? `✦ Versão nova em ${it?.title || "item"} com ${parts.length} de ${g.n} áreas · ${lostLine(lost)}` : `✦ ${g.n} áreas numa versão nova em ${it?.title || "item"}`);
  } catch (e) {
    console.error(e);
    const error = e.final ? e.note || `Não coube na sala: ${e.message}` : null;
    await sb.from("estudio_jobs").update({ status: e.final ? "failed" : "completed", error, updated_at: new Date().toISOString() }).in("id", ids);
    for (const s of mine) track({ ...s, status: e.final ? "failed" : "completed", error });
    E.ctx.toast(`Não consegui guardar as áreas: ${e.message || e}`, true);
  }
}
// Pessoa em 3D: the first tab to take the job draws the bodies the fal found over the shot (sala/pessoa3d.js) and stores
// that picture as a new card of the shot's item, based on it, with no ✓; the GLB is stored next to it and kept in the
// job (result.glb_path, for Baixar o corpo 3D) with the camera used and the people's colors. The shot's own pixels are
// read and saved with its color tags, as the areas are
async function importBody(job) {
  const { ctx } = E, { sb } = ctx;
  const { data: claimed } = await sb.from("estudio_jobs").update({ status: "importing", updated_at: new Date().toISOString() }).eq("id", job.id).eq("status", "completed").select().maybeSingle();
  if (!claimed) { track({ ...job, status: "importing" }); return; }
  track(claimed);
  const final = (note) => Object.assign(new Error(note), { final: true, note });
  try {
    const src = optOf(job.base_option), path = src?.path || job.input?.image_url, sent = job.input?.image_url || path;
    if (!path) throw final("O shot não está mais na sala.");
    const it = ctx.itemOf(job.item_id), version = ctx.roundOf(it?.round_id)?.version || 1;
    await ctx.sign([path, sent]);
    const file = await (await fetch(ctx.urls.get(path))).blob(), tags = await pngTags(file);
    const photo = await createImageBitmap(file, readAs(tags));
    // the size of the picture the model saw: the shot itself, or a smaller copy of it
    let inW = photo.width, inH = photo.height;
    if (sent !== path) { const b = await createImageBitmap(await (await fetch(ctx.urls.get(sent))).blob()); inW = b.width; inH = b.height; b.close?.(); }
    const glb = await (await call("file", { job_id: job.id, kind: "glb" }, true)).arrayBuffer();
    const { drawBodies, peopleLine } = await import("./pessoa3d.js");
    const { canvas, people, camera } = await drawBodies({ glb, meta: job.result?.meta, inW, inH, W: photo.width, H: photo.height })
      .catch((e) => { throw final(`Não deu pra desenhar os corpos: ${e.message || e}`); });
    const c = canvasOf(photo.width, photo.height), g = c.getContext("2d");
    g.drawImage(photo, 0, 0);
    g.drawImage(canvas, 0, 0, photo.width, photo.height);
    photo.close?.();
    const blobOf = (type, q) => new Promise((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error("a imagem saiu vazia"))), type, q));
    let out = await withTags(await blobOf("image/png"), tags);
    if (out.size > MAX_FILE) out = await blobOf("image/jpeg", 0.92);
    const stem = `pessoa3d-${job.id.slice(0, 8)}`;
    const m = await ctx.putFile(`items/${job.item_id}`, new File([out], `${stem}.${out.type === "image/png" ? "png" : "jpg"}`, { type: out.type }));
    const gm = await ctx.putFile(`items/${job.item_id}`, new File([glb], `${stem}.glb`, { type: "model/gltf-binary" }));
    const who = peopleLine(people), label = job.refs?.[0]?.label || src?.name || "o shot";
    const { data: o, error } = await sb.from("options").insert({
      item_id: job.item_id, path: m.path, preview_path: m.preview_path, thumb_path: m.thumb_path, mime: m.mime, name: m.name,
      created_by: job.created_by || ctx.myName(), version, based_on: job.base_option || null, stack: null,
      caption: "", model: job.label || P3D_LABEL,
      prompt: `${P3D_LABEL} (fal · SAM 3D Body) de ${label}. ${people.length > 1 ? `${people.length} pessoas, da esquerda pra direita: ${who}` : `Boneco ${who}`}, no lugar e na pose de cada uma, desenhados por cima do shot com a câmera que o modelo estimou.`,
      reasoning: "Referência de espaço e posição: com o papel Espaço e posição, o lugar, a câmera e a pose vêm daqui; o rosto vem das fotos e a roupa da ficha. O corpo em 3D (GLB) ficou guardado junto: no estúdio, botão direito na bolinha › Baixar o corpo 3D.",
      refs: src ? [{ label, path: src.path, thumb: src.thumb_path || null }] : [],
    }).select().single();
    if (error) throw error;
    const { data: done } = await sb.from("estudio_jobs").update({ status: "imported", imported: [o.id], result: { ...(job.result || {}), glb_path: gm.path, camera, people }, updated_at: new Date().toISOString() })
      .eq("id", job.id).select().single();
    await ctx.refresh();
    track(done || { ...job, status: "imported", imported: [o.id] });
    ctx.toast(`✦ ${P3D_LABEL} em ${it?.title || "item"}: ${people.length > 1 ? `${people.length} pessoas (${who})` : `boneco ${who}`}`);
  } catch (e) {
    console.error(e);
    // what cannot work (no shot, nothing drawn) fails for good; anything else goes back to the queue for the next tick
    const error = e.final ? e.note : null;
    await sb.from("estudio_jobs").update({ status: e.final ? "failed" : "completed", error, updated_at: new Date().toISOString() }).eq("id", job.id);
    track({ ...job, status: e.final ? "failed" : "completed", error });
    ctx.toast(`Não consegui guardar a pessoa em 3D: ${e.message || e}`, true);
  }
}
const lostLine = (lost) => {
  const n = lost.map((s) => s.input.group.i + 1).sort((a, b) => a - b);
  return n.length > 1 ? `As áreas ${n.slice(0, -1).join(", ")} e ${n.at(-1)} não voltaram.` : `A área ${n[0]} não voltou.`;
};
// the top of a version made of several areas: how they went back in, then each one where it is, with its references and
// its text, and the ones that did not come back
function areasText(parts, lost, n) {
  const refsOf = (s) => (s.refs || []).map((r) => r.label).filter((l) => l && l !== "Base" && l !== "Desenho");
  return [
    `Edição de ${n} áreas: cada uma foi gerada ampliada e recolocada na original com a borda suave e a cor acertada pela faixa em volta; onde duas se cruzam, fica a de número maior.`,
    ...parts.map(({ a, job }) => { const r = refsOf(job); return `Área ${job.input.group.i + 1}: ${a.box[2]}×${a.box[3]} px em x ${a.box[0]}, y ${a.box[1]} de ${a.W}×${a.H}, ampliada ${String(a.s).replace(".", ",")}×${r.length ? ` · referências: ${r.join(", ")}` : ""}\n${job.prompt || ""}`.trim(); }),
    ...lost.map((s) => `Área ${s.input.group.i + 1}: não voltou${s.error ? ` (${String(s.error).slice(0, 160)})` : ""}.${s.prompt ? `\n${s.prompt}` : ""}`),
  ].join("\n\n");
}
// team, once after the room loads: picks up generations still running or finished while no tab was open
export async function resume(ctx) {
  E.ctx = ctx;
  const since = new Date(Date.now() - 3 * 864e5).toISOString();
  const stale = new Date(Date.now() - 5 * 6e4).toISOString();
  const { data } = await ctx.sb.from("estudio_jobs").select("*").gte("created_at", since)
    .or(`status.in.(queued,in_progress,completed),and(status.eq.importing,updated_at.lt.${stale})`);
  for (const j of data || []) track(j.status === "importing" ? { ...j, status: "completed" } : j);
}

// ---------- drawing ----------
function paint(g, W, H, strokes, notes, alpha = 1) {
  g.save();
  g.globalAlpha = alpha;
  g.lineCap = "round";
  g.lineJoin = "round";
  const u = Math.min(W, H);
  for (const s of strokes) {
    g.strokeStyle = s.c;
    g.fillStyle = s.c;
    g.lineWidth = Math.max(2, (s.w || 0.005) * u);
    const P = s.p.map(([x, y]) => [x * W, y * H]);
    if (s.t === "pen") {
      g.beginPath();
      P.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      if (P.length === 1) { g.arc(P[0][0], P[0][1], g.lineWidth / 2, 0, 7); g.fill(); } else g.stroke();
    } else if (s.t === "box" && P.length === 2) {
      g.strokeRect(Math.min(P[0][0], P[1][0]), Math.min(P[0][1], P[1][1]), Math.abs(P[1][0] - P[0][0]), Math.abs(P[1][1] - P[0][1]));
    } else if (s.t === "arrow" && P.length === 2) {
      const [[x0, y0], [x1, y1]] = P;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      const a = Math.atan2(y1 - y0, x1 - x0), L = Math.max(12, g.lineWidth * 4);
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x1 - L * Math.cos(a - 0.45), y1 - L * Math.sin(a - 0.45));
      g.lineTo(x1 - L * Math.cos(a + 0.45), y1 - L * Math.sin(a + 0.45));
      g.closePath(); g.fill();
    }
  }
  notes.forEach((n, i) => {
    const q = noteGeom(g, W, H, n);
    g.fillStyle = n.c;
    g.beginPath(); g.arc(q.x, q.y, q.r, 0, 7); g.fill();
    g.fillStyle = "#0A0C0B";
    g.font = `700 ${Math.round(q.r * 1.1)}px "DM Sans", system-ui, sans-serif`;
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(String(i + 1), q.x, q.y + 1);
    if (n.text) {
      g.font = `600 ${q.fs}px "DM Sans", system-ui, sans-serif`;
      g.fillStyle = "rgba(5, 7, 6, 0.82)";
      g.fillRect(q.bx, q.by, q.bw, q.bh);
      g.fillStyle = "#fff"; g.textAlign = "left";
      g.fillText(n.text, q.bx + 7, q.y + 1);
    }
  });
  g.restore();
}
// where a numbered note sits on a W×H picture: its dot (x, y, r) and its label's box
function noteGeom(g, W, H, n) {
  const x = n.x * W, y = n.y * H, r = Math.max(10, Math.min(W, H) * 0.016);
  if (!n.text) return { x, y, r, bw: 0 };
  const fs = Math.round(r * 1.05);
  g.save();
  g.font = `600 ${fs}px "DM Sans", system-ui, sans-serif`;
  const tw = g.measureText(n.text).width;
  g.restore();
  return { x, y, r, fs, bx: Math.max(4, Math.min(x + r + 6, W - tw - 18)), by: y - fs, bw: tw + 14, bh: fs * 2 };
}
function redraw() {
  const c = $(".est-canvas"), img = $(".est-img");
  if (!c || !img) return;
  const dpr = window.devicePixelRatio || 1, W = img.clientWidth, H = img.clientHeight;
  if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
  c.style.width = `${W}px`; c.style.height = `${H}px`;
  const g = c.getContext("2d");
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, c.width, c.height);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  syncAreas();
  if (E.view) return;
  paintArea(g, W, H, true);
  for (const a of annotationsOf()) if (E.shown.has(a.id)) paint(g, W, H, a.strokes || [], a.notes || [], 0.95);
  paint(g, W, H, E.live ? [...E.strokes, E.live] : E.strokes, E.notes);
  const b = selBounds(g, W, H);
  if (b) {
    g.save();
    g.lineWidth = 1.5;
    g.setLineDash([5, 4]);
    for (const [color, off] of [["#fff", 0], ["#0A0C0B", 4.5]]) { g.strokeStyle = color; g.lineDashOffset = off; g.strokeRect(b.x - 6, b.y - 6, b.w + 12, b.h + 12); }
    g.restore();
  }
  paintArea(g, W, H, false);
}
const hasDrawing = () => E.strokes.length > 0 || E.notes.length > 0;
// ---------- Mover: pick a mark of the drawing in progress, drag it, Delete removes it, a double click edits a note ----------
const segDist = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};
// the mark under a point, topmost first (notes are painted over the strokes): {k: "n" | "s", i} or null
function hitTest([px, py]) {
  const c = $(".est-canvas"), W = c.clientWidth, H = c.clientHeight, g = c.getContext("2d"), X = px * W, Y = py * H;
  for (let i = E.notes.length - 1; i >= 0; i--) {
    const q = noteGeom(g, W, H, E.notes[i]);
    if (Math.hypot(X - q.x, Y - q.y) <= q.r + 4 || (q.bw && X >= q.bx && X <= q.bx + q.bw && Y >= q.by && Y <= q.by + q.bh)) return { k: "n", i };
  }
  for (let i = E.strokes.length - 1; i >= 0; i--) {
    const s = E.strokes[i], P = s.p.map(([x, y]) => [x * W, y * H]), tol = 8 + Math.max(2, (s.w || 0.005) * Math.min(W, H)) / 2;
    const segs = s.t === "box" && P.length === 2
      ? [[P[0][0], P[0][1], P[1][0], P[0][1]], [P[1][0], P[0][1], P[1][0], P[1][1]], [P[1][0], P[1][1], P[0][0], P[1][1]], [P[0][0], P[1][1], P[0][0], P[0][1]]]
      : P.length === 1 ? [[...P[0], ...P[0]]] : P.slice(1).map((q, j) => [...P[j], ...q]);
    if (segs.some(([ax, ay, bx, by]) => segDist(X, Y, ax, ay, bx, by) <= tol)) return { k: "s", i };
  }
  return null;
}
const selItem = () => (E.sel ? (E.sel.k === "n" ? E.notes : E.strokes)[E.sel.i] : null);
function selBounds(g, W, H) {
  const it = selItem();
  if (!it) return null;
  if (E.sel.k === "n") {
    const q = noteGeom(g, W, H, it);
    const x0 = q.x - q.r, y0 = Math.min(q.y - q.r, q.bw ? q.by : Infinity);
    return { x: x0, y: y0, w: Math.max(q.x + q.r, q.bw ? q.bx + q.bw : 0) - x0, h: Math.max(q.y + q.r, q.bw ? q.by + q.bh : 0) - y0 };
  }
  const xs = it.p.map((p) => p[0] * W), ys = it.p.map((p) => p[1] * H), x0 = Math.min(...xs), y0 = Math.min(...ys);
  return { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 };
}
function deleteSel() {
  const it = selItem();
  if (!it) return;
  (E.sel.k === "n" ? E.notes : E.strokes).splice(E.sel.i, 1);
  E.hist.push({ d: E.sel.k, i: E.sel.i, item: it });
  E.sel = null;
  redraw(); syncChips(); syncTools();
}
function bindCanvas() {
  const c = $(".est-canvas");
  const pt = (e) => { const r = c.getBoundingClientRect(); return [clamp((e.clientX - r.left) / r.width), clamp((e.clientY - r.top) / r.height)]; };
  c.addEventListener("pointerdown", (e) => {
    if (E.view || !E.base) return;
    e.preventDefault();
    const p = pt(e);
    // Ajustar: the picture moves with the pointer inside its frame
    if (E.tool === "xf" && xfOk()) {
      E.xdrag = { start: [e.clientX, e.clientY], prev: { ...E.xf }, moved: false };
      c.setPointerCapture(e.pointerId);
      c.style.cursor = "grabbing";
      return;
    }
    // Área: a corner of the area being edited resizes it, inside an area moves it (and gives it the card), anywhere else
    // (or with ⌥, even over one) draws a new one
    if (E.tool === "area" && areaOk()) {
      const hit = e.altKey ? null : areaHit(p);
      if (!hit && E.areas.length >= MAX_AREAS) return E.ctx.toast(`Até ${MAX_AREAS} áreas de uma vez: tire uma (✕) pra marcar outra.`, true);
      if (hit) showArea(hit.i);
      E.adrag = { i: hit ? hit.i : -1, hit: hit ? hit.h : "new", start: p, prev: hit ? boxOf(E.areas[hit.i]) : null, box: hit ? null : { x0: p[0], y0: p[1], x1: p[0], y1: p[1] }, moved: false };
      c.setPointerCapture(e.pointerId);
      loadOrig().catch(() => {});
      return redraw();
    }
    if (E.tool === "move") {
      E.sel = hitTest(p);
      if (E.sel) { E.drag = { start: p, prev: structuredClone(selItem()), moved: false }; c.setPointerCapture(e.pointerId); }
      return redraw();
    }
    if (E.tool === "text") return addPin(p);
    E.live = { t: E.tool, c: E.color, w: 0.005, p: [p] };
    c.setPointerCapture(e.pointerId);
  });
  c.addEventListener("pointermove", (e) => {
    const p = pt(e);
    if (E.xdrag) {
      const d = E.xdrag;
      d.moved = true;
      return setXf({ x: d.prev.x + (e.clientX - d.start[0]) / c.clientWidth, y: d.prev.y + (e.clientY - d.start[1]) / c.clientHeight }, false);
    }
    if (E.tool === "xf") { c.style.cursor = "grab"; return; }
    if (E.adrag) {
      const d = E.adrag, [x, y] = p, a = E.areas[d.i];
      if (d.hit === "new") d.box = { x0: Math.min(d.start[0], x), y0: Math.min(d.start[1], y), x1: Math.max(d.start[0], x), y1: Math.max(d.start[1], y) };
      else if (d.hit === "in") {
        // the whole area moves and stays inside the picture
        const w = d.prev.x1 - d.prev.x0, h = d.prev.y1 - d.prev.y0;
        const x0 = Math.max(0, Math.min(1 - w, d.prev.x0 + x - d.start[0])), y0 = Math.max(0, Math.min(1 - h, d.prev.y0 + y - d.start[1]));
        Object.assign(a, { x0, y0, x1: x0 + w, y1: y0 + h });
      } else {
        // a corner: the opposite one stays where it is
        const fx = d.hit[1] === "w" ? d.prev.x1 : d.prev.x0, fy = d.hit[0] === "n" ? d.prev.y1 : d.prev.y0;
        Object.assign(a, { x0: Math.min(fx, x), y0: Math.min(fy, y), x1: Math.max(fx, x), y1: Math.max(fy, y) });
      }
      d.moved = true;
      return redraw();
    }
    if (E.tool === "area") {
      const h = !E.view && E.base ? areaHit(p) : null;
      c.style.cursor = h?.h === "in" ? "move" : h?.h === "nw" || h?.h === "se" ? "nwse-resize" : h ? "nesw-resize" : E.areas.length >= MAX_AREAS ? "not-allowed" : "crosshair";
      return;
    }
    if (E.drag) {
      // the whole mark moves together and stays inside the picture
      const it = selItem(), prev = E.drag.prev, pts = prev.p || [[prev.x, prev.y]];
      const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
      const dx = Math.max(-Math.min(...xs), Math.min(1 - Math.max(...xs), p[0] - E.drag.start[0]));
      const dy = Math.max(-Math.min(...ys), Math.min(1 - Math.max(...ys), p[1] - E.drag.start[1]));
      if (prev.p) it.p = prev.p.map(([x, y]) => [x + dx, y + dy]); else { it.x = prev.x + dx; it.y = prev.y + dy; }
      E.drag.moved = true;
      return redraw();
    }
    if (E.tool === "move") { c.style.cursor = !E.view && E.base && hitTest(p) ? "move" : "default"; return; }
    if (!E.live) return;
    if (E.live.t === "pen") { const l = E.live.p.at(-1); if (Math.hypot(p[0] - l[0], p[1] - l[1]) > 0.002) E.live.p.push(p); } else E.live.p[1] = p;
    redraw();
  });
  const end = () => {
    if (E.xdrag) {
      const d = E.xdrag;
      E.xdrag = null;
      c.style.cursor = "grab";
      if (d.moved) E.hist.push({ xf: d.prev });
      return syncTools();
    }
    if (E.adrag) {
      const d = E.adrag;
      E.adrag = null;
      // a click, or a box too small to mean anything, leaves the areas as they were; a real change can be undone (⌘Z)
      const tiny = (b) => (b.x1 - b.x0) * c.clientWidth < 8 || (b.y1 - b.y0) * c.clientHeight < 8;
      if (d.hit === "new") { if (!tiny(d.box)) addArea(d.box); }
      else if (d.moved) {
        const a = E.areas[d.i];
        if (tiny(a)) Object.assign(a, d.prev);
        else E.hist.push({ am: d.i, prev: d.prev });
      }
      redraw(); syncChips(); syncTools(); syncBar();
      return;
    }
    if (E.drag) {
      if (E.drag.moved) E.hist.push({ m: E.sel.k, i: E.sel.i, prev: E.drag.prev });
      E.drag = null;
      return syncTools();
    }
    if (!E.live) return;
    const s = E.live;
    E.live = null;
    if (s.t === "pen" || (s.p.length === 2 && Math.hypot(s.p[1][0] - s.p[0][0], s.p[1][1] - s.p[0][1]) > 0.01)) { E.strokes.push(s); E.hist.push("s"); }
    redraw(); syncChips(); syncTools();
  };
  c.addEventListener("pointerup", end);
  c.addEventListener("pointercancel", end);
  // Ajustar: the wheel (or a pinch) zooms about the pointer, ⌥ + wheel turns; one gesture is one undo
  c.addEventListener("wheel", (e) => {
    if (E.tool !== "xf" || E.view || !xfOk()) return;
    e.preventDefault();
    if (Date.now() - (E.xwheel || 0) > 700) E.hist.push({ xf: { ...E.xf } });
    E.xwheel = Date.now();
    if (e.altKey) return setXf({ r: E.xf.r + (e.deltaY > 0 ? 0.5 : -0.5) }, false);
    const r = c.getBoundingClientRect(), W = r.width, H = r.height, qx = e.clientX - r.left - W / 2, qy = e.clientY - r.top - H / 2;
    const s = Math.max(0.25, Math.min(4, E.xf.s * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)))), k = s / E.xf.s;
    setXf({ s, x: (qx - k * (qx - E.xf.x * W)) / W, y: (qy - k * (qy - E.xf.y * H)) / H }, false);
  }, { passive: false });
  c.addEventListener("dblclick", (e) => {
    if (E.tool !== "move" || E.view || !E.base) return;
    const hit = hitTest(pt(e));
    if (hit?.k === "n") editPin(hit.i);
  });
}
// a text field over the picture at (x, y): Enter or leaving it keeps the text, Escape drops it
function pinInput([x, y], value, done) {
  const inp = document.createElement("input");
  inp.className = "est-pin-in";
  inp.placeholder = "Escreva e Enter";
  inp.maxLength = 120;
  inp.value = value;
  inp.style.left = `${x * 100}%`;
  inp.style.top = `${y * 100}%`;
  $(".est-frame").append(inp);
  inp.focus({ preventScroll: true });
  if (value) inp.select();
  let over = false;
  const finish = (ok) => {
    if (over) return;
    over = true;
    const text = inp.value.trim();
    inp.remove();
    done(ok, text);
  };
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); finish(true); } if (e.key === "Escape") finish(false); });
  inp.addEventListener("blur", () => finish(true));
}
function addPin([x, y]) {
  pinInput([x, y], "", (ok, text) => {
    if (ok && text) { E.notes.push({ x, y, text, c: E.color }); E.hist.push("n"); redraw(); syncChips(); syncTools(); }
  });
}
// emptying a note's text removes the note
function editPin(i) {
  const n = E.notes[i];
  pinInput([n.x, n.y], n.text, (ok, text) => {
    if (!ok || text === n.text) return;
    if (text) { E.hist.push({ m: "n", i, prev: { ...n } }); n.text = text; }
    else { E.notes.splice(i, 1); E.hist.push({ d: "n", i, item: n }); E.sel = null; }
    redraw(); syncChips(); syncTools();
  });
}
// history entries: "s" / "n" added a stroke or a note; {m} moved or retexted one (prev = how it was); {d} deleted one;
// {an} drew an area (ai: the one the card had before); {am} moved or resized one (prev = its box); {ad} took one away
// (item: the area, with its text and references; ai: the one the card had); {xf} changed how the base sits in its frame
function undo() {
  const k = E.hist.pop();
  if (k === "s") E.strokes.pop();
  else if (k === "n") E.notes.pop();
  else if (k?.m) Object.assign((k.m === "n" ? E.notes : E.strokes)[k.i], k.prev);
  else if (k?.d) (k.d === "n" ? E.notes : E.strokes).splice(k.i, 0, k.item);
  else if (k && "an" in k) {
    // the area drawn goes; the card stays with the area it is on, or goes back to the one it had (the first area leaves
    // its text to the whole picture)
    const was = E.ai;
    if (was !== k.an) stashArea();
    E.areas.splice(k.an, 1);
    E.ai = -1;
    if (E.areas.length) loadArea(was !== k.an ? was - (was > k.an ? 1 : 0) : Math.max(0, Math.min(k.ai, E.areas.length - 1)));
  } else if (k && "am" in k) Object.assign(E.areas[k.am], k.prev);
  else if (k && "ad" in k) {
    stashArea();
    // the only area back takes the card's text, as the first one drawn does
    if (!E.areas.length) Object.assign(k.item, { prompt: promptText(), refs: E.refs });
    E.areas.splice(k.ad, 0, k.item);
    if (E.ai >= k.ad) E.ai++;
    if (k.ai === k.ad || E.ai < 0) loadArea(k.ad);
  } else if (k?.xf) { E.xf = k.xf; syncXf(); }
  E.sel = null;
  redraw(); syncChips(); syncTools(); syncBar();
}
// the base image with the drawing on top, as a JPEG for the model to see where to change (max: longest side, for reading);
// an adjusted base (Ajustar) is drawn as it goes to the model
async function marksPath(max = 0) {
  const bmp = xfOn() ? await baseBitmap() : await createImageBitmap(await (await fetch(bigUrl(E.base))).blob());
  const k = max ? Math.min(1, max / Math.max(bmp.width, bmp.height)) : 1;
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const g = c.getContext("2d");
  g.drawImage(bmp, 0, 0, c.width, c.height);
  paint(g, c.width, c.height, E.strokes, E.notes);
  const out = await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.9));
  const path = `estudio/marcas/${crypto.randomUUID()}.jpg`;
  const up = await E.ctx.sb.storage.from(E.ctx.bucket || "media").upload(path, out, { contentType: "image/jpeg" });
  if (up.error) throw up.error;
  return path;
}
// k: the number the marked copy has among the images sent (2 on an edit, the last one on a blocking render); list: the
// notes it shows, with their numbers in the whole drawing (an area's crop shows only the ones inside it); how: "area" (the
// change stays where it is marked), "new" (Novo ângulo, or a recipe that photographs the scene again: the marks show where the
// new camera goes and what it frames, and nothing is kept in place) or "hint" (a recipe whose drawing only points)
const marksNote = (k, list = E.notes.map((n, i) => ({ n, i })), how = "area") => {
  const pins = list.map(({ n, i }) => `${i + 1}) ${n.text}`).join("; ");
  if (E.blocking) return `Image ${k} is image 1 with marks drawn on top by the director${pins ? ` (numbered notes: ${pins})` : ""}: follow them where they are drawn, and do not reproduce any of the marks, numbers or text of image ${k} in the result.`;
  if (how === "new") return `Image ${k} is image 1 with marks drawn on top by the director to show where the new camera goes and what it frames${pins ? ` (numbered notes: ${pins})` : ""}. Do not reproduce any of the marks, numbers or text of image ${k} in the result.`;
  if (how === "hint") return `Image ${k} is image 1 with marks drawn on top by the director to point at what the request is about${pins ? ` (numbered notes: ${pins})` : ""}. The marks do not limit where it changes. Do not reproduce any of the marks, numbers or text of image ${k} in the result.`;
  return `Image ${k} is the same picture as image 1 with marks drawn on top by the director to show where to change it${pins ? ` (numbered notes: ${pins})` : ""}. Apply the change only where it is marked, keep everything else exactly as in image 1, and do not reproduce any of the marks, numbers or text of image ${k} in the result.`;
};

// ---------- só uma área: a rectangle of the base is cut out with some context around it, enlarged to the model's full
// size (2K or 4K) and edited there, then brought back down to its own pixels and put back into the whole picture. Small
// things get the definition a whole-frame edit has no pixels for, and nothing outside the area can move or be reframed:
// the area is new, a soft edge blends it in just outside, and every other pixel stays the original's. There can be several
// (E.areas, numbered in order): each has its own text and references and goes as a request of its own, and they come
// back into the base together, as one version ----------
const areaOk = () => E.mode === "edit" && !E.blocking && !!E.base && isImg(E.base) && !isVideo();
const MAX_AREAS = 6;
const areaOn = () => E.areas.length > 0 && areaOk();
const activeArea = () => E.areas[E.ai] || null;
const boxOf = (a) => ({ x0: a.x0, y0: a.y0, x1: a.x1, y1: a.y1 });
// the prompt card edits one area at a time (E.ai): its text and references are the card's while it has it, and go back
// into the area when another one takes the card
function stashArea() { const a = activeArea(); if (a) { a.prompt = promptText(); a.refs = E.refs; } }
function loadArea(i) { const a = E.areas[i]; if (!a) return; E.ai = i; E.refs = a.refs; putPrompt(a.prompt); }
function showArea(i) {
  if (i === E.ai || !E.areas[i]) return;
  stashArea();
  loadArea(i);
  redraw(); syncChips(); syncBar();
}
// a box drawn becomes the next area and takes the card: the first one keeps the text and references already in it (they
// were for this change), every later one starts empty
function addArea(box) {
  const was = E.ai;
  if (!E.areas.length) { E.areas.push({ ...box, prompt: promptText(), refs: E.refs }); E.ai = 0; }
  else {
    stashArea();
    E.areas.push({ ...box, prompt: "", refs: [] });
    loadArea(E.areas.length - 1);
    $(".est-prompt")?.focus();
  }
  E.hist.push({ an: E.areas.length - 1, ai: was });
}
const canvasOf = (w, h) => Object.assign(document.createElement("canvas"), { width: w, height: h });
// a picture redrawn at w×h, in halving steps when it shrinks a lot, so nothing aliases
function shrinkTo(src, w, h) {
  let cur = src;
  while (cur.width / 2 >= w && cur.height / 2 >= h) {
    const c = canvasOf(Math.round(cur.width / 2), Math.round(cur.height / 2)), g = c.getContext("2d");
    g.imageSmoothingQuality = "high";
    g.drawImage(cur, 0, 0, c.width, c.height);
    cur = c;
  }
  const c = canvasOf(w, h), g = c.getContext("2d");
  g.imageSmoothingQuality = "high";
  g.drawImage(cur, 0, 0, w, h);
  return c;
}
// a PNG's own color tags (gAMA, cHRM, sRGB, iCCP), or null for any other file. A PNG is read as it is stored (the
// browser would bend its values by those tags) and its composite carries the same tags, so every pixel outside the area
// stays exactly the original's, read the same way by any program
async function pngTags(blob) {
  const u = new Uint8Array(await blob.arrayBuffer());
  if (u[0] !== 0x89 || u[1] !== 0x50 || u[2] !== 0x4e || u[3] !== 0x47) return null;
  const tags = [];
  for (let i = 8; i + 8 <= u.length;) {
    const len = ((u[i] << 24) | (u[i + 1] << 16) | (u[i + 2] << 8) | u[i + 3]) >>> 0, t = String.fromCharCode(...u.subarray(i + 4, i + 8));
    if (t === "IDAT" || t === "IEND") break;
    if (["gAMA", "cHRM", "sRGB", "iCCP"].includes(t)) tags.push(u.slice(i, i + 12 + len));
    i += 12 + len;
  }
  return tags;
}
const readAs = (tags) => (tags ? { colorSpaceConversion: "none" } : {});
// a PNG the canvas wrote (no color tags of its own) with the original's tags right after its header
async function withTags(png, tags) {
  if (!tags?.length) return png;
  const u = new Uint8Array(await png.arrayBuffer()), head = 8 + 12 + 13;
  return new Blob([u.subarray(0, head), ...tags, u.subarray(head)], { type: "image/png" });
}
// the base at its full size (the stage shows a smaller copy): its pixels for the crop and for Ajustar, its size for the
// area's numbers, its own color tags
function loadOrig() {
  const o = E.base;
  if (!o?.path) return Promise.resolve(null);
  if (E.orig?.path === o.path) return E.orig.ready;
  const orig = { path: o.path };
  orig.ready = (async () => {
    await E.ctx.sign([o.path]);
    const file = await (await fetch(E.ctx.urls.get(o.path))).blob(), tags = await pngTags(file);
    const bmp = await createImageBitmap(file, readAs(tags));
    Object.assign(orig, { w: bmp.width, h: bmp.height, bmp, tags });
    if (E.orig === orig) redraw();
    return orig;
  })().catch((e) => { if (E.orig === orig) E.orig = null; throw e; });
  E.orig = orig;
  return orig.ready;
}
// the area in the base's pixels and the crop sent for it: the area with a margin of context (a fifth of its longer side,
// at least 24 px), grown to the nearest aspect the model takes and kept inside the picture. s: how much the crop is
// enlarged. null while the base's size is unknown; {none} when no crop of any aspect fits around the area
function areaGeo(a, o = E.orig) {
  if (!a || !o?.w || o.path !== E.base?.path) return null;
  const W = o.w, H = o.h, res = E.res === "4k" ? "4k" : "2k", k = res === "4k" ? 2 : 1;
  const ax = Math.round(a.x0 * W), ay = Math.round(a.y0 * H);
  const aw = Math.max(1, Math.round(a.x1 * W) - ax), ah = Math.max(1, Math.round(a.y1 * H) - ay);
  const m = Math.max(24, 0.2 * Math.max(aw, ah)), nw = aw + 2 * m, nh = ah + 2 * m;
  const far = (r) => Math.abs(Math.log(r / (nw / nh)));
  const list = Object.entries(model().sizes || NB_2K).map(([ratio, [w, h]]) => ({ ratio, w: w * k, h: h * k, r: w / h })).sort((p, q) => far(p.r) - far(q.r));
  for (const c of list) {
    const want = Math.max(nw, nh * c.r), fit = Math.min(1, W / want, H / (want / c.r));
    const cw = Math.min(W, Math.round(want * fit)), ch = Math.min(H, Math.round(cw / c.r));
    if (cw < aw || ch < ah) continue;
    const cx = Math.max(0, Math.min(W - cw, Math.round(ax + aw / 2 - cw / 2)));
    const cy = Math.max(0, Math.min(H - ch, Math.round(ay + ah / 2 - ch / 2)));
    const s = c.w / cw;
    return { res, ratio: c.ratio, out: [c.w, c.h], W, H, box: [ax, ay, aw, ah], crop: [cx, cy, cw, ch], s, small: Math.min(aw, ah) < 64 || s > 12, big: s < 1.25 };
  }
  return { none: true, W, H, box: [ax, ay, aw, ah] };
}
// on the stage: under the drawing, the rest of the picture dimmed around what the model sees (each area's crop, dashed);
// over it, each area's edge (the one the card edits brighter, with its corners to drag while the Área tool is on) and the
// box being drawn
function paintArea(g, W, H, under) {
  const fresh = E.adrag?.hit === "new" ? E.adrag.box : null;
  if (!areaOk() || (!E.areas.length && !fresh)) return;
  const on = E.tool === "area", list = E.areas.map((a, i) => ({ a, i, geo: areaGeo(a) }));
  g.save();
  if (under) {
    const crops = list.filter((x) => x.geo?.crop).map(({ i, geo }) => { const [cx, cy, cw, ch] = geo.crop, X = W / geo.W, Y = H / geo.H; return { i, r: [cx * X, cy * Y, cw * X, ch * Y] }; });
    if (crops.length) {
      g.fillStyle = `rgba(5, 7, 6, ${on ? 0.5 : 0.32})`;
      g.fillRect(0, 0, W, H);
      for (const { r } of crops) g.clearRect(...r);
      g.setLineDash([4, 4]); g.lineWidth = 1;
      for (const { i, r: [x, y, w, h] } of crops) { g.strokeStyle = `rgba(255, 255, 255, ${i === E.ai ? 0.5 : 0.25})`; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); }
    }
  } else {
    const edge = (b, color, width) => {
      const r = [b.x0 * W, b.y0 * H, (b.x1 - b.x0) * W, (b.y1 - b.y0) * H];
      g.lineWidth = width + 1.5; g.strokeStyle = "rgba(5, 7, 6, 0.6)"; g.strokeRect(...r);
      g.lineWidth = width; g.strokeStyle = color; g.strokeRect(...r);
      return r;
    };
    for (const { a, i, geo } of list) {
      const mine = i === E.ai, warn = geo && (geo.none || geo.small || geo.big);
      const [x, y, w, h] = edge(a, warn ? "#FF8A5C" : mine ? "#FFFFFF" : "rgba(255, 255, 255, 0.55)", mine ? 1.5 : 1);
      if (on && mine) for (const [hx, hy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
        g.fillStyle = "#FFFFFF"; g.fillRect(hx - 4, hy - 4, 8, 8);
        g.lineWidth = 1; g.strokeStyle = "rgba(5, 7, 6, 0.8)"; g.strokeRect(hx - 4, hy - 4, 8, 8);
      }
    }
    if (fresh) { g.setLineDash([5, 4]); edge(fresh, "#FFFFFF", 1.5); }
  }
  g.restore();
}
// what the pointer is on with the Área tool: a corner of the area the card edits (resizes it from there), an area (the
// highest number on top: moves it) or nothing (a new one). {i, h}: the area and nw / ne / sw / se / in
function areaHit([px, py]) {
  const a = activeArea(), c = $(".est-canvas");
  if (!E.areas.length || !c) return null;
  const W = c.clientWidth, H = c.clientHeight;
  if (a) for (const [h, x, y] of [["nw", a.x0, a.y0], ["ne", a.x1, a.y0], ["sw", a.x0, a.y1], ["se", a.x1, a.y1]])
    if (Math.abs((px - x) * W) <= 10 && Math.abs((py - y) * H) <= 10) return { i: E.ai, h };
  for (let i = E.areas.length - 1; i >= 0; i--) { const b = E.areas[i]; if (px > b.x0 && px < b.x1 && py > b.y0 && py < b.y1) return { i, h: "in" }; }
  return null;
}
// a tag over each area: its number; for the one the card edits, its size in the base and how much it is enlarged (or what
// keeps it from gaining detail), for the others the start of their text; its references as small circles, + to give it
// one more and ✕ to take it away. A click on a tag gives that area the card
const snip = (s, n = 24) => { const t = (s || "").replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n - 1).trim()}…` : t; };
function syncAreas() {
  const box = $(".est-areas");
  if (!box) return;
  const show = !E.view && areaOk() && E.areas.length > 0;
  box.hidden = !show;
  if (!show) return;
  const n = (v) => String(Math.round(v * 10) / 10).replace(".", ",");
  while (box.children.length > E.areas.length) box.lastElementChild.remove();
  while (box.children.length < E.areas.length) box.append(document.createElement("div"));
  E.areas.forEach((a, i) => {
    const t = box.children[i], on = i === E.ai, geo = areaGeo(a), many = E.areas.length > 1;
    const refs = (on ? E.refs : a.refs).filter((r) => (r.kind || "image") === "image"), said = on ? "" : snip(a.prompt);
    let text = "medindo…", warn = false, tip = "";
    if (geo?.none) { text = "grande demais: use a edição normal"; warn = true; }
    else if (geo) {
      const [, , aw, ah] = geo.box, size = `${aw}×${ah} px`;
      warn = !model().sizes || geo.small || geo.big;
      text = !model().sizes ? "só com o Nano Banana 2.1" : geo.small ? `${size} · pequena, pode não ganhar detalhe` : geo.big ? `${size} · grande, ganha pouco detalhe${geo.res === "2k" ? " (use 4K)" : ""}` : `${size} · ${n(geo.s)}×`;
      tip = `O modelo recebe só o tracejado (a área com um pouco de contexto em volta), ampliado ${n(geo.s)}× para ${geo.out.join("×")}. O resultado volta para ${size}, entra na imagem com a borda suave e o resto fica igual.`;
    }
    if (!on && !warn) text = said || "sem texto";
    const html = `<b>${i + 1}</b><span>${esc(text)}</span>${refs.length ? `<span class="est-arefs">${refs.slice(0, 4).map((r) => (r.thumb ? `<img src="${esc(r.thumb)}" alt="">` : `<i>${ICONS.image}</i>`)).join("")}${refs.length > 4 ? `<small>+${refs.length - 4}</small>` : ""}</span>` : ""}`
      + `<button data-k="area-ref" title="Juntar uma referência a esta área" aria-label="Juntar referência à área ${i + 1}">${ICONS.plus}</button>`
      + `<button data-k="area-x" title="Tirar esta área${on ? " (Esc)" : ""}" aria-label="Tirar a área ${i + 1}">${ICONS.x}</button>`;
    if (t._html !== html) { t.innerHTML = html; t._html = html; }
    t.className = `est-area${on ? " on" : ""}${warn ? " warn" : ""}${!on && !said ? " empty" : ""}`;
    Object.assign(t.dataset, { k: "area-sel", i: String(i) });
    t.title = [on ? "" : said ? a.prompt.trim() : "Esta área ainda não tem texto: clique para escrever o que muda nela", tip, many && !on ? "Clique para editar esta área" : ""].filter(Boolean).join("\n\n");
    // over the area's top corner, under it when the area touches the top; from the right edge when it sits on the right
    const below = a.y0 < 0.09, right = a.x0 > 0.62;
    t.classList.toggle("below", below);
    t.style.top = `${(below ? a.y1 : a.y0) * 100}%`;
    t.style.left = right ? "auto" : `${a.x0 * 100}%`;
    t.style.right = right ? `${(1 - a.x1) * 100}%` : "auto";
  });
}
// an area taken away (its ✕, or Esc on the one the card edits): the card goes to the one before it; the last one leaves
// its text and references to the whole picture
function dropArea(i = E.ai) {
  const a = E.areas[i];
  if (!a) return;
  stashArea();
  E.hist.push({ ad: i, item: a, ai: E.ai });
  E.areas.splice(i, 1);
  if (!E.areas.length) E.ai = -1;
  else if (i === E.ai) { E.ai = -1; loadArea(Math.max(0, i - 1)); }
  else if (i < E.ai) E.ai--;
  redraw(); syncChips(); syncTools(); syncBar();
}
// the Área tool works with a model that can edit only an area (Nano Banana 2.1), at 2K or 4K
function areaStart() {
  const { ctx } = E;
  if (!model().sizes) { E.model = MODELS.find((m) => m.sizes).id; ctx.toast("A área é feita no Nano Banana 2.1"); }
  if (E.res === "1k") E.res = "2k";
  syncBar();
  loadOrig().catch((e) => ctx.toast(`Não consegui abrir a imagem inteira: ${e.message || e}`, true));
  if (!E.areas.length) ctx.toast("Arraste um retângulo na imagem: só ele muda. Cada retângulo novo é mais uma área, com o seu texto e as suas referências");
}
async function upJpeg(c, q) {
  const blob = await new Promise((ok) => c.toBlob(ok, "image/jpeg", q));
  const path = `estudio/area/${crypto.randomUUID()}.jpg`;
  const up = await E.ctx.sb.storage.from(E.ctx.bucket || "media").upload(path, blob, { contentType: "image/jpeg" });
  if (up.error) throw up.error;
  return path;
}
// the drawing's marks that fall in a crop: whether any does, and the notes in it (with their numbers in the whole drawing)
function marksIn(geo) {
  const [cx, cy, cw, ch] = geo.crop, x0 = cx / geo.W, y0 = cy / geo.H, x1 = (cx + cw) / geo.W, y1 = (cy + ch) / geo.H;
  const pins = E.notes.map((n, i) => ({ n, i })).filter(({ n }) => n.x >= x0 && n.x <= x1 && n.y >= y0 && n.y <= y1);
  const meets = (s) => { const xs = s.p.map((q) => q[0]), ys = s.p.map((q) => q[1]); return Math.max(...xs) >= x0 && Math.min(...xs) <= x1 && Math.max(...ys) >= y0 && Math.min(...ys) <= y1; };
  return { any: pins.length > 0 || E.strokes.some(meets), pins };
}
// whether the drawing goes with the generation (as image 2 of an edit): with areas, only when it reaches the crop of the
// area the card edits
const drawingGoes = () => { if (!areaOn()) return hasDrawing(); const geo = areaGeo(activeArea()); return !!geo?.crop && marksIn(geo).any; };
// the files sent for an area: the crop, cut from the base at full size and enlarged to the model's size, and when the
// drawing reaches it, the same crop with the marks that fall in it. Kept on the area while nothing changes, so ×N, Melhorar
// and Gerar share them. small: copies at 1600 px for Claude (Melhorar)
async function areaCut(area, { small = false } = {}) {
  const orig = await loadOrig(), geo = areaGeo(area, orig), k = E.areas.length > 1 ? ` ${E.areas.indexOf(area) + 1}` : "";
  if (!orig || !geo?.crop) throw new Error(geo?.none ? `A área${k} é grande demais pra editar só ela: diminua, ou use a edição normal (Esc tira a área).` : "Não consegui abrir a imagem inteira.");
  // cut from the base as the model sees it: adjusted in its frame (Ajustar) or as it is
  const src = await baseBitmap();
  const key = JSON.stringify([E.base.path, xfKey(), geo.crop, geo.out, E.strokes, E.notes]);
  if (area.cut?.key !== key) area.cut = { key, geo, ...marksIn(geo) };
  const cut = area.cut, [cx, cy, cw, ch] = geo.crop;
  const crop = () => { const c = canvasOf(...geo.out), g = c.getContext("2d"); g.imageSmoothingQuality = "high"; g.drawImage(src, cx, cy, cw, ch, 0, 0, c.width, c.height); return c; };
  // the marks, in the crop's own terms (a stroke keeps its width relative to the picture it is painted on)
  const at = ([x, y]) => [(x * geo.W - cx) / cw, (y * geo.H - cy) / ch];
  const marked = (c) => { paint(c.getContext("2d"), c.width, c.height, E.strokes.map((s) => ({ ...s, p: s.p.map(at) })), E.notes.map((n) => { const [x, y] = at([n.x, n.y]); return { ...n, x, y }; })); return c; };
  const fit = (c) => { const k = Math.min(1, 1600 / Math.max(c.width, c.height)); return shrinkTo(c, Math.round(c.width * k), Math.round(c.height * k)); };
  if (small) {
    if (!cut.small) { cut.small = await upJpeg(fit(crop()), 0.88); if (cut.any) cut.marksSmall = await upJpeg(fit(marked(crop())), 0.88); }
  } else if (!cut.path) {
    cut.path = await upJpeg(crop(), 0.95);
    if (cut.any) cut.marks = await upJpeg(marked(crop()), 0.9);
  }
  return cut;
}
// an area's text as the generator gets it, each reference it names called by its place among that area's files (the card
// holds the text of the area it edits; the others keep theirs, see stashArea)
function textOf(a, name) {
  if (a === activeArea()) return promptFor(name);
  // read as the card would read it with that area on it
  const was = [E.refs, E.ai];
  E.refs = a.refs; E.ai = E.areas.indexOf(a);
  try { const el = document.createElement("div"); el.innerHTML = promptHTML(a.prompt); return readPrompt(el, name); }
  finally { [E.refs, E.ai] = was; }
}
// what the model is told: where the area is in the crop, and that the rest must stay put so it fits back in the frame
function areaNote(geo) {
  const [cx, cy, cw, ch] = geo.crop, [ax, ay, aw, ah] = geo.box, p = (v) => Math.round(v * 100);
  return `Image 1 is a close-up crop of a bigger frame, enlarged so a small area of it can get real detail. Make the change only inside that area: from ${p((ax - cx) / cw)}% to ${p((ax + aw - cx) / cw)}% of the width of image 1 and from ${p((ay - cy) / ch)}% to ${p((ay + ah - cy) / ch)}% of its height. Around it, keep image 1 exactly as it is, because it has to meet the rest of the frame. Keep the framing and the scale: no zoom, no crop, no pan, no rotation, nothing moved or resized, so the result lines up with image 1. Same light, colors, sharpness, focus and texture as image 1.`;
}
// the line at the top of the option's prompt: it was an area edit, where, and how it went back in
const areaLine = (a) => `Edição de área: ${a.box[2]}×${a.box[3]} px em x ${a.box[0]}, y ${a.box[1]} de ${a.W}×${a.H} · recorte ${a.crop[2]}×${a.crop[3]} em x ${a.crop[0]}, y ${a.crop[1]} (${a.ratio}), ampliado ${String(a.s).replace(".", ",")}× para ${a.out.join("×")} · recolocada na original com a borda suave e a cor acertada pela faixa em volta.`;
// how the result's colors differ from the original's in the band around the area (inside the crop, outside the area):
// a gain and an offset per channel that make them meet, fitted twice, the second time without the samples where the
// result really changed something. null when the band is too thin to tell
function toneOf(o, r, w, h, [bx0, by0, bx1, by1]) {
  const step = Math.max(1, Math.round(Math.sqrt((w * h - (bx1 - bx0) * (by1 - by0)) / 60000))), idx = [];
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) if (x < bx0 || x >= bx1 || y < by0 || y >= by1) idx.push((y * w + x) * 4);
  if (idx.length < 400) return null;
  const fit = (list) => {
    const t = { g: [1, 1, 1], b: [0, 0, 0] };
    for (let c = 0; c < 3; c++) {
      let so = 0, sr = 0, qo = 0, qr = 0;
      for (const i of list) { const vo = o[i + c], vr = r[i + c]; so += vo; sr += vr; qo += vo * vo; qr += vr * vr; }
      const n = list.length, mo = so / n, mr = sr / n, dO = Math.sqrt(Math.max(0, qo / n - mo * mo)), dR = Math.sqrt(Math.max(0, qr / n - mr * mr));
      t.g[c] = dR > 1 ? Math.max(0.8, Math.min(1.25, dO / dR)) : 1;
      t.b[c] = Math.max(-60, Math.min(60, mo - t.g[c] * mr));
    }
    return t;
  };
  const first = fit(idx);
  const err = idx.map((i) => Math.abs(first.g[0] * r[i] + first.b[0] - o[i]) + Math.abs(first.g[1] * r[i + 1] + first.b[1] - o[i + 1]) + Math.abs(first.g[2] * r[i + 2] + first.b[2] - o[i + 2]));
  const cut = [...err].sort((p, q) => p - q)[Math.floor(err.length * 0.7)];
  return fit(idx.filter((_, j) => err[j] <= cut));
}
// the results of the areas go back into the whole picture ([{a: input.area, blob}], in their numbers' order, so where two
// cross the higher number stays on top). Each is brought down to its crop's exact size, its color and light matched to
// the picture's around the area (as it is by then), then laid in with a soft edge that runs only outside the area (across
// the inner 60% of the band, at most 128 px). Past those edges every pixel is the original's, and the picture is saved as PNG
async function areaComposite(parts) {
  const { ctx } = E, src = parts[0].a.src;
  await ctx.sign([src]);
  const file = await (await fetch(ctx.urls.get(src))).blob(), tags = await pngTags(file);
  // the results are read the way the crops were made from the original (see pngTags)
  const orig = await createImageBitmap(file, readAs(tags));
  const full = canvasOf(orig.width, orig.height), g = full.getContext("2d", { willReadFrequently: true });
  g.drawImage(orig, 0, 0);
  orig.close?.();
  const tones = [];
  for (const { a, blob } of parts) {
    const res = await createImageBitmap(blob, readAs(tags));
    // the boxes were measured on this file: should its size be another, they follow it
    const kx = full.width / a.W, ky = full.height / a.H;
    const [cx, cy, cw, ch] = [a.crop[0] * kx, a.crop[1] * ky, a.crop[2] * kx, a.crop[3] * ky].map(Math.round);
    const bx0 = Math.round(a.box[0] * kx) - cx, by0 = Math.round(a.box[1] * ky) - cy;
    const bx1 = bx0 + Math.round(a.box[2] * kx), by1 = by0 + Math.round(a.box[3] * ky);
    const O = g.getImageData(cx, cy, cw, ch), o = O.data;
    const r = shrinkTo(res, cw, ch).getContext("2d").getImageData(0, 0, cw, ch).data;
    res.close?.();
    const tone = toneOf(o, r, cw, ch, [bx0, by0, bx1, by1]);
    tones.push(tone);
    // Uint8ClampedArray rounds and clamps
    if (tone) for (let i = 0; i < r.length; i += 4) for (let c = 0; c < 3; c++) r[i + c] = tone.g[c] * r[i + c] + tone.b[c];
    const f = [bx0, by0, cw - bx1, ch - by1].map((m) => Math.min(128, Math.round(m * 0.6)));
    const ease = (d, w) => (d <= 0 ? 1 : d >= w ? 0 : 1 - (d / w) ** 2 * (3 - 2 * (d / w)));
    for (let y = 0; y < ch; y++) {
      const wy = y < by0 ? ease(by0 - y, f[1]) : y >= by1 ? ease(y - by1 + 1, f[3]) : 1;
      if (!wy) continue;
      for (let x = 0; x < cw; x++) {
        const k = wy * (x < bx0 ? ease(bx0 - x, f[0]) : x >= bx1 ? ease(x - bx1 + 1, f[2]) : 1);
        if (!k) continue;
        const i = (y * cw + x) * 4;
        for (let c = 0; c < 3; c++) o[i + c] = k === 1 ? r[i + c] : o[i + c] + (r[i + c] - o[i + c]) * k;
      }
    }
    g.putImageData(O, cx, cy);
  }
  let out = await withTags(await new Promise((ok) => full.toBlob(ok, "image/png")), tags);
  // a PNG keeps every pixel; one too big for the room goes as a fine JPEG
  if (out.size > MAX_FILE) out = await new Promise((ok) => full.toBlob(ok, "image/jpeg", 0.95));
  return { blob: out, tones };
}
// a composite that keeps failing (the original gone, the tab out of memory) stops after three tries, saying why (id: the
// job's, or the group's for several areas)
const AREA_TRIES = new Map();
function areaFail(id, e) {
  const n = (AREA_TRIES.get(id) || 0) + 1;
  AREA_TRIES.set(id, n);
  return Object.assign(new Error(`a área não voltou pra imagem (${e.message || e})`), { final: n >= 3, note: `A área não voltou pra imagem: ${e.message || e}` });
}

// ---------- Ajustar: the base moved, turned, flipped or scaled inside its own frame before it goes to the model. The stage
// shows it as it will go (the drawing and the area stay on the frame); at Gerar it is rendered at the original's size,
// and what the picture no longer covers is flat gray, for the model to fill. The result lands as any edit of the base ----------
const XF0 = { s: 1, r: 0, fx: false, fy: false, x: 0, y: 0 };
const XF_FILL = "#808080";
const xfOk = () => E.mode === "edit" && !!E.base && isImg(E.base) && !isVideo();
const xfOn = () => xfOk() && !!E.xf && (E.xf.s !== 1 || E.xf.r !== 0 || E.xf.fx || E.xf.fy || E.xf.x !== 0 || E.xf.y !== 0);
const xfKey = () => (xfOn() ? JSON.stringify(E.xf) : "");
// one transform for the stage (CSS on the picture inside its frame) and for the render (canvas): moved, turned, then
// flipped and scaled about its center
const xfCss = (t) => `translate(${t.x * 100}%, ${t.y * 100}%) rotate(${t.r}deg) scale(${t.s * (t.fx ? -1 : 1)}, ${t.s * (t.fy ? -1 : 1)})`;
function renderXf(bmp, t) {
  const W = bmp.width, H = bmp.height, c = canvasOf(W, H), g = c.getContext("2d");
  g.fillStyle = XF_FILL;
  g.fillRect(0, 0, W, H);
  // a flip or a half turn at 100% lands pixel on pixel: copied as they are (smoothing would soften the whole picture)
  const exact = t.s === 1 && Math.abs(t.r) % 180 === 0 && !t.x && !t.y;
  g.imageSmoothingEnabled = !exact;
  g.imageSmoothingQuality = "high";
  g.translate(W / 2 + t.x * W, H / 2 + t.y * H);
  g.rotate((t.r * Math.PI) / 180);
  g.scale(t.s * (t.fx ? -1 : 1), t.s * (t.fy ? -1 : 1));
  g.drawImage(bmp, -W / 2, -H / 2, W, H);
  return c;
}
// whether the moved picture still covers its whole frame (else gray edges are left for the model to fill)
function xfCovers(t, W, H) {
  const a = (-t.r * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  return [[-1, -1], [1, -1], [-1, 1], [1, 1]].every(([sx, sy]) => {
    const dx = (sx * W) / 2 - t.x * W, dy = (sy * H) / 2 - t.y * H;
    return Math.abs((dx * cos - dy * sin) / t.s) <= W / 2 + 0.5 && Math.abs((dx * sin + dy * cos) / t.s) <= H / 2 + 0.5;
  });
}
const xfNote = () => (xfOn() && E.orig?.w && !xfCovers(E.xf, E.orig.w, E.orig.h) ? "\n\nImage 1 was moved, turned or zoomed out inside its frame by the director: the flat gray parts at its edges are empty. Fill them by extending the scene naturally, with the same place, light, perspective and lens, and keep the picture itself as it is." : "");
// the line at the top of the option's prompt when its base was adjusted
const xfWhat = (t) => [Math.round(t.s * 100) !== 100 && `${Math.round(t.s * 100)}%`, t.r && `girada ${String(t.r).replace(".", ",")}°`, t.fx && "espelhada na horizontal", t.fy && "espelhada na vertical", (t.x || t.y) && "deslocada"].filter(Boolean).join(", ");
const xfLine = (t) => `Base ajustada no quadro: ${xfWhat(t)}.`;
// the base as the model will see it: the file itself, or its Ajustar render (kept while the transform holds)
async function baseBitmap() {
  const o = await loadOrig();
  if (!o || !xfOn()) return o?.bmp || null;
  const key = `${o.path}|${xfKey()}`;
  if (E.xfr?.key !== key) E.xfr = { key, c: renderXf(o.bmp, E.xf) };
  return E.xfr.c;
}
// the base's file for the model: the base itself, or its Ajustar render uploaded once per transform. png: lossless, with
// the file's own color tags (an area goes back into it, see areaComposite); small: 1600 px for Claude (Melhorar)
async function basePath(kind = "jpg") {
  if (!xfOn()) return kind === "small" ? E.base.preview_path || E.base.path : E.base.path;
  const o = await loadOrig(), key = `${o.path}|${xfKey()}|${kind}`;
  E.xfp ||= new Map();
  if (E.xfp.has(key)) return E.xfp.get(key);
  let c = await baseBitmap();
  if (kind === "small") { const k = Math.min(1, 1600 / Math.max(c.width, c.height)); c = shrinkTo(c, Math.round(c.width * k), Math.round(c.height * k)); }
  const png = kind === "png";
  const blob = png ? await withTags(await new Promise((ok) => c.toBlob(ok, "image/png")), o.tags) : await new Promise((ok) => c.toBlob(ok, "image/jpeg", kind === "small" ? 0.88 : 0.95));
  const path = `estudio/ajuste/${crypto.randomUUID()}.${png ? "png" : "jpg"}`;
  const up = await E.ctx.sb.storage.from(E.ctx.bucket || "media").upload(path, blob, { contentType: png ? "image/png" : "image/jpeg" });
  if (up.error) throw up.error;
  E.xfp.set(key, path);
  return path;
}
function setXf(next, hist = true) {
  const prev = { ...E.xf }, t = { ...E.xf, ...next };
  t.s = Math.max(0.25, Math.min(4, t.s));
  t.r = Math.round(((((t.r + 180) % 360) + 360) % 360 - 180) * 10) / 10;
  t.x = Math.max(-1.5, Math.min(1.5, t.x));
  t.y = Math.max(-1.5, Math.min(1.5, t.y));
  E.xf = t;
  if (hist) E.hist.push({ xf: prev });
  syncXf(); redraw(); syncTools();
}
// the picture on the stage follows the transform (not while another version is shown), and the controls say where it is
function syncXf() {
  const img = $(".est-img");
  if (!img) return;
  const on = xfOn() && !E.view, t = E.xf || XF0;
  img.style.transform = on ? xfCss(t) : "";
  $(".est-pic")?.classList.toggle("xf", on);
  const say = (k, s) => { const el = $(`[data-xfv="${k}"]`); if (el) el.textContent = s; };
  say("s", `${Math.round(t.s * 100)}%`);
  say("r", `${String(t.r).replace(".", ",")}°`);
  $('[data-k="xf-fx"]')?.classList.toggle("on", !!t.fx);
  $('[data-k="xf-fy"]')?.classList.toggle("on", !!t.fy);
  const reset = $('[data-k="xf-reset"]');
  if (reset) reset.disabled = !xfOn();
  // ✓ keeps the adjusted picture as a version of its own (no model), when it covers the frame
  const sv = $('[data-k="xf-save"]');
  if (sv) {
    // the stage's copy has the original's shape, so it tells before the original itself has loaded
    const W = E.orig?.w || img.naturalWidth, H = E.orig?.h || img.naturalHeight, covers = !W || !H || xfCovers(t, W, H);
    sv.disabled = !xfOn() || !E.base?.id || !!E.saving || !covers;
    sv.title = E.saving ? "Salvando…" : !covers ? "Sem IA a imagem precisa cobrir o quadro: aproxime até sumir o cinza (ou use Gerar para a IA preencher)" : "Salvar como versão nova, sem IA: a imagem ajustada vira a do card";
  }
  // Ajustar's button keeps a dot while the base is adjusted, whatever tool is on
  $('[data-tool="xf"]')?.classList.toggle("set", xfOn());
}
// the controls next to Ajustar: zoom out / in (⇧ 1%), back to 100%, turn 1° (⇧ 90°), back to 0°, the flips, all back
function xfAct(k, shift) {
  const t = E.xf, step = shift ? 1.01 : 1.05, turn = shift ? 90 : 1;
  if (k === "xf-in") setXf({ s: t.s * step });
  else if (k === "xf-out") setXf({ s: t.s / step });
  else if (k === "xf-s1") setXf({ s: 1 });
  else if (k === "xf-l") setXf({ r: t.r - turn });
  else if (k === "xf-r") setXf({ r: t.r + turn });
  else if (k === "xf-r0") setXf({ r: 0 });
  else if (k === "xf-fx") setXf({ fx: !t.fx });
  else if (k === "xf-fy") setXf({ fy: !t.fy });
  else if (k === "xf-reset") setXf({ ...XF0 });
  else if (k === "xf-save") saveXf();
}

// ---------- Ajustar sem IA: the picture moved, turned, flipped or scaled in its own frame and kept as a version of its own,
// with no model (the room's ver grande, and Ajustar's ✓ here). With nothing to fill the edges, the picture always covers
// its frame: a turn zooms in as much as it needs, a pan stops at the edge ----------
export { XF0, xfCss };
// the least scale at which the picture, turned by r degrees, still covers its own W×H frame
function coverScale(r, W, H) {
  const a = (r * Math.PI) / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
  return Math.max(c + (H / W) * s, c + (W / H) * s);
}
// t made to cover its frame: zoomed in when it does not, then moved back toward the middle until it does
export function xfCover(t, W, H) {
  // a turn gets a hair more, so no corner pixel is left gray by rounding; flips and half turns need none
  const out = { ...t, s: Math.min(4, Math.max(t.s, coverScale(t.r, W, H) * (t.r % 180 ? 1.002 : 1))) };
  if (xfCovers(out, W, H)) return out;
  let lo = 0, hi = 1;
  for (let k = 0; k < 18; k++) { const m = (lo + hi) / 2; if (xfCovers({ ...out, x: t.x * m, y: t.y * m }, W, H)) lo = m; else hi = m; }
  return { ...out, x: t.x * lo, y: t.y * lo };
}
// the option o adjusted by t, rendered at its full size and stored as a new version in its stack (the card shows it from
// then on; the original stays in the stack). A PNG stays a PNG with its own color tags, anything else goes as a fine JPEG
export async function saveAdjusted(ctx, o, t) {
  E.ctx = ctx;
  await ctx.sign([o.path]);
  const file = await (await fetch(ctx.urls.get(o.path))).blob(), tags = await pngTags(file);
  const bmp = await createImageBitmap(file, readAs(tags)), tt = xfCover(t, bmp.width, bmp.height);
  const c = renderXf(bmp, tt);
  bmp.close?.();
  let blob = tags ? await withTags(await new Promise((ok) => c.toBlob(ok, "image/png")), tags) : await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.95));
  if (blob.size > MAX_FILE) blob = await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.95));
  const ext = blob.type === "image/png" ? "png" : "jpg";
  const m = await ctx.putFile(`items/${o.item_id}`, new File([blob], `${(o.name || "imagem").replace(/\.[^.]+$/, "")}-ajuste.${ext}`, { type: blob.type }));
  const root = rootOf(o), it = ctx.itemOf(o.item_id);
  const { data: n, error } = await ctx.sb.from("options").insert({
    item_id: o.item_id, path: m.path, preview_path: m.preview_path, thumb_path: m.thumb_path, mime: m.mime, name: m.name,
    created_by: ctx.myName(), version: ctx.roundOf(it?.round_id)?.version || 1, based_on: o.id, stack: root.id,
    caption: "", model: "Ajuste · sem IA", prompt: `Ajustada sem IA: ${xfWhat(tt)}.`,
    reasoning: "Ajustada na sala, sem IA: a imagem foi espelhada, girada ou mudou de escala no próprio quadro. A versão de antes continua na pilha.",
  }).select().single();
  if (error) throw error;
  const { error: e2 } = await ctx.sb.from("options").update({ face: n.id }).eq("id", root.id);
  if (e2) throw e2;
  await ctx.refresh();
  return n;
}
// Ajustar's ✓ in the studio: the base as it sits in the frame becomes a version of its own, shown on the stage; Ajustar
// starts over from it. Only when the picture covers the frame (gray edges are for a model to fill)
async function saveXf() {
  const { ctx } = E, o = E.base;
  if (!xfOn() || !o?.id || E.saving) return;
  const orig = await loadOrig().catch(() => null);
  if (!orig || !xfCovers(E.xf, orig.w, orig.h)) return ctx.toast("Sem IA a imagem precisa cobrir o quadro: aproxime até sumir o cinza, ou use Gerar para a IA preencher.", true);
  E.saving = true; syncXf();
  try {
    const n = await saveAdjusted(ctx, o, E.xf);
    E.xf = { ...XF0 };
    E.view = n.id;
    syncStage(); syncXf(); syncRail(); syncTools();
    ctx.toast("✦ Versão nova, sem IA: agora é a do card");
  } catch (e) { ctx.toast(`Não deu certo: ${e.message || e}`, true); }
  E.saving = false; syncXf();
}

// ---------- Soul 2 · rosto treinado: the face is a Soul ID trained in the Galeria (table souls, same Higgsfield key as
// this studio). With Soul 2 picked, a circle next to the base opens the trained faces and the face's strength; the base
// is the scene it starts from; other references and the drawing do not go to this model ----------
const soulOn = () => !isVideo() && E.mode !== "draw" && !!model().soul;
const soulThumb = (s) => s.thumbnail_url || (s.photos?.[0]?.path && E.ctx.urls.get(s.photos[0].path)) || "";
const SOUL_STATE = { completed: "pronto", failed: "não treinou", not_ready: "treinando…", queued: "treinando…", in_progress: "treinando…" };
async function loadSouls() {
  if (!E.ctx?.TEAM) return;
  const { data } = await E.ctx.sb.from("souls").select("id, name, model_version, ref_id, status, thumbnail_url, photos, created_at").order("created_at");
  E.souls = data || [];
  // a face still training asks Higgsfield how it is going (the Galeria's function, ESTUDIO.souls, which keeps the table)
  const { data: s } = await E.ctx.sb.auth.getSession();
  await Promise.all(E.souls.filter((x) => ["not_ready", "queued", "in_progress"].includes(x.status)).map(async (x) => {
    const r = await fetch(E.ctx.soulsUrl, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.session?.access_token}`, apikey: E.ctx.anonKey }, body: JSON.stringify({ action: "status", soul_id: x.id, schema: E.ctx.schema, bucket: E.ctx.bucket }) }).catch(() => null);
    const out = r?.ok ? await r.json().catch(() => ({})) : {};
    if (out.soul) Object.assign(x, out.soul);
  }));
  await E.ctx.sign(E.souls.map((s) => !s.thumbnail_url && s.photos?.[0]?.path).filter(Boolean)).catch(() => {});
  // the face picked follows its newest state
  if (E.soul) E.soul = E.souls.find((s) => s.id === E.soul.id) || null;
  if (E.root) { syncChips(); syncSouls(); }
}
// the trained faces over the prompt card: a click picks one (only a v2 that finished training serves Soul 2), and the
// face's strength under them
function syncSouls() {
  const p = $(".est-souls");
  if (!p) return;
  p.hidden = !E.soulOpen || !soulOn();
  if (p.hidden) return;
  const k = Math.round((E.soulK ?? 1) * 100);
  const face = (s) => (soulThumb(s) ? `<img src="${esc(soulThumb(s))}" alt="">` : `<i>${esc(s.name.slice(0, 1).toUpperCase())}</i>`);
  const row = (s) => {
    const ok = s.status === "completed" && s.model_version === "v2";
    const why = s.model_version !== "v2" ? `Soul ${esc(s.model_version)}: não serve no Soul 2` : SOUL_STATE[s.status] || esc(s.status);
    return `<button class="est-soul ${E.soul?.id === s.id ? "on" : ""}" data-k="soul-pick" data-id="${s.id}" ${ok ? "" : "disabled"}>${face(s)}<span>${esc(s.name)}<small>${why}</small></span></button>`;
  };
  p.innerHTML = `<div class="est-pick-head"><b>Rosto · Soul ID</b><span class="grow"></span><button class="est-pbtn" data-k="soul" title="Fechar (Esc)" aria-label="Fechar">${ICONS.x}</button></div>
    <div class="est-souls-list">${(E.souls || []).map(row).join("") || '<p class="est-note">Nenhum rosto treinado ainda. Treine um Soul ID na Galeria, com 5 a 20 fotos da pessoa.</p>'}</div>
    <label class="est-soul-k" title="Quanto do rosto treinado entra na imagem">Força do rosto<input type="range" min="10" max="100" step="5" value="${k}" data-k="soul-k"><b>${k}%</b></label>`;
}
// the line at the top of the option's prompt: whose face, how strong
const soulLine = (s) => `Rosto: ${s.name} (Soul ID), força ${Math.round((s.strength ?? 1) * 100)}%.`;
// the aspect closest to the base's own, for a model with no Auto
function nearAspect(list) {
  const img = $(".est-img"), r = img?.naturalWidth ? img.naturalWidth / img.naturalHeight : 16 / 9;
  const of = (a) => { const [w, h] = a.split(":").map(Number); return w / h; };
  return list.reduce((b, a) => (Math.abs(Math.log(of(a) / r)) < Math.abs(Math.log(of(b) / r)) ? a : b));
}

// ---------- Câmera: the camera icon in the bar opens a small menu (type, camera, lens, focal length, aperture and, under
// Mais, shot size, angle, movement, film stock, filter, white balance). Everything starts at "—", and then the prompt goes as
// written. With something set the icon lights up with a short summary and a ✕, and one line in English goes at the end of
// the prompt, once: photo words with the gear by name for an image model; for Seedance no names at all (the focal length is a
// field of view in degrees, the camera and the lens the look they give, the aperture a depth of field). Melhorar gets the
// same line and weaves it into the text, so it does not go again unless the camera changes. The choices stay on this
// computer and in the job (input.camera), so an image can hand its camera back ----------
// t: the menu's words, s: the bar's summary, img: how an image prompt names it ("shot on …"), on: the film after a camera's
// name, vid: the look it gives a video, stock: it takes a film stock
const CAM_TYPES = [
  { id: "cine", t: "Cinema digital", s: "Cinema", img: "a digital cinema camera", vid: "clean high-end digital cinema image" },
  { id: "35", t: "Película 35mm", s: "35mm", img: "35mm motion picture film", on: "35mm film", vid: "35mm motion picture film look with rich color and smooth highlights", stock: true },
  { id: "16", t: "Película 16mm", s: "16mm", img: "16mm film", on: "16mm film", vid: "16mm film look: a softer, organic image with gentle halation", stock: true },
  { id: "s8", t: "Super 8", s: "Super 8", img: "Super 8 film", on: "Super 8 film", vid: "Super 8 home-movie look: soft focus, warm color and a slightly unsteady frame", stock: true },
  { id: "mf", t: "Foto médio formato", s: "Médio formato", img: "a medium format camera", vid: "medium format photo look: very fine detail and smooth focus falloff", stock: true },
  { id: "f35", t: "Foto 35mm", s: "Foto 35mm", img: "a 35mm still camera", vid: "35mm still photography look", stock: true },
  { id: "cel", t: "Celular", s: "Celular", img: "a smartphone camera", vid: "smartphone video look: crisp, deep focus, a touch wide" },
  { id: "act", t: "Action cam", s: "Action cam", img: "an action camera", vid: "action camera look: very wide, deep focus, crisp and punchy" },
  { id: "drone", t: "Drone", s: "Drone", img: "a drone camera, from the air", vid: "aerial drone footage, smooth and stable" },
  { id: "vhs", t: "Camcorder/VHS", s: "VHS", img: "a VHS camcorder", vid: "VHS camcorder look: a soft video image with bleeding color edges and a slight tracking wobble" },
  { id: "cctv", t: "Câmera de segurança", s: "Segurança", img: "a security camera high in a corner", vid: "security camera look: a fixed, high corner view in wide-angle video" },
];
const CAM_BODIES = [
  { id: "alexa35", type: "cine", t: "ARRI Alexa 35", s: "Alexa 35", vid: "clean digital cinema image with soft, natural highlight roll-off and true skin tones" },
  { id: "minilf", type: "cine", t: "ARRI Alexa Mini LF", s: "Alexa Mini LF", vid: "large-format digital cinema image: a wide, immersive perspective and soft focus falloff" },
  { id: "venice2", type: "cine", t: "Sony Venice 2", s: "Venice 2", vid: "clean full-frame digital cinema image with rich, true color" },
  { id: "raptor", type: "cine", t: "RED V-Raptor", s: "V-Raptor", vid: "very crisp, high-detail digital cinema image" },
  { id: "arri435", type: "35", t: "Arriflex 435", s: "Arri 435" },
  { id: "panaflex", type: "35", t: "Panavision Panaflex", s: "Panaflex" },
  { id: "arri416", type: "16", t: "Arriflex 416", s: "Arri 416" },
  { id: "aaton", type: "16", t: "Aaton XTR", s: "Aaton" },
  { id: "c1014", type: "s8", t: "Canon 1014 XL-S", s: "Canon 1014" },
  { id: "h500", type: "mf", t: "Hasselblad 500C/M", s: "Hasselblad" },
  { id: "x2d", type: "mf", t: "Hasselblad X2D", s: "X2D" },
  { id: "rz67", type: "mf", t: "Mamiya RZ67", s: "RZ67" },
  { id: "m6", type: "f35", t: "Leica M6", s: "Leica M6" },
  { id: "m11", type: "f35", t: "Leica M11", s: "Leica M11" },
  { id: "ae1", type: "f35", t: "Canon AE-1", s: "AE-1" },
  { id: "iphone", type: "cel", t: "iPhone", s: "iPhone", img: "an iPhone" },
  { id: "gopro", type: "act", t: "GoPro", s: "GoPro", img: "a GoPro" },
  { id: "mavic", type: "drone", t: "DJI Mavic", s: "Mavic", img: "a DJI Mavic drone" },
  { id: "inspire", type: "drone", t: "DJI Inspire", s: "Inspire", img: "a DJI Inspire drone" },
  { id: "fpv", type: "drone", t: "Drone FPV", s: "FPV", img: "an FPV drone", vid: "fast, agile FPV-style flight close to things" },
  { id: "handycam", type: "vhs", t: "Sony Handycam", s: "Handycam", img: "a Sony Handycam" },
];
// fov: a fisheye is 180° whatever its focal length
const CAM_LENSES = [
  { id: "prime", t: "Prime esférica", s: "Prime", img: "spherical prime lens", vid: "clean spherical lens rendering with round bokeh" },
  { id: "ana", t: "Anamórfica", s: "Anamórfica", img: "anamorphic lens", vid: "anamorphic look: oval bokeh, horizontal lens flares and a wide cinematic feel" },
  { id: "vint", t: "Vintage", s: "Vintage", img: "vintage lens", vid: "vintage lens look: softly glowing highlights and gentle flares" },
  { id: "zoom", t: "Zoom", s: "Zoom", img: "zoom lens", vid: "" },
  { id: "macro", t: "Macro", s: "Macro", img: "macro lens", vid: "macro close-focus view: small details large in frame, very thin focus" },
  { id: "tilt", t: "Tilt-shift", s: "Tilt-shift", img: "tilt-shift lens", vid: "tilt-shift look: a thin, slanted band of focus that makes the scene feel miniature" },
  { id: "fish", t: "Olho de peixe", s: "Olho de peixe", img: "fisheye lens", vid: "fisheye view with strongly curved lines", fov: 180 },
  { id: "probe", t: "Probe", s: "Probe", img: "probe lens", vid: "probe-lens view: the camera tiny and very close, gliding among things at their own scale" },
];
const CAM_SHOTS = [
  { id: "ecu", t: "Plano detalhe", s: "ECU", en: "extreme close-up" },
  { id: "cu", t: "Close", s: "CU", en: "close-up" },
  { id: "mcu", t: "Primeiro plano", s: "MCU", en: "medium close-up" },
  { id: "ms", t: "Plano médio", s: "MS", en: "medium shot" },
  { id: "mls", t: "Plano americano", s: "MLS", en: "medium long shot, from the knees up" },
  { id: "ws", t: "Plano geral", s: "WS", en: "wide shot" },
  { id: "ews", t: "Grande plano geral", s: "EWS", en: "extreme wide shot" },
];
// adj: before a shot size in an image prompt ("low-angle close-up"); en: on its own, and in a video's camera line
const CAM_ANGLES = [
  { id: "eye", t: "Altura do olho", adj: "eye-level", en: "camera at eye level" },
  { id: "low", t: "Contra-plongée", adj: "low-angle", en: "low angle, looking up" },
  { id: "high", t: "Plongée", adj: "high-angle", en: "high angle, looking down" },
  { id: "top", t: "Zenital", adj: "top-down", en: "top-down overhead view, looking straight down" },
  { id: "dutch", t: "Holandês", adj: "Dutch-angle", en: "Dutch angle, the horizon tilted" },
  { id: "table", t: "Rente à mesa", adj: "table-top-level", en: "camera at table-top level, the lens just above the surface" },
  { id: "ground", t: "Rente ao chão", adj: "ground-level", en: "camera at ground level, the lens just above the floor" },
];
const CAM_MOVES = [
  { id: "static", t: "Parada", en: "locked-off static camera" },
  { id: "push", t: "Travelling pra frente", en: "slow push-in toward the subject" },
  { id: "pull", t: "Travelling pra trás", en: "slow pull-back from the subject" },
  { id: "track", t: "Travelling lateral", en: "lateral tracking move alongside the action" },
  { id: "pan", t: "Panorâmica", en: "slow pan across the scene" },
  { id: "tilt", t: "Tilt", en: "slow tilt" },
  { id: "crane", t: "Grua subindo", en: "crane move rising up" },
  { id: "orbit", t: "Órbita", en: "slow orbit around the subject" },
  { id: "hand", t: "Câmera na mão", en: "handheld camera with a natural, gentle sway" },
  { id: "follow", t: "Seguindo, estável", en: "smooth stabilized follow behind the subject" },
  { id: "zoom", t: "Zoom in", en: "slow zoom in" },
];
const CAM_STOCKS = [
  { id: "500t", t: "Vision3 500T", img: "Kodak Vision3 500T film stock", vid: "tungsten-balanced color: warm practical lights and gentle halation" },
  { id: "250d", t: "Vision3 250D", img: "Kodak Vision3 250D film stock", vid: "daylight-balanced, rich natural color" },
  { id: "portra", t: "Portra 400", img: "Kodak Portra 400 film", vid: "warm portrait-film color with soft, natural skin tones" },
  { id: "ekta", t: "Ektachrome", img: "Kodak Ektachrome slide film", vid: "slide-film color: vivid, with deep blues and clean whites" },
  { id: "trix", t: "Tri-X (P&B)", img: "Kodak Tri-X black-and-white film", vid: "black and white, with deep blacks and bright whites" },
];
const CAM_FILTERS = [
  { id: "bpm", t: "Black Pro-Mist 1/8", s: "Pro-Mist 1/8", img: "Black Pro-Mist 1/8 filter", vid: "a subtle glow around the highlights" },
  { id: "diff", t: "Difusão", s: "Difusão", img: "diffusion filter", vid: "a soft diffusion glow over the image" },
  { id: "pol", t: "Polarizador", s: "Polarizador", img: "polarizing filter", vid: "polarized look: no glare on glass and water, a deep blue sky" },
];
const FOCALS = [14, 18, 24, 28, 35, 40, 50, 65, 85, 100, 135, 200, 300];
// Seedance thinks in field of view: each focal length gets the nearest of the angles it knows
const FOV = { 14: 107, 18: 107, 24: 84, 28: 63, 35: 63, 40: 47, 50: 47, 65: 29, 85: 29, 100: 18, 135: 18, 200: 12, 300: 8 };
const FSTOPS = [1.2, 1.4, 2, 2.8, 4, 5.6, 8, 11, 16];
const TEMPS = [3200, 4300, 5600];
const K_IMG = { 3200: "3200K tungsten white balance", 4300: "4300K white balance", 5600: "5600K daylight white balance" };
const dofOf = (f) => (f <= 1.4 ? "very shallow depth of field: only the subject is sharp and the background melts into soft blur" : f <= 2.8 ? "shallow depth of field, the background softly out of focus"
  : f <= 5.6 ? "moderate depth of field, the background slightly soft" : f <= 11 ? "deep focus, most of the scene sharp" : "very deep focus, sharp from front to back");
const camBy = (list, id) => list.find((x) => x.id === id) || null;
// a/an, a focal length included (an 18mm, an 85mm)
const art = (w) => (/^(?:[aeiou]|8|11|18)/i.test(w) ? "an" : "a");
// only what the menu offers, in one order (a camera read back from a job, or from this computer, is checked the same way)
const CAM_LISTS = { type: CAM_TYPES, body: CAM_BODIES, lens: CAM_LENSES, shot: CAM_SHOTS, angle: CAM_ANGLES, move: CAM_MOVES, stock: CAM_STOCKS, filter: CAM_FILTERS };
function camClean(c) {
  const out = {};
  if (!c || typeof c !== "object") return out;
  for (const [k, list] of Object.entries(CAM_LISTS)) if (camBy(list, c[k])) out[k] = c[k];
  if (FOCALS.includes(Number(c.mm))) out.mm = Number(c.mm);
  if (FSTOPS.includes(Number(c.f))) out.f = Number(c.f);
  if (TEMPS.includes(Number(c.k))) out.k = Number(c.k);
  if (typeof c.novo === "boolean") out.novo = c.novo;
  return out;
}
// the last choices, on this computer (not Novo ângulo: that one is about one image)
const camPref = () => { try { const { novo, ...c } = camClean(JSON.parse(localStorage.getItem("sala-est-cam") || "{}")); return c; } catch { return {}; } };
function camSave() { try { const { novo, ...c } = E.cam; localStorage.setItem("sala-est-cam", JSON.stringify(c)); } catch { /* the page still works */ } }
// an image model's line: "shot on ARRI Alexa 35 with a 40mm anamorphic lens at f/2.8, …; low-angle close-up"
function camImg(c) {
  const t = camBy(CAM_TYPES, c.type), b = camBy(CAM_BODIES, c.body), l = camBy(CAM_LENSES, c.lens), st = camBy(CAM_STOCKS, c.stock);
  const sh = camBy(CAM_SHOTS, c.shot), an = camBy(CAM_ANGLES, c.angle);
  const what = b ? `${b.img || b.t}${t?.on && !st ? ` (${t.on})` : ""}` : t?.img || "";
  const glass = c.mm || l ? [c.mm && `${c.mm}mm`, l ? l.img : "lens"].filter(Boolean).join(" ") : "";
  let gear = what ? `shot on ${what}` : "";
  if (glass) gear += gear ? ` with ${art(glass)} ${glass}` : `${art(glass)} ${glass}`;
  if (c.f) gear += gear ? ` at f/${c.f}` : `f/${c.f} aperture`;
  const look = [gear, st?.img, camBy(CAM_FILTERS, c.filter)?.img, c.k && K_IMG[c.k]].filter(Boolean).join(", ");
  return [look, sh && an ? `${an.adj} ${sh.en}` : sh?.en || an?.en || ""].filter(Boolean).join("; ");
}
// Seedance's line, with no gear names: the field of view, the height and angle, the shot size and the move, then the look
function camVid(c) {
  const t = camBy(CAM_TYPES, c.type), b = camBy(CAM_BODIES, c.body), l = camBy(CAM_LENSES, c.lens);
  const fov = l?.fov || (c.mm ? FOV[c.mm] : 0);
  const cam = [fov && `${fov}° field of view`, camBy(CAM_ANGLES, c.angle)?.en, camBy(CAM_SHOTS, c.shot)?.en, camBy(CAM_MOVES, c.move)?.en].filter(Boolean).join(", ");
  return [cam, l?.vid, b?.vid || t?.vid, camBy(CAM_STOCKS, c.stock)?.vid, camBy(CAM_FILTERS, c.filter)?.vid, c.f && dofOf(c.f), c.k && `white balance ${c.k}K`].filter(Boolean).join("; ");
}
// the choices in the room's words: in full (the option's prompt, the pill's tip) or short (the pill)
function camPT(c, short = false) {
  const t = camBy(CAM_TYPES, c.type), b = camBy(CAM_BODIES, c.body), l = camBy(CAM_LENSES, c.lens), sh = camBy(CAM_SHOTS, c.shot), fi = camBy(CAM_FILTERS, c.filter);
  return [c.novo && (short ? "Novo ângulo" : "novo ângulo"), short ? b?.s || t?.s : b?.t || t?.t, c.mm && `${c.mm}mm`, c.f && `f/${c.f}`, short ? l?.s : l?.t,
    short ? sh?.s : sh?.t, camBy(CAM_ANGLES, c.angle)?.t, camBy(CAM_MOVES, c.move)?.t, camBy(CAM_STOCKS, c.stock)?.t, short ? fi?.s : fi?.t, c.k && `${c.k}K`].filter(Boolean);
}
// the line at the top of the option's prompt: the camera the director set
const camLine = (c) => { const p = c ? camPT(camClean(c)) : []; return p.length ? `Câmera: ${p.join(" · ")}.` : ""; };
// what of the camera goes with this request: nothing with areas (an area follows the picture around it), and on a blocking
// render the 3D sets the lens and the framing. Novo ângulo (an edit of a base): the base is the scene to photograph again
// from another point, not a frame to keep; it turns on by itself with a focal length, a shot size or an angle, and its own
// switch forces it either way. how: what Melhorar does with it (see the function's CAM_ASK)
const CAM_FRAME = ["mm", "shot", "angle"];
function camNow() {
  const c = E.cam || {}, video = isVideo();
  const off = E.mode === "draw" || (!video && areaOn());
  const drop = !video && E.blocking ? CAM_FRAME : [];
  const use = off ? {} : Object.fromEntries(Object.entries(c).filter(([k]) => k !== "novo" && !drop.includes(k) && (video || k !== "move") && (k !== "stock" || camBy(CAM_TYPES, c.type)?.stock)));
  const canNovo = !off && !video && !!E.base && !E.blocking && !soulOn();
  const novo = canNovo && (c.novo ?? (CAM_FRAME.some((k) => use[k] != null) || ["fish", "probe", "macro"].includes(use.lens)));
  const line = Object.keys(use).length ? `Camera: ${video ? camVid(use) : camImg(use)}.` : "";
  const key = line && JSON.stringify([video, line]);
  return { use, line, key, novo, canNovo, off, dropped: drop.filter((k) => c[k] != null), woven: stillIn(E.camWoven, key),
    how: video ? "video" : novo ? "new" : E.base && !E.blocking && !soulOn() ? "keep" : "weave" };
}
// Melhorar wove this same thing (the camera's line, the recipes) into the text, and the text is still mostly what it wrote:
// ⌘Z or a new text bring it back
function stillIn(w, key) {
  if (!key || !w || w.key !== key) return false;
  const words = (s) => new Set(fold(s).match(/[a-z0-9]+/g) || []), a = words(w.text), b = words(promptText());
  let n = 0;
  a.forEach((x) => { if (b.has(x)) n++; });
  return a.size > 0 && n / a.size >= 0.6;
}
// what the job keeps (input.camera): the choices that went, the line and whether it was already in the text
const camData = (cam) => (cam.line || cam.novo ? { ...cam.use, ...(cam.novo && { novo: true }), line: cam.line, ...(cam.woven && { woven: true }) } : null);
// Novo ângulo: an edit's "keep everything else exactly as in image 1" held the camera where it was (asked for a camera inside
// a glass, the model laid glass over the same frame), so the base goes as the scene to photograph again
// with a recipe that changes more than the camera (the time of day, a look), the light is that recipe's to change
const angleNote = (light = true) => `Image 1 is the scene to photograph again, not a frame to keep: move the camera. Keep the place, the people and the objects, their look${light ? ", the light and the time of day" : ""}, and show them as the new camera sees them, with a new viewpoint, framing and perspective.`;
// the camera an image of the room was made with (its job keeps it), for "Usar a câmera desta imagem"
const CAM_OF = new Map();
async function camOf(o) {
  if (!o?.id) return null;
  if (!CAM_OF.has(o.id)) {
    let j = [...JOBS.values()].find((x) => (x.imported || []).includes(o.id));
    if (!j) j = (await E.ctx.sb.from("estudio_jobs").select("input").contains("imported", JSON.stringify([o.id])).limit(1).maybeSingle()).data;
    const c = j?.input?.camera ? camClean(j.input.camera) : null;
    CAM_OF.set(o.id, c && Object.keys(c).some((k) => k !== "novo") ? c : null);
  }
  return CAM_OF.get(o.id);
}
function camSet(f, v, toggle = false) {
  const c = { ...E.cam }, val = v === "" || v == null ? null : ["mm", "f", "k"].includes(f) ? Number(v) : v;
  if (val == null || (toggle && c[f] === val)) delete c[f]; else c[f] = val;
  // a camera belongs to its type, and a film stock only to film
  if (f === "body" && c.body) c.type = camBy(CAM_BODIES, c.body).type;
  if (c.body && camBy(CAM_BODIES, c.body)?.type !== c.type) delete c.body;
  if (!camBy(CAM_TYPES, c.type)?.stock) delete c.stock;
  E.cam = camClean(c);
  camSave();
  syncCam();
}
const CAM_MORE = ["shot", "angle", "move", "stock", "filter", "k"];
// the pill in the bar (lit with the summary once something is set; dim when it does not go, as with areas) and the menu
function syncCam() {
  const pill = $(".est-cam"), pop = $(".est-cam-pop");
  if (!pill) return;
  // what is set, as this mode reads it (a movement is only for video)
  const cam = camNow(), all = { ...E.cam, novo: cam.novo, ...(!isVideo() && { move: undefined }) }, set = camPT(all, true), goes = !!(cam.line || cam.novo);
  pill.hidden = E.mode === "draw";
  pill.classList.toggle("on", set.length > 0);
  pill.classList.toggle("idle", set.length > 0 && !goes);
  pill.querySelector(".est-cam-s").textContent = set.length ? `${set.slice(0, 3).join(" · ")}${set.length > 3 ? ` +${set.length - 3}` : ""}` : "";
  pill.querySelector(".est-cam-x").hidden = !set.length;
  pill.querySelector(".est-cam-b").title = set.length ? `Câmera: ${camPT(all).join(" · ")}${goes ? "" : cam.off ? " · com áreas ela não vai" : " · não vai neste pedido"}` : "Câmera: tipo, lente, focal, diafragma… Sem nada escolhido, o prompt vai como está";
  if (!pop) return;
  pop.hidden = !E.camOpen;
  if (pop.hidden) { E.camHtml = ""; return; }
  const html = camMenu(cam);
  if (html !== E.camHtml) { pop.innerHTML = html; E.camHtml = html; }
  // it opens above the prompt card, never taller than the room left above it (a phone's card is tall)
  pop.style.maxHeight = `${Math.max(200, Math.min(640, pop.parentElement.getBoundingClientRect().top - 16))}px`;
}
function camMenu(cam) {
  const c = E.cam, video = isVideo(), t = camBy(CAM_TYPES, c.type);
  const opt = (f) => (x) => `<option value="${x.id}" ${c[f] === x.id ? "selected" : ""}>${esc(x.t)}</option>`;
  const sel = (f, list, name) => `<label class="est-sel"><select data-k="cam-set" data-f="${f}" aria-label="${name}"><option value="">—</option>${list.map(opt(f)).join("")}</select></label>`;
  // before a type is picked, every camera by its type (picking one picks its type)
  const bodies = c.type ? CAM_BODIES.filter((b) => b.type === c.type).map(opt("body")).join("")
    : CAM_TYPES.filter((ty) => CAM_BODIES.some((b) => b.type === ty.id)).map((ty) => `<optgroup label="${esc(ty.t)}">${CAM_BODIES.filter((b) => b.type === ty.id).map(opt("body")).join("")}</optgroup>`).join("");
  const hasBodies = !c.type || CAM_BODIES.some((b) => b.type === c.type);
  const chips = (f, list, lab, tip = () => "") => `<div class="est-cam-chips">${list.map((v) => `<button data-k="cam-chip" data-f="${f}" data-v="${v}" class="${c[f] === v ? "on" : ""}" aria-pressed="${c[f] === v}"${tip(v) ? ` title="${esc(tip(v))}"` : ""}>${esc(lab(v))}</button>`).join("")}</div>`;
  const row = (label, body) => `<div class="est-cam-row"><span>${label}</span>${body}</div>`;
  const nMore = CAM_MORE.filter((k) => c[k] != null).length;
  const novo = cam.canNovo ? `<button class="est-cam-novo ${cam.novo ? "on" : ""}" data-k="cam-novo" aria-pressed="${cam.novo}"><i aria-hidden="true"></i><span><b>Novo ângulo</b><small>A base vira a cena, fotografada de outro ponto. O desenho mostra onde fica a câmera e o que ela enquadra.${c.novo == null ? " Liga sozinho com focal, plano ou ângulo." : ""}</small></span></button>` : "";
  const notes = [
    cam.off && E.mode !== "draw" && "Com áreas, a câmera não vai: cada área segue a imagem em volta.",
    cam.dropped.length && "No blocking, a focal, o plano e o ângulo vêm do 3D.",
    cam.novo && "A base vai como a cena a fotografar de novo, sem o “manter tudo igual”.",
    cam.woven && "Já está no texto, escrito pelo Melhorar: não vai de novo. Se mudar a câmera, vai.",
  ].filter(Boolean);
  // the image on the stage made with a camera of its own can give it back
  const o = shownOpt(), oc = o?.id ? CAM_OF.get(o.id) : null;
  if (o?.id && !CAM_OF.has(o.id)) camOf(o).then(() => E.camOpen && syncCam()).catch(() => {});
  const same = oc && JSON.stringify(camClean({ ...oc, novo: undefined })) === JSON.stringify(camClean({ ...c, novo: undefined }));
  const use = oc && !same ? `<button class="est-alt" data-k="cam-use" title="${esc(camPT({ ...oc, novo: undefined }).join(" · "))}">${ICONS.camera}Usar a câmera desta imagem</button>` : "";
  return `<div class="est-pick-head"><b class="est-cam-h">${ICONS.camera}Câmera</b><span class="grow"></span>${Object.keys(c).length ? '<button class="link" data-k="cam-clear">Limpar</button>' : ""}<button class="est-pbtn" data-k="cam" title="Fechar (Esc)" aria-label="Fechar">${ICONS.x}</button></div>
    <div class="est-cam-body">${novo}
      <div class="est-cam-two">${row("Tipo", sel("type", CAM_TYPES, "Tipo de câmera"))}${hasBodies ? row("Câmera", `<label class="est-sel"><select data-k="cam-set" data-f="body" aria-label="Câmera"><option value="">—</option>${bodies}</select></label>`) : ""}</div>
      ${row("Lente", sel("lens", CAM_LENSES, "Lente"))}
      ${row("Focal <small>mm</small>", chips("mm", FOCALS, (v) => v, (v) => (video ? `${c.lens === "fish" ? 180 : FOV[v]}° de campo de visão no vídeo` : "")))}
      ${row("Diafragma", chips("f", FSTOPS, (v) => `f/${v}`, (v) => (v <= 1.4 ? "fundo bem desfocado" : v <= 2.8 ? "fundo desfocado" : v <= 5.6 ? "fundo um pouco suave" : v <= 11 ? "quase tudo em foco" : "tudo em foco")))}
      <button class="est-cam-more ${E.camMore ? "open" : ""}" data-k="cam-more" aria-expanded="${!!E.camMore}">Mais${nMore ? ` · ${nMore}` : ""}<small>plano, ângulo${video ? ", movimento" : ""}${t?.stock ? ", filme" : ""}, filtro, temperatura</small></button>
      ${E.camMore ? `${row("Plano", chips("shot", CAM_SHOTS.map((x) => x.id), (id) => camBy(CAM_SHOTS, id).s, (id) => camBy(CAM_SHOTS, id).t))}
      ${row("Ângulo", sel("angle", CAM_ANGLES, "Ângulo"))}
      ${video ? row("Movimento", sel("move", CAM_MOVES, "Movimento")) : ""}
      ${t?.stock ? row("Filme", sel("stock", CAM_STOCKS, "Filme")) : ""}
      ${row("Filtro", chips("filter", CAM_FILTERS.map((x) => x.id), (id) => camBy(CAM_FILTERS, id).s, (id) => camBy(CAM_FILTERS, id).t))}
      ${row("Temperatura", chips("k", TEMPS, (v) => `${v}K`))}` : ""}
    </div>
    <div class="est-cam-out"><small>Vai no fim do prompt${video ? ", sem nomes de equipamento" : ""}</small><p class="est-cam-line ${cam.woven ? "woven" : ""}">${cam.line ? esc(cam.line) : "<em>nada: o prompt vai como está</em>"}</p>${notes.map((n) => `<p class="est-note">${n}</p>`).join("")}${use}</div>`;
}

// ---------- Receitas: how to ask for one kind of change (a new angle, the time of day, a look…), kept in the room's
// `recipes` table so the whole team shares and edits them. The book icon next to the history turns the drawer on the right
// into the recipes (search, categories, a form to write or change one); a recipe dragged or clicked onto the prompt card is
// a chip there, with ✕. With chips on, Gerar first has Claude (the function's write, as Melhorar does) write the request
// from the text, the drawing's notes, the images, the camera and the recipes, and sends that: the text on the card stays,
// and the result shows what went. Melhorar writes it into the text instead, and Gerar then sends it as it is. A recipe also
// says what the base is (a picture to change, or the scene to photograph again) and what the drawing does (limits the
// change to where it is marked, or only points) ----------
let RECIPES = null;
const REC_KEYS = ["id", "category", "name", "hint", "instruction", "base", "drawing", "video"];
async function loadRecipes() {
  if (!E.ctx?.TEAM) return;
  const { data, error } = await E.ctx.sb.from("recipes").select("*").eq("archived", false).order("sort").order("created_at");
  if (error) E.recErr = error.message;
  else { RECIPES = data || []; E.recErr = ""; }
  if (E.root) { syncChips(); syncRail(); }
}
// a recipe as the table has it now (its chip keeps a copy, so it still goes before the table loads)
const recOf = (r) => (RECIPES || []).find((x) => x.id === r.id) || r;
const recSnap = (r) => Object.fromEntries(REC_KEYS.map((k) => [k, r[k]]));
// what of the recipes goes with this request: none with areas (each area follows the picture around it) and, on a video,
// only the ones made for video too. reshoot: one of them photographs the scene again; limit: the drawing limits the change
// only when every recipe says so
function recNow() {
  const video = isVideo(), off = E.mode === "draw" || (!video && areaOn());
  const list = off ? [] : (E.recipes || []).map(recOf).filter((r) => !video || r.video);
  const reshoot = !video && !!E.base && !E.blocking && !soulOn() && list.some((r) => r.base === "reshoot");
  const key = list.length ? JSON.stringify([video, list.map((r) => [r.id, r.instruction, r.base, r.drawing])]) : "";
  return { list, reshoot, limit: list.every((r) => r.drawing === "area"), key, off, woven: stillIn(E.recWoven, key) };
}
const recNames = (list) => list.map((r) => r.name).join(", ");
// the line at the top of the option's prompt
const recLine = (list) => (list?.length ? `Receitas: ${recNames(list)}.` : "");
// with no Claude to write them in (no key), the recipes go as they are, after the text
const recText = (list) => `Follow ${list.length > 1 ? "these recipes" : "this recipe"}:\n${list.map((r, i) => `${i + 1}) ${r.name}: ${r.instruction}`).join("\n")}`;
function recAdd(id, toggle = false) {
  const r = (RECIPES || []).find((x) => x.id === id);
  if (!r || E.mode === "draw") return;
  const has = E.recipes.some((x) => x.id === id);
  if (has && toggle) E.recipes = E.recipes.filter((x) => x.id !== id);
  else if (!has) E.recipes = [...E.recipes, recSnap(r)];
  syncChips(); syncBar(); syncRail();
}
function recRm(id) { E.recipes = E.recipes.filter((x) => x.id !== id); syncChips(); syncBar(); syncRail(); }
function recChips() {
  if (!E.recipes?.length) return "";
  const rec = recNow(), goes = new Set(rec.list.map((r) => r.id));
  return `<span class="est-rchips">${E.recipes.map(recOf).map((r) => {
    const why = goes.has(r.id) ? "" : rec.off ? "com áreas, as receitas não vão" : "esta receita não vale no vídeo";
    return `<span class="est-rchip ${why ? "off" : ""}"><button data-k="rec-open" data-id="${r.id}" title="${esc(why || r.hint || r.name)}">${ICONS.book}<span>${esc(r.name)}</span></button><button class="est-rx" data-k="rec-rm" data-id="${r.id}" title="Tirar do prompt" aria-label="Tirar a receita ${esc(r.name)}">${ICONS.x}</button></span>`;
  }).join("")}</span>`;
}
// the drawer: its head (count, Nova, search, categories) stays put while typing a search; only the list under it changes
function recipesHtml() {
  if (E.redit) return recFormHtml(E.redit);
  const all = RECIPES || [], cats = [...new Set(all.map((r) => r.category))];
  if (E.rcat !== "all" && !cats.includes(E.rcat)) E.rcat = "all";
  return `<div class="est-rhead"><p class="side-label">Receitas${all.length ? ` · ${all.length}` : ""}</p><span class="grow"></span><button class="est-alt" data-k="rec-new" title="Escrever uma receita nova pro time">${ICONS.plus}Nova</button></div>
    <label class="est-psearch est-rsearch">${ICONS.search}<input type="search" data-k="rq" value="${esc(E.rq || "")}" placeholder="Buscar" aria-label="Buscar receita"></label>
    <div class="est-rcats">${["all", ...cats].map((c) => `<button data-k="rec-cat" data-v="${esc(c)}" class="${E.rcat === c ? "on" : ""}" aria-pressed="${E.rcat === c}">${c === "all" ? "Todas" : esc(c)}</button>`).join("")}</div>
    <div class="est-rlist">${recListHtml()}</div>`;
}
function recListHtml() {
  if (RECIPES === null) return `<p class="est-note">${E.recErr ? `As receitas não abriram: ${esc(E.recErr)}` : "Abrindo as receitas…"}</p>`;
  const q = fold(E.rq || "").trim(), on = new Set(E.recipes.map((r) => r.id)), video = isVideo();
  const shown = RECIPES.filter((r) => (E.rcat === "all" || r.category === E.rcat) && (!q || fold(`${r.name} ${r.hint} ${r.category}`).includes(q)));
  const item = (r) => {
    const tags = [r.base === "reshoot" && "refotografa a cena", r.drawing === "area" && "só onde marcar", r.video && "vale no vídeo"].filter(Boolean);
    return `<div class="est-rec ${on.has(r.id) ? "on" : ""} ${video && !r.video ? "dim" : ""} ${E.rflash === r.id ? "flash" : ""}" draggable="true" data-rid="${r.id}">
      <button class="est-rec-main" data-k="rec-add" data-id="${r.id}" title="${on.has(r.id) ? "Tirar do prompt" : "Pôr no prompt (ou arraste até ele)"}" aria-pressed="${on.has(r.id)}"><b>${on.has(r.id) ? ICONS.check : ""}${esc(r.name)}</b>${r.hint ? `<span>${esc(r.hint)}</span>` : ""}${tags.length ? `<small>${tags.join(" · ")}</small>` : ""}</button>
      <button class="est-rec-ed" data-k="rec-edit" data-id="${r.id}" title="Mudar esta receita" aria-label="Mudar a receita ${esc(r.name)}">${ICONS.pen}</button></div>`;
  };
  const cats = [...new Set(shown.map((r) => r.category))];
  return cats.map((c) => `${E.rcat === "all" ? `<p class="est-rcat">${esc(c)}</p>` : ""}${shown.filter((r) => r.category === c).map(item).join("")}`).join("")
    + (shown.length ? `<p class="est-note est-rfoot">Arraste uma receita até o prompt, ou clique nela. Com receitas, o Gerar passa pelo Claude: ele junta o texto, o desenho, a câmera e as receitas e escreve o pedido no contexto da cena.</p>` : `<p class="est-note">Nenhuma receita${q ? ` com “${esc(E.rq)}”` : ""}.</p>`);
}
// a recipe the team writes or changes (in the table, for everyone); one is taken out of the drawer, never deleted
function recFormHtml(r) {
  const cats = [...new Set((RECIPES || []).map((x) => x.category))];
  const seg = (f, v, opts) => `<span class="est-seg" role="radiogroup">${opts.map(([val, lab]) => `<button type="button" data-k="rec-seg" data-f="${f}" data-v="${val}" class="${v === val ? "on" : ""}" role="radio" aria-checked="${v === val}">${lab}</button>`).join("")}</span>`;
  return `<form class="est-rform">
    <div class="est-rhead"><button type="button" class="link est-rback" data-k="rec-cancel">${ICONS.back}Receitas</button></div>
    <p class="side-label">${r.id ? "Mudar a receita" : "Receita nova"}</p>
    <label>Nome<input class="field" name="name" maxlength="60" required value="${esc(r.name || "")}"></label>
    <label>Categoria<input class="field" name="category" maxlength="40" required list="est-rcats" value="${esc(r.category || (E.rcat !== "all" ? E.rcat : cats[0] || ""))}"><datalist id="est-rcats">${cats.map((c) => `<option value="${esc(c)}"></option>`).join("")}</datalist></label>
    <label>Dica <small>uma linha, na gaveta</small><input class="field" name="hint" maxlength="200" value="${esc(r.hint || "")}"></label>
    <label>Instrução pro Claude <small>em inglês: o que muda e o que fica</small><textarea class="field" name="instruction" rows="8" maxlength="2000" required>${esc(r.instruction || "")}</textarea></label>
    <div class="est-rrow"><span>A base</span>${seg("base", r.base || "edit", [["edit", "Editar a imagem"], ["reshoot", "Refotografar a cena"]])}</div>
    <div class="est-rrow"><span>O desenho</span>${seg("drawing", r.drawing || "area", [["area", "Limita onde muda"], ["hint", "Só indica"]])}</div>
    <label class="est-rcheck"><input type="checkbox" name="video" ${r.video ? "checked" : ""}>Vale também no vídeo</label>
    <div class="est-ract"><button type="submit" class="est-go">Salvar</button><button type="button" class="link" data-k="rec-cancel">Cancelar</button><span class="grow"></span>${r.id ? '<button type="button" class="link danger" data-k="rec-archive">Tirar da gaveta</button>' : ""}</div>
  </form>`;
}
async function recSave(f) {
  const { ctx } = E, v = (n) => f.elements[n].value.trim(), seg = (k) => f.querySelector(`[data-f="${k}"].on`)?.dataset.v;
  const row = { name: v("name"), category: v("category"), hint: v("hint"), instruction: v("instruction"), base: seg("base") || "edit", drawing: seg("drawing") || "area",
    video: f.elements.video.checked, updated_by: ctx.myName(), updated_at: new Date().toISOString() };
  if (!row.name || !row.category || !row.instruction) return ctx.toast("Falta o nome, a categoria ou a instrução.", true);
  // the job's rule for every prompt: rich, true color
  if (/\bmuted\b|desaturat|film grain/i.test(row.instruction)) return ctx.toast("Sem “muted”, “desaturated” ou “film grain” na instrução: o filme é de cor rica.", true);
  const id = E.redit?.id;
  const { error } = id ? await ctx.sb.from("recipes").update(row).eq("id", id)
    : await ctx.sb.from("recipes").insert({ ...row, created_by: ctx.myName(), sort: Math.max(0, ...(RECIPES || []).map((r) => r.sort || 0)) + 10 });
  if (error) return ctx.toast(error.message, true);
  E.redit = null;
  await loadRecipes();
  ctx.toast(id ? "Receita salva pro time" : "Receita nova na gaveta, pro time");
}
async function recArchive() {
  const { ctx } = E, r = E.redit;
  if (!r?.id || !confirm(`Tirar “${r.name}” da gaveta? Ela fica guardada, só some daqui.`)) return;
  const { error } = await ctx.sb.from("recipes").update({ archived: true, updated_by: ctx.myName(), updated_at: new Date().toISOString() }).eq("id", r.id);
  if (error) return ctx.toast(error.message, true);
  E.redit = null;
  E.recipes = E.recipes.filter((x) => x.id !== r.id);
  await loadRecipes();
  syncBar();
  ctx.toast("Receita fora da gaveta");
}
// the two icons at the top right open the drawer on the right with the versions (history) or the recipes (book)
function syncHead() {
  const vers = E.drawer && E.railMode !== "rec", rec = E.drawer && E.railMode === "rec";
  for (const [k, on] of [["drawer", vers], ["rail-rec", rec]]) {
    const b = $(`.est-top [data-k="${k}"]`);
    if (b) { b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); }
  }
  E.root?.classList.toggle("drawer-off", !E.drawer);
}

// ---------- annotations (desenhos) ----------
const annotationsOf = () => (E.base ? (E.ctx.S.annotations || []).filter((a) => a.option_id === E.base.id) : []);
async function saveDrawing() {
  if (!hasDrawing() && !E.prompt.trim()) return E.ctx.toast("Desenhe ou escreva o que mudar.", true);
  const { ctx } = E;
  E.busy = true; syncBar();
  try {
    const it = E.item, L = ctx.letterOf(it, E.base);
    const { data: a, error } = await ctx.sb.from("annotations").insert({
      option_id: E.base.id, item_id: it.id, side: ctx.SIDE, author: ctx.myName(), strokes: E.strokes, notes: E.notes, body: E.prompt.trim(),
    }).select().single();
    if (error) throw error;
    if (!ctx.TEAM) {
      const said = E.prompt.trim() || E.notes.map((n) => n.text).join("; ");
      await ctx.sb.from("comments").insert({ item_id: it.id, author: ctx.myName(), side: ctx.SIDE, body: `✏️ Desenhou na ${L ? `opção ${L}` : "imagem"}${said ? `: ${said}` : ""}` });
    }
    E.strokes = []; E.notes = []; E.hist = []; E.prompt = "";
    $(".est-prompt").value = "";
    E.shown.add(a.id);
    await ctx.refresh();
    ctx.toast(ctx.TEAM ? "Desenho salvo" : "Desenho enviado pra equipe");
  } catch (e) { ctx.toast(`Não deu certo: ${e.message || e}`, true); }
  E.busy = false;
  redraw(); syncChips(); syncTools(); syncBar(); syncRail();
}

// ---------- the prompt: text with references as small inline images (@ opens the room's images under the caret) ----------
// A reference in the text is a token <span class="est-tok" data-path data-kind data-label>, and also one of the refs. It is
// sent by the name the model knows it by among the files sent (image 3, @image2…), counted when Gerar builds that list.
const editor = () => { const el = $(".est-prompt"); return el?.isContentEditable ? el : null; };
function readPrompt(el, name) {
  let out = "";
  const walk = (n) => {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) out += c.nodeValue;
      else if (c.classList?.contains("est-tok")) out += name(c.dataset) || c.dataset.label;
      else if (c.nodeName === "BR") out += "\n";
      else { if (/^(DIV|P)$/.test(c.nodeName) && out && !out.endsWith("\n")) out += "\n"; walk(c); }
    }
  };
  walk(el);
  return out.replace(/ /g, " ");
}
// the text as the team reads it, each reference by its name in the room (@Ana): checks, the job's caption, Claude
const promptText = () => { const el = editor(); return el ? readPrompt(el, (d) => `@${d.label}`) : E.prompt; };
// the text the generator gets: name({path, kind, label}) gives each inline reference its name among the files sent
const promptFor = (name) => { const el = editor(); return el ? readPrompt(el, name) : E.prompt; };
// an inline reference, as pickMention() makes it: {path, kind, label, thumb}
const tokHTML = (x) => `<span class="est-tok" contenteditable="false" data-path="${esc(x.path)}" data-kind="${esc(x.kind)}" data-label="${esc(x.label)}">${x.kind === "image" ? (x.thumb ? `<img src="${esc(x.thumb)}" alt="">` : ICONS.image) : x.kind === "audio" ? ICONS.wave : ICONS.film}<span>${esc(x.label)}</span></span>`;
// a text the room wrote (the blocking recipe, Claude's prompt, a prompt brought back) with each image it names as the
// inline reference: "image 3" by its place among the files generate() sends (the drawing, which has no thumb, keeps
// its number), @image2/@video1/@audio1 by Seedance's lists, and @Label by a reference's name
function promptHTML(text) {
  const video = isVideo(), tags = video && vmodel().way !== "guide"; // Genjutsu says "Image 3", as the image models
  const base = E.base && { path: E.base.path, kind: "image", label: E.blocking ? "Blocking" : "Base", thumb: thumbUrl(E.base) };
  const imgs = E.refs.filter((r) => (r.kind || "image") === "image").map((r) => ({ ...r, kind: "image" }));
  const files = [...(base ? [base] : []), ...(base && !E.blocking && !video && drawingGoes() ? [null] : []), ...imgs];
  const pool = { image: [...(base ? [base] : []), ...imgs], video: E.refs.filter((r) => r.kind === "video"), audio: E.refs.filter((r) => r.kind === "audio") };
  const named = [...(base ? [base] : []), ...E.refs.map((r) => ({ ...r, kind: r.kind || "image" }))].sort((a, b) => b.label.length - a.label.length);
  const alt = named.map((x) => x.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  // Claude often names several references at once ("images 2 and 3", "images 2, 3 and 4"): each number becomes its own
  // reference too, or the ones it names look dropped from the text
  const re = new RegExp(`${tags ? "@(image|video|audio)(\\d+)\\b" : "\\b[Ii]mages (\\d+(?:(?:, and |, | and )\\d+)+)\\b|\\b[Ii]mage (\\d+)\\b(?!\\.\\d)"}${alt ? `|@(${alt})` : ""}`, "g");
  let out = "", at = 0;
  for (const m of text.matchAll(re)) {
    let html;
    if (!tags && m[1]) {
      const parts = m[1].split(/(, and |, | and )/);
      if (parts.some((x, i) => i % 2 === 0 && !files[x - 1])) continue;
      html = parts.map((x, i) => (i % 2 ? esc(x) : tokHTML(files[x - 1]))).join("");
    } else {
      const x = m[3] ? named.find((n) => n.label === m[3]) : tags ? pool[m[1]][m[2] - 1] : files[m[2] - 1];
      if (!x) continue;
      html = tokHTML(x);
    }
    out += esc(text.slice(at, m.index)) + html;
    at = m.index + m[0].length;
  }
  return (out + esc(text.slice(at))).replace(/\n/g, "<br>");
}
function putPrompt(text) {
  const el = $(".est-prompt");
  if (!el) return;
  if (el.isContentEditable) {
    el.innerHTML = promptHTML(text);
    el.classList.toggle("empty", !text);
    E.prompt = promptText();
    return;
  }
  el.value = text; fit(el);
  E.prompt = text;
}
const fold = (s) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
// the @word just typed before the caret, if any
function mentionAt() {
  const sel = getSelection();
  if (!sel.rangeCount || !sel.isCollapsed) return null;
  const node = sel.anchorNode, off = sel.anchorOffset;
  if (!node || node.nodeType !== 3 || !editor()?.contains(node)) return null;
  const m = node.nodeValue.slice(0, off).match(/(^|\s)@([^\s@]{0,24})$/u);
  return m ? { node, start: off - m[2].length - 1, end: off, q: m[2] } : null;
}
// the @ list: only what is already in the bar (the base, then the circles in their order), each with the tag the model
// knows it by (@image1, @video1, Imagem 2…) and its role; a word after the @ narrows it by name or tag. Anything else
// joins the bar through the + first
const MPAGE = 40;
async function syncMention() {
  const box = $(".est-mention");
  if (!box) return;
  const at = mentionAt();
  const hide = () => { E.mention = null; box.hidden = true; };
  if (!at) return hide();
  const was = E.mention?.at.node === at.node && E.mention.at.start === at.start ? E.mention : null;
  const q = fold(at.q);
  const baseTag = E.root?.querySelector(".est-refs .est-chip.base .est-tip b")?.textContent || "";
  const all = [
    ...(E.base ? [{ path: E.base.path, kind: "image", label: E.blocking ? "Blocking" : "Base", thumb: thumbUrl(E.base), tag: baseTag, role: "" }] : []),
    ...E.refs.map((r, i) => ({ path: r.path, preview: r.preview || null, kind: r.kind || "image", label: r.label, thumb: r.thumb || "", tag: tagOfChip(i), role: roleOf(r)?.[1] || "" })),
  ];
  const items = all.filter((x) => !q || fold(`${x.label} ${x.tag} ${x.role}`).includes(q));
  E.mention = { at, q: at.q, tab: "bar", page: 1, more: 0, items, tabs: ["bar"], i: was && was.q === at.q ? Math.min(was.i, Math.max(0, items.length - 1)) : 0 };
  const face = (x) => (x.thumb && x.kind !== "audio" ? `<img src="${esc(x.thumb)}" alt="">` : x.kind === "audio" ? ICONS.wave : ICONS.film);
  const row = (x, n) => `<button class="est-mrow ${n === E.mention.i ? "on" : ""}" data-k="mention" data-i="${n}" role="option" title="${esc(x.label)}${x.role ? ` · ${esc(x.role)}` : ""}">${face(x)}<span>${x.tag ? `<b class="est-mtag">${esc(x.tag)}</b>` : ""}${esc(x.label)}${x.role ? `<small>${esc(x.role)}</small>` : ""}</span>${x.kind === "audio" ? `<i class="est-mplay" data-k="play" data-path="${esc(x.path)}" title="Ouvir">${E.playing === x.path ? "■" : "▶"}</i>` : ""}</button>`;
  const body = !all.length ? `<p class="est-mnote">Nenhuma referência na barra ainda. <button class="link" data-k="pick">Juntar pelo +</button></p>`
    : !items.length ? `<p class="est-mnote">Nada com “${esc(at.q)}” nas bolinhas. <button class="link" data-k="pick">Procurar no +</button></p>`
    : items.map(row).join("");
  box.innerHTML = `<p class="est-mh est-mbar"><span>Na barra</span><small>${all.length}</small></p><div class="est-mlist" role="listbox" aria-label="Referências da barra">${body}</div>
    <p class="est-mfoot"><span><kbd>↑</kbd><kbd>↓</kbd><kbd>↵</kbd> usar</span><span>outras entram pelo +</span></p>`;
  box.hidden = false;
  // above the caret, inside the card, as tall as the room above it allows
  const r = document.createRange();
  r.setStart(at.node, at.start); r.collapse(true);
  const c = r.getBoundingClientRect(), card = $(".est-card").getBoundingClientRect();
  box.style.maxHeight = `${Math.max(200, Math.min(420, c.top - 14))}px`;
  box.style.left = `${Math.max(8, Math.min(c.left - card.left, card.width - box.offsetWidth - 8))}px`;
  box.style.bottom = `${card.bottom - c.top + 6}px`;
  markMention();
}
// the tabs fade at an edge that has more of them past it
const fadeTabs = (tb) => { tb.classList.toggle("fl", tb.scrollLeft > 1); tb.classList.toggle("fr", tb.scrollLeft + tb.clientWidth < tb.scrollWidth - 1); };
// the chosen line, in view
function markMention() {
  $(".est-mention")?.querySelectorAll(".est-mrow").forEach((b) => {
    const on = +b.dataset.i === E.mention?.i;
    b.classList.toggle("on", on);
    if (on) b.scrollIntoView({ block: "nearest" });
  });
}
// Tab and ⇧Tab in the @ list: the next tab with something in it (Tudo is always there)
function mentionTab(d) {
  const m = E.mention;
  if (!m) return;
  const k = Math.max(0, m.tabs.indexOf(m.tab));
  m.tab = m.tabs[(k + d + m.tabs.length) % m.tabs.length]; m.page = 1; m.i = 0;
  return syncMention();
}
function pickMention(j) {
  const x = E.mention?.items[j];
  if (!x) return;
  const { node, start, end } = E.mention.at;
  const range = document.createRange();
  range.setStart(node, start); range.setEnd(node, end);
  range.deleteContents();
  const tmp = document.createElement("span");
  tmp.innerHTML = tokHTML({ path: x.path, kind: x.kind, label: x.label, thumb: x.thumb || (x.o ? thumbUrl(x.o) : "") });
  const tok = tmp.firstChild;
  range.insertNode(tok);
  const space = document.createTextNode(" ");
  tok.after(space);
  const sel = getSelection(), after = document.createRange();
  after.setStart(space, 1); after.collapse(true);
  sel.removeAllRanges(); sel.addRange(after);
  E.mention = null;
  $(".est-mention").hidden = true;
  editor()?.classList.remove("empty");
  E.prompt = promptText();
  syncChips();
}

// ---------- generate ----------
async function generate() {
  if (isVideo()) return generateVideo();
  if (areaOn()) return generateArea();
  if (model().soul) return generateSoul();
  const { ctx } = E, m = model(), prompt = E.prompt.trim(), cam = camNow(), rec = recNow();
  if (E.busy || E.writing) return;
  if (!E.item) return ctx.toast("Esta cena ainda não tem item pra receber a imagem.", true);
  // the notes written on the drawing are an instruction of their own: with them the prompt may stay empty, and Claude
  // (when its key is set) first writes the prompt from them. So may a camera or a recipe set for a base (a new angle, a look)
  const said = E.base ? E.notes.map((n) => n.text).filter(Boolean).join("; ") : "";
  if (!prompt && !said && !(E.base && (cam.line || cam.novo || rec.list.length))) return ctx.toast("Escreva o que fazer, ou deixe uma nota no desenho.", true);
  if (!prompt && canWrite()) { await enhance(); if (E.prompt.trim()) return generate(); }
  if (m.needsImage && !E.base && !E.refs.length) return ctx.toast(`O ${m.name} precisa de uma imagem.`, true);
  // recipes on the card: Claude writes the request with them first (unless Melhorar already did)
  const wrote = rec.list.length && !rec.woven && canWrite() ? await writeFirst() : null;
  if (rec.list.length && !rec.woven && canWrite() && !wrote) return;
  E.busy = true; syncBar();
  try {
    const files = [], refs = [];
    let marksAt = 0;
    // an adjusted base (Ajustar) goes as its render
    if (E.base) { const bp = await basePath(); files.push(bp); refs.push({ path: bp, label: "Base" }); }
    const marks = E.base && hasDrawing() ? await marksPath() : null;
    const addMarks = () => { files.push(marks); refs.push({ path: marks, label: "Desenho" }); marksAt = files.length; };
    if (marks && !E.blocking) addMarks();
    for (const r of E.refs) if ((r.kind || "image") === "image") { files.push(r.path); refs.push({ path: r.path, label: r.label }); }
    if (marks && E.blocking) addMarks();
    if (files.length > m.max) throw new Error(`O ${m.name} aceita até ${m.max} imagens.`);
    // each image named in the text becomes "image N", N its place among the files sent (the base is image 1); what Claude
    // wrote for the recipes already numbers them that way
    const reshoot = cam.novo || rec.reshoot;
    const bare = reshoot ? "Photograph the scene of image 1 again from a new camera position." : said ? "Edit image 1 as the director's numbered notes ask." : rec.list.length ? "Change image 1 as the recipes below say." : "Make image 1 look as if it was shot with the camera described below, with everything in it kept as it is.";
    let full = wrote?.prompt || promptFor((d) => { const i = E.base && d.path === E.base.path ? 0 : files.indexOf(d.path); return i < 0 ? null : `image ${i + 1}`; }).trim() || bare;
    // Novo ângulo (or a recipe that photographs the scene again): the base is the scene, and the drawing says where the
    // camera goes; a recipe whose drawing only points keeps the marks from limiting the change
    if (reshoot) full += `\n\n${angleNote(!rec.list.some((r) => r.base !== "reshoot"))}`;
    if (marks) full += `\n\n${marksNote(marksAt, undefined, reshoot ? "new" : rec.limit ? "area" : "hint")}`;
    full += xfNote();
    // the camera's line goes last, once (not when Claude already wrote it into the text); so do the recipes when there was no
    // Claude to write them in
    if (cam.line && !cam.woven && !wrote) full += `\n\n${cam.line}`;
    if (rec.list.length && !rec.woven && !wrote) full += `\n\n${recText(rec.list)}`;
    const camGone = camData({ ...cam, woven: cam.woven || (!!wrote && !!cam.line) });
    const input = { prompt: full, ...(xfOn() && { ajuste: { ...E.xf } }), ...(camGone && { camera: camGone }), ...(rec.list.length && { recipes: rec.list.map(({ id, name }) => ({ id, name })) }) };
    if (files.length) input.image_urls = files;
    if (m.res.length) input.resolution = E.res;
    if (m.q.length) input.quality = E.quality;
    // "auto" keeps the base's aspect only on Nano Banana (Magnific); the Higgsfield models read it as "the model picks"
    // (GPT 2.5 came out 2048×2048 from a 16:9 base), so with a base they get the closest aspect they have
    if (m.ar.length) input.aspect_ratio = E.aspect === "auto" && E.base && m.via !== "magnific" ? nearAspect(m.ar.filter((a) => a !== "auto")) : E.aspect;
    const label = [m.label, m.res.length ? E.res.toUpperCase() : "", "estúdio"].filter(Boolean).join(" · ");
    for (let k = 0; k < E.count; k++) {
      const own = E.base?.id && E.base.item_id === E.item.id;
      const { job } = await call("submit", { item_id: E.item.id, base_option: E.base?.id || null, mode: E.parent ? "ref" : !E.base ? "create" : E.dest === "ver" && own ? "version" : "edit", model: m.id, label, prompt: prompt || said, input, refs, created_by: ctx.myName() });
      if (E.parent) { SWAPS.set(job.id, E.parent.ref); E.parent.ref.wait = (E.parent.ref.wait || 0) + 1; }
      track(job);
    }
    ctx.toast(E.count > 1 ? `${E.count} pedidos enviados` : "Pedido enviado");
  } catch (e) { ctx.toast(e.message || "Não deu certo", true); }
  E.busy = false; syncBar();
}
// só uma área (or several): each area goes as a request of its own, with its crop as image 1 (and, when the drawing
// reaches it, the crop with the marks as image 2), then its references and its own text. The job keeps where the area and
// the crop are (input.area: the server stores it and sends the model only its own fields), so whichever tab imports the
// result puts it back into the base (areaComposite). Several areas share input.group and come back together as one
// version (importGroup); ×N makes N such versions. It lands as the other edits do: a version of the base
async function generateArea() {
  const { ctx } = E, m = model();
  if (E.busy) return;
  if (!E.item) return ctx.toast("Esta cena ainda não tem item pra receber a imagem.", true);
  if (!m.sizes) return ctx.toast("A edição por área usa o Nano Banana 2.1: troque o modelo, ou tire as áreas com Esc.", true);
  stashArea();
  const many = E.areas.length > 1;
  // the drawing's notes inside an area are an instruction of their own: with them its text may stay empty
  const noted = (a) => { const geo = areaGeo(a); return geo?.crop ? marksIn(geo).pins.map(({ n }) => n.text).filter(Boolean).join("; ") : ""; };
  const blank = E.areas.findIndex((a) => !a.prompt.trim() && !noted(a));
  if (blank >= 0) {
    if (!many) return ctx.toast("Escreva o que mudar na área, ou deixe uma nota no desenho.", true);
    showArea(blank);
    return ctx.toast(`Escreva o que muda na área ${blank + 1}, ou deixe uma nota dentro dela.`, true);
  }
  // one area with only notes: Claude (when its key is set) first writes its text from them
  if (!many && !E.prompt.trim() && canWrite()) { await enhance(); if (E.prompt.trim()) return generate(); }
  E.busy = true; syncBar();
  try {
    // an adjusted base goes back as its render (a lossless file, so the rest of it stays pixel for pixel)
    const src = await basePath("png"), asks = [];
    for (const [i, a] of E.areas.entries()) {
      const cut = await areaCut(a), geo = cut.geo;
      const files = [cut.path], refs = [{ path: E.base.path, label: "Base" }];
      if (cut.marks) { files.push(cut.marks); refs.push({ path: cut.marks, label: "Desenho" }); }
      for (const r of a.refs) if ((r.kind || "image") === "image") { files.push(r.path); refs.push({ path: r.path, label: r.label }); }
      if (files.length > m.max) throw new Error(`${many ? `Área ${i + 1}: o` : "O"} ${m.name} aceita até ${m.max} imagens.`);
      // the base named in the text is its crop now (image 1); every other image keeps its place among the files sent
      let full = textOf(a, (d) => { if (d.path === E.base.path) return "image 1"; const k = files.indexOf(d.path); return k < 0 ? null : `image ${k + 1}`; }).trim() || "Make the change the director's numbered notes ask for.";
      if (cut.marks) full += `\n\n${marksNote(2, cut.pins)}`;
      full += `\n\n${areaNote(geo)}${xfNote()}`;
      const area = { src, W: geo.W, H: geo.H, box: geo.box, crop: geo.crop, out: geo.out, ratio: geo.ratio, s: Math.round(geo.s * 100) / 100 };
      asks.push({ i, said: a.prompt.trim() || noted(a), refs, input: { prompt: full, image_urls: files, resolution: geo.res, aspect_ratio: geo.ratio, area, ...(xfOn() && { ajuste: { ...E.xf } }) } });
    }
    const own = E.base.id && E.base.item_id === E.item.id, n = asks.length;
    const mode = E.parent ? "ref" : E.dest === "ver" && own ? "version" : "edit";
    const label = (what) => [m.label, E.res === "4k" ? "4K" : "2K", what, "estúdio"].join(" · ");
    for (let k = 0; k < E.count; k++) {
      // the areas of one version share a group
      const group = many ? { id: crypto.randomUUID(), n, label: label(`${n} áreas`) } : null;
      for (const q of asks) {
        const input = group ? { ...q.input, group: { ...group, i: q.i } } : q.input;
        const { job } = await call("submit", { item_id: E.item.id, base_option: E.base.id || null, mode, model: m.id, label: label(many ? `área ${q.i + 1} de ${n}` : "área"), prompt: q.said, input, refs: q.refs, created_by: ctx.myName() });
        if (E.parent) { SWAPS.set(job.id, E.parent.ref); E.parent.ref.wait = (E.parent.ref.wait || 0) + 1; }
        track(job);
      }
    }
    ctx.toast(many ? `${n * E.count} pedidos enviados: ${E.count > 1 ? `${E.count} versões, cada uma` : "uma versão"} com as ${n} áreas` : E.count > 1 ? `${E.count} pedidos enviados: só a área muda` : "Pedido enviado: só a área muda");
  } catch (e) { ctx.toast(e.message || "Não deu certo", true); }
  E.busy = false; syncBar();
}
// Soul 2: the base (adjusted with Ajustar when it is) is the scene it starts from, the Soul ID picked next to it is the
// face, at its strength; the job keeps whose face it was (input.soul) for the option's prompt
async function generateSoul() {
  const { ctx } = E, m = model(), prompt = E.prompt.trim();
  if (E.busy) return;
  if (!E.item) return ctx.toast("Esta cena ainda não tem item pra receber a imagem.", true);
  if (!E.base) return ctx.toast("O Soul 2 parte de uma imagem: escolha a base.", true);
  if (!E.soul || E.soul.status !== "completed") { E.soulOpen = true; syncSouls(); return ctx.toast("Escolha o rosto (Soul ID) na bolinha ao lado da base.", true); }
  if (!prompt) return ctx.toast("Escreva o que fazer.", true);
  // recipes on the card: Claude writes the request with them first (unless Melhorar already did)
  const cam = camNow(), rec = recNow();
  const wrote = rec.list.length && !rec.woven && canWrite() ? await writeFirst() : null;
  if (rec.list.length && !rec.woven && canWrite() && !wrote) return;
  E.busy = true; syncBar();
  try {
    const bp = await basePath(), strength = Math.round((E.soulK ?? 1) * 100) / 100;
    const full = (wrote?.prompt || promptFor((d) => (d.path === E.base.path ? "the reference image" : null)).trim()) + xfNote()
      + (cam.line && !cam.woven && !wrote ? `\n\n${cam.line}` : "") + (rec.list.length && !rec.woven && !wrote ? `\n\n${recText(rec.list)}` : "");
    const camGone = camData({ ...cam, woven: cam.woven || (!!wrote && !!cam.line) });
    const input = { prompt: full, image_url: bp, custom_reference_id: E.soul.ref_id, custom_reference_strength: strength, resolution: E.res, aspect_ratio: E.aspect, batch_size: 1,
      soul: { name: E.soul.name, ref_id: E.soul.ref_id, strength }, ...(xfOn() && { ajuste: { ...E.xf } }), ...(camGone && { camera: camGone }), ...(rec.list.length && { recipes: rec.list.map(({ id, name }) => ({ id, name })) }) };
    const label = [m.label, E.res, E.soul.name, "estúdio"].join(" · ");
    const own = E.base.id && E.base.item_id === E.item.id;
    for (let k = 0; k < E.count; k++) {
      const { job } = await call("submit", { item_id: E.item.id, base_option: E.base.id || null, mode: E.parent ? "ref" : E.dest === "ver" && own ? "version" : "edit", model: m.id, label, prompt, input, refs: [{ path: bp, label: "Base" }], created_by: ctx.myName() });
      if (E.parent) { SWAPS.set(job.id, E.parent.ref); E.parent.ref.wait = (E.parent.ref.wait || 0) + 1; }
      track(job);
    }
    ctx.toast(E.count > 1 ? `${E.count} pedidos enviados com o rosto de ${E.soul.name}` : `Pedido enviado com o rosto de ${E.soul.name}`);
  } catch (e) { ctx.toast(e.message || "Não deu certo", true); }
  E.busy = false; syncBar();
}
// Seedance: the base (or the first image) and the files attached, each in its own list, in the order of the chips
async function generateVideo() {
  const { ctx } = E, m = vmodel(), prompt = E.prompt.trim();
  if (E.busy) return;
  if (!E.item) return ctx.toast("Esta cena ainda não tem item pra receber o vídeo.", true);
  if (!prompt) return ctx.toast("Escreva o que acontece no plano.", true);
  const pool = { image: [], video: [], audio: [] }, refs = [];
  if (E.base) { pool.image.push(E.base.path); refs.push({ path: E.base.path, label: "Base", kind: "image" }); }
  for (const r of E.refs) { const k = r.kind || "image"; pool[k].push(r.path); refs.push({ path: r.path, label: r.label, kind: k }); }
  // each reference named in the text becomes its Seedance tag (@image2, @audio1…), counted in its own list; the camera's
  // line (in Seedance's terms) goes last, once, and the recipes made for video go through Claude first (see below)
  // Genjutsu knows its images as Image 1, Image 2… and has one video, the guide
  const guide = m.way === "guide", edit = m.way === "edit";
  const said = promptFor((d) => { const i = (pool[d.kind] || []).indexOf(d.path); return i < 0 ? null : !guide ? `@${d.kind}${i + 1}` : d.kind === "image" ? `Image ${i + 1}` : d.kind === "video" && !i ? "the video" : null; }).trim();
  const cam = camNow(), rec = recNow();
  const input = { prompt: said || prompt, duration: E.dur, resolution: E.vres, generate_audio: E.sound };
  let id = m.id;
  if (m.way === "frames") {
    if (!pool.image.length) return ctx.toast("Junte com + a imagem do primeiro quadro.", true);
    input.image_url = pool.image[0];
    if (pool.image[1]) input.end_image_url = pool.image[1];
  } else if (guide) {
    if (pool.video.length !== 1) return ctx.toast(pool.video.length ? "O Genjutsu usa um vídeo-guia só: deixe um vídeo." : "Junte com + o vídeo-guia (aba Vídeos), de 4 a 30 segundos.", true);
    if (!pool.image.length) return ctx.toast("Junte com + as imagens do que entra no vídeo.", true);
    if (pool.image.length > GUIDE_MAX) return ctx.toast(`O Genjutsu aceita até ${GUIDE_MAX} imagens.`, true);
    // the video sets the length and the sound
    delete input.duration;
    delete input.generate_audio;
    input.video_url = pool.video[0];
    input.image_urls = pool.image;
  } else if (edit) {
    // Seedance edits the first video (@video1) and keeps its length, framing and timing
    if (!pool.video.length) return ctx.toast("Junte com + o vídeo que vai ser editado (aba Vídeos).", true);
    if (pool.image.length > EDIT_MAX) return ctx.toast(`A edição do Seedance aceita até ${EDIT_MAX} imagens.`, true);
    for (const k of ["video", "audio"]) if (pool[k].length > VMAX[k][0]) return ctx.toast(`O Seedance aceita até ${VMAX[k][0]} ${VMAX[k][1]}.`, true);
    delete input.duration;
    input.video_url = pool.video[0];
    if (pool.video.length > 1) input.video_urls = pool.video.slice(1);
    if (pool.image.length) input.image_urls = pool.image;
    if (pool.audio.length) input.audio_urls = pool.audio;
  } else {
    const seen = pool.image.length + pool.video.length;
    if (pool.audio.length && !seen) return ctx.toast("A voz precisa de pelo menos uma imagem ou um vídeo junto.", true);
    for (const [k, [max, word]] of Object.entries(VMAX)) if (pool[k].length > max) return ctx.toast(`O Seedance aceita até ${max} ${word}.`, true);
    if (!seen) id = TEXT_TO_VIDEO;
    if (pool.image.length) input.image_urls = pool.image;
    if (pool.video.length) input.video_urls = pool.video;
    if (pool.audio.length) input.audio_urls = pool.audio;
    input.aspect_ratio = E.vaspect;
  }
  // recipes on the card: Claude writes the shot with them first (unless Melhorar already did)
  const wrote = rec.list.length && !rec.woven && canWrite() ? await writeFirst() : null;
  if (rec.list.length && !rec.woven && canWrite() && !wrote) return;
  if (wrote) input.prompt = wrote.prompt;
  // Genjutsu's camera is the guide video's, and an edit keeps the camera of the video it edits
  if (cam.line && !cam.woven && !wrote && !guide && !edit) input.prompt += `\n\n${cam.line}`;
  if (rec.list.length && !rec.woven && !wrote) input.prompt += `\n\n${recText(rec.list)}`;
  const camGone = guide || edit ? null : camData({ ...cam, woven: cam.woven || (!!wrote && !!cam.line) });
  if (camGone) input.camera = camGone;
  if (rec.list.length) input.recipes = rec.list.map(({ id, name }) => ({ id, name }));
  E.busy = true; syncBar();
  try {
    const label = [m.label, E.vres, guide || edit ? "" : `${E.dur}s`, "estúdio"].filter(Boolean).join(" · ");
    for (let k = 0; k < E.count; k++) {
      const { job } = await call("submit", { item_id: E.item.id, base_option: E.base?.id || null, mode: "video", model: id, label, prompt, input, refs, created_by: ctx.myName() });
      if (E.parent) { SWAPS.set(job.id, E.parent.ref); E.parent.ref.wait = (E.parent.ref.wait || 0) + 1; }
      track(job);
    }
    ctx.toast(E.count > 1 ? `${E.count} vídeos pedidos` : "Vídeo pedido");
  } catch (e) { ctx.toast(e.message || "Não deu certo", true); }
  E.busy = false; syncBar();
}

// ---------- Melhorar: Claude reads the prompt and the drawing's notes, looks at the images in the order the generator will
// get them (smaller copies), and writes a better prompt in place of the text. ⌘Z in the prompt brings the old text back.
// With recipes on the card it writes them in too, and Gerar does the same before sending when Melhorar was not used ----------
async function enhance() {
  const { ctx } = E;
  if (E.writing || E.busy) return;
  const noted = E.base && !isVideo() && E.notes.some((n) => n.text);
  if (!E.prompt.trim() && !noted && !E.base && !E.refs.length && !E.recipes.length) return ctx.toast("Escreva a ideia em poucas palavras, em português mesmo.", true);
  E.writing = true; syncBar();
  try {
    const w = await writeRequest();
    setPrompt(w.prompt);
    const text = promptText();
    // what it wrote in does not go again at Gerar, unless it changes or the text is no longer this one
    E.camWoven = w.cam.line ? { key: w.cam.key, text } : null;
    E.recWoven = w.rec.list.length ? { key: w.rec.key, text } : null;
    ctx.toast(`Prompt ${w.rec.list.length ? "escrito com as receitas" : "melhorado"}${w.cam.line ? ", com a câmera no texto" : ""}. ⌘Z no texto volta ao anterior.`);
  } catch (e) { ctx.toast(e.message || "O Claude não respondeu", true); }
  E.writing = false; syncBar();
}
// Gerar with recipes on the card: Claude writes the request first (the bar shows it writing); the text on the card stays
async function writeFirst() {
  E.writing = true; syncBar();
  try { return await writeRequest(); } catch (e) { E.ctx.toast(`O Claude não escreveu o pedido: ${e.message || e}`, true); return null; } finally { E.writing = false; syncBar(); }
}
// what Claude reads to write the request: the images in the order the generator gets them, the drawing's notes, the text,
// the camera and the recipes, and what the base and the drawing are for (a new angle: the scene to photograph again and where
// the camera goes; a recipe whose drawing only points: what the request is about)
async function writeRequest() {
  const { ctx } = E, video = isVideo(), frames = video && vmodel().way === "frames", guide = video && vmodel().way === "guide", edit = video && vmodel().way === "edit";
  let notes = E.base && !video ? E.notes.map((n) => n.text).filter(Boolean) : [];
  // smaller copies; the base as the generator will get it (adjusted with Ajustar, or itself)
  const baseSmall = E.base && !video ? await basePath("small") : E.base ? E.base.preview_path || E.base.path : null;
  const small = (o) => (o === E.base ? baseSmall : o.preview_path || o.path);
  const images = [], tags = [];
  const imgRefs = E.refs.filter((r) => (r.kind || "image") === "image").map((r) => ({ path: r.preview || r.path, label: r.label + roleSays(r) }));
  // only an area: Claude sees the crop the model will get for the area the card edits, so what it writes is about that
  // picture, with the notes that fall in it
  const area = !video && areaOn() ? await areaCut(activeArea(), { small: true }) : null;
  if (area) notes = area.pins.map(({ n }) => n.text).filter(Boolean);
  // Soul 2 gets the base alone, so Claude sees just that; with Novo ângulo the base is the scene to photograph again and
  // the drawing shows where the camera goes
  const soul = soulOn(), cam = camNow(), rec = recNow(), reshoot = cam.novo || rec.reshoot;
  const marksSay = reshoot ? ": they show where the new camera goes and what it frames" : !rec.limit ? ": they point at what the request is about" : "";
  const marks = E.base && !video && !area && !soul && hasDrawing() ? { path: await marksPath(1600), label: `the same picture with the director's marks and numbered notes on top${marksSay}` } : null;
  if (area) {
    images.push({ path: area.small, label: "a close-up crop of the picture to edit, enlarged: only its marked middle area changes, the edges stay as they are" });
    if (area.marksSmall) images.push({ path: area.marksSmall, label: "the same crop with the director's marks and numbered notes on top" });
    images.push(...imgRefs);
  } else if (video) {
    if (E.base) images.push({ path: small(E.base), label: frames ? "the first frame" : "the base image" });
    images.push(...imgRefs.map((r, i) => (frames && !E.base && i === 0 ? { ...r, label: `the first frame (${r.label})` } : r)));
    if (frames) images.splice(2);
    else if (guide) {
      // Genjutsu: up to 8 images in order, and the guide video, which Claude does not see
      images.splice(GUIDE_MAX);
      const v = E.refs.find((r) => r.kind === "video");
      if (v) tags.push({ tag: "the video", label: `the guide video "${v.label}"${roleSays(v)}` });
    } else {
      // an edit: up to 5 images, and the first video is the one it edits
      if (edit) images.splice(EDIT_MAX);
      const n = { video: 0, audio: 0 };
      for (const r of E.refs) if (r.kind === "video" || r.kind === "audio") tags.push({ tag: `@${r.kind}${++n[r.kind]}`, label: (r.kind === "audio" ? `voice take "${r.label}"` : edit && n.video === 1 ? `the video to edit, the editing master "${r.label}"` : `video "${r.label}"`) + roleSays(r) });
    }
  } else if (E.blocking) {
    images.push({ path: small(E.base), label: "the 3D blocking frame" }, ...imgRefs);
    if (marks) images.push(marks);
  } else if (E.base) {
    images.push({ path: small(E.base), label: soul ? "the scene to start from (the face comes from a trained Soul ID)" : reshoot ? "the scene to photograph again from a new camera position (not a frame to keep)" : "the picture to edit" });
    if (marks) images.push(marks);
    if (!soul) images.push(...imgRefs);
  } else images.push(...imgRefs);
  const it = E.item;
  // the camera goes as the same line Gerar would add, and the recipes as the team wrote them: Claude weaves both into the
  // text once (then Gerar does not add them again)
  const { prompt } = await call("write", {
    kind: video ? (guide ? (vmodel().id.includes("motion") ? "motion" : "swap") : frames ? "frames" : edit ? "vedit" : "video") : E.blocking ? "blocking" : E.base ? (reshoot ? "angle" : "edit") : "create",
    images, tags, notes, prompt: E.prompt.trim(), item: it?.title || "", scene: ctx.sceneName(it?.scene ?? E.scene) || "",
    // the film's look, which Claude keeps in every prompt (the function has a neutral one when this is empty)
    look: String(ESTUDIO?.look || "").slice(0, 400),
    // the words the film never wants in a prompt (config.js ESTUDIO.avoid), not even negated
    ...(Array.isArray(ESTUDIO?.avoid) && ESTUDIO.avoid.length && { avoid: ESTUDIO.avoid.slice(0, 8) }),
    ...(video && !guide && !edit && { duration: E.dur, aspect: frames ? "" : E.vaspect }),
    ...((cam.line || cam.novo) && !guide && !edit && { camera: { line: cam.line, novo: cam.novo, how: video ? "video" : reshoot ? "new" : cam.how } }),
    ...(rec.list.length && { recipes: rec.list.map((r) => ({ name: r.name, instruction: r.instruction, base: r.base, drawing: r.drawing })) }),
  });
  return { prompt, cam, rec };
}
// replaces the prompt as if typed, so the field's own undo brings the old text back; the images it names come in as
// inline references
function setPrompt(text) {
  const t = $(".est-prompt");
  if (!t) return;
  t.focus();
  if (t.isContentEditable) {
    // Chrome answers false for HTML with a contenteditable=false token even when it put it in, so check the field
    const was = t.innerHTML;
    getSelection().selectAllChildren(t);
    document.execCommand?.("insertHTML", false, promptHTML(text));
    if (t.innerHTML === was && text) putPrompt(text);
  } else {
    t.select();
    if (!document.execCommand?.("insertText", false, text)) putPrompt(text);
  }
  if (t.isContentEditable) { t.classList.toggle("empty", !t.textContent.trim()); E.prompt = promptText(); } else { E.prompt = t.value; fit(t); }
}

// ---------- the overlay ----------
function teardown() {
  if (!E.root) return;
  pvHide(); cmClose(); bigClose();
  window.removeEventListener("keydown", onKey, true);
  E.ro?.disconnect();
  E.fit?.disconnect();
  E.audio?.pause();
  listeners.delete(syncRail);
  // not closed: a Gerar sent just before closing may still be cutting its areas from it
  E.orig = null;
  if (draftWait) draftSave(true);
  E.root.remove();
  E.root = null;
  document.body.classList.remove("est-open");
}
// a reference opened from another generation closes back into that generation
function close() {
  if (!E.root) return;
  if (E.mode === "draw" && hasDrawing() && !confirm("Sair sem salvar o desenho?")) return;
  if (E.parent) return goBack();
  teardown();
}
// a click on a reference's circle opens that image in the studio over the generation it is in: its edits become versions
// of it (its card keeps the face it had) and the newest goes back into the reference's place (swapRef). The generation
// waits as it was: the text, the drawing, the references and the settings
const SESSION = ["mode", "item", "base", "refs", "strokes", "notes", "hist", "tool", "color", "scene", "round", "blocking", "view", "areas", "ai", "xf",
  "model", "aspect", "res", "quality", "count", "kind", "vmodel", "vaspect", "vres", "dur", "sound", "dest", "parent", "recipeKey", "cam", "camWoven",
  "recipes", "recWoven", "railMode", "draftKey", "draftBase"];
async function openRef(i) {
  const { ctx } = E, r = E.refs[i];
  if (!r) return;
  if ((r.kind || "image") !== "image") return ctx.toast("Dá pra editar só as imagens.", true);
  // a file from outside the room becomes an option of this card first (adoptRef)
  const o = refOpt(r) || (await adoptRef(r));
  if (!o || !E.root) return;
  const title = E.blocking ? "Render do blocking" : E.mode === "create" ? "Criar" : isVideo() ? "Vídeo com IA" : "Editar com IA";
  const snap = { ...Object.fromEntries(SESSION.map((k) => [k, E[k]])), prompt: promptText() };
  teardown();
  open(ctx, { mode: "edit", base: o, item: ctx.itemOf(o.item_id), kind: "image", blocking: false, dest: "ver", parent: { snap, ref: r, title } });
}
function goBack() {
  const { snap } = E.parent;
  teardown();
  open(E.ctx, snap);
}
// ---------- the draft: what was being set up survives a reload or a close ----------
// One per session, in this browser only (localStorage): a card's ✦ or Criar com IA (card:<item>, or create:<round>:<scene>
// with no card), an image edited (edit:<option>), a video edited (vedit:<option>:<model>). It keeps the prompt as written
// (@Nome), the circles in their order with their roles, the destination card, and the model with its settings; not the
// drawing. Written 0.7 s after a change, on close and when the tab goes away, and only after a person changed something and
// while it differs from how the studio opened. Opening the same session brings it back with a toast to start over; a
// card's kit saved after it wins. At most DRAFT_MAX are kept, the oldest dropped
const DRAFT = "sala-est-draft:";
const DRAFT_MAX = 40;
let draftWait = null;
const draftGet = (key) => { try { return JSON.parse(localStorage.getItem(DRAFT + key) || "null"); } catch { return null; } };
const draftDrop = (key) => { try { if (key) localStorage.removeItem(DRAFT + key); } catch {} };
// a room image or file is shown by its small copy; a file uploaded in the studio, by itself (an image) or by its icon
function refThumb(path, kind) {
  const { S } = E.ctx, x = S.options.find((o) => o.path === path) || S.files.find((f) => f.path === path);
  return x ? x.thumb_path || x.preview_path || (kind === "image" ? x.path : null) : kind === "image" ? path : null;
}
const draftState = () => ({
  kind: E.kind, model: E.model, aspect: E.aspect, res: E.res, quality: E.quality, vmodel: E.vmodel, vaspect: E.vaspect, vres: E.vres, dur: E.dur, sound: !!E.sound,
  item: E.item?.id || null,
  refs: E.refs.filter((r) => !r.wait).map((r) => ({ path: r.path, preview: r.preview || null, thumb_path: r.thumb_path || refThumb(r.path, r.kind || "image"), label: r.label, kind: r.kind || "image", ...(r.role && { role: r.role }) })),
  prompt: promptText(),
});
const draftSig = () => JSON.stringify(draftState());
function draftPrune() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k?.startsWith(DRAFT)) keys.push(k); }
  if (keys.length <= DRAFT_MAX) return;
  const at = (k) => { try { return JSON.parse(localStorage.getItem(k))?.at || 0; } catch { return 0; } };
  keys.map((k) => [k, at(k)]).sort((a, b) => a[1] - b[1]).slice(0, keys.length - DRAFT_MAX).forEach(([k]) => localStorage.removeItem(k));
}
function draftSave(now = false) {
  clearTimeout(draftWait);
  draftWait = null;
  if (!E.draftKey || !E.root || E.draftBase == null || E.draftHold || !E.draftDirty) return;
  const write = () => {
    draftWait = null;
    if (!E.draftKey || !E.root || E.draftBase == null) return;
    const s = draftState(), key = E.draftKey;
    try {
      if (JSON.stringify(s) === E.draftBase) return draftDrop(key);
      localStorage.setItem(DRAFT + key, JSON.stringify({ at: Date.now(), s }));
      draftPrune();
    } catch {}
  };
  if (now) write();
  else draftWait = setTimeout(write, 700);
}
addEventListener("pagehide", () => draftSave(true));
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") draftSave(true); });
// the draft over the studio just opened: the settings, the circles (their small copies signed again), the card, the text
async function applyDraft(s) {
  const { ctx } = E, list = (Array.isArray(s.refs) ? s.refs : []).filter((r) => r?.path);
  await ctx.sign(list.map((r) => r.thumb_path).filter(Boolean)).catch(() => {});
  if (!E.root) return;
  const has = (models, id) => models.some((m) => m.id === id);
  Object.assign(E, {
    kind: s.kind === "video" ? "video" : "image",
    ...(has(MODELS, s.model) && { model: s.model }), ...(has(VIDEO_MODELS, s.vmodel) && { vmodel: s.vmodel }),
    ...(s.aspect && { aspect: s.aspect }), ...(s.res && { res: s.res }), ...(s.quality && { quality: s.quality }),
    ...(s.vaspect && { vaspect: s.vaspect }), ...(s.vres && { vres: s.vres }), ...(DURS.includes(s.dur) && { dur: s.dur }), sound: s.sound ?? E.sound,
    refs: list.map((r) => ({ path: r.path, preview: r.preview || null, thumb_path: r.thumb_path || null, thumb: r.thumb_path ? ctx.urls.get(r.thumb_path) || "" : "", label: r.label || "Referência", kind: r.kind || "image", ...(r.role && { role: r.role }) })),
  });
  const it = s.item && E.mode === "create" && ctx.itemOf(s.item);
  if (it) E.item = it;
  E.draftHold = true;
  syncHead();
  syncAll();
  putPrompt(s.prompt || "");
  E.draftHold = false;
  clearTimeout(draftWait);
  draftWait = null;
}
// open a session that keeps a draft: as it would open, then this browser's draft of it on top (unless something saved
// after it, since: a card's kit), with a toast that starts over from how it would have opened
async function openDrafted(ctx, init, key, since = 0) {
  const fresh = () => ({ ...init, refs: (init.refs || []).map((r) => ({ ...r })), draftKey: key });
  open(ctx, fresh());
  const d = key && draftGet(key);
  if (!d?.s) return;
  if (since && d.at < since) return draftDrop(key);
  await applyDraft(d.s);
  if (!E.root || E.draftKey !== key) return;
  const t = new Date(d.at), day = t.toDateString() === new Date().toDateString() ? "" : `${t.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} `;
  ctx.toast(`Rascunho de ${day}${t.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} de volta: o texto, as referências e o modelo`, false, {
    label: "Começar do zero",
    fn: () => { clearTimeout(draftWait); draftWait = null; E.draftKey = null; draftDrop(key); open(ctx, fresh()); },
  });
}
// the blocking frame of a render opens at its source, the location's Cena 3D on that angle (a click on the base's circle).
// The render waits here; the 3D's Salvar e voltar brings the new frame back as the base (takeAngle), with the text, the
// references and the settings as they were, or with the new angle's recipe while they were still the recipe's
let HELD = null, heldN = 0;
const recipeKey = () => JSON.stringify([promptText(), E.refs.map((r) => r.path)]);
function openSource() {
  const { ctx } = E, o = E.base;
  if (!E.blocking || !o) return;
  HELD = { snap: { ...Object.fromEntries(SESSION.map((k) => [k, E[k]])), prompt: promptText() }, from: o.id, loc: o.item_id, n: ++heldN,
    title: "Render do blocking", kept: !!E.recipeKey && recipeKey() === E.recipeKey, back: location.hash };
  teardown();
  ctx.openCena3d(o);
}
export const heldRender = () => (HELD ? { from: HELD.from, loc: HELD.loc, n: HELD.n, title: HELD.title } : null);
export async function takeAngle(ctx, optionId) {
  const held = HELD;
  HELD = null;
  if (!held) return;
  E.ctx = ctx;
  const o = ctx.S.options.find((x) => x.id === optionId);
  if (!o) return reopen(ctx, held, held.snap);
  const snap = { ...held.snap, base: o, view: null, strokes: [], notes: [], hist: [] };
  const recipe = held.kept ? await blockingRecipe(ctx, o).catch(() => null) : null;
  if (recipe) Object.assign(snap, { refs: recipe.refs, prompt: recipe.prompt });
  else {
    // the text was changed here: it stays, with the new lens where it names the old one
    const { data } = await ctx.sb.from("blocking_shots").select("option_id, camera").in("option_id", [held.from, o.id]);
    const mm = (id) => Math.round(data?.find((r) => r.option_id === id)?.camera?.lens_mm || 0);
    const a = mm(held.from), b = mm(o.id);
    if (a && b && a !== b) snap.prompt = snap.prompt.replaceAll(`(${a}mm)`, `(${b}mm)`);
  }
  await ctx.sign([o.preview_path || o.path, o.thumb_path || o.preview_path || o.path]);
  reopen(ctx, held, snap);
  if (recipe) E.recipeKey = recipeKey();
  ctx.toast("✦ O ângulo novo é a base do render");
}
export function dropHeld(ctx) {
  const held = HELD;
  HELD = null;
  if (held) { E.ctx = ctx; reopen(ctx, held, held.snap); }
}
// back where the render was opened from (the room behind the studio), then the render itself
function reopen(ctx, held, snap) {
  if (held.back && location.hash !== held.back) location.hash = held.back;
  open(ctx, snap);
}
// the newest version of an edited reference takes its place in the generation it came from, open or waiting behind the
// edit: in its circle and in the prompt's inline image
async function swapRef(ref, id) {
  const { ctx } = E;
  let o = optOf(id);
  if (!o) { await ctx.refresh(); o = optOf(id); }
  if (o && o.path !== ref.path) {
    await ctx.sign([o.thumb_path || o.preview_path || o.path]);
    const old = ref.path, here = !!E.root && E.refs.includes(ref);
    Object.assign(ref, { path: o.path, preview: o.preview_path || null, thumb_path: o.thumb_path || null, thumb: thumbUrl(o) });
    if (here) {
      E.root.querySelectorAll(".est-tok").forEach((t) => { if (t.dataset.path !== old) return; t.dataset.path = o.path; const im = t.querySelector("img"); if (im) im.src = ref.thumb; });
      E.prompt = promptText();
    }
    if (here || (E.root && E.parent?.ref === ref)) ctx.toast(`✦ ${ref.label}: a versão nova já está na geração`);
  }
  if (E.root) { syncChips(); if (E.parent) syncView(); }
}
// the text's inline references to one file now stand for another (a copy, a swap): its path, its picture and its name
function retoken(old, ref) {
  let n = 0;
  E.root?.querySelectorAll(".est-tok").forEach((t) => {
    if (t.dataset.path !== old) return;
    const tmp = document.createElement("span");
    tmp.innerHTML = tokHTML({ path: ref.path, kind: ref.kind || "image", label: ref.label, thumb: ref.thumb });
    t.replaceWith(tmp.firstChild);
    n++;
  });
  if (n) E.prompt = promptText();
  return n;
}
// Substituir (a circle's menu): what was picked takes the reference's place, in its circle (its @ number stays) and in
// the text wherever it is named; the role stays when it fits the new kind. Already in another circle, that one leaves
function swapIn(old, ref) {
  const { ctx } = E, i = E.refs.indexOf(old);
  if (i < 0 || !E.root) return;
  if (ref.path === old.path) return ctx.toast("É a mesma referência.");
  const kind = ref.kind || "image", role = old.role && (ROLES[kind] || []).some(([k]) => k === old.role) ? old.role : null;
  const nu = { ...ref, ...(role && { role }) };
  E.refs[i] = nu;
  const j = E.refs.findIndex((x, n) => n !== i && x.path === nu.path);
  if (j >= 0) E.refs.splice(j, 1);
  const n = retoken(old.path, nu);
  syncChips();
  ctx.toast(`${old.label} → ${nu.label}: trocada na bolinha${n ? " e no texto" : ""}`);
}
// a reference that came from outside the room (the computer, a kit, the material) is edited as an option of this card: a
// copy of its file goes in, out of what the client sees (envio), and its edits are versions of it that come back into the
// circle. A copy, because deleting that option deletes its files and the material's file must stay. Once per circle
const ADOPT = new WeakMap();
function adoptRef(r) {
  if (!ADOPT.has(r)) ADOPT.set(r, adopt(r).finally(() => ADOPT.delete(r)));
  return ADOPT.get(r);
}
async function adopt(r) {
  const { ctx } = E, it = E.item;
  if (!it) { ctx.toast("Esta referência veio de fora da sala: abra o estúdio por um card pra editá-la nele.", true); return null; }
  const f = refFile(r), kind = r.kind || "image", id = crypto.randomUUID(), done = new Map();
  const B = ctx.sb.storage.from(ctx.bucket || "media");
  const extOf = (p) => (p.match(/\.([a-z0-9]{2,5})$/i)?.[1] || "").toLowerCase();
  const copy = async (from, tail) => {
    if (!from) return null;
    if (!done.has(from)) {
      const to = `items/${it.id}/${id}${tail}.${extOf(from) || (kind === "video" ? "mp4" : "jpg")}`;
      const { error } = await B.copy(from, to);
      if (error) throw error;
      done.set(from, to);
    }
    return done.get(from);
  };
  ctx.toast(`Trazendo ${r.label} pro card…`);
  try {
    const path = await copy(r.path, "");
    const preview = await copy(r.preview || f?.preview_path, ".preview").catch(() => null);
    const thumb = await copy(r.thumb_path || f?.thumb_path, ".thumb").catch(() => null);
    const ext = extOf(r.path);
    const mime = f?.mime || { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm" }[ext] || (kind === "video" ? "video/mp4" : "image/jpeg");
    // the option and its envio row are made together (adopt_ref), so the client never receives it
    const { error } = await ctx.sb.rpc("adopt_ref", {
      p_id: id, p_item: it.id, p_path: path, p_preview: preview, p_thumb: thumb, p_mime: mime, p_name: (f?.name || `${r.label}.${ext || "jpg"}`).slice(0, 120),
      p_by: ctx.myName(), p_caption: `Referência · ${r.label}`.slice(0, 140),
    });
    if (error) throw error;
    await ctx.refresh();
    const old = r.path;
    Object.assign(r, { path, preview, thumb_path: thumb });
    retoken(old, r);
    if (E.root) syncChips();
    ctx.toast(`${r.label} virou opção de ${it.title}, fora do envio`);
    return ctx.S.options.find((x) => x.id === id) || null;
  } catch (err) {
    ctx.toast(`Não deu pra trazer ${r.label} pra sala: ${err.message || err}`, true);
    return null;
  }
}
// a voice take plays or stops (the picker, the @ list and a voice circle's menu); the picker and the @ list show which
async function togglePlay(path) {
  const { ctx } = E;
  const shown = () => { syncPicker(); $(".est-mention")?.querySelectorAll(".est-mplay").forEach((p) => { p.textContent = E.playing === p.dataset.path ? "■" : "▶"; }); };
  E.audio ||= new Audio();
  E.audio.onended = () => { E.playing = null; shown(); };
  if (E.playing === path) { E.audio.pause(); E.playing = null; return shown(); }
  await ctx.sign([path]);
  E.audio.src = ctx.urls.get(path) || "";
  E.playing = path;
  E.audio.play().catch(() => { E.playing = null; shown(); });
  return shown();
}

// ---------- a reference's circle. Hovering shows it big: an image whole, a video playing muted in a loop (a click gives it
// sound), a voice playing with its time bar. The right button opens what can be done with it: Ver grande, Editar (an
// image of the room in the studio; a video of the room with Seedance or Genjutsu, the result coming back into the circle),
// Versão, Papel, Mover (its @ number), Abrir no card, Tirar. Ver grande is a player where a video gives a frame as a new
// image reference ----------
const PV = { el: null, i: -1, timer: 0, out: 0, audio: null };
const refOpt = (r) => (r ? E.ctx.S.options.find((o) => o.path === r.path) : null);
const refFile = (r) => (r ? (E.ctx.S.files || []).find((f) => f.path === r.path) : null);
const chipOf = (i) => E.root?.querySelector(`.est-refs .est-chip[data-i="${i}"]`);
const tagOfChip = (i) => chipOf(i)?.querySelector(".est-tip b")?.textContent || "";
const secs = (d) => `${(Math.round(d * 10) / 10).toLocaleString("pt-BR")} s`;
// an image and its edits, oldest first (options.stack points at the original)
const versionsOf = (o) => { const r = rootOf(o); return r ? E.ctx.S.options.filter((x) => isImg(x) && (x.id === r.id || x.stack === r.id)).sort((a, b) => a.created_at.localeCompare(b.created_at)) : []; };
async function mediaUrl(path) {
  await E.ctx.sign([path]).catch(() => {});
  return E.ctx.urls.get(path) || "";
}
function onPvOver(e) {
  if (e.pointerType === "touch" || !E.root) return;
  if (e.target.closest?.(".est-pv")) return clearTimeout(PV.out);
  const chip = e.target.closest?.(".est-refs .est-chip[data-i]");
  if (!chip || E.cm || E.big) return;
  clearTimeout(PV.out);
  const i = +chip.dataset.i;
  if (PV.el && PV.i === i) return;
  clearTimeout(PV.timer);
  PV.timer = setTimeout(() => pvShow(i), PV.el ? 0 : 220);
}
function onPvOut(e) {
  const from = e.target.closest?.(".est-refs .est-chip[data-i], .est-pv"), to = e.relatedTarget;
  if (!from || (to && (from.contains(to) || to.closest?.(".est-pv, .est-refs .est-chip[data-i]")))) return;
  clearTimeout(PV.timer);
  PV.out = setTimeout(pvHide, 160);
}
// over the circle (or under it, when there is no room above), inside the window
function pvPlace(el, chip) {
  const r = chip.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
  el.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2))}px`;
  el.style.top = `${r.top - h - 12 >= 8 ? r.top - h - 12 : Math.min(innerHeight - h - 8, r.bottom + 12)}px`;
}
async function pvShow(i) {
  const r = E.refs[i], chip = chipOf(i);
  if (!r || !chip || !E.root) return;
  pvHide();
  const kind = r.kind || "image", tag = tagOfChip(i), role = roleOf(r), o = refOpt(r);
  const el = document.createElement("div");
  el.className = `est-pv est-pv-${kind}`;
  const wave = Array.from({ length: 30 }, (_, k) => `<i style="height:${Math.round(8 + 22 * Math.abs(Math.sin(k * 1.7)) + 12 * Math.abs(Math.sin(k * 0.6)))}px"></i>`).join("");
  const how = [role ? `Papel: ${role[1]}` : "", kind === "image" && (o || E.item) ? "clique: editar" : "", "botão direito: mais"].filter(Boolean).join(" · ");
  el.innerHTML = `<div class="est-pv-m">${kind === "audio" ? `<div class="est-pv-wave">${wave}</div>` : r.thumb ? `<img src="${esc(r.thumb)}" alt="">` : ""}${kind === "image" ? "" : '<i class="est-pv-bar"></i><span class="est-pv-snd"></span>'}</div>
    <div class="est-pv-i">${tag ? `<b>${esc(tag)}</b>` : ""}${esc(r.label)}<small>${esc(how)}</small></div>`;
  E.root.append(el);
  Object.assign(PV, { el, i });
  chip.classList.add("pv");
  pvPlace(el, chip);
  const m = el.querySelector(".est-pv-m"), bar = el.querySelector(".est-pv-bar"), snd = el.querySelector(".est-pv-snd");
  const info = (d) => { const s = el.querySelector(".est-pv-i small"); if (s && d && isFinite(d)) s.textContent = `${secs(d)} · ${how}`; };
  const url = await mediaUrl(kind === "image" ? r.preview || r.path : r.path);
  if (PV.el !== el || !url) return;
  if (kind === "image") {
    const img = m.querySelector("img") || m.appendChild(document.createElement("img"));
    img.onload = () => pvPlace(el, chip);
    img.src = url;
  } else if (kind === "video") {
    const v = document.createElement("video");
    Object.assign(v, { muted: true, loop: true, playsInline: true, autoplay: true, src: url });
    v.onloadeddata = () => { m.querySelector("img")?.remove(); pvPlace(el, chip); };
    v.onloadedmetadata = () => info(v.duration);
    v.ontimeupdate = () => { if (v.duration) bar.style.width = `${(100 * v.currentTime) / v.duration}%`; };
    m.prepend(v);
    snd.textContent = "mudo · clique: com som";
    el.onclick = () => { v.muted = !v.muted; snd.textContent = v.muted ? "mudo · clique: com som" : "com som · clique: mudo"; };
    v.play().catch(() => {});
  } else {
    const a = new Audio(url);
    PV.audio = a;
    a.onloadedmetadata = () => info(a.duration);
    a.ontimeupdate = () => { if (a.duration) bar.style.width = `${(100 * a.currentTime) / a.duration}%`; };
    a.onended = () => { snd.textContent = "clique: de novo"; };
    snd.textContent = "tocando · clique: parar";
    el.onclick = () => { if (a.paused) { a.play().catch(() => {}); snd.textContent = "tocando · clique: parar"; } else { a.pause(); snd.textContent = "parado · clique: tocar"; } };
    a.play().catch(() => { snd.textContent = "clique: tocar"; });
  }
}
function pvHide() {
  clearTimeout(PV.timer); clearTimeout(PV.out);
  PV.audio?.pause(); PV.audio = null;
  PV.el?.querySelector("video")?.pause();
  PV.el?.remove();
  Object.assign(PV, { el: null, i: -1 });
  E.root?.querySelectorAll(".est-chip.pv").forEach((c) => c.classList.remove("pv"));
}
function onCtx(e) {
  const chip = e.target.closest?.(".est-refs .est-chip[data-i]");
  if (!chip) return;
  e.preventDefault();
  pvHide();
  cmOpen(+chip.dataset.i, e.clientX, e.clientY);
}
// the menu, by what the circle is: an image, a video or a voice. Substituir opens the + to pick what takes its place. A
// file that came from outside the room (the computer, a kit, the material) is edited as an option of this card
// (adoptRef); in a studio with no card it can be used, looked at, swapped and taken out
function cmOpen(i, x, y) {
  cmClose();
  const r = E.refs[i];
  if (!r || !E.root) return;
  const kind = r.kind || "image", o = refOpt(r), f = !o && refFile(r), role = roleOf(r), cur = role?.[0] || "";
  const it = (k, label, { small = "", dis = false, cls = "", v } = {}) =>
    `<button type="button" class="est-cm-it ${cls}" data-k="${k}"${v != null ? ` data-v="${esc(v)}"` : ""}${dis ? " disabled" : ""} role="menuitem">${label}${small ? `<small>${esc(small)}</small>` : ""}</button>`;
  const sub = (label, small, inner) => `<div class="est-cm-it sub" tabindex="0" role="menuitem" aria-haspopup="true">${label}<small>${esc(small)} ▸</small><div class="est-cm-sub" role="menu">${inner}</div></div>`;
  const sep = '<div class="est-cm-sep"></div>', outside = "veio de fora da sala", home = !o && !!E.item;
  const out = [kind === "audio" ? it("cm-play", E.playing === r.path ? "Parar" : "Ouvir") : it("cm-big", "Ver grande"), it("cm-swap", "Substituir", { small: "abre o +" })];
  if (kind === "image") {
    out.push(it("cm-edit", "Editar com IA", { small: o ? "volta pra bolinha" : home ? "vira opção do card, fora do envio" : outside, dis: !o && !home }));
    // the people of the shot as mannequins in the same place and pose (fal's SAM 3D Body), a new card
    const busy = !!o && making3d(o.id), nokey = KEYS.fal === null ? "falta a chave da fal no servidor" : KEYS.fal === false ? "a chave da fal foi recusada" : "";
    out.push(it("cm-p3d", P3D_LABEL, { small: busy ? "a caminho…" : nokey || (o ? "boneco no lugar e na pose · card novo" : home ? "vira opção do card antes" : outside), dis: busy || !!nokey || (!o && !home) }));
    if (o?.model === P3D_LABEL) out.push(it("cm-glb", "Baixar o corpo 3D", { small: "GLB" }));
    const vers = o ? versionsOf(o) : [], vi = vers.findIndex((x) => x.id === o?.id);
    if (vers.length > 1 && vi >= 0) out.push(`<div class="est-cm-row"><span>Versão</span><span class="est-cm-step">${it("cm-ver", "‹", { v: vers[(vi - 1 + vers.length) % vers.length].id, cls: "mini" })}<small>${vi + 1}/${vers.length}</small>${it("cm-ver", "›", { v: vers[(vi + 1) % vers.length].id, cls: "mini" })}</span></div>`);
  }
  if (kind === "video") {
    out.push(o || home ? sub("Editar vídeo", o ? "" : "vira opção do card", VIDEO_MODELS.filter((m) => m.way === "edit" || m.way === "guide").map((m) => it("cm-vedit", m.name, { v: m.id, small: EDIT_SAYS[m.id] || "", cls: "two" })).join(""))
      : it("cm-vedit", "Editar vídeo", { small: outside, dis: true }));
    out.push(it("cm-frame", "Tirar um quadro", { small: "vira imagem" }));
  }
  out.push(sep, sub("Papel", role ? role[1] : "nenhum", [...(ROLES[kind] || []).map(([k, n]) => it("cm-role", `${k === cur ? "✓ " : ""}${esc(n)}`, { v: k, cls: k === cur ? "on" : "" })), it("cm-role", `${cur ? "" : "✓ "}Sem papel`, { v: "", cls: cur ? "" : "on" })].join("")));
  out.push(`<div class="est-cm-row"><span>Mover</span><span class="est-cm-step">${it("cm-left", "←", { dis: i === 0, cls: "mini" })}${it("cm-right", "→", { dis: i === E.refs.length - 1, cls: "mini" })}</span></div>`, sep);
  if (o || f) out.push(it("cm-card", f ? "Abrir nos Materiais" : "Abrir no card", { small: "noutra aba" }));
  out.push(it("cm-rm", "Tirar", { cls: "x" }));
  const el = document.createElement("div");
  el.className = "est-cm";
  el.setAttribute("role", "menu");
  el.setAttribute("aria-label", r.label);
  el.innerHTML = out.join("");
  E.root.append(el);
  const w = el.offsetWidth, h = el.offsetHeight;
  el.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, x))}px`;
  el.style.top = `${Math.max(8, Math.min(innerHeight - h - 8, y - h))}px`;
  if (x + w + 240 > innerWidth) el.classList.add("flip");
  E.cm = { el, i };
  el.querySelector(".est-cm-it:not([disabled])")?.focus({ preventScroll: true });
}
function cmClose() {
  E.cm?.el.remove();
  E.cm = null;
}
async function cmAct(k, v) {
  const i = E.cm?.i ?? -1, r = E.refs[i], { ctx } = E;
  cmClose();
  if (!r) return;
  if (k === "cm-big") return bigOpen(i);
  if (k === "cm-frame") return bigOpen(i, { frame: true });
  if (k === "cm-play") return togglePlay(r.path);
  if (k === "cm-edit") return openRef(i);
  if (k === "cm-vedit") return openVideoRef(i, v);
  if (k === "cm-p3d") return pessoa3d(i);
  if (k === "cm-glb") return downloadGlb(r);
  if (k === "cm-ver") return swapRef(r, v);
  // Substituir: the + opens on the tab where a file like this one lives; what is picked there takes its place (swapIn)
  if (k === "cm-swap") {
    const kind = r.kind || "image", video = isVideo();
    Object.assign(E, { swapAt: r, pick: true, pickBase: false, pmore: 1 });
    if (kind === "audio" && video) E.ptab = "voz";
    else if (kind === "video" && video) E.ptab = "vid";
    else if (refFile(r)) E.ptab = "mat";
    else if (refOpt(r)?.model === BLOCKING) E.ptab = "3d";
    else if (["vid", "voz"].includes(E.ptab)) E.ptab = "ok";
    return syncPicker();
  }
  if (k === "cm-role") {
    if (v) r.role = v; else delete r.role;
    syncChips();
    return ctx.toast(v ? `${r.label}: ${roleOf(r)[1]}. O Melhorar escreve no prompt pra que ela serve.` : `${r.label}: sem papel`);
  }
  if (k === "cm-left" || k === "cm-right") {
    const j = k === "cm-left" ? i - 1 : i + 1;
    if (j < 0 || j >= E.refs.length) return;
    [E.refs[i], E.refs[j]] = [E.refs[j], E.refs[i]];
    return syncChips();
  }
  if (k === "cm-card") {
    const o = refOpt(r), f = !o && refFile(r), it = o && ctx.itemOf(o.item_id);
    const hash = it ? `#/r/${it.round_id}/s/${it.scene}/${it.id}` : f ? `#/materiais/${f.request_id}?f=${f.id}` : "";
    if (hash) window.open(`${location.pathname}${location.search}${hash}`, "_blank", "noopener");
    return;
  }
  if (k === "cm-rm") { E.refs.splice(i, 1); return syncChips(); }
}
// a video of the room opens in the studio with the model picked in the menu (Seedance's edit or a Genjutsu mode), the
// generation waiting behind it; what it makes lands on the video's card and its newest goes back into the circle (swapRef)
async function openVideoRef(i, vm) {
  const { ctx } = E, r = E.refs[i];
  if (r?.kind !== "video") return;
  const o = refOpt(r) || (await adoptRef(r));
  if (!o || !E.root) return;
  const it = ctx.itemOf(o.item_id);
  if (!it || !VIDEO_MODELS.some((m) => m.id === vm)) return;
  const title = E.blocking ? "Render do blocking" : E.mode === "create" ? "Criar" : isVideo() ? "Vídeo com IA" : "Editar com IA";
  const snap = { ...Object.fromEntries(SESSION.map((k) => [k, E[k]])), prompt: promptText() };
  teardown();
  open(ctx, { mode: "create", kind: "video", vmodel: vm, item: it, round: it.round_id, scene: it.scene, base: null, blocking: false,
    refs: [{ path: o.path, preview: o.preview_path || null, thumb_path: o.thumb_path || null, thumb: thumbUrl(o), label: r.label, kind: "video" }], prompt: "", parent: { snap, ref: r, title } });
}
// ---------- Pessoa em 3D (an image circle's menu): fal's SAM 3D Body finds the people of the shot, their bodies and the
// camera, and importBody draws each one over the shot as a mannequin in the Cena 3D's colors, in the same place and pose.
// The picture becomes a new card of the shot's item (based on it, no ✓) with the GLB kept next to it, and comes into the
// generation it was asked from right after the shot, as Espaço e posição. A file from outside the room becomes an option
// of the card first (adoptRef) ----------
const P3D = "fal-ai/sam-3/3d-body", P3D_LABEL = "Pessoa em 3D";
const making3d = (id) => [...JOBS.values()].some((j) => j.model === P3D && j.base_option === id && !DONE.has(j.status));
async function pessoa3d(i) {
  const { ctx } = E, r = E.refs[i];
  if (!r || (r.kind || "image") !== "image") return;
  const o = refOpt(r) || (await adoptRef(r));
  if (!o || !E.root) return;
  if (making3d(o.id)) return ctx.toast(`${r.label}: a pessoa em 3D já está a caminho.`);
  try {
    const { job } = await call("submit", {
      model: P3D, item_id: o.item_id, base_option: o.id, mode: "create", label: P3D_LABEL, prompt: `${P3D_LABEL} de ${r.label}`,
      // the shot as it is; a GLB with the bodies only (no keypoint spheres, no .ply each), the lean metadata (keypoints, camera)
      input: { image_url: o.path, include_3d_keypoints: false, export_meshes: false, include_mhr_params: false },
      refs: [{ label: r.label, path: o.path, thumb: o.thumb_path || null }], created_by: ctx.myName(),
    });
    ADDS.set(job.id, r);
    track(job);
    ctx.toast(`✦ ${r.label}: a fal está montando os corpos. Vira um card novo em ${ctx.itemOf(o.item_id)?.title || "item"} e entra aqui logo depois desta bolinha.`);
  } catch (e) { ctx.toast(`${P3D_LABEL}: ${e.message || e}`, true); }
}
// the new card comes into the generation right after the shot it came from (while that generation is the one open)
async function addAfter(ref, id) {
  const { ctx } = E;
  let o = optOf(id);
  if (!o) { await ctx.refresh(); o = optOf(id); }
  if (!o || !E.root) return;
  const at = E.refs.indexOf(ref);
  if (at < 0 || E.refs.some((x) => x.path === o.path)) return syncChips();
  await ctx.sign([o.thumb_path || o.preview_path || o.path]);
  E.refs.splice(at + 1, 0, { path: o.path, preview: o.preview_path || null, thumb_path: o.thumb_path || null, thumb: thumbUrl(o), label: `${P3D_LABEL} · ${ref.label}`.slice(0, 48), kind: "image", role: "pose" });
  syncChips();
  ctx.toast(`✦ ${P3D_LABEL} entrou logo depois de ${ref.label}, com o papel Espaço e posição`);
}
// Baixar o corpo 3D: the GLB kept with a Pessoa em 3D card (its job's result.glb_path)
async function downloadGlb(r) {
  const { ctx } = E, o = refOpt(r);
  if (!o) return;
  let j = [...JOBS.values()].find((x) => (x.imported || []).includes(o.id));
  if (!j?.result?.glb_path) j = (await ctx.sb.from("estudio_jobs").select("result").contains("imported", JSON.stringify([o.id])).limit(1).maybeSingle()).data;
  const p = j?.result?.glb_path;
  if (!p) return ctx.toast("Não achei o GLB deste card.", true);
  const { data, error } = await ctx.sb.storage.from(ctx.bucket || "media").createSignedUrl(p, 600, { download: `${(o.name || "pessoa3d").replace(/\.[^.]+$/, "")}.glb` });
  if (error || !data?.signedUrl) return ctx.toast("Não consegui abrir o GLB.", true);
  const a = Object.assign(document.createElement("a"), { href: data.signedUrl, rel: "noopener" });
  document.body.append(a);
  a.click();
  a.remove();
}
// Ver grande: the image, the video or the voice in a player over the studio (Esc or a click outside closes it). A video
// can give the frame on screen as a new image reference, right after it
async function bigOpen(i, { frame = false } = {}) {
  bigClose();
  const r = E.refs[i];
  if (!r || !E.root) return;
  const kind = r.kind || "image", tag = tagOfChip(i), url = await mediaUrl(kind === "image" ? r.preview || r.path : r.path);
  if (!url) return E.ctx.toast("Não consegui abrir este arquivo.", true);
  const el = document.createElement("div");
  el.className = "est-big";
  el.innerHTML = `<div class="est-big-in" role="dialog" aria-label="${esc(r.label)}"><div class="est-big-top"><span>${tag ? `<b>${esc(tag)}</b>` : ""}${esc(r.label)}</span><span class="est-big-act">${kind === "video" ? `<button type="button" class="est-alt" data-k="big-frame">Usar este quadro como imagem</button>` : ""}<button type="button" class="link" data-k="big-x">Fechar ✕</button></span></div>
    ${kind === "image" ? `<img src="${esc(url)}" alt="">` : kind === "video" ? `<video controls playsinline crossorigin="anonymous" src="${esc(url)}"></video>` : `<audio controls src="${esc(url)}"></audio>`}
    ${kind === "video" ? `<p class="est-big-hint">${frame ? "Pare no quadro que quer e clique em Usar este quadro: ele entra como imagem logo depois do vídeo." : "Pausado num quadro, Usar este quadro faz dele uma imagem de referência."}</p>` : ""}</div>`;
  E.root.append(el);
  E.big = { el, i };
  const m = el.querySelector("video, audio");
  if (m && !frame) m.play().catch(() => {});
}
function bigClose() {
  E.big?.el.querySelectorAll("video, audio").forEach((m) => m.pause());
  E.big?.el.remove();
  E.big = null;
}
async function bigFrame() {
  const { ctx } = E, b = E.big, v = b?.el.querySelector("video"), r = b && E.refs[b.i];
  if (!v || !r) return;
  if (!v.videoWidth) return ctx.toast("Espere o vídeo carregar.", true);
  v.pause();
  const t = v.currentTime, sec = (Math.round(t * 10) / 10).toLocaleString("pt-BR");
  const c = document.createElement("canvas");
  c.width = v.videoWidth; c.height = v.videoHeight;
  let blob;
  try {
    c.getContext("2d").drawImage(v, 0, 0);
    blob = await new Promise((res, rej) => c.toBlob((x) => (x ? res(x) : rej(new Error("o quadro saiu vazio"))), "image/jpeg", 0.92));
  } catch (err) { return ctx.toast(`Não deu pra tirar o quadro: ${err.message || err}`, true); }
  try {
    const m = await ctx.putFile("estudio/refs", new File([blob], `quadro-${sec.replace(",", "_")}s.jpg`, { type: "image/jpeg" }));
    await ctx.sign([m.thumb_path || m.path]);
    const ref = { path: m.path, preview: m.preview_path || null, thumb_path: m.thumb_path || null, thumb: ctx.urls.get(m.thumb_path || m.path) || "", label: `Quadro ${sec} s · ${r.label}`.slice(0, 48), kind: "image" };
    const at = E.refs.indexOf(r);
    E.refs.splice(at >= 0 ? at + 1 : E.refs.length, 0, ref);
    bigClose();
    syncChips();
    ctx.toast(`O quadro de ${sec} s virou uma imagem de referência, logo depois do vídeo`);
  } catch (err) { ctx.toast(`Não subiu o quadro: ${err.message || err}`, true); }
}
// window, capture phase: the studio's own shortcuts, and keys aimed at the page behind never reach the app. Keys typed
// inside the studio reach their own fields first and stop at the overlay (see open()), so the app never acts on them.
function onKey(e) {
  if (!E.root) return;
  const typing = e.target.matches?.("input, textarea, select") || e.target.isContentEditable;
  const stop = () => { e.preventDefault(); e.stopPropagation(); };
  if (e.key === "Escape" && !e.target.classList?.contains("est-pin-in")) {
    stop();
    if (E.big) bigClose(); else if (E.cm) cmClose(); else if (E.mention) { E.mention = null; $(".est-mention").hidden = true; } else if (E.pick) { E.pick = false; E.pickBase = false; syncPicker(); } else if (E.soulOpen) { E.soulOpen = false; syncSouls(); } else if (E.camOpen) { E.camOpen = false; syncCam(); } else if (E.redit && E.railMode === "rec" && E.drawer) { E.redit = null; syncRail(); } else if (E.sel) { E.sel = null; redraw(); } else if (areaOn() && !E.view) dropArea(); else close();
  }
  else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { stop(); E.mode === "draw" ? saveDrawing() : generate(); }
  else if ((e.key === "z" || e.key === "Z") && (e.metaKey || e.ctrlKey) && !typing) { stop(); undo(); }
  else if ((e.key === "Delete" || e.key === "Backspace") && E.sel && !typing) { stop(); deleteSel(); }
  else if ((e.key === "v" || e.key === "V") && !e.metaKey && !e.ctrlKey && !e.altKey && !typing && E.base && !isVideo()) { stop(); E.tool = "move"; syncTools(); }
  else if ((e.key === "a" || e.key === "A") && !e.metaKey && !e.ctrlKey && !e.altKey && !typing && areaOk() && !E.view) { stop(); pickTool(E.tool === "area" ? "pen" : "area"); }
  // 1…6 give that area the card
  else if (/^[1-6]$/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey && !typing && areaOn() && !E.view && E.areas[+e.key - 1]) { stop(); showArea(+e.key - 1); }
  else if (e.key === "Enter" && e.target.matches?.(".est-chip[data-k], .est-apill[data-k]")) { stop(); e.target.click(); }
  else if (!E.root.contains(e.target)) e.stopPropagation();
}
function frameHtml() {
  // one column just left of the picture, centered on it (it lives in the frame, so it follows the picture): first what
  // changes what is generated (Área; Ajustar, whose controls open beside it while it is on), then the drawing (tools and
  // colors), then undo and clear
  const xb = (k, icon, n) => `<button class="est-tool" data-k="${k}" title="${n}" aria-label="${n.replace(/ \(.*\)$/, "")}">${icon}</button>`;
  return `<div class="est-frame"><div class="est-tools" role="toolbar" aria-label="Ferramentas">
      <button class="est-tool est-tool-area" data-tool="area" title="Só uma área (A): arraste um retângulo. Só ele muda: é gerado ampliado, com mais detalhe, e volta pra imagem inteira. Cada retângulo novo é mais uma área, com o seu texto e as suas referências (até ${MAX_AREAS}). Esc tira a área" aria-label="Editar só uma área">${ICONS.area}</button>
      <span class="est-xfw"><button class="est-tool est-tool-xf" data-tool="xf" title="Ajustar no quadro: arraste a imagem pra mover, a roda do mouse aproxima ou afasta (⌥ gira). O que ficar vazio vai cinza pro modelo preencher" aria-label="Ajustar a imagem no quadro">${ICONS.crop}</button>
      <span class="est-xf">
        ${xb("xf-out", ICONS.minus, "Afastar (⇧ 1%)")}<button class="est-xv" data-k="xf-s1" data-xfv="s" title="Voltar a 100%">100%</button>${xb("xf-in", ICONS.plus, "Aproximar (⇧ 1%)")}
        ${xb("xf-l", ICONS.rotl, "Girar 1° pra esquerda (⇧ 90°)")}<button class="est-xv" data-k="xf-r0" data-xfv="r" title="Voltar a 0°">0°</button>${xb("xf-r", ICONS.rotr, "Girar 1° pra direita (⇧ 90°)")}
        ${xb("xf-fx", ICONS.flipx, "Espelhar na horizontal")}${xb("xf-fy", ICONS.flipy, "Espelhar na vertical")}${xb("xf-reset", ICONS.reset, "Voltar ao quadro original")}${xb("xf-save", ICONS.check, "Salvar como versão nova, sem IA")}
      </span></span>
      <span class="est-sep est-sep-area"></span>
      ${[["move", "Mover (V): arraste uma marca, Delete apaga, duplo clique edita a nota"], ["pen", "Pincel"], ["arrow", "Seta"], ["box", "Caixa"], ["text", "Texto"]].map(([t, n]) => `<button class="est-tool" data-tool="${t}" title="${n}" aria-label="${n.split(":")[0]}">${ICONS[t]}</button>`).join("")}
      <span class="est-sep"></span>
      ${COLORS.map((c) => `<button class="est-color" data-color="${c}" style="--c:${c}" title="Cor" aria-label="Cor"></button>`).join("")}
      <span class="est-sep"></span>
      <button class="est-tool" data-k="undo" title="Desfazer (⌘Z)" aria-label="Desfazer">${ICONS.undo}</button>
      <button class="est-tool" data-k="clear" title="Apagar o desenho" aria-label="Apagar o desenho">${ICONS.clear}</button>
    </div>
    <div class="est-pic"><img class="est-img" alt=""><video class="est-vid" controls loop playsinline hidden></video></div><canvas class="est-canvas"></canvas>
      <div class="est-vnav" hidden><button data-k="vstep" data-v="-1" aria-label="Versão anterior">‹</button><b></b><button data-k="vstep" data-v="1" aria-label="Próxima versão">›</button></div>
      <div class="est-areas" hidden></div>
      <button class="est-nobase" data-k="nobase" title="Tirar a base e criar do zero, com o mesmo texto e as referências" aria-label="Tirar a base" hidden>${ICONS.x}</button></div>
    <div class="est-empty"><b>Criar do zero</b><span></span></div>`;
}
function barHtml() {
  if (E.mode === "draw") {
    return `<div class="est-viewbar"></div>${unfoldHtml()}<div class="est-card">${foldHtml()}
      <textarea class="est-prompt" rows="2" maxlength="1200" placeholder="O que mudar? Desenhe na imagem pra mostrar onde."></textarea>
      <div class="est-ctl"><span class="est-hint">Pincel, seta, caixa ou texto · ⌘Z desfaz · ⌘Enter salva</span><span class="grow"></span>
        ${E.ctx.TEAM ? `<button class="est-alt" data-k="to-edit" title="Usar este desenho pra editar com IA">${ICONS.spark}Editar com IA</button>` : ""}
        <button class="est-go" data-k="save">Salvar desenho</button></div></div>`;
  }
  // one model menu (image models, then video ones: picking a video model is what turns the bar into video), the settings
  // as small pills (the camera's opens its menu) and where the result goes as one toggle, on the left; on the right the last
  // steps: Melhorar, how many, Gerar
  return `<div class="est-viewbar"></div><div class="est-vptext" hidden></div>${unfoldHtml()}<div class="est-card">${foldHtml()}
    <div class="est-refs"></div>
    <div class="est-field">
      <div class="est-prompt est-ed empty" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Prompt"></div>
    </div>
    <div class="est-mention" hidden></div>
    <div class="est-ctl">
      <label class="est-pill est-model" title="Modelo: os de imagem e, embaixo, os de vídeo"><i class="est-ico"></i><select data-k="model"></select></label>
      <label class="est-pill" title="Proporção"><i>${ICONS.aspect}</i><select data-k="aspect"></select></label>
      <label class="est-pill" title="Resolução"><select data-k="res"></select></label>
      <label class="est-pill" title="Qualidade"><select data-k="quality"></select></label>
      <span class="est-pill est-cam"><button class="est-cam-b" data-k="cam" aria-haspopup="dialog" aria-label="Câmera">${ICONS.camera}<span class="est-cam-s"></span></button><button class="est-cam-x" data-k="cam-x" title="Tirar a câmera: o prompt vai como está" aria-label="Tirar a câmera" hidden>${ICONS.x}</button></span>
      <label class="est-pill" title="Duração"><i>${ICONS.clock}</i><select data-k="dur"></select></label>
      <button class="est-pill est-tog" data-k="sound" hidden></button>
      <button class="est-pill est-tog" data-k="dest" hidden></button>
      <span class="grow"></span>
      <button class="est-pill est-kit" data-k="kit-save" hidden title="Guardar no card: as referências na ordem, o prompt, o modelo e a duração. O ✦ do card abre o estúdio assim"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 2.5h8v11l-4-3-4 3z" stroke-linejoin="round"/></svg><span>Guardar no card</span></button>
      <button class="est-pill est-enh" data-k="enhance" aria-label="Melhorar o prompt" hidden>${ICONS.wand}</button>
      <label class="est-pill est-n" title="Quantas gerar de uma vez"><select data-k="count">${[1, 2, 3, 4].map((n) => `<option value="${n}">×${n}</option>`).join("")}</select></label>
      <button class="est-go" data-k="go">${ICONS.spark}<span>Gerar</span></button>
    </div>
    <div class="est-pick" hidden></div>
    <div class="est-pick est-souls" role="dialog" aria-label="Rosto treinado" hidden></div>
    <div class="est-pick est-cam-pop" role="dialog" aria-label="Câmera" hidden></div>
  </div>`;
}
function open(ctx, init) {
  E.ctx = ctx;
  if (E.root) teardown();
  HELD = null;
  Object.assign(E, {
    mode: "edit", item: null, base: null, refs: [], strokes: [], notes: [], hist: [], live: null, view: null, areas: [], ai: -1, adrag: null, xf: { ...XF0 }, xdrag: null,
    ptab: "ok", pscope: "all", pq: "", pmore: 1, soul: E.soul ?? null, soulK: E.soulK ?? 1, soulOpen: false,
    tool: "pen", color: COLORS[0], prompt: "", busy: false, pick: false, shown: new Set(), scene: null, round: null, playing: null, blocking: false, sel: null, drag: null,
    model: E.model || MODELS[0].id, aspect: E.aspect || "auto", res: E.res || "2k", quality: E.quality || "high", count: 1,
    kind: E.kind || "image", vmodel: E.vmodel || VIDEO_MODELS[0].id, vaspect: E.vaspect || "16:9", vres: E.vres || "720p", dur: E.dur || 5, sound: E.sound ?? true,
    drawer: drawerPref(), barOn: barPref(), barBig: bigPref(), dest: init?.blocking ? "card" : "ver", parent: null, recipeKey: "",
    cam: camPref(), camWoven: null, camOpen: false, camMore: false, camHtml: "",
    recipes: [], recWoven: null, railMode: "vers", rq: "", rcat: "all", redit: null, rflash: null, sentOpen: new Set(), vprompt: false,
    draftKey: null, draftBase: null, draftDirty: false, draftHold: false,
  }, init);
  const root = document.createElement("div");
  root.className = rootClass();
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", E.mode === "draw" ? "Desenhar" : "Estúdio");
  root.innerHTML = `<header class="est-top"><div class="est-title"></div>
      <button class="est-hist est-recb" data-k="rail-rec" aria-pressed="false" title="Receitas: arraste uma até o prompt" aria-label="Abrir ou fechar as receitas">${ICONS.book}</button>
      <button class="est-hist" data-k="drawer" aria-pressed="false" title="${E.mode === "draw" ? "Desenhos nesta imagem" : "Versões e resultados"}" aria-label="Abrir ou fechar a coluna de versões">${ICONS.history}</button>
      <button class="link est-close" data-k="close">Fechar ✕</button></header>
    <div class="est-mid"><div class="est-stage">${frameHtml()}</div><aside class="est-rail" data-keep="est-rail"></aside></div>
    <div class="est-bar">${barHtml()}</div>`;
  document.body.append(root);
  // the draft (draftSave) keeps only what a person changed: any input, click, drop or paste in the studio counts
  for (const t of ["input", "change", "click", "drop", "paste"]) root.addEventListener(t, () => { E.draftDirty = true; }, true);
  document.body.classList.add("est-open");
  E.root = root;
  window.addEventListener("keydown", onKey, true);
  root.addEventListener("keydown", (e) => e.stopPropagation());
  root.addEventListener("click", onClick);
  root.addEventListener("change", onChange);
  // a reference's circle: its preview on hover, its menu on the right button
  root.addEventListener("pointerover", onPvOver);
  root.addEventListener("pointerout", onPvOut);
  root.addEventListener("contextmenu", onCtx);
  // a file pasted anywhere else in the studio, or dropped on it, becomes a reference too
  root.addEventListener("paste", (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (!files.length || E.mode === "draw" || e.target.matches?.("input, textarea")) return;
    e.preventDefault();
    addRefFiles(files);
  });
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
  root.addEventListener("dragover", (e) => { if (!hasFiles(e) || E.mode === "draw") return; e.preventDefault(); root.classList.add("dropping"); });
  root.addEventListener("dragleave", (e) => { if (!root.contains(e.relatedTarget)) root.classList.remove("dropping"); });
  root.addEventListener("drop", (e) => {
    root.classList.remove("dropping");
    if (!hasFiles(e) || E.mode === "draw") return;
    e.preventDefault();
    addRefFiles([...e.dataTransfer.files]);
  });
  // a recipe dragged from the drawer goes to the prompt card when dropped anywhere outside the drawer
  const REC_DRAG = "application/x-sala-recipe";
  const hasRec = (e) => [...(e.dataTransfer?.types || [])].includes(REC_DRAG);
  root.addEventListener("dragstart", (e) => {
    const it = e.target.closest?.("[data-rid]");
    if (!it) return;
    e.dataTransfer.setData(REC_DRAG, it.dataset.rid);
    e.dataTransfer.effectAllowed = "copy";
  });
  root.addEventListener("dragover", (e) => { if (!hasRec(e) || e.target.closest?.(".est-rail")) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; root.classList.add("dropping"); });
  root.addEventListener("drop", (e) => {
    if (!hasRec(e)) return;
    root.classList.remove("dropping");
    if (e.target.closest?.(".est-rail")) return;
    e.preventDefault();
    recAdd(e.dataTransfer.getData(REC_DRAG));
  });
  root.addEventListener("dragend", () => root.classList.remove("dropping"));
  // the recipe form saves on Enter or Salvar; a "Prompt enviado" left open stays open while the rail redraws
  root.addEventListener("submit", (e) => { if (!e.target.matches?.(".est-rform")) return; e.preventDefault(); recSave(e.target); });
  root.addEventListener("toggle", (e) => { const d = e.target; if (d.matches?.(".est-sent")) { if (d.open) E.sentOpen.add(d.dataset.id); else E.sentOpen.delete(d.dataset.id); } }, true);
  root.addEventListener("input", (e) => {
    const t = e.target;
    // the picker's search narrows its tab as you type
    if (t.dataset?.k === "pq") { E.pq = t.value; E.pmore = 1; clearTimeout(E.pqWait); E.pqWait = setTimeout(syncPicker, 120); return; }
    // the recipes' search narrows the list under it (the field itself stays, with the caret)
    if (t.dataset?.k === "rq") { E.rq = t.value; clearTimeout(E.rqWait); E.rqWait = setTimeout(() => { const l = $(".est-rlist"); if (l) l.innerHTML = recListHtml(); }, 120); return; }
    // the face's strength (Soul 2), said as it moves
    if (t.dataset?.k === "soul-k") { E.soulK = Number(t.value) / 100; t.parentElement.querySelector("b").textContent = `${t.value}%`; syncChips(); return; }
    if (!t.matches?.(".est-prompt")) return;
    if (!t.isContentEditable) { E.prompt = t.value; fit(t); draftSave(); return; }
    t.classList.toggle("empty", !t.textContent.trim() && !t.querySelector(".est-tok"));
    E.prompt = promptText();
    syncMention();
    draftSave();
  });
  bindEditor();
  // the videos in the rail and the picker play while the pointer is on them
  const hov = (e) => e.target.closest?.(".est-job-img video, .est-pick-th video");
  root.addEventListener("pointerover", (e) => hov(e)?.play().catch(() => {}));
  root.addEventListener("pointerout", (e) => { const v = hov(e); if (v && !v.contains(e.relatedTarget)) v.pause(); });
  bindCanvas();
  const img = $(".est-img");
  img.addEventListener("load", redraw);
  E.ro = new ResizeObserver(redraw);
  E.ro.observe(img);
  listeners.add(syncRail);
  putPrompt(E.prompt);
  syncHead();
  syncAll();
  if (E.mode !== "draw") { loadJobs(); loadKeys(); loadSouls().catch(() => {}); loadRecipes().catch(() => {}); }
  // areas brought back (a reference edited over this generation, then back here) need the base's size again
  if (E.areas.length) loadOrig().catch(() => {});
  // the state it opened with: a draft is kept only while it differs from it (draftSave)
  if (E.draftKey && E.draftBase == null) E.draftBase = draftSig();
  setTimeout(() => $(".est-prompt")?.focus(), 30);
}
// the prompt box's own keys: with the @ list open, Tab and ⇧Tab go through its tabs, ↑ ↓ choose (↓ past the last line brings
// the next page) and Enter puts the reference in; otherwise Enter is a new line (⌘Enter generates, see onKey) and a paste
// comes in as plain text. The list keeps the focus in the text when clicked, and follows the caret (keys, clicks)
function bindEditor() {
  const ed = editor();
  if (!ed) return;
  ed.addEventListener("keydown", (e) => {
    const m = E.mention;
    if (m && e.key === "Tab") { e.preventDefault(); return mentionTab(e.shiftKey ? -1 : 1); }
    if (m?.items.length && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      const n = m.items.length;
      if (e.key === "ArrowDown" && m.i === n - 1 && m.more) { m.page++; m.i = n; return syncMention(); }
      m.i = (m.i + (e.key === "ArrowDown" ? 1 : -1) + n) % n;
      return markMention();
    }
    if (m?.items.length && e.key === "Enter" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); return pickMention(m.i); }
    if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); document.execCommand("insertText", false, "\n"); }
  });
  ed.addEventListener("paste", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const files = [...(e.clipboardData?.files || [])];
    if (files.length && E.mode !== "draw") return addRefFiles(files, { inline: true });
    document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
  });
  ed.addEventListener("keyup", (e) => { if (/^(ArrowLeft|ArrowRight|Home|End)$/.test(e.key) || e.key.startsWith("Arrow") && !E.mention) syncMention(); });
  ed.addEventListener("mouseup", () => setTimeout(syncMention));
  ed.addEventListener("blur", () => { E.mention = null; const box = $(".est-mention"); if (box) box.hidden = true; });
  const mbox = $(".est-mention");
  mbox?.addEventListener("mousedown", (e) => e.preventDefault());
  // the tabs scroll sideways (a mouse wheel too) and fade where more of them hide
  mbox?.addEventListener("scroll", (e) => { if (e.target.matches?.(".est-mtabs")) fadeTabs(e.target); }, true);
  mbox?.addEventListener("wheel", (e) => {
    const tb = e.target.closest?.(".est-mtabs");
    if (!tb || Math.abs(e.deltaY) <= Math.abs(e.deltaX) || tb.scrollWidth <= tb.clientWidth) return;
    e.preventDefault();
    tb.scrollLeft += e.deltaY;
  }, { passive: false });
}
async function loadKeys() {
  try { Object.assign(KEYS, (await call("check")).keys); } catch { /* unknown: Gerar shows the server's answer */ }
  syncBar();
}
const fit = (t) => { t.style.height = "auto"; t.style.height = `${Math.min(220, t.scrollHeight)}px`; };
function syncAll() { syncTitle(); syncStage(); syncTools(); syncChips(); syncBar(); syncRail(); watchStage(); }
// the picture sits above the prompt card (style.css reads its height), and under the toolbar when the toolbar is a row
// over it (narrow screens; on wide ones it is a column at the left). The prompt's lines past the first two may still
// grow over the picture, so it does not jump while typing
function fitStage() {
  if (!E.root) return;
  const tools = $(".est-tools"), card = $(".est-card"), pr = $(".est-prompt");
  const top = tools?.offsetParent && getComputedStyle(tools).flexDirection === "row" ? tools.offsetHeight + 22 : 16;
  const bar = E.barOn === false ? $(".est-unfold")?.offsetHeight || 34 : card ? card.offsetHeight - Math.max(0, (pr?.offsetHeight || 44) - 44) : 0;
  E.root.style.setProperty("--est-toph", `${top}px`);
  E.root.style.setProperty("--est-barh", `${bar + 26}px`);
}
function watchStage() {
  E.fit?.disconnect();
  E.fit = new ResizeObserver(fitStage);
  for (const el of [$(".est-tools"), $(".est-card"), $(".est-unfold")]) if (el) E.fit.observe(el);
  fitStage();
}
function syncTitle() {
  const { ctx } = E;
  const t = $(".est-title");
  // a reference opened from another generation: the way back first, then what is being edited
  if (E.parent) {
    const all = stack(), vi = E.base ? all.findIndex((x) => x.id === E.base.id) : -1;
    t.innerHTML = `<button class="est-up" data-k="up" title="Voltar pra geração, com a versão que estiver nela">${ICONS.back}<span>${esc(E.parent.title)}</span></button><span class="est-mark">${ICONS.spark}</span><b>Editar referência</b><span class="est-ctx">${esc(E.parent.ref.label)}${all.length > 1 && vi >= 0 ? ` · versão ${vi + 1}/${all.length}` : ""}</span>`;
    return;
  }
  if (E.mode === "create") {
    const items = ctx.S.items.filter((i) => i.round_id === E.round && i.scene === E.scene).sort((a, b) => a.sort - b.sort);
    t.innerHTML = `<span class="est-mark">${ICONS.spark}</span><b>Criar</b><span class="est-ctx">${esc(ctx.sceneName(E.scene))} · vai para</span>
      <label class="est-sel"><select data-k="item">${items.map((i) => `<option value="${i.id}" ${i.id === E.item?.id ? "selected" : ""}>${esc(i.title)}</option>`).join("")}</select></label>`;
    return;
  }
  // a blocking render goes to a shot of the animatic or to the location the angle belongs to
  if (E.blocking && E.base) {
    const home = ctx.itemOf(E.base.item_id);
    const shots = ctx.S.items.filter((i) => i.kind === "plano" && i.scene === home?.scene).sort((a, b) => a.sort - b.sort);
    t.innerHTML = `<span class="est-mark">${ICONS.spark}</span><b>Render do blocking</b><span class="est-ctx">${esc(home?.title || "")} · vai para</span>
      <label class="est-sel"><select data-k="item">${[...shots, ...(home ? [home] : [])].map((i) => `<option value="${i.id}" ${i.id === E.item?.id ? "selected" : ""}>${esc(i.kind === "plano" ? i.title : `${i.title} (locação)`)}</option>`).join("")}</select></label>`;
    return;
  }
  const L = E.base ? ctx.letterOf(E.item, E.base) : "";
  const all = stack(), vi = E.base ? all.findIndex((x) => x.id === E.base.id) : -1;
  t.innerHTML = `<span class="est-mark">${E.mode === "draw" ? ICONS.pen : isVideo() ? ICONS.film : ICONS.spark}</span><b>${E.mode === "draw" ? "Desenhar" : isVideo() ? "Vídeo com IA" : E.blocking ? "Render do blocking" : "Editar com IA"}</b><span class="est-ctx">${esc(E.item?.title || "")}${L ? ` · opção ${L}` : ""}${E.base?.version > 1 ? ` · v${E.base.version}` : ""}${all.length > 1 && vi >= 0 ? ` · versão ${vi + 1}/${all.length}` : ""}</span>`;
}
async function syncStage() {
  const img = $(".est-img"), vid = $(".est-vid"), st = $(".est-stage");
  st.classList.toggle("empty", !E.base && !E.view);
  const o = E.view ? optOf(E.view) : E.base;
  const moving = !!o && !isImg(o);
  img.hidden = moving;
  vid.hidden = !moving;
  if (!moving && vid.getAttribute("src")) { vid.pause(); vid.removeAttribute("src"); vid.load(); }
  if (!o) { img.removeAttribute("src"); redraw(); syncView(); return; }
  if (moving) {
    await E.ctx.sign([o.path]);
    const u = E.ctx.urls.get(o.path) || "";
    if (vid.getAttribute("src") !== u) { vid.src = u; vid.play().catch(() => {}); }
    syncView();
    redraw();
    return;
  }
  await E.ctx.sign([o.preview_path || o.path]);
  const u = bigUrl(o);
  if (img.getAttribute("src") !== u) img.src = u;
  syncView();
  redraw();
}
// what is on the stage: a version of the image (‹ 2/3 › on hover, "Tornar atual"), or a result that became its own card
function syncView() {
  const v = $(".est-viewbar"), o = E.view ? optOf(E.view) : null, all = stack();
  syncXf();
  if (!v) return;
  E.root.classList.toggle("viewing", !!o);
  const nav = $(".est-vnav"), shown = shownOpt(), i = shown ? all.findIndex((x) => x.id === shown.id) : -1;
  const nb = $(".est-nobase");
  if (nb) nb.hidden = !(E.mode === "edit" && E.base && !E.parent && !o);
  if (nav) {
    nav.hidden = all.length < 2;
    nav.querySelector("b").textContent = all.length > 1 ? `${i < 0 ? "–" : i + 1}/${all.length}` : "";
  }
  // editing a reference: which of its versions goes back into the generation
  const use = (x) => (!E.parent || !isImg(x) ? "" : x.path === E.parent.ref.path ? `<span class="est-in">${ICONS.check}Na geração</span>` : `<button class="est-alt" data-k="use-ref" data-id="${x.id}">Usar na geração</button>`);
  if (!o) {
    // the base needs no bar, unless it is a reference whose generation now holds another of its versions
    v.innerHTML = E.parent && E.base && E.base.path !== E.parent.ref.path ? `<span>Versão ${i + 1} de ${all.length}${i === 0 ? " · original" : ""}</span>${use(E.base)}` : "";
  } else if (i >= 0) {
    const face = faceIdOf(rootOf(o)) === o.id;
    v.innerHTML = `<span>Versão ${i + 1} de ${all.length}${i === 0 ? " · original" : ""}${face ? " · <b>atual</b>" : ""}</span>
      ${use(o)}${face || E.parent ? "" : '<button class="est-alt" data-k="make-face">Tornar atual</button>'}
      ${isImg(o) ? '<button class="est-alt" data-k="as-base">Editar esta</button>' : ""}${vpBtn(o)}
      <button class="link" data-k="back">Voltar</button>`;
  } else {
    v.innerHTML = `<span>Resultado · ${esc(o.model || "")}</span>${isImg(o) ? '<button class="est-alt" data-k="as-base">Usar como base</button>' : ""}<button class="est-alt" data-k="open-opt" data-id="${o.id}">Abrir na sala</button>${vpBtn(o)}<button class="link" data-k="back">Voltar à ${E.base ? "base" : "criação"}</button>`;
  }
  E.root.classList.toggle("vb", !!v.innerHTML);
  // the prompt of the version on the stage, as it went to the model (with the recipes, the camera, the drawing's notes)
  const pt = $(".est-vptext");
  if (pt) {
    pt.hidden = !(o?.prompt && E.vprompt);
    pt.innerHTML = pt.hidden ? "" : `<p>${esc(o.prompt)}</p><button class="est-alt" data-k="vprompt-copy">Copiar</button>`;
  }
}
const vpBtn = (o) => (o?.prompt ? `<button class="link ${E.vprompt ? "on" : ""}" data-k="vprompt" aria-pressed="${!!E.vprompt}" title="O prompt que foi pro modelo">Prompt</button>` : "");
function pickTool(t) {
  E.tool = t;
  if (t !== "move") E.sel = null;
  if (t === "area") areaStart();
  redraw();
  syncTools();
}
function syncTools() {
  // Área only where an image is being edited with AI (not on a drawing for the client, a blocking render or a video); Ajustar
  // on any image edited with AI, its controls showing while it is the tool
  const ok = areaOk(), xok = xfOk();
  if ((!ok && E.tool === "area") || (!xok && E.tool === "xf")) E.tool = "pen";
  const tb = $(".est-tools");
  if (tb) {
    tb.querySelector(".est-tool-area").hidden = !ok;
    tb.querySelector(".est-tool-xf").hidden = !xok;
    tb.querySelector(".est-sep-area").hidden = !ok && !xok;
    tb.classList.toggle("xf", E.tool === "xf");
  }
  E.root.querySelectorAll("[data-tool]").forEach((b) => b.classList.toggle("on", b.dataset.tool === E.tool));
  const cv = $(".est-canvas");
  if (cv) cv.style.cursor = E.tool === "move" ? "default" : E.tool === "xf" ? "grab" : "";
  fitStage();
  E.root.querySelectorAll("[data-color]").forEach((b) => b.classList.toggle("on", b.dataset.color === E.color));
  const u = $('[data-k="undo"]'), c = $('[data-k="clear"]');
  if (u) u.disabled = !E.hist.length;
  if (c) c.disabled = !hasDrawing();
}
// what goes with the prompt, as a stack of circles: the base first (ringed), the drawing, then the references. Hovering
// spreads the stack and names each one as the prompt calls it: 1, 2… (image 1, image 2) for the image models; @image1,
// @video1, @audio1… for Seedance with references; Início and Fim for Seedance with frames; Imagem 1, Imagem 2… and the
// Vídeo-guia for Genjutsu (one without a name stays out, dimmed). A reference shows its ✕ on its own hover, and a click on a room image edits it over this generation (openRef):
// its new version comes back into the same place
function syncChips() {
  const box = $(".est-refs");
  if (!box) return;
  pvHide(); cmClose();
  const video = isVideo(), frames = video && vmodel().way === "frames", guide = video && vmodel().way === "guide", edit = video && vmodel().way === "edit", soul = soulOn(), n = { image: 0, video: 0, audio: 0 };
  const tag = (kind) => {
    // Soul 2 takes only the base: the drawing and the references stay out
    if (soul) return kind === "image" && E.base && n.image++ === 0 ? "1" : "";
    if (!video) return kind === "image" ? String(++n.image) : "";
    if (frames) return kind === "image" ? ["Início", "Fim"][n.image++] || "" : "";
    if (guide) return kind === "image" ? (n.image < GUIDE_MAX ? `Imagem ${++n.image}` : "") : kind === "video" && !n.video++ ? "Vídeo-guia" : "";
    if (edit && kind === "image" && n.image >= EDIT_MAX) return "";
    return `@${kind}${++n[kind]}`;
  };
  const chip = (thumb, label, kind, { cls = "", attrs = "", rm = false, rmKey = "ref-rm", hint = "" } = {}) => {
    const t = tag(kind);
    const face = thumb ? `<img src="${esc(thumb)}" alt="">` : kind === "audio" ? ICONS.wave : kind === "video" ? ICONS.film : ICONS.pen;
    const tip = `<span class="est-tip"><span>${t ? `<b>${esc(t)}</b>` : ""}${esc(label)}</span>${t ? hint : `<small>${soul ? "não entra no Soul 2" : video ? "fica de fora neste modo" : "só entra no vídeo"}</small>`}</span>`;
    return `<span class="est-chip ${cls} ${t ? "" : "off"}" ${attrs}>${face}${tip}${rm ? `<button class="est-x" data-k="${rmKey}" aria-label="Tirar ${esc(label)}">${ICONS.x}</button>` : ""}</span>`;
  };
  // the drawing is image 2 of an edit; on a blocking render it comes last, so the recipe's numbers stay right
  const draw = () => (E.base && !video && drawingGoes() ? chip("", "Desenho", "image", { cls: "draw" }) : "");
  const L = E.base ? E.ctx.letterOf(E.item, E.base) : "";
  const slot = !E.base && E.mode === "create" && !video ? `<button class="est-chip baseslot" data-k="pick-base" aria-label="Escolher uma base">${ICONS.plus}<span class="est-tip"><span>Base</span><small>escolher da sala, do computador ou colar</small></span></button>` : "";
  // with areas, the card says which one it edits: its text and these circles are that area's (a click goes to the next)
  const na = areaOn() && !video ? E.areas.length : 0;
  const pill = na ? `<span class="est-apill" ${na > 1 ? 'data-k="area-next" role="button" tabindex="0"' : ""} aria-label="Área ${E.ai + 1}${na > 1 ? ` de ${na}` : ""}">${ICONS.area}<b>${E.ai + 1}</b>${na > 1 ? `<small>/${na}</small>` : ""}<span class="est-tip"><span>${na > 1 ? `Área ${E.ai + 1} de ${na}` : "Área"}</span><small>o texto e as bolinhas daqui são desta área${na > 1 ? " · clique: a próxima" : ""}</small></span></span>` : "";
  box.innerHTML = [
    pill,
    slot,
    E.base ? chip(thumbUrl(E.base), `${E.blocking ? "Blocking" : na ? "Área da base" : "Base"}${L ? ` · ${L}` : ""}`, "image", E.blocking
      ? { cls: "base can", attrs: 'data-k="base-3d" role="button" tabindex="0" aria-label="Ajustar este ângulo na Cena 3D"', rm: !E.parent, rmKey: "nobase", hint: "<small>clique: ajustar no 3D · ✕: criar sem o blocking</small>" }
      : { cls: "base", rm: E.mode === "edit" && !E.parent, rmKey: "nobase", hint: na ? `<small>${na > 1 ? "só as áreas marcadas mudam · Esc tira esta área" : "só a área marcada muda · Esc tira a área"}</small>` : E.mode === "edit" && !E.parent ? "<small>o ✕ tira a base e vira Criar</small>" : "" }) : "",
    // Soul 2: the trained face, right next to the base (a click opens the faces and the strength)
    soul ? `<span class="est-chip soul ${E.soul ? "" : "empty"}" data-k="soul" role="button" tabindex="0" aria-label="Escolher o rosto (Soul ID)">${E.soul ? (soulThumb(E.soul) ? `<img src="${esc(soulThumb(E.soul))}" alt="">` : `<i>${esc(E.soul.name.slice(0, 1).toUpperCase())}</i>`) : ICONS.face}<span class="est-tip"><span>${E.soul ? `<b>Rosto</b>${esc(E.soul.name)} · ${Math.round((E.soulK ?? 1) * 100)}%` : "Escolher o rosto"}</span><small>${E.soul ? "clique: trocar o rosto ou a força" : "um Soul ID treinado na Galeria"}</small></span></span>` : "",
    E.blocking ? "" : draw(),
    ...E.refs.map((r, i) => {
      // a file from outside the room is edited too when the studio has a card: it becomes an option of it first
      const mine = E.ctx.S.options.some((o) => o.path === r.path), can = (r.kind || "image") === "image" && (mine || !!E.item);
      return chip(r.thumb, r.label, r.kind || "image", {
        cls: `${can ? "can" : ""} ${r.wait ? "wait" : ""} ${r.role ? "has-role" : ""}`, rm: true,
        attrs: `data-i="${i}"${can ? ` data-k="ref-open" role="button" tabindex="0" aria-label="Editar ${esc(r.label)} com IA"` : ""}`,
        hint: r.wait ? "<small>gerando a versão nova…</small>" : can ? `<small>clique para editar${mine ? "" : " · vira opção do card"}</small>` : edit && r === E.refs.find((x) => x.kind === "video") ? "<small>é o vídeo editado: o resultado fica com o tempo e o quadro dele</small>" : "",
      });
    }),
    E.blocking ? draw() : "",
    `<button class="est-add" data-k="pick" aria-label="Juntar referência">${ICONS.plus}<span class="est-tip"><span>Juntar referência${na > 1 ? ` à área ${E.ai + 1}` : ""}</span><small>${video ? "imagens, vídeos e vozes" : "da sala ou do computador"}</small></span></button>`,
    // the recipes on the card, after its references: a click opens one in the drawer, ✕ takes it off; one that does not go
    // with this request (areas, or a video for a recipe made for images) is dim and says why
    recChips(),
  ].join("");
  // the tag over the area being edited shows the same references; the camera's pill says whether it goes (not with areas)
  syncAreas();
  syncCam();
  draftSave();
}
function syncBar() {
  if (!E.root) return;
  const video = isVideo(), m = video ? vmodel() : model();
  E.root.classList.toggle("est-video", video);
  const sel = (k, list, val, lab = (x) => x) => {
    const s = $(`select[data-k="${k}"]`);
    if (!s) return;
    s.closest(".est-pill").hidden = !list.length;
    s.innerHTML = list.map((x) => `<option value="${x}" ${String(x) === String(val) ? "selected" : ""}>${lab(x)}</option>`).join("");
  };
  const ms = $('select[data-k="model"]');
  if (ms) {
    const alt = !ready(m) && (video ? VIDEO_MODELS : MODELS).find(ready);
    if (alt) { if (video) E.vmodel = alt.id; else E.model = alt.id; return syncBar(); }
    const opt = (x) => `<option value="${x.id}" ${x.id === m.id ? "selected" : ""} ${ready(x) ? "" : "disabled"}>${ready(x) ? x.name : `${x.name} · falta a chave`}</option>`;
    ms.innerHTML = `<optgroup label="Imagem">${MODELS.map(opt).join("")}</optgroup><optgroup label="Vídeo">${VIDEO_MODELS.map(opt).join("")}</optgroup>`;
    ms.closest(".est-pill").querySelector(".est-ico").innerHTML = video ? ICONS.film : ICONS.image;
  }
  // where an edit's result goes: a version of this image (the default) or a card of its own
  const dest = $('[data-k="dest"]');
  if (dest) {
    dest.hidden = video || !E.base || E.mode !== "edit" || !!E.parent;
    dest.innerHTML = E.dest === "ver" ? `${ICONS.layers}<span>Versão</span>` : `${ICONS.card}<span>Card novo</span>`;
    dest.title = E.dest === "ver" ? "O resultado vira uma versão nova desta imagem (o card mostra o relógio 2/2). Clique para mandar como card novo." : "O resultado vira um card novo no item. Clique para mandar como versão desta imagem.";
  }
  if (video) {
    if (m.ar.length && !m.ar.includes(E.vaspect)) E.vaspect = m.ar[0];
    if (!VRES.includes(E.vres)) E.vres = "720p";
    sel("aspect", m.ar, E.vaspect);
    sel("res", VRES, E.vres);
    sel("quality", [], "");
    sel("dur", m.way === "guide" || m.way === "edit" ? [] : DURS, E.dur, (x) => `${x} s`);
  } else {
    // only an area: the crop sets the aspect, and it is enlarged to 2K or 4K
    const area = areaOn() && !!m.sizes, res = area ? m.res.filter((x) => x !== "1k") : m.res;
    // a model with no Auto (Soul 2) starts at the aspect closest to the base's
    if (m.ar.length && !m.ar.includes(E.aspect)) E.aspect = m.ar.includes("auto") ? "auto" : nearAspect(m.ar);
    if (res.length && !res.includes(E.res)) E.res = res.includes("2k") ? "2k" : res.at(-1);
    if (m.q.length && !m.q.includes(E.quality)) E.quality = m.q.includes("high") ? "high" : m.q.at(-1);
    sel("aspect", area ? [] : m.ar, E.aspect, (x) => (x === "auto" ? "Auto" : x));
    sel("res", res, E.res, (x) => (/p$/.test(x) ? x : x.toUpperCase()));
    sel("quality", m.q, E.quality, (x) => Q_LABEL[x] || x);
    sel("dur", [], "");
  }
  const ap = $('select[data-k="aspect"]')?.closest(".est-pill");
  if (ap) ap.title = !video && E.aspect === "auto" ? `Proporção: Auto ${E.base ? "mantém a da imagem base" : "deixa o modelo escolher"}` : "Proporção";
  // Guardar no card: any studio opened for a card (team, with the item_kits table)
  const ks = $('[data-k="kit-save"]');
  if (ks) ks.hidden = !E.item || E.mode === "draw" || !E.ctx.kitsOn;
  const snd = $('[data-k="sound"]');
  if (snd) {
    snd.hidden = !video || m.way === "guide";
    snd.classList.toggle("on", !!E.sound);
    snd.setAttribute("aria-pressed", String(!!E.sound));
    snd.innerHTML = E.sound ? ICONS.sound : ICONS.mute;
    snd.title = E.sound ? "Com som: o Seedance gera as vozes e o ambiente junto. Clique para tirar." : "Sem som. Clique para gerar com som.";
  }
  const pr = $(".est-prompt");
  if (pr && E.mode !== "draw") {
    pr.dataset.placeholder = !video ? (areaOn() ? (E.areas.length > 1 ? `O que muda na área ${E.ai + 1}? Cada área tem o seu texto e as suas referências. Use @ para citar uma referência da barra.` : "O que muda dentro da área? Use @ para citar uma referência da barra, como um rosto.") : soulOn() ? "Descreva a imagem: a base é a cena de partida e o rosto vem do Soul ID escolhido ao lado." : E.base ? "Descreva a mudança. Use @ para citar uma imagem da sala, ou desenhe na imagem para apontar onde." : "Descreva a imagem que quer criar. Use @ para citar castings, locações e outras imagens da sala.")
      : m.way === "frames" ? "Descreva o que acontece entre o primeiro e o último quadro e como a câmera se move."
      : m.way === "guide" ? (m.id.includes("motion") ? "Diga quem e o que está na cena, e de qual imagem: o movimento e a câmera vêm do vídeo-guia." : "Diga o que troca no vídeo-guia e por qual imagem: o resto do vídeo fica igual.")
      : m.way === "edit" ? "Diga o que muda no vídeo e de qual imagem vem cada coisa: o tempo, o quadro e os cortes do vídeo ficam."
      : "Descreva o plano: o que acontece, a câmera e a luz. Use @ para citar as imagens, os vídeos e as vozes da barra (a voz faz a sincronia labial).";
  }
  const em = $(".est-empty span");
  if (em) em.textContent = video ? (m.way === "guide" ? "Junte com + o vídeo-guia (aba Vídeos) e as imagens do que entra nele, e escreva embaixo o que acontece." : m.way === "edit" ? "Junte com + o vídeo a editar (aba Vídeos) e até 5 imagens do que entra nele, e escreva embaixo o que muda." : "Escreva o plano embaixo e junte com + imagens, vídeos e vozes da sala.")
    : E.refs.length ? `Já entraram ${PRODUCT ? "o elenco, a locação e o produto" : "o elenco e a locação"} aprovados desta cena. Escreva o que acontece no plano embaixo; tire ou junte referências à vontade.`
    : "Escreva o que quer embaixo e, se quiser, junte castings, locações e outras imagens da sala com +.";
  const cnt = $('select[data-k="count"]');
  if (cnt) cnt.value = String(E.count);
  const enh = $('[data-k="enhance"]');
  if (enh) {
    enh.hidden = !canWrite();
    enh.disabled = !!(E.writing || E.busy);
    enh.classList.toggle("busy", !!E.writing);
    enh.title = E.writing ? "Melhorando o prompt…" : "Melhorar o prompt: o Claude lê o que você escreveu e as notas do desenho, olha as imagens e reescreve (⌘Z no texto volta)";
  }
  const go = $('[data-k="go"]');
  if (go) {
    go.disabled = !!(E.busy || E.writing);
    // with areas, Gerar wears the area's icon (only they are made again) and says how many go
    const na = areaOn() && !video ? E.areas.length : 0;
    go.querySelector("span").textContent = E.busy ? "Enviando…" : na > 1 ? `Gerar ${na} áreas` : E.count > 1 ? `Gerar ${E.count}` : "Gerar";
    const ico = na ? "area" : "spark";
    if (go.dataset.ico !== ico) { go.dataset.ico = ico; go.querySelector("svg").outerHTML = ICONS[ico]; }
    go.title = na > 1 ? `${na * E.count} gerações: cada área vai sozinha, ampliada, e ${E.count > 1 ? `cada uma das ${E.count} versões volta com as ${na}` : `as ${na} voltam juntas numa versão`} (⌘Enter)` : na ? "Gerar só a área marcada (⌘Enter)" : "";
  }
  const sv = $('[data-k="save"]');
  if (sv) { sv.disabled = E.busy; sv.textContent = E.busy ? "Salvando…" : "Salvar desenho"; }
  syncCam();
  fitStage();
  draftSave();
}
async function loadJobs() {
  if (!E.item) return;
  const { data } = await E.ctx.sb.from("estudio_jobs").select("*").eq("item_id", E.item.id).order("created_at", { ascending: false }).limit(24);
  for (const j of data || []) if (!JOBS.has(j.id)) { JOBS.set(j.id, j); if (!DONE.has(j.status)) track(j); }
  syncRail();
}
const STATUS = { queued: "Na fila", in_progress: "Gerando", completed: "Guardando", importing: "Guardando", imported: "Guardada", failed: "Falhou", nsfw: "Bloqueada pela Higgsfield", canceled: "Cancelada" };
async function syncRail() {
  const rail = E.root?.querySelector(".est-rail");
  if (!rail) return;
  const { ctx } = E;
  if (E.mode === "draw") {
    const list = annotationsOf();
    rail.innerHTML = `<p class="side-label">Desenhos nesta imagem${list.length ? ` · ${list.length}` : ""}</p>
      ${list.length ? `<div class="est-list">${list.map((a) => `<div class="est-ann ${E.shown.has(a.id) ? "on" : ""} ${a.resolved ? "done" : ""}">
        <button class="est-ann-main" data-k="ann" data-id="${a.id}" title="Mostrar ou esconder na imagem"><span class="est-ann-who">${ICONS.eye}<b>${esc(a.side === "cliente" ? `${PROJECT.client || "Cliente"} · ${a.author}` : a.author)}</b><small>${ago(a.created_at)}</small></span>${a.body ? `<span class="est-ann-body">${esc(a.body)}</span>` : ""}${(a.notes || []).length ? `<span class="est-ann-notes">${a.notes.map((n, i) => `${i + 1}. ${esc(n.text)}`).join("<br>")}</span>` : ""}</button>
        <span class="est-ann-acts">${ctx.TEAM ? `<button class="link" data-k="ann-done" data-id="${a.id}">${a.resolved ? "Reabrir" : "Resolvido"}</button>` : ""}${ctx.TEAM || a.side === ctx.SIDE ? `<button class="link danger" data-k="ann-del" data-id="${a.id}">Apagar</button>` : ""}</span>
      </div>`).join("")}</div>` : `<p class="est-note">Ninguém desenhou nesta imagem ainda.</p>`}`;
    return;
  }
  // the recipes (the book icon): drawn again only when something in them changed, and the search keeps its caret
  if (E.railMode === "rec") {
    const html = recipesHtml();
    if (rail.dataset.mode === "rec" && html === E.recHtml) return;
    const typing = document.activeElement?.dataset?.k === "rq" && rail.contains(document.activeElement);
    rail.innerHTML = html;
    E.recHtml = html;
    rail.dataset.mode = "rec";
    if (typing) { const q = rail.querySelector('[data-k="rq"]'); q?.focus(); q?.setSelectionRange(q.value.length, q.value.length); }
    return;
  }
  rail.dataset.mode = "vers";
  E.recHtml = "";
  // the versions of the image on the stage (the original first, the card's current one marked, the edits still running
  // at the end), then every other result of the item
  const all = stack(), faceId = all.length ? faceIdOf(all[0]) : null, shown = shownOpt();
  const jobs = [...JOBS.values()].filter((j) => j.item_id === E.item?.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const inAll = (id) => all.some((m) => m.id === id);
  const ofStack = (j) => inAll(j.base_option) && (j.mode === "version" || j.mode === "ref" || (j.imported || []).some(inAll));
  const pending = jobs.filter((j) => ofStack(j) && j.status !== "imported").reverse();
  // the areas of one Gerar come back as one image: it shows once, on the first of them
  const shownOut = new Set();
  const others = jobs.filter((j) => {
    if (ofStack(j)) return false;
    const outs = j.imported || [];
    if (j.status === "imported" && outs.length && outs.every((id) => shownOut.has(id))) return false;
    outs.forEach((id) => shownOut.add(id));
    return true;
  });
  const imported = others.flatMap((j) => (j.imported || []).map((id) => optOf(id)).filter(Boolean));
  await ctx.sign([...all, ...imported].map((o) => o.thumb_path || o.preview_path || o.path));
  const vers = all.length ? `<p class="side-label">Versões · ${all.length}</p>
    <div class="est-vers">${all.map((m, i) => `<button class="est-ver ${shown?.id === m.id ? "on" : ""}" data-k="vsel" data-id="${m.id}" title="Ver esta versão no palco">
        <img src="${esc(thumbUrl(m))}" alt=""><span><b>${i + 1}${i === 0 ? " · original" : ""}${m.id === faceId ? " <em>atual</em>" : ""}</b><small>${esc([(m.model || "").replace(" · estúdio", ""), m.created_by].filter(Boolean).join(" · "))}</small></span></button>`).join("")}
      ${pending.map((j) => `<div class="est-ver wait ${j.status}">${DONE.has(j.status) ? "" : '<i class="est-spin" aria-hidden="true"></i>'}<span><b>${STATUS[j.status] || j.status}${DONE.has(j.status) ? "" : ` · ${ago(j.created_at)}`}</b><small>${esc(j.error || j.prompt || "")}</small></span></div>`).join("")}
    </div>
    ${all.length === 1 && !pending.length ? `<p class="est-note">${E.parent ? "Cada edit entra aqui como uma versão desta imagem e vai direto pra geração. O card na sala continua como está." : E.dest === "ver" ? "Cada edit entra aqui como uma versão nova desta imagem, e o card mostra a atual (‹ 2/2 › no card)." : "Com Card novo, o resultado entra no item como um card separado."}</p>` : ""}` : "";
  const res = others.length ? `<p class="side-label">${all.length ? "Outros resultados" : "Resultados"} · ${others.length}</p>
    <div class="est-list">${others.map((j) => {
      const outs = (j.imported || []).map(optOf).filter(Boolean);
      const live = !DONE.has(j.status);
      return `<div class="est-job ${j.status}">
        ${outs.length ? outs.map((o) => `<button class="est-job-img ${E.view === o.id ? "on" : ""}" data-k="view" data-id="${o.id}" title="Ver no palco">${tileMedia(o)}</button>`).join("")
          : `<div class="est-job-wait">${live ? '<i class="est-spin" aria-hidden="true"></i>' : ""}<span>${STATUS[j.status] || j.status}${live ? ` · ${ago(j.created_at)}` : ""}</span>${j.error ? `<small>${esc(j.error)}</small>` : ""}</div>`}
        <p class="est-job-meta" title="${esc(j.prompt)}">${esc((j.label || "").replace(" · estúdio", ""))} · ${esc(j.created_by || "")}<br><span>${esc(j.prompt)}</span></p>
        ${sentHtml(j)}
      </div>`;
    }).join("")}</div>`
    : all.length ? "" : `<p class="side-label">Resultados</p><p class="est-note">${E.base ? "O que for gerado aparece aqui e entra no item como opção nova, ligada a esta." : "O que for gerado aparece aqui e entra no item escolhido lá em cima."}</p>`;
  rail.innerHTML = vers + res;
  syncView();
}
// what went to the model, when it is more than the text the director wrote (Claude wrote it with the recipes, the drawing's
// notes, the camera…): folded under the result, and left open while the rail redraws
function sentHtml(j) {
  const sent = (j.input?.prompt || "").trim();
  if (!sent || sent === (j.prompt || "").trim()) return "";
  return `<details class="est-sent" data-id="${j.id}" ${E.sentOpen?.has(j.id) ? "open" : ""}><summary>Prompt enviado${j.input?.recipes?.length ? ` · ${esc(recNames(j.input.recipes))}` : ""}</summary><p>${esc(sent)}</p></details>`;
}
// a thumbnail for an image, a silent looping preview for a video (it plays under the pointer, see open())
const tileMedia = (o) => (isImg(o) ? `<img src="${esc(thumbUrl(o))}" alt="">` : `<video src="${esc(E.ctx.urls.get(o.path) || "")}" muted loop playsinline preload="metadata"></video>`);
// a voice take by its character, without the film's name (PROJECT.name): " Ana - Primeiro Gole 2.m4a" in the item Ana
// reads "Ana 2"
const FILM_WORDS = String(PROJECT.name || "").match(/[\p{L}\p{N}]+/gu);
const FILM_NAME = FILM_WORDS ? new RegExp(`[\\s_-]*${FILM_WORDS.join("[\\s,_-]*")}[!?.]*[\\s_-]*`, "iu") : /(?!)/;
function voiceName(f, it) {
  const n = f.name.replace(/\.[^.]+$/, "").replace(FILM_NAME, " ").trim();
  const t = it?.title || "";
  return !t ? n : n.toLowerCase().startsWith(t.toLowerCase()) ? `${t}${n.slice(t.length)}` : `${t} · ${n}`;
}
// an image as its card shows it now: a version stands for the current one of its history (the headless sheet, not the
// original with the head). A 3D blocking stays itself even when a render became its card.
const cardOf = (o) => (o.model === "Blocking 3D" ? o : optOf(faceIdOf(rootOf(o))) || o);
// the item's Referências tab, images only: the client's refs (deck, WhatsApp…) and the photos the client sent with the item
function refImgs(it) {
  const S = E.ctx.S;
  const wk = (S.wkRefs || []).filter((x) => x.item_id === it.id && x.kind === "image" && x.path)
    .map((x) => ({ id: `ref:${x.id}`, ref: true, item_id: it.id, path: x.path, mime: "image/jpeg", label: x.label || "Referência" }));
  const mats = (it.refs || []).map((id) => S.files.find((f) => f.id === id)).filter((f) => f && (f.mime.startsWith("image/") || f.preview_path))
    .map((f) => ({ id: `file:${f.id}`, ref: true, item_id: it.id, path: f.path, preview_path: f.preview_path, thumb_path: f.thumb_path, mime: f.mime.startsWith("video/") ? "image/jpeg" : f.mime, label: f.name.replace(/\.[^.]+$/, "") }));
  return [...wk, ...mats];
}
// what an image is called in the @ menu, the chips and the prompt: its item, then what sets it apart from the item's
// others; pickables() numbers the names that still repeat (E.names), so the prompt and Claude can tell them apart
function refName(o) {
  if (o.ref) return o.label;
  const { ctx } = E, now = pass(), it = now.itemBy.get(o.item_id) || ctx.itemOf(o.item_id), t = it?.title || "Imagem";
  if (o.model === "Blocking 3D") return `${t} · 3D${o.caption ? ` ${o.caption}` : ""}`;
  // a version its card doesn't show now (the Geradas tab lists them all) says which one it is, as the studio's title does
  const v = verOf(o), vs = v && faceIdOf(rootOf(o)) !== o.id ? ` · versão ${v}` : "";
  if (it && rootOf(o).id === it.chosen_option) return `${t} · ${it.decision === "approved" ? "aprovada" : "escolhida"}${vs}`;
  const L = it ? letterNow(it, o) : "";
  return `${t} · ${now.kept.has(o.id) ? "✓ " : ""}v${o.version || 1}${L ? ` ${L}` : ""}${vs}`;
}
// what naming needs, looked up once while a list is being made (it names hundreds of tiles) and forgotten right after, so
// it is never older than the room: the items by id, the options with a ✓, each item's client letters
let PASS = null;
function pass() {
  if (!PASS) {
    const S = E.ctx.S;
    PASS = { itemBy: new Map(S.items.map((i) => [i.id, i])), kept: new Set((S.reviews || []).filter((r) => r.verdict === "keep").map((r) => r.option_id)), letters: new Map() };
    queueMicrotask(() => { PASS = null; });
  }
  return PASS;
}
function letterNow(it, o) {
  const { ctx } = E, L = pass().letters;
  if (!ctx.lettersOf) return ctx.letterOf(it, o);
  if (!L.has(it.id)) L.set(it.id, ctx.lettersOf(it));
  return L.get(it.id).get(o) || "";
}
// an image's place among its card's versions (the original is 1), 0 for a card with one; counted once per list of options
let VERS = null;
function verOf(o) {
  const all = E.ctx.S.options;
  if (VERS?.all !== all || VERS.n !== all.length) {
    const by = new Map();
    for (const x of all) if (x.stack) { if (!by.has(x.stack)) by.set(x.stack, []); by.get(x.stack).push(x); }
    const at = new Map();
    for (const [root, list] of by) { at.set(root, 1); list.sort((a, b) => a.created_at.localeCompare(b.created_at)).forEach((x, i) => at.set(x.id, i + 2)); }
    VERS = { all, n: all.length, at };
  }
  return VERS.at.get(o.id) || 0;
}
const nameOf = (o) => E.names?.get(o.id) || refName(o);
// the room's files to use as references: this scene's client picks and checked options first, then this item's other
// images and its Referências, then the rest of the round; for a video also the round's videos and the voice takes the
// client sent with the casting (the item's refs). Each image once, as its card shows it now.
function pickables() {
  const { ctx } = E, S = ctx.S;
  const it = E.item, scene = it?.scene ?? E.scene;
  const items = S.items; // every round: a shot of a later round is made from what an earlier one approved
  const { itemBy, verdict } = lookups(S);
  const chosen = (o) => o.id === itemBy.get(o.item_id)?.chosen_option;
  const good = (o) => isImg(o) && (chosen(o) || verdict(o) === "keep");
  const seen = new Set(E.base ? [E.base.id] : []);
  const once = (list) => list.map(cardOf).filter((o) => isImg(o) && !seen.has(o.id) && seen.add(o.id));
  // the client's picks first, then the team's ✓
  const picks = (inScene) => once(S.options.filter((o) => { const i = itemBy.get(o.item_id); return good(o) && !!i && (i.scene === scene) === inScene; }).sort((a, b) => chosen(b) - chosen(a)));
  const groups = [
    ["Desta cena · aprovadas e ✓", picks(true)],
    ["Deste item · geradas", it ? once(S.options.filter((o) => o.item_id === it.id && !good(o) && verdict(o) !== "drop").reverse()).slice(0, 12) : []],
    ["Referências do item", it ? refImgs(it) : []],
    ["Outras cenas · aprovadas e ✓", picks(false)],
  ];
  if (isVideo()) {
    const here = (o) => items.find((i) => i.id === o.item_id)?.scene === scene ? 0 : 1;
    groups.push(["Vídeos", S.options.filter((o) => !isImg(o) && items.some((i) => i.id === o.item_id)).sort((a, b) => here(a) - here(b)).slice(0, 24)]);
    groups.push(["Vozes", items.flatMap((i) => (i.refs || []).map((id) => S.files.find((f) => f.id === id)).filter((f) => f?.mime.startsWith("audio/")).map((f) => ({ f, i })))]);
  }
  // a name that still repeats gets a number in list order: "Cozinha · v2 #3"
  const all = groups.flatMap(([, l]) => l).filter((o) => o.id), n = new Map(), k = new Map();
  all.forEach((o) => { const s = refName(o); n.set(s, (n.get(s) || 0) + 1); });
  E.names = new Map(all.map((o) => { const s = refName(o); if (n.get(s) < 2) return [o.id, s]; k.set(s, (k.get(s) || 0) + 1); return [o.id, `${s} #${k.get(s)}`]; }));
  return groups.filter(([, l]) => l.length);
}
// ---------- the picker (+ in the prompt card, or the base's dashed circle): the room's material in tabs, this scene first
// and then the others (or one scene), narrowed by a word. Aprovadas: the picks and ✓, as their cards show them now;
// Geradas: every image made, newest first (✕ dimmed); Material: what the client sent (the requests' files, the references of
// their returns); 3D: the blocking angles; a video also gets the videos and the voice takes ----------
const PTABS = [["ok", "Aprovadas"], ["gen", "Geradas"], ["mat", "Material"], ["3d", "3D"], ["vid", "Vídeos"], ["voz", "Vozes"]];
const PAGE = 60;
// what the picker and the @ list share: the tabs (the videos and voices only for a video), what a tile is called, and
// whether a word finds it (in its name, its group or its scenes' names; kept on the tile, which the @ list keeps while open)
const pickTabs = (video) => PTABS.filter(([k]) => (k === "vid" || k === "voz" ? video : true));
const pickLabel = (x) => (x.v ? voiceName(x.v.f, x.v.i) : x.o.ref ? x.o.label : nameOf(x.o));
const pickFind = (x, q) => !q || (x.hay ??= fold(`${pickLabel(x)} ${x.group} ${x.scenes.map((n) => E.ctx.sceneName(n)).join(" ")}`)).includes(q);
// a file the client sent as a tile: an image, or a video (its still, outside a video)
function fileTile(f, video) {
  const vid = f.mime.startsWith("video/");
  if (vid && !video && !f.preview_path) return null;
  return { id: `file:${f.id}`, ref: true, item_id: null, path: vid && !video ? f.preview_path : f.path, preview_path: f.preview_path || null, thumb_path: f.thumb_path || null, mime: vid && !video ? "image/jpeg" : f.mime, label: f.name.replace(/\.[^.]+$/, ""), name: f.name };
}
// what a tile stands for: an option of the room, a file the client sent (file:id) or a reference of one of their returns (ref:id)
function pickOf(id) {
  const S = E.ctx.S;
  if (id.startsWith("file:")) { const f = S.files.find((x) => `file:${x.id}` === id); return f ? fileTile(f, isVideo() && !E.pickBase) : null; }
  if (id.startsWith("ref:")) { const x = (S.wkRefs || []).find((r) => `ref:${r.id}` === id); return x?.path ? { id, ref: true, item_id: x.item_id, path: x.path, mime: "image/jpeg", label: x.label || "Referência", name: x.label || "Referência" } : null; }
  return optOf(id);
}
// what a picker tile (or a voice's wave) stands for, and the reference it makes in the circles
const pickedOf = (k, b) => (k === "ref-add" ? pickOf(b.dataset.id) || (E.item ? refImgs(E.item) : []).find((r) => r.id === b.dataset.id) : E.ctx.S.files.find((f) => f.id === b.dataset.id));
const pickedRef = (k, o, b) => (k === "ref-voice" ? { path: o.path, thumb: "", label: voiceName(o, E.ctx.itemOf(b.dataset.item)), kind: "audio" }
  : { path: o.path, preview: o.preview_path || null, thumb_path: o.thumb_path || null, thumb: isImg(o) ? thumbUrl(o) : "", label: nameOf(o), kind: isImg(o) ? "image" : "video" });
// the room's items and ✓/✕ by id, made fresh for each list (a list sorts and names hundreds of tiles); the first review of
// an option is its verdict, as a find() gives it
function lookups(S) {
  const itemBy = new Map(S.items.map((i) => [i.id, i])), rev = new Map();
  for (const r of S.reviews || []) if (!rev.has(r.option_id)) rev.set(r.option_id, r.verdict);
  return { itemBy, verdict: (o) => rev.get(o.id) };
}
// a tab's tiles, each file once: the same file in several places (S.twins, file_twins: a scene package's copy of a card's
// image, the device in every scene's materials) shows where it comes first in the tab, this scene's before the others;
// keep (the search) goes first, so a word that finds only a later copy still finds the file
function pickList(tab, here, keep = null) {
  const tw = E.ctx.S.twins, seen = new Set();
  const key = (x) => (x.v ? `f:${x.v.f.id}` : x.o?.id?.startsWith?.("file:") ? `f:${x.o.id.slice(5)}` : x.o && !x.o.ref ? `o:${x.o.id}` : null);
  return pickList0(tab, here).filter((x) => !keep || keep(x)).filter((x) => { const k = key(x), g = k && (tw?.get(k)?.[0] || k); if (!g) return true; if (seen.has(g)) return false; seen.add(g); return true; });
}
// a tab's tiles, in order, each {o (or v: a voice), scenes, group, drop}. A file belongs to the scenes whose items use it
function pickList0(tab, here) {
  const { ctx } = E, S = ctx.S, video = isVideo() && !E.pickBase;
  const { itemBy, verdict } = lookups(S);
  const sceneOf = (id) => itemBy.get(id)?.scene;
  const usedIn = (f) => S.items.filter((i) => (i.refs || []).includes(f.id)).map((i) => i.scene);
  const chosen = (o) => o.id === itemBy.get(o.item_id)?.chosen_option;
  const newest = (a, b) => b.created_at.localeCompare(a.created_at);
  // this scene first, then the others in order
  const rank = (n) => (n === here ? -1 : n ?? 999);
  const sceneGroup = (n) => (n == null ? "" : n === here ? "Desta cena" : `${String(n).padStart(2, "0")} ${ctx.sceneName(n)}`);
  const opt = (o, group = "") => ({ o, scenes: [sceneOf(o.item_id)], group, drop: verdict(o) === "drop" });
  if (tab === "ok") {
    const seen = new Set();
    return S.options.filter((o) => isImg(o) && o.model !== BLOCKING && (chosen(o) || verdict(o) === "keep"))
      .sort((a, b) => rank(sceneOf(a.item_id)) - rank(sceneOf(b.item_id)) || chosen(b) - chosen(a)).map(cardOf)
      .filter((o) => !seen.has(o.id) && seen.add(o.id)).map((o) => ({ ...opt(o, sceneGroup(sceneOf(o.item_id))), drop: false }));
  }
  if (tab === "gen") return S.options.filter((o) => isImg(o) && o.model !== BLOCKING).sort((a, b) => rank(sceneOf(a.item_id)) - rank(sceneOf(b.item_id)) || newest(a, b)).map((o) => opt(o, sceneGroup(sceneOf(o.item_id))));
  if (tab === "3d") return S.options.filter((o) => o.model === BLOCKING).sort((a, b) => rank(sceneOf(a.item_id)) - rank(sceneOf(b.item_id)) || newest(a, b)).map((o) => opt(o, sceneGroup(sceneOf(o.item_id))));
  // a file of the Materiais belongs to the scenes whose items use it, and to the scene of the team's own package it is in
  // (a scene's materials, requests.team_only): those come first, this scene's before the others, then the client's
  const reqBy = new Map(S.requests.map((r, i) => [r.id, { r, i }]));
  const pkgOf = (f) => reqBy.get(f.request_id)?.r;
  const fileScenes = (f) => { const n = pkgOf(f)?.team_only ? pkgOf(f).scene : null; return n == null ? usedIn(f) : [n, ...usedIn(f)]; };
  const fileGroup = (f) => { const r = pkgOf(f); return !r ? "Material" : r.team_only ? `Material de cena · ${r.title}` : r.title; };
  const fileRank = (f) => { const x = reqBy.get(f.request_id); return !x ? 9999 : x.r.team_only ? (x.r.scene === here ? -1 : x.r.scene ?? 998) : 1000 + x.i; };
  const byPkg = (a, b) => fileRank(a) - fileRank(b) || a.created_at.localeCompare(b.created_at);
  if (tab === "vid") return [...S.options.filter((o) => !isImg(o)).sort(newest).map((o) => opt(o)), ...S.files.filter((f) => f.mime.startsWith("video/")).sort(byPkg).map((f) => ({ o: fileTile(f, true), scenes: fileScenes(f), group: "", drop: false }))];
  // Vozes: a scene's own voices (its materials) first, then the takes the client sent with the casting (the items' refs)
  if (tab === "voz") return [...S.files.filter((f) => f.mime.startsWith("audio/") && pkgOf(f)?.team_only).sort(byPkg).map((f) => ({ v: { f, i: null }, scenes: fileScenes(f), group: fileGroup(f), drop: false })),
    ...S.items.flatMap((i) => (i.refs || []).map((id) => S.files.find((f) => f.id === id)).filter((f) => f?.mime.startsWith("audio/")).map((f) => ({ v: { f, i }, scenes: [i.scene], group: "", drop: false })))];
  // Material: each request's files in its order (the scenes' own first), then the references of the returns, item by item
  const files = S.files.filter((f) => /^(image|video)\//.test(f.mime)).sort(byPkg)
    .map((f) => ({ o: fileTile(f, video), scenes: fileScenes(f), group: fileGroup(f), drop: false }));
  const refs = (S.wkRefs || []).filter((x) => x.kind === "image" && x.path).sort((a, b) => rank(sceneOf(a.item_id)) - rank(sceneOf(b.item_id)))
    .map((x) => ({ o: pickOf(`ref:${x.id}`), scenes: [sceneOf(x.item_id)], group: `Retorno · ${ctx.itemOf(x.item_id)?.title || ""}`, drop: false }));
  return [...files, ...refs].filter((x) => x.o);
}
async function syncPicker() {
  const p = $(".est-pick");
  if (!p) return;
  p.hidden = !E.pick;
  // closed, the picker forgets a Substituir it was open for
  if (!E.pick) { E.swapAt = null; return; }
  const { ctx } = E, S = ctx.S, video = isVideo() && !E.pickBase;
  const tabs = pickTabs(video);
  if (!tabs.some(([k]) => k === E.ptab)) E.ptab = "ok";
  pickables(); // the names (E.names) the chips, the @ list and the prompt give the room's images
  const here = E.item?.scene ?? E.scene ?? null;
  const scope = E.pscope === "all" || here == null && E.pscope === "here" ? null : E.pscope === "here" ? here : Number(E.pscope);
  const q = fold(E.pq || "").trim();
  const label = pickLabel;
  const keep = (x) => (scope == null || x.scenes.includes(scope)) && pickFind(x, q);
  const counts = Object.fromEntries(tabs.map(([k]) => [k, k === E.ptab ? 0 : pickList(k, here, keep).length]));
  const all = pickList(E.ptab, here, keep), shown = all.slice(0, PAGE * (E.pmore || 1));
  counts[E.ptab] = all.length;
  await ctx.sign(shown.flatMap((x) => (x.v ? [] : [isImg(x.o) ? x.o.thumb_path || x.o.preview_path || x.o.path : x.o.path])));
  if (!E.pick || !E.root) return;
  const on = (path) => E.refs.some((r) => r.path === path);
  const tile = (x) => `<button class="est-pick-th ${on(x.o.path) ? "on" : ""} ${x.drop ? "drop" : ""}" data-k="ref-add" data-id="${esc(x.o.id)}" title="${esc(label(x))}${x.o.caption ? ` · ${esc(x.o.caption)}` : ""}${x.drop ? " · descartada (✕)" : ""}">${tileMedia(x.o)}<span>${esc(label(x))}</span></button>`;
  const voice = ({ f, i }) => `<div class="est-pick-th est-pick-aud ${on(f.path) ? "on" : ""}"><button class="est-wave" data-k="ref-voice" data-id="${f.id}" data-item="${i?.id || ""}" title="Usar a voz ${esc(voiceName(f, i))}">${ICONS.wave}</button>
    <span><button class="est-play" data-k="play" data-path="${esc(f.path)}" aria-label="Ouvir ${esc(voiceName(f, i))}">${E.playing === f.path ? "■" : "▶"}</button>${esc(voiceName(f, i))}</span></div>`;
  const groups = [];
  for (const x of shown) { const g = groups.at(-1); if (g && g[0] === x.group) g[1].push(x); else groups.push([x.group, [x]]); }
  const scenes = [...new Set(S.items.map((i) => i.scene))].filter((n) => n != null).sort((a, b) => a - b);
  const empty = q ? `Nada com “${esc(E.pq.trim())}”${scope != null ? " nesta cena" : ""}.` : { ok: "Nada aprovado ou com ✓", gen: "Nenhuma imagem gerada", mat: `Nenhum material ${DA_CL}`, "3d": "Nenhum ângulo 3D", vid: "Nenhum vídeo", voz: "Nenhuma voz" }[E.ptab] + (scope != null ? " nesta cena." : " ainda.");
  // redrawn on every pick and every letter typed: the scroll and the search box stay as they were
  const top = p.querySelector(".est-pick-body")?.scrollTop || 0, sx = document.activeElement?.dataset?.k === "pq" ? document.activeElement : null;
  const caret = sx ? [sx.selectionStart, sx.selectionEnd] : null;
  p.innerHTML = `<div class="est-pick-head">${E.pickBase ? "<b>Base</b>" : E.swapAt ? `<b>Substituir</b><span class="est-pswap" title="${esc(E.swapAt.label)}">${esc(E.swapAt.label)}</span>` : ""}
      <div class="est-ptabs" role="tablist" aria-label="Material da sala">${tabs.map(([k, n]) => `<button class="${k === E.ptab ? "on" : ""}" data-k="ptab" data-v="${k}" role="tab" aria-selected="${k === E.ptab}">${n}<small>${counts[k]}</small></button>`).join("")}</div>
      <label class="est-pill" title="De qual cena"><select data-k="pscope">${here != null ? `<option value="here" ${E.pscope === "here" ? "selected" : ""}>Esta cena</option>` : ""}<option value="all" ${scope == null ? "selected" : ""}>Todas as cenas</option>${scenes.map((n) => `<option value="${n}" ${E.pscope === String(n) ? "selected" : ""}>${String(n).padStart(2, "0")} ${esc(ctx.sceneName(n))}</option>`).join("")}</select></label>
      <label class="est-psearch" title="Buscar pelo nome">${ICONS.search}<input type="search" data-k="pq" placeholder="Buscar" value="${esc(E.pq || "")}" aria-label="Buscar pelo nome"></label>
      <span class="grow"></span>
      <label class="est-pbtn" title="Juntar do computador">${ICONS.plus}<input type="file" accept="${video ? "image/*,video/*,audio/*" : "image/*"}" multiple hidden data-k="upload"></label>
      <button class="est-pbtn" data-k="pick" title="Fechar (Esc)" aria-label="Fechar">${ICONS.x}</button></div>
    <div class="est-pick-body">${groups.map(([g, list]) => `${g ? `<p class="side-label">${esc(g)}</p>` : ""}<div class="est-pick-grid">${list.map((x) => (x.v ? voice(x.v) : tile(x))).join("")}</div>`).join("")}
      ${all.length > shown.length ? `<button class="est-alt est-pmore" data-k="pmore">Mostrar mais · ${all.length - shown.length}</button>` : ""}
      ${all.length ? "" : `<p class="est-note">${empty}${scope != null ? ' <button class="link" data-k="pscope-all">Ver em todas as cenas</button>' : ""}</p>`}</div>`;
  p.querySelector(".est-pick-body").scrollTop = top;
  if (caret) { const i = p.querySelector('[data-k="pq"]'); i.focus(); i.setSelectionRange(...caret); }
}
async function onClick(e) {
  // the faces and the camera's menu close on any click outside them (their own circle or pill toggles them)
  if (E.soulOpen && !e.target.closest('.est-souls, [data-k="soul"]')) { E.soulOpen = false; syncSouls(); }
  if (E.camOpen && !e.target.closest(".est-cam-pop, .est-cam")) { E.camOpen = false; syncCam(); }
  if (E.cm && !e.target.closest(".est-cm")) cmClose();
  if (E.big && e.target === E.big.el) return bigClose();
  const b = e.target.closest("[data-k], [data-tool], [data-color]");
  if (!b) { if (E.pick && !e.target.closest(".est-pick")) { E.pick = false; E.pickBase = false; syncPicker(); } return; }
  const { ctx } = E, k = b.dataset.k;
  if (k?.startsWith("cm-")) return cmAct(k, b.dataset.v);
  if (k === "big-x") return bigClose();
  if (k === "big-frame") return bigFrame();
  if (b.dataset.tool) return pickTool(b.dataset.tool);
  // an area's tag: a click gives it the card, + opens the references for it, ✕ takes it away; the card's pill goes to the next
  const ai = b.closest(".est-area")?.dataset.i;
  if (k === "area-x") return dropArea(ai != null ? +ai : E.ai);
  if (k === "area-sel") return showArea(+ai);
  if (k === "area-ref") { showArea(+ai); E.pick = true; E.pickBase = false; E.swapAt = null; return syncPicker(); }
  if (k === "area-next") return showArea((E.ai + 1) % E.areas.length);
  if (k?.startsWith("xf-")) return xfAct(k, e.shiftKey);
  if (b.dataset.color) {
    // with a mark picked, the color goes to that mark
    E.color = b.dataset.color;
    const it = selItem();
    if (it && it.c !== E.color) { E.hist.push({ m: E.sel.k, i: E.sel.i, prev: structuredClone(it) }); it.c = E.color; redraw(); }
    return syncTools();
  }
  if (k === "close") return close();
  if (k === "undo") return undo();
  if (k === "clear") { if (hasDrawing() && confirm("Apagar o desenho?")) { E.strokes = []; E.notes = []; E.hist = []; E.sel = null; redraw(); syncChips(); syncTools(); } return; }
  if (k === "go") return generate();
  if (k === "mention") return pickMention(Number(b.dataset.i));
  // the @ list's tabs (a chip, or Ver todas under Tudo) and the next page of a long tab, its first new line chosen
  if (k === "mention-tab") { const m = E.mention; if (m) { m.tab = b.dataset.v; m.page = 1; m.i = 0; } return syncMention(); }
  if (k === "mention-more") { const m = E.mention; if (m) { m.page++; m.i = m.items.length; } return syncMention(); }
  if (k === "enhance") return enhance();
  if (k === "kit-save") return saveKit();
  if (k === "save") return saveDrawing();
  if (k === "sound") { E.sound = !E.sound; return syncBar(); }
  if (k === "pick") { E.pick = !E.pick; E.pickBase = false; return syncPicker(); }
  if (k === "pick-base") { E.pick = true; E.pickBase = true; E.swapAt = null; return syncPicker(); }
  // Soul 2's face: open the trained faces (fresh from the table), pick one
  if (k === "soul") { E.soulOpen = !E.soulOpen; if (E.soulOpen) { E.pick = false; syncPicker(); loadSouls(); } return syncSouls(); }
  if (k === "soul-pick") { E.soul = (E.souls || []).find((s) => s.id === b.dataset.id) || null; syncChips(); return syncSouls(); }
  // the camera: its pill opens the menu (Mais comes open when something in it is set) and the pill's ✕ or Limpar take it
  // away; a chip picks or drops its value; Novo ângulo forces the new angle either way; an image's own camera comes back
  if (k === "cam") {
    E.camOpen = !E.camOpen;
    if (E.camOpen) { E.pick = false; E.pickBase = false; E.soulOpen = false; syncPicker(); syncSouls(); E.camMore ||= CAM_MORE.some((x) => E.cam[x] != null); }
    return syncCam();
  }
  if (k === "cam-x" || k === "cam-clear") { E.cam = {}; camSave(); return syncCam(); }
  if (k === "cam-chip") return camSet(b.dataset.f, b.dataset.v, true);
  if (k === "cam-novo") { E.cam = { ...E.cam, novo: !camNow().novo }; return syncCam(); }
  if (k === "cam-more") { E.camMore = !E.camMore; return syncCam(); }
  if (k === "cam-use") {
    const oc = CAM_OF.get(shownOpt()?.id);
    if (!oc) return;
    const { novo, ...c } = oc;
    E.cam = c; camSave(); syncCam();
    return ctx.toast(`Câmera desta imagem: ${camPT(c).join(" · ")}`);
  }
  // the picker's tabs, the next page of a long tab, every scene when this one has nothing
  if (k === "ptab") { E.ptab = b.dataset.v; E.pmore = 1; return syncPicker(); }
  if (k === "pmore") { E.pmore = (E.pmore || 1) + 1; return syncPicker(); }
  if (k === "pscope-all") { E.pscope = "all"; E.pmore = 1; return syncPicker(); }
  if (k === "ref-add" && E.pickBase) {
    const o = pickOf(b.dataset.id);
    E.pick = false; E.pickBase = false; syncPicker();
    if (!o || !isImg(o)) return;
    // a file the client sent can be a base too, as a file from the computer is
    return setBase(o.ref ? { id: null, item_id: E.item?.id ?? null, path: o.path, preview_path: o.preview_path || null, thumb_path: o.thumb_path || null, mime: o.mime, name: o.name } : o);
  }
  if (k === "ref-open") return openRef(+b.dataset.i);
  if (k === "base-3d") return openSource();
  if (k === "nobase") return dropBase();
  if (k === "up") return goBack();
  if (k === "use-ref") { if (E.parent && optOf(b.dataset.id)) await swapRef(E.parent.ref, b.dataset.id); return; }
  if (k === "ref-rm") { E.refs.splice(+b.closest("[data-i]").dataset.i, 1); return syncChips(); }
  // Substituir (a circle's menu): the tile picked takes that reference's place, and the picker closes
  if ((k === "ref-add" || k === "ref-voice") && E.swapAt) {
    const old = E.swapAt, o = pickedOf(k, b);
    E.pick = false; syncPicker();
    if (o) swapIn(old, pickedRef(k, o, b));
    return;
  }
  if (k === "ref-add" || k === "ref-voice") {
    const o = pickedOf(k, b);
    if (!o) return;
    const i = E.refs.findIndex((r) => r.path === o.path);
    if (i >= 0) E.refs.splice(i, 1);
    else E.refs.push(pickedRef(k, o, b));
    syncChips(); return syncPicker();
  }
  if (k === "play") return togglePlay(b.dataset.path);
  if (k === "view") { E.view = E.view === b.dataset.id ? null : b.dataset.id; syncStage(); return syncRail(); }
  if (k === "back") { E.view = null; syncStage(); return syncRail(); }
  // Versões: pick one in the drawer, step with ‹ › on the stage, make the one on the stage the card's current version
  if (k === "vsel") { E.view = b.dataset.id === E.base?.id ? null : b.dataset.id; syncStage(); return syncRail(); }
  if (k === "vstep") {
    const all = stack();
    if (all.length < 2) return;
    const i = Math.max(0, all.findIndex((x) => x.id === shownOpt()?.id));
    const next = all[(i + Number(b.dataset.v) + all.length) % all.length];
    E.view = next.id === E.base.id ? null : next.id;
    syncStage(); return syncRail();
  }
  if (k === "make-face") {
    const o = shownOpt(), root = rootOf(o);
    if (!o || !root) return;
    const { error } = await ctx.sb.from("options").update({ face: o.id === root.id ? null : o.id }).eq("id", root.id);
    if (error) return ctx.toast(error.message, true);
    await ctx.refresh();
    ctx.toast("Agora o card mostra esta versão");
    return syncRail();
  }
  if (k === "dest") { E.dest = E.dest === "ver" ? "card" : "ver"; syncBar(); return syncRail(); }
  if (k === "grow") {
    E.barBig = !E.barBig;
    try { localStorage.setItem("sala-est-big", E.barBig ? "on" : "off"); } catch { /* the page still works */ }
    E.root.classList.toggle("bar-big", E.barBig);
    Object.assign(b, { title: growSays() });
    b.setAttribute("aria-label", growSays());
    b.setAttribute("aria-pressed", String(E.barBig));
    return fitStage();
  }
  if (k === "fold") {
    E.barOn = !E.barOn;
    try { localStorage.setItem("sala-est-bar", E.barOn ? "on" : "off"); } catch { /* the page still works */ }
    E.root.classList.toggle("bar-off", !E.barOn);
    if (E.barOn) $(".est-prompt")?.focus();
    return fitStage();
  }
  // the drawer on the right holds the versions (history icon) or the recipes (book icon): the lit icon closes it, the other
  // one switches it
  if (k === "drawer" || k === "rail-rec") {
    const mode = k === "drawer" ? "vers" : "rec";
    E.drawer = !(E.drawer && E.railMode === mode);
    E.railMode = mode;
    try { localStorage.setItem("sala-est-drawer", E.drawer ? "on" : "off"); } catch { /* the page still works */ }
    syncHead();
    if (mode === "rec" && E.drawer) loadRecipes().catch(() => {});
    syncRail();
    return redraw();
  }
  // Receitas: a click puts a recipe on the prompt card (or takes it off), its chip opens it in the drawer, ✕ takes it off;
  // the categories filter the drawer; ✎ and Nova open the form, whose segments pick what the base and the drawing are
  if (k === "rec-add") return recAdd(b.dataset.id, true);
  if (k === "rec-rm") return recRm(b.dataset.id);
  if (k === "rec-open") {
    Object.assign(E, { drawer: true, railMode: "rec", rcat: "all", rq: "", redit: null, rflash: b.dataset.id });
    syncHead(); syncRail(); redraw();
    $(`.est-rec[data-rid="${b.dataset.id}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    clearTimeout(E.rflashWait);
    E.rflashWait = setTimeout(() => { E.rflash = null; $(".est-rec.flash")?.classList.remove("flash"); }, 1600);
    return;
  }
  if (k === "rec-cat") { E.rcat = b.dataset.v; return syncRail(); }
  if (k === "rec-new") { E.redit = {}; return syncRail(); }
  if (k === "rec-edit") { E.redit = { ...(RECIPES || []).find((r) => r.id === b.dataset.id) }; return syncRail(); }
  if (k === "rec-cancel") { E.redit = null; return syncRail(); }
  if (k === "rec-archive") return recArchive();
  if (k === "rec-seg") { b.parentElement.querySelectorAll("button").forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-checked", String(x === b)); }); return; }
  // the version on the stage: its prompt (what went to the model) under the bar, and copying it
  if (k === "vprompt") { E.vprompt = !E.vprompt; return syncView(); }
  if (k === "vprompt-copy") {
    const o = shownOpt();
    try { await navigator.clipboard.writeText(o?.prompt || ""); ctx.toast("Prompt copiado"); } catch { window.prompt("Copie o prompt:", o?.prompt || ""); }
    return;
  }
  if (k === "as-base") {
    const o = optOf(E.view);
    if (!o) return;
    // the areas were on the other image: they go, and the card keeps the text of the one it had
    Object.assign(E, { base: o, view: null, strokes: [], notes: [], hist: [], areas: [], ai: -1, xf: { ...XF0 }, mode: "edit", item: ctx.itemOf(o.item_id), blocking: false });
    E.root.className = rootClass();
    $(".est-stage").innerHTML = frameHtml();
    $(".est-bar").innerHTML = barHtml();
    bindCanvas();
    bindEditor();
    const img = $(".est-img");
    img.addEventListener("load", redraw);
    E.ro.disconnect(); E.ro.observe(img);
    putPrompt(E.prompt);
    syncAll();
    return;
  }
  if (k === "open-opt") { const id = b.dataset.id; teardown(); return ctx.openOption(id); }
  if (k === "to-edit") {
    Object.assign(E, { mode: "edit" });
    E.root.className = rootClass();
    $(".est-bar").innerHTML = barHtml();
    bindEditor();
    putPrompt(E.prompt);
    syncAll(); loadJobs();
    return;
  }
  if (k === "ann") { const id = b.dataset.id; E.shown.has(id) ? E.shown.delete(id) : E.shown.add(id); redraw(); return syncRail(); }
  if (k === "ann-done") {
    const a = (ctx.S.annotations || []).find((x) => x.id === b.dataset.id);
    await ctx.sb.from("annotations").update({ resolved: !a.resolved }).eq("id", a.id);
    await ctx.refresh(); return syncRail();
  }
  if (k === "ann-del") {
    if (!confirm("Apagar este desenho?")) return;
    const { error } = await ctx.sb.from("annotations").delete().eq("id", b.dataset.id);
    if (error) return ctx.toast(error.message, true);
    E.shown.delete(b.dataset.id);
    await ctx.refresh(); redraw(); return syncRail();
  }
}
async function onChange(e) {
  const t = e.target, k = t.dataset.k;
  // the model menu holds both kinds: a video model turns the bar (chips, settings, title) into video, an image model back
  if (k === "model") {
    const was = model();
    if (VIDEO_MODELS.some((x) => x.id === t.value)) { E.kind = "video"; E.vmodel = t.value; } else { E.kind = "image"; E.model = t.value; }
    // back from a model with no Auto (Soul 2), the aspect is Auto again
    if (!was.ar.includes("auto") && model().ar.includes("auto")) E.aspect = "auto";
    syncTitle(); syncChips(); syncBar(); redraw(); syncPicker(); syncSouls();
    return;
  }
  if (k === "count") { E.count = Number(t.value) || 1; return syncBar(); }
  if (k === "cam-set") return camSet(t.dataset.f, t.value);
  if (k === "pscope") { E.pscope = t.value; E.pmore = 1; return syncPicker(); }
  if (k === "aspect") { if (isVideo()) E.vaspect = t.value; else E.aspect = t.value; }
  // 2K or 4K changes the area's crop and how much it is enlarged
  if (k === "res") { if (isVideo()) E.vres = t.value; else { E.res = t.value; redraw(); } }
  if (k === "quality") E.quality = t.value;
  if (k === "dur") E.dur = +t.value;
  if (k === "item") { E.item = E.ctx.itemOf(t.value); syncRail(); loadJobs(); }
  if (k === "upload") {
    const files = [...t.files];
    t.value = "";
    if (E.pickBase) {
      E.pickBase = false; E.pick = false; syncPicker();
      const f = files.find((x) => x.type.startsWith("image/"));
      if (!f) return E.ctx.toast("A base é uma imagem.", true);
      try {
        const m = await E.ctx.putFile("estudio/refs", f);
        return setBase({ id: null, item_id: E.item?.id ?? null, path: m.path, preview_path: m.preview_path || null, thumb_path: m.thumb_path || null, mime: m.mime, name: m.name });
      } catch (err) { return E.ctx.toast(`${f.name}: ${err.message || "falhou"}`, true); }
    }
    // Substituir: a file from the computer takes the circle's place
    if (E.swapAt) {
      const old = E.swapAt, f = files.find((x) => refFileOk(x, isVideo()));
      E.pick = false; syncPicker();
      if (!f) return E.ctx.toast(isVideo() ? "Entram imagens, vídeos e vozes." : "Entram imagens (vídeo e voz só no modo vídeo).", true);
      try { return swapIn(old, await fileRef(f)); } catch (err) { return E.ctx.toast(`${f.name || "Arquivo"}: ${err.message || "falhou"}`, true); }
    }
    await addRefFiles(files);
  }
}
// files from the computer become references: the picker's Do computador, a paste (⌘V) anywhere in the studio, or a drop
// on it. A pasted image has no name of its own, so it is "Colada 1", "Colada 2"…; a paste in the text also puts it there
// inline, where the caret was
const refFileOk = (f, video) => f.type.startsWith("image/") || (video && /^(video|audio)\//.test(f.type));
// a file from the computer, stored, as a reference: by its own name, or "Colada N" for a pasted image that has none
async function fileRef(f) {
  const kind = f.type.startsWith("audio/") ? "audio" : f.type.startsWith("video/") ? "video" : "image";
  const m = await E.ctx.putFile("estudio/refs", f);
  if (kind === "image") await E.ctx.sign([m.thumb_path || m.path]);
  const named = f.name && !/^(image|imagem|screenshot|captura)[\s._-]*\d*\.\w+$/i.test(f.name);
  const label = named ? f.name.replace(/\.[^.]+$/, "").slice(0, 40) : `Colada ${E.refs.filter((r) => /^Colada \d+$/.test(r.label)).length + 1}`;
  return { path: m.path, preview: m.preview_path || null, thumb_path: m.thumb_path || null, thumb: kind === "image" ? E.ctx.urls.get(m.thumb_path || m.path) || "" : "", label, kind };
}
async function addRefFiles(files, { inline = false } = {}) {
  const video = isVideo();
  const ok = files.filter((f) => refFileOk(f, video));
  if (!ok.length) return E.ctx.toast(video ? "Entram imagens, vídeos e vozes." : "Entram imagens (vídeo e voz só no modo vídeo).", true);
  const at = inline ? saveCaret() : null;
  for (const f of ok) {
    try {
      const ref = await fileRef(f);
      E.refs.push(ref);
      if (at && E.root) putTokenAt(at, ref);
    } catch (err) { E.ctx.toast(`${f.name || "Imagem"}: ${err.message || "falhou"}`, true); }
  }
  syncChips();
  E.ctx.toast(ok.length > 1 ? `${ok.length} referências novas` : "Referência nova: está nas bolinhas e no texto");
}
// where the caret was in the text, kept while a pasted file uploads
function saveCaret() {
  const ed = editor(), sel = getSelection();
  return ed && sel.rangeCount && ed.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null;
}
function putTokenAt(range, ref) {
  const ed = editor();
  if (!ed || !ed.contains(range.startContainer)) return;
  const tmp = document.createElement("span");
  tmp.innerHTML = tokHTML(ref);
  const tok = tmp.firstChild, space = document.createTextNode(" ");
  range.deleteContents();
  range.insertNode(space);
  range.insertNode(tok);
  ed.classList.remove("empty");
  E.prompt = promptText();
}
// a base picked for a generation that had none (the dashed circle): an image of the room, or a file from the computer; a
// blocking angle opens its recipe for this card. The text and the references stay
async function setBase(o) {
  const { ctx } = E, itemId = E.item?.id;
  if (o.id && o.model === BLOCKING) { teardown(); return openStudio(ctx, { optionId: o.id, itemId }); }
  const snap = { ...Object.fromEntries(SESSION.map((k) => [k, E[k]])), prompt: promptText() };
  await ctx.sign([o.preview_path || o.path, o.thumb_path || o.preview_path || o.path]).catch(() => {});
  teardown();
  // the result lands in this card: as a version of its own image, else as a card of its own
  open(ctx, { ...snap, refs: snap.refs.filter((r) => r.path !== o.path), mode: "edit", base: o, view: null, strokes: [], notes: [], hist: [], areas: [], ai: -1, xf: { ...XF0 }, blocking: false, recipeKey: "", dest: o.id && o.item_id === itemId ? "ver" : "card" });
  ctx.toast("Base escolhida: o texto e as referências ficaram");
}
// the base can go: the studio turns into Criar on the same card, with the text and the references as they were (the
// scene's kit when there were none); a blocking render becomes Criar with the kit. Not on a reference being edited
async function dropBase() {
  if (E.mode !== "edit" || !E.base || E.parent) return;
  const { ctx } = E, item = E.item, scene = item?.scene ?? ctx.itemOf(E.base.item_id)?.scene;
  // a blocking render's text speaks of its frame: without it, it starts over as Criar with the kit and the shot's text
  if (E.blocking) { teardown(); await openCreate(ctx, { roundId: item?.round_id, scene, itemId: item?.id }); return ctx.toast("Sem o blocking: agora é Criar com o kit"); }
  const prompt = promptText(), old = E.base;
  let refs = E.refs;
  if (!refs.length) {
    const kit = kitOf(ctx.S, scene), all = [...kit.cast, ...kit.place, ...(kit.device ? [kit.device] : [])];
    await ctx.sign(all.map((o) => o.thumb_path || o.preview_path || o.path)).catch(() => {});
    refs = all.map((o) => ({ path: o.path, preview: o.preview_path || null, thumb: thumbUrl(o), label: refName(o), kind: "image" }));
  }
  // the image that was the base stays as the first reference; its ✕ takes it away for good
  if (old?.path && !refs.some((r) => r.path === old.path)) {
    await ctx.sign([old.thumb_path || old.preview_path || old.path]).catch(() => {});
    refs = [{ path: old.path, preview: old.preview_path || null, thumb: thumbUrl(old), label: old.id ? refName(old) : old.name || "Base anterior", kind: "image" }, ...refs];
  }
  const keep = { model: E.model, res: E.res, quality: E.quality, count: E.count };
  teardown();
  open(ctx, { mode: "create", round: item?.round_id, scene, item, refs, prompt, aspect: "16:9", ...keep });
  ctx.toast("Sem base: agora é Criar. A imagem ficou como referência");
}

// ---------- blocking render (Cena 3D) ----------
// An angle saved in Cena 3D (model "Blocking 3D", with a blocking_shots row) opens with its recipe: the approved location,
// the cast and the product it records (blocking_shots.device) go in as references, and the prompt keeps the blocking's
// camera, framing, scale and poses while everything seen comes from those references, never from the grey shapes.
const BLOCKING = "Blocking 3D";
// the film's look (config.js ESTUDIO.look), with the same neutral default the edge function uses
const filmLook = () => String(ESTUDIO?.look || "").replace(/\s+/g, " ").trim().replace(/[.\s]+$/, "") || "photoreal film still, natural light, true-to-life color, real textures and skin";
const sideOf = (b) => { if (!b) return ""; const x = (b.x0 + b.x1) / 2; return x < 0.38 ? " on the left" : x > 0.62 ? " on the right" : " in the middle"; };
// the mannequins' colors in Cena 3D (cena3d/sets.js COLORS, grey for extras), named so the prompt can point at each one
const MANNEQUIN = { "#F07A2E": "orange", "#3E8DF0": "blue", "#E4C531": "yellow", "#B06BE6": "purple", "#2FC5A0": "teal", "#9AA19C": "grey" };
// Cena 3D's prompt box (Renderizar) adds ask, the director's note in Portuguese, which wins over the blocking where they
// differ, and loose (Solto): the blocking guides the composition instead of being a frame to match
async function blockingRecipe(ctx, o, to = null, { ask = "", loose = false } = {}) {
  const { data: shot } = await ctx.sb.from("blocking_shots").select("*").eq("option_id", o.id).maybeSingle();
  if (!shot) return null;
  // each image as its card shows it now (a headless sheet in place of the original with the head)
  const find = (id) => { const x = id ? ctx.S.options.find((y) => y.id === id && isImg(y)) : null; return x ? cardOf(x) : null; };
  const loc = find(shot.location_option), dev = shot.device ? find(shot.device.option_id) : null;
  const cast = (shot.cast || []).map((c) => ({ ...c, opt: find(c.option_id) }));
  await ctx.sign([loc, dev, ...cast.map((c) => c.opt)].filter(Boolean).map((x) => x.thumb_path || x.preview_path || x.path));
  const refs = [];
  const add = (x, label) => { refs.push({ path: x.path, preview: x.preview_path || null, thumb: thumbUrl(x), label, kind: "image" }); return refs.length + 1; };
  const lines = [];
  if (loc) lines.push(`- the place, its architecture, materials, furniture, plants, colors and daylight come from image ${add(loc, ctx.itemOf(loc.item_id)?.title || "Locação")}, the approved location;`);
  for (const c of cast) {
    const col = MANNEQUIN[String(c.color || "").toUpperCase()];
    const who = `the ${col ? `${col} ` : ""}figure${sideOf(c.box)} is ${c.name}`;
    lines.push(c.opt ? `- ${who}: exactly the ${c.kind === "human" || !c.kind ? "person" : "animal"} in image ${add(c.opt, c.name)}, with the same face, age, hair, skin tone, body and clothes;` : `- ${who};`);
  }
  if (shot.device) {
    const where = sideOf(shot.device.box);
    lines.push(dev ? `- the product placeholder${where} is exactly the product in image ${add(dev, PRODUCT?.title || "Produto")}, with the same shape, proportions, materials, colors and details;` : `- the product placeholder${where} is the product: keep its place, size and orientation;`);
  }
  const lens = shot.camera?.lens_mm ? ` (${Math.round(shot.camera.lens_mm)}mm)` : "";
  // the planned shot the angle came from (Cena 3D keeps it even after the camera was nudged): what it tells goes in
  // the prompt, and its item in the animatic (kind plano, variants.shot) is where the render lands; Cena 3D's
  // Renderizar names that card itself (to)
  const cam = shot.camera || {}, from = cam.from_preset || cam.preset, title = cam.from_title || cam.preset_title;
  const shotItem = to?.kind === "plano" ? to : from ? ctx.S.items.find((i) => i.kind === "plano" && i.variants?.shot === from) : null;
  const tells = shotItem?.brief || title;
  const prompt = `Image 1 is a 3D blocking frame of a shot from a film: simple low-poly placeholders that ${loose ? "sketch" : "set"} the camera, the framing, the scale and the poses. Turn it into the real photographic frame of that shot.${tells ? `

What this shot tells (written in Portuguese): "${shotItem ? `${shotItem.title}: ` : ""}${tells}". Play that moment: the action, the gesture and the feeling, as image 1 frames it.` : ""}${ask ? `

The director's note for this frame (written in Portuguese), which wins over image 1 wherever they differ: "${ask}". Make that change.` : ""}

${loose ? `Use image 1 as a guide for the composition, not as a frame to match: keep roughly its camera angle and lens${lens}, who is where in the frame and how big; the poses, the gestures, where they look and the exact framing may change so the moment reads true and natural.` : `Keep exactly from image 1${ask ? ", except what the note changes" : ""}: the camera position, height, angle and lens${lens}, the framing and composition, and where each person and object is in the frame, how big they are, their pose, their gesture and where they look.`}

Take everything you see from the references instead of from the placeholders:
${lines.join("\n").replace(/;$/, ".")}

The grey mannequins, plain boxes and flat colors of image 1 are only placeholders: in the result every person, piece of furniture and object is real, with real materials and textures, and none of the blocking's shapes, colors or labels remain. Photoreal film still from a cinema camera${loc ? ", with the light of image 2" : ""}, 16:9. The film's look: ${filmLook()}.`;
  return { refs, prompt, shotItem };
}

// ---------- entry points ----------
// team: edit an option with AI (the drawing on it points out where); a Cena 3D angle comes with its blocking recipe
export async function openStudio(ctx, { optionId, itemId = null }) {
  const o = ctx.S.options.find((x) => x.id === optionId);
  if (!o || !isImg(o)) return ctx.toast("O estúdio edita imagens.", true);
  E.ctx = ctx;
  const recipe = o.model === BLOCKING ? await blockingRecipe(ctx, o).catch((e) => { console.error(e); return null; }) : null;
  const init = { mode: "edit", base: o, item: (itemId && ctx.itemOf(itemId)) || recipe?.shotItem || ctx.itemOf(o.item_id), ...(recipe && { blocking: true, kind: "image", model: MODELS[0].id, aspect: "16:9", refs: recipe.refs, prompt: recipe.prompt }) };
  // a blocking render follows its recipe; any other edit comes back as it was left (the draft)
  if (!recipe) return openDrafted(ctx, init, `edit:${o.id}`);
  open(ctx, init);
  E.recipeKey = recipeKey();
}
// team, from Cena 3D's Renderizar (its 3D opened from a shot's card): the angle just saved goes through the blocking
// recipe with no studio in between, sent as Gerar sends it (Nano Banana 2.1, 2K, 16:9). Its result lands on that card
// as a variation of its own (mode edit: no stack, like Card novo), and the card shows it running meanwhile (making).
// ask / loose: what the 3D's prompt box said, and Fiel / Solto (see blockingRecipe)
export async function renderBlocking(ctx, { optionId, itemId, ask = "", loose = false }) {
  E.ctx = ctx;
  const o = ctx.S.options.find((x) => x.id === optionId), item = ctx.itemOf(itemId);
  if (!o || !item) throw new Error("o ângulo ou o card não está mais na sala");
  const recipe = await blockingRecipe(ctx, o, item, { ask, loose });
  if (!recipe) throw new Error("o ângulo não tem o blocking salvo");
  const m = MODELS[0], res = "2k", files = [o.path, ...recipe.refs.map((r) => r.path)];
  if (files.length > m.max) throw new Error(`o ${m.name} aceita até ${m.max} imagens`);
  const { job } = await call("submit", {
    item_id: item.id, base_option: o.id, mode: "edit", model: m.id, label: `${m.label} · ${res.toUpperCase()} · estúdio`, prompt: recipe.prompt,
    input: { prompt: recipe.prompt, image_urls: files, resolution: res, aspect_ratio: "16:9" },
    refs: [{ path: o.path, label: "Base" }, ...recipe.refs.map((r) => ({ path: r.path, label: r.label }))], created_by: ctx.myName(),
  });
  track(job);
  return job;
}
// what a scene is made of, for a new frame of it: its approved people and place from any round (the client's pick, or
// else the team's ✓, as its card shows it now: the headless sheet), and the product's approved image: the item titled
// PRODUCT.title in config.js, of any kind (none when PRODUCT is null). The key stays `device`, as app.js reads it
function kitOf(S, scene) {
  const kept = (o) => (S.reviews || []).some((r) => r.option_id === o.id && r.verdict === "keep");
  const pick = (it) => {
    const o = (it.chosen_option && S.options.find((x) => x.id === it.chosen_option && isImg(x))) || S.options.find((x) => x.item_id === it.id && isImg(x) && kept(x));
    return o ? cardOf(o) : null;
  };
  // an item a later round repeats (same title) counts once, as that round has it
  const order = new Map(S.rounds.map((r, i) => [r.id, i]));
  const latest = (list) => [...new Map(list.sort((a, b) => order.get(a.round_id) - order.get(b.round_id) || a.sort - b.sort).map((it) => [it.title, it])).values()];
  const of = (kind) => latest(S.items.filter((it) => it.scene === scene && it.kind === kind)).map(pick).filter(Boolean);
  const product = String(PRODUCT?.title || "").trim().toLowerCase();
  const dev = product ? S.items.find((it) => (it.title || "").trim().toLowerCase() === product) : null;
  return { cast: of("casting"), place: of("locacao"), device: dev ? pick(dev) : null };
}
// the room shows the same kit on an empty slot and over a scene of a later round
export function sceneKit(ctx, scene) {
  E.ctx ||= ctx;
  return kitOf(ctx.S, scene);
}
// team: create from scratch in a scene; the result goes to the item picked at the top. It starts from the scene's kit,
// as references and named in a first line of prompt, so a frame of the shot only needs what happens in it
export async function openCreate(ctx, { roundId, scene, itemId }) {
  E.ctx = ctx;
  const items = ctx.S.items.filter((i) => i.round_id === roundId && i.scene === scene).sort((a, b) => a.sort - b.sort);
  const kit = kitOf(ctx.S, scene), all = [...kit.cast, ...kit.place, ...(kit.device ? [kit.device] : [])];
  await ctx.sign(all.map((o) => o.thumb_path || o.preview_path || o.path)).catch(() => {});
  const refs = all.map((o) => ({ path: o.path, preview: o.preview_path || null, thumb: thumbUrl(o), label: refName(o), kind: "image" }));
  const at = (o) => `@${refName(o)}`, look = ctx.sceneLook?.(scene), name = ctx.sceneName(scene);
  const subject = [kit.cast.map(at).join(" e "), kit.place.map(at).join(" e ")].filter(Boolean).join(" em ");
  const product = !kit.device ? "" : subject ? `, com o produto ${at(kit.device)} em cena` : `O produto ${at(kit.device)} em cena`;
  // a shot of the animatic (kind plano) leads with what happens in it, from its card
  const item = (itemId && ctx.itemOf(itemId)) || items[0] || null, shot = item?.kind === "plano" ? item : null;
  const cast = subject || product ? `${subject}${product}.` : "";
  const prompt = !all.length && !shot ? "" : [shot ? `${shot.title}, cena ${name}: ${shot.brief}` : cast ? `Plano do filme, cena ${name}:` : "", cast, look ? `Luz: ${look}.` : ""].filter(Boolean).join("\n").replace(/:\n(?=@)/, ": ");
  return openDrafted(ctx, { mode: "create", round: roundId, scene, item, refs, prompt, aspect: "16:9", ...(item?.kind === "video" && { kind: "video", vmodel: VIDEO_MODELS[0].id, vaspect: "16:9" }) },
    itemId ? `card:${itemId}` : `create:${roundId}:${scene}`);
}
// team, a video's ✦ on its card: the models that edit a video (Seedance's edit, the Genjutsu modes), as the circles'
// Editar vídeo lists them; picking one opens the studio with that video as its master, the result landing on its card
export const videoEditModels = () => VIDEO_MODELS.filter((m) => (m.way === "edit" || m.way === "guide") && ready(m)).map((m) => ({ id: m.id, name: m.name, says: EDIT_SAYS[m.id] || "" }));
export async function openVideoEdit(ctx, { optionId, vm }) {
  E.ctx = ctx;
  const o = ctx.S.options.find((x) => x.id === optionId), it = o && ctx.itemOf(o.item_id);
  if (!o || !it || !o.mime?.startsWith("video/") || !VIDEO_MODELS.some((m) => m.id === vm)) return;
  await ctx.sign([o.thumb_path || o.preview_path || o.path]).catch(() => {});
  return openDrafted(ctx, { mode: "create", kind: "video", vmodel: vm, item: it, round: it.round_id, scene: it.scene, base: null, blocking: false, prompt: "",
    refs: [{ path: o.path, preview: o.preview_path || null, thumb_path: o.thumb_path || null, thumb: thumbUrl(o), label: refName(o), kind: "video" }] }, `vedit:${o.id}:${vm}`);
}
// team: a card's kit (item_kits: what Guardar no card saved) opens the studio already like that, its result landing on
// the card. The references come back in their order, so @image1, @video1, @audio1… still name the same ones; a card
// without a kit opens as Criar com IA does
export async function openKit(ctx, { itemId }) {
  E.ctx = ctx;
  const it = ctx.itemOf(itemId), row = ctx.kitOf?.(itemId), k = row?.kit;
  if (!it) return;
  if (!k) return openCreate(ctx, { roundId: it.round_id, scene: it.scene, itemId });
  const list = Array.isArray(k.refs) ? k.refs : [];
  await ctx.sign(list.map((r) => r.thumb_path).filter(Boolean)).catch(() => {});
  const refs = list.map((r) => ({ path: r.path, preview: r.preview || null, thumb_path: r.thumb_path || null, thumb: r.thumb_path ? ctx.urls.get(r.thumb_path) || "" : "", label: r.label || "Referência", kind: r.kind || "image", ...(r.role && { role: r.role }) }));
  const video = k.kind !== "image";
  const known = (list2, id) => (list2.some((m) => m.id === id) ? id : list2[0].id);
  return openDrafted(ctx, {
    mode: "create", round: it.round_id, scene: it.scene, item: it, refs, prompt: k.prompt || "", kind: video ? "video" : "image",
    ...(video ? { vmodel: known(VIDEO_MODELS, k.model), vaspect: k.vaspect || "16:9", vres: k.vres || "720p", dur: DURS.includes(k.dur) ? k.dur : 5, sound: k.sound ?? true }
      : { model: known(MODELS, k.model), aspect: k.aspect || "16:9", res: k.res || "2k" }),
  }, `card:${it.id}`, Date.parse(row.updated_at || "") || 0);
}
// Guardar no card: the studio as it is (the base, if any, first; then the references in their order, the prompt as
// written with @Nome, the model, the duration, the resolution) becomes the card's kit
async function saveKit() {
  const { ctx } = E, it = E.item;
  if (!it || !ctx.saveKit) return;
  const video = isVideo();
  const base = E.base ? [{ path: E.base.path, preview: E.base.preview_path || null, thumb_path: E.base.thumb_path || E.base.preview_path || E.base.path, label: "Base", kind: "image" }] : [];
  const refs = [...base, ...E.refs.filter((r) => !r.wait).map((r) => ({ path: r.path, preview: r.preview || null, thumb_path: r.thumb_path || refThumb(r.path, r.kind || "image"), label: r.label, kind: r.kind || "image", ...(r.role && { role: r.role }) }))];
  const kit = { kind: video ? "video" : "image", model: video ? E.vmodel : E.model, dur: E.dur, vres: E.vres, vaspect: E.vaspect, sound: !!E.sound, aspect: E.aspect, res: E.res, refs, prompt: promptText() };
  // the button itself says it: Guardando… while it goes, ✓ Guardado for a few seconds (a toast can hide behind another)
  const btn = $('[data-k="kit-save"]'), say = (t, cls) => { const s = btn?.querySelector("span"); if (s) s.textContent = t; btn?.classList.toggle("done", cls === "done"); if (btn) btn.disabled = cls === "busy"; };
  clearTimeout(E.kitTimer);
  say("Guardando…", "busy");
  try {
    await ctx.saveKit(it.id, kit);
    // the kit now holds what the draft kept
    if (E.draftKey === `card:${it.id}`) { draftDrop(E.draftKey); E.draftBase = draftSig(); E.draftDirty = false; }
    say("✓ Guardado no card", "done");
    E.kitTimer = setTimeout(() => say("Guardar no card", ""), 3500);
    ctx.toast(`Kit guardado em ${it.title}: o ✦ do card abre assim`);
  } catch (err) {
    console.error(err); say("Guardar no card", "");
    ctx.toast(`Não guardou o kit: ${err.message || err}`, true);
  }
}
// both rooms: draw on an option and say what to change
export function openDraw(ctx, { optionId }) {
  const o = ctx.S.options.find((x) => x.id === optionId);
  if (!o || !isImg(o)) return ctx.toast("Dá pra desenhar só em imagem.", true);
  const mine = (ctx.S.annotations || []).filter((a) => a.option_id === o.id);
  open(ctx, { mode: "draw", base: o, item: ctx.itemOf(o.item_id), shown: new Set(mine.filter((a) => !a.resolved).map((a) => a.id)) });
}
// team, from the Galeria: what was selected opens together. An image of the room is the base (the result comes back to
// its card as a version) and the rest come in as references; with only the client's photos it opens as Criar, in the scene of
// the card that cites them. refs: [{path, preview_path, thumb_path, option_id, label}]
export async function openWith(ctx, { baseId = null, refs = [], roundId = null, scene = 0, itemId = null }) {
  E.ctx = ctx;
  const base = baseId ? ctx.S.options.find((x) => x.id === baseId) : null;
  if (baseId && !isImg(base)) return ctx.toast("O estúdio edita imagens.", true);
  await ctx.sign(refs.map((r) => r.thumb_path || r.preview_path || r.path)).catch(() => {});
  const seen = new Map();
  const list = refs.map((r) => {
    const o = r.option_id ? ctx.S.options.find((x) => x.id === r.option_id) : null;
    let label = (o ? refName(o) : r.label) || "Referência";
    const n = (seen.get(label) || 0) + 1;
    seen.set(label, n);
    if (n > 1) label = `${label} #${n}`;
    return { path: o?.path || r.path, preview: o?.preview_path || r.preview_path || null, thumb_path: o?.thumb_path || r.thumb_path || null, thumb: ctx.urls.get(r.thumb_path || r.preview_path || r.path) || "", label, kind: "image" };
  });
  if (base) return open(ctx, { mode: "edit", base, item: ctx.itemOf(base.item_id), refs: list });
  const items = ctx.S.items.filter((i) => i.round_id === roundId && i.scene === scene).sort((a, b) => a.sort - b.sort);
  open(ctx, { mode: "create", round: roundId, scene, item: (itemId && ctx.itemOf(itemId)) || items[0] || null, refs: list, prompt: "", aspect: "16:9" });
}
