// Bot AI: nine teammates and opponents who walk waypoint routes, hold angles,
// hear gunfire, plant and defuse, and shoot back in bursts with human-like
// reaction time and aim error. One file owns bot bodies, brains and bullets.
import * as THREE from 'three';
import { BOT, WEAPONS, NAMES, SPAWNS, MATCH } from './config.js';
import { clamp, damp } from './util.js';

const EYE = 1.45;

export function createBots(ctx) {
  const { world, combat, effects, audio } = ctx;
  const bots = [];
  const tmpV = new THREE.Vector3();
  const tmpD = new THREE.Vector3();

  function buildMesh(team) {
    const g = new THREE.Group();
    const trim = team === 'vanguard' ? 0x4da3ff : 0xff5a4d;
    const suit = new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.8 });
    const trimMat = new THREE.MeshStandardMaterial({ color: trim, roughness: 0.5, emissive: trim, emissiveIntensity: 0.35 });
    const skin = new THREE.MeshStandardMaterial({ color: 0x8a7a66, roughness: 0.8 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.5, metalness: 0.6 });
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

  // BFS over the waypoint graph.
  function findPath(fromX, fromZ, toX, toZ) {
    const wps = world.waypoints;
    const start = nearestNode(fromX, fromZ);
    const goal = nearestNode(toX, toZ);
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
    if (prev[goal] === -1) return [{ x: toX, z: toZ }];
    const path = [];
    let cur = goal;
    while (cur !== start) { path.push({ x: wps[cur].x, z: wps[cur].z }); cur = prev[cur]; }
    path.reverse();
    path.push({ x: toX, z: toZ });
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
    if (d < 0.5) { b.pathI++; return b.pathI >= b.path.length; }
    moveBot(b, dt, dx / d, dz / d);
    b.yaw = dampAngle(b.yaw, Math.atan2(-dx, -dz), 8, dt);
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
      if (d < bd && canSee(b, e, now)) { bd = d; best = e; }
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

  function assignRoundRoles(roundNumber, attackSite) {
    const attackers = bots.filter((b) => b.team === 'vanguard');
    const defenders = bots.filter((b) => b.team === 'hollow');
    // Attackers: one planter, two pushers to the chosen site, one mid, one lurker to the other site.
    const order = [...attackers].sort(() => Math.random() - 0.5);
    order[0].role = 'planter';
    order[1].role = 'pusher'; order[2].role = 'pusher';
    order[3].role = 'mid';
    // Defenders: two hold A, two hold B, one roams mid.
    const dOrder = [...defenders].sort(() => Math.random() - 0.5);
    dOrder[0].role = 'holderA'; dOrder[1].role = 'holderA';
    dOrder[2].role = 'holderB'; dOrder[3].role = 'holderB';
    dOrder[4].role = 'mid';
    for (const b of bots) {
      b.state = 'idle'; b.target = null; b.path = []; b.pathI = 0;
      b.plantProgress = 0; b.defuseProgress = 0;
      b.investigate = null;
      // Economy: pistols round 1, rifles and armor after.
      const wId = roundNumber === 1 ? 'pistol' : (b.role === 'lurker' || b.role === 'mid' ? (Math.random() < 0.5 ? 'smg' : 'rifle') : 'rifle');
      const def = WEAPONS[wId];
      b.weapon = { def, mag: def.mag, reserve: def.reserve, id: wId };
      b.armor = roundNumber === 1 ? 0 : 50;
    }
    return { attackSite };
  }

  function resetRound(roundNumber, attackSite) {
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
    assignRoundRoles(roundNumber, attackSite);
  }

  function update(dt, now, phase, bomb) {
    const player = ctx.getPlayer();
    // Enemy lists are built once per frame, not once per bot.
    const hollowAlive = bots.filter((o) => o.team === 'hollow' && o.alive);
    const vanguardAlive = bots.filter((o) => o.team === 'vanguard' && o.alive);
    const enemiesForVanguard = hollowAlive;
    const enemiesForHollow = player.alive ? vanguardAlive.concat([player]) : vanguardAlive;
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
      // The player is on the Vanguard team, so Hollow bots see the player as an enemy;
      // Vanguard bots never target the player.
      perceive(b, now, enemies);

      const blinded = now < b.blindUntil;
      // Combat has priority over everything except planting/defusing.
      if (b.target && !blinded && now >= b.reactAt && phase === 'live') {
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
            if (b.pathI >= b.path.length) setPath(b, site.x, site.z);
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
        } else if (b.role === 'mid' || b.role === 'pusher' || b.role === 'planter') {
          // Push: attackers go to their site, mid roams the centre.
          let tx, tz;
          if (b.role === 'mid') { tx = (Math.random() - 0.5) * 8; tz = (Math.random() - 0.5) * 10; }
          else if (b.team === 'vanguard') {
            const s = ctx.attackSite === 'A' ? { x: 24, z: -14 } : { x: -24, z: -14 };
            tx = s.x + (Math.random() - 0.5) * 4; tz = s.z + (Math.random() - 0.5) * 4;
          } else { tx = (Math.random() - 0.5) * 20; tz = -8 - Math.random() * 10; }
          if (b.pathI >= b.path.length || now > b.repathAt) { setPath(b, tx, tz); b.repathAt = now + 3 + Math.random() * 2; }
          followPath(b, dt);
        }
      }

      // Separation: bots never stack on each other.
      for (const o of bots) {
        if (o === b || !o.alive) continue;
        const dx = b.pos.x - o.pos.x, dz = b.pos.z - o.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 0.64 && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const push = (0.8 - d) * 0.5;
          b.pos.x += (dx / d) * push; b.pos.z += (dz / d) * push;
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
