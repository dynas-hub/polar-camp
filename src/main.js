// Polar Camp: bootstrap, renderer, camera, HUD glue, main loop.
// URL flags: ?shorts=1 (9:16 frame on desktop) · ?auto=1 (autopilot plays by itself) · ?reset=1 (new game)
import * as THREE from 'three';
import { createInput } from './input.js';
import { createFx } from './fx.js';
import { createGame } from './game.js';
import { createRecorder } from './recorder.js';
import { createAudio } from './audio.js';

const params = new URLSearchParams(location.search);
if (params.has('shorts')) document.body.classList.add('shorts');
// ?reset=1 starts a fresh game (wipes the local save)
// ?slot=test uses a separate save (for testing without touching the real one)
const SAVE_KEY = 'polarcamp-save-v1' + (params.get('slot') ? '-' + params.get('slot') : '');
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
scene.background = new THREE.Color(0xcfe3f2);
scene.fog = new THREE.Fog(0xcfe3f2, 26, 55);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 120);
const CAM_OFFSET = new THREE.Vector3(0, 15, 10.5);
let camDist = 1;

scene.add(new THREE.HemisphereLight(0xeaf4ff, 0x9fb2c4, 1.9));
const sun = new THREE.DirectionalLight(0xfff4e0, 1.6);
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
  setBag(n, cap) { $('bag').textContent = `${n}/${cap}`; $('bag-pill').style.color = n >= cap ? '#ffd34d' : '#fff'; },
  setWave(title, frac) { $('wave-title').textContent = title; $('wave-fill').style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`; },
  setHp(f) { $('hp-fill').style.width = `${f * 100}%`; },
  banner(text) { const b = $('banner'); b.textContent = text; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); },
  defeat(show) { $('defeat').classList.toggle('hidden', !show); input.setEnabled(!show); },
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
const showSound = () => { soundBtn.textContent = sfx.muted ? '🔇' : '🔊'; };
showSound();
soundBtn.addEventListener('click', () => { sfx.setMuted(!sfx.muted); showSound(); sfx.play('click'); });

// Autopilot sessions (footage/tests) never read or write the player's save.
const game = createGame({ scene, camera, fx, input, hud, labelsEl, useSave: !params.has('auto'), sfx, saveKey: SAVE_KEY });
const recorder = createRecorder(stage, canvas, () => renderer.render(scene, camera));

$('retry').addEventListener('click', () => game.retry());

// ---------- Title screen & How to play ----------
let started = false;
let paused = false; // true while the How to play panel is open
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode: ignore */ } },
};

if (game.loaded) {
  $('play').textContent = 'CONTINUE';
  $('new-game').classList.remove('hidden');
}

function openHelp() {
  paused = true;
  input.setEnabled(false);
  $('help').classList.remove('hidden');
}
function closeHelp() {
  $('help').classList.add('hidden');
  store.set('polarcamp-seen-help', '1');
  paused = false;
  if (started && !game.player.dead) input.setEnabled(true);
}

function startGame() {
  sfx.unlock();
  sfx.play('click');
  $('title-screen').classList.add('hidden');
  document.body.classList.add('playing');
  started = true;
  input.setEnabled(true);
  // first time ever: show the rules once before the first wave
  if (!store.get('polarcamp-seen-help')) openHelp();
}

$('play').addEventListener('click', startGame);
$('how').addEventListener('click', openHelp);
$('help-btn').addEventListener('click', openHelp);
$('help-close').addEventListener('click', closeHelp);
$('new-game').addEventListener('click', () => {
  if (!confirm('Start a new game? Your current camp will be lost.')) return;
  game.resetSave();
  location.replace(location.pathname); // reload without any URL flags
});

if (params.has('auto')) {
  $('title-screen').classList.add('hidden');
  $('help-btn').classList.add('hidden');
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
