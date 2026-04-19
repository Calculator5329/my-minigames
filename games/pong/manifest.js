(function () {
  NDP.registerManifest({
    id: 'pong',
    title: 'Pong',
    blurb: 'Five challengers. One trophy. First to five each match.',
    description: 'A five-opponent gauntlet through Rookie, Cadet, Veteran, Master and Champion. Each foe has a unique paddle quirk — predictive AI, smashes, spin shots, twin stacked paddles. Win a match, draft one of three random perks (wide paddle, curve return, twin ball, lazy foe, side bumpers), then climb the ladder. Champion match is best of 5.',
    controls: 'Mouse Y / W S / Arrows · click between matches',
    theme: { bg: '#000000', accent: '#e7ecf3', accent2: '#ffd86b' },

    previewDraw(ctx, t, w, h) {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);

      ctx.fillStyle = '#e7ecf3';
      for (let y = 6; y < h; y += 18) ctx.fillRect(w / 2 - 2, y, 4, 10);

      ctx.font = 'bold 30px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(122,224,255,0.8)';
      ctx.fillText('3', w * 0.3, 8);
      ctx.fillStyle = 'rgba(255,68,102,0.8)';
      ctx.fillText('2', w * 0.7, 8);

      // Player paddle (single).
      const pY = h * 0.5 + Math.sin(t * 2) * h * 0.18;
      ctx.fillStyle = '#e7ecf3';
      ctx.fillRect(20, pY - 22, 8, 44);

      // Champion-style stacked twin paddles on the CPU side.
      const twinT = (t * 1.3) % 4;
      const phase = twinT < 2 ? twinT / 2 : (4 - twinT) / 2;
      const topY = 24 + phase * (h * 0.35);
      const botY = h - 24 - phase * (h * 0.35);
      ctx.fillStyle = '#ff4466';
      ctx.fillRect(w - 28, topY - 22, 8, 44);
      ctx.fillRect(w - 28, botY - 22, 8, 44);

      // Tiny crown above the foe paddles to hint Champion match.
      ctx.fillStyle = '#ffd86b';
      ctx.beginPath();
      ctx.moveTo(w - 30, 14);
      ctx.lineTo(w - 26, 6);
      ctx.lineTo(w - 22, 12);
      ctx.lineTo(w - 18, 4);
      ctx.lineTo(w - 14, 12);
      ctx.lineTo(w - 10, 6);
      ctx.lineTo(w - 6,  14);
      ctx.closePath();
      ctx.fill();

      // Ball with neon glow.
      const bx = w * 0.5 + Math.cos(t * 2.3) * w * 0.32;
      const by = h * 0.55 + Math.sin(t * 3.1) * h * 0.22;
      ctx.save();
      ctx.shadowColor = '#ffd86b'; ctx.shadowBlur = 16;
      ctx.fillStyle = '#ffd86b';
      ctx.fillRect(bx - 5, by - 5, 10, 10);
      ctx.restore();
    }
  });
})();
