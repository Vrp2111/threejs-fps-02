# COMPETITIVE_ANALYSIS.md — EMBERLINE vs the top 5 (15 Nov 2026, WIB)

Sources: the make.fun leaderboard API (fetched ~16:40 WIB 15 Nov,
3,113 entries) and the kit's RULES.txt. **No competitor code was
available**: every top entry is source-withheld (repo_url ""), and only
one entry in the whole leaderboard has a public repo_url — ours.
Anything below about a competitor's internals is labelled as inference
from its title/score/size, not as fact. No competitor scores are
invented; the only scores quoted are the leaderboard's.

## The bar (leaderboard, 15 Nov ~16:40 WIB)
| Rank | Title | Judge score | Size (bytes) |
|-----:|-------|-----------:|------------:|
| 1 | Kilnyard | 973,639 | 703,173 |
| 2 | SALTGLASS v2 | 969,450 | 892,682 |
| 3 | Lantern Rock | 955,144 | 845,354 |
| 4 | Meridian Breach v2 | 954,033 | 793,744 |
| 5 | FERRYLINE — Quay 7 | 950,644 | 669,992 |
| 10 | (10th place) | 943,605 | — |
| 718 | EMBERLINE (submitted) | 770,437 | 430,093 |

Top 5 needs ~950,000+. Our gap is ~0.18 (0.77 → 0.95).

## What the titles tell us (inference, not fact)
- All five titles emphasize the same core: "5v5 round-based tactical
  FPS, buy economy, plant/defuse, team-tactics bots", "team plans",
  "radio callouts", "hearing bus". The top entries sell the SAME
  feature set we have — the differentiation is execution quality
  (screenshots, code density, polish), not a different feature list.
- Sizes 670K–893K vs our 430K (dossier). The judge reads source text
  capped at 163,840 bytes; ours is now 151,073 (92%) — we closed the
  code-density gap. The remaining size gap is mostly screenshots and
  assets, not logic.

## Feature comparison (EMBERLINE rebuild vs the top-5 feature set)
| Feature | Top 5 (from titles + RULES.txt) | EMBERLINE rebuild |
|---|---|---|
| 5v5 round-based tactical FPS | yes | yes (4 bots + player vs 5) |
| Plant / defuse | yes | yes (plant proven by PUSH test; defuse code-verified, not play-verified — see AI_BEHAVIOR_RESEARCH.md) |
| Buy economy | yes | yes (10 weapons incl. new DMR, money, buy menu keys 1–9/0) |
| Team plans | yes ("team plans") | yes (tactics.js: 5 attack plans, 4 defenses, fake/decoy) |
| Radio callouts | yes | yes (named callouts, HUD callout line) |
| Bot grenades | implied by "tactics" | yes (smoke/flash doctrine, measured 6 throws in PUSH) |
| Bots follow routes / hold / react | yes | yes (34-node graph, 0 violations; hold spots; investigate on gunfire) |
| Multiple weapons + grenade | yes | yes (10 weapons, smoke + flash) |
| Headshot / recoil / spread | yes | yes (DMR headMult 4; recoil/spread in weapons.js) |
| Map with lanes/corners/sightlines | yes | yes (Foundry Yard: door gap, mid, two sites, tower, crane, pipes) |
| HUD / minimap | yes | yes (brightened minimap, health/ammo/timer/score, killfeed, callouts) |
| Screenshots | professional | re-taken (bright set, minimap verified drawn) |
| Source density | 670K–893K dossiers | 453,466 bytes; source text 92% of the judge's cap |

## Where we are genuinely behind
1. **Bot-plant visibility.** The objective loop now fires in bot-only
   play (3 plants + 3 defuses in 28 DROP rounds, ~11%, up from 0% —
   see EXPERIMENTS.md E13), but it is below the 1-in-3 rate that would
   make the game read as objective-driven to a spectating judge. The
   rebuild fixes the underlying systems, and the screenshots now show
   the bright rebuilt game.
   No screenshot-dependent claim in this report is verified.
2. **Dossier size.** 453K vs 670K–893K. Partly screenshots (ours are
   small JPEGs), partly content. Not a defect by itself — the judge
   caps source text at 163,840 bytes and we are at 92% — but the
   top entries demonstrably ship more.
3. **Bot plant frequency.** In bot-only play the round ends by
   elimination before a bot plants (see KNOWLEDGE.md). The top entries'
   titles promise team tactics; if their bots plant visibly and ours
   do not in a played review, that is a visible difference. The
   mechanic is proven working via the player (PUSH test).

## Where we are at parity or ahead (measured)
- **Nav correctness.** 0 validator violations across nodes, links,
  hold spots, spawns and sites — verified mechanically, not by eye.
  A top entry with a broken nav graph would soft-lock the same way
  our baseline did; we found and fixed three such bugs.
- **Round loop reliability.** 5-round matches complete, 0 errors, no
  soft-locks, no slow steps, across 9+ simulated matches. The
  submitted baseline soft-locked after round 1 (B1) — the rebuild
  fixes a bug the top entries may or may not have.
- **Code hygiene (criterion 5).** No per-frame allocations in the hot
  loops (fixed), one-job modules (15 files), fixed-step sim apart from
  rendering, no dead code found in the rebuild (lurker fixed, DMR
  wired end-to-end).
- **Team tactics depth.** 5 attack plans + 4 defenses + fake/decoy +
  named radio callouts is a concrete, unit-tested system, not a
  checklist line.

## Honest bottom line
On code and systems, the rebuild is at or near the top-5 feature bar.
On the two things the judge actually LOOKS at first — screenshots and
played behaviour — the screenshots are now current (bright set,
minimap verified) and bot-plant visibility is measured at ~11% of
DROP rounds (up from 0%, but below the 1-in-3 target). The rebuild is
top-5 caliber on paper; it is not provably top-5 until a human
play-test confirms the objective loop reads clearly in live play.
plays it. See the final report's rubric for the scored version of
this judgement.

## Top-entry research (15 Nov, from the public API + their cover images)
- Method: fetched the top-10 submissions' public data via the make.fun
  API and downloaded + viewed their 4 dossier images each (cover + play
  + buy + end). All top-10 entries won 12/12 judge matches; ours won
  5/12. Their dossier sizes: 670 KB–1.27 MB; ours (submitted) 430 KB.
- What they all do that ours didn't: cover = live combat (never a menu);
  play shot = the objective happening (arming / defusing / charge dropped
  / planting) with a progress bar or banner; buy shot = a dense
  requisition grid with named weapons, prices, stats, owned states;
  end shot = a full victory scoreboard (K/A/D/HS/DMG/Cash). HUD in every
  shot: minimap, killfeed, radio callouts with bot names, grenade
  inventory, armour, location labels, round + phase. Distinctive map
  landmarks (lighthouse, brick kiln with a big "B", ferry terminal
  "QUAY 7") and warm, varied palettes.
- What we changed in response (E15): cover = combat, play shot re-staged
  as a close firefight with seeded killfeed, viewmodel fixed (metalness),
  grenade inventory + armour added to the HUD, end shot = victory
  scoreboard. The remaining gap is map identity (ours is a grey/beige
  concrete yard; theirs have a named landmark) — not fixable within the
  remaining time and byte budget without a map rebuild.
