NDP.registerManifest({
  id: 'franchise',
  title: 'Franchise Frenzy',
  blurb: 'Five cities. One empire.',
  description: 'A 5-city campaign — each city is a 60-second shift with a bigger net-worth target. Cash and businesses persist between cities. Random events, manager auto-buyers, and a boss takeover fight on the final city. Spend Stardollars between runs on permanent upgrades.',
  controls: 'Click flagship to earn  ·  Click cards to buy / upgrade  ·  Click envelopes for bonuses',
  theme: { bg: '#122b1f', accent: '#ffd86b', accent2: '#4ade80' },

  previewDraw(ctx, t, w, h) {
    // Green gradient background
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1d4030'); g.addColorStop(1, '#0c1d14');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

    // Grid of shop icons
    const rows = 3, cols = 4;
    const bw = w / (cols + 1), bh = h / (rows + 1);
    const types = [
      { c: '#ffd86b', letter: '$' },
      { c: '#4ade80', letter: '%' },
      { c: '#60a5fa', letter: '#' },
      { c: '#f472b6', letter: '*' }
    ];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = (c + 0.75) * bw;
        const y = (r + 0.75) * bh;
        const type = types[(r + c) % types.length];
        const pulse = 0.5 + 0.5 * Math.sin(t * 3 + r + c);
        ctx.fillStyle = type.c;
        ctx.globalAlpha = 0.4 + 0.6 * pulse;
        ctx.fillRect(x, y, bw * 0.6, bh * 0.6);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#081408';
        ctx.font = 'bold 18px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(type.letter, x + bw * 0.3, y + bh * 0.3);
      }
    }

    // Floating coins
    for (let i = 0; i < 8; i++) {
      const ox = ((t * 40 + i * 53) % (w + 40)) - 20;
      const oy = h - ((t * 60 + i * 71) % (h + 40));
      ctx.fillStyle = '#ffd86b';
      ctx.beginPath(); ctx.arc(ox, oy, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ab8300';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('$', ox, oy);
    }
  }
});
