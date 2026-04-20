/* Night 5 — walkthrough of the operator's office, Floor Zero, Hotel
   Cascadia. The five "rooms" are sub-scenes of the same office: the
   sagging wallpaper, the painted-over window, the gap in the floorboards
   where Mrs. Kestral stands on the ceiling below, the bellhop in the
   doorway, and the desk itself with the SUPPLY door behind it. The player
   walks left/right with WASD, stands near each scene to hear it, and ends
   the night by pressing SPACE at the desk to open SUPPLY.

   The ending key is selected from inter-night flags:
     - DEMOLITION   : you let the architect rest on >= 3 of 4 nights AND
                      routed the Replacement to Floor 3 on Night 4.
     - CHECK_OUT    : you connected the Replacement to FLOOR ZERO (line 1)
                      on Night 4. Default loop ending.
     - UNDERSTUDY   : anything else (denied / misrouted / ringout). */
(function () {
  const NDP = window.NDP;
  const SB = (NDP.switchboard = NDP.switchboard || {});

  const W = 960, H = 600;
  const ROOM_W = W;
  const FLOOR_Y = H - 180;

  function startWalkthrough(n5, flags) {
    const rooms = n5.rooms.map((r, i) => ({
      ...r,
      x: i * ROOM_W,
      visited: false,
      figureX: i * ROOM_W + W * 0.55,
      figureY: FLOOR_Y - 40,
      figureFacing: -1,
      figureWatching: 0,
      lineIdx: 0,
      lineCd: 0,
      spoken: [],
      candle: 0.6 + Math.random() * 0.4,
      motes: Array.from({ length: 14 }, () => ({
        x: Math.random() * W, y: Math.random() * FLOOR_Y, s: 0.5 + Math.random() * 1.2,
        v: 6 + Math.random() * 12
      }))
    }));
    return {
      n5,
      rooms,
      player: { x: 80, y: FLOOR_Y - 20, vx: 0, facing: 1, walkPhase: 0 },
      camX: 0,
      t: 0,
      flags,
      mode: 'walk',        // 'walk' | 'ending'
      endingText: null,
      endingKey: null,
      endingIdx: 0,
      endingCd: 0
    };
  }

  function tickWalk(w, dt, Input, voicesHooks) {
    w.t += dt;
    if (w.mode === 'ending') {
      w.endingCd -= dt;
      if (w.endingCd <= 0 && w.endingIdx < (w.endingText ? w.endingText.length : 0)) {
        const line = w.endingText[w.endingIdx];
        // Bake script writes ending lines as ending_<key>_<i>.wav. Pass an
        // explicit id so we play the baked take if it exists.
        const id = `ending_${w.endingKey}_${w.endingIdx}`;
        voicesHooks.narrate(line, id);
        w.endingIdx++;
        // Slightly slower roll for DEMOLITION (the "earned" ending) so the
        // player can sit with it, faster for UNDERSTUDY (the bad one).
        const baseCd = w.endingKey === 'understudy' ? 3.0
                     : w.endingKey === 'demolition' ? 4.4
                     : 3.6;
        w.endingCd = baseCd;
      }
      return;
    }

    const p = w.player;
    let ax = 0;
    if (Input.keys['ArrowLeft']  || Input.keys['a'] || Input.keys['A']) ax -= 1;
    if (Input.keys['ArrowRight'] || Input.keys['d'] || Input.keys['D']) ax += 1;
    p.vx = ax * 190;
    p.x = Math.max(40, Math.min(w.rooms.length * ROOM_W - 40, p.x + p.vx * dt));
    if (ax !== 0) p.facing = ax > 0 ? 1 : -1;
    p.walkPhase += Math.abs(p.vx) * dt * 0.02;
    w.camX = Math.max(0, Math.min((w.rooms.length - 1) * ROOM_W, Math.floor(p.x / ROOM_W) * ROOM_W));

    for (const r of w.rooms) {
      const dist = Math.abs(p.x - r.figureX);
      const inside = dist < 90;
      const target = inside ? 1 : 0;
      r.figureWatching += (target - r.figureWatching) * Math.min(1, dt * 2.4);
      if (inside) {
        r.figureFacing = (p.x < r.figureX) ? -1 : 1;
        if (!r.visited) { r.visited = true; r.lineCd = 0; }
        r.lineCd -= dt;
        if (r.lineCd <= 0 && r.lineIdx < r.lines.length) {
          const text = r.lines[r.lineIdx];
          voicesHooks.speak(r.voice, text, `walk_${r.name.toLowerCase()}_${r.lineIdx}`);
          r.spoken.push(text);
          r.lineIdx++;
          r.lineCd = 4.6;
        }
      }
      for (const m of r.motes) {
        m.y += m.v * dt;
        m.x += Math.sin(w.t * 0.6 + m.s) * dt * 4;
        if (m.y > FLOOR_Y) { m.y = -4; m.x = Math.random() * W; }
      }
    }

    // SUPPLY door interaction — last room (Desk). Player must stand near
    // the desk and press SPACE.
    const lastRoom = w.rooms[w.rooms.length - 1];
    if (Math.abs(p.x - lastRoom.figureX) < 80 && (Input.keys[' '] || Input.keys['Space'])) {
      triggerEnding(w, voicesHooks);
    }
  }

  function triggerEnding(w, voicesHooks) {
    if (w.mode !== 'walk') return;
    const f = w.flags || {};
    let key;
    if ((f.architect_rest_count || 0) >= 3 && f.replacement_route === 'line_3') {
      key = 'demolition';
    } else if (f.replacement_route === 'floor_zero') {
      key = 'check_out';
    } else {
      key = 'understudy';
    }
    w.endingKey = key;
    w.endingText = w.n5.endings[key] || w.n5.endings.check_out;
    w.endingIdx = 0;
    w.endingCd = 0.5;
    w.mode = 'ending';
    voicesHooks.endingStart(key);
  }

  function render(ctx, w) {
    ctx.fillStyle = '#0a0608';
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(-w.camX, 0);

    for (const r of w.rooms) {
      const flicker = 0.85 + 0.15 * Math.sin(w.t * (4 + r.candle) + r.candle * 7) +
                      (Math.random() < 0.02 ? -0.4 : 0);
      const lightFloor = `rgba(40,22,18,${(0.85 * Math.max(0.4, flicker)).toFixed(2)})`;

      // Floor
      ctx.fillStyle = '#1a0d0d';
      ctx.fillRect(r.x, FLOOR_Y, ROOM_W, H - FLOOR_Y);
      ctx.fillStyle = lightFloor;
      ctx.fillRect(r.x, FLOOR_Y, ROOM_W, H - FLOOR_Y);
      // Wall
      const wall = ctx.createLinearGradient(r.x, 0, r.x, FLOOR_Y);
      wall.addColorStop(0, '#0e070a');
      wall.addColorStop(0.6, '#1a0e14');
      wall.addColorStop(1, '#2a1c20');
      ctx.fillStyle = wall; ctx.fillRect(r.x, 0, ROOM_W, FLOOR_Y);
      // Wall stripes
      ctx.strokeStyle = 'rgba(90,50,60,0.22)'; ctx.lineWidth = 1;
      for (let gx = r.x + 20; gx < r.x + ROOM_W; gx += 18) {
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, FLOOR_Y); ctx.stroke();
      }
      // Candle pool
      const cx = r.figureX, cy = FLOOR_Y - 70;
      const grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, 220);
      grad.addColorStop(0, `rgba(255,200,120,${(0.13 * flicker).toFixed(3)})`);
      grad.addColorStop(1, 'rgba(255,200,120,0)');
      ctx.fillStyle = grad; ctx.fillRect(r.x, 0, ROOM_W, FLOOR_Y);
      ctx.fillStyle = '#140a0c';
      ctx.fillRect(r.x, FLOOR_Y - 4, ROOM_W, 4);

      // Doorway to next room (right side)
      if (r !== w.rooms[w.rooms.length - 1]) {
        ctx.fillStyle = '#050203';
        ctx.fillRect(r.x + ROOM_W - 32, FLOOR_Y - 150, 32, 150);
        ctx.strokeStyle = '#2a1018'; ctx.lineWidth = 2;
        ctx.strokeRect(r.x + ROOM_W - 32 + 0.5, FLOOR_Y - 150 + 0.5, 32, 150);
      }

      // Per-scene scenery (overrides the figure helper for non-figure rooms)
      drawScenery(ctx, r, w);

      // Dust motes
      ctx.fillStyle = 'rgba(220,200,160,0.18)';
      for (const m of r.motes) ctx.fillRect(r.x + m.x % ROOM_W, m.y, m.s, m.s);

      // Room name plate + description
      ctx.fillStyle = '#8a6a5a'; ctx.font = '11px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(r.name.toUpperCase(), r.x + ROOM_W / 2, 20);
      ctx.fillStyle = '#4a2e30';
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText(r.description, r.x + ROOM_W / 2, 38);

      drawFigure(ctx, r);

      // Spoken lines floating above
      let dy = FLOOR_Y - 100;
      for (let i = Math.max(0, r.spoken.length - 3); i < r.spoken.length; i++) {
        const age = (r.spoken.length - 1 - i);
        ctx.fillStyle = `rgba(220,200,180,${(0.85 - age * 0.22).toFixed(2)})`;
        ctx.font = '11px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('"' + r.spoken[i] + '"', r.figureX, dy);
        dy -= 14;
      }
    }

    // Player
    const p = w.player;
    ctx.fillStyle = '#e8d7a0';
    ctx.fillRect(p.x - 8, p.y - 32, 16, 24);
    ctx.fillStyle = '#2a1a12';
    ctx.fillRect(p.x - 8, p.y - 40, 16, 10);
    ctx.fillStyle = '#4a2a1a';
    ctx.fillRect(p.x - 9, p.y - 44, 18, 4);
    ctx.fillStyle = '#eee';
    ctx.fillRect(p.x + (p.facing > 0 ? 2 : -3), p.y - 36, 1, 1);

    ctx.restore();

    // Vignette
    const vg = ctx.createRadialGradient(W/2, H/2, 120, W/2, H/2, 560);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.7)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

    // Ending text fade-in
    if (w.mode === 'ending' && w.endingText) {
      ctx.fillStyle = 'rgba(0,0,0,0.78)';
      ctx.fillRect(0, H/2 - 90, W, 180);
      ctx.fillStyle = '#e8d7a0';
      ctx.font = 'bold 16px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const visibleLines = w.endingText.slice(Math.max(0, w.endingIdx - 5), w.endingIdx);
      visibleLines.forEach((line, i) => {
        ctx.fillText(line, W/2, H/2 - 60 + i * 22);
      });
      // Ending key tag
      ctx.fillStyle = '#a58a5a';
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.fillText(w.endingKey ? w.endingKey.toUpperCase().replace('_', ' ') : '', W/2, H/2 + 70);
    }

    // Footer hint
    if (w.mode === 'walk') {
      ctx.fillStyle = '#6a4a20'; ctx.font = '11px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      const inDesk = Math.abs(w.player.x - w.rooms[w.rooms.length - 1].figureX) < 80;
      ctx.fillText(inDesk
        ? 'SPACE — open the door marked SUPPLY.'
        : 'A/D to walk. Stand near each scene to hear it.',
        W/2, H - 8);
    }
  }

  /* Per-room background scenery (peeling wallpaper, painted window, gap in
     floorboards, doorway with bellhop silhouette, desk with switchboard).
     Driven off room.name. */
  function drawScenery(ctx, r, w) {
    const fx = r.figureX;
    if (r.name === 'Wallpaper') {
      // Sagging wallpaper panel with dried-red writing
      const sx = r.x + ROOM_W * 0.35, sy = 90, sw = 280, sh = FLOOR_Y - 130;
      ctx.fillStyle = '#231215';
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + sw, sy);
      ctx.lineTo(sx + sw, sy + sh - 18);
      const sag = 20 + 10 * Math.sin(w.t * 0.6);
      ctx.quadraticCurveTo(sx + sw / 2, sy + sh + sag, sx, sy + sh - 18);
      ctx.closePath(); ctx.fill();
      // Dried red writing
      ctx.save();
      ctx.translate(sx + sw / 2, sy + sh - 60);
      ctx.fillStyle = 'rgba(168,24,28,0.92)';
      ctx.font = 'italic bold 16px "Courier New", monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('THE STAIRS GO DOWN FOREVER', 0, -10);
      ctx.fillStyle = 'rgba(168,24,28,0.55)';
      ctx.font = 'italic 12px "Courier New", monospace';
      ctx.fillText('I tried the stairs', 0, 14);
      ctx.restore();
    } else if (r.name === 'Window') {
      // Painted-over window panel
      const wx = r.x + ROOM_W * 0.45, wy = 110, ww = 260, wh = 220;
      ctx.fillStyle = '#3a2018'; ctx.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);
      ctx.fillStyle = '#0a0608'; ctx.fillRect(wx, wy, ww, wh);
      // Sash cross
      ctx.strokeStyle = '#3a2018'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(wx + ww/2, wy); ctx.lineTo(wx + ww/2, wy + wh); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(wx, wy + wh/2); ctx.lineTo(wx + ww, wy + wh/2); ctx.stroke();
      // A sliver of warm yellow corridor
      const flick = 0.5 + 0.5 * Math.sin(w.t * 2.3);
      ctx.fillStyle = `rgba(255,200,120,${(0.55 * flick).toFixed(2)})`;
      ctx.fillRect(wx + 12, wy + 18, 12, wh - 36);
      // Suggestion of a folded coat on a chair, far inside
      ctx.fillStyle = 'rgba(40,30,28,0.8)';
      ctx.fillRect(wx + 14, wy + wh - 70, 9, 40);
    } else if (r.name === 'Floorboards') {
      // Gap in the floorboards with a pair of feet on the ceiling below
      const gx = r.figureX - 30, gy = FLOOR_Y - 8;
      ctx.fillStyle = '#03020a';
      ctx.fillRect(gx, gy, 60, 90);
      // Faint ceiling glimpse below
      ctx.fillStyle = 'rgba(60,30,20,0.4)';
      ctx.fillRect(gx + 4, gy + 18, 52, 60);
      // Feet (upside down, hanging) — Mrs. Kestral on the ceiling below
      ctx.fillStyle = '#a87a5a';
      ctx.fillRect(gx + 12, gy + 60, 14, 8);
      ctx.fillRect(gx + 32, gy + 60, 14, 8);
      // Tiny eyes glint
      ctx.fillStyle = '#ffec7a';
      const blink = (Math.sin(w.t * 1.3) > 0.95) ? 0 : 1;
      if (blink) {
        ctx.fillRect(gx + 25, gy + 84, 1, 1);
        ctx.fillRect(gx + 33, gy + 84, 1, 1);
      }
    } else if (r.name === 'Bellhop') {
      // Doorway with bellhop silhouette
      const dx = r.figureX - 40, dy = FLOOR_Y - 180;
      ctx.fillStyle = '#02000a';
      ctx.fillRect(dx, dy, 80, 180);
      ctx.strokeStyle = '#3a2018'; ctx.lineWidth = 3;
      ctx.strokeRect(dx + 0.5, dy + 0.5, 80, 180);
      // Subtle backlight pulse — the inhale rhythm
      const pulse = 0.5 + 0.5 * Math.sin(w.t * 0.6);
      ctx.fillStyle = `rgba(80,40,30,${(0.32 * pulse).toFixed(2)})`;
      ctx.fillRect(dx + 4, dy + 4, 72, 172);
    } else if (r.name === 'Desk') {
      // Desk + switchboard panel + brass door SUPPLY behind
      // Brass door
      const doorX = r.figureX + 60, doorY = FLOOR_Y - 160;
      ctx.fillStyle = '#3a2a18';
      ctx.fillRect(doorX, doorY, 60, 160);
      ctx.fillStyle = '#7a5028';
      ctx.fillRect(doorX + 4, doorY + 4, 52, 152);
      // Brass plate
      ctx.fillStyle = '#c7a35a';
      ctx.fillRect(doorX + 10, doorY + 24, 40, 16);
      ctx.fillStyle = '#3a2a18'; ctx.font = 'bold 9px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('SUPPLY', doorX + 30, doorY + 32);
      // Doorknob
      ctx.fillStyle = '#c7a35a';
      ctx.beginPath(); ctx.arc(doorX + 50, doorY + 100, 3, 0, Math.PI * 2); ctx.fill();
      // Desk
      ctx.fillStyle = '#2a1810';
      ctx.fillRect(r.figureX - 60, FLOOR_Y - 36, 110, 36);
      // Mini-board on desk
      ctx.fillStyle = '#1f140a';
      ctx.fillRect(r.figureX - 50, FLOOR_Y - 60, 90, 24);
      // A single lit lamp on line 1
      const lit = (Math.floor(w.t * 2) % 2) === 0;
      ctx.fillStyle = lit ? '#ffcc33' : '#5a3010';
      ctx.beginPath(); ctx.arc(r.figureX - 38, FLOOR_Y - 48, 3, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawFigure(ctx, r) {
    const fx = r.figureX, fy = r.figureY;
    // Wallpaper / Window / Floorboards have no human figure — skip the body
    // but still let the eye glints work for Bellhop (silhouette) etc.
    const skipBody = (r.name === 'Wallpaper' || r.name === 'Window' || r.name === 'Floorboards');
    if (!skipBody) {
      // Drop shadow
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath(); ctx.ellipse(fx, fy + 4, 14, 4, 0, 0, Math.PI * 2); ctx.fill();
      // Body
      ctx.fillStyle = (r.voice === 'bellhop') ? '#5a1a1a' : '#1a1014';
      ctx.fillRect(fx - 10, fy - 32, 20, 24);
      // Bellhop hat
      if (r.voice === 'bellhop') {
        ctx.fillStyle = '#5a1a1a';
        ctx.fillRect(fx - 10, fy - 50, 20, 6);
        ctx.fillStyle = '#c7a35a';
        ctx.fillRect(fx - 10, fy - 47, 20, 1);
      }
      // Head
      ctx.fillStyle = (r.voice === 'bellhop') ? '#1a0c08' : '#d8c0a4';
      ctx.fillRect(fx - 7, fy - 42, 14, 12);
      ctx.fillStyle = '#3a2a20';
      ctx.fillRect(fx - 8, fy - 46, 16, 4);
      // Eye glints
      if (r.figureWatching > 0.05) {
        const ex = fx + r.figureFacing * 2;
        ctx.fillStyle = `rgba(255,236,122,${(0.35 + r.figureWatching * 0.55).toFixed(2)})`;
        ctx.fillRect(ex - 1, fy - 38, 2, 2);
        ctx.fillRect(ex + (r.figureFacing > 0 ? 3 : -5), fy - 38, 2, 2);
      }
    }

    // Per-voice props
    if (r.voice === 'replacement' && r.name === 'Desk') {
      // A second small figure (the Replacement) sitting at the desk
      ctx.fillStyle = '#e8d7a0';
      ctx.fillRect(fx + 14, fy - 22, 14, 18);
      ctx.fillStyle = '#3a2a20';
      ctx.fillRect(fx + 15, fy - 30, 12, 8);
    }

    // Name plate
    if (!skipBody) {
      ctx.fillStyle = '#6a4a2a'; ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(r.figure, fx, fy + 4);
    }
  }

  SB.Walk = { startWalkthrough, tick: tickWalk, render };
})();
