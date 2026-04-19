/* Learn to Heist — day-by-day campaign.
   15 days, each one is a single launch with a primary objective and an
   optional bonus. Drives the long arc the way Learn to Fly's calendar did.

   Day metric kinds (the game pumps these from `this.run` at end of run):
     distance      run.distance
     altitude      run.maxAltitude
     coins         run.coins
     stunts        run.stunts
     skips         run.skips
     time          run.time
     speed         run.peakSpeed
     vaultPunch    run.bossPunched ? 1 : 0

   Bonus objectives also use `kind` + `target`. Bonus rewards stack on top
   of primary on the same launch.
*/
(function () {
  const NDP = window.NDP;
  NDP.LTH = NDP.LTH || {};
  const LTH = NDP.LTH;

  LTH.CAMPAIGN = [
    { id: 'd01', name: 'Backyard Beginning',
      story: 'The vault stole everything. We rebuild — starting with a wooden ramp and a goblin with nothing to lose.',
      kind: 'distance', target: 200, reward: 60,
      bonus: { kind: 'time', target: 5, reward: 30, desc: 'Stay airborne 5 s.' } },

    { id: 'd02', name: 'First Mile',
      story: 'A neighbor saw the launch. Says we look "absolutely lost" but throws coins anyway.',
      kind: 'distance', target: 500, reward: 90,
      bonus: { kind: 'coins', target: 20, reward: 40, desc: 'Grab 20 coins this run.' } },

    { id: 'd03', name: 'Higher Ground',
      story: 'The goblin has been studying birds. The verdict: birds cheat.',
      kind: 'altitude', target: 300, reward: 110,
      bonus: { kind: 'stunts', target: 1, reward: 50, desc: 'Land a stunt.' } },

    { id: 'd04', name: 'Loop the Loop',
      story: 'Stunts are not just for show — they unsettle the vault. We have proof. (No, we do not.)',
      kind: 'stunts', target: 3, reward: 140,
      bonus: { kind: 'distance', target: 1200, reward: 80, desc: 'Fly 1,200 m.' } },

    { id: 'd05', name: 'Cloud Climber',
      story: 'A passing pigeon now follows the ramp every morning. Possibly a fan. Possibly a spy.',
      kind: 'altitude', target: 700, reward: 180,
      bonus: { kind: 'coins', target: 80, reward: 80, desc: 'Grab 80 coins.' } },

    { id: 'd06', name: 'The Long Glide',
      story: 'Discovered: if you stop boosting and tilt, you actually get further. Aerodynamics. Wow.',
      kind: 'time', target: 25, reward: 220,
      bonus: { kind: 'distance', target: 2500, reward: 100, desc: 'Fly 2,500 m.' } },

    { id: 'd07', name: 'Skipping Stones',
      story: 'Hit the dirt at the right angle and you skip. Hit it wrong and you become geology.',
      kind: 'skips', target: 3, reward: 240,
      bonus: { kind: 'distance', target: 3000, reward: 120, desc: 'Fly 3,000 m.' } },

    { id: 'd08', name: 'Stratosphere',
      story: 'The sky is blue, then less blue, then black. The goblin has opinions about this.',
      kind: 'altitude', target: 1200, reward: 320,
      bonus: { kind: 'time', target: 35, reward: 120, desc: 'Stay airborne 35 s.' } },

    { id: 'd09', name: 'Coin Spree',
      story: 'A treasure chest fell out of the vault on its way up. We are very sure it did. Look there.',
      kind: 'coins', target: 150, reward: 380,
      bonus: { kind: 'stunts', target: 4, reward: 140, desc: 'Land 4 stunts.' } },

    { id: 'd10', name: 'Crossing the Ocean',
      story: 'Far enough now that the village is a dot. The goblin waves. Nobody waves back.',
      kind: 'distance', target: 4000, reward: 460,
      bonus: { kind: 'altitude', target: 1100, reward: 160, desc: 'Reach 1,100 m.' } },

    { id: 'd11', name: 'Speed Run',
      story: 'The booster is louder than the village. The village has filed a complaint. We ignore it.',
      kind: 'speed', target: 700, reward: 540,
      bonus: { kind: 'distance', target: 4500, reward: 180, desc: 'Fly 4,500 m.' } },

    { id: 'd12', name: 'Edge of Space',
      story: 'Birds will not follow this high. Even the spy pigeon. Especially the spy pigeon.',
      kind: 'altitude', target: 1800, reward: 660,
      bonus: { kind: 'coins', target: 220, reward: 200, desc: 'Grab 220 coins.' } },

    { id: 'd13', name: 'Vault Spotted',
      story: 'A glint of red, way up there. Two glints. Eyes. The vault has eyes now. Of course it does.',
      kind: 'altitude', target: 2200, reward: 820,
      bonus: { kind: 'time', target: 50, reward: 240, desc: 'Stay airborne 50 s.' } },

    { id: 'd14', name: 'Boss Approach',
      story: 'Tonight we sleep on the ramp. Tomorrow we punch a vault.',
      kind: 'distance', target: 8000, reward: 1000,
      bonus: { kind: 'altitude', target: 2400, reward: 400, desc: 'Reach 2,400 m on the same run.' } },

    { id: 'd15', name: 'Heist Day',
      story: 'You and the vault. Same orbit. Same fate. Punch first, ask questions never.',
      kind: 'vaultPunch', target: 1, reward: 3000,
      bonus: { kind: 'altitude', target: 2600, reward: 500, desc: 'Reach 2,600 m on the same run.' } }
  ];

  // ---------- helpers ----------

  // Read the current day metric value from a finished `this.run`.
  LTH.runMetric = function (run, kind) {
    switch (kind) {
      case 'distance':   return run.distance | 0;
      case 'altitude':   return run.maxAltitude | 0;
      case 'coins':      return run.coins | 0;
      case 'stunts':     return run.stunts | 0;
      case 'skips':      return run.skips | 0;
      case 'time':       return run.time | 0;
      case 'speed':      return run.peakSpeed | 0;
      case 'vaultPunch': return run.bossPunched ? 1 : 0;
    }
    return 0;
  };

  // Returns the current day def or null when the campaign is finished.
  LTH.currentDay = function (save) {
    const i = save.dayIdx | 0;
    if (i >= LTH.CAMPAIGN.length) return null;
    return LTH.CAMPAIGN[i];
  };

  // Evaluate a finished run against the current day. Returns a result
  // object the report screen can render directly.
  LTH.gradeRun = function (save, run) {
    const day = LTH.currentDay(save);
    if (!day) {
      return { day: null, primaryDone: false, bonusDone: false, dayReward: 0 };
    }
    const primaryVal = LTH.runMetric(run, day.kind);
    const primaryDone = primaryVal >= day.target;
    let bonusDone = false;
    if (day.bonus) {
      const bv = LTH.runMetric(run, day.bonus.kind);
      bonusDone = bv >= day.bonus.target;
    }
    let reward = 0;
    if (primaryDone) reward += day.reward;
    if (primaryDone && bonusDone) reward += (day.bonus && day.bonus.reward) || 0;
    return {
      day, primaryDone, bonusDone,
      primaryVal, dayReward: reward
    };
  };
})();
