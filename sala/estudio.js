// Estúdio da sala
// - Desenhar (both rooms): draw and write on an image to point out what to change. Saved per option in
//   `annotations`; the client's drawings also leave a line in the item's comments so the team sees them.
// - Editar / Criar com IA (team): edit an option, or create from scratch, with the room's own files as references,
//   through the edge function `estudio` (it keeps the Magnific and Higgsfield keys on the server). Every result lands in
//   the item as a new option of the round's version, based_on the image edited, so it shows under "Mudanças que fizemos"
//   and never reaches the client until someone checks it.
// - Vídeo (team): the same bar switched to Seedance 2.5 through Higgsfield, either from a first (and last) frame or from
//   references (images, videos and the casting's voice takes, so the lips follow the voice). Videos land like images do.
// It lives in its own overlay outside #app: the app's re-renders and shortcuts never touch the canvas or the prompt.
// From config.js: the client's name (PROJECT.client), the film's look for Claude (ESTUDIO.look) and the product that
// joins every scene (PRODUCT, or null for a film without one).
import { PROJECT, ESTUDIO, PRODUCT } from "./config.js";

// `via` is the provider whose key the model needs on the server (see KEYS)
const MODELS = [
  { id: "magnific/nano-banana-2-1", via: "magnific", name: "Nano Banana 2.1", label: "Nano Banana 2.1", res: ["1k", "2k", "4k"], q: [], ar: ["auto", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "1:1", "21:9", "4:5", "5:4"], max: 14 },
  { id: "marketing-studio/image/sunburst", via: "higgsfield", name: "GPT 2.5 Sunburst", label: "GPT Image 2.5 Sunburst", res: ["1k", "2k", "4k"], q: ["low", "medium", "high", "xhigh", "max"], ar: ["auto", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "1:1", "21:9"], max: 16 },
  { id: "marketing-studio/image/flare", via: "higgsfield", name: "GPT 2.5 Flare", label: "GPT Image 2.5 Flare", res: ["1k", "2k", "4k"], q: ["low", "medium", "high", "xhigh", "max"], ar: ["auto", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "1:1", "21:9"], max: 16 },
  { id: "xai/grok-imagine-image-2.0", via: "higgsfield", name: "Grok Imagine 2.0", label: "Grok Imagine 2.0", res: ["1k", "2k"], q: ["low", "medium"], ar: ["auto", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "1:1", "2:1", "1:2"], max: 8 },
  { id: "alibaba/qwen-image-3/edit", via: "higgsfield", name: "Qwen Image 3", label: "Qwen Image 3", res: [], q: [], ar: [], max: 3, needsImage: true },
];
// video: Seedance 2.5 guided by references (@image1, @video1, @audio1… in the prompt; text only when nothing is attached)
// or by its first frame (the base, or the first image) and an optional last frame (the next image)
const VIDEO_MODELS = [
  { id: "bytedance/seedance-2.5/reference-to-video", via: "higgsfield", name: "Seedance 2.5 · Referências", label: "Seedance 2.5", way: "refs", ar: ["16:9", "9:16", "4:3", "3:4", "1:1", "21:9"] },
  { id: "bytedance/seedance-2.5/image-to-video", via: "higgsfield", name: "Seedance 2.5 · Primeiro e último quadro", label: "Seedance 2.5", way: "frames", ar: [] },
];
const TEXT_TO_VIDEO = "bytedance/seedance-2.5/text-to-video";
const DURS = [4, 5, 6, 8, 10, 12, 15, 20, 30];
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
};

const E = { ctx: null, root: null };
const esc = (s) => E.ctx.esc(s);
const $ = (sel) => E.root?.querySelector(sel);
const model = () => MODELS.find((m) => m.id === E.model) || MODELS[0];
const vmodel = () => VIDEO_MODELS.find((m) => m.id === E.vmodel) || VIDEO_MODELS[0];
const isVideo = () => E.mode !== "draw" && E.kind === "video";
const clamp = (v) => Math.max(0, Math.min(1, v));
const optOf = (id) => E.ctx.S.options.find((o) => o.id === id);
const isImg = (o) => o && !o.mime.startsWith("video/");
const ago = (ts) => { const s = Math.max(0, (Date.now() - new Date(ts)) / 1000); return s < 60 ? `${Math.round(s)}s` : s < 3600 ? `${Math.round(s / 60)} min` : new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); };
const thumbUrl = (o) => E.ctx.urls.get(o.thumb_path || o.preview_path || o.path) || "";
const bigUrl = (o) => E.ctx.urls.get(o.preview_path || o.path) || "";
// Versões: an image and its edits are one card (options.stack points at the original, whose face is the version on the
// card). An edit's result joins the stack of the image it was made from, unless "Card novo" is picked in the bar.
const rootOf = (o) => (o ? optOf(o.stack || o.id) || o : null);
const membersOf = (root) => (root ? [root, ...E.ctx.S.options.filter((x) => x.stack === root.id).sort((a, b) => a.created_at.localeCompare(b.created_at))] : []);
const faceIdOf = (root) => (root?.face && E.ctx.S.options.some((x) => x.id === root.face && x.stack === root.id) ? root.face : root?.id);
const stack = () => (E.mode === "edit" && E.base?.id && isImg(E.base) ? membersOf(rootOf(E.base)) : []);
const shownOpt = () => (E.view ? optOf(E.view) : E.base);
// the drawer (Versões, results, drawings) on the right: open or closed, remembered on this computer
const drawerPref = () => { try { return localStorage.getItem("sala-est-drawer") !== "off"; } catch { return true; } };
// the prompt floats over the image; it can fold away so the image is whole (remembered on this computer too)
const barPref = () => { try { return localStorage.getItem("sala-est-bar") !== "off"; } catch { return true; } };
const rootClass = () => `est est-${E.mode}${E.drawer ? "" : " drawer-off"}${E.barOn === false ? " bar-off" : ""}`;
const FOLD = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>';
const foldHtml = () => `<button class="est-fold" data-k="fold" title="Esconder o prompt: a imagem fica inteira" aria-label="Esconder o prompt">${FOLD}</button>`;
const unfoldHtml = () => `<button class="est-unfold" data-k="fold" title="Mostrar o prompt" aria-label="Mostrar o prompt">${ICONS.spark}<span>Prompt</span></button>`;

// ---------- the edge function ----------
async function call(action, payload = {}, raw = false) {
  const { data } = await E.ctx.sb.auth.getSession();
  const r = await fetch(E.ctx.fnUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token}`, apikey: E.ctx.anonKey },
    body: JSON.stringify({ action, ...payload }),
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
function track(job) {
  JOBS.set(job.id, { ...JOBS.get(job.id), ...job });
  const ref = DONE.has(job.status) && SWAPS.get(job.id);
  if (ref) {
    SWAPS.delete(job.id);
    ref.wait = Math.max(0, (ref.wait || 1) - 1);
    if (job.status === "imported" && job.imported?.length) swapRef(ref, job.imported.at(-1));
    else if (E.root) syncChips();
  }
  listeners.forEach((f) => f());
  if (!ticker) ticker = setInterval(tick, 4000);
}
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
    const outs = [...(job.result?.images || []).map((_, index) => ({ index })), ...(job.result?.video ? [{ kind: "video" }] : [])];
    for (const [i, w] of outs.entries()) {
      const blob = await call("file", { job_id: job.id, ...w }, true);
      const vid = w.kind === "video";
      if (blob.size > MAX_FILE) throw Object.assign(new Error(`o arquivo tem ${Math.round(blob.size / 1048576)} MB e a sala guarda até 50 MB; gere com menos duração ou resolução`), { final: true });
      const type = blob.type && blob.type.startsWith(vid ? "video/" : "image/") ? blob.type : vid ? "video/mp4" : "image/png";
      const file = new File([blob], `estudio-${job.id.slice(0, 8)}-${i + 1}.${type.split("/")[1].replace("jpeg", "jpg").replace("quicktime", "mov")}`, { type });
      const m = await E.ctx.putFile(`items/${job.item_id}`, file);
      const { data: o, error } = await sb.from("options").insert({
        item_id: job.item_id, path: m.path, preview_path: m.preview_path, thumb_path: m.thumb_path, mime: m.mime, name: m.name,
        created_by: job.created_by || E.ctx.myName(), version, based_on: job.base_option || null, stack: root && !vid ? root.id : null,
        // the caption is the line the client reads under the image: it starts empty (the prompt stays in prompt)
        caption: "", model: job.label || job.model, prompt: job.input?.prompt || job.prompt || "",
        reasoning: `Feito no estúdio${job.base_option ? " a partir de outra opção" : ""}.`,
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
    // a file too big for the room fails for good; anything else goes back to the queue for the next tick
    const error = e.final ? `Não coube na sala: ${e.message}` : null;
    await sb.from("estudio_jobs").update({ status: e.final ? "failed" : "completed", error, updated_at: new Date().toISOString() }).eq("id", job.id);
    track({ ...job, status: e.final ? "failed" : "completed", error });
    E.ctx.toast(`Não consegui guardar o resultado: ${e.message || e}`, true);
  }
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
  if (E.view) return;
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
// history entries: "s" / "n" added a stroke or a note; {m} moved or retexted one (prev = how it was); {d} deleted one
function undo() {
  const k = E.hist.pop();
  if (k === "s") E.strokes.pop();
  else if (k === "n") E.notes.pop();
  else if (k?.m) Object.assign((k.m === "n" ? E.notes : E.strokes)[k.i], k.prev);
  else if (k?.d) (k.d === "n" ? E.notes : E.strokes).splice(k.i, 0, k.item);
  E.sel = null;
  redraw(); syncChips(); syncTools();
}
// the base image with the drawing on top, as a JPEG for the model to see where to change (max: longest side, for reading)
async function marksPath(max = 0) {
  const src = bigUrl(E.base);
  const blob = await (await fetch(src)).blob();
  const bmp = await createImageBitmap(blob);
  const k = max ? Math.min(1, max / Math.max(bmp.width, bmp.height)) : 1;
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const g = c.getContext("2d");
  g.drawImage(bmp, 0, 0, c.width, c.height);
  paint(g, c.width, c.height, E.strokes, E.notes);
  const out = await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.9));
  const path = `estudio/marcas/${crypto.randomUUID()}.jpg`;
  const up = await E.ctx.sb.storage.from("media").upload(path, out, { contentType: "image/jpeg" });
  if (up.error) throw up.error;
  return path;
}
// k: the number the marked copy has among the images sent (2 on an edit, the last one on a blocking render)
const marksNote = (k) => {
  const pins = E.notes.map((n, i) => `${i + 1}) ${n.text}`).join("; ");
  if (E.blocking) return `Image ${k} is image 1 with marks drawn on top by the director${pins ? ` (numbered notes: ${pins})` : ""}: follow them where they are drawn, and do not reproduce any of the marks, numbers or text of image ${k} in the result.`;
  return `Image ${k} is the same picture as image 1 with marks drawn on top by the director to show where to change it${pins ? ` (numbered notes: ${pins})` : ""}. Apply the change only where it is marked, keep everything else exactly as in image 1, and do not reproduce any of the marks, numbers or text of image ${k} in the result.`;
};

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
  const video = isVideo();
  const base = E.base && { path: E.base.path, kind: "image", label: E.blocking ? "Blocking" : "Base", thumb: thumbUrl(E.base) };
  const imgs = E.refs.filter((r) => (r.kind || "image") === "image").map((r) => ({ ...r, kind: "image" }));
  const files = [...(base ? [base] : []), ...(base && hasDrawing() && !E.blocking ? [null] : []), ...imgs];
  const pool = { image: [...(base ? [base] : []), ...imgs], video: E.refs.filter((r) => r.kind === "video"), audio: E.refs.filter((r) => r.kind === "audio") };
  const named = [...(base ? [base] : []), ...E.refs.map((r) => ({ ...r, kind: r.kind || "image" }))].sort((a, b) => b.label.length - a.label.length);
  const alt = named.map((x) => x.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const re = new RegExp(`${video ? "@(image|video|audio)(\\d+)\\b" : "\\b[Ii]mage (\\d+)\\b(?!\\.\\d)"}${alt ? `|@(${alt})` : ""}`, "g");
  let out = "", at = 0;
  for (const m of text.matchAll(re)) {
    const x = m[video ? 3 : 2] ? named.find((n) => n.label === m[video ? 3 : 2]) : video ? pool[m[1]][m[2] - 1] : files[m[1] - 1];
    if (!x) continue;
    out += esc(text.slice(at, m.index)) + tokHTML(x);
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
async function syncMention() {
  const box = $(".est-mention");
  if (!box) return;
  const at = mentionAt();
  const hide = () => { E.mention = null; box.hidden = true; };
  if (!at) return hide();
  // by group, as in the + picker; a few of each until a word narrows it down
  const q = fold(at.q), seen = new Set();
  const groups = pickables().map(([g, list]) => [g, (g === "Vozes"
    ? list.map(({ f, i }) => ({ path: f.path, kind: "audio", label: voiceName(f, i) }))
    : list.map((o) => ({ path: o.path, preview: o.preview_path || null, kind: isImg(o) ? "image" : "video", label: nameOf(o), o })))
    .filter((x) => !seen.has(x.path) && seen.add(x.path) && (!q || fold(x.label).includes(q))).slice(0, q ? 20 : 6)]).filter(([, l]) => l.length);
  const items = groups.flatMap(([, l]) => l);
  if (!items.length) return hide();
  await E.ctx.sign(items.filter((x) => x.o).map((x) => x.o.thumb_path || x.o.preview_path || x.o.path));
  if (mentionAt()?.node !== at.node) return; // typed on meanwhile: the next input redraws it
  E.mention = { at, items, i: Math.min(E.mention?.i || 0, items.length - 1) };
  // "Ana · aprovada": the item in full, what sets it apart dimmed
  const name = (s) => { const k = s.indexOf(" · "); return k < 0 ? esc(s) : `${esc(s.slice(0, k))}<small>${esc(s.slice(k + 3))}</small>`; };
  let j = 0;
  box.innerHTML = groups.map(([g, list]) => `<p class="est-mh">${esc(g)}</p>${list.map((x) => { const n = j++; return `<button class="${n === E.mention.i ? "on" : ""}" data-k="mention" data-i="${n}">${x.o && x.kind === "image" ? `<img src="${esc(thumbUrl(x.o))}" alt="">` : x.kind === "audio" ? ICONS.wave : ICONS.film}<span>${name(x.label)}</span></button>`; }).join("")}`).join("");
  box.hidden = false;
  // above the caret, inside the card
  const r = document.createRange();
  r.setStart(at.node, at.start); r.collapse(true);
  const c = r.getBoundingClientRect(), card = $(".est-card").getBoundingClientRect();
  box.style.left = `${Math.max(8, Math.min(c.left - card.left, card.width - box.offsetWidth - 8))}px`;
  box.style.bottom = `${card.bottom - c.top + 6}px`;
}
const markMention = () => $(".est-mention")?.querySelectorAll("button").forEach((b, j) => b.classList.toggle("on", j === E.mention?.i));
function pickMention(j) {
  const x = E.mention?.items[j];
  if (!x) return;
  const { node, start, end } = E.mention.at;
  const range = document.createRange();
  range.setStart(node, start); range.setEnd(node, end);
  range.deleteContents();
  const tok = document.createElement("span");
  tok.className = "est-tok";
  tok.contentEditable = "false";
  Object.assign(tok.dataset, { path: x.path, kind: x.kind, label: x.label });
  tok.innerHTML = `${x.o && x.kind === "image" ? `<img src="${esc(thumbUrl(x.o))}" alt="">` : x.kind === "audio" ? ICONS.wave : ICONS.film}<span>${esc(x.label)}</span>`;
  range.insertNode(tok);
  const space = document.createTextNode(" ");
  tok.after(space);
  const sel = getSelection(), after = document.createRange();
  after.setStart(space, 1); after.collapse(true);
  sel.removeAllRanges(); sel.addRange(after);
  if (!E.refs.some((r) => r.path === x.path) && E.base?.path !== x.path) E.refs.push({ path: x.path, preview: x.preview || null, thumb: x.o && x.kind === "image" ? thumbUrl(x.o) : "", label: x.label, kind: x.kind });
  E.mention = null;
  $(".est-mention").hidden = true;
  editor()?.classList.remove("empty");
  E.prompt = promptText();
  syncChips();
}

// ---------- generate ----------
async function generate() {
  if (isVideo()) return generateVideo();
  const { ctx } = E, m = model(), prompt = E.prompt.trim();
  if (E.busy) return;
  if (!E.item) return ctx.toast("Esta cena ainda não tem item pra receber a imagem.", true);
  // the notes written on the drawing are an instruction of their own: with them the prompt may stay empty, and Claude
  // (when its key is set) first writes the prompt from them
  const said = E.base ? E.notes.map((n) => n.text).filter(Boolean).join("; ") : "";
  if (!prompt && !said) return ctx.toast("Escreva o que fazer, ou deixe uma nota no desenho.", true);
  if (!prompt && canWrite()) { await enhance(); if (E.prompt.trim()) return generate(); }
  if (m.needsImage && !E.base && !E.refs.length) return ctx.toast(`O ${m.name} precisa de uma imagem.`, true);
  E.busy = true; syncBar();
  try {
    const files = [], refs = [];
    let marksAt = 0;
    if (E.base) { files.push(E.base.path); refs.push({ path: E.base.path, label: "Base" }); }
    const marks = E.base && hasDrawing() ? await marksPath() : null;
    const addMarks = () => { files.push(marks); refs.push({ path: marks, label: "Desenho" }); marksAt = files.length; };
    if (marks && !E.blocking) addMarks();
    for (const r of E.refs) if ((r.kind || "image") === "image") { files.push(r.path); refs.push({ path: r.path, label: r.label }); }
    if (marks && E.blocking) addMarks();
    if (files.length > m.max) throw new Error(`O ${m.name} aceita até ${m.max} imagens.`);
    // each image named in the text becomes "image N", N its place among the files sent
    let full = promptFor((d) => { const i = files.indexOf(d.path); return i < 0 ? null : `image ${i + 1}`; }).trim() || "Edit image 1 as the director's numbered notes ask.";
    if (marks) full += `\n\n${marksNote(marksAt)}`;
    const input = { prompt: full };
    if (files.length) input.image_urls = files;
    if (m.res.length) input.resolution = E.res;
    if (m.q.length) input.quality = E.quality;
    if (m.ar.length) input.aspect_ratio = E.aspect;
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
// Seedance: the base (or the first image) and the files attached, each in its own list, in the order of the chips
async function generateVideo() {
  const { ctx } = E, m = vmodel(), prompt = E.prompt.trim();
  if (E.busy) return;
  if (!E.item) return ctx.toast("Esta cena ainda não tem item pra receber o vídeo.", true);
  if (!prompt) return ctx.toast("Escreva o que acontece no plano.", true);
  const pool = { image: [], video: [], audio: [] }, refs = [];
  if (E.base) { pool.image.push(E.base.path); refs.push({ path: E.base.path, label: "Base", kind: "image" }); }
  for (const r of E.refs) { const k = r.kind || "image"; pool[k].push(r.path); refs.push({ path: r.path, label: r.label, kind: k }); }
  // each reference named in the text becomes its Seedance tag (@image2, @audio1…), counted in its own list
  const said = promptFor((d) => { const i = (pool[d.kind] || []).indexOf(d.path); return i < 0 ? null : `@${d.kind}${i + 1}`; }).trim();
  const input = { prompt: said || prompt, duration: E.dur, resolution: E.vres, generate_audio: E.sound };
  let id = m.id;
  if (m.way === "frames") {
    if (!pool.image.length) return ctx.toast("Junte com + a imagem do primeiro quadro.", true);
    input.image_url = pool.image[0];
    if (pool.image[1]) input.end_image_url = pool.image[1];
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
  E.busy = true; syncBar();
  try {
    const label = [m.label, E.vres, `${E.dur}s`, "estúdio"].join(" · ");
    for (let k = 0; k < E.count; k++) {
      const { job } = await call("submit", { item_id: E.item.id, base_option: E.base?.id || null, mode: "video", model: id, label, prompt, input, refs, created_by: ctx.myName() });
      track(job);
    }
    ctx.toast(E.count > 1 ? `${E.count} vídeos pedidos` : "Vídeo pedido");
  } catch (e) { ctx.toast(e.message || "Não deu certo", true); }
  E.busy = false; syncBar();
}

// ---------- Melhorar: Claude reads the prompt and the drawing's notes, looks at the images in the order the generator will
// get them (smaller copies), and writes a better prompt in place of the text. ⌘Z in the prompt brings the old text back. ----------
async function enhance() {
  const { ctx } = E, video = isVideo(), frames = video && vmodel().way === "frames";
  if (E.writing || E.busy) return;
  const notes = E.base && !video ? E.notes.map((n) => n.text).filter(Boolean) : [];
  if (!E.prompt.trim() && !notes.length && !E.base && !E.refs.length) return ctx.toast("Escreva a ideia em poucas palavras, em português mesmo.", true);
  E.writing = true; syncBar();
  try {
    const small = (o) => o.preview_path || o.path;
    const images = [], tags = [];
    const imgRefs = E.refs.filter((r) => (r.kind || "image") === "image").map((r) => ({ path: r.preview || r.path, label: r.label }));
    const marks = E.base && !video && hasDrawing() ? { path: await marksPath(1600), label: "the same picture with the director's marks and numbered notes on top" } : null;
    if (video) {
      if (E.base) images.push({ path: small(E.base), label: frames ? "the first frame" : "the base image" });
      images.push(...imgRefs.map((r, i) => (frames && !E.base && i === 0 ? { ...r, label: `the first frame (${r.label})` } : r)));
      if (frames) images.splice(2);
      else {
        const n = { video: 0, audio: 0 };
        for (const r of E.refs) if (r.kind === "video" || r.kind === "audio") tags.push({ tag: `@${r.kind}${++n[r.kind]}`, label: r.kind === "audio" ? `voice take "${r.label}"` : `video "${r.label}"` });
      }
    } else if (E.blocking) {
      images.push({ path: small(E.base), label: "the 3D blocking frame" }, ...imgRefs);
      if (marks) images.push(marks);
    } else if (E.base) {
      images.push({ path: small(E.base), label: "the picture to edit" });
      if (marks) images.push(marks);
      images.push(...imgRefs);
    } else images.push(...imgRefs);
    const it = E.item;
    const { prompt } = await call("write", {
      kind: video ? (frames ? "frames" : "video") : E.blocking ? "blocking" : E.base ? "edit" : "create",
      images, tags, notes, prompt: E.prompt.trim(), item: it?.title || "", scene: ctx.sceneName(it?.scene ?? E.scene) || "",
      // the film's look, which Claude keeps in every prompt (the function has a neutral one when this is empty)
      look: String(ESTUDIO?.look || "").slice(0, 400),
      ...(video && { duration: E.dur, aspect: frames ? "" : E.vaspect }),
    });
    setPrompt(prompt);
    ctx.toast("Prompt melhorado. ⌘Z no texto volta ao anterior.");
  } catch (e) { ctx.toast(e.message || "O Claude não respondeu", true); }
  E.writing = false; syncBar();
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
  window.removeEventListener("keydown", onKey, true);
  E.ro?.disconnect();
  E.audio?.pause();
  listeners.delete(syncRail);
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
const SESSION = ["mode", "item", "base", "refs", "strokes", "notes", "hist", "tool", "color", "scene", "round", "blocking", "view",
  "model", "aspect", "res", "quality", "count", "kind", "vmodel", "vaspect", "vres", "dur", "sound", "dest", "parent", "recipeKey"];
function openRef(i) {
  const { ctx } = E, r = E.refs[i];
  const o = r && (r.kind || "image") === "image" ? ctx.S.options.find((x) => x.path === r.path) : null;
  if (!o) return ctx.toast(r?.kind && r.kind !== "image" ? "Dá pra editar só as imagens." : "Esta imagem veio de fora da sala: dá pra tirar, não editar.", true);
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
    Object.assign(ref, { path: o.path, preview: o.preview_path || null, thumb: thumbUrl(o) });
    if (here) {
      E.root.querySelectorAll(".est-tok").forEach((t) => { if (t.dataset.path !== old) return; t.dataset.path = o.path; const im = t.querySelector("img"); if (im) im.src = ref.thumb; });
      E.prompt = promptText();
    }
    if (here || (E.root && E.parent?.ref === ref)) ctx.toast(`✦ ${ref.label}: a versão nova já está na geração`);
  }
  if (E.root) { syncChips(); if (E.parent) syncView(); }
}
// window, capture phase: the studio's own shortcuts, and keys aimed at the page behind never reach the app. Keys typed
// inside the studio reach their own fields first and stop at the overlay (see open()), so the app never acts on them.
function onKey(e) {
  if (!E.root) return;
  const typing = e.target.matches?.("input, textarea, select") || e.target.isContentEditable;
  const stop = () => { e.preventDefault(); e.stopPropagation(); };
  if (e.key === "Escape" && !e.target.classList?.contains("est-pin-in")) {
    stop();
    if (E.mention) { E.mention = null; $(".est-mention").hidden = true; } else if (E.pick) { E.pick = false; E.pickBase = false; syncPicker(); } else if (E.sel) { E.sel = null; redraw(); } else close();
  }
  else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { stop(); E.mode === "draw" ? saveDrawing() : generate(); }
  else if ((e.key === "z" || e.key === "Z") && (e.metaKey || e.ctrlKey) && !typing) { stop(); undo(); }
  else if ((e.key === "Delete" || e.key === "Backspace") && E.sel && !typing) { stop(); deleteSel(); }
  else if ((e.key === "v" || e.key === "V") && !e.metaKey && !e.ctrlKey && !e.altKey && !typing && E.base && !isVideo()) { stop(); E.tool = "move"; syncTools(); }
  else if (e.key === "Enter" && e.target.matches?.(".est-chip[data-k]")) { stop(); e.target.click(); }
  else if (!E.root.contains(e.target)) e.stopPropagation();
}
function frameHtml() {
  return `<div class="est-tools" role="toolbar" aria-label="Desenhar">
      ${[["move", "Mover (V): arraste uma marca, Delete apaga, duplo clique edita a nota"], ["pen", "Pincel"], ["arrow", "Seta"], ["box", "Caixa"], ["text", "Texto"]].map(([t, n]) => `<button class="est-tool" data-tool="${t}" title="${n}" aria-label="${n.split(":")[0]}">${ICONS[t]}</button>`).join("")}
      <span class="est-sep"></span>
      ${COLORS.map((c) => `<button class="est-color" data-color="${c}" style="--c:${c}" title="Cor" aria-label="Cor"></button>`).join("")}
      <span class="est-sep"></span>
      <button class="est-tool" data-k="undo" title="Desfazer (⌘Z)" aria-label="Desfazer">${ICONS.undo}</button>
      <button class="est-tool" data-k="clear" title="Apagar o desenho" aria-label="Apagar o desenho">${ICONS.clear}</button>
    </div>
    <div class="est-frame"><img class="est-img" alt=""><video class="est-vid" controls loop playsinline hidden></video><canvas class="est-canvas"></canvas>
      <div class="est-vnav" hidden><button data-k="vstep" data-v="-1" aria-label="Versão anterior">‹</button><b></b><button data-k="vstep" data-v="1" aria-label="Próxima versão">›</button></div>
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
  // as small pills and where the result goes as one toggle, on the left; on the right the last steps: Melhorar, how many, Gerar
  return `<div class="est-viewbar"></div>${unfoldHtml()}<div class="est-card">${foldHtml()}
    <div class="est-refs"></div>
    <div class="est-field">
      <div class="est-prompt est-ed empty" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Prompt"></div>
    </div>
    <div class="est-mention" role="listbox" aria-label="Referências da sala" hidden></div>
    <div class="est-ctl">
      <label class="est-pill est-model" title="Modelo: os de imagem e, embaixo, os de vídeo"><i class="est-ico"></i><select data-k="model"></select></label>
      <label class="est-pill" title="Proporção"><i>${ICONS.aspect}</i><select data-k="aspect"></select></label>
      <label class="est-pill" title="Resolução"><select data-k="res"></select></label>
      <label class="est-pill" title="Qualidade"><select data-k="quality"></select></label>
      <label class="est-pill" title="Duração"><i>${ICONS.clock}</i><select data-k="dur"></select></label>
      <button class="est-pill est-tog" data-k="sound" hidden></button>
      <button class="est-pill est-tog" data-k="dest" hidden></button>
      <span class="grow"></span>
      <button class="est-pill est-enh" data-k="enhance" aria-label="Melhorar o prompt" hidden>${ICONS.wand}</button>
      <label class="est-pill est-n" title="Quantas gerar de uma vez"><select data-k="count">${[1, 2, 3, 4].map((n) => `<option value="${n}">×${n}</option>`).join("")}</select></label>
      <button class="est-go" data-k="go">${ICONS.spark}<span>Gerar</span></button>
    </div>
    <div class="est-pick" hidden></div>
  </div>`;
}
function open(ctx, init) {
  E.ctx = ctx;
  if (E.root) teardown();
  HELD = null;
  Object.assign(E, {
    mode: "edit", item: null, base: null, refs: [], strokes: [], notes: [], hist: [], live: null, view: null,
    tool: "pen", color: COLORS[0], prompt: "", busy: false, pick: false, shown: new Set(), scene: null, round: null, playing: null, blocking: false, sel: null, drag: null,
    model: E.model || MODELS[0].id, aspect: E.aspect || "auto", res: E.res || "2k", quality: E.quality || "high", count: 1,
    kind: E.kind || "image", vmodel: E.vmodel || VIDEO_MODELS[0].id, vaspect: E.vaspect || "16:9", vres: E.vres || "720p", dur: E.dur || 5, sound: E.sound ?? true,
    drawer: drawerPref(), barOn: barPref(), dest: init?.blocking ? "card" : "ver", parent: null, recipeKey: "",
  }, init);
  const root = document.createElement("div");
  root.className = rootClass();
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", E.mode === "draw" ? "Desenhar" : "Estúdio");
  root.innerHTML = `<header class="est-top"><div class="est-title"></div>
      <button class="est-hist ${E.drawer ? "on" : ""}" data-k="drawer" aria-pressed="${E.drawer}" title="${E.mode === "draw" ? "Desenhos nesta imagem" : "Versões e resultados"}" aria-label="Abrir ou fechar a coluna de versões">${ICONS.history}</button>
      <button class="link est-close" data-k="close">Fechar ✕</button></header>
    <div class="est-mid"><div class="est-stage">${frameHtml()}</div><aside class="est-rail" data-keep="est-rail"></aside></div>
    <div class="est-bar">${barHtml()}</div>`;
  document.body.append(root);
  document.body.classList.add("est-open");
  E.root = root;
  window.addEventListener("keydown", onKey, true);
  root.addEventListener("keydown", (e) => e.stopPropagation());
  root.addEventListener("click", onClick);
  root.addEventListener("change", onChange);
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
  root.addEventListener("input", (e) => {
    const t = e.target;
    if (!t.matches?.(".est-prompt")) return;
    if (!t.isContentEditable) { E.prompt = t.value; fit(t); return; }
    t.classList.toggle("empty", !t.textContent.trim() && !t.querySelector(".est-tok"));
    E.prompt = promptText();
    syncMention();
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
  syncAll();
  if (E.mode !== "draw") { loadJobs(); loadKeys(); }
  setTimeout(() => $(".est-prompt")?.focus(), 30);
}
// the prompt box's own keys: with the @ list open, ↑ ↓ choose and Enter or Tab puts the reference in; otherwise Enter is a
// new line (⌘Enter generates, see onKey) and a paste comes in as plain text. The list keeps the focus in the text when clicked
function bindEditor() {
  const ed = editor();
  if (!ed) return;
  ed.addEventListener("keydown", (e) => {
    if (E.mention && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      const n = E.mention.items.length;
      E.mention.i = (E.mention.i + (e.key === "ArrowDown" ? 1 : -1) + n) % n;
      return markMention();
    }
    if (E.mention && (e.key === "Enter" || e.key === "Tab")) { e.preventDefault(); return pickMention(E.mention.i); }
    if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); document.execCommand("insertText", false, "\n"); }
  });
  ed.addEventListener("paste", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const files = [...(e.clipboardData?.files || [])];
    if (files.length && E.mode !== "draw") return addRefFiles(files, { inline: true });
    document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
  });
  ed.addEventListener("keyup", (e) => { if (e.key.startsWith("Arrow") && !E.mention) syncMention(); });
  ed.addEventListener("blur", () => { E.mention = null; const box = $(".est-mention"); if (box) box.hidden = true; });
  $(".est-mention")?.addEventListener("mousedown", (e) => e.preventDefault());
}
async function loadKeys() {
  try { Object.assign(KEYS, (await call("check")).keys); } catch { /* unknown: Gerar shows the server's answer */ }
  syncBar();
}
const fit = (t) => { t.style.height = "auto"; t.style.height = `${Math.min(220, t.scrollHeight)}px`; };
function syncAll() { syncTitle(); syncStage(); syncTools(); syncChips(); syncBar(); syncRail(); }
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
      ${isImg(o) ? '<button class="est-alt" data-k="as-base">Editar esta</button>' : ""}
      <button class="link" data-k="back">Voltar</button>`;
  } else {
    v.innerHTML = `<span>Resultado · ${esc(o.model || "")}</span>${isImg(o) ? '<button class="est-alt" data-k="as-base">Usar como base</button>' : ""}<button class="est-alt" data-k="open-opt" data-id="${o.id}">Abrir na sala</button><button class="link" data-k="back">Voltar à ${E.base ? "base" : "criação"}</button>`;
  }
  E.root.classList.toggle("vb", !!v.innerHTML);
}
function syncTools() {
  E.root.querySelectorAll("[data-tool]").forEach((b) => b.classList.toggle("on", b.dataset.tool === E.tool));
  const cv = $(".est-canvas");
  if (cv) cv.style.cursor = E.tool === "move" ? "default" : "";
  E.root.querySelectorAll("[data-color]").forEach((b) => b.classList.toggle("on", b.dataset.color === E.color));
  const u = $('[data-k="undo"]'), c = $('[data-k="clear"]');
  if (u) u.disabled = !E.hist.length;
  if (c) c.disabled = !hasDrawing();
}
// what goes with the prompt, as a stack of circles: the base first (ringed), the drawing, then the references. Hovering
// spreads the stack and names each one as the prompt calls it: 1, 2… (image 1, image 2) for the image models; @image1,
// @video1, @audio1… for Seedance with references; Início and Fim for Seedance with frames (one without a name stays out,
// dimmed). A reference shows its ✕ on its own hover, and a click on a room image edits it over this generation (openRef):
// its new version comes back into the same place
function syncChips() {
  const box = $(".est-refs");
  if (!box) return;
  const video = isVideo(), frames = video && vmodel().way === "frames", n = { image: 0, video: 0, audio: 0 };
  const tag = (kind) => {
    if (!video) return kind === "image" ? String(++n.image) : "";
    if (frames) return kind === "image" ? ["Início", "Fim"][n.image++] || "" : "";
    return `@${kind}${++n[kind]}`;
  };
  const chip = (thumb, label, kind, { cls = "", attrs = "", rm = false, rmKey = "ref-rm", hint = "" } = {}) => {
    const t = tag(kind);
    const face = thumb ? `<img src="${esc(thumb)}" alt="">` : kind === "audio" ? ICONS.wave : kind === "video" ? ICONS.film : ICONS.pen;
    const tip = `<span class="est-tip"><span>${t ? `<b>${esc(t)}</b>` : ""}${esc(label)}</span>${t ? hint : `<small>${video ? "fica de fora neste modo" : "só entra no vídeo"}</small>`}</span>`;
    return `<span class="est-chip ${cls} ${t ? "" : "off"}" ${attrs}>${face}${tip}${rm ? `<button class="est-x" data-k="${rmKey}" aria-label="Tirar ${esc(label)}">${ICONS.x}</button>` : ""}</span>`;
  };
  // the drawing is image 2 of an edit; on a blocking render it comes last, so the recipe's numbers stay right
  const draw = () => (E.base && hasDrawing() && !video ? chip("", "Desenho", "image", { cls: "draw" }) : "");
  const L = E.base ? E.ctx.letterOf(E.item, E.base) : "";
  const slot = !E.base && E.mode === "create" && !video ? `<button class="est-chip baseslot" data-k="pick-base" aria-label="Escolher uma base">${ICONS.plus}<span class="est-tip"><span>Base</span><small>escolher da sala, do computador ou colar</small></span></button>` : "";
  box.innerHTML = [
    slot,
    E.base ? chip(thumbUrl(E.base), `${E.blocking ? "Blocking" : "Base"}${L ? ` · ${L}` : ""}`, "image", E.blocking
      ? { cls: "base can", attrs: 'data-k="base-3d" role="button" tabindex="0" aria-label="Ajustar este ângulo na Cena 3D"', rm: !E.parent, rmKey: "nobase", hint: "<small>clique: ajustar no 3D · ✕: criar sem o blocking</small>" }
      : { cls: "base", rm: E.mode === "edit" && !E.parent, rmKey: "nobase", hint: E.mode === "edit" && !E.parent ? "<small>o ✕ tira a base e vira Criar</small>" : "" }) : "",
    E.blocking ? "" : draw(),
    ...E.refs.map((r, i) => {
      const can = (r.kind || "image") === "image" && E.ctx.S.options.some((o) => o.path === r.path);
      return chip(r.thumb, r.label, r.kind || "image", {
        cls: `${can ? "can" : ""} ${r.wait ? "wait" : ""}`, rm: true,
        attrs: `data-i="${i}"${can ? ` data-k="ref-open" role="button" tabindex="0" aria-label="Editar ${esc(r.label)} com IA"` : ""}`,
        hint: r.wait ? "<small>gerando a versão nova…</small>" : can ? "<small>clique para editar</small>" : "",
      });
    }),
    E.blocking ? draw() : "",
    `<button class="est-add" data-k="pick" aria-label="Juntar referência">${ICONS.plus}<span class="est-tip"><span>Juntar referência</span><small>${video ? "imagens, vídeos e vozes" : "da sala ou do computador"}</small></span></button>`,
  ].join("");
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
    sel("dur", DURS, E.dur, (x) => `${x} s`);
  } else {
    if (m.ar.length && !m.ar.includes(E.aspect)) E.aspect = "auto";
    if (m.res.length && !m.res.includes(E.res)) E.res = m.res.includes("2k") ? "2k" : m.res.at(-1);
    if (m.q.length && !m.q.includes(E.quality)) E.quality = m.q.includes("high") ? "high" : m.q.at(-1);
    sel("aspect", m.ar, E.aspect, (x) => (x === "auto" ? "Auto" : x));
    sel("res", m.res, E.res, (x) => x.toUpperCase());
    sel("quality", m.q, E.quality, (x) => Q_LABEL[x] || x);
    sel("dur", [], "");
  }
  const ap = $('select[data-k="aspect"]')?.closest(".est-pill");
  if (ap) ap.title = !video && E.aspect === "auto" ? `Proporção: Auto ${E.base ? "mantém a da imagem base" : "deixa o modelo escolher"}` : "Proporção";
  const snd = $('[data-k="sound"]');
  if (snd) {
    snd.hidden = !video;
    snd.classList.toggle("on", !!E.sound);
    snd.setAttribute("aria-pressed", String(!!E.sound));
    snd.innerHTML = E.sound ? ICONS.sound : ICONS.mute;
    snd.title = E.sound ? "Com som: o Seedance gera as vozes e o ambiente junto. Clique para tirar." : "Sem som. Clique para gerar com som.";
  }
  const pr = $(".est-prompt");
  if (pr && E.mode !== "draw") {
    pr.dataset.placeholder = !video ? (E.base ? "Descreva a mudança. Use @ para citar uma imagem da sala, ou desenhe na imagem para apontar onde." : "Descreva a imagem que quer criar. Use @ para citar castings, locações e outras imagens da sala.")
      : m.way === "frames" ? "Descreva o que acontece entre o primeiro e o último quadro e como a câmera se move."
      : "Descreva o plano: o que acontece, a câmera e a luz. Use @ para citar imagens, vídeos e vozes (a voz faz a sincronia labial).";
  }
  const em = $(".est-empty span");
  if (em) em.textContent = video ? "Escreva o plano embaixo e junte com + imagens, vídeos e vozes da sala."
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
  if (go) { go.disabled = !!(E.busy || E.writing); go.querySelector("span").textContent = E.busy ? "Enviando…" : E.count > 1 ? `Gerar ${E.count}` : "Gerar"; }
  const sv = $('[data-k="save"]');
  if (sv) { sv.disabled = E.busy; sv.textContent = E.busy ? "Salvando…" : "Salvar desenho"; }
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
  // the versions of the image on the stage (the original first, the card's current one marked, the edits still running
  // at the end), then every other result of the item
  const all = stack(), faceId = all.length ? faceIdOf(all[0]) : null, shown = shownOpt();
  const jobs = [...JOBS.values()].filter((j) => j.item_id === E.item?.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const inAll = (id) => all.some((m) => m.id === id);
  const ofStack = (j) => inAll(j.base_option) && (j.mode === "version" || j.mode === "ref" || (j.imported || []).some(inAll));
  const pending = jobs.filter((j) => ofStack(j) && j.status !== "imported").reverse();
  const others = jobs.filter((j) => !ofStack(j));
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
      </div>`;
    }).join("")}</div>`
    : all.length ? "" : `<p class="side-label">Resultados</p><p class="est-note">${E.base ? "O que for gerado aparece aqui e entra no item como opção nova, ligada a esta." : "O que for gerado aparece aqui e entra no item escolhido lá em cima."}</p>`;
  rail.innerHTML = vers + res;
  syncView();
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
  const { ctx } = E, it = ctx.itemOf(o.item_id), t = it?.title || "Imagem";
  if (o.model === "Blocking 3D") return `${t} · 3D${o.caption ? ` ${o.caption}` : ""}`;
  if (it && rootOf(o).id === it.chosen_option) return `${t} · ${it.decision === "approved" ? "aprovada" : "escolhida"}`;
  const L = it ? ctx.letterOf(it, o) : "";
  const kept = (ctx.S.reviews || []).some((r) => r.option_id === o.id && r.verdict === "keep");
  return `${t} · ${kept ? "✓ " : ""}v${o.version || 1}${L ? ` ${L}` : ""}`;
}
const nameOf = (o) => E.names?.get(o.id) || refName(o);
// the room's files to use as references: this scene's client picks and checked options first, then this item's other
// images and its Referências, then the rest of the round; for a video also the round's videos and the voice takes the
// client sent with the casting (the item's refs). Each image once, as its card shows it now.
function pickables() {
  const { ctx } = E, S = ctx.S;
  const it = E.item, scene = it?.scene ?? E.scene;
  const items = S.items; // every round: a shot of a later round is made from what an earlier one approved
  const verdict = (o) => (S.reviews || []).find((r) => r.option_id === o.id)?.verdict;
  const chosen = (o) => o.id === ctx.itemOf(o.item_id)?.chosen_option;
  const good = (o) => isImg(o) && (chosen(o) || verdict(o) === "keep");
  const seen = new Set(E.base ? [E.base.id] : []);
  const once = (list) => list.map(cardOf).filter((o) => isImg(o) && !seen.has(o.id) && seen.add(o.id));
  // the client's picks first, then the team's ✓
  const picks = (inScene) => once(S.options.filter((o) => good(o) && items.some((i) => i.id === o.item_id && (i.scene === scene) === inScene)).sort((a, b) => chosen(b) - chosen(a)));
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
async function syncPicker() {
  const p = $(".est-pick");
  if (!p) return;
  p.hidden = !E.pick;
  if (!E.pick) return;
  const groups = pickables(), video = isVideo();
  await E.ctx.sign(groups.flatMap(([g, l]) => (g === "Vozes" ? [] : l.map((o) => (isImg(o) ? o.thumb_path || o.preview_path || o.path : o.path)))));
  const on = (path) => E.refs.some((r) => r.path === path);
  const tile = (o) => `<button class="est-pick-th ${on(o.path) ? "on" : ""}" data-k="ref-add" data-id="${esc(o.id)}" title="${esc(nameOf(o))}${o.caption ? ` · ${esc(o.caption)}` : ""}">${tileMedia(o)}<span>${esc(nameOf(o))}</span></button>`;
  const voice = ({ f, i }) => `<div class="est-pick-th est-pick-aud ${on(f.path) ? "on" : ""}"><button class="est-wave" data-k="ref-voice" data-id="${f.id}" data-item="${i.id}" title="Usar a voz ${esc(voiceName(f, i))}">${ICONS.wave}</button>
    <span><button class="est-play" data-k="play" data-path="${esc(f.path)}" aria-label="Ouvir ${esc(voiceName(f, i))}">${E.playing === f.path ? "■" : "▶"}</button>${esc(voiceName(f, i))}</span></div>`;
  // redrawn on every pick: keep the scroll where it was, or the voices at the bottom jump out of reach
  const top = p.querySelector(".est-pick-body")?.scrollTop || 0;
  p.innerHTML = `<div class="est-pick-head"><b>${E.pickBase ? "Escolher a base" : "Referências"}</b><label class="est-alt est-up">${ICONS.plus}Do computador<input type="file" accept="${video ? "image/*,video/*,audio/*" : "image/*"}" multiple hidden data-k="upload"></label><button class="link" data-k="pick">Fechar</button></div>
    <div class="est-pick-body">${groups.map(([g, list]) => `<p class="side-label">${g}</p><div class="est-pick-grid">${list.map(g === "Vozes" ? voice : tile).join("")}</div>`).join("") || '<p class="est-note">Nada aprovado ou marcado com ✓ ainda.</p>'}</div>`;
  p.querySelector(".est-pick-body").scrollTop = top;
}
async function onClick(e) {
  const b = e.target.closest("[data-k], [data-tool], [data-color]");
  if (!b) { if (E.pick && !e.target.closest(".est-pick")) { E.pick = false; E.pickBase = false; syncPicker(); } return; }
  const { ctx } = E, k = b.dataset.k;
  if (b.dataset.tool) { E.tool = b.dataset.tool; if (E.tool !== "move") { E.sel = null; redraw(); } return syncTools(); }
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
  if (k === "enhance") return enhance();
  if (k === "save") return saveDrawing();
  if (k === "sound") { E.sound = !E.sound; return syncBar(); }
  if (k === "pick") { E.pick = !E.pick; E.pickBase = false; return syncPicker(); }
  if (k === "pick-base") { E.pick = true; E.pickBase = true; return syncPicker(); }
  if (k === "ref-add" && E.pickBase) {
    const o = optOf(b.dataset.id);
    E.pick = false; E.pickBase = false; syncPicker();
    return o && isImg(o) ? setBase(o) : undefined;
  }
  if (k === "ref-open") return openRef(+b.dataset.i);
  if (k === "base-3d") return openSource();
  if (k === "nobase") return dropBase();
  if (k === "up") return goBack();
  if (k === "use-ref") { if (E.parent && optOf(b.dataset.id)) await swapRef(E.parent.ref, b.dataset.id); return; }
  if (k === "ref-rm") { E.refs.splice(+b.closest("[data-i]").dataset.i, 1); return syncChips(); }
  if (k === "ref-add" || k === "ref-voice") {
    const o = k === "ref-add" ? optOf(b.dataset.id) || (E.item ? refImgs(E.item) : []).find((r) => r.id === b.dataset.id) : ctx.S.files.find((f) => f.id === b.dataset.id);
    if (!o) return;
    const i = E.refs.findIndex((r) => r.path === o.path);
    if (i >= 0) E.refs.splice(i, 1);
    else if (k === "ref-voice") E.refs.push({ path: o.path, thumb: "", label: voiceName(o, ctx.itemOf(b.dataset.item)), kind: "audio" });
    else E.refs.push({ path: o.path, preview: o.preview_path || null, thumb: isImg(o) ? thumbUrl(o) : "", label: nameOf(o), kind: isImg(o) ? "image" : "video" });
    syncChips(); return syncPicker();
  }
  if (k === "play") {
    const path = b.dataset.path;
    E.audio ||= new Audio();
    E.audio.onended = () => { E.playing = null; syncPicker(); };
    if (E.playing === path) { E.audio.pause(); E.playing = null; return syncPicker(); }
    await ctx.sign([path]);
    E.audio.src = ctx.urls.get(path) || "";
    E.playing = path;
    E.audio.play().catch(() => { E.playing = null; syncPicker(); });
    return syncPicker();
  }
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
  if (k === "fold") {
    E.barOn = !E.barOn;
    try { localStorage.setItem("sala-est-bar", E.barOn ? "on" : "off"); } catch { /* the page still works */ }
    E.root.classList.toggle("bar-off", !E.barOn);
    if (E.barOn) $(".est-prompt")?.focus();
    return;
  }
  if (k === "drawer") {
    E.drawer = !E.drawer;
    try { localStorage.setItem("sala-est-drawer", E.drawer ? "on" : "off"); } catch { /* the page still works */ }
    E.root.classList.toggle("drawer-off", !E.drawer);
    b.classList.toggle("on", E.drawer);
    b.setAttribute("aria-pressed", String(E.drawer));
    return redraw();
  }
  if (k === "as-base") {
    const o = optOf(E.view);
    if (!o) return;
    Object.assign(E, { base: o, view: null, strokes: [], notes: [], hist: [], mode: "edit", item: ctx.itemOf(o.item_id), blocking: false });
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
    if (VIDEO_MODELS.some((x) => x.id === t.value)) { E.kind = "video"; E.vmodel = t.value; } else { E.kind = "image"; E.model = t.value; }
    syncTitle(); syncChips(); syncBar(); redraw(); syncPicker();
    return;
  }
  if (k === "count") { E.count = Number(t.value) || 1; return syncBar(); }
  if (k === "aspect") { if (isVideo()) E.vaspect = t.value; else E.aspect = t.value; }
  if (k === "res") { if (isVideo()) E.vres = t.value; else E.res = t.value; }
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
    await addRefFiles(files);
  }
}
// files from the computer become references: the picker's Do computador, a paste (⌘V) anywhere in the studio, or a drop
// on it. A pasted image has no name of its own, so it is "Colada 1", "Colada 2"…; a paste in the text also puts it there
// inline, where the caret was
async function addRefFiles(files, { inline = false } = {}) {
  const video = isVideo();
  const ok = files.filter((f) => f.type.startsWith("image/") || (video && /^(video|audio)\//.test(f.type)));
  if (!ok.length) return E.ctx.toast(video ? "Entram imagens, vídeos e vozes." : "Entram imagens (vídeo e voz só no modo vídeo).", true);
  const at = inline ? saveCaret() : null;
  for (const f of ok) {
    try {
      const kind = f.type.startsWith("audio/") ? "audio" : f.type.startsWith("video/") ? "video" : "image";
      const m = await E.ctx.putFile("estudio/refs", f);
      if (kind === "image") await E.ctx.sign([m.thumb_path || m.path]);
      const named = f.name && !/^(image|imagem|screenshot|captura)[\s._-]*\d*\.\w+$/i.test(f.name);
      const label = named ? f.name.replace(/\.[^.]+$/, "").slice(0, 40) : `Colada ${E.refs.filter((r) => /^Colada \d+$/.test(r.label)).length + 1}`;
      const ref = { path: m.path, preview: m.preview_path || null, thumb: kind === "image" ? E.ctx.urls.get(m.thumb_path || m.path) || "" : "", label, kind };
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
  open(ctx, { ...snap, refs: snap.refs.filter((r) => r.path !== o.path), mode: "edit", base: o, view: null, strokes: [], notes: [], hist: [], blocking: false, recipeKey: "", dest: o.id && o.item_id === itemId ? "ver" : "card" });
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
async function blockingRecipe(ctx, o) {
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
  // the prompt, and its item in the animatic (kind plano, variants.shot) is where the render lands
  const cam = shot.camera || {}, from = cam.from_preset || cam.preset, title = cam.from_title || cam.preset_title;
  const shotItem = from ? ctx.S.items.find((i) => i.kind === "plano" && i.variants?.shot === from) : null;
  const tells = shotItem?.brief || title;
  const prompt = `Image 1 is a 3D blocking frame of a shot from a film: simple low-poly placeholders that set the camera, the framing, the scale and the poses. Turn it into the real photographic frame of that shot.${tells ? `

What this shot tells (written in Portuguese): "${shotItem ? `${shotItem.title}: ` : ""}${tells}". Play that moment: the action, the gesture and the feeling, as image 1 frames it.` : ""}

Keep exactly from image 1: the camera position, height, angle and lens${lens}, the framing and composition, and where each person and object is in the frame, how big they are, their pose, their gesture and where they look.

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
  open(ctx, { mode: "edit", base: o, item: (itemId && ctx.itemOf(itemId)) || recipe?.shotItem || ctx.itemOf(o.item_id), ...(recipe && { blocking: true, kind: "image", model: MODELS[0].id, aspect: "16:9", refs: recipe.refs, prompt: recipe.prompt }) });
  if (recipe) E.recipeKey = recipeKey();
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
  open(ctx, { mode: "create", round: roundId, scene, item, refs, prompt, aspect: "16:9" });
}
// both rooms: draw on an option and say what to change
export function openDraw(ctx, { optionId }) {
  const o = ctx.S.options.find((x) => x.id === optionId);
  if (!o || !isImg(o)) return ctx.toast("Dá pra desenhar só em imagem.", true);
  const mine = (ctx.S.annotations || []).filter((a) => a.option_id === o.id);
  open(ctx, { mode: "draw", base: o, item: ctx.itemOf(o.item_id), shown: new Set(mine.filter((a) => !a.resolved).map((a) => a.id)) });
}
