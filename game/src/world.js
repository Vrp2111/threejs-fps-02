// Foundry Yard: a 64 x 48 m industrial yard, two bomb sites, three lanes,
// real cover. Every solid is an axis-aligned box, so one collider list
// drives movement, bot vision and bullets. Waypoints are a hand-placed
// graph; hold spots are the angles defenders watch.
import * as THREE from 'three';
import { PALETTE, SITES, POOLS } from './config.js';
import { rayBox } from './util.js';

const BOUNDS = { minX: -32, maxX: 32, minZ: -24, maxZ: 24 };

// Waypoint graph: index -> { x, z, links: [indices] }.
const NODES = [
  [-10, 20], [0, 20], [10, 20],            // 0-2 vanguard spawn
  [0, 14], [0, 2], [0, -8],                // 3-5 mid
  [28, 14], [28, 2], [28, -6], [24, -14],  // 6-9 A long + site A
  [-28, 14], [-28, 2], [-28, -6], [-24, -14], // 10-13 B tunnel + site B
  [16, 6], [-16, 6], [16, -6], [-16, -6],  // 14-17 connectors
  [12, -18], [-12, -18], [0, -16],         // 18-20 hollow back
  [8, 10], [-8, 10], [18, 14], [-18, 14],  // 21-24 yard
  [12, -20], [-12, -20], [2, -21],         // 25-27 hollow spawn
  [22, 2], [-22, 2], [22, -2], [-22, -2],  // 28-31 lane pockets
  [6, -6], [-6, -2],                        // 32-33 mid pockets
];
const LINKS = [
  // Mid wall (z=0): exactly one ground-level crossing, the double-door
  // gap x -3..3; the only link across is the straight [4,5]. The old
  // diagonals crossed outside the gap or ended inside the wall (nodes
  // 7/11 sat inside it, so bots walked in and never moved). The tower
  // moved east to (10,-2) so the crossing stays open.
  [0, 1], [1, 2], [0, 3], [1, 3], [2, 3], [3, 21], [3, 22], [3, 4],
  [4, 14], [4, 15], [4, 5], [5, 16], [5, 17], [5, 18],
  [5, 19], [5, 20], [6, 7], [7, 28], [8, 9], [6, 23], [8, 30],
  [9, 18], [9, 30], [10, 11], [11, 29], [12, 13], [10, 24],
  [12, 31], [13, 19], [13, 31], [14, 21], [14, 28], [15, 22],
  [15, 29], [16, 18], [16, 30], [17, 19], [17, 31], [18, 25],
  [19, 26], [20, 27], [21, 23], [22, 24], [23, 6], [24, 10], [25, 27],
  [26, 27], [28, 14], [29, 15], [30, 16], [31, 17], [30, 32], [31, 33],
  [32, 5], [33, 5], [2, 23], [0, 24],
  [21, 3], [22, 3],
];

function letterSprite(letter, color) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(10,10,12,0.55)';
  ctx.beginPath(); ctx.arc(64, 64, 60, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(64, 64, 56, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = color; ctx.font = 'bold 72px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(letter, 64, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const s = new THREE.Sprite(mat);
  s.scale.set(3.2, 3.2, 1);
  return s;
}

export function createWorld(scene, textures) {
  const colliders = [];
  const group = new THREE.Group();
  scene.add(group);
  const mats = {
    ground: new THREE.MeshStandardMaterial({ map: textures.ground, roughness: 0.9, metalness: 0.05 }),
    wall: new THREE.MeshStandardMaterial({ map: textures.wall, roughness: 0.85, metalness: 0.05 }),
    crate: new THREE.MeshStandardMaterial({ map: textures.crate, roughness: 0.8 }),
    contA: new THREE.MeshStandardMaterial({ map: textures.containerA, roughness: 0.7, metalness: 0.25 }),
    contB: new THREE.MeshStandardMaterial({ map: textures.containerB, roughness: 0.7, metalness: 0.25 }),
    contC: new THREE.MeshStandardMaterial({ map: textures.containerC, roughness: 0.7, metalness: 0.25 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x6a6e75, roughness: 0.75, metalness: 0.35 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xb8bec4, roughness: 0.3, metalness: 0.8 }),
    pipe: new THREE.MeshStandardMaterial({ color: 0xc8a03a, roughness: 0.5, metalness: 0.6 }),
    pipeBlue: new THREE.MeshStandardMaterial({ color: 0x4a90b8, roughness: 0.5, metalness: 0.6 }),
    barrel: new THREE.MeshStandardMaterial({ color: 0xc05a30, roughness: 0.55, metalness: 0.4 }),
    barrelB: new THREE.MeshStandardMaterial({ color: 0x3a7a8a, roughness: 0.55, metalness: 0.4 }),
    siteA: new THREE.MeshStandardMaterial({ color: 0x2a2a2a, emissive: PALETTE.siteA, emissiveIntensity: 0.9, roughness: 0.5 }),
    siteB: new THREE.MeshStandardMaterial({ color: 0x2a2a2a, emissive: PALETTE.siteB, emissiveIntensity: 0.9, roughness: 0.5 }),
    signA: new THREE.MeshStandardMaterial({ color: 0xf0a830, roughness: 0.6, emissive: 0xf0a830, emissiveIntensity: 0.25 }),
    signB: new THREE.MeshStandardMaterial({ color: 0x37c8ab, roughness: 0.6, emissive: 0x37c8ab, emissiveIntensity: 0.25 }),
  };
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);

  function box(x, y, z, w, h, d, mat, collide = true) {
    const m = new THREE.Mesh(boxGeo, mat);
    m.position.set(x, y + h / 2, z);
    m.scale.set(w, h, d);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
    if (collide) colliders.push({ minX: x - w / 2, minY: y, minZ: z - d / 2, maxX: x + w / 2, maxY: y + h, maxZ: z + d / 2 });
    return m;
  }
  function cylinder(x, z, r, h, mat) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20), mat);
    m.position.set(x, h / 2, z);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
    colliders.push({ minX: x - r, minY: 0, minZ: z - r, maxX: x + r, maxY: h, maxZ: z + r });
    return m;
  }

  // Ground
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(64, 48), mats.ground);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  group.add(ground);

  // Perimeter walls (height 4)
  box(0, 0, -24, 64, 4, 1, mats.wall);
  box(0, 0, 24, 64, 4, 1, mats.wall);
  box(-32, 0, 0, 1, 4, 48, mats.wall);
  box(32, 0, 0, 1, 4, 48, mats.wall);

  // Mid wall: double-door gap (x -3..3), window gap (x -18..-14)
  box(-20, 0, 0, 24, 4, 1, mats.wall);
  box(20, 0, 0, 24, 4, 1, mats.wall);
  box(-5.5, 0, 0, 5, 4, 1, mats.wall);
  box(5.5, 0, 0, 5, 4, 1, mats.wall);
  // window lintel over the west gap
  box(-16, 2.2, 0, 4, 1.8, 1, mats.wall);
  box(-16, 0, 0, 4, 1.2, 1, mats.wall);

  // Site A — warehouse: container stack + crates
  box(26, 0, -18, 8, 2.6, 2.4, mats.contA);
  box(26, 2.6, -18, 8, 2.6, 2.4, mats.contB);
  box(20, 0, -20, 3, 2.2, 2, mats.crate);
  box(18.5, 0, -11, 2.2, 1.1, 2.2, mats.crate);
  box(29, 0, -9, 2.2, 1.1, 2.2, mats.crate);
  // (24,-8.5) block was on hold spot A[2]; moved west.
  box(21, 0, -8.5, 2.4, 2.2, 1.2, mats.dark);
  // Site B — silos
  cylinder(-27, -18, 2.2, 5.5, mats.steel);
  cylinder(-21.5, -19.5, 2.2, 5.5, mats.steel);
  // 3rd silo moved west: it covered site B centre + waypoint 13.
  cylinder(-27.5, -14.5, 1.6, 4.2, mats.steel);
  box(-30, 0, -9, 2.2, 1.1, 2.2, mats.crate);
  box(-19, 0, -10, 2.4, 2.2, 1.2, mats.dark);
  box(-24, 0, -20.5, 6, 1.1, 1.2, mats.crate);

  // Lane cover: crates/containers mid + yards, clear of waypoints/spine.
  // Gaps 2.4 m; a 0.4 m slot once wedged a planter for a whole round.
  box(-10, 0, 13, 2.2, 1.1, 2.2, mats.crate);
  box(10, 0, 13, 2.2, 1.1, 2.2, mats.crate);
  box(5, 0, 14, 3, 2.2, 1.4, mats.contC);
  box(-14, 0, 10, 2.2, 2.2, 2.2, mats.contB);
  box(14, 0, 10, 2.2, 2.2, 2.2, mats.contA);
  // (9,-5) crate deleted (diagonals cross there); mirror stays.
  box(-9, 0, -5, 2.2, 1.1, 2.2, mats.crate);
  box(-20, 0, -6, 2.4, 2.2, 1.2, mats.dark);
  box(20, 0, -6, 2.4, 2.2, 1.2, mats.dark);
  box(10, 0, -12, 4, 1.1, 1.4, mats.crate);
  box(-25, 0, 6, 2.2, 1.1, 2.2, mats.crate);
  box(25, 0, 6, 2.2, 1.1, 2.2, mats.crate);
  // Barrels (low cover, 1.0 high)
  const barrelGeo = new THREE.CylinderGeometry(0.55, 0.55, 1.0, 12);
  [[12, 15], [13, 15.9], [12, -10], [13, -10.8], [-24, 5], [24, 12], [4, -18]].forEach(([x, z], i) => {
    const m = new THREE.Mesh(barrelGeo, i % 2 ? mats.barrelB : mats.barrel);
    m.position.set(x, 0.5, z); m.castShadow = true; m.receiveShadow = true;
    group.add(m);
    colliders.push({ minX: x - 0.55, minY: 0, minZ: z - 0.55, maxX: x + 0.55, maxY: 1.0, maxZ: z + 0.55 });
  });

  // Pipes run along the north and south walls: colour and a low sightline
  // break, so the yard reads as a working foundry instead of an empty box.
  const pipeGeo = new THREE.CylinderGeometry(0.28, 0.28, 1, 10);
  function pipeRun(x, z, len, mat, alongX) {
    const m = new THREE.Mesh(pipeGeo, mat);
    m.position.set(x, 3.6, z);
    m.scale.set(1, len, 1);
    m.rotation.z = alongX ? Math.PI / 2 : 0;
    m.rotation.x = alongX ? 0 : Math.PI / 2;
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
    return m;
  }
  pipeRun(0, -23.4, 60, mats.pipe, true);
  pipeRun(0, 23.4, 60, mats.pipeBlue, true);
  pipeRun(-31.4, 0, 44, mats.pipe, false);
  pipeRun(31.4, 0, 44, mats.pipeBlue, false);
  // Pipe supports: vertical posts every 8 m.
  const postGeo = new THREE.CylinderGeometry(0.09, 0.09, 3.6, 8);
  for (let x = -28; x <= 28; x += 8) {
    for (const z of [-23.4, 23.4]) {
      const p = new THREE.Mesh(postGeo, mats.dark);
      p.position.set(x, 1.8, z); p.castShadow = true; group.add(p);
    }
  }

  // Gantry crane beam across mid: the yard's landmark, and a shadow-casting
  // frame that breaks the skyline. It is above head height, so it never
  // blocks a bullet, but it makes the map read at a glance.
  box(0, 6.4, 0, 1.2, 1.2, 48, mats.dark, false);
  box(-4, 5.2, -8, 1.0, 1.0, 1.0, mats.signA, false);
  box(4, 5.2, 8, 1.0, 1.0, 1.0, mats.signB, false);
  // Gantry legs at the walls.
  box(-31, 0, -6, 1.0, 6.4, 1.0, mats.dark);
  box(-31, 0, 6, 1.0, 6.4, 1.0, mats.dark);
  box(31, 0, -6, 1.0, 6.4, 1.0, mats.dark);
  box(31, 0, 6, 1.0, 6.4, 1.0, mats.dark);

  // Control tower at east-mid: two storeys, lit window band, the yard's
  // landmark and strongest mid cover. It stood at (0,-2), on the [4,5]
  // crossing, so no bot could cross mid; it moved east to (10,-2).
  box(10, 0, -2, 4, 3.2, 3, mats.wall);
  box(10, 3.2, -2, 4.4, 0.4, 3.4, mats.dark);
  box(10, 3.6, -2, 4, 2.2, 3, mats.wall);
  box(10, 4.2, -3.55, 3.6, 0.9, 0.1, mats.signA, false); // lit window band
  box(10, 4.2, -0.45, 3.6, 0.9, 0.1, mats.signB, false);

  // Site signs: a lit panel over each site entrance so the objective reads
  // from across the yard.
  box(24, 4.6, -20.5, 5, 1.2, 0.3, mats.signA, false);
  box(-24, 4.6, -20.5, 5, 1.2, 0.3, mats.signB, false);

  // Extra lane cover: crates against the site corners, clear of every
  // waypoint link, so no lane is one open sightline spawn-to-site. The
  // (+-18,-12) crates stood on hold spots A[3]/B[3].
  box(30, 0, -18, 2, 1.1, 2, mats.crate);
  box(-30, 0, -18, 2, 1.1, 2, mats.crate);
  box(-18, 0, -14, 2.2, 1.1, 2.2, mats.crate);
  box(18, 0, -14, 2.2, 1.1, 2.2, mats.crate);

  // Site markers: ring + pole + letter
  const ringGeo = new THREE.RingGeometry(SITES.A.r - 0.35, SITES.A.r, 40);
  const ringA = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: PALETTE.siteA, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
  ringA.rotation.x = -Math.PI / 2; ringA.position.set(SITES.A.x, 0.03, SITES.A.z); group.add(ringA);
  const ringB = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: PALETTE.siteB, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
  ringB.rotation.x = -Math.PI / 2; ringB.position.set(SITES.B.x, 0.03, SITES.B.z); group.add(ringB);
  const spriteA = letterSprite('A', '#f0a830'); spriteA.position.set(SITES.A.x, 5.2, SITES.A.z); group.add(spriteA);
  const spriteB = letterSprite('B', '#37c8ab'); spriteB.position.set(SITES.B.x, 5.2, SITES.B.z); group.add(spriteB);
  // 'F' landmark (E16); 4.5 m sign (E27).
  const sF = letterSprite('F', '#f0a830'); sF.position.set(0, 5.2, 0); sF.scale.set(4.5, 4.5, 1); group.add(sF);

  // E31 pools: three-tone lava discs, unlit (glow); never colliders.
  const poolGeo = new THREE.CircleGeometry(1, 24);
  function poolMesh(p) {
    const g = new THREE.Group();
    [[1, 0xc23a08], [0.72, 0xff7a18], [0.4, 0xffc23a]].forEach(([s, c], i) => {
      const m = new THREE.Mesh(poolGeo, new THREE.MeshBasicMaterial({ color: c }));
      m.rotation.x = -Math.PI / 2; m.position.set(p.x, 0.02 + i * 0.01, p.z);
      m.scale.set(p.r * s, p.r * s, 1); g.add(m);
    });
    return g;
  }
  for (const p of POOLS) group.add(poolMesh(p));

  // Light poles with emissive heads
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 6, 8);
  const headGeo = new THREE.BoxGeometry(0.9, 0.18, 0.4);
  const headMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffe0b0, emissiveIntensity: 1.6 });
  [[-16, 12], [16, 12], [0, -4], [-26, 4], [26, -4]].forEach(([x, z]) => {
    const p = new THREE.Mesh(poleGeo, mats.dark); p.position.set(x, 3, z); group.add(p);
    const h = new THREE.Mesh(headGeo, headMat); h.position.set(x, 6.05, z); group.add(h);
  });

  // Distant skyline silhouettes outside the walls, warm against the sky.
  const skyMat = new THREE.MeshBasicMaterial({ color: 0x9a6a52 });
  for (let i = 0; i < 14; i++) {
    const w = 6 + Math.random() * 10;
    const h = 6 + Math.random() * 16;
    const m = new THREE.Mesh(boxGeo, skyMat);
    const ang = (i / 14) * Math.PI * 2;
    m.position.set(Math.cos(ang) * 58, h / 2 - 0.5, Math.sin(ang) * 48);
    m.scale.set(w, h, w);
    group.add(m);
  }

  // Waypoint adjacency
  const waypoints = NODES.map(([x, z]) => ({ x, z, links: [] }));
  for (const [a, b] of LINKS) { waypoints[a].links.push(b); waypoints[b].links.push(a); }

  // Hold spots: where defenders watch from (x, z, yaw facing the approach).
  const holdSpots = {
    A: [
      { x: 20.5, z: -17.5, yaw: -Math.PI * 0.75 }, { x: 28.5, z: -11, yaw: Math.PI * 0.25 },
      { x: 24, z: -8, yaw: Math.PI }, { x: 17, z: -12, yaw: -Math.PI * 0.5 },
    ],
    B: [
      // B[0] was inside the (-21.5,-19.5) silo; moved north.
      { x: -20.5, z: -15.5, yaw: -Math.PI * 0.25 }, { x: -28.5, z: -11, yaw: Math.PI * 0.75 },
      { x: -24, z: -8, yaw: Math.PI }, { x: -17, z: -12, yaw: -Math.PI * 0.5 },
    ],
  };

  // 3D line-of-sight: true when a wall blocks the segment. Smoke is handled
  // by the caller (it is not a collider).
  function losBlocked(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 0.001) return false;
    const inv = 1 / dist;
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (rayBox(ax, ay, az, dx * inv, dy * inv, dz * inv, c.minX, c.minY, c.minZ, c.maxX, c.maxY, c.maxZ, dist - 0.05) < Infinity) return true;
    }
    return false;
  }

  return {
    group, colliders, waypoints, holdSpots, bounds: BOUNDS, losBlocked, mats, pools: POOLS,
    addPool(p) { group.add(p.mesh = poolMesh(p)); },
    delPool(p) { group.remove(p.mesh); },
  };
}
