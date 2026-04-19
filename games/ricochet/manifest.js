NDP.registerManifest({
  id: 'ricochet',
  title: 'Ricochet',
  blurb: 'One bullet. Bank the shot.',
  description: 'Aim and fire a single bullet that ricochets off walls and obstacles. Clear every enemy before the bullet runs out of bounces. Miss? Retry as many times as you like — 30 levels to conquer.',
  controls: 'Aim: MOUSE  ·  Fire: CLICK',
  theme: { bg: '#05060c', accent: '#4fc8ff', accent2: '#ff4fd8' },

  previewDraw(ctx, t, w, h) {
    ctx.fillStyle = '#05060c'; ctx.fillRect(0, 0, w, h);
    // grid
    ctx.strokeStyle = '#0a1830';
    ctx.lineWidth = 1;
    for (let i = 0; i < w; i += 20) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke(); }
    for (let j = 0; j < h; j += 20) { ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(w, j); ctx.stroke(); }
    // bullet trail bouncing
    const pts = [];
    let x = 40, y = h - 30, vx = 120, vy = -120;
    for (let i = 0; i < 30; i++) {
      pts.push([x, y]);
      x += vx * 0.08; y += vy * 0.08;
      if (x < 10 || x > w - 10) vx = -vx;
      if (y < 10 || y > h - 10) vy = -vy;
    }
    ctx.strokeStyle = '#4fc8ff';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#4fc8ff'; ctx.shadowBlur = 10;
    ctx.beginPath();
    pts.forEach((p, i) => { if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); });
    ctx.stroke();
    ctx.shadowBlur = 0;
    // enemies
    const enemyPositions = [[w*0.3, h*0.4], [w*0.6, h*0.3], [w*0.75, h*0.65], [w*0.4, h*0.7]];
    enemyPositions.forEach((p, i) => {
      const alive = (Math.floor(t + i) % 4) < 2;
      ctx.fillStyle = alive ? '#ff4fd8' : '#33204a';
      ctx.beginPath(); ctx.arc(p[0], p[1], 10, 0, Math.PI * 2); ctx.fill();
    });
    // head
    const i = (t * 5) % pts.length | 0;
    ctx.fillStyle = '#fff';
    ctx.shadowColor = '#fff'; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(pts[i][0], pts[i][1], 5, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  }
});
