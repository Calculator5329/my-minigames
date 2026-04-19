/* Reactor — module catalog.
   Pure data + drawing helpers. No game-state coupling beyond what is passed in.
   Exposes NDP.Reactor.Modules. */
(function () {
  const NDP = (window.NDP = window.NDP || {});
  NDP.Reactor = NDP.Reactor || {};

  const COST_GROWTH = 1.6;

  /* Module catalog. Order here drives card layout (right-side panel, 11 cards). */
  const CATALOG = [
    {
      id: 'rig',     name: 'Mining Rig',     base: 50,    color: '#ffd86b',
      desc: '+25% income mult per rig.', tier: 1
    },
    {
      id: 'solar',   name: 'Solar Array',    base: 80,    color: '#ffe066',
      desc: '+$5/s base income, no heat.', tier: 1
    },
    {
      id: 'cool',    name: 'Coolant Loop',   base: 120,   color: '#7cd9ff',
      desc: '+20 max heat, +1 coolant/s.', tier: 1
    },
    {
      id: 'hab',     name: 'Worker Habitat', base: 180,   color: '#f0b27a',
      desc: '+1 worker, +5% income per habitat.', tier: 1
    },
    {
      id: 'shield',  name: 'Shielding',      base: 250,   color: '#4ade80',
      desc: 'Reduce meteor damage 50% per layer.', tier: 2
    },
    {
      id: 'laser',   name: 'Containment Laser', base: 350, color: '#ff6ad5',
      desc: '25%/level chance to vaporize meteors.', tier: 2
    },
    {
      id: 'core',    name: 'Reactor Core+',  base: 500,   color: '#ff5e7e',
      desc: '+30% efficiency (watts/heat).', tier: 2
    },
    {
      id: 'pump',    name: 'Helium Pump',    base: 800,   color: '#b794f6',
      desc: 'Stable throttle 20-60%: ramps mult +50%.', tier: 3
    },
    {
      id: 'pad',     name: 'Launch Pad',     base: 1000,  color: '#a855f7',
      desc: 'Ships ore every 8s for $ burst.', tier: 3
    },
    {
      id: 'box',     name: 'Black Box',      base: 1500,  color: '#cccccc',
      desc: 'One-time revive: prevents one meltdown.', tier: 3
    },
    {
      id: 'auto',    name: 'Auto-Stabilizer',base: 2000,  color: '#60a5fa',
      desc: 'Pulls throttle down when critical.', tier: 3
    }
  ];

  const BY_ID = {};
  CATALOG.forEach(m => BY_ID[m.id] = m);

  function costFor(mod, owned) {
    return Math.ceil(mod.base * Math.pow(COST_GROWTH, owned | 0));
  }

  /* Recompute derived stats after a buy/loss. game.modules is { id: count }. */
  function applyEffects(game) {
    const m = game.modules;
    game.incomeMult     = 1.0 + 0.25 * (m.rig || 0)
                              + 0.05 * (m.hab || 0);
    game.efficiency     = 1.0 + 0.30 * (m.core || 0);
    game.maxHeat        = game.baseMaxHeat + 20 * (m.cool || 0);
    game.coolantRegen   = 1.0 + 1.0 * (m.cool || 0);
    game.maxCoolant     = game.baseMaxCoolant + 30 * (m.cool || 0);
    game.shielding      = 1 - Math.pow(0.5, m.shield || 0);
    if (game.shielding > 0.9) game.shielding = 0.9;
    game.solarIncome    = 5 * (m.solar || 0);
    game.laserChance    = Math.min(0.95, 0.25 * (m.laser || 0));
    /* pump bonus is tracked in update loop; just ensure cap is right */
    game.pumpCapBonus   = 0.5 * (m.pump || 0); /* up to +50% per pump */
  }

  /* Maximum income mult contribution from helium pumps, used as the soft cap
     for the slowly-growing pumpBonus. */
  function pumpStableActive(game) {
    return game.throttle >= 0.20 && game.throttle <= 0.60;
  }

  /* Tick the helium pump bonus. Called from the main update. */
  function tickPump(game, dt) {
    const owned = game.modules.pump || 0;
    if (owned <= 0) {
      game.pumpBonus = 0;
      game.pumpStableT = 0;
      return;
    }
    if (pumpStableActive(game)) {
      game.pumpStableT += dt;
      if (game.pumpStableT > 3) {
        const cap = 0.5 * owned;
        game.pumpBonus = Math.min(cap, game.pumpBonus + 0.06 * owned * dt);
      }
    } else {
      /* lose ramp quickly when leaving the band */
      game.pumpStableT = 0;
      game.pumpBonus = Math.max(0, game.pumpBonus - 0.20 * dt);
    }
  }

  /* Black Box: try to consume one revive. Returns true if used. */
  function tryConsumeBox(game) {
    if ((game.modules.box || 0) <= 0) return false;
    game.modules.box -= 1;
    applyEffects(game);
    return true;
  }

  /* Glyph icon for the module pod / card. Drawn at (x,y), centered. */
  function drawGlyph(ctx, id, x, y, color, owned) {
    const c = owned ? color : 'rgba(120,130,150,0.5)';
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = 2;
    switch (id) {
      case 'rig': {
        ctx.beginPath();
        ctx.moveTo(-8, 6); ctx.lineTo(8, -6); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-8, -6); ctx.lineTo(-2, 0); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(8, 6); ctx.lineTo(2, 0); ctx.stroke();
        ctx.fillRect(6, -10, 6, 6);
        break;
      }
      case 'cool': {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(a) * 9, Math.sin(a) * 9);
          ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'shield': {
        ctx.beginPath();
        ctx.moveTo(0, -10); ctx.lineTo(8, -6); ctx.lineTo(8, 4);
        ctx.lineTo(0, 10); ctx.lineTo(-8, 4); ctx.lineTo(-8, -6);
        ctx.closePath();
        ctx.stroke();
        break;
      }
      case 'core': {
        ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
        for (let i = 0; i < 3; i++) {
          ctx.save();
          ctx.rotate(i * Math.PI / 3);
          ctx.beginPath();
          ctx.ellipse(0, 0, 9, 4, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
        break;
      }
      case 'pad': {
        ctx.beginPath();
        ctx.moveTo(0, -10); ctx.lineTo(-4, 4); ctx.lineTo(4, 4); ctx.closePath();
        ctx.fill();
        ctx.fillRect(-6, 5, 12, 3);
        break;
      }
      case 'auto': {
        ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-9, 0); ctx.lineTo(-6, -3); ctx.moveTo(-9, 0); ctx.lineTo(-6, 3);
        ctx.moveTo(9, 0); ctx.lineTo(6, -3); ctx.moveTo(9, 0); ctx.lineTo(6, 3);
        ctx.stroke();
        break;
      }
      case 'solar': {
        /* Sun with rays + panel grid */
        ctx.beginPath(); ctx.arc(0, -2, 4, 0, Math.PI * 2); ctx.fill();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * 5, -2 + Math.sin(a) * 5);
          ctx.lineTo(Math.cos(a) * 8, -2 + Math.sin(a) * 8);
          ctx.stroke();
        }
        ctx.strokeRect(-7, 6, 14, 4);
        ctx.beginPath();
        ctx.moveTo(-2.5, 6); ctx.lineTo(-2.5, 10);
        ctx.moveTo(2.5, 6); ctx.lineTo(2.5, 10);
        ctx.stroke();
        break;
      }
      case 'laser': {
        /* Turret with beam */
        ctx.fillRect(-6, 4, 12, 5);
        ctx.beginPath(); ctx.arc(0, 4, 3, Math.PI, 0); ctx.fill();
        ctx.strokeStyle = c;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(0, 1); ctx.lineTo(0, -10); ctx.stroke();
        /* spark at tip */
        ctx.beginPath(); ctx.arc(0, -10, 1.5, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'pump': {
        /* He² in a tube */
        ctx.strokeRect(-6, -8, 12, 16);
        ctx.fillRect(-5, -2, 10, 9);
        ctx.fillStyle = '#1a2230';
        ctx.font = 'bold 8px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('He³', 0, 1);
        break;
      }
      case 'hab': {
        /* Habitat dome */
        ctx.beginPath();
        ctx.arc(0, 4, 8, Math.PI, 0); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-8, 4); ctx.lineTo(8, 4); ctx.stroke();
        /* window */
        ctx.fillStyle = c;
        ctx.fillRect(-2, -2, 4, 4);
        /* antenna */
        ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(0, -10); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, -11, 1.5, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'box': {
        /* Briefcase */
        ctx.fillRect(-8, -3, 16, 11);
        ctx.fillStyle = '#1a2230';
        ctx.fillRect(-2, -2, 4, 2);
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.moveTo(-3, -3); ctx.lineTo(-3, -7); ctx.lineTo(3, -7); ctx.lineTo(3, -3);
        ctx.stroke();
        break;
      }
    }
    ctx.restore();
  }

  NDP.Reactor.Modules = {
    CATALOG, BY_ID, COST_GROWTH,
    costFor, applyEffects, drawGlyph,
    tickPump, tryConsumeBox, pumpStableActive
  };
})();
