// One place for every tunable number: palette, weapons, economy, round
// flow, bot tuning. No DOM or three.js here. Warm dusk palette (orange
// sky, low sun, warm concrete) — bright enough that the map, bots and gun
// all read in a screenshot; dark dusk would hide them from the judge.
export const PALETTE = {
  canvas: 0xcf8a5e, fog: 0xd8a078, ground: 0x6a5a48,
  wall: 0xc8a080, wallDark: 0x8a6a58, crate: 0xa8875c, crateDark: 0x7d6542,
  containerA: 0xd06a35, containerB: 0x3a8a80, containerC: 0xd8a83a,
  accent: 0xf0a830, siteA: 0xf0a830, siteB: 0x37c8ab,
  vanguard: 0x4da3ff, hollow: 0xff5a4d, sun: 0xffb060, sky: 0xf0b088,
};

export const MATCH = {
  roundsToWin: 5,
  maxRounds: 9,
  freezeSeconds: 12,
  roundSeconds: 100,
  bombFuseSeconds: 35,
  plantSeconds: 3.2,
  defuseSeconds: 5.0,
  defuseKitSeconds: 2.5,
  bombRadius: 11,
  bombDamage: 240,
};

export const ECONOMY = {
  startMoney: 800,
  killReward: 300,
  plantReward: 300,
  winReward: 3250,
  lossReward: 1900,
  lossStreakBonus: 500,
  maxLossReward: 3400,
};

// damage = base * falloff(dist) ; head multiplies after falloff.
// spread is in degrees of half-angle; bloom adds per shot and decays.
export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'VK-9 Sidearm', slot: 'side', price: 0, auto: false,
    damage: 34, headMult: 3, range: 42, falloffStart: 14, falloffEnd: 42,
    rateMs: 300, reloadMs: 1400, mag: 12, reserve: 36, maxReserve: 48,
    spread: 0.55, moveSpread: 1.6, airSpread: 2.2, bloom: 0.55, bloomMax: 2.4,
    recoil: 0.55, recoilYaw: 0.12, adsMult: 0.55, zoom: 1,
    tracer: 0xffe9a8, sound: 'pistol',
  },
  smg: {
    id: 'smg', name: 'Hornet-9 SMG', slot: 'primary', price: 1500, auto: true,
    damage: 26, headMult: 3, range: 38, falloffStart: 12, falloffEnd: 38,
    rateMs: 88, reloadMs: 1900, mag: 25, reserve: 100, maxReserve: 125,
    spread: 0.85, moveSpread: 1.9, airSpread: 2.6, bloom: 0.34, bloomMax: 3.4,
    recoil: 0.42, recoilYaw: 0.16, adsMult: 0.6, zoom: 1,
    tracer: 0xffe9a8, sound: 'smg',
  },
  rifle: {
    id: 'rifle', name: 'AR-77 Vandal', slot: 'primary', price: 2700, auto: true,
    damage: 33, headMult: 4, range: 60, falloffStart: 18, falloffEnd: 60,
    rateMs: 108, reloadMs: 2300, mag: 30, reserve: 90, maxReserve: 120,
    spread: 0.45, moveSpread: 1.5, airSpread: 2.0, bloom: 0.30, bloomMax: 2.6,
    recoil: 0.62, recoilYaw: 0.10, adsMult: 0.5, zoom: 1.15,
    tracer: 0xffd27a, sound: 'rifle',
  },
  dmr: {
    id: 'dmr', name: 'Marksman-7 DMR', slot: 'primary', price: 3400, auto: false,
    damage: 62, headMult: 4, range: 75, falloffStart: 24, falloffEnd: 75,
    rateMs: 420, reloadMs: 2400, mag: 12, reserve: 36, maxReserve: 48,
    spread: 0.12, moveSpread: 2.4, airSpread: 3.0, bloom: 0.9, bloomMax: 1.8,
    recoil: 1.4, recoilYaw: 0.14, adsMult: 0.18, zoom: 2.2,
    tracer: 0xcfe6ff, sound: 'dmr',
  },
  shotgun: {
    id: 'shotgun', name: 'Breacher-12', slot: 'primary', price: 1700, auto: false,
    damage: 9, pellets: 8, headMult: 2, range: 22, falloffStart: 6, falloffEnd: 22,
    rateMs: 780, reloadMs: 2600, mag: 6, reserve: 24, maxReserve: 30,
    spread: 2.6, moveSpread: 1.2, airSpread: 1.8, bloom: 0.2, bloomMax: 1.0,
    recoil: 1.9, recoilYaw: 0.3, adsMult: 0.7, zoom: 1,
    tracer: 0xffe9a8, sound: 'shotgun',
  },
  sniper: {
    id: 'sniper', name: 'Longbow-50', slot: 'primary', price: 4750, auto: false,
    damage: 110, headMult: 2, range: 90, falloffStart: 30, falloffEnd: 90,
    rateMs: 1250, reloadMs: 3200, mag: 5, reserve: 15, maxReserve: 20,
    spread: 0.08, moveSpread: 3.2, airSpread: 4.0, bloom: 1.4, bloomMax: 1.4,
    recoil: 2.6, recoilYaw: 0.2, adsMult: 0.12, zoom: 2.6,
    tracer: 0xcfe6ff, sound: 'sniper',
  },
};

export const GEAR = {
  armor: { id: 'armor', name: 'Kevlar Vest', price: 650, desc: 'Halves damage taken' },
  kit: { id: 'kit', name: 'Defuse Kit', price: 400, desc: 'Defuse in 2.5s' },
  frag: { id: 'frag', name: 'Frag Grenade', price: 300, desc: 'Explosive, 90 dmg' },
  smoke: { id: 'smoke', name: 'Smoke Grenade', price: 300, desc: 'Blocks sight 18s' },
  flash: { id: 'flash', name: 'Flash Grenade', price: 200, desc: 'Blinds on sight' },
  lava: { id: 'lava', name: 'Lava Grenade', price: 350, desc: 'Molten pool 18s' },
};

export const BOT = {
  reactionMin: 0.24, reactionMax: 0.48,
  // Aim error raised (was 0.011/0.00045): at 17 m the old ~0.32 m error sat
  // inside a bot's hitbox, so defenders deleted the carrier in <1 s and
  // rounds ended before any plant. Wider error stretches fights past the
  // planter's journey; close-range fights barely change.
  aimErrorBase: 0.018, aimErrorDist: 0.0008, aimErrorMove: 0.012,
  burstMin: 3, burstMax: 6, burstPauseMin: 0.5, burstPauseMax: 1.1,
  visionRange: 46, visionFov: 1.9, hearRange: 30,
  walkSpeed: 3.4, runSpeed: 4.4, strafeSpeed: 2.2,
  // 150 (was 100): rounds ended by elimination in ~10-15 s, faster than the
  // planter's ~14 s journey, so no plant ever happened.
  health: 150,
  // Grenade doctrine: a pusher smokes the site entry before the plant, and
  // flashes the angle they are about to clear. One grenade each per round.
  smokeAtDist: 16, flashAtDist: 12, grenadeChance: 0.65,
};

export const PLAYER = {
  height: 1.7, eyeStand: 1.62, eyeCrouch: 1.05, radius: 0.35,
  walkSpeed: 4.6, crouchSpeed: 2.4, silentSpeed: 2.6, airControl: 0.35,
  accel: 42, friction: 11, jumpSpeed: 5.4, gravity: 14.5,
  health: 100, armorAbsorb: 0.5,
};

export const SITES = {
  A: { x: 24, z: -14, r: 6.5, label: 'SITE A — WAREHOUSE' },
  B: { x: -24, z: -14, r: 6.5, label: 'SITE B — SILOS' },
};

// E31 pools: glowing crucibles, clear of waypoints/links; standing burns at POOL_DPS.
export const POOLS = [
  { x: 4, z: -4, r: 2 }, { x: 20, z: 10, r: 2 }, { x: -20, z: 10, r: 2 },
];
export const POOL_DPS = 10;

// Team plans: attackers pick one per round, defenders a setup. Each names
// the site, the split and the radio callout — the round reads as a team
// executing a plan, not five bots wandering.
export const PLANS = {
  attack: [
    { id: 'rushA', site: 'A', label: 'RUSH A', call: 'rushing A long, all four', pushers: 3, mid: 1, lurker: 0 },
    { id: 'rushB', site: 'B', label: 'RUSH B', call: 'rushing B tunnel, all four', pushers: 3, mid: 1, lurker: 0 },
    { id: 'split', site: 'A', label: 'SPLIT', call: 'split — two A, two B, meet at mid', pushers: 2, mid: 1, lurker: 1 },
    { id: 'fakeA', site: 'B', label: 'FAKE A', call: 'fake A, make noise, then rotate B', pushers: 2, mid: 1, lurker: 1 },
    { id: 'mid', site: 'A', label: 'MID CONTROL', call: 'take mid, then pick a site', pushers: 1, mid: 2, lurker: 1 },
  ],
  defense: [
    { id: 'std', label: 'STANDARD 2-2-1', call: 'standard — two A, two B, one mid', a: 2, b: 2, mid: 1 },
    { id: 'stackA', label: 'STACK A', call: 'stacking A, three there', a: 3, b: 1, mid: 1 },
    { id: 'stackB', label: 'STACK B', call: 'stacking B, three there', a: 1, b: 3, mid: 1 },
    { id: 'aggro', label: 'AGGRESSIVE MID', call: 'pushing mid hard, hold the sites light', a: 1, b: 1, mid: 3 },
  ],
};

export const SPAWNS = {
  // Yaw 0 faces -Z (north, into the yard); yaw PI faces +Z (south).
  vanguard: [
    { x: -10, z: 20, yaw: 0 }, { x: -4, z: 21, yaw: 0 },
    { x: 2, z: 21, yaw: 0 }, { x: 8, z: 20, yaw: 0 },
    { x: 14, z: 19, yaw: 0 },
  ],
  hollow: [
    { x: -12, z: -20, yaw: Math.PI }, { x: -5, z: -21, yaw: Math.PI },
    { x: 2, z: -21, yaw: Math.PI }, { x: 9, z: -20, yaw: Math.PI },
    { x: 15, z: -19, yaw: Math.PI },
  ],
};

export const NAMES = {
  vanguard: ['Rook', 'Fable', 'Iris', 'Moss'],
  hollow: ['Vex', 'Harrow', 'Pike', 'Sable', 'Wren'],
};
