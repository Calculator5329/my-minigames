// games/sand/lib/glyphs.js
// Dual-entry module: per-primitive canvas glyph drawers used by render.js.
// Each glyph fn receives (ctx, cx, cy, size, color) and draws an etched icon
// centered on (cx, cy), fitting roughly within `size` pixels.

(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = mod.Glyphs;
    module.exports.Glyphs = mod.Glyphs;
  }
  if (typeof window !== 'undefined') {
    window.NDP = window.NDP || {};
    window.NDP.Sand = window.NDP.Sand || {};
    window.NDP.Sand.Glyphs = mod.Glyphs;
  }
})(typeof self !== 'undefined' ? self : this, function () {

  function stroke(ctx, color, w) {
    ctx.strokeStyle = color;
    ctx.lineWidth = w || 1.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  function power(ctx, cx, cy, s, color) {
    ctx.save();
    stroke(ctx, color, 1.4);
    const h = s * 0.5;
    ctx.beginPath();
    // vertical bar
    ctx.moveTo(cx, cy + h);
    ctx.lineTo(cx, cy - h);
    // top arrow
    ctx.moveTo(cx - s * 0.2, cy - h + s * 0.2);
    ctx.lineTo(cx, cy - h);
    ctx.lineTo(cx + s * 0.2, cy - h + s * 0.2);
    // small plus on top
    ctx.moveTo(cx - s * 0.15, cy - h * 0.55);
    ctx.lineTo(cx + s * 0.15, cy - h * 0.55);
    ctx.stroke();
    ctx.restore();
  }

  function ground(ctx, cx, cy, s, color) {
    ctx.save();
    stroke(ctx, color, 1.4);
    const h = s * 0.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy - h);
    ctx.lineTo(cx, cy - s * 0.05);
    // three descending bars
    ctx.moveTo(cx - s * 0.35, cy - s * 0.05);
    ctx.lineTo(cx + s * 0.35, cy - s * 0.05);
    ctx.moveTo(cx - s * 0.22, cy + s * 0.12);
    ctx.lineTo(cx + s * 0.22, cy + s * 0.12);
    ctx.moveTo(cx - s * 0.1,  cy + s * 0.28);
    ctx.lineTo(cx + s * 0.1,  cy + s * 0.28);
    ctx.stroke();
    ctx.restore();
  }

  function switchGlyph(ctx, cx, cy, s, color) {
    ctx.save();
    stroke(ctx, color, 1.3);
    // NMOS-ish: channel bar, gate stub on left, source/drain taps.
    const hx = s * 0.38;
    const hy = s * 0.35;
    ctx.beginPath();
    // gate stub
    ctx.moveTo(cx - hx - s * 0.18, cy);
    ctx.lineTo(cx - hx, cy);
    // gate plate (perpendicular)
    ctx.moveTo(cx - hx, cy - hy);
    ctx.lineTo(cx - hx, cy + hy);
    // channel line
    ctx.moveTo(cx - hx + s * 0.06, cy - hy);
    ctx.lineTo(cx - hx + s * 0.06, cy + hy);
    // drain (top)
    ctx.moveTo(cx - hx + s * 0.06, cy - hy);
    ctx.lineTo(cx + hx, cy - hy);
    ctx.lineTo(cx + hx, cy - hy * 0.2);
    // source (bottom)
    ctx.moveTo(cx - hx + s * 0.06, cy + hy);
    ctx.lineTo(cx + hx, cy + hy);
    ctx.lineTo(cx + hx, cy + hy * 0.2);
    ctx.stroke();
    ctx.restore();
  }

  function pullup(ctx, cx, cy, s, color) {
    ctx.save();
    stroke(ctx, color, 1.3);
    const h = s * 0.5;
    ctx.beginPath();
    // vertical line top
    ctx.moveTo(cx, cy - h);
    ctx.lineTo(cx, cy - h * 0.65);
    // up arrow at top
    ctx.moveTo(cx - s * 0.12, cy - h * 0.85);
    ctx.lineTo(cx, cy - h);
    ctx.lineTo(cx + s * 0.12, cy - h * 0.85);
    // zigzag resistor
    const x = cx;
    let y = cy - h * 0.65;
    const dy = s * 0.12;
    const dx = s * 0.18;
    ctx.lineTo(x + dx, y + dy * 0.5);
    ctx.lineTo(x - dx, y + dy * 1.5);
    ctx.lineTo(x + dx, y + dy * 2.5);
    ctx.lineTo(x - dx, y + dy * 3.5);
    ctx.lineTo(x,       y + dy * 4.2);
    // bottom line
    ctx.lineTo(cx, cy + h);
    ctx.stroke();
    ctx.restore();
  }

  function padTerminal(ctx, cx, cy, s, color, dirRight, label) {
    ctx.save();
    stroke(ctx, color, 1.3);
    const w = s * 0.55;
    const h = s * 0.4;
    ctx.beginPath();
    if (dirRight) {
      ctx.moveTo(cx - w, cy - h);
      ctx.lineTo(cx + w, cy);
      ctx.lineTo(cx - w, cy + h);
      ctx.closePath();
    } else {
      ctx.moveTo(cx + w, cy - h);
      ctx.lineTo(cx - w, cy);
      ctx.lineTo(cx + w, cy + h);
      ctx.closePath();
    }
    ctx.stroke();
    if (label) {
      ctx.fillStyle = color;
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, cx, cy);
    }
    ctx.restore();
  }

  function padIn(ctx, cx, cy, s, color, label) {
    padTerminal(ctx, cx, cy, s, color, true, label);
  }

  function padOut(ctx, cx, cy, s, color, label) {
    padTerminal(ctx, cx, cy, s, color, false, label);
  }

  function clock(ctx, cx, cy, s, color) {
    ctx.save();
    stroke(ctx, color, 1.3);
    const h = s * 0.3;
    const w = s * 0.5;
    ctx.beginPath();
    ctx.moveTo(cx - w,       cy + h);
    ctx.lineTo(cx - w,       cy - h);
    ctx.lineTo(cx - w * 0.3, cy - h);
    ctx.lineTo(cx - w * 0.3, cy + h);
    ctx.lineTo(cx + w * 0.3, cy + h);
    ctx.lineTo(cx + w * 0.3, cy - h);
    ctx.lineTo(cx + w,       cy - h);
    ctx.lineTo(cx + w,       cy + h);
    ctx.stroke();
    ctx.restore();
  }

  const Glyphs = {
    power,
    ground,
    switch: switchGlyph,
    pullup,
    pad_in: padIn,
    pad_out: padOut,
    clock,
    draw(ctx, type, cx, cy, size, color, label) {
      const fn = Glyphs[type];
      if (!fn) return false;
      if (type === 'pad_in' || type === 'pad_out') fn(ctx, cx, cy, size, color, label);
      else fn(ctx, cx, cy, size, color);
      return true;
    },
  };

  return { Glyphs };
});
