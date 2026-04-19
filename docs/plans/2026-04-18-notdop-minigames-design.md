# NotDop Minigames — Design Doc

**Date:** 2026-04-18
**Type:** Browser-based Not Doppler-style minigame collection, extensible over time.

## Goal
Static, zero-build HTML/JS site. A selector grid with live animated previews; click a card to play a 60-sec arcade game. 7 launch games. Framework designed so adding an 8th/9th/Nth game is trivial.

## Tech stack
- Vanilla JS + Canvas 2D. No build step, no deps.
- Single-origin namespace `NDP` attached to `window`. Ordered `<script>` tags (works from `file://`).
- LocalStorage for persistence.
- Web Audio API for synthesized SFX.

## Folder layout
```
notdop-minigames/
  index.html        selector landing
  styles.css        shared UI
  main.js           selector logic, game loading/unloading
  engine/
    game.js         BaseGame class (lifecycle, score, fx)
    input.js        keyboard/mouse/touch state
    draw.js         canvas primitives + glow/shake/particles
    audio.js        Web Audio synthesized SFX
    storage.js      localStorage wrapper (scores, coins, unlocks)
  games/
    gullet/  franchise/  ricochet/  skybound/
    deflect/  bloom/  sigil/
      manifest.js   id, title, blurb, theme, previewDraw(ctx,t,w,h)
      game.js       class extends NDP.Engine.BaseGame
  games.js          imports all manifests into NDP.games list
```

## BaseGame contract
Every game class extends `NDP.Engine.BaseGame` and implements:
- `init()` — set up state
- `update(dt)` — advance sim
- `render(ctx)` — draw
- optional `onInput(ev)`, `onResize(w,h)`

Base class provides: `score`, `time`, `state` (playing/paused/over), `emitParticle()`, `shake(mag)`, `gameOver()`, `win()`, `sfx.*` bindings.

## Roster (7)
1. **Gullet** — underground worm, erupt to eat surface critters. B-ramp.
2. **Franchise Frenzy** — 60-sec incremental tycoon, click + buy auto-businesses. Tier unlocks.
3. **Ricochet** — one bullet, bank off walls to chain-kill. Per-level progression.
4. **Skybound** — upward launcher with rocket-jump + pickups. Height ramp.
5. **Deflect** — stand center, swing blade to parry projectiles. Wave speed ramp.
6. **Bloom** — mouse-led swarm; absorb smaller swarms, flee larger. Time ramp.
7. **Sigil** — draw matching runes under pressure; faster combos.

## Meta system
- Every played run awards coins proportional to score (game-defined formula).
- Coins spent in selector UI on cosmetic unlocks: selector color themes, per-card palette swaps. No gameplay modifiers.
- High score, total plays, last-played timestamp per game.

## Polish
- Screen shake on big events (eats, kills, crashes, game-over).
- Particle primitives (spark burst, trail, shockwave).
- Overlay screens: title, pause (Esc), game-over (coins earned + retry + back-to-selector).

## Audio
- Synthesized via Web Audio (oscillators + noise). Each game defines its SFX palette in its `init()`.
- Global mute toggle persists in localStorage.
- Sigil gets a low ambient drone.

## Extensibility promise
To add a new game:
1. `games/<id>/manifest.js` + `games/<id>/game.js`
2. One line in `games.js` (script tag) + `index.html`
3. Game class extends BaseGame, uses provided primitives.
