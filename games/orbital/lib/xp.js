/* Orbital — tower XP / level system.
   Towers earn XP from damage they deal. Each level grants a small passive
   stat bonus stacked on top of the upgrade-derived stats. Quant (no kill
   damage) effectively never levels; that's fine, it earns differently. */
(function () {
  const NDP = window.NDP;
  const O = NDP.Orbital;

  // XP needed to REACH each level. Level 1 is the floor.
  const THRESHOLDS = [0, 40, 130, 320];

  function levelOf(tower) {
    let lvl = 1;
    for (let i = THRESHOLDS.length - 1; i >= 0; i--) {
      if (tower.xp >= THRESHOLDS[i]) { lvl = i + 1; break; }
    }
    return Math.min(lvl, THRESHOLDS.length);
  }

  function nextThreshold(level) {
    return THRESHOLDS[level] || THRESHOLDS[THRESHOLDS.length - 1];
  }

  // Multipliers applied at tower-use sites. Level 1 = no bonus.
  function statMul(level) {
    const k = level - 1;
    return {
      range: 1 + 0.04 * k,
      dmg:   1 + 0.10 * k,
      rate:  1 + 0.05 * k
    };
  }

  // Award XP. Returns true if a new level was reached (caller can flash).
  function grant(tower, amount) {
    if (!tower) return false;
    if (amount <= 0) return false;
    const before = tower.level || 1;
    tower.xp = (tower.xp || 0) + amount;
    const after = levelOf(tower);
    if (after !== before) {
      tower.level = after;
      tower._xpFlash = 1.0;
      return true;
    }
    tower.level = after;
    return false;
  }

  function bumpKills(tower) {
    if (!tower) return;
    tower.kills = (tower.kills || 0) + 1;
  }

  O.XP = { THRESHOLDS, levelOf, nextThreshold, statMul, grant, bumpKills };
})();
