// Sound effects, all synthesized with the Web Audio API (no audio files, nothing to license).
// sfx.play('chop', { at }) — `at` (a Vector3) fades the sound with distance from the listener.
// Phones only allow audio after a tap: sfx.unlock() runs on the first touch/click/key.

const MUTE_KEY = 'polarcamp-muted';

// Minimum seconds between two plays of the same sound (rapid events would turn into noise).
const THROTTLE = {
  pop: 0.05, coin: 0.04, place: 0.05, sell: 0.07, arrow: 0.08, bolt: 0.1, hit: 0.03, chop: 0.05,
  sizzle: 0.5, poison: 0.3, crack: 0.1, hammer: 0.08, tink: 0.08, block: 0.06, hurt: 0.12, full: 1.2, whoosh: 0.15,
};

export function createAudio() {
  let ctx = null, master = null, noiseBuf = null;
  let muted = false;
  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* ignore */ }
  const last = {};
  const listener = { x: 0, z: 0 };

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.55;
    master.connect(comp).connect(ctx.destination);
    // 1 s of white noise, reused by every noisy sound
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  // --- building blocks ---
  function env(g, t, vol, attack, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  function tone({ freq = 440, to = null, type = 'sine', vol = 0.3, dur = 0.15, attack = 0.005, delay = 0, gain = 1 }) {
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    env(g, t, vol * gain, attack, dur);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function noise({ filter = 'bandpass', freq = 1000, to = null, q = 1, vol = 0.3, dur = 0.15, attack = 0.003, delay = 0, gain = 1 }) {
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = filter; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    const g = ctx.createGain();
    env(g, t, vol * gain, attack, dur);
    s.connect(f).connect(g).connect(master);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  const rnd = (a, b) => a + Math.random() * (b - a);

  // --- the sound palette ---
  const SOUNDS = {
    chop(k) { noise({ freq: rnd(800, 1100), q: 1.5, vol: 0.5, dur: 0.08, gain: k }); tone({ freq: 150, to: 70, vol: 0.45, dur: 0.1, gain: k }); },
    treeFall(k) { tone({ freq: 140, to: 55, type: 'sawtooth', vol: 0.12, dur: 0.4, attack: 0.05, gain: k }); noise({ filter: 'lowpass', freq: 500, to: 120, vol: 0.4, dur: 0.6, delay: 0.25, gain: k }); },
    pop(k) { tone({ freq: rnd(520, 640), to: rnd(850, 1000), vol: 0.18, dur: 0.06, gain: k }); },
    place(k) { tone({ freq: rnd(420, 480), type: 'triangle', vol: 0.14, dur: 0.05, gain: k }); },
    build(k) { [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, type: 'triangle', vol: 0.25, dur: 0.22, delay: i * 0.07, gain: k })); noise({ freq: 3000, vol: 0.08, dur: 0.3, delay: 0.25, gain: k }); },
    levelup(k) { [392, 523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, type: 'square', vol: 0.1, dur: 0.12, delay: i * 0.05, gain: k })); tone({ freq: 1568, vol: 0.12, dur: 0.4, delay: 0.25, gain: k }); },
    sell(k) { tone({ freq: 880, vol: 0.16, dur: 0.06, gain: k }); tone({ freq: 1320, vol: 0.16, dur: 0.12, delay: 0.05, gain: k }); },
    coin(k) { tone({ freq: rnd(1150, 1300), to: rnd(1500, 1700), vol: 0.12, dur: 0.07, gain: k }); },
    hit(k) { noise({ freq: 600, q: 1, vol: 0.4, dur: 0.07, gain: k }); tone({ freq: 130, to: 70, vol: 0.35, dur: 0.09, gain: k }); },
    arrow(k) { noise({ filter: 'highpass', freq: 2500, to: 900, vol: 0.12, dur: 0.12, gain: k }); },
    bolt(k) { noise({ freq: 400, q: 2, vol: 0.25, dur: 0.2, gain: k }); tone({ freq: 220, to: 70, type: 'sawtooth', vol: 0.12, dur: 0.18, gain: k }); },
    tink(k) { tone({ freq: rnd(2300, 2600), vol: 0.14, dur: 0.12, gain: k }); tone({ freq: 3400, vol: 0.06, dur: 0.06, gain: k }); },
    clang(k) { tone({ freq: 410, type: 'square', vol: 0.12, dur: 0.35, gain: k }); tone({ freq: 637, type: 'square', vol: 0.08, dur: 0.3, gain: k }); noise({ filter: 'highpass', freq: 3000, vol: 0.2, dur: 0.12, gain: k }); },
    bearDown(k) { tone({ freq: rnd(170, 200), to: 60, type: 'sawtooth', vol: 0.14, dur: 0.35, attack: 0.02, gain: k }); noise({ filter: 'lowpass', freq: 700, to: 150, vol: 0.25, dur: 0.3, gain: k }); },
    bossDown(k) { tone({ freq: 120, to: 35, type: 'sawtooth', vol: 0.25, dur: 0.9, attack: 0.03, gain: k }); noise({ filter: 'lowpass', freq: 900, to: 80, vol: 0.5, dur: 1, gain: k }); [523, 659, 784].forEach((f, i) => tone({ freq: f, type: 'triangle', vol: 0.18, dur: 0.3, delay: 0.5 + i * 0.1, gain: k })); },
    hurt(k) { tone({ freq: 240, to: 110, type: 'square', vol: 0.16, dur: 0.12, gain: k }); },
    block(k) { tone({ freq: 950, type: 'triangle', vol: 0.16, dur: 0.08, gain: k }); noise({ filter: 'highpass', freq: 4000, vol: 0.1, dur: 0.05, gain: k }); },
    poison(k) { for (let i = 0; i < 3; i++) tone({ freq: rnd(280, 520), to: rnd(600, 800), vol: 0.1, dur: 0.07, delay: i * 0.08, gain: k }); },
    burst(k) { noise({ filter: 'lowpass', freq: 900, to: 180, vol: 0.45, dur: 0.6, gain: k }); for (let i = 0; i < 5; i++) tone({ freq: rnd(250, 600), to: rnd(700, 1000), vol: 0.07, dur: 0.08, delay: 0.05 + i * 0.06, gain: k }); },
    cure(k) { [659, 784, 988].forEach((f, i) => tone({ freq: f, type: 'triangle', vol: 0.16, dur: 0.18, delay: i * 0.06, gain: k })); },
    whoosh(k) { noise({ freq: 400, to: 1600, q: 2, vol: 0.14, dur: 0.35, attack: 0.05, gain: k }); },
    crack(k) { noise({ freq: 1300, q: 2, vol: 0.35, dur: 0.12, gain: k }); tone({ freq: 95, to: 60, vol: 0.3, dur: 0.12, gain: k }); },
    crash(k) { noise({ filter: 'lowpass', freq: 1200, to: 90, vol: 0.55, dur: 0.9, gain: k }); for (let i = 0; i < 4; i++) noise({ freq: rnd(900, 1500), q: 3, vol: 0.2, dur: 0.07, delay: 0.1 + i * 0.12, gain: k }); },
    hammer(k) { tone({ freq: 300, type: 'triangle', vol: 0.2, dur: 0.05, gain: k }); noise({ freq: 2200, q: 2, vol: 0.12, dur: 0.03, gain: k }); },
    horn(k) { tone({ freq: 220, type: 'sawtooth', vol: 0.08, dur: 0.6, attack: 0.08, gain: k }); tone({ freq: 330, type: 'sawtooth', vol: 0.06, dur: 0.6, attack: 0.08, gain: k }); },
    bossHorn(k) {
      [0, 0.7].forEach((d) => { tone({ freq: 110, type: 'sawtooth', vol: 0.12, dur: 0.6, attack: 0.1, delay: d, gain: k }); tone({ freq: 165, type: 'sawtooth', vol: 0.09, dur: 0.6, attack: 0.1, delay: d, gain: k }); });
      noise({ filter: 'lowpass', freq: 200, vol: 0.2, dur: 1.4, attack: 0.3, gain: k });
    },
    sizzle(k) { noise({ filter: 'highpass', freq: 5000, vol: 0.05, dur: 0.35, attack: 0.05, gain: k }); },
    defeat(k) { tone({ freq: 330, to: 80, type: 'sawtooth', vol: 0.15, dur: 1.1, gain: k }); tone({ freq: 247, to: 60, type: 'triangle', vol: 0.15, dur: 1.2, delay: 0.1, gain: k }); },
    click(k) { tone({ freq: 720, vol: 0.12, dur: 0.03, gain: k }); },
    full(k) { tone({ freq: 200, type: 'square', vol: 0.08, dur: 0.07, gain: k }); tone({ freq: 170, type: 'square', vol: 0.08, dur: 0.07, delay: 0.09, gain: k }); },
  };

  return {
    // call from a user gesture (first tap / PLAY) so phones allow sound
    unlock() {
      init();
      if (ctx && ctx.state === 'suspended') ctx.resume();
    },
    setListener(x, z) { listener.x = x; listener.z = z; },
    names: () => Object.keys(SOUNDS),
    // opts.force: build the sound even if the browser hasn't allowed audio yet (tests)
    play(name, opts = {}) {
      if (opts.force) init();
      if (muted || !ctx || (ctx.state !== 'running' && !opts.force) || !SOUNDS[name]) return;
      const now = ctx.currentTime;
      if (THROTTLE[name] && last[name] && now - last[name] < THROTTLE[name]) return;
      let k = opts.vol ?? 1;
      if (opts.at) {
        const d = Math.hypot(opts.at.x - listener.x, opts.at.z - listener.z);
        k *= Math.pow(Math.max(0, 1 - d / 24), 1.3);
        if (k < 0.04) return;
      }
      last[name] = now;
      SOUNDS[name](k);
    },
    get muted() { return muted; },
    setMuted(v) {
      muted = v;
      try { localStorage.setItem(MUTE_KEY, v ? '1' : '0'); } catch { /* ignore */ }
      if (master) master.gain.value = v ? 0 : 0.55;
    },
  };
}
