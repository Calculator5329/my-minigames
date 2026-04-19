NDP.registerManifest({
  id: 'stargazer',
  title: 'Stargazer',
  blurb: 'WASD + aim the void.',
  description: 'Twin-stick shooter among the stars. WASD to fly, mouse to aim, click to fire. Waves of hostiles close in. Grab starlight pickups for overcharge. Survive as long as you can.',
  controls: 'Move: WASD  ·  Aim: MOUSE  ·  Fire: HOLD LEFT CLICK',
  theme: { bg: '#040214', accent: '#7ae0ff', accent2: '#ff4fd8' },

  previewDraw(ctx, t, w, h) {
    // deep space
    ctx.fillStyle = '#040214'; ctx.fillRect(0, 0, w, h);
    // stars
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 40; i++) {
      const sx = (i * 31 + t * 30) % w;
      const sy = (i * 17 + t * 7) % h;
      const sz = (i % 3) + 1;
      ctx.globalAlpha = 0.4 + (i % 3) * 0.2;
      ctx.fillRect(sx, sy, sz, sz);
    }
    ctx.globalAlpha = 1;
    // ship
    const px = w/2 + Math.cos(t*0.8) * 20;
    const py = h/2 + Math.sin(t*0.9) * 12;
    ctx.save(); ctx.translate(px, py); ctx.rotate(t*0.6);
    ctx.fillStyle = '#7ae0ff';
    ctx.shadowColor = '#7ae0ff'; ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(12, 0); ctx.lineTo(-8, -7); ctx.lineTo(-4, 0); ctx.lineTo(-8, 7); ctx.closePath();
    ctx.fill();
    ctx.restore();
    // enemies
    for (let i = 0; i < 3; i++) {
      const a = t * 0.5 + i * Math.PI * 2 / 3;
      const ex = w/2 + Math.cos(a) * 70;
      const ey = h/2 + Math.sin(a) * 50;
      ctx.fillStyle = '#ff4fd8';
      ctx.shadowColor = '#ff4fd8'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(ex, ey, 6, 0, Math.PI*2); ctx.fill();
      ctx.shadowBlur = 0;
    }
    // bullet
    ctx.fillStyle = '#ffd86b';
    const bx = px + Math.cos(t*5) * 60;
    const by = py + Math.sin(t*5) * 60;
    ctx.beginPath(); ctx.arc(bx, by, 3, 0, Math.PI*2); ctx.fill();
  }
});
