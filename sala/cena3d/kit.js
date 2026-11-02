// Low-poly kit for the Cena 3D sets: cached materials, primitives placed by their base, and the furniture and
// architecture the approved locations need. Meters, y up; a piece faces +z (its front) until rotated. Angles in degrees.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.170.0/+esm";

export { THREE };
export const D2R = Math.PI / 180;

// ---------- materials ----------
const MATS = new Map();
// o: { metal, rough, emit (color), ei (emissive intensity), opacity, double, flat }
export function mat(color, o = {}) {
  const k = JSON.stringify([color, o]);
  if (MATS.has(k)) return MATS.get(k);
  const m = new THREE.MeshStandardMaterial({ color, metalness: o.metal ?? 0, roughness: o.rough ?? 0.86, flatShading: !!o.flat });
  if (o.emit) { m.emissive = new THREE.Color(o.emit); m.emissiveIntensity = o.ei ?? 1; }
  if (o.opacity != null && o.opacity < 1) { m.transparent = true; m.opacity = o.opacity; m.depthWrite = false; }
  if (o.double) m.side = THREE.DoubleSide;
  if (o.map) m.map = o.map;
  MATS.set(k, m);
  return m;
}
export const glass = (tint = "#9FB4BE", opacity = 0.22) => mat(tint, { opacity, rough: 0.08, metal: 0.1, double: true });
export const metal = (color = "#A9AFB3", rough = 0.38) => mat(color, { metal: 0.85, rough });
export const glow = (color, ei = 1.6) => mat(color, { emit: color, ei, rough: 0.5 });

// small tiling textures drawn on a canvas (tiles, bricks, parquet): cheap and they make a surface read at a glance
const TEX = new Map();
export function tex(kind, a, b, rep = [1, 1]) {
  const k = `${kind}|${a}|${b}`;
  let t = TEX.get(k);
  if (!t) {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d");
    g.fillStyle = a; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = b; g.fillStyle = b;
    if (kind === "tiles" || kind === "bricks") { // running bond: 4 rows of 2 (subway tile, brick)
      g.lineWidth = kind === "tiles" ? 5 : 9;
      for (let r = 0; r < 4; r++) {
        const y = r * 64;
        g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke();
        for (let x = r % 2 ? 64 : 0; x <= 256; x += 128) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 64); g.stroke(); }
      }
    } else if (kind === "grid") { // square floor tiles
      g.lineWidth = 6; g.strokeRect(0, 0, 256, 256);
    } else if (kind === "parquet") { // herringbone
      g.lineWidth = 4;
      for (let i = -8; i < 16; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32 + 128, 128); g.lineTo(i * 32, 256); g.stroke(); }
    } else if (kind === "planks") {
      g.lineWidth = 4;
      for (let y = 0; y < 256; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
    }
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    TEX.set(k, t);
  }
  const u = t.clone();
  u.repeat.set(rep[0], rep[1]);
  u.needsUpdate = true;
  return u;
}
export const texMat = (kind, a, b, rep, o = {}) => new THREE.MeshStandardMaterial({ map: tex(kind, a, b, rep), roughness: o.rough ?? 0.7, metalness: o.metal ?? 0 });

// ---------- primitives ----------
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new Map(),
  sph: new THREE.SphereGeometry(1, 14, 10),
  ico: new THREE.IcosahedronGeometry(1, 1),
};
const cylGeo = (top, seg) => {
  const k = `${top}|${seg}`;
  if (!G.cyl.has(k)) G.cyl.set(k, new THREE.CylinderGeometry(top, 1, 1, seg));
  return G.cyl.get(k);
};
function place(mesh, [x, y, z], r = {}) {
  mesh.position.set(x, y, z);
  mesh.rotation.set((r.rx || 0) * D2R, (r.ry || 0) * D2R, (r.rz || 0) * D2R, r.order || "XYZ");
  mesh.castShadow = r.shadow !== false;
  mesh.receiveShadow = true;
  if (r.name) mesh.name = r.name;
  return mesh;
}
// a box standing on y (its base), centered on x and z; r.center = y is its center
export function box(g, [w, h, d], [x, y, z], m, r = {}) {
  const mesh = new THREE.Mesh(G.box, m);
  mesh.scale.set(w, h, d);
  place(mesh, [x, r.center ? y : y + h / 2, z], r);
  g.add(mesh);
  return mesh;
}
// a cylinder (or a cone, top = top radius / bottom radius) standing on y
export function cyl(g, rad, h, [x, y, z], m, r = {}) {
  const mesh = new THREE.Mesh(cylGeo(r.top ?? 1, r.seg || 12), m);
  mesh.scale.set(rad, h, rad);
  place(mesh, [x, r.center ? y : y + h / 2, z], r);
  g.add(mesh);
  return mesh;
}
export function sphere(g, [rx, ry, rz], [x, y, z], m, r = {}) {
  const mesh = new THREE.Mesh(r.lowpoly ? G.ico : G.sph, m);
  mesh.scale.set(rx, ry, rz);
  place(mesh, [x, y, z], r);
  g.add(mesh);
  return mesh;
}
// a thin box between two points (pipes, rails, bars, cords)
export function bar(g, a, b, t, m, r = {}) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const mesh = r.round ? new THREE.Mesh(cylGeo(1, 8), m) : new THREE.Mesh(G.box, m);
  if (r.round) mesh.scale.set(t / 2, len, t / 2); else mesh.scale.set(t, len, t);
  mesh.position.copy(A).add(B).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  mesh.castShadow = r.shadow !== false;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}
export function torus(g, R, t, [x, y, z], m, r = {}) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(R, t, r.tseg || 6, r.seg || 24, r.arc ? r.arc * D2R : Math.PI * 2), m);
  place(mesh, [x, y, z], r);
  g.add(mesh);
  return mesh;
}
export function group(parent, [x, y, z] = [0, 0, 0], ry = 0, name = "") {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry * D2R;
  if (name) g.name = name;
  parent.add(g);
  return g;
}
// a flat floor or ground (receives shadows); y is its top
export function floor(g, [w, d], [x, y, z], m) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}
// many copies of one mesh: [[x,y,z, ry, sx, sy, sz]...]; one draw call for a forest or a vineyard
export function many(g, geo, m, list, { shadow = true } = {}) {
  const im = new THREE.InstancedMesh(geo, m, list.length);
  const o = new THREE.Object3D();
  list.forEach(([x, y, z, ry = 0, sx = 1, sy = sx, sz = sx, rx = 0, rz = 0], i) => {
    o.position.set(x, y, z);
    o.rotation.set(rx * D2R, ry * D2R, rz * D2R);
    o.scale.set(sx, sy, sz);
    o.updateMatrix();
    im.setMatrixAt(i, o.matrix);
  });
  im.castShadow = shadow;
  im.receiveShadow = true;
  g.add(im);
  return im;
}
export const unitBox = () => G.box;
export const unitCyl = (top = 1, seg = 10) => cylGeo(top, seg);

// a deterministic random stream, so a set looks the same every time it loads
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// ---------- architecture ----------
// A wall along local x from 0 to len, thickness t (centered on z), with rectangular holes [x0, x1, y0, y1]
export function wall(g, { len, h, t = 0.15, m, at = [0, 0, 0], ry = 0, holes = [] }) {
  const w = group(g, at, ry);
  let cx = 0;
  [...holes].sort((a, b) => a[0] - b[0]).forEach(([x0, x1, y0, y1]) => {
    if (x0 > cx) box(w, [x0 - cx, h, t], [(cx + x0) / 2, 0, 0], m);
    if (y0 > 0) box(w, [x1 - x0, y0, t], [(x0 + x1) / 2, 0, 0], m);
    if (y1 < h) box(w, [x1 - x0, h - y1, t], [(x0 + x1) / 2, y1, 0], m);
    cx = Math.max(cx, x1);
  });
  if (cx < len) box(w, [len - cx, h, t], [(cx + len) / 2, 0, 0], m);
  return w;
}
// a window or glass door in a hole: frame, mullions (cols × rows panes), glass; centered at x, base at y
export function windowFrame(g, { w, h, at, ry = 0, cols = 1, rows = 1, frame = "#2C3133", f = 0.05, depth = 0.08, glassTint, glassOpacity, sill }) {
  const o = group(g, at, ry);
  const fm = typeof frame === "string" ? mat(frame, { rough: 0.6 }) : frame;
  box(o, [w, f, depth], [0, 0, 0], fm);
  box(o, [w, f, depth], [0, h - f, 0], fm);
  box(o, [f, h, depth], [-w / 2 + f / 2, 0, 0], fm);
  box(o, [f, h, depth], [w / 2 - f / 2, 0, 0], fm);
  for (let i = 1; i < cols; i++) box(o, [f * 0.8, h, depth * 0.8], [-w / 2 + (w * i) / cols, 0, 0], fm);
  for (let j = 1; j < rows; j++) box(o, [w, f * 0.8, depth * 0.8], [0, (h * j) / rows - f * 0.4, 0], fm);
  if (glassOpacity !== 0) box(o, [w - f, h - f, 0.01], [0, f / 2, 0], glass(glassTint, glassOpacity), { shadow: false });
  if (sill) box(o, [w + 0.1, 0.04, sill.d || 0.2], [0, -0.04, (sill.d || 0.2) / 2 - depth / 2], mat(sill.color || "#E8E4DA"));
  return o;
}
export function door(g, { w = 0.9, h = 2.1, at, ry = 0, color = "#6B4A33", frame = "#E9E4DA", open = 0 }) {
  const o = group(g, at, ry);
  const fm = mat(frame);
  box(o, [0.07, h + 0.07, 0.16], [-w / 2 - 0.035, 0, 0], fm);
  box(o, [0.07, h + 0.07, 0.16], [w / 2 + 0.035, 0, 0], fm);
  box(o, [w + 0.14, 0.07, 0.16], [0, h, 0], fm);
  const leaf = group(o, [-w / 2, 0, 0], -open);
  box(leaf, [w, h, 0.045], [w / 2, 0, 0], mat(color, { rough: 0.6 }));
  return o;
}

// ---------- furniture (origin on the floor, front = +z) ----------
export function table(g, { w, d, h = 0.75, top = "#B88B5A", legs = "#7A5A3A", at, ry = 0, t = 0.04, leg = 0.05, style = "4" }) {
  const o = group(g, at, ry);
  box(o, [w, t, d], [0, h - t, 0], mat(top, { rough: 0.55 }));
  const lm = mat(legs, { rough: 0.6 });
  if (style === "pedestal") {
    cyl(o, 0.04, h - t, [0, 0, 0], metal("#222", 0.5));
    box(o, [0.5, 0.03, 0.08], [0, 0, 0], metal("#222", 0.5));
    box(o, [0.08, 0.03, 0.5], [0, 0, 0], metal("#222", 0.5));
  } else if (style === "trestle") {
    box(o, [w * 0.12, h - t, d * 0.55], [-w * 0.3, 0, 0], lm);
    box(o, [w * 0.12, h - t, d * 0.55], [w * 0.3, 0, 0], lm);
  } else {
    const ix = w / 2 - leg, iz = d / 2 - leg;
    for (const [x, z] of [[-ix, -iz], [ix, -iz], [-ix, iz], [ix, iz]]) box(o, [leg, h - t, leg], [x, 0, z], lm);
  }
  return o;
}
export function roundTable(g, { r = 0.4, h = 0.75, top = "#C9A06A", at, base = "#2A2A2A" }) {
  const o = group(g, at);
  cyl(o, r, 0.035, [0, h - 0.035, 0], mat(top, { rough: 0.5 }), { seg: 20 });
  cyl(o, 0.035, h - 0.035, [0, 0, 0], mat(base, { rough: 0.5, metal: 0.4 }));
  cyl(o, 0.24, 0.025, [0, 0, 0], mat(base, { rough: 0.5, metal: 0.4 }), { seg: 16 });
  return o;
}
// chairs: "wood" (café), "bentwood" (bistro), "eames" (office, star base), "armchair" (wood frame + cushions)
export function chair(g, { style = "wood", color = "#B88B5A", seat, at, ry = 0 }) {
  const o = group(g, at, ry);
  const m = mat(color, { rough: 0.6 });
  if (style === "eames") {
    const al = metal("#B9BDC0", 0.35);
    cyl(o, 0.03, 0.42, [0, 0, 0], al);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; bar(o, [0, 0.05, 0], [Math.sin(a) * 0.32, 0.03, Math.cos(a) * 0.32], 0.035, al); }
    box(o, [0.48, 0.06, 0.46], [0, 0.42, 0], mat(seat || color));
    box(o, [0.46, 0.5, 0.05], [0, 0.48, -0.24], mat(seat || color), { rx: -8 });
    bar(o, [-0.25, 0.46, 0.18], [-0.25, 0.62, -0.2], 0.03, al);
    bar(o, [0.25, 0.46, 0.18], [0.25, 0.62, -0.2], 0.03, al);
    return o;
  }
  if (style === "armchair") {
    const cm = mat(seat || "#E8DFD0");
    for (const x of [-0.29, 0.29]) {
      box(o, [0.05, 0.62, 0.05], [x, 0, 0.26], m); box(o, [0.05, 0.95, 0.05], [x, 0, -0.27], m);
      box(o, [0.06, 0.04, 0.6], [x, 0.62, 0], m);
    }
    box(o, [0.6, 0.05, 0.58], [0, 0.4, 0], m);
    box(o, [0.54, 0.1, 0.5], [0, 0.45, 0.02], cm);
    box(o, [0.6, 0.45, 0.04], [0, 0.5, -0.28], m, { rx: -10 });
    box(o, [0.5, 0.38, 0.1], [0, 0.56, -0.22], cm, { rx: -10 });
    return o;
  }
  const legs = style === "bentwood" ? 0.025 : 0.035;
  const sh = 0.46;
  for (const [x, z] of [[-0.19, 0.19], [0.19, 0.19], [-0.19, -0.19], [0.19, -0.19]]) box(o, [legs, sh, legs], [x, 0, z], m);
  box(o, [0.44, 0.04, 0.44], [0, sh - 0.04, 0], mat(seat || color, { rough: 0.6 }));
  if (style === "bentwood") {
    torus(o, 0.2, 0.015, [0, sh + 0.38, -0.2], m, { rx: 0, seg: 16, arc: 180 });
    bar(o, [-0.2, sh, -0.2], [-0.2, sh + 0.38, -0.2], 0.03, m);
    bar(o, [0.2, sh, -0.2], [0.2, sh + 0.38, -0.2], 0.03, m);
    box(o, [0.36, 0.05, 0.02], [0, sh + 0.2, -0.2], m);
  } else {
    box(o, [0.04, 0.42, 0.04], [-0.19, sh, -0.19], m); box(o, [0.04, 0.42, 0.04], [0.19, sh, -0.19], m);
    box(o, [0.42, 0.12, 0.03], [0, sh + 0.28, -0.2], m);
  }
  return o;
}
export function sofa(g, { w = 2.2, d = 0.9, color = "#4A3022", legs = "#2A1C14", at, ry = 0, seatH = 0.42 }) {
  const o = group(g, at, ry);
  const m = mat(color, { rough: 0.55 });
  box(o, [w, seatH - 0.1, d], [0, 0.1, 0], m);
  box(o, [w - 0.3, 0.14, d - 0.2], [0, seatH - 0.02, 0.06], m);
  box(o, [w, 0.42, 0.2], [0, seatH, -d / 2 + 0.1], m);
  box(o, [0.16, 0.24, d], [-w / 2 + 0.08, seatH, 0], m);
  box(o, [0.16, 0.24, d], [w / 2 - 0.08, seatH, 0], m);
  for (const x of [-w / 2 + 0.1, w / 2 - 0.1]) for (const z of [-d / 2 + 0.1, d / 2 - 0.1]) cyl(o, 0.025, 0.1, [x, 0, z], mat(legs));
  return o;
}
export function bed(g, { w = 1.6, l = 2.05, h = 0.55, sheet = "#EEEAE2", throwC, head = "#6B4A33", headH = 1.1, at, ry = 0 }) {
  const o = group(g, at, ry);
  box(o, [w, 0.3, l], [0, 0.08, 0], mat(head));
  box(o, [w - 0.04, h - 0.38, l - 0.06], [0, 0.38, 0.02], mat(sheet));
  box(o, [w + 0.06, headH, 0.08], [0, 0, -l / 2 - 0.02], mat(head, { rough: 0.6 }));
  for (const x of [-w / 4, w / 4]) box(o, [w / 2 - 0.08, 0.14, 0.38], [x, h, -l / 2 + 0.26], mat("#F4F1EA"), { rx: -12 });
  if (throwC) box(o, [w + 0.04, 0.05, l * 0.45], [0, h - 0.02, l * 0.25], mat(throwC));
  return o;
}
export function nightstand(g, { color = "#6B4A33", at, ry = 0, w = 0.5, d = 0.4, h = 0.6 }) {
  const o = group(g, at, ry);
  box(o, [w, h, d], [0, 0, 0], mat(color, { rough: 0.55 }));
  box(o, [w - 0.06, 0.16, 0.01], [0, h - 0.22, d / 2], mat("#5A3D29", { rough: 0.6 }));
  return o;
}
export function shelves(g, { w = 1.2, h = 2, d = 0.35, n = 4, color = "#EDEBE6", frame, at, ry = 0, books = true, seed = 3 }) {
  const o = group(g, at, ry);
  const m = mat(color, { rough: 0.7 });
  const fm = frame ? metal(frame, 0.5) : m;
  box(o, [0.03, h, d], [-w / 2, 0, 0], fm); box(o, [0.03, h, d], [w / 2, 0, 0], fm);
  const R = rng(seed);
  for (let i = 0; i <= n; i++) {
    const y = (h - 0.03) * (i / n);
    box(o, [w, 0.03, d], [0, y, 0], m);
    if (books && i < n && R() > 0.25) {
      let x = -w / 2 + 0.05;
      const end = -w / 2 + w * (0.4 + R() * 0.5);
      while (x < end) {
        const bw = 0.03 + R() * 0.03, bh = 0.18 + R() * 0.12;
        box(o, [bw, bh, d * 0.7], [x + bw / 2, y + 0.03, 0], mat(["#7A4B3A", "#2F4A5C", "#C9B79A", "#3D5A40", "#8C2F2B", "#D8D2C4"][Math.floor(R() * 6)]), { shadow: false });
        x += bw + 0.004;
      }
    }
  }
  return o;
}
export function lamp(g, { kind = "table", at, shade = "#E9DCC3", base = "#6E5B47", h, light = "#FFC98A" }) {
  const o = group(g, at);
  const sm = mat(shade, { emit: light, ei: 0.55 });
  if (kind === "floor") {
    const H = h || 1.55;
    cyl(o, 0.16, 0.03, [0, 0, 0], mat(base, { metal: 0.5, rough: 0.4 }));
    cyl(o, 0.015, H - 0.3, [0, 0.03, 0], mat(base, { metal: 0.5, rough: 0.4 }));
    cyl(o, 0.22, 0.32, [0, H - 0.32, 0], sm, { top: 0.68, seg: 16 });
  } else {
    const H = h || 0.55;
    sphere(o, [0.09, 0.12, 0.09], [0, 0.12, 0], mat(base, { rough: 0.5 }), { lowpoly: true });
    cyl(o, 0.01, H * 0.35, [0, 0.22, 0], mat("#B8A27A", { metal: 0.6, rough: 0.4 }));
    cyl(o, 0.17, 0.2, [0, H - 0.2, 0], sm, { top: 0.65, seg: 14 });
  }
  return o;
}
// a pendant: cord from the ceiling (y = ceil) down to a shade at height y
export function pendant(g, { at, ceil, kind = "cone", color = "#1C1C1C", r = 0.16, light = "#FFD6A0" }) {
  const [x, y, z] = at;
  bar(g, [x, ceil, z], [x, y + 0.2, z], 0.012, mat("#111"), { round: true, shadow: false });
  if (kind === "basket") {
    cyl(g, r, r * 1.5, [x, y, z], mat(color, { rough: 0.9, emit: light, ei: 0.25 }), { top: 0.45, seg: 12 });
  } else if (kind === "lantern") {
    box(g, [0.18, 0.28, 0.18], [x, y, z], mat("#1E1E1E", { metal: 0.4, rough: 0.5 }));
    box(g, [0.13, 0.2, 0.13], [x, y + 0.04, z], mat("#FFE2B0", { emit: light, ei: 0.8, opacity: 0.85 }), { shadow: false });
  } else {
    cyl(g, r, r * 0.9, [x, y, z], mat(color, { metal: 0.3, rough: 0.5 }), { top: 0.25, seg: 12 });
    sphere(g, [r * 0.55, r * 0.3, r * 0.55], [x, y + 0.02, z], glow(light, 2), { shadow: false });
  }
}
export function plant(g, { at, h = 0.8, pot = "#B4673F", leaf = "#3F6B3A", r, seed = 1, potH, hanging = false }) {
  const o = group(g, at);
  const R = rng(seed);
  const rr = r || h * 0.38;
  const ph = potH ?? Math.min(0.35, h * 0.32);
  if (!hanging) cyl(o, rr * 0.55, ph, [0, 0, 0], mat(pot, { rough: 0.8 }), { top: 1.18, seg: 12 });
  const lm = mat(leaf, { rough: 0.9, flat: true });
  const n = 3 + Math.floor(h * 3);
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI * 2, d = R() * rr * 0.6;
    const y = hanging ? -R() * h : ph + (h - ph) * (0.35 + R() * 0.6);
    sphere(o, [rr * (0.45 + R() * 0.3), rr * (0.35 + R() * 0.3), rr * (0.45 + R() * 0.3)], [Math.cos(a) * d, y, Math.sin(a) * d], lm, { lowpoly: true });
  }
  return o;
}
export function rug(g, { w, d, color = "#8E7B66", at, ry = 0 }) {
  const o = group(g, at, ry);
  box(o, [w, 0.012, d], [0, 0, 0], mat(color, { rough: 1 }), { shadow: false });
  return o;
}
export function frame(g, { w, h, at, ry = 0, color = "#2A2622", art = "#CFCBC2", mat2 = "#EDE9E0" }) {
  const o = group(g, at, ry);
  box(o, [w, h, 0.03], [0, 0, 0], mat(color));
  box(o, [w - 0.08, h - 0.08, 0.035], [0, 0.04, 0], mat(mat2));
  box(o, [w * 0.72, h * 0.66, 0.04], [0, (h - h * 0.66) / 2, 0], mat(art));
  return o;
}
// cars: a low-poly hatchback; police adds the light bar and the white doors
export function car(g, { at, ry = 0, color = "#7D8287", police = false }) {
  const o = group(g, at, ry);
  const body = mat(color, { metal: 0.4, rough: 0.35 });
  box(o, [1.7, 0.62, 3.9], [0, 0.3, 0], body);
  box(o, [1.5, 0.5, 2.1], [0, 0.92, -0.25], body);
  box(o, [1.45, 0.42, 0.02], [0, 0.96, 0.82], glass("#1A2228", 0.85), { rx: -32 });
  box(o, [1.52, 0.38, 1.8], [0, 0.98, -0.25], glass("#1A2228", 0.75), { shadow: false });
  const tm = mat("#151515", { rough: 0.9 });
  for (const x of [-0.78, 0.78]) for (const z of [-1.25, 1.3]) cyl(o, 0.31, 0.22, [x, 0.31, z], tm, { rz: 90, center: true, seg: 14 });
  box(o, [1.6, 0.1, 0.04], [0, 0.45, 1.96], mat("#2A2A2A"));
  for (const x of [-0.6, 0.6]) box(o, [0.32, 0.1, 0.03], [x, 0.62, 1.95], glow("#F4F1E6", 1.2));
  for (const x of [-0.65, 0.65]) box(o, [0.26, 0.1, 0.03], [x, 0.7, -1.96], glow("#C3261C", 1));
  if (police) {
    box(o, [0.03, 0.42, 1.6], [0.86, 0.36, 0.1], mat("#F2F2F2"));
    box(o, [0.03, 0.42, 1.6], [-0.86, 0.36, 0.1], mat("#F2F2F2"));
    box(o, [0.5, 0.09, 0.22], [-0.27, 1.17, -0.3], glow("#3A6DFF", 3));
    box(o, [0.5, 0.09, 0.22], [0.27, 1.17, -0.3], glow("#FF2A2A", 3));
  }
  return o;
}
export function barrier(g, { at, ry = 0, w = 2.2 }) {
  const o = group(g, at, ry);
  const m = metal("#B7BCBF", 0.4);
  bar(o, [-w / 2, 0.05, 0], [-w / 2, 1.1, 0], 0.04, m, { round: true });
  bar(o, [w / 2, 0.05, 0], [w / 2, 1.1, 0], 0.04, m, { round: true });
  bar(o, [-w / 2, 1.1, 0], [w / 2, 1.1, 0], 0.04, m, { round: true });
  bar(o, [-w / 2, 0.25, 0], [w / 2, 0.25, 0], 0.03, m, { round: true });
  for (let x = -w / 2 + 0.12; x < w / 2; x += 0.12) bar(o, [x, 0.25, 0], [x, 1.1, 0], 0.012, m, { round: true, shadow: false });
  for (const x of [-w / 2, w / 2]) { bar(o, [x, 0.05, 0], [x - 0.08, 0, 0.35], 0.03, m); bar(o, [x, 0.05, 0], [x + 0.08, 0, -0.35], 0.03, m); }
  return o;
}
// police tape between points at a height (zigzag of thin boxes)
export function tape(g, pts, y = 1.0) {
  const m = mat("#E8C21E", { emit: "#3A3000", ei: 0.4 });
  for (let i = 1; i < pts.length; i++) {
    const [x0, z0] = pts[i - 1], [x1, z1] = pts[i];
    bar(g, [x0, y, z0], [x1, y - 0.04, z1], 0.006, m, { shadow: false }).scale.x = 0.06;
  }
}
// trees: a conifer (tall trunk, cone tiers) and a broadleaf (trunk + lumpy crown)
export function tree(g, { at, h = 8, kind = "broad", trunk = "#4A3B2E", leaf = "#3E5E35", seed = 1, crown }) {
  const o = group(g, at);
  const R = rng(seed);
  const tm = mat(trunk, { rough: 1 });
  const lm = mat(leaf, { rough: 1, flat: true });
  if (kind === "conifer") {
    cyl(o, h * 0.018, h, [0, 0, 0], tm, { top: 0.55, seg: 8 });
    const tiers = 5;
    for (let i = 0; i < tiers; i++) {
      const y = h * (0.5 + (i / tiers) * 0.45), rr = h * 0.09 * (1 - i / tiers) + 0.3;
      cyl(o, rr, h * 0.14, [0, y, 0], lm, { top: 0, seg: 7 });
    }
  } else {
    const c = crown || h * 0.3;
    cyl(o, h * 0.025, h * 0.6, [0, 0, 0], tm, { top: 0.7, seg: 7 });
    for (let i = 0; i < 6; i++) sphere(o, [c * (0.5 + R() * 0.3), c * (0.4 + R() * 0.2), c * (0.5 + R() * 0.3)], [(R() - 0.5) * c, h * 0.62 + R() * c * 0.6, (R() - 0.5) * c], lm, { lowpoly: true });
  }
  return o;
}
export function bush(g, { at, r = 0.5, color = "#3F6B3A", flowers, seed = 2 }) {
  const o = group(g, at);
  const R = rng(seed);
  const lm = mat(color, { rough: 1, flat: true });
  for (let i = 0; i < 4; i++) sphere(o, [r * (0.6 + R() * 0.4), r * (0.5 + R() * 0.3), r * (0.6 + R() * 0.4)], [(R() - 0.5) * r, r * (0.4 + R() * 0.3), (R() - 0.5) * r], lm, { lowpoly: true });
  if (flowers) for (let i = 0; i < 6; i++) sphere(o, [0.07, 0.07, 0.07], [(R() - 0.5) * r * 1.4, r * (0.5 + R() * 0.6), (R() - 0.5) * r * 1.4], mat(flowers, { rough: 0.8 }), { lowpoly: true, shadow: false });
  return o;
}
// a simple house front: wall, roof, door, windows (for streets and the village)
export function house(g, { at, ry = 0, w = 8, h = 3.2, d = 7, wallC = "#E9E2D2", roofC = "#B4593A", trim = "#F4F1EA", door: dc = "#6B4A33", wins = 2, shut = null }) {
  const o = group(g, at, ry);
  box(o, [w, h, d], [0, 0, 0], mat(wallC));
  const slope = 28 * D2R, half = d / 2 + 0.3; // gable roof: two slabs meeting on a ridge along x
  for (const s of [-1, 1]) {
    const slab = box(o, [w + 0.4, 0.1, half / Math.cos(slope)], [0, h + (Math.tan(slope) * half) / 2, (s * half) / 2], mat(roofC, { flat: true }), { center: true });
    slab.rotation.x = s * slope;
  }
  box(o, [1, 2.1, 0.06], [-w * 0.25, 0, d / 2], mat(dc));
  for (let i = 0; i < wins; i++) {
    const x = -w * 0.05 + (i * w * 0.5) / Math.max(1, wins);
    box(o, [1.1, 1.4, 0.06], [x, 1, d / 2], mat("#2E3A40", { rough: 0.3 }));
    box(o, [1.3, 0.1, 0.12], [x, 0.95, d / 2], mat(trim));
    if (shut) for (const s of [-0.85, 0.85]) box(o, [0.55, 1.4, 0.05], [x + s, 1, d / 2 + 0.03], mat(shut));
  }
  return o;
}
// a city block of simple towers (skylines seen through windows): [x, z, w, d, h]
export function skyline(g, list, { color = "#5D646B", lit = "#C9B37E", seed = 4, windows = true } = {}) {
  const R = rng(seed);
  const m = mat(color, { rough: 0.95 });
  list.forEach(([x, z, w, d, h]) => {
    box(g, [w, h, d], [x, 0, z], m, { shadow: false });
    if (windows) for (let k = 0; k < 4; k++) box(g, [w * 0.12, 0.6, 0.02], [x - w * 0.3 + R() * w * 0.6, h * (0.2 + R() * 0.7), z + d / 2 + 0.01], glow(lit, 0.6), { shadow: false });
  });
}
