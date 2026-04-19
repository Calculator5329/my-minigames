# Tech Spec

## Architecture
Three-layer separation, scoped to a vanilla-JS single-page arcade:

| Layer    | Code lives in        | Responsibility                                          |
|----------|----------------------|---------------------------------------------------------|
| UI       | `index.html`, `styles.css`, `main.js` | Selector grid, arcade view, shop, overlays, feedback modal. |
| Game     | `engine/`, `games/<id>/`              | Per-game state, update loop, render, input.  |
| Service  | `engine/storage.js`, `engine/audio.js`, `engine/assets.js`, `engine/firebase-config.js`, `engine/feedback.js` | LocalStorage, Web Audio, asset preloading, Firestore feedback inbox. |

Dependencies flow downward only:
- `main.js` → `engine/*` → no upward calls
- `games/<id>/game.js` extends `NDP.Engine.BaseGame`, may call `engine/*` services; never imports another game.

## Module loading
Static `<script>` tags in `index.html`. Order matters:
1. Engine scripts (storage, input, audio, draw, game, assets, sprites, firebase-config, feedback)
2. Per-game `manifest.js` → `game.js` (manifest registers metadata, game.js calls `NDP.attachGame(id, klass)`)
3. `main.js` last

## Hosting + Backend
- **Hosting:** Firebase Hosting (classic), site `notdop-minigames` in project
  `ethan-488900` (a multi-site project shared with 6 other apps). Public dir is
  the repo root; deploy ignores docs/scripts/screenshots/markdown. See
  `firebase.json` and `.firebaserc`.
- **Feedback inbox:** Firestore (default DB, native mode, `nam5`). Collection
  `feedback`, write-only from clients (max 2000 chars, server-stamped time).
  No auth — protection is via Firestore Rules (`firestore.rules` in repo root,
  manually merged into the project's published rules in the Console because the
  database is shared with other apps).
- **SDK delivery:** Firebase Web Compat SDK (`firebase-app-compat.js` +
  `firebase-firestore-compat.js`) lazy-loaded from gstatic on first feedback
  modal open, so it doesn't block the initial page paint of any game.

## Feedback service contract
`NDP.Engine.Feedback`:
- `submit(gameId, gameTitle, text) -> Promise<void>` — validates length,
  enforces a 5s per-tab throttle, lazy-initialises Firebase, writes one doc to
  `feedback/{auto-id}` with `{gameId, gameTitle, text, createdAt, userAgent, siteUrl}`.
  Rejects with a user-facing `Error` on validation failure or write rejection.
- `preload()` — kicks off SDK fetch in the background; called when the modal opens.
- `MAX_LEN` — exposed for the UI character counter.

## BaseGame contract
Every game extends `NDP.Engine.BaseGame` and implements:
- `init()` — set up state when the round begins
- `update(dt)` — advance simulation (engine halts when `state !== 'playing'`)
- `render(ctx)` — draw to the 960×600 logical canvas
- optional `onInput(ev)`, `coinsEarned(score)`

Provided by base:
- `score`, `time`, `state`, `particles`, `shake()`, `flash()`, `setHud()`, `gameOver()`, `win()`
- `makeSfx(palette)` returns an object with `play(name, overrides)` for synthesized SFX

## Game folder convention
```
games/<id>/
  manifest.js   — registers id, title, blurb, theme, previewDraw(ctx,t,w,h)
  game.js       — class extends BaseGame, calls NDP.attachGame
  [sprites.js]  — optional, declares procedural or asset-based sprite helpers
```

## Persistence (LocalStorage)
Managed by `engine/storage.js`:
- `coins`, `mute`, `activeTheme`, `themesUnlocked[]`
- `gameStats[id] = { hi, plays, lastPlayed }`

## Audio
Web Audio API, synthesized only (no asset files required).
- `Audio.beep({freq,type,dur,vol,slide,filter})` — single notes / noise bursts
- `Audio.startAmbient({freq,type,vol})` — looping pad with LFO; one slot
- Master gain muted via `Audio.setMuted` and persisted to storage.

## Input
`engine/input.js` exposes a global `Input` with:
- `keys[key|code]` — currently held
- `mouse: { x, y, down, justPressed, justReleased }` (canvas-space coords)
- `Input.endFrame()` — called by BaseGame at end of each `_step` to clear `just*` flags

## Per-game tycoon scoring (Reactor / Franchise)
Score = cumulative dollars earned over the round. Coin reward formula chosen per game:
- Franchise: `score / 1000`
- Reactor:   `score / 400`
Goal: a typical 60s run yields ~5–15 coins so a single theme (150–600 coins) takes 10–60 runs to unlock.

## Adding a new game (checklist)
1. `mkdir games/<id>`
2. `games/<id>/manifest.js` with `NDP.registerManifest({...})`
3. `games/<id>/game.js` with `class XGame extends BaseGame { ... } NDP.attachGame('<id>', XGame)`
4. Two `<script>` tags in `index.html` before `main.js`
5. (Optional) Design doc in `docs/plans/YYYY-MM-DD-<id>-design.md`
6. Append entry in `docs/changelog.md` and tick the box in `docs/roadmap.md`
