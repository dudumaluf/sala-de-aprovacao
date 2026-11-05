// The blocking mannequin: one rig for every scene. A segmented figure (no skinning, like a wooden artist's
// mannequin) on a small skeleton, with two-bone IK on the arms and legs: drag a hand or a foot and the elbow or the
// knee follows, toward its pole. Hand targets live in the chest's space (they follow the body), foot targets in the
// root's (they stay planted, so lowering the pelvis bends the knees). Presets are written as joint angles (FK) and
// baked into IK targets, so every preset can be adjusted by hand afterwards. The squirrel and the bear are simpler
// figures with FK presets only.
import { THREE, D2R, mat } from "./kit.js";

const V = (a) => new THREE.Vector3(...a);
const Q = () => new THREE.Quaternion();

// joint offsets for a 1.75 m adult, facing +z (its left hand is on +x)
const BONES = [
  ["hips", null, [0, 0.92, 0]], ["spine", "hips", [0, 0.12, 0]], ["chest", "spine", [0, 0.18, 0]],
  ["neck", "chest", [0, 0.24, 0]], ["head", "neck", [0, 0.09, 0]],
  ["lUpper", "chest", [0.19, 0.2, 0]], ["lFore", "lUpper", [0, -0.3, 0]], ["lHand", "lFore", [0, -0.26, 0]],
  ["rUpper", "chest", [-0.19, 0.2, 0]], ["rFore", "rUpper", [0, -0.3, 0]], ["rHand", "rFore", [0, -0.26, 0]],
  ["lThigh", "hips", [0.095, -0.05, 0]], ["lShin", "lThigh", [0, -0.43, 0]], ["lFoot", "lShin", [0, -0.4, 0]],
  ["rThigh", "hips", [-0.095, -0.05, 0]], ["rShin", "rThigh", [0, -0.43, 0]], ["rFoot", "rShin", [0, -0.4, 0]],
];
// sign flips the hinge so knees bend forward and elbows backward; pole = where the elbow/knee points, in the space
export const LIMBS = {
  lArm: { a: "lUpper", b: "lFore", c: "lHand", space: "chest", pole: [0.45, -0.25, -1], sign: -1, label: "mão esquerda" },
  rArm: { a: "rUpper", b: "rFore", c: "rHand", space: "chest", pole: [-0.45, -0.25, -1], sign: -1, label: "mão direita" },
  lLeg: { a: "lThigh", b: "lShin", c: "lFoot", space: "root", pole: [0.08, 0, 1], sign: 1, label: "pé esquerdo" },
  rLeg: { a: "rThigh", b: "rShin", c: "rFoot", space: "root", pole: [-0.08, 0, 1], sign: 1, label: "pé direito" },
};

// Presets in FK: joint → [x, y, z] degrees (XYZ), hips: [dx, dy, dz] meters from the standing pelvis, hipsRot degrees.
// Signs: thigh/upper arm x < 0 swings forward; shin x > 0 bends the knee; forearm x < 0 bends the elbow; upper arm
// z > 0 lifts the left arm sideways (z < 0 the right one).
const ARMS_DOWN = { lUpper: [0, 0, 7], rUpper: [0, 0, -7], lFore: [-10, 0, 0], rFore: [-10, 0, 0] };
const SEAT = { hips: [0, -0.42, -0.05], lThigh: [-88, 0, 3], rThigh: [-88, 0, -3], lShin: [88, 0, 0], rShin: [88, 0, 0] };
export const POSES = {
  stand: { label: "Em pé", ...ARMS_DOWN },
  hold: { label: "Em pé, segurando", lUpper: [-25, 0, 12], rUpper: [-25, 0, -12], lFore: [-80, -25, 0], rFore: [-80, 25, 0], neck: [12, 0, 0], head: [10, 0, 0] },
  phone: { label: "Celular na mão", ...ARMS_DOWN, neck: [14, 0, 0], head: [12, 0, 0], ik: { rArm: [-0.07, 0.12, 0.3, [-70, 0, 0], [-1, -0.6, -0.3]] } },
  walk: { label: "Andando", lThigh: [18, 0, 0], rThigh: [-22, 0, 0], lShin: [12, 0, 0], rShin: [8, 0, 0], lUpper: [-18, 0, 6], rUpper: [16, 0, -6], lFore: [-20, 0, 0], rFore: [-10, 0, 0], hips: [0, -0.02, 0] },
  run: { label: "Correndo", lThigh: [35, 0, 0], rThigh: [-60, 0, 0], lShin: [70, 0, 0], rShin: [45, 0, 0], lUpper: [-45, 0, 8], rUpper: [40, 0, -8], lFore: [-80, 0, 0], rFore: [-75, 0, 0], spine: [12, 0, 0], chest: [6, 0, 0], hips: [0, -0.07, 0] },
  runDevice: { label: "Correndo com algo no colo", lThigh: [35, 0, 0], rThigh: [-60, 0, 0], lShin: [70, 0, 0], rShin: [45, 0, 0], spine: [10, 0, 0], chest: [4, 0, 0], neck: [-12, 0, 0], head: [-10, 25, 0], hips: [0, -0.07, 0],
    ik: { lArm: [0.12, -0.05, 0.16, [0, 0, -90], [1, -0.6, -0.4]], rArm: [-0.13, 0.08, 0.15, [0, 0, 90], [-1, -0.6, -0.4]] } },
  sit: { label: "Sentado", ...SEAT, lUpper: [-12, 0, 6], rUpper: [-12, 0, -6], lFore: [-55, 0, 0], rFore: [-55, 0, 0] },
  sitHold: { label: "Sentado, segurando (celular, carta)", ...SEAT, lUpper: [-28, 0, 12], rUpper: [-28, 0, -12], lFore: [-85, -25, 0], rFore: [-85, 25, 0], neck: [14, 0, 0], head: [12, 0, 0] },
  laptop: { label: "No notebook", ...SEAT, spine: [8, 0, 0], lUpper: [-35, 0, 10], rUpper: [-35, 0, -10], lFore: [-60, -15, 0], rFore: [-60, 15, 0], neck: [12, 0, 0], head: [10, 0, 0] },
  shoe: { label: "Calçando o tênis", ...SEAT, lThigh: [-70, 0, 6], lShin: [20, 0, 0], spine: [35, 0, 0], chest: [20, 0, 0], lUpper: [-75, 0, 6], rUpper: [-70, 0, -6], lFore: [-15, 0, 0], rFore: [-20, 0, 0], neck: [10, 0, 0] },
  earring: { label: "Pondo o brinco", ...ARMS_DOWN, neck: [0, 0, 6], head: [4, 15, 9], ik: { rArm: [-0.14, 0.3, 0.05, [0, 0, 170], [-1, -0.2, 0.1]] } },
  wheel: { label: "No leme", lUpper: [-50, 0, 14], rUpper: [-50, 0, -14], lFore: [-45, -20, 0], rFore: [-45, 20, 0], spine: [4, 0, 0], lThigh: [0, 0, 6], rThigh: [0, 0, -6] },
  crouch: { label: "Agachado", hips: [0, -0.5, -0.05], lThigh: [-115, 0, 12], rThigh: [-115, 0, -12], lShin: [125, 0, 0], rShin: [125, 0, 0], spine: [30, 0, 0], chest: [15, 0, 0], lUpper: [-60, 0, 8], rUpper: [-60, 0, -8], lFore: [-40, 0, 0], rFore: [-40, 0, 0], neck: [-10, 0, 0], head: [-10, 0, 0] },
  kneel: { label: "Ajoelhado", hips: [0, -0.38, 0], lThigh: [-90, 0, 4], lShin: [90, 0, 0], rThigh: [-5, 0, -4], rShin: [95, 0, 0], spine: [15, 0, 0], lUpper: [-55, 0, 8], rUpper: [-55, 0, -8], lFore: [-45, 0, 0], rFore: [-45, 0, 0] },
  reach: { label: "Braço esticado, pegando algo", ...ARMS_DOWN, rUpper: [-50, 0, -8], rFore: [-30, 0, 0], neck: [12, 0, 0], head: [10, -8, 0], spine: [6, 0, 0] },
  lie: { label: "Deitado", hips: [0, -0.8, 0], hipsRot: [-90, 0, 0], ...ARMS_DOWN },
  // everyday actions: type, the phone up to the face, talk to something in front, a fright
  text: { label: "Digitando no celular", ...ARMS_DOWN, neck: [18, 0, 0], head: [16, 0, 0],
    ik: { rArm: [-0.05, 0.02, 0.27, [-60, 0, 0], [-1, -0.6, -0.3]], lArm: [0.05, 0.02, 0.27, [-60, 0, 0], [1, -0.6, -0.3]] } },
  sitText: { label: "Sentado, digitando no celular", ...SEAT, spine: [6, 0, 0], neck: [18, 0, 0], head: [16, 0, 0],
    ik: { rArm: [-0.05, 0, 0.27, [-60, 0, 0], [-1, -0.6, -0.3]], lArm: [0.05, 0, 0.27, [-60, 0, 0], [1, -0.6, -0.3]] } },
  phoneFace: { label: "Celular perto do rosto", ...ARMS_DOWN, neck: [8, 0, 0], head: [6, 0, 0], ik: { rArm: [-0.05, 0.3, 0.24, [-95, 0, 0], [-1, -0.7, -0.2]] } },
  sitPhoneFace: { label: "Sentado, celular perto do rosto", ...SEAT, lUpper: [-12, 0, 6], lFore: [-55, 0, 0], neck: [8, 0, 0], head: [6, 0, 0],
    ik: { rArm: [-0.05, 0.28, 0.24, [-95, 0, 0], [-1, -0.7, -0.2]] } },
  talk: { label: "Falando, mão estendida", ...ARMS_DOWN, spine: [8, 0, 0], chest: [6, 0, 0], neck: [12, 0, 0], head: [8, 0, 0],
    ik: { rArm: [-0.2, -0.02, 0.32, [-80, 0, -50], [-1, -0.5, -0.4]] } },
  sitTalk: { label: "Sentado, falando, mão estendida", ...SEAT, spine: [12, 0, 0], chest: [6, 0, 0], neck: [10, 0, 0], head: [6, 0, 0], lUpper: [-30, 0, 10], lFore: [-70, -20, 0],
    ik: { rArm: [-0.2, -0.05, 0.34, [-80, 0, -50], [-1, -0.5, -0.4]] } },
  startled: { label: "Assustado", hips: [0, 0, -0.03], lThigh: [8, 0, 4], rThigh: [-10, 0, -4], spine: [-10, 0, 0], chest: [-8, 0, 0], neck: [-6, 0, 0], head: [-10, 0, 0],
    lUpper: [-65, 0, 40], rUpper: [-65, 0, -40], lFore: [-105, 0, 0], rFore: [-105, 0, 0] },
  runBack: { label: "Correndo, olhando pra trás", lThigh: [35, 0, 0], rThigh: [-60, 0, 0], lShin: [70, 0, 0], rShin: [45, 0, 0], spine: [10, 0, 0], chest: [4, 0, 0], neck: [-4, 40, 0], head: [-8, 45, 0], hips: [0, -0.07, 0],
    ik: { lArm: [0.12, -0.05, 0.16, [0, 0, -90], [1, -0.6, -0.4]], rArm: [-0.13, 0.08, 0.15, [0, 0, 90], [-1, -0.6, -0.4]] } },
  wheelLook: { label: "No leme, olhando para o lado", lUpper: [-50, 0, 14], rUpper: [-50, 0, -14], lFore: [-45, -20, 0], rFore: [-45, 20, 0], spine: [4, 0, 0], lThigh: [0, 0, 6], rThigh: [0, 0, -6], neck: [-10, -25, 0], head: [-12, -25, 0] },
  cut: { label: "Agachado, mexendo em algo no chão", hips: [0, -0.5, -0.05], lThigh: [-115, 0, 12], rThigh: [-115, 0, -12], lShin: [125, 0, 0], rShin: [125, 0, 0], spine: [30, 0, 0], chest: [15, 0, 0],
    lUpper: [-60, 0, 8], lFore: [-40, 0, 0], neck: [8, 0, 0], head: [10, 0, 0], ik: { rArm: [-0.1, -0.3, 0.42, [-100, 0, 0], [-1, -0.4, -0.5]] } },
  headset: { label: "Mão no headset", ...ARMS_DOWN, head: [2, -8, 4], ik: { rArm: [-0.15, 0.32, 0, [0, 0, 170], [-1, -0.2, 0.1]] } },
  // crouched over something on the floor, the right hand at it, looking ahead (at the lens, at someone across)
  cutLook: { label: "Agachado, mexendo em algo no chão, olhando pra frente", hips: [0, -0.55, -0.08], lThigh: [-120, 0, 14], rThigh: [-120, 0, -14], lShin: [130, 0, 0], rShin: [130, 0, 0], spine: [48, 0, 0], chest: [24, 0, 0],
    lUpper: [-70, 0, 14], lFore: [-50, 0, 0], neck: [-30, 0, 0], head: [-28, 0, 0], ik: { rArm: [-0.16, 0.35, 0.42, [-30, 0, 0], [-1, -0.2, -0.6]] } },
  // looking ahead, something held to the chest in the left hand, the right arm free to swing
  runHold: { label: "Correndo, segurando algo numa mão", lThigh: [35, 0, 0], rThigh: [-60, 0, 0], lShin: [70, 0, 0], rShin: [45, 0, 0], rUpper: [40, 0, -8], rFore: [-75, 0, 0],
    spine: [12, 0, 0], chest: [6, 0, 0], neck: [-10, 0, 0], head: [-6, 0, 0], hips: [0, -0.07, 0], ik: { lArm: [0.07, -0.08, 0.2, [0, 0, -90], [1, -0.6, -0.4]] } },
  // tasting in a vineyard (hands placed where the grape, the mouth and the glass are): pick a grape with the left hand
  // and pull it off, eat it (the bunch held in the right), hold one up by the chin while talking to the lens, drink from
  // a glass in the right hand with the head back
  pickL: { label: "Colhendo uma uva (mão esquerda)", ...ARMS_DOWN, spine: [6, 0, 0], chest: [3, 0, 0], neck: [14, 0, 0], head: [8, 0, 0],
    ik: { lArm: [0.035, 0.045, 0.361, [-90, 0, 0], [1, -0.6, -0.4]] } },
  pickLOff: { label: "Puxando a uva (mão esquerda)", ...ARMS_DOWN, spine: [6, 0, 0], chest: [3, 0, 0], neck: [12, 0, 0], head: [8, 0, 0],
    ik: { lArm: [0.085, 0.059, 0.292, [-80, 0, 0], [1, -0.6, -0.4]] } },
  eatL: { label: "Comendo uma uva (mão esquerda na boca, o cacho na direita)", spine: [6, 0, 0], chest: [3, 0, 0], neck: [12, -12, 0], head: [10, -9, 0],
    lUpper: [0, 0, 7], lFore: [-10, 0, 0], ik: { lArm: [-0.044, 0.227, 0.23, [160, 0, 0], [0.6, -1, 0.2]], rArm: [-0.16, 0.2, 0.28, [-80, 0, 0], [-1, -0.6, -0.4]] } },
  eatLDown: { label: "Mastigando (a mão esquerda descendo, o cacho na direita)", spine: [6, 0, 0], chest: [3, 0, 0], neck: [10, -13, 0], head: [8, -10, 0],
    lUpper: [0, 0, 7], lFore: [-10, 0, 0], ik: { lArm: [-0.046, 0.141, 0.264, [150, 0, 0], [0.6, -1, 0.2]], rArm: [-0.16, 0.2, 0.28, [-80, 0, 0], [-1, -0.6, -0.4]] } },
  grapeR: { label: "Uva na mão direita perto do queixo, olhando pra câmera", lUpper: [0, 0, 7], lFore: [-10, 0, 0], neck: [-2, -6, 0], head: [-2, -6, 3],
    ik: { rArm: [-0.114, 0.118, 0.227, [160, 0, 0], [-0.6, -1, 0.2]] } },
  grapeRTalk: { label: "Uva na mão direita, a cabeça inclinada (falando)", lUpper: [0, 0, 7], lFore: [-10, 0, 0], neck: [-4, -2, 0], head: [-4, -1, 7],
    ik: { rArm: [-0.081, 0.132, 0.243, [160, 0, 0], [-0.6, -1, 0.2]] } },
  drinkR: { label: "Bebendo da taça (mão direita), a cabeça pra trás", ...ARMS_DOWN, spine: [-4, 0, 0], neck: [-12, -8, 0], head: [-14, -6, 0],
    ik: { rArm: [-0.026, 0.334, 0.054, [-100, 0, 0], [-0.6, -1, 0.2]] } },
  drinkRBack: { label: "Bebendo da taça (mão direita), a cabeça mais pra trás", ...ARMS_DOWN, spine: [-6, 0, 0], neck: [-18, -8, 0], head: [-20, -6, 0],
    ik: { rArm: [-0.025, 0.344, 0.02, [-100, 0, 0], [-0.6, -1, 0.2]] } },
};
const POSE_BONES = BONES.map(([n]) => n);

// ---------- the human mannequin ----------
// opts: { height (m), color, build ("m" | "f"), name, look }
// look (optional, from the set's cast): the figure in its wardrobe, part by part, so the blocking reads as the cast and
// not as a mannequin: { skin, top, arms, hips, bottom, shoes, neck, hat, beard } colors (arms → top, hips → bottom,
// neck → skin, shoes → a dark shade of `color` when left out); hat draws a knit cap, beard a full beard. Without a look
// the figure is the plain mannequin in `color`.
export function makeHuman({ height = 1.75, color = "#E07A3F", build = "m", name = "", look = null } = {}) {
  const s = height / 1.75;
  const root = new THREE.Group();
  root.name = name;
  const skel = new THREE.Group(); // scaled skeleton: the root keeps its own scale for the "Escala" tool
  skel.scale.setScalar(s);
  root.add(skel);
  const bones = { root: skel };
  for (const [n, p, at] of BONES) {
    const b = new THREE.Object3D();
    b.name = n;
    const off = [...at];
    if (build === "f" && /Upper$/.test(n)) off[0] *= 0.9;
    if (build === "f" && /Thigh$/.test(n)) off[0] *= 1.06;
    b.position.set(...off);
    b.userData.rest = b.position.clone();
    (p ? bones[p] : skel).add(b);
    bones[n] = b;
  }
  const m = mat(color, { rough: 0.62 });
  const shade = (c) => mat(new THREE.Color(c).multiplyScalar(0.55).getStyle(), { rough: 0.7 });
  const dark = shade(color);
  const L = look || {};
  const lm = (c, rough = 0.72) => (c ? mat(c, { rough }) : m);
  const skin = lm(L.skin, 0.6), top = lm(L.top), arms = L.arms ? lm(L.arms) : top, bottom = lm(L.bottom);
  const hipsM = L.hips ? lm(L.hips) : bottom, neckM = L.neck ? lm(L.neck) : skin;
  const shoes = L.shoes ? mat(L.shoes, { rough: 0.6 }) : dark, face = L.skin ? shade(L.skin) : dark;
  const meshes = [];
  const add = (bone, geo, at, r = [0, 0, 0], mm = m) => {
    const mesh = new THREE.Mesh(geo, mm);
    mesh.position.set(...at);
    mesh.rotation.set(r[0] * D2R, r[1] * D2R, r[2] * D2R);
    mesh.castShadow = mesh.receiveShadow = true;
    bones[bone].add(mesh);
    meshes.push(mesh);
    return mesh;
  };
  const cap = (r, len) => new THREE.CapsuleGeometry(r, Math.max(0.001, len - 2 * r), 3, 10);
  const ell = (rx, ry, rz) => { const g = new THREE.SphereGeometry(1, 14, 10); g.scale(rx, ry, rz); return g; };
  const wide = build === "f" ? 0.9 : 1;
  add("hips", ell(0.16 * (build === "f" ? 1.06 : 1), 0.11, 0.11), [0, -0.02, 0], [0, 0, 0], hipsM);
  add("spine", ell(0.14 * wide, 0.13, 0.1), [0, 0.08, 0], [0, 0, 0], top);
  add("chest", ell(0.18 * wide, 0.17, 0.115), [0, 0.11, 0], [0, 0, 0], top);
  for (const x of [0.19, -0.19]) add("chest", ell(0.06, 0.06, 0.06), [x * wide, 0.2, 0], [0, 0, 0], top);
  add("neck", cap(0.048, 0.12), [0, 0.05, 0], [0, 0, 0], neckM);
  add("head", ell(0.085, 0.115, 0.1), [0, 0.1, 0.01], [0, 0, 0], skin);
  add("head", new THREE.BoxGeometry(0.024, 0.034, 0.05), [0, 0.085, 0.1], [0, 0, 0], face); // the nose shows where the face points
  add("head", new THREE.BoxGeometry(0.11, 0.022, 0.03), [0, 0.12, 0.085], [0, 0, 0], face); // the eye line
  if (L.hat) {
    // a knit cap down to the brow, with its folded band
    const hat = mat(L.hat, { rough: 0.95 });
    const dome = new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.42);
    dome.scale(0.095, 0.124, 0.109);
    add("head", dome, [0, 0.1, 0.008], [0, 0, 0], hat);
    add("head", new THREE.CylinderGeometry(0.098, 0.1, 0.04, 20, 1, true).scale(1, 1, 1.13), [0, 0.142, 0.008], [0, 0, 0], hat);
  }
  if (L.beard) {
    // a full beard: jaw and chin, with the moustache over the mouth
    const beard = mat(L.beard, { rough: 1 });
    add("head", ell(0.078, 0.06, 0.066), [0, 0.04, 0.05], [0, 0, 0], beard);
    add("head", ell(0.04, 0.012, 0.02), [0, 0.066, 0.1], [0, 0, 0], beard);
  }
  for (const sd of ["l", "r"]) {
    const k = sd === "l" ? 1 : -1;
    add(`${sd}Upper`, cap(0.046, 0.3), [0, -0.15, 0], [0, 0, 0], arms);
    add(`${sd}Fore`, ell(0.042, 0.042, 0.042), [0, 0, 0], [0, 0, 0], arms);
    add(`${sd}Fore`, cap(0.039, 0.26), [0, -0.13, 0], [0, 0, 0], arms);
    add(`${sd}Hand`, new THREE.BoxGeometry(0.03, 0.15, 0.08), [0, -0.075, 0.005], [0, 0, 0], skin);
    add(`${sd}Hand`, new THREE.BoxGeometry(0.022, 0.065, 0.022), [-0.012 * k, -0.035, 0.05], [-30, 0, 0], skin);
    add(`${sd}Thigh`, cap(0.075, 0.43), [0, -0.215, 0], [0, 0, 0], bottom);
    add(`${sd}Shin`, ell(0.056, 0.056, 0.056), [0, 0, 0], [0, 0, 0], bottom);
    add(`${sd}Shin`, cap(0.054, 0.4), [0, -0.2, 0], [0, 0, 0], bottom);
    add(`${sd}Foot`, new THREE.BoxGeometry(0.095, 0.07, 0.26), [0, -0.005, 0.07], [0, 0, 0], shoes);
  }
  const fig = { kind: "human", root, skel, bones, meshes, color, height, build, preset: "stand", limbs: {}, hipsRest: bones.hips.position.clone() };
  for (const [k, L] of Object.entries(LIMBS)) {
    fig.limbs[k] = { ...L, l1: bones[L.b].userData.rest.length(), l2: bones[L.c].userData.rest.length(), target: new THREE.Vector3(), rot: Q(), poleDir: V(L.pole).normalize() };
  }
  meshes.forEach((x) => (x.userData.fig = fig));
  applyPreset(fig, "stand");
  return fig;
}

const spaceOf = (fig, L) => (L.space === "chest" ? fig.bones.chest : fig.bones.root);

// FK preset → bones, then bake the IK targets from where the hands and feet ended up
export function applyPreset(fig, key) {
  const p = POSES[key] || POSES.stand;
  if (fig.kind !== "human") return applyAnimalPreset(fig, key);
  for (const n of POSE_BONES) fig.bones[n].quaternion.identity();
  const r = p.hips || [0, 0, 0];
  fig.bones.hips.position.copy(fig.hipsRest).add(V(r));
  const hr = p.hipsRot || [0, 0, 0];
  fig.bones.hips.rotation.set(hr[0] * D2R, hr[1] * D2R, hr[2] * D2R);
  for (const [n, e] of Object.entries(p)) {
    if (!fig.bones[n] || n === "hips") continue;
    fig.bones[n].rotation.set(e[0] * D2R, e[1] * D2R, e[2] * D2R);
  }
  fig.preset = key;
  bake(fig);
  // hands placed directly (chest space, meters) where angles would be guesswork: the ear, something held in the arms
  if (p.ik) {
    for (const [k, t] of Object.entries(p.ik)) {
      const L = fig.limbs[k];
      L.target.set(t[0], t[1], t[2]);
      if (t[3]) L.rot.setFromEuler(new THREE.Euler(t[3][0] * D2R, t[3][1] * D2R, t[3][2] * D2R));
      if (t[4]) L.poleDir.set(...t[4]).normalize();
    }
    solve(fig);
  }
}
// read the current FK pose into the limbs' targets, rotations and poles
function bake(fig) {
  fig.root.updateMatrixWorld(true);
  const sk = fig.bones.root;
  const skInv = Q();
  for (const L of Object.values(fig.limbs)) {
    const sp = spaceOf(fig, L);
    const c = fig.bones[L.c];
    L.target.copy(sp.worldToLocal(c.getWorldPosition(new THREE.Vector3())));
    const qs = sp.getWorldQuaternion(Q());
    L.rot.copy(qs.invert().multiply(c.getWorldQuaternion(Q())));
    // pole: from the line shoulder→wrist (hip→ankle) toward the elbow (knee), unless the limb is straight
    const A = sk.worldToLocal(fig.bones[L.a].getWorldPosition(new THREE.Vector3()));
    const B = sk.worldToLocal(fig.bones[L.b].getWorldPosition(new THREE.Vector3()));
    const T = sk.worldToLocal(c.getWorldPosition(new THREE.Vector3()));
    const u = T.clone().sub(A).normalize();
    const w = B.clone().sub(A);
    w.sub(u.clone().multiplyScalar(w.dot(u)));
    if (w.length() > 0.02) {
      // pole as a direction in the limb's space
      skInv.copy(sk.getWorldQuaternion(Q()));
      const toSpace = sp.getWorldQuaternion(Q()).invert().multiply(skInv);
      L.poleDir.copy(w.normalize().applyQuaternion(toSpace));
    } else L.poleDir.copy(V(LIMBS[Object.keys(fig.limbs).find((k) => fig.limbs[k] === L)].pole)).normalize();
  }
  solve(fig);
}

// two-bone IK for every limb, in the skeleton's own (unscaled) space
const _m = new THREE.Matrix4();
export function solve(fig) {
  if (fig.kind !== "human") return;
  const sk = fig.bones.root;
  fig.root.updateMatrixWorld(true);
  const skQ = sk.getWorldQuaternion(Q()), skQi = skQ.clone().invert();
  const toSk = (p) => sk.worldToLocal(p);
  for (const L of Object.values(fig.limbs)) {
    const sp = spaceOf(fig, L);
    sp.updateWorldMatrix(true, false);
    const a = fig.bones[L.a], b = fig.bones[L.b], c = fig.bones[L.c];
    a.parent.updateWorldMatrix(true, false);
    const A = toSk(a.getWorldPosition(new THREE.Vector3()));
    const T = toSk(sp.localToWorld(L.target.clone()));
    const spQ = skQi.clone().multiply(sp.getWorldQuaternion(Q())); // the space's rotation, in skeleton space
    const pole = L.poleDir.clone().applyQuaternion(spQ);
    let u = T.clone().sub(A);
    const d = THREE.MathUtils.clamp(u.length(), Math.abs(L.l1 - L.l2) + 1e-4, L.l1 + L.l2 - 1e-4);
    u.normalize();
    let w = pole.clone().sub(u.clone().multiplyScalar(pole.dot(u)));
    if (w.lengthSq() < 1e-6) w = new THREE.Vector3(0, 0, L.sign).cross(u).cross(u).negate();
    w.normalize();
    const ca = THREE.MathUtils.clamp((L.l1 * L.l1 + d * d - L.l2 * L.l2) / (2 * L.l1 * d), -1, 1);
    const sa = Math.sqrt(1 - ca * ca);
    const B = A.clone().add(u.clone().multiplyScalar(ca * L.l1)).add(w.clone().multiplyScalar(sa * L.l1));
    const Tc = A.clone().add(u.clone().multiplyScalar(d));
    const X = new THREE.Vector3().crossVectors(w, u).multiplyScalar(L.sign).normalize();
    const frame = (from, to) => {
      const Y = from.clone().sub(to).normalize(); // the bone runs along its local -y
      const Z = new THREE.Vector3().crossVectors(X, Y).normalize();
      const Xo = new THREE.Vector3().crossVectors(Y, Z).normalize();
      return Q().setFromRotationMatrix(_m.makeBasis(Xo, Y, Z));
    };
    const qa = frame(A, B), qb = frame(B, Tc);
    const parentQ = skQi.clone().multiply(a.parent.getWorldQuaternion(Q()));
    a.quaternion.copy(parentQ.invert().multiply(qa));
    b.quaternion.copy(qa.clone().invert().multiply(qb));
    c.quaternion.copy(qb.clone().invert().multiply(spQ.clone().multiply(L.rot)));
    a.updateMatrixWorld(true);
  }
}

// ---------- pose state (saved per character in cena3d.state and in each saved shot) ----------
const arr = (v) => v.toArray().map((x) => +x.toFixed(4));
export function poseOf(fig) {
  const b = fig.bones;
  if (fig.kind !== "human") return { preset: fig.preset, joints: Object.fromEntries(Object.entries(fig.joints).map(([k, o]) => [k, arr(o.quaternion)])) };
  return {
    preset: fig.preset,
    hips: arr(b.hips.position), hipsQ: arr(b.hips.quaternion),
    spine: arr(b.spine.quaternion), chest: arr(b.chest.quaternion), neck: arr(b.neck.quaternion), head: arr(b.head.quaternion),
    limbs: Object.fromEntries(Object.entries(fig.limbs).map(([k, L]) => [k, { t: arr(L.target), r: arr(L.rot), p: arr(L.poleDir) }])),
  };
}
export function setPose(fig, p) {
  if (!p) return;
  if (fig.kind !== "human") {
    applyAnimalPreset(fig, p.preset);
    for (const [k, q] of Object.entries(p.joints || {})) fig.joints[k]?.quaternion.fromArray(q);
    return;
  }
  const b = fig.bones;
  applyPreset(fig, POSES[p.preset] ? p.preset : "stand");
  if (p.hips) b.hips.position.fromArray(p.hips);
  for (const k of ["hipsQ", "spine", "chest", "neck", "head"]) if (p[k]) b[k === "hipsQ" ? "hips" : k].quaternion.fromArray(p[k]);
  for (const [k, l] of Object.entries(p.limbs || {})) {
    const L = fig.limbs[k];
    if (!L) continue;
    L.target.fromArray(l.t); L.rot.fromArray(l.r); L.poleDir.fromArray(l.p).normalize();
  }
  solve(fig);
}

// ---------- the stride: a run or a walk laid over the pose (the timeline drives it) ----------
// The presets that cover ground, with the length of a full stride (left and right once, meters). The timeline turns the
// meters a figure covers between its keys into the stride's phase, so the feet keep pace with the ground.
export const GAIT = { walk: { cycle: 1.5, walk: true }, run: { cycle: 3.4 }, runDevice: { cycle: 3.4 }, runHold: { cycle: 3.4 }, runBack: { cycle: 3.4 } };
const ANIMAL_GAIT = { bear: { run: { cycle: 2.6 }, four: { cycle: 1.6, walk: true } } };
export const gaitOf = (fig) => ((fig.kind === "human" ? GAIT : ANIMAL_GAIT[fig.kind]) || {})[fig.preset] || null;
const lerp = THREE.MathUtils.lerp;
// phase: strides covered (any real; 1 = a full stride); amt 0–1: how much of the stride over the pose (it fades in
// with the speed). For a human: the feet (stance on the ground, then the swing with the heel up), the arms the preset
// leaves free (no `ik`) swinging against the legs, the pelvis bobbing twice a stride and the hips turning a little.
export function gait(fig, phase, amt = 1) {
  const g = gaitOf(fig);
  if (!g || !(amt > 0)) return;
  amt = Math.min(1, amt);
  const w = (((phase % 1) + 1) % 1) * 2 * Math.PI;
  if (fig.kind !== "human") return animalGait(fig, w, amt, g);
  const b = fig.bones, held = POSES[fig.preset]?.ik || {};
  const S = g.walk ? { st: 0.6, A: 0.27, H: 0.11, bob: 0.015, turn: 0.07 } : { st: 0.36, A: 0.34, H: 0.34, bob: 0.03, turn: 0.1 };
  b.hips.position.y -= amt * S.bob * (1 + Math.cos(2 * (w - S.st * Math.PI))) / 2; // lowest as a foot takes the weight
  b.hips.rotateY(amt * S.turn * Math.cos(w));
  b.chest.rotateY(-amt * S.turn * 1.4 * Math.cos(w));
  const swing = {};
  for (const [k, x, ph] of [["lLeg", 0.11, w], ["rLeg", -0.11, w + Math.PI]]) {
    const L = fig.limbs[k], u = (ph / (2 * Math.PI)) % 1;
    let z, y, pitch;
    if (u < S.st) { const t = u / S.st; z = S.A - 2 * S.A * t; y = 0.06; pitch = lerp(-8, 25, t); } // on the ground, going back
    else { const t = (u - S.st) / (1 - S.st); z = -S.A + S.A * (1 - Math.cos(Math.PI * t)); y = 0.06 + S.H * Math.sin(Math.PI * Math.pow(t, 0.75)); pitch = lerp(40, -10, t); }
    swing[k[0]] = -z / S.A; // the arm on the same side swings against the leg
    L.target.lerp(new THREE.Vector3(x, y, z), amt);
    L.rot.slerp(new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch * D2R, 0, 0)), amt);
    L.poleDir.lerp(V([x > 0 ? 0.08 : -0.08, 0, 1]).normalize(), amt).normalize();
  }
  for (const [k, sd] of [["lArm", 1], ["rArm", -1]]) {
    if (held[k]) continue;
    const L = fig.limbs[k], t = (swing[k[0]] + 1) / 2; // 0 back, 1 forward
    const back = g.walk ? [0.2, -0.46, -0.1] : [0.21, -0.3, -0.13], front = g.walk ? [0.2, -0.42, 0.13] : [0.16, -0.12, 0.27];
    L.target.lerp(new THREE.Vector3(sd * lerp(back[0], front[0], t), lerp(back[1], front[1], t), lerp(back[2], front[2], t)), amt);
    L.poleDir.lerp(V([sd * 0.45, -0.25, -1]).normalize(), amt).normalize();
  }
  solve(fig);
}
// four legs: a gallop (the front pair reaches while the hind pair pushes, then both gather under the body) or a walk
function animalGait(fig, w, amt, g) {
  const J = fig.joints, c = Math.cos, s = Math.sin, k = g.walk ? 0.5 : 1;
  const to = (n, deg) => { const o = J[n]; if (o) o.rotation.x = lerp(o.rotation.x, deg * D2R, amt); };
  for (const [n, ph] of [["fl", 0], ["fr", g.walk ? Math.PI : 0.4]]) {
    const a = w + ph;
    to(n, -(4 + 32 * k * c(a)));
    to(`${n}l`, 8 + 55 * k * Math.max(0, -s(a))); // the lower leg folds while it swings forward
  }
  for (const [n, ph] of [["hl", g.walk ? Math.PI / 2 : 0.2], ["hr", g.walk ? -Math.PI / 2 : 0.6]]) {
    const a = w + ph;
    to(n, 4 + 32 * k * c(a));
    to(`${n}l`, -(8 + 55 * k * Math.max(0, s(a))));
  }
  // the body level and low, so the paws reach the ground, rocking and bobbing with the stride
  if (J.body) {
    J.body.rotation.x = lerp(J.body.rotation.x, k * 5 * D2R * s(w), amt);
    J.body.position.y = lerp(J.body.position.y, fig.bodyY - 0.12 * k + k * 0.06 * (1 - c(2 * w)) / 2, amt);
  }
  if (J.head) J.head.rotation.x -= amt * k * 5 * D2R * s(w);
}
// one line for the prompt and the panel: "Sentado, segurando (celular, carta)" (+ "ajustado" once moved by hand)
export const poseLabel = (fig) => (fig.kind === "human" ? POSES : ANIMAL_POSES[fig.kind])[fig.preset]?.label || "";

// ---------- handles: the points the team drags ----------
// For a human: the four limbs (move: IK; rotate: hand/foot), the pelvis (move/rotate), the torso and the head (rotate).
export function handlePoints(fig) {
  const b = fig.bones;
  if (fig.kind !== "human") return [{ kind: "look", at: fig.joints.head, label: "cabeça" }];
  return [
    ...Object.entries(fig.limbs).map(([k, L]) => ({ kind: "limb", limb: k, at: b[L.c], label: L.label })),
    { kind: "hips", at: b.hips, label: "quadril" },
    { kind: "torso", at: b.chest, label: "tronco", off: [0, 0.16, 0.1] },
    { kind: "look", at: b.head, label: "cabeça", off: [0, 0.24, 0] },
  ];
}
// move a limb target / the pelvis to a world point
export function dragTo(fig, h, world) {
  if (h.kind === "limb") {
    const L = fig.limbs[h.limb];
    L.target.copy(spaceOf(fig, L).worldToLocal(world.clone()));
  } else if (h.kind === "hips") {
    fig.bones.hips.position.copy(fig.bones.hips.parent.worldToLocal(world.clone()));
  }
  solve(fig);
}
// rotate a handle's joint to a world rotation (from the gizmo)
export function rotateTo(fig, h, worldQ) {
  const b = fig.bones;
  const local = (parent) => parent.getWorldQuaternion(Q()).invert().multiply(worldQ.clone());
  if (fig.kind !== "human") { h.at.quaternion.copy(local(h.at.parent)); return; }
  if (h.kind === "limb") {
    const L = fig.limbs[h.limb];
    L.rot.copy(spaceOf(fig, L).getWorldQuaternion(Q()).invert().multiply(worldQ.clone()));
  } else if (h.kind === "hips") b.hips.quaternion.copy(local(b.hips.parent));
  else if (h.kind === "torso") { // half in the lower back, half in the chest
    const q = local(b.hips);
    const half = Q().slerp(q, 0.5);
    b.spine.quaternion.copy(half); b.chest.quaternion.copy(half);
  } else if (h.kind === "look") {
    const q = local(b.chest);
    const n = Q().slerp(q, 0.35);
    b.neck.quaternion.copy(n); b.head.quaternion.copy(n.clone().invert().multiply(q));
  }
  solve(fig);
}
// the world rotation a rotate-gizmo starts from, for a handle
export function handleQuat(fig, h) {
  const b = fig.bones;
  if (h.kind === "limb") return b[fig.limbs[h.limb].c].getWorldQuaternion(Q());
  if (h.kind === "torso") return b.chest.getWorldQuaternion(Q());
  return h.at.getWorldQuaternion(Q());
}

// ---------- animals: the squirrel and the bear, FK only ----------
export const ANIMAL_POSES = {
  squirrel: {
    sit: { label: "Sentado nas patas de trás", body: [-62, 0, 0], y: 0.02, neck: [48, 0, 0], head: [10, 0, 0], tail0: [-20, 0, 0], tail1: [-40, 0, 0], tail2: [-30, 0, 0], fl: [-10, 0, 0], fr: [-10, 0, 0], hl: [70, 0, 0], hr: [70, 0, 0], fll: [-60, 0, 0], frl: [-60, 0, 0], hll: [-90, 0, 0], hrl: [-90, 0, 0] },
    four: { label: "De quatro", body: [0, 0, 0], y: 0, neck: [-15, 0, 0], tail0: [-45, 0, 0], tail1: [-35, 0, 0], tail2: [-20, 0, 0] },
    jump: { label: "Pulando", body: [-10, 0, 0], y: 0.08, neck: [0, 0, 0], tail0: [-15, 0, 0], tail1: [5, 0, 0], tail2: [10, 0, 0], fl: [-70, 0, 0], fr: [-70, 0, 0], hl: [60, 0, 0], hr: [60, 0, 0] },
  },
  bear: {
    four: { label: "De quatro", body: [0, 0, 0], y: 0, neck: [8, 0, 0], head: [6, 0, 0] },
    run: { label: "Correndo", body: [-6, 0, 0], y: 0.05, neck: [0, 0, 0], head: [-6, 0, 0], fl: [-45, 0, 0], fr: [-25, 0, 0], fll: [20, 0, 0], frl: [10, 0, 0], hl: [45, 0, 0], hr: [30, 0, 0], hll: [-20, 0, 0], hrl: [-10, 0, 0] },
    stand: { label: "Em pé", body: [-72, 0, 0], y: 0.02, neck: [55, 0, 0], head: [12, 0, 0], fl: [30, 0, 0], fr: [30, 0, 0], fll: [-40, 0, 0], frl: [-40, 0, 0], hl: [72, 0, 0], hr: [72, 0, 0] },
  },
};
const ANIMAL = {
  // s: overall size; hip height, body length, leg segments, radii, head
  squirrel: { hip: 0.075, len: 0.13, leg: [0.045, 0.04], legR: 0.012, body: [0.045, 0.045, 0.085], head: [0.03, 0.03, 0.036], snout: 0.022, ear: 0.012, tail: [0.075, 0.034], color: "#9A8F86", def: "sit" },
  bear: { hip: 0.86, len: 1.0, leg: [0.42, 0.42], legR: 0.11, body: [0.38, 0.44, 0.78], head: [0.19, 0.18, 0.22], snout: 0.15, ear: 0.06, tail: [0.08, 0.06], color: "#6B4A33", def: "four" },
};
export function makeAnimal(kind, { color, name = "" } = {}) {
  const A = ANIMAL[kind];
  const root = new THREE.Group();
  root.name = name;
  const m = mat(color || A.color, { rough: 0.85 });
  const dark = mat(new THREE.Color(color || A.color).multiplyScalar(0.5).getStyle(), { rough: 0.85 });
  const meshes = [];
  const node = (parent, at, n) => { const o = new THREE.Object3D(); o.position.set(...at); o.name = n; parent.add(o); return o; };
  const add = (parent, geo, at, mm = m) => { const x = new THREE.Mesh(geo, mm); x.position.set(...at); x.castShadow = x.receiveShadow = true; parent.add(x); meshes.push(x); return x; };
  const ell = (rx, ry, rz) => { const g = new THREE.SphereGeometry(1, 12, 9); g.scale(rx, ry, rz); return g; };
  const cap = (r, len) => new THREE.CapsuleGeometry(r, Math.max(0.001, len - 2 * r), 3, 8);
  const body = node(root, [0, A.hip, 0], "body"); // pivot at the hips; the body runs forward (+z)
  add(body, ell(...A.body), [0, A.body[1] * 0.25, A.len * 0.5]);
  const chest = node(body, [0, A.body[1] * 0.3, A.len], "chest");
  const neck = node(chest, [0, A.body[1] * 0.45, A.body[2] * 0.2], "neck");
  const head = node(neck, [0, A.head[1] * 0.4, A.head[2] * 0.9], "head");
  add(head, ell(...A.head), [0, 0, 0]);
  add(head, ell(A.snout * 0.6, A.snout * 0.5, A.snout), [0, -A.head[1] * 0.2, A.head[2] * 0.95], dark);
  for (const x of [-1, 1]) add(head, ell(A.ear, A.ear, A.ear * 0.5), [x * A.head[0] * 0.65, A.head[1] * 0.85, -A.head[2] * 0.1]);
  const joints = { body, chest, neck, head };
  // tail: three segments curling back and up
  let t = node(body, [0, A.body[1] * 0.35, -A.body[2] * 0.08], "tail0");
  joints.tail0 = t;
  for (let i = 0; i < 3; i++) {
    add(t, ell(A.tail[1], A.tail[1], A.tail[0] * 0.65), [0, 0, -A.tail[0] * 0.5]);
    if (i < 2) { t = node(t, [0, 0, -A.tail[0]], `tail${i + 1}`); joints[`tail${i + 1}`] = t; }
  }
  // legs: hind at the hips, front at the chest; upper + lower, pointing down
  for (const [k, parent, z] of [["h", body, 0], ["f", chest, 0]]) {
    for (const [sd, x] of [["l", 1], ["r", -1]]) {
      const up = node(parent, [x * A.body[0] * 0.62, z, 0], `${k}${sd}`);
      add(up, cap(A.legR * 1.15, A.leg[0]), [0, -A.leg[0] / 2, 0]);
      const low = node(up, [0, -A.leg[0], 0], `${k}${sd}l`);
      add(low, cap(A.legR, A.leg[1]), [0, -A.leg[1] / 2, 0]);
      add(low, ell(A.legR * 1.2, A.legR * 0.6, A.legR * 1.6), [0, -A.leg[1], A.legR * 0.6], dark);
      joints[`${k}${sd}`] = up; joints[`${k}${sd}l`] = low;
    }
  }
  const fig = { kind, root, joints, meshes, color: color || A.color, preset: A.def, bodyY: A.hip };
  meshes.forEach((x) => (x.userData.fig = fig));
  applyAnimalPreset(fig, A.def);
  return fig;
}
function applyAnimalPreset(fig, key) {
  const P = ANIMAL_POSES[fig.kind];
  const p = P[key] || P[ANIMAL[fig.kind].def];
  for (const [n, o] of Object.entries(fig.joints)) {
    const e = p[n] || [0, 0, 0];
    o.rotation.set(e[0] * D2R, e[1] * D2R, e[2] * D2R);
  }
  fig.joints.body.position.y = fig.bodyY + (p.y || 0) * (fig.kind === "bear" ? 1 : 1);
  fig.preset = P[key] ? key : ANIMAL[fig.kind].def;
}
export const presetsOf = (fig) => Object.entries(fig.kind === "human" ? POSES : ANIMAL_POSES[fig.kind]).map(([k, p]) => [k, p.label]);
