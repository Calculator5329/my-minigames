/* Orbital — upgrade-tier path-tree logic.
   Pure data; no game state; no canvas. Every helper takes a placed tower
   instance (`{ key, pathTiers: { A, B }, totalSpent }`) and the TOWERS
   catalog from data/towers.js.

   Path-cap rule: a tower may have AT MOST one path above tier 2. So if you
   have B at T3+, A is locked at T2. Selling the high path frees the cap.

   Tower runtime stats are derived by starting from `base`, then applying
   each bought tier's `patch` in order (path A T1..n, path B T1..n).
   Patches are last-write-wins so a higher tier can overwrite an earlier
   stat. This keeps tier authoring trivial. */
(function () {
  const NDP = window.NDP;
  const O = NDP.Orbital;

  function spec(key)    { return O.Towers && O.Towers.catalog[key]; }
  function pathDef(key, p) { const s = spec(key); return s && s.paths && s.paths[p]; }
  function tierDef(key, p, n) {
    const pd = pathDef(key, p);
    if (!pd || n < 1 || n > pd.tiers.length) return null;
    return pd.tiers[n - 1];
  }

  // Max tier the player may currently buy on this path, given the path-cap.
  function allowedTiers(tower, path) {
    const other = path === 'A' ? 'B' : 'A';
    const otherTier = (tower.pathTiers && tower.pathTiers[other]) || 0;
    return otherTier <= 2 ? 4 : 2;
  }

  function canBuy(tower, path, n, cash) {
    const cur = (tower.pathTiers && tower.pathTiers[path]) || 0;
    if (n !== cur + 1) return false;
    if (n > allowedTiers(tower, path)) return false;
    const td = tierDef(tower.key, path, n);
    if (!td) return false;
    return cash >= td.cost;
  }

  function lockReason(tower, path, n) {
    const cur = (tower.pathTiers && tower.pathTiers[path]) || 0;
    if (n <= cur) return 'owned';
    if (n !== cur + 1) return 'sequential';
    if (n > allowedTiers(tower, path)) return 'pathcap';
    return null;
  }

  // Recompute tower.stats from base + every applied tier patch.
  // Mutates `tower.stats`. Returns the new stats for convenience.
  function rebuildStats(tower) {
    const s = spec(tower.key);
    if (!s) return tower.stats;
    const stats = Object.assign({}, s.base);
    const order = ['A', 'B'];
    for (const p of order) {
      const n = (tower.pathTiers && tower.pathTiers[p]) || 0;
      const pd = pathDef(tower.key, p);
      if (!pd) continue;
      for (let i = 0; i < n; i++) {
        const patch = pd.tiers[i].patch || {};
        Object.assign(stats, patch);
      }
    }
    tower.stats = stats;
    // Track top-tier abilities (path A and path B), if any.
    tower.abilityIds = {
      A: tower.pathTiers.A > 0 ? topAbility(tower.key, 'A', tower.pathTiers.A) : null,
      B: tower.pathTiers.B > 0 ? topAbility(tower.key, 'B', tower.pathTiers.B) : null
    };
    return stats;
  }

  function topAbility(key, p, tier) {
    // Highest-tier patch on this path that defined an `ability` field wins.
    const pd = pathDef(key, p);
    if (!pd) return null;
    let id = null;
    for (let i = 0; i < tier; i++) {
      if (pd.tiers[i].ability) id = pd.tiers[i].ability;
    }
    return id;
  }

  // Apply purchase. Returns { ok, cost, error? }.
  function buy(tower, path, n, cash) {
    if (!canBuy(tower, path, n, cash)) {
      return { ok: false, error: lockReason(tower, path, n) || 'cash' };
    }
    const td = tierDef(tower.key, path, n);
    tower.pathTiers[path] = n;
    tower.totalSpent = (tower.totalSpent || 0) + td.cost;
    rebuildStats(tower);
    return { ok: true, cost: td.cost, label: td.label, ability: td.ability || null };
  }

  function refundValue(tower) {
    return Math.floor((tower.totalSpent || 0) * 0.7);
  }

  // Fresh placed-tower record.
  function newPlacedTower(key, x, y, time) {
    const s = spec(key);
    if (!s) return null;
    const tower = {
      key, x, y,
      pathTiers: { A: 0, B: 0 },
      stats: null,
      kills: 0, xp: 0, level: 1, _xpFlash: 0,
      cd: 0, angle: 0, target: null, beamTarget: null,
      collapseCd: 0, pulseCd: 0,
      placedAt: time || 0,
      totalSpent: s.base.cost,
      priority: s.base.priority || 'first',
      abilityIds: { A: null, B: null },
      abilityCDs: {},     // id -> seconds remaining
      abilityFx: {}       // id -> animation timer
    };
    rebuildStats(tower);
    return tower;
  }

  function paragonLockReason(tower, cash) {
    const s = spec(tower.key);
    if (!s || !s.paragon) return 'unavailable';
    const pt = tower.pathTiers || { A: 0, B: 0 };
    const hasDualMastery =
      (pt.A >= 4 && pt.B >= 2) || (pt.B >= 4 && pt.A >= 2);
    if (!hasDualMastery) return 'paths';
    if ((tower.level | 0) < 3) return 'level';
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
    tower.stats.sprite = p.sprite;
    tower.abilityIds = { A: p.ability || null, B: null };
    tower.abilityCDs = {};
    tower.abilityFx  = {};
    tower.level = Math.max(tower.level || 1, 3);
    return { ok: true, cost: p.cost, name: p.name, ability: p.ability };
  }

  O.Upgrades = {
    spec, pathDef, tierDef,
    allowedTiers, canBuy, lockReason,
    rebuildStats, buy, refundValue,
    newPlacedTower, topAbility,
    paragonLockReason, canBuyParagon, buyParagon
  };
})();
