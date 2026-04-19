NDP.registerManifest({
  id: 'skybound',
  title: 'Skybound',
  blurb: 'How high can you climb?',
  description: 'Rocket-jump off clouds to climb forever. Fuel refills on pickups. Pastel sky, ribbon trails, increasing hazards the higher you go.',
  controls: 'Move: A/D or \u2190/\u2192  ·  Boost: SPACE (costs fuel)',
  theme: { bg: '#7fbddd', accent: '#ff9966', accent2: '#fff3a6' },

  previewDraw(ctx, t, w, h) {
    // Sky gradient
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#ffcfa0'); g.addColorStop(0.6, '#ff9966'); g.addColorStop(1, '#7fbddd');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // Clouds
    for (let i = 0; i < 7; i++) {
      const cy = ((t * 40 + i * 80) % (h + 80)) - 40;
      const cx = (i * 73 + 40) % w;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.ellipse(cx, cy, 22, 10, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 14, cy - 4, 14, 8, 0, 0, Math.PI * 2);
      ctx.ellipse(cx - 14, cy - 2, 14, 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Rocket character
    const py = h / 2 + Math.sin(t * 6) * 6;
    const px = w / 2;
    // Flame
    ctx.fillStyle = '#ff6a1f';
    ctx.beginPath();
    ctx.moveTo(px - 8, py + 14);
    ctx.lineTo(px + 8, py + 14);
    ctx.lineTo(px, py + 30 + Math.sin(t * 20) * 4);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffd86b';
    ctx.beginPath();
    ctx.moveTo(px - 4, py + 14);
    ctx.lineTo(px + 4, py + 14);
    ctx.lineTo(px, py + 24);
    ctx.closePath(); ctx.fill();
    // Body (rocket)
    ctx.fillStyle = '#fff';
    ctx.fillRect(px - 8, py - 10, 16, 24);
    ctx.fillStyle = '#ff4d6d';
    ctx.beginPath();
    ctx.moveTo(px - 8, py - 10);
    ctx.lineTo(px, py - 22);
    ctx.lineTo(px + 8, py - 10);
    ctx.closePath(); ctx.fill();
    // window
    ctx.fillStyle = '#4fc8ff';
    ctx.beginPath(); ctx.arc(px, py - 2, 4, 0, Math.PI * 2); ctx.fill();
  }
});
