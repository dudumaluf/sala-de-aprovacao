// The product's stand-in ("o produto", PRODUCT in config.js): a neutral rounded box about the size of something held in
// one hand, so the team can place it, put it in a figure's hand and frame it before the real product has a 3D model.
// Origin at the base, front = +z: the light label on the front shows which way it faces. To block with the product's
// real shape, change makeDevice (same origin and front); cena3d.js only needs the group, its meshes as direct children,
// userData.height (meters, shown in the panel) and the states below.
// States: the select next to the product in the panel, saved in the set and in each angle (`led`, a stored key). Here a
// small light on the front, on or off; a product with no light or screen can keep a single state and the select goes
// away. The first state is the default.
import { THREE, mat, glow } from "./kit.js";

export const LED_STATES = [["aceso", "Luz acesa"], ["apagado", "Luz apagada"]];

const W = 0.09, H = 0.16, D = 0.06, R = 0.012; // 9 × 16 × 6 cm, edges rounded by R
const B = 0.004; // the bevel on the top and bottom edges
const ON = glow("#7DF0B5", 2.2), OFF = mat("#3A3D3E", { rough: 0.6 });

// a rounded rectangle (W × D) extruded up to H, with softened top and bottom edges; base at y = 0
function bodyGeo() {
  const s = new THREE.Shape();
  const hw = W / 2 - R, hd = D / 2 - R;
  s.absarc(hw, -hd, R - B, -Math.PI / 2, 0, false);
  s.absarc(hw, hd, R - B, 0, Math.PI / 2, false);
  s.absarc(-hw, hd, R - B, Math.PI / 2, Math.PI, false);
  s.absarc(-hw, -hd, R - B, Math.PI, Math.PI * 1.5, false);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: H - 2 * B, bevelEnabled: true, bevelThickness: B, bevelSize: B, bevelSegments: 2, curveSegments: 6 });
  geo.translate(0, 0, B);
  geo.rotateX(-Math.PI / 2); // extruded along +z, stood up along +y
  return geo;
}

export function makeDevice() {
  const g = new THREE.Group();
  g.name = "device";
  const add = (geo, m, [x, y, z], shadow = true) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.castShadow = shadow;
    o.receiveShadow = true;
    g.add(o);
    return o;
  };
  add(bodyGeo(), mat("#2E3134", { rough: 0.55 }), [0, 0, 0]);
  // the label on the front, and the light above it
  add(new THREE.BoxGeometry(W * 0.72, H * 0.46, 0.002), mat("#E4DED2", { rough: 0.8 }), [0, H * 0.42, D / 2 + 0.001], false);
  const light = add(new THREE.BoxGeometry(W * 0.4, 0.006, 0.002), ON, [0, H * 0.78, D / 2 + 0.001], false);
  g.userData = { light, led: LED_STATES[0][0], height: H };
  return g;
}

// an unknown state (one saved before the states changed) falls back to the first
export function setLed(dev, state = LED_STATES[0][0]) {
  const k = LED_STATES.some(([s]) => s === state) ? state : LED_STATES[0][0];
  dev.userData.light.material = k === "apagado" ? OFF : ON;
  dev.userData.led = k;
}
