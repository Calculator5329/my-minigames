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
    const escal = state.escalation || 0;

    // Wooden panel background — slight color drift toward sickly green-grey
    // as escalation climbs.
    const grd = ctx.createLinearGradient(0, 0, 0, H);
    const top = lerpColor('#2a1a0e', '#1a1c12', escal);
    const bot = lerpColor('#17100a', '#0a0c0a', escal);
    grd.addColorStop(0, top); grd.addColorStop(1, bot);
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);

    // Brass header / frame — letters flicker more on later nights
    ctx.fillStyle = '#3a2a18'; ctx.fillRect(0, 0, W, 28);
    const headerFlicker = (Math.random() < 0.005 + escal * 0.05) ? 0.35 : 1;
    ctx.globalAlpha = headerFlicker;
    ctx.fillStyle = '#c7a35a'; ctx.font = 'bold 14px ui-monospace, monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('OPERATOR — 418 LINDEN EXCHANGE', 16, 14);
    ctx.textAlign = 'right';
    ctx.fillText(state.hudRight || '', W - 16, 14);
    ctx.globalAlpha = 1;

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
      // Ghost lamp — every so often, a non-ringing socket on later nights
      // briefly lights and goes dark again. Purely cosmetic dread.
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
    }

    // Cables — bezier curves for each plugged pair, straight when parked.
    // On later nights a faint sway gets added so the cables look alive.
    for (const c of board.cables) {
      const baseColor = c.color || '#d84a48';
      const color = lerpColor(baseColor, '#5a1010', escal * 0.7);
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(c.a.x, c.a.y);
      const midX = (c.a.x + c.b.x) / 2;
      let midY = Math.max(c.a.y, c.b.y) + 80;
      if (escal > 0) {
        midY += Math.sin(state.time * 1.4 + c.id) * 5 * escal;
      }
      ctx.quadraticCurveTo(midX, midY, c.b.x, c.b.y);
      ctx.stroke();
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

    // Faint scanlines + vignette intensify with escalation. The scanlines
    // turn the board into a stuttering CRT image as the nights progress.
    if (escal > 0) {
      ctx.save();
      ctx.globalAlpha = 0.08 + escal * 0.10;
      ctx.fillStyle = '#000';
      for (let y = 0; y < H; y += 3) {
        ctx.fillRect(0, y, W, 1);
      }
      ctx.restore();
    }
    // Periodic full-board static flash on later nights
    if (escal > 0.5 && Math.random() < 0.005 * escal) {
      ctx.fillStyle = `rgba(216,74,72,${(0.05 + escal * 0.10).toFixed(2)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  /* tiny helper: lerp two #rrggbb colors */
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

    /* Spoken text — full-bright when leaning in, dim + scrambled-looking
       when not, to mirror what your ear is doing through the wire. We
       prefer the baked transcript (what was actually spoken in the wav)
       over the original script so the caption never drifts from the audio. */
    const lean = !!state.listening;
    const callId = call.idx != null && state.currentNight
      ? `n${state.currentNight}_c${call.idx}`
      : null;
    const transcript = (callId && SB.Voices && SB.Voices.getTranscript)
      ? SB.Voices.getTranscript(callId)
      : null;
    const spoken = transcript || call.text;
    if (lean) {
      ctx.fillStyle = '#f4e6c4';
      ctx.font = '12px ui-monospace, monospace';
      wrapText(ctx, '"' + spoken + '"', x + 10, y + 84, w - 20, 16);
    } else {
      ctx.fillStyle = '#5a4830';
      ctx.font = '12px ui-monospace, monospace';
      const scrambled = '"' + spoken.replace(/[A-Za-z0-9]/g, '·') + '"';
      wrapText(ctx, scrambled, x + 10, y + 84, w - 20, 16);
    }

    // Listen hint — pulses gently while a call is unanswered-listening
    const pulse = lean ? 1.0 : (0.55 + 0.45 * Math.sin(state.time * 6));
    ctx.fillStyle = lean ? '#ffec7a' : `rgba(199,163,90,${pulse.toFixed(3)})`;
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.fillText(lean ? '[L]  LISTENING' : '[L]  hold to lean in', x + 10, y + h - 22);

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
