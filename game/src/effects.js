// Pooled visual effects: tracers, impact sparks, muzzle flash and smoke.
// Nothing here allocates per frame: fixed pools of meshes and sprites are
// reused, and dead entries are hidden, never destroyed.
import * as THREE from 'three';

const TRACERS = 24;
const SPARKS = 320;
const SMOKES = 10;

export function createEffects(scene, glowTex) {
  // Tracers: thin additive boxes stretched between two points.
  const tracerGeo = new THREE.BoxGeometry(1, 1, 1);
  const tracers = [];
  for (let i = 0; i < TRACERS; i++) {
    const m = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({
      color: 0xffe9a8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    m.visible = false;
    scene.add(m);
    tracers.push({ mesh: m, life: 0 });
  }
  let tracerNext = 0;

  // Sparks: one THREE.Points cloud with a fixed buffer, positions updated in place.
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(SPARKS * 3);
  const sparkCol = new Float32Array(SPARKS * 3);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  sparkGeo.setAttribute('color', new THREE.BufferAttribute(sparkCol, 3));
  const sparkMat = new THREE.PointsMaterial({
    size: 0.09, vertexColors: true, map: glowTex, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.frustumCulled = false;
  scene.add(sparks);
  const sparkVel = new Float32Array(SPARKS * 3);
  const sparkLife = new Float32Array(SPARKS);
  let sparkNext = 0;

  // Smoke puffs: sprites that grow and fade. Each smoke is a blocker for bot
  // vision while alive (its centre + radius are read by bots.js).
  const smokes = [];
  for (let i = 0; i < SMOKES; i++) {
    const mat = new THREE.SpriteMaterial({ map: glowTex, color: 0x9aa0a8, transparent: true, opacity: 0, depthWrite: false });
    const s = new THREE.Sprite(mat);
    s.visible = false;
    scene.add(s);
    smokes.push({ sprite: s, life: 0, maxLife: 1, radius: 0, x: 0, y: 0, z: 0 });
  }
  let smokeNext = 0;

  // Muzzle flash: a sprite + point light at the gun, flashed for 40 ms.
  const flashMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xffd27a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const flash = new THREE.Sprite(flashMat);
  flash.scale.set(0.5, 0.5, 1);
  flash.visible = false;
  scene.add(flash);
  const flashLight = new THREE.PointLight(0xffc46a, 0, 9, 1.8);
  scene.add(flashLight);
  let flashLife = 0;

  // Bomb glow: pulsing point light at the planted charge.
  const bombLight = new THREE.PointLight(0xff3020, 0, 14, 1.6);
  scene.add(bombLight);

  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();

  function tracer(from, to, color) {
    const t = tracers[tracerNext];
    tracerNext = (tracerNext + 1) % TRACERS;
    tmpA.copy(from); tmpB.copy(to);
    const len = tmpA.distanceTo(tmpB);
    if (len < 0.1) return;
    t.mesh.visible = true;
    t.mesh.position.copy(tmpA).add(tmpB).multiplyScalar(0.5);
    t.mesh.lookAt(tmpB);
    t.mesh.scale.set(0.02, 0.02, len);
    t.mesh.material.color.setHex(color || 0xffe9a8);
    t.mesh.material.opacity = 0.9;
    t.life = 0.07;
  }

  function impact(x, y, z, colorHex, count) {
    for (let n = 0; n < (count || 10); n++) {
      const i = sparkNext;
      sparkNext = (sparkNext + 1) % SPARKS;
      sparkPos[i * 3] = x; sparkPos[i * 3 + 1] = y; sparkPos[i * 3 + 2] = z;
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 3.5;
      sparkVel[i * 3] = Math.cos(a) * sp;
      sparkVel[i * 3 + 1] = 1 + Math.random() * 3;
      sparkVel[i * 3 + 2] = Math.sin(a) * sp;
      sparkLife[i] = 0.35 + Math.random() * 0.25;
      const c = new THREE.Color(colorHex || 0xffc46a);
      sparkCol[i * 3] = c.r; sparkCol[i * 3 + 1] = c.g; sparkCol[i * 3 + 2] = c.b;
    }
    sparkGeo.attributes.position.needsUpdate = true;
    sparkGeo.attributes.color.needsUpdate = true;
  }

  function smoke(x, y, z) {
    const s = smokes[smokeNext];
    smokeNext = (smokeNext + 1) % SMOKES;
    s.x = x; s.y = y + 0.6; s.z = z;
    s.life = 18; s.maxLife = 18; s.radius = 4.2;
    s.sprite.visible = true;
    s.sprite.position.set(s.x, s.y, s.z);
    s.sprite.scale.set(1, 1, 1);
    s.sprite.material.opacity = 0.85;
  }

  function muzzle(pos) {
    flash.position.copy(pos);
    flash.visible = true;
    flash.material.opacity = 1;
    flashLight.position.copy(pos);
    flashLight.intensity = 26;
    flashLife = 0.045;
  }

  function update(dt) {
    for (let i = 0; i < TRACERS; i++) {
      const t = tracers[i];
      if (t.life > 0) {
        t.life -= dt;
        t.mesh.material.opacity = Math.max(0, t.life / 0.07) * 0.9;
        if (t.life <= 0) t.mesh.visible = false;
      }
    }
    let anySpark = false;
    for (let i = 0; i < SPARKS; i++) {
      if (sparkLife[i] > 0) {
        sparkLife[i] -= dt;
        sparkPos[i * 3] += sparkVel[i * 3] * dt;
        sparkPos[i * 3 + 1] += sparkVel[i * 3 + 1] * dt;
        sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt;
        sparkVel[i * 3 + 1] -= 9 * dt;
        if (sparkPos[i * 3 + 1] < 0.02) { sparkPos[i * 3 + 1] = 0.02; sparkVel[i * 3 + 1] *= -0.3; }
        anySpark = true;
      }
    }
    if (anySpark) sparkGeo.attributes.position.needsUpdate = true;
    for (let i = 0; i < SMOKES; i++) {
      const s = smokes[i];
      if (s.life > 0) {
        s.life -= dt;
        const age = 1 - s.life / s.maxLife;
        const scale = 2 + age * 7;
        s.sprite.scale.set(scale, scale * 0.8, 1);
        s.sprite.material.opacity = s.life < 4 ? (s.life / 4) * 0.75 : 0.75;
        if (s.life <= 0) { s.sprite.visible = false; s.radius = 0; }
      }
    }
    if (flashLife > 0) {
      flashLife -= dt;
      if (flashLife <= 0) { flash.visible = false; flashLight.intensity = 0; }
    }
  }

  function setBombLight(x, y, z, on, pulse) {
    bombLight.position.set(x, y, z);
    bombLight.intensity = on ? 8 + 8 * pulse : 0;
  }

  // Smoke blocks a bot's line of sight when the segment passes near a puff.
  function smokeBlocks(ax, ay, az, bx, by, bz) {
    for (let i = 0; i < SMOKES; i++) {
      const s = smokes[i];
      if (s.life <= 0) continue;
      // Distance from the smoke centre to the segment.
      const dx = bx - ax, dy = by - ay, dz = bz - az;
      const len2 = dx * dx + dy * dy + dz * dz;
      let t = len2 > 0 ? ((s.x - ax) * dx + (s.y - ay) * dy + (s.z - az) * dz) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const px = ax + dx * t - s.x, py = ay + dy * t - s.y, pz = az + dz * t - s.z;
      if (px * px + py * py + pz * pz < s.radius * s.radius) return true;
    }
    return false;
  }

  return { tracer, impact, smoke, muzzle, update, setBombLight, smokeBlocks, flash };
}
