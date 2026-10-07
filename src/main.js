// Bear Camp (was Polar Camp): bootstrap, renderer, camera, HUD glue, main loop.
// URL flags: ?shorts=1 (9:16 frame on desktop) · ?auto=1 (autopilot plays by itself) · ?reset=1 (new game)
import * as THREE from 'three';
import { createInput } from './input.js';
import { createFx } from './fx.js';
import { createGame } from './game.js';
import { createRecorder } from './recorder.js';
import { createAudio } from './audio.js';
import { initI18n, setLang, getLang, onLangChange, savedLang, t, tName, LANGS } from './i18n.js';
import { WORLDS, world, useWorld } from './worlds.js';
import { saveKeyFor, readProgress, writeProgress, worldWon } from './save.js';
import { applyWorldLook } from './models.js';
import { REWARDS, BOSSES } from './config.js';

const params = new URLSearchParams(location.search);
// texts first (English on first launch). Autopilot footage is always in English and never saves a choice.
await initI18n(params.has('auto') ? 'en' : null);
if (params.has('shorts')) document.body.classList.add('shorts');
// ?slot=test uses a separate set of saves (for testing without touching the real ones)
const SLOT = params.get('slot') || '';
// The world being played (each world keeps its own camp). ?world=island previews another world
// (tests only, nothing is remembered); the autopilot plays the polar map unless told otherwise.
useWorld(params.get('world') || (params.has('auto') ? 'polar' : readProgress(SLOT).world));
if (!world().ready && !params.has('world')) useWorld('polar');
applyWorldLook(); // camp materials (wood or bamboo) before any model is built
// ?reset=1 starts this world over (wipes its save)
const SAVE_KEY = saveKeyFor(world().id, SLOT);
if (params.has('reset')) { try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ } }

const stage = document.getElementById('stage');
const canvas = document.getElementById('game');
const labelsEl = document.getElementById('labels');

// Phones: cap the render resolution and shadow size so it stays smooth on mid-range devices.
const MOBILE = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 900;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: !MOBILE, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, MOBILE ? 1.5 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const PAL = world().palette;
scene.background = new THREE.Color(PAL.sky);
scene.fog = new THREE.Fog(PAL.sky, 26, 55);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 120);
const CAM_OFFSET = new THREE.Vector3(0, 15, 10.5);
let camDist = 1;

scene.add(new THREE.HemisphereLight(PAL.hemiSky, PAL.hemiGround, 1.9));
const sun = new THREE.DirectionalLight(PAL.sun, 1.6);
sun.castShadow = true;
sun.shadow.mapSize.setScalar(MOBILE ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 60 });
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);

// ---------- HUD ----------
const $ = (id) => document.getElementById(id);
const hud = {
  setCash(v) { $('cash').textContent = v.toLocaleString('en-US'); },
  bumpCash() { const p = $('cash-pill'); p.classList.remove('bump'); void p.offsetWidth; p.classList.add('bump'); },
  // island tide gauge: f = 0 low tide … 1 high tide; ▲ while the sea rises, ▼ while it goes out
  setTide(f, rising) {
    $('tide-pill').classList.remove('hidden');
    $('tide-fill').style.width = `${Math.round(f * 100)}%`;
    $('tide-arrow').textContent = rising ? '▲' : '▼';
  },
  setBag(n, cap) { $('bag').textContent = `${n}/${cap}`; $('bag-pill').style.color = n >= cap ? '#ffd34d' : '#fff'; },
  setWave(title, frac) { $('wave-title').textContent = title; $('wave-fill').style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`; },
  setHp(f) { $('hp-fill').style.width = `${f * 100}%`; },
  banner(text) { const b = $('banner'); b.textContent = text; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); },
  defeat(show) { $('defeat').classList.toggle('hidden', !show); input.setEnabled(!show); },
  // the map is won: victory screen → world map → keep playing (endless)
  victory({ waves }) {
    // the world's own final boss (the Bear King, the shell bear…)
    $('victory-sub').textContent = t('victory.sub', { name: tName(BOSSES[world().finalBoss]?.name || '') });
    $('victory-stats').textContent = t('victory.stats', { n: waves });
    $('victory').classList.remove('hidden');
    sfx.play('victory');
    if (game.auto.on) { setTimeout(openMap, 3000); return; } // autopilot footage keeps rolling
    pause(true);
  },
  flashHurt() { stage.animate([{ boxShadow: 'inset 0 0 80px rgba(255,40,40,.6)' }, { boxShadow: 'inset 0 0 0 rgba(255,40,40,0)' }], 300); },
  setArmor(f, show) { $('armor-bar').classList.toggle('hidden', !show); $('armor-fill').style.width = `${f * 100}%`; },
  setPoison(on) { $('poison').classList.toggle('hidden', !on); },
  setBoss(name, frac) {
    $('boss').classList.toggle('hidden', !name);
    if (!name) return;
    $('boss-name').textContent = name;
    $('boss-fill').style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
  },
  // bottom tip telling the player what to do next; pulses when the goal changes
  setHint(text, icon) {
    const h = $('hint');
    const prev = $('hint-text').textContent;
    if (prev === text) return;
    $('hint-text').textContent = text;
    $('hint-ico').textContent = icon || '';
    h.classList.toggle('hidden', !text);
    // pulse only on a new goal, not when just a number in it changes ("$490" → "$466")
    const digitless = (s) => s.replace(/[\d$,/]+/g, '');
    if (digitless(prev) !== digitless(text)) { h.classList.remove('pulse'); void h.offsetWidth; h.classList.add('pulse'); }
  },
};

const input = createInput(stage);
const fx = createFx(scene, camera, labelsEl, stage);
// Sound: phones only allow audio after a tap, so unlock on the first touch/click/key.
const sfx = createAudio();
const unlockAudio = () => sfx.unlock();
['pointerdown', 'keydown', 'touchend'].forEach((ev) => window.addEventListener(ev, unlockAudio, { passive: true }));
// back from the home screen / a call: wake the sound up again (the next tap does it too)
document.addEventListener('visibilitychange', () => { if (!document.hidden) unlockAudio(); });
const soundBtn = document.getElementById('sound-btn');
const showSound = () => {
  soundBtn.textContent = sfx.muted ? '🔇' : '🔊';
  document.querySelectorAll('#opt-sound button').forEach((b) => b.classList.toggle('on', (b.dataset.sound === 'off') === sfx.muted));
};
showSound();
const setMuted = (m) => { sfx.setMuted(m); showSound(); sfx.play('click'); };
// music: the world's loop, with its own switch in the Options (autopilot footage stays silent: music is added in the edit)
const showMusic = () => document.querySelectorAll('#opt-music button').forEach((b) => b.classList.toggle('on', (b.dataset.music === 'on') === sfx.musicOn));
showMusic();
if (!params.has('auto')) sfx.setMusic(world().music);
soundBtn.addEventListener('click', () => setMuted(!sfx.muted));

// Autopilot sessions (footage/tests) never read or write the player's save.
// free bag levels: REWARDS.freeBagLevels for each world beaten before this one
const bagBonus = REWARDS.freeBagLevels * WORLDS.slice(0, world().n - 1).filter((w) => worldWon(w.id, SLOT)).length;
const game = createGame({ scene, camera, fx, input, hud, labelsEl, useSave: !params.has('auto'), sfx, saveKey: SAVE_KEY, bagBonus });
const recorder = createRecorder(stage, canvas, () => renderer.render(scene, camera));

$('retry').addEventListener('click', () => game.retry());

// ---------- World map, Mario style (opens after a victory, then from the 🗺️ button) ----------
// Every world sits on one path. Beaten = 👑, unlocked = in color (tap to travel there),
// unlocked but not built yet = "coming soon", locked = a dark silhouette.
const MAP_POS = [[16, 80], [42, 85], [68, 79], [81, 61], [56, 52], [30, 57], [14, 39], [34, 22], [60, 28], [81, 11]];
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const anyWon = () => WORLDS.some((w) => worldWon(w.id, SLOT)) || game.won;

function drawMap() {
  const won = WORLDS.map((w) => (w.id === world().id ? game.won : worldWon(w.id, SLOT)));
  const state = WORLDS.map((w, i) => {
    // unlocked: the first world, the one after a beaten world, a beaten world, and the one you're playing
    const open = i === 0 || won[i - 1] || won[i] || w.id === world().id;
    return !open ? 'locked' : won[i] ? 'beaten' : w.ready ? 'open' : 'soon';
  });
  const board = $('map-board');
  board.style.backgroundImage = WORLDS.map((w, i) => {
    const [x, y] = MAP_POS[i];
    return `radial-gradient(circle at ${x}% ${y}%, ${state[i] === 'locked' ? '#3a4654' : hex(w.palette.ground)} 0 10%, transparent 10.5%)`;
  }).join(', ');
  const lines = MAP_POS.slice(1).map(([x, y], i) => {
    const [px, py] = MAP_POS[i];
    return `<line class="${state[i + 1] === 'locked' ? 'dark' : 'open'}" x1="${px}" y1="${py}" x2="${x}" y2="${y}" />`;
  }).join('');
  board.innerHTML = `<svg class="map-path" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>`
    + WORLDS.map((w, i) => {
      const [x, y] = MAP_POS[i], st = state[i], here = w.id === world().id;
      const badge = st === 'beaten' ? '👑' : st === 'locked' ? '🔒' : '';
      const label = st === 'locked' ? t('map.world', { n: w.n }) : tName(w.name);
      const tag = st === 'beaten' ? t('map.beaten') : st === 'soon' ? t('map.soon') : here ? t('map.here') : '';
      return `<button class="map-node ${st}${here ? ' here' : ''}" data-world="${w.id}" style="left:${x}%;top:${y}%" ${st === 'locked' || st === 'soon' ? 'disabled' : ''}>
        <div class="map-pin"><span>${w.icon}</span>${badge ? `<span class="map-badge">${badge}</span>` : ''}</div>
        <b>${label}</b>${tag ? `<small>${tag}</small>` : ''}</button>`;
    }).join('');
  board.querySelectorAll('.map-node:not([disabled])').forEach((b) => b.addEventListener('click', () => travel(b.dataset.world)));
  // the line under the map: what's next
  const next = WORLDS[WORLDS.findIndex((w) => w.id === world().id) + 1];
  $('map-text').textContent = game.won && next && !next.ready ? t('map.endless', { name: tName(next.name) }) : t('map.pick');
}

// Travel to another world: save this camp, remember the choice, and load that world's camp.
function travel(id) {
  sfx.play('click');
  if (id === world().id) { closeMap(); return; }
  if (params.has('auto') || params.has('world')) return; // previews and footage never switch saves
  game.save();
  writeProgress({ world: id }, SLOT);
  location.replace(location.pathname + (SLOT ? `?slot=${encodeURIComponent(SLOT)}` : ''));
}

function openMap() {
  drawMap();
  $('victory').classList.add('hidden');
  $('worldmap').classList.remove('hidden');
  if (game.auto.on) { setTimeout(closeMap, 3000); return; }
  pause(true);
}
function closeMap() {
  $('worldmap').classList.add('hidden');
  if (!params.has('auto')) $('map-btn').classList.toggle('hidden', !anyWon());
  pause(false);
}
$('victory-map').addEventListener('click', () => { sfx.play('click'); openMap(); });
$('map-play').addEventListener('click', () => { sfx.play('click'); closeMap(); });
$('map-btn').addEventListener('click', () => { sfx.play('click'); openMap(); });

// ---------- Title screen & How to play ----------
let started = false;
let paused = false; // true while the How to play panel is open
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode: ignore */ } },
};

if (game.loaded) {
  $('play').dataset.i18n = 'title.continue';
  $('play').textContent = t('title.continue');
  $('new-game').classList.remove('hidden');
}

// How to play: one row per topic, texts from the locale (help.<id>.t / help.<id>.d)
const HELP_ROWS = [
  ['🕹️', 'move'], ['🌲', 'chop'], ['⬜', 'build'], ['🐻', 'fight'], ['🥩', 'sell'], ['🔥', 'grill'],
  ['👷', 'workers'], ['⬆️', 'upgrades'], ['🔥', 'campfire'], ['🧱', 'walls'], ['🏕️', 'expansion'], ['👑', 'bosses'],
  ['🛡️', 'armored'], ['🤢', 'poison'], ['🪵', 'thrower'], ['🌟', 'ballista'], ['🧪', 'bolts'],
];
$('help-list').innerHTML = HELP_ROWS.map(([icon, id]) =>
  `<div class="row"><span>${icon}</span><div><b data-i18n="help.${id}.t"></b><i data-i18n="help.${id}.d"></i></div></div>`).join('');

// Little original flag drawings for the language buttons
const FLAGS = {
  en: '<svg viewBox="0 0 60 40"><rect width="60" height="40" fill="#1f3f8f"/><path d="M0 0L60 40M60 0L0 40" stroke="#fff" stroke-width="8"/><path d="M0 0L60 40M60 0L0 40" stroke="#d6293a" stroke-width="3"/><path d="M30 0V40M0 20H60" stroke="#fff" stroke-width="12"/><path d="M30 0V40M0 20H60" stroke="#d6293a" stroke-width="7"/></svg>',
  fr: '<svg viewBox="0 0 60 40"><rect width="20" height="40" fill="#2446a8"/><rect x="20" width="20" height="40" fill="#fff"/><rect x="40" width="20" height="40" fill="#e0373d"/></svg>',
  es: '<svg viewBox="0 0 60 40"><rect width="60" height="40" fill="#c8202e"/><rect y="10" width="60" height="20" fill="#f6c22c"/></svg>',
};
document.querySelectorAll('[data-flag]').forEach((el) => { el.innerHTML = FLAGS[el.dataset.flag]; });

function showLang(l) {
  $('lang-link-flag').innerHTML = FLAGS[l];
  $('lang-link-name').textContent = LANGS.find((x) => x.id === l).name;
  document.querySelectorAll('#opt-lang button').forEach((b) => b.classList.toggle('on', b.dataset.lang === l));
  document.querySelectorAll('.plank').forEach((b) => b.classList.toggle('sel', b.dataset.lang === l));
}
onLangChange((l) => { showLang(l); game.relabel(); });
setLang(getLang(), { save: false }); // fills the help rows and every data-i18n text now that they exist

// Help and Options freeze the game while open
function pause(on) {
  paused = on;
  if (on) input.setEnabled(false);
  else if (started && !game.player.dead) input.setEnabled(true);
}
function openHelp() {
  pause(true);
  $('help').classList.remove('hidden');
}
function closeHelp() {
  $('help').classList.add('hidden');
  store.set('polarcamp-seen-help', '1');
  pause(false);
}
function openOptions() {
  sfx.play('click');
  showSound();
  pause(true);
  $('options').classList.remove('hidden');
}
function closeOptions() {
  $('options').classList.add('hidden');
  pause(false);
}
$('options-btn').addEventListener('click', openOptions);
$('lang-link').addEventListener('click', openOptions);
$('options-close').addEventListener('click', closeOptions);
document.querySelectorAll('#opt-lang button').forEach((b) => b.addEventListener('click', () => { sfx.play('click'); setLang(b.dataset.lang); }));
document.querySelectorAll('#opt-sound button').forEach((b) => b.addEventListener('click', () => setMuted(b.dataset.sound === 'off')));
document.querySelectorAll('#opt-music button').forEach((b) => b.addEventListener('click', () => { sfx.play('click'); sfx.setMusicOn(b.dataset.music === 'on'); showMusic(); }));

// First launch: the signpost language picker, before the title screen. English is preselected;
// tapping a plank previews the whole screen in that language, CONTINUE saves the choice.
if (!savedLang() && !params.has('auto')) {
  $('title-screen').classList.add('hidden');
  $('lang-screen').classList.remove('hidden');
  document.querySelectorAll('.plank').forEach((b) => b.addEventListener('click', () => { sfx.unlock(); sfx.play('click'); setLang(b.dataset.lang, { save: false }); }));
  $('lang-go').addEventListener('click', () => {
    sfx.play('click');
    setLang(getLang());
    $('lang-screen').classList.add('hidden');
    $('title-screen').classList.remove('hidden');
  });
}

function startGame() {
  sfx.unlock();
  sfx.play('click');
  $('title-screen').classList.add('hidden');
  document.body.classList.add('playing');
  started = true;
  input.setEnabled(true);
  $('map-btn').classList.toggle('hidden', !anyWon());
  // first time ever: show the rules once before the first wave
  if (!store.get('polarcamp-seen-help')) openHelp();
}

$('play').addEventListener('click', startGame);
$('how').addEventListener('click', openHelp);
$('help-btn').addEventListener('click', openHelp);
$('help-close').addEventListener('click', closeHelp);
$('new-game').addEventListener('click', () => {
  if (!confirm(t('title.newGameConfirm'))) return;
  game.resetSave();
  location.replace(location.pathname); // reload without any URL flags
});

if (params.has('auto')) {
  $('title-screen').classList.add('hidden');
  $('help-btn').classList.add('hidden');
  $('options-btn').classList.add('hidden');
  document.body.classList.add('playing');
  game.auto.on = true;
  started = true;
}

// ---------- Resize ----------
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false);
  const aspect = w / h;
  camera.aspect = aspect;
  // Portrait phones: widen the view and pull back so the camp still fits across.
  camera.fov = aspect < 1 ? 50 : 42;
  camDist = aspect < 1 ? THREE.MathUtils.clamp(1.25 / Math.sqrt(aspect * 1.6), 1, 1.45) : 1;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------- Loop ----------
const focus = new THREE.Vector3();
focus.copy(game.player.pos);
let overviewCam = false;
let last = performance.now();

// One simulation + camera step. Shared by the live loop and offline filming.
function tick(dt) {
  input.update();
  // before PLAY (title backdrop) and while How to play is open, the world renders but time stops
  game.update(started && !paused ? dt : 0);
  placeCamera(dt);
  fx.update(dt, focus);
}

function placeCamera(dt) {
  focus.lerp(game.player.pos, Math.min(1, dt * 6));
  const s = fx.shakeOffset();
  if (overviewCam) {
    // fixed high shot of the whole camp (timelapses)
    const portrait = camera.aspect < 1;
    const o = typeof overviewCam === 'object' ? overviewCam : null; // custom framing: { y, z, look }
    camera.position.set(0, o?.y ?? (portrait ? 27 : 24), o?.z ?? (portrait ? 17.5 : 17));
    camera.lookAt(0, 0, o?.look ?? (portrait ? 0.8 : 0.5));
  } else {
    camera.position.copy(focus).addScaledVector(CAM_OFFSET, camDist);
    camera.position.x += s.x; camera.position.y += s.y;
    camera.lookAt(focus.x + s.x * 0.5, focus.y, focus.z);
  }
  sun.position.set(focus.x + 10, 20, focus.z + 6);
  sun.target.position.copy(focus);
}

let filming = false;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!filming) {
    tick(dt);
    renderer.render(scene, camera);
    recorder.frame();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Offline film: steps the game at a fixed rate and uploads every composited frame
// (3D + HUD) as a JPEG. Doesn't depend on the tab being visible or on machine speed.
// tools/film.ps1 <name> then turns devlog/frames/<name> into devlog/clips/<name>.mp4
// opts.speed: game steps per frame (timelapse) · opts.overview: fixed high camera over the camp
// Sound: at normal speed every sound effect is logged with its time, rendered into a WAV
// at the end and saved next to the frames (film.ps1 muxes it). Timelapses stay silent.
async function film(name, seconds, opts = {}) {
  const { fps = 30, speed = 1, overview = false } = opts;
  const withSound = opts.sound ?? speed === 1;
  if (withSound) sfx.startCapture();
  filming = true;
  started = true;
  overviewCam = overview;
  // the high overview camera sits far away: push the fog back so the shot isn't washed out
  if (overview) { scene.fog.near = 60; scene.fog.far = 140; }
  const total = Math.round(seconds * fps);
  const step = (dt) => { for (let s = 0; s < speed; s++) tick(dt); };
  // Frames are encoded synchronously and uploaded in batches: hidden tabs throttle
  // async callbacks heavily, so fewer awaits = much faster filming.
  const BATCH = 15;
  try {
    for (let i = 0; i < total; i += BATCH) {
      const urls = [];
      for (let j = i; j < Math.min(total, i + BATCH); j++) {
        if (withSound) sfx.setCaptureTime(j / fps);
        step(1 / fps);
        renderer.render(scene, camera);
        urls.push(recorder.compose().toDataURL('image/jpeg', 0.9));
      }
      await fetch(`/__frames?name=${encodeURIComponent(name)}&start=${i}`, { method: 'POST', body: urls.join('\n') });
    }
    if (withSound) {
      const { wav, events } = await sfx.renderCapture(total / fps);
      await fetch(`/__audio?name=${encodeURIComponent(name)}`, { method: 'POST', body: wav });
      opts.soundEvents = events;
    }
  } finally {
    filming = false;
    overviewCam = false;
    scene.fog.near = 26; scene.fog.far = 55;
    last = performance.now();
  }
  return { name, frames: total, size: `${canvas.width}x${canvas.height}`, sounds: opts.soundEvents ?? 0 };
}

// Dev hooks (console / automation): PC.snap('name'), PC.rec.start('name'), PC.rec.stop(), PC.game.auto.on = true
// PC.sim(seconds) fast-forwards the game logic without rendering (works in background tabs).
window.PC = {
  game, recorder, rec: recorder, snap: recorder.snap, renderer, scene, camera, film, sfx,
  overview(on = true) { overviewCam = on; placeCamera(1); game.update(0); }, // top shot of the camp (layout checks)
  sim(seconds, step = 1 / 30) {
    started = true;
    for (let t = 0; t < seconds; t += step) {
      input.update();
      game.update(step);
      fx.update(step, game.player.pos);
    }
    focus.copy(game.player.pos);
    placeCamera(1); // so a PC.snap right after a sim frames the player
    game.update(0); // re-project the on-screen labels with the new camera
    return { cash: game.cash, wave: game.wave, stats: { ...game.stats }, helpers: game.helpers.map((h) => `${h.kind}:${h.state}:${h.c.stack.length}`) };
  },
};
