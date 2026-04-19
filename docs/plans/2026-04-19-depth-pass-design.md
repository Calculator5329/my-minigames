# Depth Pass Design — 2026-04-19

Transformation pass on 5 shallow/flagship games + graphics polish on Franchise.

## Scope
- **Vaultbreaker** — 7-vault campaign, proper shop menu, persistent gun upgrades, phase-2 boss.
- **Tanks** — terrain generation fix (guarantee line-of-sight), weapon inventory, 5-match campaign.
- **Barrage** — 10-wave campaign, 3 missile types, between-wave upgrade shop.
- **Skybound** — 4 altitude biomes, hazard variety, fuel pickup variants, permanent unlocks.
- **Gullet** — energy meter, 5 critter types, 3 biome stages, upgrades between runs.
- **Franchise** — graphics enhancement (parallax city, detailed business tiles, animated workers).

## Cross-Cutting
- `NDP.Engine.Storage.getGameData(id)` / `setGameData(id, obj)` for per-game persistent JSON.
- Self-contained per-game saves. No global currency beyond existing coins.
- Between-level shops: implemented as an internal phase in each game (game stays `state='playing'`, has `phase` substate). Draws its own shop on canvas.

## Per-game specs

### Vaultbreaker
- Add `level` (1-7). HP/mutation-count scales per level. Level 7 = boss: phase-2 at 50% HP adds new attack pattern.
- Between-level shop screen (new phase `intermission`): proper menu with up/down selection or click. Upgrades:
  - Weapon unlocks (existing).
  - Weapon tier upgrades: +damage, +fire-rate, +pierce count (3 tiers each).
  - Max HP, Coin-magnet radius, Full-heal.
- Persist across runs: best level reached, unlocked weapons list, campaign `coinsBanked` separate from in-run coins. Fresh runs restore owned weapons.
- Polish: vault intro card ("VAULT III — THE FOUNDRY"), visible plate HP bars (already), coin-rain screen fx on plate break.

### Tanks
- Terrain gen: post-generation check — sweep ballistic arc from A→B at several power/angle samples. If none clear terrain, smooth highest intermediate peaks. Cap max column height at ~65% of H.
- Weapon inventory: `standard` (free), `rocket` (flat arc), `mortar` (high arc), `cluster` (splits mid-flight into 3), `nuke` (one-shot, massive). Cycle with Q/E.
- Campaign: 5 matches vs AI of increasing accuracy. Coins between matches buy weapons.
- UI: explicit wind number + direction arrow, power number readout.

### Barrage
- Campaign: 10 waves. Wave N = `6 + N` missiles, speed scales, types introduced (1-3 normal, 4-6 splitter, 7-10 armored mixed).
- Missile types: `normal` (current), `splitter` (spawns 2 children at 50% altitude), `armored` (needs 2 hits or bigger burst).
- Between-wave shop: spend coins on burst-radius tier, freeze-burst (slows others in radius), chain-burst (detonation triggers nearby bursts), city-repair.
- Persistent: highest wave reached, unlocked upgrade catalog.

### Skybound
- Replace 60s timer with **altitude objective**: reach 2500m Void.
- 4 biomes by altitude: 0-600 Meadow (birds), 600-1200 Storm (lightning bolts), 1200-1800 Stratosphere (jets), 1800-2500 Void (debris + sparse clouds).
- Fuel pickup variants: normal (fuel), shield (one-hit absorb), slow-mo (3s time dilation).
- Persistent upgrades bought post-run with coins: larger fuel tank, start with shield, +5% boost efficiency, double-jump on rocket.

### Gullet
- Energy meter: erupt costs 25 energy, max 100. Refills slowly + on critter eat.
- Critter types: `basic`(1pt, +15 energy), `fast`(2pt, evasive, +10), `fat`(3pt, slow, +30), `spiked`(-20hp if hit, avoid), `glowbug`(+50 energy, rare).
- 3 stages in one run (reef → trench → abyss). Stage transitions at score thresholds; each adds critter types and raises spawn.
- Post-run upgrades: +max energy, +eruption cone width, +chain-eat multiplier.

### Franchise
- Parallax city background: 3 layers (distant skyline, mid buildings, foreground storefronts).
- Each business tier gets visually distinct sprite: stand, cart, kiosk, café, shop, bank, tower.
- Animated workers walk between buildings, carrying coins.
- Money-flying particles on every tick; per-tier color palette.
- No gameplay change — visuals only.

## Save Schema

`Storage.games[id].data` — arbitrary per-game object. Games call `Storage.getGameData(id)` / `setGameData(id, obj)`.

Examples:
- vaultbreaker: `{ bestLevel, unlockedWeapons: ['pistol','uzi'], weaponTiers: {pistol:2,...}, maxHpBought, bankedCoins }`
- tanks: `{ matchesWon, weapons: ['standard','rocket'] }`
- barrage: `{ highestWave, burstTier, freezeOwned, chainOwned }`
- skybound: `{ bestAltitude, fuelTankTier, shieldStart, boostTier, djOwned }`
- gullet: `{ bestScore, energyTier, coneTier, chainTier }`

## Verification
- Launch via preview server, load each game, confirm: boots, campaign progresses, shop works, save persists across reloads.

## Non-goals
- No new art assets (procedural only).
- No multiplayer, no audio overhaul.
- Other 12 games untouched this pass.
