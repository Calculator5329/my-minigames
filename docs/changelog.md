# Changelog

A running log of what shipped in each session.

## 2026-04-19

### Site quality pass — Phase 1: repo hygiene
Plan: `docs/plans/2026-04-19-selector-loader-pwa.md`. Phase 1 of 4
(hygiene → loader → selector → PWA).

- Moved 36 stray dev screenshots (~8.6 MB) from the repo root into
  `docs/screenshots/`. Verified zero references from `index.html`,
  `main.js`, `styles.css`, or any `manifest.assets` array — these were
  pure dev artifacts that bloated every clone with no runtime use.
- Consolidated the per-game gitignore stanzas
  (`reactor-*.png`, `bloom-*.png`, `diner-*.png`, `frog-*.png`,
  `frogger-*.png`, `sigil-*.png`) into a single `/*.png` rule that
  catches future strays at root without affecting tracked PNGs under
  `games/<id>/` or `assets/`. Added `firebase-debug*.log` ignore.
- Updated `firebase.json` ignore from `*.png` to `/*.png` (root-only,
  matches new gitignore semantics). `docs/**` already excludes the
  new screenshot dir from deploy.
- Two PNGs that *were* tracked (`lth-boost-test.png`, `lth-flight.png`)
  show as renames into `docs/screenshots/` in the next commit. Net
  history change is one rename + one ignore rule.

### Orbital — two-column shop, BTD4-style tower unlocks, two new towers, beefier upgrade overlays
User feedback: "Lets continue improving orbital, maybe the towers menu should
have two columns so it doesnt go off screen, and there should be more towers
that are disabled until I unlock them just like in the original BTD4 and I
don't know what to buy to see the hidden ones and we need more towers and we
need more detail and cool graphics for all the upgrades."

Six things shipped:

1. **Two-column tower shop** — `games/orbital/ui/side-panel.js`
   `_drawTowerList` now renders the catalog as a 2-column grid of compact
   tiles (`tileW`/`tileH`/`gap` with scroll clamp + a right-edge scroll
   indicator). Each tile gets a left-edge color band keyed to the tower's
   path A accent for fast visual scan. Replaced `_drawTowerRow` with
   `_drawTowerTile`, updated hit-testing accordingly. Tooltip box bumped
   220×86 to fit the new locked-tower copy.

2. **Round-gated unlock system** — `games/orbital/data/towers.js`
   Every tower got an `unlock: { round: N }` property. Schedule is set
   so the player meets a new toy roughly every 2–4 rounds:
   Dart/Cannon R1, Gravity R2, Beam R4, Tesla R5, Cryo R6, Flare R7,
   Sniper R8, Support R10, **Mortar R11**, Missile R12, Quant R14,
   Engineer R16, **Crystal R17**, Chrono R19, Singularity R22.
   Public API now exports `unlockRound(k)` and `isUnlocked(k, bestRound)`.

3. **Persistent best-round + locked-tower UX** — `games/orbital/lib/persist.js`
   + `games/orbital/game.js`. Added `recordRoundClear(round)` /
   `getBestRound()` and wired them into `init()` and `onRoundClear()`.
   In `side-panel.js`, locked towers render with a dimmed sprite, a lock
   glyph, and `R<unlockRound>` text; tooltip says "Locked: clear round X
   to unlock." Both the buy-click and the hotkey selection paths in
   `game.js` short-circuit on `isTowerUnlocked(key) === false` and
   surface a flash message so the player knows why nothing happened.

4. **Unlock toast** — `games/orbital/game.js`. After `onRoundClear` we diff
   the new bestRound against `prevBest` and, if any towers crossed their
   unlock threshold, set `this.unlockToast = { names, t: 4 }`. The toast
   is decremented in `update(dt)` and rendered as a banner at the top of
   the play area in `render(ctx)`, plus a `flashMessage` for redundancy.

5. **Two new towers — Mortar (R11) and Crystal (R17)**
   - `games/orbital/data/towers.js`: full base stats + 2 upgrade paths each.
     Both reuse the existing gun-tower update path (no new mechanics
     required, keeps the surface area small).
   - `games/orbital/sprites.js`: added `S.turret_mortar` and
     `S.turret_crystal` SVGs.
   - `games/orbital/manifest.js`: registered `orb_turret_mortar` and
     `orb_turret_crystal` so the loader picks them up.
   - `games/orbital/game.js`: `_updateTower()` switch now branches both
     keys to `_updateGunTower`.

6. **Beefier upgrade overlays** — `games/orbital/lib/overlay.js`
   `drawPathOverlay` now reads as a clear progression instead of "small
   dot → bigger dot":
   - **T1**: glowing accent dot (with `shadowBlur`) at the top of the
     chassis, off-set left for path A, right for path B.
   - **T2**: thin ring around the chassis + a small badge plate on the
     side carrying tier-pip count (1 pip at T2, 2 at T3, 3 at T4) so a
     glance tells you the build at a distance.
   - **T3**: path A draws three nested chevron spikes along the firing
     axis with glow; path B draws a 4-point cardinal star. Both add a
     thicker pulsing outer ring and an orbiting plate (with a faint
     trailing dot) circling the chassis.
   - **T4**: handed off to `drawTier4Aura`, which now layers a pulsing
     glow disc, an 8-spoke rotating blade ring, a counter-rotating
     dashed outer ring, three orbiting energy beads, and the crowning
     glyph (path A: lance with energy line down the shaft; path B:
     faceted floating gem with crown points and sparkle cross).
   This keeps the per-tower SVG count flat (still ~one sprite per
   tower) while making the four upgrade tiers visually distinct.

### Reactor — meltdown transparency pass
User feedback: "Reactor is great but I keep dying on day 2 and I don't have
any good info as to why." Day 2 silently introduces investor visits and the
"Risky Loan" card auto-picks after 6s, dumping +30 heat with no explanation.
The recap previously just said `MELTDOWN · Day N` with stats — never WHY.

Fixed by surfacing the information at every layer:

- `games/reactor/game.js`: added a per-day heat event log (ring buffer of
  `{t, source, label, amount, after%}`), `peakHeatPct`, and `deathCause`
  state. Every heat-changing path now logs (vent path here, others in
  `events.js`). Sustained-high-throttle is logged as a single rolling entry
  so the post-mortem can show "High throttle 6.2s → 121%". `_diagnoseMeltdown()`
  scans the last 6s of the log, picks the dominant heat source, and
  produces an actionable one-liner with a tip per source. Reset on
  `_beginNextDay`.
- `games/reactor/game.js` — `_drawGauges`: heat dial now shows a labelled
  red `MAX` tick at 100% AND a red `MELTDOWN` tick at the actual hard cap
  for the current day, plus `cap N` printed under the digit so the player
  always knows where the fail line sits.
- `games/reactor/game.js` — `_drawCriticalBanner`: full-width pulsing red
  banner whenever `heat > maxHeat` showing live `% / cap %` plus the
  actionable text "PRESS SPACE TO VENT · drop throttle below 30%" (or
  the vent cooldown countdown if it's not ready).
- `games/reactor/game.js` — `_drawDayIntro` + `_dayIntroFor(day)`: 6-second
  fading banner at the start of every day listing the headline mechanic
  introduced that day (e.g. "DAY 2 — Investor visits begin. RISKY LOAN
  gives cash but adds heat.") so day-to-day surprises are at least
  named once.
- `games/reactor/events.js`: `impactMeteor`, `triggerSurge`, and the
  `risky_loan` investor card now call `game._logHeat(...)` with the
  source/label/amount. Risky Loan is also flagged `danger: true` so the
  investor overlay paints it with a thick red border + "DANGER · ADDS
  HEAT" ribbon. Both auto-pick paths (in `events.js#updateInvestor` and
  `game.js#_updateInvestor`) now skip danger cards and pick the first
  safe one — idle players are no longer silently killed by the auto-pick.
- `games/reactor/campaign.js`: `buildRecap` now passes through `cause`,
  `heatLog` (last 6 entries), and `peakHeatPct`. `drawRecap` adds a
  red **CAUSE OF DEATH** banner above stats on meltdowns (sized to fit
  the left column so it doesn't collide with the research panel) and
  a **LAST HEAT EVENTS** mini-list showing `t=Ns Source +N heat → N%`
  so the player can see exactly what stacked into the meltdown.
- `index.html`: bumped reactor script `?v=` from 4 → 6 to bust the
  browser cache.

Verified end-to-end with a Playwright session: forced a Risky Loan
meltdown and saw the recap render
`Risky Loan added +30 heat in 6s (peak 200% / cap 132%). Skip Risky Loan
when heat is already > 60%.`; forced a sustained-throttle meltdown and
got `Heat ran away from sustained high throttle (peak 132%). Lower
throttle sooner, or build a Coolant Loop.` In-play, the CRITICAL banner,
labelled MAX/MELTDOWN ticks, and DANGER ribbon all render correctly.



### Barrage — anti-spam pass: per-wave ammo + fire cooldown
Spam-clicking trivialized barrage: clicks created bursts instantly with no
ammo and no cooldown, so a player could carpet the screen and clear any wave
without aiming. Tightened it to classic Missile Command economy.

- `games/barrage/game.js`: added `FIRE_CD = 0.32s` base fire cooldown and a
  per-wave ammo budget (`_waveAmmo(n) = 10 + n*2 + ammoUpg*6`), refilled on
  `_startWave()`. Click handler now branches into three cases — empty (red
  flash + dry-fire blip), throttled (soft tick, no burst), or armed (consume
  one ammo, set `fireCd`, spawn burst). Crosshair shifts color (yellow / grey
  while reloading / red when empty), shows a sweeping cooldown ring, and
  prints `NO AMMO` when out. HUD adds `Ammo n/max` with low-ammo coloring.
- New shop perks: **Extra Magazines** (+6 ammo/wave, stacks 3, 50c) and
  **Faster Trigger** (-40% fire cooldown, 1×, 60c). Existing perks unchanged.

### Per-game wallet migration — COMPLETE (all 24 games)
Capstone entry. Followed up the Vaultbreaker pilot with a full sweep:
every game with an in-game economy now has its own isolated, persistent
wallet. The shared `Storage.coins` pool is reserved exclusively for the
global theme shop in `main.js`. Five parallel migration batches covered
every game; per-batch detail is in the entries below.

Coverage:

| Status | Games |
|---|---|
| Migrated to per-game wallet | bloom, barrage, tanks, diner, sigil, bulwark, depths, learntoheist, orbital, reactor, franchise, crypt, snake, helicopter, frogger, breakout, asteroids, starfall, stargazer, leap, ricochet, gullet, skybound (+ vaultbreaker, the pilot) |
| Don't-touch (no in-game shop / score-only) | pong, deflect, switchboard, sand |

Cross-cutting wins:
- Zero `Storage.spendCoins` / `Storage.getCoins` calls remain anywhere
  under `games/*` for in-game purposes (verified by grep).
- Every game's `coinsEarned()` is now milestone-based (waves / biomes /
  floors / chapters / matches / days / cities cleared this run + a
  victory bonus). No more pickup-inflated score leaking into the global
  theme pool.
- Three games (`bulwark`, `depths`, `learntoheist`) migrated off custom
  `localStorage` keys onto `Storage.setGameData` + `Storage.*GameWallet`,
  with one-shot legacy readers so existing players keep their progress.
- Wallet APIs (`getGameWallet`, `addGameWallet`, `spendGameWallet`,
  `setGameWallet`, `clearGameData`) are smoke-tested for isolation:
  per-game wallets don't bleed into each other or into global coins.
- All 28 game files (+ engine) parse cleanly.

Recipe + checklist lives in `docs/plans/2026-04-19-currency-migration.md`
for any future game.

### Per-game wallet migration — bulwark, depths, learntoheist (legacy-localStorage batch)
Followed `docs/plans/2026-04-19-currency-migration.md` (esp. step 5) to lift
the last three games whose persistence still lived in raw `localStorage` keys
into the shared `NDP.Engine.Storage` per-game wallet pattern. Each game now
runs the legacy reader exactly once: it only fires when
`Storage.getGameData(GID)` is empty, copies forward both the meta blob and
any in-game currency, then `localStorage.removeItem(OLD_KEY)`. `coinsEarned()`
is milestone-based in all three (no more `floor(score/N)` or `floor(gold/100)`
formulas leaking the wallet into the global theme pool), and `victoryAchieved`
is set BEFORE the engine handoff so the win-bonus actually pays out. All three
default to NG+/persistent — wallets, unlocks, and goal/tier progress are
untouched on victory.

- `games/learntoheist/content.js`: rewrote `LTH.loadSave` / `LTH.writeSave` /
  `LTH.resetSave` / `LTH.buyNextTier`. Wallet is now
  `Storage.*GameWallet('learntoheist')`; everything else (tiers, goalsDone,
  bests, totalLaunches, stageIdx, bossBeaten) lives in
  `Storage.setGameData('learntoheist', {...})`. Workshop purchases route
  through `Storage.spendGameWallet` and mirror the new balance back into
  `save.coins` for HUD code. New `LTH._migrateLegacy()` lifts the old
  `'ndp.lth_v1'` blob forward then removes it.
- `games/learntoheist/game.js`: `init()` adds `victoryAchieved`,
  `goalsCompletedThisRun`, `_endTriggered`. `_endRun()` increments the goal
  counter as goals clear and flags `victoryAchieved` on `bossPunched`, but
  defers the engine handoff to `_updateReport()` so the in-game report
  screen still shows. On dismiss, the report calls `this.win()` (or
  `gameOver()`) FIRST so `coinsEarned()` can still read the run's
  milestones, then `_reset()` wipes per-run state. `coinsEarned()` is
  `goalsCompletedThisRun * 5 + (victory ? 25 : 0)` (was the BaseGame
  default `floor(score/25)`, which always returned 0 since LTH never
  scored).
- `games/bulwark/game.js`: rewrote `loadMeta` / `saveMeta` and added
  `migrateLegacy`. `meta.ash` is now mirrored to
  `Storage.*GameWallet('bulwark')`; `meta.unlocks` and `meta.lastRun` go
  into `Storage.setGameData('bulwark', {...})`. The legacy `'bulwark_v1'`
  blob is read once then removed. `init()` adds `victoryAchieved`,
  `battlesCleared`, `actsCleared`, `_endTriggered` (also reset on New
  Run / Resume). `finishBattle(false)` now calls `gameOver()` after
  saving; `returnToMapOrNextAct()` recognizes the act-3 boss clear,
  bumps `actsCleared`, sets `victoryAchieved = true`, calls `win()`,
  and clears `lastRun`. `coinsEarned()` is
  `battlesCleared * 1 + actsCleared * 5 + (victory ? 25 : 0)` (was
  `floor(score/400)`, where `score` was inflated by in-run gold + ash).
- `games/depths/game.js`: doesn't extend BaseGame, so plumbed Storage
  manually via new `_storage()` / `_migrateLegacy()` / `_bankGold()` /
  `_drawGold()` helpers. `_loadScore` / `_saveScore` now persist the
  hi-score via `Storage.mergeGameData('depths', { hiscore })`; the
  legacy `'depths_hiscore'` key is migrated once then removed.
  `player.gold` now persists between runs through
  `Storage.*GameWallet('depths')`: `_drawGold()` seeds `_newRun()` from
  the wallet (NG+), and `_bankGold()` fires on every `_descend()`,
  every `_die()`, and on victory so a crash mid-run still preserves
  most of the player's coffers. `_newRun()` resets `victoryAchieved`,
  `floorsClearedThisRun`, `_endTriggered`, and `state = 'playing'`.
  `_descend()` increments the floor counter; victory and `_die()` set
  `this.state = 'won'` / `'over'` (depths never reported these to
  main.js before, so the engine end overlay literally never showed).
  `coinsEarned()` is now `floorsClearedThisRun * 4 + (victory ? 25 : 0)`
  (was `(floor-1)*2 + level + floor(gold/100)` on death, or
  `60 + level*5 + floor(gold/50)` on victory — both leaked wallet gold
  into the global pool).

All four files syntax-clean (`new Function(fs.readFileSync(...))` round-trip).

### Feedback inbox (Firestore)
Players can now send free-text feedback per game from the in-arcade topbar.

- **`engine/firebase-config.js`** — public Web SDK config for the
  `notdop-minigames` Firebase web app under project `ethan-488900` (apiKey,
  projectId, etc. are NOT secrets; they identify the project to the browser).
- **`engine/feedback.js`** — `NDP.Engine.Feedback.submit(gameId, gameTitle, text)`.
  Lazy-loads the Firebase Web Compat SDK from gstatic on first use (so the
  initial page load and every game's update loop are unaffected when nobody
  clicks the button), writes one doc to the `feedback` collection with
  `{gameId, gameTitle, text, createdAt: serverTimestamp, userAgent, siteUrl}`,
  enforces a 5s per-tab throttle and 1..2000 char length client-side. Real
  enforcement is in the rules (see below).
- **UI** — new `💬 Feedback` button in `index.html`'s arcade topbar opens a
  themed modal (textarea + char counter + send button + status line). Modal is
  styled in `styles.css` (`.modal-backdrop`, `.modal-card`, etc.) and wired in
  `main.js` (`openFeedback`, `sendFeedback`, Esc/click-outside to close,
  Ctrl/Cmd+Enter to send). The modal pulls the active game's `manifest.id` and
  `manifest.title` so each submission knows which game it's about.
- **`firestore.rules`** — committed to the repo for documentation, NOT
  auto-deployed. Allows `create` only on `feedback/{id}` with strict shape
  validation (exact field set, type checks, length caps, server-assigned
  timestamp). Reads/updates/deletes denied — owner reads via Console. The
  default database is shared with other apps in `ethan-488900`, so these need
  to be MERGED into the existing published rules manually rather than
  blanket-deployed.
- **Web app + DB setup** — created Firebase web app `notdop-minigames` (App ID
  `1:108003293186:web:3ec0dab1f9f93408164f1b`) via the CLI. Default Firestore
  DB already existed (native mode, `nam5`).

### Public hosting + GitHub repo
The project is now version-controlled and live on the public web.

- **GitHub:** pushed to https://github.com/Calculator5329/my-minigames (initial
  commit, `main` branch). Added `.gitignore` covering `node_modules/`,
  `.firebase/`, dev/IDE folders (`.claude/`, `.playwright-mcp/`, `.vscode/`),
  and the per-game debug screenshots that were sitting in the repo root
  (`reactor-*.png`, `bloom-*.png`, `diner-*.png`, `frog*-*.png`, `sigil-*.png`).
- **Firebase Hosting:** deployed to a new dedicated site `notdop-minigames`
  (live at https://notdop-minigames.web.app) under existing project
  `ethan-488900`. The site is its own slot in that project's multi-site setup,
  so the other apps living there (`stackbrawl`, `deep-rift`, `history-explorer`,
  `space-trader`, `tax-explorer-app`, `ethan-488900`) are untouched.
- **`firebase.json`** — `public: "."` (no build step; the project really is just
  static `index.html` + `main.js` + `styles.css` + `games/**`), with `ignore`
  rules that strip docs, scripts, root-level PNG screenshots, `*.md`, and any
  package manifests from the deployed bundle. Caching headers tuned per asset
  class: `index.html` is `no-cache`, JS/CSS get a 1-hour `must-revalidate`
  (these change every session), and images/audio get a 1-day cache.
- **`.firebaserc`** — default project alias `ethan-488900`.

### Per-game wallet migration — starfall, stargazer, leap, ricochet, gullet, skybound (arcade batch)
Followed `docs/plans/2026-04-19-currency-migration.md` for the six remaining
arcade-style games whose pre-run upgrade shops were still spending the global
theme coin pool. All six now use `Storage.*GameWallet(GID, …)` end-to-end:
the in-game shop reads + spends the per-game wallet, the shop UI shows the
wallet balance under the game's flavour name, and `coinsEarned()` is now
milestone-based (driven by an in-run counter + a `victoryAchieved` flag set
in `init()`) instead of a `floor(score/N)` divisor that leaked pickup spam
into the global pool. Each `gameOver()` / pre-`win()` path now routes through
a small `_awardWallet()` helper that calls `Storage.addGameWallet(GID, award)`
exactly once. All six default to NG+/persistent — wallets and meta-progression
in `setGameData` are untouched on victory.

- `games/starfall/game.js` — wallet `'starfall'` (Stardust). `wavesClearedThisRun`
  ticks on `this.wave++`; shop UI shows `Stardust: ●N` and uses
  `spendGameWallet`. `coinsEarned()` is now
  `wavesClearedThisRun * 2 + (victory ? 20 : 0)` (was `floor(score/80)`).
- `games/stargazer/game.js` — wallet `'stargazer'` (Lensgleam). Same
  wave-cleared accounting; `_awardWallet()` is wired into all three
  end-of-run sites. `coinsEarned()` is
  `wavesClearedThisRun * 2 + (victory ? 20 : 0)` (was `floor(score/200)`).
- `games/leap/game.js` — wallet `'leap'` (Sprigs). `levelsClearedThisRun++`
  fires when `this.completed = true`; wallet awarded on lives-out
  `gameOver()`. `coinsEarned()` is
  `levelsClearedThisRun * 3 + (victory ? 20 : 0)` (was `floor(score/50)`,
  which double-counted gem pickups).
- `games/ricochet/game.js` — wallet `'ricochet'` (Ricochets). Per-level wins
  bump `levelsClearedThisRun`; campaign clear (`level > maxLevel`) sets
  `victoryAchieved` and awards before the win-fanfare timeout. New
  `coinsEarned()` is `levelsClearedThisRun + (victory ? 25 : 0)` (replaces
  the old `floor(levelsCleared/2) - floor(misses/4)` global formula; shop
  no longer spends from the global pool).
- `games/gullet/game.js` — wallet `'gullet'` (Gore). `biomesClearedThisRun`
  ticks each time `this.biomeIdx` advances on a score threshold. The third
  biome is `scoreTo: Infinity`, so `victoryAchieved` legitimately stays
  false — the formula handles it. `coinsEarned()` is
  `biomesClearedThisRun * 6 + (victory ? 20 : 0)` (was `floor(score/60)`).
- `games/skybound/game.js` — wallet `'skybound'` (Updrafts).
  `biomesClearedThisRun` increments on `currentBiome` advancement; reaching
  2500m sets `victoryAchieved` and counts the final biome as cleared too.
  Shop UI/spend swapped to wallet. `coinsEarned()` is
  `biomesClearedThisRun * 5 + (victory ? 20 : 0)` (was `floor(score/25)`,
  which inflated heavily off pickups).

All six syntax-clean. No legacy migrator needed (none of these games stored
currency in a `setGameData` blob — they were all pulling straight from the
global `Storage.coins`, which now stays reserved for the main theme shop).

### Per-game wallet migration — crypt, snake, helicopter, frogger, breakout, asteroids
Sixth pass through `docs/plans/2026-04-19-currency-migration.md` cleaning
up the remaining arcade/campaign games whose between-stage shops still
spent global theme coins. Pattern is identical across all six: the old
`score / N` `coinsEarned()` formula moved into `onEnd()` and now funds
the per-game wallet (`Storage.*GameWallet(GID)`); the new `coinsEarned()`
is milestone-based (units cleared this run + victory bonus); shop UI
shows the per-game balance instead of `Storage.getCoins()`. Existing
meta-progression (`bestX`, `perks`, `defeated*` flags) stays in
`Storage.setGameData`. NG+/persistent — no `clearGameData` on victory.

- `games/crypt/game.js`: wallet `'crypt'`. `init()` adds
  `floorsClearedThisRun` + `victoryAchieved`. Counter increments at the
  stairs descent and on boss kill; `victoryAchieved` set just before
  the deferred `this.win()`. Shop check + spend (`_updateShop`) and
  `_renderShop` header swapped to `getGameWallet/spendGameWallet`. New
  `onEnd` deposits `floor(score / 75)` into the crypt wallet so loot
  chests/kills still translate to upgrade money. New `coinsEarned()`:
  `floorsClearedThisRun * 2 + (victory ? 20 : 0)` (was `score / 75`).
- `games/snake/game.js`: wallet `'snake'`. `init()` adds
  `biomesClearedThisRun` + `victoryAchieved`. Counter increments inside
  `_defeatWorm` after the boss falls; `victoryAchieved` set in
  `_updateVictory` before `this.win()`. Commissary
  (`_updateShop`/`_renderShop`) swapped to `getGameWallet`/
  `spendGameWallet`, header reads "Snake purse: ●N". `onEnd` keeps
  funding the wallet at `floor(score / 35)` so apple score still buys
  perks. New `coinsEarned()`: `biomesClearedThisRun * 6 + (victory ? 20 : 0)`.
- `games/helicopter/game.js`: wallet `'helicopter'`. `init()` adds
  `biomesClearedThisRun` + `victoryAchieved`. `_defeatBoss` increments
  the counter; `_updateVictory` flips `victoryAchieved` before
  `this.win()`. Hangar shop (`_updateShop`/`_renderShop`) spends
  `getGameWallet('helicopter')` / `spendGameWallet`. `onEnd` deposits
  `floor(score / 220)` into the wallet (the in-run `coinBonus`/`distance`
  economy still funds upgrades). New `coinsEarned()`:
  `biomesClearedThisRun * 6 + (victory ? 20 : 0)`.
- `games/frogger/game.js`: wallet `'frogger'`. `init()` adds
  `daysCompletedThisRun` + `victoryAchieved`. `_updatePlay` increments
  the counter when `dayPadsFilled >= day.target`; the hawk-victory path
  in `_updateBossLogic` increments and sets `victoryAchieved` together.
  Marsh shop (`_updateShop`/`_renderShop`) swapped to
  `getGameWallet`/`spendGameWallet`, header reads "Marsh purse: ●N".
  `onEnd` deposits `floor(score / 50)` into the wallet. New
  `coinsEarned()`: `daysCompletedThisRun * 4 + (victory ? 20 : 0)`.
- `games/breakout/game.js`: wallet `'breakout'`. `init()` adds
  `worldsClearedThisRun` + `victoryAchieved`. `_updClear` increments
  the counter on each world transition (including the world-5 → boss
  jump, so a full clear yields 5 increments + 20 victory bonus).
  `_updVictory` sets `victoryAchieved` before `this.win()`. Perk shop
  (`_updShop`/`_renderShop`) reads/spends the wallet, header label
  "Brick fund: ●N". `onEnd` deposits `floor(score / 120)` into the
  wallet. New `coinsEarned()`:
  `worldsClearedThisRun * 5 + (victory ? 20 : 0)`.
- `games/asteroids/game.js`: wallet `'asteroids'`. The two existing
  per-wave / per-boss `Storage.addCoins` payouts (5 + 2*wave for normal
  clears, 30/60 for the bosses) flipped to
  `Storage.addGameWallet('asteroids', ...)`. Upgrade Bay
  (`_updateShop`/`_renderShop`) spends `spendGameWallet`. HUD now reads
  "Bay ●N" via `getGameWallet`. `init()` adds `wavesClearedThisRun` +
  `victoryAchieved`; counter increments on both normal wave clear and
  boss defeat (so kills of Swarm Lord / Hive Queen close out waves 5/10).
  Hive defeat sets `victoryAchieved = true`. New `coinsEarned()`:
  `wavesClearedThisRun * 1 + (victory ? 20 : 0)` (was hard-coded `0`),
  so global theme coins finally trickle out of asteroid runs without
  double-dipping the in-game economy.

### Per-game wallet migration — orbital, reactor, franchise (econ-sim trio)
Followed `docs/plans/2026-04-19-currency-migration.md` for the three
remaining economic-simulation games. These were trickier than the
arcade-style batch because each one generates currency from gameplay
loops (rounds, days, autobuyers) rather than pickups, so the wallet had
to be wired without disrupting the in-run economy. `cash` stays
run-volatile in all three; only meta-currency moved to the wallet.

- `games/orbital/game.js` + `games/orbital/lib/persist.js`: in-round
  `cash` (used to buy/upgrade towers) is unchanged. Stardust — the
  meta-currency the side-panel HUD already renders for Phase 4 — now
  lives in `Storage.*GameWallet('orbital')`. `lib/persist.js` got a
  one-shot legacy reader that lifts any pre-existing `data.stardust`
  field into the wallet on first load and strips it from the data blob.
  Round-clear deposits +1 stardust; victory deposits +25 (in addition to
  global theme coins). Engine destructure picked up `Storage`. New
  `coinsEarned()`: `roundsClearedThisRun + (victory ? 25 : 0)` (was
  `floor(score / 40)`, which leaked bounty * 5 into global coins).
  `runStardust` is seeded from the wallet in `init()` so the HUD shows
  the persistent total even before the first round.
- `games/reactor/research.js` + `games/reactor/game.js`: `cash` /
  `totalEarned` stay in-run. RP (research points) moved out of
  `mergeGameData('reactor', { research: { points } })` and into
  `Storage.*GameWallet('reactor')`. One-shot legacy reader in
  `migrateLegacy()` lifts the old `research.points` value into the
  wallet on first access and writes the data blob back without that
  field. `award()` calls `addGameWallet`; `buy()` calls
  `spendGameWallet`; `getState().points` reads the wallet so all
  existing UI (recap "+N RP" line, RP-available header, day-end HUD)
  works unchanged. `_endDay()` increments `daysCompletedThisRun` and
  sets `victoryAchieved` on `campaign_complete`. New `coinsEarned()`:
  `daysCompletedThisRun * 4 + (victory ? 25 : 0)` (was
  `floor(score / 400)` where score = totalEarned, dollars-leaking).
  `bought` / `bestDay` / `campaignsBeaten` / `endlessUnlocked` still
  live in `gameData` via `setGameData`.
- `games/franchise/game.js`: `cash` and net-worth state stay in-run.
  Stardollars moved out of `this.save.stardollars` and into
  `Storage.*GameWallet('franchise')`. One-shot legacy reader in
  `init()` checks `this.save.stardollars > 0` after the data-blob load,
  pours it into the wallet, zeroes the blob field, and writes back.
  `endCampaign()` deposits `F.stardollarsFor(peakNetWorth)` into the
  wallet instead of the save blob. Meta-shop spend (`_updateShop`)
  now goes through `spendGameWallet`. `_renderShop` reads the wallet
  via a new `_stardollars()` accessor for both the header and per-card
  affordability checks. `endCity('win')` increments
  `citiesClearedThisRun`; `endCampaign(true)` increments
  `campaignsWonThisRun` and sets `victoryAchieved`. New
  `coinsEarned()`: `citiesClearedThisRun * 5 + campaignsWonThisRun * 25`
  (was `floor(score / 5000)` against peak net worth — indirectly leaked
  the autobuyer economy into the global pool).

All three games default to NG+/persistent (no wipe-on-victory). Save
compatibility preserved via legacy migrators on reactor + franchise;
orbital persist.js also lifts any pre-existing data-blob stardust into
the wallet. All five edited files pass
`node -e "new Function(require('fs').readFileSync('<path>','utf8'))"`.

### Per-game wallet migration — bloom, barrage, tanks, diner, sigil
Followed `docs/plans/2026-04-19-currency-migration.md`. Five more games
moved off the global theme-coin pool and onto namespaced per-game
wallets (`Storage.*GameWallet(GAME_ID, ...)`). All five now earn theme
coins from milestone counters, not pickup-inflated `score / N` formulas.

- `games/bloom/game.js`: `runCoins` now seeded from
  `getGameWallet('bloom')` and persisted on every mote pickup, boss
  kill, biome advance, death, and shop transaction. Removed
  `Storage.addCoins(this.runCoins)` from the post-run shop's continue
  button (was leaking motes into the global pool). Shop spends via
  `spendGameWallet`. Killing The Maw in the Void biome now sets
  `victoryAchieved = true` and calls `this.win()` (previously the run
  just sat in 'biomeUp' with no terminator). New `coinsEarned()`:
  `biomesClearedThisRun * 8 + (victory ? 25 : 0)`.
- `games/barrage/game.js`: `coinsHeld` seeded from
  `getGameWallet('barrage')`; persisted at every wave end and on city
  loss. Shop's `_buy` spends via `spendGameWallet`. Tracks
  `wavesClearedThisRun`, sets `victoryAchieved` before the win timeout.
  New `coinsEarned()`: `waves * 3 + (victory ? 20 : 0)`.
- `games/tanks/game.js`: `coinsHeld` seeded from
  `getGameWallet('tanks')`; persisted on match win and game over. Shop
  weapon purchases spend via `spendGameWallet`. Tracks
  `matchesWonThisRun`, sets `victoryAchieved` before final `win()`.
  New `coinsEarned()`: `matches * 4 + (victory ? 20 : 0)`.
- `games/diner/game.js`: removed broken `NDP.Engine.Storage.coins` /
  `Storage.save()` direct-mutation calls (no such API). The kitchen
  shop now reads `getGameWallet('diner')` and spends via
  `spendGameWallet`. Each day's `dayTips` is banked into the wallet at
  day-end so the player has tips to spend in the next sanctum visit.
  Tracks `daysCompletedThisRun`; the critic-day clear sets
  `victoryAchieved` before the victory splash. New `coinsEarned()`:
  `days * 5 + (victory ? 25 : 0)`.
- `games/sigil/game.js`: removed broken `NDP.Engine.Storage.coins` /
  `Storage.save()` calls. Sanctum reads `getGameWallet('sigil')` and
  spends via `spendGameWallet`. `_defeatBoss` deposits
  `60 + ch.n * 40` essence into the wallet so chapter clears feed the
  perk shop directly. Tracks `chaptersClearedThisRun`; clearing the
  Dragon (last chapter) sets `victoryAchieved` before `this.win()`.
  New `coinsEarned()`: `chapters * 8 + (victory ? 25 : 0)`.

All five files pass `node -e "new Function(...)"` syntax checks. Meta
state (best wave / best biome / unlocked weapons / unlocked glyphs /
stations / perks / best chapter / best day) preserved; only currency
plumbing changed. Default-to-NG+ (no wipe-on-victory) for all five —
matches plan guidance for non-vaultbreaker games.



### Franchise Frenzy — multi-city campaign expansion
User feedback: "Franchise frenzy only has one 60s level lets immprove it."
Followed the pattern that landed for Reactor earlier today — turn the
single 60-second shift into a 5-city campaign with persistent
meta-progression, in-run depth, and new content. See full design in
`docs/plans/2026-04-19-franchise-expansion.md`.

- `games/franchise/data.js` (NEW): catalog file. 10 business tiers
  (3 new — Casino at city 3, Movie Studio at city 4, Spaceport at
  city 5), 5 cities (Smalltown → Skyport, exponential targets
  $5K → $40M), 5 random events (Rush Hour, Viral Moment, Tax Audit,
  Investor Knock, Power Outage), 5 meta upgrades (Seed Capital,
  Click Force, Industry Boost, Tycoon Time, Headhunter), synergy
  curve (×1.25 / ×2 / ×4 at 10/25/50 owned), manager + Stardollar
  formulas. Pure data — no canvas, no engine refs. Published as
  `window.NDP.Franchise`.
- `games/franchise/game.js`: full rewrite. State machine now has four
  phases — `shop` → `play` → `transition` → `debrief`. Pre-campaign
  shop UI shows progress strip, Stardollar count, all 5 meta upgrade
  cards with current/next effect labels, and a BEGIN CAMPAIGN button.
  Play loop owns the per-city run: cash and businesses persist across
  cities; per-city net-worth target with checkmark indicator; tier
  reveal gated by both cash threshold *and* `unlockCity`; manager
  hire flow (button → click target tier card to assign; auto-buyer
  on a 0.6 s cadence); event scheduler that fires N events per city
  with banner + countdown bar + colored vignette overlay; floating
  green envelope for the Investor event with 5 s click window;
  city-5 boss panel ("Hostile Takeover") that replaces the flagship
  for 15 s and forces the player to choose between earning cash or
  hammering the OUTBID button. Debrief screen shows campaign
  summary, awards Stardollars, offers SPEND STARDOLLARS (back to
  shop) or FINISH RUN (kicks the global end overlay so coins are
  awarded). Per-city background tint via `CITIES[i].bg`. Shop card
  layout grew from 2×4 to 2×5 to fit all 10 tiers; locked tiers
  show "unlocks <CityName>" instead of a generic "??? LOCKED ???".
  Coin formula recalibrated (`floor(score / 5000)`) since net worth
  now ranges into the millions.
- `games/franchise/manifest.js`: blurb + description + controls
  rewritten for the campaign. Manifest preview unchanged.
- `index.html`: load `games/franchise/data.js` between manifest and
  game.js; cache-bust all three with `?v=2`.
- Tested in browser: shop renders → BEGIN CAMPAIGN → city 1 plays →
  flagship clicks earn cash → buying lemonade ticks $/s → end of
  city → debrief on miss / transition on win → city 2 unlocks
  manager button, casino still gated to Boomburg → cash + tiers
  carry over across cities.

### Learn to Heist — Booster fix (was useless at base tier)
User reported "the booster doesn't work at all". Root cause: tier 0
"Firecracker" thrust was **480 m/s²** while gravity is **520 m/s²**, so
even pointing the rocket straight up and holding SPACE the player still
*fell* (~31 m lost over 1 second of full burn, verified in-engine).
Combined with a fast 0.22/s fuel burn that drained the 1.2-unit tank in
~5 seconds, the booster was a net negative on flight time at the
starting tier. Fixed across data + simulation + visuals.

- `games/learntoheist/content.js` `UPGRADES.booster.tiers`:
  - **Thrust ladder rebalanced** so even tier 0 comfortably overcomes
    gravity. Was `480/620/780/980/1240/1520`, now
    `900/1120/1380/1700/2050/2500`. Tier 0 now climbs at ~+380 m/s²
    pointed straight up (was -40, i.e. fell).
  - **Fuel tanks bumped** so the booster lasts long enough to feel
    powerful: `1.2/2.0/3.2/4.6/6.2/9.0` → `1.6/2.4/3.4/4.8/6.4/9.0`.
  - Description updated: "Even tier 0 beats gravity."
- `games/learntoheist/game.js` `_updateFlight()` booster block:
  - **Engagement kick.** First frame of a press now adds an
    instantaneous `thrust × 0.04` impulse along the nose plus a small
    screen-shake, so the rocket *fires* instead of ramps. `_wasBoosting`
    flag tracks press edges.
  - **Fuel burn slowed** `0.22/s → 0.16/s`. Combined with the bigger
    starter tank, base tier now boosts for ~10 seconds before going dry
    (was ~5).
  - **Boost loop SFX throttled** to one beep per ~90 ms via a
    `_boostSfxT` countdown. The old `(boosterT % 0.05) < dt` test
    fired basically every frame at 60 fps and sounded like a buzzsaw.
  - **Thicker trail** — 3 particles per frame across orange/red/yellow
    with a thrust-direction component baked in, so the plume streams
    *out the back* of the nose rather than just trailing the body.
- `games/learntoheist/game.js` `_drawVehicle()` booster flame:
  - 4-layer flame (outer red plume → orange → yellow core → white-hot
    tip) instead of the old 2-layer triangle, with a slower flicker
    period (`Date.now() * 0.025` was `0.06`) so the flame is actually
    legible at 60 fps. Plume length scales with booster tier.
- `index.html`: `?v=2` cache-buster on the four `learntoheist/*.js`
  script tags so the browser picks up the rebalance.
- `main.js`: exposed `NDP._activeGame` (read-only) for in-browser
  verification of game state during dev/testing.

Verification: reloaded the game with a fresh save, set the player to
y=300 / vy=0 / angle=−π/2 (straight up), held SPACE for 1 second.
Result: vy 0 → +441 m/s, altitude 300 → 532 (gained **+232 m**).
Pre-fix the same test produced -60 m/s, -31 m altitude.

### Tanks — Slingshot aiming (anchor anywhere, pull back to fire)
Previous fix had switched to "drag toward target" so the firing direction
matched the drag, but the player tank lives at x=80 and reaching max power
still required dragging hundreds of pixels right *from the tank* — which
combined with the tank's left-edge spawn meant cramped, awkward aiming and
could push the cursor off-canvas in scaled viewports. The user wanted the
opposite: be able to **start the click on the right side of the screen**
and pull *left* to launch a powerful shot to the right.

- `games/tanks/game.js` `updatePlayer()`: rewritten to true Angry Birds-
  style slingshot.
  - On `mousedown`, store an **anchor** at the click position (anywhere on
    canvas — independent of the tank's location).
  - While dragging, compute pull = `anchor − currentMouse`. Power scales
    with pull length (`L * 3.0`, capped at 700). Firing angle = direction
    of the pull vector (i.e. opposite of the drag direction).
  - On release: if pull was below a small dead zone (power < 80), cancel
    silently with a "Pull farther to fire" hint instead of misfiring.
  - State cleared on release so each turn starts fresh.
- `games/tanks/game.js` `render()`: draws the slingshot rubber-band — a
  dashed line from anchor to current mouse, anchor dot stays gold, drag dot
  goes gold once you've pulled past the dead zone. The trajectory preview
  from the tank still shows the predicted arc using `aim.angle`.
- Updated turn hint: `CLICK & PULL BACK (slingshot), RELEASE TO FIRE`.
- `games/tanks/manifest.js`: description and controls updated to describe
  slingshot aiming and weapon hotkeys.
- `index.html`: bumped tanks scripts to `?v=3` to bust browser cache.

### Currency model — per-game persistent wallets, victory wipes Vaultbreaker
Established a hard separation between **per-game** currency (stays inside one
game, persists across runs of that game, used for that game's meta-shop) and
the **global** theme-shop coins (earned by *playing* games but not coupled to
in-game economies). Vaultbreaker is the first game converted to the new
pattern; same shape can be applied to Reactor / Diner / Orbital later.

- `engine/storage.js`:
  - Added `getGameWallet(id)`, `addGameWallet(id, n)`, `spendGameWallet(id, n)`,
    `setGameWallet(id, n)` — per-game persistent currency, namespaced by game
    id, stored alongside but separate from `data` blob and global `coins`.
  - Added `clearGameData(id)` — wipes a game's `data` and `wallet` while
    preserving `hi`/`plays` so selector cards still show high score after a
    "completion reset".

- `games/vaultbreaker/game.js`:
  - **Coins persist between runs.** `coinsHeld` is now part of the
    vaultbreaker save blob; `_loadSave`/`_writeSave` round-trip it.
    `init()` seeds `coinsHeld` from save instead of zero, so dying at
    Vault 4 with 80 coins banked means your *next* run starts with 80.
    Save is checkpointed when entering each intermission so a refresh
    mid-shop doesn't lose pickups.
  - **Victory = clean slate.** `_persistOnEnd(true)` now calls
    `Storage.clearGameData('vaultbreaker')` and resets the in-memory save
    mirror to defaults. Beating the campaign wipes weapons, tiers, max
    HP, magnet tier, and the persistent coin wallet — the next heist
    starts from the pistol. The reset *is* the trophy.
  - **Global theme coins decoupled.** `coinsEarned()` no longer derives
    from in-run `score` (which was inflated by per-coin pickups, leaking
    in-game economy into the shared wallet). New formula: `4 ×
    levelsClearedThisRun + 20 if victoryAchieved`. Worst case full
    clear ≈ 44 theme coins (vs old ~280), much more honest against
    150-600 cost themes.
  - Intro card on Vault 1 surfaces "Bank: ● N coins from last run" so
    players see their persistent wallet.
  - Victory card explicitly tells the player the vault wipes itself
    behind them so the next-run reset isn't a surprise.

### Crypt — Fixed "stuck on floor 2" spawn-trap bug
User reported being unable to move on floor 2. Root cause: `buildRoom()` placed
pillars at random tile positions in rows `[3, rows-4]` × cols `[3, cols-4]`,
which overlaps the hero spawn cell (col ~3, row ~rows/2). When a pillar landed
on the hero's spawn tile, every move was rolled back by `hitsWall()` because
the hero was already inside a non-floor tile, locking the player in place. The
bug existed on every floor; floor 2 just crossed the pillar-count threshold
(3 pillars vs floor 1's 2) where it became frequent enough to notice.

- `games/crypt/game.js`:
  - Pillar placement now skips a reserved zone around the hero spawn corridor
    (cols ≤ 4, ±2 rows of mid) and the stairs corridor (cols ≥ cols-4,
    ±2 rows of mid). Tries up to 20 random positions before giving up on a
    pillar rather than ever blocking spawn or exit.
  - Safety net: after building the room, if the hero's hitbox still overlaps
    a non-floor tile, scan outward in concentric rings from the spawn cell
    for the nearest clear tile and warp the hero there. Guarantees movement
    is never locked, regardless of future map-gen changes.

### Orbital — Expansion Phases 1 + 2 shipped (BTD4-style depth pass)
Executed phases 1 + 2 of the expansion plan (`docs/plans/2026-04-19-orbital-expansion.md`).
Orbital's single 1.7K-line `game.js` was split into a thin orchestrator plus
14 module files under `data/`, `lib/`, `ui/`, all attached to a new
`NDP.Orbital` namespace. The play area was narrowed to `W − 240` so a
persistent BTD4-style right-rail panel can hold the prominent stats strip,
tower shop, and a full upgrade tree on the selected tower — replacing the
old transient popup + bottom tray. All 10 existing towers gained dual 4-tier
upgrade paths with a path-cap rule (only one path past T2), 4 new towers
shipped (Sniper, Engineer, Cryo, Chrono), 6 new enemy modifiers (camo, lead,
fortified, swift, armored, regen), 28 active abilities reachable via the
upgrade tree (`Q`/`E` hotkeys for path A/B), tower XP with three levels,
targeting priorities (First/Last/Strong/Close), a 50-round campaign across
five named acts, an end-of-round recap with no-leak streak + combo bonuses,
and a Stardust meta currency persisted across runs. Quant interest +
bounty-aura economy from the previous session is now wired through the new
`lib/economy.js`. Tier upgrades are reflected on the tower sprite at runtime
via programmatic overlays drawn by `lib/overlay.js` (per-path accents, dots,
rings, spikes, crowns, auras, plus XP pips), so the canvas mirrors the
upgrade state without per-tier sprite art. Smoke-tested in the browser:
modules attach cleanly, Round 1 plays out, side panel shows live stats,
Dart placement + Tier-1 Path A buy correctly bumps RPS 3.2 → 4.6, deducts
$200, updates the refund value, and adds the orange path-A marker on the
tower sprite. Two small bugs fixed during the smoke test: `Rounds.actFor(0)`
fell through to the last act ("Act V — Final Stand" in the pre-first-wave
display); clamped the lookup to `max(1, round)` and the panel now shows
"1/50 · Act I — First Contact" while idle.

- **New file layout (all IIFEs publishing onto `NDP.Orbital`):**
  - `games/orbital/lib/namespace.js` — bootstraps `NDP.Orbital` with null
    placeholders so module load order is forgiving.
  - `games/orbital/lib/upgrades.js` — dual-path purchase rules, path-cap
    enforcement, `rebuildStats(tower)` from base + bought-tier patches,
    refund value, `newPlacedTower(key, x, y, t)`.
  - `games/orbital/lib/xp.js` — `THRESHOLDS = [10, 30, 75]`, `levelOf`,
    `statMul(level)` for level 1/2/3 passive bonuses, `grant(tower, n)`.
  - `games/orbital/lib/targeting.js` — First/Last/Strong/Close priority
    functions + cycle helper for the TGT button and `T` hotkey.
  - `games/orbital/lib/economy.js` — `roundBonusBreakdown(game)` (base +
    no-leak streak + combo kicker), `applyInterest(game)` (Quant tower
    interest on cash reserves at wave start, with diminishing returns when
    multiple Quants are placed), `applyBountyAura(...)`, `stardustFromScore`.
  - `games/orbital/lib/persist.js` — load/save run records and Stardust via
    `Storage.getGameData('orbital')`.
  - `games/orbital/lib/enemy-mods.js` — registry + `applyAll`/`tickAll`/
    `drawAll`/`damageMul`/`bountyMul`/`isVisibleTo` for camo, lead,
    fortified, swift, armored, regen.
  - `games/orbital/lib/overlay.js` — `drawTierOverlay(ctx, tower)` adds
    per-path accents (orange Path A, blue Path B; dots → rings → spikes →
    crowns/auras as tier climbs) plus XP chevron pips. Also draws the small
    `GLYPHS` (rate / dmg / range / pierce / splash / burn / etc.) used in
    the upgrade-tree icons.
  - `games/orbital/data/towers.js` — catalog for all 14 towers; each has
    `base` stats + `paths.A`/`paths.B` with 4 tiers; each tier carries a
    `cost`, `label`, `desc`, stat `patch`, glyph id, and optional `ability`.
  - `games/orbital/data/abilities.js` — 28 active abilities with `cd`,
    `glyph`, `color`, `activate`, optional `tick` and `multiplier`.
  - `games/orbital/data/enemies.js` — `swarmer`, `ast`, `drone`, `bigast`,
    `summoner`, `ufo`, `boss`, `titan`. Re-uses existing `orb_meteor_*` and
    `orb_elite` sprites where possible; adds `orb_enemy_swarmer` +
    `orb_enemy_summoner`.
  - `games/orbital/data/rounds.js` — 50 rounds across 5 acts with metadata
    for the recap banner: I First Contact, II Hidden Threats, III Heavy
    Assault, IV Escalation, V Final Stand. Hand-tuned R1-R30, formulaic
    R31-R50, with mid-bosses at R30/R45 and a mega-boss at R50.
  - `games/orbital/ui/side-panel.js` — 240px-wide right rail. Sections:
    big stats strip (CASH huge / LIVES + STARDUST / ROUND + act subtitle),
    wave controls (START WAVE button + 1×/2× toggle), tower buy list with
    hotkey hints, on selection a full per-tower view (stats line, two path
    rows of 4 tier glyph buttons each with state coloring + path-cap lock,
    tooltip on hover, TGT button, SELL refund). Click hit-testing routes to
    `game.tryBuyTier`, `game.sellSelected`, `game.fireAbility`, etc.
  - `games/orbital/ui/recap.js` — round-end banner showing base + streak +
    combo bonus and total cash gained; "PERFECT WAVE" banner when no leaks.
- **`games/orbital/sprites.js`** — added 4 tower SVGs (sniper, engineer,
  cryo, chrono) and 2 enemy SVGs (swarmer, summoner). `manifest.js` got the
  matching `orb_turret_*` / `orb_enemy_*` registrations.
- **`games/orbital/game.js`** — rewritten as a slim orchestrator that
  consumes `NDP.Orbital`. Real-time `dt` is split into `rdt` (UI/input) and
  `sdt` (simulation, scaled by `gameSpeed`) so the 2× toggle from the prior
  session interoperates cleanly with the new round/recap timing. Tower
  update is generic (recoil, XP, ability cooldowns/ticks) and dispatches
  to per-archetype `_update*` methods that read from the patched stats
  block (`st.multiShot`, `st.capacitor`, `st.focusBuildup`, `st.stunPulse`,
  `st.lance`, `st.bossDmg`, `st.mortar`, etc.). Damage application goes
  through `EnemyMods.damageMul` so lead/armored/fortified gating happens
  in one place. Combo + no-leak streak are counted live and consumed by
  the recap. Enemy splits, summoner spawns, and all FX (tesla arcs,
  support pulses, beams, flare lances, mine blooms, projectile homing,
  freeze, brittle, fragmentation, splash) are reimplemented over the new
  data shape.
- **`index.html`** — wired all 14 new scripts in dependency order with
  `?v=3` cache buster on every `games/orbital/*.js`.

### Orbital — Expansion plan drafted
Sized up a full BTD5/BTD6-tier expansion for Orbital with the focus on tower
depth (the user's stated headline: "vastly improved and more depth added,
especially around towers and upgrades"). Plan structured into four
independently-shippable phases.

- `docs/plans/2026-04-19-orbital-expansion.md` (new) — full design doc:
  pillars, file/namespace split (`game.js` → `data/`, `lib/`, `ui/`
  subfolders + `NDP.Orbital` namespace), two-path upgrade data shape,
  path-cap rule (only one path past T2), 80 upgrade nodes catalogued
  across the 10 existing towers, ~20 active abilities with hotkeys
  (`Q`/`E` proposed for path A/B), tower XP/level system with chevron
  pips, targeting priorities (First/Last/Strong/Close), round-end recap
  with no-leak streak multiplier, Stardust meta currency, Phase 2 content
  (4 new towers + 5 new enemy mods + 50 rounds), Phase 3 maps + difficulty
  (3 new map geometries + Hard/Apocalypse), Phase 4 heroes + meta
  (3 heroes, Star Charts tree, endless, daily, sandbox), acceptance
  criteria for Phase 1, risk register, effort estimate (~12-18 days for
  full vision).
- `docs/roadmap.md`: linked the plan under cross-cutting goals.

### Reactor — 10-day campaign, research tree, 5 new modules, 4 new events
The original 60-second tycoon (user feedback: "I just beat the game on day 60")
is now a 10-day campaign (each day is one 60-second shift) with persistent
meta-progression. Cash + modules carry between days, difficulty escalates per
day, and Research Points unlock permanent run-start buffs.

- **New file split.** Reactor is now five files instead of one. Each is an IIFE
  that publishes onto `NDP.Reactor`:
  - `games/reactor/modules.js` — module catalog (11 modules), cost growth,
    derived-stat recompute, glyph drawing.
  - `games/reactor/events.js` — meteor / flare / leak / investor / aurora /
    surge / quake catalog, in-flight meteor list, laser interception, comet
    shower (boss event), investor card overlay.
  - `games/reactor/research.js` — 10-node research tree, persistent state via
    `Storage.mergeGameData('reactor', { research })`, research panel UI.
  - `games/reactor/campaign.js` — day state machine, recap UI, daily-objective
    pool (8 objectives, 3 random per day), per-day difficulty knobs.
  - `games/reactor/game.js` — shrunk to orchestrator (1100 lines): main loop,
    throttle/vent/HUD/cards UI, day flow, glue between the four sub-modules.
- **5 new modules.** Solar Array (heat-free $/s), Containment Laser (chance to
  vaporize incoming meteors per level), Helium Pump (rewards 20-60% throttle
  stability with growing income mult, capped +50% per pump), Worker Habitat
  (+1 worker, +5% income mult per habitat — also spawns a roaming astronaut),
  Black Box Backup (one-time meltdown revive, consumed on use).
- **4 new events.** Investor Visit (modal overlay, pick 1 of 8 cards: cash
  burst, free modules, risky loan, overclock, etc. — auto-picks first card
  after 6s; gameplay paused while open). Aurora (+50% income & cooling for 5s).
  Reactor Surge (+50 heat instant, +200% income for 4s — risk/reward). Lunar
  Quake (random module damaged unless shielded). Day 5 + Day 10 fire scripted
  Comet Showers (10/14 meteors over 8/10s).
- **Persistent research tree.** 10 nodes, 1-3 RP each, total ~18 RP to fully
  unlock. Earn +1 RP per day survived plus +1 RP per daily objective passed
  (~13 RP per perfect 10-day run). Nodes affect run-start state: Subsidies
  (+$200 start), Reinforced Dome (+20 max heat), Quick Vent (3s → 2s cooldown),
  Better Optics (longer meteor warning life), Helium Bonus (×1.10 base mult),
  Insulation (+30% passive cooling), Veteran Crew (free Mining Rig at start),
  Stockpile (+20 max coolant, start 80), Auto-Trader (+1%/s mult while
  throttle <50%, cap +30%), Galactic Investor (+$1K every $50K total earned).
- **Per-day difficulty curve.** Meteor cadence shrinks 14-18s (day 1) → 3-9s
  (day 10). Flare and leak cadences scale similarly. Max heat ceiling drops
  from 100 (day 1) to 84 (day 10). Days 7+ can spawn meteor bursts.
- **3 random daily objectives.** Pool of 8 (earn $X, survive Y meteors, don't
  vent, buy 2+ modules, never exceed 90% heat, end day with $Y banked, own 4+
  distinct module types, hold throttle ≥30% for 30s total). Tracked live via
  `dayStats` and shown checked/unchecked on the recap.
- **Recap screen.** Drawn inside the canvas (not the engine's HTML overlay) so
  the campaign can continue uninterrupted between days. Shows day stats,
  objective results, RP earned breakdown ("N day + M obj"), and the full
  research panel for spend-on-the-spot upgrades. Buttons: NEXT DAY (continue),
  NEW CAMPAIGN (hand off to engine for "Play Again"), ENDLESS MODE (after
  campaign complete).
- **Endless mode.** Unlocks after first campaign clear. Continues past day 10
  with rising difficulty; comet shower every 5 days.
- **Internal mode state.** Engine `state` stays `'playing'` for the whole
  campaign. The new `mode` field ('playing' | 'investor' | 'recap') gates
  which update path runs. `gameOver()`/`win()` only fire when the player
  chooses NEW CAMPAIGN from a meltdown/campaign-complete recap.
- **HUD.** Now shows `DAY N/10  ·  Time  ·  Heat%  ·  $/s  ·  Cash  ·  RP`,
  with a thin sky-blue progress bar across the top of the canvas tracking
  day completion.
- **Module pod layout.** Reorganized to 11 positions in a fan around the
  reactor (was 6).
- **Right-side cards.** Compressed card height 50→40 px to fit all 11
  modules in the same panel without scrolling.
- **Earth-rise.** Earth in the sky slowly rises across the campaign, marking
  visible day progression.
- **Save schema.** Reactor's data lives under
  `Storage.getGameData('reactor').research` so older saves are forward-safe.
- `index.html`: 6 reactor script tags with `?v=4` cache buster.
- `docs/plans/2026-04-19-reactor-expansion.md`: design doc describing all of
  the above before implementation.

### Orbital — Quant rework + 2× speed toggle
Quant Advisor was a money fountain: dropped a tower anywhere and it printed
$10/sec (26/sec upgraded) plus a flat $40/$120 dividend at every wave start.
Independent of placement, kills, or play. Effectively a "win the economy"
button. Reworked into a placement- and play-coupled tool, and added the
fast-forward QoL pass that BTD-style games need.

- `games/orbital/game.js` TOWERS.quant: removed `incomePerSec` and
  `roundBonus`. New fields: `range: 130/170`, `bountyMult: 0.35/0.85`,
  `interestRate: 0.04/0.08`, `interestCap: 40/120`. Quant now has an aura.
- Bounty aura: any enemy popped inside a Quant's range pays
  `floor(bounty × (1 + mult))`. The bonus floats up as `+$N` so the player
  sees where the value is coming from. Multiple Quants stack with diminishing
  returns — the strongest applies fully, each extra contributes 50%.
- Wave-start interest replaces the flat dividend: `floor(cash × rate)` capped
  at `interestCap` per Quant. Same diminishing-stack rule. Encourages saving
  without snowballing or making cash spent on towers feel "wasted".
- Quant added to symmetric (non-rotating) tower list since it's pure aura.
- Stat-popup lines updated: `+35% BOUNTY in range 130` /
  `4% INTEREST/wave (max $40)`.
- `gameSpeed` field with a 1× ↔ 2× toggle. Only the world-sim dt is scaled
  (enemies, projectiles, towers, slow/burn/regen, wave spawn timing). Real
  time still drives input, message/floater fade, and shake/flash so the UI
  doesn't feel choppy.
- New `drawSpeedBtn` next to START WAVE; F-key edge-triggered toggle with the
  same latch pattern as SPACE. HUD shows `Speed 2×` in gold while active.
- Floater system (`spawnFloater` + `drawFloaters`) for transient on-canvas
  callouts; currently used for the bounty bonus, easy to extend to crit/burn
  feedback later.
- `games/orbital/manifest.js`: controls hint mentions the F fast-forward.
- `index.html`: `?v=2` cache buster on `games/orbital/game.js`.

### Tanks — Real enemy AI (was effectively firing off-screen)
The old `updateEnemy()` computed `Math.PI + Math.atan2(dy - 80, dx)` with
`dx ≈ -800`. That collapses to roughly `0 rad` — meaning the enemy was
firing **right and slightly down** off the canvas, every turn. Power was
also a hand-tuned `200 + dist*0.7` constant that ignored wind, gravity,
terrain, and the actual shell's `gravMul`/`windMul`.

- `games/tanks/game.js`: replaced `updateEnemy` with a brute-force aim
  solver (`_solveEnemyAim` + `_simulateShot`) that samples angles in
  `(π, 3π/2)` × power `200..700`, runs the real projectile physics
  (gravity, wind, terrain), and picks the trajectory with the smallest
  closest-approach distance to the player tank.
- The simulator includes a "muzzle armed" grace so launches that graze the
  enemy's own terrain don't disqualify themselves.
- Difficulty curve: `skill = min(0.92, 0.45 + (map-1) * 0.13)`. Map 1
  jitters ±~9° and ±35 power (very beatable); map 5 caps at ±~0.7° and
  ±~3 power (hits almost every turn but never literally always).

### Tanks — Fix unaimable shots (drag-toward-target)
Aim was slingshot-style: the angle was computed as `tank - mouse`, so the shot
fired *opposite* to the drag. The player tank sits at x=80, and meaningful
power requires ~250+ px of drag, so reaching the enemy on the right meant
dragging the mouse far off the left edge of the canvas — literally
unhittable for many setups.

- `games/tanks/game.js` `updatePlayer()`: angle now uses `mouse - tank` so the
  drag direction matches the firing direction. Power still scales with drag
  distance (intuitive "pull a slingshot in the direction you want to shoot").
- Updated turn hint: `DRAG TOWARD TARGET, FURTHER = MORE POWER`.
- The aim trajectory preview already uses `aim.angle` so it auto-corrects.

### Barrage — Difficulty rebalance (was way too easy)
The 10-wave campaign was a cakewalk: huge default blast radius, slow missiles,
weak ramp, and exotics arriving so late they barely showed up.

- `games/barrage/game.js` `_burstRadius()`: base `70 → 56`, per-upgrade `+25 →
  +20` (still meaningful, but you can't carpet-clear with one click).
- `_startWave()`: missile count `6 + n*2 → 8 + n*3` (w1 11, w5 23, w10 38),
  initial spawn delay `1.0s → 0.7s`.
- Spawn cadence `max(0.32, 1.2 - n*0.06) → max(0.22, 1.0 - n*0.075)` and
  jitter window narrowed (`0.55 + r*0.65`). Late waves now feel like an actual
  barrage.
- Missile speed `60 + n*6 → 70 + n*10` (w10 ~170 vs old ~120).
- Splitter introduced at wave 3 (was 4); now spawns **3** children with
  steeper spread and faster descent. Armored introduced at wave 5 (was 7),
  HP `2 → 3`.
- New **fast** missile (white, small, ×1.55 speed) appears from wave 5; new
  **mirv** missile (red, double-ringed, HP 2) appears from wave 9 and splits
  into 3 splitters at high altitude — a full MIRV ladder.
- Burst arming time `0.18s → 0.26s` so well-timed clicks matter more.
- Coin economy compensates: per-wave payout `25 + n*10 + cities*6` (was
  `20 + n*8 + cities*5`); MIRV drops 6 coins, fast drops 2, others unchanged.
- Trail/head colours and HP rings added for the two new types.

### Sand — Boots into campaign + onboarding overhaul
The Sand cartridge previously dropped the player into a freeform sandbox with a
seeded NOT-gate demo and a one-line brief — there was no signposting that ten
hand-authored L1 levels (`L1_01_buffer` through `L1_10_tristate`) even existed,
and no in-game guidance for someone who has never wired a transistor circuit.

- `games/sand/game.js`: on `init()` now asynchronously loads
  `Levels.load({ basePath: 'games/sand/data' })`, sorts the L1 layer by
  `order`, and auto-selects the first **unsolved** level (or `L1_01_buffer` if
  none are solved). The workspace seeds an empty graph with the level's input
  pads pre-placed on the left and output pads on the right at sensible y
  spacing, so the player only has to wire the middle. Added `_loadLevel(id)`,
  `_resetCurrent()`, `_nextLevel()`, `_toggleSandbox()`, and `_refreshUI()`
  helpers.
- `games/sand/lib/ui-brief.js`: rewrote the brief panel into a level-aware
  card. Header now reads `LEVEL N — Title  ★★☆`. Body shows the level's
  brief with a `solved!` chip when previously cleared. A detail block renders
  the truth-table (with green/grey 0/1 cells), the 3-star targets
  (`≤ N gates`, `≤ N ticks`), and the allowed-parts pill list. A new
  **Tutorial** section (only on `L1_01_buffer` and `L1_02_not`) walks
  first-timers through the exact chips and wires they need to place. The
  tutorial has a one-click `×` to dismiss permanently, persisted via
  `Storage.mergeGameData('sand', { settings: { tutorialDismissed: true } })`.
  A new `? Controls` button pops a full keyboard/mouse cheat sheet
  (drag-chip, hotkeys 1–7, click-pin-to-pin wiring, click-row to toggle,
  Step/Run/Test, pan/zoom, box-select+Delete) that closes on any input.
- `games/sand/lib/ui-topbar.js`: rebuilt the top bar with a level dropdown
  (shows star counts: `1. Buffer ★★★`), `Reset`, primary `Next ▸`, and a
  `Sandbox`/`◂ Campaign` toggle. Breadcrumb now reads `sand ▸ Layer 1 ▸ XOR`
  in campaign mode and `sand ▸ Sandbox` in free build.
- `games/sand/sand.css`: added styles for the level picker, topbar buttons
  (with primary/active states), the truth-table grid, allowed-parts pills,
  3-star target line, tutorial list, persistent dismiss `×`, and a centred
  `sand-cheat` overlay.
- Sandbox is one click away — toggling it preserves the previous demo NOT
  graph behaviour, so anyone already comfortable with the cartridge keeps
  their freeform workspace.

All 75 existing sand `node --test` tests still pass.

### Learn to Heist — Flight model rewrite (Learn to Fly feel)
The old direct-thrust model (rocket steered by `cos(angle) * thrust`, glider
adding flat upward lift, passive nose-snap toward velocity) felt mushy and
unlearnable. Replaced with proper arcade aerodynamics in
`games/learntoheist/game.js`:
- **Pitch is pure player authority** — no auto-recovery, A/D rotates the body
  at a bounded rate and that's where it stays.
- **Lift = perpendicular to velocity, scaled by `density · speed² · sin(AoA)`**
  with a stall above ~34° (lift collapses, drag spikes). Glider tier
  multiplies the lift coefficient massively; the body still gives a sliver
  of lift on its own.
- **Drag is small at zero AoA, brutal when broadside**, and both lift & drag
  scale with **air density that falls off to ~0 by 2500 m**.
- **Booster is pure thrust along the nose direction** (steering = pitch).
- **Skip-on-shallow-impact ground collision** so you can skim the grass like
  a stone (`SKIP!` floater) instead of instantly pancaking.
- **Removed HP entirely** — the only way the run ends is hitting the ground
  (or coming to a dead stop on it). Hazards now only brake your speed and
  give your nose an angular kick (`OOF!` / `HIT` floaters); bullets shove and
  slow you. HP bar removed from the HUD; fuel bar widened to fill the slot.
- **HUD additions**: yellow velocity-vector arrow on the player so you can
  read your AoA, pulsing red `STALL` ring when AoA exceeds the stall edge,
  dotted ballistic preview during the aim phase.
- **Slowed launch meters** (aim 1.55 rad/s, power period 2.5 s) and rebalanced
  initial launch power (`0.55 + p·0.75` of ramp tier) so a clean tap is
  rewarded but a sloppy one still gives a real flight.
- Manifest controls string updated to mention pitch + glider toggle.

### Arcade Six Depth Pass — Snake / Pong / Breakout / Asteroids / Helicopter / Frogger
Six remaining shallow games rebuilt to the same depth bar set by the
Shallow-Six pass. Each gets a sister `sprites.js` (inline-SVG atlas), an
internal `phase` machine driving the campaign, persistent perks bought from
global coins, and at least one boss. All wired through `index.html` with `?v=2`
cache-busters. Design doc: `docs/plans/2026-04-19-arcade-six-design.md`.

- **Snake — Serpent Campaign** (`games/snake/`)
  - 4 biomes (Grass / Desert / Cave / Digital), 8 apples per biome, then a
    **Worm Boss** duel — brush the worm's body to spawn golden apples; eat 3
    to defeat it.
  - Power-ups (Slow-mo, Ghost, Magnet) drop in-run.
  - Persistent perks (Lateral start length, Slow Start, Iron Apple, Magnet+).
  - Custom SVG snake head, body, apples, golden apple, cacti, glitch tiles,
    worm boss segments, perk icons.
- **Pong — Gauntlet** (`games/pong/`)
  - 5-opponent ladder: Rookie, Cadet, Veteran, Master, Champion (the Champion
    fields stacked twin paddles, best-of-5).
  - Each match first-to-5 (3 vs Champion); pick a perk between matches.
  - Perks: Wider paddle, Curve return, Twin ball, Lazy CPU, Top/Bottom bumpers.
  - Custom SVG opponent portraits, paddle skins, ball glow, perk chips, trophy.
- **Breakout — World Tour** (`games/breakout/`)
  - 5 worlds (Pastel / Steel / Frost / Ember / Void) × 3 levels each, plus
    the **Behemoth** boss-brick at the end of Void.
  - New brick types: ice (2 HP), metal (need power-up), bomb (3×3 chain),
    mirror (deflect+speed), lock + key.
  - Drop power-ups: multi-ball, wide paddle, laser, slow ball, shield save.
  - Persistent perks: Steel Paddle, Insurance, Bombardier, Multi Start,
    Vault Locksmith.
  - Custom SVG bricks, paddle skins per world, power-up chips, world banners.
- **Asteroids — Hive War** (`games/asteroids/`)
  - 10-wave campaign + bosses on wave 5 (Swarm Lord) and wave 10 (Hive Queen
    with rotating weak-point and split phase).
  - Ship upgrades (Rapid Fire, Twin Guns, Shield, Missile) bought between
    waves; previously-unlocked upgrades cost ½ next run.
  - Custom SVG ship variants, hunter drones, bosses, missiles, alien bullets,
    upgrade icons.
- **Helicopter — Long Run** (`games/helicopter/`)
  - 4 biomes (Cavern → Reactor → Reef → Orbit), each ending in a boss
    (Laser Gates, Charging Dragon, Turret Gauntlet, Satellite Array).
  - Stamina meter, in-flight pickups (fuel pod, shield orb, turbo).
  - Persistent perks: Bigger Fuel Tank, Slower Stall, Reinforced Rotor,
    Auto-Pilot.
  - Custom SVG heli variants + biome decor + boss sprites.
- **Frogger — Five Days** (`games/frogger/`)
  - 5-day campaign; each day adds a hazard (snake on median → trucks + pad
    crocs → sinking lily pads + lightning storms → **Highway Hawk** boss
    that telegraphs and swoops down columns).
  - Persistent perks: Long Hop, Trap Detector, Spare Frog, Quick Hop.
  - Custom SVG frog, cars/trucks, logs, turtle, snake, croc, lily, hawk.

Verification: every game smoke-tested in-browser — initialises in `phase=intro`,
renders nontrivial canvas, transitions to gameplay phase under simulated
input, no JS console errors beyond the pre-existing audio 404s.

### Frogger + Helicopter (2 new minigames)
- **Frogger** (`games/frogger/`) — 16-col grid, 4 road lanes (alternating directions, scaling speeds), median, 3 log lanes + 1 turtle lane (turtles surface/dive on a sine cycle so timing matters), 5 home pads at top. Frog hops one cell per keypress (W/A/S/D or arrows). Riding a log/turtle moves the frog with the lane; drift off-screen = death. Filling all 5 pads grants a 500-pt clear bonus and resets the board so you can keep racking up crossings. Death penalty -25 pts. Coins ≈ score / 60.
- **Helicopter** (`games/helicopter/`) — Side-scrolling cave dive, classic Helicopter Game. Hold mouse / Space to thrust up, gravity pulls down. Cave is a procedurally walked top/bottom wall pair; tunnel narrows over time. Periodic stalactite/stalagmite pillars from random sides. Floating $-coins along the way for bonus score. Distance-based scoring + coin bonuses. Coins ≈ score / 80.
- Both ship with synthesized SFX, particle bursts, screen shake, and animated selector previews.
- Wired into `index.html` after `asteroids`.
- Design doc: `docs/plans/2026-04-19-frogger-helicopter.md`.
- Bugfix during dev: helicopter score went negative on Play Again because `_lastDistScore` carried over between rounds. Replaced complex delta-tracking with explicit `coinBonus` accumulator.

### Shallow-Six Depth Pass + SVG Sprite Engine
Six previously-shallow games rebuilt around progression, bosses, perks, and
custom inline-SVG art.

- **`engine/sprites.js` (new)** — vector sprite atlas. Games register inline SVG
  strings under namespaced keys (`bloom.helio`, `deflect.knight`, etc); the
  engine rasterises to offscreen canvases per requested size and caches the
  result. `Sprites.draw(ctx, key, x, y, w, h, opts)` is the only API games need.
  Crisp at any size, zero file fetches, supports `rot/flipX/alpha/anchor` and a
  fallback for the first frame while decode is in flight.
- **Bloom — Abyss campaign** (`games/bloom/`)
  - 5 themed biomes (shallows → kelp → twilight → trench → maw) with distinct
    palettes, fauna and hazards.
  - Boss every biome (Helio jellyfish + Maw devourer); biome-up splash → shop
    → next biome.
  - Power-ups (magnet, shield, dash refresh, mass nova) and persistent perks
    bought from a between-biome shop.
  - Custom SVG sprites: `coral`, `kelp`, `jelly`, `helio`, `maw`, spikes, motes,
    powerup chips.
- **Deflect — Champion's Trial** (`games/deflect/`)
  - 12-wave campaign with three boss waves (Warden, Twin Sisters, The Sun).
  - Five projectile types: arrow, firebolt (curving), splitter, frost, armored.
  - Between-wave perk picker (Wider Arc, Quick Blade, Iron Heart, Mirror Edge,
    Blood Moon, Time Walk) drawn from a deck.
  - Custom SVG sprites: knight, projectile types, three boss portraits, perk
    icons.
- **Stargazer — twin-stick with shop** (`games/stargazer/`)
  - Pre-run upgrade shop (HP, Start Bombs, Start Charge, Twin Shot).
  - Wave-based formations, bombs, overcharge mode, recurring bosses.
- **Ricochet — campaign + perks** (`games/ricochet/`)
  - 25 levels, boss every 5, pre-run perk shop (+Bounces, Piercing Shot, Aim
    Assist, Heavy Round) and shielded enemy variants.
- **Sigil — Grimoire of the Three Seals** (`games/sigil/`)
  - Three chapters (Initiate / Adept / Archmage), each "trials → boss duel".
  - Three boss duels: Warlock (void weakness), Lich (fire), Dragon (ice).
  - Spellbook unlocks across runs; mana / combo / element-weakness damage
    system; sanctum perk shop between chapters (Deep Well, Ley Line, Focused
    Eye, Elder Sage).
  - Custom SVG sprites for nine glyphs and three boss portraits.
- **Diner Rush — 5-Day Shift** (`games/diner/`)
  - 5-day campaign; each day unlocks new ingredients (pickles, sauce, bacon,
    mushrooms) and tightens cadence.
  - Persistent kitchen stations (Better Grill, Prep Station, Fresh Fridge,
    Marketing) bought between days.
  - Day-5 food critic boss customer (7-stack order, 4× tip, run-ending walkout
    penalty).
  - Custom SVG sprites for every ingredient, three customer types, the critic,
    grill / prep stations, trash bin.
- Manifests for Sigil and Diner updated with new blurbs/descriptions.
- All script tags for changed files are versioned (`?v=2`) to bypass browser
  caching against the python `http.server`.
- Design doc: `docs/plans/2026-04-19-shallow-six-design.md`.

### Retro Classics Pack (4 new minigames)
- Added `games/snake/`, `games/pong/`, `games/breakout/`, `games/asteroids/` — quick-and-easy arcade canon.
- **Snake** — 40×25 neon grid, growing tail, accelerating apples. Wall + self collision = game over. Coins ≈ score / 30.
- **Pong** — vs CPU with rally-scaling difficulty (CPU prediction with shrinking slop), scanlines, big background score numbers, ball trail. Score = playerGoals×100 - cpuGoals×60 + rallies×5. Coins ≈ score / 60.
- **Breakout** — 12×5 brick wall, 3 lives, multi-level (clear wall = bonus + new wave), paddle-position-based ball reflection, combo meter. Coins ≈ score / 80.
- **Asteroids** — vector ship with rotation/thrust/wrap-around, large→medium→small split mechanic, periodic edge spawns, 1.5s spawn invuln, brief invincibility ring. Coins ≈ score / 100.
- All four use synthesized SFX, particle bursts, screen shake, and themed selector previews.
- Wired into `index.html` after `reactor`.
- Design doc: `docs/plans/2026-04-19-retro-classics.md`.

### Reactor — Lunar He-3 Tycoon (new minigame)
- Added `games/reactor/` (manifest + game) inspired by Not Doppler / Ninja Kiwi management games.
- Side-view lunar base cutaway: starfield, rising Earth, dome, central glowing reactor, modular pods.
- Core loop: throttle the reactor to earn $/s; manage heat to avoid meltdown.
- 6 module types (Mining Rig, Coolant Loop, Shielding, Reactor Core+, Launch Pad, Auto-Stabilizer) with exponential cost scaling.
- Pressure events: meteor showers (with crosshair telegraph), solar flares (throttle drift), coolant leaks.
- Emergency vent ability (Space) — drops heat, costs cash, on cooldown.
- Web-Audio SFX palette (alarm, vent steam, meltdown, launch, flare) + low ambient reactor hum.
- Animated card preview with pulsing core, drifting modules, meteor streaks, Earth.
- Score = total $ earned. Coins ≈ score / 400.
- Wired into `index.html` after `sand`.
- Design doc: `docs/plans/2026-04-19-reactor-design.md`.

## Pre-2026-04-19
- 20 launch + post-launch minigames implemented (gullet, franchise, ricochet, skybound, deflect, bloom, sigil, barrage, diner, stargazer, tanks, bulwark, starfall, leap, crypt, depths, vaultbreaker, orbital, learntoheist, sand).
- Engine in `engine/` (BaseGame, Input, Audio, Draw + particles, Storage, Assets, Sprites).
- Selector grid with live animated card previews; cosmetic theme shop powered by coin currency.
