# Orbital Ramp-Up Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Paragon T5 tier for 6 core towers, four graphics-juice wins, and two new towers (Commander + Saboteur) on top of the existing Phase-1 Orbital engine.

**Architecture:** Extends the established `NDP.Orbital.*` namespace. No engine rewrites; all new features attach to existing modules (`data/towers.js`, `data/abilities.js`, `lib/upgrades.js`, `lib/xp.js`, `lib/persist.js`, `ui/side-panel.js`, `game.js`, `sprites.js`) plus one new module `ui/paragon-cinematic.js`.

**Tech Stack:** Vanilla JS, HTML5 canvas, browser-only. No bundler, no tests. Verification is manual via `preview_*` tools against `games/orbital/index.html`.

**Design doc:** `docs/plans/2026-04-19-orbital-rampup-design.md`

**Verification discipline** (per task, unless stated otherwise):
1. `preview_start` (once at start of session) → tab pointed at `/games/orbital/`
2. `preview_eval` window.location.reload() after each edit to `games/orbital/*`
3. `preview_console_logs` — must be clean (no uncaught errors)
4. `preview_snapshot` or `preview_screenshot` for visual tasks
5. Commit with a focused message

**Commit cadence:** one commit per task. All commits end with the
`Co-Authored-By` trailer.

---

## Task 1 — Lifetime-XP persistence

**Files:**
- Modify: `games/orbital/lib/persist.js`
- Modify: `games/orbital/lib/xp.js`

**Step 1:** In `lib/persist.js`, add `lifetimeXp: {}` to the `DEFAULT` object (next to `lifetimeStats`). Add these exports:

```js
function addLifetimeXp(key, amount) {
  if (!Storage) return 0;
  const d = load();
  const cur = Object.assign({}, d.lifetimeXp || {});
  cur[key] = (cur[key] | 0) + Math.max(0, Math.floor(amount));
  d.lifetimeXp = cur;
  save(d);
  return cur[key];
}
function getLifetimeXp(key) {
  if (!Storage) return 0;
  const d = load();
  return ((d.lifetimeXp || {})[key]) | 0;
}
```

Add `addLifetimeXp, getLifetimeXp` to the `O.Persist = { ... }` export block.

**Step 2:** In `lib/xp.js`, extend `grant` so it also accumulates lifetime XP:

```js
function grant(tower, amount) {
  if (!tower) return false;
  if (amount <= 0) return false;
  const before = tower.level || 1;
  tower.xp = (tower.xp || 0) + amount;
  // Bank to persistent lifetime tally (tower.key is stable).
  if (tower.key && O.Persist && O.Persist.addLifetimeXp) {
    O.Persist.addLifetimeXp(tower.key, amount);
  }
  const after = levelOf(tower);
  if (after !== before) {
    tower.level = after;
    tower._xpFlash = 1.0;
    return true;
  }
  tower.level = after;
  return false;
}
```

**Step 3:** Verify in preview console:

```
preview_eval: NDP.Orbital.Persist.addLifetimeXp('dart', 123); NDP.Orbital.Persist.getLifetimeXp('dart')
```

Expected: returns `123` (or 123 + whatever was there). Reload page → call `getLifetimeXp('dart')` → same value persists.

**Step 4:** Commit.

```
feat(orbital): add lifetime-XP persistence per tower key
```

---

## Task 2 — Paragon data shape + unlock logic

**Files:**
- Modify: `games/orbital/data/towers.js`
- Modify: `games/orbital/lib/upgrades.js`

**Step 1:** Add a `paragon` block to each of the 6 core towers in `data/towers.js`. Shape:

```js
paragon: {
  name: 'Apex Bolt',
  cost: 22000,
  unlockLifetimeXp: 5000,
  sprite: 'orb_turret_dart_paragon',
  accent: '#ffd86b',
  desc: 'Master dart platform — storm of bolts.',
  stats: {
    range: 260, fireRate: 11, dmg: 14, pierce: 8,
    projSpeed: 720, proj: 'bolt', priority: 'first'
  },
  ability: 'paragonBoltStorm'
}
```

Use these blocks (numbers per design doc §1):

| Tower   | Name         | Cost  | Sprite suffix | Ability id            |
|---------|--------------|-------|---------------|-----------------------|
| dart    | Apex Bolt    | 22000 | `_paragon`    | paragonBoltStorm      |
| cannon  | Worldbreaker | 28000 | `_paragon`    | paragonOrbitalDrop    |
| beam    | Helios Array | 25000 | `_paragon`    | paragonSunburn        |
| gravity | Null Zone    | 24000 | `_paragon`    | paragonCollapseAll    |
| missile | Harbinger    | 30000 | `_paragon`    | paragonMIRV           |
| sniper  | Watcher      | 35000 | `_paragon`    | paragonErase          |

Stats per design doc. Cannon: `{range:220, fireRate:0.9, dmg:180, splash:130, projSpeed:420, proj:'plasma'}`. Beam: `{range:280, fireRate:0, beamDps:260, chain:8, proj:'beam'}`. Gravity: `{range:240, slow:0.75, collapseRadius:180, pullDps:4}`. Missile: `{range:9999, fireRate:1.6, dmg:90, splash:120, projSpeed:300, proj:'missile'}`. Sniper: `{range:9999, fireRate:0.6, dmg:900, pierce:4, antiArmor:true, projSpeed:900, proj:'bolt'}`.

**Step 2:** In `lib/upgrades.js` add helpers:

```js
function paragonLockReason(tower, cash) {
  const s = spec(tower.key);
  if (!s || !s.paragon) return 'unavailable';
  const pt = tower.pathTiers || { A: 0, B: 0 };
  const hasDualMastery =
    (pt.A >= 4 && pt.B >= 2) || (pt.B >= 4 && pt.A >= 2);
  if (!hasDualMastery) return 'paths';        // need T4+T2
  if ((tower.level | 0) < 3) return 'level';   // in-run L3
  const life = (O.Persist && O.Persist.getLifetimeXp)
    ? O.Persist.getLifetimeXp(tower.key) : 0;
  if (life < (s.paragon.unlockLifetimeXp | 0)) return 'lifetimeXp';
  if ((cash | 0) < s.paragon.cost) return 'cash';
  return null;
}
function canBuyParagon(tower, cash) {
  return paragonLockReason(tower, cash) === null;
}
function buyParagon(tower, cash) {
  if (!canBuyParagon(tower, cash)) {
    return { ok: false, error: paragonLockReason(tower, cash) };
  }
  const s = spec(tower.key);
  const p = s.paragon;
  tower.totalSpent = (tower.totalSpent || 0) + p.cost;
  tower.paragon = true;
  tower.paragonName = p.name;
  tower.paragonAccent = p.accent;
  tower.stats = Object.assign({}, p.stats);
  tower.abilityIds = { A: p.ability || null, B: null };
  tower.abilityCDs = {};
  tower.abilityFx  = {};
  // Level frozen; xp no longer accrues (checked at grant site).
  tower.level = Math.max(tower.level || 1, 3);
  return { ok: true, cost: p.cost, name: p.name, ability: p.ability };
}
```

Export them from `O.Upgrades = { ... }`.

**Step 3:** In `xp.grant`, early-return when tower is paragon (they don't level further). Insert at the top of `grant`:

```js
if (tower.paragon) return false;
```

**Step 4:** Verify in preview console (place a dart, then):

```
preview_eval: const t = game.towers[0]; t.pathTiers = {A:4, B:2}; t.level = 3;
              NDP.Orbital.Persist.addLifetimeXp('dart', 10000);
              NDP.Orbital.Upgrades.paragonLockReason(t, 99999)
```

Expected: `null` (unlocked). Change `level = 1` → returns `'level'`.

**Step 5:** Commit.

```
feat(orbital): paragon data + unlock gate logic
```

---

## Task 3 — Paragon signature abilities

**Files:**
- Modify: `games/orbital/data/abilities.js`

**Step 1:** Append 6 paragon abilities to the `A` object:

```js
paragonBoltStorm: {
  label: 'Bolt Storm', desc: '40 bolts in a fan',
  cd: 75, glyph: 'burst', color: '#ffd86b',
  activate(game, t) {
    for (let i = 0; i < 40; i++) {
      const ang = (i / 40) * Math.PI * 2;
      game.projectiles.push({
        x: t.x, y: t.y, vx: Math.cos(ang)*720, vy: Math.sin(ang)*720,
        dmg: 20, pierce: 6, life: 1.6, type: 'bolt', fromTower: t,
        color: '#ffd86b'
      });
    }
    game.flashMessage('BOLT STORM', '#ffd86b');
  }
},
paragonOrbitalDrop: {
  label: 'Orbital Drop', desc: 'screen-shaking mega shell',
  cd: 90, glyph: 'nuke', color: '#ff5530',
  activate(game, t) {
    let lead = null, ld = -Infinity;
    for (const e of game.enemies) if (e.pathS > ld) { lead = e; ld = e.pathS; }
    const tx = lead ? lead.x : game.canvas.width/2;
    const ty = lead ? lead.y : game.canvas.height/2;
    for (const e of game.enemies) {
      const d2 = (e.x - tx)**2 + (e.y - ty)**2;
      if (d2 <= 200*200) game.damage(e, 600, 'orbital');
    }
    game.particles.add(tx, ty, '#ff5530',
      { count: 80, life: 1.2, speed: 360, size: 6 });
    game.flash('#ff5530', 0.6);
    game.flashMessage('ORBITAL DROP', '#ff5530');
  }
},
paragonSunburn: {
  label: 'Sunburn', desc: 'all enemies burn 8s',
  cd: 75, glyph: 'burn', color: '#ffd86b',
  activate(game, t) {
    for (const e of game.enemies) {
      e.burnT = 8; e.burnDps = 40; e.burnSource = t;
    }
    game.flash('#ffd86b', 0.4);
    game.flashMessage('SUNBURN', '#ffd86b');
  }
},
paragonCollapseAll: {
  label: 'Total Collapse', desc: 'map-wide gravity stun 5s',
  cd: 90, glyph: 'star', color: '#a070ff',
  activate(game, t) {
    for (const e of game.enemies) e.stunUntil = game.time + 5;
    game.flash('#a070ff', 0.5);
    game.flashMessage('TOTAL COLLAPSE', '#a070ff');
  }
},
paragonMIRV: {
  label: 'MIRV Strike', desc: '8 autonomous warheads',
  cd: 80, glyph: 'nuke', color: '#ff8040',
  activate(game, t) {
    const targets = game.enemies.slice()
      .sort((a,b)=>b.maxHp-a.maxHp).slice(0,8);
    for (const e of targets) {
      if (game._abilityICBM) game._abilityICBM(t, e.x, e.y);
    }
    game.flashMessage('MIRV STRIKE', '#ff8040');
  }
},
paragonErase: {
  label: 'Erase', desc: 'instakill top 5 non-bosses',
  cd: 60, glyph: 'crit', color: '#7ae0ff',
  activate(game, t) {
    const list = game.enemies.filter(e=>!e.boss)
      .sort((a,b)=>b.maxHp-a.maxHp);
    for (let i = 0; i < Math.min(5, list.length); i++) {
      game.damage(list[i], 999999, 'sniper');
    }
    game.flashMessage('ERASE', '#7ae0ff');
  }
}
```

**Step 2:** Verify in preview:

```
preview_eval: Object.keys(NDP.Orbital.Abilities.catalog).filter(k=>k.startsWith('paragon')).length
```

Expected: `6`.

**Step 3:** Commit.

```
feat(orbital): 6 paragon signature abilities
```

---

## Task 4 — Paragon UI (side-panel tile + purchase wiring)

**Files:**
- Modify: `games/orbital/ui/side-panel.js`
- Modify: `games/orbital/game.js`

**Step 1:** In `ui/side-panel.js` `_drawSelectedTower`, after the Path B call and before `_drawFooter`, add:

```js
y = this._drawParagonTile(ctx, game, t, spec, x, y, w);
```

Add the new method:

```js
_drawParagonTile(ctx, game, t, spec, x, y, w) {
  if (!spec.paragon || t.paragon) return y;
  const p = spec.paragon;
  const reason = O.Upgrades.paragonLockReason(t, game.cash);
  const ready = reason === null;
  const life = (O.Persist && O.Persist.getLifetimeXp)
    ? O.Persist.getLifetimeXp(t.key) : 0;
  const h = 36;
  const r = { x, y, w, h };
  const hover = this._inRect(game._mx, game._my, r);
  ctx.fillStyle = ready
    ? (hover ? '#3a3000' : '#25200a')
    : '#0a0e1a';
  ctx.fillRect(x, y, w, h);
  const pulse = ready ? (0.5 + 0.5 * Math.sin(game.time * 6)) : 0;
  ctx.strokeStyle = ready
    ? `rgba(255,216,107,${0.6 + 0.4 * pulse})`
    : COLORS.locked;
  ctx.lineWidth = ready ? 2 : 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.fillStyle = ready ? COLORS.cash : COLORS.textDim;
  ctx.font = 'bold 12px ui-sans-serif, system-ui';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('★ ' + p.name, x + 8, y + 12);
  ctx.font = 'bold 10px ui-monospace, monospace';
  ctx.textAlign = 'right';
  ctx.fillStyle = ready ? COLORS.cash : COLORS.textDim;
  ctx.fillText('$' + fmtCash(p.cost), x + w - 8, y + 12);
  ctx.textAlign = 'left';
  ctx.font = '9px ui-monospace, monospace';
  ctx.fillStyle = COLORS.textDim;
  let sub = '';
  if (reason === 'paths')       sub = 'need T4 + T2';
  else if (reason === 'level')  sub = 'need Lv 3';
  else if (reason === 'lifetimeXp') sub = 'lifetime ' + life + '/' + p.unlockLifetimeXp;
  else if (reason === 'cash')   sub = 'insufficient cash';
  else                           sub = 'READY — click to ignite';
  ctx.fillText(sub, x + 8, y + 26);
  this.hits.push({ rect: r, kind: 'buyParagon' });
  return y + h + 6;
}
```

**Step 2:** In `side-panel.js`, find the click handler (`handleClick`) and add a case for `buyParagon`:

```js
} else if (h.kind === 'buyParagon') {
  game.tryBuyParagon(game.selectedTower);
  return true;
```

**Step 3:** In `game.js`, add:

```js
tryBuyParagon(t) {
  if (!t) return;
  const res = O.Upgrades.buyParagon(t, this.cash);
  if (!res.ok) {
    this.flashMessage('PARAGON: ' + res.error, '#ff5566');
    return;
  }
  this.cash -= res.cost;
  this.flashMessage('★ ' + res.name + ' AWAKENED', '#ffd86b');
  // Cinematic hook (Task 6): O.ParagonCinematic && O.ParagonCinematic.start(this, t);
}
```

**Step 4:** Verify in preview:

1. Reload.
2. Place a dart; in console:
   ```
   preview_eval: const t = game.towers[0]; t.pathTiers={A:4,B:2}; t.level=3;
                 NDP.Orbital.Persist.addLifetimeXp('dart', 10000); game.cash = 99999;
                 game.selectTower(t);
   ```
3. `preview_screenshot` of side panel — verify gold paragon tile appears.
4. `preview_click` on the tile — verify tower's stats become paragon stats.
   ```
   preview_eval: game.towers[0].paragon && game.towers[0].stats.dmg
   ```
   Expected: `14`.

**Step 5:** Commit.

```
feat(orbital): paragon UI tile + purchase wiring
```

---

## Task 5 — Paragon sprite rendering + glow aura

**Files:**
- Modify: `games/orbital/sprites.js`
- Modify: `games/orbital/game.js` (drawTower path)

**Step 1:** In `sprites.js`, add 6 paragon sprite entries. For scope, each paragon sprite can be a recolored and enlarged version of its base sprite. Pattern (add near other `orb_turret_*` definitions):

```js
// Paragon sprites — oversized recolors of the base turret.
SPRITES.orb_turret_dart_paragon     = paragonify('orb_turret_dart', '#ffd86b');
SPRITES.orb_turret_cannon_paragon   = paragonify('orb_turret_cannon', '#ff5530');
SPRITES.orb_turret_beam_paragon     = paragonify('orb_turret_beam', '#ffd86b');
SPRITES.orb_turret_gravity_paragon  = paragonify('orb_turret_gravity', '#a070ff');
SPRITES.orb_turret_missile_paragon  = paragonify('orb_turret_missile', '#ff8040');
SPRITES.orb_turret_sniper_paragon   = paragonify('orb_turret_sniper', '#7ae0ff');

function paragonify(baseKey, tint) {
  const base = SPRITES[baseKey];
  if (!base) return null;
  // Wrap the base draw with a 1.3× scale and tint overlay.
  return {
    w: Math.round(base.w * 1.3),
    h: Math.round(base.h * 1.3),
    draw(ctx, x, y, s) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1.3, 1.3);
      base.draw(ctx, 0, 0, s);
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = tint;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(-base.w/2, -base.h/2, base.w, base.h);
      ctx.restore();
    }
  };
}
```

Place `paragonify` helper near the top of the IIFE body before the `SPRITES` entries that use it, or use `var paragonify = function...` hoisting.

**Step 2:** In `game.js` `drawTower` (find via grep), before drawing the tower sprite, pick the paragon variant if applicable:

```js
const spriteKey = t.paragon
  ? (t.stats.sprite || (O.Towers.get(t.key).paragon && O.Towers.get(t.key).paragon.sprite))
  : t.stats.sprite;
```

and use `spriteKey` in the existing sprite draw call. If `t.paragon`, also draw a pulsing aura first:

```js
if (t.paragon) {
  const accent = t.paragonAccent || '#ffd86b';
  const pulse = 0.5 + 0.5 * Math.sin(this.time * 3);
  ctx.save();
  ctx.globalAlpha = 0.15 + 0.15 * pulse;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(t.x, t.y, 34 + pulse * 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
```

**Step 3:** Verify in preview: reload; purchase a paragon (repeat Task 4 Step 4); `preview_screenshot` — verify oversized tinted turret with pulsing aura.

**Step 4:** Commit.

```
feat(orbital): paragon sprites + glow aura
```

---

## Task 6 — Paragon unlock cinematic

**Files:**
- Create: `games/orbital/ui/paragon-cinematic.js`
- Modify: `games/orbital/game.js`
- Modify: `games/orbital/index.html`

**Step 1:** Create `games/orbital/ui/paragon-cinematic.js`:

```js
/* Orbital — paragon unlock cinematic.
   ~1.2s sequence: screen flash, radial shockwave, banner, time scale drop.
   All transient; stored in game._paragonFx. */
(function () {
  const NDP = window.NDP;
  const O = NDP.Orbital;

  const DURATION   = 1.2;
  const TIME_SCALE = 0.35;

  function start(game, tower, paragonDef) {
    game._paragonFx = {
      t: 0,
      tower, name: paragonDef.name,
      accent: paragonDef.accent || '#ffd86b',
      cx: tower.x, cy: tower.y
    };
    // Radial shock particles immediately.
    if (game.particles && game.particles.add) {
      game.particles.add(tower.x, tower.y, paragonDef.accent || '#ffd86b',
        { count: 120, life: 1.2, speed: 400, size: 5 });
    }
    if (game.flash) game.flash(paragonDef.accent || '#ffd86b', 0.45);
  }

  function tick(game, dt) {
    if (!game._paragonFx) return;
    game._paragonFx.t += dt;
    if (game._paragonFx.t >= DURATION) game._paragonFx = null;
  }

  function timeScale(game) {
    return game._paragonFx ? TIME_SCALE : 1.0;
  }

  function draw(ctx, game) {
    const fx = game._paragonFx;
    if (!fx) return;
    const p = Math.min(1, fx.t / DURATION);
    // Banner sliding in from top.
    const bannerY = 40 + (1 - Math.min(1, p * 3)) * -60;
    ctx.save();
    ctx.font = 'bold 28px ui-sans-serif, system-ui';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = fx.accent;
    ctx.shadowColor = fx.accent; ctx.shadowBlur = 20;
    ctx.fillText('★ ' + fx.name.toUpperCase() + ' ★',
      (game.canvas.width - (game.panel ? game.panel.w : 0)) / 2, bannerY);
    ctx.restore();
  }

  function active(game) { return !!game._paragonFx; }

  O.ParagonCinematic = { start, tick, draw, active, timeScale };
})();
```

**Step 2:** In `index.html`, add the new script include in the orbital block after `ui/recap.js` and before `game.js`:

```html
<script src="games/orbital/ui/paragon-cinematic.js?v=3"></script>
```

Also bump existing orbital `?v=` cache-busts to `v=3` if not already there.

**Step 3:** In `game.js`:

- In `update(dt)`, apply the cinematic's time scale to the sim `dt`:
  ```js
  const effDt = dt * (O.ParagonCinematic ? O.ParagonCinematic.timeScale(this) : 1);
  // use effDt for enemy movement, projectile movement, tower cds; real dt for UI.
  O.ParagonCinematic && O.ParagonCinematic.tick(this, dt);
  ```
  Use judgement on which sections of `update` switch to `effDt` — the
  core sim (enemies, projectiles, tower.cd countdown) uses `effDt`; UI
  timers (floaters, flashes, _mx/_my) use raw `dt`. If this gets messy,
  a cheaper alternative is to early-return from `update` while
  cinematic is active, and just advance floater/flash timers. Prefer
  the cheaper version if the slow-mo version introduces bugs.

- In `draw(ctx)`, at the very end (after panel draws): `O.ParagonCinematic && O.ParagonCinematic.draw(ctx, this);`

- In `tryBuyParagon`, uncomment / add: `O.ParagonCinematic && O.ParagonCinematic.start(this, t, O.Towers.get(t.key).paragon);`

**Step 4:** Verify in preview:

1. Reload.
2. Purchase a paragon (Task 4 procedure).
3. `preview_screenshot` mid-cinematic — banner visible, particles visible.
4. `preview_console_logs` — no errors.

**Step 5:** Commit.

```
feat(orbital): paragon unlock cinematic
```

---

## Task 7 — Lead-enemy glow + tower idle breathing

**Files:**
- Modify: `games/orbital/game.js`

**Step 1:** In the enemy-draw pass of `game.js` (find via grep `drawEnemies` or enemy sprite draw loop), add a post-pass:

```js
drawLeadEnemyGlow(ctx) {
  if (!this.enemies.length) return;
  let lead = this.enemies[0];
  for (const e of this.enemies) if (e.pathS > lead.pathS) lead = e;
  ctx.save();
  ctx.strokeStyle = '#ffd86b';
  ctx.lineWidth = 2 + Math.sin(this.time * 6) * 0.8;
  ctx.shadowColor = '#ffd86b'; ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(lead.x, lead.y, (lead.size || 16) + 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
```

Call `this.drawLeadEnemyGlow(ctx)` after the enemy draw loop and before projectile draw.

**Step 2:** In the tower-draw pass, wrap the sprite draw in a scale transform when the tower is idle:

```js
const isIdle = !t.target && (t.cd || 0) > 0.2;
const breathe = isIdle
  ? 1 + 0.025 * Math.sin(this.time * 2 + t.x * 0.01)
  : 1;
ctx.save();
ctx.translate(t.x, t.y);
if (breathe !== 1) ctx.scale(breathe, breathe);
// draw sprite centered at (0, 0) using the existing sprite call, adjusted:
SPRITES[spriteKey].draw(ctx, 0, 0, 1);
ctx.restore();
```

Adapt to the existing draw pattern — if `drawTower` already translates, just multiply the scale. Be surgical.

**Step 3:** Verify in preview: reload, spawn a wave, `preview_screenshot` — lead enemy has a pulsing yellow outline, idle towers gently pulse.

**Step 4:** Commit.

```
feat(orbital): lead-enemy glow + tower idle breathing
```

---

## Task 8 — Per-path sprite variants (system, no new art yet)

**Files:**
- Modify: `games/orbital/sprites.js`
- Modify: `games/orbital/game.js`

**Step 1:** In `sprites.js` add a resolver with fallback:

```js
function spriteForTower(key, variant) {
  const candidate = SPRITES[key + '_' + variant];
  if (candidate) return key + '_' + variant;
  return key;
}
// Expose on the sprites namespace.
if (!O.Sprites) O.Sprites = {};
O.Sprites.forTower = spriteForTower;
```

Place near the top of the IIFE so it's available before the game uses it.

**Step 2:** In `game.js` `drawTower`, where `spriteKey` is chosen, add the path variant branch before the paragon branch:

```js
let variant = null;
const pt = t.pathTiers || { A: 0, B: 0 };
if (pt.A >= 3 && pt.A >= pt.B) variant = 'a';
else if (pt.B >= 3) variant = 'b';
let spriteKey;
if (t.paragon) {
  spriteKey = O.Towers.get(t.key).paragon.sprite;
} else if (variant) {
  spriteKey = O.Sprites.forTower(t.stats.sprite, variant);
} else {
  spriteKey = t.stats.sprite;
}
```

Since no variant art exists yet, `spriteForTower` falls back to the base — safe no-op. This ships the *system* so future art drops work automatically.

**Step 3:** Author 2 proof-of-concept variants in `sprites.js`: `orb_turret_dart_a` (rapid — add an extra barrel stripe via recolor of base) and `orb_turret_dart_b` (sniper — longer barrel shade). Small, mechanical changes on top of the base draw, similar to the paragonify helper:

```js
SPRITES.orb_turret_dart_a = variant_(SPRITES.orb_turret_dart, '#ff9055', 1.05);
SPRITES.orb_turret_dart_b = variant_(SPRITES.orb_turret_dart, '#7ae0ff', 1.00);
function variant_(base, tint, scale) {
  return {
    w: Math.round(base.w * scale), h: Math.round(base.h * scale),
    draw(ctx, x, y, s) {
      ctx.save();
      ctx.translate(x, y); ctx.scale(scale, scale);
      base.draw(ctx, 0, 0, s);
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = tint;
      ctx.globalAlpha = 0.25;
      ctx.fillRect(-base.w/2, -base.h/2, base.w, base.h);
      ctx.restore();
    }
  };
}
```

**Step 4:** Verify in preview: reload, place a dart, upgrade to T3 on path A → `preview_screenshot` — dart has orange tint. Sell, place again, upgrade T3 on path B → cyan tint.

**Step 5:** Commit.

```
feat(orbital): per-path sprite variant system + dart variants
```

---

## Task 9 — Commander tower (hero)

**Files:**
- Modify: `games/orbital/data/towers.js`
- Modify: `games/orbital/data/abilities.js`
- Modify: `games/orbital/sprites.js`
- Modify: `games/orbital/manifest.js`
- Modify: `games/orbital/game.js`
- Modify: `games/orbital/ui/side-panel.js`

**Step 1:** Append to `data/towers.js` TOWERS object:

```js
commander: {
  unlock: { round: 6 },
  maxPerRun: 1,
  hero: true,
  base: {
    name: 'Commander', short: 'Cmdr', cost: 850,
    sprite: 'orb_turret_commander', color: '#4ade80',
    range: 170, fireRate: 2.5, dmg: 6, pierce: 1,
    projSpeed: 560, proj: 'bolt', priority: 'first',
    desc: 'Auto-leveling hero. One per run.'
  },
  paths: {
    A: {
      id: 'tactician', name: 'Tactician', accent: '#4ade80',
      tiers: [
        { cost: 400, label: 'Rally', desc: '+8% fire rate aura', glyph: 'aura',
          patch: { towerBuffFire: 0.08 } },
        { cost: 600, label: 'Long View', desc: '+40 range', glyph: 'range',
          patch: { range: 210 } },
        { cost: 1100, label: 'Marked', desc: 'enemies in aura take +15% dmg',
          glyph: 'crit', patch: { towerBuffFire: 0.1, debuffDmg: 0.15 } },
        { cost: 3200, label: 'Stand Fast', desc: 'fire-rate +100% nearby 8s',
          glyph: 'star', patch: { towerBuffFire: 0.12, debuffDmg: 0.18 },
          ability: 'standFast' }
      ]
    },
    B: {
      id: 'gunner', name: 'Gunner', accent: '#ffd86b',
      tiers: [
        { cost: 350, label: 'Heavy Rounds', desc: '+3 dmg', glyph: 'dmg',
          patch: { dmg: 9 } },
        { cost: 550, label: 'Fast Trigger', desc: '+2 fire rate', glyph: 'rate',
          patch: { fireRate: 4.5 } },
        { cost: 1000, label: 'Anti-Armor', desc: 'pierces armor', glyph: 'shield',
          patch: { antiArmor: true, dmg: 12 } },
        { cost: 2800, label: 'Barrage', desc: '20-round rapid salvo',
          glyph: 'burst', patch: { fireRate: 6, dmg: 15 },
          ability: 'heroBarrage' }
      ]
    }
  }
},
```

**Step 2:** Append to `data/abilities.js`:

```js
standFast: {
  label: 'Stand Fast', desc: '+100% rate on nearby towers, 8s',
  cd: 40, glyph: 'aura', color: '#4ade80',
  activate(g, t) { t.abilityFx.standFast = 8.0; g.flashMessage('STAND FAST', '#4ade80'); },
  tick(g, t, dt) { if (t.abilityFx.standFast) t.abilityFx.standFast = Math.max(0, t.abilityFx.standFast - dt); }
},
heroBarrage: {
  label: 'Barrage', desc: '20 rapid bolts at the leading enemy',
  cd: 35, glyph: 'burst', color: '#ffd86b',
  activate(g, t) {
    let lead = null, ld = -Infinity;
    for (const e of g.enemies) if (e.pathS > ld) { lead = e; ld = e.pathS; }
    if (!lead) return;
    for (let i = 0; i < 20; i++) {
      setTimeout(() => {
        if (!g.enemies.includes(lead)) return;
        const ang = Math.atan2(lead.y - t.y, lead.x - t.x) + (Math.random() - 0.5) * 0.15;
        g.projectiles.push({
          x: t.x, y: t.y, vx: Math.cos(ang)*640, vy: Math.sin(ang)*640,
          dmg: 18, pierce: 2, life: 1.2, type: 'bolt', fromTower: t,
          color: '#ffd86b'
        });
      }, i * 50);
    }
    g.flashMessage('BARRAGE', '#ffd86b');
  }
},
```

**Step 3:** In `sprites.js` add:

```js
SPRITES.orb_turret_commander = variant_(SPRITES.orb_turret_dart, '#4ade80', 1.25);
```

(Placeholder — a green oversized dart. Swap for real art later.)

**Step 4:** In `game.js`:

- On `reset()`, add `this.placedCommander = false;`.
- In `tryPlace` (the placement handler), before placement:
  ```js
  const s = O.Towers.get(this.placeKey);
  if (s.maxPerRun === 1 && this.placedCommander && this.placeKey === 'commander') {
    this.flashMessage('COMMANDER ALREADY DEPLOYED', '#ff5566');
    return;
  }
  ```
- After successful placement of `commander`:
  ```js
  this.placedCommander = true;
  tower.placedRound = this.round;
  ```
- Each round-start (find `startWave` / round-increment hook): for every commander tower, recompute auto-level:
  ```js
  for (const t of this.towers) {
    if (t.key !== 'commander') continue;
    const elapsed = this.round - (t.placedRound || this.round);
    const lvl = Math.min(8, 1 + Math.floor(elapsed / 3));
    t.level = lvl;
  }
  ```
- In the tower update function, factor hero level into `lvlMul`. Since `O.XP.statMul(level)` only goes to level 4 (THRESHOLDS length), extend by using the same formula for higher levels on heroes: inline a commander-specific multiplier:
  ```js
  const lvl = t.level || 1;
  const lvlMul = t.key === 'commander'
    ? { range: 1 + 0.04 * (lvl - 1), dmg: 1 + 0.10 * (lvl - 1), rate: 1 + 0.05 * (lvl - 1) }
    : O.XP.statMul(lvl);
  ```
  (Applies only if the existing site doesn't already handle it.)

**Step 5:** In `ui/side-panel.js` tower-list rendering, add a greyed state + "PLACED" label when `commander` is already placed:

```js
// inside the loop drawing tray tiles:
const locked = spec.maxPerRun === 1 && game.placedCommander && key === 'commander';
if (locked) {
  // draw half-alpha overlay + "PLACED" label
}
```

**Step 6:** In `manifest.js`, ensure `commander` appears in the tower list with unlock round 6.

**Step 7:** Verify in preview:

1. Reload. Play to round 6.
2. Place commander. `preview_eval: game.placedCommander` → `true`.
3. Try to place again — should fail with flash message.
4. After ~3 rounds, `game.towers.find(t=>t.key==='commander').level` → `2`.

**Step 8:** Commit.

```
feat(orbital): Commander hero tower (one per run, auto-levels)
```

---

## Task 10 — Saboteur tower + mine runtime

**Files:**
- Modify: `games/orbital/data/towers.js`
- Modify: `games/orbital/data/abilities.js`
- Modify: `games/orbital/sprites.js`
- Modify: `games/orbital/manifest.js`
- Modify: `games/orbital/game.js`

**Step 1:** Append to `data/towers.js`:

```js
saboteur: {
  unlock: { round: 4 },
  base: {
    name: 'Saboteur', short: 'Sab', cost: 400,
    sprite: 'orb_turret_saboteur', color: '#ff5566',
    range: 140, fireRate: 0, dmg: 0, priority: 'first',
    mineRate: 4, mineCap: 3, mineDmg: 80, mineSplash: 50,
    desc: 'Plants proximity mines along the path.'
  },
  paths: {
    A: {
      id: 'minefield', name: 'Minefield', accent: '#ffd86b',
      tiers: [
        { cost: 280, label: 'More Mines', desc: 'cap +2', glyph: 'splash',
          patch: { mineCap: 5 } },
        { cost: 500, label: 'Dense Field', desc: 'cap +3', glyph: 'splash',
          patch: { mineCap: 8, mineRate: 3 } },
        { cost: 900, label: 'Wide Blast', desc: '+30 splash', glyph: 'aura',
          patch: { mineSplash: 80 } },
        { cost: 2200, label: 'Saturation', desc: 'cluster-drop ability',
          glyph: 'burst', patch: { mineCap: 12 },
          ability: 'mineSaturation' }
      ]
    },
    B: {
      id: 'demolitions', name: 'Demolitions', accent: '#ff5530',
      tiers: [
        { cost: 350, label: 'Heavy Mines', desc: '180 dmg', glyph: 'dmg',
          patch: { mineDmg: 180 } },
        { cost: 600, label: 'Bigger Boom', desc: '+40 splash', glyph: 'splash',
          patch: { mineSplash: 90 } },
        { cost: 1100, label: 'Siege Mines', desc: '350 dmg; cap 1', glyph: 'nuke',
          patch: { mineDmg: 350, mineCap: 1, mineRate: 6 } },
        { cost: 2600, label: 'Nuke Mine', desc: '500 dmg / 150 splash',
          glyph: 'nuke', patch: { mineDmg: 500, mineSplash: 150 },
          ability: 'mineDetonate' }
      ]
    }
  }
},
```

**Step 2:** Append to `data/abilities.js`:

```js
mineSaturation: {
  label: 'Saturation', desc: 'immediately plant cap-worth of mines',
  cd: 25, glyph: 'burst', color: '#ffd86b',
  activate(g, t) {
    const cap = t.stats.mineCap || 3;
    for (let i = 0; i < cap; i++) {
      setTimeout(() => g._plantMine && g._plantMine(t, true), i * 60);
    }
    g.flashMessage('SATURATION', '#ffd86b');
  }
},
mineDetonate: {
  label: 'Detonate', desc: 'detonates all live mines',
  cd: 20, glyph: 'nuke', color: '#ff5530',
  activate(g, t) {
    const mines = (g.mines || []).filter(m => m.owner === t);
    for (const m of mines) g._triggerMine && g._triggerMine(m);
    g.flashMessage('DETONATE', '#ff5530');
  }
}
```

**Step 3:** In `sprites.js` add placeholder sprites:

```js
SPRITES.orb_turret_saboteur = variant_(SPRITES.orb_turret_dart, '#ff5566', 1.05);
SPRITES.orb_mine = {
  w: 14, h: 14,
  draw(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#ff5530';
    ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffd86b'; ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }
};
```

**Step 4:** In `game.js`:

- `reset()` adds `this.mines = [];`.
- Add helpers:
  ```js
  _plantMine(t, fromAbility) {
    if (!this.mines) this.mines = [];
    const live = this.mines.filter(m => m.owner === t);
    if (!fromAbility && live.length >= (t.stats.mineCap || 3)) return;
    // Find a point on the path inside tower range that has no mine.
    const r = t.stats.range;
    const samples = O.Overlay && O.Overlay.pathSamples
      ? O.Overlay.pathSamples() : null;
    if (!samples) return;
    for (let tries = 0; tries < 8; tries++) {
      const s = samples[Math.floor(Math.random() * samples.length)];
      const d2 = (s.x - t.x) ** 2 + (s.y - t.y) ** 2;
      if (d2 > r * r) continue;
      this.mines.push({
        x: s.x, y: s.y, owner: t,
        dmg: t.stats.mineDmg, splash: t.stats.mineSplash,
        size: 8, placedAt: this.time
      });
      return;
    }
  },
  _triggerMine(m) {
    if (!m || !this.mines.includes(m)) return;
    for (const e of this.enemies) {
      const d2 = (e.x - m.x) ** 2 + (e.y - m.y) ** 2;
      if (d2 <= (m.splash * m.splash)) this.damage(e, m.dmg, 'mine');
    }
    this.particles.add(m.x, m.y, '#ff5530',
      { count: 18, life: 0.4, speed: 200, size: 3 });
    this.mines = this.mines.filter(x => x !== m);
  },
  ```
- In tower tick (`updateTower`), for saboteurs, manage the mine-plant
  timer:
  ```js
  if (t.key === 'saboteur') {
    t._mineT = (t._mineT || 0) - dt;
    // Engineer synergy — halve interval if an Engineer is in range.
    let rate = t.stats.mineRate || 4;
    for (const o of this.towers) {
      if (o.key !== 'engineer') continue;
      const d2 = (o.x - t.x) ** 2 + (o.y - t.y) ** 2;
      if (d2 <= (t.stats.range * t.stats.range)) { rate *= 0.5; break; }
    }
    if (t._mineT <= 0) { this._plantMine(t); t._mineT = rate; }
    return; // saboteurs don't shoot
  }
  ```
- In the main update, after enemy movement, check mine triggers:
  ```js
  if (this.mines && this.mines.length) {
    for (const m of this.mines.slice()) {
      for (const e of this.enemies) {
        const d2 = (e.x - m.x) ** 2 + (e.y - m.y) ** 2;
        const hit = (e.size || 16) + 8;
        if (d2 <= hit * hit) { this._triggerMine(m); break; }
      }
    }
  }
  ```
- In the main draw, after enemies (or before towers), draw mines:
  ```js
  if (this.mines) for (const m of this.mines) SPRITES.orb_mine.draw(ctx, m.x, m.y);
  ```

**Step 5:** Engineer synergy visual — in the tower draw pass, if a
saboteur and an engineer are within range of each other, draw a
dotted line between them:

```js
for (const t of this.towers) {
  if (t.key !== 'saboteur') continue;
  for (const o of this.towers) {
    if (o.key !== 'engineer') continue;
    const d2 = (o.x - t.x) ** 2 + (o.y - t.y) ** 2;
    if (d2 > t.stats.range * t.stats.range) continue;
    ctx.save();
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = 'rgba(255, 216, 107, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(t.x, t.y); ctx.lineTo(o.x, o.y);
    ctx.stroke();
    ctx.restore();
  }
}
```

Also apply the Engineer-side speedup: in the Engineer tick, if any
saboteur within range → halve the sentry fire timer. Symmetric to the
saboteur side.

**Step 6:** Verify in preview:

1. Reload. Play to round 4.
2. Place a saboteur on a path curve.
3. `preview_eval: game.mines.length` — returns ≥ 1 after ~4s.
4. Spawn a wave; enemies crossing mines take damage.
5. Place an Engineer near the saboteur → dotted line visible, mine
   rate visibly faster.

**Step 7:** Commit.

```
feat(orbital): Saboteur mine tower with Engineer synergy
```

---

## Task 11 — Index + cache-bust + smoke test

**Files:**
- Modify: `games/orbital/index.html` (if it directly references orbital scripts)
- Modify: root `index.html` if it hosts orbital

**Step 1:** Ensure every orbital script include has a `?v=4` suffix (bump from current `?v=3`). New file included: `ui/paragon-cinematic.js?v=4`.

**Step 2:** Smoke test:

1. `preview_start` (fresh).
2. Play a full R1 → R50 campaign at 4× speed (`preview_click` start-wave button repeatedly). Purchase at least one paragon along the way.
3. `preview_console_logs` — must be clean at the end.
4. `preview_screenshot` — end-screen visible; paragon counter somewhere.

**Step 3:** Commit.

```
chore(orbital): bump cache-bust + smoke-pass after ramp-up
```

---

## Task 12 — Changelog + roadmap note

**Files:**
- Modify: `docs/changelog.md`
- Modify: `docs/roadmap.md`

**Step 1:** Prepend to `docs/changelog.md`:

```
## 2026-04-19 — Orbital Ramp-Up

- **Paragons** for 6 core towers (dart, cannon, beam, gravity, missile,
  sniper). Unlock gated by T4+T2 paths, in-run Level 3, and lifetime XP
  on that tower (persisted across runs). Each paragon replaces the
  tower with fixed stats + a signature mega-ability. Unlock plays a
  1.2s cinematic with slow-mo and banner.
- **Commander** hero unit — one per run, auto-levels 1→8 with round
  number, two upgrade paths (Tactician / Gunner).
- **Saboteur** mine-layer tower — plants proximity mines on the path,
  with an Engineer synergy that halves both tower timers when in range.
- **Graphics juice** — paragon unlock cinematic, lead-enemy path glow,
  idle tower breathing, per-path sprite variant system with dart POC
  variants.
- Lifetime-XP persistence per tower key unlocks the paragon gate
  across runs.
```

**Step 2:** Add to `docs/roadmap.md` under a "Done" section (or wherever prior entries live), and remove any stale "paragon" / "commander" / "saboteur" bullet from the in-progress section.

**Step 3:** Commit.

```
docs(orbital): changelog + roadmap for ramp-up
```

---

# Risks / fallbacks

- **Slow-mo in `update`** — implementing two different `dt` values inside
  `update()` can introduce bugs. Fallback: cinematic simply freezes
  the sim (`return` early from `update` while active) and only the
  banner/particles tick. Less dramatic but safer.
- **Placeholder sprites** — commander / saboteur / paragon sprites
  ship as recolored + scaled reuses of base turret art. Real art is a
  later cosmetic pass that doesn't need a new code path.
- **`setTimeout` in abilities** — already used elsewhere in this
  codebase, so acceptable, but if it causes issues when the game is
  paused, migrate to `tick` timer patterns.
- **Mine placement on path** — depends on `O.Overlay.pathSamples()`. If
  that API doesn't exist or has a different name, introspect the
  module first and adapt. (Step 4 of Task 10.)

# Scope recap

- 12 tasks
- ~12 commits
- ~1800-2200 lines added
- 1 new file (`ui/paragon-cinematic.js`)
- 0 engine rewrites
- 0 new tests (codebase has no test framework for canvas games;
  verification is via `preview_*`)
