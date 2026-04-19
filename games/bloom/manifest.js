NDP.registerManifest({
  id: 'bloom',
  title: 'Bloom',
  blurb: 'Absorb. Avoid. Dominate.',
  description: 'You are a swarm of particles following your cursor. Drift into smaller swarms to absorb them. Brush against bigger swarms and they will devour you. Grow to consume everything.',
  controls: 'Move: MOUSE  ·  Dash: CLICK (short burst, costs mass)',
  theme: { bg: '#0b0314', accent: '#ff4fd8', accent2: '#4fc8ff' },

  previewDraw(ctx, t, w, h) {
    ctx.fillStyle = '#0b0314'; ctx.fillRect(0, 0, w, h);
    // Player swarm
    const px = w/2 + Math.sin(t) * 20;
    const py = h/2 + Math.cos(t*0.9) * 14;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 40; i++) {
      const a = i / 40 * Math.PI * 2 + t;
      const r = 20 + Math.sin(t*2 + i) * 8;
      const x = px + Math.cos(a) * r;
      const y = py + Math.sin(a) * r;
      ctx.fillStyle = '#ff4fd888';
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    }
    // Enemy swarms
    [[w*0.2, h*0.3, '#4fc8ff'], [w*0.8, h*0.7, '#fbbf24']].forEach(([ex, ey, c], i) => {
      for (let j = 0; j < 25; j++) {
        const a = j / 25 * Math.PI * 2 + t * 0.5 + i;
        const r = 14 + Math.sin(t + j) * 4;
        ctx.fillStyle = c + '99';
        ctx.beginPath(); ctx.arc(ex + Math.cos(a)*r, ey + Math.sin(a)*r, 2.5, 0, Math.PI * 2); ctx.fill();
      }
    });
    ctx.restore();
  }
});
