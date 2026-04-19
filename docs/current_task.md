# Current task — Site quality pass (4 phases)

**Plan:** `docs/plans/2026-04-19-selector-loader-pwa.md`

## Approved decisions
1. Tag vocabulary: 8-tag set as proposed (`retro / reflex / puzzle /
   tycoon / tower-defense / shooter / platformer / physics / narrative`).
2. Continue rail: **5** cards.
3. Default sort: **Recent**.
4. Version stamping: `npm run deploy` (stamps `manifest.json` with git
   short SHA, then `firebase deploy`).
5. PWA icons: fresh icon design.

## Progress

- [x] **Phase 1 — Repo hygiene** (shipped 2026-04-19)
  - 36 root PNGs → `docs/screenshots/`
  - Gitignore consolidated to `/*.png` + `firebase-debug*.log`
  - `firebase.json` ignore updated to `/*.png`
- [ ] **Phase 2 — Auto-discovery loader** (next)
  - `games/manifest.json` (one-time port from current `index.html`
    script-tag order)
  - `engine/loader.js` (chained-script injector with single
    `?v=<version>` cache-buster)
  - Slim `index.html` (`<script src="engine/loader.js"></script>` only)
  - `scripts/stamp-version.mjs` + `npm run deploy` glue
- [ ] **Phase 3 — Selector UX**
  - One-time pass: tag all 32 manifests
  - Search input + sort select + tag chips + URL hash state
  - Continue rail (top 5 by `lastPlayed`)
  - Keyboard nav (`/`, arrows, Enter, Esc)
  - IntersectionObserver + visibility throttling for previews
- [ ] **Phase 4 — PWA**
  - Fresh icon design (192 / 512 / 512-maskable from a 1024 source)
  - `manifest.webmanifest` + `<link>`/theme-color meta in `index.html`
  - Killswitch SW first (verify pipeline)
  - Versioned cache-first SW (engine + games), network-first for
    `index.html` + `games/manifest.json`
  - `beforeinstallprompt` install button (gated on first run)
  - `firebase.json` headers: `sw.js` no-cache, `manifest.webmanifest`
    1h cache

## Next action
Awaiting go-ahead before starting Phase 2 (auto-discovery loader).
That phase rewrites `index.html` end-to-end and is the highest-impact
single change in the plan, so a checkpoint here makes sense.
