(function () {
  NDP.registerManifest({
    id: 'asteroids',
    title: 'Asteroids',
    blurb: 'Drift. Shoot. Out-fly the hive.',
    description: 'Pilot a vector ship through ten waves of drifting rocks. Bosses crash the party at waves 5 (Swarm Lord) and 10 (Hive Queen). Spend coins between waves on rapid fire, twin guns, a regenerating shield, or a homing missile.',
    controls: 'A D rotate · W thrust · SPACE fire · X missile (when owned)',
    theme: { bg: '#000000', accent: '#e7ecf3', accent2: '#7cd9ff' },

    previewDraw(ctx, t, w, h) {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
      // Stars
      for (let i = 0; i < 60; i++) {
        const sx = (i * 91) % w;
        const sy = (i * 139) % h;
        const a = 0.3 + 0.5 * Math.abs(Math.sin(t * 1.3 + i));
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        ctx.fillRect(sx, sy, 1, 1);
      }
      // Player ship — vector arrow rotating in the centre.
      const cx = w * 0.5, cy = h * 0.55;
      const ang = t * 0.6;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ang);
      ctx.strokeStyle = '#e7ecf3'; ctx.lineWidth = 2;
      ctx.shadowColor = '#7cd9ff'; ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-10, 9);
      ctx.lineTo(-6, 0);
      ctx.lineTo(-10, -9);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
      // Asteroids
      const rocks = [
        { x: w * 0.18, y: h * 0.30, r: 26, sp: 0.7 },
        { x: w * 0.82, y: h * 0.28, r: 22, sp: 1.1 },
        { x: w * 0.20, y: h * 0.78, r: 16, sp: 1.5 }
      ];
      ctx.strokeStyle = '#e7ecf3'; ctx.lineWidth = 2;
      ctx.shadowColor = '#7cd9ff'; ctx.shadowBlur = 6;
      for (const r of rocks) {
        ctx.beginPath();
        const sides = 9;
        for (let i = 0; i <= sides; i++) {
          const a = (i / sides) * Math.PI * 2 + t * r.sp * 0.4;
          const radius = r.r + Math.sin(i * 1.7 + r.sp) * r.r * 0.18;
          const px = r.x + Math.cos(a) * radius;
          const py = r.y + Math.sin(a) * radius;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      // Player laser
      ctx.strokeStyle = '#ffd86b'; ctx.lineWidth = 2;
      ctx.shadowColor = '#ffd86b'; ctx.shadowBlur = 10;
      const lx1 = cx + Math.cos(ang) * 18;
      const ly1 = cy + Math.sin(ang) * 18;
      const lx2 = lx1 + Math.cos(ang) * 60;
      const ly2 = ly1 + Math.sin(ang) * 60;
      ctx.beginPath(); ctx.moveTo(lx1, ly1); ctx.lineTo(lx2, ly2); ctx.stroke();
      ctx.shadowBlur = 0;

      // Alien hive teaser — UFO saucer drifting across the top with a
      // hunter drone shadowing it. Subtle wobble so the preview reads as
      // "danger" rather than "static art".
      const ufoX = w * 0.5 + Math.sin(t * 0.7) * w * 0.32;
      const ufoY = h * 0.18 + Math.cos(t * 0.5) * 6;
      ctx.save();
      ctx.shadowColor = '#ff5e7e'; ctx.shadowBlur = 12;
      // Saucer base
      ctx.fillStyle = '#3a0e44';
      ctx.beginPath(); ctx.ellipse(ufoX, ufoY + 6, 28, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ff8fb0'; ctx.lineWidth = 1.5; ctx.stroke();
      // Dome
      ctx.fillStyle = 'rgba(205,246,255,0.85)';
      ctx.beginPath(); ctx.ellipse(ufoX, ufoY, 16, 10, 0, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = '#cdf6ff'; ctx.stroke();
      // Belly lights
      ctx.fillStyle = '#ffd86b';
      [-14, 0, 14].forEach(off => {
        ctx.beginPath(); ctx.arc(ufoX + off, ufoY + 12, 1.6, 0, Math.PI * 2); ctx.fill();
      });
      ctx.restore();

      // Hunter drone — small angular diamond following the ship.
      const dx = cx + Math.cos(t * 1.3) * 80;
      const dy = cy + Math.sin(t * 1.3) * 80 - 30;
      ctx.save();
      ctx.shadowColor = '#ff5e7e'; ctx.shadowBlur = 8;
      ctx.fillStyle = '#3a0a23';
      ctx.strokeStyle = '#ff5e7e'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(dx, dy - 8); ctx.lineTo(dx + 7, dy);
      ctx.lineTo(dx, dy + 8); ctx.lineTo(dx - 7, dy);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff5e7e';
      ctx.beginPath(); ctx.arc(dx, dy, 2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  });
})();
