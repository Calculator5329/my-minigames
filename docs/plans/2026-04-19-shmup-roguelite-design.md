# Starfall & Asteroids — Roguelite Sector-Map Overhaul

**Date:** 2026-04-19
**Status:** approved (user delegated all decisions)
**Priority:** Length > Graphics > Progression > Variety

## Goal

Turn Starfall (currently endless, flat) and Asteroids (already has a linear hive
campaign) into 20+ min roguelite runs with biome variety, branching paths,
deeper upgrade shops, and satisfying finales.

## Target arcs

### Starfall (bigger delta — it's currently endless)
- 5 sectors × (3 waves + mid-boss) + final boss. ~18–25 min full run.
- New WIN state: defeating the **Warlord** in Sector 5.

### Asteroids (smaller delta — campaign already exists)
- Existing 10-wave campaign is re-framed into 5 sectors × 2 waves with sector
  boundaries at waves 2 / 4 / 6 / 8 and bosses at 5 + 10.
- Adds biome themes + branching between sectors. Hive Queen gets a phase 3.

## Biome system (5 biomes)

| # | Name          | Palette                  | Parallax gimmick                   |
|---|---------------|--------------------------|------------------------------------|
| 1 | Frontier      | cyan/violet (current)    | standard starfield                 |
| 2 | Debris Belt   | rust/amber               | tumbling rock silhouettes backdrop |
| 3 | Ion Storm     | electric green/teal      | lightning flashes + aurora         |
| 4 | Deep Void     | black/deep purple        | dim stars, slow nebula drift       |
| 5 | Core          | red/gold                 | pulsing sun, embers                |

Each biome sets: `bgGrad`, `nebulaTint`, `starColor`, `particleTint`,
`accentColor`. Biome also selects which enemy subset spawns (see Variety).

## Branching choice screen

After each sector clear, player sees 2–3 "path" cards with:
- **Biome** icon + name
- **Reward tier** (common / rare / elite)
- **Modifier** chip (one of: Asteroid Storm, Solar Wind, Dense, Bounty, Elite)

Choosing a card sets next sector's biome + modifier + shop currency multiplier.

Modifiers (pool of 5):
- **Asteroid Storm** — debris drifts through the field (Starfall only)
- **Solar Wind** — slow global drift in one direction
- **Dense** — +40% enemies, +40% reward
- **Bounty** — enemies drop 2× wallet coins
- **Elite** — enemies have +50% HP, shop offers +1 choice next round

## Progression (shops)

Both games expand pre-run/between-sector shops from 4 → 10 upgrades with
tiered pricing. New upgrades:

**Starfall** (4 existing + 6 new):
- existing: +Life, Bombs, Start-Triple, Start-Rapid
- `pierce` — bullets pierce 1 enemy
- `spread` — permanent +1 bullet (stacks with triple)
- `magnet` — pickup attraction radius
- `shield` — 1 absorbed hit, 10s regen
- `nitro` — dash on Shift (2s cooldown, i-frames)
- `score` — +25% score → +25% wallet

**Asteroids** (4 existing + 4 new):
- existing: Rapid Fire, Twin Guns, Shield, Missile
- `overclock` — +25% bullet speed + range
- `charge` — hold Space to release piercing shot
- `drone` — tiny drone orbits, autofires at nearest
- `emp` — bomb-style screen clear (C key, 1 per run unless restocked)

## Variety (new enemies per biome)

**Starfall** adds 3 new enemy kinds to existing grunt/zig/shooter:
- `dasher` — darts diagonally, 1hp, hard to hit
- `tank` — slow, 5hp, drops guaranteed powerup on death
- `swarm` — spawns 3 at once in a tight V formation

Biome enemy subsets (so each sector feels distinct):
- S1 Frontier: grunt, zig
- S2 Debris: grunt, tank, zig
- S3 Ion: zig, shooter, dasher
- S4 Void: shooter, dasher, swarm
- S5 Core: tank, shooter, swarm (+ Warlord boss)

**Asteroids** adds 2:
- `cruiser` — slow armored alien, 4hp, fires burst of 3
- `mine` — asteroid that explodes on death into 6 bullets

## Graphics / juice

- **3-layer parallax** (far stars / mid stars / near debris), already partly
  present in Starfall.
- **Screen shake** presets tuned per biome (Ion Storm = higher baseline).
- **Hit-stop** 50ms on mid-boss kill, 120ms on final boss kill.
- **Flash patterns**: phase-change flashes match biome accent.
- **Victory screen** per game with run summary (sectors cleared, upgrades
  picked, time, score).

## Data / persistence

Extend `Storage.getGameData(id)`:
```
{
  bestSector: int,
  warlordDefeated: bool,        // starfall
  hiveQueenDefeated: bool,      // asteroids (already exists)
  upgrades: { ... },             // pre-run meta upgrades
  unlocks: { ... }               // future-proofing for ship variants
}
```

## Non-goals (out of scope for this pass)

- Ship selection (too much art)
- Separate campaign map UI (branching uses inline between-sector screen)
- Daily-run / seed system
- Leaderboards
- Shared `engine/sector-map.js` — games diverge enough that duplication is
  cheaper than abstraction. Revisit if a 3rd shmup is added.

## Implementation order

1. Starfall: biome system + sector structure (scaffolding first)
2. Starfall: branching choice screen
3. Starfall: new enemies + expanded shop
4. Starfall: Warlord final boss + win screen
5. Asteroids: biome tinting + sector framing on existing waves
6. Asteroids: branching choice screen (simpler, between sectors)
7. Asteroids: new enemies + 4 new upgrades
8. Asteroids: Hive Queen phase 3 + enhanced win screen
9. Polish pass: parallax, hit-stop, shake tuning, victory screens
10. Bump `?v=` cache-bust, verify in preview, commit.
