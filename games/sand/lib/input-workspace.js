// games/sand/lib/input-workspace.js
// Dual-entry module: Node CommonJS + window.NDP.Sand.InputWorkspace.
// Canvas input controller for the sand v2 workspace.

(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = mod;
    module.exports.InputWorkspace = mod.InputWorkspace;
  }
  if (typeof window !== 'undefined') {
    window.NDP = window.NDP || {};
    window.NDP.Sand = window.NDP.Sand || {};
    window.NDP.Sand.InputWorkspace = mod.InputWorkspace;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const GRID = 20;
  const PORT_SLACK = 10;
  const DRAG_THRESHOLD = 3;

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

  function layoutFor(node, circuit) {
    if (PIN_LAYOUT[node.type]) return PIN_LAYOUT[node.type];
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

  function defaultProps(type) {
    if (type === 'INPUT') return { label: 'A', value: 0 };
    if (type === 'OUTPUT') return { label: 'Y' };
    return {};
  }

  function snap(v) { return Math.round(v / GRID) * GRID; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function canvasLocal(canvas, clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    const sx = canvas.width / r.width;
    const sy = canvas.height / r.height;
    return {
      x: (clientX - r.left) * sx,
      y: (clientY - r.top) * sy,
      inside: clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom
    };
  }

  function viewport(canvas) { return { w: canvas.width, h: canvas.height }; }

  function screenToWorld(camera, sx, sy, vp) {
    return {
      x: (sx - vp.w / 2) / camera.zoom + camera.x,
      y: (sy - vp.h / 2) / camera.zoom + camera.y
    };
  }

  function findNode(circuit, id) {
    for (const n of circuit.nodes) if (n.id === id) return n;
    return null;
  }

  function create(opts) {
    const canvas = opts.canvas;
    const getState = opts.getState;
    const onChange = opts.onChange || (() => {});
    const onPanZoom = opts.onPanZoom || (() => {});
    const onSelect = opts.onSelect || (() => {});
    const onDragGhost = opts.onDragGhost || (() => {});
    const onDragWire = opts.onDragWire || (() => {});
    const onInputToggle = opts.onInputToggle || (() => {});

    // Interaction state
    let selection = new Set();
    let mode = 'idle'; // 'idle' | 'palette' | 'wire' | 'move' | 'pan' | 'press'
    let palette = null; // { type, sx, sy }
    let wire = null;    // { fromNode, fromPin }
    let move = null;    // { ids:[], lastSx, lastSy, moved }
    let pan = null;     // { lastSx, lastSy }
    let press = null;   // { nodeId, sx, sy, moved, additive }
    let activePointerId = null;

    function emitSelect() { onSelect(new Set(selection)); }

    function getCircuit() { return getState().circuit; }
    function getCamera() { return getState().camera; }
    function getMode() { return getState().mode; }

    function tagCameraViewport(camera) {
      // Render's portAt / nodeAt use camera._vw / _vh. Keep them fresh.
      camera._vw = canvas.width;
      camera._vh = canvas.height;
    }

    function hitPort(circuit, camera, sx, sy) {
      tagCameraViewport(camera);
      for (let i = circuit.nodes.length - 1; i >= 0; i--) {
        const n = circuit.nodes[i];
        const Render = (typeof window !== 'undefined' && window.NDP && window.NDP.Sand && window.NDP.Sand.Render) || null;
        let pin = null;
        if (Render && Render.portAt) {
          pin = Render.portAt(camera, n, sx, sy, PORT_SLACK, circuit);
        }
        if (pin) {
          const lay = layoutFor(n, circuit);
          const dir = lay.inputs.indexOf(pin) >= 0 ? 'in'
                    : lay.outputs.indexOf(pin) >= 0 ? 'out' : null;
          if (dir) return { node: n.id, pin, dir };
        }
      }
      return null;
    }

    function hitNode(circuit, camera, sx, sy) {
      tagCameraViewport(camera);
      const Render = (typeof window !== 'undefined' && window.NDP && window.NDP.Sand && window.NDP.Sand.Render) || null;
      if (Render && Render.nodeAt) return Render.nodeAt(camera, circuit, sx, sy);
      return null;
    }

    // ---- Palette drag (initiated externally) ----
    function startPaletteDrag(type, sx, sy) {
      palette = { type, sx, sy };
      mode = 'palette';
      const camera = getCamera();
      const local = relFromClient(sx, sy);
      const wp = screenToWorld(camera, local.x, local.y, viewport(canvas));
      onDragGhost({ type, x: wp.x, y: wp.y });
    }

    function relFromClient(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      const sx = canvas.width / r.width;
      const sy = canvas.height / r.height;
      return {
        x: (clientX - r.left) * sx,
        y: (clientY - r.top) * sy,
        inside: clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom
      };
    }

    // ---- Pointer handlers ----

    function onPointerDown(e) {
      const circuit = getCircuit();
      const camera = getCamera();
      const loc = canvasLocal(canvas, e.clientX, e.clientY);
      canvas.focus && canvas.focus();

      // Pan via middle or right mouse
      if (e.button === 1 || e.button === 2) {
        mode = 'pan';
        pan = { lastSx: loc.x, lastSy: loc.y };
        activePointerId = e.pointerId;
        try { canvas.setPointerCapture(e.pointerId); } catch {}
        e.preventDefault();
        return;
      }
      if (e.button !== 0) return;

      activePointerId = e.pointerId;
      try { canvas.setPointerCapture(e.pointerId); } catch {}

      // Port hit?
      const portHit = hitPort(circuit, camera, loc.x, loc.y);
      if (portHit && portHit.dir === 'out') {
        mode = 'wire';
        wire = { fromNode: portHit.node, fromPin: portHit.pin };
        const wp = screenToWorld(camera, loc.x, loc.y, viewport(canvas));
        onDragWire({ fromNode: wire.fromNode, fromPin: wire.fromPin, x: wp.x, y: wp.y });
        return;
      }

      // Node hit?
      const nodeId = hitNode(circuit, camera, loc.x, loc.y);
      if (nodeId) {
        const additive = !!e.shiftKey;
        press = { nodeId, sx: loc.x, sy: loc.y, moved: false, additive };
        // Select immediately so subsequent drag moves the right set.
        if (additive) {
          if (selection.has(nodeId)) { /* keep */ }
          else { selection.add(nodeId); emitSelect(); }
        } else {
          if (!selection.has(nodeId)) {
            selection = new Set([nodeId]);
            emitSelect();
          }
        }
        mode = 'press';
        return;
      }

      // Empty: clear selection
      if (selection.size > 0) { selection = new Set(); emitSelect(); }
      mode = 'idle';
    }

    function onPointerMove(e) {
      const circuit = getCircuit();
      const camera = getCamera();
      const loc = canvasLocal(canvas, e.clientX, e.clientY);
      const vp = viewport(canvas);

      if (mode === 'palette' && palette) {
        const wp = screenToWorld(camera, loc.x, loc.y, vp);
        onDragGhost({ type: palette.type, x: wp.x, y: wp.y });
        return;
      }

      if (mode === 'pan' && pan) {
        const dxs = loc.x - pan.lastSx;
        const dys = loc.y - pan.lastSy;
        camera.x -= dxs / camera.zoom;
        camera.y -= dys / camera.zoom;
        pan.lastSx = loc.x; pan.lastSy = loc.y;
        onPanZoom(camera);
        return;
      }

      if (mode === 'wire' && wire) {
        const wp = screenToWorld(camera, loc.x, loc.y, vp);
        onDragWire({ fromNode: wire.fromNode, fromPin: wire.fromPin, x: wp.x, y: wp.y });
        return;
      }

      if (mode === 'press' && press) {
        const dx = loc.x - press.sx;
        const dy = loc.y - press.sy;
        if (Math.hypot(dx, dy) > DRAG_THRESHOLD) {
          // Begin move
          mode = 'move';
          const ids = selection.size > 0 ? Array.from(selection) : [press.nodeId];
          move = { ids, lastSx: press.sx, lastSy: press.sy, moved: false };
          press.moved = true;
        } else {
          return;
        }
      }

      if (mode === 'move' && move) {
        const dxs = loc.x - move.lastSx;
        const dys = loc.y - move.lastSy;
        const dwx = dxs / camera.zoom;
        const dwy = dys / camera.zoom;
        for (const id of move.ids) {
          const n = findNode(circuit, id);
          if (n) { n.x += dwx; n.y += dwy; }
        }
        move.lastSx = loc.x; move.lastSy = loc.y;
        move.moved = true;
        onChange(circuit);
        return;
      }
    }

    function onPointerUp(e) {
      const circuit = getCircuit();
      const camera = getCamera();
      const loc = canvasLocal(canvas, e.clientX, e.clientY);
      const stateMode = getMode();

      try { canvas.releasePointerCapture(e.pointerId); } catch {}

      if (mode === 'palette' && palette) {
        const inside = loc.inside;
        if (inside && stateMode === 'build') {
          const wp = screenToWorld(camera, loc.x, loc.y, viewport(canvas));
          const x = snap(wp.x), y = snap(wp.y);
          const Model = window.NDP.Sand.Model;
          Model.addNode(circuit, palette.type, x, y, defaultProps(palette.type));
          onChange(circuit);
        }
        palette = null;
        onDragGhost(null);
        mode = 'idle';
        activePointerId = null;
        return;
      }

      if (mode === 'wire' && wire) {
        const portHit = hitPort(circuit, camera, loc.x, loc.y);
        if (portHit && portHit.dir === 'in' && portHit.node !== wire.fromNode) {
          const Model = window.NDP.Sand.Model;
          // Remove any existing wire into this input
          const dead = circuit.wires.filter(w => w.to.node === portHit.node && w.to.pin === portHit.pin).map(w => w.id);
          for (const id of dead) Model.removeWire(circuit, id);
          Model.addWire(circuit,
            { node: wire.fromNode, pin: wire.fromPin },
            { node: portHit.node, pin: portHit.pin });
          onChange(circuit);
        }
        wire = null;
        onDragWire(null);
        mode = 'idle';
        activePointerId = null;
        return;
      }

      if (mode === 'pan') {
        pan = null;
        mode = 'idle';
        onPanZoom(camera);
        activePointerId = null;
        return;
      }

      if (mode === 'move' && move) {
        for (const id of move.ids) {
          const n = findNode(circuit, id);
          if (n) { n.x = snap(n.x); n.y = snap(n.y); }
        }
        move = null;
        mode = 'idle';
        onChange(circuit);
        activePointerId = null;
        return;
      }

      if (mode === 'press' && press) {
        // No drag happened. Input toggle?
        const n = findNode(circuit, press.nodeId);
        if (n && n.type === 'INPUT' && stateMode === 'build' && !press.moved) {
          n.props = n.props || {};
          n.props.value = n.props.value ? 0 : 1;
          onInputToggle(n.id);
          onChange(circuit);
        }
        press = null;
        mode = 'idle';
        activePointerId = null;
        return;
      }

      mode = 'idle';
      activePointerId = null;
    }

    function onPointerCancel(e) {
      try { canvas.releasePointerCapture(e.pointerId); } catch {}
      if (mode === 'palette') { palette = null; onDragGhost(null); }
      if (mode === 'wire') { wire = null; onDragWire(null); }
      pan = null; move = null; press = null;
      mode = 'idle';
      activePointerId = null;
    }

    function onWheel(e) {
      const camera = getCamera();
      const loc = canvasLocal(canvas, e.clientX, e.clientY);
      const vp = viewport(canvas);
      // Keep world point under cursor stable.
      const wBefore = screenToWorld(camera, loc.x, loc.y, vp);
      const factor = Math.exp(-e.deltaY * 0.001);
      camera.zoom = clamp(camera.zoom * factor, 0.25, 2.5);
      const wAfter = screenToWorld(camera, loc.x, loc.y, vp);
      camera.x += wBefore.x - wAfter.x;
      camera.y += wBefore.y - wAfter.y;
      onPanZoom(camera);
      e.preventDefault();
    }

    function onKeyDown(e) {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selection.size === 0) return;
        const circuit = getCircuit();
        const Model = window.NDP.Sand.Model;
        for (const id of Array.from(selection)) Model.removeNode(circuit, id);
        selection = new Set();
        emitSelect();
        onChange(circuit);
        e.preventDefault();
      } else if (e.key === 'Escape') {
        if (mode === 'wire') { wire = null; onDragWire(null); mode = 'idle'; }
        if (mode === 'palette') { palette = null; onDragGhost(null); mode = 'idle'; }
      }
    }

    function onContextMenu(e) { e.preventDefault(); }

    // For palette drag initiated outside canvas, we listen on window so we can
    // track the pointer even while it's over palette DOM, and release onto canvas.
    function onWindowPointerMove(e) {
      if (mode === 'palette') onPointerMove(e);
    }
    function onWindowPointerUp(e) {
      if (mode === 'palette') onPointerUp(e);
    }

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerCancel);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('pointermove', onWindowPointerMove);
    window.addEventListener('pointerup', onWindowPointerUp);
    window.addEventListener('keydown', onKeyDown);

    function destroy() {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('pointermove', onWindowPointerMove);
      window.removeEventListener('pointerup', onWindowPointerUp);
      window.removeEventListener('keydown', onKeyDown);
    }

    return { destroy, startPaletteDrag };
  }

  const InputWorkspace = { create };
  return { InputWorkspace };
});
