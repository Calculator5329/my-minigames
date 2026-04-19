(function () {
  // Per-world brick palettes for the preview swatches.
  const WORLD_COLORS = [
    '#ff9ec7', // Pastel
    '#8a99b4', // Steel
    '#7cd9ff', // Frost
    '#ff5e3a', // Ember
    '#7a3aff'  // Void
  ];
  const TRAIL_COLORS = ['#ffd86b', '#7cd9ff', '#c8a8ff'];

  NDP.registerManifest({
    id: 'breakout',
    title: 'Breakout',
    blurb: 'Five worlds. One Behemoth.',
    description:
      'A 5-world × 3-level tour through Pastel, Steel, Frost, Ember and Void. ' +
      'Smash bricks, dodge bombs, deflect off mirrors, fish for keys, and snag ' +
      'falling power-ups (multi-ball, wide paddle, laser, slow, shield). Buy ' +
      'persistent perks between worlds — then face the Void Behemoth.',
    controls: 'Mouse / A·D move   ·   Space serves & fires laser',
    theme: { bg: '#1a0a2a', accent: '#ff5eff', accent2: '#ffd86b' },

    previewDraw(ctx, t, w, h) {
      // Backdrop fades through the five world hues over time.
      const phase = (t * 0.25) % WORLD_COLORS.length;
      const a = WORLD_COLORS[Math.floor(phase) % WORLD_COLORS.length];
      const b = WORLD_COLORS[(Math.floor(phase) + 1) % WORLD_COLORS.length];
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, a); g.addColorStop(1, '#0a0814');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      void b;

      // Brick wall — coloured per row using the world palette.
      const rows = 5, cols = 9;
      const bw = w / cols - 2, bh = (h * 0.42) / rows - 2;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if ((r + c + Math.floor(t * 0.6)) % 9 === 0) continue;
          ctx.fillStyle = WORLD_COLORS[(r + Math.floor(t)) % WORLD_COLORS.length];
          ctx.fillRect(c * (bw + 2) + 1, 14 + r * (bh + 2), bw, bh);
          ctx.fillStyle = 'rgba(255,255,255,0.18)';
          ctx.fillRect(c * (bw + 2) + 1, 14 + r * (bh + 2), bw, 3);
        }
      }

      // Paddle
      const pX = w * 0.5 + Math.sin(t * 1.5) * w * 0.28;
      const grad = ctx.createLinearGradient(0, h - 24, 0, h - 8);
      grad.addColorStop(0, '#ffd86b');
      grad.addColorStop(1, '#ff5eff');
      ctx.fillStyle = grad;
      ctx.fillRect(pX - 42, h - 22, 84, 8);

      // Three balls weaving — multi-ball hint with coloured trails.
      for (let i = 0; i < 3; i++) {
        const phase2 = t * 2.4 + i * 1.7;
        const bx = pX + Math.cos(phase2) * (60 + i * 18);
        const by = h - 64 + Math.sin(phase2 * 1.3) * 64;
        const trail = TRAIL_COLORS[i];
        // trail dots
        for (let k = 0; k < 5; k++) {
          const tx = bx - Math.cos(phase2) * k * 4;
          const ty = by - Math.sin(phase2 * 1.3) * k * 4;
          ctx.globalAlpha = (5 - k) / 8;
          ctx.fillStyle = trail;
          ctx.beginPath(); ctx.arc(tx, ty, 4 - k * 0.5, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.save();
        ctx.shadowColor = trail; ctx.shadowBlur = 12;
        ctx.fillStyle = trail;
        ctx.beginPath(); ctx.arc(bx, by, 5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
  });
})();
