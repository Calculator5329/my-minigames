NDP.registerManifest({
  id: 'paperweight',
  title: 'Paperweight',
  blurb: 'Desk, wind, papers. Don\'t let them go.',
  description: 'A window keeps blowing open. Papers drift off your desk. Click to drop a paperweight on any paper before it flies away. You have a limited supply — empty mugs, rocks, a single apple. Score: papers saved per minute.',
  controls: 'CLICK — place paperweight where the cursor is  ·  Pause: ESC',
  theme: { bg: '#2b2218', accent: '#d9b87a', accent2: '#7aa3d9' },

  previewDraw(ctx, t, w, h) {
    // Desk
    ctx.fillStyle = '#5a3f23'; ctx.fillRect(0, 0, w, h);
    // Grain
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    for (let y = 0; y < h; y += 6) ctx.fillRect(0, y, w, 1);
    // A window beam from top-left
    ctx.fillStyle = 'rgba(255,240,200,0.12)';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w * 0.5, 0); ctx.lineTo(w * 0.2, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();
    // Floating papers
    for (let i = 0; i < 4; i++) {
      const px = (i * 70 + t * 30) % (w + 60) - 30;
      const py = h * 0.3 + Math.sin(t * 2 + i) * 20;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(Math.sin(t + i) * 0.2);
      ctx.fillStyle = '#f4e6c4'; ctx.fillRect(-20, -14, 40, 28);
      ctx.strokeStyle = '#b89a6a'; ctx.lineWidth = 1;
      for (let ly = -8; ly < 10; ly += 4) { ctx.beginPath(); ctx.moveTo(-16, ly); ctx.lineTo(16, ly); ctx.stroke(); }
      ctx.restore();
    }
    // Paperweights (a rock, a mug)
    ctx.fillStyle = '#5a5a60';
    ctx.beginPath(); ctx.arc(w * 0.75, h * 0.62, 16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8c48a';
    ctx.fillRect(w * 0.35, h * 0.72, 22, 20);
    ctx.fillStyle = '#5a3f23';
    ctx.fillRect(w * 0.35 + 4, h * 0.72 + 4, 14, 12);
  }
});
