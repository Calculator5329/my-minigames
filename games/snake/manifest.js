(function () {
  NDP.registerManifest({
    id: 'snake',
    title: 'Snake',
    blurb: 'Four biomes. Four worm bosses.',
    description: 'A four-biome serpent campaign. Eat eight apples in each biome — Grass, Desert, Cave, Digital — then face the Worm Boss and feed it three golden apples to clear the chapter. Power-ups drop mid-run; persistent perks (Lateral, Slow Start, Iron Apple, Magnet+) unlock between biomes.',
    controls: 'Arrows / WASD',
    theme: { bg: '#06120a', accent: '#4ade80', accent2: '#fbbf24' },

    previewDraw(ctx, t, w, h) {
      // Subtle biome gradient
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#0e2818'); g.addColorStop(1, '#06180c');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

      const cell = 16;
      ctx.strokeStyle = 'rgba(74,222,128,0.10)'; ctx.lineWidth = 1;
      for (let x = 0; x < w; x += cell) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = 0; y < h; y += cell) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

      // Sinuous snake along a sine path, head leading.
      const segs = 14;
      for (let i = segs - 1; i >= 0; i--) {
        const phase = t * 2.2 - i * 0.42;
        const sx = (w * 0.10) + ((phase * 14) % (w * 0.55));
        const sy = h * 0.55 + Math.sin(phase) * 30;
        const cx = Math.floor(sx / cell) * cell + cell / 2;
        const cy = Math.floor(sy / cell) * cell + cell / 2;
        if (i === 0) {
          // Head — bright with eye
          ctx.save();
          ctx.shadowColor = '#4ade80'; ctx.shadowBlur = 16;
          ctx.fillStyle = '#86efac';
          ctx.fillRect(cx - cell/2, cy - cell/2, cell - 2, cell - 2);
          ctx.restore();
          ctx.fillStyle = '#052e16';
          ctx.fillRect(cx + 2, cy - 3, 4, 4);
        } else {
          const a = 1 - i / (segs + 4);
          ctx.fillStyle = `rgba(34,197,94,${a})`;
          ctx.fillRect(cx - cell/2 + 1, cy - cell/2 + 1, cell - 4, cell - 4);
        }
      }

      // Regular apples
      for (let i = 0; i < 2; i++) {
        const ax = (i * 91 + 60) % (w - 40);
        const ay = ((i * 53 + 30) % (h - 80)) + 24;
        const ax2 = Math.floor(ax / cell) * cell + cell / 2;
        const ay2 = Math.floor(ay / cell) * cell + cell / 2;
        const pulse = 1 + 0.25 * Math.sin(t * 3 + i);
        ctx.save();
        ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 10;
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(ax2, ay2, (cell/2 - 2) * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = '#16a34a';
        ctx.fillRect(ax2 - 1, ay2 - cell/2 + 1, 2, 4);
      }

      // Golden boss apple — hint at the worm fight
      const gx = w * 0.78, gy = h * 0.32;
      const gpulse = 1 + 0.2 * Math.sin(t * 4);
      ctx.save();
      ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 18;
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(gx, gy, 9 * gpulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fef3c7';
      ctx.beginPath();
      ctx.arc(gx - 3, gy - 3, 3 * gpulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#451a03';
      ctx.fillRect(gx - 1, gy - 12, 2, 4);

      // Halo sparkles around the golden apple
      ctx.fillStyle = 'rgba(251,191,36,0.7)';
      for (let i = 0; i < 4; i++) {
        const a = t * 1.8 + i * Math.PI / 2;
        ctx.fillRect(gx + Math.cos(a) * 18 - 1, gy + Math.sin(a) * 18 - 1, 2, 2);
      }
    }
  });
})();
