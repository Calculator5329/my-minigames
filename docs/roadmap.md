# Roadmap

High-level goals for the NotDop Minigames collection.

## Vision
A static, zero-build browser arcade — every game is 60 seconds, juicy, instantly playable, and lives at `file://` or any static host. Quality bar: every game's selector card preview makes you want to click it.

## Status

### Shipped (27)
- [x] Gullet
- [x] **Franchise Frenzy** — *expanded into 5-city campaign + Stardollar meta-shop on 2026-04-19*
- [x] **Ricochet** — *deepened with predictive aim, combo system, portals, boss phase 2, post-shot summary on 2026-04-19*
- [x] Skybound
- [x] Deflect
- [x] Bloom
- [x] Sigil
- [x] **Barrage** — *anti-spam pass: per-wave ammo + fire cooldown on 2026-04-19*
- [x] Diner Rush
- [x] Stargazer
- [x] Tanks
- [x] Bulwark
- [x] Starfall
- [x] **Leap** — *campaign closed (12 levels), enemy variety + power-ups + boss attack pattern on 2026-04-19*
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
- [x] **Feedback inbox (2026-04-19)** — `💬 Feedback` button in the arcade
      topbar writes per-game free-text feedback to Firestore collection
      `feedback` (project `ethan-488900`, default DB). No auth, write-only
      from clients, owner reads via the Firebase Console. Rules in
      `firestore.rules` need manual merge into the Console (shared DB with
      other apps in the project — see `docs/changelog.md`).
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
- [ ] **Site quality pass (2026-04-19)** — see
      `docs/plans/2026-04-19-selector-loader-pwa.md`. 4-phase plan:
      [x] Phase 1 repo hygiene (36 root PNGs → `docs/screenshots/`,
          consolidated gitignore, refreshed firebase.json),
      [ ] Phase 2 auto-discovery loader (`engine/loader.js` +
          `games/manifest.json`, single `?v=<sha>` cache-buster),
      [ ] Phase 3 selector UX (search, sort, tag chips, Continue rail
          of 5, keyboard nav, IntersectionObserver throttling),
      [ ] Phase 4 PWA (`manifest.webmanifest`, versioned cache-first
          service worker, install prompt). Replaces the older
          standalone "build pipeline" item.
- [ ] Next-tier depth pass (the ones that haven't gotten one yet): Tanks
      single-screen battles, Barrage simple shooter.
- [x] **418 Linden (Switchboard) — script + voice creep pass (2026-04-19)**
      — see `docs/changelog.md`. Rewrote dialogue + walkthrough across all
      five nights (more callers, two new voices, longer Night 5 figures).
      Replaced raw audio playback with a Web Audio chain (telephone
      bandpass + tube distortion + reverb + per-call hiss/breath/crackle
      bed) keyed to a per-night `escalation` 0..1, so each night narrows
      the band, raises the noise floor, and pushes the wet mix. Atmosphere
      pass on the board (palette lerp, ghost lamps, scanlines, static
      flashes, swaying cables) and the walkthrough (candle flicker, dust
      motes, figures that turn to watch the player). Tightened nights.js
      tuning (shorter TTL, ringing-drain, doubled critical-route penalty).
      `scripts/generate-voices.js` reads per-character `direction` notes
      and bakes via OpenRouter (`openai/gpt-audio-mini`, pcm16 streaming
      wrapped to WAV). Full 108-line bake committed to
      `assets/switchboard/voices/` (~38MB).
- [x] **Orbital — expansion Phase 1 + Phase 2 (2026-04-19)** — shipped per
      `docs/plans/2026-04-19-orbital-expansion.md`. Split monolithic
      `game.js` into `data/`, `lib/`, `ui/` modules under a new
      `NDP.Orbital` namespace; narrowed the play area for a persistent
      BTD4-style right-rail panel showing prominent stats + tower shop +
      full per-tower upgrade tree (replaces the old popup); two 4-tier
      upgrade paths per tower with a path-cap rule; tower XP / levels;
      28 active abilities reachable from upgrade nodes (Q/E hotkeys);
      First/Last/Strong/Close targeting priorities; 6 enemy mods (camo,
      lead, fortified, swift, armored, regen); 50-round campaign across
      five named acts; round-end recap with no-leak streak + combo bonuses;
      4 new towers (Sniper, Engineer, Cryo, Chrono); 2 new enemy types
      (swarmer, summoner); programmatic per-path tier overlays on tower
      sprites + XP chevron pips so towers visibly evolve as they upgrade;
      Stardust meta-currency persisted across runs.
- [x] **Orbital — Phase 2.5 polish (2026-04-19)** — two-column tower shop
      (no more off-screen catalog), BTD4-style round-gated tower unlocks
      with persistent best-round, locked-tower tiles + tooltips + unlock
      toast on round clear, two new towers (Mortar R11, Crystal R17), and
      a beefier upgrade-overlay tier system (T1 glow dot → T2 ring + pip
      badge → T3 chevron spikes / cardinal star + orbiting plate → T4
      pulsing aura with rotating spoke ring, counter-rotating dashed ring,
      orbiting energy beads, and crowning lance/gem glyph).
- [x] **Orbital — end-of-run + freeplay (2026-04-19)** — full canvas
      end-of-run modal (per-run stats: kills, bosses, leaks, lives lost,
      cash earned/spent, best combo, run duration), persistent top-10
      leaderboard with rank highlight, and "Continue in Freeplay" button
      on R50 victory. Freeplay extends rounds past 50 indefinitely with
      HP × 1.20^level / bounty × 1.10^level scaling per round past 50,
      stacked on the existing endless-tail wave-count growth.
- [ ] **Orbital — expansion Phase 3 (maps + difficulty)** — three new map
      geometries (branching, double-loop, choke-point), Hard + Apocalypse
      difficulties with mod-density and HP scalars per-act.
- [ ] **Orbital — expansion Phase 4 (heroes + meta)** — three heroes with
      level curves and ult abilities, Star Charts persistent skill tree
      spending Stardust, ~~Endless mode after R50~~ (shipped), rotating
      daily challenge, sandbox map.

## Decision log
- **Static, no build** — keep the project hackable from any folder. New games slot in by adding two `<script>` tags. Don't add a bundler unless game count crosses ~50.
- **Score = total earned** for tycoon-flavored games (`franchise`, `reactor`) — gives players a clean cumulative target.
- **Coin formula varies per game** — calibrated so a typical run earns ~5–15 coins (themes cost 150–600).
- **Per-game currency vs. global coins (2026-04-19, MIGRATION COMPLETE)** — Every game's in-game currency lives in its own per-game persistent wallet via `Storage.getGameWallet(id)` / `addGameWallet` / `spendGameWallet` and is **never** added to the global theme-shop pool. The global `Storage.coins` is its own thing, fed only by each game's `coinsEarned()` which is **always** milestone-based (levels/waves/biomes/etc. cleared this run + victory bonus), never derived from `floor(score / N)` if score is inflated by pickups. Reference: `games/vaultbreaker/game.js`. Recipe: `docs/plans/2026-04-19-currency-migration.md`. New games MUST follow this rule.
- **Vaultbreaker victory = wipe (2026-04-19)** — Beating the 7-vault campaign clears all unlocks AND the persistent coin wallet. The reset is the trophy. Use `Storage.clearGameData(id)` for any future "campaign won" wipes. Default for new games is NG+/persistent (no wipe); clean-slate is opt-in per-game.
