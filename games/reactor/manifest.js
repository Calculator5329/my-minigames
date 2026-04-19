(function () {
  function lerpColor(a, b, t) {
    const pa = a.replace('#',''), pb = b.replace('#','');
    const ar = parseInt(pa.slice(0,2),16), ag = parseInt(pa.slice(2,4),16), ab = parseInt(pa.slice(4,6),16);
    const br = parseInt(pb.slice(0,2),16), bg = parseInt(pb.slice(2,4),16), bb = parseInt(pb.slice(4,6),16);
    const r = (ar + (br-ar)*t) | 0, g = (ag + (bg-ag)*t) | 0, c = (ab + (bb-ab)*t) | 0;
    return { r, g, b: c, css: `rgb(${r},${g},${c})`, rgba: (a) => `rgba(${r},${g},${c},${a})` };
  }

  NDP.registerManifest({
    id: 'reactor',
    title: 'Reactor',
    blurb: 'Don\'t let the moon go boom.',
    description: 'Run the Helium-3 reactor of a lunar mining base. Crank the throttle for cash, but watch the heat — meltdown is one bad second away. Buy modules, survive meteors, evac in 60.',
    controls: 'Drag throttle  ·  W/S nudge  ·  Click modules to buy  ·  Space = emergency vent',
    theme: { bg: '#06070d', accent: '#7cd9ff', accent2: '#ff5e7e' },

    previewDraw(ctx, t, w, h) {
      // Starfield + sky gradient
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#070b1a'); g.addColorStop(0.6, '#0a0e1f'); g.addColorStop(1, '#100716');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

      for (let i = 0; i < 50; i++) {
        const sx = ((i * 73) % w);
        const sy = ((i * 137) % (h * 0.55));
        const a = 0.3 + 0.7 * Math.abs(Math.sin(t * 1.7 + i));
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        ctx.fillRect(sx, sy, 1.2, 1.2);
      }

      // Earth-rise upper-right
      ctx.save();
      ctx.shadowColor = '#4fa8ff'; ctx.shadowBlur = 18;
      ctx.fillStyle = '#2e62b8';
      ctx.beginPath(); ctx.arc(w * 0.82, h * 0.18, 28, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#3da55a';
      ctx.beginPath(); ctx.arc(w * 0.79, h * 0.16, 8, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(w * 0.85, h * 0.21, 6, 0, Math.PI * 2); ctx.fill();

      // Lunar surface
      ctx.fillStyle = '#1c1d2a';
      ctx.beginPath();
      ctx.moveTo(0, h * 0.75);
      for (let i = 0; i <= 10; i++) {
        const x = (i / 10) * w;
        const dy = Math.sin(i * 1.3) * 6;
        ctx.lineTo(x, h * 0.78 + dy);
      }
      ctx.lineTo(w, h); ctx.lineTo(0, h);
      ctx.closePath(); ctx.fill();

      // Craters
      ctx.fillStyle = '#13141d';
      [[0.15, 0.86, 18], [0.4, 0.92, 12], [0.7, 0.88, 22]].forEach(([cx, cy, r]) => {
        ctx.beginPath(); ctx.ellipse(cx * w, cy * h, r, r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
      });

      // Dome
      ctx.strokeStyle = 'rgba(124,217,255,0.4)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(w * 0.4, h * 0.78, w * 0.32, Math.PI, 0); ctx.stroke();
      ctx.fillStyle = 'rgba(124,217,255,0.04)';
      ctx.beginPath(); ctx.arc(w * 0.4, h * 0.78, w * 0.32, Math.PI, 0); ctx.fill();

      // Reactor core — heat-shifted
      const heatPhase = (Math.sin(t * 1.2) + 1) * 0.5;
      const core = lerpColor('#7cd9ff', '#ff3a3a', heatPhase * heatPhase);
      const cx = w * 0.4, cy = h * 0.7;
      const pulse = 1 + Math.sin(t * 4) * 0.08;
      ctx.save();
      ctx.shadowColor = core.css; ctx.shadowBlur = 40 + heatPhase * 30;
      ctx.fillStyle = core.css;
      ctx.beginPath(); ctx.arc(cx, cy, 22 * pulse, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.7 + heatPhase * 0.3;
      ctx.beginPath(); ctx.arc(cx, cy, 10 * pulse, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;

      // Halo ring
      ctx.strokeStyle = core.rgba(0.6);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, 36 + Math.sin(t * 6) * 2, 0, Math.PI * 2); ctx.stroke();

      // Module pods radiating
      const pods = [
        { ang: -Math.PI * 0.85, color: '#ffd86b' },
        { ang: -Math.PI * 0.55, color: '#4ade80' },
        { ang: -Math.PI * 0.15, color: '#a855f7' },
        { ang:  Math.PI * 0.15, color: '#60a5fa' }
      ];
      pods.forEach((p, i) => {
        const px = cx + Math.cos(p.ang) * 60;
        const py = cy + Math.sin(p.ang) * 38;
        ctx.strokeStyle = '#3a4660'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, py); ctx.stroke();
        ctx.fillStyle = '#222937';
        ctx.fillRect(px - 12, py - 8, 24, 16);
        ctx.strokeStyle = p.color; ctx.lineWidth = 1.5;
        ctx.strokeRect(px - 12, py - 8, 24, 16);
        const ind = 0.5 + 0.5 * Math.sin(t * 5 + i * 1.3);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = 0.4 + ind * 0.6;
        ctx.fillRect(px - 9, py - 5, 4, 4);
        ctx.globalAlpha = 1;
      });

      // Floating $ from active modules
      for (let i = 0; i < 6; i++) {
        const fx = cx + Math.cos(i * 1.1 + t) * 70;
        const phase = ((t * 30 + i * 25) % 80);
        const fy = cy - 30 - phase;
        const a = 1 - phase / 80;
        ctx.globalAlpha = a;
        ctx.fillStyle = '#ffd86b';
        ctx.font = 'bold 12px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('$', fx, fy);
        ctx.globalAlpha = 1;
      }

      // Meteor streak
      const meteorT = (t * 0.4) % 4;
      if (meteorT < 0.6) {
        const k = meteorT / 0.6;
        const mx = w * 0.95 - k * w * 0.5;
        const my = h * 0.05 + k * h * 0.4;
        ctx.strokeStyle = '#ffae44';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#ffae44'; ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(mx, my); ctx.lineTo(mx + 30, my - 14); ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Critical pulse on red core
      if (heatPhase > 0.7) {
        ctx.strokeStyle = '#ff3a3a';
        ctx.lineWidth = 3;
        ctx.globalAlpha = (heatPhase - 0.7) / 0.3;
        ctx.strokeRect(2, 2, w - 4, h - 4);
        ctx.globalAlpha = 1;
      }
    }
  });
})();
