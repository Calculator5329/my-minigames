/* Reactor — research tree (persistent meta-progression).
   Lives across runs in NDP.Engine.Storage under games.reactor.data.research.
   Drawn as part of the day-end recap (see campaign.js).
   Exposes NDP.Reactor.Research. */
(function () {
  const NDP = (window.NDP = window.NDP || {});
  NDP.Reactor = NDP.Reactor || {};
  const Storage = () => NDP.Engine.Storage;

  const W = 960, H = 600;

  /* Catalog. id, cost, title, desc, apply(game) called on init() of each run. */
  const CATALOG = [
    { id: 'subsidies',    cost: 1, title: 'Subsidies',
      desc: 'Start every run with $200.',
      apply: g => { g.cash += 200; g.totalEarned += 0; }
    },
    { id: 'dome',         cost: 2, title: 'Reinforced Dome',
      desc: '+20 starting max heat.',
      apply: g => { g.baseMaxHeat += 20; }
    },
    { id: 'quick_vent',   cost: 1, title: 'Quick Vent',
      desc: 'Vent cooldown 3s → 2s.',
      apply: g => { g.ventCooldownDur = 2; }
    },
    { id: 'optics',       cost: 1, title: 'Better Optics',
      desc: 'Meteor crosshair appears 30% earlier.',
      apply: g => { g.opticsBoost = true; }   /* meteors get +30% life on spawn */
    },
    { id: 'helium_bonus', cost: 2, title: 'Helium Bonus',
      desc: 'Base income mult ×1.10.',
      apply: g => { g.baseIncomeMult = 1.10; }
    },
    { id: 'insulation',   cost: 2, title: 'Insulation',
      desc: 'Passive cooling +30%.',
      apply: g => { g.passiveCoolingMult = 1.30; }
    },
    { id: 'veteran',      cost: 1, title: 'Veteran Crew',
      desc: 'Start every run with 1 free Mining Rig.',
      apply: g => { g.modules.rig = (g.modules.rig || 0) + 1; }
    },
    { id: 'stockpile',    cost: 2, title: 'Stockpile',
      desc: 'Start with 80 coolant, max coolant +20.',
      apply: g => { g.baseMaxCoolant += 20; g.startCoolant = 80; }
    },
    { id: 'auto_trader',  cost: 3, title: 'Auto-Trader',
      desc: '+1%/s income mult while throttle held under 50% (cap +30%).',
      apply: g => { g.autoTraderEnabled = true; }
    },
    { id: 'galactic',     cost: 3, title: 'Galactic Investor',
      desc: 'Every $50K total earned, lump-sum +$1K.',
      apply: g => { g.galacticEnabled = true; }
    }
  ];

  /* ---- State load/save ---- */

  /* One-shot legacy reader: prior versions stored RP inside
     gameData.research.points. Lift those into the per-game wallet on first
     access and drop the field from the data blob so future writes stay clean. */
  let _migrated = false;
  function migrateLegacy() {
    if (_migrated) return;
    const S = Storage();
    if (!S) return;
    _migrated = true;
    const data = S.getGameData('reactor') || {};
    const r = data.research || {};
    if ((r.points | 0) > 0) {
      S.addGameWallet('reactor', r.points | 0);
      const cleaned = Object.assign({}, r);
      delete cleaned.points;
      S.mergeGameData('reactor', { research: cleaned });
    }
  }

  function getState() {
    migrateLegacy();
    const S = Storage();
    const data = (S && S.getGameData('reactor')) || {};
    const research = data.research || {};
    return {
      points: S ? (S.getGameWallet('reactor') | 0) : 0,
      bought: Object.assign({}, research.bought || {}),
      bestDay: research.bestDay | 0,
      campaignsBeaten: research.campaignsBeaten | 0,
      endlessUnlocked: !!research.endlessUnlocked
    };
  }

  /* Persist only the data-blob fields (bought/bestDay/...). RP lives in the
     per-game wallet and is written via add/spend helpers. */
  function saveState(state) {
    const persisted = {
      bought: state.bought || {},
      bestDay: state.bestDay | 0,
      campaignsBeaten: state.campaignsBeaten | 0,
      endlessUnlocked: !!state.endlessUnlocked
    };
    Storage().mergeGameData('reactor', { research: persisted });
  }

  function award(rp) {
    migrateLegacy();
    const amt = Math.max(0, rp | 0);
    if (amt > 0) Storage().addGameWallet('reactor', amt);
    return getState();
  }

  function isBought(id) { return !!getState().bought[id]; }

  function buy(id) {
    migrateLegacy();
    const s = getState();
    if (s.bought[id]) return { ok: false, reason: 'already' };
    const node = CATALOG.find(n => n.id === id);
    if (!node) return { ok: false, reason: 'missing' };
    if (!Storage().spendGameWallet('reactor', node.cost | 0)) {
      return { ok: false, reason: 'rp' };
    }
    s.bought[id] = 1;
    saveState(s);
    return { ok: true };
  }

  function recordDay(day) {
    const s = getState();
    if (day > s.bestDay) {
      s.bestDay = day;
      saveState(s);
    }
  }

  function recordCampaignBeaten() {
    const s = getState();
    s.campaignsBeaten += 1;
    s.endlessUnlocked = true;
    saveState(s);
  }

  /* Apply all bought nodes to a fresh game.init() pass.
     Must be called BEFORE Modules.applyEffects(game) so e.g. veteran rig flows
     through. */
  function applyAll(game) {
    const s = getState();
    for (const node of CATALOG) {
      if (s.bought[node.id]) node.apply(game);
    }
  }

  /* ---- Panel rendering ---- */

  /* Layout the catalog into a 2-col grid centered horizontally inside a
     bounding width. The recap screen calls drawPanel() with an explicit
     width so the panel never overflows. */
  function layoutPanel(ox, oy, width) {
    width = width || 540;
    const gapX = 12, gapY = 8;
    const cols = 2;
    const cardW = (width - gapX) / cols;
    const cardH = 64;
    const rows = Math.ceil(CATALOG.length / cols);
    const startX = ox;
    const startY = oy;
    const rects = [];
    for (let i = 0; i < CATALOG.length; i++) {
      const col = i % cols, row = (i / cols) | 0;
      rects.push({
        x: startX + col * (cardW + gapX),
        y: startY + row * (cardH + gapY),
        w: cardW, h: cardH,
        node: CATALOG[i]
      });
    }
    return { rects, rows, cardW, cardH, totalH: rows * cardH + (rows - 1) * gapY };
  }

  function drawPanel(ctx, ox, oy, width) {
    width = width || 540;
    const s = getState();
    const layout = layoutPanel(ox, oy + 32, width);

    /* Header */
    ctx.fillStyle = '#cfe9ff';
    ctx.font = 'bold 16px ui-monospace, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('RESEARCH  ·  ' + s.points + ' RP available', ox + width / 2, oy + 14);

    /* Cards */
    for (const r of layout.rects) {
      const node = r.node;
      const owned = !!s.bought[node.id];
      const can = !owned && s.points >= node.cost;
      const accent = owned ? '#4ade80' : (can ? '#ffd86b' : '#3a4660');
      ctx.fillStyle = owned ? '#0e2018' : (can ? '#1a2230' : '#0e1420');
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);

      /* Cost badge */
      ctx.fillStyle = accent;
      ctx.fillRect(r.x + r.w - 46, r.y, 46, 18);
      ctx.fillStyle = '#0a1020';
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(owned ? 'OWNED' : (node.cost + ' RP'), r.x + r.w - 23, r.y + 9);

      /* Title */
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(node.title, r.x + 8, r.y + 6);
      /* Desc */
      ctx.fillStyle = '#8892a6';
      ctx.font = '10px ui-monospace, monospace';
      wrapText(ctx, node.desc, r.x + 8, r.y + 24, r.w - 16, 12, 'left', 'top');
    }
    return layout.rects;
  }

  function wrapText(ctx, text, cx, cy, maxW, lineH, align, baseline) {
    ctx.textAlign = align || 'center';
    ctx.textBaseline = baseline || 'middle';
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
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], cx, cy + i * lineH);
    }
  }

  function panelHeight() {
    const cardH = 64, gapY = 8;
    const rows = Math.ceil(CATALOG.length / 2);
    return 32 + rows * cardH + (rows - 1) * gapY;
  }

  NDP.Reactor.Research = {
    CATALOG,
    getState, saveState,
    award, buy, isBought,
    recordDay, recordCampaignBeaten,
    applyAll,
    drawPanel, layoutPanel, panelHeight
  };
})();
