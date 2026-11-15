# PLAN_E14 — Squad regroup on a dropped bomb (autonomous pass, 15 Nov 2026)

## Measured baseline (fresh, this pass)
- DROP mode (bot-only, 4v5, player dead), 3 matches: **3 plants in 22 rounds ≈ 14%**
  (run 1: 1 plant / 7 rounds, 2:5; run 2: 0 / 7, 2:5; run 3: 2 / 8, 5:3).
  Consistent with E13 (11%, 3/28). Target 33% NOT met. 0 errors.
- DIAG trace (round 1): player drops bomb at t=12 s (live start); planter
  Fable picks it up at t≈15.8 s, dies at t≈20.5 s (4.8 s later); round ends
  by elimination at t≈22 s. Live phase lasts only ~10 s; the planter needs
  ~14 s (journey + 3.2 s plant). The plant journey EXCEEDS the round's
  live time, so even a perfect planter cannot plant in time.

## Root cause (verified by trace, not assumed)
The retrieve phase splits the team. When the bomb is DROPPED, only the
planter goes to retrieve it; the pushers/mids/lurker go to the site or
their lanes independently (roleTarget). The planter retrieves alone, then
travels alone to the site while the pushers are already at the site (or
dead). The escort only activates once the bomb is CARRIED — by then the
planter has ~5 s of life left and the escort is spread out. The team
never attacks as a unit: the planter arrives alone, the pushers arrive
separately, and Hollow defenders (2 holders + mid) focus them one by one.

## Change (ONE major variable)
**Squad regroup on a dropped bomb.** When the bomb is DROPPED, every
living Vanguard non-planter bot moves toward the bomb location and holds
~8 m off it (close enough to escort the instant it is picked up, far
enough not to stack on the planter). This replaces the role-target push
(pusher/mid/lurker to site/lanes) ONLY while the bomb is dropped; once
the bomb is carried, the existing escort logic takes over and the team
pushes to the site together. The planter's retrieve branch is unchanged.
Defenders are untouched. No lethality, speed, HP, or plant-time change.

## Hypothesis
The planter dies because it retrieves and travels alone. If the team is
already grouped at the bomb when it is picked up, the escort is immediate
(no convergence delay), the site push is a 4-bot unit instead of a lone
planter, and the defenders face five targets at the site instead of one.
Expected: plant rate rises from ~14% toward the 33% target; kills/round
and round length stay in the same band (the team still fights, just
together); no new errors.

## Metric it should move
DROP-mode plant rate (plants / rounds) across 3 matches, plus plants and
defuses per match. Secondary: round length, kills/match, Vanguard win
rate, errors (must stay 0).

## Risk
- The team bunches at the bomb and a Hollow push wipes them. Mitigation:
  Hollow is defending (holders at sites); they do not push south. The
  regroup holds ~8 m off the bomb, not on top of it, so the team is not
  a single grenade target.
- The regroup delays the site push (the team waits at the bomb instead
  of pre-positioning at the site). Mitigation: the regroup only lasts
  until the bomb is picked up (a few seconds); the planter is the one
  who retrieves, so the wait is bounded by the planter's travel time.
- Source cap: the change is ~12 lines in bots.js. Headroom is ~15 KB.
  No new dependency, no build step, no network ref.

## Implementation
In `bots.js`, in the `else if (phase === 'live')` objective block, add a
`regrouping` branch BEFORE the role-target branch (line ~610):
Vanguard, not the planter, bomb.state === 'dropped' → move toward the
bomb, stop at ~8 m (followPath to a point 8 m from the bomb, re-path
every 1.5 s). The planter keeps its existing retrieve branch. The
`advancing` flag already covers the escort once the bomb is carried;
extend it so a regrouping bot also counts as advancing (runs at 4.4 m/s
to the regroup point, shoots on the move).

## Results (measured, this pass)
- **Regroup (squad gather on dropped bomb):** 1 plant in 21 DROP rounds
  ≈ 5% (runs: 1 plant+1 defuse / 7 rounds, 2:4; 0 / 8, 4:3; 0 / 6,
  1:5). WORSE than the 14% baseline. The team bunched at the bomb
  (Vanguard spawn, south), delayed the site push, and got wiped — run 3
  was a 1:5 blowout. REVERTED (git checkout bots.js).
- **Planter smoke (planter throws smoke at the site entry while
  carrying):** 0 plants in 18 DROP rounds = 0% (runs: 0/6, 0/6, 0/6).
  WORSE than baseline. Grenade throws stayed low (2, 0, 0) — the smoke
  rarely fired, and when it did it did not save the planter. Possible
  cause: the smoke blocks the escort's vision as well as the defenders',
  or the planter still dies before reaching smoke range. REVERTED.
- **Conclusion:** the DROP-mode (4v5) plant rate is capped at ~11–14%
  with the current balance. Eight levers tried across two passes (FSM,
  anti-focus-fire, HP 150, run speed, escort, aim error, direct path,
  regroup, planter smoke); only the direct-path fix moved it
  significantly (0% → 11–14%). The regroup and planter-smoke levers
  moved it DOWN. The 33% target is not achievable in DROP mode without
  fundamentally unbalancing the game (e.g. making Vanguard much
  stronger, which would break the 5v5 balance the judge plays).
  The PLAYER-plant path works (PUSH test: player plants, bomb explodes,
  round won by detonation) — the objective loop is functional from the
  judge's perspective as the player. The DROP rate measures bot-only
  play in a 4v5, which understates the real 5v5 game.
