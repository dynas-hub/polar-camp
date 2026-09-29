// Every model in the game is built from simple primitives (no external assets yet).
// Geometries and materials are shared so hundreds of objects stay cheap.
import * as THREE from 'three';
import { CAMP_HALF } from './config.js';

const mat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

export const M = {
  snow: mat(0xf4f8fc),
  plank: mat(0xd09a5e),
  wood: mat(0xb57a3f),
  woodDark: mat(0x7d4a22),
  bark: mat(0x8a5328),
  logEnd: mat(0xe7c08a),
  pine: mat(0x2f6f5a),
  pineDark: mat(0x245a49),
  parka: mat(0x2f7fd8),
  parkaDark: mat(0x245f9f),
  skin: mat(0xf1c49e),
  beard: mat(0x8b4c24),
  beanie: mat(0xff7a2f),
  black: mat(0x1b1b1f),
  steel: mat(0xc9d3dc),
  bear: mat(0xf7f5ef),
  bearMega: mat(0xcfe3f1),
  bearNose: mat(0x2a2a2e),
  meat: mat(0xd9474a),
  meatFat: mat(0xf6d7c8),
  bone: mat(0xf7f1e3),
  cash: mat(0x5cbf4a),
  cashDark: mat(0x3e8f33),
  roof: mat(0xc2473b),
  rock: mat(0x9aa7b3),
  fire: new THREE.MeshBasicMaterial({ color: 0xffa630 }),
  fireCore: new THREE.MeshBasicMaterial({ color: 0xfff08a }),
  eyeRed: new THREE.MeshBasicMaterial({ color: 0xff3b30 }),
};

const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.SphereGeometry(1, 16, 12),
  sphereLo: new THREE.SphereGeometry(1, 10, 8),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 12),
  cylLo: new THREE.CylinderGeometry(1, 1, 1, 7),
  cone: new THREE.ConeGeometry(1, 1, 8),
  cone4: new THREE.ConeGeometry(1, 1, 4),
  capsule: new THREE.CapsuleGeometry(1, 1, 4, 12),
};

function part(geo, material, sx, sy, sz, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// ---------- Player: our own lumberjack (orange beanie, blue parka, big beard) ----------
// Workers reuse the same body with other colors, a hard hat and no beard.
export function makePlayer(opts = {}) {
  const worker = !!opts.parka;
  const parka = worker ? mat(opts.parka) : M.parka;
  const parkaDark = worker ? mat(opts.parkaDark) : M.parkaDark;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const legL = part(G.box, parkaDark, 0.2, 0.45, 0.24, -0.15, 0.23, 0);
  const legR = part(G.box, parkaDark, 0.2, 0.45, 0.24, 0.15, 0.23, 0);
  body.add(legL, legR);
  body.add(part(G.capsule, parka, 0.36, 0.36, 0.3, 0, 0.82, 0));
  body.add(part(G.box, M.woodDark, 0.74, 0.08, 0.62, 0, 0.62, 0)); // belt

  const head = new THREE.Group();
  head.position.set(0, 1.38, 0);
  head.add(part(G.sphere, M.skin, 0.27, 0.27, 0.27));
  if (!worker) head.add(part(G.sphere, M.beard, 0.25, 0.2, 0.2, 0, -0.12, 0.1));
  head.add(part(G.sphere, M.black, 0.035, 0.045, 0.03, -0.09, 0.05, 0.25));
  head.add(part(G.sphere, M.black, 0.035, 0.045, 0.03, 0.09, 0.05, 0.25));
  head.add(part(G.sphere, M.skin, 0.06, 0.05, 0.05, 0, -0.01, 0.27)); // nose
  if (worker) {
    const hat = mat(opts.hat);
    head.add(part(G.sphere, hat, 0.3, 0.2, 0.3, 0, 0.1, 0)); // hard hat dome
    head.add(part(G.cyl, hat, 0.36, 0.03, 0.36, 0, 0.08, 0.03)); // brim
  } else {
    head.add(part(G.cyl, M.beanie, 0.29, 0.2, 0.29, 0, 0.16, 0));
    head.add(part(G.cyl, mat(0xffffff), 0.3, 0.07, 0.3, 0, 0.07, 0)); // beanie rim
    head.add(part(G.sphere, mat(0xffffff), 0.09, 0.09, 0.09, 0, 0.31, 0)); // pompom
  }
  body.add(head);

  body.add(part(G.capsule, parka, 0.1, 0.22, 0.1, -0.42, 0.85, 0));

  // Right arm + axe on a pivot at the shoulder; swinging rotates this pivot.
  const arm = new THREE.Group();
  arm.position.set(0.42, 1.05, 0);
  arm.add(part(G.capsule, parka, 0.1, 0.22, 0.1, 0, -0.22, 0));
  const axe = new THREE.Group();
  axe.position.set(0, -0.42, 0.05);
  axe.rotation.x = Math.PI / 2;
  axe.add(part(G.cyl, M.woodDark, 0.04, 0.8, 0.04, 0, 0.3, 0));
  axe.add(part(G.box, M.steel, 0.06, 0.2, 0.3, 0, 0.62, 0.12));
  axe.visible = opts.axe !== false;
  arm.add(axe);
  body.add(arm);

  // Items carried on the back stack up from this anchor.
  const back = new THREE.Group();
  back.position.set(0, 0.7, -0.42);
  body.add(back);

  root.userData = { body, arm, head, legL, legR, back };
  return root;
}

// ---------- Environment ----------
export function makeTree() {
  const g = new THREE.Group();
  const top = new THREE.Group();
  g.add(part(G.cylLo, M.bark, 0.2, 0.8, 0.2, 0, 0.4, 0));
  const tiers = [[0.95, 1.1, 1.05], [0.75, 0.95, 1.65], [0.5, 0.8, 2.2]];
  tiers.forEach(([r, h, y], i) => {
    top.add(part(G.cone, i % 2 ? M.pineDark : M.pine, r, h, r, 0, y, 0));
    top.add(part(G.cone, M.snow, r * 0.55, h * 0.45, r * 0.55, 0, y + h * 0.3, 0));
  });
  g.add(top);
  g.userData.top = top;
  return g;
}

export function makeStump() {
  const g = new THREE.Group();
  g.add(part(G.cylLo, M.bark, 0.22, 0.3, 0.22, 0, 0.15, 0));
  g.add(part(G.cylLo, M.logEnd, 0.18, 0.02, 0.18, 0, 0.31, 0));
  return g;
}

export function makeRock(s = 1) {
  const g = new THREE.Group();
  g.add(part(G.sphereLo, M.rock, 0.6 * s, 0.4 * s, 0.5 * s, 0, 0.1 * s, 0));
  g.add(part(G.sphereLo, M.snow, 0.45 * s, 0.18 * s, 0.38 * s, 0, 0.35 * s, 0));
  return g;
}

export function makeCampfire() {
  const g = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.add(part(G.sphereLo, M.rock, 0.16, 0.12, 0.16, Math.cos(a) * 0.45, 0.06, Math.sin(a) * 0.45));
  }
  const l1 = part(G.cylLo, M.bark, 0.09, 0.8, 0.09, 0, 0.12, 0); l1.rotation.z = Math.PI / 2; l1.rotation.y = 0.6;
  const l2 = part(G.cylLo, M.bark, 0.09, 0.8, 0.09, 0, 0.12, 0); l2.rotation.z = Math.PI / 2; l2.rotation.y = -0.6;
  g.add(l1, l2);
  const flame = part(G.cone, M.fire, 0.25, 0.6, 0.25, 0, 0.45, 0);
  const core = part(G.cone, M.fireCore, 0.13, 0.35, 0.13, 0, 0.35, 0);
  flame.castShadow = core.castShadow = false;
  g.add(flame, core);
  g.userData.flames = [flame, core];
  const light = new THREE.PointLight(0xffa040, 6, 6, 1.5);
  light.position.y = 0.8;
  g.add(light);
  g.userData.light = light;
  return g;
}

export function makeTent() {
  const g = new THREE.Group();
  const cloth = part(G.cone4, mat(0x3f8fc7), 1.3, 1.5, 1.3, 0, 0.75, 0);
  cloth.rotation.y = Math.PI / 4;
  g.add(cloth);
  g.add(part(G.box, M.black, 0.5, 0.7, 0.05, 0, 0.35, 0.62));
  g.add(part(G.cone4, M.snow, 0.55, 0.4, 0.55, 0, 1.35, 0));
  return g;
}

// Wooden floor: the main camp by default; (width, depth) for the expansion.
export function makeCampFloor(width = CAMP_HALF * 2, depth = CAMP_HALF * 2) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#d19b5f';
  x.fillRect(0, 0, 512, 512);
  const rows = 12, h = 512 / rows;
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * 90;
    x.fillStyle = r % 2 ? '#cc945a' : '#d6a268';
    x.fillRect(0, r * h + 2, 512, h - 4);
    x.fillStyle = '#9c6a36';
    x.fillRect(0, r * h, 512, 3);
    for (let s = -off; s < 512; s += 180) x.fillRect(s, r * h, 3, h);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  // keep the planks the same size on a non-square floor
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(width / 12, depth / 12);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(width, 0.12, depth), [
    M.woodDark, M.woodDark, new THREE.MeshLambertMaterial({ map: tex }), M.woodDark, M.woodDark, M.woodDark,
  ]);
  floor.position.y = 0.06;
  floor.receiveShadow = true;
  return floor;
}

// ---------- Items ----------
export function makeLog() {
  const g = new THREE.Group();
  const l = part(G.cylLo, M.bark, 0.14, 0.72, 0.14);
  l.rotation.z = Math.PI / 2;
  g.add(l);
  const e1 = part(G.cylLo, M.logEnd, 0.11, 0.02, 0.11, 0.365, 0, 0); e1.rotation.z = Math.PI / 2;
  const e2 = part(G.cylLo, M.logEnd, 0.11, 0.02, 0.11, -0.365, 0, 0); e2.rotation.z = Math.PI / 2;
  g.add(e1, e2);
  g.userData.h = 0.27;
  return g;
}

export function makeMeat() {
  const g = new THREE.Group();
  g.add(part(G.sphere, M.meat, 0.28, 0.13, 0.22, -0.05, 0, 0));
  g.add(part(G.sphere, M.meatFat, 0.2, 0.135, 0.15, -0.12, 0, 0.03));
  const bone = part(G.cylLo, M.bone, 0.045, 0.3, 0.045, 0.28, 0, 0);
  bone.rotation.z = Math.PI / 2;
  g.add(bone);
  g.add(part(G.sphereLo, M.bone, 0.07, 0.07, 0.07, 0.43, 0, 0.04));
  g.add(part(G.sphereLo, M.bone, 0.07, 0.07, 0.07, 0.43, 0, -0.04));
  g.userData.h = 0.26;
  return g;
}

export function makeSteak() {
  const g = new THREE.Group();
  const cooked = mat(0x8a4a26);
  g.add(part(G.sphere, cooked, 0.28, 0.12, 0.22, -0.05, 0, 0));
  for (const x of [-0.18, -0.05, 0.08]) g.add(part(G.box, mat(0x3b1f10), 0.035, 0.02, 0.3, x, 0.11, 0)); // grill marks
  const bone = part(G.cylLo, M.bone, 0.045, 0.3, 0.045, 0.28, 0, 0);
  bone.rotation.z = Math.PI / 2;
  g.add(bone);
  g.add(part(G.sphereLo, M.bone, 0.07, 0.07, 0.07, 0.43, 0, 0.04));
  g.add(part(G.sphereLo, M.bone, 0.07, 0.07, 0.07, 0.43, 0, -0.04));
  g.userData.h = 0.25;
  return g;
}

// Stone fire pit with a grate and a side tray for cooked steaks.
export function makeGrill() {
  const g = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    g.add(part(G.sphereLo, M.rock, 0.22, 0.2, 0.22, Math.cos(a) * 0.6, 0.12, Math.sin(a) * 0.6));
  }
  const flame = part(G.cone, M.fire, 0.35, 0.55, 0.35, 0, 0.3, 0);
  const core = part(G.cone, M.fireCore, 0.18, 0.35, 0.18, 0, 0.25, 0);
  flame.castShadow = core.castShadow = false;
  g.add(flame, core);
  g.add(part(G.box, M.black, 1.2, 0.04, 1.2, 0, 0.62, 0)); // grate
  for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) g.add(part(G.box, M.black, 0.06, 0.62, 0.06, x, 0.31, z));
  // side tray for the finished steaks
  g.add(part(G.box, M.plank, 0.9, 0.1, 1.1, 1.2, 0.55, 0));
  for (const [x, z] of [[0.85, -0.45], [1.55, -0.45], [0.85, 0.45], [1.55, 0.45]]) g.add(part(G.box, M.woodDark, 0.08, 0.55, 0.08, x, 0.27, z));
  const light = new THREE.PointLight(0xff8a30, 4, 5, 1.5);
  light.position.y = 1;
  g.add(light);
  g.userData = { flames: [flame, core], light };
  return g;
}

export function makeWoodpileBase() {
  const g = new THREE.Group();
  g.add(part(G.box, M.woodDark, 1.5, 0.1, 1.1, 0, 0.17, 0));
  g.add(part(G.box, M.woodDark, 0.1, 0.7, 0.1, -0.75, 0.45, -0.5));
  g.add(part(G.box, M.woodDark, 0.1, 0.7, 0.1, 0.75, 0.45, -0.5));
  return g;
}

// Green meat from the poison bear: worthless raw, $30 once grilled.
export function makeToxicMeat() {
  const g = makeMeat();
  const green = mat(0x7fd34e), pale = mat(0xd6f5b8);
  g.children[0].material = green;
  g.children[1].material = pale;
  return g;
}

export function makeSpicySteak() {
  const g = makeSteak();
  g.children[0].material = mat(0xb33a1a);
  g.add(part(G.cone, mat(0xff4a1c), 0.05, 0.16, 0.05, -0.12, 0.16, 0.06));  // little chili peppers
  g.add(part(G.cone, mat(0xff8a1c), 0.05, 0.16, 0.05, 0.02, 0.16, -0.05));
  return g;
}

export function makePlate() {
  const g = new THREE.Group();
  g.add(part(G.box, mat(0x8e9aa6), 0.62, 0.1, 0.38));
  g.add(part(G.box, mat(0x5b6570), 0.5, 0.11, 0.06, 0, 0, 0));
  g.userData.h = 0.12;
  return g;
}

// Boss loot: a sack of cash picked up by walking over it.
export function makeLootBag() {
  const g = new THREE.Group();
  g.add(part(G.sphere, mat(0xb07a3a), 0.38, 0.34, 0.38, 0, 0.34, 0));
  g.add(part(G.cylLo, mat(0x7d4a22), 0.14, 0.14, 0.14, 0, 0.72, 0));
  g.add(part(G.box, M.cash, 0.3, 0.05, 0.18, 0, 0.86, 0));
  g.userData.h = 0.9;
  return g;
}

export function makeCash() {
  const g = new THREE.Group();
  g.add(part(G.box, M.cash, 0.5, 0.07, 0.28));
  g.add(part(G.box, M.cashDark, 0.16, 0.075, 0.16));
  g.userData.h = 0.08;
  return g;
}

// ---------- Bears ----------
// variant: 'normal' | 'mega' | 'armored' | 'poison' | 'thrower'
const furFor = {
  normal: M.bear, mega: M.bearMega, armored: M.bear, thrower: mat(0xf1e9da),
  poison: mat(0x9be36b),
};

export function makeBear(variant = 'normal') {
  const mega = variant !== 'normal';
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const fur = furFor[variant] || M.bear;
  body.add(part(G.sphere, fur, 0.55, 0.48, 0.8, 0, 0.75, 0));
  const head = new THREE.Group();
  head.position.set(0, 0.95, 0.75);
  head.add(part(G.sphere, fur, 0.36, 0.33, 0.38));
  head.add(part(G.sphere, fur, 0.18, 0.15, 0.2, 0, -0.07, 0.32));
  head.add(part(G.sphere, M.bearNose, 0.07, 0.055, 0.05, 0, -0.02, 0.5));
  const eye = mega ? M.eyeRed : M.black;
  head.add(part(G.sphere, eye, 0.045, 0.045, 0.04, -0.14, 0.1, 0.32));
  head.add(part(G.sphere, eye, 0.045, 0.045, 0.04, 0.14, 0.1, 0.32));
  head.add(part(G.sphere, fur, 0.1, 0.1, 0.06, -0.24, 0.26, 0));
  head.add(part(G.sphere, fur, 0.1, 0.1, 0.06, 0.24, 0.26, 0));
  body.add(head);
  const legs = [];
  for (const [x, z] of [[-0.3, 0.45], [0.3, 0.45], [-0.3, -0.45], [0.3, -0.45]]) {
    const leg = part(G.cylLo, fur, 0.15, 0.55, 0.15, x, 0.28, z);
    body.add(leg);
    legs.push(leg);
  }
  const plates = [];
  let heldLog = null;
  if (variant === 'armored') {
    const steel = mat(0x8e9aa6), rivet = mat(0x5b6570);
    // helmet
    head.add(part(G.sphere, steel, 0.39, 0.2, 0.41, 0, 0.14, -0.02));
    head.add(part(G.box, rivet, 0.06, 0.06, 0.3, 0, 0.3, 0.1));
    // three back plates, knocked off one by one by the axe
    for (const z of [0.35, 0, -0.35]) {
      const p = part(G.box, steel, 0.95, 0.12, 0.34, 0, 1.2, z);
      p.rotation.x = z * 0.25;
      body.add(p);
      plates.push(p);
    }
  } else if (variant === 'poison') {
    // droopy tongue + purple eyes
    head.add(part(G.box, mat(0xb03a8c), 0.08, 0.03, 0.16, 0.05, -0.2, 0.46));
    head.children.filter((c) => c.material === M.black || c.material === M.eyeRed).forEach((c) => { c.material = mat(0x7a2ea0); });
  } else if (variant === 'thrower') {
    // a lumberjack cap (stolen?) and a log held in its front paws
    head.add(part(G.cyl, mat(0xc2473b), 0.3, 0.14, 0.3, 0, 0.3, 0));
    head.add(part(G.box, mat(0xc2473b), 0.3, 0.04, 0.22, 0, 0.24, 0.28));
    heldLog = makeLog();
    heldLog.position.set(0, 1.15, 0.65);
    heldLog.scale.setScalar(1.2);
    body.add(heldLog);
  }
  root.userData = { body, head, legs, plates, heldLog };
  return root;
}

// Poison bear's death cloud: a translucent green blob that swells, then bursts.
export function makeCloud() {
  const m = new THREE.Mesh(G.sphereLo, new THREE.MeshBasicMaterial({ color: 0x8fe05a, transparent: true, opacity: 0.35, depthWrite: false }));
  return m;
}

// ---------- Buildings ----------
export function makeTower() {
  const g = new THREE.Group();
  for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
    g.add(part(G.box, M.wood, 0.16, 2.2, 0.16, x, 1.1, z));
  }
  const brace1 = part(G.box, M.woodDark, 1.25, 0.1, 0.08, 0, 1.0, 0.5); brace1.rotation.z = 0.7;
  const brace2 = part(G.box, M.woodDark, 1.25, 0.1, 0.08, 0, 1.0, -0.5); brace2.rotation.z = -0.7;
  g.add(brace1, brace2);
  g.add(part(G.box, M.plank, 1.5, 0.14, 1.5, 0, 2.2, 0));
  for (const [x, z, w, d] of [[0, 0.72, 1.5, 0.08], [0, -0.72, 1.5, 0.08], [0.72, 0, 0.08, 1.5], [-0.72, 0, 0.08, 1.5]]) {
    g.add(part(G.box, M.woodDark, w, 0.35, d, x, 2.45, z));
  }
  const roof = part(G.cone4, M.roof, 1.2, 0.8, 1.2, 0, 3.55, 0);
  roof.rotation.y = Math.PI / 4;
  g.add(roof);
  for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) {
    g.add(part(G.box, M.woodDark, 0.08, 0.9, 0.08, x, 2.9, z));
  }
  // Rotating crossbow, raised above the rail (top at 2.62) so it never clips through it.
  const head = new THREE.Group();
  head.position.set(0, 2.85, 0);
  head.add(part(G.box, M.woodDark, 0.12, 0.12, 0.7, 0, 0, 0.1));
  head.add(part(G.box, M.wood, 0.8, 0.07, 0.1, 0, 0, 0.35));
  head.add(part(G.box, M.steel, 0.05, 0.05, 0.4, 0, 0.07, 0.25));
  g.add(head);
  g.userData.head = head;
  return g;
}

// Arrow tower turned ballista: raised on iron-banded posts, big steel bow, gold roof tip.
export function makeBallista() {
  const g = makeTower();
  const iron = mat(0x4a525b), gold = mat(0xffc84a, { emissive: 0x4a3300 });
  g.scale.y = 1.12;
  for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
    g.add(part(G.box, iron, 0.2, 0.12, 0.2, x, 0.6, z));
    g.add(part(G.box, iron, 0.2, 0.12, 0.2, x, 1.6, z));
  }
  g.add(part(G.cone, gold, 0.18, 0.4, 0.18, 0, 4.1, 0));
  const head = g.userData.head;
  head.clear();
  // (kept inside the corner posts, radius 0.85, as it turns: the old bow poked through them)
  head.add(part(G.box, iron, 0.2, 0.2, 1.0, 0, 0, 0.15));
  const bowL = part(G.box, M.steel, 0.6, 0.08, 0.12, -0.3, 0, 0.38); bowL.rotation.y = -0.35;
  const bowR = part(G.box, M.steel, 0.6, 0.08, 0.12, 0.3, 0, 0.38); bowR.rotation.y = 0.35;
  head.add(bowL, bowR);
  const bolt = part(G.cylLo, gold, 0.05, 0.8, 0.05, 0, 0.12, 0.25);
  bolt.rotation.x = Math.PI / 2;
  head.add(bolt);
  g.userData.ballista = true;
  return g;
}

// Heartwood: a glowing golden log, only dropped by the log thrower.
export function makeHeartwood() {
  const g = makeLog();
  const gold = mat(0xffb933, { emissive: 0x5a3a00 });
  g.children[0].material = gold;
  g.children[1].material = g.children[2].material = mat(0xfff0b0, { emissive: 0x6b5a20 });
  g.userData.h = 0.27;
  return g;
}

export function makeArrow() {
  const g = new THREE.Group();
  const shaft = part(G.cylLo, M.woodDark, 0.025, 0.7, 0.025);
  shaft.rotation.x = Math.PI / 2;
  const tip = part(G.cone, M.steel, 0.05, 0.14, 0.05, 0, 0, 0.4);
  tip.rotation.x = Math.PI / 2;
  g.add(shaft, tip);
  return g;
}

export function makeCounter() {
  const g = new THREE.Group();
  g.add(part(G.box, M.plank, 1.7, 0.14, 0.9, 0, 0.85, 0));
  for (const [x, z] of [[-0.7, -0.35], [0.7, -0.35], [-0.7, 0.35], [0.7, 0.35]]) {
    g.add(part(G.box, M.woodDark, 0.12, 0.85, 0.12, x, 0.42, z));
  }
  g.add(part(G.box, M.woodDark, 0.08, 1.2, 0.08, -0.8, 1.4, -0.4));
  g.add(part(G.box, M.woodDark, 0.08, 1.2, 0.08, 0.8, 1.4, -0.4));
  const sign = part(G.box, M.cash, 1.4, 0.4, 0.06, 0, 1.85, -0.4);
  g.add(sign);
  return g;
}

// Palisade wall from a WALLS line { axis, at, from, to, gate }.
// axis 'x' runs along x at z = at; axis 'z' runs along z at x = at. A gate leaves a 3.2 m gap.
// Returns the mesh group and its colliders (AABBs).
export function makeWall(line) {
  const g = new THREE.Group();
  const colliders = [];
  const mid0 = (line.from + line.to) / 2;
  const segs = line.gate ? [[line.from, mid0 - 1.6], [mid0 + 1.6, line.to]] : [[line.from, line.to]];
  const alongX = line.axis === 'x';
  for (const [a, b] of segs) {
    for (let t = a; t <= b + 0.001; t += 0.36) {
      const h = 1.35 + ((Math.sin(t * 12.9898 + line.at) * 43758.5453) % 1 + 1) % 1 * 0.3;
      const stake = new THREE.Group();
      stake.add(part(G.cylLo, M.wood, 0.17, h, 0.17, 0, h / 2, 0));
      stake.add(part(G.cone, M.wood, 0.17, 0.32, 0.17, 0, h + 0.16, 0));
      stake.add(part(G.cylLo, M.snow, 0.17, 0.06, 0.17, 0, h - 0.02, 0));
      if (alongX) stake.position.set(t, 0, line.at); else stake.position.set(line.at, 0, t);
      g.add(stake);
    }
    // horizontal beam, on the camp side
    const len = b - a, mid = (a + b) / 2;
    const inward = line.at > 0 ? -0.18 : 0.18;
    if (alongX) {
      g.add(part(G.box, M.woodDark, len, 0.14, 0.12, mid, 0.9, line.at + inward));
      colliders.push({ minX: a - 0.2, maxX: b + 0.2, minZ: line.at - 0.25, maxZ: line.at + 0.25 });
    } else {
      g.add(part(G.box, M.woodDark, 0.12, 0.14, len, line.at + inward, 0.9, mid));
      colliders.push({ minX: line.at - 0.25, maxX: line.at + 0.25, minZ: a - 0.2, maxZ: b + 0.2 });
    }
  }
  return { group: g, colliders };
}

// Improved oven for the camp expansion: a stone smokehouse with a chimney and a side rack.
export function makeSmokehouse() {
  const g = new THREE.Group();
  const stone = mat(0x8d98a3), dark = mat(0x5b6570);
  g.add(part(G.box, stone, 1.5, 1.1, 1.3, 0, 0.55, 0));
  g.add(part(G.box, dark, 0.7, 0.55, 0.06, 0, 0.45, 0.66)); // oven mouth
  const glow = part(G.box, M.fire, 0.55, 0.35, 0.02, 0, 0.4, 0.68);
  glow.castShadow = false;
  g.add(glow);
  const roof = part(G.cone4, M.roof, 1.2, 0.6, 1.1, 0, 1.4, 0);
  roof.rotation.y = Math.PI / 4;
  g.add(roof);
  g.add(part(G.box, stone, 0.3, 1.0, 0.3, 0.45, 1.7, -0.35)); // chimney
  // side rack for the smoked meat
  g.add(part(G.box, M.plank, 0.9, 0.1, 1.1, 1.3, 0.55, 0));
  for (const [x, z] of [[0.95, -0.45], [1.65, -0.45], [0.95, 0.45], [1.65, 0.45]]) g.add(part(G.box, M.woodDark, 0.08, 0.55, 0.08, x, 0.27, z));
  const light = new THREE.PointLight(0xff8a30, 3, 4, 1.5);
  light.position.set(0, 0.6, 1);
  g.add(light);
  g.userData = { flames: [glow, glow], light, chimney: new THREE.Vector3(0.45, 2.3, -0.35) };
  return g;
}

// Poison vial (dropped by the poison bear): glass flask with glowing green liquid.
export function makeVial() {
  const g = new THREE.Group();
  const glass = new THREE.MeshLambertMaterial({ color: 0xd8f5ff, transparent: true, opacity: 0.45 });
  const liquid = mat(0x7fe04a, { emissive: 0x2a6a10 });
  g.add(part(G.sphereLo, liquid, 0.18, 0.16, 0.18, 0, 0, 0));
  g.add(part(G.sphere, glass, 0.22, 0.2, 0.22, 0, 0.02, 0));
  g.add(part(G.cylLo, glass, 0.07, 0.18, 0.07, 0, 0.26, 0));
  g.add(part(G.cylLo, M.woodDark, 0.08, 0.06, 0.08, 0, 0.37, 0)); // cork
  g.userData.h = 0.42;
  return g;
}

// ---------- UI-in-world ----------
let padTexture = null;
function getPadTexture() {
  if (padTexture) return padTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(255,255,255,0.16)';
  x.beginPath(); x.roundRect(14, 14, 228, 228, 26); x.fill();
  x.strokeStyle = 'rgba(255,255,255,0.95)';
  x.lineWidth = 12;
  x.setLineDash([30, 20]);
  x.beginPath(); x.roundRect(14, 14, 228, 228, 26); x.stroke();
  padTexture = new THREE.CanvasTexture(c);
  padTexture.colorSpace = THREE.SRGBColorSpace;
  return padTexture;
}

export const PAD_SIZE = 1.9;

export function makePad(color = 0x7cff6b) {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(
    new THREE.PlaneGeometry(PAD_SIZE, PAD_SIZE),
    new THREE.MeshBasicMaterial({ map: getPadTexture(), transparent: true, depthWrite: false }),
  );
  frame.rotation.x = -Math.PI / 2;
  frame.position.y = 0.14;
  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(PAD_SIZE * 0.86, PAD_SIZE * 0.86),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false }),
  );
  fill.rotation.x = -Math.PI / 2;
  fill.position.y = 0.145;
  fill.scale.y = 0.0001;
  g.add(frame, fill);
  g.userData = { frame, fill };
  return g;
}

export function setPadProgress(pad, p) {
  const { fill } = pad.userData;
  const s = PAD_SIZE * 0.86;
  fill.scale.y = Math.max(0.0001, p);
  fill.position.z = s / 2 - (p * s) / 2;
}

// Guidance: a bouncing yellow marker above the current goal...
export function makeGoalMarker() {
  const g = new THREE.Group();
  const yellow = new THREE.MeshBasicMaterial({ color: 0xffd34d });
  const cone = new THREE.Mesh(G.cone, yellow);
  cone.scale.set(0.38, 0.6, 0.38);
  cone.rotation.x = Math.PI; // pointing down
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.07, 8, 32), yellow);
  ring.rotation.x = -Math.PI / 2;
  ring.userData.ground = true;
  g.add(cone, ring);
  g.userData = { cone, ring };
  return g;
}

// ...and a flat arrow on the ground next to the player pointing toward it.
export function makeDirArrow() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.55); shape.lineTo(0.38, 0); shape.lineTo(0.14, 0); shape.lineTo(0.14, -0.4);
  shape.lineTo(-0.14, -0.4); shape.lineTo(-0.14, 0); shape.lineTo(-0.38, 0); shape.lineTo(0, 0.55);
  const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.9, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

export function makeHealthBar(width = 1, color = 0xff4d4d) {
  const g = new THREE.Group();
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(width, 0.13), new THREE.MeshBasicMaterial({ color: 0x1d2b3a, transparent: true, opacity: 0.7, depthWrite: false }));
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.94, 0.08), new THREE.MeshBasicMaterial({ color, depthWrite: false }));
  fill.position.z = 0.001;
  g.add(bg, fill);
  g.renderOrder = 10;
  g.userData = { fill, width: width * 0.94 };
  return g;
}

export function setHealth(bar, f) {
  const { fill, width } = bar.userData;
  f = Math.max(0.0001, Math.min(1, f));
  fill.scale.x = f;
  fill.position.x = -(1 - f) * width / 2;
}
