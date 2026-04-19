/* Reactor — event catalog and runtime.
   Owns the per-day event timers, the in-flight meteor list, the investor
   overlay, and the visual scheduling for boss-day comet showers.
   Exposes NDP.Reactor.Events. */
(function () {
  const NDP = (window.NDP = window.NDP || {});
  NDP.Reactor = NDP.Reactor || {};
  const Mods = () => NDP.Reactor.Modules;

  const W = 960, H = 600;

  /* ---------- Per-day cadence curve ----------
     Each event has a (min, max, perDay) function returning current cadence.
     `day` is 1-indexed. */
  function cadence(day, baseMin, baseMax, scale) {
    const factor = 1 / (1 + (day - 1) * scale);
    return {
      min: Math.max(2, baseMin * factor),
      max: Math.max(3, baseMax * factor)
    };
  }

  function pickInterval(c) { return c.min + Math.random() * (c.max - c.min); }

  /* ---------- Event runtime ----------
     The "Runtime" object below is created per game.init(). Holds all timers,
     in-flight lists, and the current investor overlay state. */

  function createRuntime(game) {
    const day = game.day || 1;
    return {
      meteorTimer:    pickInterval(cadence(day, 14, 18, 0.10)),
      flareTimer:     pickInterval(cadence(day, 18, 30, 0.08)),
      leakTimer:      25 + Math.random() * 10,
      investorTimer:  20 + Math.random() * 15,
      auroraTimer:    25 + Math.random() * 20,
      surgeTimer:     30 + Math.random() * 18,
      quakeTimer:     35 + Math.random() * 20,
      scriptedTimer:  null,        /* set per scripted event (e.g. comet shower) */
      scriptedEvent:  null,        /* currently-running scripted sequence */
      flareActive:    0,
      flareDur:       4,
      leakActive:     0,
      auroraActive:   0,
      surgeActive:    0,
      meteors:        [],
      investor:       null,        /* { cards, t, autoPickAt } */
      cracks:         []
    };
  }

  /* ---------- Meteors ---------- */

  function spawnMeteor(game, opts) {
    const ownedIds = Mods().CATALOG.map(m => m.id)
      .filter(id => (game.modules[id] || 0) > 0);
    let target;
    if (ownedIds.length === 0 || Math.random() < 0.4) {
      target = { kind: 'reactor', x: game.reactor.x, y: game.reactor.y };
    } else {
      const id = ownedIds[(Math.random() * ownedIds.length) | 0];
      const p = game.modulePositions[id] || { x: game.reactor.x, y: game.reactor.y };
      target = { kind: 'module', id, x: p.x, y: p.y };
    }
    const sx = (opts && opts.fromX != null) ? opts.fromX : W + 30;
    const sy = (opts && opts.fromY != null) ? opts.fromY : -30;
    const dx = target.x - sx, dy = target.y - sy;
    const d = Math.hypot(dx, dy);
    const sp = (opts && opts.speed) || 380;
    game.events.meteors.push({
      x: sx, y: sy,
      vx: (dx / d) * sp, vy: (dy / d) * sp,
      target, life: 3
    });
  }

  function impactMeteor(game, m) {
    game.sfx.play('impact');
    game.shake(10, 0.35);
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * Math.PI - Math.PI;
      const sp = 80 + Math.random() * 200;
      game.particles.emit({
        x: m.target.x, y: m.target.y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.5 + Math.random() * 0.5,
        size: 3, color: '#ffae44', gravity: 240
      });
    }
    const dmgRoll = Math.random();
    if (dmgRoll < game.shielding) {
      game.emitFloat(m.target.x, m.target.y - 30, 'BLOCKED', '#4ade80');
      return;
    }
    if (m.target.kind === 'reactor') {
      game.heat = Math.min(game.maxHeat + 30, game.heat + 25);
      game.emitFloat(game.reactor.x, game.reactor.y - 70, '+25 HEAT', '#ff5e7e');
      game.flash('#ff3a3a', 0.15);
      if (game._logHeat) game._logHeat('meteor', 'Meteor strike', 25);
    } else {
      const id = m.target.id;
      const had = game.modules[id] || 0;
      if (had > 0) {
        game.modules[id] = had - 1;
        Mods().applyEffects(game);
        game.emitFloat(m.target.x, m.target.y - 20, 'DAMAGED', '#ff8a8a');
      }
    }
    game.events.cracks.push({
      x: m.target.x + (Math.random()-0.5) * 40,
      y: H * 0.78,
      len: 30 + Math.random() * 40,
      ang: -Math.PI / 2 + (Math.random()-0.5) * 0.6,
      life: 8
    });
    /* Stat tracker for daily objectives. */
    if (game.dayStats) game.dayStats.meteorsHit = (game.dayStats.meteorsHit || 0) + 1;
  }

  function tryLaserVaporize(game, m) {
    if (game.laserChance <= 0) return false;
    if (Math.random() >= game.laserChance) return false;
    /* Laser zaps! Visual: line from nearest module pod to meteor + spark. */
    const podPos = game.modulePositions.laser || { x: W * 0.7, y: H * 0.7 };
    game.events.laserBeams = game.events.laserBeams || [];
    game.events.laserBeams.push({
      x1: podPos.x, y1: podPos.y, x2: m.x, y2: m.y, life: 0.18
    });
    game.sfx.play('laser');
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 120 + Math.random() * 180;
      game.particles.emit({
        x: m.x, y: m.y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.4, size: 2, color: '#ff6ad5', gravity: 50
      });
    }
    game.emitFloat(m.x, m.y - 16, 'VAPORIZED', '#ff6ad5');
    return true;
  }

  /* ---------- Flare / Leak ---------- */

  function triggerFlare(game) {
    const day = game.day || 1;
    game.events.flareDur = day >= 8 ? 8 : 4;
    game.events.flareActive = game.events.flareDur;
    game.sfx.play('flare');
    game.flash('#ffae44', 0.12);
    game.emitFloat(W * 0.5, 80, 'SOLAR FLARE', '#ffae44');
  }

  function triggerLeak(game) {
    game.events.leakActive = 8;
    game.emitFloat(game.reactor.x - 100, game.reactor.y + 80, 'COOLANT LEAK', '#7cd9ff');
    game.sfx.play('alarm', { freq: 500 });
  }

  /* ---------- Investor ---------- */

  /* Card pool. Each card returns true if accepted. Effects are applied when
     the card is picked. The `desc` is split into 2 lines when drawn. */
  const INVESTOR_CARDS = [
    {
      id: 'cash_burst',
      title: 'Cash Burst',
      desc: '+$1,000 now',
      apply(game) {
        game.cash += 1000; game.totalEarned += 1000;
        game.emitFloat(game.reactor.x, game.reactor.y - 70, '+$1000', '#ffd86b');
      }
    },
    {
      id: 'free_solar',
      title: 'Subsidized Solar',
      desc: 'Free Solar Array',
      apply(game) {
        game.modules.solar = (game.modules.solar || 0) + 1;
        Mods().applyEffects(game);
        game.emitFloat(game.reactor.x, game.reactor.y - 70, '+1 SOLAR', '#ffe066');
      }
    },
    {
      id: 'free_rig',
      title: 'Mining Contract',
      desc: 'Free Mining Rig',
      apply(game) {
        game.modules.rig = (game.modules.rig || 0) + 1;
        Mods().applyEffects(game);
        game.emitFloat(game.reactor.x, game.reactor.y - 70, '+1 RIG', '#ffd86b');
      }
    },
    {
      id: 'free_cool',
      title: 'Coolant Shipment',
      desc: 'Free Coolant Loop',
      apply(game) {
        game.modules.cool = (game.modules.cool || 0) + 1;
        Mods().applyEffects(game);
        game.coolant = game.maxCoolant;
        game.emitFloat(game.reactor.x, game.reactor.y - 70, '+1 COOL', '#7cd9ff');
      }
    },
    {
      id: 'risky_loan',
      title: 'Risky Loan',
      desc: '+$2,500 BUT +30 heat',
      danger: true,
      apply(game) {
        game.cash += 2500; game.totalEarned += 2500;
        game.heat = Math.min(game.maxHeat + 25, game.heat + 30);
        game.emitFloat(game.reactor.x, game.reactor.y - 70, 'LOAN +$2500', '#ffd86b');
        game.emitFloat(game.reactor.x, game.reactor.y - 50, '+30 HEAT', '#ff5e7e');
        if (game._logHeat) game._logHeat('risky_loan', 'Risky Loan', 30);
      }
    },
    {
      id: 'overclock',
      title: 'Overclock Deal',
      desc: '2× income for 8s',
      apply(game) {
        game.events.overclockT = 8;
        game.emitFloat(game.reactor.x, game.reactor.y - 70, '2× INCOME', '#ff5e7e');
      }
    },
    {
      id: 'shield_kit',
      title: 'Shield Retrofit',
      desc: 'Free Shielding',
      apply(game) {
        game.modules.shield = (game.modules.shield || 0) + 1;
        Mods().applyEffects(game);
        game.emitFloat(game.reactor.x, game.reactor.y - 70, '+1 SHIELD', '#4ade80');
      }
    },
    {
      id: 'free_box',
      title: 'Insurance',
      desc: 'Free Black Box',
      apply(game) {
        game.modules.box = (game.modules.box || 0) + 1;
        Mods().applyEffects(game);
        game.emitFloat(game.reactor.x, game.reactor.y - 70, '+1 BACKUP', '#cccccc');
      }
    }
  ];

  function triggerInvestor(game) {
    /* Pick 3 distinct random cards. */
    const pool = INVESTOR_CARDS.slice();
    const chosen = [];
    for (let i = 0; i < 3 && pool.length > 0; i++) {
      const idx = (Math.random() * pool.length) | 0;
      chosen.push(pool.splice(idx, 1)[0]);
    }
    game.events.investor = {
      cards: chosen,
      rects: [],
      t: 0,
      autoPickAt: 6.0   /* auto-pick first card after 6s if user dawdles */
    };
    game.sfx.play('cash', { freq: 660 });
    game.emitFloat(W * 0.5, 80, 'INVESTOR VISIT', '#ffd86b');
  }

  function pickInvestorCard(game, idx) {
    const inv = game.events.investor;
    if (!inv) return;
    const card = inv.cards[idx];
    if (card) card.apply(game);
    game.events.investor = null;
    game.sfx.play('buy', { freq: 600 });
  }

  function updateInvestor(game, dt) {
    const inv = game.events.investor;
    if (!inv) return;
    inv.t += dt;
    if (inv.t >= inv.autoPickAt) {
      /* Auto-pick the first SAFE card so a player who didn't see the modal
         isn't silently punished by Risky Loan. */
      let idx = inv.cards.findIndex(c => !c.danger);
      if (idx < 0) idx = 0;
      pickInvestorCard(game, idx);
    }
  }

  /* ---------- Aurora ---------- */

  function triggerAurora(game) {
    game.events.auroraActive = 5;
    game.sfx.play('cash', { freq: 1100 });
    game.emitFloat(W * 0.5, 80, 'AURORA — BUFFED', '#7cd9ff');
    game.flash('#7cd9ff', 0.10);
  }

  /* ---------- Reactor Surge ---------- */

  function triggerSurge(game) {
    game.heat = Math.min(game.maxHeat + 20, game.heat + 50);
    game.events.surgeActive = 4;
    game.sfx.play('critical');
    game.emitFloat(W * 0.5, 80, 'REACTOR SURGE!', '#ff5e7e');
    game.flash('#ff3a3a', 0.18);
    game.shake(8, 0.3);
    if (game._logHeat) game._logHeat('surge', 'Reactor surge', 50);
  }

  /* ---------- Lunar Quake ---------- */

  function triggerQuake(game) {
    game.shake(18, 0.9);
    game.flash('#a78bfa', 0.10);
    game.sfx.play('meteor', { freq: 60 });
    game.emitFloat(W * 0.5, 80, 'LUNAR QUAKE', '#a78bfa');

    /* Pick a random owned module and damage it (unless shield blocks). */
    const ownedIds = Mods().CATALOG.map(m => m.id)
      .filter(id => (game.modules[id] || 0) > 0 && id !== 'box');
    if (ownedIds.length === 0) return;
    if (Math.random() < game.shielding) {
      game.emitFloat(W * 0.5, 110, 'SHIELDS HELD', '#4ade80');
      return;
    }
    const id = ownedIds[(Math.random() * ownedIds.length) | 0];
    game.modules[id] = (game.modules[id] || 0) - 1;
    Mods().applyEffects(game);
    const p = game.modulePositions[id] || { x: W * 0.5, y: H * 0.6 };
    game.emitFloat(p.x, p.y - 20, 'CRACKED', '#ff8a8a');
    /* dust puffs from the floor */
    for (let i = 0; i < 30; i++) {
      const x = Math.random() * W;
      game.particles.emit({
        x, y: H * 0.92,
        vx: (Math.random() - 0.5) * 60, vy: -40 - Math.random() * 60,
        life: 1.0, size: 2, color: '#a78bfa', gravity: 80
      });
    }
  }

  /* ---------- Comet shower (scripted boss event) ---------- */

  function startCometShower(game, totalMeteors, durationS) {
    game.events.scriptedEvent = {
      kind: 'comet_shower',
      remaining: totalMeteors,
      cadence: durationS / totalMeteors,
      t: 0,
      announce: 1.0
    };
    game.sfx.play('meteor');
    game.flash('#ffae44', 0.25);
    game.emitFloat(W * 0.5, 80, 'COMET SHOWER!', '#ff5e7e');
  }

  function updateScripted(game, dt) {
    const s = game.events.scriptedEvent;
    if (!s) return;
    s.t += dt;
    if (s.kind === 'comet_shower') {
      if (s.announce > 0) { s.announce -= dt; }
      while (s.t >= s.cadence && s.remaining > 0) {
        s.t -= s.cadence;
        s.remaining -= 1;
        spawnMeteor(game, {
          fromX: -30 + Math.random() * (W + 60),
          fromY: -40 - Math.random() * 60,
          speed: 360 + Math.random() * 60
        });
      }
      if (s.remaining <= 0 && game.events.meteors.length === 0) {
        game.events.scriptedEvent = null;
      }
    }
  }

  /* ---------- Main per-frame update ---------- */

  function update(game, dt) {
    const e = game.events;
    if (!e) return;
    const day = game.day || 1;

    /* In-flight meteors. */
    for (let i = e.meteors.length - 1; i >= 0; i--) {
      const m = e.meteors[i];
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.life -= dt;
      if (Math.random() < 0.7) {
        game.particles.emit({
          x: m.x, y: m.y,
          vx: -m.vx * 0.04, vy: -m.vy * 0.04,
          life: 0.3, size: 3, color: '#ffae44', drag: 2
        });
      }
      /* Laser interception attempt every frame the meteor still has > 0.6s. */
      if (m.life > 0.6 && tryLaserVaporize(game, m)) {
        e.meteors.splice(i, 1);
        continue;
      }
      const dx = m.x - m.target.x, dy = m.y - m.target.y;
      if (dx*dx + dy*dy < 28*28 || m.life <= 0) {
        impactMeteor(game, m);
        e.meteors.splice(i, 1);
      }
    }

    /* Laser beam fade */
    if (e.laserBeams) {
      for (let i = e.laserBeams.length - 1; i >= 0; i--) {
        e.laserBeams[i].life -= dt;
        if (e.laserBeams[i].life <= 0) e.laserBeams.splice(i, 1);
      }
    }

    /* Cracks fade */
    for (let i = e.cracks.length - 1; i >= 0; i--) {
      e.cracks[i].life -= dt;
      if (e.cracks[i].life <= 0) e.cracks.splice(i, 1);
    }

    /* Flare. */
    if (e.flareActive > 0) {
      e.flareActive -= dt;
      game.targetThrottle = Math.min(1, game.targetThrottle + 0.18 * dt);
    }
    /* Leak active timer (decays). */
    if (e.leakActive > 0) e.leakActive -= dt;
    /* Aurora active. */
    if (e.auroraActive > 0) e.auroraActive -= dt;
    /* Surge active. */
    if (e.surgeActive > 0) e.surgeActive -= dt;
    /* Investor overlay timer. */
    updateInvestor(game, dt);
    /* Scripted (comet shower) */
    updateScripted(game, dt);

    /* Investor overlay disables natural event spawns to avoid overwhelming the
       player while they pick a card. */
    if (e.investor || e.scriptedEvent) return;

    /* Meteor cadence */
    e.meteorTimer -= dt;
    if (e.meteorTimer <= 0) {
      const c = cadence(day, 14, 18, 0.10);
      const burst = day >= 7 && Math.random() < 0.35 ? 2 : 1;
      for (let i = 0; i < burst; i++) {
        setTimeout(() => spawnMeteor(game), i * 220);
      }
      game.sfx.play('meteor');
      e.meteorTimer = pickInterval(c);
    }
    /* Flare */
    e.flareTimer -= dt;
    if (e.flareTimer <= 0) {
      triggerFlare(game);
      e.flareTimer = pickInterval(cadence(day, 18, 30, 0.08));
    }
    /* Leak — only after time>15 to give breathing room. */
    e.leakTimer -= dt;
    if (e.leakTimer <= 0 && e.leakActive <= 0 && game.time > 15) {
      triggerLeak(game);
      e.leakTimer = pickInterval(cadence(day, 18, 32, 0.06));
    }
    /* Investor (day ≥ 2) */
    if (day >= 2) {
      e.investorTimer -= dt;
      if (e.investorTimer <= 0) {
        triggerInvestor(game);
        e.investorTimer = 25 + Math.random() * 18;
      }
    }
    /* Surge (day ≥ 3) */
    if (day >= 3) {
      e.surgeTimer -= dt;
      if (e.surgeTimer <= 0) {
        triggerSurge(game);
        e.surgeTimer = 30 + Math.random() * 22;
      }
    }
    /* Quake (day ≥ 4) */
    if (day >= 4) {
      e.quakeTimer -= dt;
      if (e.quakeTimer <= 0) {
        triggerQuake(game);
        e.quakeTimer = 35 + Math.random() * 22;
      }
    }
    /* Aurora (day ≥ 6) */
    if (day >= 6) {
      e.auroraTimer -= dt;
      if (e.auroraTimer <= 0) {
        triggerAurora(game);
        e.auroraTimer = 28 + Math.random() * 20;
      }
    }
  }

  /* ---------- Drawing the in-flight projectiles + investor overlay ---------- */

  function drawMeteors(game, ctx) {
    const e = game.events;
    if (!e) return;
    for (const m of e.meteors) {
      ctx.save();
      ctx.shadowColor = '#ffae44'; ctx.shadowBlur = 14;
      ctx.fillStyle = '#ffae44';
      ctx.beginPath(); ctx.arc(m.x, m.y, 6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = '#ffae44'; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(m.x - m.vx * 0.05, m.y - m.vy * 0.05);
      ctx.stroke();
      const tx = m.target.x, ty = m.target.y;
      const ttl = clamp(m.life / 1.0, 0, 1);
      ctx.strokeStyle = `rgba(255,80,80,${(1-ttl) * 0.6 + 0.3})`;
      ctx.lineWidth = 2;
      const sz = 18 + Math.sin(game.time * 16) * 3;
      ctx.beginPath();
      ctx.arc(tx, ty, sz, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(tx - sz, ty); ctx.lineTo(tx + sz, ty); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(tx, ty - sz); ctx.lineTo(tx, ty + sz); ctx.stroke();
    }
    if (e.laserBeams) {
      for (const b of e.laserBeams) {
        const a = clamp(b.life / 0.18, 0, 1);
        ctx.save();
        ctx.shadowColor = '#ff6ad5'; ctx.shadowBlur = 12;
        ctx.strokeStyle = `rgba(255,106,213,${a})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  function drawCracks(game, ctx) {
    const e = game.events;
    if (!e) return;
    for (const cr of e.cracks) {
      const a = clamp(cr.life / 8, 0, 1);
      ctx.strokeStyle = `rgba(255,90,90,${a * 0.8})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cr.x, cr.y);
      let cx = cr.x, cy = cr.y;
      for (let k = 0; k < 4; k++) {
        const ax = cr.ang + (Math.random() - 0.5) * 0.7;
        cx += Math.cos(ax) * cr.len / 4;
        cy += Math.sin(ax) * cr.len / 4;
        ctx.lineTo(cx, cy);
      }
      ctx.stroke();
    }
  }

  /* Draw the investor "pick 1 of 3 cards" overlay. Returns the rects so the
     game-level click handler can detect picks. */
  function drawInvestor(ctx, game) {
    const inv = game.events.investor;
    if (!inv) return null;
    /* Backdrop */
    ctx.fillStyle = 'rgba(5,8,16,0.78)';
    ctx.fillRect(0, 0, W, H);

    /* Title */
    ctx.fillStyle = '#ffd86b';
    ctx.font = 'bold 28px ui-monospace, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('INVESTOR VISIT', W/2, 130);
    ctx.font = 'bold 14px ui-monospace, monospace';
    ctx.fillStyle = '#cfe9ff';
    ctx.fillText('Choose one offer  ·  Auto-picks first in '
      + Math.max(0, (inv.autoPickAt - inv.t)).toFixed(1) + 's', W/2, 162);

    /* Cards */
    const cardW = 220, cardH = 240, gap = 30;
    const totalW = cardW * 3 + gap * 2;
    const startX = (W - totalW) / 2;
    const y = 200;
    inv.rects = [];
    for (let i = 0; i < inv.cards.length; i++) {
      const c = inv.cards[i];
      const x = startX + i * (cardW + gap);
      const r = { x, y, w: cardW, h: cardH };
      inv.rects.push(r);
      ctx.fillStyle = c.danger ? '#1a0a10' : '#0f1726';
      ctx.fillRect(x, y, cardW, cardH);
      const accent = c.danger ? '#ff3a3a' : ['#ffd86b', '#7cd9ff', '#a78bfa'][i % 3];
      ctx.strokeStyle = accent; ctx.lineWidth = c.danger ? 3 : 2;
      ctx.strokeRect(x + 1, y + 1, cardW - 2, cardH - 2);
      if (c.danger) {
        ctx.fillStyle = '#ff3a3a';
        ctx.fillRect(x, y + cardH - 22, cardW, 22);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('DANGER  ·  ADDS HEAT', x + cardW/2, y + cardH - 11);
      }
      /* number badge */
      ctx.fillStyle = accent;
      ctx.font = 'bold 16px ui-monospace, monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('#' + (i + 1), x + 12, y + 10);
      /* title */
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 18px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(c.title, x + cardW/2, y + 60);
      /* desc — wrap on words */
      ctx.fillStyle = '#cfe9ff';
      ctx.font = '13px ui-monospace, monospace';
      wrapText(ctx, c.desc, x + cardW/2, y + 120, cardW - 32, 18);
      /* hint */
      ctx.fillStyle = '#8892a6';
      ctx.font = '11px ui-monospace, monospace';
      const hintY = c.danger ? y + cardH - 38 : y + cardH - 22;
      ctx.fillText('Click or press ' + (i + 1), x + cardW/2, hintY);
    }
    return inv.rects;
  }

  function wrapText(ctx, text, cx, cy, maxW, lineH) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    const startY = cy - ((lines.length - 1) * lineH) / 2;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], cx, startY + i * lineH);
    }
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  /* Click handling for the investor overlay. Call from game.update on click. */
  function handleInvestorClick(game, mx, my) {
    const inv = game.events.investor;
    if (!inv) return false;
    for (let i = 0; i < inv.rects.length; i++) {
      const r = inv.rects[i];
      if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
        pickInvestorCard(game, i);
        return true;
      }
    }
    /* clicking outside doesn't pick — overlay is modal */
    return true;
  }

  function handleInvestorKey(game, key) {
    const inv = game.events.investor;
    if (!inv) return false;
    if (key === '1' || key === '2' || key === '3') {
      pickInvestorCard(game, parseInt(key, 10) - 1);
      return true;
    }
    return false;
  }

  NDP.Reactor.Events = {
    createRuntime, update,
    drawMeteors, drawCracks, drawInvestor,
    handleInvestorClick, handleInvestorKey,
    spawnMeteor, startCometShower,
    triggerInvestor, triggerSurge, triggerAurora, triggerQuake,
    triggerFlare, triggerLeak,
    INVESTOR_CARDS
  };
})();
