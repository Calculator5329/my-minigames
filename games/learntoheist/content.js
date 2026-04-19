/* Learn to Heist — data tables.
   Static content pulled into LTH namespace so the main game file stays
   focused on simulation and rendering. */
(function () {
  const NDP = window.NDP;
  NDP.LTH = NDP.LTH || {};
  const LTH = NDP.LTH;

  // ------------- UPGRADES -------------
  // Each upgrade has tiers. Tier 0 = default (free). Buying tier N costs `costs[N]`.
  // Effects are plain numbers the flight sim reads by name.
  LTH.UPGRADES = {
    ramp: {
      name: 'Launch Ramp',
      icon: 'ramp',
      desc: 'Steeper angle + higher initial speed.',
      tiers: [
        { label: 'Dirt Pile',      power: 420, angleBias: 0.00 },
        { label: 'Wooden Ramp',    power: 520, angleBias: 0.02, cost: 80 },
        { label: 'Iron Ramp',      power: 640, angleBias: 0.04, cost: 240 },
        { label: 'Hydraulic Ramp', power: 780, angleBias: 0.07, cost: 700 },
        { label: 'Mag-Rail',       power: 960, angleBias: 0.10, cost: 1800 },
        { label: 'Orbital Catapult',power:1200, angleBias: 0.14, cost: 5000 }
      ]
    },
    body: {
      name: 'Contraption',
      icon: 'body',
      desc: 'Lower weight, better handling.',
      tiers: [
        { label: 'Barrel',          mass: 1.0, drag: 0.018 },
        { label: 'Shopping Cart',   mass: 0.9, drag: 0.016, cost: 100 },
        { label: 'Bike Frame',      mass: 0.78,drag: 0.012, cost: 320 },
        { label: 'Carbon Shell',    mass: 0.62,drag: 0.008, cost: 900 },
        { label: 'Titanium Pod',    mass: 0.48,drag: 0.006, cost: 2400 },
        { label: 'Vault-Stolen Hull',mass:0.36,drag: 0.004, cost: 6500 }
      ]
    },
    glider: {
      name: 'Glider',
      icon: 'glider',
      desc: 'Generates lift; reduces gravity loss.',
      tiers: [
        { label: 'None',            lift: 0.00, stall: 100 },
        { label: 'Hang Glider',     lift: 0.22, stall: 140, cost: 150 },
        { label: 'Paraglider',      lift: 0.38, stall: 190, cost: 450 },
        { label: 'Delta Wing',      lift: 0.55, stall: 240, cost: 1200 },
        { label: 'Stealth Wing',    lift: 0.75, stall: 300, cost: 3200 },
        { label: 'Anti-Grav Fin',   lift: 1.05, stall: 400, cost: 8500 }
      ]
    },
    booster: {
      name: 'Booster',
      icon: 'booster',
      desc: 'Fuel tank size + thrust. Even tier 0 beats gravity.',
      tiers: [
        // Gravity is 520 m/s²; thrust must beat it comfortably or the
        // booster feels broken. Tier 0 is now ~1.7× gravity.
        { label: 'Firecracker',     thrust:  900, fuel: 1.6 },
        { label: 'Bottle Rocket',   thrust: 1120, fuel: 2.4, cost: 120 },
        { label: 'RCS Pack',        thrust: 1380, fuel: 3.4, cost: 380 },
        { label: 'Turbine',         thrust: 1700, fuel: 4.8, cost: 1100 },
        { label: 'Scramjet',        thrust: 2050, fuel: 6.4, cost: 2900 },
        { label: 'Antimatter Core', thrust: 2500, fuel: 9.0, cost: 7800 }
      ]
    },
    gadget: {
      name: 'Gadgets',
      icon: 'gadget',
      desc: 'Passive bonuses.',
      tiers: [
        { label: 'None',            magnet: 0,  autoGlider: false, coinMult: 1.0 },
        { label: 'Coin Magnet I',   magnet: 120,autoGlider: false, coinMult: 1.0, cost: 160 },
        { label: 'Coin Magnet II',  magnet: 220,autoGlider: false, coinMult: 1.15,cost: 520 },
        { label: 'Auto-Glider',     magnet: 220,autoGlider: true,  coinMult: 1.15,cost: 1400 },
        { label: 'Bonus Multiplier',magnet: 300,autoGlider: true,  coinMult: 1.35,cost: 3400 },
        { label: 'Gold Fever',      magnet: 450,autoGlider: true,  coinMult: 1.7, cost: 9000 }
      ]
    },
    perks: {
      name: 'Permanent',
      icon: 'perk',
      desc: 'Global progression.',
      tiers: [
        { label: 'Baseline',        coinBonus: 0,  distBonus: 0 },
        { label: 'Greedy +10%',     coinBonus: 0.10,distBonus: 0, cost: 250 },
        { label: 'Rocketeer',       coinBonus: 0.10,distBonus: 0.05, cost: 600 },
        { label: 'Skyhigh +25%',    coinBonus: 0.25,distBonus: 0.10, cost: 1800 },
        { label: 'Legend',          coinBonus: 0.40,distBonus: 0.18, cost: 5000 },
        { label: 'Vault-Chaser',    coinBonus: 0.60,distBonus: 0.30, cost: 12000 }
      ]
    }
  };

  // ------------- GOALS / STORY -------------
  LTH.GOALS = [
    { id: 'reach_500',   desc: 'Reach 500m distance',       kind: 'distance', target: 500,  reward: 120 },
    { id: 'height_300',  desc: 'Reach 300m altitude',       kind: 'altitude', target: 300,  reward: 160 },
    { id: 'coins_50',    desc: 'Collect 50 coins in one run',kind: 'coins',   target: 50,   reward: 180 },
    { id: 'reach_2000',  desc: 'Reach 2000m distance',      kind: 'distance', target: 2000, reward: 400 },
    { id: 'height_800',  desc: 'Reach the stratosphere (800m)',kind:'altitude',target:800,  reward: 500 },
    { id: 'stunt_5',     desc: 'Land 5 stunts in one run',  kind: 'stunts',   target: 5,    reward: 300 },
    { id: 'reach_6000',  desc: 'Cross the ocean (6000m)',   kind: 'distance', target: 6000, reward: 900 },
    { id: 'height_1800', desc: 'Reach space (1800m)',       kind: 'altitude', target: 1800, reward: 1200 },
    { id: 'survive_45',  desc: 'Stay airborne 45 seconds',  kind: 'time',     target: 45,   reward: 700 },
    { id: 'punch_vault', desc: 'Punch the vault in orbit',  kind: 'boss',     target: 1,    reward: 3000 }
  ];

  // ------------- DAILY MODIFIERS (per-run buffs/curses) -------------
  LTH.MODIFIERS = [
    { id: 'calm',     name: 'Calm Day',    desc: 'Nothing unusual.',        w: 0,  fuelMult: 1.0, coinMult: 1.0 },
    { id: 'tail',     name: 'Tailwind',    desc: '+Distance, -Altitude.',   w: 180,fuelMult: 1.0, coinMult: 1.0 },
    { id: 'head',     name: 'Headwind',    desc: 'Harder launch, +40% coin.',w:-220,fuelMult:1.0, coinMult: 1.4 },
    { id: 'thermal',  name: 'Thermals',    desc: 'Upward gusts at altitude.',w: 0, lift: 0.05, coinMult: 1.05 },
    { id: 'boon',     name: 'Fuel Boon',   desc: '+50% thrust for free.',    w: 0, thrustMult: 1.5, coinMult: 1.0 },
    { id: 'cursed',   name: 'Cursed Launch',desc:'Heavier contraption, +80% coin.',w:0,massMult:1.3,coinMult:1.8 }
  ];

  // ------------- CHARACTER STAGES (goblin → astronaut) -------------
  LTH.STAGES = [
    { id: 'rookie',   name: 'Goblin',         tint: '#4a7a30' },
    { id: 'pilot',    name: 'Aviator Goblin', tint: '#886644' },
    { id: 'ranger',   name: 'Sky Ranger',     tint: '#557799' },
    { id: 'astro',    name: 'Astro-Goblin',   tint: '#c8c8d8' },
    { id: 'vault',    name: 'Vault Hunter',   tint: '#ffcc33' }
  ];

  // ------------- BG BANDS -------------
  // Altitude -> color gradient. Interpolated between bands.
  LTH.SKY_BANDS = [
    { alt: 0,    top: '#8ecae6', bot: '#b7e2f0' }, // ground level — clear morning
    { alt: 250,  top: '#74b5e8', bot: '#a6d6ec' }, // mid sky
    { alt: 700,  top: '#4a6fa8', bot: '#85a4cf' }, // high cirrus
    { alt: 1100, top: '#2d3f72', bot: '#5a6a9e' }, // stratosphere dusk
    { alt: 1500, top: '#120842', bot: '#2a1a55' }, // edge of space
    { alt: 2000, top: '#05020f', bot: '#120830' }, // space black
    { alt: 3000, top: '#1a0830', bot: '#2a0a50' }  // deep space nebula
  ];

  // ------------- PICKUP / HAZARD POOL -------------
  // Spawn weight by altitude. The spawner picks weighted random each tick.
  LTH.SPAWNS = [
    { id: 'coin',     w: [8,10,9,6,4,3,2],  hazard: false, bandKey: 'all' },
    { id: 'coin_stack', w: [2,3,4,4,2,1,0], hazard: false, bandKey: 'all' },
    { id: 'fuel',     w: [0,2,3,4,3,2,1],   hazard: false, bandKey: 'all' },
    { id: 'mult',     w: [0,1,2,2,1,1,1],   hazard: false, bandKey: 'all' },
    { id: 'balloon',  w: [3,3,2,0,0,0,0],   hazard: false, bandKey: 'low' },
    { id: 'cloud',    w: [2,4,3,1,0,0,0],   hazard: false, bandKey: 'low' },
    { id: 'trampoline',w:[1,1,0,0,0,0,0],   hazard: false, bandKey: 'ground' },
    { id: 'ring',     w: [0,2,3,3,2,2,1],   hazard: false, bandKey: 'all' },
    // hazards — intentionally sparse so one hit hurts but doesn't chain-kill
    { id: 'bird',     w: [1,2,1,0,0,0,0],   hazard: true,  bandKey: 'low' },
    { id: 'stormcloud',w:[0,1,1,0,0,0,0],   hazard: true,  bandKey: 'mid' },
    { id: 'ufo',      w: [0,0,0,1,1,2,1],   hazard: true,  bandKey: 'high' },
    { id: 'asteroid', w: [0,0,0,0,1,2,2],   hazard: true,  bandKey: 'space' },
    { id: 'enemy',    w: [0,0,0,0,1,2,2],   hazard: true,  bandKey: 'space' }
  ];

  LTH.PICKUP_DEFS = {
    coin:       { color: '#ffcc33', r: 9,  value: 1 },
    coin_stack: { color: '#ffcc33', r: 16, value: 5 },
    fuel:       { color: '#5fd4ff', r: 14 },
    mult:       { color: '#ff7ad8', r: 14 },
    balloon:    { color: '#ff6677', r: 22, boost: 360 },
    cloud:      { color: '#fff', r: 40, drag: 0.005 },
    trampoline: { color: '#ffcc33', r: 40, boost: 900 },
    ring:       { color: '#ffdd77', r: 42, hole: 24 }
  };

  LTH.HAZARD_DEFS = {
    bird:      { color: '#8d6e3a', r: 14, dmg: 12, speedHit: 0.82 },
    stormcloud:{ color: '#333a',   r: 60, dmg: 6,  speedHit: 0.92, drag: 0.01, oneshot: true },
    ufo:       { color: '#99e',    r: 22, dmg: 14, speedHit: 0.85, chase: true },
    asteroid:  { color: '#8a6a4a', r: 28, dmg: 10, speedHit: 0.88 },
    enemy:     { color: '#ff4455', r: 18, dmg: 10, speedHit: 0.9,  shoots: true }
  };

  // altitude band keys -> min/max altitude (for spawn biasing)
  LTH.BAND_KEYS = {
    ground:{ min: 0,    max: 120 },
    low:   { min: 0,    max: 500 },
    mid:   { min: 300,  max: 1100 },
    high:  { min: 900,  max: 1800 },
    space: { min: 1500, max: 4000 },
    all:   { min: 0,    max: 4000 }
  };

  LTH.bandIndex = function (alt) {
    if (alt < 200)  return 0;
    if (alt < 500)  return 1;
    if (alt < 900)  return 2;
    if (alt < 1300) return 3;
    if (alt < 1800) return 4;
    if (alt < 2500) return 5;
    return 6;
  };

  // ------------- SAVE SCHEMA -------------
  // Per-game wallet pattern (see docs/plans/2026-04-19-currency-migration.md):
  //   - `coins` lives in `Storage.*GameWallet('learntoheist')` (the per-game
  //     wallet) so the Workshop shop never touches the global theme coins.
  //   - everything else (tiers, goalsDone, bests, totalLaunches, ...) lives
  //     in `Storage.setGameData('learntoheist', {...})`.
  //   - `LTH.OLD_LS_KEY` ('ndp.lth_v1') is the pre-migration localStorage
  //     blob; `_migrateLegacy` lifts it forward exactly once per device.
  LTH.GAME_ID = 'learntoheist';
  LTH.OLD_LS_KEY = 'ndp.lth_v1';

  LTH.defaultSave = function () {
    const tiers = {};
    Object.keys(LTH.UPGRADES).forEach(k => { tiers[k] = 0; });
    return {
      coins: 0,
      tiers: tiers,
      goalsDone: [],
      totalLaunches: 0,
      bestDistance: 0,
      bestAltitude: 0,
      bestCoins: 0,
      bossBeaten: false,
      totalCoinsEarned: 0,
      stageIdx: 0
    };
  };

  LTH._migrateLegacy = function () {
    try {
      const Storage = NDP.Engine && NDP.Engine.Storage;
      if (!Storage) return;
      const cur = Storage.getGameData(LTH.GAME_ID);
      if (cur && Object.keys(cur).length) return;          // already migrated
      const raw = localStorage.getItem(LTH.OLD_LS_KEY);
      if (!raw) return;
      const old = JSON.parse(raw);
      if (!old || typeof old !== 'object') return;
      const wallet = (old.coins | 0);
      const data = Object.assign({}, old);
      delete data.coins;
      Storage.setGameData(LTH.GAME_ID, data);
      if (wallet > 0) Storage.setGameWallet(LTH.GAME_ID, wallet);
      localStorage.removeItem(LTH.OLD_LS_KEY);
    } catch (e) {}
  };

  LTH.loadSave = function () {
    LTH._migrateLegacy();
    const def = LTH.defaultSave();
    let stored = {};
    try {
      const Storage = NDP.Engine && NDP.Engine.Storage;
      if (Storage) stored = Storage.getGameData(LTH.GAME_ID) || {};
    } catch (e) { stored = {}; }
    const merged = Object.assign(def, stored);
    // schema-grow safety: any new tier key defaults to 0
    Object.keys(def.tiers).forEach(k => {
      if (typeof merged.tiers[k] !== 'number') merged.tiers[k] = 0;
    });
    // coins always read from the wallet of record
    try {
      const Storage = NDP.Engine && NDP.Engine.Storage;
      merged.coins = Storage ? (Storage.getGameWallet(LTH.GAME_ID) | 0) : 0;
    } catch (e) { merged.coins = 0; }
    return merged;
  };

  LTH.writeSave = function (s) {
    try {
      const Storage = NDP.Engine && NDP.Engine.Storage;
      if (!Storage) return;
      const data = Object.assign({}, s);
      delete data.coins;            // wallet is the source of truth
      Storage.setGameData(LTH.GAME_ID, data);
      Storage.setGameWallet(LTH.GAME_ID, s.coins | 0);
    } catch (e) {}
  };

  LTH.resetSave = function () {
    try {
      const Storage = NDP.Engine && NDP.Engine.Storage;
      if (Storage) Storage.clearGameData(LTH.GAME_ID);
      localStorage.removeItem(LTH.OLD_LS_KEY);
    } catch (e) {}
  };

  // Compute current equipped stats from save
  LTH.currentStats = function (save) {
    const out = {};
    Object.keys(LTH.UPGRADES).forEach(key => {
      const u = LTH.UPGRADES[key];
      const tier = u.tiers[save.tiers[key] | 0];
      Object.keys(tier).forEach(k => {
        if (k === 'label' || k === 'cost') return;
        out[k] = tier[k];
      });
    });
    return out;
  };

  LTH.nextTierCost = function (key, save) {
    const u = LTH.UPGRADES[key];
    const next = (save.tiers[key] | 0) + 1;
    if (next >= u.tiers.length) return null;
    return u.tiers[next].cost | 0;
  };

  LTH.buyNextTier = function (key, save) {
    const cost = LTH.nextTierCost(key, save);
    if (cost == null) return false;
    const Storage = NDP.Engine && NDP.Engine.Storage;
    if (!Storage) return false;
    // Spend from the per-game wallet (the source of truth) and mirror the
    // post-spend balance back into the in-memory save for HUD code.
    if (!Storage.spendGameWallet(LTH.GAME_ID, cost)) return false;
    save.tiers[key] = (save.tiers[key] | 0) + 1;
    save.coins = Storage.getGameWallet(LTH.GAME_ID) | 0;
    return true;
  };
})();
