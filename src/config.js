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

export const MEGA_BEAR = {
  hp: 28, speed: 2.5, damage: 4, attackRate: 1.3, radius: 1.05, meat: 8, scale: 1.8,
};

export const WAVES = {
  firstDelay: 30,
  interval: 26,
  spawnRadius: 30,
  megaEvery: 5,
  countFor: (n) => 1 + n,
  spawnGap: 0.7,
};

export const TOWER = { range: 8, fireRate: 0.8, damage: 1, arrowSpeed: 22 };

export const ECONOMY = {
  meatPrice: 5,
  steakPrice: 12,    // cooked meat from the grill sells for more
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
export const UPGRADES = [
  { id: 'axe', name: 'AXE', icon: '🪓', x: -1.6, z: 4.2, base: 15, growth: 1.6, max: 10, requires: ['counter'] },
  { id: 'bag', name: 'BAG', icon: '🎒', x: 1.0, z: 4.2, base: 12, growth: 1.55, max: 10, requires: ['counter'] },
];
