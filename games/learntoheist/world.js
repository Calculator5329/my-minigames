/* Learn to Heist — atmosphere + parallax renderer.
   Separate module so the main game file stays focused on simulation.
   Exposes: LTH.World.newWorld(), .render(ctx, world, cam, w, h)
*/
(function () {
  const NDP = window.NDP;
  const LTH = (NDP.LTH = NDP.LTH || {});
  const { Draw, Color } = NDP.Engine;

  const World = {};
  LTH.World = World;

  /* -----------------------------------------------------------------
     Build a world (distant parallax scenery, stars, clouds, sun/moon).
     Coordinates are "world units" — x is horizontal distance flown,
     y is altitude (positive = up). Camera transforms to screen space.
  ----------------------------------------------------------------- */
  World.newWorld = function () {
    const stars = [];
    for (let i = 0; i < 280; i++) {
      stars.push({
        x: Math.random() * 8000 - 4000,
        y: 1500 + Math.random() * 4500,
        r: Math.random() * 1.6 + 0.4,
        tw: Math.random() * Math.PI * 2,
        c: Math.random() < 0.15 ? '#ffccaa' : (Math.random() < 0.1 ? '#aaccff' : '#ffffff')
      });
    }
    const farClouds = [];
    for (let i = 0; i < 30; i++) {
      farClouds.push({
        x: Math.random() * 12000 - 1000,
        y: 150 + Math.random() * 750,
        r: 40 + Math.random() * 90,
        speed: 8 + Math.random() * 10
      });
    }
    const midHills = [];
    for (let i = 0; i < 80; i++) {
      midHills.push({ x: i * 180 + Math.random() * 60 - 30, h: 40 + Math.random() * 90 });
    }
    const farHills = [];
    for (let i = 0; i < 120; i++) {
      farHills.push({ x: i * 260 + Math.random() * 120, h: 60 + Math.random() * 140 });
    }
    const nebulae = [];
    for (let i = 0; i < 12; i++) {
      nebulae.push({
        x: Math.random() * 8000 - 4000,
        y: 2200 + Math.random() * 3000,
        r: 180 + Math.random() * 260,
        hue: [
          'rgba(180,80,220,0.25)',
          'rgba(80,140,255,0.2)',
          'rgba(255,90,160,0.22)',
          'rgba(80,200,200,0.2)'
        ][i % 4]
      });
    }

    return {
      stars,
      farClouds,
      midHills,
      farHills,
      nebulae,
      sun: { x: 600, y: 260 },
      moon: { x: -800, y: 1300 },
      vault: { x: 4000, y: 3200, vx: -30, vy: 60 },   // chased across sky
      planets: [
        { x: 2500, y: 3500, r: 110, color: '#d46a3f', ring: true },
        { x: -1800, y: 2900, r: 80,  color: '#6aa6d4', ring: false }
      ],
      timeT: 0
    };
  };

  /* -----------------------------------------------------------------
     Sky gradient at a given altitude. Interpolates between bands.
  ----------------------------------------------------------------- */
  function lerpColor(a, b, t) {
    return NDP.Engine.Color.lerp(a, b, Math.max(0, Math.min(1, t)));
  }

  World.skyAt = function (altitude) {
    const bands = LTH.SKY_BANDS;
    if (altitude <= bands[0].alt) return { top: bands[0].top, bot: bands[0].bot };
    for (let i = 1; i < bands.length; i++) {
      if (altitude <= bands[i].alt) {
        const a = bands[i - 1], b = bands[i];
        const t = (altitude - a.alt) / (b.alt - a.alt);
        return { top: lerpColor(a.top, b.top, t), bot: lerpColor(a.bot, b.bot, t) };
      }
    }
    const last = bands[bands.length - 1];
    return { top: last.top, bot: last.bot };
  };

  /* -----------------------------------------------------------------
     Render the full background — sky gradient, celestial bodies,
     nebulae, parallax hills/clouds, and (much later) the fleeing vault.
  ----------------------------------------------------------------- */
  World.render = function (ctx, world, cam, w, h, dt) {
    world.timeT += dt || 0;
    const alt = cam.y;
    const sky = World.skyAt(alt);

    // sky gradient
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, sky.top); g.addColorStop(1, sky.bot);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

    // distant nebulae (visible when high up)
    if (alt > 1300) {
      const neb = Math.min(1, (alt - 1300) / 700);
      for (const n of world.nebulae) {
        const sx = w * 0.5 + (n.x - cam.x) * 0.05;
        const sy = h - 30 + (cam.y - n.y) * 0.05;
        if (sx < -400 || sx > w + 400) continue;
        const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, n.r);
        grad.addColorStop(0, n.hue);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.globalAlpha = neb;
        ctx.fillRect(sx - n.r, sy - n.r, n.r * 2, n.r * 2);
      }
      ctx.globalAlpha = 1;
    }

    // stars (fade in as sky darkens)
    if (alt > 600) {
      const starA = Math.min(1, (alt - 600) / 900);
      for (const s of world.stars) {
        const sx = w * 0.5 + (s.x - cam.x) * 0.1;
        const sy = h - 30 + (cam.y - s.y) * 0.1;
        if (sx < -5 || sx > w + 5 || sy < -5 || sy > h + 5) continue;
        const tw = 0.5 + Math.sin(world.timeT * 2 + s.tw) * 0.5;
        ctx.globalAlpha = starA * (0.5 + tw * 0.5);
        ctx.fillStyle = s.c;
        ctx.beginPath();
        ctx.arc(sx, sy, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // sun (low altitude) transitions to pale disc
    const sunAlt = Math.min(1, alt / 1800);
    const sunY = 100 - cam.y * 0.03;
    if (sunY < h + 80 && alt < 2400) {
      const sunColor = sunAlt < 0.5 ? '#fff3a0' : '#f6e8ff';
      const glow = sunAlt < 0.5 ? '#ffd86b' : '#ccd8ff';
      // halo
      const haloR = 80;
      const hg = ctx.createRadialGradient(world.sun.x - cam.x * 0.02 + w * 0.7, sunY, 10, world.sun.x - cam.x * 0.02 + w * 0.7, sunY, haloR);
      hg.addColorStop(0, glow + 'cc');
      hg.addColorStop(1, 'rgba(0,0,0,0)');
      const sx = world.sun.x - cam.x * 0.02 + w * 0.35;
      ctx.globalAlpha = 1 - sunAlt * 0.4;
      ctx.fillStyle = hg;
      ctx.fillRect(sx - haloR, sunY - haloR, haloR * 2, haloR * 2);
      ctx.globalAlpha = 1;
      ctx.fillStyle = sunColor;
      ctx.beginPath();
      ctx.arc(sx, sy = sunY, 28, 0, Math.PI * 2);
      ctx.fill();
    }

    // moon at altitude
    if (alt > 400) {
      const moonA = Math.min(1, (alt - 400) / 600);
      const mx = w * 0.15 - cam.x * 0.03;
      const my = 180 - cam.y * 0.08;
      if (my > -100 && my < h + 100) {
        ctx.globalAlpha = moonA;
        ctx.fillStyle = 'rgba(240,240,250,0.9)';
        ctx.beginPath(); ctx.arc(mx % w, my, 22, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(200,210,225,0.6)';
        ctx.beginPath(); ctx.arc(mx % w - 6, my - 3, 5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(mx % w + 5, my + 4, 3, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // distant planets (very high altitude)
    if (alt > 1700) {
      const pA = Math.min(1, (alt - 1700) / 800);
      for (const p of world.planets) {
        const sx = w * 0.5 + (p.x - cam.x) * 0.04;
        const sy = h - 30 + (cam.y - p.y) * 0.08;
        if (sx < -p.r - 10 || sx > w + p.r + 10) continue;
        ctx.globalAlpha = pA;
        const grad = ctx.createRadialGradient(sx - p.r * 0.3, sy - p.r * 0.3, p.r * 0.2, sx, sy, p.r);
        grad.addColorStop(0, p.color);
        grad.addColorStop(1, '#000');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(sx, sy, p.r, 0, Math.PI * 2); ctx.fill();
        if (p.ring) {
          ctx.strokeStyle = 'rgba(255,220,180,' + (0.4 * pA) + ')';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.ellipse(sx, sy, p.r * 1.4, p.r * 0.35, 0.4, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    }

    // distant vault (escaping into orbit). Gets bigger as player nears it.
    if (alt > 1200) {
      const dx = world.vault.x - cam.x;
      const dy = world.vault.y - cam.y;
      const distT = Math.max(0, Math.min(1, (alt - 1200) / 1800));
      const scale = 0.3 + distT * 2.2;
      const vx = w * 0.5 + dx * 0.15;
      const vy = h * 0.4 - dy * 0.15;
      if (vx > -200 && vx < w + 200 && vy > -200 && vy < h + 200) {
        ctx.save();
        ctx.translate(vx, vy);
        ctx.scale(scale, scale);
        // big evil vault silhouette with red eyes
        ctx.fillStyle = '#2a2218';
        ctx.fillRect(-50, -30, 100, 60);
        ctx.fillStyle = '#3a3028';
        ctx.fillRect(-48, -30, 96, 8);
        ctx.fillStyle = '#ff2222';
        const blink = (Math.sin(world.timeT * 3) > 0.9) ? 0 : 1;
        ctx.fillRect(-30, -12, 16, 6 * blink);
        ctx.fillRect(14, -12, 16, 6 * blink);
        ctx.fillStyle = '#100';
        ctx.fillRect(-18, 10, 36, 5);
        // rocket flame
        ctx.fillStyle = '#ff8833';
        ctx.beginPath();
        ctx.moveTo(-20, 30);
        ctx.lineTo(20, 30);
        ctx.lineTo(0, 55 + Math.sin(world.timeT * 18) * 6);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffdd55';
        ctx.beginPath();
        ctx.moveTo(-10, 30);
        ctx.lineTo(10, 30);
        ctx.lineTo(0, 46 + Math.sin(world.timeT * 22) * 3);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }

    // far mountains (shown low altitude)
    if (alt < 900) {
      const mA = Math.max(0, 1 - alt / 900);
      ctx.globalAlpha = mA;
      ctx.fillStyle = '#4a5a6e';
      ctx.beginPath();
      const baseY = h - 140;
      ctx.moveTo(0, h);
      for (const m of world.farHills) {
        const sx = m.x - cam.x * 0.1;
        const nx = ((sx % (w * 4)) + w * 4) % (w * 4);
        if (nx > w + 200) continue;
        ctx.lineTo(nx, baseY - m.h);
      }
      ctx.lineTo(w, h); ctx.closePath(); ctx.fill();

      // mid mountains
      ctx.fillStyle = '#3a4a5e';
      ctx.beginPath();
      const midY = h - 95;
      ctx.moveTo(0, h);
      for (const m of world.midHills) {
        const sx = m.x - cam.x * 0.22;
        const nx = ((sx % (w * 3)) + w * 3) % (w * 3);
        if (nx > w + 100) continue;
        ctx.lineTo(nx, midY - m.h);
      }
      ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Clouds — shaded multi-lobe silhouettes with underside shadow and sun-lit top.
    // 3 parallax layers, each darker/smaller the further back. Each cloud is
    // drawn as 3 passes: shadow (dark underside), body (warm top blending into
    // cool bottom), and a soft highlight pass. Reads as fluffy rather than
    // "procedural blobs."
    if (alt < 1300) {
      const cA = Math.max(0, 1 - alt / 1300);
      const warmTop = alt < 500 ? 'rgba(255, 232, 200, 0.65)' : 'rgba(220, 210, 240, 0.55)';
      for (let layer = 2; layer >= 0; layer--) {
        const plx = 0.35 + layer * 0.22;
        const size = 1 - layer * 0.22;
        const layerAlpha = cA * (0.55 + (2 - layer) * 0.18);
        for (const c of world.farClouds) {
          const cy = h - 40 - (c.y - cam.y) * plx - layer * 60;
          const sxRaw = (c.x - cam.x * plx) + w * 0.5 + layer * 160;
          const nx = ((sxRaw % (w * 3)) + w * 3) % (w * 3) - w * 0.5;
          if (nx < -c.r - 60 || nx > w + c.r + 60) continue;
          if (cy < -c.r || cy > h + c.r) continue;
          const r = c.r * size;
          // 1) drop shadow (darker, offset down-right)
          ctx.globalAlpha = layerAlpha * 0.45;
          ctx.fillStyle = layer === 0 ? 'rgba(120,130,150,1)' : 'rgba(70,80,100,1)';
          ctx.beginPath();
          ctx.arc(nx + 4, cy + 10, r * 1.02, 0, Math.PI * 2);
          ctx.arc(nx + r * 0.6 + 4, cy + 14, r * 0.7, 0, Math.PI * 2);
          ctx.arc(nx - r * 0.5 + 4, cy + 16, r * 0.6, 0, Math.PI * 2);
          ctx.fill();
          // 2) cool underside body
          ctx.globalAlpha = layerAlpha;
          ctx.fillStyle = layer === 0 ? '#b9c7d6' : layer === 1 ? '#9aabc0' : '#7d8ea8';
          ctx.beginPath();
          ctx.arc(nx, cy, r, 0, Math.PI * 2);
          ctx.arc(nx + r * 0.6, cy + 4, r * 0.7, 0, Math.PI * 2);
          ctx.arc(nx - r * 0.5, cy + 6, r * 0.6, 0, Math.PI * 2);
          ctx.arc(nx + r * 0.3, cy - 10, r * 0.5, 0, Math.PI * 2);
          ctx.fill();
          // 3) sun-lit top (lighter cap)
          ctx.globalAlpha = layerAlpha * (layer === 0 ? 1 : 0.75);
          ctx.fillStyle = layer === 0 ? '#ffffff' : layer === 1 ? '#e6ecf3' : '#c7cfda';
          ctx.beginPath();
          ctx.arc(nx, cy - r * 0.35, r * 0.85, 0, Math.PI * 2);
          ctx.arc(nx + r * 0.5, cy - r * 0.15, r * 0.55, 0, Math.PI * 2);
          ctx.arc(nx - r * 0.45, cy - r * 0.2, r * 0.5, 0, Math.PI * 2);
          ctx.fill();
          // 4) warm rim highlight for front layer at low altitude (morning sun)
          if (layer === 0 && alt < 700) {
            ctx.globalAlpha = layerAlpha * 0.6 * (1 - alt / 700);
            ctx.fillStyle = warmTop;
            ctx.beginPath();
            ctx.arc(nx + r * 0.3, cy - r * 0.5, r * 0.4, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      ctx.globalAlpha = 1;
    }

    // ground — visible only when low altitude
    if (alt < 250) {
      const groundY = h - 30 + cam.y;
      if (groundY < h + 40) {
        // grass
        const gY = Math.min(h - 20, groundY);
        ctx.fillStyle = '#355c28';
        ctx.fillRect(0, gY, w, h - gY);
        ctx.fillStyle = '#4a7a30';
        ctx.fillRect(0, gY, w, 5);
        // texture strips
        ctx.fillStyle = '#2a4a20';
        for (let i = 0; i < w; i += 14) {
          ctx.fillRect(i - (cam.x * 0.8) % 14, gY + 8, 4, 2);
        }
      }
    }
  };

  /* Decorative ramp at world-x=0. */
  World.renderRamp = function (ctx, cam, w, h, ramp) {
    const groundY = h - 30 + cam.y;
    if (groundY < -40) return;  // off-screen
    const rx = -cam.x;
    // launch platform
    const rampBase = 80 + ramp * 20;
    ctx.fillStyle = '#5a4030';
    ctx.fillRect(rx + w * 0.5 - 20, groundY - rampBase, 60, rampBase + 20);
    ctx.fillStyle = '#6a5040';
    ctx.fillRect(rx + w * 0.5 - 22, groundY - rampBase - 4, 64, 4);
    // ramp slope
    ctx.fillStyle = '#4a3525';
    ctx.beginPath();
    ctx.moveTo(rx + w * 0.5 + 40, groundY - rampBase);
    ctx.lineTo(rx + w * 0.5 + 140, groundY);
    ctx.lineTo(rx + w * 0.5 + 40, groundY);
    ctx.closePath();
    ctx.fill();
    // stripes
    ctx.strokeStyle = '#ffcc33';
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(rx + w * 0.5 + 50 + i * 15, groundY - rampBase + i * rampBase / 6);
      ctx.lineTo(rx + w * 0.5 + 58 + i * 15, groundY - rampBase + i * rampBase / 6);
      ctx.stroke();
    }
    // shop sign
    if (rx + w * 0.5 > -100 && rx + w * 0.5 < w + 200) {
      ctx.fillStyle = '#3a1f12';
      ctx.fillRect(rx + w * 0.5 - 100, groundY - 60, 60, 40);
      ctx.fillStyle = '#ffcc33';
      ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('WORKSHOP', rx + w * 0.5 - 70, groundY - 40);
    }
  };

})();
