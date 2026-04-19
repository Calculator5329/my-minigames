# Roadmap

High-level goals for the NotDop Minigames collection.

## Vision
A static, zero-build browser arcade — every game is 60 seconds, juicy, instantly playable, and lives at `file://` or any static host. Quality bar: every game's selector card preview makes you want to click it.

## Status

### Shipped (27)
- [x] Gullet
- [x] **Franchise Frenzy** — *expanded into 5-city campaign + Stardollar meta-shop on 2026-04-19*
- [x] Ricochet
- [x] Skybound
- [x] Deflect
- [x] Bloom
- [x] Sigil
- [x] Barrage
- [x] Diner Rush
- [x] Stargazer
- [x] Tanks
- [x] Bulwark
- [x] Starfall
- [x] Leap
- [x] Crypt
- [x] Depths
- [x] Vaultbreaker
- [x] Orbital
- [x] Learn to Heist
- [x] Sand
- [x] **Reactor** (2026-04-19) — *expanded into 10-day campaign + research tree on 2026-04-19*
- [x] **Snake** (2026-04-19) — retro pack
- [x] **Pong** (2026-04-19) — retro pack
- [x] **Breakout** (2026-04-19) — retro pack
- [x] **Asteroids** (2026-04-19) — retro pack
- [x] **Frogger** (2026-04-19) — lane-crossing reflex
- [x] **Helicopter** (2026-04-19) — one-button cave dodger

### Candidate next games (brainstormed, not yet committed)
- Sushi Stack — Sushi Cat-style peg drop
- Infect — Infectonator-lite zombie chain reaction
- Toss the Turtle — launcher with mid-flight powerups
- Tether — grappling-hook horizontal swinger
- Triage — patient-routing reflex management
- Lockpick — Skyrim-style tumbler reflex puzzle
- Tetris-lite — 60s line-clear sprint
- Centipede — bottom-screen vector shooter
- Missile Command — defend cities from incoming
- Pac-lite — single-room dot-eater with one ghost

## Cross-cutting goals
- [x] **Public hosting + GitHub (2026-04-19)** — repo pushed to
      https://github.com/Calculator5329/my-minigames, deployed to
      https://notdop-minigames.web.app via Firebase Hosting in project
      `ethan-488900` (dedicated multi-site slot `notdop-minigames`).
- [x] **Depth pass — Shallow Six (2026-04-19)** — Bloom, Deflect, Stargazer,
      Ricochet, Sigil, Diner all rebuilt with progression, bosses, perks, and
      custom inline-SVG art via the new `engine/sprites.js`.
- [x] **Depth pass — Arcade Six (2026-04-19)** — Snake, Pong, Breakout,
      Asteroids, Helicopter, Frogger all rebuilt with multi-stage campaigns,
      bosses, in-run power-ups, persistent perks, and custom inline-SVG
      sprite atlases.
- [x] **Inline SVG sprite engine (2026-04-19)** — vector sources, rasterise +
      cache per requested size, no file fetches.
- [x] **Orbital — Quant rebalance + 2× speed toggle (2026-04-19)** — replaced
      the constant-income Quant with a placement-coupled bounty aura plus
      capped per-wave interest on cash, removed the snowball, and added a 1× ↔
      2× world-sim fast-forward (button + F-key) so late-round filler doesn't
      drag.
- [x] **Sand — campaign-first onboarding (2026-04-19)** — boots straight into
      the first unsolved L1 level with pads pre-placed, level dropdown +
      Reset / Next / Sandbox toggle in the topbar, rich brief panel showing
      title / brief / truth-table / star targets / allowed parts, per-level
      tutorial walkthrough on `L1_01_buffer` and `L1_02_not`, and a
      `? Controls` cheat-sheet overlay.
- [x] **Reactor — 10-day campaign + research tree (2026-04-19)** — the
      single-shift tycoon is now a multi-day campaign with persistent
      meta-progression. 11 modules (5 new), 7 events (4 new), boss days,
      Endless mode, 10-node research tree saved across runs. Reactor is now
      five files (`modules.js`, `events.js`, `research.js`, `campaign.js`,
      `game.js`) sharing the `NDP.Reactor` namespace.
- [x] **Franchise Frenzy — 5-city campaign + Stardollar shop (2026-04-19)**
      — single 60s shift expanded to a 5-city campaign (Smalltown →
      Skyport, exponential targets $5K → $40M). Cash and businesses
      persist between cities; pre-run Stardollar shop with 5 permanent
      upgrades (Seed Capital, Click Force, Industry Boost, Tycoon Time,
      Headhunter, 4 levels each). 3 new business tiers (Casino, Movie
      Studio, Spaceport) gated to later cities, synergy bonuses at
      10/25/50 owned, manager auto-buyers, 5 random events, and a
      city-5 "Hostile Takeover" boss bid. Two files
      (`franchise/data.js`, `franchise/game.js`) sharing the
      `NDP.Franchise` namespace. Plan in
      `docs/plans/2026-04-19-franchise-expansion.md`.
- [ ] Sound: replace 404'd sample assets (`assets/audio/hit.mp3`, `coin.mp3`, `launch.mp3`) with synth fallbacks or commit the files.
- [ ] Mobile / touch input pass — many games assume mouse + keyboard.
- [ ] Accessibility audit (color contrast on themes, key bindings).
- [ ] Optional: build pipeline to bundle script tags so `index.html` doesn't grow linearly per game.
- [ ] Next-tier depth pass (the ones that haven't gotten one yet): Tanks
      single-screen battles, Skybound endless runner, Barrage simple shooter,
      Switchboard nights pass.
- [ ] **Orbital — huge expansion (planning)** — see
      `docs/plans/2026-04-19-orbital-expansion.md`. Four phases: tower depth
      pass (two-path upgrade trees, tower XP, active abilities, targeting
      priorities, round economy, panel UI redesign), content breadth (4 new
      towers, 5 new enemy mods, 30 → 50 rounds), maps + difficulty (3 new
      maps, Hard / Apocalypse modes), heroes + meta (3 heroes, Star Charts
      persistent tree, Endless mode, daily challenge, sandbox).

## Decision log
- **Static, no build** — keep the project hackable from any folder. New games slot in by adding two `<script>` tags. Don't add a bundler unless game count crosses ~50.
- **Score = total earned** for tycoon-flavored games (`franchise`, `reactor`) — gives players a clean cumulative target.
- **Coin formula varies per game** — calibrated so a typical run earns ~5–15 coins (themes cost 150–600).
- **Per-game currency vs. global coins (2026-04-19)** — Each game's *in-game* currency (vault coins, reactor credits, diner cash, etc.) lives in its own per-game persistent wallet via `Storage.getGameWallet(id)` / `addGameWallet` / `spendGameWallet` and is **never** added to the global theme-shop pool. The global `Storage.coins` is its own thing, fed only by each game's `coinsEarned()` (which should be derived from milestones/levels, not from in-run currency pickups). Vaultbreaker is the reference implementation; Reactor/Diner/Orbital meta-economies should follow the same pattern when next touched.
- **Vaultbreaker victory = wipe (2026-04-19)** — Beating the 7-vault campaign clears all unlocks AND the persistent coin wallet. The reset is the trophy. Use `Storage.clearGameData(id)` for any future "campaign won" wipes.
