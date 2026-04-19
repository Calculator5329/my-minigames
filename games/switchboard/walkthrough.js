/* Night 5 — walkthrough of 418 Linden. Simple top-down: player moves with
   WASD through 5 rooms in a horizontal strip. Each room contains a figure
   that speaks its lines when approached. Final kitchen has a jack decision. */
(function () {
  const NDP = window.NDP;
  const SB = (NDP.switchboard = NDP.switchboard || {});

  const W = 960, H = 600;
  const ROOM_W = W;              // we scroll camera by room
  const FLOOR_Y = H - 180;

  function startWalkthrough(n5, flags) {
    const rooms = n5.rooms.map((r, i) => ({
      ...r,
      x: i * ROOM_W,
      visited: false,
      figureX: i * ROOM_W + W * 0.55,
      figureY: FLOOR_Y - 40,
      figureFacing: -1,            // figures start facing away from player
      figureWatching: 0,           // 0..1 — turns to look at you when you arrive
      lineIdx: 0,
      lineCd: 0,
      spoken: [],
      candle: 0.6 + Math.random() * 0.4,   // per-room flicker phase seed
      // Pre-seed dust motes per room
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
      mode: 'walk',        // 'walk' | 'kitchen' | 'ending'
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
        voicesHooks.narrate(line);
        w.endingIdx++;
        w.endingCd = 3.6;
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

    // Interact with the figure nearest to player and animate figure turning
    // toward the player while inside the conversation radius.
    for (const r of w.rooms) {
      const dist = Math.abs(p.x - r.figureX);
      const inside = dist < 90;
      const target = inside ? 1 : 0;
      r.figureWatching += (target - r.figureWatching) * Math.min(1, dt * 2.4);
      if (inside) {
        r.figureFacing = (p.x < r.figureX) ? -1 : 1;
        if (!r.visited) {
          r.visited = true;
          r.lineCd = 0;
        }
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

    // Kitchen interaction — when in last room and space pressed, pick ending
    const lastRoom = w.rooms[w.rooms.length - 1];
    if (Math.abs(p.x - lastRoom.figureX) < 80 && (Input.keys[' '] || Input.keys['Space'])) {
      triggerEnding(w, voicesHooks);
    }
  }

  function triggerEnding(w, voicesHooks) {
    if (w.mode !== 'walk') return;
    let key = 'route';
    if (w.flags.final_self_call === false) key = 'deny';
    // Hidden: never listened to Halberd (any night)
    if (w.flags.halberd_listened === false && w.flags.halberd_calls_total > 0 && w.flags.final_self_call) {
      key = 'hidden';
    }
    w.endingKey = key;
    w.endingText = w.n5.endings[key] || w.n5.endings.route;
    w.endingIdx = 0;
    w.endingCd = 0.5;
    w.mode = 'ending';
    voicesHooks.endingStart(key);
  }

  function render(ctx, w) {
    // Night-dim palette
    ctx.fillStyle = '#0a0608';
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(-w.camX, 0);

    for (const r of w.rooms) {
      // Per-room candle flicker controls the wall light
      const flicker = 0.85 + 0.15 * Math.sin(w.t * (4 + r.candle) + r.candle * 7) +
                      (Math.random() < 0.02 ? -0.4 : 0);
      const lightFloor = `rgba(40,22,18,${(0.85 * Math.max(0.4, flicker)).toFixed(2)})`;

      // Room floor
      ctx.fillStyle = '#1a0d0d';
      ctx.fillRect(r.x, FLOOR_Y, ROOM_W, H - FLOOR_Y);
      ctx.fillStyle = lightFloor;
      ctx.fillRect(r.x, FLOOR_Y, ROOM_W, H - FLOOR_Y);
      // Wallpaper
      const wall = ctx.createLinearGradient(r.x, 0, r.x, FLOOR_Y);
      wall.addColorStop(0, '#0e070a');
      wall.addColorStop(0.6, '#1a0e14');
      wall.addColorStop(1, '#2a1c20');
      ctx.fillStyle = wall; ctx.fillRect(r.x, 0, ROOM_W, FLOOR_Y);
      // Wallpaper stripes
      ctx.strokeStyle = 'rgba(90,50,60,0.22)'; ctx.lineWidth = 1;
      for (let gx = r.x + 20; gx < r.x + ROOM_W; gx += 18) {
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, FLOOR_Y); ctx.stroke();
      }
      // Faint candle pool of light around the figure
      const cx = r.figureX, cy = FLOOR_Y - 70;
      const grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, 220);
      grad.addColorStop(0, `rgba(255,200,120,${(0.13 * flicker).toFixed(3)})`);
      grad.addColorStop(1, 'rgba(255,200,120,0)');
      ctx.fillStyle = grad; ctx.fillRect(r.x, 0, ROOM_W, FLOOR_Y);
      // Baseboard
      ctx.fillStyle = '#140a0c';
      ctx.fillRect(r.x, FLOOR_Y - 4, ROOM_W, 4);

      // Doorway to next room
      if (r !== w.rooms[w.rooms.length - 1]) {
        ctx.fillStyle = '#050203';
        ctx.fillRect(r.x + ROOM_W - 32, FLOOR_Y - 150, 32, 150);
        // Door frame highlight
        ctx.strokeStyle = '#2a1018'; ctx.lineWidth = 2;
        ctx.strokeRect(r.x + ROOM_W - 32 + 0.5, FLOOR_Y - 150 + 0.5, 32, 150);
      }

      // Dust motes
      ctx.fillStyle = 'rgba(220,200,160,0.18)';
      for (const m of r.motes) {
        ctx.fillRect(r.x + m.x % ROOM_W, m.y, m.s, m.s);
      }

      // Room name plate
      ctx.fillStyle = '#8a6a5a'; ctx.font = '11px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(r.name.toUpperCase(), r.x + ROOM_W / 2, 20);
      ctx.fillStyle = '#4a2e30';
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText(r.description, r.x + ROOM_W / 2, 38);

      // Figure
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
    ctx.fillRect(p.x - 8, p.y - 32, 16, 24);   // body (dress-coat)
    ctx.fillStyle = '#2a1a12';
    ctx.fillRect(p.x - 8, p.y - 40, 16, 10);   // head
    ctx.fillStyle = '#4a2a1a';
    ctx.fillRect(p.x - 9, p.y - 44, 18, 4);    // hair
    // Eye
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
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(0, H/2 - 60, W, 120);
      ctx.fillStyle = '#e8d7a0';
      ctx.font = 'bold 16px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const visibleLines = w.endingText.slice(0, w.endingIdx);
      visibleLines.forEach((line, i) => {
        ctx.fillText(line, W/2, H/2 - 30 + i * 20);
      });
    }

    // Footer hint
    if (w.mode === 'walk') {
      ctx.fillStyle = '#6a4a20'; ctx.font = '11px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      const inKitchen = Math.abs(w.player.x - w.rooms[w.rooms.length - 1].figureX) < 80;
      ctx.fillText(inKitchen
        ? 'SPACE — pick up the line, or stay for tea.'
        : 'A/D to walk. Stand near a figure to hear them.',
        W/2, H - 8);
    }
  }

  function drawFigure(ctx, r) {
    const fx = r.figureX, fy = r.figureY;
    // Drop shadow
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath(); ctx.ellipse(fx, fy + 4, 14, 4, 0, 0, Math.PI * 2); ctx.fill();
    // Body
    ctx.fillStyle = '#1a1014';
    ctx.fillRect(fx - 10, fy - 32, 20, 24);
    // Head — a touch of pallor on the side facing the player
    ctx.fillStyle = '#d8c0a4';
    ctx.fillRect(fx - 7, fy - 42, 14, 12);
    ctx.fillStyle = '#3a2a20';
    ctx.fillRect(fx - 8, fy - 46, 16, 4);
    // Eye glints — only visible while watching the player
    if (r.figureWatching > 0.05) {
      const ex = fx + r.figureFacing * 2;
      ctx.fillStyle = `rgba(255,236,122,${(0.35 + r.figureWatching * 0.55).toFixed(2)})`;
      ctx.fillRect(ex - 1, fy - 38, 2, 2);
      ctx.fillRect(ex + (r.figureFacing > 0 ? 3 : -5), fy - 38, 2, 2);
    }

    switch (r.voice) {
      case 'crane':
        ctx.fillStyle = '#5aa0a0';
        ctx.fillRect(fx + 8, fy - 32, 10, 12);        // glass case
        break;
      case 'doctor':
        ctx.fillStyle = '#e8e8e8';
        ctx.fillRect(fx - 14, fy - 22, 10, 8);        // paperwork
        break;
      case 'weatherman':
        ctx.fillStyle = '#a08050';
        ctx.fillRect(fx + 10, fy - 40, 8, 16);        // radio
        ctx.fillStyle = '#ffcc33';
        ctx.fillRect(fx + 12, fy - 36, 4, 2);
        break;
      case 'child':
        ctx.fillStyle = '#d05858';
        ctx.fillRect(fx - 8, fy - 18, 16, 10);        // toy phone
        break;
      case 'halberd':
        ctx.fillStyle = '#c7a35a';
        ctx.fillRect(fx - 20, fy - 20, 40, 8);        // switchboard
        ctx.fillStyle = '#ffcc33';
        ctx.fillRect(fx - 10, fy - 22, 4, 2);         // lit lamp
        break;
    }
    // Name plate
    ctx.fillStyle = '#6a4a2a'; ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(r.figure, fx, fy + 4);
  }

  SB.Walk = { startWalkthrough, tick: tickWalk, render };
})();
