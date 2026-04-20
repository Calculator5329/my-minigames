// games/sand/lib/ui-palette.js
// Canvas-drawn left rail palette (220x564 at 0,36).
// Sections: PRIMITIVES (filtered by level.availableGates) + UNLOCKED custom components.
// Pointerdown on a tile starts a palette drag via game.inputWorkspace.startPaletteDrag.
(function () {
  if (typeof window === 'undefined') return;
  window.NDP = window.NDP || {};
  window.NDP.Sand = window.NDP.Sand || {};
  window.NDP.Sand.UI = window.NDP.Sand.UI || {};

  const X = 0, Y = 36, W = 220, H = 564;
  const TILE_H = 32;
  const COLORS = {
    bgTop:   '#0a0f1a',
    bgBot:   '#070a1c',
    border:  '#27315a',
    text:    '#e8ecf8',
    dim:     '#7c87a6',
    accent:  '#ffd86b',
    accent2: '#7ae0ff',
    tileBg:  '#121a33',
    tileHi:  '#1d2a52',
    locked:  '#3a4060'
  };

  const PRIMITIVES = [
    'NOT', 'AND', 'OR', 'NAND', 'NOR', 'XOR', 'XNOR',
    'INPUT', 'OUTPUT', 'CLOCK', 'CONST0', 'CONST1'
  ];

  function hitRect(mx, my, r) {
    return mx >= r.x && mx < r.x + r.w && my >= r.y && my < r.y + r.h;
  }

  function drawBg(ctx) {
    const g = ctx.createLinearGradient(X, Y, X, Y + H);
    g.addColorStop(0, COLORS.bgTop);
    g.addColorStop(1, COLORS.bgBot);
    ctx.fillStyle = g;
    ctx.fillRect(X, Y, W, H);
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(X + W - 0.5, Y);
    ctx.lineTo(X + W - 0.5, Y + H);
    ctx.stroke();
  }

  function drawHeader(ctx, label, y) {
    ctx.fillStyle = COLORS.dim;
    ctx.font = 'bold 10px ui-sans-serif, system-ui';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(label, X + 10, y + 8);
  }

  function drawDivider(ctx, y) {
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(X + 8, y + 0.5);
    ctx.lineTo(X + W - 8, y + 0.5);
    ctx.stroke();
  }

  function drawIcon(ctx, type, cx, cy) {
    ctx.save();
    ctx.strokeStyle = COLORS.accent;
    ctx.fillStyle = COLORS.accent;
    ctx.lineWidth = 1.3;
    // Tiny stylized glyph; most get a rounded rect with initials.
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.rect(cx - 9, cy - 8, 18, 16);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawTile(ctx, r, label, hover, locked, isCustom) {
    ctx.fillStyle = hover ? COLORS.tileHi : COLORS.tileBg;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = locked ? COLORS.locked : (hover ? COLORS.accent : COLORS.border);
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);

    drawIcon(ctx, label, r.x + 18, r.y + r.h / 2);

    ctx.fillStyle = locked ? COLORS.locked : (isCustom ? COLORS.accent2 : COLORS.text);
    ctx.font = 'bold 12px ui-sans-serif, system-ui';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(label, r.x + 34, r.y + r.h / 2);
  }

  function allowedPrimitives(game) {
    const lvl = game && game.level;
    const allow = lvl && Array.isArray(lvl.availableGates) ? new Set(lvl.availableGates) : null;
    if (!allow) return PRIMITIVES.slice();
    return PRIMITIVES.filter(p => allow.has(p));
  }

  function unlockedCustom(game) {
    const prog = game && game.progress;
    const lvl = game && game.level;
    const allow = lvl && Array.isArray(lvl.availableGates) ? new Set(lvl.availableGates) : null;
    const customs = (game && game.customComponents) ? game.customComponents : [];
    const out = [];
    for (const c of customs) {
      if (!c || !c.id) continue;
      const unlocked = prog && typeof prog.isUnlocked === 'function' ? prog.isUnlocked(c.id) : true;
      const gated = allow ? allow.has(c.id) : true;
      out.push({ id: c.id, label: c.name || c.id, locked: !unlocked || !gated });
    }
    return out;
  }

  const Palette = {
    hits: [],
    hoverId: null,
    scrollY: 0,
    draw(ctx, game) {
      this.hits = [];
      drawBg(ctx);

      let y = Y + 8;
      drawHeader(ctx, 'PRIMITIVES', y);
      y += 18;

      const prims = allowedPrimitives(game);
      for (const type of prims) {
        const rect = { x: X + 8, y, w: W - 16, h: TILE_H - 4 };
        const id = 'prim:' + type;
        const hover = this.hoverId === id;
        drawTile(ctx, rect, type, hover, false, false);
        this.hits.push({ rect, kind: 'palette-drag', payload: { type, custom: false }, id });
        y += TILE_H;
      }

      y += 6;
      drawDivider(ctx, y);
      y += 10;
      drawHeader(ctx, 'UNLOCKED', y);
      y += 18;

      const customs = unlockedCustom(game);
      if (!customs.length) {
        ctx.fillStyle = COLORS.dim;
        ctx.font = '11px ui-sans-serif, system-ui';
        ctx.textBaseline = 'middle';
        ctx.fillText('(none yet)', X + 12, y + 10);
      } else {
        for (const c of customs) {
          const rect = { x: X + 8, y, w: W - 16, h: TILE_H - 4 };
          const id = 'custom:' + c.id;
          const hover = this.hoverId === id;
          drawTile(ctx, rect, c.label, hover, c.locked, true);
          if (!c.locked) {
            this.hits.push({ rect, kind: 'palette-drag', payload: { type: c.id, custom: true }, id });
          }
          y += TILE_H;
        }
      }
    },
    handleHover(mx, my) {
      if (mx < X || mx >= X + W || my < Y || my >= Y + H) { this.hoverId = null; return false; }
      for (let i = this.hits.length - 1; i >= 0; i--) {
        if (hitRect(mx, my, this.hits[i].rect)) { this.hoverId = this.hits[i].id; return true; }
      }
      this.hoverId = null;
      return false;
    },
    handleClick(mx, my, game) {
      if (mx < X || mx >= X + W || my < Y || my >= Y + H) return null;
      for (let i = this.hits.length - 1; i >= 0; i--) {
        const h = this.hits[i];
        if (hitRect(mx, my, h.rect)) {
          if (h.kind === 'palette-drag') {
            const iw = game && game.inputWorkspace;
            if (iw && typeof iw.startPaletteDrag === 'function') {
              iw.startPaletteDrag(h.payload.type, mx, my);
            }
            return { kind: 'paletteDragStart', payload: h.payload };
          }
          return { kind: h.kind, payload: h.payload };
        }
      }
      return null;
    }
  };

  window.NDP.Sand.UI.Palette = Palette;
})();
