/* Orbital — 50-round campaign across 5 acts.
   Each round has groups: an array of { count, tier, gap, mods?, delay? }.
     count : how many enemies in the group
     tier  : key into data/enemies.js
     gap   : seconds between spawns within the group
     mods  : optional list of modifier ids (camo, lead, fortified, swift, ...)
     delay : seconds AFTER the previous group's last spawn to start

   Acts:
     Act I   (R1-10)  : tutorial / no mods
     Act II  (R11-20) : introduce camo + lead, summoners
     Act III (R21-30) : armored + regen, fortified bosses; act boss R30
     Act IV  (R31-40) : mixed mods, swarmer chains, ufos
     Act V   (R41-50) : escalation, mid-boss R45, mega-boss R50

   This is intentionally hand-tuned for early rounds and gradually shifts
   to formulaic for late rounds where pure scale matters more than
   bespoke composition. */
(function () {
  const NDP = window.NDP;
  const O = NDP.Orbital;

  const R = [];

  // ---------- ACT I (R1-10) ----------
  R[0]  = [ { count: 8,  tier: 'ast',   gap: 0.6 } ];
  R[1]  = [ { count: 12, tier: 'ast',   gap: 0.5 } ];
  R[2]  = [ { count: 6,  tier: 'ast',   gap: 0.4 },
            { count: 6,  tier: 'drone', gap: 0.5, delay: 1.2 } ];
  R[3]  = [ { count: 14, tier: 'ast',   gap: 0.35 },
            { count: 4,  tier: 'drone', gap: 0.6, delay: 1.0 } ];
  R[4]  = [ { count: 10, tier: 'drone', gap: 0.45 } ];
  R[5]  = [ { count: 18, tier: 'ast',   gap: 0.3 },
            { count: 6,  tier: 'drone', gap: 0.5, delay: 0.8 } ];
  R[6]  = [ { count: 4,  tier: 'bigast',gap: 1.4 } ];
  R[7]  = [ { count: 14, tier: 'drone', gap: 0.4 },
            { count: 4,  tier: 'bigast',gap: 1.6, delay: 1.2 } ];
  R[8]  = [ { count: 22, tier: 'ast',   gap: 0.22 },
            { count: 8,  tier: 'drone', gap: 0.45, delay: 0.6 } ];
  R[9]  = [ { count: 6,  tier: 'bigast',gap: 1.2 },
            { count: 12, tier: 'drone', gap: 0.4, delay: 1.0 } ];

  // ---------- ACT II (R11-20) — camo, lead, summoners ----------
  R[10] = [ { count: 14, tier: 'ast',   gap: 0.3, mods: ['camo'] } ];
  R[11] = [ { count: 8,  tier: 'drone', gap: 0.45 },
            { count: 8,  tier: 'ast',   gap: 0.3, mods: ['camo'], delay: 0.8 } ];
  R[12] = [ { count: 10, tier: 'ast',   gap: 0.4, mods: ['lead'] } ];
  R[13] = [ { count: 6,  tier: 'bigast',gap: 1.2 },
            { count: 12, tier: 'drone', gap: 0.35, mods: ['swift'], delay: 1.0 } ];
  R[14] = [ { count: 2,  tier: 'summoner', gap: 3.0 } ];
  R[15] = [ { count: 14, tier: 'drone', gap: 0.4, mods: ['camo'] },
            { count: 6,  tier: 'ast',   gap: 0.3, mods: ['lead'], delay: 1.0 } ];
  R[16] = [ { count: 4,  tier: 'bigast',gap: 1.4, mods: ['regen'] } ];
  R[17] = [ { count: 18, tier: 'drone', gap: 0.32, mods: ['swift'] } ];
  R[18] = [ { count: 3,  tier: 'summoner', gap: 2.5 },
            { count: 8,  tier: 'ast',   gap: 0.4, delay: 1.5 } ];
  R[19] = [ { count: 8,  tier: 'bigast',gap: 1.0, mods: ['lead'] },
            { count: 6,  tier: 'drone', gap: 0.4, mods: ['camo'], delay: 1.5 } ];

  // ---------- ACT III (R21-30) — armored, regen, fortified ----------
  R[20] = [ { count: 12, tier: 'drone', gap: 0.32, mods: ['armored'] } ];
  R[21] = [ { count: 16, tier: 'ast',   gap: 0.25, mods: ['camo','swift'] } ];
  R[22] = [ { count: 4,  tier: 'summoner', gap: 2.0 },
            { count: 10, tier: 'drone', gap: 0.4, mods: ['armored'], delay: 1.0 } ];
  R[23] = [ { count: 6,  tier: 'bigast',gap: 1.0, mods: ['regen','lead'] } ];
  R[24] = [ { count: 1,  tier: 'ufo',   gap: 1.0 } ];
  R[25] = [ { count: 24, tier: 'ast',   gap: 0.18, mods: ['armored'] },
            { count: 6,  tier: 'drone', gap: 0.4, mods: ['camo'], delay: 0.8 } ];
  R[26] = [ { count: 6,  tier: 'summoner', gap: 1.8, mods: ['armored'] } ];
  R[27] = [ { count: 2,  tier: 'ufo',   gap: 5.0 },
            { count: 14, tier: 'drone', gap: 0.4, mods: ['swift'], delay: 1.5 } ];
  R[28] = [ { count: 8,  tier: 'bigast',gap: 0.85, mods: ['regen'] },
            { count: 12, tier: 'ast',   gap: 0.25, mods: ['camo','lead'], delay: 1.5 } ];
  R[29] = [ { count: 1,  tier: 'boss',  gap: 1.0, mods: ['fortified'] } ];

  // ---------- ACT IV (R31-40) — escalation ----------
  R[30] = [ { count: 24, tier: 'drone', gap: 0.25, mods: ['armored'] } ];
  R[31] = [ { count: 8,  tier: 'summoner', gap: 1.2, mods: ['camo'] } ];
  R[32] = [ { count: 32, tier: 'ast',   gap: 0.16, mods: ['swift','camo'] } ];
  R[33] = [ { count: 10, tier: 'bigast',gap: 0.7, mods: ['regen','lead'] },
            { count: 1,  tier: 'ufo',   gap: 1.0, delay: 1.5 } ];
  R[34] = [ { count: 1,  tier: 'boss',  gap: 1.0, mods: ['regen','fortified'] } ];
  R[35] = [ { count: 16, tier: 'drone', gap: 0.3, mods: ['armored','swift'] },
            { count: 8,  tier: 'summoner', gap: 1.5, delay: 1.5 } ];
  R[36] = [ { count: 3,  tier: 'ufo',   gap: 4.0, mods: ['armored'] } ];
  R[37] = [ { count: 40, tier: 'ast',   gap: 0.13, mods: ['camo','lead'] } ];
  R[38] = [ { count: 12, tier: 'bigast',gap: 0.6, mods: ['regen','armored'] },
            { count: 18, tier: 'drone', gap: 0.3, mods: ['swift','camo'], delay: 1.0 } ];
  R[39] = [ { count: 2,  tier: 'boss',  gap: 8.0, mods: ['fortified'] } ];

  // ---------- ACT V (R41-50) — finale ----------
  R[40] = [ { count: 30, tier: 'drone', gap: 0.22, mods: ['armored','swift','camo'] } ];
  R[41] = [ { count: 12, tier: 'summoner', gap: 1.0, mods: ['lead','armored'] } ];
  R[42] = [ { count: 4,  tier: 'ufo',   gap: 3.0, mods: ['regen'] },
            { count: 24, tier: 'drone', gap: 0.25, mods: ['camo','armored'], delay: 1.5 } ];
  R[43] = [ { count: 16, tier: 'bigast',gap: 0.5, mods: ['regen','fortified'] } ];
  R[44] = [ { count: 1,  tier: 'boss',  gap: 1.0, mods: ['regen','fortified','armored'] } ];
  R[45] = [ { count: 60, tier: 'ast',   gap: 0.10, mods: ['swift','camo','lead'] } ];
  R[46] = [ { count: 24, tier: 'drone', gap: 0.18, mods: ['armored','swift'] },
            { count: 12, tier: 'summoner', gap: 0.8, mods: ['camo'], delay: 1.5 } ];
  R[47] = [ { count: 6,  tier: 'ufo',   gap: 2.5, mods: ['armored','regen'] } ];
  R[48] = [ { count: 2,  tier: 'boss',  gap: 6.0, mods: ['regen','fortified'] },
            { count: 20, tier: 'drone', gap: 0.3, mods: ['camo','swift'], delay: 2.0 } ];
  R[49] = [ { count: 1,  tier: 'titan', gap: 1.0, mods: ['regen','fortified'] } ];

  function count() { return R.length; }
  function get(round1based) {
    const i = round1based - 1;
    if (i < 0) return null;
    if (i >= R.length) {
      // Endless tail — scale the last round.
      const base = R[R.length - 1];
      const scale = 1 + (i - R.length + 1) * 0.25;
      return base.map(g => Object.assign({}, g, { count: Math.round(g.count * scale) }));
    }
    return R[i];
  }

  // Per-act metadata (used for the recap banner color and act intro).
  const ACTS = [
    { from: 1,  to: 10, name: 'Act I — First Contact',      color: '#7ae0ff' },
    { from: 11, to: 20, name: 'Act II — Hidden Threats',    color: '#ffd86b' },
    { from: 21, to: 30, name: 'Act III — Heavy Assault',    color: '#ff9055' },
    { from: 31, to: 40, name: 'Act IV — Escalation',        color: '#ff4fd8' },
    { from: 41, to: 50, name: 'Act V — Final Stand',        color: '#a070ff' }
  ];
  function actFor(round) {
    for (const a of ACTS) if (round >= a.from && round <= a.to) return a;
    return ACTS[ACTS.length - 1];
  }

  O.Rounds = { count, get, ACTS, actFor };
})();
