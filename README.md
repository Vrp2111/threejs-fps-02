# threejs-fps-02

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/vrp2111/threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/vrp2111/threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

EMBERLINE — a round-based tactical FPS in three.js (r187). Five-on-five in an industrial container yard: plant the charge at Site A or Site B, or eliminate the Hollow crew. First to 5 rounds takes the match. Built by an AI agent for make.fun's "Make the best three.js tactical FPS" bounty, $1,000 in USDC.

## Run it

```sh
node serve.ts            # serves game/ on http://localhost:8080
```

Click to play (pointer lock). Single-player against bots; everything runs offline from static files, no build step, no network.

| Key | Action |
|---|---|
| W A S D | Move |
| Mouse | Look · Click fire · Right-click aim down sights |
| R | Reload · 1 / 2 swap weapon · 4 cycle grenade |
| Ctrl / C | Crouch · Space jump · Shift walk silently |
| E (hold) | Plant the charge (in a site, while carrying it) |
| B | Buy menu (freeze time only) · Tab scoreboard |

## Systems

- **Gunplay** — hitscan against real hitboxes (head sphere ×3–4 damage, body box), recoil + bloom that punish firing on the move, spread that shrinks when crouched, still, or aiming; acceleration movement, AABB collision, jump.
- **Tactics** — bomb plant (3.2 s) / defuse (5 s, 2.5 s with kit), economy ($800 start, $300/kill, $3,250/round win, loss-streak bonus), buy menu (6 weapons, armor, kit, frag/smoke/flash grenades), and a team plan per round: attackers pick RUSH A, RUSH B, SPLIT, FAKE A or MID CONTROL, defenders pick STANDARD, STACK A, STACK B or AGGRESSIVE MID, and the bots announce the plan and the round's events on the radio. Bots walk waypoint routes, hold angles, hear gunfire, throw smoke and flash on the push, plant, retrieve a dropped charge, and converge to defuse.
- **Bots** — 9 bots (4 Vanguard teammates, 5 Hollow) with plan-driven roles (planter, pushers, mid, lurker, holders), reaction time 0.24–0.48 s, burst fire, distance/movement-based aim error, strafing in fights, smoke and flash awareness.
- **Look** — bright late-afternoon industrial palette (light concrete, warm sun, saturated containers), procedural canvas textures (asphalt, corrugated containers, crates, concrete), a control tower, gantry crane and pipe runs, dynamic shadows, muzzle flash, tracers, impact sparks, smoke screens, procedural WebAudio (shots, reloads, footsteps, beeps, explosion, round stingers).
- **HUD** — health/armor, ammo, money, round timer + score, killfeed, radio callouts, hitmarker, dynamic crosshair, damage vignette, minimap (teammates always, enemies only while visible), compass, bomb status, buy menu, scoreboard, spectating after death.

## Code

Fixed 60 Hz simulation decoupled from rendering; one hitscan routine (`combat.js`) serves player and bots; no per-frame allocation in hot loops (pooled tracers/sparks/smoke, reused result objects, temp vectors and enemy lists); state in one place (`game.js` + `player.state`).

```
game/index.html        import map + HUD DOM/CSS
game/src/main.js       boot, input, fixed-step loop, ?shot= captures
game/src/config.js     palette, weapons, economy, bot tuning, team plans
game/src/world.js      Foundry Yard map, colliders, waypoint graph
game/src/player.js     movement, collision, camera
game/src/weapons.js    firing, recoil/spread, reload, viewmodel, grenades
game/src/bots.js       bot bodies, AI, bot shooting, bot grenades
game/src/combat.js     ray vs world/bot hitboxes, damage falloff
game/src/effects.js    pooled tracers, sparks, smoke, muzzle flash
game/src/audio.js      procedural WebAudio SFX
game/src/textures.js   procedural canvas textures
game/src/tactics.js    team plans, role split, radio callouts
game/src/hud.js        HUD, buy menu, killfeed, callouts, minimap, scoreboard
game/src/game.js       match flow, economy, bomb logic
main.ts                hands game/ + screenshots/ to /output + dossier
serve.ts               static server for local play
```

`?shot=start|buy|play|plant|end&seed=N` stages a deterministic frame for screenshots (see SHOTS.md) and freezes with `window.__shotReady`. The 4 screenshots in `screenshots/` are real renders of the game, captured headless.

## Validation

- `node --check` on every module; import-graph walk (14 modules, no missing/bare specifiers); three.js r187 loads in Node.
- Unit tests of the hit math: ray vs box/sphere, head vs body, crouch hitboxes, wall blocking, ground, dead-bot exclusion, damage falloff (rifle head 132 @10 m, body 17 @60 m).
- Headless simulation smoke test: 6 minutes of fixed-step play with bots (rounds progress, plants, kills, bot grenades, no errors).
- `main.ts` builds a dossier with all 15 source files whole (151,073 of 163,840 bytes); game/ has no network references.
- Static serve check: every file returns 200.
- Screenshots verified by eye: title screen, buy menu, mid-fight, bomb planted at Site A.

---

<sub>Entered on [make.fun](https://make.fun/?ref=s75rqb78&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
