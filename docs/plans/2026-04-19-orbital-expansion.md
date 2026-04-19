# Orbital — Expansion (Tower Depth + Meta-Progression)

Date: 2026-04-19
Status: planning

## Goal

Take Orbital from "polished single-path TD with one upgrade tier per tower"
to a long-tail BTD5/BTD6-tier experience: **two upgrade paths per tower**,
**tower XP / pop count**, **active abilities**, **multiple maps**,
**difficulty modes**, **a hero unit**, and a **persistent meta layer**
("Star Charts"). All while preserving the static, no-build, single-file
arcade ethos.

The single change with the largest impact on perceived depth is the
**two-path upgrade tree** — that's the headline of Phase 1 and the lens we
design every other system around.

## Design pillars

1. **Decisions over numbers.** Every upgrade should change *how* a tower
   plays, not just bigger numbers. (BTD lesson: tier-4 names matter.)
2. **Synergy over sprawl.** New towers/heroes only ship if they create new
   combos with the existing roster. No "+10% dart" tower.
3. **Skill ceiling, not grind ceiling.** Star Charts is a flavor layer — a
   blank slate must still beat Apocalypse difficulty without it.
4. **Information dense, not noisy.** Tower popup must show both paths,
   current stats, current XP, ability cooldowns *without* covering the
   battlefield.
5. **Phased rollout.** Each phase is independently shippable; later phases
   layer on without rewriting earlier work.

## Phases

| Phase | Headline | Approx scope |
|-------|----------|--------------|
| 1 — Tower Depth | Two-path upgrades + tower XP + active abilities + targeting priorities + new round economy + upgrade panel UI | ~3 large code units; 80 upgrade nodes designed; same map/enemies/difficulty |
| 2 — Content Breadth | 4 new towers, 5 new enemy types/modifiers, round count 30 → 50, restructured acts | new tower designs and SVGs; new enemy SVGs; rounds rebalanced |
| 3 — Maps + Difficulty | 3 new maps (different geometries), Normal/Hard/Apocalypse modes, map select UI | path geometry data + selector; difficulty scaling math |
| 4 — Heroes + Meta | 3 heroes (placed unit, levels in-run, 2 active abilities each), Star Charts meta tree, Endless mode after R50, Daily seeded challenge, Sandbox | hero runtime + selector; persistent meta UI; endless scaling |

We commit Phase 1 first, ship it, then Phase 2/3/4 each get their own
implementation plan that references this doc.

---

# Phase 1 — Tower Depth Pass (the headline)

## What changes for the player

- The tray + popup are redesigned. Selecting a tower opens a panel showing
  **two upgrade paths side-by-side**, each with 4 tiers. Each tier has a
  name (e.g. "Razor Bolts"), a cost, and a one-line description. Affordable
  tiers glow; tiers behind a path-cap rule are red-locked with a tooltip.
- Path-cap rule (the BTD5 constraint): **a tower may have at most one path
  above tier 2**. This forces a real choice and prevents both-path-maxed
  super-towers.
- Towers gain XP from kills and level up 1 → 2 → 3 mid-run. Level grants a
  small passive (+5% range, +10% dmg, +5% rate per level). A small chevron
  pip cluster under the sprite shows current level.
- High-tier upgrades unlock **active abilities** (cooldown buttons in the
  popup, hotkeys `1` and `2` for the two paths). Abilities cost nothing per
  use, only their cooldown.
- Each enemy click-pop emits a small `+$N` floater (already shipped in the
  Quant rebalance) and now also adds XP toward the killing tower's next
  level. Killing tower glows briefly so it's visible which tower scored.
- Targeting **priority** (`First` / `Last` / `Strong` / `Close`) is a
  cycling button in the popup, hotkey `T`. Saved per tower.
- End-of-round bonus shows a tiny recap floater: `+$120 ROUND CLEAR · ×1.4
  no-leak streak`.
- Total **Score** earned across runs banks into a persistent **Stardust**
  pool (1 stardust per 1000 score) shown on the title screen — sets the
  hook for Phase 4's Star Charts tree.

## File layout

The current single-file `games/orbital/game.js` is already ~1500 lines and
will burst past 3000 with this expansion. Split now.

```
games/orbital/
  manifest.js        — unchanged (preview thumbnail)
  sprites.js         — extended with: chevron pips, ability-icon glyphs, new
                       upgrade FX
  game.js            — slim orchestrator (~800 lines target): main loop,
                       render compositing, input dispatch, phase machine
  data/
    towers.js        — TOWERS base + paths catalog (Phase 1: 10 towers ×
                       2 paths × 4 tiers = 80 nodes)
    enemies.js       — TIERS + modifier registry
    rounds.js        — ROUNDS[1..30] (Phase 1 keeps 30; Phase 2 extends)
    abilities.js     — ACTIVE_ABILITIES catalog (id → activate(game, tower))
  lib/
    upgrades.js      — path-cap rule, cost lookup, applyTier(tower, path,
                       tier), totalSpent(tower), refundValue(tower)
    xp.js            — grantXP(tower, amount), levelStats(tower),
                       killCredit(enemy, projectile|tower)
    economy.js       — interest, bounty aura, round-end bonus, no-leak
                       streak, score → stardust mapping
    targeting.js     — priorityFns: first|last|strong|close → (tower) =>
                       enemy
    persist.js       — Storage.getGameData('orbital') wrapper:
                       { stardust, totalRunsCleared, bestRound, settings }
  ui/
    tower-popup.js   — the new two-path upgrade panel (renders + hits)
    tray.js          — purchase tray; same layout, gets ability-charge ring
                       overlays for selected-tower ability hotkeys
    recap.js         — round-end floater & banner
```

Namespace plan (mirrors Reactor's pattern):

```js
NDP.Orbital = {
  Towers:    { catalog, baseStats, pathTier, applyTier, allowedTiers },
  Enemies:   { catalog, mods, applyMods },
  Rounds:    { list, get(roundIndex) },
  Abilities: { catalog, activate(id, game, tower), drawIcon(ctx, id, ...) },
  Upgrades:  { canBuy, buy, cost, refund, totalSpent },
  XP:        { grant, levelOf, statsFor, threshold },
  Economy:   { applyBounty, applyInterest, roundBonus, leakStreak },
  Targeting: { priorities, pickTarget(tower, enemies) },
  Persist:   { load, save, addStardust, mergeSettings },
  UI:        { TowerPopup, Tray, Recap }
};
```

`game.js` consumes them and never reaches inside. New files attach to the
namespace; nothing in the engine changes.

## Two-path upgrade — data shape

Replaces the current `upg: { … }` blob.

```js
TOWERS.dart = {
  base: {
    name: 'Dart Station', cost: 180, sprite: 'orb_turret_dart',
    color: '#7ae0ff', range: 140, fireRate: 3.2, dmg: 2,
    projSpeed: 520, proj: 'bolt', priority: 'first'
  },
  paths: {
    A: {
      id: 'rapid', name: 'Rapid Fire', accent: '#7ae0ff',
      tiers: [
        { cost:  200, label: 'Tighter Coils', desc: '+1.4 fire rate',
          patch: { fireRate: 4.6 } },
        { cost:  350, label: 'Razor Bolts',   desc: 'pierces 3 enemies',
          patch: { pierce: 3 } },
        { cost:  600, label: 'Burst Fire',    desc: 'fires triple bursts',
          patch: { burst: 3, burstGap: 0.05 } },
        { cost: 2200, label: 'Stormcaller',   desc: 'machine-gun cap +pierce',
          patch: { fireRate: 9.0, pierce: 5 },
          ability: 'rapidStrike' }
      ]
    },
    B: {
      id: 'sniper', name: 'Heavy Bolt', accent: '#ffd86b',
      tiers: [
        { cost:  240, label: 'Sharper Tip', desc: '+2 damage',
          patch: { dmg: 4 } },
        { cost:  500, label: 'Long Lens',   desc: '+50 range',
          patch: { range: 190 } },
        { cost:  900, label: 'Anti-Armor',  desc: 'ignores armored',
          patch: { antiArmor: true } },
        { cost: 2800, label: 'Sniper Module', desc: 'global range, big bolts',
          patch: { range: 9999, dmg: 24, fireRate: 1.0 },
          ability: 'preciseShot' }
      ]
    }
  }
};
```

A placed tower then carries its own runtime state:

```js
{
  key: 'dart',
  x, y,
  pathTiers: { A: 0, B: 0 },   // 0..4
  stats: <derived from base + applied tier patches>,
  cd, angle, target, …,
  kills: 0, xp: 0, level: 1,
  abilityCDs: { rapidStrike: 0, preciseShot: 0 },
  priority: 'first',
  totalSpent: 180
}
```

`Upgrades.applyTier(tower, 'A', n)` rebuilds `tower.stats` from `base + each
applied tier.patch` (in order). It also mutates `pathTiers.A = n` and
adds the cost to `totalSpent`. Patches are last-write-wins, so later tiers
that include a stat re-spec earlier ones (note `Stormcaller` overwriting
`fireRate`).

`Upgrades.allowedTiers(tower, path)` returns the max tier the player may
buy on that path right now, given the path-cap rule:

```
otherPathTier = pathTiers[other]
if otherPathTier <= 2: max = 4
else:                  max = 2
```

So if you've put points into B up to tier 3, A is hard-capped at 2. Selling
the high path frees the cap (and refunds at 70%).

## Path catalog (Phase 1 — the 10 existing towers)

Tier costs are guideline numbers; tuning happens during implementation. The
header for each tower is its identity-summary so anyone designing a level
can reason about it.

### dart — "skirmisher"
- A · Rapid Fire — light, fast, pierces. Lategame: Stormcaller (T4) machine-gun.
- B · Heavy Bolt — slow, heavy, anti-armor. Lategame: Sniper Module (T4) global-range single-target.

### cannon — "splash"
- A · Heavy Ordnance — bigger booms, bigger AoE. T4 Carpet Bomb ability.
- B · Cluster Shells — many small splashes. T4 fires 3 shells per shot in spread.

### beam — "armor breaker"
- A · Fractal Beam — chains to N nearby enemies. T4 lance scales with chain length.
- B · Solar Concentrator — pure DPS climbing the longer it holds a target. T4 Solar Lance ability hits everything on screen.

### gravity — "controller"
- A · Event Horizon — bigger slow %, bigger range, can pull-DPS. T4 Time Stop ability.
- B · Quantum Lock — instead of slow, brief stuns; works on UFOs too. T4 area stun pulse.

### flare — "DoT"
- A · Coronal Mass Ejection — bigger pulse, bigger burns. T4 Heat Storm passive (burns last 2× when stacked).
- B · Plasma Lance — converts pulse into a sweeping beam in front. T4 Helios Cannon ability — supernova.

### sing — "panic button"
- A · Horizon Collapse — shorter CD, larger radius. T4 Event Horizon ability — 4s field that sucks enemies in.
- B · Black Hole Bomb — manual deploy ability, lobs a delayed singularity at any tile. T4 reduces CD and adds aftershocks.

### tesla — "swarm killer"
- A · Superconductor — more chains, more damage. T4 chains hit *everything* in radius.
- B · Capacitor Bank — stores damage between shots, releases huge surge. T4 ability dumps the stored charge as map-wide arc.

### missile — "boss melter"
- A · Cluster Warheads — many splash shots. T4 Salvo ability fires 6 missiles.
- B · ICBM — slow, heavy single-shots. T4 ability launches a 800-dmg map-wide warhead.

### support — "buffer"
- A · Resonance Field — bigger fire-rate / damage / range buffs. T4 Overclock ability.
- B · Tactical Net — provides camo-detection and +bounty aura (synergy with Quant). T4 Field Repair ability refreshes other towers' ability CDs in range.

### quant — "economist"
- A · Aggressive Portfolio — larger bounty %, larger interest cap. T4 Stock Crash ability bursts big interest payment.
- B · Hedge Fund — smaller bounty, but pays % of *every* kill across the map (not just in range). T4 Insider Trading ability — 10s of +200% bounty everywhere.

Total Phase 1 design surface: 10 towers × 8 nodes = 80 nodes.

## Active abilities

Catalog lives in `data/abilities.js`. Each entry:

```js
ABILITIES.rapidStrike = {
  label: 'Rapid Strike',
  desc: '4× fire rate for 5s.',
  cd: 25,                         // seconds
  glyph: 'orb_ability_rapid',     // sprite key for the popup icon
  hotkey: 1,                      // 1 = path A, 2 = path B (auto from path)
  activate(game, tower) {
    tower._buffEndsAt = game.time + 5;
    tower._fireMul = (tower._fireMul || 1) * 4;
  },
  tick(game, tower, dt) {
    if (tower._buffEndsAt && game.time > tower._buffEndsAt) {
      tower._fireMul = 1; tower._buffEndsAt = 0;
    }
  }
};
```

Phase 1 ships ~20 abilities (one per T4 across both paths of all 10
towers; some are passive — no `activate` — and just show as a passive
badge in the popup).

The popup gets two cooldown ring buttons under the path columns; clicking
or pressing `1`/`2` while the tower is selected fires the matching
ability.

## Tower XP

`xp.js`:

```js
const LEVEL_THRESHOLDS = [0, 30, 90, 220];   // xp needed to reach 1,2,3
function statsForLevel(level) {
  return { range: 1 + 0.05 * (level - 1),
           dmg:   1 + 0.10 * (level - 1),
           rate:  1 + 0.05 * (level - 1) };
}
```

These multipliers are applied on top of `tower.stats` at use sites
(`updateTower`, `buffsForTower`, etc.). Level-up triggers a small ring
flash and `+L2`/`+L3` floater above the tower.

XP is awarded to the projectile's owner on damage proportional to dmg
dealt (so a beam doing 32 dps over 2s on a 60-hp enemy gets the full 60
xp, distributed each frame). Splash damage credits the firing tower in
full. Beam chain credit goes to the originating beam tower. Tesla chain
credit splits across hits.

This means cheap towers also level up if used. Quant doesn't level
(no kills credited).

## Targeting priorities

`targeting.js`:

```js
const PRIORITY_FNS = {
  first:  (t, list) => maxBy(list, e => e.pathS),
  last:   (t, list) => minBy(list, e => e.pathS),
  strong: (t, list) => maxBy(list, e => e.maxHp),
  close:  (t, list) => minBy(list, e => Math.hypot(e.x-t.x, e.y-t.y))
};
```

The popup gets a small button cycling among the four. Hotkey `T` while a
tower is selected. Saved on `tower.priority`.

## Round economy

End-of-round bonus reworked from `100 + round * 25` (score) and a flat
`40 + round * 5` cash bonus into a structured recap:

```
ROUND CLEAR
  Base               +$80
  Round multiplier   ×1.0  ($80 → $120 by R30)
  No-leak streak     ×1.4  (+ chevron pip)
  Combo killers      +$15  (every kill within 0.3s of last counts)
SCORE +325
```

State tracked in `economy.js`:

- `noLeakStreak` — incremented on a leak-free round, reset on first leak.
  Max bonus capped at ×2.0 (=10 streak).
- `comboKills` — a rolling tally of kills within a 0.3s window. End-of-
  round counts longest streak; small cash kicker.
- `roundCashBase = 60 + round * 4`.

Recap renders as a soft banner top-center for ~3s, dismissible by
clicking the START WAVE button (which also starts the next wave).

## Persistent state (Phase 1)

`persist.js` writes to `Storage.getGameData('orbital')`:

```js
{
  stardust: 0,             // 1 per 1000 score, banked at run end
  totalRunsCleared: 0,     // increment on R30/R50 win
  bestRound: 0,
  settings: { soundOn: true, fastForwardDefault: 1 }
}
```

Stardust does nothing in Phase 1 except show on the title HUD ("Stardust:
17 ◆"). It's the dangling carrot for Phase 4's Star Charts.

## UI changes

### Tray
- Towers list unchanged. Each tile gains a tiny corner badge showing the
  hotkey (1-9, 0).
- When a tower is **selected**, the bottom of the tray shows two
  ability-charge rings ("⚡1", "⚡2") with cooldown sweeps.

### Tower popup (the big one)
The current 176×140 popup gets replaced with a 320×220 panel laid out as:

```
┌──────────────────────────────────────────────────┐
│ DART STATION ★L2                       TIER A:0 B:0│
│ DMG 2 (·×1.10) · RATE 3.2/s · RANGE 140 · PIERCE 1│
│ ──────────────── XP ▮▮▮▮▱▱▱▱  120/220 ─────────────│
│ ┌── PATH A · RAPID FIRE ──┬── PATH B · HEAVY BOLT ──┐│
│ │ T1 Tighter Coils  $200  │ T1 Sharper Tip    $240  ││
│ │ T2 Razor Bolts    $350  │ T2 Long Lens      $500  ││
│ │ T3 Burst Fire     $600  │ T3 Anti-Armor     $900  ││  ← red-locked once
│ │ T4 Stormcaller   $2200  │ T4 Sniper Module $2800  ││    other path > T2
│ └─────────────────────────┴─────────────────────────┘│
│ TARGETING: [First] · ABILITY 1: ⚡25s · 2: idle  [SELL +$126] │
└──────────────────────────────────────────────────┘
```

- Hovering a tier shows its `desc` in a small tooltip below the popup.
- Buying a tier dims it and lights up the next.
- Clicking the active-path's locked tier shows "Sell B path to unlock".
- Targeting button cycles on click; `T` does the same.
- Sell shows the live refund amount (70% of `totalSpent`).
- Drawn by `ui/tower-popup.js`. Hit detection returns
  `{ kind, path?, tier?, button? }` so `game.js` doesn't know panel layout.

### HUD
Add a Stardust counter to the right edge:
`<span>◆ <b>17</b></span>`. Only shows once stardust > 0 (no clutter
for a fresh save).

## Implementation order

1. **`data/towers.js`** — convert existing TOWERS to base+paths shape,
   port current single-upgrade as path A T1+T2 (so old saves can never
   exist anyway, but functionally equivalent path costs).
2. **`lib/upgrades.js`** + **`lib/xp.js`** + **`lib/targeting.js`** — pure
   data, no game-state coupling. Unit-testable.
3. **`data/abilities.js`** — catalog only, no UI yet.
4. **`ui/tower-popup.js`** — render + hit-test the new panel against a
   fake tower fixture. Ship-stop here for visual review.
5. **`game.js`** — replace `TOWERS` access with `Towers.base + applied
   tiers`, swap `drawPopup` → `UI.TowerPopup.draw`, `popupHitTest` →
   `UI.TowerPopup.hit`. Wire ability hotkeys 1/2 + targeting hotkey T.
   Wire XP grants in `damage()` and the death-cull loop.
6. **`lib/economy.js`** — round bonus + streak. Hook into `startWave`
   end-of-round path.
7. **`ui/recap.js`** — banner + floater. Auto-dismiss timer.
8. **`lib/persist.js`** — save/load Stardust on run-end.
9. **`sprites.js`** — chevron pip atlas, ability glyphs.
10. Cache-bust `index.html` with `?v=3`.
11. **Changelog + roadmap**.

## Risks & mitigations

- **80 nodes is a lot to balance.** Mitigation: ship Phase 1 as
  `state: 'beta'` numbers and iterate from playtests. Each tier has a
  one-line `desc` so a balance pass is a single-file edit.
- **Popup gets big and obscures the battlefield.** Already 50% of canvas
  height. Mitigation: snap-to-corner. Also: pressing ESC or clicking
  outside the panel dismisses it without deselecting (the next click
  re-opens).
- **Ability hotkeys conflict with `1`-`9` for tray purchases.** Decision:
  `1`-`9` always purchases-by-tray. Abilities use `Q`/`E` instead (left =
  path A, right = path B). Hotkey hint shown on the popup buttons.
- **Save schema drift.** Phase 1 namespace is fresh and new, but if a
  player has played pre-expansion Orbital they have no existing save in
  this namespace, so this is forward-safe.
- **`game.js` getting unreadable.** That's why we're splitting now. After
  the split `game.js` should be ~700-900 lines and only handle: main
  loop, render compositing, click dispatch, the phase machine, and
  bridging into `NDP.Orbital.*`.

## Acceptance criteria — Phase 1

- [ ] Selecting a tower shows the new two-path panel.
- [ ] Buying tiers respects the path-cap rule with a visible lock.
- [ ] Stats panel updates live as tiers are bought.
- [ ] Selling a high-path tier unlocks the other path back to T4.
- [ ] Tower XP visibly accumulates; level chevrons appear under sprite at
      L2 and L3.
- [ ] At least 6 of the 10 towers have a working active ability fireable
      via popup button or `Q`/`E` hotkey.
- [ ] Each ability shows its cooldown ring on the popup buttons.
- [ ] Targeting button cycles First → Last → Strong → Close, persists per
      tower, and the beam-tower target visibly changes.
- [ ] End-of-round recap banner with bonus breakdown.
- [ ] Stardust counter ticks up on run completion and persists.
- [ ] Existing 30-round campaign still beatable on a fresh save.
- [ ] No console errors during a full R1 → R30 run.

---

# Phase 2 — Content Breadth

Adds raw content on top of the Phase 1 mechanics.

## New towers (4)

| Key   | Identity | Path A | Path B |
|-------|----------|--------|--------|
| `sniper`   | global-range single-shot, anti-armor by default | Recon Net — tags enemies for +30% bounty when killed by allies | Decapitator — instakill non-boss high HP enemies on long CD |
| `engineer` | drops mines on the path; passive sentry that shoots tiny bolts | Mine Layer — bigger, denser mines | Auto-Sentry — sentry becomes a real DPS source |
| `cryo`     | freezes enemies (no damage on its own) | Deep Freeze — full stop on hit, brittle multiplier on next hit | Cryo Shards — burst of frost damage, AoE chill |
| `chrono`   | manipulates time; in its range enemies move slower AND towers fire faster | Time Dilation — bigger slow + bigger buff | Temporal Anchor — pin enemies in place for a moment |

Each tower follows the same data shape and ships with 2 abilities at T4
on each path (8 new abilities).

## New enemies / modifiers (5)

| Type / Mod | Behavior |
|------------|----------|
| `camo` (modifier)   | invisible to towers without camo-detection (Support B path, Sniper, Tactical Net) |
| `lead` (modifier)   | immune to non-explosive damage. Forces players into Cannon/Missile/Flare. |
| `fortified` (mod)   | 2× HP and 2× bounty. Visual: heavy plating overlay. |
| `swarmer` (tier)    | low HP, very fast, spawn in waves of 30. Encourages Tesla/Beam/Cryo. |
| `summoner` (tier)   | medium HP; on death spawns 5 tinies. Forces splash-damage decisions. |

All visualized with new SVG overlays in `sprites.js`.

## Round restructure

30 → 50 rounds, 5 acts of 10:

| Act | Rounds | Theme |
|-----|--------|-------|
| I   | 1-10   | Tutorial; introduce 1 enemy type per round (existing) |
| II  | 11-20  | Modifiers come online (existing) |
| III | 21-30  | Hellscape (existing); ends with double-boss (existing R30) |
| IV  | 31-40  | NEW. Lead + Camo introduced. Mid-act mini-boss at R35 ("Husk Cruiser") |
| V   | 41-50  | NEW. Swarms + Summoners. R45 mini-boss, R50 = Devourer (mega-boss) |

Round 50 Devourer: 8000 HP, immune to instakill, spawns swarms at 75% /
50% / 25% HP, summons 2 elites at 33%. Killed only with sustained DPS
across multiple tower types (encourages diverse builds).

## Implementation

A separate plan: `2026-04-XX-orbital-content-breadth.md`. Files: data/
towers.js (extended), data/enemies.js (extended), data/rounds.js
(extended), sprites.js (4 new turret SVGs + 5 new enemy SVGs).

---

# Phase 3 — Maps + Difficulty

## New maps (3 + the original = 4)

| Map           | Geometry | Twist |
|---------------|----------|-------|
| `nebula`      | the existing snake | baseline |
| `crossroads`  | two parallel paths joining at the homeworld | enemies split between paths; some towers hit both |
| `loopback`    | figure-8; some path passes through itself | enemies cross at center, allowing "choke" placements |
| `twin_moons`  | branching path; player chooses which fork enemies take per round via gravity well puzzle | meta-puzzle layer |

Map data lives in `data/maps.js`:

```js
MAPS.nebula = {
  id: 'nebula', name: 'Nebula',
  bgColor: '#05071a',
  paths: [{ pts: PATH_PTS_NORM, lifeMul: 1.0 }],   // existing path
  startVisual: { kind: 'tear', color: '#ff4fd8' },
  endVisual:   { kind: 'planet', color: '#ff9055' }
};
```

The geometry-derived data (`PATH_SAMPLES`, `PATH_LEN`, `pointAt`,
`distToPath`) becomes per-path and indexed by path id. Enemies carry a
`pathId` field. Rendering iterates over the map's path array.

## Difficulty modes

| Mode       | Starting cash | Starting lives | Modifier multipliers | Round cap |
|------------|---------------|----------------|----------------------|-----------|
| Normal     | 850           | 120            | 1.0×                 | 50 + endless |
| Hard       | 700           | 80             | 1.25× HP, 1.15× speed| 50 + endless, modifier prob ↑ |
| Apocalypse | 550           | 40             | 1.5× HP, 1.3× speed, +1 mod per spawn | 50 + endless, fewer cash drops |

Lock state persists. Hard unlocks after Normal R50 clear. Apocalypse
unlocks after Hard R50 clear. Beating Apocalypse on each map awards a
"Trophy" star shown in the title screen.

## Implementation

A separate plan: `2026-04-XX-orbital-maps-difficulty.md`. Files: new
`data/maps.js`, new `ui/map-select.js`, refactor of `pointAt`/`distToPath`
into per-path tables.

---

# Phase 4 — Heroes + Meta

## Heroes (3)

A hero is a single permanent unit you place at run-start (free, anywhere
valid). Heroes level 1 → 8 during a run from XP earned by nearby kills
(splits XP with the killing tower 50/50). Each hero has 2 active
abilities; one unlocks at L4, the second at L7.

| Hero | Identity | L1 base | L4 ability | L7 ability |
|------|----------|---------|------------|------------|
| `captain` (Engineer-Captain) | mid-range MG turret with a healing aura that refreshes nearby tower CDs faster | Field Refit — instantly resets all CDs in range | Overclock Field — 100% rate buff in range for 6s |
| `astromancer` | long-range arcane bolts that ignore camo & lead, slow on hit | Eclipse — freezes screen for 3s | Stellar Collapse — pulls all enemies back along path 30% |
| `marshal` (Drone Marshal) | spawns pursuing combat drones (separate units that path along enemies) | Drone Swarm — 8 extra drones for 10s | Strafing Run — bombing pass damages every enemy on screen |

Hero data lives in `data/heroes.js`. Hero runtime lives in
`lib/heroes-runtime.js` (separate from towers because they level
differently and never get upgraded with cash).

## Star Charts meta tree

`lib/star-charts.js` + `ui/star-charts-panel.js`. Persistent UI on the
title screen, accessed via a "STAR CHARTS ◆" button.

16 nodes across 4 sectors:

| Sector | Nodes | Examples |
|--------|-------|----------|
| Economy | 4 | +$50 starting cash, +1 round-bonus base, interest cap +20%, sell refund 70 → 80% |
| Combat  | 4 | +5% global tower damage, +5% range, abilities -10% CD, kill streak +bounty |
| Hero    | 4 | +1 starting hero level, hero XP gain +25%, hero ability CDs -15%, second hero slot (R30+) |
| Cosmic  | 4 | +20 starting lives, free random T1 upgrade once per game, daily challenge x2 stardust, unlock map theme variants |

Costs scale 3 → 5 → 8 → 12 stardust within a sector (tier locked by
having bought all earlier nodes in that sector). Total tree = 112
stardust = roughly 6-8 full-clear runs.

## Endless mode

After R50 win on any map, "Continue endless?" prompt. Endless rounds
generated procedurally:

```
roundN.bounty = 1.10^(N-50) × baseline
roundN.HP    = 1.12^(N-50) × baseline
roundN.composition = weighted random from a pool that opens up over time
```

Score growth is exponential, so one Endless round at R75 might dwarf an
entire Normal run. This is the leaderboard hook.

## Daily challenge

Seeded by `YYYY-MM-DD`. Fixed map, difficulty, starting cash, and three
banned towers. Each player gets one attempt per local day. Score
recorded in `Storage.getGameData('orbital').daily[date] = score`. No
network leaderboard; just a personal-best display. Worth 2× stardust on
first clear.

## Sandbox

A "PRACTICE" toggle on the title screen: infinite cash, ability CDs
disabled, round-skipper buttons (`◀`, `▶`). For trying out builds and
high-tier upgrades without grinding to them.

## Implementation

A separate plan: `2026-04-XX-orbital-heroes-meta.md`.

---

# Open questions (defer to implementation)

1. **Hotkeys for abilities** — `Q`/`E` for path A/B is the proposal. But
   experienced TD players expect `1`/`2`. Decision deferred until the
   tower popup is wired and we can A/B test.
2. **Mobile / touch** — the popup has 8 small tier buttons. May need a
   tap-to-expand variant. Out of scope for Phase 1 but should not be
   architecturally precluded.
3. **Multiple heroes per run?** — Phase 4 ships single-hero per run; the
   "second hero slot" Cosmic node is the upgrade hook.
4. **Saved loadouts** — pre-place 3 favorite tower keys in a hotbar?
   Possibly Phase 4. Skip for now.
5. **Achievements** — no separate achievement system planned. Star
   Charts and Trophies (Apocalypse map clears) carry the bragging-rights
   weight.

---

# Effort estimate (rough)

| Phase | Engineering days (solo) | New files | Lines added |
|-------|-------------------------|-----------|-------------|
| 1     | 4-6                     | ~10       | ~3000       |
| 2     | 2-3                     | +0 (extends data files)  | ~1500 (mostly data) |
| 3     | 2-3                     | ~3        | ~1200       |
| 4     | 4-6                     | ~6        | ~2500       |

Total: ~12-18 engineering days for the full vision.

The cleanest milestone gate is Phase 1 — it stands on its own (the same
30-round campaign, same map, but with vastly more depth) and gives us
real telemetry on whether the two-path system feels right before we
build content on top of it.
