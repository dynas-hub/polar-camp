// Every model in the game is built from simple primitives (no external assets yet).
// Geometries and materials are shared so hundreds of objects stay cheap.
import * as THREE from 'three';
import { CAMP_HALF } from './config.js';

import { world } from './worlds.js';

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

// island outfits and plants
const SHIRT = mat(0xdcc79c), SHIRT_PATCH = mat(0xb39a6a), STRAW = mat(0xe6c770);
const SAND_FUR = mat(0xd9a75c), SAND_FUR_DARK = mat(0xc28c45), SAND_MARK = mat(0x6e4220);
const SAND_EYE = new THREE.MeshBasicMaterial({ color: 0xff8a1a });
// island bosses: crab-shell armor, the coconut thrower's bandana, the shell bear's shell, monkeys
const CRAB = mat(0xe0563a), CRAB_RIM = mat(0xf2925e), BANDANA = mat(0x2f8fd8);
const SHELL = mat(0xf6dcc0), SHELL_STRIPE = mat(0xd9825a);
const MONKEY_FUR = mat(0x7a4a2a), MONKEY_FACE = mat(0xf0c9a0);
const CHIEF_FUR = mat(0xd0702e), CHIEF_BELLY = mat(0xe8a868), CHIEF_DARK = mat(0x5a3018);
const PALM_LEAF = mat(0x4caa52), PALM_LEAF_DARK = mat(0x358a40), PALM_RING = mat(0x7a5a38), COCONUT = mat(0x6b4423);

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

// ---------- World looks (src/worlds.js) ----------
// Builders follow the current world's look unless told otherwise (the Asset Studio asks for each look).
const look = () => world().look;
// The camp's shared materials are recolored once at startup for the world being played.
const CAMP = {
  wood: { plank: 0xd09a5e, wood: 0xb57a3f, woodDark: 0x7d4a22, roof: 0xc2473b, bark: 0x8a5328, logEnd: 0xe7c08a, rock: 0x9aa7b3,
    floor: ['#d19b5f', '#cc945a', '#d6a268', '#9c6a36'] },
  // bamboo poles, thatch roofs, palm wood, sandstone
  // (darker than the sand and a little green, so the camp stands out from the beach)
  bamboo: { plank: 0xc29e52, wood: 0x9fb04a, woodDark: 0x5f6a25, roof: 0xd9b25c, bark: 0x9a7448, logEnd: 0xead39c, rock: 0xb9a98c,
    floor: ['#b8954c', '#ae8b44', '#c19e55', '#7a6128'] },
};
export function applyWorldLook(l = look()) {
  const c = CAMP[l.camp] || CAMP.wood;
  for (const k of ['plank', 'wood', 'woodDark', 'roof', 'bark', 'logEnd', 'rock']) M[k].color.setHex(c[k]);
}

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
// outfit: 'parka' (polar) or 'castaway' (island: torn beige shirt, shorts, straw hat, bare legs).
// Castaway workers keep their role color on the shorts and the hat band.
export function makePlayer(opts = {}) {
  const worker = !!opts.parka;
  const castaway = (opts.outfit ?? look().outfit) === 'castaway';
  const parka = castaway ? SHIRT : worker ? mat(opts.parka) : M.parka;
  const parkaDark = worker ? mat(opts.parkaDark) : M.parkaDark;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const legMat = castaway ? M.skin : parkaDark;
  const legL = part(G.box, legMat, 0.2, 0.45, 0.24, -0.15, 0.23, 0);
  const legR = part(G.box, legMat, 0.2, 0.45, 0.24, 0.15, 0.23, 0);
  body.add(legL, legR);
  body.add(part(G.capsule, parka, 0.36, 0.36, 0.3, 0, 0.82, 0));
  if (castaway) {
    // shorts (the player's in blue, workers' in their role color), a torn hem and a patch
    body.add(part(G.box, worker ? mat(opts.parka) : M.parka, 0.62, 0.28, 0.38, 0, 0.4, 0));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const tooth = part(G.cone4, SHIRT, 0.07, 0.14, 0.07, Math.sin(a) * 0.33, 0.5, Math.cos(a) * 0.28);
      tooth.rotation.x = Math.PI; // points down
      body.add(tooth);
    }
    body.add(part(G.box, SHIRT_PATCH, 0.14, 0.14, 0.04, -0.12, 0.9, 0.29));
  }
  body.add(part(G.box, M.woodDark, 0.74, 0.08, 0.62, 0, 0.62, 0)); // belt

  const head = new THREE.Group();
  head.position.set(0, 1.38, 0);
  head.add(part(G.sphere, M.skin, 0.27, 0.27, 0.27));
  if (!worker) head.add(part(G.sphere, M.beard, 0.25, 0.2, 0.2, 0, -0.12, 0.1));
  head.add(part(G.sphere, M.black, 0.035, 0.045, 0.03, -0.09, 0.05, 0.25));
  head.add(part(G.sphere, M.black, 0.035, 0.045, 0.03, 0.09, 0.05, 0.25));
  head.add(part(G.sphere, M.skin, 0.06, 0.05, 0.05, 0, -0.01, 0.27)); // nose
  if (castaway) {
    // straw hat with a colored band (orange for the player, the role color for workers)
    head.add(part(G.cyl, STRAW, 0.48, 0.03, 0.48, 0, 0.13, 0)); // wide brim
    head.add(part(G.cyl, STRAW, 0.24, 0.18, 0.24, 0, 0.24, 0));
    head.add(part(G.cyl, worker ? mat(opts.hat) : M.beanie, 0.25, 0.05, 0.25, 0, 0.18, 0));
  } else if (worker) {
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
// kind: 'pine' (polar, snow on the tiers) or 'palm' (island). userData.top shakes when chopped.
export function makeTree(kind = look().tree) {
  if (kind === 'palm') return makePalm();
  const g = new THREE.Group();
  const top = new THREE.Group();
  g.add(part(G.cylLo, M.bark, 0.2, 0.8, 0.2, 0, 0.4, 0));
  const tiers = [[0.95, 1.1, 1.05], [0.75, 0.95, 1.65], [0.5, 0.8, 2.2]];
  tiers.forEach(([r, h, y], i) => {
    top.add(part(G.cone, i % 2 ? M.pineDark : M.pine, r, h, r, 0, y, 0));
    if (look().snowCaps) top.add(part(G.cone, M.snow, r * 0.55, h * 0.45, r * 0.55, 0, y + h * 0.3, 0));
  });
  g.add(top);
  g.userData.top = top;
  return g;
}

// Palm tree: a leaning ringed trunk, a crown of drooping leaves and three coconuts.
function makePalm() {
  const g = new THREE.Group();
  const top = new THREE.Group();
  let x = 0;
  for (let i = 0; i < 5; i++) {
    const seg = part(G.cylLo, i % 2 ? PALM_RING : M.bark, 0.2 - i * 0.015, 0.46, 0.2 - i * 0.015, x, 0.23 + i * 0.44, 0);
    seg.rotation.z = -0.06 * i;
    top.add(seg);
    x += 0.03 * i; // the trunk leans more toward the top
  }
  const crown = new THREE.Group();
  crown.position.set(x, 2.3, 0);
  crown.scale.setScalar(0.9);
  for (let i = 0; i < 7; i++) {
    const leafMat = i % 2 ? PALM_LEAF : PALM_LEAF_DARK;
    const leaf = new THREE.Group();
    leaf.rotation.y = (i / 7) * Math.PI * 2 + 0.3;
    const inner = new THREE.Group();
    inner.rotation.x = -0.35; // the leaf rises a little, then its tip droops
    inner.add(part(G.box, leafMat, 0.34, 0.04, 0.8, 0, 0, 0.4));
    const tip = new THREE.Group();
    tip.position.z = 0.78;
    tip.rotation.x = 0.9;
    tip.add(part(G.box, leafMat, 0.26, 0.04, 0.7, 0, 0, 0.33));
    inner.add(tip);
    leaf.add(inner);
    crown.add(leaf);
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    crown.add(part(G.sphereLo, COCONUT, 0.12, 0.12, 0.12, Math.cos(a) * 0.16, -0.12, Math.sin(a) * 0.16));
  }
  top.add(crown);
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
  if (look().snowCaps) g.add(part(G.sphereLo, M.snow, 0.45 * s, 0.18 * s, 0.38 * s, 0, 0.35 * s, 0));
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
  const cloth = part(G.cone4, mat(look().tent), 1.3, 1.5, 1.3, 0, 0.75, 0);
  cloth.rotation.y = Math.PI / 4;
  g.add(cloth);
  g.add(part(G.box, M.black, 0.5, 0.7, 0.05, 0, 0.35, 0.62));
  if (look().snowCaps) g.add(part(G.cone4, M.snow, 0.55, 0.4, 0.55, 0, 1.35, 0));
  return g;
}

// Wooden floor: the main camp by default; (width, depth) for the expansion.
export function makeCampFloor(width = CAMP_HALF * 2, depth = CAMP_HALF * 2) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d');
  const [base, odd, even, line] = (CAMP[look().camp] || CAMP.wood).floor;
  x.fillStyle = base;
  x.fillRect(0, 0, 512, 512);
  const rows = 12, h = 512 / rows;
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * 90;
    x.fillStyle = r % 2 ? odd : even;
    x.fillRect(0, r * h + 2, 512, h - 4);
    x.fillStyle = line;
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
// variant: 'normal' | 'mega' | 'armored' | 'poison' | 'thrower' | 'king' (polar)
//          | 'coco' | 'monkey' | 'shell' (island; with the sand look, 'armored' wears crab shell)
const furFor = {
  normal: M.bear, mega: M.bearMega, armored: M.bear, thrower: mat(0xf1e9da),
  poison: mat(0x9be36b),
  // the King is a brilliant white (owner's review): pure white with a little glow so it pops on the snow
  king: mat(0xffffff, { emissive: 0x3a3a3a }),
};
// the Bear King's cape: an open half tube (+ a bit more) that becomes a blanket over the back
const CAPE_GEO = new THREE.CylinderGeometry(1, 1, 1, 18, 1, true, Math.PI * 0.4, Math.PI * 1.2);
// the Bear King's ice armor: translucent so it reads as ice, not steel
const ICE = mat(0xa8e4ff, { transparent: true, opacity: 0.82, emissive: 0x1b4d66 });

// outfit: null (polar bears), or 'sand' (island sand bears: sandy fur, bright orange eyes and
// palm-brown markings from the back up to the face; the bosses keep their red eyes)
export function makeBear(variant = 'normal', outfit = look().bearOutfit) {
  if (variant === 'monkey') return makeMonkeyChief();
  const sand = outfit === 'sand';
  const mega = variant !== 'normal';
  const root = new THREE.Group();
  root.userData = {};
  const body = new THREE.Group();
  root.add(body);
  const fur = sand && variant !== 'poison' ? (variant === 'mega' ? SAND_FUR_DARK : SAND_FUR) : furFor[variant] || M.bear;
  body.add(part(G.sphere, fur, 0.55, 0.48, 0.8, 0, 0.75, 0));
  const head = new THREE.Group();
  head.position.set(0, 0.95, 0.75);
  head.add(part(G.sphere, fur, 0.36, 0.33, 0.38));
  head.add(part(G.sphere, fur, 0.18, 0.15, 0.2, 0, -0.07, 0.32));
  head.add(part(G.sphere, M.bearNose, 0.07, 0.055, 0.05, 0, -0.02, 0.5));
  const eye = mega ? M.eyeRed : sand ? SAND_EYE : M.black;
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
  if (sand) {
    // markings sit on the body's surface (an ellipsoid 0.55 × 0.48 × 0.8 centered at y 0.75)
    const top = (z) => 0.75 + 0.48 * Math.sqrt(Math.max(0, 1 - (z / 0.8) ** 2));
    for (const z of [-0.55, -0.3, -0.05, 0.2, 0.42]) body.add(part(G.sphereLo, SAND_MARK, 0.11, 0.03, 0.15, 0, top(z) - 0.015, z)); // spine
    for (const z of [-0.4, -0.1, 0.2]) {
      // stripes down the flanks, like the rings of a palm trunk
      const k = Math.sqrt(1 - (z / 0.8) ** 2), a = 0.85;
      for (const side of [-1, 1]) {
        // long along the flank, thin along the surface normal so it lies flat on the fur
        const m = part(G.sphereLo, SAND_MARK, 0.17, 0.03, 0.09, side * 0.55 * Math.sin(a) * k * 0.99, 0.75 + 0.48 * Math.cos(a) * k * 0.99, z);
        m.rotation.z = -side * a;
        body.add(m);
      }
    }
    // the stripe climbs over the head to the forehead, and two tear marks under the eyes
    head.add(part(G.sphereLo, SAND_MARK, 0.08, 0.04, 0.2, 0, 0.3, 0.02));
    for (const x of [-0.13, 0.13]) {
      const t = part(G.sphereLo, SAND_MARK, 0.035, 0.08, 0.03, x * 1.05, -0.03, 0.31);
      t.rotation.z = x > 0 ? 0.35 : -0.35;
      head.add(t);
    }
  }
  const plates = [];
  let heldLog = null;
  if (variant === 'armored') {
    // steel on the polar map, crab shell on the island
    const steel = sand ? CRAB : mat(0x8e9aa6), rivet = sand ? CRAB_RIM : mat(0x5b6570);
    // helmet
    head.add(part(G.sphere, steel, 0.39, 0.2, 0.41, 0, 0.14, -0.02));
    head.add(part(G.box, rivet, 0.06, 0.06, 0.3, 0, 0.3, 0.1));
    // three back plates, knocked off one by one by the axe
    for (const z of [0.35, 0, -0.35]) {
      const p = sand ? part(G.sphere, steel, 0.55, 0.17, 0.22, 0, 1.17, z) : part(G.box, steel, 0.95, 0.12, 0.34, 0, 1.2, z);
      if (sand) p.add(part(G.sphere, rivet, 0.85, 0.5, 0.85, 0, 0.35, 0)); // lighter top of each shell plate
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
  } else if (variant === 'coco') {
    // island coconut thrower: a blue bandana and a coconut held in its front paws
    head.add(part(G.cyl, BANDANA, 0.37, 0.07, 0.37, 0, 0.17, 0));
    head.add(part(G.box, BANDANA, 0.06, 0.18, 0.04, 0.12, 0.08, -0.36));
    heldLog = makeCoconut();
    heldLog.position.set(0, 1.45, 1.0);
    heldLog.scale.setScalar(1.4);
    body.add(heldLog);
  } else if (variant === 'shell') {
    // island final boss: a giant striped shell on its back. It curls up inside to roll into the
    // walls (bears.js moves `shell`), and the shell breaks for good in phase 2.
    const shell = new THREE.Group();
    shell.position.set(0, 1.25, -0.15);
    shell.add(part(G.sphere, SHELL, 0.7, 0.78, 0.82));
    // a snail spiral on each side: dots winding in two turns toward the middle of the side
    for (const side of [-1, 1]) {
      for (let i = 0; i < 34; i++) {
        const k = i / 33, a = k * Math.PI * 4, r = 0.68 * (1 - k * 0.92);
        const y = Math.sin(a) * r * 0.95, z = Math.cos(a) * r;
        const x = side * 0.7 * Math.sqrt(Math.max(0.04, 1 - (y / 0.78) ** 2 - (z / 0.82) ** 2));
        shell.add(part(G.sphereLo, SHELL_STRIPE, 0.07 - k * 0.03, 0.07 - k * 0.03, 0.07 - k * 0.03, x, y, z));
      }
      shell.add(part(G.sphere, SHELL_STRIPE, 0.1, 0.14, 0.14, side * 0.69, 0, 0)); // the spiral's eye
    }
    body.add(shell);
    root.userData.shell = shell;
  } else if (variant === 'king') {
    // World 1 final boss: a gold crown, a royal cape with a white fur collar, and ice armor
    // (two shoulder chunks and a chest plate) that the axe or a ballista breaks off one by one.
    const gold = mat(0xffc83d), gem = mat(0xe0304a), cape = mat(0x8a1f4f, { side: THREE.DoubleSide }), trim = mat(0xfbfbf7, { side: THREE.DoubleSide });
    const crown = new THREE.Group();
    crown.position.set(0, 0.3, -0.02);
    crown.add(part(G.cyl, gold, 0.24, 0.1, 0.24));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      crown.add(part(G.cone4, gold, 0.07, 0.17, 0.07, Math.sin(a) * 0.2, 0.12, Math.cos(a) * 0.2));
    }
    crown.add(part(G.sphere, gem, 0.045, 0.045, 0.03, 0, 0.01, 0.24));
    crown.rotation.z = 0.12; // worn a little crooked
    head.add(crown);
    // the cape: a half tube draped over the back, open at the rump, with a white fur trim at the
    // shoulders; userData.cape sways while walking
    const capePivot = new THREE.Group();
    capePivot.position.set(0, 0.76, 0.32);
    const cloth = part(CAPE_GEO, cape, 0.59, 1.0, 0.53, 0, 0, -0.48);
    const collar = part(CAPE_GEO, trim, 0.62, 0.16, 0.56, 0, 0, 0);
    for (const m of [cloth, collar]) m.rotation.x = Math.PI / 2;
    capePivot.add(cloth, collar);
    for (const x of [-0.32, 0, 0.32]) capePivot.add(part(G.sphere, M.black, 0.035, 0.035, 0.035, x, Math.sqrt(0.31 - x * x) * 0.97, 0.06));
    body.add(capePivot);
    // ice armor plates (knocked off by the axe / ballista bolts, like the armored bear's steel)
    for (const side of [-1, 1]) {
      const sh = new THREE.Group();
      sh.position.set(side * 0.46, 1.08, 0.42);
      sh.add(part(G.sphere, ICE, 0.26, 0.2, 0.3));
      sh.add(part(G.cone4, ICE, 0.09, 0.3, 0.09, side * 0.1, 0.22, 0));
      sh.add(part(G.cone4, ICE, 0.07, 0.22, 0.07, side * 0.12, 0.16, -0.16));
      body.add(sh);
      plates.push(sh);
    }
    const chest = part(G.box, ICE, 0.6, 0.36, 0.14, 0, 0.52, 0.72);
    chest.rotation.x = -0.25;
    body.add(chest);
    plates.push(chest);
    root.userData.cape = capePivot;
  }
  root.userData = { ...root.userData, body, head, legs, plates, heldLog };
  return root;
}

// Coconut: held and thrown by the island's coconut thrower.
export function makeCoconut() {
  const g = new THREE.Group();
  g.add(part(G.sphereLo, COCONUT, 0.2, 0.19, 0.2));
  for (const a of [0, 2.1, 4.2]) g.add(part(G.sphereLo, M.black, 0.035, 0.035, 0.02, Math.cos(a) * 0.07, 0.17, Math.sin(a) * 0.07));
  return g;
}

// Sharp shell: fired in rings by the shell bear's spin (points forward, +z).
export function makeSharpShell() {
  const g = new THREE.Group();
  const cone = part(G.cone, SHELL, 0.16, 0.5, 0.16);
  cone.rotation.x = Math.PI / 2;
  g.add(cone);
  const band = part(G.cylLo, SHELL_STRIPE, 0.13, 0.06, 0.13, 0, 0, -0.08);
  band.rotation.x = Math.PI / 2;
  g.add(band);
  return g;
}

// Small monkey: thrown by the monkey chief; clings to the player or a worker (arms reaching forward).
export function makeSmallMonkey() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  body.add(part(G.sphere, MONKEY_FUR, 0.17, 0.2, 0.15, 0, 0.28, 0));
  body.add(part(G.sphere, MONKEY_FACE, 0.11, 0.13, 0.05, 0, 0.27, 0.12)); // belly
  const head = new THREE.Group();
  head.position.set(0, 0.55, 0.03);
  head.add(part(G.sphere, MONKEY_FUR, 0.15, 0.14, 0.14));
  head.add(part(G.sphere, MONKEY_FACE, 0.11, 0.1, 0.06, 0, -0.02, 0.1));
  for (const x of [-0.05, 0.05]) head.add(part(G.sphere, M.black, 0.02, 0.025, 0.02, x, 0.02, 0.15));
  for (const x of [-0.15, 0.15]) head.add(part(G.sphere, MONKEY_FACE, 0.05, 0.06, 0.03, x, 0.02, 0));
  body.add(head);
  const arms = [];
  for (const x of [-0.13, 0.13]) {
    const arm = new THREE.Group();
    arm.position.set(x, 0.38, 0.05);
    arm.add(part(G.capsule, MONKEY_FUR, 0.04, 0.16, 0.04, 0, -0.12, 0));
    arm.rotation.x = -1.2; // reaching forward
    body.add(arm);
    arms.push(arm);
  }
  for (const x of [-0.08, 0.08]) body.add(part(G.capsule, MONKEY_FUR, 0.045, 0.1, 0.045, x, 0.1, 0.02));
  // curly tail
  [[0, 0.18, -0.16], [0, 0.3, -0.27], [0, 0.45, -0.3], [0, 0.55, -0.24]].forEach(([x, y, z]) => body.add(part(G.sphereLo, MONKEY_FUR, 0.04, 0.04, 0.04, x, y, z)));
  g.userData = { body, head, arms };
  return g;
}

// Monkey chief (island boss, replaces the poison bear): a big orange monkey with long arms and a
// leaf crown. It keeps its distance and throws small monkeys; `heldLog` is the one it's about to throw.
function makeMonkeyChief() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const legs = [];
  for (const x of [-0.22, 0.22]) {
    const leg = part(G.cylLo, CHIEF_FUR, 0.15, 0.55, 0.15, x, 0.28, 0);
    body.add(leg);
    legs.push(leg);
  }
  body.add(part(G.sphere, CHIEF_FUR, 0.52, 0.58, 0.44, 0, 1.0, 0));
  body.add(part(G.sphere, CHIEF_BELLY, 0.36, 0.42, 0.2, 0, 0.95, 0.28));
  const head = new THREE.Group();
  head.position.set(0, 1.72, 0.08);
  head.add(part(G.sphere, CHIEF_FUR, 0.34, 0.32, 0.32));
  head.add(part(G.sphere, MONKEY_FACE, 0.26, 0.24, 0.12, 0, -0.04, 0.24)); // face
  head.add(part(G.box, CHIEF_DARK, 0.4, 0.06, 0.08, 0, 0.1, 0.3)); // brow
  for (const x of [-0.1, 0.1]) head.add(part(G.sphere, M.eyeRed, 0.04, 0.04, 0.03, x, 0.03, 0.34));
  head.add(part(G.box, CHIEF_DARK, 0.14, 0.03, 0.03, 0, -0.14, 0.35)); // mouth
  for (const x of [-0.33, 0.33]) head.add(part(G.sphere, MONKEY_FACE, 0.09, 0.11, 0.05, x, 0.02, 0));
  // leaf crown
  head.add(part(G.cyl, PALM_LEAF_DARK, 0.33, 0.06, 0.33, 0, 0.2, 0));
  for (const a of [-0.5, 0, 0.5]) {
    const leaf = part(G.box, PALM_LEAF, 0.1, 0.32, 0.03, Math.sin(a) * 0.3, 0.38, Math.cos(a) * 0.3);
    leaf.rotation.z = -a * 0.6;
    head.add(leaf);
  }
  body.add(head);
  // long arms hanging to the ground (they swing with the legs when it walks)
  for (const x of [-0.58, 0.58]) {
    const arm = new THREE.Group();
    arm.position.set(x, 1.3, 0.05);
    arm.add(part(G.capsule, CHIEF_FUR, 0.12, 0.7, 0.12, 0, -0.5, 0));
    arm.add(part(G.sphere, CHIEF_DARK, 0.12, 0.1, 0.12, 0, -0.98, 0.04)); // hands
    body.add(arm);
    legs.push(arm);
  }
  const held = makeSmallMonkey();
  held.position.set(0, 0.55, 0.62);
  body.add(held);
  root.userData = { body, head, legs, plates: [], heldLog: held };
  return root;
}

// Bear King's ground slam warning: a red ring on the ground that fills in before the hit.
export function makeSlamRing() {
  const g = new THREE.Group();
  const edge = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 48), new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.9, depthWrite: false }));
  const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.25, depthWrite: false }));
  for (const m of [edge, fill]) { m.rotation.x = -Math.PI / 2; m.renderOrder = 5; }
  edge.position.y = 0.04; fill.position.y = 0.03;
  g.add(edge, fill);
  g.userData = { edge, fill };
  return g;
}

// Block of ice thrown by the Bear King at the walls (phase 2).
export function makeIceBlock() {
  const g = new THREE.Group();
  g.add(part(G.box, ICE, 0.7, 0.6, 0.7));
  g.add(part(G.box, mat(0xeaf8ff), 0.5, 0.08, 0.5, 0, 0.31, 0));
  return g;
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
      if (look().camp === 'bamboo') {
        // bamboo pole: dark rings at the nodes, cut flat on top
        for (const k of [0.33, 0.66, 1]) stake.add(part(G.cylLo, M.woodDark, 0.18, 0.05, 0.18, 0, h * k - 0.02, 0));
      } else {
        stake.add(part(G.cone, M.wood, 0.17, 0.32, 0.17, 0, h + 0.16, 0));
        if (look().snowCaps) stake.add(part(G.cylLo, M.snow, 0.17, 0.06, 0.17, 0, h - 0.02, 0));
      }
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
