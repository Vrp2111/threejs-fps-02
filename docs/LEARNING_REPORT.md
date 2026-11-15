# LEARNING_REPORT.md — Mandatory technical learning (15 Nov 2026, WIB)

Task: become technically stronger BEFORE further changes to the FPS project,
then fix the biggest remaining weakness (reliable objective-based gameplay).
All findings below are from reading the actual documents and the actual
code. Nothing is invented. Where a document could not be fetched, that is
stated and the fallback source is named.

## 1. What each document taught us (applied to THIS project)

### 1.1 Three.js Fundamentals (threejs.org/manual/pages/fundamentals.html)
- Canonical app structure: `WebGLRenderer` + `Scene` + `PerspectiveCamera`,
  scenegraph of `Mesh` (Geometry + Material), lights, `requestAnimationFrame`
  loop. Our `main.js` already implements exactly this (renderer, scene,
  camera, hemisphere + directional sun + fill, `frame()` loop).
- Applicable lessons, all already applied in the rebuild: share one
  `Geometry`/`Material` across meshes (we share `boxGeo` and the `mats`
  table in `world.js`); cap `setPixelRatio` (we use
  `Math.min(devicePixelRatio, 2)`); use fog/lighting so the scene reads
  at a glance (bright palette, fog 42/130, sun 3.2).
- **Verdict: no change needed.** The doc confirms the architecture is
  sound; it does not reveal a missing fundamental.

### 1.2 Three.js PointerLockControls (threejs.org/docs/pages/PointerLockControls.html)
- API: `new PointerLockControls(camera, domElement)`, `lock()` /
  `unlock()`, `lock`/`unlock` events, `minPolarAngle`/`maxPolarAngle`
  (pitch clamp), pointer-speed multiplier, `getDirection()`.
- Our project uses a **custom** pointer lock (`main.js`): `mousemove`
  updates `ps.yaw`/`ps.pitch` (sensitivity 0.0022, pitch clamped
  ±1.5), `requestPointerLock()` on Play, `pointerlockchange` →
  PAUSED overlay. This already embodies every behaviour the addon
  provides.
- The addon lives in `examples/jsm/controls/` and must be imported from
  `three/addons/...`. Our entry vendors only `three.module.min.js`
  (byte-identical to the kit) and the import map maps only `"three"`.
  Vendoring the addon is possible but buys nothing: the custom code
  already works and is tuned to this game.
- **Verdict: no change.** Do not replace a working custom controller
  with the addon.

### 1.3 Recast Navigation JS (docs.recast-navigation-js.isaacmason.com)
- **Fetch status: the docs site could NOT be fetched** — `browser.open`
  failed (upstream fetch) and `curl` returned exit 52 / http=000
  (site unreachable from this VM). Content below is from the
  `browser.search` summary of the same docs site + the GitHub repo
  (recast-navigation-js-docs.isaacmason.com, github.com/isaac-mason/
  recast-navigation-js), which the search index returned verbatim.
- What it is: a WebAssembly port of Recast + Detour. Packages:
  `@recast-navigation/core`, `@recast-navigation/wasm` (the WASM build),
  `@recast-navigation/three` (`threeToSoloNavMesh`,
  `threeToTiledNavMesh`, `DebugDrawer`, `NavMeshHelper`),
  `@recast-navigation/playcanvas`. MIT licence, latest v0.44.0.
  `Crowd`/`CrowdAgent` covers walk-to-point, follow-entity, and
  inter-agent local avoidance; `TileCache` handles temporary obstacles.
  WASM init is asynchronous (`await` the module init).
- **Compatibility verdict: DO NOT ADD.** The entry is a static game
  with no build step and no network references, and the judge reads
  source text capped at 163,840 bytes (we are at 155,112 = 95%).
  A WASM binary (hundreds of KB) plus JS glue cannot fit the source
  cap, cannot be loaded without either a network fetch or a vendored
  `.wasm` file that blows the dossier, and requires async init that
  the fixed-step sim does not have. The kit's three.js must stay
  byte-identical; adding a second engine is out of scope.
- **Concepts to apply instead (no dependency):**
  - Navmesh validation — we already have it (`nav-validate.mjs`, 0
    violations across nodes/links/hold spots/spawns/sites).
  - Unreachable-destination detection — Detour reports failure; our
    `findPath` silently falls back to a direct line
    (`return [{x: toX, z: toZ}]`) when BFS fails. The graph is fully
    connected so this never fires in practice, but the fallback can
    send a bot straight through a wall. Improvement: log it (P2).
  - String-pulling / corridor refinement — our waypoint graph IS the
    corridor; `followPath` walks it. No change needed.
  - Crowd local avoidance — our separation push (B3, collision-aware)
    is the same idea at this scale. No change needed.
  - Agent radius/height — our `collides()` uses radius 0.36 / height
    1.7 (crouch 1.1), the same parameters Recast takes. No change.

### 1.4 Recast Navigation Concepts (recastnavigation/Docs/_1_Introduction.md)
- A navmesh is a simplified view of traversable area built from the
  physics colliders (voxelize → filter → triangulate). Triangles are
  graph nodes; edges are connections. Pathfinding builds a polygon
  corridor, then string-pulls it into waypoints. Agent size (radius +
  height), max slope, and max step-up define walkability. A navmesh is
  NOT collision geometry and should not be used as such.
- **Applied to us:** our hand-placed waypoint graph (34 nodes, 59
  links) is a hand-built navmesh for a flat map (no slopes, no
  step-ups — the map is a single plane, so slope/step-up do not
  apply). The collider list IS the navmesh source (the validator
  checks every node/link against every collider with the bots' exact
  `collides()` rule). The "do not use the navmesh as collision
  geometry" warning is respected: movement blocking uses `collides()`,
  not the waypoint graph.
- **Verdict: no change.** The concept validates our existing design;
  the only gap is the silent BFS fallback (see 1.3).

### 1.5 Rapier Character Controller (rapier.rs/docs/.../character_controller)
- A kinematic character controller computes `computeColliderMovement`
  (desired translation → corrected translation) with move-and-slide,
  an `offset` gap (0.01), max slope climb / min slope slide angles,
  autostep (step height + width), snap-to-ground, collision events,
  and filters. Gravity is the caller's job (add a downward component).
- **Applied to us:** our `moveBot` already does axis-separated slide
  (the move-and-slide operation); the 0.36 bot radius is the offset;
  the map is flat so slopes/autostep/snap-to-ground do not apply; the
  player controller (`player.js`) already adds gravity. The
  collision-event idea maps to our stuck detection (B4): when a move
  is blocked, we detect it and replan.
- **Compatibility verdict: DO NOT ADD.** `@dimforge/rapier3d` (or
  `-compat` with base64-inlined WASM) is a ~1–2 MB WASM binary with
  async init — same cap/build-step problem as Recast. Our AABB
  collision + raycast (`combat.js`, `world.losBlocked`) already cover
  what the game needs.
- **Verdict: no change.** Concepts already embodied.

### 1.6 Rapier Scene Queries (rapier.rs/docs/.../scene_queries)
- `castRay` (first hit + time-of-impact), `castRayAndGetNormal`,
  `intersectionsWithRay` (all hits), `castShape` (sweep test: a shape
  travelling along a line — used for character controllers),
  `projectPoint`, `intersectionsWithPoint/Shape`, and query filters
  (exclude self, collision groups, predicate).
- **Applied to us:** `combat.raycast` is `castRay` with the same
  semantics (origin + direction, max range, first hit, hit point,
  part, bot); `world.losBlocked` (rayBox) is the LOS query;
  `collides()` (radius check) is the `castShape` equivalent for a
  capsule approximated as a circle; the `selfId` parameter in
  `raycast` is the "exclude self" filter. `projectPoint` has no
  equivalent and no use here (no need to snap points to colliders).
- **Verdict: no change.** The query set is complete for this game.
  Perf note: `losBlocked` is O(colliders) per call and runs in
  `perceive`/`canSee` for every bot pair; the smoke test reports
  0 slow steps at this scale, so it is fine — watch it if the map
  grows.

### 1.7 Playwright Screenshot Testing (playwright.dev/docs/screenshots)
- `page.screenshot({path, type:'jpeg', quality, fullPage, clip})`,
  buffers instead of files, element screenshots.
- **Applied to us:** we already use Playwright
  (`tools/shot/fps-shots.mjs`: `waitForFunction(__shotReady)` +
  `page.screenshot({type:'jpeg', quality:85})` at 1280x720). The doc's
  additions worth adopting:
  - **Element/clip screenshots** — capture the minimap canvas alone
    (`clip` on the `#minimap` bounding box) for verification, instead
    of eyeballing the full frame.
  - **Console/pageerror monitoring** — `page.on('pageerror')` and
    `page.on('console')` during capture, so a JS error fails the shot
    loudly instead of producing a black frame. (Used ad hoc in the
    minimap debug; formalize it into the shot script — P2.)
  - **Pixel assertions** — assert the frame is not black/empty (mean
    luminance + the minimap light-% probe). The minimap bug (B10) was
    caught exactly this way; bake the probe into the script so it
    cannot regress silently.
- **Verdict: adopt the QA additions (P2).** No change to the capture
  method itself.

## 2. Gap analysis: what is already implemented vs missing

### A. AI navigation
| Concept | Status |
|---|---|
| Pathfinding spawn → sites (BFS over waypoint graph) | DONE (34 nodes, 59 links, 0 violations) |
| NavMesh validation | DONE (`nav-validate.mjs`) |
| Unreachable-destination detection | MISSING — `findPath` silently falls back to a direct line. Graph is connected so it never fires; log it (P2) |
| Obstacle avoidance (slide) | DONE (`moveBot` axis-separated slide) |
| Stuck-agent recovery | DONE (B4: 1 s no-move → BFS replan) |
| Squad movement without blocking | DONE (B3: collision-aware separation) |

### B. Tactical bot intelligence
| Concept | Status |
|---|---|
| FSM / behaviour tree | **PARTIAL — this is the bug.** Bots have one implicit priority: combat > objective. There is no objective-priority state. The planter fights instead of advancing; defenders fight instead of defusing. |
| Decisions from time/position/health/team state | PARTIAL — plans are score-weighted (tactics.js), roles are assigned per round, but in-round decisions ignore the bomb state except through the (preempted) objective branch |
| Bomb carrier identification + escort | MISSING — nobody escorts the planter; teammates do not know who carries |
| Site selection + coordinated attacks | DONE (tactics.js plans, fake/decoy, callouts) |
| Defensive positioning | DONE (hold spots per setup) |
| Retake behaviour | **MISSING — no designated defuser.** When the bomb is planted, ALL hollow bots run at it independently and each fights instead of defusing |

### C. Bomb objective system
| Concept | Status |
|---|---|
| Pickup / drop / recovery / plant | DONE (game.js + bots.js; proven by PUSH test) |
| Valid plant zones + duration | DONE (site radius 6.5, 3.2 s, within 4.5 m) |
| Defuse interaction + duration | DONE in code (5 s / 2.5 s kit, within 1.8 m) — **never observed end-to-end in play** |
| Detonation timer + round-end | DONE (35 s fuse, `explodeBomb`) |
| Attacker / defender responses | **MISSING — the response never happens because (B) preempts it** |
| Rotate callout on plant | MISSING — `eventCall('rotate')` is defined in tactics.js but never called |

### D. Combat system
| Concept | Status |
|---|---|
| Raycast hit detection | DONE (`combat.raycast`, head/body/world parts) |
| Line-of-sight + cover awareness | DONE (`losBlocked`, `smokeBlocks`, FOV + range in `canSee`) |
| Recoil / spread / fire rate / reload | DONE (weapons.js) |
| Damage + hit registration | DONE (`damageFor`, headMult, falloff) |
| Lethality pacing (TTK vs objective time) | **UNMEASURED — the balance lever.** Rounds end by elimination in ~15–20 s; the planter needs ~14 s minimum (11 s walk + 3.2 s plant). No margin. |

### E. Quality assurance
| Concept | Status |
|---|---|
| Playwright browser tests | DONE (fps-shots.mjs; smoke-test harness) |
| Repeatable simulations | DONE (smoke harness, fixed-step, deterministic per seed modulo Math.random) |
| Screenshot inspection | DONE (manual + minimap pixel probe) |
| Console error monitoring | PARTIAL — ad hoc only; formalize into the shot script (P2) |
| Performance / frame-rate profiling | PARTIAL — sim timings only (0 slow steps); no browser FPS/draw-call measurement (no profiler available to a subagent) |

## 3. Specific techniques to implement (prioritized)

### P0 — Objective-priority FSM for the planter (the fix)
- **Problem (measured):** in `bots.js update()`, the combat branch
  (`if (b.target && !blinded && now >= b.reactAt)`) runs before the
  objective branch, and the objective branch is an `else if` — so a
  bot with ANY visible target never advances the objective. With
  vision 46 m on a 64x48 map, the planter almost always has a target.
  Rounds end by elimination in ~15–20 s; the planter needs ~14 s.
- **Technique (FSM, from the docs' behaviour-tree/FSM concept):**
  give the planter an explicit `advance` state. While carrying the
  bomb, the planter keeps moving along its path to the site and only
  stops to fight when the target is close (< 8 m) and in front —
  otherwise it shoots on the move (same `shootAt`, no strafing in
  place). The retrieve branch gets the same treatment.
- **Technique (designated defuser):** when the bomb is planted, pick
  the nearest living Hollow bot as the defuser (recompute only when
  the bomb is planted or the defuser dies). The defuser pushes the
  site and defuses even with a target (fights only if target < 8 m).
  Other Hollow bots retake/fight normally. This is the retake
  behaviour the docs describe.
- **Technique (planter repath):** the carry branch only calls
  `setPath` when `pathI >= path.length` (no repath timer). Add the
  same `repathAt` timer the retrieve branch uses, so a diverted
  planter re-plans instead of following a stale path.
- **Measurable target:** DROP-mode plant rate ≥ 1 in 3 rounds
  (bot plant), and a defuse attempt after any plant. Baseline (E7/E8):
  0 plants in DROP mode across 17 rounds.

### P0 — Measure, then tune lethality pacing (do not change blindly)
- If plants still do not happen after P0, the next lever is bot-vs-bot
  TTK: bot health 100 → 125 (bots only; player stays 100) and/or
  reactionMin/Max 0.24–0.48 → 0.35–0.65. Measure kills/round and
  round length before and after — combat must stay active (kills per
  match must not collapse), only the elimination race must slow
  enough for the planter to arrive. Change ONE lever at a time.

### P1 — Rotate callout on plant
- Call `tactics.eventCall('rotate', bot, site)` from
  `game.onBotPlant` (and `plantBomb`) so defenders hear the rotation
  order. One line; makes the retake audible in the played review.

### P2 — Screenshot QA formalization
- Add to `tools/shot/fps-shots.mjs`: `page.on('pageerror')` /
  `page.on('console')` error capture, a minimap pixel probe (light %
  must be > 50%), and a frame-brightness assertion. A bad screenshot
  must fail loudly.
- Add unreachable-goal logging to `findPath` (defensive; should never
  fire while the graph is connected).

## 4. Expected risks and compatibility issues
- **Source cap:** 155,112 / 163,840 bytes (95%). Only ~8,700 bytes of
  headroom. The P0 fix must be compact (~2–3 KB, in-place edits to
  `bots.js` + one line in `game.js`). Do NOT add a module.
- **No new dependencies.** Recast and Rapier (WASM) are incompatible
  with the dossier source cap, the no-build-step rule, and the
  no-network-refs gate (see 1.3 / 1.5). The fix improves the existing
  nav + FSM; it does not replace them.
- **Preserve:** bright palette, DMR, tactics, grenades, minimap fix
  (f1b31ea), `?shot=` screenshots, dossier build. The fix touches
  only bot decision-making, not rendering, weapons, or the map.
- **Risk: planter looks "dumb" walking past enemies.** Mitigation:
  the close-range fight exception (< 8 m) and shoot-on-the-move keep
  it believable; the smoke test measures kills/round to confirm
  combat does not collapse.
- **Risk: rounds get longer and the match timer (100 s) expires more
  often.** Acceptable — a round won by timeout after a plant attempt
  is still an objective round; a round that ends by elimination in
  15 s with no plant is the failure mode we are fixing.
- **Risk: the defuser dies on the way and no one replaces it.**
  Mitigation: recompute the designated defuser whenever the bomb is
  planted and whenever the current defuser dies (cheap: nearest
  living Hollow bot to the bomb, computed in the same place the
  objective branch already runs).

## 5. Prioritized implementation plan
1. Baseline: fresh DROP-mode runs (3 matches) on the current code —
   record plants/rounds, round length, kills/match. (Running now.)
2. Implement P0 (planter advance state + designated defuser + planter
   repath timer) in `bots.js`; one-line rotate callout in `game.js`.
3. Re-run DROP mode (3 matches) + idle mode (1 match). Compare plant
   rate, round length, kills/match, errors. Iterate only if plants
   are still < 1 in 3 rounds.
4. If still short, tune ONE lethality lever (bot health 100 → 125)
   and re-measure. Do not stack unmeasured changes.
5. Implement P2 (shot-script QA assertions + findPath logging).
6. Re-take the 4 screenshots, rebuild the dossier, update
   EXPERIMENTS.md / BUG_DATABASE.md / AI_BEHAVIOR_RESEARCH.md, commit.
7. Report the measured before/after plant and defuse rates, the
   updated rubric, and the honest answer to the final decision rule.
   Do NOT bundle, check, or submit.

---

## 7. Implementation results (same pass, measured — appended after the fix)

Implemented, in order, each measured separately in DROP mode (player dead,
bot-only; the harshest case — a 4v5):
1. Objective-priority FSM (`bots.js`): planter/defuser advance even with a
   target; combat only preempts <8 m; shoot on the move. Planter repath
   timer (1.5 s). Rotate callout on plant (`game.js`).
2. Anti-focus-fire (`perceive`): +15 m score per teammate already
   engaging an enemy.
3. Bot HP 100 → 150 (`config.js` BOT.health; player stays 100).
4. Planter/defuser/escort run speed 4.4 m/s when advancing (else walk 3.4).
5. Escort: non-carrier Vanguard bots stay within ~5 m of the carrier.
6. Aim error up (base 0.011 → 0.018, dist 0.00045 → 0.0008).
7. Direct-line shortcut in `findPath`: walk straight when the segment is
   clear of colliders (sampled every 0.5 m), instead of detouring through
   waypoints via the centre.

Measured DROP plant rate, all fixes together: **3 plants + 3 defuses in
28 rounds ≈ 11%** (baseline 0% in 26+ rounds). The loop works end-to-end
(plant → defuse observed 3×; grenades now fire, 4–6 per match when the
push reaches the site), but it is BELOW the 1-in-3 (33%) target. Hollow
still wins most DROP rounds by elimination (0:5, 2:5, 0:5, 1:5, 0:5) —
DROP is a 4v5, so it understates the real 5v5 game where the living
player carries and plants the bomb. Normal mode (player alive, stands
still): 9 rounds, 5:4, 0 plants — expected, the stationary player holds
the bomb. No errors, no slow steps in any run. Full per-lever numbers in
docs/EXPERIMENTS.md E13; bugs in docs/BUG_DATABASE.md B11–B12.

Honest assessment: the objective loop is no longer dead — it fires in
~1 in 9 bot-only rounds and the defuse path is proven — but it is not
yet reliable enough to call the game "objective-driven" in bot-only
play. The remaining gap is round pacing (elimination still beats the
~14 s plant journey most rounds), not the decision logic. Further work
would need squad-level attack timing (the whole team arriving at the
site together) or a shorter plant journey, not more lethality tuning —
six lethality/pacing levers were tried and the direct-path fix was the
one that moved the rate. This build is NOT yet top-5 caliber on the
objective criterion alone; the submitted baseline (judge 0.77) should
not be replaced by this rebuild on that evidence.
