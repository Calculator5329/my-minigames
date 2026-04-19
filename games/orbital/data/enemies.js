/* Orbital — enemy tier catalog.
   Existing tiers (ast, drone, bigast, ufo, boss) carried over from the
   pre-expansion game.js with fields preserved. Phase 2 adds two new
   types: swarmer (spawned in clusters; very low HP each) and summoner
   (a mid-tier carrier that spits out swarmers as it walks).

   Each enemy has runtime fields applied at spawn:
     hp, maxHp, speed, size, color, sprite, bounty, dmg(life), boss

   Tier specifically does NOT contain modifiers (camo/lead/etc.) — those
   are applied by lib/enemy-mods at spawn time, driven by the round/wave
   data in data/rounds.js. */
(function () {
  const NDP = window.NDP;
  const O = NDP.Orbital;

  // Lives lost on leak (`dmg`) is roughly proportional to how hard the
  // enemy is to kill. The scale is hand-tuned per tier rather than computed
  // so swarms (tiny but plentiful) don't punish the player for one missed
  // shot, while bigger enemies feel costly to let through. Reference:
  // starting lives = 150.
  const TIERS = {
    swarmer: {
      hp: 6, speed: 92, size: 14, color: '#7aaaff',
      sprite: 'orb_enemy_swarmer', bounty: 2, dmg: 1,
      desc: 'Tiny but fast; spawned in clusters by summoners.'
    },
    ast: {
      hp: 12, speed: 60, size: 22, color: '#8a99c0',
      sprite: 'orb_meteor_small', bounty: 4, dmg: 1
    },
    drone: {
      hp: 30, speed: 86, size: 18, color: '#7aaaff',
      sprite: 'orb_meteor_med', bounty: 8, dmg: 2
    },
    bigast: {
      hp: 90, speed: 38, size: 32, color: '#a86a44',
      sprite: 'orb_meteor_big', bounty: 22, dmg: 5,
      onDie: 'splitDrones2'
    },
    summoner: {
      hp: 140, speed: 42, size: 30, color: '#ff9055',
      sprite: 'orb_enemy_summoner', bounty: 35, dmg: 6,
      summon: { type: 'swarmer', every: 1.8, count: 2 }
    },
    ufo: {
      hp: 320, speed: 48, size: 40, color: '#ff4fd8',
      sprite: 'orb_elite', bounty: 95, dmg: 12,
      stunResist: true
    },
    boss: {
      hp: 1800, speed: 38, size: 56, color: '#a070ff',
      sprite: 'orb_boss', bounty: 600, dmg: 35,
      boss: true, stunResist: true
    },
    titan: {
      hp: 9000, speed: 32, size: 78, color: '#ff5566',
      sprite: 'orb_boss', bounty: 4000, dmg: 80,
      boss: true, stunResist: true,
      tint: '#ff5566',
      summon: { type: 'drone', every: 4, count: 2 }
    }
  };

  function get(t) { return TIERS[t]; }
  function keys() { return Object.keys(TIERS); }

  O.Enemies = { tiers: TIERS, get, keys };
})();
