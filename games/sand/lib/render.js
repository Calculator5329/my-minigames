// games/sand/lib/render.js
// Dual-entry module: works in Node (CommonJS) and in the browser (window.NDP.Sand.Render).
// Canvas renderer for the sand minigame workspace: lattice grid, nodes, pins,
// wires, signal-flow particles, oscilloscope strip, pass celebration.

(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = mod.Render;
    module.exports.Render = mod.Render;
  }
  if (typeof window !== 'undefined') {
    window.NDP = window.NDP || {};
    window.NDP.Sand = window.NDP.Sand || {};
    window.NDP.Sand.Render = mod.Render;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  // ---- Theme ----
  const THEME = {
    bg: '#0e1116',
    bgGradient: '#141a24',
    gridDot: '#8aa0b8',
    fg: '#e7ecf3',
    nodeFill: '#1a2030',
    nodeFillHi: '#232b40',
    nodeStroke: '#3a4560',
    nodeInner: '#52627c',
    nodeShadow: '#05080c',
    nodeSelected: '#ffcc33',
    pin: '#cfd6e0',
    wire: '#49546a',
    wireDim: '#2e3850',
    wireActive: '#ffcc33',
    accent: '#ffcc33',
    accent2: '#ff5e7e',
    warn: '#ff4d4d',
    scopeBg: 'rgba(6,10,16,0.78)',
    scopeFg: '#8aa0b8',
  };

  const GRID_PITCH = 24;
  const NODE_R = 6;
  const PIN_R = 3.5;

  const PRIMITIVE_TYPES = ['pad_in', 'pad_out', 'power', 'ground', 'switch', 'pullup', 'clock'];

  // ---- Pin layout ----
  const PIN_LAYOUTS = {
    pad_in:  { in: [], out: ['out'] },
    pad_out: { in: ['in'], out: [] },
    power:   { in: [], out: ['out'] },
    ground:  { in: [], out: ['out'] },
    switch:  { in: ['gate', 'in'], out: ['out'] },
    pullup:  { in: ['a'], out: ['out'] },
    clock:   { in: [], out: ['out'] },
  };

  function nodeSize(node) {
    if (node.type === 'pad_in' || node.type === 'pad_out') {
      return { w: 64, h: 36 };
    }
    return { w: 72, h: 40 };
  }

  function pinsFor(node) {
    return PIN_LAYOUTS[node.type] || { in: [], out: [] };
  }

  function pinPosition(node, pinName) {
    const { w, h } = nodeSize(node);
    const left = node.x - w / 2;
    const right = node.x + w / 2;
    const top = node.y - h / 2;
    const pins = pinsFor(node);
    const inIx = pins.in.indexOf(pinName);
    const outIx = pins.out.indexOf(pinName);
    if (inIx >= 0) {
      const n = pins.in.length;
      const step = h / (n + 1);
      return { x: left, y: top + step * (inIx + 1) };
    }
    if (outIx >= 0) {
      const n = pins.out.length;
      const step = h / (n + 1);
      return { x: right, y: top + step * (outIx + 1) };
    }
    return { x: right, y: node.y };
  }

  function nodeContainsWorld(node, wp) {
    const { w, h } = nodeSize(node);
    return (
      wp.x >= node.x - w / 2 &&
      wp.x <= node.x + w / 2 &&
      wp.y >= node.y - h / 2 &&
      wp.y <= node.y + h / 2
    );
  }

  function pickPin(graph, worldPt, thresholdWorld) {
    let best = null;
    let bestD2 = thresholdWorld * thresholdWorld;
    for (const id of Object.keys(graph.nodes)) {
      const node = graph.nodes[id];
      const pins = pinsFor(node);
      for (const dir of ['in', 'out']) {
        for (const name of pins[dir]) {
          const pp = pinPosition(node, name);
          const dx = pp.x - worldPt.x;
          const dy = pp.y - worldPt.y;
          const d2 = dx * dx + dy * dy;
          if (d2 <= bestD2) {
            bestD2 = d2;
            best = { node: node.id, pin: name, dir, pos: pp };
          }
        }
      }
    }
    return best;
  }

  // ---- Color helpers ----

  function hashString(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function hueForId(id) {
    return hashString(String(id)) % 360;
  }

  function hslStr(h, s, l, a) {
    if (a === undefined) return 'hsl(' + h + ',' + s + '%,' + l + '%)';
    return 'hsla(' + h + ',' + s + '%,' + l + '%,' + a + ')';
  }

  // ---- Drawing helpers ----

  function w2s(cam, wp, viewport) {
    return {
      x: (wp.x - cam.x) * cam.zoom + viewport.w / 2,
      y: (wp.y - cam.y) * cam.zoom + viewport.h / 2,
    };
  }

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  }

  function drawGrid(ctx, cam, viewport, timeOffset) {
    const halfW = viewport.w / 2 / cam.zoom;
    const halfH = viewport.h / 2 / cam.zoom;
    const wx0 = cam.x - halfW;
    const wy0 = cam.y - halfH;
    const wx1 = cam.x + halfW;
    const wy1 = cam.y + halfH;

    const pitch = GRID_PITCH;
    const halfPitch = pitch / 2;

    const iy0 = Math.floor(wy0 / pitch) - 1;
    const iy1 = Math.ceil(wy1 / pitch) + 1;
    const ix0 = Math.floor(wx0 / pitch) - 1;
    const ix1 = Math.ceil(wx1 / pitch) + 1;

    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = THEME.gridDot;
    const dotR = 1.5;
    for (let iy = iy0; iy <= iy1; iy++) {
      const wy = iy * pitch;
      const offset = (iy & 1) ? halfPitch : 0;
      for (let ix = ix0; ix <= ix1; ix++) {
        const wx = ix * pitch + offset;
        const sp = w2s(cam, { x: wx, y: wy }, viewport);
        if (sp.x < -4 || sp.x > viewport.w + 4 || sp.y < -4 || sp.y > viewport.h + 4) continue;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, dotR, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // ---- Orthogonal wire path + point-along-path helpers ----

  // Returns the polyline vertices (in world space) for a wire between fp -> tp.
  // Three segments: H, V, H, passing through midX.
  function wirePath(fp, tp) {
    const midX = (fp.x + tp.x) / 2;
    return [
      { x: fp.x, y: fp.y },
      { x: midX, y: fp.y },
      { x: midX, y: tp.y },
      { x: tp.x, y: tp.y },
    ];
  }

  function pathLength(pts) {
    let L = 0;
    for (let i = 1; i < pts.length; i++) {
      L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    }
    return L;
  }

  // Walk along `pts` for `dist` units; return { x, y } or null if past end.
  function pointAlong(pts, dist) {
    if (dist < 0) return null;
    let remain = dist;
    for (let i = 1; i < pts.length; i++) {
      const ax = pts[i - 1].x, ay = pts[i - 1].y;
      const bx = pts[i].x,     by = pts[i].y;
      const seg = Math.hypot(bx - ax, by - ay);
      if (seg <= 0) continue;
      if (remain <= seg) {
        const t = remain / seg;
        return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t };
      }
      remain -= seg;
    }
    return null;
  }

  function drawWire(ctx, from, to, cam, viewport, state) {
    const a = w2s(cam, from, viewport);
    const b = w2s(cam, to, viewport);
    const midX = (a.x + b.x) / 2;
    const r = NODE_R;
    ctx.save();
    let color, width;
    if (state === 'active') { color = THEME.wireActive; width = 2.2; }
    else if (state === 'conflict') { color = THEME.warn; width = 2.2; }
    else if (state === 'z') { color = THEME.wireDim; width = 1.6; }
    else { color = THEME.wire; width = 1.8; }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    const dirX1 = midX >= a.x ? 1 : -1;
    const dirY = b.y >= a.y ? 1 : -1;
    const dirX2 = b.x >= midX ? 1 : -1;
    ctx.lineTo(midX - dirX1 * r, a.y);
    ctx.quadraticCurveTo(midX, a.y, midX, a.y + dirY * r);
    ctx.lineTo(midX, b.y - dirY * r);
    ctx.quadraticCurveTo(midX, b.y, midX + dirX2 * r, b.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
  }

  // ---- Node rendering ----

  function getGlyphs() {
    if (typeof window !== 'undefined' && window.NDP && window.NDP.Sand && window.NDP.Sand.Glyphs) {
      return window.NDP.Sand.Glyphs;
    }
    return null;
  }

  function drawNode(ctx, node, cam, viewport, opts) {
    const { w, h } = nodeSize(node);
    const topLeft = w2s(cam, { x: node.x - w / 2, y: node.y - h / 2 }, viewport);
    const sw = w * cam.zoom;
    const sh = h * cam.zoom;
    const selected = !!opts.selected;
    const conflict = !!opts.conflict;
    const t = opts.time || 0;

    ctx.save();

    // Shadow (outer bottom-right)
    roundRect(ctx, topLeft.x + 1, topLeft.y + 2, sw, sh, NODE_R);
    ctx.fillStyle = THEME.nodeShadow;
    ctx.globalAlpha = 0.55;
    ctx.fill();
    ctx.globalAlpha = 1;

    // Body with subtle vertical gradient
    roundRect(ctx, topLeft.x, topLeft.y, sw, sh, NODE_R);
    const grad = ctx.createLinearGradient(topLeft.x, topLeft.y, topLeft.x, topLeft.y + sh);
    grad.addColorStop(0, THEME.nodeFillHi);
    grad.addColorStop(1, THEME.nodeFill);
    ctx.fillStyle = grad;
    ctx.fill();

    // Black-box compiled components: animated gradient sweep on face.
    if (opts.isBlackBox) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const sweepX = topLeft.x + ((t * 80) % (sw + 40)) - 20;
      const sg = ctx.createLinearGradient(sweepX - 20, 0, sweepX + 20, 0);
      sg.addColorStop(0, 'rgba(255,204,51,0)');
      sg.addColorStop(0.5, 'rgba(255,204,51,0.18)');
      sg.addColorStop(1, 'rgba(255,204,51,0)');
      roundRect(ctx, topLeft.x, topLeft.y, sw, sh, NODE_R);
      ctx.fillStyle = sg;
      ctx.fill();
      ctx.restore();
    }

    // Inner highlight (top-left bevel)
    ctx.save();
    roundRect(ctx, topLeft.x + 0.5, topLeft.y + 0.5, sw - 1, sh - 1, NODE_R - 1);
    ctx.strokeStyle = THEME.nodeInner;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // Main stroke
    roundRect(ctx, topLeft.x, topLeft.y, sw, sh, NODE_R);
    ctx.lineWidth = selected ? 2 : 1;
    ctx.strokeStyle = selected ? THEME.nodeSelected : THEME.nodeStroke;
    ctx.stroke();

    // Glyph
    const glyphs = getGlyphs();
    const cx = topLeft.x + sw / 2;
    const cy = topLeft.y + sh / 2;
    const label = (node.props && node.props.label) ? node.props.label : null;
    const isPad = node.type === 'pad_in' || node.type === 'pad_out';

    let drewGlyph = false;
    if (glyphs) {
      drewGlyph = glyphs.draw(ctx, node.type, cx, cy, Math.min(sw, sh) * 0.85, THEME.fg, label);
    }
    if (!drewGlyph) {
      // Fallback: text label of type
      const textLabel = label || node.type;
      ctx.fillStyle = THEME.fg;
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(textLabel, cx, cy);
    }

    // Pad type subscript
    if (isPad && label) {
      ctx.fillStyle = THEME.accent;
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(node.type, cx, topLeft.y + sh + 2);
    }

    // Selection double-ring pulse
    if (selected) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 5);
      ctx.save();
      ctx.strokeStyle = THEME.accent;
      ctx.globalAlpha = 0.35 + 0.35 * pulse;
      ctx.lineWidth = 2;
      roundRect(ctx, topLeft.x - 3, topLeft.y - 3, sw + 6, sh + 6, NODE_R + 3);
      ctx.stroke();
      ctx.globalAlpha = 0.18 + 0.18 * (1 - pulse);
      roundRect(ctx, topLeft.x - 6, topLeft.y - 6, sw + 12, sh + 12, NODE_R + 6);
      ctx.stroke();
      ctx.restore();
    }

    // Conflict throb (red outline pulsing)
    if (conflict) {
      const throb = 0.5 + 0.5 * Math.sin(t * 3);
      ctx.save();
      ctx.strokeStyle = THEME.warn;
      ctx.globalAlpha = 0.35 + 0.45 * throb;
      ctx.lineWidth = 2;
      roundRect(ctx, topLeft.x - 2, topLeft.y - 2, sw + 4, sh + 4, NODE_R + 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  function drawPins(ctx, node, cam, viewport, signals) {
    const pins = pinsFor(node);
    ctx.save();
    for (const dir of ['in', 'out']) {
      for (const name of pins[dir]) {
        const wp = pinPosition(node, name);
        const sp = w2s(cam, wp, viewport);
        const sig = signals && signals[node.id] ? signals[node.id][name] : undefined;
        const active = sig === 1 && dir === 'out';
        if (active) {
          // soft corona
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const hue = hueForId(node.id);
          ctx.fillStyle = hslStr(hue, 90, 60, 0.55);
          ctx.shadowColor = hslStr(hue, 95, 65);
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, PIN_R * 1.8, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        ctx.fillStyle = THEME.pin;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, PIN_R, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // ---- Particle system (internal module state) ----

  const PARTICLE_CAP = 400;
  // Pool: each particle = { active, wireId, pts, len, pos, speed, hue, life }
  const _particles = [];
  const _emitAccum = Object.create(null); // wireId -> seconds since last emit
  let _timeAccum = 0;

  function acquireParticle() {
    for (let i = 0; i < _particles.length; i++) {
      if (!_particles[i].active) return _particles[i];
    }
    if (_particles.length >= PARTICLE_CAP) return null;
    const p = { active: false };
    _particles.push(p);
    return p;
  }

  function resetParticles() {
    for (let i = 0; i < _particles.length; i++) _particles[i].active = false;
    for (const k of Object.keys(_emitAccum)) delete _emitAccum[k];
  }

  function updateAndDrawParticles(ctx, graph, signals, cam, viewport, dt) {
    // Emit particles from active wires.
    if (dt > 0) {
      for (const wid of Object.keys(graph.wires)) {
        const wire = graph.wires[wid];
        const fromNode = graph.nodes[wire.from.node];
        const toNode = graph.nodes[wire.to.node];
        if (!fromNode || !toNode) continue;
        const sigFrom = signals[wire.from.node];
        const src = sigFrom ? sigFrom[wire.from.pin] : undefined;
        if (src !== 1) { _emitAccum[wid] = 0; continue; }
        _emitAccum[wid] = (_emitAccum[wid] || 0) + dt;
        const emitEvery = 0.1; // 100ms
        while (_emitAccum[wid] >= emitEvery) {
          _emitAccum[wid] -= emitEvery;
          const p = acquireParticle();
          if (!p) break;
          const fp = pinPosition(fromNode, wire.from.pin);
          const tp = pinPosition(toNode, wire.to.pin);
          const pts = wirePath(fp, tp);
          p.active = true;
          p.wireId = wid;
          p.pts = pts;
          p.len = pathLength(pts);
          p.pos = 0;
          p.speed = 500; // world units per second
          p.hue = hueForId(wire.from.node);
        }
      }
    }

    // Advance + draw.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < _particles.length; i++) {
      const p = _particles[i];
      if (!p.active) continue;
      if (dt > 0) p.pos += p.speed * dt;
      if (p.pos >= p.len) { p.active = false; continue; }
      const wp = pointAlong(p.pts, p.pos);
      if (!wp) { p.active = false; continue; }
      const sp = w2s(cam, wp, viewport);
      // glow halo
      ctx.fillStyle = hslStr(p.hue, 90, 55, 0.35);
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = hslStr(p.hue, 95, 70, 0.7);
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 5, 0, Math.PI * 2);
      ctx.fill();
      // core
      ctx.fillStyle = hslStr(p.hue, 100, 92);
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ---- Oscilloscope strip ----

  function drawScope(ctx, viewport, scope, graph) {
    if (!scope || !scope.length) return;
    const H = 64;
    const y0 = viewport.h - H;
    ctx.save();
    // bg
    ctx.fillStyle = THEME.scopeBg;
    ctx.fillRect(0, y0, viewport.w, H);
    // top border
    ctx.strokeStyle = 'rgba(255,204,51,0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y0 + 0.5);
    ctx.lineTo(viewport.w, y0 + 0.5);
    ctx.stroke();

    // Label
    ctx.fillStyle = THEME.scopeFg;
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('SCOPE', 6, y0 + 4);

    // Figure out clock node id for hue.
    let clockId = null;
    for (const id of Object.keys(graph.nodes)) {
      if (graph.nodes[id].type === 'clock') { clockId = id; break; }
    }
    const hue = clockId ? hueForId(clockId) : 50;

    // Plot last 128 samples of clock trace (item = [tick, value]).
    const N = 128;
    const start = Math.max(0, scope.length - N);
    const slice = scope.slice(start);
    const xStep = viewport.w / N;
    const traceTop = y0 + 18;
    const traceH = H - 26;

    // guides
    ctx.strokeStyle = 'rgba(138,160,184,0.18)';
    ctx.beginPath();
    ctx.moveTo(0, traceTop + traceH);
    ctx.lineTo(viewport.w, traceTop + traceH);
    ctx.moveTo(0, traceTop);
    ctx.lineTo(viewport.w, traceTop);
    ctx.stroke();

    // trace
    ctx.strokeStyle = hslStr(hue, 95, 65);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < slice.length; i++) {
      const v = slice[i][1];
      const x = i * xStep;
      const y = v === 1 ? traceTop : (traceTop + traceH);
      if (i === 0) ctx.moveTo(x, y);
      else {
        ctx.lineTo(x, y); // vertical edge first via last y — keeps square wave look
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  // ---- Pass celebration flash overlay ----

  function drawFlash(ctx, viewport, flash) {
    if (!flash || !flash.active) return;
    const p = Math.max(0, Math.min(1, flash.t / flash.duration));
    const alpha = 0.35 * (1 - p) + 0.15 * Math.sin(p * Math.PI * 4) * (1 - p);
    ctx.save();
    ctx.fillStyle = 'rgba(255,204,51,' + Math.max(0, alpha).toFixed(3) + ')';
    ctx.fillRect(0, 0, viewport.w, viewport.h);
    ctx.restore();
  }

  // ---- Main draw ----

  function draw(ctx, opts) {
    const { graph, camera, viewport } = opts;
    const signals = opts.signals || {};
    const selection = opts.selection || { nodes: {}, wires: {} };
    const pendingWire = opts.pendingWire || null;
    const boxSelect = opts.boxSelect || null;
    const dt = typeof opts.dt === 'number' ? Math.max(0, Math.min(0.1, opts.dt)) : 0;
    const scope = opts.scope || null;
    const flash = opts.flash || null;
    _timeAccum += dt;
    const time = _timeAccum;

    // 1. background
    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, viewport.w, viewport.h);

    // radial vignette for silicon feel
    const vg = ctx.createRadialGradient(viewport.w / 2, viewport.h / 2, 50,
                                        viewport.w / 2, viewport.h / 2, Math.max(viewport.w, viewport.h));
    vg.addColorStop(0, 'rgba(255,204,51,0.05)');
    vg.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, viewport.w, viewport.h);

    // 2. lattice grid
    drawGrid(ctx, camera, viewport, time);

    // 3. wires (behind nodes)
    for (const wid of Object.keys(graph.wires)) {
      const w = graph.wires[wid];
      const fromNode = graph.nodes[w.from.node];
      const toNode = graph.nodes[w.to.node];
      if (!fromNode || !toNode) continue;
      const fp = pinPosition(fromNode, w.from.pin);
      const tp = pinPosition(toNode, w.to.pin);
      const sf = signals[w.from.node];
      const src = sf ? sf[w.from.pin] : undefined;
      let state = 'off';
      if (src === 1) state = 'active';
      else if (src === 'X') state = 'conflict';
      else if (src === 'Z' || src === undefined) state = 'z';
      drawWire(ctx, fp, tp, camera, viewport, state);
    }

    // 4. pending wire preview
    if (pendingWire && pendingWire.from && pendingWire.cursor) {
      const fromNode = graph.nodes[pendingWire.from.node];
      if (fromNode) {
        const fp = pinPosition(fromNode, pendingWire.from.pin);
        ctx.save();
        ctx.strokeStyle = THEME.accent;
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        const a = w2s(camera, fp, viewport);
        const b = w2s(camera, pendingWire.cursor, viewport);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.restore();
      }
    }

    // 5. signal-flow particles (additive, drawn under nodes so nodes occlude)
    updateAndDrawParticles(ctx, graph, signals, camera, viewport, dt);

    // 6. nodes
    for (const nid of Object.keys(graph.nodes)) {
      const node = graph.nodes[nid];
      const sigs = signals[nid] || {};
      let conflict = false;
      const pins = pinsFor(node);
      for (const pin of pins.out) if (sigs[pin] === 'X') { conflict = true; break; }
      const isBlackBox = PRIMITIVE_TYPES.indexOf(node.type) < 0;
      drawNode(ctx, node, camera, viewport, {
        selected: !!selection.nodes[nid],
        conflict,
        isBlackBox,
        time,
      });
    }

    // 7. pins on top
    for (const nid of Object.keys(graph.nodes)) {
      drawPins(ctx, graph.nodes[nid], camera, viewport, signals);
    }

    // 8. box select overlay
    if (boxSelect) {
      ctx.save();
      ctx.strokeStyle = THEME.accent;
      ctx.fillStyle = 'rgba(255,204,51,0.08)';
      ctx.lineWidth = 1;
      const x = Math.min(boxSelect.x0, boxSelect.x1);
      const y = Math.min(boxSelect.y0, boxSelect.y1);
      const w = Math.abs(boxSelect.x1 - boxSelect.x0);
      const h = Math.abs(boxSelect.y1 - boxSelect.y0);
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
      ctx.restore();
    }

    // 9. oscilloscope strip (if graph has a clock)
    let hasClock = false;
    for (const id of Object.keys(graph.nodes)) {
      if (graph.nodes[id].type === 'clock') { hasClock = true; break; }
    }
    if (hasClock && scope) drawScope(ctx, viewport, scope, graph);

    // 10. pass celebration flash
    if (flash && flash.active) {
      // advance flash timer
      if (dt > 0) flash.t += dt;
      if (flash.t >= flash.duration) flash.active = false;
      drawFlash(ctx, viewport, flash);
    }
  }

  const Render = {
    draw,
    pinPosition,
    nodeSize,
    pinsFor,
    nodeContainsWorld,
    pickPin,
    hueForId,
    wirePath,
    pathLength,
    pointAlong,
    resetParticles,
    THEME,
    GRID_PITCH,
  };

  return { Render };
});
