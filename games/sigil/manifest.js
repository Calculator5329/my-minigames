NDP.registerManifest({
  id: 'sigil',
  title: 'Sigil',
  blurb: 'Three chapters. Three bosses. One grimoire.',
  description: 'Trace runes with your mouse to cast spells. Each chapter is a flurry of trials capped by a boss duel — Warlock, Lich, Dragon. Glyphs have elements; bosses have weaknesses. Combo casts for damage, perfect strokes refund mana, and the sanctum sells permanent perks between chapters.',
  controls: 'Draw: HOLD LEFT MOUSE and trace  ·  Release to cast  ·  Spend coins between chapters',
  theme: { bg: '#0a0712', accent: '#d6a8ff', accent2: '#f59e0b' },

  previewDraw(ctx, t, w, h) {
    // Parchment-dark
    const g = ctx.createRadialGradient(w/2, h/2, 20, w/2, h/2, w);
    g.addColorStop(0, '#1a0f26'); g.addColorStop(1, '#05020a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

    // Runic frame
    ctx.strokeStyle = '#4a2b7a';
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 20, w - 40, h - 40);
    ctx.strokeStyle = '#2e1a4e';
    ctx.strokeRect(28, 28, w - 56, h - 56);

    // Sample rune: pentagram
    ctx.save();
    ctx.translate(w/2, h/2);
    ctx.rotate(Math.sin(t*0.3)*0.1);
    const R = Math.min(w, h) * 0.3;
    ctx.strokeStyle = '#d6a8ff';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#d6a8ff'; ctx.shadowBlur = 16;
    ctx.beginPath();
    for (let i = 0; i <= 5; i++) {
      const a = -Math.PI/2 + i * (Math.PI * 2 * 2 / 5);
      const x = Math.cos(a) * R;
      const y = Math.sin(a) * R;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, R * 1.1, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();

    // Timer ring
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 4;
    ctx.beginPath();
    const phase = (t * 0.5) % 1;
    ctx.arc(w/2, h/2, Math.min(w, h) * 0.42, -Math.PI/2, -Math.PI/2 + (1 - phase) * Math.PI * 2);
    ctx.stroke();
  }
});
