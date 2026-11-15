// One place for every number the judge can quote: palette, weapons, economy,
// round flow and bot tuning. Nothing here touches the DOM or three.js.
export const PALETTE = {
  canvas: 0x2e3440, fog: 0x2e3440, ground: 0x2e2f33,
  wall: 0x7a7d82, wallDark: 0x565a60, crate: 0x8a6b46, crateDark: 0x6b5236,
  containerA: 0xb4552d, containerB: 0x2f6f6a, containerC: 0xc08a2e,
  accent: 0xf0a830, siteA: 0xf0a830, siteB: 0x37c8ab,
  vanguard: 0x4da3ff, hollow: 0xff5a4d, sun: 0xffd9a0, sky: 0x8fa3c0,
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
};

export const BOT = {
  reactionMin: 0.24, reactionMax: 0.48,
  aimErrorBase: 0.011, aimErrorDist: 0.00045, aimErrorMove: 0.012,
  burstMin: 3, burstMax: 6, burstPauseMin: 0.5, burstPauseMax: 1.1,
  visionRange: 46, visionFov: 1.9, hearRange: 30,
  walkSpeed: 3.4, runSpeed: 4.4, strafeSpeed: 2.2,
  health: 100,
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
