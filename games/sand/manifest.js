NDP.registerManifest({
  id: 'sand',
  title: 'Sand',
  blurb: 'From sand to CPU.',
  description: 'Build a computer from the switch and transistor up. Place primitives, wire them into gates, compose gates into modules, and keep climbing the abstraction ladder.',
  controls: 'Place: CLICK  ·  Wire: DRAG  ·  Pan/Zoom: later',
  theme: { bg: '#0a0a0a', accent: '#e4b363', accent2: '#6bb6ff' },

  previewDraw(ctx, t, w, h) {
    // Mini adder sketch driven by time only. Stateless.
    // Background
    ctx.fillStyle = '#0a0f16';
    ctx.fillRect(0, 0, w, h);

    // Drifting silicon lattice (very low alpha)
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#8aa0b8';
    const pitch = 14;
    const drift = (t * 6) % pitch;
    for (let iy = -1; iy * pitch < h + pitch; iy++) {
      const y = iy * pitch + drift;
      const off = (iy & 1) ? pitch / 2 : 0;
      for (let ix = -1; ix * pitch < w + pitch; ix++) {
        const x = ix * pitch + off;
        ctx.beginPath();
        ctx.arc(x, y, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    // Vignette
    const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.7);
    vg.addColorStop(0, 'rgba(228,179,99,0.05)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    // Node geometry
    const padAX = w * 0.18, padAY = h * 0.32;
    const padBX = w * 0.18, padBY = h * 0.68;
    const gate1X = w * 0.48, gate1Y = h * 0.32;
    const gate2X = w * 0.48, gate2Y = h * 0.68;
    const padYX = w * 0.82, padYY = h * 0.5;
    const padR = Math.min(w, h) * 0.06;
    const gW = Math.min(w, h) * 0.18;
    const gH = Math.min(w, h) * 0.14;

    // Signals
    const a = Math.round((Math.sin(t) + 1) / 2);
    const b = Math.round((Math.sin(t * 1.3 + 1) + 1) / 2);
    const y = (a ^ b) & 1;

    // Helper: draw wire with optional particle flow.
    function wire(x1, y1, x2, y2, active, hue, phase) {
      // Orthogonal with midX
      const midX = (x1 + x2) / 2;
      ctx.save();
      ctx.strokeStyle = active ? 'hsl(' + hue + ',90%,60%)' : 'rgba(73,84,106,0.85)';
      ctx.lineWidth = active ? 2 : 1.4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(midX, y1);
      ctx.lineTo(midX, y2);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.restore();

      if (!active) return;

      // Compute segment lengths for point-along.
      const s1 = Math.abs(midX - x1);
      const s2 = Math.abs(y2 - y1);
      const s3 = Math.abs(x2 - midX);
      const L = s1 + s2 + s3;

      // Emit 4 particles evenly spaced.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 4; i++) {
        const frac = ((t * 0.9 + phase + i / 4) % 1 + 1) % 1;
        let d = frac * L;
        let px, py;
        if (d <= s1) {
          const tt = d / s1;
          px = x1 + (midX - x1) * tt;
          py = y1;
        } else if (d <= s1 + s2) {
          const tt = (d - s1) / s2;
          px = midX;
          py = y1 + (y2 - y1) * tt;
        } else {
          const tt = (d - s1 - s2) / s3;
          px = midX + (x2 - midX) * tt;
          py = y2;
        }
        ctx.fillStyle = 'hsla(' + hue + ',90%,55%,0.35)';
        ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'hsla(' + hue + ',95%,70%,0.7)';
        ctx.beginPath(); ctx.arc(px, py, 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'hsla(' + hue + ',100%,92%,1)';
        ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    // Draw wires first: A->g1, A->g2, B->g1, B->g2, g1->Y, g2->Y
    wire(padAX + padR, padAY, gate1X - gW / 2, gate1Y, a === 1, 40, 0.0);
    wire(padAX + padR, padAY, gate2X - gW / 2, gate2Y, a === 1, 40, 0.25);
    wire(padBX + padR, padBY, gate1X - gW / 2, gate1Y, b === 1, 200, 0.1);
    wire(padBX + padR, padBY, gate2X - gW / 2, gate2Y, b === 1, 200, 0.35);
    wire(gate1X + gW / 2, gate1Y, padYX - padR, padYY, y === 1, 50, 0.5);
    wire(gate2X + gW / 2, gate2Y, padYX - padR, padYY, y === 1, 50, 0.15);

    // Rounded-rect helper for gates
    function rrect(x, y, ww, hh, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + ww - r, y);
      ctx.quadraticCurveTo(x + ww, y, x + ww, y + r);
      ctx.lineTo(x + ww, y + hh - r);
      ctx.quadraticCurveTo(x + ww, y + hh, x + ww - r, y + hh);
      ctx.lineTo(x + r, y + hh);
      ctx.quadraticCurveTo(x, y + hh, x, y + hh - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    }

    // Gate boxes
    for (const g of [[gate1X, gate1Y], [gate2X, gate2Y]]) {
      const gx = g[0] - gW / 2, gy = g[1] - gH / 2;
      rrect(gx, gy, gW, gH, 6);
      const grd = ctx.createLinearGradient(gx, gy, gx, gy + gH);
      grd.addColorStop(0, '#232b40');
      grd.addColorStop(1, '#1a2030');
      ctx.fillStyle = grd;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#3a4560';
      ctx.stroke();
      // etched zigzag
      ctx.save();
      ctx.strokeStyle = '#e4b363';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(gx + 8, g[1]);
      ctx.lineTo(gx + gW / 2 - 6, g[1] - 6);
      ctx.lineTo(gx + gW / 2 + 6, g[1] + 6);
      ctx.lineTo(gx + gW - 8, g[1]);
      ctx.stroke();
      ctx.restore();
    }

    // Pads (circles)
    function pad(x, y, label, value, hue) {
      ctx.save();
      // outer glow when on
      if (value === 1) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'hsla(' + hue + ',95%,60%,0.35)';
        ctx.beginPath();
        ctx.arc(x, y, padR * 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.beginPath();
      ctx.arc(x, y, padR, 0, Math.PI * 2);
      const grd = ctx.createRadialGradient(x - 2, y - 2, 1, x, y, padR);
      grd.addColorStop(0, value === 1 ? '#ffe8a8' : '#2a3246');
      grd.addColorStop(1, value === 1 ? '#e4b363' : '#141a24');
      ctx.fillStyle = grd;
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = value === 1 ? '#ffcc33' : '#3a4560';
      ctx.stroke();
      ctx.fillStyle = value === 1 ? '#0a0f16' : '#e7ecf3';
      ctx.font = 'bold ' + Math.round(padR * 0.9) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x, y);
      ctx.restore();
    }
    pad(padAX, padAY, 'A', a, 40);
    pad(padBX, padBY, 'B', b, 200);
    pad(padYX, padYY, 'Y', y, 50);

    // Title
    ctx.save();
    ctx.fillStyle = '#e4b363';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('sand', w / 2, 6);
    ctx.restore();
  }
});
