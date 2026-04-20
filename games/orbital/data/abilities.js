/* Orbital — active ability catalog.
   Each ability is { id, label, desc, cd, glyph, color,
                     activate(game, tower) -> void,
                     tick(game, tower, dt)  -> optional }.
   `activate` runs once when triggered; `tick` runs every frame while the
   effect is alive (use tower.abilityFx[id] timers to track).
   `cd` is the cooldown in seconds (1 of 1 charge model, like BTD).

   Game.js calls these by id — the ability id lives on tower.abilityIds.A
   or tower.abilityIds.B (set by Upgrades.rebuildStats).

   Many of these intentionally use `flashMessage`, `spawnFloater`, and
   `particles` directly — they're transient effects, not mechanics changes.
   Mechanics belong on the patched stats; abilities are punctuation. */
(function () {
  const NDP = window.NDP;
  const O = NDP.Orbital;

  const A = {

    // ---- DART ----
    rapidStrike: {
      label: 'Rapid Strike', desc: '4× fire rate for 5s',
      cd: 25, glyph: 'rate', color: '#ff9055',
      activate(game, t) {
        t.abilityFx.rapidStrike = 5.0;
        game.flashMessage('RAPID STRIKE', '#ff9055');
      },
      tick(game, t, dt) {
        if (!t.abilityFx.rapidStrike) return;
        t.abilityFx.rapidStrike = Math.max(0, t.abilityFx.rapidStrike - dt);
      },
      multiplier(t) { return t.abilityFx.rapidStrike > 0 ? 4 : 1; }
    },
    preciseShot: {
      label: 'Precise Shot', desc: 'next shot deals 4× damage',
      cd: 18, glyph: 'crit', color: '#7ae0ff',
      activate(game, t) {
        t.abilityFx.preciseShot = 1; // consumed on next fire
        game.flashMessage('PRECISE SHOT', '#7ae0ff');
      }
    },

    // ---- CANNON ----
    carpetBomb: {
      label: 'Carpet Bomb', desc: '6 heavy shells over 1s',
      cd: 40, glyph: 'nuke', color: '#ff5530',
      activate(game, t) {
        t.abilityFx.carpetBomb = { left: 6, t: 0 };
        game.flashMessage('CARPET BOMB', '#ff5530');
      },
      tick(game, t, dt) {
        const fx = t.abilityFx.carpetBomb;
        if (!fx) return;
        fx.t += dt;
        if (fx.t >= 0.15 && fx.left > 0) {
          fx.t = 0; fx.left--;
          // Lobs a shell along the path ahead of leading enemy.
          game._abilityCarpetShell(t);
        }
        if (fx.left <= 0) t.abilityFx.carpetBomb = null;
      }
    },
    scatterShot: {
      label: 'Scatter Shot', desc: '12-shell wave, wide spread',
      cd: 28, glyph: 'burst', color: '#ffd86b',
      activate(game, t) {
        game._abilityScatter(t, 12, 1.2);
        game.flashMessage('SCATTER SHOT', '#ffd86b');
      }
    },

    // ---- BEAM ----
    spectrumBurst: {
      label: 'Spectrum Burst', desc: 'beam DPS x3 for 4s + chain to all',
      cd: 32, glyph: 'chain', color: '#ff4fd8',
      activate(game, t) { t.abilityFx.spectrumBurst = 4.0; game.flashMessage('SPECTRUM BURST', '#ff4fd8'); },
      tick(g, t, dt) { if (t.abilityFx.spectrumBurst) t.abilityFx.spectrumBurst = Math.max(0, t.abilityFx.spectrumBurst - dt); },
      multiplier(t) { return t.abilityFx.spectrumBurst > 0 ? 3 : 1; }
    },
    solarLance: {
      label: 'Solar Lance', desc: 'massive beam, instakills heavies for 5s',
      cd: 45, glyph: 'star', color: '#ffd86b',
      activate(game, t) { t.abilityFx.solarLance = 5.0; game.flashMessage('SOLAR LANCE', '#ffd86b'); },
      tick(g, t, dt) { if (t.abilityFx.solarLance) t.abilityFx.solarLance = Math.max(0, t.abilityFx.solarLance - dt); }
    },

    // ---- GRAVITY ----
    timeStop: {
      label: 'Time Stop', desc: 'freezes all in field for 4s',
      cd: 40, glyph: 'time', color: '#a070ff',
      activate(game, t) { t.abilityFx.timeStop = 4.0; game.flashMessage('TIME STOP', '#a070ff'); },
      tick(g, t, dt) { if (t.abilityFx.timeStop) t.abilityFx.timeStop = Math.max(0, t.abilityFx.timeStop - dt); }
    },
    quantumAnchor: {
      label: 'Quantum Anchor', desc: 'all enemies stunned 2s',
      cd: 50, glyph: 'stun', color: '#7ae0ff',
      activate(game, t) {
        for (const e of game.enemies) e.stunUntil = game.time + 2.0;
        game.flashMessage('QUANTUM ANCHOR', '#7ae0ff');
      }
    },

    // ---- FLARE ----
    heatStorm: {
      label: 'Heat Storm', desc: 'pulse continuously for 5s',
      cd: 38, glyph: 'burn', color: '#ff8040',
      activate(g, t) { t.abilityFx.heatStorm = 5.0; g.flashMessage('HEAT STORM', '#ff8040'); },
      tick(g, t, dt) {
        if (!t.abilityFx.heatStorm) return;
        t.abilityFx.heatStorm = Math.max(0, t.abilityFx.heatStorm - dt);
        // continuous pulse — set a low CD while storming
        t.pulseCd = Math.min(t.pulseCd, 0.25);
      }
    },
    helios: {
      label: 'Helios Cannon', desc: 'screen-wide solar burst (250 dmg)',
      cd: 60, glyph: 'star', color: '#ffd86b',
      activate(g, t) {
        for (const e of g.enemies) g.damage(e, 250, 'flare');
        g.flash('#ffd86b', 0.55);
        g.flashMessage('HELIOS', '#ffd86b');
      }
    },

    // ---- SING ----
    eventHorizon: {
      label: 'Event Horizon', desc: '3× collapse field, instant trigger',
      cd: 50, glyph: 'star', color: '#a070ff',
      activate(g, t) {
        const orig = t.stats.collapseRadius;
        t.stats.collapseRadius = orig * 1.8;
        t.collapseCd = 0; // instant trigger
        setTimeout(() => { t.stats.collapseRadius = orig; }, 400);
        g.flashMessage('EVENT HORIZON', '#a070ff');
      }
    },
    lobBomb: {
      label: 'Singularity Bomb', desc: 'lobs a massive bomb',
      cd: 35, glyph: 'nuke', color: '#7ae0ff',
      activate(g, t) {
        // Lobs at the leading enemy.
        let lead = null, ld = -Infinity;
        for (const e of g.enemies) if (e.pathS > ld) { lead = e; ld = e.pathS; }
        if (lead) g._abilityLobBomb(t, lead.x, lead.y);
        g.flashMessage('BLACK HOLE BOMB', '#7ae0ff');
      }
    },

    // ---- TESLA ----
    staticSurge: {
      label: 'Static Surge', desc: 'arcs to ALL enemies for 4s',
      cd: 35, glyph: 'rate', color: '#7aaaff',
      activate(g, t) { t.abilityFx.staticSurge = 4.0; g.flashMessage('STATIC SURGE', '#7aaaff'); },
      tick(g, t, dt) { if (t.abilityFx.staticSurge) t.abilityFx.staticSurge = Math.max(0, t.abilityFx.staticSurge - dt); }
    },
    dischargeAll: {
      label: 'Capacitor Discharge', desc: 'releases stored charge as huge AoE',
      cd: 30, glyph: 'star', color: '#ffd86b',
      activate(g, t) {
        const stored = (t.capacitorStored || 0);
        const dmg = stored * 4;
        const r = (t.stats.capacitor && t.stats.capacitor.area) || 100;
        for (const e of g.enemies) {
          const d2 = (e.x - t.x) ** 2 + (e.y - t.y) ** 2;
          if (d2 <= r * r) g.damage(e, dmg, 'tesla-burst');
        }
        g.particles.add(t.x, t.y, '#ffd86b', { count: 40, life: 0.6, speed: 220, size: 4 });
        t.capacitorStored = 0;
        g.flashMessage(`SURGE ${Math.round(dmg)}`, '#ffd86b');
      }
    },

    // ---- MISSILE ----
    salvo: {
      label: 'Salvo', desc: 'fires 12 missiles instantly',
      cd: 35, glyph: 'burst', color: '#ff8040',
      activate(g, t) { g._abilitySalvo(t, 12); g.flashMessage('SALVO', '#ff8040'); }
    },
    icbm: {
      label: 'ICBM', desc: 'global mega-warhead (800 dmg, 200 splash)',
      cd: 80, glyph: 'nuke', color: '#ff6060',
      activate(g, t) {
        let lead = null, ld = -Infinity;
        for (const e of g.enemies) if (e.pathS > ld) { lead = e; ld = e.pathS; }
        if (lead) g._abilityICBM(t, lead.x, lead.y);
        g.flashMessage('ICBM INBOUND', '#ff6060');
      }
    },

    // ---- SUPPORT ----
    overclock: {
      label: 'Overclock', desc: '+100% rate on towers in range, 6s',
      cd: 40, glyph: 'rate', color: '#4ade80',
      activate(g, t) { t.abilityFx.overclock = 6.0; g.flashMessage('OVERCLOCK', '#4ade80'); },
      tick(g, t, dt) { if (t.abilityFx.overclock) t.abilityFx.overclock = Math.max(0, t.abilityFx.overclock - dt); }
    },
    fieldRepair: {
      label: 'Field Repair', desc: 'refresh all ally ability CDs in range',
      cd: 90, glyph: 'aura', color: '#7ae0ff',
      activate(g, t) {
        const r = t.stats.range;
        for (const o of g.towers) {
          if (o === t) continue;
          const d2 = (o.x - t.x) ** 2 + (o.y - t.y) ** 2;
          if (d2 <= r * r) {
            for (const k of Object.keys(o.abilityCDs || {})) o.abilityCDs[k] = 0;
          }
        }
        g.flashMessage('FIELD REPAIR', '#7ae0ff');
      }
    },

    // ---- QUANT ----
    stockCrash: {
      label: 'Stock Crash', desc: 'instant 5× interest payout',
      cd: 60, glyph: 'star', color: '#ffd86b',
      activate(g, t) {
        const rate = (t.stats.interestRate || 0) * 5;
        const cap = (t.stats.interestCap  || 0) * 5;
        const interest = Math.min(cap, Math.floor(g.cash * rate));
        g.cash += interest;
        g.spawnFloater(t.x, t.y - 30, '+$' + interest, '#ffd86b');
        g.flashMessage('STOCK CRASH', '#ffd86b');
      }
    },
    insiderTrading: {
      label: 'Insider Trading', desc: '+200% world bounty for 10s',
      cd: 75, glyph: 'money', color: '#7ae0ff',
      activate(g, t) {
        g.insiderTradingT = 10.0;
        g.flashMessage('INSIDER TRADING', '#7ae0ff');
      }
    },

    // ---- SNIPER ----
    pinpoint: {
      label: 'Pinpoint', desc: 'instakill any non-boss',
      cd: 30, glyph: 'crit', color: '#7ae0ff',
      activate(g, t) {
        // Kills the strongest non-boss on the map.
        let best = null, bv = -Infinity;
        for (const e of g.enemies) {
          if (e.boss) continue;
          if (e.maxHp > bv) { bv = e.maxHp; best = e; }
        }
        if (best) g.damage(best, 99999, 'sniper');
        g.flashMessage('PINPOINT', '#7ae0ff');
      }
    },
    disintegrate: {
      label: 'Disintegrate', desc: 'instakill 3 strongest non-bosses',
      cd: 60, glyph: 'star', color: '#ff5566',
      activate(g, t) {
        const list = g.enemies.filter(e => !e.boss).sort((a, b) => b.maxHp - a.maxHp);
        for (let i = 0; i < Math.min(3, list.length); i++) {
          g.damage(list[i], 99999, 'sniper');
        }
        g.flashMessage('DISINTEGRATE', '#ff5566');
      }
    },

    // ---- ENGINEER ----
    deployMines: {
      label: 'Deploy Minefield', desc: 'drops 8 mines along the path',
      cd: 30, glyph: 'mine', color: '#ffd86b',
      activate(g, t) { g._abilityDeployMines(t, 8); g.flashMessage('MINEFIELD', '#ffd86b'); }
    },
    deployDrone: {
      label: 'Deploy Drone', desc: 'spawns combat drone for 15s',
      cd: 50, glyph: 'drone', color: '#7ae0ff',
      activate(g, t) { g._abilityDeployDrone(t); g.flashMessage('DRONE LAUNCHED', '#7ae0ff'); }
    },

    // ---- CRYO ----
    bigChill: {
      label: 'Big Chill', desc: 'freeze ALL enemies for 3s',
      cd: 40, glyph: 'freeze', color: '#a8e8ff',
      activate(g, t) {
        for (const e of g.enemies) {
          e.chillT = 3.0; e.chillAmount = 0.95;
          e.brittleT = 3.5; e.brittleMul = Math.max(e.brittleMul || 1, t.stats.brittleMul || 1.5);
        }
        g.flash('#a8e8ff', 0.4);
        g.flashMessage('BIG CHILL', '#a8e8ff');
      }
    },
    avalanche: {
      label: 'Avalanche', desc: 'massive frost AoE on leading enemy',
      cd: 35, glyph: 'splash', color: '#7ae0ff',
      activate(g, t) {
        let lead = null, ld = -Infinity;
        for (const e of g.enemies) if (e.pathS > ld) { lead = e; ld = e.pathS; }
        if (!lead) return;
        const r = 130;
        for (const e of g.enemies) {
          const d2 = (e.x - lead.x) ** 2 + (e.y - lead.y) ** 2;
          if (d2 <= r * r) {
            g.damage(e, 200, 'cryo-shatter');
            e.chillT = 4.0; e.chillAmount = 0.85;
          }
        }
        g.particles.add(lead.x, lead.y, '#7ae0ff', { count: 60, life: 0.7, speed: 200, size: 5 });
        g.flashMessage('AVALANCHE', '#7ae0ff');
      }
    },

    // ---- CHRONO ----
    chronosphere: {
      label: 'Chronosphere', desc: 'allies fire +200% for 5s',
      cd: 60, glyph: 'star', color: '#c8a8ff',
      activate(g, t) { t.abilityFx.chronosphere = 5.0; g.flashMessage('CHRONOSPHERE', '#c8a8ff'); },
      tick(g, t, dt) { if (t.abilityFx.chronosphere) t.abilityFx.chronosphere = Math.max(0, t.abilityFx.chronosphere - dt); }
    },
    stasisField: {
      label: 'Stasis Field', desc: 'freezes all in range 4s, even bosses',
      cd: 70, glyph: 'time', color: '#8a6cd8',
      activate(g, t) {
        const r = t.stats.range;
        for (const e of g.enemies) {
          const d2 = (e.x - t.x) ** 2 + (e.y - t.y) ** 2;
          if (d2 <= r * r) e.stunUntil = g.time + 4.0;
        }
        g.flashMessage('STASIS FIELD', '#8a6cd8');
      }
    },

    // ---- PARAGONS ----
    paragonBoltStorm: {
      label: 'Bolt Storm', desc: '40 bolts in a fan',
      cd: 75, glyph: 'burst', color: '#ffd86b',
      activate(game, t) {
        for (let i = 0; i < 40; i++) {
          const ang = (i / 40) * Math.PI * 2;
          game.projectiles.push({
            x: t.x, y: t.y, vx: Math.cos(ang) * 720, vy: Math.sin(ang) * 720,
            dmg: 20, pierce: 6, life: 1.6, type: 'bolt', fromTower: t,
            color: '#ffd86b'
          });
        }
        game.flashMessage('BOLT STORM', '#ffd86b');
      }
    },
    paragonOrbitalDrop: {
      label: 'Orbital Drop', desc: 'screen-shaking mega shell',
      cd: 90, glyph: 'nuke', color: '#ff5530',
      activate(game, t) {
        let lead = null, ld = -Infinity;
        for (const e of game.enemies) if (e.pathS > ld) { lead = e; ld = e.pathS; }
        const tx = lead ? lead.x : (game.canvas ? game.canvas.width / 2 : t.x);
        const ty = lead ? lead.y : (game.canvas ? game.canvas.height / 2 : t.y);
        for (const e of game.enemies) {
          const d2 = (e.x - tx) ** 2 + (e.y - ty) ** 2;
          if (d2 <= 200 * 200) game.damage(e, 600, 'orbital');
        }
        game.particles.add(tx, ty, '#ff5530',
          { count: 80, life: 1.2, speed: 360, size: 6 });
        game.flash('#ff5530', 0.6);
        game.flashMessage('ORBITAL DROP', '#ff5530');
      }
    },
    paragonSunburn: {
      label: 'Sunburn', desc: 'all enemies burn 8s',
      cd: 75, glyph: 'burn', color: '#ffd86b',
      activate(game, t) {
        for (const e of game.enemies) {
          e.burnT = 8; e.burnDps = 40; e.burnSource = t;
        }
        game.flash('#ffd86b', 0.4);
        game.flashMessage('SUNBURN', '#ffd86b');
      }
    },
    paragonCollapseAll: {
      label: 'Total Collapse', desc: 'map-wide gravity stun 5s',
      cd: 90, glyph: 'star', color: '#a070ff',
      activate(game, t) {
        for (const e of game.enemies) e.stunUntil = game.time + 5;
        game.flash('#a070ff', 0.5);
        game.flashMessage('TOTAL COLLAPSE', '#a070ff');
      }
    },
    paragonMIRV: {
      label: 'MIRV Strike', desc: '8 autonomous warheads',
      cd: 80, glyph: 'nuke', color: '#ff8040',
      activate(game, t) {
        const targets = game.enemies.slice()
          .sort((a, b) => b.maxHp - a.maxHp).slice(0, 8);
        for (const e of targets) {
          if (game._abilityICBM) game._abilityICBM(t, e.x, e.y);
        }
        game.flashMessage('MIRV STRIKE', '#ff8040');
      }
    },
    paragonErase: {
      label: 'Erase', desc: 'instakill top 5 non-bosses',
      cd: 60, glyph: 'crit', color: '#7ae0ff',
      activate(game, t) {
        const list = game.enemies.filter(e => !e.boss)
          .sort((a, b) => b.maxHp - a.maxHp);
        for (let i = 0; i < Math.min(5, list.length); i++) {
          game.damage(list[i], 999999, 'sniper');
        }
        game.flashMessage('ERASE', '#7ae0ff');
      }
    }
  };

  function get(id) { return A[id]; }
  function ids() { return Object.keys(A); }

  O.Abilities = { catalog: A, get, ids };
})();
