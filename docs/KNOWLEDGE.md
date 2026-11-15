# KNOWLEDGE.md — EMBERLINE (threejs-fps-02 rebuild)

Findings recorded here are measured, not invented. Dates in WIB (Asia/Jakarta).
Entry: `~/workspace/makefun/entries/threejs-fps-02/`, local git baseline
`db1745b` (submitted 15 Nov 13:15 WIB), rebuild commit `29709f3`.

## The competition
- threejs-fps-02, $1,000, 10 places ($400/$200/$120), closes 17 Nov 04:30 WIB.
- Deliverable: a Three.js FPS game in `game/` (≤993 files/dirs, ≤48 MiB),
  3–4 screenshots (≤256 KiB each, long side ≤1280, short side ≥480),
  `dossier.json` byte-for-byte what `buildDossier` writes (≤1.5 MiB).
- three.js 0.187.0 `three.module.min.js` + `three.core.min.js` must be
  byte-for-byte identical to the kit's (verified sha256
  `ef510bae547ab378` / `613e370f76638fde`); import map `"three"` → relative
  path inside `game/`; no network/absolute references anywhere.
- Source text read by the judge is capped at 163,840 bytes. Ours is
  151,073 (92% full) — near the cap; more code must displace code, not
  just add to it.

## The judge (from the kit's RULES.txt, lines 31–51)
- An AI judge (superbot, reasoning effort high) reads two dossiers at a
  time (screenshots, then source text capped at 163,840 bytes) and picks
  one with margin 1–5. Entries rank by Bradley-Terry win rate.
- Final heat: 6 Swiss rounds + playoff of top 12. **The top 5 are held
  up to 60 minutes for the make.fun team's finalist review, which PLAYS
  each entry by serving `game/` in desktop Chrome** — a top-5 entry must
  genuinely play, not just read well.
- Criteria, most important first:
  1. Complete game — FPS view, mouse look, keyboard movement, weapon
     fires/reloads/runs out of ammo, opponents move/see/shoot back,
     rounds end and restart, HUD with health/ammo/timer/score;
     screenshots and code must agree.
  2. Gunplay/movement — headshot damage, recoil/spread punishing fire
     on the move, acceleration, crouching, map collision.
  3. Tactics — bomb plant/defuse, money + buy menu, >1 weapon +
     ≥1 grenade, bots follow routes, hold positions, react to sight/sound.
  4. Map/look — original map with lanes/corners/sightlines,
     lighting/materials in a chosen palette, scene reads at a glance.
  5. Code — one-job modules, fixed-step sim apart from rendering, no new
     objects per frame in hot loops, state in one place, no duplicated or
     dead code.
- "The first criterion on which the two entries differ decides, unless a
  later one differs by much more."

## The leaderboard (fetched ~16:40 WIB 15 Nov, 3,113 entries)
- Top 5: #1 Kilnyard 973,639 (703,173 bytes), #2 SALTGLASS v2 969,450
  (892,682), #3 Lantern Rock 955,144 (845,354), #4 Meridian Breach v2
  954,033 (793,744), #5 FERRYLINE — Quay 7 950,644 (669,992).
  10th place 943,605. Top 5 needs roughly 950,000+ (0.95).
- **All top entries are source-withheld** (repo_url "" in the
  leaderboard). Only ONE entry in the whole leaderboard has a public
  repo_url, and it is ours (rank 733). Competitor code CANNOT be studied;
  learn from titles, the kit's RULES.txt, and our own code.
- Top-entry titles emphasize "5v5 round-based tactical FPS, buy economy,
  plant/defuse, team-tactics bots", "team plans", "radio callouts",
  "hearing bus".
- Our submitted EMBERLINE: rank 718/3072, judge 770,437
  (range 731,611–809,264). Gap to top 5 is ~0.18 — large.

## Why EMBERLINE scored 0.77 (diagnosis, 15 Nov)
- Game logic was complete (criteria 1–3 present), but:
  - Screenshots dark/murky (dusk palette, fog 26/85, dark materials).
  - Weapon viewmodel a black blob; minimap an empty dark box
    (background rgba(32,36,44) + dark-grey walls).
  - Play shot had the "ROUND 1" banner across the centre; plant shot
    faced a black wall.
  - Source only ~128,162 bytes of the 163,840 cap (~3,019 lines) —
    top entries have far more code.
  - Per-frame allocations in hot loops (main.js `bots.bots.filter(...)`
    twice per frame; bots.js `bots.filter(...)` twice +
    `vanguardAlive.concat([player])`; effects.js `new THREE.Color`
    per spark) — criterion 5 penalizes this.

## The rebuild (commit 29709f3)
- Bright late-afternoon palette (canvas 0x9db4c8, fog 0xa8bed0, sun
  0xffe8c0, sky 0xbdd3e8); brighter ground/crate/wall textures.
- New weapon DMR "Marksman-7" ($3,400, damage 62, headMult 4, range 75,
  semi-auto, zoom 2.2).
- New module `tactics.js` (~6,818 bytes): team plans (attack rushA,
  rushB, split, fakeA, mid; defense std 2-2-1, stackA, stackB, aggro),
  radio callouts, fake/decoy site logic.
- Bots: per-bot grenades + smoke/flash doctrine; lurker role fixed
  (was dead code — lurkers previously stood still); collision-aware
  separation; stuck detection + BFS replan in followPath.
- World: control tower moved to open the door gap; nav graph 0 violations.
- game.js: roundEnd soft-lock fixed (also present in the submitted
  baseline); player bomb pickup.
- Dossier 453,466 bytes (was 430,093); source text 151,073/163,840 (92%).

## Known balance characteristic (measured, not a bug)
- Bot-only rounds resolve by elimination in ~15–20 s of live play
  (Monte Carlo: 7–8 rounds/match, 37–56 kills/match). The planter needs
  ~17 s (retrieve ~5 s + walk ~9 s + plant 3.2 s), so in bot-only play
  the round usually ends by elimination before a bot plants.
- The plant/defuse/grenade systems are proven working, not dead code:
  PUSH test (player walks the graph and plants) produced a plant +
  explosion and 6 grenade throws. In real play the player drives the
  objective; the bots retrieve the bomb and advance to the site (traced).
- Do not "fix" this by making bots weaker without measuring the effect
  on combat feel — it is a balance trade-off, not a broken system.

## Screenshots (re-taken — current bright set)
- `screenshots/` holds the NEW bright set, re-taken 15 Nov (parent
  17:12 WIB, minimap fix; re-taken again after the objective-loop fix):
  1-start 54,876 B; 2-buy 68,527 B; 3-play 87,110 B; 4-plant 85,450 B —
  all 1280x720, each ≤256 KiB. Minimap verified drawn (pixel probe:
  lightPct 88.1%, darkPct 0.3%). Dossier rebuilt (561,564 bytes).
