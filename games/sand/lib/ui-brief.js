// games/sand/lib/ui-brief.js
// Canvas-drawn dismissible brief overlay (centered 500x280 card on a dim backdrop).
// Visible when game.brief.visible is true. Topbar '?' button reopens it.
(function () {
  if (typeof window === 'undefined') return;
  window.NDP = window.NDP || {};
  window.NDP.Sand = window.NDP.Sand || {};
  window.NDP.Sand.UI = window.NDP.Sand.UI || {};

  const CANVAS_W = 960, CANVAS_H = 600;
  const CARD_W = 500, CARD_H = 280;
  const COLORS = {
    backdrop: 'rgba(5, 8, 18, 0.78)',
    bgTop:    '#0a0f1a',
    bgBot:    '#070a1c',
    border:   '#27315a',
    text:     '#e8ecf8',
    dim:      '#7c87a6',
    accent:   '#ffd86b',
    accent2:  '#7ae0ff',
    btnBg:    '#121a33',
    btnHi:    '#1d2a52'
  };

  function hitRect(mx, my, r) {
    return mx >= r.x && mx < r.x + r.w && my >= r.y && my < r.y + r.h;
  }

  function cardRect() {
    return {
      x: Math.round((CANVAS_W - CARD_W) / 2),
      y: Math.round((CANVAS_H - CARD_H) / 2),
      w: CARD_W,
      h: CARD_H
    };
  }

  function wrapText(ctx, text, maxWidth) {
    const words = String(text || '').split(/\s+/);
    const lines = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (ctx.measureText(t).width > maxWidth && cur) {
        lines.push(cur);
        cur = w;
      } else {
        cur = t;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  }

  const Brief = {
    hits: [],
    hoverId: null,
    isVisible(game) {
      return !!(game && game.brief && game.brief.visible);
    },
    draw(ctx, game) {
      this.hits = [];
      if (!this.isVisible(game)) return;

      // Backdrop
      ctx.fillStyle = COLORS.backdrop;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      // Backdrop is click-to-dismiss too
      this.hits.push({
        rect: { x: 0, y: 0, w: CANVAS_W, h: CANVAS_H },
        kind: 'dismissBackdrop',
        payload: null,
        id: 'backdrop'
      });

      const r = cardRect();
      const g = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
      g.addColorStop(0, COLORS.bgTop);
      g.addColorStop(1, COLORS.bgBot);
      ctx.fillStyle = g;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = COLORS.accent;
      ctx.lineWidth = 1;
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);

      const level = game && game.level;
      const title = level ? (level.title || level.id) : 'Brief';
      const brief = level ? (level.brief || '') : '';
      const hints = level && Array.isArray(level.hints) ? level.hints : [];

      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';

      // Eyebrow
      ctx.fillStyle = COLORS.accent2;
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.fillText('LEVEL BRIEF', r.x + 20, r.y + 18);

      // Title
      ctx.fillStyle = COLORS.accent;
      ctx.font = 'bold 22px ui-sans-serif, system-ui';
      ctx.fillText(title, r.x + 20, r.y + 36);

      // Brief paragraph
      ctx.fillStyle = COLORS.text;
      ctx.font = '13px ui-sans-serif, system-ui';
      const lines = wrapText(ctx, brief, r.w - 40);
      let by = r.y + 76;
      for (let i = 0; i < lines.length && i < 4; i++) {
        ctx.fillText(lines[i], r.x + 20, by);
        by += 18;
      }

      // Hints list
      if (hints.length) {
        by += 6;
        ctx.fillStyle = COLORS.dim;
        ctx.font = 'bold 10px ui-sans-serif, system-ui';
        ctx.fillText('HINTS', r.x + 20, by);
        by += 14;
        ctx.fillStyle = COLORS.text;
        ctx.font = '12px ui-sans-serif, system-ui';
        for (let i = 0; i < hints.length && i < 3; i++) {
          const bullet = '\u2022 ';
          const hlines = wrapText(ctx, bullet + hints[i], r.w - 40);
          for (let j = 0; j < hlines.length && j < 2; j++) {
            ctx.fillText(hlines[j], r.x + 20, by);
            by += 15;
          }
        }
      }

      // Dismiss button
      const bw = 96, bh = 28;
      const bx = r.x + r.w - bw - 16;
      const by2 = r.y + r.h - bh - 14;
      const btn = { x: bx, y: by2, w: bw, h: bh };
      const hover = this.hoverId === 'dismiss';
      ctx.fillStyle = hover ? COLORS.btnHi : COLORS.btnBg;
      ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
      ctx.strokeStyle = hover ? COLORS.accent : COLORS.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(btn.x + 0.5, btn.y + 0.5, btn.w - 1, btn.h - 1);
      ctx.fillStyle = COLORS.accent;
      ctx.font = 'bold 12px ui-sans-serif, system-ui';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText('Dismiss', btn.x + btn.w / 2, btn.y + btn.h / 2);
      ctx.textAlign = 'left';

      this.hits.push({ rect: btn, kind: 'dismiss', payload: null, id: 'dismiss' });
    },
    handleHover(mx, my, game) {
      if (!this.isVisible(game)) { this.hoverId = null; return false; }
      for (let i = this.hits.length - 1; i >= 0; i--) {
        if (hitRect(mx, my, this.hits[i].rect) && this.hits[i].id !== 'backdrop') {
          this.hoverId = this.hits[i].id; return true;
        }
      }
      this.hoverId = null;
      return true; // still capture (overlay is modal)
    },
    handleClick(mx, my, game) {
      if (!this.isVisible(game)) return null;
      // Prefer non-backdrop targets (e.g. Dismiss button) first.
      for (let i = this.hits.length - 1; i >= 0; i--) {
        const h = this.hits[i];
        if (h.id === 'backdrop') continue;
        if (hitRect(mx, my, h.rect)) return { kind: h.kind, payload: h.payload };
      }
      // Click outside card -> dismiss
      const r = cardRect();
      if (!hitRect(mx, my, r)) return { kind: 'dismiss', payload: null };
      // Click inside card on empty area: consume but do nothing
      return { kind: 'noop', payload: null };
    }
  };

  window.NDP.Sand.UI.Brief = Brief;
})();
