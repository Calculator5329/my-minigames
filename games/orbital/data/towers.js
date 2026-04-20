/* Orbital — TOWERS catalog with two-path upgrade trees.
   Each tower has:
     - base    : default placed-tower stats (cost, range, dmg, etc.)
     - paths.A : "kinetic / aggressive"  — usually the offensive path
     - paths.B : "specialist / control"  — usually the utility path

   Each path has 4 tiers. Each tier { cost, label, desc, patch, glyph,
   ability? }. Patches are applied last-write-wins on top of base, so a
   higher tier's `dmg: 30` overwrites the previous `dmg: 12`.

   Path-cap rule (enforced in lib/upgrades.js): a tower may have AT MOST
   one path above tier 2.

   New towers in Phase 2: sniper, engineer, cryo, chrono. */
(function () {
  const NDP = window.NDP;
  const O = NDP.Orbital;

  const TOWERS = {

    // ======== DART STATION — light interceptor ========
    dart: {
      unlock: { round: 1 },
      base: {
        name: 'Dart Station', short: 'Dart', cost: 180,
        sprite: 'orb_turret_dart', color: '#7ae0ff',
        range: 140, fireRate: 3.2, dmg: 2, pierce: 1,
        projSpeed: 520, proj: 'bolt', priority: 'first',
        desc: 'Cheap rapid-fire bolts. Backbone of any defense.'
      },
      paths: {
        A: {
          id: 'rapid', name: 'Rapid Fire', accent: '#ff9055',
          tiers: [
            { cost:  200, label: 'Tighter Coils', desc: '+1.4 fire rate',
              glyph: 'rate', patch: { fireRate: 4.6 } },
            { cost:  350, label: 'Razor Bolts',   desc: 'pierces 3 enemies',
              glyph: 'pierce', patch: { pierce: 3, dmg: 3 } },
            { cost:  600, label: 'Burst Fire',    desc: 'fires triple bursts',
              glyph: 'burst', patch: { burst: 3, burstGap: 0.05 } },
            { cost: 2200, label: 'Stormcaller',   desc: 'machine-gun cap +pierce 5',
              glyph: 'rate', patch: { fireRate: 9.0, pierce: 5, dmg: 5 },
              ability: 'rapidStrike' }
          ]
        },
        B: {
          id: 'sniper', name: 'Heavy Bolt', accent: '#7ae0ff',
          tiers: [
            { cost:  240, label: 'Sharper Tip', desc: '+2 damage',
              glyph: 'dmg', patch: { dmg: 4 } },
            { cost:  500, label: 'Long Lens',   desc: '+50 range',
              glyph: 'range', patch: { range: 190 } },
            { cost:  900, label: 'Anti-Armor',  desc: 'ignores armored',
              glyph: 'shield', patch: { antiArmor: true, dmg: 6 } },
            { cost: 2800, label: 'Sniper Module', desc: 'global range, big bolts',
              glyph: 'crit', patch: { range: 9999, dmg: 28, fireRate: 1.0, antiArmor: true },
              ability: 'preciseShot' }
          ]
        }
      },
      paragon: {
        name: 'Apex Bolt',
        cost: 22000,
        unlockLifetimeXp: 5000,
        sprite: 'orb_turret_dart_paragon',
        accent: '#ffd86b',
        desc: 'Master dart platform — storm of bolts.',
        stats: { range: 260, fireRate: 11, dmg: 14, pierce: 8, projSpeed: 720, proj: 'bolt', priority: 'first' },
        ability: 'paragonBoltStorm'
      }
    },

    // ======== PLASMA CANNON — splash damage ========
    cannon: {
      unlock: { round: 1 },
      base: {
        name: 'Plasma Cannon', short: 'Cannon', cost: 450,
        sprite: 'orb_turret_cannon', color: '#ffb347',
        range: 155, fireRate: 1.0, dmg: 8, splash: 50,
        projSpeed: 380, proj: 'plasma', priority: 'first',
        desc: 'Slow, heavy plasma rounds with area damage.'
      },
      paths: {
        A: {
          id: 'ordnance', name: 'Heavy Ordnance', accent: '#ff5530',
          tiers: [
            { cost:  300, label: 'Bigger Shells', desc: '+4 dmg, +10 splash',
              glyph: 'dmg', patch: { dmg: 12, splash: 60 } },
            { cost:  550, label: 'Reinforced Barrel', desc: '+5 dmg, +15 splash',
              glyph: 'splash', patch: { dmg: 17, splash: 75 } },
            { cost: 1100, label: 'Earthshaker', desc: '+9 dmg, +20 splash, +20% rate',
              glyph: 'splash', patch: { dmg: 26, splash: 95, fireRate: 1.2 } },
            { cost: 3200, label: 'Carpet Bomb', desc: 'massive shells; ability',
              glyph: 'nuke', patch: { dmg: 38, splash: 110, fireRate: 1.2 },
              ability: 'carpetBomb' }
          ]
        },
        B: {
          id: 'cluster', name: 'Cluster Shells', accent: '#ffd86b',
          tiers: [
            { cost:  280, label: 'Shrapnel', desc: 'shells fragment for bonus dmg',
              glyph: 'burst', patch: { splash: 55, fragments: 4, fragDmg: 4 } },
            { cost:  500, label: 'Rapid Loader', desc: '+0.6 fire rate',
              glyph: 'rate', patch: { fireRate: 1.5 } },
            { cost:  900, label: 'Shotgun Spread', desc: 'fires 3 shells in spread',
              glyph: 'burst', patch: { multiShot: 3, spread: 0.25 } },
            { cost: 2500, label: 'Cluster Munitions', desc: '5 shells; ability',
              glyph: 'splash', patch: { multiShot: 5, splash: 70, dmg: 12 },
              ability: 'scatterShot' }
          ]
        }
      },
      paragon: {
        name: 'Worldbreaker',
        cost: 28000,
        unlockLifetimeXp: 5000,
        sprite: 'orb_turret_cannon_paragon',
        accent: '#ff5530',
        desc: 'Cataclysmic siege cannon.',
        stats: { range: 220, fireRate: 0.9, dmg: 180, splash: 130, projSpeed: 420, proj: 'plasma', priority: 'first' },
        ability: 'paragonOrbitalDrop'
      }
    },

    // ======== BEAM ARRAY — armor breaker ========
    beam: {
      unlock: { round: 3 },
      base: {
        name: 'Beam Array', short: 'Beam', cost: 700,
        sprite: 'orb_turret_beam', color: '#ff4fd8',
        range: 185, fireRate: 0, dmg: 0, beamDps: 32,
        proj: 'beam', priority: 'first',
        desc: 'Continuous beam that pierces armor. Great vs lead. Path A reveals camo.'
      },
      paths: {
        A: {
          id: 'fractal', name: 'Fractal Beam', accent: '#ff4fd8',
          tiers: [
            { cost:  300, label: 'Wider Aperture', desc: '+16 dps; reveals camo',
              glyph: 'eye', patch: { beamDps: 48, seesCamo: true } },
            { cost:  650, label: 'Chaining',       desc: 'chains to 2 enemies',
              glyph: 'chain', patch: { chain: 2 } },
            { cost: 1400, label: 'Tri-Beam',       desc: 'chains to 3, +dps',
              glyph: 'chain', patch: { chain: 3, beamDps: 72 } },
            { cost: 3400, label: 'Fractal Lance',  desc: 'chains 5; ability',
              glyph: 'chain', patch: { chain: 5, beamDps: 110 },
              ability: 'spectrumBurst' }
          ]
        },
        B: {
          id: 'solar', name: 'Solar Concentrator', accent: '#ffd86b',
          tiers: [
            { cost:  350, label: 'Focal Lens',  desc: '+28 dps',
              glyph: 'dmg', patch: { beamDps: 60 } },
            { cost:  800, label: 'Charge Up',   desc: 'dmg ramps holding target',
              glyph: 'aura', patch: { focusBuildup: true } },
            { cost: 1500, label: 'Plasma Lens', desc: '+40 dps, +25 range',
              glyph: 'dmg', patch: { beamDps: 100, range: 210 } },
            { cost: 3800, label: 'Solar Lance', desc: 'huge beam; ability',
              glyph: 'star', patch: { beamDps: 180, range: 260 },
              ability: 'solarLance' }
          ]
        }
      },
      paragon: {
        name: 'Helios Array',
        cost: 25000,
        unlockLifetimeXp: 5000,
        sprite: 'orb_turret_beam_paragon',
        accent: '#ffd86b',
        desc: 'Weaponized star, screen-wide reach.',
        stats: { range: 280, fireRate: 0, beamDps: 260, chain: 8, proj: 'beam', priority: 'first' },
        ability: 'paragonSunburn'
      }
    },

    // ======== GRAVITY WELL — controller ========
    gravity: {
      unlock: { round: 5 },
      base: {
        name: 'Gravity Well', short: 'Gravity', cost: 600,
        sprite: 'orb_turret_gravity', color: '#b890ff',
        range: 145, fireRate: 0, dmg: 0, slow: 0.50,
        proj: 'aura', priority: 'first',
        desc: 'Slows everything in range. Stacks weakly.'
      },
      paths: {
        A: {
          id: 'horizon', name: 'Event Horizon', accent: '#b890ff',
          tiers: [
            { cost:  300, label: 'Strong Pull',  desc: 'slow 65%, +20 range',
              glyph: 'time', patch: { slow: 0.65, range: 165 } },
            { cost:  550, label: 'Wider Field', desc: '+30 range',
              glyph: 'range', patch: { range: 195 } },
            { cost: 1100, label: 'Pull Damage', desc: 'deals 6 dps in field',
              glyph: 'aura', patch: { pullDps: 6 } },
            { cost: 2800, label: 'Time Stop',   desc: 'near-freeze; ability',
              glyph: 'time', patch: { slow: 0.95, pullDps: 14 },
              ability: 'timeStop' }
          ]
        },
        B: {
          id: 'lock', name: 'Quantum Lock', accent: '#7ae0ff',
          tiers: [
            { cost:  280, label: 'Pulse Lock',   desc: 'tiny stuns in field',
              glyph: 'stun', patch: { stunPulse: { dur: 0.4, every: 1.5 } } },
            { cost:  600, label: 'Wider Pulse',  desc: '+50 range',
              glyph: 'range', patch: { range: 220 } },
            { cost: 1300, label: 'Multi-Lock',   desc: 'stuns ALL in range',
              glyph: 'stun', patch: { stunPulse: { dur: 0.6, every: 1.2 } } },
            { cost: 3100, label: 'Quantum Anchor', desc: 'stuns even UFOs; ability',
              glyph: 'stun', patch: { stunPulse: { dur: 1.0, every: 2.0, evenUfo: true } },
              ability: 'quantumAnchor' }
          ]
        }
      },
      paragon: {
        name: 'Null Zone',
        cost: 24000,
        unlockLifetimeXp: 5000,
        sprite: 'orb_turret_gravity_paragon',
        accent: '#a070ff',
        desc: 'Inescapable gravitic singularity.',
        stats: { range: 240, slow: 0.75, collapseRadius: 180, pullDps: 4, priority: 'first' },
        ability: 'paragonCollapseAll'
      }
    },

    // ======== SOLAR FLARE — DoT ========
    flare: {
      unlock: { round: 12 },
      base: {
        name: 'Solar Flare', short: 'Flare', cost: 1000,
        sprite: 'orb_turret_flare', color: '#ffd86b',
        range: 155, fireRate: 0, dmg: 0,
        pulseCD: 3.0, pulseDmg: 28, proj: 'pulse', priority: 'first',
        desc: 'Periodic radial pulses. Ignites burns. Hits lead and camo.'
      },
      paths: {
        A: {
          id: 'corona', name: 'Coronal Mass', accent: '#ff8040',
          tiers: [
            { cost:  500, label: 'Bigger Pulse', desc: '+10 pulse damage',
              glyph: 'splash', patch: { pulseDmg: 38 } },
            { cost:  900, label: 'Hotter Burns', desc: 'leaves 8 dps burn',
              glyph: 'burn', patch: { burnDps: 8 } },
            { cost: 1700, label: 'CME',          desc: 'faster pulse, big dmg',
              glyph: 'splash', patch: { pulseCD: 1.8, pulseDmg: 48, burnDps: 14 } },
            { cost: 3600, label: 'Heat Storm',   desc: 'burns last 2× longer; ability',
              glyph: 'burn', patch: { pulseDmg: 70, burnDps: 22, burnLong: true },
              ability: 'heatStorm' }
          ]
        },
        B: {
          id: 'lance', name: 'Plasma Lance', accent: '#ffd86b',
          tiers: [
            { cost:  600, label: 'Lance Mode',   desc: 'sweeping cone beam, 35 dps',
              glyph: 'dmg', patch: { lance: { cone: Math.PI / 4, dps: 35 } } },
            { cost: 1100, label: 'Wider Sweep',  desc: 'cone widens to 90°',
              glyph: 'range', patch: { lance: { cone: Math.PI / 2, dps: 50 } } },
            { cost: 1900, label: 'Solar Sweep',  desc: 'cone 180°, 80 dps',
              glyph: 'splash', patch: { lance: { cone: Math.PI, dps: 80 } } },
            { cost: 4000, label: 'Helios Cannon', desc: 'full 360° beam; ability',
              glyph: 'star', patch: { lance: { cone: Math.PI * 2, dps: 130 } },
              ability: 'helios' }
          ]
        }
      }
    },

    // ======== SINGULARITY — panic button ========
    sing: {
      unlock: { round: 40 },
      base: {
        name: 'Singularity', short: 'Sing', cost: 2400,
        sprite: 'orb_turret_sing', color: '#a070ff',
        range: 100, fireRate: 0, dmg: 0,
        collapseCD: 10.0, collapseRadius: 90,
        proj: 'collapse', priority: 'first',
        desc: 'Periodic collapse field. Instakills non-bosses in range.'
      },
      paths: {
        A: {
          id: 'collapse', name: 'Horizon Collapse', accent: '#a070ff',
          tiers: [
            { cost:  900, label: 'Quick Cycle',  desc: 'CD 10 → 7s',
              glyph: 'rate', patch: { collapseCD: 7 } },
            { cost: 1500, label: 'Wider Mouth',  desc: 'radius +25',
              glyph: 'range', patch: { collapseRadius: 115 } },
            { cost: 2400, label: 'Heavier Bang', desc: 'bosses take 600 dmg',
              glyph: 'splash', patch: { collapseRadius: 140, bossDmg: 600 } },
            { cost: 5500, label: 'Event Horizon', desc: 'huge field; ability',
              glyph: 'star', patch: { collapseCD: 5, collapseRadius: 180, bossDmg: 1000 },
              ability: 'eventHorizon' }
          ]
        },
        B: {
          id: 'bomb', name: 'Black Hole Bomb', accent: '#7ae0ff',
          tiers: [
            { cost: 1100, label: 'Mortar Mode',  desc: 'lobs bombs at click',
              glyph: 'nuke', patch: { mortar: true, mortarDmg: 200, mortarRadius: 100 } },
            { cost: 1700, label: 'Quick Reload', desc: 'CD 10 → 6s',
              glyph: 'rate', patch: { collapseCD: 6 } },
            { cost: 2700, label: 'Aftershocks',  desc: '3 collapses per bomb',
              glyph: 'burst', patch: { mortarShocks: 3, mortarDmg: 320 } },
            { cost: 6000, label: 'Singularity Bomb', desc: 'massive lob; ability',
              glyph: 'nuke', patch: { mortarShocks: 5, mortarDmg: 600, mortarRadius: 160 },
              ability: 'lobBomb' }
          ]
        }
      }
    },

    // ======== TESLA COIL — swarm killer ========
    tesla: {
      unlock: { round: 7 },
      base: {
        name: 'Tesla Coil', short: 'Tesla', cost: 850,
        sprite: 'orb_turret_tesla', color: '#7aaaff',
        range: 150, fireRate: 1.5, dmg: 0,
        chainCount: 3, chainDmg: 8, chainRadius: 70,
        proj: 'arc', priority: 'first',
        desc: 'Arcs lightning between nearby enemies. Anti-swarm. Path A ionizes camo.'
      },
      paths: {
        A: {
          id: 'super', name: 'Superconductor', accent: '#7aaaff',
          tiers: [
            { cost:  450, label: 'More Chains',  desc: 'chain to 5; reveals camo',
              glyph: 'eye', patch: { chainCount: 5, seesCamo: true } },
            { cost:  800, label: 'High Voltage', desc: '+8 chain dmg',
              glyph: 'dmg', patch: { chainDmg: 16 } },
            { cost: 1600, label: 'Tesla Net',    desc: 'wider radius, faster',
              glyph: 'range', patch: { chainRadius: 95, fireRate: 2.0 } },
            { cost: 3800, label: 'Static Surge', desc: 'chain to ALL; ability',
              glyph: 'rate', patch: { chainCount: 14, chainDmg: 24, chainRadius: 130 },
              ability: 'staticSurge' }
          ]
        },
        B: {
          id: 'capacitor', name: 'Capacitor Bank', accent: '#ffd86b',
          tiers: [
            { cost:  500, label: 'Build Charge', desc: 'stores +1 dmg/sec',
              glyph: 'aura', patch: { capacitor: { rate: 1, max: 30 } } },
            { cost:  900, label: 'Bigger Cells', desc: 'cap 30 → 60',
              glyph: 'aura', patch: { capacitor: { rate: 1.5, max: 60 } } },
            { cost: 1700, label: 'Storm Cell',   desc: 'discharge as area pulse',
              glyph: 'splash', patch: { capacitor: { rate: 2, max: 100, area: 80 } } },
            { cost: 4200, label: 'Capacitor Bank', desc: 'huge surge; ability',
              glyph: 'star', patch: { capacitor: { rate: 3, max: 200, area: 130 } },
              ability: 'dischargeAll' }
          ]
        }
      }
    },

    // ======== MISSILE SILO — boss melter ========
    missile: {
      unlock: { round: 23 },
      base: {
        name: 'Missile Silo', short: 'Missile', cost: 1500,
        sprite: 'orb_turret_missile', color: '#ff6060',
        range: 240, fireRate: 0.4, dmg: 50, splash: 80,
        projSpeed: 220, proj: 'homing', priority: 'strong',
        desc: 'Slow homing missiles with splash. Hits lead.'
      },
      paths: {
        A: {
          id: 'cluster', name: 'Cluster Warheads', accent: '#ff8040',
          tiers: [
            { cost:  700, label: 'Bigger Splash', desc: '+30 splash',
              glyph: 'splash', patch: { splash: 110, dmg: 70 } },
            { cost: 1200, label: 'Faster Reload', desc: '+0.2 rate',
              glyph: 'rate', patch: { fireRate: 0.6 } },
            { cost: 2200, label: 'Multi-launch',  desc: '3 missiles per shot',
              glyph: 'burst', patch: { multiShot: 3 } },
            { cost: 5000, label: 'Salvo',         desc: '6 missiles; ability',
              glyph: 'burst', patch: { multiShot: 5, splash: 130, dmg: 90 },
              ability: 'salvo' }
          ]
        },
        B: {
          id: 'icbm', name: 'ICBM', accent: '#ff6060',
          tiers: [
            { cost:  900, label: 'Heavy Warhead', desc: '+60 dmg',
              glyph: 'dmg', patch: { dmg: 110 } },
            { cost: 1800, label: 'Slow Burner',  desc: 'massive single hits',
              glyph: 'dmg', patch: { fireRate: 0.3, dmg: 250, splash: 100 } },
            { cost: 2800, label: 'Pinpoint',     desc: 'tighter homing, faster',
              glyph: 'crit', patch: { homingTurn: 8, projSpeed: 320 } },
            { cost: 6500, label: 'ICBM',         desc: 'global mega-warhead; ability',
              glyph: 'nuke', patch: { dmg: 400, splash: 160 },
              ability: 'icbm' }
          ]
        }
      },
      paragon: {
        name: 'Harbinger',
        cost: 30000,
        unlockLifetimeXp: 5000,
        sprite: 'orb_turret_missile_paragon',
        accent: '#ff8040',
        desc: 'Orbital command warhead array.',
        stats: { range: 9999, fireRate: 1.6, dmg: 90, splash: 120, projSpeed: 300, proj: 'missile', priority: 'first' },
        ability: 'paragonMIRV'
      }
    },

    // ======== SUPPORT BEACON — buffer ========
    support: {
      unlock: { round: 20 },
      base: {
        name: 'Support Beacon', short: 'Support', cost: 900,
        sprite: 'orb_turret_support', color: '#4ade80',
        range: 130, fireRate: 0, dmg: 0,
        buffFire: 0.25, buffDmg: 0.15,
        proj: 'aura', priority: 'first',
        desc: 'Buffs neighboring towers. Doesn\'t shoot.'
      },
      paths: {
        A: {
          id: 'resonance', name: 'Resonance Field', accent: '#4ade80',
          tiers: [
            { cost:  400, label: 'Wider Field', desc: '+40 range',
              glyph: 'range', patch: { range: 170, buffFire: 0.4, buffDmg: 0.25 } },
            { cost:  800, label: 'Stronger Buffs', desc: '+rate +dmg',
              glyph: 'aura', patch: { buffFire: 0.55, buffDmg: 0.35 } },
            { cost: 1500, label: 'Buff Range',  desc: '+20% tower range too',
              glyph: 'range', patch: { buffRange: 0.20 } },
            { cost: 3500, label: 'Overclock',   desc: '100% rate burst; ability',
              glyph: 'rate', patch: { buffFire: 0.75, buffDmg: 0.50, buffRange: 0.30 },
              ability: 'overclock' }
          ]
        },
        B: {
          id: 'tactical', name: 'Tactical Net', accent: '#7ae0ff',
          tiers: [
            { cost:  500, label: 'Eye in the Sky', desc: 'reveals camo in range; +10% rate',
              glyph: 'eye', patch: { seesCamo: true, buffFire: 0.10 } },
            { cost:  900, label: 'Bounty Tag',  desc: '+15% bounty in range',
              glyph: 'money', patch: { bountyMult: 0.15 } },
            { cost: 1600, label: 'Designator',  desc: '+25% dmg vs marked',
              glyph: 'crit', patch: { markedDmg: 0.25, bountyMult: 0.25 } },
            { cost: 3800, label: 'Field Repair', desc: 'refresh ally CDs; ability',
              glyph: 'aura', patch: { bountyMult: 0.30, markedDmg: 0.35, buffFire: 0.20 },
              ability: 'fieldRepair' }
          ]
        }
      }
    },

    // ======== QUANT ADVISOR — economist ========
    quant: {
      unlock: { round: 26 },
      base: {
        name: 'Quant Advisor', short: 'Quant', cost: 800,
        sprite: 'orb_turret_quant', color: '#ffd86b',
        range: 130, fireRate: 0, dmg: 0,
        bountyMult: 0.35, interestRate: 0.04, interestCap: 40,
        proj: 'aura', priority: 'first',
        desc: '+bounty in range and per-wave interest on cash. No DPS.'
      },
      paths: {
        A: {
          id: 'aggressive', name: 'Aggressive Portfolio', accent: '#ffd86b',
          tiers: [
            { cost:  400, label: 'More Bounty', desc: '+20% bounty mult, +15 range',
              glyph: 'money', patch: { bountyMult: 0.55, range: 145 } },
            { cost:  800, label: 'Higher Interest', desc: '+2% rate, +$40 cap',
              glyph: 'money', patch: { interestRate: 0.06, interestCap: 80 } },
            { cost: 1400, label: 'Big Returns', desc: '10% rate, $180 cap',
              glyph: 'money', patch: { interestRate: 0.10, interestCap: 180, bountyMult: 0.85 } },
            { cost: 3500, label: 'Stock Crash', desc: 'instant 5× interest; ability',
              glyph: 'star', patch: { interestRate: 0.14, interestCap: 280, bountyMult: 1.10 },
              ability: 'stockCrash' }
          ]
        },
        B: {
          id: 'hedge', name: 'Hedge Fund', accent: '#7ae0ff',
          tiers: [
            { cost:  500, label: 'Global Hedge', desc: '5% bounty WORLDWIDE',
              glyph: 'aura', patch: { worldBountyMult: 0.05, bountyMult: 0.20 } },
            { cost: 1000, label: 'Network Effect', desc: '10% world bounty',
              glyph: 'chain', patch: { worldBountyMult: 0.10 } },
            { cost: 1800, label: 'Portfolio Mgr', desc: '15% world, +interest',
              glyph: 'chain', patch: { worldBountyMult: 0.15, interestRate: 0.06, interestCap: 100 } },
            { cost: 4000, label: 'Insider Trading', desc: '+200% world for 10s; ability',
              glyph: 'money', patch: { worldBountyMult: 0.20, interestRate: 0.08, interestCap: 160 },
              ability: 'insiderTrading' }
          ]
        }
      }
    },

    // ======== PHASE 2 NEW TOWERS ========

    // ======== SNIPER PLATFORM — global single-shot ========
    sniper: {
      unlock: { round: 14 },
      base: {
        name: 'Sniper Platform', short: 'Sniper', cost: 700,
        sprite: 'orb_turret_sniper', color: '#9aa6c0',
        range: 9999, fireRate: 0.5, dmg: 18, antiArmor: true,
        projSpeed: 1400, proj: 'rail', priority: 'strong',
        desc: 'Global range. Hits one target hard. Sees through armor. Path A reveals camo.'
      },
      paths: {
        A: {
          id: 'recon', name: 'Recon Net', accent: '#7ae0ff',
          tiers: [
            { cost:  450, label: 'Spotter',     desc: 'reveals camo; +30% bounty 5s on kill',
              glyph: 'eye', patch: { spotterBuff: 0.30, seesCamo: true } },
            { cost:  900, label: 'Rangefinder', desc: '+10 dmg',
              glyph: 'crit', patch: { dmg: 28 } },
            { cost: 1700, label: 'Tag Target',  desc: 'tagged enemies take +50% dmg',
              glyph: 'crit', patch: { tagging: { mul: 0.50, dur: 4 } } },
            { cost: 4000, label: 'Marksman',    desc: 'instakill non-boss; ability',
              glyph: 'crit', patch: { dmg: 60, fireRate: 0.7, tagging: { mul: 0.75, dur: 5 } },
              ability: 'pinpoint' }
          ]
        },
        B: {
          id: 'decap', name: 'Decapitator', accent: '#ff5566',
          tiers: [
            { cost:  500, label: 'Heavy Caliber', desc: '+17 dmg',
              glyph: 'dmg', patch: { dmg: 35 } },
            { cost:  950, label: 'Armor Drill',  desc: 'double dmg vs armored',
              glyph: 'shield', patch: { antiArmorDmg: 2.0 } },
            { cost: 1900, label: 'Bigger Bullet', desc: '+25 dmg',
              glyph: 'dmg', patch: { dmg: 60 } },
            { cost: 4500, label: 'Disintegrator', desc: 'instakill non-boss; ability',
              glyph: 'star', patch: { dmg: 120, fireRate: 0.4 },
              ability: 'disintegrate' }
          ]
        }
      },
      paragon: {
        name: 'Watcher',
        cost: 35000,
        unlockLifetimeXp: 5000,
        sprite: 'orb_turret_sniper_paragon',
        accent: '#7ae0ff',
        desc: 'Deletes the biggest threats in sight.',
        stats: { range: 9999, fireRate: 0.6, dmg: 900, pierce: 4, antiArmor: true, projSpeed: 900, proj: 'bolt', priority: 'first' },
        ability: 'paragonErase'
      }
    },

    // ======== ENGINEER STATION — mines + sentry ========
    engineer: {
      unlock: { round: 29 },
      base: {
        name: 'Engineer Station', short: 'Engineer', cost: 950,
        sprite: 'orb_turret_engineer', color: '#a87a40',
        range: 120, fireRate: 1.8, dmg: 6,
        projSpeed: 360, proj: 'bolt', priority: 'first',
        mineCD: 5, mineDmg: 35, mineRadius: 55, mineDrops: true,
        desc: 'Drops mines on the path. Sentry fires bolts.'
      },
      paths: {
        A: {
          id: 'minelayer', name: 'Mine Layer', accent: '#ffd86b',
          tiers: [
            { cost:  400, label: 'Frequent Mines', desc: 'mine CD 6 → 4s',
              glyph: 'rate', patch: { mineCD: 4 } },
            { cost:  800, label: 'Bigger Mines', desc: '+15 dmg, +20 radius',
              glyph: 'splash', patch: { mineDmg: 40, mineRadius: 70 } },
            { cost: 1500, label: 'Cluster Mines', desc: '3 mines per drop',
              glyph: 'burst', patch: { minePerDrop: 3 } },
            { cost: 3600, label: 'Minefield', desc: 'massive deploy; ability',
              glyph: 'mine', patch: { mineCD: 3, mineDmg: 60, mineRadius: 85, minePerDrop: 4 },
              ability: 'deployMines' }
          ]
        },
        B: {
          id: 'sentry', name: 'Auto-Sentry', accent: '#7ae0ff',
          tiers: [
            { cost:  500, label: 'Stronger Sentry', desc: '+4 dmg, +1 rate',
              glyph: 'dmg', patch: { dmg: 10, fireRate: 2.8 } },
            { cost:  900, label: 'Twin Barrels', desc: 'fires 2 bolts per shot',
              glyph: 'burst', patch: { multiShot: 2 } },
            { cost: 1700, label: 'Quick Hands', desc: '+1.5 fire rate',
              glyph: 'rate', patch: { fireRate: 4.0 } },
            { cost: 4000, label: 'Drone Operator', desc: 'spawns combat drones; ability',
              glyph: 'drone', patch: { dmg: 12, fireRate: 5.0, multiShot: 3 },
              ability: 'deployDrone' }
          ]
        }
      }
    },

    // ======== CRYO STATION — freeze ========
    cryo: {
      unlock: { round: 9 },
      base: {
        name: 'Cryo Station', short: 'Cryo', cost: 800,
        sprite: 'orb_turret_cryo', color: '#a8e8ff',
        range: 130, fireRate: 1.8, dmg: 2,
        projSpeed: 380, proj: 'frost', priority: 'first',
        freezeAmount: 0.55, freezeDuration: 2.0, brittleMul: 1.5,
        desc: 'Slows enemies to a crawl. Brittle targets take +50% dmg.'
      },
      paths: {
        A: {
          id: 'freeze', name: 'Deep Freeze', accent: '#a8e8ff',
          tiers: [
            { cost:  500, label: 'Stronger Chill', desc: 'freeze 55 → 80%',
              glyph: 'freeze', patch: { freezeAmount: 0.80 } },
            { cost:  900, label: 'Brittle Boost', desc: 'brittle 1.5× → 2.0×',
              glyph: 'crit', patch: { brittleMul: 2.0 } },
            { cost: 1600, label: 'Total Lockdown', desc: '30% chance to stun 1s',
              glyph: 'stun', patch: { freezeStunChance: 0.30 } },
            { cost: 3700, label: 'Absolute Zero', desc: 'freeze ALL on screen; ability',
              glyph: 'freeze', patch: { freezeAmount: 0.95, brittleMul: 2.5 },
              ability: 'bigChill' }
          ]
        },
        B: {
          id: 'shards', name: 'Cryo Shards', accent: '#7ae0ff',
          tiers: [
            { cost:  450, label: 'Shatter Shot', desc: 'splash 35, hits lead',
              glyph: 'splash', patch: { splash: 35, dmg: 5, proj: 'frost-shatter' } },
            { cost:  850, label: 'Frostbite',  desc: 'splash chills enemies',
              glyph: 'freeze', patch: { splash: 50, splashFreeze: 0.4 } },
            { cost: 1500, label: 'Frost Nova', desc: 'each shot is small AoE',
              glyph: 'splash', patch: { splash: 70, dmg: 8, splashFreeze: 0.5 } },
            { cost: 3500, label: 'Avalanche',  desc: 'massive frost AoE; ability',
              glyph: 'splash', patch: { splash: 90, dmg: 15, splashFreeze: 0.7, fireRate: 2.5 },
              ability: 'avalanche' }
          ]
        }
      }
    },

    // ======== MORTAR — long-arc heavy artillery ========
    mortar: {
      unlock: { round: 17 },
      base: {
        name: 'Mortar Battery', short: 'Mortar', cost: 1100,
        sprite: 'orb_turret_mortar', color: '#c8945a',
        range: 220, fireRate: 0.5, dmg: 28, splash: 75,
        projSpeed: 280, proj: 'plasma', priority: 'strong',
        desc: 'Lobs heavy HE shells at high arcs. Big splash, long range. Hits lead.'
      },
      paths: {
        A: {
          id: 'siege', name: 'Siege Cannon', accent: '#ff7a30',
          tiers: [
            { cost:  500, label: 'High Explosive', desc: '+12 dmg, +20 splash',
              glyph: 'splash', patch: { dmg: 40, splash: 95 } },
            { cost:  900, label: 'Reinforced Tube', desc: '+30 range, +14 dmg',
              glyph: 'range', patch: { range: 250, dmg: 54 } },
            { cost: 1700, label: 'Bunker Buster', desc: 'shells crack armor',
              glyph: 'shield', patch: { dmg: 78, antiArmor: true, splash: 110 } },
            { cost: 4200, label: 'Siege Mortar', desc: 'massive shells; ability',
              glyph: 'nuke', patch: { dmg: 130, splash: 150, fireRate: 0.7, antiArmor: true },
              ability: 'carpetBomb' }
          ]
        },
        B: {
          id: 'barrage', name: 'Barrage Mode', accent: '#ffd86b',
          tiers: [
            { cost:  450, label: 'Twin Tubes', desc: 'fires 2 shells per shot',
              glyph: 'burst', patch: { multiShot: 2, spread: 0.18 } },
            { cost:  850, label: 'Faster Loader', desc: '+0.4 fire rate',
              glyph: 'rate', patch: { fireRate: 0.9 } },
            { cost: 1600, label: 'Saturation Fire', desc: '4 shells per shot',
              glyph: 'burst', patch: { multiShot: 4, spread: 0.30, dmg: 36 } },
            { cost: 4000, label: 'Kingmaker', desc: '6-shell salvo; ability',
              glyph: 'splash', patch: { multiShot: 6, spread: 0.45, splash: 95, dmg: 50 },
              ability: 'scatterShot' }
          ]
        }
      }
    },

    // ======== CRYSTAL PRISM — piercing prismatic bolts ========
    crystal: {
      unlock: { round: 32 },
      base: {
        name: 'Crystal Prism', short: 'Crystal', cost: 1300,
        sprite: 'orb_turret_crystal', color: '#ff80c8',
        range: 180, fireRate: 1.6, dmg: 22, pierce: 5,
        projSpeed: 620, proj: 'bolt', priority: 'first',
        desc: 'Refracted prism bolts pierce many enemies in a line.'
      },
      paths: {
        A: {
          id: 'refract', name: 'Refraction', accent: '#ff80c8',
          tiers: [
            { cost:  600, label: 'Sharper Facets', desc: '+10 dmg, +2 pierce',
              glyph: 'pierce', patch: { dmg: 32, pierce: 7 } },
            { cost: 1100, label: 'Hyper Crystal', desc: '+14 dmg, +0.4 rate',
              glyph: 'dmg', patch: { dmg: 46, fireRate: 2.0 } },
            { cost: 1900, label: 'Spectrum Split', desc: 'fires 3 prism bolts',
              glyph: 'burst', patch: { multiShot: 3, spread: 0.22, pierce: 9 } },
            { cost: 4500, label: 'Rainbow Lance', desc: 'pierces ALL; ability',
              glyph: 'star', patch: { dmg: 60, pierce: 30, fireRate: 2.5, multiShot: 3 },
              ability: 'spectrumBurst' }
          ]
        },
        B: {
          id: 'shatter', name: 'Shatter Field', accent: '#c8a8ff',
          tiers: [
            { cost:  500, label: 'Brittle Touch', desc: 'hits leave brittle',
              glyph: 'crit', patch: { brittleMul: 1.5 } },
            { cost: 1000, label: 'Resonance', desc: 'splash 35 on hit',
              glyph: 'splash', patch: { splash: 35, dmg: 22 } },
            { cost: 1800, label: 'Shockwave', desc: 'splash 60, +brittle',
              glyph: 'splash', patch: { splash: 60, brittleMul: 2.0 } },
            { cost: 4200, label: 'Dimensional Cut', desc: 'huge AoE rounds; ability',
              glyph: 'star', patch: { dmg: 50, splash: 95, brittleMul: 2.5, fireRate: 2.0 },
              ability: 'avalanche' }
          ]
        }
      }
    },

    // ======== CHRONO FIELD — slow + tower buff ========
    chrono: {
      unlock: { round: 36 },
      base: {
        name: 'Chrono Field', short: 'Chrono', cost: 1100,
        sprite: 'orb_turret_chrono', color: '#c8a8ff',
        range: 140, fireRate: 0, dmg: 0,
        proj: 'aura', priority: 'first',
        timeSlow: 0.30, towerBuffFire: 0.20,
        desc: 'In its bubble: enemies slow, allied towers fire faster.'
      },
      paths: {
        A: {
          id: 'dilation', name: 'Time Dilation', accent: '#c8a8ff',
          tiers: [
            { cost:  500, label: 'Bigger Bubble', desc: '+35 range, stronger slow',
              glyph: 'range', patch: { range: 175, timeSlow: 0.45, towerBuffFire: 0.30 } },
            { cost:  900, label: 'Heavier Slow', desc: 'slow 65%',
              glyph: 'time', patch: { timeSlow: 0.65 } },
            { cost: 1700, label: 'Synced Field', desc: '+50% rate, +20% dmg buff',
              glyph: 'aura', patch: { towerBuffFire: 0.50, towerBuffDmg: 0.20 } },
            { cost: 4000, label: 'Chronosphere', desc: '+200% rate burst; ability',
              glyph: 'star', patch: { timeSlow: 0.80, towerBuffFire: 0.80, towerBuffDmg: 0.30 },
              ability: 'chronosphere' }
          ]
        },
        B: {
          id: 'anchor', name: 'Temporal Anchor', accent: '#8a6cd8',
          tiers: [
            { cost:  450, label: 'Pinpoint',  desc: '0.3s stun on entering field',
              glyph: 'stun', patch: { entryStun: 0.3 } },
            { cost:  900, label: 'Phase Lock', desc: '0.6s stun, larger field',
              glyph: 'stun', patch: { entryStun: 0.6, range: 165 } },
            { cost: 1600, label: 'Heavy Anchor', desc: 'stun repeats every 2s',
              glyph: 'stun', patch: { repeatStun: { dur: 0.4, every: 2 } } },
            { cost: 3800, label: 'Quantum Stasis', desc: 'freeze all 4s; ability',
              glyph: 'time', patch: { repeatStun: { dur: 0.6, every: 1.5, evenUfo: true } },
              ability: 'stasisField' }
          ]
        }
      }
    },

    // ======== COMMANDER — auto-leveling hero (singleton) ========
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
            { cost: 400, label: 'Rally', desc: '+8% fire rate aura',
              glyph: 'aura', patch: { towerBuffFire: 0.08 } },
            { cost: 600, label: 'Long View', desc: '+40 range',
              glyph: 'range', patch: { range: 210 } },
            { cost: 1100, label: 'Marked', desc: 'enemies in aura take +15% dmg',
              glyph: 'crit', patch: { towerBuffFire: 0.10, debuffDmg: 0.15 } },
            { cost: 3200, label: 'Stand Fast', desc: 'fire-rate +100% nearby 8s',
              glyph: 'star',
              patch: { towerBuffFire: 0.12, debuffDmg: 0.18 },
              ability: 'standFast' }
          ]
        },
        B: {
          id: 'gunner', name: 'Gunner', accent: '#ffd86b',
          tiers: [
            { cost: 350, label: 'Heavy Rounds', desc: '+3 dmg',
              glyph: 'dmg', patch: { dmg: 9 } },
            { cost: 550, label: 'Fast Trigger', desc: '+2 fire rate',
              glyph: 'rate', patch: { fireRate: 4.5 } },
            { cost: 1000, label: 'Anti-Armor', desc: 'pierces armor',
              glyph: 'shield', patch: { antiArmor: true, dmg: 12 } },
            { cost: 2800, label: 'Barrage', desc: '20-round rapid salvo',
              glyph: 'burst', patch: { fireRate: 6, dmg: 15 },
              ability: 'heroBarrage' }
          ]
        }
      }
    }
  };

  // ---- Public API ----
  function keys() { return Object.keys(TOWERS); }
  function get(k) { return TOWERS[k]; }
  function base(k) { return TOWERS[k] && TOWERS[k].base; }
  function unlockRound(k) {
    const t = TOWERS[k];
    return (t && t.unlock && t.unlock.round) || 1;
  }
  function isUnlocked(k, bestRound) {
    return unlockRound(k) <= (bestRound | 0);
  }
  // True if the tower's base or any tier in any path grants seesCamo.
  // Used by the side panel to mark which towers can deal with camo enemies.
  function hasCamoDetection(k) {
    const t = TOWERS[k];
    if (!t) return false;
    if (t.base && t.base.seesCamo) return true;
    for (const p of ['A', 'B']) {
      const path = t.paths && t.paths[p];
      if (!path) continue;
      for (const tier of (path.tiers || [])) {
        if (tier.patch && tier.patch.seesCamo) return true;
      }
    }
    return false;
  }

  O.Towers = { catalog: TOWERS, keys, get, base, unlockRound, isUnlocked, hasCamoDetection };
})();
