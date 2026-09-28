// Floating virtual joystick (touch or mouse drag anywhere) + WASD / arrow keys.
// Exposes a normalized move vector {x, z} where -z is "up" on screen.

const MAX_R = 50;

export function createInput(stage) {
  const base = document.getElementById('joy-base');
  const knob = document.getElementById('joy-knob');
  const move = { x: 0, z: 0 };
  const keys = new Set();
  let pointerId = null;
  let ox = 0, oy = 0, jx = 0, jy = 0;
  let enabled = false;

  const stageRect = () => stage.getBoundingClientRect();

  stage.addEventListener('pointerdown', (e) => {
    if (!enabled || pointerId !== null || e.target.closest('button')) return;
    pointerId = e.pointerId;
    const r = stageRect();
    ox = e.clientX - r.left; oy = e.clientY - r.top;
    jx = jy = 0;
    base.style.left = ox + 'px'; base.style.top = oy + 'px';
    base.style.display = 'block';
    knob.style.transform = 'translate(0,0)';
  });

  window.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pointerId) return;
    const r = stageRect();
    let dx = e.clientX - r.left - ox, dy = e.clientY - r.top - oy;
    const d = Math.hypot(dx, dy);
    if (d > MAX_R) { dx *= MAX_R / d; dy *= MAX_R / d; }
    jx = dx / MAX_R; jy = dy / MAX_R;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  });

  const release = (e) => {
    if (e.pointerId !== pointerId) return;
    pointerId = null; jx = jy = 0;
    base.style.display = 'none';
  };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);

  window.addEventListener('keydown', (e) => keys.add(e.key.toLowerCase()));
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());

  return {
    move,
    setEnabled(v) { enabled = v; if (!v) { pointerId = null; jx = jy = 0; base.style.display = 'none'; } },
    update() {
      let kx = 0, kz = 0;
      if (keys.has('a') || keys.has('q') || keys.has('arrowleft')) kx -= 1;
      if (keys.has('d') || keys.has('arrowright')) kx += 1;
      if (keys.has('w') || keys.has('z') || keys.has('arrowup')) kz -= 1;
      if (keys.has('s') || keys.has('arrowdown')) kz += 1;
      let x = jx + kx, z = jy + kz;
      const len = Math.hypot(x, z);
      if (len > 1) { x /= len; z /= len; }
      // small dead zone so a resting thumb doesn't drift
      if (len < 0.12) { x = 0; z = 0; }
      move.x = x; move.z = z;
    },
  };
}
