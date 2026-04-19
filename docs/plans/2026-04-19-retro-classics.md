# Retro Classics Pack — Snake, Pong, Breakout, Asteroids

**Date:** 2026-04-19
**Type:** 4 quick retro arcade minigames for the NotDop collection.

## Why these four
- Universally recognized "Flash portal era" classics. Cards are instantly readable.
- Each occupies a distinct genre slot: grid (Snake), pad (Pong), brick-breaker (Breakout), vector-shoot (Asteroids).
- All implementable cleanly within the 60-second arcade format and the BaseGame contract.
- None overlap meaningfully with the existing 21 games.

## Snake
- 30×20 grid, snake moves on tick at ~9 cells/sec, accelerates by ~3% per apple.
- Apples spawn at random empty cell. Eat = +1 segment + 10 score.
- Death = wall hit or self-collision = game over.
- Controls: arrows / WASD. No reverse direction.
- Score = apples × 10 + survival bonus. Coins = score / 30.
- Visual: chunky neon snake on dark grid, glow trail, apples pulse.

## Pong
- Player paddle (left), CPU paddle (right) with imperfect tracking (configurable lag).
- Ball bounces off paddles + top/bottom walls; speed ramps each rally.
- Score = (player goals - cpu goals) clamped to 0; goal = +/- 1.
- Round ends at 60s OR when one side hits 11.
- Controls: mouse Y or W/S.
- Visual: classic two-line paddles + dotted center line, retro CRT scanlines and bloom on the ball.

## Breakout
- Paddle on bottom, single ball, brick grid at top (8 cols × 5 rows).
- Bricks have point values inversely proportional to their row (top = +50, bottom = +10).
- Ball reflection angle based on hit position on paddle.
- 3 lives. Lose ball below paddle = -1 life; out of lives = game over.
- Win condition: clear all bricks → big bonus + new wall (level loop).
- Controls: mouse X or A/D.
- Visual: chunky color rows of bricks, ball trail, paddle glow on hit, particle shatter on brick break.

## Asteroids
- Ship at center, rotates with A/D or arrows, thrust with W or up, fire with Space.
- Asteroids drift; each shot splits a large into 2 medium, medium into 2 small, small disappears.
- Wrap-around screen.
- Lose if hit by asteroid (single life, no respawn — keeps it 60s).
- Score per asteroid (large 20 / medium 50 / small 100).
- Controls: keyboard only (mouse-aim alt: ship faces mouse, click to fire).
- Visual: vector-line ship, glowing white outlines on asteroids, particle bursts on splits/destroy, exhaust trail.

## Implementation notes (shared)
- Each game lives in `games/<id>/` with `manifest.js` and `game.js`.
- Reuse `BaseGame.shake/flash/spark`, `Audio.beep` for SFX, `ParticleSystem` for FX.
- All games use 960×600 logical canvas.
- Wire into `index.html` after `reactor`.
- Update `docs/changelog.md` and tick `docs/roadmap.md`.
