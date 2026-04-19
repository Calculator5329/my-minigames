# Reactor — Expansion (Tier 1 + Tier 2)

Date: 2026-04-19
Status: implementing

## Goal

Turn the single-60s Reactor arcade run into a 10-day campaign with deeper
upgrade trees and a persistent meta-progression layer (research). Keep the
existing core loop (throttle ↔ heat ↔ cash) untouched — the new content layers
*around* it.

## Scope

### New gameplay
- **Campaign mode**: 10-day campaign. Each day = 60s of the existing run.
  Cash + modules persist between days. Day end → recap + free research card.
- **Day 5 boss**: Comet Shower (10 meteors over 8s).
- **Day 10**: HQ extraction → score banked, unlocks Endless.
- **Endless mode**: continues past day 10 with rising difficulty.
- **5 new modules** (total 11):
  - Solar Array — heat-free passive income.
  - Containment Laser — chance to vaporize incoming meteors.
  - Helium Pump — rewards stable-low-throttle play with growing income mult.
  - Worker Habitat — adds workers and small income mult.
  - Black Box Backup — single-use revive to prevent one meltdown.
- **4 new events** (total 7):
  - Investor Visit — pause, pick 1 of 3 cards.
  - Aurora — buff (income + cooling).
  - Reactor Surge — risk/reward (heat spike + huge income burst).
  - Lunar Quake — module damage (mitigated by shields).

### New meta layer
- **Research tree** — 10 persistent nodes saved to localStorage via
  `Storage.mergeGameData('reactor', { research, completedRuns, ... })`.
  Earn RP per day survived + per objective hit. Nodes affect starting state of
  every future run (max heat, starting cash, vent CD, etc.).
- **Daily objectives** — 3 random objectives per day. Each one cleared = +1 RP
  on top of the +1 RP for surviving the day.

### Difficulty
- Per-day scaling for meteor cadence, flare cadence, leak cadence, max-heat
  ceiling, and meltdown threshold.

## File layout

```
games/reactor/
  manifest.js        — preview thumbnail (unchanged)
  modules.js         — module catalog, costs, effects, glyph drawing
  events.js          — event catalog, triggers, update/render hooks
  research.js        — research nodes, RP storage, panel UI
  campaign.js        — day state machine, recap screen, objectives
  game.js            — main loop, render, throttle/vent UI (orchestrator)
```

All files attach to a shared namespace `NDP.Reactor`:

```
NDP.Reactor = {
  Modules:  { catalog, costFor, applyEffects, drawGlyph, ... },
  Events:   { catalog, spawn(name, game), updateAll(game, dt), drawAll(game, ctx) },
  Research: { catalog, getState(), buy(id), apply(game), drawPanel(ctx, ...) },
  Campaign: { TOTAL_DAYS, beginDay(game, n), endDay(game), drawRecap(ctx, ...) }
}
```

`game.js` consumes them; nothing in the engine changes.

## Day flow

```
Day 1 (60s) → recap → research card pick → Day 2 (60s) → recap → ...
                                                                  ↓
                              Day 10 → HQ extraction → final score → Endless?
```

## Day-by-day difficulty curve

| Day | Meteor cadence | Flare cadence | Max heat | Notable |
|-----|---------------|---------------|----------|---------|
|  1  | 12-18s        | 18-30s        | 100      | tutorial day, no flares first 15s |
|  2  | 11-17s        | 16-28s        | 100      | investor visits enabled |
|  3  | 10-16s        | 14-26s        |  98      | reactor surges enabled |
|  4  |  9-15s        | 13-24s        |  96      | lunar quakes enabled |
|  5  |  8-14s        | 12-22s        |  94      | **Comet Shower** at t=30s |
|  6  |  7-13s        | 11-20s        |  92      | aurora enabled (relief) |
|  7  |  6-12s        | 10-18s        |  90      | meteors can come in pairs |
|  8  |  5-11s        |  9-16s        |  88      | flares last 2x longer |
|  9  |  4-10s        |  8-14s        |  86      | quakes happen in pairs |
| 10  |  3- 9s        |  7-12s        |  84      | **Final Day** — boss + extraction |

Endless: scales beyond day 10 with the same formula.

## Modules

| ID  | Name              | Base cost | Effect                                         |
|-----|-------------------|-----------|------------------------------------------------|
| rig    | Mining Rig       | 50    | +25% income mult per rig                       |
| cool   | Coolant Loop     | 120   | +20 max heat, +1 coolant/s, +30 max coolant    |
| shield | Shielding        | 250   | reduce meteor damage 50% per layer (compound)  |
| core   | Reactor Core+    | 500   | +30% efficiency (watts/heat)                   |
| pad    | Launch Pad       | 1000  | rocket every 8s, $burst                        |
| auto   | Auto-Stabilizer  | 2000  | pulls throttle down when heat > 100            |
| solar  | Solar Array      | 80    | +$5/s base income (no heat)                    |
| laser  | Containment Laser| 350   | 25%/level chance to vaporize incoming meteors  |
| pump   | Helium Pump      | 800   | builds bonus mult while throttle stable 20-60% |
| hab    | Worker Habitat   | 180    | +1 worker, +5% income per habitat               |
| box    | Black Box Backup | 1500   | single-use revive (one-time, consumed on use)  |

Cost growth: 1.6× per existing copy (unchanged).

## Events

| ID            | Trigger                                     | Effect |
|---------------|---------------------------------------------|--------|
| meteor        | every 12-18s (curve)                        | aim at module/reactor; impact = damage or heat spike |
| flare         | every 18-30s (curve)                        | nudges throttle up, screen orange |
| leak          | every 18-32s (curve), only after t>15       | coolant regen halved for 8s |
| investor      | every 25-40s, day ≥ 2                       | pause + 3 cards (pick one) |
| aurora        | every 30-50s, day ≥ 6                       | +50% income & cooling for 5s |
| surge         | every 35-55s, day ≥ 3                       | +50 heat instantly, +200% income for 4s |
| quake         | every 40-60s, day ≥ 4                       | random module damaged unless shielded |
| comet_shower  | scripted, day 5 at t=30 (and day 10 t=40)   | 10 meteors over 8s |

## Research nodes (10)

| ID            | RP cost | Effect                                                      |
|---------------|---------|-------------------------------------------------------------|
| subsidies     | 1 RP    | start every run with $200                                   |
| dome          | 2 RP    | +20 starting max heat                                       |
| quick_vent    | 1 RP    | vent cooldown 3s → 2s                                       |
| optics        | 1 RP    | meteor crosshair appears 30% earlier                        |
| helium_bonus  | 2 RP    | base income mult ×1.10                                      |
| insulation    | 2 RP    | passive cooling +30%                                        |
| veteran       | 1 RP    | start every run with 1 free Mining Rig                      |
| stockpile     | 2 RP    | start with 80 coolant, max coolant +20                      |
| auto_trader   | 3 RP    | +1%/s income mult while throttle held under 50% (cap +30%)  |
| galactic      | 3 RP    | every $50K total earned, lump-sum +$1K                      |

Total: 18 RP to fully tree. Earn ~13 RP per perfect 10-day run (10 days + ~3
objectives). So full research takes about 1.5 perfect runs.

## Daily objectives (random 3 per day, +1 RP each)

Pool of 8:
- Earn $X this day (X scales by day).
- Survive Y meteors (Y scales by day).
- Don't vent.
- Buy ≥ 2 modules.
- Don't drop throttle below 30% for 30s contiguous.
- Don't exceed 90% heat.
- Have ≥ 4 distinct module types by end of day.
- Survive the day with > $Y cash banked.

## Implementation order

1. `modules.js` — pure data + draw helpers, no game state coupling.
2. `events.js` — moves existing meteor/flare/leak logic out of `game.js` and
   adds the four new events.
3. `research.js` — independent. Persistent state via `Storage`. Drawn as a
   separate full-screen panel toggled with a button or keystroke.
4. `campaign.js` — day state machine, recap UI, objectives. Doesn't draw the
   in-day HUD; that stays in `game.js`.
5. `game.js` — slim it to: orchestration, render, throttle/vent/HUD/cards,
   delegating module/event/research/campaign behaviour.
6. Wire in `index.html` (4 new script tags before `game.js`).
7. Verify each day boundary, comet shower, all events, research persistence.
8. Changelog + roadmap.

## Risks & mitigations

- **`game.js` exploding past 2000 lines**: split out helpers (drawing the
  reactor core, gauges, cards) only if needed.
- **Save schema drift**: namespace research under
  `Storage.getGameData('reactor').research` so older saves are forward-safe.
- **Investor pause**: the engine pauses `update` when state ≠ 'playing', so
  the investor card UI runs in `render` only and uses `Input.justPressed` via
  a polling pattern; alternatively the investor is a 4-second window where
  game still runs but heavily slowed.
  → Decision: in-game overlay; throttle smoothly clamps to 0 during the pick;
  player has 6s real time, then auto-picks card 0 if no choice made. No engine
  pause needed.
