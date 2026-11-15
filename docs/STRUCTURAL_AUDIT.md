# STRUCTURAL AUDIT — FPS-02 (EMBERLINE: Foundry Yard)

Date: 2026-11-15 ~19:30 WIB. Author: audit subagent (session 25b7500d).
Scope: complete codebase audit + competitive benchmarking + E20 experiment.
Baseline: local git HEAD 9f79655 (E19 docs-only; code identical to E17 d77d51a).
Dossier text 163,799 / 163,840 bytes (41 bytes headroom). Rubric 88/100.
Submitted baseline judge 0.77 (rank 938 / 3,655, 5 wins / 0 draws / 7 losses / 12 matches).

## 1. Measured round timeline (DROP mode, 4 Vanguard bots vs 5 Hollow, player dead)

Instrumented trace driver: `/tmp/audit-trace.mjs` + `/tmp/run-audit.mjs` on top of
`~/workspace/makefun/smoke-test/fps-smoke.mjs`. Logs per round: live-start step,
each bot death (step, victim, killer), bomb pickup/plant/defuse (step), carrier
position + alive counts every 1 s, all-bot positions + targets every 2 s.
Runs are unseeded (Math.random), so each run differs.

- Freeze 12 s → live (100 s max) → roundEnd 4.5 s.
- First bot death at **live+3.3 to +5.5 s**.
- Rounds end by elimination at **live+7 to +19 s (median ~10 s)**.
- Carrier picks up the bomb at **live+1 to +4 s**.
- **Carrier journey: ~30 m at effective ~2 m/s = ~13–15 s, + 3.2 s plant channel
  = ~16–18 s from pickup to plant.** The carrier's run speed is 4.4 m/s, but
  its effective speed is ~2 m/s because combat preempts movement whenever a
  defender is within 8 m (`advancing` requires targetDist > 8) — the carrier
  stops to strafe/fight instead of running past.
- **Timing mismatch (the core structural finding): the carrier needs ~16–18 s
  but only has ~5–10 s before the round ends by elimination. Deficit ~8 s.**

### DROP trace totals (control, code at HEAD 9f79655)
- audit-drop1/2/3: 21 rounds, **0 plants**.
- audit-drop4/5/6: 21 rounds, **2 plants (~10%)** — both times the carrier
  reached the site (dSite 0.5) and planted; both plants were followed by a
  defuse in the same match.
- Consistent with the E13–E19 band of **11–16%** (E16 baseline 3/19 ≈ 16%,
  E19 baseline 2/17 ≈ 12%).

### When Vanguard wins the fight, it still does not plant
DIAG run, round 1, site B: Vanguard killed 3 Hollow holders in ~2 s
(anti-focus-fire spreads targets, but the team still deletes defenders fast
when it has clear shots), then won by elimination at live+14 s while the
carrier was still **26 m from the site**. The team kills the defenders
FASTER than the carrier can walk to the site, so the round ends before the
plant even when Vanguard wins the fight.

### Carrier freeze (a second, distinct failure mode, observed twice)
- audit-drop1 round 1: Moss the carrier sat at (12,-9.1), dSite=13, for ~70 s;
  the round timed out at 100 s (score 0:1, bomb carried).
- audit-drop2 round 2: Rook the carrier sat at (-16.5,-14), dSite=7.5 (just
  3 m short of the 4.5 m plant radius), for 80+ s (t=60 s → t=140 s); the
  round timed out at t=143.1 s. The only Hollow alive (Sable) sat at its hold
  spot (17,-12), 33 m away, never engaging or rotating.
- The freeze cause is NOT yet pinned down. The carrier in both cases had no
  target (tgt=-), role=planter, bomb=carried, alive. Candidates: a stale or
  self-path from the stuck-replan (`followPath` replans to
  `b.targetX || b.pos.x` when stuckSteps > 20, and `targetX`/`targetZ` are
  never assigned anywhere in bots.js, so the replan is a path to the bot's
  own position — harmless in the plant branch because the next step replans
  to the site, but unproven under all branch combinations); or the combat
  branch strafing the carrier into a collider. **The freeze is intermittent
  (~2 freezes in 41 rounds, ~5%) and did NOT recur in the 26 E20 rounds or
  the 21 drop4/5/6 rounds.** It is a real bug but not the dominant bottleneck.

### Double-planter bug (B8, known from AI_BEHAVIOR_RESEARCH.md, observed live)
`game.js` reassigns the nearest living Vanguard bot to role 'planter' every
step while the bomb is dropped, so TWO bots can hold role 'planter' at once
(e.g. Fable + Moss in the DIAG run; Iris + Moss in audit-drop2 round 2). The
second planter follows stale retrieve paths. It does not directly block the
carrier, but it wastes a teammate's movement on a redundant role.

### Holders never investigate / rotate
In bots.js the holderA/holderB branch runs BEFORE the `investigate` branch,
so site holders never leave their hold spots toward gunfire — only the single
'mid' defender rotates. A holder on the far site stays put for the whole
round even while its team is wiped at the other site. (This currently HELPS
the attacker — fewer defenders converge on the carrier — so it is not a
plant-rate blocker, but it is a bot-intelligence weakness the judge can see.)

### Escort yo-yo
While the bomb is dropped, non-carrier Vanguard bots push to the site
(roleTarget); when the carrier picks it up they turn around and retreat to
escort, then push again — the team advances, retreats, and re-advances,
exposed in the open yard and the door gap. The escort does not LEAD the
carrier (clearing the lane ahead); it follows and yo-yos.

### Single choke point
The mid wall (z=0) has exactly one ground-level crossing — the double-door
gap x −3..3 — and the only waypoint link across it is [4,5] (node 4 at (0,2)
→ node 5 at (0,-8)). Every bot crossing north–south funnels through this
6 m gap. The direct-line shortcut only helps after crossing mid (the
diagonal spawn→site crosses the wall and is blocked). The crate at (-18,-14)
also sits directly on the direct line from the west approach to site B,
forcing a BFS detour for carriers approaching B from the west.

## 2. Root causes, ranked by impact

### RC1 — Timing mismatch: carrier journey (~16–18 s) exceeds the round's median elimination time (~10 s). HIGHEST IMPACT.
Evidence: §1. The carrier needs pickup (live+1–4 s) + ~13–15 s travel +
3.2 s plant. Rounds end by elimination at live+7–19 s, median ~10 s.
The deficit is ~8 s. The carrier arrives alone (team wiped) or not at all.
**This is the single highest-impact bottleneck.** It is structural, not a
bug: the 5v5 DROP round is decided by elimination faster than the objective
can be completed. Every lever that addressed only one side of it failed
(§4).

### RC2 — The carrier must FIGHT its way to the site; running past defenders gets it killed. (Proven by E20.)
Evidence: E20 (carrier combat-preempt 8 m → 3 m) produced **0 plants in
26 rounds (0%) vs control 2/21 (9.5%)**. The carrier advanced but died to
defender fire without killing the defenders in its path (E20 match 1 round
2: Iris the carrier advanced (3,20) → (2,9) in 6 s, then died at dSite=35
while three teammates were already dead around it). The 8 m stop-to-fight
radius is PROTECTIVE, not a delay — it lets the carrier clear the threats
in its path. **The carrier cannot be made faster by removing its fights.**

### RC3 — Team elimination outpaces carrier arrival in both directions.
Evidence: when Vanguard wins the fight it wipes the defenders in ~10 s and
the round ends before the carrier arrives (DIAG run 1, live+14 s, carrier
26 m away). When Hollow wins, the carrier's escort is wiped first and the
carrier arrives alone vs 3–5 defenders (E18: carrier lived ~20 s with 50%
DR but the team wiped first, plant rate 5%). The plant needs the carrier
AND a live team at the site at the same time, and in 4v5 DROP the team is
gone by the time the carrier arrives (E19 conclusion, confirmed by traces).

### RC4 — Carrier freeze (intermittent, ~5% of rounds).
Evidence: §1. Two observed freezes (70 s and 80+ s), both ending in a 100 s
timeout with the bomb carried. Not the dominant bottleneck (5% vs the ~90%
timing-mismatch rate), but a real bug that wastes whole rounds. Cause not
yet pinned; the stuck-replan self-path (`targetX`/`targetZ` never assigned)
is the prime suspect.

### RC5 — Escort yo-yo + no lane-clearing lead.
Evidence: §1. The escort follows the carrier and yo-yos instead of leading
5–8 m ahead on the path to the site, clearing defenders. The carrier
therefore meets defenders it must stop and fight, instead of walking a
cleared lane. This is the most promising UNTRIED structural lever
(see §5), but it needs byte budget the dossier does not have (41 bytes
headroom) and careful testing.

### RC6 — Double-planter (B8) wastes a teammate.
Evidence: §1. Two planters at once; the second follows stale retrieve
paths. Minor impact on the plant rate, but a visible coordination bug.

### RC7 — Single mid-wall choke (door gap x −3..3, one nav link [4,5]).
Evidence: §1. Every north–south crossing funnels through 6 m. Combined
with the crate at (-18,-14) on the site-B approach, the map forces the
carrier through predictable, defensible ground. Fixing it needs a map
change (a second crossing or removing the mid wall), which alters the map
identity and is out of scope for this pass.

### RC8 — Holders never rotate / investigate.
Evidence: §1. A bot-intelligence weakness (defenders are static), but it
currently helps the attacker, so it is not a plant-rate blocker. It is a
judge-visible realism gap.

## 3. Competitive benchmarking (public material only)

Leaderboard snapshot 2026-11-15 ~19:12 WIB (`/tmp/lb-fps02-now.json`,
3,655 entries). Our entry: rank 938, judge 770437 (0.77), 430,093 bytes.
All top-12 entries won 12/12 judge matches; ours won 5/12. Competitor
source is NOT public (all top entries are source-withheld); only their
public descriptions + 4 dossier images were examined (downloaded to
`/tmp/comp/`). No private source was accessed or claimed.

| Entry | Rank | Judge | Bytes | What it does better (evidence from public images) |
|---|---|---|---|---|
| Kilnyard (tidy-meteor-25) | 1 | 973639 (0.97) | 703,173 | Warm red/orange dusk palette with fog; big "KILN HALL / SITE A" landmark sign; circular minimap; radio "Contact at Kiln Hall, rotating"; smoke cloud visible in cover; viewmodel shotgun with green grip. |
| Meridian Breach v2 (xloudmax-lab) | 4 | 954033 (0.95) | 793,744 | Cover is live combat vs 3 visible enemies with tracers + muzzle flash + starburst impact; radio callouts WITH ROLES ("[RADIO] Riza (Support): 3 Breachers spotted A LONG ARCH — Core carrier on site!"); killfeed with weapon names + HS ("Warden Kael SOLACE HS Breacher Ash"); dense buy menu ("MERIDIAN ARMORY & 5V5 SQUAD REQUISITION": squad roster with roles + money + loadouts, 3 categories, 10 items, prices, economy info, hotkeys); minimap with site labels. |
| BREACH // MERIDIAN (scavenger-osan) | 18 | 938713 (0.94) | 854,810 | Same family as Meridian Breach v2 (0.94). |
| Kestrel Yard (bitdao) | 19 | 938713 (0.94) | 938,713 | Cover is a spawn/overview down a long lane with a "FREIGHT HALL" sign; FULL 5v5 TEAM ROSTER panel with roles (ENTRY / TRADE / ANCHOR / SUPPORT / SENTRY / ROAM); CONTRACTS panel (objectives, XP, season); warm orange dusk; minimap with "A · DOCK B · MAINTENANCE" + objective line. Note: the user's stated 87.1% for Kestrel Yard does NOT match the observed 938713 (0.94); a second "Kestrel Yard" (ataedi) sits at rank 77, judge 902398 (0.90). |
| Halcyon Array v2 (masderuk) | 74 | 905722 (0.91) | 670,198 | OPEN map (no mid-wall funnel) with a GIANT radar dish landmark; warm dusk sky + green hills; top bar shows objective state ("Ondo HAS THE CHARGE"); radio callouts with location names ("Vex contact, Dish Approach", "Tessa contact, Site A — Main Dish"); killfeed with weapon + HS. |
| COPPERLINE (daring-orca) | 170 | 865954 (0.87) | 539,055 | Dark dusk/night map; HUD much sparser than the top entries (no roster, no radio panel, no contracts); controls hint bar at the bottom. The thinnest presentation of the five — and the lowest-ranked — confirming that HUD density + warm palette + landmarks correlate with judge score. |

### What the top entries do better than FPS-02 (gaps, ranked)
1. **Warm, saturated dusk palettes** (red/orange skies, fog, strong atmosphere). Ours is bright late-afternoon (pale sky, light concrete) — less dramatic. Cheap in bytes (colour constants), but a big visual change needing screenshot verification.
2. **Named landmarks with big signs** (KILN HALL, FREIGHT HALL, giant radar dish). Ours has a gold 'F' letter (~135 bytes, visible in one shot) — weak by comparison.
3. **Team roster with roles** (Kestrel Yard) / squad requisition (Meridian). Ours has no roster panel. Needs ~1 KB+ of HUD code — NOT affordable in the 41-byte headroom without freeing bytes by shortening comments.
4. **Radio callouts with roles + specific locations** (Meridian, Halcyon). Ours has callouts with names but no roles and less specific locations. Cheap-ish (callout strings in tactics.js) but every byte hides a tactics.js line from the judge-visible text.
5. **Killfeed with weapon names + HS marker.** Ours has a killfeed; verify it shows weapon names.
6. **Dense buy menu** (Meridian's requisition grid). Ours is simpler. Needs significant HUD code.
7. **Open maps without a single funnel** (Halcyon). Ours has the mid-wall single door gap (RC7).
8. **Objective state in the top bar** ("Ondo HAS THE CHARGE", "CORE ARMED"). Ours shows bomb status — verify it is as prominent.
9. **Dossier size**: theirs 670 KB–1.27 MB; ours 430 KB (submitted) / ~578 KB (rebuilt). Larger dossiers = more/bigger screenshots.

## 4. The thirteen failed levers (do not repeat without a clear NEW hypothesis)
1. Objective-priority FSM + anti-focus-fire + HP 100→150 + run 4.4 m/s + escort + aim error (f1a4c4d) — **PROVEN, preserved**. Plant rate 0% → 11%.
2. Squad regroup (E14) — worse, reverted.
3. Planter smoke (E14) — worse, reverted.
4. Spawn repositioning z=10 and z=4 (E16) — worse, reverted.
5. Carrier 50% damage reduction (E18) — 5% vs 16% baseline, reverted.
6. Bot-vs-bot damage ×0.7 (E19) — 9% vs 12% baseline, reverted.
7. Carrier combat-preempt 8 m → 3 m (E20, this pass) — **0% (0/26) vs 9.5% (2/21) control, reverted**. Proves RC2: the carrier must fight its way through; running past gets it killed.
Plus PROVEN, preserved: direct-path (the ONLY lever that ever moved the plant rate significantly), E15 presentation (cover = live combat, viewmodel metalness fix, killfeed, grenade inventory, victory scoreboard, dense HUD), E17 dossier completeness, nav-graph fix (49 violations → 0), RoundEnd soft-lock fix, planter-wedge fix, minimap fix (B10).

## 5. Candidate interventions for a follow-up pass (not attempted this pass)
- **E21 (highest priority): escort leads the carrier.** The escort stays 5–8 m AHEAD of the carrier on the path to the site, engaging and clearing defenders, instead of yo-yoing between the site and the carrier. Hypothesis: the carrier then walks a cleared lane and arrives with the escort alive. Needs byte budget (free bytes by shortening comments only) and the same A/B protocol. Risk: the escort may die ahead and the carrier still arrives alone.
- **E22: fix the carrier freeze.** Pin the cause with the CDBG (carrier path/pathI/targetX/targetZ/stuckSteps when frozen), then fix the stuck-replan self-path (e.g. replan to the site, not to `targetX || pos`). Small byte cost, but only affects ~5% of rounds.
- **E23: fix double-planter (B8).** Guard the role reassignment so only one planter exists at a time. Small byte cost; minor plant-rate impact but a visible coordination fix.
- **E24: warm dusk palette.** Change the sky/fog/light colour constants toward the warm red/orange dusk the top entries use. Cheap in bytes; verify with screenshots; do NOT sacrifice the bright readability E15 established.
- **E25: roles in radio callouts.** Append the bot's role to callout strings (as Meridian does). Costs bytes in tactics.js (each byte hides a tactics.js line from the judge-visible text) — only after freeing bytes elsewhere.
- **Do NOT retry:** any of the 13 failed levers without a genuinely new hypothesis; a second mid-wall crossing (map-identity change, out of scope for the byte budget); slowing eliminations globally (E19); carrier damage reduction (E18).

## 6. Conclusion — best achievable performance (measured, not projected)
- **Plant rate is structurally capped at ~10–16% in this architecture** (DROP, 4v5, mid-wall funnel, ~30 m journey, ~10 s median round). Thirteen levers tried; only direct-path ever moved it significantly. E20 (the most promising new hypothesis this pass) made it WORSE (0%).
- **The single highest-impact bottleneck is RC1: the timing mismatch** — the carrier's ~16–18 s journey exceeds the round's ~10 s median elimination time, and the two are coupled (the carrier must fight to survive, which slows it; the team must fight to escort, which ends the round).
- **Rubric remains 88/100** (Visual 19, Gameplay 16, Bot 16, Map 14, UI 10, Stability 10, Originality 3). No measured improvement this pass. The judge score is unknowable without resubmitting; the submitted baseline is 0.77.
- The most promising remaining lever is E21 (escort leads the carrier), followed by the visual gaps in §3 (warm palette, roles in callouts). Both need byte budget freed by shortening comments and the same controlled A/B protocol.
- No code change from this pass is kept (E20 reverted; git status clean at 9f79655). Dossier unchanged at 163,799 bytes.
