(function () {
  NDP.registerManifest({
    id: 'helicopter',
    title: 'Helicopter',
    blurb: 'Four biomes. Four bosses. One rotor.',
    description: 'Pilot through Cavern, Reactor, Reef and Orbit. Each biome ends in a boss obstacle — laser gates, a charging dragon, a turret gauntlet, and the satellite array. Grab fuel pods, shields and turbo, then spend coins on persistent perks at the hangar between biomes.',
    controls: 'Hold mouse / Space to lift',
    theme: { bg: '#06080f', accent: '#ffd86b', accent2: '#ff5e7e' },

    /* Preview hints at the laser-gate boss flickering inside a cave with a
       small heli holding the lane open. Animates entirely on `t` so the
       carousel loop is seamless. */
    previewDraw(ctx, t, w, h) {
      ctx.fillStyle = '#06080f'; ctx.fillRect(0, 0, w, h);

      // Cave silhouette
      ctx.fillStyle = '#1c1228';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      for (let x = 0; x <= w; x += 8) {
        const y = 24 + Math.sin(x * 0.025 + t * 1.4) * 16 + Math.sin(x * 0.07 + t) * 4;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, 0); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 8) {
        const y = h - 24 + Math.sin(x * 0.025 + t * 1.4 + 1.2) * 16 + Math.sin(x * 0.07 + t + 0.6) * 4;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h); ctx.closePath(); ctx.fill();

      // Cave glow edges
      ctx.strokeStyle = '#a87fc9';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = '#a87fc9'; ctx.shadowBlur = 6;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 8) {
        const y = 24 + Math.sin(x * 0.025 + t * 1.4) * 16 + Math.sin(x * 0.07 + t) * 4;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.beginPath();
      for (let x = 0; x <= w; x += 8) {
        const y = h - 24 + Math.sin(x * 0.025 + t * 1.4 + 1.2) * 16 + Math.sin(x * 0.07 + t + 0.6) * 4;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Laser gates pulsing on/off — the upcoming Cavern boss in miniature
      const gates = [
        { x: w * 0.55, gapY: h * 0.40, gapH: h * 0.22, phase: 0    },
        { x: w * 0.78, gapY: h * 0.32, gapH: h * 0.26, phase: 1.05 }
      ];
      gates.forEach(g => {
        const on = Math.sin(t * 4 + g.phase) > -0.2;
        // Frame
        ctx.fillStyle = '#3a1010';
        ctx.fillRect(g.x - 5, 0, 10, g.gapY);
        ctx.fillRect(g.x - 5, g.gapY + g.gapH, 10, h - g.gapY - g.gapH);
        if (on) {
          ctx.save();
          ctx.shadowColor = '#ff5e7e'; ctx.shadowBlur = 10;
          const grad = ctx.createLinearGradient(g.x, 0, g.x, h);
          grad.addColorStop(0, '#ff5e7e');
          grad.addColorStop(0.5, '#ffd86b');
          grad.addColorStop(1, '#ff5e7e');
          ctx.fillStyle = grad;
          ctx.fillRect(g.x - 2, 0, 4, g.gapY);
          ctx.fillRect(g.x - 2, g.gapY + g.gapH, 4, h - g.gapY - g.gapH);
          ctx.restore();
        }
      });

      // Stalagmite hint
      ctx.fillStyle = '#5a3f6a';
      ctx.beginPath();
      ctx.moveTo(w * 0.20, h - 22);
      ctx.lineTo(w * 0.24, h - 44);
      ctx.lineTo(w * 0.28, h - 22);
      ctx.closePath(); ctx.fill();

      // Helicopter
      const cx = w * 0.30;
      const cy = h * 0.5 + Math.sin(t * 2.4) * 14;
      ctx.save();
      ctx.shadowColor = '#ffd86b'; ctx.shadowBlur = 14;
      ctx.fillStyle = '#ffd86b';
      ctx.fillRect(cx - 18, cy - 7, 30, 14);
      ctx.beginPath();
      ctx.moveTo(cx + 12, cy - 4);
      ctx.lineTo(cx + 24, cy);
      ctx.lineTo(cx + 12, cy + 4);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#ffd86b';
      ctx.fillRect(cx - 26, cy - 2, 8, 4);
      // Rotor
      ctx.fillStyle = '#cfe9ff';
      const blur = Math.abs(Math.sin(t * 30));
      ctx.fillRect(cx - 24, cy - 12, 48, 2);
      ctx.globalAlpha = 0.4 + 0.6 * blur;
      ctx.fillRect(cx - 30, cy - 13, 60, 1);
      ctx.globalAlpha = 1;
      // Exhaust trail
      for (let i = 0; i < 6; i++) {
        const tx = cx - 26 - i * 9;
        const ty = cy + 2 + Math.sin(t * 5 - i) * 2;
        const a = 1 - i / 6;
        ctx.fillStyle = `rgba(255,174,68,${a * 0.6})`;
        ctx.fillRect(tx, ty, 5, 3);
      }
      // Shield bubble around the heli — hints at the pickup
      ctx.strokeStyle = `rgba(124,217,255,${0.4 + 0.4 * Math.abs(Math.sin(t * 2))})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, 22, 0, Math.PI * 2); ctx.stroke();
    }
  });
})();
