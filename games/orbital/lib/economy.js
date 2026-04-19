/* Orbital — economy: round bonus, no-leak streak, combo, interest, stardust.
   All math; no UI. The game calls these helpers from the round-start /
   round-end hooks and renders the recap from the returned breakdown. */
(function () {
  const NDP = window.NDP;
  const O = NDP.Orbital;

  function roundBonusBreakdown(state) {
    // state: { round, leakedThisRound: bool, noLeakStreak, longestCombo }
    // Base scales linearly with round so late-game upgrade purchases (often
    // $3-6k each) stay affordable without farming. R1 = $86, R10 = $140,
    // R30 = $260, R50 = $380. ~50% bigger than the previous curve.
    const base = 80 + state.round * 6;
    // Streak: ×1.0 at streak 0, +0.1 per streak, cap ×2.0 at streak 10.
    const streakMul = state.leakedThisRound
      ? 1.0
      : Math.min(2.0, 1.0 + 0.1 * (state.noLeakStreak + 1));
    const streakBonus = Math.round(base * (streakMul - 1));
    // Combo: extra cash for sustained pop windows. $3 per combo length above 5.
    const comboBonus = Math.max(0, (state.longestCombo || 0) - 5) * 3;
    const total = base + streakBonus + comboBonus;
    return { base, streakMul, streakBonus, comboBonus, total };
  }

  // Quant interest math. Returns the interest paid to the player.
  function applyInterest(quants, cash) {
    if (!quants || !quants.length) return 0;
    let totalRate = 0, totalCap = 0;
    quants = quants.slice().sort(
      (a, b) => (b.stats.interestRate || 0) - (a.stats.interestRate || 0)
    );
    for (let i = 0; i < quants.length; i++) {
      const q = quants[i];
      const w = i === 0 ? 1 : 0.5;
      totalRate += (q.stats.interestRate || 0) * w;
      totalCap  += (q.stats.interestCap  || 0) * w;
      q._dividendPulse = 1.0;
    }
    return Math.min(totalCap, Math.floor(cash * totalRate));
  }

  // Quant bounty aura on enemy death. Returns { bonus, primary }.
  function applyBountyAura(enemy, towers) {
    let mult = 0;
    let primary = null;
    for (const t of towers) {
      if (t.key !== 'quant' && t.key !== 'support') continue;
      // Support B path can also tag for +bounty; both feed the same aura.
      const m = t.stats.bountyMult || 0;
      if (m <= 0) continue;
      const d2 = (t.x - enemy.x) * (t.x - enemy.x) + (t.y - enemy.y) * (t.y - enemy.y);
      const r  = t.stats.range || 0;
      if (d2 > r * r) continue;
      if (!primary || m > (primary.stats.bountyMult || 0)) {
        if (primary) mult += (primary.stats.bountyMult || 0) * 0.5;
        primary = t;
      } else {
        mult += m * 0.5;
      }
    }
    if (primary) mult += primary.stats.bountyMult || 0;
    return { mult, bonus: Math.round(enemy.spec.bounty * mult) };
  }

  // Score → stardust rate. 1 stardust per 1000 score earned this run.
  function stardustFromScore(score) {
    return Math.floor(score / 1000);
  }

  O.Economy = {
    roundBonusBreakdown,
    applyInterest,
    applyBountyAura,
    stardustFromScore
  };
})();
