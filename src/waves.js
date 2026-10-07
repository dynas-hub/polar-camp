// Wave rules: when the next wave comes (elastic timer), what it holds (bears, plus bosses
// slotted in after the first ones), and sending them out one by one.
import { WAVES, BOSSES } from './config.js';
import { world } from './worlds.js';
import { t as tr, tName } from './i18n.js';

export function createWaves({ hud, fx, sfx, events, now, save, bears, spawnBear }) {
  // won: the map's final boss is beaten (endless mode). finalDue: it has been called and isn't beaten
  // yet, so a defeat brings it back at the next wave.
  const waves = { n: 0, timer: WAVES.firstDelay, total: WAVES.firstDelay, queue: [], gap: 0, won: false, finalDue: false };

  // the final wave (or, for saves already past it, their next boss wave) brings the final boss alone
  function bossesFor(n) {
    const W = world(), regular = WAVES.bossesFor(n);
    // (a world whose final boss isn't built yet, like the island's shell bear, just keeps going: previews only)
    if (waves.won || !BOSSES[W.finalBoss] || n < W.finalWave) return regular;
    if (n === W.finalWave || waves.finalDue || regular.length) return [W.finalBoss];
    return regular;
  }
  const isFinal = (kind) => !!BOSSES[kind]?.final;
  const finalAlive = () => bears.some((b) => b.def.final && !b.dying) || waves.queue.some((q) => isFinal(q.kind));

  function startWave() {
    waves.n++;
    const n = waves.n;
    const bosses = bossesFor(n);
    const final = bosses.find(isFinal);
    if (final) waves.finalDue = true;
    // the final boss comes alone (the King calls his own bears in phase 2)
    const count = final ? 0 : WAVES.countFor(n);
    const hpMult = WAVES.hpScale(n);
    for (let i = 0; i < count; i++) waves.queue.push({ kind: 'normal', hpMult, n });
    // bosses arrive after the first regular bears
    bosses.forEach((kind, i) => waves.queue.splice(Math.min(waves.queue.length, 2 + i * 3), 0, { kind, hpMult: WAVES.bossScale(n), n }));
    if (final) {
      hud.banner(tr('banner.' + final)); // banner.king, ...
      fx.addShake(0.6);
      sfx.play('kingRoar');
      sfx.play('bossHorn');
      events.push({ type: 'boss', kinds: bosses, n, t: now() });
    } else if (bosses.length) {
      const names = [...new Set(bosses)].map((k) => {
        const c = bosses.filter((x) => x === k).length;
        return tName(BOSSES[k].name) + (c > 1 ? ` ×${c}` : '');
      });
      hud.banner(`⚠ ${names.join(' + ')}!`);
      fx.addShake(0.4);
      sfx.play('bossHorn');
      events.push({ type: 'boss', kinds: bosses, n, t: now() });
    } else { hud.banner(tr('banner.wave', { n })); sfx.play('horn'); }
    fx.addShake(0.2);
    events.push({ type: 'wave', n: waves.n, t: now() });
    waves.timer = waves.total = WAVES.interval;
    save();
  }

  // called every frame while the player is alive
  function updateWaves(dt) {
    // the final fight has the stage to itself: the countdown waits until the final boss falls
    if (!finalAlive()) waves.timer -= dt;
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

  return { waves, startWave, updateWaves, finalAlive };
}
