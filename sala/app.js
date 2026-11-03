// Sala de aprovação. One app, two rooms: /producao for the team, /aprovacao for the client.
// The team uploads options per item and sends a round; the client picks, approves or asks for changes.
// Layout: a sidebar (rounds, scenes, materials) and one page at a time that fits the viewport.
// Everything that changes from one job to the next (names, scenes, rounds, logins) lives in config.js.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE_URL, SUPABASE_KEY, CLIENT_URL, PROJECT, LOGINS, PEOPLE, KINDS, MAIN_KINDS, ROUNDS, SCENES, STYLE_BASE, PROMPTS, SEND_MESSAGE, ESTUDIO, DECKS } from "./config.js";
import * as CFG from "./config.js"; // the optional keys (SCHEMA, BUCKET, JOB), with defaults below
import * as Estudio from "./estudio.js";

const SIDE = document.body.dataset.side; // "time" | "cliente", set by the entry page
const TEAM = SIDE === "time";
// one shared login per side: people only type the password, the e-mail comes from the room they opened
const EMAIL = LOGINS[SIDE];
// Several jobs can share one Supabase project, each in its own schema and bucket (config.js SCHEMA, BUCKET). Without JOB
// the two logins carry app_metadata.side; with JOB they carry app_metadata.job and .room, so a login of one job opens
// nothing in another job's room.
const SCHEMA = CFG.SCHEMA || "public", BUCKET = CFG.BUCKET || "media", JOB = CFG.JOB || "";
const roomOf = (user) => { const m = user?.app_metadata || {}; return JOB ? (m.job === JOB ? m.room : "") : m.side; };
// a storage key per side (and per job), so the team can keep both rooms, and other jobs' rooms, open in the same browser
const AUTH_KEY = (side) => `${JOB || "sala"}-${side}`;
// a room that kept its things in this browser under another prefix before it moved to this code (config.js STORE) has
// them moved here once: its people stay signed in, with their preferences
if (CFG.STORE && CFG.STORE !== "sala") try {
  const old = `${CFG.STORE}-`;
  for (const k of Object.keys(localStorage).filter((x) => x.startsWith(old))) {
    const rest = k.slice(old.length), to = rest === "time" || rest === "cliente" ? AUTH_KEY(rest) : `sala-${rest}`;
    if (localStorage.getItem(to) === null) localStorage.setItem(to, localStorage.getItem(k));
    localStorage.removeItem(k);
  }
} catch { /* the room still works: they sign in again */ }
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { db: { schema: SCHEMA }, auth: { storageKey: AUTH_KEY(SIDE) } });
document.title = `${PROJECT.name} · ${TEAM ? "Produção" : "Aprovação"}`;
if (PROJECT.accent) document.documentElement.style.setProperty("--accent", PROJECT.accent);
// the job's own stylesheet over the room's (config.js STYLE: its colors and fonts), a path from sala/
if (CFG.STYLE) document.head.append(Object.assign(document.createElement("link"), { rel: "stylesheet", href: new URL(CFG.STYLE, import.meta.url).href }));

const STATUS = { todo: "A fazer", doing: "Fazendo", ready: "Pronto" };
const tag = (n) => two(n); // the scene label in the menu and in file names
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
  deck: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="2" y="2.5" width="12" height="8" rx="1.2"/><path d="M8 10.5v3M5.5 13.5h5" stroke-linecap="round"/></svg>',
  back: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M6 4 2.5 7.5 6 11" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 7.5h6.5a4 4 0 0 1 4 4V13" stroke-linecap="round"/></svg>',
  play: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M5 3.2v9.6L13 8z"/></svg>',
  vs: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M2.8 3.8H8v8.4H2.8z" fill="currentColor" stroke="none" opacity=".45"/><path d="M8 1.8v12.4"/></svg>',
  down: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M8 2.5v8M4.8 7.4 8 10.5l3.2-3.1M2.5 13.5h11" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  plus: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M8 3v10M3 8h10" stroke-linecap="round"/></svg>',
  send: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M14 2 2 6.8l5 2.2 2.2 5zM14 2 7 9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  prev: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M10 3.5 5.5 8l4.5 4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  next: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  grip: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="5.8" cy="3.8" r="1.15"/><circle cx="10.2" cy="3.8" r="1.15"/><circle cx="5.8" cy="8" r="1.15"/><circle cx="10.2" cy="8" r="1.15"/><circle cx="5.8" cy="12.2" r="1.15"/><circle cx="10.2" cy="12.2" r="1.15"/></svg>',
};
const PROMPT_ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3M3.6 3.6l2 2M10.4 10.4l2 2M3.6 12.4l2-2M10.4 5.6l2-2" stroke-linecap="round"/></svg>';
const CMP = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="2" y="3" width="5" height="10" rx="1"/><rect x="9" y="3" width="5" height="10" rx="1"/></svg>';
const BOARD = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="2" y="2.5" width="3.4" height="11" rx="1"/><rect x="6.3" y="2.5" width="3.4" height="7" rx="1"/><rect x="10.6" y="2.5" width="3.4" height="9" rx="1"/></svg>';
const EYE = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8z"/><circle cx="8" cy="8" r="1.9"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M2.5 2.5l11 11M6.4 4c.5-.2 1-.3 1.6-.3 4.1 0 6.5 4.3 6.5 4.3s-.7 1.3-2 2.5M4.1 5.3C2.4 6.5 1.5 8 1.5 8s2.4 4.5 6.5 4.5c1 0 1.9-.2 2.7-.6"/></svg>';
const CLIP = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M13.2 7.4 8 12.6a3.3 3.3 0 0 1-4.7-4.7l5.6-5.6a2.2 2.2 0 0 1 3.1 3.1L6.5 11a1.1 1.1 0 0 1-1.6-1.6l4.9-4.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CUBE = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M8 1.8 13.5 5v6L8 14.2 2.5 11V5zM2.5 5 8 8.2 13.5 5M8 8.2v6" stroke-linejoin="round"/></svg>';
const STAR = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M8 2.2l1.75 3.6 3.95.55-2.87 2.75.7 3.9L8 11.1l-3.53 1.9.7-3.9L2.3 6.35l3.95-.55z" stroke-linejoin="round"/></svg>';
const CHAT = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" stroke-linejoin="round"/></svg>';

const $app = document.getElementById("app");
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};
const S = {
  session: null, rounds: [], items: [], options: [], comments: [], requests: [], files: [], reviews: [], sig: "",
  feedback: [], wkRefs: [], tasks: [], pendencias: [], roundNotes: [], envio: [], annotations: [],
  ret: { resolved: false, said: {}, call: {} }, drawerTab: "comentarios",
  page: { kind: "round", round: null, scene: null, item: null }, pageKey: "",
  me: store.get(`sala-name-${SIDE}`), drawer: null, mode: {}, uploading: {}, lightbox: null, lbx: null, modal: null,
  navOpen: false, pending: false, flash: null, matFilter: "all",
  ov: { kinds: new Set(), curate: false, dropped: store.get("sala-dropped") === "1", view: store.get("sala-ov-view2") === "grid" ? "grid" : "hero" }, ovList: [], ovSel: (() => { try { return JSON.parse(store.get(`sala-ovsel-${SIDE}`) || "{}") || {}; } catch { return {}; } })(),
  more: null, dl: false, filt: false, sheet: {}, wipe: {}, sideOff: store.get("sala-side-off") === "1", scenesOff: store.get("sala-scenes-off") === "1", infoOff: store.get("sala-info-off") === "1",
  navPages: (() => { try { return JSON.parse(store.get("sala-nav-pages") || "{}"); } catch { return {}; } })(),
  ver: "now", peek: new Set(), vcmp: {},
  // no approval filter any more (Atual shows the client's choice next to our work), and the author filter starts off on every
  // load, like the version: a filter left on from yesterday never hides work
  appr: "all",
  authors: new Set(), itemTab: store.get("sala-item-tab") || "versoes",
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
// act: { label, fn } adds a button to the toast (Desfazer) and keeps it up longer
function toast(msg, err = false, act = null) {
  let t = document.querySelector(".toast");
  if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.append(t); }
  t.textContent = msg;
  const hide = () => { t.style.opacity = 0; t.classList.remove("act"); };
  if (act) {
    const b = Object.assign(document.createElement("button"), { className: "toast-act", textContent: act.label });
    b.onclick = () => { hide(); act.fn(); };
    t.append(b);
  }
  t.classList.toggle("err", err);
  t.classList.toggle("act", !!act);
  t.style.opacity = 1;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hide, act ? 8000 : err ? 5000 : 2200);
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
  if (data.session && roomOf(data.session.user) === SIDE) return false;
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
const kept = (o) => reviewOf(o.id)?.verdict === "keep";
// items with at least one ✓, rebuilt whenever a load brings new options or reviews
let keptMemo = { r: null, o: null, set: new Set() };
function hasKept(itemId) {
  if (keptMemo.r !== S.reviews || keptMemo.o !== S.options) keptMemo = { r: S.reviews, o: S.options, set: new Set(S.options.filter(kept).map((o) => o.item_id)) };
  return keptMemo.set.has(itemId);
}
// What the client sees, mirroring option_dropped() in the database. Each version of a round is its own delivery:
// - in v1, everything not dropped, until the team checks (✓) an option of the item: then only the checked ones;
// - from v2 on, the team's ✓ in this version plus what the client picked in the last one, by click or (our reading of) a
//   comment, and the whole set when it approved a set;
// - what the team decides on "O que vai pro cliente" (envio, per version) beats both.
// Only what the client sees gets a letter, so both rooms say "D" for the same image. the client only receives what it sees (RLS),
// so on its side nothing is off.
const envOf = (id, v) => S.envio.find((e) => e.option_id === id && e.version === v);
const verNow = (it) => roundOf(it?.round_id)?.version || 1;
// how the client picked this option in the version before V: "click" in the room, "talk" in a comment, "set" approving the set
function wkPick(it, o, V) {
  if (o.id === it.chosen_option) return "click";
  const f = fbOf(it.round_id, it.id, V - 1);
  if (f && ["aprovado", "ajustar"].includes(f.status) && f.base_option === o.id) return "talk";
  if (it.mode === "set" && kept(o) && verOf(o) < V && (it.decision === "approved" || f?.status === "aprovado")) return "set";
  return "";
}
// the rule alone, before what the team decided on the page
function wkAuto(o) {
  const it = itemOf(o.item_id), V = verNow(it);
  if (!it || dropped(o)) return false;
  if (V === 1) return kept(o) || !hasKept(o.item_id);
  return (kept(o) && verOf(o) === V) || !!wkPick(it, o, V);
}
let wkMemo = {};
function wkSeen() {
  const k = [S.options, S.reviews, S.envio, S.feedback, S.items, S.rounds];
  if (!wkMemo.k || k.some((x, n) => x !== wkMemo.k[n])) {
    const on = (o) => { const x = envOf(o.id, verNow(itemOf(o.item_id))); return x ? x.include : wkAuto(o); };
    wkMemo = { k, set: new Set(S.options.filter(on).map((o) => o.id)) };
  }
  return wkMemo.set;
}
const offWK = (o) => TEAM && !wkSeen().has(o.id);
// Versões (team): an image and the edits made on it in the studio are one card. A version points at its original
// (options.stack); the original says which member is on the card now (options.face, null = itself). The card is that
// member, in the original's place, so letters, ✓, ✕ and the send to the client all act on what is shown. the client's room is not
// stacked: it sees options one by one, as before.
const optById = (id) => S.options.find((o) => o.id === id);
const stackRoot = (o) => (o?.stack && optById(o.stack)) || o;
const stackOf = (root) => [root, ...S.options.filter((x) => x.stack === root.id).sort((a, b) => a.created_at.localeCompare(b.created_at))];
// a ✕ version never hides its card: while the ✕ ones are hidden, the original shows in its place (the arrows may land
// on a ✕ version)
const faceOf = (o) => {
  const f = o.face && S.options.find((x) => x.id === o.face && x.stack === o.id);
  return f && (!dropped(f) || dropped(o) || showDrop(f)) ? f : o;
};
// Virar card novo: an image moves to another card. A version leaves its stack (its original stops showing it; based_on
// still says where it came from); an original takes its versions along
async function splitTo(id, itemId) {
  const o = optById(id), root = o?.stack ? optById(o.stack) : null;
  if (!o) return;
  const ids = root ? [o.id] : [o.id, ...S.options.filter((x) => x.stack === o.id).map((x) => x.id)];
  let { error } = await sb.from("options").update({ item_id: itemId }).in("id", ids);
  if (error) throw error;
  if (!root) return;
  ({ error } = await sb.from("options").update({ stack: null }).eq("id", o.id));
  if (error) throw error;
  if (root.face === o.id) ({ error } = await sb.from("options").update({ face: null }).eq("id", root.id));
  if (error) throw error;
}
// ---------- Motion (config.js MOTION): the job's motion piece, a page that edits and renders a video, opened over the
// page from the motion button of the cards it is for ----------
// It opens outside the app's re-rendered root, so the iframe survives refreshes, with the settings of the render on the
// card; each render comes back as an MP4: a version of the render it was opened from, else a new image on the card
const MOTION = TEAM && CFG.MOTION?.src ? CFG.MOTION : null;
const MOTION_ICO = '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="2" y="4.5" width="2.4" height="7" rx="1.2"/><rect x="6.8" y="2" width="2.4" height="12" rx="1.2"/><rect x="11.6" y="5.5" width="2.4" height="5" rx="1.2"/></svg>';
const motionOf = (it) => !!MOTION && !!it && (!MOTION.kind || it.kind === MOTION.kind) && (!MOTION.scene || [].concat(MOTION.scene).includes(sceneName(it.scene)));
const motionLabel = () => MOTION?.label || "Motion";
// a render's settings: config.js names its file (name) and reads them back from that name (read); without those the file
// is named after the piece and the time, and a card reopens the piece from its start settings
const motionName = (s) => MOTION.name?.(s) || `${motionLabel().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\W+/g, "-").toLowerCase()}_${Date.now()}.mp4`;
const motionSet = (o) => (o && MOTION.read?.(o.name || "")) || null;
const motionDesc = (s) => MOTION.describe?.(s) || motionLabel();
// a render of the motion piece (the Galeria files these under their own origin)
const motionOpt = (o) => !!MOTION && !!o?.mime?.startsWith("video/") && (MOTION.read ? !!MOTION.read(o.name || "") : (o.model || "").startsWith(motionLabel()));
function openMotion(itemId, fromId) {
  const from = fromId ? optById(fromId) : null, set = motionSet(from);
  closeMotion();
  const ov = document.createElement("div");
  ov.className = "motion-ov";
  ov.dataset.item = itemId;
  ov.dataset.from = set ? from.id : "";
  // a card with no render yet starts from the piece's start settings
  ov.innerHTML = `<iframe src="${new URL(MOTION.src, import.meta.url).href}?embed&${new URLSearchParams(set || MOTION.start || {})}" title="${esc(motionLabel())}"></iframe>`;
  document.body.append(ov);
  ov.querySelector("iframe").focus();
}
const closeMotion = () => document.querySelector(".motion-ov")?.remove();
async function putMotion(itemId, from, s, video, poster) {
  const it = itemOf(itemId), prefix = `items/${itemId}`, id = crypto.randomUUID(), path = `${prefix}/${id}.mp4`;
  const up = await sb.storage.from(BUCKET).upload(path, video, { contentType: "video/mp4" });
  if (up.error) throw up.error;
  const small = poster ? await resized(new File([poster], "poster.jpg", { type: "image/jpeg" })).catch(() => null) : null;
  const put = async (blob, suffix) => { const pp = `${prefix}/${id}.${suffix}.jpg`; const r = blob && (await sb.storage.from(BUCKET).upload(pp, blob, { contentType: "image/jpeg" })); return r && !r.error ? pp : null; };
  const desc = motionDesc(s), root = from ? stackRoot(from) : null;
  const { error } = await sb.from("options").insert({ item_id: itemId, path, preview_path: small ? await put(small.preview, "preview") : null, thumb_path: small ? await put(small.thumb, "thumb") : null,
    mime: "video/mp4", name: motionName(s), caption: desc, prompt: desc, model: MOTION.model?.(s) || motionLabel(), created_by: myName(),
    version: roundOf(it?.round_id)?.version || 1, based_on: from?.id || null, stack: root?.id || null });
  if (error) throw error;
  if (it?.status === "todo") await sb.from("items").update({ status: "doing" }).eq("id", itemId);
  await refresh();
}
addEventListener("message", async (e) => {
  const ov = document.querySelector(".motion-ov"), fr = ov?.querySelector("iframe");
  if (!ov || e.origin !== location.origin || e.source !== fr?.contentWindow) return;
  if (e.data?.type === "motion:close") return closeMotion();
  if (e.data?.type !== "motion:render") return;
  const { settings, video, poster } = e.data;
  try {
    await putMotion(ov.dataset.item, ov.dataset.from ? optById(ov.dataset.from) : null, settings, video, poster);
    closeMotion();
    toast("O vídeo entrou no card");
  } catch (err) {
    console.error(err);
    fr.contentWindow.postMessage({ type: "motion:status", text: `Não subiu: ${err.message || err}` }, location.origin);
    toast(`O vídeo não subiu: ${err.message || err}`, true);
  }
});
addEventListener("keydown", (e) => { if (e.key === "Escape" && document.querySelector(".motion-ov")) { e.stopImmediatePropagation(); closeMotion(); } }, true);
// the client's pick, on the card that shows it now: the client chose an original whose card may show a later version of it (the headless
// sheet of an approved person, an edit made in the studio), so the pick is the whole stack
const isPick = (it, o) => {
  if (!it.chosen_option || !o) return false;
  if (o.id === it.chosen_option) return true;
  const c = optById(it.chosen_option);
  return !!c && stackRoot(c).id === stackRoot(o).id;
};
// team order: what the client sees (lettered), then what the ✓ rule hides, then the dropped ones
const optsOf = (id) => {
  const all = S.options.filter((o) => o.item_id === id);
  if (!TEAM) return all;
  const list = all.filter((o) => !o.stack || !all.some((r) => r.id === o.stack)).map(faceOf);
  const hidden = list.filter((o) => offWK(o) && !dropped(o));
  return [...list.filter((o) => !offWK(o)), ...hidden, ...list.filter(dropped)];
};
const wkOpts = (id) => optsOf(id).filter((o) => !offWK(o));
// the letter the client sees for this option, or "" when the client does not see it
function letterOf(it, o) {
  const i = wkOpts(it.id).indexOf(o);
  return i >= 0 ? letter(i) : "";
}
// dropped options stay hidden unless "Mostrar descartadas" is on (then last, dimmed, with the ✕ and the reason).
// "Mostrar" on a card the filters hide (S.peek) shows that one card as if no filter were on, until a filter changes
const peeked = (id) => TEAM && S.peek.has(id);
const showDrop = (o) => S.ov.dropped || peeked(o.item_id);
const isAngle = (o) => o.model === "Blocking 3D";
const shownOpts = (id) => optsOf(id).filter((o) => !isAngle(o) && (showDrop(o) || !dropped(o)) && inView(o)).sort((a, b) => verOf(b) - verOf(a));
// versions: inside a delivery round, each round of client feedback is a version (v1 the first delivery, v2 the answer
// to the first feedback…); the team's own redos are just options. New uploads take the round's version. The team
// sees the newest version of each card by default (a card that did not change keeps showing the older one), can
// pick one version or all of them, and can wipe each new option against the one it came from (based_on)
const verOf = (o) => o.version || 1;
let lvMemo = { k: null, m: new Map() };
const latestVer = (id) => {
  if (lvMemo.k !== S.options) lvMemo = { k: S.options, m: new Map() };
  if (!lvMemo.m.has(id)) lvMemo.m.set(id, optsOf(id).filter((o) => !isAngle(o)).reduce((m, o) => Math.max(m, verOf(o)), 1));
  return lvMemo.m.get(id);
};
const roundVers = (rid) => [...new Set(S.options.filter((o) => !isAngle(o) && itemOf(o.item_id)?.round_id === rid).map(verOf))].sort((a, b) => b - a);
const inVer = (o) => !TEAM || S.ver === "all" || (S.ver === "now" || peeked(o.item_id) ? verOf(o) === latestVer(o.item_id) : verOf(o) === +S.ver);
// approval filter (team): ✓ Equipe = what the team kept (what the client sees, or will see once the round is sent);
// ★ Cliente = what the client approved: the option it chose, plus the ✓ options of an item approved as a whole (decision
// approved, or our feedback says aprovado with nothing chosen, e.g. approved by message). It combines with the
// version selector; on "Atual" it looks at every version, since what is approved may be an older one.
function clientOk(o) {
  const it = itemOf(o.item_id);
  if (!it) return false;
  if (isPick(it, o)) return true;
  const whole = it.decision === "approved" || (!it.chosen_option && lastFbOf(it.id)?.status === "aprovado");
  return whole && kept(o) && !offWK(o);
}
const inAppr = (o) => !TEAM || S.appr === "all" || peeked(o.item_id) || (S.appr === "team" ? kept(o) : clientOk(o));
// who made the option (options.created_by): a person of the team, Claude…; combines with the version and approval filters
const inAuthor = (o) => !TEAM || !S.authors.size || peeked(o.item_id) || S.authors.has(o.created_by || "");
// with an approval or author filter on "Atual", every version counts (what matches may be an older one)
const toggleIn = (set, v) => (v === "all" ? set.clear() : set.has(v) ? set.delete(v) : set.add(v));
const filtering = () => TEAM && (S.appr !== "all" || S.authors.size > 0);
const inView = (o) => (filtering() && S.ver === "now" && !peeked(o.item_id) ? true : inVer(o)) && inAppr(o) && inAuthor(o);
// a card is on screen when something of it passes the filters (an item with no options yet, unless a filter is on)
const hasView = (it) => !TEAM || (optsOf(it.id).length ? shownOpts(it.id).length > 0 : !filtering());
// "Ver todas juntas" and the Versões groups: every version (or the one picked), with the same approval, author and dropped filters
const sheetOpts = (it) => optsOf(it.id).filter((o) => !isAngle(o) && (showDrop(o) || !dropped(o)) && inAppr(o) && inAuthor(o) && (S.ver === "now" || S.ver === "all" || peeked(it.id) || verOf(o) === +S.ver));
// a card the filters hide stays in its place as one slim line: why it is hidden, what is new in it, Mostrar (just this
// card) and, on its own page, Limpar. "Locação · Alpendre · escondido pelos filtros (v1, ★ Cliente) · 4 novas na v2 · Mostrar"
function hiddenRow(r, it, { page = false } = {}) {
  const opts = optsOf(it.id);
  const why = [S.ver !== "now" && S.ver !== "all" ? `v${esc(S.ver)}` : "", S.appr !== "all" ? APPR[S.appr] : "", S.authors.size ? esc([...S.authors].join(", ")) : "",
    !S.ov.dropped && opts.some((o) => dropped(o) && inView(o)) ? "sem descartadas" : ""].filter(Boolean).join(", ");
  const lv = latestVer(it.id), fresh = opts.filter((o) => verOf(o) === lv && !dropped(o)).length;
  const news = !opts.length ? "sem opções ainda" : fresh && lv > 1 ? `${fresh} ${fresh === 1 ? "nova" : "novas"} na v${lv}` : fresh ? plural(fresh, "opção", "opções") : "";
  const parts = [page ? "" : `<span class="hrow-kind">${KINDS[it.kind] || ""}</span><a class="hrow-title" href="${sceneHref(r.id, it.scene, it.id)}" title="Abrir o item">${esc(it.title)}</a>`,
    `<span class="hrow-why">${page ? "Nada com esses filtros" : "escondido pelos filtros"}${why ? ` (${why})` : ""}</span>`,
    news ? `<span class="hrow-new">${news}</span>` : "",
    page ? '<button class="link" data-act="filt-off" data-v="all" title="Tirar todos os filtros">Limpar</button>' : ""].filter(Boolean);
  return `<div class="hrow ${page ? "page" : ""}" id="${page ? "" : `item-${it.id}`}">${parts.join('<i class="hrow-dot" aria-hidden="true">·</i>')}</div>`;
}
// the quiet line after the filter chips when a filter hides cards: "3 itens sem nada aprovado pelo cliente de Ana na v2"
function apprNote(n) {
  if (!n) return "";
  const what = S.appr === "team" ? " aprovado pela equipe" : S.appr === "client" ? " aprovado pelo cliente" : "";
  const who = S.authors.size ? ` de ${esc([...S.authors].join(" e "))}` : "";
  const ver = S.ver !== "now" ? ` na ${S.ver === "all" ? "rodada" : `v${S.ver}`}` : "";
  return `${plural(n, "item", "itens")} sem nada${what}${who}${ver}`;
}
function verBase(o) {
  for (let b = o, n = 0; b?.based_on && n < 8; n++) {
    b = S.options.find((x) => x.id === b.based_on);
    if (b && verOf(b) < verOf(o)) return b;
  }
  return null;
}
const verPairs = (it) => optsOf(it.id).filter((o) => verOf(o) > 1 && (showDrop(o) || !dropped(o)))
  .map((o) => { const b = verBase(o); return b && { blocking: b, ia: o, ver: true, l: `v${verOf(b)}`, r: `v${verOf(o)}` }; }).filter(Boolean);
const wipePairs = (id) => (S.vcmp[id] ? verPairs(itemOf(id)) : pairsOf(shownOpts(id)));
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

// What the client answered in a round, team-only: our reading of each item (feedback), the references they gave (feedback_refs),
// what is still open (pendências), the tasks it creates, and the round's agreements (round_notes).
const FB = { aprovado: "Aprovado", ajustar: "Ajustar", refazer: "Refazer", novo: "Caminho novo", espera: `Esperando ${A_CL}` };
const PEND = { perguntar: `Perguntar ${AO_CL}`, receber: `Receber ${DA_CL}`, decidir: "Decidir" };
const SRC = { deck: "Deck", sala: "Sala", whatsapp: "WhatsApp", conversa: "Conversa", nossa: "Nossa", material: "Material" };
// item_feedback is per version: f.version is the version the client talked about (v1), answered in the next one (v2).
// The Retorno of a round shows one version's feedback at a time, the newest by default.
const fbVers = (rid) => [...new Set(S.feedback.filter((f) => f.round_id === rid).map((f) => f.version || 1))].sort((a, b) => b - a);
const retVer = (rid) => { const vs = fbVers(rid); return vs.includes(S.ret.ver) ? S.ret.ver : vs[0] || 1; };
const fbOf = (rid, id, v) => S.feedback.filter((f) => f.round_id === rid && f.item_id === id && (v == null || f.version === v)).sort((a, b) => b.version - a.version)[0];
const fbRounds = () => S.rounds.filter((r) => S.feedback.some((f) => f.round_id === r.id));
// the newest feedback on this item (the latest round, the latest version)
const lastFbOf = (id) => S.feedback.filter((f) => f.item_id === id).sort((a, b) => (roundOf(b.round_id)?.sort || 0) - (roundOf(a.round_id)?.sort || 0) || b.version - a.version)[0];
const byVer = (v) => (x) => v == null || (x.version || 1) === v;
const tasksOf = (rid, id, v) => S.tasks.filter((t) => t.round_id === rid && t.item_id === id).filter(byVer(v));
const pendOf = (rid, id, v) => S.pendencias.filter((p) => p.round_id === rid && p.item_id === id).filter(byVer(v));
const wkRefsOf = (rid, id, v) => S.wkRefs.filter((x) => x.round_id === rid && x.item_id === id).filter(byVer(v));
// what answers the feedback on version v: the options of the next version, newest first
const answerOpts = (it, v) => optsOf(it.id).filter((o) => verOf(o) === v + 1).sort((a, b) => b.created_at.localeCompare(a.created_at));
const ytId = (url) => (url || "").match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/)?.[1] || null;
const mmss = (s) => (s == null ? "" : `${Math.floor(s / 60)}:${two(s % 60)}`);
function parseMmss(v) {
  const m = v.trim().match(/^(\d+)(?::(\d{1,2}))?$/);
  return m ? (m[2] === undefined ? +m[1] : +m[1] * 60 + +m[2]) : null;
}

async function load(force = false) {
  const q = (t, col) => sb.from(t).select("*").order(col);
  const team = TEAM ? [q("option_reviews", "updated_at"), q("item_feedback", "updated_at"), q("feedback_refs", "sort"), q("tasks", "sort"), q("pendencias", "sort"), q("round_notes", "updated_at"), q("envio", "updated_at"),
    sb.from("blocking_shots").select("option_id, item_id, camera, created_at").order("created_at")] : [];
  // drawings (estudio.js): the client gets its own, the team gets all of them
  const res = await Promise.all([q("rounds", "sort"), q("items", "sort"), q("options", "sort"), q("comments", "created_at"), q("requests", "sort"), q("request_files", "created_at"), q("annotations", "created_at"), ...team]);
  const bad = res.find((r) => r.error);
  if (bad) throw bad.error;
  const sig = JSON.stringify(res.map((r) => r.data));
  if (!force && sig === S.sig) return false;
  const [rounds, items, options, comments, requests, files, annotations, reviews = [], feedback = [], wkRefs = [], tasks = [], pendencias = [], roundNotes = [], envio = [], bshots = []] = res.map((r) => r.data);
  Object.assign(S, { rounds, items, options, comments, requests, files, annotations, reviews, feedback, wkRefs, tasks, pendencias, roundNotes, envio, bshots, sig });
  return true;
}
async function refresh() { await loadNovas().catch(() => {}); await load(true); await warm().catch(() => {}); resolvePage(); render(true); }
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

// ---------- routing: #/r/a1 · #/r/a1/visao · #/r/a1/s/7[/itemId] · #/r/a1/retorno[/itemId] · #/apresentacao · #/materiais · #/galeria ----------
function resolvePage() {
  const h = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  let p;
  if (h[0] === "materiais") p = { kind: "materiais" };
  else if (h[0] === "aprovado" && TEAM) p = { kind: "aprovado", round: S.page.round };
  else if (h[0] === "galeria" && TEAM) p = { kind: "galeria", round: S.page.round };
  else if (h[0] === "apresentacao" && TEAM) p = { kind: "apresentacao", round: S.page.round };
  else if (h[0] === "r" && visibleRounds().some((r) => r.id === h[1])) {
    p = h[2] === "s" && h[3] !== undefined ? { kind: "scene", round: h[1], scene: +h[3], item: h[4] || null, tab: h[5] || null }
      : (h[2] === "fazer" || h[2] === "quem") && TEAM ? { kind: "board", round: h[1] }
      : h[2] === "visao" && TEAM ? { kind: "overview", round: h[1] }
      : h[2] === "envio" && TEAM ? { kind: "envio", round: h[1], item: h[3] || null }
      : h[2] === "retorno" && TEAM ? { kind: "retorno", round: h[1], view: { comparar: "cmp", lista: "list" }[h[3]] || null, item: { comparar: 1, lista: 1 }[h[3]] ? null : h[3] || null }
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
  // the team opens a card on its own (its own page); the client still scrolls to it on the page and flashes it
  const key = `${S.page.kind}/${S.page.round}/${S.page.scene}${TEAM ? `/${S.page.item || ""}` : ""}`;
  const changed = key !== S.pageKey;
  S.pageKey = key;
  if (changed) { S.drawer = null; S.navOpen = false; }
  if (S.page.kind === "scene" && S.page.tab && ITEM_TABS[S.page.tab]) { S.itemTab = S.page.tab; store.set("sala-item-tab", S.itemTab); }
  // an item link to the Retorno opens its request in the panel
  if (S.page.kind === "retorno" && S.page.item) { S.drawer = S.page.item; S.drawerTab = "pedido"; }
  // a card page's old Pedido link opens the request in the panel, over the card
  if (S.page.kind === "scene" && S.page.item && S.page.tab === "pedido") { S.drawer = S.page.item; S.drawerTab = lastFbOf(S.page.item) ? "pedido" : "comentarios"; }
  // the team opens a card on its own page (no flash); the Retorno, O que vai pra the client and the client still scroll to the item and flash it
  S.flash = TEAM && !["retorno", "envio"].includes(S.page.kind) ? null : S.page.item || null;
  render(true, changed);
  if (S.flash) {
    const el = document.getElementById(`item-${S.flash}`);
    // a long page jumps (a smooth scroll is cut short by the renders that follow the first load)
    el?.scrollIntoView(S.page.kind === "envio" ? { block: "start" } : { block: "nearest", behavior: "smooth" });
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
    const { data } = await sb.storage.from(BUCKET).createSignedUrls(missing.slice(i, i + 100), URL_TTL);
    (data || []).forEach((d) => d.signedUrl && urls.set(d.path, d.signedUrl));
  }
}
const warm = () => sign([
  ...S.options.flatMap((o) => (o.mime.startsWith("video/") ? [o.path, o.preview_path] : [o.preview_path || o.path, o.thumb_path])),
  ...S.files.map((f) => f.thumb_path || f.preview_path || (f.mime.startsWith("image/") ? f.path : null)),
  ...S.wkRefs.map((x) => x.path),
]);
async function hydrate() {
  const els = [...$app.querySelectorAll("[data-path]")], posters = [...$app.querySelectorAll("[data-poster]")];
  await sign([...els.map((e) => e.dataset.path), ...posters.map((e) => e.dataset.poster)]);
  els.forEach((e) => { const u = urls.get(e.dataset.path); if (u && e.getAttribute("src") !== u) e.src = u; });
  posters.forEach((e) => { const u = urls.get(e.dataset.poster); if (u && e.getAttribute("poster") !== u) e.poster = u; });
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
    // a video with a still (its poster, like a motion render's last frame) shows it until it plays
    const pp = o.preview_path, poster = pp ? ` data-poster="${esc(pp)}"${urls.has(pp) ? ` poster="${esc(urls.get(pp))}"` : ""}` : "";
    return `<video data-path="${esc(o.path)}"${poster} ${size === "big" ? "controls autoplay" : "muted loop"} playsinline preload="metadata"${srcAttr(o.path)}></video>`;
  }
  const p = (size === "thumb" && o.thumb_path) || o.preview_path || o.path;
  return `<img data-path="${esc(p)}" alt="${esc(o.caption || o.name)}" decoding="async"${srcAttr(p)}>`;
}
// ---------- a card's video plays under the mouse ----------
// muted and looping while the mouse is on its card or tile, back to its still when it leaves; only the one under the
// mouse plays, and it starts loading then. A render moves the playing element into the new page, so it goes on. On a
// touch screen the small ▶ on the card plays and stops it in place (a tap elsewhere still opens it big). A Galeria tile
// that shows only a still (data-vid) gets its video laid over it while the mouse is there
const VBOX = ".csh-tile, .ctile, .gal-t, .hero, .sitem-media";
const vplayBtn = (o) => (o.mime.startsWith("video/") ? `<span class="vplay" data-act="vplay" role="button" aria-label="Tocar ou parar o vídeo">${ICON.play}</span>` : "");
let vOn = null;
function vidIn(t, make = false) {
  const box = t?.closest?.(VBOX);
  if (!box) return null;
  const vs = box.querySelectorAll("video:not([controls])");
  if (vs.length === 1) return vs[0];
  if (vs.length || !make || !box.dataset.vid) return null;
  const v = Object.assign(document.createElement("video"), { className: "vhover" });
  v.dataset.path = box.dataset.vid;
  v.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none";
  box.append(v);
  return v;
}
async function vPlay(v) {
  if (vOn && vOn !== v) vStop(vOn);
  vOn = v;
  Object.assign(v, { muted: true, loop: true, playsInline: true, preload: "auto" });
  const p = v.dataset.path;
  if (p && !v.getAttribute("src")) {
    await sign([p]).catch(() => {});
    if (vOn !== v || !urls.get(p)) return;
    v.src = urls.get(p);
  }
  v.closest(VBOX)?.classList.add("vplaying");
  v.play().catch(() => {});
}
function vStop(v) {
  v.pause();
  v.closest(VBOX)?.classList.remove("vplaying");
  if (vOn === v) vOn = null;
  if (v.classList.contains("vhover")) return v.remove();
  if (v.poster) v.load(); // back to its still
  else try { v.currentTime = 0; } catch {}
}
document.addEventListener("pointerover", (e) => {
  if (e.pointerType !== "mouse") return;
  const v = vidIn(e.target, true);
  if (v && v !== vOn) vPlay(v);
});
document.addEventListener("pointerout", (e) => {
  if (e.pointerType !== "mouse" || !vOn || vidIn(e.relatedTarget) === vOn) return;
  vStop(vOn);
});

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
  const up = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || "application/octet-stream" });
  if (up.error) throw up.error;
  let preview_path = null, thumb_path = null;
  const small = await resized(file).catch(() => null);
  if (small) {
    const put = async (blob, suffix) => {
      const pp = `${prefix}/${id}.${suffix}.jpg`;
      const r = blob && (await sb.storage.from(BUCKET).upload(pp, blob, { contentType: "image/jpeg" }));
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
    const { error } = await sb.from("options").insert({ item_id: itemId, path: m.path, preview_path: m.preview_path, thumb_path: m.thumb_path, mime: m.mime, name: m.name, created_by: myName(), version: roundOf(it?.round_id)?.version || 1 });
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
// what estudio.js needs from the room: data, the uploader, the URL cache and a way back into the lightbox
function openOption(id) {
  const o = S.options.find((x) => x.id === id);
  if (!o) return;
  S.lightbox = { id: o.item_id, i: optsOf(o.item_id).indexOf(o) };
  render(true);
}
// the AI studio (estudio.js) is optional: ESTUDIO.on in config.js turns on its ✦ buttons; drawing on an image works either way
const AI = !!ESTUDIO?.on;
const estCtx = () => ({ sb, SIDE, TEAM, S, esc, itemOf, optsOf, letterOf, roundOf, putFile, refresh, toast, myName, sign, urls, sceneName, openOption, sceneLook: (n) => lookOf(n)?.label || "",
  fnUrl: `${SUPABASE_URL}/functions/v1/${ESTUDIO.fn || "estudio"}`, anonKey: SUPABASE_KEY, schema: SCHEMA, bucket: BUCKET, ai: AI,
  // the Galeria's Soul ID training (and the studio's Soul 2) go through their own edge function, named after the
  // studio's unless config.js says otherwise (estudio → souls, sala-estudio → sala-souls)
  soulsUrl: `${SUPABASE_URL}/functions/v1/${ESTUDIO.souls || (ESTUDIO.fn || "estudio").replace(/estudio$/, "souls")}`,
  // a render's blocking opens in its location's Cena 3D on that angle; the 3D's save hands the new angle back to the render
  openCena3d: (o) => { const it = itemOf(o.item_id); if (it) location.hash = `${sceneHref(it.round_id, it.scene, it.id)}/cena3d/${o.id}`; },
  heldRender: () => Estudio.heldRender(), takeAngle: (id) => Estudio.takeAngle(estCtx(), id), dropHeld: () => Estudio.dropHeld(estCtx()),
  // a 3D opened from a shot's card: Renderizar sends the new angle's render to that card (how: its prompt box's text and
  // Fiel / Solto); ✕ and Esc go back (leave3d)
  renderBlocking: (optionId, itemId, how = {}) => Estudio.renderBlocking(estCtx(), { optionId, itemId, ...how }), leave3d });
// Galeria (galeria.js): everything the room made or received, to filter, select and act on with the right click.
// Team only, loaded on the first visit; it draws inside page() like any other page
let Galeria = null;
function galeriaPage() {
  if (Galeria) return Galeria.page();
  if (!S.galLoading) {
    S.galLoading = true;
    import("./galeria.js").then((m) => { Galeria = m; m.init(galCtx()); render(true); })
      .catch((e) => { console.error(e); S.galLoading = false; toast("A Galeria não carregou.", true); });
  }
  return head("Galeria", "Carregando…", "") + '<div class="main-body"></div>';
}
const galCtx = () => ({ ...estCtx(), studioCtx: estCtx, Estudio, render, head, run, dlName, zipDownload, openFile, approvedOpts, isPick, reviewOf, offWK, stackRoot,
  sceneHref, fmtTime, KINDS, STAR, ICO, CL, DA_CL, TZ, motionLabel: MOTION ? motionLabel() : "", isMotion: motionOpt });
const drawsOf = (o) => S.annotations.filter((a) => a.option_id === o.id && !a.resolved).length;
async function signed(path, name, download) {
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, 3600, download ? { download: name || true } : undefined);
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
      if (f.text != null) { zip.file(entry, f.text); continue; }
      if (f.blob) { zip.file(entry, await f.blob()); continue; }
      const res = await fetch(await signed(f.path, f.name, false));
      if (!res.ok) throw new Error(f.name);
      zip.file(entry, await res.blob());
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `${clean(name)}.zip` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    toast(`${clean(name)}.zip pronto`);
    return true;
  } catch (e) {
    console.error(e);
    toast("Não consegui montar o .zip. Tente baixar os arquivos um a um.", true);
    return false;
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
  const ci = opts.findIndex((o) => isPick(it, o));
  const L = ci >= 0 && wkOpts(it.id).length > 1 ? letterOf(it, opts[ci]) : "";
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
  const row = { option_id: optionId, verdict: cur.verdict ?? null, note: cur.note ?? "", ...patch, author: myName(), updated_at: new Date().toISOString() };
  S.reviews = [...S.reviews.filter((r) => r.option_id !== optionId), row];
  render(true);
  run(async () => {
    const { error } = await sb.from("option_reviews").upsert(row);
    if (error) throw error;
  }, patch.verdict === "drop" ? "Descartada: o cliente não vai ver esta opção" : undefined);
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
  if (el.dataset.fb) return `fb:${el.dataset.fb}:${el.dataset.id}`;
  if (el.dataset.pendAnswer) return `pa:${el.dataset.pendAnswer}`;
  if (el.dataset.taskText) return `tt:${el.dataset.taskText}`;
  if (el.dataset.refT) return `rt:${el.dataset.refT}`;
  if (el.dataset.rnote) return `rn:${el.dataset.rnote}`;
  const form = el.closest("[data-form]");
  return form && el.name ? `${form.dataset.form}:${el.name}` : null;
}
function render(force = false, newPage = false) {
  const a = document.activeElement;
  const typing = a && $app.contains(a) && (a.tagName === "TEXTAREA" || (a.tagName === "INPUT" && a.type !== "file"));
  if (S.reorder && !S.reorder.el.isConnected) S.reorder = null;
  if (!force && (typing || S.lightbox || S.modal || S.reorder)) { S.pending = true; return; }
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
  $app.querySelectorAll("textarea.brief, textarea.ret-notes, textarea.ret-basenote, textarea.btask-text").forEach(fit);
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
      ${TEAM ? `<a class="nav ${S.page.kind === "apresentacao" ? "on" : ""}" href="#/apresentacao"><span class="ico">${ICON.deck}</span>Apresentação</a>` : ""}
      ${visibleRounds().length ? `<div class="rtabs ${TEAM ? "team" : ""}">${visibleRounds().map((x) => `<a class="${x.id === rid ? "on" : ""}" href="#/r/${x.id}${TEAM && S.page.kind === "retorno" && S.feedback.some((f) => f.round_id === x.id) ? "/retorno" : ""}" title="${esc(x.title)} · até ${fmtShort(x.due)}">${esc(x.code)}</a>`).join("")}</div>` : ""}
      ${r && TEAM ? teamNav(r, scenes)
        : r ? `<p class="side-label">${esc(r.title)} · ${fmtShort(r.due)}</p>
        ${navGroup(r, scenes)}
        <a class="nav ${S.page.kind === "review" ? "on" : ""}" href="#/r/${r.id}/resumo"><span class="ico">${ICO.keep}</span>Resumo e confirmação${r.confirmed_at ? '<i class="dot ok"></i>' : ""}</a>`
        : S.rounds[0] ? `<p class="side-note">As opções da ${roundLabel(S.rounds[0])} · ${esc(S.rounds[0].title)} entram aqui até ${fmtDay(S.rounds[0].due)}.</p>` : ""}
      <p class="side-label">${TEAM ? "Job" : "Materiais"}</p>
      ${TEAM ? `<a class="nav ${S.page.kind === "galeria" ? "on" : ""}" href="#/galeria" title="Tudo o que a sala gerou e recebeu: filtrar, selecionar e agir (botão direito)"><span class="ico">${ICON.grid}</span>Galeria</a>` : ""}
      ${TEAM ? `<a class="nav ${S.page.kind === "aprovado" ? "on" : ""}" href="#/aprovado" title="Tudo o que o cliente aprovou até agora, na versão atual, pra baixar de uma vez"><span class="ico">${STAR}</span>Aprovado</a>` : ""}
      <a class="nav ${S.page.kind === "materiais" ? "on" : ""}" href="#/materiais"><span class="ico">${ICON.up}</span>${TEAM ? "Materiais" : "O que precisamos"}${newFiles ? `<b class="badge">${newFiles}</b>` : ""}</a>
    </nav>
    <div class="side-foot">
      <button class="link me" data-act="whoami" title="Trocar nome">${esc(TEAM ? PEOPLE[S.me] || "Quem é você?" : S.me || "Seu nome")}</button>
      ${TEAM ? `<a class="link" href="../aprovacao/" target="_blank" rel="noopener">Sala do cliente ↗</a>` : ""}
      <button class="link" data-act="logout">Sair</button>
    </div>
  </aside>`;
}
// team: the round in the order the job happens, two steps: we produce, the client approves and answers. Short, generic
// names; the version shows on the page that needs it. Retorno stays in place, dimmed, until the client answers
function teamNav(r, scenes) {
  const rid = r.id;
  const hasFb = S.feedback.some((f) => f.round_id === rid);
  const open = S.pendencias.filter((p) => p.round_id === rid && !p.resolved).length;
  const review = itemsOf(rid).filter((it) => todoOf(it, r).g === "revisar").length;
  return `<p class="side-label">${esc(r.title)} · ${fmtShort(r.due)}</p>
    <p class="side-step"><span>1</span>Produção</p>
    <a class="nav ${["round", "board"].includes(S.page.kind) ? "on" : ""}" href="#/r/${rid}/fazer" title="Quem faz o quê: arraste cards e tarefas entre as pessoas"><span class="ico">${BOARD}</span>A fazer${review ? `<b class="badge" title="${plural(review, "item com opções novas", "itens com opções novas")} sem ✓ nem ✕">${review}</b>` : ""}</a>
    ${navGroup(r, scenes)}
    <p class="side-step"><span>2</span>Aprovação</p>
    <a class="nav ${S.page.kind === "envio" ? "on" : ""}" href="#/r/${rid}/envio" title="O que o cliente vê nesta versão"><span class="ico">${ICON.send}</span>Envio</a>
    <a class="nav ${S.page.kind === "review" ? "on" : ""}" href="#/r/${rid}/resumo" title="O que o cliente escolheu nesta rodada"><span class="ico">${STAR}</span>Escolhas${r.confirmed_at ? '<i class="dot ok"></i>' : ""}</a>
    ${hasFb ? `<a class="nav ${S.page.kind === "retorno" ? "on" : ""}" href="#/r/${rid}/retorno" title="O que o cliente pediu e o que fazer"><span class="ico">${ICON.back}</span>Retorno${open ? `<b class="badge" title="Em aberto">${open}</b>` : ""}</a>`
      : `<span class="nav off" title="Entra quando o cliente responder a ${esc(r.code)}"><span class="ico">${ICON.back}</span>Retorno</span>`}`;
}
// the scenes are children of the overview (client: of the presentation); the group folds, the open scene always shows
function navGroup(r, scenes) {
  const onScene = (n) => S.page.kind === "scene" && S.page.round === r.id && S.page.scene === n;
  const parentOn = TEAM ? S.page.kind === "overview" : S.page.kind === "round";
  // team: outside Produção (Aprovação, Retorno) the scenes fold so the three steps stay in view
  const inProd = !TEAM || ["overview", "scene", "round"].includes(S.page.kind);
  const kids = scenes.filter(([n]) => (!S.scenesOff && inProd) || onScene(n));
  return `<div class="nav-group">
    <div class="nav-parent"><a class="nav ${parentOn ? "on" : ""}" href="#/r/${r.id}${TEAM ? "/visao" : ""}"><span class="ico">${TEAM ? ICON.list : ICON.grid}</span>${TEAM ? "Visão geral" : "Apresentação"}</a>
      ${scenes.length && inProd ? `<button class="nav-fold ${S.scenesOff ? "" : "open"}" data-act="fold" aria-expanded="${!S.scenesOff}" title="${S.scenesOff ? "Mostrar" : "Esconder"} as cenas" aria-label="${S.scenesOff ? "Mostrar" : "Esconder"} as cenas"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M6 4l4 4-4 4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>` : ""}</div>
    ${kids.length ? `<div class="nav-kids">${kids.map(([n, list]) => {
      const row = `<a class="nav ${onScene(n) ? (S.page.item && TEAM ? "in" : "on") : ""}" href="${sceneHref(r.id, n)}"><span class="num">${tag(n)}</span>${esc(sceneName(n))}<i class="dot ${sceneDot(list)}"></i></a>`;
      if (!TEAM) return row;
      const open = pageOpen(n, onScene(n));
      return `<div class="nav-parent">${row}${foldButton("fold-page", open, "os cards", n)}</div>${open ? navItems(r, n, list) : ""}`;
    }).join("")}</div>` : ""}
  </div>`;
}
// each page folds its list of cards on its own, like Visão geral folds the pages; by default only the open page is unfolded
const pageOpen = (n, current) => S.navPages[n] ?? current;
const foldButton = (act, open, what, v = "") => `<button class="nav-fold ${open ? "open" : ""}" data-act="${act}" data-v="${v}" aria-expanded="${open}" title="${open ? "Esconder" : "Mostrar"} ${what}" aria-label="${open ? "Esconder" : "Mostrar"} ${what}"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M6 4l4 4-4 4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;
// the open page lists its cards (team): a click shows that card alone, the page row goes back to all of them
function navItems(r, n, list) {
  return `<div class="nav-items">${list.map((it) => {
    const [cls, label] = stageOf(it);
    return `<a class="nav nav-item ${S.page.item === it.id ? "on" : ""}" href="${sceneHref(r.id, n, it.id)}" draggable="true"${orderOf(it)} title="${esc(it.title)} · ${label} · arraste para mudar a ordem"><i class="ovx-dot ${cls}"></i><span>${KINDS[it.kind] ? `<small class="nav-kind">${KINDS[it.kind]} ·</small> ` : ""}${esc(it.title)}</span></a>`;
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
  if (p.kind === "apresentacao") return deckPage();
  if (p.kind === "aprovado") return approvedPage();
  if (p.kind === "galeria") return galeriaPage();
  const r = roundOf(p.round);
  if (!r) return head("Em breve", "", "") + `<div class="main-body"></div>`;
  if (p.kind === "retorno") return retornoPage(r);
  if (p.kind === "scene") return scenePage(r, p.scene);
  if (p.kind === "overview") return overviewPage(r);
  if (p.kind === "review") return TEAM ? choicesPage(r) : reviewPage(r);
  if (p.kind === "envio") return envioPage(r);
  if (p.kind === "board") return boardPage(r);
  return TEAM ? boardPage(r) : summaryPage(r);
}

// the page head's actions are round icon buttons with tooltips; a disabled one keeps its tooltip on a wrapper
// (a disabled .btn takes no pointer events)
function sendButton(r) {
  const n = itemsOf(r.id).filter(sendable).length;
  const label = n ? `Enviar ${plural(n, "item", "itens")} para ${A_CL}` : "Nada pronto para enviar";
  return `<span class="hico-tip" title="${label}&#10;Mostra para ${A_CL} os itens marcados como Pronto: só as opções com ✓ quando o item tem alguma, senão todas menos as descartadas"><button class="btn primary hico" data-act="send" ${n ? "" : "disabled"} aria-label="${label}">${ICON.send}${n ? `<b class="badge">${n}</b>` : ""}</button></span>`;
}
// the bar over the cards (overview, scene pages, an item's Versões): on the overview, how to view; one Filtros button
// opens the rest (round, approval, author, type, the toggles) and what is on shows as chips underneath.
// ctx: view and kinds (overview), curate / dropped (the toggles that apply on the page), cls; note: the line after the chips
const APPR = { team: "✓ Equipe", client: "★ Cliente" };
function filtersOn(ctx) {
  const on = [];
  if (S.ver !== "now") on.push(["ver", S.ver === "all" ? "Todas as rodadas" : `Só a v${S.ver}`]);
  if (S.appr !== "all") on.push(["appr", APPR[S.appr]]);
  for (const a of S.authors) on.push([`author:${a}`, a]);
  if (ctx.kinds?.length > 1) for (const k of S.ov.kinds) if (ctx.kinds.includes(k)) on.push([`kind:${k}`, KINDS[k]]);
  if (ctx.curate && S.ov.curate) on.push(["curate", "Só o que falta curar"]);
  if (ctx.dropped && S.ov.dropped) on.push(["dropped", "Com descartadas"]);
  return on;
}
function filterBar(r, ctx, note = "") {
  if (!TEAM) return "";
  const on = filtersOn(ctx);
  const opt = (act, v, label, cur, t = "") => `<button class="fopt ${cur ? "on" : ""}" data-act="${act}" data-v="${esc(v)}" aria-pressed="${cur}" ${t ? `title="${t}"` : ""}>${label}</button>`;
  const group = (t, body) => `<section class="filt-group"><p class="filt-label">${t}</p><div class="filt-opts">${body}</div></section>`;
  const tog = (act, label, isOn, t) => `<button class="filt-tog ${isOn ? "on" : ""}" role="switch" aria-checked="${isOn}" data-act="${act}" title="${t}"><span class="filt-sw" aria-hidden="true"></span>${label}</button>`;
  const pool = S.options.filter((o) => itemOf(o.item_id)?.round_id === r.id && (S.ver === "now" || inVer(o)) && inAppr(o) && !dropped(o));
  const authors = [...new Set(pool.map((o) => o.created_by).filter(Boolean))].sort((a, b) => pool.filter((o) => o.created_by === b).length - pool.filter((o) => o.created_by === a).length);
  for (const a of S.authors) if (!authors.includes(a)) authors.push(a);
  const togs = [ctx.curate ? tog("ov-curate", "Só o que falta curar", S.ov.curate, trioOn(r) ? "Só os itens com opções novas ainda sem ✓ nem ✕" : "Só os itens com mais de 3 opções ou sem nenhuma") : "",
    ctx.dropped ? tog("ov-dropped", "Mostrar descartadas", S.ov.dropped, `As descartadas nos cards (${A_CL} não vê)`) : ""].join("");
  // the round (v1, v2…) is a filter like the others: by default the room shows what is current, item by item
  const vs = roundVers(r.id);
  const rodada = vs.length > 1 ? group("Rodada", [["now", "Atual", "A versão mais nova de cada item"], ...vs.map((v) => [String(v), `v${v}`, `Só o que é da v${v}`]), ["all", "Todas", "Todas as rodadas, a mais nova primeiro"]]
    .map(([k, l, t]) => opt("ver", k, l, S.ver === k, t)).join("")) : "";
  const pop = S.filt ? `<div class="filt-pop" role="dialog" aria-label="Filtros">
    ${rodada}
    ${authors.length ? group("Autor", [["all", "Todos"], ...authors.map((k) => [k, esc(k)])].map(([k, l]) => opt("author", k, l, k === "all" ? !S.authors.size : S.authors.has(k), k === "all" ? "Opções de todo mundo" : `As opções de ${esc(k)} (junta com as outras marcadas)`)).join("")) : ""}
    ${ctx.kinds?.length > 1 ? group("Tipo", [["all", "Tudo"], ...ctx.kinds.map((k) => [k, KINDS[k]])].map(([k, l]) => opt("ov-kind", k, l, k === "all" ? !S.ov.kinds.size : S.ov.kinds.has(k))).join("")) : ""}
    ${togs ? `<section class="filt-group filt-togs">${togs}</section>` : ""}
  </div>` : "";
  const view = ctx.view ? `<div class="seg seg-ico seg-view" role="group" aria-label="Como ver">${[["hero", ICON.list, "Uma por item", "uma imagem grande por item"], ["grid", ICON.grid, "Grade", "todas as opções de cada item lado a lado"]].map(([k, ico, n, t]) => `<button data-act="ov-view" data-v="${k}" class="${S.ov.view === k ? "on" : ""}" aria-pressed="${S.ov.view === k}" title="${n}: ${t}" aria-label="${n}">${ico}</button>`).join("")}</div>` : "";
  const btn = `<button class="fbtn ${on.length ? "on" : ""} ${S.filt ? "open" : ""}" data-act="filt" aria-haspopup="dialog" aria-expanded="${!!S.filt}" title="Aprovação, autor${ctx.kinds?.length > 1 ? ", tipo" : ""} e o que aparece nos cards">${ICO.funnel}Filtros${on.length ? `<b aria-label="${plural(on.length, "filtro ligado", "filtros ligados")}">${on.length}</b>` : ""}</button>`;
  const chips = on.length ? `<div class="fchips">${on.map(([k, l]) => `<button class="fchip" data-act="filt-off" data-v="${k}" title="Tirar este filtro">${esc(l)}${ICO.drop}</button>`).join("")}<button class="link fchips-clear" data-act="filt-off" data-v="all">Limpar</button>${note ? `<span class="fchips-note">${note}</span>` : ""}</div>` : "";
  if (ctx.bare) return { btn: `<span class="fbar-bare">${btn}${pop}</span>`, chips };
  // ico: Filtros is one more round icon in the page head, next to the
  // overview's view icons; what is on still shows as chips over the cards
  if (ctx.ico) {
    const ib = `<button class="btn hico ${on.length ? "on" : ""}" data-act="filt" aria-haspopup="dialog" aria-expanded="${!!S.filt}" title="Filtros: aprovação, autor${ctx.kinds?.length > 1 ? ", tipo" : ""} e o que aparece nos cards" aria-label="Filtros">${ICO.funnel}${on.length ? `<b class="badge" aria-label="${plural(on.length, "filtro ligado", "filtros ligados")}">${on.length}</b>` : ""}</button>`;
    return { btn: `<span class="fbar-bare fbar-head">${view}${ib}${pop}</span>`, chips };
  }
  return `<div class="ov-bar fbar ${ctx.cls || ""}"><span class="fbar-end">${view}${btn}</span>${pop}</div>${chips}`;
}
const addButton = (n) => `<button class="btn hico" data-act="add-item" ${n === undefined ? "" : `data-scene="${n}"`} title="Novo item" aria-label="Novo item">${ICON.plus}</button>`;
// ⤓ downloads what the page shows: the whole round on its round pages, the page's cards on a page, the card on its own
function dlScope() {
  const p = S.page, r = roundOf(p.round);
  if (p.kind === "aprovado") return { items: kitItems(), label: "tudo o que foi aprovado", zip: `${PROJECT.name} - aprovado`, folders: true, plain: true };
  if (p.kind === "scene") {
    const items = itemsOf(r.id).filter((x) => x.scene === p.scene);
    const it = TEAM && p.item && items.find((x) => x.id === p.item);
    if (it) return { items: [it], label: esc(it.title), zip: `${r.code} ${it.title}` };
    return { items, label: `${esc(sceneName(p.scene))} · ${plural(items.length, "card", "cards")}`, zip: `${r.code} ${sceneName(p.scene)}` };
  }
  const items = itemsOf(r.id);
  return { items, label: `a rodada ${esc(r.code)} · ${plural(items.length, "card", "cards")}`, zip: `${r.code} ${r.title}`, folders: true };
}
// "só aprovadas": what the client approved or picked in the round: the option it chose (its card as it is now), or, for a set
// or an item approved as a whole, the images it saw; nothing of an item it asked to change, never a dropped option. The
// team's ✓ is not an approval: it is what goes to the client (Envio)
function approvedOpts(it) {
  const opts = optsOf(it.id).filter((o) => !dropped(o));
  if (it.decision === "changes" || (it.decision !== "approved" && !it.chosen_option && lastFbOf(it.id)?.status !== "aprovado")) return [];
  const seen = TEAM ? opts.filter((o) => !offWK(o)) : opts;
  if (it.mode === "set" || opts.length === 1) return seen;
  const pick = opts.filter((o) => isPick(it, o));
  return pick.length ? pick : seen;
}
// a shot's frames for the animatic: the client's pick once there is one, else the team's ✓ in the newest version that has one
function shotFrames(it) {
  const ok = approvedOpts(it);
  if (ok.length) return ok;
  const k = optsOf(it.id).filter((o) => kept(o) && !dropped(o)), v = Math.max(0, ...k.map(verOf));
  return k.filter((o) => verOf(o) === v);
}
// the originals, one folder per page for a round, named as every download is (dlName)
const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
function dlFiles(s, approved) {
  return s.items.flatMap((it) => (approved ? approvedOpts(it) : TEAM ? shownOpts(it.id) : optsOf(it.id))
    .map((o) => [{ name: dlName(o), path: o.path }, s.folders ? `${tag(it.scene)} ${sceneName(it.scene)}` : ""]));
}
// every image downloaded from the room is named by its card, never by the file someone uploaded (PLANO_1.png), so the
// files sort like the film: 02_P03_Close_Cozinha_A.png for a shot (its number as in the animatic, then the letter the client
// sees), 01_Mae_B.jpg for the rest. An option the client does not see is named by its version and place
function dlName(o) {
  const it = itemOf(o.item_id);
  const ext = /\.[a-z0-9]+$/i.exec(o.name || o.path)?.[0] || "";
  if (!it) return o.name || `imagem${ext}`;
  const all = optsOf(it.id), i = Math.max(0, all.indexOf(o) >= 0 ? all.indexOf(o) : all.indexOf(faceOf(stackRoot(o))));
  const lab = dropped(o) ? "descartada" : it.mode === "set" ? String(i + 1).padStart(2, "0") : letterOf(it, o) || `v${verOf(o)}-${i + 1}`;
  if (it.kind !== "plano") return `${tag(it.scene)}_${slug(it.title)}_${lab}${ext}`;
  return `${shotBase(it, shotNums(it.round_id).get(it.id))}_${lab}${ext}`;
}
// what goes in the animatic for a shot, the best it has: the client's pick, the team's ✓, the newest image on the card (draft),
// the shot's 3D blocking render; with none of these it goes as a "falta" card
function animaticTake(it) {
  const ok = approvedOpts(it);
  if (ok.length) return { frames: ok, state: "aprovado" };
  const keep = shotFrames(it);
  if (keep.length) return { frames: keep, state: "✓ da equipe" };
  const live = optsOf(it.id).filter((o) => !dropped(o) && !isAngle(o)).sort((a, b) => verOf(b) - verOf(a) || b.created_at.localeCompare(a.created_at));
  if (live.length) return { frames: [live[0]], state: "rascunho, sem ✓" };
  const blk = blockOfShot(it);
  return blk ? { frames: [blk], state: "blocking 3D" } : { frames: [], state: "falta" };
}
const pNum = (it) => { const m = /^P(\d+)/i.exec(it.title); return m ? String(+m[1]) : null; };
// the film's order: scene by scene, and in a scene the order of its cards (a shot added later goes where its card is)
const animaticShots = (s) => s.items.filter((it) => it.kind === "plano").sort((a, b) => a.scene - b.scene || a.sort - b.sort || (+pNum(a) || 1e9) - (+pNum(b) || 1e9));
// a shot's number in the film, counted over the whole round: P06; a letter after it, as on set, for two shots of one
// number (P22A_Over, P22B_Contra) or a shot with no number yet, named after the one before it (P06A after P06)
function shotNums(rid) {
  const shots = animaticShots({ items: itemsOf(rid) }), many = new Map(), lettered = new Map(), out = new Map();
  shots.forEach((it) => pNum(it) && many.set(pNum(it), (many.get(pNum(it)) || 0) + 1));
  let last = "0";
  for (const it of shots) {
    const n = pNum(it), key = n || last; // an inserted shot continues the letters of its number
    let num = (n || last).padStart(2, "0");
    if (!n || many.get(n) > 1) { const k = lettered.get(key) || 0; lettered.set(key, k + 1); num += "ABCDEFGH"[k] || `-${k + 1}`; }
    if (n) last = n;
    out.set(it.id, num);
  }
  return out;
}
const shotBase = (it, num) => `${two(it.scene)}_P${num}_${slug(it.title.replace(/^P\d+\s*·\s*/, ""))}_${slug(sceneName(it.scene))}`;
// the animatic for the edit: every shot of the film in that order and named by it, flat: 03_P06_Celular_Escritorio.png, so the
// names sort like the film. Two frames of one shot get a count. The names stay the same from one zip to the next, so
// the newer file replaces the older one in the cut
function animaticFiles(s) {
  const shots = animaticShots(s), nums = shotNums(s.items[0]?.round_id);
  return shots.flatMap((it) => {
    const num = nums.get(it.id);
    const base = shotBase(it, num);
    const { frames, state } = animaticTake(it);
    if (!frames.length) return [[{ name: `${base}.png`, blob: () => missingCard(it, `P${num}`), id: "falta", it, state, num }, ""]];
    return frames.map((o, j) => {
      const ext = /\.[a-z0-9]+$/i.exec(o.name || o.path)?.[0] || "";
      return [{ name: `${base}${frames.length > 1 ? `_${j + 1}` : ""}${ext}`, path: o.path, id: o.id, o, it, state, num }, ""];
    });
  });
}
// a shot with no image yet: a 1920×1080 card with its number, name, scene and text, so the cut has no silent hole
async function missingCard(it, num) {
  await document.fonts.ready.catch(() => {});
  const c = Object.assign(document.createElement("canvas"), { width: 1920, height: 1080 }), g = c.getContext("2d");
  g.fillStyle = "#0b0d0c"; g.fillRect(0, 0, 1920, 1080);
  g.strokeStyle = "#E8B04A"; g.lineWidth = 4; g.setLineDash([26, 18]); g.strokeRect(70, 70, 1780, 940); g.setLineDash([]);
  g.textBaseline = "alphabetic";
  g.fillStyle = "#E8B04A"; g.font = '700 46px "Space Grotesk", system-ui, sans-serif'; g.fillText("FALTA ESTE PLANO", 150, 230);
  g.fillStyle = "#eef2ef"; g.font = '700 132px "Space Grotesk", system-ui, sans-serif'; g.fillText(`${num} · ${it.title.replace(/^P\d+\s*·\s*/, "")}`, 150, 400, 1620);
  g.fillStyle = "#9aa39d"; g.font = '500 48px "DM Sans", system-ui, sans-serif'; g.fillText(`${two(it.scene)} ${sceneName(it.scene)}`, 150, 480, 1620);
  g.fillStyle = "#cfd6d1"; g.font = '400 40px "DM Sans", system-ui, sans-serif';
  const words = (it.brief || "").replace(/\s+/g, " ").trim().split(" ");
  let line = "", y = 590;
  for (const w of words) {
    if (g.measureText(`${line} ${w}`).width > 1620 && line) { g.fillText(line, 150, y); line = w; y += 58; if (y > 940) break; }
    else line = line ? `${line} ${w}` : w;
  }
  if (line && y <= 940) g.fillText(line, 150, y);
  return new Promise((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error(num))), "image/png"));
}
// the list that goes with the animatic: what each file is, where it came from and what changed since the last zip made
// in this browser (prev: file name → option id of that zip)
function animaticList(pairs, prev) {
  const rows = [["Plano", "Arquivo", "Cena", "O que acontece", "Estado", "Versão", "Feito por", "Data", "Desde o último zip"]];
  for (const [f] of pairs) {
    const o = f.o, since = !prev ? "" : !(f.name in prev) ? "novo" : prev[f.name] !== f.id ? "mudou" : "";
    rows.push([`P${f.num}`, f.name, `${two(f.it.scene)} ${sceneName(f.it.scene)}`, (f.it.brief || "").replace(/\s+/g, " ").trim(), f.state, o && !isAngle(o) ? `v${verOf(o)}` : "", o?.created_by || "", o ? fmtTime(o.created_at) : "", since]);
  }
  const cell = (v) => (/[";\r\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return `\ufeff${rows.map((r) => r.map(cell).join(";")).join("\r\n")}\r\n`;
}
function dlButton() {
  const s = dlScope(), shots = TEAM && s.items.some((it) => it.kind === "plano");
  const pop = S.dl ? `<div class="dl-pop" role="menu"><p class="dl-head">Baixar ${s.label}</p>
    ${[["all", "Tudo"], ["ok", TEAM ? "Só aprovadas" : "Só o que aprovamos"]].map(([v, t]) => { const k = dlFiles(s, v === "ok").length; return `<button class="dl-item" role="menuitem" data-act="dl-zip" data-v="${v}" ${k ? "" : "disabled"}>${t}<small>${plural(k, "arquivo", "arquivos")}</small></button>`; }).join("")}
    ${shots ? (() => { const sh = animaticShots(s), miss = sh.filter((it) => !animaticTake(it).frames.length).length; return `<button class="dl-item" role="menuitem" data-act="dl-zip" data-v="animatic" title="Todos os planos na ordem do filme (P01, P02…), cada um com o melhor que tem: aprovado, ✓, rascunho ou blocking. O que falta vai como cartela, e a lista diz o que é cada arquivo e o que mudou desde o último zip">Animatic<small>${plural(sh.length, "plano", "planos")}${miss ? ` · ${miss} ${miss === 1 ? "falta" : "faltam"}` : ""}</small></button>`; })() : ""}
  </div>` : "";
  return `<div class="dl"><button class="btn hico ${S.dl ? "on" : ""}" data-act="dl" title="Baixar ${s.label}" aria-label="Baixar ${s.label}" aria-haspopup="menu" aria-expanded="${!!S.dl}">${ICON.down}</button>${pop}</div>`;
}
const sendable = (i) => i.status === "ready" && !i.visible && optsOf(i.id).length > 0;

// a task on the board: tick it, change its words in place (Enter saves), drag it to someone else, open its item, or
// delete it (the trash shows on hover, and Desfazer brings it back)
const boardTask = (t) => {
  const it = t.item_id ? itemOf(t.item_id) : null;
  return `<div class="btask ${t.done ? "done" : ""}" draggable="true" data-task="${t.id}" title="Arraste para outra pessoa">
    <input type="checkbox" data-task-done="${t.id}" ${t.done ? "checked" : ""} aria-label="Feita">
    <div class="btask-main"><textarea class="btask-text" rows="1" data-task-text="${t.id}" maxlength="300" aria-label="Tarefa" title="Clique para editar">${esc(t.text)}</textarea>
      ${it ? `<a class="btask-it" href="${sceneHref(it.round_id, it.scene, it.id)}">${esc(it.title)}</a>` : ""}</div>
    <button class="tdel" data-act="task-del" data-id="${t.id}" title="Apagar a tarefa" aria-label="Apagar a tarefa">${ICO.trash}</button></div>`;
};
// team: who does what. Each person is a column of items and tasks; dragging a card or a task to another column changes
// who does it, and each column takes new tasks already assigned
function boardPage(r) {
  const V = r.version || 1;
  const all = itemsOf(r.id).sort((a, b) => a.scene - b.scene || a.sort - b.sort);
  const tasks = S.tasks.filter((t) => t.round_id === r.id && (!t.done || (t.version || 1) === V)).sort((a, b) => a.done - b.done || a.sort - b.sort);
  const ready = all.filter((i) => i.status === "ready" || i.visible).length;
  const keys = [...Object.keys(PEOPLE), ""];
  const cols = keys.map((k) => {
    const list = all.filter((i) => (i.assignee || "") === k);
    const mine = tasks.filter((t) => (t.assignee || "") === k);
    const done = list.filter((i) => i.status === "ready" || i.visible).length;
    return `<section class="col" data-col="${k}">
      <header class="col-head"><div class="row"><b>${k ? PEOPLE[k] : "Sem dono"}</b><span>${plural(list.length, "item", "itens")}${mine.length ? ` · ${plural(mine.filter((t) => !t.done).length, "tarefa", "tarefas")}` : ""}</span><button class="col-add" data-act="task-new" data-who="${k}" title="Nova tarefa${k ? ` pra ${PEOPLE[k]}` : ""}" aria-label="Nova tarefa${k ? ` pra ${PEOPLE[k]}` : ""}">${ICON.plus}</button></div><i class="meter"><i style="width:${pct(done, list.length)}%"></i></i></header>
      <div class="col-body" data-keep="col-${k}">
        ${mine.length ? `<div class="btasks">${mine.map(boardTask).join("")}</div>` : ""}
        ${list.map(boardCard).join("") || (mine.length ? "" : '<p class="col-empty">Arraste itens ou tarefas para cá</p>')}
      </div>
    </section>`;
  }).join("");
  return head("A fazer", `${plural(all.length, "item", "itens")} · arraste um card ou uma tarefa para quem vai fazer`,
    `${progress(ready, all.length, `${ready} de ${all.length} prontos`)}<button class="btn primary" data-act="task-new" data-who="${S.me && PEOPLE[S.me] ? S.me : ""}">${ICON.plus}<span>Nova tarefa</span></button>`, `${esc(r.code)} · v${V} · ${esc(r.title)}`) +
    `<div class="main-body fill">${all.length || tasks.length ? `<div class="board" style="--cols:${keys.length}">${cols}</div>` : '<p class="empty">Nenhum item nesta rodada ainda. Use o + (Novo item), no alto, para começar.</p>'}</div>`;
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
  const live = optsOf(it.id).filter((o) => !dropped(o) && !isAngle(o));
  const checked = live.filter((o) => reviewOf(o.id)?.verdict === "keep");
  return checked.length ? checked : live;
};
const toCurate = (it) => it.mode !== "set" && keptOf(it).length > 3;
// one option on a card, in the card's zones (DESIGN.md). Top left belongs to the card (its title). Top right: the letter
// the client calls the image and its state (the client's ★, else the team's ✓ ↻ ✕); on hover the judgment there (✓ Manter,
// ↻ Refazer, ✕ Descartar, 🗑). Bottom left: the conversation (💬, ✎) and, on hover, who made it. Bottom right, on hover: the
// tools (✦, compare, ⤓). Top center its history, the sides the variations, the dots bottom center. The middle is the image:
// a click opens it big. tools: false when the card puts its own tools bottom right (the scene page); quiet: no judgment
// plain: no "–" on an option the client does not see (new work that has not gone yet)
function optFace(it, o, { size, by = false, act = "ov-open", del = false, plain = false, quiet = false, extra = null, tools = true } = {}) {
  const i = optsOf(it.id).indexOf(o);
  const rv = reviewOf(o.id) || {};
  const off = offWK(o);
  const lab = off ? (plain ? "" : "–") : it.mode === "set" ? "" : letterOf(it, o);
  const star = TEAM && clientOk(o);
  const state = star ? '<b class="hz-st wk" title="O cliente escolheu">★</b>'
    : rv.verdict ? `<b class="hz-st ${rv.verdict}" title="${rv.verdict === "drop" ? dropWhy(rv) : `${MARK[rv.verdict]}${rv.note ? ` · ${esc(rv.note)}` : ""}`}">${ICO[rv.verdict]}</b>` : "";
  const tr = lab || state ? `<span class="hz-tr">${lab ? `<b class="hz-lab" title="${off ? "O cliente não vê esta imagem" : "A letra que o cliente vê"}">${lab}</b>` : ""}${state}</span>` : "";
  const judge = TEAM && !quiet ? `<div class="hz-judge">${extra ? `${extra(o)}<span class="sep"></span>` : ""}${Object.keys(REVIEW).map((v) => `<button class="rv ${rv.verdict === v ? "on" : ""}" data-act="review" data-id="${o.id}" data-v="${v}" aria-pressed="${rv.verdict === v}" title="${REVIEW[v]}${v === "drop" ? " (o cliente não vê)" : ""}">${ICO[v]}</button>`).join("")}${del ? `<span class="sep"></span><button class="hz-del" data-act="opt-del" data-id="${o.id}" title="Apagar esta imagem">${ICO.trash}</button>` : ""}</div>`
    : extra ? `<div class="hz-judge">${extra(o)}</div>` : "";
  const nc = commentsOf(it.id).length, nd = TEAM ? drawsOf(o) : 0;
  const meta = [by && o.created_by ? esc(o.created_by.split(" ")[0]) : "", TEAM && roundVers(it.round_id).length > 1 ? `v${verOf(o)}` : ""].filter(Boolean).join(" · ");
  const bl = `<span class="hz-bl"><button class="hz-chip ${nc ? "" : "hz-hover"}" data-act="drawer" data-id="${it.id}" title="${nc ? plural(nc, "comentário", "comentários") : "Comentar"}" aria-label="Comentários">${CHAT}${nc || ""}</button>${nd ? `<b class="hz-chip" title="${plural(nd, "desenho", "desenhos")} em aberto">${Estudio.ICONS.pen}${nd}</b>` : ""}${meta ? `<span class="hz-meta" title="Quem fez · versão">${meta}</span>` : ""}${rv.verdict === "drop" && rv.note ? `<span class="hz-meta" title="${dropWhy(rv)}">${esc(rv.note)}</span>` : ""}</span>`;
  const br = tools ? `<div class="hz-br">${TEAM && AI && !o.mime.startsWith("video/") ? `<button data-act="estudio" data-id="${o.id}" title="Editar com IA: esta imagem é a base" aria-label="Editar com IA">${Estudio.ICONS.spark}</button>` : ""}${vsCan(o) ? `<button data-act="vs-open" data-id="${it.id}" data-i="${i}" title="${blockOf(o) ? "Comparar com o blocking 3D" : "Comparar com a versão anterior"}" aria-label="Comparar">${ICON.vs}</button>` : ""}<button data-act="download" data-id="${o.id}" title="Baixar o original" aria-label="Baixar">${ICO.down}</button></div>` : "";
  return `<button class="hero-img" data-act="${act}" data-id="${it.id}" data-i="${i}" aria-label="Abrir ${esc(it.title)} ${lab} grande"${off && !dropped(o) ? ' title="Fora do que o cliente vê nesta versão"' : ""}>${media(o, size)}${vplayBtn(o)}</button>
    ${tr}${judge}${bl}${br}${verPill(o)}`;
}
// the history of an image edited in the studio, on its card's top right while hovered: ‹ 2/3 › steps through its
// versions (1 is the original), and the one shown becomes the card's face. Variations (A, B…) keep the big arrows and dots.
// The ✕ versions are skipped while the ✕ ones are hidden (Filtros › Mostrar descartadas brings them into the count)
function verPill(o) {
  if (!TEAM) return "";
  const root = stackRoot(o), every = stackOf(root);
  const all = every.filter((x) => x === root || !dropped(x) || showDrop(x)), hid = every.length - all.length;
  if (all.length < 2) return "";
  const i = Math.max(0, all.findIndex((x) => x.id === o.id));
  const step = (d, label) => { const x = all[i + d]; return `<button data-act="vpick" data-id="${root.id}" data-v="${x?.id || ""}" ${x ? "" : "disabled"} aria-label="${label}">${d < 0 ? "‹" : "›"}</button>`; };
  return `<span class="vpill" title="Histórico desta imagem: ${all.length} versões (a 1 é a original)${hid ? `, mais ${hid} com ✕ (Filtros › Mostrar descartadas)` : ""}. As setas trocam a que fica no card.">${step(-1, "Versão anterior")}<b>${i + 1}/${all.length}</b>${step(1, "Próxima versão")}</span>`;
}
// a contact-sheet cell: the face at thumbnail size, framed by the team's verdict
const sheetTile = (it, o, opt = {}) => {
  const verdict = reviewOf(o.id)?.verdict;
  return `<div class="hero csh-tile ${verdict ? `rv-${verdict}` : ""} ${isPick(it, o) ? "chosen" : ""}">${optFace(it, o, { size: "thumb", by: true, ...opt })}</div>`;
};
// the image picked on a card with its dots (S.ovSel) is kept by its original's id, so flipping its versions (‹ n/N ›), a
// new version landing on it or new images arriving leave it where it was; this browser remembers it. One that is gone falls
// back to the rule
const selOf = (o) => stackRoot(o)?.id || o?.id;
function pickSel(id, o) {
  if (!o) return;
  S.ovSel[id] = selOf(o);
  store.set(`sala-ovsel-${SIDE}`, JSON.stringify(S.ovSel));
}
// which of a card's images shows: the one picked with the dots, else the client's pick (team), else the kept one, else the first
function shownAt(it, opts) {
  let k = opts.findIndex((o) => selOf(o) === S.ovSel[it.id]);
  if (k < 0 && TEAM) k = opts.findIndex(clientOk);
  if (k < 0) k = Math.max(0, opts.findIndex((o) => reviewOf(o.id)?.verdict === "keep"));
  return k;
}
// an item's big image, as on the overview: the shown option (see shownAt), dots and hover actions
function heroOf(it, opts, { act = "ov-open", del = false, quiet = false, extra = null, tools = true } = {}) {
  const k = shownAt(it, opts);
  const o = opts[k];
  const lab = offWK(o) ? "–" : it.mode === "set" ? "" : letterOf(it, o);
  return {
    idx: optsOf(it.id).indexOf(o),
    verdict: reviewOf(o.id)?.verdict,
    pos: `${lab ? `${lab} · ` : ""}${k + 1}/${opts.length}`,
    html: `<div class="hero">
        ${optFace(it, o, { act, del, by: TEAM && !quiet, quiet, extra, tools })}
        ${opts.length > 1 ? `<button class="hero-nav prev" data-act="ov-cycle" data-id="${it.id}" data-v="-1" aria-label="Variação anterior">‹</button><button class="hero-nav next" data-act="ov-cycle" data-id="${it.id}" data-v="1" aria-label="Próxima variação">›</button>
          <div class="hero-dots">${opts.map((x, j) => `<i class="${j === k ? "on" : ""} ${dropped(x) ? "dropped" : reviewOf(x.id)?.verdict || ""}"></i>`).join("")}</div>` : ""}
      </div>`,
  };
}
// what kind of card this is, read from what it holds: a before/after comparison, Blender renders,
// camera angles (planos and walls) or AI generations; shown as a small icon before the kind in the footer
const TYPE_ICON = {
  compare: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M2.8 3.8H8v8.4H2.8z" fill="currentColor" stroke="none" opacity=".45"/><path d="M8 1.8v12.4"/></svg>',
  blocking: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2 1.6" aria-hidden="true"><path d="M8 1.8 13.5 5v6L8 14.2 2.5 11V5zM2.5 5 8 8.2 13.5 5M8 8.2v6" stroke-linejoin="round"/></svg>',
  angles: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="1.8" y="4.5" width="9" height="7" rx="1.2"/><path d="M10.8 7.2 14.2 5.4v5.2L10.8 8.8" stroke-linejoin="round"/></svg>',
  ai: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M8 1.8 9.5 6.5 14.2 8 9.5 9.5 8 14.2 6.5 9.5 1.8 8 6.5 6.5z" stroke-linejoin="round"/></svg>',
  props: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="1.8" y="3" width="12.4" height="10" rx="1.2"/><path d="M6 3v10M10 3v10M1.8 8h12.4"/></svg>',
};
function typeOf(it) {
  const opts = optsOf(it.id);
  const pairs = pairsOf(opts);
  if (pairs.length) return ["compare", pairs.some((p) => p.light) ? "Comparação sem × com" : "Comparação blocking × IA"];
  if (opts.length && opts.filter((o) => (o.model || "").startsWith("Blender")).length * 2 > opts.length) return ["blocking", "Renders do blocking 3D"];
  if (it.kind === "plano" || /paredes/i.test(it.title)) return ["angles", "Variações de ângulo"];
  return ["ai", opts.length > 1 ? "Variações geradas com IA" : "Geração de IA"];
}
const typeBadge = (it) => { const [k, label] = typeOf(it); return `<i class="tbadge ${k}" title="${label}" aria-label="${label}">${TYPE_ICON[k]}</i>`; };
// the same icon, in the card's corner tag on the image (where the option letter is)
const typeChip = (it) => { const [k, label] = typeOf(it); const t = `${KINDS[it.kind] ? `${KINDS[it.kind]} · ` : ""}${label}`; return `<i class="tico ${k}" title="${t}" aria-label="${t}">${TYPE_ICON[k]}</i>`; };
// the version of an option in its corner tag, once the round has more than one; the newest is lit, and a card that did
// not change in the newest version says so
const verTag = (it, o) => {
  const vs = TEAM ? roundVers(it.round_id) : [];
  if (vs.length < 2) return "";
  const v = verOf(o), same = v < vs[0] && latestVer(it.id) === v;
  return `<b class="hero-ver ${v === vs[0] ? "now" : ""}" title="${same ? `Sem mudança na v${vs[0]}` : `Versão ${v}`}">v${v}${same ? " · igual" : ""}</b>`;
};
const curateTag = (it) => (toCurate(it) ? '<b class="hero-warn" title="Curar até 3 antes de enviar">→ 3</b>' : "");
// the ✓ is the team's (what goes, or went, to the client), the ★ is the client's; a dropped option says why when there is a note
const MARK = { keep: `Equipe: vai/foi ${AO_CL}`, redo: "Equipe: refazer" };
const dropWhy = (rv) => `Descartada: ${A_CL} não vê${rv?.note ? ` · ${esc(rv.note)}` : ""}`;
const dropTag = (rv) => `<b class="hero-drop" title="${dropWhy(rv)}">${ICO.drop}Descartada${rv?.note ? `<small>${esc(rv.note)}</small>` : ""}</b>`;
// the card's signals stay on the image at all times (top left); its tools live in the bar that shows on hover
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
      <span class="hero-tags"><span class="hero-lab">${typeChip(it)}${p.ver ? `<b class="hero-ver now">${esc(p.l)} → ${esc(p.r)}</b>` : ""}${k + 1}/${pairs.length}</span>${rv.verdict === "drop" ? dropTag(rv) : rv.verdict ? `<span class="hero-mark ${rv.verdict}" title="${MARK[rv.verdict]}">${ICO[rv.verdict]}</span>` : ""}${talkTag(it)}</span>
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
// a scene reads the same everywhere: casting on the left, location (and the rest) on the right
function splitCols(items, fn) {
  const left = items.filter((x) => x.kind === MAIN_KINDS[0]), right = items.filter((x) => x.kind !== MAIN_KINDS[0]);
  if (!left.length || !right.length) return `<div class="scols flow">${items.map(fn).join("")}</div>`;
  return `<div class="scols"><div class="scol">${left.map(fn).join("")}</div><div class="scol">${right.map(fn).join("")}</div></div>`;
}
// "Atual" on the team's overview and scene pages, once a round has a second version: each item in three groups side by
// side, nothing hidden by filters: what the client chose, the changes we made on it and the new options. the client's choice is the
// option it picked in the room or, when it approved or asked to adjust one in a comment or on WhatsApp, the option our
// reading of its feedback starts from (base_option). A change is a newer option made from that choice (based_on, at
// any depth); the rest of the newest version is new.
const trioOn = () => false; // 02/11: one card per item everywhere; what the client chose next to what we made is Retorno's
const fbNow = (r, it) => fbOf(r.id, it.id, (r.version || 1) - 1) || fbOf(r.id, it.id);
function pickOf(r, it) {
  const own = (id) => id && S.options.find((o) => o.id === id && o.item_id === it.id);
  const chosen = optsOf(it.id).find((o) => isPick(it, o));
  if (chosen) return { o: chosen, msg: false };
  const f = fbNow(r, it), base = f && ["aprovado", "ajustar"].includes(f.status) && own(f.base_option);
  return base ? { o: base, msg: true, note: f.base_note } : null;
}
function madeFrom(o, src) {
  for (let b = o, n = 0; b?.based_on && n < 8; n++) {
    if (b.based_on === src.id) return true;
    b = S.options.find((x) => x.id === b.based_on);
  }
  return false;
}
function trioOf(r, it) {
  const pick = pickOf(r, it), lv = latestVer(it.id);
  const all = lv > 1 ? optsOf(it.id).filter((o) => verOf(o) === lv && o.id !== pick?.o.id) : [];
  const shown = all.filter((o) => (showDrop(o) || !dropped(o)) && inAuthor(o));
  const changes = pick ? shown.filter((o) => madeFrom(o, pick.o)) : [];
  return {
    pick, all, changes, fresh: shown.filter((o) => !changes.includes(o)),
    open: all.filter((o) => !reviewOf(o.id)?.verdict && inAuthor(o)).length, // still without ✓ or ✕
    born: lv > 1 && !optsOf(it.id).some((o) => verOf(o) < lv), // an item that only exists from this version on
  };
}
// with the author filter on, an item shows only when that person made something new in it
const trioShown = (r, it) => { const t = trioOf(r, it); return !S.authors.size || t.changes.length + t.fresh.length > 0; };
// tools: the scene page's comments, upload (also by dropping files on the row) and ⋯
function trioRow(r, it, { tools = false } = {}) {
  const t = trioOf(r, it), f = fbNow(r, it);
  const tile = (o) => {
    S.ovList.push({ id: it.id, i: optsOf(it.id).indexOf(o) });
    return sheetTile(it, o, { plain: true });
  };
  const ghost = (b, small = "") => `<div class="hero hero-empty trio-ghost"><b>${b}</b>${small ? `<small>${small}</small>` : ""}</div>`;
  const group = (cls, label, body, tip = "") => `<div class="trio-g ${cls}"><p class="trio-lab"${tip ? ` title="${esc(tip)}"` : ""}>${label}</p><div class="trio-tiles">${body}</div></div>`;
  const wk = t.pick
    ? group("wk", `${cap(A_CL)} escolheu${t.pick.msg ? " <small>na conversa</small>" : ""}`, tile(t.pick.o), t.pick.msg ? t.pick.note || "Escolhida num comentário ou no WhatsApp" : "Escolhida na sala")
    : group("wk none", `${cap(A_CL)} escolheu`, ghost(t.born ? "Item novo" : "Nenhuma", t.born ? `nasceu na v${latestVer(it.id)}` : ""));
  const ours = [];
  if (t.changes.length) ours.push(group("mud", "Mudanças que fizemos", t.changes.map(tile).join("")));
  if (t.fresh.length) ours.push(group("new", "Novas que geramos", t.fresh.map(tile).join("")));
  if (!ours.length) {
    ours.push(t.all.length ? group("new", "O que fizemos", ghost("Tudo descartado", "Filtros › Mostrar descartadas"))
      : f?.status === "aprovado" || (!f && t.pick) ? '<p class="trio-note">Aprovada: fica assim</p>'
      : group("todo", "O que fizemos", ghost(f?.status === "espera" ? `Esperando ${A_CL}` : "Ninguém fez ainda")));
  }
  const n = commentsOf(it.id).length, more = S.more === it.id;
  const kit = tools ? `<span class="trio-tools">${shotBtn(it)}
      <button class="ibtn ${S.drawer === it.id ? "on" : ""} ${n ? "has" : ""}" data-act="drawer" data-id="${it.id}" title="Comentários" aria-label="Comentários">${CHAT}${n ? `<b>${n}</b>` : ""}</button>
      <label class="ibtn" title="Adicionar opções (ou arraste os arquivos para cá)" aria-label="Adicionar opções"><input type="file" multiple hidden accept="image/*,video/*" data-upload-item="${it.id}">+</label>
      <button class="ibtn ${more ? "on" : ""}" data-act="more" data-id="${it.id}" title="Dono, status, o que ${A_CL} vê, prompts" aria-label="Mais" aria-expanded="${more}">⋯</button>
      ${more ? morePop(it) : ""}
    </span>` : "";
  return `<article class="trio ${S.flash === it.id ? "flash" : ""}" id="item-${it.id}"${tools ? ` data-drop="${it.id}"` : ""}>
    <header class="trio-head">
      <span class="trio-kind">${KINDS[it.kind] || ""}</span>
      <a class="trio-title" href="${sceneHref(r.id, it.scene, it.id)}" title="Abrir o item: versões, pedido e referências">${esc(it.title)}</a>
      ${f ? `<span class="fb ${f.status}">${FB[f.status]}</span>` : ""}
      ${f?.summary ? `<span class="trio-ask" title="${esc(f.summary)}">${esc(f.summary)}</span>` : ""}
      ${t.open ? `<b class="trio-open" title="Opções novas ainda sem ✓ nem ✕">${t.open} pra curar</b>` : ""}
      ${kit}
    </header>
    <div class="trio-cols">${wk}${ours.join("")}</div>
    ${S.uploading[it.id] ? `<p class="trio-up">${esc(S.uploading[it.id])}</p>` : ""}
  </article>`;
}
function overviewPage(r) {
  const f = S.ov;
  const all = itemsOf(r.id);
  // one filter button per kind present in this round (locação, mesa posta, produto, plano…)
  const kinds = Object.keys(KINDS).filter((k) => all.some((it) => it.kind === k));
  const pick = [...f.kinds].filter((k) => kinds.includes(k));
  const trio = trioOn(r);
  const kindOk = (it) => !pick.length || pick.includes(it.kind);
  // Atual: every item, unless "Só o que falta curar" or the author filter is on; the other versions: what the filters
  // leave (an item they empty is left out, and the line after the filter chips says how many)
  const fits = (it) => trio ? trioShown(r, it) && (!f.curate || trioOf(r, it).open > 0)
    : hasView(it) && (!f.curate || toCurate(it) || !keptOf(it).length);
  const shown = (it) => kindOk(it) && fits(it);
  const images = all.reduce((a, it) => a + keptOf(it).length, 0);
  const ready = all.filter((i) => i.status === "ready" || i.visible).length;
  const owed = S.requests.filter((q) => !q.done && (!filesOf(q.id).length && !q.note.trim() || /falta/i.test(q.note || ""))).length;
  S.ovList = [];
  const itemLine = (it, right) => {
    const [cls, label] = stageOf(it);
    return `<span class="t">${grip(cls, label)}${typeBadge(it)}<small>${KINDS[it.kind] || ""}</small>${esc(it.title)}</span><span class="pos">${right}${toCurate(it) ? ' <b class="warn" title="Curar até 3 antes de enviar">→ 3</b>' : ""}</span>`;
  };
  const visibleOpts = (it) => {
    const opts = shownOpts(it.id);
    opts.forEach((o) => S.ovList.push({ id: it.id, i: optsOf(it.id).indexOf(o) }));
    return opts;
  };
  const empty = (it) => slotHero(it);
  // "Grade": every option of the item at once, like a contact sheet, to judge range and variety at a glance
  const sheet = (it) => {
    const opts = visibleOpts(it);
    return `<article class="csh"${orderOf(it)}>
      <header class="hcard-foot csh-head">${itemLine(it, opts.length ? plural(opts.length, "opção", "opções") : "")}</header>
      ${opts.length ? `<div class="csh-grid">${opts.map((o) => sheetTile(it, o)).join("")}</div>` : `<div class="csh-grid">${empty(it)}</div>`}
    </article>`;
  };
  // the cards flow as one grid, scene after scene; Grade (every option of each item) keeps a block per scene
  const scened = scenesOf(r.id).map(([n, list]) => [n, list.filter(shown)]).filter(([, l]) => l.length);
  const sections = f.view === "hero" && !trio ? (scened.length ? cardGrid(scened.flatMap(([, l]) => l.map((it) => teamRow(it, { scene: true, ov: true })))) : "")
    : scened.map(([n, items]) => `<section class="hscene">
      <a class="hscene-head" href="${sceneHref(r.id, n)}"><span class="num">${two(n)}</span><b>${esc(sceneName(n))}</b></a>
      ${trio ? `<div class="trio-list">${items.map((it) => trioRow(r, it)).join("")}</div>` : splitCols(items, sheet)}
    </section>`).join("");
  const sub = [plural(all.length, "item", "itens"), `${images} imagens`, `${ready} prontos`].join(" · ") +
    (r.confirmed_at ? ` · <b class="ok">${esc(CL)} confirmou ${fmtTime(r.confirmed_at)}</b>` : "") +
    (owed ? ` · <a class="owed" href="#/materiais">${plural(owed, "material pendente", "materiais pendentes")} ${DA_CL}</a>` : "");
  const bar = filterBar(r, { view: !trio, kinds, curate: true, dropped: true, ico: true }, apprNote(filtering() ? all.filter((it) => kindOk(it) && !(trio ? trioShown(r, it) : hasView(it))).length : 0)) || { btn: "", chips: "" };
  return head("Visão geral", sub, bar.btn + dlButton() + sendButton(r), `${esc(r.code)} · ${esc(r.title)}`) +
    `<div class="main-body ov-body" data-keep="main">${bar.chips}${sections || `<p class="empty">${trio && f.curate ? "Nada pra curar: tudo o que é novo já tem ✓ ou ✕." : "Nada com esse filtro."}</p>`}</div>`;
}
// ---------- the pages of cards: one grid that flows scene after scene, each card naming its scene ----------
// nothing above, beside or under a card but its title, and, in yellow, what the client still asks of it
const KIND_ORDER = { casting: 0, locacao: 1 };
const byScene = (list) => list.sort((a, b) => a.scene - b.scene || (KIND_ORDER[a.kind] ?? 2) - (KIND_ORDER[b.kind] ?? 2) || a.sort - b.sort);
const cardGrid = (cards, cls = "") => `<div class="hgrid flow ${cls}">${cards.join("")}</div>`;
const cardTitle = (it, dot = "") => `<span class="t">${dot}<span class="num">${two(it.scene)}</span>${esc(it.title)}</span>`;
// the status dot of a card is also its grip (team): ⋮⋮ on the card's hover, dragged to change the order of the scene
const grip = (cls, title) => (TEAM ? `<span class="grip" draggable="true" data-grip title="${title} · arraste para mudar a ordem na cena"><i class="ovx-dot ${cls}"></i>${ICON.grip}</span>` : `<i class="ovx-dot ${cls}" title="${title}"></i>`);
const orderOf = (it) => (TEAM ? ` data-order="${it.id}" data-scene="${it.scene}"` : "");
// what the client still asks of an item (our reading of its feedback, or its own words), or null when nothing is open
function askOf(it) {
  const f = lastFbOf(it.id);
  if (f && ["ajustar", "refazer", "novo", "espera"].includes(f.status)) return { label: FB[f.status], note: f.summary || "" };
  if (it.decision !== "changes") return null;
  const c = commentsOf(it.id).filter((x) => x.side !== "time").at(-1);
  return { label: "Ajuste pedido", note: (c?.body || "").split("\n")[0] };
}
// the image of an item nothing was approved of: the team's ✓ in the newest version that has one, else the newest
function bestOf(it) {
  const live = optsOf(it.id).filter((o) => !dropped(o)).sort((a, b) => verOf(b) - verOf(a));
  const k = live.filter(kept);
  return k[0] || live[0] || null;
}
// the yellow line of a card: what the client still asks; with a request on record, a click opens it in the panel
function askLine(it, ask) {
  if (!ask) return "";
  const t = esc(`${ask.label}${ask.note ? ` · ${ask.note}` : ""}`), inner = `<b>${esc(ask.label)}</b>${ask.note ? ` · ${esc(ask.note)}` : ""}`;
  return TEAM && lastFbOf(it.id) ? `<button class="hcard-ask" data-act="pedido" data-id="${it.id}" title="${t}">${inner}</button>` : `<p class="hcard-ask" title="${t}">${inner}</p>`;
}
// one card about the client's answer: the image as the room uses it now (its ★ when the client chose it), the comments
// (they open the panel), the title, and a yellow outline with one line when something is still asked of us
function answerCard(it, opts, { ask = null } = {}) {
  opts.forEach((o) => S.ovList.push({ id: it.id, i: optsOf(it.id).indexOf(o) }));
  const h = opts.length ? heroOf(it, opts, { quiet: true }) : null;
  return `<article class="hcard ${ask ? "ask" : ""}">${h ? h.html : '<div class="hero hero-empty">Sem imagem</div>'}
    <footer class="hcard-foot">${cardTitle(it)}</footer>
    ${askLine(it, ask)}
  </article>`;
}
// team: the job's kit across the rounds, as the room uses it now: what the client approved (★), and in yellow what it
// still asks to change. One button downloads exactly the approved images
function kitItems() {
  const order = new Map(S.rounds.map((r, i) => [r.id, i]));
  // an item a later round repeats (same scene and title) counts once, as the latest round has it
  const latest = new Map();
  S.items.filter((it) => approvedOpts(it).length || (it.visible && askOf(it))).sort((a, b) => order.get(a.round_id) - order.get(b.round_id))
    .forEach((it) => latest.set(`${it.scene}|${it.title}`, it));
  return byScene([...latest.values()]);
}
function approvedPage() {
  const items = kitItems();
  const n = items.reduce((k, it) => k + approvedOpts(it).length, 0);
  const ok = items.filter((it) => approvedOpts(it).length).length, asks = items.filter(askOf).length;
  S.ovList = [];
  const card = (it) => { const a = approvedOpts(it), o = a.length ? null : bestOf(it); return answerCard(it, a.length ? a : o ? [o] : [], { ask: askOf(it) }); };
  const dl = n ? `<button class="btn primary" data-act="dl-zip" data-v="ok" title="Um .zip com uma pasta por cena: a versão atual de tudo o que o cliente aprovou">${ICON.down}<span>Baixar aprovadas · ${n}</span></button>` : "";
  return head("Aprovado", [plural(ok, "item aprovado", "itens aprovados"), asks ? `${plural(asks, "com pedido", "com pedido")} em amarelo` : "", "a versão atual de cada um"].filter(Boolean).join(" · "), dl, "Job") +
    `<div class="main-body ov-body" data-keep="main">${items.length ? cardGrid(items.map(card)) : '<p class="empty">Nada aprovado ainda.</p>'}</div>`;
}
function boardCard(it) {
  const o = optsOf(it.id)[0];
  const authors = authorsOf(optsOf(it.id));
  const [cls, label] = stageOf(it);
  const n = commentsOf(it.id).length;
  const r = roundOf(it.round_id), news = r ? todoOf(it, r).unrev.length : 0;
  return `<a class="bcard" href="${sceneHref(it.round_id, it.scene, it.id)}" draggable="true" data-card="${it.id}" title="Clique para abrir · arraste para outra pessoa"><button class="bcard-add" data-act="task-new" data-item="${it.id}" data-who="${it.assignee || ""}" title="Nova tarefa neste card" aria-label="Nova tarefa neste card">${ICON.plus}</button>
    <div class="bthumb">${o ? media(o, "thumb") : "sem opção"}</div>
    <div class="bbody"><p class="meta"><span class="num">${two(it.scene)}</span> ${esc(sceneName(it.scene))} · ${KINDS[it.kind] || ""}</p><p class="t">${esc(it.title)}</p>
      ${authors.length > 1 ? `<p class="meta">Propostas de ${authors.map(([n]) => esc(n)).join(" e ")}</p>` : ""}
      <span class="bstates"><span class="state ${cls}">${label}${n ? ` · ${n} coment.` : ""}</span>${news ? `<b class="bnew" title="Opções novas sem ✓ nem ✕">${news} ${news === 1 ? "nova" : "novas"}</b>` : ""}</span></div>
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
      : o ? `<a class="ovt ${cls}" href="${href}">${media(o, "thumb")}${wkOpts(it.id).length > 1 && it.mode !== "set" && letterOf(it, o) ? `<span class="ovt-lab">${letterOf(it, o)}</span>` : ""}</a>` : `<a class="ovt ovt-empty" href="${href}">Ajuste pedido</a>`;
    return `<div class="ovx"><div class="ovx-head"><i class="ovx-dot ${cls || "pending"}"></i><a class="ovx-title" href="${href}">${esc(it.title)}</a><span class="ovx-meta ${cls}">${label}</span></div><div class="rv-pick">${pic}</div></div>`;
  };
  const box = r.confirmed_at ? `<p><b>${esc(r.code)} confirmada</b> por ${esc(r.confirmed_by)} · ${fmtTime(r.confirmed_at)}.${TEAM ? "" : " Obrigado!"}</p>`
    : pending.length ? `<p>Faltam <b>${plural(pending.length, "decisão", "decisões")}</b> para ${TEAM ? `${A_CL} confirmar` : "confirmar"} a ${esc(r.code)}.</p>${TEAM ? "" : `<a class="btn primary" href="${sceneHref(r.id, pending[0].scene, pending[0].id)}">Ir para a próxima →</a>`}`
    : `<p><b>Tudo decidido</b>${changes ? `, com ${plural(changes, "ajuste pedido", "ajustes pedidos")}` : ""}. ${TEAM ? `Aguardando ${A_CL} confirmar.` : "Confirme para a gente seguir."}</p>${TEAM ? "" : `<button class="btn primary" data-act="confirm-round" data-id="${r.id}">Confirmar ${esc(r.code)}</button>`}`;
  return head(`Resumo da ${esc(r.code)}`, replyLine(r), progress(done, items.length, `${done} de ${items.length} decididos`) + dlButton(), `${esc(r.code)} · ${esc(r.title)}`) +
    `<div class="main-body" data-keep="main"><div class="confirm ${r.confirmed_at ? "ok" : ""}">${box}</div>${sceneTable(r, cell)}</div>`;
}

// team: what the client actually did with the round. the client barely used the formal Aprovar / Confirmar buttons, so this reads
// what they did instead: the option they clicked (chosen_option), what our item_feedback says they approved by
// message, and their comments in the room or outside it. Pictures are of the version they saw (v1 while we make v2)
const hm = (ts) => {
  const p = (o) => new Date(ts).toLocaleString("pt-BR", { ...o, timeZone: "America/Sao_Paulo" });
  const day = p({ day: "2-digit", month: "2-digit" });
  return `${day === new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }) ? "" : `${day} `}${p({ hour: "2-digit", minute: "2-digit" })}`;
};
function wkDid(r, it) {
  // the version the client answered: the current one once there is feedback on it, else the one before
  const seen = Math.min(r.version || 1, fbVers(r.id)[0] || Math.max(1, (r.version || 1) - 1));
  const f = fbOf(r.id, it.id, seen) || fbOf(r.id, it.id);
  const room = commentsOf(it.id).filter((c) => c.side !== "time"), extra = f ? lines(f.client_extra) : [];
  const said = { f, room, extra };
  const chosen = optsOf(it.id).find((o) => isPick(it, o));
  // approved as a whole: the ✓ among what the client saw in that version, else the first of what it saw
  const kept1 = () => { const vis = optsOf(it.id).filter((o) => verOf(o) === seen && !offWK(o) && !dropped(o)); return vis.find(kept) || vis[0] || null; };
  const by = it.decided_by ? ` · ${esc(it.decided_by)} ${hm(it.decided_at)}` : "";
  const L = (o) => o && it.mode !== "set" && wkOpts(it.id).length > 1 ? letterOf(it, o) : "";
  if (!it.visible) return { ...said, k: "off", label: `Não foi ${AO_CL}` };
  if (chosen) return { ...said, k: "chose", o: chosen, label: `${it.decision === "approved" ? "Aprovou" : "Escolheu"}${L(chosen) ? ` ${L(chosen)}` : ""}${by}` };
  if (it.decision === "approved") return { ...said, k: "chose", o: kept1(), label: `Aprovou${by}` };
  if (f?.status === "aprovado") return { ...said, k: "msg", o: kept1(), label: /whatsapp/i.test(f.client_extra || "") ? "Aprovado (WhatsApp)" : "Aprovado fora da sala" };
  if (it.decision === "changes") return { ...said, k: "talk", label: `Pediu ajuste${by}` };
  if (room.length || extra.length) return { ...said, k: "talk", label: "Comentou, sem escolher" };
  return { ...said, k: "none", label: "Sem resposta" };
}
// "O que vai pro cliente": the round's current version as the client will see it, item by item, with what stays out under each
// item. Every image goes or stays out by the rule (offWK) until someone here decides otherwise (envio, per
// version); a whole item goes out with "Tirar o item" (items.visible), and an item with nothing to show does not go.
const goesWK = (it) => it.visible && wkOpts(it.id).length > 0;
// Envio: the round's current version exactly as the client will see it, as the same grid: one card per item that goes,
// flipping through the images that go with the letter the client sees; the eye in an image's hover bar takes it out.
// What stays out (images not chosen, items not sent) waits folded at the end, each eye bringing it in. Enviar sends
// the items marked Pronto
const envEye = (on) => (o) => `<button data-act="envio" data-id="${o.id}" data-v="${on ? "out" : "in"}" title="${on ? "Tirar do envio: o cliente deixa de ver esta imagem" : "Incluir no envio: o cliente passa a ver esta imagem"}" aria-label="${on ? "Tirar do envio" : "Incluir no envio"}">${on ? EYE_OFF : EYE}</button>`;
function envioPage(r) {
  const V = r.version || 1, items = byScene(itemsOf(r.id));
  const go = items.filter(goesWK), imgs = go.reduce((n, it) => n + wkOpts(it.id).length, 0);
  S.ovList = [];
  const card = (it, list, on) => {
    list.forEach((o) => S.ovList.push({ id: it.id, i: optsOf(it.id).indexOf(o) }));
    const h = list.length ? heroOf(it, list, { quiet: true, extra: envEye(on) }) : null;
    const eye = `<button class="ibtn" data-act="visible" data-id="${it.id}" title="${it.visible ? "Tirar o item inteiro do envio" : "Incluir o item no envio"}" aria-label="${it.visible ? "Tirar o item" : "Incluir o item"}">${it.visible ? EYE_OFF : EYE}</button>`;
    return `<article class="hcard">${h ? h.html : '<div class="hero hero-empty">Sem imagem</div>'}<footer class="hcard-foot">${cardTitle(it)}<span class="foot-acts">${eye}</span></footer></article>`;
  };
  // out: the images of an item that goes but stay out, or what an item not sent would show
  const live = (it) => optsOf(it.id).filter((o) => !dropped(o) && !isAngle(o));
  const out = items.map((it) => [it, goesWK(it) ? live(it).filter(offWK) : (it.visible ? live(it) : wkOpts(it.id).length ? wkOpts(it.id) : live(it))])
    .filter(([, l]) => l.length);
  const nOut = out.reduce((n, [, l]) => n + l.length, 0);
  const fold = out.length ? `<button class="hrest" data-act="rest" aria-expanded="${!!S.rest?.[S.page.kind]}">${S.rest?.[S.page.kind] ? "Esconder" : "Ver"} o que fica de fora · ${plural(nOut, "imagem", "imagens")}</button>${S.rest?.[S.page.kind] ? cardGrid(out.map(([it, l]) => card(it, l, false)), "dim") : ""}` : "";
  const rule = V > 1 ? `vai o ✓ da equipe na v${V} e o que o cliente escolheu na v${V - 1}` : "vai o que tem ✓; num item sem ✓, tudo o que não foi descartado";
  return head("Envio", `v${V} · ${plural(go.length, "item", "itens")} e ${plural(imgs, "imagem", "imagens")}: o cliente vê exatamente isto · ${rule}`,
    `${sendButton(r)}<a class="btn hico" href="../aprovacao/" target="_blank" rel="noopener" title="Abrir a sala do cliente" aria-label="Abrir a sala do cliente">${ICO.open}</a>`, `${esc(r.code)} · ${esc(r.title)}`)
    + `<div class="main-body ov-body" data-keep="main">${go.length ? cardGrid(go.map((it) => card(it, wkOpts(it.id), true))) : '<p class="empty">Nada vai pro cliente ainda: dê ✓ nas opções e mande os itens.</p>'}${fold}</div>`;
}
// team: what the client answered in the round, as the same grid of cards: its pick with the ★, in yellow what it asked
// to change (or said without choosing), and, folded at the end, the items it did not answer
function choicesPage(r) {
  const items = itemsOf(r.id);
  const did = new Map(items.map((it) => [it.id, wkDid(r, it)]));
  const askFor = (it) => { const w = did.get(it.id); return askOf(it) || (w.k === "talk" ? { label: w.label.split(" · ")[0], note: (w.room.at(-1)?.body || w.extra.at(-1) || "").split("\n")[0] } : null); };
  const chose = (it) => ["chose", "msg"].includes(did.get(it.id).k);
  const yes = byScene(items.filter((it) => chose(it) || askFor(it))), rest = byScene(items.filter((it) => !chose(it) && !askFor(it)));
  S.ovList = [];
  const card = (it) => { const o = did.get(it.id).o || bestOf(it); return answerCard(it, o ? [o] : [], { ask: askFor(it) }); };
  const nOk = yes.filter(chose).length, nAsk = yes.filter(askFor).length;
  const status = [plural(nOk, "escolha", "escolhas"), nAsk ? `${plural(nAsk, "pedido", "pedidos")} em amarelo` : "",
    r.confirmed_at ? `<b class="ok">confirmada por ${esc(r.confirmed_by)} · ${fmtTime(r.confirmed_at)}</b>` : r.sent_at ? `enviada ${fmtTime(r.sent_at)}` : "ainda não enviada"].filter(Boolean).join(" · ");
  const fold = rest.length ? `<button class="hrest" data-act="rest" aria-expanded="${!!S.rest?.[S.page.kind]}">${S.rest?.[S.page.kind] ? "Esconder" : "Ver"} ${rest.length === 1 ? "o item" : `os ${rest.length} itens`} sem resposta</button>${S.rest?.[S.page.kind] ? cardGrid(rest.map(card), "dim") : ""}` : "";
  return head("Escolhas", status, dlButton(), `${esc(r.code)} · ${esc(r.title)}`) +
    `<div class="main-body ov-body" data-keep="main">${yes.length ? cardGrid(yes.map(card)) : '<p class="empty">O cliente ainda não respondeu.</p>'}${fold}</div>`;
}

// what the client said in each version and what the team did about it, one line per point linked to the cards that
// answer it. The client has no time to mark the room, so the team keeps the status for him from what he said

// one scene: every item with its options side by side
// the pages before and after n (the team also counts the empty page it is looking at)
function sceneSteps(r, n) {
  const scenes = scenesOf(r.id).map(([k]) => k);
  const all = TEAM ? [...new Set([...scenes, n])].sort((a, b) => a - b) : scenes;
  const i = all.indexOf(n);
  return [all[i - 1], all[i + 1]];
}
// a scene page (team): on Atual the same rows as the overview, with the item's tools; on one version or all, the cards
// a scene's Filtros, as an icon for the page head (fb.btn) and the chips of what is on (fb.chips)
function sceneFilter(r, items) {
  const trio = trioOn(r), list = items.filter((it) => (trio ? trioShown(r, it) : hasView(it)));
  return filterBar(r, { dropped: items.some((x) => optsOf(x.id).some(dropped)), ico: true }, apprNote(filtering() ? items.length - list.length : 0)) || null;
}
function sceneBody(r, items, fb = null) {
  const trio = trioOn(r);
  const list = items.filter((it) => (trio ? trioShown(r, it) : hasView(it)));
  const bar = fb ? fb.chips : filterBar(r, { dropped: items.some((x) => optsOf(x.id).some(dropped)) }, apprNote(filtering() ? items.length - list.length : 0));
  if (!list.length) return `${bar}<p class="empty">Nada com esse filtro.</p>`;
  S.ovList = [];
  return bar + (trio ? `<div class="trio-list big">${list.map((it) => trioRow(r, it, { tools: true })).join("")}</div>` : splitCols(list, teamRow));
}
function scenePage(r, n) {
  const [prev, next] = sceneSteps(r, n);
  const items = itemsOf(r.id).filter((x) => x.scene === n);
  const focus = TEAM && S.page.item && items.find((x) => x.id === S.page.item);
  if (focus) return focusPage(r, n, items, focus);
  const approved = items.filter((x) => x.decision === "approved").length;
  const create = !AI ? "" : `<button class="btn hico" data-act="estudio-criar" data-round="${r.id}" data-scene="${n}" title="Criar imagem com IA nesta cena" aria-label="Criar imagem com IA">${Estudio.ICONS.spark}</button>`;
  // the same arrows as on a card: here they go to the previous or next scene (and ← →)
  const sceneArrow = (s, d) => {
    const t = d < 0 ? "Cena anterior" : "Próxima cena", ico = d < 0 ? ICON.prev : ICON.next;
    return s !== undefined ? `<a class="btn hico" data-step="${d}" href="${sceneHref(r.id, s)}" title="${t} (${d < 0 ? "←" : "→"}): ${tag(s)} ${esc(sceneName(s))}" aria-label="${t}">${ico}</a>` : `<span class="btn hico off" aria-hidden="true">${ico}</span>`;
  };
  const fb = TEAM && items.length ? sceneFilter(r, items) : null;
  const right = TEAM ? `${sceneArrow(prev, -1)}${sceneArrow(next, 1)}${create}${addButton(n)}${fb ? fb.btn : ""}${dlButton()}${sendButton(r)}`
    : `${progress(approved, items.length, `${approved} de ${items.length} aprovados`)}${dlButton()}`;
  const look = lookOf(n);
  // a later round (the shots of A2) shows the kit its scene is made of, approved in an earlier one
  const kit = TEAM ? kitList(kitOfScene(n)) : [];
  const kitHere = kit.length && kit.every((o) => itemOf(o.item_id)?.round_id !== r.id) ? kitStack(kit) : "";
  const line = [kitHere, sceneLine(n) ? `“${esc(sceneLine(n))}”` : "",
    look ? `<span class="look"><span class="sw">${(look.palette || []).map((c) => `<i style="background:${esc(c)}"></i>`).join("")}</span>${esc(look.label || "")}</span>` : "",
    TEAM && look ? `<button class="link copy" data-act="copy-look" data-v="${n}" title="${esc(lookPrompt(n))}">Copiar prompt da cena</button>` : ""].filter(Boolean).join(" · ");
  return head(`<span class="num">${tag(n)}</span>${esc(sceneName(n))}`, TEAM ? "" : line, right, `${esc(r.code)} · ${esc(r.title)}`) +
    `<div class="main-body ${TEAM && items.length ? "fbody" : ""}" data-keep="main">${!items.length ? `<p class="empty">Nenhum item nesta cena.${TEAM ? ' <button class="link" data-act="add-item" data-scene="' + n + '">Criar um</button>' : ""}</p>` : TEAM ? sceneBody(r, items, fb) :`<div class="items">${items.map(clientRow).join("")}</div>`}${TEAM ? "" : `<nav class="cnav">${prev !== undefined ? `<a class="btn" href="${sceneHref(r.id, prev)}">← ${tag(prev)} ${esc(sceneName(prev))}</a>` : `<a class="btn" href="#/r/${r.id}">← Apresentação</a>`}<span class="grow"></span>${next !== undefined ? `<a class="btn primary" href="${sceneHref(r.id, next)}">Próxima: ${tag(next)} ${esc(sceneName(next))} →</a>` : `<a class="btn primary" href="#/r/${r.id}/resumo">Ver o resumo e confirmar →</a>`}</nav>`}</div>`;
}
// one card on its own (team, from the menu): the card at full width, every version of it underneath, and the
// arrows (and ← →) going to the previous or next card of the page
function focusPage(r, n, items, it) {
  // past the first or last card of the scene, the arrows go on to the previous or next scene's cards
  const [ps, ns] = sceneSteps(r, n), of = (s) => (s === undefined ? [] : itemsOf(r.id).filter((x) => x.scene === s));
  const k = items.indexOf(it), prev = items[k - 1] || of(ps).at(-1), next = items[k + 1] || of(ns)[0];
  const arrow = (x, d, ico, t) => x ? `<a class="btn hico" data-step="${d}" href="${sceneHref(r.id, x.scene, x.id)}" title="${t} (${d < 0 ? "←" : "→"}): ${x.scene !== n ? `${tag(x.scene)} ${esc(sceneName(x.scene))} · ` : ""}${esc(x.title)}" aria-label="${t}">${ico}</a>` : `<span class="btn hico off" aria-hidden="true">${ico}</span>`;
  const stepper = `<a class="btn hico" href="${sceneHref(r.id, n)}" title="Todos os cards de ${esc(sceneName(n))}" aria-label="Todos os cards da página">${ICON.grid}</a>`
    + arrow(prev, -1, ICON.prev, "Card anterior") + arrow(next, 1, ICON.next, "Próximo card");
  const tabsOf = TEAM && it.kind === "locacao" ? { ...ITEM_TABS, cena3d: "Cena 3D" } : ITEM_TABS; // Cena 3D: team, locations only
  const tab = tabsOf[S.page.tab] ? S.page.tab : tabsOf[S.itemTab] ? S.itemTab : "versoes";
  const V = r.version || 1;
  const f = fbOf(r.id, it.id, V - 1) || fbOf(r.id, it.id);
  const ts = f ? tasksOf(r.id, it.id, f.version) : [];
  const st = f ? `<span class="fb ${f.status}">${FB[f.status]}</span>` : it.decision === "approved" ? '<span class="fb aprovado">Aprovado</span>' : "";
  const sub = [KINDS[it.kind] ? `<span class="ihead-kind">${KINDS[it.kind]}</span>` : "", st, f?.summary ? esc(f.summary) : it.brief ? esc(it.brief) : "", whoChip(it),
    ts.length ? `<span class="ihead-n" title="Tarefas feitas">${ts.filter((t) => t.done).length}/${ts.length} tarefas</span>` : ""].filter(Boolean).join(" ");
  const counts = { versoes: optsOf(it.id).filter((o) => !dropped(o) && !isAngle(o)).length, pedido: commentsOf(it.id).length + (f ? lines(f.client_extra).length : 0), refs: S.wkRefs.filter((x) => x.item_id === it.id).length + refsOf(it).length, cena3d: optsOf(it.id).filter((o) => isAngle(o) && !dropped(o)).length };
  const VIEW = { versoes: [ICON.grid, "Versões"], refs: [CLIP, "Referências"], cena3d: [CUBE, "Cena 3D"] };
  const views = `<span class="hgroup seg-ico">${Object.keys(tabsOf).filter((k2) => VIEW[k2]).map((k2) => `<a class="btn hico ${tab === k2 || (k2 === "versoes" && tab === "pedido") ? "on" : ""}" href="${sceneHref(r.id, n, it.id)}/${k2}" title="${VIEW[k2][1]}${counts[k2] ? ` · ${counts[k2]}` : ""}" aria-label="${VIEW[k2][1]}">${VIEW[k2][0]}</a>`).join("")}</span>`;
  // the request and the comments open in the panel, as from a card's yellow line
  const ask = TEAM ? askOf(it) : null, said = commentsOf(it.id).length;
  const panel = `<button class="btn hico ${S.drawer === it.id ? "on" : ""}" data-act="${TEAM && lastFbOf(it.id) ? "pedido" : "drawer"}" data-id="${it.id}" title="${ask ? `${esc(ask.label)}${ask.note ? ` · ${esc(ask.note)}` : ""}` : "Pedido e comentários"}${said ? ` · ${plural(said, "comentário", "comentários")}` : ""}" aria-label="Pedido e comentários">${ICO.note}${ask ? '<i class="dot warn"></i>' : said ? `<b class="badge">${said}</b>` : ""}</button>`;
  const fb = tab === "versoes" || tab === "pedido" ? filterBar(r, { dropped: optsOf(it.id).some(dropped), bare: true }) : null;
  const body = tab === "cena3d" ? cena3dSlot(it) : tab === "refs" ? itemRefs(r, it) : itemVersions(r, it, fb?.chips || "");
  const brief = it.brief || f?.summary || "";
  return head(`<span class="num">${tag(n)}</span>${esc(it.title)}${brief ? `<span class="h1-brief" title="${esc(brief)}">${esc(brief)}</span>` : ""}`, "",
    `${views}${panel}${fb?.btn || ""}${dlButton()}<span class="hgroup">${stepper}</span>${sendButton(r)}`) +
    `<div class="main-body focus-body" data-keep="main">${body}</div>`;
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
    <header class="citem-head"><span class="kind">${KINDS[it.kind] || ""}</span><h3>${esc(it.title)}</h3><span class="state ${cls}">${label}</span><span class="grow"></span>${compareButton(it)}${chatButton(it)}${ADMIN ? `<button class="chat wk-rm-item" data-act="wk-item-off" data-id="${it.id}" title="${esc(cap(A_CL))} deixa de ver o item inteiro. Só você vê este botão.">${ICO.drop}Tirar o item</button>` : ""}</header>
    ${voicesLine(it)}
    <div class="ctiles n${Math.min(opts.length, 3)} ${canPick ? "pickable" : ""}">${opts.map((o, i) => `<figure class="ctile ${o.id === it.chosen_option ? "chosen" : ""}">
      <button class="ctile-img" data-act="${canPick ? "choose" : "zoom"}" data-id="${it.id}" data-opt="${o.id}" data-i="${i}" aria-label="${canPick ? (o.id === it.chosen_option ? "Desfazer a escolha" : `Escolher a opção ${letter(i)}`) : "Ver em tela cheia"}" ${canPick && o.id === it.chosen_option ? 'title="Clique de novo para desfazer"' : ""}>${media(o)}${vplayBtn(o)}</button>
      ${single ? "" : `<span class="lab">${letter(i)}</span>`}
      ${isNova(it, o) ? '<span class="ctile-new" title="Nova: entrou como extra pra você comparar e tirar a pior. Só você vê esta marca.">Nova</span>' : ""}
      ${o.id === it.chosen_option && !single ? `<span class="ctile-check">${ICO.keep}Escolhida</span>` : ""}
      <button class="ctile-zoom" data-act="zoom" data-id="${it.id}" data-i="${i}" title="Ver em tela cheia" aria-label="Ver em tela cheia">${ICO.view}</button>
      ${ADMIN ? `<button class="ctile-rm" data-act="wk-off" data-id="${it.id}" data-opt="${o.id}" title="Tirar da aprovação: ${A_CL} deixa de ver esta imagem, que continua na produção. Só você vê este botão." aria-label="Tirar da aprovação">${ICO.drop}</button>` : ""}
    </figure>`).join("")}</div>
    <div class="citem-acts">${actions}${it.mode === "set" && opts.length > 1 ? `<span class="grow"></span><button class="btn" data-act="item-zip" data-id="${it.id}">Baixar o pacote (.zip)</button>` : ""}</div>
  </article>`;
}
// team item on a scene page: the overview card (one big image, arrows through the versions), the grid icon swaps it
// for the contact sheet of every version; title, tools and "⋯" show in two pills on the image
// the title pill is as wide as its text: a hidden copy of it (data-v, see .tfit) sets the width
const fitTitle = (t) => (t.parentNode.dataset.v = t.value);
// a shot of the animatic (kind plano): ✦ makes its frame in the studio, starting from the scene's approved kit; 3D opens
// the Cena 3D of the scene's approved location at the shot's camera (variants.shot, a preset of cena3d/sets.js)
// the scene's approved location: the one the client picked an image of, else one approved as a whole (e.g. a window and a nightstand)
const shotLoc = (it) => { const locs = S.items.filter((l) => l.kind === "locacao" && l.scene === it.scene); return locs.find((l) => l.chosen_option) || locs.find((l) => l.decision === "approved"); };
// a shot's blocking frame: the newest angle saved in its location's Cena 3D from the shot's planned camera
function blockOfShot(it) {
  const shot = it.kind === "plano" && it.variants?.shot, loc = shot && shotLoc(it);
  if (!loc) return null;
  return (S.bshots || []).filter((b) => b.item_id === loc.id && (b.camera?.from_preset === shot || b.camera?.preset === shot))
    .map((b) => optById(b.option_id)).filter((o) => o && !dropped(o)).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] || null;
}
// a shot's 3D blocking: its location's Cena 3D, on the shot's camera when the deck planned one ("-" when it did not),
// then the card's own id, so the 3D's Renderizar sends its frame back to this card
const shot3d = (it) => { const loc = it.kind === "plano" && shotLoc(it); return loc ? `${sceneHref(loc.round_id, loc.scene, loc.id)}/cena3d/${encodeURIComponent(it.variants?.shot || "-")}/${it.id}` : ""; };
// what the studio is still making for a card (a render sent from Cena 3D, an edit…), on its title pill until it lands
function makingOf(id) {
  const js = TEAM ? Estudio.making(id) : [];
  if (!js.length) return "";
  const j = js.reduce((a, b) => (String(a.created_at) > String(b.created_at) ? a : b));
  return `✦ ${{ queued: "Na fila", in_progress: "Gerando" }[j.status] || "Guardando"}${js.length > 1 ? ` · ${js.length}` : ""}…`;
}
// team: a scene's kit, the approved people, place and product it is made of (PRODUCT in config.js) (the studio's Criar starts from it), as their
// cards show them now
const kitOfScene = (n) => (TEAM ? Estudio.sceneKit(estCtx(), n) : { cast: [], place: [], device: null });
const kitList = (k) => [...k.cast, ...k.place, ...(k.device ? [k.device] : [])];
// the kit as a stack of circles, the studio's look: hovering spreads them and names each; a click opens its card
function kitStack(list) {
  if (!list.length) return "";
  return `<span class="kit" aria-label="Kit aprovado da cena">${list.map((o) => {
    const it = itemOf(o.item_id);
    return `<a class="kit-c" href="${it ? sceneHref(it.round_id, it.scene, it.id) : "#"}" aria-label="${esc(it?.title || "")}">${media(o, "thumb")}<span class="kit-tip">${esc(it?.title || "")}<small>aprovado na ${esc(roundOf(it?.round_id)?.code || "")}</small></span></a>`;
  }).join("")}</span>`;
}
// an item with nothing in it yet (team): behind it the shot's blocking frame when one was saved (else the scene's
// approved place, dim), the scene's kit as circles top right on hover; its actions (✦, 3D, + Subir) sit in the card's menu
// like on every other card, and a file dropped or pasted on it comes in as an option
function slotHero(it) {
  const k = kitOfScene(it.scene), blk = blockOfShot(it), bg = blk || k.place.find((o) => o.item_id !== it.id);
  const kit = kitList(k).filter((o) => o.item_id !== it.id);
  return `<div class="hero hero-slot ${blk ? "has-blk" : ""}">${bg ? `<div class="slot-bg" title="${blk ? "O blocking 3D deste plano: o ✦ começa dele" : "A locação aprovada da cena"}">${media(bg, "tile")}</div>` : ""}
    ${kit.length ? `<span class="slot-kit">${kitStack(kit)}</span>` : ""}${S.uploading[it.id] ? `<p class="slot-hint">${esc(S.uploading[it.id])}</p>` : ""}</div>`;
}
// a card's AI tools: ✦ edits the image on screen (it goes in as the base) or, on an empty card, creates it with the
// scene's kit (the approved people, place and product, and the shot's text); 3D opens a shot's blocking
const shotBtn = (it, o = null) => {
  if (!TEAM) return "";
  const l3d = shot3d(it), empty = !optsOf(it.id).length;
  const blk = empty ? blockOfShot(it) : null;
  const ai = !AI ? "" : o && !o.mime.startsWith("video/") ? `<button class="ibtn" data-act="estudio" data-id="${o.id}" title="Editar esta imagem com IA: ela entra como base" aria-label="Editar esta imagem com IA">${Estudio.ICONS.spark}</button>`
    : blk ? `<button class="ibtn" data-act="estudio" data-id="${blk.id}" title="Render do blocking deste plano: o blocking é a base (o ✕ dela vira Criar com o kit)" aria-label="Render do blocking">${Estudio.ICONS.spark}</button>`
    : empty ? `<button class="ibtn" data-act="estudio-criar" data-round="${it.round_id}" data-scene="${it.scene}" data-item="${it.id}" title="Criar com IA: já vem com o elenco, a locação e o produto aprovados da cena${it.kind === "plano" ? " e o texto deste plano" : ""}" aria-label="Criar com IA">${Estudio.ICONS.spark}</button>` : "";
  return ai + (l3d ? `<a class="ibtn ibtn-3d" href="${l3d}" title="Blocking 3D deste plano${it.variants?.shot ? ", já na câmera dele" : ""}" aria-label="Blocking 3D deste plano">3D</a>` : "");
};
// the card of every page of cards (team), Visão geral included: there it names its scene, and the lightbox walks on
// through the next cards
function teamRow(it, { scene = false, ov = false } = {}) {
  const all = optsOf(it.id);
  const opts = shownOpts(it.id);
  const [cls, label] = stageOf(it);
  const ci = all.findIndex((o) => isPick(it, o));
  const L = ci >= 0 && wkOpts(it.id).length > 1 ? letterOf(it, all[ci]) : "";
  // the client's answer, short in the title pill; who and when in its tooltip
  const fb = it.visible && (it.decision !== "pending" || L)
    ? `${esc(CL)} ${it.decision === "approved" ? "aprovou" : it.decision === "changes" ? "pediu ajuste" : "escolheu"}${L ? ` ${L}` : ""}` : "";
  const fbBy = fb && it.decided_by ? ` · ${esc(it.decided_by)}, ${fmtTime(it.decided_at)}` : "";
  const n = commentsOf(it.id).length;
  const open = S.more === it.id;
  const sheet = sheetOpts(it);
  const grid = S.sheet[it.id] || (all.length && !opts.length);
  const vp = TEAM ? verPairs(it) : [];
  const pairs = !grid ? (S.vcmp[it.id] && vp.length ? vp : pairsOf(opts)) : [];
  const act = ov ? "ov-open" : "zoom";
  const h = opts.length && !grid && !pairs.length ? heroOf(it, opts, { act, del: true, tools: false }) : null;
  if (ov && !pairs.length) (h ? opts : sheet).forEach((o) => S.ovList.push({ id: it.id, i: all.indexOf(o) }));
  const upload = `<input type="file" multiple hidden accept="image/*,video/*" data-upload-item="${it.id}">`;
  const body = pairs.length ? wipeHero(it, pairs)
    : !all.length
    ? slotHero(it)
    : h ? h.html : sheet.length ? `<div class="csh-grid">${sheet.map((o) => sheetTile(it, o, { act, del: true })).join("")}</div>` : '<div class="hero hero-empty">Nada com esses filtros</div>';
  // nothing under the image: signals sit top left on it, the image's own actions top right, and on hover two small
  // pills along the bottom edge, status and title on the left, the card's tools on the right; they stay up while
  // the popover or the comments are open
  const mk = S.uploading[it.id] ? "" : makingOf(it.id);
  const pos = S.uploading[it.id] ? esc(S.uploading[it.id]) : mk;
  const ask = askOf(it);
  return `<article class="hcard sitem ${h?.verdict ? `rv-${h.verdict}` : ""} ${ask ? "ask" : ""} ${S.flash === it.id ? "flash" : ""}" id="item-${it.id}" data-drop="${it.id}"${orderOf(it)}>
    <div class="sitem-media">
    ${body}
    <span class="t sitem-pill sitem-title">${grip(cls, `${label}${it.assignee ? ` · ${esc(PEOPLE[it.assignee] || it.assignee)}` : ""}${it.visible ? ` · ${A_CL} vê` : ""}`)}${scene ? `<span class="num">${two(it.scene)}</span>` : ""}<span class="tfit" data-v="${esc(it.title)}"><input class="inline title" data-field="title" data-id="${it.id}" value="${esc(it.title)}" maxlength="120" size="1" aria-label="Título" title="${esc(it.brief || it.title)}"></span>${fb ? `<span class="sitem-fb" title="${fb}${fbBy}">${fb}</span>` : ""}${pos ? `<span class="pos${mk ? " mk" : ""}"${mk ? ' title="O estúdio está gerando pra este card: o resultado entra aqui sozinho"' : ""}>${pos}</span>` : ""}</span>
    <footer class="hcard-foot sitem-foot ${open || S.drawer === it.id || (pos && !mk) ? "pin" : ""}">
      <span class="sitem-tools sitem-pill">
        ${all.length > 1 ? `<button class="ibtn ${grid ? "on" : ""}" data-act="item-sheet" data-id="${it.id}" aria-pressed="${!!grid}" title="${grid ? "Voltar para a imagem grande" : "Ver todas as versões juntas"}" aria-label="Ver todas as versões juntas">${ICON.grid}</button>` : ""}
        ${vp.length ? `<button class="ibtn ${S.vcmp[it.id] ? "on" : ""}" data-act="ver-cmp" data-id="${it.id}" aria-pressed="${!!S.vcmp[it.id]}" title="${S.vcmp[it.id] ? "Voltar para as opções" : `Comparar ${vp[0].l} × ${vp[0].r}: cada versão nova com a imagem de onde saiu`}" aria-label="Comparar versões">${TYPE_ICON.compare}</button>` : ""}
        ${refsOf(it).length && all.length ? `<button class="ibtn" data-act="compare" data-id="${it.id}" title="Comparar com as fotos originais" aria-label="Comparar">${CMP}</button>` : ""}
        ${shotBtn(it, h ? all[h.idx] : null)}
        ${motionOf(it) ? `<button class="ibtn" data-act="motion" data-id="${it.id}" data-o="${h ? all[h.idx].id : ""}" title="${esc(motionLabel())}: ajustar e renderizar o vídeo aqui no card" aria-label="${esc(motionLabel())}">${MOTION_ICO}</button>` : ""}
        ${h && canSplit(it, all[h.idx]) ? `<button class="ibtn" data-act="split" data-id="${all[h.idx].id}" title="Virar card novo: esta imagem sai deste card e vira um card logo ao lado" aria-label="Virar card novo">${SPLIT_ICO}</button>` : ""}
        ${h ? `<button class="ibtn" data-act="download" data-id="${all[h.idx].id}" title="Baixar o original" aria-label="Baixar">${ICO.down}</button>` : ""}
        ${all.length ? "" : `<button class="ibtn ${S.drawer === it.id ? "on" : ""} ${n ? "has" : ""}" data-act="drawer" data-id="${it.id}" title="Comentários" aria-label="Comentários">${CHAT}${n ? `<b>${n}</b>` : ""}</button>`}
        <button class="ibtn ${open ? "on" : ""}" data-act="more" data-id="${it.id}" title="Subir imagens, dono, status, briefing, prompts, apagar o card" aria-label="Mais" aria-expanded="${open}">⋯</button>
        ${all.length ? "" : `<button class="ibtn ibtn-del" data-act="item-del" data-id="${it.id}" title="Apagar o card" aria-label="Apagar o card">${ICO.trash}</button>`}
        ${open ? morePop(it) : ""}
      </span>
    </footer>
    </div>
    ${askLine(it, ask)}
    ${voicesLine(it)}
  </article>`;
}
// o, the image on the card now, can leave for a card of its own (the extract icon on the card's tools) when it is a version
// or one of several images; never a Cena 3D angle, nor the one the client picked
const canSplit = (it, o) => TEAM && !!o && !isAngle(o) && it.chosen_option !== o.id && (!!o.stack || optsOf(it.id).filter((x) => !isAngle(x)).length > 1);
const SPLIT_ICO = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="2.5" y="5.5" width="8" height="8" rx="1.3"/><path d="M8 8l5.5-5.5M9.5 2.5h4v4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
// the card's ⋯, a short context menu: actions as rows with an icon, the card's settings in compact rows between thin
// lines. It opens above its button when the window ends first (S.moreUp, see fitMore)
function morePop(it) {
  const vars = Object.keys(it.variants || {}).sort();
  return `<div class="more-pop${S.moreUp ? " up" : ""}" role="dialog" aria-label="Ajustes de ${esc(it.title)}">
    <label class="mp-act" title="Ou arraste para o card, ou cole com ⌘V">${ICON.up}<span>Subir imagens ou vídeos</span><input type="file" multiple hidden accept="image/*,video/*" data-upload-item="${it.id}"></label>
    ${optsOf(it.id).length > 1 ? `<button class="mp-act" data-act="item-zip" data-id="${it.id}">${ICON.down}<span>Baixar o pacote (.zip)</span></button>` : ""}
    <hr class="mp-sep">
    <div class="mp-row"><span>Dono</span><select class="sel mini" data-field="assignee" data-id="${it.id}" aria-label="Responsável"><option value="">Sem dono</option>${Object.entries(PEOPLE).map(([k, n]) => `<option value="${k}" ${it.assignee === k ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></div>
    <div class="mp-row"><span>Status</span><div class="seg" role="group" aria-label="Status">${Object.entries(STATUS).map(([k, n]) => `<button data-act="status" data-id="${it.id}" data-v="${k}" class="${it.status === k ? "on" : ""}" aria-pressed="${it.status === k}">${n}</button>`).join("")}</div></div>
    <div class="mp-row"><span>${esc(CL)}</span><button class="vis" data-act="mode" data-id="${it.id}" title="${it.mode === "set" ? `As opções são vistas de uma coisa só: ${A_CL} aprova o conjunto` : `${cap(A_CL)} escolhe uma das opções`}">${it.mode === "set" ? "Aprova o conjunto" : "Escolhe uma"}</button><button class="vis ${it.visible ? "on" : ""}" data-act="visible" data-id="${it.id}" title="${it.visible ? `${cap(A_CL)} está vendo. Clique para esconder.` : `Mostrar só este item ${AO_CL}`}">${it.visible ? "Já vê" : "Oculto"}</button></div>
    ${vars.length ? `<div class="mp-row"><span>Prompts</span><span class="vars" title="Prompt pronto de cada direção do briefing: clique para copiar e colar no gerador de imagens">${vars.map((k) => { const n = k.charCodeAt(0) - 64; return `<button class="link" data-act="copy-var" data-id="${it.id}" data-v="${k}" data-n="${n}" title="Copiar o prompt da direção ${n}: ${esc(variantPrompt(it, k))}">${n}</button>`; }).join("")}</span></div>` : ""}
    <input class="field mp-brief" data-field="brief" data-id="${it.id}" value="${esc(it.brief)}" placeholder="Briefing para o time" maxlength="400" aria-label="Briefing">
    <hr class="mp-sep">
    ${it.visible && it.decision !== "pending" ? `<button class="mp-act" data-act="reopen" data-id="${it.id}">${ICO.redo}<span>Reabrir a decisão</span></button>` : ""}
    <button class="mp-act danger" data-act="item-del" data-id="${it.id}">${ICO.trash}<span>Apagar o card</span></button>
  </div>`;
}
// the ⋯ menu hangs below its button; when the window (under the page's header) ends before it does and there is more room
// above, it opens upward. Measured once it is drawn; the side it took stays through the re-renders while it is open
function fitMore() {
  const p = S.more && $app.querySelector(".more-pop");
  if (!p) return;
  const b = p.parentElement.getBoundingClientRect(), need = p.offsetHeight + 14;
  const top = Math.max(0, $app.querySelector('[data-keep="main"]')?.getBoundingClientRect().top || 0);
  const below = innerHeight - b.bottom, above = b.top - top;
  const up = S.moreUp ? !(above < need && below > above) : below < need && above > below;
  if (up !== !!S.moreUp) { S.moreUp = up; render(true); }
}

// ---------- retorno: the client's answer to a round, turned into work ----------
const CHEV = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M6 4l4 4-4 4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const lines = (s) => (s || "").split("\n").map((x) => x.trim()).filter(Boolean);
const isImgUrl = (u) => /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(u || "");
// an open question of the round (asked of the client, or ours to decide), with its answer in place
function pendRowHtml(rid, p) {
  const it = p.item_id ? itemOf(p.item_id) : null;
  return `<div class="pend ${p.resolved ? "done" : ""}">
    <input type="checkbox" data-pend-done="${p.id}" ${p.resolved ? "checked" : ""} aria-label="Resolvida" title="${p.resolved ? "Reabrir" : "Marcar resolvida"}">
    <span class="ptag ${p.kind}">${PEND[p.kind]}</span>
    <div class="pbody"><p>${it ? `<a href="#/r/${rid}/retorno/${it.id}">${esc(it.title)}</a>` : "<b>Geral</b>"} · ${esc(p.text)}</p>
      <input class="inline pans" data-pend-answer="${p.id}" value="${esc(p.answer)}" placeholder="${p.kind === "decidir" ? "O que decidimos" : "A resposta"}" maxlength="1000" aria-label="Resposta"></div>
  </div>`;
}
// Retorno: what the client asked about a version, as the same grid of cards. A card shows what we made since (the newest
// answer), the client's base small in its footer (a click compares before and after); yellow while there is work, its
// request in one line that opens the panel (the request, the tasks, what is open, the references). The approved wait
// folded at the end; the round's open questions and agreements open in the panel from the header
function retornoPage(r) {
  const rid = r.id, v = retVer(rid), vers = fbVers(rid);
  const fOf = new Map(S.feedback.filter((f) => f.round_id === rid && f.version === v).map((f) => [f.item_id, f]));
  const items = byScene(itemsOf(rid).filter((it) => fOf.has(it.id)));
  const ok = (it) => fOf.get(it.id).status === "aprovado";
  const work = items.filter((it) => !ok(it)), done = items.filter(ok);
  const open = S.pendencias.filter((p) => p.round_id === rid && !p.resolved).filter(byVer(v)).length;
  const tasks = S.tasks.filter((t) => t.round_id === rid).filter(byVer(v)), tdone = tasks.filter((t) => t.done).length;
  S.ovList = [];
  const card = (it) => {
    const f = fOf.get(it.id), now = answerOpts(it, v);
    const base = S.options.find((x) => x.id === (f.base_option || it.chosen_option));
    const list = now.length ? now : base ? [base] : [];
    list.forEach((o) => S.ovList.push({ id: it.id, i: optsOf(it.id).indexOf(o) }));
    const h = list.length ? heroOf(it, list, { quiet: true }) : null;
    const ts = tasksOf(rid, it.id, v), td = ts.filter((t) => t.done).length;
    const antes = now.length && base ? `<button class="ret-antes" data-act="pair" data-id="${it.id}" data-i="0" title="Antes: o que o cliente viu na v${v}. Clique para comparar com o que fizemos" aria-label="Comparar antes e agora">${media(base, "thumb")}</button>` : "";
    const ask = ok(it) ? null : { label: FB[f.status], note: f.summary || "" };
    return `<article class="hcard ${ask ? "ask" : ""}">${h ? h.html : slotHero(it)}
      <footer class="hcard-foot">${cardTitle(it)}<span class="foot-acts">${antes}${ts.length ? `<span class="foot-n" title="Tarefas feitas">${td}/${ts.length}</span>` : ""}<button class="ibtn" data-act="pedido" data-id="${it.id}" title="Pedido, tarefas e referências" aria-label="Abrir o pedido">${ICO.note}</button></span></footer>
      ${askLine(it, ask)}
    </article>`;
  };
  const verPick = vers.length > 1 ? `<div class="seg" role="group" aria-label="Versão do retorno">${vers.map((x) => `<button data-act="ret-ver" data-v="${x}" class="${x === v ? "on" : ""}" aria-pressed="${x === v}">v${x}</button>`).join("")}</div>` : "";
  const panel = `<button class="btn hico ${S.drawer === "round" ? "on" : ""}" data-act="round-panel" title="Em aberto e combinados da rodada" aria-label="Em aberto e combinados">${ICO.note}${open ? `<b class="badge">${open}</b>` : ""}</button>`;
  const next = `<button class="btn small" data-act="ver-next" data-id="${rid}" title="Quando chegar o próximo retorno do cliente: as opções novas entram como v${r.version + 1}">Abrir v${r.version + 1}</button>`;
  const sub = [`Sobre a v${v}`, plural(work.length, "item com trabalho", "itens com trabalho"), plural(done.length, "aprovado", "aprovados"), tasks.length ? `${tdone} de ${tasks.length} tarefas` : ""].filter(Boolean).join(" · ");
  const opened = !!S.rest?.[S.page.kind];
  const fold = done.length ? `<button class="hrest" data-act="rest" aria-expanded="${opened}">${opened ? "Esconder" : "Ver"} ${done.length === 1 ? "o aprovado" : `os ${done.length} aprovados`}</button>${opened ? cardGrid(done.map(card), "dim") : ""}` : "";
  return head("Retorno", sub, verPick + panel + next, `${esc(r.code)} · ${esc(r.title)} · o que fazer na v${v + 1}`) +
    `<div class="main-body ov-body" data-keep="main">${work.length ? cardGrid(work.map(card)) : '<p class="empty">Nada com trabalho nesta versão.</p>'}${fold}</div>`;
}
// the panel for the round: what is open (to ask, to receive, to decide) and what was agreed
function roundPanel() {
  const r = roundOf(S.page.round);
  if (!r) return "";
  const rid = r.id, v = retVer(rid);
  const pends = S.pendencias.filter((p) => p.round_id === rid).filter(byVer(v));
  const open = pends.filter((p) => !p.resolved), solved = pends.filter((p) => p.resolved);
  const note = S.roundNotes.find((n) => n.round_id === rid)?.body || "";
  return `<aside class="drawer wide" aria-label="Em aberto e combinados">
    <div class="drawer-head"><div><p>${esc(r.code)} · retorno da v${v}</p><h2>Em aberto e combinados</h2></div><button class="link" data-act="drawer-close" aria-label="Fechar">Fechar ✕</button></div>
    <div class="drawer-body">
      <p class="side-label">Em aberto <small>${open.length}</small></p>
      <p class="drawer-note">Perguntar e receber vão pelo cliente. Decidir é com a gente.</p>
      ${open.map((p) => pendRowHtml(rid, p)).join("") || '<p class="none">Nada em aberto.</p>'}
      ${solved.length ? `<button class="link ret-solved" data-act="ret-resolved" aria-expanded="${S.ret.resolved}">${S.ret.resolved ? "Esconder" : "Ver"} as resolvidas (${solved.length})</button>${S.ret.resolved ? solved.map((p) => pendRowHtml(rid, p)).join("") : ""}` : ""}
      <p class="side-label">Combinados da rodada <small>${lines(note).length}</small></p>
      <textarea class="field ret-notes" data-rnote="${rid}" rows="5" maxlength="4000" placeholder="Um combinado por linha" aria-label="Combinados da rodada">${esc(note)}</textarea>
    </div></aside>`;
}
// the images to flip through for one item: the old base first, then the new round's versions, newest first
function pairList(it, v = retVer(it.round_id)) {
  const f = fbOf(it.round_id, it.id, v);
  const base = S.options.find((x) => x.id === (f?.base_option || it.chosen_option));
  return [...(base ? [{ o: base, it, side: "antes" }] : []), ...answerOpts(it, v).map((o) => ({ o, it, side: "agora" }))];
}
// flip between the old base and the new versions of one item, with Manter / Descartar on the new ones
function pairViewer() {
  const it = itemOf(S.lightbox.pair);
  const list = it ? pairList(it) : [];
  const e = list[S.lightbox.i];
  if (!e) return "";
  const rv = reviewOf(e.o.id)?.verdict;
  const tag = `<span class="pair-tag ${e.side}">${e.side === "antes" ? "Antes" : "Agora"} · v${verOf(e.o)}</span>`;
  return `<div class="lb" data-act="lb-bg" role="dialog" aria-modal="true" aria-label="${esc(it.title)}">
    <div class="lb-top"><span>${tag}<b>${esc(it.title)}</b>${e.o.caption ? ` · ${esc(e.o.caption)}` : ""} · ${S.lightbox.i + 1} de ${list.length}</span><button class="link" data-act="lb-close">Fechar ✕</button></div>
    <div class="lb-stage">${media(e.o, "big")}
      ${list.length > 1 ? `<button class="lb-nav prev" data-act="lb-step" data-v="-1" aria-label="Anterior">‹</button><button class="lb-nav next" data-act="lb-step" data-v="1" aria-label="Próxima">›</button>` : ""}
    </div>
    <div class="lb-bottom">
      ${e.side === "agora" ? `<div class="seg">${[["keep", "Manter"], ["drop", "Descartar"]].map(([v, n]) => `<button data-act="review" data-id="${e.o.id}" data-v="${v}" class="${rv === v ? "on" : ""}" aria-pressed="${rv === v}">${n}</button>`).join("")}</div>` : ""}
      <button class="link" data-act="download" data-id="${e.o.id}">Baixar original</button>
      <span class="dim">← → antes e agora${e.side === "agora" ? " · M manter · D descartar" : ""}</span>
    </div>
  </div>`;
}
function retPanel(r, it, f, o) {
  const rid = r.id;
  const opts = optsOf(it.id);
  if (o && !opts.includes(o)) o = opts.find((x) => stackRoot(x).id === stackRoot(o).id) || o;
  const i = o ? opts.indexOf(o) : -1;
  const L = o && wkOpts(it.id).length > 1 && it.mode !== "set" ? letterOf(it, o) : "";
  const chosen = o && o.id === it.chosen_option;
  const ts = tasksOf(rid, it.id, f.version), done = ts.filter((t) => t.done).length;
  const ps = pendOf(rid, it.id, f.version);
  const refs = wkRefsOf(rid, it.id, f.version);
  const pics = refs.filter((x) => x.kind === "image" || (x.kind === "link" && isImgUrl(x.url)));
  const vids = refs.filter((x) => x.kind === "video");
  const links = refs.filter((x) => x.kind === "link" && !isImgUrl(x.url));
  const said = commentsOf(it.id).filter((c) => c.side === "cliente");
  const extra = lines(f.client_extra), notes = lines(f.notes);
  const saidOpen = !!S.ret.said[it.id], callOpen = !!S.ret.call[it.id];
  const nx = answerOpts(it, f.version), nv = f.version + 1;
  // the answer next to the old base: the options of the next version
  const v2strip = `<div class="ret-v2">
    <p class="side-label">Na v${nv} <small>${nx.length ? plural(nx.length, "opção", "opções") : f.status === "aprovado" ? `fica a v${f.version}` : "aguardando"}</small></p>
    ${nx.length ? `<div class="v2strip">${nx.map((x) => `<button class="v2t" data-act="zoom" data-id="${it.id}" data-i="${optsOf(it.id).indexOf(x)}" title="${esc(x.caption || x.name)}" aria-label="Ver grande">${media(x, "thumb")}</button>`).join("")}</div>` : ""}
  </div>`;
  const fbIn = (field, ph, max, cls = "") => `<input class="inline ret-in ${cls}" data-fb="${field}" data-id="${it.id}" data-round="${rid}" data-ver="${f.version}" value="${esc(f[field])}" title="${esc(f[field])}" placeholder="${ph}" maxlength="${max}" aria-label="${ph}">`;
  const taskRow = taskRowHtml;
  return `<div class="ret-panel">
    <div class="ret-edit">
      <div class="seg" role="group" aria-label="Situação">${Object.entries(FB).map(([v, n]) => `<button data-act="fb-status" data-id="${it.id}" data-round="${rid}" data-ver="${f.version}" data-v="${v}" class="${f.status === v ? `on fbon ${v}` : ""}" aria-pressed="${f.status === v}">${n}</button>`).join("")}</div>
      ${fbIn("summary", "O que fazer, numa linha", 200, "wide")}
      <a class="link" href="${sceneHref(it.round_id, it.scene, it.id)}">Abrir o card ›</a>
    </div>
    <div class="ret-cols">
      <section class="ret-col">
        <p class="side-label">${chosen ? `Escolhida ${A_CL.startsWith("a ") ? "pela" : A_CL.startsWith("o ") ? "pelo" : "por"} ${esc(CL)}` : "Base"}</p>
        ${o ? `<button class="ret-base" data-act="zoom" data-id="${it.id}" data-i="${i}" aria-label="Ver grande">${media(o)}${L ? `<span class="lab">${L}</span>` : ""}</button>` : `<p class="none">${f.status === "novo" ? "Ainda não existe: é para criar." : "Sem imagem escolhida."}</p>`}
        ${chosen && it.decided_by ? `<small class="dim">${esc(it.decided_by)} escolheu · ${fmtTime(it.decided_at)}</small>` : ""}
        <textarea class="inline ret-in ret-basenote" rows="1" data-fb="base_note" data-id="${it.id}" data-round="${rid}" data-ver="${f.version}" placeholder="De onde partir" maxlength="300" aria-label="De onde partir">${esc(f.base_note)}</textarea>
        <label class="ret-next">Próxima rodada ${fbIn("next_round", "Ex.: 2 opções", 80, "short")}</label>
        ${v2strip}
      </section>
      <section class="ret-col">
        <p class="side-label">Tarefas <small>${done} de ${ts.length}</small></p>
        <div class="tasks">${ts.map(taskRow).join("")}</div>
        <form class="task-add" data-form="add-task" data-id="${it.id}" data-round="${rid}" data-ver="${f.version}"><input class="ret-add" name="text" placeholder="+ Nova tarefa" maxlength="300" aria-label="Nova tarefa"></form>
        ${ps.length ? `<p class="side-label">Em aberto</p><div class="pmini-list">${ps.map((p) => `<label class="pmini ${p.resolved ? "done" : ""}"><input type="checkbox" data-pend-done="${p.id}" ${p.resolved ? "checked" : ""}><span class="ptag ${p.kind}">${PEND[p.kind]}</span><span>${esc(p.text)}${p.answer ? ` <b>→ ${esc(p.answer)}</b>` : ""}</span></label>`).join("")}</div>` : ""}
      </section>
      <section class="ret-col">
        <p class="side-label">Referências <small>${refs.length}</small></p>
        ${pics.length ? `<div class="refgrid">${pics.map(refTile).join("")}</div>` : ""}
        ${vids.map(vidRow).join("")}
        ${links.map((x) => `<a class="rlink" href="${esc(x.url)}" target="_blank" rel="noopener">${refTags(x)}<span>${esc(x.label || x.url)}</span> ↗</a>`).join("")}
        ${refs.length ? "" : '<p class="none">Nenhuma referência.</p>'}
      </section>
    </div>
    <div class="ret-more">
      <button class="ret-toggle" data-act="ret-said" data-id="${it.id}" aria-expanded="${saidOpen}">O que ${esc(A_CL)} disse <small>${said.length + extra.length}</small>${CHEV}</button>
      <button class="ret-toggle" data-act="ret-call" data-id="${it.id}" aria-expanded="${callOpen}">Nossa conversa <small>${notes.length}</small>${CHEV}</button>
    </div>
    ${saidOpen ? `<div class="ret-said">${said.map((c) => `<div class="msg cliente"><p class="meta"><b>${esc(c.author)}</b> · na sala · ${fmtTime(c.created_at)}</p><p class="body">${esc(c.body)}</p></div>`).join("")}${extra.map((l) => `<div class="msg cliente"><p class="meta"><b>Fora da sala</b></p><p class="body">${esc(l)}</p></div>`).join("")}${said.length || extra.length ? "" : '<p class="none">Nada escrito.</p>'}</div>` : ""}
    ${callOpen ? `<ul class="ret-call">${notes.map((l) => `<li>${esc(l)}</li>`).join("") || '<li class="none">Nada anotado.</li>'}</ul>` : ""}
  </div>`;
}
const refTags = (x) => `${x.cited ? '<b class="cited" title="${esc(cap(A_CL))} apontou esta referência">citada</b>' : ""}<span class="src">${SRC[x.source] || x.source}</span>`;
function refTile(x) {
  const img = x.path ? `<img data-path="${esc(x.path)}" alt="${esc(x.label)}" decoding="async"${srcAttr(x.path)}>` : `<img src="${esc(x.url)}" alt="${esc(x.label)}" loading="lazy" referrerpolicy="no-referrer">`;
  const open = x.path ? `<button class="rimg" data-act="ref-open" data-id="${x.id}" aria-label="Ver grande">${img}</button>` : `<a class="rimg" href="${esc(x.url)}" target="_blank" rel="noopener" aria-label="Abrir a imagem">${img}</a>`;
  return `<figure class="rtile">${open}<figcaption>${refTags(x)}${esc(x.label)}</figcaption></figure>`;
}
// a film reference: the frame that matters is the minute the team marks; the link opens YouTube right there
function vidRow(x) {
  const id = ytId(x.url);
  const href = id ? `https://www.youtube.com/watch?v=${id}${x.t_sec != null ? `&t=${x.t_sec}s` : ""}` : x.url;
  return `<div class="vid">
    <a class="vthumb" href="${esc(href)}" target="_blank" rel="noopener" title="Abrir no YouTube${x.t_sec != null ? ` em ${mmss(x.t_sec)}` : ""}">${id ? `<img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="" loading="lazy">` : ""}<span class="play">${ICON.play}</span></a>
    <div class="vbody"><p>${refTags(x)}${esc(x.label)}</p>
      <label class="tmark">Minuto que importa <input class="inline tsec" data-ref-t="${x.id}" value="${mmss(x.t_sec)}" placeholder="0:00" maxlength="6" inputmode="numeric" aria-label="Minuto que importa"></label></div>
  </div>`;
}

// the job's decks (DECKS in config.js), and every slide of the client's we use as a reference
function deckPage() {
  const seen = new Map();
  S.wkRefs.filter((x) => x.source === "deck" && x.path).forEach((x) => {
    const e = seen.get(x.path) || seen.set(x.path, { x, items: new Map() }).get(x.path);
    if (x.item_id) e.items.set(x.item_id, x.round_id);
  });
  const slides = [...seen.values()].sort((a, b) => a.x.label.localeCompare(b.x.label, "pt-BR", { numeric: true }));
  return head("Apresentação", `Os decks do job e os slides ${DA_CL} que viraram referência`, "", "O job") +
    `<div class="main-body" data-keep="main">
      <div class="decks">
        ${(DECKS || []).filter((d) => d.url).map((d) => `<a class="deck-card" href="${esc(d.url)}" target="_blank" rel="noopener"><p class="eyebrow">${esc(d.from || "")}</p><h3>${esc(d.title || "Deck")}</h3>${d.note ? `<p>${esc(d.note)}</p>` : ""}<span class="go">Abrir ↗</span></a>`).join("") || '<p class="none">Nenhum deck ainda: coloque os links em DECKS, no config.js.</p>'}
      </div>
      <p class="side-label deck-label">Slides ${DA_CL} usados como referência <small>${slides.length}</small></p>
      ${slides.length ? `<div class="deck-grid">${slides.map(({ x, items }) => `<figure class="rtile">
        <button class="rimg" data-act="ref-open" data-id="${x.id}" data-deck="1" aria-label="Ver grande"><img data-path="${esc(x.path)}" alt="${esc(x.label)}" decoding="async"${srcAttr(x.path)}></button>
        <figcaption><b>${esc(x.label)}</b>${[...items].map(([id, rid]) => itemOf(id) ? `<a href="#/r/${rid}/retorno/${id}">${esc(itemOf(id).title)}</a>` : "").filter(Boolean).join(" · ")}</figcaption></figure>`).join("")}</div>` : '<p class="none">Nenhum slide marcado como referência ainda.</p>'}
    </div>`;
}
// a reference image at full size, stepping through the same item's images (or the deck slides)
function refViewer() {
  const { ref, list } = S.lightbox;
  const x = S.wkRefs.find((y) => y.id === ref);
  if (!x) return "";
  const i = list.indexOf(ref);
  return `<div class="lb" data-act="lb-bg" role="dialog" aria-modal="true" aria-label="${esc(x.label)}">
    <div class="lb-top"><span><b>${esc(x.label)}</b> · ${SRC[x.source] || x.source}${list.length > 1 ? ` · ${i + 1} de ${list.length}` : ""}</span><button class="link" data-act="lb-close">Fechar ✕</button></div>
    <div class="lb-stage"><img data-path="${esc(x.path)}" alt="${esc(x.label)}"${srcAttr(x.path)}>
      ${list.length > 1 ? `<button class="lb-nav prev" data-act="lb-step" data-v="-1" aria-label="Anterior">‹</button><button class="lb-nav next" data-act="lb-step" data-v="1" aria-label="Próxima">›</button>` : ""}
    </div>
  </div>`;
}
// team writes on the Retorno tables: change the row in memory, draw, then save and reload
const RET_TABLES = { item_feedback: "feedback", feedback_refs: "wkRefs", tasks: "tasks", pendencias: "pendencias" };
function saveRow(table, match, patch, ok) {
  const row = S[RET_TABLES[table]].find((x) => Object.entries(match).every(([k, v]) => x[k] === v));
  if (row) Object.assign(row, patch);
  render(true);
  run(async () => {
    let q = sb.from(table).update(table === "item_feedback" ? { ...patch, updated_at: new Date().toISOString() } : patch);
    Object.entries(match).forEach(([k, v]) => (q = q.eq(k, v)));
    const { error } = await q;
    if (error) throw error;
    await refresh();
  }, ok);
}

// ---------- A fazer: the state of every item of the round, read from the data (the nav's count, the board's chips) ----------
// the newest option of an item that is not dropped (its thumb on lists)
const newestOpt = (it) => optsOf(it.id).filter((o) => !dropped(o)).sort((a, b) => verOf(b) - verOf(a) || b.created_at.localeCompare(a.created_at))[0];
// priority, top wins: options of the round's version without a verdict → revisar; work to do (feedback ajustar/refazer/novo
// or open tasks) and nothing alive in the current version → fazer; the client owes an answer → espera; a ✓ in the current
// version, or approved with nothing to redo → pronto; anything else → fazer
function todoOf(it, r) {
  const V = r.version || 1;
  const cur = optsOf(it.id).filter((o) => verOf(o) === V && !isAngle(o));
  const unrev = cur.filter((o) => !reviewOf(o.id)?.verdict);
  const f = fbOf(r.id, it.id, V - 1) || fbOf(r.id, it.id);
  const ts = f ? tasksOf(r.id, it.id, f.version) : [];
  const work = (f && ["ajustar", "refazer", "novo"].includes(f.status)) || ts.some((t) => !t.done);
  const waiting = f?.status === "espera" || pendOf(r.id, it.id).some((p) => !p.resolved && (p.kind === "perguntar" || p.kind === "receber"));
  const killed = (o) => ["drop", "redo"].includes(reviewOf(o.id)?.verdict);
  const g = unrev.length ? "revisar"
    : work && cur.every(killed) ? "fazer"
    : waiting ? "espera"
    : cur.some(kept) || (f?.status === "aprovado" && !work) ? "pronto"
    : "fazer";
  const why = cur.filter(killed).map((o) => reviewOf(o.id)).filter((rv) => rv?.note).sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  return { g, f, ts, unrev, why };
}
// who does it: a chip that cycles through the team (PEOPLE) → nobody
const whoChip = (it) => `<button class="who-chip ${it.assignee ? "on" : ""}" data-act="who-cycle" data-id="${it.id}" title="Quem faz (clique para trocar)">${it.assignee ? esc(PEOPLE[it.assignee] || it.assignee) : "Sem dono"}</button>`;
// ---------- the item page: everything about one item, in three tabs ----------
const ITEM_TABS = { versoes: "Versões", pedido: "Pedido", refs: "Referências" };
// Cena 3D (sala/cena3d/, team only): the 3D blocking set of an approved location. The module loads on first use and
// moves its one persistent 3D view back into this slot after every render
const cena3dSlot = (it) => {
  import("./cena3d/cena3d.js").then((m) => m.mount(estCtx())).catch((e) => { console.error(e); toast("A Cena 3D não carregou.", true); });
  return `<div class="c3d-slot" data-c3d="${it.id}"></div>`;
};
const taskRowHtml = (t) => `<div class="task ${t.done ? "done" : ""}"><label><input type="checkbox" data-task-done="${t.id}" ${t.done ? "checked" : ""}><span>${esc(t.text)}</span></label>
    <select class="sel mini" data-task-who="${t.id}" aria-label="Quem faz"><option value="">Quem?</option>${Object.entries(PEOPLE).map(([k, n]) => `<option value="${k}" ${t.assignee === k ? "selected" : ""}>${n}</option>`).join("")}</select>
    <button class="tdel" data-act="task-del" data-id="${t.id}" title="Apagar a tarefa" aria-label="Apagar a tarefa">×</button></div>`;
// Versões: the card with its tools, then every version of it, newest first, each option with its verdict and letter
function itemVersions(r, it, chips = null) {
  const vs = [...new Set(optsOf(it.id).map(verOf))].sort((a, b) => b - a);
  const latest = latestVer(it.id);
  const groups = vs.map((v) => {
    const opts = sheetOpts(it).filter((o) => verOf(o) === v);
    if (!opts.length) return "";
    return `<section class="ver-group"><p class="side-label">v${v} <small>${plural(opts.length, "opção", "opções")}${v === latest && vs.length > 1 ? " · a mais nova" : ""}</small></p>
      <div class="csh-grid">${opts.map((o) => sheetTile(it, o, { act: "zoom", del: true })).join("")}</div></section>`;
  }).join("");
  const bar = chips ?? filterBar(r, { dropped: optsOf(it.id).some(dropped), cls: "item-bar" });
  if (optsOf(it.id).length && !hasView(it)) return bar + hiddenRow(r, it, { page: true });
  return `${bar}<div class="focus-one">${teamRow(it)}</div>${groups}`;
}
// Pedido: what the client said (in the room and outside it), our notes, the tasks and what is still open
function itemPedido(r, it, f) {
  const comments = commentsOf(it.id);
  const extra = f ? lines(f.client_extra) : [], notes = f ? lines(f.notes) : [];
  const ts = f ? tasksOf(r.id, it.id, f.version) : [];
  const ps = pendOf(r.id, it.id);
  const sec = (t, body, extraHead = "") => `<section class="ped-sec"><header><h3>${t}</h3>${extraHead}</header>${body}</section>`;
  return `<div class="item-ped">
    ${f ? sec(`O pedido sobre a v${f.version}`, `<p class="ped-sum"><span class="fb ${f.status}">${FB[f.status]}</span> ${esc(f.summary)}</p>${f.base_note ? `<p class="dim">De onde partir: ${esc(f.base_note)}</p>` : ""}${f.next_round ? `<p class="dim">Próxima rodada: ${esc(f.next_round)}</p>` : ""}`, `<a class="link" href="#/r/${r.id}/retorno/${it.id}">Retorno ›</a>`) : ""}
    ${sec(`Na sala <small>${comments.length}</small>`, comments.length ? `<div class="ret-said">${comments.map((c) => `<div class="msg ${c.side}"><p class="meta"><b>${esc(c.author)}</b> · ${c.side === "time" ? esc(PROJECT.studio) : esc(CL)} · ${fmtTime(c.created_at)}</p><p class="body">${esc(c.body)}</p></div>`).join("")}</div>` : '<p class="none">Nenhum comentário na sala.</p>', `<button class="link" data-act="drawer" data-id="${it.id}">Comentar ›</button>`)}
    ${extra.length ? sec("Fora da sala (WhatsApp)", `<div class="ret-said">${extra.map((l) => `<div class="msg cliente"><p class="body">${esc(l)}</p></div>`).join("")}</div>`) : ""}
    ${notes.length ? sec("Nossa conversa", `<ul class="ret-call">${notes.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`) : ""}
    ${sec(`Tarefas <small>${ts.filter((t) => t.done).length} de ${ts.length}</small>`, `<div class="tasks">${ts.map(taskRowHtml).join("")}</div>
      ${f ? `<form class="task-add" data-form="add-task" data-id="${it.id}" data-round="${r.id}" data-ver="${f.version}"><input class="ret-add" name="text" placeholder="+ Nova tarefa" maxlength="300" aria-label="Nova tarefa"></form>` : ""}`)}
    ${ps.length ? sec(`Em aberto <small>${ps.filter((p) => !p.resolved).length}</small>`, ps.map((p) => `<div class="pend ${p.resolved ? "done" : ""}">
        <input type="checkbox" data-pend-done="${p.id}" ${p.resolved ? "checked" : ""} aria-label="Resolvida">
        <span class="ptag ${p.kind}">${PEND[p.kind]}</span>
        <div class="pbody"><p>${esc(p.text)}</p><input class="inline pans" data-pend-answer="${p.id}" value="${esc(p.answer)}" placeholder="${p.kind === "decidir" ? "O que decidimos" : "A resposta"}" maxlength="1000" aria-label="Resposta"></div>
      </div>`).join("")) : ""}
  </div>`;
}
// Referências: every reference of the item, grouped by where it came from; images wipe against the newest option
function itemRefs(r, it) {
  const all = S.wkRefs.filter((x) => x.item_id === it.id);
  const isVid = (x) => x.kind === "video";
  const groups = [
    [`Citadas ${A_CL.startsWith("a ") ? "pela" : A_CL.startsWith("o ") ? "pelo" : "por"} ${CL}`, all.filter((x) => x.cited)],
    ["Deck", all.filter((x) => !x.cited && !isVid(x) && x.source === "deck")],
    ["Frames dos filmes", all.filter((x) => !x.cited && isVid(x))],
    ["WhatsApp e materiais", all.filter((x) => !x.cited && !isVid(x) && ["whatsapp", "material", "sala"].includes(x.source))],
    ["Nossas", all.filter((x) => !x.cited && !isVid(x) && x.source === "nossa")],
    ["Da conversa", all.filter((x) => !x.cited && !isVid(x) && x.source === "conversa")],
  ];
  const now = newestOpt(it), ni = now ? optsOf(it.id).indexOf(now) : -1;
  const img = (x) => (x.kind === "image" && x.path) || (x.kind === "link" && isImgUrl(x.url));
  const tile = (x) => img(x)
    ? `<div class="iref">${refTile(x)}${now ? `<button class="link iref-cmp" data-act="vs-ref" data-id="${it.id}" data-i="${ni}" data-v="ref:${x.id}">${ICON.vs}Comparar com a versão atual</button>` : ""}</div>`
    : isVid(x) ? vidRow(x)
    : `<a class="rlink" href="${esc(x.url)}" target="_blank" rel="noopener">${refTags(x)}<span>${esc(x.label || x.url)}</span> ↗</a>`;
  const mats = refsOf(it);
  const html = groups.filter(([, l]) => l.length).map(([t, l]) => `<section class="ref-group"><p class="side-label">${t} <small>${l.length}</small></p>
      <div class="ref-grid">${l.filter(img).map(tile).join("")}</div>${l.filter((x) => !img(x)).map(tile).join("")}</section>`).join("");
  const matHtml = mats.length || voicesOf(it).length ? `<section class="ref-group"><p class="side-label">Materiais ${DA_CL} <small>${mats.length + voicesOf(it).length}</small></p>
      <div class="ref-grid">${mats.map((f) => `<figure class="rtile"><button class="rimg" data-act="file-open" data-id="${f.id}" aria-label="Ver grande"><img data-path="${esc(f.thumb_path || f.preview_path || f.path)}" alt=""${srcAttr(f.thumb_path || f.preview_path || f.path)}></button><figcaption><span class="src">Material</span>${esc(f.name)}</figcaption></figure>`).join("")}</div>${voicesLine(it)}</section>` : "";
  return `<div class="item-refs">${html}${matHtml}${html || matHtml ? "" : '<p class="none">Nenhuma referência neste item.</p>'}</div>`;
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
  const right = progress(sent, S.requests.length, `${sent} de ${S.requests.length} enviados`) +
    (TEAM && total ? `<button class="btn" data-act="all-zip">Baixar ${FILE_KINDS[k] ? FILE_KINDS[k].toLowerCase() : "todos os materiais"} (.zip)</button>` : "");
  return head(TEAM ? `Materiais ${DA_CL}` : "O que precisamos de vocês", sub, right, "Materiais") +
    `<div class="main-body ov-body" data-keep="main">${filter ? `<div class="ov-bar">${filter}</div>` : ""}<div class="reqs">${list.map(reqCard).join("")}${TEAM && k === "all" ? addReqCard() : ""}</div></div>`;
}
function reqCard(r) {
  const fs = filesShown(r.id);
  const [cls, label] = reqState(r);
  const pics = fs.filter((f) => fileKind(f) !== "voz"), voices = fs.filter((f) => fileKind(f) === "voz");
  const shown = pics.slice(0, 7);
  const both = pics.length && voices.length;
  return `<div class="req" data-drop-req="${r.id}">
    <div class="req-top"><h3>${esc(r.title)}</h3><span class="state ${cls}">${label}</span></div>
    <p class="req-detail" title="${esc(r.detail)}">${esc(r.detail)}</p>
    ${pics.length ? `${both ? '<span class="req-kind">Fotos</span>' : ""}<div class="files">${shown.map(fileTile).join("")}${pics.length > shown.length ? `<button class="more-files" data-act="file-open" data-id="${pics[shown.length].id}" title="Ver os outros">+${pics.length - shown.length}</button>` : ""}</div>` : ""}
    ${voices.length ? `${both ? '<span class="req-kind">Vozes</span>' : ""}<div class="req-voices">${voices.map(voiceTile).join("")}</div>` : ""}
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
function voiceTile(f) {
  const canDel = TEAM || f.side === "cliente";
  return `<div class="vtile"><small title="${esc(`${f.name}${f.uploaded_by ? ` · ${f.uploaded_by}` : ""}`)}">${esc(f.name.replace(/\.[^.]+$/, "").trim())}</small><audio controls preload="none" data-path="${esc(f.path)}"${srcAttr(f.path)}></audio>${canDel ? `<button class="x" data-act="file-del" data-id="${f.id}" aria-label="Remover ${esc(f.name)}">×</button>` : ""}</div>`;
}
const addReqCard = () => `<div class="req add"><form data-form="add-req"><input class="field" name="label" placeholder="Novo pedido ${AO_CL}" required maxlength="120"><input class="field" name="detail" placeholder="Detalhe (opcional)" maxlength="400"><button class="btn small">Adicionar pedido</button></form></div>`;

// the one panel on the right: an item's comments, or, when the client asked something of it (team), its request with
// the tasks, what is open and the references (retPanel); the round's open questions have their own (roundPanel)
function drawer() {
  if (S.drawer === "round") return roundPanel();
  const it = itemOf(S.drawer);
  if (!it) return "";
  const comments = commentsOf(it.id);
  const changes = S.mode[it.id] === "changes";
  const f = TEAM ? lastFbOf(it.id) : null, tab = f && S.drawerTab === "pedido" ? "pedido" : "comentarios";
  const headHtml = `<div class="drawer-head"><div><p><span class="num">${two(it.scene)}</span> ${esc(sceneName(it.scene))} · ${KINDS[it.kind] || ""}</p><h2>${esc(it.title)}</h2></div><button class="link" data-act="drawer-close" aria-label="Fechar">Fechar ✕</button></div>`;
  const tabs = f ? `<nav class="drawer-tabs" aria-label="Painel">${[["pedido", "Pedido"], ["comentarios", `Comentários${comments.length ? ` <small>${comments.length}</small>` : ""}`]].map(([k, t]) => `<button data-act="drawer-tab" data-v="${k}" class="${tab === k ? "on" : ""}" aria-pressed="${tab === k}">${t}</button>`).join("")}</nav>` : "";
  if (tab === "pedido") {
    const o = S.options.find((x) => x.id === (f.base_option || it.chosen_option));
    return `<aside class="drawer wide" aria-label="Pedido">${headHtml}${tabs}<div class="drawer-body">${retPanel(roundOf(f.round_id), it, f, o)}</div></aside>`;
  }
  return `<aside class="drawer" aria-label="Comentários">
    ${headHtml}${tabs}
    <div class="msgs" data-keep="msgs">${comments.map((c) => `<div class="msg ${c.side}"><p class="meta"><b>${esc(c.author)}</b> · ${c.side === "time" ? esc(PROJECT.studio) : esc(CL)} · ${fmtTime(c.created_at)}</p><p class="body">${esc(c.body)}</p></div>`).join("") || '<p class="none">Nenhum comentário ainda.</p>'}</div>
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
  const pairs = it ? wipePairs(it.id) : [];
  if (!pairs.length) return "";
  const k = Math.min(S.wipe[it.id] || 0, pairs.length - 1), p = pairs[k];
  const note = p.ver
    ? `<p class="lb-text dim">Passe o mouse na imagem: à esquerda do traço a ${esc(p.l)} de onde saiu, à direita a ${esc(p.r)}. A legenda, a avaliação e o prompt abaixo são da ${esc(p.r)}.</p>`
    : p.light
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
    const pairs = wipePairs(S.lightbox.wipe);
    return pairs[Math.min(S.wipe[S.lightbox.wipe] || 0, pairs.length - 1)]?.ia;
  }
  return S.lightbox?.id ? lbShown(optsOf(S.lightbox.id)[S.lightbox.i]) : null;
}
// ---------- the image's history in the ver grande: its versions in a strip under it (↑ ↓ step through them, ← → still
// go card to card); "Tornar atual" makes the one shown the card's ----------
// the versions the team sees (the ✕ ones stay out while they are hidden, as on the card's ‹ n/N ›)
const verList = (root) => stackOf(root).filter((x) => x === root || !dropped(x) || showDrop(x));
// the version a team lightbox shows: the one picked in its history (S.lightbox.ver), else the card's own
function lbShown(card) {
  const v = S.lightbox?.ver;
  return (v && card && stackOf(stackRoot(card)).find((x) => x.id === v)) || card;
}
function verStrip(hist, o, face) {
  return `<div class="vs-pick lb-vers"><span>Versões</span>${hist.map((x, k) => `<button class="vs-th ${x.id === o.id ? "on" : ""}" data-act="lb-ver" data-v="${x.id}" title="Versão ${k + 1}${k === 0 ? " · original" : ""}${x.id === face.id ? " · a do card" : ""}${x.model ? ` · ${esc(x.model.replace(" · estúdio", ""))}` : ""}">${media(x, "thumb")}<i>${k + 1}</i>${x.id === face.id ? '<i class="c now">atual</i>' : ""}</button>`).join("")}</div>`;
}
function stepVer(d) {
  const card = S.lightbox?.id ? optsOf(S.lightbox.id)[S.lightbox.i] : null;
  if (!card || S.lbx) return;
  const hist = verList(stackRoot(card)), k = hist.indexOf(lbShown(card)), next = hist[k + d];
  if (hist.length < 2 || !next) return;
  S.lightbox.ver = next.id;
  render(true);
}
// ---------- Ajustar in the ver grande (sem IA): the image moved, turned, flipped or scaled in its own frame, then kept as
// a new version of its card (Estudio.saveAdjusted renders it at full size). It always covers the frame: a turn zooms in as
// much as it needs and a pan stops at the edge. S.lbx = {id, W, H, t} while it is on ----------
const lbxBox = (o) => `<div class="lb-xfbox" style="--ar:${S.lbx.W / S.lbx.H}">${media(o, "big").replace("<img ", `<img style="transform:${Estudio.xfCss(S.lbx.t)}" `)}</div>`;
const turnTo = (r) => Math.round(((((r + 180) % 360) + 360) % 360 - 180) * 10) / 10;
const lbxChanged = (t) => t.s !== 1 || t.r !== 0 || t.fx || t.fy || t.x !== 0 || t.y !== 0;
function lbxBar() {
  const t = S.lbx.t, I = Estudio.ICONS;
  const b = (v, icon, n) => `<button class="hud ${(v === "fx" && t.fx) || (v === "fy" && t.fy) ? "on" : ""}" data-act="lbx-op" data-v="${v}" title="${n}" aria-label="${n.replace(/ \(.*\)$/, "")}">${icon}</button>`;
  return `<div class="lb-adj" role="toolbar" aria-label="Ajustar">
    <span class="lb-hud-g">${b("out", I.minus, "Afastar (⇧ 1%)")}<button class="hud lbx-v" data-act="lbx-op" data-v="s1" data-lbxv="s" title="Voltar a 100%">${Math.round(t.s * 100)}%</button>${b("in", I.plus, "Aproximar (⇧ 1%)")}</span>
    <span class="lb-hud-g">${b("l", I.rotl, "Girar 1° pra esquerda (⇧ 90°)")}<button class="hud lbx-v" data-act="lbx-op" data-v="r0" data-lbxv="r" title="Voltar a 0°">${String(t.r).replace(".", ",")}°</button>${b("r", I.rotr, "Girar 1° pra direita (⇧ 90°)")}</span>
    <span class="lb-hud-g">${b("fx", I.flipx, "Espelhar na horizontal")}${b("fy", I.flipy, "Espelhar na vertical")}${b("reset", I.reset, "Voltar ao original")}</span>
    <span class="lb-hud-g"><button class="hud lbx-x" data-act="lbx" title="Sair sem salvar (Esc)">Cancelar</button><button class="hud lbx-save" data-act="lbx-save" ${lbxChanged(t) && !S.lbx.busy ? "" : "disabled"} title="Salvar como versão nova do card, sem IA">${S.lbx.busy ? "Salvando…" : "Salvar versão"}</button></span>
  </div>`;
}
// the picture follows the transform without redrawing the page; the bar says where it is
function lbxSet(next) {
  const x = S.lbx;
  if (!x || x.busy) return;
  x.t = Estudio.xfCover({ ...x.t, ...next }, x.W, x.H);
  const box = $app.querySelector(".lb-xfbox");
  if (!box) return;
  box.querySelector("img").style.transform = Estudio.xfCss(x.t);
  const say = (k, s) => { const el = $app.querySelector(`[data-lbxv="${k}"]`); if (el) el.textContent = s; };
  say("s", `${Math.round(x.t.s * 100)}%`);
  say("r", `${String(x.t.r).replace(".", ",")}°`);
  $app.querySelector('[data-act="lbx-op"][data-v="fx"]')?.classList.toggle("on", !!x.t.fx);
  $app.querySelector('[data-act="lbx-op"][data-v="fy"]')?.classList.toggle("on", !!x.t.fy);
  const sv = $app.querySelector('[data-act="lbx-save"]');
  if (sv) sv.disabled = !lbxChanged(x.t);
}
function lbxOp(k, shift) {
  const t = S.lbx?.t;
  if (!t) return;
  const step = shift ? 1.01 : 1.05, turn = shift ? 90 : 1;
  if (k === "in") lbxSet({ s: t.s * step });
  else if (k === "out") lbxSet({ s: t.s / step });
  else if (k === "s1") lbxSet({ s: 1 });
  else if (k === "l") lbxSet({ r: turnTo(t.r - turn) });
  else if (k === "r") lbxSet({ r: turnTo(t.r + turn) });
  else if (k === "r0") lbxSet({ r: 0 });
  else if (k === "fx") lbxSet({ fx: !t.fx });
  else if (k === "fy") lbxSet({ fy: !t.fy });
  else if (k === "reset") { S.lbx.t = { ...Estudio.XF0 }; lbxSet({}); }
}
function lightbox() {
  if (S.lightbox.wipe) return wipeView();
  if (S.lightbox.cmp) return compareView();
  if (S.lightbox.req) return fileViewer();
  if (S.lightbox.ref) return refViewer();
  if (S.lightbox.pair) return pairViewer();
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
      ${o.mime.startsWith("video/") ? "" : `<button class="btn lb-draw" data-act="desenhar" data-id="${o.id}" title="Desenhe e escreva na imagem o que mudar">${Estudio.ICONS.pen}Desenhar${S.annotations.some((a) => a.option_id === o.id) ? ` · ${S.annotations.filter((a) => a.option_id === o.id).length}` : ""}</button>`}
      <button class="link" data-act="download" data-id="${o.id}">Baixar original</button>
    </div>
  </div>`;
}

// ---------- a version against the older ones ----------
// An option of v2 or later wipes against what it came from (based_on, else the base of the feedback it answers), or
// any option of an older version of the same item, or one of the references the client gave on the version before it.
const olderOpts = (o) => optsOf(o.item_id).filter((x) => verOf(x) < verOf(o) && !dropped(x));
// the Cena 3D angle an AI render was made from (based_on, at any depth)
function blockOf(o) {
  for (let b = o, n = 0; b?.based_on && n < 8; n++) {
    b = S.options.find((x) => x.id === b.based_on);
    if (b?.model === "Blocking 3D") return b;
  }
  return null;
}
// what an option can wipe against: the 3D blocking it was rendered from, the other versions of its image (the original
// first), then the options of older rounds of the item
function vsOpts(o) {
  const seen = new Set([o.id]), out = [];
  const add = (x) => { if (x && !seen.has(x.id)) { seen.add(x.id); out.push(x); } };
  add(blockOf(o));
  stackOf(stackRoot(o)).forEach(add);
  olderOpts(o).forEach(add);
  return out;
}
const vsCan = (o) => TEAM && !!o && vsOpts(o).length > 0;
const vsTag = (it, o, x) => {
  if (x.model === "Blocking 3D") return "3D";
  const all = stackOf(stackRoot(o));
  if (all.length > 1 && all.includes(x)) return `${all.indexOf(x) + 1}/${all.length}`;
  const L = letterOf(it, x);
  return `v${verOf(x)}${L ? ` ${L}` : ""}`;
};
// what the client said about the version before this one (what this version answers)
const fbFor = (it, v) => S.feedback.find((f) => f.round_id === it.round_id && f.item_id === it.id && f.version === v - 1) || null;
function vsBase(it, o) {
  // a render opens against its blocking, a version against the one before it in its image's history
  const blk = blockOf(o);
  if (blk) return blk;
  const all = stackOf(stackRoot(o)), k = all.indexOf(o);
  if (k > 0) return all[k - 1];
  const f = fbFor(it, verOf(o));
  const older = olderOpts(o);
  return verBase(o) || older.find((x) => x.id === f?.base_option) || older.find((x) => x.id === it.chosen_option) || older.find((x) => !offWK(x)) || older[0] || null;
}
function vsAgainst(it, o) {
  const w = S.lightbox.vsWith || "";
  if (w.startsWith("kit:")) {
    const x = optById(w.slice(4));
    if (x) return { key: w, duo: true, lab: `Aprovado · ${itemOf(x.item_id)?.title || ""}`, html: media(x, "big") };
  }
  if (w.startsWith("path:")) {
    const path = w.slice(5), r = (jobRefsOf(o) || []).find((y) => y.path === path);
    return { key: w, duo: true, lab: r?.label === "Base" ? "Base usada" : `Referência · ${r?.label || ""}`, html: `<img data-path="${esc(path)}" alt=""${srcAttr(path)}>` };
  }
  if (w.startsWith("ref:")) {
    const x = S.wkRefs.find((y) => y.id === w.slice(4));
    if (x) return { key: w, lab: `Ref · ${x.label}`, html: x.path ? `<img data-path="${esc(x.path)}" alt=""${srcAttr(x.path)}>` : `<img src="${esc(x.url)}" alt="" referrerpolicy="no-referrer">` };
  }
  const b = (w.startsWith("opt:") && vsOpts(o).find((y) => y.id === w.slice(4))) || vsBase(it, o);
  if (!b) return null;
  const tag = vsTag(it, o, b);
  return { key: `opt:${b.id}`, lab: tag === "3D" ? "Blocking 3D" : tag.includes("/") ? `Versão ${tag}` : `Antes · ${tag.replace(" ", " · ")}`, html: media(b, "big") };
}
const fbRefsOf = (f) => (f ? wkRefsOf(f.round_id, f.item_id).filter((x) => (x.version || 1) === f.version) : []);
const vsImgRefs = (f) => fbRefsOf(f).filter((x) => (x.kind === "image" && x.path) || (x.kind === "link" && isImgUrl(x.url)));
const refImg = (x) => (x.path ? `<img data-path="${esc(x.path)}" alt=""${srcAttr(x.path)}>` : `<img src="${esc(x.url)}" alt="" referrerpolicy="no-referrer">`);
// what to compare against: the older options of the item (with the letters the client saw) and the references of the feedback
function vsPicker(it, o, vs) {
  const refs = vsImgRefs(fbFor(it, verOf(o)));
  const th = (key, img, tag, title) => `<button class="vs-th ${vs?.key === key ? "on" : ""}" data-act="vs-with" data-v="${key}" title="${esc(title)}">${img}${tag}</button>`;
  return `<div class="vs-pick"><span>Comparar com</span>
    ${vsOpts(o).map((x) => { const L = letterOf(it, x), tag = vsTag(it, o, x); return th(`opt:${x.id}`, media(x, "thumb"), `<i>${tag}</i>`, tag === "3D" ? `Blocking 3D${x.caption ? ` · ${x.caption}` : ""}` : `${tag.includes("/") ? `Versão ${tag}` : `v${verOf(x)}${L ? ` · opção ${L}` : ` · fora ${DA_CL}`}`}${x.caption ? ` · ${x.caption}` : ""}`); }).join("")}
    ${refs.length ? `<span class="sep"></span>${refs.map((x) => th(`ref:${x.id}`, refImg(x), x.cited ? '<i class="c">ref</i>' : "<i>ref</i>", `Referência · ${x.label}`)).join("")}` : ""}
  </div>`;
}
const jobRefs = new Map();
function jobRefsOf(o) {
  if (!/estúdio/.test(o.model || "")) return null;
  if (jobRefs.has(o.id)) return jobRefs.get(o.id);
  jobRefs.set(o.id, null);
  // imported is jsonb: the filter takes JSON text (an array here would go as a Postgres array literal and fail)
  sb.from("estudio_jobs").select("refs").contains("imported", JSON.stringify([o.id])).limit(1).maybeSingle()
    .then(({ data }) => { jobRefs.set(o.id, (data?.refs || []).filter((r) => r.path && r.label !== "Desenho").sort((a, b) => (b.label === "Base") - (a.label === "Base"))); if (S.lightbox) render(true); });
  return null;
}
function refsSec(it, o, vs) {
  if (!TEAM) return "";
  const used = jobRefsOf(o) || [];
  const kit = kitList(kitOfScene(it.scene)).filter((x) => x.item_id !== it.id && !used.some((r) => r.path === x.path));
  if (!used.length && !kit.length) return "";
  const th = (key, img, label) => `<button class="vs-th ${vs?.key === key ? "on" : ""}" data-act="${vs?.key === key ? "vs-toggle" : "vs-with"}" data-v="${key}" title="${vs?.key === key ? "Voltar" : `Comparar lado a lado: ${esc(label)}`}">${img}</button>`;
  return `<div class="lb-sec refs-sec">
    ${used.length ? `<p class="side-label">Referências usadas</p><div class="ped-refs">${used.map((r) => th(`path:${r.path}`, `<img data-path="${esc(r.path)}" alt=""${srcAttr(r.path)}>`, r.label)).join("")}</div>` : ""}
    ${kit.length ? `<p class="side-label">${used.length ? "Aprovados da cena" : "Aprovados da cena · provável base"}</p><div class="ped-refs">${kit.map((x) => th(`kit:${x.id}`, media(x, "thumb"), itemOf(x.item_id)?.title || "")).join("")}</div>` : ""}
  </div>`;
}
// what the client asked about the version before this option, kept short: status, summary, tasks, references, their words (folded)
function pedidoSec(it, o, vs) {
  const f = fbFor(it, verOf(o));
  if (!f) return "";
  const ts = tasksOf(f.round_id, it.id).filter((t) => (t.version || 1) === f.version);
  const refs = fbRefsOf(f);
  const imgs = vsImgRefs(f);
  const other = refs.filter((x) => !imgs.includes(x));
  const said = commentsOf(it.id).filter((c) => c.side === "cliente");
  const extra = lines(f.client_extra);
  const open = !!S.ret.said[it.id];
  return `<div class="lb-sec ped">
    <p class="side-label">O pedido sobre a v${f.version}</p>
    <div class="ped-head"><span class="fb ${f.status}">${FB[f.status]}</span><a class="link" href="#/r/${f.round_id}/retorno/${it.id}" data-act="lb-go">Retorno ›</a></div>
    <p class="lb-text">${esc(f.summary)}</p>
    ${ts.length ? `<div class="tasks">${ts.map((t) => `<div class="task ${t.done ? "done" : ""}"><label><input type="checkbox" data-task-done="${t.id}" ${t.done ? "checked" : ""}><span>${esc(t.text)}</span></label></div>`).join("")}</div>` : ""}
    ${imgs.length ? `<div class="ped-refs">${imgs.map((x) => `<button class="vs-th ${vs?.key === `ref:${x.id}` ? "on" : ""}" data-act="vs-with" data-v="ref:${x.id}" title="Comparar com: ${esc(x.label)}">${refImg(x)}${x.cited ? '<i class="c">citada</i>' : ""}</button>`).join("")}</div>` : ""}
    ${other.length ? `<div class="ped-links">${other.map((x) => { const id = ytId(x.url); const href = id ? `https://www.youtube.com/watch?v=${id}${x.t_sec != null ? `&t=${x.t_sec}s` : ""}` : x.url; return `<a href="${esc(href)}" target="_blank" rel="noopener">${x.kind === "video" ? "▶" : "↗"} ${esc(x.label)}${x.t_sec != null ? ` · ${mmss(x.t_sec)}` : ""}</a>`; }).join("")}</div>` : ""}
    ${said.length || extra.length ? `<button class="ret-toggle" data-act="ret-said" data-id="${it.id}" aria-expanded="${open}">O que ${esc(A_CL)} disse <small>${said.length + extra.length}</small>${CHEV}</button>
      ${open ? `<div class="ret-said">${said.map((c) => `<div class="msg cliente"><p class="meta"><b>${esc(c.author)}</b> · ${fmtTime(c.created_at)}</p><p class="body">${esc(c.body)}</p></div>`).join("")}${extra.map((l) => `<div class="msg cliente"><p class="meta"><b>Fora da sala</b></p><p class="body">${esc(l)}</p></div>`).join("")}</div>` : ""}` : ""}
  </div>`;
}
function teamLightbox(it, opts, card, i) {
  // the version picked in the image's history (the strip under it, ↑ ↓) is what shows and what the actions act on; the
  // card's own place (letter, position on the page) stays the card's
  const o = lbShown(card), root = stackRoot(card), hist = verList(root), vi = hist.indexOf(o), face = faceOf(root);
  const wk = wkOpts(it.id);
  const lab = dropped(card) ? "descartada" : offWK(card) ? `fora ${DA_CL}` : it.mode === "set" ? `${wk.indexOf(card) + 1} de ${wk.length}` : `Opção ${letterOf(it, card)} de ${wk.length}`;
  const pos = S.lightbox.ov ? S.ovList.findIndex((x) => x.id === it.id && x.i === i) : -1;
  const adj = !!S.lbx && S.lbx.id === o.id;
  const many = !adj && (S.lightbox.ov ? S.ovList.length > 1 : opts.length > 1);
  const can = !adj && (vsCan(o) || /^(ref|kit|path):/.test(S.lightbox.vsWith || ""));
  const vs = can && S.lightbox.vs ? vsAgainst(it, o) : null;
  const L = letterOf(it, o);
  const vers = roundVers(it.round_id).length > 1 ? ` · v${verOf(o)}` : "";
  const frame = adj
    ? `<div class="lb-frame adj">${lbxBox(o)}${lbxBar()}</div>`
    : vs?.duo
    ? `<div class="lb-frame duo"><div><figure class="duo-fig">${media(o, "big")}<span class="duo-lab">Esta imagem${L ? ` · ${L}` : ""}</span></figure>${lbHud(it, o, { del: true })}</div><div><figure class="duo-fig">${vs.html}<span class="duo-lab">${esc(vs.lab)}</span></figure></div></div>`
    : vs
    ? `<div class="lb-frame wipe" data-wipe title="Passe o mouse (ou arraste) para mover a linha">
        <div class="wipe-ia">${media(o, "big")}</div><div class="wipe-blk">${vs.html}</div>
        <i class="wipe-line" aria-hidden="true"></i><span class="wipe-lab l">${esc(vs.lab)}</span><span class="wipe-lab r">Agora · v${verOf(o)}${L ? ` · ${L}` : ""}</span>
        ${lbHud(it, o, { del: true })}</div>`
    : `<div class="lb-frame">${media(o, "big")}${lbHud(it, o, { del: true })}</div>`;
  // top right: make the version shown the card's, Ajustar (sem IA), compare, info, close
  const more = `${hist.length > 1 && o.id !== face.id && !adj ? `<button class="btn small" data-act="vpick" data-id="${root.id}" data-v="${o.id}" title="O card passa a mostrar esta versão">Tornar atual</button>` : ""}`
    + `${o.mime.startsWith("video/") ? "" : `<button class="lb-info ${adj ? "on" : ""}" data-act="lbx" aria-pressed="${adj}" title="${adj ? "Sair do ajuste sem salvar (Esc)" : "Ajustar sem IA: espelhar, girar ou mudar a escala, e salvar como versão nova"}" aria-label="Ajustar">${Estudio.ICONS.crop}</button>`}`
    + `${can ? `<button class="lb-info ${vs ? "on" : ""}" data-act="vs-toggle" aria-pressed="${!!vs}" title="${vs ? "Sair da comparação" : "Comparar com a versão anterior"} (C)" aria-label="Comparar com a versão anterior">${ICON.vs}</button>` : ""}`;
  const tools = lbTools().replace('<span class="lb-tools">', `<span class="lb-tools">${more}`);
  return `<div class="lb lb-team" data-act="lb-bg" role="dialog" aria-modal="true" aria-label="${esc(it.title)}">
    <div class="lb-top"><span><b>${esc(it.title)}</b> · ${lab}${vers}${hist.length > 1 ? ` · versão ${vi + 1}/${hist.length}${o.id === face.id ? " (atual)" : ""}` : ""}${o.created_by ? ` · por ${esc(o.created_by)}` : ""}${pos >= 0 ? ` · ${pos + 1} de ${S.ovList.length} nesta página` : ""}</span>${tools}</div>
    <div class="lb-split ${S.infoOff ? "info-off" : ""}">
      <div class="lb-left">
        <div class="lb-stage">
          ${many ? `<button class="lb-nav prev" data-act="lb-step" data-v="-1" aria-label="Anterior">‹</button><button class="lb-nav next" data-act="lb-step" data-v="1" aria-label="Próxima">›</button>` : ""}
          ${frame}
        </div>
        ${vs && !vs.duo ? vsPicker(it, o, vs) : !adj && hist.length > 1 ? verStrip(hist, o, face) : ""}
      </div>
      ${infoPanel(it, o, { note: refsSec(it, o, vs) + pedidoSec(it, o, vs) })}
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
    ${o.mime.startsWith("video/") ? "" : `<span class="lb-hud-g">
      <button class="hud" data-act="desenhar" data-id="${o.id}" title="Desenhar e escrever o que mudar${drawsOf(o) ? ` · ${plural(drawsOf(o), "desenho", "desenhos")} em aberto` : ""}" aria-label="Desenhar">${Estudio.ICONS.pen}</button>
      ${AI ? `<button class="hud" data-act="estudio" data-id="${o.id}" title="Editar com IA (estúdio)" aria-label="Editar com IA">${Estudio.ICONS.spark}</button>` : ""}
    </span>`}
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
    <p class="eyebrow"><span class="num">${tag(it.scene)}</span> ${esc(sceneName(it.scene))} · ${KINDS[it.kind] || ""}</p>
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
    const rr = roundOf(S.page.round), shots = rr && itemsOf(rr.id).some((i) => i.kind === "plano");
    const kind = S.modal.kind || (shots ? "plano" : "casting"), plano = kind === "plano";
    const cams = plano ? (S.cams?.[S.modal.add] || []) : [];
    if (plano && TEAM && !S.cams) import("./cena3d/sets.js").then((m) => { S.cams = Object.fromEntries(Object.entries(m.SETS).map(([n, st]) => [n, st.cams.map((c) => ({ id: c.id, label: c.label, title: c.title }))])); if (S.modal?.add !== undefined) render(true); }).catch(() => { S.cams = {}; });
    return `<div class="modal"><div class="sheet"><p class="eyebrow">${esc(rr?.code || "")}</p><h2>${plano ? "Novo plano" : "Novo item"}</h2>
      <form data-form="add-item">
        <div class="two"><select class="sel" name="scene" aria-label="Cena" data-modal-scene>${SCENES.map((s, i) => `<option value="${i}" ${S.modal.add === i ? "selected" : ""}>${two(i)} · ${esc(s.name)}</option>`).join("")}</select>
        <select class="sel" name="kind" aria-label="Tipo" data-modal-kind>${Object.entries(KINDS).map(([k, nm]) => `<option value="${k}" ${k === kind ? "selected" : ""}>${nm}</option>`).join("")}</select></div>
        <input class="field" name="label" placeholder="${plano ? "Título do plano (ex.: P27 · Close do produto)" : "Título"}" required maxlength="120">
        <input class="field" name="brief" placeholder="${plano ? "O que acontece no plano: vira o texto do ✦" : "Briefing para o time (opcional)"}" maxlength="400">
        ${plano && cams.length ? `<select class="sel" name="cam" aria-label="Câmera do 3D"><option value="">Sem câmera do 3D: começa do kit da cena</option>${cams.map((c) => `<option value="${esc(c.id)}">${esc(c.label)} · ${esc(c.title || "")}</option>`).join("")}</select>` : ""}
        <select class="sel" name="assignee" aria-label="Responsável"><option value="">Sem dono</option>${Object.entries(PEOPLE).map(([k, nm]) => `<option value="${k}" ${S.me === k ? "selected" : ""}>${nm}</option>`).join("")}</select>
        <div class="row"><button class="btn primary">Criar item</button><button type="button" class="link" data-act="modal-close">Cancelar</button></div>
      </form></div></div>`;
  }
  if (S.modal?.task) {
    const r = roundOf(S.page.round), m = S.modal.task;
    const items = r ? byScene(itemsOf(r.id)) : [];
    return `<div class="modal"><div class="sheet"><p class="eyebrow">${esc(r?.code || "")} · A fazer</p><h2>Nova tarefa</h2>
      <form data-form="task-new" data-round="${r?.id || ""}" data-ver="${r?.version || 1}">
        <textarea class="field" name="text" rows="3" placeholder="O que fazer" required maxlength="300" aria-label="O que fazer"></textarea>
        <div class="two"><select class="sel" name="who" aria-label="Quem faz"><option value="">Sem dono</option>${Object.entries(PEOPLE).map(([k, nm]) => `<option value="${k}" ${m.who === k ? "selected" : ""}>${nm}</option>`).join("")}</select>
        <select class="sel" name="item" aria-label="Card"><option value="">Sem card</option>${items.map((it) => `<option value="${it.id}" ${m.item === it.id ? "selected" : ""}>${two(it.scene)} · ${esc(it.title)}</option>`).join("")}</select></div>
        <div class="row"><button class="btn primary">Criar tarefa</button><button type="button" class="link" data-act="modal-close">Cancelar</button></div>
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
    const id = el.dataset.id, n = wipePairs(id).length;
    S.wipe[id] = ((S.wipe[id] || 0) + +el.dataset.v + n) % n;
    render(true);
  },
  "item-sheet"(el) { S.sheet[el.dataset.id] = !S.sheet[el.dataset.id]; render(true); },
  ver(el) { S.ver = el.dataset.v; S.peek.clear(); render(true); },
  appr(el) { S.appr = el.dataset.v; store.set("sala-appr", S.appr); S.peek.clear(); render(true); },
  // Autor and Tipo take more than one value; Todos / Tudo clears the group
  author(el) { toggleIn(S.authors, el.dataset.v); S.peek.clear(); render(true); },
  "who-cycle"(el) {
    const it = itemOf(el.dataset.id), ks = [null, ...Object.keys(PEOPLE)];
    const next = ks[(ks.indexOf(it.assignee || null) + 1) % ks.length];
    patchItem(it.id, { assignee: next }, next ? `${it.title} → ${PEOPLE[next]}` : `${it.title} sem dono`);
  },
  "vs-ref"(el) { S.lightbox = { id: el.dataset.id, i: +el.dataset.i || 0, vs: true, vsWith: el.dataset.v }; render(true); },
  "ver-cmp"(el) { const id = el.dataset.id; S.vcmp[id] = !S.vcmp[id]; S.sheet[id] = false; S.wipe[id] = 0; render(true); },
  // "Abrir v{n+1}": once the client answers the current version, new uploads go in as the next one
  async "ver-next"(el) {
    const r = roundOf(el.dataset.id), v = r.version + 1;
    if (!confirm(`Abrir a v${v}? Daqui em diante as opções novas entram como v${v}, e o filtro Atual passa a mostrar a v${v} de cada card que mudar.`)) return;
    await run(async () => {
      const { error } = await sb.from("rounds").update({ version: v }).eq("id", r.id);
      if (error) throw error;
      await refresh();
    }, `v${v} aberta`);
  },
  more(el) { S.more = S.more === el.dataset.id ? null : el.dataset.id; S.moreUp = false; render(true); fitMore(); },
  // the ▶ on a card's video (touch screens): plays it in place, or stops it
  vplay(el) { const v = el.parentElement?.querySelector("video:not([controls])"); if (v) (vOn === v ? vStop(v) : vPlay(v)); },
  // the folded part at the end of a page of cards (what stays out, what was not answered), open or not per page
  "task-new"(el, e) { e?.preventDefault(); S.modal = { task: { who: el.dataset.who || "", item: el.dataset.item || "" } }; render(true); $app.querySelector('[data-form="task-new"] textarea')?.focus(); },
  rest() { S.rest = { ...S.rest, [S.page.kind]: !S.rest?.[S.page.kind] }; render(true); },
  dl() { S.dl = !S.dl; render(true); },
  filt() { S.filt = !S.filt; render(true); },
  // a chip's ×, or Limpar (all): back to showing everything
  "filt-off"(el) {
    const k = el.dataset.v, all = k === "all";
    if (all || k === "ver") S.ver = "now";
    if (all || k === "appr") { S.appr = "all"; store.set("sala-appr", "all"); }
    if (all) { S.authors.clear(); S.ov.kinds.clear(); }
    else if (k.startsWith("author:")) S.authors.delete(k.slice(7));
    else if (k.startsWith("kind:")) S.ov.kinds.delete(k.slice(5));
    if (all || k === "curate") S.ov.curate = false;
    if (all || k === "dropped") { S.ov.dropped = false; store.set("sala-dropped", "0"); }
    S.peek.clear(); render(true);
  },
  "dl-zip"(el) {
    const s = dlScope(), ok = el.dataset.v === "ok";
    S.dl = false; render(true);
    if (el.dataset.v === "animatic") {
      const files = animaticFiles(s), key = `sala-animatic:${s.zip}`;
      let prev = null;
      try { prev = JSON.parse(store.get(key) || "null")?.files || null; } catch {}
      const list = [{ name: "00 Lista dos planos.csv", text: animaticList(files, prev) }, ""];
      return zipDownload([list, ...files], `${s.zip} - animatic`).then((ok) => ok && store.set(key, JSON.stringify({ at: new Date().toISOString(), files: Object.fromEntries(files.map(([f]) => [f.name, f.id])) })));
    }
    zipDownload(dlFiles(s, ok), `${s.zip}${ok && !s.plain ? (TEAM ? " - aprovadas" : " - aprovado") : ""}`);
  },
  side() { S.sideOff = !S.sideOff; store.set("sala-side-off", S.sideOff ? "1" : "0"); render(true); },
  "lb-info"() { toggleInfo(); },
  "ov-view"(el) { S.ov.view = el.dataset.v; store.set("sala-ov-view2", S.ov.view); render(); },
  "modal-close"() { S.modal = null; render(true); },
  drawer(el) { const id = el.dataset.id; S.drawer = S.drawer === id && !S.mode[id] && S.drawerTab !== "pedido" ? null : id; S.drawerTab = "comentarios"; delete S.mode[id]; render(true); focusCompose(); },
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
  "lb-close"() { S.lbx = null; S.lightbox = S.lightbox?.back || null; if (!S.lightbox) S.infoOff = true; render(true); },
  // the ver grande's history: a version picked in the strip shows (the card keeps its own until Tornar atual)
  "lb-ver"(el) { if (!S.lightbox) return; S.lightbox.ver = el.dataset.v; S.lbx = null; render(true); },
  // Ajustar (sem IA): on and off, its buttons, and Salvar versão
  lbx() {
    if (S.lbx) { S.lbx = null; return render(true); }
    const o = lbOption();
    if (!o || o.mime.startsWith("video/")) return;
    const img = $app.querySelector(".lb-frame img");
    S.lightbox.vs = false;
    S.lbx = { id: o.id, W: img?.naturalWidth || 16, H: img?.naturalHeight || 9, t: { ...Estudio.XF0 } };
    render(true);
  },
  "lbx-op"(el, e) { lbxOp(el.dataset.v, e.shiftKey); },
  async "lbx-save"() {
    const x = S.lbx, o = x && optById(x.id);
    if (!o || x.busy || !lbxChanged(x.t)) return;
    x.busy = true;
    render(true);
    await run(async () => {
      const n = await Estudio.saveAdjusted(estCtx(), o, x.t);
      if (S.lbx === x) S.lbx = null;
      if (S.lightbox) S.lightbox.ver = n.id;
      render(true);
    }, "✦ Versão nova, sem IA: agora é a do card");
    if (S.lbx === x) { x.busy = false; render(true); }
  },
  compare(el) { S.lightbox = { cmp: el.dataset.id, r: 0, i: 0 }; render(true); },
  "cmp-ref"(el) { S.lightbox.r = +el.dataset.v; render(true); },
  "cmp-opt"(el) { S.lightbox.i = +el.dataset.v; render(true); },
  "lb-bg"(el, e) { if (e.target === el || e.target.classList.contains("lb-stage")) ACTS["lb-close"](); },
  "lb-step"(el) { step(+el.dataset.v); },
  // the originals of an item (what the client sees on their side; the team gets everything but the dropped ones)
  "item-zip"(el) { const it = itemOf(el.dataset.id); if (it) zipDownload(optsOf(it.id).filter((o) => !dropped(o)).map((o) => [{ name: dlName(o), path: o.path }, ""]), it.title); },
  download(el) { const o = S.options.find((x) => x.id === el.dataset.id); if (o) openFile(o.path, dlName(o), true); },
  // Versões: the clock on a card opens or closes its list of versions; the one picked is the card from then on
  vlist(el) { S.vlist = S.vlist === el.dataset.id ? null : el.dataset.id; render(true); },
  async vpick(el) {
    const root = optById(el.dataset.id);
    if (!root || !el.dataset.v) return;
    S.vlist = null;
    const { error } = await sb.from("options").update({ face: el.dataset.v === root.id ? null : el.dataset.v }).eq("id", root.id);
    if (error) return toast(error.message, true);
    await refresh();
  },
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
      await sb.storage.from(BUCKET).remove([f.path, f.preview_path, f.thumb_path].filter(Boolean));
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
      if (paths.length) await sb.storage.from(BUCKET).remove(paths);
      await refresh();
    }, "Pedido excluído");
  },
  status(el) { patchItem(el.dataset.id, { status: el.dataset.v }); },
  review(el) { saveReview(el.dataset.id, { verdict: reviewOf(el.dataset.id)?.verdict === el.dataset.v ? null : el.dataset.v }); },
  "mat-filter"(el) { S.matFilter = el.dataset.v; render(); },
  "ov-kind"(el) { toggleIn(S.ov.kinds, el.dataset.v); render(true); },
  "confirm-round"(el) {
    run(async () => { const { error } = await sb.rpc("confirm_round", { p_round: el.dataset.id, p_who: myName() }); if (error) throw error; await refresh(); }, "Rodada confirmada. Obrigado!");
  },
  "ov-curate"() { S.ov.curate = !S.ov.curate; render(true); },
  "ov-dropped"() { S.ov.dropped = !S.ov.dropped; store.set("sala-dropped", S.ov.dropped ? "1" : "0"); S.peek.clear(); render(true); },
  peek(el) { S.peek.add(el.dataset.id); render(true); },
  "ov-open"(el) { S.lightbox = { id: el.dataset.id, i: +el.dataset.i, ov: true }; render(true); },
  "ov-cycle"(el) {
    const it = itemOf(el.dataset.id), opts = shownOpts(el.dataset.id);
    if (!it || !opts.length) return;
    pickSel(it.id, opts[(shownAt(it, opts) + +el.dataset.v + opts.length) % opts.length]);
    render(true);
  },
  "lb-compare"(el) { S.lightbox = { cmp: el.dataset.id, r: 0, i: S.lightbox.i, back: S.lightbox }; render(true); },
  mode(el) { const it = itemOf(el.dataset.id); patchItem(it.id, { mode: it.mode === "set" ? "choose" : "set" }, it.mode === "set" ? `${cap(A_CL)} vai escolher uma opção` : `${cap(A_CL)} vai aprovar o conjunto`); },
  visible(el) { const it = itemOf(el.dataset.id); patchItem(it.id, { visible: !it.visible }, it.visible ? `Escondido ${DA_CL}` : `${cap(A_CL)} já vê este item`); },
  // "O que vai pro cliente": back to the rule when the rule already gives what was asked, else this version's own call
  envio(el) {
    const o = S.options.find((x) => x.id === el.dataset.id);
    if (!o) return;
    const V = verNow(itemOf(o.item_id)), want = el.dataset.v === "in", auto = want === wkAuto(o);
    S.envio = [...S.envio.filter((e) => !(e.option_id === o.id && e.version === V)), ...(auto ? [] : [{ option_id: o.id, version: V, include: want }])];
    render(true);
    run(async () => {
      const { error } = auto
        ? await sb.from("envio").delete().eq("option_id", o.id).eq("version", V)
        : await sb.from("envio").upsert({ option_id: o.id, version: V, include: want, by: myName(), updated_at: new Date().toISOString() });
      if (error) throw error;
      await refresh();
    }, want ? `${cap(A_CL)} vai ver esta imagem` : `Tirada do que vai ${AO_CL}`);
  },
  // admin in the client's room (adminCheck): the image leaves this version's delivery; Desfazer restores the row that was there
  async "wk-off"(el) {
    const it = itemOf(el.dataset.id), id = el.dataset.opt, V = roundOf(it?.round_id)?.version || 1;
    if (!ADMIN || !it) return;
    const { data: was, error } = await teamSb.from("envio").select("option_id, version, include, by").eq("option_id", id).eq("version", V).maybeSingle();
    if (error) return toast(`Não deu certo: ${error.message}`, true);
    await adminOff(() => teamSb.from("envio").upsert({ option_id: id, version: V, include: false, by: adminName(), updated_at: new Date().toISOString() }),
      () => (was ? teamSb.from("envio").upsert({ ...was, updated_at: new Date().toISOString() }) : teamSb.from("envio").delete().eq("option_id", id).eq("version", V)),
      `Tirada da aprovação: ${A_CL} não vê mais esta imagem.`);
  },
  async "wk-item-off"(el) {
    const id = el.dataset.id;
    if (!ADMIN) return;
    await adminOff(() => teamSb.from("items").update({ visible: false }).eq("id", id), () => teamSb.from("items").update({ visible: true }).eq("id", id),
      `Item tirado da aprovação: ${A_CL} não vê mais.`);
  },
  // estudio.js: draw on an image (both rooms), edit it with AI or create in a scene (team)
  desenhar(el) { Estudio.openDraw(estCtx(), { optionId: el.dataset.id }); },
  estudio(el) { Estudio.openStudio(estCtx(), { optionId: el.dataset.id }); },
  "estudio-criar"(el) { Estudio.openCreate(estCtx(), { roundId: el.dataset.round, scene: +el.dataset.scene, itemId: el.dataset.item }); },
  "add-item"(el) { S.modal = { add: el.dataset.scene !== undefined ? +el.dataset.scene : S.page.kind === "scene" ? S.page.scene : 0 }; render(true); $app.querySelector('[data-form="add-item"] [name="label"]')?.focus(); },
  motion(el) { openMotion(el.dataset.id, el.dataset.o || null); },
  // Virar card novo (one click): the image on the card becomes a card of
  // its own right after it, in its scene, named after it (· 2, · 3…), with the image's caption (else the card's briefing).
  // The page stays (the card's own page goes back to its scene), the new card lights up with its title selected to rename
  // by typing, and the toast can undo it (the image goes back, to its stack too; the new card goes if it is still empty)
  async split(el) {
    const o = optById(el.dataset.id), it = o && itemOf(o.item_id);
    if (!it) return;
    if (it.chosen_option === o.id) return toast(`${cap(A_CL)} escolheu esta imagem neste card: ela fica aqui.`, true);
    S.more = null;
    const root = o.stack ? optById(o.stack) : null, wasFace = !!root && root.face === o.id;
    const moved = root ? [o.id] : [o.id, ...S.options.filter((x) => x.stack === o.id).map((x) => x.id)];
    const scene = itemsOf(it.round_id).filter((x) => x.scene === it.scene);
    const after = scene.filter((x) => x.sort > it.sort).map((x) => [x.id, x.sort]);
    const re = new RegExp(`^${it.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} · (\\d+)$`);
    const title = `${it.title} · ${Math.max(1, ...scene.map((x) => +(re.exec(x.title)?.[1] || 0))) + 1}`.slice(0, 120);
    const sorts = (list, d) => Promise.all(list.map(([x, s]) => sb.from("items").update({ sort: s + d }).eq("id", x))).then((res) => { const bad = res.find((r) => r.error); if (bad) throw bad.error; });
    let id = null;
    await run(async () => {
      await sorts(after, 1);
      const { data, error } = await sb.from("items").insert({ round_id: it.round_id, scene: it.scene, kind: it.kind, title, brief: (o.caption || it.brief || "").slice(0, 400), assignee: it.assignee || (PEOPLE[S.me] ? S.me : null), sort: it.sort + 1 }).select("id").single();
      if (error) throw error;
      id = data.id;
      await splitTo(o.id, id);
      await load(true);
    });
    if (!id) return;
    const back = () => run(async () => {
      let { error } = await sb.from("options").update({ item_id: it.id }).in("id", moved);
      if (!error && root) ({ error } = await sb.from("options").update({ stack: root.id }).eq("id", o.id));
      if (!error && wasFace) ({ error } = await sb.from("options").update({ face: o.id }).eq("id", root.id));
      if (error) throw error;
      const { count } = await sb.from("options").select("id", { count: "exact", head: true }).eq("item_id", id);
      if (!count) ({ error } = await sb.from("items").delete().eq("id", id));
      if (error) throw error;
      await sorts(after, 0);
      await load(true);
      goLand(location.hash, it.id);
    }, "A imagem voltou pro card");
    goLand(S.page.item === it.id ? sceneHref(it.round_id, it.scene) : location.hash, id, true);
    toast(`Virou card novo: ${title}`, false, { label: "Desfazer", fn: back });
  },
  async "item-del"(el) {
    const it = itemOf(el.dataset.id);
    if (!confirm(`Excluir “${it.title}” e todas as opções dele?`)) return;
    await run(async () => {
      const paths = optsOf(it.id).flatMap((o) => [o.path, o.preview_path, o.thumb_path]).filter(Boolean);
      const { error } = await sb.from("items").delete().eq("id", it.id);
      if (error) throw error;
      if (paths.length) await sb.storage.from(BUCKET).remove(paths);
      if (S.drawer === it.id) S.drawer = null;
      await refresh();
    }, "Item excluído");
  },
  async "opt-del"(el) {
    const o = S.options.find((x) => x.id === el.dataset.id);
    const L = letterOf(itemOf(o.item_id), o);
    if (!confirm(L ? `Remover a opção ${L}?` : "Remover esta opção?")) return;
    await run(async () => {
      const { error } = await sb.from("options").delete().eq("id", o.id);
      if (error) throw error;
      await sb.storage.from(BUCKET).remove([o.path, o.preview_path, o.thumb_path].filter(Boolean));
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
  // a new version against the old one, in the lightbox
  "vs-open"(el) { S.lightbox = { id: el.dataset.id, i: +el.dataset.i || 0, vs: true }; render(true); },
  "vs-toggle"() { if (S.lightbox) { S.lightbox.vs = !S.lightbox.vs; S.lbx = null; render(true); } },
  "vs-with"(el) { S.lightbox.vs = true; S.lightbox.vsWith = el.dataset.v; render(true); },
  "lb-go"(el) { S.lightbox = null; location.hash = el.getAttribute("href"); },
  // retorno
  pair(el) { S.lightbox = { pair: el.dataset.id, i: +el.dataset.i }; render(true); },
  "ret-resolved"() { S.ret.resolved = !S.ret.resolved; render(true); },
  // the panel: an item's request (Pedido) or its comments, or the round's open questions and agreements
  pedido(el) { S.drawer = el.dataset.id; S.drawerTab = "pedido"; render(true); },
  "drawer-tab"(el) { S.drawerTab = el.dataset.v; render(true); },
  "round-panel"() { S.drawer = S.drawer === "round" ? null : "round"; render(true); },
  "ret-said"(el) { S.ret.said[el.dataset.id] = !S.ret.said[el.dataset.id]; render(true); },
  "ret-call"(el) { S.ret.call[el.dataset.id] = !S.ret.call[el.dataset.id]; render(true); },
  "fb-status"(el) { saveRow("item_feedback", { round_id: el.dataset.round, item_id: el.dataset.id, version: +el.dataset.ver }, { status: el.dataset.v }); },
  "ret-ver"(el) { S.ret.ver = +el.dataset.v; render(true); },
  "task-del"(el) {
    const gone = S.tasks.find((t) => t.id === el.dataset.id);
    S.tasks = S.tasks.filter((t) => t.id !== el.dataset.id);
    render(true);
    run(async () => { const { error } = await sb.from("tasks").delete().eq("id", el.dataset.id); if (error) throw error; await refresh(); });
    if (gone) toast("Tarefa apagada", false, { label: "Desfazer", fn: () => run(async () => { const { error } = await sb.from("tasks").insert(gone); if (error) throw error; await refresh(); }, "Tarefa de volta") });
  },
  "ref-open"(el) {
    const x = S.wkRefs.find((y) => y.id === el.dataset.id);
    if (!x) return;
    const list = el.dataset.deck
      ? [...new Map(S.wkRefs.filter((y) => y.source === "deck" && y.path).sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { numeric: true })).map((y) => [y.path, y.id])).values()]
      : wkRefsOf(x.round_id, x.item_id).filter((y) => y.path && y.kind === "image").map((y) => y.id);
    S.lightbox = { ref: x.id, list };
    render(true);
  },
};
function step(d) {
  if (!S.lightbox || S.lbx) return;
  // another card shows its own version (the one on it)
  S.lightbox.ver = null;
  if (S.lightbox.wipe) return ACTS["wipe-step"]({ dataset: { id: S.lightbox.wipe, v: d } });
  if (S.lightbox.pair) {
    const n = pairList(itemOf(S.lightbox.pair)).length;
    S.lightbox.i = (S.lightbox.i + d + n) % n;
    return render(true);
  }
  if (S.lightbox.ref) {
    const { list } = S.lightbox;
    S.lightbox.ref = list[(list.indexOf(S.lightbox.ref) + d + list.length) % list.length];
    return render(true);
  }
  if (S.lightbox.cmp) {  // arrows walk through the original photos
    const n = refsOf(itemOf(S.lightbox.cmp)).length;
    S.lightbox.r = (S.lightbox.r + d + n) % n;
    return render(true);
  }
  if (S.lightbox.ov && S.ovList.length) {
    const k = S.ovList.findIndex((x) => x.id === S.lightbox.id && x.i === S.lightbox.i);
    const next = S.ovList[(k + d + S.ovList.length) % S.ovList.length];
    Object.assign(S.lightbox, next);
    pickSel(next.id, optsOf(next.id)[next.i]);
    return render(true);
  }
  const n = S.lightbox.req ? filesShown(S.lightbox.req).length : optsOf(S.lightbox.id).length;
  S.lightbox.i = (S.lightbox.i + d + n) % n;
  render(true);
}
function toggleInfo() {
  S.infoOff = !S.infoOff;
  store.set("sala-info-off", S.infoOff ? "1" : "0");
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
  if (S.filt && !e.target.closest?.(".filt-pop, [data-act=filt]")) { S.filt = false; if (!el) render(true); }
  if (!el || !$app.contains(el)) return;
  const fn = ACTS[el.dataset.act];
  if (fn) { if (el.tagName === "A") e.preventDefault(); fn(el, e); }
});
// Cena 3D keeps the page it was opened from and how far down that page was: its ✕, Esc and Renderizar go back there
window.addEventListener("hashchange", (e) => {
  const had = !!$app.querySelector("[data-c3d]"), top = $app.querySelector('[data-keep="main"]')?.scrollTop || 0;
  onRoute();
  if (!had && $app.querySelector("[data-c3d]")) S.back3d = { hash: new URL(e.oldURL).hash, top };
  if (S.landing) land();
});
// out of Cena 3D: back to the page it was opened from, as far down as it was (else to the shot's card that opened it, or
// the location's own versions); lit: the card a render went to comes into view, lit for a moment, its progress on it
function leave3d(itemId = null, lit = false) {
  const b = S.back3d, it = itemId ? itemOf(itemId) : null, loc = S.page.item ? itemOf(S.page.item) : null;
  S.back3d = null;
  const to = b?.hash || (it ? sceneHref(it.round_id, it.scene, it.id) : loc ? `${sceneHref(loc.round_id, loc.scene, loc.id)}/versoes` : "#/");
  S.landing = { top: b?.hash === to ? b.top : 0, item: lit ? itemId : null };
  if (location.hash === to) { onRoute(); land(); } else location.hash = to;
}
function land() {
  const { top, item, focus } = S.landing;
  S.landing = null;
  const main = $app.querySelector('[data-keep="main"]');
  if (main && top) main.scrollTop = top;
  const el = item && document.getElementById(`item-${item}`);
  if (!el) return;
  el.scrollIntoView({ block: "nearest" });
  S.flash = item;
  el.classList.add("flash");
  setTimeout(() => { S.flash = null; document.getElementById(`item-${item}`)?.classList.remove("flash"); }, 1600);
  if (focus) { const t = el.querySelector("input.inline.title"); t?.focus({ preventScroll: true }); t?.select(); }
}
// to a page (the one already open keeps its scroll) with a card in view, lit for a moment; focus: its title selected,
// to rename it by typing
function goLand(to, item, focus = false) {
  S.landing = { top: location.hash === to ? $app.querySelector('[data-keep="main"]')?.scrollTop || 0 : 0, item, focus };
  if (location.hash === to) { onRoute(); land(); } else location.hash = to;
}
// a card's progress line follows the studio's jobs: the room draws again when one starts, moves on or lands
const onMaking = () => {
  const k = Estudio.making().map((j) => `${j.id}:${j.status}`).join();
  if (k !== S.makingKey) { S.makingKey = k; render(); }
};

document.addEventListener("input", (e) => {
  if (e.target.matches?.("input, textarea")) e.target.dataset.dirty = "1";
  if (e.target.matches?.("textarea.brief, textarea.ret-notes, textarea.ret-basenote, textarea.btask-text")) fit(e.target);
  if (e.target.matches?.(".tfit > input")) fitTitle(e.target);
});
document.addEventListener("change", (e) => {
  const t = e.target;
  if (S.modal?.add !== undefined && (t.dataset.modalScene !== undefined || t.dataset.modalKind !== undefined)) {
    const f = t.form, keep = { label: val(f, "label"), brief: val(f, "brief"), assignee: val(f, "assignee") };
    S.modal = { add: +val(f, "scene"), kind: val(f, "kind") };
    render(true);
    const g = $app.ownerDocument.querySelector('[data-form="add-item"]');
    if (g) for (const [k, v] of Object.entries(keep)) { const x = g.elements.namedItem(k); if (x) x.value = v; }
    return;
  }
  if (t.dataset.note || t.dataset.cap || t.dataset.rv || t.dataset.reason || t.dataset.field || t.dataset.fb || t.dataset.pendAnswer || t.dataset.refT || t.dataset.rnote || t.dataset.taskText) delete t.dataset.dirty;
  if (t.dataset.fb) saveRow("item_feedback", { round_id: t.dataset.round, item_id: t.dataset.id, version: +t.dataset.ver }, { [t.dataset.fb]: t.value.trim() });
  else if (t.dataset.pendAnswer) saveRow("pendencias", { id: t.dataset.pendAnswer }, { answer: t.value.trim() }, "Salvo");
  else if (t.dataset.pendDone) saveRow("pendencias", { id: t.dataset.pendDone }, { resolved: t.checked }, t.checked ? "Resolvida" : "Reaberta");
  else if (t.dataset.taskDone) saveRow("tasks", { id: t.dataset.taskDone }, { done: t.checked });
  else if (t.dataset.taskText) { const v = t.value.trim(); if (v) saveRow("tasks", { id: t.dataset.taskText }, { text: v }, "Salvo"); else t.value = S.tasks.find((x) => x.id === t.dataset.taskText)?.text || ""; }
  else if (t.dataset.taskWho) saveRow("tasks", { id: t.dataset.taskWho }, { assignee: t.value || null });
  else if (t.dataset.refT) {
    const s = t.value.trim() ? parseMmss(t.value) : null;
    if (t.value.trim() && s == null) { toast("Use minutos:segundos, por exemplo 1:24", true); return; }
    saveRow("feedback_refs", { id: t.dataset.refT }, { t_sec: s }, s == null ? "Minuto apagado" : `Marcado em ${mmss(s)}`);
  } else if (t.dataset.rnote) {
    const body = t.value.trim();
    const n = S.roundNotes.find((x) => x.round_id === t.dataset.rnote);
    if (n) n.body = body; else S.roundNotes.push({ round_id: t.dataset.rnote, body });
    run(async () => { const { error } = await sb.from("round_notes").upsert({ round_id: t.dataset.rnote, body, updated_at: new Date().toISOString() }); if (error) throw error; await refresh(); }, "Combinados salvos");
  }
  else if (t.dataset.uploadItem) { uploadOptions(t.dataset.uploadItem, t.files); t.value = ""; }
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
  if (e.key === "Enter" && t.matches?.("input.inline, textarea.brief, textarea.ret-basenote, textarea.btask-text, input.cap-in, input.lb-capin, input.rv-note, input.note")) { e.preventDefault(); t.blur(); return; }
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && t.matches?.(".compose textarea")) { t.form.requestSubmit(); return; }
  if (S.lightbox) {
    // Esc leaves Ajustar first (without saving), then the lightbox; while adjusting, no other key acts
    if (e.key === "Escape") { if (S.lbx) { S.lbx = null; return render(true); } return ACTS["lb-close"](); }
    if (typing || S.lbx) return;  // arrows and letters belong to the field being edited
    if (e.key === "ArrowRight") step(1);
    if (e.key === "ArrowLeft") step(-1);
    // ↑ ↓: the image's history (older, newer)
    if (TEAM && S.lightbox.id && (e.key === "ArrowUp" || e.key === "ArrowDown")) { e.preventDefault(); stepVer(e.key === "ArrowDown" ? 1 : -1); }
    if (TEAM && e.key.toLowerCase() === "i" && !e.metaKey && !e.ctrlKey && (S.lightbox.id || S.lightbox.wipe)) toggleInfo();
    if (TEAM && e.key.toLowerCase() === "c" && !e.metaKey && !e.ctrlKey && S.lightbox.id && vsCan(lbOption())) return ACTS["vs-toggle"]();
    const v = { m: "keep", r: "redo", d: "drop" }[e.key.toLowerCase()];
    if (TEAM && v && !e.metaKey && !e.ctrlKey && S.lightbox.pair) {
      const p = pairList(itemOf(S.lightbox.pair))[S.lightbox.i];
      if (p?.side === "agora" && v !== "redo") saveReview(p.o.id, { verdict: reviewOf(p.o.id)?.verdict === v ? null : v });
    }
    if (TEAM && v && !typing && !e.metaKey && !e.ctrlKey && !S.lightbox.pair) {
      const o = lbOption();
      if (o) saveReview(o.id, { verdict: reviewOf(o.id)?.verdict === v ? null : v });
    }
    return;
  }
  if (e.key === "Escape") {
    if (S.more || S.dl || S.filt) { S.more = null; S.dl = false; S.filt = false; render(true); }
    else if (S.modal && S.modal !== "name") ACTS["modal-close"]();
    else if (S.drawer) ACTS["drawer-close"]();
    return;
  }
  if (!typing && !S.modal && S.page.kind === "scene" && (e.key === "ArrowRight" || e.key === "ArrowLeft")) stepScene(e.key === "ArrowRight" ? 1 : -1);
});

document.addEventListener("focusout", () => setTimeout(() => S.pending && render(false), 0));
// before/after: the line follows the mouse, or the finger while dragging
document.addEventListener("pointermove", (e) => {
  const w = e.target.closest?.("[data-wipe]");
  if (!w) return;
  const r = w.getBoundingClientRect();
  w.style.setProperty("--x", `${Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100))}%`);
});
// Ajustar in the ver grande: dragging the picture moves it, the wheel (or a pinch) zooms about the pointer, ⌥ + wheel turns
let lbxDrag = null;
document.addEventListener("pointerdown", (e) => {
  const box = e.target.closest?.(".lb-xfbox");
  if (!box || !S.lbx) return;
  e.preventDefault();
  lbxDrag = { x: e.clientX, y: e.clientY, t: { ...S.lbx.t }, w: box.clientWidth, h: box.clientHeight };
  box.setPointerCapture?.(e.pointerId);
});
document.addEventListener("pointermove", (e) => {
  const d = lbxDrag;
  if (d && S.lbx) lbxSet({ x: d.t.x + (e.clientX - d.x) / d.w, y: d.t.y + (e.clientY - d.y) / d.h });
});
document.addEventListener("pointerup", () => { lbxDrag = null; });
document.addEventListener("pointercancel", () => { lbxDrag = null; });
document.addEventListener("wheel", (e) => {
  const box = e.target.closest?.(".lb-xfbox"), t = S.lbx?.t;
  if (!box || !t) return;
  e.preventDefault();
  if (e.altKey) return lbxSet({ r: turnTo(t.r + (e.deltaY > 0 ? 0.5 : -0.5)) });
  const r = box.getBoundingClientRect(), W = r.width, H = r.height, qx = e.clientX - r.left - W / 2, qy = e.clientY - r.top - H / 2;
  const s = Math.max(0.25, Math.min(4, t.s * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)))), k = s / t.s;
  lbxSet({ s, x: (qx - k * (qx - t.x * W)) / W, y: (qy - k * (qy - t.y * H)) / H });
}, { passive: false });

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
      const cam = val(f, "cam");
      const { data, error } = await sb.from("items").insert({ round_id: r.id, scene, kind: val(f, "kind"), title: val(f, "label"), brief: val(f, "brief"), assignee: val(f, "assignee") || null, sort, ...(cam && { variants: { shot: cam } }) }).select("id").single();
      if (error) throw error;
      clearForm(f);
      S.modal = null;
      await load(true);
      // the new card shows among its scene's cards, lit for a moment (not on an empty page of its own)
      goLand(sceneHref(r.id, scene), data.id);
    }, "Item criado");
    return;
  }
  if (f.dataset.form === "add-task") {
    const text = val(f, "text");
    if (!text) return;
    const sort = Math.max(0, ...tasksOf(f.dataset.round, f.dataset.id).map((t) => t.sort)) + 1;
    await run(async () => {
      const { error } = await sb.from("tasks").insert({ round_id: f.dataset.round, item_id: f.dataset.id, version: +f.dataset.ver || 1, text, sort });
      if (error) throw error;
      clearForm(f);
      await refresh();
      $app.querySelector(`[data-form="add-task"][data-id="${f.dataset.id}"] input`)?.focus();
    }, "Tarefa adicionada");
    return;
  }
  if (f.dataset.form === "task-new") { // Nova tarefa: what to do, who does it, the card it belongs to (optional)
    const text = val(f, "text");
    if (!text) return;
    const who = val(f, "who") || null, item = val(f, "item") || null;
    const sort = Math.max(0, ...S.tasks.filter((t) => t.round_id === f.dataset.round).map((t) => t.sort)) + 1;
    await run(async () => {
      const { error } = await sb.from("tasks").insert({ round_id: f.dataset.round, item_id: item, version: +f.dataset.ver || 1, text, assignee: who, sort });
      if (error) throw error;
      S.modal = null;
      await refresh();
    }, `Tarefa criada${who ? ` pra ${PEOPLE[who]}` : ""}`);
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
// the order of a scene's cards (team): a card dragged by its dot, or its row in the menu, moves among the cards of its
// scene as it goes, the others sliding out of its way; dropping it anywhere saves the order (the menu, the pages and
// the animatic follow it), Esc puts it back
const still = matchMedia("(prefers-reduced-motion: reduce)");
function slide(box, move) {
  const els = [...box.children], was = new Map(els.map((x) => [x, x.getBoundingClientRect()]));
  move();
  if (still.matches) return;
  els.forEach((x) => {
    const a = was.get(x), b = x.getBoundingClientRect(), dx = a.left - b.left, dy = a.top - b.top;
    if (dx || dy) x.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 200, easing: "cubic-bezier(0.2, 0.7, 0.3, 1)" });
  });
}
// what follows the pointer: the card's image, small, and its title
function dragChip(e, el) {
  const it = itemOf(el.dataset.order);
  if (!it) return;
  const chip = Object.assign(document.createElement("div"), { className: "drag-chip" });
  const src = [...document.querySelectorAll(`[data-order="${it.id}"] img[data-path], [data-order="${it.id}"] video[data-path]`)]
    .find((m) => (m.tagName === "IMG" ? m.complete && m.naturalWidth : m.readyState >= 2));
  if (src) {
    const c = Object.assign(document.createElement("canvas"), { width: 128, height: 72 });
    const w = src.naturalWidth || src.videoWidth, h = src.naturalHeight || src.videoHeight, k = Math.max(128 / w, 72 / h);
    try { c.getContext("2d").drawImage(src, (128 - w * k) / 2, (72 - h * k) / 2, w * k, h * k); chip.append(c); } catch {}
  }
  chip.insertAdjacentHTML("beforeend", `<span><b class="num">${two(it.scene)}</b>${esc(it.title)}</span>`);
  document.body.append(chip);
  e.dataTransfer.setDragImage(chip, 20, 20);
  setTimeout(() => chip.remove());
}
function reorderStart(e, el) {
  S.reorder = { id: el.dataset.order, scene: el.dataset.scene, box: el.parentElement, el, last: null };
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.clearData();
  e.dataTransfer.setData("text/sala-order", el.dataset.order);
  dragChip(e, el);
  setTimeout(() => el.classList.add("reordering")); // after the browser took its picture of what is dragged
}
function reorderOver(e) {
  const rv = S.reorder;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  const t = e.target.closest?.("[data-order]");
  if (t === rv.el) { rv.last = null; return; }
  if (!t || t === rv.last || t.parentElement !== rv.box || t.dataset.scene !== rv.scene) return;
  rv.last = t; // the card it just passed stays put until the pointer leaves it (no flicker between two cards)
  const sib = [...rv.box.children];
  slide(rv.box, () => t[sib.indexOf(t) > sib.indexOf(rv.el) ? "after" : "before"](rv.el));
}
// the cards dragged take the places they had among the scene's cards (one a filter hides keeps its own), and the scene
// is numbered again from its first number
function saveOrder(rv) {
  const it = itemOf(rv.id);
  if (!it) return render(true);
  const scene = itemsOf(it.round_id).filter((x) => x.scene === it.scene);
  const ids = [...rv.box.children].map((x) => x.dataset?.order).filter((id) => scene.some((x) => x.id === id));
  const moved = new Set(ids);
  let k = 0;
  const next = scene.map((x) => (moved.has(x.id) ? itemOf(ids[k++]) : x));
  const base = Math.min(...scene.map((x) => x.sort ?? 0));
  const ch = next.map((x, i) => [x, base + i]).filter(([x, v]) => x.sort !== v);
  if (!ch.length) return render(true);
  ch.forEach(([x, v]) => (x.sort = v));
  render(true);
  run(async () => {
    const res = await Promise.all(ch.map(([x, v]) => sb.from("items").update({ sort: v }).eq("id", x.id)));
    const bad = res.find((r) => r.error);
    if (bad) throw bad.error;
    await refresh();
  }, "Ordem salva");
}
function reorderEnd(save) {
  const rv = S.reorder;
  S.reorder = null;
  rv.el.classList.remove("reordering");
  if (save) saveOrder(rv);
  else render(true);
}

// the board: an item card or a task dragged to a person's column
const isCard = (e) => [...(e.dataTransfer?.types || [])].some((t) => t === "text/sala-item" || t === "text/sala-task");
document.addEventListener("dragstart", (e) => {
  const g = e.target.closest?.("[data-grip], a[data-order]")?.closest("[data-order]");
  if (g && TEAM) return reorderStart(e, g);
  const c = e.target.closest?.("[data-card], [data-task]");
  if (!c) return;
  if (c.dataset.task) e.dataTransfer.setData("text/sala-task", c.dataset.task);
  else e.dataTransfer.setData("text/sala-item", c.dataset.card);
  e.dataTransfer.effectAllowed = "move";
  c.classList.add("dragging");
});
document.addEventListener("dragend", (e) => {
  if (S.reorder) return reorderEnd(false); // dropped outside the page or Esc: a drop on the page saves first
  e.target.closest?.("[data-card], [data-task]")?.classList.remove("dragging");
});
document.addEventListener("dragover", (e) => {
  if (S.reorder) return reorderOver(e);
  let d = null;
  if (isCard(e)) { d = e.target.closest?.("[data-col]"); if (d) e.preventDefault(); }
  else if (hasFiles(e)) { e.preventDefault(); d = e.target.closest?.(TEAM ? "[data-drop], [data-drop-req]" : "[data-drop-req]"); }
  document.querySelectorAll(".over").forEach((x) => x !== d && x.classList.remove("over"));
  d?.classList.add("over");
});
document.addEventListener("dragleave", (e) => { if (!e.relatedTarget || !$app.contains(e.relatedTarget)) document.querySelectorAll(".over").forEach((x) => x.classList.remove("over")); });
document.addEventListener("drop", (e) => {
  if (S.reorder) { e.preventDefault(); return reorderEnd(true); }
  document.querySelectorAll(".over").forEach((x) => x.classList.remove("over"));
  if (isCard(e)) {
    const col = e.target.closest?.("[data-col]");
    if (!col) return;
    e.preventDefault();
    const who = col.dataset.col || null;
    const t = S.tasks.find((x) => x.id === e.dataTransfer.getData("text/sala-task"));
    if (t) {
      if ((t.assignee || null) !== who) run(async () => { const { error } = await sb.from("tasks").update({ assignee: who }).eq("id", t.id); if (error) throw error; await refresh(); }, `Tarefa → ${who ? PEOPLE[who] : "sem dono"}`);
      return;
    }
    const it = itemOf(e.dataTransfer.getData("text/sala-item"));
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
// a tab opened before a deploy keeps running the old code: when the published app changes, offer a reload. The studio
// and Cena 3D ship on their own too, so their files count.
const CODE = ["./app.js", "./estudio.js", "./style.css", "./cena3d/cena3d.js", "./galeria.js"].map((f) => new URL(f, import.meta.url).href);
let codeTag = null;
async function checkVersion() {
  try {
    const tag = (await Promise.all(CODE.map((u) => fetch(u, { method: "HEAD", cache: "no-store" }).then((r) => r.headers.get("etag") || "")))).join();
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
// Someone of the team curates the client's room from inside it: with the team's login in the same browser (/producao is the same site),
// each image the client sees gets "Tirar da aprovação" next to "Ver em tela cheia", and each item "Tirar o item". The writes go
// with the team's login (envio and items are the team's to change), so the client never has this power. This client only
// reads the team's session from storage: it never signs in or out, and does not refresh in the background.
let teamSb = null, ADMIN = false, NOVAS = new Set();
async function adminCheck() {
  try {
    if (TEAM || !store.get(AUTH_KEY("time"))) return;
    teamSb = createClient(SUPABASE_URL, SUPABASE_KEY, { db: { schema: SCHEMA }, auth: { storageKey: AUTH_KEY("time"), autoRefreshToken: false, detectSessionInUrl: false } });
    const { data } = await teamSb.auth.getSession();
    ADMIN = roomOf(data.session?.user) === "time";
    await loadNovas();
  } catch { ADMIN = false; }
  document.body.classList.toggle("wk-admin", ADMIN);
}
// the extras put straight into the delivery to compare (envio.nova), tagged "Nova" on the client's tiles for the admin only
async function loadNovas() {
  if (!ADMIN) return;
  const { data } = await teamSb.from("envio").select("option_id, version").eq("nova", true).eq("include", true);
  NOVAS = new Set((data || []).map((e) => `${e.option_id}:${e.version}`));
}
const isNova = (it, o) => ADMIN && NOVAS.has(`${o.id}:${verNow(it)}`);
const adminName = () => PEOPLE[store.get("sala-name-time")] || "Time";
// take an option (or a whole item) out of what the client sees, with Desfazer putting back exactly what was there
async function adminOff(write, undo, msg) {
  await run(async () => {
    const { error } = await write();
    if (error) throw error;
    await refresh();
    toast(msg, false, { label: "Desfazer", fn: () => run(async () => { const { error: e } = await undo(); if (e) throw e; await refresh(); }, "Voltou pra aprovação") });
  });
}

async function boot() {
  // a fresh copy still has the placeholders from config.js: say so instead of a login that can never work
  if (/SEU-PROJETO|COLE-AQUI/.test(SUPABASE_URL + SUPABASE_KEY)) {
    $app.innerHTML = '<p class="booting">Falta ligar a sala ao Supabase: preencha SUPABASE_URL e SUPABASE_KEY em sala/config.js.</p>';
    return;
  }
  await adminCheck();
  const { data } = await sb.auth.getSession();
  const session = data.session;
  if (!session || roomOf(session.user) !== SIDE) {
    if (session) await sb.auth.signOut({ scope: "local" }); // a login from the other side: drop it here only
    return loginPage();
  }
  S.session = session;
  try { await load(true); if (TEAM && (await syncRounds())) await load(true); }
  catch (e) { console.error(e); $app.innerHTML = '<p class="booting">Não consegui carregar a sala. Recarregue a página.</p>'; return; }
  await warm().catch(() => {});
  if (!S.me || (TEAM && !PEOPLE[S.me])) S.modal = "name";
  onRoute();
  // generations that finished (or are still running) while no tab was open go into their items now
  if (TEAM && AI) { Estudio.onJobs(onMaking); Estudio.resume(estCtx()).catch((e) => console.error(e)); }
  if (!polling) {
    polling = true;
    setInterval(poll, 15000);
    document.addEventListener("visibilitychange", poll);
  }
}
boot();
