// Save / load: the whole game state as one JSON entry in localStorage.
// The key keeps the old name: renaming it would wipe every player's save.
import * as Models from './models.js';

export const SAVE_KEY = 'polarcamp-save-v1';
const SPECIALS = ['heartwood', 'vial', 'plate']; // rare boss items, saved wherever they are

export function createSave({
  useSave, saveKey, auto, getCash, setCash, built, levels, waves, woodpile, walls, towers, zones, upgrades,
  player, drops, pendingUps, spawn, countOf, stackFree, pushStack, makeItem, dropItem, layoutStack,
  construct, refreshUnlocks, refreshLabel, applyLevel, addWood, damageWall, wallLook, wallMax, armorMax,
  toBallista, toPoisonBallista,
}) {
  function save() {
    if (!useSave || auto.used) return; // autopilot runs are for footage; never overwrite the player's save
    try {
      localStorage.setItem(saveKey, JSON.stringify({
        v: 1, cash: getCash(), built: [...built], levels, wave: waves.n, won: waves.won, kingDue: waves.kingDue, woodpile: woodpile.count,
        walls: Object.fromEntries(walls.map((w) => [w.side, Math.round(w.hp)])),
        ballistas: towers.filter((t) => t.ballista).map((t) => t.id),
        poisonBallistas: towers.filter((t) => t.poison).map((t) => t.id),
        // rare boss items must never vanish: the ones in your bag or still on the ground...
        specials: Object.fromEntries(SPECIALS.map((k) => [k, countOf(player.c, k) + drops.filter((d) => d.type === k).length])),
        // ...and what you already put into a tower's BALLISTA / POISON BOLTS square
        towerUps: towers.filter((t) => t.up && Object.keys(t.up.paid).length).map((t) => ({ id: t.id, kind: t.up.kind, paid: t.up.paid })),
        paid: Object.fromEntries([...zones, ...upgrades].filter((z) => z.state === 'open' && z.paid > 0).map((z) => [z.def.id, z.paid])),
      }));
    } catch { /* storage unavailable: play without saving */ }
  }

  function load() {
    if (!useSave) return false;
    let s = null;
    try { s = JSON.parse(localStorage.getItem(saveKey) || 'null'); } catch { s = null; }
    if (!s || s.v !== 1) return false;
    // levels first: wall hp depends on the axe level
    for (const k in levels) levels[k] = s.levels?.[k] || 0;
    for (const z of zones) if (s.built?.includes(z.def.id)) construct(z, true);
    // milestone flags that aren't buildings (e.g. 'firstPlate' unlocks the ARMOR square)
    for (const id of s.built || []) built.add(id);
    refreshUnlocks();
    for (const t of towers) if (s.ballistas?.includes(t.id)) toBallista(t, true);
    for (const t of towers) if (t.ballista && s.poisonBallistas?.includes(t.id)) toPoisonBallista(t, true);
    for (const u of s.towerUps || []) pendingUps[u.id] = u;
    for (const w of walls) {
      const hp = s.walls?.[w.side];
      if (hp !== undefined && hp < wallMax()) { w.hp = wallMax(); if (hp <= 0) damageWall(w, wallMax()); else { w.hp = hp; wallLook(w); } }
    }
    for (const u of upgrades) {
      const lv = s.levels?.[u.def.id] || 0;
      levels[u.def.id] = lv;
      u.level = lv;
      if (u.state === 'open' || lv > 0) applyLevel(u);
    }
    for (const z of [...zones, ...upgrades]) {
      const p = s.paid?.[z.def.id];
      if (p && z.state === 'open') { z.paid = Math.min(p, z.total - 1); refreshLabel(z); Models.setPadProgress(z.pad, z.paid / z.total); }
    }
    if (s.woodpile && woodpile.built) addWood(s.woodpile);
    waves.n = s.wave || 0;
    waves.won = !!s.won;
    waves.kingDue = !!s.kingDue;
    setCash(s.cash || 0);
    player.armor = armorMax();
    // give the rare items back (in the bag, or on the ground next to you if it's full)
    for (const k of SPECIALS) {
      for (let i = 0; i < (s.specials?.[k] || 0); i++) {
        if (stackFree(player.c) > 0) pushStack(player.c, k, makeItem(k));
        else dropItem(k, spawn, 1.5);
      }
    }
    layoutStack(player.c);
    return true;
  }

  function resetSave() {
    try { localStorage.removeItem(saveKey); } catch { /* ignore */ }
  }

  return { save, load, resetSave };
}
