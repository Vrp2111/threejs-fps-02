// Player arsenal: one state object per weapon, spread/recoil model,
// grenade projectiles with bounce physics. Bots fire
// through combat.js directly with their own aim model (see bots.js).
import * as THREE from 'three';
import { WEAPONS } from './config.js';

const DEG = Math.PI / 180;

export function createWeaponSet(camera, audio, effects) {
  // Viewmodel: a gun built from boxes, parented to the camera. The
  // materials are mid-grey with a warm accent stripe, so the gun reads
  // against a bright yard instead of vanishing into a black blob.
  const view = new THREE.Group();
  camera.add(view);
  const matDark = new THREE.MeshStandardMaterial({ color: 0x5a616d, roughness: 0.45, metalness: 0.15 });
  const matMid = new THREE.MeshStandardMaterial({ color: 0x8b929e, roughness: 0.5, metalness: 0.15 });
  const matWood = new THREE.MeshStandardMaterial({ color: 0x8a6238, roughness: 0.8, metalness: 0.1 });
  const matAccent = new THREE.MeshStandardMaterial({ color: 0xf0a830, roughness: 0.4, metalness: 0.2 });
  const parts = {};
  let muzzle = null;

  function buildViewmodel(def) {
    while (view.children.length) view.remove(view.children[0]);
    const g = new THREE.Group();
    const add = (geo, mat, x, y, z, sx = 1, sy = 1, sz = 1) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z); m.scale.set(sx, sy, sz);
      g.add(m); return m;
    };
    const box = new THREE.BoxGeometry(1, 1, 1);
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 10);
    const long = def.id === 'sniper' || def.id === 'rifle';
    const len = def.id === 'pistol' ? 0.34 : def.id === 'shotgun' ? 0.72 : long ? 0.78 : 0.6;
    // receiver + barrel + grip + magazine + sight, scaled per weapon
    add(box, matDark, 0, 0, 0, 0.09, 0.11, len * 0.62);
    add(cyl, matMid, 0, 0.012, -len * 0.62, 0.028, len * 0.7, 0.028).rotation.x = Math.PI / 2;
    add(box, matWood, 0, -0.085, 0.06, 0.07, 0.12, 0.09).rotation.x = 0.25;
    if (def.id !== 'pistol') add(box, matDark, 0, -0.12, -0.08, 0.06, 0.16, 0.07).rotation.x = -0.12;
    add(box, matDark, 0, 0.075, -0.05, 0.03, 0.05, 0.22);
    if (def.id === 'sniper') {
      add(cyl, matDark, 0, 0.1, -0.1, 0.035, 0.3, 0.035).rotation.x = Math.PI / 2;
      add(box, matAccent, 0, 0.062, 0.1, 0.05, 0.02, 0.1);
    } else if (def.id === 'dmr') {
      // The DMR wears a long scope and a bipod lug: it reads as the
      // precision rifle at a glance, not a second rifle.
      add(cyl, matDark, 0, 0.1, -0.12, 0.032, 0.34, 0.032).rotation.x = Math.PI / 2;
      add(box, matAccent, 0, 0.062, 0.1, 0.05, 0.02, 0.12);
      add(box, matMid, 0, -0.09, -0.3, 0.04, 0.1, 0.04);
    } else if (def.id === 'rifle') {
      add(box, matAccent, 0, 0.062, 0.08, 0.05, 0.02, 0.08);
    }
    if (def.id === 'shotgun') add(cyl, matWood, 0, -0.02, -len * 0.5, 0.035, len * 0.5, 0.035).rotation.x = Math.PI / 2;
    muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.01, -len * 0.95);
    g.add(muzzle);
    // Small and low-right, like a real FPS viewmodel: at 0.8 scale, 0.55 m
    // out it reads as a rifle in the hands, not a black slab. Metalness
    // under 0.2 so the gun renders grey, not near-black with no env map.
    g.scale.setScalar(0.8);
    g.position.set(0.22, -0.28, -0.55);
    view.add(g);
    parts.group = g;
  }

  const instances = {};
  function getInstance(id) {
    if (!instances[id]) {
      const d = WEAPONS[id];
      instances[id] = { def: d, mag: d.mag, reserve: d.reserve, reloading: false, reloadEnd: 0, lastShot: -1e9, bloom: 0 };
    }
    return instances[id];
  }

  // Module-level temps: firing must not allocate in the hot loop.
  const _bx = new THREE.Vector3();
  const _by = new THREE.Vector3();
  const _d2 = new THREE.Vector3();
  const _mp = new THREE.Vector3();
  const _end = new THREE.Vector3();

  let current = getInstance('pistol');
  let kick = 0; // viewmodel kick, 0..1
  let adsAmount = 0;
  buildViewmodel(current.def);

  function equip(id) {
    current = getInstance(id);
    buildViewmodel(current.def);
    return current;
  }

  function ready(now) {
    return !current.reloading && now - current.lastShot >= current.def.rateMs / 1000;
  }

  function startReload(now) {
    if (current.reloading || current.mag === current.def.mag || current.reserve <= 0) return false;
    current.reloading = true;
    current.reloadEnd = now + current.def.reloadMs / 1000;
    audio.reload();
    return true;
  }

  function update(now, dt, ads) {
    adsAmount += ((ads ? 1 : 0) - adsAmount) * Math.min(1, dt * 14);
    if (current.reloading && now >= current.reloadEnd) {
      const need = current.def.mag - current.mag;
      const take = Math.min(need, current.reserve);
      current.mag += take;
      current.reserve -= take;
      current.reloading = false;
    }
    // Bloom decays; viewmodel settles.
    current.bloom = Math.max(0, current.bloom - dt * 2.2);
    kick = Math.max(0, kick - dt * 7);
    if (parts.group) {
      parts.group.position.z = -0.55 + kick * 0.09 + adsAmount * -0.12;
      parts.group.position.x = 0.22 - adsAmount * 0.22;
      parts.group.position.y = -0.28 + adsAmount * 0.075;
      parts.group.rotation.x = kick * 0.12;
    }
  }

  // Total spread in degrees for the current shot.
  function spreadDeg(moveSpeed, airborne, ads) {
    const d = current.def;
    let s = d.spread;
    s += d.moveSpread * Math.min(1, moveSpeed / 4.6);
    if (airborne) s += d.airSpread;
    s += current.bloom;
    if (ads) s *= d.adsMult;
    return s;
  }

  // Fire one trigger pull. Returns a HUD/killfeed summary, or null when
  // it cannot fire. `shoot` is combat.raycast bound by main.js.
  function fire(now, origin, dir, moveSpeed, airborne, ads, shoot, selfId) {
    if (!ready(now) || current.mag <= 0) { if (current.mag <= 0) audio.dryFire(); return null; }
    current.lastShot = now;
    current.mag -= 1;
    const d = current.def;
    current.bloom = Math.min(d.bloomMax, current.bloom + d.bloom);
    kick = 1;
    const spread = spreadDeg(moveSpeed, airborne, ads) * DEG;
    const pellets = d.pellets || 1;
    let hitAny = false, killed = null, headshot = false, totalDmg = 0;
    // Orthonormal basis of the aim direction, reused for every pellet.
    if (Math.abs(dir.x) < 0.9) _bx.set(1, 0, 0); else _bx.set(0, 1, 0);
    _bx.cross(dir).normalize();
    _by.crossVectors(dir, _bx).normalize();
    muzzle.getWorldPosition(_mp);
    for (let p = 0; p < pellets; p++) {
      // Random point in a disc around the aim direction.
      const a = Math.random() * Math.PI * 2;
      const r = spread * Math.sqrt(Math.random());
      const px = Math.cos(a) * r, py = Math.sin(a) * r;
      _d2.copy(dir).addScaledVector(_bx, px).addScaledVector(_by, py).normalize();
      const hit = shoot(origin.x, origin.y, origin.z, _d2.x, _d2.y, _d2.z, d.range, selfId);
      _end.set(hit.px, hit.py, hit.pz);
      if (hit.bot) {
        hitAny = true;
        if (hit.part === 'head') headshot = true;
        totalDmg += hit.damage;
        if (hit.killed) killed = hit.bot;
      } else if (hit.part === 'world') {
        effects.impact(hit.px, hit.py, hit.pz, 0xffc46a, 8);
      }
      // One tracer per pellet, from the muzzle.
      effects.tracer(_mp, _end, d.tracer);
    }
    audio.shot(d.sound, 0);
    effects.muzzle(muzzle.getWorldPosition(_mp));
    return { hit: hitAny, killed, headshot, damage: totalDmg };
  }

  // Grenades
  const grenades = [];
  const GRAV = 13;
  function throwGrenade(type, origin, dir, power) {
    grenades.push({
      type, fuse: type === 'frag' ? 1.7 : 99,
      pos: origin.clone(), vel: dir.clone().multiplyScalar(power).add(new THREE.Vector3(0, 2.2, 0)),
      bounced: false, armAt: 0, dead: false,
    });
    return true;
  }

  function updateGrenades(dt, world, onEvent) {
    for (const g of grenades) {
      if (g.dead) continue;
      g.vel.y -= GRAV * dt;
      g.pos.addScaledVector(g.vel, dt);
      // Ground bounce.
      if (g.pos.y < 0.14) {
        g.pos.y = 0.14;
        if (Math.abs(g.vel.y) > 1) { g.vel.y *= -0.38; g.vel.x *= 0.6; g.vel.z *= 0.6; audio.bounce(); }
        else { g.vel.y = 0; g.vel.x *= 0.86; g.vel.z *= 0.86; }
        if (!g.bounced) { g.bounced = true; if (g.type !== 'frag') g.armAt = 0.35; }
      }
      // Wall bounce: push out along the smallest penetration axis.
      for (let i = 0; i < world.colliders.length; i++) {
        const c = world.colliders[i];
        if (g.pos.x > c.minX - 0.12 && g.pos.x < c.maxX + 0.12 && g.pos.y > c.minY - 0.12 && g.pos.y < c.maxY + 0.12 && g.pos.z > c.minZ - 0.12 && g.pos.z < c.maxZ + 0.12) {
          const dxl = g.pos.x - (c.minX - 0.12), dxr = (c.maxX + 0.12) - g.pos.x;
          const dzl = g.pos.z - (c.minZ - 0.12), dzr = (c.maxZ + 0.12) - g.pos.z;
          const dyl = g.pos.y - (c.minY - 0.12), dyr = (c.maxY + 0.12) - g.pos.y;
          const m = Math.min(dxl, dxr, dzl, dzr, dyl, dyr);
          if (m === dxl) { g.pos.x = c.minX - 0.12; g.vel.x = -Math.abs(g.vel.x) * 0.4; }
          else if (m === dxr) { g.pos.x = c.maxX + 0.12; g.vel.x = Math.abs(g.vel.x) * 0.4; }
          else if (m === dzl) { g.pos.z = c.minZ - 0.12; g.vel.z = -Math.abs(g.vel.z) * 0.4; }
          else if (m === dzr) { g.pos.z = c.maxZ + 0.12; g.vel.z = Math.abs(g.vel.z) * 0.4; }
          else if (m === dyl) { g.pos.y = c.minY - 0.12; g.vel.y = -Math.abs(g.vel.y) * 0.4; }
          else { g.pos.y = c.maxY + 0.12; g.vel.y = Math.abs(g.vel.y) * 0.4; }
          if (!g.bounced) { g.bounced = true; if (g.type !== 'frag') g.armAt = 0.35; audio.bounce(); }
        }
      }
      if (g.type === 'frag') {
        g.fuse -= dt;
        if (g.fuse <= 0) { g.dead = true; onEvent('explode', g); }
      } else if (g.bounced) {
        g.armAt -= dt;
        if (g.armAt <= 0) { g.dead = true; onEvent(g.type, g); }
      }
    }
  }

  function muzzleWorld(out) { return muzzle.getWorldPosition(out); }

  return {
    get current() { return current; },
    get adsAmount() { return adsAmount; },
    equip, ready, startReload, update, spreadDeg, fire, throwGrenade, updateGrenades, muzzleWorld,
    refill(id) { const inst = getInstance(id); inst.mag = inst.def.mag; inst.reserve = inst.def.reserve; },
  };
}
