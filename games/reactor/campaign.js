/* Reactor — campaign mode (10-day run + endless) and daily objectives.
   Owns the day state machine and the recap screen between days.
   Exposes NDP.Reactor.Campaign. */
(function () {
  const NDP = (window.NDP = window.NDP || {});
  NDP.Reactor = NDP.Reactor || {};
  const Research = () => NDP.Reactor.Research;
  const Modules  = () => NDP.Reactor.Modules;

  const W = 960, H = 600;
  const TOTAL_DAYS = 10;
  const DAY_LENGTH = 60;

  /* ---------- Daily objectives pool ---------- */

  /* Each objective takes the day number and returns an instance:
       { id, label, target, eval(stats) -> boolean }
     Stats are tracked on game.dayStats by the main loop. */
  const OBJ_POOL = [
    {
      id: 'earn',
      build(day) {
        const target = 1500 * day;
        return {
          id: 'earn', target,
          label: 'Earn $' + fmt(target) + ' this day',
          eval: stats => (stats.earnedThisDay | 0) >= target
        };
      }
    },
    {
      id: 'survive_meteors',
      build(day) {
        const target = Math.min(8, 2 + Math.floor(day / 1.5));
        return {
          id: 'survive_meteors', target,
          label: 'Survive ' + target + ' meteor strikes',
          eval: stats => (stats.meteorsHit | 0) >= target
        };
      }
    },
    {
      id: 'no_vent',
      build() {
        return {
          id: 'no_vent', target: 1,
          label: 'Don\'t use Emergency Vent',
          eval: stats => (stats.vents | 0) === 0
        };
      }
    },
    {
      id: 'buy_two',
      build() {
        return {
          id: 'buy_two', target: 2,
          label: 'Buy 2+ modules',
          eval: stats => (stats.modulesBought | 0) >= 2
        };
      }
    },
    {
      id: 'no_overheat',
      build() {
        return {
          id: 'no_overheat', target: 1,
          label: 'Never exceed 90% heat',
          eval: stats => !stats.overheated
        };
      }
    },
    {
      id: 'cash_banked',
      build(day) {
        const target = 800 * day;
        return {
          id: 'cash_banked', target,
          label: 'End day with $' + fmt(target) + ' banked',
          eval: stats => (stats.endCash | 0) >= target
        };
      }
    },
    {
      id: 'four_modules',
      build() {
        return {
          id: 'four_modules', target: 4,
          label: 'Own 4+ distinct module types',
          eval: stats => (stats.distinctModules | 0) >= 4
        };
      }
    },
    {
      id: 'high_throttle',
      build() {
        return {
          id: 'high_throttle', target: 30,
          label: 'Hold throttle ≥ 30% for 30s total',
          eval: stats => (stats.timeAbove30 | 0) >= 30
        };
      }
    }
  ];

  /* Pick 3 random distinct objectives for the day. */
  function rollObjectives(day) {
    const pool = OBJ_POOL.slice();
    const out = [];
    for (let i = 0; i < 3 && pool.length > 0; i++) {
      const idx = (Math.random() * pool.length) | 0;
      out.push(pool.splice(idx, 1)[0].build(day));
    }
    return out;
  }

  /* ---------- Day-state initialization ---------- */

  /* Reset the per-day stats trackers and roll fresh objectives. */
  function freshDayStats(day) {
    return {
      day,
      earnedThisDay: 0,
      meteorsHit: 0,
      vents: 0,
      modulesBought: 0,
      overheated: false,
      timeAbove30: 0,
      endCash: 0,
      distinctModules: 0,
      objectives: rollObjectives(day),
      objectivesEvaluated: false,
      objectivesPassed: 0
    };
  }

  /* Evaluate objectives at end of day. Mutates dayStats and returns RP earned. */
  function evaluateObjectives(game) {
    const ds = game.dayStats;
    if (!ds || ds.objectivesEvaluated) return 0;
    /* Final fields */
    ds.endCash = game.cash | 0;
    ds.distinctModules = Object.values(game.modules).filter(c => (c | 0) > 0).length;
    let passed = 0;
    for (const o of ds.objectives) {
      o.passed = !!o.eval(ds);
      if (o.passed) passed++;
    }
    ds.objectivesPassed = passed;
    ds.objectivesEvaluated = true;
    return passed; /* +1 RP per passed obj */
  }

  /* ---------- Recap UI ---------- */

  /* The recap is drawn by game.render when state === 'won' (campaign continues)
     or 'over' (campaign ended). The recap captures clicks for: continue, retry,
     research buys. game.js delegates to handleRecapClick(). */

  function drawRecap(ctx, game) {
    const recap = game.recap;
    if (!recap) return;
    /* Backdrop */
    ctx.fillStyle = 'rgba(5,8,16,0.85)';
    ctx.fillRect(0, 0, W, H);

    /* Title bar */
    ctx.fillStyle = recap.kind === 'campaign_complete'
      ? '#4ade80'
      : (recap.kind === 'meltdown' ? '#ff5e7e' : '#ffd86b');
    ctx.font = 'bold 26px ui-monospace, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let title;
    if (recap.kind === 'meltdown') title = 'MELTDOWN  ·  Day ' + recap.day;
    else if (recap.kind === 'campaign_complete') title = 'CAMPAIGN COMPLETE!';
    else if (recap.kind === 'endless_over') title = 'ENDLESS RUN ENDED  ·  Day ' + recap.day;
    else title = 'DAY ' + recap.day + ' COMPLETE';
    ctx.fillText(title, W/2, 38);

    /* Cause-of-death banner (only on meltdowns). Sits in the left column
       above STATS so it doesn't collide with the research panel on the
       right. The cause text wraps onto multiple lines as needed. */
    let causeBottom = 0;
    if (recap.kind === 'meltdown' && recap.cause) {
      const cx = 40, cy = 60, cw = 350;
      ctx.font = '12px ui-monospace, monospace';
      const lines = wrapLines(ctx, recap.cause, cw - 20);
      const ch = 22 + lines.length * 16 + 8;
      ctx.fillStyle = 'rgba(60,8,16,0.85)';
      ctx.fillRect(cx, cy, cw, ch);
      ctx.strokeStyle = '#ff5e7e'; ctx.lineWidth = 2;
      ctx.strokeRect(cx + 1, cy + 1, cw - 2, ch - 2);
      ctx.fillStyle = '#ff8a8a';
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('CAUSE OF DEATH', cx + 10, cy + 6);
      ctx.fillStyle = '#fff';
      ctx.font = '12px ui-monospace, monospace';
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], cx + 10, cy + 24 + i * 16);
      }
      causeBottom = cy + ch;
    }

    /* Stats column (left) */
    const sx = 60, sy = causeBottom > 0 ? causeBottom + 10 : 80;
    ctx.fillStyle = '#cfe9ff';
    ctx.font = 'bold 14px ui-monospace, monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('STATS', sx, sy);
    ctx.font = '13px ui-monospace, monospace';
    const stats = [
      ['Earned this day',  '$' + fmt(recap.earnedThisDay)],
      ['Meteors weathered', String(recap.meteorsHit | 0)],
      ['Modules bought',    String(recap.modulesBought | 0)],
      ['Vents used',        String(recap.vents | 0)],
      ['Cash on hand',      '$' + fmt(recap.endCash | 0)],
      ['Total earned',      '$' + fmt(recap.totalEarned | 0)]
    ];
    for (let i = 0; i < stats.length; i++) {
      ctx.fillStyle = '#8892a6';
      ctx.fillText(stats[i][0], sx, sy + 24 + i * 22);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'right';
      ctx.fillText(stats[i][1], sx + 280, sy + 24 + i * 22);
      ctx.textAlign = 'left';
    }

    /* Objectives column (left, below stats) */
    const oy = sy + 24 + stats.length * 22 + 16;
    ctx.fillStyle = '#cfe9ff';
    ctx.font = 'bold 14px ui-monospace, monospace';
    ctx.fillText('OBJECTIVES  ·  +' + recap.objRP + ' RP', sx, oy);
    ctx.font = '12px ui-monospace, monospace';
    for (let i = 0; i < recap.objectives.length; i++) {
      const o = recap.objectives[i];
      ctx.fillStyle = o.passed ? '#4ade80' : '#8892a6';
      ctx.fillText((o.passed ? '[x] ' : '[ ] ') + o.label, sx, oy + 24 + i * 18);
    }

    /* Recent heat events — only useful on meltdowns. Shows the last few
       heat additions with timestamps so the player can replay what
       happened. Compact list, max 5 entries. */
    let belowObj = oy + 24 + recap.objectives.length * 18 + 16;
    if (recap.kind === 'meltdown' && recap.heatLog && recap.heatLog.length > 0) {
      ctx.fillStyle = '#cfe9ff';
      ctx.font = 'bold 14px ui-monospace, monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('LAST HEAT EVENTS', sx, belowObj);
      ctx.font = '12px ui-monospace, monospace';
      const entries = recap.heatLog.slice(-5);
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const sign = e.amount > 0 ? '+' : (e.amount < 0 ? '' : '·');
        const amtStr = e.amount === 0 ? '' : (sign + e.amount + ' heat');
        ctx.fillStyle = e.amount > 0 ? '#ff8a8a' : (e.amount < 0 ? '#7cd9ff' : '#8892a6');
        ctx.fillText('t=' + (e.t | 0) + 's   ' + e.label + (amtStr ? '   ' + amtStr : '') +
          '   →' + e.after + '%', sx, belowObj + 22 + i * 16);
      }
      belowObj += 22 + entries.length * 16 + 10;
    }

    /* RP earned line */
    const ry = belowObj + 4;
    ctx.fillStyle = '#ffd86b';
    ctx.font = 'bold 16px ui-monospace, monospace';
    const surviveBonus = (recap.kind === 'meltdown') ? 0 : 1;
    let rpLine = 'RP earned: +' + recap.totalRP +
      '  (' + surviveBonus + ' day + ' + recap.objRP + ' obj)';
    if (recap.kind === 'campaign_complete') rpLine += '   +1 ENDLESS UNLOCK';
    ctx.fillText(rpLine, sx, ry);

    /* Research panel (right side, width-bounded) */
    const panelW = 540;
    const px = W - panelW - 20;
    const py = 60;
    const panelH = NDP.Reactor.Research.panelHeight();
    /* Panel background */
    ctx.fillStyle = 'rgba(15,23,38,0.92)';
    ctx.fillRect(px - 10, py - 10, panelW + 20, panelH + 20);
    ctx.strokeStyle = '#3a4660';
    ctx.lineWidth = 2;
    ctx.strokeRect(px - 9, py - 9, panelW + 18, panelH + 18);
    recap.researchRects = NDP.Reactor.Research.drawPanel(ctx, px, py, panelW);

    /* Buttons */
    const btnY = H - 60;
    recap.buttonRects = [];
    if (recap.kind === 'meltdown' || recap.kind === 'endless_over') {
      /* Restart from Day 1 */
      const r = drawButton(ctx, W/2 - 110, btnY, 220, 44,
        'NEW CAMPAIGN', '#ffd86b');
      recap.buttonRects.push({ id: 'restart', ...r });
    } else if (recap.kind === 'campaign_complete') {
      const ra = drawButton(ctx, W/2 - 230, btnY, 220, 44,
        'NEW CAMPAIGN', '#ffd86b');
      const rb = drawButton(ctx, W/2 + 10,  btnY, 220, 44,
        'ENDLESS MODE',  '#7cd9ff');
      recap.buttonRects.push({ id: 'restart', ...ra });
      recap.buttonRects.push({ id: 'endless', ...rb });
    } else {
      /* Day complete — continue. */
      const r = drawButton(ctx, W/2 - 110, btnY, 220, 44,
        'NEXT DAY  →', '#4ade80');
      recap.buttonRects.push({ id: 'next', ...r });
    }
  }

  function drawButton(ctx, x, y, w, h, label, color) {
    ctx.fillStyle = '#0e1726';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    ctx.fillStyle = color;
    ctx.font = 'bold 16px ui-monospace, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w/2, y + h/2);
    return { x, y, w, h };
  }

  /* ---------- Click handling on recap ---------- */

  /* Returns one of: null (no hit), 'next', 'restart', 'endless', 'research'. */
  function handleRecapClick(game, mx, my) {
    const recap = game.recap;
    if (!recap) return null;
    /* Buttons */
    for (const b of recap.buttonRects) {
      if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
        return b.id;
      }
    }
    /* Research */
    for (const r of (recap.researchRects || [])) {
      if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
        const res = NDP.Reactor.Research.buy(r.node.id);
        if (res.ok) game.sfx.play('buy', { freq: 700 });
        else game.sfx.play('deny');
        return 'research';
      }
    }
    return null;
  }

  /* ---------- Build recap object ---------- */

  function buildRecap(game, kind) {
    const ds = game.dayStats || freshDayStats(game.day);
    const objRP = evaluateObjectives(game);
    let totalRP = 0;
    if (kind === 'day_complete' || kind === 'campaign_complete' || kind === 'endless_over') {
      totalRP = 1 + objRP;
    } else if (kind === 'meltdown') {
      /* On meltdown the player still earns objective RP but no day-survival
         bonus, so they're rewarded for partial progress. */
      totalRP = objRP;
    }
    NDP.Reactor.Research.award(totalRP);
    NDP.Reactor.Research.recordDay(game.day);
    if (kind === 'campaign_complete') NDP.Reactor.Research.recordCampaignBeaten();

    return {
      kind,
      day: game.day,
      earnedThisDay: ds.earnedThisDay | 0,
      meteorsHit:    ds.meteorsHit | 0,
      modulesBought: ds.modulesBought | 0,
      vents:         ds.vents | 0,
      endCash:       game.cash | 0,
      totalEarned:   game.totalEarned | 0,
      objectives:    ds.objectives,
      objRP,
      totalRP,
      /* Diagnostics — meltdowns surface cause + recent heat events so the
         player can see exactly what killed them. */
      cause:        game.deathCause || null,
      heatLog:      (game.heatLog || []).slice(-6),
      peakHeatPct:  game.peakHeatPct || 0,
      researchRects: [],
      buttonRects: []
    };
  }

  /* ---------- Helpers ---------- */

  /* Word-wrap helper used by the cause-of-death banner. Returns an array of
     lines that each fit inside maxW given the current ctx font. */
  function wrapLines(ctx, text, maxW) {
    const words = String(text || '').split(' ');
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
    return lines;
  }

  function fmt(n) {
    if (n < 1000) return Math.floor(n).toString();
    const units = ['', 'K', 'M', 'B', 'T'];
    let i = 0;
    while (n >= 1000 && i < units.length - 1) { n /= 1000; i++; }
    return n.toFixed(n < 10 ? 2 : n < 100 ? 1 : 0) + units[i];
  }

  /* Per-day difficulty knobs. Returned by getDayConfig(day). */
  function getDayConfig(day) {
    return {
      day,
      isBoss: (day === 5) || (day === 10),
      meltdownHardCap: Math.max(105, 132 - (day - 1) * 1.5),
      maxHeatCeiling: Math.max(80, 100 - Math.max(0, day - 2) * 2)
    };
  }

  NDP.Reactor.Campaign = {
    TOTAL_DAYS, DAY_LENGTH,
    freshDayStats, evaluateObjectives,
    buildRecap, drawRecap, handleRecapClick,
    getDayConfig
  };
})();
