// "Juice": particles, flying items, floating text, screen shake, snowfall.
import * as THREE from 'three';
import { world } from './worlds.js';

const tmp = new THREE.Vector3();

export function createFx(scene, camera, labelsEl, stageEl) {
  const particles = [];
  const flyers = [];
  const texts = [];
  let shake = 0;

  const pGeo = new THREE.BoxGeometry(1, 1, 1);
  const pMats = new Map();
  const pMat = (color) => {
    if (!pMats.has(color)) pMats.set(color, new THREE.MeshBasicMaterial({ color }));
    return pMats.get(color);
  };

  function burst(pos, color, count = 8, { speed = 4, size = 0.12, up = 4, life = 0.6 } = {}) {
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(pGeo, pMat(color));
      m.position.copy(pos);
      const s = size * (0.6 + Math.random() * 0.8);
      m.scale.setScalar(s);
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      scene.add(m);
      particles.push({ m, vx: Math.cos(a) * v, vy: up * (0.5 + Math.random()), vz: Math.sin(a) * v, life, max: life, s });
    }
  }

  // Fly an object along an arc to a (possibly moving) target, then call onDone.
  function fly(obj, from, getTarget, { duration = 0.35, arc = 1.6, spin = true, onDone } = {}) {
    obj.position.copy(from);
    scene.add(obj);
    flyers.push({ obj, from: from.clone(), getTarget, t: 0, duration, arc, spin, onDone });
  }

  function text(worldPos, str, cls = '', { rise = 60, life = 0.9 } = {}) {
    const el = document.createElement('div');
    el.className = 'float-text ' + cls;
    el.textContent = str;
    labelsEl.appendChild(el);
    texts.push({ el, pos: worldPos.clone(), t: 0, life, rise });
  }

  function addShake(amount) { shake = Math.min(0.6, shake + amount); }

  // Weather around the camera target, from the world's look: snowfall on the polar map,
  // slow sea-breeze sparkles on the island (count, color, size, fall speed, sideways drift).
  const W = world().look.weather;
  const SNOW = W.count;
  const snowGeo = new THREE.BufferGeometry();
  const snowPos = new Float32Array(SNOW * 3);
  for (let i = 0; i < SNOW; i++) {
    snowPos[i * 3] = (Math.random() - 0.5) * 40;
    snowPos[i * 3 + 1] = Math.random() * 18;
    snowPos[i * 3 + 2] = (Math.random() - 0.5) * 40;
  }
  snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
  const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ color: W.color, size: W.size, transparent: true, opacity: W.opacity, depthWrite: false }));
  snow.frustumCulled = false;
  scene.add(snow);

  function toScreen(pos) {
    tmp.copy(pos).project(camera);
    const r = stageEl.getBoundingClientRect();
    return { x: (tmp.x * 0.5 + 0.5) * r.width, y: (-tmp.y * 0.5 + 0.5) * r.height, behind: tmp.z > 1 };
  }

  function update(dt, focus) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      p.vy -= 14 * dt;
      p.m.position.x += p.vx * dt;
      p.m.position.y = Math.max(0.1, p.m.position.y + p.vy * dt);
      p.m.position.z += p.vz * dt;
      p.m.rotation.x += dt * 8; p.m.rotation.y += dt * 6;
      p.m.scale.setScalar(p.s * Math.max(0, p.life / p.max));
      if (p.life <= 0) { scene.remove(p.m); particles.splice(i, 1); }
    }

    for (let i = flyers.length - 1; i >= 0; i--) {
      const f = flyers[i];
      f.t += dt / f.duration;
      const k = Math.min(1, f.t);
      const target = f.getTarget();
      f.obj.position.lerpVectors(f.from, target, k);
      f.obj.position.y += Math.sin(k * Math.PI) * f.arc;
      if (f.spin) f.obj.rotation.y += dt * 12;
      if (k >= 1) {
        scene.remove(f.obj);
        flyers.splice(i, 1);
        f.onDone && f.onDone(f.obj);
      }
    }

    for (let i = texts.length - 1; i >= 0; i--) {
      const t = texts[i];
      t.t += dt;
      const s = toScreen(t.pos);
      const k = t.t / t.life;
      t.el.style.left = s.x + 'px';
      t.el.style.top = (s.y - k * t.rise) + 'px';
      t.el.style.opacity = String(Math.min(1, 2 - k * 2));
      t.el.style.transform = `translate(-50%, -50%) scale(${k < 0.15 ? 0.6 + k * 3 : 1})`;
      if (t.t >= t.life) { t.el.remove(); texts.splice(i, 1); }
    }

    const arr = snowGeo.attributes.position.array;
    for (let i = 0; i < SNOW; i++) {
      arr[i * 3 + 1] -= dt * W.fall * (1 + (i % 5) * 0.2);
      arr[i * 3] += Math.sin((arr[i * 3 + 1] + i) * 0.5) * dt * W.drift;
      if (arr[i * 3 + 1] < 0) arr[i * 3 + 1] += 18;
    }
    snowGeo.attributes.position.needsUpdate = true;
    snow.position.set(focus.x, 0, focus.z);

    shake = Math.max(0, shake - dt * 2.2);
  }

  function shakeOffset() {
    if (shake <= 0) return { x: 0, y: 0 };
    return { x: (Math.random() - 0.5) * shake, y: (Math.random() - 0.5) * shake };
  }

  return { burst, fly, text, addShake, update, shakeOffset, toScreen, flyingCount: () => flyers.length };
}
