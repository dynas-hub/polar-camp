// Wave rules: when the next wave comes (elastic timer), what it holds (bears, plus bosses
// slotted in after the first ones), and sending them out one by one.
import { WAVES, BOSSES, WORLD } from './config.js';
import { t as tr, tName } from './i18n.js';

export function createWaves({ hud, fx, sfx, events, now, save, bears, spawnBear }) {
  // won: the Bear King is beaten (endless mode). kingDue: he has been called and isn't beaten yet,
  // so a defeat brings him back at the next wave.
  const waves = { n: 0, timer: WAVES.firstDelay, total: WAVES.firstDelay, queue: [], gap: 0, won: false, kingDue: false };

  // the final wave (or, for saves already past it, their next boss wave) brings the Bear King alone
  function bossesFor(n) {
    const regular = WAVES.bossesFor(n);
    if (waves.won || n < WORLD.finalWave) return regular;
    if (n === WORLD.finalWave || waves.kingDue || regular.length) return ['king'];
    return regular;
  }
  const kingAlive = () => bears.some((b) => b.kind === 'king' && !b.dying) || waves.queue.some((q) => q.kind === 'king');

  function startWave() {
    waves.n++;
    const n = waves.n;
    const bosses = bossesFor(n);
    const final = bosses.includes('king');
    if (final) waves.kingDue = true;
    // the King comes alone (he calls his own bears in phase 2)
    const count = final ? 0 : WAVES.countFor(n);
    const hpMult = WAVES.hpScale(n);
    for (let i = 0; i < count; i++) waves.queue.push({ kind: 'normal', hpMult, n });
    // bosses arrive after the first regular bears
    bosses.forEach((kind, i) => waves.queue.splice(Math.min(waves.queue.length, 2 + i * 3), 0, { kind, hpMult: WAVES.bossScale(n), n }));
    if (final) {
      hud.banner(tr('banner.king'));
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
    // the final fight has the stage to itself: the countdown waits until the King falls
    if (!kingAlive()) waves.timer -= dt;
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

  return { waves, startWave, updateWaves, kingAlive };
}
