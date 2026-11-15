// One hitscan routine for every shot, player or bot: a ray against the
// world's boxes, the ground and every living bot's two hitboxes (head
// sphere, more damage; body box). Returns the nearest hit, so a crate
// between you and a target really saves them. The result object is
// reused; callers copy the point out before the next shot.
import { rayBox } from './util.js';

export function createCombat(world) {
  const result = { t: Infinity, bot: null, part: null, px: 0, py: 0, pz: 0, nx: 0, ny: 1, nz: 0 };

  function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r, maxT) {
    const lx = cx - ox, ly = cy - oy, lz = cz - oz;
    const tca = lx * dx + ly * dy + lz * dz;
    if (tca < 0) return Infinity;
    const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
    const r2 = r * r;
    if (d2 > r2) return Infinity;
    const thc = Math.sqrt(r2 - d2);
    const t = tca - thc;
    return t > 0 && t < maxT ? t : Infinity;
  }

  // bots: array of { pos: Vector3, alive, crouch, id, team, headY }
  function raycast(ox, oy, oz, dx, dy, dz, maxDist, bots, ignoreId) {
    let best = Infinity;
    let bestBot = null;
    let bestPart = null;
    // Ground plane.
    if (dy < 0) {
      const t = -oy / dy;
      if (t > 0 && t < maxDist) { best = t; bestPart = 'world'; }
    }
    // World boxes.
    for (let i = 0; i < world.colliders.length; i++) {
      const c = world.colliders[i];
      const t = rayBox(ox, oy, oz, dx, dy, dz, c.minX, c.minY, c.minZ, c.maxX, c.maxY, c.maxZ, Math.min(maxDist, best));
      if (t < best) { best = t; bestPart = 'world'; bestBot = null; }
    }
    // Bots: head sphere first (it sits above the body box, so check both and
    // keep the nearer of the two for each bot).
    for (let i = 0; i < bots.length; i++) {
      const b = bots[i];
      if (!b.alive || b.id === ignoreId) continue;
      const p = b.pos;
      const crouch = b.crouch ? 1 : 0;
      const bodyTop = crouch ? 1.05 : 1.5;
      const headY = p.y + (crouch ? 1.02 : 1.55);
      const tHead = raySphere(ox, oy, oz, dx, dy, dz, p.x, headY, p.z, 0.26, Math.min(maxDist, best));
      if (tHead < best) { best = tHead; bestBot = b; bestPart = 'head'; }
      const tBody = rayBox(ox, oy, oz, dx, dy, dz, p.x - 0.36, p.y, p.z - 0.36, p.x + 0.36, p.y + bodyTop, p.z + 0.36, Math.min(maxDist, best));
      if (tBody < best) { best = tBody; bestBot = b; bestPart = 'body'; }
    }
    result.t = best;
    result.bot = bestBot;
    result.part = bestBot ? bestPart : (best < Infinity ? 'world' : null);
    result.px = ox + dx * best;
    result.py = oy + dy * best;
    result.pz = oz + dz * best;
    return result;
  }

  function damageFor(weapon, dist, part) {
    const w = weapon;
    let dmg = w.damage;
    if (dist > w.falloffStart) {
      const f = Math.min(1, (dist - w.falloffStart) / Math.max(1, w.falloffEnd - w.falloffStart));
      dmg *= 1 - 0.5 * f; // at most half damage at max range
    }
    if (part === 'head') dmg *= w.headMult;
    return Math.round(dmg);
  }

  return { raycast, damageFor };
}
