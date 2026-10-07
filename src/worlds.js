// The worlds (maps), Mario style: each one ends with a final boss and unlocks the next.
// One world = one config: colors, final wave and boss, boss order, difficulty, gimmick, music.
// Difficulty grows with the world number w (Gemini's formulas, approved 2026-10-06);
// w = 1 gives exactly the polar map's numbers.
// Only `ready` worlds can be played; the others show on the world map (dark until unlocked).
// The current world is picked once at startup (main.js → useWorld); switching worlds reloads the page.

const scale = (w) => ({
  // hp a normal bear gains per wave (3 hp at wave 1): +2 in world 1, +4.7 in world 10
  bearHpStep: 2 + (w - 1) * 0.3,
  // seconds between waves
  interval: Math.max(20, 26 - (w - 1)),
  // cash upgrades (axe, bag) cost more in later worlds; build costs stay fixed
  priceMult: 1 + (w - 1) * 0.05,
  // first wave with two bosses at once (world 1: never before the endless waves)
  twoBossesFrom: [Infinity, 15, 12, 12, 9, 9, 9, 6, 6, 6][w - 1] ?? 6,
});

// The look of a world (models.js, scenery.js and fx.js read it):
//  tree: 'pine' | 'palm' · snowCaps: snow on trees, rocks, tents and stakes
//  outfit: player and workers ('parka' | 'castaway') · bearOutfit: null | 'sand' (sand bears)
//  camp: building materials ('wood' | 'bamboo': bamboo poles and thatch roofs)
//  tent: tent cloth color · sea: water color around the land (null = endless ground)
//  weather: particles around the camera (count, color, size, fall speed, sideways drift, opacity)
const LOOKS = {
  polar: {
    tree: 'pine', snowCaps: true, outfit: 'parka', bearOutfit: null, camp: 'wood', tent: 0x3f8fc7, sea: null,
    weather: { count: 700, color: 0xffffff, size: 0.12, fall: 1.2, drift: 0.3, opacity: 0.9 }, // snowfall
  },
  island: {
    tree: 'palm', snowCaps: false, outfit: 'castaway', bearOutfit: 'sand', camp: 'bamboo', tent: 0xeadfc2, sea: 0x26b4e6,
    weather: { count: 120, color: 0xfff1c4, size: 0.07, fall: 0.12, drift: 1.4, opacity: 0.75 }, // sea-breeze sparkles
  },
};

// palette: sky (background + fog), ground, hemisphere light (sky, ground), sun
const LIST = [
  { id: 'polar', name: 'POLAR CAMP', icon: '❄️', finalWave: 15, finalBoss: 'king', ready: true, music: 'music-polar.mp3',
    palette: { sky: 0xcfe3f2, ground: 0xf4f8fc, hemiSky: 0xeaf4ff, hemiGround: 0x9fb2c4, sun: 0xfff4e0 } },
  { id: 'island', name: 'DESERT ISLAND', icon: '🌴', finalWave: 18, finalBoss: 'shell', gimmick: 'tide', music: 'music-island.mp3', ready: true,
    // mega sand bear → crab-shell armored → coconut thrower (heartwood) → monkey chief (vial)
    bossOrder: ['mega', 'armored', 'coco', 'monkey'],
    palette: { sky: 0xb2e6ff, ground: 0xfbf0d6, hemiSky: 0xfff6e2, hemiGround: 0xd8c39a, sun: 0xfff0d0 } },
  { id: 'desert', name: 'DESERT', icon: '🏜️', finalWave: 20,
    palette: { sky: 0xf6e2b8, ground: 0xe8c27a, hemiSky: 0xfff1d0, hemiGround: 0xb98a4a, sun: 0xffe0a0 } },
  { id: 'forest', name: 'FOREST', icon: '🌲', finalWave: 22,
    palette: { sky: 0xcfe8c8, ground: 0x6fa85a, hemiSky: 0xeaf6e0, hemiGround: 0x4a7a3a, sun: 0xfff0c8 } },
  { id: 'mountain', name: 'MOUNTAIN', icon: '⛰️', finalWave: 25,
    palette: { sky: 0xd6e0ea, ground: 0xb7c2cc, hemiSky: 0xf0f4f8, hemiGround: 0x7d8894, sun: 0xfff4e0 } },
  { id: 'canyon', name: 'WINDY CANYON', icon: '🌪️', finalWave: 26,
    palette: { sky: 0xf2d2b0, ground: 0xc9774a, hemiSky: 0xffe8d0, hemiGround: 0x8a4a2a, sun: 0xffd8a0 } },
  { id: 'swamp', name: 'SWAMP', icon: '🐸', finalWave: 27,
    palette: { sky: 0xb8c4a8, ground: 0x6f7f4a, hemiSky: 0xdfe6cf, hemiGround: 0x4a5530, sun: 0xf0e8c0 } },
  { id: 'city', name: 'RUINED CITY', icon: '🏚️', finalWave: 28,
    palette: { sky: 0xc8ccd4, ground: 0x8a8f99, hemiSky: 0xe8eaf0, hemiGround: 0x5a5f69, sun: 0xfff0d8 } },
  { id: 'lake', name: 'FROZEN LAKE', icon: '🧊', finalWave: 29,
    palette: { sky: 0xd8f0ff, ground: 0xa8e4ff, hemiSky: 0xf0fbff, hemiGround: 0x7ab8d8, sun: 0xf4f8ff } },
  { id: 'volcano', name: 'VOLCANO', icon: '🌋', finalWave: 30,
    palette: { sky: 0x6a4a44, ground: 0x4a302a, hemiSky: 0xffb08a, hemiGround: 0x3a2020, sun: 0xff9a6a } },
];

export const WORLDS = LIST.map((d, i) => ({
  n: i + 1,
  finalBoss: null,
  ready: false,
  // the log thrower comes before the poison bear: its heartwood makes the ballista that the poison vial upgrades
  bossOrder: ['mega', 'armored', 'thrower', 'poison'],
  gimmick: null, // island: 'tide', mountain: 'avalanche', ...
  music: null,   // loop file in src/sounds/ (ElevenLabs Music, the owner picks it)
  ...scale(i + 1),
  ...d,
  // worlds without their own look yet borrow the polar one (only for previews: they aren't playable)
  look: LOOKS[d.id] || LOOKS.polar,
}));

let current = WORLDS[0];
export const world = () => current;
export function useWorld(id) { current = WORLDS.find((w) => w.id === id) || WORLDS[0]; return current; }
export const worldById = (id) => WORLDS.find((w) => w.id === id);
