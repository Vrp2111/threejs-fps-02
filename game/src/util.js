// Small helpers shared by every module. No allocations in the hot path:
// callers pass preallocated vectors into the ray and segment tests.
export function mulberry32(initial) {
  let a = initial | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

export function fmtTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Slab test: ray (ox,oy,oz) + t*dir against an axis-aligned box.
// Returns the smallest t >= 0 of the hit, or Infinity. `out` is unused; kept
// allocation-free by working on scalars only.
export function rayBox(ox, oy, oz, dx, dy, dz, minX, minY, minZ, maxX, maxY, maxZ, maxT) {
  let tmin = 0;
  let tmax = maxT;
  let t;
  // X slab
  if (dx === 0) { if (ox < minX || ox > maxX) return Infinity; }
  else {
    t = (dx > 0 ? (minX - ox) / dx : (maxX - ox) / dx);
    const t2 = (dx > 0 ? (maxX - ox) / dx : (minX - ox) / dx);
    if (t > tmin) tmin = t;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  if (dy === 0) { if (oy < minY || oy > maxY) return Infinity; }
  else {
    t = (dy > 0 ? (minY - oy) / dy : (maxY - oy) / dy);
    const t2 = (dy > 0 ? (maxY - oy) / dy : (minY - oy) / dy);
    if (t > tmin) tmin = t;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  if (dz === 0) { if (oz < minZ || oz > maxZ) return Infinity; }
  else {
    t = (dz > 0 ? (minZ - oz) / dz : (maxZ - oz) / dz);
    const t2 = (dz > 0 ? (maxZ - oz) / dz : (minZ - oz) / dz);
    if (t > tmin) tmin = t;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}

// Segment (ax,az)->(bx,bz) blocked in 2D by a box footprint? Used for bot
// hearing/LOS in the XZ plane: true when the segment crosses the box.
export function segmentHitsBox2D(ax, az, bx, bz, minX, minZ, maxX, maxZ) {
  // Quick reject by bounding box, then slab test in 2D.
  const dx = bx - ax;
  const dz = bz - az;
  let tmin = 0;
  let tmax = 1;
  let t;
  if (dx === 0) { if (ax < minX || ax > maxX) return false; }
  else {
    t = (dx > 0 ? (minX - ax) / dx : (maxX - ax) / dx);
    const t2 = (dx > 0 ? (maxX - ax) / dx : (minX - ax) / dx);
    if (t > tmin) tmin = t;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return false;
  }
  if (dz === 0) { if (az < minZ || az > maxZ) return false; }
  else {
    t = (dz > 0 ? (minZ - az) / dz : (maxZ - az) / dz);
    const t2 = (dz > 0 ? (maxZ - az) / dz : (minZ - az) / dz);
    if (t > tmin) tmin = t;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return false;
  }
  return true;
}
