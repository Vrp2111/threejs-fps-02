// Procedural textures drawn once on offscreen canvases: no image assets, no
// network. Each returns a THREE.CanvasTexture with repeat wrapping.
import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function speckle(ctx, w, h, n, alpha, dark) {
  for (let i = 0; i < n; i++) {
    const v = dark ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${Math.random() * alpha})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

function makeGround() {
  const [c, ctx] = canvas(512, 512);
  // Light sun-bleached concrete: must read in a screenshot, not swallow
  // the light. Speckles, joints, lane paint stay bright.
  ctx.fillStyle = '#6a6d70'; ctx.fillRect(0, 0, 512, 512);
  speckle(ctx, 512, 512, 5200, 0.10, false);
  speckle(ctx, 512, 512, 3600, 0.12, true);
  // expansion joints
  ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 3;
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath(); ctx.moveTo(i * 128, 0); ctx.lineTo(i * 128, 512); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * 128); ctx.lineTo(512, i * 128); ctx.stroke();
  }
  // faded lane paint
  ctx.fillStyle = 'rgba(240,168,48,0.75)';
  ctx.fillRect(248, 40, 16, 90); ctx.fillRect(248, 200, 16, 90); ctx.fillRect(248, 360, 16, 90);
  ctx.fillStyle = 'rgba(77,163,255,0.6)';
  ctx.fillRect(60, 250, 90, 12); ctx.fillRect(360, 250, 90, 12);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(8, 6);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeContainer(base, rust) {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = base; ctx.fillRect(0, 0, 256, 256);
  // corrugation
  for (let x = 0; x < 256; x += 16) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(x, 0, 6, 256);
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x + 8, 0, 4, 256);
  }
  // rust streaks
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = `rgba(${rust},${Math.random() * 0.25 + 0.08})`;
    const x = Math.random() * 256;
    ctx.fillRect(x, Math.random() * 120, 2 + Math.random() * 5, 40 + Math.random() * 120);
  }
  speckle(ctx, 256, 256, 900, 0.08, true);
  // stencil label
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = 'bold 26px monospace'; ctx.textAlign = 'center';
  ctx.fillText('EMBR-07', 128, 138);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeCrate() {
  const [c, ctx] = canvas(128, 128);
  ctx.fillStyle = '#a8875c'; ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, 122, 122);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(128, 128); ctx.moveTo(128, 0); ctx.lineTo(0, 128);
  ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 4; ctx.stroke();
  for (let y = 0; y < 128; y += 16) {
    ctx.fillStyle = 'rgba(0,0,0,0.10)'; ctx.fillRect(0, y, 128, 2);
  }
  speckle(ctx, 128, 128, 500, 0.1, true);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeWall() {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#b8b3a6'; ctx.fillRect(0, 0, 256, 256);
  speckle(ctx, 256, 256, 2600, 0.09, true);
  speckle(ctx, 256, 256, 1600, 0.07, false);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(0, 120, 256, 8); ctx.fillRect(0, 8, 256, 4);
  // hazard band near the base
  for (let x = 0; x < 256; x += 32) {
    ctx.fillStyle = (x / 32) % 2 ? 'rgba(240,168,48,0.75)' : 'rgba(20,20,20,0.75)';
    ctx.beginPath(); ctx.moveTo(x, 256); ctx.lineTo(x + 32, 256); ctx.lineTo(x + 16, 228); ctx.lineTo(x - 16, 228); ctx.closePath(); ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeGlowDot() {
  const [c, ctx] = canvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createTextures() {
  return {
    ground: makeGround(),
    containerA: makeContainer('#b4552d', '120,40,10'),
    containerB: makeContainer('#2f6f6a', '10,60,50'),
    containerC: makeContainer('#c08a2e', '120,70,10'),
    crate: makeCrate(),
    wall: makeWall(),
    glow: makeGlowDot(),
  };
}
