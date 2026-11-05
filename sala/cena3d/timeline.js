// Cena 3D · the scene's timeline (the animation round). The cut's shots are segments with an in and an out, and each
// thing in the scene has a row of keyframes: the camera, every figure, the product and the set's own motion (a boat
// rocking). A key is what the 3D shows at that second of the cut; between two keys the values ease (suave), run straight
// (linear) or hold (segura). At a cut the camera jumps to the next shot's keys. The timeline lives in the set's saved
// state (cena3d.state.timeline), so undo, redo and the autosave cover it.
// A set gets one when sets.js gives it a `cut`: { name, shots: [{ cam, title, in, out, ride, shake, end, ease, view }],
// figs: { name: [[t, pose preset, where, facing, ease]] }, device: [[t, led, ry]], lines: [[in, out, who, text]],
// audio: { option }, env: { t0, dt, v }, card }. A device key may also turn the product where it stands (ry, degrees) or place it ([x, y, z]).
// A figure key may carry where the figure stands ([x, y, z]) and its facing (degrees): a figure that covers ground in a
// moving pose (running, walking, a bear's gallop) strides by the meters it covers (rig.js gait). A shot's `ease` is its
// camera's ("linear" follows someone running at an even pace); its `view` lets it see farther ({ near, far, fog: [near,
// far] }: a drone over the mountains). `motion` makes the set rock as a whole (everything but the meshes marked
// userData.still, the sea), cameras of shots marked `ride` riding with it; `device.swing` lets the product swing on its
// hook as the set rocks.
import { THREE, D2R } from "./kit.js";
import { poseOf, setPose, applyPreset, POSES, gait, gaitOf } from "./rig.js";

const EPS = 1e-3;
const UP = new THREE.Vector3(0, 1, 0);
const v3 = (a) => new THREE.Vector3(...a);
const r3 = (a, n = 3) => a.map((x) => +(+x).toFixed(n));
const fmt = (t) => `${t.toFixed(1).replace(".", ",")} s`;
const clamp = THREE.MathUtils.clamp;
const EASES = [["suave", "Suave"], ["linear", "Linear"], ["continua", "Contínua"], ["segura", "Segura"]];
// "suave" eases in and out (cubic), "linear" runs straight, "segura" holds the first key until the next one;
// "continua" (camera keys) flows through the keys without stopping at them (flow, below); elsewhere it runs straight
const easeOf = (e, u) => (e === "linear" || e === "continua" ? u : e === "segura" ? 0 : u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);
// A continuous move through a shot's keys: on a segment that starts at a "continua" key, each value follows a curve
// (cubic Hermite) whose speed at a key comes from its neighbors (from the one beside it at the shot's first and last
// keys), so the camera passes the keys without braking; a key close to the last one makes it settle. The speed is
// held to what the segment can take, so uneven keys don't loop back.
function flow(ks, i, t, get) {
  const a = ks[i], b = ks[i + 1], dt = Math.max(1e-6, b.t - a.t), u = clamp((t - a.t) / dt, 0, 1);
  const P0 = get(a), P1 = get(b), span = Math.hypot(...P1.map((x, j) => x - P0[j]));
  const tan = (k) => {
    const p = ks[Math.max(0, k - 1)], n = ks[Math.min(ks.length - 1, k + 1)], m = get(n).map((x, j) => (x - get(p)[j]) / Math.max(1e-6, n.t - p.t));
    const len = Math.hypot(...m), cap = (2.5 * span) / dt;
    return len > cap ? m.map((x) => (x * cap) / len) : m;
  };
  const M0 = tan(i), M1 = tan(i + 1), u2 = u * u, u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
  return P0.map((x, j) => h00 * x + h10 * dt * M0[j] + h01 * P1[j] + h11 * dt * M1[j]);
}
const sorted = (ks) => [...ks].sort((a, b) => a.t - b.t);
// the two keys around t and how far between them (eased); before the first and after the last, that key holds
function around(ks, t) {
  if (!ks.length) return null;
  if (t <= ks[0].t) return { a: ks[0], b: ks[0], u: 0 };
  const last = ks[ks.length - 1];
  if (t >= last.t) return { a: last, b: last, u: 0 };
  let i = 0;
  while (ks[i + 1].t < t) i++;
  const a = ks[i], b = ks[i + 1];
  return { a, b, u: easeOf(a.ease, (t - a.t) / Math.max(1e-6, b.t - a.t)) };
}
// where a camera looks, as a tripod head reads it (as cena3d.js glides): pan, tilt, distance to the point it looks at
function aim(pos, target) {
  const d = target.clone().sub(pos), r = d.length() || 1e-6;
  return { r, pan: Math.atan2(d.x, d.z), tilt: Math.asin(clamp(d.y / r, -1, 1)) };
}
// a hand-held drift, smooth, in degrees (two slower waves and a faster one)
function shakeAt(t, s) {
  const n = (f, p) => Math.sin(t * f + p) * 0.6 + Math.sin(t * f * 2.31 + p * 1.7) * 0.3 + Math.sin(t * f * 5.13 + p * 0.3) * 0.1;
  return { yaw: s * 0.9 * n(1.3, 0.2), pitch: s * 0.7 * n(1.7, 1.9), roll: s * 0.45 * n(1.1, 3.3) };
}
function blendPose(p, q, u) {
  if (!p?.limbs || !q?.limbs || u <= 0) return p;
  const L = (x, y) => x.map((v, i) => v + (y[i] - v) * u);
  const S = (x, y) => new THREE.Quaternion().fromArray(x).slerp(new THREE.Quaternion().fromArray(y), u).toArray();
  const out = { preset: u < 0.5 ? p.preset : q.preset, hips: L(p.hips, q.hips), hipsQ: S(p.hipsQ, q.hipsQ), limbs: {} };
  for (const k of ["spine", "chest", "neck", "head"]) out[k] = S(p[k], q[k]);
  for (const [k, a] of Object.entries(p.limbs)) { const b = q.limbs[k] || a; out.limbs[k] = { t: L(a.t, b.t), r: S(a.r, b.r), p: L(a.p, b.p) }; }
  return out;
}
const lerpAngle = (a, b, u) => a + (((b - a + 540) % 360) - 180) * u;

// H: what the editor lends the timeline (its state E and a few of its functions)
export function createTimeline(H) {
  const { E } = H;
  const T = { data: null, t: 0, playing: false, loop: false, sel: null, hold: false, touched: false, el: null, last: 0 };
  // the set's cut, or one of its versions (`alts`: the same cut done another way, e.g. one continuous take), each merged
  // over the cut (it keeps the cut's card, sound and lines unless it says otherwise); the timeline remembers which (alt)
  const cuts = () => (E.set?.cut ? [E.set.cut, ...(E.set.alts || []).map((a) => ({ ...E.set.cut, ...a }))] : []);
  const cut = () => cuts()[T.data?.alt || 0] || E.set?.cut || null;
  T.cut = () => cut();
  const esc = (s) => H.esc(String(s ?? ""));
  const $ = (s) => T.el?.querySelector(s);

  // ---------- data ----------
  function defaults(alt = 0) {
    const c = cuts()[alt];
    if (!c?.shots?.length) return null;
    const cam = [], figs = {}, dev = [], move = [];
    c.shots.forEach((s, i) => {
      const p = E.set.cams.find((x) => x.id === s.cam);
      if (!p) return;
      const e = s.end || {}, ease = s.ease || "suave";
      // a shot may bring its own keys, [t, pos, target, lens, ease, view, shake] (a continuous move through several framings)
      if (s.keys?.length) {
        for (const [t, pos, target, lens, ke, view, sh] of s.keys) cam.push({ s: i, t, pos, target, lens, ease: ke || ease, shake: sh ?? s.shake ?? 0, ...(view ? { view } : {}) });
        return;
      }
      cam.push({ s: i, t: s.in, pos: p.pos, target: p.target, lens: p.lens, ease, shake: s.shake || 0 },
        { s: i, t: s.out, pos: e.pos || p.pos, target: e.target || p.target, lens: e.lens || p.lens, ease, shake: s.shake || 0 });
    });
    for (const [name, list] of Object.entries(c.figs || {})) {
      const ci = E.set.cast.find((x) => x.name === name);
      if (ci) figs[`${ci.item}:${ci.name}`] = list.map(([t, preset, pos, ry, ease]) => ({ t, preset, ...(pos ? { pos } : {}), ...(ry != null ? { ry } : {}), ease: ease || "suave" }));
    }
    for (const [t, led, ry, at] of c.device || []) dev.push({ t, led, ...(ry != null ? { ry } : {}), ...(at ? { at } : {}) });
    if (E.set.motion) move.push({ t: c.shots[0].in, amp: 1, ease: "suave" });
    return { v: 1, ...(alt ? { alt } : {}), shots: c.shots.map((s) => ({ cam: s.cam, title: s.title || s.cam, in: s.in, out: s.out, ride: !!s.ride, ...(s.view ? { view: s.view } : {}) })), cam, figs, dev, move };
  }
  const shots = () => T.data?.shots || [];
  const span = () => { const s = shots(); return s.length ? [s[0].in, s[s.length - 1].out] : [0, 1]; };
  const range = () => { const [a, b] = span(); return [a - 0.25, b + 0.25]; };
  const shotAt = (t) => { const s = shots(); return s.find((x) => t >= x.in - EPS && t < x.out - EPS) || (t < s[0]?.in ? s[0] : s[s.length - 1]); };
  // a camera key belongs to its shot (k.s, the shot's index; by its second if it has none): at a cut the out of one
  // shot and the in of the next sit on the same second and must not mix
  const shotIx = (t) => shots().indexOf(shotAt(t));
  const camKeys = (s) => { const i = shots().indexOf(s); return sorted(T.data.cam.filter((k) => (k.s ?? shotIx(k.t)) === i)); };
  T.has = () => !!T.data;
  T.state = () => (T.data ? JSON.parse(JSON.stringify(T.data, (k, v) => (k === "_pose" ? undefined : v))) : undefined);
  T.apply = (tl) => {
    T.data = tl ? JSON.parse(JSON.stringify(tl)) : defaults();
    if (!T.data) { T.sel = null; T.render(); return; }
    const [a, b] = span();
    if (!T.touched) T.t = a;
    T.t = clamp(T.t, a, b);
    if (T.sel && !keysOf(T.sel.row)?.[T.sel.i]) T.sel = null;
    T.render();
    if (T.touched) T.seek(T.t);
  };
  T.reset = () => { T.pause(); T.data = null; T.sel = null; T.touched = false; T.hold = false; viewAt(null); T.render(); };
  // the scene's frames for a video (video.js): from the first shot's in to the last one's out on the fps grid, each frame
  // sampled at its middle (so a cut lands between two frames), with its shot, the shot's first and middle frames marked;
  // and each shot with its camera keys and its frames in the video
  T.plan = (fps) => {
    if (!T.data) return null;
    const S = shots(), [a, b] = span(), F0 = Math.round(a * fps), F1 = Math.round(b * fps), frames = [];
    for (let f = F0; f < F1; f++) {
      const t = clamp((f + 0.5) / fps, a, b - 1e-4), s = S.indexOf(shotAt(t));
      frames.push({ t, s, first: !frames.length || frames[frames.length - 1].s !== s, mid: false });
    }
    const list = S.map((x, i) => {
      const own = frames.reduce((m, fr, k) => (fr.s === i ? [m[0] ?? k, k] : m), [null, null]);
      if (own[0] != null) frames[Math.floor((own[0] + own[1]) / 2)].mid = true;
      return { ...x, i, f0: own[0], f1: own[1] == null ? null : own[1] + 1, keys: camKeys(x) };
    });
    return { fps, a, b, F0, frames, shots: list, dev: sorted(T.data.dev || []) };
  };
  // Exportar a cena: a small menu (with the cast, without it, both); video.js renders and saves each one; the button
  // shows how far it got (0–1; null when it is over) and which of the videos it is on
  T.busy = null;
  T.menu = false;
  T.progress = (p, label = "") => {
    T.busy = p;
    T.busyLabel = label;
    const b = $('[data-tk="export"]');
    if (!b) return;
    b.disabled = p != null;
    b.classList.toggle("busy", p != null);
    b.textContent = p != null ? busyText() : exportLabel();
  };
  const busyText = () => `Exportando${T.busyLabel ? ` ${T.busyLabel}` : ""}… ${Math.round(T.busy * 100)}%`;
  function exportMenu(p) {
    const [a, b] = span(), to = H.exportTo?.();
    p.innerHTML = `<div class="c3d-tptop"><b>Exportar a cena · ${fmt(b - a)}</b><button class="c3d-tx" data-tk="close" aria-label="Fechar">×</button></div>
      <div class="c3d-tline"><button class="c3d-tchip acc" data-tk="export-go" data-v="both">Os dois</button><button class="c3d-tchip" data-tk="export-go" data-v="cast">Com o elenco</button><button class="c3d-tchip" data-tk="export-go" data-v="set">Sem o elenco</button></div>
      <p class="c3d-tnote">1280×720 a 24 fps, sem som, com os cortes. Sem o elenco: só o cenário e a câmera. Cada vídeo entra ${to ? `no card ${esc(to.title)}` : "no card"} como Blocking 3D, sem ✓, com o resumo dos planos pro prompt.</p>`;
    p.hidden = false;
    p.style.left = `${Math.max(8, T.el.getBoundingClientRect().width - 338)}px`;
  }
  const exportLabel = () => { const [a, b] = span(); return `Exportar a cena (${fmt(b - a)})`; };

  // ---------- the scene at a second ----------
  T.seek = (t, keepCam = false) => {
    if (!T.data) return;
    const [a, b] = span();
    T.t = clamp(t, a, b);
    T.touched = true;
    const s = shotAt(T.t);
    const amp = numAt(T.data.move, T.t, "amp", 1);
    deckAt(T.t, amp);
    for (const f of E.figs) { const ks = T.data.figs?.[f.key]; if (ks?.length) figAt(f, ks, T.t); }
    devAt(T.t, amp);
    if (!keepCam) camAt(s, T.t);
    H.updateHandles?.();
    playhead();
    E.needs = true;
  };
  function numAt(ks, t, f, d) {
    const w = ks?.length ? around(sorted(ks), t) : null;
    if (!w) return d;
    const a = w.a[f] ?? d, b = w.b[f] ?? d;
    return a + (b - a) * w.u;
  }
  function deckAt(t, amp) {
    const m = E.set.motion;
    if (!m || !E.deck) return;
    const w = (2 * Math.PI) / (m.period || 6);
    E.deck.rotation.set((m.pitch || 0) * D2R * amp * Math.sin(w * t * 0.73 + 1.1), 0, (m.roll || 0) * D2R * amp * Math.sin(w * t));
    E.deck.position.y = (m.heave || 0) * amp * Math.sin(w * t * 1.21 + 0.4);
    E.deck.updateMatrixWorld(true);
  }
  function rest() {
    if (E.deck) { E.deck.rotation.set(0, 0, 0); E.deck.position.set(0, 0, 0); E.deck.updateMatrixWorld(true); }
    const sw = E.device?.userData.swingRig;
    if (sw) sw.rotation.set(0, 0, 0);
  }
  function camAt(s, t) {
    if (!s) return;
    const ks = camKeys(s);
    let c;
    if (!ks.length) {
      const p = E.set.cams.find((x) => x.id === s.cam);
      if (!p) return;
      c = { pos: v3(p.pos), target: v3(p.target), fov: H.fovOf(p.lens), shake: 0 };
    } else {
      const { a, b, u } = around(ks, t), i = ks.indexOf(a), lin = a === b ? 0 : clamp((t - a.t) / Math.max(1e-6, b.t - a.t), 0, 1);
      const shake = (a.shake || 0) + ((b.shake || 0) - (a.shake || 0)) * lin;
      if (a !== b && a.ease === "continua") {
        // flowing through the keys: where it stands, where it looks and the lens each on its own curve
        const pos = v3(flow(ks, i, t, (k) => k.pos)), target = v3(flow(ks, i, t, (k) => k.target));
        c = { pos, target, fov: flow(ks, i, t, (k) => [H.fovOf(k.lens)])[0], shake };
      } else {
        const pa = v3(a.pos), pb = v3(b.pos), A = aim(pa, v3(a.target)), B = aim(pb, v3(b.target));
        const dp = B.pan - A.pan - Math.round((B.pan - A.pan) / (2 * Math.PI)) * 2 * Math.PI;
        const pan = A.pan + dp * u, tilt = A.tilt + (B.tilt - A.tilt) * u, r = A.r + (B.r - A.r) * u;
        const pos = pa.lerp(pb, u);
        const target = new THREE.Vector3(Math.cos(tilt) * Math.sin(pan), Math.sin(tilt), Math.cos(tilt) * Math.cos(pan)).multiplyScalar(r).add(pos);
        c = { pos, target, fov: H.fovOf(a.lens) + (H.fovOf(b.lens) - H.fovOf(a.lens)) * u, shake };
      }
      c.keys = { a, b, lin };
    }
    // a camera that rides the set (on board) keeps its framing of the deck: the horizon moves, not the cabin
    const ride = s.ride && E.deck;
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(c.pos, c.target, UP));
    if (ride) {
      q.premultiply(E.deck.getWorldQuaternion(new THREE.Quaternion()));
      c.pos.applyMatrix4(E.deck.matrixWorld);
      c.target.applyMatrix4(E.deck.matrixWorld);
    }
    E.camera.position.copy(c.pos);
    E.camera.quaternion.copy(q);
    E.orbit.target.copy(c.target);
    if (c.shake > 0) {
      const k = shakeAt(t, c.shake);
      E.camera.rotateY(k.yaw * D2R); E.camera.rotateX(k.pitch * D2R); E.camera.rotateZ(k.roll * D2R);
    }
    E.camera.fov = c.fov;
    viewAt(s, c.keys);
    E.camera.updateProjectionMatrix();
    E.sky?.position.copy(E.camera.position);
    E.camPreset = s.cam;
    T.hold = true; // the editor's loop leaves the camera alone (no orbit.update) until someone drags it
  }
  // how far the shot sees: its own near and far planes and fog (`view`), the editor's and the set's otherwise; a camera
  // key may carry its own view too, and between two keys it changes with the time (a crane from the trail up to the sky)
  const VIEW = { near: E.camera.near, far: E.camera.far };
  T.view = (s) => viewAt(s);
  const _ca = new THREE.Color(), _cb = new THREE.Color();
  function viewAt(s, w) {
    const c = E.camera, f = E.scene.fog, e = E.set?.env?.fog;
    const of = (v = {}, d) => ({ near: v.near ?? d.near, far: v.far ?? d.far, fn: v.fog?.[0] ?? d.fn, ff: v.fog?.[1] ?? d.ff, col: v.fog?.[2] || d.col });
    const base = of(s?.view, { near: VIEW.near, far: VIEW.far, fn: e?.[1], ff: e?.[2], col: e?.[0] });
    let r = base;
    if (w && (w.a.view || w.b.view)) {
      const A = of(w.a.view, base), B = of(w.b.view, base), L = (x, y) => x + (y - x) * w.lin;
      r = { near: L(A.near, B.near), far: L(A.far, B.far), fn: L(A.fn, B.fn), ff: L(A.ff, B.ff), col: A.col && B.col ? "#" + _ca.set(A.col).lerp(_cb.set(B.col), w.lin).getHexString() : A.col };
    }
    if (c.near !== r.near || c.far !== r.far) { c.near = r.near; c.far = r.far; c.updateProjectionMatrix(); }
    if (f && e) { f.near = r.fn; f.far = r.ff; f.color.set(r.col || e[0]); }
  }
  function ensurePose(f, k) {
    if (k.pose || !k.preset || f.kind !== "human") return;
    const keep = poseOf(f);
    applyPreset(f, k.preset);
    k.pose = poseOf(f);
    setPose(f, keep);
  }
  function figAt(f, keys, t) {
    const ks = sorted(keys);
    ks.forEach((k) => ensurePose(f, k));
    const { a, b, u } = around(ks, t);
    if (a.pose) setPose(f, u > 0 ? blendPose(a.pose, b.pose || a.pose, u) : a.pose);
    else if (f.kind !== "human" && a.preset) applyPreset(f, u < 0.5 ? a.preset : b.preset || a.preset); // an animal: its preset
    if (a.pos && b.pos) f.root.position.fromArray(a.pos.map((x, i) => x + (b.pos[i] - x) * u));
    if (a.ry != null && b.ry != null) f.root.rotation.y = lerpAngle(a.ry, b.ry, u) * D2R;
    f.root.updateMatrixWorld(true);
    stride(f, ks, t);
    H.fitProps?.(f);
  }
  // A figure covering ground in a moving pose strides: the phase is the meters covered over the stride's length, so the
  // feet keep pace; it fades in with the speed. A jump faster than anyone runs (a cut to another place) doesn't count.
  function stride(f, ks, t) {
    const g = gaitOf(f);
    if (!g) return;
    let d = 0, v = 0;
    for (let i = 0; i + 1 < ks.length && t >= ks[i].t; i++) {
      const a = ks[i], b = ks[i + 1];
      if (!a.pos || !b.pos) continue;
      const len = Math.hypot(b.pos[0] - a.pos[0], b.pos[2] - a.pos[2]), dt = Math.max(1e-6, b.t - a.t);
      if (len / dt > 25) continue;
      if (t >= b.t) { d += len; continue; }
      d += len * easeOf(a.ease, (t - a.t) / dt);
      v = len / dt;
    }
    if (v > 0.2) { gait(f, d / g.cycle, v / (g.walk ? 1 : 3)); f.root.updateMatrixWorld(true); }
  }
  // the product: its light from the last key before t; its swing on the hook while the set rocks
  function swingRig(d, h) {
    if (d.userData.swingRig) return d.userData.swingRig;
    const pivot = new THREE.Group(), inner = new THREE.Group();
    pivot.position.y = h; inner.position.y = -h;
    for (const c of [...d.children]) inner.add(c);
    pivot.add(inner); d.add(pivot);
    d.userData.swingRig = pivot;
    return pivot;
  }
  function devAt(t, amp) {
    const d = E.device;
    if (!d) return;
    const ks = sorted(T.data.dev || []);
    if (ks.length) {
      let k = ks[0], ry = ks.find((x) => x.ry != null)?.ry ?? null, at = ks.find((x) => x.at)?.at ?? null;
      for (const x of ks) if (x.t <= t + EPS) { k = x; if (x.ry != null) ry = x.ry; if (x.at) at = x.at; }
      if (k.led && d.userData.led !== k.led) H.setLed(d, k.led);
      // a key may also turn it where it stands (where its light faces) or set it somewhere else (at, when it stands
      // on its own), from that key on
      if (ry != null) d.rotation.y = ry * D2R;
      if (at && !d.userData.attach) d.position.fromArray(at);
    }
    const sw = E.set.device?.swing;
    if (sw && !d.userData.attach) {
      const w = (2 * Math.PI) / (sw.period || 2.4), a = (sw.amp || 8) * D2R * amp;
      swingRig(d, sw.pivot || 0.21).rotation.set(a * Math.sin(w * t), 0, a * 0.6 * Math.sin(w * t * 0.83 + 1.3));
    }
  }

  // ---------- playing ----------
  T.play = () => {
    if (!T.data || T.playing) return;
    const [a, b] = span();
    if (T.t >= b - 0.02) T.t = T.loop ? shotAt(T.t).in : a;
    T.playing = true; T.last = performance.now();
    E.glide = null; E.quiet = true;
    audio(true);
    head();
  };
  T.pause = () => {
    if (!T.playing) return;
    T.playing = false; E.quiet = false;
    audio(false);
    head();
  };
  // called by the editor's loop every frame while playing (the sound's clock leads when it plays)
  T.step = (now) => {
    const dt = Math.min(0.1, (now - T.last) / 1000);
    T.last = now;
    const au = $("audio");
    let t = au && T.audioOn && !au.paused ? au.currentTime : T.t + dt;
    const [a, b] = span(), s = shotAt(T.t);
    if (T.loop && t >= s.out) { t = s.in; sync(t); }
    if (t >= b) { if (T.loop) { t = s.in; sync(t); } else { T.seek(b); T.pause(); return; } }
    T.seek(t);
  };
  async function audio(on) {
    const au = $("audio"), c = cut();
    if (!au || !c?.audio?.option) return;
    if (!on) { au.pause(); return; }
    if (!T.audioOn) {
      const o = E.ctx.S.options.find((x) => x.id === c.audio.option);
      if (!o) return;
      try { await E.ctx.sign([o.path]); } catch (e) { console.error(e); return; }
      const url = E.ctx.urls.get(o.path);
      if (!url) return;
      au.src = url;
      T.audioOn = true;
    }
    if (!T.playing) return;
    sync(T.t);
    au.play().catch(() => { T.audioOn = false; });
  }
  function sync(t) { const au = $("audio"); if (au && T.audioOn) { try { au.currentTime = t; } catch {} } }

  // ---------- keys ----------
  const keysOf = (row) => (row === "cam" ? T.data?.cam : row === "dev" ? T.data?.dev : row === "move" ? T.data?.move : row?.startsWith("fig:") ? T.data?.figs?.[row.slice(4)] : null);
  function put(row, key) {
    if (row.startsWith("fig:")) { T.data.figs ||= {}; T.data.figs[row.slice(4)] ||= []; }
    const ks = keysOf(row);
    const near = ks.findIndex((k) => Math.abs(k.t - key.t) < 0.04 && (row !== "cam" || (k.s ?? shotIx(k.t)) === key.s));
    if (near >= 0) ks[near] = { ...ks[near], ...key }; else ks.push(key);
    const i = ks.indexOf(near >= 0 ? ks[near] : key);
    T.sel = { row, i };
  }
  function camNow() {
    const s = shotAt(T.t), inv = s.ride && E.deck ? E.deck.matrixWorld.clone().invert() : null;
    const pos = E.camera.position.clone(), target = E.orbit.target.clone();
    if (inv) { pos.applyMatrix4(inv); target.applyMatrix4(inv); }
    return { pos: r3(pos.toArray()), target: r3(target.toArray()), lens: Math.round(H.lensOf(E.camera.fov)) };
  }
  // the Keyframe button (K): what the 3D shows now, for what is selected (a figure, the product) or else the camera
  T.addKey = () => {
    if (!T.data) return;
    T.menu = false;
    const t = +T.t.toFixed(2), sel = E.sel;
    if (sel?.fig) {
      const f = sel.fig;
      put(`fig:${f.key}`, { t, pose: poseOf(f), pos: r3(f.root.position.toArray()), ry: +(f.root.rotation.y / D2R).toFixed(2), ease: "suave" });
    } else if (sel?.type === "device") put("dev", { t, led: E.device.userData.led, ry: +(E.device.rotation.y / D2R).toFixed(1) });
    else {
      const old = around(camKeys(shotAt(t)), t);
      put("cam", { s: shotIx(t), t, ...camNow(), ease: "suave", shake: old ? old.a.shake || 0 : 0 });
    }
    H.commit();
    T.render(); pop();
  };
  function delKey() {
    if (!T.sel) return;
    const ks = keysOf(T.sel.row);
    if (!ks) return;
    ks.splice(T.sel.i, 1);
    T.sel = null;
    H.commit(); T.render(); pop(); T.seek(T.t);
  }

  // ---------- drawing ----------
  T.shown = () => !!T.data && !matchMedia("(max-width: 860px)").matches;
  function rows() {
    if (!T.data) return [];
    const r = [{ id: "shots", name: "Planos", h: 36 }, { id: "cam", name: "Câmera", h: 26 }];
    for (const f of E.figs) if (f.visible !== false && (f.kind === "human" || T.data.figs?.[f.key])) r.push({ id: `fig:${f.key}`, name: f.name, h: 26, fig: f });
    if (E.device && H.PRODUCT) r.push({ id: "dev", name: H.PRODUCT.title || "Produto", h: 26 });
    if (E.set.motion) r.push({ id: "move", name: E.set.motion.label || "Movimento", h: 26 });
    if (cut()?.env) r.push({ id: "sound", name: "Som do corte", h: 30 });
    return r;
  }
  T.height = () => (T.shown() ? 40 + 18 + rows().reduce((n, r) => n + r.h, 0) + 10 : 0);
  T.mount = () => {
    if (T.el) return;
    const el = document.createElement("div");
    el.className = "c3d-time";
    el.hidden = true;
    el.innerHTML = `<div class="c3d-thead"></div><div class="c3d-tbody"><div class="c3d-tnames"></div><div class="c3d-tlane"><div class="c3d-truler"></div><div class="c3d-trows"></div><div class="c3d-tph"></div></div></div><div class="c3d-tpop" hidden></div><audio preload="none"></audio>`;
    E.el.querySelector(".c3d-main").append(el);
    T.el = el;
    bind();
  };
  T.render = () => {
    if (!T.el) return;
    const on = T.shown();
    T.el.hidden = !on;
    if (!on) { pop(); return; }
    head(); lane(); pop();
  };
  const X = (t) => { const [a, b] = range(); return ((t - a) / (b - a)) * 100; };
  function head() {
    const h = $(".c3d-thead");
    if (!h || !T.data) return;
    const s = shotAt(T.t), [a, b] = span(), c = cut();
    h.innerHTML = `<button class="c3d-tplay${T.playing ? " on" : ""}" data-tk="play" title="${T.playing ? "Pausar" : "Tocar a cena"} (espaço)" aria-label="${T.playing ? "Pausar" : "Tocar"}">${T.playing ? '<svg viewBox="0 0 16 16"><rect x="4" y="3" width="3" height="10" rx=".8"/><rect x="9" y="3" width="3" height="10" rx=".8"/></svg>' : '<svg viewBox="0 0 16 16"><path d="M5 3.2v9.6L13 8z"/></svg>'}</button>
      <button class="c3d-tchip${T.loop ? " on" : ""}" data-tk="loop" title="Repetir só o plano da agulha">repetir o plano</button>
      <span class="c3d-ttime"><b>${fmt(T.t)}</b> · ${esc(s?.title || "")}</span>
      ${cuts().length > 1 ? `<span class="c3d-tcuts">${cuts().map((x, i) => `<button class="c3d-tchip${(T.data.alt || 0) === i ? " on" : ""}" data-tk="cut" data-v="${i}" title="${esc(i ? `Outra versão do corte: ${x.name} (a timeline dessa versão, como o set a traz)` : `O corte como o animatic: ${x.name}`)}">${esc(x.name)}</button>`).join("")}</span>` : ""}
      <span class="c3d-tinfo">${esc(c?.name || "Corte")} · ${fmt(a).replace(" s", "")}–${fmt(b)}</span>
      <span class="c3d-tsp"></span>
      <button class="c3d-tchip acc" data-tk="key" title="Gravar um keyframe no segundo da agulha: do que estiver selecionado (uma pessoa, o produto) ou, sem seleção, da câmera (K)"><i class="c3d-tdia"></i>Keyframe</button>
      ${H.exportScene ? exportButton(s) : ""}`;
  }
  function exportButton() {
    const to = H.exportTo?.(), n = shots().length;
    const title = `O vídeo do blocking da cena inteira como a timeline está agora (${n} ${n === 1 ? "plano" : `planos, com os cortes`}), com e sem o elenco, 1280×720 a 24 fps, sem som: entra ${to ? `no card ${to.title}` : "no card"} como Blocking 3D, sem ✓, com o resumo dos planos pro prompt`;
    const busy = T.busy != null;
    return `<button class="c3d-tchip${busy ? " busy" : T.menu ? " on" : ""}" data-tk="export" title="${esc(title)}"${busy ? " disabled" : ""}>${busy ? busyText() : exportLabel()}</button>`;
  }
  function lane() {
    const D = T.data, rs = rows(), [ra, rb] = range();
    $(".c3d-tnames").innerHTML = `<div class="c3d-tn0"></div>${rs.map((r) => `<div class="c3d-tn" style="height:${r.h}px">${esc(r.name)}</div>`).join("")}`;
    let ticks = "";
    for (let k = Math.ceil(ra * 2); k <= Math.floor(rb * 2); k++) {
      const t = k / 2, big = k % 2 === 0;
      ticks += `<i class="${big ? "big" : ""}" style="left:${X(t)}%"></i>${big ? `<span style="left:${X(t)}%">${t} s</span>` : ""}`;
    }
    $(".c3d-truler").innerHTML = ticks;
    const cur = shotAt(T.t);
    const dia = (row, i, k, label = "", cls = "") => `<i class="c3d-tk${cls}${T.sel?.row === row && T.sel.i === i ? " on" : ""}" data-tk="k" data-row="${esc(row)}" data-i="${i}" style="left:${X(k.t)}%" title="${fmt(k.t)}${label ? ` · ${esc(label)}` : ""}"></i>${label ? `<span class="c3d-tkl" style="left:${X(k.t)}%">${esc(label)}</span>` : ""}`;
    const html = rs.map((r) => {
      let inner = "";
      if (r.id === "shots") inner = D.shots.map((s, i) => `<div class="c3d-tshot${s === cur ? " on" : ""}" data-tk="shot" data-i="${i}" style="left:${X(s.in)}%;width:${X(s.out) - X(s.in)}%"><b>${esc(s.title)}</b><small>${fmt(s.in).replace(" s", "")}–${fmt(s.out)}</small><i class="c3d-tedge in" data-tk="edge" data-i="${i}" data-e="in" title="Arrastar: onde o plano começa"></i><i class="c3d-tedge out" data-tk="edge" data-i="${i}" data-e="out" title="Arrastar: onde o plano termina"></i></div>`).join("");
      else if (r.id === "cam") {
        inner = D.shots.map((s) => { const ks = camKeys(s); return ks.length > 1 ? `<b class="c3d-tseg" style="left:${X(ks[0].t)}%;width:${X(ks[ks.length - 1].t) - X(ks[0].t)}%"></b>` : ""; }).join("");
        inner += D.cam.map((k, i) => { const s = D.shots[k.s ?? shotIx(k.t)], first = s && camKeys(s)[0] === k; return dia("cam", i, k, first && k.shake > 0 ? "na mão" : ""); }).join("");
      } else if (r.fig) inner = (D.figs?.[r.fig.key] || []).map((k, i) => dia(r.id, i, k, k.label || (k.preset ? POSES[k.preset]?.label || k.preset : "pose"))).join("");
      else if (r.id === "dev") {
        inner = (E.set.device?.swing ? wave(r.h, (t) => Math.sin((2 * Math.PI * t) / (E.set.device.swing.period || 2.4)) * numAt(D.move, t, "amp", 1), "c3d-twave dim") : "")
          + (D.dev || []).map((k, i) => dia("dev", i, k, (H.LED_STATES.find((x) => x[0] === k.led) || [, k.led])[1], k.led === "falando" ? " lit" : "")).join("");
      } else if (r.id === "move") {
        const m = E.set.motion;
        inner = wave(r.h, (t) => Math.sin((2 * Math.PI * t) / (m.period || 6)) * numAt(D.move, t, "amp", 1), "c3d-twave")
          + (D.move || []).map((k, i) => dia("move", i, k, `balanço ×${(k.amp ?? 1).toFixed(1).replace(".", ",")}`)).join("");
      } else if (r.id === "sound") inner = sound(r.h);
      return `<div class="c3d-trow" data-row="${esc(r.id)}" style="height:${r.h}px">${inner}</div>`;
    }).join("");
    $(".c3d-trows").innerHTML = html;
    playhead();
  }
  // a wave across the row (the boat's roll, the swing), scaled by the amplitude keys
  function wave(h, f, cls) {
    const [a, b] = range(), n = 160, pts = [];
    for (let i = 0; i <= n; i++) { const t = a + ((b - a) * i) / n; pts.push(`${((i / n) * 1000).toFixed(1)},${(h / 2 - f(t) * (h / 2 - 5)).toFixed(1)}`); }
    return `<svg class="${cls}" viewBox="0 0 1000 ${h}" preserveAspectRatio="none"><polyline points="${pts.join(" ")}"/></svg>`;
  }
  // the cut's sound as bars (env: t0, dt and one base-36 digit per step)
  function sound(h) {
    const env = cut().env, [a, b] = range(), bars = [];
    for (let i = 0; i < env.v.length; i++) {
      const t = env.t0 + i * env.dt;
      if (t < a || t > b) continue;
      const v = parseInt(env.v[i], 36) / 35, y = Math.max(0.6, v * (h / 2 - 3));
      bars.push(`<rect x="${(((t - a) / (b - a)) * 1000).toFixed(1)}" y="${(h / 2 - y).toFixed(1)}" width="1.6" height="${(2 * y).toFixed(1)}"/>`);
    }
    return `<svg class="c3d-tsound" viewBox="0 0 1000 ${h}" preserveAspectRatio="none">${bars.join("")}</svg>`;
  }
  function playhead() {
    const ph = $(".c3d-tph");
    if (!ph || !T.data) return;
    ph.style.left = `${X(T.t)}%`;
    const tt = $(".c3d-ttime");
    if (tt) tt.innerHTML = `<b>${fmt(T.t)}</b> · ${esc(shotAt(T.t)?.title || "")}`;
    const cur = shotAt(T.t);
    T.el.querySelectorAll(".c3d-tshot").forEach((x) => x.classList.toggle("on", T.data.shots[+x.dataset.i] === cur));
  }
  // the open key: its values under the cut's second, above the timeline
  function pop() {
    const p = $(".c3d-tpop");
    if (!p) return;
    if (T.menu && T.shown() && T.busy == null) { exportMenu(p); return; }
    const ks = T.sel && keysOf(T.sel.row), k = ks?.[T.sel.i];
    if (!k || !T.shown()) { p.hidden = true; return; }
    const row = T.sel.row, seg = (cur) => `<span class="c3d-seg">${EASES.map(([v, l]) => `<button data-tk="ease" data-v="${v}" class="${(cur || "suave") === v ? "on" : ""}">${l}</button>`).join("")}</span>`;
    const del = `<button class="c3d-tlink" data-tk="del" title="Apagar este keyframe (Delete)">Apagar</button>`;
    let title = "", body = "";
    if (row === "cam") {
      title = `Câmera · ${esc(shotAt(k.t).title)} · ${fmt(k.t)}`;
      body = `<div class="c3d-tline"><button class="c3d-tchip" data-tk="grab" title="O que a câmera mostra agora vira este keyframe">Gravar a câmera de agora</button></div>
        <div class="c3d-tline"><label>Lente</label><select data-tk="lens">${H.LENSES.map((mm) => `<option value="${mm}"${mm === Math.round(k.lens) ? " selected" : ""}>${mm}mm</option>`).join("")}</select></div>
        <div class="c3d-tline"><label>Chega</label>${seg(k.ease)}</div>
        <div class="c3d-tline"><label>Tremor de mão</label><input type="range" data-tk="shake" min="0" max="1" step="0.05" value="${k.shake || 0}"></div>`;
    } else if (row.startsWith("fig:")) {
      const f = E.figs.find((x) => x.key === row.slice(4));
      title = `${esc(f?.name || "")} · ${fmt(k.t)}`;
      body = `<div class="c3d-tline"><button class="c3d-tchip" data-tk="grab" title="A pose e o lugar de agora viram este keyframe">Gravar a pose de agora</button></div><div class="c3d-tline"><label>Chega</label>${seg(k.ease)}</div>`;
    } else if (row === "dev") {
      title = `${esc(H.PRODUCT?.title || "Produto")} · ${fmt(k.t)}`;
      body = `<div class="c3d-tline"><label>Luz</label><select data-tk="led">${H.LED_STATES.map(([v, l]) => `<option value="${v}"${k.led === v ? " selected" : ""}>${l}</option>`).join("")}</select></div>
        <div class="c3d-tline"><label>Virado</label><button class="c3d-tchip" data-tk="grab" title="Para onde ele está virado agora no 3D vira este keyframe">Gravar o giro de agora</button>${k.ry != null ? `<output>${Math.round(k.ry)}°</output>` : ""}</div>`;
    } else if (row === "move") {
      title = `${esc(E.set.motion?.label || "Movimento")} · ${fmt(k.t)}`;
      body = `<div class="c3d-tline"><label>Balanço</label><input type="range" data-tk="amp" min="0" max="2" step="0.05" value="${k.amp ?? 1}"><output>×${(k.amp ?? 1).toFixed(2).replace(".", ",")}</output></div><div class="c3d-tline"><label>Chega</label>${seg(k.ease)}</div>`;
    }
    p.innerHTML = `<div class="c3d-tptop"><b>${title}</b><button class="c3d-tx" data-tk="close" aria-label="Fechar">×</button></div>${body}<div class="c3d-tline end">${del}</div>`;
    p.hidden = false;
    const lane = $(".c3d-tlane"), lr = lane.getBoundingClientRect(), er = T.el.getBoundingClientRect();
    const x = lr.left - er.left + (X(k.t) / 100) * lr.width;
    p.style.left = `${clamp(x - 24, 8, er.width - 330)}px`;
  }

  // ---------- pointer and keys ----------
  const tOf = (cx) => { const r = $(".c3d-tlane").getBoundingClientRect(), [a, b] = range(); return clamp(a + ((cx - r.left) / r.width) * (b - a), a, b); };
  function bind() {
    const el = T.el;
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || !T.data || T.busy != null) return;
      const k = e.target.closest("[data-tk]")?.dataset.tk;
      const inLane = e.target.closest(".c3d-tlane");
      if (!inLane || (k && !["k", "edge", "shot"].includes(k))) return;
      e.preventDefault();
      T.pause();
      T.menu = false;
      const x0 = e.clientX;
      let moved = false;
      if (k === "k") {
        const row = e.target.dataset.row, i = +e.target.dataset.i, ks = keysOf(row), key = ks[i];
        T.sel = { row, i };
        const own = row === "cam" ? T.data.shots[key.s ?? shotIx(key.t)] : null;
        drag(e, (ev) => { if (Math.abs(ev.clientX - x0) > 3) moved = true; if (moved) { let t = +tOf(ev.clientX).toFixed(2); if (own) t = clamp(t, own.in, own.out); key.t = t; lane(); T.seek(own ? Math.min(t, own.out - 0.01) : t); } },
          () => { if (moved) H.commit(); T.render(); if (!moved) T.seek(key.t); });
        T.render();
      } else if (k === "edge") {
        const i = +e.target.dataset.i, side = e.target.dataset.e, S = T.data.shots, s = S[i];
        const prev = side === "in" ? S[i - 1] : null, next = side === "out" ? S[i + 1] : null;
        const joined = (prev && Math.abs(prev.out - s.in) < EPS) || (next && Math.abs(next.in - s.out) < EPS);
        drag(e, (ev) => {
          moved = true;
          let t = +tOf(ev.clientX).toFixed(2);
          if (side === "in") { t = clamp(t, prev ? prev.in + 0.2 : -1e9, s.out - 0.2); if (joined) prev.out = t; s.in = t; }
          else { t = clamp(t, s.in + 0.2, next ? next.out - 0.2 : 1e9); if (joined) next.in = t; s.out = t; }
          lane(); T.seek(t);
        }, () => { if (moved) { H.commit(); T.render(); } });
      } else {
        T.sel = null;
        const go = (ev) => T.seek(tOf(ev.clientX));
        go(e);
        drag(e, go, () => { T.render(); });
      }
    });
    el.addEventListener("click", (e) => {
      const b = e.target.closest("[data-tk]");
      if (!b || !T.data || T.busy != null) return;
      const k = b.dataset.tk;
      if (k === "play") T.playing ? T.pause() : T.play();
      else if (k === "export") { T.menu = !T.menu; T.sel = null; T.render(); }
      else if (k === "export-go") { T.menu = false; T.render(); H.exportScene?.(b.dataset.v); }
      else if (k === "loop") { T.loop = !T.loop; head(); }
      // another version of the cut: its timeline from the set (it is saved with the scene only once something is edited in it)
      else if (k === "cut") { const i = +b.dataset.v; if (i !== (T.data.alt || 0)) { T.pause(); T.sel = null; T.data = defaults(i); T.render(); T.seek(span()[0]); } }
      else if (k === "key") T.addKey();
      else if (k === "close") { T.sel = null; T.menu = false; T.render(); }
      else if (k === "del") delKey();
      else if (k === "ease") { const key = keysOf(T.sel.row)[T.sel.i]; key.ease = b.dataset.v; H.commit(); pop(); T.seek(T.t); }
      else if (k === "grab") {
        const key = keysOf(T.sel.row)[T.sel.i];
        if (T.sel.row === "cam") Object.assign(key, camNow());
        else if (T.sel.row === "dev") key.ry = +(E.device.rotation.y / D2R).toFixed(1);
        else { const f = E.figs.find((x) => x.key === T.sel.row.slice(4)); if (f) Object.assign(key, { pose: poseOf(f), pos: r3(f.root.position.toArray()), ry: +(f.root.rotation.y / D2R).toFixed(2) }); }
        H.commit(); T.render();
      }
    });
    el.addEventListener("input", (e) => {
      const k = e.target.dataset.tk, key = T.sel && keysOf(T.sel.row)?.[T.sel.i];
      if (!key) return;
      if (k === "shake") { key.shake = +e.target.value; T.seek(T.t); }
      else if (k === "amp") { key.amp = +e.target.value; const o = e.target.parentNode.querySelector("output"); if (o) o.textContent = `×${key.amp.toFixed(2).replace(".", ",")}`; T.seek(T.t); }
    });
    el.addEventListener("change", (e) => {
      const k = e.target.dataset.tk, key = T.sel && keysOf(T.sel.row)?.[T.sel.i];
      if (!key) return;
      if (k === "lens") key.lens = +e.target.value;
      else if (k === "led") key.led = e.target.value;
      else if (!["shake", "amp"].includes(k)) return;
      H.commit(); T.render(); T.seek(T.t);
    });
  }
  function drag(e, move, up) {
    const id = e.pointerId, tgt = e.target;
    tgt.setPointerCapture?.(id);
    const mv = (ev) => { if (ev.pointerId === id) move(ev); };
    const end = (ev) => {
      if (ev.pointerId !== id) return;
      window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", end); window.removeEventListener("pointercancel", end);
      up(ev);
    };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", end); window.addEventListener("pointercancel", end);
  }
  // from the editor's key handler: true when the timeline took the key
  T.onKey = (e, k, take) => {
    if (!T.shown()) return false;
    if (T.busy != null) { take(); return true; } // nothing moves while the video is being made
    if (k === " ") { take(); T.playing ? T.pause() : T.play(); return true; }
    if (k === "k") { take(); T.addKey(); return true; }
    if ((k === "delete" || k === "backspace") && T.sel) { take(); delKey(); return true; }
    if (k === "escape" && (T.sel || T.menu)) { take(); T.sel = null; T.menu = false; T.render(); return true; }
    return false;
  };
  // the editor took the camera back (a drag on the 3D): stop driving it
  T.release = () => { T.hold = false; if (T.playing) T.pause(); viewAt(null); }; // a drag takes the camera: the editor's view
  T.rest = rest;
  return T;
}
