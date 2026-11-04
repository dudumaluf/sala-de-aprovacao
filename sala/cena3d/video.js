// Cena 3D · the scene's blocking video (the animation round). The timeline is rendered frame by frame at 24 fps and
// 1280×720, the shots cut where the cut cuts them, with nothing of the editor in the picture (no gizmo, handles, frame
// or names); with the cast, or without it (the set and the camera only, opts.cast false). It is encoded to H.264 with WebCodecs and muxed to MP4, with no sound: the voice goes to the video model on
// its own. It is drawn by a second renderer of its own, so the editor's view does not move or stretch while it runs.
// The video becomes an option of the scene's card in the animation round (the set's cut.card, else the location's own
// card), model Blocking 3D, so the client never sees it. Its poster is its first frame. `prompt` holds a timecoded
// summary for whoever writes the video prompt: each shot's seconds in the video and in the cut, the lens and its
// field of view, the camera's move, who is in frame, the product's light and the lines (the cut's `lines`). The same
// summary goes next to the video as JSON, with the first frame of every shot (PNG).
import { THREE } from "./kit.js";

const FPS = 24;
const SIZE = [1280, 720];
const MUXER = "https://cdn.jsdelivr.net/npm/mp4-muxer@5.1.3/+esm";
// a turn of the event loop that a background tab does not slow down (its timers wait up to a second)
const yieldNow = () => new Promise((ok) => { const c = new MessageChannel(); c.port1.onmessage = () => ok(); c.port2.postMessage(0); });
const UP = new THREE.Vector3(0, 1, 0);
const n2 = (v) => +(+v).toFixed(2);
const s2 = (t) => `${t.toFixed(2)} s`;
const meters = (x) => `${Math.abs(x) >= 1 ? Math.abs(x).toFixed(1) : Math.abs(x).toFixed(2)} m`;
// the horizontal field of view of a lens on a full-frame sensor (36 mm wide), as the editor frames it (16:9)
const hfov = (mm) => Math.round(THREE.MathUtils.radToDeg(2 * Math.atan(18 / mm)));

// E: the editor; H: { MODEL, PRODUCT, LED_STATES, slug, card }; opts: { cast } (false: the set and the camera only);
// progress(0–1). Resolves with the new option.
export async function exportScene(E, H, opts = {}, progress = () => {}) {
  const T = E.tl, plan = T?.plan(FPS), cast = opts.cast !== false;
  if (!plan?.frames.length) throw new Error("esta cena não tem timeline");
  const out = await render(E, H, plan, cast, (p) => progress(p * 0.85));
  progress(0.9);
  return save(E, H, plan, out, cast);
}

// ---------- the frames ----------
async function render(E, H, plan, cast, progress) {
  if (typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined") throw new Error("este navegador não gera MP4: abra no Chrome");
  const [W, Hh] = SIZE;
  const cfgOf = (codec) => ({ codec, width: W, height: Hh, bitrate: 5e6, framerate: FPS, avc: { format: "avc" } });
  let cfg = null;
  for (const c of ["avc1.640034", "avc1.640033", "avc1.4d0033", "avc1.42e034"]) {
    const s = await VideoEncoder.isConfigSupported(cfgOf(c)).catch(() => null);
    if (s?.supported) { cfg = cfgOf(c); break; }
  }
  if (!cfg) throw new Error("este navegador não gera MP4: abra no Chrome");
  const { Muxer, ArrayBufferTarget } = await import(MUXER);
  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: "avc", width: W, height: Hh }, fastStart: "in-memory" });
  let fail = null;
  const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { fail = e; } });
  enc.configure(cfg);
  // a renderer of its own, set up like the editor's, and a camera that copies the editor's at every frame without
  // its view offset (the editor frames the shot inside a bigger canvas)
  const main = E.renderer;
  const xr = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  xr.setPixelRatio(1);
  xr.setSize(W, Hh, false);
  xr.outputColorSpace = main.outputColorSpace;
  xr.toneMapping = main.toneMapping;
  xr.toneMappingExposure = main.toneMappingExposure;
  xr.shadowMap.enabled = main.shadowMap.enabled;
  xr.shadowMap.type = main.shadowMap.type;
  const cam = new THREE.PerspectiveCamera(E.camera.fov, W / Hh, E.camera.near, E.camera.far);
  const T = E.tl;
  const keep = { t: T.t, hold: T.hold, preset: E.camPreset, helpers: E.helpers.visible, pos: E.camera.position.clone(),
    q: E.camera.quaternion.clone(), fov: E.camera.fov, target: E.orbit.target.clone() };
  const firsts = new Map(), seen = new Map();
  T.pause();
  E.helpers.visible = false;
  // without the cast: the figures and what they carry are out of the picture while it renders
  const hid = [];
  if (!cast) {
    for (const o of [...E.figs.map((f) => f.root), ...(E.props || []).filter((p) => p.spec?.attach).map((p) => p.obj)]) if (o.visible) { o.visible = false; hid.push(o); }
  }
  try {
    const N = plan.frames.length;
    for (let i = 0; i < N; i++) {
      if (fail) throw fail;
      const fr = plan.frames[i];
      T.seek(fr.t);
      cam.position.copy(E.camera.position);
      cam.quaternion.copy(E.camera.quaternion);
      cam.fov = E.camera.fov;
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld(true);
      xr.render(E.scene, cam);
      // who the lens sees, at the shot's first and middle frames; the first frame of each shot as a picture
      if (fr.first || fr.mid) {
        const now = inFrame(E, H, cam), was = seen.get(fr.s) || new Map();
        for (const x of now) if (!was.has(x.name) || was.get(x.name).h < x.h) was.set(x.name, x);
        seen.set(fr.s, was);
      }
      if (fr.first) firsts.set(fr.s, new Promise((ok) => xr.domElement.toBlob(ok, "image/png"))); // the bitmap is taken now
      const vf = new VideoFrame(xr.domElement, { timestamp: Math.round((i * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
      enc.encode(vf, { keyFrame: fr.first || i % FPS === 0 });
      vf.close();
      while (enc.encodeQueueSize > 6) await yieldNow();
      if (i % 4 === 3) { progress((i + 1) / N); await yieldNow(); }
    }
    await enc.flush();
    if (fail) throw fail;
    muxer.finalize();
    const frames = new Map();
    for (const [s, p] of firsts) frames.set(s, await p);
    return { video: new Blob([muxer.target.buffer], { type: "video/mp4" }), frames, seen, size: [W, Hh] };
  } finally {
    if (enc.state !== "closed") enc.close();
    xr.dispose();
    xr.forceContextLoss();
    // the editor as it was: the cast back, the scene at the playhead, the camera where it was (or still the timeline's)
    for (const o of hid) o.visible = true;
    E.helpers.visible = keep.helpers;
    if (keep.hold) T.seek(keep.t);
    else {
      T.seek(keep.t, true);
      E.camera.position.copy(keep.pos);
      E.camera.quaternion.copy(keep.q);
      E.camera.fov = keep.fov;
      E.camera.updateProjectionMatrix();
      E.orbit.target.copy(keep.target);
      E.camPreset = keep.preset;
      T.hold = false;
    }
    E.needs = true;
  }
}

// the cast and the product in the frame of `cam`: where (0–1 of the frame), how big, and whether the lens sees them
// (a ray from the lens reaches a point of them before anything else; glass and the sky do not hide)
function inFrame(E, H, cam) {
  const things = E.figs.filter((f) => f.visible !== false && f.root.visible).map((f) => ({ name: f.name, kind: "cast", obj: f.root, fig: f }));
  if (H.PRODUCT && E.device?.visible) things.push({ name: H.PRODUCT.title || "Produto", kind: "product", obj: E.device });
  if (!things.length) return [];
  const solid = [];
  E.scene.traverseVisible((o) => {
    if (!o.isMesh || o === E.helpers || isIn(o, E.helpers)) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (m && m.transparent && (m.opacity ?? 1) < 0.6) return;
    if (m?.side === THREE.BackSide) return; // the sky dome
    solid.push(o);
  });
  const ray = new THREE.Raycaster(), out = [];
  for (const x of things) {
    x.obj.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(x.obj);
    if (b.isEmpty()) continue;
    const box = frameBox(b, cam);
    if (!box) continue;
    const c = b.getCenter(new THREE.Vector3()), hgt = b.max.y - b.min.y;
    const pts = [0.85, 0.6, 0.35, 0.12].map((k) => c.clone().setY(b.min.y + hgt * k));
    let hit = 0, tried = 0;
    for (const p of pts) {
      const q = p.clone().project(cam);
      if (q.z > 1 || Math.abs(q.x) > 1 || Math.abs(q.y) > 1) continue;
      tried++;
      const dir = p.clone().sub(cam.position), d = dir.length();
      ray.set(cam.position, dir.normalize());
      ray.far = d - 0.03;
      ray.near = cam.near;
      const first = ray.intersectObjects(solid, false).find((h) => !isIn(h.object, x.obj));
      if (!first) hit++;
    }
    if (!hit) continue;
    // how big the face is in the frame (its height over the frame's, 0 when the face is out of it): the shot's size
    // and which way the face looks: to the lens, in profile, or away from it (the back of the head)
    let face = null, facing = null;
    const hb = x.fig?.bones?.head;
    if (hb) {
      const a = hb.getWorldPosition(new THREE.Vector3()), pa = a.clone().project(cam), pb = a.clone().add(new THREE.Vector3(0, 0.26, 0)).project(cam);
      const lo = Math.min(pa.y, pb.y), hi = Math.max(pa.y, pb.y);
      face = pa.z < 1 && pb.z < 1 && hi >= -1 && lo <= 1 && Math.abs((pa.x + pb.x) / 2) <= 1.1 ? n2((hi - lo) / 2) : 0;
      const look = new THREE.Vector3(0, 0, 1).applyQuaternion(hb.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize();
      const d = look.dot(cam.position.clone().sub(a).setY(0).normalize());
      facing = d > 0.35 ? "lens" : d < -0.35 ? "away" : "profile";
    }
    out.push({ name: x.name, kind: x.kind, box: box.inner, h: n2(box.inner.y1 - box.inner.y0), face, facing, cut: box.cut, seen: n2(hit / tried) });
  }
  return out;
}
const isIn = (o, root) => { for (let p = o; p; p = p.parent) if (p === root) return true; return false; };
// a world box seen by the camera: its part inside the frame (0–1 from the top left) and whether the frame cuts it
function frameBox(b, cam) {
  const pts = [];
  for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) pts.push(new THREE.Vector3(x, y, z).project(cam));
  if (pts.every((p) => p.z > 1)) return null;
  const xs = pts.map((p) => (p.x + 1) / 2), ys = pts.map((p) => (1 - p.y) / 2);
  const raw = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  const c = (v) => n2(Math.max(0, Math.min(1, v)));
  const inner = { x0: c(raw.x0), y0: c(raw.y0), x1: c(raw.x1), y1: c(raw.y1) };
  if (inner.x1 - inner.x0 < 0.005 || inner.y1 - inner.y0 < 0.005) return null;
  return { inner, cut: raw.x0 < -0.01 || raw.y0 < -0.01 || raw.x1 > 1.01 || raw.y1 > 1.01 };
}

// ---------- what the video shows, in words and in JSON ----------
// a camera key → where it looks from, as a tripod head reads it
function aim(k) {
  const p = new THREE.Vector3(...k.pos), d = new THREE.Vector3(...k.target).sub(p), r = d.length() || 1e-6;
  return { p, pan: THREE.MathUtils.radToDeg(Math.atan2(d.x, d.z)), tilt: THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(d.y / r, -1, 1))) };
}
// the camera's move from a shot's first key to its last, in the camera's own terms (in, back, left, right, up, down)
function moveOf(a, z) {
  if (!a || !z || a === z) return "locked off";
  const A = aim(a), Z = aim(z);
  const F = new THREE.Vector3(...a.target).sub(A.p).setY(0);
  if (F.lengthSq() < 1e-8) F.set(0, 0, 1);
  F.normalize();
  const R = new THREE.Vector3().crossVectors(F, UP).normalize(), d = Z.p.clone().sub(A.p);
  const fwd = d.dot(F), side = d.dot(R), up = d.y;
  const pan = (((Z.pan - A.pan + 540) % 360) - 180), tilt = Z.tilt - A.tilt, w = [];
  if (Math.abs(up) > 0.05) w.push(`${up > 0 ? "rises" : "descends"} ${meters(up)}`);
  if (Math.abs(fwd) > 0.05) w.push(`${fwd > 0 ? "pushes in" : "pulls back"} ${meters(fwd)}`);
  if (Math.abs(side) > 0.05) w.push(`trucks ${side > 0 ? "right" : "left"} ${meters(side)}`);
  if (Math.abs(pan) >= 2) w.push(`pans ${pan < 0 ? "right" : "left"} ${Math.round(Math.abs(pan))}°`);
  if (Math.abs(tilt) >= 2) w.push(`tilts ${tilt > 0 ? "up" : "down"} ${Math.round(Math.abs(tilt))}°`);
  if (Math.round(z.lens) !== Math.round(a.lens)) w.push(`zooms ${z.lens > a.lens ? "in" : "out"} ${Math.round(a.lens)}→${Math.round(z.lens)}mm`);
  return w.length ? w.join(", ") : "locked off";
}
// a color as a word a prompt can use ("dark orange")
function colorWord(hex) {
  if (!hex) return "";
  const hsl = {};
  new THREE.Color(hex).getHSL(hsl, THREE.SRGBColorSpace); // as the hex reads, not in the renderer's linear space
  const { h, s, l } = hsl;
  if (l < 0.1) return "black";
  if (s < 0.16) return l > 0.88 ? "white" : l < 0.3 ? "dark grey" : l < 0.68 ? "grey" : "light grey";
  const deg = h * 360, name = [[15, "red"], [42, "orange"], [68, "yellow"], [160, "green"], [195, "teal"], [255, "blue"], [290, "purple"], [335, "pink"], [361, "red"]].find(([m]) => deg <= m)[1];
  return `${l < 0.36 ? "dark " : l > 0.72 ? "light " : ""}${name}`;
}
// the cast's clothes, by the colors the set dresses them in (look), else the figure's flat color
function castColors(E) {
  return E.figs.filter((f) => f.visible !== false && f.root.visible).map((f) => {
    const look = E.set.cast?.find((c) => `${c.item}:${c.name}` === f.key)?.look;
    const flat = typeof f.color === "number" ? `#${f.color.toString(16).padStart(6, "0")}` : f.color;
    const parts = look ? [["top", "top"], ["hat", "cap"], ["bottom", "trousers"], ["beard", "beard"]].filter(([k]) => look[k]).map(([k, w]) => `${colorWord(look[k])} ${w}`) : [`${colorWord(flat) || "flat"} figure`];
    // and what the figure carries or wears (a hat, a phone), by its own color
    const carries = (E.props || []).filter((p) => p.obj.visible && p.spec?.attach && (([c]) => c && `${c.item}:${c.name}` === f.key)([E.set.cast?.[p.spec.attach.cast]]))
      .map((p) => `${colorWord(p.spec.color)} ${String(p.spec.name || p.key).toLowerCase()}`);
    return { name: f.name, colors: look || null, carries, words: [...parts, ...carries].join(", ") };
  });
}
function summary(E, H, plan, out, files, withCast) {
  const c = E.set.cut, fps = plan.fps, N = plan.frames.length, t0 = plan.F0 / fps;
  const vs = (f) => n2(f / fps);
  const ledName = (v) => (H.LED_STATES.find((x) => x[0] === v)?.[1] || v || "").toLowerCase();
  const cast = withCast ? castColors(E) : [];
  const shots = plan.shots.filter((s) => s.f0 != null).map((s) => {
    const k = s.keys, a = k[0], z = k[k.length - 1], p = E.set.cams.find((x) => x.id === s.cam);
    const lens = a ? [Math.round(a.lens), Math.round(z.lens)] : [p?.lens, p?.lens];
    const height = a ? [n2(a.pos[1]), n2(z.pos[1])] : p ? [n2(p.pos[1]), n2(p.pos[1])] : null;
    const who = [...(out.seen.get(s.i)?.values() || [])].map((x) => ({ name: x.name, kind: x.kind, size: x.h, face: x.face, facing: x.facing, cut: x.cut, seen: x.seen }));
    return { n: s.i + 1, title: s.title, cam: s.cam, note: p?.title || "", cut_in: s.in, cut_out: s.out, video_in: vs(s.f0), video_out: vs(s.f1),
      lens_mm: lens, hfov_deg: lens.map((mm) => (mm ? hfov(mm) : null)), height_m: height, keys: k.length,
      move: a ? moveOf(a, z) : "locked off", on_board: !!s.ride, handheld: n2(k.reduce((m, x) => Math.max(m, x.shake || 0), 0)), in_frame: who,
      first_frame: files.frames.get(s.i) || null };
  });
  const led = (plan.dev || []).map((k) => ({ led: k.led, label: ledName(k.led), cut: n2(k.t), video: n2(Math.max(0, k.t - t0)) })).filter((k) => k.cut <= plan.b);
  const end = (plan.F0 + N) / fps;
  const lines = (c?.lines || []).filter(([a, b]) => b > t0 && a < end).map(([a, b, who, text]) => ({ who, text: text || "", cut_in: n2(a), cut_out: n2(b), video_in: n2(Math.max(0, a - t0)), video_out: n2(Math.min(end, b) - t0) }));
  const json = { v: 1, kind: "blocking-3d-video", set: E.set.name, location_item: E.item.id, scene: E.item.scene, card: files.card, cut: c?.name || "", fps,
    size: out.size, frames: N, duration: n2(N / fps), cut_start: n2(t0), cut_end: n2(end), sound: false, with_cast: withCast, cuts_at: shots.slice(1).map((s) => s.video_in),
    cast, product: H.PRODUCT ? { name: H.PRODUCT.title || "", light: led } : null, shots, lines, video: files.video, poster: files.poster };
  // the same in words, for a prompt
  // a person by the size of the face (the shot's size); a thing by its own size in the frame
  const size = (x) => x.face != null
    ? (x.face === 0 ? "in frame without the face" : (x.face >= 0.8 ? "extreme close-up" : x.face >= 0.4 ? "close-up" : x.face >= 0.2 ? "medium close-up" : x.face >= 0.11 ? "medium shot" : x.face >= 0.05 ? "wide" : "very wide, small in frame")
      + (x.facing === "away" ? ", seen from behind" : x.facing === "profile" ? ", in profile" : "")) + (x.seen < 1 ? ", partly hidden" : "")
    : (x.size < 0.12 ? "small" : x.size < 0.4 ? "medium" : x.size < 0.75 ? "large" : "close") + (x.cut ? ", cut by the frame" : "") + (x.seen < 1 ? ", partly hidden" : "");
  const L = [];
  L.push(`3D blocking · ${E.set.name} · ${c?.name || "cut"} ${s2(json.cut_start).replace(" s", "")}–${s2(json.cut_end)} → this video 0.00–${s2(json.duration)} (${fps} fps, ${out.size.join("×")}, no sound), ${withCast ? "with the cast" : "the set and the camera only, no cast"}.`);
  L.push(`${shots.length} ${shots.length === 1 ? "shot" : "shots"}${json.cuts_at.length ? `, hard cuts at ${json.cuts_at.map((t) => t.toFixed(2)).join(", ")} s` : ", one continuous take"}. A simple blocking: it gives the camera, the framing, the timing and the cuts, not the look.`);
  if (cast.length) L.push(`Cast colors: ${cast.map((x) => `${x.name} = ${x.words}`).join("; ")}.`);
  for (const s of shots) {
    const cam = [`${s.lens_mm[0]}mm${s.lens_mm[1] !== s.lens_mm[0] ? `→${s.lens_mm[1]}mm` : ""} (${s.hfov_deg[0]}° wide)`];
    if (s.height_m) { const [h0, h1] = s.height_m.map((h) => h.toFixed(1)); cam.push(`camera ${h0}${h1 !== h0 ? `→${h1}` : ""} m high`); }
    cam.push(s.move);
    if (s.on_board) cam.push("on board, rocking with the boat");
    if (s.handheld > 0) cam.push(`handheld (${s.handheld < 0.3 ? "light" : s.handheld < 0.7 ? "medium" : "strong"})`);
    const who = s.in_frame.length ? s.in_frame.map((x) => `${x.name} (${size(x)})`).join(", ") : "only the set";
    L.push(`${s.n} · ${s.video_in.toFixed(2)}–${s.video_out.toFixed(2)} s (cut ${s.cut_in.toFixed(2)}–${s.cut_out.toFixed(2)}) · ${s.title} · ${cam.join(", ")} · in frame: ${who}${s.note ? ` · ${s.note}` : ""}`);
  }
  if (json.product && led.length) L.push(`${json.product.name} light: ${led.map((k) => `${k.label} from ${k.video.toFixed(2)} s`).join(", ")}.`);
  if (lines.length) L.push(`Lines (for the timing; the voice goes on its own): ${lines.map((x) => `${x.video_in.toFixed(2)}–${x.video_out.toFixed(2)} s ${x.who}${x.text ? ` "${x.text}"` : ""}`).join("; ")}.`);
  return { json, text: L.join("\n") };
}

// ---------- to the card ----------
async function save(E, H, plan, out, withCast) {
  const { ctx } = E, card = H.card(), prefix = `items/${card.id}`, base = H.slug(`${E.set.name}-${E.set.cut?.name || "cena"}-${withCast ? "com-elenco" : "sem-elenco"}`);
  const vfile = new File([out.video], `blocking-${base}.mp4`, { type: "video/mp4" });
  const v = await ctx.putFile(prefix, vfile);
  // each shot's first frame (the room makes its preview and thumb); the first one is the video's poster
  const frames = new Map();
  let poster = null;
  for (const s of plan.shots) {
    const blob = out.frames.get(s.i);
    if (!blob) continue;
    const m = await ctx.putFile(prefix, new File([blob], `blocking-${base}-${H.slug(s.title)}.png`, { type: "image/png" }));
    frames.set(s.i, m.path);
    poster ||= m;
  }
  const json = `${v.path.replace(/\.[^.]+$/, "")}.json`;
  const { json: data, text } = summary(E, H, plan, out, { card: card.id, video: v.path, poster: poster?.path || null, frames }, withCast);
  const up = await ctx.sb.storage.from(ctx.bucket).upload(json, new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }), { contentType: "application/json" });
  if (up.error) throw up.error;
  const V = ctx.roundOf(card.round_id)?.version || 1;
  const { data: o, error } = await ctx.sb.from("options").insert({
    item_id: card.id, path: v.path, preview_path: poster?.preview_path || null, thumb_path: poster?.thumb_path || null, mime: "video/mp4", name: vfile.name,
    created_by: ctx.myName(), version: V, model: H.MODEL, caption: `Cena 3D · ${E.set.cut?.name || "a cena"} · ${data.duration.toFixed(1).replace(".", ",")} s · ${withCast ? "com o elenco" : "sem o elenco"}`,
    prompt: text,
    reasoning: `O blocking 3D da cena inteira, como a timeline está: ${data.shots.length} ${data.shots.length === 1 ? "plano" : "planos"}${data.cuts_at.length ? ", com os cortes secos nos segundos do corte" : ""}, ${withCast ? "com o elenco" : "sem o elenco (só o cenário e a câmera)"}, ${data.size.join("×")} a ${data.fps} fps, sem som. O resumo em JSON, com o primeiro quadro de cada plano, está em ${json}.`,
  }).select().single();
  if (error) throw error;
  await ctx.refresh();
  return { option: o, card, json, summary: data, text, video: out.video, frames: out.frames };
}
