# Screenshots — capture instructions for the parent agent

The entry needs 4 real renders of its own code in `screenshots/` (gate:
3–4 images, each ≤ 256 KiB, long side ≤ 1280, short side ≥ 480 px).
The game stages each shot deterministically with `?shot=` — no pointer
lock, no input needed; the page renders, freezes, and sets
`window.__shotReady = true`.

## Steps

1. Serve the game:
   ```
   cd ~/workspace/makefun/entries/threejs-fps-02
   node serve.ts --port 8081
   ```
2. In the live browser (desktop Chrome, 1280×720 viewport), open each URL,
   wait until `window.__shotReady === true`, then take a JPEG screenshot
   (quality ~85) into `screenshots/`:
   | file | URL |
   |---|---|
   | `1-start.jpg` | http://localhost:8081/index.html?shot=start&seed=7 |
   | `2-buy.jpg` | http://localhost:8081/index.html?shot=buy&seed=7 |
   | `3-play.jpg` | http://localhost:8081/index.html?shot=play&seed=7 |
   | `4-plant.jpg` | http://localhost:8081/index.html?shot=plant&seed=7 |
3. Check each file: ≤ 256 KiB, 1280×720, and actually shows the game
   (title screen / buy menu / mid-fight with tracer + hitmarker / bomb
   planted at Site A with the banner). If a shot is black or the HUD is
   wrong, tell the builder subagent — do not edit the image.
4. Rebuild the dossier and confirm it still writes:
   ```
   rm -rf out && mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
   ```
   (buildDossier refuses when screenshots/ is empty, so this also proves
   the shots are present.)

## Why a live browser is needed

The VM's Chromium (`/opt/meta-chromium/chrome`) refuses to start outside
the managed browser service ("Hatch WebGL domain policy is required for
browser startup"), and a scripted puppeteer Chrome is not available to a
subagent. The game was validated without a browser instead: `node --check`
on every module, import-graph walk, three.js r187 loading in Node,
unit tests of the hitscan math (ray vs box/sphere/head/body, wall
blocking, falloff), a full dossier build with placeholder images (all 14
source files fit whole at 128,162 of 163,840 bytes), and a static serve
check (every file 200, no network references). A real playtest in the
browser is still untested — worth one quick run-through (click Play,
move, shoot, buy with B, plant with E) before submitting.
