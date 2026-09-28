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
  bagPerLevel: 6,
  baseDamage: 1,
  damagePerLevel: 1,
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

export const BEAR = {
  hp: 3, speed: 3.1, damage: 1, attackRate: 1, radius: 0.6, meat: 3, scale: 1,
};

// Bosses: one every 5 waves. `cash` = loot bag dropped on death.
// Tuned to add a challenge without being unfair: every boss can be beaten with the axe
// alone at low upgrade levels, and the towers help against all of them except armor.
export const BOSSES = {
  mega: { name: 'MEGA BEAR', hp: 28, speed: 2.5, damage: 4, attackRate: 1.3, radius: 1.05, meat: 8, scale: 1.8, cash: 25 },
  // arrows bounce off the plates; the axe breaks them (armor points first, then hp)
  armored: { name: 'ARMORED BEAR', hp: 22, armor: 15, plates: 3, plateDrops: 2, speed: 2.3, damage: 3, attackRate: 1.35, radius: 1.0, meat: 6, scale: 1.7, cash: 40 },
  // bite poisons (see POISON); bursts into a poison cloud on death; drops toxic meat
  poison: { name: 'POISON BEAR', hp: 20, speed: 3.2, damage: 2, attackRate: 1.2, radius: 0.85, meat: 0, toxic: 5, scale: 1.45, cash: 40 },
  // keeps its distance and throws logs at the walls (or at you when there are none)
  thrower: { name: 'LOG THROWER', hp: 24, speed: 2.6, damage: 2, attackRate: 1.2, radius: 0.9, meat: 6, scale: 1.5, cash: 50,
    range: 9, throwEvery: 3.6, wallDamage: 12, hitDamage: 2, heartwood: 1 },
};
export const BOSS_ORDER = ['mega', 'armored', 'poison', 'thrower'];

// Short on purpose: poison is a nudge to walk to the campfire, never a death sentence.
export const POISON = {
  dps: 1,            // damage per second while poisoned (ignores armor)
  bite: 4,           // seconds of poison per bite (refreshes, doesn't stack)
  cloud: 3,          // seconds of poison from the death cloud
  cloudRadius: 2.8,
  cloudDelay: 0.9,   // warning time before the cloud bursts
  campfireRadius: 1.9,
  campfireHeal: 5,   // hp per second while warming up at the campfire
};

export const WALL = { hp: 100, repairPerLog: 10 };

// Forged at the ARMOR pad with plates from armored bears. Armor absorbs hits before hp.
export const ARMOR = { perLevel: 4, regen: 2 };

export const WAVES = {
  firstDelay: 30,
  interval: 26,
  spawnRadius: 30,
  // capped so late waves stay smooth on phones; bears get tougher instead
  countFor: (n) => Math.min(20, 1 + n),
  hpScale: (n) => 1 + Math.max(0, n - 20) * 0.05,
  spawnGap: 0.7,
  // Waves 5-20 introduce one boss at a time, then they rotate alone (25-40),
  // come as a pair of the same class (45-60), then two different classes (65+).
  bossesFor(n) {
    if (n % 5) return [];
    const k = n / 5, O = BOSS_ORDER;
    if (k <= 8) return [O[(k - 1) % 4]];
    if (k <= 12) return [O[(k - 1) % 4], O[(k - 1) % 4]];
    return [O[(k - 1) % 4], O[k % 4]];
  },
  // bosses coming back after their debut get a bit tougher each lap (+15%)
  bossScale: (n) => 1 + Math.max(0, Math.floor(n / 5) - 4) * 0.15 / 4,
};

export const TOWER = { range: 8, fireRate: 0.8, damage: 1, arrowSpeed: 22 };

// An arrow tower upgraded with heartwood (only dropped by the log thrower) + cash.
// 12 m reach = just enough to hit a log thrower lobbing at the walls from 9 m.
// Heavy bolts crack armor instead of bouncing off it.
export const BALLISTA = { range: 12, fireRate: 1.4, damage: 3, armorDamage: 2, boltSpeed: 26, cash: 250, heartwood: 1 };

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
];

// Repeatable upgrade pads: cost grows each level (incremental progression).
// currency defaults to cash; ARMOR is paid with armor plates and appears once you've
// picked up your first plate ('firstPlate').
export const UPGRADES = [
  { id: 'axe', name: 'AXE', icon: '🪓', x: -2.2, z: 4.5, base: 15, growth: 1.6, max: 10, requires: ['counter'] },
  { id: 'bag', name: 'BAG', icon: '🎒', x: -0.25, z: 4.5, base: 12, growth: 1.55, max: 10, requires: ['counter'] },
  { id: 'armor', name: 'ARMOR', icon: '🛡️', x: 1.7, z: 4.5, base: 2, growth: 1.35, max: 8, currency: 'plate', requires: ['firstPlate'] },
];
