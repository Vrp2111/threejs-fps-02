// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the
// display's rate. Input, shooting, grenades, spectating and the deterministic
// ?shot= capture modes all live here; the game rules live in game.js.
// ?shot=start|buy|play|plant|end with &seed=N stages a frame, renders it,
// freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE, GEAR } from './config.js';
import { clamp } from './util.js';
import { createTextures } from './textures.js';
import { createWorld } from './world.js';
import { createPlayer } from './player.js';
import { createWeaponSet } from './weapons.js';
import { createCombat } from './combat.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createBots } from './bots.js';
import { createHud } from './hud.js';
import { createGame } from './game.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '7', 10) || 7;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(PALETTE.fog, 26, 85);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

// Dusk sun + sky fill.
const hemi = new THREE.HemisphereLight(PALETTE.sky, 0x3a2f28, 0.85);
scene.add(hemi);
const sun = new THREE.DirectionalLight(PALETTE.sun, 2.4);
sun.position.set(28, 34, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -42; sun.shadow.camera.right = 42;
sun.shadow.camera.top = 42; sun.shadow.camera.bottom = -42;
sun.shadow.camera.far = 110;
sun.shadow.bias = -0.0004;
scene.add(sun);
const fill = new THREE.DirectionalLight(0x6a7ea8, 0.5);
fill.position.set(-20, 18, -24);
scene.add(fill);

const textures = createTextures();
const world = createWorld(scene, textures);
const effects = createEffects(scene, textures.glow);
const audio = createAudio();
const hud = createHud();
const combat = createCombat(world);
const player = createPlayer(world, audio);
const weapons = createWeaponSet(camera, audio, effects);
const ps = player.state;

// Shared context: bots and game read the same object.
const playerProxy = {
  id: 'player', name: 'You', team: 'vanguard',
  pos: ps.pos, vel: ps.vel, alive: true, crouch: false,
};
const ctx = {
  scene, world, combat, effects, audio,
  now: 0, attackSite: 'A',
  getPlayer: () => playerProxy,
  onKill: (victim, killer, headshot) => game.onKill(victim, killer, headshot),
  onPlant: (bot) => game.onBotPlant(bot),
  onDefuse: (bot) => game.onBotDefuse(bot),
  onPlayerDamage: (amount, attacker, headshot) => game.onPlayerDamage(amount, attacker, headshot),
};
const bots = createBots(ctx);
const game = createGame(Object.assign(ctx, {
  player, bots, weapons, hud,
  shake: (amount) => { shakeLevel = Math.max(shakeLevel, amount); },
}));
const gs = game.state;

let shakeLevel = 0;
let flashLevel = 0;

// ---- Input ---------------------------------------------------------------
const keys = Object.create(null);
const input = { forward: false, back: false, left: false, right: false, crouch: false, jump: false, silent: false, plant: false };
let firing = false;
let firedThisClick = false;
let ads = false;
let grenadeSel = null; // 'frag' | 'smoke' | 'flash' | null
let locked = false;

function refreshInput() {
  input.forward = !!keys['KeyW'] || !!keys['ArrowUp'];
  input.back = !!keys['KeyS'] || !!keys['ArrowDown'];
  input.left = !!keys['KeyA'] || !!keys['ArrowLeft'];
  input.right = !!keys['KeyD'] || !!keys['ArrowRight'];
  input.crouch = !!keys['ControlLeft'] || !!keys['ControlRight'] || !!keys['KeyC'];
  input.jump = !!keys['Space'];
  input.silent = !!keys['ShiftLeft'] || !!keys['ShiftRight'];
  input.plant = !!keys['KeyE'];
}

const SHOP_ORDER = ['smg', 'rifle', 'shotgun', 'sniper', 'armor', 'kit', 'frag', 'smoke', 'flash'];

window.addEventListener('keydown', (e) => {
  if (e.code === 'Tab') {
    e.preventDefault();
    const rows = [{ name: 'You', kills: ps.kills, deaths: ps.deaths, team: 'vanguard' }]
      .concat(bots.bots.map((b) => ({ name: b.name, kills: b.kills || 0, deaths: b.deaths || 0, team: b.team })));
    rows.sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    hud.showScoreboard(true, rows);
    return;
  }
  keys[e.code] = true;
  refreshInput();
  if (e.code === 'KeyB' && gs.phase === 'freeze') {
    hud.showBuy(document.getElementById('buymenu').hidden, ps.money, ps.weapons.primary);
  }
  if (!document.getElementById('buymenu').hidden && /^Digit[1-9]$/.test(e.code)) {
    const id = SHOP_ORDER[Number(e.code.slice(5)) - 1];
    if (id && game.buyItem(id)) hud.showBuy(true, ps.money, ps.weapons.primary);
  }
  if (e.code === 'KeyR') weapons.startReload(ctx.now);
  const buyOpen = !document.getElementById('buymenu').hidden;
  if (!buyOpen && e.code === 'Digit1' && ps.weapons.primary) { weapons.equip(ps.weapons.primary); grenadeSel = null; }
  if (!buyOpen && e.code === 'Digit2') { weapons.equip('pistol'); grenadeSel = null; }
  if (!buyOpen && e.code === 'Digit4') {
    const avail = ['frag', 'smoke', 'flash'].filter((t) => ps.grenades[t] > 0);
    if (avail.length) {
      const i = avail.indexOf(grenadeSel);
      grenadeSel = avail[(i + 1) % avail.length];
      hud.toast(`Grenade: ${GEAR[grenadeSel].name} — click to throw`);
    } else { hud.toast('No grenades — buy them with B during freeze time'); }
  }
});
window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
  refreshInput();
  if (e.code === 'Tab') hud.showScoreboard(false);
});

renderer.domElement.addEventListener('mousedown', (e) => {
  if (!locked || shot) return;
  if (e.button === 0) { firing = true; firedThisClick = false; }
  if (e.button === 2) ads = true;
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) firing = false;
  if (e.button === 2) ads = false;
});
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('mousemove', (e) => {
  if (!locked) return;
  ps.yaw -= e.movementX * 0.0022;
  ps.pitch = clamp(ps.pitch - e.movementY * 0.0022, -1.5, 1.5);
});
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === renderer.domElement;
  if (!locked && !shot && (gs.phase === 'live' || gs.phase === 'freeze')) {
    hud.setOverlay('PAUSED', 'The round waits for you. Click to jump back in.', 'Resume');
  }
});

hud.onPlay(() => {
  audio.ensure();
  if (shot) return;
  if (gs.phase === 'menu' || gs.phase === 'matchEnd') {
    hud.hideOverlay();
    game.startMatch();
  } else {
    hud.hideOverlay();
  }
  renderer.domElement.requestPointerLock();
});
hud.onBuy((id) => {
  if (game.buyItem(id)) hud.showBuy(true, ps.money, ps.weapons.primary);
});

// ---- Shooting ------------------------------------------------------------
const _eye = new THREE.Vector3();
const _dir = new THREE.Vector3();

function shoot(ox, oy, oz, dx, dy, dz, range, selfId) {
  const hit = combat.raycast(ox, oy, oz, dx, dy, dz, range, bots.bots.filter((b) => b.team === 'hollow' && b.alive), selfId);
  hit.damage = 0;
  hit.killed = null;
  if (hit.bot) {
    const dmg = combat.damageFor(weapons.current.def, hit.t, hit.part);
    const wasAlive = hit.bot.alive;
    bots.damageBot(hit.bot, dmg, playerProxy, hit.part === 'head');
    hit.damage = dmg;
    if (wasAlive && !hit.bot.alive) hit.killed = hit.bot;
  }
  return hit;
}

function tryFire(now) {
  if (!ps.alive || gs.phase !== 'live') return;
  const w = weapons.current;
  if (!w.auto && firedThisClick) return;
  if (!weapons.ready(now)) return;
  if (grenadeSel) {
    if (ps.grenades[grenadeSel] > 0) {
      player.eyePos(_eye);
      player.forward(_dir);
      weapons.throwGrenade(grenadeSel, _eye, _dir, 13);
      ps.grenades[grenadeSel]--;
      grenadeSel = null;
      weapons.equip(ps.weapons.primary || 'pistol');
    }
    firedThisClick = true;
    return;
  }
  if (w.mag <= 0) { weapons.startReload(now); return; }
  player.eyePos(_eye);
  player.forward(_dir);
  const res = weapons.fire(now, _eye, _dir, player.groundSpeed(), !ps.onGround, ads, shoot, 'player');
  firedThisClick = true;
  if (!res) return;
  ps.recoilPitch += w.def.recoil * 0.011;
  ps.recoilYaw += (Math.random() - 0.5) * w.def.recoilYaw * 0.011;
  bots.hearShot(_eye, 'vanguard');
  if (res.hit) hud.hitmarker(!!res.killed);
}

// ---- Grenade events -------------------------------------------------------
function onGrenadeEvent(kind, g) {
  if (kind === 'explode') {
    effects.impact(g.pos.x, 0.5, g.pos.z, 0xff8030, 50);
    audio.explode();
    shakeLevel = Math.max(shakeLevel, 0.7);
    const R = 7;
    const pd = Math.hypot(ps.pos.x - g.pos.x, ps.pos.z - g.pos.z);
    if (ps.alive && pd < R && !world.losBlocked(g.pos.x, 0.5, g.pos.z, ps.pos.x, 1.2, ps.pos.z)) {
      const dmg = Math.round(90 * (1 - pd / R));
      if (player.damage(dmg)) game.onKill({ id: 'player', name: 'You', team: 'vanguard', pos: ps.pos }, null, false);
      else { hud.flashDamage(); audio.hurt(); }
    }
    for (const b of bots.bots) {
      if (!b.alive || b.team === 'vanguard') continue;
      const d = Math.hypot(b.pos.x - g.pos.x, b.pos.z - g.pos.z);
      if (d < R && !world.losBlocked(g.pos.x, 0.5, g.pos.z, b.pos.x, 1.2, b.pos.z)) {
        bots.damageBot(b, Math.round(90 * (1 - d / R)), playerProxy, false);
      }
    }
  } else if (kind === 'smoke') {
    effects.smoke(g.pos.x, g.pos.y, g.pos.z);
    audio.smoke();
  } else if (kind === 'flash') {
    audio.flash();
    bots.flashBlind(g.pos.x, g.pos.y + 0.5, g.pos.z, 1);
    // The player: blind when the pop is in view and in line of sight.
    player.eyePos(_eye);
    const d = Math.hypot(g.pos.x - _eye.x, g.pos.z - _eye.z);
    if (d < 26 && !world.losBlocked(g.pos.x, g.pos.y + 0.5, g.pos.z, _eye.x, _eye.y, _eye.z)) {
      player.forward(_dir);
      const dot = ((_dir.x * (g.pos.x - _eye.x) + _dir.z * (g.pos.z - _eye.z)) / Math.max(0.001, d));
      const facing = d < 3 ? 1 : Math.max(0, dot);
      flashLevel = Math.max(flashLevel, facing * (1 - d / 28));
    }
  }
}

// ---- Fixed-step simulation ------------------------------------------------
let now = 0;
let accumulator = 0;
let lastTime = performance.now();

function step(dt) {
  now += dt;
  ctx.now = now;
  playerProxy.alive = ps.alive;
  playerProxy.crouch = ps.crouch;

  if (gs.phase === 'live' || gs.phase === 'freeze') {
    player.update(dt, input);
    if (firing) tryFire(now);
    weapons.update(now, dt, ads);
    weapons.updateGrenades(dt, world, onGrenadeEvent);
    bots.update(dt, now, gs.phase, gs.bomb);
    game.update(dt, now, input);
    effects.update(dt);
  }

  // ADS field of view and scope.
  const w = weapons.current;
  const targetFov = ads ? 74 / (w.def.zoom || 1) : 74;
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 12);
  camera.updateProjectionMatrix();
  hud.setScope(ads && w.def.id === 'sniper');

  // HUD, throttled by the cache inside hud.js.
  hud.setHealth(ps.health, ps.armor);
  hud.setMoney(ps.money);
  hud.setAmmo(w.mag, w.reserve);
  hud.setReloading(w.reloading);
  hud.setWeapon(grenadeSel ? `${GEAR[grenadeSel].name} — THROW` : w.def.name, w.mag, w.reserve);
  hud.setCrosshairSpread(4 + weapons.spreadDeg(player.groundSpeed(), !ps.onGround, ads) * 3.2);
  hud.setCompass(ps.yaw);
  hud.setBombStatus(
    gs.bomb.state === 'planted' ? `BOMB LIVE — SITE ${gs.bomb.site} — ${Math.ceil(gs.bomb.fuse)}s`
    : gs.bomb.state === 'dropped' ? 'BOMB DROPPED'
    : gs.bomb.state === 'carried' && gs.bomb.carrier === 'player' ? 'YOU CARRY THE CHARGE'
    : '',
  );
  // Minimap: teammates always, enemies only while the player can see them.
  const visibleEnemies = [];
  if (ps.alive) {
    player.eyePos(_eye);
    for (const b of bots.bots) {
      if (b.team !== 'hollow' || !b.alive) continue;
      const d = Math.hypot(b.pos.x - _eye.x, b.pos.z - _eye.z);
      if (d < 42 && !world.losBlocked(_eye.x, _eye.y, _eye.z, b.pos.x, b.pos.y + 1.2, b.pos.z)) visibleEnemies.push(b);
    }
  }
  hud.updateMinimap(world, ps.pos, ps.yaw, bots.bots.filter((b) => b.team === 'vanguard'), visibleEnemies, gs.bomb);
  hud.tick(dt);

  // Flash decay.
  if (flashLevel > 0) {
    flashLevel = Math.max(0, flashLevel - dt * 0.45);
    hud.flashWhite(flashLevel);
  }
  shakeLevel = Math.max(0, shakeLevel - dt * 2.2);
}

function render() {
  if (ps.alive) {
    player.applyCamera(camera, 0);
    if (shakeLevel > 0) {
      camera.rotation.x += (Math.random() - 0.5) * 0.02 * shakeLevel;
      camera.rotation.y += (Math.random() - 0.5) * 0.02 * shakeLevel;
    }
  } else if (gs.spectate && gs.spectate.alive) {
    const t = gs.spectate;
    camera.position.set(t.pos.x + Math.sin(t.yaw) * 2.2, 2.4, t.pos.z + Math.cos(t.yaw) * 2.2);
    camera.lookAt(t.pos.x - Math.sin(t.yaw) * 4, 1.4, t.pos.z - Math.cos(t.yaw) * 4);
  }
  renderer.render(scene, camera);
}

function frame(t) {
  requestAnimationFrame(frame);
  const dtMs = Math.min(100, t - lastTime);
  lastTime = t;
  if (!frozen) {
    accumulator += dtMs / 1000;
    let n = 0;
    while (accumulator >= FIXED_STEP && n < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      n++;
    }
    if (n === 5) accumulator = 0;
  }
  render();
}

// ---- Deterministic capture modes ------------------------------------------
let frozen = false;

function stageShot(name) {
  game.startMatch();
  hud.showBuy(false); // staging sets its own HUD state per mode below
  if (name !== 'start') hud.hideOverlay(); // the title screen only belongs on the start shot
  if (name === 'start') {
    // Title screen over the yard at spawn.
    player.reset(0, 20, 0);
    camera.position.set(0, 1.62, 20);
    camera.rotation.set(0, 0, 0);
    return;
  }
  if (name === 'buy') {
    player.reset(-4, 20, 0);
    weapons.equip('rifle');
    ps.money = 2450;
    hud.setMoney(2450);
    hud.showBuy(true, 2450, 'rifle');
    return;
  }
  // Live staged frames.
  gs.phase = 'live';
  gs.timer = 84;
  gs.score.vanguard = 2; gs.score.hollow = 1;
  hud.setScore(2, 1);
  ps.money = 2450;
  hud.setMoney(2450);
  if (name === 'play') {
    player.reset(0, 12, 0);
    weapons.equip('rifle');
    // Two Hollow bots in the lane ahead, mid-fight.
    const h0 = bots.bots.find((b) => b.team === 'hollow' && b.index === 0);
    const h1 = bots.bots.find((b) => b.team === 'hollow' && b.index === 2);
    h0.pos.set(-1.5, 0, -4); h0.yaw = Math.PI; h0.alive = true;
    h1.pos.set(5, 0, -9); h1.yaw = Math.PI; h1.alive = true;
    const vg = bots.bots.find((b) => b.team === 'vanguard' && b.index === 0);
    vg.pos.set(-6, 0, 8); vg.yaw = 0; vg.alive = true;
    bots.syncMeshes();
    player.eyePos(_eye);
    effects.tracer(_eye, new THREE.Vector3(-1.5, 1.3, -4), 0xffd27a);
    effects.impact(-1.5, 1.3, -4, 0xffc46a, 10);
    hud.hitmarker(false);
    hud.setAmmo(24, 90);
  }
  if (name === 'plant') {
    gs.bomb.state = 'planted';
    gs.bomb.site = 'A';
    gs.bomb.x = 24; gs.bomb.z = -14; gs.bomb.fuse = 31;
    gs.score.vanguard = 3; gs.score.hollow = 2;
    hud.setScore(3, 2);
    player.reset(20, -8, -Math.PI / 2);
    weapons.equip('rifle');
    const vg = bots.bots.find((b) => b.team === 'vanguard' && b.index === 1);
    vg.pos.set(26, 0, -10); vg.yaw = Math.PI; vg.alive = true;
    bots.syncMeshes();
    effects.setBombLight(24, 0.4, -14, true, 0.6);
    hud.banner('BOMB PLANTED', 'Site A — hold it for 31 seconds.', '');
  }
  if (name === 'end') {
    gs.phase = 'matchEnd';
    gs.score.vanguard = 5; gs.score.hollow = 3;
    const rows = [
      { name: 'You', kills: 14, deaths: 6, team: 'vanguard' },
      { name: 'Rook', kills: 9, deaths: 7, team: 'vanguard' },
      { name: 'Vex', kills: 11, deaths: 8, team: 'hollow' },
      { name: 'Fable', kills: 7, deaths: 9, team: 'vanguard' },
      { name: 'Harrow', kills: 8, deaths: 9, team: 'hollow' },
    ];
    hud.showMatchEnd(true, 5, 3, rows);
  }
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

try {
  if (shot) {
    stageShot(shot);
    // Render twice so shadows and the first frame settle, then freeze.
    render(); render();
    frozen = true;
    window.__shotReady = true;
  } else {
    requestAnimationFrame(frame);
  }
} catch (err) {
  window.__shotError = String(err && err.message || err);
  throw err;
}
