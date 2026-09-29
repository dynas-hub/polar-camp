// Core gameplay: player, trees, bears, stacking, build zones, towers, selling, waves,
// grill, hired workers, save/load.
import * as THREE from 'three';
import {
  CAMP_HALF, PLAYER, TREE, BEAR, BOSSES, POISON, WALL, ARMOR, WAVES, TOWER, BALLISTA, ECONOMY, ZONES, UPGRADES, HELPERS, WOODPILE,
  WALLS, ANNEX_END, WORKERS, SMOKER,
} from './config.js';
import * as Models from './models.js';

const V = () => new THREE.Vector3();
const tmpA = V(), tmpB = V();
const SPAWN = new THREE.Vector3(0, 0, 2);
const IDLE_HUNTER = new THREE.Vector3(-1.5, 0, 4);
const WORLD_R = 38;
const SAVE_KEY = 'polarcamp-save-v1';

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lerpAngle = (a, b, t) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

const easeOutBack = (t) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

const dist2d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

const NO_SFX = { play() {}, setListener() {} };

export function createGame({ scene, camera, fx, input, hud, labelsEl, useSave = true, sfx = NO_SFX, saveKey = SAVE_KEY }) {
  // ---------- World ----------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), Models.M.snow);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  scene.add(Models.makeCampFloor());

  const colliders = []; // AABBs {minX,maxX,minZ,maxZ}
  const wallColliders = []; // subset used for path planning
  const circles = [];   // static round obstacles {x,z,r}
  const addBox = (x, z, hw, hd) => colliders.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd });

  const campfire = Models.makeCampfire();
  campfire.position.set(0, 0.12, -1);
  scene.add(campfire); // decoration: you can walk right over it
  // own flame materials so they can fade while the fire recharges (the grill shares the originals)
  campfire.userData.flames.forEach((f) => { f.material = f.material.clone(); f.material.transparent = true; });

  const tent = Models.makeTent();
  tent.position.set(-3.25, 0.12, 0.4);
  scene.add(tent);
  addBox(tent.position.x, tent.position.z, 0.95, 0.95);

  const rand = rng(7);
  const trees = [];
  let guard = 0;
  while (trees.length < TREE.count && guard++ < 5000) {
    const a = rand() * Math.PI * 2;
    const d = TREE.minDist + Math.sqrt(rand()) * (TREE.maxDist - TREE.minDist);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    // no trees on the camp or on the land kept for the expansion (south of the camp)
    if (Math.abs(x) < CAMP_HALF + 2.5 && z > -CAMP_HALF - 2.5 && z < ANNEX_END + 2.5) continue;
    // keep the camp's outer corners clear: workers walk around the walls through them
    const C = CAMP_HALF + 1.3;
    if (Math.abs(Math.abs(x) - C) < 2.5 && (Math.abs(Math.abs(z) - C) < 2.5 || Math.abs(z - (ANNEX_END + 1.3)) < 2.5)) continue;
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < TREE.spacing)) continue;
    const obj = Models.makeTree();
    const s = 0.85 + rand() * 0.35;
    obj.scale.setScalar(s);
    obj.position.set(x, 0, z);
    obj.rotation.y = rand() * 6;
    const stump = Models.makeStump();
    stump.position.set(x, 0, z);
    stump.visible = false;
    scene.add(obj, stump);
    trees.push({ obj, stump, x, z, s, hp: TREE.hp, alive: true, regrow: 0, shake: 0, grow: 1, claim: null });
  }
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2, d = 10 + rand() * 30;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (Math.abs(x) < CAMP_HALF + 1.5 && z > -CAMP_HALF - 1.5 && z < ANNEX_END + 1.5) continue;
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 1.6)) continue;
    const rock = Models.makeRock(0.7 + rand() * 0.9);
    rock.position.set(x, 0, z);
    scene.add(rock);
  }

  let clock = 0;
  const events = [];
  const stats = { kills: 0, logs: 0, sold: 0, cooked: 0 };

  // ---------- Carriers: anything with a stack on its back (player + workers) ----------
  const ITEM_MODELS = {
    log: Models.makeLog, steak: Models.makeSteak, meat: Models.makeMeat, heartwood: Models.makeHeartwood,
    vial: Models.makeVial, smoked: Models.makeSpicySteak,
    toxic: Models.makeToxicMeat, spicy: Models.makeSpicySteak, plate: Models.makePlate, loot: Models.makeLootBag,
  };
  const makeItem = (type) => (ITEM_MODELS[type] || Models.makeMeat)();
  const RAW = ['meat', 'toxic'];         // what the hunter carries and the grill accepts
  const PRICE = { spicy: ECONOMY.spicyPrice, smoked: SMOKER.price, steak: ECONOMY.steakPrice, meat: ECONOMY.meatPrice, toxic: ECONOMY.toxicPrice, log: ECONOMY.logPrice };

  function makeCarrier(obj, capFn, isPlayer = false) {
    return { obj, stack: [], incoming: 0, cap: capFn, isPlayer, sellT: 0, actT: 0 };
  }
  const stackFree = (c) => c.cap() - c.stack.length - c.incoming;
  const countOf = (c, type) => c.stack.reduce((n, it) => n + (it.type === type), 0);
  const rawCount = (c) => countOf(c, 'meat') + countOf(c, 'toxic');

  function layoutStack(c) {
    let y = 0;
    for (const it of c.stack) {
      it.mesh.position.set(0, y + it.mesh.userData.h / 2, 0);
      it.mesh.rotation.set(0, 0, 0);
      y += it.mesh.userData.h;
    }
    if (c.isPlayer) hud.setBag(c.stack.length, c.cap());
  }

  function backTarget(c) {
    let y = 0;
    for (const it of c.stack) y += it.mesh.userData.h;
    return c.obj.userData.back.localToWorld(new THREE.Vector3(0, y + 0.15, 0));
  }

  function pushStack(c, type, mesh) {
    mesh.scale.setScalar(1);
    c.stack.push({ type, mesh });
    c.obj.userData.back.add(mesh);
    layoutStack(c);
  }

  // Remove the top-most item of a type; returns {mesh, worldPos} or null.
  function popStack(c, type) {
    for (let i = c.stack.length - 1; i >= 0; i--) {
      if (c.stack[i].type !== type) continue;
      const [it] = c.stack.splice(i, 1);
      const wp = it.mesh.getWorldPosition(V());
      c.obj.userData.back.remove(it.mesh);
      layoutStack(c);
      return { mesh: it.mesh, worldPos: wp };
    }
    return null;
  }

  // Fly an item from a world position onto a carrier's back.
  function collectToBack(c, type, from, mesh = makeItem(type)) {
    c.incoming++;
    fx.fly(mesh, from, () => backTarget(c), {
      duration: 0.3, arc: 1.2,
      onDone: (m) => {
        c.incoming--;
        pushStack(c, type, m);
        sfx.play('pop', c.isPlayer ? {} : { at: c.obj.position, vol: 0.4 });
      },
    });
  }

  // ---------- Player ----------
  const levels = { axe: 0, bag: 0, armor: 0 };
  const armorMax = () => levels.armor * ARMOR.perLevel;
  const player = {
    obj: Models.makePlayer(),
    pos: SPAWN.clone(),
    vel: V(),
    facing: Math.PI,
    hp: PLAYER.maxHp,
    armor: 0,          // forged armor points, absorb hits before hp
    poisonT: 0,        // seconds of poison left
    poisonTick: 0,
    sinceHurt: 99,
    swingCd: 0,
    swingT: 1,
    pendingHit: null,
    walkT: 0,
    dead: false,
    maxMsgT: 0,
  };
  player.c = makeCarrier(player.obj, () => PLAYER.baseBag + levels.bag * PLAYER.bagPerLevel, true);
  scene.add(player.obj);
  // damage shown as a whole number when it's big, with one decimal while it's small
  const damage = () => Math.round(PLAYER.damage(levels.axe) * 10) / 10;
  // towers and walls follow the axe level (a tower's own `damage` is 1 for arrows, more for bolts)
  const towerMult = () => TOWER.damage(levels.axe);
  const wallMax = () => WALL.hp(levels.axe);
  const ballistaMax = () => BALLISTA.hp * wallMax() / WALL.hp(0);
  const repairPerLog = () => Math.round(wallMax() * WALL.repairShare);

  // ---------- Build zones & upgrades ----------
  const built = new Set();
  const zones = ZONES.map((def) => ({
    def, state: 'locked', paid: 0, total: def.cost.logs ?? def.cost.cash,
    currency: def.cost.logs ? 'log' : 'cash', payT: 0, pad: null, label: null, pop: 0,
  }));
  const upgrades = UPGRADES.map((def) => ({
    def, state: 'locked', level: 0, paid: 0, total: def.base, currency: def.currency || 'cash', payT: 0, pad: null, label: null, pop: 0,
  }));
  const CURRENCY_ICON = { log: '🪵', cash: '💵', plate: '🛡️' };

  function makeLabel() {
    const el = document.createElement('div');
    el.className = 'label zone-label';
    labelsEl.appendChild(el);
    return el;
  }

  function openPad(z, color) {
    z.state = 'open';
    z.pad = Models.makePad(color);
    z.pad.position.set(z.def.x, 0, z.def.z);
    z.pad.scale.setScalar(0.01);
    z.pop = 0;
    scene.add(z.pad);
    z.label = makeLabel();
    refreshLabel(z);
    Models.setPadProgress(z.pad, z.paid / z.total);
  }

  function refreshLabel(z) {
    const icon = CURRENCY_ICON[z.currency];
    const left = Math.max(0, z.total - z.paid);
    const title = z.def.icon ? `${z.def.icon} ${z.def.name} LV${z.level + 1}` : z.def.name;
    // the axe square shows what you're buying: damage now → after this level
    const fmt = (v) => (v < 10 ? v.toFixed(1) : Math.round(v));
    const extra = z.def.id === 'axe' ? `<span class="name">dmg ${fmt(PLAYER.damage(z.level))} → ${fmt(PLAYER.damage(z.level + 1))}</span>` : '';
    z.label.innerHTML = `<div><span class="name">${title}</span>${extra}${icon} ${left}</div>`;
  }

  const unlocked = (req) => !req || req.every((id) => built.has(id));

  function refreshUnlocks() {
    for (const z of zones) if (z.state === 'locked' && unlocked(z.def.requires)) openPad(z, 0x7cff6b);
    for (const u of upgrades) if (u.state === 'locked' && unlocked(u.def.requires)) openPad(u, 0xffd34d);
  }

  const counter = { built: false, obj: null, pos: V(), pile: [], pileValue: 0, collectT: 0 };
  // queue/out are counts; queueTypes/outTypes say what's cooking (meat → steak, toxic → spicy)
  const grill = { built: false, obj: null, pos: V(), queue: 0, queueTypes: [], cookT: 0, out: 0, outTypes: [], visuals: [], smokeT: 0, cookTime: ECONOMY.cookTime };
  // the smokehouse (camp expansion) works like the grill: faster, and everything comes out 'smoked'
  const smoker = { built: false, obj: null, pos: V(), queue: 0, queueTypes: [], cookT: 0, out: 0, outTypes: [], visuals: [], smokeT: 0, cookTime: SMOKER.cookTime, smoker: true };
  const cookers = [grill, smoker];
  const builtCookers = () => cookers.filter((k) => k.built);
  const nearestCooker = (p, filter = () => true) => builtCookers().filter(filter).sort((a, b) => dist2d(a.pos, p) - dist2d(b.pos, p))[0] || null;
  const woodpile = { built: false, obj: null, pos: new THREE.Vector3(WOODPILE.x, 0, WOODPILE.z), count: 0, visuals: [] };
  const towers = [];
  const arrows = [];
  const helpers = [];
  const popIns = [];

  function construct(z, silent = false) {
    const d = z.def;
    built.add(d.id);
    if (z.pad) scene.remove(z.pad);
    if (z.label) z.label.remove();
    z.state = 'built';
    let obj = null;
    if (d.kind === 'counter') {
      obj = Models.makeCounter();
      obj.position.set(d.x, 0.12, d.z);
      addBox(d.x, d.z, 0.9, 0.5);
      counter.built = true; counter.obj = obj; counter.pos.set(d.x, 0, d.z);
    } else if (d.kind === 'tower') {
      obj = Models.makeTower();
      obj.position.set(d.x, 0.12, d.z);
      addBox(d.x, d.z, 0.62, 0.62);
      const tower = {
        obj, id: d.id, x: d.x, z: d.z, fireT: 0.5, ballista: false, poison: false,
        range: TOWER.range, fireRate: TOWER.fireRate, damage: 1, up: null,
        hp: 0, box: colliders[colliders.length - 1], bar: null,
      };
      tower.box.tower = tower; // bears pushing against it can find the (ballista) to chew
      towers.push(tower);
    } else if (d.kind === 'wall') {
      const w = Models.makeWall(WALLS[d.wall]);
      obj = w.group;
      colliders.push(...w.colliders);
      wallColliders.push(...w.colliders);
      const wall = { side: d.wall, def: d, name: d.name, group: w.group, colliders: w.colliders, hp: wallMax(), broken: false, pad: null, label: null, payT: 0 };
      for (const c of w.colliders) c.wall = wall; // so a bear pushing against a collider knows which wall to chew
      walls.push(wall);
    } else if (d.kind === 'grill') {
      obj = Models.makeGrill();
      obj.position.set(d.x, 0.12, d.z);
      addBox(d.x, d.z, 0.75, 0.75);
      // (no collider on the side tray: with the tower next to it, it formed a dead-end pocket)
      grill.built = true; grill.obj = obj; grill.pos.set(d.x, 0, d.z);
    } else if (d.kind === 'hire') {
      if (d.helper === 'lumberjack' && !woodpile.built) buildWoodpile(silent);
      const at = d.spawn ? new THREE.Vector3(d.spawn.x, 0, d.spawn.z) : new THREE.Vector3(d.x, 0, d.z);
      spawnHelper(d.helper, at, silent, d.cooker);
    } else if (d.kind === 'expand') {
      // the annex: a new floor behind the south wall (its walls and buildings are separate squares)
      obj = Models.makeCampFloor(CAMP_HALF * 2, ANNEX_END - CAMP_HALF);
      obj.position.set(0, 0, (CAMP_HALF + ANNEX_END) / 2);
    } else if (d.kind === 'smoker') {
      obj = Models.makeSmokehouse();
      obj.position.set(d.x, 0.12, d.z);
      addBox(d.x, d.z, 0.8, 0.7);
      Object.assign(smoker, { built: true, obj, pos: new THREE.Vector3(d.x, 0, d.z) });
    }
    // ('milestone' squares like the expansion foundations just record progress)
    if (obj) {
      scene.add(obj);
      if (!silent) { obj.scale.setScalar(0.01); popIns.push({ obj, t: 0 }); }
    }
    if (!silent) {
      const at = d.kind === 'wall' ? pointForWall(d.wall) : new THREE.Vector3(d.x, 1, d.z);
      fx.burst(at, 0xffffff, 18, { speed: 5, up: 5, size: 0.18 });
      fx.burst(at, 0xd09a5e, 10, { speed: 4, up: 4 });
      fx.text(at.clone().setY(2.5), (d.kind === 'hire' ? d.name.replace('HIRE ', '') + ' HIRED' : d.name) + '!', 'warn', { life: 1.3, rise: 80 });
      fx.addShake(0.25);
      sfx.play('build');
      events.push({ type: 'build', id: d.id, t: clock });
      learn(z.currency === 'log' ? 'build' : 'buy');
      save();
    }
    refreshUnlocks();
  }

  // ---------- Wall health (the log thrower damages walls; wood repairs them) ----------
  const walls = [];

  function damageWall(w, dmg) {
    if (w.broken) return;
    w.hp = Math.max(0, w.hp - dmg);
    if (dmg >= 5) {
      fx.burst(pointForWall(w.side).setY(1.2), 0xb57a3f, 10, { speed: 4, up: 4, size: 0.14 });
      fx.addShake(0.1);
    }
    sfx.play(w.hp <= 0 ? 'crash' : 'crack', { at: pointForWall(w.side), vol: dmg >= 5 ? 1 : 0.5 });
    if (w.hp <= 0) {
      // a breach: bears walk through until it's repaired
      w.broken = true;
      w.group.visible = false;
      for (const c of w.colliders) {
        colliders.splice(colliders.indexOf(c), 1);
        wallColliders.splice(wallColliders.indexOf(c), 1);
      }
      fx.burst(pointForWall(w.side).setY(1), 0xd09a5e, 30, { speed: 6, up: 5, size: 0.2 });
      fx.text(pointForWall(w.side).setY(3), `${w.name} BROKEN!`, 'hurt', { life: 1.6, rise: 80 });
      events.push({ type: 'wallBroken', side: w.side, t: clock });
    }
    wallLook(w);
  }

  function repairWall(w, amount) {
    const wasBroken = w.broken;
    w.hp = Math.min(wallMax(), w.hp + amount);
    if (wasBroken && w.hp > 0) {
      w.broken = false;
      w.group.visible = true;
      colliders.push(...w.colliders);
      wallColliders.push(...w.colliders);
      fx.text(pointForWall(w.side).setY(3), `${w.name} REBUILT!`, 'warn', { life: 1.3, rise: 70 });
    }
    wallLook(w);
  }

  // Damaged walls lean: stakes tilt more as hp drops.
  function wallLook(w) {
    const dmg = 1 - w.hp / wallMax();
    w.group.children.forEach((s, i) => {
      if (!s.userData.tilt) s.userData.tilt = ((i * 7919) % 13) / 13 - 0.5;
      s.rotation.z = s.userData.tilt * dmg * 0.7;
      s.rotation.x = s.userData.tilt * dmg * 0.4;
    });
  }

  // A REPAIR square appears on the wall's build spot whenever it's damaged.
  function updateWalls(dt) {
    for (const w of walls) {
      const damaged = w.hp < wallMax();
      if (damaged && !w.pad) {
        w.pad = Models.makePad(0xffa640);
        w.pad.position.set(w.def.x, 0, w.def.z);
        scene.add(w.pad);
        w.label = makeLabel();
      }
      if (!damaged && w.pad) {
        scene.remove(w.pad); w.label.remove();
        w.pad = null; w.label = null;
        continue;
      }
      if (!w.pad) continue;
      const need = Math.ceil((wallMax() - w.hp) / repairPerLog());
      w.label.innerHTML = `<div><span class="name">REPAIR ${w.name}</span>🪵 ${need}</div>`;
      Models.setPadProgress(w.pad, w.hp / wallMax());
      const s = fx.toScreen(new THREE.Vector3(w.def.x, 0.2, w.def.z + 0.2));
      w.label.style.left = s.x + 'px'; w.label.style.top = s.y + 'px';
      // standing on it with wood: one log = 8% of the wall
      const on = Math.abs(player.pos.x - w.def.x) < PAD_REACH && Math.abs(player.pos.z - w.def.z) < PAD_REACH;
      w.payT -= dt;
      if (on && !player.dead && w.payT <= 0) {
        const it = popStack(player.c, 'log');
        if (it) {
          w.payT = ECONOMY.payTick * 2;
          fx.fly(it.mesh, it.worldPos, () => pointForWall(w.side).setY(0.8), { duration: 0.35, arc: 1.6 });
          repairWall(w, repairPerLog());
          sfx.play('hammer');
          learn('repair');
        }
      }
    }
  }

  function buildWoodpile(silent) {
    woodpile.built = true;
    woodpile.obj = Models.makeWoodpileBase();
    woodpile.obj.position.set(woodpile.pos.x, 0.12, woodpile.pos.z);
    scene.add(woodpile.obj);
    addBox(woodpile.pos.x, woodpile.pos.z, 0.75, 0.55);
    if (!silent) { woodpile.obj.scale.setScalar(0.01); popIns.push({ obj: woodpile.obj, t: 0 }); }
  }

  // middle point of a wall line (for effects, sounds and labels)
  function pointForWall(side) {
    const l = WALLS[side], mid = (l.from + l.to) / 2;
    return l.axis === 'x' ? new THREE.Vector3(mid, 1, l.at) : new THREE.Vector3(l.at, 1, mid);
  }

  // you pay when you stand inside a square: brushing its edge on the way past doesn't count
  const PAD_REACH = Models.PAD_SIZE / 2 - 0.1;
  function onPad(z) {
    return Math.abs(player.pos.x - z.def.x) < PAD_REACH && Math.abs(player.pos.z - z.def.z) < PAD_REACH;
  }

  let cash = 0;
  function setCash(v) { cash = v; hud.setCash(cash); }

  function payInto(z, dt) {
    if (!onPad(z)) { z.payT = 0; return; }
    z.payT -= dt;
    if (z.payT > 0) return;
    z.payT = ECONOMY.payTick;
    const target = new THREE.Vector3(z.def.x, 0.3, z.def.z);
    if (z.currency !== 'cash') {
      // paid with items from the back: logs, or armor plates for the ARMOR pad
      if (z.paid >= z.total) return;
      const it = popStack(player.c, z.currency);
      if (!it) return;
      z.paid++;
      fx.fly(it.mesh, it.worldPos, () => target, { duration: 0.28, arc: 1.4 });
    } else {
      if (cash <= 0 || z.paid >= z.total) return;
      const chunk = Math.min(cash, z.total - z.paid, Math.max(1, Math.ceil(z.total / 20)));
      z.paid += chunk;
      setCash(cash - chunk);
      fx.fly(Models.makeCash(), player.pos.clone().setY(1.2), () => target, { duration: 0.28, arc: 1.4 });
    }
    sfx.play('place');
    refreshLabel(z);
    Models.setPadProgress(z.pad, z.paid / z.total);
    if (z.paid >= z.total) z.completeT = 0.3;
  }

  function applyLevel(u) {
    // shared by level-ups and save loading
    if (u.level >= u.def.max) {
      u.state = 'built';
      if (u.pad) scene.remove(u.pad);
      if (u.label) u.label.remove();
      return;
    }
    u.paid = 0;
    u.total = u.def.step ? u.def.base + u.def.step * u.level : Math.round(u.def.base * Math.pow(u.def.growth, u.level));
    if (u.label) refreshLabel(u);
    if (u.pad) Models.setPadProgress(u.pad, 0);
  }

  function levelUp(u) {
    const wallBefore = wallMax(), ballistaBefore = ballistaMax();
    levels[u.def.id]++;
    // a sharper axe also toughens the standing walls and ballistas (the new hp comes at once)
    for (const w of walls) if (!w.broken && wallMax() > wallBefore) { w.hp += wallMax() - wallBefore; wallLook(w); }
    for (const t of towers) if (t.ballista) t.hp += ballistaMax() - ballistaBefore;
    u.level++;
    const at = new THREE.Vector3(u.def.x, 1.5, u.def.z);
    fx.burst(at, 0xffd34d, 16, { speed: 5, up: 5, size: 0.16 });
    fx.text(player.pos.clone().setY(2.6), `${u.def.name} LV${u.level + 1}!`, 'warn', { life: 1.2, rise: 80 });
    fx.addShake(0.15);
    sfx.play('levelup');
    events.push({ type: 'upgrade', id: u.def.id, level: u.level, t: clock });
    learn(u.currency === 'plate' ? 'forge' : 'buy');
    if (u.def.id === 'bag') layoutStack(player.c);
    if (u.def.id === 'armor') player.armor = armorMax(); // freshly forged: full armor
    applyLevel(u);
    save();
  }

  // ---------- Paths: get around walls through the gates / open sides ----------
  // Three regions: the camp ('main'), the expansion ('annex', once built) and the outside.
  // They connect through portals: a gate in a standing wall, or anywhere along a side whose
  // wall isn't built (or is broken). routeTarget returns the point to walk toward right now.
  // The wall bands count as inside, so walkers in a doorway finish crossing instead of
  // flip-flopping (a wall's outer face + body radius sits beyond +0.5).
  const H = CAMP_HALF;
  const expanded = () => built.has('expand');
  const standing = (side) => walls.some((w) => w.side === side && !w.broken);
  function region(p) {
    if (Math.abs(p.x) >= H + 0.5 || p.z <= -H - 0.5) return 'out';
    if (p.z < H) return 'main';
    if (!expanded()) return p.z < H + 0.5 ? 'main' : 'out';
    return p.z < ANNEX_END + 0.5 ? 'annex' : 'out';
  }
  const isInside = (p) => region(p) !== 'out';
  // an open side is crossed at least 2.4 m from its corners: the corner towers (1.5 m deep + a
  // body) sit there, and the old 1.3 m margin sent the lumberjack straight into the tower
  const clampRange = (v, lo, hi) => THREE.MathUtils.clamp(v, lo + 2.4, hi - 2.4);

  // Portals between two regions for this trip (open sides sit near the from→to midpoint).
  function portals(from, to) {
    const mx = clampRange((from.x + to.x) / 2, -H, H);
    const mzMain = clampRange((from.z + to.z) / 2, -H, H);
    const mzAnnex = clampRange((from.z + to.z) / 2, H, ANNEX_END);
    const list = [];
    const add = (a, b, pa, pb) => list.push({ a, b, pa, pb });
    // horizontal side (a line along x at z = at): gate in the middle if the wall stands
    const hSide = (side, at, inside, outside, dirIn) => {
      if (standing(side)) { if (WALLS[side].gate) add(inside, outside, { x: 0, z: at + dirIn }, { x: 0, z: at - dirIn }); }
      else add(inside, outside, { x: mx, z: at + dirIn }, { x: mx, z: at - dirIn });
    };
    const vSide = (side, at, inside, outside, mz, dirIn) => {
      if (!standing(side)) add(inside, outside, { x: at + dirIn, z: mz }, { x: at - dirIn, z: mz });
    };
    hSide('N', -H, 'main', 'out', 1);
    vSide('W', -H, 'main', 'out', mzMain, 1);
    vSide('E', H, 'main', 'out', mzMain, -1);
    if (!expanded()) hSide('S', H, 'main', 'out', -1);
    else {
      hSide('S', H, 'main', 'annex', -1);
      vSide('AW', -H, 'annex', 'out', mzAnnex, 1);
      vSide('AE', H, 'annex', 'out', mzAnnex, -1);
      hSide('AS', ANNEX_END, 'annex', 'out', -1);
    }
    return list;
  }

  function routeTarget(from, to) {
    const rf = region(from), rt = region(to);
    if (rf === rt) return aroundBuildings(from, viaCorner(from, to));
    const ps = portals(from, to);
    // oriented steps from region r: [near point, far point, next region]
    const stepsFrom = (r) => ps.flatMap((p) => (p.a === r ? [[p.pa, p.pb, p.b]] : p.b === r ? [[p.pb, p.pa, p.a]] : []));
    let best = null, bestLen = Infinity;
    for (const [n1, f1, r1] of stepsFrom(rf)) {
      if (r1 === rt) {
        const len = dist2d(from, n1) + dist2d(n1, f1) + dist2d(f1, to);
        if (len < bestLen) { bestLen = len; best = [n1, f1]; }
        continue;
      }
      // one region in between (e.g. annex → camp → forest)
      for (const [n2, f2, r2] of stepsFrom(r1)) {
        if (r2 !== rt) continue;
        const len = dist2d(from, n1) + dist2d(n1, f1) + dist2d(f1, n2) + dist2d(n2, f2) + dist2d(f2, to);
        if (len < bestLen) { bestLen = len; best = [n1, f1]; }
      }
    }
    if (!best) return viaCorner(from, to);
    const [first, second] = best;
    // Once lined up with the opening, head through it; otherwise go to its near side first.
    const dx = second.x - first.x, dz = second.z - first.z;
    const L2 = dx * dx + dz * dz;
    const t = ((from.x - first.x) * dx + (from.z - first.z) * dz) / L2;
    const px = first.x + dx * t, pz = first.z + dz * t;
    const lateral = Math.hypot(from.x - px, from.z - pz);
    const goal = t > -0.15 && lateral < 0.6 ? second : first;
    return viaCorner(from, new THREE.Vector3(goal.x, 0, goal.z));
  }

  // Outside the camp, a straight line can run into a wall: hop via the nearest outer corner.
  function viaCorner(from, to) {
    if (isInside(from) || !segBlocked(from, to)) return to;
    const C = H + 1.3, S = expanded() ? ANNEX_END + 1.3 : C;
    const corners = [[C, S], [C, -C], [-C, S], [-C, -C]].map(([x, z]) => ({ x, z }));
    // corner → goal, via one more corner when the camp still stands in the way (otherwise the
    // corner you stand next to always looked shortest and walkers turned back and forth there)
    const onward = (c) => !segBlocked(c, to) ? dist2d(c, to)
      : Math.min(...corners.filter((q) => q !== c && !segBlocked(c, q) && !segBlocked(q, to)).map((q) => dist2d(c, q) + dist2d(q, to)));
    let best = to, bestLen = Infinity;
    for (const c of corners) {
      if (dist2d(from, c) < 0.4 || segBlocked(from, c)) continue;
      // (a goal two corners away: fall back to the straight-line guess, heavily penalized)
      const next = onward(c);
      const len = dist2d(from, c) + (Number.isFinite(next) ? next : 1000 + dist2d(c, to));
      if (len < bestLen) { bestLen = len; best = new THREE.Vector3(c.x, 0, c.z); }
    }
    return best;
  }

  // A building (sell table, grill, tower...) right across the way: head for the corner of its
  // box that makes the shortest trip instead of pushing against it (the cashier coming from the
  // grill used to get stuck on the north face of the sell table). One corner per call: from
  // that corner the next call picks the next one, until the way is clear.
  function aroundBuildings(from, to, r = 0.4) {
    let hit = null, hitT = Infinity;
    for (const c of colliders) {
      if (c.wall) continue;
      // already touching it (or inside the margin): let the push-out and the detours handle it
      const near = (p) => p.x > c.minX - r && p.x < c.maxX + r && p.z > c.minZ - r && p.z < c.maxZ + r;
      // (or the goal itself sits against it, like a spot right next to the grill)
      if (near(from) || near(to)) continue;
      const t = segHitsBox(from, to, c, r);
      if (t !== null && t < hitT) { hitT = t; hit = c; }
    }
    if (!hit) return to;
    const m = r + 0.3;
    const corners = [[hit.minX - m, hit.minZ - m], [hit.maxX + m, hit.minZ - m], [hit.minX - m, hit.maxZ + m], [hit.maxX + m, hit.maxZ + m]].map(([x, z]) => ({ x, z }));
    const clear = (a, b) => segHitsBox(a, b, hit, r) === null;
    // corner → goal, going on to the neighbouring corner when the box still hides the goal
    const onward = (p) => clear(p, to) ? dist2d(p, to)
      : Math.min(...corners.filter((q) => q !== p && (q.x === p.x || q.z === p.z) && clear(q, to)).map((q) => dist2d(p, q) + dist2d(q, to)));
    let best = to, bestLen = Infinity;
    for (const p of corners) {
      if (dist2d(from, p) < 0.3 || !clear(from, p)) continue; // (not the corner it stands on)
      const len = dist2d(from, p) + onward(p);
      if (len < bestLen) { bestLen = len; best = new THREE.Vector3(p.x, 0, p.z); }
    }
    return best;
  }

  // Where along a→b (0..1) the segment enters the box grown by r, or null if it misses it.
  function segHitsBox(a, b, c, r) {
    const dx = b.x - a.x, dz = b.z - a.z;
    let t0 = 0, t1 = 1;
    for (const [p, d, lo, hi] of [[a.x, dx, c.minX - r, c.maxX + r], [a.z, dz, c.minZ - r, c.maxZ + r]]) {
      if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) return null; continue; }
      let ta = (lo - p) / d, tb = (hi - p) / d;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) return null;
    }
    return t0;
  }

  // Does the segment a→b cross a wall (expanded by the walker's body radius)? Slab test per AABB.
  // The last 0.7 m are ignored: walkers stop short of their target (pick-up reach), so a target
  // lying right against a wall must not count as "behind" it (that made the hunter pace back
  // and forth between two corners forever).
  function segBlocked(a, b, r = 0.4) {
    let dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len <= 0.7) return false;
    dx *= (len - 0.7) / len; dz *= (len - 0.7) / len;
    for (const w of wallColliders) {
      let t0 = 0, t1 = 1;
      for (const [p, d, lo, hi] of [[a.x, dx, w.minX - r, w.maxX + r], [a.z, dz, w.minZ - r, w.maxZ + r]]) {
        if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) { t0 = 2; break; } continue; }
        let ta = (lo - p) / d, tb = (hi - p) / d;
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
        if (t0 > t1) break;
      }
      if (t0 <= t1) return true;
    }
    return false;
  }

  // ---------- Workers ----------
  // cooker: 'smoker' = this hunter always feeds the smokehouse (else the closest cooker)
  function spawnHelper(kind, at, silent, cooker = null) {
    const def = HELPERS[kind];
    const obj = Models.makePlayer({ parka: def.parka, parkaDark: def.parkaDark, hat: def.hat, axe: kind === 'lumberjack' });
    obj.scale.setScalar(0.85);
    const h = {
      kind, def, obj, pos: at.clone(), facing: Math.PI, walkT: 0, swingT: 1,
      state: 'idle', target: null, c: null, cooker,
    };
    // workers level up with your bag: they carry 30% of it (never less than their base)
    h.c = makeCarrier(obj, () => Math.max(def.cap, Math.round(WORKERS.share * player.c.cap())));
    obj.position.copy(h.pos);
    scene.add(obj);
    helpers.push(h);
    if (!silent) fx.burst(at.clone().setY(1), 0xffd34d, 14, { speed: 4, up: 4, size: 0.14 });
  }

  const CAMP_CENTER = new THREE.Vector3(0.6, 0, 2.75);
  // how often the stuck safety net fired, per walker kind and place (tests: 0 is the goal)
  const rescues = [];
  const countRescue = (e) => rescues.push({ kind: e.kind || 'player', x: +e.pos.x.toFixed(1), z: +e.pos.z.toFixed(1), state: e.state, t: +clock.toFixed(1) });

  // Unstick: if an AI-driven walker barely moves while trying to, sidestep for a moment.
  // Returns the (possibly deflected) unit direction.
  // Detour modes, tried in turn while still stuck: sidestep one way, the other way, then back
  // up (the only way out of a dead-end pocket, e.g. between the grill tray and a tower).
  function steer(ent, dx, dz) {
    if (ent.detourT > 0) {
      let x, z;
      if (ent.detourMode === 2) { x = -dx - dz * 0.3; z = -dz + dx * 0.3; } else {
        const s = ent.detourMode === 0 ? 1 : -1;
        const px = -dz * s, pz = dx * s;
        x = px * 0.85 + dx * 0.15; z = pz * 0.85 + dz * 0.15;
      }
      const l = Math.hypot(x, z) || 1;
      return [x / l, z / l];
    }
    return [dx, dz];
  }

  function trackStuck(ent, beforeX, beforeZ, intended, dt) {
    ent.detourT = Math.max(0, (ent.detourT || 0) - dt);
    ent.rescueT = Math.max(0, (ent.rescueT || 0) - dt);
    const moved = Math.hypot(ent.pos.x - beforeX, ent.pos.z - beforeZ);
    if (intended > 0.001 && moved < intended * 0.3) ent.stuckT = (ent.stuckT || 0) + dt;
    else ent.stuckT = 0;
    // real progress for a second clears the streak of failed detours
    if (moved >= intended * 0.6) { ent.okT = (ent.okT || 0) + dt; if (ent.okT > 1) ent.streak = 0; } else ent.okT = 0;
    if (ent.stuckT > 0.25 && !(ent.detourT > 0)) {
      ent.stuckT = 0;
      ent.detourMode = ((ent.detourMode ?? -1) + 1) % 3;
      ent.detourT = ent.detourMode === 2 ? 0.9 : 0.6;
      // safety net: ~5 s of failed detours → drop the errand and head for the camp center a moment
      ent.streak = (ent.streak || 0) + 1;
      if (ent.streak >= 7) { ent.streak = 0; ent.rescueT = 1.5; ent.giveUp = true; countRescue(ent); }
    }
  }

  // Move toward a point (routing around walls). Returns true when arrived.
  function walkTo(h, dest, dt, arriveDist = 0.35) {
    if (h.rescueT > 0) dest = CAMP_CENTER; // safety net (see trackStuck)
    else if (dist2d(h.pos, dest) < arriveDist) { h.moving = false; return true; }
    const step = h.rescueT > 0 ? dest : routeTarget(h.pos, dest);
    const bx = h.pos.x, bz = h.pos.z;
    let dx = step.x - h.pos.x, dz = step.z - h.pos.z;
    const l = Math.hypot(dx, dz);
    let intended = 0;
    if (l > 0.001) {
      [dx, dz] = steer(h, dx / l, dz / l);
      const speedBonus = 1 + Math.min(WORKERS.maxSpeedBonus, WORKERS.speedPerBagLevel * levels.bag);
      intended = Math.min(l, h.def.speed * speedBonus * dt);
      h.pos.x += dx * intended; h.pos.z += dz * intended;
      h.facing = lerpAngle(h.facing, Math.atan2(dx, dz), Math.min(1, dt * 12));
    }
    resolve(h.pos, 0.38, true);
    trackStuck(h, bx, bz, intended, dt);
    // pacing detector: walking for 4 s without getting 0.8 m away from where it started
    // (back-and-forth between two waypoints) → same safety net as being stuck
    if (!h.anchor) h.anchor = { x: h.pos.x, z: h.pos.z, t: 0 };
    h.anchor.t += dt;
    if (Math.hypot(h.pos.x - h.anchor.x, h.pos.z - h.anchor.z) > 0.8) h.anchor = { x: h.pos.x, z: h.pos.z, t: 0 };
    else if (h.anchor.t > 4 && !(h.rescueT > 0)) { h.rescueT = 1.5; h.giveUp = true; h.anchor.t = 0; countRescue(h); }
    h.moving = true;
    return false;
  }

  function faceTo(h, x, z, dt) {
    h.facing = lerpAngle(h.facing, Math.atan2(x - h.pos.x, z - h.pos.z), Math.min(1, dt * 12));
  }

  const spots = {
    woodpile: () => new THREE.Vector3(woodpile.pos.x, 0, woodpile.pos.z + 1.05),
    grillIn: (k = grill) => new THREE.Vector3(k.pos.x - 1.3, 0, k.pos.z),
    grillOut: (k = grill) => new THREE.Vector3(k.pos.x + trayX(k), 0, k.pos.z + 1.15),
    counter: () => new THREE.Vector3(counter.pos.x, 0, counter.pos.z + 1.1),
  };

  function updateHelper(h, dt) {
    const c = h.c;
    if (h.giveUp) {
      // the safety net fired: forget this errand for a while (tree or meat)
      h.giveUp = false;
      if (h.target) { h.target.claim = null; h.target.skipUntil = clock + 15; h.target = null; }
    }
    c.actT -= dt;
    h.moving = false;

    if (h.kind === 'lumberjack') {
      if (h.state === 'deliver') {
        if (walkTo(h, spots.woodpile(), dt, 0.5)) {
          if (c.actT <= 0) {
            c.actT = 0.08;
            const it = popStack(c, 'log');
            if (it) {
              const top = woodpile.pos.clone().setY(0.5);
              fx.fly(it.mesh, it.worldPos, () => top, { duration: 0.25, arc: 1, onDone: () => addWood(1) });
            } else h.state = 'seek';
          }
        }
      } else {
        let t = h.target;
        if (!t || !t.alive || (t.claim && t.claim !== h)) {
          if (t && t.claim === h) t.claim = null;
          t = h.target = trees.filter((x) => x.alive && !x.claim)
            .sort((a, b) => dist2d(a, woodpile.pos) - dist2d(b, woodpile.pos))[0] || null;
          if (t) t.claim = h;
        }
        if (stackFree(c) <= 0 || (!t && c.stack.length)) {
          if (t) { t.claim = null; h.target = null; }
          h.state = 'deliver';
        } else if (t && walkTo(h, t, dt, 1.25 + TREE.radius * t.s)) {
          faceTo(h, t.x, t.z, dt);
          if (c.actT <= 0) {
            c.actT = h.def.chopRate;
            h.swingT = 0;
            hitTree(t, c);
          }
        }
      }
    }

    if (h.kind === 'carrier') {
      const drop = h.target && drops.includes(h.target) ? h.target : null;
      if (!drop) h.target = null;
      // the hunter only handles meat (raw or toxic); plates, logs and loot are for the player
      const pickable = drops.filter((d) => RAW.includes(d.type) && (!d.claim || d.claim === h) && !(d.skipUntil > clock));
      if (stackFree(c) > 0 && pickable.length && h.state !== 'deliver') {
        if (!h.target) {
          h.target = pickable.sort((a, b) => dist2d(a.pos, h.pos) - dist2d(b.pos, h.pos))[0] || null;
          if (h.target) { h.target.claim = h; h.targetT = 0; }
        }
        // can't reach it (blocked by something)? give up on this piece for a while
        h.targetT = (h.targetT || 0) + dt;
        if (h.target && h.targetT > 6) {
          h.target.claim = null;
          h.target.skipUntil = clock + 15;
          h.target = null;
        }
        // grab anything within arm's reach on the way, not just the target
        for (let i = drops.length - 1; i >= 0 && stackFree(c) > 0; i--) {
          const d = drops[i];
          if (!RAW.includes(d.type) || dist2d(d.pos, h.pos) > 1.1 || (d.claim && d.claim !== h)) continue;
          drops.splice(i, 1);
          scene.remove(d.mesh);
          collectToBack(c, d.type, d.mesh.position.clone(), d.mesh);
          if (d === h.target) h.target = null;
        }
        if (h.target) walkTo(h, h.target.pos, dt, 0.6);
      } else if (rawCount(c) > 0) {
        if (h.target) { h.target.claim = null; h.target = null; } // release the reservation
        h.state = 'deliver';
        // closest cooker (a 2nd hunter in the annex feeds the smokehouse), else sell raw
        const k = h.cooker === 'smoker' && smoker.built ? smoker : nearestCooker(h.pos);
        const dest = k ? spots.grillIn(k) : spots.counter();
        if (walkTo(h, dest, dt, 0.5)) {
          if (k) feedGrill(c, k); else sellFrom(c, dt);
        }
      } else {
        h.state = 'idle';
        // waits in its own area (the annex hunter by the smokehouse)
        if (c.incoming === 0) walkTo(h, h.cooker === 'smoker' ? spots.grillIn(smoker) : IDLE_HUNTER, dt, 0.6);
      }
    }

    // Strict errands: it used to pick the closest cooker with food every frame, so it turned back
    // and forth between the grill and the smokehouse as they kept cooking.
    // 1. COLLECT: one cooker, the smokehouse first (it sells higher), locked until the bag is full
    //    or that cooker is empty. No change of mind on the way.
    // 2. DELIVER: anything in the bag goes straight to the sell table; no cooker until it's empty.
    if (h.kind === 'cashier') {
      if (h.state === 'collect') {
        const k = h.lock;
        if (!k || !k.built) { h.lock = null; h.state = 'idle'; }
        else if (walkTo(h, spots.grillOut(k), dt, 0.5)) {
          if (stackFree(c) > 0 && k.out > 0) takeFromGrill(c, k);
          else if (c.incoming === 0) { h.lock = null; h.state = 'idle'; }
        }
      }
      if (h.state !== 'collect') {
        if (c.stack.length || c.incoming) h.state = 'deliver';
        if (h.state === 'deliver') {
          if (walkTo(h, spots.counter(), dt, 0.5)) {
            sellFrom(c, dt);
            if (c.stack.length === 0 && c.incoming === 0) h.state = 'idle';
          }
        } else {
          h.lock = [smoker, grill].find((k) => k.built && k.out > 0) || null;
          if (h.lock) h.state = 'collect';
          else walkTo(h, spots.counter().add(new THREE.Vector3(-1.4, 0, 0.4)), dt, 0.6);
        }
      }
    }

    // animation
    const ud = h.obj.userData;
    h.walkT += dt * (h.moving ? 12 : 0);
    const sw = h.moving ? Math.sin(h.walkT) : 0;
    ud.legL.rotation.x = sw * 0.6; ud.legR.rotation.x = -sw * 0.6;
    ud.body.position.y = h.moving ? Math.abs(Math.sin(h.walkT)) * 0.07 : 0;
    if (h.swingT < 1) {
      h.swingT = Math.min(1, h.swingT + dt / 0.3);
      const t = h.swingT;
      ud.arm.rotation.x = t >= 1 ? 0 : t < 0.4 ? THREE.MathUtils.lerp(0, 2.3, t / 0.4) : THREE.MathUtils.lerp(2.3, -1.2, Math.min(1, (t - 0.4) / 0.3));
    }
    h.obj.position.copy(h.pos);
    h.obj.rotation.y = h.facing;
  }

  // ---------- Wood pile ----------
  function addWood(n) {
    woodpile.count += n;
    while (woodpile.visuals.length < Math.min(woodpile.count, 24)) {
      const i = woodpile.visuals.length;
      const log = Models.makeLog();
      const row = Math.floor(i / 4), col = i % 4;
      log.position.set(woodpile.pos.x - 0.45 + col * 0.3, 0.33 + row * 0.26, woodpile.pos.z);
      log.rotation.y = Math.PI / 2;
      scene.add(log);
      woodpile.visuals.push(log);
    }
  }

  function takeWood(c) {
    if (woodpile.count <= 0 || stackFree(c) <= 0) return;
    woodpile.count--;
    if (c === player.c) learn('woodpile');
    const from = woodpile.pos.clone().setY(0.6);
    if (woodpile.visuals.length > woodpile.count) {
      const v = woodpile.visuals.pop();
      from.copy(v.position);
      scene.remove(v);
    }
    collectToBack(c, 'log', from);
  }

  // ---------- Cookers: the grill and the smokehouse (k = which one) ----------
  const trayX = (k) => (k.smoker ? 1.3 : 1.2); // side rack where cooked meat waits

  function feedGrill(c, k = grill) {
    if (c.actT > 0) return;
    const type = countOf(c, 'toxic') ? 'toxic' : 'meat'; // (old saves may still carry toxic meat)
    const it = popStack(c, type);
    if (!it) return;
    c.actT = 0.08;
    if (c === player.c) learn(type === 'toxic' ? 'toxic' : k.smoker ? 'smoker' : 'grill');
    const top = k.pos.clone().setY(0.8);
    fx.fly(it.mesh, it.worldPos, () => top, { duration: 0.25, arc: 1, onDone: () => { k.queue++; k.queueTypes.push(type); } });
  }

  function takeFromGrill(c, k = grill) {
    if (c.actT > 0 || k.out <= 0 || stackFree(c) <= 0) return;
    c.actT = 0.08;
    k.out--;
    const type = k.outTypes.pop() || 'steak';
    if (c === player.c) learn('grillTake');
    const from = k.pos.clone().add(new THREE.Vector3(trayX(k), 0.7, 0));
    if (k.visuals.length > k.out) {
      const v = k.visuals.pop();
      from.copy(v.position);
      scene.remove(v);
    }
    collectToBack(c, type, from);
  }

  function updateGrill(dt, k = grill) {
    const fl = k.obj.userData.flames;
    const busy = k.queue > 0;
    if (!k.smoker) {
      fl[0].scale.y = (busy ? 0.75 : 0.45) + Math.sin(clock * 15) * 0.08;
      fl[1].scale.y = (busy ? 0.45 : 0.3) + Math.sin(clock * 19) * 0.05;
    }
    k.obj.userData.light.intensity = (busy ? 5 : 2.5) + Math.sin(clock * 11) * 0.6;
    if (!busy) { k.cookT = 0; return; }
    k.cookT += dt;
    k.smokeT -= dt;
    if (k.smokeT <= 0) {
      k.smokeT = 0.18;
      sfx.play('sizzle', { at: k.pos, vol: 0.8 });
      const puff = k.smoker ? k.pos.clone().add(k.obj.userData.chimney) : k.pos.clone().setY(1);
      fx.burst(puff, 0xdfe6ec, 1, { speed: 0.4, up: 3.5, size: 0.2, life: 0.9 });
    }
    if (k.cookT >= k.cookTime) {
      k.cookT = 0;
      k.queue--;
      const raw = k.queueTypes.shift();
      const cooked = k.smoker ? 'smoked' : raw === 'toxic' ? 'spicy' : 'steak';
      k.out++;
      k.outTypes.push(cooked);
      stats.cooked++;
      if (k.visuals.length < 12) {
        const i = k.visuals.length;
        const s = makeItem(cooked);
        s.position.set(k.pos.x + trayX(k) + ((i % 2) - 0.5) * 0.4, 0.72 + Math.floor(i / 2) * 0.12, k.pos.z + (Math.floor(i / 2) % 3 - 1) * 0.02);
        s.rotation.y = Math.PI / 2;
        scene.add(s);
        k.visuals.push(s);
      }
      fx.burst(k.pos.clone().add(new THREE.Vector3(trayX(k), 0.9, 0)), 0xffc36b, 5, { speed: 2, up: 3, size: 0.08 });
    }
  }

  // ---------- Selling ----------
  // Wood still needed right now: open build squares, wall repairs and ballista / poison bolt squares.
  // (the sell table only buys wood beyond that, so it never eats your repair wood)
  const logsNeeded = () =>
    zones.reduce((n, z) => n + (z.state === 'open' && z.currency === 'log' ? z.total - z.paid : 0), 0) +
    walls.reduce((n, w) => n + Math.ceil((wallMax() - w.hp) / repairPerLog()), 0) +
    upgradeLogsNeeded();
  // ballista / poison bolt wood only counts once you hold the heartwood / vial (or already paid it in)
  function upgradeLogsNeeded() {
    let n = countOf(player.c, 'heartwood') * BALLISTA.cost.logs + countOf(player.c, 'vial') * BALLISTA.poisonCost.logs;
    for (const t of towers) {
      const cost = t.up && upgradeFor(t)?.cost;
      if (cost && (t.up.paid.heartwood || t.up.paid.vial)) n += Math.max(0, cost.logs - (t.up.paid.logs || 0));
    }
    return n;
  }

  // Selling speeds up with the bag level (faster ticks, then 2-3 items per tick).
  function sellFrom(c, dt) {
    c.sellT -= dt;
    if (c.sellT > 0) return;
    c.sellT = ECONOMY.sellTick / PLAYER.sellSpeed(levels.bag);
    for (let n = PLAYER.sellBatch(levels.bag); n > 0; n--) sellOne(c);
  }

  function sellOne(c) {
    // most valuable first; raw toxic meat only when there's no grill to cook it (it sells for $0);
    // then any wood nothing can use anymore, so the bag never gets stuck full
    let type = ['spicy', 'smoked', 'steak', 'meat'].find((t) => countOf(c, t)) || null;
    if (!type && countOf(c, 'toxic') && !grill.built) type = 'toxic';
    if (!type && c.isPlayer && player.stillT > 0.5 && countOf(c, 'log') > logsNeeded()) type = 'log';
    if (!type) return;
    const it = popStack(c, type);
    if (!it) return;
    const price = PRICE[type];
    if (c.isPlayer && type !== 'toxic') learn(type === 'log' ? 'spareWood' : 'sell');
    const top = counter.pos.clone().setY(1.1);
    fx.fly(it.mesh, it.worldPos, () => top, {
      duration: 0.25, arc: 1,
      onDone: () => {
        stats.sold++;
        if (price > 0) { addToPile(price); sfx.play('sell', { at: counter.pos }); }
        else { fx.text(top.clone().setY(2), '$0 yuck!', 'hurt', { life: 0.8, rise: 40 }); sfx.play('full', { at: counter.pos }); }
      },
    });
  }

  // Each bill on the pile carries its own value (meat $5, steak $12, wood $1).
  function addToPile(value) {
    counter.pileValue += value;
    if (counter.pile.length >= 40) { counter.pile[counter.pile.length - 1].value += value; return; } // visual cap
    const i = counter.pile.length;
    const mesh = Models.makeCash();
    mesh.position.set(counter.pos.x + 1.5 + (i % 2) * 0.55 - 0.27, 0.16 + Math.floor(i / 2) * 0.08, counter.pos.z + 0.3);
    scene.add(mesh);
    counter.pile.push({ mesh, value });
    fx.burst(mesh.position.clone(), 0x7cff6b, 3, { speed: 1.5, up: 2, size: 0.07 });
  }

  function updateCounter(dt) {
    const P = player;
    if (!P.dead && dist2d(P.pos, counter.pos) < 2.1) sellFrom(P.c, dt);
    // cash pile next to the table; walk over it to collect
    const pilePos = tmpB.set(counter.pos.x + 1.5, 0, counter.pos.z + 0.3);
    counter.collectT -= dt;
    if (!P.dead && counter.pile.length && dist2d(P.pos, pilePos) < 1.4 && counter.collectT <= 0) {
      counter.collectT = 0.035;
      const bill = counter.pile.pop();
      const value = bill.value;
      counter.pileValue -= value;
      const from = bill.mesh.position.clone();
      scene.remove(bill.mesh);
      fx.fly(bill.mesh, from, () => player.pos.clone().setY(1.3), {
        duration: 0.22, arc: 0.8,
        onDone: () => { setCash(cash + value); hud.bumpCash(); learn('cash'); sfx.play('coin'); fx.text(player.pos.clone().setY(2.4), `+$${value}`, 'cash', { life: 0.6, rise: 40 }); },
      });
    }
  }

  // ---------- Bears ----------
  const bears = [];
  const drops = [];

  const clouds = [];      // poison bear death clouds
  const thrown = [];      // logs in flight from log throwers

  // kind: 'normal' or a BOSSES key. hpMult scales late waves.
  // n = the wave it belongs to (normal bears bite harder in later waves)
  function spawnBear(kind, hpMult = 1, n = waves.n) {
    const boss = kind !== 'normal';
    const def = boss ? BOSSES[kind] : BEAR;
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4; // mostly from the north
    const obj = Models.makeBear(kind);
    obj.scale.setScalar(def.scale);
    const pos = new THREE.Vector3(Math.cos(a) * WAVES.spawnRadius, 0, Math.sin(a) * WAVES.spawnRadius);
    obj.position.copy(pos);
    const bar = Models.makeHealthBar(boss ? 1.6 : 1, 0xff4d4d);
    bar.visible = false;
    scene.add(obj, bar);
    let armorBar = null;
    if (def.armor) { armorBar = Models.makeHealthBar(1.6, 0xb8c7d6); scene.add(armorBar); }
    const maxHp = Math.round(def.hp * hpMult);
    const maxArmor = def.armor ? Math.round(def.armor * hpMult) : 0;
    bears.push({
      obj, pos, def, kind, boss, hp: maxHp, maxHp, armor: maxArmor, maxArmor, armorBar, hpMult,
      bite: boss ? def.damage : Math.round(BEAR.damage(Math.max(1, n)) * 10) / 10,
      attackT: def.attackRate, throwT: def.firstThrow ?? def.throwEvery ?? 0, bubbleT: 0,
      bar, flash: 0, lunge: 0, walkT: Math.random() * 6, dying: 0, vel: V(),
    });
  }

  // `from` is the player's position for axe hits, null for tower shots.
  // `pierce` = heavy ballista bolt: cracks armor instead of bouncing off.
  function hurtBear(b, dmg, from, pierce = false) {
    if (b.dying) return;
    const at = b.pos.clone().setY(1 * b.def.scale);
    b.bar.visible = true;
    if (b.armor > 0) {
      if (!from && !pierce) {
        // arrows bounce off the plates
        fx.burst(at.clone().setY(1.2 * b.def.scale), 0xfff3a0, 4, { speed: 3, up: 2, size: 0.06 });
        if (Math.random() < 0.35) fx.text(at.clone().setY(2 * b.def.scale), 'tink', 'warn', { life: 0.5, rise: 30 });
        sfx.play('tink', { at: b.pos });
        return;
      }
      // the axe (or a ballista bolt) breaks the armor first
      b.armor = Math.max(0, b.armor - (from ? dmg : BALLISTA.armorDamage * towerMult()));
      b.flash = 0.1;
      fx.burst(at.clone().setY(1.3 * b.def.scale), 0xc9d3dc, 6, { speed: 4, up: 3, size: 0.1 });
      const left = Math.ceil(b.armor / (b.maxArmor / b.def.plates));
      const plates = b.obj.userData.plates;
      sfx.play(plates.length > left ? 'clang' : 'block', { at: b.pos });
      while (plates.length > left) {
        const p = plates.pop();
        const wp = p.getWorldPosition(V());
        p.parent.remove(p);
        const fall = b.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 0.1, (Math.random() - 0.5) * 3));
        fx.fly(p, wp, () => fall, { duration: 0.5, arc: 2, onDone: () => {} });
        fx.text(at.clone().setY(2.3 * b.def.scale), b.armor > 0 ? 'CRACK!' : 'ARMOR BROKEN!', 'warn', { life: 1, rise: 60 });
        fx.addShake(0.15);
      }
      if (b.armorBar) Models.setHealth(b.armorBar, b.armor / b.maxArmor);
      return;
    }
    b.hp -= dmg;
    b.flash = 0.12;
    Models.setHealth(b.bar, b.hp / b.maxHp);
    if (from) sfx.play('hit', { at: b.pos });
    fx.burst(at, 0xffffff, 5, { speed: 3, up: 3 });
    fx.burst(at, 0xe04848, 3, { speed: 3, up: 3, size: 0.09 });
    fx.text(at.clone().setY(1.8 * b.def.scale), String(dmg), 'hurt', { life: 0.6, rise: 40 });
    if (from) {
      tmpA.subVectors(b.pos, from).setY(0).normalize().multiplyScalar(b.boss ? 0.15 : 0.45);
      b.pos.add(tmpA);
    }
    if (b.hp <= 0) {
      killBear(b);
      if (from) learn('fight'); // `from` is set only for the player's axe (towers pass null)
    }
  }

  // Throw an item out of `from` onto the ground as a pickup (`value` for loot bags).
  function dropItem(type, from, spread = 2.2, value = 0) {
    const mesh = makeItem(type);
    const land = from.clone().add(new THREE.Vector3((Math.random() - 0.5) * spread, 0.2, (Math.random() - 0.5) * spread));
    land.y = 0.2;
    // never inside or hugging a wall, a building or a tree trunk: leave room to walk up to it
    resolve(land, 0.8, true);
    fx.fly(mesh, from.clone().setY(0.8), () => land, {
      duration: 0.45, arc: 1.6,
      onDone: (m) => { m.position.copy(land); scene.add(m); drops.push({ mesh: m, type, value, pos: land, t: Math.random() * 6, claim: null }); },
    });
  }

  function killBear(b) {
    b.dying = 0.001;
    b.bar.visible = false;
    if (b.armorBar) b.armorBar.visible = false;
    fx.burst(b.pos.clone().setY(0.8), 0xffffff, b.boss ? 30 : 14, { speed: 5, up: 5, size: 0.2 });
    fx.addShake(b.boss ? 0.5 : 0.12);
    if (b.boss) {
      fx.text(b.pos.clone().setY(3), `${b.def.name} DOWN!`, 'warn', { life: 1.5, rise: 90 });
      // shockwave: every bear on the map is stunned for a few seconds (time to heal and clean up)
      const ring = b.pos.clone().setY(0.4);
      fx.burst(ring, 0xfff3a0, 28, { speed: 12, up: 0.5, size: 0.22, life: 0.6 });
      for (const o of bears) if (o !== b && !o.dying) o.stunT = WAVES.bossStun;
      if (bears.some((o) => o.stunT > 0 && !o.dying)) fx.text(b.pos.clone().setY(5.2), 'SHOCKWAVE: STUNNED!', 'warn', { life: 1.6, rise: 70 });
    }
    sfx.play(b.boss ? 'bossDown' : 'bearDown', { at: b.pos });
    events.push({ type: 'kill', kind: b.kind, t: clock });
    stats.kills++;
    for (let i = 0; i < (b.def.meat || 0); i++) dropItem('meat', b.pos);
    for (let i = 0; i < (b.def.toxic || 0); i++) dropItem('toxic', b.pos);
    for (let i = 0; i < (b.def.plateDrops || 0); i++) dropItem('plate', b.pos, 1.6);
    for (let i = 0; i < (b.def.heartwood || 0); i++) dropItem('heartwood', b.pos, 1.2);
    for (let i = 0; i < (b.def.vial || 0); i++) dropItem('vial', b.pos, 1.2);
    if (b.def.cash) dropItem('loot', b.pos, 1, b.def.cash);
    if (b.kind === 'poison') {
      // swells, then bursts into a poison cloud: step back!
      const mesh = Models.makeCloud();
      mesh.position.copy(b.pos).setY(0.8);
      mesh.scale.setScalar(0.5);
      scene.add(mesh);
      clouds.push({ mesh, pos: b.pos.clone(), t: 0, burst: false });
      fx.text(b.pos.clone().setY(3.5), 'STEP BACK!', 'hurt', { life: 1, rise: 50 });
    }
  }

  function updateBears(dt) {
    const P = player;
    for (let i = bears.length - 1; i >= 0; i--) {
      const b = bears[i];
      const ud = b.obj.userData;
      if (b.dying) {
        b.dying += dt;
        const k = Math.min(1, b.dying / 0.3);
        b.obj.scale.setScalar(b.def.scale * (1 - k));
        b.obj.rotation.z = k * 1.2;
        if (k >= 1) { scene.remove(b.obj, b.bar); if (b.armorBar) scene.remove(b.armorBar); bears.splice(i, 1); }
        continue;
      }
      const toP = tmpA.subVectors(P.pos, b.pos).setY(0);
      const dist = toP.length();
      const reach = b.def.radius + PLAYER.radius + 0.35;
      let moving = false;
      let faceX = P.pos.x, faceZ = P.pos.z;
      // stunned by a boss's shockwave: stands still, dizzy (stars), no bite
      const stunned = b.stunT > 0;
      if (stunned) {
        b.stunT -= dt;
        b.starT = (b.starT || 0) - dt;
        if (b.starT <= 0) { b.starT = 0.3; fx.burst(b.pos.clone().setY(2 * b.def.scale), 0xfff3a0, 2, { speed: 1.2, up: 1, size: 0.1, life: 0.5 }); }
      }
      // Log thrower: lobs logs from range at the closest target (a standing wall or you);
      // it only comes to bite when you're right next to it.
      const aim = b.kind === 'thrower' && !stunned && !P.dead && dist > reach + 0.3 ? throwerAim(b) : null;
      if (aim) {
        const dA = dist2d(b.pos, aim.point);
        faceX = aim.point.x; faceZ = aim.point.z;
        if (dA > b.def.range) {
          b.vel.set(aim.point.x - b.pos.x, 0, aim.point.z - b.pos.z).normalize().multiplyScalar(b.def.speed);
          moving = true;
        } else {
          b.vel.set(0, 0, 0);
          b.throwT -= dt;
          if (b.throwT <= 0) { b.throwT = b.def.throwEvery; b.lunge = 1; throwLog(b, aim); }
        }
      } else if (!stunned && !P.dead && dist > reach) {
        toP.normalize();
        b.vel.copy(toP).multiplyScalar(b.def.speed);
        moving = true;
      } else b.vel.set(0, 0, 0);
      if (b.kind === 'poison') {
        b.bubbleT -= dt;
        if (b.bubbleT <= 0) { b.bubbleT = 0.25; fx.burst(b.pos.clone().setY(1.2 * b.def.scale), 0x9be36b, 1, { speed: 0.5, up: 2.5, size: 0.14, life: 0.7 }); }
      }
      // hit by a poison bolt: loses hp every second, armor or not
      if (b.poisonT > 0) {
        b.poisonT -= dt;
        b.poisonAcc = (b.poisonAcc || 0) + dt;
        if (b.poisonAcc >= 1) {
          b.poisonAcc -= 1;
          const tick = Math.round(BALLISTA.poisonDps * towerMult() * 10) / 10;
          b.hp -= tick;
          b.bar.visible = true;
          Models.setHealth(b.bar, b.hp / b.maxHp);
          fx.burst(b.pos.clone().setY(1.2 * b.def.scale), 0x8fe05a, 4, { speed: 1.5, up: 2.5, size: 0.1 });
          fx.text(b.pos.clone().setY(2 * b.def.scale), String(tick), 'cash', { life: 0.5, rise: 30 });
          if (b.hp <= 0) { killBear(b); continue; }
        }
      }
      // separation from other bears
      for (const o of bears) {
        if (o === b || o.dying) continue;
        const dx = b.pos.x - o.pos.x, dz = b.pos.z - o.pos.z;
        const min = b.def.radius + o.def.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min && d2 > 1e-6) {
          const d = Math.sqrt(d2), push = (min - d) * 0.5;
          b.pos.x += (dx / d) * push; b.pos.z += (dz / d) * push;
        }
      }
      b.pos.addScaledVector(b.vel, dt);
      resolve(b.pos, b.def.radius, false);
      if (Math.hypot(faceX - b.pos.x, faceZ - b.pos.z) > 0.01) b.obj.rotation.y = lerpAngle(b.obj.rotation.y, Math.atan2(faceX - b.pos.x, faceZ - b.pos.z), Math.min(1, dt * 8));

      // Blocked by a wall on the way to you? It chews on it (small damage, bosses hit harder):
      // fences wear down and cost wood to keep up.
      if (!P.dead && dist > reach + 0.1 && moving) {
        // walls, or a ballista standing in the way
        const touching = (c) => {
          const x = THREE.MathUtils.clamp(b.pos.x, c.minX, c.maxX), z = THREE.MathUtils.clamp(b.pos.z, c.minZ, c.maxZ);
          return Math.hypot(b.pos.x - x, b.pos.z - z) < b.def.radius + 0.12;
        };
        const chew = wallColliders.find(touching) || towers.find((t) => t.ballista && touching(t.box))?.box;
        if (chew) {
          b.wallT = (b.wallT ?? b.def.attackRate) - dt;
          if (b.wallT <= 0) {
            b.wallT = b.def.attackRate * 1.4;
            b.lunge = 1;
            // chews as hard as it is tough (the same wave scaling as its hp)
            const bite = Math.round((b.def.wallHit || 1) * b.hpMult * 10) / 10;
            if (chew.wall) damageWall(chew.wall, bite);
            else damageTower(chew.tower, bite);
          }
        }
      }

      if (!stunned && !P.dead && dist <= reach + 0.1) {
        b.attackT -= dt;
        if (b.attackT <= 0) {
          b.attackT = b.def.attackRate;
          b.lunge = 1;
          hurtPlayer(b.bite);
          if (b.kind === 'poison') poisonPlayer(POISON.bite);
        }
      } else b.attackT = Math.min(b.attackT, b.def.attackRate * 0.5);

      b.walkT += dt * (moving ? 10 : 0);
      ud.legs.forEach((l, j) => { l.rotation.x = moving ? Math.sin(b.walkT + (j % 2 ? Math.PI : 0) + (j > 1 ? Math.PI / 2 : 0)) * 0.5 : 0; });
      ud.body.position.y = moving ? Math.abs(Math.sin(b.walkT)) * 0.06 : 0;
      b.lunge = Math.max(0, b.lunge - dt * 4);
      ud.head.position.z = 0.75 + Math.sin(b.lunge * Math.PI) * 0.35;
      b.flash = Math.max(0, b.flash - dt);
      b.obj.scale.setScalar(b.def.scale * (1 + b.flash * 1.2));
      b.obj.position.copy(b.pos);
      b.bar.position.set(b.pos.x, 2 * b.def.scale, b.pos.z);
      b.bar.quaternion.copy(camera.quaternion);
      if (b.armorBar) {
        b.armorBar.visible = b.armor > 0 && b.bar.visible;
        b.armorBar.position.set(b.pos.x, 2 * b.def.scale + 0.18, b.pos.z);
        b.armorBar.quaternion.copy(camera.quaternion);
      }
      const held = b.obj.userData.heldLog;
      if (held) {
        // the log leaves its paws when thrown, comes back, and is raised overhead right before the next throw
        held.visible = b.throwT < b.def.throwEvery - 0.5;
        const windup = Math.max(0, 1 - b.throwT / 0.7);
        held.position.y = 1.15 + windup * 0.9;
        held.position.z = 0.65 - windup * 0.5;
      }
    }
    updateThrown(dt);
    updateClouds(dt);
  }

  // Closest target: you, or the closest point of a standing wall.
  function throwerAim(b) {
    let best = { point: player.pos.clone(), wall: null }, bestD = dist2d(b.pos, player.pos);
    for (const w of walls) {
      if (w.broken) continue;
      for (const c of w.colliders) {
        const x = THREE.MathUtils.clamp(b.pos.x, c.minX, c.maxX);
        const z = THREE.MathUtils.clamp(b.pos.z, c.minZ, c.maxZ);
        const d = Math.hypot(b.pos.x - x, b.pos.z - z);
        if (d < bestD) { bestD = d; best = { point: new THREE.Vector3(x, 0, z), wall: w }; }
      }
    }
    // ballistas are targets too (plain arrow towers aren't worth a log)
    for (const t of towers) {
      if (!t.ballista) continue;
      const d = Math.hypot(b.pos.x - t.x, b.pos.z - t.z);
      if (d < bestD) { bestD = d; best = { point: new THREE.Vector3(t.x, 0, t.z), wall: null, tower: t }; }
    }
    return best;
  }

  function throwLog(b, aim) {
    const mesh = Models.makeLog();
    mesh.scale.setScalar(1.3);
    const from = b.pos.clone().setY(1.6 * b.def.scale);
    // aim at where the player is now (they can dodge), or at the wall
    const to = aim.point.clone().setY(0.6);
    mesh.position.copy(from);
    scene.add(mesh);
    thrown.push({ mesh, from, to, t: 0, dur: 1.1, wall: aim.wall, tower: aim.tower, dmg: Math.round(b.def.wallDamage * b.hpMult), hit: b.def.hitDamage });
    sfx.play('whoosh', { at: b.pos });
  }

  function updateThrown(dt) {
    for (let i = thrown.length - 1; i >= 0; i--) {
      const l = thrown[i];
      l.t += dt / l.dur;
      const k = Math.min(1, l.t);
      l.mesh.position.lerpVectors(l.from, l.to, k);
      l.mesh.position.y += Math.sin(k * Math.PI) * 4;
      l.mesh.rotation.x += dt * 10;
      if (k < 1) continue;
      scene.remove(l.mesh);
      thrown.splice(i, 1);
      fx.burst(l.to.clone(), 0xb57a3f, 8, { speed: 4, up: 3, size: 0.12 });
      if (l.wall && !l.wall.broken) damageWall(l.wall, l.dmg);
      else if (l.tower && l.tower.ballista) damageTower(l.tower, l.dmg);
      else if (!player.dead && dist2d(player.pos, l.to) < 1.3) hurtPlayer(l.hit);
      // half the logs stay on the ground: free wood for repairs
      if (Math.random() < 0.5) dropItem('log', l.to, 1.2);
    }
  }

  function updateClouds(dt) {
    for (let i = clouds.length - 1; i >= 0; i--) {
      const c = clouds[i];
      c.t += dt;
      if (!c.burst) {
        // warning: swells and pulses before bursting
        const k = c.t / POISON.cloudDelay;
        c.mesh.scale.setScalar(0.5 + k * 1.2 + Math.sin(c.t * 30) * 0.08);
        if (c.t >= POISON.cloudDelay) {
          c.burst = true;
          fx.burst(c.pos.clone().setY(0.8), 0x8fe05a, 26, { speed: 6, up: 3, size: 0.25, life: 0.8 });
          fx.addShake(0.25);
          sfx.play('burst', { at: c.pos });
          if (!player.dead && dist2d(player.pos, c.pos) < POISON.cloudRadius) poisonPlayer(POISON.cloud);
        }
      } else {
        const k = (c.t - POISON.cloudDelay) / 1;
        c.mesh.scale.setScalar(POISON.cloudRadius * (0.7 + k * 0.3));
        c.mesh.material.opacity = 0.35 * (1 - k);
        if (k >= 1) { scene.remove(c.mesh); clouds.splice(i, 1); }
      }
    }
  }

  // Poison: short damage over time that ignores armor; the campfire cures it.
  function poisonPlayer(seconds) {
    const P = player;
    if (P.dead) return;
    if (P.poisonT <= 0) {
      P.poisonTick = 0;
      fx.text(P.pos.clone().setY(2.8), '☠ POISONED', 'hurt', { life: 1, rise: 50 });
      sfx.play('poison');
    }
    P.poisonT = Math.max(P.poisonT, seconds); // refreshes, never stacks
  }

  const CAMPFIRE = new THREE.Vector3(0, 0, -1);
  // The campfire heals 5 hp/s and cures poison. Once it has healed you back to full, it goes
  // pale (see-through flames) and recharges for 5 s: no heal, no cure until it's lit again.
  let fireCd = 0, fireUsed = false;
  const fireActive = () => fireCd <= 0;

  function updatePoisonAndCampfire(dt) {
    const P = player;
    const wasActive = fireActive();
    fireCd = Math.max(0, fireCd - dt);
    if (!wasActive && fireActive()) sfx.play('cure', { at: CAMPFIRE, vol: 0.5 });
    for (const f of campfire.userData.flames) f.material.opacity = fireActive() ? 1 : 0.22;
    if (P.dead) return;
    const warm = dist2d(P.pos, CAMPFIRE) < POISON.campfireRadius;
    if (!warm) fireUsed = false;
    if (P.poisonT > 0) {
      if (warm && fireActive()) {
        P.poisonT = 0;
        fireUsed = true;
        fx.text(P.pos.clone().setY(2.6), 'CURED!', 'cash', { life: 1, rise: 50 });
        sfx.play('cure');
        fx.burst(P.pos.clone().setY(1), 0xffc36b, 10, { speed: 2, up: 3, size: 0.1 });
        learn('campfire');
      } else {
        P.poisonT -= dt;
        P.poisonTick += dt;
        if (P.poisonTick >= 1) { P.poisonTick -= 1; hurtPlayer(POISON.dps, true); }
      }
    }
    // warming up at the fire heals fast...
    if (warm && fireActive() && P.hp < PLAYER.maxHp) {
      P.hp = Math.min(PLAYER.maxHp, P.hp + POISON.campfireHeal * dt);
      fireUsed = true;
    }
    // ...then it needs to recharge once you're back to full
    if (warm && fireActive() && fireUsed && P.hp >= PLAYER.maxHp && P.poisonT <= 0) {
      fireUsed = false;
      fireCd = POISON.campfireRecharge;
      fx.text(CAMPFIRE.clone().setY(2), 'RECHARGING…', 'warn', { life: 1.2, rise: 40 });
    }
    hud.setPoison(P.poisonT > 0);
  }

  // Armor soaks up hits first (poison ticks pass `ignoreArmor`).
  function hurtPlayer(dmg, ignoreArmor = false) {
    const P = player;
    P.sinceHurt = 0;
    if (!ignoreArmor && P.armor > 0) {
      const soaked = Math.min(P.armor, dmg);
      P.armor -= soaked;
      dmg -= soaked;
      fx.burst(P.pos.clone().setY(1.2), 0x9fd0ff, 5, { speed: 3, up: 3, size: 0.09 });
      sfx.play('block');
      if (dmg <= 0) { fx.text(P.pos.clone().setY(2.2), `-${Math.round(soaked * 10) / 10} 🛡️`, 'warn', { life: 0.6, rise: 40 }); return; }
    }
    sfx.play(ignoreArmor ? 'poison' : 'hurt');
    P.hp -= dmg;
    fx.addShake(ignoreArmor ? 0.06 : 0.2);
    fx.text(P.pos.clone().setY(2.2), `-${Math.round(dmg * 10) / 10}`, 'hurt', { life: 0.6, rise: 40 });
    fx.burst(P.pos.clone().setY(1), ignoreArmor ? 0x8fe05a : 0xe04848, 5, { speed: 3, up: 3, size: 0.09 });
    hud.flashHurt();
    if (P.hp <= 0) {
      P.hp = 0;
      P.dead = true;
      P.obj.rotation.z = Math.PI / 2;
      events.push({ type: 'defeat', wave: waves.n, t: clock });
      sfx.play('defeat');
      hud.defeat(true);
    }
  }

  // ---------- Ballista upgrade (heartwood from the log thrower + cash) ----------
  // Once you've picked up your first heartwood, a gold square rings every arrow tower:
  // stand next to the tower to pay, and it turns into a ballista.
  // Two upgrades, each a gold square around the tower, paid in several resources:
  //  - BALLISTA (arrow tower → ballista): heartwood + logs + cash, once you've found heartwood
  //  - POISON BOLTS (ballista → poison ballista): poison vial + logs + cash, once you've found a vial
  const ITEM_ICON = { heartwood: '🌟', vial: '🧪', logs: '🪵', cash: '💵' };
  const SPECIALS = ['heartwood', 'vial', 'plate']; // rare boss items, saved wherever they are
  const pendingUps = {}; // tower upgrade payments restored from the save
  const upgradeFor = (t) => {
    if (!t.ballista && built.has('firstHeartwood')) return { kind: 'ballista', name: 'BALLISTA', cost: BALLISTA.cost };
    if (t.ballista && !t.poison && built.has('firstVial')) return { kind: 'poison', name: 'POISON BOLTS', cost: BALLISTA.poisonCost };
    return null;
  };

  function clearUp(t) {
    if (!t.up) return;
    scene.remove(t.up.pad); t.up.label.remove(); t.up = null;
  }

  function updateBallistaUpgrades(dt) {
    for (const t of towers) {
      const want = upgradeFor(t);
      if (!want) { clearUp(t); continue; }
      if (t.up && t.up.kind !== want.kind) clearUp(t);
      if (!t.up) {
        const pad = Models.makePad(want.kind === 'poison' ? 0x8fe05a : 0xffc84a);
        pad.scale.setScalar(1.2);
        pad.position.set(t.x, 0, t.z);
        scene.add(pad);
        // restore what was already paid into this square before the game was closed
        const saved = pendingUps[t.id]?.kind === want.kind ? pendingUps[t.id].paid : {};
        delete pendingUps[t.id];
        t.up = { kind: want.kind, pad, label: makeLabel(), paid: { ...saved }, payT: 0 };
      }
      const u = t.up, cost = want.cost;
      const left = (k) => cost[k] - (u.paid[k] || 0);
      const keys = Object.keys(cost);
      u.label.innerHTML = `<div><span class="name">${want.name}</span>${keys.map((k) => `${ITEM_ICON[k]} ${left(k)}`).join(' · ')}</div>`;
      Models.setPadProgress(u.pad, keys.reduce((s, k) => s + (u.paid[k] || 0) / cost[k], 0) / keys.length);
      const s = fx.toScreen(new THREE.Vector3(t.x, 0.2, t.z + 0.9));
      u.label.style.left = s.x + 'px'; u.label.style.top = s.y + 'px';
      u.payT -= dt;
      if (player.dead || dist2d(player.pos, t) > 1.4 || u.payT > 0) continue;
      u.payT = ECONOMY.payTick;
      const target = new THREE.Vector3(t.x, 1.6, t.z);
      // special item first, then logs, then cash
      for (const k of keys) {
        if (left(k) <= 0) continue;
        if (k === 'cash') {
          if (cash <= 0) continue;
          const chunk = Math.min(cash, left(k), Math.ceil(cost.cash / 20));
          u.paid.cash = (u.paid.cash || 0) + chunk;
          setCash(cash - chunk);
          fx.fly(Models.makeCash(), player.pos.clone().setY(1.2), () => target, { duration: 0.28, arc: 1.4 });
        } else {
          const it = popStack(player.c, k === 'logs' ? 'log' : k);
          if (!it) continue;
          u.paid[k] = (u.paid[k] || 0) + 1;
          fx.fly(it.mesh, it.worldPos, () => target, { duration: 0.3, arc: 1.5 });
        }
        sfx.play('place');
        break;
      }
      if (keys.every((k) => left(k) <= 0)) {
        clearUp(t);
        if (want.kind === 'ballista') toBallista(t); else toPoisonBallista(t);
      }
    }
  }

  function toBallista(t, silent = false) {
    clearUp(t);
    scene.remove(t.obj);
    t.obj = Models.makeBallista();
    t.obj.position.set(t.x, 0.12, t.z);
    scene.add(t.obj);
    Object.assign(t, { ballista: true, range: BALLISTA.range, fireRate: BALLISTA.fireRate, damage: BALLISTA.damage, hp: ballistaMax() });
    if (!t.bar) { t.bar = Models.makeHealthBar(1.4, 0xffc84a); t.bar.visible = false; scene.add(t.bar); }
    if (silent) return;
    t.obj.scale.setScalar(0.01);
    popIns.push({ obj: t.obj, t: 0 });
    const at = new THREE.Vector3(t.x, 2, t.z);
    fx.burst(at, 0xffc84a, 24, { speed: 5, up: 5, size: 0.18 });
    fx.text(at.clone().setY(4), 'BALLISTA!', 'warn', { life: 1.4, rise: 80 });
    fx.addShake(0.3);
    sfx.play('build'); sfx.play('levelup');
    events.push({ type: 'ballista', id: t.id, t: clock });
    learn('ballista');
    save();
  }

  // Poison bolts: a green vial on the platform, bolts poison what they hit.
  function toPoisonBallista(t, silent = false) {
    t.poison = true;
    const vial = Models.makeVial();
    vial.position.set(0, 2.7, -0.4);
    vial.scale.setScalar(1.4);
    t.obj.add(vial);
    if (silent) return;
    const at = new THREE.Vector3(t.x, 2.5, t.z);
    fx.burst(at, 0x8fe05a, 24, { speed: 5, up: 5, size: 0.18 });
    fx.text(at.clone().setY(4), 'POISON BOLTS!', 'warn', { life: 1.4, rise: 80 });
    sfx.play('levelup'); sfx.play('poison');
    events.push({ type: 'poisonBallista', id: t.id, t: clock });
    learn('poisonBolts');
    save();
  }

  // Ballistas can be destroyed (thrown logs, bosses and bears chewing on them).
  function damageTower(t, dmg) {
    if (!t.ballista) return; // plain arrow towers are sturdy
    t.hp -= dmg;
    t.bar.visible = true;
    Models.setHealth(t.bar, t.hp / ballistaMax());
    sfx.play('crack', { at: t, vol: 0.7 });
    fx.burst(new THREE.Vector3(t.x, 2, t.z), 0xb57a3f, 5, { speed: 3, up: 3, size: 0.12 });
    if (t.hp <= 0) destroyBallista(t);
  }

  // Falls back to an arrow tower and drops its heartwood (and vial) to rebuild it with wood + cash.
  function destroyBallista(t) {
    const at = new THREE.Vector3(t.x, 1, t.z);
    const wasPoison = t.poison;
    scene.remove(t.obj);
    t.obj = Models.makeTower();
    t.obj.position.set(t.x, 0.12, t.z);
    scene.add(t.obj);
    Object.assign(t, { ballista: false, poison: false, range: TOWER.range, fireRate: TOWER.fireRate, damage: 1, hp: 0 });
    if (t.bar) t.bar.visible = false;
    fx.burst(at, 0xd09a5e, 30, { speed: 6, up: 5, size: 0.2 });
    fx.text(at.clone().setY(3.5), 'BALLISTA DESTROYED!', 'hurt', { life: 1.6, rise: 80 });
    fx.addShake(0.4);
    sfx.play('crash', { at });
    // Hand the special parts back on the inner side of the tower, far enough (2.8 m) that
    // picking them up doesn't instantly pay them back into the tower's upgrade square.
    const cz = t.z > H ? (H + ANNEX_END) / 2 : 0;
    const inward = new THREE.Vector3(-t.x, 0, cz - t.z).normalize().multiplyScalar(2.8).add(at);
    dropItem('heartwood', inward, 0.4);
    if (wasPoison) dropItem('vial', inward, 0.4);
    fx.text(inward.clone().setY(2.2), wasPoison ? 'HEARTWOOD + VIAL DROPPED' : 'HEARTWOOD DROPPED', 'warn', { life: 2, rise: 60 });
    events.push({ type: 'ballistaDestroyed', id: t.id, t: clock });
    save();
  }

  const POISON_BOLT = new THREE.MeshBasicMaterial({ color: 0x8fe05a });

  // ---------- Towers ----------
  function updateTowers(dt) {
    for (const t of towers) {
      t.fireT -= dt;
      let target = null, best = t.range;
      for (const b of bears) {
        if (b.dying) continue;
        const d = Math.hypot(b.pos.x - t.x, b.pos.z - t.z);
        if (d < best) { best = d; target = b; }
      }
      const head = t.obj.userData.head;
      if (target) {
        const ang = Math.atan2(target.pos.x - t.x, target.pos.z - t.z);
        head.rotation.y = lerpAngle(head.rotation.y, ang, Math.min(1, dt * 12));
        if (t.fireT <= 0) {
          t.fireT = t.fireRate;
          const arrow = Models.makeArrow();
          if (t.ballista) arrow.scale.setScalar(1.9); // heavy bolt
          // leaves from the tip of the raised crossbow (above the rail), not from inside the tower
          arrow.position.set(t.x + Math.sin(ang) * 0.6, t.ballista ? 3.3 : 2.95, t.z + Math.cos(ang) * 0.6);
          scene.add(arrow);
          if (t.poison) arrow.children.forEach((m) => { m.material = POISON_BOLT; });
          arrows.push({ obj: arrow, target, last: target.pos.clone(), dmg: Math.round(t.damage * towerMult() * 10) / 10, pierce: t.ballista, poison: t.poison, speed: t.ballista ? BALLISTA.boltSpeed : TOWER.arrowSpeed });
          sfx.play(t.ballista ? 'bolt' : 'arrow', { at: arrow.position });
        }
      } else head.rotation.y += dt * 0.5;
      if (t.bar) {
        t.bar.position.set(t.x, 4.6, t.z);
        t.bar.quaternion.copy(camera.quaternion);
        if (t.hp >= ballistaMax()) t.bar.visible = false;
      }
    }
    for (let i = arrows.length - 1; i >= 0; i--) {
      const a = arrows[i];
      if (bears.includes(a.target) && !a.target.dying) a.last.copy(a.target.pos).setY(0.9 * a.target.def.scale);
      const dir = tmpA.subVectors(a.last, a.obj.position);
      const d = dir.length();
      const step = a.speed * dt;
      if (d <= step + 0.2) {
        if (bears.includes(a.target) && !a.target.dying) {
          hurtBear(a.target, a.dmg, null, a.pierce);
          if (a.poison && !a.target.dying) a.target.poisonT = BALLISTA.poisonTime; // refreshes
        }
        scene.remove(a.obj);
        arrows.splice(i, 1);
        continue;
      }
      dir.multiplyScalar(1 / d);
      a.obj.position.addScaledVector(dir, step);
      a.obj.lookAt(tmpB.copy(a.obj.position).add(dir));
    }
  }

  // ---------- Trees ----------
  // `power` = logs cut per hit (the player's axe level raises it: max level one-shots a tree)
  function hitTree(t, c, power = 1) {
    if (!t.alive || stackFree(c) <= 0) return;
    const logs = Math.min(power, t.hp, stackFree(c));
    t.hp -= logs;
    t.shake = 0.25;
    const at = new THREE.Vector3(t.x, 1, t.z);
    fx.burst(at, 0xd09a5e, 5 * logs, { speed: 3, up: 3, size: 0.1 });
    fx.burst(at.clone().setY(2), 0xffffff, 5, { speed: 2, up: 1, size: 0.1 });
    for (let i = 0; i < logs; i++) collectToBack(c, 'log', at.clone().setY(1 + i * 0.3));
    sfx.play('chop', { at, vol: c === player.c ? 1 : 0.5 });
    stats.logs += logs;
    if (c === player.c && ++playerChops >= 3) learn('chop');
    if (t.hp <= 0) {
      t.alive = false;
      t.claim = null;
      t.regrow = TREE.regrow;
      t.obj.visible = false;
      t.stump.visible = true;
      sfx.play('treeFall', { at, vol: c === player.c ? 1 : 0.5 });
      fx.burst(at.clone().setY(1.5), 0x2f6f5a, 10, { speed: 4, up: 4, size: 0.18 });
      fx.burst(at.clone().setY(2), 0xffffff, 10, { speed: 4, up: 4, size: 0.14 });
    }
  }

  // ---------- Waves ----------
  const waves = { n: 0, timer: WAVES.firstDelay, total: WAVES.firstDelay, queue: [], gap: 0 };

  function startWave() {
    waves.n++;
    const n = waves.n;
    const count = WAVES.countFor(n);
    const hpMult = WAVES.hpScale(n);
    for (let i = 0; i < count; i++) waves.queue.push({ kind: 'normal', hpMult, n });
    // bosses arrive after the first regular bears
    const bosses = WAVES.bossesFor(n);
    bosses.forEach((kind, i) => waves.queue.splice(Math.min(waves.queue.length, 2 + i * 3), 0, { kind, hpMult: WAVES.bossScale(n), n }));
    if (bosses.length) {
      const names = [...new Set(bosses)].map((k) => {
        const c = bosses.filter((x) => x === k).length;
        return BOSSES[k].name + (c > 1 ? ` ×${c}` : '');
      });
      hud.banner(`⚠ ${names.join(' + ')}!`);
      fx.addShake(0.4);
      sfx.play('bossHorn');
      events.push({ type: 'boss', kinds: bosses, n, t: clock });
    } else { hud.banner(`WAVE ${n}: BEARS!`); sfx.play('horn'); }
    fx.addShake(0.2);
    events.push({ type: 'wave', n: waves.n, t: clock });
    waves.timer = waves.total = WAVES.interval;
    save();
  }

  // ---------- Collision ----------
  function resolve(pos, r, useTrees) {
    for (const c of colliders) {
      const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
      const dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * r; pos.z = cz + (dz / d) * r;
      } else {
        // center inside the box: push out along the shallowest axis
        const pushes = [[c.minX - r - pos.x, 0], [c.maxX + r - pos.x, 0], [0, c.minZ - r - pos.z], [0, c.maxZ + r - pos.z]];
        pushes.sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]));
        pos.x += pushes[0][0]; pos.z += pushes[0][1];
      }
    }
    for (const c of circles) pushCircle(pos, r, c.x, c.z, c.r);
    if (useTrees) for (const t of trees) if (t.alive) pushCircle(pos, r, t.x, t.z, TREE.radius * t.s);
    const d = Math.hypot(pos.x, pos.z);
    if (d > WORLD_R) { pos.x *= WORLD_R / d; pos.z *= WORLD_R / d; }
  }

  function pushCircle(pos, r, x, z, cr) {
    const dx = pos.x - x, dz = pos.z - z;
    const min = r + cr;
    const d2 = dx * dx + dz * dz;
    if (d2 >= min * min || d2 < 1e-8) return;
    const d = Math.sqrt(d2);
    pos.x = x + (dx / d) * min; pos.z = z + (dz / d) * min;
  }

  // ---------- Autopilot (plays the game by itself for recording footage) ----------
  const auto = { on: false, used: false };

  function autopilotGoal() {
    const p = player.pos, c = player.c;
    const nearestBear = bears.filter((b) => !b.dying).sort((a, b) => a.pos.distanceTo(p) - b.pos.distanceTo(p))[0];
    const bearDist = nearestBear ? nearestBear.pos.distanceTo(p) : Infinity;
    // hurt: fall back under the towers until healed
    // poison never wears off: the campfire comes before everything else
    if (player.poisonT > 0) return CAMPFIRE.clone();
    if (player.hp < PLAYER.maxHp * 0.45 && bearDist < 7) return new THREE.Vector3(0, 0, 3.1);
    if (bearDist < 5) return nearestBear.pos;
    // the log thrower stays out of tower range: go get it
    const thrower = bears.find((b) => b.kind === 'thrower' && !b.dying);
    if (thrower && player.hp > PLAYER.maxHp * 0.6) return thrower.pos;
    const full = stackFree(c) <= 0;
    const logs = countOf(c, 'log');
    // The grill comes first: it unlocks the automation chain. Buildings and hires before upgrades.
    const openLog = zones.filter((z) => z.state === 'open' && z.currency === 'log');
    const logZone = openLog.find((z) => z.def.kind === 'grill') || openLog[0];
    const byRemaining = (a, b) => (a.total - a.paid) - (b.total - b.paid);
    // buildings can be paid bit by bit; endless upgrades only when they can be paid in full
    // (otherwise the autopilot pours every dollar into them and never saves for the expansion)
    // ...except the axe: kept at about one level per wave, like a player who upgrades normally
    const axeUp = upgrades.find((u) => u.def.id === 'axe' && u.state === 'open' && levels.axe < waves.n && cash >= u.total - u.paid);
    const cashZone = axeUp || zones.filter((z) => z.state === 'open' && z.currency === 'cash' && cash > 0).sort(byRemaining)[0]
      || upgrades.filter((z) => z.state === 'open' && z.currency === 'cash' && cash >= z.total - z.paid).sort(byRemaining)[0];
    const drop = drops.filter((d) => !d.claim).sort((a, b) => a.pos.distanceTo(p) - b.pos.distanceTo(p))[0];
    // (a cashier keeps the cash pile topped up: the axe comes first or it never gets bought)
    if (axeUp) return new THREE.Vector3(axeUp.def.x, 0, axeUp.def.z);
    if (counter.pileValue > 0) return new THREE.Vector3(counter.pos.x + 1.5, 0, counter.pos.z + 0.3);
    if ((countOf(c, 'steak') || countOf(c, 'spicy') || countOf(c, 'smoked')) && counter.built) return spots.counter();
    // (before the sell table exists there's nowhere to take meat: keep chopping instead of freezing)
    const cook = nearestCooker(p);
    if (rawCount(c) && (full || !drop) && (cook || counter.built)) return cook ? spots.grillIn(cook) : spots.counter();
    // boss extras: forge armor with plates, patch damaged walls with wood
    const armorPad = upgrades.find((u) => u.def.id === 'armor' && u.state === 'open');
    if (armorPad && countOf(c, 'plate')) return new THREE.Vector3(armorPad.def.x, 0, armorPad.def.z);
    // ballista / poison-bolt upgrades: carry the special item + some cash to the tower
    const upTower = towers.find((t) => t.up && ((t.up.kind === 'ballista' && countOf(c, 'heartwood') && countOf(c, 'log') >= BALLISTA.cost.logs)
      || (t.up.kind === 'poison' && countOf(c, 'vial') && countOf(c, 'log') >= BALLISTA.poisonCost.logs)));
    if (upTower && cash >= 50) {
      // stand on the inner side of the tower (toward the middle of its camp area)
      const cz = upTower.z > H ? (H + ANNEX_END) / 2 : 0;
      const dx = -upTower.x, dz = cz - upTower.z, l = Math.hypot(dx, dz) || 1;
      return new THREE.Vector3(upTower.x + (dx / l) * 1.3, 0, upTower.z + (dz / l) * 1.3);
    }
    const hurtWall = walls.find((w) => w.pad);
    if (hurtWall && countOf(c, 'log') >= 3) return new THREE.Vector3(hurtWall.def.x, 0, hurtWall.def.z);
    // no wood for the repair: fetch some from the wood storage (a broken wall stayed down for 12 waves)
    if (hurtWall && woodpile.count > 0 && !full) return spots.woodpile();
    // holding a heartwood / vial: keep the wood for that tower upgrade instead of spending it
    const savingWood = (countOf(c, 'heartwood') && towers.some((t) => t.up?.kind === 'ballista'))
      || (countOf(c, 'vial') && towers.some((t) => t.up?.kind === 'poison'));
    if (!savingWood && logs && logZone && (full || logs >= Math.min(10, logZone.total - logZone.paid))) return new THREE.Vector3(logZone.def.x, 0, logZone.def.z);
    if (cashZone && cash >= Math.min(20, cashZone.total - cashZone.paid)) return new THREE.Vector3(cashZone.def.x, 0, cashZone.def.z);
    const ready = nearestCooker(p, (k) => k.out > 0);
    if (ready && !full && !helpers.some((h) => h.kind === 'cashier')) return spots.grillOut(ready);
    if (woodpile.count > 0 && !full && logZone) return spots.woodpile();
    if (drop && !full) return drop.pos;
    if (!full) {
      const tree = trees.filter((t) => t.alive && !t.claim).sort((a, b) => dist2d(a, p) - dist2d(b, p))[0];
      if (tree) return new THREE.Vector3(tree.x, 0, tree.z);
    }
    return logZone ? new THREE.Vector3(logZone.def.x, 0, logZone.def.z) : null;
  }

  // ---------- Save / load ----------
  function save() {
    if (!useSave || auto.used) return; // autopilot runs are for footage; never overwrite the player's save
    try {
      localStorage.setItem(saveKey, JSON.stringify({
        v: 1, cash, built: [...built], levels, wave: waves.n, woodpile: woodpile.count,
        walls: Object.fromEntries(walls.map((w) => [w.side, Math.round(w.hp)])),
        ballistas: towers.filter((t) => t.ballista).map((t) => t.id),
        poisonBallistas: towers.filter((t) => t.poison).map((t) => t.id),
        // rare boss items must never vanish: the ones in your bag or still on the ground...
        specials: Object.fromEntries(SPECIALS.map((k) => [k, countOf(player.c, k) + drops.filter((d) => d.type === k).length])),
        // ...and what you already put into a tower's BALLISTA / POISON BOLTS square
        towerUps: towers.filter((t) => t.up && Object.keys(t.up.paid).length).map((t) => ({ id: t.id, kind: t.up.kind, paid: t.up.paid })),
        paid: Object.fromEntries([...zones, ...upgrades].filter((z) => z.state === 'open' && z.paid > 0).map((z) => [z.def.id, z.paid])),
      }));
    } catch { /* storage unavailable: play without saving */ }
  }

  function load() {
    if (!useSave) return false;
    let s = null;
    try { s = JSON.parse(localStorage.getItem(saveKey) || 'null'); } catch { s = null; }
    if (!s || s.v !== 1) return false;
    // levels first: wall hp depends on the axe level
    for (const k in levels) levels[k] = s.levels?.[k] || 0;
    for (const z of zones) if (s.built?.includes(z.def.id)) construct(z, true);
    // milestone flags that aren't buildings (e.g. 'firstPlate' unlocks the ARMOR square)
    for (const id of s.built || []) built.add(id);
    refreshUnlocks();
    for (const t of towers) if (s.ballistas?.includes(t.id)) toBallista(t, true);
    for (const t of towers) if (t.ballista && s.poisonBallistas?.includes(t.id)) toPoisonBallista(t, true);
    for (const u of s.towerUps || []) pendingUps[u.id] = u;
    for (const w of walls) {
      const hp = s.walls?.[w.side];
      if (hp !== undefined && hp < wallMax()) { w.hp = wallMax(); if (hp <= 0) damageWall(w, wallMax()); else { w.hp = hp; wallLook(w); } }
    }
    for (const u of upgrades) {
      const lv = s.levels?.[u.def.id] || 0;
      levels[u.def.id] = lv;
      u.level = lv;
      if (u.state === 'open' || lv > 0) applyLevel(u);
    }
    for (const z of [...zones, ...upgrades]) {
      const p = s.paid?.[z.def.id];
      if (p && z.state === 'open') { z.paid = Math.min(p, z.total - 1); refreshLabel(z); Models.setPadProgress(z.pad, z.paid / z.total); }
    }
    if (s.woodpile && woodpile.built) addWood(s.woodpile);
    waves.n = s.wave || 0;
    setCash(s.cash || 0);
    player.armor = armorMax();
    // give the rare items back (in the bag, or on the ground next to you if it's full)
    for (const k of SPECIALS) {
      for (let i = 0; i < (s.specials?.[k] || 0); i++) {
        if (stackFree(player.c) > 0) pushStack(player.c, k, makeItem(k));
        else dropItem(k, SPAWN, 1.5);
      }
    }
    layoutStack(player.c);
    return true;
  }

  function resetSave() {
    try { localStorage.removeItem(saveKey); } catch { /* ignore */ }
  }

  // ---------- Guidance: what to do next, where it is, what each station does ----------
  const goalMarker = Models.makeGoalMarker();
  const dirArrow = Models.makeDirArrow();
  goalMarker.visible = dirArrow.visible = false;
  scene.add(goalMarker, dirArrow);
  let goal = null, goalT = 0;

  const padPos = (z) => new THREE.Vector3(z.def.x, 0, z.def.z);
  const padName = (z) => (z.def.icon ? `${z.def.name} upgrade` : z.def.name);
  const nearestTree = () => {
    const p = player.pos;
    const t = trees.filter((x) => x.alive).sort((a, b) => dist2d(a, p) - dist2d(b, p))[0];
    return t ? new THREE.Vector3(t.x, 0, t.z) : null;
  };

  // Tutorial = one tip per action, shown only until the player has done that action once.
  // What's been learned is remembered on the device (kept across new games): after that we
  // assume the player gets it, and the "?" How to play panel is there for questions.
  const LEARNED_KEY = 'polarcamp-learned';
  const learned = new Set();
  if (useSave) { try { JSON.parse(localStorage.getItem(LEARNED_KEY) || '[]').forEach((k) => learned.add(k)); } catch { /* ignore */ } }
  function learn(key) {
    if (learned.has(key)) return;
    learned.add(key);
    goalT = 0; // switch the tip right away
    if (useSave) { try { localStorage.setItem(LEARNED_KEY, JSON.stringify([...learned])); } catch { /* ignore */ } }
  }
  let playerChops = 0;

  // Candidate tips in priority order; the first one not learned yet is shown.
  // `info` tips (no action to perform) count as learned once they've been on screen a while.
  function computeGoal() {
    const P = player, c = P.c;
    if (P.dead) return null;
    const logs = countOf(c, 'log'), meat = countOf(c, 'meat'), steaks = countOf(c, 'steak') + countOf(c, 'spicy');
    const tips = [];
    const bear = bears.filter((b) => !b.dying).sort((a, b) => dist2d(a.pos, P.pos) - dist2d(b.pos, P.pos))[0];

    // --- boss moments first: each one explained the first time it happens ---
    if (P.poisonT > 0) tips.push({ key: 'campfire', icon: '☠️', text: "Poisoned! It won't stop until you reach the campfire: run!", pos: CAMPFIRE.clone() });
    if (clouds.some((cl) => !cl.burst)) tips.push({ key: 'cloud', info: 3, icon: '💨', text: 'The poison bear is about to burst: step back!' });
    const alive = (kind) => bears.find((b) => b.kind === kind && !b.dying);
    const armored = alive('armored');
    if (armored && armored.armor > 0) tips.push({ key: 'bossArmored', info: 8, icon: '🛡️', text: 'ARMORED BEAR: arrows bounce off. Break its plates with your axe!', pos: armored.pos.clone() });
    const thrower = alive('thrower');
    if (thrower) tips.push({ key: 'bossThrower', info: 8, icon: '🪵', text: 'LOG THROWER: it smashes your walls from afar. Go out and hit it!', pos: thrower.pos.clone() });
    const poisoner = alive('poison');
    if (poisoner) tips.push({ key: 'bossPoison', info: 8, icon: '🤢', text: 'POISON BEAR: its bite poisons you, and it bursts when it dies', pos: poisoner.pos.clone() });
    const loot = drops.find((d) => d.type === 'loot');
    if (loot) tips.push({ key: 'loot', icon: '💰', text: 'Boss loot! Walk over the bag to grab the cash', pos: loot.pos.clone() });
    const armorPad = upgrades.find((u) => u.def.id === 'armor' && u.state === 'open');
    if (armorPad && countOf(c, 'plate')) tips.push({ key: 'forge', icon: '🛡️', text: 'Bring armor plates to the ARMOR square: armor soaks up hits', pos: padPos(armorPad) });
    if (countOf(c, 'toxic')) {
      if (grill.built) tips.push({ key: 'toxic', icon: '🤢', text: 'Toxic meat is worth $0 raw. Grill it into a $30 spicy steak!', pos: grill.pos.clone() });
      else tips.push({ key: 'toxicNoGrill', info: 8, icon: '🤢', text: 'Toxic meat is worth $0 raw. Build the GRILL to cook it for $30' });
    }
    const plainTower = towers.find((t) => !t.ballista);
    if (countOf(c, 'heartwood') && plainTower) tips.push({ key: 'ballista', icon: '🌟', text: 'Heartwood! Bring it + 20 wood + $250 to an arrow tower: BALLISTA (12 m, 9× arrow damage)', pos: new THREE.Vector3(plainTower.x, 0, plainTower.z) });
    const plainBallista = towers.find((t) => t.ballista && !t.poison);
    if (countOf(c, 'vial') && plainBallista) tips.push({ key: 'poisonBolts', icon: '🧪', text: 'Poison vial! Bring it + 15 wood + $150 to a ballista: POISON BOLTS', pos: new THREE.Vector3(plainBallista.x, 0, plainBallista.z) });
    if (countOf(c, 'vial') && !plainBallista && !towers.some((t) => t.poison)) tips.push({ key: 'vialKeep', info: 6, icon: '🧪', text: 'Keep this poison vial: it will give a ballista poison bolts' });
    if (!fireActive() && dist2d(P.pos, CAMPFIRE) < 4) tips.push({ key: 'fireRecharge', info: 5, icon: '🔥', text: 'The campfire is recharging: it heals again in a few seconds' });
    if (smoker.built && rawCount(c)) tips.push({ key: 'smoker', icon: '🏭', text: `The SMOKEHOUSE cooks twice as fast: smoked meat sells for $${SMOKER.price}`, pos: smoker.pos.clone() });
    const hurtWall = walls.find((w) => w.pad);
    if (hurtWall) tips.push({ key: 'repair', icon: '🔨', text: `${hurtWall.name} is ${hurtWall.broken ? 'broken' : 'damaged'}! Bring wood to its REPAIR square`, pos: padPos({ def: hurtWall.def }) });

    if (bear && dist2d(bear.pos, P.pos) < 6) tips.push({ key: 'fight', icon: '🐻', text: 'Bears! Stay close to hit them. Low HP? Run back under your towers.' });

    // (once chopping is learned, the generic "Bring wood to the SELL TABLE square" tip below takes over)
    if (!counter.built) tips.push({ key: 'chop', icon: '🌲', text: 'Walk next to a tree to chop it', pos: nearestTree() });
    if (counter.pile.length) tips.push({ key: 'cash', icon: '💵', text: 'Pick up your cash next to the sell table', pos: new THREE.Vector3(counter.pos.x + 1.5, 0, counter.pos.z + 0.3) });
    if (meat && grill.built) tips.push({ key: 'grill', icon: '🔥', text: 'Put raw meat on the GRILL: steaks sell for $12 instead of $5', pos: grill.pos.clone() });
    if (grill.out > 0 && stackFree(c) > 0 && !helpers.some((h) => h.kind === 'cashier')) tips.push({ key: 'grillTake', icon: '🍖', text: 'Grab the cooked steaks from the grill', pos: spots.grillOut() });
    if ((meat || steaks) && counter.built) tips.push({ key: 'sell', icon: '🥩', text: 'Sell your meat at the SELL TABLE', pos: counter.pos.clone() });

    const byLeft = (a, b) => (a.total - a.paid) - (b.total - b.paid);
    const cashPads = [...zones, ...upgrades].filter((z) => z.state === 'open' && z.currency === 'cash');
    const affordable = cashPads.filter((z) => cash >= z.total - z.paid).sort(byLeft)[0];
    if (affordable) tips.push({ key: 'buy', icon: '💵', text: `You can buy: ${padName(affordable)}. Stand on its square`, pos: padPos(affordable) });

    const openLog = zones.filter((z) => z.state === 'open' && z.currency === 'log');
    const logZone = openLog.find((z) => z.def.kind === 'grill') || openLog[0];
    if (logZone && logs > 0) tips.push({ key: 'build', icon: '🪵', text: `Bring wood to the ${logZone.def.name} square`, pos: padPos(logZone) });
    if (logZone && woodpile.count > 0) tips.push({ key: 'woodpile', icon: '🪵', text: 'Grab wood from your wood storage', pos: woodpile.pos.clone() });
    if (counter.built && logs > logsNeeded()) tips.push({ key: 'spareWood', icon: '🪵', text: 'Spare wood? Stand still at the SELL TABLE to sell it for $1 each', pos: counter.pos.clone() });

    const next = cashPads.sort(byLeft)[0];
    if (next && counter.built) tips.push({ key: 'hunt', info: 10, icon: '🐻', text: `Hunt bears for meat and sell it to afford the ${padName(next)}` });
    if (!next && !logZone) tips.push({ key: 'complete', info: 6, icon: '🏆', text: 'Your camp is complete! Survive the waves.' });

    return tips.find((t) => !learned.has(t.key)) || null;
  }

  // Small labels on each station. The "what it does" line goes away once that action is learned.
  const stationLabels = [];
  function stationLabel(html, getPos, visible, learnKey) {
    const el = document.createElement('div');
    el.className = 'label station-label';
    el.innerHTML = html;
    labelsEl.appendChild(el);
    stationLabels.push({ el, getPos, visible, learnKey });
  }
  stationLabel('SELL TABLE<small>meat & spare wood → 💵</small>', () => counter.pos.clone().setY(2.6), () => counter.built, 'sell');
  stationLabel('💵 PICK UP', () => new THREE.Vector3(counter.pos.x + 1.5, 1.4, counter.pos.z + 0.3), () => counter.built && counter.pile.length > 0 && !learned.has('cash'));
  stationLabel('GRILL<small>raw meat → $12 steak</small>', () => grill.pos.clone().setY(1.3).setZ(grill.pos.z + 0.6), () => grill.built, 'grill');
  stationLabel(`SMOKEHOUSE<small>2× faster · $${SMOKER.price} smoked meat</small>`, () => smoker.pos.clone().setY(2.6), () => smoker.built, 'smoker');
  stationLabel('WOOD STORAGE<small>your lumberjack fills it</small>', () => woodpile.pos.clone().setY(1.9), () => woodpile.built, 'woodpile');

  let infoShown = 0;
  function updateGuidance(dt) {
    goalT -= dt;
    if (goalT <= 0) {
      goalT = 0.25;
      const prevKey = goal && goal.key;
      goal = computeGoal();
      if (!goal || goal.key !== prevKey) infoShown = 0;
      hud.setHint(goal ? goal.text : '', goal ? goal.icon : '');
    }
    if (goal && goal.info) {
      infoShown += dt;
      if (infoShown > goal.info) learn(goal.key);
    }
    const target = goal && goal.pos;
    goalMarker.visible = !!target;
    if (target) {
      goalMarker.position.set(target.x, 0, target.z);
      goalMarker.userData.cone.position.y = 2.4 + Math.abs(Math.sin(clock * 4)) * 0.45;
      goalMarker.userData.ring.position.y = 0.16;
      goalMarker.userData.ring.scale.setScalar(1 + Math.sin(clock * 4) * 0.08);
    }
    // ground arrow around the player when the goal is off to the side
    const far = target && dist2d(target, player.pos) > 4;
    dirArrow.visible = !!far && !player.dead;
    if (far) {
      const a = Math.atan2(target.x - player.pos.x, target.z - player.pos.z);
      dirArrow.position.set(player.pos.x + Math.sin(a) * 1.5, 0.17, player.pos.z + Math.cos(a) * 1.5);
      dirArrow.rotation.y = a + Math.PI;
    }
    for (const s of stationLabels) {
      const show = s.visible();
      s.el.style.display = show ? '' : 'none';
      if (!show) continue;
      if (s.learnKey) s.el.classList.toggle('learned', learned.has(s.learnKey));
      const p = fx.toScreen(s.getPos());
      s.el.style.left = p.x + 'px'; s.el.style.top = p.y + 'px';
    }
  }

  // ---------- Main update ----------
  let saveT = 5;

  function update(dt) {
    clock += dt;
    const P = player;
    sfx.setListener(P.pos.x, P.pos.z); // sounds fade with distance from the lumberjack
    const ud = P.obj.userData;

    // --- movement ---
    let mx = input.move.x, mz = input.move.z;
    const autoDriving = auto.on && !P.dead;
    if (autoDriving) {
      auto.used = true;
      const goal = autopilotGoal();
      if (goal) {
        // stop only when the final goal is reached, never at an intermediate waypoint
        // (a doorway point 0.3 m away used to freeze the autopilot outside the camp)
        const step = routeTarget(P.pos, goal);
        let dx = step.x - P.pos.x, dz = step.z - P.pos.z;
        let l = Math.hypot(dx, dz);
        if (l < 0.05) { dx = goal.x - P.pos.x; dz = goal.z - P.pos.z; l = Math.hypot(dx, dz); }
        if (dist2d(P.pos, goal) > 0.45 && l > 0.001) [mx, mz] = steer(P, dx / l, dz / l); else { mx = mz = 0; }
      } else { mx = mz = 0; }
    }
    if (P.dead) {
      mx = mz = 0;
      // the autopilot presses TRY AGAIN by itself so long recordings keep going
      if (auto.on) { auto.deadT = (auto.deadT || 0) + dt; if (auto.deadT > 1.5) { auto.deadT = 0; retry(); } }
    }
    P.stillT = Math.hypot(mx, mz) > 0.1 ? 0 : (P.stillT || 0) + dt;
    const bx = P.pos.x, bz = P.pos.z;
    P.vel.set(mx * PLAYER.speed, 0, mz * PLAYER.speed);
    P.pos.addScaledVector(P.vel, dt);
    resolve(P.pos, PLAYER.radius, true);
    if (autoDriving) trackStuck(P, bx, bz, Math.hypot(mx, mz) * PLAYER.speed * dt, dt);
    const moving = P.vel.lengthSq() > 0.1;

    // --- auto action: attack bears first, otherwise chop trees ---
    P.swingCd -= dt;
    let target = null, targetKind = null;
    let best = PLAYER.attackRange;
    for (const b of bears) {
      if (b.dying) continue;
      const d = b.pos.distanceTo(P.pos) - (b.def.radius - 0.4);
      if (d < best) { best = d; target = b; targetKind = 'bear'; }
    }
    if (!target) {
      best = PLAYER.chopRange;
      for (const t of trees) {
        if (!t.alive) continue;
        const d = Math.hypot(t.x - P.pos.x, t.z - P.pos.z);
        if (d < best) { best = d; target = t; targetKind = 'tree'; }
      }
      if (target && stackFree(P.c) <= 0) {
        P.maxMsgT -= dt;
        if (P.maxMsgT <= 0) { fx.text(P.pos.clone().setY(2.8), 'MAX', 'warn'); sfx.play('full'); P.maxMsgT = 1.2; }
        target = null;
      }
    }
    if (target && !P.dead) {
      const tx = targetKind === 'bear' ? target.pos.x : target.x;
      const tz = targetKind === 'bear' ? target.pos.z : target.z;
      if (!moving) P.facing = lerpAngle(P.facing, Math.atan2(tx - P.pos.x, tz - P.pos.z), Math.min(1, dt * 14));
      if (P.swingCd <= 0) {
        P.swingCd = PLAYER.swingCooldown;
        P.swingT = 0;
        P.pendingHit = { target, kind: targetKind };
      }
    }
    if (moving) P.facing = lerpAngle(P.facing, Math.atan2(P.vel.x, P.vel.z), Math.min(1, dt * 14));

    // swing animation; the hit lands mid-swing
    if (P.swingT < 1) {
      const prev = P.swingT;
      P.swingT = Math.min(1, P.swingT + dt / 0.26);
      const t = P.swingT;
      ud.arm.rotation.x = t < 0.4 ? THREE.MathUtils.lerp(0, 2.3, t / 0.4) : THREE.MathUtils.lerp(2.3, -1.2, Math.min(1, (t - 0.4) / 0.3));
      if (t >= 1) ud.arm.rotation.x = 0;
      if (prev < 0.6 && t >= 0.6 && P.pendingHit) {
        applyHit(P.pendingHit);
        P.pendingHit = null;
      }
    }

    // walk animation
    P.walkT += dt * (moving ? 12 : 0);
    const sw = moving ? Math.sin(P.walkT) : 0;
    ud.legL.rotation.x = sw * 0.6; ud.legR.rotation.x = -sw * 0.6;
    ud.body.position.y = moving ? Math.abs(Math.sin(P.walkT)) * 0.07 : 0;
    P.obj.position.copy(P.pos);
    P.obj.rotation.y = P.facing;

    // stack sway: higher items lag behind more when running
    const lean = moving ? 1 : 0;
    ud.back.rotation.x = THREE.MathUtils.lerp(ud.back.rotation.x, -0.12 * lean, dt * 6);
    P.c.stack.forEach((it, i) => { it.mesh.position.z = -Math.pow(i, 1.3) * 0.006 * lean + Math.sin(clock * 3 + i * 0.4) * 0.004 * i * (1 - lean); });

    // hp regen
    P.sinceHurt += dt;
    if (!P.dead && P.sinceHurt > PLAYER.regenDelay && P.hp < PLAYER.maxHp) P.hp = Math.min(PLAYER.maxHp, P.hp + PLAYER.regenRate * dt);
    if (!P.dead && P.sinceHurt > PLAYER.regenDelay && P.armor < armorMax()) P.armor = Math.min(armorMax(), P.armor + ARMOR.regen * dt);
    updatePoisonAndCampfire(dt);
    hud.setHp(P.hp / PLAYER.maxHp);
    hud.setArmor(armorMax() ? P.armor / armorMax() : 0, armorMax() > 0);

    // --- trees regrow / shake ---
    for (const t of trees) {
      if (t.shake > 0) {
        t.shake -= dt;
        t.obj.userData.top.rotation.z = Math.sin(t.shake * 60) * t.shake * 0.5;
      }
      if (!t.alive) {
        t.regrow -= dt;
        if (t.regrow <= 0) { t.alive = true; t.hp = TREE.hp; t.obj.visible = true; t.stump.visible = false; t.grow = 0; }
      }
      if (t.grow < 1) { t.grow = Math.min(1, t.grow + dt * 2.5); t.obj.scale.setScalar(t.s * easeOutBack(t.grow)); }
    }

    // --- ground drops: magnet into the player's bag ---
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.t += dt;
      d.mesh.position.y = d.pos.y + Math.sin(d.t * 4) * 0.08;
      d.mesh.rotation.y += dt;
      if (P.dead || d.pos.distanceTo(P.pos) >= PLAYER.pickupRange) continue;
      if (d.type === 'loot') {
        // boss loot bag: straight to your wallet, no bag space needed
        scene.remove(d.mesh);
        drops.splice(i, 1);
        const value = d.value;
        fx.fly(d.mesh, d.mesh.position.clone(), () => P.pos.clone().setY(1.3), {
          duration: 0.3, arc: 1,
          onDone: () => { setCash(cash + value); hud.bumpCash(); learn('loot'); sfx.play('levelup'); fx.text(P.pos.clone().setY(2.6), `+$${value}`, 'cash', { life: 1, rise: 60 }); },
        });
        continue;
      }
      if (stackFree(P.c) <= 0) continue;
      scene.remove(d.mesh);
      drops.splice(i, 1);
      collectToBack(P.c, d.type, d.mesh.position.clone(), d.mesh);
      if (d.type === 'plate' && !built.has('firstPlate')) {
        // first armor plate ever: the ARMOR forge square appears
        built.add('firstPlate');
        refreshUnlocks();
        save();
      }
      if (d.type === 'heartwood' && !built.has('firstHeartwood')) {
        // first heartwood ever: arrow towers can now become ballistas
        built.add('firstHeartwood');
        save();
      }
      if (d.type === 'vial' && !built.has('firstVial')) {
        // first poison vial ever: ballistas can now get poison bolts
        built.add('firstVial');
        save();
      }
    }

    // --- zones & upgrade pads ---
    for (const z of [...zones, ...upgrades]) {
      if (z.state !== 'open') continue;
      if (z.pop < 1) { z.pop = Math.min(1, z.pop + dt * 3); z.pad.scale.setScalar(easeOutBack(z.pop)); }
      if (!P.dead) payInto(z, dt);
      if (z.completeT !== undefined) {
        z.completeT -= dt;
        if (z.completeT <= 0) {
          z.completeT = undefined;
          if (zones.includes(z)) construct(z); else levelUp(z);
        }
      }
      if (z.label) {
        const s = fx.toScreen(new THREE.Vector3(z.def.x, 0.2, z.def.z + 0.2));
        z.label.style.left = s.x + 'px'; z.label.style.top = s.y + 'px';
      }
    }

    for (let i = popIns.length - 1; i >= 0; i--) {
      const p = popIns[i];
      p.t = Math.min(1, p.t + dt * 2.5);
      p.obj.scale.setScalar(Math.max(0.01, easeOutBack(p.t)));
      if (p.t >= 1) popIns.splice(i, 1);
    }

    // --- stations the player interacts with by standing close ---
    P.c.actT -= dt;
    if (counter.built) updateCounter(dt);
    for (const k of builtCookers()) {
      updateGrill(dt, k);
      if (!P.dead && dist2d(P.pos, k.pos) < 2.0) {
        if (rawCount(P.c)) feedGrill(P.c, k);
        else takeFromGrill(P.c, k);
      }
    }
    updateWalls(dt);
    if (woodpile.built && !P.dead && dist2d(P.pos, woodpile.pos) < 1.6 && P.c.actT <= 0) {
      P.c.actT = 0.06;
      takeWood(P.c);
    }

    // --- workers, bears, towers ---
    for (const h of helpers) updateHelper(h, dt);
    updateBears(dt);
    updateTowers(dt);
    updateBallistaUpgrades(dt);

    // --- waves ---
    if (!P.dead) {
      waves.timer -= dt;
      if (waves.timer <= 0) {
        // elastic timer: each bear still out there pushes the next wave back a little (once per wave)
        const left = bears.filter((b) => !b.dying).length + waves.queue.length;
        if (left && !waves.stretched) { waves.stretched = true; waves.timer += left * WAVES.perAliveBear; waves.total += left * WAVES.perAliveBear; }
        else { waves.stretched = false; startWave(); }
      }
      if (waves.queue.length) {
        waves.gap -= dt;
        if (waves.gap <= 0) { const q = waves.queue.shift(); spawnBear(q.kind, q.hpMult, q.n); waves.gap = WAVES.spawnGap; }
      }
    }
    const aliveBears = bears.filter((b) => !b.dying).length;
    hud.setWave(aliveBears > 0 ? `WAVE ${waves.n} · ${aliveBears} 🐻` : `WAVE ${waves.n + 1} IN ${Math.ceil(waves.timer)}s`, 1 - waves.timer / waves.total);
    // boss bar: all bosses alive, armor counted as extra health
    const bossesAlive = bears.filter((b) => b.boss && !b.dying);
    if (bossesAlive.length) {
      const names = [...new Set(bossesAlive.map((b) => b.def.name))];
      const cur = bossesAlive.reduce((s, b) => s + b.hp + b.armor, 0);
      const max = bossesAlive.reduce((s, b) => s + b.maxHp + b.maxArmor, 0);
      hud.setBoss(names.join(' + ') + (bossesAlive.length > names.length ? ` ×${bossesAlive.length}` : ''), cur / max);
    } else hud.setBoss(null);

    // campfire flicker
    const fl = campfire.userData.flames;
    fl[0].scale.y = 0.6 + Math.sin(clock * 17) * 0.08 + Math.sin(clock * 7.3) * 0.05;
    fl[1].scale.y = 0.35 + Math.sin(clock * 21) * 0.06;
    campfire.userData.light.intensity = (fireActive() ? 5 : 1.2) + Math.sin(clock * 13) * 0.8;

    updateGuidance(dt);

    saveT -= dt;
    if (saveT <= 0 && dt > 0) { saveT = 5; save(); }
  }

  function applyHit({ target, kind }) {
    if (kind === 'bear') {
      if (!bears.includes(target) || target.dying) return;
      hurtBear(target, damage(), player.pos);
      fx.addShake(0.08);
      return;
    }
    hitTree(target, player.c, PLAYER.chopPower(levels.axe));
  }

  function retry() {
    const P = player;
    P.dead = false;
    P.hp = PLAYER.maxHp;
    P.armor = armorMax();
    P.poisonT = 0;
    hud.setPoison(false);
    for (const c of clouds) scene.remove(c.mesh);
    clouds.length = 0;
    for (const l of thrown) scene.remove(l.mesh);
    thrown.length = 0;
    P.pos.copy(SPAWN);
    P.obj.rotation.z = 0;
    for (const it of P.c.stack) P.obj.userData.back.remove(it.mesh);
    P.c.stack.length = 0;
    layoutStack(P.c);
    for (const b of bears) { scene.remove(b.obj, b.bar); if (b.armorBar) scene.remove(b.armorBar); }
    bears.length = 0;
    waves.queue.length = 0;
    waves.timer = waves.total = 20;
    hud.defeat(false);
    save();
  }

  refreshUnlocks();
  setCash(0);
  const loaded = load();
  layoutStack(player.c);

  return {
    update, retry, player, events, stats, auto, helpers, grill, woodpile, loaded, resetSave,
    get cash() { return cash; },
    set cash(v) { setCash(v); },
    get wave() { return waves.n; },
    skipToWave() { waves.timer = 0.01; waves.stretched = true; },
    // dev/test helpers
    give(type, n = 1) { for (let i = 0; i < n && stackFree(player.c) > 0; i++) pushStack(player.c, type, makeItem(type)); },
    count: (type) => countOf(player.c, type),
    counter, logsNeeded, spawnBear, bears, walls, drops, levels, learned,
    armorMax, towers, damageTower, save, rescues, route: (a, b) => routeTarget(a, b), spots,
    autoGoal: () => autopilotGoal(),
    flag(id) { built.add(id); refreshUnlocks(); }, // e.g. 'firstHeartwood', 'firstPlate' (tests/footage)
    // build every square (or the listed ids) at once: layout checks and footage of a full camp
    buildAll(ids) { for (const z of zones) if (z.state !== 'built' && (!ids || ids.includes(z.def.id))) construct(z, true); },
  };
}
