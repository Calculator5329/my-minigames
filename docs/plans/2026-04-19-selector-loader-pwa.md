# Selector UX + Loader + Repo Hygiene + PWA

**Date:** 2026-04-19
**Type:** Cross-cutting site-quality pass (no individual game work).
**Scope:** Roadmap items #1 (selector UX), #2 (repo hygiene), #3 (script-tag
loader), #10 (PWA / installability) from the 2026-04-19 review.

## Goals

Lift the *site* to match the quality of the *games*. Three measurable wins:

1. Finding a game in 32 takes one keystroke, not a scroll.
2. Adding a game stops requiring an `index.html` edit.
3. The site is installable, works offline after first visit, and stops
   shipping ~3 MB of dev screenshots in every clone.

## Non-goals

- No mobile/touch input pass (separate roadmap item, deferred).
- No accessibility audit beyond minimum `aria-label` additions on new UI
  controls.
- No build step / bundler. Static-and-hackable stays a hard constraint
  per the existing decision log.
- No game-side changes. Manifests get **one** new optional field (`tags`);
  everything else is opt-in.

## Phase ordering (low-risk first)

```
Phase 1: Repo hygiene       (safe, immediate, unblocks faster clones)
Phase 2: Loader manifest    (enables Phase 3 + 4 to use a single source of truth)
Phase 3: Selector UX        (depends on tags landing in manifests)
Phase 4: PWA + service worker (depends on loader for cache list)
```

Each phase is independently shippable and reversible.

---

## Phase 1 — Repo hygiene

### Current state
- ~25 PNG screenshots at the project root
  (`reactor-day1-v3.png`, `orbital-after-place.png`, etc.) — none referenced
  by the running site, all checked into git.
- `firebase-debug.log` and `firebase-debug.*.log` are checked in.
- `firebase.json` already excludes `*.png` and `*.md` from deploy, so
  deployed bundle is unaffected — this is purely a repo-weight win.

### Changes
1. `mkdir docs/screenshots/` and `git mv *.png docs/screenshots/` for the
   ~25 stray PNGs at root. (Verify none are referenced from `index.html`,
   `main.js`, manifests, or CSS first via a `rg "\.png"` sweep.)
2. Append to `.gitignore`:
   ```
   /*.png
   firebase-debug*.log
   .firebase/
   ```
   (root-only PNG ignore — game-folder PNGs, if any, stay tracked.)
3. Update `firebase.json` `ignore` list — remove redundant `*.png` since
   those PNGs no longer live at root; add `docs/screenshots/**` for safety.
4. Sanity-check `engine/assets.js` and every `manifest.assets` array — any
   game that *does* declare a PNG asset must keep its file inside its
   `games/<id>/` folder, not at root. (Spot-check found none currently
   reference root PNGs.)

### Verification
- `git status` clean.
- Hard-refresh the site locally; selector and all 32 game previews load.
- `firebase deploy --only hosting --dry-run` shows no PNGs in the upload
  manifest (as before).

### Risk
Trivial. Worst case: we re-add a ref to a moved PNG. Mitigated by the
pre-move `rg` sweep.

---

## Phase 2 — Auto-discovery loader

### Current state
`index.html` lines 53–170 are 110+ hand-maintained `<script>` tags with
ad-hoc `?v=2/3/6` cache-busters. Every new game = two more tags + an
`index.html` commit. Stale cache-busters silently serve old code.

### Changes

#### 2.1 Generated `games/manifest.json`
A single source of truth listing every game's load-order:

```json
{
  "version": "2026-04-19-abc123",
  "engine": [
    "engine/storage.js", "engine/input.js", "engine/audio.js",
    "engine/draw.js",    "engine/game.js",  "engine/assets.js",
    "engine/sprites.js"
  ],
  "games": [
    { "id": "snake",    "files": ["sprites.js", "manifest.js", "game.js"] },
    { "id": "orbital",  "files": [
        "sprites.js", "manifest.js",
        "lib/namespace.js", "lib/upgrades.js", "lib/xp.js", ...,
        "data/towers.js", "data/enemies.js", "data/rounds.js", "data/abilities.js",
        "ui/side-panel.js", "ui/recap.js",
        "game.js"
    ]}
  ]
}
```

- `version` is one global cache-buster, regenerated per deploy
  (a git short-sha works fine; written by a 5-line script).
- Per-game `files` are **relative to `games/<id>/`** so the JSON stays
  short and data-only.
- Hand-maintained for now (one-time conversion from `index.html`); a tiny
  `scripts/build-manifest.mjs` can regenerate it later if we want, but
  it's not required for v1.

#### 2.2 `engine/loader.js`
~40 lines. Synchronously injects scripts in declared order using a
chained-`<script>` pattern (each script's `onload` triggers the next).
Pseudo:

```js
async function boot() {
  const manifest = await fetch(`games/manifest.json?t=${Date.now()}`).then(r => r.json());
  const v = manifest.version;
  const tags = [
    ...manifest.engine.map(p => `${p}?v=${v}`),
    ...manifest.games.flatMap(g => g.files.map(f => `games/${g.id}/${f}?v=${v}`)),
    `main.js?v=${v}`
  ];
  for (const src of tags) await injectScript(src);
  document.dispatchEvent(new Event('ndp:ready'));
}
```

- Single `?v=<version>` everywhere. Stale-cache problem solved.
- Order preserved; no `defer`/`async` because games rely on sync
  `NDP.registerManifest` ordering.
- Errors in any script are caught and logged with the failing src so
  a typo'd path is obvious in console.

#### 2.3 New minimal `index.html`
Down from ~170 lines to ~50. Body keeps the selector / arcade / shop
DOM; `<script>` block becomes a single tag:

```html
<script src="engine/loader.js"></script>
```

#### 2.4 Storing the global version
For local dev, `manifest.json` ships a placeholder version
(`"dev-<timestamp>"`). For deploy, a one-line npm script
(`scripts/stamp-version.mjs`) rewrites `manifest.json`'s `version` field
with `git rev-parse --short HEAD` before `firebase deploy`. Tiny
`package.json` script: `"deploy": "node scripts/stamp-version.mjs && firebase deploy"`.

### Verification
- Page loads, selector populates with all 32 games, each card preview
  animates.
- DevTools Network panel shows every JS file fetched with
  `?v=<sha>` query.
- Forcing a syntax error in one game's file shows a clear error in
  console naming the file.
- All games in the regression list (Orbital, Sand, Reactor, Switchboard,
  Learn-to-Heist — i.e. the multi-file complex ones) start and play
  correctly.

### Risk
Medium. Risks and mitigations:
- **Script ordering bugs.** Mitigated by porting the existing `index.html`
  order verbatim into `manifest.json` as a first pass — no ordering
  changes during this phase.
- **`?v=` stripped by Firebase rewrites.** Verified `firebase.json` has
  no rewrites; query strings pass through.
- **Local `file://` fetch of `manifest.json`.** Falls back to a
  `<script>`-tag-injected `games/manifest.js` (same data wrapped in
  `NDP.bootManifest = {...}`) if `fetch` is blocked. Cheap dual-format.

### Rollback
Keep the old `index.html` as `index.legacy.html` for one deploy cycle.

---

## Phase 3 — Selector UX

### Current state
- 32 cards in a single auto-fill grid, click-only.
- Every card's `previewDraw` runs every frame, even off-screen, even
  hidden tab.
- No way to filter, sort, or jump back to a recent game.

### Changes

#### 3.1 Manifest extension — `tags`
Add one optional field per manifest:

```js
NDP.registerManifest({
  id: 'snake',
  ...,
  tags: ['retro', 'reflex']     // NEW
});
```

Tag vocabulary (closed set, ~8 tags total):
`retro`, `reflex`, `puzzle`, `tycoon`, `tower-defense`, `shooter`,
`platformer`, `physics`, `narrative`.

One-time PR: tag all 32 existing manifests. Untagged games default to
`['arcade']` and still appear in "All".

#### 3.2 Selector chrome (in `index.html` + `styles.css`)
New row above the grid:

```
[ search input          ]   Sort: [ Recent v ]   [ All ] [Retro] [Tycoon] ...
```

- Search: case-insensitive substring match against `title + blurb`.
- Sort options: `Recent` (lastPlayed desc, unplayed last), `Most Played`
  (plays desc), `Highest Score` (hi desc), `A→Z`, `Random` (re-rolls
  on each click).
- Tag chips: single-select; `All` is the default.
- All filter/sort state lives in `URL` hash (e.g.
  `#/?q=snake&sort=plays&tag=retro`) so reloads + deep links work.

#### 3.3 "Continue" rail
Above the main grid, render a row of up to 3 most-recently-played games
(Storage already tracks `lastPlayed`). Hidden if no plays yet (new users
see the full grid immediately, no empty rail).

```
Continue playing
[ Orbital ]  [ Reactor ]  [ Snake ]
─────────────────────────────────
All games (32)
[ ... full filtered grid ... ]
```

Cards in the rail reuse the existing `.card` styles, just smaller
(180×135 instead of 240×180).

#### 3.4 Keyboard navigation
- `/` — focus the search box (industry convention).
- `Arrow keys` — move focus between visible cards (grid-aware, wraps
  within rows).
- `Enter` — open focused card.
- `Esc` — clear search; if search empty, return focus to grid.

Implemented via a small `selector-keys.js` (lives in `engine/` or
inlined in `main.js`). Adds a `.card.is-focused` class with a thicker
accent border so focus is visible.

#### 3.5 Preview throttling (CPU win)
Two changes in `main.js`'s `tickPreviews` / `startPreviewLoop`:

1. `IntersectionObserver` on each card. Only cards with `isIntersecting`
   tick. Cards scrolled off-screen freeze on their last frame.
2. `document.addEventListener('visibilitychange', ...)` — call
   `stopPreviewLoop()` when `document.hidden`, restart on focus.
3. (Optional, low-risk) Cap preview frame rate to 30 fps. Most preview
   animations are smooth at 30; halves CPU again. Implemented by
   tracking accumulated dt and only redrawing when ≥ 33 ms.

Net effect: from 32 canvases × 60 Hz unconditionally → ~6 visible
canvases × 30 Hz when scrolled, 0 Hz when tab is hidden.

#### 3.6 Accessibility minimums (free with this work)
- Search input gets `aria-label="Filter games"`.
- Tag chips become `<button role="tab" aria-pressed="...">`.
- Sort `<select>` gets a visible label + `aria-label`.
- Each card gets `role="button" tabindex="0" aria-label="Play <title>"`.
- Keyboard focus ring is visible (currently suppressed via
  `user-select: none` on body, fine to keep, but cards need a clear
  focused state — added in #3.4).

### Verification
- Filter to `tycoon`, type "rea" → only Reactor and Franchise visible.
- Sort by `Most Played`, play Snake 5 times, refresh → Snake leads the
  Continue rail and the grid.
- Hash `#/?q=orbital` survives reload.
- Tab off-screen for 60 s → CPU usage in DevTools Performance drops to
  ~0%.
- Tab a focus through the entire selector with keyboard only.

### Risk
Low. UI-only changes, no game contract changes. The `tags` migration
is mechanical.

---

## Phase 4 — PWA / installability

### Current state
- Vanilla static site on Firebase Hosting. No `manifest.webmanifest`,
  no service worker.
- `index.html` already declares `Cache-Control: no-cache, no-store,
  must-revalidate` so HTML is always fresh.

### Changes

#### 4.1 Web app manifest (`manifest.webmanifest`)
```json
{
  "name": "NotDop Minigames",
  "short_name": "NotDop",
  "description": "32 hand-built browser arcade minigames.",
  "start_url": "/",
  "display": "standalone",
  "orientation": "any",
  "background_color": "#0e1116",
  "theme_color": "#ffcc33",
  "icons": [
    { "src": "assets/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "assets/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "assets/icons/icon-mask.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- Three icons: 192, 512, 512-maskable. Generated once from the existing
  `NOTDOP` logo styling — keep a single 1024×1024 source SVG in
  `assets/icons/source.svg` and rasterise.
- Linked from `index.html`:
  `<link rel="manifest" href="manifest.webmanifest">`
  `<meta name="theme-color" content="#ffcc33">`

#### 4.2 Service worker (`sw.js`)
~80 lines. Strategy:

| Request type           | Strategy           |
|------------------------|--------------------|
| `/index.html` (root)   | Network-first, fall back to cache |
| `engine/*`, `games/*`, `main.js` | Cache-first, revalidate in background |
| `games/manifest.json`  | Network-first |
| `assets/icons/*`       | Cache-first |
| Everything else        | Network only (no caching) |

Cache name embeds the loader's `version`:
```js
const VERSION = 'ndp-2026-04-19-abc123';
const CACHE = `${VERSION}-static`;
```

On `activate`, delete any cache name not equal to `CACHE`. This makes
deploys atomically replace the offline bundle without stale-asset
nightmares.

Registration in `engine/loader.js` after boot:
```js
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}
```

Disabled on `localhost` to avoid dev-cycle pain (or scoped to
`https://notdop-minigames.web.app/`).

#### 4.3 Offline fallback
On first visit, after `ndp:ready` fires, the loader posts the file list
to the SW which warms the cache (`event.waitUntil(cache.addAll(...))`).
Second visit works fully offline.

`index.html` gets a tiny "you're offline" banner element that the SW
can populate when a fetch fails — graceful, not intrusive.

#### 4.4 Install prompt
Listen for `beforeinstallprompt`, stash the event, surface a small
"Install" button in the top bar after the user has played at least one
game (track via `Storage.recordRun`). Avoids the spammy first-load
prompt that everyone hates.

#### 4.5 Hosting headers
Update `firebase.json`:
- `/sw.js` → `Cache-Control: no-cache, no-store, must-revalidate`
  (SW must always be fresh or you can't ship updates).
- `/manifest.webmanifest` → `Cache-Control: public, max-age=3600`.

### Verification
- Lighthouse "Installable" check passes.
- DevTools → Application → Manifest shows all icons + theme color.
- Application → Service Workers shows registered SW, scope `/`.
- Toggle "Offline" in DevTools, reload → site loads, all 32 cards
  animate, can launch any game (gameplay only fails if it makes
  network calls — none do today).
- After bumping `version` and redeploying, old SW cache is purged on
  next visit.

### Risk
Medium-high if mishandled (a buggy SW can permanently brick the site
in someone's browser). Mitigations:

1. Ship a "kill-switch" SW first as a separate tiny PR — an `sw.js`
   that immediately `self.skipWaiting()` and unregisters. Verify the
   pipeline works before adding caching logic.
2. Always include the unregister logic in any future SW so we can
   recover.
3. Keep `localhost` exempt from registration.

### Rollback
Replace `sw.js` with a 4-line unregister-and-clear-caches version, redeploy.

---

## Documentation updates (Completion Phase per project rules)

After each phase ships:
- Tick the corresponding box in `docs/roadmap.md`.
- Append a `## YYYY-MM-DD` entry to `docs/changelog.md` summarising what
  shipped and any decisions made.
- Update `docs/tech_spec.md`:
  - Add "Module loading" section pointing at `engine/loader.js` +
    `games/manifest.json` (replacing the current static-script-tag
    description).
  - Add a "PWA / offline" section describing the SW versioning scheme.
  - Note the new optional `tags` manifest field in the BaseGame contract.

---

## Open questions for approval

1. **Tag vocabulary** — confirm the 8-tag set
   (`retro / reflex / puzzle / tycoon / tower-defense / shooter /
   platformer / physics / narrative`) or trim/extend.
2. **Continue rail size** — 3 cards or 5?
3. **Default sort** — "Recent" (familiar to returning players) or
   "Random" (encourages discovery of the long tail)?
4. **Version stamping** — comfortable with adding a one-line
   `package.json` `deploy` script, or keep deploy fully manual and
   stamp via a copy-paste command in the README?
5. **PWA icons** — happy to generate from the existing `NOTDOP` logo
   styling, or want a fresh icon design pass?

Awaiting answers before Phase 1 starts.
