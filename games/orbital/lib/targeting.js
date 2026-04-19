/* Orbital — targeting priority registry.
   Returns the BEST enemy in range from a list. Pure; no side-effects. */
(function () {
  const NDP = window.NDP;
  const O = NDP.Orbital;

  const ORDER = ['first', 'last', 'strong', 'close'];
  const LABELS = { first: 'First', last: 'Last', strong: 'Strong', close: 'Close' };

  // PRIORITY FNS. All take (tower, enemiesInRange) and return one enemy.
  // First / Last use pathS (already-progress along the path; higher = closer
  // to the homeworld).
  const FN = {
    first(t, list) {
      let best = null, bv = -Infinity;
      for (const e of list) if (e.pathS > bv) { bv = e.pathS; best = e; }
      return best;
    },
    last(t, list) {
      let best = null, bv = Infinity;
      for (const e of list) if (e.pathS < bv) { bv = e.pathS; best = e; }
      return best;
    },
    strong(t, list) {
      let best = null, bv = -Infinity;
      for (const e of list) if (e.maxHp > bv) { bv = e.maxHp; best = e; }
      return best;
    },
    close(t, list) {
      let best = null, bv = Infinity;
      for (const e of list) {
        const d = (e.x - t.x) * (e.x - t.x) + (e.y - t.y) * (e.y - t.y);
        if (d < bv) { bv = d; best = e; }
      }
      return best;
    }
  };

  function next(priority) {
    const i = ORDER.indexOf(priority);
    return ORDER[(i + 1) % ORDER.length];
  }

  function pickTarget(tower, allEnemies, opts) {
    const range = (tower.stats && tower.stats.range) || 0;
    const fn = FN[tower.priority] || FN.first;
    const list = [];
    for (const e of allEnemies) {
      if (opts && opts.filter && !opts.filter(e)) continue;
      const d2 = (e.x - tower.x) * (e.x - tower.x) + (e.y - tower.y) * (e.y - tower.y);
      if (d2 <= range * range) list.push(e);
    }
    if (!list.length) return null;
    return fn(tower, list);
  }

  O.Targeting = { ORDER, LABELS, FN, next, pickTarget };
})();
