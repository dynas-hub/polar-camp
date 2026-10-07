// The game can film itself: composites the 3D canvas + HUD text into one frame,
// then records it (MediaRecorder) or snaps a PNG. On the dev server the files are
// saved straight into devlog/clips and devlog/shots; elsewhere they download.

// renderNow re-renders the WebGL canvas so reading it outside the frame loop isn't blank.
export function createRecorder(stage, gameCanvas, renderNow) {
  const comp = document.createElement('canvas');
  const ctx = comp.getContext('2d');
  const onDevServer = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  let rec = null, chunks = [], recName = '';

  function drawText(el, sr, scale) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0) return;
    ctx.save();
    ctx.globalAlpha = +cs.opacity;
    ctx.font = `${cs.fontWeight} ${parseFloat(cs.fontSize) * scale}px ${cs.fontFamily}`;
    ctx.fillStyle = cs.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,.45)';
    ctx.shadowOffsetY = 2 * scale;
    ctx.shadowBlur = 3 * scale;
    // pills are "icon + value" on one row; labels can span several lines
    const oneLine = el.classList.contains('pill') || el.id === 'hint';
    const text = oneLine ? el.innerText.replace(/\s*\n\s*/g, ' ') : el.innerText;
    // wrap like the browser did: lines longer than the element's box are split on spaces
    const maxW = Math.max(40, (r.width - 20) * scale);
    const lines = [];
    for (const raw of text.split('\n')) {
      let cur = '';
      for (const word of raw.split(' ')) {
        const next = cur ? cur + ' ' + word : word;
        if (cur && ctx.measureText(next).width > maxW) { lines.push(cur); cur = word; } else cur = next;
      }
      lines.push(cur);
    }
    const lh = parseFloat(cs.fontSize) * scale * 1.15;
    const cx = (r.left - sr.left + r.width / 2) * scale;
    const cy = (r.top - sr.top + r.height / 2) * scale - ((lines.length - 1) * lh) / 2;
    // a thin dark outline under the text (like the game's CSS) keeps it readable on snow and white sand
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.5 * scale;
    ctx.strokeStyle = 'rgba(0,0,0,.55)';
    lines.forEach((ln, i) => ctx.strokeText(ln, cx, cy + i * lh));
    ctx.shadowColor = 'transparent';
    lines.forEach((ln, i) => ctx.fillText(ln, cx, cy + i * lh));
    ctx.restore();
  }

  function drawPill(el, sr, scale) {
    const r = el.getBoundingClientRect();
    ctx.save();
    ctx.fillStyle = 'rgba(20,35,50,.55)';
    ctx.beginPath();
    ctx.roundRect((r.left - sr.left) * scale, (r.top - sr.top) * scale, r.width * scale, r.height * scale, r.height * scale / 2);
    ctx.fill();
    ctx.restore();
  }

  function drawBar(el, fillEl, sr, scale, color) {
    const r = el.getBoundingClientRect(), f = fillEl.getBoundingClientRect();
    ctx.save();
    ctx.fillStyle = 'rgba(20,35,50,.5)';
    ctx.beginPath(); ctx.roundRect((r.left - sr.left) * scale, (r.top - sr.top) * scale, r.width * scale, r.height * scale, r.height * scale / 2); ctx.fill();
    ctx.fillStyle = color;
    if (f.width > 0) { ctx.beginPath(); ctx.roundRect((f.left - sr.left) * scale, (f.top - sr.top) * scale, f.width * scale, f.height * scale, f.height * scale / 2); ctx.fill(); }
    ctx.restore();
  }

  // Build one composited frame (3D + HUD) at the canvas' real resolution.
  function compose() {
    comp.width = gameCanvas.width; comp.height = gameCanvas.height;
    ctx.drawImage(gameCanvas, 0, 0);
    const sr = stage.getBoundingClientRect();
    const scale = gameCanvas.width / sr.width;
    stage.querySelectorAll('.pill, #hint:not(.hidden)').forEach((p) => drawPill(p, sr, scale));
    drawBar(document.getElementById('wave-bar'), document.getElementById('wave-fill'), sr, scale, '#ffa43d');
    drawBar(document.getElementById('hp'), document.getElementById('hp-fill'), sr, scale, '#6fdc5e');
    const show = (id) => !document.getElementById(id).classList.contains('hidden');
    if (show('armor-bar')) drawBar(document.getElementById('armor-bar'), document.getElementById('armor-fill'), sr, scale, '#9fd0ff');
    if (show('boss')) drawBar(document.getElementById('boss-bar'), document.getElementById('boss-fill'), sr, scale, '#ff5a3d');
    stage.querySelectorAll('.pill, #hint:not(.hidden), #wave-title, #boss:not(.hidden) #boss-name, .zone-label, .station-label, .float-text, #banner').forEach((el) => drawText(el, sr, scale));
    return comp;
  }

  async function snap(name) {
    renderNow();
    const url = compose().toDataURL('image/png');
    if (onDevServer) {
      await fetch(`/__snap?name=${encodeURIComponent(name)}`, { method: 'POST', body: url });
    } else download(url, `${name}.png`);
    return name;
  }

  function start(name = 'clip-' + Date.now()) {
    if (rec) return;
    recName = name;
    compose();
    const stream = comp.captureStream(60);
    const type = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t));
    rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8_000_000 });
    chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.start(500);
  }

  function stop() {
    if (!rec) return Promise.resolve(null);
    return new Promise((resolve) => {
      rec.onstop = async () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        rec = null;
        if (onDevServer) await fetch(`/__clip?name=${encodeURIComponent(recName)}`, { method: 'POST', body: blob });
        else download(URL.createObjectURL(blob), `${recName}.webm`);
        resolve({ name: recName, bytes: blob.size });
      };
      rec.stop();
    });
  }

  function download(url, filename) {
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
  }

  return {
    snap, start, stop, compose,
    get recording() { return !!rec; },
    frame() { if (rec) compose(); }, // call once per rendered frame while recording
  };
}
