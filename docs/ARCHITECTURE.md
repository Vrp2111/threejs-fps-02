# ARCHITECTURE.md — EMBERLINE module map (rebuild commit 29709f3)

Entry: `~/workspace/makefun/entries/threejs-fps-02/`. Local git: baseline
`db1745b` (submitted), rebuild `29709f3`. The game is `game/` +
`screenshots/` + `dossier.json` (built by `main.ts` from the kit).

## Files
- `game/index.html` — entrypoint (12,944 bytes). Import map `"three"` →
  `./vendor/three/three.module.min.js`. HUD DOM (health/ammo/timer/
  score, killfeed, buy menu, minimap canvas, callout line, banners).
- `game/src/main.js` — bootstrap + fixed-step loop + input + camera +
  staging (`?shot=start|buy|play|plant&seed=7` re-stages the scene for
  screenshots; waits for `window.__shotReady`). Wires `game`, `bots`,
  `weapons`, `effects`, `hud`, `audio`, `tactics` together.
- `game/src/game.js` — match state machine (menu → freeze → live →
  roundEnd → matchEnd), rounds, score, money, bomb state (carried /
  dropped / planted / defused / exploded), plant/defuse timers,
  `plantBomb()`, player bomb pickup, round-end timer (see B1 — the
  roundEnd soft-lock was here, via main.js's guard).
- `game/src/bots.js` — bot AI: perceive → grenade doctrine → combat
  OR objective → separation → mesh sync. BFS pathfinding over the
  waypoint graph (`findPath`, `followPath` with stuck detection +
  replan, `setPath`), `moveBot` (axis-separated collision, radius
  0.36), `collides()` (the single source of truth for movement
  blocking — the nav validator uses the same rule).
- `game/src/tactics.js` — NEW in the rebuild. Team plans (attack:
  rushA, rushB, split, fakeA, mid; defense: std 2-2-1, stackA, stackB,
  aggro), score-weighted pick, `announce`, `targetSite` (fakeA decoy),
  `roleTarget`, `defenseSplit`, `eventCall` (kill/plant/defuse/rotate/
  smoke/flash lines), `sitePos`.
- `game/src/world.js` — the Foundry Yard map: mid wall with door gap,
  two sites, control tower (moved to (10,-2) in the rebuild), gantry
  crane, pipes, crates, containers, silos, barrels, site signs, skyline.
  Owns the waypoint graph (34 nodes, 59 links) and the collider list.
- `game/src/config.js` — palette, weapons table (10 weapons incl. the
  new DMR Marksman-7), bot doctrine constants (smokeAtDist 16,
  flashAtDist 12, grenadeChance 0.65), match constants (plant 3.2 s,
  round 100 s, first to 5).
- `game/src/weapons.js` — viewmodels (DMR: long scope + bipod lug +
  accent stripe), shooting (raycast, headshot, recoil, spread),
  reload, ammo, grenade physics (smoke/flash), muzzle/impact effects.
- `game/src/effects.js` — tracers, sparks, smoke, flash, explosions.
  Module `tmpColor` reused (no per-frame allocation).
- `game/src/hud.js` — health/ammo/timer/score, killfeed (5 entries),
  buy menu (keys 1–9/0), minimap (brightened: background
  rgba(226,232,238,0.92), walls #3a3f47), callout line (team-coloured,
  4 s), banners, `hideBanner()`.
- `game/src/audio.js` — WebAudio gunshots (incl. new 'dmr': bandpass
  1100 + 150 Hz tone), reload, plant/defuse beeps, round stingers.
- `game/src/textures.js` — procedural canvas textures (ground, crate,
  wall, lane paint) in the bright palette.
- `game/src/main.ts` (repo root) — the kit's dossier builder
  (`buildDossier`); NOT game code. `main.ts` in the repo root is the
  make.fun entrypoint for the source bundle.
- `docs/` — this knowledge base (KNOWLEDGE.md, EXPERIMENTS.md,
  BUG_DATABASE.md, PERFORMANCE_LOG.md, AI_BEHAVIOR_RESEARCH.md,
  COMPETITIVE_ANALYSIS.md, ARCHITECTURE.md). Repo-root docs, outside
  `game/` — they do not count toward the judge's 163,840-byte source
  cap or the game/ gate.

## Data flow (one fixed step)
1. `main.js step(dt)`: input → `game.update(dt, now, input)` (state
   machine, bomb, timers) → `bots.update(dt, now, phase, bomb)`
   (perceive, doctrine, combat/objective, separation) →
   `weapons.updateGrenades(dt, world, onGrenadeEvent)` →
   `effects.update(dt)` → `hud` sync → render.
2. State lives in one place: `game.js` owns `gs` (phase, round, score,
   bomb, money); bots own their own `b` objects; `tactics` owns the
   plan. No duplicated state.
3. `ctx` (built in main.js) is the wiring object passed to bots:
   `ctx.attackSite`, `ctx.tactics`, `ctx.throwGrenade`,
   `ctx.onTacticEvent`, `ctx.onPlant/onDefuse/onKill`.

## Invariants (enforced by the smoke test + validator)
- The waypoint graph is fully connected and every node/link/hold
  spot/spawn/site is clear of every collider (validator: 0 violations).
- `game.update` is called in EVERY phase (B1) — the round-end timer
  must tick.
- No per-frame allocations in the hot loops (criterion 5).
- `followPath` never pushes a bot into a wall forever (stuck detection
  + BFS replan, B4); separation never pushes a bot into a collider (B3).
- three.js vendor files are byte-identical to the kit's; no network or
  absolute references in `game/`.

## Test harness (not part of the submission)
- `~/workspace/makefun/smoke-test/`: `fps-smoke.mjs` (DOM/canvas/audio
  stubs with real parent/children bookkeeping, real three.js via a
  module loader), `run-smoke.mjs`, `nav-validate.mjs`, `report.json`.
- Modes: default idle player; `SMOKE_DIAG=1` (per-2 s bot-state
  logging incl. planter path); `SMOKE_PUSH=1` (player walks the graph
  and plants); `SMOKE_DROP=1` (player dies + drops the bomb each round
  — tests the bot-plant fallback).
