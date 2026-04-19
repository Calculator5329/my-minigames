# Frogger + Helicopter — quick retro additions

**Date:** 2026-04-19
**Type:** 2 quick retro arcade minigames following the retro-classics pack.

## Why these two
- Both are universally-recognized Flash/early-arcade staples that had no representation yet.
- Each occupies a distinct mechanical slot:
  - Frogger = grid-hop reflex with timing-based hazards.
  - Helicopter = one-button physics dodge with infinite procedural cave.
- Easy to scope inside the 60-second arcade format.

## Frogger
### Layout
- 16 cols × 12 rows grid on the 960×600 canvas.
- Row 0: 5 home pads (goals).
- Rows 1-4: river (4 lanes, alternating directions).
- Row 5: median (safe).
- Rows 6-9: road (4 lanes, alternating directions, scaling speeds).
- Rows 10-11: start strip (safe).

### Lane content
- Cars: 4 colors (pink/yellow/cyan/purple), one per lane. Speed = 110-215 px/s, cars wrap horizontally.
- Logs: 3 of the 4 river lanes. Brown rectangles with bark-stripe detail.
- Turtles: 1 river lane (the 2nd). Surface/dive on a sine cycle. Frog drowns if standing on a submerged turtle (alpha < 0.25 phase).

### Frog
- One cell hop per keypress (drained from the held-keys map so a single press = single hop).
- 0.14s hop animation with vertical lift arc.
- Riding a log/turtle moves the frog with the lane; off-screen drift = death.

### Scoring
- +10 for each new deepest row reached this attempt.
- +150 per home pad filled.
- +500 bonus when all 5 pads filled (board resets, frog returns to start).
- -25 penalty per death.
- Coins ≈ score / 60.

### Win/loss
- Survive 60 s with at least one crossing → win.
- Survive 60 s with zero crossings → game over.
- Death = car/drown/drift/miss → reset frog, keep score, no level reset.

## Helicopter
### World
- World scrolls left at 220 px/s, ramping to 440 px/s over 60 s.
- Cave: top + bottom walls sampled every 16 px in world space, smoothly drifted via cheap deterministic noise. Tunnel narrows over time (up to 60% tighter than start).
- Heli x stays fixed at 220; everything else scrolls.

### Hazards
- Pillars (stalactites/stalagmites) spawn every 1.6-3.0 s after warmup. Random side, 60-300 px length capped to leave room.
- Cave wall collision at the heli's bounding box.

### Heli physics
- Gravity 1100 px/s² when not thrusting.
- Lift -1500 px/s² when holding.
- Velocity clamped to [-520, 700].
- Tilt = vy/600 (visual only).

### Pickups
- Coins ($-symbol) spawn occasionally inside the cave; +50 score each.
- Coins flatten to a thin spinning bar to fake rotation.

### Scoring
- Score = floor(distance / 4) + coinBonus.
- Coins ≈ score / 80.

### Visual / audio
- Cave walls have neon-cyan glow edges; pillars glow pink at the tip.
- Helicopter: yellow body, cyan window, tail, rotor blur.
- Exhaust trail particles colored amber when thrusting, gray when falling.
- Synth SFX: low rotor noise loop, bump, crash sawtooth, coin triangle.

## Implementation notes
- Same `BaseGame` contract as the retro pack.
- Both games need exactly two new `<script>` tags in `index.html` after `asteroids`.
- Check coin formula calibration empirically — both should yield ~3-10 coins per typical run.

## Bugs found in dev
- **Helicopter score went negative on Play Again.** The original implementation tracked
  per-frame distance score with a delta against `_lastDistScore`, but `_lastDistScore`
  was never reset in `init()`. After "Play Again" the previous run's value carried
  over and produced a large negative offset on every frame for the new round.
  Fix: replaced the delta-tracking with a simple `coinBonus` accumulator and
  `setScore(floor(distance / 4) + coinBonus)`.
