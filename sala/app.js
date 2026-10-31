// Sala de aprovação. One app, two rooms: /producao for the team, /aprovacao for the client.
// The team uploads options per item and sends a round; the client picks, approves or asks for changes.
// Layout: a sidebar (rounds, scenes, materials) and one page at a time that fits the viewport.
// Everything that changes from one job to the next (names, scenes, rounds, logins) lives in config.js.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE_URL, SUPABASE_KEY, CLIENT_URL, PROJECT, LOGINS, PEOPLE, KINDS, MAIN_KINDS, ROUNDS, SCENES, STYLE_BASE, PROMPTS, SEND_MESSAGE } from "./config.js";

const SIDE = document.body.dataset.side; // "time" | "cliente", set by the entry page
const TEAM = SIDE === "time";
// one shared login per side: people only type the password, the e-mail comes from the room they opened
const EMAIL = LOGINS[SIDE];
// a storage key per side, so the team can keep both rooms open in the same browser
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { storageKey: `sala-${SIDE}` } });
document.title = `${PROJECT.name} · ${TEAM ? "Produção" : "Aprovação"}`;
if (PROJECT.accent) document.documentElement.style.setProperty("--accent", PROJECT.accent);

const STATUS = { todo: "A fazer", doing: "Fazendo", ready: "Pronto" };
const TZ = PROJECT.timeZone || "America/Sao_Paulo";
// the client's name with its article, for "a Agência / da Agência / à Agência" (or "o / do / ao", or none)
const CL = PROJECT.client;
const ART = { a: ["a ", "da ", "à "], o: ["o ", "do ", "ao "] }[PROJECT.clientArticle] || ["", "de ", "a "];
const [A_CL, DA_CL, AO_CL] = ART.map((a) => a + CL);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const sceneLine = (n) => SCENES[n]?.line || "";
const lookOf = (n) => SCENES[n]?.look;
// One grade for the whole film (STYLE_BASE) with a small shift per scene (its look), so the options of a scene
// share it and the client compares worlds, not colors.
const lookPrompt = (n) => [STYLE_BASE, lookOf(n)?.prompt].filter(Boolean).join(", ");
// Ready-to-copy prompts for an item's A/B/C directions: the item stores only who or where (items.variants),
// the frame and the grade come from the templates in config.js ({v} = the direction, {light} = the scene's light).
function variantPrompt(it, k) {
  const v = it.variants?.[k];
  const tpl = PROMPTS?.[it.kind] || PROMPTS?.default;
  if (!v || !tpl) return "";
  const light = lookOf(it.scene)?.prompt?.replace(/, \d+mm[^,]*$/, ""); // the scene's lens is for its shots; an establishing shot is wide
  return tpl.replaceAll("{v}", v).replaceAll("{light}", light ? `${cap(light)}. ` : "");
}
const PREVIEW_MAX = 1920; // longest side of the JPEG shown on scene pages; the original stays for download
const THUMB_MAX = 480; // board, scene cards and file chips
const URL_TTL = 60 * 60 * 12;
const ICON = {
  grid: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="9" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="2.5" y="9" width="4.5" height="4.5" rx="1"/><rect x="9" y="9" width="4.5" height="4.5" rx="1"/></svg>',
  list: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M2.5 4h11M2.5 8h11M2.5 12h11" stroke-linecap="round"/></svg>',
  menu: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="2" y="3" width="12" height="10" rx="2"/><path d="M6 3v10" /></svg>',
  info: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M8 7.2v3.8" stroke-linecap="round"/><circle cx="8" cy="5" r="0.4" fill="currentColor"/></svg>',
  up: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M8 10.5V2.5M4.8 5.6 8 2.5l3.2 3.1M2.5 10v3.5h11V10" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  down: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M8 2.5v8M4.8 7.4 8 10.5l3.2-3.1M2.5 13.5h11" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  plus: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M8 3v10M3 8h10" stroke-linecap="round"/></svg>',
  send: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M14 2 2 6.8l5 2.2 2.2 5zM14 2 7 9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  prev: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M10 3.5 5.5 8l4.5 4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  next: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};
const PROMPT_ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3M3.6 3.6l2 2M10.4 10.4l2 2M3.6 12.4l2-2M10.4 5.6l2-2" stroke-linecap="round"/></svg>';
const CMP = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="2" y="3" width="5" height="10" rx="1"/><rect x="9" y="3" width="5" height="10" rx="1"/></svg>';
const CHAT = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" stroke-linejoin="round"/></svg>';

const $app = document.getElementById("app");
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};
const S = {
  session: null, rounds: [], items: [], options: [], comments: [], requests: [], files: [], reviews: [], sig: "",
  page: { kind: "round", round: null, scene: null, item: null }, pageKey: "",
  me: store.get(`sala-name-${SIDE}`), drawer: null, mode: {}, uploading: {}, lightbox: null, modal: null,
  navOpen: false, pending: false, flash: null, matFilter: "all",
  ov: { kind: "all", curate: false, dropped: true, view: store.get("sala-ov-view2") === "grid" ? "grid" : "hero" }, ovList: [], ovSel: {},
  more: null, dl: false, sheet: {}, wipe: {}, sideOff: store.get("sala-side-off") === "1", scenesOff: store.get("sala-scenes-off") === "1", infoOff: true,
  navPages: (() => { try { return JSON.parse(store.get("sala-nav-pages") || "{}"); } catch { return {}; } })(),
};

// ---------- helpers ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const two = (n) => String(n).padStart(2, "0");
const letter = (i) => String.fromCharCode(65 + i);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
const sceneName = (n) => SCENES[n]?.name || `Cena ${n}`;
const myName = () => (TEAM ? PEOPLE[S.me] || "Time" : S.me || CL);
const roundLabel = (r) => (r.code.startsWith("A") ? `Aprovação ${r.code.slice(1)}` : r.code);
function fmtDay(d) {
  const [y, m, dd] = d.split("-").map(Number);
  const wd = new Date(y, m - 1, dd).toLocaleDateString("pt-BR", { weekday: "long" }).replace("-feira", "");
  return `${wd}, ${two(dd)}/${two(m)}`;
}
const fmtShort = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
function fmtDeadline(ts) {
  const p = (o) => new Date(ts).toLocaleString("pt-BR", { ...o, timeZone: TZ });
  return `${p({ weekday: "short" }).replace(".", "")} ${p({ day: "2-digit", month: "2-digit" })}, ${+p({ hour: "2-digit", hour12: false })}h`;
}
const fmtTime = (ts) => new Date(ts).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: TZ }).replace(",", " ·");

let toastTimer;
function toast(msg, err = false) {
  let t = document.querySelector(".toast");
  if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.append(t); }
  t.textContent = msg;
  t.classList.toggle("err", err);
  t.style.opacity = 1;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.style.opacity = 0), err ? 5000 : 2200);
}
async function run(fn, ok) {
  try { await fn(); if (ok) toast(ok); }
  catch (e) {
    console.error(e);
    if (await sessionLost(e)) return;
    toast(`Não deu certo${e?.message ? `: ${e.message}` : ""}. Tente de novo.`, true); await refresh().catch(() => {});
  }
}
// a request refused for lack of login means the session ended (expired, or signed out elsewhere): ask for the password
// again instead of failing on every click
async function sessionLost(e) {
  if (!/jwt|token|401|42501|permission denied|row-level security/i.test(`${e?.message} ${e?.code}`)) return false;
  const { data } = await sb.auth.getSession();
  if (data.session && data.session.user.app_metadata?.side === SIDE) return false;
  S.session = null;
  loginPage("Sua sessão caiu. Entre de novo com a senha.");
  return true;
}

// ---------- data ----------
const itemOf = (id) => S.items.find((i) => i.id === id);
// The team's verdict on an option (option_reviews, team-only). A dropped option is hidden from the client by RLS,
// so the team sees it last and without a letter: the letters of the rest match what the client sees.
const REVIEW = { keep: "Manter", redo: "Refazer", drop: "Descartar" };
const reviewOf = (id) => S.reviews.find((r) => r.option_id === id);
const dropped = (o) => reviewOf(o.id)?.verdict === "drop";
const optsOf = (id) => {
  const list = S.options.filter((o) => o.item_id === id);
  return TEAM ? [...list.filter((o) => !dropped(o)), ...list.filter(dropped)] : list;
};
// the team's cards show the dropped options too (last, dimmed, "Descartada"), to decide with them on screen;
// the Descartadas toggle on Visão geral hides them everywhere
const shownOpts = (id) => optsOf(id).filter((o) => S.ov.dropped || !dropped(o));
const commentsOf = (id) => S.comments.filter((c) => c.item_id === id);
const filesOf = (id) => S.files.filter((f) => f.request_id === id);
const roundOf = (id) => S.rounds.find((r) => r.id === id);
const itemsOf = (rid) => S.items.filter((i) => i.round_id === rid)
  .sort((a, b) => a.scene - b.scene || a.sort - b.sort || a.created_at.localeCompare(b.created_at));
function scenesOf(rid) {
  const m = new Map();
  itemsOf(rid).forEach((i) => (m.get(i.scene) || m.set(i.scene, []).get(i.scene)).push(i));
  return [...m.entries()];
}

async function load(force = false) {
  const q = (t, col) => sb.from(t).select("*").order(col);
  const res = await Promise.all([q("rounds", "sort"), q("items", "sort"), q("options", "sort"), q("comments", "created_at"), q("requests", "sort"), q("request_files", "created_at"), ...(TEAM ? [q("option_reviews", "updated_at")] : [])]);
  const bad = res.find((r) => r.error);
  if (bad) throw bad.error;
  const sig = JSON.stringify(res.map((r) => r.data));
  if (!force && sig === S.sig) return false;
  const [rounds, items, options, comments, requests, files, reviews = []] = res.map((r) => r.data);
  Object.assign(S, { rounds, items, options, comments, requests, files, reviews, sig });
  return true;
}
async function refresh() { await load(true); await warm().catch(() => {}); resolvePage(); render(true); }
// The rounds are listed in config.js. The team room creates the missing ones in the database and keeps code, title,
// dates and order in step with the config; what the database adds (sent, confirmed) is never touched.
// A round removed from the config stays in the database (deleting it would delete its items).
async function syncRounds() {
  const same = (k, a, b) => (k === "reply_by" ? (a ? +new Date(a) : 0) === (b ? +new Date(b) : 0) : (a ?? "") === (b ?? ""));
  const want = ROUNDS.map((r, sort) => ({ id: r.id, code: r.code, title: r.title, due: r.due, intro: r.intro || "", reply_by: r.reply_by || null, sort }));
  const stale = want.filter((w) => { const have = roundOf(w.id); return !have || Object.keys(w).some((k) => !same(k, have[k], w[k])); });
  if (!stale.length) return false;
  const { error } = await sb.from("rounds").upsert(stale);
  if (error) { console.warn("rounds from config.js not saved", error); return false; }
  return true;
}
const clientRounds = () => S.rounds.filter((r) => S.items.some((i) => i.round_id === r.id));
const visibleRounds = () => (TEAM ? S.rounds : clientRounds());
function defaultRound() {
  if (TEAM) return (S.rounds.find((r) => r.due >= today()) || S.rounds.at(-1))?.id;
  return clientRounds().at(-1)?.id || null;
}

// ---------- routing: #/r/a1 · #/r/a1/visao · #/r/a1/s/7[/itemId] · #/materiais ----------
function resolvePage() {
  const h = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  let p;
  if (h[0] === "materiais") p = { kind: "materiais" };
  else if (h[0] === "r" && visibleRounds().some((r) => r.id === h[1])) {
    p = h[2] === "s" && h[3] !== undefined ? { kind: "scene", round: h[1], scene: +h[3], item: h[4] || null }
      : h[2] === "visao" && TEAM ? { kind: "overview", round: h[1] }
      : h[2] === "resumo" ? { kind: "review", round: h[1] } : { kind: "round", round: h[1] };
  } else {
    const r = defaultRound();
    p = r ? { kind: "round", round: r } : { kind: "materiais" };
  }
  if (p.kind === "scene" && !TEAM && !itemsOf(p.round).some((i) => i.scene === p.scene)) p = { kind: "round", round: p.round };
  S.page = p;
}
function onRoute() {
  resolvePage();
  // the team opens an item on its own (its own page); the client still scrolls to it on the scene and flashes it
  const key = `${S.page.kind}/${S.page.round}/${S.page.scene}${TEAM ? `/${S.page.item || ""}` : ""}`;
  const changed = key !== S.pageKey;
  S.pageKey = key;
  if (changed) { S.drawer = null; S.navOpen = false; }
  S.flash = TEAM ? null : S.page.item || null;
  render(true, changed);
  if (S.flash) {
    const el = document.getElementById(`item-${S.flash}`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    setTimeout(() => { S.flash = null; el?.classList.remove("flash"); }, 1600);
  }
}
const sceneHref = (rid, n, id) => `#/r/${rid}/s/${n}${id ? `/${id}` : ""}`;

// ---------- media ----------
const urls = new Map();
let urlsAt = Date.now();
async function sign(paths) {
  if (Date.now() - urlsAt > (URL_TTL * 1000) / 2) { urls.clear(); urlsAt = Date.now(); }
  const missing = [...new Set(paths.filter((p) => p && !urls.has(p)))];
  for (let i = 0; i < missing.length; i += 100) {
    const { data } = await sb.storage.from("media").createSignedUrls(missing.slice(i, i + 100), URL_TTL);
    (data || []).forEach((d) => d.signedUrl && urls.set(d.path, d.signedUrl));
  }
}
const warm = () => sign([
  ...S.options.flatMap((o) => (o.mime.startsWith("video/") ? [o.path] : [o.preview_path || o.path, o.thumb_path])),
  ...S.files.map((f) => f.thumb_path || f.preview_path || (f.mime.startsWith("image/") ? f.path : null)),
]);
async function hydrate() {
  const els = [...$app.querySelectorAll("[data-path]")];
  await sign(els.map((e) => e.dataset.path));
  els.forEach((e) => { const u = urls.get(e.dataset.path); if (u && e.getAttribute("src") !== u) e.src = u; });
  // vertical options (character views) get a taller frame instead of being cropped to 16:9
  $app.querySelectorAll(".frame img").forEach((img) => {
    const mark = () => {
      const f = img.closest(".frame");
      if (!f || !img.naturalWidth) return;
      f.style.setProperty("--ar", `${img.naturalWidth} / ${img.naturalHeight}`);
      if (img.naturalHeight > img.naturalWidth * 1.05) f.classList.add("tall");
    };
    if (img.complete && img.naturalWidth) mark(); else img.addEventListener("load", mark, { once: true });
  });
}
const srcAttr = (p) => (urls.has(p) ? ` src="${esc(urls.get(p))}"` : "");
// size: "thumb" for cards, "tile" for scene pages, "big" for the lightbox
function media(o, size = "tile") {
  if (o.mime.startsWith("video/")) {
    return `<video data-path="${esc(o.path)}" ${size === "big" ? "controls autoplay" : "muted loop"} playsinline preload="metadata"${srcAttr(o.path)}></video>`;
  }
  const p = (size === "thumb" && o.thumb_path) || o.preview_path || o.path;
  return `<img data-path="${esc(p)}" alt="${esc(o.caption || o.name)}" decoding="async"${srcAttr(p)}>`;
}

// ---------- uploads ----------
async function resized(file) {
  if (!/^image\/(jpeg|png|webp|avif|bmp|tiff)$/.test(file.type)) return null;
  const bmp = await createImageBitmap(file);
  const jpeg = (max, q) => {
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    const g = c.getContext("2d");
    g.fillStyle = "#0B0B0C"; // transparent PNGs get the room's background, not black
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(bmp, 0, 0, c.width, c.height);
    return new Promise((ok) => c.toBlob(ok, "image/jpeg", q));
  };
  const out = { preview: await jpeg(PREVIEW_MAX, 0.86), thumb: await jpeg(THUMB_MAX, 0.8) };
  bmp.close?.();
  return out;
}
async function putFile(prefix, file) {
  const id = crypto.randomUUID();
  const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
  const path = `${prefix}/${id}.${ext}`;
  const up = await sb.storage.from("media").upload(path, file, { contentType: file.type || "application/octet-stream" });
  if (up.error) throw up.error;
  let preview_path = null, thumb_path = null;
  const small = await resized(file).catch(() => null);
  if (small) {
    const put = async (blob, suffix) => {
      const pp = `${prefix}/${id}.${suffix}.jpg`;
      const r = blob && (await sb.storage.from("media").upload(pp, blob, { contentType: "image/jpeg" }));
      return r && !r.error ? pp : null;
    };
    preview_path = await put(small.preview, "preview");
    thumb_path = await put(small.thumb, "thumb");
  }
  return { path, preview_path, thumb_path, mime: file.type || "", name: file.name, size: file.size };
}
async function uploadMany(key, prefix, files, save) {
  let done = 0;
  for (const [n, f] of files.entries()) {
    S.uploading[key] = `Enviando ${n + 1} de ${files.length}…`;
    render(true);
    try { await save(await putFile(prefix, f)); done++; }
    catch (e) { console.error(e); toast(`${f.name}: ${e.message || "falhou"}`, true); }
  }
  delete S.uploading[key];
  await refresh();
  return done;
}
async function uploadOptions(itemId, list) {
  const files = [...list].filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
  if (!files.length) return toast("Só imagens ou vídeos.", true);
  const it = itemOf(itemId);
  const done = await uploadMany(itemId, `items/${itemId}`, files, async (m) => {
    const { error } = await sb.from("options").insert({ item_id: itemId, path: m.path, preview_path: m.preview_path, thumb_path: m.thumb_path, mime: m.mime, name: m.name, created_by: myName() });
    if (error) throw error;
  });
  if (done && it?.status === "todo") { await sb.from("items").update({ status: "doing" }).eq("id", itemId); await refresh(); }
  if (done) toast(done === 1 ? "Opção adicionada" : `${done} opções adicionadas`);
}
async function uploadRequest(reqId, list) {
  const files = [...list];
  if (!files.length) return;
  const done = await uploadMany(reqId, `requests/${reqId}`, files, async (m) => {
    const { error } = await sb.from("request_files").insert({ request_id: reqId, ...m, uploaded_by: myName(), side: SIDE });
    if (error) throw error;
  });
  if (done) toast(done === 1 ? "Arquivo enviado" : `${done} arquivos enviados`);
}
async function signed(path, name, download) {
  const { data, error } = await sb.storage.from("media").createSignedUrl(path, 3600, download ? { download: name || true } : undefined);
  if (error) throw error;
  return data.signedUrl;
}
async function openFile(path, name, download) {
  const w = window.open("", "_blank");
  try { const u = await signed(path, name, download); if (w) w.location = u; else location.href = u; }
  catch { w?.close(); toast("Não consegui abrir o arquivo.", true); }
}

// one .zip in the browser: [file, folder] pairs fetched through signed URLs
let jszip;
async function zipDownload(pairs, name) {
  if (!pairs.length) return;
  try {
    jszip ||= await new Promise((ok, fail) => {
      const s = Object.assign(document.createElement("script"), { src: "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js" });
      s.onload = () => ok(window.JSZip);
      s.onerror = fail;
      document.head.append(s);
    });
    const zip = new jszip();
    const used = new Set();
    const clean = (s) => s.replace(/[\\/:*?"<>|]+/g, "-").trim();
    for (const [n, [f, folder]] of pairs.entries()) {
      toast(`Preparando ${clean(name)}.zip: ${n + 1} de ${pairs.length}…`);
      let entry = (folder ? `${clean(folder)}/` : "") + clean(f.name);
      while (used.has(entry)) entry = entry.replace(/(\.[^.]*)?$/, (ext) => `-${n}${ext}`);
      used.add(entry);
      const res = await fetch(await signed(f.path, f.name, false));
      if (!res.ok) throw new Error(f.name);
      zip.file(entry, await res.blob());
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `${clean(name)}.zip` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    toast(`${clean(name)}.zip pronto`);
  } catch (e) {
    console.error(e);
    toast("Não consegui montar o .zip. Tente baixar os arquivos um a um.", true);
  }
}

// ---------- writes ----------
async function decide(id, option, decision, ok) {
  const it = itemOf(id);
  if (it) Object.assign(it, { chosen_option: option, decision, decided_by: myName(), decided_at: new Date().toISOString() });
  render(true);
  await run(async () => {
    const { error } = await sb.rpc("decide", { p_item: id, p_option: option ?? null, p_decision: decision, p_who: myName() });
    if (error) throw error;
    await refresh();
  }, ok);
}
async function patchItem(id, patch, ok) {
  const it = itemOf(id);
  if (it) Object.assign(it, patch);
  render(true);
  await run(async () => {
    const { error } = await sb.from("items").update(patch).eq("id", id);
    if (error) throw error;
    await refresh();
  }, ok);
}

// ---------- status words ----------
function stageOf(it) {
  if (it.visible && it.decision === "approved") return ["approved", "Aprovado"];
  if (it.visible && it.decision === "changes") return ["changes", "Ajuste pedido"];
  if (it.visible) return ["client", `Com ${A_CL}`];
  return [it.status, STATUS[it.status]];
}
function clientState(it) {
  const opts = optsOf(it.id);
  const ci = opts.findIndex((o) => o.id === it.chosen_option);
  const L = ci >= 0 && opts.length > 1 ? letter(ci) : "";
  if (it.mode === "set") return it.decision === "approved" ? ["approved", "Aprovado"] : it.decision === "changes" ? ["changes", "Ajuste pedido"] : ["", "Aguardando vocês"];
  if (it.decision === "approved") return ["approved", `Aprovado${L ? ` · ${L}` : ""}`];
  if (it.decision === "changes") return ["changes", "Ajuste pedido"];
  return ["", L ? `Escolhida: ${L}` : "Aguardando vocês"];
}
function sceneDot(list) {
  if (list.some((i) => i.decision === "changes")) return "warn";
  if (list.every((i) => i.decision === "approved")) return "ok";
  if (TEAM && list.every((i) => i.status === "ready" || i.visible)) return "client";
  return "";
}
function reqState(r) {
  if (r.done) return ["approved", "Recebido"];
  if (filesOf(r.id).length || r.note.trim()) return ["sent", "Enviado"];
  return ["", "Pendente"];
}

function saveReview(optionId, patch) {
  const cur = reviewOf(optionId) || {};
  run(async () => {
    const { error } = await sb.from("option_reviews").upsert({ option_id: optionId, verdict: cur.verdict ?? null, note: cur.note ?? "", ...patch, author: myName(), updated_at: new Date().toISOString() });
    if (error) throw error;
    await refresh();
  }, patch.verdict === "drop" ? `Descartada: ${A_CL} não vai ver esta opção` : undefined);
}

// ---------- render ----------
// Every render rebuilds the page. Text still being typed (marked dirty on input), the focused field and
// the scroll of each panel are carried over to the new elements by a stable key.
function keyOf(el) {
  const c = el.closest("[data-comment]");
  if (c) return `c:${c.dataset.comment}`;
  if (el.dataset.cap) return `cap:${el.dataset.cap}`;
  if (el.dataset.rv) return `rv:${el.dataset.rv}`;
  if (el.dataset.reason) return `reason:${el.dataset.reason}`;
  if (el.dataset.note) return `note:${el.dataset.note}`;
  if (el.dataset.field) return `f:${el.dataset.field}:${el.dataset.id}`;
  const form = el.closest("[data-form]");
  return form && el.name ? `${form.dataset.form}:${el.name}` : null;
}
function render(force = false, newPage = false) {
  const a = document.activeElement;
  const typing = a && $app.contains(a) && (a.tagName === "TEXTAREA" || (a.tagName === "INPUT" && a.type !== "file"));
  if (!force && (typing || S.lightbox || S.modal)) { S.pending = true; return; }
  S.pending = false;
  if (!S.session) return;
  const focusKey = a && $app.contains(a) ? keyOf(a) : null;
  const caret = focusKey && typeof a.selectionStart === "number" ? [a.selectionStart, a.selectionEnd] : null;
  const dirty = {};
  $app.querySelectorAll("[data-dirty]").forEach((el) => { const k = keyOf(el); if (k) dirty[k] = el.value; });
  const scroll = {};
  $app.querySelectorAll("[data-keep]").forEach((el) => (scroll[el.dataset.keep] = el.scrollTop));
  // loaded images, videos and audio are moved into the new page instead of being decoded again (no blink)
  const mediaKey = (el) => `${el.tagName}${el.hasAttribute("controls") ? "+" : ""}${el.dataset.path}`;
  const kept = new Map();
  $app.querySelectorAll("img[data-path], video[data-path], audio[data-path]").forEach((el) => {
    if (el.tagName === "IMG" && !(el.complete && el.naturalWidth)) return;
    const k = mediaKey(el);
    (kept.get(k) || kept.set(k, []).get(k)).push(el);
  });

  $app.innerHTML = `<div class="shell ${S.sideOff ? "side-off" : ""}">${sidebar()}<div class="main">${mobileBar()}${page()}${S.drawer ? drawer() : ""}</div></div>${S.navOpen ? '<div class="scrim" data-act="nav"></div>' : ""}${S.lightbox ? lightbox() : ""}${S.modal ? modal() : ""}`;

  $app.querySelectorAll("img[data-path], video[data-path], audio[data-path]").forEach((el) => {
    const old = kept.get(mediaKey(el))?.shift();
    if (!old) return;
    old.className = el.className;
    if (el.alt !== undefined) old.alt = el.alt;
    el.replaceWith(old);
  });
  $app.querySelectorAll("[data-keep]").forEach((el) => {
    const k = el.dataset.keep;
    if (k in scroll && !(newPage && k === "main")) el.scrollTop = scroll[k];
  });
  $app.querySelectorAll("input, textarea, select").forEach((el) => {
    const k = keyOf(el);
    if (!k) return;
    if (k in dirty) { el.value = dirty[k]; el.dataset.dirty = "1"; }
    if (k === focusKey) { el.focus({ preventScroll: true }); if (caret) try { el.setSelectionRange(...caret); } catch {} }
  });
  $app.querySelectorAll("textarea.brief").forEach(fit);
  $app.querySelectorAll(".tfit > input").forEach(fitTitle);
  hydrate();
}
function fit(t) { t.style.height = "auto"; t.style.height = `${t.scrollHeight}px`; }
const val = (f, n) => (f.elements.namedItem(n)?.value ?? "").trim();
function clearForm(f) { f.reset(); f.querySelectorAll("[data-dirty]").forEach((x) => delete x.dataset.dirty); }

function sidebar() {
  const rid = S.page.round || defaultRound();
  const r = roundOf(rid);
  const scenes = r ? scenesOf(r.id) : [];
  const pending = S.requests.filter((x) => !reqState(x)[0]).length;
  const newFiles = TEAM ? S.requests.filter((x) => reqState(x)[0] === "sent").length : pending;
  return `<aside class="side ${S.navOpen ? "open" : ""}">
    <div class="side-top">${sideToggle()}<a class="logo" href="#/">${esc(PROJECT.logo)}</a><p class="room">${TEAM ? "Sala de produção" : "Sala de aprovação"}</p></div>
    <nav class="side-scroll" data-keep="side" aria-label="Navegação">
      ${visibleRounds().length ? `<div class="rtabs">${visibleRounds().map((x) => `<a class="${x.id === rid ? "on" : ""}" href="#/r/${x.id}" title="${esc(x.title)} · até ${fmtShort(x.due)}">${esc(x.code)}</a>`).join("")}</div>` : ""}
      ${r ? `<p class="side-label">${esc(r.title)} · ${fmtShort(r.due)}</p>
        ${TEAM ? `<a class="nav ${S.page.kind === "round" ? "on" : ""}" href="#/r/${r.id}"><span class="ico">${ICON.grid}</span>Quem faz o quê</a>` : ""}
        ${navGroup(r, scenes)}
        <a class="nav ${S.page.kind === "review" ? "on" : ""}" href="#/r/${r.id}/resumo"><span class="ico">${ICO.keep}</span>${TEAM ? `Resumo ${DA_CL}` : "Resumo e confirmação"}${r.confirmed_at ? '<i class="dot ok"></i>' : ""}</a>`
        : S.rounds[0] ? `<p class="side-note">As opções da ${roundLabel(S.rounds[0])} · ${esc(S.rounds[0].title)} entram aqui até ${fmtDay(S.rounds[0].due)}.</p>` : ""}
      <p class="side-label">Materiais</p>
      <a class="nav ${S.page.kind === "materiais" ? "on" : ""}" href="#/materiais"><span class="ico">${ICON.up}</span>${TEAM ? `Materiais ${DA_CL}` : "O que precisamos"}${newFiles ? `<b class="badge">${newFiles}</b>` : ""}</a>
    </nav>
    <div class="side-foot">
      <button class="link me" data-act="whoami" title="Trocar nome">${esc(TEAM ? PEOPLE[S.me] || "Quem é você?" : S.me || "Seu nome")}</button>
      ${TEAM ? `<a class="link" href="../aprovacao/" target="_blank" rel="noopener">Sala ${DA_CL} ↗</a>` : ""}
      <button class="link" data-act="logout">Sair</button>
    </div>
  </aside>`;
}
// the scenes are children of the overview (client: of the presentation); the group folds, the open scene always shows
function navGroup(r, scenes) {
  const onScene = (n) => S.page.kind === "scene" && S.page.round === r.id && S.page.scene === n;
  const parentOn = TEAM ? S.page.kind === "overview" : S.page.kind === "round";
  const kids = scenes.filter(([n]) => !S.scenesOff || onScene(n));
  return `<div class="nav-group">
    <div class="nav-parent"><a class="nav ${parentOn ? "on" : ""}" href="#/r/${r.id}${TEAM ? "/visao" : ""}"><span class="ico">${TEAM ? ICON.list : ICON.grid}</span>${TEAM ? "Visão geral" : "Apresentação"}</a>
      ${scenes.length ? `<button class="nav-fold ${S.scenesOff ? "" : "open"}" data-act="fold" aria-expanded="${!S.scenesOff}" title="${S.scenesOff ? "Mostrar" : "Esconder"} as cenas" aria-label="${S.scenesOff ? "Mostrar" : "Esconder"} as cenas"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M6 4l4 4-4 4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>` : ""}</div>
    ${kids.length ? `<div class="nav-kids">${kids.map(([n, list]) => {
      const row = `<a class="nav ${onScene(n) ? (S.page.item && TEAM ? "in" : "on") : ""}" href="${sceneHref(r.id, n)}"><span class="num">${two(n)}</span>${esc(sceneName(n))}<i class="dot ${sceneDot(list)}"></i></a>`;
      if (!TEAM) return row;
      const open = pageOpen(n, onScene(n));
      return `<div class="nav-parent">${row}${foldButton("fold-page", open, "os itens", n)}</div>${open ? navItems(r, n, list) : ""}`;
    }).join("")}</div>` : ""}
  </div>`;
}
// each scene folds its list of items on its own, like Visão geral folds the scenes; by default only the open scene is unfolded
const pageOpen = (n, current) => S.navPages[n] ?? current;
const foldButton = (act, open, what, v = "") => `<button class="nav-fold ${open ? "open" : ""}" data-act="${act}" data-v="${v}" aria-expanded="${open}" title="${open ? "Esconder" : "Mostrar"} ${what}" aria-label="${open ? "Esconder" : "Mostrar"} ${what}"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M6 4l4 4-4 4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;
// the open scene lists its items (team): a click shows that item alone, the scene row goes back to all of them
function navItems(r, n, list) {
  return `<div class="nav-items">${list.map((it) => {
    const [cls, label] = stageOf(it);
    return `<a class="nav nav-item ${S.page.item === it.id ? "on" : ""}" href="${sceneHref(r.id, n, it.id)}" title="${esc(it.title)} · ${label}"><i class="ovx-dot ${cls}"></i><span>${esc(it.title)}</span></a>`;
  }).join("")}</div>`;
}
const mobileBar = () => `<div class="mobile-bar"><span class="logo">${esc(PROJECT.logo)}</span><button class="btn small" data-act="nav">Menu</button></div>`;
// the menu icon lives in the sidebar while it is open, and at the start of the page head once it is hidden
const sideToggle = () => `<button class="side-toggle" data-act="side" aria-pressed="${!S.sideOff}" title="${S.sideOff ? "Mostrar o menu" : "Esconder o menu"}" aria-label="${S.sideOff ? "Mostrar o menu" : "Esconder o menu"}">${ICON.menu}</button>`;
const head = (title, sub, right, eyebrow = "") => `<header class="main-head">${S.sideOff ? sideToggle() : ""}<div class="mh-title">${eyebrow ? `<p class="eyebrow">${eyebrow}</p>` : ""}<h1>${title}</h1>${sub ? `<p>${sub}</p>` : ""}</div><div class="mh-right">${right}</div></header>`;
const progress = (a, b, label) => `<div class="progress"><div class="bar"><i style="width:${pct(a, b)}%"></i></div><span>${label}</span></div>`;

function page() {
  const p = S.page;
  if (p.kind === "materiais") return materialsPage();
  const r = roundOf(p.round);
  if (!r) return head("Em breve", "", "") + `<div class="main-body"></div>`;
  if (p.kind === "scene") return scenePage(r, p.scene);
  if (p.kind === "overview") return overviewPage(r);
  if (p.kind === "review") return reviewPage(r);
  return TEAM ? boardPage(r) : summaryPage(r);
}

// the page head's actions are round icon buttons with tooltips; a disabled one keeps its tooltip on a wrapper
// (a disabled .btn takes no pointer events)
function sendButton(r) {
  const n = itemsOf(r.id).filter(sendable).length;
  const label = n ? `Enviar ${plural(n, "item", "itens")} para ${A_CL}` : "Nada pronto para enviar";
  return `<span class="hico-tip" title="${label}&#10;Mostra para ${A_CL} os itens marcados como Pronto: só as opções com ✓ quando o item tem alguma, senão todas menos as descartadas"><button class="btn primary hico" data-act="send" ${n ? "" : "disabled"} aria-label="${label}">${ICON.send}${n ? `<b class="badge">${n}</b>` : ""}</button></span>`;
}
const addButton = (n) => `<button class="btn hico" data-act="add-item" ${n === undefined ? "" : `data-scene="${n}"`} title="Novo item" aria-label="Novo item">${ICON.plus}</button>`;
// ⤓ downloads what the page shows: the whole round on its round pages, the scene's items on a scene, the item on its own
function dlScope() {
  const p = S.page, r = roundOf(p.round);
  if (p.kind === "scene") {
    const items = itemsOf(r.id).filter((x) => x.scene === p.scene);
    const it = TEAM && p.item && items.find((x) => x.id === p.item);
    if (it) return { items: [it], label: esc(it.title), zip: `${r.code} ${it.title}` };
    return { items, label: `${esc(sceneName(p.scene))} · ${plural(items.length, "item", "itens")}`, zip: `${r.code} ${sceneName(p.scene)}` };
  }
  const items = itemsOf(r.id);
  return { items, label: `a rodada ${esc(r.code)} · ${plural(items.length, "item", "itens")}`, zip: `${r.code} ${r.title}`, folders: true };
}
// "só aprovadas": what the client approved or picked (the chosen option; the whole set, or the only option, once
// approved) and, for the team, what it checked (✓); never a dropped option
function approvedOpts(it) {
  const opts = optsOf(it.id).filter((o) => !dropped(o));
  const whole = it.decision === "approved" && (it.mode === "set" || opts.length === 1);
  return opts.filter((o) => whole || (o.id === it.chosen_option && it.decision !== "changes") || (TEAM && reviewOf(o.id)?.verdict === "keep"));
}
// the originals, named like 01_Cozinha_A.jpg (the letter the client sees), one folder per scene for a round
const slug = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
function dlFiles(s, approved) {
  return s.items.flatMap((it) => {
    const all = optsOf(it.id);
    return (approved ? approvedOpts(it) : TEAM ? shownOpts(it.id) : all).map((o) => {
      const i = all.indexOf(o);
      const lab = dropped(o) ? "descartada" : it.mode === "set" ? String(i + 1).padStart(2, "0") : letter(i);
      const ext = /\.[a-z0-9]+$/i.exec(o.name || o.path)?.[0] || "";
      return [{ name: `${two(it.scene)}_${slug(it.title)}_${lab}${ext}`, path: o.path }, s.folders ? `${two(it.scene)} ${sceneName(it.scene)}` : ""];
    });
  });
}
function dlButton() {
  const s = dlScope();
  const pop = S.dl ? `<div class="dl-pop" role="menu"><p class="dl-head">Baixar ${s.label}</p>
    ${[["all", "Tudo"], ["ok", TEAM ? "Só aprovadas" : "Só o que aprovamos"]].map(([v, t]) => { const k = dlFiles(s, v === "ok").length; return `<button class="dl-item" role="menuitem" data-act="dl-zip" data-v="${v}" ${k ? "" : "disabled"}>${t}<small>${plural(k, "arquivo", "arquivos")}</small></button>`; }).join("")}
  </div>` : "";
  return `<div class="dl"><button class="btn hico ${S.dl ? "on" : ""}" data-act="dl" title="Baixar ${s.label}" aria-label="Baixar ${s.label}" aria-haspopup="menu" aria-expanded="${!!S.dl}">${ICON.down}</button>${pop}</div>`;
}
const sendable = (i) => i.status === "ready" && !i.visible && optsOf(i.id).length > 0;

// team: who does what
function boardPage(r) {
  const all = itemsOf(r.id);
  const ready = all.filter((i) => i.status === "ready" || i.visible).length;
  const withClient = all.filter((i) => i.visible).length;
  const approved = all.filter((i) => i.decision === "approved").length;
  const keys = [...Object.keys(PEOPLE), ...(all.some((i) => !i.assignee) ? [""] : [])];
  const cols = keys.map((k) => {
    const list = all.filter((i) => (i.assignee || "") === k);
    const done = list.filter((i) => i.status === "ready" || i.visible).length;
    return `<section class="col" data-col="${k}">
      <header class="col-head"><div class="row"><b>${k ? PEOPLE[k] : "Sem dono"}</b><span>${done} de ${list.length} prontos</span></div><i class="meter"><i style="width:${pct(done, list.length)}%"></i></i></header>
      <div class="col-body" data-keep="col-${k}">${list.map(boardCard).join("") || '<p class="col-empty">Arraste itens para cá</p>'}</div>
    </section>`;
  }).join("");
  return head(esc(r.title), `Até ${fmtDay(r.due)}${r.sent_at ? ` · enviada ${fmtTime(r.sent_at)}` : ""}${r.confirmed_at ? ` · <b class="ok">${esc(CL)} confirmou ${fmtTime(r.confirmed_at)}</b>` : ""}`,
    `${progress(ready, all.length, `${ready} de ${all.length} prontos · ${withClient} com ${A_CL} · ${approved} aprovados`)}${addButton()}${dlButton()}${sendButton(r)}`, esc(r.code)) +
    `<div class="main-body fill">${all.length ? `<div class="board" style="--cols:${keys.length}">${cols}</div>` : '<p class="empty">Nenhum item nesta rodada ainda. Use o + (Novo item), no alto, para começar.</p>'}</div>`;
}
// how many options each person proposed for an item, most first
function authorsOf(opts) {
  const m = new Map();
  opts.forEach((o) => o.created_by && m.set(o.created_by, (m.get(o.created_by) || 0) + 1));
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
// team overview: every scene with its options as large tiles, to curate without leaving the page.
// Hover a tile to view, download or give the team verdict; click it for the modal with the scene's reasoning,
// the prompt and Compare. Everything writes to the same rows the scene pages read.
const ICO = {
  copy: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5V3.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" stroke-linecap="round"/></svg>',
  open: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M9 3h4v4M13 3 7.5 8.5M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  view: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5l-4.5 4.5M2.5 13.5 7 9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  down: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M8 2.5v8M4.8 7.6 8 10.8l3.2-3.2M2.5 13.5h11" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  keep: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  redo: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M12.8 6.5A5 5 0 1 0 13 9.6M13 2.8v3.7H9.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  drop: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke-linecap="round"/></svg>',
  trash: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  funnel: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M2.5 3.5h11L9.5 8.5v4l-3 1v-5z" stroke-linejoin="round"/></svg>',
  note: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 3.5h10v7H8l-3 2.5v-2.5H3z" stroke-linejoin="round"/></svg>',
};
// what the client will see: once the team checks (Manter) any option of an item, only the checked ones go; otherwise everything not dropped
const keptOf = (it) => {
  const live = optsOf(it.id).filter((o) => !dropped(o));
  const checked = live.filter((o) => reviewOf(o.id)?.verdict === "keep");
  return checked.length ? checked : live;
};
const toCurate = (it) => it.mode !== "set" && keptOf(it).length > 3;
// one option as an image with its letter, author and verdict, plus the hover actions: overview cards, contact sheets and scene tiles
function optFace(it, o, { size, by = false, act = "ov-open", del = false, chip = "" } = {}) {
  const i = optsOf(it.id).indexOf(o);
  const rv = reviewOf(o.id) || {};
  const lab = dropped(o) ? "–" : it.mode === "set" ? "" : letter(i);
  const who = by && o.created_by ? `<small>${esc(o.created_by.split(" ")[0])}</small>` : "";
  return `<button class="hero-img" data-act="${act}" data-id="${it.id}" data-i="${i}" aria-label="Abrir ${esc(it.title)} ${lab}">${media(o, size)}</button>
    ${(() => {
      const tagEl = lab || who || chip ? `<span class="hero-lab">${chip}${lab}${who}</span>` : "";
      const mark = rv.verdict && rv.verdict !== "drop" ? `<span class="hero-mark ${rv.verdict}" title="${REVIEW[rv.verdict]}${rv.note ? `: ${esc(rv.note)}` : ""}">${ICO[rv.verdict]}</span>` : "";
      return chip ? `<span class="hero-tags">${tagEl}${mark}${rv.verdict === "drop" ? DROP_TAG : ""}${curateTag(it)}${talkTag(it)}</span>` : tagEl + mark;
    })()}
    <div class="hero-acts">
      ${Object.keys(REVIEW).map((v) => `<button class="rv ${rv.verdict === v ? "on" : ""}" data-act="review" data-id="${o.id}" data-v="${v}" title="${REVIEW[v]}${v === "drop" ? ` (${A_CL} não vê)` : ""}">${ICO[v]}</button>`).join("")}
      <span class="sep"></span>
      <button data-act="${act}" data-id="${it.id}" data-i="${i}" title="Ver grande, com o porquê e o prompt">${ICO.view}</button>
      <button data-act="download" data-id="${o.id}" title="Baixar original">${ICO.down}</button>
      ${del ? `<button data-act="opt-del" data-id="${o.id}" title="Excluir a opção">${ICO.trash}</button>` : ""}
    </div>`;
}
// a contact-sheet cell: the face at thumbnail size, framed by the team's verdict
const sheetTile = (it, o, opt = {}) => {
  const verdict = reviewOf(o.id)?.verdict;
  return `<div class="hero csh-tile ${verdict ? `rv-${verdict}` : ""} ${o.id === it.chosen_option ? "chosen" : ""}">${optFace(it, o, { size: "thumb", by: true, ...opt })}</div>`;
};
// an item's big image, as on the overview: the shown option (picked with the arrows, else the kept one, else the first), dots and hover actions
function heroOf(it, opts, { act = "ov-open", del = false } = {}) {
  let k = opts.findIndex((o) => o.id === S.ovSel[it.id]);
  if (k < 0) k = Math.max(0, opts.findIndex((o) => reviewOf(o.id)?.verdict === "keep"));
  const o = opts[k], i = optsOf(it.id).indexOf(o);
  const lab = dropped(o) ? "–" : it.mode === "set" ? "" : letter(i);
  return {
    verdict: reviewOf(o.id)?.verdict,
    pos: `${lab ? `${lab} · ` : ""}${k + 1}/${opts.length}`,
    html: `<div class="hero">
        ${optFace(it, o, { act, del, chip: typeChip(it) })}
        ${opts.length > 1 ? `<button class="hero-nav prev" data-act="ov-cycle" data-id="${it.id}" data-v="-1" aria-label="Variação anterior">‹</button><button class="hero-nav next" data-act="ov-cycle" data-id="${it.id}" data-v="1" aria-label="Próxima variação">›</button>
          <div class="hero-dots">${opts.map((x, j) => `<i class="${j === k ? "on" : ""} ${dropped(x) ? "dropped" : reviewOf(x.id)?.verdict || ""}"></i>`).join("")}</div>` : ""}
      </div>`,
  };
}
// what kind of item this is, read from what it holds: a before/after comparison (see pairsOf), renders of a 3D
// blocking (model "Blender…"), camera angles (kind "plano") or AI generations; a small icon in the corner tag
const TYPE_ICON = {
  compare: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M2.8 3.8H8v8.4H2.8z" fill="currentColor" stroke="none" opacity=".45"/><path d="M8 1.8v12.4"/></svg>',
  blocking: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2 1.6" aria-hidden="true"><path d="M8 1.8 13.5 5v6L8 14.2 2.5 11V5zM2.5 5 8 8.2 13.5 5M8 8.2v6" stroke-linejoin="round"/></svg>',
  angles: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="1.8" y="4.5" width="9" height="7" rx="1.2"/><path d="M10.8 7.2 14.2 5.4v5.2L10.8 8.8" stroke-linejoin="round"/></svg>',
  ai: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M8 1.8 9.5 6.5 14.2 8 9.5 9.5 8 14.2 6.5 9.5 1.8 8 6.5 6.5z" stroke-linejoin="round"/></svg>',
};
function typeOf(it) {
  const opts = optsOf(it.id);
  const pairs = pairsOf(opts);
  if (pairs.length) return ["compare", pairs.some((p) => p.light) ? "Comparação sem × com" : "Comparação blocking × IA"];
  if (opts.length && opts.filter((o) => (o.model || "").startsWith("Blender")).length * 2 > opts.length) return ["blocking", "Renders do blocking 3D"];
  if (it.kind === "plano") return ["angles", "Variações de ângulo"];
  return ["ai", opts.length > 1 ? "Variações geradas com IA" : "Geração de IA"];
}
const typeBadge = (it) => { const [k, label] = typeOf(it); return `<i class="tbadge ${k}" title="${label}" aria-label="${label}">${TYPE_ICON[k]}</i>`; };
// the same icon, in the item's corner tag on the image (where the option letter is)
const typeChip = (it) => { const [k, label] = typeOf(it); const t = `${KINDS[it.kind] ? `${KINDS[it.kind]} · ` : ""}${label}`; return `<i class="tico ${k}" title="${t}" aria-label="${t}">${TYPE_ICON[k]}</i>`; };
const curateTag = (it) => (toCurate(it) ? '<b class="hero-warn" title="Curar até 3 antes de enviar">→ 3</b>' : "");
const DROP_TAG = `<b class="hero-drop" title="Descartada: ${A_CL} não vê">${ICO.drop}Descartada</b>`;
// the item's signals stay on the image at all times (top left); its tools live in the bar that shows on hover
const talkTag = (it) => { const n = commentsOf(it.id).length; return n ? `<b class="hero-talk" title="${plural(n, "comentário", "comentários")}">${CHAT}${n}</b>` : ""; };
// before/after pairs: options named "<chave>__blocking.*" and "<chave>__ia.*" show as one image with a hover wipe
// (blocking left of the line, the AI result right of it; the line follows the mouse); arrows and dots step through pairs.
// "<chave>__sem.*" / "<chave>__com.*" is the same wipe for a look change on one plate (without / with sun), labelled by the captions.
function pairsOf(opts) {
  const m = new Map();
  for (const o of opts) {
    const r = /^(.*)__(blocking|ia|sem|com)\.[a-z0-9]+$/i.exec(o.name || "");
    if (!r) continue;
    const p = m.get(r[1]) || m.set(r[1], {}).get(r[1]);
    const side = r[2].toLowerCase();
    if (side === "sem" || side === "com") p.light = true;
    p[side === "sem" ? "blocking" : side === "com" ? "ia" : side] = o;
  }
  return [...m.values()].filter((p) => p.blocking && p.ia).map((p) => Object.assign(p, p.light
    ? { l: p.blocking.caption || "Sem", r: p.ia.caption || "Com" }
    : { l: "Blocking 3D", r: "IA" })).sort((a, b) => dropped(a.ia) - dropped(b.ia)); // a dropped result goes last
}
function wipeHero(it, pairs) {
  const k = Math.min(S.wipe[it.id] || 0, pairs.length - 1), p = pairs[k];
  const rv = reviewOf(p.ia.id) || {};
  return `<div class="hero wipe ${rv.verdict === "drop" ? "rv-drop" : ""}" data-wipe data-act="wipe-open" data-id="${it.id}" title="Clique para ver grande">
      <div class="wipe-ia">${media(p.ia, "big")}</div>
      <div class="wipe-blk">${media(p.blocking, "big")}</div>
      <i class="wipe-line" aria-hidden="true"></i>
      <span class="wipe-lab l">${esc(p.l)}</span><span class="wipe-lab r">${esc(p.r)}</span>
      <span class="hero-tags"><span class="hero-lab">${typeChip(it)}${k + 1}/${pairs.length}</span>${rv.verdict === "drop" ? DROP_TAG : rv.verdict ? `<span class="hero-mark ${rv.verdict}" title="${REVIEW[rv.verdict]}">${ICO[rv.verdict]}</span>` : ""}${talkTag(it)}</span>
      <div class="hero-acts">
        ${Object.keys(REVIEW).map((v) => `<button class="rv ${rv.verdict === v ? "on" : ""}" data-act="review" data-id="${p.ia.id}" data-v="${v}" title="${REVIEW[v]} (o resultado da IA)">${ICO[v]}</button>`).join("")}
        <span class="sep"></span>
        <button data-act="wipe-open" data-id="${it.id}" title="Ver grande, com as informações">${ICO.view}</button>
        <button data-act="download" data-id="${p.ia.id}" title="Baixar o resultado">${ICO.down}</button>
      </div>
      ${pairs.length > 1 ? `<button class="hero-nav prev" data-act="wipe-step" data-id="${it.id}" data-v="-1" aria-label="Par anterior">‹</button><button class="hero-nav next" data-act="wipe-step" data-id="${it.id}" data-v="1" aria-label="Próximo par">›</button>
        <div class="hero-dots">${pairs.map((x, j) => `<i class="${j === k ? "on" : ""} ${dropped(x.ia) ? "dropped" : ""}"></i>`).join("")}</div>` : ""}
    </div>`;
}
// a scene reads the same everywhere: the first main kind (casting) on the left, the rest (location…) on the right
function splitCols(items, fn) {
  const left = items.filter((x) => x.kind === MAIN_KINDS[0]), right = items.filter((x) => x.kind !== MAIN_KINDS[0]);
  if (!left.length || !right.length) return `<div class="scols flow">${items.map(fn).join("")}</div>`;
  return `<div class="scols"><div class="scol">${left.map(fn).join("")}</div><div class="scol">${right.map(fn).join("")}</div></div>`;
}
function overviewPage(r) {
  const f = S.ov;
  const all = itemsOf(r.id);
  const shown = (it) => (f.kind === "all" || it.kind === f.kind || !MAIN_KINDS.includes(it.kind)) && (!f.curate || toCurate(it) || !keptOf(it).length);
  const droppedCount = all.reduce((a, it) => a + optsOf(it.id).filter(dropped).length, 0);
  const curate = all.filter(toCurate).length;
  const images = all.reduce((a, it) => a + keptOf(it).length, 0);
  const ready = all.filter((i) => i.status === "ready" || i.visible).length;
  const owed = S.requests.filter((q) => !q.done && (!filesOf(q.id).length && !q.note.trim() || /falta/i.test(q.note || ""))).length;
  S.ovList = [];
  const itemLine = (it, right, full = true) => {
    const [cls, label] = stageOf(it);
    if (!full) return `<span class="t"><i class="ovx-dot ${cls}" title="${label}"></i>${esc(it.title)}</span>`;
    return `<span class="t"><i class="ovx-dot ${cls}" title="${label}"></i>${typeBadge(it)}<small>${KINDS[it.kind] || ""}</small>${esc(it.title)}</span><span class="pos">${right}${toCurate(it) ? ' <b class="warn" title="Curar até 3 antes de enviar">→ 3</b>' : ""}</span>`;
  };
  const visibleOpts = (it) => {
    const opts = shownOpts(it.id);
    opts.forEach((o) => S.ovList.push({ id: it.id, i: optsOf(it.id).indexOf(o) }));
    return opts;
  };
  const empty = (it) => `<a class="hero hero-empty" href="${sceneHref(r.id, it.scene, it.id)}">Sem opção ainda</a>`;
  // "Uma por item": one large image at a time (the kept one, else the first); hover to flip through the rest
  const card = (it) => {
    const opts = visibleOpts(it);
    if (!opts.length) return `<article class="hcard">${empty(it)}<footer class="hcard-foot">${itemLine(it, "")}</footer></article>`;
    const h = heroOf(it, opts);
    return `<article class="hcard ${h.verdict ? `rv-${h.verdict}` : ""}">
      ${h.html}
      <footer class="hcard-foot">${itemLine(it, "", false)}</footer>
    </article>`;
  };
  // "Grade": every option of the item at once, like a contact sheet, to judge range and variety at a glance
  const sheet = (it) => {
    const opts = visibleOpts(it);
    return `<article class="csh">
      <header class="hcard-foot csh-head">${itemLine(it, opts.length ? plural(opts.length, "opção", "opções") : "")}</header>
      ${opts.length ? `<div class="csh-grid">${opts.map((o) => sheetTile(it, o)).join("")}</div>` : `<div class="csh-grid">${empty(it)}</div>`}
    </article>`;
  };
  const sections = scenesOf(r.id).map(([n, list]) => {
    const items = list.filter(shown);
    if (!items.length) return "";
    return `<section class="hscene">
      <a class="hscene-head" href="${sceneHref(r.id, n)}"><span class="num">${two(n)}</span><b>${esc(sceneName(n))}</b>${sceneLine(n) ? `<span class="line">“${esc(sceneLine(n))}”</span>` : ""}</a>
      ${f.view === "hero" ? `<div class="hgrid">${items.map(card).join("")}</div>` : splitCols(items, sheet)}
    </section>`;
  }).join("");
  const sub = [plural(all.length, "item", "itens"), `${images} imagens`, `${ready} prontos`].join(" · ") +
    (r.confirmed_at ? ` · <b class="ok">${esc(CL)} confirmou ${fmtTime(r.confirmed_at)}</b>` : "") +
    (owed ? ` · <a class="owed" href="#/materiais">${plural(owed, "material pendente", "materiais pendentes")} ${DA_CL}</a>` : "");
  const bar = `<div class="ov-bar">
    <div class="seg" role="group" aria-label="Mostrar">${Object.entries({ all: "Tudo", ...Object.fromEntries(MAIN_KINDS.map((k) => [k, KINDS[k]])) }).map(([k, n]) => `<button data-act="ov-kind" data-v="${k}" class="${f.kind === k ? "on" : ""}" aria-pressed="${f.kind === k}">${n}</button>`).join("")}</div>
    <div class="seg seg-ico" role="group" aria-label="Como ver">${[["hero", ICON.list, "Uma por item"], ["grid", ICON.grid, "Grade"]].map(([k, ico, n]) => `<button data-act="ov-view" data-v="${k}" class="${f.view === k ? "on" : ""}" aria-pressed="${f.view === k}" title="${k === "grid" ? "Todas as opções de cada item lado a lado" : "Uma imagem grande por item"}">${ico}${n}</button>`).join("")}</div>
    <span class="grow"></span>
    <button class="icon-toggle ${f.curate ? "on" : ""}" data-act="ov-curate" aria-pressed="${f.curate}" title="Só os itens com mais de 3 opções ou sem nenhuma">${ICO.funnel}A curar <b>${curate}</b></button>
    <button class="icon-toggle ${f.dropped ? "on" : ""}" data-act="ov-dropped" aria-pressed="${f.dropped}" title="${f.dropped ? "Esconder" : "Mostrar"} as descartadas em todos os itens (${A_CL} não vê)">${ICO.drop}Descartadas <b>${droppedCount}</b></button>
  </div>`;
  return head("Visão geral", sub, dlButton() + sendButton(r), `${esc(r.code)} · ${esc(r.title)}`) +
    `<div class="main-body ov-body" data-keep="main">${bar}${sections || '<p class="empty">Nada com esse filtro.</p>'}</div>`;
}
function boardCard(it) {
  const o = optsOf(it.id)[0];
  const authors = authorsOf(optsOf(it.id));
  const [cls, label] = stageOf(it);
  const n = commentsOf(it.id).length;
  return `<a class="bcard" href="${sceneHref(it.round_id, it.scene, it.id)}" draggable="true" data-card="${it.id}" title="Clique para abrir · arraste para outra pessoa">
    <div class="bthumb">${o ? media(o, "thumb") : "sem opção"}</div>
    <div class="bbody"><p class="meta"><span class="num">${two(it.scene)}</span> ${esc(sceneName(it.scene))} · ${KINDS[it.kind] || ""}</p><p class="t">${esc(it.title)}</p>
      ${authors.length > 1 ? `<p class="meta">Propostas de ${authors.map(([n]) => esc(n)).join(" e ")}</p>` : ""}
      <span class="state ${cls}">${label}${n ? ` · ${n} coment.` : ""}</span></div>
  </a>`;
}

// client: round summary
// client: the round opens like a deck cover (what we ask, how, until when) above every scene at a glance
function sceneTable(r, cell) {
  const cols = MAIN_KINDS.map((k) => [k, KINDS[k]]);
  const rows = scenesOf(r.id).map(([n, list]) => {
    const other = list.filter((it) => !cols.some(([k]) => k === it.kind));
    return `<div class="ovg-row">
      <a class="ovg-scene" href="${sceneHref(r.id, n)}"><span class="num">${two(n)}</span><b>${esc(sceneName(n))}</b>${sceneLine(n) ? `<span class="line">“${esc(sceneLine(n))}”</span>` : ""}</a>
      ${other.length ? `<div class="ovg-cell wide">${other.map(cell).join("")}</div>` : cols.map(([k]) => `<div class="ovg-cell">${list.filter((it) => it.kind === k).map(cell).join("") || '<span class="ovg-none">—</span>'}</div>`).join("")}
    </div>`;
  }).join("");
  return `<div class="ovg"><div class="ovg-row ovg-head"><span>Cena</span>${cols.map(([, n]) => `<span>${n}</span>`).join("")}</div>${rows}</div>`;
}
const replyLine = (r) => r.confirmed_at ? `Confirmada por ${esc(r.confirmed_by)} · ${fmtTime(r.confirmed_at)}` : r.reply_by ? `Responder até ${fmtDeadline(r.reply_by)}` : `Até ${fmtDay(r.due)}`;
function summaryPage(r) {
  const items = itemsOf(r.id);
  const done = items.filter((i) => i.decision !== "pending").length;
  const scenes = scenesOf(r.id);
  const next = scenes.find(([, list]) => list.some((i) => i.decision === "pending"));
  const started = items.some((i) => i.decision !== "pending" || i.chosen_option);
  const cell = (it) => {
    const opts = optsOf(it.id);
    const [cls, label] = clientState(it);
    const href = sceneHref(r.id, it.scene, it.id);
    return `<div class="ovx"><div class="ovx-head"><i class="ovx-dot ${cls || "pending"}" title="${label}"></i><a class="ovx-title" href="${href}">${esc(it.title)}</a><span class="ovx-meta ${cls}">${label}</span></div>
      <div class="ovt-grid">${opts.map((o, i) => `<a class="ovt ${o.id === it.chosen_option ? "chosen" : ""}" href="${href}" aria-label="${esc(it.title)}">${media(o, "thumb")}${opts.length > 1 && it.mode !== "set" ? `<span class="ovt-lab">${letter(i)}</span>` : ""}</a>`).join("")}</div></div>`;
  };
  return head(esc(r.title), replyLine(r), progress(done, items.length, `${done} de ${items.length} decididos`) + dlButton(), roundLabel(r)) +
    `<div class="main-body" data-keep="main">
      <section class="cover">
        <div>
          <p class="cover-lead">${plural(scenes.length, "cena", "cenas")} · ${plural(items.length, "decisão", "decisões")}</p>
          <ol class="cover-how"><li><span><b>Escolha</b> clicando na imagem (A, B ou C).</span></li><li><span><b>Aprove</b> ou <b>peça um ajuste</b> com um comentário.</span></li><li><span><b>Confirme</b> a rodada no resumo, no fim.</span></li></ol>
          ${r.intro ? `<p class="cover-note">${esc(r.intro)}</p>` : ""}
        </div>
        <div class="cover-cta">${next ? `<a class="btn primary" href="${sceneHref(r.id, next[0])}">${started ? "Continuar" : "Começar"}: ${two(next[0])} ${esc(sceneName(next[0]))} →</a>` : ""}<a class="btn" href="#/r/${r.id}/resumo">Resumo${r.confirmed_at ? " · confirmada" : ""}</a></div>
      </section>
      ${sceneTable(r, cell)}
    </div>`;
}

// the round summary: what the client picked in every scene, and the button that closes the round
function reviewPage(r) {
  const items = itemsOf(r.id);
  const pending = items.filter((i) => i.decision === "pending");
  const changes = items.filter((i) => i.decision === "changes").length;
  const done = items.length - pending.length;
  const cell = (it) => {
    const opts = optsOf(it.id);
    const o = opts.find((x) => x.id === it.chosen_option) || (it.mode === "set" || opts.length === 1 ? opts[0] : null);
    const [cls, label] = clientState(it);
    const href = sceneHref(r.id, it.scene, it.id);
    const pic = it.decision === "pending" ? `<a class="ovt ovt-empty" href="${href}">Falta decidir</a>`
      : o ? `<a class="ovt ${cls}" href="${href}">${media(o, "thumb")}${opts.length > 1 && it.mode !== "set" ? `<span class="ovt-lab">${letter(opts.indexOf(o))}</span>` : ""}</a>` : `<a class="ovt ovt-empty" href="${href}">Ajuste pedido</a>`;
    return `<div class="ovx"><div class="ovx-head"><i class="ovx-dot ${cls || "pending"}"></i><a class="ovx-title" href="${href}">${esc(it.title)}</a><span class="ovx-meta ${cls}">${label}</span></div><div class="rv-pick">${pic}</div></div>`;
  };
  const box = r.confirmed_at ? `<p><b>${esc(r.code)} confirmada</b> por ${esc(r.confirmed_by)} · ${fmtTime(r.confirmed_at)}.${TEAM ? "" : " Obrigado!"}</p>`
    : pending.length ? `<p>Faltam <b>${plural(pending.length, "decisão", "decisões")}</b> para ${TEAM ? `${A_CL} confirmar` : "confirmar"} a ${esc(r.code)}.</p>${TEAM ? "" : `<a class="btn primary" href="${sceneHref(r.id, pending[0].scene, pending[0].id)}">Ir para a próxima →</a>`}`
    : `<p><b>Tudo decidido</b>${changes ? `, com ${plural(changes, "ajuste pedido", "ajustes pedidos")}` : ""}. ${TEAM ? `Aguardando ${A_CL} confirmar.` : "Confirme para a gente seguir."}</p>${TEAM ? "" : `<button class="btn primary" data-act="confirm-round" data-id="${r.id}">Confirmar ${esc(r.code)}</button>`}`;
  return head(`Resumo da ${esc(r.code)}`, replyLine(r), progress(done, items.length, `${done} de ${items.length} decididos`) + dlButton(), `${esc(r.code)} · ${esc(r.title)}`) +
    `<div class="main-body" data-keep="main"><div class="confirm ${r.confirmed_at ? "ok" : ""}">${box}</div>${sceneTable(r, cell)}</div>`;
}

// one scene: every item with its options side by side
// the pages before and after n (the team also counts the empty page it is looking at)
function sceneSteps(r, n) {
  const scenes = scenesOf(r.id).map(([k]) => k);
  const all = TEAM ? [...new Set([...scenes, n])].sort((a, b) => a - b) : scenes;
  const i = all.indexOf(n);
  return [all[i - 1], all[i + 1]];
}
function scenePage(r, n) {
  const [prev, next] = sceneSteps(r, n);
  const items = itemsOf(r.id).filter((x) => x.scene === n);
  const focus = TEAM && S.page.item && items.find((x) => x.id === S.page.item);
  if (focus) return focusPage(r, n, items, focus);
  const approved = items.filter((x) => x.decision === "approved").length;
  const right = TEAM ? `${addButton(n)}${dlButton()}${sendButton(r)}`
    : `${progress(approved, items.length, `${approved} de ${items.length} aprovados`)}${dlButton()}`;
  const look = lookOf(n);
  const line = [sceneLine(n) ? `“${esc(sceneLine(n))}”` : "",
    look ? `<span class="look"><span class="sw">${(look.palette || []).map((c) => `<i style="background:${esc(c)}"></i>`).join("")}</span>${esc(look.label || "")}</span>` : "",
    TEAM && lookPrompt(n) ? `<button class="link copy" data-act="copy-look" data-v="${n}" title="${esc(lookPrompt(n))}">Copiar prompt da cena</button>` : ""].filter(Boolean).join(" · ");
  return head(`<span class="num">${two(n)}</span>${esc(sceneName(n))}`, line, right, `${esc(r.code)} · ${esc(r.title)}`) +
    `<div class="main-body" data-keep="main">${!items.length ? `<p class="empty">Nenhum item nesta cena.${TEAM ? ' <button class="link" data-act="add-item" data-scene="' + n + '">Criar um</button>' : ""}</p>` : TEAM ? splitCols(items, teamRow) : `<div class="items">${items.map(clientRow).join("")}</div>`}${TEAM ? "" : `<nav class="cnav">${prev !== undefined ? `<a class="btn" href="${sceneHref(r.id, prev)}">← ${two(prev)} ${esc(sceneName(prev))}</a>` : `<a class="btn" href="#/r/${r.id}">← Apresentação</a>`}<span class="grow"></span>${next !== undefined ? `<a class="btn primary" href="${sceneHref(r.id, next)}">Próxima: ${two(next)} ${esc(sceneName(next))} →</a>` : `<a class="btn primary" href="#/r/${r.id}/resumo">Ver o resumo e confirmar →</a>`}</nav>`}</div>`;
}
// one item on its own (team, from the menu): the item at full width, every version of it underneath, and the
// arrows (and ← →) going to the previous or next item of the scene
function focusPage(r, n, items, it) {
  const k = items.indexOf(it), prev = items[k - 1], next = items[k + 1];
  const arrow = (x, d, ico, t) => x ? `<a class="btn hico" data-step="${d}" href="${sceneHref(r.id, n, x.id)}" title="${t} (${d < 0 ? "←" : "→"}): ${esc(x.title)}" aria-label="${t}">${ico}</a>` : `<span class="btn hico off" aria-hidden="true">${ico}</span>`;
  const stepper = `<a class="btn hico" href="${sceneHref(r.id, n)}" title="Todos os itens de ${esc(sceneName(n))}" aria-label="Todos os itens da cena">${ICON.grid}</a>`
    + arrow(prev, -1, ICON.prev, "Item anterior") + arrow(next, 1, ICON.next, "Próximo item");
  const opts = shownOpts(it.id);
  const strip = opts.length > 1
    ? `<section class="focus-all"><p class="side-label">${plural(opts.length, "versão", "versões")}</p><div class="csh-grid">${opts.map((o) => sheetTile(it, o, { act: "zoom", del: true })).join("")}</div></section>` : "";
  return head(`<span class="num">${two(n)}</span>${esc(it.title)}`, it.brief ? esc(it.brief) : "", `<span class="hgroup">${stepper}</span>${dlButton()}${sendButton(r)}`, `${esc(r.code)} · ${esc(sceneName(n))} · ${k + 1} de ${items.length}`) +
    `<div class="main-body focus-body" data-keep="main"><div class="focus-one">${teamRow(it)}</div>${strip}</div>`;
}
// an item's refs are the client's files: photos for Compare, voice takes to listen to next to the options
const refFiles = (it) => (it.refs || []).map((id) => S.files.find((f) => f.id === id)).filter(Boolean);
const refsOf = (it) => refFiles(it).filter((f) => !f.mime.startsWith("audio/"));
const voicesOf = (it) => refFiles(it).filter((f) => f.mime.startsWith("audio/"));
// voice takes often arrive named "Take 2 - <project>": the project name is dropped from the label
const PROJECT_TAG = new RegExp(`\\s*-\\s*${PROJECT.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "i");
function voicesLine(it) {
  const vs = voicesOf(it);
  return vs.length ? `<div class="voices"><span>${vs.length > 1 ? "Vozes" : "Voz"}</span>${vs.map((f) => `<label class="voice"><small>${esc(f.name.replace(/\.[^.]+$/, "").replace(PROJECT_TAG, " ").trim())}</small><audio controls preload="none" data-path="${esc(f.path)}"${srcAttr(f.path)}></audio></label>`).join("")}</div>` : "";
}
function compareButton(it) {
  return refsOf(it).length && optsOf(it.id).length ? `<button class="chat" data-act="compare" data-id="${it.id}" title="Ver lado a lado com as fotos originais">${CMP}Comparar</button>` : "";
}
function chatButton(it) {
  const n = commentsOf(it.id).length;
  return `<button class="chat ${S.drawer === it.id ? "on" : ""}" data-act="drawer" data-id="${it.id}" title="Comentários">${CHAT}${n || "Comentar"}</button>`;
}
function clientRow(it) {
  const opts = optsOf(it.id);
  const single = opts.length === 1 || it.mode === "set";
  const ci = opts.findIndex((o) => o.id === it.chosen_option);
  const L = ci >= 0 ? letter(ci) : "";
  const decided = it.decision !== "pending";
  const canPick = !decided && !single;
  const [cls, label] = clientState(it);
  const actions = decided
    ? `<button class="btn" data-act="undo" data-id="${it.id}">Mudar decisão</button>`
    : `<button class="btn primary" data-act="approve" data-id="${it.id}" ${single || L ? "" : "disabled"}>${single ? (opts.length > 1 ? "Aprovar o conjunto" : "Aprovar") : L ? `Aprovar a opção ${L}` : "Escolha uma opção"}</button><button class="btn" data-act="ask-change" data-id="${it.id}">Pedir ajuste</button>`;
  return `<article class="citem ${S.flash === it.id ? "flash" : ""}" id="item-${it.id}">
    <header class="citem-head"><span class="kind">${KINDS[it.kind] || ""}</span><h3>${esc(it.title)}</h3><span class="state ${cls}">${label}</span><span class="grow"></span>${compareButton(it)}${chatButton(it)}</header>
    ${voicesLine(it)}
    <div class="ctiles n${Math.min(opts.length, 3)} ${canPick ? "pickable" : ""}">${opts.map((o, i) => `<figure class="ctile ${o.id === it.chosen_option ? "chosen" : ""}">
      <button class="ctile-img" data-act="${canPick ? "choose" : "zoom"}" data-id="${it.id}" data-opt="${o.id}" data-i="${i}" aria-label="${canPick ? (o.id === it.chosen_option ? "Desfazer a escolha" : `Escolher a opção ${letter(i)}`) : "Ver em tela cheia"}" ${canPick && o.id === it.chosen_option ? 'title="Clique de novo para desfazer"' : ""}>${media(o)}</button>
      ${single ? "" : `<span class="lab">${letter(i)}</span>`}
      ${o.id === it.chosen_option && !single ? `<span class="ctile-check">${ICO.keep}Escolhida</span>` : ""}
      <button class="ctile-zoom" data-act="zoom" data-id="${it.id}" data-i="${i}" title="Ver em tela cheia" aria-label="Ver em tela cheia">${ICO.view}</button>
      ${o.caption ? `<figcaption>${esc(o.caption)}</figcaption>` : ""}
    </figure>`).join("")}</div>
    <div class="citem-acts">${actions}</div>
  </article>`;
}
// team item on a scene page: the overview card (one big image, arrows through the versions), the grid icon swaps it
// for the contact sheet of every version; title, tools and "⋯" show in two pills on the image
// the title pill is as wide as its text: a hidden copy of it (data-v, see .tfit) sets the width
const fitTitle = (t) => (t.parentNode.dataset.v = t.value);
function teamRow(it) {
  const all = optsOf(it.id);
  const opts = shownOpts(it.id);
  const [cls, label] = stageOf(it);
  const ci = all.findIndex((o) => o.id === it.chosen_option);
  const L = ci >= 0 && all.length > 1 ? letter(ci) : "";
  // the client's answer, short in the title pill; who and when in its tooltip
  const fb = it.visible && (it.decision !== "pending" || L)
    ? `${esc(CL)} ${it.decision === "approved" ? "aprovou" : it.decision === "changes" ? "pediu ajuste" : "escolheu"}${L ? ` ${L}` : ""}` : "";
  const fbBy = fb && it.decided_by ? ` · ${esc(it.decided_by)}, ${fmtTime(it.decided_at)}` : "";
  const n = commentsOf(it.id).length;
  const open = S.more === it.id;
  const grid = S.sheet[it.id] || (all.length && !opts.length);
  const pairs = !grid ? pairsOf(opts) : [];
  const h = opts.length && !grid && !pairs.length ? heroOf(it, opts, { act: "zoom", del: true }) : null;
  const upload = `<input type="file" multiple hidden accept="image/*,video/*" data-upload-item="${it.id}">`;
  const body = pairs.length ? wipeHero(it, pairs)
    : !all.length
    ? `<label class="hero hero-empty" title="Arraste, clique ou cole (⌘V)">${upload}${S.uploading[it.id] ? esc(S.uploading[it.id]) : "Adicionar opções"}</label>`
    : h ? h.html : `<div class="csh-grid">${all.map((o) => sheetTile(it, o, { act: "zoom", del: true })).join("")}</div>`;
  // nothing under the image: signals sit top left on it, the image's own actions top right, and on hover two small
  // pills along the bottom edge, status and title on the left, the card's tools on the right; they stay up while
  // the popover or the comments are open
  const pos = S.uploading[it.id] ? esc(S.uploading[it.id]) : "";
  return `<article class="hcard sitem ${h?.verdict ? `rv-${h.verdict}` : ""} ${S.flash === it.id ? "flash" : ""}" id="item-${it.id}" data-drop="${it.id}">
    <div class="sitem-media">
    ${body}
    <footer class="hcard-foot sitem-foot ${open || S.drawer === it.id || pos ? "pin" : ""}">
      <span class="t sitem-pill"><i class="ovx-dot ${cls}" title="${label}${it.assignee ? ` · ${esc(PEOPLE[it.assignee] || it.assignee)}` : ""}${it.visible ? ` · ${A_CL} vê` : ""}"></i><span class="tfit" data-v="${esc(it.title)}"><input class="inline title" data-field="title" data-id="${it.id}" value="${esc(it.title)}" maxlength="120" size="1" aria-label="Título" title="${esc(it.brief || it.title)}"></span>${fb ? `<span class="sitem-fb" title="${fb}${fbBy}">${fb}</span>` : ""}${pos ? `<span class="pos">${pos}</span>` : ""}</span>
      <span class="sitem-tools sitem-pill">
        ${all.length > 1 ? `<button class="ibtn ${grid ? "on" : ""}" data-act="item-sheet" data-id="${it.id}" aria-pressed="${!!grid}" title="${grid ? "Voltar para a imagem grande" : "Ver todas as versões juntas"}" aria-label="Ver todas as versões juntas">${ICON.grid}</button>` : ""}
        ${refsOf(it).length && all.length ? `<button class="ibtn" data-act="compare" data-id="${it.id}" title="Comparar com as fotos originais" aria-label="Comparar">${CMP}</button>` : ""}
        <button class="ibtn ${S.drawer === it.id ? "on" : ""} ${n ? "has" : ""}" data-act="drawer" data-id="${it.id}" title="Comentários" aria-label="Comentários">${CHAT}${n ? `<b>${n}</b>` : ""}</button>
        ${all.length ? `<label class="ibtn" title="Adicionar opções (ou arraste para o card, ou cole com ⌘V)" aria-label="Adicionar opções">${upload}+</label>` : ""}
        <button class="ibtn ${open ? "on" : ""}" data-act="more" data-id="${it.id}" title="Dono, status, o que ${A_CL} vê, prompts" aria-label="Mais" aria-expanded="${open}">⋯</button>
        ${open ? morePop(it) : ""}
      </span>
    </footer>
    </div>
    ${voicesLine(it)}
  </article>`;
}
function morePop(it) {
  const vars = Object.keys(it.variants || {}).sort();
  return `<div class="more-pop" role="dialog" aria-label="Ajustes de ${esc(it.title)}">
    <div class="mp-row"><span>Briefing</span><input class="field mp-brief" data-field="brief" data-id="${it.id}" value="${esc(it.brief)}" placeholder="Briefing para o time" maxlength="400" aria-label="Briefing"></div>
    <div class="mp-row"><span>Dono</span><select class="sel" data-field="assignee" data-id="${it.id}" aria-label="Responsável"><option value="">Sem dono</option>${Object.entries(PEOPLE).map(([k, n]) => `<option value="${k}" ${it.assignee === k ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></div>
    <div class="mp-row"><span>Status</span><div class="seg" role="group" aria-label="Status">${Object.entries(STATUS).map(([k, n]) => `<button data-act="status" data-id="${it.id}" data-v="${k}" class="${it.status === k ? "on" : ""}" aria-pressed="${it.status === k}">${n}</button>`).join("")}</div></div>
    <div class="mp-row"><span>${esc(cap(A_CL))}</span><button class="vis" data-act="mode" data-id="${it.id}" title="${it.mode === "set" ? `As opções são vistas como uma coisa só: ${A_CL} aprova o conjunto` : `${cap(A_CL)} escolhe uma das opções`}">${it.mode === "set" ? "Aprova o conjunto" : "Escolhe uma"}</button><button class="vis ${it.visible ? "on" : ""}" data-act="visible" data-id="${it.id}" title="${it.visible ? `${cap(A_CL)} está vendo. Clique para esconder.` : `Mostrar só este item para ${A_CL}`}">${it.visible ? "Já vê" : "Oculto"}</button></div>
    ${vars.length ? `<div class="mp-row"><span>Prompts</span><span class="vars" title="Prompt pronto de cada direção do briefing: clique para copiar e colar no gerador de imagens">${vars.map((k) => { const n = k.charCodeAt(0) - 64; return `<button class="link" data-act="copy-var" data-id="${it.id}" data-v="${k}" data-n="${n}" title="Copiar o prompt da direção ${n}: ${esc(variantPrompt(it, k))}">${n}</button>`; }).join("")}</span></div>` : ""}
    <div class="mp-row mp-foot">${it.visible && it.decision !== "pending" ? `<button class="link" data-act="reopen" data-id="${it.id}">Reabrir a decisão</button>` : "<span></span>"}<button class="link danger" data-act="item-del" data-id="${it.id}">Excluir item</button></div>
  </div>`;
}

// what the client sends us; the team can narrow it to one kind of file, or to what is still missing
const FILE_KINDS = { foto: "Fotos", voz: "Vozes", video: "Vídeos" };
const fileKind = (f) => (f.mime.startsWith("audio/") ? "voz" : f.mime.startsWith("video/") ? "video" : f.preview_path || f.mime.startsWith("image/") ? "foto" : "outro");
const filesShown = (id) => (FILE_KINDS[S.matFilter] ? filesOf(id).filter((f) => fileKind(f) === S.matFilter) : filesOf(id));
function materialsPage() {
  const sent = S.requests.filter((r) => reqState(r)[0]).length;
  const k = TEAM ? S.matFilter : "all";
  const list = k === "all" ? S.requests : k === "falta" ? S.requests.filter((r) => !reqState(r)[0]) : S.requests.filter((r) => filesShown(r.id).length);
  const count = (v) => (v === "falta" ? S.requests.filter((r) => !reqState(r)[0]).length : S.files.filter((f) => fileKind(f) === v).length);
  const filter = TEAM ? `<div class="seg" role="group" aria-label="Filtrar materiais">${Object.entries({ all: "Tudo", ...FILE_KINDS, falta: "Faltando" }).map(([v, n]) =>
    `<button data-act="mat-filter" data-v="${v}" class="${k === v ? "on" : ""}" aria-pressed="${k === v}">${n}${v === "all" ? "" : ` <small>${count(v)}</small>`}</button>`).join("")}</div>` : "";
  const sub = TEAM ? `O que pedimos ${AO_CL} e o que já chegou` : "Arraste os arquivos para cada card ou use o botão Enviar";
  const total = S.files.length;
  const right = filter + progress(sent, S.requests.length, `${sent} de ${S.requests.length} enviados`) +
    (TEAM && total ? `<button class="btn" data-act="all-zip">Baixar ${FILE_KINDS[k] ? FILE_KINDS[k].toLowerCase() : "todos os materiais"} (.zip)</button>` : "");
  return head(TEAM ? `Materiais ${DA_CL}` : "O que precisamos de vocês", sub, right, "Materiais") +
    `<div class="main-body" data-keep="main"><div class="reqs">${list.map(reqCard).join("")}${TEAM && k === "all" ? addReqCard() : ""}</div></div>`;
}
function reqCard(r) {
  const fs = filesShown(r.id);
  const [cls, label] = reqState(r);
  const shown = fs.slice(0, 7);
  return `<div class="req" data-drop-req="${r.id}">
    <div class="req-top"><h3>${esc(r.title)}</h3><span class="state ${cls}">${label}</span></div>
    <p class="req-detail" title="${esc(r.detail)}">${esc(r.detail)}</p>
    ${fs.length ? `<div class="files">${shown.map(fileTile).join("")}${fs.length > shown.length ? `<button class="more-files" data-act="file-open" data-id="${fs[shown.length].id}" title="Ver os outros">+${fs.length - shown.length}</button>` : ""}</div>` : ""}
    ${S.uploading[r.id] ? `<span class="hint">${esc(S.uploading[r.id])}</span>` : ""}
    <div class="req-foot"><input class="field note" data-note="${r.id}" value="${esc(r.note)}" placeholder="Link ou observação" maxlength="2000" aria-label="Link ou observação">
      <label class="btn small">Enviar<input type="file" multiple hidden data-upload-req="${r.id}"></label></div>
    ${TEAM ? `<div class="req-team">${fs.length ? (fs.length === 1 ? `<button class="link" data-act="file-download" data-id="${fs[0].id}">Baixar arquivo</button>` : `<button class="link" data-act="req-zip" data-id="${r.id}">Baixar tudo (.zip)</button>`) : ""}<button class="link" data-act="req-done" data-id="${r.id}">${r.done ? "Desmarcar recebido" : "Marcar recebido"}</button><button class="link danger" data-act="req-del" data-id="${r.id}">Excluir</button></div>` : ""}
  </div>`;
}
function fileTile(f) {
  const canDel = TEAM || f.side === "cliente";
  const img = f.preview_path || /^image\/(jpeg|png|webp|gif|avif)$/.test(f.mime);
  const who = `${f.name}${f.uploaded_by ? ` · ${f.uploaded_by}` : ""}`;
  return `<div class="file">${img
    ? `<button class="thumbbtn" data-act="file-open" data-id="${f.id}" title="${esc(who)}"><img class="thumb" data-path="${esc(f.thumb_path || f.preview_path || f.path)}" alt="${esc(f.name)}"${srcAttr(f.thumb_path || f.preview_path || f.path)}></button>`
    : `<button class="chip" data-act="file-open" data-id="${f.id}" title="${esc(who)}">${esc(f.name)}</button>`}
    ${canDel ? `<button class="x" data-act="file-del" data-id="${f.id}" aria-label="Remover ${esc(f.name)}">×</button>` : ""}</div>`;
}
const addReqCard = () => `<div class="req add"><form data-form="add-req"><input class="field" name="label" placeholder="Novo pedido ${AO_CL}" required maxlength="120"><input class="field" name="detail" placeholder="Detalhe (opcional)" maxlength="400"><button class="btn small">Adicionar pedido</button></form></div>`;

function drawer() {
  const it = itemOf(S.drawer);
  if (!it) return "";
  const comments = commentsOf(it.id);
  const changes = S.mode[it.id] === "changes";
  return `<aside class="drawer" aria-label="Comentários">
    <div class="drawer-head"><div><p><span class="num">${two(it.scene)}</span> ${esc(sceneName(it.scene))} · ${KINDS[it.kind] || ""}</p><h2>${esc(it.title)}</h2></div><button class="link" data-act="drawer-close" aria-label="Fechar">Fechar ✕</button></div>
    <div class="msgs" data-keep="msgs">${comments.map((c) => `<div class="msg ${c.side}"><p class="meta"><b>${esc(c.author)}</b> · ${esc(c.side === "time" ? PROJECT.studio : CL)} · ${fmtTime(c.created_at)}</p><p class="body">${esc(c.body)}</p></div>`).join("") || '<p class="none">Nenhum comentário ainda.</p>'}</div>
    <form class="compose" data-comment="${it.id}" data-mode="${changes ? "changes" : ""}">
      ${changes ? '<p class="hintline">Conte o que ajustar. O item fica marcado como “Ajuste pedido”.</p>' : ""}
      <textarea class="field" name="body" rows="3" placeholder="${changes ? "O que vocês querem ajustar?" : "Escreva um comentário"}" required maxlength="4000" aria-label="Comentário"></textarea>
      <div class="row"><small>⌘ + Enter envia</small><button class="btn ${changes ? "primary" : ""} small">${changes ? "Pedir ajuste" : "Enviar"}</button></div>
    </form>
  </aside>`;
}

function fileMedia(f) {
  const p = f.preview_path || f.path;
  if (f.mime.startsWith("video/")) return `<video data-path="${esc(f.path)}" controls autoplay playsinline${srcAttr(f.path)}></video>`;
  if (f.mime.startsWith("audio/")) return `<div class="lb-file"><p>${esc(f.name)}</p><audio data-path="${esc(f.path)}" controls autoplay${srcAttr(f.path)}></audio></div>`;
  if (f.preview_path || /^image\/(jpeg|png|webp|gif|avif)$/.test(f.mime)) return `<img data-path="${esc(p)}" alt="${esc(f.name)}"${srcAttr(p)}>`;
  return `<div class="lb-file"><p>${esc(f.name)}</p><small>Sem prévia para este formato. Use “Baixar original”.</small></div>`;
}
function fileViewer() {
  const { req, i } = S.lightbox;
  const r = S.requests.find((x) => x.id === req);
  const fs = filesShown(req);
  const f = fs[i];
  if (!r || !f) return "";
  return `<div class="lb" data-act="lb-bg" role="dialog" aria-modal="true" aria-label="${esc(r.title)}">
    <div class="lb-top"><span><b>${esc(r.title)}</b> · ${i + 1} de ${fs.length} · ${esc(f.name)}${f.uploaded_by ? ` · ${esc(f.uploaded_by)}` : ""}</span><button class="link" data-act="lb-close">Fechar ✕</button></div>
    <div class="lb-stage">${fileMedia(f)}
      ${fs.length > 1 ? `<button class="lb-nav prev" data-act="lb-step" data-v="-1" aria-label="Anterior">‹</button><button class="lb-nav next" data-act="lb-step" data-v="1" aria-label="Próximo">›</button>` : ""}
    </div>
    <div class="lb-bottom">
      <button class="btn primary" data-act="file-download" data-id="${f.id}">Baixar original</button>
      ${TEAM && fs.length > 1 ? `<button class="btn" data-act="req-zip" data-id="${req}">Baixar os ${fs.length} (.zip)</button>` : ""}
    </div>
  </div>`;
}
function compareView() {
  const { cmp, r, i } = S.lightbox;
  const it = itemOf(cmp);
  const refs = it ? refsOf(it) : [];
  const opts = it ? optsOf(it.id) : [];
  const f = refs[r], o = opts[i];
  if (!f || !o) return "";
  return `<div class="lb" data-act="lb-bg" role="dialog" aria-modal="true" aria-label="Comparar ${esc(it.title)}">
    <div class="lb-top"><span><b>${esc(it.title)}</b> · comparar com as fotos originais</span><button class="link" data-act="lb-close">Fechar ✕</button></div>
    <div class="cmp">
      <section class="cmp-pane">
        <p class="cmp-label">Foto original · ${r + 1} de ${refs.length} <span>← →</span></p>
        <div class="cmp-stage">${fileMedia(f)}</div>
        <div class="cmp-strip">${refs.map((x, k) => `<button class="${k === r ? "on" : ""}" data-act="cmp-ref" data-v="${k}" aria-label="Foto ${k + 1}"><img data-path="${esc(x.thumb_path || x.preview_path || x.path)}" alt=""${srcAttr(x.thumb_path || x.preview_path || x.path)}></button>`).join("")}</div>
      </section>
      <section class="cmp-pane wide">
        <p class="cmp-label">Gerado${o.caption ? ` · ${esc(o.caption)}` : ""}${opts.length > 1 ? ` · ${i + 1} de ${opts.length}` : ""}</p>
        <div class="cmp-stage">${media(o, "big")}</div>
        ${opts.length > 1 ? `<div class="cmp-strip">${opts.map((x, k) => `<button class="${k === i ? "on" : ""}" data-act="cmp-opt" data-v="${k}" aria-label="Opção ${k + 1}"><img data-path="${esc(x.thumb_path || x.preview_path || x.path)}" alt=""${srcAttr(x.thumb_path || x.preview_path || x.path)}></button>`).join("")}</div>` : ""}
      </section>
    </div>
  </div>`;
}
// the same before/after wipe, full screen: arrows (and ← →) step through the pairs
function wipeView() {
  const it = itemOf(S.lightbox.wipe);
  const pairs = it ? pairsOf(shownOpts(it.id)) : [];
  if (!pairs.length) return "";
  const k = Math.min(S.wipe[it.id] || 0, pairs.length - 1), p = pairs[k];
  const note = p.light
    ? `<p class="lb-text dim">Passe o mouse na imagem: à esquerda do traço ${esc(p.l.toLowerCase())}, à direita ${esc(p.r.toLowerCase())}. A legenda, a avaliação e o prompt abaixo são da versão da direita.</p>`
    : `<p class="lb-text dim">Passe o mouse na imagem: à esquerda do traço o blocking 3D, à direita o resultado da IA. A legenda, a avaliação e o prompt abaixo são do resultado.</p>`;
  return `<div class="lb lb-team" data-act="lb-bg" role="dialog" aria-modal="true" aria-label="Comparar ${esc(it.title)}">
    <div class="lb-top"><span><b>${esc(it.title)}</b> · par ${k + 1} de ${pairs.length}</span>${lbTools()}</div>
    <div class="lb-split ${S.infoOff ? "info-off" : ""}">
      <div class="lb-stage">
        ${pairs.length > 1 ? `<button class="lb-nav prev" data-act="wipe-step" data-id="${it.id}" data-v="-1" aria-label="Par anterior">‹</button><button class="lb-nav next" data-act="wipe-step" data-id="${it.id}" data-v="1" aria-label="Próximo par">›</button>` : ""}
        <div class="lb-frame wipe" data-wipe>
          <div class="wipe-ia">${media(p.ia, "big")}</div>
          <div class="wipe-blk">${media(p.blocking, "big")}</div>
          <i class="wipe-line" aria-hidden="true"></i>
          <span class="wipe-lab l">${esc(p.l)}</span><span class="wipe-lab r">${esc(p.r)}</span>
          ${lbHud(it, p.ia)}
        </div>
      </div>
      ${infoPanel(it, p.ia, { note })}
    </div>
  </div>`;
}
// the option a team lightbox is showing (for the wipe, the AI result of the current pair)
function lbOption() {
  if (S.lightbox?.wipe) {
    const pairs = pairsOf(shownOpts(S.lightbox.wipe));
    return pairs[Math.min(S.wipe[S.lightbox.wipe] || 0, pairs.length - 1)]?.ia;
  }
  return S.lightbox?.id ? optsOf(S.lightbox.id)[S.lightbox.i] : null;
}
function lightbox() {
  if (S.lightbox.wipe) return wipeView();
  if (S.lightbox.cmp) return compareView();
  if (S.lightbox.req) return fileViewer();
  const { id, i } = S.lightbox;
  const it = itemOf(id);
  const opts = it ? optsOf(id) : [];
  const o = opts[i];
  if (!o) return "";
  const chosen = it.chosen_option === o.id;
  const canPick = !TEAM && it.decision === "pending" && opts.length > 1 && it.mode !== "set";
  if (TEAM) return teamLightbox(it, opts, o, i);
  return `<div class="lb" data-act="lb-bg" role="dialog" aria-modal="true" aria-label="${esc(it.title)}">
    <div class="lb-top"><span><b>${esc(it.title)}</b>${opts.length > 1 ? (it.mode === "set" ? ` · ${i + 1} de ${opts.length}` : ` · Opção ${letter(i)} de ${opts.length}`) : ""}${o.caption ? ` · ${esc(o.caption)}` : ""}</span><button class="link" data-act="lb-close">Fechar ✕</button></div>
    <div class="lb-stage">${media(o, "big")}
      ${opts.length > 1 ? `<button class="lb-nav prev" data-act="lb-step" data-v="-1" aria-label="Anterior">‹</button><button class="lb-nav next" data-act="lb-step" data-v="1" aria-label="Próxima">›</button>` : ""}
    </div>
    ${TEAM && o.prompt ? `<div class="lb-prompt"><p><b>${esc(o.model || "Prompt")}</b> ${esc(o.prompt)}</p><button class="btn small" data-act="copy-prompt" data-id="${o.id}">Copiar prompt</button></div>` : ""}
    <div class="lb-bottom">
      ${canPick ? `<button class="btn ${chosen ? "" : "primary"}" data-act="choose" data-id="${it.id}" data-opt="${o.id}" ${chosen ? 'title="Clique para desfazer a escolha"' : ""}>${chosen ? "Escolhida ✓ · desfazer" : `Escolher a opção ${letter(i)}`}</button>` : ""}
      <button class="link" data-act="download" data-id="${o.id}">Baixar original</button>
    </div>
  </div>`;
}

function teamLightbox(it, opts, o, i) {
  const lab = dropped(o) ? "descartada" : it.mode === "set" ? `${i + 1} de ${opts.length}` : `Opção ${letter(i)} de ${opts.filter((x) => !dropped(x)).length}`;
  const pos = S.lightbox.ov ? S.ovList.findIndex((x) => x.id === it.id && x.i === i) : -1;
  const many = S.lightbox.ov ? S.ovList.length > 1 : opts.length > 1;
  return `<div class="lb lb-team" data-act="lb-bg" role="dialog" aria-modal="true" aria-label="${esc(it.title)}">
    <div class="lb-top"><span><b>${esc(it.title)}</b> · ${lab}${pos >= 0 ? ` · ${pos + 1} de ${S.ovList.length} na visão geral` : ""}</span>${lbTools()}</div>
    <div class="lb-split ${S.infoOff ? "info-off" : ""}">
      <div class="lb-stage">
        ${many ? `<button class="lb-nav prev" data-act="lb-step" data-v="-1" aria-label="Anterior">‹</button><button class="lb-nav next" data-act="lb-step" data-v="1" aria-label="Próxima">›</button>` : ""}
        <div class="lb-frame">${media(o, "big")}${lbHud(it, o, { del: true })}</div>
      </div>
      ${infoPanel(it, o)}
    </div>
  </div>`;
}
// the info button and Fechar, top right of every team lightbox; the panel starts closed and only a click (or I) opens it
const lbTools = () => `<span class="lb-tools"><button class="lb-info ${S.infoOff ? "" : "on"}" data-act="lb-info" aria-pressed="${!S.infoOff}" title="${S.infoOff ? "Mostrar" : "Esconder"} as informações (I)" aria-label="Informações">${ICON.info}</button><button class="link" data-act="lb-close">Fechar ✕</button></span>`;
// the verdict and the actions as a row of icons over the image, shown on hover
function lbHud(it, o, { del = false } = {}) {
  const rv = reviewOf(o.id) || {};
  return `<div class="lb-hud" role="toolbar" aria-label="Ações desta opção">
    <span class="lb-hud-g">${Object.entries(REVIEW).map(([v, n]) => `<button class="hud ${v} ${rv.verdict === v ? "on" : ""}" data-act="review" data-id="${o.id}" data-v="${v}" title="${n} (${{ keep: "M", redo: "R", drop: "D" }[v]})" aria-label="${n}" aria-pressed="${rv.verdict === v}">${ICO[v]}</button>`).join("")}</span>
    <span class="lb-hud-g">
      ${o.prompt ? `<button class="hud" data-act="copy-prompt" data-id="${o.id}" title="Copiar prompt" aria-label="Copiar prompt">${ICO.copy}</button>` : ""}
      <button class="hud" data-act="download" data-id="${o.id}" title="Baixar original" aria-label="Baixar original">${ICO.down}</button>
      ${refsOf(it).length ? `<button class="hud" data-act="lb-compare" data-id="${it.id}" title="Comparar com o material" aria-label="Comparar com o material">${CMP}</button>` : ""}
      <a class="hud" href="${sceneHref(it.round_id, it.scene, it.id)}" data-act="lb-close" title="Abrir na cena" aria-label="Abrir na cena">${ICO.open}</a>
      ${del ? `<button class="hud danger" data-act="opt-del" data-id="${o.id}" title="Excluir" aria-label="Excluir">${ICO.trash}</button>` : ""}
    </span>
  </div>`;
}
// the reference images that went into this option (store photos, logo, products, cast, blocking, an earlier
// generation) as small thumbnails; hovering one shows it larger with its name
function refsBlock(o) {
  const refs = Array.isArray(o.refs) ? o.refs : [];
  if (!refs.length) return "";
  return `<div class="lb-sec"><p class="side-label">Referências usadas · ${refs.length}</p>
    <div class="lb-refs">${refs.map((r) => `<span class="lb-ref" tabindex="0" aria-label="${esc(r.label)}"><img data-path="${esc(r.thumb || r.path)}" alt="" decoding="async"${srcAttr(r.thumb || r.path)}><span class="lb-ref-peek"><img data-path="${esc(r.path)}" alt="" decoding="async"${srcAttr(r.path)}><small>${esc(r.label)}</small></span></span>`).join("")}</div>
  </div>`;
}
function infoPanel(it, o, { note = "" } = {}) {
  const rv = reviewOf(o.id) || {};
  return `<aside class="lb-panel" data-keep="lbp">
    <p class="eyebrow"><span class="num">${two(it.scene)}</span> ${esc(sceneName(it.scene))} · ${KINDS[it.kind] || ""}</p>
    ${sceneLine(it.scene) ? `<p class="lb-line">“${esc(sceneLine(it.scene))}”</p>` : ""}
    ${note}
    <p class="lb-meta">${esc(o.model || "Modelo não registrado")}${o.created_at ? ` · ${fmtTime(o.created_at)}` : ""}${o.created_by ? ` · ${esc(o.created_by)}` : ""}</p>
    ${it.brief ? `<div class="lb-sec"><p class="side-label">A cena</p><p class="lb-text">${esc(it.brief)}</p></div>` : ""}
    <div class="lb-sec"><p class="side-label">Legenda (${A_CL} vê)</p><input class="field lb-capin" data-cap="${o.id}" value="${esc(o.caption)}" placeholder="Uma linha sobre esta opção" maxlength="140" aria-label="Legenda"></div>
    <div class="lb-sec">
      <p class="side-label rv-head">Avaliação do time${rv.verdict ? `<b class="rv-tag" data-v="${rv.verdict}">${ICO[rv.verdict]}${REVIEW[rv.verdict]}</b>` : ""}</p>
      <input class="rv-note" data-rv="${o.id}" value="${esc(rv.note || "")}" placeholder="Por quê? O que melhorar?" maxlength="2000" aria-label="Nota do time">
      ${rv.author && (rv.note || rv.verdict) ? `<small class="dim">${esc(rv.author)} · ${fmtTime(rv.updated_at)}</small>` : ""}
    </div>
    ${refsBlock(o)}
    <div class="lb-sec"><p class="side-label">Por que esta opção</p><textarea class="field lb-reason" data-reason="${o.id}" rows="3" maxlength="1000" placeholder="O raciocínio desta imagem: por que ela funciona para a cena">${esc(o.reasoning || "")}</textarea></div>
    ${o.prompt ? `<div class="lb-sec"><p class="side-label">Prompt</p><p class="lb-text lb-ptext">${esc(o.prompt)}</p></div>` : `<div class="lb-sec"><p class="side-label">Prompt</p><p class="lb-text dim">Sem prompt registrado.</p></div>`}
    <p class="lb-keys">← → navegar · M manter · R refazer · D descartar · I informações · Esc fechar</p>
  </aside>`;
}
function modal() {
  if (S.modal === "name" && TEAM) {
    return `<div class="modal"><div class="sheet"><p class="eyebrow">Sala de produção</p><h2>Quem é você?</h2>
      <p class="muted">Seu nome assina os comentários e os envios.</p>
      <div class="people3">${Object.entries(PEOPLE).map(([k, n]) => `<button class="btn ${S.me === k ? "primary" : ""}" data-act="me" data-v="${k}">${n}</button>`).join("")}</div></div></div>`;
  }
  if (S.modal === "name") {
    return `<div class="modal"><div class="sheet"><p class="eyebrow">Sala de aprovação</p><h2>Como você se chama?</h2>
      <p class="muted">Para a gente saber quem escolheu, aprovou ou comentou.</p>
      <form data-form="name"><input class="field" name="who" value="${esc(S.me || "")}" placeholder="Seu nome" required maxlength="40" autocomplete="given-name"><button class="btn primary">Entrar</button></form></div></div>`;
  }
  if (S.modal?.add !== undefined) {
    return `<div class="modal"><div class="sheet"><p class="eyebrow">${esc(roundOf(S.page.round)?.code || "")}</p><h2>Novo item</h2>
      <form data-form="add-item">
        <div class="two"><select class="sel" name="scene" aria-label="Cena">${SCENES.map((s, i) => `<option value="${i}" ${S.modal.add === i ? "selected" : ""}>${two(i)} · ${esc(s.name)}</option>`).join("")}</select>
        <select class="sel" name="kind" aria-label="Tipo">${Object.entries(KINDS).map(([k, nm]) => `<option value="${k}">${nm}</option>`).join("")}</select></div>
        <input class="field" name="label" placeholder="Título" required maxlength="120">
        <input class="field" name="brief" placeholder="Briefing para o time (opcional)" maxlength="400">
        <select class="sel" name="assignee" aria-label="Responsável"><option value="">Sem dono</option>${Object.entries(PEOPLE).map(([k, nm]) => `<option value="${k}" ${S.me === k ? "selected" : ""}>${nm}</option>`).join("")}</select>
        <div class="row"><button class="btn primary">Criar item</button><button type="button" class="link" data-act="modal-close">Cancelar</button></div>
      </form></div></div>`;
  }
  if (S.modal === "sent") {
    return `<div class="modal"><div class="sheet"><p class="eyebrow">Enviado</p><h2>${esc(cap(A_CL))} já pode ver</h2>
      <p class="muted">Mensagem pronta para mandar no grupo:</p>
      <textarea class="field" rows="7" readonly id="sendmsg">${esc(sendMessage())}</textarea>
      <div class="row"><button class="btn primary" data-act="copy-msg">Copiar mensagem</button><button class="link" data-act="modal-close">Fechar</button></div></div></div>`;
  }
  return "";
}
function sendMessage() {
  const r = roundOf(S.page.round) || roundOf(defaultRound());
  const n = itemsOf(r.id).filter((i) => i.visible).length;
  const link = CLIENT_URL || new URL("../aprovacao/", location.href).href;
  return SEND_MESSAGE.replaceAll("{rodada}", `${roundLabel(r)} · ${r.title}`).replaceAll("{link}", link).replaceAll("{itens}", plural(n, "item", "itens"));
}

function loginPage(err = "") {
  $app.innerHTML = `<main class="login">
    <p class="logo">${esc(PROJECT.logo)}</p>
    <h1>${TEAM ? "Sala de produção" : "Sala de aprovação"}</h1>
    <form data-form="login"><input class="field" type="password" name="pw" placeholder="Senha" autocomplete="current-password" required aria-label="Senha"><button class="btn primary">Entrar</button></form>
    <p class="err" role="alert">${esc(err)}</p>
    ${PROJECT.footer ? `<p class="foot">${esc(PROJECT.footer)}</p>` : ""}
  </main>`;
  $app.querySelector("input").focus();
}

// ---------- actions ----------
const ACTS = {
  // local only: everyone on a side shares one login, and a global sign-out would end every colleague's session too
  async logout() { await sb.auth.signOut({ scope: "local" }); location.reload(); },
  whoami() { S.modal = "name"; render(true); },
  me(el) { S.me = el.dataset.v; store.set(`sala-name-${SIDE}`, S.me); S.modal = null; render(true); },
  nav() { S.navOpen = !S.navOpen; render(true); },
  fold() { S.scenesOff = !S.scenesOff; store.set("sala-scenes-off", S.scenesOff ? "1" : "0"); render(true); },
  "fold-page"(el) {
    const n = +el.dataset.v;
    S.navPages[n] = !pageOpen(n, S.page.kind === "scene" && S.page.scene === n);
    store.set("sala-nav-pages", JSON.stringify(S.navPages));
    render(true);
  },
  "wipe-open"(el) { S.lightbox = { wipe: el.dataset.id }; render(true); },
  "wipe-step"(el) {
    const id = el.dataset.id, n = pairsOf(shownOpts(id)).length;
    S.wipe[id] = ((S.wipe[id] || 0) + +el.dataset.v + n) % n;
    render(true);
  },
  "item-sheet"(el) { S.sheet[el.dataset.id] = !S.sheet[el.dataset.id]; render(true); },
  more(el) { S.more = S.more === el.dataset.id ? null : el.dataset.id; render(true); },
  dl() { S.dl = !S.dl; render(true); },
  "dl-zip"(el) {
    const s = dlScope(), ok = el.dataset.v === "ok";
    S.dl = false; render(true);
    zipDownload(dlFiles(s, ok), `${s.zip}${ok ? (TEAM ? " - aprovadas" : " - aprovado") : ""}`);
  },
  side() { S.sideOff = !S.sideOff; store.set("sala-side-off", S.sideOff ? "1" : "0"); render(true); },
  "lb-info"() { toggleInfo(); },
  "ov-view"(el) { S.ov.view = el.dataset.v; store.set("sala-ov-view2", S.ov.view); render(); },
  "modal-close"() { S.modal = null; render(true); },
  drawer(el) { const id = el.dataset.id; S.drawer = S.drawer === id && !S.mode[id] ? null : id; delete S.mode[id]; render(true); focusCompose(); },
  "drawer-close"() { if (S.drawer) delete S.mode[S.drawer]; S.drawer = null; render(true); },
  "ask-change"(el) { const id = el.dataset.id; S.drawer = id; S.mode[id] = "changes"; render(true); focusCompose(); },
  // clicking the chosen option again undoes the choice
  choose(el) { const it = itemOf(el.dataset.id); if (it && it.decision === "pending") decide(it.id, it.chosen_option === el.dataset.opt ? null : el.dataset.opt, "pending"); },
  approve(el) {
    const it = itemOf(el.dataset.id);
    const opts = optsOf(it.id);
    const opt = it.chosen_option || (opts.length === 1 || it.mode === "set" ? opts[0]?.id : null);
    if (opt) decide(it.id, opt, "approved", "Aprovado");
  },
  undo(el) { const it = itemOf(el.dataset.id); decide(it.id, it.chosen_option, "pending"); },
  reopen(el) { decide(el.dataset.id, null, "pending", `Reaberto para ${A_CL}`); },
  zoom(el) { S.lightbox = { id: el.dataset.id, i: +el.dataset.i }; render(true); },
  "lb-close"() { S.lightbox = S.lightbox?.back || null; if (!S.lightbox) S.infoOff = true; render(true); },
  compare(el) { S.lightbox = { cmp: el.dataset.id, r: 0, i: 0 }; render(true); },
  "cmp-ref"(el) { S.lightbox.r = +el.dataset.v; render(true); },
  "cmp-opt"(el) { S.lightbox.i = +el.dataset.v; render(true); },
  "lb-bg"(el, e) { if (e.target === el || e.target.classList.contains("lb-stage")) ACTS["lb-close"](); },
  "lb-step"(el) { step(+el.dataset.v); },
  download(el) { const o = S.options.find((x) => x.id === el.dataset.id); if (o) openFile(o.path, o.name, true); },
  "file-open"(el) {
    const f = S.files.find((x) => x.id === el.dataset.id);
    if (f) { S.lightbox = { req: f.request_id, i: filesShown(f.request_id).indexOf(f) }; render(true); }
  },
  "file-download"(el) { const f = S.files.find((x) => x.id === el.dataset.id); if (f) openFile(f.path, f.name, true); },
  "req-zip"(el) { const r = S.requests.find((x) => x.id === el.dataset.id); zipDownload(filesShown(r.id).map((f) => [f, ""]), r.title); },
  "all-zip"() { zipDownload(S.requests.flatMap((r) => filesShown(r.id).map((f) => [f, r.title])), FILE_KINDS[S.matFilter] ? `${FILE_KINDS[S.matFilter]} ${DA_CL}` : `Materiais ${DA_CL}`); },
  async "file-del"(el) {
    const f = S.files.find((x) => x.id === el.dataset.id);
    if (!f || !confirm(`Remover “${f.name}”?`)) return;
    await run(async () => {
      const { error } = await sb.from("request_files").delete().eq("id", f.id);
      if (error) throw error;
      await sb.storage.from("media").remove([f.path, f.preview_path, f.thumb_path].filter(Boolean));
      await refresh();
    }, "Arquivo removido");
  },
  async "req-done"(el) {
    const r = S.requests.find((x) => x.id === el.dataset.id);
    await run(async () => { const { error } = await sb.from("requests").update({ done: !r.done }).eq("id", r.id); if (error) throw error; await refresh(); });
  },
  async "req-del"(el) {
    const r = S.requests.find((x) => x.id === el.dataset.id);
    if (!confirm(`Excluir o pedido “${r.title}” e os arquivos dele?`)) return;
    await run(async () => {
      const paths = filesOf(r.id).flatMap((f) => [f.path, f.preview_path, f.thumb_path]).filter(Boolean);
      const { error } = await sb.from("requests").delete().eq("id", r.id);
      if (error) throw error;
      if (paths.length) await sb.storage.from("media").remove(paths);
      await refresh();
    }, "Pedido excluído");
  },
  status(el) { patchItem(el.dataset.id, { status: el.dataset.v }); },
  review(el) { saveReview(el.dataset.id, { verdict: reviewOf(el.dataset.id)?.verdict === el.dataset.v ? null : el.dataset.v }); },
  "mat-filter"(el) { S.matFilter = el.dataset.v; render(); },
  "ov-kind"(el) { S.ov.kind = el.dataset.v; render(); },
  "confirm-round"(el) {
    run(async () => { const { error } = await sb.rpc("confirm_round", { p_round: el.dataset.id, p_who: myName() }); if (error) throw error; await refresh(); }, "Rodada confirmada. Obrigado!");
  },
  "ov-curate"() { S.ov.curate = !S.ov.curate; render(); },
  "ov-dropped"() { S.ov.dropped = !S.ov.dropped; render(); },
  "ov-open"(el) { S.lightbox = { id: el.dataset.id, i: +el.dataset.i, ov: true }; render(true); },
  "ov-cycle"(el) {
    const opts = shownOpts(el.dataset.id);
    const k = Math.max(0, opts.findIndex((o) => o.id === S.ovSel[el.dataset.id]));
    S.ovSel[el.dataset.id] = opts[(k + +el.dataset.v + opts.length) % opts.length].id;
    render(true);
  },
  "lb-compare"(el) { S.lightbox = { cmp: el.dataset.id, r: 0, i: S.lightbox.i, back: S.lightbox }; render(true); },
  mode(el) { const it = itemOf(el.dataset.id); patchItem(it.id, { mode: it.mode === "set" ? "choose" : "set" }, it.mode === "set" ? `${cap(A_CL)} vai escolher uma opção` : `${cap(A_CL)} vai aprovar o conjunto`); },
  visible(el) { const it = itemOf(el.dataset.id); patchItem(it.id, { visible: !it.visible }, it.visible ? `Escondido ${DA_CL}` : `${cap(A_CL)} já vê este item`); },
  "add-item"(el) { S.modal = { add: el.dataset.scene !== undefined ? +el.dataset.scene : S.page.kind === "scene" ? S.page.scene : 0 }; render(true); $app.querySelector('[data-form="add-item"] [name="label"]')?.focus(); },
  async "item-del"(el) {
    const it = itemOf(el.dataset.id);
    if (!confirm(`Excluir “${it.title}” e todas as opções dele?`)) return;
    await run(async () => {
      const paths = optsOf(it.id).flatMap((o) => [o.path, o.preview_path, o.thumb_path]).filter(Boolean);
      const { error } = await sb.from("items").delete().eq("id", it.id);
      if (error) throw error;
      if (paths.length) await sb.storage.from("media").remove(paths);
      if (S.drawer === it.id) S.drawer = null;
      await refresh();
    }, "Item excluído");
  },
  async "opt-del"(el) {
    const o = S.options.find((x) => x.id === el.dataset.id);
    const i = optsOf(o.item_id).indexOf(o);
    if (!confirm(`Remover a opção ${letter(i)}?`)) return;
    await run(async () => {
      const { error } = await sb.from("options").delete().eq("id", o.id);
      if (error) throw error;
      await sb.storage.from("media").remove([o.path, o.preview_path, o.thumb_path].filter(Boolean));
      if (S.lightbox?.id === o.item_id) S.lightbox = null;
      await refresh();
    }, "Opção removida");
  },
  async send() {
    const r = roundOf(S.page.round);
    const list = itemsOf(r.id).filter(sendable);
    if (!list.length || !confirm(`Enviar ${plural(list.length, "item", "itens")} para ${A_CL}?`)) return;
    await run(async () => {
      const a = await sb.from("items").update({ visible: true }).in("id", list.map((i) => i.id));
      if (a.error) throw a.error;
      const b = await sb.from("rounds").update({ sent_at: new Date().toISOString() }).eq("id", r.id);
      if (b.error) throw b.error;
      await load(true);
      S.modal = "sent";
      render(true);
    });
  },
  async "copy-prompt"(el) {
    const o = S.options.find((x) => x.id === el.dataset.id);
    if (!o?.prompt) return;
    try { await navigator.clipboard.writeText(o.prompt); toast(`Prompt copiado${o.model ? ` · ${o.model}` : ""}`); }
    catch { window.prompt("Copie o prompt:", o.prompt); }
  },
  async "copy-var"(el) {
    const it = S.items.find((x) => x.id === el.dataset.id);
    const text = it && variantPrompt(it, el.dataset.v);
    if (!text) return;
    try { await navigator.clipboard.writeText(text); toast(`Prompt da direção ${el.dataset.n} copiado · cole no gerador de imagens`); }
    catch { window.prompt(`Copie o prompt da direção ${el.dataset.n}:`, text); }
  },
  async "copy-look"(el) {
    const text = lookPrompt(+el.dataset.v);
    try { await navigator.clipboard.writeText(text); toast("Prompt da cena copiado: cole no fim do seu prompt"); }
    catch { window.prompt("Copie o prompt da cena:", text); }
  },
  async "copy-msg"() {
    try { await navigator.clipboard.writeText(sendMessage()); toast("Mensagem copiada"); }
    catch { document.getElementById("sendmsg")?.select(); toast("Selecionei a mensagem: é só copiar"); }
  },
};
function step(d) {
  if (!S.lightbox) return;
  if (S.lightbox.wipe) return ACTS["wipe-step"]({ dataset: { id: S.lightbox.wipe, v: d } });
  if (S.lightbox.cmp) {  // arrows walk through the original photos
    const n = refsOf(itemOf(S.lightbox.cmp)).length;
    S.lightbox.r = (S.lightbox.r + d + n) % n;
    return render(true);
  }
  if (S.lightbox.ov && S.ovList.length) {
    const k = S.ovList.findIndex((x) => x.id === S.lightbox.id && x.i === S.lightbox.i);
    const next = S.ovList[(k + d + S.ovList.length) % S.ovList.length];
    Object.assign(S.lightbox, next);
    S.ovSel[next.id] = optsOf(next.id)[next.i]?.id;
    return render(true);
  }
  const n = S.lightbox.req ? filesShown(S.lightbox.req).length : optsOf(S.lightbox.id).length;
  S.lightbox.i = (S.lightbox.i + d + n) % n;
  render(true);
}
function toggleInfo() {
  S.infoOff = !S.infoOff;

  $app.querySelector(".lb-split")?.classList.toggle("info-off", S.infoOff);
  const b = $app.querySelector(".lb-info");
  if (b) { b.classList.toggle("on", !S.infoOff); b.setAttribute("aria-pressed", String(!S.infoOff)); b.title = `${S.infoOff ? "Mostrar" : "Esconder"} as informações (I)`; }
}
function focusCompose() {
  const m = $app.querySelector(".msgs");
  if (m) m.scrollTop = m.scrollHeight;
  $app.querySelector(".compose textarea")?.focus();
}
function stepScene(d) {
  const a = $app.querySelector(`[data-step="${d}"]`);
  if (a) { location.hash = a.getAttribute("href"); return; }
  const r = roundOf(S.page.round);
  if (!r || $app.querySelector(".focus-one")) return;
  const n = sceneSteps(r, S.page.scene)[d < 0 ? 0 : 1];
  if (n !== undefined) location.hash = sceneHref(r.id, n);
}

// ---------- events ----------
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (S.more && !e.target.closest?.(".more-pop, [data-act=more]")) { S.more = null; if (!el) render(true); }
  if (S.dl && !e.target.closest?.(".dl-pop, [data-act=dl]")) { S.dl = false; if (!el) render(true); }
  if (!el || !$app.contains(el)) return;
  const fn = ACTS[el.dataset.act];
  if (fn) { if (el.tagName === "A") e.preventDefault(); fn(el, e); }
});
window.addEventListener("hashchange", onRoute);

document.addEventListener("input", (e) => {
  if (e.target.matches?.("input, textarea")) e.target.dataset.dirty = "1";
  if (e.target.matches?.("textarea.brief")) fit(e.target);
  if (e.target.matches?.(".tfit > input")) fitTitle(e.target);
});
document.addEventListener("change", (e) => {
  const t = e.target;
  if (t.dataset.note || t.dataset.cap || t.dataset.rv || t.dataset.reason || t.dataset.field) delete t.dataset.dirty;
  if (t.dataset.uploadItem) { uploadOptions(t.dataset.uploadItem, t.files); t.value = ""; }
  else if (t.dataset.uploadReq) { uploadRequest(t.dataset.uploadReq, t.files); t.value = ""; }
  else if (t.dataset.note) {
    run(async () => { const { error } = await sb.rpc("set_request_note", { p_request: t.dataset.note, p_note: t.value.trim() }); if (error) throw error; await refresh(); }, "Salvo");
  } else if (t.dataset.reason) {
    run(async () => { const { error } = await sb.from("options").update({ reasoning: t.value.trim() }).eq("id", t.dataset.reason); if (error) throw error; await refresh(); }, "Salvo");
  } else if (t.dataset.rv) {
    saveReview(t.dataset.rv, { note: t.value.trim() });
  } else if (t.dataset.cap) {
    run(async () => { const { error } = await sb.from("options").update({ caption: t.value.trim() }).eq("id", t.dataset.cap); if (error) throw error; await refresh(); });
  } else if (t.dataset.field) {
    const it = itemOf(t.dataset.id);
    const v = t.value.trim();
    if (t.dataset.field === "title" && !v) { t.value = it.title; fitTitle(t); return; }
    patchItem(it.id, { [t.dataset.field]: t.dataset.field === "assignee" ? v || null : v });
  }
});

document.addEventListener("keydown", (e) => {
  const t = e.target;
  const typing = t.matches?.("input, textarea, select");
  if (e.key === "Enter" && t.matches?.("input.inline, textarea.brief, input.cap-in, input.lb-capin, input.rv-note, input.note")) { e.preventDefault(); t.blur(); return; }
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && t.matches?.(".compose textarea")) { t.form.requestSubmit(); return; }
  if (S.lightbox) {
    if (e.key === "Escape") ACTS["lb-close"]();
    if (typing) return;  // arrows and letters belong to the field being edited
    if (e.key === "ArrowRight") step(1);
    if (e.key === "ArrowLeft") step(-1);
    if (TEAM && e.key.toLowerCase() === "i" && !e.metaKey && !e.ctrlKey && (S.lightbox.id || S.lightbox.wipe)) toggleInfo();
    const v = { m: "keep", r: "redo", d: "drop" }[e.key.toLowerCase()];
    if (TEAM && v && !typing && !e.metaKey && !e.ctrlKey) {
      const o = lbOption();
      if (o) saveReview(o.id, { verdict: reviewOf(o.id)?.verdict === v ? null : v });
    }
    return;
  }
  if (e.key === "Escape") {
    if (S.more || S.dl) { S.more = null; S.dl = false; render(true); }
    else if (S.modal && S.modal !== "name") ACTS["modal-close"]();
    else if (S.drawer) ACTS["drawer-close"]();
    return;
  }
  if (!typing && !S.modal && S.page.kind === "scene" && (e.key === "ArrowRight" || e.key === "ArrowLeft")) stepScene(e.key === "ArrowRight" ? 1 : -1);
});

document.addEventListener("focusout", () => setTimeout(() => S.pending && render(false), 0));

document.addEventListener("submit", async (e) => {
  const f = e.target;
  e.preventDefault();
  const btn = f.querySelector("button:not([type=button])");
  if (f.dataset.form === "login") {
    btn.disabled = true;
    const { error } = await sb.auth.signInWithPassword({ email: EMAIL, password: f.elements.namedItem("pw").value });
    if (error) return loginPage("Senha incorreta.");
    return boot();
  }
  if (f.dataset.form === "name") {
    const v = val(f, "who");
    if (!v) return;
    S.me = v; store.set(`sala-name-${SIDE}`, v); S.modal = null; render(true);
    return;
  }
  if (f.dataset.form === "add-item") {
    const r = roundOf(S.page.round);
    const scene = +val(f, "scene");
    const sort = Math.max(0, ...itemsOf(r.id).filter((i) => i.scene === scene).map((i) => i.sort)) + 1;
    btn.disabled = true;
    await run(async () => {
      const { data, error } = await sb.from("items").insert({ round_id: r.id, scene, kind: val(f, "kind"), title: val(f, "label"), brief: val(f, "brief"), assignee: val(f, "assignee") || null, sort }).select("id").single();
      if (error) throw error;
      clearForm(f);
      S.modal = null;
      await load(true);
      location.hash = sceneHref(r.id, scene, data.id);
      onRoute();
    }, "Item criado");
    return;
  }
  if (f.dataset.form === "add-req") {
    btn.disabled = true;
    const sort = Math.max(0, ...S.requests.map((r) => r.sort)) + 1;
    await run(async () => {
      const { error } = await sb.from("requests").insert({ title: val(f, "label"), detail: val(f, "detail"), sort });
      if (error) throw error;
      clearForm(f);
      await refresh();
    }, "Pedido adicionado");
    return;
  }
  if (f.dataset.comment) {
    const id = f.dataset.comment;
    const body = val(f, "body");
    if (!body) return;
    const changes = f.dataset.mode === "changes";
    btn.disabled = true;
    await run(async () => {
      const { error } = await sb.from("comments").insert({ item_id: id, author: myName(), side: SIDE, body });
      if (error) throw error;
      if (changes) {
        const r = await sb.rpc("decide", { p_item: id, p_option: itemOf(id)?.chosen_option ?? null, p_decision: "changes", p_who: myName() });
        if (r.error) throw r.error;
      }
      delete S.mode[id];
      clearForm(f);
      document.activeElement?.blur();
      await refresh();
      const m = $app.querySelector(".msgs");
      if (m) m.scrollTop = m.scrollHeight;
    }, changes ? "Ajuste pedido" : "Comentário enviado");
  }
});

// drag and drop: files onto an item or a request; board cards between people
const hasFiles = (e) => { const t = [...(e.dataTransfer?.types || [])]; return t.includes("Files") || t.includes("text/uri-list"); };
// files from Finder, or an image dragged from another page (an image generator, Drive), fetched from its URL
async function droppedFiles(dt) {
  if (dt.files?.length) return [...dt.files];
  const url = (dt.getData("text/uri-list") || "").split(/\r?\n/).find((l) => /^https?:/.test(l));
  if (!url) return [];
  try {
    const blob = await (await fetch(url)).blob();
    if (!/^(image|video)\//.test(blob.type)) throw new Error("not media");
    const name = decodeURIComponent(new URL(url).pathname.split("/").pop() || "imagem").replace(/[^\w.\-]+/g, "_").slice(0, 60);
    return [new File([blob], /\.[a-z0-9]{2,5}$/i.test(name) ? name : `${name}.${blob.type.split("/")[1]}`, { type: blob.type })];
  } catch {
    toast("Não consegui puxar essa imagem do site. Copie a imagem e cole aqui com ⌘V, ou baixe e arraste o arquivo.", true);
    return [];
  }
}
const isCard = (e) => [...(e.dataTransfer?.types || [])].includes("text/sala-item");
document.addEventListener("dragstart", (e) => {
  const c = e.target.closest?.("[data-card]");
  if (!c) return;
  e.dataTransfer.setData("text/sala-item", c.dataset.card);
  e.dataTransfer.effectAllowed = "move";
  c.classList.add("dragging");
});
document.addEventListener("dragend", (e) => e.target.closest?.("[data-card]")?.classList.remove("dragging"));
document.addEventListener("dragover", (e) => {
  let d = null;
  if (isCard(e)) { d = e.target.closest?.("[data-col]"); if (d) e.preventDefault(); }
  else if (hasFiles(e)) { e.preventDefault(); d = e.target.closest?.(TEAM ? "[data-drop], [data-drop-req]" : "[data-drop-req]"); }
  document.querySelectorAll(".over").forEach((x) => x !== d && x.classList.remove("over"));
  d?.classList.add("over");
});
document.addEventListener("dragleave", (e) => { if (!e.relatedTarget || !$app.contains(e.relatedTarget)) document.querySelectorAll(".over").forEach((x) => x.classList.remove("over")); });
document.addEventListener("drop", (e) => {
  document.querySelectorAll(".over").forEach((x) => x.classList.remove("over"));
  if (isCard(e)) {
    const col = e.target.closest?.("[data-col]");
    if (!col) return;
    e.preventDefault();
    const it = itemOf(e.dataTransfer.getData("text/sala-item"));
    const who = col.dataset.col || null;
    if (it && it.assignee !== who) patchItem(it.id, { assignee: who }, `${it.title} → ${who ? PEOPLE[who] : "sem dono"}`);
    return;
  }
  if (!hasFiles(e)) return;
  e.preventDefault();
  const req = e.target.closest?.("[data-drop-req]");
  const item = TEAM && e.target.closest?.("[data-drop]");
  if (!req && !item) return;
  droppedFiles(e.dataTransfer).then((files) => {
    if (!files.length) return;
    if (req) uploadRequest(req.dataset.dropReq, files);
    else uploadOptions(item.dataset.drop, files);
  });
});
// ⌘V pastes copied images into the item or request under the pointer
let hovered = null;
document.addEventListener("mouseover", (e) => { hovered = e.target.closest?.(TEAM ? "[data-drop], [data-drop-req]" : "[data-drop-req]") || hovered; });
document.addEventListener("mouseleave", () => (hovered = null));
// the before/after wipe follows the mouse
document.addEventListener("pointermove", (e) => {
  const w = e.target.closest?.("[data-wipe]");
  if (!w) return;
  const r = w.getBoundingClientRect();
  w.style.setProperty("--x", `${Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100))}%`);
});
document.addEventListener("paste", (e) => {
  if (e.target.matches?.("input, textarea")) return;
  const files = [...(e.clipboardData?.files || [])].filter((f) => /^(image|video)\//.test(f.type));
  if (!files.length || !hovered || !$app.contains(hovered)) return;
  e.preventDefault();
  if (hovered.dataset.dropReq) uploadRequest(hovered.dataset.dropReq, files);
  else uploadOptions(hovered.dataset.drop, files);
});

// ---------- boot ----------
// a tab opened before a deploy keeps running the old code: when the published app changes, offer a reload.
// It compares the ETag the static host sends for this file; on a host without ETags the bar never shows.
let codeTag = null;
async function checkVersion() {
  try {
    const tag = (await fetch(import.meta.url, { method: "HEAD", cache: "no-store" })).headers.get("etag");
    if (!codeTag) codeTag = tag;
    else if (tag && tag !== codeTag && !document.querySelector(".update-bar")) {
      document.body.insertAdjacentHTML("beforeend", '<button class="update-bar" onclick="location.reload()">A sala foi atualizada · clique para recarregar</button>');
    }
  } catch {}
}
async function poll() {
  checkVersion();
  if (document.visibilityState !== "visible" || !S.session) return;
  try { if (await load()) { await warm().catch(() => {}); resolvePage(); render(false); } }
  catch (e) {
    console.warn(e);
    await sessionLost(e);
  }
}
let polling = false;
sb.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT" && S.session) { S.session = null; loginPage("Sua sessão caiu. Entre de novo com a senha."); }
});
async function boot() {
  // a fresh copy still has the placeholders from config.js: say so instead of a login that can never work
  if (/SEU-PROJETO|COLE-AQUI/.test(SUPABASE_URL + SUPABASE_KEY)) {
    $app.innerHTML = '<p class="booting">Falta ligar a sala ao Supabase: preencha SUPABASE_URL e SUPABASE_KEY em sala/config.js.</p>';
    return;
  }
  const { data } = await sb.auth.getSession();
  const session = data.session;
  if (!session || session.user.app_metadata?.side !== SIDE) {
    if (session) await sb.auth.signOut({ scope: "local" }); // a login from the other side: drop it here only
    return loginPage();
  }
  S.session = session;
  try { await load(true); if (TEAM && (await syncRounds())) await load(true); }
  catch (e) { console.error(e); $app.innerHTML = '<p class="booting">Não consegui carregar a sala. Recarregue a página.</p>'; return; }
  await warm().catch(() => {});
  if (!S.me || (TEAM && !PEOPLE[S.me])) S.modal = "name";
  onRoute();
  if (!polling) {
    polling = true;
    setInterval(poll, 15000);
    document.addEventListener("visibilitychange", poll);
  }
}
boot();
