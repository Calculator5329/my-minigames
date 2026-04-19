NDP.registerManifest({
  id: 'gullet',
  title: 'Gullet',
  blurb: 'Eat everything on the surface.',
  description: 'You are a ravenous sandworm beneath the dirt. Erupt upward to swallow farmers, cows, birds, and anything else foolish enough to walk the surface.',
  controls: 'Move: MOUSE  ·  Erupt: CLICK / SPACE',
  theme: { bg: '#3a2616', accent: '#ffbb55', accent2: '#ff6655' },

  previewDraw(ctx, t, w, h) {
    // Sky + dirt
    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.55);
    sky.addColorStop(0, '#ffb874'); sky.addColorStop(1, '#ff7a50');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h * 0.55);
    ctx.fillStyle = '#5a3921'; ctx.fillRect(0, h * 0.55, w, h * 0.45);
    ctx.fillStyle = '#3a2616';
    for (let i = 0; i < 6; i++) ctx.fillRect(0, h * 0.55 + 6 + i * 8, w, 2);
    // Sun
    ctx.fillStyle = '#ffdd66'; ctx.beginPath();
    ctx.arc(w * 0.82, h * 0.22, 22, 0, Math.PI * 2); ctx.fill();
    // Little critter
    const cx = (t * 40) % (w + 20) - 10;
    ctx.fillStyle = '#222'; ctx.fillRect(cx, h * 0.55 - 14, 8, 14);
    ctx.fillRect(cx - 2, h * 0.55 - 20, 12, 6);
    // Worm surfacing
    const surge = Math.max(0, Math.sin(t * 2.3));
    const wx = w * 0.35;
    const wy = h * 0.55 - surge * 40;
    ctx.fillStyle = '#9a2d2d';
    ctx.beginPath();
    ctx.ellipse(wx, wy, 34, 24 + surge * 12, 0, 0, Math.PI * 2);
    ctx.fill();
    // Teeth
    ctx.fillStyle = '#f6ecd4';
    for (let i = -2; i <= 2; i++) {
      const tx = wx + i * 7;
      ctx.beginPath();
      ctx.moveTo(tx - 3, wy - 4);
      ctx.lineTo(tx, wy + 6);
      ctx.lineTo(tx + 3, wy - 4);
      ctx.closePath(); ctx.fill();
    }
    // Eye
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(wx + 12, wy - 10, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(wx + 13, wy - 10, 2, 0, Math.PI * 2); ctx.fill();
  }
});
