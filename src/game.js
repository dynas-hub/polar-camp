// Core gameplay: player, trees, bears, stacking, build zones, towers, selling, waves,
// grill, hired workers, save/load.
import * as THREE from 'three';
import {
  CAMP_HALF, PLAYER, TREE, BEAR, MEGA_BEAR, WAVES, TOWER, ECONOMY, ZONES, UPGRADES, HELPERS, WOODPILE,
} from './config.js';
import * as Models from './models.js';

const V = () => new THREE.Vector3();
const tmpA = V(), tmpB = V();
const SPAWN = new THREE.Vector3(0, 0, 1.6);
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

export function createGame({ scene, camera, fx, input, hud, labelsEl, useSave = true }) {
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
  campfire.position.set(0, 0.12, -0.8);
  scene.add(campfire); // decoration: you can walk right over it

  const tent = Models.makeTent();
  tent.position.set(-2.4, 0.12, 0.9);
  scene.add(tent);
  addBox(-2.4, 0.9, 0.95, 0.95);

  const rand = rng(7);
  const trees = [];
  let guard = 0;
  while (trees.length < TREE.count && guard++ < 5000) {
    const a = rand() * Math.PI * 2;
    const d = TREE.minDist + Math.sqrt(rand()) * (TREE.maxDist - TREE.minDist);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (Math.abs(x) < CAMP_HALF + 2.5 && Math.abs(z) < CAMP_HALF + 2.5) continue;
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
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 1.6)) continue;
    const rock = Models.makeRock(0.7 + rand() * 0.9);
    rock.position.set(x, 0, z);
    scene.add(rock);
  }

  let clock = 0;
  const events = [];
  const stats = { kills: 0, logs: 0, sold: 0, cooked: 0 };

  // ---------- Carriers: anything with a stack on its back (player + workers) ----------
  const makeItem = (type) => (type === 'log' ? Models.makeLog() : type === 'steak' ? Models.makeSteak() : Models.makeMeat());

  function makeCarrier(obj, capFn, isPlayer = false) {
    return { obj, stack: [], incoming: 0, cap: capFn, isPlayer, sellT: 0, actT: 0 };
  }
  const stackFree = (c) => c.cap() - c.stack.length - c.incoming;
  const countOf = (c, type) => c.stack.reduce((n, it) => n + (it.type === type), 0);

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
      onDone: (m) => { c.incoming--; pushStack(c, type, m); },
    });
  }

  // ---------- Player ----------
  const levels = { axe: 0, bag: 0 };
  const player = {
    obj: Models.makePlayer(),
    pos: SPAWN.clone(),
    vel: V(),
    facing: Math.PI,
    hp: PLAYER.maxHp,
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
  const damage = () => PLAYER.baseDamage + levels.axe * PLAYER.damagePerLevel;

  // ---------- Build zones & upgrades ----------
  const built = new Set();
  const zones = ZONES.map((def) => ({
    def, state: 'locked', paid: 0, total: def.cost.logs ?? def.cost.cash,
    currency: def.cost.logs ? 'log' : 'cash', payT: 0, pad: null, label: null, pop: 0,
  }));
  const upgrades = UPGRADES.map((def) => ({
    def, state: 'locked', level: 0, paid: 0, total: def.base, currency: 'cash', payT: 0, pad: null, label: null, pop: 0,
  }));

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
    const icon = z.currency === 'log' ? '🪵' : '💵';
    const left = Math.max(0, z.total - z.paid);
    const title = z.def.icon ? `${z.def.icon} ${z.def.name} LV${z.level + 1}` : z.def.name;
    z.label.innerHTML = `<div><span class="name">${title}</span>${icon} ${left}</div>`;
  }

  const unlocked = (req) => !req || req.every((id) => built.has(id));

  function refreshUnlocks() {
    for (const z of zones) if (z.state === 'locked' && unlocked(z.def.requires)) openPad(z, 0x7cff6b);
    for (const u of upgrades) if (u.state === 'locked' && unlocked(u.def.requires)) openPad(u, 0xffd34d);
  }

  const counter = { built: false, obj: null, pos: V(), pile: [], pileValue: 0, collectT: 0 };
  const grill = { built: false, obj: null, pos: V(), queue: 0, cookT: 0, out: 0, visuals: [], smokeT: 0 };
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
      towers.push({ obj, x: d.x, z: d.z, fireT: 0.5 });
    } else if (d.kind === 'wall') {
      const w = Models.makeWall(d.wall);
      obj = w.group;
      colliders.push(...w.colliders);
      wallColliders.push(...w.colliders);
    } else if (d.kind === 'grill') {
      obj = Models.makeGrill();
      obj.position.set(d.x, 0.12, d.z);
      addBox(d.x, d.z, 0.75, 0.75);
      addBox(d.x + 1.2, d.z, 0.5, 0.6);
      grill.built = true; grill.obj = obj; grill.pos.set(d.x, 0, d.z);
    } else if (d.kind === 'hire') {
      if (d.helper === 'lumberjack' && !woodpile.built) buildWoodpile(silent);
      spawnHelper(d.helper, new THREE.Vector3(d.x, 0, d.z), silent);
    }
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
      events.push({ type: 'build', id: d.id, t: clock });
      learn(z.currency === 'log' ? 'build' : 'buy');
      save();
    }
    refreshUnlocks();
  }

  function buildWoodpile(silent) {
    woodpile.built = true;
    woodpile.obj = Models.makeWoodpileBase();
    woodpile.obj.position.set(woodpile.pos.x, 0.12, woodpile.pos.z);
    scene.add(woodpile.obj);
    addBox(woodpile.pos.x, woodpile.pos.z, 0.75, 0.55);
    if (!silent) { woodpile.obj.scale.setScalar(0.01); popIns.push({ obj: woodpile.obj, t: 0 }); }
  }

  function pointForWall(side) {
    if (side === 'N') return new THREE.Vector3(0, 1, -CAMP_HALF);
    return new THREE.Vector3(side === 'W' ? -CAMP_HALF : CAMP_HALF, 1, 0);
  }

  function onPad(z) {
    return Math.abs(player.pos.x - z.def.x) < Models.PAD_SIZE / 2 + 0.15 &&
           Math.abs(player.pos.z - z.def.z) < Models.PAD_SIZE / 2 + 0.15;
  }

  let cash = 0;
  function setCash(v) { cash = v; hud.setCash(cash); }

  function payInto(z, dt) {
    if (!onPad(z)) { z.payT = 0; return; }
    z.payT -= dt;
    if (z.payT > 0) return;
    z.payT = ECONOMY.payTick;
    const target = new THREE.Vector3(z.def.x, 0.3, z.def.z);
    if (z.currency === 'log') {
      if (z.paid >= z.total) return;
      const it = popStack(player.c, 'log');
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
    u.total = Math.round(u.def.base * Math.pow(u.def.growth, u.level));
    if (u.label) refreshLabel(u);
    if (u.pad) Models.setPadProgress(u.pad, 0);
  }

  function levelUp(u) {
    levels[u.def.id]++;
    u.level++;
    const at = new THREE.Vector3(u.def.x, 1.5, u.def.z);
    fx.burst(at, 0xffd34d, 16, { speed: 5, up: 5, size: 0.16 });
    fx.text(player.pos.clone().setY(2.6), `${u.def.name} LV${u.level + 1}!`, 'warn', { life: 1.2, rise: 80 });
    fx.addShake(0.15);
    events.push({ type: 'upgrade', id: u.def.id, level: u.level, t: clock });
    learn('buy');
    if (u.def.id === 'bag') layoutStack(player.c);
    applyLevel(u);
    save();
  }

  // ---------- Paths: get around walls through the openings ----------
  // Returns the point to walk toward right now to eventually reach `to`.
  // The wall band itself counts as inside, so walkers in a doorway finish crossing
  // instead of flip-flopping (walls' outer face + body radius sits beyond +0.5).
  const isInside = (p) => Math.abs(p.x) < CAMP_HALF + 0.5 && Math.abs(p.z) < CAMP_HALF + 0.5;
  const clampIn = (v) => THREE.MathUtils.clamp(v, -CAMP_HALF + 1.3, CAMP_HALF - 1.3);

  function routeTarget(from, to) {
    const fromIn = isInside(from);
    if (fromIn === isInside(to)) return viaCorner(from, to);
    const H = CAMP_HALF;
    const mx = clampIn((from.x + to.x) / 2), mz = clampIn((from.z + to.z) / 2);
    const exits = [[{ x: mx, z: H - 1 }, { x: mx, z: H + 1 }]]; // south is always open
    exits.push(built.has('wallN') ? [{ x: 0, z: -H + 1 }, { x: 0, z: -H - 1 }] : [{ x: mx, z: -H + 1 }, { x: mx, z: -H - 1 }]);
    if (!built.has('wallW')) exits.push([{ x: -H + 1, z: mz }, { x: -H - 1, z: mz }]);
    if (!built.has('wallE')) exits.push([{ x: H - 1, z: mz }, { x: H + 1, z: mz }]);
    let best = null, bestLen = Infinity;
    for (const [inner, outer] of exits) {
      const [first, second] = fromIn ? [inner, outer] : [outer, inner];
      const len = dist2d(from, first) + dist2d(first, second) + dist2d(second, to);
      if (len < bestLen) { bestLen = len; best = [first, second]; }
    }
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
    const C = CAMP_HALF + 1.3;
    let best = to, bestLen = Infinity;
    for (const [x, z] of [[C, C], [C, -C], [-C, C], [-C, -C]]) {
      const c = { x, z };
      if (dist2d(from, c) < 0.4 || segBlocked(from, c)) continue;
      const len = dist2d(from, c) + dist2d(c, to);
      if (len < bestLen) { bestLen = len; best = new THREE.Vector3(x, 0, z); }
    }
    return best;
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
  function spawnHelper(kind, at, silent) {
    const def = HELPERS[kind];
    const obj = Models.makePlayer({ parka: def.parka, parkaDark: def.parkaDark, hat: def.hat, axe: kind === 'lumberjack' });
    obj.scale.setScalar(0.85);
    const h = {
      kind, def, obj, pos: at.clone(), facing: Math.PI, walkT: 0, swingT: 1,
      state: 'idle', target: null, c: null,
    };
    h.c = makeCarrier(obj, () => def.cap);
    obj.position.copy(h.pos);
    scene.add(obj);
    helpers.push(h);
    if (!silent) fx.burst(at.clone().setY(1), 0xffd34d, 14, { speed: 4, up: 4, size: 0.14 });
  }

  // Unstick: if an AI-driven walker barely moves while trying to, sidestep for a moment.
  // Returns the (possibly deflected) unit direction.
  function steer(ent, dx, dz) {
    if (ent.detourT > 0) {
      const s = ent.detourSign;
      const px = -dz * s, pz = dx * s;
      const x = px * 0.85 + dx * 0.15, z = pz * 0.85 + dz * 0.15;
      const l = Math.hypot(x, z) || 1;
      return [x / l, z / l];
    }
    return [dx, dz];
  }

  function trackStuck(ent, beforeX, beforeZ, intended, dt) {
    ent.detourT = Math.max(0, (ent.detourT || 0) - dt);
    const moved = Math.hypot(ent.pos.x - beforeX, ent.pos.z - beforeZ);
    if (intended > 0.001 && moved < intended * 0.3) ent.stuckT = (ent.stuckT || 0) + dt;
    else ent.stuckT = 0;
    if (ent.stuckT > 0.25 && !(ent.detourT > 0)) {
      ent.stuckT = 0;
      ent.detourT = 0.6;
      ent.detourSign = ent.detourSign === 1 ? -1 : 1; // alternate sides if still stuck
    }
  }

  // Move toward a point (routing around walls). Returns true when arrived.
  function walkTo(h, dest, dt, arriveDist = 0.35) {
    if (dist2d(h.pos, dest) < arriveDist) { h.moving = false; return true; }
    const step = routeTarget(h.pos, dest);
    const bx = h.pos.x, bz = h.pos.z;
    let dx = step.x - h.pos.x, dz = step.z - h.pos.z;
    const l = Math.hypot(dx, dz);
    let intended = 0;
    if (l > 0.001) {
      [dx, dz] = steer(h, dx / l, dz / l);
      intended = Math.min(l, h.def.speed * dt);
      h.pos.x += dx * intended; h.pos.z += dz * intended;
      h.facing = lerpAngle(h.facing, Math.atan2(dx, dz), Math.min(1, dt * 12));
    }
    resolve(h.pos, 0.38, true);
    trackStuck(h, bx, bz, intended, dt);
    h.moving = true;
    return false;
  }

  function faceTo(h, x, z, dt) {
    h.facing = lerpAngle(h.facing, Math.atan2(x - h.pos.x, z - h.pos.z), Math.min(1, dt * 12));
  }

  const spots = {
    woodpile: () => new THREE.Vector3(woodpile.pos.x, 0, woodpile.pos.z + 1.05),
    grillIn: () => new THREE.Vector3(grill.pos.x - 1.3, 0, grill.pos.z),
    grillOut: () => new THREE.Vector3(grill.pos.x + 1.2, 0, grill.pos.z + 1.15),
    counter: () => new THREE.Vector3(counter.pos.x, 0, counter.pos.z + 1.1),
  };

  function updateHelper(h, dt) {
    const c = h.c;
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
      const pickable = drops.filter((d) => (!d.claim || d.claim === h) && !(d.skipUntil > clock));
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
          if (dist2d(d.pos, h.pos) > 1.1 || (d.claim && d.claim !== h)) continue;
          drops.splice(i, 1);
          scene.remove(d.mesh);
          collectToBack(c, 'meat', d.mesh.position.clone(), d.mesh);
          if (d === h.target) h.target = null;
        }
        if (h.target) walkTo(h, h.target.pos, dt, 0.6);
      } else if (countOf(c, 'meat') > 0) {
        if (h.target) { h.target.claim = null; h.target = null; } // release the reservation
        h.state = 'deliver';
        const dest = grill.built ? spots.grillIn() : spots.counter();
        if (walkTo(h, dest, dt, 0.5)) {
          if (grill.built) feedGrill(c); else sellFrom(c, dt);
        }
      } else {
        h.state = 'idle';
        if (c.incoming === 0) walkTo(h, new THREE.Vector3(-1.2, 0, 3.2), dt, 0.6);
      }
    }

    if (h.kind === 'cashier') {
      const has = countOf(c, 'steak') + countOf(c, 'meat');
      if (h.state === 'deliver' || (has > 0 && (stackFree(c) <= 0 || grill.out === 0))) {
        h.state = 'deliver';
        if (walkTo(h, spots.counter(), dt, 0.5)) {
          sellFrom(c, dt);
          if (c.stack.length === 0 && c.incoming === 0) h.state = 'idle';
        }
      } else if (grill.built && grill.out > 0) {
        if (walkTo(h, spots.grillOut(), dt, 0.5)) takeFromGrill(c);
      } else if (c.incoming === 0) {
        walkTo(h, spots.counter().add(new THREE.Vector3(-1.4, 0, 0.4)), dt, 0.6);
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

  // ---------- Grill ----------
  function feedGrill(c) {
    if (c.actT > 0) return;
    const it = popStack(c, 'meat');
    if (!it) return;
    c.actT = 0.08;
    if (c === player.c) learn('grill');
    const top = grill.pos.clone().setY(0.8);
    fx.fly(it.mesh, it.worldPos, () => top, { duration: 0.25, arc: 1, onDone: () => { grill.queue++; } });
  }

  function takeFromGrill(c) {
    if (c.actT > 0 || grill.out <= 0 || stackFree(c) <= 0) return;
    c.actT = 0.08;
    grill.out--;
    if (c === player.c) learn('grillTake');
    const from = grill.pos.clone().add(new THREE.Vector3(1.2, 0.7, 0));
    if (grill.visuals.length > grill.out) {
      const v = grill.visuals.pop();
      from.copy(v.position);
      scene.remove(v);
    }
    collectToBack(c, 'steak', from);
  }

  function updateGrill(dt) {
    const fl = grill.obj.userData.flames;
    const busy = grill.queue > 0;
    fl[0].scale.y = (busy ? 0.75 : 0.45) + Math.sin(clock * 15) * 0.08;
    fl[1].scale.y = (busy ? 0.45 : 0.3) + Math.sin(clock * 19) * 0.05;
    grill.obj.userData.light.intensity = (busy ? 5 : 2.5) + Math.sin(clock * 11) * 0.6;
    if (!busy) { grill.cookT = 0; return; }
    grill.cookT += dt;
    grill.smokeT -= dt;
    if (grill.smokeT <= 0) {
      grill.smokeT = 0.18;
      fx.burst(grill.pos.clone().setY(1), 0xdfe6ec, 1, { speed: 0.4, up: 3.5, size: 0.2, life: 0.9 });
    }
    if (grill.cookT >= ECONOMY.cookTime) {
      grill.cookT = 0;
      grill.queue--;
      grill.out++;
      stats.cooked++;
      if (grill.visuals.length < 12) {
        const i = grill.visuals.length;
        const s = Models.makeSteak();
        s.position.set(grill.pos.x + 1.2 + ((i % 2) - 0.5) * 0.4, 0.72 + Math.floor(i / 2) * 0.12, grill.pos.z + (Math.floor(i / 2) % 3 - 1) * 0.02);
        s.rotation.y = Math.PI / 2;
        scene.add(s);
        grill.visuals.push(s);
      }
      fx.burst(grill.pos.clone().add(new THREE.Vector3(1.2, 0.9, 0)), 0xffc36b, 5, { speed: 2, up: 3, size: 0.08 });
    }
  }

  // ---------- Selling ----------
  // Wood still needed by the build squares that are open right now.
  const logsNeeded = () => zones.reduce((n, z) => n + (z.state === 'open' && z.currency === 'log' ? z.total - z.paid : 0), 0);

  function sellFrom(c, dt) {
    c.sellT -= dt;
    if (c.sellT > 0) return;
    // meat first (steaks, then raw); then any wood nothing can use anymore, so the bag never gets stuck full
    let type = countOf(c, 'steak') ? 'steak' : countOf(c, 'meat') ? 'meat' : null;
    if (!type && c.isPlayer && countOf(c, 'log') > logsNeeded()) type = 'log';
    if (!type) return;
    const it = popStack(c, type);
    if (!it) return;
    c.sellT = ECONOMY.sellTick;
    const price = type === 'steak' ? ECONOMY.steakPrice : type === 'meat' ? ECONOMY.meatPrice : ECONOMY.logPrice;
    if (c.isPlayer) learn(type === 'log' ? 'spareWood' : 'sell');
    const top = counter.pos.clone().setY(1.1);
    fx.fly(it.mesh, it.worldPos, () => top, {
      duration: 0.25, arc: 1,
      onDone: () => { addToPile(price); stats.sold++; },
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
        onDone: () => { setCash(cash + value); hud.bumpCash(); learn('cash'); fx.text(player.pos.clone().setY(2.4), `+$${value}`, 'cash', { life: 0.6, rise: 40 }); },
      });
    }
  }

  // ---------- Bears ----------
  const bears = [];
  const drops = [];

  function spawnBear(mega) {
    const def = mega ? MEGA_BEAR : BEAR;
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4; // mostly from the north
    const obj = Models.makeBear(mega);
    obj.scale.setScalar(def.scale);
    const pos = new THREE.Vector3(Math.cos(a) * WAVES.spawnRadius, 0, Math.sin(a) * WAVES.spawnRadius);
    obj.position.copy(pos);
    const bar = Models.makeHealthBar(mega ? 1.6 : 1, 0xff4d4d);
    bar.visible = false;
    scene.add(obj, bar);
    bears.push({ obj, pos, def, mega, hp: def.hp, attackT: def.attackRate, bar, flash: 0, lunge: 0, walkT: Math.random() * 6, dying: 0, vel: V() });
  }

  function hurtBear(b, dmg, from) {
    if (b.dying) return;
    b.hp -= dmg;
    b.flash = 0.12;
    b.bar.visible = true;
    Models.setHealth(b.bar, b.hp / b.def.hp);
    const at = b.pos.clone().setY(1 * b.def.scale);
    fx.burst(at, 0xffffff, 5, { speed: 3, up: 3 });
    fx.burst(at, 0xe04848, 3, { speed: 3, up: 3, size: 0.09 });
    fx.text(at.clone().setY(1.8 * b.def.scale), String(dmg), 'hurt', { life: 0.6, rise: 40 });
    if (from) {
      tmpA.subVectors(b.pos, from).setY(0).normalize().multiplyScalar(b.mega ? 0.15 : 0.45);
      b.pos.add(tmpA);
    }
    if (b.hp <= 0) {
      killBear(b);
      if (from) learn('fight'); // `from` is set only for the player's axe (towers pass null)
    }
  }

  function killBear(b) {
    b.dying = 0.001;
    b.bar.visible = false;
    fx.burst(b.pos.clone().setY(0.8), 0xffffff, b.mega ? 30 : 14, { speed: 5, up: 5, size: 0.2 });
    fx.addShake(b.mega ? 0.5 : 0.12);
    if (b.mega) fx.text(b.pos.clone().setY(3), 'MEGA BEAR DOWN!', 'warn', { life: 1.5, rise: 90 });
    events.push({ type: 'kill', mega: b.mega, t: clock });
    stats.kills++;
    for (let i = 0; i < b.def.meat; i++) {
      const mesh = Models.makeMeat();
      const land = b.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2.2, 0.2, (Math.random() - 0.5) * 2.2));
      // never inside or hugging a wall, a building or a tree trunk: leave room to walk up to it
      resolve(land, 0.8, true);
      fx.fly(mesh, b.pos.clone().setY(0.8), () => land, {
        duration: 0.45, arc: 1.6,
        onDone: (m) => { m.position.copy(land); scene.add(m); drops.push({ mesh: m, type: 'meat', pos: land, t: Math.random() * 6, claim: null }); },
      });
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
        if (k >= 1) { scene.remove(b.obj, b.bar); bears.splice(i, 1); }
        continue;
      }
      const toP = tmpA.subVectors(P.pos, b.pos).setY(0);
      const dist = toP.length();
      const reach = b.def.radius + PLAYER.radius + 0.35;
      let moving = false;
      if (!P.dead && dist > reach) {
        toP.normalize();
        b.vel.copy(toP).multiplyScalar(b.def.speed);
        moving = true;
      } else b.vel.set(0, 0, 0);
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
      if (dist > 0.01) b.obj.rotation.y = lerpAngle(b.obj.rotation.y, Math.atan2(P.pos.x - b.pos.x, P.pos.z - b.pos.z), Math.min(1, dt * 8));

      if (!P.dead && dist <= reach + 0.1) {
        b.attackT -= dt;
        if (b.attackT <= 0) {
          b.attackT = b.def.attackRate;
          b.lunge = 1;
          hurtPlayer(b.def.damage);
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
    }
  }

  function hurtPlayer(dmg) {
    const P = player;
    P.hp -= dmg;
    P.sinceHurt = 0;
    fx.addShake(0.2);
    fx.text(P.pos.clone().setY(2.2), `-${dmg}`, 'hurt', { life: 0.6, rise: 40 });
    fx.burst(P.pos.clone().setY(1), 0xe04848, 5, { speed: 3, up: 3, size: 0.09 });
    hud.flashHurt();
    if (P.hp <= 0) {
      P.hp = 0;
      P.dead = true;
      P.obj.rotation.z = Math.PI / 2;
      events.push({ type: 'defeat', wave: waves.n, t: clock });
      hud.defeat(true);
    }
  }

  // ---------- Towers ----------
  function updateTowers(dt) {
    for (const t of towers) {
      t.fireT -= dt;
      let target = null, best = TOWER.range;
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
          t.fireT = TOWER.fireRate;
          const arrow = Models.makeArrow();
          arrow.position.set(t.x, 2.7, t.z);
          scene.add(arrow);
          arrows.push({ obj: arrow, target, last: target.pos.clone() });
        }
      } else head.rotation.y += dt * 0.5;
    }
    for (let i = arrows.length - 1; i >= 0; i--) {
      const a = arrows[i];
      if (bears.includes(a.target) && !a.target.dying) a.last.copy(a.target.pos).setY(0.9 * a.target.def.scale);
      const dir = tmpA.subVectors(a.last, a.obj.position);
      const d = dir.length();
      const step = TOWER.arrowSpeed * dt;
      if (d <= step + 0.2) {
        if (bears.includes(a.target) && !a.target.dying) hurtBear(a.target, TOWER.damage, null);
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
  function hitTree(t, c) {
    if (!t.alive || stackFree(c) <= 0) return;
    t.hp--;
    t.shake = 0.25;
    const at = new THREE.Vector3(t.x, 1, t.z);
    fx.burst(at, 0xd09a5e, 5, { speed: 3, up: 3, size: 0.1 });
    fx.burst(at.clone().setY(2), 0xffffff, 5, { speed: 2, up: 1, size: 0.1 });
    collectToBack(c, 'log', at);
    stats.logs++;
    if (c === player.c && ++playerChops >= 3) learn('chop');
    if (t.hp <= 0) {
      t.alive = false;
      t.claim = null;
      t.regrow = TREE.regrow;
      t.obj.visible = false;
      t.stump.visible = true;
      fx.burst(at.clone().setY(1.5), 0x2f6f5a, 10, { speed: 4, up: 4, size: 0.18 });
      fx.burst(at.clone().setY(2), 0xffffff, 10, { speed: 4, up: 4, size: 0.14 });
    }
  }

  // ---------- Waves ----------
  const waves = { n: 0, timer: WAVES.firstDelay, total: WAVES.firstDelay, queue: [], gap: 0 };

  function startWave() {
    waves.n++;
    const count = WAVES.countFor(waves.n);
    for (let i = 0; i < count; i++) waves.queue.push(false);
    const mega = waves.n % WAVES.megaEvery === 0;
    if (mega) waves.queue.push(true);
    hud.banner(mega ? 'MEGA BEAR INCOMING!' : `WAVE ${waves.n}: BEARS!`);
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
    if (player.hp < PLAYER.maxHp * 0.45 && bearDist < 7) return new THREE.Vector3(0, 0, 2.5);
    if (bearDist < 5) return nearestBear.pos;
    const full = stackFree(c) <= 0;
    const logs = countOf(c, 'log');
    // The grill comes first: it unlocks the automation chain. Buildings and hires before upgrades.
    const openLog = zones.filter((z) => z.state === 'open' && z.currency === 'log');
    const logZone = openLog.find((z) => z.def.kind === 'grill') || openLog[0];
    const byRemaining = (a, b) => (a.total - a.paid) - (b.total - b.paid);
    const cashZone = zones.filter((z) => z.state === 'open' && z.currency === 'cash' && cash > 0).sort(byRemaining)[0]
      || upgrades.filter((z) => z.state === 'open' && cash > 0).sort(byRemaining)[0];
    const drop = drops.filter((d) => !d.claim).sort((a, b) => a.pos.distanceTo(p) - b.pos.distanceTo(p))[0];
    if (counter.pileValue > 0) return new THREE.Vector3(counter.pos.x + 1.5, 0, counter.pos.z + 0.3);
    if (countOf(c, 'steak') && counter.built) return spots.counter();
    if (countOf(c, 'meat') && (full || !drop)) return grill.built ? spots.grillIn() : counter.built ? spots.counter() : null;
    if (logs && logZone && (full || logs >= logZone.total - logZone.paid || (woodpile.count === 0 && logs >= 10))) return new THREE.Vector3(logZone.def.x, 0, logZone.def.z);
    if (cashZone && cash >= Math.min(20, cashZone.total - cashZone.paid)) return new THREE.Vector3(cashZone.def.x, 0, cashZone.def.z);
    if (grill.out > 0 && !full && !helpers.some((h) => h.kind === 'cashier')) return spots.grillOut();
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
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        v: 1, cash, built: [...built], levels, wave: waves.n, woodpile: woodpile.count,
        paid: Object.fromEntries([...zones, ...upgrades].filter((z) => z.state === 'open' && z.paid > 0).map((z) => [z.def.id, z.paid])),
      }));
    } catch { /* storage unavailable: play without saving */ }
  }

  function load() {
    if (!useSave) return false;
    let s = null;
    try { s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch { s = null; }
    if (!s || s.v !== 1) return false;
    for (const z of zones) if (s.built?.includes(z.def.id)) construct(z, true);
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
    layoutStack(player.c);
    return true;
  }

  function resetSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
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
    const logs = countOf(c, 'log'), meat = countOf(c, 'meat'), steaks = countOf(c, 'steak');
    const tips = [];
    const bear = bears.filter((b) => !b.dying).sort((a, b) => dist2d(a.pos, P.pos) - dist2d(b.pos, P.pos))[0];
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
    if (counter.built && logs > logsNeeded()) tips.push({ key: 'spareWood', icon: '🪵', text: 'Spare wood? Sell it at the SELL TABLE for $1 each', pos: counter.pos.clone() });

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
  stationLabel('GRILL<small>raw meat → $12 steak</small>', () => grill.pos.clone().setY(2), () => grill.built, 'grill');
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
    const ud = P.obj.userData;

    // --- movement ---
    let mx = input.move.x, mz = input.move.z;
    const autoDriving = auto.on && !P.dead;
    if (autoDriving) {
      auto.used = true;
      const goal = autopilotGoal();
      if (goal) {
        const step = routeTarget(P.pos, goal);
        const dx = step.x - P.pos.x, dz = step.z - P.pos.z;
        const l = Math.hypot(dx, dz);
        if (l > 0.45) [mx, mz] = steer(P, dx / l, dz / l); else { mx = mz = 0; }
      } else { mx = mz = 0; }
    }
    if (P.dead) {
      mx = mz = 0;
      // the autopilot presses TRY AGAIN by itself so long recordings keep going
      if (auto.on) { auto.deadT = (auto.deadT || 0) + dt; if (auto.deadT > 1.5) { auto.deadT = 0; retry(); } }
    }
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
        if (P.maxMsgT <= 0) { fx.text(P.pos.clone().setY(2.8), 'MAX', 'warn'); P.maxMsgT = 1.2; }
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
    hud.setHp(P.hp / PLAYER.maxHp);

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
      if (!P.dead && stackFree(P.c) > 0 && d.pos.distanceTo(P.pos) < PLAYER.pickupRange) {
        scene.remove(d.mesh);
        drops.splice(i, 1);
        collectToBack(P.c, d.type, d.mesh.position.clone(), d.mesh);
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
    if (grill.built) {
      updateGrill(dt);
      if (!P.dead && dist2d(P.pos, grill.pos) < 2.0) {
        if (countOf(P.c, 'meat')) feedGrill(P.c);
        else takeFromGrill(P.c);
      }
    }
    if (woodpile.built && !P.dead && dist2d(P.pos, woodpile.pos) < 1.6 && P.c.actT <= 0) {
      P.c.actT = 0.06;
      takeWood(P.c);
    }

    // --- workers, bears, towers ---
    for (const h of helpers) updateHelper(h, dt);
    updateBears(dt);
    updateTowers(dt);

    // --- waves ---
    if (!P.dead) {
      waves.timer -= dt;
      if (waves.timer <= 0) startWave();
      if (waves.queue.length) {
        waves.gap -= dt;
        if (waves.gap <= 0) { spawnBear(waves.queue.shift()); waves.gap = WAVES.spawnGap; }
      }
    }
    const aliveBears = bears.filter((b) => !b.dying).length;
    hud.setWave(aliveBears > 0 ? `WAVE ${waves.n} · ${aliveBears} 🐻` : `WAVE ${waves.n + 1} IN ${Math.ceil(waves.timer)}s`, 1 - waves.timer / waves.total);

    // campfire flicker
    const fl = campfire.userData.flames;
    fl[0].scale.y = 0.6 + Math.sin(clock * 17) * 0.08 + Math.sin(clock * 7.3) * 0.05;
    fl[1].scale.y = 0.35 + Math.sin(clock * 21) * 0.06;
    campfire.userData.light.intensity = 5 + Math.sin(clock * 13) * 0.8;

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
    hitTree(target, player.c);
  }

  function retry() {
    const P = player;
    P.dead = false;
    P.hp = PLAYER.maxHp;
    P.pos.copy(SPAWN);
    P.obj.rotation.z = 0;
    for (const it of P.c.stack) P.obj.userData.back.remove(it.mesh);
    P.c.stack.length = 0;
    layoutStack(P.c);
    for (const b of bears) scene.remove(b.obj, b.bar);
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
    skipToWave() { waves.timer = 0.01; },
    // dev/test helpers
    give(type, n = 1) { for (let i = 0; i < n && stackFree(player.c) > 0; i++) pushStack(player.c, type, makeItem(type)); },
    count: (type) => countOf(player.c, type),
    counter, logsNeeded,
  };
}
