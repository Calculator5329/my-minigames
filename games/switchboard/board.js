/* Switchboard — visual layout + click-drag jack routing.
   Pure rendering + input helpers. Owns no game state beyond the cables
   struct we pass in. The game logic (nights.js) tells us which lines are
   ringing and which are listened-to, and asks us for the player's current
   connections. */
(function () {
  const NDP = window.NDP;
  const SB = (NDP.switchboard = NDP.switchboard || {});

  const W = 960, H = 600;
  const SOCK_R = 14;
  const JACK_R = 10;
  const LINE_COUNT = 10;

  /* Layout: two rows of 10 sockets (top = incoming calls, bottom = outgoing
     destinations). Four cables start parked at the bottom of the board. */
  function makeBoard() {
    const topY = 120, botY = 300;
    const margin = 70, spacing = (W - margin * 2) / (LINE_COUNT - 1);
    const sockets = [];
    for (let i = 0; i < LINE_COUNT; i++) {
      sockets.push({ side: 'in',  line: i + 1, x: margin + i * spacing, y: topY });
    }
    for (let i = 0; i < LINE_COUNT; i++) {
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
    return { sockets, cables, topY, botY };
  }

  /* Is the mouse over a jack? Return {cable, end} or null. */
  function pickJack(board, mx, my) {
    for (const c of board.cables) {
      for (const end of ['a', 'b']) {
        const p = c[end];
        if (Math.hypot(mx - p.x, my - p.y) < JACK_R + 2) return { cable: c, end };
      }
    }
    return null;
  }

  /* Nearest socket to (x,y) within pull radius, or null. */
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
  function detachJack(jack) {
    jack.socket = null;
  }

  /* Return the currently-connected outgoing line for a given incoming line,
     or null if not connected. */
  function getRoute(board, incomingLine) {
    for (const c of board.cables) {
      const ins = [c.a, c.b].find(e => e.socket && e.socket.side === 'in'  && e.socket.line === incomingLine);
      const outs = [c.a, c.b].find(e => e.socket && e.socket.side === 'out');
      if (ins && outs) return outs.socket.line;
    }
    return null;
  }

  /* Render the board. `state` carries ringing/active flags + directory. */
  function render(ctx, board, state) {
    // Wooden panel background
    const grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#2a1a0e'); grd.addColorStop(1, '#17100a');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);

    // Brass header / frame
    ctx.fillStyle = '#3a2a18'; ctx.fillRect(0, 0, W, 28);
    ctx.fillStyle = '#c7a35a'; ctx.font = 'bold 14px ui-monospace, monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('OPERATOR — 418 LINDEN EXCHANGE', 16, 14);
    ctx.textAlign = 'right';
    ctx.fillText(state.hudRight || '', W - 16, 14);

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

    // Sockets
    for (const s of board.sockets) {
      // Ring glow if this line is lit
      const ringing = s.side === 'in' && state.ringing.has(s.line);
      const answered = s.side === 'in' && state.active.has(s.line);
      ctx.fillStyle = '#0a0604';
      ctx.beginPath(); ctx.arc(s.x, s.y, SOCK_R, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#6a4a20'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(s.x, s.y, SOCK_R, 0, Math.PI * 2); ctx.stroke();
      if (ringing) {
        const pulse = 1 + Math.sin(state.time * 10) * 0.3;
        ctx.strokeStyle = '#ffcc33';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(s.x, s.y, SOCK_R + 4 + pulse * 2, 0, Math.PI * 2); ctx.stroke();
        // A small lamp above
        ctx.fillStyle = '#ffcc33';
        ctx.beginPath(); ctx.arc(s.x, s.y - 26, 4, 0, Math.PI * 2); ctx.fill();
      }
      if (answered) {
        ctx.fillStyle = '#6cf';
        ctx.beginPath(); ctx.arc(s.x, s.y - 26, 4, 0, Math.PI * 2); ctx.fill();
      }
      // Number label
      ctx.fillStyle = '#8a6a3a';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = 'bold 10px ui-monospace, monospace';
      ctx.fillText(String(s.line), s.x, s.y + (s.side === 'in' ? -40 : 42));
    }

    // Cables — bezier curves for each plugged pair, straight when parked
    for (const c of board.cables) {
      const color = c.color || '#d84a48';
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(c.a.x, c.a.y);
      // Mid control point droops
      const midX = (c.a.x + c.b.x) / 2;
      const midY = Math.max(c.a.y, c.b.y) + 80;
      ctx.quadraticCurveTo(midX, midY, c.b.x, c.b.y);
      ctx.stroke();
      // Jacks
      for (const end of ['a', 'b']) {
        const j = c[end];
        ctx.fillStyle = '#e2ca7a';
        ctx.beginPath(); ctx.arc(j.x, j.y, JACK_R, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#3a2a18'; ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // Directory card
    drawDirectory(ctx, state);

    // Current caller card
    drawCallerCard(ctx, state);

    // Failure meter (composure)
    drawComposure(ctx, state);
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
    for (const [name, line] of entries) {
      ctx.fillStyle = '#3a2010';
      ctx.textAlign = 'left';
      ctx.fillText(name, x + 10, dy);
      ctx.textAlign = 'right';
      ctx.fillText(String(line), x + w - 10, dy);
      dy += 15;
    }
  }

  function drawCallerCard(ctx, state) {
    const x = 60, y = 360, w = 360, h = 220;
    ctx.fillStyle = '#1b100a';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#6a4a20'; ctx.lineWidth = 2;
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    ctx.fillStyle = '#c7a35a'; ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('CURRENT CALL', x + 10, y + 10);
    const call = state.focused;
    if (!call) {
      ctx.fillStyle = '#6a4a20';
      ctx.font = '12px ui-monospace, monospace';
      ctx.fillText('(click a ringing lamp to answer)', x + 10, y + 34);
      return;
    }
    ctx.fillStyle = '#ffec7a';
    ctx.font = 'bold 16px ui-monospace, monospace';
    ctx.fillText(SB.VOICES[call.voice].name, x + 10, y + 34);
    ctx.fillStyle = '#a58a5a';
    ctx.font = '12px ui-monospace, monospace';
    ctx.fillText('on line ' + call.line + (call.request ? ' → wants: ' + call.request : ''), x + 10, y + 56);
    ctx.fillStyle = '#f4e6c4';
    ctx.font = '12px ui-monospace, monospace';
    wrapText(ctx, '"' + call.text + '"', x + 10, y + 84, w - 20, 16);

    // Listen hint
    ctx.fillStyle = '#c7a35a';
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillText('[L]  hold to listen', x + 10, y + h - 22);

    // Time remaining bar
    if (call.ttl != null) {
      const pct = Math.max(0, call.ttl / call.ttlMax);
      ctx.fillStyle = '#4a1a1a'; ctx.fillRect(x + 10, y + h - 8, w - 20, 4);
      ctx.fillStyle = pct > 0.4 ? '#6cff9a' : pct > 0.15 ? '#ffcc33' : '#ff5050';
      ctx.fillRect(x + 10, y + h - 8, (w - 20) * pct, 4);
    }
  }

  function drawComposure(ctx, state) {
    // Top-right meter
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

  SB.Board = { makeBoard, pickJack, pickSocket, attachJackTo, detachJack, getRoute, render, LINE_COUNT };
})();
