// Bears and bosses: spawning, hits and armor plates, death drops and the boss shockwave,
// chasing and chewing on walls, the log thrower's logs, the poison bear's cloud and the Bear King
// (ground slam, phase 2: summons + ice blocks; his death wins the map through `victory`).
// Everything else in the game reaches bears through what createBears returns.
import * as THREE from 'three';
import { PLAYER, BEAR, BOSSES, POISON, WAVES, BALLISTA } from './config.js';
import * as Models from './models.js';
import { t as tr, tName } from './i18n.js';
import { lerpAngle, dist2d } from './util.js';

const V = () => new THREE.Vector3();
const tmpA = V();

// now() = game clock, wave() = current wave number; the rest are the game's own objects and actions.
export function createBears({
  scene, camera, fx, sfx, player, walls, towers, wallColliders, events, stats, now, wave,
  towerMult, learn, dropItem, resolve, damageWall, damageTower, hurtPlayer, poisonPlayer, victory,
}) {
  const bears = [];

  const clouds = [];      // poison bear death clouds
  const thrown = [];      // logs in flight from log throwers

  // kind: 'normal' or a BOSSES key. hpMult scales late waves.
  // n = the wave it belongs to (normal bears bite harder in later waves)
  // at = spawn around this point instead of the edge of the map (bears called by the King)
  function spawnBear(kind, hpMult = 1, n = wave(), at = null) {
    const boss = kind !== 'normal';
    const def = boss ? BOSSES[kind] : BEAR;
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4; // mostly from the north
    const obj = Models.makeBear(kind);
    obj.scale.setScalar(def.scale);
    const pos = at ? at.clone().add(new THREE.Vector3(Math.cos(a * 3) * 2.8, 0, Math.sin(a * 3) * 2.8)).setY(0)
      : new THREE.Vector3(Math.cos(a) * WAVES.spawnRadius, 0, Math.sin(a) * WAVES.spawnRadius);
    obj.position.copy(pos);
    const bar = Models.makeHealthBar(boss ? 1.6 : 1, 0xff4d4d);
    bar.visible = false;
    scene.add(obj, bar);
    let armorBar = null;
    if (def.armor) { armorBar = Models.makeHealthBar(1.6, 0xb8c7d6); scene.add(armorBar); }
    const maxHp = Math.round(def.hp * hpMult);
    const maxArmor = def.armor ? Math.round(def.armor * hpMult) : 0;
    bears.push({
      obj, pos, def, kind, boss, hp: maxHp, maxHp, armor: maxArmor, maxArmor, armorBar, hpMult,
      bite: boss ? def.damage : Math.round(BEAR.damage(Math.max(1, n)) * 10) / 10,
      attackT: def.attackRate, throwT: def.firstThrow ?? def.throwEvery ?? 0, bubbleT: 0,
      slamT: def.slamEvery ?? 0, iceT: def.iceEvery ?? 0, rage: false, slamRing: null,
      bar, flash: 0, lunge: 0, walkT: Math.random() * 6, dying: 0, vel: V(),
    });
  }

  // `from` is the player's position for axe hits, null for tower shots.
  // `pierce` = heavy ballista bolt: cracks armor instead of bouncing off.
  function hurtBear(b, dmg, from, pierce = false) {
    if (b.dying) return;
    const at = b.pos.clone().setY(1 * b.def.scale);
    b.bar.visible = true;
    if (b.armor > 0) {
      if (!from && !pierce) {
        // arrows bounce off the plates
        fx.burst(at.clone().setY(1.2 * b.def.scale), 0xfff3a0, 4, { speed: 3, up: 2, size: 0.06 });
        if (Math.random() < 0.35) fx.text(at.clone().setY(2 * b.def.scale), tr('fx.tink'), 'warn', { life: 0.5, rise: 30 });
        sfx.play('tink', { at: b.pos });
        return;
      }
      // the axe (or a ballista bolt) breaks the armor first
      b.armor = Math.max(0, b.armor - (from ? dmg : BALLISTA.armorDamage * towerMult()));
      b.flash = 0.1;
      fx.burst(at.clone().setY(1.3 * b.def.scale), 0xc9d3dc, 6, { speed: 4, up: 3, size: 0.1 });
      const left = Math.ceil(b.armor / (b.maxArmor / b.def.plates));
      const plates = b.obj.userData.plates;
      sfx.play(plates.length > left ? 'clang' : 'block', { at: b.pos });
      while (plates.length > left) {
        const p = plates.pop();
        const wp = p.getWorldPosition(V());
        p.parent.remove(p);
        const fall = b.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 0.1, (Math.random() - 0.5) * 3));
        fx.fly(p, wp, () => fall, { duration: 0.5, arc: 2, onDone: () => {} });
        fx.text(at.clone().setY(2.3 * b.def.scale), tr(b.armor > 0 ? 'fx.crack' : 'fx.armorBroken'), 'warn', { life: 1, rise: 60 });
        fx.addShake(0.15);
      }
      if (b.armorBar) Models.setHealth(b.armorBar, b.armor / b.maxArmor);
      return;
    }
    b.hp -= dmg;
    b.flash = 0.12;
    Models.setHealth(b.bar, b.hp / b.maxHp);
    if (from) sfx.play('hit', { at: b.pos });
    fx.burst(at, 0xffffff, 5, { speed: 3, up: 3 });
    fx.burst(at, 0xe04848, 3, { speed: 3, up: 3, size: 0.09 });
    fx.text(at.clone().setY(1.8 * b.def.scale), String(dmg), 'hurt', { life: 0.6, rise: 40 });
    if (from) {
      tmpA.subVectors(b.pos, from).setY(0).normalize().multiplyScalar(b.boss ? 0.15 : 0.45);
      b.pos.add(tmpA);
    }
    if (b.hp <= 0) {
      killBear(b);
      if (from) learn('fight'); // `from` is set only for the player's axe (towers pass null)
    }
  }

  function killBear(b) {
    b.dying = 0.001;
    if (b.slamRing) { scene.remove(b.slamRing); b.slamRing = null; }
    b.bar.visible = false;
    if (b.armorBar) b.armorBar.visible = false;
    fx.burst(b.pos.clone().setY(0.8), 0xffffff, b.boss ? 30 : 14, { speed: 5, up: 5, size: 0.2 });
    fx.addShake(b.boss ? 0.5 : 0.12);
    if (b.boss) {
      fx.text(b.pos.clone().setY(3), tr('fx.bossDown', { name: tName(b.def.name) }), 'warn', { life: 1.5, rise: 90 });
      // shockwave: every bear on the map is stunned for a few seconds (time to heal and clean up)
      const ring = b.pos.clone().setY(0.4);
      fx.burst(ring, 0xfff3a0, 28, { speed: 12, up: 0.5, size: 0.22, life: 0.6 });
      if (b.def.final) {
        // the King's fall: a huge shockwave knocks out every bear on the map, and the map is won
        fx.burst(ring, 0xbfeaff, 40, { speed: 18, up: 1, size: 0.3, life: 0.9 });
        fx.addShake(1);
        for (const o of bears) if (o !== b && !o.dying) killBear(o);
        victory(b);
      } else for (const o of bears) if (o !== b && !o.dying) o.stunT = WAVES.bossStun;
      if (bears.some((o) => o.stunT > 0 && !o.dying)) fx.text(b.pos.clone().setY(5.2), tr('fx.shockwave'), 'warn', { life: 1.6, rise: 70 });
    }
    sfx.play(b.boss ? 'bossDown' : 'bearDown', { at: b.pos });
    events.push({ type: 'kill', kind: b.kind, t: now() });
    stats.kills++;
    for (let i = 0; i < (b.def.meat || 0); i++) dropItem('meat', b.pos);
    for (let i = 0; i < (b.def.toxic || 0); i++) dropItem('toxic', b.pos);
    for (let i = 0; i < (b.def.plateDrops || 0); i++) dropItem('plate', b.pos, 1.6);
    for (let i = 0; i < (b.def.heartwood || 0); i++) dropItem('heartwood', b.pos, 1.2);
    for (let i = 0; i < (b.def.vial || 0); i++) dropItem('vial', b.pos, 1.2);
    if (b.def.cash) dropItem('loot', b.pos, 1, b.def.cash);
    if (b.kind === 'poison') {
      // swells, then bursts into a poison cloud: step back!
      const mesh = Models.makeCloud();
      mesh.position.copy(b.pos).setY(0.8);
      mesh.scale.setScalar(0.5);
      scene.add(mesh);
      clouds.push({ mesh, pos: b.pos.clone(), t: 0, burst: false });
      fx.text(b.pos.clone().setY(3.5), tr('fx.stepBack'), 'hurt', { life: 1, rise: 50 });
    }
  }

  function updateBears(dt) {
    const P = player;
    for (let i = bears.length - 1; i >= 0; i--) {
      const b = bears[i];
      const ud = b.obj.userData;
      if (b.dying) {
        b.dying += dt;
        const k = Math.min(1, b.dying / 0.3);
        b.obj.scale.setScalar(b.def.scale * (1 - k));
        b.obj.rotation.z = k * 1.2;
        if (k >= 1) { scene.remove(b.obj, b.bar); if (b.armorBar) scene.remove(b.armorBar); bears.splice(i, 1); }
        continue;
      }
      const toP = tmpA.subVectors(P.pos, b.pos).setY(0);
      const dist = toP.length();
      const reach = b.def.radius + PLAYER.radius + 0.35;
      let moving = false;
      let faceX = P.pos.x, faceZ = P.pos.z;
      // stunned by a boss's shockwave: stands still, dizzy (stars), no bite
      const stunned = b.stunT > 0;
      if (stunned) {
        b.stunT -= dt;
        b.starT = (b.starT || 0) - dt;
        if (b.starT <= 0) { b.starT = 0.3; fx.burst(b.pos.clone().setY(2 * b.def.scale), 0xfff3a0, 2, { speed: 1.2, up: 1, size: 0.1, life: 0.5 }); }
      }
      // Log thrower: lobs logs from range at the closest target (a standing wall or you);
      // it only comes to bite when you're right next to it.
      // Bear King: slams the ground (stands still while the red ring fills), then phase 2
      const busy = b.kind === 'king' && !stunned && updateKing(b, dt, dist);
      const aim = b.kind === 'thrower' && !stunned && !P.dead && dist > reach + 0.3 ? throwerAim(b) : null;
      if (aim) {
        const dA = dist2d(b.pos, aim.point);
        faceX = aim.point.x; faceZ = aim.point.z;
        if (dA > b.def.range) {
          b.vel.set(aim.point.x - b.pos.x, 0, aim.point.z - b.pos.z).normalize().multiplyScalar(b.def.speed);
          moving = true;
        } else {
          b.vel.set(0, 0, 0);
          b.throwT -= dt;
          if (b.throwT <= 0) { b.throwT = b.def.throwEvery; b.lunge = 1; throwLog(b, aim); }
        }
      } else if (!stunned && !busy && !P.dead && dist > reach) {
        toP.normalize();
        b.vel.copy(toP).multiplyScalar(b.def.speed * (b.rage ? b.def.rage : 1));
        moving = true;
      } else b.vel.set(0, 0, 0);
      if (b.kind === 'poison') {
        b.bubbleT -= dt;
        if (b.bubbleT <= 0) { b.bubbleT = 0.25; fx.burst(b.pos.clone().setY(1.2 * b.def.scale), 0x9be36b, 1, { speed: 0.5, up: 2.5, size: 0.14, life: 0.7 }); }
      }
      // hit by a poison bolt: loses hp every second, armor or not
      if (b.poisonT > 0) {
        b.poisonT -= dt;
        b.poisonAcc = (b.poisonAcc || 0) + dt;
        if (b.poisonAcc >= 1) {
          b.poisonAcc -= 1;
          const tick = Math.round(BALLISTA.poisonDps * towerMult() * 10) / 10;
          b.hp -= tick;
          b.bar.visible = true;
          Models.setHealth(b.bar, b.hp / b.maxHp);
          fx.burst(b.pos.clone().setY(1.2 * b.def.scale), 0x8fe05a, 4, { speed: 1.5, up: 2.5, size: 0.1 });
          fx.text(b.pos.clone().setY(2 * b.def.scale), String(tick), 'cash', { life: 0.5, rise: 30 });
          if (b.hp <= 0) { killBear(b); continue; }
        }
      }
      // separation from other bears
      for (const o of bears) {
        if (o === b || o.dying) continue;
        const dx = b.pos.x - o.pos.x, dz = b.pos.z - o.pos.z;
        const min = b.def.radius + o.def.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min && d2 > 1e-6) {
          const d = Math.sqrt(d2), push = (min - d) * 0.5;
          b.pos.x += (dx / d) * push; b.pos.z += (dz / d) * push;
        }
      }
      b.pos.addScaledVector(b.vel, dt);
      resolve(b.pos, b.def.radius, false);
      if (Math.hypot(faceX - b.pos.x, faceZ - b.pos.z) > 0.01) b.obj.rotation.y = lerpAngle(b.obj.rotation.y, Math.atan2(faceX - b.pos.x, faceZ - b.pos.z), Math.min(1, dt * 8));

      // Blocked by a wall on the way to you? It chews on it (small damage, bosses hit harder):
      // fences wear down and cost wood to keep up.
      if (!P.dead && dist > reach + 0.1 && moving) {
        // walls, or a ballista standing in the way
        const touching = (c) => {
          const x = THREE.MathUtils.clamp(b.pos.x, c.minX, c.maxX), z = THREE.MathUtils.clamp(b.pos.z, c.minZ, c.maxZ);
          return Math.hypot(b.pos.x - x, b.pos.z - z) < b.def.radius + 0.12;
        };
        const chew = wallColliders.find(touching) || towers.find((t) => t.ballista && touching(t.box))?.box;
        if (chew) {
          b.wallT = (b.wallT ?? b.def.attackRate) - dt;
          if (b.wallT <= 0) {
            b.wallT = b.def.attackRate * 1.4;
            b.lunge = 1;
            // chews as hard as it is tough (the same wave scaling as its hp)
            const bite = Math.round((b.def.wallHit || 1) * b.hpMult * 10) / 10;
            if (chew.wall) damageWall(chew.wall, bite);
            else damageTower(chew.tower, bite);
          }
        }
      }

      if (!stunned && !busy && !P.dead && dist <= reach + 0.1) {
        b.attackT -= dt;
        if (b.attackT <= 0) {
          b.attackT = b.def.attackRate;
          b.lunge = 1;
          hurtPlayer(b.bite);
          if (b.kind === 'poison') poisonPlayer(POISON.bite);
        }
      } else b.attackT = Math.min(b.attackT, b.def.attackRate * 0.5);

      b.walkT += dt * (moving ? 10 : 0);
      ud.legs.forEach((l, j) => { l.rotation.x = moving ? Math.sin(b.walkT + (j % 2 ? Math.PI : 0) + (j > 1 ? Math.PI / 2 : 0)) * 0.5 : 0; });
      ud.body.position.y = moving ? Math.abs(Math.sin(b.walkT)) * 0.06 : 0;
      if (ud.cape) ud.cape.rotation.z = moving ? Math.sin(b.walkT) * 0.04 : 0;
      b.lunge = Math.max(0, b.lunge - dt * 4);
      ud.head.position.z = 0.75 + Math.sin(b.lunge * Math.PI) * 0.35;
      b.flash = Math.max(0, b.flash - dt);
      b.obj.scale.setScalar(b.def.scale * (1 + b.flash * 1.2));
      b.obj.position.copy(b.pos);
      b.bar.position.set(b.pos.x, 2 * b.def.scale, b.pos.z);
      b.bar.quaternion.copy(camera.quaternion);
      if (b.armorBar) {
        b.armorBar.visible = b.armor > 0 && b.bar.visible;
        b.armorBar.position.set(b.pos.x, 2 * b.def.scale + 0.18, b.pos.z);
        b.armorBar.quaternion.copy(camera.quaternion);
      }
      const held = b.obj.userData.heldLog;
      if (held) {
        // the log leaves its paws when thrown, comes back, and is raised overhead right before the next throw
        held.visible = b.throwT < b.def.throwEvery - 0.5;
        const windup = Math.max(0, 1 - b.throwT / 0.7);
        held.position.y = 1.15 + windup * 0.9;
        held.position.z = 0.65 - windup * 0.5;
      }
    }
    updateThrown(dt);
    updateClouds(dt);
  }

  // ---------- Bear King ----------
  // Returns true while he is busy slamming (he stands still).
  function updateKing(b, dt, dist) {
    const d = b.def, ud = b.obj.userData;
    if (!b.rage && b.hp <= b.maxHp * d.phase2) enrage(b);
    if (b.slamRing) {
      b.slamWarnT -= dt;
      const k = Math.min(1, 1 - b.slamWarnT / d.slamWarn);
      b.slamRing.userData.fill.scale.setScalar(Math.max(0.01, k));
      ud.body.rotation.x = -0.3 * k; // rears up on his hind legs
      if (b.slamWarnT <= 0) slam(b);
      return true;
    }
    // the slam only comes when you're close enough to be caught by it
    b.slamT -= dt;
    if (b.slamT <= 0 && !player.dead && dist < d.slamReach) {
      b.slamRing = Models.makeSlamRing();
      b.slamRing.position.set(b.pos.x, 0, b.pos.z);
      b.slamRing.scale.setScalar(d.slamRadius);
      b.slamRing.userData.fill.scale.setScalar(0.01);
      scene.add(b.slamRing);
      b.slamWarnT = d.slamWarn;
      sfx.play('slamWarn', { at: b.pos });
      return true;
    }
    if (b.rage) {
      b.iceT -= dt;
      if (b.iceT <= 0) {
        const aim = throwerAim(b);
        const dA = dist2d(b.pos, aim.point);
        // ice blocks are for the walls and ballistas (and for you, only from a distance)
        if (dA <= d.iceRange && (aim.wall || aim.tower || dA > 4)) { b.iceT = d.iceEvery; b.lunge = 1; throwIce(b, aim); }
        else b.iceT = 0.5;
      }
    }
    return false;
  }

  function slam(b) {
    const d = b.def, at = b.slamRing.position.clone();
    scene.remove(b.slamRing);
    b.slamRing = null;
    b.slamT = d.slamEvery;
    b.obj.userData.body.rotation.x = 0;
    fx.addShake(0.6);
    fx.burst(at.clone().setY(0.3), 0xffffff, 30, { speed: 10, up: 1.5, size: 0.22, life: 0.6 });
    fx.burst(at.clone().setY(0.3), 0xbfeaff, 16, { speed: 7, up: 3, size: 0.16, life: 0.7 });
    fx.text(at.clone().setY(4.5), tr('fx.slam'), 'warn', { life: 0.8, rise: 50 });
    sfx.play('slam', { at });
    if (!player.dead && dist2d(player.pos, at) < d.slamRadius) {
      tmpA.subVectors(player.pos, at).setY(0);
      if (tmpA.lengthSq() < 1e-4) tmpA.set(0, 0, 1);
      player.pos.addScaledVector(tmpA.normalize(), d.slamPush);
      resolve(player.pos, PLAYER.radius, true);
      hurtPlayer(d.slamDamage);
    }
  }

  // Phase 2: the last of the ice armor shatters, he roars, calls bears and gets faster.
  function enrage(b) {
    const d = b.def;
    b.rage = true;
    b.armor = 0;
    if (b.armorBar) b.armorBar.visible = false;
    const plates = b.obj.userData.plates;
    while (plates.length) {
      const p = plates.pop();
      const wp = p.getWorldPosition(V());
      p.parent.remove(p);
      const fall = b.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 0.1, (Math.random() - 0.5) * 3));
      fx.fly(p, wp, () => fall, { duration: 0.5, arc: 2, onDone: () => {} });
    }
    fx.text(b.pos.clone().setY(5), tr('fx.kingRoar'), 'warn', { life: 1.6, rise: 80 });
    fx.addShake(0.6);
    sfx.play('kingRoar', { at: b.pos });
    const n = wave();
    for (let i = 0; i < d.summon; i++) spawnBear('normal', WAVES.hpScale(n), n, b.pos);
    events.push({ type: 'kingPhase2', t: now() });
  }

  function throwIce(b, aim) {
    const mesh = Models.makeIceBlock();
    const from = b.pos.clone().setY(1.6 * b.def.scale);
    const to = aim.point.clone().setY(0.6);
    mesh.position.copy(from);
    scene.add(mesh);
    thrown.push({ mesh, from, to, t: 0, dur: 1.1, ice: true, wall: aim.wall, tower: aim.tower, dmg: Math.round(b.def.iceWallDamage * b.hpMult), hit: b.def.iceHit });
    sfx.play('whoosh', { at: b.pos });
  }

  // Closest target: you, or the closest point of a standing wall.
  function throwerAim(b) {
    let best = { point: player.pos.clone(), wall: null }, bestD = dist2d(b.pos, player.pos);
    for (const w of walls) {
      if (w.broken) continue;
      for (const c of w.colliders) {
        const x = THREE.MathUtils.clamp(b.pos.x, c.minX, c.maxX);
        const z = THREE.MathUtils.clamp(b.pos.z, c.minZ, c.maxZ);
        const d = Math.hypot(b.pos.x - x, b.pos.z - z);
        if (d < bestD) { bestD = d; best = { point: new THREE.Vector3(x, 0, z), wall: w }; }
      }
    }
    // ballistas are targets too (plain arrow towers aren't worth a log)
    for (const t of towers) {
      if (!t.ballista) continue;
      const d = Math.hypot(b.pos.x - t.x, b.pos.z - t.z);
      if (d < bestD) { bestD = d; best = { point: new THREE.Vector3(t.x, 0, t.z), wall: null, tower: t }; }
    }
    return best;
  }

  function throwLog(b, aim) {
    const mesh = Models.makeLog();
    mesh.scale.setScalar(1.3);
    const from = b.pos.clone().setY(1.6 * b.def.scale);
    // aim at where the player is now (they can dodge), or at the wall
    const to = aim.point.clone().setY(0.6);
    mesh.position.copy(from);
    scene.add(mesh);
    thrown.push({ mesh, from, to, t: 0, dur: 1.1, wall: aim.wall, tower: aim.tower, dmg: Math.round(b.def.wallDamage * b.hpMult), hit: b.def.hitDamage });
    sfx.play('whoosh', { at: b.pos });
  }

  function updateThrown(dt) {
    for (let i = thrown.length - 1; i >= 0; i--) {
      const l = thrown[i];
      l.t += dt / l.dur;
      const k = Math.min(1, l.t);
      l.mesh.position.lerpVectors(l.from, l.to, k);
      l.mesh.position.y += Math.sin(k * Math.PI) * 4;
      l.mesh.rotation.x += dt * 10;
      if (k < 1) continue;
      scene.remove(l.mesh);
      thrown.splice(i, 1);
      fx.burst(l.to.clone(), l.ice ? 0xbfeaff : 0xb57a3f, l.ice ? 14 : 8, { speed: 4, up: 3, size: 0.12 });
      if (l.ice) sfx.play('iceShatter', { at: l.to });
      if (l.wall && !l.wall.broken) damageWall(l.wall, l.dmg);
      else if (l.tower && l.tower.ballista) damageTower(l.tower, l.dmg);
      else if (!player.dead && dist2d(player.pos, l.to) < 1.3) hurtPlayer(l.hit);
      // half the logs stay on the ground: free wood for repairs
      if (!l.ice && Math.random() < 0.5) dropItem('log', l.to, 1.2);
    }
  }

  function updateClouds(dt) {
    for (let i = clouds.length - 1; i >= 0; i--) {
      const c = clouds[i];
      c.t += dt;
      if (!c.burst) {
        // warning: swells and pulses before bursting
        const k = c.t / POISON.cloudDelay;
        c.mesh.scale.setScalar(0.5 + k * 1.2 + Math.sin(c.t * 30) * 0.08);
        if (c.t >= POISON.cloudDelay) {
          c.burst = true;
          fx.burst(c.pos.clone().setY(0.8), 0x8fe05a, 26, { speed: 6, up: 3, size: 0.25, life: 0.8 });
          fx.addShake(0.25);
          sfx.play('burst', { at: c.pos });
          if (!player.dead && dist2d(player.pos, c.pos) < POISON.cloudRadius) poisonPlayer(POISON.cloud);
        }
      } else {
        const k = (c.t - POISON.cloudDelay) / 1;
        c.mesh.scale.setScalar(POISON.cloudRadius * (0.7 + k * 0.3));
        c.mesh.material.opacity = 0.35 * (1 - k);
        if (k >= 1) { scene.remove(c.mesh); clouds.splice(i, 1); }
      }
    }
  }

  return { bears, clouds, thrown, spawnBear, hurtBear, updateBears };
}
