// The scenery around the camp: ground, camp floor, campfire, tent, trees and rocks.
// Trees and rocks are seeded, so every game gets the same map. A world theme swaps these.
import * as THREE from 'three';
import { CAMP_HALF, TREE, ANNEX_END } from './config.js';
import * as Models from './models.js';
import { rng } from './util.js';

// addBox(x, z, halfWidth, halfDepth) registers a solid box (the tent).
export function buildScenery({ scene, addBox }) {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), Models.M.snow);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  scene.add(Models.makeCampFloor());

  const campfire = Models.makeCampfire();
  campfire.position.set(0, 0.12, -1);
  scene.add(campfire); // decoration: you can walk right over it
  // own flame materials so they can fade while the fire recharges (the grill shares the originals)
  campfire.userData.flames.forEach((f) => { f.material = f.material.clone(); f.material.transparent = true; });

  const tent = Models.makeTent();
  tent.position.set(-3.25, 0.12, 0.4);
  scene.add(tent);
  addBox(tent.position.x, tent.position.z, 0.95, 0.95);

  const rand = rng(7);
  const trees = [];
  let guard = 0;
  while (trees.length < TREE.count && guard++ < 5000) {
    const a = rand() * Math.PI * 2;
    const d = TREE.minDist + Math.sqrt(rand()) * (TREE.maxDist - TREE.minDist);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    // no trees on the camp or on the land kept for the expansion (south of the camp)
    if (Math.abs(x) < CAMP_HALF + 2.5 && z > -CAMP_HALF - 2.5 && z < ANNEX_END + 2.5) continue;
    // keep the camp's outer corners clear: workers walk around the walls through them
    const C = CAMP_HALF + 1.3;
    if (Math.abs(Math.abs(x) - C) < 2.5 && (Math.abs(Math.abs(z) - C) < 2.5 || Math.abs(z - (ANNEX_END + 1.3)) < 2.5)) continue;
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < TREE.spacing)) continue;
    const obj = Models.makeTree();
    const s = 0.85 + rand() * 0.35;
    obj.scale.setScalar(s);
    obj.position.set(x, 0, z);
    obj.rotation.y = rand() * 6;
    const stump = Models.makeStump();
    stump.position.set(x, 0, z);
    stump.visible = false;
    scene.add(obj, stump);
    trees.push({ obj, stump, x, z, s, hp: TREE.hp, alive: true, regrow: 0, shake: 0, grow: 1, claim: null });
  }
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2, d = 10 + rand() * 30;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (Math.abs(x) < CAMP_HALF + 1.5 && z > -CAMP_HALF - 1.5 && z < ANNEX_END + 1.5) continue;
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 1.6)) continue;
    const rock = Models.makeRock(0.7 + rand() * 0.9);
    rock.position.set(x, 0, z);
    scene.add(rock);
  }
  return { campfire, trees };
}
