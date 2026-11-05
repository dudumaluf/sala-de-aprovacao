// Cena 3D (team only, location items): the low-poly blocking set of the approved location (sets.js), where the team
// places the scene's approved cast (rig.js) and the product (device.js, when config.js has a PRODUCT), frames with real
// lenses and saves angles. A saved angle is a new option of the location item (PNG 1920×1080, model "Blocking 3D", no
// ✓, so the client never sees it until someone checks it) plus a blocking_shots row with the camera, the cast and their
// poses, the product (stored as `device`) and the approved location image the set copies: the studio reads it to render
// the angle with AI. The set's editable state is saved in `cena3d` as the team works. Opened from a shot's card (its 3D
// button), Renderizar saves the angle and sends its render straight to that card, with what its prompt box says when
// open; ✕ (or Esc) goes back to the page the 3D was opened from.
// app.js draws a slot (<div data-c3d="itemId">) in the item's "Cena 3D" tab and calls mount(ctx) with the studio's
// context; this module keeps ONE persistent editor (WebGL canvas, camera, selection) and moves it back into the slot
// every time the room draws the page again, so the 3D is never rebuilt by a redraw.
import { THREE, D2R } from "./kit.js";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/controls/OrbitControls.js/+esm";
import { TransformControls } from "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/controls/TransformControls.js/+esm";
import { makeHuman, makeAnimal, applyPreset, poseOf, setPose, poseLabel, presetsOf, handlePoints, dragTo, rotateTo, handleQuat } from "./rig.js";
import { createTimeline } from "./timeline.js"; // the scene's timeline (a set with a `cut`): shots, keyframes, playing
import { exportScene } from "./video.js"; // the timeline as the scene's blocking video, on its card
// PRODUCT: the job's product ({ title }), or null when the film has none: then the stand-in stays hidden and out of the
// panel. Its item in the room is the one titled like it (trimmed, any case, any kind), as in estudio.js.
import { PROJECT, PRODUCT } from "../config.js";
import * as CFG from "../config.js"; // the optional CENA3D
// the job's own files, named in config.js CENA3D by their path from sala/ (kept out of git like config.js; they import
// the pieces from ../cena3d/kit.js): sets, the job's blocking sets, else the example in sets.js; device, the product's
// own model and states (the exports of device.js), else the neutral stand-in in device.js
const jobFile = (k, d) => (CFG.CENA3D?.[k] ? new URL(`../${CFG.CENA3D[k]}`, import.meta.url).href : d);
const [{ SETS, COLORS }, { makeDevice, setLed, LED_STATES }] = await Promise.all([import(jobFile("sets", "./sets.js")), import(jobFile("device", "./device.js"))]);

// the client's name, as the room writes it
const CL = PROJECT?.client;
const ART = CL ? { a: ["a ", "da "], o: ["o ", "do "] }[PROJECT.clientArticle] || ["", "de "] : ["o ", "do "];
const CLIENT = `${ART[0]}${CL || "cliente"}`, CLIENT_OF = `${ART[1]}${CL || "cliente"}`;
const MODEL = "Blocking 3D";
const CSS_V = 14; // bump when cena3d.css changes, so an open tab does not keep the old styles
const LENSES = [14, 16, 18, 21, 24, 28, 32, 35, 40, 50, 65, 75, 85, 100, 135];
// lens in mm on a full-frame (36 mm wide) sensor framed 16:9 ↔ vertical field of view
const fovOf = (mm) => THREE.MathUtils.radToDeg(2 * Math.atan(36 / (16 / 9) / 2 / mm));
const lensOf = (fov) => 36 / (16 / 9) / 2 / Math.tan(THREE.MathUtils.degToRad(fov) / 2);
const SHOT = [1920, 1080];
// the wheel's dolly: OrbitControls' zoomSpeed scale (×0.95 per 100 px of scroll, to this power); and how close to the
// point it turns around the camera may get
const DOLLY = 0.45;
const NEAR = 0.3;
const SVG = (d) => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const I = {
  move: SVG('<path d="M8 1.8v12.4M1.8 8h12.4M8 1.8 6.3 3.5M8 1.8l1.7 1.7M8 14.2l-1.7-1.7M8 14.2l1.7-1.7M1.8 8l1.7-1.7M1.8 8l1.7 1.7M14.2 8l-1.7-1.7M14.2 8l-1.7 1.7"/>'),
  rotate: SVG('<path d="M13 8a5 5 0 1 1-1.5-3.6"/><path d="M11.8 1.8v2.8H9"/>'),
  scale: SVG('<rect x="2.5" y="8.5" width="5" height="5" rx=".8"/><path d="M8.5 7.5l5-5M9.8 2.5h3.7v3.7"/>'),
  eye: SVG('<path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8z"/><circle cx="8" cy="8" r="1.8"/>'),
  eyeOff: SVG('<path d="M2.5 2.5l11 11M6.5 4c.5-.2 1-.3 1.5-.3 4.1 0 6.5 4.3 6.5 4.3s-.7 1.3-2 2.5M4.3 5.2C2.6 6.4 1.5 8 1.5 8s2.4 4.5 6.5 4.5c1 0 1.9-.3 2.7-.7"/>'),
  thirds: SVG('<rect x="1.8" y="3" width="12.4" height="10" rx="1"/><path d="M6 3v10M10 3v10M1.8 6.3h12.4M1.8 9.7h12.4"/>'),
  vert: SVG('<rect x="1.8" y="3" width="12.4" height="10" rx="1"/><rect x="5.6" y="3" width="4.8" height="10" fill="currentColor" fill-opacity=".35" stroke="none"/>'),
  cmp: SVG('<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M2.8 3.8H8v8.4H2.8z" fill="currentColor" stroke="none" opacity=".45"/><path d="M8 1.8v12.4"/>'),
  shot: SVG('<path d="M2 5.3h2.7L6 3.6h4l1.3 1.7H14v7.2H2z"/><circle cx="8" cy="9" r="2.2"/>'),
  level: SVG('<path d="M1.8 8h12.4"/><circle cx="8" cy="8" r="2.3"/><path d="M8 3.2v1.5M8 11.3v1.5"/>'),
  undo: SVG('<path d="M5.5 3.5 2.5 6.5l3 3"/><path d="M2.5 6.5h7a3.5 3.5 0 0 1 0 7H8"/>'),
  redo: SVG('<path d="M10.5 3.5l3 3-3 3"/><path d="M13.5 6.5h-7a3.5 3.5 0 0 0 0 7H8"/>'),
  plus: SVG('<path d="M8 3v10M3 8h10"/>'),
  tag: SVG('<path d="M2.5 8.5V3.2c0-.4.3-.7.7-.7h5.3l5 5-6 6z"/><circle cx="5.5" cy="5.5" r=".8"/>'),
  open: SVG('<path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5M12 9.5v3.5c0 .3-.2.5-.5.5h-8.5c-.3 0-.5-.2-.5-.5V4.5c0-.3.2-.5.5-.5H6.5"/>'),
  spark: SVG('<path d="M7.5 1.5l1.4 3.6 3.6 1.4-3.6 1.4-1.4 3.6-1.4-3.6L2.5 6.5l3.6-1.4z"/><path d="M12.5 10.5v4M10.5 12.5h4"/>'),
  reset: SVG('<path d="M2.6 7.5a5.5 5.5 0 1 0 1.6-3.7"/><path d="M2.2 2.4v3.3h3.3"/>'),
  x: SVG('<path d="M4 4l8 8M12 4l-8 8"/>'),
  back: SVG('<path d="M9.5 3.5 5 8l4.5 4.5"/>'),
  frame: SVG('<path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/><circle cx="8" cy="8" r="1.6"/>'),
  person: SVG('<circle cx="8" cy="5" r="2.4"/><path d="M3.3 13.5c.5-2.6 2.4-4 4.7-4s4.2 1.4 4.7 4"/>'),
  fold: SVG('<path d="M6 3.5 10.5 8 6 12.5"/>'),
  full: SVG('<path d="M9.5 2.5h4v4M13.5 2.5 9.3 6.7M6.5 13.5h-4v-4M2.5 13.5l4.2-4.2"/>'),
  unfull: SVG('<path d="M13.5 2.5 9.5 6.5M9.5 3v3.5H13M2.5 13.5l4-4M6.5 13V9.5H3"/>'),
  text: SVG('<path d="M2.5 4h11M2.5 8h11M2.5 12h6.5"/>'),
};

const E = { ctx: null, el: null, itemId: null, ready: false, history: [], future: [], figs: [], shots: [], signed: new Set(), asked: new Set(), camShot: null, ui: { cmp: false, op: 0.4, thirds: false, vert: false, names: true } };
const esc = (s) => E.ctx.esc(s);
const $ = (s) => E.el?.querySelector(s);
const v3 = (a) => new THREE.Vector3(...a);
const round = (v, n = 3) => +(+v).toFixed(n);
const arr = (v, n = 3) => v.toArray().map((x) => round(x, n));
const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 48) || "angulo";

// ---------- what the room approved ----------
// The client's pick first (chosen_option, or our reading of a comment in this version's feedback), then the team's ✓ in the
// round's current version; older readings only when this version has nothing. Blocking renders never count.
function approvedOf(it) {
  if (!it) return [];
  const { S, roundOf } = E.ctx;
  const V = roundOf(it.round_id)?.version || 1;
  const opts = S.options.filter((o) => o.item_id === it.id && o.model !== MODEL && !o.mime.startsWith("video/"));
  const byId = (id) => opts.find((o) => o.id === id);
  const out = [];
  const push = (o) => o && !out.includes(o) && out.push(o);
  const ok = (f) => ["aprovado", "ajustar"].includes(f.status);
  push(byId(it.chosen_option));
  S.feedback.filter((f) => f.item_id === it.id && (f.version || 1) === V && ok(f)).forEach((f) => push(byId(f.base_option)));
  opts.filter((o) => (o.version || 1) === V && S.reviews.find((r) => r.option_id === o.id)?.verdict === "keep").forEach(push);
  if (!out.length) S.feedback.filter((f) => f.item_id === it.id && ok(f)).sort((a, b) => b.version - a.version).forEach((f) => push(byId(f.base_option)));
  return out;
}
const sameScene = (it) => E.ctx.S.items.filter((x) => x.round_id === it.round_id && x.scene === it.scene);
const castItem = (title) => sameScene(E.item).find((x) => x.kind === "casting" && x.title.trim().toLowerCase() === title.trim().toLowerCase());
const isProduct = (x) => !!PRODUCT?.title && x.title.trim().toLowerCase() === String(PRODUCT.title).trim().toLowerCase();
const deviceItem = () => E.ctx.S.items.find((x) => x.round_id === E.item.round_id && isProduct(x)) || E.ctx.S.items.find(isProduct);
const thumbOf = (o) => (o ? E.ctx.urls.get(o.thumb_path || o.preview_path || o.path) || "" : "");
// the approved location image the current camera copies (a set with `refs` has one from inside and one from outside)
function locationRef() {
  const list = approvedOf(E.item);
  const refs = E.set?.refs;
  if (refs && E.set.inside) {
    const want = E.set.inside(E.camera.position.toArray()) ? refs.inside : refs.outside;
    return list.find((o) => o.name === want) || list[0] || null;
  }
  return list[0] || null;
}

// ---------- mounting ----------
export function mount(ctx) {
  E.ctx = ctx;
  if (!document.getElementById("c3d-css")) document.head.append(Object.assign(document.createElement("link"), { id: "c3d-css", rel: "stylesheet", href: new URL(`./cena3d.css?v=${CSS_V}`, import.meta.url).href }));
  if (!E.obs) {
    E.obs = new MutationObserver(() => attach());
    E.obs.observe(document.getElementById("app"), { childList: true, subtree: true });
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", () => fit());
    document.addEventListener("visibilitychange", () => (document.hidden ? flush() : attach()));
    window.addEventListener("pagehide", flush);
  }
  attach();
}
function attach() {
  const slot = document.querySelector("#app [data-c3d]");
  if (!slot) { E.el?.classList.remove("full"); if (E.loop) stopLoop(); return; }
  if (!E.el) build();
  if (E.el.parentNode !== slot) slot.replaceChildren(E.el);
  const id = slot.dataset.c3d;
  if (id !== E.itemId) openItem(id);
  fit();
  startLoop();
  shotFromUrl();
  // a render waiting in the studio for a new angle of this set: the 3D takes the window and its save goes back to it
  const h = held(), hk = h ? String(h.n) : "";
  if (E.ready && hk !== E.heldKey) { E.heldKey = hk; if (h) full(true); else toolbar(); }
  // the shot's card that opened it gets its Renderizar in the top icons
  const ok = origin()?.id || "";
  if (E.ready && ok !== E.originKey) { E.originKey = ok; toolbar(); }
}
// the studio's render whose blocking came from this set, while it waits for a new angle (estudio.js openSource)
const held = () => { const h = E.ctx?.heldRender?.(); return h && h.loc === E.itemId ? h : null; };
// the shot's card (kind plano) whose 3D button opened this set: #/…/cena3d/<shot>/<card id>, "-" for a shot with no
// planned camera. Renderizar saves the frame as an angle and sends its blocking render straight to that card
const origin = () => {
  const id = decodeURIComponent(location.hash.replace(/^#\/?/, "").split("/").filter(Boolean)[7] || "");
  const it = id && !held() ? E.ctx?.itemOf?.(id) : null;
  return it?.kind === "plano" ? it : null;
};
// Renderizar's prompt box (its button by Renderizar): what to change beyond the blocking, and Fiel / Solto, how closely
// the render follows it. Open, Renderizar sends both; closed, the render is the plain recipe. Kept per card on this
// computer, so the text is there again next time
const ASK_KEY = "sala-c3d-ask";
const asks = () => { try { return JSON.parse(localStorage.getItem(ASK_KEY) || "{}"); } catch { return {}; } };
function askFor(card) {
  if (E.ask?.id !== card.id) { const a = asks()[card.id] || {}; E.ask = { id: card.id, open: !!a.open, text: a.text || "", loose: !!a.loose }; }
  return E.ask;
}
function keepAsk() {
  const { id, open, text, loose } = E.ask || {};
  if (!id) return;
  try { const all = asks(); all[id] = { open, text, loose }; localStorage.setItem(ASK_KEY, JSON.stringify(all)); } catch {}
}
function syncAsk() {
  const box = $(".c3d-ask"), to = origin(), a = to && askFor(to);
  if (!box) return;
  box.hidden = !a?.open;
  if (!a?.open) return;
  const ta = box.querySelector("textarea");
  if (document.activeElement !== ta) ta.value = a.text;
  box.querySelectorAll('[data-k="ask-loose"]').forEach((b) => b.classList.toggle("on", (b.dataset.v === "1") === a.loose));
  fitAsk(ta);
}
function fitAsk(ta) { ta.style.height = "auto"; ta.style.height = `${Math.min(ta.scrollHeight, 150)}px`; }
// A link can open the set right on one of its shots: #/r/<round>/s/<scene>/<item>/cena3d/<shot id> (the room's router
// stops at the tab). It is applied once per item and shot, at once (no flight), and saves nothing by itself. A saved
// angle's id there brings back its camera and its scene (the studio sends a render's blocking here to be changed).
const urlShot = () => decodeURIComponent(location.hash.replace(/^#\/?/, "").split("/").filter(Boolean)[6] || "");
function shotFromUrl() {
  const id = urlShot(), h = held();
  const key = `${E.itemId}/${id}${h ? `/${h.n}` : ""}`;
  if (!id || !E.ready || E.urlShot === key) return;
  E.urlShot = key;
  const c = E.set.cams.find((x) => x.id === id);
  if (!c) { if (E.shots.some((s) => s.option_id === id)) goShot(id, true, true); return; }
  E.camShot = null;
  setCam(c, true);
  shotsBar(); side(); hud();
}

// ---------- the editor shell ----------
function build() {
  const el = document.createElement("div");
  el.className = "c3d";
  el.tabIndex = -1;
  el.innerHTML = `<div class="c3d-main"><div class="c3d-frame"><canvas></canvas>
      <div class="c3d-shot"><img class="c3d-ref" alt="" hidden><div class="c3d-guides"></div><div class="c3d-flash"></div></div>
      <div class="c3d-tags"></div><div class="c3d-msg">Carregando a cena 3D…</div>
      <div class="c3d-tl"></div><div class="c3d-tr"></div><div class="c3d-hud"></div><div class="c3d-dots"></div><div class="c3d-peek" hidden></div></div>
      <aside class="c3d-side"><button class="c3d-round c3d-side-x" data-k="side-x"></button><div class="c3d-body"></div></aside></div>`;
  E.el = el;
  sideX(sideOpen());
  const canvas = $("canvas");
  let renderer;
  try {
    // preserveDrawingBuffer: the frame is drawn only when something changes, and screen captures must still see it
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  } catch (e) {
    console.error(e);
    $(".c3d-msg").textContent = "Este navegador não abriu o 3D (WebGL).";
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5)); // realtime on a laptop: capped pixel ratio, one shadow
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fovOf(35), 16 / 9, 0.02, 900);
  const hemi = new THREE.HemisphereLight("#fff", "#444", 1);
  const sun = new THREE.DirectionalLight("#fff", 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(hemi, sun, sun.target);
  const helpers = new THREE.Group(); // handles and gizmo: never in a saved angle
  scene.add(helpers);
  // the gizmo first, so it sees a click on its arrows before the orbit does
  const gizmo = new TransformControls(camera, canvas);
  gizmo.setSize(0.8);
  helpers.add(gizmo.getHelper());
  const orbit = new OrbitControls(camera, canvas);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.12;
  orbit.zoomSpeed = DOLLY; // a pinch on a touch screen; the wheel is ours (onWheel)
  orbit.minDistance = NEAR;
  orbit.screenSpacePanning = true;
  gizmo.addEventListener("dragging-changed", (e) => { orbit.enabled = !e.value; if (!e.value) commit(); });
  gizmo.addEventListener("objectChange", onGizmo);
  gizmo.addEventListener("change", () => (E.needs = true));
  orbit.addEventListener("start", () => { stopGlide(); E.tl?.release(); });
  orbit.addEventListener("change", () => {
    E.needs = true;
    if (E.quiet) track();
    else {
      bound();
      if (E.camPreset || E.camShot) { E.camPreset = null; E.camShot = null; shotsBar(); side(); }
    }
    hud();
  });
  orbit.addEventListener("end", () => scheduleSave());
  Object.assign(E, { renderer, scene, camera, hemi, sun, helpers, gizmo, orbit, canvas, mode: "translate", points: [],
    cells: [], reach: 8, lastC: new THREE.Vector3(), lastT: new THREE.Vector3(), want: new THREE.Spherical() });
  E.proxy = new THREE.Object3D();
  scene.add(E.proxy);
  bindPointer();
  // before the canvas (and OrbitControls on it) sees the wheel
  $(".c3d-frame").addEventListener("wheel", onWheel, { capture: true, passive: false });
  bindUi();
  E.tl = createTimeline({ E, esc, fovOf, lensOf, LENSES, commit, setLed, LED_STATES, PRODUCT, fitProps, updateHandles, exportScene: runExport, exportTo: exportCard });
  E.tl.mount();
  new ResizeObserver(() => fit()).observe(el);
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") { window.__c3d = E; E.dev = { stepGlide, draw }; } // local tuning only
}
function fit() {
  if (!E.el?.isConnected || !E.renderer) return;
  const slot = E.el.parentNode;
  // the slot fills what is left of the page under the tabs, measured as if the page were scrolled to the top: its place
  // on screen moves while the page scrolls, and sizing from it made the slot grow with every scroll (an endless page)
  let sc = slot.parentElement;
  while (sc && !/(auto|scroll)/.test(getComputedStyle(sc).overflowY)) sc = sc.parentElement;
  const top = slot.getBoundingClientRect().top + (sc || document.scrollingElement).scrollTop;
  // and it ends at the scroll area's own bottom padding, so there is nothing left to scroll
  const pad = sc ? parseFloat(getComputedStyle(sc).paddingBottom) || 0 : 24;
  const h = Math.max(420, Math.floor(window.innerHeight - top - pad));
  slot.style.height = `${h}px`;
  // The canvas takes the whole editor (the tab, or the window with ⤢). The panel floats over it on the right (a sheet
  // at the bottom on a narrow screen), and the frame of the shot is the biggest 16:9 that fits in what the panel leaves
  // free: the lens frames exactly that (a 16:9 camera drawn with a view offset), and the set goes on around it, dimmed.
  const mr = $(".c3d-main").getBoundingClientRect(), pr = $(".c3d-side").getBoundingClientRect();
  const W = Math.round(mr.width), H = Math.round(mr.height);
  if (W < 2 || H < 2) return;
  const sheet = matchMedia("(max-width: 860px)").matches;
  E.side = sheet ? 0 : Math.max(0, Math.round(mr.right - pr.left));
  E.low = (sheet ? Math.max(0, Math.round(mr.bottom - pr.top)) : 0) + (E.tl?.height() || 0); // the timeline sits under the frame
  E.el.style.setProperty("--side", `${E.side}px`);
  E.el.style.setProperty("--low", `${E.low}px`);
  trw();
  const cv = E.renderer.domElement, px = E.renderer.getPixelRatio();
  if (!E.sized || Math.abs(cv.width / px - W) > 1 || Math.abs(cv.height / px - H) > 1) {
    E.renderer.setSize(W, H, false);
    E.sized = true;
  }
  const m = 14, aw = Math.max(64, W - E.side - 2 * m), ah = Math.max(36, H - E.low - 2 * m);
  let fw = aw, fh = (aw * 9) / 16;
  if (fh > ah) { fh = ah; fw = (ah * 16) / 9; }
  const fx = m + (aw - fw) / 2, fy = m + (ah - fh) / 2;
  Object.assign($(".c3d-shot").style, { left: `${fx}px`, top: `${fy}px`, width: `${fw}px`, height: `${fh}px` });
  E.camera.aspect = 16 / 9;
  E.camera.setViewOffset(fw, fh, -fx, -fy, W, H);
  E.needs = true;
}
function startLoop() {
  if (E.loop || !E.renderer) return;
  E.loop = true;
  const tick = (t) => {
    if (!E.loop) return;
    requestAnimationFrame(tick);
    if (!E.el.isConnected || document.hidden) return;
    if (E.glide) stepGlide(t);
    else if (E.tl?.playing) E.tl.step(t);
    else if (E.tl?.hold) { /* the timeline holds the camera (a ride on the set, a hand shake) until a drag takes it */ }
    else if (E.orbit.update()) E.needs = true;
    if (E.needs && E.ready) { E.needs = false; draw(); }
  };
  requestAnimationFrame(tick);
}
function stopLoop() { E.loop = false; flush(); }
function draw() {
  sizeHandles();
  E.sky?.position.copy(E.camera.position);
  E.renderer.render(E.scene, E.camera);
  tags();
}

// ---------- opening an item: the set, the cast, the product, the saved state ----------
async function openItem(id) {
  flush();
  E.itemId = id;
  E.from = null;
  E.ready = false;
  const it = E.ctx.itemOf(id);
  E.item = it;
  E.set = SETS[it?.scene];
  clearScene();
  $(".c3d-msg").hidden = false;
  if (!E.renderer) return;
  E.canvas.style.visibility = "hidden";
  if (!approvedOf(it).length) return message(`A Cena 3D entra quando a locação tiver uma imagem aprovada: a escolha ${CLIENT_OF} ou um ✓ da equipe nesta versão.`);
  if (!E.set) return message("Esta locação ainda não tem set 3D.");
  $(".c3d-msg").textContent = "Montando o set…";
  try {
    const [st, shots] = await Promise.all([
      E.ctx.sb.from("cena3d").select("*").eq("item_id", id).maybeSingle(),
      E.ctx.sb.from("blocking_shots").select("*").eq("item_id", id).order("created_at", { ascending: false }),
    ]);
    if (E.itemId !== id) return;
    if (st.error) throw st.error;
    E.saved = st.data;
    E.shots = shots.data || [];
    await E.ctx.sign([...approvedOf(it), ...castOpts(), ...(deviceItem() ? approvedOf(deviceItem()) : [])].map((o) => o.thumb_path || o.preview_path || o.path)
      .concat(approvedOf(it).map((o) => o.preview_path || o.path)).concat(shotOpts().map((o) => o.thumb_path || o.preview_path || o.path)));
  } catch (e) {
    console.error(e);
    return message("Não consegui abrir a Cena 3D. Recarregue a página.");
  }
  E.root = new THREE.Group();
  E.root.name = "set";
  E.scene.add(E.root);
  E.set.build(E.root);
  E.root.traverse((o) => { if (o.isMesh) o.userData.set = true; });
  // a set with `motion` (a boat) rocks as a whole: everything but what its build marked still (the sea) goes on a deck,
  // with the cast, the product and the props; at rest it changes nothing, the timeline moves it
  E.deck = null;
  if (E.set.motion) {
    E.deck = new THREE.Group();
    E.deck.name = "deck";
    for (const o of [...E.root.children]) if (!o.userData.still) E.deck.add(o);
    E.root.add(E.deck);
  }
  env(E.set.env);
  E.cells = cellsOf(E.set);
  E.reach = THREE.MathUtils.clamp(Math.max(...E.set.cams.map((c) => v3(c.pos).distanceTo(v3(c.target)))) * 1.5, 8, 90);
  E.device = makeDevice();
  (E.deck || E.scene).add(E.device);
  applyState(E.saved?.state ? { ...E.saved.state, camera: settle(E.saved.state.camera) } : defaults());
  E.history = [JSON.stringify(state())]; E.future = [];
  E.ready = true;
  $(".c3d-msg").hidden = true;
  E.canvas.style.visibility = "";
  toolbar(); side(); shotsBar(); hud();
  fit();
  shotFromUrl();
  draw(); // the first frame right away, without waiting for the next animation frame
}
function message(t) {
  const m = $(".c3d-msg");
  m.hidden = false;
  m.textContent = t;
  $(".c3d-body").innerHTML = "";
  $(".c3d-dots").innerHTML = "";
  $(".c3d-tl").innerHTML = $(".c3d-tr").innerHTML = $(".c3d-hud").innerHTML = "";
}
function clearScene() {
  E.tl?.reset();
  E.deck = null;
  deselect();
  for (const f of E.figs) f.root.removeFromParent();
  E.figs = [];
  E.device?.removeFromParent();
  E.device = null;
  E.root?.removeFromParent(); // geometries and materials are shared and cached by kit.js: nothing to dispose
  E.root = null;
  for (const p of E.points) p.removeFromParent();
  E.points = [];
  for (const p of E.props || []) p.obj.removeFromParent();
  E.props = [];
}
function env(e) {
  E.scene.background = new THREE.Color(e.bg);
  E.scene.fog = e.fog ? new THREE.Fog(e.fog[0], e.fog[1], e.fog[2]) : null;
  // the sets' intensities are written on the old scale: physical lights (three r155+) need them times π
  E.hemi.color.set(e.hemi[0]); E.hemi.groundColor.set(e.hemi[1]); E.hemi.intensity = e.hemi[2] * Math.PI;
  const s = e.sun;
  E.sun.color.set(s.color); E.sun.intensity = s.i * Math.PI;
  E.sun.position.set(...s.pos); E.sun.target.position.set(...(s.target || [0, 0, 0]));
  Object.assign(E.sun.shadow.camera, { left: -s.box, right: s.box, top: s.box, bottom: -s.box, near: 0.5, far: 200 });
  E.sun.shadow.camera.updateProjectionMatrix();
  for (const [x, y, z, c, i, d] of e.points || []) {
    const p = new THREE.PointLight(c, i * Math.PI, d, 1.6);
    p.position.set(x, y, z);
    E.scene.add(p);
    E.points.push(p);
  }
  // the sky seen through windows and doors: a dome from the horizon color up to the zenith color, unlit, no fog; it goes
  // where the camera goes (draw, the timeline), so a drone far over the set still has it around
  E.sky = null;
  if (e.sky) {
    const geo = new THREE.SphereGeometry(600, 32, 16);
    const col = [], top = new THREE.Color(e.sky[0]), hor = new THREE.Color(e.sky[1]), low = new THREE.Color(e.sky[2] || e.sky[1]);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = p.getY(i) / 600;
      const c = t >= 0 ? hor.clone().lerp(top, Math.pow(t, 0.6)) : hor.clone().lerp(low, Math.min(1, -t * 4));
      col.push(c.r, c.g, c.b);
    }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    const dome = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    dome.renderOrder = -1;
    E.scene.add(dome);
    E.points.push(dome);
    E.sky = dome;
  }
  E.renderer.toneMappingExposure = e.exposure || 1;
}

// ---------- cast and product (`device` in the code and the stored state) ----------
const castOpts = () => (E.set?.cast || []).map((c) => { const ci = castItem(c.item); return ci && approvedOf(ci)[0]; }).filter(Boolean);
const shotOpts = () => E.ctx.S.options.filter((o) => o.item_id === E.itemId && o.model === MODEL && E.ctx.S.reviews.find((r) => r.option_id === o.id)?.verdict !== "drop");
function defaults() {
  const s = E.set;
  return {
    v: 1,
    cast: s.cast.map((c, i) => ({ key: `${c.item}:${c.name}`, item: c.item, name: c.name, kind: c.kind || "human", build: c.build, height: c.height, color: c.color || COLORS[i % COLORS.length],
      visible: true, pos: c.at, ry: c.ry || 0, scale: 1, preset: c.pose })),
    // the product where the set puts it; a set without one (or a job without a product) starts with it hidden
    device: !s.device ? { visible: false, attach: null, pos: [0, 0, 0], rot: [0, 0, 0], scale: 1, led: LED_STATES[0][0] }
      : s.device.attach ? { visible: true, attach: { key: `${s.cast[s.device.attach.cast].item}:${s.cast[s.device.attach.cast].name}`, bone: s.device.attach.bone }, pos: s.device.attach.at, rot: s.device.attach.rot || [0, 0, 0], scale: 1, led: s.device.led || LED_STATES[0][0] }
      : { visible: true, attach: null, pos: s.device.at, rot: [0, s.device.ry || 0, 0], scale: 1, led: s.device.led || LED_STATES[0][0] },
    camera: camOf(s.cams[0]),
  };
}
const camOf = (c) => ({ pos: c.pos, target: c.target, lens: c.lens, preset: c.id });
function addFigure(c) {
  const kind = c.kind || "human";
  // the wardrobe comes from the set (sets.js cast `look`), never from a saved state, so a set's look reaches old states
  const look = E.set?.cast?.find((s) => `${s.item}:${s.name}` === c.key)?.look || null;
  const fig = kind === "human" ? makeHuman({ height: c.height || 1.75, color: c.color, build: c.build || "m", name: c.name, look }) : makeAnimal(kind, { name: c.name, color: look?.fur });
  Object.assign(fig, { key: c.key, name: c.name, itemTitle: c.item || "", visible: c.visible !== false });
  fig.root.position.set(...(c.pos || c.at || [0, 0, 0]));
  fig.root.rotation.y = (c.ry || 0) * D2R;
  fig.root.scale.setScalar(c.scale || 1);
  fig.root.visible = fig.visible;
  (E.deck || E.scene).add(fig.root);
  fig.root.updateMatrixWorld(true);
  // a saved pose (every joint and target) or a preset by name
  if (c.pose && typeof c.pose === "object") setPose(fig, c.pose);
  else applyPreset(fig, c.preset || (kind === "human" ? "stand" : undefined));
  fig.adjusted = !!c.adjusted;
  E.figs.push(fig);
  return fig;
}
const figOf = (key) => E.figs.find((f) => f.key === key);
function applyState(st) {
  deselect();
  for (const f of E.figs) f.root.removeFromParent();
  E.figs = [];
  for (const c of st.cast || []) addFigure(c);
  const d = st.device || {};
  (E.deck || E.scene).attach(E.device);
  const bone = d.attach && figOf(d.attach.key)?.bones?.[d.attach.bone];
  (bone || E.deck || E.scene).add(E.device);
  E.device.position.set(...(d.pos || [0, 0, 0]));
  E.device.rotation.set(...(d.rot || [0, 0, 0]).map((a) => a * D2R));
  E.device.scale.setScalar(d.scale || 1);
  E.device.visible = !!PRODUCT && d.visible !== false;
  E.device.userData.attach = bone ? d.attach : null;
  setLed(E.device, d.led || undefined);
  buildProps(st);
  E.from = st.camera?.from || null;
  if (st.camera) setCam(st.camera, true);
  E.tl?.apply(st.timeline); // the saved timeline, or the set's cut to start from
  fit();
  E.needs = true;
}
// ---------- props (sets.js `props`): what the script puts in a hand, on a head or on a table ----------
// Each has its eye in the card, kept in the saved state; a hidden one is not in a saved angle's picture.
const castKey = (i) => { const c = E.set.cast[i]; return c ? `${c.item}:${c.name}` : ""; };
function buildProps(st) {
  for (const p of E.props || []) p.obj.removeFromParent();
  E.props = (E.set.props || []).map((spec) => {
    const obj = new THREE.Group();
    obj.name = spec.key;
    spec.build(obj);
    obj.traverse((o) => { if (o.isMesh) o.userData.prop = spec.key; });
    const p = { key: spec.key, spec, obj, visible: st?.props?.[spec.key] !== false };
    obj.visible = p.visible;
    placeProp(p);
    return p;
  });
}
// on a bone: at its place in the bone (`at`), turned as the figure faces (or as the bone, space "bone"), real size
// whatever the figure's height; in the set: where it stands
function placeProp(p) {
  const { spec, obj } = p, a = spec.attach;
  const f = a && figOf(castKey(a.cast));
  const b = f && (f.bones?.[a.bone] || f.joints?.[a.bone]);
  if (!b) {
    (E.deck || E.scene).add(obj);
    obj.position.set(...(spec.at || [0, 0, 0]));
    obj.rotation.set(...(spec.rot || [0, spec.ry || 0, 0]).map((x) => x * D2R));
    obj.scale.setScalar(1);
    return;
  }
  b.add(obj);
  obj.position.set(...(a.at || [0, 0, 0]));
  f.root.updateMatrixWorld(true);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(a.rot || [0, 0, 0]).map((x) => x * D2R)));
  if (a.space === "bone") obj.quaternion.copy(q);
  else obj.quaternion.copy(b.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(f.root.getWorldQuaternion(new THREE.Quaternion())).multiply(q));
  obj.scale.setScalar(1 / (f.bones?.root?.scale.x || 1));
}
// a new pose for a figure puts its props back in its hands, the right way up
function fitProps(f) { for (const p of E.props || []) if (p.spec.attach && castKey(p.spec.attach.cast) === f.key) placeProp(p); }
function state() {
  const d = E.device;
  return {
    v: 1,
    cast: E.figs.map((f) => ({ key: f.key, item: f.itemTitle, name: f.name, kind: f.kind, build: f.build, height: f.height, color: f.color,
      visible: f.visible, pos: arr(f.root.position), ry: round(f.root.rotation.y / D2R, 2), scale: round(f.root.scale.x), pose: poseOf(f), adjusted: !!f.adjusted })),
    device: { visible: d.visible, attach: d.userData.attach, pos: arr(d.position, 4), rot: [d.rotation.x, d.rotation.y, d.rotation.z].map((a) => round(a / D2R, 2)), scale: round(d.scale.x), led: d.userData.led },
    props: Object.fromEntries((E.props || []).map((p) => [p.key, p.visible])),
    camera: { pos: arr(E.camera.position), target: arr(E.orbit.target), lens: round(lensOf(E.camera.fov), 1), preset: E.camPreset || null, from: E.from || null },
    timeline: E.tl?.state(),
  };
}

// ---------- history and saving (cena3d.state, debounced) ----------
function commit() {
  const s = JSON.stringify(state());
  if (E.history.at(-1) === s) return;
  E.history.push(s);
  if (E.history.length > 60) E.history.shift();
  E.future = [];
  scheduleSave();
  side();
  toolbar(); // undo and redo come alive
}
function undo(redo = false) {
  const from = redo ? E.future : E.history, to = redo ? E.history : E.future;
  if (!redo && E.history.length < 2) return;
  if (redo && !E.future.length) return;
  if (redo) { const s = from.pop(); to.push(s); applyState(JSON.parse(s)); }
  else { to.push(from.pop()); applyState(JSON.parse(from.at(-1))); }
  scheduleSave();
  side(); toolbar();
}
function scheduleSave() {
  clearTimeout(E.saveT);
  E.saveT = setTimeout(save, 1200);
  E.pendingSave = true;
}
async function save() {
  if (!E.ready || !E.itemId) return;
  clearTimeout(E.saveT);
  E.pendingSave = false;
  const row = { item_id: E.itemId, state: state(), updated_by: E.ctx.myName(), updated_at: new Date().toISOString() };
  const { error } = await E.ctx.sb.from("cena3d").upsert(row);
  if (error) { console.error(error); E.ctx.toast("A Cena 3D não salvou. Tente de novo.", true); return; }
  E.saved = row;
  hud();
}
function flush() { if (E.pendingSave) save(); }
const savedLine = () => (E.saved?.updated_at ? `Salvo · ${E.saved.updated_by || ""}, ${new Date(E.saved.updated_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "Original do set");

// ---------- camera ----------
function setCam(c, instant = false) {
  E.tl?.release(); // a camera stop chosen by hand: the timeline lets go of the camera
  const to = { pos: v3(c.pos), target: v3(c.target), fov: fovOf(c.lens || 35) };
  E.camPreset = c.preset || c.id || null;
  if (E.set?.cams.some((x) => x.id === E.camPreset)) E.from = E.camPreset; // the shot a saved angle will say it came from
  admit(to.pos, to.target);
  // the drift left from a drag ends here: applied after the flight, it would push the camera off the shot
  E.orbit._sphericalDelta?.set(0, 0, 0);
  E.orbit._panOffset?.set(0, 0, 0);
  if (instant) {
    E.camera.position.copy(to.pos); E.orbit.target.copy(to.target); E.camera.fov = to.fov; E.camera.updateProjectionMatrix();
    E.quiet = true; E.orbit.update(); E.quiet = false;
    track();
    hud(); refImage(); E.needs = true;
    return;
  }
  const from = { pos: E.camera.position.clone(), target: E.orbit.target.clone(), fov: E.camera.fov };
  const turn = from.target.clone().sub(from.pos).normalize().angleTo(to.target.clone().sub(to.pos).normalize());
  const dur = THREE.MathUtils.clamp(700 + from.pos.distanceTo(to.pos) * 45 + turn * 180, 700, 1500);
  const a = aim(from), b = aim(to);
  if (Math.cos(a.tilt) < 1e-3) a.pan = b.pan; // straight up or down has no pan of its own: no spin on the way
  if (Math.cos(b.tilt) < 1e-3) b.pan = a.pan;
  E.glide = { from, to, a, b, t0: performance.now(), dur };
  E.quiet = true;
  E.needs = true;
}
// where a camera looks, as a tripod head reads it: pan (around y), tilt, and how far the point it turns around is
function aim(c) {
  const d = c.target.clone().sub(c.pos), r = d.length();
  return { r, pan: Math.atan2(d.x, d.z), tilt: Math.asin(THREE.MathUtils.clamp(d.y / r, -1, 1)) };
}
// The camera moves on a straight line and pans and tilts like a head on a tripod, the shorter way round, all along the
// flight: it never rolls and never whips round half way, and it always looks at the point it turns around, so nothing
// jumps when it lands (orbit.update aims it the same way) or when a drag stops it on the way.
function stepGlide(now) {
  const g = E.glide;
  const t = Math.min(1, (now - g.t0) / g.dur);
  const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
  const dp = g.b.pan - g.a.pan - Math.round((g.b.pan - g.a.pan) / (2 * Math.PI)) * 2 * Math.PI;
  const pan = g.a.pan + dp * e, tilt = g.a.tilt + (g.b.tilt - g.a.tilt) * e, r = g.a.r + (g.b.r - g.a.r) * e;
  if (t >= 1) { E.camera.position.copy(g.to.pos); E.orbit.target.copy(g.to.target); }
  else {
    E.camera.position.lerpVectors(g.from.pos, g.to.pos, e);
    E.orbit.target.set(Math.cos(tilt) * Math.sin(pan), Math.sin(tilt), Math.cos(tilt) * Math.cos(pan)).multiplyScalar(r).add(E.camera.position);
  }
  E.camera.lookAt(E.orbit.target);
  E.camera.fov = g.from.fov + (g.to.fov - g.from.fov) * e;
  E.camera.updateProjectionMatrix();
  E.needs = true;
  if (t >= 1) { E.glide = null; E.orbit.update(); E.quiet = false; track(); hud(); refImage(); shotsBar(); scheduleSave(); }
}
// a drag or the wheel during a flight stops it where it is: a place the program put the camera, so it is allowed
function stopGlide() {
  if (!E.glide) return;
  E.glide = null;
  E.quiet = false;
  admit(E.camera.position, E.orbit.target);
  track();
}

// ---------- where the camera may go (sets.js `bounds`) ----------
// The camera stays in the set's boxes: a move that would take it out of the boxes it is in slides along their faces
// instead; boxes that overlap are a way through; a box's `cut` is a solid it can't enter. A turn moves the place the
// user wants the camera (E.want, around the target) and the camera goes as near it as the walls allow: it slides along
// a wall, comes back out to the chosen distance once the wall is out of the way, and retraces its path when turned back.
const AXES = ["x", "y", "z"];
const box3 = ([x0, y0, z0, x1, y1, z1]) => new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1));
const cellsOf = (set) => (set.bounds || []).map((b) => ({ box: box3(b.box || b), cut: (b.cut || []).map(box3) }));
// inside a box, give or take a rounding error (OrbitControls rewrites the position every frame); a solid's face is not
// inside it, so a camera stopped on it stays out
const within = (b, p, e = 1e-6) => p.x >= b.min.x - e && p.x <= b.max.x + e && p.y >= b.min.y - e && p.y <= b.max.y + e && p.z >= b.min.z - e && p.z <= b.max.z + e;
const solid = (h, p) => within(h, p, -1e-6);
const inCell = (c, p) => within(c.box, p) && !c.cut.some((h) => solid(h, p));
const gap = (b, p, a) => Math.max(b.min[a] - p[a], p[a] - b.max[a]);
// where the program puts the camera (a planned shot, a saved angle, the saved state) is always allowed: a box that almost
// reaches it grows to take it in, one far from every box gets a small box of its own; the distance limits follow it
function admit(pos, target) {
  const p = pos.clone();
  if (E.cells.length && !E.cells.some((c) => inCell(c, p))) {
    const holed = E.cells.find((c) => within(c.box, p));
    if (holed) holed.cut = holed.cut.filter((h) => !solid(h, p));
    else {
      const near = E.cells.reduce((a, c) => (c.box.distanceToPoint(p) < a.box.distanceToPoint(p) ? c : a));
      if (near.box.distanceToPoint(p) < 0.1) near.box.expandByPoint(p);
      else {
        const own = new THREE.Box3().setFromCenterAndSize(p, new THREE.Vector3(1.5, 1.2, 1.5));
        for (const c of E.cells) {
          if (!own.intersectsBox(c.box)) continue; // stop short of the other boxes: no way through the wall between
          const a = AXES.reduce((m, x) => (gap(c.box, p, x) > gap(c.box, p, m) ? x : m));
          if (p[a] < c.box.min[a]) own.max[a] = Math.min(own.max[a], c.box.min[a] - 0.05);
          else own.min[a] = Math.max(own.min[a], c.box.max[a] + 0.05);
        }
        E.cells.push({ box: own, cut: [] });
      }
    }
  }
  const r = pos.distanceTo(target);
  E.orbit.minDistance = Math.min(NEAR, r * 0.98);
  E.orbit.maxDistance = Math.max(E.reach, r * 1.02);
}
// where a move from `from` toward `to` ends: at `to` when a box the camera is in holds it, otherwise at the nearest
// point of those boxes, out of their solids through the face the move came in by
function keepIn(from, to) {
  if (!E.cells.length) return to;
  if (!E.cells.some((c) => inCell(c, from))) admit(from, E.orbit.target);
  const inn = E.cells.filter((c) => inCell(c, from));
  if (inn.some((c) => inCell(c, to))) return to;
  let best = to, bd = Infinity;
  for (const c of inn) {
    const q = c.box.clampPoint(to, new THREE.Vector3());
    for (const h of c.cut) if (solid(h, q)) slide(h, from, q);
    const d = q.distanceToSquared(to);
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}
// stop on the face of the solid `h` the move came in by, and keep the rest of the move (it slides along that face)
function slide(h, from, q) {
  let ax = null, tMax = -Infinity;
  for (const a of AXES) {
    const d = q[a] - from[a];
    const t = from[a] <= h.min[a] && d > 0 ? (h.min[a] - from[a]) / d : from[a] >= h.max[a] && d < 0 ? (h.max[a] - from[a]) / d : -Infinity;
    if (t > tMax) { tMax = t; ax = a; }
  }
  if (ax) q[ax] = from[ax] <= h.min[ax] ? h.min[ax] - 1e-4 : h.max[ax] + 1e-4;
}
// the saved working view may sit behind a wall (saved before the set had bounds): it opens at the nearest place inside
// instead. The planned shots and the saved angles keep their exact place.
function settle(cam) {
  if (!cam?.pos || !E.cells.length) return cam;
  const p = v3(cam.pos);
  if (E.cells.some((c) => inCell(c, p))) return cam;
  if ([...E.set.cams.map((c) => c.pos), ...E.shots.map((s) => s.camera?.position)].some((q) => q && p.distanceTo(v3(q)) < 0.01)) return cam;
  let best = null, bd = Infinity;
  for (const c of E.cells) {
    const q = c.box.clampPoint(p, new THREE.Vector3());
    for (const h of c.cut) {
      if (!solid(h, q)) continue; // out of a solid the shortest way
      const [a, f] = AXES.flatMap((x) => [[x, h.min[x] - 1e-4], [x, h.max[x] + 1e-4]]).reduce((m, x) => (Math.abs(q[x[0]] - x[1]) < Math.abs(q[m[0]] - m[1]) ? x : m));
      q[a] = f;
    }
    const d = q.distanceToSquared(p);
    if (d < bd) { bd = d; best = q; }
  }
  return { ...cam, pos: best.toArray(), preset: null };
}
// after OrbitControls (or the wheel, or a focus) moved the camera: keep it in the set
const _a = new THREE.Spherical(), _b = new THREE.Spherical(), _o = new THREE.Vector3();
function bound() {
  const p = E.camera.position, t = E.orbit.target;
  const panned = !t.equals(E.lastT);
  const r = p.distanceTo(t);
  const turned = !panned && Math.abs(r - E.lastC.distanceTo(E.lastT)) <= 1e-6 * (1 + r);
  if (turned) { // the same turn for the wanted place, then the camera goes as near it as the walls allow
    _a.setFromVector3(_o.subVectors(E.lastC, t));
    _b.setFromVector3(_o.subVectors(p, t));
    const dt = _b.theta - _a.theta;
    E.want.theta += dt - Math.round(dt / (2 * Math.PI)) * 2 * Math.PI;
    E.want.phi = THREE.MathUtils.clamp(E.want.phi + _b.phi - _a.phi, 1e-4, Math.PI - 1e-4);
    p.setFromSpherical(E.want).add(t);
  }
  const q = keepIn(E.lastC, p);
  const hit = !q.equals(p);
  if (hit) {
    if (panned && !E.focusing) t.add(q.clone().sub(p)); // a pan stops at the wall instead of turning the camera
    p.copy(q);
  }
  if (turned || hit) E.camera.lookAt(t);
  if (!turned) E.want.setFromVector3(_o.subVectors(p, t));
  E.lastC.copy(p); E.lastT.copy(t);
}
function track() {
  E.lastC.copy(E.camera.position);
  E.lastT.copy(E.orbit.target);
  E.want.setFromVector3(_o.subVectors(E.lastC, E.lastT));
}
// the wheel dollies here, not in OrbitControls: slower (DOLLY), within the distance limits and the set's bounds, and
// without the coast a trackpad adds after the fingers leave it
function onWheel(e) {
  if (e.target.closest?.(".c3d-ask")) return; // a long prompt scrolls in its box
  e.preventDefault();
  e.stopPropagation(); // OrbitControls, on the canvas inside this frame, never sees it
  if (!E.ready || !E.orbit.enabled || E.orbit.state !== -1) return;
  E.tl?.release();
  let d = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
  if (e.ctrlKey) d *= 10; // a pinch on the trackpad comes as ctrl + wheel, in small steps
  if (!d || coasting(d, e.timeStamp)) return;
  stopGlide();
  const t = E.orbit.target, off = E.camera.position.clone().sub(t), r = off.length();
  if (r < 1e-6) return;
  const k = Math.pow(0.95, (DOLLY * Math.min(Math.abs(d), 200)) / 100);
  // a scroll is a straight line toward or away from the point: it stops at a wall on that line, never slides along it
  const [lo, hi] = along(t, off.clone().divideScalar(r), r);
  const lo2 = Math.max(E.orbit.minDistance, lo), hi2 = Math.min(E.orbit.maxDistance, hi);
  off.setLength(THREE.MathUtils.clamp(r * (d > 0 ? 1 / k : k), Math.min(lo2, r), Math.max(hi2, r)));
  E.camera.position.copy(t).add(off);
  E.orbit.update();
  scheduleSave();
}
// from where to where on the line from the target through the camera the boxes the camera is in reach
function along(t, dir, r) {
  let lo = r, hi = r, inside = false;
  for (const c of E.cells) {
    if (!inCell(c, E.camera.position)) continue;
    let s0 = -Infinity, s1 = Infinity;
    for (const a of AXES) {
      if (Math.abs(dir[a]) < 1e-9) continue; // parallel to these faces: the camera is between them already
      const u = (c.box.min[a] - t[a]) / dir[a], v = (c.box.max[a] - t[a]) / dir[a];
      s0 = Math.max(s0, Math.min(u, v));
      s1 = Math.min(s1, Math.max(u, v));
    }
    if (s0 <= r + 1e-6 && s1 >= r - 1e-6) { lo = Math.min(lo, s0); hi = Math.max(hi, s1); inside = true; }
  }
  return inside ? [Math.max(lo, 0), hi] : [0, Infinity]; // a set without bounds (or a camera not in them yet): bound() decides
}
// macOS keeps a two-finger scroll going for a second or two after the fingers leave the pad, in ever smaller steps.
// Once the steps have shrunk four times in a row (that coast, or fingers slowing down), the camera stops, until a step
// clearly grows again (fingers back on the pad) or a new scroll starts. A mouse wheel's equal steps never coast.
const W = { t: -1e9, a: 0, dir: 0, peak: 0, fall: 0, coast: false };
function coasting(d, t) {
  const a = Math.abs(d), dir = Math.sign(d);
  if (t - W.t > 140 || dir !== W.dir) Object.assign(W, { peak: 0, fall: 0, coast: false });
  else if (W.coast) { if (a > W.a * 1.25 + 0.5) Object.assign(W, { fall: 0, coast: false }); }
  else W.fall = a < W.a ? W.fall + 1 : 0;
  W.peak = Math.max(W.peak, a);
  if (W.fall >= 4 && a < W.peak * 0.7) W.coast = true;
  Object.assign(W, { t, a, dir });
  return W.coast;
}
function setLens(mm) {
  E.camera.fov = fovOf(mm);
  E.camera.updateProjectionMatrix();
  E.camPreset = null;
  E.camShot = null;
  E.needs = true;
  hud(); shotsBar(); scheduleSave();
}
function hud() {
  if (!E.ready) return;
  const p = E.set.cams.find((c) => c.id === E.camPreset);
  const sv = E.camShot && savedStops().find((x) => x.option_id === E.camShot);
  const mm = Math.round(lensOf(E.camera.fov));
  const sel = E.sel ? ` · ${esc(selName())}` : "";
  $(".c3d-hud").innerHTML = `${p ? esc(p.label) : sv ? esc(shotName(sv)) : "Câmera livre"} · ${mm}mm · ${E.camera.position.y.toFixed(2).replace(".", ",")} m${sel}<small class="c3d-saved"> · ${esc(savedLine())}</small>`;
  const s = $(".c3d-tl select");
  if (s && document.activeElement !== s) s.value = String(LENSES.reduce((a, b) => (Math.abs(b - mm) < Math.abs(a - mm) ? b : a)));
  if (E.set?.refs && E.ui.cmp) refImage();
}

// ---------- selection, handles, gizmo ----------
// E.sel = { type: "fig", fig } | { type: "device" } | { type: "handle", fig, h }
const selName = () => (E.sel?.type === "device" ? PRODUCT?.title || "Produto" : E.sel?.fig ? `${E.sel.fig.name}${E.sel.type === "handle" ? ` · ${E.sel.h.label}` : ""}` : "");
function select(sel) {
  E.sel = sel;
  E.gizmo.detach();
  const fig = sel?.fig;
  showHandles(fig && fig.visible ? fig : null);
  if (!sel) { toolbar(); side(); hud(); E.needs = true; return; }
  if (sel.type === "fig") {
    E.gizmo.attach(fig.root);
  } else if (sel.type === "device") {
    E.gizmo.attach(E.device);
  } else if (sel.type === "handle") {
    placeProxy();
    if (["torso", "look"].includes(sel.h.kind)) E.mode = "rotate";
    else if (E.mode === "scale") E.mode = "translate";
    E.gizmo.attach(E.proxy);
  }
  gizmoMode();
  toolbar(); side(); hud();
  E.needs = true;
}
function deselect() { if (E.sel) select(null); }
function gizmoMode() {
  const g = E.gizmo, s = E.sel;
  if (!s) return;
  let mode = E.mode;
  if (s.type === "handle" && mode === "scale") mode = "translate";
  g.setMode(mode);
  g.setSpace(mode === "translate" ? "world" : "local");
  // figures stay upright (turn around y only); their size is one uniform scale
  const fig = s.type === "fig";
  g.showX = !(fig && mode === "rotate"); g.showZ = !(fig && mode === "rotate"); g.showY = true;
  if (mode === "scale") { g.showX = g.showY = g.showZ = true; }
}
function placeProxy() {
  const { fig, h } = E.sel;
  const p = new THREE.Vector3();
  h.at.getWorldPosition(p);
  if (h.off) p.copy(h.at.localToWorld(v3(h.off)));
  E.proxy.position.copy(p);
  E.proxy.quaternion.copy(handleQuat(fig, h));
  E.proxy.updateMatrixWorld(true);
}
function onGizmo() {
  const s = E.sel;
  if (!s) return;
  if (s.type === "fig" && E.mode === "scale") {
    const k = THREE.MathUtils.clamp((s.fig.root.scale.x + s.fig.root.scale.y + s.fig.root.scale.z) / 3, 0.3, 3);
    s.fig.root.scale.setScalar(k);
  }
  if (s.type === "device" && E.mode === "scale") E.device.scale.setScalar(THREE.MathUtils.clamp((E.device.scale.x + E.device.scale.y + E.device.scale.z) / 3, 0.3, 4));
  if (s.type === "handle") {
    if (E.mode === "translate" && ["limb", "hips"].includes(s.h.kind)) dragTo(s.fig, s.h, E.proxy.position.clone());
    else rotateTo(s.fig, s.h, E.proxy.quaternion.clone());
    s.fig.adjusted = true;
  }
  updateHandles();
  E.needs = true;
}
const HCOL = { limb: "#4FE3FF", hips: "#FFE14F", torso: "#FF7AD9", look: "#FF7AD9" };
function showHandles(fig) {
  for (const m of E.handles || []) m.removeFromParent();
  E.handles = [];
  if (!fig) return;
  for (const h of handlePoints(fig)) {
    const m = new THREE.Mesh(h.kind === "hips" ? new THREE.BoxGeometry(1.6, 1.6, 1.6) : new THREE.SphereGeometry(1, 14, 10),
      new THREE.MeshBasicMaterial({ color: HCOL[h.kind], depthTest: false, transparent: true, opacity: 0.92 }));
    m.renderOrder = 999;
    m.userData.handle = { fig, h };
    E.helpers.add(m);
    E.handles.push(m);
  }
  updateHandles();
  sizeHandles();
}
function updateHandles() {
  for (const m of E.handles || []) {
    const { h } = m.userData.handle;
    if (h.off) m.position.copy(h.at.localToWorld(v3(h.off)));
    else h.at.getWorldPosition(m.position);
  }
  if (E.sel?.type === "handle" && !E.gizmo.dragging) placeProxy();
}
function sizeHandles() {
  for (const m of E.handles || []) m.scale.setScalar(Math.max(0.006, m.position.distanceTo(E.camera.position) * 0.011));
}

// ---------- pointer: click to select; drag a handle (IK), a figure or the product; the rest orbits ----------
function bindPointer() {
  const frame = $(".c3d-frame");
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const at = (e) => {
    const r = E.canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, E.camera);
    return ray;
  };
  const hitFig = (r) => {
    const meshes = E.figs.filter((f) => f.visible).flatMap((f) => f.meshes);
    const devMeshes = E.device?.visible ? E.device.children.filter((c) => c.isMesh) : [];
    const hit = r.intersectObjects([...meshes, ...devMeshes], false)[0];
    if (!hit) return null;
    return hit.object.userData.fig ? { type: "fig", fig: hit.object.userData.fig, point: hit.point } : { type: "device", point: hit.point };
  };
  let drag = null;
  frame.addEventListener("pointerdown", (e) => {
    if (!E.ready || e.button !== 0 || e.target !== E.canvas) return;
    E.el.focus({ preventScroll: true });
    if (E.gizmo.axis) return; // the gizmo's own arrow or ring
    const r = at(e);
    const h = E.handles?.length ? r.intersectObjects(E.handles, false)[0] : null;
    if (h) {
      const { fig, h: hp } = h.object.userData.handle;
      const p0 = h.object.position.clone();
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(E.camera.getWorldDirection(new THREE.Vector3()).negate(), p0);
      drag = { kind: "handle", fig, h: hp, plane, x: e.clientX, y: e.clientY, moved: false, q0: handleQuat(fig, hp) };
    } else {
      const f = hitFig(r);
      if (!f) { drag = { kind: "none", x: e.clientX, y: e.clientY }; return; } // let the orbit have it
      const obj = f.type === "fig" ? f.fig.root : E.device;
      const base = obj.getWorldPosition(new THREE.Vector3());
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -base.y);
      const hitP = r.ray.intersectPlane(plane, new THREE.Vector3()) || base.clone();
      drag = { kind: f.type, fig: f.fig, plane, off: base.clone().sub(hitP), x: e.clientX, y: e.clientY, moved: false };
    }
    e.stopPropagation(); // ours: no orbit, no gizmo
    frame.setPointerCapture(e.pointerId);
  }, true);
  frame.addEventListener("pointermove", (e) => {
    if (!drag || drag.kind === "none") return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4) return;
    if (!drag.moved) {
      drag.moved = true;
      if (drag.kind === "handle") select({ type: "handle", fig: drag.fig, h: drag.h });
      else if (drag.kind === "fig") select({ type: "fig", fig: drag.fig });
      else if (drag.kind === "device") select({ type: "device" });
    }
    const r = at(e);
    if (drag.kind === "handle") {
      const hk = drag.h.kind;
      if (hk === "torso" || hk === "look") { // rotate by the mouse: sideways turns, up and down bends
        const dx = (e.clientX - drag.x) * 0.008, dy = (e.clientY - drag.y) * 0.008;
        const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dx);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(drag.fig.root.getWorldQuaternion(new THREE.Quaternion()));
        const pitch = new THREE.Quaternion().setFromAxisAngle(right, -dy);
        rotateTo(drag.fig, drag.h, yaw.multiply(pitch).multiply(drag.q0.clone()));
      } else {
        const p = r.ray.intersectPlane(drag.plane, new THREE.Vector3());
        if (p) dragTo(drag.fig, drag.h, p);
      }
      drag.fig.adjusted = true;
      updateHandles();
    } else {
      const p = r.ray.intersectPlane(drag.plane, new THREE.Vector3());
      if (!p) return;
      const obj = drag.kind === "fig" ? drag.fig.root : E.device;
      const w = p.add(drag.off);
      obj.parent.worldToLocal(w);
      obj.position.set(w.x, obj.position.y, w.z);
      if (obj === E.device && E.device.userData.attach) obj.position.copy(w);
      updateHandles();
    }
    E.needs = true;
  });
  const up = (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.kind === "none") {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) deselect();
      return;
    }
    if (!d.moved) { // a click: select
      if (d.kind === "handle") select({ type: "handle", fig: d.fig, h: d.h });
      else if (d.kind === "fig") select({ type: "fig", fig: d.fig });
      else select({ type: "device" });
    } else commit();
    side(); hud();
  };
  frame.addEventListener("pointerup", up);
  frame.addEventListener("pointercancel", up);
  frame.addEventListener("dblclick", (e) => { // double click: orbit around that point
    if (e.target !== E.canvas) return; // not a double click on the dots or the toolbar
    const r = at(e);
    const hit = r.intersectObjects([E.root, ...E.figs.map((f) => f.root)].filter(Boolean), true)[0];
    if (hit) { E.orbit.target.copy(hit.point); E.orbit.update(); E.needs = true; }
  });
  frame.addEventListener("pointerenter", () => (E.hover = true));
  frame.addEventListener("pointerleave", () => (E.hover = false));
}

// ---------- keys (only while the 3D is on screen and nothing else is typed into) ----------
function onKey(e) {
  if (!E.ready || !E.el?.isConnected || E.ctx.S.lightbox || E.ctx.S.modal) return;
  // the studio over the page owns the keyboard (its prompt is a contenteditable box, not an input)
  if (document.body.classList.contains("est-open") || e.target.isContentEditable) return;
  if (e.target.matches?.("input, textarea, select")) return;
  const k = e.key.toLowerCase();
  // Esc also when the page itself has the focus (the 3D just came up and the pointer has not moved onto it yet)
  const inside = E.hover || E.el.contains(document.activeElement) || E.el.classList.contains("full") || (k === "escape" && document.activeElement === document.body);
  if (!inside) return;
  const mod = e.metaKey || e.ctrlKey;
  const take = () => { e.preventDefault(); e.stopImmediatePropagation(); };
  if (E.tl?.busy != null) { take(); return; } // the scene's video is being made: nothing changes meanwhile
  if (mod && k === "z") { take(); undo(e.shiftKey); return; }
  if (mod) return;
  if (E.tl?.onKey(e, k, take)) return;
  // Esc goes one step back each time: the selection, the name box, the prompt box, a full window opened with ⤢ or F,
  // then out of the 3D as its ✕ does (a render waiting in the studio gets back its angle unchanged). The room's
  // popovers and panel first
  if (k === "escape") {
    const S = E.ctx.S;
    if (S.more || S.dl || S.filt || S.drawer) return;
    take();
    if (E.sel) deselect();
    else if ($(".c3d-savebox")) closeSave();
    else if (E.ask?.open && origin()) { E.ask.open = false; keepAsk(); toolbar(); }
    else if (E.el.classList.contains("full") && E.userFull) full(false);
    else if (held()) { full(false); E.ctx.dropHeld?.(); }
    else leave();
    return;
  }
  if (["g", "r", "s"].includes(k) && E.sel) { take(); E.mode = { g: "translate", r: "rotate", s: "scale" }[k]; gizmoMode(); toolbar(); E.needs = true; return; }
  if (k === "f") { take(); if (E.sel) focusSel(); else full(undefined, true); return; } // with a selection, F frames it
  if (k === "c") { take(); E.ui.cmp = !E.ui.cmp; refImage(); toolbar(); side(); return; }
  if (k === "h") { take(); toggleFig(E.sel?.fig); return; }
  if (/^[1-9]$/.test(k) && E.set.cams[+k - 1]) { take(); setCam(E.set.cams[+k - 1]); return; }
  if (e.key.startsWith("Arrow")) { // nudge the selection (5 cm, 25 with shift) along the floor, as seen from the camera
    take();
    const s = E.sel;
    if (!s && (k === "arrowleft" || k === "arrowright")) return stepStop(k === "arrowright" ? 1 : -1); // nothing selected: the next / previous camera
    if (!s || s.type === "handle") return;
    const obj = s.type === "fig" ? s.fig.root : E.device;
    const step = e.shiftKey ? 0.25 : 0.05;
    const fwd = E.camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
    const rt = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
    const d = { arrowup: e.altKey ? new THREE.Vector3(0, 1, 0) : fwd, arrowdown: e.altKey ? new THREE.Vector3(0, -1, 0) : fwd.clone().negate(), arrowleft: rt.clone().negate(), arrowright: rt }[k];
    const w = obj.getWorldPosition(new THREE.Vector3()).addScaledVector(d, step);
    obj.position.copy(obj.parent.worldToLocal(w));
    updateHandles();
    E.needs = true;
    clearTimeout(E.nudgeT);
    E.nudgeT = setTimeout(commit, 400);
  }
}
function focusSel() {
  const obj = E.sel?.type === "device" ? E.device : E.sel?.fig?.root;
  if (!obj) return;
  const b = new THREE.Box3().setFromObject(obj);
  const c = b.getCenter(new THREE.Vector3());
  const d = E.camera.position.clone().sub(E.orbit.target);
  E.orbit.target.copy(c);
  E.camera.position.copy(c).add(d);
  E.focusing = true; // when a wall stops the camera, it still looks at the selection
  E.orbit.update();
  E.focusing = false;
  E.needs = true;
}
function toggleFig(fig) {
  if (!fig) return;
  fig.visible = !fig.visible;
  fig.root.visible = fig.visible;
  if (!fig.visible && E.sel?.fig === fig) deselect();
  commit();
  E.needs = true;
}

// ---------- overlays: the approved image to compare, thirds, the 9:16 crop, name tags ----------
function refImage() {
  const img = $(".c3d-ref");
  if (!img) return;
  const o = locationRef();
  const u = o ? E.ctx.urls.get(o.preview_path || o.path) : "";
  if (u && img.getAttribute("src") !== u) img.src = u;
  img.hidden = !E.ui.cmp || !u;
  img.style.opacity = E.ui.op;
}
function guides() {
  const g = $(".c3d-guides");
  g.className = `c3d-guides ${E.ui.thirds ? "thirds" : ""} ${E.ui.vert ? "vert" : ""}`;
  g.innerHTML = E.ui.vert ? '<i class="v916"></i>' : "";
}
function tags() {
  const box = $(".c3d-tags");
  if (!box) return;
  if (!E.ui.names) { box.innerHTML = ""; return; }
  const w = E.canvas.clientWidth, h = E.canvas.clientHeight;
  const out = [];
  for (const f of E.figs) {
    if (!f.visible) continue;
    const top = (f.bones?.head || f.joints?.head).localToWorld(new THREE.Vector3(0, f.kind === "human" ? 0.32 : 0.15, 0)).project(E.camera);
    if (top.z > 1 || Math.abs(top.x) > 1.05 || Math.abs(top.y) > 1.05) continue;
    out.push(`<span style="left:${((top.x + 1) / 2) * w}px;top:${((1 - top.y) / 2) * h}px;--c:${f.color}">${esc(f.name)}</span>`);
  }
  box.innerHTML = out.join("");
}

// ---------- toolbar, shots strip, side panel ----------
function toolbar() {
  if (!E.ready) return;
  const B = (k, on, name, tip, icon, extra = "") => `<button data-k="${k}" class="${on ? "on" : ""}" aria-label="${name}" title="${name}${tip ? ` · ${tip}` : ""}" ${extra}>${icon}</button>`;
  const s = !!E.sel;
  const ltOn = s && E.sel.type === "handle" && ["torso", "look"].includes(E.sel.h.kind);
  $(".c3d-tl").innerHTML = `<div class="c3d-g">${B("mode-translate", s && E.mode === "translate", "Mover", "G", I.move, s && !ltOn ? "" : "disabled")}${B("mode-rotate", s && E.mode === "rotate", "Girar", "R", I.rotate, s ? "" : "disabled")}${B("mode-scale", s && E.mode === "scale", "Escala", "S", I.scale, s && E.sel.type !== "handle" ? "" : "disabled")}</div>
    <div class="c3d-g"><select data-k="lens" aria-label="Lente (mm, full frame)" title="Lente em mm (equivalente full frame 35 mm)">${LENSES.map((mm) => `<option value="${mm}">${mm}mm</option>`).join("")}</select>${B("level", false, "Nivelar", "câmera sem inclinação, horizonte reto", I.level)}</div>
    <div class="c3d-g"><button data-k="cmp" class="${E.ui.cmp ? "on" : ""}" aria-label="Comparar com a aprovada (C)">${I.cmp}</button>${E.ui.cmp ? `<input data-k="op" type="range" min="0.1" max="0.9" step="0.05" value="${E.ui.op}" aria-label="Transparência da imagem aprovada">` : ""}${B("thirds", E.ui.thirds, "Terços", "", I.thirds)}${B("vert", E.ui.vert, "Corte 9:16", "o que entra na versão vertical", I.vert)}${B("names", E.ui.names, "Nomes", "", I.tag)}</div>
    <div class="c3d-g">${B("undo", false, "Desfazer", "⌘Z", I.undo, E.history.length > 1 ? "" : "disabled")}${B("redo", false, "Refazer", "⇧⌘Z", I.redo, E.future.length ? "" : "disabled")}${B("reset", false, "Voltar ao original", `${PRODUCT ? "elenco, produto" : "elenco"} e câmera como o set começou`, I.reset)}</div>`;
  const isFull = E.el.classList.contains("full"), h = held(), to = origin();
  const escFull = isFull && E.userFull; // Esc leaves a full window opened with ⤢ or F first, else the 3D itself
  // Renderizar (opened from a shot's card): the angle, and its render on that card, in one click; Salvar ângulo steps back.
  // The button before it opens the prompt box under the row (the text goes in the render while the box is open)
  const ai = !!E.ctx?.ai, a = to && askFor(to);
  const ask = to && ai ? `<button class="c3d-round${a.open ? " on" : a.text.trim() ? " has" : ""}" data-k="ask" aria-pressed="${a.open}" title="${a.open ? "Fechar o prompt: o render volta a ser só a receita do blocking" : `Prompt do render: escrever o que mudar além do blocking${a.text.trim() ? " (tem um texto guardado pra este card)" : ""}`}" aria-label="Prompt do render">${I.text}</button>` : "";
  const render = to && ai ? `<button class="c3d-save c3d-render" data-k="render" title="Salvar o que está na moldura como um ângulo novo e já mandar o render do blocking (Nano Banana 2.1, 2K) pro card ${esc(to.title)}${a.open ? ", com o prompt da caixa" : ""}: entra lá como uma variação nova, e a sala volta pro card">${I.spark}<span>Renderizar</span></button>` : "";
  // ✕: out of the 3D, back to the page it was opened from (a render waiting in the studio has its own way back)
  const close = h ? "" : `<button class="c3d-round" data-k="close" title="Fechar a Cena 3D e voltar ${to ? `pro card ${esc(to.title)}` : "pra página de onde veio"}${escFull ? "" : " (Esc)"}" aria-label="Fechar a Cena 3D">${I.x}</button>`;
  // the row is drawn again each time; the prompt box under it stays (it may be being typed in)
  const tr = $(".c3d-tr");
  if (!tr.querySelector(".c3d-trrow")) tr.innerHTML = `<div class="c3d-trrow"></div><div class="c3d-ask" hidden><textarea data-k="ask-text" rows="2" maxlength="600" placeholder="O que mudar no render, além do blocking: ele olha pra trás, mais neblina, a câmera mais perto…" aria-label="Prompt do render"></textarea>
      <div class="c3d-ask-foot"><span class="c3d-seg" role="group" aria-label="Quanto o render segue o blocking"><button data-k="ask-loose" data-v="0" title="Fiel: câmera, enquadramento, poses e olhares como no blocking (menos o que o texto mudar)">Fiel</button><button data-k="ask-loose" data-v="1" title="Solto: o blocking só guia a composição; poses, gestos, olhares e o enquadramento exato podem mudar pra cena ficar natural">Solto</button></span><small>⌘↵ renderiza</small></div></div>`;
  $(".c3d-trrow").innerHTML = `${h ? `<button class="c3d-back" data-k="held-back" title="Voltar pro render sem mudar o ângulo (Esc)">${I.back}<span>${esc(h.title)}</span></button>` : ""}<button class="c3d-round" data-k="full" title="${isFull ? `Sair da janela inteira${escFull ? " (Esc)" : ""}` : "3D na janela inteira (F)"}" aria-label="${isFull ? "Sair da janela inteira" : "3D na janela inteira"}">${isFull ? I.unfull : I.full}</button><span class="c3d-sacts"></span><button class="c3d-save${to ? " alt" : ""}" data-k="save" title="${h ? "Salvar o que está na moldura como um ângulo novo e voltar pro render com ele: o texto e as referências ficam como estavam" : `Salvar o que está na moldura como uma opção nova da locação (PNG 1920×1080, sem ✓: ${CLIENT} não vê)`}">${I.shot}<span>${h ? "Salvar e voltar" : "Salvar ângulo"}</span></button>${ask}${render}${close}`;
  syncAsk();
  shotActs();
  hud();
}
// the tools on the left wrap short of what sits on the right (the row, the name box, the prompt box: --trw, cena3d.css)
function trw() { const w = $(".c3d-tr")?.offsetWidth; if (w) E.el.style.setProperty("--trw", `${w}px`); }
// The camera stops, as dots over the bottom of the view that show while the pointer is on the 3D: the planned shots,
// then, hollow and a little apart, the angles saved in this set (blocking_shots, newest last, not the ✕ ones). Hovering
// a dot names it (a saved angle also shows its frame); a click flies the camera there; ← → go through all of them. A
// saved angle's whole scene (cast poses and the product) comes back with ↺ on its tile in the panel.
function savedStops() {
  const ok = new Map(shotOpts().map((o) => [o.id, o]));
  return E.shots.filter((s) => ok.has(s.option_id) && s.camera).map((s) => ({ ...s, opt: ok.get(s.option_id) }))
    .sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
}
const shotName = (s) => s.opt?.caption || s.opt?.name || "Ângulo salvo";
const stops = () => [...E.set.cams.map((c) => ({ kind: "preset", id: c.id, c })), ...savedStops().map((s) => ({ kind: "saved", id: s.option_id }))];
// rows saved since the set opened (by someone else, in another tab) come in as the room brings their options
function syncShots() {
  const have = new Set(E.shots.map((s) => s.option_id));
  const miss = shotOpts().map((o) => o.id).filter((id) => !have.has(id) && !E.asked.has(id));
  if (!miss.length) return;
  miss.forEach((id) => E.asked.add(id));
  const item = E.itemId;
  E.ctx.sb.from("blocking_shots").select("*").in("option_id", miss).then(({ data }) => {
    if (E.itemId !== item || !data?.length) return;
    E.shots.push(...data.filter((r) => !E.shots.some((x) => x.option_id === r.option_id)));
    shotsBar(); side();
  });
}
function shotsBar() {
  if (!E.ready) return;
  syncShots();
  const dot = (k, v, on, name, cls = "") => `<button data-k="${k}" data-v="${esc(v)}" class="${cls}${on ? " on" : ""}" aria-label="${esc(name)}"></button>`;
  const presets = [...E.set.cams.filter((c) => !c.alt), ...E.set.cams.filter((c) => c.alt)].map((c) => dot("cam", c.id, E.camPreset === c.id, `${c.label} · ${c.lens}mm`, c.alt ? "alt" : "")).join("");
  const mine = savedStops().map((s) => dot("shotcam", s.option_id, E.camShot === s.option_id, `${shotName(s)} · ${s.camera.lens_mm}mm`, "sv")).join("");
  const bar = $(".c3d-dots");
  bar.innerHTML = presets + mine;
  const miss = savedStops().map((x) => x.opt).filter((o) => !thumbOf(o) && !E.signed.has(o.id));
  if (miss.length) { miss.forEach((o) => E.signed.add(o.id)); E.ctx.sign(miss.map((o) => o.thumb_path || o.preview_path || o.path)); }
  shotActs();
  E.el.style.setProperty("--dotsw", `${bar.offsetWidth}px`); // the camera line (bottom left) stops short of them
  peek(null); // the dot under the pointer was just drawn again: its name comes back as the pointer moves
}
// a small label over a dot (a saved angle's also shows its frame), or under the compare button: the approved photo
// the set copies, the only place it is shown (C puts it over the 3D)
const refName = () => (E.set.refs ? (E.set.inside(E.camera.position.toArray()) ? "Aprovada · dentro" : "Aprovada · fora") : "Locação aprovada");
function peek(b) {
  const box = $(".c3d-peek");
  if (!b) { box.hidden = true; return; }
  let img = null, text = b.getAttribute("aria-label"), sub = "";
  if (b.dataset.k === "cam") sub = E.set.cams.find((c) => c.id === b.dataset.v)?.title || ""; // what the shot tells
  if (b.dataset.k === "shotcam") { const s = savedStops().find((x) => x.option_id === b.dataset.v); if (s) img = thumbOf(s.opt); }
  if (b.dataset.k === "cmp") { const o = locationRef(); img = o ? thumbOf(o) : ""; text = `${refName()} · ${E.ui.cmp ? "por cima do 3D" : "C põe por cima do 3D"}`; }
  box.className = `c3d-peek${img !== null ? " wide" : sub ? " card" : ""}`;
  box.innerHTML = `${img !== null ? (img ? `<img src="${esc(img)}" alt="">` : '<span class="c3d-peek-none"></span>') : ""}<b>${esc(text)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}`;
  box.hidden = false;
  const f = $(".c3d-frame").getBoundingClientRect(), r = b.getBoundingClientRect();
  box.style.left = `${Math.max(6, Math.min(r.left + r.width / 2 - f.left - box.offsetWidth / 2, f.width - (E.side || 0) - box.offsetWidth - 6))}px`;
  box.style.top = b.dataset.k === "cmp" ? `${r.bottom - f.top + 6}px` : `${r.top - f.top - box.offsetHeight - 4}px`;
}
// next to Salvar ângulo, while the camera is on a saved angle: ↺ its scene back (cast poses and product), ✦ render it
function shotActs() {
  const box = $(".c3d-sacts");
  if (!box) return;
  const id = E.camShot && savedStops().some((x) => x.option_id === E.camShot) ? E.camShot : null;
  box.innerHTML = id ? `<button class="c3d-round" data-k="shotall" data-v="${id}" title="Voltar a cena deste ângulo: poses do elenco${PRODUCT ? " e o produto" : ""}" aria-label="Voltar a cena deste ângulo">${I.reset}</button>${E.ctx?.ai ? `<button class="c3d-round" data-k="studio" data-v="${id}" title="Render com IA no estúdio: a locação e o elenco aprovados vestem este blocking" aria-label="Render com IA">${I.spark}</button>` : ""}` : "";
  trw();
}
function stepStop(d) {
  const list = stops();
  if (!list.length) return;
  let i = list.findIndex((x) => (x.kind === "preset" ? x.id === E.camPreset : x.id === E.camShot));
  i = i < 0 ? (d > 0 ? 0 : list.length - 1) : (i + d + list.length) % list.length;
  const x = list[i];
  if (x.kind === "preset") { E.camShot = null; setCam(x.c); shotsBar(); side(); }
  else goShot(x.id);
}
// The panel holds only what is in the scene: the cast (a row each, the pose right on it) and the product. The
// approved photo is on the compare button, the saved angles are the dots, their actions sit by Salvar ângulo.
function side() {
  if (!E.ready) return;
  const fig = E.sel?.fig;
  const castRow = (f) => {
    const ci = castItem(f.itemTitle || "");
    const o = ci && approvedOf(ci)[0];
    const on = fig === f;
    const poses = presetsOf(f), plain = !f.adjusted && poses.some(([k]) => k === f.preset);
    const now = plain ? "" : `<option value="" selected>${esc(poseLabel(f) ? `${poseLabel(f)} · ajustada` : "Pose livre")}</option>`;
    const hint = f.kind === "human" ? "Arraste as bolinhas: azuis, mãos e pés · amarela, quadril (abaixe para sentar) · rosas, tronco e cabeça. Clique numa para usar as setas." : "Arraste a bolinha rosa para virar a cabeça.";
    return `<div class="c3d-row ${on ? "on" : ""} ${f.visible ? "" : "off"}" data-k="sel-fig" data-v="${esc(f.key)}">
      <span class="c3d-dot" style="--c:${f.color}"></span>${o ? `<img src="${esc(thumbOf(o))}" alt="">` : '<span class="c3d-noimg"></span>'}<b class="c3d-name" title="${esc(f.name)}">${esc(f.name)}</b>
      <select data-k="pose" data-v="${esc(f.key)}" aria-label="Pose de ${esc(f.name)}">${now}${poses.map(([k, l]) => `<option value="${k}" ${plain && f.preset === k ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>
      <button class="c3d-ico" data-k="vis-fig" data-v="${esc(f.key)}" title="${f.visible ? "Esconder (H)" : "Mostrar"}" aria-label="${f.visible ? "Esconder" : "Mostrar"}">${f.visible ? I.eye : I.eyeOff}</button></div>
      ${on ? `<div class="c3d-more"><p class="c3d-hint">${hint}</p><div class="c3d-acts"><button data-k="pose-reset">Refazer a pose</button>${f.key.startsWith("extra:") ? `<button data-k="del-fig">Tirar da cena</button>` : ""}</div></div>` : ""}`;
  };
  const dev = E.device, devApproved = deviceItem() && approvedOf(deviceItem())[0];
  const att = dev.userData.attach, at = att ? `${att.key}|${att.bone}` : "";
  const attachOpts = [["", "Solto no set"], ...E.figs.filter((f) => f.kind === "human").flatMap((f) => [[`${f.key}|rHand`, `Mão direita · ${f.name}`], [`${f.key}|lHand`, `Mão esquerda · ${f.name}`], [`${f.key}|chest`, `Colo · ${f.name}`]])];
  const extras = sameScene(E.item).filter((x) => x.kind === "casting" && approvedOf(x).length);
  const props = (E.props || []).map((p) => {
    const who = p.spec.attach && figOf(castKey(p.spec.attach.cast));
    return `<div class="c3d-row c3d-obj ${p.visible ? "" : "off"}"><span class="c3d-sw" style="--c:${p.spec.color || "#9AA19C"}"></span><b class="c3d-name">${esc(p.spec.name)}${who ? ` <small>${esc(who.name)}</small>` : ""}</b>
      <button class="c3d-ico" data-k="vis-prop" data-v="${esc(p.key)}" title="${p.visible ? "Esconder" : "Mostrar"}" aria-label="${p.visible ? "Esconder" : "Mostrar"} ${esc(p.spec.name)}">${p.visible ? I.eye : I.eyeOff}</button></div>`;
  }).join("");
  $(".c3d-body").innerHTML = `
    <section class="c3d-sec"><header><h4>Elenco</h4><button class="c3d-ico" data-k="add" title="Pôr mais um boneco na cena" aria-label="Adicionar boneco">${I.plus}</button></header>
      ${E.figs.map(castRow).join("")}
      ${E.adding ? `<div class="c3d-add">${extras.map((x) => `<button data-k="add-cast" data-v="${esc(x.title)}">${esc(x.title)}</button>`).join("")}<button data-k="add-cast" data-v="">Figurante</button></div>` : ""}
    </section>
    ${PRODUCT ? `<section class="c3d-sec">
      <div class="c3d-row ${E.sel?.type === "device" ? "on" : ""} ${dev.visible ? "" : "off"}" data-k="sel-dev">${devApproved ? `<img src="${esc(thumbOf(devApproved))}" alt="">` : '<span class="c3d-noimg"></span>'}<b class="c3d-name">${esc(PRODUCT.title)}${dev.userData.height ? ` <small>${String(round(dev.userData.height * 100, 1)).replace(".", ",")} cm</small>` : ""}</b>
        <button class="c3d-ico" data-k="vis-dev" title="${dev.visible ? "Esconder" : "Mostrar"}" aria-label="${dev.visible ? "Esconder" : "Mostrar"}">${dev.visible ? I.eye : I.eyeOff}</button></div>
      <div class="c3d-two">${LED_STATES.length > 1 ? `<select data-k="led" aria-label="Estado do produto">${LED_STATES.map(([k, l]) => `<option value="${k}" ${dev.userData.led === k ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>` : ""}
        <select data-k="attach" aria-label="Onde está o produto" title="${esc(attachOpts.find(([k]) => k === at)?.[1] || "")}">${attachOpts.map(([k, l]) => `<option value="${esc(k)}" ${k === at ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div>
    </section>` : ""}
    ${props ? `<section class="c3d-sec"><header><h4>Objetos</h4></header>${props}</section>` : ""}`;
}
function bindUi() {
  E.el.addEventListener("click", (e) => {
    const t = e.target.closest("[data-k]");
    if (!t || !E.el.contains(t) || t.tagName === "SELECT" || t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
    const k = t.dataset.k, v = t.dataset.v;
    if (k.startsWith("mode-")) { E.mode = k.slice(5); gizmoMode(); toolbar(); E.needs = true; }
    else if (k === "ask" && E.ask) { // the prompt box opens on its text, the caret at the end
      E.ask.open = !E.ask.open;
      keepAsk(); toolbar();
      const ta = $(".c3d-ask textarea");
      if (E.ask.open && ta) { ta.focus({ preventScroll: true }); ta.setSelectionRange(ta.value.length, ta.value.length); } else E.el.focus({ preventScroll: true });
    }
    else if (k === "ask-loose" && E.ask) { E.ask.loose = v === "1"; keepAsk(); syncAsk(); }
    else if (k === "level") { E.orbit.target.y = E.camera.position.y; E.orbit.update(); E.needs = true; scheduleSave(); }
    else if (k === "cmp") { E.ui.cmp = !E.ui.cmp; refImage(); toolbar(); side(); }
    else if (k === "full") full(undefined, true);
    else if (k === "close") leave();
    else if (k === "render") doSave(origin());
    else if (k === "side-x") setSide(!sideOpen());
    else if (k === "thirds") { E.ui.thirds = !E.ui.thirds; guides(); toolbar(); }
    else if (k === "vert") { E.ui.vert = !E.ui.vert; guides(); toolbar(); }
    else if (k === "names") { E.ui.names = !E.ui.names; toolbar(); E.needs = true; }
    else if (k === "undo") undo();
    else if (k === "redo") undo(true);
    else if (k === "save") savePrompt();
    else if (k === "cam") { const c = E.set.cams.find((x) => x.id === v); if (c) { E.camShot = null; setCam(c); shotsBar(); side(); } }
    else if (k === "sel-fig" && !e.target.closest("[data-k=vis-fig]")) { const f = figOf(v); if (f) { if (!f.visible) toggleFig(f); select({ type: "fig", fig: f }); } }
    else if (k === "vis-fig") toggleFig(figOf(v));
    else if (k === "sel-dev") { if (!E.device.visible) { E.device.visible = true; commit(); } select({ type: "device" }); }
    else if (k === "vis-dev") { E.device.visible = !E.device.visible; if (!E.device.visible && E.sel?.type === "device") deselect(); commit(); side(); E.needs = true; }
    else if (k === "add") { E.adding = !E.adding; side(); }
    else if (k === "add-cast") addExtra(v);
    else if (k === "pose-reset" && E.sel?.fig) { applyPreset(E.sel.fig, E.sel.fig.preset); E.sel.fig.adjusted = false; fitProps(E.sel.fig); showHandles(E.sel.fig); commit(); E.needs = true; }
    else if (k === "vis-prop") { const p = E.props.find((x) => x.key === v); if (p) { p.visible = !p.visible; p.obj.visible = p.visible; commit(); E.needs = true; } }
    else if (k === "del-fig" && E.sel?.fig) { const f = E.sel.fig; deselect(); f.root.removeFromParent(); E.figs = E.figs.filter((x) => x !== f); commit(); E.needs = true; }
    else if (k === "shotcam") goShot(v);
    else if (k === "shotall") goShot(v, true);
    else if (k === "held-back") { full(false); E.ctx.dropHeld?.(); }
    else if (k === "studio") (full(false), import("../estudio.js")).then((m) => m.openStudio(E.ctx, { optionId: v })).catch((err) => { console.error(err); E.ctx.toast("O estúdio não abriu.", true); });
    else if (k === "reset") { if (confirm(`Voltar o set ao original? O elenco${PRODUCT ? ", o produto" : ""} e a câmera voltam para onde estavam no começo (dá para desfazer).`)) { applyState(defaults()); commit(); toolbar(); side(); shotsBar(); } }
    else if (k === "save-go") doSave();
    else if (k === "save-x") closeSave();
  });
  E.el.addEventListener("change", (e) => {
    const t = e.target, k = t.dataset.k;
    if (k === "lens") setLens(+t.value);
    else if (k === "pose" && t.value) { // the pose on a cast row (that figure, selected or not)
      const f = figOf(t.dataset.v) || E.sel?.fig;
      if (f) { applyPreset(f, t.value); f.adjusted = false; fitProps(f); if (E.sel?.fig === f) showHandles(f); commit(); E.needs = true; }
    }
    else if (k === "led") { setLed(E.device, t.value); commit(); E.needs = true; }
    else if (k === "attach") attachDevice(t.value);
  });
  E.el.addEventListener("input", (e) => {
    const k = e.target.dataset.k;
    if (k === "op") { E.ui.op = +e.target.value; refImage(); }
    else if (k === "ask-text" && E.ask) { E.ask.text = e.target.value; keepAsk(); fitAsk(e.target); }
  });
  const tl = $(".c3d-tl"); // the compare button shows the approved photo while hovered
  tl.addEventListener("mouseover", (e) => { const b = e.target.closest('[data-k="cmp"]'); if (b) peek(b); });
  tl.addEventListener("mouseout", (e) => { if (e.target.closest('[data-k="cmp"]') && !e.relatedTarget?.closest?.('[data-k="cmp"]')) peek(null); });
  const dots = $(".c3d-dots");
  dots.addEventListener("mouseover", (e) => peek(e.target.closest("button")));
  dots.addEventListener("mouseleave", () => peek(null));
  dots.addEventListener("focusin", (e) => peek(e.target.closest("button")));
  dots.addEventListener("focusout", () => peek(null));
  E.el.addEventListener("keydown", (e) => {
    if (e.target.dataset.k === "save-name") {
      if (e.key === "Enter") { e.preventDefault(); doSave(); }
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeSave(); }
    }
    // the prompt box: ⌘↵ renders; Esc leaves the text (the box stays open, the next Esc closes it)
    if (e.target.dataset.k === "ask-text") {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); e.stopPropagation(); doSave(origin()); }
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); E.el.focus({ preventScroll: true }); }
    }
  });
}
function addExtra(title) {
  E.adding = false;
  const n = E.figs.filter((f) => f.key.startsWith("extra:")).length + 1;
  const name = title ? (E.figs.some((f) => f.itemTitle === title) ? `${title} ${n + 1}` : title) : `Figurante ${n}`;
  // an animal when the set's cast says so for that item (kind "bear", "squirrel"); everyone else is a mannequin
  const c = { key: `extra:${name}`, item: title || "", name, kind: (title && E.set.cast.find((x) => x.item === title)?.kind) || "human", color: title ? COLORS[(E.figs.length) % COLORS.length] : "#9AA19C", visible: true,
    pos: E.orbit.target.clone().setY(0).toArray(), ry: 0, scale: 1, preset: undefined, height: 1.75 };
  const f = addFigure(c);
  f.root.lookAt(E.camera.position.x, 0, E.camera.position.z);
  commit();
  select({ type: "fig", fig: f });
}
function attachDevice(v) {
  const d = E.device;
  if (!v) { (E.deck || E.scene).attach(d); d.userData.attach = null; }
  else {
    const [key, bone] = v.split("|");
    const f = figOf(key);
    const b = f?.bones?.[bone];
    if (!b) return;
    b.add(d);
    // in the lap: in front of the chest; in a hand: on the palm. Either way upright, facing where the figure faces
    d.position.set(...(bone === "chest" ? [0, -0.06, 0.2] : [0, -0.11, 0.02]));
    f.root.updateMatrixWorld(true);
    d.quaternion.copy(b.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(f.root.getWorldQuaternion(new THREE.Quaternion())));
    d.userData.attach = { key, bone };
  }
  commit(); side(); E.needs = true;
}

// ---------- saved angles ----------
function goShot(optionId, all = false, now = false) {
  const row = E.shots.find((s) => s.option_id === optionId);
  if (!row?.camera) return E.ctx.toast("Este ângulo não tem a câmera salva.", true);
  if (all) restoreScene(row);
  setCam({ pos: row.camera.position, target: row.camera.target, lens: row.camera.lens_mm, preset: null }, now);
  E.from = row.camera.from_preset || row.camera.preset || null;
  E.camShot = optionId;
  shotsBar(); side(); hud();
}
function restoreScene(row) {
  const st = state();
  for (const c of row.cast || []) {
    const f = figOf(c.key || `${c.item_title || ""}:${c.name}`) || E.figs.find((x) => x.name === c.name);
    if (!f) continue;
    const s = st.cast.find((x) => x.key === f.key);
    Object.assign(s, { visible: true, pos: c.position || s.pos, ry: c.rotation_y ?? s.ry, scale: c.scale || s.scale, pose: c.pose || s.pose });
  }
  st.cast.forEach((s) => { if (!(row.cast || []).some((c) => c.key === s.key || c.name === s.name)) s.visible = false; });
  if (row.device) Object.assign(st.device, { visible: true, attach: row.device.attach || null, pos: row.device.local_position || row.device.position, rot: row.device.local_rotation || row.device.rotation, scale: row.device.scale || 1, led: row.device.led || st.device.led });
  else st.device.visible = false;
  applyState(st);
  commit(); toolbar();
}
function savePrompt() {
  if ($(".c3d-savebox")) return closeSave();
  const p = E.set.cams.find((c) => c.id === E.camPreset);
  const def = p ? (p.id.startsWith("aprovada") ? `Blocking · ${p.label}` : `${p.label.split(" · ")[0]} · ${p.title.split(" · ")[0]}`) : `Ângulo ${shotOpts().length + 1}`;
  $(".c3d-trrow").insertAdjacentHTML("afterend", `<div class="c3d-savebox"><input data-k="save-name" value="${esc(def)}" maxlength="90" aria-label="Nome do ângulo"><button data-k="save-go" class="go">Salvar</button><button data-k="save-x" class="c3d-ico" aria-label="Cancelar">${I.x}</button></div>`);
  trw();
  const i = $(".c3d-savebox input");
  i.focus(); i.select();
}
function closeSave() { $(".c3d-savebox")?.remove(); trw(); E.el.focus({ preventScroll: true }); }
// where something sits in the frame, 0–1 from the top left
function boxOf(obj) {
  const b = new THREE.Box3().setFromObject(obj);
  if (b.isEmpty()) return null;
  const pts = [];
  for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) pts.push(new THREE.Vector3(x, y, z).project(E.camera));
  if (pts.every((p) => p.z > 1)) return null;
  const xs = pts.map((p) => (p.x + 1) / 2), ys = pts.map((p) => (1 - p.y) / 2);
  const c = (v) => round(Math.max(0, Math.min(1, v)));
  const out = { x0: c(Math.min(...xs)), y0: c(Math.min(...ys)), x1: c(Math.max(...xs)), y1: c(Math.max(...ys)) };
  return out.x1 - out.x0 < 0.001 || out.y1 - out.y0 < 0.001 ? null : out;
}
// to: the shot's card of Renderizar (origin()); the angle is named after it and counts as its shot (from_preset)
async function doSave(to = null) {
  const name = to ? to.title : ($(".c3d-savebox input")?.value || "").trim() || "Ângulo";
  // with the prompt box open, its text and Fiel / Solto go in the render
  const how = to && E.ask?.id === to.id && E.ask.open ? { ask: E.ask.text.trim(), loose: E.ask.loose } : {};
  closeSave();
  if (E.busy) return;
  E.busy = true;
  const btn = $(to ? ".c3d-render" : ".c3d-save");
  btn?.classList.add("busy");
  try {
    const { ctx } = E;
    // render the frame without the helpers, at 1920×1080
    E.gizmo.getHelper().visible = false;
    for (const m of E.handles || []) m.visible = false;
    E.camera.clearViewOffset(); // the shot is what is in the frame, nothing around it
    const r = E.renderer, size = r.getSize(new THREE.Vector2()), pr = r.getPixelRatio();
    r.setPixelRatio(1);
    r.setSize(SHOT[0], SHOT[1], false);
    r.render(E.scene, E.camera);
    const png = new Promise((ok) => r.domElement.toBlob(ok, "image/png")); // the bitmap is taken now; the size comes back at once
    // where the cast and the product sit in that frame (0–1 from its top left), measured with the same camera
    const boxes = new Map(E.figs.map((f) => [f, f.visible ? boxOf(f.root) : null]));
    const devBox = PRODUCT && E.device.visible ? boxOf(E.device) : null;
    r.setPixelRatio(pr);
    r.setSize(size.x, size.y, false);
    fit(); // the view around the frame again
    // what the picture shows, read now with it (the file takes a moment; the camera may move meanwhile)
    const it = E.item, V = ctx.roundOf(it.round_id)?.version || 1;
    const loc = locationRef();
    const mm = round(lensOf(E.camera.fov), 1);
    const cast = E.figs.filter((f) => boxes.get(f)).map((f) => {
      const ci = f.itemTitle ? castItem(f.itemTitle) : null;
      const o = ci && approvedOf(ci)[0];
      return { key: f.key, item_id: ci?.id || null, option_id: o?.id || null, name: f.name, kind: f.kind, color: f.color, height: f.height || null,
        pose: { ...poseOf(f), label: poseLabel(f), adjusted: !!f.adjusted }, position: arr(f.root.position), rotation_y: round(f.root.rotation.y / D2R, 2), scale: round(f.root.scale.x), box: boxes.get(f),
        props: (E.props || []).filter((p) => p.visible && p.spec.attach && castKey(p.spec.attach.cast) === f.key).map((p) => p.spec.name) };
    });
    const d = E.device;
    const dq = d.getWorldQuaternion(new THREE.Quaternion()), de = new THREE.Euler().setFromQuaternion(dq);
    const devApproved = deviceItem() && approvedOf(deviceItem())[0];
    const device = devBox ? { position: arr(d.getWorldPosition(new THREE.Vector3()), 4), rotation: [de.x, de.y, de.z].map((a) => round(a / D2R, 2)), scale: round(d.scale.x),
      attach: d.userData.attach, local_position: arr(d.position, 4), local_rotation: [d.rotation.x, d.rotation.y, d.rotation.z].map((a) => round(a / D2R, 2)),
      led: d.userData.led, option_id: devApproved?.id || null, box: devBox } : null;
    const preset = E.set.cams.find((c) => c.id === E.camPreset);
    const from = (to && E.set.cams.find((c) => c.id === to.variants?.shot)) || E.set.cams.find((c) => c.id === E.from);
    const camera = { position: arr(E.camera.position), target: arr(E.orbit.target), fov: round(E.camera.fov, 3), lens_mm: mm, aspect: "16:9", preset: preset?.id || null, preset_title: preset?.title || null,
      from_preset: from?.id || null, from_title: from?.title || null }; // the last planned shot visited, even if the camera moved since (Renderizar: the card's)
    const blob = await png;
    E.gizmo.getHelper().visible = true;
    for (const m of E.handles || []) m.visible = true;
    E.needs = true;
    flash();
    if (!blob) throw new Error("o quadro não foi gerado");
    const file = new File([blob], `blocking-${slug(name)}.png`, { type: "image/png" });
    const m = await ctx.putFile(`items/${it.id}`, file);
    const who = cast.map((c) => `${c.name} (${c.pose.label.toLowerCase()})`).join(", ");
    const { data: o, error } = await ctx.sb.from("options").insert({
      item_id: it.id, path: m.path, preview_path: m.preview_path, thumb_path: m.thumb_path, mime: m.mime, name: m.name,
      created_by: ctx.myName(), version: V, model: MODEL, caption: name,
      reasoning: `Blocking 3D da locação aprovada · ${mm}mm, câmera a ${camera.position[1].toFixed(2).replace(".", ",")} m${who ? ` · ${who}` : ""}${device ? ` · ${String(PRODUCT.title).toLowerCase()} em cena` : ""}.`,
    }).select().single();
    if (error) throw error;
    const shot = { option_id: o.id, item_id: it.id, scene: it.scene, camera, cast, location_option: loc?.id || null, device, created_by: ctx.myName() };
    const r2 = await ctx.sb.from("blocking_shots").insert(shot);
    if (r2.error) throw r2.error;
    E.shots.unshift({ ...shot, created_at: new Date().toISOString() });
    E.camPreset = null;
    E.camShot = o.id;
    await ctx.refresh();
    await ctx.sign([o.thumb_path || o.preview_path || o.path]);
    side(); shotsBar(); hud();
    if (held()) { full(false); await ctx.takeAngle(o.id); return; }
    // Renderizar: the studio's blocking recipe runs on the new angle at once (estudio.js renderBlocking) and its result
    // lands on the card as a variation of its own; the room goes back to that card, which shows the render running
    if (to) {
      try { await ctx.renderBlocking(o.id, to.id, how); }
      catch (err) { console.error(err); ctx.toast(`O ângulo salvou, mas o render não saiu${err?.message ? `: ${err.message}` : ""}.`, true); return; }
      leave(to, true);
      ctx.toast(`✦ Renderizando ${to.title}${how.ask ? " com o seu texto" : ""}${how.loose ? ", solto do blocking" : ""}: entra no card como uma variação nova`);
      return;
    }
    ctx.toast(`Ângulo salvo nas versões da locação (sem ✓: ${CLIENT} não vê)`);
  } catch (e) {
    console.error(e);
    E.ctx.toast(`O ângulo não salvou${e?.message ? `: ${e.message}` : ""}.`, true);
  } finally {
    E.busy = false;
    E.el.querySelectorAll(".c3d-save.busy").forEach((b) => b.classList.remove("busy"));
  }
}
// the timeline's Exportar a cena: the scene's blocking videos (video.js), with the cast, without it (the set and the
// camera only) or both, go to the scene's card in the animation round (the set's cut.card), else to this location's
// card; the 3D does not take clicks or keys until they are done
const exportCard = () => (E.set?.cut?.card && E.ctx.itemOf(E.set.cut.card)) || E.item;
async function runExport(which = "both") {
  if (E.busy || !E.tl?.has()) return;
  const runs = which === "cast" ? [true] : which === "set" ? [false] : [true, false], done = [];
  E.busy = true;
  E.el.classList.add("exporting");
  try {
    for (const [i, cast] of runs.entries()) {
      const label = runs.length > 1 ? `${i + 1} de ${runs.length}` : "";
      E.tl.progress(i / runs.length, label);
      done.push(await exportScene(E, { MODEL, PRODUCT, LED_STATES, slug, card: exportCard }, { cast }, (p) => E.tl.progress((i + p) / runs.length, label)));
    }
    E.ctx.toast(`${done.length > 1 ? `Os ${done.length} vídeos da cena entraram` : `O vídeo da cena ${runs[0] ? "com" : "sem"} o elenco entrou`} no card ${done[0].card.title} (Blocking 3D, sem ✓: ${CLIENT} não vê)`);
  } catch (e) {
    console.error(e);
    E.ctx.toast(`${done.length ? "Um vídeo entrou, mas o outro" : "O vídeo da cena"} não saiu${e?.message ? `: ${e.message}` : ""}.`, true);
  } finally {
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1") E.lastExport = done; // local checks only
    E.busy = false;
    E.el.classList.remove("exporting");
    E.tl.progress(null);
  }
}
// the 3D over the whole window (⤢, or F with nothing selected); Esc or ⤡ puts it back in the page. user: opened with
// ⤢ or F, so Esc leaves the full window first; the one a waiting render opens is the 3D itself, and Esc leaves it whole
function full(on = !E.el.classList.contains("full"), user = false) {
  E.el.classList.toggle("full", on);
  E.userFull = on && user;
  toolbar();
  fit();
  E.el.focus({ preventScroll: true });
}
// out of the 3D (✕, Esc, Renderizar): the room goes back to the page it was opened from, at the same scroll (app.js
// leave3d), else to the shot's card that opened it; lit: the card a render went to comes into view, lit for a moment
function leave(card = origin(), lit = false) {
  full(false);
  E.ctx.leave3d?.(card?.id || null, lit);
}
// the panel folds into its one round button (remembered on this computer)
const SIDE_KEY = "sala-c3d-side";
function sideOpen() { try { return localStorage.getItem(SIDE_KEY) !== "closed"; } catch { return true; } }
function sideX(open) {
  E.el.classList.toggle("side-closed", !open);
  const x = $(".c3d-side-x");
  x.innerHTML = open ? I.fold : I.person;
  x.title = open ? `Recolher o elenco${PRODUCT ? " e o produto" : ""}` : `Elenco${PRODUCT ? " e produto" : ""}`;
  x.setAttribute("aria-label", x.title);
}
function setSide(open) {
  try { localStorage.setItem(SIDE_KEY, open ? "open" : "closed"); } catch {}
  sideX(open);
  fit();
}
function flash() {
  const f = $(".c3d-flash");
  f.style.opacity = 0.7;
  setTimeout(() => (f.style.opacity = 0), 130);
}
