# AI_BEHAVIOR_RESEARCH.md — bot AI, measured behaviour only (15 Nov 2026, WIB)

## Architecture (as built)
- `bots.js` — one `update(dt, now, phase, bomb)` per fixed step.
  Per bot: perceive → (grenade doctrine) → combat OR objective →
  separation → mesh sync. Fixed-step sim, apart from rendering.
- `tactics.js` — team plans + radio callouts. Attack plans: rushA,
  rushB, split, fakeA, mid. Defense setups: std 2-2-1, stackA, stackB,
  aggro. Score-weighted pick per round. `targetSite` implements the
  fakeA decoy (decoy A until the fake breaks at 12 s or on bomb
  handoff, then the real site B). `roleTarget` maps roles to targets
  (planter→real site, pusher→decoy during a fake else real site,
  mid→centre, lurker→other site then rotates, holderA/B→their site).
- Roles assigned in `assignRoundRoles` (order[0] = planter, then
  pushers/mids/lurker per the plan; holders per the defense setup).
  `game.update` reassigns the nearest living Vanguard bot to 'planter'
  while the bomb is dropped (see BUG_DATABASE.md B8 — can create a
  second planter).

## Perception (measured in DIAG traces)
- Bots acquire targets at 15–25 m and engage; holders sit at their
  hold spots and fire on sight (e.g. Harrow at (1,-4) targeting Iris;
  Wren holding site A at (21,-17)).
- Bots react to sight and sound: `investigate` is set on gunfire
  (bots rotate toward heard shots). Verified in traces: bots leave
  their hold spots toward gunfire, then return.
- Vision: range 46 m, FOV ~1.9 rad. Bots do not see through walls
  (line-of-sight test) — verified indirectly: bots hold fire on
  targets behind the mid wall.

## Movement (measured)
- Waypoint graph: 34 nodes, 59 links, fully connected, 0 validator
  violations (see EXPERIMENTS.md E4). BFS pathfinding; bots follow
  waypoints with `followPath` + `moveBot` (axis-separated collision,
  radius 0.36, height 1.7, crouch 1.1).
- Measured paths: planter traced (12,18)→(5,16)→(0,12)→(0,6)→(0,2)
  along [2,3,4,5,18,9]; a second bot traced (0,12)→(0,5)→(0,-2)→
  (-2,-8)→(-7,-13)→(-13,-15)→(-16,-14) toward site B.
- Speed: ~4.2 m/s. A planter needs ~9 s to walk spawn→site A (~37 m).
- Stuck handling: `followPath` replans via BFS after 1 s of no movement
  (see BUG_DATABASE.md B4). Before this fix a planter spent a whole
  round pressed against a container; after it, no planter froze for
  more than the 1 s threshold in any traced run.
- Separation: collision-aware push (see B3). Before the fix the push
  could wedge a bot into a collider permanently.

## Combat (measured)
- Bots strafe while fighting (direction flips every 0.7–1.6 s),
  shoot with distance/movement-based hit probability, reload, and
  run out of ammo (they switch to pistol — verified in the code path;
  not separately traced).
- Round resolution: bot-only rounds end by elimination in ~15–20 s of
  live play, 37–56 kills per match (7–8 rounds). Both teams kill each
  other; scores across 5 idle matches: 0:5, 5:0, 3:5, 3:5, 5:3 — the
  pre-fix 0:5 was the broken nav graph; post-fix the split is 3-2.
- Headshot damage, recoil, and spread are implemented in weapons.js
  (DMR headMult 4) — the damage numbers were verified in code, not by
  a dedicated headshot-counting experiment.

## Objective behaviour (measured)
- Bomb retrieval: a bot picks up a dropped bomb within 1.4 m (traced:
  Iris retrieved at ~17 s, Moss at ~22 s, Fable at ~24 s in DROP runs).
- Plant: the planter walks to the site and plants within 4.5 m over
  3.2 s (plantProgress accumulates; verified in code + PUSH test).
  In bot-only play the planter is usually killed or the round ends by
  elimination before planting — see KNOWLEDGE.md "Known balance
  characteristic". The plant itself is proven by the PUSH test
  (player planted, bomb exploded, Vanguard won the round by detonation).
- Defuse: Hollow bots defuse a planted bomb within range over the
  defuse time (implemented; NOT observed end-to-end in a smoke run
  because no bot plant completed in the traced runs — the player plant
  in the PUSH test was not defused before the 40 s timer expired).
  Defuse is therefore code-verified, not play-verified. Flag this
  honestly: it is the least-tested objective path.
- Grenades: smoke (16 m) / flash (12 m) doctrine, one of each per bot
  per round, 0.65 / 0.455 chance per step once in range. Measured: 6
  throws in the PUSH run (E6); 0 in idle/DROP runs (rounds end before
  a pusher closes to 16 m).

## Plans and callouts (measured)
- tactics.js unit-tested in Node: plans vary across 9 rounds (rushB,
  rushA, fakeA, split, mid); fakeA target@0='A' (decoy), target@20='B'
  (real), isFaking@5=true; announce + eventCall produce named callouts
  (kill/plant/defuse/rotate/smoke/flash lines with the bot's name).
- In smoke runs the plan name is logged at match start (e.g. "plan: set"
  in the DIAG header) and callouts appear in the HUD callout line
  (team-coloured, 4 s). The callout text itself was not captured in a
  smoke log — it renders in the DOM stub.

## Open AI questions (not yet measured)
- Defuse end-to-end (see above) — needs a bot plant to complete first,
  which needs longer rounds or a planter that survives.
- Whether the fakeA decoy actually draws defenders to the wrong site
  in play (the plan logic is unit-tested; the in-game effect on
  defender positioning was not isolated).
- Bot difficulty vs a human player: the smoke tests have a stationary
  or waypoint-walking player, never a shooting one. A human play-test
  (or the finalist review) is the only real measure.
