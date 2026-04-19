// games/sand/lib/input-workspace.js
// Dual-entry module: works in Node (CommonJS) and in the browser (window.NDP.Sand.Workspace).
// Workspace input controller: pan / zoom / move / wire / delete / undo / box-select.
//
// The controller attaches raw DOM listeners to a canvas and mutates shared
// workspace state (camera, graph, selection, pending wire, history).

(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = mod.Workspace;
    module.exports.Workspace = mod.Workspace;
  }
  if (typeof window !== 'undefined') {
    window.NDP = window.NDP || {};
    window.NDP.Sand = window.NDP.Sand || {};
    window.NDP.Sand.Workspace = mod.Workspace;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const PIN_HIT_WORLD = 10; // world-space pick radius for pins

  function canvasPoint(canvas, e) {
    const r = canvas.getBoundingClientRect();
    const sx = canvas.width / r.width;
    const sy = canvas.height / r.height;
    return {
      x: (e.clientX - r.left) * sx,
      y: (e.clientY - r.top) * sy,
    };
  }

  function create(opts) {
    const { canvas, getState, setGraph, deps } = opts;
    // deps: { Camera, Model, History, Render }
    const state = {
      // active interaction mode: 'idle' | 'pan' | 'move' | 'box' | 'wire'
      mode: 'idle',
      dragLast: null,      // last screen pt during pan/move
      dragNodeId: null,    // node being dragged
      boxStart: null,      // screen pt when box-select began
      boxCur: null,
      spaceHeld: false,
    };

    function getWorkspace() { return getState(); }
    function viewport() { return { w: canvas.width, h: canvas.height }; }

    function onMouseDown(e) {
      const ws = getWorkspace();
      const sp = canvasPoint(canvas, e);
      const wp = deps.Camera.screenToWorld(ws.camera, sp, viewport());
      canvas.focus && canvas.focus();

      // Middle mouse = pan
      if (e.button === 1 || (e.button === 0 && state.spaceHeld)) {
        state.mode = 'pan';
        state.dragLast = sp;
        e.preventDefault();
        return;
      }

      if (e.button !== 0) return;

      // Pin hit? Start / complete a wire.
      const pinHit = deps.Render.pickPin(ws.graph, wp, PIN_HIT_WORLD / ws.camera.zoom);
      if (pinHit) {
        if (!ws.pendingWire) {
          // begin only from output pin
          if (pinHit.dir === 'out') {
            ws.pendingWire = { from: { node: pinHit.node, pin: pinHit.pin }, cursor: wp };
            state.mode = 'wire';
          } else {
            // starting from input pin: we'll treat source as this input? skip.
          }
        } else {
          // complete: must be input pin of a different node
          if (pinHit.dir === 'in' && pinHit.node !== ws.pendingWire.from.node) {
            deps.Model.addWire(ws.graph, {
              from: ws.pendingWire.from,
              to: { node: pinHit.node, pin: pinHit.pin },
            });
            if (ws.history) deps.History.commit(ws.history, ws.graph);
          }
          ws.pendingWire = null;
          state.mode = 'idle';
        }
        return;
      }

      // Node hit?
      let hitNode = null;
      // iterate in reverse add order (last wins for topmost)
      const ids = Object.keys(ws.graph.nodes);
      for (let i = ids.length - 1; i >= 0; i--) {
        const n = ws.graph.nodes[ids[i]];
        if (deps.Render.nodeContainsWorld(n, wp)) { hitNode = n; break; }
      }

      if (hitNode) {
        // select + begin move
        ws.selection = { nodes: { [hitNode.id]: true }, wires: {} };
        state.mode = 'move';
        state.dragNodeId = hitNode.id;
        state.dragLast = sp;
        return;
      }

      // empty click: clear selection + cancel pending wire + begin box-select
      ws.selection = { nodes: {}, wires: {} };
      ws.pendingWire = null;
      state.mode = 'box';
      state.boxStart = sp;
      state.boxCur = sp;
      ws.boxSelect = { x0: sp.x, y0: sp.y, x1: sp.x, y1: sp.y };
    }

    function onMouseMove(e) {
      const ws = getWorkspace();
      const sp = canvasPoint(canvas, e);
      const wp = deps.Camera.screenToWorld(ws.camera, sp, viewport());

      if (ws.pendingWire) {
        ws.pendingWire.cursor = wp;
      }

      if (state.mode === 'pan' && state.dragLast) {
        const dxs = sp.x - state.dragLast.x;
        const dys = sp.y - state.dragLast.y;
        ws.camera.x -= dxs / ws.camera.zoom;
        ws.camera.y -= dys / ws.camera.zoom;
        state.dragLast = sp;
        return;
      }
      if (state.mode === 'move' && state.dragLast && state.dragNodeId) {
        const dxs = sp.x - state.dragLast.x;
        const dys = sp.y - state.dragLast.y;
        const node = ws.graph.nodes[state.dragNodeId];
        if (node) {
          node.x += dxs / ws.camera.zoom;
          node.y += dys / ws.camera.zoom;
        }
        state.dragLast = sp;
        return;
      }
      if (state.mode === 'box' && state.boxStart) {
        state.boxCur = sp;
        ws.boxSelect = { x0: state.boxStart.x, y0: state.boxStart.y, x1: sp.x, y1: sp.y };
        return;
      }
    }

    function onMouseUp(e) {
      const ws = getWorkspace();
      if (state.mode === 'move') {
        if (ws.history) deps.History.commit(ws.history, ws.graph);
      }
      if (state.mode === 'box' && ws.boxSelect) {
        // finalize box select — convert screen rect to world and pick nodes
        const x0 = Math.min(ws.boxSelect.x0, ws.boxSelect.x1);
        const y0 = Math.min(ws.boxSelect.y0, ws.boxSelect.y1);
        const x1 = Math.max(ws.boxSelect.x0, ws.boxSelect.x1);
        const y1 = Math.max(ws.boxSelect.y0, ws.boxSelect.y1);
        const w0 = deps.Camera.screenToWorld(ws.camera, { x: x0, y: y0 }, viewport());
        const w1 = deps.Camera.screenToWorld(ws.camera, { x: x1, y: y1 }, viewport());
        const sel = { nodes: {}, wires: {} };
        for (const id of Object.keys(ws.graph.nodes)) {
          const n = ws.graph.nodes[id];
          if (n.x >= w0.x && n.x <= w1.x && n.y >= w0.y && n.y <= w1.y) {
            sel.nodes[id] = true;
          }
        }
        ws.selection = sel;
        ws.boxSelect = null;
      }
      state.mode = 'idle';
      state.dragLast = null;
      state.dragNodeId = null;
      state.boxStart = null;
      state.boxCur = null;
    }

    function onWheel(e) {
      const ws = getWorkspace();
      const sp = canvasPoint(canvas, e);
      const factor = e.deltaY < 0 ? 1.1 : (1 / 1.1);
      deps.Camera.zoomBy(ws.camera, factor, sp, viewport());
      e.preventDefault();
    }

    function onKeyDown(e) {
      const ws = getWorkspace();
      if (e.key === ' ') { state.spaceHeld = true; }
      if (e.key === 'Escape') { ws.pendingWire = null; state.mode = 'idle'; }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        let changed = false;
        for (const id of Object.keys(ws.selection.nodes || {})) {
          if (deps.Model.removeNode(ws.graph, id)) changed = true;
        }
        for (const id of Object.keys(ws.selection.wires || {})) {
          if (deps.Model.removeWire(ws.graph, id)) changed = true;
        }
        ws.selection = { nodes: {}, wires: {} };
        if (changed && ws.history) deps.History.commit(ws.history, ws.graph);
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        if (e.shiftKey) {
          const g = deps.History.redo(ws.history);
          if (g && setGraph) setGraph(g);
        } else {
          const g = deps.History.undo(ws.history);
          if (g && setGraph) setGraph(g);
        }
        e.preventDefault();
      }
    }

    function onKeyUp(e) {
      if (e.key === ' ') { state.spaceHeld = false; }
    }

    function onContextMenu(e) { e.preventDefault(); }

    // Attach
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('contextmenu', onContextMenu);

    function destroy() {
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('contextmenu', onContextMenu);
    }

    return { destroy, _state: state };
  }

  const Workspace = { create };
  return { Workspace };
});
