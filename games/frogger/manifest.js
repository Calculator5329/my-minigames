(function () {
  NDP.registerManifest({
    id: 'frogger',
    title: 'Frogger',
    blurb: 'Five days. New hazards every dawn. Hawk at dusk.',
    description: 'A 5-day campaign across road and river. Day 2 wakes a snake on the median, Day 3 rolls in trucks and pad-snapping crocs, Day 4 brings sinking lily pads and lightning, and Day 5 ends with the Highway Hawk — a swooping shadow that strafes your column. Spend coins between days on Long Hop, Trap Detector, Spare Frog, and Quick Hop perks.',
    controls: 'Arrows / WASD to hop · SHIFT + UP for Long Hop · click to advance menus',
    theme: { bg: '#0d1f12', accent: '#4ade80', accent2: '#ffd86b' },

    previewDraw(ctx, t, w, h) {
      // Backdrop
      ctx.fillStyle = '#0d1f12'; ctx.fillRect(0, 0, w, h);
      // Goal strip + 5 pads
      ctx.fillStyle = '#173f24'; ctx.fillRect(0, 0, w, h * 0.10);
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = i === 2 ? '#3a3014' : '#0d2a17';
        ctx.fillRect((i + 0.5) * (w / 5) - 14, 4, 28, h * 0.10 - 8);
      }
      // River
      ctx.fillStyle = '#0e3b6b'; ctx.fillRect(0, h * 0.10, w, h * 0.32);
      // Median (with snake silhouette)
      ctx.fillStyle = '#1e2a17'; ctx.fillRect(0, h * 0.42, w, h * 0.06);
      ctx.strokeStyle = '#3a8a4a'; ctx.lineWidth = 2;
      ctx.beginPath();
      const sx = (t * 30) % w;
      for (let i = -1; i < 2; i++) {
        const xx = sx + i * w;
        ctx.moveTo(xx, h * 0.45);
        ctx.bezierCurveTo(xx + 18, h * 0.43, xx + 28, h * 0.47, xx + 44, h * 0.45);
      }
      ctx.stroke();
      // Road
      ctx.fillStyle = '#15171c'; ctx.fillRect(0, h * 0.48, w, h * 0.42);
      ctx.strokeStyle = '#ffd86b'; ctx.setLineDash([8, 8]); ctx.lineWidth = 1.5;
      for (let i = 1; i < 4; i++) {
        const y = h * 0.48 + i * (h * 0.42 / 4);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      ctx.setLineDash([]);
      // Start strip
      ctx.fillStyle = '#1e2a17'; ctx.fillRect(0, h * 0.90, w, h * 0.10);

      // Logs (top river lane)
      const logColors = ['#7a4a25', '#8b5a2b'];
      for (let lane = 0; lane < 4; lane++) {
        const dir = lane % 2 === 0 ? 1 : -1;
        const speed = 28 + lane * 6;
        const yLane = h * 0.10 + (lane + 0.5) * (h * 0.32 / 4);
        const isLily = lane === 0;
        for (let i = 0; i < 3; i++) {
          const baseX = (i * w / 3 + t * speed * dir) % (w + 90);
          const x = baseX < 0 ? baseX + (w + 90) : baseX;
          if (isLily && i === 1) {
            ctx.fillStyle = '#3a8a4a';
            ctx.beginPath(); ctx.ellipse(x, yLane, 18, 12, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#ff9bd6';
            ctx.beginPath(); ctx.arc(x + 4, yLane - 2, 3, 0, Math.PI * 2); ctx.fill();
          } else {
            ctx.fillStyle = logColors[lane % 2];
            ctx.fillRect(x - 40, yLane - 8, 80, 16);
          }
        }
      }

      // Vehicles — first lane: truck, others: cars
      const carColors = ['#ff5e7e', '#ffd86b', '#7cd9ff', '#a855f7'];
      for (let lane = 0; lane < 4; lane++) {
        const dir = lane % 2 === 0 ? -1 : 1;
        const speed = 38 + lane * 12;
        const yLane = h * 0.48 + (lane + 0.5) * (h * 0.42 / 4);
        const isTruck = lane === 1;
        const baseX = ((t * speed * dir) % (w + 80));
        const x = baseX < 0 ? baseX + (w + 80) : baseX;
        if (isTruck) {
          ctx.fillStyle = '#7a4a25';
          ctx.fillRect(x - 36, yLane - 9, 60, 18);
          ctx.fillStyle = '#c45a3a';
          ctx.fillRect(x + 24, yLane - 8, 16, 16);
        } else {
          ctx.fillStyle = carColors[lane];
          ctx.fillRect(x - 16, yLane - 8, 32, 16);
        }
        // Second copy further along
        const x2 = (x + (w / 2 + 60)) % (w + 80);
        ctx.fillStyle = isTruck ? '#7a4a25' : carColors[lane];
        ctx.fillRect(x2 - 16, yLane - 8, isTruck ? 60 : 32, isTruck ? 18 : 16);
      }

      // Hawk shadow drifting across — telegraphs Day 5 boss
      const hawkX = ((t * 0.5) % 1) * w;
      ctx.fillStyle = `rgba(0,0,0, ${0.35 + 0.2 * Math.sin(t * 3)})`;
      ctx.beginPath();
      ctx.ellipse(hawkX, h * 0.62, 26 + Math.sin(t * 3) * 6, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      // Wings hint
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath();
      ctx.moveTo(hawkX - 30, h * 0.62 - 2);
      ctx.lineTo(hawkX, h * 0.62 - 8);
      ctx.lineTo(hawkX + 30, h * 0.62 - 2);
      ctx.lineTo(hawkX, h * 0.62 + 4);
      ctx.closePath();
      ctx.fill();

      // Frog at bottom
      const hop = Math.abs(Math.sin(t * 5)) * 6;
      const fx = w * 0.5;
      const fy = h * 0.95 - hop;
      ctx.save();
      ctx.shadowColor = '#4ade80'; ctx.shadowBlur = 12;
      ctx.fillStyle = '#4ade80';
      ctx.fillRect(fx - 12, fy - 12, 24, 24);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(fx - 16, fy - 6, 6, 6);
      ctx.fillRect(fx + 10, fy - 6, 6, 6);
      ctx.restore();
      ctx.fillStyle = '#fff';
      ctx.fillRect(fx - 7, fy - 9, 4, 4);
      ctx.fillRect(fx + 3, fy - 9, 4, 4);
      ctx.fillStyle = '#000';
      ctx.fillRect(fx - 6, fy - 8, 2, 2);
      ctx.fillRect(fx + 4, fy - 8, 2, 2);

      // Day badge
      ctx.fillStyle = '#ffd86b'; ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('5 DAYS · HAWK BOSS', 8, 6);
    }
  });
})();
