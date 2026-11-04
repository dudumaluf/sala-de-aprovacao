// Pessoa em 3D (a reference circle's right-click in the studio, sala/estudio.js). fal's SAM 3D Body finds the people in a
// shot and gives their bodies back as one GLB, in the camera's own space: the camera at the origin looking down -Z, Y up,
// as three.js has it. Its metadata has, for each person, the 2D and 3D keypoints and the camera it estimated. This draws
// those bodies at the shot's size, each person a plain mannequin in the Cena 3D's colors (from the camera's left to right:
// orange, blue, yellow, purple, teal, grey), over a transparent background. The studio lays that over the shot and stores
// it as a new card of the shot's item, with the GLB next to it.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.170.0/+esm";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/loaders/GLTFLoader.js/+esm";

// the Cena 3D's mannequins (estudio.js MANNEQUIN, cena3d's cast): [color, the team's word, the prompt's word]
export const BODY_COLORS = [["#F07A2E", "laranja", "orange"], ["#3E8DF0", "azul", "blue"], ["#E4C531", "amarelo", "yellow"], ["#B06BE6", "roxo", "purple"], ["#2FC5A0", "verde-água", "teal"], ["#9AA19C", "cinza", "grey"]];

// The camera of the picture the model saw, in that picture's pixels: f, and the center (cx, cy) where the lens axis
// meets the picture. It is fitted (least squares) to the model's own keypoints: each 3D keypoint, in front of the camera
// (the person's camera translation added, or not, whichever fits), projected u = cx + f·X/Z, v = cy + f·Y/Z against its
// 2D keypoint, so it holds whatever focal length and center the model assumed. When that does not fit (within 1% of the
// picture), its reported focal length with the picture's center.
export function cameraOf(meta, W, H) {
  const people = Array.isArray(meta?.people) ? meta.people : [];
  let best = null;
  for (const moved of [true, false]) {
    const pts = [];
    for (const p of people) {
      const k3 = p?.keypoints_3d, k2 = p?.keypoints_2d, t = (moved && p?.pred_cam_t) || [0, 0, 0];
      if (!Array.isArray(k3) || !Array.isArray(k2)) continue;
      k3.forEach((k, i) => {
        const q = k2[i];
        if (!k || !q) return;
        const Z = k[2] + t[2];
        if (!(Z > 1e-3) || !isFinite(q[0]) || !isFinite(q[1])) return;
        pts.push([(k[0] + t[0]) / Z, (k[1] + t[1]) / Z, q[0], q[1]]);
      });
    }
    if (pts.length < 6) continue;
    let n = 0, Sa = 0, Sb = 0, Sq = 0, Su = 0, Sv = 0, Sx = 0;
    for (const [a, b, u, v] of pts) { n++; Sa += a; Sb += b; Sq += a * a + b * b; Su += u; Sv += v; Sx += a * u + b * v; }
    const den = Sq - (Sa * Sa + Sb * Sb) / n;
    if (!(Math.abs(den) > 1e-12)) continue;
    const f = (Sx - (Su * Sa + Sv * Sb) / n) / den, cx = (Su - f * Sa) / n, cy = (Sv - f * Sb) / n;
    let e = 0;
    for (const [a, b, u, v] of pts) e += (f * a + cx - u) ** 2 + (f * b + cy - v) ** 2;
    const rms = Math.sqrt(e / n);
    if (f > 0 && (!best || rms < best.rms)) best = { f, cx, cy, rms, fit: moved ? "keypoints" : "keypoints (sem translação)" };
  }
  if (best && best.rms <= 0.01 * Math.max(W, H)) return best;
  const p = people.find((x) => x?.focal_length > 0);
  return p ? { f: p.focal_length, cx: W / 2, cy: H / 2, rms: null, fit: "focal" } : null;
}

// the bodies of a SAM 3D Body GLB drawn as a W×H picture of the shot (the model saw a inW×inH copy of it): a canvas with
// the mannequins over transparency, the people (left to right, with their color and where they are, 0–1 of the picture)
// and the camera used
export async function drawBodies({ glb, meta, inW, inH, W, H }) {
  const cam = cameraOf(meta, inW, inH);
  if (!cam) throw new Error("a fal não mandou a câmera");
  const gltf = await new Promise((ok, no) => new GLTFLoader().parse(glb, "", ok, no));
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  // the GPU draws at most this size; a bigger shot is drawn smaller and scaled up over it
  const probe = document.createElement("canvas").getContext("webgl2") || document.createElement("canvas").getContext("webgl");
  if (!probe) throw new Error("este navegador não desenha em 3D (WebGL)");
  const most = Math.min(probe.getParameter(probe.MAX_RENDERBUFFER_SIZE), probe.getParameter(probe.MAX_VIEWPORT_DIMS)[0], 8192);
  probe.getExtension("WEBGL_lose_context")?.loseContext();
  const k = Math.min(1, most / Math.max(W, H)), rw = Math.round(W * k), rh = Math.round(H * k);
  // the camera, from the picture the model saw to the one drawn
  const s = rw / inW, f = cam.f * s, cx = cam.cx * s, cy = cam.cy * s;
  // the people: GLB nodes person_00, person_01… (the keypoint spheres, when the GLB has them, stay out)
  const bodies = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (/^person_/i.test(o.name) || /^person_/i.test(o.parent?.name || "")) bodies.push(o);
    else o.visible = false;
  });
  if (!bodies.length) throw new Error("o GLB veio sem ninguém");
  // where each one falls in the picture, and how far: left to right, they take the colors in order
  const v = new THREE.Vector3();
  let near = Infinity, far = 0;
  for (const m of bodies) {
    const pos = m.geometry.attributes.position, b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      const d = -v.z;
      if (!(d > 1e-3)) continue;
      const u = cx + (f * v.x) / d, w = cy - (f * v.y) / d;
      if (u < b.x0) b.x0 = u; if (u > b.x1) b.x1 = u; if (w < b.y0) b.y0 = w; if (w > b.y1) b.y1 = w;
      if (d < near) near = d; if (d > far) far = d;
    }
    m.userData.box = b;
  }
  if (!isFinite(near)) throw new Error("os corpos ficaram atrás da câmera");
  bodies.sort((a, b) => a.userData.box.x0 + a.userData.box.x1 - (b.userData.box.x0 + b.userData.box.x1));
  const mats = [];
  const people = bodies.map((m, i) => {
    const [color, name, en] = BODY_COLORS[i % BODY_COLORS.length];
    // the GLB has no normals of its own; its vertex color (SAM's light blue) is left out
    m.geometry.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color, metalness: 0, roughness: 0.62 });
    mats.push(mat);
    m.material = mat;
    const b = m.userData.box, cl = (x) => Math.max(0, Math.min(1, x));
    return { color, name, en, box: { x0: cl(b.x0 / rw), y0: cl(b.y0 / rh), x1: cl(b.x1 / rw), y1: cl(b.y1 / rh) } };
  });
  const scene = new THREE.Scene();
  scene.add(root);
  // the Cena 3D's light: a sky and a sun, here from above, the camera's left and in front of the bodies
  scene.add(new THREE.HemisphereLight("#fff", "#444", 1));
  const sun = new THREE.DirectionalLight("#fff", 2);
  sun.position.set(-1, 2, 1.2);
  scene.add(sun, sun.target);
  // a pinhole with the model's focal length and center: the frustum's edges at the near plane, from the picture's edges
  const camera = new THREE.PerspectiveCamera();
  const zn = Math.max(0.01, near * 0.5), zf = far * 2 + 1;
  camera.projectionMatrix.makePerspective((-cx * zn) / f, ((rw - cx) * zn) / f, (cy * zn) / f, (-(rh - cy) * zn) / f, zn, zf);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  camera.updateMatrixWorld(true);
  const renderer = new THREE.WebGLRenderer({ canvas: document.createElement("canvas"), alpha: true, antialias: true, preserveDrawingBuffer: true });
  try {
    renderer.setPixelRatio(1);
    renderer.setSize(rw, rh, false);
    renderer.setClearColor(0x000000, 0);
    renderer.render(scene, camera);
    const out = document.createElement("canvas");
    out.width = rw; out.height = rh;
    out.getContext("2d").drawImage(renderer.domElement, 0, 0);
    return { canvas: out, people, camera: { f, cx, cy, W: rw, H: rh, fit: cam.fit, rms: cam.rms == null ? null : cam.rms * s } };
  } finally {
    root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    mats.forEach((m) => m.dispose());
    renderer.dispose();
    renderer.forceContextLoss();
  }
}

// one line per person for the card's prompt and the toast: "laranja (à esquerda), azul (à direita)"
export function peopleLine(people) {
  const where = (p) => { const c = (p.box.x0 + p.box.x1) / 2; return c < 0.36 ? "à esquerda" : c > 0.64 ? "à direita" : "no meio"; };
  return people.map((p) => (people.length > 1 ? `${p.name} (${where(p)})` : p.name)).join(", ");
}
