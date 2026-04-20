/* Switchboard — visual layout + click-drag jack routing.
   Pure rendering + input helpers. Owns no game state beyond the cables
   struct we pass in. The game logic (nights.js) tells us which lines are
   ringing and which are listened-to, and asks us for the player's current
   connections.

   Hotel Cascadia changes from the original 418 Linden board:
   - Board grows by night: makeBoard(lineCount) — N1=6, N2=8, N3=10, N4=12.
   - Brass header reads HOTEL CASCADIA — FLOOR ZERO.
   - Painted-over window background panel (escalation > 0.25 starts to flake).
   - Wallpaper sag panel (escalation > 0.5 reveals dried-red script).
   - ARCHIVED stamp on a directory entry once per night (state.archivedEntry +
     state.archivedShownAt — set by nights.js).
   - 3:14 AM dim: when state.architectWindowActive, non-architect lit lamps
     dim to 35% so the single architect lamp stands out.
   - Leaky scramble: per-call leakWords[] indices stay legible while the
     player isn't holding L. Words not on the leak list become · dots.
   - Voice tag badge on the caller card shows VOICES[voice].room. */
(function () {
  const NDP = window.NDP;
  const SB = (NDP.switchboard = NDP.switchboard || {});

  const W = 960, H = 600;
  const SOCK_R = 14;
  const JACK_R = 10;
  const MAX_LINE_COUNT = 12;            // largest panel we ever render

  /* Layout: two rows of <lineCount> sockets (top = incoming calls, bottom =
     outgoing destinations). Four cables start parked at the bottom of the
     board. Spacing scales with lineCount so a 6-line N1 panel feels small
     and a 12-line N4 panel feels crowded. */
  function makeBoard(lineCount) {
    const lc = Math.max(2, Math.min(MAX_LINE_COUNT, lineCount || 6));
    const topY = 120, botY = 300;
    const margin = 70;
    const spacing = (W - margin * 2) / (lc - 1);
    const sockets = [];
    for (let i = 0; i < lc; i++) {
      sockets.push({ side: 'in',  line: i + 1, x: margin + i * spacing, y: topY });
    }
    for (let i = 0; i < lc; i++) {
      sockets.push({ side: 'out', line: i + 1, x: margin + i * spacing, y: botY });
    }
    const cables = [];
    const parkedX = 180;
    const parkedY = 520;
    const pxSpace = 150;
    for (let i = 0; i < 4; i++) {
      cables.push({
        id: i,
        a: { parked: true, x: parkedX + i * pxSpace, y: parkedY },
        b: { parked: true, x: parkedX + i * pxSpace + 24, y: parkedY }
      });
    }
    return { sockets, cables, topY, botY, lineCount: lc };
  }

  function pickJack(board, mx, my) {
    for (const c of board.cables) {
      for (const end of ['a', 'b']) {
        const p = c[end];
        if (Math.hypot(mx - p.x, my - p.y) < JACK_R + 2) return { cable: c, end };
      }
    }
    return null;
  }

  function pickSocket(board, x, y) {
    let best = null, bestD = SOCK_R * 2;
    for (const s of board.sockets) {
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }

  function attachJackTo(jack, socket) {
    jack.parked = false;
    jack.x = socket.x; jack.y = socket.y;
    jack.socket = socket;
  }
  function detachJack(jack) { jack.socket = null; }

  function getRoute(board, incomingLine) {
    for (const c of board.cables) {
      const ins = [c.a, c.b].find(e => e.socket && e.socket.side === 'in'  && e.socket.line === incomingLine);
      const outs = [c.a, c.b].find(e => e.socket && e.socket.side === 'out');
      if (ins && outs) return outs.socket.line;
    }
    return null;
  }

  /* Render the board. `state` carries ringing/active flags + directory +
     the new Cascadia overlays (painted window, wallpaper sag, ARCHIVED
     stamp, architect-window dim, composure-flicker clock). */
  function render(ctx, board, state) {
    const escal = state.escalation || 0;

    // Wooden panel background — slight color drift toward sickly green-grey
    // as escalation climbs.
    const grd = ctx.createLinearGradient(0, 0, 0, H);
    const top = lerpColor('#2a1a0e', '#1a1c12', escal);
    const bot = lerpColor('#17100a', '#0a0c0a', escal);
    grd.addColorStop(0, top); grd.addColorStop(1, bot);
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);

    // Wallpaper-stripes back layer, behind the brass — gives the office
    // some texture and lets the wallpaper sag panel "peel" off it later.
    drawWallpaper(ctx, escal, state);

    // Painted-over window — sits behind the socket inset, top-left corner.
    drawPaintedWindow(ctx, escal, state);

    // Brass header / frame
    ctx.fillStyle = '#3a2a18'; ctx.fillRect(0, 0, W, 28);
    const headerFlicker = (Math.random() < 0.005 + escal * 0.05) ? 0.35 : 1;
    ctx.globalAlpha = headerFlicker;
    ctx.fillStyle = '#c7a35a'; ctx.font = 'bold 14px ui-monospace, monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    // Header text — normally the venue name, but the jumpscare director
    // can override briefly with gaslighting strings.
    const headerText = state.headerOverride || 'HOTEL CASCADIA — FLOOR ZERO';
    if (state.headerOverride) {
      ctx.fillStyle = '#ff6644';
    }
    ctx.fillText(headerText, 16, 14);
    ctx.textAlign = 'right';
    ctx.fillText(state.hudRight || '', W - 16, 14);
    ctx.globalAlpha = 1;

    // Composure-flicker clock — drifts year backwards when composure < 25.
    drawClock(ctx, state);

    // Socket panel inset
    ctx.fillStyle = '#1f140a';
    ctx.fillRect(40, 80, W - 80, 260);
    ctx.strokeStyle = '#6a4a20'; ctx.lineWidth = 2;
    ctx.strokeRect(40.5, 80.5, W - 80, 260);

    // Labels
    ctx.fillStyle = '#a58a5a'; ctx.font = '11px ui-monospace, monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('INCOMING', 50, 120);
    ctx.fillText('OUTGOING', 50, 300);

    // V3: oil-lamp light cone — soft warm glow falling on the socket panel
    // from a hanging lamp above the board. Dust motes drift through it.
    drawLightCone(ctx);

    // Sockets — V1 makes the ringing lamps actually feel alive: a halo
    // glow around the lamp, a brass-rim highlight, an ambient pulse on the
    // entire socket plate, and an architect lamp that pulses out-of-phase.
    const archDim = !!state.architectWindowActive;
    const archCall = state.focused && state.focused.architect ? state.focused : null;
    const archLine = archCall ? archCall.line : null;
    for (const s of board.sockets) {
      const ringing = s.side === 'in' && state.ringing.has(s.line);
      const answered = s.side === 'in' && state.active.has(s.line);
      const isArchitectLamp = ringing && state.ringing.get(s.line) && state.ringing.get(s.line).architect;
      // Dim non-architect lit lamps when the architect window is open.
      const dim = archDim && (ringing || answered) && !isArchitectLamp && s.line !== archLine ? 0.30 : 1.0;

      ctx.save();
      ctx.globalAlpha = dim;

      // Ringing halo first (behind the socket) — V1.
      if (ringing) {
        const phase = isArchitectLamp ? state.time * 6 + Math.PI : state.time * 11;
        const intensity = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(phase));
        const glowColor = isArchitectLamp ? '255,85,68' : '255,204,80';
        const grd = ctx.createRadialGradient(s.x, s.y, 4, s.x, s.y, 38);
        grd.addColorStop(0, `rgba(${glowColor},${(0.55 * intensity).toFixed(2)})`);
        grd.addColorStop(0.6, `rgba(${glowColor},${(0.18 * intensity).toFixed(2)})`);
        grd.addColorStop(1, `rgba(${glowColor},0)`);
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(s.x, s.y, 38, 0, Math.PI * 2); ctx.fill();
      }

      // Socket well — dark cup with a brass rim. The rim picks up halo
      // colour when ringing, like real polished brass under a hot bulb.
      ctx.fillStyle = '#0a0604';
      ctx.beginPath(); ctx.arc(s.x, s.y, SOCK_R, 0, Math.PI * 2); ctx.fill();
      const rimColor = ringing
        ? (isArchitectLamp ? '#ff8866' : '#e6c068')
        : '#6a4a20';
      ctx.strokeStyle = rimColor; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(s.x, s.y, SOCK_R, 0, Math.PI * 2); ctx.stroke();

      if (ringing) {
        const pulse = 1 + Math.sin(state.time * 10) * 0.3;
        ctx.strokeStyle = isArchitectLamp ? '#ff5544' : '#ffcc33';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(s.x, s.y, SOCK_R + 4 + pulse * 2, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = isArchitectLamp ? '#ff5544' : '#ffcc33';
        ctx.beginPath(); ctx.arc(s.x, s.y - 26, 4, 0, Math.PI * 2); ctx.fill();
      }
      if (answered) {
        ctx.fillStyle = '#6cf';
        ctx.beginPath(); ctx.arc(s.x, s.y - 26, 4, 0, Math.PI * 2); ctx.fill();
      }
      // Ghost lamp on later nights — purely cosmetic dread.
      if (!ringing && !answered && s.side === 'in' && escal > 0.25) {
        const seed = (s.line * 911 + Math.floor(state.time * 0.7)) % 997;
        if (seed < Math.floor(escal * 6)) {
          const ghost = 0.25 + 0.5 * Math.abs(Math.sin(state.time * 13 + s.line));
          ctx.fillStyle = `rgba(216,74,72,${ghost.toFixed(2)})`;
          ctx.beginPath(); ctx.arc(s.x, s.y - 26, 3, 0, Math.PI * 2); ctx.fill();
        }
      }
      // Number label
      ctx.fillStyle = '#8a6a3a';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = 'bold 10px ui-monospace, monospace';
      ctx.fillText(String(s.line), s.x, s.y + (s.side === 'in' ? -40 : 42));

      ctx.restore();
    }

    // V1: lamp-pulse halos — fading rings spawned by game.js when a lamp
    // goes out (correct/wrong/missed/denied). Radiate outward, fade to 0.
    if (state.lampPulses && state.lampPulses.length) {
      for (const p of state.lampPulses) {
        const k = p.t / p.max;            // 0..1
        if (k >= 1) continue;
        const r = 16 + k * 38;
        const a = (1 - k) * 0.55;
        const col = hexToRgb(p.color || '#ffcc33');
        ctx.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${a.toFixed(2)})`;
        ctx.lineWidth = 2 * (1 - k * 0.6);
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
        // Inner shimmer dot
        ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${(a * 0.7).toFixed(2)})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, 3 * (1 - k), 0, Math.PI * 2); ctx.fill();
      }
    }

    // V2: cable physics — proper catenary sag, sway with idle time, snap
    // emphasis on freshly plugged cables (parkAt timer set by game.js).
    drawCables(ctx, board, state, escal);

    // Directory card (with ARCHIVED stamp + NEW LINE markers)
    drawDirectory(ctx, state);

    // Current caller card (with leaky scramble + voice tag badge)
    drawCallerCard(ctx, state);

    // Composure meter
    drawComposure(ctx, state);

    // V3: dust motes drifting through the oil-lamp light cone above the
    // board. Drawn after the panel + lamps so they sit in front. Tiny.
    if (state.dustMotes && state.dustMotes.length) {
      ctx.save();
      for (const m of state.dustMotes) {
        const k = m.life / m.max;
        const a = Math.sin(k * Math.PI) * 0.55;     // fade in then out
        ctx.fillStyle = `rgba(255,228,170,${a.toFixed(2)})`;
        ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    // Faint scanlines + vignette intensify with escalation.
    if (escal > 0) {
      ctx.save();
      ctx.globalAlpha = 0.08 + escal * 0.10;
      ctx.fillStyle = '#000';
      for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
      ctx.restore();
    }
    if (escal > 0.5 && Math.random() < 0.005 * escal) {
      ctx.fillStyle = `rgba(216,74,72,${(0.05 + escal * 0.10).toFixed(2)})`;
      ctx.fillRect(0, 0, W, H);
    }

    // Architect-window vignette — a heavy red breath while 3:14 is open.
    if (archDim) {
      const t = (state.time * 0.6) % (Math.PI * 2);
      const a = 0.10 + 0.06 * Math.sin(t);
      ctx.fillStyle = `rgba(60,12,16,${a.toFixed(2)})`;
      ctx.fillRect(0, 0, W, H);
    }

    // V3: corner vignette — a soft dark gradient hugging the canvas edges
    // so the office feels lit by a single overhead lamp instead of a flat
    // floodlight. Always on, intensifies with escalation.
    drawVignette(ctx, escal, archDim);
  }

  /* V3: oil-lamp light cone falling on the socket panel. A faint warm
     ellipse with soft edges, anchored above-center so the lamps below
     read as "lit by the same hanging bulb." */
  function drawLightCone(ctx) {
    ctx.save();
    const cx = W / 2, cy = 220;
    const grd = ctx.createRadialGradient(cx, cy - 90, 30, cx, cy, 320);
    grd.addColorStop(0, 'rgba(255,210,140,0.10)');
    grd.addColorStop(0.5, 'rgba(255,180,100,0.04)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  /* V3: corner vignette. Two layered radial gradients — one warm-dark
     (always on), one red-dark that strengthens when the architect window
     is active so 3:14 feels physically heavier. */
  function drawVignette(ctx, escal, archDim) {
    ctx.save();
    const grd = ctx.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 680);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, `rgba(0,0,0,${(0.55 + escal * 0.20).toFixed(2)})`);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);
    if (archDim) {
      const grd2 = ctx.createRadialGradient(W / 2, H / 2, 100, W / 2, H / 2, 600);
      grd2.addColorStop(0, 'rgba(0,0,0,0)');
      grd2.addColorStop(1, 'rgba(80,8,12,0.45)');
      ctx.fillStyle = grd2;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  /* V2: cables. Proper catenary sag based on the slack between endpoints,
     plus an idle sway phase per cable. Newly-plugged cables (cable.parkAt
     set in the immediate future) get a brief snap pop — a quick brighter
     stroke for the first 200ms. Parked cables draw as a tight little arc
     in their dock so they read as "rope coiled." */
  function drawCables(ctx, board, state, escal) {
    for (const c of board.cables) {
      const baseColor = c.color || '#d84a48';
      const color = lerpColor(baseColor, '#5a1010', escal * 0.7);
      const ax = c.a.x, ay = c.a.y, bx = c.b.x, by = c.b.y;
      const dx = bx - ax, dy = by - ay;
      const dist = Math.hypot(dx, dy);
      // Slack proportional to distance, with a generous baseline so even
      // short cables visibly sag. Sway slightly with time.
      const slack = Math.min(160, 30 + dist * 0.35);
      const sway = Math.sin(state.time * 1.2 + c.id * 1.7) * (4 + 4 * escal);
      const midX = (ax + bx) / 2 + sway * 0.4;
      const midY = Math.max(ay, by) + slack;
      // Snap pop — a freshly-routed cable that's about to park gets a
      // brief brighter halo for the first 0.18s of its 0.4s park timer.
      const snapAge = (c.parkAt != null && state.t != null) ? (c.parkAt - state.t) : null;
      if (snapAge != null && snapAge > 0.22) {
        ctx.save();
        ctx.strokeStyle = '#ffec7a';
        ctx.lineWidth = 6;
        ctx.globalAlpha = (snapAge - 0.22) / 0.18 * 0.5;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.quadraticCurveTo(midX, midY, bx, by);
        ctx.stroke();
        ctx.restore();
      }
      // Outer dark stroke — gives the cable some weight.
      ctx.strokeStyle = '#1a0808';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo(midX, midY, bx, by);
      ctx.stroke();
      // Inner cable colour.
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo(midX, midY, bx, by);
      ctx.stroke();
      // Specular highlight along the top of the curve.
      ctx.strokeStyle = `rgba(255,200,170,${(0.20 - escal * 0.10).toFixed(2)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ax + 1, ay - 1);
      ctx.quadraticCurveTo(midX, midY - 2, bx + 1, by - 1);
      ctx.stroke();
      // Brass jacks at each end.
      for (const end of ['a', 'b']) {
        const j = c[end];
        ctx.fillStyle = '#3a2818';
        ctx.beginPath(); ctx.arc(j.x, j.y + 1, JACK_R, 0, Math.PI * 2); ctx.fill();
        const jg = ctx.createRadialGradient(j.x - 3, j.y - 3, 1, j.x, j.y, JACK_R + 2);
        jg.addColorStop(0, '#ffe9a8');
        jg.addColorStop(0.6, '#c79b3e');
        jg.addColorStop(1, '#5a3a14');
        ctx.fillStyle = jg;
        ctx.beginPath(); ctx.arc(j.x, j.y, JACK_R, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#3a2a18'; ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
  }

  function hexToRgb(s) {
    return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
  }

  /* V6: painted-over window in the office. Sits top-left. Painted black.
     Flakes start at escal > 0.45. The corridor sliver is the architect
     set-piece — normally only at escal > 0.85, but it forces itself open
     whenever the 3:14 architect window is active regardless of night. */
  function drawPaintedWindow(ctx, escal, state) {
    const wx = 50, wy = 36, ww = 120, wh = 40;        // tucked behind header
    const archActive = !!state.architectWindowActive;
    ctx.save();
    // Sash frame
    ctx.fillStyle = '#3a2018'; ctx.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
    // Painted black
    ctx.fillStyle = '#0a0608'; ctx.fillRect(wx, wy, ww, wh);
    // Flake — small irregular cracks of off-white showing through
    if (escal > 0.45) {
      const flakeAmt = Math.min(1, (escal - 0.45) / 0.55);
      ctx.fillStyle = `rgba(220,210,180,${(0.22 * flakeAmt).toFixed(2)})`;
      for (let i = 0; i < Math.floor(8 * flakeAmt); i++) {
        const fx = wx + (i * 17) % (ww - 12);
        const fy = wy + ((i * 11) % (wh - 6));
        ctx.fillRect(fx, fy, 3 + (i % 4), 1 + (i % 3));
      }
    }
    // Sliver of foreign corridor. Always faint at escal>0.85, slams open
    // whenever the architect's window is active (3:14 AM).
    const baseSlv = escal > 0.85 ? Math.min(1, (escal - 0.85) / 0.15) : 0;
    const slv = archActive ? Math.max(baseSlv, 0.95) : baseSlv;
    if (slv > 0) {
      // Warm yellow corridor glow seeping through a vertical sliver.
      const flick = 0.55 + 0.45 * Math.sin(state.time * (archActive ? 6 : 2.3));
      const sliverX = wx + 4, sliverY = wy + 6, sliverW = archActive ? 12 : 6, sliverH = wh - 10;
      const grd = ctx.createLinearGradient(sliverX, 0, sliverX + sliverW, 0);
      grd.addColorStop(0, `rgba(255,210,150,${(0.85 * slv * flick).toFixed(2)})`);
      grd.addColorStop(1, `rgba(180,80,40,${(0.20 * slv).toFixed(2)})`);
      ctx.fillStyle = grd;
      ctx.fillRect(sliverX, sliverY, sliverW, sliverH);
      // Silhouette of a coat folded on a chair, just a hint of shape.
      if (archActive) {
        ctx.fillStyle = 'rgba(20,8,4,0.65)';
        ctx.fillRect(sliverX + 2, sliverY + sliverH - 12, 8, 8);
      }
    }
    ctx.restore();
  }

  /* Wallpaper striped back layer + sag panel. The sag reveals dried-red
     writing on Night 4+, persistent on Night 5. */
  function drawWallpaper(ctx, escal, state) {
    // Striped wall slats behind everything
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = '#5a3030';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 22) {
      ctx.beginPath(); ctx.moveTo(x, 28); ctx.lineTo(x, H); ctx.stroke();
    }
    ctx.restore();

    // Sag panel emerges at escal > 0.5 (Night 3+)
    if (escal > 0.45) {
      const sagAmt = Math.min(1, (escal - 0.45) / 0.55);
      const sx = W - 180, sy = 88, sw = 130, sh = 200;
      ctx.save();
      // Sagging wallpaper outline
      ctx.fillStyle = `rgba(40,18,18,${(0.55 * sagAmt).toFixed(2)})`;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + sw, sy);
      ctx.lineTo(sx + sw, sy + sh - 10);
      ctx.quadraticCurveTo(sx + sw / 2, sy + sh + 14 * sagAmt, sx, sy + sh - 10);
      ctx.closePath();
      ctx.fill();
      // Dried red script revealed on N4+ (escal >= 0.75), persistent on N5
      if (escal >= 0.7) {
        const txtAmt = Math.min(1, (escal - 0.7) / 0.30);
        ctx.fillStyle = `rgba(168,24,28,${(0.85 * txtAmt).toFixed(2)})`;
        ctx.font = 'italic bold 11px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('THE STAIRS GO DOWN FOREVER', sx + sw / 2, sy + sh - 30);
      }
      ctx.restore();
    }
  }

  /* V6: in-game wall clock above the board. Brass-rimmed circle with the
     time/year underneath. Year flickers backward when composure < 25. The
     clock pulses red and the second-hand jitters when the architect's
     3:14 window is active. */
  function drawClock(ctx, state) {
    const cx = W / 2, cy = 52;
    let label = state.clockLabel || '3:14 AM — 1986';
    const compPct = (state.composure || 0) / (state.composureMax || 1);
    const archActive = !!state.architectWindowActive;
    if (compPct < 0.25) {
      const flick = Math.floor(state.time * 4) % 6;
      const years = ['1986', '1973', '1956', '1986', '1956', '1986'];
      label = `3:14 AM — ${years[flick]}`;
    }
    ctx.save();
    // Brass disc
    const r = 14;
    const grd = ctx.createRadialGradient(cx - 4, cy - 4, 1, cx, cy, r + 2);
    grd.addColorStop(0, '#f0d180');
    grd.addColorStop(0.7, '#a87830');
    grd.addColorStop(1, '#3a2410');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(cx - 64, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#1a0c04'; ctx.lineWidth = 1.5;
    ctx.stroke();
    // Tick marks at 12/3/6/9
    ctx.strokeStyle = '#1a0c04'; ctx.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      const inner = i % 3 === 0 ? r - 4 : r - 2.5;
      ctx.beginPath();
      ctx.moveTo(cx - 64 + Math.cos(a) * inner, cy + Math.sin(a) * inner);
      ctx.lineTo(cx - 64 + Math.cos(a) * (r - 1), cy + Math.sin(a) * (r - 1));
      ctx.stroke();
    }
    // Hands fixed at 3:14 (canonical), with second hand jittering when
    // 3:14 is "now". Otherwise a gentle ticking sweep.
    const minH = -Math.PI / 2 + (14 / 60) * Math.PI * 2;     // minute hand
    const hrH  = -Math.PI / 2 + (3 / 12) * Math.PI * 2 + ((14 / 60) * Math.PI / 6);
    ctx.strokeStyle = '#0a0604'; ctx.lineCap = 'round';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx - 64, cy);
    ctx.lineTo(cx - 64 + Math.cos(hrH) * (r - 6), cy + Math.sin(hrH) * (r - 6)); ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx - 64, cy);
    ctx.lineTo(cx - 64 + Math.cos(minH) * (r - 3), cy + Math.sin(minH) * (r - 3)); ctx.stroke();
    // Second hand — frantic during the architect window, calm otherwise.
    const secH = archActive
      ? -Math.PI / 2 + ((Math.floor(state.time * 6) % 60) / 60) * Math.PI * 2
      : -Math.PI / 2 + ((Math.floor(state.time * 1) % 60) / 60) * Math.PI * 2;
    ctx.strokeStyle = archActive ? '#ff5544' : '#a82828'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx - 64, cy);
    ctx.lineTo(cx - 64 + Math.cos(secH) * (r - 2), cy + Math.sin(secH) * (r - 2)); ctx.stroke();
    ctx.lineCap = 'butt';

    // Label to the right of the clock face.
    ctx.fillStyle = archActive ? '#ff5544' : (compPct < 0.25 ? '#ff5050' : '#c7a35a');
    ctx.font = '11px ui-monospace, monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(label, cx - 40, cy);
    ctx.restore();
  }

  function lerpColor(a, b, t) {
    t = Math.max(0, Math.min(1, t));
    const pa = hex(a), pb = hex(b);
    const r = Math.round(pa[0] + (pb[0] - pa[0]) * t);
    const g = Math.round(pa[1] + (pb[1] - pa[1]) * t);
    const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
  }
  function hex(s) {
    return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
  }

  function drawDirectory(ctx, state) {
    const x = W - 260, y = 360, w = 240, h = 220;
    ctx.fillStyle = '#f4e6c4';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#6a4a20'; ctx.lineWidth = 2;
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    ctx.fillStyle = '#3a2010';
    ctx.font = 'bold 13px ui-monospace, monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('DIRECTORY', x + 10, y + 10);
    ctx.font = '11px ui-monospace, monospace';
    let dy = y + 32;
    const entries = Object.entries(state.directory || {});
    const newLines = state.newLines || [];                  // names of just-installed lines this night
    const archivedEntry = state.archivedEntry;
    const archivedT = state.archivedAge;                    // seconds since stamp shown, may be null
    const dirGlitch = state.dirOverride;
    for (const [name, line] of entries) {
      const isArchived = archivedEntry === name && state.archivedShown;
      const isNew = newLines.includes(name);
      const isGlitched = dirGlitch && dirGlitch.originalKey === name;
      ctx.fillStyle = isGlitched ? '#8a1414' : '#3a2010';
      ctx.font = isGlitched
        ? 'bold 11px ui-monospace, monospace'
        : '11px ui-monospace, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(isGlitched ? dirGlitch.name : name, x + 10, dy);
      ctx.textAlign = 'right';
      ctx.fillText(isGlitched ? '??' : String(line), x + w - 10, dy);
      // ARCHIVED stamp — red, slightly rotated, fades after 4s, ghost remains
      if (isArchived) {
        const fresh = archivedT != null && archivedT < 4;
        const a = fresh ? 0.85 : 0.18;
        ctx.save();
        ctx.translate(x + w / 2, dy + 6);
        ctx.rotate(-0.08);
        ctx.fillStyle = `rgba(168,24,28,${a.toFixed(2)})`;
        ctx.font = 'bold 11px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('ARCHIVED', 0, 0);
        // Stamp box
        ctx.strokeStyle = `rgba(168,24,28,${a.toFixed(2)})`;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-44, -7, 88, 14);
        ctx.restore();
      }
      // NEW LINE INSTALLED — small gold tag for the duration of the night
      if (isNew) {
        ctx.save();
        ctx.fillStyle = 'rgba(199,163,90,0.30)';
        ctx.fillRect(x + w - 36, dy - 1, 4, 13);
        ctx.fillStyle = '#a58a5a';
        ctx.font = '8px ui-monospace, monospace';
        ctx.textAlign = 'right';
        ctx.fillText('NEW', x + w - 22, dy + 1);
        ctx.restore();
      }
      dy += 15;
    }
  }

  /* V5: caller card as a tilted paper request slip pinned under a brass
     clip on the operator's desk. Wax-seal "room badge" with the caller's
     room number. Holding L brings the slip under the desk lamp — full
     opacity, warmer paper colour. Otherwise it's dimmer with leaky-
     scramble dots in place of the spoken text. */
  function drawCallerCard(ctx, state) {
    const cx = 240, cy = 470;     // pivot of the paper slip
    const w = 340, h = 220;
    const tilt = -0.035;          // slight counter-clockwise lean

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tilt);

    const lean = !!state.listening;

    // Drop shadow
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    roundRect(ctx, -w / 2 + 6, -h / 2 + 8, w, h, 4);
    ctx.fill();

    // Paper — warm cream when leaning in, cooler/dimmer otherwise.
    const paperGrd = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    if (lean) {
      paperGrd.addColorStop(0, '#f5e7c4');
      paperGrd.addColorStop(1, '#d8c08a');
    } else {
      paperGrd.addColorStop(0, '#a89674');
      paperGrd.addColorStop(1, '#7c684a');
    }
    ctx.fillStyle = paperGrd;
    roundRect(ctx, -w / 2, -h / 2, w, h, 4);
    ctx.fill();

    // Subtle paper grain (random-ish dots seeded by position so it's stable)
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#3a2410';
    for (let i = 0; i < 80; i++) {
      const px = -w / 2 + ((i * 73) % w);
      const py = -h / 2 + ((i * 41) % h);
      ctx.fillRect(px, py, 1, 1);
    }
    ctx.restore();

    // Top brass clip — clamps the paper from above.
    ctx.fillStyle = '#5a3a14';
    roundRect(ctx, -38, -h / 2 - 14, 76, 22, 3);
    ctx.fill();
    const clipGrd = ctx.createLinearGradient(0, -h / 2 - 14, 0, -h / 2 + 8);
    clipGrd.addColorStop(0, '#f0d180');
    clipGrd.addColorStop(0.5, '#c79b3e');
    clipGrd.addColorStop(1, '#7a5418');
    ctx.fillStyle = clipGrd;
    roundRect(ctx, -34, -h / 2 - 12, 68, 18, 3);
    ctx.fill();
    ctx.strokeStyle = '#3a2410'; ctx.lineWidth = 1;
    roundRect(ctx, -34, -h / 2 - 12, 68, 18, 3);
    ctx.stroke();

    const x = -w / 2 + 16, y = -h / 2 + 14;
    const innerW = w - 32;

    // Header — small caps, dim ink.
    ctx.fillStyle = lean ? '#3a2410' : '#251608';
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('REQUEST SLIP', x, y);

    const call = state.focused;
    if (!call) {
      ctx.fillStyle = lean ? '#5a4214' : '#3a2810';
      ctx.font = 'italic 12px ui-monospace, monospace';
      ctx.fillText('(no active call — click a ringing lamp)', x, y + 24);
      const pulse = 0.55 + 0.45 * Math.sin(state.time * 4);
      ctx.fillStyle = `rgba(58,40,16,${pulse.toFixed(3)})`;
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.fillText('[L]  hold to lean in — story is in the calls', x, y + h - 36);
      ctx.restore();
      return;
    }
    const profile = SB.VOICES[call.voice] || {};

    // Caller name — typewriter ink.
    ctx.fillStyle = '#1f1208';
    ctx.font = 'bold 17px Georgia, "Times New Roman", serif';
    ctx.fillText(profile.name || call.voice, x, y + 22);

    // Wax seal — circular reddish-brown disk with the room number stamped
    // into it. Sits on the right edge, slightly hanging off the slip.
    if (profile.room) {
      const sx = w / 2 - 38, sy = -h / 2 + 30;
      const sealGrd = ctx.createRadialGradient(sx - 4, sy - 4, 2, sx, sy, 22);
      sealGrd.addColorStop(0, '#a82828');
      sealGrd.addColorStop(0.7, '#741414');
      sealGrd.addColorStop(1, '#3a0808');
      ctx.fillStyle = sealGrd;
      ctx.beginPath(); ctx.arc(sx, sy, 22, 0, Math.PI * 2); ctx.fill();
      // Drip at bottom
      ctx.beginPath();
      ctx.moveTo(sx - 6, sy + 18);
      ctx.quadraticCurveTo(sx, sy + 30, sx + 6, sy + 18);
      ctx.fill();
      ctx.fillStyle = 'rgba(20,4,4,0.8)';
      ctx.font = 'bold 9px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      // Strip the word "room" — keep the number/floor designation only.
      const stamp = String(profile.room).replace(/\broom\s*/i, '').toUpperCase();
      ctx.fillText(stamp, sx, sy);
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    }

    // Routing line — "on line N → wants: …"
    ctx.fillStyle = '#3a2410';
    ctx.font = '12px ui-monospace, monospace';
    ctx.fillText('on line ' + call.line + (call.request ? '  →  wants: ' + call.request : ''), x, y + 50);

    // A horizontal rule under the metadata.
    ctx.strokeStyle = 'rgba(58,36,16,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y + 70); ctx.lineTo(x + innerW, y + 70); ctx.stroke();

    // Spoken text — full-bright when leaning in, leaky-scramble otherwise.
    const callId = call.idx != null && state.currentNight
      ? `n${state.currentNight}_c${call.idx}`
      : null;
    const transcript = (callId && SB.Voices && SB.Voices.getTranscript)
      ? SB.Voices.getTranscript(callId)
      : null;
    const spoken = transcript || call.text || '';
    if (state.cardOverride) {
      // Jumpscare override — the slip momentarily shows a different
      // message in dark red. Reads as the paper itself glitching.
      ctx.fillStyle = '#8a1414';
      ctx.font = 'bold 16px Georgia, "Times New Roman", serif';
      wrapText(ctx, state.cardOverride, x, y + 84, innerW, 20);
    } else {
      ctx.fillStyle = lean ? '#1a0a04' : '#46341a';
      ctx.font = lean
        ? '13px Georgia, "Times New Roman", serif'
        : '13px Georgia, "Times New Roman", serif';
      const display = lean ? '"' + spoken + '"' : '"' + leakyScramble(spoken, call.leakWords) + '"';
      wrapText(ctx, display, x, y + 84, innerW, 17);
    }

    // Listen hint — pulses gently while not leaning in.
    const pulse = lean ? 1.0 : (0.55 + 0.45 * Math.sin(state.time * 6));
    ctx.fillStyle = lean ? '#3a2410' : `rgba(58,40,16,${pulse.toFixed(3)})`;
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.fillText(lean ? '[L]  LISTENING' : '[L]  hold to lean in', x, y + h - 36);

    // Time remaining bar — built into the slip's bottom edge.
    if (call.ttl != null) {
      const pct = Math.max(0, call.ttl / call.ttlMax);
      ctx.fillStyle = 'rgba(60,12,12,0.8)';
      ctx.fillRect(x, y + h - 18, innerW, 4);
      ctx.fillStyle = pct > 0.4 ? '#3aa860' : pct > 0.15 ? '#c98018' : '#c01818';
      ctx.fillRect(x, y + h - 18, innerW * pct, 4);
    }

    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /* Replace every word in text with · dots EXCEPT those whose 0-based index
     is in leakIdx[]. If leakIdx is missing, fall back to a deterministic
     "every 4th word" leak so the player still gets a hint of the line. */
  function leakyScramble(text, leakIdx) {
    if (!text) return '';
    const words = text.split(/(\s+)/);          // keep whitespace tokens
    const wordOnly = [];
    const map = [];                             // wordOnly index per token
    for (let i = 0; i < words.length; i++) {
      if (/\S/.test(words[i])) {
        map[i] = wordOnly.length;
        wordOnly.push(words[i]);
      } else {
        map[i] = -1;
      }
    }
    const leakSet = new Set();
    if (leakIdx && leakIdx.length) {
      for (const li of leakIdx) leakSet.add(li);
    } else {
      // Deterministic fallback: every 4th word + words >= 6 chars
      for (let i = 0; i < wordOnly.length; i++) {
        if (i % 4 === 0 || wordOnly[i].replace(/[^A-Za-z0-9]/g, '').length >= 7) leakSet.add(i);
      }
    }
    let out = '';
    for (let i = 0; i < words.length; i++) {
      if (map[i] === -1) { out += words[i]; continue; }
      if (leakSet.has(map[i])) {
        out += words[i];
      } else {
        out += words[i].replace(/[A-Za-z0-9]/g, '·');
      }
    }
    return out;
  }

  function drawComposure(ctx, state) {
    const x = W - 220, y = 36, w = 200, h = 10;
    ctx.fillStyle = '#3a1a1a'; ctx.fillRect(x, y, w, h);
    const pct = Math.max(0, (state.composure || 0) / (state.composureMax || 1));
    ctx.fillStyle = pct > 0.4 ? '#6cff9a' : pct > 0.2 ? '#ffcc33' : '#ff5050';
    ctx.fillRect(x, y, w * pct, h);
    ctx.strokeStyle = '#6a4a20'; ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    ctx.fillStyle = '#a58a5a'; ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText('COMPOSURE', x + w, y + 12);
  }

  function wrapText(ctx, text, x, y, maxW, lh) {
    const words = text.split(' ');
    let line = '';
    for (const w of words) {
      const test = line + (line ? ' ' : '') + w;
      if (ctx.measureText(test).width > maxW) {
        ctx.fillText(line, x, y);
        line = w; y += lh;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, y);
  }

  SB.Board = { makeBoard, pickJack, pickSocket, attachJackTo, detachJack, getRoute, render };
})();
