// games/sand/lib/ui-iopanel.js
// Canvas-drawn right rail I/O panel (240x564 at 720,36).
// Sections: INPUTS (click-toggle chips), OUTPUTS (live state), TEST progress strip,
// and action buttons [Step][Run][Test][Save].
(function () {
  if (typeof window === 'undefined') return;
  window.NDP = window.NDP || {};
  window.NDP.Sand = window.NDP.Sand || {};
  window.NDP.Sand.UI = window.NDP.Sand.UI || {};

  const X = 720, Y = 36, W = 240, H = 564;
  const COLORS = {
    bgTop:   '#0a0f1a',
    bgBot:   '#070a1c',
    border:  '#27315a',
    text:    '#e8ecf8',
    dim:     '#7c87a6',
    accent:  '#ffd86b',
    accent2: '#7ae0ff',
    on:      '#4ade80',
    off:     '#2a3870',
    fail:    '#ff5566',
    tileBg:  '#121a33',
    tileHi:  '#1d2a52'
  };

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
    ctx.moveTo(X + 0.5, Y);
    ctx.lineTo(X + 0.5, Y + H);
    ctx.stroke();
  }

  function drawHeader(ctx, label, y) {
    ctx.fillStyle = COLORS.dim;
    ctx.font = 'bold 10px ui-sans-serif, system-ui';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(label, X + 10, y);
  }

  function drawChip(ctx, rect, value, hover) {
    const on = value === 1;
    ctx.fillStyle = hover ? COLORS.tileHi : COLORS.tileBg;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = hover ? COLORS.accent : COLORS.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
    // Value pill
    const pw = 28, ph = 16;
    const px = rect.x + rect.w - pw - 6;
    const py = rect.y + (rect.h - ph) / 2;
    ctx.fillStyle = on ? COLORS.on : COLORS.off;
    ctx.fillRect(px, py, pw, ph);
    ctx.fillStyle = on ? '#0a1a0a' : COLORS.dim;
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(on ? '1' : '0', px + pw / 2, py + ph / 2);
    ctx.textAlign = 'left';
  }

  function readInputValue(game, label) {
    const circuit = game && game.circuit;
    if (!circuit || !Array.isArray(circuit.nodes)) return 0;
    for (const n of circuit.nodes) {
      if (n.type === 'INPUT' && n.props && n.props.label === label) {
        return n.props.value === 1 ? 1 : 0;
      }
    }
    return 0;
  }

  function readOutputValue(game, label) {
    const circuit = game && game.circuit;
    const graph = game && game.graph;
    if (!circuit || !graph || !graph.nodes) return 0;
    for (const n of circuit.nodes) {
      if (n.type === 'OUTPUT' && n.props && n.props.label === label) {
        const gn = graph.nodes.get ? graph.nodes.get(n.id) : graph.nodes[n.id];
        if (gn && gn.out) return gn.out.value === 1 ? 1 : 0;
        return 0;
      }
    }
    return 0;
  }

  function drawIORow(ctx, rect, label, value, hover) {
    ctx.fillStyle = COLORS.text;
    ctx.font = 'bold 12px ui-sans-serif, system-ui';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(label, rect.x + 10, rect.y + rect.h / 2);
    drawChip(ctx, rect, value, hover);
  }

  function drawTestStrip(ctx, rect, game) {
    const test = game && game.testState;
    const lvl = game && game.level;
    const total = (lvl && Array.isArray(lvl.truthTable)) ? lvl.truthTable.length : 0;
    const passed = (test && (test.rowsPassed | 0)) || 0;
    const failIdx = (test && typeof test.failIndex === 'number') ? test.failIndex : -1;

    if (!total) {
      ctx.fillStyle = COLORS.dim;
      ctx.font = '11px ui-sans-serif, system-ui';
      ctx.textBaseline = 'middle';
      ctx.fillText('(no test)', rect.x + 10, rect.y + rect.h / 2);
      return;
    }
    const dotR = 5;
    const gap = 4;
    const available = rect.w - 20;
    const step = Math.min(dotR * 2 + gap, Math.max(dotR * 2 + 1, Math.floor(available / total)));
    let x = rect.x + 10 + dotR;
    const y = rect.y + rect.h / 2;
    for (let i = 0; i < total; i++) {
      let color = COLORS.off;
      if (i === failIdx) color = COLORS.fail;
      else if (i < passed) color = COLORS.on;
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(x, y, dotR, 0, Math.PI * 2);
      ctx.fill();
      x += step;
      if (x > rect.x + rect.w - dotR) break;
    }
  }

  function drawButton(ctx, rect, label, hover, accent) {
    ctx.fillStyle = hover ? COLORS.tileHi : COLORS.tileBg;
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

  const IOPanel = {
    hits: [],
    hoverId: null,
    draw(ctx, game) {
      this.hits = [];
      drawBg(ctx);

      const lvl = game && game.level;
      let y = Y + 12;

      // INPUTS
      drawHeader(ctx, 'INPUTS', y);
      y += 14;
      const inputs = (lvl && lvl.io && Array.isArray(lvl.io.inputs)) ? lvl.io.inputs : [];
      for (const p of inputs) {
        const rect = { x: X + 10, y, w: W - 20, h: 28 };
        const id = 'in:' + p.label;
        const hover = this.hoverId === id;
        drawIORow(ctx, rect, p.label, readInputValue(game, p.label), hover);
        this.hits.push({ rect, kind: 'toggleInput', payload: { label: p.label }, id });
        y += 32;
      }
      y += 8;

      // OUTPUTS
      drawHeader(ctx, 'OUTPUTS', y);
      y += 14;
      const outputs = (lvl && lvl.io && Array.isArray(lvl.io.outputs)) ? lvl.io.outputs : [];
      for (const p of outputs) {
        const rect = { x: X + 10, y, w: W - 20, h: 28 };
        drawIORow(ctx, rect, p.label, readOutputValue(game, p.label), false);
        // Outputs are not clickable.
        y += 32;
      }
      y += 8;

      // TEST strip
      drawHeader(ctx, 'TEST', y);
      y += 14;
      const stripRect = { x: X + 10, y, w: W - 20, h: 20 };
      drawTestStrip(ctx, stripRect, game);
      y += 28;

      // Buttons — 2x2 grid at bottom
      const btnDefs = [
        { kind: 'step', label: 'Step' },
        { kind: 'run',  label: 'Run'  },
        { kind: 'test', label: 'Test' },
        { kind: 'save', label: 'Save' }
      ];
      const bw = (W - 20 - 8) / 2;
      const bh = 28;
      const baseY = Y + H - (bh * 2 + 6 + 8);
      for (let i = 0; i < btnDefs.length; i++) {
        const col = i % 2, row = Math.floor(i / 2);
        const rect = { x: X + 10 + col * (bw + 8), y: baseY + row * (bh + 6), w: bw, h: bh };
        const id = 'btn:' + btnDefs[i].kind;
        const hover = this.hoverId === id;
        drawButton(ctx, rect, btnDefs[i].label, hover, btnDefs[i].kind === 'run' || btnDefs[i].kind === 'test');
        this.hits.push({ rect, kind: btnDefs[i].kind, payload: null, id });
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
        if (hitRect(mx, my, h.rect)) return { kind: h.kind, payload: h.payload };
      }
      return null;
    }
  };

  window.NDP.Sand.UI.IOPanel = IOPanel;
})();
