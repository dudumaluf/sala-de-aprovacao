// The job's blocking sets, one per approved location, keyed by scene number (the position of the scene in SCENES, in
// config.js). Replace the example below with your film's sets. Each one copies the approved location image's layout,
// palette and light in low poly: meters, y up, a piece faces +z (its front) until rotated, angles in degrees. kit.js
// has the pieces (walls with holes, windows, doors, tables, chairs, sofa, bed, shelves, lamps, plants, trees, houses,
// cars, a skyline...) and PROP below the small things the script puts in a hand. A set carries:
// - name, build(g): what it is called, and the function that builds it into the group g
// - env: bg (background color), sky (a dome seen through windows: [zenith, horizon, ground]), fog ([color, near, far],
//   optional), hemi ([sky color, ground color, intensity]), sun (the light that casts shadows: { pos, target, color, i,
//   box = half size of the area it shades }), points (practical lights: [x, y, z, color, intensity, range]), exposure
// - cams: the matching camera of the approved image first (id "aprovada", label "Aprovada": a saved angle from it is
//   named "Blocking · Aprovada"), then the planned shots: { id, label, title, lens, pos, target }, lens in mm on full
//   frame, label "P1 · Aberto" and title "what the shot tells · lens" (a saved angle's name starts with both). The keys
//   1–9 fly the camera to them, and app.js offers them as the camera of a new "plano" item (its variants.shot is the
//   id). `alt: true` marks options beyond the planned shots: their dots come after the others, a little apart.
// - cast: who the scene puts here: { item, name, pose, at, ry, height, build, color, kind }. item = the title of the
//   scene's casting item (its approved image goes on the figure's row; two figures can share one item); pose = a preset
//   of rig.js POSES; at = where the figure stands (its feet), ry = where it faces; height in m; build "m" | "f"; color
//   (default: COLORS in order); kind "squirrel" or "bear" for an animal (rig.js makeAnimal; an extra figure added from
//   the panel for that item is that animal too)
// - device: where the product starts (the stored key keeps this name): { at, ry, led } in the set, or { attach: { cast,
//   bone, at, rot } } on a figure's bone (cast = index in `cast`). Leave it out when the scene has no product; a job
//   without one (config.js PRODUCT = null) never shows it. led = one of device.js LED_STATES (default: the first).
// - props: what the script needs that the set lacks (a phone in a hand, a mug, a hat): { key, name, color, build } plus,
//   on a figure, attach: { cast, bone, at, rot, space } (bone: "rHand", "lHand", "head", "lFoot"...; at in the bone's
//   space; rot in the figure's frame unless space "bone"), or in the set at and rot (or ry). Each has its eye in the panel.
// - bounds: where the camera may go, boxes [x0, y0, z0, x1, y1, z1] a few cm inside the walls, floor and ceiling. Orbit,
//   pan and scroll slide along a box's faces instead of leaving it; boxes that overlap are a way through (a window, an
//   arch); { box, cut } leaves out of a box the solids the camera can't enter (a fridge, a column, a car)
// - refs and inside (optional): for a location approved with two images, one from inside and one from outside. refs =
//   { inside, outside }, the file names of the two approved options; inside(pos) is true when a camera at pos ([x, y,
//   z]) is inside. The compare button (C) then shows the one that matches where the camera is.
import { mat, glass, metal, glow, texMat, box, cyl, sphere, bar, torus, group, floor, wall, windowFrame, door, table, chair, pendant, plant, tree, bush, house } from "./kit.js";

// the mannequins' colors, in the order of `cast` (and for the extra figures added in the panel)
export const COLORS = ["#F07A2E", "#3E8DF0", "#E4C531", "#B06BE6", "#2FC5A0"];

// ---------- 1 · Cozinha (the example: early morning, light from the window over the sink) ----------
// A kitchen of 4.25 × 3.5 m: the counter along the back wall with the window over the sink, the fridge in the right
// corner, the door on the right wall, the table and two chairs in the middle, a pendant over the table, a garden and
// the neighbor's house outside.
function cozinha(g) {
  const cream = mat("#EDE3CF"), wood = mat("#B88B5A", { rough: 0.6 }), dark = mat("#4A3A2C", { rough: 0.7 });
  const steel = metal("#B9BEC1", 0.3), stone = mat("#D9D2C4", { rough: 0.4 });
  floor(g, [4.4, 3.8], [0, 0, -0.825], texMat("planks", "#9A7552", "#7E5E40", [4, 4], { rough: 0.6 }));
  box(g, [4.4, 0.15, 3.8], [0, 2.6, -0.825], mat("#F2EBDD"), { shadow: false }); // ceiling
  // walls: the back one with the window over the sink, the right one with the door, the one behind the camera
  wall(g, { len: 4.4, h: 2.6, t: 0.15, m: cream, at: [-2.2, 0, -2.65], holes: [[1.85, 3.15, 1.05, 2.2]] });
  windowFrame(g, { w: 1.3, h: 1.15, at: [0.3, 1.05, -2.65], cols: 2, frame: "#F4EFE4", glassTint: "#D6E4EA", glassOpacity: 0.12, sill: { d: 0.18, color: "#E8E2D6" } });
  box(g, [0.15, 2.6, 3.8], [-2.2, 0, -0.825], cream);
  wall(g, { len: 3.8, h: 2.6, t: 0.15, m: cream, at: [2.2, 0, 1.075], ry: 90, holes: [[0.45, 1.35, 0, 2.1]] });
  door(g, { w: 0.9, h: 2.1, at: [2.2, 0, 0.175], ry: 90, color: "#B89A74", frame: "#F4EFE4" });
  box(g, [4.4, 2.6, 0.15], [0, 0, 1.0], cream);
  // the counter: plinth, six cabinet doors, the stone top, the tiles; the sink under the window, the cooktop on the left
  box(g, [3.45, 0.08, 0.52], [-0.4, 0, -2.31], dark);
  box(g, [3.45, 0.78, 0.58], [-0.4, 0.08, -2.285], wood);
  for (const x of [-1.55, -0.975, -0.4, 0.175, 0.75]) box(g, [0.008, 0.74, 0.004], [x, 0.1, -1.994], dark, { shadow: false });
  for (let i = 0; i < 6; i++) box(g, [0.12, 0.014, 0.02], [-1.8375 + i * 0.575, 0.76, -1.985], steel, { shadow: false });
  box(g, [3.5, 0.04, 0.63], [-0.4, 0.86, -2.27], stone);
  box(g, [3.45, 0.12, 0.02], [-0.4, 0.9, -2.565], stone);
  box(g, [1.725, 0.55, 0.02], [-1.2625, 0.9, -2.56], texMat("tiles", "#F1EBDF", "#CFC6B4", [5, 2], { rough: 0.35 }), { shadow: false });
  box(g, [0.55, 0.012, 0.4], [0.3, 0.9, -2.25], steel, { shadow: false });
  bar(g, [0.3, 0.9, -2.5], [0.3, 1.2, -2.5], 0.025, steel, { round: true });
  bar(g, [0.3, 1.2, -2.5], [0.3, 1.18, -2.33], 0.022, steel, { round: true });
  box(g, [0.6, 0.01, 0.5], [-1.55, 0.9, -2.27], mat("#1A1A1A", { rough: 0.3 }));
  for (const [x, z] of [[-1.7, -2.15], [-1.4, -2.15], [-1.7, -2.4], [-1.4, -2.4]]) torus(g, 0.065, 0.007, [x, 0.912, z], steel, { rx: 90, seg: 18, shadow: false });
  cyl(g, 0.085, 0.16, [-1.4, 0.912, -2.15], metal("#C9C2B6", 0.4), { top: 0.7, seg: 16 }); // the kettle
  // the upper cabinets over the cooktop side
  box(g, [1.725, 0.7, 0.34], [-1.2625, 1.5, -2.405], mat("#D8C3A2", { rough: 0.6 }));
  for (const x of [-1.69, -1.12, -0.55]) box(g, [0.1, 0.014, 0.02], [x, 1.54, -2.225], steel, { shadow: false });
  // the drip coffee maker, its carafe half full
  box(g, [0.2, 0.03, 0.24], [-0.75, 0.9, -2.36], dark);
  box(g, [0.2, 0.36, 0.1], [-0.75, 0.9, -2.43], dark);
  box(g, [0.2, 0.06, 0.22], [-0.75, 1.24, -2.37], dark);
  cyl(g, 0.055, 0.13, [-0.75, 0.93, -2.3], glass("#D9E2E4", 0.3), { seg: 16, shadow: false });
  cyl(g, 0.053, 0.06, [-0.75, 0.93, -2.3], mat("#3B2416", { rough: 0.3 }), { seg: 16, shadow: false });
  // the fridge in the corner; a plant on the sill
  box(g, [0.7, 1.85, 0.65], [1.75, 0, -2.235], mat("#E9E6DF", { rough: 0.35 }));
  box(g, [0.7, 0.01, 0.004], [1.75, 1.2, -1.909], dark, { shadow: false });
  bar(g, [1.47, 0.85, -1.89], [1.47, 1.15, -1.89], 0.025, steel, { round: true });
  bar(g, [1.47, 1.3, -1.89], [1.47, 1.6, -1.89], 0.025, steel, { round: true });
  plant(g, { at: [0.75, 1.05, -2.6], h: 0.28, seed: 3, pot: "#C9B79C" });
  // a shelf with jars on the left wall
  box(g, [0.24, 0.03, 1.1], [-2.005, 1.5, -0.9], wood);
  for (const [z, c, h] of [[-1.3, "#C9B79C", 0.16], [-1.1, "#7D8A6A", 0.12], [-0.9, "#E8E2D6", 0.18], [-0.65, "#B4673F", 0.14]]) cyl(g, 0.045, h, [-2.0, 1.53, z], mat(c, { rough: 0.5 }), { seg: 12 });
  // the table, two chairs, a fruit bowl, the pendant
  table(g, { w: 1.3, d: 0.8, top: "#C9A06A", legs: "#7A5A3A", at: [0.35, 0, -0.45] });
  chair(g, { style: "wood", color: "#7A5A3A", at: [0.35, 0, -1.08] });
  chair(g, { style: "wood", color: "#7A5A3A", at: [-0.6, 0, -0.45], ry: 90 });
  cyl(g, 0.13, 0.06, [0.6, 0.75, -0.35], mat("#E8E2D6", { rough: 0.4 }), { top: 1.35, seg: 16 });
  for (const [x, z, c] of [[0.56, -0.33, "#E0892E"], [0.65, -0.38, "#E0892E"], [0.6, -0.27, "#9DB04A"]]) sphere(g, [0.04, 0.04, 0.04], [x, 0.84, z], mat(c, { rough: 0.6 }));
  pendant(g, { at: [0.35, 1.65, -0.45], ceil: 2.6, kind: "cone", color: "#2B241D", r: 0.17 });
  // outside: the garden and the neighbor's house, seen through the window
  floor(g, [40, 30], [0, -0.03, -18], mat("#8C9A6E", { rough: 1 }));
  bush(g, { at: [0.2, 0, -4.2], r: 0.7, color: "#6E8A58", flowers: "#E8D9A8", seed: 4 });
  tree(g, { at: [2.0, 0, -7.5], h: 6.5, leaf: "#6E8A58", seed: 2 });
  tree(g, { at: [-1.8, 0, -10], h: 8, leaf: "#5E7A4C", seed: 5 });
  house(g, { at: [-1, 0, -16], w: 9, h: 3.4, d: 6, wallC: "#E9E2D2", roofC: "#A8573A" });
}

// ---------- props: what the script puts in a hand, on a head or on a table ----------
// Each is built around where it is held or stands, its front toward +z (cena3d.js places and shows/hides them). Use
// them in a set's `props` (PROP.mug("#C8553D"), PROP.teacup...), or add your own the same way.
const ink = mat("#2B2B2B", { rough: 0.9 });
const PROP = {
  // a mug held by its body (the origin is the grip, mid-height), the handle on the figure's right, coffee inside
  mug: (color) => (g) => {
    const m = mat(color, { rough: 0.45 });
    cyl(g, 0.04, 0.095, [0, -0.05, 0], m, { seg: 16 });
    cyl(g, 0.036, 0.003, [0, 0.035, 0], mat("#3B2416", { rough: 0.3 }), { seg: 16, shadow: false });
    torus(g, 0.022, 0.006, [-0.045, -0.003, 0], m, { seg: 10 });
  },
  // a phone, 7.5 × 15.5 cm, its screen lit: upright (held) or lying on its back
  phone: (screen, flat) => (g) => {
    const o = flat ? group(g, [0, 0.0045, 0]) : g;
    if (flat) o.rotation.x = -Math.PI / 2;
    box(o, [0.075, 0.155, 0.009], [0, 0, 0], mat("#1B1D20", { rough: 0.35, metal: 0.2 }), { center: true });
    box(o, [0.067, 0.144, 0.002], [0, 0, 0.0052], glow(screen, 1.4), { center: true, shadow: false });
  },
  // a sheet of paper held by its lower outer corner (side 1: in the left hand, it reaches to the right), a colored tab
  page: (side, tab) => (g) => {
    const x = -side * 0.09;
    box(g, [0.21, 0.297, 0.002], [x, 0.12, 0], mat("#F4F2EC", { rough: 0.9 }), { center: true });
    for (let i = 0; i < 8; i++) box(g, [i % 3 ? 0.15 : 0.11, 0.005, 0.001], [x - (i % 3 ? 0 : 0.02), 0.22 - i * 0.022, 0.0015], ink, { center: true, shadow: false });
    box(g, [0.045, 0.03, 0.003], [x + side * 0.07, 0.25, 0.001], mat(tab), { center: true, shadow: false });
  },
  // a running shoe over the mannequin's foot (in the foot's own space)
  sneaker: (g) => {
    box(g, [0.108, 0.082, 0.286], [0, 0.004, 0.07], mat("#2F6BE8", { rough: 0.6 }));
    box(g, [0.114, 0.027, 0.296], [0, -0.022, 0.072], mat("#F2F2EE", { rough: 0.7 }));
    box(g, [0.05, 0.012, 0.11], [0, 0.084, 0.11], mat("#F2F2EE"), { shadow: false });
  },
  earring: (g) => {
    torus(g, 0.011, 0.0022, [0, 0, 0], metal("#D9B44A", 0.25), { seg: 14 });
    sphere(g, [0.005, 0.005, 0.005], [0, -0.014, 0], metal("#D9B44A", 0.25));
  },
  // pliers held by the grips, the jaws forward
  pliers: (g) => {
    for (const s of [-1, 1]) {
      bar(g, [s * 0.012, 0, -0.05], [s * 0.005, 0, 0.02], 0.007, mat("#C0261E", { rough: 0.6 }), { round: true });
      bar(g, [s * 0.005, 0, 0.02], [s * 0.002, 0, 0.072], 0.004, metal("#9EA3A6", 0.35), { round: true });
    }
  },
  // an open menu, held by its right edge in the right hand, pages toward the figure
  menu: (g) => {
    const cover = mat("#5B1F26", { rough: 0.6 }), page = mat("#EFE6D2", { rough: 0.9 });
    for (const [x, ry] of [[-0.12, 8], [-0.36, -8]]) {
      box(g, [0.24, 0.32, 0.007], [x, 0.14, 0], cover, { center: true, ry });
      box(g, [0.215, 0.29, 0.002], [x, 0.14, 0.005], page, { center: true, ry, shadow: false });
      for (let i = 0; i < 7; i++) box(g, [0.15, 0.005, 0.001], [x, 0.24 - i * 0.03, 0.0065], ink, { center: true, ry, shadow: false });
    }
  },
  wineGlass: (g) => {
    const gl = glass("#E8EEF0", 0.35);
    cyl(g, 0.034, 0.004, [0, 0, 0], gl, { seg: 14 });
    cyl(g, 0.0045, 0.085, [0, 0.004, 0], gl, { seg: 8 });
    cyl(g, 0.03, 0.082, [0, 0.089, 0], gl, { top: 1.45, seg: 14 });
    cyl(g, 0.031, 0.034, [0, 0.092, 0], mat("#5E0E1A", { rough: 0.25 }), { top: 1.25, seg: 14, shadow: false });
  },
  // a plate of food on a table
  plate: (g) => {
    cyl(g, 0.13, 0.014, [0, 0, 0], mat("#F4F1EA", { rough: 0.4 }), { top: 1.1, seg: 22 });
    sphere(g, [0.07, 0.03, 0.055], [0, 0.022, 0], mat("#5C2E1E", { rough: 0.8 }), { lowpoly: true });
    for (let i = 0; i < 3; i++) box(g, [0.03, 0.012, 0.012], [0.05 * Math.cos(i * 2), 0.02, 0.05 * Math.sin(i * 2)], mat("#E07A2E"), { center: true, ry: i * 50 });
  },
  bottle: (g) => {
    const gr = mat("#1F3B2A", { rough: 0.2, metal: 0.1 });
    cyl(g, 0.037, 0.21, [0, 0, 0], gr, { seg: 14 });
    cyl(g, 0.037, 0.05, [0, 0.21, 0], gr, { top: 0.35, seg: 14 });
    cyl(g, 0.013, 0.075, [0, 0.26, 0], gr, { seg: 10 });
    cyl(g, 0.0378, 0.075, [0, 0.06, 0], mat("#E8DCC0"), { seg: 14, shadow: false });
  },
  teacup: (g) => {
    const por = mat("#F2EFEA", { rough: 0.35 });
    cyl(g, 0.07, 0.01, [0, 0, 0], por, { seg: 18 });
    cyl(g, 0.034, 0.055, [0, 0.01, 0], por, { top: 1.3, seg: 16 });
    cyl(g, 0.041, 0.003, [0, 0.058, 0], mat("#9A5A2A"), { seg: 16, shadow: false });
    torus(g, 0.016, 0.005, [0.052, 0.04, 0], por, { seg: 10 });
  },
  // a headset on the head (head space): band over the head, two ear cups, the mic toward the mouth
  headset: (g) => {
    const dk = mat("#1E1E22", { rough: 0.5 }), pad = mat("#3A3A40", { rough: 0.8 });
    torus(g, 0.118, 0.011, [0, 0.02, 0], dk, { arc: 180, seg: 20 });
    for (const s of [-1, 1]) cyl(g, 0.043, 0.03, [s * 0.11, 0.0, 0], pad, { rz: 90, center: true, seg: 14 });
    bar(g, [0.12, -0.01, 0.02], [0.06, -0.085, 0.115], 0.005, dk, { round: true });
    sphere(g, [0.013, 0.013, 0.013], [0.055, -0.09, 0.12], dk);
  },
  // a bunch of grapes hanging from the fingers
  grapes: (g) => {
    bar(g, [0, 0, 0], [0, -0.03, 0.005], 0.003, mat("#4E5A33"), { round: true });
    const berry = mat("#3B2450", { rough: 0.35 });
    let i = 0;
    for (const [n, y, r] of [[5, -0.04, 0.03], [4, -0.065, 0.025], [3, -0.09, 0.018], [2, -0.112, 0.01], [1, -0.13, 0]]) {
      for (let k = 0; k < n; k++, i++) sphere(g, [0.012, 0.012, 0.012], [r * Math.cos(k * 2.4 + i), y, r * Math.sin(k * 2.4 + i)], berry);
    }
  },
};

// ---------- the sets ----------
export const SETS = {
  1: {
    name: "Cozinha", build: cozinha,
    // early morning: a low sun behind the house comes in through the window over the sink; warm bounce, the pendant on
    env: { bg: "#C9B79C", sky: ["#AFC9DA", "#F3E7CF", "#B9B49C"], fog: ["#EFE6D2", 18, 80], hemi: ["#F1E9DA", "#7A6248", 0.9],
      sun: { pos: [3, 4.5, -9], target: [0.3, 0, -1.2], color: "#FFE0B2", i: 2.4, box: 7 },
      points: [[0.35, 1.5, -0.45, "#FFD6A0", 0.8, 4], [0.3, 1.7, -1.6, "#FFF0D8", 0.6, 5]], exposure: 1.0 },
    cams: [
      { id: "aprovada", label: "Aprovada", title: "O enquadramento da imagem aprovada", lens: 24, pos: [1.75, 1.5, 0.6], target: [-0.7, 1.15, -2.0] },
      { id: "p1", label: "P1 · Aberto", title: "Aberto: a cozinha de manhã, a luz da janela · 21mm", lens: 21, pos: [-1.85, 1.65, 0.7], target: [0.6, 1.0, -1.7] },
      { id: "p2", label: "P2 · Médio", title: "Médio: a Mãe na bancada, a caneca na mão · 40mm", lens: 40, pos: [1.25, 1.4, -1.1], target: [-0.55, 1.2, -1.6] },
      { id: "p3", label: "P3 · Close", title: "Close: o primeiro gole · 85mm", lens: 85, pos: [0.35, 1.55, -1.0], target: [-0.55, 1.53, -1.55] },
    ],
    // the room, a few cm inside the walls, floor and ceiling; the fridge is a solid the camera goes around
    bounds: [{ box: [-2.07, 0.05, -2.52, 2.07, 2.54, 0.87], cut: [[1.36, -1, -2.6, 2.2, 1.9, -1.87]] }],
    cast: [{ item: "Mãe", name: "Mãe", pose: "hold", at: [-0.55, 0, -1.55], ry: 25, height: 1.65, build: "f" }],
    // "Já passou o café?": her mug in the right hand
    props: [
      { key: "caneca", name: "Caneca", color: "#C8553D", attach: { cast: 0, bone: "rHand", at: [0, -0.1, 0.04], rot: [0, 0, 0] }, build: PROP.mug("#C8553D") },
    ],
    // the product on the counter, next to the coffee maker
    device: { at: [-0.3, 0.9, -2.3], ry: 15 },
  },
};
