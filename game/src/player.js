// Human player: accel movement with crouch and jump, AABB collision
// resolved one axis at a time, and a camera with recoil kick and head bob.
// Movement numbers live in config.js; this file only moves the body.
import * as THREE from 'three';
import { PLAYER } from './config.js';
import { clamp, damp } from './util.js';

export function createPlayer(world, audio) {
  const state = {
    pos: new THREE.Vector3(0, 0, 20),
    vel: new THREE.Vector3(),
    yaw: Math.PI, pitch: 0,
    crouch: false, onGround: true,
    health: PLAYER.health, armor: 0, hasKit: false,
    money: 800, alive: true,
    kills: 0, deaths: 0, assists: 0,
    weapons: { primary: null, side: null },
    slot: 'side',
    grenades: { frag: 0, smoke: 0, flash: 0, lava: 0 },
    recoilPitch: 0, recoilYaw: 0,
    bobPhase: 0, stepAcc: 0, landDip: 0,
    spectating: null,
  };
  const eye = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const wish = new THREE.Vector3();

  function height() { return state.crouch ? PLAYER.height * 0.62 : PLAYER.height; }
  function eyeHeight() { return state.crouch ? PLAYER.eyeCrouch : PLAYER.eyeStand; }

  function overlapBox(x, y, z) {
    const r = PLAYER.radius;
    const h = height();
    const minX = x - r, maxX = x + r, minY = y, maxY = y + h, minZ = z - r, maxZ = z + r;
    for (let i = 0; i < world.colliders.length; i++) {
      const c = world.colliders[i];
      if (maxX > c.minX && minX < c.maxX && maxY > c.minY && minY < c.maxY && maxZ > c.minZ && minZ < c.maxZ) return c;
    }
    return null;
  }

  function moveAxis(axis, delta) {
    if (delta === 0) return;
    const p = state.pos;
    if (axis === 0) p.x += delta; else if (axis === 1) p.y += delta; else p.z += delta;
    // clamp to the yard
    p.x = clamp(p.x, world.bounds.minX + PLAYER.radius, world.bounds.maxX - PLAYER.radius);
    p.z = clamp(p.z, world.bounds.minZ + PLAYER.radius, world.bounds.maxZ - PLAYER.radius);
    let guard = 0;
    let hit = overlapBox(p.x, p.y, p.z);
    while (hit && guard++ < 4) {
      const r = PLAYER.radius;
      const h = height();
      if (axis === 0) {
        if (delta > 0) p.x = hit.minX - r - 0.001; else p.x = hit.maxX + r + 0.001;
        state.vel.x = 0;
      } else if (axis === 2) {
        if (delta > 0) p.z = hit.minZ - r - 0.001; else p.z = hit.maxZ + r + 0.001;
        state.vel.z = 0;
      } else {
        if (delta > 0) { p.y = hit.minY - h - 0.001; state.vel.y = 0; }
        else { p.y = hit.maxY; state.vel.y = 0; state.onGround = true; }
      }
      hit = overlapBox(p.x, p.y, p.z);
    }
  }

  function update(dt, input) {
    if (!state.alive) return;
    const sin = Math.sin(state.yaw), cos = Math.cos(state.yaw);
    // Wish dir in world space (yaw 0 faces -Z; spawn yaw PI faces +Z).
    let ix = 0, iz = 0;
    if (input.forward) iz -= 1;
    if (input.back) iz += 1;
    if (input.left) ix -= 1;
    if (input.right) ix += 1;
    const len = Math.hypot(ix, iz);
    if (len > 0) { ix /= len; iz /= len; }
    // Forward is (-sin yaw, -cos yaw) in XZ; right is (cos yaw, -sin yaw).
    // iz is -1 while W is held, ix is +1 while D is held.
    wish.set(sin * iz + cos * ix, 0, cos * iz - sin * ix);
    const speed = state.crouch ? PLAYER.crouchSpeed : input.silent ? PLAYER.silentSpeed : PLAYER.walkSpeed;
    const accel = state.onGround ? PLAYER.accel : PLAYER.accel * PLAYER.airControl;
    state.vel.x += wish.x * accel * dt;
    state.vel.z += wish.z * accel * dt;
    // Friction when no input, on ground.
    if (len === 0 && state.onGround) {
      const f = Math.max(0, 1 - PLAYER.friction * dt);
      state.vel.x *= f; state.vel.z *= f;
    }
    // Cap horizontal speed.
    const hs = Math.hypot(state.vel.x, state.vel.z);
    if (hs > speed) {
      const s = speed / hs;
      state.vel.x *= s; state.vel.z *= s;
    }
    // Jump
    if (input.jump && state.onGround) {
      state.vel.y = PLAYER.jumpSpeed;
      state.onGround = false;
      audio.jump();
    }
    state.vel.y -= PLAYER.gravity * dt;
    const wasGround = state.onGround;
    state.onGround = false;
    moveAxis(0, state.vel.x * dt);
    moveAxis(2, state.vel.z * dt);
    moveAxis(1, state.vel.y * dt);
    if (state.pos.y <= 0) { state.pos.y = 0; state.vel.y = 0; state.onGround = true; }
    if (!wasGround && state.onGround && state.vel.y <= 0) state.landDip = 0.12;
    state.landDip = Math.max(0, state.landDip - dt * 0.5);
    // Recoil recovery and bob.
    state.recoilPitch = damp(state.recoilPitch, 0, 9, dt);
    state.recoilYaw = damp(state.recoilYaw, 0, 9, dt);
    const hSpeed = Math.hypot(state.vel.x, state.vel.z);
    state.bobPhase += hSpeed * dt * 1.9;
    state.stepAcc += hSpeed * dt;
    if (state.stepAcc > 2.4 && state.onGround && hSpeed > 0.5) {
      state.stepAcc = 0;
      audio.step(!input.silent);
    }
  }

  function applyCamera(camera, dt) {
    const bobY = Math.sin(state.bobPhase * 2) * 0.028 * Math.min(1, Math.hypot(state.vel.x, state.vel.z) / PLAYER.walkSpeed);
    const bobX = Math.cos(state.bobPhase) * 0.014 * Math.min(1, Math.hypot(state.vel.x, state.vel.z) / PLAYER.walkSpeed);
    eye.copy(state.pos);
    eye.y += eyeHeight() + bobY - state.landDip * 0.4;
    camera.position.copy(eye);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = state.yaw + state.recoilYaw + bobX * 0.01;
    camera.rotation.x = state.pitch + state.recoilPitch;
    camera.rotation.z = 0;
  }

  function eyePos(out) {
    out.copy(state.pos);
    out.y += eyeHeight();
    return out;
  }

  function forward(out) {
    const cp = Math.cos(state.pitch + state.recoilPitch);
    out.set(-Math.sin(state.yaw + state.recoilYaw) * cp, -Math.sin(state.pitch + state.recoilPitch), -Math.cos(state.yaw + state.recoilYaw) * cp);
    return out;
  }

  function groundSpeed() { return Math.hypot(state.vel.x, state.vel.z); }

  function damage(amount) {
    if (!state.alive) return false;
    let rest = amount;
    if (state.armor > 0) {
      const absorbed = Math.min(state.armor, amount * PLAYER.armorAbsorb);
      state.armor -= absorbed;
      rest = amount - absorbed;
    }
    state.health -= rest;
    if (state.health <= 0) { state.health = 0; state.alive = false; return true; }
    return false;
  }

  function reset(x, z, yaw) {
    state.pos.set(x, 0, z);
    state.vel.set(0, 0, 0);
    state.yaw = yaw; state.pitch = 0;
    state.health = PLAYER.health;
    state.alive = true;
    state.recoilPitch = 0; state.recoilYaw = 0;
    state.spectating = null;
    state.crouch = false;
  }

  return { state, update, applyCamera, eyePos, forward, groundSpeed, damage, reset };
}
