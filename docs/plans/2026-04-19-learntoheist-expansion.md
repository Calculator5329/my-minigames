# Learn to Heist — Learn to Fly-style Depth Pass

**Date:** 2026-04-19
**Owner:** agent
**Status:** in progress

## Goal

The user said "Make the progression and depth of the game more like Learn to
Fly and more in depth." Today the game is ~30% there: a 6-category upgrade
shop, 10 linear goals, daily weather modifier, one boss. It launches and it's
fun for ~3 runs but there's no long arc, no day-by-day pull, no
medal/achievement loop, and the pickup/hazard pool is thin. This pass closes
that gap.

## What "Learn to Fly" actually delivers

The mid-2010s flash trilogy LTF / LTF2 / LTF3 had four pillars that drove the
"one more run" feel beyond the launch loop itself:

1. **Day-by-day campaign with a story arc.** Each launch is a day on a
   calendar. Days have narrative beats and a calendar-target so progression
   feels like a journey, not a shop grind.
2. **Medal / achievement system.** Lots of small, specific goals
   (distance / altitude / coins / stunts / pacifist / fuel-efficient runs)
   that pay out in cash on first completion. Drives experimentation.
3. **Deep, layered upgrades.** 5-10 tiers per slot, multiple stats per tier,
   plus one-off "payload" items that change a single mechanic.
4. **Variety of in-flight pickups and hazards.** Boost cans, magnet
   potions, shields, mega-coins, bombs, mines, comets, lightning. Every
   altitude band has its own flavor.

We hit none of those well today. This plan ships all four.

## Scope (this PR)

**Pillar A — 15-day campaign**
- New `campaign.js` with 15 ordered days. Each day has a primary objective
  ("reach 1200m"), a flavor name, a story snippet, a cash reward, and an
  optional bonus objective ("…without using boost") with extra reward.
- Workshop card shows current day, objective, story snippet.
- Run-end report shows day-complete card on success and advances `dayIdx`.
- Day 15 is "Heist Day" — punch the vault. Beating it unlocks Endless mode
  (which keeps existing as the post-game launch loop).

**Pillar B — Medals (~25)**
- New `medals.js` with definitions across 7 themes (distance, altitude,
  speed, coins, stunts, fuel, special).
- Persistent map `save.medals = {id: {earned, progress}}`.
- `LTH.checkMedalProgress(save, kind, value)` updates progress and triggers
  award when threshold is crossed; returns array of newly-earned medals so
  the game can show in-flight popups.
- Medals award one-time bonus coins (50–2000 each, weighted by difficulty).
- Workshop has a "MEDALS" tab/button showing the grid of all medals
  (earned vs unearned with current progress).

**Pillar C — Deeper upgrades**
- Add a 7th category, **Aero** (drag/lift fine-tuning) — 6 tiers, real
  multipliers for `dragMult` and `liftMult` that the flight sim already
  reads via `s.dragMult`/`s.liftMult` (we add these reads to game.js).
- Stretch each existing category's tier descriptions to call out the
  cross-stat impact (purely text — no balance change, just clarity).
- New text rendering in shop showing "+42% thrust vs current" etc.

**Pillar D — More pickups & hazards**

New pickups:
- `mega_coin` — worth 25, rarer, with sparkle.
- `shield` — one-hit shield bubble that absorbs the next hazard.
- `magnet_potion` — temp big magnet (radius 600 for 8s).
- `boost_can` — instant +0.6 fuel + brief auto-burn pulse.
- `slow_time` — slows world 50% for 4s (helps thread hazards in space).

New hazards:
- `lightning` — descends straight down from above, mid-altitude band.
- `mine` — floats with slight drift, big radius, big knockback.
- `comet` — large arcing projectile across the high band, big knockback.

**Pillar E — Lifetime stats screen**
- `save.lifetime = {distance, altitude, time, coins, launches, vaultPunches}`
  updated at run end.
- Workshop "STATS" panel shows the running totals plus best-of-run.

**Pillar F — Endless mode**
- After Day 15 victory, save.endlessUnlocked = true.
- Workshop shows toggle "MODE: Campaign / Endless" — Endless picks a random
  daily modifier, no objective, score is highest distance × multiplier.

## Out of scope (deferred)

- New launch sites (visual cost too high)
- Companions/pets (new system)
- Branching upgrade paths (UI cost)
- Branching narrative

## File plan

- `games/learntoheist/medals.js` — NEW. Pure data + `LTH.Medals.*` helpers.
- `games/learntoheist/campaign.js` — NEW. Pure data + `LTH.Campaign.*` helpers.
- `games/learntoheist/content.js` — extend: new pickups, new hazards, Aero
  category, expanded SAVE schema (medals, dayIdx, lifetime, endless), new
  spawn weights for the new pickups/hazards, defaults safety in `loadSave`.
- `games/learntoheist/game.js` — integrate medals + campaign + new
  pickups/hazards. Add stats panel, medal grid, day card, endless toggle.
- `index.html` — add `<script>` tags for medals.js + campaign.js, bump
  cache buster to `?v=4`.
- `docs/changelog.md` + `docs/roadmap.md` — record.

## Testing

- Manual run-through in browser: launch day 1, complete, see day card,
  advance to day 2.
- Trigger a medal in-flight (collect 50 coins → "Pocket Change" pop).
- Visit workshop, switch to MEDALS tab, see lit medal.
- Visit workshop, switch to STATS tab, see lifetime numbers.
- Buy Aero tier 1 in shop, fly, confirm drag is reduced.
- Trigger a new hazard (lightning) by reaching its altitude band.
- Collect a shield, take a hazard hit, confirm shield consumed (no slowdown).
- Beat the vault, confirm endless unlock toast and toggle appears.
