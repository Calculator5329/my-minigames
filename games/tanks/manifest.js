NDP.registerManifest({
  id: 'tanks',
  title: 'Tanks',
  blurb: 'Artillery duel across the hills.',
  description: 'Turn-based artillery. Click anywhere and pull back like a slingshot — release to fire in the opposite direction with power based on pull distance. Arc around terrain, account for wind. Best your opponent across 5 hilly maps.',
  controls: 'Aim: CLICK anywhere & PULL BACK (slingshot)  ·  Release to fire  ·  Q/E or 1–5 weapons',
  theme: { bg: '#1a2030', accent: '#ffbb55', accent2: '#66e0ff' },

  previewDraw(ctx, t, w, h) {
    // sky
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#2a3452'); g.addColorStop(1, '#4c6688');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // terrain
    ctx.fillStyle = '#3a5a3e';
    ctx.beginPath();
    ctx.moveTo(0, h);
    const segs = 20;
    for (let i = 0; i <= segs; i++) {
      const x = (i / segs) * w;
      const y = h * 0.7 + Math.sin(i * 0.4) * 18 + Math.cos(i * 0.2) * 10;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
    // tanks
    function tank(x, y, color) {
      ctx.fillStyle = color;
      ctx.fillRect(x-12, y-6, 24, 8);
      ctx.fillRect(x-6, y-12, 12, 6);
      ctx.strokeStyle = color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x, y-10); ctx.lineTo(x + 16, y - 16); ctx.stroke();
      // treads
      ctx.fillStyle = '#222';
      ctx.fillRect(x-12, y+2, 24, 3);
    }
    // find y at x
    function ty(x) {
      const i = x / w * segs;
      return h * 0.7 + Math.sin(i * 0.4) * 18 + Math.cos(i * 0.2) * 10;
    }
    tank(w*0.2, ty(w*0.2), '#ffbb55');
    tank(w*0.8, ty(w*0.8), '#66e0ff');
    // projectile arc
    const phase = (t * 0.4) % 1;
    const sx = w*0.2 + 16, sy = ty(w*0.2) - 16;
    const ex = w*0.8 - 16, ey = ty(w*0.8) - 16;
    const mx = (sx+ex)/2, my = Math.min(sy, ey) - 80;
    const px = (1-phase)*(1-phase)*sx + 2*(1-phase)*phase*mx + phase*phase*ex;
    const py = (1-phase)*(1-phase)*sy + 2*(1-phase)*phase*my + phase*phase*ey;
    ctx.fillStyle = '#ffd86b';
    ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI*2); ctx.fill();
  }
});
