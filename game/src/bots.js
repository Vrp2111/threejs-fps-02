// Bot AI: nine bots that walk waypoint routes, hold angles, hear gunfire,
// plant/defuse, throw grenades on the push, and shoot in bursts with
// human-like reaction and aim error. Roles come from the round's plan
// (tactics.js), not a fixed assignment.
import * as THREE from 'three';
import { BOT, WEAPONS, NAMES, SPAWNS, MATCH, POOLS } from './config.js';
import { clamp, damp, inPool, outOfPools } from './util.js';

const EYE = 1.45;

// Module-level scratch lists: update() fills them in place instead of
// allocating a fresh array per bot per frame (no new objects in hot loops).
const _hollowAlive = [];
const _vanguardAlive = [];
const _enemiesHollow = [];
const _enemiesVanguard = [];

export function createBots(ctx) {
  const { world, combat, effects, audio } = ctx;
  const bots = [];
  const tmpV = new THREE.Vector3();
  const tmpD = new THREE.Vector3();

  function buildMesh(team) {
    const g = new THREE.Group();
    const trim = team === 'vanguard' ? 0x4da3ff : 0xff5a4d;
    // Bright team trim and a lighter suit: a bot must read as a person at
    // 20 metres in a screenshot, not a dark smudge. The emissive trim is
    // the team colour, visible even in shadow.
    const suit = new THREE.MeshStandardMaterial({ color: 0x4a4e57, roughness: 0.8 });
    const trimMat = new THREE.MeshStandardMaterial({ color: trim, roughness: 0.4, emissive: trim, emissiveIntensity: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xb09a7a, roughness: 0.8 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.5, metalness: 0.6 });
    const box = new THREE.BoxGeometry(1, 1, 1);
    const add = (mat, w, h, d, x, y, z, parent) => {
      const m = new THREE.Mesh(box, mat);
      m.scale.set(w, h, d); m.position.set(x, y, z);
      m.castShadow = true;
      (parent || g).add(m);
      return m;
    };
    // legs pivot at the hip (y 0.78) so they swing while walking
    const legL = new THREE.Group(); legL.position.set(-0.11, 0.78, 0);
    const legR = new THREE.Group(); legR.position.set(0.11, 0.78, 0);
    add(suit, 0.17, 0.78, 0.2, 0, -0.39, 0, legL);
    add(suit, 0.17, 0.78, 0.2, 0, -0.39, 0, legR);
    g.add(legL); g.add(legR);
    add(suit, 0.52, 0.62, 0.3, 0, 1.09, 0);           // torso
    add(trimMat, 0.54, 0.08, 0.32, 0, 1.28, 0);       // chest trim
    add(trimMat, 0.1, 0.62, 0.32, -0.28, 1.09, 0);    // shoulder trim
    const head = new THREE.Group(); head.position.set(0, 1.52, 0);
    add(skin, 0.26, 0.26, 0.26, 0, 0.1, 0, head);     // head
    add(dark, 0.28, 0.1, 0.28, 0, 0.2, 0, head);      // helmet
    add(trimMat, 0.28, 0.06, 0.02, 0, 0.12, 0.14, head); // visor
    g.add(head);
    const arm = new THREE.Group(); arm.position.set(0.2, 1.3, 0.1);
    add(suit, 0.13, 0.13, 0.5, 0, -0.05, 0.18, arm);  // arm + gun forward
    add(dark, 0.06, 0.09, 0.72, 0.05, -0.02, 0.2, arm);
    g.add(arm);
    return { group: g, legL, legR, head, arm };
  }

  function makeBot(team, index, name) {
    const mesh = buildMesh(team);
    const b = {
      id: `bot-${team}-${index}`,
      name, team, index,
      pos: new THREE.Vector3(),
      yaw: 0, pitch: 0,
      health: BOT.health, armor: 0, alive: true, crouch: false,
      mesh, walkPhase: Math.random() * 6,
      role: 'pusher', state: 'idle',
      path: [], pathI: 0, repathAt: 0,
      target: null, lastSeen: null, lastSeenAt: -99, reactAt: 0,
      aimYaw: 0, aimPitch: 0,
      weapon: null, burstLeft: 0, nextShotAt: 0, reloadEnd: 0,
      holdSpot: null, holdUntil: 0,
      strafeDir: 1, strafeAt: 0,
      investigate: null, investigateAt: 0,
      plantProgress: 0, defuseProgress: 0,
      blindUntil: 0, flashLevel: 0,
      perceiveAt: Math.random() * 0.12,
      speed: BOT.walkSpeed,
      deathT: 0,
      // Grenade doctrine: one smoke and one flash per round, spent while
      // pushing a site. A pusher smokes the entry before the plant and
      // flashes the angle they are about to clear.
      grenades: { smoke: 1, flash: 1 },
      smokedAt: -99, flashedAt: -99,
    };
    return b;
  }

  function spawnAll() {
    bots.length = 0;
    NAMES.vanguard.forEach((n, i) => bots.push(makeBot('vanguard', i, n)));
    NAMES.hollow.forEach((n, i) => bots.push(makeBot('hollow', i, n)));
    for (const b of bots) ctx.scene.add(b.mesh.group);
  }

  function nearestNode(x, z) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < world.waypoints.length; i++) {
      const n = world.waypoints[i];
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  // BFS over the waypoint graph. Direct-line shortcut: walk the straight
  // segment when clear; the waypoint route runs through the centre where
  // defenders hold (planter died walking ~40 m in). The direct diagonal
  // is ~30 m, east of the centre. Sampled every 0.5 m against colliders.
  function lineClear(x1, z1, x2, z2) {
    const dx = x2 - x1, dz = z2 - z1;
    const d = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(d / 0.5));
    for (let i = 1; i < steps; i++) {
      const t = i / steps, px = x1 + dx * t, pz = z1 + dz * t;
      // Pools block the shortcut like a wall: BFS routes around the lava.
      if (collides(px, pz, 0.36, 1.7) || inPool(px, pz)) return false;
    }
    return true;
  }
  function findPath(fromX, fromZ, toX, toZ) {
    // Clamp the destination out of any pool first: the direct shortcut and
    // the BFS goal both take it, so no path ever ends inside lava.
    const [ex, ez] = outOfPools(toX, toZ);
    if (lineClear(fromX, fromZ, ex, ez)) return [{ x: ex, z: ez }];
    const wps = world.waypoints;
    const start = nearestNode(fromX, fromZ);
    const goal = nearestNode(ex, ez);
    const prev = new Int16Array(wps.length).fill(-1);
    const queue = [start];
    prev[start] = start;
    while (queue.length) {
      const cur = queue.shift();
      if (cur === goal) break;
      for (const nb of wps[cur].links) {
        if (prev[nb] === -1) { prev[nb] = cur; queue.push(nb); }
      }
    }
    if (prev[goal] === -1) return [{ x: ex, z: ez }];
    const path = [];
    let cur = goal;
    while (cur !== start) { path.push({ x: wps[cur].x, z: wps[cur].z }); cur = prev[cur]; }
    path.reverse();
    if(path.length&&!lineClear(fromX,fromZ,path[0].x,path[0].z))path.unshift(wps[start]);
    path.push({ x: ex, z: ez });
    return path;
  }

  function collides(x, z, r, h) {
    for (let i = 0; i < world.colliders.length; i++) {
      const c = world.colliders[i];
      if (x + r > c.minX && x - r < c.maxX && h > c.minY && 0 < c.maxY && z + r > c.minZ && z - r < c.maxZ) return c;
    }
    return null;
  }

  function moveBot(b, dt, mx, mz) {
    const len = Math.hypot(mx, mz);
    if (len < 0.001) return;
    mx /= len; mz /= len;
    const step = b.speed * dt;
    // Axis-separated slide, like the player.
    let nx = b.pos.x + mx * step;
    if (!collides(nx, b.pos.z, 0.36, b.crouch ? 1.1 : 1.7)) b.pos.x = nx;
    let nz = b.pos.z + mz * step;
    if (!collides(b.pos.x, nz, 0.36, b.crouch ? 1.1 : 1.7)) b.pos.z = nz;
    b.pos.x = clamp(b.pos.x, world.bounds.minX + 0.4, world.bounds.maxX - 0.4);
    b.pos.z = clamp(b.pos.z, world.bounds.minZ + 0.4, world.bounds.maxZ - 0.4);
    b.walkPhase += dt * 9;
  }

  function setPath(b, x, z) {
    b.path = findPath(b.pos.x, b.pos.z, x, z);
    b.pathI = 0;
  }

  function followPath(b, dt) {
    if (b.pathI >= b.path.length) return true;
    const t = b.path[b.pathI];
    const dx = t.x - b.pos.x, dz = t.z - b.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.5) { b.pathI++; b.stuckSteps = 0; return b.pathI >= b.path.length; }
    const ox = b.pos.x, oz = b.pos.z;
    moveBot(b, dt, dx / d, dz / d);
    b.yaw = dampAngle(b.yaw, Math.atan2(-dx, -dz), 8, dt);
    // Stuck detection: the line to the next waypoint can cross a collider
    // once the bot drifts off its link (links validated, position not).
    // Stuck a second, it replans. E22: findPath routes via the nearest
    // node when the first waypoint is unreachable (carrier wedged 76 s on the (18,-14) crate).
    const moved = Math.hypot(b.pos.x - ox, b.pos.z - oz);
    if (moved < 0.01) {
      b.stuckSteps = (b.stuckSteps || 0) + 1;
      if (b.stuckSteps > 60) {
        b.stuckSteps = 0;
        setPath(b, t.x, t.z);
      }
    } else {
      b.stuckSteps = 0;
    }
    return false;
  }

  function dampAngle(a, b, lambda, dt) {
    let diff = b - a;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * (1 - Math.exp(-lambda * dt));
  }

  function canSee(b, enemy, now) {
    const ex = enemy.pos.x, ez = enemy.pos.z;
    const ey = enemy.pos.y + (enemy.crouch ? 0.8 : 1.3);
    const dx = ex - b.pos.x, dz = ez - b.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > BOT.visionRange) return false;
    // Field of view around the bot's facing.
    const fx = -Math.sin(b.yaw), fz = -Math.cos(b.yaw);
    const dot = (dx * fx + dz * fz) / Math.max(0.001, dist);
    if (dot < Math.cos(BOT.visionFov / 2) && dist > 3) return false;
    const oy = b.pos.y + EYE;
    if (world.losBlocked(b.pos.x, oy, b.pos.z, ex, ey, ez)) return false;
    if (effects.smokeBlocks(b.pos.x, oy, b.pos.z, ex, ey, ez)) return false;
    return true;
  }

  function perceive(b, now, enemies) {
    if (now < b.perceiveAt) return;
    b.perceiveAt = now + 0.12;
    let best = null, bd = Infinity;
    for (const e of enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.pos.x - b.pos.x, e.pos.z - b.pos.z);
      if (!canSee(b, e, now)) continue;
      // Anti-focus-fire: spread targets. Without it every bot picks the
      // same nearest enemy and deletes it in <1 s (carrier died 0.75 s
      // after pickup to three focusers). An engaged enemy costs +15 m,
      // so the third bot peels off to a different target.
      let focusCount = 0;
      for (let i = 0; i < bots.length; i++) {
        const o = bots[i];
        if (o !== b && o.alive && o.team === b.team && o.target === e) focusCount++;
      }
      const score = d + focusCount * 15;
      if (score < bd) { bd = score; best = e; }
    }
    if (best) {
      if (b.target !== best) {
        b.target = best;
        b.reactAt = now + BOT.reactionMin + Math.random() * (BOT.reactionMax - BOT.reactionMin);
      }
      b.lastSeen = { x: best.pos.x, y: best.pos.y, z: best.pos.z };
      b.lastSeenAt = now;
    } else if (b.target && now - b.lastSeenAt > 1.2) {
      b.target = null;
    }
  }

  function aimAt(b, tx, ty, tz, err, now) {
    const dx = tx - b.pos.x, dy = ty - (b.pos.y + EYE), dz = tz - b.pos.z;
    const dist = Math.hypot(dx, dy, dz);
    const ex = (Math.random() + Math.random() + Math.random() - 1.5) * err * dist;
    const ey = (Math.random() + Math.random() + Math.random() - 1.5) * err * dist * 0.7;
    const yaw = Math.atan2(-(dx + ex), -(dz));
    const pitch = Math.atan2(-(dy + ey), Math.hypot(dx, dz));
    b.aimYaw = yaw; b.aimPitch = pitch;
    return { yaw, pitch };
  }

  function shootAt(b, target, now, enemies) {
    const w = b.weapon;
    if (!w) return;
    if (b.reloadEnd > now) return;
    if (w.mag <= 0) {
      b.reloadEnd = now + w.def.reloadMs / 1000;
      w.mag = w.def.mag; w.reserve = Math.max(0, w.reserve - w.def.mag);
      return;
    }
    if (now < b.nextShotAt) return;
    if (b.burstLeft <= 0) {
      b.burstLeft = BOT.burstMin + Math.floor(Math.random() * (BOT.burstMax - BOT.burstMin));
      b.nextShotAt = now + BOT.burstPauseMin + Math.random() * (BOT.burstPauseMax - BOT.burstPauseMin);
      return;
    }
    b.burstLeft--;
    b.nextShotAt = now + w.def.rateMs / 1000;
    w.mag--;
    const targetSpeed = target.vel ? Math.hypot(target.vel.x, target.vel.z) : 0;
    const dist = Math.hypot(target.pos.x - b.pos.x, target.pos.z - b.pos.z);
    let err = BOT.aimErrorBase + dist * BOT.aimErrorDist + targetSpeed * 0.002;
    if (b.flashLevel > 0) err *= 3;
    const aimY = target.pos.y + (Math.random() < 0.25 ? 1.5 : 1.15);
    const { yaw, pitch } = aimAt(b, target.pos.x, aimY, target.pos.z, err, now);
    const ox = b.pos.x, oy = b.pos.y + EYE, oz = b.pos.z;
    const cp = Math.cos(pitch);
    const dx = -Math.sin(yaw) * cp, dy = -Math.sin(pitch), dz = -Math.cos(yaw) * cp;
    const hit = combat.raycast(ox, oy, oz, dx, dy, dz, w.def.range, enemies, b.id);
    const mp = tmpV.set(ox + dx * 0.6, oy - 0.08, oz + dz * 0.6);
    const tp = tmpD.set(hit.px, hit.py, hit.pz);
    effects.tracer(mp, tp, w.def.tracer);
    const distToPlayer = Math.hypot(ctx.getPlayer().pos.x - ox, ctx.getPlayer().pos.z - oz);
    audio.shot(w.def.sound, distToPlayer);
    if (hit.bot) {
      const dmg = combat.damageFor(w.def, hit.t, hit.part);
      damageBot(hit.bot, dmg, b, hit.part === 'head');
      if (hit.part === 'world') effects.impact(hit.px, hit.py, hit.pz, 0xffc46a, 6);
    } else if (hit.part === 'world') {
      effects.impact(hit.px, hit.py, hit.pz, 0xffc46a, 6);
    }
  }

  function damageBot(bot, dmg, attacker, headshot) {
    if (!bot.alive) return;
    if (bot.id === 'player') { ctx.onPlayerDamage(dmg, attacker, headshot); return; }
    // X4: carrier takes half damage (E18 failed pre-X1; works post-X1, round stays open).
    if (bot.team === 'vanguard' && bot.role === 'planter') dmg *= 0.5;
    let rest = dmg;
    if (bot.armor > 0) { const ab = Math.min(bot.armor, dmg * 0.5); bot.armor -= ab; rest = dmg - ab; }
    bot.health -= rest;
    if (bot.health <= 0) {
      bot.health = 0; bot.alive = false; bot.deathT = 0;
      bot.target = null;
      ctx.onKill(bot, attacker, headshot);
    }
  }

  function hearShot(pos, shooterTeam) {
    for (const b of bots) {
      if (!b.alive || b.team === shooterTeam) continue;
      const d = Math.hypot(pos.x - b.pos.x, pos.z - b.pos.z);
      if (d < BOT.hearRange && !b.target) {
        b.investigate = { x: pos.x, z: pos.z };
        b.investigateAt = ctx.now + 4;
      }
    }
  }

  function flashBlind(x, y, z, power) {
    for (const b of bots) {
      if (!b.alive) continue;
      const d = Math.hypot(x - b.pos.x, z - b.pos.z);
      if (d > 26) continue;
      if (world.losBlocked(x, y, z, b.pos.x, b.pos.y + 1.4, b.pos.z)) continue;
      const fx = -Math.sin(b.yaw), fz = -Math.cos(b.yaw);
      const dot = ((b.pos.x - x) * fx + (b.pos.z - z) * fz) / Math.max(0.001, d);
      const facing = d < 3 ? 1 : Math.max(0, dot);
      const level = power * facing * (1 - d / 28);
      if (level > 0.15) {
        b.flashLevel = Math.max(b.flashLevel, level);
        b.blindUntil = ctx.now + 0.5 + level * 2.2;
      }
    }
  }

  // Roles come from the round's plan (tactics.js), not a fixed table: the
  // plan's split names the pushers/mids/lurker, the defence setup the
  // holders per site. A bot missing from the plan falls back to pusher.
  function assignRoundRoles(roundNumber, attackSite, tactics) {
    const attackers = bots.filter((b) => b.team === 'vanguard');
    const defenders = bots.filter((b) => b.team === 'hollow');
    const plan = tactics ? tactics.attack : null;
    const split = tactics ? tactics.defenseSplit() : { a: 2, b: 2, mid: 1 };
    const order = [...attackers].sort(() => Math.random() - 0.5);
    // Attackers: one planter, then the plan's pushers, mids and lurker.
    order[0].role = 'planter';
    const pushers = plan ? plan.pushers : 2;
    const mids = plan ? plan.mid : 1;
    for (let i = 1; i < order.length; i++) {
      if (i <= pushers) order[i].role = 'pusher';
      else if (i <= pushers + mids) order[i].role = 'mid';
      else order[i].role = 'lurker';
    }
    // Defenders: the setup's holders per site, then mid, then a roamer.
    const dOrder = [...defenders].sort(() => Math.random() - 0.5);
    let di = 0;
    for (let i = 0; i < split.a && di < dOrder.length; i++, di++) dOrder[di].role = 'holderA';
    for (let i = 0; i < split.b && di < dOrder.length; i++, di++) dOrder[di].role = 'holderB';
    for (let i = 0; i < split.mid && di < dOrder.length; i++, di++) dOrder[di].role = 'mid';
    for (; di < dOrder.length; di++) dOrder[di].role = 'mid';
    for (const b of bots) {
      b.state = 'idle'; b.target = null; b.path = []; b.pathI = 0;
      b.plantProgress = 0; b.defuseProgress = 0;
      b.investigate = null;
      b.grenades = { smoke: 1, flash: 1 };
      b.smokedAt = -99; b.flashedAt = -99;
      // Economy: pistols round 1, rifles and armor after.
      const wId = roundNumber === 1 ? 'pistol' : (b.role === 'lurker' || b.role === 'mid' ? (Math.random() < 0.5 ? 'smg' : 'rifle') : 'rifle');
      const def = WEAPONS[wId];
      b.weapon = { def, mag: def.mag, reserve: def.reserve, id: wId };
      b.armor = roundNumber === 1 ? 0 : 50;
    }
    return { attackSite };
  }

  function resetRound(roundNumber, attackSite, tactics) {
    for (const b of bots) {
      const spawn = SPAWNS[b.team][b.index % SPAWNS[b.team].length];
      b.pos.set(spawn.x, 0, spawn.z);
      b.yaw = spawn.yaw;
      b.health = BOT.health;
      b.alive = true;
      b.crouch = false;
      b.deathT = 0;
      b.mesh.group.visible = true;
      b.mesh.group.rotation.set(0, 0, 0);
      b.mesh.group.position.copy(b.pos);
      b.flashLevel = 0; b.blindUntil = 0;
    }
    assignRoundRoles(roundNumber, attackSite, tactics);
  }

  // A bot throws a grenade at a target point: the throw is the same
  // projectile the player throws (weapons.throwGrenade via ctx), so the
  // physics, the bounce and the event are shared, not a second system.
  const _throwDir = new THREE.Vector3();
  const _throwEye = new THREE.Vector3();
  function throwBotGrenade(b, type, tx, ty, tz) {
    if (!ctx.throwGrenade) return false;
    if (b.grenades[type] <= 0) return false;
    b.grenades[type]--;
    _throwEye.set(b.pos.x, b.pos.y + EYE, b.pos.z);
    _throwDir.set(tx - _throwEye.x, ty - _throwEye.y, tz - _throwEye.z).normalize();
    ctx.throwGrenade(type, _throwEye, _throwDir, 11);
    return true;
  }

  function update(dt, now, phase, bomb) {
    const player = ctx.getPlayer();
    // Enemy lists are built once per frame into the module scratch lists,
    // not once per bot: no filter, no concat, no allocation in the hot loop.
    _hollowAlive.length = 0;
    _vanguardAlive.length = 0;
    for (let i = 0; i < bots.length; i++) {
      const o = bots[i];
      if (!o.alive) continue;
      if (o.team === 'hollow') _hollowAlive.push(o);
      else _vanguardAlive.push(o);
    }
    const hollowAlive = _hollowAlive;
    const vanguardAlive = _vanguardAlive;
    // Designated defuser: the nearest living Hollow bot to a planted bomb
    // (recomputed every step; 5 bots, cheap). Only the defuser gets
    // objective priority when the bomb is planted; without one, every
    // defender fights instead of defusing; round never ends by defuse.
    let defuser = null;
    if (bomb.state === 'planted') {
      let bd = Infinity;
      for (let i = 0; i < _hollowAlive.length; i++) {
        const o = _hollowAlive[i];
        const d = Math.hypot(o.pos.x - bomb.x, o.pos.z - bomb.z);
        if (d < bd) { bd = d; defuser = o; }
      }
    }
    const enemiesForVanguard = hollowAlive;
    _enemiesHollow.length = 0;
    for (let i = 0; i < vanguardAlive.length; i++) _enemiesHollow.push(vanguardAlive[i]);
    if (player.alive) _enemiesHollow.push(player);
    const enemiesForHollow = _enemiesHollow;
    for (const b of bots) {
      if (!b.alive) {
        // Fall over and stay down.
        if (b.deathT < 1) {
          b.deathT += dt * 3;
          b.mesh.group.rotation.x = -Math.PI / 2 * Math.min(1, b.deathT);
          b.mesh.group.position.y = 0.15 * Math.min(1, b.deathT);
        }
        continue;
      }
      if (now < b.blindUntil) b.flashLevel = Math.max(0, b.flashLevel - dt * 0.4);
      else b.flashLevel = 0;

      const enemies = b.team === 'vanguard' ? enemiesForVanguard : enemiesForHollow;
      // Player is Vanguard, so Hollow bots see the player as an enemy;
      // Vanguard bots never target the player.
      perceive(b, now, enemies);

      const blinded = now < b.blindUntil;
      // Grenade doctrine: a pusher smokes the site entry as they close in
      // and flashes the angle ahead, target or not. The old version only
      // ran target-less, so a pusher never threw at a defended site (zero
      // fires in five matches). One smoke + one flash per round.
      if (phase === 'live' && !blinded && b.role === 'pusher' && b.team === 'vanguard' && now > 4) {
        const s = ctx.attackSite === 'A' ? { x: 24, z: -14 } : { x: -24, z: -14 };
        const dSite = Math.hypot(s.x - b.pos.x, s.z - b.pos.z);
        if (b.grenades.smoke > 0 && dSite < BOT.smokeAtDist && dSite > 6 && Math.random() < BOT.grenadeChance) {
          if (throwBotGrenade(b, 'smoke', s.x, 1, s.z)) {
            b.smokedAt = now;
            if (ctx.onTacticEvent) ctx.onTacticEvent('smoke', b, ctx.attackSite);
          }
        } else if (b.grenades.flash > 0 && dSite < BOT.flashAtDist && Math.random() < BOT.grenadeChance * 0.7) {
          if (throwBotGrenade(b, 'flash', s.x, 1.5, s.z)) {
            b.flashedAt = now;
            if (ctx.onTacticEvent) ctx.onTacticEvent('flash', b, ctx.attackSite);
          }
        }
      }
      // Objective advance (FSM priority): planter + defuser keep moving to
      // the objective under fire; combat preempts only when an enemy is
      // < 8 m. Without this, a bot with ANY visible target never advances
      // (46 m vision), so rounds ended by elimination, bomb never planted.
      // Planter needs ~14 s; the objective must outrank distant fire.
      const targetDist = b.target ? Math.hypot(b.target.pos.x - b.pos.x, b.target.pos.z - b.pos.z) : Infinity;
      const isPlanter = b.role === 'planter' && b.team === 'vanguard';
      const carrying = isPlanter && bomb.state === 'carried' && bomb.carrier === b;
      const retrieving = isPlanter && bomb.state === 'dropped';
      // Escort: a Vanguard bot that is not the carrier stays with it.
      // Without an escort the planter walks alone into 2-3 defenders
      // and dies in <1 s; with the team around it they face five targets.
      const escorting = b.team === 'vanguard' && bomb.state === 'carried' && bomb.carrier && bomb.carrier !== b && bomb.carrier.alive;
      const advancing = phase === 'live' && !blinded && (carrying || retrieving || b === defuser || escorting) && targetDist > 8;
      // Objective pace: the planter and defuser RUN (4.4 m/s) instead of
      // walking (3.4 m/s). Walking, the planter's ~40 m journey took ~12 s
      // and the round ended by elimination first; running cuts it to ~9 s.
      b.speed = advancing ? BOT.runSpeed : BOT.walkSpeed;
      // Combat has priority over everything except planting/defusing.
      if (b.target && !blinded && now >= b.reactAt && phase === 'live' && !advancing) {
        // Strafe while fighting.
        if (now > b.strafeAt) { b.strafeDir *= -1; b.strafeAt = now + 0.7 + Math.random() * 0.9; }
        const dx = b.target.pos.x - b.pos.x, dz = b.target.pos.z - b.pos.z;
        const d = Math.hypot(dx, dz) || 1;
        const fx = -dx / d, fz = -dz / d;
        const px = -fz * b.strafeDir, pz = fx * b.strafeDir;
        const dist = Math.hypot(dx, dz);
        let mx = 0, mz = 0;
        if (dist > 14) { mx = -fx * 0.7; mz = -fz * 0.7; }
        else if (dist < 5) { mx = fx * 0.5; mz = fz * 0.5; }
        mx += px * 0.8; mz += pz * 0.8;
        moveBot(b, dt, mx, mz);
        b.yaw = dampAngle(b.yaw, Math.atan2(-dx, -dz), 10, dt);
        shootAt(b, b.target, now, enemies);
      } else if (phase === 'live') {
        // Objective behaviour (frozen during freeze time).
        if (b.role === 'planter' && bomb.state === 'dropped') {
          // Retrieve the dropped charge first.
          if (b.pathI >= b.path.length || now > b.repathAt) { setPath(b, bomb.x, bomb.z); b.repathAt = now + 1.5; }
          followPath(b, dt);
        } else if (b.role === 'planter' && bomb.state === 'carried' && bomb.carrier === b) {
          const site = ctx.attackSite === 'A' ? { x: 24, z: -14 } : { x: -24, z: -14 };
          const d = Math.hypot(site.x - b.pos.x, site.z - b.pos.z);
          if (d < 4.5) {
            b.plantProgress += dt / MATCH.plantSeconds;
            b.crouch = true;
            if (b.plantProgress >= 1) { b.plantProgress = 0; ctx.onPlant(b); }
          } else {
            b.crouch = false;
            // Repath timer (same as the retrieve branch): a planter diverted
            // by combat strafing follows a stale path forever without it.
            if (b.pathI >= b.path.length || now > b.repathAt) { setPath(b, site.x, site.z); b.repathAt = now + 1.5; }
            followPath(b, dt);
          }
        } else if (escorting) {
          // Escort the carrier: stay within ~5 m so defenders face the
          // whole team, not a lone planter. Re-path every second (the
          // carrier keeps moving); combat still preempts at close range.
          const c = bomb.carrier;
          const d = Math.hypot(c.pos.x - b.pos.x, c.pos.z - b.pos.z);
          if (d > 5) {
            if (b.pathI >= b.path.length || now > b.repathAt) { setPath(b, c.pos.x, c.pos.z); b.repathAt = now + 1.0; }
            followPath(b, dt);
          }
        } else if (b.team === 'hollow' && bomb.state === 'planted') {
          const d = Math.hypot(bomb.x - b.pos.x, bomb.z - b.pos.z);
          if (d < 1.8) {
            b.defuseProgress += dt / (b.hasKit ? MATCH.defuseKitSeconds : MATCH.defuseSeconds);
            b.crouch = true;
            if (b.defuseProgress >= 1) { b.defuseProgress = 0; ctx.onDefuse(b); }
          } else {
            b.crouch = false;
            if (b.pathI >= b.path.length || now > b.repathAt) { setPath(b, bomb.x, bomb.z); b.repathAt = now + 2; }
            followPath(b, dt);
          }
        } else if (b.role === 'holderA' || b.role === 'holderB') {
          const site = b.role === 'holderA' ? 'A' : 'B';
          if (!b.holdSpot) {
            const spots = world.holdSpots[site];
            b.holdSpot = spots[b.index % spots.length];
            setPath(b, b.holdSpot.x, b.holdSpot.z);
          }
          if (b.pathI < b.path.length) {
            followPath(b, dt);
          } else {
            b.yaw = dampAngle(b.yaw, b.holdSpot.yaw, 4, dt);
            b.crouch = Math.random() < 0.002 ? !b.crouch : b.crouch;
          }
        } else if (b.investigate && now < b.investigateAt) {
          if (b.pathI >= b.path.length) setPath(b, b.investigate.x, b.investigate.z);
          if (followPath(b, dt)) b.investigate = null;
        } else if (b.role === 'mid' || b.role === 'pusher' || b.role === 'planter' || b.role === 'lurker') {
          // Push: the plan names where each role goes (tactics.roleTarget).
          // Attackers go to their site, mid roams the centre, the lurker
          // watches the other site and rotates with the plan. A fake sends
          // pushers to the decoy site until it breaks, then they rotate.
          let tx, tz;
          if (ctx.tactics) {
            const t = ctx.tactics.roleTarget(b.role, b.team, now);
            if (t) { tx = t.x; tz = t.z; }
          }
          if (tx === undefined) {
            if (b.role === 'mid') { tx = (Math.random() - 0.5) * 8; tz = (Math.random() - 0.5) * 10; }
            else if (b.team === 'vanguard') {
              const s = ctx.attackSite === 'A' ? { x: 24, z: -14 } : { x: -24, z: -14 };
              tx = s.x + (Math.random() - 0.5) * 4; tz = s.z + (Math.random() - 0.5) * 4;
            } else { tx = (Math.random() - 0.5) * 20; tz = -8 - Math.random() * 10; }
          }
          if (b.pathI >= b.path.length || now > b.repathAt) { setPath(b, tx, tz); b.repathAt = now + 3 + Math.random() * 2; }
          followPath(b, dt);
        }
      }
      // Objective advance: shoot on the move so the planter/defuser is
      // not defenceless while pushing. (Combat still preempts when the
      // target is close — see the `advancing` flag above.)
      if (advancing && b.target && now >= b.reactAt) shootAt(b, b.target, now, enemies);

      // Separation: bots never stack. The push is collision-aware like
      // moveBot: a raw push can shove a bot into a collider, and a bot
      // inside one can never move out (every step is blocked while it
      // overlaps) — a planter once spent a whole round wedged in a crate.
      for (const o of bots) {
        if (o === b || !o.alive) continue;
        const dx = b.pos.x - o.pos.x, dz = b.pos.z - o.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 0.64 && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const push = (0.8 - d) * 0.5;
          const nx = b.pos.x + (dx / d) * push;
          const nz = b.pos.z + (dz / d) * push;
          const h = b.crouch ? 1.1 : 1.7;
          if (!collides(nx, b.pos.z, 0.36, h)) b.pos.x = nx;
          if (!collides(b.pos.x, nz, 0.36, h)) b.pos.z = nz;
        }
      }

      // Pools: a bot that strafed into one is pushed out to the rim, so no
      // bot camps in lava and dies there.
      for (const p of POOLS) {
        const dx = b.pos.x - p.x, dz = b.pos.z - p.z, d2 = dx * dx + dz * dz;
        if (d2 < p.r * p.r && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          b.pos.x = p.x + dx / d * (p.r + 0.15);
          b.pos.z = p.z + dz / d * (p.r + 0.15);
        }
      }

      // Mesh pose.
      const m = b.mesh;
      m.group.position.copy(b.pos);
      m.group.rotation.y = b.yaw;
      const swing = b.alive && (b.pathI < b.path.length || b.target) ? Math.sin(b.walkPhase) * 0.5 : 0;
      m.legL.rotation.x = swing;
      m.legR.rotation.x = -swing;
      m.group.scale.y = b.crouch ? 0.72 : 1;
    }
  }

  spawnAll();
  // Copy every bot's logical position onto its mesh (used by the ?shot=
  // capture modes, which stage positions without running the simulation).
  function syncMeshes() {
    for (const b of bots) {
      b.mesh.group.visible = b.alive;
      b.mesh.group.position.copy(b.pos);
      b.mesh.group.rotation.set(0, b.yaw, 0);
    }
  }
  return {
    bots, update, resetRound, hearShot, flashBlind, damageBot, syncMeshes,
    aliveCount(team) { return bots.filter((b) => b.team === team && b.alive).length; },
    getPlanter() { return bots.find((b) => b.role === 'planter'); },
  };
}
