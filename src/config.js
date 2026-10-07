// All gameplay tuning lives here so balancing never means hunting through code
// (per-world numbers: src/worlds.js).
import { world } from './worlds.js';

// camp floor spans -7.5..7.5 on x and z (v0.4.3: was 6, everything spread ×1.25 so the lanes are wider)
export const CAMP_HALF = 7.5;

export const PLAYER = {
  speed: 6,
  radius: 0.45,
  maxHp: 30,         // v0.4.5: 30 (was 20), a safety margin for the first minutes
  regenDelay: 3,     // seconds without damage before regen starts
  regenRate: 3,      // hp per second
  swingCooldown: 0.42,
  chopRange: 1.7,
  attackRange: 2.1,
  pickupRange: 2.2,
  baseBag: 12,
  bagPerLevel: 4,
  // Linear: +1.5 damage per axe level from 2 (2, 3.5, 5, 6.5…), so a wave 1 bear (3 hp) falls in
  // 2 hits. With one level per wave it keeps pace with the bears' +2 hp per wave: 2 hits all game.
  damage: (axeLevel) => 2 + axeLevel * 1.5,
  // logs per axe hit on a tree: 1, then 2 from AXE LV5 (level 4), 3 from LV9 = one-shot trees
  chopPower: (axeLevel) => Math.min(3, 1 + Math.floor(axeLevel / 4)),
  // selling gets faster with the bag level: +15% speed per level, then 2-3 items per tick
  sellSpeed: (bagLevel) => 1 + 0.15 * bagLevel,
  sellBatch: (bagLevel) => Math.min(3, 1 + Math.floor(bagLevel / 6)),
};

export const TREE = {
  hp: 3,             // hits to fell; each hit drops one log
  regrow: 10,        // seconds
  radius: 0.5,
  count: 130,
  minDist: 9,
  maxDist: 34,
  spacing: 1.9,
};

// wallHit: damage per swing to a wall that's in the way (bears chew through fences → repairs cost wood).
// It grows like the bear's hp: × WAVES.hpScale for bears, × WAVES.bossScale for bosses (and the thrower's logs).
export const BEAR = {
  // damage per bite grows with the wave n: 0.5 at wave 1, 1 at wave 6, 2 from wave 16 on
  hp: 3, speed: 3.1, damage: (n) => Math.min(2, 0.4 + n * 0.1), attackRate: 1, radius: 0.6, meat: 3, scale: 1, wallHit: 1,
};

// Bosses: one every 3 waves (see WAVES.bossesFor). `cash` = loot bag dropped on death.
// Tuned to add a challenge without being unfair: every boss can be beaten with the axe
// alone at low upgrade levels, and the towers help against all of them except armor.
export const BOSSES = {
  mega: { name: 'MEGA BEAR', hp: 40, speed: 2.5, damage: 4, attackRate: 1.3, radius: 1.05, meat: 8, scale: 1.8, cash: 25, wallHit: 6 },
  // arrows bounce off the plates; the axe breaks them (armor points first, then hp)
  armored: { name: 'ARMORED BEAR', hp: 32, armor: 24, plates: 3, plateDrops: 2, speed: 2.3, damage: 3, attackRate: 1.35, radius: 1.0, meat: 6, scale: 1.7, cash: 40, wallHit: 6 },
  // bite poisons (see POISON); bursts into a poison cloud on death; drops a poison vial
  // (the vial upgrades a ballista to poison bolts)
  poison: { name: 'POISON BEAR', hp: 30, speed: 3.2, damage: 2, attackRate: 1.2, radius: 0.85, meat: 4, vial: 1, scale: 1.45, cash: 40, wallHit: 4 },
  // keeps its distance and lobs logs at the closest target: a wall or you
  thrower: { name: 'LOG THROWER', hp: 34, speed: 2.6, damage: 2, attackRate: 1.2, radius: 0.9, meat: 6, scale: 1.5, cash: 50, wallHit: 4,
    // 25 per log (× the boss scale): a fresh 250 hp wall falls in 10 logs (~28 s) if nobody goes out to stop it
    range: 9, throwEvery: 2.8, firstThrow: 1.2, wallDamage: 25, hitDamage: 3, heartwood: 1 },
  // World 1 final boss (wave world().finalWave = 15), ~45 s fight with the expected gear. Phase 1: ice armor
  // (arrows bounce, the axe or a ballista breaks it) + a ground slam every `slamEvery` s, warned by a red
  // ring `slamWarn` s before. Phase 2 below `phase2` of its hp: roars, calls `summon` bears, +20% speed,
  // throws ice blocks at the walls. Its death wins the map (victory screen, the island on the world map).
  king: { name: 'BEAR KING', hp: 400, armor: 150, plates: 3, plateDrops: 2, speed: 2.4, damage: 3, attackRate: 1.4, radius: 1.38, meat: 12, scale: 2.4, cash: 300, wallHit: 8, final: true,
    slamEvery: 6, slamWarn: 1, slamRadius: 3.6, slamReach: 6, slamDamage: 6, slamPush: 2.5,
    phase2: 0.5, rage: 1.2, summon: 3,
    // ice blocks: like the log thrower's logs (× the boss scale on walls), 12 m reach, no wood left behind
    iceEvery: 4, iceRange: 12, iceWallDamage: 30, iceHit: 4 },
  // ---- island (world 2) ----
  // same role as the log thrower: lobs coconuts at walls, ballistas and you; drops heartwood (ballista)
  coco: { name: 'COCONUT THROWER', hp: 34, speed: 2.6, damage: 2, attackRate: 1.2, radius: 0.9, meat: 6, scale: 1.5, cash: 50, wallHit: 4,
    range: 9, throwEvery: 2.8, firstThrow: 1.2, wallDamage: 25, hitDamage: 3, heartwood: 1, throws: 'coconut' },
  // replaces the poison bear: keeps its distance and throws small monkeys at you or a worker (MONKEYS);
  // drops the vial (poison bolts)
  monkey: { name: 'MONKEY CHIEF', hp: 30, speed: 3.0, damage: 2, attackRate: 1.2, radius: 0.85, meat: 4, scale: 1.05, cash: 40, wallHit: 4,
    range: 8, throwEvery: 5, firstThrow: 1.5, vial: 1, throws: 'monkey' },
  // World 2 final boss (wave 18), ~45 s fight. Phase 1: every `rollEvery` s it curls up in its shell
  // (invulnerable, `curlTime` s warning) and chains two moves (owner's picks, 2026-10-07):
  //  - pinball run: `rollChain` rolls at `rollSpeed` m/s bouncing off walls (the last one aimed at you);
  //    `rollDamage` × boss scale to each wall hit, `rollHit` + a push if it runs you over
  //  - shell spin (only when you're within `spinRange`): `spinVolleys` rings of `spinShells` sharp shells
  //    (lines on the ground `spinWarn` s before, the 2nd ring fills the gaps); `spinHit` to you, walls stop
  //    them (`spinWallDamage` × boss scale): inside the camp you're safe (owner, 2026-10-07)
  // Not 0.5 m closer to you in `stuckRoll` s (blocked by the camp's buildings), it starts its move at once,
  // rolling straight at you. Then it sits dizzy for `dizzy` s: the moment to hit it. Phase 2 below `phase2`: the shell breaks for
  // good, it gets `rage` × faster and bites `rageAttack` × as often.
  shell: { name: 'SHELL BEAR', hp: 440, speed: 2.3, damage: 3, attackRate: 1.4, radius: 1.3, meat: 12, scale: 2.2, cash: 300, wallHit: 8, final: true,
    rollEvery: 6, stuckRoll: 1, curlTime: 0.8, rollSpeed: 9, rollMax: 2.5, rollChain: 3, rollDamage: 70, rollHit: 10, rollPush: 3, dizzy: 1.8,
    spinWarn: 1, spinShells: 10, spinVolleys: 2, spinGap: 0.5, spinRange: 14, spinHit: 3, spinWallDamage: 20,
    phase2: 0.5, rage: 1.4, rageAttack: 0.7 },
};

// Reward for beating a world (owner, 2026-10-06): the camp of every later world starts with
// `freeBagLevels` bag levels per world beaten before it. They're free: the bag's price ignores them.
export const REWARDS = { freeBagLevels: 2 };

// Small monkeys thrown by the monkey chief. Each one clinging to you or a worker slows them by
// `slowEach` (at most `slowCap`, so you can always reach the water); wading in the sea shakes them all
// off. On you they bite `biteShare` of a bear's bite every `biteEvery` s (workers never get hurt).
// A monkey that misses runs after you for `life` s. At most `perHost` on anyone. When you walk up to a
// worker, its monkeys jump onto you. They all run away when the chief dies.
export const MONKEYS = { slowEach: 0.08, slowCap: 0.25, biteShare: 0.2, biteEvery: 1.5, perHost: 4, run: 4.5, life: 15 };

// Poison never wears off: it keeps ticking until you die or reach the campfire
// (1 hp/s with 30 hp = about 30 s to get there).
export const POISON = {
  dps: 1,            // damage per second while poisoned (ignores armor)
  bite: Infinity,    // a bite poisons you until you're cured at the campfire
  cloud: Infinity,   // so does the death cloud
  cloudRadius: 2.8,
  cloudDelay: 0.9,   // warning time before the cloud bursts
  campfireRadius: 1.9,
  campfireHeal: 5,   // hp per second while warming up at the campfire
  // once it has fully healed you, the fire goes pale and recharges for 5 s (no heal, no cure)
  campfireRecharge: 5,
};

// Walls get sturdier with the axe level L too: +50 hp per level (standing walls gain it at once).
// One log repairs 8% of the wall (20 hp at 250, 200 hp at 2500): a broken wall always costs ~13 logs.
export const WALL = { hp: (L) => 250 + L * 50, repairShare: 0.08 };

// Forged at the ARMOR pad with plates from armored bears. Armor absorbs hits before hp.
export const ARMOR = { perLevel: 4, regen: 2 };

// Hired workers carry 30% of what your bag holds (upgrading the bag upgrades them too)
// and walk a little faster as you level the bag.
export const WORKERS = { share: 0.3, speedPerBagLevel: 0.03, maxSpeedBonus: 0.5 };

// Each map ends: its final boss (the Bear King on the polar map) comes at world().finalWave; beating
// it wins the map, then the waves go on (endless). Saves already past it meet it at their next boss wave.
// Per-world numbers (final wave, boss order, difficulty) live in src/worlds.js.

export const WAVES = {
  firstDelay: 30,
  // 26 s in world 1, 1 s less per world down to 20
  get interval() { return world().interval; },
  spawnRadius: 30,
  // extra seconds before the next wave for each bear still alive when the countdown ends
  // (elastic timer: falling behind never snowballs)
  perAliveBear: 1,
  // capped so late waves stay smooth on phones; bears get tougher every wave instead:
  // linear, +2 hp per wave for a 3 hp bear in world 1: 3, 5, 7… 21 at wave 10, 41 at 20, 91 at 45
  // (+2.3 per wave in world 2, +4.7 in world 10: world().bearHpStep)
  countFor: (n) => Math.min(20, 1 + n),
  hpScale: (n) => 1 + (n - 1) * (world().bearHpStep / BEAR.hp),
  spawnGap: 0.7,
  // A boss every 3 waves, in the world's boss order. World 1: one at a time up to wave 24 (the endless
  // waves after the King rotate them alone), a pair of the same class (27-36), then two different
  // classes (39+). Later worlds: two different bosses from world().twoBossesFrom.
  bossesFor(n) {
    if (n % 3) return [];
    const W = world(), O = W.bossOrder, L = O.length, k = n / 3;
    if (n < Math.min(W.twoBossesFrom, 27)) return [O[(k - 1) % L]];
    if (W.n === 1 && k <= 12) return [O[(k - 1) % L], O[(k - 1) % L]];
    return [O[(k - 1) % L], O[k % L]];
  },
  // bosses scale with the wave, linear: ×1.0 at wave 3, ×2.2 at wave 9, ×3.4 at wave 15, ×9.4 at wave 45
  bossScale: (n) => 1 + (n - 3) * 0.2,
  // a boss's death sends out a shockwave that stuns every bear on the map (seconds)
  bossStun: 4,
};

// Island tide (src/tide.js): the shoreline, measured from the camp's walls (+ the annex once built),
// swings between `low` m (the whole island is dry) and `high` m (owner, 2026-10-06: at high tide the sea
// surrounds the camp, only the camp and what's inside stay dry) once every `periodWaves` waves.
// Wading slows you, the workers and the bears to `slow`; flooded palms can't be chopped.
// Each low tide leaves `driftwood` logs and a $`loot` bag on the beach.
export const TIDE = { high: 1.5, low: 28, periodWaves: 2, slow: 0.5, driftwood: 4, loot: 10 };

// Towers get stronger with the axe level L (no extra menu): an arrow deals damage(L).
// Ballista bolts (damage, armor damage, poison) are multiplied by the same factor.
export const TOWER = { range: 8, fireRate: 0.8, damage: (L) => 1 + L * 0.5, arrowSpeed: 22 };

// An arrow tower upgraded with heartwood (only dropped by the log thrower) + wood + cash.
// 12 m reach = just enough to hit a log thrower lobbing at the walls from 9 m.
// Heavy bolts crack armor instead of bouncing off it. Ballistas can be destroyed: they
// fall back to an arrow tower and drop their heartwood (and vial) so you can rebuild.
export const BALLISTA = {
  // hp grows like the walls' (150 at axe level 0, ×10 at level 45)
  range: 12, fireRate: 1.4, damage: 9, armorDamage: 4, boltSpeed: 26, hp: 150,
  cost: { heartwood: 1, logs: 20, cash: 250 },
  // poison bolts: needs a vial from the poison bear
  poisonCost: { vial: 1, logs: 15, cash: 150 },
  poisonDps: 2, poisonTime: 5,
};

// Improved oven in the camp expansion: cooks twice as fast, smoked meat sells for 3× a steak.
export const SMOKER = { cookTime: 0.4, price: 36 };

export const ECONOMY = {
  meatPrice: 5,
  steakPrice: 12,    // cooked meat from the grill sells for more
  spicyPrice: 30,    // grilled toxic meat (from the poison bear)
  toxicPrice: 0,     // raw toxic meat: nobody wants it
  logPrice: 1,       // spare wood (nothing left to build with it) sells at the table
  cookTime: 0.8,     // seconds per piece on the grill
  payTick: 0.05,     // seconds between items flying into a zone
  sellTick: 0.09,
};

// Hired workers. They ignore bears (bears only hunt the player).
export const HELPERS = {
  lumberjack: { speed: 3.6, cap: 5, chopRate: 0.9, parka: 0x3fa34d, parkaDark: 0x2e7a38, hat: 0xffd34d },
  carrier: { speed: 4.2, cap: 6, parka: 0x9a6a3e, parkaDark: 0x6e4a2a, hat: 0x3a3a44 },
  cashier: { speed: 4.0, cap: 8, parka: 0x8a5cd6, parkaDark: 0x6441a8, hat: 0xffffff },
};

// Where logs from hired lumberjacks are dropped. The player picks them up from here.
export const WOODPILE = { x: -3.25, z: -3.25 };

// The camp expansion (annex) sits behind the south wall: x -7.5..7.5, z 7.5..ANNEX_END.
export const ANNEX_END = 17.5;

// Wall lines. axis 'x' = runs along x at z = `at`; axis 'z' = runs along z at x = `at`.
// gate: a 3.2 m opening in the middle (north + south of the camp, and the annex's far end).
export const WALLS = {
  N: { axis: 'x', at: -7.5, from: -7.5, to: 7.5, gate: true },
  S: { axis: 'x', at: 7.5, from: -7.5, to: 7.5, gate: true },
  W: { axis: 'z', at: -7.5, from: -7.5, to: 7.5 },
  E: { axis: 'z', at: 7.5, from: -7.5, to: 7.5 },
  AW: { axis: 'z', at: -7.5, from: 7.5, to: ANNEX_END },
  AE: { axis: 'z', at: 7.5, from: 7.5, to: ANNEX_END },
  AS: { axis: 'x', at: ANNEX_END, from: -7.5, to: 7.5, gate: true },
};

// Build zones: predefined squares on the ground. `requires` gates unlocking.
// Towers sit flush in the corners (no pocket behind them where meat could fall out of reach).
// kind: what gets built. cost: { logs } or { cash }. x/z is the pad position;
// walls are built along the camp edge named by `wall` (N has a gate in the middle).
export const ZONES = [
  { id: 'counter', kind: 'counter', name: 'SELL TABLE', x: 4.0, z: 2.25, cost: { logs: 8 } },
  { id: 'wallN', kind: 'wall', name: 'NORTH WALL', x: -3.0, z: -6.1, cost: { logs: 18 }, requires: ['counter'], wall: 'N' },
  { id: 'tower1', kind: 'tower', name: 'ARROW TOWER', x: -6.6, z: -6.6, cost: { cash: 20 }, requires: ['counter'] },
  { id: 'wallW', kind: 'wall', name: 'WEST WALL', x: -6.0, z: -2.25, cost: { logs: 22 }, requires: ['wallN'], wall: 'W' },
  { id: 'wallE', kind: 'wall', name: 'EAST WALL', x: 6.0, z: -4.7, cost: { logs: 22 }, requires: ['wallN'], wall: 'E' },
  { id: 'tower2', kind: 'tower', name: 'ARROW TOWER', x: 6.6, z: -6.6, cost: { cash: 60 }, requires: ['tower1'] },
  { id: 'tower3', kind: 'tower', name: 'ARROW TOWER', x: -6.6, z: 6.6, cost: { cash: 120 }, requires: ['tower2', 'wallW'] },
  // v0.2: cooking + automation chain (lumberjack → woodpile, hunter → grill, cashier → counter)
  { id: 'grill', kind: 'grill', name: 'GRILL', x: 4.0, z: -3.0, cost: { logs: 25 }, requires: ['counter'] },
  { id: 'hireLumber', kind: 'hire', helper: 'lumberjack', name: 'HIRE LUMBERJACK', x: 3.0, z: -6.1, cost: { cash: 60 }, requires: ['counter'] },
  { id: 'hireCarrier', kind: 'hire', helper: 'carrier', name: 'HIRE HUNTER', x: -6.0, z: 0.75, cost: { cash: 120 }, requires: ['grill'] },
  { id: 'hireCashier', kind: 'hire', helper: 'cashier', name: 'HIRE CASHIER', x: 6.0, z: 0.5, cost: { cash: 200 }, requires: ['grill', 'hireCarrier'] },
  // v0.4: close the 4th side (gate in the middle), then expand the camp to the south
  { id: 'wallS', kind: 'wall', name: 'SOUTH WALL', x: -3.0, z: 3.25, cost: { logs: 22 }, requires: ['wallN'], wall: 'S' },
  { id: 'expandWood', kind: 'milestone', name: 'EXPANSION: FOUNDATIONS', x: 3.25, z: 9.75, cost: { logs: 60 }, requires: ['wallS'] },
  { id: 'expand', kind: 'expand', name: 'EXPAND THE CAMP', x: 3.25, z: 9.75, cost: { cash: 500 }, requires: ['expandWood'] },
  // the annex: its own walls, 2 more workers, a smokehouse and 2 more tower spots
  { id: 'wallAW', kind: 'wall', name: 'ANNEX WEST WALL', x: -6.0, z: 9.5, cost: { logs: 22 }, requires: ['expand'], wall: 'AW' },
  { id: 'wallAE', kind: 'wall', name: 'ANNEX EAST WALL', x: 6.0, z: 9.5, cost: { logs: 22 }, requires: ['expand'], wall: 'AE' },
  { id: 'wallAS', kind: 'wall', name: 'ANNEX SOUTH WALL', x: -3.0, z: 15.75, cost: { logs: 26 }, requires: ['expand'], wall: 'AS' },
  { id: 'smoker', kind: 'smoker', name: 'SMOKEHOUSE', x: 4.0, z: 12.5, cost: { logs: 40 }, requires: ['expand'] },
  // annex workers start at the far end of the annex; the 2nd hunter always feeds the smokehouse
  { id: 'hireLumber2', kind: 'hire', helper: 'lumberjack', name: 'HIRE LUMBERJACK', x: -6.0, z: 12.25, spawn: { x: -3, z: 16.3 }, cost: { cash: 250 }, requires: ['expand'] },
  { id: 'hireCarrier2', kind: 'hire', helper: 'carrier', name: 'HIRE HUNTER', x: 6.0, z: 14.9, spawn: { x: 3, z: 16.3 }, cooker: 'smoker', cost: { cash: 300 }, requires: ['smoker'] },
  { id: 'tower4', kind: 'tower', name: 'ARROW TOWER', x: -6.6, z: 16.6, cost: { cash: 200 }, requires: ['expand'] },
  { id: 'tower5', kind: 'tower', name: 'ARROW TOWER', x: 6.6, z: 16.6, cost: { cash: 300 }, requires: ['tower4'] },
];

// Repeatable upgrade pads: cost grows each level (incremental progression).
// currency defaults to cash; ARMOR is paid with armor plates and appears once you've
// picked up your first plate ('firstPlate').
// All endless (max: Infinity). Axe +1.5 damage per level (towers and walls follow it), bag +4
// slots (workers get 30% of it, selling speeds up), armor +4 points. Cash upgrades cost
// base + step × level (linear, about one upgrade per wave); armor plates grow by `growth`.
export const UPGRADES = [
  { id: 'axe', name: 'AXE', icon: '🪓', x: -3.0, z: 6.0, base: 15, step: 12, max: Infinity, requires: ['counter'] },
  { id: 'bag', name: 'BAG', icon: '🎒', x: 3.0, z: 6.0, base: 12, step: 12, max: Infinity, requires: ['counter'] },
  { id: 'armor', name: 'ARMOR', icon: '🛡️', x: 5.75, z: 6.0, base: 2, growth: 1.15, max: Infinity, currency: 'plate', requires: ['firstPlate'] },
];
