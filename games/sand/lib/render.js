// games/sand/lib/render.js
// Dual-entry: Node CommonJS + window.NDP.Sand.Render.
// Canvas renderer for gate-level circuits (ANSI shapes, orthogonal wires).

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

  const THEME = {
    bg: '#0a0f1a',
    gridDot: '#1a2240',
    gateFill: '#1a2240',
    gateStroke: '#d8e0ff',
    customStroke: '#c8a8ff',
    textFg: '#d8e0ff',
    textDim: '#8a94b8',
    select: '#ffd86b',
    wireHi: '#ffd86b',
    wireLo: '#4a5266',
    on: '#ffd86b',
    off: '#4a5266'
  };

  const GATE_W = 60, GATE_H = 40;
  const CUSTOM_W = 70, CUSTOM_H = 50;
  const PORT_R = 4;

  const PIN_LAYOUT = {
    NOT:    { inputs: ['a'],          outputs: ['y'] },
    AND:    { inputs: ['a','b'],      outputs: ['y'] },
    OR:     { inputs: ['a','b'],      outputs: ['y'] },
    NAND:   { inputs: ['a','b'],      outputs: ['y'] },
    NOR:    { inputs: ['a','b'],      outputs: ['y'] },
    XOR:    { inputs: ['a','b'],      outputs: ['y'] },
    XNOR:   { inputs: ['a','b'],      outputs: ['y'] },
    INPUT:  { inputs: [],             outputs: ['y'] },
    OUTPUT: { inputs: ['a'],          outputs: [] },
    CLOCK:  { inputs: [],             outputs: ['y'] },
    CONST0: { inputs: [],             outputs: ['y'] },
    CONST1: { inputs: [],             outputs: ['y'] },
    DLATCH: { inputs: ['d','en'],     outputs: ['q','qn'] },
    DFF:    { inputs: ['d','clk'],    outputs: ['q','qn'] },
    SRLATCH:{ inputs: ['s','r'],      outputs: ['q','qn'] }
  };

  function pinLayoutFor(node, circuit) {
    const direct = PIN_LAYOUT[node.type];
    if (direct) return direct;
    const gates = (typeof window !== 'undefined' && window.NDP && window.NDP.Sand && window.NDP.Sand.Gates) ? window.NDP.Sand.Gates : null;
    if (gates && gates.primitives && gates.primitives[node.type]) {
      const p = gates.primitives[node.type];
      if (p.inputs && p.outputs) return { inputs: p.inputs.slice(), outputs: p.outputs.slice() };
    }
    if (circuit && circuit.customGatePinLayouts && circuit.customGatePinLayouts[node.type]) {
      return circuit.customGatePinLayouts[node.type];
    }
    return { inputs: ['a','b'], outputs: ['y'] };
  }

  function isCustomType(node) {
    return !PIN_LAYOUT[node.type];
  }

  function gateBounds(node) {
    if (isCustomType(node)) {
      return { x: node.x - CUSTOM_W/2, y: node.y - CUSTOM_H/2, w: CUSTOM_W, h: CUSTOM_H };
    }
    return { x: node.x - GATE_W/2, y: node.y - GATE_H/2, w: GATE_W, h: GATE_H };
  }

  function portPos(node, pin, circuit) {
    const b = gateBounds(node);
    const layout = pinLayoutFor(node, circuit);
    const inIx = layout.inputs.indexOf(pin);
    const outIx = layout.outputs.indexOf(pin);
    if (inIx >= 0) {
      const n = layout.inputs.length;
      const step = b.h / (n + 1);
      return { x: b.x, y: b.y + step * (inIx + 1) };
    }
    if (outIx >= 0) {
      const n = layout.outputs.length;
      const step = b.h / (n + 1);
      return { x: b.x + b.w, y: b.y + step * (outIx + 1) };
    }
    return { x: b.x + b.w, y: node.y };
  }

  // Camera math (inline; mirrors lib/camera.js but uses canvasW/canvasH).
  function w2s(cam, wx, wy, vw, vh) {
    return { x: (wx - cam.x) * cam.zoom + vw/2, y: (wy - cam.y) * cam.zoom + vh/2 };
  }
  function s2w(cam, sx, sy, vw, vh) {
    return { x: (sx - vw/2) / cam.zoom + cam.x, y: (sy - vh/2) / cam.zoom + cam.y };
  }

  function portAt(camera, node, sx, sy, slack, circuit) {
    const sl = typeof slack === 'number' ? slack : 8;
    const vw = camera._vw || 0, vh = camera._vh || 0;
    const layout = pinLayoutFor(node, circuit);
    const pins = layout.inputs.concat(layout.outputs);
    let best = null, bestD = sl;
    for (const p of pins) {
      const wp = portPos(node, p, circuit);
      const sp = w2s(camera, wp.x, wp.y, vw, vh);
      const d = Math.hypot(sp.x - sx, sp.y - sy);
      if (d <= bestD) { bestD = d; best = p; }
    }
    return best;
  }

  function nodeAt(camera, circuit, sx, sy) {
    const vw = camera._vw || 0, vh = camera._vh || 0;
    const wp = s2w(camera, sx, sy, vw, vh);
    for (let i = circuit.nodes.length - 1; i >= 0; i--) {
      const n = circuit.nodes[i];
      const b = gateBounds(n);
      if (wp.x >= b.x && wp.x <= b.x + b.w && wp.y >= b.y && wp.y <= b.y + b.h) return n.id;
    }
    return null;
  }

  // ---- Drawing primitives ----

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x+rr, y);
    ctx.lineTo(x+w-rr, y);
    ctx.quadraticCurveTo(x+w, y, x+w, y+rr);
    ctx.lineTo(x+w, y+h-rr);
    ctx.quadraticCurveTo(x+w, y+h, x+w-rr, y+h);
    ctx.lineTo(x+rr, y+h);
    ctx.quadraticCurveTo(x, y+h, x, y+h-rr);
    ctx.lineTo(x, y+rr);
    ctx.quadraticCurveTo(x, y, x+rr, y);
    ctx.closePath();
  }

  function drawGrid(ctx, cam, vw, vh) {
    ctx.save();
    ctx.fillStyle = THEME.gridDot;
    const pitch = 20;
    const halfW = vw / 2 / cam.zoom;
    const halfH = vh / 2 / cam.zoom;
    const x0 = Math.floor((cam.x - halfW) / pitch) * pitch;
    const x1 = Math.ceil((cam.x + halfW) / pitch) * pitch;
    const y0 = Math.floor((cam.y - halfH) / pitch) * pitch;
    const y1 = Math.ceil((cam.y + halfH) / pitch) * pitch;
    const r = Math.max(0.8, cam.zoom * 0.9);
    for (let wy = y0; wy <= y1; wy += pitch) {
      for (let wx = x0; wx <= x1; wx += pitch) {
        const sp = w2s(cam, wx, wy, vw, vh);
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // ---- ANSI gate shapes. All drawn in world coords; caller sets transform. ----

  function pathAND(ctx, x, y, w, h) {
    // flat-left, domed-right
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w/2, y);
    ctx.arc(x + w/2, y + h/2, h/2, -Math.PI/2, Math.PI/2);
    ctx.lineTo(x, y + h);
    ctx.closePath();
  }

  function pathOR(ctx, x, y, w, h) {
    // curved left, pointed right
    ctx.beginPath();
    ctx.moveTo(x, y);
    // top edge: curves right then out to the point
    ctx.quadraticCurveTo(x + w*0.5, y, x + w, y + h/2);
    ctx.quadraticCurveTo(x + w*0.5, y + h, x, y + h);
    // back curve (concave left)
    ctx.quadraticCurveTo(x + w*0.2, y + h/2, x, y);
    ctx.closePath();
  }

  function drawBubble(ctx, cx, cy, r) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  function drawGateShape(ctx, node, opts) {
    const b = gateBounds(node);
    const custom = isCustomType(node);
    const stroke = custom ? THEME.customStroke : THEME.gateStroke;
    const fill = THEME.gateFill;
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = opts.hover ? '#ffffff' : stroke;
    ctx.fillStyle = fill;

    const t = node.type;
    if (custom) {
      roundRect(ctx, b.x, b.y, b.w, b.h, 6);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = THEME.textFg;
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t, b.x + b.w/2, b.y + b.h/2);
    } else if (t === 'AND' || t === 'NAND') {
      pathAND(ctx, b.x + 4, b.y, b.w - 12, b.h);
      ctx.fill(); ctx.stroke();
      if (t === 'NAND') drawBubble(ctx, b.x + b.w - 3, b.y + b.h/2, 3);
    } else if (t === 'OR' || t === 'NOR') {
      pathOR(ctx, b.x + 4, b.y, b.w - 12, b.h);
      ctx.fill(); ctx.stroke();
      if (t === 'NOR') drawBubble(ctx, b.x + b.w - 3, b.y + b.h/2, 3);
    } else if (t === 'XOR' || t === 'XNOR') {
      // second curve behind
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.quadraticCurveTo(b.x + 8, b.y + b.h/2, b.x, b.y + b.h);
      ctx.stroke();
      pathOR(ctx, b.x + 8, b.y, b.w - 16, b.h);
      ctx.fill(); ctx.stroke();
      if (t === 'XNOR') drawBubble(ctx, b.x + b.w - 3, b.y + b.h/2, 3);
    } else if (t === 'NOT') {
      ctx.beginPath();
      ctx.moveTo(b.x + 4, b.y);
      ctx.lineTo(b.x + b.w - 10, b.y + b.h/2);
      ctx.lineTo(b.x + 4, b.y + b.h);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      drawBubble(ctx, b.x + b.w - 5, b.y + b.h/2, 3);
    } else if (t === 'INPUT' || t === 'OUTPUT') {
      roundRect(ctx, b.x, b.y, b.w, b.h, b.h / 2);
      ctx.fill(); ctx.stroke();
      const live = opts.liveValue;
      const dotColor = live === 1 ? THEME.on : '#3a4258';
      ctx.fillStyle = dotColor;
      ctx.beginPath();
      const dotX = t === 'INPUT' ? b.x + 12 : b.x + b.w - 12;
      ctx.arc(dotX, b.y + b.h/2, 4, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = THEME.textFg;
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = (node.props && node.props.label) ? node.props.label : t;
      ctx.fillText(label, b.x + b.w/2 + (t === 'INPUT' ? 4 : -4), b.y + b.h/2);
    } else if (t === 'CLOCK') {
      roundRect(ctx, b.x + 6, b.y + 4, b.w - 12, b.h - 8, 3);
      ctx.fill(); ctx.stroke();
      // square-wave glyph
      ctx.beginPath();
      const gx = b.x + 14, gy = b.y + b.h/2, gw = b.w - 28, gh = 8;
      ctx.moveTo(gx, gy + gh/2);
      ctx.lineTo(gx, gy - gh/2);
      ctx.lineTo(gx + gw/2, gy - gh/2);
      ctx.lineTo(gx + gw/2, gy + gh/2);
      ctx.lineTo(gx + gw, gy + gh/2);
      ctx.stroke();
    } else if (t === 'CONST0' || t === 'CONST1') {
      ctx.beginPath();
      ctx.arc(b.x + b.w/2, b.y + b.h/2, Math.min(b.w, b.h)/2 - 4, 0, Math.PI*2);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = THEME.textFg;
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t === 'CONST1' ? '1' : '0', b.x + b.w/2, b.y + b.h/2);
    } else if (t === 'DLATCH' || t === 'DFF' || t === 'SRLATCH') {
      roundRect(ctx, b.x, b.y, b.w, b.h, 4);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = THEME.textFg;
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t, b.x + b.w/2, b.y + b.h/2);
    } else {
      // fallback rounded rect
      roundRect(ctx, b.x, b.y, b.w, b.h, 4);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = THEME.textFg;
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t, b.x + b.w/2, b.y + b.h/2);
    }

    if (opts.selected) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = THEME.select;
      roundRect(ctx, b.x - 3, b.y - 3, b.w + 6, b.h + 6, 5);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawPorts(ctx, node, opts, circuit) {
    const layout = pinLayoutFor(node, circuit);
    ctx.save();
    const all = layout.inputs.concat(layout.outputs);
    for (const p of all) {
      const pp = portPos(node, p, circuit);
      const isHover = opts.hoverPin === p;
      ctx.fillStyle = isHover ? '#ffffff' : THEME.textDim;
      ctx.strokeStyle = THEME.gateStroke;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(pp.x, pp.y, PORT_R / (opts.zoom || 1), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  // Live value lookup from compiled graph.
  function liveValue(graph, nodeId, pin) {
    if (!graph || !graph.nodes) return null;
    const n = (typeof graph.nodes.get === 'function') ? graph.nodes.get(nodeId) : graph.nodes[nodeId];
    if (!n) return null;
    if (n.out && pin in n.out) return n.out[pin];
    if (n.state && pin in n.state) return n.state[pin];
    return null;
  }

  function drawWire(ctx, fp, tp, signal) {
    // 2-segment orthogonal: H, V, H using midX
    const midX = (fp.x + tp.x) / 2;
    ctx.save();
    if (signal === 1) {
      ctx.strokeStyle = THEME.wireHi;
      ctx.lineWidth = 2;
      ctx.shadowColor = THEME.wireHi;
      ctx.shadowBlur = 6;
    } else {
      ctx.strokeStyle = THEME.wireLo;
      ctx.lineWidth = 1.5;
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(fp.x, fp.y);
    ctx.lineTo(midX, fp.y);
    ctx.lineTo(midX, tp.y);
    ctx.lineTo(tp.x, tp.y);
    ctx.stroke();
    ctx.restore();
  }

  // ---- Main draw ----

  function draw(ctx, state) {
    const { circuit, graph, camera, canvasW, canvasH, hover, selection, dragGhost, dragWire } = state;
    const vw = canvasW, vh = canvasH;
    camera._vw = vw; camera._vh = vh;

    // background
    ctx.save();
    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, vw, vh);
    ctx.restore();

    drawGrid(ctx, camera, vw, vh);

    // Apply camera transform so all world-space drawing is straight math.
    ctx.save();
    ctx.translate(vw/2, vh/2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    // wires (under nodes)
    if (circuit && circuit.wires) {
      for (const w of circuit.wires) {
        const fn = circuit.nodes.find(n => n.id === w.from.node);
        const tn = circuit.nodes.find(n => n.id === w.to.node);
        if (!fn || !tn) continue;
        const fp = portPos(fn, w.from.pin, circuit);
        const tp = portPos(tn, w.to.pin, circuit);
        const sig = liveValue(graph, w.from.node, w.from.pin);
        drawWire(ctx, fp, tp, sig);
      }
    }

    // nodes
    if (circuit && circuit.nodes) {
      for (const node of circuit.nodes) {
        const selected = selection && (selection.has ? selection.has(node.id) : selection[node.id]);
        const hov = hover && hover.nodeId === node.id;
        const live = liveValue(graph, node.id, 'y') || liveValue(graph, node.id, 'a');
        drawGateShape(ctx, node, {
          selected: !!selected,
          hover: !!hov,
          liveValue: live
        });
        drawPorts(ctx, node, {
          hoverPin: (hover && hover.kind === 'port' && hover.nodeId === node.id) ? hover.pin : null,
          zoom: camera.zoom
        }, circuit);
      }
    }

    // drag wire (rubber band) — dragWire.x/y are in world coords
    if (dragWire) {
      const fn = circuit.nodes.find(n => n.id === dragWire.fromNode);
      if (fn) {
        const fp = portPos(fn, dragWire.fromPin, circuit);
        ctx.save();
        ctx.strokeStyle = THEME.wireHi;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(fp.x, fp.y);
        ctx.lineTo(dragWire.x, dragWire.y);
        ctx.stroke();
        ctx.restore();
      }
    }

    // drag ghost
    if (dragGhost) {
      const ghostNode = { id: '__ghost', type: dragGhost.type, x: dragGhost.x, y: dragGhost.y, props: {} };
      ctx.save();
      ctx.globalAlpha = 0.6;
      drawGateShape(ctx, ghostNode, { selected: false, hover: false, liveValue: null });
      drawPorts(ctx, ghostNode, { hoverPin: null, zoom: camera.zoom }, circuit);
      ctx.restore();
    }

    ctx.restore();
  }

  const Render = {
    draw,
    gateBounds,
    portPos,
    portAt,
    nodeAt,
    pinLayoutFor,
    THEME
  };

  return { Render };
});
