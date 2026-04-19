/* Orbital — enemy modifier registry.
   Each mod is { id, label, color, apply(enemy), tick(enemy, dt, game), draw(ctx, e, time) }.
   Spawn-time stat changes go in `apply`. Per-frame behavior in `tick`.
   Visual overlay in `draw` (called after the body, before the HP bar).

   Damage gating is centralized in damageMul(enemy, source) so the existing
   damage() function in game.js can stay simple. */
(function () {
  const NDP = window.NDP;
  const O = NDP.Orbital;

  const REG = {
    armored: {
      id: 'armored', label: 'Armored', color: '#c8d8f0',
      apply(e) { e.hp = Math.round(e.hp * 1.2); e.maxHp = e.hp; e.armored = true; },
      damageMul(e, src) { return (src === 'beam' || src === 'sing' || e._antiArmor) ? 1 : 0.5; }
    },
    swift: {
      id: 'swift', label: 'Swift', color: '#7ae0ff',
      apply(e) { e.speed = Math.round(e.speed * 1.6); e.swift = true; }
    },
    regen: {
      id: 'regen', label: 'Regenerator', color: '#4ade80',
      apply(e) { e.hp = Math.round(e.hp * 1.5); e.maxHp = e.hp; e.regen = true; },
      tick(e, dt, game) {
        if (game.time - e.lastDamagedT > 1.5 && e.hp < e.maxHp) {
          e.hp = Math.min(e.maxHp, e.hp + 4 * dt);
        }
      }
    },
    camo: {
      // Invisible to towers without camo-detection. A camo enemy in range
      // is simply not picked as a target; aoe still hits it.
      id: 'camo', label: 'Camo', color: '#7a8aa6',
      apply(e) { e.camo = true; },
      draw(ctx, e, time) {
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = '#9aa6c0';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.size * 0.55 + Math.sin(time * 4) * 1.2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    },
    lead: {
      // Sharply mitigates non-explosive damage. Cannon, Missile, Flare and
      // Cryo (shatter) bypass.
      id: 'lead', label: 'Lead', color: '#7080a0',
      apply(e) { e.hp = Math.round(e.hp * 1.1); e.maxHp = e.hp; e.lead = true; },
      damageMul(e, src) {
        // Explosive / heavy ordnance penetrates lead casing. Energy and
        // pure kinetic do not. Mortar shells are HE and bypass alongside
        // cannon/missile.
        const ok = src === 'cannon' || src === 'missile' || src === 'flare' ||
                   src === 'sing'   || src === 'mortar'  ||
                   src === 'tesla-burst' || src === 'cryo-shatter';
        return ok ? 1 : 0.15;
      },
      draw(ctx, e, time) {
        ctx.save();
        ctx.fillStyle = '#5a6680';
        ctx.globalAlpha = 0.85;
        const r = e.size * 0.5;
        ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#283040';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(e.x - r * 0.25, e.y - r * 0.25, r * 0.45, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(e.x + r * 0.3, e.y + r * 0.2, r * 0.3, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
    },
    fortified: {
      // 2× HP, 2× bounty. Visible heavy plating.
      id: 'fortified', label: 'Fortified', color: '#ffd86b',
      apply(e) {
        e.hp = Math.round(e.hp * 2.0); e.maxHp = e.hp;
        e.fortified = true;
        e._bountyMul = (e._bountyMul || 1) * 2;
      },
      draw(ctx, e, time) {
        ctx.save();
        ctx.strokeStyle = '#ffd86b';
        ctx.lineWidth = 2.5;
        ctx.globalAlpha = 0.55 + Math.sin(time * 2) * 0.15;
        const r = e.size * 0.5 + 4;
        // Octagonal plate ring
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + time * 0.3;
          const px = e.x + Math.cos(a) * r;
          const py = e.y + Math.sin(a) * r;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }
    }
  };

  // Aggregate damage gate (multi-mod compatible: takes the LOWEST mul).
  function damageMul(enemy, source) {
    let mul = 1;
    if (!enemy.mods) return mul;
    for (const id of enemy.mods) {
      const m = REG[id];
      if (m && typeof m.damageMul === 'function') {
        mul = Math.min(mul, m.damageMul(enemy, source));
      }
    }
    return mul;
  }

  function applyAll(enemy, modIds) {
    if (!modIds || !modIds.length) return;
    for (const id of modIds) {
      const m = REG[id];
      if (m && m.apply) m.apply(enemy);
    }
  }

  function tickAll(enemy, dt, game) {
    if (!enemy.mods) return;
    for (const id of enemy.mods) {
      const m = REG[id];
      if (m && m.tick) m.tick(enemy, dt, game);
    }
  }

  function drawAll(ctx, enemy, time) {
    if (!enemy.mods) return;
    for (const id of enemy.mods) {
      const m = REG[id];
      if (m && m.draw) m.draw(ctx, enemy, time);
    }
  }

  function bountyMul(enemy) {
    return enemy._bountyMul || 1;
  }

  // Camo gate for targeting. Towers can have stats.seesCamo = true to bypass.
  function isVisibleTo(enemy, tower) {
    if (!enemy.camo) return true;
    return !!(tower.stats && tower.stats.seesCamo);
  }

  O.EnemyMods = { REG, applyAll, tickAll, drawAll, damageMul, bountyMul, isVisibleTo };
})();
