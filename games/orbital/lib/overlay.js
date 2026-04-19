/* Orbital — programmatic tier-overlay renderer.
   The base tower sprite stays the same, we layer increasingly elaborate
   accents on top as the player buys upgrade tiers. This way every tower
   visually "evolves" without authoring 112 unique SVGs.

   Visual language (consistent across every tower):

     pathTier 1   small accent dot/ring at top, in path color
     pathTier 2   accent dot + thin ring around chassis
     pathTier 3   3 chevron spikes (path A: along firing axis
                  path B: in cardinal pattern), thicker accent ring
     pathTier 4   crowning glyph (path A: lance / B: gem) + slow aura

   Path A is "kinetic / aggressive"  — sharp lines, motion-axis spikes
   Path B is "specialist / control"  — gem / cardinal stars

   XP-level chevron pips drawn under the chassis (1, 2, or 3 small pips).

   ALL drawing in canvas state is wrapped in save/restore. */
(function () {
  const NDP = window.NDP;
  const O = NDP.Orbital;

  const PATH_COLOR = {
    A: { core: '#ffd86b', edge: '#ff9055', glow: 'rgba(255,216,107,0.55)' },
    B: { core: '#7ae0ff', edge: '#4fa6ff', glow: 'rgba(122,224,255,0.55)' }
  };

  function tierAccentColor(tower, p) {
    // Tower's own paint takes precedence (set in TOWERS.<key>.paths.<p>.accent)
    const base = O.Towers && O.Towers.catalog[tower.key];
    const accent = base && base.paths[p] && base.paths[p].accent;
    if (!accent) return PATH_COLOR[p];
    // Approximate edge/glow from accent if not explicitly given
    return { core: accent, edge: accent, glow: hexToRgba(accent, 0.5) };
  }

  function hexToRgba(hex, a) {
    const m = hex.replace('#', '');
    const n = m.length === 3
      ? m.split('').map(c => parseInt(c + c, 16))
      : [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
    return `rgba(${n[0]},${n[1]},${n[2]},${a})`;
  }

  // Main draw entrypoint. Call AFTER drawing the base sprite. (x,y) is the
  // tower's center; `angle` is the firing axis (0 if symmetric).
  function drawTierOverlay(ctx, tower, time, opts) {
    const cx = (opts && opts.cx) || tower.x;
    const cy = (opts && opts.cy) || tower.y;
    const angle = (opts && typeof opts.angle === 'number') ? opts.angle : 0;
    const a = tower.pathTiers && tower.pathTiers.A || 0;
    const b = tower.pathTiers && tower.pathTiers.B || 0;

    drawPathOverlay(ctx, cx, cy, angle, 'A', a, time, tower);
    drawPathOverlay(ctx, cx, cy, angle, 'B', b, time, tower);

    // Tier-4 aura on top so it reads above any chassis lines.
    if (a === 4) drawTier4Aura(ctx, cx, cy, 'A', time, tower);
    if (b === 4) drawTier4Aura(ctx, cx, cy, 'B', time, tower);

    // XP pips: small chevron cluster below chassis. Level 1 = none.
    drawXPPips(ctx, cx, cy, tower);
  }

  function drawPathOverlay(ctx, cx, cy, angle, p, tier, time, tower) {
    if (tier <= 0) return;
    const c = tierAccentColor(tower, p);
    ctx.save();

    // Tier 1: small accent dot + soft glow near the top of the chassis.
    if (tier >= 1) {
      const off = p === 'A' ? -22 : 22; // top-left vs top-right
      const gx = cx + off * 0.7, gy = cy - 18;
      ctx.shadowColor = c.glow || c.core;
      ctx.shadowBlur = 6;
      ctx.fillStyle = c.core;
      ctx.strokeStyle = c.edge;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(gx, gy, 3.2, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Tier 2: thin ring around chassis + a small "patch" plate carrying
    // the path's signature glyph so the build is identifiable at a glance.
    if (tier >= 2) {
      ctx.strokeStyle = c.core;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(cx, cy, 22, 0, Math.PI * 2);
      ctx.stroke();
      // Tier badge plate — left side for path A, right for B
      const px = cx + (p === 'A' ? -16 : 16);
      const py = cy + 18;
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#0a0e1a';
      ctx.beginPath();
      ctx.arc(px, py, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = c.core;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      // Tier 'pip' count inside the plate (1 dot at T2, 2 at T3, 3 at T4)
      const pipsCount = Math.min(3, tier - 1);
      ctx.fillStyle = c.core;
      const pipR = 1.3;
      const pipGap = 3.2;
      const pipsW = pipsCount * pipR * 2 + (pipsCount - 1) * (pipGap - pipR * 2);
      const pipStart = px - pipsW / 2 + pipR;
      for (let i = 0; i < pipsCount; i++) {
        ctx.beginPath();
        ctx.arc(pipStart + i * pipGap, py, pipR, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Tier 3: chevron spikes + thicker outer ring + orbiting plate.
    if (tier >= 3) {
      ctx.fillStyle = c.core;
      ctx.strokeStyle = c.edge;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 1;
      if (p === 'A') {
        // Spikes along firing axis (lance feel) with a glow.
        ctx.shadowColor = c.glow || c.core;
        ctx.shadowBlur = 4;
        for (let i = 0; i < 3; i++) {
          const r = 18 + i * 4;
          spike(ctx, cx, cy, angle, r, 6 - i * 1.5);
          ctx.fill(); ctx.stroke();
        }
        ctx.shadowBlur = 0;
      } else {
        // Cardinal star
        for (let i = 0; i < 4; i++) {
          spike(ctx, cx, cy, i * Math.PI / 2 + Math.PI / 4, 22, 4);
          ctx.fill(); ctx.stroke();
        }
      }
      // Thicker outer ring with energy pulse
      ctx.strokeStyle = c.edge;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.5 + Math.sin(time * 3 + (p === 'A' ? 0 : Math.PI)) * 0.2;
      ctx.beginPath();
      ctx.arc(cx, cy, 24, 0, Math.PI * 2);
      ctx.stroke();
      // Orbiting plate — small disc circling the chassis
      const orbAng = time * (p === 'A' ? 1.4 : -1.1) + (p === 'A' ? 0 : Math.PI);
      const ox = cx + Math.cos(orbAng) * 28;
      const oy = cy + Math.sin(orbAng) * 28;
      ctx.globalAlpha = 1;
      ctx.fillStyle = c.core;
      ctx.strokeStyle = '#0a0e1a';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(ox, oy, 3, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      // Trailing dot
      const ox2 = cx + Math.cos(orbAng - 0.4) * 28;
      const oy2 = cy + Math.sin(orbAng - 0.4) * 28;
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.arc(ox2, oy2, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Tier 4: handled by drawTier4Aura
    ctx.restore();
  }

  function drawTier4Aura(ctx, cx, cy, p, time, tower) {
    const c = tierAccentColor(tower, p);
    ctx.save();
    const spin = time * (p === 'A' ? 0.7 : -0.5);
    const breathe = Math.sin(time * 2) * 1.5;
    const r = 28 + breathe;

    // Soft pulsing glow disc — much beefier than before
    ctx.shadowColor = c.glow || c.core;
    ctx.shadowBlur = 18;
    ctx.globalAlpha = 0.22 + Math.sin(time * 3) * 0.06;
    ctx.fillStyle = c.core;
    ctx.beginPath(); ctx.arc(cx, cy, r + 8, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;

    // Rotating spoke ring (blade segments)
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = c.core;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a1 = spin + i * Math.PI / 4;
      const a2 = a1 + Math.PI / 8;
      ctx.moveTo(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r);
      ctx.lineTo(cx + Math.cos(a2) * (r + 5), cy + Math.sin(a2) * (r + 5));
    }
    ctx.stroke();

    // Counter-rotating outer ring (dashed)
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = 0.55;
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.arc(cx, cy, r + 9, -spin * 0.6, -spin * 0.6 + Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Three orbiting energy beads — drift around the aura ring
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff';
    ctx.shadowColor = c.glow || c.core;
    ctx.shadowBlur = 10;
    for (let i = 0; i < 3; i++) {
      const a = spin * 1.4 + i * (Math.PI * 2 / 3);
      const bx = cx + Math.cos(a) * (r + 2);
      const by = cy + Math.sin(a) * (r + 2);
      ctx.beginPath();
      ctx.arc(bx, by, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    // Crown glyph
    if (p === 'A') {
      // Lance pointing in firing-axis direction (or straight up if symmetric)
      const ang = (typeof tower.angle === 'number' && !tower._symmetric) ? tower.angle : -Math.PI / 2;
      ctx.fillStyle = c.core;
      ctx.strokeStyle = c.edge;
      ctx.lineWidth = 1.4;
      ctx.shadowColor = c.glow || c.core;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      const tip = { x: cx + Math.cos(ang) * 34, y: cy + Math.sin(ang) * 34 };
      const left = { x: cx + Math.cos(ang + Math.PI / 2) * 5, y: cy + Math.sin(ang + Math.PI / 2) * 5 };
      const right = { x: cx + Math.cos(ang - Math.PI / 2) * 5, y: cy + Math.sin(ang - Math.PI / 2) * 5 };
      ctx.moveTo(tip.x, tip.y); ctx.lineTo(left.x, left.y); ctx.lineTo(right.x, right.y); ctx.closePath();
      ctx.fill(); ctx.stroke();
      // Energy line down the lance
      ctx.strokeStyle = '#fff';
      ctx.globalAlpha = 0.7 + Math.sin(time * 8) * 0.3;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * 6, cy + Math.sin(ang) * 6);
      ctx.lineTo(cx + Math.cos(ang) * 28, cy + Math.sin(ang) * 28);
      ctx.stroke();
      ctx.shadowBlur = 0;
    } else {
      // Faceted floating gem on top with energy halo
      ctx.shadowColor = c.glow || c.core;
      ctx.shadowBlur = 8;
      ctx.fillStyle = c.core;
      ctx.strokeStyle = c.edge;
      ctx.lineWidth = 1.4;
      const cx2 = cx, cy2 = cy - 30 + Math.sin(time * 2) * 1.5;
      ctx.beginPath();
      ctx.moveTo(cx2, cy2 - 6);
      ctx.lineTo(cx2 + 5, cy2);
      ctx.lineTo(cx2, cy2 + 6);
      ctx.lineTo(cx2 - 5, cy2);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      // Crown points
      ctx.beginPath();
      ctx.moveTo(cx2 - 5, cy2);
      ctx.lineTo(cx2 - 8, cy2 - 4);
      ctx.lineTo(cx2 - 5, cy2 - 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx2 + 5, cy2);
      ctx.lineTo(cx2 + 8, cy2 - 4);
      ctx.lineTo(cx2 + 5, cy2 - 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      // Sparkle cross
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.7 + Math.sin(time * 5) * 0.3;
      ctx.beginPath(); ctx.moveTo(cx2 - 9, cy2); ctx.lineTo(cx2 + 9, cy2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx2, cy2 - 9); ctx.lineTo(cx2, cy2 + 9); ctx.stroke();
    }
    ctx.restore();
  }

  function spike(ctx, cx, cy, angle, baseR, halfWide) {
    const tip = { x: cx + Math.cos(angle) * (baseR + 6), y: cy + Math.sin(angle) * (baseR + 6) };
    const lp = { x: cx + Math.cos(angle + Math.PI / 2) * halfWide + Math.cos(angle) * baseR,
                 y: cy + Math.sin(angle + Math.PI / 2) * halfWide + Math.sin(angle) * baseR };
    const rp = { x: cx + Math.cos(angle - Math.PI / 2) * halfWide + Math.cos(angle) * baseR,
                 y: cy + Math.sin(angle - Math.PI / 2) * halfWide + Math.sin(angle) * baseR };
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y); ctx.lineTo(lp.x, lp.y); ctx.lineTo(rp.x, rp.y); ctx.closePath();
  }

  function drawXPPips(ctx, cx, cy, tower) {
    const lvl = tower.level || 1;
    if (lvl <= 1) return;
    const pips = lvl - 1; // 1 or 2 pips visible
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#0a0e18';
    ctx.lineWidth = 0.8;
    const w = 5, h = 3, gap = 2;
    const totalW = pips * w + (pips - 1) * gap;
    const startX = cx - totalW / 2;
    for (let i = 0; i < pips; i++) {
      const x = startX + i * (w + gap);
      ctx.beginPath();
      ctx.moveTo(x, cy + 24);
      ctx.lineTo(x + w / 2, cy + 22);
      ctx.lineTo(x + w, cy + 24);
      ctx.lineTo(x + w / 2, cy + 26);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
    // XP-up flash
    if (tower._xpFlash > 0) {
      ctx.globalAlpha = tower._xpFlash;
      ctx.strokeStyle = '#ffd86b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 26 + (1 - tower._xpFlash) * 18, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Glyph drawer — small icons used in the upgrade panel. Pure procedural;
  // no SVG cost. id list kept in sync with data/towers.js tier `glyph` keys.
  const GLYPHS = {
    rate(ctx, x, y, s, color) {
      // Lightning bolt
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x - s * 0.2, y - s * 0.6);
      ctx.lineTo(x + s * 0.2, y - s * 0.1);
      ctx.lineTo(x, y - s * 0.05);
      ctx.lineTo(x + s * 0.25, y + s * 0.6);
      ctx.lineTo(x - s * 0.1, y + s * 0.05);
      ctx.lineTo(x + s * 0.05, y);
      ctx.closePath();
      ctx.fill();
    },
    dmg(ctx, x, y, s, color) {
      // Sword/blade
      ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - s * 0.5, y + s * 0.5);
      ctx.lineTo(x + s * 0.4, y - s * 0.4);
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x + s * 0.2, y - s * 0.5); ctx.lineTo(x + s * 0.55, y - s * 0.15); ctx.stroke();
    },
    range(ctx, x, y, s, color) {
      ctx.strokeStyle = color; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(x, y, s * 0.55, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([2, 2]);
      ctx.beginPath(); ctx.arc(x, y, s * 0.32, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill();
    },
    pierce(ctx, x, y, s, color) {
      // Arrow through orb
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, s * 0.3, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - s * 0.6, y); ctx.lineTo(x + s * 0.6, y); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + s * 0.6, y); ctx.lineTo(x + s * 0.4, y - s * 0.18);
      ctx.moveTo(x + s * 0.6, y); ctx.lineTo(x + s * 0.4, y + s * 0.18);
      ctx.stroke();
    },
    splash(ctx, x, y, s, color) {
      // Explosion star
      ctx.fillStyle = color;
      const N = 8;
      ctx.beginPath();
      for (let i = 0; i < N * 2; i++) {
        const r = i % 2 === 0 ? s * 0.55 : s * 0.25;
        const a = (i / (N * 2)) * Math.PI * 2;
        const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill();
    },
    burn(ctx, x, y, s, color) {
      // Flame
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, y + s * 0.55);
      ctx.bezierCurveTo(x - s * 0.55, y + s * 0.2, x - s * 0.4, y - s * 0.2, x - s * 0.05, y - s * 0.55);
      ctx.bezierCurveTo(x + s * 0.05, y - s * 0.25, x + s * 0.5, y - s * 0.1, x + s * 0.45, y + s * 0.25);
      ctx.bezierCurveTo(x + s * 0.4, y + s * 0.5, x, y + s * 0.55, x, y + s * 0.55);
      ctx.fill();
    },
    chain(ctx, x, y, s, color) {
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x - s * 0.2, y, s * 0.25, -Math.PI / 4, Math.PI * 1.25); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + s * 0.2, y, s * 0.25, Math.PI * 0.75, Math.PI * 2.25); ctx.stroke();
    },
    aura(ctx, x, y, s, color) {
      ctx.strokeStyle = color; ctx.lineWidth = 1.4;
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = 1 - i * 0.25;
        ctx.beginPath(); ctx.arc(x, y, s * (0.2 + i * 0.18), 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
    money(ctx, x, y, s, color) {
      ctx.fillStyle = color; ctx.strokeStyle = '#5a4010'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, s * 0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#5a4010';
      ctx.font = 'bold ' + (s * 0.7).toFixed(0) + 'px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('$', x, y);
    },
    homing(ctx, x, y, s, color) {
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(x, y, s * 0.45, Math.PI * 0.2, Math.PI * 1.7);
      ctx.stroke();
      ctx.beginPath();
      const ax = x + Math.cos(Math.PI * 1.7) * s * 0.45;
      const ay = y + Math.sin(Math.PI * 1.7) * s * 0.45;
      ctx.moveTo(ax, ay); ctx.lineTo(ax + 5, ay - 1);
      ctx.moveTo(ax, ay); ctx.lineTo(ax + 1, ay + 5);
      ctx.stroke();
    },
    freeze(ctx, x, y, s, color) {
      ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * s * 0.6, y + Math.sin(a) * s * 0.6);
        ctx.lineTo(x - Math.cos(a) * s * 0.6, y - Math.sin(a) * s * 0.6);
        ctx.stroke();
      }
      // little tick marks
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const r1 = s * 0.4, r2 = s * 0.55;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
        ctx.lineTo(x + Math.cos(a + 0.3) * r2, y + Math.sin(a + 0.3) * r2);
        ctx.stroke();
      }
    },
    stun(ctx, x, y, s, color) {
      ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - s * 0.1, y - s * 0.5);
      ctx.lineTo(x + s * 0.3, y - s * 0.05);
      ctx.lineTo(x + s * 0.05, y - s * 0.05);
      ctx.lineTo(x + s * 0.3, y + s * 0.5);
      ctx.lineTo(x - s * 0.1, y + s * 0.05);
      ctx.lineTo(x + s * 0.15, y + s * 0.05);
      ctx.closePath();
      ctx.fill();
    },
    shield(ctx, x, y, s, color) {
      ctx.fillStyle = color; ctx.strokeStyle = '#0a0e18'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y - s * 0.55);
      ctx.lineTo(x + s * 0.45, y - s * 0.2);
      ctx.lineTo(x + s * 0.4, y + s * 0.35);
      ctx.lineTo(x, y + s * 0.55);
      ctx.lineTo(x - s * 0.4, y + s * 0.35);
      ctx.lineTo(x - s * 0.45, y - s * 0.2);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    },
    burst(ctx, x, y, s, color) {
      // Cluster of dots
      ctx.fillStyle = color;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * s * 0.3, y + Math.sin(a) * s * 0.3, s * 0.15, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath(); ctx.arc(x, y, s * 0.18, 0, Math.PI * 2); ctx.fill();
    },
    crit(ctx, x, y, s, color) {
      // Reticle
      ctx.strokeStyle = color; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, s * 0.45, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - s * 0.6, y); ctx.lineTo(x - s * 0.2, y);
      ctx.moveTo(x + s * 0.2, y); ctx.lineTo(x + s * 0.6, y);
      ctx.moveTo(x, y - s * 0.6); ctx.lineTo(x, y - s * 0.2);
      ctx.moveTo(x, y + s * 0.2); ctx.lineTo(x, y + s * 0.6);
      ctx.stroke();
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill();
    },
    eye(ctx, x, y, s, color) {
      // Camo-detection: eye
      ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - s * 0.55, y);
      ctx.quadraticCurveTo(x, y - s * 0.45, x + s * 0.55, y);
      ctx.quadraticCurveTo(x, y + s * 0.45, x - s * 0.55, y);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, s * 0.18, 0, Math.PI * 2); ctx.fill();
    },
    nuke(ctx, x, y, s, color) {
      // Mushroom cloud silhouette
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y - s * 0.15, s * 0.45, Math.PI * 0.1, Math.PI * 0.9, false);
      ctx.lineTo(x + s * 0.18, y + s * 0.45);
      ctx.lineTo(x - s * 0.18, y + s * 0.45);
      ctx.closePath();
      ctx.fill();
    },
    drone(ctx, x, y, s, color) {
      // Triangular ship
      ctx.fillStyle = color; ctx.strokeStyle = '#0a0e18'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y - s * 0.5);
      ctx.lineTo(x + s * 0.45, y + s * 0.4);
      ctx.lineTo(x, y + s * 0.2);
      ctx.lineTo(x - s * 0.45, y + s * 0.4);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    },
    mine(ctx, x, y, s, color) {
      ctx.fillStyle = color; ctx.strokeStyle = '#0a0e18'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, s * 0.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      // Spikes
      ctx.strokeStyle = color; ctx.lineWidth = 1.8;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * s * 0.4, y + Math.sin(a) * s * 0.4);
        ctx.lineTo(x + Math.cos(a) * s * 0.6, y + Math.sin(a) * s * 0.6);
        ctx.stroke();
      }
    },
    time(ctx, x, y, s, color) {
      // Clock face + hand
      ctx.strokeStyle = color; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, s * 0.5, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x, y - s * 0.4);
      ctx.moveTo(x, y); ctx.lineTo(x + s * 0.3, y);
      ctx.stroke();
    },
    star(ctx, x, y, s, color) {
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? s * 0.55 : s * 0.22;
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill();
    }
  };

  function drawGlyph(ctx, id, x, y, size, color) {
    const fn = GLYPHS[id] || GLYPHS.crit;
    ctx.save();
    fn(ctx, x, y, size, color);
    ctx.restore();
  }

  function pathColor(p) { return PATH_COLOR[p] || PATH_COLOR.A; }

  O.Overlay = {
    drawTierOverlay,
    drawXPPips,
    drawGlyph,
    pathColor,
    GLYPHS
  };
})();
