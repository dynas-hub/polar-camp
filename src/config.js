// All gameplay tuning lives here so balancing never means hunting through code.

export const CAMP_HALF = 6; // camp floor spans -6..6 on x and z

export const PLAYER = {
  speed: 6,
  radius: 0.45,
  maxHp: 20,
  regenDelay: 3,     // seconds without damage before regen starts
  regenRate: 3,      // hp per second
  swingCooldown: 0.42,
  chopRange: 1.7,
  attackRange: 2.1,
  pickupRange: 2.2,
  baseBag: 12,
  bagPerLevel: 4,
  // Upgrades are endless and keep pace with the bears (+8% hp per wave): the axe gains
  // +12% per level, a bit more, so investing gets you slightly ahead without breaking the game.
  damage: (axeLevel) => 1 + 0.12 * axeLevel,
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

// wallHit: damage per swing to a wall that's in the way (bears chew through fences → repairs cost wood)
export const BEAR = {
  hp: 3, speed: 3.1, damage: 1, attackRate: 1, radius: 0.6, meat: 3, scale: 1, wallHit: 1,
};

// Bosses: one every 5 waves. `cash` = loot bag dropped on death.
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
    // 25 per log: a 100 hp wall falls in 4 logs (~11 s) if nobody goes out to stop it
    range: 9, throwEvery: 2.8, firstThrow: 1.2, wallDamage: 25, hitDamage: 3, heartwood: 1 },
};
export const BOSS_ORDER = ['mega', 'armored', 'poison', 'thrower'];

// Poison never wears off: it keeps ticking until you die or reach the campfire
// (1 hp/s with 20 hp = about 20 s to get there).
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

export const WALL = { hp: 250, repairPerLog: 20 };

// Forged at the ARMOR pad with plates from armored bears. Armor absorbs hits before hp.
export const ARMOR = { perLevel: 4, regen: 2 };

// Hired workers carry 30% of what your bag holds (upgrading the bag upgrades them too)
// and walk a little faster as you level the bag.
export const WORKERS = { share: 0.3, speedPerBagLevel: 0.03, maxSpeedBonus: 0.5 };

export const WAVES = {
  firstDelay: 30,
  interval: 26,
  spawnRadius: 30,
  // capped so late waves stay smooth on phones; bears get tougher every wave instead (+8%/wave)
  countFor: (n) => Math.min(20, 1 + n),
  hpScale: (n) => 1 + (n - 1) * 0.08,
  spawnGap: 0.7,
  // A boss every 3 waves. Waves 3-12 introduce them one at a time, then they rotate alone
  // (15-24), come as a pair of the same class (27-36), then two different classes (39+).
  bossesFor(n) {
    if (n % 3) return [];
    const k = n / 3, O = BOSS_ORDER;
    if (k <= 8) return [O[(k - 1) % 4]];
    if (k <= 12) return [O[(k - 1) % 4], O[(k - 1) % 4]];
    return [O[(k - 1) % 4], O[k % 4]];
  },
  // bosses scale with the wave: ×1.0 at wave 3, ×1.6 at wave 9, ×2.2 at wave 15, ×3.1 at wave 24
  bossScale: (n) => 0.7 + n * 0.1,
};

export const TOWER = { range: 8, fireRate: 0.8, damage: 1, arrowSpeed: 22 };

// An arrow tower upgraded with heartwood (only dropped by the log thrower) + wood + cash.
// 12 m reach = just enough to hit a log thrower lobbing at the walls from 9 m.
// Heavy bolts crack armor instead of bouncing off it. Ballistas can be destroyed: they
// fall back to an arrow tower and drop their heartwood (and vial) so you can rebuild.
export const BALLISTA = {
  range: 12, fireRate: 1.4, damage: 9, armorDamage: 4, boltSpeed: 26, hp: 150,
  cost: { heartwood: 1, logs: 20, cash: 250 },
  // poison bolts: needs a vial from the poison bear
  poisonCost: { vial: 1, logs: 15, cash: 150 },
  poisonDps: 2, poisonTime: 5,
};

// Improved oven in the camp expansion: cooks twice as fast, smoked meat sells for more.
export const SMOKER = { cookTime: 0.4, price: 20 };

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
export const WOODPILE = { x: -1.7, z: -2.6 };

// The camp expansion (annex) sits behind the south wall: x -6..6, z 6..ANNEX_END.
export const ANNEX_END = 14;

// Wall lines. axis 'x' = runs along x at z = `at`; axis 'z' = runs along z at x = `at`.
// gate: a 3.2 m opening in the middle (north + south of the camp, and the annex's far end).
export const WALLS = {
  N: { axis: 'x', at: -6, from: -6, to: 6, gate: true },
  S: { axis: 'x', at: 6, from: -6, to: 6, gate: true },
  W: { axis: 'z', at: -6, from: -6, to: 6 },
  E: { axis: 'z', at: 6, from: -6, to: 6 },
  AW: { axis: 'z', at: -6, from: 6, to: ANNEX_END },
  AE: { axis: 'z', at: 6, from: 6, to: ANNEX_END },
  AS: { axis: 'x', at: ANNEX_END, from: -6, to: 6, gate: true },
};

// Build zones: predefined squares on the ground. `requires` gates unlocking.
// kind: what gets built. cost: { logs } or { cash }. x/z is the pad position;
// walls are built along the camp edge named by `wall` (N has a gate in the middle).
export const ZONES = [
  { id: 'counter', kind: 'counter', name: 'SELL TABLE', x: 2.6, z: 2.4, cost: { logs: 8 } },
  { id: 'wallN', kind: 'wall', name: 'NORTH WALL', x: 0, z: -4.2, cost: { logs: 18 }, requires: ['counter'], wall: 'N' },
  { id: 'tower1', kind: 'tower', name: 'ARROW TOWER', x: -3.8, z: -3.6, cost: { cash: 20 }, requires: ['counter'] },
  { id: 'wallW', kind: 'wall', name: 'WEST WALL', x: -4.4, z: -1.2, cost: { logs: 22 }, requires: ['wallN'], wall: 'W' },
  { id: 'wallE', kind: 'wall', name: 'EAST WALL', x: 4.4, z: -1.2, cost: { logs: 22 }, requires: ['wallN'], wall: 'E' },
  { id: 'tower2', kind: 'tower', name: 'ARROW TOWER', x: 3.8, z: -3.6, cost: { cash: 60 }, requires: ['tower1'] },
  { id: 'tower3', kind: 'tower', name: 'ARROW TOWER', x: -3.8, z: 3.8, cost: { cash: 120 }, requires: ['tower2', 'wallW'] },
  // v0.2: cooking + automation chain (lumberjack → woodpile, hunter → grill, cashier → counter)
  { id: 'grill', kind: 'grill', name: 'GRILL', x: 1.8, z: -2.2, cost: { logs: 25 }, requires: ['counter'] },
  { id: 'hireLumber', kind: 'hire', helper: 'lumberjack', name: 'HIRE LUMBERJACK', x: 4.4, z: 4.6, cost: { cash: 60 }, requires: ['counter'] },
  { id: 'hireCarrier', kind: 'hire', helper: 'carrier', name: 'HIRE HUNTER', x: -4.4, z: 1.7, cost: { cash: 120 }, requires: ['grill'] },
  { id: 'hireCashier', kind: 'hire', helper: 'cashier', name: 'HIRE CASHIER', x: 2.2, z: 0.2, cost: { cash: 200 }, requires: ['grill', 'hireCarrier'] },
  // v0.4: close the 4th side (gate in the middle), then expand the camp to the south
  { id: 'wallS', kind: 'wall', name: 'SOUTH WALL', x: -2.4, z: 7.4, cost: { logs: 22 }, requires: ['wallN'], wall: 'S' },
  { id: 'expandWood', kind: 'milestone', name: 'EXPANSION: FOUNDATIONS', x: 3.2, z: 7.6, cost: { logs: 60 }, requires: ['wallS'] },
  { id: 'expand', kind: 'expand', name: 'EXPAND THE CAMP', x: 3.2, z: 7.6, cost: { cash: 500 }, requires: ['expandWood'] },
  // the annex: its own walls, 2 more workers, a smokehouse and 2 more tower spots
  { id: 'wallAW', kind: 'wall', name: 'ANNEX WEST WALL', x: -4.5, z: 7.6, cost: { logs: 22 }, requires: ['expand'], wall: 'AW' },
  { id: 'wallAE', kind: 'wall', name: 'ANNEX EAST WALL', x: 4.5, z: 7.6, cost: { logs: 22 }, requires: ['expand'], wall: 'AE' },
  { id: 'wallAS', kind: 'wall', name: 'ANNEX SOUTH WALL', x: -2.2, z: 12.6, cost: { logs: 26 }, requires: ['expand'], wall: 'AS' },
  { id: 'smoker', kind: 'smoker', name: 'SMOKEHOUSE', x: 2.2, z: 10.2, cost: { logs: 40 }, requires: ['expand'] },
  { id: 'hireLumber2', kind: 'hire', helper: 'lumberjack', name: 'HIRE LUMBERJACK', x: -4.5, z: 10.2, cost: { cash: 250 }, requires: ['expand'] },
  { id: 'hireCarrier2', kind: 'hire', helper: 'carrier', name: 'HIRE HUNTER', x: 4.5, z: 10.2, cost: { cash: 300 }, requires: ['smoker'] },
  { id: 'tower4', kind: 'tower', name: 'ARROW TOWER', x: -4.6, z: 12.8, cost: { cash: 200 }, requires: ['expand'] },
  { id: 'tower5', kind: 'tower', name: 'ARROW TOWER', x: 4.6, z: 12.8, cost: { cash: 300 }, requires: ['tower4'] },
];

// Repeatable upgrade pads: cost grows each level (incremental progression).
// currency defaults to cash; ARMOR is paid with armor plates and appears once you've
// picked up your first plate ('firstPlate').
// All endless (max: Infinity). Axe +12% damage per level, bag +4 slots (workers get 30% of it,
// selling speeds up), armor +4 points. Costs grow slowly (10-15% per level) so that about one
// level per wave stays affordable: upgrades keep pace with the bears (+8% hp per wave).
export const UPGRADES = [
  { id: 'axe', name: 'AXE', icon: '🪓', x: -2.2, z: 4.5, base: 15, growth: 1.1, max: Infinity, requires: ['counter'] },
  { id: 'bag', name: 'BAG', icon: '🎒', x: -0.25, z: 4.5, base: 12, growth: 1.12, max: Infinity, requires: ['counter'] },
  { id: 'armor', name: 'ARMOR', icon: '🛡️', x: 1.7, z: 4.5, base: 2, growth: 1.15, max: Infinity, currency: 'plate', requires: ['firstPlate'] },
];
