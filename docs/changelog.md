# Changelog

A running log of what shipped in each session.

## 2026-04-19

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
