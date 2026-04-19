/* Learn to Heist — medals (achievements).
   25 medals across 7 themes. Each is a single-condition lifetime tracker
   that pays out once on award. Designed to drive experimentation between
   the day campaign and the upgrade shop. */
(function () {
  const NDP = window.NDP;
  NDP.LTH = NDP.LTH || {};
  const LTH = NDP.LTH;

  // kinds the game pumps progress through:
  //   distance (m, run-best)        altitude (m, run-best)
  //   speed (m/s, run-best)         coins (per-run total)
  //   stunts (per-run count)        skips (ground bounces, per-run)
  //   time (seconds, per-run)       fuelLeftPct (final fuel %, per-run)
  //   fuelBurned (boolean — burned all fuel this run)
  //   noHazardsDist (distance flown without a hit, per-run)
  //   vaultPunch (one-shot)         endlessDistance (post-vault)
  //
  // Each medal stores `progress` (best-ever value) and `earned` (bool).
  LTH.MEDALS = [
    // ------- distance -------
    { id: 'first_flight',  name: 'First Flight',   desc: 'Fly 100 m.',           kind: 'distance', target:   100, reward:   10, theme: 'distance' },
    { id: 'sky_tourist',   name: 'Sky Tourist',    desc: 'Fly 1,000 m.',         kind: 'distance', target:  1000, reward:   60, theme: 'distance' },
    { id: 'long_hauler',   name: 'Long Hauler',    desc: 'Fly 5,000 m.',         kind: 'distance', target:  5000, reward:  220, theme: 'distance' },
    { id: 'globetrotter',  name: 'Globetrotter',   desc: 'Fly 15,000 m.',        kind: 'distance', target: 15000, reward:  600, theme: 'distance' },
    { id: 'vault_chaser',  name: 'Vault Chaser',   desc: 'Fly 50,000 m total.',  kind: 'distance', target: 50000, reward: 1500, theme: 'distance' },

    // ------- altitude -------
    { id: 'liftoff',       name: 'Liftoff',        desc: 'Reach 200 m altitude.',     kind: 'altitude', target:  200, reward:   10, theme: 'altitude' },
    { id: 'cloudbreaker',  name: 'Cloudbreaker',   desc: 'Reach 800 m altitude.',     kind: 'altitude', target:  800, reward:   80, theme: 'altitude' },
    { id: 'stratonaut',    name: 'Stratonaut',     desc: 'Reach 1,500 m altitude.',   kind: 'altitude', target: 1500, reward:  240, theme: 'altitude' },
    { id: 'astronaut',     name: 'Astronaut',      desc: 'Reach 2,200 m altitude.',   kind: 'altitude', target: 2200, reward:  600, theme: 'altitude' },
    { id: 'orbital',       name: 'Orbital Goblin', desc: 'Reach 3,000 m altitude.',   kind: 'altitude', target: 3000, reward: 1500, theme: 'altitude' },

    // ------- speed -------
    { id: 'speed_demon',   name: 'Speed Demon',    desc: 'Hit 800 m/s.',         kind: 'speed', target:  800, reward:  100, theme: 'speed' },
    { id: 'mach_goblin',   name: 'Mach Goblin',    desc: 'Hit 1,500 m/s.',       kind: 'speed', target: 1500, reward:  300, theme: 'speed' },
    { id: 'hypersonic',    name: 'Hypersonic',     desc: 'Hit 2,500 m/s.',       kind: 'speed', target: 2500, reward:  800, theme: 'speed' },

    // ------- coins -------
    { id: 'pocket_change', name: 'Pocket Change',  desc: 'Collect 50 coins in one run.',   kind: 'coins', target:  50, reward:  60, theme: 'coins' },
    { id: 'big_spender',   name: 'Big Spender',    desc: 'Collect 200 coins in one run.',  kind: 'coins', target: 200, reward: 220, theme: 'coins' },
    { id: 'greedy_goblin', name: 'Greedy Goblin',  desc: 'Collect 500 coins in one run.',  kind: 'coins', target: 500, reward: 600, theme: 'coins' },

    // ------- stunts / skips -------
    { id: 'spin_doctor',   name: 'Spin Doctor',    desc: 'Land 5 stunts in one run.',  kind: 'stunts', target:  5, reward: 100, theme: 'stunts' },
    { id: 'acrobatics',    name: 'Acrobatics',     desc: 'Land 10 stunts in one run.', kind: 'stunts', target: 10, reward: 300, theme: 'stunts' },
    { id: 'skipping_stones', name: 'Skipping Stones', desc: 'Skip the ground 5 times in one run.', kind: 'skips',  target:  5, reward: 120, theme: 'stunts' },

    // ------- fuel -------
    { id: 'efficient',     name: 'Efficient',      desc: 'Finish a run with 50%+ fuel left.', kind: 'fuelLeftPct', target: 0.5, reward: 100, theme: 'fuel' },
    { id: 'wasteful',      name: 'Burnout',        desc: 'Burn all fuel in one run.',         kind: 'fuelBurned',  target:   1, reward:  50, theme: 'fuel' },

    // ------- special -------
    { id: 'survivor',      name: 'Survivor',       desc: 'Stay airborne 60 seconds.',  kind: 'time', target: 60, reward: 250, theme: 'special' },
    { id: 'pacifist',      name: 'Pacifist',       desc: 'Fly 2,000 m without hitting any hazard.', kind: 'noHazardsDist', target: 2000, reward: 300, theme: 'special' },
    { id: 'bossbuster',    name: 'Bossbuster',     desc: 'Punch the vault.',           kind: 'vaultPunch', target: 1, reward: 1000, theme: 'special' },
    { id: 'endless_wanderer', name: 'Endless Wanderer', desc: 'Fly 10,000 m post-vault.', kind: 'endlessDistance', target: 10000, reward: 2000, theme: 'special' }
  ];

  // ---------------- helpers ----------------

  // Build a fresh, default medals map (all unearned, progress 0).
  LTH.defaultMedals = function () {
    const m = {};
    LTH.MEDALS.forEach(def => { m[def.id] = { earned: false, progress: 0 }; });
    return m;
  };

  // Make sure save.medals has every medal the current build knows about.
  // Old saves missing newly-added medals get them filled in at zero.
  LTH.ensureMedalsSchema = function (save) {
    if (!save.medals || typeof save.medals !== 'object') save.medals = {};
    LTH.MEDALS.forEach(def => {
      if (!save.medals[def.id]) save.medals[def.id] = { earned: false, progress: 0 };
    });
    return save.medals;
  };

  // Pump a value into the medal system. For most medals progress is the
  // run-best value (we keep the max). `value` semantics:
  //   distance/altitude/speed/coins/stunts/skips/time/fuelLeftPct/noHazardsDist:
  //       a numeric "current best so far this run" — we keep max
  //   fuelBurned/vaultPunch:
  //       1 if just happened, ignored if 0
  //   endlessDistance:
  //       distance flown after the vault was punched on a given run
  //
  // Returns an array of medals newly awarded by this call (so the game
  // can pop a "+N coins" toast and play unlock SFX).
  LTH.checkMedalProgress = function (save, kind, value) {
    LTH.ensureMedalsSchema(save);
    const newly = [];
    for (const def of LTH.MEDALS) {
      if (def.kind !== kind) continue;
      const rec = save.medals[def.id];
      if (rec.earned) continue;
      // booleans treat any truthy as a fire
      if (def.kind === 'fuelBurned' || def.kind === 'vaultPunch') {
        if (value) {
          rec.progress = 1;
          rec.earned = true;
          newly.push(def);
        }
        continue;
      }
      // everything else: keep run-best (or lifetime-best for distance med
      // 'vault_chaser' / 'endless_wanderer' which the game pumps as totals).
      if (value > rec.progress) rec.progress = value;
      if (rec.progress >= def.target) {
        rec.earned = true;
        newly.push(def);
      }
    }
    return newly;
  };

  LTH.medalsEarnedCount = function (save) {
    if (!save.medals) return 0;
    let n = 0;
    LTH.MEDALS.forEach(def => { if (save.medals[def.id] && save.medals[def.id].earned) n++; });
    return n;
  };
})();
