# Arcade Six — Depth Pass

**Date:** 2026-04-19
**Goal:** Bring six remaining shallow games up to the depth bar set by the
Shallow-Six pass. Reuse `engine/sprites.js`, the per-game phase pattern, and
`Storage.getGameData(id)` for persistent meta.

## Targets

| Game | Old | New |
|------|-----|-----|
| **Snake**    | 60s round, growing apple | 4-biome campaign (grass → desert → cave → digital), boss apple per biome, power-ups (slow-mo, ghost, magnet), persistent perks, custom SVG fauna |
| **Pong**     | 60s vs CPU | 5-opponent gauntlet (Rookie, Cadet, Veteran, Master, Champion) with unique paddle behavior; between-match perk picker; boss = Champion match (best-of-5) |
| **Breakout** | Endless wall + level counter | 5-world tour (Pastel, Steel, Frost, Ember, Void) × 3 levels + boss-brick. New brick types: ice (2HP), metal (need power-up), bomb (chain), mirror (deflect). Power-ups drop from special bricks (multi, wide, laser, slow). |
| **Asteroids**| 60s endless | 10-wave campaign + boss every 5 (Hive Mind alien). Ship upgrades between waves: rapid fire, twin guns, shield, missile. |
| **Helicopter** | 60s endless cave | 4-biome run (cavern → reactor → reef → orbit), each ending in a boss obstacle (a moving wall, a charging dragon, a turret gauntlet). Persistent perks: fuel cells (more lift), reinforced rotor (one free hit). |
| **Frogger** | 60s endless | Day/Night campaign of 5 levels. Each level adds a new hazard layer (snakes, crocodiles in pads, lily-pad timers, lightning storms). Boss = Highway Hawk that swoops across road. |

## Conventions (recapped from Shallow-Six)

- Use `class XxxGame extends BaseGame` and stay in `state='playing'` during a
  whole run. Drive transitions with an internal `this.phase` substring.
- `this.phase` candidates per game: `intro`, `play`, `wave`/`level`/`biome`,
  `between`, `boss`, `bossWin`, `shop`, `victory`, `dead`. Each game picks the
  ones that fit; `_renderXxx`/`_updateXxx` per-phase keeps the file readable.
- Game-local `loadSave()`/`saveData()` wrap `Storage.getGameData(id)` with a
  default object. Always `Object.assign(default, …)` so new fields don't
  invalidate old saves.
- Persistent perks/upgrades are bought from a shop **between** chapters, paid
  for from the *global* coin pool (`NDP.Engine.Storage.coins`). Always
  `NDP.Engine.Storage.save()` after a coin spend.
- After a successful click in a UI phase, set `Input.mouse.justPressed = false`
  to consume the event (prevents double-fire into the next phase).
- Sprites are inline SVG strings registered via
  `NDP.Engine.Sprites.registerMany({...})` in a `sprites.js` sibling file.
  `Sprites.draw(ctx, key, x, y, w, h, opts)` is the drawing API; rasterised
  bitmaps are cached per requested size.
- HUD is set via `this.setHud('<span>...</span>')`.
- `coinsEarned(score)` returns lifetime coin rewards; tune so a typical strong
  run yields 8–18 coins.

## Per-game design notes

### Snake
- Biomes: Grass (2pt apples), Desert (cactus walls), Cave (light radius
  shrinks), Digital (warping walls).
- Power-ups: ⚡ slow-mo (8s tick interval ×1.5), 👻 ghost (8s pass-through self),
  🧲 magnet (8s apples gravitate).
- Boss: a Worm that moves on the grid; player must surround it with apple
  trail to defeat (3 apple-rings).
- SVG: snake head (eyes per direction), apple, cactus, glitch tile.
- Persistent perks: Lateral (start +2 length), Slow Start (first 5s slower),
  Iron Apple (eat once without growing), Magnet+ (default magnet 1s on spawn).

### Pong
- Opponents have unique behavior + portrait sprite:
  - Rookie: slow tracker
  - Cadet: aggressive smash on returns
  - Veteran: predictive AI but lazy (recovers slowly)
  - Master: spin balls
  - Champion: best-of-5, two-paddle clones, fast
- Match flow: first to 5, perk pick after each match.
- Perks: Wider paddle, Curve return, Twin ball briefly, Slow recovery, Side
  bumper (top/bottom mini-paddles).
- SVG: opponent portraits, paddle skins, ball trails.

### Breakout
- Worlds × 3 levels each, last world has 4 levels + boss-brick mega-boss.
- Brick types: normal, ice (2HP), metal (need power), bomb (chain explosion),
  mirror (returns ball faster), lock (opens with key brick).
- Power-up drops: 🟢 multi-ball (+2), 🔵 wide paddle, 🟣 laser, 🟠 slow ball.
- SVG: brick types, power-up chips, paddle skins, world backdrops.

### Asteroids
- 10-wave campaign + boss every 5: Wave 5 = Hunter Drone Swarm, Wave 10 = Hive
  Queen (large UFO with split sub-drones, fires aimed shots).
- Ship upgrades between waves: rapid fire, twin guns, shield (1 hit), missile
  (homing single-shot, 6s cooldown).
- SVG: ship variants, alien drones, hive queen, upgrade icons.

### Helicopter
- 4 biomes of 25s each. Each biome ends with a boss "wall" (laser gates,
  charging dragon, turret gauntlet, satellite array).
- Power-ups in flight: fuel pod (refill stamina meter), shield bubble (1
  hit), turbo (10s 1.5× speed = more score).
- Perks bought after run: bigger fuel tank, slower stall, +1 retry mid-run.
- SVG: biome-specific decor (stalagmites, pipes, coral, satellites), heli
  variants, boss sprites.

### Frogger
- 5 days, each opens new hazards: snakes in median, crocodiles biting at home
  pads, lily pads that sink with timers, lightning storms.
- End-of-day boss: Highway Hawk, a swooping shadow that zigzags across the
  road and pads.
- Permanent perks: longer hop (skip a lane), trap detector (warning flash on
  upcoming croc), spare frog (revive once per day).
- SVG: frog skin, croc, snake, hawk, lily pad, biome backdrops.

## Workflow

1. Each game gets a sister `games/<id>/sprites.js` registering its inline SVG
   strings.
2. `games/<id>/game.js` is rewritten to the new design.
3. `games/<id>/manifest.js` blurb + description updated.
4. `index.html` adds the new `sprites.js` script before the manifest, with a
   `?v=2` cache-buster so the python http.server doesn't serve a stale copy.
5. Smoke-test all six in the browser via the same eval pattern used in the
   Shallow-Six pass (`new gameClass(canvas, manifest); g.begin(); …`).
