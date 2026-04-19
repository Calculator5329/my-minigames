NDP.registerManifest({
  id: 'minefield',
  title: 'Minefield',
  blurb: 'Classic sweep, three difficulties.',
  description: 'Reveal every safe cell without hitting a mine. Numbers show adjacent mine counts. Shift-click (or right-click) to flag. First click is always safe. Clear the board under par for a bonus.',
  controls: 'LEFT CLICK — reveal  ·  SHIFT + CLICK / RIGHT CLICK — flag  ·  1 2 3 — pick difficulty',
  theme: { bg: '#111826', accent: '#7ae0ff', accent2: '#ffcc33' },

  previewDraw(ctx, t, w, h) {
    ctx.fillStyle = '#111826'; ctx.fillRect(0, 0, w, h);
    const cell = 16;
    const cols = Math.floor(w / cell);
    const rows = Math.floor(h / cell);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const revealed = ((r * 7 + c * 3) % 11) < 6;
      const x = c * cell, y = r * cell;
      ctx.fillStyle = revealed ? '#1e2a3d' : '#34425c';
      ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
      if (revealed) {
        const n = ((r * 3 + c) % 5);
        if (n > 0 && n < 4) {
          const cols_ = ['#7ae0ff', '#6cff9a', '#ffd86b', '#ff8b4a'];
          ctx.fillStyle = cols_[n - 1];
          ctx.font = 'bold 10px ui-monospace, monospace';
          ctx.textAlign='center'; ctx.textBaseline='middle';
          ctx.fillText(n, x + cell / 2, y + cell / 2);
        }
      }
    }
    // Flag + mine icons
    const pulse = 0.6 + 0.4 * Math.sin(t * 4);
    ctx.fillStyle = `rgba(255,80,80,${pulse})`;
    ctx.beginPath(); ctx.arc(w * 0.8, h * 0.6, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffcc33';
    ctx.beginPath();
    ctx.moveTo(w * 0.25, h * 0.3 + 10);
    ctx.lineTo(w * 0.25, h * 0.3 - 10);
    ctx.lineTo(w * 0.25 + 12, h * 0.3 - 5);
    ctx.closePath(); ctx.fill();
  }
});
