NDP.registerManifest({
  id: 'deflect',
  title: 'Deflect',
  blurb: 'Parry everything thrown at you.',
  description: 'Stand in the center. Projectiles fly in from every angle. Click the moment one reaches you to swing your blade. Mis-time and take a hit. Waves accelerate.',
  controls: 'Aim: MOUSE  ·  Parry: CLICK (timed)',
  theme: { bg: '#07090f', accent: '#ff5566', accent2: '#ffbb33' },

  previewDraw(ctx, t, w, h) {
    ctx.fillStyle = '#07090f'; ctx.fillRect(0, 0, w, h);
    // radial rings
    ctx.strokeStyle = '#1a1d2a'; ctx.lineWidth = 1;
    for (let r = 30; r < 160; r += 18) {
      ctx.beginPath(); ctx.arc(w/2, h/2, r, 0, Math.PI * 2); ctx.stroke();
    }
    // projectiles
    const projs = [0, 1, 2, 3, 4];
    projs.forEach(i => {
      const a = i * (Math.PI * 2 / 5) + t * 0.6;
      const phase = ((t * 0.8) + i * 0.2) % 1;
      const dist = 120 * (1 - phase);
      const px = w/2 + Math.cos(a) * dist;
      const py = h/2 + Math.sin(a) * dist;
      ctx.fillStyle = '#ffbb33';
      ctx.shadowColor = '#ffbb33'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    });
    // Blade (swinging)
    const sw = Math.sin(t * 3) * 0.8;
    const bx = w/2 + Math.cos(sw) * 28;
    const by = h/2 + Math.sin(sw) * 28;
    ctx.strokeStyle = '#ff5566';
    ctx.lineWidth = 4;
    ctx.shadowColor = '#ff5566'; ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(w/2, h/2);
    ctx.lineTo(bx + Math.cos(sw)*34, by + Math.sin(sw)*34);
    ctx.stroke();
    ctx.shadowBlur = 0;
    // Player circle
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(w/2, h/2, 10, 0, Math.PI * 2); ctx.fill();
  }
});
