# PERFORMANCE_LOG.md — measured performance only (15 Nov 2026, WIB)

Harness: `~/workspace/makefun/smoke-test/` (Node, no WebGLRenderer — so
these are SIMULATION timings, not render timings. Render performance in
a real browser was not measured by a subagent; the parent should check
frame pacing in the live browser when re-taking screenshots.)

## Simulation step cost
- Smoke runs: 21,600 fixed steps (6 min game time) complete in ~1–2 s
  of wall time in Node (the harness runs as fast as possible, not
  real-time). No slow steps reported in any run (`0 slow steps` in the
  report) — the report flags any step taking >5 ms.
- 0 errors in every run after the roundEnd fix (E2, E5, E6, E7, E8, E9).

## Per-frame allocations removed (criterion 5 — judge reads the code)
- main.js: `bots.bots.filter(...)` twice per frame → module scratch
  lists (`_hollowAlive`, `_vanguardAlive`, `_visibleEnemies`) refreshed
  once per step; `shoot()` and the minimap reuse them.
- bots.js: `bots.filter(...)` twice + `vanguardAlive.concat([player])`
  → module scratch lists (`_hollowAlive`, `_vanguardAlive`,
  `_enemiesHollow`, `_enemiesVanguard`).
- effects.js: `new THREE.Color` per spark → module `tmpColor` reused.
- These are code-level fixes verified by reading the diff, not by a
  profiler (no browser profiler was available to a subagent).

## Sizes (measured 15 Nov)
- game/: 2,284,649 bytes, 21 entries (was ~2.29 MB in the submitted
  version; the rebuild is slightly smaller in raw bytes but denser in
  source text — see below).
- Source text read by the judge: 151,073 / 163,840 bytes (92%).
- Dossier: 453,466 bytes (was 430,093). Cap 1.5 MiB.
- Screenshots: 4x 1280x720, 47,624–62,308 bytes each (cap 262,144).
  NOTE: these are the OLD dark screenshots; they must be re-taken.
- Total entry (game + screenshots + dossier): ~2.96 MB.
- Top-5 entries are 669,992–892,682 bytes (their dossier sizes, from
  the leaderboard) — ours is 453,466, i.e. smaller. The gap is content
  density, not file count.

## What was NOT measured
- Real-browser FPS, draw calls, GPU time, or memory. The smoke test
  has no renderer. If the parent re-takes screenshots in the live
  browser, record `renderer.info` (calls/triangles) and a rough FPS
  reading here before submitting.
- The `performance` timings in the smoke report (steps/sec) are Node
  throughput, not frame pacing.
