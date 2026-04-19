# Orbital Ramp-Up — Design

Date: 2026-04-19
Status: approved

## Goal

Deepen Orbital's late game and polish without adding new systems that
need balancing from scratch. Three headline pillars:

1. **Paragons** — a T5-equivalent fusion tier for the six "main" towers
2. **Graphics juice** — four visible polish wins
3. **Two new towers** — a hero unit (Commander) and a mine layer (Saboteur)

Explicitly **out of scope**: new maps, freeplay modifiers, new enemy
types. Those come in a later phase.

---

## 1. Paragons

BTD6-style ultimate tier for the six flagship towers: **dart, cannon,
beam, gravity, missile, sniper**. Each paragon replaces the tower in
place with a new, fixed-stats, signature-ability unit.

### Unlock gate (all four required)

1. One path at **T4**, the other at **T2** (Dual Mastery). Already
   legal under the existing path-cap rule, so no rule change.
2. Tower is at **Level 3** (in-run XP max).
3. **Lifetime XP** accumulated on that tower key across runs meets a
   threshold (tentative: 5000). Persisted via `Persist`.
4. The Paragon is actually authored for that tower key (only 6 in this
   phase).

Gating rationale: #1 forces big spend, #2 forces actually using the
tower this run, #3 gives a meta-progression hook that rewards a player
who mains that tower over multiple runs.

### Cost

Custom per paragon, authored on the paragon block. Tentative:

| Tower   | Cost    |
|---------|---------|
| dart    | $22,000 |
| cannon  | $28,000 |
| beam    | $25,000 |
| gravity | $24,000 |
| missile | $30,000 |
| sniper  | $35,000 |

### Behavior

- On purchase, the tower is **replaced in place** with a new runtime
  record. `paragon: true` flag. Fixed stats — no XP, no further
  upgrades, no tier purchases.
- Retains `priority` and `abilityCDs` object shape.
- Gains one **signature mega-ability** on a long CD (60-90s).
- New sprite (paragon-tier art) plus a subtle glow aura rendered
  around the tower.
- Sells for 70% of (totalSpent + paragon cost), consistent with the
  refund formula.

### Paragon catalog (Phase scope)

| Tower   | Name                | Stats                                                   | Signature ability                    |
|---------|---------------------|---------------------------------------------------------|--------------------------------------|
| dart    | **Apex Bolt**       | rate 11, dmg 14, pierce 8, range 260, global targeting  | **Bolt Storm** — 40 bolts in a fan    |
| cannon  | **Worldbreaker**    | dmg 180, splash 130, rate 0.9, range 220                | **Orbital Drop** — screen mega-shell  |
| beam    | **Helios Array**    | beamDps 260, chain 8, range 280                         | **Sunburn** — all enemies burn 8s     |
| gravity | **Null Zone**       | slow 0.75, range 240, collapse radius 180               | **Collapse Everything** — map stun    |
| missile | **Harbinger**       | dmg 90, splash 120, rate 1.6, range global              | **MIRV** — 8 autonomous warheads      |
| sniper  | **Watcher**         | dmg 900, rate 0.6, range global, antiArmor, pierce 4    | **Erase** — instakill top 5 non-boss  |

### UI

Below the two path trees in the side panel, render a "★ PARAGON" tile
that spans the full panel width. States:

- **Hidden** — no paragon authored for this tower
- **Locked (gated)** — shown in grey with a short reason: `Need L3`,
  `Need T4+T2`, `Lifetime XP 3210/5000`, `Need $25,000`
- **Ready** — pulsing gold border, ability glyph, name, cost

Click → fires paragon cinematic (see §2) → replaces tower → re-selects.

---

## 2. Graphics juice

### 2A. Paragon unlock cinematic

~1.2s sequence on paragon purchase:

1. `0.0s` — screen flash (paragon accent color, 0.4 alpha, fades in 0.3s)
2. `0.0s` — radial shock wave (120 particles, 400px/s, color-tinted)
3. `0.0s` — "★ APEX BOLT" banner slides in at top of play area for 1.8s
4. `0.0s-0.5s` — camera micro-zoom: play-area canvas draws with 1.04×
   scale centered on the tower, lerping back to 1.0× by 0.5s
5. `0.1s` — audio cue (single deep "bong"; reuse an existing asset if
   possible, skip if not convenient)
6. `0.0s-1.2s` — time scale drops to 0.35× for the full 1.2s, then
   restores — enemies frozen-feel while the tower "ignites"

Owned by a new module `ui/paragon-cinematic.js`:

```js
O.ParagonCinematic = {
  start(game, tower, paragonDef) { /* sets game._paragonFx = {...} */ },
  tick(game, dt)    { /* decrements timers; restores timeScale */ },
  draw(ctx, game)   { /* flash, shockwave, banner, scale transform */ },
  active(game)      { return !!game._paragonFx; }
};
```

`game.update` checks `ParagonCinematic.active()` and gates the main
sim's `dt` through the cinematic's time scale. `game.draw` calls
`ParagonCinematic.draw()` last so it overlays everything.

### 2B. Per-path sprite variants

Each of the 16 towers gets two alternate sprites — one per path.
Chosen by `drawTower()` like so:

```
variant = 'base'
if (pathTiers.A >= 3) variant = 'a'
else if (pathTiers.B >= 3) variant = 'b'
spriteKey = towerSpriteFor(towerKey, variant)
```

We keep `tower.stats.sprite` as the base; a new helper
`O.Sprites.forTower(key, variant)` returns the variant key. Fallback
chain: `{key}_{variant}` → `{key}` if missing.

Sprite work: 32 new SVG variants (16 × 2) + 6 paragon sprites + 1
commander + 1 saboteur + 1 mine = **41 new sprites**. For Phase scope
we can **ship 2A/2C/2D without all variants done** and add variants
progressively; the fallback chain guarantees base sprites still
render.

### 2C. Lead-enemy path glow

Every frame, find the enemy with the highest `pathS` (already tracked
for targeting). Draw a pulsing 2px stroke around it:

```js
ctx.save();
ctx.strokeStyle = '#ffd86b';
ctx.lineWidth = 2 + Math.sin(game.time * 6) * 0.8;
ctx.beginPath();
ctx.arc(lead.x, lead.y, lead.size + 4, 0, Math.PI * 2);
ctx.stroke();
ctx.restore();
```

Added to `drawEnemies()` as a post-pass. Skip if no enemies alive.

### 2D. Tower idle breathing

Towers with no `target` and `cd > 0.2s` render with scale
`1 + 0.025 * sin(time * 2 + tower.x * 0.01)`. The per-tower phase
offset (`tower.x * 0.01`) prevents the whole army pulsing in sync.
Implemented in the draw pass of `drawTower()`.

---

## 3. Two new towers

### 3A. Commander (hero)

**Identity**: mid-range multi-gun unit, placed once per run, levels
passively with round number.

| Field        | Value                                                         |
|--------------|---------------------------------------------------------------|
| cost         | $850                                                          |
| range        | 170                                                           |
| fireRate     | 2.5                                                           |
| dmg          | 6                                                             |
| projSpeed    | 560                                                           |
| max per run  | 1 (tray tile greys out once placed)                           |

**Auto-level**: `commanderLevel = min(8, 1 + floor(roundsElapsedSincePlaced / 3))`.
Per-level passive: `+5% rate, +3 dmg, +4 range`.

**Paths**:
- A · **Tactician** — T1 buff aura (+8% rate nearby), T2 range +40, T3
  debuff aura (enemies in range take +15% dmg), T4 **Stand Fast** ability
  (+100% rate to all towers in aura for 8s).
- B · **Gunner** — T1 +3 dmg, T2 +2 fire rate, T3 heavy-bolt anti-armor,
  T4 **Barrage** ability (20-round rapid salvo).

No paragon (the unit IS the hero; leveling is its growth system).

### 3B. Saboteur (mine layer)

**Identity**: doesn't shoot. Periodically drops mines onto the nearest
path tile. Enemy crossing triggers mine → splash damage.

| Field       | Value                            |
|-------------|----------------------------------|
| cost        | $400                             |
| range       | 140 (only places mines within)   |
| mineRate    | every 4s                         |
| mineCap     | 3 live at once                   |
| mineDmg     | 80                               |
| mineSplash  | 50                               |
| mineTrigger | first enemy to cross + 8px       |

**Paths**:
- A · **Minefield** — T1 cap 5, T2 cap 8, T3 splash +30, T4
  **Saturation** — on ability, drops cap-worth of mines in a cluster
  along 60px of path (CD 25s).
- B · **Demolitions** — T1 dmg 180, T2 splash 90, T3 one-at-a-time
  heavies, T4 **Nuke Mine** — one mine with 500 dmg / 150 splash;
  ability **Detonate** — manual trigger of all live mines (CD 20s).

**Engineer synergy**: if any Engineer is within `range` of a Saboteur,
both get their mine/sentry timers halved. Visual: faint dotted line
between them while in range.

Mines are new renderable entities. Model:

```js
game.mines = [];   // { x, y, dmg, splash, life, owner, placedAt, size }
```

- Tick: nothing passive; check enemy overlap each frame.
- Trigger: enemies within `(size + mineTrigger)` → damage all within
  `splash` and remove mine.
- Render: small glinting disc with pulsing outline.

---

## 4. File plan

**Modify**:
- `games/orbital/data/towers.js` — add `paragon:` blocks to 6 towers;
  add `commander` + `saboteur` entries; add `maxPerRun: 1` to
  commander.
- `games/orbital/data/abilities.js` — 6 paragon abilities, 2 commander
  abilities, 2 saboteur abilities (10 new entries).
- `games/orbital/lib/upgrades.js` — `canBuyParagon`, `buyParagon`,
  `paragonLockReason` helpers.
- `games/orbital/lib/xp.js` — `bumpLifetimeXp(key, amount)`;
  `getLifetimeXp(key)`.
- `games/orbital/lib/persist.js` — `lifetimeXp: { [key]: n }` field in
  DEFAULT; `addLifetimeXp`, `getLifetimeXp` exports.
- `games/orbital/ui/side-panel.js` — render paragon tile below path
  trees; hero "placed" indicator on tray.
- `games/orbital/sprites.js` — per-path variants + paragon + commander
  + saboteur + mine sprites. Graceful fallback.
- `games/orbital/game.js` — wire paragon purchase flow, lead-glow
  draw, idle-breathing, per-path sprite picker, commander placement
  cap & auto-leveling, saboteur mine runtime, cinematic integration.
- `games/orbital/manifest.js` — unlock gates for new towers (round 6
  for commander, round 4 for saboteur, matching current mid-game
  unlock density).

**Create**:
- `games/orbital/ui/paragon-cinematic.js` — cinematic module.

**Index**:
- `index.html` — bump orbital file `?v=` cache-bust.

---

## 5. Acceptance criteria

- [ ] Paragon tile renders under path trees for all 6 core towers
- [ ] Paragon tile shows specific lock reason when unbuyable
- [ ] Paragon buy triggers the cinematic; after it, the tower is
      replaced and selectable
- [ ] Paragon sells for 70% of (totalSpent + paragonCost)
- [ ] Lifetime XP is accumulated across runs and visible in the lock
      reason when gating
- [ ] Placing a Commander greys the tray tile; a second placement
      attempt is a no-op with a brief "Commander already deployed"
      message
- [ ] Commander auto-levels 1→8 over the run
- [ ] Saboteur places mines on the path within its range; mines
      detonate on enemy contact
- [ ] Engineer within Saboteur range visibly links (dotted line) and
      both fire faster
- [ ] Lead enemy has a visible pulsing outline at all times
- [ ] Idle towers breathe subtly (no sync across the army)
- [ ] Each tower's placed sprite changes visually once a path reaches
      T3, different per A vs B
- [ ] All existing Phase-1 functionality (regular upgrades, XP,
      targeting, abilities, recap, stardust) still works
- [ ] No console errors during a full R1→R50 run plus one paragon
      purchase

---

## 6. Risks

- **Cinematic disruption** — a 1.2s slow-mo in the middle of a wave
  can feel bad if the player is already behind. Mitigation: cinematic
  only triggers on paragon purchase (a deliberate act), not
  automatically.
- **Sprite authoring load** — 41 new sprites is a lot. Mitigation:
  ship base + fallback first, commit variants incrementally. The
  fallback chain means a missing `_a` variant gracefully uses the
  base sprite — so we can ship the *system* immediately and fill in
  art in a follow-up pass.
- **Balance drift** — paragons at fixed cost may make R50 trivial on
  Easy and still hard on freeplay. Mitigation: ship with cost and
  stat numbers in a clearly-labeled "beta" comment block, plan a
  post-playtest tuning commit.
- **Commander singleton logic** — forgetting to reset the "placed"
  flag on run reset would prevent placement on a new run.
  Mitigation: commander-placed state lives on `game.placedCommander`
  (boolean), which is reset in `game.reset()` alongside other
  per-run state.
