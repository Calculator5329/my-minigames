# Shallow Six — Depth Pass + SVG Sprite Engine

**Date:** 2026-04-19
**Goal:** Bring the six remaining shallow games up to the depth bar set by the
earlier depth pass (vaultbreaker, tanks, barrage, skybound, gullet, franchise),
and ship a reusable SVG sprite atlas the engine + every game can use.

## Targets

| Game | Old state | New state |
|------|-----------|-----------|
| **Bloom** | Single 60s round, no progression | 5 biome stages, hostile fauna, boss swarms, perk shop, persistent upgrades |
| **Deflect** | Endless survival, no waves | 12-wave campaign + endless tier, projectile variants (homing, splitter, frost), boss champion, perk picks |
| **Sigil** | Single 60s round, random runes | 6-chapter spellbook, multi-rune combo casts, boss duels with curses, persistent mastery |
| **Stargazer** | Endless waves | 15-wave campaign, boss every 5, weapon mod loadout (lance/spread/wave), persistent ship parts |
| **Ricochet** | 30 levels, 1 enemy type | Themed worlds (5 × 6 levels), enemy variants (turret, runner, bomb), level-end shop |
| **Diner** | Single 60s shift | 5-day campaign, evolving menu, station upgrades, daily quotas, persistent kitchen |

## Cross-Cutting

### `engine/sprites.js` (new)
- Registers inline SVG strings, rasterises to offscreen canvases at requested
  sizes, exposes `Sprites.draw(ctx, key, x, y, w, h, opts)` and `Sprites.get(key)`.
- Lazy: a sprite is rasterised the first time it's drawn. Pre-render hint via
  `Sprites.preload(keys, size)` for time-critical first-frames.
- Cache key is `key@WxH` so the same SVG can render at multiple sizes without
  pixelation.
- `Sprites.bitmap(svg, w, h)` returns an HTMLCanvasElement directly for callers
  that need a baked image (used for sprite-sheet style atlases).

### Per-game persistence
- Reuse `Storage.getGameData(id)` / `setGameData` already in place.
- Each game stores: `bestRun`, `unlocks` array, level/day/chapter progress,
  shop tiers.
- "Continue Run" overlay: if a campaign has saved progress, the title overlay
  offers "Continue" alongside "New Run".

### Internal phase substate
Following the convention from the prior depth pass: campaign games keep
`state='playing'` but track an internal `this.phase` ('intro', 'play', 'shop',
'briefing', 'reward'). Game-over only fires on actual loss.

## Bloom — Reef → Void

- 5 biomes by score threshold: Tidepool (0), Coral Garden (250), Kelp Forest
  (650), Trench (1200), Void (2000).
- Per biome: distinct background palette, hazards, and 1 hero swarm encounter.
- New entity: **Sentinel** (large stationary swarm guarding biome boundary;
  must be cracked open to advance). **Spike Spawner** (drops harmful drifting
  spines).
- Player powerups: `Bloom` (temporary +50% radius), `Magnet` (pulls drifting
  particles), `Spike Coat` (next 6s reflects damage).
- Boss every other biome: `Helio` (giant pulsing star), `Maw` (splits when hit
  past 50%).
- Persistent upgrades (post-run shop UI on canvas): start mass +N, dash
  cooldown −%, magnet baseline radius, biome resume.
- SVG sprites: kelp blades, coral plumes, sentinel jelly, helio star, maw maw.

## Deflect — Champion's Trial

- 12 numbered waves + endless after. Wave 4/8/12 are bosses.
- Projectile types: `arrow` (current), `firebolt` (curves toward player past
  300px), `splitter` (creates 3 children on parry), `frost` (slows blade if
  parried late), `armored` (needs two parries).
- Wave intermissions: pick 1 of 3 perk cards drawn from a deck — `Wider Arc`,
  `Faster Swing`, `Heart`, `Reflect Damage`, `Combo Multiplier`, `Slow Time on
  Perfect`.
- Bosses: `Warden` (cone barrage), `Twin Sisters` (two coordinated arc
  attacks), `The Sun` (pulsing radial waves of fire bolts).
- Persistent: highest wave, perk meta-unlocks (1 perk auto-active per run after
  beating a boss the first time).
- SVG sprites: knight silhouette, archer projectile, fire bolt with halo,
  splitter shard, boss portraits.

## Sigil — Spellbook

- 6 chapters, each ending in a duel boss. Chapters introduce new runes.
- Multi-rune combos: chapter 3+ requires drawing 2 runes in sequence (e.g.
  Deltar then Vortek = "Stormlance").
- Duel: boss has HP bar, casts curses (timer drain, mirrored input, fade ink).
  Successful spell deals damage scaled by accuracy.
- Perfect-rune awards a "spell mote"; spend 3 motes to refresh a missed cast.
- Persistent: chapters cleared, mastery per rune (track avg accuracy).
- SVG sprites: spellbook page (chapter cards), 7 rune glyphs, boss portraits.

## Stargazer — Vanguard Campaign

- 15 waves; 5/10/15 are bosses (Hunter, Crucible, Maw of the Stars).
- Loadout: pick 1 weapon mod every 3 waves: `Lance` (piercing), `Spread`
  (3-bullet fan), `Wave` (sine wave), `Mortar` (lobs splash shells).
- Pickups: shield orb, magnet (auto-collect), nano-repair (+1 HP).
- Persistent: best wave, owned mods, hangar HP base.
- SVG sprites: player ship (3 hull variants by HP tier), drifter,
  chaser, hunter boss, asteroid pickups, weapon icons.

## Ricochet — Tour of the Labyrinth

- 5 worlds × 6 levels = 30. Each world has palette + enemy mix.
- Enemy variants: `target` (current), `runner` (2× speed), `turret` (rotates
  shoots projectile every 4s), `bomb` (explodes on death, kills bullet),
  `shielded` (needs 2 hits).
- Powerups in level: split-shot, slow-mo, extra bounce.
- Between worlds: 3-card upgrade pick (max bounces, slowmo charges, +1 HP).
- Persistent: best world reached, perk picks.
- SVG sprites: hero turret, enemy variants, bomb, shield, world tiles.

## Diner — Five Day Rush

- 5 daily shifts, each 60s, with quota: $X earned to clear the day.
- Each new day unlocks ingredients + recipe difficulty (drinks, fries, dessert).
- Day end: spend earnings on station upgrades — Faster Hands (-cd to add),
  Auto-Plate (one-click finish if combo correct), Patience Posters (slower
  decay), Bigger Tips, Extra Burner.
- Day 5 = "Critic Night" — all customers patience halved.
- Persistent: best day, owned upgrades.
- SVG sprites: animated chef hand, ingredient cards, customer roster of 8 with
  distinct silhouettes, neon "OPEN" sign.

## Acceptance

- Each game boots, plays through its first level/wave/day, opens its shop,
  finishes its campaign.
- All sprites render via `engine/sprites.js`. No external file fetches needed
  (everything inline).
- Saves persist across reload.
- Selector previews still animate (manifest `previewDraw` left intact unless
  the new sprite makes a clearly better preview).

## Non-goals

- No new top-level game cartridges (sand spec is left for a future pass).
- No audio overhaul.
- No mobile/touch retrofit.
