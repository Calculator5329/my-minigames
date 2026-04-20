// games/sand/lib/ui-topbar.js
// Canvas-drawn topbar: breadcrumb (left), tick + stars (center), action buttons (right).
// Height 36px, full canvas width (960). All geometry in canvas-local coords.
(function () {
  if (typeof window === 'undefined') return;
  window.NDP = window.NDP || {};
  window.NDP.Sand = window.NDP.Sand || {};
  window.NDP.Sand.UI = window.NDP.Sand.UI || {};

  const H = 36;
  const W = 960;
  const COLORS = {
    bgTop:   '#0a0f1a',
    bgBot:   '#070a1c',
    border:  '#27315a',
    text:    '#e8ecf8',
    dim:     '#7c87a6',
    accent:  '#ffd86b',
    accent2: '#7ae0ff',
    btnBg:   '#121a33',
    btnHi:   '#1d2a52'
  };

  const BUTTONS = [
    { kind: 'reset', label: 'Reset' },
    { kind: 'step',  label: 'Step'  },
    { kind: 'run',   label: 'Run'   },
    { kind: 'test',  label: 'Test'  },
    { kind: 'save',  label: 'Save'  },
    { kind: 'help',  label: '?'     }
  ];

  function hit(mx, my, r) {
    return mx >= r.x && mx < r.x + r.w && my >= r.y && my < r.y + r.h;
  }

  function drawBg(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, COLORS.bgTop);
    g.addColorStop(1, COLORS.bgBot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, H - 0.5);
    ctx.lineTo(W, H - 0.5);
    ctx.stroke();
  }

  function breadcrumbText(game) {
    const lvl = game && game.level;
    const track = lvl && lvl.track ? lvl.track : '…';
    const title = lvl && (lvl.title || lvl.id) ? (lvl.title || lvl.id) : '…';
    return 'sand \u25B8 ' + track + ' \u25B8 ' + title;
  }

  function drawBreadcrumb(ctx, game, hits, hoverId) {
    const rect = { x: 8, y: 0, w: Math.floor(W * 0.40) - 8, h: H };
    const hover = hoverId === 'breadcrumb';
    ctx.font = 'bold 13px ui-sans-serif, system-ui';
    ctx.textBaseline = 'middle';
    const text = breadcrumbText(game);
    // crumb coloring: "sand" in accent, rest in text/dim
    let x = rect.x;
    const y = rect.y + rect.h / 2;
    ctx.fillStyle = hover ? COLORS.accent : COLORS.accent2;
    ctx.fillText('sand', x, y);
    x += ctx.measureText('sand').width;
    ctx.fillStyle = hover ? COLORS.text : COLORS.dim;
    const tail = text.slice(4);
    ctx.fillText(tail, x, y);
    hits.push({ rect, kind: 'back', payload: null, id: 'breadcrumb' });
  }

  function drawCenter(ctx, game) {
    const cx = W / 2;
    const y = H / 2;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    const tick = (game && typeof game.tickCount === 'number') ? (game.tickCount | 0) : 0;
    const ready = !game || !game.testState || !game.testState.started;
    const label = ready ? 'READY' : ('Tick ' + tick);
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.fillStyle = ready ? COLORS.dim : COLORS.text;
    ctx.fillText(label, cx - 32, y);

    // Stars
    const stars = (game && (game.stars | 0)) || 0;
    ctx.font = 'bold 14px ui-sans-serif, system-ui';
    const starStr = '\u2605'.repeat(stars) + '\u2606'.repeat(Math.max(0, 3 - stars));
    ctx.fillStyle = stars > 0 ? COLORS.accent : COLORS.dim;
    ctx.fillText(starStr, cx + 40, y);
    ctx.textAlign = 'left';
  }

  function drawButton(ctx, rect, label, hover, accent) {
    ctx.fillStyle = hover ? COLORS.btnHi : COLORS.btnBg;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = hover ? COLORS.accent : COLORS.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
    ctx.fillStyle = accent ? COLORS.accent : COLORS.text;
    ctx.font = 'bold 12px ui-sans-serif, system-ui';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2);
    ctx.textAlign = 'left';
  }

  function drawButtons(ctx, hits, hoverId) {
    const pad = 6;
    const bh = 24;
    const by = (H - bh) / 2;
    let x = W - pad;
    for (let i = BUTTONS.length - 1; i >= 0; i--) {
      const b = BUTTONS[i];
      const bw = b.kind === 'help' ? 24 : 48;
      x -= bw;
      const rect = { x, y: by, w: bw, h: bh };
      const id = 'btn:' + b.kind;
      const hover = hoverId === id;
      drawButton(ctx, rect, b.label, hover, b.kind === 'run' || b.kind === 'test');
      hits.push({ rect, kind: b.kind, payload: null, id });
      x -= 4;
    }
  }

  const Topbar = {
    hits: [],
    hoverId: null,
    height: H,
    draw(ctx, game) {
      this.hits = [];
      drawBg(ctx);
      drawBreadcrumb(ctx, game, this.hits, this.hoverId);
      drawCenter(ctx, game);
      drawButtons(ctx, this.hits, this.hoverId);
    },
    handleHover(mx, my) {
      if (my < 0 || my >= H) { this.hoverId = null; return false; }
      for (let i = this.hits.length - 1; i >= 0; i--) {
        if (hit(mx, my, this.hits[i].rect)) { this.hoverId = this.hits[i].id; return true; }
      }
      this.hoverId = null;
      return false;
    },
    handleClick(mx, my, game) {
      if (my < 0 || my >= H) return null;
      for (let i = this.hits.length - 1; i >= 0; i--) {
        const h = this.hits[i];
        if (hit(mx, my, h.rect)) return { kind: h.kind, payload: h.payload };
      }
      return null;
    }
  };

  window.NDP.Sand.UI.Topbar = Topbar;
})();
