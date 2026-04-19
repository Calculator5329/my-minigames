NDP.registerManifest({
  id: 'cascade',
  title: 'Cascade',
  blurb: '2048, but merges chain.',
  description: 'Slide tiles. Merge pairs. The twist: simultaneous merges in one swipe multiply the points (COMBO), and consecutive merging swipes build a CHAIN multiplier. Miss a swipe, the chain drops. Reach 2048 to win the round — then keep going for the high score.',
  controls: 'Arrows / WASD to slide  ·  R to restart  ·  Pause: ESC',
  theme: { bg: '#1b1510', accent: '#f5cf66', accent2: '#ff8b4a' },

  previewDraw(ctx, t, w, h) {
    ctx.fillStyle = '#1b1510'; ctx.fillRect(0, 0, w, h);
    const pad = 6;
    const gw = Math.min(w, h) - 30;
    const ox = (w - gw) / 2;
    const oy = (h - gw) / 2 + 4;
    const cell = (gw - pad * 5) / 4;
    ctx.fillStyle = '#3a2f23';
    ctx.fillRect(ox, oy, gw, gw);
    const vals = [
      [2, 4, 8, 16],
      [0, 2, 4, 8],
      [0, 0, 2, 4],
      [0, 0, 0, 2]
    ];
    const colors = {
      0:'#2b221a', 2:'#efe3d2', 4:'#ebd6a9', 8:'#f5b06a',
      16:'#ff8b4a', 32:'#f5706a', 64:'#f54a6a',
      128:'#f5cf66', 256:'#f5cf66', 512:'#f5cf66', 1024:'#f5cf66', 2048:'#6cff9a'
    };
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      const v = vals[r][c];
      const x = ox + pad + c * (cell + pad);
      const y = oy + pad + r * (cell + pad);
      ctx.fillStyle = colors[v] || '#efe3d2';
      ctx.fillRect(x, y, cell, cell);
      if (v) {
        ctx.fillStyle = v <= 4 ? '#3a2f23' : '#1b1510';
        ctx.font = 'bold 18px ui-monospace, monospace';
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(v, x + cell / 2, y + cell / 2);
      }
    }
    // Chain flare
    const pulse = 0.5 + 0.5 * Math.sin(t * 5);
    ctx.fillStyle = `rgba(245,207,102,${0.4 + pulse * 0.4})`;
    ctx.font = 'bold 14px ui-monospace, monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('CHAIN x3', 10, 10);
    ctx.fillStyle = `rgba(255,139,74,${0.4 + pulse * 0.4})`;
    ctx.textAlign = 'right';
    ctx.fillText('COMBO x4', w - 10, 10);
  }
});
