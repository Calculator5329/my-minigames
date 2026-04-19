NDP.registerManifest({
  id: 'simon',
  title: 'Simon',
  blurb: 'Watch. Repeat. Don\'t blink.',
  description: 'Four coloured pads flash in sequence. Tap them back in the same order. Every round adds one. Miss a step and the tower falls.',
  controls: 'CLICK pads  ·  keys 1 2 3 4 also work  ·  Pause: ESC',
  theme: { bg: '#0a0a12', accent: '#6cff9a', accent2: '#ff4fd8' },

  previewDraw(ctx, t, w, h) {
    ctx.fillStyle = '#0a0a12'; ctx.fillRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    const R = Math.min(w, h) * 0.4;
    const pads = [
      { a0: -Math.PI,         a1: -Math.PI / 2, col: '#ef4444', lit: '#fca5a5' },
      { a0: -Math.PI / 2,     a1: 0,            col: '#22c55e', lit: '#86efac' },
      { a0: 0,                a1:  Math.PI / 2, col: '#eab308', lit: '#fde68a' },
      { a0:  Math.PI / 2,     a1:  Math.PI,     col: '#3b82f6', lit: '#93c5fd' }
    ];
    const lit = Math.floor(t * 1.5) % 4;
    pads.forEach((p, i) => {
      ctx.fillStyle = i === lit ? p.lit : p.col;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, p.a0, p.a1);
      ctx.closePath();
      ctx.fill();
    });
    ctx.fillStyle = '#0a0a12';
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.28, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6cff9a';
    ctx.font = 'bold 20px ui-monospace, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('SIMON', cx, cy);
  }
});
