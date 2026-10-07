// The island's rule: the tide. A full cycle every TIDE.periodWaves waves.
// The shoreline is measured from the camp's edge (the camp's walls, plus the annex once it's built):
// at low tide the beach goes out TIDE.low m around the camp; at high tide the sea surrounds the camp
// and floods everything outside it (owner, 2026-10-06): only the camp and what's inside stay dry.
// Wading slows everyone (you, workers, bears) to TIDE.slow; flooded palms can't be chopped.
// Each low tide leaves driftwood and a little loot on the beach; the rising sea takes back the wood
// nobody picked up. Worlds without the 'tide' gimmick get a tide that never does anything.
import * as THREE from 'three';
import { TIDE, WAVES, CAMP_HALF, ANNEX_END } from './config.js';
import { world } from './worlds.js';
import { t as tr } from './i18n.js';

const NONE = { level: () => Infinity, fraction: () => 0, rising: () => false, slowAt: () => 1, flooded: () => false, update() {}, high: () => false };

// expanded() tells whether the annex is built (it becomes part of the dry camp)
export function createTide({ scene, fx, sfx, player, events, now, dropItem, drops, expanded }) {
  if (world().gimmick !== 'tide') return NONE;
  const look = world().look;

  // the dry land: the camp's rectangle (main camp, + the annex once built)
  const rect = () => [-CAMP_HALF, CAMP_HALF, -CAMP_HALF, expanded() ? ANNEX_END : CAMP_HALF];
  // distance from (x, z) to that rectangle (0 inside)
  const fromCamp = (x, z) => {
    const [x0, x1, z0, z1] = rect();
    const dx = Math.max(x0 - x, 0, x - x1), dz = Math.max(z0 - z, 0, z - z1);
    return Math.hypot(dx, dz);
  };

  // One water plane over the whole map; the shader cuts out the dry land (a rounded rectangle that
  // grows and shrinks with the tide) and paints shallow water and a line of foam along the shore.
  const uniforms = {
    uShore: { value: TIDE.low }, uRect: { value: new THREE.Vector4(...rect()) },
    uShallow: { value: new THREE.Color(0x7fd6ea) }, uTime: { value: 0 },
  };
  const material = new THREE.MeshLambertMaterial({ color: look.sea });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vXZ;\nuniform float uShore;\nuniform vec4 uRect;\nuniform vec3 uShallow;\nuniform float uTime;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 lo = vec2(uRect.x, uRect.z), hi = vec2(uRect.y, uRect.w);
        vec2 q = max(max(lo - vXZ, vXZ - hi), 0.0);
        float e = length(q) - uShore;          // meters from the shoreline, into the sea
        if (e < 0.0) discard;                  // dry land
        diffuseColor.rgb = mix(uShallow, diffuseColor.rgb, smoothstep(0.0, 5.0, e));
        float foam = 1.0 - smoothstep(0.0, 0.6 + 0.25 * sin(uTime * 3.0), e);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), foam * 0.85);`);
  };
  const water = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), material);
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.035;
  water.renderOrder = 1;
  scene.add(water);

  const period = () => TIDE.periodWaves * WAVES.interval;
  let t = 0, shore = TIDE.low, wasRising = false;
  let washed = true; // the map starts at low tide, with nothing on the beach yet

  // shoreline (meters from the camp's edge): starts at low tide, comes in, goes back out (a smooth cosine)
  const shoreAt = (time) => TIDE.high + (TIDE.low - TIDE.high) * (0.5 + 0.5 * Math.cos((time / period()) * Math.PI * 2));
  const risingAt = (time) => Math.sin((time / period()) * Math.PI * 2) > 0;

  function update(dt) {
    if (dt <= 0) return; // paused or before PLAY
    t += dt;
    shore = shoreAt(t);
    uniforms.uShore.value = shore;
    uniforms.uRect.value.set(...rect());
    uniforms.uTime.value = now();
    const rising = risingAt(t);
    if (rising && !wasRising) {
      washed = false;
      fx.text(player.pos.clone().setY(3), tr('fx.tideRising'), 'warn', { life: 1.6, rise: 50 });
      sfx.play('whoosh');
      events.push({ type: 'tide', state: 'rising', t: now() });
    }
    wasRising = rising;
    // the rising sea takes back the wood left lying in the water (driftwood nobody picked up)
    if (rising) {
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        if (d.type === 'log' && !d.claim && fromCamp(d.pos.x, d.pos.z) > shore) { scene.remove(d.mesh); drops.splice(i, 1); }
      }
    }
    // low tide reached: the sea leaves things on the beach
    if (!rising && !washed && shore > TIDE.low - 0.3) { washed = true; washUp(); }
  }

  // driftwood and a small loot bag on the beach, 18 to 30 m from the middle of the camp
  function washUp() {
    for (let i = 0; i < TIDE.driftwood + 1; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 18 + Math.random() * 12;
      const at = new THREE.Vector3(Math.cos(a) * d, 0.2, Math.sin(a) * d);
      if (i < TIDE.driftwood) dropItem('log', at, 1.2);
      else dropItem('loot', at, 1, TIDE.loot);
    }
    fx.text(player.pos.clone().setY(3), tr('fx.lowTide'), 'cash', { life: 1.8, rise: 50 });
    events.push({ type: 'tide', state: 'low', t: now() });
  }

  const inWater = (x, z) => fromCamp(x, z) > shore;
  return {
    level: () => shore,
    // 0 = low tide, 1 = high tide (the HUD gauge)
    fraction: () => (TIDE.low - shore) / (TIDE.low - TIDE.high),
    rising: () => risingAt(t),
    high: () => shore < (TIDE.high + TIDE.low) / 2,
    // speed factor for anything walking at `pos`
    slowAt: (pos) => (inWater(pos.x, pos.z) ? TIDE.slow : 1),
    // a palm standing in the water can't be chopped
    flooded: (tree) => inWater(tree.x, tree.z),
    update,
  };
}
